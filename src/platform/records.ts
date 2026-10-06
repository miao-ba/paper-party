// Match history, stored on THIS device only (a public server should not keep everybody's history).
// Games never touch this directly: they call useRoom().report(result) (the state engine does it for you).
import { useSyncExternalStore } from 'react';

export interface MatchRecord {
  id: string;
  game: string;
  /** End time (ms). */
  at: number;
  /** Duration (ms). */
  dur: number;
  /** Solo vs bots in this tab (no server). */
  local: boolean;
  players: { name: string; avatar: string | null; bot: boolean; me: boolean; won: boolean; score?: number | string }[];
  /** true / false, or null for co-op and draws. */
  won: boolean | null;
  coop: boolean;
  draw: boolean;
  value?: number;
}

const KEY = 'history';
const MAX = 400;
let records: MatchRecord[] = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as MatchRecord[];
  } catch {
    return [];
  }
})();
const subs = new Set<() => void>();
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(records.slice(0, MAX)));
  } catch {
    /* quota: ignore */
  }
  subs.forEach((f) => f());
};

export function addRecord(r: MatchRecord) {
  records = [r, ...records].slice(0, MAX);
  save();
}
export function clearRecords() {
  records = [];
  save();
}
export function useRecords() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => records,
  );
}

export interface GameStats {
  plays: number;
  wins: number;
  losses: number;
  best: number | null;
}
export function statsByGame(list: MatchRecord[]) {
  const m = new Map<string, GameStats>();
  for (const r of list) {
    const s = m.get(r.game) ?? { plays: 0, wins: 0, losses: 0, best: null };
    s.plays++;
    if (r.won === true) s.wins++;
    if (r.won === false) s.losses++;
    if (r.value !== undefined && (s.best === null || r.value > s.best)) s.best = r.value;
    m.set(r.game, s);
  }
  return m;
}
