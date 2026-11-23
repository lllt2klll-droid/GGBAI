import { describe, expect, it } from "vitest";
import { checkRateLimit, clientKey, resetRateLimits } from "./rateLimit";

describe("checkRateLimit", () => {
  it("allows up to limit then blocks", () => {
    resetRateLimits();
    const key = "test:1";
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit(key, 3, 60_000).ok).toBe(true);
    }
    const blocked = checkRateLimit(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetAt).toBeGreaterThan(Date.now());
  });

  it("separate keys are independent", () => {
    resetRateLimits();
    checkRateLimit("a", 1, 60_000);
    expect(checkRateLimit("a", 1, 60_000).ok).toBe(false);
    expect(checkRateLimit("b", 1, 60_000).ok).toBe(true);
  });

  it("window expires", () => {
    resetRateLimits();
    checkRateLimit("w", 1, 50); // 50ms window
    expect(checkRateLimit("w", 1, 50).ok).toBe(false);
    // chờ window trôi qua
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(checkRateLimit("w", 1, 50).ok).toBe(true);
        resolve();
      }, 60);
    });
  });
});

describe("clientKey", () => {
  it("uses x-forwarded-for first IP", () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(clientKey(req, "scope")).toBe("scope:1.2.3.4");
  });

  it("falls back to anon", () => {
    const req = new Request("http://x");
    expect(clientKey(req, "scope")).toBe("scope:anon");
  });
});
