import { lazy } from 'react';
import { Bomb } from 'lucide-react';
import { defineGame } from '@sdk/types';
import { logic } from './logic';

const load = () => import('./Game');

export const bombNumber = defineGame({
  meta: {
    id: 'bomb-number',
    name: { 'zh-TW': '終極密碼', en: 'Bomb Number' },
    tagline: { 'zh-TW': '輪流猜數字，範圍越縮越小，猜中密碼的人爆炸', en: 'Guess in turns, the range shrinks — whoever hits the secret explodes' },
    icon: Bomb,
    hue: 8,
    players: { min: 2, max: 10 },
    tags: ['party', 'turn', 'luck'],
    minutes: '2–4',
    howto: {
      'zh-TW': ['系統偷偷選一個密碼（1 到 100）', '輪到你就猜一個在範圍內的數字', '沒猜中，範圍就往密碼縮小', '猜中密碼的人踩到炸彈，其他人都贏'],
      en: ['A secret number between 1 and 100 is picked', 'On your turn, guess a number inside the range', 'Miss, and the range shrinks around the secret', 'Whoever hits the secret steps on the bomb — everyone else wins'],
    },
    options: [
      {
        key: 'max',
        label: { 'zh-TW': '範圍', en: 'Range' },
        type: 'select',
        choices: [
          { value: 50, label: '1–50' },
          { value: 100, label: '1–100' },
          { value: 1000, label: '1–1000' },
        ],
        default: 100,
      },
    ],
    bots: { levels: false },
    spectators: true,
  },
  Game: lazy(load),
  preload: load,
  logic,
});
