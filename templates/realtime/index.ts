import { lazy } from 'react';
import { Timer } from 'lucide-react';
import { defineGame } from '@sdk/types';
import { bot } from './bot';

const load = () => import('./Game');

// Only '@sdk/types' / '@sdk/logic' here (no '@sdk'): this file is loaded by `npm test` in Node.
export const __EXPORT__ = defineGame({
  meta: {
    id: '__ID__',
    name: { 'zh-TW': '__NAME__', en: '__EN__' },
    tagline: { 'zh-TW': '一句話說明這個遊戲', en: 'One line that sells the game' },
    icon: Timer, // any icon from https://lucide.dev/icons
    hue: 330,
    players: { min: 2, max: 8 },
    tags: ['realtime', 'party'],
    minutes: '1',
    howto: {
      'zh-TW': ['大家都按「準備」', '倒數結束就狂點按鈕', '最先點滿的人贏'],
      en: ['Everyone taps “ready”', 'When the countdown ends, mash the button', 'First to fill the bar wins'],
    },
    bots: { levels: true },
  },
  Game: lazy(load),
  preload: load,
  bot,
});
