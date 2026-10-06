import { lazy } from 'react';
import { Dices } from 'lucide-react';
import { defineGame } from '@sdk/types';
import { logic } from './logic';

const load = () => import('./Game');

export const liarsDice = defineGame({
  meta: {
    id: 'liars-dice',
    name: { 'zh-TW': '吹牛骰', en: "Liar's Dice" },
    tagline: { 'zh-TW': '「全桌至少有 4 個五」——信不信？抓到吹牛就讓他少一顆骰子', en: '"At least four fives on the table" — believe it? Catch a liar and they lose a die' },
    icon: Dices,
    hue: 268,
    players: { min: 2, max: 6 },
    tags: ['party', 'bluff', 'turn'],
    minutes: '5–10',
    howto: {
      'zh-TW': [
        '每人偷偷擲骰，只看得到自己的',
        '輪流喊「全桌至少有 Q 個 F」，下一個人要喊更大（數量更多，或同數量點數更大）',
        '不信就按「抓！」：開骰數，喊錯的人（或抓錯的人）少一顆骰子',
        '1 點是萬能（可在設定關掉）；骰子輸光就出局，最後剩下的人贏',
      ],
      en: [
        'Everyone rolls in secret and sees only their own dice',
        'Take turns bidding "at least Q dice show F on the whole table"; each bid must go higher',
        'Doubt it? Call "Liar!": cups up — whoever was wrong loses a die',
        "1s are wild (optional). Lose all your dice and you're out; last one standing wins",
      ],
    },
    options: [
      {
        key: 'dice',
        label: { 'zh-TW': '每人骰子', en: 'Dice each' },
        type: 'select',
        choices: [
          { value: 3, label: '3' },
          { value: 4, label: '4' },
          { value: 5, label: '5' },
        ],
        default: 5,
      },
      { key: 'wild', label: { 'zh-TW': '1 點是萬能', en: '1s are wild' }, type: 'toggle', default: true },
    ],
    bots: { levels: true },
    spectators: true,
  },
  Game: lazy(load),
  preload: load,
  logic,
});
