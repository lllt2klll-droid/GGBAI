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

/** Tách tham số theo dấu phẩy ở top-level, bỏ qua dấu phẩy trong ngoặc lồng nhau. */
function splitTopLevelArgs(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

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
    .filter((l) => l.length > 0 && !l.startsWith("//") && !l.startsWith("#"))
    // GeoGebra cho phép cú pháp ngoặc vuông: Intersect[A, B] → Intersect(A, B)
    .map((l) => l.replace(/([A-Za-z][A-Za-z0-9_]*)\s*\[/g, "$1(").replace(/\]/g, ")"));

  if (lines.length === 0) {
    return { ok: false, error: "Không tìm thấy câu lệnh nào để thực thi." };
  }

  const commands: SafeGeoGebraCommand[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const opId = `cmd_${Date.now()}_${idx}`;

    // A = (1, 2, 3) hoặc (1, 2, 3) (Tọa độ 3D)
    const ptCoord3DMatch = /^([A-Za-z][A-Za-z0-9_]*\s*=\s*)?\(\s*(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)\s*\)$/.exec(
      line,
    );
    if (ptCoord3DMatch) {
      const label = ptCoord3DMatch[1] ? ptCoord3DMatch[1].replace("=", "").trim() : `P_${idx + 1}`;
      const x = parseFloat(ptCoord3DMatch[2]);
      const y = parseFloat(ptCoord3DMatch[4]);
      const z = parseFloat(ptCoord3DMatch[6]);
      commands.push({
        operationId: opId,
        commandKey: "point",
        args: { label, x, y, z },
      });
      continue;
    }

    // A = (1, 2) hoặc (1, 2) (Tọa độ 2D)
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

    // Hàm số: f(x) = x^2 hoặc y = sin(x)
    const funcMatch = /^([A-Za-z][A-Za-z0-9_]*)\s*\(\s*([A-Za-z])\s*\)\s*=\s*(.+)$/.exec(line);
    if (funcMatch) {
      commands.push({
        operationId: opId,
        commandKey: "function",
        args: { name: funcMatch[1], var: funcMatch[2], expr: funcMatch[3].trim() },
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
      const rawArgs = splitTopLevelArgs(cmdMatch[3]);

      switch (cmdName) {
        case "point": {
          if (rawArgs.length >= 2) {
            const x = parseFloat(rawArgs[0]);
            const y = parseFloat(rawArgs[1]);
            if (!isNaN(x) && !isNaN(y)) {
              commands.push({
                operationId: opId,
                commandKey: "point",
                args: { label: label || `P_${idx + 1}`, x, y },
              });
            } else {
              // Point(target, t) — điểm trên đường cong theo tham số
              commands.push({
                operationId: opId,
                commandKey: "point_on",
                args: withLabel({ target: rawArgs[0], t: parseFloat(rawArgs[1]) }, label),
              });
            }
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
          // Circle[A, B, C] = đường tròn ngoại tiếp tam giác
          if (rawArgs.length >= 3) {
            commands.push({
              operationId: opId,
              commandKey: "circumcircle",
              args: withLabel({ p1: rawArgs[0], p2: rawArgs[1], p3: rawArgs[2] }, label),
            });
            continue;
          }
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
            const args: Record<string, string | number> = { o1: rawArgs[0], o2: rawArgs[1] };
            if (rawArgs.length >= 3) {
              const idx = parseInt(rawArgs[2], 10);
              if (!isNaN(idx)) args.index = idx;
            }
            commands.push({
              operationId: opId,
              commandKey: "intersection",
              args: withLabel(args, label),
            });
            continue;
          }
          break;
        }

        case "orthogonalprojection":
        case "orthogonal_projection": {
          if (rawArgs.length >= 2) {
            commands.push({
              operationId: opId,
              commandKey: "orthogonal_projection",
              args: withLabel({ point: rawArgs[0], line: rawArgs[1] }, label),
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

        case "angle": {
          if (rawArgs.length >= 3) {
            commands.push({
              operationId: opId,
              commandKey: "angle",
              args: withLabel({ side1: rawArgs[0], vertex: rawArgs[1], side2: rawArgs[2] }, label),
            });
            continue;
          } else if (rawArgs.length === 2) {
            commands.push({
              operationId: opId,
              commandKey: "angle",
              args: withLabel({ side1: rawArgs[0], side2: rawArgs[1] }, label),
            });
            continue;
          }
          break;
        }

        case "tangent": {
          if (rawArgs.length >= 2) {
            commands.push({
              operationId: opId,
              commandKey: "tangent",
              args: withLabel({ point: rawArgs[0], target: rawArgs[1] }, label),
            });
            continue;
          }
          break;
        }

        case "vector": {
          if (rawArgs.length >= 2) {
            commands.push({
              operationId: opId,
              commandKey: "vector",
              args: withLabel({ p1: rawArgs[0], p2: rawArgs[1] }, label),
            });
            continue;
          } else if (rawArgs.length === 1) {
            commands.push({
              operationId: opId,
              commandKey: "vector",
              args: withLabel({ p1: rawArgs[0] }, label),
            });
            continue;
          }
          break;
        }

        case "arc":
        case "circulararc": {
          if (rawArgs.length >= 3) {
            commands.push({
              operationId: opId,
              commandKey: "arc",
              args: withLabel({ center: rawArgs[0], p1: rawArgs[1], p2: rawArgs[2] }, label),
            });
            continue;
          }
          break;
        }

        case "sector":
        case "circularsector": {
          if (rawArgs.length >= 3) {
            commands.push({
              operationId: opId,
              commandKey: "sector",
              args: withLabel({ center: rawArgs[0], p1: rawArgs[1], p2: rawArgs[2] }, label),
            });
            continue;
          }
          break;
        }

        case "ellipse": {
          if (rawArgs.length >= 3) {
            commands.push({
              operationId: opId,
              commandKey: "ellipse",
              args: withLabel({ f1: rawArgs[0], f2: rawArgs[1], point: rawArgs[2] }, label),
            });
            continue;
          }
          break;
        }

        case "centroid": {
          if (rawArgs.length >= 1) {
            commands.push({
              operationId: opId,
              commandKey: "centroid",
              args: withLabel({ polygon: rawArgs[0] }, label),
            });
            continue;
          }
          break;
        }

        case "circumcenter": {
          if (rawArgs.length >= 3) {
            commands.push({
              operationId: opId,
              commandKey: "circumcenter",
              args: withLabel({ p1: rawArgs[0], p2: rawArgs[1], p3: rawArgs[2] }, label),
            });
            continue;
          }
          break;
        }

        case "incenter": {
          if (rawArgs.length >= 3) {
            commands.push({
              operationId: opId,
              commandKey: "incenter",
              args: withLabel({ p1: rawArgs[0], p2: rawArgs[1], p3: rawArgs[2] }, label),
            });
            continue;
          }
          break;
        }

        case "orthocenter": {
          if (rawArgs.length >= 3) {
            commands.push({
              operationId: opId,
              commandKey: "orthocenter",
              args: withLabel({ p1: rawArgs[0], p2: rawArgs[1], p3: rawArgs[2] }, label),
            });
            continue;
          }
          break;
        }

        case "circumcircle": {
          if (rawArgs.length >= 3) {
            commands.push({
              operationId: opId,
              commandKey: "circumcircle",
              args: withLabel({ p1: rawArgs[0], p2: rawArgs[1], p3: rawArgs[2] }, label),
            });
            continue;
          }
          break;
        }

        case "incircle": {
          if (rawArgs.length >= 3) {
            commands.push({
              operationId: opId,
              commandKey: "incircle",
              args: withLabel({ p1: rawArgs[0], p2: rawArgs[1], p3: rawArgs[2] }, label),
            });
            continue;
          }
          break;
        }

        case "text": {
          if (rawArgs.length >= 2) {
            commands.push({
              operationId: opId,
              commandKey: "text",
              args: withLabel({ text: rawArgs[0].replace(/^["']|["']$/g, ""), point: rawArgs[1] }, label),
            });
            continue;
          } else if (rawArgs.length === 1) {
            commands.push({
              operationId: opId,
              commandKey: "text",
              args: withLabel({ text: rawArgs[0].replace(/^["']|["']$/g, "") }, label),
            });
            continue;
          }
          break;
        }

        case "distance": {
          if (rawArgs.length >= 2) {
            commands.push({
              operationId: opId,
              commandKey: "distance",
              args: withLabel({ p1: rawArgs[0], p2: rawArgs[1] }, label),
            });
            continue;
          }
          break;
        }

        case "area": {
          if (rawArgs.length >= 1) {
            commands.push({
              operationId: opId,
              commandKey: "area",
              args: withLabel({ target: rawArgs[0] }, label),
            });
            continue;
          }
          break;
        }

        case "rotate": {
          if (rawArgs.length >= 3) {
            commands.push({
              operationId: opId,
              commandKey: "rotate",
              args: withLabel({ object: rawArgs[0], angle: rawArgs[1], center: rawArgs[2] }, label),
            });
            continue;
          }
          break;
        }

        case "translate": {
          if (rawArgs.length >= 2) {
            commands.push({
              operationId: opId,
              commandKey: "translate",
              args: withLabel({ object: rawArgs[0], vector: rawArgs[1] }, label),
            });
            continue;
          }
          break;
        }

        case "reflect": {
          if (rawArgs.length >= 2) {
            commands.push({
              operationId: opId,
              commandKey: "reflect",
              args: withLabel({ object: rawArgs[0], mirror: rawArgs[1] }, label),
            });
            continue;
          }
          break;
        }

        case "dilate": {
          if (rawArgs.length >= 3) {
            commands.push({
              operationId: opId,
              commandKey: "dilate",
              args: withLabel({ object: rawArgs[0], factor: parseFloat(rawArgs[1]), center: rawArgs[2] }, label),
            });
            continue;
          }
          break;
        }

        // ── 3D Commands ──
        case "sphere": {
          if (rawArgs.length >= 2) {
            const radius = parseFloat(rawArgs[1]);
            if (!isNaN(radius) && radius > 0) {
              commands.push({
                operationId: opId,
                commandKey: "sphere",
                args: withLabel({ center: rawArgs[0], radius }, label),
              });
            } else {
              commands.push({
                operationId: opId,
                commandKey: "sphere",
                args: withLabel({ center: rawArgs[0], through: rawArgs[1] }, label),
              });
            }
            continue;
          }
          break;
        }

        case "cube": {
          if (rawArgs.length >= 2) {
            commands.push({
              operationId: opId,
              commandKey: "cube",
              args: withLabel({ p1: rawArgs[0], p2: rawArgs[1] }, label),
            });
            continue;
          }
          break;
        }

        case "pyramid": {
          if (rawArgs.length >= 2) {
            commands.push({
              operationId: opId,
              commandKey: "pyramid",
              args: withLabel({ bottom: rawArgs[0], top: rawArgs[1] }, label),
            });
            continue;
          }
          break;
        }

        case "prism": {
          if (rawArgs.length >= 2) {
            commands.push({
              operationId: opId,
              commandKey: "prism",
              args: withLabel({ bottom: rawArgs[0], top: rawArgs[1] }, label),
            });
            continue;
          }
          break;
        }

        case "cylinder": {
          if (rawArgs.length >= 3) {
            const radius = parseFloat(rawArgs[2]);
            commands.push({
              operationId: opId,
              commandKey: "cylinder",
              args: withLabel({ p1: rawArgs[0], p2: rawArgs[1], radius }, label),
            });
            continue;
          }
          break;
        }

        case "cone": {
          if (rawArgs.length >= 3) {
            const radius = parseFloat(rawArgs[2]);
            commands.push({
              operationId: opId,
              commandKey: "cone",
              args: withLabel({ p1: rawArgs[0], p2: rawArgs[1], radius }, label),
            });
            continue;
          }
          break;
        }

        case "plane": {
          if (rawArgs.length >= 3) {
            commands.push({
              operationId: opId,
              commandKey: "plane",
              args: withLabel({ p1: rawArgs[0], p2: rawArgs[1], p3: rawArgs[2] }, label),
            });
            continue;
          }
          break;
        }

        // ── Lệnh bổ sung ──
        case "regularpolygon": {
          if (rawArgs.length >= 3) {
            commands.push({
              operationId: opId,
              commandKey: "regular_polygon",
              args: withLabel({ p1: rawArgs[0], p2: rawArgs[1], n: parseInt(rawArgs[2], 10) }, label),
            });
            continue;
          }
          break;
        }

        case "perpendicularvector": {
          if (rawArgs.length >= 1) {
            commands.push({
              operationId: opId,
              commandKey: "perpendicular_vector",
              args: withLabel({ v: rawArgs[0] }, label),
            });
            continue;
          }
          break;
        }

        case "unitvector": {
          if (rawArgs.length >= 1) {
            commands.push({
              operationId: opId,
              commandKey: "unit_vector",
              args: withLabel({ v: rawArgs[0] }, label),
            });
            continue;
          }
          break;
        }

        case "unitperpendicularvector": {
          if (rawArgs.length >= 1) {
            commands.push({
              operationId: opId,
              commandKey: "unit_perpendicular_vector",
              args: withLabel({ v: rawArgs[0] }, label),
            });
            continue;
          }
          break;
        }

        case "polarline": {
          if (rawArgs.length >= 2) {
            commands.push({
              operationId: opId,
              commandKey: "polar_line",
              args: withLabel({ point: rawArgs[0], conic: rawArgs[1] }, label),
            });
            continue;
          }
          break;
        }

        case "parabola": {
          if (rawArgs.length >= 2) {
            commands.push({
              operationId: opId,
              commandKey: "parabola",
              args: withLabel({ focus: rawArgs[0], directrix: rawArgs[1] }, label),
            });
            continue;
          }
          break;
        }

        case "hyperbola": {
          if (rawArgs.length >= 3) {
            commands.push({
              operationId: opId,
              commandKey: "hyperbola",
              args: withLabel({ f1: rawArgs[0], f2: rawArgs[1], a: parseFloat(rawArgs[2]) }, label),
            });
            continue;
          }
          break;
        }

        case "derivative": {
          if (rawArgs.length >= 1) {
            const args: Record<string, string | number> = { f: rawArgs[0] };
            if (rawArgs.length >= 3) {
              args.var = rawArgs[1];
              args.val = parseFloat(rawArgs[2]);
            }
            commands.push({
              operationId: opId,
              commandKey: "derivative",
              args: withLabel(args, label),
            });
            continue;
          }
          break;
        }

        case "integral": {
          if (rawArgs.length >= 3) {
            commands.push({
              operationId: opId,
              commandKey: "integral",
              args: withLabel({ f: rawArgs[0], a: parseFloat(rawArgs[1]), b: parseFloat(rawArgs[2]) }, label),
            });
            continue;
          }
          break;
        }

        case "integralbetween": {
          if (rawArgs.length >= 4) {
            commands.push({
              operationId: opId,
              commandKey: "integral_between",
              args: withLabel({ f: rawArgs[0], a: parseFloat(rawArgs[1]), b: parseFloat(rawArgs[2]), x: rawArgs[3] }, label),
            });
            continue;
          }
          break;
        }

        case "extremum": {
          if (rawArgs.length >= 3) {
            commands.push({
              operationId: opId,
              commandKey: "extremum",
              args: withLabel({ f: rawArgs[0], a: parseFloat(rawArgs[1]), b: parseFloat(rawArgs[2]) }, label),
            });
            continue;
          }
          break;
        }

        case "inflection": {
          if (rawArgs.length >= 1) {
            commands.push({
              operationId: opId,
              commandKey: "inflection",
              args: withLabel({ f: rawArgs[0] }, label),
            });
            continue;
          }
          break;
        }

        case "root": {
          if (rawArgs.length >= 1) {
            const args: Record<string, string | number> = { f: rawArgs[0] };
            if (rawArgs.length >= 3) {
              args.a = parseFloat(rawArgs[1]);
              args.b = parseFloat(rawArgs[2]);
            }
            commands.push({
              operationId: opId,
              commandKey: "root",
              args: withLabel(args, label),
            });
            continue;
          }
          break;
        }

        case "sequence": {
          if (rawArgs.length >= 4) {
            commands.push({
              operationId: opId,
              commandKey: "sequence",
              args: withLabel({
                expr: rawArgs[0],
                var: rawArgs[1],
                start: parseFloat(rawArgs[2]),
                end: parseFloat(rawArgs[3]),
              }, label),
            });
            continue;
          }
          break;
        }

        // ── Lệnh định dạng & hiển thị ──
        case "setcolor": {
          if (rawArgs.length >= 4) {
            commands.push({
              operationId: opId,
              commandKey: "set_color",
              args: {
                obj: rawArgs[0],
                r: parseFloat(rawArgs[1]),
                g: parseFloat(rawArgs[2]),
                b: parseFloat(rawArgs[3]),
              },
            });
            continue;
          }
          break;
        }

        case "setlinethickness": {
          if (rawArgs.length >= 2) {
            commands.push({
              operationId: opId,
              commandKey: "set_line_thickness",
              args: { obj: rawArgs[0], thickness: parseFloat(rawArgs[1]) },
            });
            continue;
          }
          break;
        }

        case "showlabel": {
          if (rawArgs.length >= 2) {
            commands.push({
              operationId: opId,
              commandKey: "show_label",
              args: { obj: rawArgs[0], visible: rawArgs[1].toLowerCase() === "true" },
            });
            continue;
          }
          break;
        }

        case "zoomin": {
          commands.push({ operationId: opId, commandKey: "zoom_in", args: {} });
          continue;
        }

        case "zoomout": {
          commands.push({ operationId: opId, commandKey: "zoom_out", args: {} });
          continue;
        }

        case "setstandardview":
        case "standardview": {
          commands.push({ operationId: opId, commandKey: "standard_view", args: {} });
          continue;
        }

        // ── Lệnh chuyên sâu ──
        case "closestpoint": {
          if (rawArgs.length >= 2) {
            commands.push({
              operationId: opId,
              commandKey: "closest_point",
              args: withLabel({ point: rawArgs[0], target: rawArgs[1] }, label),
            });
            continue;
          }
          break;
        }

        case "locus": {
          if (rawArgs.length >= 2) {
            commands.push({
              operationId: opId,
              commandKey: "locus",
              args: withLabel({ dep: rawArgs[0], driver: rawArgs[1] }, label),
            });
            continue;
          }
          break;
        }

        case "net": {
          if (rawArgs.length >= 1) {
            commands.push({
              operationId: opId,
              commandKey: "net",
              args: withLabel({ obj: rawArgs[0] }, label),
            });
            continue;
          }
          break;
        }

        case "perimeter": {
          if (rawArgs.length >= 1) {
            commands.push({
              operationId: opId,
              commandKey: "perimeter",
              args: withLabel({ target: rawArgs[0] }, label),
            });
            continue;
          }
          break;
        }

        case "slope": {
          if (rawArgs.length >= 1) {
            commands.push({
              operationId: opId,
              commandKey: "slope",
              args: withLabel({ target: rawArgs[0] }, label),
            });
            continue;
          }
          break;
        }

        case "radius": {
          if (rawArgs.length >= 1) {
            commands.push({
              operationId: opId,
              commandKey: "radius",
              args: withLabel({ target: rawArgs[0] }, label),
            });
            continue;
          }
          break;
        }

        case "semicircle": {
          if (rawArgs.length >= 2) {
            commands.push({
              operationId: opId,
              commandKey: "semicircle",
              args: withLabel({ p1: rawArgs[0], p2: rawArgs[1] }, label),
            });
            continue;
          }
          break;
        }

        case "areabetween": {
          if (rawArgs.length >= 4) {
            commands.push({
              operationId: opId,
              commandKey: "area_between",
              args: withLabel({
                f: rawArgs[0],
                g: rawArgs[1],
                a: parseFloat(rawArgs[2]),
                b: parseFloat(rawArgs[3]),
              }, label),
            });
            continue;
          }
          break;
        }

        case "sum": {
          if (rawArgs.length >= 4) {
            commands.push({
              operationId: opId,
              commandKey: "sum",
              args: withLabel({
                expr: rawArgs[0],
                var: rawArgs[1],
                start: parseFloat(rawArgs[2]),
                end: parseFloat(rawArgs[3]),
              }, label),
            });
            continue;
          }
          break;
        }

        case "product": {
          if (rawArgs.length >= 4) {
            commands.push({
              operationId: opId,
              commandKey: "product",
              args: withLabel({
                expr: rawArgs[0],
                var: rawArgs[1],
                start: parseFloat(rawArgs[2]),
                end: parseFloat(rawArgs[3]),
              }, label),
            });
            continue;
          }
          break;
        }

        case "setvisible": {
          if (rawArgs.length >= 2) {
            commands.push({
              operationId: opId,
              commandKey: "set_visible",
              args: { obj: rawArgs[0], visible: rawArgs[1].toLowerCase() === "true" },
            });
            continue;
          }
          break;
        }

        case "setpointsize": {
          if (rawArgs.length >= 2) {
            commands.push({
              operationId: opId,
              commandKey: "set_point_size",
              args: { obj: rawArgs[0], size: parseFloat(rawArgs[1]) },
            });
            continue;
          }
          break;
        }

        case "setlinestyle": {
          if (rawArgs.length >= 2) {
            commands.push({
              operationId: opId,
              commandKey: "set_line_style",
              args: { obj: rawArgs[0], style: parseFloat(rawArgs[1]) },
            });
            continue;
          }
          break;
        }

        case "setaxesvisible": {
          commands.push({
            operationId: opId,
            commandKey: "set_axes_visible",
            args: { visible: rawArgs[0]?.toLowerCase() !== "false" },
          });
          continue;
        }

        case "setgridvisible": {
          commands.push({
            operationId: opId,
            commandKey: "set_grid_visible",
            args: { visible: rawArgs[0]?.toLowerCase() !== "false" },
          });
          continue;
        }
      }
    }

    return {
      ok: false,
      error: `Không thể nhận diện dòng ${idx + 1}: "${line}". Hỗ trợ đầy đủ: Point (tọa độ/Point(target,t)), Segment, Polygon, RegularPolygon, Semicircle, Circle (2/3 điểm), Sphere, Cube, Pyramid, Prism, Cylinder, Cone, Plane, Net, Line, Ray, Midpoint, Intersect (có index), ClosestPoint, OrthogonalProjection, PerpendicularLine, ParallelLine, Angle, AngleBisector, PerpendicularBisector, Tangent, PolarLine, Locus, Vector, PerpendicularVector, UnitVector, UnitPerpendicularVector, Arc, Sector, Ellipse, Parabola, Hyperbola, Centroid, Circumcenter, Incenter, Orthocenter, Circumcircle, Incircle, Perimeter, Slope, Radius, Area, AreaBetween, Rotate, Translate, Reflect, Dilate, Function f(x)=..., Derivative, Integral, IntegralBetween, Extremum, Inflection, Root, Sum, Product, Sequence, SetColor, SetLineThickness, SetLineStyle, SetPointSize, SetVisible, ShowLabel, SetAxesVisible, SetGridVisible, ZoomIn, ZoomOut, SetStandardView.`,
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
