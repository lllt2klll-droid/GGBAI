"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  FolderKanban,
  FileText,
  Calendar,
  Edit3,
  Copy,
  Trash2,
  ExternalLink,
  Plus,
} from "lucide-react";
import {
  deleteProject,
  listProjects,
  newProjectId,
  saveProject,
  type LocalProject,
} from "@/lib/persistence";
import { isSupabaseEnabled } from "@/lib/persistence/supabaseStore";
import { PromptDialog } from "@/components/ui/PromptDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export function ProjectsClient() {
  const [projects, setProjects] = useState<LocalProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [renameProject, setRenameProject] = useState<LocalProject | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await listProjects();
    setProjects(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(t);
  }, [refresh]);

  const handleRenameSubmit = async (newTitle: string) => {
    if (!renameProject || !newTitle || newTitle === renameProject.title) return;
    await saveProject({ ...renameProject, title: newTitle });
    await refresh();
    setRenameProject(null);
  };

  const handleDuplicate = async (p: LocalProject) => {
    await saveProject({
      ...p,
      id: newProjectId(),
      title: `${p.title} (bản sao)`,
      savedAt: new Date().toISOString(),
    });
    await refresh();
  };

  const handleDeleteConfirm = async () => {
    if (!deleteId) return;
    await deleteProject(deleteId);
    setDeleteId(null);
    await refresh();
  };

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-36 rounded-2xl border border-border bg-surface-muted/40 animate-pulse" />
        ))}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="surface-card flex flex-col items-center justify-center p-12 text-center animate-fade-up">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
          <FolderKanban className="h-7 w-7" />
        </div>
        <h3 className="text-base font-semibold text-foreground">
          Chưa có dự án nào
        </h3>
        <p className="mt-1.5 max-w-sm text-xs text-foreground/60 leading-relaxed">
          Mở Studio Workspace để bắt đầu dựng hình học bằng AI hoặc các công cụ trực quan, sau đó bấm “Lưu”.
        </p>
        <div className="mt-2 text-[11px] text-foreground/40">
          {isSupabaseEnabled()
            ? "Đang kết nối Supabase Cloud Database"
            : "Lưu trữ offline trên trình duyệt của máy này"}
        </div>
        <Link
          href="/workspace"
          className="mt-6 flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          <span>Tạo mô hình mới ngay</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-foreground/60">
          Tổng cộng: <strong>{projects.length}</strong> dự án
        </span>
        <Link
          href="/workspace"
          className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Tạo mới</span>
        </Link>
      </div>

      {/* Grid of Projects */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <div
            key={p.id}
            className="surface-card group flex flex-col justify-between p-4 transition-all hover:border-primary/50 hover:shadow-md animate-fade-up"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm text-foreground truncate" title={p.title}>
                      {p.title}
                    </h3>
                    <div className="mt-0.5">
                      <span
                        className={`inline-flex items-center rounded-full px-1.5 py-0.2 text-[10px] font-medium ${
                          p.mode === "3d"
                            ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                            : "bg-primary/10 text-primary"
                        }`}
                      >
                        {p.mode === "3d" ? "3D Không gian" : "2D Mặt phẳng"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-foreground/50">
                <Calendar className="h-3 w-3" />
                <span>{new Date(p.savedAt).toLocaleString("vi-VN")}</span>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setRenameProject(p)}
                  title="Đổi tên"
                  className="rounded-lg p-1.5 text-foreground/50 hover:bg-surface-muted hover:text-foreground transition-colors"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleDuplicate(p)}
                  title="Nhân bản dự án"
                  className="rounded-lg p-1.5 text-foreground/50 hover:bg-surface-muted hover:text-foreground transition-colors"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteId(p.id)}
                  title="Xóa dự án"
                  className="rounded-lg p-1.5 text-foreground/50 hover:bg-danger/10 hover:text-danger transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <Link
                href={`/workspace?load=${p.id}${p.mode ? `&mode=${p.mode}` : ""}`}
                className="flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
              >
                <span>Mở</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Rename Prompt Modal */}
      <PromptDialog
        isOpen={renameProject !== null}
        onClose={() => setRenameProject(null)}
        onSubmit={handleRenameSubmit}
        title="Đổi tên dự án"
        description="Nhập tên mới cho dự án này:"
        initialValue={renameProject?.title ?? ""}
        placeholder="vd: Tam giác ABC và đường cao AH"
      />

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => void handleDeleteConfirm()}
        title="Xóa dự án?"
        message="Hành động này sẽ xóa vĩnh viễn dự án đã lưu. Bạn không thể khôi phục sau khi xóa."
        confirmText="Xóa vĩnh viễn"
        isDestructive={true}
      />
    </div>
  );
}
