import type { ReactNode } from "react";
import { AuthGuard } from "@/components/auth/AuthGuard";
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
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar>{topbar}</Topbar>
        <main className="min-h-0 flex-1 overflow-auto">
          <AuthGuard>{children}</AuthGuard>
        </main>
      </div>
    </div>
  );
}
