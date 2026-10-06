import type { ComponentType, LazyExoticComponent } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Localized, LocalizedList } from './i18n';
import type { GameLogic } from './logic';

export type GameTag = 'versus' | 'coop' | 'party' | 'realtime' | 'turn' | 'bluff' | 'luck' | 'voice' | 'chill';

/**
 * A setting the host can change in the waiting room. The platform renders it; your game reads the
 * chosen value from `useRoom().options[key]` (and `setup({ options })` for engine games).
 */
export type OptionSpec =
  | { key: string; label: Localized; type: 'select'; choices: { value: string | number; label: Localized }[]; default: string | number }
  | { key: string; label: Localized; type: 'toggle'; default: boolean };

export interface GameMeta {
  /** kebab-case, unique, never change it after release (stats are keyed by it). */
  id: string;
  name: Localized;
  /** One line under the name. */
  tagline: Localized;
  icon: LucideIcon;
  /** Card colour as an HSL hue 0–360. */
  hue: number;
  /** Seats: the host can start once `min` players (humans + bots) are seated. */
  players: { min: number; max: number };
  tags: GameTag[];
  /** Typical match length, display only, e.g. '3–5'. */
  minutes: string;
  /** How to play: 3–5 short lines. Shown in the lobby and in the in-game menu. */
  howto: LocalizedList;
  /** Host settings shown in the waiting room. */
  options?: OptionSpec[];
  /**
   * Bots: whether there are difficulty levels (0/1/2) worth choosing, and optionally one line on what
   * playing with bots is like (shown on the "play with bots" card). Omit if the game has no bot.
   */
  bots?: { levels: boolean; desc?: Localized };
  /**
   * People who join while a game is running watch it (true) or wait in a "game in progress" screen
   * (false, default). Engine games can say true for free: spectators get `view(state, null)`.
   */
  spectators?: boolean;
  /**
   * Message-based games only: keep playing when a player leaves for good (you handle `players`
   * changing). Default false = everyone returns to the waiting room.
   */
  continueOnLeave?: boolean;
}

export interface GameModule {
  meta: GameMeta;
  /** `lazy(() => import('./Game'))` so every game is its own chunk. */
  Game: ComponentType | LazyExoticComponent<ComponentType>;
  /** Start downloading the game code early (the lobby calls it on hover / when you open a room). */
  preload?: () => Promise<unknown>;
  /** Engine games: the pure logic (lets `npm test` simulate the game with bots). */
  logic?: GameLogic<any, any, any>;
  /** Message-based games: the bot that plays a bot seat (runs in the host's browser). */
  bot?: BotFactory;
}

export interface Player {
  id: string;
  name: string;
  avatar: string | null;
  /** Seat order among players (spectators: -1). */
  index: number;
  color: string;
  bot: boolean;
  level: 0 | 1 | 2;
  online: boolean;
  spectator: boolean;
  isHost: boolean;
  isMe: boolean;
}

/**
 * Low-level bot for message-based games. It is "another player": it receives what players `send`
 * and answers with `ctx.send`, so Game.tsx needs no special bot code. Runs in the host's browser.
 */
export interface BotCtx {
  id: string;
  name: string;
  level: 0 | 1 | 2;
  /** Seat order (0-based). */
  index: number;
  /** 2-player ports (see @sdk/duo): the host is 'L', so a bot is always 'R'. */
  side: 'L' | 'R';
  /** Alias of level (2-player version compatibility). */
  difficulty: 0 | 1 | 2;
  options: Record<string, any>;
  /** Current seats (players, not spectators). */
  players: () => Player[];
  hostId: () => string;
  /** Broadcast (or `to` one seat), exactly like a player's `send`. */
  send: (msg: unknown, to?: string) => void;
  /** Timers that are cleared automatically when the bot is disposed. */
  later: (fn: () => void, ms: number) => number;
  every: (fn: () => void, ms: number) => number;
  cancel: (id: number) => void;
}
export interface Bot {
  onMessage: (msg: any, from: string) => void;
  dispose?: () => void;
}
export type BotFactory = (ctx: BotCtx) => Bot;

/** Identity helper for a game's index.ts (gives type checking without importing React-heavy code). */
export const defineGame = (mod: GameModule): GameModule => mod;

export const TAG_LABEL: Record<GameTag, Localized> = {
  versus: { 'zh-TW': '對戰', en: 'Versus' },
  coop: { 'zh-TW': '合作', en: 'Co-op' },
  party: { 'zh-TW': '派對', en: 'Party' },
  realtime: { 'zh-TW': '即時', en: 'Real-time' },
  turn: { 'zh-TW': '回合制', en: 'Turn-based' },
  bluff: { 'zh-TW': '心理戰', en: 'Bluffing' },
  luck: { 'zh-TW': '運氣', en: 'Luck' },
  voice: { 'zh-TW': '要開語音', en: 'Voice chat' },
  chill: { 'zh-TW': '輕鬆', en: 'Chill' },
};
