"use client";

/**
 * Supabase Auth qua GoTrue REST — KHÔNG cần SDK.
 * Env-gated giống supabaseStore: thiếu env → mọi hàm trả null/false.
 * Token lưu trong localStorage key "ggb-ai-auth" (MVP — production nên
 * dùng httpOnly cookie + server session).
 */

type AuthConfig = { url: string; key: string };

function config(): AuthConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

export function isAuthEnabled(): boolean {
  return config() !== null;
}

export type AuthUser = {
  id: string;
  email: string;
};

type TokenResponse = {
  access_token?: string;
  user?: { id: string; email?: string };
  error?: string;
  error_description?: string;
};

const STORAGE_KEY = "ggb-ai-auth";

function saveSession(accessToken: string, user: AuthUser) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken, user }));
}

export function getSession(): { accessToken: string; user: AuthUser } | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { accessToken: string; user: AuthUser };
    return parsed.accessToken && parsed.user ? parsed : null;
  } catch {
    return null;
  }
}

export function getCurrentUser(): AuthUser | null {
  return getSession()?.user ?? null;
}

export function signOut() {
  localStorage.removeItem(STORAGE_KEY);
}

async function authRequest(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data?: TokenResponse; error?: string }> {
  const cfg = config();
  if (!cfg) return { ok: false, error: "Auth not configured" };
  try {
    const res = await fetch(`${cfg.url}/auth/v1/${path}`, {
      method: "POST",
      headers: {
        apikey: cfg.key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as TokenResponse;
    if (!res.ok) {
      return { ok: false, error: data.error_description ?? data.error ?? `HTTP ${res.status}` };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

export async function signIn(
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const r = await authRequest("token?grant_type=password", { email, password });
  if (!r.ok || !r.data?.access_token || !r.data.user) {
    return { ok: false, error: r.error ?? "Đăng nhập thất bại" };
  }
  saveSession(r.data.access_token, {
    id: r.data.user.id,
    email: r.data.user.email ?? email,
  });
  return { ok: true };
}

export async function signUp(
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string; needsConfirmation?: boolean }> {
  const r = await authRequest("signup", { email, password });
  if (!r.ok) return { ok: false, error: r.error ?? "Đăng ký thất bại" };
  // Supabase mặc định yêu cầu confirm email — chưa có session ngay
  if (r.data?.access_token && r.data.user) {
    saveSession(r.data.access_token, {
      id: r.data.user.id,
      email: r.data.user.email ?? email,
    });
    return { ok: true };
  }
  return { ok: true, needsConfirmation: true };
}
