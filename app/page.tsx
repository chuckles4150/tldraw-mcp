"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

// Dynamically import the TldrawEditor component to avoid SSR issues
const TldrawEditor = dynamic(() => import("./components/TldrawEditor"), {
  ssr: false,
});

function sendCanvasCommand(type: string, payload: Record<string, unknown> = {}) {
  window.dispatchEvent(
    new CustomEvent("localdraft-canvas-command", {
      detail: { type, ...payload },
    })
  );
}

const mcpTools = [
  { name: "createShape", description: "Create basic geo shapes with optional labels and styling." },
  { name: "connectShapes", description: "Connect referenced shapes with straight, curved, or orthogonal arrows." },
  { name: "addText", description: "Add standalone text to the canvas." },
  { name: "createFlowchartStep", description: "Create a numbered flowchart step and optionally connect it to the previous step." },
  { name: "addStickyNote", description: "Add a styled sticky note." },
  { name: "highlightArea", description: "Highlight a referenced shape or a manual canvas region." },
  { name: "createFrame", description: "Create a named frame around an area." },
  { name: "createLine", description: "Draw a straight or cubic line from two or more points." },
  { name: "createMedia", description: "Add image or video media from a URL." },
  { name: "createEmbed", description: "Embed supported external content from a URL." },
  { name: "createBookmark", description: "Create a URL bookmark card." },
  { name: "updateShape", description: "Move, resize, rotate, relabel, or restyle an existing shape." },
  { name: "deleteShape", description: "Delete a shape by reference id." },
  { name: "groupShapes", description: "Group two or more referenced shapes." },
  { name: "ungroupShapes", description: "Ungroup one or more referenced groups." },
  { name: "reorderShapes", description: "Bring referenced shapes to the front or send them to the back." },
  { name: "createPage", description: "Create a new page and optionally switch to it." },
  { name: "switchPage", description: "Switch to an existing page by name." },
  { name: "deletePage", description: "Delete a page by name." },
  { name: "getSnapshot", description: "Capture the current diagram snapshot." },
];

export default function Home() {
  const [showToolDocs, setShowToolDocs] = useState(false);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#f9f9fe] text-[#1a1c1f] selection:bg-[#04724d] selection:text-white">
      <header className="fixed top-0 z-50 flex w-full shadow-sm">
        <div className="flex h-14 w-full items-center justify-between border-b border-slate-200/70 bg-white/85 px-6 backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <span className="text-lg font-bold tracking-tight text-slate-900">
              LocalDraft
            </span>
            <span className="rounded border border-[#cbe3f2] bg-[#cbe3f2]/50 px-2 py-0.5 font-mono text-xs font-medium tracking-wide text-[#4b616e]">
              v1.1
            </span>
            <span className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 font-mono text-[11px] font-medium text-emerald-700 sm:flex">
              <span className="pulse-emerald h-2 w-2 rounded-full bg-emerald-500" />
              MCP Active
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              className="flex h-9 w-9 items-center justify-center rounded-full text-emerald-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              onClick={() => setShowToolDocs(true)}
              title="MCP tool documentation"
              aria-label="Open MCP tool documentation"
            >
              <span className="material-symbols-outlined">menu_book</span>
            </button>
            <button
              className="flex h-9 w-9 items-center justify-center rounded-full text-emerald-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              onClick={() => sendCanvasCommand("snapshot")}
              title="Take snapshot"
              aria-label="Take canvas snapshot"
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
        </div>
      </header>

      <main className="relative mt-14 min-h-0 flex-1 overflow-hidden bg-[#f9f9fe]">
        <div className="canvas-grid absolute inset-0 opacity-70" />
        <section className="absolute inset-0">
          <TldrawEditor />
        </section>
      </main>

      {showToolDocs && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/20 p-4 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mcp-tool-docs-title"
          onClick={() => setShowToolDocs(false)}
        >
          <section
            className="flex max-h-[calc(100vh-6rem)] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h2
                  id="mcp-tool-docs-title"
                  className="text-base font-semibold text-slate-950"
                >
                  MCP Tools
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {mcpTools.length} tools available to the LocalDraft MCP server.
                </p>
              </div>
              <button
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                onClick={() => setShowToolDocs(false)}
                title="Close documentation"
                aria-label="Close MCP tool documentation"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {mcpTools.map((tool) => (
                  <article
                    key={tool.name}
                    className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3"
                  >
                    <h3 className="font-mono text-[13px] font-semibold text-emerald-800">
                      {tool.name}
                    </h3>
                    <p className="mt-1 text-sm leading-5 text-slate-600">
                      {tool.description}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
