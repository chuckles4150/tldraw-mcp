"use client";

import type { Editor } from "tldraw";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const TldrawEditor = dynamic(() => import("./components/TldrawEditor"), {
  ssr: false,
});

const DIRECTORY_STORE_DB = "localdraft-handles";
const DIRECTORY_STORE_NAME = "handles";
const DIRECTORY_HANDLE_KEY = "workspace-directory";
const SUPPORTED_EXTENSIONS = new Set([".tldr", ".json"]);

type FileTreeFile = {
  kind: "file";
  name: string;
  path: string;
  handle: FileSystemFileHandle;
};

type FileTreeDirectory = {
  kind: "directory";
  name: string;
  path: string;
  handle: FileSystemDirectoryHandle;
  children: FileTreeNode[];
  loaded: boolean;
};

type FileTreeNode = FileTreeFile | FileTreeDirectory;

type ActiveFile = {
  name: string;
  path: string;
  handle: FileSystemFileHandle;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

type LocalDraftFile = {
  localDraftVersion: 1;
  type: "localdraft-tldraw-snapshot";
  savedAt: string;
  snapshot: unknown;
};

type TldrawExportFile = {
  tldrawFileFormatVersion: number;
  schema: SerializedTldrawSchema;
  records: TldrawRecord[];
};

type TldrawRecord = {
  id: string;
  typeName?: string;
  type?: string;
  props?: Record<string, unknown>;
};

type SerializedTldrawSchema =
  | {
      schemaVersion: 1;
      storeVersion: number;
      recordVersions: Record<
        string,
        { version: number; subTypeVersions?: Record<string, number> }
      >;
    }
  | {
      schemaVersion: 2;
      sequences: Record<string, number>;
    };

function sendCanvasCommand(type: string, payload: Record<string, unknown> = {}) {
  window.dispatchEvent(
    new CustomEvent("localdraft-canvas-command", {
      detail: { type, ...payload },
    })
  );
}

function isFileSystemAccessSupported() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

function getFileExtension(name: string) {
  const dotIndex = name.lastIndexOf(".");
  return dotIndex >= 0 ? name.slice(dotIndex).toLowerCase() : "";
}

function isSupportedFile(name: string) {
  return SUPPORTED_EXTENSIONS.has(getFileExtension(name));
}

function sortTreeNodes(nodes: FileTreeNode[]) {
  return nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

async function readDirectoryChildren(
  directory: FileSystemDirectoryHandle,
  basePath = ""
): Promise<FileTreeNode[]> {
  const nodes: FileTreeNode[] = [];

  for await (const handle of directory.values()) {
    const path = basePath ? `${basePath}/${handle.name}` : handle.name;

    if (handle.kind === "directory") {
      nodes.push({
        kind: "directory",
        name: handle.name,
        path,
        handle,
        children: [],
        loaded: false,
      });
    } else if (isSupportedFile(handle.name)) {
      nodes.push({
        kind: "file",
        name: handle.name,
        path,
        handle,
      });
    }
  }

  return sortTreeNodes(nodes);
}

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DIRECTORY_STORE_DB, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(DIRECTORY_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getStoredDirectoryHandle() {
  const db = await openHandleDb();

  return new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
    const transaction = db.transaction(DIRECTORY_STORE_NAME, "readonly");
    const store = transaction.objectStore(DIRECTORY_STORE_NAME);
    const request = store.get(DIRECTORY_HANDLE_KEY);

    request.onsuccess = () =>
      resolve((request.result as FileSystemDirectoryHandle | undefined) ?? null);
    request.onerror = () => reject(request.error);
  }).finally(() => db.close());
}

async function storeDirectoryHandle(handle: FileSystemDirectoryHandle) {
  const db = await openHandleDb();

  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(DIRECTORY_STORE_NAME, "readwrite");
    const store = transaction.objectStore(DIRECTORY_STORE_NAME);
    const request = store.put(handle, DIRECTORY_HANDLE_KEY);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  }).finally(() => db.close());
}

async function requestReadWritePermission(handle: FileSystemDirectoryHandle) {
  const options: FileSystemHandlePermissionDescriptor = { mode: "readwrite" };
  const current = await handle.queryPermission(options);
  if (current === "granted") return true;

  const next = await handle.requestPermission(options);
  return next === "granted";
}

function wrapSnapshot(snapshot: unknown): LocalDraftFile {
  return {
    localDraftVersion: 1,
    type: "localdraft-tldraw-snapshot",
    savedAt: new Date().toISOString(),
    snapshot,
  };
}

function hasFutureSchemaVersion(
  fileSchema: SerializedTldrawSchema,
  currentSchema: SerializedTldrawSchema
) {
  if (fileSchema.schemaVersion !== 2 || currentSchema.schemaVersion !== 2) {
    return false;
  }

  return Object.entries(fileSchema.sequences).some(([sequenceId, version]) => {
    const currentVersion = currentSchema.sequences[sequenceId];
    return typeof currentVersion === "number" && version > currentVersion;
  });
}

const RECORD_TYPES_WITH_PROPS = new Set(["shape", "binding", "asset"]);

function normalizeImportedRecord(record: TldrawRecord): TldrawRecord {
  const next: TldrawRecord = {
    ...record,
    props: record.props ? { ...record.props } : record.props,
  };

  // Only shape/binding/asset records carry a `props` field in the current
  // tldraw schema. Strip stray `props` from other record types (e.g. page,
  // instance, document) so schema validation does not reject the snapshot.
  if (next.typeName && !RECORD_TYPES_WITH_PROPS.has(next.typeName)) {
    delete next.props;
  }

  // Arrow shapes use `richText` only (tldraw v3+ removed the legacy `text` prop).
  // If an export contains both, drop `text` so schema validation passes.
  // Files with only legacy `text` are handled by the AddRichText schema migration.
  if (
    next.typeName === "shape" &&
    next.type === "arrow" &&
    next.props &&
    "text" in next.props &&
    next.props.richText
  ) {
    delete next.props.text;
  }

  return next;
}

function normalizeSnapshot(
  value: unknown,
  currentSchema?: SerializedTldrawSchema
) {
  if (
    value &&
    typeof value === "object" &&
    "snapshot" in value &&
    (value as { snapshot?: unknown }).snapshot
  ) {
    return (value as { snapshot: unknown }).snapshot;
  }

  if (
    value &&
    typeof value === "object" &&
    "tldrawFileFormatVersion" in value &&
    "schema" in value &&
    "records" in value &&
    Array.isArray((value as { records?: unknown }).records)
  ) {
    const exportFile = value as TldrawExportFile;
    const schema =
      currentSchema && hasFutureSchemaVersion(exportFile.schema, currentSchema)
        ? currentSchema
        : exportFile.schema;
    const records = exportFile.records.map((record) =>
      normalizeImportedRecord(record)
    );

    return {
      schema,
      store: Object.fromEntries(records.map((record) => [record.id, record])),
    };
  }

  return value;
}

function isLikelySnapshot(value: unknown) {
  if (!value || typeof value !== "object") return false;

  const snapshot = value as Record<string, unknown>;
  return (
    "document" in snapshot ||
    "store" in snapshot ||
    ("schema" in snapshot && "store" in snapshot)
  );
}

function replaceDirectoryNode(
  nodes: FileTreeNode[],
  path: string,
  children: FileTreeNode[]
): FileTreeNode[] {
  return nodes.map((node) => {
    if (node.kind !== "directory") return node;

    if (node.path === path) {
      return {
        ...node,
        children,
        loaded: true,
      };
    }

    return {
      ...node,
      children: replaceDirectoryNode(node.children, path, children),
    };
  });
}

function TreeNode({
  node,
  activePath,
  depth,
  onOpenFile,
  onLoadDirectory,
}: {
  node: FileTreeNode;
  activePath?: string;
  depth: number;
  onOpenFile: (file: FileTreeFile) => void;
  onLoadDirectory: (directory: FileTreeDirectory) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const paddingLeft = 12 + depth * 14;

  if (node.kind === "directory") {
    const toggleDirectory = async () => {
      const nextExpanded = !expanded;
      setExpanded(nextExpanded);

      if (!nextExpanded || node.loaded) return;

      setLoading(true);
      try {
        await onLoadDirectory(node);
      } finally {
        setLoading(false);
      }
    };

    return (
      <div>
        <button
          className="flex h-8 w-full items-center gap-2 truncate text-left text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950"
          style={{ paddingLeft }}
          onClick={toggleDirectory}
          title={node.path}
        >
          <span className="material-symbols-outlined text-[16px]">
            {expanded ? "expand_more" : "chevron_right"}
          </span>
          <span className="material-symbols-outlined text-[16px]">
            {expanded ? "folder_open" : "folder"}
          </span>
          <span className="truncate normal-case">{node.name}</span>
          {loading && (
            <span className="ml-auto pr-2 text-[10px] uppercase tracking-wide text-slate-400">
              Reading
            </span>
          )}
        </button>
        {expanded &&
          node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              activePath={activePath}
              depth={depth + 1}
              onOpenFile={onOpenFile}
              onLoadDirectory={onLoadDirectory}
            />
          ))}
      </div>
    );
  }

  const isActive = node.path === activePath;

  return (
    <button
      className={`flex h-8 w-full items-center gap-2 truncate text-left text-xs transition-colors ${
        isActive
          ? "bg-emerald-50 text-emerald-800"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
      }`}
      style={{ paddingLeft }}
      onClick={() => onOpenFile(node)}
      title={node.path}
    >
      <span className="material-symbols-outlined text-[16px]">
        insert_drive_file
      </span>
      <span className="truncate normal-case">{node.name}</span>
    </button>
  );
}

export default function Home() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const suppressDirtyRef = useRef(false);
  const dirtyRevisionRef = useRef(0);
  const activeFileRef = useRef<ActiveFile | null>(null);

  const [directoryHandle, setDirectoryHandle] =
    useState<FileSystemDirectoryHandle | null>(null);
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [activeFile, setActiveFile] = useState<ActiveFile | null>(null);
  const [dirty, setDirty] = useState(false);
  const [autosave, setAutosave] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [message, setMessage] = useState("");
  const [loadingTree, setLoadingTree] = useState(false);

  const currentFileLabel = activeFile?.name ?? "Untitled";
  const isSupported = useMemo(isFileSystemAccessSupported, []);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);

  const refreshTree = useCallback(async (handle: FileSystemDirectoryHandle) => {
    if (!handle) return;

    setLoadingTree(true);
    setMessage("");

    try {
      const nodes = await readDirectoryChildren(handle);
      setTree(nodes);
    } catch (error) {
      console.error(error);
      setMessage("Could not read the selected folder.");
    } finally {
      setLoadingTree(false);
    }
  }, []);

  const loadDirectory = useCallback(async (directory: FileTreeDirectory) => {
    try {
      const children = await readDirectoryChildren(
        directory.handle,
        directory.path
      );
      setTree((currentTree) =>
        replaceDirectoryNode(currentTree, directory.path, children)
      );
    } catch (error) {
      console.error(error);
      setMessage(`Could not read ${directory.name}.`);
    }
  }, []);

  useEffect(() => {
    if (!isSupported) {
      setMessage("Local folder access requires Chrome or Edge on localhost.");
      return;
    }

    let cancelled = false;

    getStoredDirectoryHandle()
      .then(async (handle) => {
        if (!handle || cancelled) return;

        const permitted = await requestReadWritePermission(handle);
        if (!permitted || cancelled) return;

        setDirectoryHandle(handle);
        await refreshTree(handle);
      })
      .catch((error) => {
        console.warn("Could not restore folder handle", error);
      });

    return () => {
      cancelled = true;
    };
  }, [isSupported, refreshTree]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  const markDirty = useCallback(() => {
    if (suppressDirtyRef.current) return;

    dirtyRevisionRef.current += 1;
    setDirty(true);
    setSaveStatus("idle");
  }, []);

  const chooseFolder = useCallback(async () => {
    if (!isSupported) {
      setMessage("Local folder access requires Chrome or Edge on localhost.");
      return;
    }

    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      const permitted = await requestReadWritePermission(handle);

      if (!permitted) {
        setMessage("Folder permission was not granted.");
        return;
      }

      await storeDirectoryHandle(handle);
      setDirectoryHandle(handle);
      setActiveFile(null);
      activeFileRef.current = null;
      setTree([]);
      setMessage("");
      await refreshTree(handle);
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") {
        console.error(error);
        setMessage("Could not choose that folder.");
      }
    }
  }, [isSupported, refreshTree]);

  const confirmDiscard = useCallback(() => {
    return !dirty || window.confirm("Discard unsaved canvas changes?");
  }, [dirty]);

  const openFile = useCallback(
    async (fileNode: FileTreeFile) => {
      const currentEditor = editorRef.current;
      if (!currentEditor || !confirmDiscard()) return;

      try {
        const file = await fileNode.handle.getFile();
        const text = await file.text();
        const parsed = JSON.parse(text);
        const snapshot = normalizeSnapshot(
          parsed,
          currentEditor.store.schema.serialize()
        );

        if (!isLikelySnapshot(snapshot)) {
          setMessage("This file does not look like a tldraw snapshot.");
          return;
        }

        suppressDirtyRef.current = true;
        currentEditor.loadSnapshot(
          snapshot as Parameters<Editor["loadSnapshot"]>[0]
        );
        window.requestAnimationFrame(() => {
          editorRef.current?.zoomToFit({ animation: { duration: 180 } });
        });
        setActiveFile({
          name: fileNode.name,
          path: fileNode.path,
          handle: fileNode.handle,
        });
        activeFileRef.current = {
          name: fileNode.name,
          path: fileNode.path,
          handle: fileNode.handle,
        };
        setDirty(false);
        setSaveStatus("saved");
        setMessage(`Opened ${fileNode.name}`);
        window.setTimeout(() => {
          suppressDirtyRef.current = false;
        }, 0);
      } catch (error) {
        suppressDirtyRef.current = false;
        console.error(error);
        setMessage("Could not open that file. Check that it contains valid JSON.");
      }
    },
    [confirmDiscard]
  );

  const saveActiveFile = useCallback(async () => {
    const currentEditor = editorRef.current;
    const currentFile = activeFileRef.current;

    if (!currentEditor || !currentFile) {
      setMessage("Create or open a .tldr file before saving.");
      return;
    }

    const revisionAtStart = dirtyRevisionRef.current;

    setSaveStatus("saving");
    setMessage("");

    try {
      const writable = await currentFile.handle.createWritable();
      await writable.write(
        JSON.stringify(wrapSnapshot(currentEditor.getSnapshot()), null, 2)
      );
      await writable.close();

      if (dirtyRevisionRef.current === revisionAtStart) {
        setDirty(false);
      }

      setSaveStatus("saved");
      setMessage(`Saved ${currentFile.name}`);
    } catch (error) {
      console.error(error);
      setSaveStatus("error");
      setMessage("Could not save the current file.");
    }
  }, []);

  const createNewFile = useCallback(async () => {
    if (!directoryHandle || !editorRef.current || !confirmDiscard()) return;

    const requestedName = window.prompt("New diagram file name", "diagram.tldr");
    if (!requestedName) return;

    const fileName = requestedName.match(/\.(tldr|json)$/i)
      ? requestedName
      : `${requestedName}.tldr`;

    try {
      const handle = await directoryHandle.getFileHandle(fileName, {
        create: true,
      });
      const newFile = { name: fileName, path: fileName, handle };

      suppressDirtyRef.current = true;
      editorRef.current.deleteShapes([
        ...editorRef.current.getCurrentPageShapeIds(),
      ]);
      window.setTimeout(() => {
        suppressDirtyRef.current = false;
      }, 0);

      setActiveFile(newFile);
      activeFileRef.current = newFile;
      setDirty(true);
      dirtyRevisionRef.current += 1;
      await saveActiveFile();
      await refreshTree(directoryHandle);
    } catch (error) {
      suppressDirtyRef.current = false;
      console.error(error);
      setMessage("Could not create that file.");
    }
  }, [confirmDiscard, directoryHandle, refreshTree, saveActiveFile]);

  useEffect(() => {
    if (!autosave || !dirty || !activeFile) return;

    const timeout = window.setTimeout(() => {
      void saveActiveFile();
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [activeFile, autosave, dirty, saveActiveFile]);

  const statusLabel =
    saveStatus === "saving"
      ? "Saving"
      : saveStatus === "error"
      ? "Save failed"
      : dirty
      ? "Unsaved"
      : saveStatus === "saved"
      ? "Saved"
      : "Ready";

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#f9f9fe] text-[#1a1c1f] selection:bg-[#04724d] selection:text-white">
      <header className="fixed top-0 z-50 flex h-14 w-full items-center justify-between border-b border-slate-200/70 bg-white/90 px-4 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 text-lg font-bold tracking-tight text-slate-900">
            LocalDraft
          </span>
          <span className="hidden rounded border border-[#cbe3f2] bg-[#cbe3f2]/50 px-2 py-0.5 font-mono text-xs font-medium tracking-wide text-[#4b616e] sm:inline">
            local
          </span>
          <div className="min-w-0 border-l border-slate-200 pl-3">
            <div className="truncate text-sm font-medium text-slate-900">
              {currentFileLabel}
              {dirty && <span className="ml-1 text-emerald-700">*</span>}
            </div>
            <div className="truncate text-[11px] text-slate-500">
              {activeFile?.path ?? "Choose a folder, then create or open a diagram"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`hidden rounded-full px-2.5 py-1 font-mono text-[11px] sm:inline ${
              saveStatus === "error"
                ? "bg-red-50 text-red-700"
                : dirty
                ? "bg-amber-50 text-amber-700"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {statusLabel}
          </span>
          <label className="hidden h-9 items-center gap-2 rounded-full border border-slate-200 px-3 text-xs font-medium text-slate-600 md:flex">
            <input
              className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
              type="checkbox"
              checked={autosave}
              onChange={(event) => setAutosave(event.target.checked)}
            />
            Autosave
          </label>
          <button
            className="flex h-9 items-center gap-1 rounded bg-[#00573a] px-3 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={saveActiveFile}
            disabled={!activeFile || saveStatus === "saving"}
            title="Save"
          >
            <span className="material-symbols-outlined text-[18px]">save</span>
            <span className="hidden sm:inline">Save</span>
          </button>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-full text-emerald-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            onClick={() => sendCanvasCommand("snapshot")}
            title="Log snapshot"
            aria-label="Log snapshot"
          >
            <span className="material-symbols-outlined">photo_camera</span>
          </button>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-full text-emerald-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            onClick={() => sendCanvasCommand("reload")}
            title="Reconnect canvas stream"
            aria-label="Reconnect canvas stream"
          >
            <span className="material-symbols-outlined">sync</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 pt-14">
        <aside className="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-slate-50 text-slate-700">
          <div className="border-b border-slate-200 p-3">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="font-mono text-[11px] font-black uppercase tracking-wider text-emerald-700">
                  Explorer
                </h2>
                <p className="mt-1 truncate text-[11px] text-slate-500">
                  {directoryHandle?.name ?? "No folder selected"}
                </p>
              </div>
              <button
                className="flex h-8 w-8 items-center justify-center rounded text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950"
                onClick={() => directoryHandle && refreshTree(directoryHandle)}
                disabled={!directoryHandle || loadingTree}
                title="Refresh"
                aria-label="Refresh folder"
              >
                <span className="material-symbols-outlined text-[18px]">
                  refresh
                </span>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="flex h-9 items-center justify-center gap-1 rounded border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                onClick={chooseFolder}
              >
                <span className="material-symbols-outlined text-[17px]">
                  folder_open
                </span>
                Folder
              </button>
              <button
                className="flex h-9 items-center justify-center gap-1 rounded bg-[#00573a] px-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={createNewFile}
                disabled={!directoryHandle}
              >
                <span className="material-symbols-outlined text-[17px]">
                  note_add
                </span>
                New
              </button>
            </div>
          </div>

          {message && (
            <div className="border-b border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-600">
              {message}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto py-2">
            {!directoryHandle && (
              <div className="px-3 py-8 text-center text-sm leading-6 text-slate-500">
                Choose a local folder to show `.tldr` and `.json` diagrams.
              </div>
            )}
            {directoryHandle && loadingTree && (
              <div className="px-3 py-4 text-sm text-slate-500">
                Reading folder...
              </div>
            )}
            {directoryHandle && !loadingTree && tree.length === 0 && (
              <div className="px-3 py-8 text-center text-sm leading-6 text-slate-500">
                No supported diagram files found.
              </div>
            )}
            {tree.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                activePath={activeFile?.path}
                depth={0}
                onOpenFile={openFile}
                onLoadDirectory={loadDirectory}
              />
            ))}
          </div>
        </aside>

        <main className="relative min-w-0 flex-1 overflow-hidden bg-[#f9f9fe]">
          <div className="canvas-grid absolute inset-0 opacity-70" />
          <section className="absolute inset-0">
            <TldrawEditor onEditorMount={setEditor} onDocumentChange={markDirty} />
          </section>
        </main>
      </div>
    </div>
  );
}
