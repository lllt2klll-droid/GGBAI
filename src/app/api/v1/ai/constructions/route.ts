import { NextResponse } from "next/server";
import { z } from "zod";
import { GeminiProvider } from "@/modules/ai/geminiProvider";
import { handleTextToGeometry } from "@/modules/ai/orchestrator";
import type { AIConstructionResponse } from "@/modules/ai/types";
import { checkRateLimit, clientKey } from "@/lib/rateLimit";
import { logAIUsage, logEvent } from "@/lib/observability";
import { aiNotConfiguredResponse, resolveGeminiCredentials } from "@/lib/aiConfig";

const requestSchema = z.object({
  prompt: z.string().min(1).max(2000),
  mode: z.enum(["2d", "3d", "graphing"]).default("2d"),
  gradeLevel: z.enum(["primary", "lower_secondary", "upper_secondary"]).optional(),
  conversationId: z.string().max(64).optional(),
});

function errorResponse(
  code: string,
  message: string,
  status = 400,
  issues?: unknown,
) {
  return NextResponse.json(
    { ok: false, error: { code, message, issues } },
    { status },
  );
}

export async function POST(req: Request) {
  const rl = checkRateLimit(clientKey(req, "constructions"), 60, 60_000);
  if (!rl.ok) {
    return errorResponse("RATE_LIMITED", "Quá nhiều yêu cầu, thử lại sau ít giây", 429);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("BAD_REQUEST", "Body không phải JSON hợp lệ");
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "BAD_REQUEST",
      "Request không hợp lệ",
      400,
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  }

  const creds = resolveGeminiCredentials(req);
  if (!creds.apiKey) {
    return aiNotConfiguredResponse();
  }
  const provider = new GeminiProvider(creds.apiKey, creds.model);

  const started = Date.now();
  try {
    const result: AIConstructionResponse = await handleTextToGeometry(
      parsed.data,
      provider,
    );
    logAIUsage("text_to_geometry", {
      durationMs: Date.now() - started,
      ok: result.status !== "error",
      code: result.status === "error" ? result.code : undefined,
    });

    if (result.status === "error") {
      const httpStatus =
        result.code === "AI_RATE_LIMITED"
          ? 429
          : result.code === "AI_TIMEOUT" || result.code === "AI_PROVIDER_ERROR"
            ? 502
            : 422;
      return errorResponse(result.code, result.message, httpStatus, result.issues);
    }

    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    logEvent("error", "constructions_failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return errorResponse(
      "INTERNAL_ERROR",
      err instanceof Error ? err.message : "Lỗi không xác định",
      500,
    );
  }
}
