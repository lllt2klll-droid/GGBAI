"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  User,
  Send,
  Image as ImageIcon,
  Trash2,
  Sparkles,
  ArrowRight,
  Layers,
  Check,
  X,
  RotateCcw,
  Code2,
  Copy,
} from "lucide-react";
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
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ManualCodeModal } from "./ManualCodeModal";
import { parseManualCode } from "@/lib/geogebra/manualCodeParser";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
  plan?: Extract<AIConstructionResponse, { status: "ok" }>["plan"];
  editPlan?: EditPlan;
  questions?: ClarificationQuestion[];
  imageResult?: ImageAnalysisResult;
  imagePreviewUrl?: string;
  retryPrompt?: string;
};

type ApiEnvelope =
  | { ok: true; data: AIConstructionResponse }
  | { ok: false; error: { code: string; message: string; issues?: unknown } };

const CHAT_KEY = "ggb-ai-chat";
const CHAT_MAX = 50;

const SUGGESTED_PROMPTS = [
  "Tam giác ABC vuông tại A, đường cao AH",
  "Đường tròn tâm O bán kính 3cm, điểm A ngoài đường tròn",
  "Hình bình hành ABCD, giao điểm hai đường chéo O",
  "Tam giác ABC, trung tuyến AM và trọng tâm G",
];

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
    // Không lưu blob url ảnh vào localStorage
    const storable = messages.map((m) => ({
      id: m.id,
      role: m.role,
      text: m.text,
      plan: m.plan,
      editPlan: m.editPlan,
      questions: m.questions,
      imageResult: m.imageResult,
    }));
    localStorage.setItem(CHAT_KEY, JSON.stringify(storable.slice(-CHAT_MAX)));
  } catch {
    // quota
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
      text: "Xin chào! Nhập yêu cầu hình học bằng tiếng Việt hoặc tải ảnh đề bài. Ví dụ: “Tam giác ABC vuông tại A, đường cao AH”.",
    },
  ]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [confirmClearChat, setConfirmClearChat] = useState(false);
  const [manualCodeModalOpen, setManualCodeModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleExecuteManualCode = async (
    commands: SafeGeoGebraCommand[],
    label: string,
  ): Promise<boolean> => {
    push({
      role: "user",
      text: `[Mã thủ công] ${label}`,
    });
    if (executeCommands) {
      const result = await executeCommands(commands, "Mã thủ công");
      push({
        role: result.failed > 0 ? "error" : "assistant",
        text:
          result.failed > 0
            ? `Đã dựng ${result.ok}/${commands.length} đối tượng (${result.failed} lệnh thất bại: ${result.lastError ?? ""}).`
            : `Đã hoàn tất dựng ${result.ok} đối tượng lên bản vẽ GeoGebra.`,
      });
      return result.ok > 0;
    }
    if (adapter) {
      let ok = 0;
      let failed = 0;
      for (const cmd of commands) {
        const res = await adapter.executeCommand(cmd);
        if (res.success) ok += 1;
        else failed += 1;
      }
      push({
        role: failed > 0 ? "error" : "assistant",
        text:
          failed > 0
            ? `Đã dựng ${ok}/${commands.length} đối tượng — ${failed} lệnh thất bại.`
            : `Đã hoàn tất dựng ${ok} đối tượng lên bản vẽ GeoGebra.`,
      });
      return ok > 0;
    }
    return false;
  };

  // Load chat history
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

  // Save chat history
  useEffect(() => {
    if (loaded) saveChat(messages);
  }, [messages, loaded]);

  // Scroll to bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const push = (msg: Omit<ChatMessage, "id">) =>
    setMessages((prev) => [
      ...prev,
      { ...msg, id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` },
    ]);

  const executePlan = async (
    plan: Extract<AIConstructionResponse, { status: "ok" }>["plan"],
  ) => {
    if (!adapter) {
      push({
        role: "error",
        text: "Canvas GeoGebra chưa sẵn sàng. Vui lòng thử lại sau giây lát.",
      });
      return;
    }

    const commands: SafeGeoGebraCommand[] = plan.operations.map((op) => ({
      operationId: op.operationId,
      commandKey: op.commandKey,
      args: op.args,
    }));

    if (executeCommands) {
      const result = await executeCommands(commands, "AI Construction");
      push({
        role: result.failed > 0 ? "error" : "assistant",
        text:
          result.failed > 0
            ? `Đã dựng ${result.ok}/${commands.length} đối tượng (${result.failed} lệnh thất bại: ${result.lastError ?? ""}).`
            : `Đã hoàn tất dựng ${result.ok} đối tượng lên bản vẽ GeoGebra.`,
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

  const applyWithSnapshot = async (
    operations: Parameters<typeof applyEditOperations>[1],
    label: string,
  ) => {
    if (!adapter) return;
    let before: GeoGebraSnapshot | null = null;
    try {
      before = await adapter.exportSnapshot();
    } catch {
      // snapshot unavailable
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

  const tryEditCommand = async (prompt: string): Promise<boolean> => {
    if (!adapter) return false;
    let names: string[] = [];
    try {
      names = await adapter.getObjectNames();
    } catch {
      return false;
    }
    if (names.length === 0) return false;

    let text = prompt;
    if (selectedObject) {
      if (/^(xóa|xoá|ẩn|hiện|delete|hide|show)\s*$/i.test(prompt)) {
        text = `${prompt} ${selectedObject}`;
      } else if (/^(di chuyển|đặt|move)\s+(đến|tới|tại)?\s*\(?-?\d/i.test(prompt)) {
        text = prompt.replace(/^(di chuyển|đặt|move)/i, `$1 ${selectedObject}`);
      } else if (
        /^(đổi màu|tô màu|color)\s+(thành|sang|to)?\s*[a-z_#0-9]+\s*$/i.test(
          prompt,
        )
      ) {
        text = prompt.replace(/^(đổi màu|tô màu|color)/i, `$1 ${selectedObject}`);
      }
    }

    const parsed = parseEditCommand(text, names);
    if (!parsed) {
      const editish =
        /sửa|chỉnh|xóa|xoá|di chuyển|đổi|màu|ẩn|hiện|tên|delete|move|color|hide|show|remove|rename|đổi tên/i.test(
          prompt,
        );
      if (editish) return tryAIEdit(prompt, names);
      return false;
    }
    if (!parsed.ok) {
      push({ role: "error", text: parsed.reason });
      return true;
    }
    await applyWithSnapshot(parsed.operations, "Chỉnh sửa");
    return true;
  };

  const tryAIEdit = async (
    prompt: string,
    names: string[],
  ): Promise<boolean> => {
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
      return true;
    }
    if (envelope.data.status === "not_an_edit") {
      return false;
    }
    const plan = envelope.data.plan;
    if (!plan) return false;

    // Thay vì window.confirm, hiển thị EditPlanCard trực tiếp trong chat
    push({
      role: "assistant",
      text: plan.summary,
      editPlan: plan,
    });
    return true;
  };

  const handleApplyEditPlan = async (plan: EditPlan) => {
    await applyWithSnapshot(plan.operations, plan.summary);
  };

  const analyzeImage = async (file: File) => {
    setImageLoading(true);
    const previewUrl = URL.createObjectURL(file);
    push({
      role: "user",
      text: `[Tải ảnh đề toán: ${file.name}]`,
      imagePreviewUrl: previewUrl,
    });

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

      push({
        role: "assistant",
        text: `Đã phân tích ảnh: ${envelope.data.description}. Chọn các dữ kiện bạn muốn dựng:`,
        imageResult: envelope.data,
      });

      if (envelope.data.warnings.length > 0) {
        push({
          role: "assistant",
          text: `Lưu ý đề toán: ${envelope.data.warnings.join("; ")}`,
        });
      }
    } catch (err) {
      push({
        role: "error",
        text: err instanceof Error ? err.message : "Lỗi khi phân tích ảnh",
      });
    } finally {
      setImageLoading(false);
    }
  };

  const handleBuildFromFacts = (
    description: string,
    confirmedFacts: string[],
  ) => {
    const prompt = `${description}. Dữ kiện: ${confirmedFacts.join("; ")}`;
    void submit(prompt);
  };

  const submit = async (text: string) => {
    const prompt = text.trim();
    if (!prompt || loading) return;
    setInput("");

    // Tự động nhận diện nếu người dùng dán trực tiếp mã JSON từ AI hoặc script dòng lệnh GeoGebra
    const looksLikeCode =
      prompt.startsWith("{") ||
      prompt.startsWith("[") ||
      prompt.includes("Polygon(") ||
      prompt.includes("Segment(") ||
      prompt.includes("Circle(") ||
      prompt.includes("Intersect(") ||
      (prompt.includes("=") && prompt.includes("(") && prompt.includes(")"));

    if (looksLikeCode) {
      const parsed = parseManualCode(prompt);
      if (parsed.ok) {
        setLoading(true);
        try {
          await handleExecuteManualCode(parsed.commands, parsed.summary);
        } finally {
          setLoading(false);
        }
        return;
      }
    }

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
        push({ role: "error", text: envelope.error.message, retryPrompt: prompt });
        return;
      }

      const data = envelope.data;
      if (data.status === "needs_clarification") {
        push({
          role: "assistant",
          text: "AI cần làm rõ một số chi tiết trước khi dựng hình:",
          questions: data.questions,
        });
        return;
      }
      if (data.status === "error") {
        push({ role: "error", text: data.message, retryPrompt: prompt });
        return;
      }

      // Display plan card and auto-execute
      push({
        role: "assistant",
        text: data.summary,
        plan: data.plan,
      });

      if (data.warnings.length > 0) {
        push({
          role: "assistant",
          text: `Ghi chú: ${data.warnings.join("; ")}`,
        });
      }

      await executePlan(data.plan);
    } catch (err) {
      push({
        role: "error",
        text: err instanceof Error ? err.message : "Lỗi kết nối tới AI service",
        retryPrompt: prompt,
      });
    } finally {
      setLoading(false);
    }
  };

  const settings = loadSettings();
  const hasUserKey = Boolean(settings.geminiKey.trim());

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-border/70 px-3.5 py-2 text-xs">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <span className="font-semibold text-foreground">AI Trợ lý</span>
          <span
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
            title={hasUserKey ? "Sử dụng Gemini API Key cá nhân" : "Sử dụng Key cấu hình trên Server"}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                hasUserKey ? "bg-success" : "bg-warning"
              }`}
            />
            <span className="text-foreground/60">
              {hasUserKey ? "Key cá nhân" : "Key server"}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setManualCodeModalOpen(true)}
            title="Nhập hoặc dán mã code / JSON thủ công để dựng hình"
            className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-[11px] font-medium text-foreground/80 hover:border-primary/50 hover:text-primary transition-colors"
          >
            <Code2 className="h-3 w-3 text-primary" />
            <span>Nhập code</span>
          </button>

          <button
            type="button"
            onClick={() => setConfirmClearChat(true)}
            title="Xóa toàn bộ tin nhắn"
            className="rounded p-1 text-foreground/40 hover:bg-surface-muted hover:text-danger transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto p-3.5 space-y-3.5">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col gap-1.5 ${
              m.role === "user" ? "items-end" : "items-start"
            }`}
          >
            {/* Header role */}
            <div className="flex items-center gap-1 text-[10px] text-foreground/40 px-1">
              {m.role === "user" ? (
                <>
                  <span>Bạn</span>
                  <User className="h-3 w-3" />
                </>
              ) : (
                <>
                  <Bot className="h-3 w-3 text-primary" />
                  <span>Trợ lý AI</span>
                </>
              )}
            </div>

            {/* Bubble */}
            <div
              className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : m.role === "error"
                    ? "border border-danger/40 bg-danger/10 text-danger"
                    : "border border-border/80 bg-surface text-foreground shadow-sm"
              }`}
            >
              {/* Optional Attached Image Preview */}
              {m.imagePreviewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.imagePreviewUrl}
                  alt="Ảnh đề toán"
                  className="mb-2 max-h-40 rounded-lg border border-border object-contain"
                />
              )}

              <p className="whitespace-pre-wrap">{m.text}</p>

              {/* Retry Button on Error */}
              {m.role === "error" && m.retryPrompt && (
                <button
                  type="button"
                  onClick={() => void submit(m.retryPrompt!)}
                  disabled={loading}
                  className="mt-2.5 flex items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-1 text-[11px] font-medium text-danger hover:bg-danger/20 transition-colors disabled:opacity-40"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Thử lại yêu cầu</span>
                </button>
              )}

              {/* Construction Plan Card */}
              {m.plan && (
                <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-2.5 text-foreground">
                  <div className="flex items-center justify-between gap-1 text-[11px] font-semibold text-primary mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Layers className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Kế hoạch dựng hình ({m.plan.operations.length} bước)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const exportData = {
                          operations: m.plan!.operations.map((op) => ({
                            commandKey: op.commandKey,
                            args: op.args,
                          })),
                        };
                        void navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
                        setCopiedId(m.id);
                        setTimeout(() => setCopiedId(null), 2000);
                      }}
                      title="Sao chép toàn bộ mã lệnh JSON này"
                      className="flex items-center gap-1 shrink-0 rounded px-1.5 py-0.5 text-[10px] text-primary/80 hover:bg-primary/10 hover:text-primary transition-colors"
                    >
                      {copiedId === m.id ? (
                        <>
                          <Check className="h-3 w-3 text-success" />
                          <span className="text-success font-medium">Đã sao chép</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Sao chép mã</span>
                        </>
                      )}
                    </button>
                  </div>
                  <ul className="space-y-1 text-[11px] text-foreground/80 max-h-36 overflow-auto">
                    {m.plan.operations.map((op, idx) => (
                      <li key={idx} className="flex items-center gap-1.5">
                        <span className="h-1 w-1 rounded-full bg-primary" />
                        <span className="font-mono text-[10px] font-medium text-primary">
                          {op.commandKey}
                        </span>
                        <span className="truncate text-foreground/60">
                          {JSON.stringify(op.args)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Edit Plan Card with Diff & Buttons */}
              {m.editPlan && (
                <div className="mt-3 rounded-xl border border-warning/30 bg-warning/5 p-2.5 text-foreground space-y-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-warning">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Đề xuất chỉnh sửa mô hình</span>
                  </div>
                  <ul className="space-y-1 text-[11px]">
                    {m.editPlan.operations.map((op, idx) => (
                      <li
                        key={idx}
                        className={`flex items-center gap-1.5 rounded p-1 ${
                          op.type === "delete_object"
                            ? "bg-danger/10 text-danger"
                            : "bg-surface text-foreground/80"
                        }`}
                      >
                        {op.type === "delete_object" && (
                          <span className="font-medium">Xóa: {op.target}</span>
                        )}
                        {op.type === "move_point" && (
                          <span>
                            Di chuyển {op.target} tới ({op.x}, {op.y})
                          </span>
                        )}
                        {op.type === "set_color" && (
                          <span className="flex items-center gap-1">
                            Đổi màu {op.target} sang
                            <span
                              className="inline-block h-3 w-3 rounded-full border border-border"
                              style={{ backgroundColor: op.color }}
                            />
                          </span>
                        )}
                        {op.type === "set_visible" && (
                          <span>
                            {op.visible ? "Hiện" : "Ẩn"} {op.target}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => void handleApplyEditPlan(m.editPlan!)}
                      className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      <Check className="h-3 w-3" />
                      <span>Áp dụng</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        push({
                          role: "assistant",
                          text: "Đã hủy thao tác chỉnh sửa.",
                        })
                      }
                      className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground/70 hover:bg-surface-muted transition-colors"
                    >
                      <X className="h-3 w-3" />
                      <span>Bỏ qua</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Clarification Questions Card */}
              {m.questions && (
                <div className="mt-2.5 space-y-2 border-t border-border/70 pt-2">
                  {m.questions.map((q) => (
                    <div key={q.id} className="space-y-1.5">
                      <p className="font-medium text-foreground">{q.question}</p>
                      {q.options && (
                        <div className="flex flex-wrap gap-1.5">
                          {q.options.map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => void submit(opt)}
                              className="rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Image Analysis Card */}
              {m.imageResult && (
                <ImageAnalysisCard
                  result={m.imageResult}
                  onBuild={handleBuildFromFacts}
                />
              )}
            </div>
          </div>
        ))}

        {/* Loading Indicator */}
        {(loading || imageLoading) && (
          <div className="flex items-center gap-2 text-xs text-foreground/60 animate-fade-up">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bot className="h-3.5 w-3.5 animate-pulse-subtle" />
            </div>
            <span>
              {imageLoading
                ? "AI đang phân tích hình ảnh và trích xuất dữ kiện…"
                : "AI đang lập kế hoạch dựng hình toán học…"}
            </span>
          </div>
        )}
      </div>

      {/* Suggested quick prompt chips for empty state */}
      {messages.length <= 2 && (
        <div className="border-t border-border/60 p-2.5">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-foreground/40 mb-1.5">
            Gợi ý yêu cầu hình học:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void submit(prompt)}
                className="rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] text-foreground/75 hover:border-primary/50 hover:text-primary transition-colors text-left"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input / Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(input);
        }}
        className="border-t border-border bg-surface p-2.5 space-y-2"
      >
        <div className="flex items-center gap-1.5">
          {/* Image upload button */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                void analyzeImage(file);
              }
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || imageLoading}
            title="Tải ảnh đề toán (JPEG/PNG/WebP ≤ 10MB)"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-foreground/60 hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-40"
          >
            <ImageIcon className="h-4 w-4" />
          </button>

          {/* Manual Code / JSON Input button */}
          <button
            type="button"
            onClick={() => setManualCodeModalOpen(true)}
            disabled={loading || imageLoading}
            title="Dán mã JSON / Code thủ công để dựng hình"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-foreground/60 hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-40"
          >
            <Code2 className="h-4 w-4" />
          </button>

          {/* Text Input */}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Mô tả hình cần dựng hoặc lệnh sửa…"
            disabled={loading || imageLoading}
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface-muted/50 px-3 py-2 text-xs text-foreground outline-none transition-colors focus:border-primary focus:bg-surface"
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={loading || imageLoading || !input.trim()}
            title="Gửi yêu cầu"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>

      {/* Clear Chat Confirmation Modal */}
      <ConfirmDialog
        isOpen={confirmClearChat}
        onClose={() => setConfirmClearChat(false)}
        onConfirm={() => {
          localStorage.removeItem(CHAT_KEY);
          setMessages([messages[0]]);
        }}
        title="Xóa lịch sử chat?"
        message="Hành động này sẽ xóa toàn bộ các tin nhắn trước đây khỏi trình duyệt của bạn."
        confirmText="Xóa lịch sử"
        isDestructive={true}
      />

      {/* Manual Code / JSON Input Modal */}
      <ManualCodeModal
        isOpen={manualCodeModalOpen}
        onClose={() => setManualCodeModalOpen(false)}
        onExecute={handleExecuteManualCode}
      />
    </div>
  );
}

/** Component hiển thị kết quả phân tích ảnh với các checkbox dữ kiện */
function ImageAnalysisCard({
  result,
  onBuild,
}: {
  result: ImageAnalysisResult;
  onBuild: (description: string, confirmedFacts: string[]) => void;
}) {
  const [facts, setFacts] = useState(
    result.facts.map((f) => ({
      ...f,
      confirmed: f.confirmed ?? true,
    })),
  );

  const toggleFact = (index: number) => {
    setFacts((prev) =>
      prev.map((f, i) => (i === index ? { ...f, confirmed: !f.confirmed } : f)),
    );
  };

  const confirmedCount = facts.filter((f) => f.confirmed).length;

  return (
    <div className="mt-2.5 rounded-xl border border-border bg-surface-muted/40 p-2.5 space-y-2 text-foreground">
      <div className="flex items-center justify-between text-[11px] font-semibold">
        <span>Dữ kiện phát hiện ({facts.length})</span>
        <span className="text-foreground/50">Đã chọn: {confirmedCount}</span>
      </div>

      <ul className="max-h-44 space-y-1 overflow-auto text-[11px]">
        {facts.map((fact, idx) => (
          <li
            key={fact.id ?? idx}
            onClick={() => toggleFact(idx)}
            className="flex items-start gap-2 rounded-lg p-1.5 hover:bg-surface cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={fact.confirmed}
              onChange={() => {}}
              className="mt-0.5 rounded border-border text-primary focus:ring-primary"
            />
            <div className="min-w-0 flex-1">
              <span className="leading-snug">{fact.statement}</span>
              <div className="mt-0.5 flex items-center gap-1">
                <span className="rounded bg-surface px-1 text-[9px] text-foreground/50 border border-border/60">
                  {fact.sourceType === "problem_text"
                    ? "Đề bài"
                    : fact.sourceType === "diagram_marking"
                      ? "Ký hiệu"
                      : "Suy luận"}
                </span>
                {fact.confidence && (
                  <span className="text-[9px] text-foreground/40">
                    {Math.round(fact.confidence * 100)}%
                  </span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="pt-1">
        <button
          type="button"
          disabled={confirmedCount === 0}
          onClick={() =>
            onBuild(
              result.description,
              facts.filter((f) => f.confirmed).map((f) => f.statement),
            )
          }
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <span>Dựng hình từ {confirmedCount} dữ kiện đã chọn</span>
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
