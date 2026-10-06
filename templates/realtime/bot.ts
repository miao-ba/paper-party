// The bot for __NAME__: says ready, then taps at a human-ish speed once the race starts.
// It runs in the host's browser: the host clock is its clock.
import { between } from '@sdk/logic';
import type { BotFactory } from '@sdk/types';
import type { Msg } from './logic';

const TAPS_PER_SECOND = [5, 7, 9];

export const bot: BotFactory = (ctx) => {
  let n = 0;
  let timer = 0;
  ctx.later(() => ctx.send({ t: 'tr:ready' } satisfies Msg), between(400, 1200));
  const tap = () => {
    n += 1;
    ctx.send({ t: 'tr:count', n } satisfies Msg);
    timer = ctx.later(tap, 1000 / (TAPS_PER_SECOND[ctx.level] * between(0.8, 1.2)));
  };
  return {
    onMessage(m: Msg) {
      if (m.t === 'tr:start') timer = ctx.later(tap, Math.max(0, m.at - performance.now()) + between(150, 350));
      if (m.t === 'tr:win') ctx.cancel(timer);
    },
  };
};
