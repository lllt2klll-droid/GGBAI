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
      <div className="mx-auto max-w-5xl space-y-8 p-4 lg:p-8">
        <section className="animate-fade-up">
          <h1 className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-3xl font-bold text-transparent">
            Chào mừng đến GeoGebra AI Studio
          </h1>
          <p className="mt-2 text-sm text-foreground/70">
            Mô tả hình học bằng tiếng Việt hoặc tải ảnh đề toán — AI sẽ dựng mô hình
            tương tác mà bạn có thể chỉnh sửa.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/workspace"
            className="glass group rounded-2xl p-5 transition-all hover:border-primary/50 hover:shadow-lg animate-fade-up"
          >
            <h2 className="font-semibold">✎ Workspace mới</h2>
            <p className="mt-1 text-sm text-foreground/70">
              Mở không gian dựng hình với AI assistant.
            </p>
          </Link>
          <Link
            href="/projects"
            className="glass group rounded-2xl p-5 transition-all hover:border-primary/50 hover:shadow-lg animate-fade-up"
            style={{ animationDelay: "60ms" }}
          >
            <h2 className="font-semibold">▤ Dự án của tôi</h2>
            <p className="mt-1 text-sm text-foreground/70">
              Quản lý và mở lại các mô hình đã lưu.
            </p>
          </Link>
        </section>

        <section className="animate-fade-up" style={{ animationDelay: "120ms" }}>
          <h2 className="mb-3 text-sm font-medium text-foreground/80">
            Ví dụ yêu cầu bạn có thể thử
          </h2>
          <ul className="space-y-2">
            {SAMPLE_PROMPTS.map((prompt) => (
              <li
                key={prompt}
                className="glass rounded-xl px-4 py-3 text-sm"
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
