import crypto from 'crypto';
import { getGame } from './games/index.js';
import * as db from './db.js';

// Room.status: 'waiting' | 'playing' | 'finished'

const rooms = new Map();           // roomId -> Room
const userToRoom = new Map();      // userId -> roomId

const EMPTY_TTL_MS = 30_000;

function newRoomId(){
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

export function createRoom(host, gameType, opts = {}){
  const gameEntry = getGame(gameType);
  if (!gameEntry) return { ok: false, error: 'unknown game type' };
  if (userToRoom.has(host.userId)) return { ok: false, error: 'already in a room' };

  let id;
  do { id = newRoomId(); } while (rooms.has(id));

  const room = {
    id,
    gameType,
    meta: gameEntry.meta,
    hostUserId: host.userId,
    members: [],                    // [{ userId, name, slot, ws }]
    status: 'waiting',
    game: null,                     // lazy: built on start
    matchId: null,
    createdAt: Date.now(),
    name: (opts.name || '').toString().trim().slice(0, 32) || null,
    emptySince: null
  };
  rooms.set(id, room);
  // Host auto-joins their own room
  attach(room, host);
  return { ok: true, room };
}

function attach(room, user){
  if (room.members.find(m => m.userId === user.userId)) return { ok: false, error: 'already in room' };
  if (room.members.length >= room.meta.maxPlayers) return { ok: false, error: 'room full' };
  const usedSlots = new Set(room.members.map(m => m.slot));
  let slot = -1;
  for (let i = 0; i < room.meta.maxPlayers; i++) {
    if (!usedSlots.has(i)) { slot = i; break; }
  }
  room.members.push({ userId: user.userId, name: user.name, slot, ws: user.ws });
  userToRoom.set(user.userId, room.id);
  room.emptySince = null;
  if (room.game) room.game.setName(slot, user.name);
  if (room.game && room.game.setActive) room.game.setActive(slot, true);
  return { ok: true, slot };
}

export function joinRoom(user, roomId){
  const room = rooms.get((roomId || '').toUpperCase());
  if (!room) return { ok: false, error: 'room not found' };
  if (userToRoom.has(user.userId)) return { ok: false, error: 'already in a room' };
  if (room.status === 'playing' && room.members.length >= room.meta.maxPlayers) {
    return { ok: false, error: 'match in progress' };
  }
  const res = attach(room, user);
  if (!res.ok) return res;
  return { ok: true, room, slot: res.slot };
}

export function leaveRoom(userId){
  const roomId = userToRoom.get(userId);
  if (!roomId) return null;
  const room = rooms.get(roomId);
  if (!room) { userToRoom.delete(userId); return null; }
  const idx = room.members.findIndex(m => m.userId === userId);
  if (idx >= 0) {
    const member = room.members[idx];
    // Credit accumulated play time up to this moment.
    if (member.playingSince) {
      const delta = Date.now() - member.playingSince;
      if (delta > 0) db.addPlayTime(userId, delta);
      member.playingSince = null;
    }
    // Snapshot their current stats so match_players is still accurate if they leave mid-match
    if (room.game && room.status === 'playing' && room.statsSnapshot) {
      const p = room.game.players[member.slot];
      if (p) {
        room.statsSnapshot[userId] = {
          kills: p.kills, deaths: p.deaths,
          damageDealt: p.damageDealt, weaponLevel: p.weaponLevel
        };
      }
    }
    room.members.splice(idx, 1);
    userToRoom.delete(userId);
    if (room.game) room.game.setName(member.slot, '');
    if (room.game) room.game.clearInput(member.slot);
    if (room.game && room.game.setActive) room.game.setActive(member.slot, false);
  }
  if (room.hostUserId === userId && room.members.length > 0) {
    room.hostUserId = room.members[0].userId;
  }
  if (room.members.length === 0) {
    if (room.status === 'playing' && room.matchId) {
      finalizePreviousMatch(room);
    }
    room.emptySince = Date.now();
    if (room.status === 'playing') room.status = 'finished';
  }
  return room;
}

export function startGame(userId){
  const roomId = userToRoom.get(userId);
  if (!roomId) return { ok: false, error: 'not in a room' };
  const room = rooms.get(roomId);
  if (!room) return { ok: false, error: 'room not found' };
  if (room.hostUserId !== userId) return { ok: false, error: 'only host can start' };
  if (room.members.length < room.meta.minPlayers) return { ok: false, error: 'need more players' };
  if (room.status === 'playing') return { ok: false, error: 'already playing' };

  const entry = getGame(room.gameType);
  room.game = entry.createInstance();
  // Mark slots active/inactive based on who's present.
  const occupied = new Set(room.members.map(m => m.slot));
  for (let slot = 0; slot < room.meta.maxPlayers; slot++) {
    if (room.game.setActive) room.game.setActive(slot, occupied.has(slot));
  }
  for (const m of room.members) {
    room.game.setName(m.slot, m.name);
  }
  // Start play-time tracking for every active member.
  const now = Date.now();
  for (const m of room.members) m.playingSince = now;
  room.roster = room.members.map(m => ({ userId: m.userId, slot: m.slot, name: m.name }));
  room.statsSnapshot = {};
  room.matchId = db.startMatch(room.gameType);
  room.status = 'playing';
  return { ok: true, room };
}

export function restartGame(userId){
  const roomId = userToRoom.get(userId);
  if (!roomId) return { ok: false, error: 'not in a room' };
  const room = rooms.get(roomId);
  if (!room) return { ok: false, error: 'room not found' };
  if (room.hostUserId !== userId) return { ok: false, error: 'only host can restart' };
  if (!room.game) return { ok: false, error: 'no game to restart' };

  // Finalise the previous match if it hasn't been already
  finalizePreviousMatch(room);

  room.game.reset();
  for (const m of room.members) room.game.setName(m.slot, m.name);
  room.matchId = db.startMatch(room.gameType);
  room.status = 'playing';
  return { ok: true, room };
}

export function findRoomByUser(userId){
  const roomId = userToRoom.get(userId);
  return roomId ? rooms.get(roomId) : null;
}

export function getRoom(roomId){
  return rooms.get(roomId) || null;
}

export function listRooms(){
  return Array.from(rooms.values()).map(r => ({
    id: r.id,
    name: r.name,
    gameType: r.gameType,
    gameLabel: r.meta.name,
    host: (r.members.find(m => m.userId === r.hostUserId) || {}).name || '???',
    players: r.members.map(m => ({ name: m.name, slot: m.slot })),
    status: r.status,
    max: r.meta.maxPlayers,
    min: r.meta.minPlayers
  }));
}

function finalizePreviousMatch(room){
  if (!room.matchId || !room.game) return;
  const g = room.game;
  const roster = room.roster || room.members.map(m => ({ userId: m.userId, slot: m.slot }));
  const playerRows = roster.map(r => {
    const present = room.members.find(m => m.userId === r.userId);
    if (present) {
      const p = g.players[r.slot];
      return {
        userId: r.userId, slot: r.slot,
        kills: p ? p.kills : 0,
        deaths: p ? p.deaths : 0,
        damageDealt: p ? p.damageDealt : 0,
        weaponLevel: p ? p.weaponLevel : 0
      };
    }
    const snap = (room.statsSnapshot || {})[r.userId] || {};
    return {
      userId: r.userId, slot: r.slot,
      kills: snap.kills || 0,
      deaths: snap.deaths || 0,
      damageDealt: snap.damageDealt || 0,
      weaponLevel: snap.weaponLevel || 0
    };
  });
  let winnerUserId = null;
  if (g.winner >= 0) {
    const winnerEntry = roster.find(r => r.slot === g.winner);
    if (winnerEntry) winnerUserId = winnerEntry.userId;
  }
  db.finishMatch(room.matchId, winnerUserId, playerRows);
  // Credit play-time for everyone still in the room at match-end.
  const now = Date.now();
  for (const m of room.members) {
    if (m.playingSince) {
      const delta = now - m.playingSince;
      if (delta > 0) db.addPlayTime(m.userId, delta);
      m.playingSince = now; // continue counting if they stay for a rematch
    }
  }
  room.matchId = null;
  room.statsSnapshot = {};
}

export function forEachRoom(fn){ rooms.forEach(fn); }

export function handleRoomTick(room, dt){
  if (!room.game || room.status !== 'playing') return;
  const hadWinner = room.game.winner >= 0;
  room.game.tick(dt);
  if (!hadWinner && room.game.winner >= 0) {
    room.status = 'finished';
    finalizePreviousMatch(room);
  }
}

export function sweepEmpty(){
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (room.members.length === 0 && room.emptySince && now - room.emptySince > EMPTY_TTL_MS) {
      if (room.matchId) finalizePreviousMatch(room);
      rooms.delete(id);
    }
  }
}
