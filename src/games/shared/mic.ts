// 麥克風音量 → 0–1 的 level。只在安全來源（https / localhost）能用。
import { useEffect, useRef, useState } from 'react';

export type MicStatus = 'off' | 'asking' | 'on' | 'denied' | 'insecure';

/** 對應到 0–1 的 dB 範圍：安靜房間約 -45，講話 -25，大叫 -10 */
const DB_FLOOR = -42;
const DB_CEIL = -14;

export function useMic() {
  const [status, setStatus] = useState<MicStatus>(() => (typeof navigator !== 'undefined' && navigator.mediaDevices ? 'off' : 'insecure'));
  /** 平滑後的音量 0–1，每幀讀 */
  const level = useRef(0);
  const ctxRef = useRef<{ ac: AudioContext; an: AnalyserNode; stream: MediaStream; buf: Float32Array<ArrayBuffer>; raf: number } | null>(null);

  const start = async () => {
    if (ctxRef.current || status === 'asking') return;
    if (!navigator.mediaDevices?.getUserMedia) { setStatus('insecure'); return; }
    setStatus('asking');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const ac = new AudioContext();
      await ac.resume();
      const an = ac.createAnalyser();
      an.fftSize = 1024;
      ac.createMediaStreamSource(stream).connect(an);
      const buf = new Float32Array(an.fftSize);
      const st = { ac, an, stream, buf, raf: 0 };
      ctxRef.current = st;
      // dev 測試用：window.__mic.level / ac.state
      if (import.meta.env.DEV) (window as any).__mic = { get level() { return level.current; }, ac };
      const tick = () => {
        st.raf = requestAnimationFrame(tick);
        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        const db = 20 * Math.log10(rms + 1e-8);
        const target = Math.max(0, Math.min(1, (db - DB_FLOOR) / (DB_CEIL - DB_FLOOR)));
        // 上升快、下降慢一點，比較好控
        level.current += (target - level.current) * (target > level.current ? 0.5 : 0.18);
      };
      tick();
      setStatus('on');
    } catch {
      setStatus('denied');
    }
  };
  const stop = () => {
    const st = ctxRef.current;
    if (!st) return;
    cancelAnimationFrame(st.raf);
    st.stream.getTracks().forEach((t) => t.stop());
    void st.ac.close();
    ctxRef.current = null;
    level.current = 0;
    setStatus('off');
  };
  useEffect(() => stop, []);
  return { status, level, start, stop };
}
