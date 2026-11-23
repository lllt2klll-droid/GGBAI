# IMPLEMENTATION_LOG.md

Nhật ký triển khai GeoGebra AI Studio. Cập nhật sau mỗi milestone/task.

## M0 — Foundation (đang thực hiện)

### Đã làm
- Khảo sát docs: 22 file trong `GeoGebra_AI_Studio_Docs/`.
- Stack chốt: Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + npm.
  - Lý do: theo `TECHNICAL_ARCHITECTURE.md`; pnpm không có trên máy → npm.
  - App đặt tại `geogebra-ai-studio/` vì tên thư mục gốc `GGB AI` vi phạm
    npm naming rules.
- Design tokens theo `DESIGN_SYSTEM.md` (light + dark qua `.dark` class).
- AppShell: Sidebar (Dashboard / Dự án / Workspace) + Topbar + main.
- Routes: `/` (dashboard), `/projects` (placeholder trung thực), `/workspace`
  (layout 3 panel: AI Assistant / Canvas / Inspector — trạng thái chờ M1/M3).
- `src/lib/utils.ts` (cn), `src/types/project.ts`.
- `.env.example` theo `ENVIRONMENT_AND_DEPLOYMENT.md` (đã mở gitignore exception).

### Quyết định
- Modular monolith (ADR-001), Geometry IR trung gian (ADR-002), không thực thi
  code AI (ADR-003), GeoGebra client-side (ADR-004) — theo TECHNICAL_ARCHITECTURE.
- AI provider: Gemini 2.5 Flash qua adapter (server-only key).

### Chưa làm / rủi ro
- Chưa có GeoGebra applet (M1) — cần xác minh license & Apps API.
- Chưa có auth, Supabase, AI routes.
- Chưa có test framework (sẽ thêm Vitest ở M2 cùng geometry tests).

### Bước tiếp theo
- M1: GeoGebra Host — adapter interface, lifecycle, command queue skeleton.

## M1 — GeoGebra Host (hoàn thành phần code)

### Đã xác minh
- Embed: `deployggb.js` + `GGBApplet` + `inject()`; API: `evalCommand`,
  `evalCommandGetLabels`, `getAllObjectNames`, `isDefined`, `getObjectType`,
  `getValue`, `setCoords`, `setColor`, `setVisible`, `setBase64`, listeners.
- License: non-commercial miễn phí (giáo dục OK); commercial cần agreement
  → adapter độc lập, có thể thay thế.

### Đã làm
- `src/lib/geogebra/types.ts` — GeoGebraAdapter interface, error codes.
- `src/lib/geogebra/ggbTypes.ts` — typings tối thiểu cho Apps API.
- `src/lib/geogebra/commandRegistry.ts` — allowlist: point, segment, polygon,
  circle (template deterministic, args validated).
- `src/lib/geogebra/GeoGebraWebAdapter.ts` — load script 1 lần, lifecycle
  (ready timeout 30s, fallback poll getAPI), command queue tuần tự + timeout,
  subscribe add/remove/update, export/load snapshot base64, destroy cleanup.
- `src/components/geometry/GeoGebraContainer.tsx` — loading/error/ready states,
  Strict Mode guard.
- `src/components/workspace/WorkspaceCanvas.tsx` — canvas + nút "Dựng nhanh"
  (tam giác, đường tròn, đoạn thẳng) chạy command thật qua allowlist.
- Workspace page tích hợp canvas thật thay placeholder.

### Kiểm thử
- lint/typecheck/build: pass.
- Chưa verify applet live trong browser (cần internet tải deployggb.js) —
  user kiểm tra tại /workspace.

### Còn lại / rủi ro
- Command registry mới 4 loại — mở rộng ở M4 compiler.
- `getObjectType`/`getValue`/`setBase64` là optional API, cần verify trên
  applet thật; adapter trả null/throw UNSUPPORTED khi thiếu.
- Chưa có undo/redo, object inspector sync (M2/M8).

### Bước tiếp theo
- M2: Geometry IR schema (Zod) + validator + dependency graph + compiler.

## M2 — Geometry Core (hoàn thành phần code)

### Đã làm
- `src/modules/geometry-ir/schema.ts` — Zod strict schemas: GeometryDocument,
  17 object kinds (discriminated union theo kind, definition riêng),
  constraints, ExtractedFact có provenance, style, view config.
  Giới hạn: toạ độ ±1e6, ≤200 objects, label ≤20 ký tự, finite numbers only.
- `src/modules/geometry-ir/refs.ts` — `objectRefs()` trích ref theo kind
  (không coi mọi string là ref — fix bug `freedom:"fixed"`).
- `src/modules/geometry-validator/validate.ts` — schema parse + duplicate id +
  missing refs + cycle detection (DFS) + degenerate checks (điểm trùng,
  đoạn suy biến, tam giác thẳng hàng) + unsupported kind.
- `src/modules/geometry-compiler/compile.ts` — topo sort theo dependency,
  name mapping irId→tên GeoGebra an toàn (ưu tiên label), IR→CommandPlan
  deterministic, warnings cho kind không hỗ trợ.
- `src/lib/geogebra/commandRegistry.ts` — mở rộng: line, ray, midpoint,
  perpendicular_line, parallel_line, intersection (Intersect[a,b]),
  angle_bisector, perpendicular_bisector, circle 3 điểm.
- `vitest.config.ts` + `npm test` — 13 unit tests pass.

### Đã xác minh command syntax
Line, Segment, Polygon, Circle, Midpoint, PerpendicularLine, ParallelLine,
Intersect[a,b], Ray, AngleBisector, PerpendicularBisector (GeoGebra Manual).

### Kiểm thử
- vitest: 13/13 pass. lint/typecheck/build: pass.

### Còn lại / rủi ro
- `AngleBisector`/`Circle` 3 điểm/`Intersect` bracket syntax cần verify
  trên applet thật.
- Constraint checking mới ở mức schema (chưa analytic/numeric checker).
- Chưa có post-execution verification (M1 adapter có isDefined/getObjectNames).

### Bước tiếp theo
- M3: AI Engine — provider adapter Gemini 2.5 Flash, structured output → IR,
  API route /api/v1/ai/constructions, clarification flow.

## M3 — AI Engine (text-to-geometry, hoàn thành phần code)

### Đã làm
- `src/modules/ai/types.ts` — AIProvider interface, request/response types,
  error codes theo AI_ENGINE_SPEC.
- `src/modules/ai/prompts.ts` — system prompt cố định mô tả đầy đủ IR schema
  + few-shot example (tam giác cân + đường cao), user prompt builder.
- `src/modules/ai/geminiProvider.ts` — Gemini 2.5 Flash, responseMimeType
  application/json, timeout 45s, parse JSON + fallback tách markdown fence,
  error mapping (429→AI_RATE_LIMITED, timeout→AI_TIMEOUT). Key server-only.
- `src/modules/ai/orchestrator.ts` — clarification heuristic (prompt ngắn/
  mơ hồ), validate IR qua geometry-validator, compile plan, trả
  document+plan+warnings. Không thực thi command ở server.
- `src/app/api/v1/ai/constructions/route.ts` — POST, Zod validate request,
  envelope {ok,data}|{ok:false,error}, HTTP status mapping.
- `src/components/workspace/AIChatPanel.tsx` — chat UI, clarification
  options, execute plan tuần tự qua GeoGebraAdapter, hiển thị warnings.
- `src/components/workspace/WorkspaceClient.tsx` — refactor workspace:
  adapter state share giữa canvas và AI panel; giữ quick-build toolbar.
- `orchestrator.test.ts` — 6 tests (clarify, provider error, invalid IR,
  success, oversized prompt).

### Kiểm thử
- vitest: 19/19 pass. lint/typecheck/build: pass.
- API route đăng ký dynamic /api/v1/ai/constructions.

### Cần để chạy live
- Đặt `GEMINI_API_KEY` trong `.env.local` (server-only). Chưa test end-to-end
  với Gemini thật.

### Còn lại / rủi ro
- Chưa có classify_request đa nhiệm vụ (edit/image) — M4/M5.
- Chưa có conversation persistence, rate limit per-user, cost tracking (M8/M13).
- Clarification heuristic đơn giản; chưa dùng model để phân loại.
- Chưa có undo sau khi AI dựng (M8).

### Bước tiếp theo
- M4: Image Analysis — upload, vision provider, fact extraction + confirm UI.
  Hoặc M5: GeoGebra polish (undo/redo, inspector sync) trước.

## M4 — Image Analysis (hoàn thành phần code)

### Đã làm
- `src/modules/image-analysis/types.ts` — request/response schema (Zod),
  validateImageFile (JPEG/PNG/WebP, ≤10MB), ImageAnalysisResult.
- `src/modules/image-analysis/visionPrompt.ts` — vision system prompt theo
  spec: chỉ trích facts nhìn thấy, KHÔNG suy diễn bằng nhau từ hình thức;
  parseVisionOutput ép mọi fact confirmed=false.
- `src/modules/image-analysis/geminiVision.ts` — Gemini vision inline_data
  base64, JSON mode, timeout 60s, error mapping.
- `src/app/api/v1/ai/image-analysis/route.ts` — POST multipart/form-data,
  validate file, KHÔNG lưu ảnh (privacy).
- `AIChatPanel` — nút upload ảnh, preview, danh sách facts với checkbox
  confirm, "Dựng hình từ dữ kiện đã chọn" → compose prompt → pipeline M3.
- `image-analysis.test.ts` — 6 tests.

### Kiểm thử
- vitest: 25/25 pass. lint/typecheck/build: pass.
- Cả 2 API routes dynamic.

### Còn lại / rủi ro
- Chưa test vision thật (cần GEMINI_API_KEY + ảnh mẫu).
- Chưa có test set ảnh chuẩn (TESTING_PLAN yêu cầu).
- Facts → IR vẫn qua text prompt (gián tiếp); chưa có image→IR trực tiếp.
- Chưa lưu uploaded_files (M6).

### Bước tiếp theo
- M5: GeoGebra polish — undo/redo, inspector sync object list, edit commands.
  Hoặc M6: Project persistence (Supabase).

## M5 — GeoGebra Polish (hoàn thành phần code)

### Đã làm
- `GeoGebraAdapter.deleteObject` + impl trong GeoGebraWebAdapter.
- `src/lib/geogebra/commandHistory.ts` — CommandHistory undo/redo:
  undo = xóa object đã tạo (diff names trước/sau batch), redo = chạy lại
  commands; max 50 entries; clear khi adapter destroy.
- `WorkspaceClient.runCommands` — batch executor dùng chung cho demo + AI:
  diff getObjectNames trước/sau → createdNames → history.push.
- Nút Undo/Redo trên canvas toolbar.
- `InspectorPanel` — danh sách object (name/type/value), sync qua
  subscribe events (debounce 300ms), click chọn, nút xóa từng object.
- `AIChatPanel` nhận `executeCommands` prop → AI plan cũng undo được.
- `commandHistory.test.ts` — 4 tests.

### Kiểm thử
- vitest: 29/29 pass. lint/typecheck/build: pass.

### Còn lại / rủi ro
- Undo chỉ xóa object mới tạo; không revert thay đổi lên object cũ
  (edit commands chưa có — M8 Construction Editor).
- createdNames dựa vào diff getObjectNames — nếu API không trả tên object
  phụ thuộc (vd polygon con), undo có thể sót.
- Chưa verify deleteObject trên applet thật.

### Bước tiếp theo
- M6: Project persistence — Supabase schema, auth, save/load snapshot+IR.
- M8: Construction Editor — edit commands context-aware.

## M8 — Construction Editor (phần deterministic, hoàn thành)

### Đã làm
- `GeoGebraAdapter` + impl: `setPointCoords`, `setObjectColor`,
  `setObjectVisible` (qua api.setCoords/setColor/setVisible).
- `src/modules/editing/editCommands.ts` — EditOperation types,
  `parseEditCommand` (tiếng Việt deterministic): xóa/di chuyển/đổi màu/
  ẩn/hiện; resolveTarget theo tên object; normalizeColor (tên màu + hex).
- `applyEditOperations` — áp dụng ops lên adapter, trả messages.
- UI: InspectorPanel `onSelect` → WorkspaceClient `selectedObject` →
  AIChatPanel; chat thử parse edit TRƯỚC khi gọi AI; hỗ trợ bỏ tên object
  khi đang chọn sẵn ("xóa", "di chuyển đến (5,3)", "đổi màu thành đỏ").
- `editCommands.test.ts` — 8 tests.

### Kiểm thử
- vitest: 37/37 pass. lint/typecheck/build: pass.

### Còn lại / rủi ro
- Edit mới deterministic (không qua AI); AI-based EditPlan theo
  CONSTRUCTION_EDITOR_SPEC chưa làm (cần construction context → model).
- Chưa có diff UI / conflict handling.
- Edit ops chưa vào undo history (delete/move không phải command batch).

### Bước tiếp theo
- M6: Project persistence (Supabase) — cần credentials.
- M7: Export PNG/SVG/.ggb.
- AI-based edit endpoint /api/v1/ai/edits.

## M7 — Export + Local Persistence (interim, hoàn thành)

### Đã làm
- `src/lib/geogebra/export.ts` — `exportGgb` (snapshot base64 → file .ggb
  download), local project store (localStorage: list/save/get/delete,
  max 50 projects).
- WorkspaceClient: nút 💾 Lưu (exportSnapshot → localStorage), ⬇ .ggb,
  auto-load `?load=<id>` khi adapter ready.
- `ProjectsClient` + `/projects` page thật: list dự án local, Mở/Xóa.

### Kiểm thử
- lint/typecheck/build: pass. (Chưa verify getBase64/setBase64 trên applet
  thật — nếu API thiếu sẽ báo UNSUPPORTED_API_CAPABILITY.)

### Còn lại / rủi ro
- PNG/SVG export chưa làm — Apps API không expose trực tiếp; cần verify
  phương án (iframe capture hoặc GeoGebra export endpoint).
- localStorage chỉ lưu snapshot .ggb — chưa lưu IR/metadata đầy đủ.
- M6 Supabase vẫn cần cho multi-device/auth/RLS.

### Bước tiếp theo
- M6: Supabase persistence thật (cần credentials từ user).
- AI-based edit endpoint.
- PNG/SVG export sau khi verify API.

## M8b — AI-based Edit Endpoint (hoàn thành phần code)

### Đã làm
- `src/modules/editing/editPlan.ts` — EditPlan/EditOperation Zod schemas,
  editRequestSchema, EditResponse types.
- `editPrompt.ts` — EDIT_SYSTEM_PROMPT (context-aware, safety rules:
  không bịa target, không xóa trừ khi yêu cầu rõ, not_an_edit escape),
  parseEditOutput (auto requiresConfirmation khi có delete).
- `geminiEdit.ts` — Gemini provider cho edit task.
- `POST /api/v1/ai/edits` — validate request, trả {status:ok,plan} |
  {status:not_an_edit} | error envelope.
- AIChatPanel: deterministic parse trước → fallback AI edit khi prompt có
  từ khóa chỉnh sửa → gửi object context (name/type/value) → EditPlan →
  window.confirm nếu requiresConfirmation → applyEditOperations.
- `editPlan.test.ts` — 6 tests.

### Kiểm thử
- vitest: 43/43 pass. lint/typecheck/build: pass. 3 API routes.

### Còn lại / rủi ro
- Chưa test edits API với Gemini thật.
- Edit ops chưa vào undo history.
- Chưa có diff UI — chỉ confirm dialog.

### Bước tiếp theo
- M6: Supabase persistence (cần credentials).
- Undo cho edit ops (snapshot-based).
- PNG/SVG export.

## M8c — Undo cho Edit Ops (snapshot-based, hoàn thành)

### Đã làm
- `CommandHistory` hỗ trợ 2 loại entry: command batch (như cũ) +
  snapshot pair {before, after} — undo/redo = loadSnapshot.
- `AIChatPanel.applyWithSnapshot` — chụp exportSnapshot trước/sau mọi
  edit ops (deterministic + AI edit), gọi onEditApplied.
- `WorkspaceClient.recordEdit` — đẩy snapshot entry vào history.
- Test snapshot undo/redo.

### Kiểm thử
- vitest: 44/44 pass. lint/typecheck/build: pass.

### Còn lại / rủi ro
- Snapshot .ggb có thể lớn — stack 50 entries có thể tốn memory;
  cần giới hạn kích thước hoặc prune.
- loadSnapshot restore toàn bộ state — undo edit sẽ revert cả
  construction commands gần nhất nếu trộn lẫn (chấp nhận được MVP).
- Chưa verify getBase64/setBase64 trên applet thật.

### Bước tiếp theo
- M6: Supabase persistence (cần credentials).
- PNG/SVG export.
- Rate limiting + observability (M13).

## M13-lite — Rate Limiting + Observability (hoàn thành phần code)

### Đã làm
- `src/lib/rateLimit.ts` — in-memory sliding-window limiter per key
  (IP + scope), eviction đơn giản, `clientKey` từ x-forwarded-for.
- `src/lib/observability.ts` — `logEvent` structured JSON, `logAIUsage`
  (task/duration/ok/code — không log prompt/PII).
- Wire vào cả 3 API routes: constructions 20/min, edits 30/min,
  image-analysis 10/min → 429 RATE_LIMITED.
- `rateLimit.test.ts` — 5 tests.

### Kiểm thử
- vitest: 49/49 pass. lint/typecheck/build: pass.

### Còn lại / rủi ro
- In-memory limiter chỉ đúng cho single instance — multi-instance cần
  Redis/Upstash (ghi trong SECURITY_SPEC).
- Chưa có auth → rate limit theo IP dễ bypass bằng proxy; chấp nhận MVP.
- Chưa có error tracking service (Sentry) — log JSON đủ cho MVP.

### Bước tiếp theo
- M6: Supabase persistence (cần credentials).
- PNG/SVG export.
- E2E tests (Playwright).

## Export ảnh PNG/SVG (hoàn thành phần code)

### Đã làm
- `ggbTypes.ts`: `exportImage(filename, format, scale, dpi, transparent,
  copyToClipboard)` trong GGBApi.
- `types.ts`: `exportImage?` optional trong GeoGebraAdapter.
- `GeoGebraWebAdapter.exportImage` — gọi api.exportImage("construction",
  format, scale=2, dpi=300), trả {ok, error}.
- `WorkspaceClient`: nút PNG + SVG trong toolbar, message feedback.

### Kiểm thử
- vitest: 49/49 pass. lint/typecheck/build: pass.

### Còn lại / rủi ro
- exportImage là optional — applet cũ/không hỗ trợ sẽ báo lỗi nhẹ.
- Chưa verify trên applet thật (cần chạy browser).
- SVG export của GeoGebra có thể không giữ text/labels hoàn hảo.

### Bước tiếp theo
- M6: Supabase persistence (cần credentials).
- E2E tests (Playwright).
- Verify thủ công trên browser: exportImage, undo snapshot, edits API.

## E2E — Playwright setup (hoàn thành phần code)

### Đã làm
- `@playwright/test` devDependency + scripts `test:e2e`, `test:e2e:ui`.
- `playwright.config.ts` — chromium, webServer tự start `next dev` port
  3100, workers=1 (GeoGebra applet nặng), trace on failure.
- `e2e/smoke.spec.ts` — 3 tests: trang chủ, workspace mount applet
  (chờ 45s cho deployggb.js CDN), projects page.

### Kiểm thử
- typecheck/lint/build: pass. Chưa chạy E2E thật.

### Còn lại / rủi ro
- Cần `npx playwright install chromium` trước khi chạy.
- Smoke test phụ thuộc CDN geogebra.org — có thể flaky offline.
- Chưa cover flow AI (cần GEMINI_API_KEY + mock).

### Bước tiếp theo
- M6: Supabase persistence (cần credentials).
- Chạy E2E sau khi install browsers.
- Verify thủ công trên browser.

## M6-lite — Supabase Persistence (env-gated, hoàn thành phần code)

### Đã làm
- `src/lib/persistence/supabaseStore.ts` — PostgREST client không cần
  SDK: list/save(upsert)/get/delete bảng `projects`. Env-gated qua
  NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY.
- `src/lib/persistence/index.ts` — unified store: Supabase khi enabled,
  fallback localStorage khi thiếu env hoặc Supabase lỗi.
- `ProjectsClient` + `WorkspaceClient` chuyển sang unified store
  (async). UI hiển thị "Đang lưu cloud qua Supabase" khi enabled.
- `supabaseStore.test.ts` — 5 tests (mock fetch, env).

### Kiểm thử
- vitest: 54/54 pass. lint/typecheck/build: pass.

### Còn lại / rủi ro
- CHƯA bật RLS/auth — anon key public, ai có URL đều đọc/ghi được.
  Chỉ dùng dev/MVP; production cần Supabase Auth + RLS policies.
- Chưa có bảng `projects` — user phải tạo SQL (ghi trong comment file).
- Chưa sync metadata đầy đủ (IR, conversation) — chỉ snapshot .ggb.

### Bước tiếp theo
- User tạo Supabase project + bảng + set env → test thật.
- M6-full: auth + RLS + user_id scoping.
- Verify thủ công trên browser.

## M6-full (phần code) — Supabase Auth + user scoping

### Đã làm
- `src/lib/auth/supabaseAuth.ts` — GoTrue REST client không cần SDK:
  signIn/signUp/signOut/getSession/getCurrentUser, env-gated, session
  trong localStorage (MVP — production nên httpOnly cookie).
- `supabaseStore` — thêm `user_id` scoping: list/get/delete filter theo
  user_id (eq khi login, is.null khi anon); save ghi user_id.
- `persistence/index` — truyền getCurrentUser()?.id xuống store.
- `/login` page + `LoginClient` — form đăng nhập/đăng ký, xử lý
  needsConfirmation.
- `Sidebar` — auth badge: email + Đăng xuất, hoặc link Đăng nhập.
- Tests: supabaseAuth 5 tests (localStorage stub), cập nhật
  supabaseStore tests cho user_id filter.

### Kiểm thử
- vitest: 59/59 pass. lint/typecheck/build: pass. Route /login OK.

### Còn lại / rủi ro
- Session trong localStorage — XSS có thể đánh cắp token; production
  cần httpOnly cookie + server-side session.
- Chưa có route guard — user không bắt buộc login (anon vẫn dùng được).
- Chưa bật RLS phía Supabase — user_id filter chỉ là client-side.
- Bảng projects cần thêm cột user_id (xem comment trong supabaseStore).

### Bước tiếp theo
- User tạo Supabase project + bảng (có user_id) + Auth users → test.
- Bật RLS policies phía Supabase.
- Route guard + server session (nếu cần production).

## Polish — README + ErrorBoundary

### Đã làm
- `README.md` — viết lại đầy đủ: stack, env vars, Supabase SQL setup,
  scripts, kiến trúc, bảo mật.
- `src/components/ErrorBoundary.tsx` — class error boundary với fallback
  + nút thử lại; wrap GeoGebraContainer trong WorkspaceClient.

### Kiểm thử
- vitest: 59/59 pass. lint/typecheck/build: pass.

### Trạng thái tổng
Tất cả milestone code-only hoàn thành. Còn lại cần user:
- Supabase project + env → test M6/auth thật.
- GEMINI_API_KEY → test AI flows thật.
- `npx playwright install chromium` → chạy E2E.
- Bật RLS + route guard cho production.

## Polish 2 — History prune + AuthGuard

### Đã làm
- `CommandHistory` — prune snapshot entries khi tổng base64 vượt
  8MB (constructor param, default 8MB); test prune.
- `src/components/auth/AuthGuard.tsx` — route guard client-side,
  active khi NEXT_PUBLIC_REQUIRE_AUTH=true + Supabase env; redirect
  /login khi chưa auth. Wrap trong AppShell.

### Kiểm thử
- vitest: 60/60 pass. lint/typecheck/build: pass.

### Lưu ý
- AuthGuard là client-side — session trong localStorage; production
  cần middleware + httpOnly cookie cho bảo mật thật.
- REQUIRE_AUTH mặc định tắt — anon vẫn dùng được.

## Polish 3 — Chat history + env example + deploy notes

### Đã làm
- `AIChatPanel` — persist messages vào localStorage (key `ggb-ai-chat`,
  cap 50 messages), load khi mount, nút "Xóa lịch sử" + note UI.
- `.env.example` — cập nhật khớp env vars thực tế trong code
  (GEMINI_*, NEXT_PUBLIC_SUPABASE_*, NEXT_PUBLIC_REQUIRE_AUTH).
- `README.md` — thêm section Deploy (Vercel) + lưu ý rate limit
  in-memory trên serverless.

### Kiểm thử
- vitest: 60/60 pass. lint/typecheck/build: pass.

## Polish 4 — Keyboard shortcuts + git commit

### Đã làm
- `WorkspaceClient` — Ctrl+Z undo, Ctrl+Shift+Z / Ctrl+Y redo
  (bỏ qua khi focus input/textarea); tooltip nút cập nhật.
- Commit toàn bộ MVP lên git (`2dc0ab4`).

### Kiểm thử
- lint/typecheck/build: pass.

## Polish 6 — Dark mode toggle

### Đã làm
- `ThemeToggle` — toggle `.dark` class lên `<html>`, persist
  localStorage (`ggb-ai-theme`), fallback `prefers-color-scheme`.
  Dark tokens đã có sẵn trong globals.css.
- `Topbar` — thêm ThemeToggle bên phải.

### Kiểm thử
- lint/typecheck/build: pass.

## Polish 7 — Inspector clear-all

### Đã làm
- `InspectorPanel` — nút "Xóa hết" xóa tất cả đối tượng (confirm
  trước). Lưu ý: xóa qua Inspector không đi qua CommandHistory —
  không undo được (giới hạn hiện tại).

### Kiểm thử
- lint/typecheck/build: pass.

## Polish 5 — Project rename/duplicate

### Đã làm
- `ProjectsClient` — nút ✎ đổi tên (prompt) và ⧉ nhân bản (id mới,
  title + " (bản sao)") qua unified store — hoạt động cả local lẫn
  Supabase (upsert).

### Kiểm thử
- lint/typecheck/build: pass.
