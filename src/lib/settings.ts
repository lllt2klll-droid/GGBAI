"use client";

/**
 * Client settings — lưu localStorage, KHÔNG gửi đi đâu ngoài
 * header x-gemini-key tới chính server của app (TLS).
 */

export type AppSettings = {
  /** Gemini API key do user tự nhập — ưu tiên hơn env server. */
  geminiKey: string;
  /** Model Gemini (vd: gemini-2.5-flash). */
  geminiModel: string;
  /** Glass blur intensity: 0 = off, 1 = normal, 2 = strong. */
  glass: 0 | 1 | 2;
};

const KEY = "ggb-ai-settings";

export const DEFAULT_SETTINGS: AppSettings = {
  geminiKey: "",
  geminiModel: "gemini-2.5-pro",
  glass: 1,
};

export const GEMINI_MODELS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-pro",
] as const;

export function loadSettings(): AppSettings {
  if (typeof localStorage === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      geminiKey: typeof parsed.geminiKey === "string" ? parsed.geminiKey : "",
      geminiModel:
        typeof parsed.geminiModel === "string" && parsed.geminiModel
          ? parsed.geminiModel
          : DEFAULT_SETTINGS.geminiModel,
      glass:
        parsed.glass === 0 || parsed.glass === 2 ? parsed.glass : 1,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // quota — bỏ qua
  }
}

/** Headers đính kèm vào mọi AI request. */
export function aiHeaders(): Record<string, string> {
  const s = loadSettings();
  const headers: Record<string, string> = {};
  if (s.geminiKey.trim()) headers["x-gemini-key"] = s.geminiKey.trim();
  if (s.geminiModel) headers["x-gemini-model"] = s.geminiModel;
  return headers;
}

/** fetch wrapper cho AI endpoints — tự gắn key/model headers. */
export async function aiFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  for (const [k, v] of Object.entries(aiHeaders())) headers.set(k, v);
  return fetch(url, { ...init, headers });
}
