// 一起一筆畫的電腦：管另一個軸，你帶路、它跟。
// 它看你的軸值，在目標圖上找「同一條垂直/水平帶上」的點，挑最順的那個（照目前速度往前推一點），
// 慢慢移過去。找不到就往最近的線靠。難度 = 移動速度 + 手抖 + 反應快慢。
import type { BotFactory } from '@sdk/types';
import { clamp, gauss } from '../shared/bot';
import type { Msg } from './Game';
import { AXIS_MS, COUNT_MS, axisFor, type Axis, type Target } from './logic';

const SKILL = [
  { speed: 0.55, jitter: 0.012, look: 0.08 },
  { speed: 0.9, jitter: 0.006, look: 0.12 },
  { speed: 1.5, jitter: 0.002, look: 0.16 },
];
/** 跟你的軸差多少以內的點算「在同一條帶上」 */
const BAND = 0.03;

export const twohandBot: BotFactory = (ctx) => {
  const skill = SKILL[ctx.difficulty];
  let round = 0;
  let axis: Axis = 'y';
  let U: Float32Array = new Float32Array(0); // 你那個軸的座標
  let W: Float32Array = new Float32Array(0); // 我這個軸的座標
  let h = 0.5; // 你的軸值
  let v = 0.5; // 我的軸值
  let vel = 0;
  let loop = 0;
  let last = 0;

  const stop = () => { ctx.cancel(loop); loop = 0; };

  const want = () => {
    const pred = v + vel * skill.look;
    let best = -1;
    let bestCost = Infinity;
    for (let i = 0; i < U.length; i++) {
      const du = Math.abs(U[i] - h);
      if (du > BAND) continue;
      const cost = Math.abs(W[i] - pred) + du * 0.6;
      if (cost < bestCost) { bestCost = cost; best = i; }
    }
    if (best >= 0) return W[best];
    // 帶上沒有點：往最近的線靠（筆會空走一段，跟真人一樣）
    let d2 = Infinity;
    for (let i = 0; i < U.length; i++) {
      const d = (U[i] - h) ** 2 + (W[i] - v) ** 2;
      if (d < d2) { d2 = d; best = i; }
    }
    return best >= 0 ? W[best] : v;
  };

  const tick = () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const target = clamp(want() + gauss() * skill.jitter, 0, 1);
    const maxStep = skill.speed * dt;
    const step = clamp(target - v, -maxStep, maxStep);
    const nv = clamp(v + step, 0, 1);
    vel = vel * 0.6 + ((nv - v) / Math.max(dt, 1e-3)) * 0.4;
    v = nv;
    ctx.send({ t: 'd:axis', v } satisfies Msg);
  };

  const start = (n: number, t: Target, cfg: { dur: number; swap: boolean }) => {
    stop();
    round = n;
    axis = axisFor(ctx.side, n, cfg.swap);
    U = new Float32Array(t.pts.map((p) => (axis === 'y' ? p[0] : p[1])));
    W = new Float32Array(t.pts.map((p) => (axis === 'y' ? p[1] : p[0])));
    h = 0.5; v = 0.5; vel = 0;
    last = performance.now();
    loop = ctx.every(tick, AXIS_MS);
    // 時間到了等房主（玩家）算分；保險起見多等一下就停
    const r = round;
    ctx.later(() => { if (round === r) stop(); }, COUNT_MS + cfg.dur * 1000 + 1500);
  };

  return {
    onMessage(m: Msg) {
      switch (m.t) {
        case 'd:round': start(m.n, m.target, m.cfg); break;
        case 'd:axis': h = m.v; break;
        case 'd:end': if (m.n === round) stop(); break;
        case 'd:menu': stop(); break;
      }
    },
    dispose: stop,
  };
};
