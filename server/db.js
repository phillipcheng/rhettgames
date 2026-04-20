import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DB_DIR = path.join(ROOT, 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, 'rhett.db');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'player',
    created_at    INTEGER NOT NULL,
    last_login_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS matches (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    game_type     TEXT NOT NULL,
    started_at    INTEGER NOT NULL,
    ended_at      INTEGER,
    winner_user_id INTEGER,
    FOREIGN KEY (winner_user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_matches_game_type ON matches(game_type);
  CREATE INDEX IF NOT EXISTS idx_matches_ended_at ON matches(ended_at);

  CREATE TABLE IF NOT EXISTS match_players (
    match_id      INTEGER NOT NULL,
    user_id       INTEGER NOT NULL,
    slot          INTEGER NOT NULL,
    kills         INTEGER NOT NULL DEFAULT 0,
    deaths        INTEGER NOT NULL DEFAULT 0,
    damage_dealt  INTEGER NOT NULL DEFAULT 0,
    weapon_level  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (match_id, user_id),
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)  REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_match_players_user ON match_players(user_id);

  CREATE TABLE IF NOT EXISTS dev_games (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL,
    base_game_id  TEXT,
    title         TEXT NOT NULL,
    html          TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_dev_games_user ON dev_games(user_id);

  CREATE TABLE IF NOT EXISTS dev_messages (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    dev_game_id   INTEGER NOT NULL,
    role          TEXT NOT NULL,   -- 'user' | 'assistant' | 'system'
    content       TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    FOREIGN KEY (dev_game_id) REFERENCES dev_games(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_dev_messages_game ON dev_messages(dev_game_id, created_at);

  CREATE TABLE IF NOT EXISTS released_games (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    dev_game_id     INTEGER NOT NULL,
    author_user_id  INTEGER NOT NULL,
    version         INTEGER NOT NULL,
    title           TEXT NOT NULL,
    base_game_id    TEXT,
    html            TEXT NOT NULL,
    released_at     INTEGER NOT NULL,
    play_count      INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (dev_game_id)    REFERENCES dev_games(id) ON DELETE CASCADE,
    FOREIGN KEY (author_user_id) REFERENCES users(id),
    UNIQUE(dev_game_id, version)
  );
  CREATE INDEX IF NOT EXISTS idx_released_latest ON released_games(dev_game_id, version DESC);
  CREATE INDEX IF NOT EXISTS idx_released_recent ON released_games(released_at DESC);

  CREATE TABLE IF NOT EXISTS admin_actions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id     INTEGER NOT NULL,
    kind         TEXT NOT NULL,
    target       TEXT,
    details      TEXT,
    ok           INTEGER NOT NULL DEFAULT 1,
    created_at   INTEGER NOT NULL,
    FOREIGN KEY (actor_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_admin_actions_recent ON admin_actions(created_at DESC);

  CREATE TABLE IF NOT EXISTS login_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    ip         TEXT,
    user_agent TEXT,
    kind       TEXT NOT NULL,  -- 'login' | 'resume' | 'register'
    country    TEXT,
    region     TEXT,
    city       TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_login_events_user ON login_events(user_id, created_at DESC);
`);

// Migration: add geo columns to older login_events tables.
(function addLoginGeoIfMissing(){
  const cols = db.prepare("PRAGMA table_info(login_events)").all();
  const names = new Set(cols.map(c => c.name));
  if (!names.has('country')) db.exec("ALTER TABLE login_events ADD COLUMN country TEXT");
  if (!names.has('region'))  db.exec("ALTER TABLE login_events ADD COLUMN region TEXT");
  if (!names.has('city'))    db.exec("ALTER TABLE login_events ADD COLUMN city TEXT");
})();

// Migrations: add columns to older installs.
(function addMissingColumns(){
  const cols = db.prepare("PRAGMA table_info(users)").all();
  const names = new Set(cols.map(c => c.name));
  if (!names.has('role'))          db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'player'");
  if (!names.has('locked'))        db.exec("ALTER TABLE users ADD COLUMN locked INTEGER NOT NULL DEFAULT 0");
  if (!names.has('total_play_ms')) db.exec("ALTER TABLE users ADD COLUMN total_play_ms INTEGER NOT NULL DEFAULT 0");
})();

// Seed rhett + phillip as admins if they exist.
db.exec(`UPDATE users SET role = 'admin' WHERE name IN ('rhett', 'phillip') COLLATE NOCASE`);

const stmts = {
  insertUser: db.prepare(
    `INSERT INTO users (name, password_hash, created_at) VALUES (?, ?, ?)`
  ),
  findUserByName: db.prepare(
    `SELECT id, name, password_hash, role, locked FROM users WHERE name = ? COLLATE NOCASE`
  ),
  findUserById: db.prepare(
    `SELECT id, name, role, locked, total_play_ms, created_at, last_login_at FROM users WHERE id = ?`
  ),
  listUsers: db.prepare(
    `SELECT u.id, u.name, u.role, u.locked, u.total_play_ms,
            u.created_at, u.last_login_at,
            (SELECT COUNT(*) FROM match_players mp WHERE mp.user_id = u.id) AS matches_played
       FROM users u
       ORDER BY u.created_at ASC`
  ),
  setUserRole: db.prepare(
    `UPDATE users SET role = ? WHERE id = ?`
  ),
  setUserLocked: db.prepare(
    `UPDATE users SET locked = ? WHERE id = ?`
  ),
  addPlayTime: db.prepare(
    `UPDATE users SET total_play_ms = total_play_ms + ? WHERE id = ?`
  ),
  countAdmins: db.prepare(
    `SELECT COUNT(*) AS n FROM users WHERE role = 'admin'`
  ),
  deleteUser: db.prepare(
    `DELETE FROM users WHERE id = ?`
  ),
  nullOutWinner: db.prepare(
    `UPDATE matches SET winner_user_id = NULL WHERE winner_user_id = ?`
  ),
  deleteMatchPlayers: db.prepare(
    `DELETE FROM match_players WHERE user_id = ?`
  ),
  deleteDevGamesByUser: db.prepare(
    `DELETE FROM dev_games WHERE user_id = ?`
  ),
  deleteReleasesByUser: db.prepare(
    `DELETE FROM released_games WHERE author_user_id = ?`
  ),
  deleteAdminActionsByActor: db.prepare(
    `DELETE FROM admin_actions WHERE actor_id = ?`
  ),
  insertLoginEvent: db.prepare(
    `INSERT INTO login_events (user_id, ip, user_agent, kind, country, region, city, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ),
  recentLoginsForUser: db.prepare(
    `SELECT id, ip, user_agent, kind, country, region, city, created_at
       FROM login_events WHERE user_id = ?
       ORDER BY created_at DESC LIMIT 10`
  ),
  deleteLoginEventsByUser: db.prepare(
    `DELETE FROM login_events WHERE user_id = ?`
  ),
  insertAdminAction: db.prepare(
    `INSERT INTO admin_actions (actor_id, kind, target, details, ok, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ),
  listAdminActions: db.prepare(
    `SELECT a.id, a.actor_id, u.name AS actor_name,
            a.kind, a.target, a.details, a.ok, a.created_at
       FROM admin_actions a
       LEFT JOIN users u ON u.id = a.actor_id
       ORDER BY a.created_at DESC
       LIMIT 100`
  ),
  touchLogin: db.prepare(
    `UPDATE users SET last_login_at = ? WHERE id = ?`
  ),
  insertMatch: db.prepare(
    `INSERT INTO matches (game_type, started_at) VALUES (?, ?)`
  ),
  finalizeMatch: db.prepare(
    `UPDATE matches SET ended_at = ?, winner_user_id = ? WHERE id = ?`
  ),
  insertMatchPlayer: db.prepare(
    `INSERT INTO match_players (match_id, user_id, slot, kills, deaths, damage_dealt, weapon_level)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ),
  leaderboard: db.prepare(
    `SELECT u.id, u.name,
            COUNT(mp.match_id)                                  AS matches_played,
            COALESCE(SUM(mp.kills), 0)                          AS total_kills,
            COALESCE(SUM(mp.deaths), 0)                         AS total_deaths,
            SUM(CASE WHEN m.winner_user_id = u.id THEN 1 ELSE 0 END) AS wins
       FROM users u
       LEFT JOIN match_players mp ON mp.user_id = u.id
       LEFT JOIN matches m ON m.id = mp.match_id AND m.ended_at IS NOT NULL
      WHERE ? IS NULL OR m.game_type = ? OR m.id IS NULL
      GROUP BY u.id
      ORDER BY wins DESC, total_kills DESC
      LIMIT ?`
  ),
  profile: db.prepare(
    `SELECT u.id, u.name, u.created_at, u.last_login_at,
            COUNT(mp.match_id)          AS matches_played,
            COALESCE(SUM(mp.kills), 0)  AS total_kills,
            COALESCE(SUM(mp.deaths), 0) AS total_deaths,
            SUM(CASE WHEN m.winner_user_id = u.id THEN 1 ELSE 0 END) AS wins
       FROM users u
       LEFT JOIN match_players mp ON mp.user_id = u.id
       LEFT JOIN matches m ON m.id = mp.match_id AND m.ended_at IS NOT NULL
      WHERE u.id = ?
      GROUP BY u.id`
  )
};

export function createUser(name, passwordHash){
  const now = Date.now();
  const info = stmts.insertUser.run(name, passwordHash, now);
  return { id: info.lastInsertRowid, name, created_at: now };
}

export function findUserByName(name){
  return stmts.findUserByName.get(name) || null;
}

export function findUserById(id){
  return stmts.findUserById.get(id) || null;
}

export function listUsers(){
  return stmts.listUsers.all();
}

export function setUserRole(id, role){
  if (role !== 'admin' && role !== 'player') return false;
  return stmts.setUserRole.run(role, id).changes > 0;
}

export function setUserLocked(id, locked){
  return stmts.setUserLocked.run(locked ? 1 : 0, id).changes > 0;
}

export function addPlayTime(id, ms){
  if (!ms || ms <= 0) return;
  stmts.addPlayTime.run(Math.round(ms), id);
}

export function countAdmins(){
  return stmts.countAdmins.get().n;
}

// Transactional cascade delete. Returns true on success.
export const deleteUserCascade = db.transaction((id) => {
  stmts.nullOutWinner.run(id);
  stmts.deleteMatchPlayers.run(id);
  stmts.deleteReleasesByUser.run(id);
  stmts.deleteDevGamesByUser.run(id);       // cascade-deletes dev_messages
  stmts.deleteAdminActionsByActor.run(id);
  stmts.deleteLoginEventsByUser.run(id);
  stmts.deleteUser.run(id);
});

export function logLoginEvent(userId, { ip, userAgent, kind, country, region, city }){
  try {
    stmts.insertLoginEvent.run(
      userId, ip || null, userAgent || null, kind || 'login',
      country || null, region || null, city || null, Date.now()
    );
  } catch {}
}

export function recentLoginsForUser(userId){
  return stmts.recentLoginsForUser.all(userId);
}

export function logAdminAction({ actorId, kind, target, details, ok }){
  stmts.insertAdminAction.run(actorId, kind, target || null, details || null, ok ? 1 : 0, Date.now());
}

export function listAdminActions(){
  return stmts.listAdminActions.all();
}

export function markLogin(userId){
  stmts.touchLogin.run(Date.now(), userId);
}

export function startMatch(gameType){
  const info = stmts.insertMatch.run(gameType, Date.now());
  return info.lastInsertRowid;
}

export function finishMatch(matchId, winnerUserId, playerRows){
  const tx = db.transaction((matchId, winnerUserId, playerRows) => {
    stmts.finalizeMatch.run(Date.now(), winnerUserId || null, matchId);
    for (const r of playerRows) {
      stmts.insertMatchPlayer.run(
        matchId, r.userId, r.slot,
        r.kills | 0, r.deaths | 0, Math.round(r.damageDealt || 0), r.weaponLevel | 0
      );
    }
  });
  tx(matchId, winnerUserId, playerRows);
}

export function getLeaderboard(gameType, limit = 20){
  return stmts.leaderboard.all(gameType, gameType, limit);
}

export function getProfile(userId){
  return stmts.profile.get(userId) || null;
}

// -------- Dev studio --------

const devStmts = {
  createProject: db.prepare(
    `INSERT INTO dev_games (user_id, base_game_id, title, html, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ),
  updateHtml: db.prepare(
    `UPDATE dev_games SET html = ?, updated_at = ? WHERE id = ?`
  ),
  renameProject: db.prepare(
    `UPDATE dev_games SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?`
  ),
  deleteProject: db.prepare(
    `DELETE FROM dev_games WHERE id = ? AND user_id = ?`
  ),
  listByUser: db.prepare(
    `SELECT id, base_game_id, title, updated_at, created_at,
            (SELECT COUNT(*) FROM dev_messages WHERE dev_game_id = dev_games.id) AS message_count
       FROM dev_games
      WHERE user_id = ?
      ORDER BY updated_at DESC`
  ),
  getProject: db.prepare(
    `SELECT id, user_id, base_game_id, title, html, created_at, updated_at
       FROM dev_games
      WHERE id = ?`
  ),
  insertMessage: db.prepare(
    `INSERT INTO dev_messages (dev_game_id, role, content, created_at) VALUES (?, ?, ?, ?)`
  ),
  listMessages: db.prepare(
    `SELECT id, role, content, created_at FROM dev_messages
      WHERE dev_game_id = ? ORDER BY id ASC`
  )
};

export function createDevProject({ userId, baseGameId, title, html }){
  const now = Date.now();
  const info = devStmts.createProject.run(userId, baseGameId || null, title, html, now, now);
  return { id: info.lastInsertRowid, userId, baseGameId, title, html, createdAt: now, updatedAt: now };
}
export function updateDevHtml(id, html){
  devStmts.updateHtml.run(html, Date.now(), id);
}
export function renameDevProject(id, userId, title){
  devStmts.renameProject.run(title, Date.now(), id, userId);
}
export function deleteDevProject(id, userId){
  return devStmts.deleteProject.run(id, userId).changes > 0;
}
export function listDevProjects(userId){
  return devStmts.listByUser.all(userId);
}
export function getDevProject(id){
  return devStmts.getProject.get(id) || null;
}
export function insertDevMessage(devGameId, role, content){
  const now = Date.now();
  const info = devStmts.insertMessage.run(devGameId, role, content, now);
  return { id: info.lastInsertRowid, role, content, createdAt: now };
}
export function listDevMessages(devGameId){
  return devStmts.listMessages.all(devGameId);
}

// -------- Released games --------

const releaseStmts = {
  nextVersion: db.prepare(
    `SELECT COALESCE(MAX(version), 0) + 1 AS next FROM released_games WHERE dev_game_id = ?`
  ),
  insertRelease: db.prepare(
    `INSERT INTO released_games (dev_game_id, author_user_id, version, title, base_game_id, html, released_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ),
  getRelease: db.prepare(
    `SELECT r.id, r.dev_game_id, r.author_user_id, u.name AS author_name,
            r.version, r.title, r.base_game_id, r.html, r.released_at, r.play_count
       FROM released_games r
       JOIN users u ON u.id = r.author_user_id
      WHERE r.id = ?`
  ),
  listReleasesForDevGame: db.prepare(
    `SELECT id, version, title, released_at, play_count
       FROM released_games
      WHERE dev_game_id = ?
      ORDER BY version DESC`
  ),
  listPublished: db.prepare(
    `SELECT r.id, r.dev_game_id, r.author_user_id, u.name AS author_name,
            r.version, r.title, r.base_game_id, r.released_at, r.play_count
       FROM released_games r
       JOIN users u ON u.id = r.author_user_id
       JOIN (
         SELECT dev_game_id, MAX(version) AS mv
           FROM released_games GROUP BY dev_game_id
       ) m ON m.dev_game_id = r.dev_game_id AND m.mv = r.version
       ORDER BY r.released_at DESC
       LIMIT 50`
  ),
  bumpPlayCount: db.prepare(
    `UPDATE released_games SET play_count = play_count + 1 WHERE id = ?`
  )
};

export function releaseDevProject({ devGameId, authorUserId, title, baseGameId, html }){
  const next = releaseStmts.nextVersion.get(devGameId).next;
  const info = releaseStmts.insertRelease.run(
    devGameId, authorUserId, next, title, baseGameId || null, html, Date.now()
  );
  return {
    id: info.lastInsertRowid, devGameId, authorUserId,
    version: next, title, baseGameId: baseGameId || null,
    releasedAt: Date.now()
  };
}
export function getReleasedGame(id){
  return releaseStmts.getRelease.get(id) || null;
}
export function listDevGameReleases(devGameId){
  return releaseStmts.listReleasesForDevGame.all(devGameId);
}
export function listPublishedGames(){
  return releaseStmts.listPublished.all();
}
export function bumpPlayCount(id){
  releaseStmts.bumpPlayCount.run(id);
}
