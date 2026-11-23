"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  LayoutDashboard,
  FolderKanban,
  PenTool,
  Settings,
  Sparkles,
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

const MOBILE_NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Dự án", icon: FolderKanban },
  { href: "/workspace", label: "Studio", icon: PenTool },
  { href: "/settings", label: "Cài đặt", icon: Settings },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex h-14 items-stretch justify-around border-t border-border bg-surface px-1 lg:hidden shadow-sm"
      aria-label="Điều hướng mobile"
    >
      {MOBILE_NAV.map((item) => {
        const Icon = item.icon;
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${
              active ? "text-primary" : "text-foreground/60 hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function Topbar({ children }: { children?: ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
        {/* Mobile brand header */}
        <div className="flex items-center gap-2 lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <span className="text-xs font-bold text-foreground">GGB AI Studio</span>
          </Link>
        </div>

        {/* Content area: Title, actions, breadcrumb */}
        <div className="min-w-0 flex-1">{children}</div>

        {/* Right tools: Theme toggle */}
        <div className="ml-2 flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>

      {/* Bottom nav — mobile only */}
      <MobileBottomNav />
    </>
  );
}
