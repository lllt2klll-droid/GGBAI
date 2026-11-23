import { NextResponse } from "next/server";
import { editRequestSchema, generateEditPlan } from "@/modules/editing";
import { checkRateLimit, clientKey } from "@/lib/rateLimit";
import { logAIUsage, logEvent } from "@/lib/observability";
import { aiNotConfiguredResponse, resolveGeminiCredentials } from "@/lib/aiConfig";

function errorResponse(code: string, message: string, status = 400) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

/**
 * POST /api/v1/ai/edits
 * Body: { prompt, objects: [{name, type?, value?}] }
 * Trả EditPlan đã validate — client tự áp dụng (có confirm cho delete).
 */
export async function POST(req: Request) {
  const rl = checkRateLimit(clientKey(req, "edits"), 30, 60_000);
  if (!rl.ok) {
    return errorResponse("RATE_LIMITED", "Quá nhiều yêu cầu, thử lại sau", 429);
  }

  const creds = resolveGeminiCredentials(req);
  if (!creds.apiKey) {
    return aiNotConfiguredResponse();
  }
  const apiKey = creds.apiKey;
  const model = creds.model;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("BAD_REQUEST", "Body không phải JSON hợp lệ");
  }

  const parsed = editRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("BAD_REQUEST", "Request không hợp lệ", 400);
  }

  const started = Date.now();
  try {
    const result = await generateEditPlan(apiKey, model, parsed.data);
    logAIUsage("edit", {
      durationMs: Date.now() - started,
      ok: result.ok,
      code: result.ok ? undefined : result.code,
    });

    if (!result.ok) {
      if ("reason" in result) {
        return NextResponse.json({
          ok: true,
          data: { status: "not_an_edit", reason: result.reason },
        });
      }
      const status =
        result.code === "AI_RATE_LIMITED"
          ? 429
          : result.code === "AI_TIMEOUT" || result.code === "AI_PROVIDER_ERROR"
            ? 502
            : 422;
      return errorResponse(result.code, result.message, status);
    }

    return NextResponse.json({
      ok: true,
      data: { status: "ok", plan: result.plan },
    });
  } catch (err) {
    logEvent("error", "edits_failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return errorResponse(
      "INTERNAL_ERROR",
      err instanceof Error ? err.message : "Lỗi không xác định",
      500,
    );
  }
}
