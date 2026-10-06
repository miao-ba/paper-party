// 拼圖幾何：邊的形狀由種子決定，兩邊算出來一模一樣

export type ShapeId = 'classic' | 'knob' | 'wave' | 'square';
export const SHAPES: Record<ShapeId, { label: string; kind: 'jigsaw' | 'wave' | 'square'; tab: number; jitter: number }> = {
  classic: { label: '經典', kind: 'jigsaw', tab: 0.1, jitter: 0.04 },
  knob: { label: '大圓凸', kind: 'jigsaw', tab: 0.15, jitter: 0.02 },
  wave: { label: '波浪', kind: 'wave', tab: 0.05, jitter: 0.03 },
  square: { label: '方塊', kind: 'square', tab: 0, jitter: 0 },
};

export function seededRandom(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** 依想要的片數和圖片比例算格數（片盡量接近正方形） */
export function gridFor(count: number, w: number, h: number) {
  const cols = Math.max(2, Math.round(Math.sqrt((count * w) / h)));
  const rows = Math.max(2, Math.round(count / cols));
  return { cols, rows };
}

export interface Edge { sign: 1 | -1 | 0; r: number[] } // r: 5 個亂數 [-1,1]
export interface Edges { h: Edge[][]; v: Edge[][] } // h[row][col]: 第 row 條水平邊（row=0 是最上緣）；v[row][col]: 第 col 條垂直邊

export function buildEdges(cols: number, rows: number, seed: number): Edges {
  const rnd = seededRandom(seed);
  const mk = (boundary: boolean): Edge => ({
    sign: boundary ? 0 : rnd() < 0.5 ? 1 : -1,
    r: Array.from({ length: 5 }, () => rnd() * 2 - 1),
  });
  const h: Edge[][] = [], v: Edge[][] = [];
  for (let r = 0; r <= rows; r++) h.push(Array.from({ length: cols }, () => mk(r === 0 || r === rows)));
  for (let r = 0; r < rows; r++) v.push(Array.from({ length: cols + 1 }, (_, c) => mk(c === 0 || c === cols)));
  return { h, v };
}

type P = [number, number];
/** 邊的貝茲點列（單位空間：沿邊 0→1，凸出方向為 +v）：[p0, c1,c2,p1, c1,c2,p2, ...] */
function unitCurve(e: Edge, shape: ShapeId): P[] {
  const { kind, tab: t, jitter: j } = SHAPES[shape];
  if (e.sign === 0 || kind === 'square') return [[0, 0], [1, 0]];
  const [a, b, c, d, ee] = e.r.map((x) => x * j);
  const s = e.sign;
  if (kind === 'wave') return [[0, 0], [0.3 + a, 2 * t * s + b], [0.7 + c, -2 * t * s + d], [1, 0]];
  // Draradech 的經典拼圖邊
  return [
    [0, 0],
    [0.2, a * s],
    [0.5 + b + d, (-t + c) * s],
    [0.5 - t + b, (t + c) * s],
    [0.5 - 2 * t + b - d, (3 * t + c) * s],
    [0.5 + 2 * t + b - d, (3 * t + c) * s],
    [0.5 + t + b, (t + c) * s],
    [0.5 + b + d, (-t + c) * s],
    [0.8, ee * s],
    [1, 0],
  ];
}
function reversed(pts: P[]): P[] {
  if (pts.length === 2) return [pts[1], pts[0]];
  const out: P[] = [pts[pts.length - 1]];
  for (let i = pts.length - 1; i >= 3; i -= 3) out.push(pts[i - 1], pts[i - 2], pts[i - 3]);
  return out;
}
function appendCurve(path: Path2D, pts: P[], map: (p: P) => P) {
  if (pts.length === 2) { const q = map(pts[1]); path.lineTo(q[0], q[1]); return; }
  for (let i = 1; i < pts.length; i += 3) {
    const c1 = map(pts[i]), c2 = map(pts[i + 1]), p = map(pts[i + 2]);
    path.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], p[0], p[1]);
  }
}

/** 一片的外框（局部座標：原點 = 這片的基準左上角，pw×ph 是基準格） */
export function piecePath(edges: Edges, shape: ShapeId, c: number, r: number, pw: number, ph: number): Path2D {
  const path = new Path2D();
  path.moveTo(0, 0);
  appendCurve(path, unitCurve(edges.h[r][c], shape), ([u, v]) => [u * pw, -v * ph]); // 上：凸向 -y
  appendCurve(path, unitCurve(edges.v[r][c + 1], shape), ([u, v]) => [pw + v * pw, u * ph]); // 右：凸向 +x
  appendCurve(path, reversed(unitCurve(edges.h[r + 1][c], shape)), ([u, v]) => [u * pw, ph - v * ph]); // 下：凸向 +y
  appendCurve(path, reversed(unitCurve(edges.v[r][c], shape)), ([u, v]) => [v * pw, u * ph]); // 左：同一條邊在絕對座標上要跟右鄰的右邊重合
  path.closePath();
  return path;
}

/** 形狀預覽用：一片獨立的 SVG path 字串（單位 100） */
export function previewPathD(shape: ShapeId): string {
  const edges = buildEdges(3, 3, 7);
  const pts = (e: Edge) => unitCurve(e, shape);
  const seg = (p: P[], map: (p: P) => P) => {
    if (p.length === 2) { const q = map(p[1]); return `L${q[0]},${q[1]}`; }
    let d = '';
    for (let i = 1; i < p.length; i += 3) { const a = map(p[i]), b = map(p[i + 1]), c = map(p[i + 2]); d += `C${a[0]},${a[1]} ${b[0]},${b[1]} ${c[0]},${c[1]}`; }
    return d;
  };
  const S = 100;
  return `M0,0${seg(pts(edges.h[1][1]), ([u, v]) => [u * S, -v * S])}${seg(pts(edges.v[1][2]), ([u, v]) => [S + v * S, u * S])}${seg(reversed(pts(edges.h[2][1])), ([u, v]) => [u * S, S - v * S])}${seg(reversed(pts(edges.v[1][1])), ([u, v]) => [v * S, u * S])}Z`;
}
