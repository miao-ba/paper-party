// Ported from the original two-player app (uses @sdk/duo). Two players: you and a friend, or a bot.
import { lazy } from 'react';
import { Zap } from 'lucide-react';
import { defineGame } from '@sdk/types';
import { duelBot } from './bot';

const load = () => import('./Game');

export const duel = defineGame({
  meta: {
    id: 'duel',
    name: { 'zh-TW': '牛仔決鬥', en: 'Cowboy Duel' },
    tagline: { 'zh-TW': '看到「拔槍！」就點，先按的贏，太早按自爆', en: 'One on one: tap on “DRAW!” — first shot wins, too early and you blow up' },
    icon: Zap,
    hue: 28,
    players: { min: 2, max: 2 },
    tags: ['versus', 'realtime'],
    minutes: '1–2',
    howto: {
      'zh-TW': ['兩人都按「準備」，盯著畫面等', '出現「拔槍！」就點畫面，先點的贏', '太早點會自爆；先贏 3 回合'],
      en: ['Both tap “ready” and wait', 'When “DRAW!” appears, tap — first one wins', 'Tap too early and you blow up; first to 3 rounds'],
    },
    bots: { levels: true, desc: { 'zh-TW': '跟電腦比手速，越難反應越快', en: 'Race the bot; harder bots react faster' } },
  },
  Game: lazy(load),
  preload: load,
  bot: duelBot,
});
