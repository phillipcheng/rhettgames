import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import * as db from './db.js';
import { sendResetCode } from './email.js';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const RESET_TTL_MS   = 1000 * 60 * 15;           // 15 minutes

// Sweep expired sessions and reset codes on boot.
db.deleteExpiredSessions(Date.now() - SESSION_TTL_MS);
db.deleteExpiredResets(Date.now() - RESET_TTL_MS);

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

function validateEmail(email){
  if (typeof email !== 'string' || !email.trim()) return 'email required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'invalid email';
  if (email.trim().length > 254) return 'email too long';
  return null;
}

export async function register(name, password, email){
  const nameErr = validateName(name);
  if (nameErr) return { ok: false, error: nameErr };
  const pwErr = validatePassword(password);
  if (pwErr) return { ok: false, error: pwErr };
  const emailErr = validateEmail(email);
  if (emailErr) return { ok: false, error: emailErr };

  const existing = db.findUserByName(name.trim());
  if (existing) return { ok: false, error: 'name taken' };

  const existingEmail = db.findUserByEmail(email.trim());
  if (existingEmail) return { ok: false, error: 'email already registered' };

  const hash = await bcrypt.hash(password, 10);
  const user = db.createUser(name.trim(), hash, email.trim());
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
  // Evict any previous sessions for this user (single active session policy).
  db.deleteSessionsForUser(userId);
  const token = newToken();
  db.insertSession(token, userId, name);
  return { ok: true, token, userId, name, role: role || 'player' };
}

export function verifyToken(token){
  if (!token) return null;
  const s = db.findSession(token);
  if (!s) return null;
  if (now() - s.created_at > SESSION_TTL_MS) {
    db.deleteSession(token);
    return null;
  }
  const fresh = db.findUserById(s.user_id);
  if (!fresh || fresh.locked) {
    // Account deleted or locked — revoke the session immediately.
    db.deleteSession(token);
    return null;
  }
  db.touchSession(token);
  return { userId: s.user_id, name: s.name, role: fresh.role || 'player' };
}

export function logout(token){
  if (!token) return;
  db.deleteSession(token);
}

export async function requestPasswordReset(nameOrEmail){
  if (typeof nameOrEmail !== 'string' || !nameOrEmail.trim()) {
    return { ok: false, error: 'enter your username or email' };
  }
  const q = nameOrEmail.trim();
  const user = db.findUserByName(q) || db.findUserByEmail(q);
  if (!user || !user.email) {
    return { ok: false, error: 'no account with that name/email found, or no email on file' };
  }
  if (user.locked) return { ok: false, error: 'account locked — contact an admin' };

  // Generate a 6-digit code.
  const code = String(crypto.randomInt(100000, 999999));
  db.insertResetCode(user.id, code);

  const sent = await sendResetCode(user.email, code, user.name);
  if (!sent) return { ok: false, error: 'failed to send email — try again later' };

  return { ok: true, userId: user.id, name: user.name };
}

export async function resetPassword(userId, code, newPassword){
  const pwErr = validatePassword(newPassword);
  if (pwErr) return { ok: false, error: pwErr };

  const reset = db.findResetCode(userId, code);
  if (!reset) return { ok: false, error: 'invalid or expired code' };
  if (Date.now() - reset.created_at > RESET_TTL_MS) {
    return { ok: false, error: 'code expired — request a new one' };
  }

  const hash = await bcrypt.hash(newPassword, 10);
  db.setUserPassword(userId, hash);
  db.markResetUsed(reset.id);
  // Invalidate all existing sessions for this user.
  db.deleteSessionsForUser(userId);

  return { ok: true };
}
