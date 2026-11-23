import type {
  GeoGebraAdapter,
  GeoGebraSnapshot,
  SafeGeoGebraCommand,
} from "./types";

/**
 * Command history cho undo/redo — 2 loại entry:
 * 1. command batch: undo = xóa object đã tạo, redo = chạy lại commands.
 * 2. snapshot pair: undo/redo = loadSnapshot(before/after) — dùng cho
 *    edit operations (move/delete/color) không phải command batch.
 */

export type CommandBatchEntry = {
  kind?: "commands";
  commands: SafeGeoGebraCommand[];
  createdNames: string[];
  label: string;
};

export type SnapshotEntry = {
  kind: "snapshot";
  before: GeoGebraSnapshot;
  after: GeoGebraSnapshot;
  label: string;
};

export type HistoryEntry = CommandBatchEntry | SnapshotEntry;

export class CommandHistory {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private readonly maxSize = 50;
  /** Tổng byte snapshot tối đa giữ trong memory (~8MB base64). */
  private readonly maxSnapshotBytes: number;

  constructor(maxSnapshotBytes = 8 * 1024 * 1024) {
    this.maxSnapshotBytes = maxSnapshotBytes;
  }

  push(entry: HistoryEntry) {
    this.undoStack.push(entry);
    if (this.undoStack.length > this.maxSize) this.undoStack.shift();
    this.pruneSnapshots();
    this.redoStack = [];
  }

  /** Loại snapshot entry cũ nhất khi tổng kích thước vượt giới hạn. */
  private pruneSnapshots() {
    const sizeOf = (e: HistoryEntry) =>
      e.kind === "snapshot" ? e.before.data.length + e.after.data.length : 0;
    let total = this.undoStack.reduce((s, e) => s + sizeOf(e), 0);
    while (total > this.maxSnapshotBytes) {
      const idx = this.undoStack.findIndex((e) => e.kind === "snapshot");
      if (idx === -1) break;
      total -= sizeOf(this.undoStack[idx]);
      this.undoStack.splice(idx, 1);
    }
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  async undo(adapter: GeoGebraAdapter): Promise<boolean> {
    const entry = this.undoStack.pop();
    if (!entry) return false;

    if (entry.kind === "snapshot") {
      try {
        await adapter.loadSnapshot(entry.before);
      } catch {
        this.undoStack.push(entry);
        return false;
      }
      this.redoStack.push(entry);
      return true;
    }

    for (const name of [...entry.createdNames].reverse()) {
      try {
        await adapter.deleteObject(name);
      } catch {
        // object có thể đã bị xóa — bỏ qua
      }
    }
    this.redoStack.push(entry);
    return true;
  }

  async redo(adapter: GeoGebraAdapter): Promise<boolean> {
    const entry = this.redoStack.pop();
    if (!entry) return false;

    if (entry.kind === "snapshot") {
      try {
        await adapter.loadSnapshot(entry.after);
      } catch {
        this.redoStack.push(entry);
        return false;
      }
      this.undoStack.push(entry);
      return true;
    }

    for (const cmd of entry.commands) {
      const result = await adapter.executeCommand(cmd);
      if (!result.success) {
        this.undoStack.push(entry);
        return false;
      }
    }
    this.undoStack.push(entry);
    return true;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}
