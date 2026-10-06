// The Quick Draw bot: ready after a moment, then "reacts" to each round with a human-ish reaction time.
// It runs in the host's browser, so the host clock IS its clock (drawAt needs no conversion).
import { between, gauss } from '@sdk/logic';
import type { BotFactory } from '@sdk/types';
import type { Msg } from './logic';

/** Mean reaction (ms), spread, chance to jump the gun, chance to fall for the decoy. */
const SKILL = [
  { mean: 430, sd: 70, early: 0.1, fooled: 0.35 },
  { mean: 320, sd: 45, early: 0.05, fooled: 0.15 },
  { mean: 255, sd: 28, early: 0.02, fooled: 0.05 },
];

export const quickDrawBot: BotFactory = (ctx) => {
  const skill = SKILL[ctx.level];
  let pending = 0;
  ctx.later(() => ctx.send({ t: 'qd:ready' } satisfies Msg), between(400, 1200));

  return {
    onMessage(m: Msg) {
      if (m.t !== 'qd:round') return;
      ctx.cancel(pending);
      const now = performance.now();
      const shoot = (at: number, ms: number, early: boolean) => {
        pending = ctx.later(() => ctx.send({ t: 'qd:shot', n: m.n, shot: { ms: Math.round(ms), early } } satisfies Msg), Math.max(0, at - now));
      };
      if (m.fakeAt !== null && Math.random() < skill.fooled) return shoot(m.fakeAt + between(250, 450), -1, true);
      if (Math.random() < skill.early) return shoot(Math.max(now + 300, m.drawAt - between(150, 900)), -1, true);
      const r = Math.max(160, skill.mean + gauss() * skill.sd);
      shoot(m.drawAt + r, r, false);
    },
  };
};
