import {
  buildEditUserPrompt,
  EDIT_SYSTEM_PROMPT,
  parseEditOutput,
  type EditProviderResult,
} from "./editPrompt";
import type { EditRequest } from "./editPlan";
import { callGeminiWithRetry } from "@/lib/geminiClient";

/** Gemini edit provider — server-only, trả EditPlan đã validate. */
export async function generateEditPlan(
  apiKey: string,
  model: string,
  request: EditRequest,
): Promise<EditProviderResult> {
  const result = await callGeminiWithRetry({
    apiKey,
    model,
    systemInstruction: EDIT_SYSTEM_PROMPT,
    userContent: [{ text: buildEditUserPrompt(request) }],
    temperature: 0.1,
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
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return { ok: false, code: "AI_INVALID_OUTPUT", message: "Edit output not JSON" };
    }
    try {
      raw = JSON.parse(match[0]);
    } catch {
      return { ok: false, code: "AI_INVALID_OUTPUT", message: "Edit output not JSON" };
    }
  }

  return parseEditOutput(raw);
}
