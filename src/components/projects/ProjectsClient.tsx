"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  deleteProject,
  listProjects,
  newProjectId,
  saveProject,
  type LocalProject,
} from "@/lib/persistence";
import { isSupabaseEnabled } from "@/lib/persistence/supabaseStore";

export function ProjectsClient() {
  const [projects, setProjects] = useState<LocalProject[]>([]);

  const refresh = useCallback(async () => {
    setProjects(await listProjects());
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(t);
  }, [refresh]);

  const remove = (id: string) => {
    void deleteProject(id).then(refresh);
  };

  const rename = (p: LocalProject) => {
    const title = window.prompt("Tên dự án mới:", p.title)?.trim();
    if (!title || title === p.title) return;
    void saveProject({ ...p, title }).then(refresh);
  };

  const duplicate = (p: LocalProject) => {
    void saveProject({
      ...p,
      id: newProjectId(),
      title: `${p.title} (bản sao)`,
      savedAt: new Date().toISOString(),
    }).then(refresh);
  };

  if (projects.length === 0) {
    return (
      <div className="glass animate-fade-up rounded-2xl p-10 text-center">
        <p className="text-sm text-foreground/70">Chưa có dự án nào.</p>
        <p className="mt-2 text-xs text-foreground/50">
          Dựng hình trong Workspace rồi bấm “💾 Lưu”.
          {isSupabaseEnabled()
            ? " Đang lưu cloud qua Supabase."
            : " Dữ liệu lưu local trên máy này — chưa đồng bộ cloud."}
        </p>
        <Link
          href="/workspace"
          className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Mở Workspace
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {projects.map((p) => (
        <li
          key={p.id}
          className="glass flex animate-fade-up items-center gap-3 rounded-2xl px-4 py-3 transition-all hover:border-primary/40"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{p.title}</p>
            <p className="text-xs text-foreground/50">
              Lưu lúc {new Date(p.savedAt).toLocaleString("vi-VN")}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => rename(p)}
              title="Đổi tên"
              className="rounded-md border border-border px-2.5 py-1.5 text-xs hover:border-primary/50"
            >
              ✎
            </button>
            <button
              type="button"
              onClick={() => duplicate(p)}
              title="Nhân bản"
              className="rounded-md border border-border px-2.5 py-1.5 text-xs hover:border-primary/50"
            >
              ⧉
            </button>
          </div>
          <Link
            href={`/workspace?load=${p.id}`}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            Mở
          </Link>
          <button
            type="button"
            onClick={() => remove(p.id)}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-danger hover:bg-danger/10"
          >
            Xóa
          </button>
        </li>
      ))}
    </ul>
  );
}
