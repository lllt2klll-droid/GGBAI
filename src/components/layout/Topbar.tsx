"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle";

const MOBILE_NAV = [
  { href: "/", label: "Home", icon: "▦" },
  { href: "/projects", label: "Dự án", icon: "▤" },
  { href: "/workspace", label: "Studio", icon: "✎" },
  { href: "/settings", label: "Cài đặt", icon: "⚙" },
] as const;

export function Topbar({ children }: { children?: ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <header className="glass-strong sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 px-4">
        {children}
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>
      {/* Bottom nav — mobile only */}
      <nav
        className="glass-strong fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch justify-around border-t border-border/60 px-2 lg:hidden"
        aria-label="Điều hướng mobile"
      >
        {MOBILE_NAV.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors ${
                active ? "text-primary" : "text-foreground/60"
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
