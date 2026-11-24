import type { GeometryDocument } from "@/modules/geometry-ir";
import type { CommandPlan } from "@/modules/geometry-compiler";

export type AIErrorCode =
  | "AI_NOT_CONFIGURED"
  | "AI_PROVIDER_ERROR"
  | "AI_TIMEOUT"
  | "AI_INVALID_OUTPUT"
  | "AI_CLARIFICATION_REQUIRED"
  | "AI_RATE_LIMITED"
  | "AI_REQUEST_TOO_LARGE";

export type AIRequest = {
  prompt: string;
  mode?: "2d" | "3d" | "graphing";
  gradeLevel?: "primary" | "lower_secondary" | "upper_secondary";
  conversationId?: string;
};

export type ClarificationQuestion = {
  id: string;
  question: string;
  options?: string[];
};

export type AIConstructionSuccess = {
  status: "ok";
  document: GeometryDocument;
  plan: CommandPlan;
  summary: string;
  warnings: string[];
};

export type AIConstructionClarify = {
  status: "needs_clarification";
  questions: ClarificationQuestion[];
  summary?: string;
};

export type AIConstructionError = {
  status: "error";
  code: AIErrorCode;
  message: string;
  issues?: { code: string; message: string; objectId?: string }[];
};

export type AIConstructionResponse =
  | AIConstructionSuccess
  | AIConstructionClarify
  | AIConstructionError;

export type ProviderResult =
  | { ok: true; raw: unknown }
  | { ok: false; code: AIErrorCode; message: string };

export interface AIProvider {
  readonly name: string;
  generateGeometry(
    prompt: string,
    context?: string,
    mode?: "2d" | "3d" | "graphing",
  ): Promise<ProviderResult>;
}
