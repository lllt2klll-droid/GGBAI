import {
  buildVisionUserPrompt,
  parseVisionOutput,
  VISION_SYSTEM_PROMPT,
  type VisionProviderResult,
} from "./visionPrompt";
import { callGeminiWithRetry } from "@/lib/geminiClient";

/**
 * Gemini Vision — phân tích ảnh đề toán, trích facts.
 * Server-only; ảnh truyền dạng base64 inline (không lưu trữ).
 */
export async function analyzeImageWithGemini(
  apiKey: string,
  model: string,
  imageBase64: string,
  mimeType: string,
  extraPrompt?: string,
): Promise<VisionProviderResult> {
  const result = await callGeminiWithRetry({
    apiKey,
    model,
    systemInstruction: VISION_SYSTEM_PROMPT,
    userContent: [
      { text: buildVisionUserPrompt(extraPrompt) },
      { inline_data: { mime_type: mimeType, data: imageBase64 } },
    ],
    temperature: 0.1,
    maxOutputTokens: 65536,
    timeoutMs: 120_000,
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
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return { ok: false, code: "AI_INVALID_OUTPUT", message: "Vision output not JSON" };
    }
    try {
      raw = JSON.parse(match[0]);
    } catch {
      return { ok: false, code: "AI_INVALID_OUTPUT", message: "Vision output not JSON" };
    }
  }

  return parseVisionOutput(raw);
}
