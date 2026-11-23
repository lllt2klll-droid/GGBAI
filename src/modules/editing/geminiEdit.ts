import {
  buildEditUserPrompt,
  EDIT_SYSTEM_PROMPT,
  parseEditOutput,
  type EditProviderResult,
} from "./editPrompt";
import type { EditRequest } from "./editPlan";

const TIMEOUT_MS = 45_000;

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string };
};

/** Gemini edit provider — server-only, trả EditPlan đã validate. */
export async function generateEditPlan(
  apiKey: string,
  model: string,
  request: EditRequest,
): Promise<EditProviderResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const body = {
    system_instruction: { parts: [{ text: EDIT_SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: buildEditUserPrompt(request) }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
      maxOutputTokens: 4096,
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      if (res.status === 429) {
        return { ok: false, code: "AI_RATE_LIMITED", message: "Gemini rate limited" };
      }
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        code: "AI_PROVIDER_ERROR",
        message: `Gemini HTTP ${res.status}: ${text.slice(0, 300)}`,
      };
    }

    const data = (await res.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("");
    if (!text) {
      return { ok: false, code: "AI_INVALID_OUTPUT", message: "Empty edit output" };
    }

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
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, code: "AI_TIMEOUT", message: "Edit request timeout" };
    }
    return {
      ok: false,
      code: "AI_PROVIDER_ERROR",
      message: err instanceof Error ? err.message : "Edit provider error",
    };
  } finally {
    clearTimeout(timer);
  }
}
