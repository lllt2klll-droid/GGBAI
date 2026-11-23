import { editPlanSchema, type EditPlan, type EditRequest } from "./editPlan";

/**
 * Edit prompt theo CONSTRUCTION_EDITOR_SPEC:
 * model nhận construction context (danh sách object) + yêu cầu sửa
 * → EditPlan JSON. Safety: không xóa object user tạo trừ khi yêu cầu rõ.
 */

export const EDIT_SYSTEM_PROMPT = `Bạn là bộ chỉnh sửa hình học. Nhận danh sách đối tượng hiện có trên canvas và yêu cầu chỉnh sửa của người dùng, xuất DUY NHẤT JSON EditPlan.

Schema EditPlan:
{
  "summary": "mô tả ngắn gọn thay đổi",
  "operations": [ ... ],
  "requiresConfirmation": true|false
}

Operation types:
- { "type": "delete_object", "target": "tên_object", "reason": "lý do" }
- { "type": "move_point", "target": "tên_điểm", "x": number, "y": number }
- { "type": "set_color", "target": "tên_object", "color": "#RRGGBB" }
- { "type": "set_visible", "target": "tên_object", "visible": true|false }

QUY TẮC:
1. target PHẢI là tên object tồn tại trong danh sách được cung cấp. Không bịa tên.
2. move_point chỉ áp dụng cho đối tượng loại point. Tọa độ hữu hạn.
3. color phải dạng #RRGGBB hex.
4. KHÔNG xóa object trừ khi người dùng yêu cầu rõ ràng ("xóa", "bỏ", "remove"). Nếu yêu cầu mơ hồ, ưu tiên set_visible thay delete.
5. Nếu yêu cầu không phải chỉnh sửa (vd "dựng tam giác mới"), trả { "not_an_edit": true, "reason": "..." } thay vì plan.
6. requiresConfirmation = true nếu có delete_object.
7. Tối đa 20 operations.`;

export function buildEditUserPrompt(request: EditRequest): string {
  const objList = request.objects
    .map((o) => `- ${o.name}${o.type ? ` (${o.type})` : ""}${o.value ? ` = ${o.value}` : ""}`)
    .join("\n");
  return `Đối tượng hiện có trên canvas:\n${objList || "(trống)"}\n\nYêu cầu chỉnh sửa: ${request.prompt}\n\nXuất EditPlan JSON (hoặc {"not_an_edit":true,"reason":"..."}):`;
}

export type EditProviderResult =
  | { ok: true; plan: EditPlan }
  | { ok: false; code: "NOT_AN_EDIT"; reason: string }
  | { ok: false; code: string; message: string };

export function parseEditOutput(raw: unknown): EditProviderResult {
  if (
    typeof raw === "object" &&
    raw !== null &&
    (raw as Record<string, unknown>).not_an_edit === true
  ) {
    const reason = (raw as Record<string, unknown>).reason;
    return {
      ok: false,
      code: "NOT_AN_EDIT",
      reason: typeof reason === "string" ? reason : "Không phải yêu cầu chỉnh sửa",
    };
  }
  const parsed = editPlanSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      code: "AI_INVALID_OUTPUT",
      message: "Edit output không đúng schema EditPlan",
    };
  }
  // Auto-set requiresConfirmation nếu có delete
  const hasDelete = parsed.data.operations.some((o) => o.type === "delete_object");
  return {
    ok: true,
    plan: { ...parsed.data, requiresConfirmation: parsed.data.requiresConfirmation || hasDelete },
  };
}
