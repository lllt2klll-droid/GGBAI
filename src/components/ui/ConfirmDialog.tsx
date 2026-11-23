"use client";

import { Modal } from "./Modal";
import { AlertTriangle, Info } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  details?: string[];
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  details,
  confirmText = "Xác nhận",
  cancelText = "Hủy",
  isDestructive = false,
}: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="sm">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            isDestructive
              ? "bg-danger/10 text-danger"
              : "bg-primary/10 text-primary"
          }`}
        >
          {isDestructive ? (
            <AlertTriangle className="h-5 w-5" />
          ) : (
            <Info className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-sm text-foreground/70">{message}</p>

          {details && details.length > 0 && (
            <ul className="mt-3 max-h-36 overflow-auto rounded-lg border border-border/70 bg-surface-muted/50 p-2 text-xs text-foreground/80 space-y-1">
              {details.map((item, idx) => (
                <li key={idx} className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-foreground/40" />
                  <span className="truncate">{item}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-surface-muted hover:text-foreground transition-colors"
        >
          {cancelText}
        </button>
        <button
          type="button"
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
            isDestructive
              ? "bg-danger text-white hover:bg-danger/90"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          }`}
        >
          {confirmText}
        </button>
      </div>
    </Modal>
  );
}
