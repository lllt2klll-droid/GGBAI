import { describe, expect, it } from "vitest";
import { parseManualCode } from "./manualCodeParser";

describe("parseManualCode", () => {
  it("parses GeometryDocument JSON from AI", () => {
    const aiJson = JSON.stringify({
      schemaVersion: "1.0",
      documentId: "doc_test",
      mode: "2d",
      objects: [
        {
          id: "pt_a",
          label: "A",
          kind: "point",
          definition: { coordinates: [0, 0], freedom: "fixed" },
          parents: [],
          visibility: "visible",
          provenance: "ai_generated",
        },
        {
          id: "pt_b",
          label: "B",
          kind: "point",
          definition: { coordinates: [4, 0], freedom: "fixed" },
          parents: [],
          visibility: "visible",
          provenance: "ai_generated",
        },
        {
          id: "seg_ab",
          label: "AB",
          kind: "segment",
          definition: {},
          parents: ["pt_a", "pt_b"],
          visibility: "visible",
          provenance: "ai_generated",
        },
      ],
    });

    const result = parseManualCode(aiJson);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("ir_json");
      expect(result.commands.length).toBe(3);
      expect(result.commands[0].commandKey).toBe("point");
      expect(result.commands[1].commandKey).toBe("point");
      expect(result.commands[2].commandKey).toBe("segment");
    }
  });

  it("parses GeoGebra script lines", () => {
    const script = `
      A = (0, 0)
      B = (4, 0)
      C = (2, 3)
      ABC = Polygon(A, B, C)
      M = Midpoint(A, B)
      c = Circle(M, 2)
    `;

    const result = parseManualCode(script);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("commands_script");
      expect(result.commands.length).toBe(6);
      expect(result.commands[0]).toMatchObject({ commandKey: "point", args: { label: "A", x: 0, y: 0 } });
      expect(result.commands[3]).toMatchObject({ commandKey: "polygon", args: { label: "ABC", vertices: "A,B,C" } });
      expect(result.commands[4]).toMatchObject({ commandKey: "midpoint", args: { label: "M", p1: "A", p2: "B" } });
      expect(result.commands[5]).toMatchObject({ commandKey: "circle", args: { label: "c", center: "M", radius: 2 } });
    }
  });

  it("parses operations JSON array", () => {
    const json = JSON.stringify([
      { commandKey: "point", args: { label: "O", x: 0, y: 0 } },
      { commandKey: "circle", args: { label: "c", center: "O", radius: 5 } },
    ]);

    const result = parseManualCode(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("plan_json");
      expect(result.commands.length).toBe(2);
    }
  });

  it("returns error on invalid input", () => {
    const result = parseManualCode("InvalidUnknownCommand(xyz)");
    expect(result.ok).toBe(false);
  });
});
