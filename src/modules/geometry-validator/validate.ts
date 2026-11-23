import { geometryDocumentSchema, objectRefs, type GeometryDocument } from "../geometry-ir";

export type ValidationIssue = {
  code:
    | "SCHEMA_INVALID"
    | "DUPLICATE_ID"
    | "MISSING_REFERENCE"
    | "CIRCULAR_DEPENDENCY"
    | "DEGENERATE_GEOMETRY"
    | "UNSUPPORTED_KIND";
  message: string;
  objectId?: string;
};

export type ValidationResult = {
  valid: boolean;
  document: GeometryDocument | null;
  issues: ValidationIssue[];
};

const SUPPORTED_KINDS = new Set([
  "point",
  "free_point",
  "segment",
  "line",
  "ray",
  "circle",
  "polygon",
  "triangle",
  "midpoint",
  "intersection",
  "perpendicular_line",
  "parallel_line",
  "angle_bisector",
  "perpendicular_bisector",
]);

function collectRefs(obj: GeometryDocument["objects"][number]): string[] {
  return objectRefs(obj);
}

function detectCycle(objects: GeometryDocument["objects"]): string[] | null {
  const graph = new Map<string, string[]>();
  for (const obj of objects) {
    graph.set(obj.id, collectRefs(obj));
  }
  const visited = new Set<string>();
  const stack = new Set<string>();

  const dfs = (id: string, path: string[]): string[] | null => {
    if (stack.has(id)) return [...path, id];
    if (visited.has(id)) return null;
    visited.add(id);
    stack.add(id);
    for (const dep of graph.get(id) ?? []) {
      if (!graph.has(dep)) continue;
      const cycle = dfs(dep, [...path, id]);
      if (cycle) return cycle;
    }
    stack.delete(id);
    return null;
  };

  for (const id of graph.keys()) {
    const cycle = dfs(id, []);
    if (cycle) return cycle;
  }
  return null;
}

function distance(
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function cross(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

const EPS = 1e-9;

function degenerateIssues(objects: GeometryDocument["objects"]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byId = new Map(objects.map((o) => [o.id, o]));

  const coordsOf = (id: string): [number, number] | null => {
    const obj = byId.get(id);
    if (!obj) return null;
    if (obj.kind === "point" || obj.kind === "free_point") {
      return obj.definition.coordinates;
    }
    return null;
  };

  for (const obj of objects) {
    // Hai điểm trùng tọa độ cố định
    if ((obj.kind === "point" || obj.kind === "free_point") && obj.definition.freedom === "fixed") {
      for (const other of objects) {
        if (other.id <= obj.id) continue;
        if (other.kind !== "point" && other.kind !== "free_point") continue;
        if (other.definition.freedom !== "fixed") continue;
        const d = distance(obj.definition.coordinates, other.definition.coordinates);
        if (d < EPS) {
          issues.push({
            code: "DEGENERATE_GEOMETRY",
            message: `Points ${obj.label} and ${other.label} have identical coordinates`,
            objectId: obj.id,
          });
        }
      }
    }

    // Đoạn/đường thẳng suy biến: hai đầu trùng tọa độ cố định
    if ((obj.kind === "segment" || obj.kind === "line" || obj.kind === "ray") && obj.parents.length >= 2) {
      const a = coordsOf(obj.parents[0]);
      const b = coordsOf(obj.parents[1]);
      if (a && b && distance(a, b) < EPS) {
        issues.push({
          code: "DEGENERATE_GEOMETRY",
          message: `${obj.kind} ${obj.label} has coincident endpoints`,
          objectId: obj.id,
        });
      }
    }

    // Tam giác/đa giác suy biến: 3 đỉnh thẳng hàng (tọa độ cố định)
    if ((obj.kind === "triangle" || obj.kind === "polygon") && obj.parents.length >= 3) {
      const pts = obj.parents.slice(0, 3).map(coordsOf);
      if (pts.every((p): p is [number, number] => p !== null)) {
        const [p1, p2, p3] = pts as [[number, number], [number, number], [number, number]];
        if (Math.abs(cross(p1, p2, p3)) < EPS) {
          issues.push({
            code: "DEGENERATE_GEOMETRY",
            message: `${obj.kind} ${obj.label} has collinear vertices`,
            objectId: obj.id,
          });
        }
      }
    }
  }
  return issues;
}

/**
 * Validate đầy đủ một GeometryDocument (input chưa tin cậy — có thể từ AI).
 * Trả document đã parse khi hợp lệ, ngược lại null + danh sách issues.
 */
export function validateGeometryDocument(input: unknown): ValidationResult {
  const parsed = geometryDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      document: null,
      issues: parsed.error.issues.map((i) => ({
        code: "SCHEMA_INVALID" as const,
        message: `${i.path.join(".")}: ${i.message}`,
      })),
    };
  }

  const doc = parsed.data;
  const issues: ValidationIssue[] = [];

  // Duplicate IDs
  const seen = new Set<string>();
  for (const obj of doc.objects) {
    if (seen.has(obj.id)) {
      issues.push({ code: "DUPLICATE_ID", message: `Duplicate object id: ${obj.id}`, objectId: obj.id });
    }
    seen.add(obj.id);
  }
  const constraintIds = new Set<string>();
  for (const c of doc.constraints) {
    if (constraintIds.has(c.id)) {
      issues.push({ code: "DUPLICATE_ID", message: `Duplicate constraint id: ${c.id}` });
    }
    constraintIds.add(c.id);
  }

  // Missing references (objects + constraints)
  const ids = new Set(doc.objects.map((o) => o.id));
  for (const obj of doc.objects) {
    for (const ref of collectRefs(obj)) {
      if (!ids.has(ref)) {
        issues.push({
          code: "MISSING_REFERENCE",
          message: `Object ${obj.id} references missing object: ${ref}`,
          objectId: obj.id,
        });
      }
    }
  }
  for (const c of doc.constraints) {
    for (const ref of c.references) {
      if (!ids.has(ref)) {
        issues.push({
          code: "MISSING_REFERENCE",
          message: `Constraint ${c.id} references missing object: ${ref}`,
        });
      }
    }
  }

  // Unsupported kinds (schema-valid nhưng engine chưa hỗ trợ)
  for (const obj of doc.objects) {
    if (!SUPPORTED_KINDS.has(obj.kind)) {
      issues.push({
        code: "UNSUPPORTED_KIND",
        message: `Object kind not supported by engine: ${obj.kind}`,
        objectId: obj.id,
      });
    }
  }

  // Cycle detection
  const cycle = detectCycle(doc.objects);
  if (cycle) {
    issues.push({
      code: "CIRCULAR_DEPENDENCY",
      message: `Circular dependency detected: ${cycle.join(" -> ")}`,
    });
  }

  // Degenerate geometry
  issues.push(...degenerateIssues(doc.objects));

  return { valid: issues.length === 0, document: doc, issues };
}
