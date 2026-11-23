import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";

const SAMPLE_PROMPTS = [
  "Tam giác ABC cân tại A, đường cao AH, trung điểm M của BC",
  "Đường tròn tâm O đi qua điểm A",
  "Hình vuông ABCD có cạnh bằng 4 cm",
];

export default function DashboardPage() {
  return (
    <AppShell
      topbar={<span className="text-sm font-medium">Dashboard</span>}
    >
      <div className="mx-auto max-w-5xl space-y-8 p-6">
        <section>
          <h1 className="text-2xl font-semibold">Chào mừng đến GeoGebra AI Studio</h1>
          <p className="mt-1 text-sm text-foreground/70">
            Mô tả hình học bằng tiếng Việt hoặc tải ảnh đề toán — AI sẽ dựng mô hình
            tương tác mà bạn có thể chỉnh sửa.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/workspace"
            className="rounded-lg border border-border bg-surface p-5 transition-colors hover:border-primary/50"
          >
            <h2 className="font-medium">Workspace mới</h2>
            <p className="mt-1 text-sm text-foreground/70">
              Mở không gian dựng hình với AI assistant.
            </p>
          </Link>
          <Link
            href="/projects"
            className="rounded-lg border border-border bg-surface p-5 transition-colors hover:border-primary/50"
          >
            <h2 className="font-medium">Dự án của tôi</h2>
            <p className="mt-1 text-sm text-foreground/70">
              Quản lý và mở lại các mô hình đã lưu.
            </p>
          </Link>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium text-foreground/80">
            Ví dụ yêu cầu bạn có thể thử
          </h2>
          <ul className="space-y-2">
            {SAMPLE_PROMPTS.map((prompt) => (
              <li
                key={prompt}
                className="rounded-md border border-border bg-surface-muted px-4 py-3 text-sm"
              >
                “{prompt}”
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
