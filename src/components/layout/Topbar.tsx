import type { ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle";

export function Topbar({ children }: { children?: ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
      {children}
      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </header>
  );
}
