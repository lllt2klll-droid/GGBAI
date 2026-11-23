"use client";

import { useEffect, useRef, useState } from "react";
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

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass animate-fade-up rounded-2xl p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {desc && <p className="mt-1 text-xs text-foreground/60">{desc}</p>}
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-medium text-foreground/70">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-border bg-surface/70 px-3 py-2 text-sm outline-none transition-colors focus:border-primary";

export function SettingsClient() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [projects, setProjects] = useState<LocalProject[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setSettings(loadSettings());
      void listProjects().then(setProjects);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  if (!settings) {
    return <div className="skeleton h-64 rounded-2xl" />;
  }

  const update = (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
    setSaved(true);
    window.dispatchEvent(new Event("ggb-settings-changed"));
    setTimeout(() => setSaved(false), 1500);
  };

  const exportAll = async () => {
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
  };

  const importAll = async (file: File) => {
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
      window.alert(`Đã nhập ${n} dự án`);
    } catch {
      window.alert("File không hợp lệ");
    }
  };

  const clearChat = () => {
    localStorage.removeItem("ggb-ai-chat");
    window.alert("Đã xóa lịch sử chat");
  };

  const clearAll = async () => {
    if (!window.confirm("Xóa TOÀN BỘ dữ liệu local (projects, chat, settings)?"))
      return;
    for (const p of projects) await deleteProject(p.id);
    localStorage.removeItem("ggb-ai-chat");
    localStorage.removeItem("ggb-ai-settings");
    localStorage.removeItem("ggb-ai-theme");
    localStorage.removeItem("ggb-ai-projects");
    setProjects([]);
    window.location.reload();
  };

  return (
    <div className="space-y-4">
      <header className="animate-fade-up">
        <h1 className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-2xl font-bold text-transparent">
          Cài đặt
        </h1>
        <p className="mt-1 text-sm text-foreground/60">
          Tất cả dữ liệu lưu local trên máy này — không gửi đi đâu ngoài
          request AI bạn chủ động tạo.
        </p>
      </header>

      {/* AI */}
      <Section
        title="Trí tuệ nhân tạo (Gemini)"
        desc="Key lưu trong localStorage của trình duyệt, chỉ gửi tới server app qua HTTPS khi bạn dùng AI. Ưu tiên hơn key server."
      >
        <Row label="Gemini API Key">
          <input
            type="password"
            className={inputCls}
            placeholder="AIza... (để trống = dùng key server)"
            value={settings.geminiKey}
            onChange={(e) => update({ geminiKey: e.target.value })}
            autoComplete="off"
          />
        </Row>
        <Row label="Model">
          <select
            className={inputCls}
            value={settings.geminiModel}
            onChange={(e) => update({ geminiModel: e.target.value })}
          >
            {GEMINI_MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Row>
        <p className="text-xs text-foreground/50">
          Trạng thái:{" "}
          <span
            className={
              settings.geminiKey.trim()
                ? "font-medium text-success"
                : "font-medium text-warning"
            }
          >
            {settings.geminiKey.trim()
              ? "● Đang dùng key riêng của bạn"
              : "○ Chưa có key — sẽ dùng key server (nếu có) hoặc báo lỗi"}
          </span>
        </p>
        {saved && <p className="text-xs text-success">Đã lưu ✓</p>}
      </Section>

      {/* Appearance */}
      <Section title="Giao diện" desc="Theme sáng/tối chuyển bằng nút ◐ trên thanh trên cùng.">
        <Row label="Độ kính mờ (glass)">
          <select
            className={inputCls}
            value={settings.glass}
            onChange={(e) => update({ glass: Number(e.target.value) as 0 | 1 | 2 })}
          >
            <option value={0}>Tắt — nền đặc</option>
            <option value={1}>Vừa — glass nhẹ</option>
            <option value={2}>Mạnh — kính mờ đậm</option>
          </select>
        </Row>
      </Section>

      {/* Data */}
      <Section
        title="Dữ liệu"
        desc={
          isSupabaseEnabled()
            ? "Projects đang lưu cloud qua Supabase (gắn với tài khoản)."
            : "Projects đang lưu localStorage trên máy này."
        }
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void exportAll()}
            className="rounded-xl border border-border px-4 py-2 text-sm hover:border-primary/50"
          >
            ⬇ Export {projects.length} dự án (JSON)
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-xl border border-border px-4 py-2 text-sm hover:border-primary/50"
          >
            ⬆ Import dự án
          </button>
          <button
            type="button"
            onClick={clearChat}
            className="rounded-xl border border-border px-4 py-2 text-sm hover:border-primary/50"
          >
            Xóa lịch sử chat
          </button>
          <button
            type="button"
            onClick={() => void clearAll()}
            className="rounded-xl border border-danger/40 px-4 py-2 text-sm text-danger hover:bg-danger/10"
          >
            Xóa toàn bộ dữ liệu
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importAll(f);
            e.target.value = "";
          }}
        />
      </Section>

      {/* About */}
      <Section title="Giới thiệu">
        <p className="text-xs leading-relaxed text-foreground/60">
          GeoGebra AI Studio — dựng hình học bằng ngôn ngữ tự nhiên.
          Canvas GeoGebra nhúng trực tiếp, AI chỉ phát lệnh qua allowlist
          an toàn. Phiên bản 0.1.0.
        </p>
      </Section>
    </div>
  );
}
