# GeoGebra AI Studio

Ứng dụng dựng hình học bằng AI: mô tả bằng tiếng Việt → GeoGebra canvas,
chỉnh sửa bằng chat, phân tích ảnh đề bài, lưu/xuất dự án.

## Stack

- Next.js 16 (App Router) + React 19 + TailwindCSS 4
- GeoGebra Apps API (`deployggb.js`) qua `GeoGebraWebAdapter`
- Gemini API (text-to-geometry, image analysis, edit plans)
- Supabase (optional): persistence + auth qua PostgREST/GoTrue REST
- Vitest (unit) + Playwright (E2E)

## Chạy dev

```bash
npm install
npm run dev          # http://localhost:3000
```

## Env (`.env.local`)

```env
# Bắt buộc cho AI features (constructions/edits/image-analysis)
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash   # optional, default gemini-2.5-flash

# Optional — Supabase persistence + auth (thiếu → fallback localStorage)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

## Supabase setup (optional)

1. Tạo project → lấy URL + anon key.
2. SQL Editor:

```sql
create table projects (
  id text primary key,
  title text not null,
  snapshot jsonb not null,
  saved_at timestamptz not null default now(),
  user_id uuid references auth.users(id)
);
```

3. Authentication → Providers → enable Email.
4. (Production) Bật RLS: `user_id = auth.uid()` cho select/insert/update/delete.

## Scripts

```bash
npm run dev          # dev server
npm run build        # production build
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm test             # vitest unit tests
npm run test:e2e     # playwright (cần npx playwright install chromium trước)
```

## Kiến trúc chính

- `src/lib/geogebra/` — adapter, command registry (allowlist), history,
  export, types.
- `src/modules/ai/` — orchestrator text-to-geometry, Gemini provider.
- `src/modules/editing/` — deterministic edit parser + AI EditPlan.
- `src/modules/image-analysis/` — Gemini Vision phân tích ảnh đề.
- `src/lib/persistence/` — unified store (Supabase ↔ localStorage).
- `src/lib/auth/` — Supabase Auth (GoTrue REST).
- `src/app/api/v1/ai/` — 3 API routes: constructions, edits,
  image-analysis (rate limited + structured logging).

## Cài đặt (trang /settings)

- **Gemini API key**: nhập key riêng → lưu `localStorage`, gửi kèm header
  `x-gemini-key` tới server app (TLS). Ưu tiên hơn `GEMINI_API_KEY` env.
  Không key → fallback env server → báo `AI_NOT_CONFIGURED`.
- **Model**: chọn gemini-2.5-flash / pro / 2.0-flash.
- **Glass intensity**: tắt / vừa / mạnh (attribute `data-glass` trên `<html>`).
- **Data**: export/import toàn bộ projects (JSON), xóa chat, xóa hết local data.

## Deploy (Vercel)

1. Push repo lên GitHub → import vào Vercel.
2. Set env vars trong Vercel Dashboard (xem `.env.example`).
3. `GEMINI_API_KEY` là server-only — an toàn trên Vercel.
4. Lưu ý: rate limit hiện in-memory — trên serverless mỗi instance có
   counter riêng (giới hạn thực tế = limit × số instance). Production
   nên chuyển sang Redis/Upstash.
5. Supabase: chạy SQL tạo bảng `projects` (xem trên) + bật RLS.

## Bảo mật

- AI chỉ phát SafeGeoGebraCommand qua allowlist — không raw command.
- API keys chỉ ở server (`GEMINI_API_KEY` không NEXT_PUBLIC).
- Rate limit in-memory per IP (single instance; multi-instance cần Redis).
- Ảnh upload không lưu trữ — xử lý trong request rồi bỏ.

Chi tiết: `IMPLEMENTATION_LOG.md`, các file `*_SPEC.md` trong repo.
