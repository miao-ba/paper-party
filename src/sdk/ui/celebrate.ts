// Confetti for wins (canvas-confetti), in the seat colours. Respects reduced motion.
import confetti from 'canvas-confetti';
import { getPrefs } from '../../platform/prefs';

const COLORS = ['#e8604c', '#2f9e95', '#f2c230', '#3a78d6', '#d0559a', '#fbf7ee'];
const reduce = () => getPrefs().calm || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** big: you won the match (both sides); small: a little burst in the middle. */
export function celebrate(kind: 'big' | 'small' = 'big') {
  if (reduce()) return;
  const base = { colors: COLORS, disableForReducedMotion: true, zIndex: 70, ticks: 220, scalar: 0.9 };
  if (kind === 'small') {
    void confetti({ ...base, particleCount: 45, spread: 70, startVelocity: 32, origin: { x: 0.5, y: 0.6 } });
    return;
  }
  const shoot = (x: number, angle: number) => void confetti({ ...base, particleCount: 70, angle, spread: 60, startVelocity: 55, origin: { x, y: 0.75 } });
  shoot(0.05, 60);
  shoot(0.95, 120);
  window.setTimeout(() => { shoot(0.2, 75); shoot(0.8, 105); }, 260);
}
