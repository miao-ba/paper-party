// Ported from the original two-player app (uses @sdk/duo). Two players: you and a friend, or a bot.
import { lazy } from 'react';
import { Puzzle } from 'lucide-react';
import { defineGame } from '@sdk/types';
import { silentBot } from '@sdk/logic';

const load = () => import('./Game');

export const puzzle = defineGame({
  meta: {
    id: 'puzzle',
    name: { 'zh-TW': '一起拼圖', en: 'Puzzle Together' },
    tagline: { 'zh-TW': '自己的照片、自訂片數和形狀，兩個人同時拖，進度會存起來', en: 'Your own photo, any piece count and shape — drag together, progress is saved' },
    icon: Puzzle,
    hue: 270,
    players: { min: 2, max: 2 },
    tags: ['coop', 'chill'],
    minutes: '10–60',
    howto: {
      'zh-TW': ['選照片（或隨機畫一張）、片數和形狀', '拖拼圖片，靠近正確位置會自動吸住', '兩個人同時拼，進度會自動存檔'],
      en: ['Pick a photo (or paint a random one), piece count and shape', 'Drag pieces — they snap when close to the right spot', 'Both of you can drag at once; progress saves automatically'],
    },
    bots: { levels: false, desc: { 'zh-TW': '自己慢慢拼，存檔共用，之後可以兩個人接著拼', en: 'Puzzle on your own; saves are shared, so you can continue together later' } },
  },
  Game: lazy(load),
  preload: load,
  bot: silentBot,
});
