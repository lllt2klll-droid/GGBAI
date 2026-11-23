"use client";

import { useState } from "react";
import { Code2, Play, Trash2, AlertCircle, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { parseManualCode } from "@/lib/geogebra/manualCodeParser";
import type { SafeGeoGebraCommand } from "@/lib/geogebra/types";

const EXAMPLE_JSON = `{
  "schemaVersion": "1.0",
  "documentId": "tam_giac_abc",
  "mode": "2d",
  "objects": [
    { "id": "A", "label": "A", "kind": "point", "definition": { "coordinates": [0, 3], "freedom": "fixed" }, "parents": [], "visibility": "visible", "provenance": "ai_generated" },
    { "id": "B", "label": "B", "kind": "point", "definition": { "coordinates": [-3, 0], "freedom": "fixed" }, "parents": [], "visibility": "visible", "provenance": "ai_generated" },
    { "id": "C", "label": "C", "kind": "point", "definition": { "coordinates": [3, 0], "freedom": "fixed" }, "parents": [], "visibility": "visible", "provenance": "ai_generated" },
    { "id": "ABC", "label": "ABC", "kind": "triangle", "definition": {}, "parents": ["A", "B", "C"], "visibility": "visible", "provenance": "ai_generated" },
    { "id": "M", "label": "M", "kind": "midpoint", "definition": {}, "parents": ["B", "C"], "visibility": "visible", "provenance": "ai_generated" }
  ]
}`;

const EXAMPLE_SCRIPT = `A = (0, 0)
B = (4, 0)
C = (2, 3)
ABC = Polygon(A, B, C)
M = Midpoint(B, C)
AM = Segment(A, M)`;

export function ManualCodeModal({
  isOpen,
  onClose,
  onExecute,
}: {
  isOpen: boolean;
  onClose: () => void;
  onExecute: (commands: SafeGeoGebraCommand[], label: string) => Promise<boolean>;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const handleRun = async () => {
    setError(null);
    const parsed = parseManualCode(code);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    setIsExecuting(true);
    try {
      const ok = await onExecute(parsed.commands, parsed.summary);
      if (ok) {
        setCode("");
        onClose();
      } else {
        setError("Một số câu lệnh không thể thực thi lên canvas.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi khi thực thi mã.");
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nhập mã dựng hình thủ công">
      <div className="space-y-3">
        <p className="text-xs text-foreground/70">
          Dán mã <strong>Geometry JSON</strong> do AI xuất ra hoặc danh sách lệnh{" "}
          <strong>GeoGebra</strong> để trực tiếp dựng lên canvas.
        </p>

        {/* Quick Example Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-foreground/50">Mẫu gợi ý:</span>
          <button
            type="button"
            onClick={() => {
              setCode(EXAMPLE_JSON);
              setError(null);
            }}
            className="flex items-center gap-1 rounded-lg border border-border bg-surface-muted/50 px-2 py-0.5 text-foreground/80 hover:border-primary/50 hover:text-primary transition-colors"
          >
            <Sparkles className="h-3 w-3 text-primary" />
            <span>Mẫu JSON AI</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setCode(EXAMPLE_SCRIPT);
              setError(null);
            }}
            className="flex items-center gap-1 rounded-lg border border-border bg-surface-muted/50 px-2 py-0.5 text-foreground/80 hover:border-primary/50 hover:text-primary transition-colors"
          >
            <Code2 className="h-3 w-3 text-secondary" />
            <span>Mẫu Lệnh Script</span>
          </button>
          {code && (
            <button
              type="button"
              onClick={() => {
                setCode("");
                setError(null);
              }}
              className="ml-auto flex items-center gap-1 text-danger/80 hover:text-danger"
            >
              <Trash2 className="h-3 w-3" />
              <span>Xóa</span>
            </button>
          )}
        </div>

        {/* Textarea for Code */}
        <div className="relative">
          <textarea
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              if (error) setError(null);
            }}
            placeholder={`Dán mã JSON từ AI vào đây...\nVí dụ: {"objects": [...]}\n\nHoặc dán từng dòng lệnh GeoGebra:\nA = (0, 0)\nB = (4, 0)\nABC = Polygon(A, B, C)`}
            rows={10}
            className="w-full resize-y rounded-xl border border-border bg-surface-muted/30 p-3 font-mono text-xs text-foreground outline-none transition-colors focus:border-primary focus:bg-surface"
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 p-2.5 text-xs text-danger animate-fade-up">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1 break-words">{error}</div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/80">
          <button
            type="button"
            onClick={onClose}
            disabled={isExecuting}
            className="rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-muted transition-colors disabled:opacity-40"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={() => void handleRun()}
            disabled={isExecuting || !code.trim()}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 shadow-sm"
          >
            {isExecuting ? (
              <>
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                <span>Đang dựng hình…</span>
              </>
            ) : (
              <>
                <Play className="h-3 w-3 fill-current" />
                <span>Thực thi & Dựng hình</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
