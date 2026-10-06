// Per-device preferences (localStorage). useSyncExternalStore: every screen updates together.
import { useSyncExternalStore } from 'react';

export const AVATARS = ['🐱', '🐶', '🐰', '🐻', '🐼', '🦊', '🐸', '🐧', '🐢', '🦄', '🐥', '🐙', '🐨', '🐯', '🐷', '🐹', '🦦', '🐳', '🦖', '🍓', '🍑', '🌷', '⭐', '🌙'] as const;

export interface Prefs {
  avatar: string;
  /** 0–1 */
  volume: number;
  muted: boolean;
  haptics: boolean;
  /** Reduce motion: no confetti, shorter transitions. */
  calm: boolean;
  favorites: string[];
  /** Recently played game ids, newest first. */
  recent: string[];
  /** Last bot settings used in "play with bots". */
  botCount: number;
  botLevel: 0 | 1 | 2;
}

const KEY = 'prefs';
const defaults = (): Prefs => ({
  avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
  volume: 0.9,
  muted: false,
  haptics: true,
  calm: false,
  favorites: [],
  recent: [],
  botCount: 1,
  botLevel: 1,
});

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults(), ...JSON.parse(raw) };
  } catch {
    /* corrupted or private mode: defaults */
  }
  return defaults();
}

let state = load();
const subs = new Set<() => void>();

export const getPrefs = () => state;
export function setPrefs(patch: Partial<Prefs> | ((p: Prefs) => Partial<Prefs>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  subs.forEach((f) => f());
}
export function usePrefs() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state,
  );
}

export const toggleFavorite = (id: string) =>
  setPrefs((p) => ({ favorites: p.favorites.includes(id) ? p.favorites.filter((x) => x !== id) : [...p.favorites, id] }));
export const pushRecent = (id: string) => setPrefs((p) => ({ recent: [id, ...p.recent.filter((x) => x !== id)].slice(0, 6) }));
