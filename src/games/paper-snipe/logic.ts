// 摺紙狙擊：純邏輯，不碰 React / 網路
import { PAPER, other, type Side } from '../shared/layout';
export { PAPER, other, type Side };

export type Size = 'S' | 'M' | 'L';
export type Part = 'head' | 'body' | 'limb';

export const SIZES: Record<Size, { scale: number; hp: number; label: string }> = {
  S: { scale: 0.7, hp: 2, label: '小' },
  M: { scale: 1, hp: 3, label: '中' },
  L: { scale: 1.4, hp: 5, label: '大' },
};

export interface Stickman {
  id: string;
  side: Side;
  x: number;
  y: number;
  size: Size;
  hp: number;
  /** 邏輯座標下的旋轉角（度），讓放的人看起來是正的 */
  rot: number;
}
export interface Ink {
  id: string;
  x: number;
  y: number;
  r: number;
  kind: 'dot' | 'print';
  side: Side; // 墨在哪一半
  turn: number;
}
export interface StampResult {
  power: number;
  ok: boolean; // 有沒有印上去
  x: number;
  y: number;
  r: number;
  hit: { stickmanId: string; part: Part; dmg: number; killed: boolean } | null;
}
export interface GameState {
  config: { count: number };
  phase: 'setup' | 'play' | 'over';
  step: 'draw' | 'fold' | 'aim' | 'reveal';
  turn: Side;
  turnNo: number;
  ready: Record<Side, boolean>;
  stickmen: Stickman[];
  inks: Ink[];
  pendingDot: { x: number; y: number } | null;
  lastResult: StampResult | null;
  winner: Side | null;
}

export const DOT_R = 11;
/** 摺紙 / 敲下去的動畫時間 */
export const FOLD_MS = 900;
export const SLAM_MS = 420;
/** 敲完之後結果停多久才換人（輪到的人負責推進） */
export const REVEAL_HOLD_MS = 2200;
export const POWER = { min: 35, sweet: 72, sweetHalf: 8 };

const uid = () => Math.random().toString(36).slice(2, 9);

export function initialState(count: number): GameState {
  return {
    config: { count },
    phase: 'setup',
    step: 'draw',
    turn: 'L',
    turnNo: 1,
    ready: { L: false, R: false },
    stickmen: [],
    inks: [],
    pendingDot: null,
    lastResult: null,
    winner: null,
  };
}

// ---- 火柴人幾何（scale = 1，原點在胸口附近）----
export const HEAD = { cx: 0, cy: -50, r: 13 };
export const SEGMENTS: { a: [number, number]; b: [number, number]; w: number; part: Part; dmg: number }[] = [
  { a: [0, -37], b: [0, 12], w: 5, part: 'body', dmg: 2 },
  { a: [0, -28], b: [-24, 2], w: 4, part: 'limb', dmg: 1 },
  { a: [0, -28], b: [24, 2], w: 4, part: 'limb', dmg: 1 },
  { a: [0, 12], b: [-17, 50], w: 4, part: 'limb', dmg: 1 },
  { a: [0, 12], b: [17, 50], w: 4, part: 'limb', dmg: 1 },
];
const BOX = { top: -66, bottom: 52, half: 26 };

function distToSeg(px: number, py: number, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len2));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

export function hitTest(p: { x: number; y: number; r: number }, s: Stickman): { part: Part; dmg: number } | null {
  const sc = SIZES[s.size].scale;
  const dx = (p.x - s.x) / sc, dy = (p.y - s.y) / sc, lr = p.r / sc;
  const a = (-s.rot * Math.PI) / 180;
  const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
  if (Math.hypot(lx - HEAD.cx, ly - HEAD.cy) <= lr + HEAD.r) return { part: 'head', dmg: 99 };
  let best: { part: Part; dmg: number } | null = null;
  for (const seg of SEGMENTS) {
    if (distToSeg(lx, ly, seg.a, seg.b) <= lr + seg.w / 2 && (!best || seg.dmg > best.dmg)) {
      best = { part: seg.part, dmg: seg.dmg };
    }
  }
  return best;
}

export function sideOfX(x: number): Side {
  return x < PAPER.fold ? 'L' : 'R';
}

// ---- 佈陣 ----
/** 旋轉後的包圍盒半寬/半高（rot 只會是 90 的倍數） */
function halfExtents(size: Size, rot: number) {
  const sc = SIZES[size].scale;
  const w = BOX.half * sc, h = ((BOX.bottom - BOX.top) / 2) * sc;
  const sideways = Math.round(rot / 90) % 2 !== 0;
  return sideways ? { hw: h, hh: w } : { hw: w, hh: h };
}
function center(y: number, rot: number, size: Size) {
  // 原點不在包圍盒中心，先算出視覺中心
  const sc = SIZES[size].scale;
  const off = ((BOX.top + BOX.bottom) / 2) * sc;
  const a = (rot * Math.PI) / 180;
  return { cx: -Math.sin(a) * off, cy: y + Math.cos(a) * off };
}

export function canPlace(state: GameState, side: Side, x: number, y: number, size: Size, rot: number): boolean {
  const [minX, maxX] = side === 'L' ? [0, PAPER.fold] : [PAPER.fold, PAPER.w];
  const m = 10;
  const { hw, hh } = halfExtents(size, rot);
  const c = center(y, rot, size);
  const cx = x + c.cx, cy = c.cy;
  if (cx - hw < minX + m || cx + hw > maxX - m) return false;
  if (cy - hh < m || cy + hh > PAPER.h - m) return false;
  return !state.stickmen.some((o) => {
    if (o.side !== side) return false;
    const oe = halfExtents(o.size, o.rot);
    const oc = center(o.y, o.rot, o.size);
    return Math.abs(o.x + oc.cx - cx) < hw + oe.hw && Math.abs(oc.cy - cy) < hh + oe.hh;
  });
}

export function placeStickman(state: GameState, side: Side, x: number, y: number, size: Size, rot: number): GameState {
  const s: Stickman = { id: uid(), side, x, y, size, hp: SIZES[size].hp, rot };
  return { ...state, stickmen: [...state.stickmen, s] };
}

export function removeStickman(state: GameState, id: string): GameState {
  return { ...state, stickmen: state.stickmen.filter((s) => s.id !== id) };
}

/** 套用某一方的佈陣（自己或對方送來的） */
export function mergeSetup(state: GameState, side: Side, stickmen: Stickman[], ready: boolean): GameState {
  const next: GameState = {
    ...state,
    stickmen: [...state.stickmen.filter((s) => s.side !== side), ...stickmen],
    ready: { ...state.ready, [side]: ready },
  };
  if (next.ready.L && next.ready.R) return { ...next, phase: 'play', step: 'draw', turn: 'L', turnNo: 1 };
  return next;
}

// ---- 回合 ----
export function drawDot(state: GameState, x: number, y: number): GameState | null {
  const [minX, maxX] = state.turn === 'L' ? [0, PAPER.fold] : [PAPER.fold, PAPER.w];
  const m = DOT_R + 4;
  if (x < minX + m || x > maxX - m || y < m || y > PAPER.h - m) return null;
  const ink: Ink = { id: uid(), x, y, r: DOT_R, kind: 'dot', side: state.turn, turn: state.turnNo };
  return { ...state, inks: [...state.inks, ink], pendingDot: { x, y }, step: 'fold' };
}

export function mirrorOf(p: { x: number; y: number }) {
  return { x: PAPER.w - p.x, y: p.y };
}

export function computeStamp(dot: { x: number; y: number }, power: number, rand = Math.random): StampResult {
  const m = mirrorOf(dot);
  if (power < POWER.min) return { power, ok: false, x: m.x, y: m.y, r: 0, hit: null };
  const miss = Math.max(0, Math.abs(power - POWER.sweet) - POWER.sweetHalf);
  const mag = 3 + miss * 1.1 + rand() * 5;
  const ang = rand() * Math.PI * 2;
  const r = 9 + power * 0.1;
  const side = sideOfX(m.x);
  const [minX, maxX] = side === 'L' ? [0, PAPER.fold] : [PAPER.fold, PAPER.w];
  const x = Math.min(maxX - r, Math.max(minX + r, m.x + Math.cos(ang) * mag));
  const y = Math.min(PAPER.h - r, Math.max(r, m.y + Math.sin(ang) * mag));
  return { power, ok: true, x, y, r, hit: null };
}

export function applyStamp(state: GameState, power: number, rand = Math.random): GameState {
  if (!state.pendingDot) return state;
  const res = computeStamp(state.pendingDot, power, rand);
  let stickmen = state.stickmen;
  const inks = [...state.inks];
  const target = other(state.turn);

  if (res.ok) {
    inks.push({ id: uid(), x: res.x, y: res.y, r: res.r, kind: 'print', side: target, turn: state.turnNo });
    let chosen: { s: Stickman; h: { part: Part; dmg: number }; d: number } | null = null;
    for (const s of stickmen) {
      if (s.side !== target || s.hp <= 0) continue;
      const h = hitTest(res, s);
      if (!h) continue;
      const d = Math.hypot(s.x - res.x, s.y - res.y);
      if (!chosen || d < chosen.d) chosen = { s, h, d };
    }
    if (chosen) {
      const dmg = chosen.h.part === 'head' ? chosen.s.hp : Math.min(chosen.h.dmg, chosen.s.hp);
      const hp = chosen.s.hp - dmg;
      stickmen = stickmen.map((s) => (s.id === chosen!.s.id ? { ...s, hp } : s));
      res.hit = { stickmanId: chosen.s.id, part: chosen.h.part, dmg, killed: hp <= 0 };
    }
  }

  const alive = stickmen.some((s) => s.side === target && s.hp > 0);
  return {
    ...state,
    stickmen,
    inks,
    lastResult: res,
    step: 'reveal',
    phase: alive ? 'play' : 'over',
    winner: alive ? null : state.turn,
  };
}

export function nextTurn(state: GameState): GameState {
  return { ...state, turn: other(state.turn), turnNo: state.turnNo + 1, step: 'draw', pendingDot: null, lastResult: null };
}

/** 兩邊互相 sync 時，判斷誰的狀態比較「前面」 */
export function progress(s: GameState): number {
  const phase = { setup: 0, play: 1, over: 2 }[s.phase];
  const step = { draw: 0, fold: 1, aim: 2, reveal: 3 }[s.step];
  return phase * 10000 + s.turnNo * 10 + step + (s.phase === 'setup' ? s.stickmen.length + (s.ready.L ? 1 : 0) + (s.ready.R ? 1 : 0) : 0);
}

export function resultText(r: StampResult, victimName: string): string {
  if (!r.ok) return '力道不夠，沒印上去…';
  if (!r.hit) return '蓋歪了！什麼都沒打到';
  if (r.hit.part === 'head') return `爆頭！！${victimName}的火柴人倒下了`;
  const where = r.hit.part === 'body' ? '命中身體' : '擦到手腳';
  return `${where} −${r.hit.dmg}${r.hit.killed ? '，倒下了！' : ''}`;
}
