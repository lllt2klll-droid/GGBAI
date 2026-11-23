"use client";

import { useEffect, useRef, useState } from "react";
import {
  Key,
  HardDrive,
  Download,
  Upload,
  Eye,
  EyeOff,
  Check,
} from "lucide-react";
import {
  GEMINI_MODELS,
  loadSettings,
  saveSettings,
  type AppSettings,
} from "@/lib/settings";
import {
  deleteProject,
  listProjects,
  newProjectId,
  saveProject,
  type LocalProject,
} from "@/lib/persistence";
import { isSupabaseEnabled } from "@/lib/persistence/supabaseStore";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";

function Section({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: React.ElementType;
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-card p-5 animate-fade-up">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {desc && <p className="text-xs text-foreground/60">{desc}</p>}
        </div>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

export function SettingsClient() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [savedToast, setSavedToast] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [projects, setProjects] = useState<LocalProject[]>([]);
  const [confirmClearChat, setConfirmClearChat] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [notificationMsg, setNotificationMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setSettings(loadSettings());
      void listProjects().then(setProjects);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  if (!settings) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-40 rounded-2xl border border-border bg-surface-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  const update = (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
    setSavedToast(true);
    window.dispatchEvent(new Event("ggb-settings-changed"));
    setTimeout(() => setSavedToast(false), 2000);
  };

  const handleExportAll = async () => {
    const all = await listProjects();
    const blob = new Blob([JSON.stringify(all, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ggb-ai-projects-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setNotificationMsg(`Đã xuất thành công ${all.length} dự án.`);
  };

  const handleImportAll = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as LocalProject[];
      if (!Array.isArray(data)) throw new Error("bad format");
      let n = 0;
      for (const p of data) {
        if (p?.snapshot && p?.title) {
          await saveProject({ ...p, id: newProjectId() });
          n += 1;
        }
      }
      setProjects(await listProjects());
      setNotificationMsg(`Đã nhập thành công ${n} dự án vào máy này.`);
    } catch {
      setNotificationMsg("Tệp JSON không đúng cấu trúc dự án GeoGebra AI.");
    }
  };

  const handleClearChatConfirm = () => {
    localStorage.removeItem("ggb-ai-chat");
    setNotificationMsg("Đã xóa toàn bộ lịch sử tin nhắn.");
  };

  const handleClearAllConfirm = async () => {
    for (const p of projects) await deleteProject(p.id);
    localStorage.removeItem("ggb-ai-chat");
    localStorage.removeItem("ggb-ai-settings");
    localStorage.removeItem("ggb-ai-theme");
    localStorage.removeItem("ggb-ai-projects");
    setProjects([]);
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Cài đặt ứng dụng
          </h1>
          <p className="mt-0.5 text-xs text-foreground/60">
            Quản lý khóa API, mô hình AI và dữ liệu lưu trữ trên thiết bị
          </p>
        </div>

        {savedToast && (
          <div className="flex items-center gap-1.5 rounded-lg bg-success/10 px-3 py-1 text-xs font-medium text-success animate-fade-up">
            <Check className="h-3.5 w-3.5" />
            <span>Đã tự động lưu</span>
          </div>
        )}
      </header>

      {/* 1. Gemini AI Configuration */}
      <Section
        icon={Key}
        title="Trí tuệ Nhân tạo (Google Gemini)"
        desc="Cấu hình API Key và Model được sử dụng khi gửi prompt dựng hình"
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Gemini API Key cá nhân (Tùy chọn)
            </label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={settings.geminiKey}
                onChange={(e) => update({ geminiKey: e.target.value })}
                placeholder="AIzaSy..."
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground outline-none transition-colors focus:border-primary pr-9"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2.5 top-2.5 text-foreground/40 hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-foreground/50">
              Nếu để trống, hệ thống sẽ tự động dùng key cấu hình trên server (nếu có). Key cá nhân được mã hóa lưu trữ local trên máy của bạn.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Phiên bản Model AI
            </label>
            <select
              value={settings.geminiModel}
              onChange={(e) => update({ geminiModel: e.target.value })}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground outline-none transition-colors focus:border-primary"
            >
              {GEMINI_MODELS.map((model) => (
                <option key={model} value={model}>
                  {model} {model === "gemini-2.5-flash" ? "(Mặc định - Nhanh & chuẩn xác)" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      {/* 2. Data & Storage Management */}
      <Section
        icon={HardDrive}
        title="Quản lý Dữ liệu & Bản vẽ"
        desc="Sao lưu, phục hồi hoặc dọn dẹp các mô hình đã lưu trên trình duyệt"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-surface-muted/50 p-3 text-xs">
            <div>
              <span className="font-semibold text-foreground">
                Dự án hiện có: {projects.length}
              </span>
              <p className="text-[11px] text-foreground/60 mt-0.5">
                {isSupabaseEnabled()
                  ? "Đã đồng bộ hóa với Supabase Cloud Database"
                  : "Đang lưu trữ trong bộ nhớ LocalStorage của trình duyệt"}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleExportAll()}
                disabled={projects.length === 0}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-muted transition-colors disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Sao lưu JSON</span>
              </button>

              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImportAll(file);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-muted transition-colors"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Khôi phục</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setConfirmClearChat(true)}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-foreground/70 hover:text-danger hover:border-danger/40 transition-colors"
            >
              Xóa lịch sử tin nhắn AI
            </button>

            <button
              type="button"
              onClick={() => setConfirmClearAll(true)}
              className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-1.5 text-xs text-danger hover:bg-danger/10 transition-colors"
            >
              Xóa toàn bộ dữ liệu ứng dụng
            </button>
          </div>
        </div>
      </Section>

      {/* Confirm Clear Chat Modal */}
      <ConfirmDialog
        isOpen={confirmClearChat}
        onClose={() => setConfirmClearChat(false)}
        onConfirm={handleClearChatConfirm}
        title="Xóa lịch sử tin nhắn?"
        message="Thao tác này sẽ xóa toàn bộ nội dung hội thoại với AI."
        confirmText="Xóa tin nhắn"
        isDestructive={true}
      />

      {/* Confirm Clear All Data Modal */}
      <ConfirmDialog
        isOpen={confirmClearAll}
        onClose={() => setConfirmClearAll(false)}
        onConfirm={() => void handleClearAllConfirm()}
        title="Xóa TOÀN BỘ dữ liệu ứng dụng?"
        message="Hành động này sẽ xóa vĩnh viễn tất cả dự án, lịch sử chat và cấu hình đã lưu trên trình duyệt này."
        confirmText="Xóa tất cả"
        isDestructive={true}
      />

      {/* Generic Notification Modal */}
      <Modal
        isOpen={notificationMsg !== null}
        onClose={() => setNotificationMsg(null)}
        title="Thông báo"
        maxWidth="sm"
      >
        <p className="text-sm text-foreground/80">{notificationMsg}</p>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => setNotificationMsg(null)}
            className="rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Đóng
          </button>
        </div>
      </Modal>
    </div>
  );
}
