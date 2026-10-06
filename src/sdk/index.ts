// ┌──────────────────────────────────────────────────────────────────────────┐
// │  @sdk — everything a game's Game.tsx may import.                          │
// │  Pure logic helpers (no React) live in '@sdk/logic'; metadata types and   │
// │  defineGame in '@sdk/types'. index.ts / logic.ts / bot.ts must only use   │
// │  those two, so `npm test` can load them in Node.                          │
// └──────────────────────────────────────────────────────────────────────────┘

// Room & messages
export { useRoom, useMessage, useHostClock, type RoomApi } from './room';
// State engine (host-authoritative reducer)
export { useGameState, type GameState } from './engine';
// i18n
export { defineStrings, useLang, tr, trList, type Lang, type Localized } from './i18n';
// Logic & types (re-exported for convenience in Game.tsx)
export * from './logic';
export * from './types';
export { SEAT_COLORS, seatColor } from './colors';
// UI kit
export { Button } from './ui/Button';
export { Avatar } from './ui/Avatar';
export { Sheet } from './ui/Sheet';
export { GameIcon } from './ui/GameIcon';
export { GameHeader, PlayerChip, MuteButton, type HeaderPlayer } from './ui/GameHeader';
export { GameOver } from './ui/GameOver';
export { OfflineBanner, Waiting, Countdown, TurnBanner, Delayed } from './ui/Status';
export { useRipples } from './ui/ripples';
export { celebrate } from './ui/celebrate';
export { useSize, usePortrait } from './ui/layout';
// Feedback
export { sfx } from '../platform/audio/sfx';
export { haptic, type Haptic } from '../platform/audio/haptic';
// Storage (generic server key-value + image upload; may be disabled on some servers)
export { kv, uploadImage } from './storage';
