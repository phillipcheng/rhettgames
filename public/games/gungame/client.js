import { WEAPONS, POWERUPS, SPAWN_POINTS, WIDTH, HEIGHT } from '/shared/constants.js';

const W = WIDTH, H = HEIGHT;

export async function init(ctx){
  const canvas = ctx.canvas;
  const cc = canvas.getContext('2d');
  canvas.width = W; canvas.height = H;
  fitCanvas();
  window.addEventListener('resize', fitCanvas);

  function fitCanvas(){
    const wrap = canvas.parentElement;
    const maxW = window.innerWidth - 20;
    const maxH = window.innerHeight - 20;
    const scale = Math.min(maxW / W, maxH / H, 1);
    canvas.style.width = (W * scale) + 'px';
    canvas.style.height = (H * scale) + 'px';
  }

  // ======== AUDIO ========
  let audioCtx = null;
  function getAC(){
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch { audioCtx = null; }
    }
    return audioCtx;
  }
  getAC();

  function playTone(freq, dur, type, vol, slide){
    const ac = getAC(); if (!ac) return;
    try {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, ac.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(1, slide), ac.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.15, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      o.connect(g); g.connect(ac.destination);
      o.start(); o.stop(ac.currentTime + dur);
    } catch {}
  }
  function playNoise(dur, vol, filterFreq){
    const ac = getAC(); if (!ac) return;
    try {
      const bufSize = Math.floor(ac.sampleRate * dur);
      const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
      const src = ac.createBufferSource();
      src.buffer = buf;
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq || 1200;
      const g = ac.createGain();
      g.gain.value = vol || 0.2;
      src.connect(filter); filter.connect(g); g.connect(ac.destination);
      src.start();
    } catch {}
  }
  function sfxShoot(sfx){
    if (sfx === 'pistol') { playTone(520, 0.08, 'square', 0.12, 120); playNoise(0.05, 0.1, 1800); }
    else if (sfx === 'smg') { playTone(700, 0.04, 'square', 0.08, 300); playNoise(0.03, 0.08, 2200); }
    else if (sfx === 'shotgun') { playNoise(0.15, 0.28, 600); playTone(180, 0.12, 'sawtooth', 0.14, 60); }
    else if (sfx === 'rifle') { playTone(420, 0.1, 'sawtooth', 0.15, 90); playNoise(0.08, 0.15, 1500); }
    else if (sfx === 'sniper') { playTone(280, 0.18, 'sawtooth', 0.22, 70); playNoise(0.12, 0.2, 800); }
    else if (sfx === 'rocket') { playTone(140, 0.25, 'sawtooth', 0.2, 40); playNoise(0.2, 0.2, 400); }
    else if (sfx === 'minigun') { playTone(900, 0.03, 'square', 0.06, 500); playNoise(0.02, 0.05, 3000); }
    else if (sfx === 'laser') { playTone(1200, 0.12, 'sine', 0.15, 400); playTone(800, 0.08, 'sine', 0.1, 200); }
    else if (sfx === 'crossbow') { playTone(300, 0.12, 'triangle', 0.15, 100); playNoise(0.05, 0.08, 2000); }
    else if (sfx === 'flame') { playNoise(0.12, 0.15, 900); playTone(200, 0.1, 'sawtooth', 0.08, 80); }
    else { playTone(500, 0.08, 'square', 0.1, 200); }
  }
  function sfxExplode(){ playNoise(0.35, 0.4, 300); playTone(80, 0.3, 'sawtooth', 0.25, 30); }
  function sfxHit(){ playNoise(0.06, 0.15, 2000); playTone(300, 0.05, 'square', 0.1, 150); }
  function sfxKill(){ playTone(660, 0.1, 'square', 0.2, 330); setTimeout(() => playTone(880, 0.15, 'square', 0.2, 440), 80); }
  function sfxReload(){ playTone(200, 0.05, 'square', 0.08); setTimeout(() => playTone(300, 0.08, 'square', 0.1), 100); }
  function sfxDash(){ playNoise(0.15, 0.12, 800); }
  function sfxLevelUp(){
    playTone(440, 0.08, 'square', 0.15, 440);
    setTimeout(() => playTone(660, 0.08, 'square', 0.15, 660), 80);
    setTimeout(() => playTone(880, 0.15, 'square', 0.2, 880), 160);
  }
  function sfxDemote(){ playTone(300, 0.2, 'sawtooth', 0.2, 100); }
  function sfxWin(){
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => setTimeout(() => playTone(n, 0.25, 'square', 0.2), i * 120));
  }
  function sfxPickup(){ playTone(660, 0.08, 'sine', 0.15, 1100); playTone(990, 0.1, 'sine', 0.12, 1320); }
  function sfxUltReady(){
    playTone(523, 0.1, 'square', 0.2);
    setTimeout(() => playTone(659, 0.1, 'square', 0.2), 100);
    setTimeout(() => playTone(784, 0.1, 'square', 0.2), 200);
    setTimeout(() => playTone(1046, 0.2, 'square', 0.25), 300);
  }
  function sfxUltActivate(){
    playNoise(0.4, 0.3, 2000);
    playTone(200, 0.4, 'sawtooth', 0.25, 50);
  }
  function sfxKillstreak(n){
    const base = 440 + n * 80;
    playTone(base, 0.12, 'square', 0.2);
    setTimeout(() => playTone(base * 1.5, 0.15, 'square', 0.2), 100);
  }
  function sfxAirstrikeSiren(){
    const ac = getAC(); if (!ac) return;
    try {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(800, ac.currentTime);
      o.frequency.exponentialRampToValueAtTime(200, ac.currentTime + 1.2);
      g.gain.setValueAtTime(0.18, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 1.2);
      o.connect(g); g.connect(ac.destination);
      o.start(); o.stop(ac.currentTime + 1.2);
    } catch {}
  }

  // ======== Local FX state ========
  const fx = {
    particles: [], shells: [], smokeTrails: [], muzzleFlashes: [], lights: [], floatingTexts: [],
    screenShake: 0, shakeX: 0, shakeY: 0,
    slowMo: 1, slowMoUntil: 0,
    flashOverlay: 0, flashColor: '#fff',
    now: 0
  };
  function addFloatingText(x, y, text, color){
    fx.floatingTexts.push({ x, y, text, color, life: 1400, max: 1400, vy: -0.8 });
  }

  // ======== State ========
  let latestSnapshot = null;
  let sawWinner = false;

  // ======== Event processing ========
  function processEvents(events){
    for (const e of events) {
      switch (e.kind) {
        case 'shot': {
          sfxShoot(e.sfx);
          fx.muzzleFlashes.push({ x: e.x, y: e.y, angle: e.angle, life: 80, color: e.color });
          fx.lights.push({ x: e.x, y: e.y, r: 140, color: e.color, life: 100, max: 100, intensity: 0.45 });
          if (e.ejectShell) {
            const ejAng = e.angle + Math.PI / 2 + (Math.random() - 0.5) * 0.5;
            fx.shells.push({
              x: e.shellX, y: e.shellY,
              vx: Math.cos(ejAng) * (2 + Math.random() * 2),
              vy: Math.sin(ejAng) * (2 + Math.random() * 2),
              rot: Math.random() * Math.PI * 2,
              rotSpeed: (Math.random() - 0.5) * 0.4,
              life: 1500, max: 1500,
              color: e.sfx === 'shotgun' ? '#aa3a3a' : '#ffcb3a',
              size: e.sfx === 'shotgun' ? 5 : 3
            });
          }
          break;
        }
        case 'melee-swing': {
          playTone(600, 0.04, 'square', 0.08, 900);
          playNoise(0.04, 0.08, 2500);
          for (let i = 0; i < 14; i++) {
            fx.particles.push({
              x: e.x + Math.cos(e.angle) * 40,
              y: e.y + Math.sin(e.angle) * 40,
              vx: Math.cos(e.angle + (Math.random() - 0.5) * 1.2) * (2 + Math.random() * 3),
              vy: Math.sin(e.angle + (Math.random() - 0.5) * 1.2) * (2 + Math.random() * 3),
              life: 300, max: 300, color: '#ffffff', size: 2
            });
          }
          break;
        }
        case 'hit':
          sfxHit();
          fx.screenShake = Math.max(fx.screenShake, 6);
          for (let i = 0; i < 8; i++) {
            fx.particles.push({
              x: e.x, y: e.y,
              vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6,
              life: 400, max: 400, color: '#ff3a5c', size: 2.5
            });
          }
          break;
        case 'shield-hit':
          playTone(1000, 0.06, 'sine', 0.1, 1200);
          for (let i = 0; i < 6; i++) {
            fx.particles.push({
              x: e.x + (Math.random() - 0.5) * 36,
              y: e.y + (Math.random() - 0.5) * 36,
              vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2,
              life: 300, max: 300, color: e.color, size: 2
            });
          }
          break;
        case 'kill':
          sfxKill();
          fx.screenShake = 14;
          fx.slowMo = 0.35; fx.slowMoUntil = performance.now() + 200;
          fx.flashOverlay = 120; fx.flashColor = e.killerColor || '#fff';
          for (let i = 0; i < 40; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 2 + Math.random() * 6;
            fx.particles.push({
              x: e.x, y: e.y,
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 700, max: 700, color: e.color, size: 2 + Math.random() * 3
            });
          }
          break;
        case 'explosion':
          sfxExplode();
          fx.screenShake = Math.max(fx.screenShake, 18);
          fx.lights.push({ x: e.x, y: e.y, r: e.radius * 2.5, color: '#ffaa3a', life: 300, max: 300, intensity: 0.6 });
          for (let i = 0; i < 50; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 1 + Math.random() * 8;
            fx.particles.push({
              x: e.x, y: e.y,
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 600 + Math.random() * 300, max: 900,
              color: Math.random() < 0.5 ? '#ffcb3a' : '#ff6b3a',
              size: 2 + Math.random() * 4
            });
          }
          for (let s = 0; s < 15; s++) {
            fx.smokeTrails.push({
              x: e.x + (Math.random() - 0.5) * e.radius * 0.5,
              y: e.y + (Math.random() - 0.5) * e.radius * 0.5,
              vx: (Math.random() - 0.5) * 1.5, vy: -0.5 - Math.random(),
              life: 1500 + Math.random() * 800, max: 2300,
              size: 10 + Math.random() * 15
            });
          }
          break;
        case 'bullet-hit-wall':
          for (let s = 0; s < 6; s++) {
            fx.particles.push({
              x: e.x, y: e.y,
              vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4,
              life: 300, max: 300, color: e.color, size: 1.8
            });
          }
          break;
        case 'wall-destroy':
          playNoise(0.2, 0.2, 500);
          for (let i = 0; i < 20; i++) {
            fx.particles.push({
              x: e.x + Math.random() * e.w,
              y: e.y + Math.random() * e.h,
              vx: (Math.random() - 0.5) * 6,
              vy: (Math.random() - 0.5) * 6 - 2,
              life: 800, max: 800,
              color: '#5a5a7a', size: 3 + Math.random() * 2
            });
          }
          break;
        case 'bounce':  playTone(200, 0.04, 'square', 0.08, 150); break;
        case 'reload':  sfxReload(); break;
        case 'dash':
          sfxDash();
          for (let i = 0; i < 10; i++) {
            fx.particles.push({
              x: e.x, y: e.y,
              vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2,
              life: 300, max: 300, color: e.color, size: 3
            });
          }
          break;
        case 'pickup':
          sfxPickup();
          if (e.kind2 === 'health') addFloatingText(e.x, e.y - 30, '+' + e.healed + ' HP', '#3aff9d');
          else {
            addFloatingText(e.x, e.y - 35, e.label, e.color);
            fx.lights.push({ x: e.x, y: e.y, r: 120, color: e.color, life: 300, max: 300, intensity: 0.5 });
          }
          break;
        case 'ult-ready': sfxUltReady(); addFloatingText(e.x, e.y - 40, 'ULTIMATE READY!', '#ffcb3a'); break;
        case 'ult-activate':
          sfxUltActivate();
          fx.screenShake = Math.max(fx.screenShake, e.ultType === 'nuke' ? 30 : 12);
          for (let i = 0; i < 30; i++) {
            const a = (i / 30) * Math.PI * 2;
            fx.particles.push({
              x: e.x, y: e.y,
              vx: Math.cos(a) * 5, vy: Math.sin(a) * 5,
              life: 600, max: 600, color: e.color, size: 3
            });
          }
          fx.lights.push({ x: e.x, y: e.y, r: 250, color: e.color, life: 500, max: 500, intensity: 0.5 });
          break;
        case 'levelup':
          sfxLevelUp();
          addFloatingText(e.x, e.y - 40, 'LEVEL UP! ' + WEAPONS[e.weaponIdx].name, '#ffcb3a');
          break;
        case 'demote': sfxDemote(); addFloatingText(e.x, e.y - 40, 'DEMOTED!', '#ff3a5c'); break;
        case 'streak': sfxKillstreak(e.streak); break;
        case 'airstrike-warning': sfxAirstrikeSiren(); break;
        case 'win': sfxWin(); break;
      }
    }
  }

  // ======== Input ========
  const keys = Object.create(null);
  const currentInput = { up: 0, down: 0, left: 0, right: 0, shoot: 0, reload: 0, dash: 0, ult: 0 };

  function onKeyDown(e){
    const k = e.key.toLowerCase();
    if (['w','a','s','d','f','g','q','r',' ','shift','enter'].includes(k) || k.startsWith('arrow')) {
      e.preventDefault();
    }
    keys[k] = true;
  }
  function onKeyUp(e){
    const k = e.key.toLowerCase();
    keys[k] = false;
  }
  function onBlur(){ for (const k in keys) keys[k] = false; }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  let sentSeq = 0;
  let lastInputSent = { up: -1, down: -1, left: -1, right: -1, shoot: -1, reload: -1, dash: -1, ult: -1 };
  let lastInputTime = 0;

  function collectInput(){
    currentInput.up    = keys['w'] || keys['arrowup']    ? 1 : 0;
    currentInput.down  = keys['s'] || keys['arrowdown']  ? 1 : 0;
    currentInput.left  = keys['a'] || keys['arrowleft']  ? 1 : 0;
    currentInput.right = keys['d'] || keys['arrowright'] ? 1 : 0;
    currentInput.shoot = keys['f'] || keys[' ']          ? 1 : 0;
    currentInput.reload= keys['g'] || keys['r']          ? 1 : 0;
    currentInput.dash  = keys['shift']                   ? 1 : 0;
    currentInput.ult   = keys['q']                       ? 1 : 0;
  }
  function sendInputIfChanged(){
    const now = performance.now();
    let changed = false;
    for (const k in currentInput) {
      if (currentInput[k] !== lastInputSent[k]) { changed = true; break; }
    }
    if (!changed && now - lastInputTime < 200) return;
    sentSeq++;
    ctx.send({ t: 'input', seq: sentSeq, ...currentInput });
    lastInputSent = { ...currentInput };
    lastInputTime = now;
  }

  // ======== Win overlay (DOM) ========
  const winOverlay = document.createElement('div');
  winOverlay.style.cssText = `
    position: fixed; inset: 0; z-index: 30;
    background: rgba(5,5,15,0.88);
    display: none; flex-direction: column;
    align-items: center; justify-content: center;
    text-align: center; padding: 20px;
    font-family: 'Courier New', monospace; color: #fff;
  `;
  winOverlay.innerHTML = `
    <div id="winHeaderInner" style="font-size:52px; letter-spacing:6px;"></div>
    <div style="color:#ffcb3a; letter-spacing:3px; margin-top:6px; font-size:16px;" id="winSubInner"></div>
    <div id="winStatsInner" style="margin-top:14px; color:#bcd; font-size:14px; line-height:1.6;"></div>
    <div style="margin-top:20px;">
      <button id="gungameRematch" style="padding:10px 28px;font-size:15px;background:linear-gradient(90deg,#ff3a5c,#ffcb3a);border:none;color:#000;letter-spacing:2px;font-weight:bold;border-radius:4px;cursor:pointer;margin:4px;font-family:inherit;">REMATCH</button>
      <button id="gungameLeave" style="padding:10px 28px;font-size:15px;background:transparent;border:2px solid #2a2a40;color:#bcd;letter-spacing:2px;font-weight:bold;border-radius:4px;cursor:pointer;margin:4px;font-family:inherit;">BACK TO LOBBY</button>
    </div>
  `;
  document.body.appendChild(winOverlay);
  winOverlay.querySelector('#gungameRematch').addEventListener('click', () => {
    hideWinOverlay();
    sawWinner = false;
    ctx.onWinRequestRematch();
  });
  winOverlay.querySelector('#gungameLeave').addEventListener('click', () => {
    hideWinOverlay();
    ctx.onLeaveRoom();
  });

  function showWinOverlay(winnerId){
    if (!latestSnapshot) return;
    const p1 = latestSnapshot.players[0];
    const p2 = latestSnapshot.players[1];
    const winner = latestSnapshot.players[winnerId];
    const name = winner.name || ('Player ' + (winnerId + 1));
    const hdr = winOverlay.querySelector('#winHeaderInner');
    hdr.textContent = name.toUpperCase() + ' WINS!';
    hdr.style.color = winner.color;
    hdr.style.textShadow = `0 0 30px ${winner.color}`;
    winOverlay.querySelector('#winSubInner').textContent = 'MASTERED ALL ' + WEAPONS.length + ' WEAPONS';
    const n1 = p1.name || 'Player 1';
    const n2 = p2.name || 'Player 2';
    winOverlay.querySelector('#winStatsInner').innerHTML =
      n1 + ' — Kills: ' + p1.kills + ' | Deaths: ' + p1.deaths + ' | Damage: ' + Math.round(p1.damageDealt) + ' | Weapon: ' + WEAPONS[p1.weaponLevel].name + '<br>' +
      n2 + ' — Kills: ' + p2.kills + ' | Deaths: ' + p2.deaths + ' | Damage: ' + Math.round(p2.damageDealt) + ' | Weapon: ' + WEAPONS[p2.weaponLevel].name;
    winOverlay.style.display = 'flex';
  }
  function hideWinOverlay(){ winOverlay.style.display = 'none'; }

  // ======== Render loop ========
  let running = true;
  let lastFrame = performance.now();
  function loop(now){
    if (!running) return;
    const rawDt = Math.min(50, now - lastFrame);
    lastFrame = now;
    fx.now = now;
    if (now > fx.slowMoUntil) fx.slowMo = 1;
    const dt = rawDt * fx.slowMo;
    updateFx(dt);
    collectInput();
    sendInputIfChanged();
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  function updateFx(dt){
    for (let i = fx.particles.length - 1; i >= 0; i--) {
      const p = fx.particles[i];
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.94; p.vy *= 0.94;
      p.life -= dt;
      if (p.life <= 0) fx.particles.splice(i, 1);
    }
    for (let i = fx.shells.length - 1; i >= 0; i--) {
      const s = fx.shells[i];
      s.x += s.vx; s.y += s.vy;
      s.vx *= 0.92; s.vy = s.vy * 0.92 + 0.15;
      s.rot += s.rotSpeed;
      s.life -= dt;
      if (s.life <= 0) fx.shells.splice(i, 1);
    }
    for (let i = fx.smokeTrails.length - 1; i >= 0; i--) {
      const s = fx.smokeTrails[i];
      s.x += s.vx; s.y += s.vy;
      s.vx *= 0.98; s.vy *= 0.98;
      s.life -= dt;
      if (s.life <= 0) fx.smokeTrails.splice(i, 1);
    }
    for (let i = fx.lights.length - 1; i >= 0; i--) {
      fx.lights[i].life -= dt;
      if (fx.lights[i].life <= 0) fx.lights.splice(i, 1);
    }
    for (let i = fx.muzzleFlashes.length - 1; i >= 0; i--) {
      fx.muzzleFlashes[i].life -= dt;
      if (fx.muzzleFlashes[i].life <= 0) fx.muzzleFlashes.splice(i, 1);
    }
    for (let i = fx.floatingTexts.length - 1; i >= 0; i--) {
      const t = fx.floatingTexts[i];
      t.y += t.vy;
      t.life -= dt;
      if (t.life <= 0) fx.floatingTexts.splice(i, 1);
    }
    if (fx.flashOverlay > 0) fx.flashOverlay -= dt;
    if (fx.screenShake > 0) {
      fx.screenShake = Math.max(0, fx.screenShake - dt * 0.05);
      fx.shakeX = (Math.random() - 0.5) * fx.screenShake;
      fx.shakeY = (Math.random() - 0.5) * fx.screenShake;
    } else { fx.shakeX = 0; fx.shakeY = 0; }
  }

  function hexToRgba(hex, a){
    hex = hex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  function render(){
    cc.save();
    cc.translate(fx.shakeX, fx.shakeY);
    cc.fillStyle = '#0d0d18';
    cc.fillRect(0, 0, W, H);

    cc.strokeStyle = 'rgba(60,60,90,0.15)';
    cc.lineWidth = 1;
    for (let gx = 0; gx < W; gx += 40) { cc.beginPath(); cc.moveTo(gx, 0); cc.lineTo(gx, H); cc.stroke(); }
    for (let gy = 0; gy < H; gy += 40) { cc.beginPath(); cc.moveTo(0, gy); cc.lineTo(W, gy); cc.stroke(); }

    cc.globalCompositeOperation = 'lighter';
    for (const lt of fx.lights) {
      const alpha = (lt.life / lt.max) * lt.intensity;
      const grad = cc.createRadialGradient(lt.x, lt.y, 0, lt.x, lt.y, lt.r);
      grad.addColorStop(0, hexToRgba(lt.color, alpha));
      grad.addColorStop(1, hexToRgba(lt.color, 0));
      cc.fillStyle = grad;
      cc.beginPath(); cc.arc(lt.x, lt.y, lt.r, 0, Math.PI * 2); cc.fill();
    }
    cc.globalCompositeOperation = 'source-over';

    if (!latestSnapshot) { cc.restore(); return; }
    const snap = latestSnapshot;

    for (const warn of snap.airstrikeWarnings || []) {
      const alpha = 0.3 + Math.sin(fx.now * 0.02) * 0.2;
      cc.save();
      cc.strokeStyle = `rgba(255,58,92,${alpha})`;
      cc.lineWidth = 3;
      cc.setLineDash([8, 6]);
      cc.beginPath(); cc.arc(warn.x, warn.y, warn.radius, 0, Math.PI * 2); cc.stroke();
      cc.setLineDash([]);
      cc.fillStyle = 'rgba(255,58,92,0.08)'; cc.fill();
      cc.strokeStyle = `rgba(255,58,92,${alpha + 0.3})`;
      cc.lineWidth = 2;
      cc.beginPath();
      cc.moveTo(warn.x - 20, warn.y); cc.lineTo(warn.x + 20, warn.y);
      cc.moveTo(warn.x, warn.y - 20); cc.lineTo(warn.x, warn.y + 20);
      cc.stroke();
      cc.restore();
    }

    for (const w of snap.walls) {
      if (w.destroyed) continue;
      cc.fillStyle = 'rgba(0,0,0,0.4)';
      cc.fillRect(w.x + 4, w.y + 4, w.w, w.h);
      const hpFrac = w.indestructible ? 1 : (w.hp / w.maxHp);
      const gradW = cc.createLinearGradient(w.x, w.y, w.x, w.y + w.h);
      if (w.indestructible) {
        gradW.addColorStop(0, '#5a5a7a');
        gradW.addColorStop(1, '#3a3a55');
      } else {
        const topShade = Math.floor(58 + 24 * hpFrac);
        const botShade = Math.floor(35 + 22 * hpFrac);
        gradW.addColorStop(0, `rgb(${topShade},${topShade},${Math.floor(topShade * 1.3)})`);
        gradW.addColorStop(1, `rgb(${botShade},${botShade},${Math.floor(botShade * 1.3)})`);
      }
      cc.fillStyle = gradW;
      cc.fillRect(w.x, w.y, w.w, w.h);
      cc.strokeStyle = w.indestructible ? '#7a7a9a' : '#5a5a7a';
      cc.lineWidth = 2;
      cc.strokeRect(w.x, w.y, w.w, w.h);

      if (!w.indestructible && hpFrac < 0.7) {
        cc.strokeStyle = 'rgba(0,0,0,0.5)';
        cc.lineWidth = 1;
        const cracks = Math.floor((1 - hpFrac) * 5);
        for (let c = 0; c < cracks; c++) {
          const cx = w.x + (c * 0.2 + 0.1) * w.w;
          const cy = w.y + ((c * 7) % 5) / 5 * w.h;
          cc.beginPath();
          cc.moveTo(cx, cy);
          cc.lineTo(cx + (Math.sin(c * 13) * w.w * 0.15), cy + w.h * 0.4);
          cc.stroke();
        }
      }
    }

    for (const br of snap.barrels) {
      if (!br.alive) continue;
      cc.fillStyle = 'rgba(0,0,0,0.4)';
      cc.beginPath();
      cc.ellipse(br.x, br.y + br.r - 2, br.r * 0.9, br.r * 0.35, 0, 0, Math.PI * 2);
      cc.fill();
      const grad = cc.createRadialGradient(br.x - 4, br.y - 4, 2, br.x, br.y, br.r);
      grad.addColorStop(0, '#ff8a3a'); grad.addColorStop(1, '#8a2a1a');
      cc.fillStyle = grad;
      cc.beginPath(); cc.arc(br.x, br.y, br.r, 0, Math.PI * 2); cc.fill();
      cc.strokeStyle = '#442'; cc.lineWidth = 2; cc.stroke();
      cc.strokeStyle = '#ffcb3a'; cc.lineWidth = 2;
      cc.beginPath(); cc.arc(br.x, br.y, br.r - 5, 0, Math.PI * 2); cc.stroke();
      cc.fillStyle = '#ffcb3a'; cc.font = 'bold 14px Courier New';
      cc.textAlign = 'center'; cc.textBaseline = 'middle';
      cc.fillText('!', br.x, br.y);
    }

    for (let i = 0; i < SPAWN_POINTS.length; i++) {
      const pt = SPAWN_POINTS[i];
      cc.strokeStyle = i === 0 ? 'rgba(58,157,255,0.2)' : 'rgba(255,107,58,0.2)';
      cc.lineWidth = 2;
      cc.beginPath(); cc.arc(pt.x, pt.y, 26, 0, Math.PI * 2); cc.stroke();
    }

    for (const s of fx.smokeTrails) {
      const a = s.life / s.max;
      cc.globalAlpha = a * 0.4;
      cc.fillStyle = '#666';
      cc.beginPath(); cc.arc(s.x, s.y, s.size, 0, Math.PI * 2); cc.fill();
    }
    cc.globalAlpha = 1;

    for (const s of fx.shells) {
      const a = s.life / s.max;
      if (a < 0.5) cc.globalAlpha = a * 2;
      cc.save();
      cc.translate(s.x, s.y); cc.rotate(s.rot);
      cc.fillStyle = s.color;
      cc.fillRect(-s.size, -s.size / 3, s.size * 2, s.size * 0.7);
      cc.restore();
      cc.globalAlpha = 1;
    }

    for (const pick of snap.pickups) {
      const pulse = Math.sin(pick.pulse * 0.008) * 4;
      const alpha = pick.life < 3000 ? (Math.sin(pick.life * 0.02) > 0 ? 1 : 0.3) : 1;
      cc.save(); cc.globalAlpha = alpha;
      if (pick.kind === 'health') {
        cc.fillStyle = '#3aff9d';
        cc.beginPath(); cc.arc(pick.x, pick.y, pick.r + pulse, 0, Math.PI * 2); cc.fill();
        cc.fillStyle = '#fff'; cc.font = 'bold 16px Courier New';
        cc.textAlign = 'center'; cc.textBaseline = 'middle';
        cc.fillText('+', pick.x, pick.y);
      } else if (pick.kind === 'powerup' && pick.powerup) {
        const pu = pick.powerup;
        cc.strokeStyle = pu.color; cc.lineWidth = 2;
        cc.beginPath(); cc.arc(pick.x, pick.y, pick.r + pulse + 4, 0, Math.PI * 2); cc.stroke();
        cc.fillStyle = pu.color;
        cc.beginPath(); cc.arc(pick.x, pick.y, pick.r + pulse, 0, Math.PI * 2); cc.fill();
        cc.fillStyle = '#fff'; cc.font = 'bold 18px Courier New';
        cc.textAlign = 'center'; cc.textBaseline = 'middle';
        cc.fillText(pu.icon, pick.x, pick.y);
      }
      cc.restore();
    }

    for (const e of snap.explosions) {
      const tf = 1 - (e.life / e.maxLife);
      const er = e.max * (0.3 + tf * 0.9);
      const ea = 1 - tf;
      cc.save(); cc.globalAlpha = ea * 0.6;
      const gradE = cc.createRadialGradient(e.x, e.y, 0, e.x, e.y, er);
      gradE.addColorStop(0, 'rgba(255,255,200,1)');
      gradE.addColorStop(0.4, 'rgba(255,140,50,0.8)');
      gradE.addColorStop(1, 'rgba(255,50,50,0)');
      cc.fillStyle = gradE;
      cc.beginPath(); cc.arc(e.x, e.y, er, 0, Math.PI * 2); cc.fill();
      cc.restore();
    }

    for (const p of fx.particles) {
      const a = p.life / p.max;
      cc.globalAlpha = a; cc.fillStyle = p.color;
      cc.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    cc.globalAlpha = 1;

    for (const b of snap.bullets) {
      if (b.grenade) {
        cc.fillStyle = b.color;
        cc.beginPath(); cc.arc(b.x, b.y, 6, 0, Math.PI * 2); cc.fill();
        cc.strokeStyle = '#000'; cc.lineWidth = 1; cc.stroke();
      } else if (b.flame) {
        cc.fillStyle = '#ffeb3a'; cc.globalAlpha = 0.8;
        cc.beginPath(); cc.arc(b.x, b.y, 4, 0, Math.PI * 2); cc.fill();
        cc.globalAlpha = 1;
      } else {
        cc.strokeStyle = b.color; cc.lineWidth = 3; cc.lineCap = 'round';
        const bx2 = b.x - b.vx * 0.6;
        const by2 = b.y - b.vy * 0.6;
        cc.beginPath(); cc.moveTo(b.x, b.y); cc.lineTo(bx2, by2); cc.stroke();
        cc.globalAlpha = 0.3; cc.lineWidth = 7;
        cc.beginPath(); cc.moveTo(b.x, b.y); cc.lineTo(bx2, by2); cc.stroke();
        cc.globalAlpha = 1;
      }
    }

    for (const flash of fx.muzzleFlashes) {
      const a = flash.life / 80;
      cc.save(); cc.translate(flash.x, flash.y); cc.rotate(flash.angle);
      cc.globalAlpha = a; cc.fillStyle = '#ffeb3a';
      cc.beginPath();
      cc.moveTo(0, 0); cc.lineTo(20, -8); cc.lineTo(28, 0); cc.lineTo(20, 8);
      cc.closePath(); cc.fill();
      cc.fillStyle = flash.color; cc.globalAlpha = a * 0.5;
      cc.beginPath(); cc.arc(0, 0, 14, 0, Math.PI * 2); cc.fill();
      cc.restore();
    }

    for (const p of snap.players) { if (p.active !== false) drawPlayer(p); }

    for (const t of fx.floatingTexts) {
      const a = t.life / t.max;
      cc.globalAlpha = a; cc.fillStyle = t.color;
      cc.font = 'bold 16px Courier New'; cc.textAlign = 'center';
      cc.fillText(t.text, t.x, t.y);
    }
    cc.globalAlpha = 1;
    cc.restore();

    if (fx.flashOverlay > 0) {
      cc.save();
      cc.globalAlpha = Math.min(0.4, fx.flashOverlay / 120 * 0.4);
      cc.fillStyle = fx.flashColor;
      cc.fillRect(0, 0, W, H);
      cc.restore();
    }

    drawHUD();

    if (snap.announcement) {
      const al = snap.announcement;
      const alpha = al.life > 1400 ? (1800 - al.life) / 400 : Math.min(1, al.life / 500);
      cc.save(); cc.globalAlpha = alpha;
      cc.textAlign = 'center'; cc.font = 'bold 48px Courier New';
      cc.fillStyle = 'rgba(0,0,0,0.7)';
      cc.fillText(al.text, W / 2 + 2, 140 + 2);
      cc.fillStyle = al.color;
      cc.fillText(al.text, W / 2, 140);
      cc.restore();
    }
  }

  function drawPlayer(p){
    if (!p.alive) return;
    cc.fillStyle = 'rgba(0,0,0,0.35)';
    cc.beginPath();
    cc.ellipse(p.x, p.y + p.r - 2, p.r * 0.9, p.r * 0.35, 0, 0, Math.PI * 2);
    cc.fill();

    let playerAlpha = 1;
    const hasGhost = p.ultActive && p.ultType === 'ghost';
    const hasBerserk = p.ultActive && p.ultType === 'berserk';
    const pu = p.powerups || [];
    if (hasGhost) playerAlpha = 0.5;

    if (pu.includes('shield') || hasGhost) {
      cc.save();
      cc.strokeStyle = hasGhost ? '#9d6bff' : '#3a9dff';
      cc.globalAlpha = 0.6 + Math.sin(fx.now * 0.01) * 0.2;
      cc.lineWidth = 3;
      cc.beginPath(); cc.arc(p.x, p.y, p.r + 8, 0, Math.PI * 2); cc.stroke();
      cc.restore();
    }
    if (pu.includes('damage') || hasBerserk) {
      cc.save();
      cc.globalAlpha = 0.4 + Math.sin(fx.now * 0.015) * 0.2;
      const grad = cc.createRadialGradient(p.x, p.y, p.r, p.x, p.y, p.r + 18);
      grad.addColorStop(0, 'rgba(255,58,92,0.5)');
      grad.addColorStop(1, 'rgba(255,58,92,0)');
      cc.fillStyle = grad;
      cc.beginPath(); cc.arc(p.x, p.y, p.r + 18, 0, Math.PI * 2); cc.fill();
      cc.restore();
    }
    if (pu.includes('speed')) {
      cc.save();
      cc.strokeStyle = '#3affcb'; cc.globalAlpha = 0.4; cc.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        cc.beginPath();
        cc.moveTo(p.x - Math.cos(p.angle) * (10 + i * 4), p.y - Math.sin(p.angle) * (10 + i * 4));
        cc.lineTo(p.x - Math.cos(p.angle) * (18 + i * 4), p.y - Math.sin(p.angle) * (18 + i * 4));
        cc.stroke();
      }
      cc.restore();
    }

    if (p.invuln && !pu.includes('shield')) {
      cc.strokeStyle = '#fff';
      cc.globalAlpha = 0.4 + Math.sin(fx.now * 0.02) * 0.3;
      cc.lineWidth = 3;
      cc.beginPath(); cc.arc(p.x, p.y, p.r + 6, 0, Math.PI * 2); cc.stroke();
      cc.globalAlpha = 1;
    }

    cc.globalAlpha = playerAlpha;
    cc.fillStyle = p.color;
    cc.beginPath(); cc.arc(p.x, p.y, p.r, 0, Math.PI * 2); cc.fill();
    cc.strokeStyle = '#fff'; cc.lineWidth = 2; cc.stroke();

    cc.fillStyle = '#fff'; cc.font = 'bold 14px Courier New';
    cc.textAlign = 'center'; cc.textBaseline = 'middle';
    cc.fillText(String(p.id + 1), p.x, p.y);

    drawGun(p);
    cc.globalAlpha = 1;

    const bw = 40, bh = 5;
    const bx = p.x - bw / 2;
    const by = p.y - p.r - 14;
    cc.fillStyle = 'rgba(0,0,0,0.6)';
    cc.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    cc.fillStyle = '#333'; cc.fillRect(bx, by, bw, bh);
    const hpFrac = Math.max(0, p.hp / p.maxHp);
    cc.fillStyle = hpFrac > 0.5 ? '#3aff9d' : (hpFrac > 0.25 ? '#ffcb3a' : '#ff3a5c');
    cc.fillRect(bx, by, bw * hpFrac, bh);

    const icons = [];
    for (const type of pu) {
      const m = POWERUPS.find(x => x.type === type);
      if (m) icons.push(m);
    }
    if (icons.length > 0) {
      const startX = p.x - (icons.length * 14) / 2;
      for (let i = 0; i < icons.length; i++) {
        cc.fillStyle = icons[i].color;
        cc.font = 'bold 11px Courier New';
        cc.fillText(icons[i].icon, startX + i * 14 + 7, by - 8);
      }
    }

    if (p.ultCharge > 0 && p.ultCharge < 100) {
      cc.save();
      cc.strokeStyle = '#ffcb3a'; cc.globalAlpha = 0.5; cc.lineWidth = 2;
      cc.beginPath();
      cc.arc(p.x, p.y, p.r + 12, -Math.PI / 2, -Math.PI / 2 + (p.ultCharge / 100) * Math.PI * 2);
      cc.stroke();
      cc.restore();
    } else if (p.ultCharge >= 100) {
      cc.save();
      cc.strokeStyle = '#ffcb3a';
      cc.globalAlpha = 0.6 + Math.sin(fx.now * 0.015) * 0.3;
      cc.lineWidth = 3;
      cc.beginPath(); cc.arc(p.x, p.y, p.r + 12, 0, Math.PI * 2); cc.stroke();
      cc.restore();
    }
  }

  function drawGun(p){
    const weapon = WEAPONS[p.weaponLevel];
    const recoil = p.recoil || 0;
    const gx = p.x + Math.cos(p.angle) * (p.r - recoil);
    const gy = p.y + Math.sin(p.angle) * (p.r - recoil);
    cc.save(); cc.translate(gx, gy); cc.rotate(p.angle);
    if (weapon.melee) {
      cc.fillStyle = '#ddd'; cc.fillRect(0, -2, 26, 4);
      cc.fillStyle = '#ffcb3a'; cc.fillRect(-4, -3, 6, 6);
    } else if (weapon.name === 'PISTOL') {
      cc.fillStyle = '#444'; cc.fillRect(0, -3, 18, 6);
      cc.fillStyle = '#666'; cc.fillRect(4, 3, 6, 4);
    } else if (weapon.name === 'SMG') {
      cc.fillStyle = '#333'; cc.fillRect(0, -3, 22, 6); cc.fillRect(6, 3, 5, 6);
    } else if (weapon.name === 'SHOTGUN') {
      cc.fillStyle = '#553'; cc.fillRect(0, -4, 32, 8);
      cc.fillStyle = '#772'; cc.fillRect(-4, -3, 6, 6);
    } else if (weapon.name === 'CROSSBOW') {
      cc.fillStyle = '#6a4a2a'; cc.fillRect(0, -2, 26, 4);
      cc.fillStyle = '#9d6bff'; cc.fillRect(8, -8, 3, 16);
      cc.strokeStyle = '#9d6bff'; cc.lineWidth = 1;
      cc.beginPath(); cc.moveTo(8, -8); cc.lineTo(20, 0); cc.lineTo(8, 8); cc.stroke();
    } else if (weapon.name === 'RIFLE') {
      cc.fillStyle = '#222'; cc.fillRect(0, -3, 32, 6); cc.fillRect(10, -5, 4, 2);
    } else if (weapon.name === 'FLAMETHROWER') {
      cc.fillStyle = '#553'; cc.fillRect(0, -4, 26, 8);
      cc.fillStyle = '#ff6b3a'; cc.fillRect(22, -5, 6, 10);
      cc.fillStyle = '#333'; cc.fillRect(-6, -6, 6, 12);
    } else if (weapon.name === 'SNIPER') {
      cc.fillStyle = '#1a1a2a'; cc.fillRect(0, -3, 40, 6);
      cc.fillStyle = '#3a9dff'; cc.fillRect(14, -6, 10, 3);
    } else if (weapon.name === 'MINIGUN') {
      cc.fillStyle = '#555'; cc.fillRect(0, -6, 34, 12);
      cc.fillStyle = '#888'; cc.fillRect(6, -4, 20, 8);
    } else if (weapon.name === 'LASER') {
      cc.fillStyle = '#5a2a5a'; cc.fillRect(0, -4, 28, 8);
      cc.fillStyle = '#ff3aff'; cc.fillRect(22, -2, 6, 4);
    } else if (weapon.name === 'ROCKET') {
      cc.fillStyle = '#3a2a2a'; cc.fillRect(0, -5, 32, 10);
      cc.fillStyle = '#aa3a3a'; cc.fillRect(26, -6, 4, 12);
    } else if (weapon.name === 'GRENADES') {
      cc.fillStyle = '#2a4a2a'; cc.fillRect(0, -4, 22, 8);
      cc.fillStyle = '#3aff3a';
      cc.beginPath(); cc.arc(22, 0, 4, 0, Math.PI * 2); cc.fill();
    } else if (weapon.name === 'FLAK GUN') {
      cc.fillStyle = '#666'; cc.fillRect(0, -5, 28, 10);
      cc.fillStyle = '#ffcb3a'; cc.fillRect(24, -6, 4, 12);
    } else if (weapon.name === 'RAILGUN') {
      cc.fillStyle = '#1a3a4a'; cc.fillRect(0, -4, 38, 8);
      cc.fillStyle = '#3affff'; cc.fillRect(10, -6, 2, 12); cc.fillRect(24, -6, 2, 12);
    } else {
      cc.fillStyle = '#444'; cc.fillRect(0, -3, 20, 6);
    }
    cc.restore();
  }

  function drawHUD(){
    if (!latestSnapshot) return;
    const p0 = latestSnapshot.players[0], p1 = latestSnapshot.players[1];
    if (p0.active !== false) drawPlayerHUD(p0, 16, 16);
    if (p1.active !== false) drawPlayerHUD(p1, W - 16 - 340, 16);
    drawProgress();
    for (let i = 0; i < latestSnapshot.killFeed.length; i++) {
      const kf = latestSnapshot.killFeed[i];
      const y = H - 20 - (latestSnapshot.killFeed.length - 1 - i) * 22;
      const alpha = Math.min(1, kf.life / 600);
      cc.globalAlpha = alpha;
      cc.fillStyle = 'rgba(0,0,0,0.55)';
      cc.fillRect(W - 260, y - 16, 244, 20);
      cc.fillStyle = kf.color;
      cc.font = '13px Courier New'; cc.textAlign = 'left';
      cc.fillText(kf.text + '  [' + kf.weapon + ']', W - 252, y - 2);
    }
    cc.globalAlpha = 1;
  }

  function drawPlayerHUD(p, x, y){
    const w = 340, h = 102;
    cc.fillStyle = 'rgba(10,10,20,0.75)';
    cc.fillRect(x, y, w, h);
    cc.strokeStyle = p.color; cc.lineWidth = 2; cc.strokeRect(x, y, w, h);

    cc.fillStyle = p.color; cc.font = 'bold 16px Courier New'; cc.textAlign = 'left';
    const displayName = p.name || ('Player ' + (p.id + 1));
    const isMe = ctx.mySlot === p.id;
    const label = (isMe ? 'YOU • ' : '') + displayName.toUpperCase();
    cc.fillText(label, x + 12, y + 22);

    const weapon = WEAPONS[p.weaponLevel];
    cc.fillStyle = weapon.color; cc.font = 'bold 15px Courier New'; cc.textAlign = 'right';
    cc.fillText(weapon.name + ' (' + (p.weaponLevel + 1) + '/' + WEAPONS.length + ')', x + w - 12, y + 22);

    const hpY = y + 32;
    cc.fillStyle = '#222'; cc.fillRect(x + 12, hpY, w - 24, 12);
    const hpFrac = Math.max(0, p.hp / p.maxHp);
    cc.fillStyle = hpFrac > 0.5 ? '#3aff9d' : (hpFrac > 0.25 ? '#ffcb3a' : '#ff3a5c');
    cc.fillRect(x + 12, hpY, (w - 24) * hpFrac, 12);
    cc.strokeStyle = '#555'; cc.lineWidth = 1; cc.strokeRect(x + 12, hpY, w - 24, 12);
    cc.fillStyle = '#fff'; cc.font = '11px Courier New'; cc.textAlign = 'center';
    cc.fillText(Math.max(0, Math.ceil(p.hp)) + ' / ' + p.maxHp, x + w / 2, hpY + 9);

    const ammoY = y + 52;
    cc.fillStyle = '#aab'; cc.font = '12px Courier New'; cc.textAlign = 'left';
    if (weapon.melee) {
      cc.fillStyle = '#fff';
      cc.fillText('MELEE — INFINITE', x + 12, ammoY + 10);
    } else if (p.reloading) {
      cc.fillStyle = '#ffcb3a';
      cc.fillText('RELOADING', x + 12, ammoY + 10);
      cc.fillStyle = '#333'; cc.fillRect(x + 100, ammoY + 2, w - 110, 10);
      cc.fillStyle = '#ffcb3a';
      cc.fillRect(x + 100, ammoY + 2, (w - 110) * (p.reloadProgress || 0), 10);
    } else {
      cc.fillText('AMMO:', x + 12, ammoY + 10);
      const pipX = x + 64;
      const pipW = Math.min(14, (w - 80) / weapon.ammo);
      for (let a = 0; a < weapon.ammo; a++) {
        cc.fillStyle = a < p.ammo ? weapon.color : '#333';
        cc.fillRect(pipX + a * (pipW + 2), ammoY + 2, pipW, 10);
      }
    }

    const ultY = y + 70;
    cc.fillStyle = '#aab'; cc.font = '11px Courier New'; cc.textAlign = 'left';
    const ultLabel = p.ultActive ? ('⚡ ACTIVE: ' + (p.ultType || '').toUpperCase())
      : (p.ultCharge >= 100 ? '⚡ ULT READY!' : 'ULT:');
    cc.fillStyle = p.ultActive ? '#ffcb3a' : (p.ultCharge >= 100 ? '#ffcb3a' : '#aab');
    cc.fillText(ultLabel, x + 12, ultY + 8);

    cc.fillStyle = '#333'; cc.fillRect(x + 120, ultY, w - 130, 10);
    if (p.ultActive) {
      cc.fillStyle = p.color;
      cc.fillRect(x + 120, ultY, (w - 130) * Math.max(0, (p.ultActiveMs || 0) / 5000), 10);
    } else {
      const ultFrac = p.ultCharge / 100;
      const ultGrad = cc.createLinearGradient(x + 120, 0, x + 120 + (w - 130), 0);
      ultGrad.addColorStop(0, '#ff3a5c'); ultGrad.addColorStop(1, '#ffcb3a');
      cc.fillStyle = p.ultCharge >= 100 ? '#ffcb3a' : ultGrad;
      cc.fillRect(x + 120, ultY, (w - 130) * ultFrac, 10);
    }

    const dashY = y + 86;
    cc.fillStyle = '#667'; cc.font = '11px Courier New'; cc.textAlign = 'left';
    if (p.dashCooldown <= 0) {
      cc.fillStyle = '#3aff9d';
      cc.fillText('● DASH READY', x + 12, dashY + 8);
    } else {
      cc.fillText('○ dash ' + (p.dashCooldown / 1000).toFixed(1) + 's', x + 12, dashY + 8);
    }
    cc.fillStyle = '#aab'; cc.textAlign = 'right';
    cc.fillText('K:' + p.kills + '  D:' + p.deaths + (p.streak >= 2 ? '  🔥' + p.streak : ''), x + w - 12, dashY + 8);
  }

  function drawProgress(){
    const cx = W / 2; const y = 20; const totalW = 260;
    cc.fillStyle = '#ffcb3a'; cc.font = 'bold 14px Courier New'; cc.textAlign = 'center';
    cc.fillText('WEAPON RACE', cx, y + 12);
    for (let i = 0; i < 2; i++) {
      const p = latestSnapshot.players[i];
      const by = y + 22 + i * 22;
      const bx = cx - totalW / 2;
      cc.fillStyle = 'rgba(0,0,0,0.5)'; cc.fillRect(bx, by, totalW, 14);
      cc.strokeStyle = p.color; cc.lineWidth = 1; cc.strokeRect(bx, by, totalW, 14);
      const frac = p.weaponLevel / (WEAPONS.length - 1);
      cc.fillStyle = p.color; cc.fillRect(bx + 1, by + 1, (totalW - 2) * frac, 12);
      cc.fillStyle = '#fff'; cc.font = '11px Courier New'; cc.textAlign = 'left';
      cc.fillText('P' + (i + 1), bx - 20, by + 11);
    }
  }

  // ======== Returned handlers ========
  return {
    onState(snap){
      latestSnapshot = snap;
      processEvents(snap.events || []);
      if (snap.winner >= 0 && !sawWinner) {
        sawWinner = true;
        showWinOverlay(snap.winner);
      } else if (snap.winner < 0 && sawWinner) {
        sawWinner = false;
        hideWinOverlay();
      }
    },
    onRoomUpdate(room){
      // When host restarts, status flips back to 'playing'. Hide win overlay.
      if (room.status === 'playing') {
        sawWinner = false;
        hideWinOverlay();
      }
    },
    destroy(){
      running = false;
      window.removeEventListener('resize', fitCanvas);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      if (winOverlay.parentElement) winOverlay.parentElement.removeChild(winOverlay);
    }
  };
}
