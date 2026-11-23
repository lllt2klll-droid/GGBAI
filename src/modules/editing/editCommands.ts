import type { GeoGebraAdapter } from "@/lib/geogebra/types";

/**
 * Construction Editor — edit operations trên model hiện có.
 * M8 phần deterministic: parser nhận diện lệnh sửa phổ biến từ chat.
 * AI-based edit plan (CONSTRUCTION_EDITOR_SPEC EditPlan) sẽ bổ sung sau.
 */

export type EditOperation =
  | { type: "delete_object"; target: string }
  | { type: "move_point"; target: string; x: number; y: number }
  | { type: "set_color"; target: string; color: string }
  | { type: "set_visible"; target: string; visible: boolean };

export type EditParseResult =
  | { ok: true; operations: EditOperation[] }
  | { ok: false; reason: string };

const COLOR_MAP: Record<string, string> = {
  đỏ: "#dc2626",
  xanh: "#2563eb",
  xanh_la: "#16a34a",
  vàng: "#eab308",
  tím: "#9333ea",
  cam: "#ea580c",
  hồng: "#db2777",
  đen: "#111827",
  trắng: "#ffffff",
  xám: "#6b7280",
  red: "#dc2626",
  blue: "#2563eb",
  green: "#16a34a",
};

function normalizeColor(raw: string): string | null {
  const key = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (COLOR_MAP[key]) return COLOR_MAP[key];
  if (/^#?[0-9a-fA-F]{6}$/.test(raw)) {
    return raw.startsWith("#") ? raw : `#${raw}`;
  }
  return null;
}

/** Tìm tên object khớp target (không phân biệt hoa thường, cho phép prefix). */
function resolveTarget(target: string, objectNames: string[]): string | null {
  const t = target.trim();
  if (objectNames.includes(t)) return t;
  const lower = t.toLowerCase();
  const exact = objectNames.find((n) => n.toLowerCase() === lower);
  if (exact) return exact;
  const prefix = objectNames.filter((n) => n.toLowerCase().startsWith(lower));
  return prefix.length === 1 ? prefix[0] : null;
}

/**
 * Parse lệnh chỉnh sửa tiếng Việt. Trả null nếu không phải edit command
 * (để caller fallback sang AI construction).
 */
export function parseEditCommand(
  text: string,
  objectNames: string[],
): EditParseResult | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;

  // "xóa A" / "xoá điểm A" / "delete A"
  const del = /^(?:xoá|xóa|delete|remove)\s+(?:điểm\s+|đối tượng\s+|object\s+)?([a-z][a-z0-9_]*)\s*$/i.exec(t);
  if (del) {
    const target = resolveTarget(del[1], objectNames);
    if (!target) return { ok: false, reason: `Không tìm thấy đối tượng "${del[1]}"` };
    return { ok: true, operations: [{ type: "delete_object", target }] };
  }

  // "di chuyển A đến (5, 3)" / "đặt A tại (5,3)" / "move A to (5,3)"
  const move = /(?:di\s+chuyển|đặt|move|kéo)\s+([a-z][a-z0-9_]*)\s+(?:đến|tới|tại|to)?\s*\(?\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*\)?/i.exec(t);
  if (move) {
    const target = resolveTarget(move[1], objectNames);
    if (!target) return { ok: false, reason: `Không tìm thấy đối tượng "${move[1]}"` };
    return {
      ok: true,
      operations: [
        { type: "move_point", target, x: Number(move[2]), y: Number(move[3]) },
      ],
    };
  }

  // "đổi màu A thành đỏ" / "tô màu B xanh"
  const color = /(?:đổi\s+màu|tô\s+màu|color)\s+([a-z][a-z0-9_]*)\s+(?:thành|sang|to)?\s*([^\s,;.]+)/i.exec(t);
  if (color) {
    const target = resolveTarget(color[1], objectNames);
    if (!target) return { ok: false, reason: `Không tìm thấy đối tượng "${color[1]}"` };
    const hex = normalizeColor(color[2]);
    if (!hex) return { ok: false, reason: `Màu không hợp lệ: ${color[2]}` };
    return { ok: true, operations: [{ type: "set_color", target, color: hex }] };
  }

  // "ẩn A" / "hiện A"
  const vis = /^(ẩn|hiện|hide|show)\s+([a-z][a-z0-9_]*)\s*$/i.exec(t);
  if (vis) {
    const target = resolveTarget(vis[2], objectNames);
    if (!target) return { ok: false, reason: `Không tìm thấy đối tượng "${vis[2]}"` };
    return {
      ok: true,
      operations: [{ type: "set_visible", target, visible: vis[1].toLowerCase() === "hiện" || vis[1].toLowerCase() === "show" }],
    };
  }

  return null;
}

/** Áp dụng EditOperation lên adapter. Trả mô tả kết quả từng op. */
export async function applyEditOperations(
  adapter: GeoGebraAdapter,
  operations: EditOperation[],
): Promise<{ ok: number; failed: number; messages: string[] }> {
  let ok = 0;
  let failed = 0;
  const messages: string[] = [];

  for (const op of operations) {
    let success = false;
    switch (op.type) {
      case "delete_object":
        success = await adapter.deleteObject(op.target);
        messages.push(success ? `Đã xóa ${op.target}` : `Không xóa được ${op.target}`);
        break;
      case "move_point":
        success = await adapter.setPointCoords(op.target, op.x, op.y);
        messages.push(success ? `Đã di chuyển ${op.target} → (${op.x}, ${op.y})` : `Không di chuyển được ${op.target}`);
        break;
      case "set_color":
        success = await adapter.setObjectColor(op.target, op.color);
        messages.push(success ? `Đã đổi màu ${op.target}` : `Không đổi màu được ${op.target}`);
        break;
      case "set_visible":
        success = await adapter.setObjectVisible(op.target, op.visible);
        messages.push(success ? `${op.visible ? "Hiện" : "Ẩn"} ${op.target}` : `Không đổi visibility ${op.target}`);
        break;
    }
    if (success) ok += 1;
    else failed += 1;
  }
  return { ok, failed, messages };
}
