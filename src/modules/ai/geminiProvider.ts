import { SYSTEM_PROMPT, buildUserPrompt } from "./prompts";
import type { AIProvider, ProviderResult } from "./types";
import { callGeminiWithRetry } from "@/lib/geminiClient";

const GEMINI_MODEL = "gemini-2.5-flash";

/**
 * Gemini provider — server-only. API key đọc từ env hoặc user header,
 * KHÔNG bao giờ expose ra client.
 * Tự động retry khi quá tải 429/503 và cấu hình max token 65536.
 */
export class GeminiProvider implements AIProvider {
  readonly name = "gemini";

  constructor(
    private readonly apiKey: string,
    private readonly model: string = GEMINI_MODEL,
  ) {}

  async generateGeometry(prompt: string, context?: string): Promise<ProviderResult> {
    const result = await callGeminiWithRetry({
      apiKey: this.apiKey,
      model: this.model,
      systemInstruction: SYSTEM_PROMPT,
      userContent: [{ text: buildUserPrompt(prompt, "2d", context) }],
      temperature: 0.2,
      maxOutputTokens: 65536,
      timeoutMs: 90_000,
      maxRetries: 3,
    });

    if (!result.ok) {
      return {
        ok: false,
        code: result.code,
        message: result.message,
      };
    }

    const text = result.text;
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
  }
}

export function createProviderFromEnv(): AIProvider | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL ?? GEMINI_MODEL;
  return new GeminiProvider(key, model);
}
