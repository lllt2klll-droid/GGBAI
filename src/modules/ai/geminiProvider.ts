import { SYSTEM_PROMPT, buildUserPrompt } from "./prompts";
import type { AIProvider, ProviderResult } from "./types";

const GEMINI_MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 45_000;

type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  error?: { message?: string; code?: number };
};

/**
 * Gemini provider — server-only. API key đọc từ env, KHÔNG bao giờ
 * expose ra client (không NEXT_PUBLIC_).
 */
export class GeminiProvider implements AIProvider {
  readonly name = "gemini";

  constructor(
    private readonly apiKey: string,
    private readonly model: string = GEMINI_MODEL,
  ) {}

  async generateGeometry(prompt: string, context?: string): Promise<ProviderResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;

    const body = {
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          role: "user",
          parts: [{ text: buildUserPrompt(prompt, "2d", context) }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
        maxOutputTokens: 8192,
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        if (res.status === 429) {
          return { ok: false, code: "AI_RATE_LIMITED", message: "Gemini rate limited" };
        }
        return {
          ok: false,
          code: "AI_PROVIDER_ERROR",
          message: `Gemini HTTP ${res.status}: ${text.slice(0, 300)}`,
        };
      }

      const data = (await res.json()) as GeminiResponse;
      if (data.error) {
        return {
          ok: false,
          code: "AI_PROVIDER_ERROR",
          message: data.error.message ?? "Gemini error",
        };
      }

      const text = data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("");
      if (!text) {
        return { ok: false, code: "AI_INVALID_OUTPUT", message: "Empty model output" };
      }

      try {
        return { ok: true, raw: JSON.parse(text) };
      } catch {
        // Model đôi khi bọc JSON trong markdown fence — thử tách
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            return { ok: true, raw: JSON.parse(match[0]) };
          } catch {
            // fallthrough
          }
        }
        return {
          ok: false,
          code: "AI_INVALID_OUTPUT",
          message: "Model output is not valid JSON",
        };
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return { ok: false, code: "AI_TIMEOUT", message: "Gemini request timeout" };
      }
      return {
        ok: false,
        code: "AI_PROVIDER_ERROR",
        message: err instanceof Error ? err.message : "Provider error",
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createProviderFromEnv(): AIProvider | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL ?? GEMINI_MODEL;
  return new GeminiProvider(key, model);
}
