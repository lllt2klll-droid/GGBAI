import type { ReactNode } from "react";

export function Topbar({ children }: { children?: ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
      {children}
    </header>
  );
}
