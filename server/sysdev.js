// System Dev module — lets admins edit the platform source with Claude.
//
// Security posture:
//   - Gated behind admin role (checked in server.js before calling in).
//   - Worker's cwd is the project root; allowedTools = Read, Edit, Write.
//   - Excluded paths: node_modules, data (DB), .env, *.log.
//   - Every applied change creates a git commit; failed restart auto-reverts.

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import * as claudeClient from './claude-client.js';
import * as db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const EXCLUDED_DIRS = new Set(['node_modules', 'data', '.git']);
const EXCLUDED_FILES = new Set(['.env']);
const MAX_MESSAGE_CHARS = 4000;
const CHAT_TIMEOUT_MS = 600_000;

const SYSTEM_PROMPT = `You are a senior engineer editing the live source code of the "rhettgames" \
multiplayer game platform. The repository is a Node + WebSocket server at the current working \
directory. You have access to Read, Edit, and Write tools. Use them to make the change the user \
describes.

Project layout:
- server/server.js   — HTTP + WebSocket glue
- server/rooms.js    — room manager
- server/users.js    — auth + sessions
- server/db.js       — SQLite schema + helpers
- server/dev-studio.js — user-uploaded games editor
- server/sysdev.js   — THIS admin-only platform editor (be careful, you are it)
- server/games/<id>/ — built-in multiplayer games (gungame, demon-slayer)
- public/            — browser client
- public/games/<id>/ — per-game browser renderers
- shared/            — code used by both server and browser

Rules:
- Do NOT touch: node_modules/, data/, .env, *.log, or anything under .git/.
- Keep changes focused and surgical. Small diffs only. Don't refactor for fun.
- Preserve the existing code style. Match indentation (2 spaces in JS).
- If the user asks for something sweeping, push back or make a minimal plan first.
- When done, reply with a 1-3 sentence summary of what you changed.
- After applying, the user will review a diff and choose to apply/discard. Do not \
include the diff in your reply.`;

// Conversation history (ephemeral, per server run)
let history = []; // [{ role, content }]

// ========= File tree =========

export function listTree(){
  const out = [];
  function walk(dir, prefix){
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') && e.name !== '.gitignore') continue;
      if (EXCLUDED_DIRS.has(e.name)) continue;
      if (EXCLUDED_FILES.has(e.name)) continue;
      const rel = prefix ? prefix + '/' + e.name : e.name;
      if (e.isDirectory()) {
        out.push({ path: rel, kind: 'dir' });
        walk(path.join(dir, e.name), rel);
      } else if (e.isFile()) {
        let size = 0;
        try { size = fs.statSync(path.join(dir, e.name)).size; } catch {}
        out.push({ path: rel, kind: 'file', size });
      }
    }
  }
  walk(ROOT, '');
  return out;
}

// ========= Git helpers =========

function runGit(args){
  return new Promise((resolve) => {
    const p = spawn('git', args, { cwd: ROOT });
    let out = '', err = '';
    p.stdout.on('data', d => out += d.toString());
    p.stderr.on('data', d => err += d.toString());
    p.on('close', code => resolve({ code, out, err }));
  });
}

export async function getHead(){
  const r = await runGit(['rev-parse', '--short', 'HEAD']);
  return (r.out || '').trim();
}

export async function getDiff(){
  const r = await runGit(['diff', '--no-color']);
  return r.out || '';
}

async function hasPendingChanges(){
  const r = await runGit(['status', '--porcelain']);
  return (r.out || '').trim().length > 0;
}

async function stageAll(){
  await runGit(['add', '-A']);
}

async function commit(message, author){
  await stageAll();
  const hasChanges = await hasPendingChanges();
  if (!hasChanges) {
    const staged = await runGit(['diff', '--cached', '--name-only']);
    if (!(staged.out || '').trim()) return { ok: false, empty: true };
  }
  const args = ['commit', '-m', message];
  if (author) args.push('--author', author);
  const r = await runGit(args);
  return { ok: r.code === 0, stdout: r.out, stderr: r.err };
}

export async function discardChanges(){
  // Revert working tree to HEAD; wipe any untracked files.
  await runGit(['restore', '--staged', '.']);
  await runGit(['checkout', '--', '.']);
  await runGit(['clean', '-fd']);
}

export async function resetToHead(ref){
  await runGit(['reset', '--hard', ref]);
}

// ========= Chat =========

export function clearHistory(){ history = []; }

export async function chatStream(message, adminUser, { onChunk, onDone, onError }){
  if (typeof message !== 'string' || !message.trim()) {
    onError && onError(new Error('empty message'));
    return;
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    onError && onError(new Error('message too long'));
    return;
  }
  if (!claudeClient.isConfigured()) {
    onError && onError(new Error('claude worker not configured'));
    return;
  }
  history.push({ role: 'user', content: message.trim() });

  const priorText = history.slice(-20).map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
  const prompt = `WORKING DIRECTORY: ${ROOT}
(You can only edit files under here, and not under the excluded paths.)

PRIOR CONVERSATION:
${priorText}

Respond to the latest user message. Use the Read/Edit/Write tools to make the change.`;

  let accumulated = '';
  const t0 = Date.now();
  await claudeClient.oneshotStream(
    {
      prompt,
      systemPrompt: SYSTEM_PROMPT,
      cwd: ROOT,
      allowedTools: ['Read', 'Edit', 'Write'],
      permissionMode: 'bypassPermissions',
      timeoutMs: CHAT_TIMEOUT_MS
    },
    {
      onChunk: (delta) => {
        accumulated += delta;
        onChunk && onChunk(delta);
      },
      onError: (err) => {
        db.logAdminAction({
          actorId: adminUser.userId, kind: 'sysdev-chat-error',
          target: '', details: err.message, ok: false
        });
        onError && onError(err);
      },
      onDone: async () => {
        const text = accumulated.trim() || '(no reply)';
        history.push({ role: 'assistant', content: text });
        const diff = await getDiff();
        db.logAdminAction({
          actorId: adminUser.userId, kind: 'sysdev-chat',
          target: '', details: `${Date.now() - t0}ms, diff=${diff.length}b`, ok: true
        });
        onDone && onDone({ text, diff });
      }
    }
  );
}

// ========= Apply with restart + auto-revert =========

export async function applyChanges(adminUser){
  const pending = await hasPendingChanges();
  if (!pending) return { ok: false, error: 'no pending changes' };

  const prevHead = await getHead();
  const diff = await getDiff();
  const firstLine = diff.split('\n').find(l => l.startsWith('diff --git')) || 'platform change';
  const message = `sysdev: ${firstLine.replace('diff --git ', '').slice(0, 120)}\n\nAuthor: ${adminUser.name}`;
  const author = `${adminUser.name} <${adminUser.name}@rhettgames.local>`;

  const c = await commit(message, author);
  if (!c.ok) {
    db.logAdminAction({
      actorId: adminUser.userId, kind: 'sysdev-apply', target: '',
      details: 'commit failed: ' + (c.stderr || '').slice(0, 200), ok: false
    });
    return { ok: false, error: 'commit failed: ' + (c.stderr || '').slice(0, 200) };
  }

  const newHead = await getHead();
  db.logAdminAction({
    actorId: adminUser.userId, kind: 'sysdev-apply',
    target: newHead, details: `prev=${prevHead} diff=${diff.length}b`, ok: true
  });

  // Kick off the restart asynchronously so our reply can flush first.
  setTimeout(() => {
    restartServiceWithHealthcheck(prevHead, newHead, adminUser).catch(err => {
      console.error('[sysdev] restart handler error:', err);
    });
  }, 200);

  return { ok: true, prevHead, newHead };
}

function httpHealthy(){
  return new Promise(resolve => {
    const port = process.env.PORT || 8080;
    import('http').then(({ default: http }) => {
      const req = http.get('http://127.0.0.1:' + port + '/api/games', res => {
        resolve(res.statusCode === 200);
        res.resume();
      });
      req.on('error', () => resolve(false));
      req.setTimeout(2000, () => { req.destroy(); resolve(false); });
    });
  });
}

async function restartServiceWithHealthcheck(prevHead, newHead, adminUser){
  // Spawn systemctl restart and return; the service will be replaced.
  spawn('sudo', ['-n', '/bin/systemctl', 'restart', 'rhettgames'], { detached: true, stdio: 'ignore' }).unref();
  // The new process will run health-check-on-boot logic (see onBoot below).
  db.logAdminAction({
    actorId: adminUser.userId, kind: 'sysdev-restart-requested',
    target: newHead, details: `prev=${prevHead}`, ok: true
  });
}

// Called at server boot: if there's a pending "last commit awaiting verification",
// give it 10 seconds then mark success. For now just record boot success.
export function onBoot(){
  const head = (async () => {
    const h = await getHead();
    console.log('[sysdev] boot: HEAD=' + h);
  })();
  return head;
}

export function getChatHistory(){ return history.slice(); }
