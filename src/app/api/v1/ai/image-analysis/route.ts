import { NextResponse } from "next/server";
import {
  analyzeImageWithGemini,
  validateImageFile,
  MAX_IMAGE_BYTES,
} from "@/modules/image-analysis";
import { checkRateLimit, clientKey } from "@/lib/rateLimit";
import { logAIUsage, logEvent } from "@/lib/observability";

function errorResponse(code: string, message: string, status = 400) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

/**
 * POST /api/v1/ai/image-analysis
 * multipart/form-data: file (ảnh), prompt? (ghi chú thêm)
 * Ảnh chỉ xử lý trong request — KHÔNG lưu trữ (privacy spec).
 */
export async function POST(req: Request) {
  const rl = checkRateLimit(clientKey(req, "image-analysis"), 10, 60_000);
  if (!rl.ok) {
    return errorResponse("RATE_LIMITED", "Quá nhiều yêu cầu, thử lại sau", 429);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return errorResponse("AI_NOT_CONFIGURED", "Chưa cấu hình GEMINI_API_KEY", 503);
  }
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorResponse("BAD_REQUEST", "Yêu cầu phải là multipart/form-data");
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return errorResponse("BAD_REQUEST", "Thiếu field 'file'");
  }

  const validation = validateImageFile(file.type, file.size);
  if (!validation.ok) {
    return errorResponse("INVALID_IMAGE", validation.message, 422);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return errorResponse("INVALID_IMAGE", "Ảnh vượt quá giới hạn", 413);
  }

  const promptField = form.get("prompt");
  const extraPrompt =
    typeof promptField === "string" && promptField.trim()
      ? promptField.trim().slice(0, 1000)
      : undefined;

  const started = Date.now();
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");

    const result = await analyzeImageWithGemini(
      apiKey,
      model,
      base64,
      file.type,
      extraPrompt,
    );

    if (!result.ok) {
      logAIUsage("image_analysis", {
        durationMs: Date.now() - started,
        ok: false,
        code: result.code,
      });
      const status =
        result.code === "AI_RATE_LIMITED"
          ? 429
          : result.code === "AI_TIMEOUT" || result.code === "AI_PROVIDER_ERROR"
            ? 502
            : 422;
      return errorResponse(result.code, result.message, status);
    }

    logAIUsage("image_analysis", {
      durationMs: Date.now() - started,
      ok: true,
    });
    return NextResponse.json({ ok: true, data: result.result });
  } catch (err) {
    logEvent("error", "image_analysis_failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return errorResponse(
      "INTERNAL_ERROR",
      err instanceof Error ? err.message : "Lỗi xử lý ảnh",
      500,
    );
  }
}
