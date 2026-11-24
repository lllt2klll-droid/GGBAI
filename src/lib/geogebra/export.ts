"use client";

import type { GeoGebraAdapter, GeoGebraSnapshot } from "./types";

/** Tải snapshot .ggb về máy dưới dạng file download. */
export async function exportGgb(
  adapter: GeoGebraAdapter,
  filename = "construction.ggb",
): Promise<{ ok: boolean; error?: string }> {
  try {
    const snapshot = await adapter.exportSnapshot();
    if (snapshot.format !== "ggb-base64") {
      return { ok: false, error: `Unsupported format: ${snapshot.format}` };
    }
    const bytes = Uint8Array.from(atob(snapshot.data), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], {
      type: "application/octet-stream",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".ggb") ? filename : `${filename}.ggb`;
    a.click();
    URL.revokeObjectURL(url);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Export failed",
    };
  }
}

export type LocalProject = {
  id: string;
  title: string;
  snapshot: GeoGebraSnapshot;
  savedAt: string;
  mode?: "2d" | "3d";
};

const KEY = "ggb-ai-projects";

export function listLocalProjects(): LocalProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalProject[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalProject(project: LocalProject): void {
  const projects = listLocalProjects().filter((p) => p.id !== project.id);
  projects.unshift(project);
  localStorage.setItem(KEY, JSON.stringify(projects.slice(0, 50)));
}

export function getLocalProject(id: string): LocalProject | null {
  return listLocalProjects().find((p) => p.id === id) ?? null;
}

export function deleteLocalProject(id: string): void {
  const projects = listLocalProjects().filter((p) => p.id !== id);
  localStorage.setItem(KEY, JSON.stringify(projects));
}

export function newProjectId(): string {
  return `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
