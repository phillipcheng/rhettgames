// Dynamic game registry. On platform boot, walks `<repo-root>/games/*` for
// directories containing a meta.js + server.js pair and registers each as
// an available game. Adding a new game = drop a submodule under games/.

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const GAMES_DIR = path.join(ROOT, 'games');

export const GAMES = {};

async function loadOne(id){
  const dir = path.join(GAMES_DIR, id);
  const metaPath = path.join(dir, 'meta.js');
  const serverPath = path.join(dir, 'server.js');
  if (!fs.existsSync(metaPath) || !fs.existsSync(serverPath)) return;
  try {
    const metaMod = await import(pathToFileURL(metaPath).href);
    const serverMod = await import(pathToFileURL(serverPath).href);
    const meta = metaMod.default || metaMod.meta;
    const GameClass = serverMod.Game || serverMod.default;
    if (!meta || !GameClass) {
      console.warn(`[games] ${id}: meta.js must default-export meta; server.js must export { Game } — skipping`);
      return;
    }
    GAMES[id] = { meta, createInstance: () => new GameClass() };
    console.log(`[games] loaded ${id} — "${meta.name}"`);
  } catch (err) {
    console.error(`[games] ${id}: load error`, err);
  }
}

async function discover(){
  if (!fs.existsSync(GAMES_DIR)) return;
  const entries = fs.readdirSync(GAMES_DIR, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('.')) continue;
    await loadOne(e.name);
  }
}

await discover();

export function listGameMeta(){
  return Object.values(GAMES).map(g => g.meta);
}

export function getGame(id){
  return GAMES[id] || null;
}
