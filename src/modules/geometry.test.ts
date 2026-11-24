import { describe, expect, it } from "vitest";
import { validateGeometryDocument } from "./geometry-validator/validate";
import { compileGeometryDocument } from "./geometry-compiler/compile";
import { compileCommand, isAllowedCommandKey } from "@/lib/geogebra/commandRegistry";
import type { GeometryDocument } from "./geometry-ir";

function point(id: string, label: string, x: number, y: number) {
  return {
    id,
    label,
    kind: "point" as const,
    definition: { coordinates: [x, y] as [number, number], freedom: "fixed" as const },
    parents: [],
    visibility: "visible" as const,
    provenance: "ai_generated" as const,
  };
}

function validTriangleDoc(): GeometryDocument {
  return {
    schemaVersion: "1.0",
    documentId: "doc_triangle",
    mode: "2d",
    objects: [
      point("point_a", "A", 0, 0),
      point("point_b", "B", 4, 0),
      point("point_c", "C", 2, 3),
      {
        id: "triangle_abc",
        label: "ABC",
        kind: "triangle",
        definition: {},
        parents: ["point_a", "point_b", "point_c"],
        visibility: "visible",
        provenance: "ai_generated",
      },
      {
        id: "midpoint_m",
        label: "M",
        kind: "midpoint",
        definition: {},
        parents: ["point_a", "point_b"],
        visibility: "visible",
        provenance: "ai_generated",
      },
      {
        id: "segment_bc",
        label: "BC",
        kind: "segment",
        definition: {},
        parents: ["point_b", "point_c"],
        visibility: "visible",
        provenance: "ai_generated",
      },
      {
        id: "altitude_ah",
        label: "AH",
        kind: "perpendicular_line",
        definition: { a: "point_a", b: "segment_bc" },
        parents: [],
        visibility: "visible",
        provenance: "ai_generated",
      },
    ],
    constraints: [],
  } as GeometryDocument;
}

describe("Geometry IR schema", () => {
  it("accepts a valid document", () => {
    const result = validateGeometryDocument(validTriangleDoc());
    expect(result.valid).toBe(true);
    expect(result.document).not.toBeNull();
    expect(result.issues).toHaveLength(0);
  });

  it("rejects extra fields (strict)", () => {
    const doc = validTriangleDoc() as Record<string, unknown>;
    doc.hack = "eval(1)";
    const result = validateGeometryDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.issues[0].code).toBe("SCHEMA_INVALID");
  });

  it("rejects NaN coordinates", () => {
    const doc = validTriangleDoc();
    (doc.objects[0] as { definition: { coordinates: number[] } }).definition.coordinates = [
      Number.NaN,
      0,
    ];
    const result = validateGeometryDocument(doc);
    expect(result.valid).toBe(false);
  });

  it("rejects invalid object id", () => {
    const doc = validTriangleDoc();
    doc.objects[0].id = "Point A!";
    const result = validateGeometryDocument(doc);
    expect(result.valid).toBe(false);
  });
});

describe("Geometry validator", () => {
  it("detects missing references", () => {
    const doc = validTriangleDoc();
    doc.objects[3].parents = ["point_a", "point_b", "ghost_point"];
    const result = validateGeometryDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "MISSING_REFERENCE")).toBe(true);
  });

  it("detects circular dependency", () => {
    const doc = validTriangleDoc();
    // midpoint_m phụ thuộc point_a; tạo cycle bằng cách cho point_a phụ thuộc midpoint_m
    (doc.objects[0] as { parents: string[] }).parents = ["midpoint_m"];
    const result = validateGeometryDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "CIRCULAR_DEPENDENCY")).toBe(true);
  });

  it("detects degenerate collinear triangle", () => {
    const doc = validTriangleDoc();
    doc.objects[2] = point("point_c", "C", 3, 0); // C nằm trên AB
    const result = validateGeometryDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "DEGENERATE_GEOMETRY")).toBe(true);
  });

  it("detects duplicate ids", () => {
    const doc = validTriangleDoc();
    doc.objects.push(point("point_a", "A2", 9, 9));
    const result = validateGeometryDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "DUPLICATE_ID")).toBe(true);
  });
});

describe("Geometry compiler", () => {
  it("orders operations topologically (points before dependents)", () => {
    const doc = validTriangleDoc();
    const plan = compileGeometryDocument(doc);
    const ids = plan.operations.map((o) => o.irObjectId);
    expect(ids.indexOf("point_a")).toBeLessThan(ids.indexOf("triangle_abc"));
    expect(ids.indexOf("segment_bc")).toBeLessThan(ids.indexOf("altitude_ah"));
    expect(ids.indexOf("point_b")).toBeLessThan(ids.indexOf("midpoint_m"));
  });

  it("maps labels to safe GeoGebra names", () => {
    const plan = compileGeometryDocument(validTriangleDoc());
    expect(plan.nameMap.point_a).toBe("A");
    expect(plan.nameMap.point_b).toBe("B");
    expect(plan.nameMap.midpoint_m).toBe("M");
  });

  it("produces allowlisted commandKeys only", () => {
    const plan = compileGeometryDocument(validTriangleDoc());
    for (const op of plan.operations) {
      expect(isAllowedCommandKey(op.commandKey)).toBe(true);
    }
  });

  it("compiles expected GeoGebra input strings", () => {
    const plan = compileGeometryDocument(validTriangleDoc());
    const byId = new Map(plan.operations.map((o) => [o.irObjectId, o]));

    const pointA = compileCommand({
      operationId: "t",
      commandKey: byId.get("point_a")!.commandKey,
      args: byId.get("point_a")!.args,
    });
    expect(pointA).toBe("A = (0, 0)");

    const tri = compileCommand({
      operationId: "t",
      commandKey: byId.get("triangle_abc")!.commandKey,
      args: byId.get("triangle_abc")!.args,
    });
    expect(tri).toBe("ABC = Polygon(A, B, C)");

    const mid = compileCommand({
      operationId: "t",
      commandKey: byId.get("midpoint_m")!.commandKey,
      args: byId.get("midpoint_m")!.args,
    });
    expect(mid).toBe("M = Midpoint(A, B)");

    const alt = compileCommand({
      operationId: "t",
      commandKey: byId.get("altitude_ah")!.commandKey,
      args: byId.get("altitude_ah")!.args,
    });
    expect(alt).toBe("AH = PerpendicularLine(A, BC)");
  });

  it("rejects unknown commandKey", () => {
    expect(() =>
      compileCommand({ operationId: "x", commandKey: "eval", args: {} }),
    ).toThrow(/allowlist/);
  });

  it("compiles newly added 2D & 3D geometric commands", () => {
    const doc: GeometryDocument = {
      schemaVersion: "1.0",
      documentId: "doc_extended",
      mode: "3d",
      objects: [
        point("point_a", "A", 0, 0),
        point("point_b", "B", 3, 0),
        point("point_c", "C", 0, 4),
        {
          id: "vec_u",
          label: "u",
          kind: "vector",
          definition: {},
          parents: ["point_a", "point_b"],
          visibility: "visible",
          provenance: "ai_generated",
        },
        {
          id: "ang_bac",
          label: "alpha",
          kind: "angle",
          definition: { vertex: "point_a", side1: "point_b", side2: "point_c" },
          parents: [],
          visibility: "visible",
          provenance: "ai_generated",
        },
        {
          id: "circle_c",
          label: "c1",
          kind: "circle",
          definition: { center: "point_a", radius: 5 },
          parents: [],
          visibility: "visible",
          provenance: "ai_generated",
        },
        {
          id: "tan_t",
          label: "t",
          kind: "tangent",
          definition: { a: "point_b", b: "circle_c" },
          parents: [],
          visibility: "visible",
          provenance: "ai_generated",
        },
        {
          id: "circ_abc",
          label: "C_abc",
          kind: "circumcircle",
          definition: {},
          parents: ["point_a", "point_b", "point_c"],
          visibility: "visible",
          provenance: "ai_generated",
        },
        {
          id: "sphere_s",
          label: "Sph",
          kind: "sphere",
          definition: { center: "point_a", radius: 10 },
          parents: [],
          visibility: "visible",
          provenance: "ai_generated",
        },
      ],
      constraints: [],
    };

    const val = validateGeometryDocument(doc);
    expect(val.valid).toBe(true);

    const plan = compileGeometryDocument(doc);
    expect(plan.operations.length).toBe(9);
    for (const op of plan.operations) {
      expect(isAllowedCommandKey(op.commandKey)).toBe(true);
      const strCmd = compileCommand(op);
      expect(strCmd).toBeTruthy();
    }
  });
});
