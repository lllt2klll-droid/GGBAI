"use client";

import { useState } from "react";
import { Modal } from "./Modal";

interface PromptDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
  title: string;
  description?: string;
  initialValue?: string;
  placeholder?: string;
  submitText?: string;
  cancelText?: string;
}

function PromptDialogContent({
  onClose,
  onSubmit,
  title,
  description,
  initialValue = "",
  placeholder = "",
  submitText = "Lưu",
  cancelText = "Hủy",
}: Omit<PromptDialogProps, "isOpen">) {
  const [value, setValue] = useState(initialValue);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    onSubmit(value.trim());
    onClose();
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={title} description={description} maxWidth="sm">
      <form onSubmit={handleSubmit} className="mt-2 space-y-4">
        <div>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            autoFocus
            className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-surface-muted hover:text-foreground transition-colors"
          >
            {cancelText}
          </button>
          <button
            type="submit"
            disabled={!value.trim()}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {submitText}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function PromptDialog(props: PromptDialogProps) {
  if (!props.isOpen) return null;
  return <PromptDialogContent {...props} />;
}
