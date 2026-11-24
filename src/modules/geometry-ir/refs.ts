import type { GeometryObject } from "./schema";

/**
 * Trích toàn bộ object references của một GeometryObject:
 * parents + các field ref trong definition (theo kind).
 * KHÔNG coi mọi string là ref (vd freedom: "fixed").
 */
export function objectRefs(obj: GeometryObject): string[] {
  const refs = new Set<string>(obj.parents);
  const def = obj.definition as Record<string, unknown>;

  const add = (v: unknown) => {
    if (typeof v === "string") refs.add(v);
  };

  switch (obj.kind) {
    case "circle":
    case "sphere":
      add(def.center);
      add(def.through);
      break;
    case "intersection":
    case "perpendicular_line":
    case "parallel_line":
    case "perpendicular_bisector":
    case "tangent":
    case "pyramid":
    case "prism":
      add(def.a);
      add(def.b);
      break;
    case "angle_bisector":
    case "arc":
    case "sector":
    case "ellipse":
      add(def.a);
      add(def.b);
      add(def.c);
      break;
    case "angle":
      add(def.vertex);
      add(def.side1);
      add(def.side2);
      break;
    default:
      break;
  }
  return [...refs];
}
