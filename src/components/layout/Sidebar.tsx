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
  { href: "/settings", label: "Cài đặt", icon: "⚙" },
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
    <aside className="glass flex h-full w-60 shrink-0 flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-border/60 px-4">
        <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-lg font-bold text-transparent">
          GeoGebra AI
        </span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          Studio
        </span>
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
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all",
                active
                  ? "bg-primary/15 font-medium text-primary shadow-sm"
                  : "text-foreground/75 hover:bg-surface-muted/80 hover:text-foreground",
              )}
            >
              <span aria-hidden="true" className="w-5 text-center text-base">
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border/60 p-3 text-xs text-foreground/60">
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
          "Bản local — dữ liệu trên máy này"
        )}
      </div>
    </aside>
  );
}
