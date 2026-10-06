// Ported from the original two-player app (uses @sdk/duo). Two players: you and a friend, or a bot.
import { lazy } from 'react';
import { PenTool } from 'lucide-react';
import { defineGame } from '@sdk/types';
import { twohandBot } from './bot';

const load = () => import('./Game');

export const twohand = defineGame({
  meta: {
    id: 'twohand',
    name: { 'zh-TW': '一起一筆畫', en: 'Two-Hand Sketch' },
    tagline: { 'zh-TW': '一人管左右、一人管上下，合力描一張圖，還可以把照片轉成線稿', en: 'One controls left–right, the other up–down: trace a drawing together (photos become line art)' },
    icon: PenTool,
    hue: 280,
    players: { min: 2, max: 2 },
    tags: ['coop', 'voice', 'chill'],
    minutes: '1–3',
    howto: {
      'zh-TW': ['選一張圖：一人管左右、一人管上下', '筆尖在兩條線的交點，筆不能停', '時間到看畫得多像（照片也能轉成線稿）'],
      en: ['Pick a picture: one player moves left–right, the other up–down', 'The pen is where the two lines cross and never lifts', 'When time is up, see how close you got (photos can be turned into line art)'],
    },
    bots: { levels: true, desc: { 'zh-TW': '你帶路，電腦管另一個軸跟著你的筆走', en: 'You lead; the bot drives the other axis and follows your pen' } },
  },
  Game: lazy(load),
  preload: load,
  bot: twohandBot,
});
