import { describe, expect, it } from "vitest";
import { handleTextToGeometry } from "./orchestrator";
import type { AIProvider, ProviderResult } from "./types";

function mockProvider(result: ProviderResult): AIProvider {
  return {
    name: "mock",
    generateGeometry: async () => result,
  };
}

const validIR = {
  schemaVersion: "1.0",
  documentId: "doc_test",
  mode: "2d",
  objects: [
    {
      id: "point_a",
      label: "A",
      kind: "point",
      definition: { coordinates: [0, 0], freedom: "fixed" },
      parents: [],
      visibility: "visible",
      provenance: "ai_generated",
    },
    {
      id: "point_b",
      label: "B",
      kind: "point",
      definition: { coordinates: [4, 0], freedom: "fixed" },
      parents: [],
      visibility: "visible",
      provenance: "ai_generated",
    },
    {
      id: "segment_ab",
      label: "AB",
      kind: "segment",
      definition: {},
      parents: ["point_a", "point_b"],
      visibility: "visible",
      provenance: "ai_generated",
    },
  ],
  constraints: [],
};

describe("AI orchestrator", () => {
  it("returns clarification for too-short prompt", async () => {
    const res = await handleTextToGeometry(
      { prompt: "hình" },
      mockProvider({ ok: true, raw: validIR }),
    );
    expect(res.status).toBe("needs_clarification");
  });

  it("returns clarification for empty-ish prompt", async () => {
    const res = await handleTextToGeometry(
      { prompt: "vẽ" },
      mockProvider({ ok: true, raw: validIR }),
    );
    expect(res.status).toBe("needs_clarification");
  });

  it("propagates provider error", async () => {
    const res = await handleTextToGeometry(
      { prompt: "tam giác ABC vuông tại A" },
      mockProvider({ ok: false, code: "AI_PROVIDER_ERROR", message: "boom" }),
    );
    expect(res.status).toBe("error");
    if (res.status === "error") expect(res.code).toBe("AI_PROVIDER_ERROR");
  });

  it("rejects invalid IR output", async () => {
    const res = await handleTextToGeometry(
      { prompt: "tam giác ABC vuông tại A" },
      mockProvider({ ok: true, raw: { hack: true } }),
    );
    expect(res.status).toBe("error");
    if (res.status === "error") expect(res.code).toBe("AI_INVALID_OUTPUT");
  });

  it("returns document + plan for valid IR", async () => {
    const res = await handleTextToGeometry(
      { prompt: "đoạn thẳng AB dài 4" },
      mockProvider({ ok: true, raw: validIR }),
    );
    expect(res.status).toBe("ok");
    if (res.status === "ok") {
      expect(res.plan.operations.length).toBe(3);
      expect(res.document.objects).toHaveLength(3);
    }
  });

  it("rejects oversized prompt", async () => {
    const res = await handleTextToGeometry(
      { prompt: "x".repeat(2001) },
      mockProvider({ ok: true, raw: validIR }),
    );
    expect(res.status).toBe("error");
    if (res.status === "error") expect(res.code).toBe("AI_REQUEST_TOO_LARGE");
  });
});
