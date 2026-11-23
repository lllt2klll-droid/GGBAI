import { NextResponse } from "next/server";

/**
 * Resolve Gemini credentials cho request.
 * Ưu tiên key user gửi qua header `x-gemini-key` (lưu localStorage
 * phía client — chỉ đi qua TLS tới server này), fallback env server.
 * KHÔNG log key.
 */
export function resolveGeminiCredentials(req: Request): {
  apiKey: string | null;
  model: string;
  source: "user" | "env" | "none";
} {
  const userKey = req.headers.get("x-gemini-key")?.trim();
  const userModel = req.headers.get("x-gemini-model")?.trim();
  if (userKey) {
    return {
      apiKey: userKey,
      model: userModel || process.env.GEMINI_MODEL || "gemini-2.5-pro",
      source: "user",
    };
  }
  const envKey = process.env.GEMINI_API_KEY;
  if (envKey) {
    return {
      apiKey: envKey,
      model: userModel || process.env.GEMINI_MODEL || "gemini-2.5-pro",
      source: "env",
    };
  }
  return { apiKey: null, model: "gemini-2.5-pro", source: "none" };
}

export function aiNotConfiguredResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "AI_NOT_CONFIGURED",
        message:
          "Chưa có Gemini API key — vào Settings nhập key hoặc đặt GEMINI_API_KEY trên server",
      },
    },
    { status: 503 },
  );
}
