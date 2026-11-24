import type { SafeGeoGebraCommand } from "./types";

/**
 * Registry các commandKey được phép. Mỗi template nhận args đã validate
 * và sinh chuỗi input GeoGebra canonical (tiếng Anh).
 *
 * Đây là allowlist deterministic — AI/user KHÔNG BAO GIỜ truyền raw string.
 * Mở rộng registry ở M4 (Geometry Compiler) cùng IR object kinds.
 */

type CommandArgs = SafeGeoGebraCommand["args"];
type Template = (args: CommandArgs) => string;

function str(args: CommandArgs, key: string): string {
  const v = args[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`Missing or invalid arg: ${key}`);
  }
  return v;
}

function num(args: CommandArgs, key: string): number {
  const v = args[key];
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid number arg: ${key}`);
  }
  return n;
}

function pointRef(args: CommandArgs, key: string): string {
  // Chấp nhận tên điểm (A) hoặc tọa độ "x,y" hoặc "x,y,z"
  const v = str(args, key);
  if (/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?(\s*,\s*-?\d+(\.\d+)?)?$/.test(v)) {
    const coords = v.split(",").map((s) => s.trim());
    return `(${coords.join(", ")})`;
  }
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(v)) {
    throw new Error(`Invalid point reference: ${key}`);
  }
  return v;
}

function labelPrefix(args: CommandArgs): string {
  const l = args.label;
  if (typeof l === "string" && /^[A-Za-z][A-Za-z0-9_]*$/.test(l)) {
    return `${l} = `;
  }
  return "";
}

const registry: Record<string, Template> = {
  /** Điểm cố định 2D hoặc 3D có nhãn: A = (1, 2) hoặc A = (1, 2, 3) */
  point: (args) => {
    const label = str(args, "label");
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(label)) {
      throw new Error(`Invalid point label: ${label}`);
    }
    const x = num(args, "x");
    const y = num(args, "y");
    if (args.z !== undefined) {
      const z = num(args, "z");
      return `${label} = (${x}, ${y}, ${z})`;
    }
    return `${label} = (${x}, ${y})`;
  },

  /** Đoạn thẳng giữa hai điểm/tham chiếu */
  segment: (args) =>
    `${labelPrefix(args)}Segment(${pointRef(args, "p1")}, ${pointRef(args, "p2")})`,

  /** Đa giác qua danh sách đỉnh, vd "A,B,C" */
  polygon: (args) => {
    const vertices = str(args, "vertices")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (vertices.length < 3) throw new Error("Polygon needs >= 3 vertices");
    for (const v of vertices) {
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(v)) {
        throw new Error(`Invalid vertex name: ${v}`);
      }
    }
    return `${labelPrefix(args)}Polygon(${vertices.join(", ")})`;
  },

  /** Đường tròn tâm – điểm trên đường tròn, tâm – bán kính, hoặc 3 điểm */
  circle: (args) => {
    if (typeof args.points === "string") {
      const pts = args.points.split(",").map((s) => s.trim()).filter(Boolean);
      if (pts.length === 3) {
        for (const p of pts) {
          if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(p)) {
            throw new Error(`Invalid circle point: ${p}`);
          }
        }
        return `${labelPrefix(args)}Circle(${pts.join(", ")})`;
      }
      throw new Error("circle points must be exactly 3 names");
    }
    const center = pointRef(args, "center");
    if (typeof args.radius === "number" || typeof args.radius === "string") {
      const r = num(args, "radius");
      if (r <= 0) throw new Error("Circle radius must be > 0");
      return `${labelPrefix(args)}Circle(${center}, ${r})`;
    }
    return `${labelPrefix(args)}Circle(${center}, ${pointRef(args, "through")})`;
  },

  /** Đường thẳng vô hạn qua hai điểm */
  line: (args) =>
    `${labelPrefix(args)}Line(${pointRef(args, "p1")}, ${pointRef(args, "p2")})`,

  /** Tia qua hai điểm */
  ray: (args) =>
    `${labelPrefix(args)}Ray(${pointRef(args, "p1")}, ${pointRef(args, "p2")})`,

  /** Trung điểm */
  midpoint: (args) =>
    `${labelPrefix(args)}Midpoint(${pointRef(args, "p1")}, ${pointRef(args, "p2")})`,

  /** Đường vuông góc qua điểm với đường/đoạn tham chiếu */
  perpendicular_line: (args) =>
    `${labelPrefix(args)}PerpendicularLine(${pointRef(args, "point")}, ${pointRef(args, "line")})`,

  /** Đường song song qua điểm với đường/đoạn tham chiếu */
  parallel_line: (args) =>
    `${labelPrefix(args)}ParallelLine(${pointRef(args, "point")}, ${pointRef(args, "line")})`,

  /** Giao điểm của hai đối tượng */
  intersection: (args) =>
    `${labelPrefix(args)}Intersect(${pointRef(args, "o1")}, ${pointRef(args, "o2")})`,

  /** Phân giác góc tại đỉnh giữa hai đường tham chiếu */
  angle_bisector: (args) =>
    `${labelPrefix(args)}AngleBisector(${pointRef(args, "vertex")}, ${pointRef(args, "l1")}, ${pointRef(args, "l2")})`,

  /** Trung trực của đoạn giữa hai điểm */
  perpendicular_bisector: (args) =>
    `${labelPrefix(args)}PerpendicularBisector(${pointRef(args, "p1")}, ${pointRef(args, "p2")})`,

  /** ── CÁC LỆNH HÌNH HỌC KHÔNG GIAN 3D ── */

  /** Mặt cầu: Sphere(center, radius) hoặc Sphere(center, through) */
  sphere: (args) => {
    const center = pointRef(args, "center");
    if (args.radius !== undefined) {
      const r = num(args, "radius");
      if (r <= 0) throw new Error("Sphere radius must be > 0");
      return `${labelPrefix(args)}Sphere(${center}, ${r})`;
    }
    return `${labelPrefix(args)}Sphere(${center}, ${pointRef(args, "through")})`;
  },

  /** Hình lập phương: Cube(p1, p2) */
  cube: (args) =>
    `${labelPrefix(args)}Cube(${pointRef(args, "p1")}, ${pointRef(args, "p2")})`,

  /** Hình chóp: Pyramid(bottomPolygon, topPoint) */
  pyramid: (args) =>
    `${labelPrefix(args)}Pyramid(${str(args, "bottom")}, ${pointRef(args, "top")})`,

  /** Hình lăng trụ: Prism(bottomPolygon, topPoint hoặc height) */
  prism: (args) =>
    `${labelPrefix(args)}Prism(${str(args, "bottom")}, ${str(args, "top")})`,

  /** Hình trụ: Cylinder(bottomCenter, topCenter, radius) */
  cylinder: (args) =>
    `${labelPrefix(args)}Cylinder(${pointRef(args, "p1")}, ${pointRef(args, "p2")}, ${num(args, "radius")})`,

  /** Hình nón: Cone(bottomCenter, topCenter, radius) */
  cone: (args) =>
    `${labelPrefix(args)}Cone(${pointRef(args, "p1")}, ${pointRef(args, "p2")}, ${num(args, "radius")})`,

  /** Mặt phẳng: Plane(p1, p2, p3) */
  plane: (args) =>
    `${labelPrefix(args)}Plane(${pointRef(args, "p1")}, ${pointRef(args, "p2")}, ${pointRef(args, "p3")})`,
};

export function isAllowedCommandKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(registry, key);
}

export function compileCommand(command: SafeGeoGebraCommand): string {
  const template = registry[command.commandKey];
  if (!template) {
    throw new Error(`Command not in allowlist: ${command.commandKey}`);
  }
  return template(command.args);
}

export function listCommandKeys(): string[] {
  return Object.keys(registry);
}
