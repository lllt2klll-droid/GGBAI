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

  /** Giao điểm của hai đối tượng, tùy chọn index cho giao điểm thứ n */
  intersection: (args) => {
    const base = `${labelPrefix(args)}Intersect(${pointRef(args, "o1")}, ${pointRef(args, "o2")}`;
    if (args.index !== undefined) {
      return `${base}, ${num(args, "index")})`;
    }
    return `${base})`;
  },

  /** Hình chiếu vuông góc: OrthogonalProjection(point, line) */
  orthogonal_projection: (args) =>
    `${labelPrefix(args)}OrthogonalProjection(${pointRef(args, "point")}, ${pointRef(args, "line")})`,

  /** Phân giác góc tại đỉnh giữa hai đường tham chiếu */
  angle_bisector: (args) =>
    `${labelPrefix(args)}AngleBisector(${pointRef(args, "vertex")}, ${pointRef(args, "l1")}, ${pointRef(args, "l2")})`,

  /** Trung trực của đoạn giữa hai điểm */
  perpendicular_bisector: (args) =>
    `${labelPrefix(args)}PerpendicularBisector(${pointRef(args, "p1")}, ${pointRef(args, "p2")})`,

  /** Góc: Angle(p1, vertex, p2) hoặc Angle(side1, side2) */
  angle: (args) => {
    if (args.side1 && args.side2) {
      if (args.vertex) {
        return `${labelPrefix(args)}Angle(${pointRef(args, "side1")}, ${pointRef(args, "vertex")}, ${pointRef(args, "side2")})`;
      }
      return `${labelPrefix(args)}Angle(${pointRef(args, "side1")}, ${pointRef(args, "side2")})`;
    }
    if (args.p1 && args.p2 && args.p3) {
      return `${labelPrefix(args)}Angle(${pointRef(args, "p1")}, ${pointRef(args, "p2")}, ${pointRef(args, "p3")})`;
    }
    throw new Error("Invalid args for angle");
  },

  /** Tiếp tuyến: Tangent(point, target) */
  tangent: (args) =>
    `${labelPrefix(args)}Tangent(${pointRef(args, "point")}, ${pointRef(args, "target")})`,

  /** Vector: Vector(p1, p2) hoặc Vector(p1) */
  vector: (args) => {
    if (args.p2) {
      return `${labelPrefix(args)}Vector(${pointRef(args, "p1")}, ${pointRef(args, "p2")})`;
    }
    return `${labelPrefix(args)}Vector(${pointRef(args, "p1")})`;
  },

  /** Cung tròn: CircularArc(center, p1, p2) */
  arc: (args) =>
    `${labelPrefix(args)}CircularArc(${pointRef(args, "center")}, ${pointRef(args, "p1")}, ${pointRef(args, "p2")})`,

  /** Hình quạt tròn: CircularSector(center, p1, p2) */
  sector: (args) =>
    `${labelPrefix(args)}CircularSector(${pointRef(args, "center")}, ${pointRef(args, "p1")}, ${pointRef(args, "p2")})`,

  /** Elip: Ellipse(f1, f2, point) */
  ellipse: (args) =>
    `${labelPrefix(args)}Ellipse(${pointRef(args, "f1")}, ${pointRef(args, "f2")}, ${pointRef(args, "point")})`,

  /** Trọng tâm: Centroid(polygon) */
  centroid: (args) =>
    `${labelPrefix(args)}Centroid(${str(args, "polygon")})`,

  /** Tâm đường tròn ngoại tiếp: Circumcenter(p1, p2, p3) */
  circumcenter: (args) =>
    `${labelPrefix(args)}Circumcenter(${pointRef(args, "p1")}, ${pointRef(args, "p2")}, ${pointRef(args, "p3")})`,

  /** Tâm đường tròn nội tiếp: Incenter(p1, p2, p3) */
  incenter: (args) =>
    `${labelPrefix(args)}Incenter(${pointRef(args, "p1")}, ${pointRef(args, "p2")}, ${pointRef(args, "p3")})`,

  /** Trực tâm tam giác: Orthocenter(p1, p2, p3) */
  orthocenter: (args) =>
    `${labelPrefix(args)}Orthocenter(${pointRef(args, "p1")}, ${pointRef(args, "p2")}, ${pointRef(args, "p3")})`,

  /** Đường tròn ngoại tiếp: Circle(p1, p2, p3) */
  circumcircle: (args) =>
    `${labelPrefix(args)}Circle(${pointRef(args, "p1")}, ${pointRef(args, "p2")}, ${pointRef(args, "p3")})`,

  /** Đường tròn nội tiếp: Incircle(p1, p2, p3) */
  incircle: (args) =>
    `${labelPrefix(args)}Incircle(${pointRef(args, "p1")}, ${pointRef(args, "p2")}, ${pointRef(args, "p3")})`,

  /** Nhãn văn bản: Text("text", point) */
  text: (args) => {
    const content = JSON.stringify(str(args, "text"));
    if (args.point) {
      return `${labelPrefix(args)}Text(${content}, ${pointRef(args, "point")})`;
    }
    return `${labelPrefix(args)}Text(${content})`;
  },

  /** Khoảng cách: Distance(p1, p2) */
  distance: (args) =>
    `${labelPrefix(args)}Distance(${pointRef(args, "p1")}, ${pointRef(args, "p2")})`,

  /** Diện tích: Area(target) */
  area: (args) =>
    `${labelPrefix(args)}Area(${str(args, "target")})`,

  /** Phép quay: Rotate(obj, angle, center) */
  rotate: (args) =>
    `${labelPrefix(args)}Rotate(${str(args, "object")}, ${str(args, "angle")}, ${pointRef(args, "center")})`,

  /** Phép tịnh tiến: Translate(obj, vector) */
  translate: (args) =>
    `${labelPrefix(args)}Translate(${str(args, "object")}, ${pointRef(args, "vector")})`,

  /** Phép đối xứng: Reflect(obj, line/point) */
  reflect: (args) =>
    `${labelPrefix(args)}Reflect(${str(args, "object")}, ${pointRef(args, "mirror")})`,

  /** Phép vị tự: Dilate(obj, factor, center) */
  dilate: (args) =>
    `${labelPrefix(args)}Dilate(${str(args, "object")}, ${num(args, "factor")}, ${pointRef(args, "center")})`,

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

  /** Đa giác đều: RegularPolygon(p1, p2, n) */
  regular_polygon: (args) =>
    `${labelPrefix(args)}RegularPolygon(${pointRef(args, "p1")}, ${pointRef(args, "p2")}, ${num(args, "n")})`,

  /** Vector vuông góc: PerpendicularVector(v) */
  perpendicular_vector: (args) =>
    `${labelPrefix(args)}PerpendicularVector(${str(args, "v")})`,

  /** Vector đơn vị: UnitVector(v) */
  unit_vector: (args) =>
    `${labelPrefix(args)}UnitVector(${str(args, "v")})`,

  /** Vector vuông góc đơn vị: UnitPerpendicularVector(v) */
  unit_perpendicular_vector: (args) =>
    `${labelPrefix(args)}UnitPerpendicularVector(${str(args, "v")})`,

  /** Đường cực: PolarLine(point, conic) */
  polar_line: (args) =>
    `${labelPrefix(args)}PolarLine(${pointRef(args, "point")}, ${str(args, "conic")})`,

  /** Parabol: Parabola(focus, directrix) */
  parabola: (args) =>
    `${labelPrefix(args)}Parabola(${pointRef(args, "focus")}, ${pointRef(args, "directrix")})`,

  /** Hyperbol: Hyperbola(f1, f2, a) */
  hyperbola: (args) =>
    `${labelPrefix(args)}Hyperbola(${pointRef(args, "f1")}, ${pointRef(args, "f2")}, ${num(args, "a")})`,

  /** Đạo hàm: Derivative(f) hoặc Derivative(f, var, val) */
  derivative: (args) => {
    const f = str(args, "f");
    if (args.var && args.val !== undefined) {
      return `${labelPrefix(args)}Derivative(${f}, ${str(args, "var")}, ${num(args, "val")})`;
    }
    return `${labelPrefix(args)}Derivative(${f})`;
  },

  /** Tích phân xác định: Integral(f, a, b) */
  integral: (args) =>
    `${labelPrefix(args)}Integral(${str(args, "f")}, ${num(args, "a")}, ${num(args, "b")})`,

  /** Tích phân giữa hai đường: IntegralBetween(f, a, b, x) */
  integral_between: (args) =>
    `${labelPrefix(args)}IntegralBetween(${str(args, "f")}, ${num(args, "a")}, ${num(args, "b")}, ${str(args, "x")})`,

  /** Cực trị: Extremum(f, a, b) */
  extremum: (args) =>
    `${labelPrefix(args)}Extremum(${str(args, "f")}, ${num(args, "a")}, ${num(args, "b")})`,

  /** Điểm uốn: Inflection(f) */
  inflection: (args) =>
    `${labelPrefix(args)}Inflection(${str(args, "f")})`,

  /** Nghiệm: Root(f) hoặc Root(f, a, b) */
  root: (args) => {
    const f = str(args, "f");
    if (args.a !== undefined && args.b !== undefined) {
      return `${labelPrefix(args)}Root(${f}, ${num(args, "a")}, ${num(args, "b")})`;
    }
    return `${labelPrefix(args)}Root(${f})`;
  },

  /** Dãy số: Sequence(expr, var, start, end) */
  sequence: (args) =>
    `${labelPrefix(args)}Sequence(${str(args, "expr")}, ${str(args, "var")}, ${num(args, "start")}, ${num(args, "end")})`,

  /** Hàm số: f(x) = expr */
  function: (args) =>
    `${str(args, "name")}(${str(args, "var")}) = ${str(args, "expr")}`,

  /** Đổi màu: SetColor(obj, r, g, b) — r,g,b ∈ [0,1] */
  set_color: (args) =>
    `SetColor(${str(args, "obj")}, ${num(args, "r")}, ${num(args, "g")}, ${num(args, "b")})`,

  /** Độ dày nét: SetLineThickness(obj, n) */
  set_line_thickness: (args) =>
    `SetLineThickness(${str(args, "obj")}, ${num(args, "thickness")})`,

  /** Hiện/ẩn nhãn: ShowLabel(obj, true|false) */
  show_label: (args) =>
    `ShowLabel(${str(args, "obj")}, ${args.visible === false || args.visible === "false" ? "false" : "true"})`,

  /** Phóng to canvas */
  zoom_in: () => `ZoomIn()`,

  /** Thu nhỏ canvas */
  zoom_out: () => `ZoomOut()`,

  /** Về góc nhìn chuẩn */
  standard_view: () => `SetStandardView()`,

  // ── Lệnh chuyên sâu ──

  /** Điểm gần nhất: ClosestPoint(point, target) */
  closest_point: (args) =>
    `${labelPrefix(args)}ClosestPoint(${pointRef(args, "point")}, ${pointRef(args, "target")})`,

  /** Điểm trên đường cong theo tham số: Point(target, t) */
  point_on: (args) =>
    `${labelPrefix(args)}Point(${pointRef(args, "target")}, ${num(args, "t")})`,

  /** Quỹ tích: Locus(dep, driver) */
  locus: (args) =>
    `${labelPrefix(args)}Locus(${str(args, "dep")}, ${str(args, "driver")})`,

  /** Lưới khối đa diện 3D: Net(obj) */
  net: (args) =>
    `${labelPrefix(args)}Net(${str(args, "obj")})`,

  /** Chu vi: Perimeter(target) */
  perimeter: (args) =>
    `${labelPrefix(args)}Perimeter(${str(args, "target")})`,

  /** Hệ số góc: Slope(target) */
  slope: (args) =>
    `${labelPrefix(args)}Slope(${str(args, "target")})`,

  /** Bán kính: Radius(target) */
  radius: (args) =>
    `${labelPrefix(args)}Radius(${str(args, "target")})`,

  /** Nửa đường tròn: Semicircle(p1, p2) */
  semicircle: (args) =>
    `${labelPrefix(args)}Semicircle(${pointRef(args, "p1")}, ${pointRef(args, "p2")})`,

  /** Diện tích giữa hai hàm: Area(f, g, a, b) */
  area_between: (args) =>
    `${labelPrefix(args)}Area(${str(args, "f")}, ${str(args, "g")}, ${num(args, "a")}, ${num(args, "b")})`,

  /** Tổng dãy: Sum(expr, var, start, end) */
  sum: (args) =>
    `${labelPrefix(args)}Sum(${str(args, "expr")}, ${str(args, "var")}, ${num(args, "start")}, ${num(args, "end")})`,

  /** Tích dãy: Product(expr, var, start, end) */
  product: (args) =>
    `${labelPrefix(args)}Product(${str(args, "expr")}, ${str(args, "var")}, ${num(args, "start")}, ${num(args, "end")})`,

  /** Hiện/ẩn đối tượng: SetVisible(obj, true|false) */
  set_visible: (args) =>
    `SetVisible(${str(args, "obj")}, ${args.visible === false || args.visible === "false" ? "false" : "true"})`,

  /** Kích thước điểm: SetPointSize(obj, n) */
  set_point_size: (args) =>
    `SetPointSize(${str(args, "obj")}, ${num(args, "size")})`,

  /** Kiểu nét: SetLineStyle(obj, n) */
  set_line_style: (args) =>
    `SetLineStyle(${str(args, "obj")}, ${num(args, "style")})`,

  /** Hiện/ẩn trục: SetAxesVisible(true|false) */
  set_axes_visible: (args) =>
    `SetAxesVisible(${args.visible === false || args.visible === "false" ? "false" : "true"})`,

  /** Hiện/ẩn lưới: SetGridVisible(true|false) */
  set_grid_visible: (args) =>
    `SetGridVisible(${args.visible === false || args.visible === "false" ? "false" : "true"})`,
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
