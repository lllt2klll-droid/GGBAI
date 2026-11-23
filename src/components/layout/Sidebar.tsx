"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  FolderKanban,
  PenTool,
  Settings,
  LogOut,
  LogIn,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getCurrentUser,
  isAuthEnabled,
  signOut,
  type AuthUser,
} from "@/lib/auth/supabaseAuth";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Dự án", icon: FolderKanban },
  { href: "/workspace", label: "Studio Workspace", icon: PenTool },
  { href: "/settings", label: "Cài đặt", icon: Settings },
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
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-surface">
      {/* Brand Header */}
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <span className="text-sm font-bold tracking-tight text-foreground">
              GeoGebra AI
            </span>
            <span className="ml-1 text-[10px] font-semibold text-primary uppercase tracking-wider">
              Studio
            </span>
          </div>
        </Link>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 space-y-1 p-3" aria-label="Điều hướng chính">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-foreground/70 hover:bg-surface-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer / Account */}
      <div className="border-t border-border p-3">
        {isAuthEnabled() ? (
          user ? (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-muted/60 p-2.5 text-xs text-foreground/80">
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
                title="Đăng xuất"
                className="shrink-0 p-1 text-foreground/50 hover:text-danger transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium text-primary hover:bg-surface-muted transition-colors"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Đăng nhập / Đăng ký</span>
            </Link>
          )
        ) : (
          <div className="rounded-xl bg-surface-muted/40 p-2.5 text-[11px] text-foreground/50 leading-relaxed">
            Dữ liệu offline & local lưu trên trình duyệt này
          </div>
        )}
      </div>
    </aside>
  );
}
