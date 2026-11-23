import { afterEach, describe, expect, it, vi } from "vitest";

// localStorage stub cho node env
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
};

async function loadAuth(env: Record<string, string | undefined> = ENV) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import("./supabaseAuth");
}

describe("supabaseAuth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("isAuthEnabled false khi thiếu env", async () => {
    const m = await loadAuth({});
    expect(m.isAuthEnabled()).toBe(false);
  });

  it("signIn thành công → lưu session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "tok",
            user: { id: "u1", email: "a@b.c" },
          }),
          { status: 200 },
        ),
      ),
    );
    const m = await loadAuth();
    const r = await m.signIn("a@b.c", "secret1");
    expect(r.ok).toBe(true);
    expect(m.getCurrentUser()?.email).toBe("a@b.c");

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://test.supabase.co/auth/v1/token?grant_type=password");
    expect(JSON.parse(init.body as string)).toEqual({
      email: "a@b.c",
      password: "secret1",
    });
  });

  it("signIn lỗi → trả error, không lưu session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
      ),
    );
    const m = await loadAuth();
    const r = await m.signIn("a@b.c", "wrong");
    expect(r.ok).toBe(false);
    expect(m.getCurrentUser()).toBeNull();
  });

  it("signUp cần confirm → needsConfirmation, không session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ user: { id: "u2" } }), { status: 200 }),
      ),
    );
    const m = await loadAuth();
    const r = await m.signUp("new@b.c", "secret1");
    expect(r.ok).toBe(true);
    expect(r.needsConfirmation).toBe(true);
    expect(m.getCurrentUser()).toBeNull();
  });

  it("signOut xóa session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "tok",
            user: { id: "u1", email: "a@b.c" },
          }),
          { status: 200 },
        ),
      ),
    );
    const m = await loadAuth();
    await m.signIn("a@b.c", "secret1");
    m.signOut();
    expect(m.getCurrentUser()).toBeNull();
  });
});
