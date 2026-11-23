import { describe, expect, it, vi, beforeEach } from "vitest";
import { callGeminiWithRetry } from "./geminiClient";

describe("callGeminiWithRetry", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns text and data on 200 OK", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"status":"ok"}' }] } }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const res = await callGeminiWithRetry({
      apiKey: "test-key",
      model: "gemini-2.5-pro",
      userContent: [{ text: "Tam giác ABC" }],
      timeoutMs: 5000,
      maxRetries: 1,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.text).toBe('{"status":"ok"}');
      expect(res.modelUsed).toBe("gemini-2.5-pro");
    }
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 rate limit and succeeds on subsequent try", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 429,
          headers: new Headers(),
          text: async () => "Rate limit exceeded",
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"success":true}' }] } }],
        }),
      });
    });
    vi.stubGlobal("fetch", mockFetch);

    const res = await callGeminiWithRetry({
      apiKey: "test-key",
      model: "gemini-2.5-pro",
      userContent: [{ text: "Test prompt" }],
      timeoutMs: 5000,
      maxRetries: 2,
    });

    expect(res.ok).toBe(true);
    expect(callCount).toBe(2);
  });

  it("returns helpful message when retries are exhausted", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers(),
      text: async () => "Rate limit exceeded",
    });
    vi.stubGlobal("fetch", mockFetch);

    const res = await callGeminiWithRetry({
      apiKey: "test-key",
      model: "gemini-2.5-pro",
      userContent: [{ text: "Test prompt" }],
      timeoutMs: 5000,
      maxRetries: 1,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("AI_RATE_LIMITED");
      expect(res.message).toMatch(/quá tải/i);
    }
  });
});
