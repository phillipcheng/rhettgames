// ============ App router: auth → lobby → room → game ============

const overlay = document.getElementById('overlay');
const canvasStage = document.getElementById('canvas-stage');
const canvas = document.getElementById('game');
const connDot = document.getElementById('conn-indicator');
const connText = document.getElementById('conn-text');
const ingameControls = document.getElementById('ingame-controls');
const quitGameBtn = document.getElementById('quitGameBtn');

// Views
const views = {
  login:   document.getElementById('view-login'),
  lobby:   document.getElementById('view-lobby'),
  room:    document.getElementById('view-room'),
  win:     document.getElementById('view-win'),
  'dev-list': document.getElementById('view-dev-list'),
  studio:  document.getElementById('view-studio'),
  'play-release': document.getElementById('view-play-release'),
  'admin-users': document.getElementById('view-admin-users'),
  sysdev:  document.getElementById('view-sysdev')
};

// Login UI
const tabs = document.querySelectorAll('.form-tab');
const authName = document.getElementById('authName');
const authPass = document.getElementById('authPass');
const authBtn  = document.getElementById('authBtn');
const authError = document.getElementById('authError');

// Lobby UI
const lobbyUserName = document.getElementById('lobbyUserName');
const roomList = document.getElementById('roomList');
const gamePicker = document.getElementById('gamePicker');
const createRoomBtn = document.getElementById('createRoomBtn');
const logoutBtn = document.getElementById('logoutBtn');
const refreshLobbyBtn = document.getElementById('refreshLobbyBtn');
const leaderboardEl = document.getElementById('leaderboard');
const devModeBtn = document.getElementById('devModeBtn');
const adminBtn   = document.getElementById('adminBtn');
const sysDevBtn  = document.getElementById('sysDevBtn');

// Admin
const adminUserName = document.getElementById('adminUserName');
const adminBackBtn  = document.getElementById('adminBackBtn');
const usersTableEl  = document.getElementById('usersTable');
const adminActionsLogEl = document.getElementById('adminActionsLog');
const userDetailPanel = document.getElementById('userDetailPanel');
const userDetailTitle = document.getElementById('userDetailTitle');
const userDetailBody  = document.getElementById('userDetailBody');
const userDetailClose = document.getElementById('userDetailClose');
userDetailClose.addEventListener('click', () => userDetailPanel.style.display = 'none');

// Add-game modal
// addGameStatus element is gone from the admin view; all status now goes to createGameStatus in Dev Mode.
const addGameStatusEl = { textContent: '' };
const addGameModal    = document.getElementById('addGameModal');
const addGameModalSub = document.getElementById('addGameModalSub');
const addGameCancel   = document.getElementById('addGameCancel');
const addGameSubmit   = document.getElementById('addGameSubmit');
const addGameError    = document.getElementById('addGameError');
const newGameId   = document.getElementById('newGameId');
const newGameName = document.getElementById('newGameName');
const newGameDesc = document.getElementById('newGameDesc');
const newGameMin  = document.getElementById('newGameMin');
const newGameMax  = document.getElementById('newGameMax');
const adminGamesListEl = document.getElementById('adminGamesList');

let promoteReleaseId = null;
let promoteProject = null;

function openAddGameModal({ promoteFromRelease, promoteFromProject } = {}){
  promoteReleaseId = promoteFromRelease || null;
  promoteProject   = promoteFromProject || null;
  addGameError.textContent = '';
  newGameId.value = '';
  newGameId.dataset.userEdited = '';
  const promoteSrc = promoteFromRelease || promoteFromProject;
  newGameName.value = promoteSrc ? (promoteSrc.title || '') : '';
  newGameDesc.value = promoteSrc ? ('Promoted from "' + promoteSrc.title + '"') : '';
  newGameMin.value = '1';
  newGameMax.value = '2';
  populateBasesDropdown();
  document.querySelectorAll('input[name="startPoint"]').forEach(r => { r.checked = (r.value === 'blank'); });
  if (newGameUpload) newGameUpload.value = '';

  const isAdmin = !!(session && session.role === 'admin');
  multiplayerSection.style.display = isAdmin ? 'block' : 'none';

  if (promoteSrc) {
    addGameTitle.textContent = 'PROMOTE TO MULTIPLAYER';
    addGameModalSub.textContent = promoteFromRelease
      ? 'Promote "' + promoteSrc.title + '" (published v' + promoteFromRelease.version + ') into its own multiplayer repo. The release HTML becomes the new repo\'s seed.html.'
      : 'Promote "' + promoteSrc.title + '" (dev project, not yet published) into its own multiplayer repo. The current project HTML becomes the new repo\'s seed.html.';
    newGameMultiChk.checked = true;
    multiplayerFields.style.display = 'block';
    // Pre-fill repo id from title
    newGameId.value = slugify(promoteSrc.title || '');
    // Starting point is fixed on promote — source already decided
    document.querySelectorAll('input[name="startPoint"]').forEach(r => r.disabled = true);
  } else {
    addGameTitle.textContent = 'CREATE GAME';
    addGameModalSub.textContent = 'A new project you can iterate on with Claude. Publish when ready.';
    newGameMultiChk.checked = false;
    multiplayerFields.style.display = 'none';
    document.querySelectorAll('input[name="startPoint"]').forEach(r => r.disabled = false);
  }

  addGameModal.style.display = 'flex';
  newGameName.focus();
}
function closeAddGameModal(){
  addGameModal.style.display = 'none';
  promoteReleaseId = null;
  promoteProject   = null;
  document.querySelectorAll('input[name="startPoint"]').forEach(r => r.disabled = false);
  addGameSubmit.disabled = false;
}

addGameCancel.addEventListener('click', closeAddGameModal);

addGameSubmit.addEventListener('click', async () => {
  const name = (newGameName.value || '').trim();
  if (!name) { addGameError.textContent = 'name required'; return; }
  const startPoint = (document.querySelector('input[name="startPoint"]:checked') || {}).value || 'blank';
  const multiplayer = !!(newGameMultiChk && newGameMultiChk.checked);

  // Read the uploaded HTML up-front if needed.
  let seedHtml = null;
  if (promoteReleaseId) {
    // Server looks up the release by id; no need to upload
  } else if (startPoint === 'upload') {
    const f = newGameUpload && newGameUpload.files && newGameUpload.files[0];
    if (!f) { addGameError.textContent = 'choose an HTML file'; return; }
    if (f.size > MAX_UPLOAD_BYTES) { addGameError.textContent = 'file too large (max 2 MB)'; return; }
    try { seedHtml = await f.text(); }
    catch { addGameError.textContent = 'could not read file'; return; }
    if (!/<!doctype html|<html[\s>]/i.test(seedHtml.slice(0, 1000))) {
      addGameError.textContent = 'does not look like HTML'; return;
    }
  }

  addGameError.textContent = '';
  createGameStatus.textContent = 'working…';
  addGameStatusEl.textContent = 'working…';
  addGameSubmit.disabled = true;

  if (multiplayer) {
    const id = (newGameId.value || '').trim().toLowerCase();
    const description = (newGameDesc.value || '').trim();
    const minPlayers = Math.max(1, Math.min(8, Number(newGameMin.value) || 1));
    const maxPlayers = Math.max(1, Math.min(8, Number(newGameMax.value) || 2));
    if (!/^[a-z][a-z0-9-]{1,40}$/.test(id)) {
      addGameError.textContent = 'repo id must match /^[a-z][a-z0-9-]*$/';
      addGameSubmit.disabled = false; createGameStatus.textContent = ''; return;
    }
    if (promoteReleaseId) {
      send({ t: 'admin-promote-game', releaseId: promoteReleaseId.id, id, name, description, minPlayers, maxPlayers });
    } else if (promoteProject) {
      send({ t: 'admin-add-game', id, name, description, minPlayers, maxPlayers, devGameId: promoteProject.id });
    } else {
      const payload = { t: 'admin-add-game', id, name, description, minPlayers, maxPlayers };
      if (startPoint === 'upload' && seedHtml) payload.seedHtml = seedHtml;
      else if (startPoint === 'base' && newGameBaseSel.value) payload.baseGameId = newGameBaseSel.value;
      send(payload);
    }
    // The admin-game-status handler will close/update.
    return;
  }

  // Single-player path: creates a dev project (no repo).
  if (startPoint === 'blank') {
    // Platform uses a null baseGameId → minimal seed.
    send({ t: 'dev-create', baseGameId: null, title: name });
  } else if (startPoint === 'base') {
    const base = newGameBaseSel.value;
    send({ t: 'dev-create', baseGameId: base || null, title: name });
  } else if (startPoint === 'upload') {
    send({ t: 'dev-upload', title: name, html: seedHtml });
  }
  closeAddGameModal();
  createGameStatus.textContent = 'creating project…';
  setTimeout(() => { createGameStatus.textContent = ''; }, 5000);
});

function renderAdminGamesList(){
  // Cheap: just show the known availableGames + a note
  if (!availableGames || availableGames.length === 0) { adminGamesListEl.innerHTML = '<div class="empty-list">(none registered)</div>'; return; }
  adminGamesListEl.innerHTML = availableGames.map(g =>
    `<div style="padding:6px 0;border-bottom:1px solid #2a2a40;">
       <span style="color:#fff;font-weight:bold;">${escapeHtml(g.name)}</span>
       <span style="color:#789;">· <code>${escapeHtml(g.id)}</code> · ${g.minPlayers}-${g.maxPlayers} players</span>
     </div>`
  ).join('');
}

// System dev
const sysDevStatusEl = document.getElementById('sysDevStatus');
const sysDevTreeEl   = document.getElementById('sysDevTree');
const sysDevChatEl   = document.getElementById('sysDevChat');
const sysDevInputEl  = document.getElementById('sysDevInput');
const sysDevSendBtn  = document.getElementById('sysDevSend');
const sysDevDiffEl   = document.getElementById('sysDevDiff');
const sysDevApplyBtn = document.getElementById('sysDevApply');
const sysDevDiscardBtn = document.getElementById('sysDevDiscard');
const sysDevRefreshBtn = document.getElementById('sysDevRefreshBtn');
const sysDevBackBtn    = document.getElementById('sysDevBackBtn');

// Dev list UI
const devUserName = document.getElementById('devUserName');
const devBackBtn = document.getElementById('devBackBtn');
const projectList = document.getElementById('projectList');
const availableListEl = document.getElementById('availableList');
const newProjectTitle = document.getElementById('newProjectTitle');
const devUnavailable = document.getElementById('devUnavailable');

// Studio UI
const studioProjectTitle = document.getElementById('studioProjectTitle');
const studioProjectSub = document.getElementById('studioProjectSub');
const studioFrame = document.getElementById('studioFrame');
const reloadFrameBtn = document.getElementById('reloadFrameBtn');
const studioBackBtn = document.getElementById('studioBackBtn');
const chatMessagesEl = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const chatSend = document.getElementById('chatSend');
const releaseBtn = document.getElementById('releaseBtn');

// Play-release UI
const playTitleEl = document.getElementById('playTitle');
const playSubEl = document.getElementById('playSub');
const playFrame = document.getElementById('playFrame');
const playReloadBtn = document.getElementById('playReloadBtn');
const playBackBtn = document.getElementById('playBackBtn');

// Room UI
const roomTitleEl = document.getElementById('roomTitle');
const roomCodeEl = document.getElementById('roomCode');
const roomGameLabelEl = document.getElementById('roomGameLabel');
const roomStatusEl = document.getElementById('roomStatus');
const membersListEl = document.getElementById('membersList');
const startGameBtn = document.getElementById('startGameBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');

// Win UI
const winHeader = document.getElementById('winHeader');
const winSub = document.getElementById('winSub');
const winStats = document.getElementById('winStats');
const rematchBtn = document.getElementById('rematchBtn');
const backToLobbyBtn = document.getElementById('backToLobbyBtn');

// ============ State ============
const SAVED_TOKEN_KEY = 'rhett.token';
const SAVED_NAME_KEY  = 'rhett.lastName';

let ws = null;
let session = null;              // { userId, name, token }
let availableGames = [];         // [{ id, name, description, minPlayers, maxPlayers, clientModule }]
let selectedGameId = 'gungame';
let currentRoom = null;          // full room payload
let mySlot = -1;
let authTab = 'login';           // 'login' | 'register'

let gameClient = null;           // { onState, onRoomUpdate, destroy }

// Dev studio state
let devSelectedBaseGame = 'gungame';
let devClaudeAvailable = true;
let currentStudioProject = null;   // { id, title, baseGameId, html, updatedAt }
let studioThinking = false;

// ============ View switching ============
function showView(name){
  for (const k in views) views[k].classList.toggle('active', k === name);
  const inGame = name === null;
  overlay.classList.toggle('hidden', inGame);
  canvasStage.classList.toggle('active', inGame || name === 'win');
  ingameControls.classList.toggle('visible', inGame);
  canvas.focus();
}

function quitGame(){
  if (!currentRoom) return;
  if (!confirm('Leave this game and return to the lobby?')) return;
  send({ t: 'leave-room' });
}
quitGameBtn.addEventListener('click', quitGame);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && currentRoom && ingameControls.classList.contains('visible')) {
    e.preventDefault();
    quitGame();
  }
});

function setConn(ok, label){
  connDot.classList.toggle('bad', !ok);
  connText.textContent = label;
}

// ============ Auth UI ============
tabs.forEach(t => t.addEventListener('click', () => {
  authTab = t.dataset.tab;
  for (const x of tabs) x.classList.toggle('active', x === t);
  authBtn.textContent = authTab === 'login' ? 'LOGIN' : 'REGISTER';
  authError.textContent = '';
}));

authName.value = localStorage.getItem(SAVED_NAME_KEY) || '';

authBtn.addEventListener('click', () => submitAuth());
authPass.addEventListener('keydown', e => { if (e.key === 'Enter') submitAuth(); });
authName.addEventListener('keydown', e => { if (e.key === 'Enter') authPass.focus(); });

function submitAuth(){
  const name = authName.value.trim();
  const pass = authPass.value;
  if (!name || !pass) { authError.textContent = 'Enter name and password'; return; }
  localStorage.setItem(SAVED_NAME_KEY, name);
  send({ t: authTab, name, password: pass });
  authError.textContent = 'Signing in…';
}

// ============ Lobby UI ============
logoutBtn.addEventListener('click', () => {
  localStorage.removeItem(SAVED_TOKEN_KEY);
  send({ t: 'logout' });
});
refreshLobbyBtn.addEventListener('click', () => {
  send({ t: 'lobby-list' });
  fetchLeaderboard();
});
createRoomBtn.addEventListener('click', () => {
  if (!selectedGameId) return;
  send({ t: 'create-room', gameType: selectedGameId });
});

function renderGamePicker(){
  gamePicker.innerHTML = '';
  for (const g of availableGames) {
    const el = document.createElement('div');
    el.className = 'game-option' + (g.id === selectedGameId ? ' selected' : '');
    el.innerHTML = `<span class="label">${escapeHtml(g.name)}</span>
                    <span class="hint">${g.minPlayers}-${g.maxPlayers} players · ${escapeHtml(g.description || '')}</span>`;
    el.addEventListener('click', () => {
      selectedGameId = g.id;
      renderGamePicker();
    });
    gamePicker.appendChild(el);
  }
}

function renderRoomList(rooms){
  roomList.innerHTML = '';
  const joinable = rooms.filter(r => r.status !== 'finished');
  if (joinable.length === 0) {
    roomList.innerHTML = '<div class="empty-list">No open games. Create one →</div>';
    return;
  }
  for (const r of joinable) {
    const el = document.createElement('div');
    el.className = 'room-row';
    const isFull = r.players.length >= r.max;
    const playing = r.status === 'playing';
    el.innerHTML = `
      <div class="meta">
        <span class="code">${r.id}</span>
        <span class="sub">${escapeHtml(r.gameLabel)} · ${escapeHtml(r.host)}${r.players.length ? ' + ' + (r.players.length - 1) + ' more' : ''} (${r.players.length}/${r.max})</span>
      </div>
      <div>
        <span class="status ${r.status}">${r.status.toUpperCase()}</span>
      </div>
    `;
    const btn = document.createElement('button');
    btn.textContent = playing && isFull ? 'WATCHING DISABLED' : (isFull ? 'FULL' : 'JOIN');
    btn.className = 'ghost';
    btn.disabled = isFull;
    btn.style.marginLeft = '8px';
    btn.addEventListener('click', () => send({ t: 'join-room', roomId: r.id }));
    el.appendChild(btn);
    roomList.appendChild(el);
  }
}

devModeBtn.addEventListener('click', () => {
  devUserName.textContent = session ? session.name : '';
  send({ t: 'dev-list' });
  send({ t: 'lobby-list' }); // refresh publishedGames too
  showView('dev-list');
});

adminBtn.addEventListener('click', () => {
  if (!session || session.role !== 'admin') return;
  adminUserName.textContent = session.name;
  send({ t: 'admin-users-list' });
  renderAdminGamesList();
  showView('admin-users');
});
adminBackBtn.addEventListener('click', () => showView('lobby'));
sysDevBtn.addEventListener('click', () => {
  if (!session || session.role !== 'admin') return;
  send({ t: 'sysdev-tree' });
  sysDevChatEl.innerHTML = '';
  sysDevDiffEl.textContent = '(no pending changes)';
  showView('sysdev');
});
sysDevBackBtn.addEventListener('click', () => showView('lobby'));
sysDevRefreshBtn.addEventListener('click', () => send({ t: 'sysdev-tree' }));
sysDevDiscardBtn.addEventListener('click', () => send({ t: 'sysdev-discard' }));
sysDevApplyBtn.addEventListener('click', () => {
  if (!confirm('Apply changes, commit, and restart the server? The service will be briefly unavailable.')) return;
  send({ t: 'sysdev-apply' });
});
sysDevSendBtn.addEventListener('click', sendSysDevChat);
sysDevInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendSysDevChat(); }
});
function sendSysDevChat(){
  const txt = (sysDevInputEl.value || '').trim();
  if (!txt) return;
  sysDevInputEl.value = '';
  appendSysDevMsg('user', txt);
  send({ t: 'sysdev-chat', message: txt });
}
function appendSysDevMsg(role, content){
  const el = document.createElement('div');
  el.className = 'msg ' + role;
  const who = role === 'user' ? 'YOU' : (role === 'assistant' ? 'CLAUDE' : 'SYSTEM');
  el.innerHTML = `<div class="who">${who}</div><div class="body"></div>`;
  el.querySelector('.body').textContent = content;
  sysDevChatEl.appendChild(el);
  sysDevChatEl.scrollTop = sysDevChatEl.scrollHeight;
  return el;
}
let sysDevStreamingBubble = null;
function sysDevStreamChunk(delta){
  if (!sysDevStreamingBubble) sysDevStreamingBubble = appendSysDevMsg('assistant', '');
  sysDevStreamingBubble.querySelector('.body').textContent += delta;
  sysDevChatEl.scrollTop = sysDevChatEl.scrollHeight;
}
function sysDevStreamEnd(){
  sysDevStreamingBubble = null;
}

function fmtPlayTime(ms){
  if (!ms || ms < 1000) return '—';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function renderUsersTable(users){
  if (!users || users.length === 0) { usersTableEl.innerHTML = '<tr><td>(no users)</td></tr>'; return; }
  const rows = users.map(u => {
    const isMe = session && u.id === session.userId;
    const nextRole = u.role === 'admin' ? 'player' : 'admin';
    const locked = !!u.locked;
    const tag = locked
      ? '<span style="color:#ff3a5c;">🔒 LOCKED</span>'
      : (u.role === 'admin' ? '<span style="color:#ffd166;">★ ADMIN</span>' : '<span style="color:#9ac;">player</span>');
    let actions = '';
    if (!isMe) {
      actions += `<button class="ghost" style="padding:3px 8px;font-size:10px;margin-left:4px;" data-act="role" data-uid="${u.id}" data-role="${nextRole}">→ ${nextRole.toUpperCase()}</button>`;
      actions += `<button class="ghost" style="padding:3px 8px;font-size:10px;margin-left:4px;color:${locked ? '#44ff88' : '#ffaa66'};" data-act="${locked ? 'unlock' : 'lock'}" data-uid="${u.id}">${locked ? 'UNLOCK' : 'LOCK'}</button>`;
      actions += `<button class="ghost" style="padding:3px 8px;font-size:10px;margin-left:4px;color:#ff3a5c;" data-act="delete" data-uid="${u.id}" data-name="${escapeHtml(u.name)}">DELETE</button>`;
    } else {
      actions = '<span style="color:#667;font-size:10px;">(you)</span>';
    }
    return `<tr data-row-uid="${u.id}" style="cursor:pointer;">
      <td style="color:#fff;font-weight:bold;">${escapeHtml(u.name)}</td>
      <td>${tag}</td>
      <td class="num">${u.matches_played}</td>
      <td class="num">${fmtPlayTime(u.total_play_ms)}</td>
      <td class="num">${new Date(u.created_at).toLocaleDateString()}</td>
      <td class="num">${u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'never'}</td>
      <td style="text-align:right;">${actions}</td>
    </tr>`;
  }).join('');
  usersTableEl.innerHTML = `
    <tr style="color:#ffd166;"><td>NAME</td><td>STATUS</td><td class="num">MATCHES</td><td class="num">PLAYTIME</td><td class="num">CREATED</td><td class="num">LAST LOGIN</td><td></td></tr>
    ${rows}`;
  usersTableEl.querySelectorAll('[data-act]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const uid = Number(el.dataset.uid);
      const act = el.dataset.act;
      if (act === 'role') send({ t: 'admin-set-role', userId: uid, role: el.dataset.role });
      else if (act === 'lock')   { if (confirm('Lock user? They will be kicked and cannot log in until unlocked.')) send({ t: 'admin-set-locked', userId: uid, locked: true }); }
      else if (act === 'unlock') send({ t: 'admin-set-locked', userId: uid, locked: false });
      else if (act === 'delete') { if (confirm('Permanently delete "' + el.dataset.name + '" and all their data? This cannot be undone.')) send({ t: 'admin-delete-user', userId: uid }); }
    });
  });
  usersTableEl.querySelectorAll('[data-row-uid]').forEach(el => {
    el.addEventListener('click', () => {
      send({ t: 'admin-user-detail', userId: Number(el.dataset.rowUid) });
    });
  });
}

function renderUserDetail(detail){
  const u = detail.user;
  const logins = detail.logins || [];
  userDetailTitle.textContent = 'USER DETAIL · ' + u.name;
  const flag = (cc) => {
    if (!cc || cc.length !== 2) return '';
    const base = 0x1F1E6; const A = 'A'.charCodeAt(0);
    return String.fromCodePoint(base + cc.charCodeAt(0) - A) + String.fromCodePoint(base + cc.charCodeAt(1) - A);
  };
  const rows = logins.length === 0
    ? '<div class="empty-list">(no login events)</div>'
    : logins.map(l => {
        const loc = [l.city, l.region, l.country].filter(Boolean).join(', ') || '—';
        return `<tr>
          <td>${new Date(l.created_at).toLocaleString()}</td>
          <td><span style="color:#ffcb3a;">${escapeHtml(l.kind)}</span></td>
          <td><code style="color:#3aff9d;">${escapeHtml(l.ip || '?')}</code></td>
          <td>${flag(l.country)} <span style="color:#bcd;">${escapeHtml(loc)}</span></td>
          <td style="color:#789;font-size:11px;">${escapeHtml((l.user_agent || '').slice(0, 80))}</td>
        </tr>`;
      }).join('');
  userDetailBody.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:8px;margin-bottom:10px;">
      <div><span style="color:#667;">Role:</span> <strong>${u.role}</strong></div>
      <div><span style="color:#667;">Locked:</span> <strong>${u.locked ? '🔒 yes' : 'no'}</strong></div>
      <div><span style="color:#667;">Playtime:</span> <strong>${fmtPlayTime(u.total_play_ms)}</strong></div>
      <div><span style="color:#667;">Created:</span> ${new Date(u.created_at).toLocaleString()}</div>
    </div>
    <div style="color:#667;margin-bottom:4px;"><strong>Recent logins</strong> (IP + user-agent; MAC is not available from a browser):</div>
    <table class="leaderboard-table" style="font-size:11px;">${rows}</table>
  `;
  userDetailPanel.style.display = 'block';
}

function renderAdminLog(actions){
  if (!actions || actions.length === 0) { adminActionsLogEl.innerHTML = '<div class="empty-list">(no recent actions)</div>'; return; }
  adminActionsLogEl.innerHTML = actions.map(a => {
    const when = new Date(a.created_at).toLocaleString();
    const who  = a.actor_name || ('#' + a.actor_id);
    return `<div style="padding:4px 0;border-bottom:1px solid #2a2a40;">
      <span style="color:#ffd166;">${escapeHtml(who)}</span>
      · ${escapeHtml(a.kind)}${a.target ? ' → ' + escapeHtml(a.target) : ''}
      ${a.details ? '<span style="color:#789;"> (' + escapeHtml(a.details) + ')</span>' : ''}
      <span style="color:#667;font-size:10px;float:right;">${when}</span>
    </div>`;
  }).join('');
}
devBackBtn.addEventListener('click', () => showView('lobby'));

// Unified "online games" list (every published game, yours pinned first).
let publishedGamesCache = [];
function renderAvailableList(){
  availableListEl.innerHTML = '';
  if (publishedGamesCache.length === 0) {
    availableListEl.innerHTML = '<div class="empty-list">(nothing published yet — upload an HTML file below to start)</div>';
    return;
  }
  const sorted = publishedGamesCache.slice().sort((a, b) => {
    const am = session && a.author_user_id === session.userId ? 0 : 1;
    const bm = session && b.author_user_id === session.userId ? 0 : 1;
    if (am !== bm) return am - bm;
    return (b.released_at || 0) - (a.released_at || 0);
  });
  for (const p of sorted) {
    const mine = session && p.author_user_id === session.userId;
    availableListEl.appendChild(publishedRow(p, mine));
  }
}

function isMultiplayerBase(baseId){
  if (!baseId) return false;
  return (availableGames || []).some(g => g.id === baseId);
}

function publishedRow(p, mine){
  const row = document.createElement('div');
  row.className = 'project-row';
  const when = new Date(p.released_at).toLocaleDateString();
  const canEdit = mine && p.dev_game_id && myProjectIds.has(p.dev_game_id);
  const isAdmin = session && session.role === 'admin';
  const alreadyMultiplayer = isMultiplayerBase(p.base_game_id);
  const promoteBtn = (isAdmin && !alreadyMultiplayer)
    ? `<button class="ghost" style="padding:4px 10px;font-size:11px;color:#c8a8ff;" data-promote="${p.id}">PROMOTE</button>`
    : '';
  const modeBadge = alreadyMultiplayer
    ? '<span style="background:#a078ff;color:#fff;padding:1px 6px;border-radius:3px;font-size:10px;margin-left:4px;">🎮 MULTIPLAYER</span>'
    : '<span style="background:#2a3a55;color:#bcd;padding:1px 6px;border-radius:3px;font-size:10px;margin-left:4px;">SOLO</span>';
  const actions = canEdit
    ? `${promoteBtn}
       <button class="ghost" style="padding:4px 10px;font-size:11px;" data-play="${p.id}">PLAY</button>
       <button class="btn" style="padding:4px 12px;font-size:11px;" data-edit="${p.dev_game_id}">EDIT</button>`
    : `${promoteBtn}
       <button class="ghost" style="padding:4px 10px;font-size:11px;" data-play="${p.id}">PLAY</button>
       <button class="btn" style="padding:4px 12px;font-size:11px;" data-fork="${p.id}">FORK</button>`;
  const ownerBadge = mine
    ? '<span style="background:#3a9dff;color:#002;padding:1px 6px;border-radius:3px;font-size:10px;margin-left:4px;font-weight:bold;letter-spacing:1px;">YOU</span>'
    : `<span style="background:#2a2a40;color:#ffcb3a;padding:1px 6px;border-radius:3px;font-size:10px;margin-left:4px;">👤 ${escapeHtml(p.author_name)}</span>`;
  row.innerHTML = `
    <div class="meta">
      <span class="title">${escapeHtml(p.title)}
        <span style="background:#3aff9d;color:#002;padding:1px 6px;border-radius:3px;font-size:10px;margin-left:4px;">v${p.version}</span>
        ${modeBadge}
        ${ownerBadge}
      </span>
      <span class="sub">based on ${escapeHtml(p.base_game_id || 'scratch')} · ${when} · ${p.play_count} plays</span>
    </div>
    <div class="actions">${actions}</div>`;
  const playBtn = row.querySelector('[data-play]');
  if (playBtn) playBtn.addEventListener('click', e => { e.stopPropagation(); send({ t: 'play-release-open', releaseId: p.id }); });
  const editBtn = row.querySelector('[data-edit]');
  if (editBtn) editBtn.addEventListener('click', e => { e.stopPropagation(); send({ t: 'dev-open', id: Number(editBtn.dataset.edit) }); });
  const forkBtn = row.querySelector('[data-fork]');
  if (forkBtn) forkBtn.addEventListener('click', e => {
    e.stopPropagation();
    const title = prompt('Title for your fork:', 'Fork of ' + p.title);
    if (title === null) return;
    send({ t: 'dev-fork', releaseId: p.id, title: title || null });
  });
  const promoteBtnEl = row.querySelector('[data-promote]');
  if (promoteBtnEl) promoteBtnEl.addEventListener('click', e => {
    e.stopPropagation();
    openAddGameModal({ promoteFromRelease: p });
  });
  return row;
}

// ========= Unified Create-Game flow =========
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

const createGameBtn    = document.getElementById('createGameBtn');
const createGameStatus = document.getElementById('createGameStatus');
const newGameBaseSel   = document.getElementById('newGameBase');
const newGameUpload    = document.getElementById('newGameUpload');
const newGameMultiChk  = document.getElementById('newGameMultiplayer');
const multiplayerSection = document.getElementById('multiplayerSection');
const multiplayerFields  = document.getElementById('multiplayerFields');
const addGameTitle     = document.getElementById('addGameTitle');

function slugify(s){
  return String(s || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').replace(/--+/g, '-').slice(0, 42);
}
function populateBasesDropdown(){
  newGameBaseSel.innerHTML = (availableGames.length > 0
    ? availableGames.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('')
    : '<option value="">(no base games)</option>');
}
if (newGameMultiChk) newGameMultiChk.addEventListener('change', () => {
  multiplayerFields.style.display = newGameMultiChk.checked ? 'block' : 'none';
});
document.getElementById('newGameName').addEventListener('input', (e) => {
  if (newGameMultiChk && newGameMultiChk.checked) {
    const idField = document.getElementById('newGameId');
    if (!idField.dataset.userEdited) idField.value = slugify(e.target.value);
  }
});
document.getElementById('newGameId').addEventListener('input', (e) => { e.target.dataset.userEdited = '1'; });

createGameBtn.addEventListener('click', () => openAddGameModal({}));

function renderProjectList(projects){
  projectList.innerHTML = '';
  myProjectIds = new Set((projects || []).map(p => p.id));
  // Re-render the availableList since "mine vs others" bucketing + EDIT fallback depends on this.
  renderAvailableList();
  if (!projects || projects.length === 0) {
    projectList.innerHTML = '<div class="empty-list">No projects yet. Start one →</div>';
    return;
  }
  const isAdmin = session && session.role === 'admin';
  for (const p of projects) {
    const el = document.createElement('div');
    el.className = 'project-row';
    const when = new Date(p.updated_at).toLocaleString();
    const promoteBtn = isAdmin
      ? `<button class="ghost" style="padding:3px 10px;font-size:11px;color:#c8a8ff;margin-right:4px;" data-promote-proj="${p.id}" data-title="${escapeHtml(p.title)}">PROMOTE</button>`
      : '';
    el.innerHTML = `
      <div class="meta">
        <span class="title">${escapeHtml(p.title)}
          <span style="background:#2a3a55;color:#bcd;padding:1px 6px;border-radius:3px;font-size:10px;margin-left:4px;">SOLO</span>
        </span>
        <span class="sub">based on ${escapeHtml(p.base_game_id || 'scratch')} · updated ${when} · ${p.message_count} msgs</span>
      </div>
      <div class="actions">
        ${promoteBtn}
        <button class="del-btn" data-del="${p.id}">DELETE</button>
      </div>
    `;
    el.addEventListener('click', e => {
      if (e.target.closest('[data-del]') || e.target.closest('[data-promote-proj]')) return;
      send({ t: 'dev-open', id: p.id });
    });
    const delBtn = el.querySelector('[data-del]');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Delete "' + p.title + '"? This cannot be undone.')) {
        send({ t: 'dev-delete', id: p.id });
      }
    });
    const promoteEl = el.querySelector('[data-promote-proj]');
    if (promoteEl) promoteEl.addEventListener('click', (e) => {
      e.stopPropagation();
      openAddGameModal({ promoteFromProject: { id: p.id, title: p.title, base_game_id: p.base_game_id } });
    });
    projectList.appendChild(el);
  }
}

// Transfer keyboard focus into the iframe whenever its document loads, so
// keys go to the game instead of the parent page.
function focusIframe(iframe){
  try {
    iframe.contentWindow && iframe.contentWindow.focus();
  } catch {}
}
document.getElementById('studioFrame').addEventListener('load', function(){ focusIframe(this); });
document.getElementById('playFrame').addEventListener('load', function(){ focusIframe(this); });
// Click on the frame wrapper returns focus to the iframe (useful after the
// user has been typing in chat and comes back to play).
document.getElementById('studioFrameWrap').addEventListener('mousedown', () => focusIframe(document.getElementById('studioFrame')));
document.getElementById('playFrameWrap').addEventListener('mousedown', () => focusIframe(document.getElementById('playFrame')));

// Studio
studioBackBtn.addEventListener('click', () => {
  currentStudioProject = null;
  studioFrame.srcdoc = '';
  send({ t: 'dev-list' });
  showView('dev-list');
});
reloadFrameBtn.addEventListener('click', () => {
  if (currentStudioProject) studioFrame.srcdoc = currentStudioProject.html;
});
releaseBtn.addEventListener('click', () => {
  if (!currentStudioProject) return;
  if (!confirm('Release the current draft as a new version? Everyone in the lobby will see it.')) return;
  send({ t: 'dev-release', id: currentStudioProject.id });
});

// Published / Play release
playBackBtn.addEventListener('click', () => {
  playFrame.srcdoc = '';
  send({ t: 'lobby-list' });
  showView('lobby');
});
playReloadBtn.addEventListener('click', () => {
  if (currentPlayRelease) playFrame.srcdoc = currentPlayRelease.html;
});
let currentPlayRelease = null;

// Cache published games (shown inside the unified availableList in Dev Mode)
let myProjectIds = new Set();
function cachePublished(games){
  publishedGamesCache = games || [];
  renderAvailableList();
}

function loadPlayRelease(release){
  currentPlayRelease = release;
  playTitleEl.textContent = release.title + ' · v' + release.version;
  playSubEl.textContent = 'by ' + release.author_name;
  playFrame.srcdoc = release.html;
  showView('play-release');
}
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChat();
  }
});
chatSend.addEventListener('click', sendChat);

function sendChat(){
  if (!currentStudioProject || studioThinking) return;
  const text = (chatInput.value || '').trim();
  if (!text) return;
  chatInput.value = '';
  // Optimistic: render user bubble immediately
  appendChatMessage({ role: 'user', content: text, created_at: Date.now() });
  send({ t: 'dev-chat', id: currentStudioProject.id, message: text });
  setThinking(true);
}

let streamingBubbleEl = null;

function setThinking(on){
  studioThinking = on;
  chatSend.disabled = on;
  chatSend.textContent = on ? '…' : 'SEND';
  const existing = chatMessagesEl.querySelector('.msg-thinking');
  if (on && !existing) {
    const el = document.createElement('div');
    el.className = 'msg-thinking';
    el.textContent = 'Claude is working…';
    chatMessagesEl.appendChild(el);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }
  if (!on && existing) existing.remove();
}

function ensureStreamingBubble(){
  if (streamingBubbleEl) return streamingBubbleEl;
  // Convert the "Claude is working…" placeholder into a real bubble as soon
  // as the first chunk arrives.
  const pending = chatMessagesEl.querySelector('.msg-thinking');
  if (pending) pending.remove();
  const el = document.createElement('div');
  el.className = 'msg assistant';
  el.innerHTML = `<div class="who">CLAUDE</div><div class="body"></div>`;
  chatMessagesEl.appendChild(el);
  streamingBubbleEl = el;
  return el;
}

function appendStreamChunk(delta){
  const el = ensureStreamingBubble();
  const body = el.querySelector('.body');
  body.textContent += delta;
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function finalizeStream(finalText){
  if (streamingBubbleEl) {
    const body = streamingBubbleEl.querySelector('.body');
    if (typeof finalText === 'string' && finalText.length > 0) {
      body.textContent = finalText;
    }
  }
  streamingBubbleEl = null;
}

function appendChatMessage(m){
  const el = document.createElement('div');
  el.className = 'msg ' + (m.role || 'assistant');
  const who = m.role === 'user' ? 'YOU' : (m.role === 'assistant' ? 'CLAUDE' : 'SYSTEM');
  el.innerHTML = `<div class="who">${who}</div><div class="body"></div>`;
  el.querySelector('.body').textContent = m.content;
  chatMessagesEl.appendChild(el);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function loadStudioProject(project, messages){
  currentStudioProject = project;
  studioProjectTitle.textContent = project.title;
  const v = project.latestVersion ? ' · released v' + project.latestVersion : ' · unreleased';
  studioProjectSub.textContent = 'based on ' + (project.baseGameId || 'scratch') + v;
  chatMessagesEl.innerHTML = '';
  for (const m of (messages || [])) appendChatMessage(m);
  if (!messages || messages.length === 0) {
    appendChatMessage({
      role: 'system',
      content: 'Project loaded. Tell Claude what you want to change — e.g. "make player speed 2x" or "add a coin that gives +50 health".'
    });
  }
  studioFrame.srcdoc = project.html;
  showView('studio');
}

async function fetchLeaderboard(){
  try {
    const res = await fetch('/api/leaderboard?limit=10');
    const data = await res.json();
    const rows = data.rows || [];
    if (rows.length === 0) {
      leaderboardEl.innerHTML = '<div class="empty-list">No matches yet.</div>';
      return;
    }
    const body = rows.map((r, i) => `
      <tr>
        <td class="rank">${i + 1}</td>
        <td class="name">${escapeHtml(r.name)}</td>
        <td class="num">${r.wins} W</td>
        <td class="num">${r.total_kills} K</td>
        <td class="num">${r.total_deaths} D</td>
        <td class="num">${r.matches_played} M</td>
      </tr>`).join('');
    leaderboardEl.innerHTML = `<table class="leaderboard-table">${body}</table>`;
  } catch { /* ignore */ }
}

// ============ Room UI ============
leaveRoomBtn.addEventListener('click', () => send({ t: 'leave-room' }));
startGameBtn.addEventListener('click', () => send({ t: 'start-game' }));

function renderRoomView(room){
  roomTitleEl.textContent = (room.name || 'ROOM').toUpperCase();
  roomCodeEl.textContent = room.id;
  roomGameLabelEl.textContent = room.gameLabel;
  const count = room.members.length;
  if (room.status === 'waiting') {
    roomStatusEl.textContent = count < room.min
      ? `Waiting for opponent… (${count}/${room.max})`
      : `Ready — host can START (${count}/${room.max})`;
  } else {
    roomStatusEl.textContent = `Status: ${room.status}`;
  }

  membersListEl.innerHTML = '';
  for (let slot = 0; slot < room.max; slot++) {
    const member = room.members.find(m => m.slot === slot);
    const card = document.createElement('div');
    card.className = `member-card slot${slot}`;
    const slotName = slot === 0 ? 'P1 — BLUE' : 'P2 — ORANGE';
    const nameHtml = member
      ? `<div class="player-name">${escapeHtml(member.name)}${member.userId === room.hostUserId ? ' <span class="tag">HOST</span>' : ''}${session && member.userId === session.userId ? ' <span class="tag" style="background:#3a9dff;color:#fff;">YOU</span>' : ''}</div>`
      : `<div class="player-name empty">waiting…</div>`;
    card.innerHTML = `<div class="slot-name slot${slot}-name">${slotName}</div>${nameHtml}`;
    membersListEl.appendChild(card);
  }

  const canStart = session && room.hostUserId === session.userId
                   && room.status === 'waiting'
                   && room.members.length >= room.min;
  startGameBtn.disabled = !canStart;
  startGameBtn.textContent = canStart ? 'START GAME'
    : (room.status === 'waiting' ? 'WAITING…' : 'IN PROGRESS');
}

// ============ Game mount ============
async function mountGame(room){
  if (gameClient && gameClient.destroy) try { gameClient.destroy(); } catch {}
  gameClient = null;

  const modUrl = room.clientModule;
  if (!modUrl) { console.error('no client module for', room.gameType); return; }

  const mod = await import(modUrl);
  const ctx = {
    canvas,
    roomMeta: room,
    mySlot,
    myUserId: session ? session.userId : -1,
    send,
    onWinRequestRematch: () => send({ t: 'restart-game' }),
    onLeaveRoom: () => send({ t: 'leave-room' })
  };
  gameClient = await mod.init(ctx);
}

function unmountGame(){
  if (gameClient && gameClient.destroy) try { gameClient.destroy(); } catch {}
  gameClient = null;
}

// ============ WS connection ============
function connect(){
  setConn(false, 'connecting…');
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.addEventListener('open', () => {
    setConn(true, 'online');
    // Try to resume session if we have a token
    const token = localStorage.getItem(SAVED_TOKEN_KEY);
    if (token) send({ t: 'resume', token });
  });
  ws.addEventListener('close', () => {
    setConn(false, 'disconnected — retrying…');
    session = null;
    currentRoom = null;
    unmountGame();
    showView('login');
    setTimeout(connect, 1500);
  });
  ws.addEventListener('error', () => {});
  ws.addEventListener('message', (ev) => {
    let msg; try { msg = JSON.parse(ev.data); } catch { return; }
    handleServerMessage(msg);
  });
}

function send(obj){
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify(obj));
}

function handleServerMessage(msg){
  switch (msg.t) {
    case 'welcome':
      availableGames = msg.games || [];
      renderGamePicker();
      // If not authed (no saved token), show login
      if (!session) showView('login');
      break;

    case 'auth-ok':
      session = { userId: msg.userId, name: msg.name, role: msg.role || 'player', token: msg.token };
      localStorage.setItem(SAVED_TOKEN_KEY, msg.token);
      lobbyUserName.textContent = session.name + (session.role === 'admin' ? ' ★' : '');
      authError.textContent = '';
      authPass.value = '';
      adminBtn.style.display  = session.role === 'admin' ? 'inline-block' : 'none';
      sysDevBtn.style.display = session.role === 'admin' ? 'inline-block' : 'none';
      showView('lobby');
      fetchLeaderboard();
      break;

    case 'auth-failed':
      authError.textContent = msg.error || 'auth failed';
      localStorage.removeItem(SAVED_TOKEN_KEY);
      if (!session) showView('login');
      break;

    case 'logged-out':
      session = null;
      currentRoom = null;
      localStorage.removeItem(SAVED_TOKEN_KEY);
      unmountGame();
      showView('login');
      break;

    case 'lobby':
      availableGames = msg.games || availableGames;
      renderGamePicker();
      renderRoomList(msg.rooms || []);
      cachePublished(msg.publishedGames || []);
      // Do NOT force a view switch here — periodic broadcasts must not
      // interrupt whatever screen the user is on (dev-list, studio, etc).
      break;

    case 'published-list':
      cachePublished(msg.games || []);
      break;

    case 'play-release':
      loadPlayRelease(msg.release);
      break;

    case 'dev-released':
      if (currentStudioProject && currentStudioProject.id === msg.id) {
        currentStudioProject.latestVersion = msg.release.version;
        studioProjectSub.textContent = 'based on ' + (currentStudioProject.baseGameId || 'scratch')
                                       + ' · released v' + msg.release.version;
        appendChatMessage({
          role: 'system',
          content: 'Released as v' + msg.release.version + '. Now visible in the lobby for everyone to play.'
        });
      }
      break;

    case 'room-joined':
      mySlot = msg.slot;
      // currentRoom will be populated by the following room-update
      break;

    case 'room-update': {
      const wasPlaying = currentRoom && currentRoom.status === 'playing';
      currentRoom = msg.room;
      const me = currentRoom.members.find(m => session && m.userId === session.userId);
      if (me) mySlot = me.slot;
      if (currentRoom.status === 'playing') {
        if (!wasPlaying) {
          // Transition into game
          showView(null);
          mountGame(currentRoom);
        }
        if (gameClient && gameClient.onRoomUpdate) gameClient.onRoomUpdate(currentRoom);
      } else if (currentRoom.status === 'waiting') {
        unmountGame();
        renderRoomView(currentRoom);
        showView('room');
      } else if (currentRoom.status === 'finished') {
        // Keep game canvas visible; client will show its own win overlay via onState
        if (gameClient && gameClient.onRoomUpdate) gameClient.onRoomUpdate(currentRoom);
      }
      break;
    }

    case 'left-room':
      unmountGame();
      currentRoom = null;
      mySlot = -1;
      showView('lobby');
      send({ t: 'lobby-list' });
      fetchLeaderboard();
      break;

    case 'state':
      if (gameClient && gameClient.onState) gameClient.onState(msg);
      break;

    case 'error':
      console.warn('server error:', msg.error);
      if (!session) authError.textContent = msg.error || 'error';
      break;

    case 'dev-list':
      devClaudeAvailable = msg.claudeAvailable !== false;
      devUnavailable.style.display = devClaudeAvailable ? 'none' : 'block';
      // create button lives in the unified modal; nothing to toggle here
      renderProjectList(msg.projects || []);
      break;

    case 'dev-project':
      loadStudioProject(msg.project, msg.messages || []);
      break;

    case 'dev-renamed':
      if (currentStudioProject && currentStudioProject.id === msg.id) {
        currentStudioProject.title = msg.title;
        studioProjectTitle.textContent = msg.title;
      }
      break;

    case 'dev-deleted':
      if (currentStudioProject && currentStudioProject.id === msg.id) {
        currentStudioProject = null;
        showView('dev-list');
      }
      send({ t: 'dev-list' });
      break;

    case 'dev-thinking':
      setThinking(true);
      break;

    case 'dev-chat-user-echo':
      // The user message is already rendered optimistically on send; ignore.
      break;

    case 'dev-chat-chunk':
      setThinking(false); // hide the "working…" placeholder on first chunk
      appendStreamChunk(msg.delta || '');
      break;

    case 'dev-chat-reply':
      setThinking(false);
      finalizeStream(msg.assistantMessage && msg.assistantMessage.content);
      if (msg.htmlUpdated && msg.html && currentStudioProject && currentStudioProject.id === msg.id) {
        currentStudioProject.html = msg.html;
        studioFrame.srcdoc = msg.html;
      }
      break;

    case 'dev-error':
      setThinking(false);
      finalizeStream(null);
      appendChatMessage({ role: 'system', content: 'Error: ' + (msg.error || 'unknown') });
      break;

    case 'admin-users-list':
      renderUsersTable(msg.users || []);
      renderAdminLog(msg.actions || []);
      break;

    case 'admin-user-detail':
      renderUserDetail(msg);
      break;

    case 'admin-game-status':
      createGameStatus.textContent = msg.text || '';
      if (msg.error) {
        addGameError.textContent = msg.error;
        addGameSubmit.disabled = false;
      }
      if (msg.done) {
        addGameSubmit.disabled = false;
        if (!msg.error) {
          closeAddGameModal();
          setTimeout(() => { createGameStatus.textContent = ''; }, 8000);
        }
      }
      break;

    case 'sysdev-tree':
      renderSysDevTree(msg.tree || [], msg.diff || '', msg.head || '', msg.branch || '');
      break;

    case 'sysdev-chat-chunk':
      sysDevStreamChunk(msg.delta || '');
      break;

    case 'sysdev-chat-reply':
      sysDevStreamEnd();
      if (msg.diff !== undefined) sysDevDiffEl.textContent = msg.diff || '(no changes yet)';
      break;

    case 'sysdev-error':
      sysDevStreamEnd();
      appendSysDevMsg('system', 'Error: ' + (msg.error || 'unknown'));
      break;

    case 'sysdev-status':
      sysDevStatusEl.textContent = ' · ' + (msg.text || '');
      if (msg.diff !== undefined) sysDevDiffEl.textContent = msg.diff || '(no pending changes)';
      if (msg.done) sysDevStatusEl.textContent = '';
      break;
  }
}

function renderSysDevTree(tree, diff, head, branch){
  sysDevTreeEl.innerHTML = (tree || []).map(f =>
    `<div style="padding:2px 0;"><span style="color:#9d6bff;">${escapeHtml(f.kind === 'dir' ? '📁 ' : '📄 ')}</span>${escapeHtml(f.path)} <span style="color:#667;">${f.size ? '(' + f.size + 'b)' : ''}</span></div>`
  ).join('');
  if (diff) sysDevDiffEl.textContent = diff;
  const parts = [];
  if (head) parts.push('HEAD ' + head);
  if (branch) parts.push('branch ' + branch);
  sysDevStatusEl.textContent = parts.length ? ' · ' + parts.join(' · ') : '';
}

// ============ Util ============
function escapeHtml(s){
  return String(s || '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}

// ============ Boot ============
showView('login');
connect();
