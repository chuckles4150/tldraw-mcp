import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { broadcastOperation, eventBus, TldrawOperation } from "./eventBus.js";
import { createServer } from "http";
import * as fs from "fs";

const mcpLogFile = fs.createWriteStream("./mcp-server.log", { flags: "a" });
const httpLogFile = fs.createWriteStream("./http-server.log", { flags: "a" });

function logToFile(message: string) {
  const timestamp = new Date().toISOString();
  mcpLogFile.write(`${timestamp} - ${message}\n`);
}

function logHttpToFile(message: string) {
  const timestamp = new Date().toISOString();
  httpLogFile.write(`${timestamp} - ${message}\n`);
}

// Log to file for both MCP and HTTP server
logToFile("[Combined Server] Starting MCP and HTTP server...");
logHttpToFile("[Combined Server] Starting MCP and HTTP server...");

// Create MCP Server
const server = new McpServer({
  name: "TldrawServer",
  version: "1.0.0",
});

const colorSchema = z
  .enum([
    "black",
    "grey",
    "light-violet",
    "violet",
    "blue",
    "light-blue",
    "yellow",
    "orange",
    "green",
    "light-green",
    "light-red",
    "red",
    "white",
  ])
  .optional();
const fillSchema = z.enum(["none", "semi", "solid", "pattern", "fill"]).optional();
const dashSchema = z.enum(["draw", "solid", "dashed", "dotted"]).optional();
const sizeSchema = z.enum(["s", "m", "l", "xl"]).optional();
const arrowheadSchema = z
  .enum([
    "arrow",
    "triangle",
    "square",
    "dot",
    "pipe",
    "diamond",
    "inverted",
    "bar",
    "none",
  ])
  .optional();

server.tool(
  "createShape",
  {
    id: z
      .string()
      .optional()
      .describe("A reusable reference id, e.g. database or api, for later arrows"),
    type: z.enum(["rectangle", "ellipse", "triangle", "diamond"]),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    text: z.string().optional(),
    color: colorSchema.describe("Stroke color"),
    labelColor: colorSchema.describe("Text label color"),
    fill: fillSchema.describe("Fill style"),
    dash: dashSchema.describe("Stroke style"),
    size: sizeSchema.describe("Stroke/text size"),
  },
  async ({
    id,
    type,
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
  }) => {
    logToFile(
      `Creating shape: type=${type}, x=${x}, y=${y}, width=${width}, height=${height}, text=${
        text || ""
      }`
    );
    broadcastOperation({
      type: "createShape",
      payload: {
        id,
        shapeType: type,
        x,
        y,
        width,
        height,
        text: text || "",
        color,
        labelColor,
        fill,
        dash,
        size,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: `Created a ${type}${id ? ` with reference id "${id}"` : ""} at position (${x}, ${y})`,
        },
      ],
    };
  }
);

server.tool(
  "connectShapes",
  {
    fromId: z.string(),
    toId: z.string(),
    arrowType: z.enum(["straight", "curved", "orthogonal"]).optional(),
    color: colorSchema.describe("Arrow color"),
    dash: dashSchema.describe("Arrow line style"),
    size: sizeSchema.describe("Arrow stroke size"),
    arrowheadStart: arrowheadSchema.describe("Start arrowhead"),
    arrowheadEnd: arrowheadSchema.describe("End arrowhead"),
  },
  async ({
    fromId,
    toId,
    arrowType,
    color,
    dash,
    size,
    arrowheadStart,
    arrowheadEnd,
  }) => {
    broadcastOperation({
      type: "connectShapes",
      payload: {
        fromId,
        toId,
        arrowType: arrowType || "straight",
        color,
        dash,
        size,
        arrowheadStart,
        arrowheadEnd,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: `Connected shape ${fromId} to ${toId}`,
        },
      ],
    };
  }
);

server.tool(
  "addText",
  {
    x: z.number(),
    y: z.number(),
    text: z.string(),
    fontSize: z.number().optional(),
    color: colorSchema.describe("Text color"),
    size: sizeSchema.describe("Text size"),
  },
  async ({ x, y, text, fontSize, color, size }) => {
    broadcastOperation({
      type: "addText",
      payload: {
        x,
        y,
        text,
        fontSize: fontSize || 20,
        color,
        size,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: `Added text "${text}" at position (${x}, ${y})`,
        },
      ],
    };
  }
);

server.tool(
  "createFlowchartStep",
  {
    stepNumber: z.number(),
    title: z.string(),
    description: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    connectToPrevious: z.boolean().optional(),
    color: colorSchema.describe("Box stroke color"),
    labelColor: colorSchema.describe("Box text color"),
    fill: fillSchema.describe("Box fill style"),
    dash: dashSchema.describe("Box stroke style"),
    size: sizeSchema.describe("Box stroke/text size"),
  },
  async ({
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
  }) => {
    const posX = x || stepNumber * 200;
    const posY = y || 200;

    broadcastOperation({
      type: "createFlowchartStep",
      payload: {
        stepNumber,
        title,
        description: description || "",
        x: posX,
        y: posY,
        connectToPrevious: connectToPrevious !== false,
        color,
        labelColor,
        fill,
        dash,
        size,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: `Created flowchart step ${stepNumber}: ${title}`,
        },
      ],
    };
  }
);

server.tool(
  "addStickyNote",
  {
    id: z
      .string()
      .optional()
      .describe("A reusable reference id for the sticky note"),
    x: z.number(),
    y: z.number(),
    text: z.string(),
    color: colorSchema.describe("Sticky note color"),
    labelColor: colorSchema.describe("Sticky note text color"),
    size: sizeSchema.describe("Sticky note text size"),
  },
  async ({ id, x, y, text, color, labelColor, size }) => {
    broadcastOperation({
      type: "addStickyNote",
      payload: {
        id,
        x,
        y,
        text,
        color,
        labelColor,
        size,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: `Added sticky note${id ? ` with reference id "${id}"` : ""}`,
        },
      ],
    };
  }
);

server.tool(
  "addComment",
  {
    id: z
      .string()
      .optional()
      .describe("A reusable reference id for this comment"),
    targetId: z
      .string()
      .optional()
      .describe("Reference id of the shape being reviewed"),
    x: z.number().optional(),
    y: z.number().optional(),
    text: z.string(),
    author: z.string().optional(),
    status: z.enum(["open", "resolved"]).optional(),
    color: colorSchema.describe("Comment note color"),
  },
  async ({ id, targetId, x, y, text, author, status, color }) => {
    broadcastOperation({
      type: "addComment",
      payload: {
        id,
        targetId,
        x,
        y,
        text,
        author,
        status: status || "open",
        color,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: `Added ${status || "open"} comment${targetId ? ` on ${targetId}` : ""}`,
        },
      ],
    };
  }
);

server.tool(
  "highlightArea",
  {
    id: z
      .string()
      .optional()
      .describe("A reusable reference id for this highlight"),
    targetId: z
      .string()
      .optional()
      .describe("Reference id of the shape to highlight"),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    color: colorSchema.describe("Highlight color"),
    size: sizeSchema.describe("Highlight stroke size"),
  },
  async ({ id, targetId, x, y, width, height, color, size }) => {
    broadcastOperation({
      type: "highlightArea",
      payload: {
        id,
        targetId,
        x,
        y,
        width,
        height,
        color,
        size,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: `Added highlight${targetId ? ` around ${targetId}` : ""}`,
        },
      ],
    };
  }
);

server.tool("getSnapshot", {}, async () => {
  return new Promise((resolve) => {
    const requestId = `snapshot-${Date.now()}`;
    broadcastOperation({
      type: "requestSnapshot",
      payload: { requestId },
    });
    const snapshotListener = (data: {
      type: string;
      payload: Record<string, unknown>;
    }) => {
      if (
        data.type === "snapshotResponse" &&
        "requestId" in data.payload &&
        data.payload.requestId === requestId
      ) {
        eventBus.off("snapshot-response", snapshotListener);

        resolve({
          content: [
            {
              type: "text",
              text: `Diagram snapshot captured`,
            },
          ],
          snapshot:
            "snapshot" in data.payload
              ? (data.payload.snapshot as Record<string, unknown>)
              : {},
        });
      }
    };

    eventBus.on("snapshot-response", snapshotListener);

    setTimeout(() => {
      eventBus.off("snapshot-response", snapshotListener);
      resolve({
        content: [
          {
            type: "text",
            text: `Failed to capture diagram snapshot (timeout)`,
          },
        ],
      });
    }, 5000);
  });
});

// Create and start the HTTP server in the same process as the MCP server.
// The EventBus is in-memory, so MCP tools and SSE clients must share this process.
const httpServer = createServer((req, res) => {
  logHttpToFile(`[HTTP Server] Received ${req.method} request to ${req.url}`);
  if (req.url === "/api/tldraw-events" && req.method === "GET") {
    logHttpToFile("[HTTP Server] SSE connection established");
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
      "Access-Control-Allow-Headers": "Content-Type",
    });

    // Send a heartbeat every 30 seconds to keep the connection alive
    const heartbeatInterval = setInterval(() => {
      res.write("event: heartbeat\ndata: ping\n\n");
    }, 30000); // Function to send SSE events
    const sendEvent = (event: string, data: Record<string, unknown>) => {
      logHttpToFile(
        `[HTTP Server] Sending ${event} event: ${JSON.stringify(data)}`
      );
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Send initial connection confirmation
    sendEvent("connected", { message: "Connected to TldrawServer" }); // Listen for tldraw operations and forward them to the client
    const operationListener = (operation: TldrawOperation) => {
      logHttpToFile(
        `[HTTP Server] Received operation from EventBus: ${JSON.stringify(
          operation
        )}`
      );
      sendEvent("tldraw-operation", operation);
    };

    // Register event listener
    eventBus.on("tldraw-operation", operationListener); // Handle client disconnect
    req.on("close", () => {
      clearInterval(heartbeatInterval);
      eventBus.off("tldraw-operation", operationListener);
      logHttpToFile("[HTTP Server] Client disconnected from SSE");
    });
  } // for snapshot endpoint
  else if (req.url === "/api/snapshot" && req.method === "POST") {
    logHttpToFile("[HTTP Server] Received snapshot POST request");
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        const { requestId, snapshot } = data;
        logHttpToFile(
          `[HTTP Server] Processing snapshot with requestId: ${requestId}`
        );
        logHttpToFile(
          `[HTTP Server] Snapshot size: ${
            JSON.stringify(snapshot).length
          } bytes`
        );

        eventBus.emit("snapshot-response", {
          type: "snapshotResponse",
          payload: { requestId, snapshot },
        });

        logHttpToFile(`[HTTP Server] Emitted snapshot-response event`);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        logHttpToFile(`[HTTP Server] Error processing snapshot: ${error}`);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "Failed to process snapshot",
          })
        );
      }
    });
  } else {
    logHttpToFile(`[HTTP Server] Unknown endpoint: ${req.url}`);
    res.writeHead(404);
    res.end("Not found");
  }
});

httpServer.listen(3002, () => {
  logHttpToFile("[HTTP Server] HTTP Server running on port 3002");
  logHttpToFile(
    `[HTTP Server] EventBus listeners: ${eventBus.listenerCount(
      "tldraw-operation"
    )}`
  );

  // Add listener to log operations (useful for debugging)
  eventBus.on("tldraw-operation", (operation) => {
    logHttpToFile(
      `[HTTP Server] EventBus operation: ${JSON.stringify(operation)}`
    );
    logHttpToFile(
      `[HTTP Server] Current listeners: ${eventBus.listenerCount(
        "tldraw-operation"
      )}`
    );
  });
});

httpServer.on("error", (error) => {
  logHttpToFile(`[HTTP Server] Failed to start: ${String(error)}`);
  process.exit(1);
});

const transport = new StdioServerTransport();
await server.connect(transport);
