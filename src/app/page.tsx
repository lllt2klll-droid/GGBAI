import Link from "next/link";
import {
  PenTool,
  FolderKanban,
  Sparkles,
  ArrowRight,
  Layers,
  Shapes,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";

const SAMPLE_PROMPTS = [
  {
    title: "Tam giác cân & đường cao",
    prompt: "Tam giác ABC cân tại A, đường cao AH, trung điểm M của BC",
    badge: "Hình học 8",
    mode: "2d",
  },
  {
    title: "Đường tròn & tiếp tuyến",
    prompt: "Đường tròn tâm O bán kính 3cm, từ điểm A ngoài đường tròn kẻ hai tiếp tuyến AB và AC",
    badge: "Hình học 9",
    mode: "2d",
  },
  {
    title: "Hình chóp tam giác S.ABC (3D)",
    prompt: "Hình chóp S.ABC có đáy là tam giác vuông tại B, SA vuông góc với đáy",
    badge: "Hình học 11 - 3D",
    mode: "3d",
  },
  {
    title: "Khối lập phương ABCD.A'B'C' (3D)",
    prompt: "Hình lập phương ABCD.A'B'C' cạnh 3, gốc tọa độ tại A",
    badge: "Hình học 12 - 3D",
    mode: "3d",
  },
  {
    title: "Hình bình hành & đường chéo",
    prompt: "Hình bình hành ABCD có AB = 6, AD = 4, giao điểm hai đường chéo là O",
    badge: "Hình học 8",
    mode: "2d",
  },
  {
    title: "Tam giác vuông & đường trung tuyến",
    prompt: "Tam giác ABC vuông tại A, trung tuyến AM, đường cao AH",
    badge: "Hình học 7 - 9",
    mode: "2d",
  },
];

const FEATURES = [
  {
    icon: Sparkles,
    title: "Text-to-Geometry",
    description: "Nhập mô tả đề bài bằng tiếng Việt tự nhiên, AI phân tích dữ kiện và tự động dựng mô hình chuẩn.",
  },
  {
    icon: Shapes,
    title: "Image-to-Geometry",
    description: "Tải ảnh chụp đề thi hoặc hình vẽ, AI nhận diện ký hiệu, trích xuất dữ kiện và cho bạn xác nhận trước khi dựng.",
  },
  {
    icon: Layers,
    title: "Chỉnh sửa tương tác",
    description: "Kéo thả trực tiếp trên GeoGebra, đổi màu sắc, nhãn điểm, ẩn/hiện hoặc ra lệnh chỉnh sửa cho AI bằng tiếng Việt.",
  },
];

export default function DashboardPage() {
  return (
    <AppShell
      topbar={
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Tổng quan Dashboard</span>
        </div>
      }
    >
      <div className="mx-auto max-w-5xl space-y-8 p-4 sm:p-6 lg:p-8">
        {/* Hero Section */}
        <section className="surface-card relative overflow-hidden p-6 sm:p-8 animate-fade-up">
          <div className="relative z-10 max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              <span>GeoGebra AI Studio v0.1</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Trợ lý Dựng hình Toán học Thông minh
            </h1>

            <p className="text-sm text-foreground/70 leading-relaxed">
              Biến mô tả đề bài tiếng Việt và ảnh chụp thành mô hình hình học tương tác trên nền tảng GeoGebra. Hỗ trợ đầy đủ thao tác chỉnh sửa, đổi màu, hoàn tác và xuất file phục vụ giảng dạy.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                href="/workspace"
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
              >
                <PenTool className="h-4 w-4" />
                <span>Mở Studio Workspace</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                href="/projects"
                className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-surface-muted transition-colors"
              >
                <FolderKanban className="h-4 w-4 text-foreground/60" />
                <span>Xem dự án đã lưu</span>
              </Link>
            </div>
          </div>
        </section>

        {/* Feature Cards Grid */}
        <section className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="surface-card p-5 animate-fade-up"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-3">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-sm text-foreground">{f.title}</h3>
                <p className="mt-1.5 text-xs text-foreground/60 leading-relaxed">
                  {f.description}
                </p>
              </div>
            );
          })}
        </section>

        {/* Sample Math Prompts Section */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Ví dụ mẫu bạn có thể thử ngay
              </h2>
              <p className="text-xs text-foreground/60">
                Bấm vào mẫu để mở ngay trong Workspace và nhờ AI dựng hình
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {SAMPLE_PROMPTS.map((sample) => (
              <Link
                key={sample.title}
                href={`/workspace?prompt=${encodeURIComponent(sample.prompt)}&mode=${sample.mode}`}
                className="surface-card group p-4 transition-all hover:border-primary/50 hover:shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                      {sample.title}
                    </span>
                    <span className="rounded bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-foreground/60">
                      {sample.badge}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-foreground/70 italic leading-relaxed">
                    “{sample.prompt}”
                  </p>
                </div>

                <div className="mt-3 flex items-center gap-1 text-[11px] font-medium text-primary opacity-80 group-hover:opacity-100">
                  <span>Mở trong Workspace</span>
                  <ArrowRight className="h-3 w-3" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
