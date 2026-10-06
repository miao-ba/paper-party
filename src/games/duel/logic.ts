import type { Side } from '../shared/layout';

export const WIN_SCORE = 3;
export const DRAW_DELAY = { min: 1500, max: 5500 }; // 「準備」到「拔槍」的隨機等待
export const SLOW_MS = 2000; // 超過這個沒按就算沒反應

export interface Shot {
  reaction: number; // ms；負數 = 拔槍前就按了
  early: boolean;
}
export type Outcome = { winner: Side | null; reason: 'faster' | 'early' | 'both-early' | 'tie' | 'both-slow' };

export function resolve(L: Shot, R: Shot): Outcome {
  if (L.early && R.early) return { winner: null, reason: 'both-early' };
  if (L.early) return { winner: 'R', reason: 'early' };
  if (R.early) return { winner: 'L', reason: 'early' };
  if (L.reaction >= SLOW_MS && R.reaction >= SLOW_MS) return { winner: null, reason: 'both-slow' };
  if (L.reaction === R.reaction) return { winner: null, reason: 'tie' };
  return { winner: L.reaction < R.reaction ? 'L' : 'R', reason: 'faster' };
}

export function outcomeText(o: Outcome, mySide: Side, names: Record<Side, string>): string {
  if (o.reason === 'both-early') return '兩個都太早，雙雙自爆';
  if (o.reason === 'both-slow') return '兩個都在發呆…';
  if (o.reason === 'tie') return '完全同時！平手';
  const w = o.winner!;
  const loser = w === 'L' ? 'R' : 'L';
  if (o.reason === 'early') return `${names[loser]} 太早拔槍，自爆了`;
  return w === mySide ? '你比較快！' : `${names[w]} 比較快`;
}
