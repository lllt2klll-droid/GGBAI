import { AppShell } from "@/components/layout/AppShell";
import { ProjectsClient } from "@/components/projects/ProjectsClient";

export default function ProjectsPage() {
  return (
    <AppShell topbar={<span className="text-sm font-medium">Dự án</span>}>
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <div>
          <h1 className="text-2xl font-semibold">Dự án của tôi</h1>
          <p className="mt-1 text-sm text-foreground/70">
            Dự án được lưu trong trình duyệt (localStorage). Đồng bộ tài khoản
            và cloud sẽ có ở milestone M6.
          </p>
        </div>
        <ProjectsClient />
      </div>
    </AppShell>
  );
}
