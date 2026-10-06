// Vibration. Android: navigator.vibrate. iOS Safari has no vibrate API, but iOS 17.4+ gives haptic
// feedback when an <input type="checkbox" switch> is toggled — so we toggle a hidden one (one tick per call).
import { getPrefs } from '../prefs';

const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let sw: HTMLInputElement | null = null;
function iosTap() {
  if (!sw) {
    sw = document.createElement('input');
    sw.type = 'checkbox';
    sw.setAttribute('switch', '');
    sw.style.cssText = 'position:fixed;left:-9999px;opacity:0;pointer-events:none';
    document.body.appendChild(sw);
  }
  sw.click();
}

export type Haptic = 'light' | 'medium' | 'heavy' | 'double' | 'triple';
const PATTERN: Record<Haptic, number[]> = {
  light: [15],
  medium: [40],
  heavy: [90],
  double: [40, 50, 40],
  triple: [30, 40, 30, 40, 80],
};

export function haptic(kind: Haptic = 'medium') {
  if (!getPrefs().haptics) return;
  try {
    if (isIOS) {
      const n = kind === 'double' ? 2 : kind === 'triple' ? 3 : 1;
      for (let i = 0; i < n; i++) window.setTimeout(iosTap, i * 90);
      return;
    }
    navigator.vibrate?.(PATTERN[kind]);
  } catch {
    /* desktop / unsupported */
  }
}
