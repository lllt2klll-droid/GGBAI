import { compileCommand } from "./commandRegistry";
import type { GGBApi, GGBAppletInstance, GGBAppletParams } from "./ggbTypes";
import {
  GeoGebraError,
  type CommandResult,
  type GeoGebraAdapter,
  type GeoGebraEvent,
  type GeoGebraEventListener,
  type GeoGebraSnapshot,
  type SafeGeoGebraCommand,
} from "./types";

const DEPLOY_SCRIPT_URL = "https://www.geogebra.org/apps/deployggb.js";
const COMMAND_TIMEOUT_MS = 10_000;

let scriptLoadPromise: Promise<void> | null = null;

function loadDeployScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new GeoGebraError("APPLET_LOAD_FAILED", "No window"));
  }
  if (window.GGBApplet) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${DEPLOY_SCRIPT_URL}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new GeoGebraError("APPLET_LOAD_FAILED", "deployggb.js load error")),
      );
      return;
    }
    const script = document.createElement("script");
    script.src = DEPLOY_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new GeoGebraError("APPLET_LOAD_FAILED", "deployggb.js load error"));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

export type GeoGebraWebAdapterOptions = {
  appName?: "geometry" | "graphing" | "3d" | "classic";
  width?: number;
  height?: number;
  showToolBar?: boolean;
  showAlgebraInput?: boolean;
  showMenuBar?: boolean;
  extraParams?: Record<string, unknown>;
};

/**
 * Adapter chạy GeoGebra Apps (deployggb.js) trong browser.
 * - Command chỉ đi qua allowlist registry, không raw string.
 * - Command queue tuần tự, có timeout.
 * - Lifecycle guard chống duplicate applet (React Strict Mode).
 */
export class GeoGebraWebAdapter implements GeoGebraAdapter {
  private api: GGBApi | null = null;
  private applet: GGBAppletInstance | null = null;
  private container: HTMLElement | null = null;
  private elementId: string | null = null;
  private readyPromise: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<GeoGebraEventListener>();
  private apiListenerIds: number[] = [];
  private destroyed = false;
  private resizeObserver: ResizeObserver | null = null;
  private resizeRaf: number | null = null;
  private windowResizeHandler: (() => void) | null = null;

  constructor(private readonly options: GeoGebraWebAdapterOptions = {}) {}

  isReady(): boolean {
    return this.api !== null;
  }

  async initialize(container: HTMLElement): Promise<void> {
    if (this.api) return;
    if (this.readyPromise) return this.readyPromise;

    this.container = container;

    this.readyPromise = (async () => {
      await loadDeployScript();
      if (this.destroyed) throw new GeoGebraError("APPLET_LOAD_FAILED", "Destroyed");
      const GGBApplet = window.GGBApplet;
      if (!GGBApplet) {
        throw new GeoGebraError("APPLET_LOAD_FAILED", "GGBApplet undefined");
      }

      const rect = container.getBoundingClientRect();
      const initialW = Math.max(Math.floor(rect.width || container.clientWidth || 800), 300);
      const initialH = Math.max(Math.floor(rect.height || container.clientHeight || 600), 300);

      const params: GGBAppletParams = {
        appName: this.options.appName ?? "geometry",
        width: this.options.width ?? initialW,
        height: this.options.height ?? initialH,
        // Không dùng scaleContainerClass vì nó scale bằng CSS transform (giữ tỷ lệ aspect ratio cố định gây dải trắng).
        // Dùng setSize(w, h) + ResizeObserver để applet fill 100% diện tích container.
        autoHeight: false,
        allowStyleBar: true,
        showToolBar: this.options.showToolBar ?? true,
        showAlgebraInput: this.options.showAlgebraInput ?? true,
        showMenuBar: this.options.showMenuBar ?? false,
        enableShiftDragZoom: true,
        borderColor: "transparent",
        language: "vi",
        useBrowserForJS: true,
        showResetIcon: false,
        enableRightClick: true,
        errorDialogsActive: false,
        ...this.options.extraParams,
        appletOnLoad: (api) => {
          this.api = api;
          this.bindApiListeners();
          this.applyResponsiveSize();
          this.setupResizeObserver();
          // Gọi bổ sung sau khi GeoGebra dựng xong toàn bộ DOM thanh công cụ
          setTimeout(() => this.applyResponsiveSize(), 150);
          setTimeout(() => this.applyResponsiveSize(), 400);
        },
      };

      const elementId = `ggb-${Math.random().toString(36).slice(2, 10)}`;
      this.elementId = elementId;
      const holder = document.createElement("div");
      holder.id = elementId;
      holder.style.width = "100%";
      holder.style.height = "100%";
      holder.style.position = "absolute";
      holder.style.inset = "0";
      holder.style.overflow = "hidden";
      container.appendChild(holder);

      this.applet = new GGBApplet(params, true);
      this.applet.inject(elementId);

      // Fallback nếu appletOnLoad không được gọi: poll getAPI
      const deadline = Date.now() + 30_000;
      while (!this.api && Date.now() < deadline) {
        const api = this.applet.getAPI?.();
        if (api) {
          this.api = api;
          this.bindApiListeners();
          this.applyResponsiveSize();
          this.setupResizeObserver();
          setTimeout(() => this.applyResponsiveSize(), 150);
          setTimeout(() => this.applyResponsiveSize(), 400);
          break;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      if (!this.api) {
        throw new GeoGebraError("APPLET_LOAD_FAILED", "Applet ready timeout");
      }
    })();

    try {
      await this.readyPromise;
    } catch (err) {
      this.readyPromise = null;
      throw err;
    }
  }

  private requireApi(): GGBApi {
    if (!this.api) {
      throw new GeoGebraError("APPLET_NOT_READY", "GeoGebra applet not ready");
    }
    return this.api;
  }

  async executeCommand(command: SafeGeoGebraCommand): Promise<CommandResult> {
    const run = this.queue.then(() => this.runCommand(command));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async runCommand(command: SafeGeoGebraCommand): Promise<CommandResult> {
    const api = this.requireApi();
    let input: string;
    try {
      input = compileCommand(command);
    } catch (err) {
      return {
        operationId: command.operationId,
        success: false,
        error: err instanceof Error ? err.message : "Compile failed",
      };
    }

    const ok = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), COMMAND_TIMEOUT_MS);
      try {
        const result = api.evalCommand(input);
        clearTimeout(timer);
        resolve(result !== false);
      } catch {
        clearTimeout(timer);
        resolve(false);
      }
    });

    let labels: string[] | undefined;
    if (ok && api.evalCommandGetLabels) {
      try {
        const raw = api.evalCommandGetLabels(input);
        labels = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
      } catch {
        labels = undefined;
      }
    }

    if (ok) {
      this.emit({ type: "add" });
    }

    return {
      operationId: command.operationId,
      success: ok,
      labels,
      error: ok ? undefined : `evalCommand rejected: ${input}`,
    };
  }

  async getObjectNames(): Promise<string[]> {
    const api = this.requireApi();
    if (!api.getAllObjectNames) {
      throw new GeoGebraError(
        "UNSUPPORTED_API_CAPABILITY",
        "getAllObjectNames not available",
      );
    }
    return api.getAllObjectNames() ?? [];
  }

  async isDefined(name: string): Promise<boolean> {
    const api = this.requireApi();
    if (!api.isDefined) return false;
    try {
      return api.isDefined(name);
    } catch {
      return false;
    }
  }

  async getObjectType(name: string): Promise<string | null> {
    const api = this.requireApi();
    if (!api.getObjectType) return null;
    try {
      return api.getObjectType(name) ?? null;
    } catch {
      return null;
    }
  }

  async getObjectValue(name: string): Promise<string | null> {
    const api = this.requireApi();
    if (!api.getValue) return null;
    try {
      return api.getValue(name) ?? null;
    } catch {
      return null;
    }
  }

  async deleteObject(name: string): Promise<boolean> {
    const api = this.requireApi();
    if (!api.deleteObject) {
      throw new GeoGebraError(
        "UNSUPPORTED_API_CAPABILITY",
        "deleteObject not available",
      );
    }
    try {
      api.deleteObject(name);
      this.emit({ type: "remove", objectName: name });
      return true;
    } catch {
      return false;
    }
  }

  async setPointCoords(name: string, x: number, y: number): Promise<boolean> {
    const api = this.requireApi();
    if (!api.setCoords) {
      throw new GeoGebraError("UNSUPPORTED_API_CAPABILITY", "setCoords not available");
    }
    try {
      api.setCoords(name, x, y);
      this.emit({ type: "update", objectName: name });
      return true;
    } catch {
      return false;
    }
  }

  async setObjectColor(name: string, hex: string): Promise<boolean> {
    const api = this.requireApi();
    if (!api.setColor) {
      throw new GeoGebraError("UNSUPPORTED_API_CAPABILITY", "setColor not available");
    }
    const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
    if (!m) return false;
    const n = parseInt(m[1], 16);
    try {
      api.setColor(name, (n >> 16) & 255, (n >> 8) & 255, n & 255);
      this.emit({ type: "update", objectName: name });
      return true;
    } catch {
      return false;
    }
  }

  async setObjectVisible(name: string, visible: boolean): Promise<boolean> {
    const api = this.requireApi();
    if (!api.setVisible) {
      throw new GeoGebraError("UNSUPPORTED_API_CAPABILITY", "setVisible not available");
    }
    try {
      api.setVisible(name, visible);
      this.emit({ type: "update", objectName: name });
      return true;
    } catch {
      return false;
    }
  }

  async setLabelVisible(name: string, visible: boolean): Promise<boolean> {
    const api = this.requireApi();
    if (!api.setLabelVisible) {
      return false;
    }
    try {
      api.setLabelVisible(name, visible);
      this.emit({ type: "update", objectName: name });
      return true;
    } catch {
      return false;
    }
  }

  async renameObject(oldName: string, newName: string): Promise<boolean> {
    const api = this.requireApi();
    if (api.renameObject) {
      try {
        const ok = api.renameObject(oldName, newName);
        if (ok !== false) {
          this.emit({ type: "update", objectName: newName });
          return true;
        }
      } catch {
        // fallback
      }
    }
    // Fallback: evalCommand
    try {
      const ok = api.evalCommand(`Rename(${oldName}, ${newName})`);
      if (ok !== false) {
        this.emit({ type: "update", objectName: newName });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async selectObject(name: string | null): Promise<boolean> {
    const api = this.api;
    if (!api) return false;
    try {
      if (!name) {
        return api.evalCommand("SelectObjects()");
      }
      return api.evalCommand(`SelectObjects(${name})`);
    } catch {
      return false;
    }
  }

  async exportSnapshot(): Promise<GeoGebraSnapshot> {
    const api = this.requireApi();
    if (!api.getBase64) {
      throw new GeoGebraError(
        "UNSUPPORTED_API_CAPABILITY",
        "getBase64 not available",
      );
    }
    try {
      const data = api.getBase64();
      return { format: "ggb-base64", data, capturedAt: new Date().toISOString() };
    } catch (err) {
      throw new GeoGebraError(
        "EXPORT_FAILED",
        err instanceof Error ? err.message : "Export failed",
      );
    }
  }

  async loadSnapshot(snapshot: GeoGebraSnapshot): Promise<void> {
    const api = this.requireApi();
    if (snapshot.format !== "ggb-base64" || !api.setBase64) {
      throw new GeoGebraError(
        "UNSUPPORTED_API_CAPABILITY",
        `Cannot load snapshot format: ${snapshot.format}`,
      );
    }
    try {
      const ok = api.setBase64(snapshot.data);
      if (!ok) throw new Error("setBase64 returned false");
    } catch (err) {
      throw new GeoGebraError(
        "RESTORE_FAILED",
        err instanceof Error ? err.message : "Restore failed",
      );
    }
  }

  async exportImage(
    format: "png" | "svg" | "jpg",
    scale = 2,
  ): Promise<{ ok: boolean; error?: string }> {
    const api = this.requireApi();
    if (!api.exportImage) {
      return { ok: false, error: "exportImage not available" };
    }
    try {
      api.exportImage("construction", format, scale, 300, false, false);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Export image failed",
      };
    }
  }

  subscribe(listener: GeoGebraEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: GeoGebraEvent) {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch {
        // listener lỗi không được làm hỏng adapter
      }
    }
  }

  private bindApiListeners() {
    const api = this.api;
    if (!api) return;
    const bind = (
      register: ((fn: (name: string) => void) => number) | undefined,
      type: GeoGebraEvent["type"],
    ) => {
      if (!register) return;
      try {
        const id = register.call(api, (name: string) =>
          this.emit({ type, objectName: name }),
        );
        this.apiListenerIds.push(id);
      } catch {
        // một số app có thể không hỗ trợ listener — bỏ qua
      }
    };
    bind(api.registerAddListener?.bind(api), "add");
    bind(api.registerRemoveListener?.bind(api), "remove");
    bind(api.registerObjectUpdateListener?.bind(api), "update");
  }

  resize(width: number, height: number): void {
    if (this.api?.setSize) {
      try {
        this.api.setSize(width, height);
        this.api.recalculateEnvironments?.();
      } catch {
        // ignore
      }
    }
  }

  setStandardView(): void {
    if (this.api?.setStandardView) {
      try {
        this.api.setStandardView();
      } catch {
        // ignore
      }
    }
  }

  private applyResponsiveSize() {
    if (!this.api || !this.container) return;
    const rect = this.container.getBoundingClientRect();
    const w = Math.floor(rect.width || this.container.clientWidth);
    const h = Math.floor(rect.height || this.container.clientHeight);
    if (w > 50 && h > 50) {
      if (this.api.setSize) {
        try {
          this.api.setSize(w, h);
          this.api.recalculateEnvironments?.();
        } catch {
          // ignore
        }
      }
    }
  }

  private setupResizeObserver() {
    if (!this.container) return;

    const onResize = () => {
      if (this.resizeRaf !== null) {
        cancelAnimationFrame(this.resizeRaf);
      }
      this.resizeRaf = requestAnimationFrame(() => {
        this.resizeRaf = null;
        this.applyResponsiveSize();
      });
    };

    if (typeof ResizeObserver !== "undefined") {
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
      }
      this.resizeObserver = new ResizeObserver(onResize);
      this.resizeObserver.observe(this.container);
    }

    if (typeof window !== "undefined") {
      if (this.windowResizeHandler) {
        window.removeEventListener("resize", this.windowResizeHandler);
      }
      this.windowResizeHandler = onResize;
      window.addEventListener("resize", this.windowResizeHandler);
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.resizeRaf !== null) {
      cancelAnimationFrame(this.resizeRaf);
      this.resizeRaf = null;
    }
    if (this.windowResizeHandler && typeof window !== "undefined") {
      window.removeEventListener("resize", this.windowResizeHandler);
      this.windowResizeHandler = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    const api = this.api;
    if (api?.unregisterListener) {
      for (const id of this.apiListenerIds) {
        try {
          api.unregisterListener(id);
        } catch {
          // ignore
        }
      }
    }
    this.apiListenerIds = [];
    this.listeners.clear();
    this.api = null;
    this.applet = null;
    if (this.container) {
      this.container.innerHTML = "";
    }
    this.container = null;
    this.elementId = null;
    this.readyPromise = null;
    this.queue = Promise.resolve();
  }
}
