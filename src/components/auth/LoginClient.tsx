"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sparkles, LogIn, UserPlus } from "lucide-react";
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
      <div className="surface-card mx-auto max-w-md p-8 text-center animate-fade-up">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mx-auto mb-3">
          <Sparkles className="h-6 w-6" />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          Chế độ Ngoại tuyến (Local Only)
        </h2>
        <p className="mt-2 text-xs text-foreground/60 leading-relaxed">
          Xác thực Supabase chưa được cấu hình qua biến môi trường. Toàn bộ dự án hình học và lịch sử chat của bạn sẽ được lưu trực tiếp trên thiết bị này.
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
    <div className="surface-card mx-auto max-w-sm p-6 animate-fade-up">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {mode === "signin" ? (
            <LogIn className="h-4 w-4" />
          ) : (
            <UserPlus className="h-4 w-4" />
          )}
        </div>
        <h1 className="text-base font-semibold text-foreground">
          {mode === "signin" ? "Đăng nhập tài khoản" : "Tạo tài khoản mới"}
        </h1>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-foreground/70 mb-1">
            Địa chỉ Email
          </label>
          <input
            type="email"
            required
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground outline-none transition-colors focus:border-primary"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground/70 mb-1">
            Mật khẩu
          </label>
          <input
            type="password"
            required
            minLength={6}
            placeholder="Tối thiểu 6 ký tự"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground outline-none transition-colors focus:border-primary"
          />
        </div>

        {error && (
          <p className="rounded-lg bg-danger/10 p-2 text-xs text-danger">{error}</p>
        )}
        {info && (
          <p className="rounded-lg bg-primary/10 p-2 text-xs text-primary">{info}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-primary px-4 py-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {loading ? "Đang xử lý…" : mode === "signin" ? "Đăng nhập" : "Đăng ký tài khoản"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError(null);
          setInfo(null);
        }}
        className="mt-4 w-full text-center text-xs text-foreground/60 hover:text-primary transition-colors"
      >
        {mode === "signin"
          ? "Chưa có tài khoản? Đăng ký ngay"
          : "Đã có tài khoản? Bấm để đăng nhập"}
      </button>
    </div>
  );
}
