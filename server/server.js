import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import geoip from 'geoip-lite';

import * as users from './users.js';
import * as rooms from './rooms.js';
import * as db from './db.js';
import * as devStudio from './dev-studio.js';
import * as sysdev from './sysdev.js';
import * as claudeClient from './claude-client.js';
import { ensureBaseGamesPublished } from './bootstrap.js';
import { listGameMeta } from './games/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const TICK_HZ = 60;
const SEND_HZ = 30;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon'
};

function safeJoin(base, target){
  const resolved = path.resolve(base, '.' + target);
  if (!resolved.startsWith(base)) return null;
  return resolved;
}

function sendJson(res, code, obj){
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function handleHttp(req, res){
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURI(url.pathname);

  if (pathname === '/api/games') {
    return sendJson(res, 200, { games: listGameMeta() });
  }
  if (pathname === '/api/leaderboard') {
    const game = url.searchParams.get('game') || null;
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 20));
    return sendJson(res, 200, { rows: db.getLeaderboard(game, limit) });
  }
  if (pathname.startsWith('/api/profile/')) {
    const id = Number(pathname.slice('/api/profile/'.length));
    if (!Number.isFinite(id)) return sendJson(res, 400, { error: 'bad id' });
    const p = db.getProfile(id);
    if (!p) return sendJson(res, 404, { error: 'not found' });
    return sendJson(res, 200, p);
  }

  let filePath = null;
  let serveUrl = pathname === '/' ? '/index.html' : pathname;
  if (serveUrl.startsWith('/games/')) {
    // Game files live at <repo-root>/games/<id>/<file>
    filePath = safeJoin(ROOT, serveUrl);
  } else if (serveUrl.startsWith('/shared/')) {
    filePath = safeJoin(ROOT, serveUrl);
  } else {
    filePath = safeJoin(path.join(ROOT, 'public'), serveUrl);
  }
  if (!filePath) { res.writeHead(400); res.end('bad path'); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const httpServer = http.createServer(handleHttp);
const wss = new WebSocketServer({ server: httpServer });

// Connection state: ws -> { session: {userId, name} | null, lastSeq: 0 }
const conns = new Map();
// userId -> ws (so we can route lobby/room messages to everyone who should see them)
const userToWs = new Map();

function sendTo(ws, obj){
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function broadcast(wsSet, obj){
  const msg = JSON.stringify(obj);
  for (const ws of wsSet) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

function allAuthedSockets(){
  const out = new Set();
  for (const [ws, c] of conns) {
    if (c.session) out.add(ws);
  }
  return out;
}

function lobbySockets(){
  // Users in lobby = authed AND not currently in a room
  const out = new Set();
  for (const [ws, c] of conns) {
    if (c.session && !rooms.findRoomByUser(c.session.userId)) out.add(ws);
  }
  return out;
}

function roomSockets(room){
  return new Set(room.members.map(m => m.ws).filter(Boolean));
}

function lobbyPayload(){
  return {
    t: 'lobby',
    rooms: rooms.listRooms(),
    games: listGameMeta(),
    publishedGames: devStudio.listPublished()
  };
}

function roomPayload(room){
  return {
    t: 'room-update',
    room: {
      id: room.id,
      name: room.name,
      gameType: room.gameType,
      gameLabel: room.meta.name,
      clientModule: room.meta.clientModule,
      min: room.meta.minPlayers,
      max: room.meta.maxPlayers,
      hostUserId: room.hostUserId,
      status: room.status,
      members: room.members.map(m => ({ userId: m.userId, name: m.name, slot: m.slot }))
    }
  };
}

function broadcastLobby(){
  broadcast(lobbySockets(), lobbyPayload());
}

function broadcastRoom(room){
  broadcast(roomSockets(room), roomPayload(room));
}

function getRoomForConn(c){
  if (!c.session) return null;
  return rooms.findRoomByUser(c.session.userId);
}

function normalizeIp(raw){
  if (!raw) return '';
  // Strip IPv4-mapped IPv6 prefix like ::ffff:1.2.3.4
  return raw.replace(/^::ffff:/, '');
}

function geoLookup(ip){
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.')) {
    return { country: null, region: null, city: null };
  }
  try {
    const r = geoip.lookup(ip);
    if (!r) return { country: null, region: null, city: null };
    return { country: r.country || null, region: r.region || null, city: r.city || null };
  } catch { return { country: null, region: null, city: null }; }
}

wss.on('connection', (ws, req) => {
  // Capture IP + UA at connection time — used for login_events rows later.
  const fwd = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const rawIp = fwd || (req.socket && req.socket.remoteAddress) || '';
  const ip = normalizeIp(rawIp);
  const ua = (req.headers['user-agent'] || '').slice(0, 400);
  const geo = geoLookup(ip);
  const c = { session: null, lastSeq: 0, ip, ua, geo };
  conns.set(ws, c);
  sendTo(ws, { t: 'welcome', tickHz: TICK_HZ, sendHz: SEND_HZ, games: listGameMeta() });

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    await handleMessage(ws, c, msg);
  });

  ws.on('close', () => {
    if (c.session) {
      const userId = c.session.userId;
      userToWs.delete(userId);
      // Leave any room they were in
      const room = rooms.findRoomByUser(userId);
      if (room) {
        rooms.leaveRoom(userId);
        broadcastRoom(room);
        broadcastLobby();
      }
    }
    conns.delete(ws);
  });
});

async function handleMessage(ws, c, msg){
  const t = msg.t;

  if (t === 'register' || t === 'login') {
    const fn = t === 'register' ? users.register : users.login;
    const result = await fn(msg.name, msg.password);
    if (!result.ok) return sendTo(ws, { t: 'auth-failed', error: result.error });
    // If the user already has another socket logged in, close that one.
    const prevWs = userToWs.get(result.userId);
    if (prevWs && prevWs !== ws) {
      try { prevWs.close(1000, 'logged in elsewhere'); } catch {}
    }
    c.session = { userId: result.userId, name: result.name, role: result.role, token: result.token };
    userToWs.set(result.userId, ws);
    db.logLoginEvent(result.userId, { ip: c.ip, userAgent: c.ua, kind: t, ...c.geo });
    sendTo(ws, { t: 'auth-ok', userId: result.userId, name: result.name, role: result.role, token: result.token });
    sendTo(ws, lobbyPayload());
    return;
  }

  if (t === 'resume') {
    const sess = users.verifyToken(msg.token);
    if (!sess) return sendTo(ws, { t: 'auth-failed', error: 'session expired' });
    const prevWs = userToWs.get(sess.userId);
    if (prevWs && prevWs !== ws) {
      try { prevWs.close(1000, 'logged in elsewhere'); } catch {}
    }
    c.session = { userId: sess.userId, name: sess.name, role: sess.role, token: msg.token };
    userToWs.set(sess.userId, ws);
    db.logLoginEvent(sess.userId, { ip: c.ip, userAgent: c.ua, kind: 'resume', ...c.geo });
    sendTo(ws, { t: 'auth-ok', userId: sess.userId, name: sess.name, role: sess.role, token: msg.token });
    // If they were in a room, reattach their ws
    const room = rooms.findRoomByUser(sess.userId);
    if (room) {
      const member = room.members.find(m => m.userId === sess.userId);
      if (member) member.ws = ws;
      sendTo(ws, { t: 'room-joined', roomId: room.id, slot: member ? member.slot : -1 });
      sendTo(ws, roomPayload(room));
    } else {
      sendTo(ws, lobbyPayload());
    }
    return;
  }

  if (t === 'logout') {
    if (c.session) {
      users.logout(c.session.token);
      const room = rooms.findRoomByUser(c.session.userId);
      if (room) {
        rooms.leaveRoom(c.session.userId);
        broadcastRoom(room);
      }
      userToWs.delete(c.session.userId);
      c.session = null;
      broadcastLobby();
    }
    sendTo(ws, { t: 'logged-out' });
    return;
  }

  // Everything below requires auth
  if (!c.session) return sendTo(ws, { t: 'error', error: 'not logged in' });
  const me = { userId: c.session.userId, name: c.session.name, ws };

  if (t === 'create-room') {
    const res = rooms.createRoom(me, msg.gameType || 'gungame', { name: msg.name });
    if (!res.ok) return sendTo(ws, { t: 'error', error: res.error });
    const member = res.room.members.find(m => m.userId === me.userId);
    sendTo(ws, { t: 'room-joined', roomId: res.room.id, slot: member.slot });
    broadcastRoom(res.room);
    broadcastLobby();
    return;
  }

  if (t === 'join-room') {
    const res = rooms.joinRoom(me, msg.roomId);
    if (!res.ok) return sendTo(ws, { t: 'error', error: res.error });
    sendTo(ws, { t: 'room-joined', roomId: res.room.id, slot: res.slot });
    broadcastRoom(res.room);
    broadcastLobby();
    return;
  }

  if (t === 'leave-room') {
    const room = rooms.leaveRoom(me.userId);
    sendTo(ws, { t: 'left-room' });
    sendTo(ws, lobbyPayload());
    if (room) broadcastRoom(room);
    broadcastLobby();
    return;
  }

  if (t === 'start-game') {
    const res = rooms.startGame(me.userId);
    if (!res.ok) return sendTo(ws, { t: 'error', error: res.error });
    broadcastRoom(res.room);
    broadcastLobby();
    return;
  }

  if (t === 'restart-game') {
    const res = rooms.restartGame(me.userId);
    if (!res.ok) return sendTo(ws, { t: 'error', error: res.error });
    broadcastRoom(res.room);
    return;
  }

  if (t === 'lobby-list') {
    sendTo(ws, lobbyPayload());
    return;
  }

  // -------- Admin-only messages --------
  const isAdmin = () => {
    const fresh = users.verifyToken(c.session.token);
    if (fresh && fresh.role === 'admin') { c.session.role = 'admin'; return true; }
    return false;
  };

  if (t === 'admin-users-list') {
    if (!isAdmin()) return sendTo(ws, { t: 'error', error: 'admin only' });
    sendTo(ws, { t: 'admin-users-list', users: db.listUsers(), actions: db.listAdminActions() });
    return;
  }
  if (t === 'admin-set-role') {
    if (!isAdmin()) return sendTo(ws, { t: 'error', error: 'admin only' });
    const targetId = msg.userId | 0;
    const role = msg.role === 'admin' ? 'admin' : 'player';
    if (targetId === me.userId && role === 'player') {
      return sendTo(ws, { t: 'error', error: 'refusing to demote yourself' });
    }
    if (role === 'player') {
      // Don't demote the last remaining admin.
      const target = db.findUserById(targetId);
      if (target && target.role === 'admin' && db.countAdmins() <= 1) {
        return sendTo(ws, { t: 'error', error: 'refusing to demote last admin' });
      }
    }
    const ok = db.setUserRole(targetId, role);
    db.logAdminAction({ actorId: me.userId, kind: 'set-role', target: String(targetId), details: 'role=' + role, ok });
    sendTo(ws, { t: 'admin-users-list', users: db.listUsers(), actions: db.listAdminActions() });
    return;
  }
  if (t === 'admin-set-locked') {
    if (!isAdmin()) return sendTo(ws, { t: 'error', error: 'admin only' });
    const targetId = msg.userId | 0;
    const locked = !!msg.locked;
    if (targetId === me.userId && locked) {
      return sendTo(ws, { t: 'error', error: 'refusing to lock yourself' });
    }
    const ok = db.setUserLocked(targetId, locked);
    if (locked) {
      // Boot the target's active ws and session.
      const victim = userToWs.get(targetId);
      if (victim) {
        try { victim.close(1000, 'locked by admin'); } catch {}
      }
    }
    db.logAdminAction({ actorId: me.userId, kind: locked ? 'lock' : 'unlock', target: String(targetId), ok });
    sendTo(ws, { t: 'admin-users-list', users: db.listUsers(), actions: db.listAdminActions() });
    return;
  }
  if (t === 'admin-delete-user') {
    if (!isAdmin()) return sendTo(ws, { t: 'error', error: 'admin only' });
    const targetId = msg.userId | 0;
    if (targetId === me.userId) return sendTo(ws, { t: 'error', error: 'refusing to delete yourself' });
    const target = db.findUserById(targetId);
    if (!target) return sendTo(ws, { t: 'error', error: 'user not found' });
    if (target.role === 'admin' && db.countAdmins() <= 1) {
      return sendTo(ws, { t: 'error', error: 'refusing to delete last admin' });
    }
    // Kick them if online.
    const victim = userToWs.get(targetId);
    if (victim) { try { victim.close(1000, 'account deleted'); } catch {} }
    // If they're in a room, evict them.
    const room = rooms.findRoomByUser(targetId);
    if (room) rooms.leaveRoom(targetId);
    try { db.deleteUserCascade(targetId); }
    catch (err) {
      db.logAdminAction({ actorId: me.userId, kind: 'delete-user', target: String(targetId), details: err.message, ok: false });
      return sendTo(ws, { t: 'error', error: err.message });
    }
    db.logAdminAction({ actorId: me.userId, kind: 'delete-user', target: String(targetId), details: 'name=' + target.name, ok: true });
    sendTo(ws, { t: 'admin-users-list', users: db.listUsers(), actions: db.listAdminActions() });
    return;
  }
  if (t === 'admin-user-detail') {
    if (!isAdmin()) return sendTo(ws, { t: 'error', error: 'admin only' });
    const targetId = msg.userId | 0;
    const user = db.findUserById(targetId);
    if (!user) return sendTo(ws, { t: 'error', error: 'user not found' });
    const logins = db.recentLoginsForUser(targetId);
    sendTo(ws, { t: 'admin-user-detail', user, logins });
    return;
  }

  // -------- System Dev (admin only) --------
  if (t === 'sysdev-tree') {
    if (!isAdmin()) return sendTo(ws, { t: 'error', error: 'admin only' });
    const tree = sysdev.listTree();
    const diff = await sysdev.getDiff();
    const head = await sysdev.getHead();
    sendTo(ws, { t: 'sysdev-tree', tree, diff, head });
    return;
  }
  if (t === 'sysdev-chat') {
    if (!isAdmin()) return sendTo(ws, { t: 'error', error: 'admin only' });
    await sysdev.chatStream(msg.message || '', me, {
      onChunk: (delta) => sendTo(ws, { t: 'sysdev-chat-chunk', delta }),
      onDone:  ({ text, diff }) => sendTo(ws, { t: 'sysdev-chat-reply', text, diff }),
      onError: (err) => sendTo(ws, { t: 'sysdev-error', error: err.message || String(err) })
    });
    return;
  }
  if (t === 'sysdev-discard') {
    if (!isAdmin()) return sendTo(ws, { t: 'error', error: 'admin only' });
    await sysdev.discardChanges();
    const diff = await sysdev.getDiff();
    db.logAdminAction({ actorId: me.userId, kind: 'sysdev-discard', ok: true });
    sendTo(ws, { t: 'sysdev-status', text: 'discarded', diff, done: true });
    return;
  }
  if (t === 'sysdev-apply') {
    if (!isAdmin()) return sendTo(ws, { t: 'error', error: 'admin only' });
    sendTo(ws, { t: 'sysdev-status', text: 'committing + restarting…' });
    const res = await sysdev.applyChanges(me);
    if (!res.ok) return sendTo(ws, { t: 'sysdev-error', error: res.error });
    sendTo(ws, {
      t: 'sysdev-status',
      text: 'commit ' + res.newHead + ' · restart in 200ms — reconnect shortly',
      diff: '',
      done: false
    });
    return;
  }

  // -------- Dev studio --------
  if (t === 'dev-list') {
    const projects = await devStudio.listProjects(me.userId);
    sendTo(ws, { t: 'dev-list', projects, claudeAvailable: claudeClient.isConfigured() });
    return;
  }
  if (t === 'dev-create') {
    const project = devStudio.createProject({
      userId: me.userId,
      baseGameId: msg.baseGameId || null,
      title: msg.title || null
    });
    sendTo(ws, { t: 'dev-project', project, messages: [] });
    return;
  }
  if (t === 'dev-upload') {
    const res = devStudio.createProjectFromUpload({
      userId: me.userId,
      title: msg.title || null,
      html: msg.html || ''
    });
    if (!res.ok) return sendTo(ws, { t: 'error', error: res.error });
    sendTo(ws, { t: 'dev-project', project: res.project, messages: [] });
    return;
  }
  if (t === 'dev-open') {
    const res = devStudio.openProject(me.userId, msg.id | 0);
    if (!res.ok) return sendTo(ws, { t: 'error', error: res.error });
    sendTo(ws, { t: 'dev-project', project: res.project, messages: res.messages });
    return;
  }
  if (t === 'dev-rename') {
    const res = devStudio.rename(me.userId, msg.id | 0, msg.title);
    if (!res.ok) return sendTo(ws, { t: 'error', error: res.error });
    sendTo(ws, { t: 'dev-renamed', id: msg.id | 0, title: msg.title });
    return;
  }
  if (t === 'dev-delete') {
    const res = devStudio.deleteProject(me.userId, msg.id | 0);
    sendTo(ws, { t: 'dev-deleted', id: msg.id | 0, ok: res.ok });
    return;
  }
  if (t === 'dev-release') {
    const res = devStudio.release(me.userId, msg.id | 0);
    if (!res.ok) return sendTo(ws, { t: 'error', error: res.error });
    sendTo(ws, { t: 'dev-released', id: msg.id | 0, release: res.release });
    // Refresh published-games broadcast to everyone viewing the lobby
    broadcastLobby();
    return;
  }
  if (t === 'published-list') {
    sendTo(ws, { t: 'published-list', games: devStudio.listPublished() });
    return;
  }
  if (t === 'play-release-open') {
    const res = devStudio.openPublished(msg.releaseId | 0);
    if (!res.ok) return sendTo(ws, { t: 'error', error: res.error });
    sendTo(ws, { t: 'play-release', release: res.release });
    return;
  }
  if (t === 'dev-fork') {
    const res = devStudio.forkRelease(me.userId, msg.releaseId | 0, msg.title);
    if (!res.ok) return sendTo(ws, { t: 'error', error: res.error });
    sendTo(ws, { t: 'dev-project', project: res.project, messages: res.messages });
    return;
  }
  if (t === 'dev-chat') {
    const pid = msg.id | 0;
    sendTo(ws, { t: 'dev-thinking', id: pid });
    await devStudio.chatStream(me.userId, pid, msg.message || '', {
      onUserEcho: ({ userMessage }) =>
        sendTo(ws, { t: 'dev-chat-user-echo', id: pid, userMessage }),
      onChunk: (delta) =>
        sendTo(ws, { t: 'dev-chat-chunk', id: pid, delta }),
      onDone: ({ assistantMessage, htmlUpdated, html, durationMs }) =>
        sendTo(ws, {
          t: 'dev-chat-reply',
          id: pid,
          assistantMessage,
          htmlUpdated,
          html,
          durationMs
        }),
      onError: (err) =>
        sendTo(ws, { t: 'dev-error', id: pid, error: err.message || String(err) })
    });
    return;
  }

  if (t === 'input') {
    const room = rooms.findRoomByUser(me.userId);
    if (!room || !room.game) return;
    const member = room.members.find(m => m.userId === me.userId);
    if (!member) return;
    if (typeof msg.seq === 'number') {
      if (msg.seq <= c.lastSeq) return;
      c.lastSeq = msg.seq;
    }
    room.game.setInput(member.slot, msg);
    return;
  }
}

// ========= TICK LOOP =========
const tickMs = 1000 / TICK_HZ;
const sendMs = 1000 / SEND_HZ;
let lastTick = Date.now();
let sendAccum = 0;
let sweepAccum = 0;

setInterval(() => {
  const now = Date.now();
  const rawDt = Math.min(50, now - lastTick);
  lastTick = now;

  rooms.forEachRoom(room => rooms.handleRoomTick(room, rawDt));

  sendAccum += rawDt;
  if (sendAccum >= sendMs) {
    sendAccum = 0;
    rooms.forEachRoom(room => {
      if (!room.game) return;
      const snap = room.game.snapshot();
      broadcast(roomSockets(room), { t: 'state', roomId: room.id, ...snap });
    });
  }

  sweepAccum += rawDt;
  if (sweepAccum >= 10_000) {
    sweepAccum = 0;
    rooms.sweepEmpty();
    broadcastLobby();
  }
}, tickMs);

httpServer.listen(PORT, () => {
  console.log(`[rhett] http + ws on :${PORT}`);
  console.log(`[rhett] tick ${TICK_HZ}Hz, broadcast ${SEND_HZ}Hz`);
  try { ensureBaseGamesPublished(); } catch (e) { console.error('[bootstrap]', e); }
  sysdev.onBoot();
});
