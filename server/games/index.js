import gungameMeta from './gungame/meta.js';
import { Game as GunGame } from './gungame/game.js';
import demonSlayerMeta from './demon-slayer/meta.js';
import { Game as DemonSlayer } from './demon-slayer/game.js';

export const GAMES = {
  gungame: {
    meta: gungameMeta,
    createInstance: () => new GunGame()
  },
  'demon-slayer': {
    meta: demonSlayerMeta,
    createInstance: () => new DemonSlayer()
  }
};

export function listGameMeta(){
  return Object.values(GAMES).map(g => g.meta);
}

export function getGame(id){
  return GAMES[id] || null;
}
