// Ported from the original two-player app (uses @sdk/duo). Two players: you and a friend, or a bot.
import { lazy } from 'react';
import { Turtle } from 'lucide-react';
import { defineGame } from '@sdk/types';
import { turtleBot } from './bot';

const load = () => import('./Game');

export const turtle = defineGame({
  meta: {
    id: 'turtle',
    name: { 'zh-TW': '烏龜對對碰', en: 'Turtle Match' },
    tagline: { 'zh-TW': '同一袋盲袋各拆各的，擺得好、開得巧的人拿得多', en: 'The same bag of blind boxes for both — place them well and cash in at the right time' },
    icon: Turtle,
    hue: 330,
    players: { min: 2, max: 2 },
    tags: ['versus', 'chill'],
    minutes: '5–8',
    howto: {
      'zh-TW': ['選一個許願色，兩人拆同一袋盲袋（順序一樣）', '拆一包、擺進九宮格；三連、對碰、全家福都會加包', '包拆完時拿到最多隻的人贏'],
      en: ['Pick a wish colour; you both open the same bag in the same order', 'Open a pack and place it in your 3×3 grid; lines, pairs and full sets earn more packs', 'Most turtles when the packs run out wins'],
    },
    bots: { levels: true, desc: { 'zh-TW': '電腦用同一袋盲袋跟你比，簡單亂擺、困難會算三連', en: 'The bot opens the same bag; easy places at random, hard plans three-in-a-rows' } },
  },
  Game: lazy(load),
  preload: load,
  bot: turtleBot,
});
