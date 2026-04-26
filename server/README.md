# Tldraw MCP Server

This is the MCP server component for the tldraw-Claude integration. It handles communication with Claude Desktop through the Model Context Protocol (MCP) and provides an HTTP server for Server-Sent Events (SSE) to communicate with the frontend.

## System Architecture

This server consists of two main components:

1. **MCP Server (index.ts)**: Handles function calls from Claude via stdin/stdout
2. **HTTP/SSE bridge (index.ts)**: Provides SSE endpoints for frontend communication

These components run in the same Node process and communicate through an
in-memory EventBus that manages event propagation.

## Getting Started

### Prerequisites

- Node.js 18+ installed
- TypeScript installed globally (`npm install -g typescript`)

### Installation

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Build the TypeScript code:

   ```powershell
   npm run build
   ```

### Running the Servers

For Claude Desktop, configure Claude to run the compiled `dist/index.js` file;
Claude Desktop owns the MCP stdio process and the HTTP/SSE bridge starts inside
that same process.

For a manual smoke test, run the combined server process:

```powershell
npm start
```

This starts the MCP server that communicates with Claude Desktop and the HTTP
server on port 3002 that handles SSE communication with the frontend. Do not
leave this running while Claude Desktop is also configured to start the MCP
server, because the second process will conflict on port 3002.

### Development Mode

For development with automatic restarts:

```powershell
# For the combined MCP/HTTP server
npm run dev
```

## Claude Desktop Configuration

To connect Claude Desktop to this MCP server, add the following to your Claude Desktop configuration file (typically located at `%AppData%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "tldrawserver": {
      "command": "node",
      "args": ["PATH_TO_COMPILED_JS_FILE"]
    }
  }
}
```

Replace `PATH_TO_COMPILED_JS_FILE` with the absolute path to the compiled JavaScript file, e.g., `D:\\tldraw-mcp\\server\\dist\\index.js`.

## Development

For development with automatic restarts:

```powershell
# For the combined MCP/HTTP server
npm run dev
```

## NPM Scripts

- **npm run build**: Compiles TypeScript code into JavaScript in the `dist` folder
- **npm start**: Starts the combined MCP/HTTP server
- **npm run dev**: Starts the combined MCP/HTTP server with automatic restarts

## Architecture

- **MCP Server (index.ts)**: Handles function calls from Claude via stdin/stdout
- **HTTP/SSE bridge (index.ts)**: Provides SSE endpoints for frontend communication
- **EventBus**: Manages internal event propagation and provides type-safe communication

## Architecture

### Component Overview

1. **MCP Server (index.ts)**

   - Handles function calls from Claude via stdin/stdout
   - Defines available tools that Claude can use
   - Sends and receives operations through the EventBus

2. **HTTP/SSE bridge (index.ts)**

   - Provides SSE endpoints for frontend communication
   - Listens on port 3002
   - Forwards operations from EventBus to connected clients
   - Receives snapshot data from frontend

3. **EventBus (eventBus.ts)**
   - Manages internal event propagation
   - Provides type-safe communication between components
   - Handles event subscription and broadcasting

### Communication Flow

```mermaid
graph TD
    Claude[Claude Desktop] <--> MCP[MCP Server]
    MCP <--> EventBus[EventBus]
    EventBus <--> HTTP[HTTP Server]
    HTTP <--> Next[Next.js Frontend]
    Next <--> Tldraw[Tldraw Canvas]
```

### Sequence Diagram for Operations

```
Claude → MCP Server → EventBus → HTTP Server → Next.js → Tldraw Canvas
```

### Sequence Diagram for Snapshots

```
Claude → MCP Server → EventBus → HTTP Server → Next.js → Tldraw Canvas
Tldraw Canvas → Next.js → HTTP Server → EventBus → MCP Server → Claude
```

## Type Safety

The server implements TypeScript interfaces for all message types to ensure type safety across the application:

```typescript
// Example payload types in eventBus.ts
export interface TldrawShapePayload {
  shapeType: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
}

export interface TldrawConnectPayload {
  fromId: string;
  toId: string;
  arrowType?: "straight" | "curved" | "orthogonal";
}
```

## Debugging

### Logging

The system includes extensive logging to help diagnose issues:

- **EventBus logs:** Show operations being broadcast
- **HTTP Server logs:** Show incoming/outgoing connections and events
- **MCP Server logs:** Show function calls from Claude

### Common Issues

1. **Type errors:** If you encounter "any" type errors, check the interface definitions in `eventBus.ts`
2. **Event handling:** Make sure event names match between components (`tldraw-operation`, `snapshot-response`, etc.)
3. **Port conflicts:** If port 3002 is already in use, modify the port in `index.ts` and update the API routes

## Development Tips

1. Use the development scripts for automatic reloading during development
2. Keep the browser console open to monitor event flow
3. Test each operation type individually before complex scenarios
4. Check Claude Desktop logs if MCP communication isn't working
