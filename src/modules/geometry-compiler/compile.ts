import { objectRefs, type GeometryDocument, type GeometryObject } from "../geometry-ir";
import type { SafeGeoGebraCommand } from "@/lib/geogebra/types";

/**
 * Geometry Compiler — IR đã validate → CommandPlan deterministic.
 * Chỉ sinh commandKey thuộc allowlist registry; không raw string.
 */

export type CommandPlanOperation = {
  operationId: string;
  irObjectId: string;
  commandKey: string;
  args: SafeGeoGebraCommand["args"];
  expectedObjectNames: string[];
  destructive: boolean;
};

export type CommandPlan = {
  planId: string;
  documentId: string;
  operations: CommandPlanOperation[];
  warnings: string[];
  validationSummary: {
    schemaValid: boolean;
    referencesValid: boolean;
    dependenciesValid: boolean;
    constraintsReviewed: boolean;
  };
  /** irId -> tên đối tượng GeoGebra an toàn */
  nameMap: Record<string, string>;
};

const NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

/** Tạo tên GeoGebra an toàn, duy nhất; ưu tiên label nếu hợp lệ. */
function buildNameMap(objects: GeometryObject[]): Record<string, string> {
  const used = new Set<string>();
  const map: Record<string, string> = {};

  const allocate = (preferred: string, fallback: string): string => {
    let candidate = NAME_RE.test(preferred) ? preferred : fallback;
    let i = 2;
    while (used.has(candidate)) {
      candidate = `${fallback}_${i}`;
      i += 1;
    }
    used.add(candidate);
    return candidate;
  };

  for (const obj of objects) {
    map[obj.id] = allocate(obj.label, `o_${obj.id}`.replace(/[^A-Za-z0-9_]/g, "_"));
  }
  return map;
}

/** Topological sort: parents phải được dựng trước. */
function topoSort(objects: GeometryObject[]): GeometryObject[] {
  const byId = new Map(objects.map((o) => [o.id, o]));
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const obj of objects) {
    indegree.set(obj.id, 0);
  }
  for (const obj of objects) {
    const deps = new Set<string>();
    const refs = objectRefs(obj);
    for (const ref of refs) {
      if (byId.has(ref) && ref !== obj.id && !deps.has(ref)) {
        deps.add(ref);
        indegree.set(obj.id, (indegree.get(obj.id) ?? 0) + 1);
        const list = dependents.get(ref) ?? [];
        list.push(obj.id);
        dependents.set(ref, list);
      }
    }
  }

  const queue = objects.filter((o) => (indegree.get(o.id) ?? 0) === 0).map((o) => o.id);
  const order: GeometryObject[] = [];
  const index = new Map(objects.map((o, i) => [o.id, i]));

  while (queue.length > 0) {
    queue.sort((a, b) => (index.get(a) ?? 0) - (index.get(b) ?? 0));
    const id = queue.shift()!;
    const obj = byId.get(id);
    if (!obj) continue;
    order.push(obj);
    for (const depId of dependents.get(id) ?? []) {
      const d = (indegree.get(depId) ?? 0) - 1;
      indegree.set(depId, d);
      if (d === 0) queue.push(depId);
    }
  }

  // Cycle đã bị validator chặn; nếu còn object thiếu thì append để không mất dữ liệu
  if (order.length < objects.length) {
    const emitted = new Set(order.map((o) => o.id));
    for (const obj of objects) {
      if (!emitted.has(obj.id)) order.push(obj);
    }
  }
  return order;
}

function refsOf(obj: GeometryObject): string[] {
  return objectRefs(obj);
}

function compileObject(
  obj: GeometryObject,
  name: (id: string) => string,
): { commandKey: string; args: SafeGeoGebraCommand["args"] } | null {
  switch (obj.kind) {
    case "point":
    case "free_point":
      return {
        commandKey: "point",
        args: {
          label: name(obj.id),
          x: obj.definition.coordinates[0],
          y: obj.definition.coordinates[1],
        },
      };
    case "segment":
      return {
        commandKey: "segment",
        args: { p1: name(obj.parents[0]), p2: name(obj.parents[1]) },
      };
    case "line":
      return {
        commandKey: "line",
        args: { p1: name(obj.parents[0]), p2: name(obj.parents[1]) },
      };
    case "ray":
      return {
        commandKey: "ray",
        args: { p1: name(obj.parents[0]), p2: name(obj.parents[1]) },
      };
    case "polygon":
    case "triangle":
      return {
        commandKey: "polygon",
        args: { vertices: obj.parents.map(name).join(",") },
      };
    case "circle": {
      const def = obj.definition;
      if (def.radius !== undefined) {
        return {
          commandKey: "circle",
          args: { center: name(def.center), radius: def.radius },
        };
      }
      return {
        commandKey: "circle",
        args: { center: name(def.center), through: name(def.through!) },
      };
    }
    case "midpoint":
      return {
        commandKey: "midpoint",
        args: { p1: name(obj.parents[0]), p2: name(obj.parents[1]) },
      };
    case "intersection":
      return {
        commandKey: "intersection",
        args: { o1: name(obj.definition.a), o2: name(obj.definition.b) },
      };
    case "perpendicular_line":
      return {
        commandKey: "perpendicular_line",
        args: { point: name(obj.definition.a), line: name(obj.definition.b) },
      };
    case "parallel_line":
      return {
        commandKey: "parallel_line",
        args: { point: name(obj.definition.a), line: name(obj.definition.b) },
      };
    case "angle_bisector":
      return {
        commandKey: "angle_bisector",
        args: {
          vertex: name(obj.definition.a),
          l1: name(obj.definition.b),
          l2: name(obj.definition.c),
        },
      };
    case "perpendicular_bisector":
      return {
        commandKey: "perpendicular_bisector",
        args: { p1: name(obj.definition.a), p2: name(obj.definition.b) },
      };
    default:
      return null;
  }
}

/**
 * Compile GeometryDocument (đã qua validateGeometryDocument) thành CommandPlan.
 * Caller phải validate trước; hàm này vẫn defensive với kind không hỗ trợ.
 */
export function compileGeometryDocument(
  doc: GeometryDocument,
  options: { planId?: string } = {},
): CommandPlan {
  const nameMap = buildNameMap(doc.objects);
  const name = (id: string) => nameMap[id] ?? id;
  const ordered = topoSort(doc.objects);
  const warnings: string[] = [];
  const operations: CommandPlanOperation[] = [];

  for (const obj of ordered) {
    const compiled = compileObject(obj, name);
    if (!compiled) {
      warnings.push(`Skipped unsupported object kind: ${obj.kind} (${obj.id})`);
      continue;
    }
    operations.push({
      operationId: `op_${obj.id}`,
      irObjectId: obj.id,
      commandKey: compiled.commandKey,
      args: compiled.args,
      expectedObjectNames: [nameMap[obj.id]],
      destructive: false,
    });
  }

  return {
    planId: options.planId ?? `plan_${doc.documentId}`,
    documentId: doc.documentId,
    operations,
    warnings,
    validationSummary: {
      schemaValid: true,
      referencesValid: true,
      dependenciesValid: true,
      constraintsReviewed: doc.constraints.length > 0,
    },
    nameMap,
  };
}

/** Liệt kê refs của object (dùng cho test/debug). */
export { refsOf };
