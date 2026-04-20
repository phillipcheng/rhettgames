import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import * as db from './db.js';

// In-memory session table: token -> { userId, name, createdAt, lastSeen }
const sessions = new Map();
// userId -> token (to enforce single active session per account)
const userToSession = new Map();

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function now(){ return Date.now(); }

function newToken(){
  return crypto.randomBytes(24).toString('hex');
}

function validateName(name){
  if (typeof name !== 'string') return 'name required';
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 16) return 'name must be 2-16 chars';
  if (!/^[A-Za-z0-9_\-. ]+$/.test(trimmed)) return 'name has invalid characters';
  return null;
}

function validatePassword(pw){
  if (typeof pw !== 'string') return 'password required';
  if (pw.length < 4 || pw.length > 128) return 'password must be 4-128 chars';
  return null;
}

export async function register(name, password){
  const nameErr = validateName(name);
  if (nameErr) return { ok: false, error: nameErr };
  const pwErr = validatePassword(password);
  if (pwErr) return { ok: false, error: pwErr };

  const existing = db.findUserByName(name.trim());
  if (existing) return { ok: false, error: 'name taken' };

  const hash = await bcrypt.hash(password, 10);
  const user = db.createUser(name.trim(), hash);
  db.markLogin(user.id);
  // Fresh registrations are 'player' by default (column default); fetch it.
  const full = db.findUserById(user.id);
  return issueSession(user.id, user.name, (full && full.role) || 'player');
}

export async function login(name, password){
  if (typeof name !== 'string' || typeof password !== 'string') {
    return { ok: false, error: 'credentials required' };
  }
  const row = db.findUserByName(name.trim());
  if (!row) return { ok: false, error: 'invalid name or password' };
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return { ok: false, error: 'invalid name or password' };
  if (row.locked) return { ok: false, error: 'account locked — contact an admin' };
  db.markLogin(row.id);
  return issueSession(row.id, row.name, row.role || 'player');
}

function issueSession(userId, name, role){
  // Evict any previous session for this user
  const prev = userToSession.get(userId);
  if (prev) sessions.delete(prev);

  const token = newToken();
  const session = { token, userId, name, role: role || 'player', createdAt: now(), lastSeen: now() };
  sessions.set(token, session);
  userToSession.set(userId, token);
  return { ok: true, token, userId, name, role: session.role };
}

export function verifyToken(token){
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (now() - s.createdAt > SESSION_TTL_MS) {
    sessions.delete(token);
    userToSession.delete(s.userId);
    return null;
  }
  s.lastSeen = now();
  const fresh = db.findUserById(s.userId);
  if (!fresh || fresh.locked) {
    // Account deleted or locked — revoke the session immediately.
    sessions.delete(token);
    userToSession.delete(s.userId);
    return null;
  }
  s.role = fresh.role;
  return { userId: s.userId, name: s.name, role: s.role || 'player' };
}

export function logout(token){
  const s = sessions.get(token);
  if (!s) return;
  sessions.delete(token);
  if (userToSession.get(s.userId) === token) userToSession.delete(s.userId);
}
