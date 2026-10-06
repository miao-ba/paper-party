// 牛仔決鬥的電腦：一開房就準備好；拔槍時間到了照難度的反應時間開槍，偶爾太早自爆
import type { BotFactory } from '@sdk/types';
import { between, gauss } from '../shared/bot';
import type { Msg } from './Game';
import { SLOW_MS, type Shot } from './logic';

/** 平均反應（ms）、標準差、太早拔槍的機率 */
const SKILL = [
  { mean: 430, sd: 70, early: 0.14 },
  { mean: 320, sd: 45, early: 0.07 },
  { mean: 250, sd: 28, early: 0.03 },
];

export const duelBot: BotFactory = (ctx) => {
  const skill = SKILL[ctx.difficulty];
  let pending = 0;
  const getReady = () => ctx.later(() => ctx.send({ t: 'ready', side: ctx.side } satisfies Msg), between(500, 1100));
  getReady();

  return {
    onMessage(m: Msg) {
      if (m.t === 'round') {
        ctx.cancel(pending);
        // 單人時對方（玩家）是房主，drawAt 就是這個分頁的 performance.now()
        const now = performance.now();
        let at: number;
        let shot: Shot;
        if (Math.random() < skill.early) {
          const early = between(120, 900);
          at = Math.max(now + 200, m.drawAt - early);
          shot = { reaction: Math.round(at - m.drawAt), early: true };
        } else {
          const r = Math.max(165, skill.mean + gauss() * skill.sd);
          at = m.drawAt + r;
          shot = { reaction: Math.round(Math.min(SLOW_MS, r)), early: false };
        }
        pending = ctx.later(() => ctx.send({ t: 'shot', n: m.n, side: ctx.side, shot } satisfies Msg), Math.max(0, at - now));
      } else if (m.t === 'rematch') {
        ctx.cancel(pending);
        getReady();
      }
    },
  };
};
