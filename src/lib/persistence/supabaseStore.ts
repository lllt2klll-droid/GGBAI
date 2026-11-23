"use client";

import type { LocalProject } from "@/lib/geogebra/export";

/**
 * Supabase persistence qua PostgREST — KHÔNG cần SDK.
 * Env-gated: chỉ active khi NEXT_PUBLIC_SUPABASE_URL +
 * NEXT_PUBLIC_SUPABASE_ANON_KEY được set. Thiếu env → caller fallback
 * localStorage.
 *
 * Bảng `projects` (tạo trong Supabase SQL editor):
 *   create table projects (
 *     id text primary key,
 *     title text not null,
 *     snapshot jsonb not null,
 *     saved_at timestamptz not null default now(),
 *     user_id uuid references auth.users(id) -- nullable cho anon
 *   );
 * TODO(M6-full): bật RLS — policy: user chỉ thấy/sửa project của mình
 * (user_id = auth.uid() hoặc user_id is null cho anon).
 */

const TABLE = "projects";

type SupabaseConfig = { url: string; key: string };

function config(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

export function isSupabaseEnabled(): boolean {
  return config() !== null;
}

type ProjectRow = {
  id: string;
  title: string;
  snapshot: LocalProject["snapshot"];
  saved_at: string;
};

function toProject(row: ProjectRow): LocalProject {
  return {
    id: row.id,
    title: row.title,
    snapshot: row.snapshot,
    savedAt: row.saved_at,
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const cfg = config();
  if (!cfg) throw new Error("Supabase not configured");
  const res = await fetch(`${cfg.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function supabaseListProjects(
  userId?: string,
): Promise<LocalProject[]> {
  // userId undefined → chỉ project anon (user_id is null)
  const filter = userId
    ? `user_id=eq.${encodeURIComponent(userId)}`
    : "user_id=is.null";
  const rows = await request<ProjectRow[]>(
    `${TABLE}?select=id,title,snapshot,saved_at&${filter}&order=saved_at.desc&limit=100`,
  );
  return rows.map(toProject);
}

export async function supabaseSaveProject(
  p: LocalProject,
  userId?: string,
): Promise<void> {
  await request<ProjectRow[]>(TABLE, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      id: p.id,
      title: p.title,
      snapshot: p.snapshot,
      saved_at: p.savedAt,
      user_id: userId ?? null,
    }),
  });
}

export async function supabaseGetProject(
  id: string,
  userId?: string,
): Promise<LocalProject | null> {
  const ownerFilter = userId
    ? `&user_id=eq.${encodeURIComponent(userId)}`
    : "&user_id=is.null";
  const rows = await request<ProjectRow[]>(
    `${TABLE}?select=id,title,snapshot,saved_at&id=eq.${encodeURIComponent(id)}${ownerFilter}&limit=1`,
  );
  return rows.length > 0 ? toProject(rows[0]) : null;
}

export async function supabaseDeleteProject(
  id: string,
  userId?: string,
): Promise<void> {
  const ownerFilter = userId
    ? `&user_id=eq.${encodeURIComponent(userId)}`
    : "&user_id=is.null";
  await request<undefined>(
    `${TABLE}?id=eq.${encodeURIComponent(id)}${ownerFilter}`,
    { method: "DELETE" },
  );
}
