// DEV ONLY. Browsers pause requestAnimationFrame in background tabs / hidden windows, which freezes
// framer-motion transitions — annoying when you test multiplayer with several tabs side by side.
// In dev, every rAF also gets a 50 ms timeout fallback, so background tabs keep moving (slowly), and
// while frames are stalled we tell motion.ts to skip animations (Web Animations never finish then).
// Must be imported before anything that captures requestAnimationFrame (framer-motion does).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const native = window.requestAnimationFrame.bind(window);
  const cancelNative = window.cancelAnimationFrame.bind(window);
  const pending = new Map<number, { raf: number; timer: number }>();
  let next = 1;
  let stalled = false;
  const setStalled = (v: boolean) => {
    if (v === stalled) return;
    stalled = v;
    window.dispatchEvent(new CustomEvent('dev:frames-stalled', { detail: v }));
  };
  window.requestAnimationFrame = (cb: FrameRequestCallback) => {
    const id = next++;
    const fire = (t: number, real: boolean) => {
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      cancelNative(p.raf);
      window.clearTimeout(p.timer);
      setStalled(!real);
      cb(t);
    };
    pending.set(id, { raf: native((t) => fire(t, true)), timer: window.setTimeout(() => fire(performance.now(), false), 50) });
    return id;
  };
  window.cancelAnimationFrame = (id: number) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    cancelNative(p.raf);
    window.clearTimeout(p.timer);
  };
}
export {};
