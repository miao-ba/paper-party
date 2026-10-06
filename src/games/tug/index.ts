// Ported from the original two-player app (uses @sdk/duo). Two players: you and a friend, or a bot.
import { lazy } from 'react';
import { Cable } from 'lucide-react';
import { defineGame } from '@sdk/types';
import { tugBot } from './bot';

const load = () => import('./Game');

export const tug = defineGame({
  meta: {
    id: 'tug',
    name: { 'zh-TW': '拔河', en: 'Tug of War' },
    tagline: { 'zh-TW': '狂點把繩子拉過來，看到「停」手要放開，不然會滑手', en: 'Mash to pull the rope — but freeze when the whistle blows or you slip' },
    icon: Cable,
    hue: 140,
    players: { min: 2, max: 2 },
    tags: ['versus', 'realtime'],
    minutes: '1–3',
    howto: {
      'zh-TW': ['倒數完狂點畫面，把繩結拉到你這邊的虛線', '哨子響、畫面變紅＝停，這時候點會滑手', '先贏 2 回合'],
      en: ['After the countdown, mash the screen to pull the knot past your line', 'Whistle + red screen = stop; tapping now makes you slip', 'First to 2 rounds'],
    },
    bots: { levels: true, desc: { 'zh-TW': '跟電腦拔河，越難點越快、喊停時越不會滑手', en: 'Pull against the bot; harder bots tap faster and slip less' } },
  },
  Game: lazy(load),
  preload: load,
  bot: tugBot,
});
