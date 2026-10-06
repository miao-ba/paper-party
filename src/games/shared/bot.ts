// Bot helpers for the games ported from the two-player app (same names as before, backed by @sdk/logic).
export { between, clamp, gauss, oneAtATime, silentBot } from '@sdk/logic';
export const pickOne = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
