// Demon Slayer — authoritative co-op multiplayer sim.
//
// Full-content port of the 4556-line single-file HTML game.
// Mechanics are data-driven: every form, demon, card and wave is a row.
// Eight gameplay archetypes cover all 72 breathing forms between them:
//
//   arc    — directional 90° cone (most "slash" forms)
//   ring   — 360° AoE around the caster
//   bolt   — narrow forward cone (piercing strikes)
//   dash   — caster moves fast + line damage on everything touched
//   chain  — primary hit + up to N secondary jumps
//   multi  — spawns N sequential slashes over a short window
//   buff   — temporary player buff (no damage)
//   drill  — single huge forward strike (short-range, high dmg)
//
// Passive card effects (sunInfused, deathDefy, calmDash, poisonAttack,
// evadeChance, soundExplosion, moonBladeChance) are honoured in the
// relevant game paths.
//
// Matches the rooms.js interface: reset / tick(dt) / snapshot / setInput /
// setName / clearInput / players / winner / running.

import { randomUUID } from 'crypto';

const W = 1024, H = 640;

// ========= DATA: BREATHING STYLES =========

export const BREATHING_STYLES = {
  water:   { name: 'Water',   icon: '🌊', color: '#40a8ff', forms: ['water_1','water_2','water_3','water_4'] },
  flame:   { name: 'Flame',   icon: '🔥', color: '#ff8c42', forms: ['flame_1','flame_2','flame_3','flame_4'] },
  thunder: { name: 'Thunder', icon: '⚡', color: '#ffd166', forms: ['thunder_1','thunder_2','thunder_3','thunder_4'] },
  beast:   { name: 'Beast',   icon: '🐗', color: '#e0e0e0', forms: ['beast_1','beast_2','beast_3','beast_4'] },
  mist:    { name: 'Mist',    icon: '🌫️', color: '#c0d0e8', forms: ['mist_1','mist_2','mist_3','mist_4'] },
  wind:    { name: 'Wind',    icon: '🌪️', color: '#a8e0a8', forms: ['wind_1','wind_2','wind_3','wind_4'] },
  stone:   { name: 'Stone',   icon: '⛰️', color: '#c0a080', forms: ['stone_1','stone_2','stone_3','stone_4'] },
  serpent: { name: 'Serpent', icon: '🐍', color: '#6ac080', forms: ['serpent_1','serpent_2','serpent_3','serpent_4'] },
  love:    { name: 'Love',    icon: '💖', color: '#ff80b0', forms: ['love_1','love_2','love_3','love_4'] },
  insect:  { name: 'Insect',  icon: '🦋', color: '#c070ff', forms: ['insect_1','insect_2','insect_3','insect_4'] },
  moon:    { name: 'Moon',    icon: '🌙', color: '#8844cc', forms: ['moon_1','moon_2','moon_3','moon_4'] },
  flower:  { name: 'Flower',  icon: '🌸', color: '#ffb0d0', forms: ['flower_1','flower_2','flower_3','flower_4'] },
  sound:   { name: 'Sound',   icon: '🎵', color: '#ffcc44', forms: ['sound_1','sound_2','sound_3','sound_4'] },
  sun:     { name: 'Sun',     icon: '☀️', color: '#ffaa00', forms: ['sun_1','sun_2','sun_3','sun_4'] }
};

// Styles available in the pre-match picker (Moon + Sun are card-only unlocks).
export const PICKABLE_STYLES = ['water','flame','thunder','beast','mist','wind','stone','serpent','love','insect','flower','sound'];

// ========= DATA: BREATHING FORMS =========
// F(name, style, cost, cooldownFrames, damage, range, archetype, arcFrac)
// arcFrac is fraction of 2π for 'arc'/'bolt'/'dash' archetypes (0..1).

const F = (name, style, cost, cd, dmg, range, arch, extra) => ({
  name, style, cost, cooldownFrames: cd, damage: dmg, range,
  archetype: arch, color: BREATHING_STYLES[style].color,
  ...(extra || {})
});

export const BREATHING_FORMS = {
  // Water (1-4) + bonus (5)
  water_1: F('Water Surface Slash',   'water', 20, 120, 40,  100, 'arc',   { arc: 0.28 }),
  water_2: F('Whirlpool',             'water', 35, 180, 25,  120, 'ring'),
  water_3: F('Flowing Dance',         'water', 30, 200, 30,  110, 'multi', { hits: 3 }),
  water_4: F('Constant Flux',         'water', 65, 360, 80,  150, 'drill'),
  water_5: F('Waterfall Basin',       'water', 45, 250, 70,  140, 'arc',   { arc: 0.45 }),
  // Flame (1-4) + bonus
  flame_1: F('Unknowing Fire',        'flame', 25, 140, 45,  100, 'dash',  { arc: 0.15 }),
  flame_2: F('Rising Scorching Sun',  'flame', 50, 300, 60,  140, 'arc',   { arc: 0.4 }),
  flame_3: F('Blooming Flame',        'flame', 55, 280, 50,  160, 'ring'),
  flame_4: F('Rengoku',               'flame', 80, 480, 120, 180, 'ring'),
  flame_5: F('Flame Tiger',           'flame', 50, 260, 80,  160, 'dash',  { arc: 0.2 }),
  // Thunder (1-4) + bonus
  thunder_1: F('Thunderclap',         'thunder', 30, 150, 50,  140, 'bolt', { arc: 0.12 }),
  thunder_2: F('Heat Lightning',      'thunder', 45, 240, 55,  170, 'chain',{ jumps: 3 }),
  thunder_3: F('Rumble and Flash',    'thunder', 60, 300, 70,  180, 'ring'),
  thunder_4: F('Honoikazuchi',        'thunder', 90, 480, 140, 220, 'multi',{ hits: 3 }),
  thunder_5: F('Rice Spirit',         'thunder', 40, 200, 60,  150, 'bolt', { arc: 0.15 }),
  // Beast (1-4) + bonus
  beast_1: F('Pierce',                'beast', 25, 140, 40,  100, 'bolt',  { arc: 0.1 }),
  beast_2: F('Devour',                'beast', 40, 220, 20,  110, 'multi', { hits: 4 }),
  beast_3: F('Crazy Cutting',         'beast', 55, 300, 30,  130, 'ring'),
  beast_4: F('Spatial Awareness',     'beast', 70, 420, 90,  200, 'multi', { hits: 3 }),
  beast_5: F('Hooked Tusks',          'beast', 45, 220, 65,  130, 'arc',   { arc: 0.35 }),
  // Mist (1-4) + bonus
  mist_1: F('Low Clouds Distant Haze','mist', 35, 180, 45,  140, 'bolt',  { arc: 0.12 }),
  mist_2: F('Shifting Flow Slash',    'mist', 45, 240, 35,  160, 'arc',   { arc: 0.4 }),
  mist_3: F('Sea of Clouds',          'mist', 55, 320, 40,  180, 'ring'),
  mist_4: F('Obscuring Clouds',       'mist', 85, 480, 100, 220, 'dash',  { arc: 0.3 }),
  mist_5: F('Mist Phantom',           'mist', 70, 380, 95,  180, 'dash',  { arc: 0.3 }),
  // Wind (1-4) + bonus
  wind_1: F('Dust Whirlwind Cutter',  'wind', 25, 130, 45,  110, 'arc',   { arc: 0.3 }),
  wind_2: F('Rising Dust Storm',      'wind', 40, 220, 50,  140, 'ring'),
  wind_3: F('Black Wind Mountain Mist','wind', 55, 300, 65,  160, 'arc',  { arc: 0.5 }),
  wind_4: F('Idaten Typhoon',         'wind', 85, 480, 125, 200, 'ring'),
  wind_5: F('Claws of Purifying Wind','wind', 40, 210, 55,  130, 'multi', { hits: 3 }),
  // Stone (1-4) + bonus
  stone_1: F('Serpentinite Bipolar',  'stone', 30, 150, 55,  100, 'arc',   { arc: 0.25 }),
  stone_2: F('Upper Smash',           'stone', 40, 210, 60,  120, 'drill'),
  stone_3: F('Stone Skin',            'stone', 50, 300, 0,   0,   'buff',  { buff: 'stoneSkin', duration: 240 }),
  stone_4: F('Arcs of Justice',       'stone', 85, 500, 135, 180, 'ring'),
  stone_5: F('Volcanic Rock',         'stone', 60, 320, 90,  150, 'drill'),
  // Serpent (1-4) + bonus
  serpent_1: F('Winding Serpent',     'serpent', 25, 130, 42, 120, 'arc',   { arc: 0.35 }),
  serpent_2: F('Venom Fangs',         'serpent', 40, 200, 40, 130, 'bolt',  { arc: 0.12 }),
  serpent_3: F('Coil Choke',          'serpent', 55, 280, 60, 110, 'ring'),
  serpent_4: F('Slithering Serpent',  'serpent', 80, 460, 120,220, 'multi', { hits: 4 }),
  serpent_5: F('Twin-Headed Reptile', 'serpent', 50, 260, 70, 150, 'multi', { hits: 2 }),
  // Love (1-4) + bonus
  love_1: F('Shivers of First Love',  'love', 25, 140, 40,  140, 'arc',   { arc: 0.45 }),
  love_2: F('Love Pangs',             'love', 40, 220, 45,  160, 'multi', { hits: 3 }),
  love_3: F('Catlove Shower',         'love', 55, 300, 50,  180, 'multi', { hits: 4 }),
  love_4: F('Cat-Legged Winds',       'love', 85, 500, 130, 220, 'ring'),
  love_5: F('Swaying Love',           'love', 70, 360, 95,  200, 'ring'),
  // Insect (1-4) + bonus
  insect_1: F('Butterfly Caprice',    'insect', 22, 120, 35, 100, 'arc',   { arc: 0.3 }),
  insect_2: F('Bee Sting Flutter',    'insect', 35, 180, 30, 130, 'bolt',  { arc: 0.1 }),
  insect_3: F('Dragonfly Hexagon',    'insect', 50, 260, 40, 150, 'multi', { hits: 6 }),
  insect_4: F('Centipede Zigzag',     'insect', 80, 460, 110,200, 'chain', { jumps: 4 }),
  insect_5: F('Mantis Cut and Slice', 'insect', 45, 220, 55, 140, 'arc',   { arc: 0.35 }),
  // Moon (1-4) — card unlock
  moon_1: F('Dark Moon Evening Palace','moon', 30, 150, 175, 130, 'arc',   { arc: 0.4 }),
  moon_2: F('Moon Spirit Eddy',       'moon', 45, 230, 195, 160, 'ring'),
  moon_3: F('Moon-Dragon Ringtail',   'moon', 60, 320, 215, 200, 'bolt',  { arc: 0.2 }),
  moon_4: F('Moonbow Half Moon',      'moon', 90, 500, 380, 240, 'multi', { hits: 3 }),
  // Flower (1-4)
  flower_1: F('Aurora Peach',         'flower', 25, 130, 45, 120, 'arc',   { arc: 0.35 }),
  flower_2: F('Honorable Maiden',     'flower', 40, 210, 55, 150, 'arc',   { arc: 0.5 }),
  flower_3: F('Crimson Hanagoromo',   'flower', 55, 290, 70, 170, 'ring'),
  flower_4: F('Equinoctial Vermilion','flower', 85, 480, 130,200, 'ring'),
  // Sound (1-4)
  sound_1: F('Rumbling',              'sound', 30, 150, 55, 130, 'bolt',  { arc: 0.18 }),
  sound_2: F('Resounding Slashes',    'sound', 50, 260, 70, 170, 'multi', { hits: 5 }),
  sound_3: F('String Performance',    'sound', 65, 340, 85, 180, 'ring'),
  sound_4: F('Deadly Ensemble',       'sound', 90, 500, 135,220, 'ring'),
  // Sun (mythical, card unlock only)
  sun_1: F('Dance of the Fire God',   'sun', 40, 180, 225, 200, 'ring'),
  sun_2: F('Setting Sun',             'sun', 50, 240, 250, 180, 'arc',   { arc: 0.5 }),
  sun_3: F('Solar Heat Haze',         'sun', 45, 200, 218, 210, 'ring'),
  sun_4: F('Flame Dance of Unbroken Sun','sun', 100, 600, 500, 280, 'ring')
};

// ========= DATA: DEMON TYPES =========

export const DEMON_TYPES = {
  lesser:      { hp: 60,   speed: 1.2, damage: 10, radius: 14, color: '#4a1e2a', eye: '#ff0033', exp: 10,  name: 'Lesser Demon' },
  runner:      { hp: 40,   speed: 2.6, damage: 8,  radius: 12, color: '#2a1e4a', eye: '#ff00cc', exp: 15,  name: 'Blood Runner' },
  brute:       { hp: 180,  speed: 0.9, damage: 24, radius: 22, color: '#6a1e1e', eye: '#ff6600', exp: 30,  name: 'Demon Brute' },
  caster:      { hp: 90,   speed: 1.1, damage: 16, radius: 16, color: '#4a1e6a', eye: '#cc00ff', exp: 25,  name: 'Blood Sorcerer',  ranged: true },
  blademaster: { hp: 280,  speed: 1.9, damage: 30, radius: 18, color: '#1e1e4a', eye: '#00ffcc', exp: 50,  name: 'Blade Demon',     dasher: true },
  spider:      { hp: 130,  speed: 1.4, damage: 14, radius: 16, color: '#4a2a6a', eye: '#a0ff00', exp: 30,  name: 'Spider Demon',    webbed: true },
  drum:        { hp: 325,  speed: 0.9, damage: 22, radius: 22, color: '#6a3a1a', eye: '#ffaa00', exp: 60,  name: 'Drum Demon' },
  shifter:     { hp: 115,  speed: 1.6, damage: 17, radius: 15, color: '#2a4a4a', eye: '#00ffaa', exp: 40,  name: 'Shapeshifter' },
  // Bosses (Lower / Upper Moons)
  lower_moon:  { hp: 2200, speed: 1.6, damage: 28, radius: 24, color: '#2a0a4a', eye: '#aa00ff', exp: 150, name: 'Lower Moon 5 — Rui',      boss: true, rank: 'Lower Moon Five' },
  twin_daki:   { hp: 2600, speed: 1.9, damage: 32, radius: 22, color: '#c0336b', eye: '#ff66aa', exp: 180, name: 'Upper Moon 6 — Daki',     boss: true, rank: 'Upper Moon Six' },
  twin_gyu:    { hp: 2600, speed: 1.7, damage: 34, radius: 22, color: '#1a3a1a', eye: '#aaff00', exp: 180, name: 'Upper Moon 6 — Gyutaro', boss: true, rank: 'Upper Moon Six' },
  upper_moon:  { hp: 3400, speed: 2.1, damage: 36, radius: 26, color: '#4a1a0a', eye: '#ff6600', exp: 220, name: 'Upper Moon 3 — Akaza',    boss: true, rank: 'Upper Moon Three' },
  kokushibo:   { hp: 4800, speed: 2.0, damage: 42, radius: 28, color: '#0a0a2a', eye: '#aa00ff', exp: 400, name: 'Upper Moon 1 — Kokushibo',boss: true, rank: 'Upper Moon One' },
  doma:        { hp: 3900, speed: 1.9, damage: 36, radius: 26, color: '#b0e0ff', eye: '#e0f0ff', exp: 320, name: 'Upper Moon 2 — Doma',     boss: true, rank: 'Upper Moon Two' },
  hantengu:    { hp: 3200, speed: 1.9, damage: 34, radius: 24, color: '#c04030', eye: '#ff4020', exp: 280, name: 'Upper Moon 4 — Hantengu', boss: true, rank: 'Upper Moon Four' },
  gyokko:      { hp: 3000, speed: 1.5, damage: 32, radius: 24, color: '#30a0c0', eye: '#00ffee', exp: 260, name: 'Upper Moon 5 — Gyokko',   boss: true, rank: 'Upper Moon Five', ranged: true },
  enmu:        { hp: 1200, speed: 1.6, damage: 22, radius: 22, color: '#4a2a6a', eye: '#c000c0', exp: 100, name: 'Lower Moon 1 — Enmu',     boss: true, rank: 'Lower Moon One' },
  rokuro:      { hp: 1000, speed: 1.9, damage: 22, radius: 20, color: '#3a2a3a', eye: '#aa4466', exp: 90,  name: 'Lower Moon 2 — Rokuro',   boss: true, rank: 'Lower Moon Two' },
  wakuraba:    { hp: 950,  speed: 2.1, damage: 20, radius: 20, color: '#2a3a2a', eye: '#aacc44', exp: 85,  name: 'Lower Moon 3 — Wakuraba', boss: true, rank: 'Lower Moon Three' },
  mukago:      { hp: 900,  speed: 1.7, damage: 20, radius: 20, color: '#4a3a2a', eye: '#ff8844', exp: 85,  name: 'Lower Moon 4 — Mukago',   boss: true, rank: 'Lower Moon Four' },
  kaigaku:     { hp: 2900, speed: 2.3, damage: 36, radius: 22, color: '#404000', eye: '#ffee00', exp: 250, name: 'Upper Moon 6 — Kaigaku',  boss: true, rank: 'Upper Moon Six (Succ.)' },
  lord:        { hp: 12000,speed: 2.8, damage: 60, radius: 30, color: '#1a0a1a', eye: '#ff0000', exp: 500, name: 'Muzan Kibutsuji',        boss: true, rank: 'Demon King' }
};

// ========= DATA: WAVES =========

export const WAVE_CONFIGS = [
  { lesser: 6 },
  { lesser: 8, runner: 3 },
  { mukago: 1, lesser: 4 },
  { lesser: 6, runner: 4, caster: 3, spider: 2 },
  { wakuraba: 1, runner: 5 },
  { lesser: 6, brute: 3, shifter: 2, drum: 1 },
  { rokuro: 1, caster: 3 },
  { enmu: 1, blademaster: 2, shifter: 3 },
  { lower_moon: 1, lesser: 4 },
  { twin_daki: 1, twin_gyu: 1, lesser: 3 },
  { kaigaku: 1, blademaster: 3 },
  { gyokko: 1, caster: 4, shifter: 2 },
  { hantengu: 1, shifter: 4, drum: 2 },
  { upper_moon: 1, caster: 3, blademaster: 2 },
  { doma: 1, shifter: 3, spider: 3 },
  { kokushibo: 1, blademaster: 3, shifter: 2 },
  { lord: 1, blademaster: 3, caster: 3, drum: 2 }
];

// ========= DATA: CARDS =========
// Each card's `effect` is a declarative descriptor. Simple numeric tweaks
// are straight assignments; complex ones are flags the sim honours elsewhere.

const card = (id, name, rarity, icon, desc, effect) => ({ id, name, rarity, icon, desc, effect });

export const CARDS = [
  // Common
  card('blade_edge',  'Honed Edge',      'common',   '⚔️',  '+20% basic damage',          { basicDamageMult: 1.2 }),
  card('swift_feet',  'Swift Feet',      'common',   '👟',  '+15% move speed',            { speedMult: 1.15 }),
  card('iron_lung',   'Iron Lungs',      'common',   '🫁',  '+30 max breath',             { maxBreathDelta: 30 }),
  card('hardy',       'Hardy Body',      'common',   '❤️',  '+30 max HP + full heal',     { maxHpDelta: 30, heal: true }),
  card('stamina',     'Endless Wind',    'common',   '💨',  '+30 max stamina',            { maxStaminaDelta: 30 }),
  card('quick_strike','Quick Strike',    'common',   '⚡',  '+25% attack speed',          { attackSpeedMult: 1.25 }),
  // Rare
  card('long_reach',  'Long Reach',      'rare',     '📏',  '+30% slash range, +10% dmg', { basicRangeMult: 1.3, basicDamageMult: 1.1 }),
  card('deep_breath', 'Deep Breath',     'rare',     '🌬️', '2× breath regen',            { breathRegenMult: 2.0 }),
  card('dash_master', 'Dash Master',     'rare',     '💫',  '−50% dash cooldown',         { dashCooldownMult: 0.5 }),
  card('crit_eye',    'Piercing Eye',    'rare',     '👁️', '+25% crit chance',           { critChanceDelta: 0.25 }),
  card('vampire',     'Blood Drinker',   'rare',     '🩸',  '5% lifesteal on hit',        { lifestealDelta: 0.05 }),
  card('thorns',      'Demon Ward',      'rare',     '🛡️', 'Reflect 30 damage',          { thornsDelta: 30 }),
  // Epic — style swaps
  card('style_water',   'Water Breathing',   'epic', '🌊', 'Replace forms with Water',   { styleSwap: 'water' }),
  card('style_flame',   'Flame Breathing',   'epic', '🔥', 'Replace forms with Flame',   { styleSwap: 'flame' }),
  card('style_thunder', 'Thunder Breathing', 'epic', '⚡', 'Replace forms with Thunder', { styleSwap: 'thunder' }),
  card('style_beast',   'Beast Breathing',   'epic', '🐗', 'Replace forms with Beast',   { styleSwap: 'beast' }),
  card('style_mist',    'Mist Breathing',    'epic', '🌫️','Replace forms with Mist',    { styleSwap: 'mist' }),
  card('style_wind',    'Wind Breathing',    'epic', '🌪️','Replace forms with Wind',    { styleSwap: 'wind' }),
  card('style_stone',   'Stone Breathing',   'epic', '⛰️','Replace forms with Stone',   { styleSwap: 'stone' }),
  card('style_serpent', 'Serpent Breathing', 'epic', '🐍', 'Replace forms with Serpent', { styleSwap: 'serpent' }),
  card('style_love',    'Love Breathing',    'epic', '💖', 'Replace forms with Love',    { styleSwap: 'love' }),
  card('style_insect',  'Insect Breathing',  'epic', '🦋', 'Replace forms with Insect',  { styleSwap: 'insect' }),
  card('style_flower',  'Flower Breathing',  'epic', '🌸', 'Replace forms with Flower',  { styleSwap: 'flower' }),
  card('style_sound',   'Sound Breathing',   'epic', '🎵', 'Replace forms with Sound',   { styleSwap: 'sound' }),
  // Epic — global tuners
  card('form_discount','Focused Mind',    'epic',     '🧘',  '−30% form cost',             { breathCostMult: 0.7 }),
  card('cdr',         'Unbroken Focus',  'epic',     '♻️',  '−35% form cooldowns',        { formCooldownMult: 0.65 }),
  card('big_damage',  "Slayer's Resolve",'epic',     '💥',  '+30% ALL damage',            { damageMultGlobal: 1.3 }),
  // Legendary
  card('master_form',    "Master's Hidden Form",'legendary', '🗡️', "Unlock bonus 5th form (replaces slot 4)", { masterForm: true }),
  card('style_moon',     'Moon Breathing',      'legendary','🌙',  "Replace forms with Moon — Kokushibo's art", { styleSwap: 'moon' }),
  card('moon_blade',     'Moonlit Edge',        'legendary','🌙',  '25% chance to fire a moon blade on basic', { moonBladeChanceDelta: 0.25 }),
  card('godlike',        "Pillar's Might",      'legendary','⭐',  '+50% dmg, +50% crit dmg, +50 HP',         { damageMultGlobal: 1.5, critMultDelta: 0.5, maxHpDelta: 50, heal: true }),
  card('rengoku_heart',  "Rengoku: Set My Heart Ablaze", 'legendary','🔥', '+40% dmg, +40 max HP, death defy 1×', { damageMultGlobal: 1.4, maxHpDelta: 40, heal: true, deathDefy: true }),
  card('tanjiro_hinokami',"Tanjiro: Hinokami Kagura",  'legendary','☀️','Basics become sun-infused (+30% dmg)',    { basicDamageMult: 1.3, sunInfused: true }),
  card('giyu_calm',      "Giyu: Calm",          'legendary','💧',  'Dashes grant extra invulnerability',       { calmDash: true, dashCooldownMult: 0.8 }),
  card('shinobu_poison', "Shinobu: Wisteria Poison", 'legendary','🦋','Attacks poison demons (DoT)',            { poisonAttack: true }),
  card('mitsuri_love',   "Mitsuri: Love Breathing",  'legendary','💖','+60% attack speed, +30 HP, whip-reach',   { attackSpeedMult: 1.6, maxHpDelta: 30, heal: true, basicRangeMult: 1.5 }),
  card('tengen_flashy',  "Tengen: Sound Breathing",  'legendary','🎵','Every 3rd basic explodes',                { soundExplosion: true }),
  card('muichiro_mist',  "Muichiro: Mist Mastery",   'legendary','🌫️','25% chance to evade',                     { evadeChanceDelta: 0.25 }),
  // Mythical
  card('style_sun', '☀ SUN BREATHING ☀','mythical','☀️','MYTHICAL — the progenitor art', { styleSwap: 'sun', sunInfused: true, basicDamageMult: 1.3 })
];

// Map from current style → master-form ID (bonus 5th slot)
const MASTER_FORM_BY_STYLE = {
  water: 'water_5', flame: 'flame_5', thunder: 'thunder_5', beast: 'beast_5',
  mist: 'mist_5', wind: 'wind_5', stone: 'stone_5', serpent: 'serpent_5',
  love: 'love_5', insect: 'insect_5'
};

// ========= INPUT SHAPE =========

function emptyInput(){
  return {
    up: 0, down: 0, left: 0, right: 0,
    slash: 0, dash: 0, charge: 0,
    f1: 0, f2: 0, f3: 0, f4: 0,
    cardPick: 0
  };
}

function clampStyle(style){
  return BREATHING_STYLES[style] ? style : 'water';
}

// ========= GAME =========

export class Game {
  constructor(){ this.reset(); }

  reset(){
    const prevNames = this.players ? this.players.map(p => p.name) : [null, null];
    const prevStyles = this.players ? this.players.map(p => p.style) : [null, null];
    this.players = [
      this._makePlayer(0, prevStyles[0] || 'water'),
      this._makePlayer(1, prevStyles[1] || 'flame')
    ];
    for (let i = 0; i < 2; i++) if (prevNames[i]) this.players[i].name = prevNames[i];
    this.enemies = [];
    this.slashes = [];
    this.projectiles = [];  // enemy fire
    this.pickups = [];
    this.pendingHits = []; // queued multi-hit slashes spawning later
    this.phase = 'waiting';
    this.wave = 0;
    this.waveBannerTimer = 0;
    this.cardChoices = [];
    this.cardPicker = -1;
    this.pickedCards = [];
    this.time = 0;
    this.winner = -1;
    this.running = true;
    this.inputs = [emptyInput(), emptyInput()];
    this.prevInputs = [emptyInput(), emptyInput()];
    this.events = [];
    this._waveStartedAt = 0;
  }

  _makePlayer(id, style){
    const s = clampStyle(style);
    return {
      id, name: 'Player ' + (id + 1),
      active: true,
      style: s,
      color: id === 0 ? '#a8e0a8' : '#c8a8ff',
      x: W / 2 + (id === 0 ? -60 : 60), y: H / 2,
      vx: 0, vy: 0, radius: 16, facing: 0,
      hp: 100, maxHp: 100,
      stamina: 100, maxStamina: 100,
      breath: 0, maxBreath: 100,
      speed: 3.5,
      basicDamage: 37, basicRange: 70, basicCooldown: 0,
      attackSpeed: 1.0,
      dashing: false, dashTimer: 0, dashCooldown: 0, dashCooldownMult: 1.0,
      charging: false,
      invulnerable: 0, hitFlash: 0,
      score: 0, kills: 0, combo: 0, comboTimer: 0,
      alive: true, respawnAt: 0,
      equipped: [...BREATHING_STYLES[s].forms],
      formCooldowns: [0, 0, 0, 0],
      formCooldownMult: 1.0,
      // Combat tuners
      damageMult: 1.0,
      critChance: 0, critMult: 2.0,
      lifesteal: 0, thorns: 0,
      breathRegen: 1.0, breathCostMult: 1.0,
      // Passive flags (card-granted)
      sunInfused: false, deathDefy: false, deathDefyUsed: false,
      calmDash: false, poisonAttack: false, moonBladeChance: 0,
      evadeChance: 0, soundExplosion: false, basicCount: 0,
      // Buff timers
      buffStoneSkin: 0,
      webbed: 0,
      poisonedEnemies: {},
      damageDealt: 0,
      cardsCollected: []
    };
  }

  // ========= Platform API =========

  setInput(playerId, input){
    if (playerId < 0 || playerId > 1) return;
    this.prevInputs[playerId] = this.inputs[playerId];
    this.inputs[playerId] = {
      up:    !!input.up ? 1 : 0,
      down:  !!input.down ? 1 : 0,
      left:  !!input.left ? 1 : 0,
      right: !!input.right ? 1 : 0,
      slash: !!input.slash ? 1 : 0,
      dash:  !!input.dash ? 1 : 0,
      charge:!!input.charge ? 1 : 0,
      f1: !!input.f1 ? 1 : 0, f2: !!input.f2 ? 1 : 0,
      f3: !!input.f3 ? 1 : 0, f4: !!input.f4 ? 1 : 0,
      cardPick: (typeof input.cardPick === 'number') ? input.cardPick : 0
    };
  }

  clearInput(playerId){
    if (playerId < 0 || playerId > 1) return;
    this.inputs[playerId] = emptyInput();
    this.prevInputs[playerId] = emptyInput();
  }

  setName(playerId, name){
    if (playerId < 0 || playerId > 1) return;
    const clean = String(name || '').trim().slice(0, 16);
    this.players[playerId].name = clean || ('Player ' + (playerId + 1));
  }

  setStyle(playerId, style){
    if (playerId < 0 || playerId > 1) return;
    if (!BREATHING_STYLES[style]) return;
    const p = this.players[playerId];
    p.style = style;
    p.equipped = [...BREATHING_STYLES[style].forms];
    p.formCooldowns = [0, 0, 0, 0];
  }

  setActive(playerId, active){
    if (playerId < 0 || playerId > 1) return;
    const p = this.players[playerId];
    p.active = !!active;
    if (!p.active) {
      p.alive = false;
      p.respawnAt = 0;
      p.hp = 0;
    } else if (!p.alive) {
      p.alive = true;
      p.hp = p.maxHp;
    }
  }

  emit(ev){ this.events.push(ev); }

  // ========= Tick =========

  tick(dt){
    if (!this.running) return;
    this.time += dt;
    if (this.waveBannerTimer > 0) this.waveBannerTimer -= dt;

    if (this.phase === 'waiting') {
      if (this.players.some(p => p.active && p.alive)) this._startWave(1);
      return;
    }

    const steps = Math.max(1, Math.round(dt / 16.667));
    for (let i = 0; i < steps; i++) {
      if (this.phase === 'playing') this._stepPlaying();
      else if (this.phase === 'card-select') this._stepCardSelect();
    }
  }

  _stepPlaying(){
    // Players
    for (const p of this.players) {
      if (!p.active) continue;
      if (!p.alive) {
        if (p.respawnAt > 0 && this.time >= p.respawnAt) this._revive(p);
        continue;
      }
      this._updatePlayer(p);
      this._tryBasicAttack(p);
      this._tryForms(p);
      this._tickTimers(p);
    }

    // Pending multi-hits spawning
    for (let i = this.pendingHits.length - 1; i >= 0; i--) {
      const h = this.pendingHits[i];
      h.delay--;
      if (h.delay <= 0) {
        this._spawnSlashFromSpec(h.spec, h.owner);
        this.pendingHits.splice(i, 1);
      }
    }

    // Slashes: apply damage once, decay
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i];
      s.life--;
      if (!s.damageApplied) { this._applySlashDamage(s); s.damageApplied = true; }
      if (s.life <= 0) this.slashes.splice(i, 1);
    }

    // Enemy update
    this._updateEnemies();

    // Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.x += pr.vx; pr.y += pr.vy;
      pr.life--;
      if (pr.life <= 0 || pr.x < -20 || pr.x > W + 20 || pr.y < -20 || pr.y > H + 20) {
        this.projectiles.splice(i, 1); continue;
      }
      for (const p of this.players) {
        if (!p.alive) continue;
        if (Math.hypot(pr.x - p.x, pr.y - p.y) < p.radius + 6) {
          this._hurtPlayer(p, pr.damage);
          this.projectiles.splice(i, 1);
          break;
        }
      }
    }

    // Pickups
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i]; pk.life--;
      if (pk.life <= 0) { this.pickups.splice(i, 1); continue; }
      let best = null, bd = 9999;
      for (const p of this.players) {
        if (!p.alive) continue;
        const d = Math.hypot(pk.x - p.x, pk.y - p.y);
        if (d < bd) { bd = d; best = p; }
      }
      if (best && bd < 120) { pk.x += (best.x - pk.x) * 0.15; pk.y += (best.y - pk.y) * 0.15; }
      if (best && bd < best.radius + 12) {
        if (pk.type === 'hp')     { best.hp = Math.min(best.maxHp, best.hp + 15); this.emit({ kind: 'pickup', type: 'hp', x: pk.x, y: pk.y, pid: best.id }); }
        if (pk.type === 'breath') { best.breath = Math.min(best.maxBreath, best.breath + 25); this.emit({ kind: 'pickup', type: 'breath', x: pk.x, y: pk.y, pid: best.id }); }
        this.pickups.splice(i, 1);
      }
    }

    for (const p of this.players) {
      if (p.comboTimer > 0) { p.comboTimer--; if (p.comboTimer === 0) p.combo = 0; }
    }

    // Poison DoT on enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.poisonTimer > 0) {
        e.poisonTimer--;
        if (e.poisonTimer % 30 === 0) {
          e.hp -= 8;
          this.emit({ kind: 'hit', x: e.x, y: e.y, dmg: 8, isCrit: false, poison: true });
          if (e.hp <= 0) { this._killEnemyIndex(i, null); continue; }
        }
      }
    }

    // Game over: every active player down with no respawn pending
    const active = this.players.filter(p => p.active);
    const allDown = active.length > 0 && active.every(p => !p.alive && p.respawnAt === 0);
    if (this.phase === 'playing' && allDown) {
      this.phase = 'lost'; this.running = false;
      this.emit({ kind: 'game-over', won: false });
      return;
    }

    // Wave completion
    if (this.phase === 'playing' && this.enemies.length === 0 && this.time - this._waveStartedAt > 400) {
      if (this.wave >= WAVE_CONFIGS.length) {
        this.phase = 'won'; this.running = false; this.winner = -2;
        this.emit({ kind: 'game-over', won: true });
      } else {
        this._offerCard();
      }
    }
  }

  _updatePlayer(p){
    const inp = this.inputs[p.id];
    let dx = 0, dy = 0;
    if (inp.up) dy -= 1;
    if (inp.down) dy += 1;
    if (inp.left) dx -= 1;
    if (inp.right) dx += 1;
    const moving = dx !== 0 || dy !== 0;
    if (moving) { const len = Math.hypot(dx, dy); dx /= len; dy /= len; p.facing = Math.atan2(dy, dx); }

    if (p.dashing) {
      p.dashTimer--;
      p.invulnerable = Math.max(p.invulnerable, 2);
      p.vx = Math.cos(p.facing) * 12;
      p.vy = Math.sin(p.facing) * 12;
      if (p.dashTimer <= 0) p.dashing = false;
    } else {
      let spd = p.charging ? 0 : p.speed;
      if (p.webbed > 0) { spd *= 0.4; p.webbed--; }
      p.vx = dx * spd; p.vy = dy * spd;
    }

    const prev = this.prevInputs[p.id];
    if (inp.dash && !prev.dash && !p.dashing && p.dashCooldown <= 0 && p.stamina >= 25 && moving) {
      p.dashing = true; p.dashTimer = 10;
      p.dashCooldown = 45 * p.dashCooldownMult;
      p.stamina -= 25;
      if (p.calmDash) p.invulnerable = Math.max(p.invulnerable, 60);
      this.emit({ kind: 'dash', pid: p.id, x: p.x, y: p.y, color: p.color });
    }

    p.x += p.vx; p.y += p.vy;
    p.x = Math.max(p.radius, Math.min(W - p.radius, p.x));
    p.y = Math.max(p.radius, Math.min(H - p.radius, p.y));

    p.charging = !!inp.charge && !p.dashing && !moving;
    if (p.charging) p.breath = Math.min(p.maxBreath, p.breath + 0.8 * p.breathRegen);
    if (!p.dashing) p.stamina = Math.min(p.maxStamina, p.stamina + 0.4);
    if (p.hp < p.maxHp && p.hitFlash === 0) p.hp = Math.min(p.maxHp, p.hp + 0.066);
  }

  _tickTimers(p){
    if (p.dashCooldown > 0) p.dashCooldown--;
    if (p.invulnerable > 0) p.invulnerable--;
    if (p.hitFlash > 0) p.hitFlash--;
    if (p.basicCooldown > 0) p.basicCooldown--;
    if (p.buffStoneSkin > 0) p.buffStoneSkin--;
    for (let i = 0; i < p.formCooldowns.length; i++) {
      if (p.formCooldowns[i] > 0) p.formCooldowns[i]--;
    }
  }

  // ========= Attacks =========

  _tryBasicAttack(p){
    const inp = this.inputs[p.id];
    if (!inp.slash) return;
    if (p.basicCooldown > 0) return;
    const dmg = p.basicDamage * p.damageMult * (p.sunInfused ? 1.15 : 1);
    const s = {
      x: p.x, y: p.y, angle: p.facing,
      range: p.basicRange, arc: Math.PI * 0.75,
      damage: dmg, ownerId: p.id,
      ownerColor: p.sunInfused ? '#ffd166' : p.color,
      kind: 'basic',
      style: p.sunInfused ? 'sun' : 'basic',
      life: 10, maxLife: 10,
      damageApplied: false,
      poison: !!p.poisonAttack
    };
    this.slashes.push(s);
    this.emit({ kind: 'slash', x: p.x, y: p.y, angle: p.facing, range: p.basicRange, arc: Math.PI * 0.75, pid: p.id, color: s.ownerColor, style: s.style });
    p.basicCooldown = Math.round(22 / p.attackSpeed);
    p.basicCount = (p.basicCount || 0) + 1;

    // Tengen's sound-explosion on every 3rd basic
    if (p.soundExplosion && p.basicCount % 3 === 0) {
      const ex = { x: p.x + Math.cos(p.facing) * p.basicRange * 0.8, y: p.y + Math.sin(p.facing) * p.basicRange * 0.8 };
      const es = {
        x: ex.x, y: ex.y, angle: 0, range: 90, arc: Math.PI * 2,
        damage: dmg * 1.2, ownerId: p.id, ownerColor: '#ffcc44',
        kind: 'sound-bomb', life: 14, maxLife: 14, damageApplied: false
      };
      this.slashes.push(es);
      this.emit({ kind: 'sound-bomb', x: ex.x, y: ex.y, color: '#ffcc44' });
    }

    // Moonblade proc on basic
    if (p.moonBladeChance > 0 && Math.random() < p.moonBladeChance) {
      this.projectiles.push({
        x: p.x, y: p.y,
        vx: Math.cos(p.facing) * 10, vy: Math.sin(p.facing) * 10,
        life: 60, damage: dmg * 1.5, ownerId: p.id, color: '#aa66ff',
        friendly: true
      });
      this.emit({ kind: 'moon-blade', x: p.x, y: p.y, angle: p.facing });
    }
  }

  _tryForms(p){
    const inp = this.inputs[p.id];
    const prev = this.prevInputs[p.id];
    const pressed = [inp.f1, inp.f2, inp.f3, inp.f4];
    const prior   = [prev.f1, prev.f2, prev.f3, prev.f4];
    for (let i = 0; i < 4; i++) {
      if (pressed[i] && !prior[i] && p.equipped[i]) this._useForm(p, i);
    }
  }

  _useForm(p, idx){
    const formId = p.equipped[idx];
    const form = BREATHING_FORMS[formId];
    if (!form) return;
    if (p.formCooldowns[idx] > 0) return;
    const cost = form.cost * (p.breathCostMult || 1);
    if (p.breath < cost) return;
    p.breath -= cost;
    p.formCooldowns[idx] = Math.round(form.cooldownFrames * p.formCooldownMult);

    const dmg = form.damage * p.damageMult;
    const spec = { form, dmg, x: p.x, y: p.y, angle: p.facing };

    if (form.archetype === 'buff') {
      if (form.buff === 'stoneSkin') {
        p.buffStoneSkin = form.duration;
        p.invulnerable = Math.max(p.invulnerable, 30);
      }
    } else if (form.archetype === 'dash') {
      // Fast forward travel plus a wide line damage slash.
      p.dashing = true; p.dashTimer = 14;
      p.invulnerable = Math.max(p.invulnerable, 14);
      this._spawnSlashFromSpec(spec, p.id);
    } else if (form.archetype === 'multi') {
      const n = Math.max(1, form.hits || 2);
      for (let i = 0; i < n; i++) {
        const wob = (Math.random() - 0.5) * 0.6;
        const delayed = {
          spec: { ...spec, angle: spec.angle + wob },
          delay: i * 6, owner: p.id
        };
        if (i === 0) this._spawnSlashFromSpec(delayed.spec, p.id);
        else this.pendingHits.push(delayed);
      }
    } else {
      this._spawnSlashFromSpec(spec, p.id);
    }

    this.emit({
      kind: 'form-activate', pid: p.id, formId,
      archetype: form.archetype, style: form.style,
      x: p.x, y: p.y, angle: p.facing, range: form.range, color: form.color,
      name: form.name
    });
  }

  _spawnSlashFromSpec(spec, ownerId){
    const { form, dmg, x, y, angle } = spec;
    const arch = form.archetype;
    let arc = Math.PI * 2;
    if (arch === 'arc')  arc = Math.PI * 2 * (form.arc || 0.3);
    if (arch === 'bolt') arc = Math.PI * 2 * (form.arc || 0.1);
    if (arch === 'dash') arc = Math.PI * 2 * (form.arc || 0.2);
    if (arch === 'drill')arc = Math.PI * 2 * 0.15;

    const s = {
      x, y, angle, range: form.range, arc,
      damage: dmg, ownerId, ownerColor: form.color,
      kind: arch,
      style: form.style,
      life: arch === 'drill' ? 22 : (arch === 'multi' ? 14 : 18), maxLife: 18,
      damageApplied: false,
      chain: arch === 'chain',
      chainJumps: form.jumps || 0
    };
    this.slashes.push(s);
  }

  _applySlashDamage(s){
    const p = this.players[s.ownerId];

    if (s.chain) {
      // Chain: hit the nearest enemy in arc, then hop to up to chainJumps more
      // enemies within 120 range each.
      let alive = this.enemies.slice();
      let cx = s.x, cy = s.y;
      let first = true;
      let remaining = s.chainJumps + 1;
      while (remaining-- > 0 && alive.length) {
        let best = -1, bd = 9e9;
        for (let i = 0; i < alive.length; i++) {
          const e = alive[i];
          const dx = e.x - cx, dy = e.y - cy;
          const d = Math.hypot(dx, dy);
          if (first) {
            if (d > s.range + e.radius) continue;
            if (s.arc < Math.PI * 1.99) {
              const at = Math.atan2(dy, dx);
              const diff = Math.abs(normalizeAngle(at - s.angle));
              if (diff > s.arc / 2) continue;
            }
          } else {
            if (d > 120 + e.radius) continue;
          }
          if (d < bd) { bd = d; best = i; }
        }
        if (best < 0) break;
        const e = alive[best];
        const idx = this.enemies.indexOf(e);
        this._hurtEnemy(idx, s.damage, p, { isCrit: false });
        this.emit({ kind: 'chain-link', x1: cx, y1: cy, x2: e.x, y2: e.y, color: s.ownerColor });
        cx = e.x; cy = e.y;
        alive.splice(best, 1);
        first = false;
      }
      return;
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead) continue;
      const dx = e.x - s.x, dy = e.y - s.y;
      const d = Math.hypot(dx, dy);
      if (d > s.range + e.radius) continue;
      if (s.arc < Math.PI * 1.99) {
        const at = Math.atan2(dy, dx);
        const diff = Math.abs(normalizeAngle(at - s.angle));
        if (diff > s.arc / 2) continue;
      }
      const isCrit = p && Math.random() < (p.critChance || 0);
      const dmg = s.damage * (isCrit ? (p ? p.critMult : 2) : 1);
      this._hurtEnemy(i, dmg, p, { isCrit });
      if (s.poison && p && p.poisonAttack) e.poisonTimer = 180;
    }
  }

  _hurtEnemy(idx, dmg, ownerPlayer, info){
    const e = this.enemies[idx];
    if (!e || e.dead) return;
    e.hp -= dmg;
    e.hitFlash = 10;
    if (ownerPlayer) ownerPlayer.damageDealt += dmg;
    this.emit({ kind: 'hit', x: e.x, y: e.y, dmg: Math.round(dmg), isCrit: !!(info && info.isCrit) });
    if (ownerPlayer && ownerPlayer.lifesteal > 0) {
      ownerPlayer.hp = Math.min(ownerPlayer.maxHp, ownerPlayer.hp + dmg * ownerPlayer.lifesteal);
    }
    if (e.hp <= 0) this._killEnemyIndex(idx, ownerPlayer);
  }

  _killEnemyIndex(idx, ownerPlayer){
    const e = this.enemies[idx];
    if (!e || e.dead) return;
    e.dead = true;
    if (ownerPlayer) {
      ownerPlayer.kills++;
      ownerPlayer.score += e.def.exp;
      ownerPlayer.combo++;
      ownerPlayer.comboTimer = 180;
    }
    this.emit({ kind: 'demon-die', x: e.x, y: e.y, type: e.type, color: e.def.color, boss: !!e.def.boss });
    const r = Math.random();
    if (e.def.boss) {
      this.pickups.push({ id: randomUUID(), type: 'hp', x: e.x, y: e.y, life: 900 });
      this.pickups.push({ id: randomUUID(), type: 'breath', x: e.x + 20, y: e.y, life: 900 });
    } else if (r < 0.15) {
      this.pickups.push({ id: randomUUID(), type: 'hp', x: e.x, y: e.y, life: 600 });
    } else if (r < 0.27) {
      this.pickups.push({ id: randomUUID(), type: 'breath', x: e.x, y: e.y, life: 600 });
    }
    this.enemies.splice(idx, 1);
  }

  // ========= Enemies =========

  _updateEnemies(){
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead) continue;
      if (e.hitFlash > 0) e.hitFlash--;
      if (e.attackCooldown > 0) e.attackCooldown--;
      if (e.abilityCooldown > 0) e.abilityCooldown--;
      if (e.stunned > 0) { e.stunned--; continue; }

      // Target
      let target = null, td = 9e9;
      for (const p of this.players) {
        if (!p.alive) continue;
        const d = Math.hypot(p.x - e.x, p.y - e.y);
        if (d < td) { td = d; target = p; }
      }
      if (!target) continue;
      const dx = target.x - e.x, dy = target.y - e.y;
      const d = Math.hypot(dx, dy) || 1;

      // Ranged behaviour
      if (e.def.ranged && d < 380 && d > 80 && e.abilityCooldown <= 0) {
        const ang = Math.atan2(dy, dx);
        this.projectiles.push({
          x: e.x, y: e.y, vx: Math.cos(ang) * 5, vy: Math.sin(ang) * 5,
          life: 120, damage: Math.round(e.def.damage * 0.7),
          ownerId: -1, color: e.def.eye, friendly: false
        });
        e.abilityCooldown = 90;
        this.emit({ kind: 'demon-shoot', x: e.x, y: e.y, color: e.def.eye });
      }

      // Dasher behaviour
      if (e.def.dasher && d < 220 && d > 60 && e.abilityCooldown <= 0) {
        const sp = e.def.speed * 3.5;
        e.vx = (dx / d) * sp;
        e.vy = (dy / d) * sp;
        e.abilityCooldown = 80;
        e.dashing = 10;
        this.emit({ kind: 'demon-dash', x: e.x, y: e.y });
      } else if (e.dashing > 0) {
        e.dashing--;
      } else {
        e.vx = (dx / d) * e.def.speed;
        e.vy = (dy / d) * e.def.speed;
      }

      // Web on spider close-hit
      if (e.def.webbed && d < e.radius + target.radius + 8 && e.abilityCooldown <= 0) {
        target.webbed = 120;
        e.abilityCooldown = 180;
        this.emit({ kind: 'web', x: target.x, y: target.y });
      }

      e.x += e.vx; e.y += e.vy;
      e.x = Math.max(e.radius, Math.min(W - e.radius, e.x));
      e.y = Math.max(e.radius, Math.min(H - e.radius, e.y));

      const touchD = e.radius + target.radius;
      if (d < touchD + 2 && e.attackCooldown <= 0 && target.invulnerable <= 0 && !target.dashing) {
        e.attackCooldown = 40;
        this._hurtPlayer(target, e.def.damage);
      }
    }
  }

  _hurtPlayer(p, dmg){
    // Evade roll
    if (p.evadeChance > 0 && Math.random() < p.evadeChance) {
      this.emit({ kind: 'evade', pid: p.id, x: p.x, y: p.y });
      return;
    }
    // Stone skin — 60% damage reduction
    if (p.buffStoneSkin > 0) dmg *= 0.4;
    p.hp -= dmg;
    p.hitFlash = 20;
    p.invulnerable = 20;
    this.emit({ kind: 'player-hurt', pid: p.id, x: p.x, y: p.y, dmg: Math.round(dmg) });
    // Thorns reflect to nearest enemy
    if (p.thorns > 0) {
      let best = -1, bd = 9e9;
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < bd) { bd = d; best = i; }
      }
      if (best >= 0) this._hurtEnemy(best, p.thorns, p, { isCrit: false });
    }
    if (p.hp <= 0) this._playerDown(p);
  }

  _playerDown(p){
    if (!p.alive) return;
    // Death-defy: survive once per run
    if (p.deathDefy && !p.deathDefyUsed) {
      p.deathDefyUsed = true;
      p.hp = Math.floor(p.maxHp * 0.3);
      p.invulnerable = 120;
      this.emit({ kind: 'death-defy', pid: p.id, x: p.x, y: p.y });
      return;
    }
    p.alive = false; p.hp = 0;
    p.respawnAt = this.time + 6000;
    this.emit({ kind: 'player-down', pid: p.id, x: p.x, y: p.y });
  }

  _revive(p){
    p.alive = true; p.hp = p.maxHp * 0.5;
    p.respawnAt = 0;
    p.invulnerable = 120;
    p.x = W / 2 + (p.id === 0 ? -60 : 60); p.y = H / 2;
    this.emit({ kind: 'player-revive', pid: p.id, x: p.x, y: p.y });
  }

  // ========= Waves & Cards =========

  _startWave(num){
    this.wave = num;
    this.phase = 'playing';
    this._waveStartedAt = this.time;
    this.waveBannerTimer = 2000;
    // Top up active players a bit on new wave
    for (const p of this.players) {
      if (!p.active) continue;
      if (!p.alive && p.respawnAt === 0) this._revive(p);
      p.breath = Math.min(p.maxBreath, p.breath + 30);
    }
    const cfg = WAVE_CONFIGS[num - 1] || {};
    const hasBoss = Object.keys(cfg).some(t => DEMON_TYPES[t] && DEMON_TYPES[t].boss);
    for (const [type, count] of Object.entries(cfg)) {
      for (let i = 0; i < count; i++) this._spawnEnemy(type);
    }
    this.emit({ kind: 'wave-start', wave: num, isBoss: hasBoss });
  }

  _spawnEnemy(type){
    const def = DEMON_TYPES[type];
    if (!def) return;
    const edge = Math.floor(Math.random() * 4);
    let x, y;
    if (edge === 0) { x = Math.random() * W; y = -30; }
    else if (edge === 1) { x = W + 30; y = Math.random() * H; }
    else if (edge === 2) { x = Math.random() * W; y = H + 30; }
    else { x = -30; y = Math.random() * H; }
    // Balance: co-op isn't solo — keep hp close to spec but scale slightly.
    const scale = def.boss ? 0.6 : 1;
    const hp = Math.max(1, Math.floor(def.hp * scale));
    this.enemies.push({
      id: randomUUID(), type, def,
      x, y, vx: 0, vy: 0,
      radius: def.radius, hp, maxHp: hp,
      attackCooldown: 30, abilityCooldown: 60 + Math.random() * 120,
      hitFlash: 0, dashing: 0, stunned: 0,
      poisonTimer: 0, dead: false
    });
    this.emit({ kind: 'demon-spawn', type, x, y, boss: !!def.boss, rank: def.rank || null, name: def.name });
  }

  _offerCard(){
    // Weighted pool by rarity (common is most likely)
    const weights = { common: 5, rare: 3, epic: 2, legendary: 1, mythical: 0.25 };
    const pool = [];
    for (const c of CARDS) {
      const w = weights[c.rarity] || 1;
      for (let i = 0; i < w * 4; i++) pool.push(c);
    }
    const picks = [];
    while (picks.length < 3 && pool.length) {
      const idx = Math.floor(Math.random() * pool.length);
      const card = pool[idx];
      // Avoid dupes in the same offer
      if (!picks.find(p => p.id === card.id)) picks.push(card);
      pool.splice(idx, 1);
    }
    this.cardChoices = picks.map(c => ({ id: c.id, name: c.name, desc: c.desc, rarity: c.rarity, icon: c.icon }));
    const activeIds = this.players.filter(p => p.active).map(p => p.id);
    const prev = this.cardPicker;
    // Alternate among active players; fall back to any active picker.
    if (activeIds.length === 1) {
      this.cardPicker = activeIds[0];
    } else {
      this.cardPicker = prev === activeIds[0] ? activeIds[1] : activeIds[0];
    }
    if (!this.players[this.cardPicker].alive) {
      const alt = activeIds.find(id => id !== this.cardPicker && this.players[id].alive);
      if (alt !== undefined) this.cardPicker = alt;
    }
    this.phase = 'card-select';
    this.emit({ kind: 'card-offer', picker: this.cardPicker, choices: this.cardChoices });
  }

  _stepCardSelect(){
    const picker = this.players[this.cardPicker];
    if (!picker) return;
    for (const p of this.players) {
      if (!p.alive) continue;
      p.hp = Math.min(p.maxHp, p.hp + 0.02);
      p.breath = Math.min(p.maxBreath, p.breath + 0.04);
    }
    const inp = this.inputs[this.cardPicker];
    const sel = inp.cardPick;
    if (sel >= 1 && sel <= 3 && this.cardChoices[sel - 1]) {
      const chosen = this.cardChoices[sel - 1];
      const card = CARDS.find(c => c.id === chosen.id);
      if (card) this._applyCard(picker, card);
      this.cardChoices = [];
      this._startWave(this.wave + 1);
    }
  }

  _applyCard(p, card){
    const eff = card.effect || {};
    if (typeof eff.basicDamageMult === 'number') p.basicDamage *= eff.basicDamageMult;
    if (typeof eff.speedMult === 'number') p.speed *= eff.speedMult;
    if (typeof eff.maxBreathDelta === 'number') p.maxBreath += eff.maxBreathDelta;
    if (typeof eff.maxHpDelta === 'number') p.maxHp += eff.maxHpDelta;
    if (eff.heal) p.hp = p.maxHp;
    if (typeof eff.maxStaminaDelta === 'number') p.maxStamina += eff.maxStaminaDelta;
    if (typeof eff.attackSpeedMult === 'number') p.attackSpeed *= eff.attackSpeedMult;
    if (typeof eff.basicRangeMult === 'number') p.basicRange *= eff.basicRangeMult;
    if (typeof eff.breathRegenMult === 'number') p.breathRegen *= eff.breathRegenMult;
    if (typeof eff.dashCooldownMult === 'number') p.dashCooldownMult *= eff.dashCooldownMult;
    if (typeof eff.critChanceDelta === 'number') p.critChance += eff.critChanceDelta;
    if (typeof eff.critMultDelta === 'number') p.critMult += eff.critMultDelta;
    if (typeof eff.lifestealDelta === 'number') p.lifesteal += eff.lifestealDelta;
    if (typeof eff.thornsDelta === 'number') p.thorns += eff.thornsDelta;
    if (typeof eff.breathCostMult === 'number') p.breathCostMult *= eff.breathCostMult;
    if (typeof eff.formCooldownMult === 'number') p.formCooldownMult *= eff.formCooldownMult;
    if (typeof eff.damageMultGlobal === 'number') p.damageMult *= eff.damageMultGlobal;
    if (typeof eff.moonBladeChanceDelta === 'number') p.moonBladeChance += eff.moonBladeChanceDelta;
    if (typeof eff.evadeChanceDelta === 'number') p.evadeChance += eff.evadeChanceDelta;
    if (eff.sunInfused) p.sunInfused = true;
    if (eff.deathDefy) p.deathDefy = true;
    if (eff.calmDash) p.calmDash = true;
    if (eff.poisonAttack) p.poisonAttack = true;
    if (eff.soundExplosion) p.soundExplosion = true;

    if (eff.styleSwap && BREATHING_STYLES[eff.styleSwap]) {
      p.style = eff.styleSwap;
      p.equipped = [...BREATHING_STYLES[eff.styleSwap].forms];
      p.formCooldowns = [0, 0, 0, 0];
    }
    if (eff.masterForm) {
      const bonus = MASTER_FORM_BY_STYLE[p.style];
      if (bonus && BREATHING_FORMS[bonus]) {
        if (p.equipped.length >= 4) p.equipped[3] = bonus;
        else p.equipped.push(bonus);
      }
    }

    p.cardsCollected.push(card.id);
    this.pickedCards.push({ slot: p.id, cardId: card.id });
    this.emit({ kind: 'card-pick', pid: p.id, cardId: card.id, name: card.name, rarity: card.rarity });
  }

  // ========= Snapshot =========

  snapshot(){
    const snap = {
      t: 'state',
      time: this.time, phase: this.phase, wave: this.wave,
      running: this.running, winner: this.winner,
      players: this.players.map(p => ({
        id: p.id, name: p.name, active: p.active, style: p.style, color: p.color,
        x: p.x, y: p.y, facing: p.facing, radius: p.radius,
        hp: p.hp, maxHp: p.maxHp,
        stamina: p.stamina, maxStamina: p.maxStamina,
        breath: p.breath, maxBreath: p.maxBreath,
        dashing: p.dashing, charging: p.charging,
        invulnerable: p.invulnerable, dashCooldown: p.dashCooldown,
        formCooldowns: p.formCooldowns.slice(),
        equipped: p.equipped.slice(),
        alive: p.alive,
        respawnProgress: p.respawnAt > 0 ? Math.max(0, Math.min(1, 1 - (p.respawnAt - this.time) / 6000)) : 0,
        score: p.score, kills: p.kills, combo: p.combo,
        hitFlash: p.hitFlash,
        buffStoneSkin: p.buffStoneSkin, webbed: p.webbed,
        sunInfused: p.sunInfused
      })),
      enemies: this.enemies.map(e => ({
        id: e.id, type: e.type,
        x: e.x, y: e.y, radius: e.radius,
        hp: e.hp, maxHp: e.maxHp, hitFlash: e.hitFlash,
        boss: !!e.def.boss,
        rank: e.def.rank || null,
        name: e.def.name || ''
      })),
      slashes: this.slashes.map(s => ({
        x: s.x, y: s.y, angle: s.angle, range: s.range, arc: s.arc,
        kind: s.kind, style: s.style || 'basic',
        color: s.ownerColor, life: s.life, maxLife: s.maxLife
      })),
      projectiles: this.projectiles.map(pr => ({
        x: pr.x, y: pr.y, vx: pr.vx, vy: pr.vy,
        color: pr.color, friendly: pr.friendly
      })),
      pickups: this.pickups.map(pk => ({
        x: pk.x, y: pk.y, type: pk.type, life: pk.life
      })),
      cardSelect: (this.phase === 'card-select') ? {
        picker: this.cardPicker, choices: this.cardChoices.slice()
      } : null,
      events: this.events
    };
    this.events = [];
    return snap;
  }
}

function normalizeAngle(a){
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
