// Demon Slayer client — faithful visual port of the original single-file
// game, adapted to render server snapshots instead of a local sim.
//
// Keeps the original's canvas draw functions (drawBackground, drawPlayer,
// drawEnemy, drawSlash, drawParticles, drawProjectiles, drawPickups,
// drawFloatingText) almost verbatim; input is sent server-side and the
// returned state/events drive rendering.

const W = 1024, H = 640;

// Breathing-style palette used by the original (for player trails, sword
// colours, particle tints, HUD labels). Matches the server's enum.
const STYLE_COLORS = {
  basic:   '#c0c0e0',
  water:   '#40a8ff',
  flame:   '#ff8c42',
  thunder: '#ffd166',
  beast:   '#e0e0e0',
  mist:    '#c0d0e8',
  wind:    '#a8e0a8',
  stone:   '#c0a080',
  serpent: '#6ac080',
  love:    '#ff80b0',
  insect:  '#c070ff',
  moon:    '#8844cc',
  flower:  '#ffb0d0',
  sound:   '#ffcc44',
  sun:     '#ffaa00'
};

// Demon palette: per-type body/eye colour. Mirrors the server's DEMON_TYPES
// + a couple of bosses that the original flagged for special flourishes.
const DEMON_PALETTE = {
  lesser:      { color: '#4a1e2a', eye: '#ff0033' },
  runner:      { color: '#2a1e4a', eye: '#ff00cc' },
  brute:       { color: '#6a1e1e', eye: '#ff6600' },
  caster:      { color: '#4a1e6a', eye: '#cc00ff' },
  blademaster: { color: '#1e1e4a', eye: '#00ffcc' },
  spider:      { color: '#4a2a6a', eye: '#a0ff00' },
  drum:        { color: '#6a3a1a', eye: '#ffaa00' },
  shifter:     { color: '#2a4a4a', eye: '#00ffaa' },
  lower_moon:  { color: '#2a0a4a', eye: '#aa00ff' },
  twin_daki:   { color: '#c0336b', eye: '#ff66aa' },
  twin_gyu:    { color: '#1a3a1a', eye: '#aaff00' },
  upper_moon:  { color: '#4a1a0a', eye: '#ff6600' },
  kokushibo:   { color: '#0a0a2a', eye: '#aa00ff' },
  doma:        { color: '#b0e0ff', eye: '#e0f0ff' },
  hantengu:    { color: '#c04030', eye: '#ff4020' },
  gyokko:      { color: '#30a0c0', eye: '#00ffee' },
  enmu:        { color: '#4a2a6a', eye: '#c000c0' },
  rokuro:      { color: '#3a2a3a', eye: '#aa4466' },
  wakuraba:    { color: '#2a3a2a', eye: '#aacc44' },
  mukago:      { color: '#4a3a2a', eye: '#ff8844' },
  kaigaku:     { color: '#404000', eye: '#ffee00' },
  lord:        { color: '#1a0a1a', eye: '#ff0000' }
};

// HUD CSS, injected into the document once per mount.
const HUD_CSS = `
.dsHUD, .dsHUD * { box-sizing: border-box; font-family: 'Georgia', serif; }
.dsHUD { position: absolute; inset: 0; pointer-events: none; z-index: 12; color: #fff; }
.dsHUD .barC { width: 280px; height: 22px; background: rgba(0,0,0,0.7); border: 2px solid #555; border-radius: 3px; margin-bottom: 6px; overflow: hidden; position: relative; }
.dsHUD .bar { height: 100%; transition: width 0.2s; }
.dsHUD .hp { background: linear-gradient(90deg, #c41e3a, #ff4060); }
.dsHUD .st { background: linear-gradient(90deg, #00a8ff, #40d0ff); }
.dsHUD .br { background: linear-gradient(90deg, #e74c3c, #ff8c42, #ffd166); }
.dsHUD .lab { position: absolute; left: 8px; top: 50%; transform: translateY(-50%); font-size: 12px; font-weight: bold; text-shadow: 1px 1px 2px #000; letter-spacing: 1px; }
.dsHUD #dsTop { position: absolute; top: 15px; left: 15px; }
.dsHUD #dsP1Name { color: #a8e0a8; font-weight: bold; font-size: 11px; letter-spacing: 2px; margin-bottom: 4px; text-shadow: 1px 1px 2px #000; display: none; }
.dsHUD #dsP1Name b { color: #ffd166; }
.dsHUD #dsStats { position: absolute; top: 15px; right: 15px; text-align: right; text-shadow: 2px 2px 4px #000; }
.dsHUD #dsStats h2 { font-size: 22px; color: #ffd166; letter-spacing: 2px; margin: 0; }
.dsHUD #dsStats p { font-size: 14px; margin-top: 3px; }
.dsHUD #dsP2 { position: absolute; top: 15px; left: 310px; width: 280px; display: none; }
.dsHUD #dsP2Name { color: #c8a8ff; font-weight: bold; font-size: 11px; letter-spacing: 2px; margin-bottom: 4px; text-shadow: 1px 1px 2px #000; }
.dsHUD #dsP2Name b { color: #ffd166; }
.dsHUD #dsSkills { position: absolute; bottom: 35px; left: 50%; transform: translateX(-50%); display: flex; flex-wrap: wrap; justify-content: center; max-width: 700px; gap: 6px; }
.dsHUD .slot { width: 52px; height: 52px; border: 2px solid #555; background: rgba(0,0,0,0.6); text-align: center; line-height: 52px; color: #ffd166; font-size: 16px; font-weight: bold; position: relative; }
.dsHUD .slot.ready { border-color: #ffd166; box-shadow: 0 0 10px #ff8c42; }
.dsHUD .slot.cooldown { opacity: 0.5; }
.dsHUD .slot .k { position: absolute; top: -2px; left: 2px; font-size: 9px; color: #aaa; line-height: 1; }
.dsHUD .slot .tag { position: absolute; bottom: -14px; left: -6px; right: -6px; font-size: 8px; color: #ccc; letter-spacing: 0.5px; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 1px 1px 2px #000; }
.dsHUD .slot.ready .tag { color: #ffd166; }
.dsHUD #dsP2Slots { display: flex; margin-top: 4px; gap: 4px; }
.dsHUD #dsP2Slots .slot { width: 32px; height: 32px; line-height: 32px; font-size: 11px; }
.dsHUD #dsBreathName { position: absolute; bottom: 150px; left: 50%; transform: translateX(-50%); font-size: 16px; color: #ffd166; text-shadow: 2px 2px 6px #000, 0 0 10px #ff8c42; letter-spacing: 3px; text-align: center; opacity: 0; transition: opacity 0.3s; }
.dsHUD #dsCombo { position: absolute; top: 120px; right: 20px; font-size: 24px; color: #ffd166; text-shadow: 2px 2px 4px #000; opacity: 0; transition: opacity 0.3s; }
.dsHUD #dsCrow { position: absolute; top: 160px; left: 50%; transform: translateX(-50%); max-width: 600px; text-align: center; font-size: 14px; padding: 10px 20px; background: rgba(0,0,0,0.7); border: 1px solid #555; border-radius: 4px; opacity: 0; transition: opacity 0.4s; }
.dsHUD #dsControls { position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%); font-size: 10px; color: #aaa; text-align: center; letter-spacing: 1px; width: 100%; }

.dsHUD #dsCard { position: absolute; inset: 0; background: rgba(0,0,0,0.92); display: none; flex-direction: column; justify-content: center; align-items: center; text-align: center; pointer-events: auto; }
.dsHUD #dsCard.on { display: flex; }
.dsHUD #dsCard h1 { font-size: 38px; color: #ffd166; letter-spacing: 4px; margin-bottom: 10px; text-shadow: 0 0 20px #ff8c42; }
.dsHUD #dsCard .sub { color: #aaa; font-size: 14px; letter-spacing: 3px; margin-bottom: 30px; }
.dsHUD #dsCard .row { display: flex; gap: 20px; justify-content: center; flex-wrap: wrap; max-width: 900px; }
.dsHUD .card { width: 220px; height: 300px; background: linear-gradient(180deg, #1a0a2e, #3a0ca3); border: 3px solid #ffd166; padding: 20px; display: flex; flex-direction: column; align-items: center; cursor: pointer; transition: all 0.2s; position: relative; overflow: hidden; font-family: Georgia, serif; color: #fff; }
.dsHUD .card:hover { transform: translateY(-10px) scale(1.03); box-shadow: 0 10px 40px rgba(255,209,102,0.6); }
.dsHUD .card .ic { font-size: 50px; margin: 20px 0; }
.dsHUD .card .nm { font-size: 18px; color: #ffd166; font-weight: bold; letter-spacing: 2px; margin-bottom: 10px; }
.dsHUD .card .ds { font-size: 13px; color: #eee; line-height: 1.5; }
.dsHUD .card .rar { position: absolute; top: 5px; right: 8px; font-size: 10px; letter-spacing: 2px; padding: 2px 6px; border-radius: 3px; }
.dsHUD .r-common { background: #666; color: #fff; }
.dsHUD .r-rare { background: #3a86ff; color: #fff; }
.dsHUD .r-epic { background: #7209b7; color: #fff; }
.dsHUD .r-legendary { background: linear-gradient(90deg, #ff8c42, #ffd166); color: #000; }
.dsHUD .r-mythical { background: linear-gradient(90deg, #ff0080, #ffaa00, #ffee00, #ff0080); color: #000; font-weight: bold; }
.dsHUD .card.legendary { border-color: #ff8c42; box-shadow: 0 0 30px #ff8c42; }
.dsHUD .card.mythical { border-color: #ffee00; box-shadow: 0 0 50px #ffaa00; }
.dsHUD .card.epic { border-color: #b66cff; }
.dsHUD .card.rare { border-color: #3a86ff; }

.dsHUD #dsEndScreen { position: absolute; inset: 0; background: rgba(0,0,0,0.92); display: none; flex-direction: column; justify-content: center; align-items: center; text-align: center; pointer-events: auto; }
.dsHUD #dsEndScreen.on { display: flex; }
.dsHUD #dsEndScreen h1 { font-size: 64px; letter-spacing: 6px; }
.dsHUD #dsEndScreen.lost h1 { color: #c41e3a; }
.dsHUD #dsEndScreen.won h1 { color: #ffd166; text-shadow: 0 0 30px #ff8c42; }
`;

export async function init(ctx){
  const canvas = ctx.canvas;
  const cctx = canvas.getContext('2d');
  canvas.width = W; canvas.height = H;
  fitCanvas();
  window.addEventListener('resize', fitCanvas);
  function fitCanvas(){
    const maxW = window.innerWidth - 20, maxH = window.innerHeight - 20;
    const scale = Math.min(maxW / W, maxH / H, 1);
    canvas.style.width = (W * scale) + 'px';
    canvas.style.height = (H * scale) + 'px';
  }

  // ========= HUD overlay =========
  const styleEl = document.createElement('style');
  styleEl.textContent = HUD_CSS;
  document.head.appendChild(styleEl);

  const hud = document.createElement('div');
  hud.className = 'dsHUD';
  const parent = canvas.parentElement;
  const prevPos = parent.style.position;
  if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
  parent.appendChild(hud);
  hud.innerHTML = `
    <div id="dsTop">
      <div id="dsP1Name">PLAYER 1 — <b id="dsP1Style">—</b></div>
      <div class="barC"><div class="bar hp" id="dsHp" style="width:100%"></div><div class="lab">HP</div></div>
      <div class="barC"><div class="bar st" id="dsSt" style="width:100%"></div><div class="lab">STAMINA</div></div>
      <div class="barC"><div class="bar br" id="dsBr" style="width:0%"></div><div class="lab">TOTAL CONCENTRATION</div></div>
    </div>
    <div id="dsStats">
      <h2 id="dsWave">WAVE 1</h2>
      <p id="dsDemons">Demons: 0</p>
      <p id="dsScore">Score: 0</p>
      <p id="dsKills">Kills: 0</p>
    </div>
    <div id="dsP2">
      <div id="dsP2Name">PLAYER 2 — <b id="dsP2Style">—</b></div>
      <div class="barC" style="width:280px;height:22px;"><div class="bar hp" id="dsHp2" style="width:100%"></div><div class="lab">HP</div></div>
      <div class="barC" style="width:280px;height:22px;"><div class="bar st" id="dsSt2" style="width:100%"></div><div class="lab">STAMINA</div></div>
      <div class="barC" style="width:280px;height:22px;"><div class="bar br" id="dsBr2" style="width:0%"></div><div class="lab">BREATH</div></div>
      <div id="dsP2Slots"></div>
    </div>
    <div id="dsCrow"></div>
    <div id="dsBreathName"></div>
    <div id="dsCombo">COMBO x1</div>
    <div id="dsSkills"></div>
    <div id="dsControls">P1: WASD / SPACE / SHIFT / Q / 1-4   |   P2: Arrows / . / , / / / 7-0</div>
    <div id="dsCard"><h1>SOLAR DEMON CARDS</h1><div class="sub" id="dsCardSub">Choose one to grow stronger</div><div class="row" id="dsCardRow"></div></div>
    <div id="dsEndScreen"><h1 id="dsEndH">DEFEATED</h1><p style="font-size:20px;color:#aaa;margin:20px 0;" id="dsEndSub"></p><p style="font-size:24px;color:#ffd166;" id="dsEndScore"></p></div>
  `;
  const el = (id) => hud.querySelector('#' + id);
  const dom = {
    p1Name: el('dsP1Name'), p1Style: el('dsP1Style'),
    p2Row: el('dsP2'), p2Name: el('dsP2Name'), p2Style: el('dsP2Style'),
    hp: el('dsHp'), st: el('dsSt'), br: el('dsBr'),
    hp2: el('dsHp2'), st2: el('dsSt2'), br2: el('dsBr2'),
    wave: el('dsWave'), demons: el('dsDemons'), score: el('dsScore'), kills: el('dsKills'),
    crow: el('dsCrow'), breathName: el('dsBreathName'),
    combo: el('dsCombo'),
    skills: el('dsSkills'), p2Slots: el('dsP2Slots'),
    card: el('dsCard'), cardSub: el('dsCardSub'), cardRow: el('dsCardRow'),
    end: el('dsEndScreen'), endH: el('dsEndH'), endSub: el('dsEndSub'), endScore: el('dsEndScore')
  };

  // ========= Audio =========
  let ac = null;
  function AC(){
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch {} }
    return ac;
  }
  AC();
  function playSound(freq, dur, type='sine', vol=0.15) {
    const a = AC(); if (!a) return;
    try {
      const o = a.createOscillator(), g = a.createGain();
      o.connect(g); g.connect(a.destination);
      o.type = type; o.frequency.setValueAtTime(freq, a.currentTime);
      g.gain.setValueAtTime(vol, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
      o.start(); o.stop(a.currentTime + dur);
    } catch {}
  }
  const slashSound = () => { playSound(800, 0.1, 'sawtooth', 0.1); setTimeout(() => playSound(400, 0.1, 'sawtooth', 0.08), 30); };
  const demonHitSound = () => playSound(200, 0.2, 'sawtooth', 0.1);
  const breathSound = () => { playSound(300, 0.3, 'sine', 0.08); setTimeout(() => playSound(500, 0.3, 'sine', 0.06), 100); };
  const hurtSound = () => playSound(100, 0.3, 'sawtooth', 0.15);
  const cardPickupSound = () => {
    playSound(800, 0.1, 'sine', 0.1);
    setTimeout(() => playSound(1200, 0.1, 'sine', 0.08), 80);
    setTimeout(() => playSound(1600, 0.15, 'sine', 0.08), 160);
  };
  const flameSfx = () => { playSound(200, 0.4, 'sawtooth', 0.12); setTimeout(() => playSound(120, 0.3, 'sawtooth', 0.1), 80); };
  const thunderSfx = () => { playSound(1200, 0.1, 'square', 0.15); setTimeout(() => playSound(80, 0.3, 'sawtooth', 0.12), 40); };
  const sunSfx = () => { playSound(660, 0.2, 'sine', 0.15); setTimeout(() => playSound(990, 0.2, 'sine', 0.12), 80); setTimeout(() => playSound(1320, 0.3, 'sine', 0.1), 160); };
  const moonSfx = () => { playSound(180, 0.4, 'sine', 0.14); setTimeout(() => playSound(90, 0.3, 'sawtooth', 0.1), 100); };

  function sfxForForm(style){
    if (style === 'flame' || style === 'sound') { flameSfx(); return; }
    if (style === 'thunder') { thunderSfx(); return; }
    if (style === 'sun') { sunSfx(); return; }
    if (style === 'moon') { moonSfx(); return; }
    breathSound();
  }

  // ========= FX state =========
  const fx = {
    particles: [], pickupsVisual: [],
    floatingTexts: [],
    screenShake: 0, shakeX: 0, shakeY: 0,
    flashOverlay: 0, flashColor: '#fff',
    chainLinks: [],
    now: 0,
    crowTimer: 0, breathNameTimer: 0
  };
  function addParticle(p){ fx.particles.push(p); }
  function addFloat(text, x, y, color, size, life){
    fx.floatingTexts.push({ text, x, y, color, size: size || 18, life: life || 60, maxLife: life || 60 });
  }
  function showCrow(msg){
    dom.crow.innerHTML = `<span style="font-size:24px;vertical-align:middle;">🪶</span> <span style="color:#ddd;font-style:italic;">${escapeHtml(msg)}</span>`;
    dom.crow.style.opacity = '1';
    fx.crowTimer = 5000;
  }
  function showBreathName(msg, color){
    dom.breathName.textContent = msg;
    dom.breathName.style.color = color || '#ffd166';
    dom.breathName.style.opacity = '1';
    fx.breathNameTimer = 1600;
  }

  // ========= Events =========
  function processEvents(events){
    for (const e of events) {
      switch (e.kind) {
        case 'slash':
          slashSound();
          break;
        case 'form-activate':
          sfxForForm(e.style || 'basic');
          fx.screenShake = Math.max(fx.screenShake, e.style === 'sun' ? 12 : 6);
          showBreathName(e.name || '', STYLE_COLORS[e.style] || e.color);
          // Sparks around the caster — style-tinted
          for (let i = 0; i < 24; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 1 + Math.random() * 4;
            addParticle({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 36, maxLife: 36, size: 2 + Math.random() * 3, color: e.color || STYLE_COLORS[e.style], type: partTypeForStyle(e.style) });
          }
          break;
        case 'hit':
          demonHitSound();
          addFloat((e.isCrit ? 'CRIT ' : '') + e.dmg, e.x, e.y - 30, e.isCrit ? '#ffee88' : (e.poison ? '#c070ff' : '#ff6666'), e.isCrit ? 20 : 14, 40);
          for (let i = 0; i < 6; i++) {
            addParticle({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, life: 22, maxLife: 22, size: 2 + Math.random() * 2, color: e.poison ? '#c070ff' : '#ff4466', type: 'spark' });
          }
          break;
        case 'demon-spawn':
          for (let i = 0; i < 8; i++) {
            const a = Math.random() * Math.PI * 2;
            addParticle({ x: e.x, y: e.y, vx: Math.cos(a) * 1.5, vy: Math.sin(a) * 1.5, life: 20, maxLife: 20, size: 2, color: '#552244', type: 'ash' });
          }
          if (e.boss) {
            fx.screenShake = Math.max(fx.screenShake, 20);
            addFloat((e.name || 'BOSS') + ' APPEARS', W / 2, 60, '#ff4466', 22, 150);
            if (e.rank) addFloat(e.rank, W / 2, 90, '#ffaa66', 15, 150);
            playSound(120, 0.5, 'sawtooth', 0.15);
            setTimeout(() => playSound(90, 0.4, 'sawtooth', 0.12), 200);
          }
          break;
        case 'demon-die':
          demonHitSound();
          fx.screenShake = Math.max(fx.screenShake, e.boss ? 18 : 3);
          for (let i = 0; i < (e.boss ? 60 : 22); i++) {
            const a = Math.random() * Math.PI * 2;
            const s = 1 + Math.random() * 5;
            addParticle({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 48, maxLife: 48, size: 2 + Math.random() * 3, color: e.color || '#aa2233', type: 'ash' });
          }
          if (e.boss) addFloat('BOSS SLAIN', e.x, e.y - 40, '#ffd166', 22, 120);
          break;
        case 'demon-shoot':
          playSound(320, 0.1, 'square', 0.06);
          break;
        case 'demon-dash':
          for (let i = 0; i < 6; i++) {
            addParticle({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, life: 18, maxLife: 18, size: 2, color: '#8844cc', type: 'spark' });
          }
          break;
        case 'web':
          for (let i = 0; i < 10; i++) {
            addParticle({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, life: 40, maxLife: 40, size: 2, color: '#a0ff00', type: 'mist' });
          }
          break;
        case 'chain-link':
          fx.chainLinks.push({ x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, color: e.color || '#ffd166', life: 14, maxLife: 14 });
          break;
        case 'moon-blade':
          playSound(700, 0.12, 'sine', 0.08);
          break;
        case 'evade':
          playSound(900, 0.1, 'sine', 0.08);
          addFloat('EVADE', e.x, e.y - 30, '#c0d0e8', 14, 30);
          for (let i = 0; i < 10; i++) addParticle({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, life: 24, maxLife: 24, size: 3, color: '#c0d0e8', type: 'mist' });
          break;
        case 'death-defy':
          playSound(800, 0.4, 'sine', 0.15);
          fx.screenShake = 18;
          addFloat('SET MY HEART ABLAZE!', e.x, e.y - 50, '#ff4400', 22, 120);
          for (let i = 0; i < 40; i++) {
            const a = Math.random() * Math.PI * 2;
            addParticle({ x: e.x, y: e.y, vx: Math.cos(a) * (2 + Math.random() * 4), vy: Math.sin(a) * (2 + Math.random() * 4), life: 60, maxLife: 60, size: 3 + Math.random() * 3, color: Math.random() < 0.5 ? '#ff4400' : '#ffd166', type: 'flame' });
          }
          break;
        case 'player-hurt':
          hurtSound();
          fx.screenShake = Math.max(fx.screenShake, 8);
          for (let i = 0; i < 10; i++) addParticle({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, life: 30, maxLife: 30, size: 3, color: '#c41e3a', type: 'spark' });
          fx.flashOverlay = 60; fx.flashColor = '#881122';
          break;
        case 'player-down':
          playSound(120, 0.4, 'sawtooth', 0.2);
          fx.screenShake = 15;
          addFloat('SLAYER DOWN', e.x, e.y - 40, '#c41e3a', 18, 120);
          break;
        case 'player-revive':
          playSound(500, 0.2, 'sine', 0.1);
          addFloat('REVIVED', e.x, e.y - 40, '#44ff88', 18, 60);
          break;
        case 'dash':
          playSound(600, 0.1, 'sine', 0.08);
          break;
        case 'pickup':
          playSound(e.type === 'hp' ? 800 : 600, 0.1, 'sine', 0.1);
          addFloat(e.type === 'hp' ? '+15 HP' : '+25 Breath', e.x, e.y - 20, e.type === 'hp' ? '#44ff88' : '#ffd166', 13, 40);
          break;
        case 'wave-start':
          playSound(260, 0.5, 'sine', 0.1);
          showCrow(CROW_LINES[Math.min(e.wave - 1, CROW_LINES.length - 1)] || 'Caw! Another wave!');
          addFloat('WAVE ' + e.wave, W / 2, H / 2 - 100, '#ffd166', 36, 120);
          if (e.isBoss) fx.screenShake = 20;
          break;
        case 'card-offer':
          cardPickupSound();
          break;
        case 'card-pick':
          cardPickupSound();
          if (e.name) addFloat('CARD: ' + e.name, W / 2, H / 2 + 80, e.rarity === 'mythical' ? '#ff00ff' : (e.rarity === 'legendary' ? '#ff8c42' : '#ffd166'), 18, 120);
          break;
        case 'sound-bomb':
          playSound(150, 0.3, 'square', 0.15);
          fx.screenShake = Math.max(fx.screenShake, 10);
          break;
      }
    }
  }

  const CROW_LINES = [
    "Caw! Caw! Demons at the treeline! Show them steel!",
    "Caw! More demons! Ember Village reports screams at dusk!",
    "Caw! Caw! Lower Moon FOUR — Mukago — approaches!",
    "Caw! Blood sorcerers and spider demons creep forth!",
    "Caw! Caw! Lower Moon THREE — Wakuraba — she's fast, watch your back!",
    "Caw! Shapeshifters and drum demons gather in the mist!",
    "Caw! Caw! Lower Moon TWO — Rokuro — the blade demon stirs!",
    "Caw! LOWER MOON ONE — Enmu — the dream demon comes to rob your sleep!",
    "Caw! Caw! Lower Moon FIVE — Rui — the spider-thread demon!",
    "Caw! CAW! DAKI AND GYUTARO! Upper Moon SIX — slay them together!",
    "Caw! Kaigaku — Zenitsu's fallen brother! Upper Moon Six reborn!",
    "Caw! Caw! UPPER MOON FIVE — GYOKKO!",
    "Caw! UPPER MOON FOUR — HANTENGU! He splits into clones!",
    "Caw! Caw! UPPER MOON THREE — AKAZA! Master of Destructive Death!",
    "Caw! UPPER MOON TWO — DOMA! Cryokinesis — beware the cold!",
    "Caw! Caw! UPPER MOON ONE — KOKUSHIBO! Do NOT falter!",
    "Caw! Caw! MUZAN KIBUTSUJI! Slay him and dawn will break!"
  ];

  function partTypeForStyle(style){
    if (style === 'flame' || style === 'sun') return 'flame';
    if (style === 'thunder' || style === 'sound') return 'lightning';
    if (style === 'water' || style === 'mist') return 'water';
    if (style === 'moon' || style === 'stone') return 'breath';
    return 'spark';
  }

  // ========= Input =========
  const keys = Object.create(null);
  const input = { up:0,down:0,left:0,right:0,slash:0,dash:0,charge:0,f1:0,f2:0,f3:0,f4:0,cardPick:0 };
  const onKeyDown = (e) => {
    const k = e.key; const kl = k.toLowerCase();
    if (['w','a','s','d','f','g','q','r',' ','shift','enter',',','.','/','1','2','3','4','7','8','9','0'].includes(kl) || kl.startsWith('arrow')) e.preventDefault();
    keys[kl] = true;
    if (latestSnapshot && latestSnapshot.cardSelect && latestSnapshot.cardSelect.picker === ctx.mySlot) {
      if (k === '1' || k === '2' || k === '3') {
        input.cardPick = parseInt(k, 10);
        sendInput(true);
        setTimeout(() => { input.cardPick = 0; }, 60);
      }
    }
  };
  const onKeyUp = (e) => { keys[e.key.toLowerCase()] = false; };
  const onBlur = () => { for (const k in keys) keys[k] = false; };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  function collectInput(){
    input.up    = keys['w'] || keys['arrowup']    ? 1 : 0;
    input.down  = keys['s'] || keys['arrowdown']  ? 1 : 0;
    input.left  = keys['a'] || keys['arrowleft']  ? 1 : 0;
    input.right = keys['d'] || keys['arrowright'] ? 1 : 0;
    input.slash = keys[' '] || keys['.']          ? 1 : 0;
    input.dash  = keys['shift'] || keys[',']      ? 1 : 0;
    input.charge= keys['q'] || keys['/']          ? 1 : 0;
    input.f1 = keys['1'] ? 1 : 0; input.f2 = keys['2'] ? 1 : 0;
    input.f3 = keys['3'] ? 1 : 0; input.f4 = keys['4'] ? 1 : 0;
  }
  let seq = 0, lastSent = { up:-1 }, lastSendAt = 0;
  function sendInput(force){
    const now = performance.now();
    let changed = force;
    if (!changed) for (const k in input) if (input[k] !== lastSent[k]) { changed = true; break; }
    if (!changed && now - lastSendAt < 200) return;
    seq++; ctx.send({ t: 'input', seq, ...input });
    lastSent = { ...input }; lastSendAt = now;
  }

  // ========= Card click handler =========
  dom.cardRow.addEventListener('click', (e) => {
    const c = e.target.closest('.card');
    if (!c) return;
    const idx = Number(c.dataset.i);
    if (!Number.isFinite(idx)) return;
    if (!latestSnapshot || !latestSnapshot.cardSelect) return;
    if (latestSnapshot.cardSelect.picker !== ctx.mySlot) return;
    input.cardPick = idx + 1;
    sendInput(true);
    setTimeout(() => { input.cardPick = 0; }, 60);
  });

  // ========= Render loop =========
  let latestSnapshot = null;
  let running = true;
  let lastFrame = performance.now();
  function loop(now){
    if (!running) return;
    const dt = Math.min(50, now - lastFrame);
    lastFrame = now; fx.now = now;
    updateFx(dt); collectInput(); sendInput(false); render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  function updateFx(dt){
    const step = dt / 16.667;
    for (let i = fx.particles.length - 1; i >= 0; i--) {
      const p = fx.particles[i];
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.94; p.vy *= 0.94;
      p.life -= step;
      if (p.life <= 0) fx.particles.splice(i, 1);
    }
    for (let i = fx.floatingTexts.length - 1; i >= 0; i--) {
      const t = fx.floatingTexts[i];
      t.y -= 0.6; t.life -= step;
      if (t.life <= 0) fx.floatingTexts.splice(i, 1);
    }
    for (let i = fx.chainLinks.length - 1; i >= 0; i--) {
      fx.chainLinks[i].life -= step;
      if (fx.chainLinks[i].life <= 0) fx.chainLinks.splice(i, 1);
    }
    if (fx.flashOverlay > 0) fx.flashOverlay -= step;
    if (fx.screenShake > 0) {
      fx.screenShake = Math.max(0, fx.screenShake * 0.85 - 0.1);
      fx.shakeX = (Math.random() - 0.5) * fx.screenShake;
      fx.shakeY = (Math.random() - 0.5) * fx.screenShake;
    } else { fx.shakeX = 0; fx.shakeY = 0; }
    if (fx.crowTimer > 0) {
      fx.crowTimer -= dt;
      if (fx.crowTimer <= 0) dom.crow.style.opacity = '0';
    }
    if (fx.breathNameTimer > 0) {
      fx.breathNameTimer -= dt;
      if (fx.breathNameTimer <= 0) dom.breathName.style.opacity = '0';
    }
  }

  function render(){
    // Background first, then shaken layer.
    drawBackground();
    cctx.save();
    cctx.translate(fx.shakeX, fx.shakeY);

    if (latestSnapshot) {
      const s = latestSnapshot;
      // Slashes behind entities
      for (const sl of s.slashes) drawSlash(sl);
      // Chain link flashes
      for (const c of fx.chainLinks) {
        const a = c.life / c.maxLife;
        cctx.save();
        cctx.globalCompositeOperation = 'lighter';
        cctx.strokeStyle = c.color; cctx.shadowBlur = 20; cctx.shadowColor = c.color;
        cctx.globalAlpha = a; cctx.lineWidth = 5;
        cctx.beginPath(); cctx.moveTo(c.x1, c.y1); cctx.lineTo(c.x2, c.y2); cctx.stroke();
        cctx.strokeStyle = '#fff'; cctx.shadowBlur = 8; cctx.lineWidth = 2;
        cctx.stroke();
        cctx.restore();
      }
      // Pickups
      for (const pk of s.pickups) drawPickup(pk);
      // Projectiles (enemy fire + friendly moon blades)
      for (const pr of (s.projectiles || [])) drawProjectile(pr);
      // Enemies
      for (const e of s.enemies) drawEnemy(e);
      // Players
      for (const p of s.players) { if (p.active !== false) drawPlayer(p); }
      // Particles
      drawParticles();
      // Floating texts
      for (const t of fx.floatingTexts) drawFloat(t);
    }

    cctx.restore();

    // Flash overlay ignores shake
    if (fx.flashOverlay > 0) {
      cctx.save();
      cctx.globalAlpha = Math.min(0.4, fx.flashOverlay / 60 * 0.4);
      cctx.fillStyle = fx.flashColor;
      cctx.fillRect(0, 0, W, H);
      cctx.restore();
    }

    // HUD DOM refresh
    if (latestSnapshot) updateHUD(latestSnapshot);
  }

  // ========= Drawing (faithful port of the original) =========
  function drawBackground(){
    const grad = cctx.createRadialGradient(W/2, H/2, 100, W/2, H/2, 600);
    grad.addColorStop(0, '#1a1a2e'); grad.addColorStop(0.5, '#0f0f1e'); grad.addColorStop(1, '#05050a');
    cctx.fillStyle = grad; cctx.fillRect(0, 0, W, H);
    cctx.save();
    cctx.fillStyle = 'rgba(255, 220, 160, 0.15)';
    cctx.beginPath(); cctx.arc(W - 150, 100, 60, 0, Math.PI * 2); cctx.fill();
    cctx.fillStyle = 'rgba(255, 230, 180, 0.7)';
    cctx.beginPath(); cctx.arc(W - 150, 100, 45, 0, Math.PI * 2); cctx.fill();
    cctx.fillStyle = '#fff5e1';
    cctx.beginPath(); cctx.arc(W - 150, 100, 35, 0, Math.PI * 2); cctx.fill();
    cctx.restore();
    for (let i = 0; i < 40; i++) {
      const sx = (i * 137) % W;
      const sy = (i * 71) % (H * 0.4);
      const t = 0.3 + 0.3 * Math.sin(Date.now() / 500 + i);
      cctx.fillStyle = `rgba(255,255,255,${t})`;
      cctx.fillRect(sx, sy, 2, 2);
    }
    cctx.strokeStyle = 'rgba(80, 40, 100, 0.1)'; cctx.lineWidth = 1;
    for (let x = 0; x < W; x += 80) { cctx.beginPath(); cctx.moveTo(x, H * 0.5); cctx.lineTo(x, H); cctx.stroke(); }
    for (let y = H * 0.5; y < H; y += 40) { cctx.beginPath(); cctx.moveTo(0, y); cctx.lineTo(W, y); cctx.stroke(); }
    const vig = cctx.createRadialGradient(W/2, H/2, 300, W/2, H/2, 700);
    vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.7)');
    cctx.fillStyle = vig; cctx.fillRect(0, 0, W, H);
  }

  function drawPlayer(p){
    const cctx_ = cctx;
    cctx_.save();

    // Charge aura
    if (p.charging) {
      const pulse = 1 + 0.1 * Math.sin(Date.now() / 100);
      cctx_.strokeStyle = `rgba(255, 209, 102, ${0.3 + 0.2 * Math.sin(Date.now() / 150)})`;
      cctx_.lineWidth = 3;
      cctx_.beginPath(); cctx_.arc(p.x, p.y, p.radius * 2 * pulse, 0, Math.PI * 2); cctx_.stroke();
      cctx_.strokeStyle = `rgba(255, 140, 66, 0.4)`;
      cctx_.beginPath(); cctx_.arc(p.x, p.y, p.radius * 3 * pulse, 0, Math.PI * 2); cctx_.stroke();
    }

    // Hit-flash / invuln flicker
    if (p.hitFlash > 0 && Math.floor(fx.now / 30) % 2) cctx_.globalAlpha = 0.5;
    if (p.invulnerable && Math.floor(fx.now / 60) % 2) cctx_.globalAlpha = 0.4;

    // Shadow
    cctx_.fillStyle = 'rgba(0,0,0,0.4)';
    cctx_.beginPath(); cctx_.ellipse(p.x, p.y + p.radius + 4, p.radius * 0.8, 4, 0, 0, Math.PI * 2); cctx_.fill();

    // Haori (green for P1, purple for P2)
    const isP1 = p.id === 0;
    cctx_.fillStyle = isP1 ? '#1a3a1a' : '#4a1a4a';
    cctx_.beginPath(); cctx_.arc(p.x, p.y, p.radius, 0, Math.PI * 2); cctx_.fill();
    // Pattern
    cctx_.fillStyle = isP1 ? '#0a0a0a' : '#ffd166';
    if (isP1) {
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        if ((i + j) % 2 === 0) cctx_.fillRect(p.x + i * 6 - 3, p.y + j * 6 - 3, 6, 6);
      }
    } else {
      for (let i = -1; i <= 1; i++) cctx_.fillRect(p.x + i * 6 - 2, p.y - 6, 2, 14);
    }
    // Head
    cctx_.fillStyle = '#f4c2a0';
    cctx_.beginPath(); cctx_.arc(p.x, p.y - 4, p.radius * 0.6, 0, Math.PI * 2); cctx_.fill();
    // Hair
    cctx_.fillStyle = isP1 ? '#1a1a1a' : '#ffeb8c';
    cctx_.beginPath(); cctx_.arc(p.x, p.y - 8, p.radius * 0.65, Math.PI, Math.PI * 2); cctx_.fill();
    // Eyes
    cctx_.fillStyle = isP1 ? '#00aaff' : '#aa6600';
    cctx_.fillRect(p.x - 4, p.y - 4, 2, 2);
    cctx_.fillRect(p.x + 2, p.y - 4, 2, 2);

    // Sword / mace
    const angle = p.facing;
    const hx = p.x + Math.cos(angle) * 12, hy = p.y + Math.sin(angle) * 12;
    const tx = p.x + Math.cos(angle) * 34, ty = p.y + Math.sin(angle) * 34;
    const bladeColor = STYLE_COLORS[p.style] || '#c0c0e0';
    if (p.style === 'stone') {
      cctx_.strokeStyle = '#6a5a4a'; cctx_.lineWidth = 3; cctx_.lineCap = 'round';
      cctx_.beginPath();
      cctx_.moveTo(p.x + Math.cos(angle) * 6, p.y + Math.sin(angle) * 6);
      cctx_.lineTo(hx, hy);
      cctx_.stroke();
      const mx = p.x + Math.cos(angle) * 38, my = p.y + Math.sin(angle) * 38;
      cctx_.shadowBlur = 12; cctx_.shadowColor = bladeColor;
      cctx_.fillStyle = bladeColor;
      cctx_.beginPath(); cctx_.arc(mx, my, 9, 0, Math.PI * 2); cctx_.fill();
      cctx_.shadowBlur = 0;
      cctx_.fillStyle = '#6a4a2a';
      for (let sp = 0; sp < 6; sp++) {
        const sa = (sp / 6) * Math.PI * 2;
        cctx_.beginPath();
        cctx_.arc(mx + Math.cos(sa) * 9, my + Math.sin(sa) * 9, 3, 0, Math.PI * 2);
        cctx_.fill();
      }
      cctx_.fillStyle = '#e0d0b0';
      cctx_.beginPath(); cctx_.arc(mx - 2, my - 2, 2, 0, Math.PI * 2); cctx_.fill();
    } else {
      cctx_.shadowBlur = 8; cctx_.shadowColor = bladeColor;
      cctx_.strokeStyle = bladeColor; cctx_.lineWidth = 3; cctx_.lineCap = 'round';
      cctx_.beginPath(); cctx_.moveTo(hx, hy); cctx_.lineTo(tx, ty); cctx_.stroke();
      cctx_.shadowBlur = 0;
      cctx_.strokeStyle = '#ffffff'; cctx_.lineWidth = 1;
      cctx_.beginPath(); cctx_.moveTo(hx, hy); cctx_.lineTo(tx, ty); cctx_.stroke();
      cctx_.strokeStyle = '#2a1a0a'; cctx_.lineWidth = 4;
      cctx_.beginPath();
      cctx_.moveTo(p.x + Math.cos(angle) * 6, p.y + Math.sin(angle) * 6);
      cctx_.lineTo(hx, hy); cctx_.stroke();
      cctx_.fillStyle = '#ffd166';
      cctx_.beginPath(); cctx_.arc(hx, hy, 3, 0, Math.PI * 2); cctx_.fill();
    }

    cctx_.restore();

    if (!p.alive) {
      cctx.save();
      cctx.fillStyle = '#c41e3a'; cctx.font = 'bold 11px Georgia'; cctx.textAlign = 'center';
      cctx.fillText('P' + (p.id + 1) + ' DOWN', p.x, p.y - p.radius - 6);
      cctx.restore();
    }
  }

  function drawEnemy(e){
    cctx.save();
    if (e.hitFlash > 0 && Math.floor(e.hitFlash) % 2 === 0) cctx.globalAlpha = 0.6;
    cctx.fillStyle = 'rgba(0,0,0,0.5)';
    cctx.beginPath(); cctx.ellipse(e.x, e.y + e.radius + 3, e.radius * 0.9, 4, 0, 0, Math.PI * 2); cctx.fill();

    const pal = DEMON_PALETTE[e.type] || { color: '#4a1e2a', eye: '#ff0033' };
    const body = e.hitFlash > 0 ? '#fff' : pal.color;
    const eye  = pal.eye;
    const wobbleX = Math.sin(fx.now / 200 + e.x * 0.01) * 1;

    if (e.boss) {
      const pulse = 1 + 0.15 * Math.sin(Date.now() / 200);
      cctx.strokeStyle = `rgba(255, 0, 0, ${0.4 + 0.2 * Math.sin(Date.now() / 300)})`;
      cctx.lineWidth = 3;
      cctx.beginPath(); cctx.arc(e.x, e.y, e.radius * 1.5 * pulse, 0, Math.PI * 2); cctx.stroke();
    }

    // Type-specific decorations BEHIND body
    if (e.type === 'spider') {
      cctx.strokeStyle = '#3a1a4a'; cctx.lineWidth = 2;
      for (let legI = 0; legI < 8; legI++) {
        const la = (legI / 8) * Math.PI * 2 + Math.sin(Date.now() / 200 + legI) * 0.15;
        const lr = e.radius * 1.8;
        cctx.beginPath();
        cctx.moveTo(e.x + wobbleX, e.y);
        cctx.lineTo(e.x + wobbleX + Math.cos(la) * e.radius * 1.2, e.y + Math.sin(la) * e.radius * 0.6);
        cctx.lineTo(e.x + wobbleX + Math.cos(la) * lr, e.y + Math.sin(la) * lr * 0.9);
        cctx.stroke();
      }
    } else if (e.type === 'drum') {
      cctx.strokeStyle = '#8a5a2a'; cctx.lineWidth = 2;
      for (let r = 0.6; r < 1.1; r += 0.12) {
        cctx.beginPath(); cctx.arc(e.x + wobbleX, e.y, e.radius * r, 0, Math.PI * 2); cctx.stroke();
      }
      cctx.fillStyle = '#4a2a1a';
      cctx.beginPath(); cctx.arc(e.x + wobbleX - e.radius * 0.7, e.y, e.radius * 0.5, 0, Math.PI * 2); cctx.fill();
      cctx.beginPath(); cctx.arc(e.x + wobbleX + e.radius * 0.7, e.y, e.radius * 0.5, 0, Math.PI * 2); cctx.fill();
    } else if (e.type === 'shifter') {
      cctx.globalAlpha = 0.3 + 0.2 * Math.sin(Date.now() / 150);
      cctx.fillStyle = '#00ffaa';
      cctx.beginPath(); cctx.arc(e.x + wobbleX, e.y, e.radius * 1.4, 0, Math.PI * 2); cctx.fill();
      cctx.globalAlpha = 1;
    } else if (e.type === 'twin_daki') {
      cctx.strokeStyle = '#ff66aa'; cctx.lineWidth = 3;
      for (let ri = 0; ri < 3; ri++) {
        const ra = Date.now() / 200 + ri * Math.PI * 2 / 3;
        cctx.beginPath();
        cctx.moveTo(e.x + wobbleX, e.y);
        for (let t = 0; t < 1; t += 0.1) {
          cctx.lineTo(e.x + wobbleX + Math.cos(ra + t * 2) * t * e.radius * 2, e.y + Math.sin(ra + t * 3) * t * e.radius * 2);
        }
        cctx.stroke();
      }
    } else if (e.type === 'twin_gyu') {
      cctx.strokeStyle = '#aaff00'; cctx.lineWidth = 3;
      const sickleA = Date.now() / 300;
      for (let si = 0; si < 2; si++) {
        const sa = sickleA + si * Math.PI;
        cctx.beginPath();
        cctx.arc(e.x + wobbleX + Math.cos(sa) * e.radius * 1.4, e.y + Math.sin(sa) * e.radius * 1.4, e.radius * 0.5, sa - 0.5, sa + 1.5);
        cctx.stroke();
      }
    } else if (e.type === 'kokushibo') {
      cctx.globalAlpha = 0.5 + 0.2 * Math.sin(Date.now() / 250);
      cctx.strokeStyle = '#c080ff'; cctx.lineWidth = 2;
      for (let mi = 0; mi < 3; mi++) {
        cctx.beginPath();
        cctx.arc(e.x + wobbleX, e.y, e.radius * (1.4 + mi * 0.2), 0, Math.PI * 2);
        cctx.stroke();
      }
      cctx.globalAlpha = 1;
    }

    cctx.fillStyle = body;
    cctx.beginPath(); cctx.arc(e.x + wobbleX, e.y, e.radius, 0, Math.PI * 2); cctx.fill();
    cctx.fillStyle = 'rgba(0,0,0,0.3)';
    cctx.beginPath(); cctx.arc(e.x + wobbleX + 2, e.y + 2, e.radius * 0.7, 0, Math.PI * 2); cctx.fill();
    cctx.strokeStyle = eye; cctx.lineWidth = 1; cctx.globalAlpha = 0.4;
    for (let i = 0; i < 3; i++) {
      cctx.beginPath();
      const a = (i / 3) * Math.PI * 2 + fx.now * 0.001;
      cctx.moveTo(e.x + wobbleX, e.y);
      cctx.lineTo(e.x + wobbleX + Math.cos(a) * e.radius, e.y + Math.sin(a) * e.radius);
      cctx.stroke();
    }
    cctx.globalAlpha = 1;
    cctx.fillStyle = eye;
    cctx.shadowBlur = 10; cctx.shadowColor = eye;
    const sp = e.radius * 0.3;
    cctx.beginPath();
    cctx.arc(e.x + wobbleX - sp, e.y - e.radius * 0.2, 2, 0, Math.PI * 2);
    cctx.arc(e.x + wobbleX + sp, e.y - e.radius * 0.2, 2, 0, Math.PI * 2);
    cctx.fill();
    // Kokushibo's 4 extra eyes
    if (e.type === 'kokushibo') {
      cctx.beginPath();
      cctx.arc(e.x + wobbleX - sp * 2.2, e.y - e.radius * 0.05, 1.6, 0, Math.PI * 2);
      cctx.arc(e.x + wobbleX + sp * 2.2, e.y - e.radius * 0.05, 1.6, 0, Math.PI * 2);
      cctx.arc(e.x + wobbleX - sp * 1.3, e.y + e.radius * 0.15, 1.4, 0, Math.PI * 2);
      cctx.arc(e.x + wobbleX + sp * 1.3, e.y + e.radius * 0.15, 1.4, 0, Math.PI * 2);
      cctx.fill();
    }
    cctx.shadowBlur = 0;
    // Jagged mouth
    cctx.strokeStyle = eye; cctx.lineWidth = 1.5;
    cctx.beginPath();
    const my = e.y + e.radius * 0.3;
    cctx.moveTo(e.x + wobbleX - e.radius * 0.4, my);
    for (let i = 0; i <= 4; i++) {
      const mxx = e.x + wobbleX - e.radius * 0.4 + (e.radius * 0.8 / 4) * i;
      const myy = my + (i % 2 === 0 ? 0 : 4);
      cctx.lineTo(mxx, myy);
    }
    cctx.stroke();

    // Mini HP bar for bigger mobs
    if (e.maxHp > 50 && !e.boss) {
      const bw = e.radius * 2;
      cctx.fillStyle = 'rgba(0,0,0,0.7)';
      cctx.fillRect(e.x - bw/2, e.y - e.radius - 10, bw, 4);
      cctx.fillStyle = '#c41e3a';
      cctx.fillRect(e.x - bw/2, e.y - e.radius - 10, bw * (e.hp / e.maxHp), 4);
    }
    // Boss bar + rank at screen top
    if (e.boss) {
      const bw = 400;
      cctx.fillStyle = 'rgba(0,0,0,0.8)';
      cctx.fillRect(W/2 - bw/2, 20, bw, 16);
      cctx.fillStyle = '#c41e3a';
      cctx.fillRect(W/2 - bw/2, 20, bw * (e.hp / e.maxHp), 16);
      cctx.strokeStyle = '#ffd166'; cctx.lineWidth = 2;
      cctx.strokeRect(W/2 - bw/2, 20, bw, 16);
      if (e.rank) {
        cctx.fillStyle = '#ff6644'; cctx.font = 'italic 11px Georgia'; cctx.textAlign = 'center';
        cctx.fillText(e.rank, W/2, 14);
      }
      cctx.fillStyle = '#ffd166'; cctx.font = 'bold 14px Georgia'; cctx.textAlign = 'center';
      cctx.fillText((e.name || '').toUpperCase(), W/2, 32);
    }
    cctx.restore();
  }

  function drawSlash(s){
    cctx.save();
    const alpha = s.life / s.maxLife;
    cctx.globalCompositeOperation = 'lighter';
    const style = s.style || 'basic';
    const lightning = style === 'thunder' || s.kind === 'bolt' || s.kind === 'chain';
    const ringOnly = s.kind === 'ring' || s.kind === 'sound-bomb';
    const flame = style === 'flame';
    const sun = style === 'sun';
    const thick = s.kind === 'drill' ? 20 : (s.kind === 'multi' ? 12 : 10);

    if (ringOnly) {
      // Outer halo
      cctx.strokeStyle = s.color; cctx.lineWidth = thick * alpha + 3;
      cctx.shadowBlur = 35; cctx.shadowColor = s.color;
      cctx.globalAlpha = alpha * 0.6;
      cctx.beginPath(); cctx.arc(s.x, s.y, s.range, 0, Math.PI * 2); cctx.stroke();
      cctx.lineWidth = thick * alpha; cctx.shadowBlur = 25;
      cctx.globalAlpha = alpha;
      cctx.beginPath(); cctx.arc(s.x, s.y, s.range, 0, Math.PI * 2); cctx.stroke();
      cctx.strokeStyle = '#fff'; cctx.lineWidth = thick * 0.35 * alpha;
      cctx.shadowBlur = 15;
      cctx.stroke();
      if (alpha > 0.5) {
        cctx.strokeStyle = s.color; cctx.lineWidth = 2;
        cctx.globalAlpha = (alpha - 0.5) * 0.6;
        cctx.beginPath(); cctx.arc(s.x, s.y, s.range * (1.1 + (1 - alpha) * 0.5), 0, Math.PI * 2); cctx.stroke();
      }
    } else if (lightning) {
      const endX = s.x + Math.cos(s.angle) * s.range;
      const endY = s.y + Math.sin(s.angle) * s.range;
      cctx.strokeStyle = s.color; cctx.lineWidth = 14 * alpha;
      cctx.shadowBlur = 35; cctx.shadowColor = s.color;
      cctx.globalAlpha = alpha * 0.5;
      cctx.beginPath(); cctx.moveTo(s.x, s.y); cctx.lineTo(endX, endY); cctx.stroke();
      cctx.globalAlpha = alpha; cctx.lineWidth = 8 * alpha; cctx.shadowBlur = 25;
      cctx.beginPath(); cctx.moveTo(s.x, s.y);
      const segs = 10; const path = [];
      for (let i = 1; i <= segs; i++) {
        const t = i / segs;
        const baseX = s.x + (endX - s.x) * t;
        const baseY = s.y + (endY - s.y) * t;
        const perpX = -Math.sin(s.angle), perpY = Math.cos(s.angle);
        const offset = (Math.random() - 0.5) * 25 * (1 - Math.abs(t - 0.5) * 2);
        const px = baseX + perpX * offset, py = baseY + perpY * offset;
        path.push([px, py]); cctx.lineTo(px, py);
      }
      cctx.stroke();
      cctx.lineWidth = 3 * alpha; cctx.strokeStyle = '#fff'; cctx.shadowBlur = 10;
      cctx.beginPath(); cctx.moveTo(s.x, s.y);
      path.forEach(([x, y]) => cctx.lineTo(x, y));
      cctx.stroke();
    } else {
      cctx.strokeStyle = s.color; cctx.lineWidth = thick + 6;
      cctx.shadowBlur = 30; cctx.shadowColor = s.color;
      cctx.globalAlpha = alpha * 0.45;
      cctx.beginPath(); cctx.arc(s.x, s.y, s.range, s.angle - s.arc/2, s.angle + s.arc/2); cctx.stroke();
      cctx.lineWidth = thick; cctx.shadowBlur = 20; cctx.globalAlpha = alpha;
      cctx.beginPath(); cctx.arc(s.x, s.y, s.range, s.angle - s.arc/2, s.angle + s.arc/2); cctx.stroke();
      cctx.strokeStyle = '#fff'; cctx.lineWidth = thick / 2.5; cctx.shadowBlur = 10;
      cctx.beginPath(); cctx.arc(s.x, s.y, s.range, s.angle - s.arc/2, s.angle + s.arc/2); cctx.stroke();
      if (s.kind === 'multi') {
        for (let i = 1; i <= 4; i++) {
          cctx.globalAlpha = alpha * (0.4 - i * 0.08);
          cctx.strokeStyle = s.color; cctx.lineWidth = thick * (1 - i * 0.18);
          cctx.shadowBlur = 15;
          cctx.beginPath(); cctx.arc(s.x, s.y, s.range - i * 12, s.angle - s.arc/2, s.angle + s.arc/2); cctx.stroke();
        }
      }
      if (flame || sun) {
        cctx.globalAlpha = alpha * 0.7;
        cctx.strokeStyle = '#ffd166'; cctx.lineWidth = thick + 10;
        cctx.shadowBlur = 40; cctx.shadowColor = '#ffaa00';
        cctx.beginPath(); cctx.arc(s.x, s.y, s.range + 6, s.angle - s.arc/2, s.angle + s.arc/2); cctx.stroke();
        if (Math.random() < 0.5) {
          const sa = s.angle - s.arc/2 + Math.random() * s.arc;
          const sx = s.x + Math.cos(sa) * s.range;
          const sy = s.y + Math.sin(sa) * s.range;
          addParticle({ x: sx, y: sy, vx: Math.cos(sa) * Math.random() * 3, vy: Math.sin(sa) * Math.random() * 3 - 0.5, life: 20, maxLife: 20, size: 2 + Math.random() * 4, color: Math.random() < 0.5 ? '#ffee66' : s.color, type: 'flame' });
        }
      }
    }
    cctx.restore();
  }

  function drawParticles(){
    for (const p of fx.particles) {
      const alpha = p.life / p.maxLife;
      cctx.save();
      if (p.type === 'flame' || p.type === 'lightning' || p.type === 'breath') cctx.globalCompositeOperation = 'lighter';
      cctx.globalAlpha = p.type === 'mist' ? alpha * 0.4 : alpha;
      cctx.fillStyle = p.color;
      if (p.type === 'flame') { cctx.shadowBlur = 18; cctx.shadowColor = p.color; }
      else if (p.type === 'lightning') { cctx.shadowBlur = 22; cctx.shadowColor = p.color; }
      else if (p.type === 'breath') { cctx.shadowBlur = 12; cctx.shadowColor = p.color; }
      else if (p.type === 'water') { cctx.shadowBlur = 8; cctx.shadowColor = p.color; }
      else cctx.shadowBlur = 0;
      const sz = p.size * (p.type === 'ash' ? alpha : 1);
      cctx.beginPath(); cctx.arc(p.x, p.y, sz, 0, Math.PI * 2); cctx.fill();
      if ((p.type === 'flame' || p.type === 'lightning') && sz > 3) {
        cctx.fillStyle = '#fff'; cctx.globalAlpha = alpha * 0.7; cctx.shadowBlur = 0;
        cctx.beginPath(); cctx.arc(p.x, p.y, sz * 0.35, 0, Math.PI * 2); cctx.fill();
      }
      cctx.restore();
    }
  }

  function drawProjectile(pr){
    cctx.save();
    cctx.globalCompositeOperation = 'lighter';
    cctx.shadowBlur = 15; cctx.shadowColor = pr.color;
    cctx.fillStyle = pr.color;
    if (pr.friendly) {
      const a = Math.atan2(pr.vy, pr.vx);
      cctx.translate(pr.x, pr.y); cctx.rotate(a);
      cctx.beginPath(); cctx.arc(0, 0, 8, -Math.PI/2, Math.PI/2); cctx.fill();
    } else {
      cctx.beginPath(); cctx.arc(pr.x, pr.y, 6, 0, Math.PI * 2); cctx.fill();
      cctx.fillStyle = '#fff';
      cctx.beginPath(); cctx.arc(pr.x, pr.y, 2.5, 0, Math.PI * 2); cctx.fill();
    }
    cctx.restore();
  }

  function drawPickup(pk){
    cctx.save();
    const bobY = Math.sin(fx.now * 0.006 + pk.x * 0.01) * 3;
    const fade = pk.life < 120 ? pk.life / 120 : 1;
    cctx.globalAlpha = fade;
    cctx.shadowBlur = 15;
    if (pk.type === 'hp') {
      cctx.shadowColor = '#ff4466'; cctx.fillStyle = '#ff4466';
      cctx.beginPath();
      cctx.arc(pk.x - 4, pk.y - 2 + bobY, 5, 0, Math.PI * 2);
      cctx.arc(pk.x + 4, pk.y - 2 + bobY, 5, 0, Math.PI * 2);
      cctx.fill();
      cctx.beginPath();
      cctx.moveTo(pk.x - 8, pk.y + bobY); cctx.lineTo(pk.x + 8, pk.y + bobY); cctx.lineTo(pk.x, pk.y + 8 + bobY);
      cctx.fill();
    } else {
      cctx.shadowColor = '#ffd166'; cctx.fillStyle = '#ffd166';
      cctx.beginPath(); cctx.arc(pk.x, pk.y + bobY, 8, 0, Math.PI * 2); cctx.fill();
      cctx.fillStyle = '#fff5e1';
      cctx.beginPath(); cctx.arc(pk.x, pk.y + bobY, 4, 0, Math.PI * 2); cctx.fill();
    }
    cctx.restore();
  }

  function drawFloat(t){
    cctx.save();
    cctx.globalAlpha = t.life / t.maxLife;
    cctx.fillStyle = t.color;
    cctx.strokeStyle = '#000'; cctx.lineWidth = 3;
    cctx.font = `bold ${t.size}px Georgia`;
    cctx.textAlign = 'center';
    cctx.strokeText(t.text, t.x, t.y);
    cctx.fillText(t.text, t.x, t.y);
    cctx.restore();
  }

  // ========= HUD updates =========
  function updateHUD(snap){
    const p1 = snap.players[0], p2 = snap.players[1];
    const active2 = p2 && p2.active !== false;

    // P1 label + style
    dom.p1Name.style.display = active2 ? 'block' : 'none';
    if (active2) dom.p1Style.textContent = (p1.style || '').toUpperCase();

    // Main bars (always show P1's)
    dom.hp.style.width = (p1.hp / p1.maxHp * 100) + '%';
    dom.st.style.width = (p1.stamina / p1.maxStamina * 100) + '%';
    dom.br.style.width = (p1.breath / p1.maxBreath * 100) + '%';

    // P2 bars if present
    dom.p2Row.style.display = active2 ? 'block' : 'none';
    if (active2) {
      dom.p2Style.textContent = (p2.style || '').toUpperCase();
      dom.hp2.style.width = (Math.max(0, p2.hp) / p2.maxHp * 100) + '%';
      dom.st2.style.width = (p2.stamina / p2.maxStamina * 100) + '%';
      dom.br2.style.width = (p2.breath / p2.maxBreath * 100) + '%';
    }

    // Stats
    dom.wave.textContent = `WAVE ${snap.wave}`;
    dom.demons.textContent = `Demons: ${snap.enemies.length}`;
    dom.score.textContent = `Score: ${p1.score + (active2 ? p2.score : 0)}`;
    dom.kills.textContent = `Kills: ${p1.kills + (active2 ? p2.kills : 0)}`;

    // Combo display (use P1 for now)
    const combo = p1.combo || 0;
    if (combo >= 3) { dom.combo.textContent = 'COMBO x' + combo; dom.combo.style.opacity = '1'; }
    else dom.combo.style.opacity = '0';

    // Skill slots
    renderSlots(dom.skills, p1, ['1','2','3','4'], 'slot');
    if (active2) renderSlots(dom.p2Slots, p2, ['7','8','9','0'], 'slot');

    // Card screen
    if (snap.cardSelect) {
      dom.card.classList.add('on');
      const isMe = snap.cardSelect.picker === ctx.mySlot;
      dom.cardSub.textContent = isMe ? 'Choose one (1 / 2 / 3 or click)' : 'Waiting for P' + (snap.cardSelect.picker + 1) + '…';
      const rows = snap.cardSelect.choices.map((c, i) => `
        <div class="card ${c.rarity}" data-i="${i}">
          <span class="rar r-${c.rarity}">${(c.rarity || '').toUpperCase()}</span>
          <div class="ic">${c.icon || '✦'}</div>
          <div class="nm">${escapeHtml(c.name)}</div>
          <div class="ds">${escapeHtml(c.desc)}</div>
          <div style="color:#999;font-size:10px;margin-top:auto;">${isMe ? ('Press ' + (i + 1)) : ''}</div>
        </div>`).join('');
      if (dom.cardRow.dataset.sig !== rows) {
        dom.cardRow.innerHTML = rows;
        dom.cardRow.dataset.sig = rows;
      }
    } else {
      dom.card.classList.remove('on');
      dom.cardRow.dataset.sig = '';
    }

    // End screen
    if (snap.phase === 'won' || snap.phase === 'lost') {
      dom.end.classList.add('on');
      dom.end.classList.toggle('won', snap.phase === 'won');
      dom.end.classList.toggle('lost', snap.phase === 'lost');
      dom.endH.textContent = snap.phase === 'won' ? 'VICTORY' : 'DEFEATED';
      dom.endSub.textContent = snap.phase === 'won' ? 'The dawn rises. The demons are vanquished.' : 'The demons have claimed another slayer…';
      dom.endScore.textContent = `Wave ${snap.wave} · Kills ${p1.kills + (active2 ? p2.kills : 0)} · Score ${p1.score + (active2 ? p2.score : 0)}`;
    } else {
      dom.end.classList.remove('on');
    }
  }

  function renderSlots(container, p, keys, cls){
    const eq = p.equipped || [];
    let html = '';
    for (let i = 0; i < eq.length; i++) {
      const formId = eq[i];
      const cdFrames = p.formCooldowns[i] || 0;
      const ready = cdFrames <= 0;
      const k = keys[i] || '';
      const tag = formId ? shortFormName(formId) : '';
      const klass = cls + (ready ? ' ready' : ' cooldown');
      if (cdFrames > 0) {
        html += `<div class="${klass}"><span class="k">${k}</span>${Math.ceil(cdFrames / 60)}<div class="tag">${escapeHtml(tag)}</div></div>`;
      } else {
        html += `<div class="${klass}"><span class="k">${k}</span>${k}<div class="tag">${escapeHtml(tag)}</div></div>`;
      }
    }
    if (container.dataset.sig !== html) {
      container.innerHTML = html;
      container.dataset.sig = html;
    }
  }

  // Derive a short display name from the formId. Uses cached lookup from
  // the last server-emitted form-activate event when possible.
  const formNames = {};
  // Preload common names. If server emits form-activate with name, we'll overwrite.
  const PRESET_NAMES = {
    water_1: 'Water Surface Slash', water_2: 'Whirlpool', water_3: 'Flowing Dance', water_4: 'Constant Flux', water_5: 'Waterfall Basin',
    flame_1: 'Unknowing Fire', flame_2: 'Rising Scorching Sun', flame_3: 'Blooming Flame', flame_4: 'Rengoku', flame_5: 'Flame Tiger',
    thunder_1: 'Thunderclap', thunder_2: 'Heat Lightning', thunder_3: 'Rumble and Flash', thunder_4: 'Honoikazuchi', thunder_5: 'Rice Spirit',
    beast_1: 'Pierce', beast_2: 'Devour', beast_3: 'Crazy Cutting', beast_4: 'Spatial Awareness', beast_5: 'Hooked Tusks',
    mist_1: 'Low Clouds', mist_2: 'Shifting Flow', mist_3: 'Sea of Clouds', mist_4: 'Obscuring Clouds', mist_5: 'Mist Phantom',
    wind_1: 'Dust Whirlwind', wind_2: 'Rising Dust Storm', wind_3: 'Black Wind', wind_4: 'Idaten Typhoon', wind_5: 'Purifying Wind',
    stone_1: 'Bipolar', stone_2: 'Upper Smash', stone_3: 'Stone Skin', stone_4: 'Arcs of Justice', stone_5: 'Volcanic Rock',
    serpent_1: 'Winding Serpent', serpent_2: 'Venom Fangs', serpent_3: 'Coil Choke', serpent_4: 'Slithering Serpent', serpent_5: 'Twin-Headed',
    love_1: 'Shivers', love_2: 'Love Pangs', love_3: 'Catlove Shower', love_4: 'Cat-Legged Winds', love_5: 'Swaying Love',
    insect_1: 'Butterfly Caprice', insect_2: 'Bee Sting', insect_3: 'Dragonfly Hexagon', insect_4: 'Centipede Zigzag', insect_5: 'Mantis Cut',
    moon_1: 'Evening Palace', moon_2: 'Moon Spirit Eddy', moon_3: 'Moon-Dragon', moon_4: 'Moonbow',
    flower_1: 'Aurora Peach', flower_2: 'Honorable Maiden', flower_3: 'Crimson Hanagoromo', flower_4: 'Equinoctial',
    sound_1: 'Rumbling', sound_2: 'Resounding', sound_3: 'String Performance', sound_4: 'Deadly Ensemble',
    sun_1: 'Dance of Fire God', sun_2: 'Setting Sun', sun_3: 'Solar Haze', sun_4: 'Flame Dance'
  };
  function shortFormName(formId){ return formNames[formId] || PRESET_NAMES[formId] || formId; }

  function escapeHtml(s){
    return String(s || '').replace(/[&<>"']/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }

  // ========= Returned handlers =========
  return {
    onState(snap){ latestSnapshot = snap; processEvents(snap.events || []); },
    onRoomUpdate(_room){},
    destroy(){
      running = false;
      window.removeEventListener('resize', fitCanvas);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      if (hud.parentElement) hud.parentElement.removeChild(hud);
      if (styleEl.parentElement) styleEl.parentElement.removeChild(styleEl);
      if (parent.style.position !== prevPos) parent.style.position = prevPos;
    }
  };
}
