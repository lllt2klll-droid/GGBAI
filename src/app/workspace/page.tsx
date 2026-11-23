import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceClient } from "@/components/workspace/WorkspaceClient";

export const metadata = {
  title: "Studio Workspace — GeoGebra AI Studio",
};

export default function WorkspacePage() {
  return (
    <AppShell hideTopbar={true}>
      <Suspense
        fallback={
          <div className="flex h-full w-full items-center justify-center bg-background text-xs text-foreground/50">
            Đang khởi động Studio Workspace…
          </div>
        }
      >
        <WorkspaceClient />
      </Suspense>
    </AppShell>
  );
}
