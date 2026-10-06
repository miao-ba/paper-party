// 一起一筆畫：純邏輯，不碰 React / 網路。
// 畫布是 0..1 的正方形。一人控制 X、一人控制 Y，筆尖在兩條線的交點；時間到比像不像。
// 目標圖 = 一堆點（Target.pts），內建圖形從折線取樣，自訂圖片走邊緣偵測。

export type Pt = [number, number];
export type Axis = 'x' | 'y';

export interface Target {
  id: string;
  name: string;
  /** 0..1 座標的點，密度約 0.01 */
  pts: Pt[];
  /** 內建圖形保留折線，畫起來比較漂亮；自訂圖只有點 */
  lines?: Pt[][];
  custom?: boolean;
}

export const DURATIONS = [10, 15, 20, 30, 45, 60, 90] as const;
/** 按鍵 / 方向鍵移動速度：每秒走畫布的幾分之幾 */
export const SPEEDS = { slow: 0.28, mid: 0.45, fast: 0.7 } as const;
export type Speed = keyof typeof SPEEDS;
/** 判定「碰到線」的距離（0..1） */
export const TOLS = { loose: 0.05, normal: 0.035, strict: 0.022 } as const;
export type Tol = keyof typeof TOLS;

export interface Config {
  /** 秒 */
  dur: number;
  speed: Speed;
  tol: Tol;
  /** 每回合換手 */
  swap: boolean;
}
export const DEFAULT_CONFIG: Config = { dur: 30, speed: 'mid', tol: 'normal', swap: true };
/** 倒數 */
export const COUNT_MS = 2600;
/** 預設容忍距離（畫縮圖用） */
export const TOL = TOLS.normal;
/** 筆尖追手指的速度（每幀 lerp 係數），讓對方的軸不會抖 */
export const PEN_LERP = 0.35;
/** 軸值廣播間隔 */
export const AXIS_MS = 40;
/** 軌跡取樣間隔 */
export const TRAIL_MS = 33;

/** 第 n 回合 L 控制哪個軸（swap 開才每回合換手） */
export const axisFor = (side: 'L' | 'R', round: number, swap = true): Axis => (((swap ? round : 1) % 2 === 1) === (side === 'L') ? 'x' : 'y');

// ---- 內建圖形 ----
const circle = (cx: number, cy: number, r: number, n = 48): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * r]);
const poly = (...p: Pt[]): Pt[] => p;

const heart = (): Pt[] =>
  Array.from({ length: 81 }, (_, i) => {
    const t = (i / 80) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return [0.5 + x / 38, 0.5 - y / 38 + 0.02];
  });
const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 24): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
const regular = (cx: number, cy: number, r: number, n: number, rot = -Math.PI / 2): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos(rot + (i / n) * Math.PI * 2) * r, cy + Math.sin(rot + (i / n) * Math.PI * 2) * r]);
const spiral = (): Pt[] => Array.from({ length: 121 }, (_, i) => { const t = (i / 120) * Math.PI * 6; const r = 0.03 + (i / 120) * 0.4; return [0.5 + Math.cos(t) * r, 0.5 + Math.sin(t) * r]; });
const infinity = (): Pt[] => Array.from({ length: 97 }, (_, i) => { const t = (i / 96) * Math.PI * 2; const d = 1 + Math.sin(t) ** 2; return [0.5 + (0.42 * Math.cos(t)) / d, 0.5 + (0.42 * Math.sin(t) * Math.cos(t)) / d]; });
const star = (): Pt[] => {
  const p: Pt[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const r = i % 2 === 0 ? 0.42 : 0.17;
    p.push([0.5 + Math.cos(a) * r, 0.53 + Math.sin(a) * r]);
  }
  return p;
};

export const SHAPES: Target[] = [
  // 簡單
  { id: 'circle', name: '圓', pts: [], lines: [circle(0.5, 0.5, 0.38)] },
  { id: 'square', name: '方塊', pts: [], lines: [poly([0.18, 0.18], [0.82, 0.18], [0.82, 0.82], [0.18, 0.82], [0.18, 0.18])] },
  { id: 'triangle', name: '三角', pts: [], lines: [regular(0.5, 0.55, 0.42, 3)] },
  { id: 'diamond', name: '菱形', pts: [], lines: [poly([0.5, 0.1], [0.85, 0.5], [0.5, 0.9], [0.15, 0.5], [0.5, 0.1])] },
  { id: 'heart', name: '愛心', pts: [], lines: [heart()] },
  { id: 'moon', name: '月亮', pts: [], lines: [[...arc(0.5, 0.5, 0.38, Math.PI * 0.35, Math.PI * 1.65, 40), ...arc(0.62, 0.5, 0.3, Math.PI * 1.5, Math.PI * 0.5, 30).reverse()]] },
  { id: 'arrow', name: '箭頭', pts: [], lines: [poly([0.12, 0.42], [0.55, 0.42], [0.55, 0.22], [0.9, 0.5], [0.55, 0.78], [0.55, 0.58], [0.12, 0.58], [0.12, 0.42])] },
  { id: 'infinity', name: '無限', pts: [], lines: [infinity()] },
  { id: 'star', name: '星星', pts: [], lines: [star()] },
  { id: 'house', name: '房子', pts: [], lines: [poly([0.2, 0.85], [0.2, 0.45], [0.5, 0.15], [0.8, 0.45], [0.8, 0.85], [0.2, 0.85]), poly([0.42, 0.85], [0.42, 0.62], [0.58, 0.62], [0.58, 0.85])] },
  { id: 'cat', name: '貓', pts: [], lines: [circle(0.5, 0.55, 0.3), poly([0.27, 0.38], [0.24, 0.1], [0.44, 0.27]), poly([0.73, 0.38], [0.76, 0.1], [0.56, 0.27]), circle(0.4, 0.52, 0.04, 12), circle(0.6, 0.52, 0.04, 12), poly([0.44, 0.68], [0.5, 0.73], [0.56, 0.68])] },
  { id: 'fish', name: '魚', pts: [], lines: [poly([0.15, 0.5], [0.35, 0.28], [0.65, 0.28], [0.8, 0.5], [0.65, 0.72], [0.35, 0.72], [0.15, 0.5]), poly([0.8, 0.5], [0.92, 0.33], [0.92, 0.67], [0.8, 0.5]), circle(0.32, 0.45, 0.035, 12)] },
  { id: 'umbrella', name: '雨傘', pts: [], lines: [Array.from({ length: 33 }, (_, i): Pt => [0.12 + (i / 32) * 0.76, 0.5 - Math.sin((i / 32) * Math.PI) * 0.35]), poly([0.12, 0.5], [0.88, 0.5]), poly([0.5, 0.5], [0.5, 0.86], [0.44, 0.92], [0.38, 0.86])] },
  { id: 'smile', name: '笑臉', pts: [], lines: [circle(0.5, 0.5, 0.4), circle(0.37, 0.4, 0.04, 12), circle(0.63, 0.4, 0.04, 12), Array.from({ length: 21 }, (_, i): Pt => [0.5 + Math.cos(Math.PI * 0.2 + (i / 20) * Math.PI * 0.6) * 0.24, 0.5 + Math.sin(Math.PI * 0.2 + (i / 20) * Math.PI * 0.6) * 0.24])] },
  { id: 'bolt', name: '閃電', pts: [], lines: [poly([0.55, 0.08], [0.3, 0.5], [0.5, 0.5], [0.42, 0.92], [0.72, 0.42], [0.52, 0.42], [0.55, 0.08])] },
  { id: 'tree', name: '樹', pts: [], lines: [poly([0.5, 0.08], [0.72, 0.36], [0.62, 0.36], [0.82, 0.62], [0.56, 0.62], [0.56, 0.9], [0.44, 0.9], [0.44, 0.62], [0.18, 0.62], [0.38, 0.36], [0.28, 0.36], [0.5, 0.08])] },
  { id: 'cup', name: '杯子', pts: [], lines: [poly([0.22, 0.3], [0.62, 0.3], [0.62, 0.72], [0.56, 0.8], [0.28, 0.8], [0.22, 0.72], [0.22, 0.3]), arc(0.62, 0.51, 0.14, -Math.PI / 2, Math.PI / 2, 16), poly([0.3, 0.2], [0.3, 0.12]), poly([0.42, 0.2], [0.42, 0.1]), poly([0.54, 0.2], [0.54, 0.12])] },
  { id: 'sun', name: '太陽', pts: [], lines: [circle(0.5, 0.5, 0.2), ...Array.from({ length: 8 }, (_, i): Pt[] => { const a = (i / 8) * Math.PI * 2; return [[0.5 + Math.cos(a) * 0.28, 0.5 + Math.sin(a) * 0.28], [0.5 + Math.cos(a) * 0.42, 0.5 + Math.sin(a) * 0.42]]; })] },
  { id: 'cloud', name: '雲', pts: [], lines: [[...arc(0.3, 0.58, 0.14, Math.PI * 0.5, Math.PI * 1.5, 16), ...arc(0.44, 0.44, 0.16, Math.PI * 1.1, Math.PI * 1.95, 16), ...arc(0.64, 0.46, 0.15, Math.PI * 1.2, Math.PI * 2.05, 16), ...arc(0.74, 0.6, 0.12, Math.PI * 1.5, Math.PI * 2.5, 16), [0.3, 0.72]]] },
  { id: 'apple', name: '蘋果', pts: [], lines: [[...arc(0.5, 0.58, 0.32, -Math.PI * 0.38, Math.PI * 1.38, 48), [0.5, 0.36]], poly([0.5, 0.36], [0.54, 0.16]), poly([0.54, 0.22], [0.7, 0.14], [0.64, 0.3], [0.54, 0.22])] },
  { id: 'spiral', name: '螺旋', pts: [], lines: [spiral()] },
  { id: 'boat', name: '船', pts: [], lines: [poly([0.12, 0.62], [0.88, 0.62], [0.74, 0.82], [0.26, 0.82], [0.12, 0.62]), poly([0.5, 0.62], [0.5, 0.14]), poly([0.52, 0.16], [0.8, 0.52], [0.52, 0.52], [0.52, 0.16])] },
  { id: 'key', name: '鑰匙', pts: [], lines: [circle(0.3, 0.5, 0.15), circle(0.3, 0.5, 0.05, 12), poly([0.45, 0.5], [0.9, 0.5], [0.9, 0.62], [0.82, 0.62], [0.82, 0.55], [0.74, 0.55], [0.74, 0.62], [0.66, 0.62], [0.66, 0.55])] },
];
for (const s of SHAPES) s.pts = samplePoints(s.lines!);

/** 折線每隔 step 取一個點 */
export function samplePoints(lines: Pt[][], step = 0.01): Pt[] {
  const out: Pt[] = [];
  for (const line of lines) {
    let carry = 0;
    for (let i = 0; i < line.length - 1; i++) {
      const [x0, y0] = line[i], [x1, y1] = line[i + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len === 0) continue;
      for (let d = carry; d < len; d += step) {
        const t = d / len;
        out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
      }
      carry = ((carry - len) % step + step) % step;
    }
  }
  return out;
}

// ---- 圖片 → 線稿 ----
/**
 * 灰階 → 模糊 → Sobel → 非極大值抑制 → 依比例取門檻。回傳 0..1 座標（保持長寬比、置中在正方形裡）。
 * `strength` 0..1：越大線越多。
 */
export function edgePoints(img: ImageData, strength = 0.5, maxPts = 3500): Pt[] {
  const { width: W, height: H, data } = img;
  const g = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;
  // 3×3 高斯
  const b = Float32Array.from(g); // 邊框保留原值，不然邊框會被當成邊緣
  const k = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      let s = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s += g[(y + j) * W + x + i] * k[(j + 1) * 3 + i + 1];
      b[y * W + x] = s / 16;
    }
  const mag = new Float32Array(W * H), dir = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const p = (dx: number, dy: number) => b[(y + dy) * W + x + dx];
      const gx = -p(-1, -1) - 2 * p(-1, 0) - p(-1, 1) + p(1, -1) + 2 * p(1, 0) + p(1, 1);
      const gy = -p(-1, -1) - 2 * p(0, -1) - p(1, -1) + p(-1, 1) + 2 * p(0, 1) + p(1, 1);
      mag[y * W + x] = Math.hypot(gx, gy);
      const a = Math.atan2(gy, gx) + Math.PI; // 0..2π
      dir[y * W + x] = Math.round(a / (Math.PI / 4)) % 4; // 0: 水平 1: 斜 2: 垂直 3: 反斜
    }
  // 非極大值抑制：只留沿梯度方向的局部最大
  const thin = new Float32Array(W * H);
  const OFF: [number, number][] = [[1, 0], [1, 1], [0, 1], [-1, 1]];
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x, m = mag[i];
      if (m < 8) continue;
      const [dx, dy] = OFF[dir[i]];
      if (m >= mag[(y + dy) * W + x + dx] && m >= mag[(y - dy) * W + x - dx]) thin[i] = m;
    }
  // 門檻：相對於最強邊緣（取 99 百分位當基準，避免被單一雜點帶偏），strength 越大門檻越低
  const sorted = Array.from(thin).filter((v) => v > 0).sort((a, c) => c - a);
  if (!sorted.length) return [];
  const ref = sorted[Math.floor(sorted.length * 0.01)];
  const th = Math.max(20, ref * (0.55 - strength * 0.47));
  const pts: Pt[] = [];
  const S = Math.max(W, H), ox = (S - W) / 2, oy = (S - H) / 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (thin[y * W + x] >= th) pts.push([(x + ox) / S, (y + oy) / S]);
  if (pts.length <= maxPts) return pts;
  const stride = pts.length / maxPts;
  return Array.from({ length: maxPts }, (_, i) => pts[Math.floor(i * stride)]);
}

// ---- 評分 ----
/** 空間格子，查「附近有沒有點」 */
class Grid {
  private cells = new Map<number, Pt[]>();
  constructor(pts: Pt[], private cell: number) {
    for (const p of pts) {
      const key = this.key(p[0], p[1]);
      const arr = this.cells.get(key);
      if (arr) arr.push(p); else this.cells.set(key, [p]);
    }
  }
  private key(x: number, y: number) { return Math.floor(x / this.cell) * 4096 + Math.floor(y / this.cell); }
  near(x: number, y: number, r: number): boolean {
    const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const arr = this.cells.get((cx + i) * 4096 + cy + j);
        if (!arr) continue;
        for (const p of arr) if ((p[0] - x) ** 2 + (p[1] - y) ** 2 <= r * r) return true;
      }
    return false;
  }
}

export interface Score {
  /** 目標有多少比例被畫到 */
  covered: number;
  /** 軌跡有多少比例落在線上 */
  onLine: number;
  /** 0–100 */
  total: number;
}
/** 把軌跡也補成密一點的點再算，不然快速移動會漏 */
/**
 * 目標圖分成幾塊不相連的部分（笑臉 = 臉 + 兩眼 + 嘴），一筆畫一定得在部分之間「空走」。
 * 算出把所有部分串起來最少要走多遠（最小生成樹），這段距離的離線筆跡不扣分。
 */
export function freeTravel(target: Pt[], tol: number = TOL): number {
  if (target.length < 2) return 0;
  // 連通分量：距離 ≤ tol×1.5 就算連著
  const link = tol * 1.5;
  const cell = link;
  const cells = new Map<number, number[]>();
  const key = (x: number, y: number) => Math.floor(x / cell) * 4096 + Math.floor(y / cell);
  target.forEach((p, i) => { const k = key(p[0], p[1]); const a = cells.get(k); if (a) a.push(i); else cells.set(k, [i]); });
  const comp = new Int32Array(target.length).fill(-1);
  const comps: Pt[][] = [];
  for (let i = 0; i < target.length; i++) {
    if (comp[i] >= 0) continue;
    const id = comps.length, members: Pt[] = [];
    const stack = [i]; comp[i] = id;
    while (stack.length) {
      const j = stack.pop()!; members.push(target[j]);
      const [x, y] = target[j];
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const arr = cells.get((cx + a) * 4096 + cy + b);
        if (!arr) continue;
        for (const k of arr) if (comp[k] < 0 && (target[k][0] - x) ** 2 + (target[k][1] - y) ** 2 <= link * link) { comp[k] = id; stack.push(k); }
      }
    }
    comps.push(members);
  }
  // 太小的碎片（自訂圖的雜點）不算一塊；每塊最多取 80 個代表點算距離
  const parts = comps.filter((m) => m.length >= 4).map((m) => { const st = Math.max(1, m.length / 80); return Array.from({ length: Math.min(m.length, 80) }, (_, i) => m[Math.floor(i * st)]); });
  if (parts.length <= 1) return 0;
  const dist = (A: Pt[], B: Pt[]) => { let d = Infinity; for (const a of A) for (const b of B) { const dd = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2; if (dd < d) d = dd; } return Math.sqrt(d); };
  // Prim 最小生成樹
  const inTree = new Array(parts.length).fill(false);
  const best = new Array(parts.length).fill(Infinity);
  inTree[0] = true;
  for (let j = 1; j < parts.length; j++) best[j] = dist(parts[0], parts[j]);
  let total = 0;
  for (let n = 1; n < parts.length; n++) {
    let pick = -1;
    for (let j = 0; j < parts.length; j++) if (!inTree[j] && (pick < 0 || best[j] < best[pick])) pick = j;
    total += best[pick]; inTree[pick] = true;
    for (let j = 0; j < parts.length; j++) if (!inTree[j]) best[j] = Math.min(best[j], dist(parts[pick], parts[j]));
  }
  return total;
}

/** 把軌跡也補成密一點的點再算，不然快速移動會漏。`free` = 可以免費空走的距離（見 freeTravel） */
export function scoreTrail(target: Pt[], trail: Pt[], tol: number = TOL, free = 0): Score {
  if (!target.length || trail.length < 2) return { covered: 0, onLine: 0, total: 0 };
  const step = tol / 2;
  const dense = samplePoints([trail], step);
  const tg = new Grid(target, tol), tr = new Grid(dense, tol);
  let c = 0;
  for (const p of target) if (tr.near(p[0], p[1], tol)) c++;
  let o = 0;
  for (const p of dense) if (tg.near(p[0], p[1], tol)) o++;
  const covered = c / target.length;
  // 離線的長度扣掉免費額度（額度再寬鬆 1.3 倍，因為人不會走直線）
  const off = Math.max(0, (dense.length - o) * step - free * 1.3);
  const onLine = o === 0 ? 0 : (o * step) / (o * step + off);
  // 調和平均，兩邊都要好
  const total = covered + onLine === 0 ? 0 : (2 * covered * onLine) / (covered + onLine);
  return { covered, onLine, total: Math.round(total * 100) };
}

export function verdict(total: number): string {
  if (total >= 85) return '神同步！';
  if (total >= 65) return '有像有像';
  if (total >= 45) return '勉強看得出來';
  if (total >= 25) return '抽象派';
  return '這是什麼東西';
}
