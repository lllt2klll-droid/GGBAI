/**
 * Gemini API Client với cơ chế:
 * 1. Token tối đa (maxOutputTokens: 65536) cho phản hồi trọn vẹn, không bị đứt đoạn.
 * 2. Tự động thử lại (Exponential Backoff + Jitter) khi gặp 429 (Rate Limit) hoặc 503 (Overloaded).
 * 3. Fallback thông minh: nếu model Pro bị nghẽn quota, chuyển Flash ở lần thử cuối để đảm bảo yêu cầu thành công.
 * 4. Tự điều chỉnh nếu model không hỗ trợ token 65k (fallback về 8192).
 */

export type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  error?: { message?: string; code?: number; status?: string };
};

export type GeminiFetchOptions = {
  apiKey: string;
  model: string;
  systemInstruction?: string;
  userContent: Array<
    | { text: string }
    | { inline_data: { mime_type: string; data: string } }
  >;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  fallbackModel?: string;
};

export type GeminiFetchResult =
  | { ok: true; data: GeminiResponse; text: string; modelUsed: string }
  | {
      ok: false;
      code: "AI_RATE_LIMITED" | "AI_TIMEOUT" | "AI_PROVIDER_ERROR" | "AI_INVALID_OUTPUT";
      message: string;
      status?: number;
    };

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getBackoffDelay(attempt: number): number {
  // attempt 0: ~1500ms, attempt 1: ~3000ms, attempt 2: ~6000ms (+/- jitter)
  const base = 1500 * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 500);
  return base + jitter;
}

export async function callGeminiWithRetry(
  options: GeminiFetchOptions,
): Promise<GeminiFetchResult> {
  const {
    apiKey,
    model: initialModel,
    systemInstruction,
    userContent,
    temperature = 0.2,
    maxOutputTokens = 65536,
    timeoutMs = 90_000,
    maxRetries = 3,
    fallbackModel = initialModel !== "gemini-2.5-flash"
      ? "gemini-2.5-flash"
      : undefined,
  } = options;

  let currentModel = initialModel;
  let currentMaxTokens = maxOutputTokens;
  let lastError: {
    code: "AI_RATE_LIMITED" | "AI_TIMEOUT" | "AI_PROVIDER_ERROR" | "AI_INVALID_OUTPUT";
    message: string;
    status?: number;
  } = {
    code: "AI_PROVIDER_ERROR",
    message: "Unknown Gemini error",
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Nếu lần thử cuối mà model Pro vẫn bị nghẽn (429/503), chuyển sang Flash để giải phóng
    if (
      attempt === maxRetries &&
      fallbackModel &&
      currentModel !== fallbackModel
    ) {
      currentModel = fallbackModel;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent`;

    const body: Record<string, unknown> = {
      contents: [{ role: "user", parts: userContent }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature,
        maxOutputTokens: currentMaxTokens,
      },
    };

    if (systemInstruction) {
      body.system_instruction = { parts: [{ text: systemInstruction }] };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.ok) {
        const data = (await res.json()) as GeminiResponse;
        if (data.error) {
          lastError = {
            code: "AI_PROVIDER_ERROR",
            message: data.error.message || "Gemini API error",
          };
          if (attempt < maxRetries) {
            await delay(getBackoffDelay(attempt));
            continue;
          }
          return { ok: false, ...lastError };
        }

        const text = data.candidates?.[0]?.content?.parts
          ?.map((p) => p.text ?? "")
          .join("");

        if (!text) {
          return {
            ok: false,
            code: "AI_INVALID_OUTPUT",
            message: "Mô hình trả về nội dung rỗng (Empty response)",
          };
        }

        return { ok: true, data, text, modelUsed: currentModel };
      }

      // Xử lý lỗi HTTP
      const resText = await res.text().catch(() => "");
      const isRateLimit = res.status === 429;
      const isOverloaded =
        res.status === 503 ||
        res.status === 502 ||
        res.status === 504 ||
        res.status === 500;

      // Nếu model cũ không nhận maxOutputTokens 65536, fallback về 8192
      if (
        res.status === 400 &&
        resText.toLowerCase().includes("maxoutputtokens") &&
        currentMaxTokens > 8192
      ) {
        currentMaxTokens = 8192;
        continue;
      }

      if (isRateLimit) {
        lastError = {
          code: "AI_RATE_LIMITED",
          message: "Máy chủ Gemini đang quá tải lượt gọi (Rate Limit 429).",
          status: 429,
        };
      } else {
        lastError = {
          code: "AI_PROVIDER_ERROR",
          message: `Gemini HTTP ${res.status}: ${resText.slice(0, 300)}`,
          status: res.status,
        };
      }

      // Nếu có thể thử lại
      if (attempt < maxRetries && (isRateLimit || isOverloaded)) {
        const retryAfterHeader = res.headers.get("retry-after");
        let waitMs = getBackoffDelay(attempt);
        if (retryAfterHeader) {
          const parsed = parseInt(retryAfterHeader, 10);
          if (!isNaN(parsed) && parsed > 0) {
            waitMs = Math.min(parsed * 1000, 15_000);
          }
        }
        await delay(waitMs);
        continue;
      }

      return {
        ok: false,
        code: lastError.code,
        message: isRateLimit
          ? `Hệ thống AI Gemini đang quá tải (Rate limit 429). Đã tự động thử lại ${attempt + 1} lần. Bạn có thể bấm nút "Thử lại" bên dưới sau vài giây hoặc nhập API key cá nhân trong Cài đặt.`
          : lastError.message,
        status: res.status,
      };
    } catch (err) {
      clearTimeout(timer);
      const isAbort = err instanceof Error && err.name === "AbortError";
      lastError = {
        code: isAbort ? "AI_TIMEOUT" : "AI_PROVIDER_ERROR",
        message: isAbort
          ? `Yêu cầu AI quá thời gian chờ (${Math.round(timeoutMs / 1000)}s)`
          : err instanceof Error
            ? err.message
            : "Lỗi kết nối tới Gemini",
      };

      if (attempt < maxRetries) {
        await delay(getBackoffDelay(attempt));
        continue;
      }
      return { ok: false, ...lastError };
    }
  }

  return { ok: false, ...lastError };
}
