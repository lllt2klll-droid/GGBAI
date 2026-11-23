"use client";

import {
  deleteLocalProject,
  getLocalProject,
  listLocalProjects,
  newProjectId,
  saveLocalProject,
  type LocalProject,
} from "@/lib/geogebra/export";
import {
  isSupabaseEnabled,
  supabaseDeleteProject,
  supabaseGetProject,
  supabaseListProjects,
  supabaseSaveProject,
} from "./supabaseStore";
import { getCurrentUser } from "@/lib/auth/supabaseAuth";

/**
 * Unified project store — Supabase khi env được cấu hình, fallback
 * localStorage. Mọi hàm async; caller phải await.
 */

export { newProjectId };
export type { LocalProject };

export async function listProjects(): Promise<LocalProject[]> {
  if (isSupabaseEnabled()) {
    try {
      return await supabaseListProjects(getCurrentUser()?.id);
    } catch {
      // Supabase lỗi → fallback local
    }
  }
  return listLocalProjects();
}

export async function saveProject(p: LocalProject): Promise<void> {
  if (isSupabaseEnabled()) {
    try {
      await supabaseSaveProject(p, getCurrentUser()?.id);
      return;
    } catch {
      // fallback local
    }
  }
  saveLocalProject(p);
}

export async function getProject(id: string): Promise<LocalProject | null> {
  if (isSupabaseEnabled()) {
    try {
      const remote = await supabaseGetProject(id, getCurrentUser()?.id);
      if (remote) return remote;
    } catch {
      // fallback local
    }
  }
  return getLocalProject(id);
}

export async function deleteProject(id: string): Promise<void> {
  if (isSupabaseEnabled()) {
    try {
      await supabaseDeleteProject(id, getCurrentUser()?.id);
    } catch {
      // vẫn xóa local
    }
  }
  deleteLocalProject(id);
}
