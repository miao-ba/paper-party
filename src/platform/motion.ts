// Hidden tabs (phone switched apps, background tab) do not finish Web Animations, and an unfinished
// exit animation holds <AnimatePresence mode="wait"> screen switches. Skip animations while hidden so
// the new screen is already there when the player comes back. (Dev also skips while frames are stalled,
// see devFrames.ts.)
import { MotionGlobalConfig } from 'framer-motion';

let stalled = false;
const sync = () => {
  MotionGlobalConfig.skipAnimations = document.visibilityState === 'hidden' || stalled;
};
sync();
document.addEventListener('visibilitychange', sync);
window.addEventListener('dev:frames-stalled', (e) => {
  stalled = (e as CustomEvent<boolean>).detail;
  sync();
});
