import { EventEmitter } from "events";

export interface TldrawShapePayload {
  id?: string;
  shapeType: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  color?: string;
  fill?: string;
  dash?: string;
  size?: string;
  labelColor?: string;
}

export interface TldrawConnectPayload {
  fromId: string;
  toId: string;
  arrowType?: "straight" | "curved" | "orthogonal";
  color?: string;
  dash?: string;
  size?: string;
  arrowheadStart?: string;
  arrowheadEnd?: string;
}

export interface TldrawTextPayload {
  x: number;
  y: number;
  text: string;
  fontSize?: number;
  color?: string;
  size?: string;
}

export interface TldrawFlowchartStepPayload {
  stepNumber: number;
  title: string;
  description?: string;
  x: number;
  y: number;
  connectToPrevious?: boolean;
  color?: string;
  fill?: string;
  dash?: string;
  size?: string;
  labelColor?: string;
}

export interface TldrawStickyNotePayload {
  id?: string;
  x: number;
  y: number;
  text: string;
  color?: string;
  labelColor?: string;
  size?: string;
}

export interface TldrawCommentPayload {
  id?: string;
  targetId?: string;
  x?: number;
  y?: number;
  text: string;
  author?: string;
  status?: "open" | "resolved";
  color?: string;
}

export interface TldrawHighlightPayload {
  id?: string;
  targetId?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: string;
  size?: string;
}

export interface TldrawSnapshotRequestPayload {
  requestId: string;
}

export interface TldrawSnapshotResponsePayload {
  requestId: string;
  snapshot: Record<string, unknown>;
}

export type TldrawOperationPayload =
  | TldrawShapePayload
  | TldrawConnectPayload
  | TldrawTextPayload
  | TldrawFlowchartStepPayload
  | TldrawStickyNotePayload
  | TldrawCommentPayload
  | TldrawHighlightPayload
  | TldrawSnapshotRequestPayload
  | TldrawSnapshotResponsePayload
  | Record<string, unknown>;

export type TldrawOperation = {
  type: string;
  payload: TldrawOperationPayload;
};

// Create a standard event emitter for tldraw operations
export const eventBus = new EventEmitter();

// Helper function to broadcast tldraw operations
export function broadcastOperation(operation: TldrawOperation): void {
  eventBus.emit("tldraw-operation", operation);
}
