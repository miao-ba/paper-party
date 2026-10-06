// 盲飛的電腦。單人時你是房主（L），看模式決定電腦做什麼：
// - 合作：你開的時候它當塔台（看全圖、按上/下警示）；換它開的時候它只看得到霧裡的距離，
//   看不到的地方就照你按的上/下調高度——你變成塔台，指揮一台盲飛的電腦
// - 雙駕駛：它飛自己那台，也幫你的鳥按警示；你按警示它也會聽
// - 競技：它飛自己那台比遠
// 誰開誰算（跟兩人玩一樣）：它開的鳥每 50ms 廣播 f:bird，拍翅膀另送 f:flap，生死它說了算。
import type { BotFactory } from '@sdk/types';
import { gauss } from '../shared/bot';
import type { BirdId, Msg } from './Game';
import { clampAlt, nextPipe, shouldFlap, towerCall } from './autopilot';
import { DEFAULT_CONFIG, FOG_DIST, WORLD_H, flap, isDual, newBird, pilotFor, step, type Bird, type Config } from './logic';

/** 每根管子瞄準的誤差、失手（大偏）的機率、兩次拍翅膀最短間隔（秒）、塔台多久喊一次（ms） */
const SKILL = [
  { sd: 22, blunder: 0.09, cooldown: 0.13, call: 650 },
  { sd: 16, blunder: 0.035, cooldown: 0.1, call: 480 },
  { sd: 10, blunder: 0.012, cooldown: 0.08, call: 360 },
];
const COUNT_MS = 2400;
const NET_MS = 50;
/** 收到一次上/下警示，盲飛時目標高度調多少 */
const ALERT_SHIFT = 75;

export const blindflyBot: BotFactory = (ctx) => {
  const me = ctx.side;
  const skill = SKILL[ctx.difficulty];
  let config: Config = DEFAULT_CONFIG;
  let seed = '';
  let phase: 'lobby' | 'count' | 'fly' | 'over' = 'lobby';
  let flyAt = 0;
  let birds: Partial<Record<BirdId, Bird>> = {};
  let last = 0;
  let lastNet = 0;
  let lastFlap = 0;
  let lastCall = 0;
  /** 盲飛的記憶高度（看得到管子時更新、收到警示時調） */
  let mem = WORLD_H / 2;
  /** 看得到管子時，你的警示只會暫時推它一下（會慢慢消掉） */
  let nudge = 0;
  let nudgeAt = 0;
  const plans = new Map<number, number>();

  const controls = (id: BirdId) => (id === 'S' ? pilotFor(config, birds.S?.score ?? 0) === me : id === me);
  const vision = () => (config.mode === 'race' && config.raceView === 'side' ? Infinity : FOG_DIST[config.fog]);

  const pilot = (id: BirdId, b: Bird, now: number) => {
    const { i, pipe } = nextPipe(seed, b.x);
    if (!plans.has(i)) {
      const miss = Math.random() < skill.blunder ? (Math.random() < 0.5 ? -1 : 1) * (95 + Math.random() * 40) : 0;
      plans.set(i, gauss() * skill.sd + miss);
    }
    const n = nudge * Math.max(0, 1 - (now - nudgeAt) / 1400);
    if (pipe.x - b.x <= vision()) mem = clampAlt(pipe.gapY + plans.get(i)! + n);
    if ((now - lastFlap) / 1000 > skill.cooldown && shouldFlap(b, mem)) {
      lastFlap = now;
      birds[id] = flap(b);
      ctx.send({ t: 'f:flap', id } satisfies Msg);
    }
  };

  const tick = () => {
    const now = performance.now();
    if (phase === 'count' && now >= flyAt) { phase = 'fly'; last = now; }
    if (phase !== 'fly') return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const id of Object.keys(birds) as BirdId[]) {
      const cur = birds[id]!;
      if (!cur.alive) continue;
      if (controls(id)) {
        pilot(id, cur, now);
        const next = step(birds[id]!, dt, seed);
        birds[id] = next;
        if (!next.alive) ctx.send({ t: 'f:bird', id, bird: next } satisfies Msg);
      } else {
        // 玩家開的：照樣推算，生死聽玩家的
        birds[id] = { ...step(cur, dt, seed), alive: true };
        // 塔台：合作模式你開的時候、雙駕駛幫你的那台
        const tower = config.mode === 'dual' || config.mode === 'solo';
        if (tower && config.alert && now - lastCall > skill.call) {
          const call = towerCall(birds[id]!, seed);
          if (call) { lastCall = now; ctx.send({ t: 'f:alert', dir: call } satisfies Msg); }
        }
      }
    }
    if (now - lastNet >= NET_MS) {
      lastNet = now;
      for (const id of Object.keys(birds) as BirdId[]) {
        if (controls(id) && birds[id]!.alive) ctx.send({ t: 'f:bird', id, bird: birds[id]! } satisfies Msg);
      }
    }
    if (Object.values(birds).every((b) => !b!.alive)) phase = 'over';
  };
  ctx.every(tick, 16);

  return {
    onMessage(m: Msg) {
      switch (m.t) {
        case 'f:config':
          config = m.config;
          break;
        case 'f:start':
          config = m.config;
          seed = m.seed;
          birds = isDual(config) ? { L: newBird(), R: newBird() } : { S: newBird() };
          plans.clear();
          mem = WORLD_H / 2;
          nudge = 0;
          phase = 'count';
          flyAt = performance.now() + COUNT_MS - 20;
          break;
        case 'f:bird':
          if (phase === 'fly' && !controls(m.id)) birds[m.id] = m.bird;
          break;
        case 'f:flap':
          if (phase === 'fly' && !controls(m.id) && birds[m.id]) birds[m.id] = flap(birds[m.id]!);
          break;
        case 'f:alert':
          // 你在指揮：看不到管子的時候就靠這個
          mem = clampAlt(mem + (m.dir === 'up' ? -ALERT_SHIFT : ALERT_SHIFT));
          nudge = Math.max(-160, Math.min(160, nudge * Math.max(0, 1 - (performance.now() - nudgeAt) / 1400) + (m.dir === 'up' ? -ALERT_SHIFT : ALERT_SHIFT)));
          nudgeAt = performance.now();
          break;
      }
    },
  };
};
