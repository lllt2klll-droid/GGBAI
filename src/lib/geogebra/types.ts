/**
 * Abstraction của ứng dụng cho GeoGebra runtime.
 * Theo GEOGEBRA_INTEGRATION_SPEC.md — đây là interface nội bộ,
 * adapter ánh xạ sang GeoGebra Apps API đã xác minh.
 */

export type GeoGebraErrorCode =
  | "APPLET_NOT_READY"
  | "APPLET_LOAD_FAILED"
  | "COMMAND_REJECTED"
  | "OBJECT_NOT_DEFINED"
  | "EXPORT_FAILED"
  | "RESTORE_FAILED"
  | "UNSUPPORTED_API_CAPABILITY";

export class GeoGebraError extends Error {
  constructor(
    public readonly code: GeoGebraErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GeoGebraError";
  }
}

/** Command đã qua compiler/allowlist — không phải raw string từ AI/user. */
export type SafeGeoGebraCommand = {
  operationId: string;
  commandKey: string;
  args: Record<string, string | number | boolean | string[]>;
};

export type CommandResult = {
  operationId: string;
  success: boolean;
  labels?: string[];
  error?: string;
};

export type GeoGebraObjectSummary = {
  name: string;
  type?: string;
  defined?: boolean;
  value?: string | number;
};

export type GeoGebraSnapshot = {
  format: "ggb-base64" | "xml";
  data: string;
  capturedAt: string;
};

export type GeoGebraEventType = "add" | "remove" | "update";

export type GeoGebraEvent = {
  type: GeoGebraEventType;
  objectName?: string;
};

export type GeoGebraEventListener = (event: GeoGebraEvent) => void;

export interface GeoGebraAdapter {
  initialize(container: HTMLElement): Promise<void>;
  isReady(): boolean;
  executeCommand(command: SafeGeoGebraCommand): Promise<CommandResult>;
  getObjectNames(): Promise<string[]>;
  isDefined(name: string): Promise<boolean>;
  getObjectType(name: string): Promise<string | null>;
  getObjectValue(name: string): Promise<string | null>;
  deleteObject(name: string): Promise<boolean>;
  setPointCoords(name: string, x: number, y: number): Promise<boolean>;
  setObjectColor(name: string, hex: string): Promise<boolean>;
  setObjectVisible(name: string, visible: boolean): Promise<boolean>;
  exportSnapshot(): Promise<GeoGebraSnapshot>;
  loadSnapshot(snapshot: GeoGebraSnapshot): Promise<void>;
  /** Xuất ảnh canvas (PNG/SVG/JPG) qua GeoGebra exportImage. */
  exportImage?(
    format: "png" | "svg" | "jpg",
    scale?: number,
  ): Promise<{ ok: boolean; error?: string }>;
  subscribe(listener: GeoGebraEventListener): () => void;
  destroy(): void;
}
