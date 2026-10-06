// Ported from the original two-player app (uses @sdk/duo). Two players: you and a friend, or a bot.
import { lazy } from 'react';
import { Bird } from 'lucide-react';
import { defineGame } from '@sdk/types';
import { blindflyBot } from './bot';

const load = () => import('./Game');

export const blindfly = defineGame({
  meta: {
    id: 'blindfly',
    name: { 'zh-TW': '盲飛', en: 'Blind Flight' },
    tagline: { 'zh-TW': '一人第一視角開鳥、一人看全圖報路，開語音才玩得起來', en: 'One flies in first person, the other sees the whole map and calls it out — needs voice chat' },
    icon: Bird,
    hue: 200,
    players: { min: 2, max: 2 },
    tags: ['coop', 'realtime', 'voice'],
    minutes: '3–10',
    howto: {
      'zh-TW': ['駕駛只看得到前方一小段，點畫面拍翅膀', '塔台看得到全圖，用嘴巴（或上 / 下按鈕）報路', '還有換手、雙駕駛、競技模式，甚至可以用聲音飛'],
      en: ['The pilot only sees a short way ahead; tap to flap', 'The tower sees everything and calls it out (or uses the up / down buttons)', 'Swap roles, dual pilots, race mode — you can even fly with your voice'],
    },
    bots: { levels: true, desc: { 'zh-TW': '電腦當塔台幫你報路，或換你當塔台指揮一台盲飛的電腦；也能跟它比誰飛得遠', en: 'The bot can be your control tower, or you guide a blind bot pilot; or race it' } },
  },
  Game: lazy(load),
  preload: load,
  bot: blindflyBot,
});
