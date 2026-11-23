"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { isAuthEnabled, signIn, signUp } from "@/lib/auth/supabaseAuth";

export function LoginClient() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isAuthEnabled()) {
    return (
      <div className="rounded-lg border border-border bg-surface p-8 text-center">
        <p className="text-sm text-foreground/70">
          Auth chưa được cấu hình. Thêm NEXT_PUBLIC_SUPABASE_URL và
          NEXT_PUBLIC_SUPABASE_ANON_KEY vào .env.local.
        </p>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        const r = await signIn(email, password);
        if (!r.ok) {
          setError(r.error ?? "Đăng nhập thất bại");
          return;
        }
        router.push("/projects");
      } else {
        const r = await signUp(email, password);
        if (!r.ok) {
          setError(r.error ?? "Đăng ký thất bại");
          return;
        }
        if (r.needsConfirmation) {
          setInfo("Đã gửi email xác nhận — kiểm tra hộp thư rồi đăng nhập.");
        } else {
          router.push("/projects");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm rounded-lg border border-border bg-surface p-6">
      <h1 className="mb-4 text-lg font-semibold">
        {mode === "signin" ? "Đăng nhập" : "Đăng ký"}
      </h1>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="Mật khẩu (tối thiểu 6 ký tự)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        {info && <p className="text-xs text-primary">{info}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading ? "Đang xử lý…" : mode === "signin" ? "Đăng nhập" : "Đăng ký"}
        </button>
      </form>
      <button
        type="button"
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError(null);
          setInfo(null);
        }}
        className="mt-3 w-full text-center text-xs text-foreground/60 hover:text-primary"
      >
        {mode === "signin"
          ? "Chưa có tài khoản? Đăng ký"
          : "Đã có tài khoản? Đăng nhập"}
      </button>
    </div>
  );
}
