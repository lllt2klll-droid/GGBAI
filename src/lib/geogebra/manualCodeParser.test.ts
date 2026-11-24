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

  it("parses 3D script lines and shapes", () => {
    const script3D = `
      A = (0, 0, 0)
      B = (3, 0, 0)
      C = (0, 3, 0)
      S = (0, 0, 4)
      ABC = Polygon(A, B, C)
      SABC = Pyramid(ABC, S)
      sph = Sphere(A, 3)
      cb = Cube(A, B)
    `;

    const result = parseManualCode(script3D);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.commands.length).toBe(8);
      expect(result.commands[0]).toMatchObject({ commandKey: "point", args: { label: "A", x: 0, y: 0, z: 0 } });
      expect(result.commands[3]).toMatchObject({ commandKey: "point", args: { label: "S", x: 0, y: 0, z: 4 } });
      expect(result.commands[5]).toMatchObject({ commandKey: "pyramid", args: { label: "SABC", bottom: "ABC", top: "S" } });
      expect(result.commands[6]).toMatchObject({ commandKey: "sphere", args: { label: "sph", center: "A", radius: 3 } });
      expect(result.commands[7]).toMatchObject({ commandKey: "cube", args: { label: "cb", p1: "A", p2: "B" } });
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

  it("parses extended geometry commands in script format", () => {
    const script = `
      A = (0, 0)
      B = (3, 0)
      C = (0, 4)
      u = Vector(A, B)
      alpha = Angle(B, A, C)
      t = Tangent(B, c)
      G = Centroid(ABC)
      O = Circumcenter(A, B, C)
      H = Orthocenter(A, B, C)
      I = Incenter(A, B, C)
      c_ext = Circumcircle(A, B, C)
      c_in = Incircle(A, B, C)
    `;

    const result = parseManualCode(script);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.commands.length).toBe(12);
      expect(result.commands[3].commandKey).toBe("vector");
      expect(result.commands[4].commandKey).toBe("angle");
      expect(result.commands[5].commandKey).toBe("tangent");
      expect(result.commands[6].commandKey).toBe("centroid");
      expect(result.commands[7].commandKey).toBe("circumcenter");
      expect(result.commands[8].commandKey).toBe("orthocenter");
      expect(result.commands[9].commandKey).toBe("incenter");
      expect(result.commands[10].commandKey).toBe("circumcircle");
      expect(result.commands[11].commandKey).toBe("incircle");
    }
  });

  it("parses full circle + tangent script with styling commands", () => {
    const script = `
      // comment line
      A = (-5, 0)
      B = (5, 0)
      O = Midpoint(A, B)
      c = Circle(O, A)
      C = (-1.4, 4.8)
      tC = Tangent(C, c)
      M = Intersect(tC, c)
      hAB = Line(A, B)
      H = OrthogonalProjection(C, hAB)
      dAM = Line(A, M)
      E = Intersect(dAM, c, 2)
      Segment(A, B)
      SetColor(c, 0, 0.35, 0.9)
      SetLineThickness(c, 4)
      ShowLabel(A, true)
      ZoomIn(-7, -2, 8, 8)
    `;

    const result = parseManualCode(script);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const keys = result.commands.map((c) => c.commandKey);
      expect(keys).toContain("orthogonal_projection");
      expect(keys).toContain("set_color");
      expect(keys).toContain("set_line_thickness");
      expect(keys).toContain("show_label");
      expect(keys).toContain("zoom_in");
      const interE = result.commands.find((c) => c.args.label === "E");
      expect(interE).toMatchObject({ commandKey: "intersection", args: { o1: "dAM", o2: "c", index: 2 } });
      const colorC = result.commands.find((c) => c.commandKey === "set_color");
      expect(colorC?.args).toMatchObject({ obj: "c", r: 0, g: 0.35, b: 0.9 });
    }
  });

  it("parses bracket syntax, function def, and 3-point circle", () => {
    const script = `
      A = (0, 0)
      B = (4, 0)
      C = (2, 3)
      f(x) = x^2
      P = Intersect[Line(A, B), Line(B, C)]
      cc = Circle[A, B, C]
      rp = RegularPolygon(A, B, 6)
      d = Derivative(f)
      r = Root(f, -5, 5)
    `;

    const result = parseManualCode(script);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const keys = result.commands.map((c) => c.commandKey);
      expect(keys).toContain("function");
      expect(keys).toContain("intersection");
      expect(keys).toContain("circumcircle");
      expect(keys).toContain("regular_polygon");
      expect(keys).toContain("derivative");
      expect(keys).toContain("root");
      const fn = result.commands.find((c) => c.commandKey === "function");
      expect(fn?.args).toMatchObject({ name: "f", var: "x", expr: "x^2" });
    }
  });

  it("returns error on invalid input", () => {
    const result = parseManualCode("InvalidUnknownCommand(xyz)");
    expect(result.ok).toBe(false);
  });
});
