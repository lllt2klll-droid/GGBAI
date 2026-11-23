import { AppShell } from "@/components/layout/AppShell";
import { ProjectsClient } from "@/components/projects/ProjectsClient";

export default function ProjectsPage() {
  return (
    <AppShell
      topbar={
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Dự án đã lưu</span>
        </div>
      }
    >
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6 lg:p-8">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Quản lý Dự án Hình học
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-foreground/60 leading-relaxed">
            Xem, mở lại, nhân bản và xuất các mô hình GeoGebra đã lưu trữ.
          </p>
        </div>
        <ProjectsClient />
      </div>
    </AppShell>
  );
}
