"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  getCurrentUser,
  isAuthEnabled,
  signOut,
  type AuthUser,
} from "@/lib/auth/supabaseAuth";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: "▦" },
  { href: "/projects", label: "Dự án", icon: "▤" },
  { href: "/workspace", label: "Workspace", icon: "✎" },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setUser(getCurrentUser()), 0);
    return () => clearTimeout(t);
  }, [pathname]);

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <span className="text-lg font-semibold text-primary">GeoGebra AI Studio</span>
      </div>
      <nav className="flex-1 space-y-1 p-3" aria-label="Điều hướng chính">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-foreground/80 hover:bg-surface-muted hover:text-foreground",
              )}
            >
              <span aria-hidden="true" className="w-5 text-center">
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3 text-xs text-foreground/60">
        {isAuthEnabled() ? (
          user ? (
            <div className="flex items-center justify-between gap-2">
              <span className="truncate" title={user.email}>
                {user.email}
              </span>
              <button
                type="button"
                onClick={() => {
                  signOut();
                  setUser(null);
                  router.push("/login");
                }}
                className="shrink-0 text-foreground/60 hover:text-danger"
              >
                Đăng xuất
              </button>
            </div>
          ) : (
            <Link href="/login" className="text-primary hover:underline">
              Đăng nhập / Đăng ký
            </Link>
          )
        ) : (
          "MVP — đang phát triển"
        )}
      </div>
    </aside>
  );
}
