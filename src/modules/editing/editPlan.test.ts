import { describe, expect, it } from "vitest";
import { editPlanSchema } from "./editPlan";
import { parseEditOutput } from "./editPrompt";

describe("EditPlan schema", () => {
  it("accepts valid plan", () => {
    const r = editPlanSchema.safeParse({
      summary: "Đổi màu AB",
      operations: [{ type: "set_color", target: "AB", color: "#dc2626" }],
      requiresConfirmation: false,
    });
    expect(r.success).toBe(true);
  });

  it("rejects invalid color format", () => {
    const r = editPlanSchema.safeParse({
      summary: "x",
      operations: [{ type: "set_color", target: "A", color: "red" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty operations", () => {
    const r = editPlanSchema.safeParse({ summary: "x", operations: [] });
    expect(r.success).toBe(false);
  });
});

describe("parseEditOutput", () => {
  it("handles not_an_edit", () => {
    const r = parseEditOutput({ not_an_edit: true, reason: "yêu cầu dựng mới" });
    expect(r.ok).toBe(false);
    if (!r.ok && "reason" in r) expect(r.reason).toContain("dựng");
  });

  it("parses valid plan and auto-confirms deletes", () => {
    const r = parseEditOutput({
      summary: "Xóa điểm phụ",
      operations: [{ type: "delete_object", target: "M", reason: "không cần" }],
      requiresConfirmation: false,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.requiresConfirmation).toBe(true);
  });

  it("rejects malformed output", () => {
    const r = parseEditOutput({ operations: "nope" });
    expect(r.ok).toBe(false);
    if (!r.ok && "message" in r) expect(r.code).toBe("AI_INVALID_OUTPUT");
  });
});
