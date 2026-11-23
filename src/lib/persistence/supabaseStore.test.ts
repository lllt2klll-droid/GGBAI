import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Test supabaseStore — mock fetch + env. Không gọi Supabase thật.
 */

const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
};

async function loadStore(env: Record<string, string | undefined> = ENV) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import("./supabaseStore");
}

describe("supabaseStore", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("isSupabaseEnabled false khi thiếu env", async () => {
    const m = await loadStore({});
    expect(m.isSupabaseEnabled()).toBe(false);
  });

  it("isSupabaseEnabled true khi đủ env", async () => {
    const m = await loadStore();
    expect(m.isSupabaseEnabled()).toBe(true);
  });

  it("supabaseListProjects gọi đúng endpoint + headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "p1",
            title: "T",
            snapshot: { format: "ggb-base64", data: "QQ==", capturedAt: "" },
            saved_at: "2026-01-01T00:00:00Z",
          },
        ]),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const m = await loadStore();
    const list = await m.supabaseListProjects();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("p1");
    expect(list[0].savedAt).toBe("2026-01-01T00:00:00Z");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://test.supabase.co/rest/v1/projects?select=id,title,snapshot,saved_at&user_id=is.null&order=saved_at.desc&limit=100",
    );
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe("anon-key");
    expect(headers.Authorization).toBe("Bearer anon-key");
  });

  it("supabaseSaveProject upsert với Prefer merge-duplicates", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const m = await loadStore();
    await m.supabaseSaveProject({
      id: "p1",
      title: "T",
      snapshot: { format: "ggb-base64", data: "QQ==", capturedAt: "" },
      savedAt: "2026-01-01T00:00:00Z",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://test.supabase.co/rest/v1/projects");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Prefer).toContain("merge-duplicates");
    const body = JSON.parse(init.body as string);
    expect(body.id).toBe("p1");
    expect(body.snapshot.format).toBe("ggb-base64");
    expect(body.user_id).toBeNull();
  });

  it("supabaseDeleteProject gọi DELETE đúng id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const m = await loadStore();
    await m.supabaseDeleteProject("p1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("id=eq.p1");
    expect(init.method).toBe("DELETE");
  });
});
