// Ported from the original two-player app (uses @sdk/duo). Two players: you and a friend, or a bot.
import { lazy } from 'react';
import { Waves } from 'lucide-react';
import { defineGame } from '@sdk/types';
import { bridgeBot } from './bot';

const load = () => import('./Game');

export const bridge = defineGame({
  meta: {
    id: 'bridge',
    name: { 'zh-TW': '過橋', en: 'Bridge Flick' },
    tagline: { 'zh-TW': '用力壓筆讓圈圈滑出去，撞掉對面的、別掉進水裡', en: 'Press hard and flick your rings across — knock theirs off, stay out of the river' },
    icon: Waves,
    hue: 196,
    players: { min: 2, max: 2 },
    tags: ['versus', 'turn'],
    minutes: '5–10',
    howto: {
      'zh-TW': ['在自己的地界放圈圈', '輪到你：點一個圈，在紙上拖曳決定方向', '按住壓筆、放開就滑出去；越用力越遠也越歪', '撞掉對面的圈，自己別滑進水裡'],
      en: ['Place your rings on your side', 'Your turn: tap a ring and drag to aim', 'Hold to press, release to slide — harder goes further but wobbles more', 'Knock their rings off and keep yours out of the water'],
    },
    bots: { levels: true, desc: { 'zh-TW': '電腦會算角度跟力道，越難越準', en: 'The bot works out angle and power; harder is more precise' } },
  },
  Game: lazy(load),
  preload: load,
  bot: bridgeBot,
});
