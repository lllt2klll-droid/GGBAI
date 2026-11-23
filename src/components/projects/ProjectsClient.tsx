"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  deleteProject,
  listProjects,
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

  if (projects.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface p-10 text-center">
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
          className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{p.title}</p>
            <p className="text-xs text-foreground/50">
              Lưu lúc {new Date(p.savedAt).toLocaleString("vi-VN")}
            </p>
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
