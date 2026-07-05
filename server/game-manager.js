// Admin tooling to create a new game: spin up a GitHub repo with boilerplate,
// scaffold meta/server/client/seed/README, push, add as submodule to the
// platform repo, commit + push the platform, re-discover, restart.
//
// Shared by ADD GAME and PROMOTE (the only difference is whether `seedHtml`
// is provided — PROMOTE pipes in an existing release's HTML).

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import * as db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GH_OWNER = process.env.GITHUB_OWNER || 'phillipcheng';

const ID_RE = /^[a-z][a-z0-9-]{1,40}$/;

function runCmd(cmd, args, opts = {}){
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...(opts.env || {}) } });
    let out = '', err = '';
    p.stdout.on('data', d => out += d.toString());
    p.stderr.on('data', d => err += d.toString());
    p.on('close', code => resolve({ code, out: out.trim(), err: err.trim() }));
  });
}

async function githubApi(pathname, init = {}){
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN not configured');
  const res = await fetch('https://api.github.com' + pathname, {
    ...init,
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'rhettgames-platform',
      ...(init.headers || {})
    }
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch {}
  return { status: res.status, body, text };
}

// List .html files in the platform repo (phillipcheng/rhettgames @ main).
// Returns [{ path, size }] sorted by path.
export async function listPlatformHtmlFiles(){
  const r = await githubApi(`/repos/${GH_OWNER}/rhettgames/git/trees/main?recursive=1`);
  if (r.status !== 200 || !r.body || !Array.isArray(r.body.tree)) {
    throw new Error(`tree fetch failed (${r.status}): ${(r.body && r.body.message) || r.text.slice(0, 120)}`);
  }
  return r.body.tree
    .filter(e => e.type === 'blob' && /\.html?$/i.test(e.path))
    .map(e => ({ path: e.path, size: e.size || 0 }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

// Fetch a single file from phillipcheng/rhettgames @ main as text.
export async function fetchPlatformFile(filePath){
  if (typeof filePath !== 'string' || filePath.includes('..') || filePath.startsWith('/')) {
    throw new Error('invalid path');
  }
  const r = await githubApi(`/repos/${GH_OWNER}/rhettgames/contents/${encodeURI(filePath)}?ref=main`, {
    headers: { 'Accept': 'application/vnd.github.raw' }
  });
  if (r.status !== 200) throw new Error(`file fetch failed (${r.status})`);
  return r.text;
}

// Check if a repo already exists under GH_OWNER.
async function repoExists(name){
  const r = await githubApi(`/repos/${GH_OWNER}/${name}`);
  return r.status === 200;
}

async function createGithubRepo({ id, description }){
  const existed = await repoExists(id);
  if (existed) return { ok: false, error: 'repo already exists on GitHub' };
  const r = await githubApi('/user/repos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: id,
      description: (description || '').slice(0, 200),
      private: false,
      auto_init: false
    })
  });
  if (r.status !== 201) {
    return { ok: false, error: `GitHub create failed (${r.status}): ${(r.body && r.body.message) || r.text.slice(0, 200)}` };
  }
  return { ok: true, ssh: r.body.ssh_url, https: r.body.clone_url };
}

// ========= Boilerplate files =========

function metaJs({ id, name, description, minPlayers, maxPlayers }){
  return `export default {
  id: ${JSON.stringify(id)},
  name: ${JSON.stringify(name)},
  description: ${JSON.stringify(description || '')},
  minPlayers: ${minPlayers | 0 || 1},
  maxPlayers: ${maxPlayers | 0 || 2},
  tickHz: 60,
  sendHz: 30,
  clientModule: '/games/${id}/client.js'
};
`;
}

function serverJs({ id, name }){
  return `// ${name} — authoritative Node simulation.
// Scaffolded stub — replace with real mechanics. The platform drives this via
//   game.setInput(slot, input) / game.tick(dt) / game.snapshot()

const W = 1024, H = 640;

function emptyInput(){ return { up:0, down:0, left:0, right:0, action:0 }; }

export class Game {
  constructor(){ this.reset(); }

  reset(){
    const keepNames = this.players ? this.players.map(p => p.name) : [null, null];
    this.players = [
      { id: 0, name: keepNames[0] || 'Player 1', active: true, alive: true,
        x: W/2 - 80, y: H/2, color: '#7ec8ff', score: 0 },
      { id: 1, name: keepNames[1] || 'Player 2', active: true, alive: true,
        x: W/2 + 80, y: H/2, color: '#ffae6c', score: 0 }
    ];
    this.inputs = [emptyInput(), emptyInput()];
    this.events = [];
    this.time = 0;
    this.winner = -1;
    this.running = true;
  }

  setInput(slot, input){
    if (slot < 0 || slot >= this.players.length) return;
    this.inputs[slot] = {
      up: !!input.up | 0, down: !!input.down | 0,
      left: !!input.left | 0, right: !!input.right | 0,
      action: !!input.action | 0
    };
  }
  clearInput(slot){ this.inputs[slot] = emptyInput(); }
  setName(slot, name){ if (this.players[slot]) this.players[slot].name = String(name || '').slice(0, 16) || 'P' + (slot+1); }
  setActive(slot, active){
    const p = this.players[slot]; if (!p) return;
    p.active = !!active; p.alive = !!active;
  }

  tick(dt){
    if (!this.running) return;
    this.time += dt;
    const speed = 4;
    for (const p of this.players){
      if (!p.active) continue;
      const i = this.inputs[p.id];
      if (i.right) p.x += speed;
      if (i.left)  p.x -= speed;
      if (i.down)  p.y += speed;
      if (i.up)    p.y -= speed;
      p.x = Math.max(16, Math.min(W - 16, p.x));
      p.y = Math.max(16, Math.min(H - 16, p.y));
    }
  }

  snapshot(){
    const snap = {
      t: 'state', time: this.time,
      running: this.running, winner: this.winner,
      players: this.players.map(p => ({ ...p })),
      events: this.events
    };
    this.events = [];
    return snap;
  }
}
`;
}

function clientJs({ id, name }){
  return `// ${name} — browser renderer (scaffolded stub).
// Receives snapshots from the server and draws them. Replace with a real
// renderer as the game grows.

export async function init(ctx){
  const canvas = ctx.canvas;
  const cc = canvas.getContext('2d');
  canvas.width = 1024; canvas.height = 640;
  fit();
  window.addEventListener('resize', fit);
  function fit(){
    const mw = window.innerWidth - 20, mh = window.innerHeight - 20;
    const s = Math.min(mw / 1024, mh / 640, 1);
    canvas.style.width = (1024 * s) + 'px';
    canvas.style.height = (640 * s) + 'px';
  }

  const keys = Object.create(null);
  const onDown = (e) => { keys[e.key.toLowerCase()] = true; if (['w','a','s','d',' '].includes(e.key.toLowerCase()) || e.key.startsWith('Arrow')) e.preventDefault(); };
  const onUp = (e) => { keys[e.key.toLowerCase()] = false; };
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);

  let seq = 0, lastSent = null, last = 0;
  function sendInput(){
    const inp = {
      up:    keys['w'] || keys['arrowup']    ? 1 : 0,
      down:  keys['s'] || keys['arrowdown']  ? 1 : 0,
      left:  keys['a'] || keys['arrowleft']  ? 1 : 0,
      right: keys['d'] || keys['arrowright'] ? 1 : 0,
      action: keys[' '] ? 1 : 0
    };
    const now = performance.now();
    const same = lastSent && Object.keys(inp).every(k => inp[k] === lastSent[k]);
    if (!same || now - last > 200) {
      seq++; ctx.send({ t: 'input', seq, ...inp });
      lastSent = inp; last = now;
    }
  }

  let latest = null, running = true;
  function loop(){
    if (!running) return;
    sendInput();
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  function render(){
    cc.fillStyle = '#0a0a15';
    cc.fillRect(0, 0, 1024, 640);
    cc.strokeStyle = 'rgba(100,60,100,0.08)';
    for (let x = 0; x < 1024; x += 64) { cc.beginPath(); cc.moveTo(x,0); cc.lineTo(x,640); cc.stroke(); }
    for (let y = 0; y < 640; y += 64) { cc.beginPath(); cc.moveTo(0,y); cc.lineTo(1024,y); cc.stroke(); }

    cc.fillStyle = '#ffd166';
    cc.textAlign = 'center';
    cc.font = 'bold 28px Georgia';
    cc.fillText(${JSON.stringify(name)}, 512, 80);
    cc.fillStyle = '#888'; cc.font = '13px Georgia';
    cc.fillText('Scaffold — edit this game with Claude in SYSTEM DEV', 512, 108);

    if (latest) {
      for (const p of latest.players) {
        if (!p.active) continue;
        cc.fillStyle = p.color;
        cc.beginPath(); cc.arc(p.x, p.y, 18, 0, Math.PI*2); cc.fill();
        cc.strokeStyle = '#fff'; cc.lineWidth = 2; cc.stroke();
        cc.fillStyle = '#fff'; cc.font = 'bold 12px Georgia';
        cc.fillText(p.name, p.x, p.y - 26);
      }
    }
    cc.fillStyle = '#567'; cc.font = '11px Georgia';
    cc.fillText('WASD / Arrow keys to move', 512, 624);
  }

  return {
    onState(snap){ latest = snap; },
    onRoomUpdate(_r){},
    destroy(){
      running = false;
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('resize', fit);
    }
  };
}
`;
}

function minimalSeed({ name }){
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${name}</title>
<style>html,body{margin:0;padding:0;background:#111;color:#fff;font-family:monospace;}
canvas{display:block;margin:20px auto;background:#222;border:1px solid #333;}</style>
</head>
<body>
<canvas id="c" width="800" height="600"></canvas>
<script>
const c = document.getElementById('c');
const ctx = c.getContext('2d');
ctx.fillStyle = '#fff'; ctx.font = '24px monospace'; ctx.textAlign = 'center';
ctx.fillText(${JSON.stringify(name)}, 400, 280);
ctx.fillStyle = '#888'; ctx.font = '14px monospace';
ctx.fillText('Scaffold — use Claude + SYSTEM DEV to build this game', 400, 320);
</script>
</body>
</html>
`;
}

function readmeFor({ id, name, description }){
  return `# ${id}

**${name}**${description ? ' — ' + description : ''}

Scaffolded by the rhettgames-platform ADD GAME flow.

## Layout

- \`server.js\` — authoritative Node simulation (exports \`{ Game }\`)
- \`client.js\` — browser renderer (\`export async function init(ctx)\`)
- \`meta.js\` — registration metadata
- \`seed.html\` — single-file HTML seed used by Dev Studio

See the [platform repo](https://github.com/${GH_OWNER}/rhettgames) for the full
Game contract.
`;
}

// ========= Public API =========

export async function createGameRepo(spec, { actorId, force } = {}){
  const { id, name } = spec;
  if (!ID_RE.test(id)) return { ok: false, error: 'id must match /^[a-z][a-z0-9-]*$/, 2-42 chars' };
  if (!name || !name.trim()) return { ok: false, error: 'name required' };
  const submodulePath = path.join(ROOT, 'games', id);

  // Override mode: rewrite scaffolded files in the existing submodule, commit
  // locally, bump the parent's pointer, then restart. No GitHub interaction.
  // Note: this REPLACES any custom server.js / client.js / meta.js the existing
  // game had. The seed.html is also replaced.
  if (fs.existsSync(submodulePath) && force) {
    try {
      fs.writeFileSync(path.join(submodulePath, 'meta.js'),   metaJs(spec));
      fs.writeFileSync(path.join(submodulePath, 'server.js'), serverJs(spec));
      fs.writeFileSync(path.join(submodulePath, 'client.js'), clientJs(spec));
      fs.writeFileSync(path.join(submodulePath, 'seed.html'), spec.seedHtml || minimalSeed(spec));
      fs.writeFileSync(path.join(submodulePath, 'README.md'), readmeFor(spec));
    } catch (err) {
      return { ok: false, error: 'failed to write files: ' + err.message };
    }
    await runCmd('git', ['add', '.'], { cwd: submodulePath });
    const sc = await runCmd('git', ['commit', '-q', '-m', 'override scaffold (force)'], { cwd: submodulePath });
    if (sc.code !== 0 && !(sc.err || '').includes('nothing to commit') && !(sc.out || '').includes('nothing to commit')) {
      return { ok: false, error: 'submodule commit failed: ' + ((sc.err || sc.out) || '').slice(0, 200) };
    }
    await runCmd('git', ['add', 'games/' + id], { cwd: ROOT });
    const pc = await runCmd('git', ['commit', '-q', '-m', 'override game: ' + id], { cwd: ROOT });
    if (pc.code !== 0 && !(pc.err || '').includes('nothing to commit') && !(pc.out || '').includes('nothing to commit')) {
      return { ok: false, error: 'platform commit failed: ' + ((pc.err || pc.out) || '').slice(0, 200) };
    }
    db.logAdminAction({
      actorId: actorId || 0, kind: 'override-game',
      target: id, details: 'name=' + name + ' (in-place override)', ok: true
    });
    setTimeout(() => {
      spawn('sudo', ['-n', '/bin/systemctl', 'restart', 'rhettgames'], { detached: true, stdio: 'ignore' }).unref();
    }, 400);
    return {
      ok: true, id, name,
      repoUrl: 'https://github.com/' + GH_OWNER + '/' + id,
      restart: 'queued', overridden: true
    };
  }

  if (fs.existsSync(submodulePath)) {
    return { ok: false, error: 'a submodule at games/' + id + ' already exists locally', requiresForce: true };
  }

  // 1) Create the GitHub repo
  const created = await createGithubRepo({ id, description: spec.description });
  if (!created.ok) return created;

  // 2) Scaffold in a temp dir + push initial
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gm-' + id + '-'));
  try {
    fs.writeFileSync(path.join(tmp, 'meta.js'),   metaJs(spec));
    fs.writeFileSync(path.join(tmp, 'server.js'), serverJs(spec));
    fs.writeFileSync(path.join(tmp, 'client.js'), clientJs(spec));
    fs.writeFileSync(path.join(tmp, 'seed.html'), spec.seedHtml || minimalSeed(spec));
    fs.writeFileSync(path.join(tmp, 'README.md'), readmeFor(spec));

    const r1 = await runCmd('git', ['init', '-q', '-b', 'main'], { cwd: tmp });
    if (r1.code !== 0) return { ok: false, error: 'git init failed: ' + r1.err };
    await runCmd('git', ['config', 'user.email', 'sysdev@rhettgames.local'], { cwd: tmp });
    await runCmd('git', ['config', 'user.name',  'rhettgames sysdev'], { cwd: tmp });
    await runCmd('git', ['add', '.'], { cwd: tmp });
    const r2 = await runCmd('git', ['commit', '-q', '-m', 'initial: ' + name + ' scaffold'], { cwd: tmp });
    if (r2.code !== 0) return { ok: false, error: 'initial commit failed: ' + r2.err };
    const r3 = await runCmd('git', ['remote', 'add', 'origin', 'https://github.com/' + GH_OWNER + '/' + id + '.git'], { cwd: tmp });
    if (r3.code !== 0) return { ok: false, error: 'remote add failed: ' + r3.err };
    const r4 = await runCmd('git', ['push', '-u', 'origin', 'main'], { cwd: tmp });
    if (r4.code !== 0) return { ok: false, error: 'initial push failed: ' + (r4.err || '').slice(0, 200) };

    // 3) Add submodule to the platform repo
    const subUrl = 'https://github.com/' + GH_OWNER + '/' + id + '.git';
    const r5 = await runCmd('git', ['submodule', 'add', '-b', 'main', subUrl, 'games/' + id], { cwd: ROOT });
    if (r5.code !== 0) return { ok: false, error: 'submodule add failed: ' + (r5.err || '').slice(0, 200) };
    // 4) Commit + push platform
    await runCmd('git', ['add', '.gitmodules', 'games/' + id], { cwd: ROOT });
    const r6 = await runCmd('git', ['commit', '-q', '-m', 'add game: ' + id + ' (' + name + ')'], { cwd: ROOT });
    if (r6.code !== 0) return { ok: false, error: 'platform commit failed: ' + r6.err };
    const r7 = await runCmd('git', ['push', 'origin', 'main'], { cwd: ROOT });
    if (r7.code !== 0) return { ok: false, error: 'platform push failed: ' + (r7.err || '').slice(0, 200) };

    db.logAdminAction({
      actorId: actorId || 0, kind: 'add-game',
      target: id, details: 'name=' + name + (spec.promotedFromRelease ? ' promoted=' + spec.promotedFromRelease : ''),
      ok: true
    });

    // 5) Kick the restart — new game picked up on next boot via auto-discovery.
    setTimeout(() => {
      spawn('sudo', ['-n', '/bin/systemctl', 'restart', 'rhettgames'], { detached: true, stdio: 'ignore' }).unref();
    }, 400);

    return {
      ok: true,
      id, name,
      repoUrl: 'https://github.com/' + GH_OWNER + '/' + id,
      restart: 'queued'
    };
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

// Remove a registered multiplayer game from the platform: deinit + remove the
// submodule, commit locally, then queue a restart so the games registry
// reflects it. We do NOT push to GitHub — admins control remote state.
// The game's own GitHub repo is also left alone, so you can re-add it later.
export async function deleteGameRepo({ id }, { actorId } = {}){
  if (!ID_RE.test(id)) return { ok: false, error: 'invalid id' };
  const submodulePath = path.join(ROOT, 'games', id);
  if (!fs.existsSync(submodulePath)) return { ok: false, error: 'no submodule at games/' + id };

  const r1 = await runCmd('git', ['submodule', 'deinit', '-f', '--', 'games/' + id], { cwd: ROOT });
  if (r1.code !== 0) return { ok: false, error: 'submodule deinit failed: ' + (r1.err || '').slice(0, 200) };
  const r2 = await runCmd('git', ['rm', '-f', 'games/' + id], { cwd: ROOT });
  if (r2.code !== 0) return { ok: false, error: 'git rm failed: ' + (r2.err || '').slice(0, 200) };

  const cachedModule = path.join(ROOT, '.git', 'modules', 'games', id);
  try { fs.rmSync(cachedModule, { recursive: true, force: true }); } catch {}

  const r3 = await runCmd('git', ['commit', '-q', '-m', 'remove game: ' + id], { cwd: ROOT });
  if (r3.code !== 0) return { ok: false, error: 'platform commit failed: ' + (r3.err || r3.out || '').slice(0, 200) };

  db.logAdminAction({
    actorId: actorId || 0, kind: 'delete-game',
    target: id, details: 'submodule removed locally (no remote push)', ok: true
  });

  setTimeout(() => {
    spawn('sudo', ['-n', '/bin/systemctl', 'restart', 'rhettgames'], { detached: true, stdio: 'ignore' }).unref();
  }, 400);

  return { ok: true, id, restart: 'queued' };
}

export async function promoteReleaseToGame(spec, { actorId } = {}){
  const r = db.getReleasedGame(spec.releaseId | 0);
  if (!r) return { ok: false, error: 'release not found' };
  return createGameRepo({
    id: spec.id,
    name: spec.name || r.title,
    description: spec.description || ('Promoted from release ' + r.id),
    minPlayers: spec.minPlayers || 1,
    maxPlayers: spec.maxPlayers || 2,
    seedHtml: r.html,
    promotedFromRelease: r.id
  }, { actorId });
}
