// 烏龜對對碰（對拚版）：純規則，不碰 React / 網路。
// 兩人同一個種子：第 k 包拆出什麼顏色兩邊一樣（colorOf），差別只在許願色、擺哪格、什麼時候開獎。
// 每人一個九宮格：拆一包 → 擺進空格 → 格子滿了自動開獎，沒滿也可以自己按開獎。
// 開獎：全家福（滿格九色都不同）整盤收走；不然先收三連（同色連成一線），剩下的同色兩兩對碰收走。
// 收走的格子空出來繼續擺；包拆完而且沒東西可碰就結束，拆過幾包 = 拿到幾隻 = 分數。
import { hash } from '../shared/InkBlob';
import type { Side } from '../shared/layout';

export type { Side };

export const COLORS = [
  { name: '紅', hex: '#e5483b' },
  { name: '橘', hex: '#f08a24' },
  { name: '黃', hex: '#f2c230' },
  { name: '綠', hex: '#5cb54a' },
  { name: '青', hex: '#22a99c' },
  { name: '藍', hex: '#3a78d6' },
  { name: '紫', hex: '#8b5ad1' },
  { name: '粉', hex: '#f07fae' },
  { name: '棕', hex: '#93623a' },
  { name: '黑', hex: '#3b3946' },
] as const;
export const N_COLORS = COLORS.length;

/** 九宮格的 8 條線：三橫、三直、兩斜 */
export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
] as const;

/** 各種獎勵加幾包 */
export const REWARD = { wish: 1, pair: 1, line: 5, family: 8, clear: 10 };
/** 房主可選的開局包數 */
export const PACKS = [9, 18, 27] as const;

export type Cell = number | null;
export interface Stats { wish: number; pair: number; line: number; family: number; clear: number }
export interface Board {
  cells: Cell[];
  /** 剛拆出來、還沒擺的那隻 */
  hand: number | null;
  /** 已拆幾包 = 下一包的編號 = 拿到幾隻（分數） */
  opened: number;
  /** 還沒拆的 */
  bags: number;
  wish: number;
  stats: Stats;
}

export interface Result {
  /** 三連的格子（每條線一組） */
  lines: number[][];
  /** 對碰的兩格 */
  pairs: number[][];
  family: boolean;
  clear: boolean;
  removed: number[];
  gain: number;
}

export const zeroStats = (): Stats => ({ wish: 0, pair: 0, line: 0, family: 0, clear: 0 });

export function newBoard(packs: number, wish: number): Board {
  return { cells: Array(9).fill(null), hand: null, opened: 0, bags: packs, wish, stats: zeroStats() };
}

/** 第 k 包的顏色，兩邊各自算一樣 */
export function colorOf(seed: string, k: number) {
  return Math.floor(hash(`turtle:${seed}:${k}`)() * N_COLORS);
}

export const isFull = (cells: Cell[]) => cells.every((c) => c !== null);

/** 現在開獎會發生什麼（不改盤面） */
export function evaluate(cells: Cell[]): Result {
  const full = isFull(cells);
  if (full && new Set(cells).size === 9) {
    return { lines: [], pairs: [], family: true, clear: false, removed: cells.map((_, i) => i), gain: REWARD.family };
  }
  const lines = LINES.filter(([a, b, c]) => cells[a] !== null && cells[a] === cells[b] && cells[b] === cells[c]).map((l) => [...l]);
  const gone = new Set<number>(lines.flat());
  const pairs: number[][] = [];
  const waiting = new Map<number, number>(); // 顏色 → 還沒配到的格子
  cells.forEach((c, i) => {
    if (c === null || gone.has(i)) return;
    const j = waiting.get(c);
    if (j === undefined) waiting.set(c, i);
    else { pairs.push([j, i]); waiting.delete(c); }
  });
  pairs.forEach((p) => p.forEach((i) => gone.add(i)));
  const clear = full && gone.size === 9;
  const gain = lines.length * REWARD.line + pairs.length * REWARD.pair + (clear ? REWARD.clear : 0);
  return { lines, pairs, family: false, clear, removed: [...gone].sort((a, b) => a - b), gain };
}

export const canOpen = (b: Board) => b.hand === null && b.bags > 0 && !isFull(b.cells);
export const canPlace = (b: Board, i: number) => b.hand !== null && b.cells[i] === null;
export const canSettle = (b: Board) => b.hand === null && evaluate(b.cells).gain > 0;
/** 滿格或包拆完了，有東西可碰就一定要開 */
export const mustSettle = (b: Board) => canSettle(b) && (isFull(b.cells) || b.bags === 0);
export const finished = (b: Board) => b.hand === null && b.bags === 0 && evaluate(b.cells).gain === 0;

export function open(b: Board, seed: string): { board: Board; wished: boolean } {
  if (!canOpen(b)) return { board: b, wished: false };
  const color = colorOf(seed, b.opened);
  const wished = color === b.wish;
  return {
    board: {
      ...b,
      hand: color,
      opened: b.opened + 1,
      bags: b.bags - 1 + (wished ? REWARD.wish : 0),
      stats: wished ? { ...b.stats, wish: b.stats.wish + 1 } : b.stats,
    },
    wished,
  };
}

export function place(b: Board, i: number): Board {
  if (!canPlace(b, i)) return b;
  const cells = [...b.cells];
  cells[i] = b.hand;
  return { ...b, cells, hand: null };
}

export function settle(b: Board): { board: Board; result: Result } {
  const result = evaluate(b.cells);
  if (b.hand !== null || result.gain === 0) return { board: b, result };
  const cells = b.cells.map((c, i) => (result.removed.includes(i) ? null : c));
  const s = b.stats;
  const stats: Stats = {
    ...s,
    pair: s.pair + result.pairs.length,
    line: s.line + result.lines.length,
    family: s.family + (result.family ? 1 : 0),
    clear: s.clear + (result.clear ? 1 : 0),
  };
  return { board: { ...b, cells, bags: b.bags + result.gain, stats }, result };
}

/** 結果的短句，給 toast / 對方看 */
export function resultText(r: Result) {
  const parts: string[] = [];
  if (r.family) parts.push('全家福');
  if (r.lines.length) parts.push(r.lines.length > 1 ? `三連×${r.lines.length}` : '三連');
  if (r.pairs.length) parts.push(r.pairs.length > 1 ? `對碰×${r.pairs.length}` : '對碰');
  if (r.clear) parts.push('清台');
  return `${parts.join('＋')} +${r.gain}`;
}

/** 斷線重連比誰的比較新：拆越多越新 */
export const progress = (b: Board | null) => (b ? b.opened * 100 + (b.hand !== null ? 50 : 0) + b.cells.filter((c) => c !== null).length : -1);

export function winnerOf(boards: Record<Side, Board>): Side | null {
  if (boards.L.opened === boards.R.opened) return null;
  return boards.L.opened > boards.R.opened ? 'L' : 'R';
}
