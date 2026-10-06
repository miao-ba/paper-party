import { lazy } from 'react';
import { Hash } from 'lucide-react';
import { defineGame } from '@sdk/types';
import { logic } from './logic';

const load = () => import('./Game');

export const lowestUnique = defineGame({
  meta: {
    id: 'lowest-unique',
    name: { 'zh-TW': '最小獨特數', en: 'Lowest Unique' },
    tagline: { 'zh-TW': '大家同時選 1–7，沒撞號的最小數字得分。選大賺多，但容易撞', en: 'Everyone picks 1–7 at once. The smallest number nobody else picked scores' },
    icon: Hash,
    hue: 196,
    players: { min: 2, max: 12 },
    tags: ['party', 'bluff', 'chill'],
    minutes: '2–4',
    howto: {
      'zh-TW': ['每回合大家同時偷偷選一個 1–7 的數字', '揭曉：「只有一個人選」的數字裡最小的那個獲勝', '獲勝的人得到等於該數字的分數（選 6 贏就拿 6 分）', '幾回合後分數最高的人贏'],
      en: ['Each round, everyone secretly picks a number from 1 to 7', 'Reveal: among numbers picked by exactly one player, the smallest wins', 'Its owner scores that many points (win with a 6 → 6 points)', 'Highest total after the last round wins'],
    },
    options: [
      {
        key: 'rounds',
        label: { 'zh-TW': '回合數', en: 'Rounds' },
        type: 'select',
        choices: [
          { value: 3, label: '3' },
          { value: 5, label: '5' },
          { value: 8, label: '8' },
        ],
        default: 5,
      },
    ],
    bots: { levels: true },
    spectators: true,
  },
  Game: lazy(load),
  preload: load,
  logic,
});
