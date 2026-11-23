"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getCurrentUser, isAuthEnabled } from "@/lib/auth/supabaseAuth";

/**
 * Route guard client-side — chỉ active khi CẢ HAI:
 * - NEXT_PUBLIC_REQUIRE_AUTH=true
 * - Supabase auth được cấu hình (env)
 * Session nằm trong localStorage nên guard phải chạy client-side.
 * Production nên bổ sung server-side check (middleware + cookie).
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  const required =
    process.env.NEXT_PUBLIC_REQUIRE_AUTH === "true" && isAuthEnabled();

  useEffect(() => {
    if (!required) return;
    const t = setTimeout(() => {
      if (!getCurrentUser() && pathname !== "/login") {
        router.replace("/login");
        return;
      }
      setChecked(true);
    }, 0);
    return () => clearTimeout(t);
  }, [required, pathname, router]);

  if (!required) return <>{children}</>;
  if (!checked) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-foreground/60">
        Đang kiểm tra phiên đăng nhập…
      </div>
    );
  }
  return <>{children}</>;
}
