import { z } from "zod";

/**
 * Geometry IR — schema trung gian theo GEOMETRY_IR_SPEC.md.
 * strict: từ chối field ngoài schema (đặc biệt output AI).
 */

export const SCHEMA_VERSION = "1.0" as const;

const MAX_COORD = 1_000_000;
const MAX_OBJECTS = 200;
const MAX_LABEL = 20;

const finiteNumber = z.number().finite();
const coordinate = z
  .tuple([finiteNumber, finiteNumber])
  .refine(
    ([x, y]) => Math.abs(x) <= MAX_COORD && Math.abs(y) <= MAX_COORD,
    { message: "Coordinate out of range" },
  );

const irId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/, "ID must be snake_case starting with a letter");

const label = z.string().min(1).max(MAX_LABEL);

const objectRef = irId;

const styleSchema = z
  .object({
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Color must be #RRGGBB")
      .optional(),
    lineStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
    lineThickness: z.number().int().min(1).max(10).optional(),
    pointSize: z.number().int().min(1).max(20).optional(),
    labelVisible: z.boolean().optional(),
    fillOpacity: z.number().min(0).max(1).optional(),
  })
  .strict();

const baseObject = {
  id: irId,
  label,
  parents: z.array(objectRef).max(20).default([]),
  style: styleSchema.optional(),
  visibility: z.enum(["visible", "hidden"]).default("visible"),
  provenance: z
    .enum(["ai_generated", "user_created", "imported"])
    .default("ai_generated"),
};

const pointDefinition = z
  .object({
    coordinates: coordinate,
    freedom: z.enum(["fixed", "free"]).default("fixed"),
  })
  .strict();

const emptyDefinition = z.object({}).strict();

const circleDefinition = z
  .object({
    center: objectRef,
    through: objectRef.optional(),
    radius: finiteNumber.positive().optional(),
  })
  .strict()
  .refine((d) => (d.through !== undefined) !== (d.radius !== undefined), {
    message: "circle needs exactly one of through|radius",
  });

const twoRefs = z.object({ a: objectRef, b: objectRef }).strict();
const threeRefs = z.object({ a: objectRef, b: objectRef, c: objectRef }).strict();

const angleDefinition = z
  .object({ vertex: objectRef, side1: objectRef, side2: objectRef })
  .strict();

const textDefinition = z
  .object({ text: z.string().min(1).max(500) })
  .strict();

const numericDefinition = z
  .object({ expression: z.string().min(1).max(200) })
  .strict();

export const geometryObjectSchema = z.discriminatedUnion("kind", [
  z.object({ ...baseObject, kind: z.literal("point"), definition: pointDefinition }).strict(),
  z.object({ ...baseObject, kind: z.literal("free_point"), definition: pointDefinition }).strict(),
  z.object({ ...baseObject, kind: z.literal("segment"), definition: emptyDefinition }).strict(),
  z.object({ ...baseObject, kind: z.literal("line"), definition: emptyDefinition }).strict(),
  z.object({ ...baseObject, kind: z.literal("ray"), definition: emptyDefinition }).strict(),
  z.object({ ...baseObject, kind: z.literal("circle"), definition: circleDefinition }).strict(),
  z.object({ ...baseObject, kind: z.literal("polygon"), definition: emptyDefinition }).strict(),
  z.object({ ...baseObject, kind: z.literal("triangle"), definition: emptyDefinition }).strict(),
  z.object({ ...baseObject, kind: z.literal("midpoint"), definition: emptyDefinition }).strict(),
  z.object({ ...baseObject, kind: z.literal("intersection"), definition: twoRefs }).strict(),
  z.object({ ...baseObject, kind: z.literal("perpendicular_line"), definition: twoRefs }).strict(),
  z.object({ ...baseObject, kind: z.literal("parallel_line"), definition: twoRefs }).strict(),
  z.object({ ...baseObject, kind: z.literal("angle_bisector"), definition: threeRefs }).strict(),
  z.object({ ...baseObject, kind: z.literal("perpendicular_bisector"), definition: twoRefs }).strict(),
  z.object({ ...baseObject, kind: z.literal("angle"), definition: angleDefinition }).strict(),
  z.object({ ...baseObject, kind: z.literal("text"), definition: textDefinition }).strict(),
  z.object({ ...baseObject, kind: z.literal("numeric_value"), definition: numericDefinition }).strict(),
]);

export const constraintKindSchema = z.enum([
  "distance_equals",
  "angle_equals",
  "perpendicular",
  "parallel",
  "point_on_line",
  "point_on_circle",
  "collinear",
  "concyclic",
  "equal_length",
  "midpoint_of",
  "intersection_of",
  "tangent_to",
  "contains",
  "fixed_coordinate",
]);

export const geometryConstraintSchema = z
  .object({
    id: irId,
    kind: constraintKindSchema,
    references: z.array(objectRef).min(1).max(10),
    source: z.enum(["problem_text", "diagram_marking", "user_confirmed", "model_inference"]),
    required: z.boolean().default(true),
    tolerance: finiteNumber.positive().max(1).optional(),
    unit: z.enum(["unit", "cm", "mm", "m", "degree", "radian"]).optional(),
  })
  .strict();

export const extractedFactSchema = z
  .object({
    id: irId,
    statement: z.string().min(1).max(1000),
    normalizedValue: z.union([z.string().max(200), finiteNumber]).optional(),
    sourceType: z.enum([
      "problem_text",
      "diagram_marking",
      "user_confirmed",
      "model_inference",
    ]),
    confidence: z.number().min(0).max(1).optional(),
    sourceRegion: z
      .object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        width: z.number().positive().max(1),
        height: z.number().positive().max(1),
      })
      .strict()
      .optional(),
    confirmed: z.boolean().default(false),
  })
  .strict();

export const viewConfigSchema = z
  .object({
    xMin: finiteNumber.optional(),
    xMax: finiteNumber.optional(),
    yMin: finiteNumber.optional(),
    yMax: finiteNumber.optional(),
    showAxes: z.boolean().optional(),
    showGrid: z.boolean().optional(),
  })
  .strict();

export const geometryDocumentSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    documentId: irId,
    mode: z.enum(["2d", "3d", "graphing"]),
    gradeLevel: z.enum(["primary", "lower_secondary", "upper_secondary"]).optional(),
    title: z.string().max(200).optional(),
    units: z
      .object({
        length: z.enum(["unit", "cm", "mm", "m"]),
        angle: z.enum(["degree", "radian"]),
      })
      .strict()
      .optional(),
    objects: z.array(geometryObjectSchema).min(1).max(MAX_OBJECTS),
    constraints: z.array(geometryConstraintSchema).max(100).default([]),
    view: viewConfigSchema.optional(),
    facts: z.array(extractedFactSchema).max(100).optional(),
    metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  })
  .strict();

export type GeometryDocument = z.infer<typeof geometryDocumentSchema>;
export type GeometryObject = z.infer<typeof geometryObjectSchema>;
export type GeometryConstraint = z.infer<typeof geometryConstraintSchema>;
export type ExtractedFact = z.infer<typeof extractedFactSchema>;
export type ObjectStyle = z.infer<typeof styleSchema>;
export type GeometryObjectKind = GeometryObject["kind"];
