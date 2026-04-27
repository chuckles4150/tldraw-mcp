"use client";

import { useEffect } from "react";

export type RecentFileEntry = {
  name: string;
  path: string;
  openedAt: number;
};

type WelcomeModalProps = {
  open: boolean;
  hasFolder: boolean;
  recentFiles: RecentFileEntry[];
  onClose: () => void;
  onChooseFolder: () => void;
  onOpenRecent: (path: string) => void;
};

function formatRelativeTime(timestamp: number) {
  const diffMs = Date.now() - timestamp;
  if (diffMs < 60_000) return "Just now";

  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? "" : "s"} ago`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay} days ago`;

  return new Date(timestamp).toLocaleDateString();
}

export default function WelcomeModal({
  open,
  hasFolder,
  recentFiles,
  onClose,
  onChooseFolder,
  onOpenRecent,
}: WelcomeModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleOpenFile = () => {
    if (!hasFolder) onChooseFolder();
    onClose();
  };

  return (
    <div className="welcome-fade-in fixed inset-0 z-[100] flex items-center justify-center bg-white/40 p-4 backdrop-blur-[12px]">
      <div className="absolute inset-0 bg-[#2e3034]/5 backdrop-blur-[4px]" />

      <div className="welcome-scale-in welcome-liquid-glass relative z-10 flex w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/40 bg-white/60 shadow-[0_32px_64px_rgba(0,0,0,0.15)] backdrop-blur-2xl">
        <div className="flex items-start justify-between border-b border-[#bec9c0]/30 px-8 pb-6 pt-8">
          <div>
            <h1 className="mb-2 text-[32px] font-black tracking-tight text-[#1a1c1f]">
              Welcome to LocalDraft
            </h1>
            <p className="text-sm text-[#4b616e]">
              Your local-first, AI-powered whiteboard.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close welcome dialog"
            onClick={onClose}
            className="p-1 text-[#6f7a72] transition-colors hover:text-[#1a1c1f]"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <div className="grid gap-8 p-8 md:grid-cols-[1fr_240px]">
          <div className="flex flex-col gap-4">
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-[#4b616e]">
              Quick Start Guide
            </h2>

            <button
              type="button"
              onClick={handleOpenFile}
              className="welcome-card welcome-fade-in-up welcome-delay-100 group flex items-start gap-4 rounded-lg border border-[#bec9c0]/40 bg-white/40 p-5 text-left"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#9af5c6]/30 text-[#04724d]">
                <span className="material-symbols-outlined">folder_open</span>
              </div>
              <div>
                <h3 className="mb-1 text-[18px] font-semibold text-[#1a1c1f] transition-colors group-hover:text-[#04724d]">
                  {hasFolder ? "Open a File" : "Choose a Folder"}
                </h3>
                <p className="text-sm text-[#4b616e]">
                  {hasFolder
                    ? "Pick a .tldr file from the sidebar to start editing."
                    : "Grant access to a folder of .tldr files to begin."}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="welcome-card welcome-fade-in-up welcome-delay-200 group flex items-start gap-4 rounded-lg border border-[#bec9c0]/40 bg-white/40 p-5 text-left"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#c6e9e7]/40 text-[#315150]">
                <span className="material-symbols-outlined">hub</span>
              </div>
              <div>
                <h3 className="mb-1 text-[18px] font-semibold text-[#1a1c1f] transition-colors group-hover:text-[#04724d]">
                  Connect MCP
                </h3>
                <p className="text-sm text-[#4b616e]">
                  Drive the canvas from Claude or any MCP-compatible client.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="welcome-card welcome-fade-in-up welcome-delay-300 group flex items-start gap-4 rounded-lg border border-[#bec9c0]/40 bg-white/40 p-5 text-left"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#cbe3f2]/50 text-[#4b616e]">
                <span className="material-symbols-outlined">draw</span>
              </div>
              <div>
                <h3 className="mb-1 text-[18px] font-semibold text-[#1a1c1f] transition-colors group-hover:text-[#04724d]">
                  Start Drawing
                </h3>
                <p className="text-sm text-[#4b616e]">
                  Jump straight into the canvas and sketch ideas.
                </p>
              </div>
            </button>
          </div>

          <div className="flex flex-col border-t border-[#bec9c0]/30 pt-8 md:border-l md:border-t-transparent md:pl-8 md:pt-0">
            <h2 className="mb-4 text-[11px] font-bold uppercase tracking-widest text-[#4b616e]">
              Recent Files
            </h2>

            {recentFiles.length === 0 ? (
              <p className="text-xs text-[#6f7a72]">
                Files you open will show up here.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {recentFiles.slice(0, 5).map((file) => (
                  <li key={file.path}>
                    <button
                      type="button"
                      onClick={() => {
                        onOpenRecent(file.path);
                        onClose();
                      }}
                      className="group flex w-full items-center gap-3 rounded border border-transparent bg-white/60 p-3 text-left transition-all hover:border-[#bec9c0]/30 hover:bg-[#e2e2e7]/50"
                    >
                      <span className="material-symbols-outlined text-sm text-[#6f7a72] group-hover:text-[#04724d]">
                        draft
                      </span>
                      <div className="min-w-0 flex-1">
                        <span
                          className="block truncate font-mono text-xs text-[#1a1c1f]"
                          title={file.path}
                        >
                          {file.name}
                        </span>
                        <span className="mt-1 block text-[9px] font-bold uppercase tracking-widest text-[#6f7a72]">
                          {formatRelativeTime(file.openedAt)}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[#bec9c0]/30 bg-white/50 px-8 py-5">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 rounded border border-[#bec9c0] px-5 py-2.5 font-mono text-xs text-[#4b616e] transition-colors hover:bg-[#e2e2e7]/50 hover:text-[#1a1c1f]"
          >
            <span className="material-symbols-outlined text-sm">menu_book</span>
            Skip for Now
          </button>
          <button
            type="button"
            onClick={onClose}
            className="welcome-cta flex items-center gap-2 rounded px-6 py-2.5 font-mono text-xs text-white shadow-sm"
          >
            Get Started
            <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  );
}
