import { z } from "zod";
import { extractedFactSchema } from "@/modules/geometry-ir";

/** IMAGE_ANALYSIS_SPEC — input validation & output model. */

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB theo .env.example

export const imageAnalysisRequestSchema = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  prompt: z.string().max(1000).optional(),
});

export type ImageAnalysisRequest = z.infer<typeof imageAnalysisRequestSchema>;

/** Output: facts trích từ ảnh — TẤT CẢ confirmed=false cho tới khi user xác nhận. */
export const imageAnalysisResultSchema = z.object({
  description: z.string().max(1000),
  facts: z.array(extractedFactSchema).max(50),
  warnings: z.array(z.string().max(300)).max(20).default([]),
});

export type ImageAnalysisResult = z.infer<typeof imageAnalysisResultSchema>;

export type ImageAnalysisResponse =
  | { status: "ok"; result: ImageAnalysisResult }
  | { status: "error"; code: string; message: string };

export function validateImageFile(
  mimeType: string,
  sizeBytes: number,
): { ok: true } | { ok: false; message: string } {
  if (!ALLOWED_MIME_TYPES.includes(mimeType as (typeof ALLOWED_MIME_TYPES)[number])) {
    return {
      ok: false,
      message: `Định dạng không hỗ trợ: ${mimeType}. Chỉ nhận JPEG/PNG/WebP.`,
    };
  }
  if (sizeBytes <= 0) {
    return { ok: false, message: "File rỗng" };
  }
  if (sizeBytes > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      message: `Ảnh vượt quá ${MAX_IMAGE_BYTES / 1024 / 1024}MB`,
    };
  }
  return { ok: true };
}
