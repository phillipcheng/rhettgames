// One-off: publish standalone HTML games into the lobby's released catalogue.
// Usage: node publish-arcade.mjs <repoRoot> <file:title> [<file:title> ...]
import fs from 'fs';
import path from 'path';

const [repoRoot, ...specs] = process.argv.slice(2);
if (!repoRoot || !specs.length) {
  console.error('usage: node publish-arcade.mjs <repoRoot> <file:title> ...');
  process.exit(2);
}

const db = await import(path.join('file://', path.resolve(repoRoot), 'server/db.js'));

function pickSystemAuthor(){
  const byName = db.findUserByName('rhett');
  if (byName) {
    const full = db.findUserById(byName.id);
    if (full && full.role === 'admin') return full;
  }
  const rows = db.db.prepare(`SELECT id, name, role FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1`).all();
  return rows[0] || null;
}

const author = pickSystemAuthor();
if (!author) { console.error('no admin user found'); process.exit(1); }
console.log(`author: ${author.name} (id=${author.id})`);

for (const spec of specs) {
  const sep = spec.indexOf(':');
  const file = spec.slice(0, sep);
  const title = spec.slice(sep + 1);
  const html = fs.readFileSync(file, 'utf8');

  const existing = db.db.prepare(
    `SELECT d.id FROM dev_games d WHERE d.user_id = ? AND d.title = ? LIMIT 1`
  ).get(author.id, title);
  if (existing) { console.log(`skip (already exists): ${title}`); continue; }

  const project = db.createDevProject({ userId: author.id, baseGameId: null, title, html });
  const rel = db.releaseDevProject({
    devGameId: project.id, authorUserId: author.id, title, baseGameId: null, html
  });
  console.log(`published "${title}" v${rel.version} (project=${project.id}, release=${rel.id})`);
}
