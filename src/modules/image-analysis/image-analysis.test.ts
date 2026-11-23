import { describe, expect, it } from "vitest";
import { validateImageFile, MAX_IMAGE_BYTES } from "./types";
import { parseVisionOutput } from "./visionPrompt";

describe("image validation", () => {
  it("accepts jpeg/png/webp within size", () => {
    expect(validateImageFile("image/png", 1024).ok).toBe(true);
    expect(validateImageFile("image/jpeg", MAX_IMAGE_BYTES).ok).toBe(true);
  });

  it("rejects unsupported mime", () => {
    const r = validateImageFile("image/gif", 100);
    expect(r.ok).toBe(false);
  });

  it("rejects oversized and empty", () => {
    expect(validateImageFile("image/png", MAX_IMAGE_BYTES + 1).ok).toBe(false);
    expect(validateImageFile("image/png", 0).ok).toBe(false);
  });
});

describe("vision output parsing", () => {
  const validOutput = {
    description: "Tam giác ABC vuông tại A",
    facts: [
      {
        id: "fact_1",
        statement: "Góc A vuông",
        sourceType: "diagram_marking",
        confidence: 0.9,
        confirmed: true, // model không được set confirmed — parser phải ép false
      },
    ],
    warnings: [],
  };

  it("parses valid output and forces confirmed=false", () => {
    const r = parseVisionOutput(validOutput);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.facts[0].confirmed).toBe(false);
      expect(r.result.description).toContain("Tam giác");
    }
  });

  it("rejects malformed output", () => {
    const r = parseVisionOutput({ foo: "bar" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("AI_INVALID_OUTPUT");
  });

  it("rejects facts with invalid sourceType", () => {
    const r = parseVisionOutput({
      description: "x",
      facts: [{ id: "f1", statement: "s", sourceType: "guess", confirmed: false }],
      warnings: [],
    });
    expect(r.ok).toBe(false);
  });
});
