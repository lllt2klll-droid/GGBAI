import type { ReactNode } from "react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { SettingsSync } from "./SettingsSync";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell({
  children,
  topbar,
}: {
  children: ReactNode;
  topbar?: ReactNode;
}) {
  return (
    <div className="app-bg flex h-dvh flex-col overflow-hidden lg:flex-row">
      <SettingsSync />
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Topbar>{topbar}</Topbar>
        <main className="min-h-0 flex-1 overflow-auto pb-16 lg:pb-0">
          <AuthGuard>{children}</AuthGuard>
        </main>
      </div>
    </div>
  );
}
