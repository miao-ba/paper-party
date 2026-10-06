// 拔河的電腦：照難度的速度連點；「停」出現後反應不夠快就會手滑
import type { BotFactory } from '@sdk/types';
import { between } from '../shared/bot';
import type { Msg } from './Game';
import { MIN_TAP_GAP, STUN_MS, segmentAt, zeroTally, type Tally } from './logic';

/** 每秒點幾下、「停」出現後多久才放手（這段時間內點到會滑手的機率）、「拉」出現後多久才開始點 */
const SKILL = [
  { rate: 5.6, stopReact: 330, slip: 0.75, goReact: 380 },
  { rate: 7.0, stopReact: 240, slip: 0.55, goReact: 270 },
  { rate: 8.4, stopReact: 170, slip: 0.35, goReact: 190 },
];

export const tugBot: BotFactory = (ctx) => {
  const skill = SKILL[ctx.difficulty];
  let round = 0;
  let seed = '';
  let t0 = 0;
  let tally: Tally = zeroTally();
  let stunUntil = 0;
  let timer = 0;
  let running = false;

  const getReady = () => ctx.later(() => ctx.send({ t: 'w:ready', side: ctx.side } satisfies Msg), between(500, 1100));
  const stop = () => { running = false; ctx.cancel(timer); };
  const next = (ms: number) => { ctx.cancel(timer); timer = ctx.later(tap, Math.max(MIN_TAP_GAP + 5, ms)); };
  const interval = () => (1000 / skill.rate) * between(0.75, 1.25);

  const tap = () => {
    if (!running) return;
    const now = performance.now();
    if (now < t0) return next(t0 - now + skill.goReact * between(0.8, 1.3));
    if (now < stunUntil) return next(stunUntil - now + 60);
    const seg = segmentAt(seed, now - t0);
    if (seg.stop) {
      // 剛喊停：反應時間內手還在點
      if (now - t0 - seg.start < skill.stopReact && Math.random() < skill.slip) {
        tally = { ...tally, slips: tally.slips + 1 };
        stunUntil = now + STUN_MS;
        ctx.send({ t: 'w:tally', n: round, side: ctx.side, tally } satisfies Msg);
        return next(STUN_MS + 80);
      }
      return next(t0 + seg.end - now + skill.goReact * between(0.8, 1.3));
    }
    tally = { ...tally, pulls: tally.pulls + 1 };
    ctx.send({ t: 'w:tally', n: round, side: ctx.side, tally } satisfies Msg);
    next(interval());
  };

  getReady();
  return {
    onMessage(m: Msg) {
      switch (m.t) {
        case 'w:round':
          stop();
          round = m.n; seed = m.seed; t0 = m.t0;
          tally = zeroTally(); stunUntil = 0;
          running = true;
          next(t0 - performance.now() + skill.goReact * between(0.8, 1.3));
          break;
        case 'w:over':
          if (m.n === round) stop();
          break;
        case 'w:rematch':
          stop();
          getReady();
          break;
      }
    },
  };
};
