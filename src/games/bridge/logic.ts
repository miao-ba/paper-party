// 過橋：純邏輯
import { PAPER, other, type Side } from '../shared/layout';
import { circleFalls, getMap, territoryOf, type Pt } from './maps';
export { PAPER, other, type Side };

export type Size = 'S' | 'M' | 'L';
export const SIZES: Record<Size, { r: number; label: string }> = {
  S: { r: 14, label: '小' },
  M: { r: 20, label: '中' },
  L: { r: 28, label: '大' },
};

export interface Piece {
  id: string;
  side: Side;
  x: number;
  y: number;
  size: Size;
  alive: boolean;
  deathBy?: 'water' | 'hit';
}
export interface Stroke {
  id: string;
  side: Side;
  from: Pt;
  to: Pt;
  turn: number;
}
export interface MoveResult {
  pieceId: string;
  from: Pt;
  to: Pt;
  power: number;
  killed: string[];
  drowned: boolean;
  slipped: boolean;
  stoppedBy: 'dist' | 'edge' | 'ally' | 'hit' | 'water';
}
export interface Config {
  count: number;
  map: string;
  chain: boolean; // 連殺：撞到人不停
}
export interface GameState {
  config: Config;
  phase: 'setup' | 'play' | 'over';
  step: 'aim' | 'resolve';
  turn: Side;
  turnNo: number;
  ready: Record<Side, boolean>;
  pieces: Piece[];
  strokes: Stroke[];
  lastMove: MoveResult | null;
  winner: Side | null;
}

export const DEFAULT_CONFIG: Config = { count: 3, map: 'single', chain: true };
const uid = () => Math.random().toString(36).slice(2, 9);

export function initialState(config: Config): GameState {
  return {
    config,
    phase: 'setup',
    step: 'aim',
    turn: 'L',
    turnNo: 1,
    ready: { L: false, R: false },
    pieces: [],
    strokes: [],
    lastMove: null,
    winner: null,
  };
}

// ---- 佈陣 ----
export function canPlace(state: GameState, side: Side, p: Pt, size: Size): boolean {
  const map = getMap(state.config.map);
  const r = SIZES[size].r;
  const m = 8;
  if (p.x < r + m || p.x > PAPER.w - r - m || p.y < r + m || p.y > PAPER.h - r - m) return false;
  if (territoryOf(map, p) !== side) return false;
  if (circleFalls(map, p, r + 6, 1)) return false; // 離水邊留一點距離
  return !state.pieces.some((o) => o.side === side && Math.hypot(o.x - p.x, o.y - p.y) < r + SIZES[o.size].r + 6);
}
export function placePiece(state: GameState, side: Side, p: Pt, size: Size): GameState {
  return { ...state, pieces: [...state.pieces, { id: uid(), side, x: p.x, y: p.y, size, alive: true }] };
}
export function removePiece(state: GameState, id: string): GameState {
  return { ...state, pieces: state.pieces.filter((s) => s.id !== id) };
}
export function mergeSetup(state: GameState, side: Side, pieces: Piece[], ready: boolean): GameState {
  const next: GameState = {
    ...state,
    pieces: [...state.pieces.filter((s) => s.side !== side), ...pieces],
    ready: { ...state.ready, [side]: ready },
  };
  if (next.ready.L && next.ready.R) return { ...next, phase: 'play', step: 'aim', turn: 'L', turnNo: 1 };
  return next;
}

// ---- 射 ----
export const POWER = { slipAbove: 85, slipChance: 0.06, distPer: 6.5 };
/** 這個力道「預期」滑多遠、角度標準差幾度（給瞄準預覽用，跟 simulateMove 同一套公式） */
export const expected = (power: number) => ({ dist: power * POWER.distPer, spreadDeg: 2 + (power / 100) ** 2 * 22 });

function gauss(rand: () => number) {
  const u = Math.max(1e-9, rand()), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** 用力壓筆：力道越大滑越遠、越歪；太用力偶爾筆會滑掉 */
export function simulateMove(state: GameState, pieceId: string, angle: number, power: number, rand = Math.random): MoveResult {
  const map = getMap(state.config.map);
  const me = state.pieces.find((p) => p.id === pieceId)!;
  const r = SIZES[me.size].r;
  const from = { x: me.x, y: me.y };

  const slipped = power > POWER.slipAbove && rand() < POWER.slipChance;
  const noise = slipped ? gauss(rand) * 60 : expected(power).spreadDeg * gauss(rand);
  const a = angle + (noise * Math.PI) / 180;
  const maxDist = slipped ? 25 + rand() * 20 : expected(power).dist * (0.85 + rand() * 0.3);
  const dir = { x: Math.cos(a), y: Math.sin(a) };

  const enemies = state.pieces.filter((p) => p.side !== me.side && p.alive);
  const allies = state.pieces.filter((p) => p.side === me.side && p.alive && p.id !== me.id);
  const killed: string[] = [];
  let pos = { ...from };
  let stoppedBy: MoveResult['stoppedBy'] = 'dist';
  let drowned = false;
  const step = 3;

  for (let t = step; t <= maxDist; t += step) {
    const next = { x: from.x + dir.x * t, y: from.y + dir.y * t };
    if (next.x < r || next.x > PAPER.w - r || next.y < r || next.y > PAPER.h - r) { stoppedBy = 'edge'; break; }
    if (allies.some((o) => Math.hypot(o.x - next.x, o.y - next.y) < r + SIZES[o.size].r)) { stoppedBy = 'ally'; break; }
    pos = next;
    if (circleFalls(map, pos, r)) { drowned = true; stoppedBy = 'water'; break; }
    let hitNow = false;
    for (const e of enemies) {
      if (killed.includes(e.id)) continue;
      if (Math.hypot(e.x - pos.x, e.y - pos.y) < r + SIZES[e.size].r) { killed.push(e.id); hitNow = true; }
    }
    if (hitNow && !state.config.chain) { stoppedBy = 'hit'; break; }
  }
  return { pieceId, from, to: pos, power, killed, drowned, slipped, stoppedBy };
}

export function applyMove(state: GameState, move: MoveResult): GameState {
  const mover = state.pieces.find((p) => p.id === move.pieceId)!;
  const pieces = state.pieces.map((p) => {
    if (p.id === move.pieceId) return { ...p, x: move.to.x, y: move.to.y, alive: !move.drowned, deathBy: move.drowned ? ('water' as const) : p.deathBy };
    if (move.killed.includes(p.id)) return { ...p, alive: false, deathBy: 'hit' as const };
    return p;
  });
  const stroke: Stroke = { id: uid(), side: mover.side, from: move.from, to: move.to, turn: state.turnNo };
  const enemyAlive = pieces.some((p) => p.side !== mover.side && p.alive);
  return {
    ...state,
    pieces,
    strokes: [...state.strokes, stroke],
    lastMove: move,
    step: 'resolve',
    phase: enemyAlive ? 'play' : 'over',
    winner: enemyAlive ? null : mover.side,
  };
}

export function nextTurn(state: GameState): GameState {
  // 對方沒有活的就不會到這裡；自己全掉水也算輸
  const meAlive = state.pieces.some((p) => p.side === other(state.turn) && p.alive);
  const selfAlive = state.pieces.some((p) => p.side === state.turn && p.alive);
  if (!selfAlive) return { ...state, phase: 'over', winner: other(state.turn), step: 'resolve' };
  if (!meAlive) return { ...state, phase: 'over', winner: state.turn, step: 'resolve' };
  return { ...state, turn: other(state.turn), turnNo: state.turnNo + 1, step: 'aim', lastMove: null };
}

/** 筆滑出去的動畫時間（依距離），跟停多久才換人；兩邊（含電腦）用同一套 */
export const moveDuration = (d: number) => 250 + d * 1.1;
export const HOLD_MS = 1600;

export function progress(s: GameState): number {
  const phase = { setup: 0, play: 1, over: 2 }[s.phase];
  const step = { aim: 0, resolve: 1 }[s.step];
  return phase * 10000 + s.turnNo * 10 + step + (s.phase === 'setup' ? s.pieces.length + (s.ready.L ? 1 : 0) + (s.ready.R ? 1 : 0) : 0);
}

export function resultText(m: MoveResult): string {
  if (m.slipped) return '筆滑掉了！';
  if (m.drowned) return m.killed.length ? `撞掉 ${m.killed.length} 個，然後自己掉進水裡…` : '掉進水裡了…';
  if (m.killed.length) return m.killed.length > 1 ? `連殺 ${m.killed.length} 個！` : '撞掉一個！';
  if (m.stoppedBy === 'edge') return '滑到紙的邊邊停下來';
  if (m.stoppedBy === 'ally') return '撞到自己人，停下來了';
  return '什麼都沒撞到';
}
