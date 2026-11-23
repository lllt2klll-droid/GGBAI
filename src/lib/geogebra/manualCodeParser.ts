import { validateGeometryDocument } from "@/modules/geometry-validator/validate";
import { compileGeometryDocument } from "@/modules/geometry-compiler/compile";
import { isAllowedCommandKey } from "./commandRegistry";
import type { SafeGeoGebraCommand } from "./types";

export type ParseManualCodeResult =
  | {
      ok: true;
      commands: SafeGeoGebraCommand[];
      summary: string;
      source: "ir_json" | "plan_json" | "commands_script";
    }
  | {
      ok: false;
      error: string;
    };

function withLabel(
  args: Record<string, string | number | boolean | string[]>,
  label?: string,
): SafeGeoGebraCommand["args"] {
  if (label && /^[A-Za-z][A-Za-z0-9_]*$/.test(label)) {
    return { ...args, label };
  }
  return args;
}

/**
 * Phân tích mã người dùng nhập thủ công (JSON từ AI hoặc script dòng lệnh GeoGebra)
 * thành danh sách SafeGeoGebraCommand an toàn qua allowlist.
 */
export function parseManualCode(rawInput: string): ParseManualCodeResult {
  const input = rawInput.trim();
  if (!input) {
    return { ok: false, error: "Vui lòng nhập hoặc dán mã code." };
  }

  // 1. Thử phân tích dạng JSON
  if (input.startsWith("{") || input.startsWith("[")) {
    try {
      const parsed = JSON.parse(input) as unknown;

      // TH 1a: GeometryDocument JSON (chuẩn IR từ AI)
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "objects" in parsed &&
        Array.isArray((parsed as Record<string, unknown>).objects)
      ) {
        // Đảm bảo schemaVersion và documentId nếu user copy thiếu
        const docObj = parsed as Record<string, unknown>;
        if (!docObj.schemaVersion) docObj.schemaVersion = "1.0";
        if (!docObj.documentId) docObj.documentId = `manual_${Date.now()}`;
        if (!docObj.mode) docObj.mode = "2d";

        const val = validateGeometryDocument(docObj);
        if (!val.valid || !val.document) {
          const issues = val.issues.map((i) => i.message).join(", ");
          return {
            ok: false,
            error: `JSON không đúng cấu trúc Geometry IR: ${issues || "Lỗi schema"}`,
          };
        }

        const plan = compileGeometryDocument(val.document);
        const commands: SafeGeoGebraCommand[] = plan.operations.map((op) => ({
          operationId: op.operationId,
          commandKey: op.commandKey,
          args: op.args,
        }));

        return {
          ok: true,
          commands,
          summary: `Đã dịch ${commands.length} bước từ Geometry IR JSON`,
          source: "ir_json",
        };
      }

      // TH 1b: CommandPlan hoặc object chứa operations
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "operations" in parsed &&
        Array.isArray((parsed as Record<string, unknown>).operations)
      ) {
        const ops = (parsed as { operations: Array<{ commandKey: string; args: SafeGeoGebraCommand["args"] }> }).operations;
        const commands: SafeGeoGebraCommand[] = [];
        for (const op of ops) {
          if (!op.commandKey || !isAllowedCommandKey(op.commandKey)) {
            return {
              ok: false,
              error: `Lệnh không hợp lệ hoặc không nằm trong allowlist: ${op.commandKey}`,
            };
          }
          commands.push({
            operationId: `op_${Date.now()}_${commands.length}`,
            commandKey: op.commandKey,
            args: op.args || {},
          });
        }
        return {
          ok: true,
          commands,
          summary: `Đã nạp ${commands.length} lệnh từ mảng operations`,
          source: "plan_json",
        };
      }

      // TH 1c: Mảng trực tiếp các lệnh [{ commandKey, args }]
      if (Array.isArray(parsed)) {
        const commands: SafeGeoGebraCommand[] = [];
        for (const item of parsed) {
          if (
            typeof item === "object" &&
            item !== null &&
            "commandKey" in item &&
            typeof item.commandKey === "string" &&
            isAllowedCommandKey(item.commandKey)
          ) {
            commands.push({
              operationId: `op_${Date.now()}_${commands.length}`,
              commandKey: item.commandKey,
              args: (item.args as SafeGeoGebraCommand["args"]) || {},
            });
          }
        }
        if (commands.length > 0) {
          return {
            ok: true,
            commands,
            summary: `Đã nạp ${commands.length} lệnh từ mảng JSON`,
            source: "plan_json",
          };
        }
      }
    } catch {
      // JSON parse lỗi -> fallback sang script dòng lệnh bên dưới
    }
  }

  // 2. Phân tích dạng danh sách lệnh dòng (GeoGebra command lines)
  const lines = input
    .split(/[\r\n;]+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("//") && !l.startsWith("#"));

  if (lines.length === 0) {
    return { ok: false, error: "Không tìm thấy câu lệnh nào để thực thi." };
  }

  const commands: SafeGeoGebraCommand[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const opId = `cmd_${Date.now()}_${idx}`;

    // A = (1, 2) hoặc (1, 2)
    const ptCoordMatch = /^([A-Za-z][A-Za-z0-9_]*\s*=\s*)?\(\s*(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)\s*\)$/.exec(
      line,
    );
    if (ptCoordMatch) {
      const label = ptCoordMatch[1] ? ptCoordMatch[1].replace("=", "").trim() : `P_${idx + 1}`;
      const x = parseFloat(ptCoordMatch[2]);
      const y = parseFloat(ptCoordMatch[4]);
      commands.push({
        operationId: opId,
        commandKey: "point",
        args: { label, x, y },
      });
      continue;
    }

    // label = CommandName(args...) hoặc CommandName(args...)
    const cmdMatch = /^([A-Za-z][A-Za-z0-9_]*\s*=\s*)?([A-Za-z][A-Za-z0-9_]*)\s*\((.*)\)$/.exec(
      line,
    );
    if (cmdMatch) {
      const label = cmdMatch[1] ? cmdMatch[1].replace("=", "").trim() : undefined;
      const cmdName = cmdMatch[2].toLowerCase();
      const rawArgs = cmdMatch[3]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      switch (cmdName) {
        case "point": {
          if (rawArgs.length >= 2) {
            const x = parseFloat(rawArgs[0]);
            const y = parseFloat(rawArgs[1]);
            commands.push({
              operationId: opId,
              commandKey: "point",
              args: { label: label || `P_${idx + 1}`, x, y },
            });
            continue;
          }
          break;
        }

        case "segment": {
          if (rawArgs.length >= 2) {
            commands.push({
              operationId: opId,
              commandKey: "segment",
              args: withLabel({ p1: rawArgs[0], p2: rawArgs[1] }, label),
            });
            continue;
          }
          break;
        }

        case "polygon": {
          if (rawArgs.length >= 3) {
            commands.push({
              operationId: opId,
              commandKey: "polygon",
              args: withLabel({ vertices: rawArgs.join(",") }, label),
            });
            continue;
          }
          break;
        }

        case "circle": {
          if (rawArgs.length >= 2) {
            const radius = parseFloat(rawArgs[1]);
            if (!isNaN(radius) && radius > 0) {
              commands.push({
                operationId: opId,
                commandKey: "circle",
                args: withLabel({ center: rawArgs[0], radius }, label),
              });
            } else {
              commands.push({
                operationId: opId,
                commandKey: "circle",
                args: withLabel({ center: rawArgs[0], through: rawArgs[1] }, label),
              });
            }
            continue;
          }
          break;
        }

        case "line": {
          if (rawArgs.length >= 2) {
            commands.push({
              operationId: opId,
              commandKey: "line",
              args: withLabel({ p1: rawArgs[0], p2: rawArgs[1] }, label),
            });
            continue;
          }
          break;
        }

        case "ray": {
          if (rawArgs.length >= 2) {
            commands.push({
              operationId: opId,
              commandKey: "ray",
              args: withLabel({ p1: rawArgs[0], p2: rawArgs[1] }, label),
            });
            continue;
          }
          break;
        }

        case "midpoint": {
          if (rawArgs.length >= 2) {
            commands.push({
              operationId: opId,
              commandKey: "midpoint",
              args: withLabel({ p1: rawArgs[0], p2: rawArgs[1] }, label),
            });
            continue;
          }
          break;
        }

        case "intersect":
        case "intersection": {
          if (rawArgs.length >= 2) {
            commands.push({
              operationId: opId,
              commandKey: "intersection",
              args: withLabel({ o1: rawArgs[0], o2: rawArgs[1] }, label),
            });
            continue;
          }
          break;
        }

        case "perpendicularline":
        case "perpendicular": {
          if (rawArgs.length >= 2) {
            commands.push({
              operationId: opId,
              commandKey: "perpendicular_line",
              args: withLabel({ point: rawArgs[0], line: rawArgs[1] }, label),
            });
            continue;
          }
          break;
        }

        case "parallelline":
        case "parallel": {
          if (rawArgs.length >= 2) {
            commands.push({
              operationId: opId,
              commandKey: "parallel_line",
              args: withLabel({ point: rawArgs[0], line: rawArgs[1] }, label),
            });
            continue;
          }
          break;
        }

        case "perpendicularbisector": {
          if (rawArgs.length >= 2) {
            commands.push({
              operationId: opId,
              commandKey: "perpendicular_bisector",
              args: withLabel({ p1: rawArgs[0], p2: rawArgs[1] }, label),
            });
            continue;
          }
          break;
        }

        case "anglebisector": {
          if (rawArgs.length >= 3) {
            commands.push({
              operationId: opId,
              commandKey: "angle_bisector",
              args: withLabel({ vertex: rawArgs[0], l1: rawArgs[1], l2: rawArgs[2] }, label),
            });
            continue;
          }
          break;
        }
      }
    }

    return {
      ok: false,
      error: `Không thể nhận diện dòng ${idx + 1}: "${line}". Hỗ trợ lệnh Point, Segment, Polygon, Circle, Midpoint, Intersect, Line, Ray, PerpendicularLine, ParallelLine.`,
    };
  }

  if (commands.length === 0) {
    return { ok: false, error: "Không tìm thấy lệnh hợp lệ." };
  }

  return {
    ok: true,
    commands,
    summary: `Đã nạp ${commands.length} lệnh từ văn bản GeoGebra`,
    source: "commands_script",
  };
}
