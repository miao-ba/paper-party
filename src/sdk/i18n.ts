// Tiny i18n. Two languages ship by default; adding one = add it to LANGS and to each dictionary
// (missing keys fall back to the first dictionary you wrote).
//
//   // in a game
//   const T = defineStrings({
//     'zh-TW': { yourTurn: '輪到你了', guessed: (n: number) => `猜了 ${n}` },
//     en:      { yourTurn: 'Your turn', guessed: (n: number) => `guessed ${n}` },
//   });
//   const t = T.use();            // inside a component
//   t.yourTurn; t.guessed(42);
import { useSyncExternalStore } from 'react';

export const LANGS = ['zh-TW', 'en'] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_LABEL: Record<Lang, string> = { 'zh-TW': '繁體中文', en: 'English' };

/** A plain string (same in every language) or one string per language. */
export type Localized = string | Partial<Record<Lang, string>>;
export type LocalizedList = string[] | Partial<Record<Lang, string[]>>;

const KEY = 'lang';
const detect = (): Lang => {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && (LANGS as readonly string[]).includes(saved)) return saved as Lang;
  } catch {
    /* private mode */
  }
  const nav = typeof navigator === 'undefined' ? 'en' : navigator.language;
  return /^zh/i.test(nav) ? 'zh-TW' : 'en';
};

let lang: Lang = typeof window === 'undefined' ? 'en' : detect();
const subs = new Set<() => void>();

export const getLang = () => lang;
export function setLang(l: Lang) {
  lang = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = l === 'zh-TW' ? 'zh-Hant' : l;
  subs.forEach((f) => f());
}
export function useLang(): Lang {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => lang,
  );
}

/** Pick the right language from a Localized value. */
export function tr(v: Localized | undefined, l: Lang = lang): string {
  if (v === undefined) return '';
  if (typeof v === 'string') return v;
  return v[l] ?? v.en ?? v['zh-TW'] ?? Object.values(v)[0] ?? '';
}
export function trList(v: LocalizedList | undefined, l: Lang = lang): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  return v[l] ?? v.en ?? v['zh-TW'] ?? Object.values(v)[0] ?? [];
}

/**
 * A typed dictionary per language. The first language you list is the fallback for missing keys.
 * `T.use()` re-renders on language change; `T.get()` reads it outside React.
 */
export function defineStrings<D extends Record<string, unknown>>(dicts: { [K in Lang]?: D }) {
  const first = Object.values(dicts)[0] as D;
  const merged = Object.fromEntries(LANGS.map((l) => [l, { ...first, ...(dicts[l] ?? {}) }])) as Record<Lang, D>;
  return {
    use: (): D => merged[useLang()],
    get: (l: Lang = lang): D => merged[l],
  };
}
