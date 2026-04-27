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

function makeBoxHighlightSegments(width: number, height: number) {
  return [
    {
      type: "free",
      points: [
        { x: 0, y: 0, z: 0.5 },
        { x: width, y: 0, z: 0.5 },
        { x: width, y: height, z: 0.5 },
        { x: 0, y: height, z: 0.5 },
        { x: 0, y: 0, z: 0.5 },
      ],
    },
  ];
}

function getTargetBounds(editor: Editor, targetId?: string) {
  if (!targetId) return null;
  return editor.getShapePageBounds(targetId as TLShapeId);
}

function toShapeId(refs: Record<string, TLShapeId>, id: string): TLShapeId {
  return refs[id] || (id as TLShapeId);
}

function makeLinePoints(points: Array<{ x: number; y: number }>) {
  const origin = points[0] ?? { x: 0, y: 0 };

  return Object.fromEntries(
    points.map((point, index) => {
      const id = index === 0 ? "start" : index === points.length - 1 ? "end" : `point-${index}`;
      return [
        id,
        {
          id,
          index: `a${index + 1}`,
          x: point.x - origin.x,
          y: point.y - origin.y,
        },
      ];
    })
  );
}

function pageByName(editor: Editor, name: string) {
  return editor.getPages().find((page) => page.name === name);
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
      const state =
        eventSource.readyState === EventSource.CONNECTING
          ? "reconnecting"
          : eventSource.readyState === EventSource.CLOSED
          ? "closed"
          : "open";

      console.warn("[TldrawEditor] EventSource connection issue:", {
        state,
        error,
      });
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

          case "addStickyNote": {
            const { id: refId, x, y, text, color, labelColor, size } =
              operation.payload;
            const id = createLocalShapeId();

            editor.createShape({
              id,
              type: "note",
              x,
              y,
              props: {
                richText: toRichText(text),
                ...definedStyles({
                  color: color || "yellow",
                  labelColor,
                  size,
                }),
              },
            });

            if (refId) {
              shapesRef.current[refId] = id;
            }

            console.log("Created sticky note with id:", id);
            break;
          }

          case "highlightArea": {
            const {
              id: refId,
              targetId,
              x,
              y,
              width,
              height,
              color,
              size,
            } = operation.payload;
            const targetBounds = getTargetBounds(
              editor,
              targetId ? shapesRef.current[targetId] || targetId : undefined
            );
            const padding = targetBounds ? 12 : 0;
            const highlightX = x ?? (targetBounds ? targetBounds.x - padding : 0);
            const highlightY = y ?? (targetBounds ? targetBounds.y - padding : 0);
            const highlightW =
              width ?? (targetBounds ? targetBounds.w + padding * 2 : 160);
            const highlightH =
              height ?? (targetBounds ? targetBounds.h + padding * 2 : 80);
            const id = createLocalShapeId();

            editor.createShape({
              id,
              type: "highlight",
              x: highlightX,
              y: highlightY,
              props: {
                segments: makeBoxHighlightSegments(highlightW, highlightH),
                isComplete: true,
                isPen: false,
                ...definedStyles({
                  color: color || "yellow",
                  size: size || "xl",
                }),
              },
              meta: {
                reviewType: "highlight",
                targetId: targetId || "",
              },
            });

            if (refId) {
              shapesRef.current[refId] = id;
            }

            console.log("Created highlight with id:", id);
            break;
          }

          case "createFrame": {
            const { id: refId, x, y, width, height, name, color } =
              operation.payload;
            const id = createLocalShapeId();

            editor.createShape({
              id,
              type: "frame",
              x,
              y,
              props: {
                w: width,
                h: height,
                name: name || "",
                ...definedStyles({ color }),
              },
            });

            if (refId) shapesRef.current[refId] = id;
            console.log("Created frame with id:", id);
            break;
          }

          case "createLine": {
            const { id: refId, points, spline, color, dash, size } =
              operation.payload;
            const id = createLocalShapeId();
            const origin = points[0] ?? { x: 0, y: 0 };

            editor.createShape({
              id,
              type: "line",
              x: origin.x,
              y: origin.y,
              props: {
                points: makeLinePoints(points),
                spline: spline || "line",
                ...definedStyles({ color, dash, size }),
              },
            });

            if (refId) shapesRef.current[refId] = id;
            console.log("Created line with id:", id);
            break;
          }

          case "createMedia": {
            const {
              id: refId,
              mediaType,
              x,
              y,
              width,
              height,
              url,
              altText,
            } = operation.payload;
            const id = createLocalShapeId();

            if (mediaType === "video") {
              editor.createShape({
                id,
                type: "video",
                x,
                y,
                props: {
                  w: width,
                  h: height,
                  url,
                  assetId: null,
                  time: 0,
                  playing: false,
                  altText: altText || "",
                },
              });
            } else {
              editor.createShape({
                id,
                type: "image",
                x,
                y,
                props: {
                  w: width,
                  h: height,
                  url,
                  assetId: null,
                  playing: false,
                  crop: null,
                  flipX: false,
                  flipY: false,
                  altText: altText || "",
                },
              });
            }

            if (refId) shapesRef.current[refId] = id;
            console.log("Created media with id:", id);
            break;
          }

          case "createEmbed": {
            const { id: refId, x, y, width, height, url } = operation.payload;
            const id = createLocalShapeId();

            editor.createShape({
              id,
              type: "embed",
              x,
              y,
              props: { w: width, h: height, url },
            });

            if (refId) shapesRef.current[refId] = id;
            console.log("Created embed with id:", id);
            break;
          }

          case "createBookmark": {
            const { id: refId, x, y, width, height, url } = operation.payload;
            const id = createLocalShapeId();

            editor.createShape({
              id,
              type: "bookmark",
              x,
              y,
              props: { w: width, h: height, url, assetId: null },
            });

            if (refId) shapesRef.current[refId] = id;
            console.log("Created bookmark with id:", id);
            break;
          }

          case "updateShape": {
            const {
              id: refId,
              x,
              y,
              width,
              height,
              rotation,
              text,
              color,
              labelColor,
              fill,
              dash,
              size,
            } = operation.payload;
            const id = toShapeId(shapesRef.current, refId);
            const shape = editor.getShape(id);

            if (!shape) {
              console.warn("Could not update missing shape:", refId);
              break;
            }

            const props: Record<string, unknown> = definedStyles({
              color,
              labelColor,
              fill,
              dash,
              size,
            });

            if (width !== undefined) props.w = width;
            if (height !== undefined) props.h = height;
            if (text !== undefined) {
              if (shape.type === "arrow") props.text = text;
              else props.richText = toRichText(text);
            }

            const update = {
              id,
              type: shape.type,
              ...(x !== undefined ? { x } : {}),
              ...(y !== undefined ? { y } : {}),
              ...(rotation !== undefined ? { rotation } : {}),
              ...(Object.keys(props).length ? { props } : {}),
            } as Parameters<Editor["updateShape"]>[0];

            editor.updateShape(update);

            console.log("Updated shape:", id);
            break;
          }

          case "deleteShape": {
            const { id: refId } = operation.payload;
            const id = toShapeId(shapesRef.current, refId);

            editor.deleteShape(id);
            for (const [key, value] of Object.entries(shapesRef.current)) {
              if (value === id) delete shapesRef.current[key];
            }

            console.log("Deleted shape:", id);
            break;
          }

          case "clearCanvas": {
            const ids = [...editor.getCurrentPageShapeIds()];
            editor.deleteShapes(ids);
            shapesRef.current = {};
            console.log("Cleared canvas");
            break;
          }

          case "groupShapes": {
            const { ids, id: refId } = operation.payload;
            const shapeIds = ids.map((shapeId: string) =>
              toShapeId(shapesRef.current, shapeId)
            );
            const groupId = createLocalShapeId();

            editor.groupShapes(shapeIds, { groupId });
            if (refId) shapesRef.current[refId] = groupId;

            console.log("Grouped shapes:", shapeIds);
            break;
          }

          case "ungroupShapes": {
            const { ids } = operation.payload;
            const shapeIds = ids.map((shapeId: string) =>
              toShapeId(shapesRef.current, shapeId)
            );

            editor.ungroupShapes(shapeIds);
            console.log("Ungrouped shapes:", shapeIds);
            break;
          }

          case "reorderShapes": {
            const { ids, action } = operation.payload;
            const shapeIds = ids.map((shapeId: string) =>
              toShapeId(shapesRef.current, shapeId)
            );

            if (action === "bringToFront") editor.bringToFront(shapeIds);
            else editor.sendToBack(shapeIds);

            console.log("Reordered shapes:", shapeIds);
            break;
          }

          case "createPage": {
            const { name, switchToPage } = operation.payload;
            const existing = pageByName(editor, name);

            if (!existing) editor.createPage({ name });
            const page = pageByName(editor, name);
            if (switchToPage && page) {
              editor.setCurrentPage(page.id);
              shapesRef.current = {};
            }

            console.log("Created page:", name);
            break;
          }

          case "switchPage": {
            const { name } = operation.payload;
            const page = pageByName(editor, name);

            if (!page) {
              console.warn("Could not switch to missing page:", name);
              break;
            }

            editor.setCurrentPage(page.id);
            shapesRef.current = {};
            console.log("Switched page:", name);
            break;
          }

          case "deletePage": {
            const { name } = operation.payload;
            const page = pageByName(editor, name);

            if (!page) {
              console.warn("Could not delete missing page:", name);
              break;
            }

            editor.deletePage(page.id);
            shapesRef.current = {};
            console.log("Deleted page:", name);
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

    const handleCanvasCommand = (event: Event) => {
      if (!editorRef.current) return;

      const editor = editorRef.current;
      const { type } = (event as CustomEvent<{ type: string }>).detail;
      const center = editor.getViewportPageBounds().center;
      const animation = { animation: { duration: 160 } };

      switch (type) {
        case "select":
          editor.setCurrentTool("select");
          break;

        case "draw":
          editor.setCurrentTool("draw");
          break;

        case "rectangle": {
          editor.createShape({
            id: createLocalShapeId(),
            type: "geo",
            x: center.x - 80,
            y: center.y - 45,
            props: {
              w: 160,
              h: 90,
              geo: "rectangle",
              fill: "semi",
              color: "green",
            },
          });
          break;
        }

        case "ellipse": {
          editor.createShape({
            id: createLocalShapeId(),
            type: "geo",
            x: center.x - 70,
            y: center.y - 45,
            props: {
              w: 140,
              h: 90,
              geo: "ellipse",
              fill: "semi",
              color: "blue",
            },
          });
          break;
        }

        case "text": {
          editor.createShape({
            id: createLocalShapeId(),
            type: "text",
            x: center.x - 80,
            y: center.y - 16,
            props: {
              richText: toRichText("Text"),
              size: "m",
            },
          });
          break;
        }

        case "stickyNote": {
          editor.createShape({
            id: createLocalShapeId(),
            type: "note",
            x: center.x - 110,
            y: center.y - 80,
            props: {
              richText: toRichText("Review note"),
              color: "yellow",
              size: "m",
            },
          });
          break;
        }

        case "highlight": {
          editor.createShape({
            id: createLocalShapeId(),
            type: "highlight",
            x: center.x - 120,
            y: center.y - 60,
            props: {
              segments: makeBoxHighlightSegments(240, 120),
              isComplete: true,
              isPen: false,
              color: "yellow",
              size: "xl",
            },
          });
          break;
        }

        case "clear":
          editor.deleteShapes([...editor.getCurrentPageShapeIds()]);
          shapesRef.current = {};
          break;

        case "fit":
          editor.zoomToFit(animation);
          break;

        case "snapshot":
          console.log("[TldrawEditor] Snapshot:", editor.store.getSnapshot());
          break;

        case "reload":
          window.location.reload();
          break;

        default:
          console.warn("Unknown canvas command:", type);
      }
    };

    window.addEventListener("localdraft-canvas-command", handleCanvasCommand);

    return () => {
      console.log("[TldrawEditor] Closing EventSource connection");
      window.removeEventListener(
        "localdraft-canvas-command",
        handleCanvasCommand
      );
      eventSource.close();
    };
  }, []);

  return (
    <div style={{ height: "100%", width: "100%" }}>
      <Tldraw
        onMount={(editor) => {
          editorRef.current = editor;
          console.log("Tldraw editor mounted");
        }}
      />
    </div>
  );
}
