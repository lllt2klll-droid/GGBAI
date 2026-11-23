import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceClient } from "@/components/workspace/WorkspaceClient";

export default function WorkspacePage() {
  return (
    <AppShell
      topbar={
        <>
          <span className="text-sm font-medium">Workspace</span>
          <span className="ml-auto text-xs text-foreground/50">
            Chế độ 2D · Chưa lưu
          </span>
        </>
      }
    >
      <WorkspaceClient />
    </AppShell>
  );
}
