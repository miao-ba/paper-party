// Every game in the lobby, in display order. Add one with `npm run new-game -- <id>` (it edits this
// file for you) or by hand: import its index.ts and add it to the array.
import type { GameModule } from '@sdk/types';
import { bombNumber } from './bomb-number';
import { liarsDice } from './liars-dice';
import { lowestUnique } from './lowest-unique';
import { quickDraw } from './quick-draw';
// The two-player games ported from the original app:
import { paperSnipe } from './paper-snipe';
import { bridge } from './bridge';
import { duel } from './duel';
import { puzzle } from './puzzle';
import { blindfly } from './blindfly';
import { tug } from './tug';
import { twohand } from './twohand';
import { turtle } from './turtle';
// @new-game-import (the scaffolder inserts imports above this line)

export const games: GameModule[] = [
  liarsDice,
  bombNumber,
  quickDraw,
  lowestUnique,
  paperSnipe,
  bridge,
  duel,
  puzzle,
  blindfly,
  tug,
  twohand,
  turtle,
  // @new-game-entry (the scaffolder inserts entries above this line)
];

export const getGame = (id: string) => games.find((g) => g.meta.id === id);
