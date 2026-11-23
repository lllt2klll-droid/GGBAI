import { describe, expect, it } from "vitest";
import { CommandHistory } from "./commandHistory";
import type {
  CommandResult,
  GeoGebraAdapter,
  SafeGeoGebraCommand,
} from "./types";

function mockAdapter() {
  const deleted: string[] = [];
  const executed: string[] = [];
  const adapter: GeoGebraAdapter = {
    initialize: async () => {},
    isReady: () => true,
    executeCommand: async (cmd: SafeGeoGebraCommand): Promise<CommandResult> => {
      executed.push(cmd.commandKey);
      return { operationId: cmd.operationId, success: true, labels: ["X"] };
    },
    getObjectNames: async () => [],
    isDefined: async () => true,
    getObjectType: async () => "point",
    getObjectValue: async () => "1",
    deleteObject: async (name: string) => {
      deleted.push(name);
      return true;
    },
    setPointCoords: async () => true,
    setObjectColor: async () => true,
    setObjectVisible: async () => true,
    exportSnapshot: async () => ({ format: "ggb-base64", data: "", capturedAt: "" }),
    loadSnapshot: async () => {},
    subscribe: () => () => {},
    destroy: () => {},
  };
  return { adapter, deleted, executed };
}

const cmd = (key: string): SafeGeoGebraCommand => ({
  operationId: `op_${key}`,
  commandKey: key,
  args: {},
});

describe("CommandHistory", () => {
  it("undo deletes created objects in reverse order", async () => {
    const { adapter, deleted } = mockAdapter();
    const h = new CommandHistory();
    h.push({
      commands: [cmd("point"), cmd("segment")],
      createdNames: ["A", "B", "AB"],
      label: "test",
    });
    expect(h.canUndo()).toBe(true);
    await h.undo(adapter);
    expect(deleted).toEqual(["AB", "B", "A"]);
    expect(h.canRedo()).toBe(true);
  });

  it("redo re-executes commands", async () => {
    const { adapter, executed } = mockAdapter();
    const h = new CommandHistory();
    h.push({ commands: [cmd("point")], createdNames: ["A"], label: "t" });
    await h.undo(adapter);
    executed.length = 0;
    await h.redo(adapter);
    expect(executed).toEqual(["point"]);
  });

  it("new push clears redo stack", async () => {
    const { adapter } = mockAdapter();
    const h = new CommandHistory();
    h.push({ commands: [cmd("point")], createdNames: ["A"], label: "t" });
    await h.undo(adapter);
    h.push({ commands: [cmd("segment")], createdNames: ["S"], label: "t2" });
    expect(h.canRedo()).toBe(false);
  });

  it("undo on empty returns false", async () => {
    const { adapter } = mockAdapter();
    const h = new CommandHistory();
    expect(await h.undo(adapter)).toBe(false);
  });

  it("snapshot entry: undo loads before, redo loads after", async () => {
    const loaded: string[] = [];
    const { adapter } = mockAdapter();
    adapter.loadSnapshot = async (s) => {
      loaded.push(s.data);
    };
    const h = new CommandHistory();
    const before = { format: "ggb-base64" as const, data: "BEFORE", capturedAt: "" };
    const after = { format: "ggb-base64" as const, data: "AFTER", capturedAt: "" };
    h.push({ kind: "snapshot", before, after, label: "edit" });

    await h.undo(adapter);
    expect(loaded).toEqual(["BEFORE"]);
    await h.redo(adapter);
    expect(loaded).toEqual(["BEFORE", "AFTER"]);
  });

  it("prunes oldest snapshot entries when over size limit", async () => {
    const { adapter } = mockAdapter();
    const h = new CommandHistory(100); // 100 bytes limit
    const snap = (data: string) => ({
      kind: "snapshot" as const,
      before: { format: "ggb-base64" as const, data, capturedAt: "" },
      after: { format: "ggb-base64" as const, data, capturedAt: "" },
      label: "edit",
    });
    // mỗi entry ~60 bytes (30+30) → 2 entries = 120 > 100 → prune oldest
    h.push(snap("a".repeat(30)));
    h.push(snap("b".repeat(30)));
    h.push(snap("c".repeat(30)));
    // chỉ còn entries mới nhất vừa đủ
    expect(h.canUndo()).toBe(true);
    // undo lần lượt — entry cũ nhất phải đã bị prune
    await h.undo(adapter);
    await h.undo(adapter);
    expect(h.canUndo()).toBe(false);
  });
});
