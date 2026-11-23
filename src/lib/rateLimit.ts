/**
 * In-memory sliding-window rate limiter — đủ cho single-instance MVP.
 * Production multi-instance cần Redis/Upstash (ghi chú trong SECURITY_SPEC).
 */

type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // ms epoch khi window reset
};

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;

  let bucket = buckets.get(key);
  if (!bucket) {
    if (buckets.size >= MAX_BUCKETS) {
      // Evict bucket cũ nhất đơn giản: xóa entry đầu tiên
      const first = buckets.keys().next().value;
      if (first) buckets.delete(first);
    }
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }

  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0];
    return {
      ok: false,
      limit,
      remaining: 0,
      resetAt: oldest + windowMs,
    };
  }

  bucket.timestamps.push(now);
  return {
    ok: true,
    limit,
    remaining: limit - bucket.timestamps.length,
    resetAt: now + windowMs,
  };
}

/** Lấy client key từ request — IP qua x-forwarded-for hoặc fallback "anon". */
export function clientKey(req: Request, scope: string): string {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "anon";
  return `${scope}:${ip}`;
}

/** Test helper — xóa toàn bộ buckets. */
export function resetRateLimits() {
  buckets.clear();
}
