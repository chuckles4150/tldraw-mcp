"use client";

import { Editor, Tldraw, type TLShapeId } from "@tldraw/tldraw";
import "@tldraw/tldraw/tldraw.css";
import { useEffect, useRef } from "react";

function createLocalShapeId(): TLShapeId {
  return `shape:${crypto.randomUUID()}` as TLShapeId;
}

function toRichText(text: string) {
  return {
    type: "doc",
    content: text.split("\n").map((line) =>
      line
        ? {
            type: "paragraph",
            content: [{ type: "text", text: line }],
          }
        : { type: "paragraph" }
    ),
  };
}

function sizeFromFontSize(fontSize?: number): "s" | "m" | "l" | "xl" {
  if (!fontSize || fontSize <= 16) return "s";
  if (fontSize <= 24) return "m";
  if (fontSize <= 32) return "l";
  return "xl";
}

function definedStyles(styles: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(styles).filter(([, value]) => value !== undefined)
  );
}

export default function TldrawEditor() {
  const editorRef = useRef<Editor | null>(null);
  const shapesRef = useRef<Record<string, TLShapeId>>({});
  useEffect(() => {
    // Only run in the browser
    if (typeof window === "undefined") return;

    console.log(
      "[TldrawEditor] Setting up EventSource connection to /api/events"
    );
    const eventSource = new EventSource("/api/events");

    eventSource.onopen = () => {
      console.log("[TldrawEditor] EventSource connection opened");
    };

    eventSource.onerror = (error) => {
      console.error("[TldrawEditor] EventSource error:", error);
    };
    eventSource.addEventListener("tldraw-operation", (event) => {
      const operation = JSON.parse(event.data);
      console.log("[TldrawEditor] Received tldraw operation:", operation);

      // Apply the operation to the tldraw editor
      if (editorRef.current) {
        const editor = editorRef.current;

        switch (operation.type) {
          case "createShape": {
            const {
              id: refId,
              shapeType,
              x,
              y,
              width,
              height,
              text,
              color,
              labelColor,
              fill,
              dash,
              size,
            } = operation.payload; // Create the shape based on the type - tldraw uses "geo" for basic shapes
            const id = createLocalShapeId();
            editor.createShape({
              id,
              type: "geo",
              x,
              y,
              props: {
                w: width,
                h: height,
                geo:
                  shapeType === "rectangle"
                    ? "rectangle"
                    : shapeType === "ellipse"
                    ? "ellipse"
                    : shapeType === "triangle"
                    ? "triangle"
                    : shapeType === "diamond"
                    ? "diamond"
                    : "rectangle",
                ...(text ? { richText: toRichText(text) } : {}),
                ...definedStyles({
                  color,
                  labelColor,
                  fill,
                  dash,
                  size,
                }),
              },
            });

            // Store the created shape ID for future reference
            if (refId) {
              shapesRef.current[refId] = id;
            }

            if ("stepNumber" in operation.payload) {
              shapesRef.current[`step-${operation.payload.stepNumber}`] = id;
            }

            console.log("Created shape with id:", id);
            break;
          }

          case "connectShapes": {
            const {
              fromId,
              toId,
              arrowType,
              color,
              dash,
              size,
              arrowheadStart,
              arrowheadEnd,
            } = operation.payload;

            const actualFromId = shapesRef.current[fromId] || fromId;
            const actualToId = shapesRef.current[toId] || toId;
            const fromBounds = editor.getShapePageBounds(
              actualFromId as TLShapeId
            );
            const toBounds = editor.getShapePageBounds(actualToId as TLShapeId);

            if (!fromBounds || !toBounds) {
              console.warn("Could not connect missing shapes:", {
                fromId,
                toId,
              });
              break;
            }

            const start = fromBounds.center;
            const end = toBounds.center;
            const id = createLocalShapeId();

            editor.createShape({
              id,
              type: "arrow",
              x: start.x,
              y: start.y,
              props: {
                start: { x: 0, y: 0 },
                end: { x: end.x - start.x, y: end.y - start.y },
                bend: arrowType === "curved" ? 30 : 0,
                kind: arrowType === "orthogonal" ? "elbow" : "arc",
                ...definedStyles({
                  color,
                  dash,
                  size,
                  arrowheadStart,
                  arrowheadEnd,
                }),
              },
            });

            console.log("Created arrow with id:", id);
            break;
          }

          case "addText": {
            const { x, y, text, fontSize, color, size } = operation.payload;
            const id = createLocalShapeId();

            editor.createShape({
              id,
              type: "text",
              x,
              y,
              props: {
                richText: toRichText(text),
                size: size || sizeFromFontSize(fontSize),
                ...definedStyles({
                  color,
                }),
              },
            });

            console.log("Created text with id:", id);
            break;
          }
          case "createFlowchartStep": {
            const {
              stepNumber,
              title,
              description,
              x,
              y,
              connectToPrevious,
              color,
              labelColor,
              fill,
              dash,
              size,
            } = operation.payload;
            const id = createLocalShapeId();
            const label = title + (description ? `\n${description}` : "");

            editor.createShape({
              id,
              type: "geo",
              x,
              y,
              props: {
                w: 160,
                h: 80,
                geo: "rectangle",
                richText: toRichText(label),
                ...definedStyles({
                  color,
                  labelColor,
                  fill,
                  dash,
                  size,
                }),
              },
            });

            shapesRef.current[`step-${stepNumber}`] = id;

            if (connectToPrevious && stepNumber > 1) {
              const prevStepId = shapesRef.current[`step-${stepNumber - 1}`];

              if (prevStepId) {
                const prevBounds = editor.getShapePageBounds(prevStepId);
                const currentBounds = editor.getShapePageBounds(id);

                if (!prevBounds || !currentBounds) break;

                const start = prevBounds.center;
                const end = currentBounds.center;
                const arrowId = createLocalShapeId();

                editor.createShape({
                  id: arrowId,
                  type: "arrow",
                  x: start.x,
                  y: start.y,
                  props: {
                    start: { x: 0, y: 0 },
                    end: { x: end.x - start.x, y: end.y - start.y },
                    ...definedStyles({
                      color,
                      dash,
                      size,
                    }),
                  },
                });
              }
            }

            console.log("Created flowchart step with id:", id);
            break;
          }

          case "requestSnapshot": {
            const { requestId } = operation.payload;

            const snapshot = editor.store.getSnapshot();

            fetch("/api/snapshot", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                requestId,
                snapshot,
              }),
            }).catch((error) => {
              console.error("Failed to send snapshot:", error);
            });

            console.log("Snapshot requested with id:", requestId);
            break;
          }

          default:
            console.warn("Unknown operation type:", operation.type);
        }
      }
    }); // Add handler for connected event
    eventSource.addEventListener("connected", (event) => {
      console.log("[TldrawEditor] Received connected event:", event.data);
    });

    // Add handler for heartbeat event
    eventSource.addEventListener("heartbeat", (event) => {
      console.log("[TldrawEditor] Received heartbeat event:", event.data);
    });

    // Add handler for debug event
    eventSource.addEventListener("debug", (event) => {
      console.log("[TldrawEditor] Received debug event:", event.data);
    });

    return () => {
      console.log("[TldrawEditor] Closing EventSource connection");
      eventSource.close();
    };
  }, []);

  return (
    <div style={{ height: "calc(100vh - 80px)", width: "100%" }}>
      <Tldraw
        onMount={(editor) => {
          editorRef.current = editor;
          console.log("Tldraw editor mounted");
        }}
      />
    </div>
  );
}
