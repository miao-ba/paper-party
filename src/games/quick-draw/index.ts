import { lazy } from 'react';
import { Zap } from 'lucide-react';
import { defineGame } from '@sdk/types';
import { quickDrawBot } from './bot';

const load = () => import('./Game');

export const quickDraw = defineGame({
  meta: {
    id: 'quick-draw',
    name: { 'zh-TW': '快手', en: 'Quick Draw' },
    tagline: { 'zh-TW': '看到「拔槍！」就點，最快的人得分。小心假訊號', en: 'Tap the instant you see “DRAW!” — fastest scores. Beware the decoy' },
    icon: Zap,
    hue: 36,
    players: { min: 2, max: 8 },
    tags: ['party', 'realtime', 'versus'],
    minutes: '1–3',
    howto: {
      'zh-TW': ['大家都按「準備」，盯著畫面', '出現「拔槍！」就點畫面，最快的人得 1 分', '太早點、或被「🦆 鴨！」騙到都算犯規', '先拿到 3 分的人贏'],
      en: ['Everyone taps “ready” and stares at the screen', 'When “DRAW!” appears, tap — the fastest gets a point', 'Tapping early, or on the “🦆 DUCK!” decoy, is a foul', 'First to 3 points wins'],
    },
    options: [
      {
        key: 'wins',
        label: { 'zh-TW': '幾分獲勝', en: 'Points to win' },
        type: 'select',
        choices: [
          { value: 3, label: '3' },
          { value: 5, label: '5' },
        ],
        default: 3,
      },
    ],
    bots: { levels: true },
  },
  Game: lazy(load),
  preload: load,
  bot: quickDrawBot,
});
