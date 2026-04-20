import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import * as db from './db.js';
import * as claudeClient from './claude-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SEED_DIR = path.resolve(ROOT, 'games');
const PROJECTS_DIR = process.env.PROJECTS_DIR || path.join(ROOT, 'data', 'projects');

try { fs.mkdirSync(PROJECTS_DIR, { recursive: true }); } catch {}

const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MiB
const MAX_MESSAGE_CHARS = 4000;
const CHAT_TIMEOUT_MS = 300_000;

const SYSTEM_PROMPT = `You are a senior game-development engineer helping the user iterate on a \
single-file HTML browser game. The game lives in ONE file named "game.html" in your current \
working directory (HTML + CSS + JavaScript inline).

How to work:
- Use the Read tool to see the current state of game.html before making any edits.
- Use the Edit tool for surgical changes, or the Write tool if you must replace the whole file.
- Do NOT create or edit any file other than game.html.
- Keep the file self-contained: no external scripts, CDN imports, or remote asset URLs — the file \
runs inside a sandboxed iframe with no network access.
- Preserve everything the user hasn't explicitly asked to remove.

When you're done editing, reply to the user with a short natural-language summary (1-3 sentences) \
of what you changed. Do NOT paste or quote the code. The user can see the game in an iframe; they \
just want to know what you did.

If the user's request is ambiguous, make a reasonable assumption and note it in the summary. If \
you determine no change is needed, say so and don't modify the file.`;

function projectDir(id){
  return path.join(PROJECTS_DIR, String(id));
}
function projectFile(id){
  return path.join(projectDir(id), 'game.html');
}

function writeProjectFile(id, html){
  const dir = projectDir(id);
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  fs.writeFileSync(projectFile(id), html, 'utf8');
}
function readProjectFile(id){
  try { return fs.readFileSync(projectFile(id), 'utf8'); }
  catch { return null; }
}

function readSeed(baseGameId){
  if (baseGameId && /^[a-z0-9_-]+$/i.test(baseGameId)) {
    const p = path.join(SEED_DIR, baseGameId, 'seed.html');
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  }
  return minimalSeed();
}

function minimalSeed(){
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>New Game</title>
<style>html,body{margin:0;padding:0;background:#111;color:#fff;font-family:monospace;}
canvas{display:block;margin:20px auto;background:#222;border:1px solid #333;}</style>
</head>
<body>
<canvas id="c" width="800" height="600"></canvas>
<script>
const c = document.getElementById('c');
const ctx = c.getContext('2d');
ctx.fillStyle = '#fff';
ctx.font = '24px monospace';
ctx.fillText('Empty game — ask Claude to add stuff!', 80, 200);
</script>
</body>
</html>`;
}

function buildPrompt(project, history, userMessage){
  const convo = history
    .slice(-20)
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');
  return `PROJECT: ${project.title}
BASE GAME: ${project.base_game_id || '(none)'}
FILE TO EDIT: game.html (in your current working directory)

PRIOR CONVERSATION:
${convo || '(none yet)'}

LATEST USER MESSAGE:
${userMessage}

Read game.html, apply the requested change to it, then give a short summary of what you did.`;
}

export async function listProjects(userId){
  return db.listDevProjects(userId);
}

export function createProject({ userId, baseGameId, title }){
  const html = readSeed(baseGameId);
  const safeTitle = (title || '').toString().trim().slice(0, 80) ||
                    (baseGameId ? baseGameId + ' (my copy)' : 'Untitled game');
  const project = db.createDevProject({ userId, baseGameId: baseGameId || null, title: safeTitle, html });
  writeProjectFile(project.id, html);
  return {
    id: project.id,
    title: project.title,
    baseGameId: project.baseGameId,
    html,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  };
}

export function createProjectFromUpload({ userId, title, html }){
  if (typeof html !== 'string') return { ok: false, error: 'html required' };
  const trimmed = html.replace(/^\ufeff/, '').trimStart();
  if (trimmed.length < 20) return { ok: false, error: 'file too small' };
  if (html.length > MAX_HTML_BYTES) {
    return { ok: false, error: `file too large (max ${Math.floor(MAX_HTML_BYTES/1024)} KB)` };
  }
  const head = trimmed.slice(0, 1000).toLowerCase();
  if (!/<!doctype html|<html[\s>]/.test(head)) {
    return { ok: false, error: 'does not look like an HTML file (no <!doctype html> or <html> tag)' };
  }
  const safeTitle = (title || '').toString().trim().slice(0, 80) || 'Uploaded game';
  const project = db.createDevProject({ userId, baseGameId: null, title: safeTitle, html });
  writeProjectFile(project.id, html);
  return {
    ok: true,
    project: {
      id: project.id,
      title: project.title,
      baseGameId: null,
      html,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      latestVersion: 0
    }
  };
}

export function openProject(userId, id){
  const p = db.getDevProject(id);
  if (!p) return { ok: false, error: 'not found' };
  if (p.user_id !== userId) return { ok: false, error: 'forbidden' };
  // Make sure the on-disk copy exists (fresh host, or cleaned data dir)
  const onDisk = readProjectFile(id);
  const html = onDisk != null ? onDisk : p.html;
  if (onDisk == null) writeProjectFile(id, p.html);
  const messages = db.listDevMessages(id);
  const releases = db.listDevGameReleases(id);
  return {
    ok: true,
    project: {
      id: p.id,
      title: p.title,
      baseGameId: p.base_game_id,
      html,
      updatedAt: p.updated_at,
      createdAt: p.created_at,
      latestVersion: releases[0] ? releases[0].version : 0
    },
    messages
  };
}

export function rename(userId, id, title){
  const safe = (title || '').toString().trim().slice(0, 80);
  if (!safe) return { ok: false, error: 'title required' };
  db.renameDevProject(id, userId, safe);
  return { ok: true };
}

export function deleteProject(userId, id){
  const removed = db.deleteDevProject(id, userId);
  if (removed) {
    // Best-effort cleanup of the on-disk workspace
    try { fs.rmSync(projectDir(id), { recursive: true, force: true }); } catch {}
  }
  return { ok: removed };
}

// Streaming chat. Callbacks:
//   onUserEcho({ userMessage })         — immediate echo of the persisted user message
//   onChunk(delta)                      — streamed text deltas from Claude
//   onDone({ assistantMessage, htmlUpdated, html, usage, durationMs })
//   onError(err)
export async function chatStream(userId, id, message, { onUserEcho, onChunk, onDone, onError } = {}){
  if (typeof message !== 'string' || !message.trim()) {
    if (onError) onError(new Error('empty message'));
    return;
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    if (onError) onError(new Error(`message too long (max ${MAX_MESSAGE_CHARS} chars)`));
    return;
  }
  if (!claudeClient.isConfigured()) {
    if (onError) onError(new Error('claude worker not configured on server'));
    return;
  }

  const p = db.getDevProject(id);
  if (!p) { if (onError) onError(new Error('not found')); return; }
  if (p.user_id !== userId) { if (onError) onError(new Error('forbidden')); return; }

  if (readProjectFile(id) == null) writeProjectFile(id, p.html);

  const history = db.listDevMessages(id);
  const userMsg = db.insertDevMessage(id, 'user', message.trim());
  if (onUserEcho) onUserEcho({ userMessage: userMsg });

  const prompt = buildPrompt(p, history, message.trim());
  const t0 = Date.now();
  const tag = `[dev-chat user=${userId} project=${id}]`;
  console.log(`${tag} sent: ${JSON.stringify(message.trim().slice(0, 80))}`);

  let accumulated = '';

  await claudeClient.oneshotStream(
    {
      prompt,
      systemPrompt: SYSTEM_PROMPT,
      cwd: projectDir(id),
      allowedTools: ['Read', 'Edit', 'Write'],
      permissionMode: 'bypassPermissions',
      timeoutMs: CHAT_TIMEOUT_MS
    },
    {
      onChunk: (delta) => {
        accumulated += delta;
        if (onChunk) onChunk(delta);
      },
      onError: (err) => {
        const elapsed = Date.now() - t0;
        console.error(`${tag} FAILED after ${elapsed}ms: ${err.message}`);
        db.insertDevMessage(id, 'system', `[error calling claude worker: ${err.message}]`);
        if (onError) onError(err);
      },
      onDone: ({ durationMs }) => {
        const elapsed = Date.now() - t0;
        console.log(`${tag} completed in ${elapsed}ms (worker ${durationMs}ms), ${accumulated.length} chars`);
        const updatedHtml = readProjectFile(id);
        let htmlUpdated = false;
        if (updatedHtml != null && updatedHtml !== p.html) {
          if (updatedHtml.length > MAX_HTML_BYTES) {
            db.insertDevMessage(id, 'system',
              `[warn: new file is ${updatedHtml.length} bytes, exceeds ${MAX_HTML_BYTES} limit — changes rejected]`);
            writeProjectFile(id, p.html);
          } else {
            db.updateDevHtml(id, updatedHtml);
            htmlUpdated = true;
          }
        }
        const assistantText = accumulated.trim() || '(no summary)';
        const assistantMsg = db.insertDevMessage(id, 'assistant', assistantText);
        if (onDone) onDone({
          assistantMessage: assistantMsg,
          htmlUpdated,
          html: htmlUpdated ? updatedHtml : null,
          durationMs
        });
      }
    }
  );
}

export function release(userId, id){
  const p = db.getDevProject(id);
  if (!p) return { ok: false, error: 'not found' };
  if (p.user_id !== userId) return { ok: false, error: 'forbidden' };
  // Use the on-disk copy if present (authoritative), else the DB copy.
  const html = readProjectFile(id) || p.html;
  const rel = db.releaseDevProject({
    devGameId: id,
    authorUserId: userId,
    title: p.title,
    baseGameId: p.base_game_id,
    html
  });
  // Best-effort: push the HTML to a branch on the game's own repo so the
  // release has a git trail too. Runs async — failure is logged but does
  // not fail the release.
  if (p.base_game_id) {
    const author = db.findUserById(userId);
    pushReleaseToGameRepo({
      baseGameId: p.base_game_id,
      devGameId: id,
      version: rel.version,
      authorName: (author && author.name) || 'user' + userId,
      html
    }).catch(err => console.error('[dev-studio] game-repo push failed:', err.message));
  }
  return { ok: true, release: rel };
}

// Commit + push the HTML snapshot to a branch in the game's submodule repo.
// Branch name: release/<author>/<devGameId>/v<N>
async function pushReleaseToGameRepo({ baseGameId, devGameId, version, authorName, html }){
  const repoDir = path.join(ROOT, 'games', baseGameId);
  if (!fs.existsSync(path.join(repoDir, '.git'))) {
    console.log(`[dev-studio] ${baseGameId} is not a git submodule — skipping push`);
    return;
  }
  const safeAuthor = String(authorName).replace(/[^A-Za-z0-9_-]/g, '_');
  const branch = `release/${safeAuthor}/${devGameId}/v${version}`;
  const prev = (await runGitIn(repoDir, ['rev-parse', '--abbrev-ref', 'HEAD'])).out.trim() || 'main';

  try {
    // Always branch off the current main (fetch first so we're current).
    await runGitIn(repoDir, ['fetch', 'origin', 'main']);
    await runGitIn(repoDir, ['checkout', 'main']);
    await runGitIn(repoDir, ['pull', '--ff-only', 'origin', 'main']);
    await runGitIn(repoDir, ['checkout', '-B', branch]);
    fs.writeFileSync(path.join(repoDir, 'seed.html'), html);
    await runGitIn(repoDir, ['add', 'seed.html']);
    const status = await runGitIn(repoDir, ['status', '--porcelain']);
    if (!status.out.trim()) {
      console.log(`[dev-studio] ${baseGameId} ${branch}: no changes vs main, skipping push`);
    } else {
      const msg = `release v${version} by ${authorName} (dev-game ${devGameId})`;
      const author = `${authorName} <${safeAuthor}@rhettgames.local>`;
      await runGitIn(repoDir, ['commit', '-m', msg, '--author', author]);
      const push = await runGitIn(repoDir, ['push', 'origin', branch, '--force-with-lease']);
      if (push.code !== 0) {
        console.error(`[dev-studio] ${baseGameId} push failed:`, push.err.slice(0, 200));
      } else {
        console.log(`[dev-studio] pushed ${baseGameId} ${branch}`);
      }
    }
  } finally {
    // Leave the submodule on its previous ref so the platform keeps working.
    try { await runGitIn(repoDir, ['checkout', prev]); } catch {}
  }
}

function runGitIn(dir, args){
  return new Promise((resolve) => {
    const p = spawn('git', args, { cwd: dir });
    let out = '', err = '';
    p.stdout.on('data', d => out += d.toString());
    p.stderr.on('data', d => err += d.toString());
    p.on('close', code => resolve({ code, out, err }));
  });
}

export function listPublished(){
  return db.listPublishedGames();
}

export function openPublished(releaseId){
  const r = db.getReleasedGame(releaseId);
  if (!r) return { ok: false, error: 'not found' };
  db.bumpPlayCount(releaseId);
  return { ok: true, release: r };
}

export function forkRelease(userId, releaseId, title){
  const r = db.getReleasedGame(releaseId);
  if (!r) return { ok: false, error: 'release not found' };
  const safeTitle = (title || '').toString().trim().slice(0, 80) ||
                    (`Fork of ${r.title}`).slice(0, 80);
  const project = db.createDevProject({
    userId,
    baseGameId: r.base_game_id,
    title: safeTitle,
    html: r.html
  });
  writeProjectFile(project.id, r.html);
  // Seed the chat with a system note so the author sees where it came from.
  db.insertDevMessage(
    project.id, 'system',
    `Forked from "${r.title}" v${r.version} by ${r.author_name}. Chat with Claude to make it your own.`
  );
  const messages = db.listDevMessages(project.id);
  return {
    ok: true,
    project: {
      id: project.id,
      title: project.title,
      baseGameId: project.baseGameId,
      html: r.html,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      latestVersion: 0
    },
    messages
  };
}
