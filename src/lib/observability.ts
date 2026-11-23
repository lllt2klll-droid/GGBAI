/**
 * Structured observability — log JSON một dòng để dễ parse/ship sau này.
 * Không log prompt/ảnh/PII (SECURITY_SPEC privacy rules).
 */

export type LogLevel = "info" | "warn" | "error";

export function logEvent(
  level: LogLevel,
  event: string,
  data?: Record<string, unknown>,
) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...data,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Đếm usage AI cho cost tracking (M13) — không log nội dung. */
export function logAIUsage(
  task: "text_to_geometry" | "image_analysis" | "edit",
  meta: { durationMs: number; ok: boolean; code?: string },
) {
  logEvent("info", "ai_usage", { task, ...meta });
}
