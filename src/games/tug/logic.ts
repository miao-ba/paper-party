// 拔河：純規則，不碰 React / 網路。
// 繩結位置 pos ∈ [-1, 1]，正 = 往 L 那邊、負 = 往 R；|pos| ≥ 1 分出勝負。
// 兩邊各自數自己的拉次數 / 滑手次數再互相廣播，pos 是這四個數的函數，順序無關、不用誰當權威。
import { hash } from '../shared/InkBlob';
import type { Side } from '../shared/layout';

export const WIN_ROUNDS = 2;
/** 每拉一下移動多少 */
export const PULL = 0.022;
/** 「停」的時候手滑：往對方那邊滑多少 + 呆多久 */
export const SLIP = 0.14;
export const STUN_MS = 900;
/** 兩下太近不算（防連點器 / 多指） */
export const MIN_TAP_GAP = 55;
/** 開場倒數 */
export const COUNT_MS = 2400;

export interface Tally {
  pulls: number;
  slips: number;
}
export const zeroTally = (): Tally => ({ pulls: 0, slips: 0 });

export function position(L: Tally, R: Tally): number {
  const p = (L.pulls - R.pulls) * PULL + (R.slips - L.slips) * SLIP;
  return Math.max(-1, Math.min(1, p));
}
export function winnerOf(pos: number): Side | null {
  return pos >= 1 ? 'L' : pos <= -1 ? 'R' : null;
}

export interface Segment {
  stop: boolean;
  /** 相對回合開始的毫秒 */
  start: number;
  end: number;
  idx: number;
}
/**
 * 拉 / 停 交替的時間表，由種子決定，兩邊各自算一樣。
 * 拉 2.2–5 秒、停 0.8–1.4 秒；第一段拉至少 1.6 秒讓人進入狀況。
 */
export function segmentAt(seed: string, t: number): Segment {
  const rnd = hash(`tug:${seed}`);
  let start = 0;
  let idx = 0;
  for (;;) {
    const stop = idx % 2 === 1;
    const dur = stop ? 800 + rnd() * 600 : (idx === 0 ? 1600 : 2200) + rnd() * 2800;
    const end = start + dur;
    if (t < end || idx > 400) return { stop, start, end, idx };
    start = end;
    idx++;
  }
}
