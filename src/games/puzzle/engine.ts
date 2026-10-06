// 拼圖引擎：片的點陣圖快取、命中、吸附、繪製。不碰 React / 網路。
import { buildEdges, piecePath, type Edges, type ShapeId } from './geometry';

export interface PuzzleMeta {
  id: string;
  name: string;
  imageUrl: string;
  W: number; // 圖片（= 拼圖）尺寸
  H: number;
  cols: number;
  rows: number;
  shape: ShapeId;
  seed: number;
}
export interface PuzzleSave extends PuzzleMeta {
  pos: number[]; // [x0,y0,x1,y1,...] 每片基準左上角（板座標）
  links: number[]; // 已接合的邊 [a,b,a,b,...]（a<b）
  order: number[]; // z-order（後面的在上面）
  progress: number; // 0–1
  updatedAt: number;
}

export type Pos = [number, number, number][]; // [id, x, y]

const SCATTER = 0.7; // 打散範圍：圖外各多 70%

export class PuzzleEngine {
  readonly n: number;
  readonly pw: number;
  readonly ph: number;
  readonly pad: number;
  pos: Float64Array;
  order: number[];
  links = new Set<number>();
  private edges: Edges;
  private bitmaps: (HTMLCanvasElement | null)[];
  private paths: Path2D[];
  private comp: Int32Array; // 連通分量 id
  locked = new Set<number>(); // 對方正在拖的片

  constructor(readonly meta: PuzzleMeta, readonly img: HTMLImageElement | HTMLCanvasElement) {
    this.n = meta.cols * meta.rows;
    this.pw = meta.W / meta.cols;
    this.ph = meta.H / meta.rows;
    this.pad = Math.ceil(Math.max(this.pw, this.ph) * 0.42);
    this.edges = buildEdges(meta.cols, meta.rows, meta.seed);
    this.paths = Array.from({ length: this.n }, (_, i) => piecePath(this.edges, meta.shape, i % meta.cols, Math.floor(i / meta.cols), this.pw, this.ph));
    this.bitmaps = Array(this.n).fill(null);
    this.pos = new Float64Array(this.n * 2);
    this.order = Array.from({ length: this.n }, (_, i) => i);
    this.comp = new Int32Array(this.n);
    this.recomputeComponents();
  }

  col(i: number) { return i % this.meta.cols; }
  row(i: number) { return Math.floor(i / this.meta.cols); }
  x(i: number) { return this.pos[i * 2]; }
  y(i: number) { return this.pos[i * 2 + 1]; }
  setPos(i: number, x: number, y: number) { this.pos[i * 2] = x; this.pos[i * 2 + 1] = y; }
  /** 正確答案位置 */
  homeX(i: number) { return this.col(i) * this.pw; }
  homeY(i: number) { return this.row(i) * this.ph; }

  // ---- 初始化 / 存讀 ----
  scatter(rand = Math.random) {
    const { W, H } = this.meta;
    for (let i = 0; i < this.n; i++) {
      this.setPos(i, -W * SCATTER + rand() * W * (1 + 2 * SCATTER) - this.pw / 2, -H * SCATTER + rand() * H * (1 + 2 * SCATTER) - this.ph / 2);
    }
    for (let i = this.order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [this.order[i], this.order[j]] = [this.order[j], this.order[i]]; }
    this.links.clear();
    this.recomputeComponents();
  }
  load(save: Pick<PuzzleSave, 'pos' | 'links' | 'order'>) {
    this.pos.set(save.pos.slice(0, this.n * 2));
    this.links = new Set();
    for (let i = 0; i + 1 < save.links.length; i += 2) this.links.add(this.linkKey(save.links[i], save.links[i + 1]));
    if (save.order?.length === this.n) this.order = [...save.order];
    this.recomputeComponents();
  }
  toSave(): Pick<PuzzleSave, 'pos' | 'links' | 'order' | 'progress'> {
    const links: number[] = [];
    for (const k of this.links) links.push(Math.floor(k / this.n), k % this.n);
    return { pos: Array.from(this.pos), links, order: [...this.order], progress: this.progress() };
  }
  private linkKey(a: number, b: number) { return a < b ? a * this.n + b : b * this.n + a; }
  totalLinks() { return (this.meta.cols - 1) * this.meta.rows + (this.meta.rows - 1) * this.meta.cols; }
  progress() { return this.links.size / this.totalLinks(); }
  done() { return this.links.size >= this.totalLinks(); }

  // ---- 分組 ----
  private recomputeComponents() {
    const parent = Array.from({ length: this.n }, (_, i) => i);
    const find = (a: number): number => (parent[a] === a ? a : (parent[a] = find(parent[a])));
    for (const k of this.links) {
      const a = Math.floor(k / this.n), b = k % this.n;
      parent[find(a)] = find(b);
    }
    for (let i = 0; i < this.n; i++) this.comp[i] = find(i);
  }
  group(i: number): number[] {
    const c = this.comp[i];
    const out: number[] = [];
    for (let j = 0; j < this.n; j++) if (this.comp[j] === c) out.push(j);
    return out;
  }
  moveGroup(ids: number[], dx: number, dy: number) { for (const i of ids) this.setPos(i, this.x(i) + dx, this.y(i) + dy); }
  bringToTop(ids: number[]) {
    const set = new Set(ids);
    this.order = [...this.order.filter((i) => !set.has(i)), ...this.order.filter((i) => set.has(i))];
  }
  applyPositions(list: Pos) { for (const [i, x, y] of list) this.setPos(i, x, y); }
  addLinks(pairs: [number, number][]) {
    for (const [a, b] of pairs) this.links.add(this.linkKey(a, b));
    this.recomputeComponents();
  }

  /** 放開後檢查吸附。回傳新產生的接合邊；會直接對齊位置 */
  snap(ids: number[], tolerance: number): [number, number][] {
    const inGroup = new Set(ids);
    const { cols, rows } = this.meta;
    const neighbors = (i: number): [number, number, number][] => {
      const c = this.col(i), r = this.row(i);
      const out: [number, number, number][] = [];
      if (c > 0) out.push([i - 1, -this.pw, 0]);
      if (c < cols - 1) out.push([i + 1, this.pw, 0]);
      if (r > 0) out.push([i - cols, 0, -this.ph]);
      if (r < rows - 1) out.push([i + cols, 0, this.ph]);
      return out;
    };
    // 找第一個夠近的鄰居，把整組對齊過去
    let aligned = false;
    for (const i of ids) {
      for (const [j, dx, dy] of neighbors(i)) {
        if (inGroup.has(j) || this.locked.has(j)) continue;
        const ex = this.x(i) + dx, ey = this.y(i) + dy;
        const ox = this.x(j) - ex, oy = this.y(j) - ey;
        if (Math.hypot(ox, oy) <= tolerance) { this.moveGroup(ids, ox, oy); aligned = true; break; }
      }
      if (aligned) break;
    }
    if (!aligned) return [];
    // 對齊後，所有位置剛好吻合的鄰居都接起來（可能同時接到好幾邊）
    const added: [number, number][] = [];
    for (const i of ids) {
      for (const [j, dx, dy] of neighbors(i)) {
        if (inGroup.has(j)) continue;
        if (Math.abs(this.x(j) - (this.x(i) + dx)) < 0.5 && Math.abs(this.y(j) - (this.y(i) + dy)) < 0.5) {
          const k = this.linkKey(i, j);
          if (!this.links.has(k)) { this.links.add(k); added.push([Math.min(i, j), Math.max(i, j)]); }
        }
      }
    }
    // 組內原本就相鄰但沒登記的也補上（例如兩組合併後中間的邊）
    this.recomputeComponents();
    const merged = this.group(ids[0]);
    for (const i of merged) {
      for (const [j, dx, dy] of neighbors(i)) {
        if (this.comp[j] !== this.comp[i]) continue;
        if (Math.abs(this.x(j) - (this.x(i) + dx)) < 0.5 && Math.abs(this.y(j) - (this.y(i) + dy)) < 0.5) {
          const k = this.linkKey(i, j);
          if (!this.links.has(k)) { this.links.add(k); added.push([Math.min(i, j), Math.max(i, j)]); }
        }
      }
    }
    return added;
  }

  // ---- 命中 ----
  hitTest(bx: number, by: number): number | null {
    for (let k = this.order.length - 1; k >= 0; k--) {
      const i = this.order[k];
      const lx = bx - this.x(i), ly = by - this.y(i);
      if (lx < -this.pad || ly < -this.pad || lx > this.pw + this.pad || ly > this.ph + this.pad) continue;
      const bmp = this.bitmap(i);
      const ctx = bmp.getContext('2d')!;
      const px = Math.floor(lx + this.pad), py = Math.floor(ly + this.pad);
      if (px < 0 || py < 0 || px >= bmp.width || py >= bmp.height) continue;
      if (ctx.getImageData(px, py, 1, 1).data[3] > 10) return i;
    }
    return null;
  }

  // ---- 繪製 ----
  private bitmap(i: number): HTMLCanvasElement {
    let b = this.bitmaps[i];
    if (b) return b;
    b = document.createElement('canvas');
    b.width = Math.ceil(this.pw + this.pad * 2);
    b.height = Math.ceil(this.ph + this.pad * 2);
    const ctx = b.getContext('2d')!;
    ctx.translate(this.pad, this.pad);
    ctx.save();
    ctx.clip(this.paths[i]);
    ctx.drawImage(this.img, -this.homeX(i), -this.homeY(i));
    ctx.restore();
    // 邊緣一點陰影線讓片有立體感
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.stroke(this.paths[i]);
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.translate(-0.6, -0.6);
    ctx.stroke(this.paths[i]);
    this.bitmaps[i] = b;
    return b;
  }

  draw(ctx: CanvasRenderingContext2D, view: { s: number; tx: number; ty: number }, highlight: Set<number>, peerColor: string) {
    const { W, H } = this.meta;
    ctx.setTransform(view.s, 0, 0, view.s, view.tx, view.ty);
    // 完成區的框
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2 / view.s;
    ctx.setLineDash([8 / view.s, 6 / view.s]);
    ctx.strokeRect(0, 0, W, H);
    ctx.setLineDash([]);
    for (const i of this.order) {
      const b = this.bitmap(i);
      const x = this.x(i) - this.pad, y = this.y(i) - this.pad;
      if (highlight.has(i)) {
        ctx.shadowColor = 'rgba(0,0,0,0.45)';
        ctx.shadowBlur = 18 / view.s;
        ctx.shadowOffsetY = 6 / view.s;
      }
      ctx.drawImage(b, x, y);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      if (this.locked.has(i)) {
        ctx.save();
        ctx.translate(this.x(i), this.y(i));
        ctx.strokeStyle = peerColor;
        ctx.lineWidth = 3 / view.s;
        ctx.stroke(this.paths[i]);
        ctx.restore();
      }
    }
  }

  /** 所有片的包圍盒（fit 用） */
  bounds() {
    let x0 = 0, y0 = 0, x1 = this.meta.W, y1 = this.meta.H;
    for (let i = 0; i < this.n; i++) {
      x0 = Math.min(x0, this.x(i) - this.pad); y0 = Math.min(y0, this.y(i) - this.pad);
      x1 = Math.max(x1, this.x(i) + this.pw + this.pad); y1 = Math.max(y1, this.y(i) + this.ph + this.pad);
    }
    return { x0, y0, x1, y1 };
  }
}

/** 把使用者選的圖縮到 maxSide 以內，回傳 canvas（上傳與拼圖都用它） */
export async function loadScaled(src: File | string, maxSide = 1600): Promise<HTMLCanvasElement> {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((ok, err) => { img.onload = () => ok(); img.onerror = () => err(new Error('圖片載入失敗')); img.src = url; });
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  if (typeof src !== 'string') URL.revokeObjectURL(url);
  return c;
}
