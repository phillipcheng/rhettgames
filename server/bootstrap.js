// Runs on server boot. Keeps the "official" published catalogue in sync
// with the code in server/games/*. For every registered game that has a
// seed.html, guarantees there's a dev project + published release owned by
// the system author (defaults to the first admin, 'rhett' if present).
// Idempotent — no-op after first run per game.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as db from './db.js';
import { GAMES } from './games/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function pickSystemAuthor(){
  // Prefer an explicit 'rhett' admin; otherwise any admin; otherwise bail.
  const byName = db.findUserByName('rhett');
  if (byName && byName.role !== undefined) {
    const full = db.findUserById(byName.id);
    if (full && full.role === 'admin') return full;
  }
  const rows = db.db.prepare(`SELECT id, name, role FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1`).all();
  return rows[0] || null;
}

export function ensureBaseGamesPublished(){
  const author = pickSystemAuthor();
  if (!author) {
    console.log('[bootstrap] no admin user found; skipping base-game auto-publish');
    return;
  }
  for (const [id, entry] of Object.entries(GAMES)) {
    const seedPath = path.join(ROOT, 'games', id, 'seed.html');
    if (!fs.existsSync(seedPath)) continue;
    const existing = db.db.prepare(
      `SELECT r.id FROM released_games r
         JOIN dev_games d ON d.id = r.dev_game_id
        WHERE d.user_id = ? AND d.base_game_id = ? LIMIT 1`
    ).get(author.id, id);
    if (existing) continue;

    const html = fs.readFileSync(seedPath, 'utf8');
    const project = db.createDevProject({
      userId: author.id, baseGameId: id, title: entry.meta.name, html
    });
    const projDir = path.join(ROOT, 'data', 'projects', String(project.id));
    try { fs.mkdirSync(projDir, { recursive: true }); } catch {}
    try { fs.writeFileSync(path.join(projDir, 'game.html'), html); } catch {}
    const rel = db.releaseDevProject({
      devGameId: project.id, authorUserId: author.id,
      title: entry.meta.name, baseGameId: id, html
    });
    console.log(`[bootstrap] auto-published ${id} as "${entry.meta.name}" v${rel.version} (author=${author.name})`);
  }
}
