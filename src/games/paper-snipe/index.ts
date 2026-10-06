// Ported from the original two-player app (uses @sdk/duo). Two players: you and a friend, or a bot.
import { lazy } from 'react';
import { Crosshair } from 'lucide-react';
import { defineGame } from '@sdk/types';
import { snipeBot } from './bot';

const load = () => import('./Game');

export const paperSnipe = defineGame({
  meta: {
    id: 'paper-snipe',
    name: { 'zh-TW': '摺紙狙擊', en: 'Paper Sniper' },
    tagline: { 'zh-TW': '畫點、摺紙、敲下去，蓋到對面火柴人的頭就爆頭', en: 'Draw a dot, fold the paper, slam it — stamp the stick figure across for a headshot' },
    icon: Crosshair,
    hue: 14,
    players: { min: 2, max: 2 },
    tags: ['versus', 'turn'],
    minutes: '5–10',
    howto: {
      'zh-TW': ['在自己那半邊放火柴人（大的血多但好打）', '輪到你：在自己這半畫一個點，紙會對摺過去', '按住蓄力、放開敲下去，墨點印到對面同一個位置', '力道停在綠色甜蜜區最準；打到頭直接倒'],
      en: ['Place stick figures on your half (big ones have more HP but are easy targets)', 'Your turn: draw a dot on your half and the paper folds over', 'Hold to charge, release to slam — the ink stamps the same spot on the other side', 'Stop in the green sweet spot for accuracy; a headshot is a knockout'],
    },
    bots: { levels: true, desc: { 'zh-TW': '電腦看得到你的火柴人，越難瞄越準', en: 'The bot can see your stick figures; harder bots aim better' } },
  },
  Game: lazy(load),
  preload: load,
  bot: snipeBot,
});
