import { z } from "zod";

/**
 * EditPlan theo CONSTRUCTION_EDITOR_SPEC — output của AI edit task.
 * Chỉ chứa operation an toàn; KHÔNG raw command, KHÔNG code.
 */

export const editOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("delete_object"),
    target: z.string().min(1).max(64),
    reason: z.string().max(200).optional(),
  }),
  z.object({
    type: z.literal("move_point"),
    target: z.string().min(1).max(64),
    x: z.number().finite(),
    y: z.number().finite(),
  }),
  z.object({
    type: z.literal("set_color"),
    target: z.string().min(1).max(64),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  z.object({
    type: z.literal("set_visible"),
    target: z.string().min(1).max(64),
    visible: z.boolean(),
  }),
]);

export const editPlanSchema = z.object({
  summary: z.string().max(500),
  operations: z.array(editOperationSchema).min(1).max(20),
  /** true nếu plan chứa delete — client nên confirm trước khi áp dụng */
  requiresConfirmation: z.boolean().default(false),
});

export type EditPlan = z.infer<typeof editPlanSchema>;
export type EditPlanOperation = z.infer<typeof editOperationSchema>;

export const editRequestSchema = z.object({
  prompt: z.string().min(1).max(1000),
  objects: z
    .array(
      z.object({
        name: z.string().min(1).max(64),
        type: z.string().max(40).optional(),
        value: z.string().max(200).optional(),
      }),
    )
    .max(200),
});

export type EditRequest = z.infer<typeof editRequestSchema>;

export type EditResponse =
  | { status: "ok"; plan: EditPlan }
  | { status: "not_an_edit"; reason: string }
  | { status: "error"; code: string; message: string };
