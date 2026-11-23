"use client";

import { useEffect, useRef, useState } from "react";
import type {
  AIConstructionResponse,
  ClarificationQuestion,
} from "@/modules/ai/types";
import type { ImageAnalysisResult } from "@/modules/image-analysis";
import type {
  GeoGebraAdapter,
  GeoGebraSnapshot,
  SafeGeoGebraCommand,
} from "@/lib/geogebra/types";
import {
  applyEditOperations,
  parseEditCommand,
  type EditPlan,
} from "@/modules/editing";
import { aiFetch, loadSettings } from "@/lib/settings";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
};

type ApiEnvelope =
  | { ok: true; data: AIConstructionResponse }
  | { ok: false; error: { code: string; message: string; issues?: unknown } };

const SAMPLE = "Tam giác ABC cân tại A, đường cao AH";
const CHAT_KEY = "ggb-ai-chat";
const CHAT_MAX = 50;

function loadChat(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    return Array.isArray(parsed) ? parsed.slice(-CHAT_MAX) : [];
  } catch {
    return [];
  }
}

function saveChat(messages: ChatMessage[]) {
  try {
    localStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-CHAT_MAX)));
  } catch {
    // quota — bỏ qua
  }
}

export function AIChatPanel({
  adapter,
  executeCommands,
  selectedObject,
  onEditApplied,
}: {
  adapter: GeoGebraAdapter | null;
  executeCommands?: (
    commands: SafeGeoGebraCommand[],
    label: string,
  ) => Promise<{ ok: number; failed: number; lastError?: string }>;
  selectedObject?: string | null;
  onEditApplied?: (
    before: GeoGebraSnapshot,
    after: GeoGebraSnapshot,
    label: string,
  ) => void;
}) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Mô tả hình học bằng tiếng Việt. Ví dụ: “Tam giác ABC vuông tại A, trung tuyến AM”.",
    },
  ]);
  const [loaded, setLoaded] = useState(false);

  // Load lịch sử chat từ localStorage (client-only)
  useEffect(() => {
    const t = setTimeout(() => {
      const saved = loadChat();
      if (saved.length > 0) {
        setMessages((prev) => [
          prev[0],
          ...saved.filter((m) => m.id !== "welcome"),
        ]);
      }
      setLoaded(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Persist khi messages thay đổi (sau khi load xong)
  useEffect(() => {
    if (loaded) saveChat(messages);
  }, [messages, loaded]);
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<ClarificationQuestion[]>([]);
  const [imageResult, setImageResult] = useState<ImageAnalysisResult | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const push = (msg: Omit<ChatMessage, "id">) =>
    setMessages((prev) => [...prev, { ...msg, id: `m${Date.now()}-${prev.length}` }]);

  const executePlan = async (plan: Extract<AIConstructionResponse, { status: "ok" }>["plan"]) => {
    if (!adapter) {
      push({ role: "error", text: "Canvas chưa sẵn sàng. Đợi GeoGebra tải xong." });
      return;
    }
    const commands: SafeGeoGebraCommand[] = plan.operations.map((op) => ({
      operationId: op.operationId,
      commandKey: op.commandKey,
      args: op.args,
    }));

    if (executeCommands) {
      const result = await executeCommands(commands, "AI construction");
      push({
        role: result.failed > 0 ? "error" : "assistant",
        text:
          result.failed > 0
            ? `Đã dựng ${result.ok}/${commands.length} đối tượng — ${result.failed} lệnh thất bại.`
            : `Đã dựng ${result.ok} đối tượng lên canvas.`,
      });
      return;
    }

    let ok = 0;
    let failed = 0;
    for (const op of plan.operations) {
      const result = await adapter.executeCommand({
        operationId: op.operationId,
        commandKey: op.commandKey,
        args: op.args,
      });
      if (result.success) ok += 1;
      else failed += 1;
    }
    push({
      role: failed > 0 ? "error" : "assistant",
      text:
        failed > 0
          ? `Đã dựng ${ok}/${plan.operations.length} đối tượng — ${failed} lệnh thất bại.`
          : `Đã dựng ${ok} đối tượng lên canvas.`,
    });
  };

  const analyzeImage = async (file: File) => {
    setImageLoading(true);
    setImageResult(null);
    push({ role: "user", text: `[Ảnh] ${file.name}` });
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await aiFetch("/api/v1/ai/image-analysis", {
        method: "POST",
        body: form,
      });
      const envelope = (await res.json()) as
        | { ok: true; data: ImageAnalysisResult }
        | { ok: false; error: { code: string; message: string } };
      if (!envelope.ok) {
        push({ role: "error", text: envelope.error.message });
        return;
      }
      setImageResult(envelope.data);
      push({
        role: "assistant",
        text: `Phân tích ảnh: ${envelope.data.description}\nTìm thấy ${envelope.data.facts.length} dữ kiện — hãy xác nhận rồi dựng hình.`,
      });
      if (envelope.data.warnings.length > 0) {
        push({ role: "assistant", text: `Cảnh báo: ${envelope.data.warnings.join("; ")}` });
      }
    } catch (err) {
      push({
        role: "error",
        text: err instanceof Error ? err.message : "Lỗi phân tích ảnh",
      });
    } finally {
      setImageLoading(false);
    }
  };

  const buildFromImage = () => {
    if (!imageResult) return;
    const confirmed = imageResult.facts.filter((f) => f.confirmed);
    const factsText = confirmed.map((f) => f.statement).join("; ");
    const prompt = `${imageResult.description}. Dữ kiện: ${factsText}`;
    setImageResult(null);
    setImagePreview(null);
    void submit(prompt);
  };

  /** Áp dụng edit ops kèm snapshot trước/sau để undo được. */
  const applyWithSnapshot = async (
    operations: Parameters<typeof applyEditOperations>[1],
    label: string,
  ) => {
    if (!adapter) return;
    let before: GeoGebraSnapshot | null = null;
    try {
      before = await adapter.exportSnapshot();
    } catch {
      // snapshot không khả dụng — vẫn apply, chỉ không undo được
    }
    const result = await applyEditOperations(adapter, operations);
    if (before && onEditApplied) {
      try {
        const after = await adapter.exportSnapshot();
        onEditApplied(before, after, label);
      } catch {
        // ignore
      }
    }
    for (const m of result.messages) {
      push({ role: result.failed > 0 ? "error" : "assistant", text: m });
    }
  };

  /** Thử parse lệnh chỉnh sửa deterministic trước khi gọi AI. */
  const tryEditCommand = async (prompt: string): Promise<boolean> => {
    if (!adapter) return false;
    let names: string[] = [];
    try {
      names = await adapter.getObjectNames();
    } catch {
      return false;
    }
    if (names.length === 0) return false;

    // Cho phép bỏ tên object khi đang chọn sẵn trong Inspector
    let text = prompt;
    if (selectedObject) {
      if (/^(xóa|xoá|ẩn|hiện|delete|hide|show)\s*$/i.test(prompt)) {
        text = `${prompt} ${selectedObject}`;
      } else if (/^(di chuyển|đặt|move)\s+(đến|tới|tại)?\s*\(?-?\d/i.test(prompt)) {
        text = prompt.replace(/^(di chuyển|đặt|move)/i, `$1 ${selectedObject}`);
      } else if (/^(đổi màu|tô màu|color)\s+(thành|sang|to)?\s*[a-z_#0-9]+\s*$/i.test(prompt)) {
        text = prompt.replace(/^(đổi màu|tô màu|color)/i, `$1 ${selectedObject}`);
      }
    }

    const parsed = parseEditCommand(text, names);
    if (!parsed) {
      // Fallback: AI-based edit — chỉ khi prompt có từ khóa chỉnh sửa
      // (tránh gọi edits API cho mọi construction prompt)
      const editish = /sửa|chỉnh|xóa|xoá|di chuyển|đổi|màu|ẩn|hiện|tên|delete|move|color|hide|show|remove|rename|đổi tên/i.test(prompt);
      if (editish) return tryAIEdit(prompt, names);
      return false;
    }
    if (!parsed.ok) {
      push({ role: "error", text: parsed.reason });
      return true;
    }
    await applyWithSnapshot(parsed.operations, "edit");
    return true;
  };

  /** AI edit: gửi construction context → EditPlan → confirm → apply. */
  const tryAIEdit = async (prompt: string, names: string[]): Promise<boolean> => {
    if (!adapter) return false;
    const objects = await Promise.all(
      names.slice(0, 100).map(async (name) => ({
        name,
        type: (await adapter.getObjectType(name)) ?? undefined,
        value: (await adapter.getObjectValue(name)) ?? undefined,
      })),
    );

    const res = await aiFetch("/api/v1/ai/edits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, objects }),
    });
    const envelope = (await res.json()) as
      | { ok: true; data: { status: string; plan?: EditPlan; reason?: string } }
      | { ok: false; error: { code: string; message: string } };

    if (!envelope.ok) {
      push({ role: "error", text: envelope.error.message });
      return true; // đã xử lý — không fallback sang construction
    }
    if (envelope.data.status === "not_an_edit") {
      return false; // để submit() gọi construction API
    }
    const plan = envelope.data.plan;
    if (!plan) return false;

    const hasDelete = plan.operations.some((o) => o.type === "delete_object");
    if (plan.requiresConfirmation || hasDelete) {
      const ok = window.confirm(
        `AI đề xuất: ${plan.summary}\n\n${plan.operations.map((o) => `• ${o.type}: ${o.target}`).join("\n")}\n\nÁp dụng?`,
      );
      if (!ok) {
        push({ role: "assistant", text: "Đã hủy chỉnh sửa." });
        return true;
      }
    }

    push({ role: "assistant", text: plan.summary });
    await applyWithSnapshot(plan.operations, plan.summary);
    return true;
  };

  const submit = async (text: string) => {
    const prompt = text.trim();
    if (!prompt || loading) return;
    setInput("");
    setQuestions([]);
    push({ role: "user", text: prompt });
    setLoading(true);

    try {
      if (await tryEditCommand(prompt)) return;
      const res = await aiFetch("/api/v1/ai/constructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, mode: "2d" }),
      });
      const envelope = (await res.json()) as ApiEnvelope;

      if (!envelope.ok) {
        push({ role: "error", text: envelope.error.message });
        return;
      }

      const data = envelope.data;
      if (data.status === "needs_clarification") {
        setQuestions(data.questions);
        push({
          role: "assistant",
          text: data.questions.map((q) => q.question).join("\n"),
        });
        return;
      }
      if (data.status === "error") {
        push({ role: "error", text: data.message });
        return;
      }

      push({ role: "assistant", text: data.summary });
      if (data.warnings.length > 0) {
        push({ role: "assistant", text: `Lưu ý: ${data.warnings.join("; ")}` });
      }
      await executePlan(data.plan);
    } catch (err) {
      push({
        role: "error",
        text: err instanceof Error ? err.message : "Lỗi kết nối server",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5">
        <span className="text-xs font-medium text-foreground/60">
          Lịch sử được lưu local trên máy này
        </span>
        <div className="flex items-center gap-2">
          <span
            className="text-[10px]"
            title="Nguồn Gemini API key — đổi trong Cài đặt"
          >
            {loadSettings().geminiKey.trim() ? (
              <span className="text-success">● key riêng</span>
            ) : (
              <span className="text-warning">○ key server</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem(CHAT_KEY);
              setMessages([messages[0]]);
            }}
            className="text-xs text-foreground/50 hover:text-danger"
          >
            Xóa lịch sử
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={
              m.role === "user"
                ? "ml-8 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                : m.role === "error"
                  ? "mr-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
                  : "mr-4 rounded-lg bg-surface-muted px-3 py-2 text-sm"
            }
          >
            <p className="whitespace-pre-wrap">{m.text}</p>
          </div>
        ))}
        {loading && (
          <div className="mr-4 rounded-lg bg-surface-muted px-3 py-2 text-sm text-foreground/60">
            AI đang dựng hình…
          </div>
        )}
      </div>

      {questions.length > 0 && (
        <div className="space-y-1 border-t border-border p-3">
          {questions.map((q) => (
            <div key={q.id} className="flex flex-wrap gap-1">
              {q.options?.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => submit(`${opt} `)}
                  className="rounded-md border border-border px-2 py-1 text-xs hover:border-primary/50"
                >
                  {opt}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {imageResult && (
        <div className="space-y-2 border-t border-border p-3">
          {imagePreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imagePreview}
              alt="Ảnh đề toán"
              className="max-h-24 rounded-md border border-border object-contain"
            />
          )}
          <p className="text-xs font-medium text-foreground/70">
            Dữ kiện từ ảnh — tick để xác nhận:
          </p>
          <ul className="max-h-40 space-y-1 overflow-auto">
            {imageResult.facts.map((fact, i) => (
              <li key={fact.id ?? i} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={fact.confirmed}
                  onChange={(e) => {
                    const next = { ...imageResult };
                    next.facts = next.facts.map((f, j) =>
                      j === i ? { ...f, confirmed: e.target.checked } : f,
                    );
                    setImageResult(next);
                  }}
                  className="mt-1"
                />
                <span>{fact.statement}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={buildFromImage}
              disabled={imageResult.facts.every((f) => !f.confirmed)}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              Dựng hình từ dữ kiện đã chọn
            </button>
            <button
              type="button"
              onClick={() => {
                setImageResult(null);
                setImagePreview(null);
              }}
              className="rounded-md border border-border px-3 py-1.5 text-xs"
            >
              Bỏ qua
            </button>
          </div>
        </div>
      )}

      <form
        className="flex gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(input);
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setImagePreview(URL.createObjectURL(file));
              void analyzeImage(file);
            }
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading || imageLoading}
          title="Tải ảnh đề toán (JPEG/PNG/WebP, ≤10MB)"
          className="rounded-md border border-border px-3 py-2 text-sm hover:border-primary/50 disabled:opacity-50"
        >
          {imageLoading ? "…" : "📷"}
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={SAMPLE}
          disabled={loading}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Gửi
        </button>
      </form>
    </div>
  );
}
