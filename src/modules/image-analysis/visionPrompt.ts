import { imageAnalysisResultSchema, type ImageAnalysisResult } from "./types";

/**
 * Vision prompt theo IMAGE_ANALYSIS_SPEC:
 * - Chỉ trích facts NHÌN THẤY (đánh dấu, ký hiệu, nhãn).
 * - KHÔNG suy diễn quan hệ bằng nhau từ hình thức.
 * - Mọi fact sourceType="diagram_marking" hoặc "problem_text", confirmed=false.
 */

export const VISION_SYSTEM_PROMPT = `Bạn là bộ phân tích hình học từ ảnh. Nhiệm vụ: mô tả hình và trích xuất các dữ kiện hình học NHÌN THẤY trong ảnh.

Xuất DUY NHẤT JSON object:
{
  "description": "mô tả ngắn gọn hình trong ảnh (tiếng Việt)",
  "facts": [
    {
      "id": "fact_1",
      "statement": "mô tả dữ kiện, vd 'AB = 4 cm', 'góc A vuông', 'AB song song CD'",
      "normalizedValue": "giá trị chuẩn hóa nếu có (vd '4', '90')",
      "sourceType": "diagram_marking" | "problem_text",
      "confidence": 0.0-1.0,
      "confirmed": false
    }
  ],
  "warnings": ["cảnh báo nếu ảnh mờ/không rõ/không phải hình học"]
}

QUY TẮC:
1. CHỈ trích dữ kiện có bằng chứng trong ảnh: ký hiệu vuông góc, gạch bằng nhau, nhãn độ dài/góc, chữ trong hình.
2. KHÔNG suy diễn: hai đoạn trông bằng nhau KHÔNG có nghĩa bằng nhau; góc trông nhọn KHÔNG có nghĩa số đo cụ thể.
3. Nếu không chắc chắn, vẫn liệt kê nhưng đặt confidence thấp (<0.5).
4. Nếu ảnh không phải hình học/đề toán, trả facts rỗng và warning giải thích.
5. facts tối đa 30 mục, statement ngắn gọn tiếng Việt.`;

export function buildVisionUserPrompt(extra?: string): string {
  return extra
    ? `Phân tích ảnh này. Ghi chú thêm từ người dùng: ${extra}`
    : "Phân tích ảnh này và trích xuất dữ kiện hình học.";
}

export type VisionProviderResult =
  | { ok: true; result: ImageAnalysisResult }
  | { ok: false; code: string; message: string };

/** Parse + validate output vision thành ImageAnalysisResult. */
export function parseVisionOutput(raw: unknown): VisionProviderResult {
  const parsed = imageAnalysisResultSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      code: "AI_INVALID_OUTPUT",
      message: "Vision output không đúng schema facts",
    };
  }
  // Ép mọi fact về confirmed=false — user phải xác nhận (spec)
  const result: ImageAnalysisResult = {
    ...parsed.data,
    facts: parsed.data.facts.map((f) => ({ ...f, confirmed: false })),
  };
  return { ok: true, result };
}
