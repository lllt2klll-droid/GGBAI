import { describe, expect, it } from "vitest";
import { parseEditCommand } from "./editCommands";

const NAMES = ["A", "B", "C", "AB", "M"];

describe("parseEditCommand", () => {
  it("parses delete", () => {
    const r = parseEditCommand("xóa A", NAMES);
    expect(r).toEqual({
      ok: true,
      operations: [{ type: "delete_object", target: "A" }],
    });
  });

  it("parses move point", () => {
    const r = parseEditCommand("di chuyển A đến (5, 3)", NAMES);
    expect(r).toEqual({
      ok: true,
      operations: [{ type: "move_point", target: "A", x: 5, y: 3 }],
    });
  });

  it("parses move without 'đến'", () => {
    const r = parseEditCommand("đặt B tại 1, -2", NAMES);
    expect(r?.ok).toBe(true);
    if (r?.ok) {
      expect(r.operations[0]).toMatchObject({ type: "move_point", x: 1, y: -2 });
    }
  });

  it("parses color change", () => {
    const r = parseEditCommand("đổi màu AB thành đỏ", NAMES);
    expect(r).toEqual({
      ok: true,
      operations: [{ type: "set_color", target: "AB", color: "#dc2626" }],
    });
  });

  it("parses hex color", () => {
    const r = parseEditCommand("tô màu C #00ff00", NAMES);
    expect(r?.ok).toBe(true);
    if (r?.ok) {
      expect(r.operations[0]).toMatchObject({ type: "set_color", color: "#00ff00" });
    }
  });

  it("parses hide/show", () => {
    const r = parseEditCommand("ẩn M", NAMES);
    expect(r).toEqual({
      ok: true,
      operations: [{ type: "set_visible", target: "M", visible: false }],
    });
    const r2 = parseEditCommand("hiện M", NAMES);
    expect(r2?.ok).toBe(true);
    if (r2?.ok) {
      expect(r2.operations[0]).toMatchObject({ type: "set_visible", visible: true });
    }
  });

  it("returns error for unknown object", () => {
    const r = parseEditCommand("xóa Z", NAMES);
    expect(r?.ok).toBe(false);
  });

  it("returns null for non-edit text", () => {
    expect(parseEditCommand("tam giác ABC vuông tại A", NAMES)).toBeNull();
    expect(parseEditCommand("vẽ đường tròn", NAMES)).toBeNull();
  });
});
