import type { ReactNode } from "react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { SettingsSync } from "./SettingsSync";
import { Sidebar } from "./Sidebar";
import { Topbar, MobileBottomNav } from "./Topbar";

export function AppShell({
  children,
  topbar,
  hideTopbar = false,
}: {
  children: ReactNode;
  topbar?: ReactNode;
  hideTopbar?: boolean;
}) {
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background lg:flex-row">
      <SettingsSync />
      {/* Desktop sidebar */}
      <div className="hidden lg:block shrink-0">
        <Sidebar />
      </div>

      {/* Main container */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {!hideTopbar && <Topbar>{topbar}</Topbar>}
        <main className="min-h-0 flex-1 flex flex-col h-full overflow-auto pb-14 lg:pb-0">
          <AuthGuard>{children}</AuthGuard>
        </main>
        {hideTopbar && <MobileBottomNav />}
      </div>
    </div>
  );
}
