import { lazy } from 'react';
import { Puzzle } from 'lucide-react';
import { defineGame } from '@sdk/types';
import { logic } from './logic';

const load = () => import('./Game');

// Only '@sdk/types' / '@sdk/logic' here (no '@sdk'): this file is loaded by `npm test` in Node.
export const __EXPORT__ = defineGame({
  meta: {
    id: '__ID__',
    name: { 'zh-TW': '__NAME__', en: '__EN__' },
    tagline: { 'zh-TW': '一句話說明這個遊戲', en: 'One line that sells the game' },
    icon: Puzzle, // any icon from https://lucide.dev/icons
    hue: 150, // card colour, 0–360
    players: { min: 2, max: 6 },
    tags: ['turn', 'versus'],
    minutes: '2–4',
    howto: {
      'zh-TW': ['桌上有一堆木棒', '輪到你時拿走 1、2 或 3 根', '拿到最後一根的人輸'],
      en: ['There is a pile of sticks', 'On your turn take 1, 2 or 3', 'Whoever takes the last stick loses'],
    },
    options: [
      {
        key: 'sticks',
        label: { 'zh-TW': '木棒數', en: 'Sticks' },
        type: 'select',
        choices: [
          { value: 15, label: '15' },
          { value: 21, label: '21' },
          { value: 31, label: '31' },
        ],
        default: 21,
      },
    ],
    bots: { levels: true },
    spectators: true,
  },
  Game: lazy(load),
  preload: load,
  logic,
});
