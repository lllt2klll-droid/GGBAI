import { validateGeometryDocument } from "@/modules/geometry-validator/validate";
import { compileGeometryDocument } from "@/modules/geometry-compiler/compile";
import type {
  AIConstructionResponse,
  AIProvider,
  AIRequest,
  ClarificationQuestion,
} from "./types";

const MAX_PROMPT_LENGTH = 2000;
const MIN_PROMPT_LENGTH = 8;

/** Heuristic clarification: prompt quá ngắn/mơ hồ → hỏi lại thay vì đoán. */
function needsClarification(prompt: string): ClarificationQuestion[] | null {
  const trimmed = prompt.trim();
  if (trimmed.length < MIN_PROMPT_LENGTH) {
    return [
      {
        id: "describe_shape",
        question: "Bạn muốn dựng hình gì? Hãy mô tả bằng tiếng Việt, ví dụ: “Tam giác ABC vuông tại A”.",
      },
    ];
  }
  const vague = /^(hình|vẽ|dựng|tạo|cho tôi|làm)\s*$/i.test(trimmed);
  if (vague) {
    return [
      {
        id: "describe_shape",
        question: "Bạn muốn dựng hình gì cụ thể? Ví dụ: tam giác, đường tròn, hình vuông, đồ thị hàm số.",
        options: ["Tam giác", "Đường tròn", "Tứ giác", "Đồ thị hàm số"],
      },
    ];
  }
  return null;
}

function summarize(doc: { objects: unknown[] }): string {
  return `Đã tạo ${doc.objects.length} đối tượng hình học.`;
}

/**
 * Orchestrator — text_to_geometry pipeline:
 * classify/clarify → provider → parse → validate IR → compile plan.
 * KHÔNG thực thi command ở đây; trả plan cho client thực thi qua adapter.
 */
export async function handleTextToGeometry(
  request: AIRequest,
  provider: AIProvider,
): Promise<AIConstructionResponse> {
  const prompt = request.prompt?.trim() ?? "";

  if (prompt.length > MAX_PROMPT_LENGTH) {
    return {
      status: "error",
      code: "AI_REQUEST_TOO_LARGE",
      message: `Prompt vượt quá ${MAX_PROMPT_LENGTH} ký tự`,
    };
  }

  const questions = needsClarification(prompt);
  if (questions) {
    return { status: "needs_clarification", questions };
  }

  const result = await provider.generateGeometry(
    prompt,
    request.gradeLevel,
    request.mode ?? "2d",
  );
  if (!result.ok) {
    return { status: "error", code: result.code, message: result.message };
  }

  const validation = validateGeometryDocument(result.raw);
  if (!validation.valid || !validation.document) {
    return {
      status: "error",
      code: "AI_INVALID_OUTPUT",
      message: "AI output không hợp lệ theo Geometry IR schema",
      issues: validation.issues.slice(0, 10),
    };
  }

  const plan = compileGeometryDocument(validation.document);
  const warnings = [...plan.warnings];
  if (plan.operations.length === 0) {
    return {
      status: "error",
      code: "AI_INVALID_OUTPUT",
      message: "Không compile được đối tượng nào từ IR",
    };
  }

  return {
    status: "ok",
    document: validation.document,
    plan,
    summary: summarize(validation.document),
    warnings,
  };
}
