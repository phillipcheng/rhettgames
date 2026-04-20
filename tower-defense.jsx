import React, { useState, useEffect, useCallback, useRef } from 'react';

const GRID_SIZE = 20;
const CELL_SIZE = 32;
const GRID_WIDTH = 24;
const GRID_HEIGHT = 16;

// Tower targeting modes
const TARGETING_MODES = {
  first: { name: 'First', icon: '1️⃣', description: 'Target enemy closest to castle' },
  last: { name: 'Last', icon: '🔚', description: 'Target enemy furthest from castle' },
  strongest: { name: 'Strong', icon: '💪', description: 'Target enemy with most health' },
  weakest: { name: 'Weak', icon: '🎯', description: 'Target enemy with least health' },
  fastest: { name: 'Fast', icon: '⚡', description: 'Target fastest moving enemy' }
};

// Tower specializations at max level (level 5)
const TOWER_SPECIALIZATIONS = {
  basic: {
    rapidFire: { name: 'Rapid Fire', icon: '🔥', description: 'Triple attack speed, -30% damage', effect: { fireRateMult: 0.33, damageMult: 0.7 } },
    sniper: { name: 'Marksman', icon: '🎯', description: '+100% damage, +50% range, -50% speed', effect: { damageMult: 2, rangeMult: 1.5, fireRateMult: 1.5 } }
  },
  cannon: {
    cluster: { name: 'Cluster Bomb', icon: '💣', description: 'Creates 3 smaller explosions', effect: { cluster: true } },
    artillery: { name: 'Artillery', icon: '🎯', description: '+100% range, +50% splash', effect: { rangeMult: 2, splashMult: 1.5 } }
  },
  freeze: {
    absolute: { name: 'Absolute Zero', icon: '❄️', description: 'Enemies freeze completely for 1s', effect: { freezeTime: 1000 } },
    blizzard: { name: 'Blizzard', icon: '🌨️', description: 'AOE slow in large radius', effect: { aoeRadius: 4 } }
  },
  tesla: {
    overcharge: { name: 'Overcharge', icon: '⚡', description: 'Chains to 6 targets', effect: { chainMult: 2 } },
    emp: { name: 'EMP Pulse', icon: '📡', description: 'Disables enemy abilities', effect: { disableAbilities: true } }
  },
  barracks: {
    elite: { name: 'Elite Guard', icon: '👑', description: 'Spawns 1 powerful knight', effect: { elitePawn: true } },
    swarm: { name: 'Militia', icon: '⚔️', description: 'Spawns 3 weak soldiers', effect: { swarmPawns: true } }
  },
  laser: {
    pierce: { name: 'Pierce Beam', icon: '➡️', description: 'Beam pierces through enemies', effect: { pierce: true } },
    focus: { name: 'Focus Lens', icon: '🔆', description: 'Damage ramps up over time', effect: { rampDamage: true } }
  }
};

// Daily challenge modifiers
const CHALLENGE_MODIFIERS = {
  fastEnemies: { name: 'Speed Demon', icon: '💨', description: 'Enemies move 50% faster', effect: 'speedMult' },
  noUpgrades: { name: 'Bare Bones', icon: '🦴', description: 'Cannot upgrade towers', effect: 'noUpgrade' },
  limitedTowers: { name: 'Minimalist', icon: '📦', description: 'Max 10 towers', effect: 'towerLimit' },
  doubleRewards: { name: 'Jackpot', icon: '🎰', description: 'Double gold from kills', effect: 'doubleGold' },
  glassCanon: { name: 'Glass Canon', icon: '💔', description: 'Towers deal 2x but you have 5 lives', effect: 'glassCannon' },
  invisible: { name: 'Fog of War', icon: '🌫️', description: 'Only see enemies near towers', effect: 'fogOfWar' }
};

// Tower synergy bonuses when placed adjacent
const TOWER_SYNERGIES = {
  'basic-sniper': { bonus: 'range', value: 0.5, description: 'Spotter: +0.5 range' },
  'cannon-flame': { bonus: 'damage', value: 1.25, description: 'Inferno: +25% damage' },
  'freeze-tesla': { bonus: 'chain', value: 1, description: 'Cryo-Shock: +1 chain target' },
  'laser-vortex': { bonus: 'damage', value: 1.3, description: 'Energy Flux: +30% damage' },
  'bank-bank': { bonus: 'income', value: 1.2, description: 'Investment: +20% income' },
  'barracks-barracks': { bonus: 'pawnHealth', value: 1.25, description: 'Brotherhood: +25% pawn HP' },
  'mortar-cannon': { bonus: 'splash', value: 0.5, description: 'Artillery: +0.5 splash radius' },
  'poison-flame': { bonus: 'dot', value: 1.5, description: 'Toxic Fire: +50% DOT damage' }
};

// Elite enemy modifiers (random buffs for enemies)
const ELITE_MODIFIERS = {
  vampiric: { name: 'Vampiric', icon: '🧛', effect: 'Heals 10% of damage dealt to castle', color: '#be123c' },
  shielded: { name: 'Shielded', icon: '🛡️', effect: 'Takes 50% less damage', color: '#3b82f6' },
  hasty: { name: 'Hasty', icon: '💨', effect: 'Moves 50% faster', color: '#f59e0b' },
  regenerating: { name: 'Regenerating', icon: '💚', effect: 'Heals 5% HP per second', color: '#22c55e' },
  explosive: { name: 'Explosive', icon: '💥', effect: 'Explodes on death dealing damage', color: '#ef4444' },
  reflective: { name: 'Reflective', icon: '🪞', effect: 'Reflects 20% of damage taken', color: '#a855f7' }
};

// Boss special abilities
const BOSS_ABILITIES = {
  summon: { name: 'Summon', description: 'Spawns 3 minions', cooldown: 8000 },
  roar: { name: 'Roar', description: 'Speeds up nearby enemies', cooldown: 10000 },
  shield: { name: 'Shield', description: 'Becomes invulnerable for 2 seconds', cooldown: 15000 },
  stomp: { name: 'Stomp', description: 'Stuns nearby pawns', cooldown: 12000 }
};

// Hero system - choose a hero at game start for special bonuses
const HEROES = {
  knight: {
    name: 'Knight Commander',
    icon: '🛡️',
    description: 'Barracks spawn stronger pawns',
    bonus: { pawnDamage: 1.5, pawnHealth: 1.5 },
    ability: 'Rally: All pawns heal to full',
    color: '#eab308'
  },
  wizard: {
    name: 'Archmage',
    icon: '🧙',
    description: 'Magic towers deal +25% damage',
    bonus: { magicDamage: 1.25 }, // tesla, laser, vortex, frost
    ability: 'Meteor: Massive damage in an area',
    color: '#8b5cf6'
  },
  engineer: {
    name: 'Master Engineer',
    icon: '🔧',
    description: 'Towers cost 15% less',
    bonus: { towerDiscount: 0.85 },
    ability: 'Overclock: One tower attacks 3x faster',
    color: '#f97316'
  },
  merchant: {
    name: 'Gold Merchant',
    icon: '💰',
    description: 'Earn 20% more gold from kills',
    bonus: { goldBonus: 1.2 },
    ability: 'Tax: Gain 10 gold per enemy on screen',
    color: '#22c55e'
  },
  assassin: {
    name: 'Shadow Assassin',
    icon: '🗡️',
    description: 'Critical hits deal 3x damage (10% chance)',
    bonus: { critChance: 0.1, critDamage: 3 },
    ability: 'Execute: Instantly kill enemies below 20% HP',
    color: '#dc2626'
  }
};

// Weather effects that change gameplay
const WEATHER_TYPES = {
  clear: { name: 'Clear', icon: '☀️', effect: null },
  rain: { name: 'Rain', icon: '🌧️', effect: 'Enemies move 15% slower, fire towers deal 25% less' },
  fog: { name: 'Fog', icon: '🌫️', effect: 'Tower range reduced by 1 tile' },
  wind: { name: 'Wind', icon: '💨', effect: 'Projectiles move 50% faster' },
  storm: { name: 'Storm', icon: '⛈️', effect: 'Random lightning strikes enemies, towers attack 10% slower' }
};

// Achievements system
const ACHIEVEMENTS = {
  firstBlood: { name: 'First Blood', description: 'Kill your first enemy', icon: '🩸', condition: (stats) => stats.totalKills >= 1 },
  tenKills: { name: 'Warrior', description: 'Kill 10 enemies', icon: '⚔️', condition: (stats) => stats.totalKills >= 10 },
  hundredKills: { name: 'Slayer', description: 'Kill 100 enemies', icon: '💀', condition: (stats) => stats.totalKills >= 100 },
  combo5: { name: 'Combo Master', description: 'Get a 5x combo', icon: '🔥', condition: (stats) => stats.maxCombo >= 5 },
  combo10: { name: 'Combo Legend', description: 'Get a 10x combo', icon: '⚡', condition: (stats) => stats.maxCombo >= 10 },
  wave10: { name: 'Survivor', description: 'Reach wave 10', icon: '🌊', condition: (stats) => stats.highestWave >= 10 },
  wave20: { name: 'Defender', description: 'Reach wave 20', icon: '🏰', condition: (stats) => stats.highestWave >= 20 },
  rich: { name: 'Rich', description: 'Have 1000 gold at once', icon: '💰', condition: (stats) => stats.maxGold >= 1000 },
  perfectWave: { name: 'Perfect Wave', description: 'Complete a wave without losing lives', icon: '✨', condition: (stats) => stats.perfectWaves >= 1 },
  allTowers: { name: 'Collector', description: 'Build all tower types', icon: '🗼', condition: (stats) => stats.towerTypesBuilt >= 11 },
  heroic: { name: 'Heroic', description: 'Use hero ability 5 times', icon: '⭐', condition: (stats) => stats.heroAbilityUses >= 5 },
  weathered: { name: 'Weathered', description: 'Survive 3 different weather conditions', icon: '🌈', condition: (stats) => stats.weathersSurvived >= 3 },
};

// Special abilities that can be activated
const ABILITIES = {
  nuke: { name: 'Nuke', description: 'Deal 500 damage to all enemies', icon: '☢️', cooldown: 60000, cost: 200 },
  freeze: { name: 'Freeze All', description: 'Freeze all enemies for 5 seconds', icon: '❄️', cooldown: 45000, cost: 100 },
  goldRush: { name: 'Gold Rush', description: 'Double gold for 10 seconds', icon: '💎', cooldown: 90000, cost: 150 },
  rage: { name: 'Rage', description: 'All towers attack 2x faster for 10 seconds', icon: '😡', cooldown: 60000, cost: 175 },
  heal: { name: 'Heal', description: 'Restore 5 lives', icon: '💚', cooldown: 120000, cost: 300 },
  airstrike: { name: 'Airstrike', description: 'Bombs fall along the path dealing damage', icon: '✈️', cooldown: 75000, cost: 250 },
};

// Power-ups that drop from killed enemies (random chance)
const POWERUPS = {
  coin: { name: 'Gold Bag', icon: '💰', description: '+50 gold', color: '#fbbf24', effect: 'gold' },
  heart: { name: 'Life Crystal', icon: '❤️', description: '+1 life', color: '#ef4444', effect: 'life' },
  bomb: { name: 'Bomb', icon: '💣', description: 'Damage all enemies', color: '#dc2626', effect: 'bomb' },
  speed: { name: 'Speed Boost', icon: '⚡', description: 'Towers 2x faster for 5s', color: '#3b82f6', effect: 'speed' },
  shield: { name: 'Shield', icon: '🛡️', description: 'Block next 3 enemies', color: '#60a5fa', effect: 'shield' },
  magnet: { name: 'Gold Magnet', icon: '🧲', description: '3x gold for 10s', color: '#a855f7', effect: 'magnet' }
};

// Shop items (bought between waves)
const SHOP_ITEMS = {
  health_pack: { name: 'Health Pack', icon: '🩹', cost: 200, description: '+3 Lives', effect: 'lives', amount: 3 },
  gold_boost: { name: 'Gold Boost', icon: '💸', cost: 150, description: '+250 Gold', effect: 'gold', amount: 250 },
  tower_shield: { name: 'Tower Shield', icon: '🛡️', cost: 300, description: 'All towers immune for this wave', effect: 'immunity' },
  damage_boost: { name: 'War Cry', icon: '⚔️', cost: 250, description: 'All towers +25% damage for 3 waves', effect: 'damage' },
  time_slow: { name: 'Time Slow', icon: '⏱️', cost: 400, description: 'Enemies 50% slower for 15s next wave', effect: 'slow' },
  mystery_box: { name: 'Mystery Box', icon: '🎁', cost: 300, description: 'Random reward!', effect: 'mystery' }
};

const DIFFICULTIES = {
  beginner: {
    name: 'Beginner',
    description: 'For new players',
    emoji: '😊',
    startGold: 400,
    lives: 30,
    enemyHealthMult: 0.5,
    enemySpeedMult: 0.7,
    waveGold: 150,
    maxWaves: 10
  },
  easy: {
    name: 'Easy',
    description: 'A relaxed experience',
    emoji: '🙂',
    startGold: 300,
    lives: 25,
    enemyHealthMult: 0.75,
    enemySpeedMult: 0.85,
    waveGold: 125,
    maxWaves: 15
  },
  medium: {
    name: 'Medium',
    description: 'Balanced challenge',
    emoji: '😐',
    startGold: 200,
    lives: 20,
    enemyHealthMult: 1,
    enemySpeedMult: 1,
    waveGold: 100,
    maxWaves: 20
  },
  hard: {
    name: 'Hard',
    description: 'For experienced players',
    emoji: '😤',
    startGold: 150,
    lives: 15,
    enemyHealthMult: 1.5,
    enemySpeedMult: 1.2,
    waveGold: 75,
    maxWaves: 25
  },
  nightmare: {
    name: 'Nightmare',
    description: 'Ultimate challenge',
    emoji: '💀',
    startGold: 100,
    lives: 10,
    enemyHealthMult: 2,
    enemySpeedMult: 1.5,
    waveGold: 50,
    maxWaves: 30
  },
  endless: {
    name: 'Endless',
    description: 'How long can you survive?',
    emoji: '♾️',
    startGold: 200,
    lives: 20,
    enemyHealthMult: 1,
    enemySpeedMult: 1,
    waveGold: 100,
    maxWaves: Infinity
  }
};

const MAPS = {
  classic: {
    name: 'Classic',
    path: [
      [0, 7], [1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [5, 6], [5, 5], [5, 4], [5, 3],
      [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [10, 4], [10, 5], [10, 6], [10, 7],
      [10, 8], [10, 9], [10, 10], [11, 10], [12, 10], [13, 10], [14, 10], [15, 10],
      [15, 9], [15, 8], [15, 7], [15, 6], [15, 5], [16, 5], [17, 5], [18, 5], [19, 5],
      [20, 5], [20, 6], [20, 7], [20, 8], [20, 9], [20, 10], [20, 11], [21, 11],
      [22, 11], [23, 11]
    ],
    description: 'A winding path with many turns',
    difficulty: 'Easy'
  },
  spiral: {
    name: 'Spiral',
    path: [
      [0, 8], [0, 9], [0, 10], [0, 11], [0, 12], [0, 13], [0, 14], [0, 15],
      [1, 15], [2, 15], [3, 15], [4, 15], [5, 15], [6, 15], [7, 15], [8, 15], [9, 15], [10, 15],
      [11, 15], [12, 15], [13, 15], [14, 15], [15, 15], [16, 15], [17, 15], [18, 15], [19, 15],
      [20, 15], [21, 15], [22, 15],
      [22, 14], [22, 13], [22, 12], [22, 11], [22, 10], [22, 9], [22, 8], [22, 7], [22, 6],
      [22, 5], [22, 4], [22, 3], [22, 2], [22, 1], [22, 0],
      [21, 0], [20, 0], [19, 0], [18, 0], [17, 0], [16, 0], [15, 0], [14, 0], [13, 0], [12, 0],
      [11, 0], [10, 0], [9, 0], [8, 0], [7, 0], [6, 0], [5, 0], [4, 0], [3, 0], [2, 0],
      [2, 1], [2, 2], [2, 3], [2, 4], [2, 5], [2, 6], [2, 7], [2, 8], [2, 9], [2, 10],
      [2, 11], [2, 12], [2, 13],
      [3, 13], [4, 13], [5, 13], [6, 13], [7, 13], [8, 13], [9, 13], [10, 13], [11, 13],
      [12, 13], [13, 13], [14, 13], [15, 13], [16, 13], [17, 13], [18, 13], [19, 13], [20, 13],
      [20, 12], [20, 11], [20, 10], [20, 9], [20, 8], [20, 7], [20, 6], [20, 5], [20, 4],
      [20, 3], [20, 2],
      [19, 2], [18, 2], [17, 2], [16, 2], [15, 2], [14, 2], [13, 2], [12, 2], [11, 2],
      [10, 2], [9, 2], [8, 2], [7, 2], [6, 2], [5, 2], [4, 2],
      [4, 3], [4, 4], [4, 5], [4, 6], [4, 7], [4, 8], [4, 9], [4, 10], [4, 11],
      [5, 11], [6, 11], [7, 11], [8, 11], [9, 11], [10, 11], [11, 11], [12, 11], [13, 11],
      [14, 11], [15, 11], [16, 11], [17, 11], [18, 11],
      [18, 10], [18, 9], [18, 8], [18, 7], [18, 6], [18, 5], [18, 4],
      [17, 4], [16, 4], [15, 4], [14, 4], [13, 4], [12, 4], [11, 4], [10, 4], [9, 4],
      [8, 4], [7, 4], [6, 4],
      [6, 5], [6, 6], [6, 7], [6, 8], [6, 9],
      [7, 9], [8, 9], [9, 9], [10, 9], [11, 9], [12, 9], [13, 9], [14, 9], [15, 9], [16, 9],
      [16, 8], [16, 7], [16, 6], [17, 6], [18, 6], [19, 6], [20, 6], [21, 6], [22, 6], [23, 6]
    ],
    description: 'A long spiral path',
    difficulty: 'Easy'
  },
  zigzag: {
    name: 'Zigzag',
    path: [
      [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2],
      [10, 2], [11, 2], [12, 2], [13, 2], [14, 2], [15, 2], [16, 2], [17, 2], [18, 2],
      [19, 2], [20, 2], [21, 2], [21, 3], [21, 4], [21, 5], [20, 5], [19, 5], [18, 5],
      [17, 5], [16, 5], [15, 5], [14, 5], [13, 5], [12, 5], [11, 5], [10, 5], [9, 5],
      [8, 5], [7, 5], [6, 5], [5, 5], [4, 5], [3, 5], [2, 5], [2, 6], [2, 7], [2, 8],
      [3, 8], [4, 8], [5, 8], [6, 8], [7, 8], [8, 8], [9, 8], [10, 8], [11, 8], [12, 8],
      [13, 8], [14, 8], [15, 8], [16, 8], [17, 8], [18, 8], [19, 8], [20, 8], [21, 8],
      [21, 9], [21, 10], [21, 11], [20, 11], [19, 11], [18, 11], [17, 11], [16, 11],
      [15, 11], [14, 11], [13, 11], [12, 11], [11, 11], [10, 11], [9, 11], [8, 11],
      [7, 11], [6, 11], [5, 11], [4, 11], [3, 11], [2, 11], [2, 12], [2, 13], [3, 13],
      [4, 13], [5, 13], [6, 13], [7, 13], [8, 13], [9, 13], [10, 13], [11, 13], [12, 13],
      [13, 13], [14, 13], [15, 13], [16, 13], [17, 13], [18, 13], [19, 13], [20, 13],
      [21, 13], [22, 13], [23, 13]
    ],
    description: 'Long zigzag paths - maximum distance!',
    difficulty: 'Easy'
  },
  straight: {
    name: 'Gauntlet',
    path: [
      [0, 7], [1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7],
      [10, 7], [11, 7], [12, 7], [13, 7], [14, 7], [15, 7], [16, 7], [17, 7], [18, 7],
      [19, 7], [20, 7], [21, 7], [22, 7], [23, 7]
    ],
    description: 'A straight path - quick and deadly!',
    difficulty: 'Hard'
  },
  diamond: {
    name: 'Diamond',
    path: [
      // Enter from left, go to center
      [0, 7], [1, 7], [2, 7], [3, 7], [4, 7], [5, 7],
      // Go up-right diagonal
      [6, 6], [7, 5], [8, 4], [9, 3], [10, 2], [11, 1],
      // Go right across top
      [12, 1], [13, 1],
      // Go down-right diagonal
      [14, 2], [15, 3], [16, 4], [17, 5], [18, 6], [19, 7],
      // Go down-left diagonal
      [18, 8], [17, 9], [16, 10], [15, 11], [14, 12], [13, 13],
      // Go left across bottom
      [12, 13], [11, 13],
      // Go up-left diagonal back to center
      [10, 12], [9, 11], [8, 10], [7, 9], [6, 8],
      // Exit to right
      [7, 8], [8, 8], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], [15, 8],
      [16, 8], [17, 8], [18, 8], [19, 8], [20, 8], [21, 8], [22, 8], [23, 8]
    ],
    description: 'Diamond loop with exit',
    difficulty: 'Medium'
  },
  crossroads: {
    name: 'Crossroads',
    path: [
      // Start top-left, go down
      [0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7],
      // Go right
      [1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7],
      // Go up to top
      [7, 6], [7, 5], [7, 4], [7, 3], [7, 2], [7, 1], [7, 0],
      // Go right across top
      [8, 0], [9, 0], [10, 0], [11, 0], [12, 0], [13, 0], [14, 0], [15, 0], [16, 0],
      // Go down
      [16, 1], [16, 2], [16, 3], [16, 4], [16, 5], [16, 6], [16, 7],
      // Go right
      [17, 7], [18, 7], [19, 7], [20, 7], [21, 7], [22, 7],
      // Go down to bottom
      [22, 8], [22, 9], [22, 10], [22, 11], [22, 12], [22, 13], [22, 14], [22, 15],
      // Go left
      [21, 15], [20, 15], [19, 15], [18, 15], [17, 15], [16, 15],
      // Go up a bit then right to exit
      [16, 14], [16, 13], [16, 12], [17, 12], [18, 12], [19, 12], [20, 12], [21, 12],
      [22, 12], [23, 12]
    ],
    description: 'Complex crossing paths',
    difficulty: 'Medium'
  },
  snake: {
    name: 'Serpent',
    path: [
      // Start left, snake through entire map
      [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1],
      [10, 1], [11, 1], [12, 1], [13, 1], [14, 1], [15, 1], [16, 1], [17, 1], [18, 1],
      [19, 1], [20, 1], [21, 1], [22, 1],
      [22, 2], [22, 3],
      [21, 3], [20, 3], [19, 3], [18, 3], [17, 3], [16, 3], [15, 3], [14, 3], [13, 3],
      [12, 3], [11, 3], [10, 3], [9, 3], [8, 3], [7, 3], [6, 3], [5, 3], [4, 3], [3, 3],
      [2, 3], [1, 3],
      [1, 4], [1, 5],
      [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5], [11, 5],
      [12, 5], [13, 5], [14, 5], [15, 5], [16, 5], [17, 5], [18, 5], [19, 5], [20, 5],
      [21, 5], [22, 5],
      [22, 6], [22, 7],
      [21, 7], [20, 7], [19, 7], [18, 7], [17, 7], [16, 7], [15, 7], [14, 7], [13, 7],
      [12, 7], [11, 7], [10, 7], [9, 7], [8, 7], [7, 7], [6, 7], [5, 7], [4, 7], [3, 7],
      [2, 7], [1, 7],
      [1, 8], [1, 9],
      [2, 9], [3, 9], [4, 9], [5, 9], [6, 9], [7, 9], [8, 9], [9, 9], [10, 9], [11, 9],
      [12, 9], [13, 9], [14, 9], [15, 9], [16, 9], [17, 9], [18, 9], [19, 9], [20, 9],
      [21, 9], [22, 9],
      [22, 10], [22, 11],
      [21, 11], [20, 11], [19, 11], [18, 11], [17, 11], [16, 11], [15, 11], [14, 11],
      [13, 11], [12, 11], [11, 11], [10, 11], [11, 12], [11, 13], [12, 13], [13, 13],
      [14, 13], [15, 13], [16, 13], [17, 13], [18, 13], [19, 13], [20, 13], [21, 13],
      [22, 13], [23, 13]
    ],
    description: 'The longest path - ultimate distance',
    difficulty: 'Easy'
  },
  fortress: {
    name: 'Fortress',
    path: [
      // Enter from left
      [0, 7], [1, 7], [2, 7], [3, 7],
      // Go around outer wall
      [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3],
      [13, 3], [14, 3], [15, 3], [16, 3], [17, 3], [18, 3], [19, 3], [20, 3],
      [20, 4], [20, 5], [20, 6], [20, 7], [20, 8], [20, 9], [20, 10], [20, 11], [20, 12],
      [19, 12], [18, 12], [17, 12], [16, 12], [15, 12], [14, 12], [13, 12], [12, 12],
      [11, 12], [10, 12], [9, 12], [8, 12], [7, 12], [6, 12], [5, 12], [4, 12], [3, 12],
      // Go into inner keep
      [3, 11], [3, 10], [3, 9], [3, 8],
      // Inner path
      [4, 8], [5, 8], [6, 8], [7, 8], [8, 8], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8],
      [14, 8], [15, 8], [16, 8], [17, 8],
      // Up and around
      [17, 7], [17, 6], [16, 6], [15, 6], [14, 6], [13, 6], [12, 6], [11, 6], [10, 6],
      [9, 6], [8, 6], [7, 6], [6, 6],
      // Exit through center
      [6, 7], [6, 8], [6, 9], [6, 10], [7, 10], [8, 10], [9, 10], [10, 10], [11, 10],
      [12, 10], [13, 10], [14, 10], [15, 10], [16, 10], [17, 10], [18, 10],
      [19, 10], [20, 10], [21, 10], [22, 10], [23, 10]
    ],
    description: 'Defend the fortress walls',
    difficulty: 'Medium'
  },
  twins: {
    name: 'Twin Paths',
    path: [
      // Top path starts
      [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3],
      [10, 3], [11, 3],
      // Merge point prep - go down
      [11, 4], [11, 5], [11, 6], [11, 7],
      // Continue right
      [12, 7], [13, 7], [14, 7], [15, 7], [16, 7], [17, 7], [18, 7], [19, 7], [20, 7],
      [21, 7], [22, 7], [23, 7]
    ],
    description: 'Two paths merge into one',
    difficulty: 'Hard'
  },
  arena: {
    name: 'Arena',
    path: [
      // Enter from left into circular arena
      [0, 7], [1, 7], [2, 7], [3, 7], [4, 7],
      // Circle around the arena (large circle)
      [4, 6], [4, 5], [4, 4], [5, 3], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2],
      [12, 2], [13, 2], [14, 2], [15, 2], [16, 3], [17, 4], [18, 5], [18, 6], [18, 7],
      [18, 8], [18, 9], [17, 10], [16, 11], [15, 12], [14, 12], [13, 12], [12, 12],
      [11, 12], [10, 12], [9, 12], [8, 12], [7, 12], [6, 12], [5, 11], [4, 10], [4, 9],
      [4, 8],
      // Second loop (smaller)
      [5, 8], [6, 8], [6, 7], [6, 6], [7, 5], [8, 4], [9, 4], [10, 4], [11, 4], [12, 4],
      [13, 4], [14, 5], [15, 6], [15, 7], [15, 8], [14, 9], [13, 10], [12, 10], [11, 10],
      [10, 10], [9, 10], [8, 9], [7, 8],
      // Exit
      [8, 8], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], [15, 8], [16, 8],
      [17, 8], [18, 8], [19, 8], [20, 8], [21, 8], [22, 8], [23, 8]
    ],
    description: 'Circle the arena twice',
    difficulty: 'Medium'
  },
  maze: {
    name: 'Labyrinth',
    path: [
      [0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0],
      [7, 1], [7, 2], [7, 3], [7, 4],
      [6, 4], [5, 4], [4, 4], [3, 4], [2, 4], [1, 4],
      [1, 5], [1, 6], [1, 7], [1, 8],
      [2, 8], [3, 8], [4, 8], [5, 8], [6, 8], [7, 8], [8, 8], [9, 8],
      [9, 7], [9, 6], [9, 5], [9, 4], [9, 3], [9, 2],
      [10, 2], [11, 2], [12, 2], [13, 2], [14, 2], [15, 2],
      [15, 3], [15, 4], [15, 5], [15, 6], [15, 7], [15, 8], [15, 9], [15, 10],
      [14, 10], [13, 10], [12, 10], [11, 10],
      [11, 11], [11, 12], [11, 13], [11, 14],
      [12, 14], [13, 14], [14, 14], [15, 14], [16, 14], [17, 14], [18, 14], [19, 14],
      [19, 13], [19, 12], [19, 11], [19, 10], [19, 9], [19, 8], [19, 7], [19, 6],
      [20, 6], [21, 6], [22, 6], [23, 6]
    ],
    description: 'Navigate the twisting maze',
    difficulty: 'Medium'
  },
  hourglass: {
    name: 'Hourglass',
    path: [
      // Top wide section
      [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1],
      [10, 1], [11, 1], [12, 1], [13, 1], [14, 1], [15, 1], [16, 1], [17, 1], [18, 1],
      [19, 1], [20, 1], [21, 1], [22, 1],
      // Narrow down to center
      [22, 2], [21, 2], [20, 3], [19, 3], [18, 4], [17, 4], [16, 5], [15, 5], [14, 6],
      [13, 6], [12, 7], [11, 7],
      // Center point
      [11, 8],
      // Expand back out
      [12, 8], [13, 9], [14, 9], [15, 10], [16, 10], [17, 11], [18, 11], [19, 12],
      [20, 12], [21, 13], [22, 13],
      // Bottom wide section
      [22, 14], [21, 14], [20, 14], [19, 14], [18, 14], [17, 14], [16, 14], [15, 14],
      [14, 14], [13, 14], [12, 14], [11, 14], [10, 14], [9, 14], [8, 14], [7, 14],
      [6, 14], [5, 14], [4, 14], [3, 14], [2, 14], [1, 14],
      // Exit
      [1, 13], [1, 12], [2, 12], [3, 12], [4, 12], [5, 12], [6, 12], [7, 12], [8, 12],
      [9, 12], [10, 12], [11, 12], [12, 12], [13, 12], [14, 12], [15, 12], [16, 12],
      [17, 12], [18, 12], [19, 12], [20, 12], [21, 12], [22, 12], [23, 12]
    ],
    description: 'Pinch point in the middle',
    difficulty: 'Hard'
  }
};

const currentPath = MAPS.classic.path;

const TOWER_TYPES = {
  basic: { name: 'Arrow', cost: 50, damage: 20, range: 3.5, fireRate: 1100, color: '#4ade80', projectileColor: '#86efac' },
  cannon: { name: 'Cannon', cost: 100, damage: 50, range: 3, fireRate: 1600, color: '#f97316', projectileColor: '#fdba74', splash: 2.5 },
  sniper: { name: 'Sniper', cost: 150, damage: 100, range: 7, fireRate: 1800, color: '#8b5cf6', projectileColor: '#c4b5fd' },
  freeze: { name: 'Frost', cost: 75, damage: 30, range: 3, fireRate: 700, color: '#06b6d4', projectileColor: '#67e8f9', slow: 0.4 },
  barracks: { name: 'Barracks', cost: 100, damage: 0, range: 0, fireRate: 5000, color: '#eab308', projectileColor: '#fde047', spawnPawn: true },
  bank: { name: 'Bank', cost: 150, damage: 0, range: 0, fireRate: 0, color: '#22c55e', projectileColor: '#86efac', income: 25 },
  laser: { name: 'Laser', cost: 200, damage: 8, range: 4, fireRate: 50, color: '#ec4899', projectileColor: '#f472b6' },
  mortar: { name: 'Mortar', cost: 175, damage: 120, range: 8, fireRate: 3500, color: '#78350f', projectileColor: '#a16207', splash: 3 },
  tesla: { name: 'Tesla', cost: 225, damage: 45, range: 3.5, fireRate: 900, color: '#3b82f6', projectileColor: '#60a5fa', chain: 3 },
  flame: { name: 'Flame', cost: 125, damage: 15, range: 2, fireRate: 100, color: '#dc2626', projectileColor: '#f87171', burn: true },
  poison: { name: 'Poison', cost: 150, damage: 10, range: 3, fireRate: 1200, color: '#84cc16', projectileColor: '#a3e635', poison: true },
  missile: { name: 'Missile', cost: 250, damage: 200, range: 10, fireRate: 4000, color: '#7f1d1d', projectileColor: '#fca5a5', homing: true, splash: 2 },
  vortex: { name: 'Vortex', cost: 200, damage: 5, range: 3, fireRate: 200, color: '#6366f1', projectileColor: '#a5b4fc', pullback: true },
  boost: { name: 'Boost', cost: 175, damage: 0, range: 2.5, fireRate: 0, color: '#fbbf24', projectileColor: '#fde047', boostTowers: true },
  vampire: { name: 'Vampire', cost: 225, damage: 35, range: 3, fireRate: 1000, color: '#be123c', projectileColor: '#fb7185', lifesteal: true },
  antiair: { name: 'Anti-Air', cost: 125, damage: 80, range: 5, fireRate: 800, color: '#0ea5e9', projectileColor: '#7dd3fc', antiGhost: true },
  // NEW TOWERS
  rail: { name: 'Railgun', cost: 350, damage: 500, range: 12, fireRate: 5000, color: '#f59e0b', projectileColor: '#fcd34d', pierce: true }, // Pierces through all enemies in a line
  frost_lord: { name: 'Frost Lord', cost: 300, damage: 50, range: 4, fireRate: 1200, color: '#0c4a6e', projectileColor: '#7dd3fc', slow: 0.3, chill_aura: true }, // Has passive AOE slow
  sun: { name: 'Sun Tower', cost: 400, damage: 75, range: 5, fireRate: 600, color: '#fbbf24', projectileColor: '#fef08a', ignite: true }, // Sets ground on fire
  gravity: { name: 'Gravity Well', cost: 275, damage: 25, range: 3.5, fireRate: 800, color: '#475569', projectileColor: '#94a3b8', gravity: true }, // Pulls enemies toward it
  assassin: { name: 'Assassin', cost: 300, damage: 150, range: 6, fireRate: 2000, color: '#1e293b', projectileColor: '#64748b', crit: 0.25 } // 25% crit for 3x damage
};

const ENEMY_TYPES = {
  basic: { health: 60, speed: 1, reward: 10, color: '#ef4444', size: 0.6 },
  fast: { health: 40, speed: 2, reward: 15, color: '#eab308', size: 0.5 },
  tank: { health: 200, speed: 0.5, reward: 25, color: '#7c3aed', size: 0.8 },
  boss: { health: 500, speed: 0.3, reward: 100, color: '#dc2626', size: 1 },
  healer: { health: 80, speed: 0.8, reward: 30, color: '#22c55e', size: 0.6, heals: true },
  armored: { health: 150, speed: 0.7, reward: 35, color: '#64748b', size: 0.7, armor: 0.5 },
  swarm: { health: 25, speed: 1.5, reward: 5, color: '#f97316', size: 0.4 },
  // New enemy types
  ghost: { health: 70, speed: 1.2, reward: 25, color: '#a855f7', size: 0.55, phasing: true }, // Ignores some tower damage
  splitter: { health: 100, speed: 0.8, reward: 20, color: '#06b6d4', size: 0.7, splits: true }, // Splits into 2 when killed
  regen: { health: 120, speed: 0.6, reward: 35, color: '#10b981', size: 0.65, regen: 5 }, // Regenerates 5 HP/s
  shielded: { health: 80, speed: 0.9, reward: 40, color: '#3b82f6', size: 0.6, shield: 100 }, // Has 100 shield that regens
  speeder: { health: 50, speed: 1, reward: 30, color: '#f43f5e', size: 0.5, speeds: true }, // Gets faster over time
  necro: { health: 150, speed: 0.5, reward: 50, color: '#581c87', size: 0.75, necro: true }, // Revives dead enemies
  immune: { health: 100, speed: 0.7, reward: 40, color: '#fbbf24', size: 0.65, immune: 'slow' }, // Immune to slow
  bomber: { health: 60, speed: 1.1, reward: 25, color: '#b91c1c', size: 0.55, explodes: true }, // Damages towers on death
  jumper: { health: 80, speed: 0.8, reward: 35, color: '#14b8a6', size: 0.6, jumps: true }, // Teleports forward
  titan: { health: 1500, speed: 0.15, reward: 300, color: '#991b1b', size: 1.2 }, // Super boss
  shadow: { health: 45, speed: 2.5, reward: 20, color: '#1f2937', size: 0.45, invisible: true }, // Harder to target
  vamp: { health: 90, speed: 0.9, reward: 30, color: '#be123c', size: 0.6, lifesteal: true }, // Heals when damaging castle
  // Even more enemies
  mage: { health: 80, speed: 0.9, reward: 40, color: '#7e22ce', size: 0.55, disruptor: true }, // Disables towers briefly
  assassin_e: { health: 50, speed: 2.2, reward: 35, color: '#18181b', size: 0.45, evasion: 0.3 }, // 30% chance to dodge
  swarm_queen: { health: 200, speed: 0.7, reward: 80, color: '#7c2d12', size: 0.75, swarm_spawn: true }, // Spawns swarm enemies
  frost_giant: { health: 400, speed: 0.4, reward: 80, color: '#1e3a8a', size: 0.9, frost_aura: true }, // Slows tower fire rate
  phoenix: { health: 100, speed: 1, reward: 60, color: '#f97316', size: 0.6, revive: true }, // Revives once with 50% HP
  berserker: { health: 120, speed: 0.8, reward: 45, color: '#991b1b', size: 0.65, rage: true } // Speed increases as HP decreases
};

// Environment hazards that appear on the map
const HAZARDS = {
  thorns: { name: 'Thorns', icon: '🌵', damage: 2, description: 'Damages enemies that pass' },
  mud: { name: 'Mud', icon: '🟤', slow: 0.5, description: 'Slows enemies 50%' },
  fire: { name: 'Fire Pit', icon: '🔥', burn: true, description: 'Burns enemies' }
};

export default function TowerDefense() {
  const [gold, setGold] = useState(200);
  const [lives, setLives] = useState(20);
  const [wave, setWave] = useState(0);
  const [towers, setTowers] = useState([]);
  const [enemies, setEnemies] = useState([]);
  const [projectiles, setProjectiles] = useState([]);
  const [explosions, setExplosions] = useState([]);
  const [pawns, setPawns] = useState([]);
  const [floatingTexts, setFloatingTexts] = useState([]);
  const [selectedTower, setSelectedTower] = useState('basic');
  const [gameState, setGameState] = useState('start');
  const [hoveredCell, setHoveredCell] = useState(null);
  const [selectedPlacedTower, setSelectedPlacedTower] = useState(null);
  const [showUpgradeMenu, setShowUpgradeMenu] = useState(null);
  const [selectedMap, setSelectedMap] = useState('classic');
  const [selectedDifficulty, setSelectedDifficulty] = useState(null);
  const [showDifficultySelect, setShowDifficultySelect] = useState(false);
  const [gameSpeed, setGameSpeed] = useState(1);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [totalKills, setTotalKills] = useState(0);
  const [totalGoldEarned, setTotalGoldEarned] = useState(0);
  const [lastKillTime, setLastKillTime] = useState(0);
  const [waveAnnouncement, setWaveAnnouncement] = useState(null);
  const [screenShake, setScreenShake] = useState(0);
  const [showWavePreview, setShowWavePreview] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [damageNumbers, setDamageNumbers] = useState([]);
  const [lightningEffects, setLightningEffects] = useState([]);
  
  // New features
  const [achievements, setAchievements] = useState({});
  const [newAchievement, setNewAchievement] = useState(null);
  const [abilities, setAbilities] = useState({
    nuke: { lastUsed: 0 },
    freeze: { lastUsed: 0 },
    goldRush: { lastUsed: 0, active: false },
    rage: { lastUsed: 0, active: false },
    heal: { lastUsed: 0 },
    airstrike: { lastUsed: 0 }
  });
  const [perfectWaves, setPerfectWaves] = useState(0);
  const [towerTypesBuilt, setTowerTypesBuilt] = useState(new Set());
  const [maxGold, setMaxGold] = useState(0);
  const [highestWave, setHighestWave] = useState(0);
  const [livesAtWaveStart, setLivesAtWaveStart] = useState(0);
  const [particles, setParticles] = useState([]);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  
  // Hero system
  const [selectedHero, setSelectedHero] = useState(null);
  const [showHeroSelect, setShowHeroSelect] = useState(false);
  const [heroAbilityCooldown, setHeroAbilityCooldown] = useState(0);
  const [heroAbilityUses, setHeroAbilityUses] = useState(0);
  
  // Weather system
  const [currentWeather, setCurrentWeather] = useState('clear');
  const [weathersSurvived, setWeathersSurvived] = useState(new Set(['clear']));
  const [weatherTimer, setWeatherTimer] = useState(0);
  
  // Airstrikes
  const [airstrikes, setAirstrikes] = useState([]);
  
  // Challenge modifiers
  const [activeModifiers, setActiveModifiers] = useState([]);
  
  // Tower targeting modes (default: first)
  const [defaultTargetMode, setDefaultTargetMode] = useState('first');
  
  // Active synergies display
  const [activeSynergies, setActiveSynergies] = useState([]);
  
  // Elite enemies tracking
  const [eliteCount, setEliteCount] = useState(0);
  
  // Boss ability tracking
  const [bossAbilityTimer, setBossAbilityTimer] = useState(0);
  
  // Kill streak and multiplier
  const [killStreak, setKillStreak] = useState(0);
  const [streakMultiplier, setStreakMultiplier] = useState(1);
  
  // Tower placement preview
  const [showRangePreview, setShowRangePreview] = useState(true);
  
  // Auto-start waves
  const [autoStartWaves, setAutoStartWaves] = useState(false);
  
  // Show damage numbers
  const [showDamageNumbers, setShowDamageNumbers] = useState(true);
  
  // Mini-map toggle
  const [showMiniMap, setShowMiniMap] = useState(true);
  
  // Boss health tracking (for boss health bar)
  const [bossEnemy, setBossEnemy] = useState(null);
  
  // Sell confirmation
  const [confirmSell, setConfirmSell] = useState(null);
  
  // Tower specializations
  const [showSpecialize, setShowSpecialize] = useState(null);
  
  // Game time tracking
  const [gameTime, setGameTime] = useState(0);
  
  // Enemy spawn indicator
  const [spawnIndicator, setSpawnIndicator] = useState(false);
  
  // Environment hazards placed by player
  const [hazards, setHazards] = useState([]);
  const [selectedHazard, setSelectedHazard] = useState(null);
  
  // Player level / prestige system
  const [playerLevel, setPlayerLevel] = useState(1);
  const [playerXP, setPlayerXP] = useState(0);
  const [totalWavesCompleted, setTotalWavesCompleted] = useState(0);
  
  // Quest/daily objective
  const [activeQuest, setActiveQuest] = useState(null);
  const [questProgress, setQuestProgress] = useState(0);
  
  // Power-ups dropped by enemies
  const [droppedPowerups, setDroppedPowerups] = useState([]);
  const [activePowerups, setActivePowerups] = useState({});
  
  // Shop system
  const [showShop, setShowShop] = useState(false);
  const [shopPurchases, setShopPurchases] = useState({});
  const [tempDamageBoost, setTempDamageBoost] = useState(0);
  const [tempDamageBoostWaves, setTempDamageBoostWaves] = useState(0);
  
  // Tower chain/combo system
  const [towerChain, setTowerChain] = useState(0);
  
  // Wave summary
  const [waveSummary, setWaveSummary] = useState(null);
  const [waveStartGold, setWaveStartGold] = useState(0);
  const [waveStartKills, setWaveStartKills] = useState(0);
  
  const currentPath = MAPS[selectedMap].path;
  const gameLoopRef = useRef(null);
  const lastUpdateRef = useRef(Date.now());
  const spawnQueueRef = useRef([]);
  const enemiesRef = useRef([]);
  const towersRef = useRef([]);
  const pawnsRef = useRef([]);
  const pathRef = useRef(currentPath);
  const difficultyRef = useRef(selectedDifficulty);
  const gameSpeedRef = useRef(gameSpeed);
  const abilitiesRef = useRef(abilities);
  const livesRef = useRef(lives);

  // Keep refs in sync with state
  useEffect(() => {
    enemiesRef.current = enemies;
  }, [enemies]);

  useEffect(() => {
    towersRef.current = towers;
  }, [towers]);

  useEffect(() => {
    pawnsRef.current = pawns;
  }, [pawns]);

  useEffect(() => {
    pathRef.current = currentPath;
  }, [currentPath]);

  useEffect(() => {
    abilitiesRef.current = abilities;
  }, [abilities]);

  useEffect(() => {
    livesRef.current = lives;
  }, [lives]);

  useEffect(() => {
    difficultyRef.current = selectedDifficulty;
  }, [selectedDifficulty]);

  useEffect(() => {
    gameSpeedRef.current = gameSpeed;
  }, [gameSpeed]);

  // Track max gold
  useEffect(() => {
    if (gold > maxGold) setMaxGold(gold);
  }, [gold, maxGold]);

  // Track highest wave
  useEffect(() => {
    if (wave > highestWave) setHighestWave(wave);
  }, [wave, highestWave]);

  // Check achievements
  useEffect(() => {
    const stats = { totalKills, maxCombo, highestWave, maxGold, perfectWaves, towerTypesBuilt: towerTypesBuilt.size };
    Object.entries(ACHIEVEMENTS).forEach(([key, achievement]) => {
      if (!achievements[key] && achievement.condition(stats)) {
        setAchievements(prev => ({ ...prev, [key]: true }));
        setNewAchievement({ key, ...achievement });
        setTimeout(() => setNewAchievement(null), 3000);
      }
    });
  }, [totalKills, maxCombo, highestWave, maxGold, perfectWaves, towerTypesBuilt, achievements]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (gameState !== 'playing' && gameState !== 'waiting') return;
      
      // Pause with Space or P
      if (e.code === 'Space' || e.key === 'p' || e.key === 'P') {
        if (gameState === 'playing') {
          setIsPaused(prev => !prev);
          e.preventDefault();
        }
      }
      
      // Tower selection with number keys
      const towerKeys = Object.keys(TOWER_TYPES);
      const num = parseInt(e.key);
      if (num >= 1 && num <= towerKeys.length) {
        setSelectedTower(towerKeys[num - 1]);
      }
      
      // Speed controls
      if (e.key === '-' || e.key === '_') setGameSpeed(Math.max(1, gameSpeed - 1));
      if (e.key === '=' || e.key === '+') setGameSpeed(Math.min(3, gameSpeed + 1));
      
      // Abilities with Q, W, E, R
      if (e.key === 'q' || e.key === 'Q') useAbility('nuke');
      if (e.key === 'w' || e.key === 'W') useAbility('freeze');
      if (e.key === 'e' || e.key === 'E') useAbility('goldRush');
      if (e.key === 'r' || e.key === 'R') useAbility('rage');
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [gameState, gameSpeed]);

  // Use special ability
  const useAbility = useCallback((abilityKey) => {
    const ability = ABILITIES[abilityKey];
    const now = Date.now();
    
    if (gold < ability.cost) return;
    if (now - abilities[abilityKey].lastUsed < ability.cooldown) return;
    if (gameState !== 'playing') return;
    
    setGold(g => g - ability.cost);
    setAbilities(prev => ({
      ...prev,
      [abilityKey]: { ...prev[abilityKey], lastUsed: now, active: true }
    }));
    
    // Apply ability effects
    if (abilityKey === 'nuke') {
      setEnemies(prev => prev.map(e => ({ ...e, health: e.health - 500 })));
      setScreenShake(20);
      setTimeout(() => setScreenShake(0), 300);
      // Create explosion particles
      setParticles(prev => [...prev, ...Array(20).fill(null).map(() => ({
        id: Date.now() + Math.random(),
        x: Math.random() * GRID_WIDTH,
        y: Math.random() * GRID_HEIGHT,
        type: 'explosion',
        startTime: now
      }))]);
    }
    
    if (abilityKey === 'freeze') {
      setEnemies(prev => prev.map(e => ({ ...e, slowTimer: 5000, slowAmount: 0.1 })));
    }
    
    if (abilityKey === 'heal') {
      const diff = DIFFICULTIES[selectedDifficulty] || DIFFICULTIES.medium;
      setLives(l => Math.min(diff.lives, l + 5));
      setFloatingTexts(prev => [...prev, {
        id: Date.now(),
        x: GRID_WIDTH / 2,
        y: GRID_HEIGHT / 2,
        text: '+5 Lives! 💚',
        color: '#22c55e',
        startTime: now
      }]);
    }
    
    if (abilityKey === 'airstrike') {
      // Create airstrikes along the path
      const path = pathRef.current;
      const strikes = [];
      for (let i = 0; i < path.length; i += 4) {
        strikes.push({
          id: Date.now() + i,
          x: path[i][0],
          y: path[i][1],
          delay: i * 100,
          startTime: now
        });
      }
      setAirstrikes(strikes);
      
      // Apply damage after delays
      strikes.forEach(strike => {
        setTimeout(() => {
          setEnemies(prev => prev.map(e => {
            const dx = e.x - strike.x;
            const dy = e.y - strike.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 2) {
              return { ...e, health: e.health - 150 };
            }
            return e;
          }));
          setExplosions(prev => [...prev, {
            id: Date.now() + Math.random(),
            x: strike.x,
            y: strike.y,
            radius: 2,
            startTime: Date.now(),
            duration: 400
          }]);
        }, strike.delay);
      });
      
      // Clear airstrikes after animation
      setTimeout(() => setAirstrikes([]), 3000);
    }
    
    // Deactivate timed abilities
    if (abilityKey === 'goldRush' || abilityKey === 'rage') {
      setTimeout(() => {
        setAbilities(prev => ({
          ...prev,
          [abilityKey]: { ...prev[abilityKey], active: false }
        }));
      }, 10000);
    }
  }, [gold, abilities, gameState, selectedDifficulty]);

  const isPathCell = useCallback((x, y) => {
    return currentPath.some(([px, py]) => px === x && py === y);
  }, [currentPath]);

  const canPlaceTower = useCallback((x, y) => {
    if (isPathCell(x, y)) return false;
    if (towers.some(t => t.x === x && t.y === y)) return false;
    return true;
  }, [isPathCell, towers]);

  const placeTower = useCallback((x, y) => {
    const towerType = TOWER_TYPES[selectedTower];
    if (gold >= towerType.cost && canPlaceTower(x, y)) {
      setTowers(prev => [...prev, {
        id: Date.now(),
        x, y,
        type: selectedTower,
        ...towerType,
        lastFired: 0,
        level: 1
      }]);
      setGold(prev => prev - towerType.cost);
      setSelectedPlacedTower(null);
      setTowerTypesBuilt(prev => new Set([...prev, selectedTower]));
      
      // Placement particle effect
      setParticles(prev => [...prev, {
        id: Date.now(),
        x: x,
        y: y,
        type: 'place',
        startTime: Date.now()
      }]);
    }
  }, [gold, selectedTower, canPlaceTower]);

  const upgradeTower = useCallback((towerId, upgradeType) => {
    setTowers(prev => prev.map(t => {
      if (t.id === towerId && t.level < 5) {
        const upgradeCost = Math.floor(t.cost * (t.level * 0.5 + 0.5));
        if (gold >= upgradeCost) {
          setGold(g => g - upgradeCost);
          setShowUpgradeMenu(null);
          
          if (upgradeType === 'damage') {
            return {
              ...t,
              level: t.level + 1,
              damage: Math.floor(t.damage * 1.4),
              damageLevel: (t.damageLevel || 0) + 1
            };
          } else if (upgradeType === 'speed') {
            return {
              ...t,
              level: t.level + 1,
              fireRate: Math.floor(t.fireRate * 0.75),
              speedLevel: (t.speedLevel || 0) + 1
            };
          } else if (upgradeType === 'range') {
            return {
              ...t,
              level: t.level + 1,
              range: t.range + 1,
              rangeLevel: (t.rangeLevel || 0) + 1
            };
          }
        }
      }
      return t;
    }));
  }, [gold]);

  const sellTower = useCallback((towerId) => {
    const tower = towers.find(t => t.id === towerId);
    if (tower) {
      const sellValue = Math.floor(tower.cost * tower.level * 0.5);
      setGold(g => g + sellValue);
      setTowers(prev => prev.filter(t => t.id !== towerId));
      setSelectedPlacedTower(null);
    }
  }, [towers]);

  // Get preview of next wave enemies
  const getWavePreview = useCallback((waveNum) => {
    const baseEnemies = 5 + waveNum * 2;
    const preview = { basic: 0, fast: 0, tank: 0, boss: 0, healer: 0, armored: 0, swarm: 0 };
    
    if (waveNum % 10 === 0) {
      preview.tank = 5;
      preview.boss = 2;
    } else if (waveNum % 5 === 0) {
      preview.armored = baseEnemies;
      preview.boss = 1;
    } else if (waveNum % 7 === 0) {
      preview.swarm = baseEnemies * 3;
    } else if (waveNum % 15 === 0) {
      preview.tank = 5;
      preview.titan = 1;
    } else if (waveNum % 11 === 0) {
      preview.ghost = Math.floor(baseEnemies * 0.5);
      preview.shadow = Math.floor(baseEnemies * 0.5);
    } else if (waveNum % 13 === 0) {
      preview.splitter = Math.floor(baseEnemies * 0.7);
    } else {
      // Estimate normal wave composition
      preview.basic = Math.floor(baseEnemies * 0.5);
      if (waveNum >= 3) preview.fast = Math.floor(baseEnemies * 0.2);
      if (waveNum >= 5) preview.tank = Math.floor(baseEnemies * 0.15);
      if (waveNum >= 6) preview.armored = Math.floor(baseEnemies * 0.1);
      if (waveNum >= 8) preview.healer = Math.floor(baseEnemies * 0.05);
      if (waveNum >= 10) preview.regen = Math.floor(baseEnemies * 0.05);
      if (waveNum >= 12) preview.shielded = Math.floor(baseEnemies * 0.05);
    }
    return preview;
  }, []);

  const startWave = useCallback(() => {
    if (gameState !== 'playing') {
      setGameState('playing');
      setIsPaused(false);
      setLivesAtWaveStart(lives);
      setWaveStartGold(gold);
      setWaveStartKills(totalKills);
      setWaveSummary(null); // Clear previous summary
      const newWave = wave + 1;
      setWave(newWave);
      
      // Change weather every 3 waves
      if (newWave % 3 === 0) {
        const weathers = Object.keys(WEATHER_TYPES);
        const newWeather = weathers[Math.floor(Math.random() * weathers.length)];
        setCurrentWeather(newWeather);
        setWeathersSurvived(prev => new Set([...prev, newWeather]));
      }
      
      // Show wave announcement
      let announcement = `Wave ${newWave}`;
      if (newWave % 15 === 0) announcement = `👹 TITAN WAVE ${newWave}! 👹`;
      else if (newWave % 10 === 0) announcement = `⚠️ BOSS WAVE ${newWave}! ⚠️`;
      else if (newWave % 11 === 0) announcement = `👻 GHOST WAVE! 👻`;
      else if (newWave % 13 === 0) announcement = `💧 SPLITTER WAVE! 💧`;
      else if (newWave % 7 === 0) announcement = `🐜 SWARM WAVE! 🐜`;
      else if (newWave % 5 === 0) announcement = `🛡️ Elite Wave ${newWave}`;
      
      setWaveAnnouncement(announcement);
      setTimeout(() => setWaveAnnouncement(null), 2000);
      
      const queue = [];
      const baseEnemies = 5 + newWave * 2;
      
      // Special wave compositions
      if (newWave % 10 === 0) {
        // Boss wave every 10 waves
        for (let i = 0; i < 5; i++) {
          queue.push({ type: 'tank', delay: i * 1000 });
        }
        queue.push({ type: 'boss', delay: 6000 });
        queue.push({ type: 'boss', delay: 8000 });
      } else if (newWave % 5 === 0) {
        // Mini-boss wave
        for (let i = 0; i < baseEnemies; i++) {
          queue.push({ type: 'armored', delay: i * 600 });
        }
        queue.push({ type: 'boss', delay: baseEnemies * 600 + 1000 });
      } else if (newWave % 7 === 0) {
        // Swarm wave
        for (let i = 0; i < baseEnemies * 3; i++) {
          queue.push({ type: 'swarm', delay: i * 300 });
        }
      } else if (newWave % 15 === 0) {
        // Titan wave! 
        for (let i = 0; i < 5; i++) {
          queue.push({ type: 'tank', delay: i * 1000 });
        }
        queue.push({ type: 'titan', delay: 6000 });
      } else if (newWave % 11 === 0) {
        // Ghost wave
        for (let i = 0; i < baseEnemies; i++) {
          const type = Math.random() < 0.5 ? 'ghost' : 'shadow';
          queue.push({ type, delay: i * 500 });
        }
      } else if (newWave % 13 === 0) {
        // Splitter wave
        for (let i = 0; i < Math.floor(baseEnemies * 0.7); i++) {
          queue.push({ type: 'splitter', delay: i * 700 });
        }
      } else {
        // Normal wave with variety - include new enemy types
        for (let i = 0; i < baseEnemies; i++) {
          let type = 'basic';
          const roll = Math.random();
          if (newWave >= 20 && roll < 0.05) type = 'vamp';
          else if (newWave >= 18 && roll < 0.05) type = 'jumper';
          else if (newWave >= 16 && roll < 0.06) type = 'necro';
          else if (newWave >= 14 && roll < 0.08) type = 'speeder';
          else if (newWave >= 12 && roll < 0.08) type = 'shielded';
          else if (newWave >= 10 && roll < 0.08) type = 'regen';
          else if (newWave >= 9 && roll < 0.1) type = 'ghost';
          else if (newWave >= 8 && roll < 0.1) type = 'healer';
          else if (newWave >= 6 && roll < 0.2) type = 'armored';
          else if (newWave >= 4 && roll < 0.15) type = 'swarm';
          else if (newWave >= 3 && roll < 0.3) type = 'fast';
          else if (newWave >= 5 && roll < 0.2) type = 'tank';
          queue.push({ type, delay: i * 800 });
        }
      }
      
      spawnQueueRef.current = queue;
    }
  }, [gameState, wave, lives]);

  const spawnEnemy = useCallback((type) => {
    const enemyType = ENEMY_TYPES[type];
    if (!enemyType) return;
    const diff = DIFFICULTIES[selectedDifficulty] || DIFFICULTIES.medium;
    const healthMultiplier = (1 + (wave - 1) * 0.15) * diff.enemyHealthMult;
    const speedMultiplier = diff.enemySpeedMult;
    // Reward scales with wave - more gold for harder enemies in later waves
    const rewardMultiplier = 1 + (wave - 1) * 0.1; // +10% per wave
    setEnemies(prev => [...prev, {
      id: Date.now() + Math.random(),
      type,
      x: currentPath[0][0],
      y: currentPath[0][1],
      pathIndex: 0,
      health: Math.floor(enemyType.health * healthMultiplier),
      maxHealth: Math.floor(enemyType.health * healthMultiplier),
      speed: enemyType.speed * speedMultiplier,
      reward: Math.floor(enemyType.reward * rewardMultiplier),
      color: enemyType.color,
      size: enemyType.size,
      slowTimer: 0,
      slowAmount: 1,
      heals: enemyType.heals || false,
      armor: enemyType.armor || 0,
      lastHeal: 0,
      // New abilities
      phasing: enemyType.phasing || false,
      splits: enemyType.splits || false,
      regen: enemyType.regen || 0,
      shield: enemyType.shield || 0,
      currentShield: enemyType.shield || 0,
      speeds: enemyType.speeds || false,
      speedBonus: 0,
      necro: enemyType.necro || false,
      immune: enemyType.immune || null,
      explodes: enemyType.explodes || false,
      jumps: enemyType.jumps || false,
      invisible: enemyType.invisible || false,
      lifesteal: enemyType.lifesteal || false,
      // Elite modifier (chance increases with wave)
      elite: null,
      eliteIcon: null
    }]);
    
    // After spawning, maybe make it elite
    if (wave >= 5 && Math.random() < Math.min(0.3, 0.05 + wave * 0.01)) {
      const modifiers = Object.keys(ELITE_MODIFIERS);
      const modifier = modifiers[Math.floor(Math.random() * modifiers.length)];
      setEnemies(prev => {
        const lastEnemy = prev[prev.length - 1];
        if (!lastEnemy) return prev;
        
        const elite = ELITE_MODIFIERS[modifier];
        const updated = { ...lastEnemy, elite: modifier, eliteIcon: elite.icon };
        
        // Apply elite bonuses
        if (modifier === 'shielded') updated.armor = (updated.armor || 0) + 0.5;
        if (modifier === 'hasty') updated.speed *= 1.5;
        if (modifier === 'regenerating') updated.regen = (updated.regen || 0) + updated.maxHealth * 0.05;
        
        return [...prev.slice(0, -1), updated];
      });
    }
  }, [wave, currentPath, selectedDifficulty]);

  useEffect(() => {
    if (gameState !== 'playing') return;

    let spawnTimer = 0;
    const spawnInterval = setInterval(() => {
      const speedMult = gameSpeedRef.current;
      if (spawnQueueRef.current.length > 0) {
        const next = spawnQueueRef.current[0];
        if (spawnTimer >= next.delay) {
          spawnEnemy(next.type);
          spawnQueueRef.current.shift();
          spawnTimer = next.delay;
        }
      }
      spawnTimer += 100 * speedMult; // Apply speed multiplier to spawn timing
    }, 100);

    return () => clearInterval(spawnInterval);
  }, [gameState, spawnEnemy]);

  useEffect(() => {
    const gameLoop = () => {
      const now = Date.now();
      const rawDelta = now - lastUpdateRef.current;
      // Cap delta to prevent huge jumps (max 50ms per frame, then multiply by speed)
      const cappedDelta = Math.min(rawDelta, 50);
      const delta = cappedDelta * gameSpeedRef.current;
      lastUpdateRef.current = now;

      if (gameState !== 'playing' || isPaused) {
        gameLoopRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      // Update enemies
      setEnemies(prev => {
        const path = pathRef.current;
        const updated = prev.map(enemy => {
          // Ensure pathIndex is valid
          let { x, y, pathIndex, health, lastHeal } = enemy;
          pathIndex = Math.max(0, Math.min(path.length - 1, Math.floor(pathIndex)));
          
          // Smoother movement calculation
          const baseSpeed = enemy.speed * (enemy.slowAmount || 1) * 2;
          const moveDistance = baseSpeed * (delta / 1000);
          
          // Move enemy along path, potentially through multiple waypoints per frame at high speed
          let remainingDistance = moveDistance;
          while (remainingDistance > 0 && pathIndex < path.length - 1) {
            if (!path[pathIndex + 1]) break; // Safety check
            const targetX = path[pathIndex + 1][0];
            const targetY = path[pathIndex + 1][1];
            const dx = targetX - x;
            const dy = targetY - y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist <= remainingDistance) {
              // Reach this waypoint and continue to next
              x = targetX;
              y = targetY;
              pathIndex++;
              remainingDistance -= dist;
            } else {
              // Move towards waypoint
              x += (dx / dist) * remainingDistance;
              y += (dy / dist) * remainingDistance;
              remainingDistance = 0;
            }
          }
          
          // Healer enemies heal nearby allies
          if (enemy.heals && now - (lastHeal || 0) > 2000) {
            prev.forEach(other => {
              if (other.id !== enemy.id) {
                const dx = other.x - x;
                const dy = other.y - y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 2) {
                  other.health = Math.min(other.maxHealth, other.health + 10);
                }
              }
            });
            lastHeal = now;
          }

          // Burn damage over time
          if (enemy.burnTimer > 0) {
            health -= 5 * (delta / 1000);
          }

          // Poison damage over time
          if (enemy.poisonTimer > 0) {
            health -= 8 * (delta / 1000);
          }
          
          // Regeneration
          if (enemy.regen && health > 0) {
            health = Math.min(enemy.maxHealth, health + enemy.regen * (delta / 1000));
          }
          
          // Shield regeneration
          let shield = enemy.currentShield ?? enemy.shield ?? 0;
          if (enemy.shield && shield < enemy.shield && now - (enemy.lastShieldDamage || 0) > 3000) {
            shield = Math.min(enemy.shield, shield + 10 * (delta / 1000));
          }
          
          // Speeder gets faster over time
          let speedBonus = enemy.speedBonus || 0;
          if (enemy.speeds) {
            speedBonus = Math.min(2, speedBonus + 0.1 * (delta / 1000)); // Max 2x speed bonus
          }
          
          // Jumper teleports forward occasionally (every 3-5 seconds)
          let lastJump = enemy.lastJump || 0;
          if (enemy.jumps && now - lastJump > 4000 && pathIndex < path.length - 5) {
            pathIndex = Math.min(path.length - 2, pathIndex + 2);
            if (path[pathIndex]) {
              x = path[pathIndex][0];
              y = path[pathIndex][1];
            }
            lastJump = now;
          }

          return {
            ...enemy,
            x, y, pathIndex, lastHeal, health,
            lastJump,
            currentShield: shield,
            speedBonus,
            slowTimer: Math.max(0, (enemy.slowTimer || 0) - delta),
            slowAmount: (enemy.slowTimer || 0) > 0 ? (enemy.immune === 'slow' ? 1 : enemy.slowAmount) : 1,
            burnTimer: Math.max(0, (enemy.burnTimer || 0) - delta),
            poisonTimer: Math.max(0, (enemy.poisonTimer || 0) - delta)
          };
        });

        const escaped = updated.filter(e => e.pathIndex >= path.length - 1);
        if (escaped.length > 0) {
          setLives(l => Math.max(0, l - escaped.length));
          // Screen shake effect when enemies reach castle
          setScreenShake(10);
          setTimeout(() => setScreenShake(0), 200);
        }

        return updated.filter(e => e.pathIndex < path.length - 1 && e.health > 0);
      });

      // Tower attacks
      const currentTowers = towersRef.current;
      const currentEnemies = enemiesRef.current;
      const newProjectiles = [];
      const newPawns = [];
      const vortexDamage = new Map(); // Track vortex damage
      const vortexSlow = new Map(); // Track vortex slow effect
      const speedMult = gameSpeedRef.current;
      const rageActive = abilitiesRef.current.rage?.active;
      const rageMult = rageActive ? 0.5 : 1; // 2x faster when rage active
      const updatedTowers = currentTowers.map(tower => {
        // Barracks spawns pawns constantly (even between waves) but slower
        if (tower.spawnPawn) {
          const spawnRate = 8000 / speedMult; // 8 seconds between spawns
          if (now - tower.lastFired < spawnRate) return tower;
          
          // Spawn pawn at the CASTLE (end of path) to defend
          const path = pathRef.current;
          const spawnIndex = path.length - 1; // End of path (castle)
          
          // Count existing pawns to offset spawn position
          const existingPawnCount = pawnsRef.current.length;
          const offsetX = (existingPawnCount % 5) * 0.4 - 0.8; // Spread horizontally
          const offsetY = Math.floor(existingPawnCount / 5) * 0.4 - 0.4; // Stack rows
          
          newPawns.push({
            id: Date.now() + Math.random(),
            x: path[spawnIndex][0] + offsetX,
            y: path[spawnIndex][1] + offsetY,
            pathIndex: spawnIndex,
            health: 50 + (tower.level - 1) * 25,
            maxHealth: 50 + (tower.level - 1) * 25,
            damage: 15 + (tower.level - 1) * 10,
            attackRate: 1000,
            lastAttack: 0,
            towerId: tower.id
          });
          return { ...tower, lastFired: now };
        }
        
        if (now - tower.lastFired < (tower.fireRate * rageMult) / speedMult) return tower;

        // Vortex tower - damages ALL enemies in range and pulls them back
        if (tower.pullback) {
          let hitAny = false;
          currentEnemies.forEach(enemy => {
            const dx = enemy.x - tower.x;
            const dy = enemy.y - tower.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist <= tower.range) {
              hitAny = true;
              // Direct damage to all in range (no projectile needed)
              const currentDmg = vortexDamage.get(enemy.id) || 0;
              vortexDamage.set(enemy.id, currentDmg + tower.damage);
              
              // Slow enemy significantly instead of pulling back instantly
              vortexSlow.set(enemy.id, { timer: 1500, amount: 0.2 }); // 80% slow for 1.5s
            }
          });
          if (hitAny) {
            return { ...tower, lastFired: now };
          }
          return tower;
        }

        let target = null;
        let maxProgress = -1;
        let targetValue = -Infinity;

        // Get targeting mode for this tower (default: first)
        const targetMode = tower.targetMode || 'first';

        currentEnemies.forEach(enemy => {
          const dx = enemy.x - tower.x;
          const dy = enemy.y - tower.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist <= tower.range) {
            let value = 0;
            switch (targetMode) {
              case 'first': // Closest to castle (highest pathIndex)
                value = enemy.pathIndex;
                break;
              case 'last': // Furthest from castle (lowest pathIndex)
                value = -enemy.pathIndex;
                break;
              case 'strongest': // Most health
                value = enemy.health;
                break;
              case 'weakest': // Least health
                value = -enemy.health;
                break;
              case 'fastest': // Fastest speed
                value = enemy.speed * (1 + (enemy.speedBonus || 0));
                break;
              default:
                value = enemy.pathIndex;
            }
            
            if (value > targetValue) {
              targetValue = value;
              target = enemy;
            }
          }
        });

        if (target) {
          newProjectiles.push({
            id: Date.now() + Math.random(),
            x: tower.x,
            y: tower.y,
            targetId: target.id,
            damage: tower.damage,
            speed: 8,
            color: tower.projectileColor,
            splash: tower.splash,
            slow: tower.slow,
            burn: tower.burn,
            poison: tower.poison,
            chain: tower.chain
          });
          return { ...tower, lastFired: now };
        }
        return tower;
      });

      if (newProjectiles.length > 0) {
        setProjectiles(p => [...p, ...newProjectiles]);
      }
      if (newPawns.length > 0) {
        setPawns(p => [...p, ...newPawns]);
      }
      setTowers(updatedTowers);

      // Apply vortex damage and slow
      if (vortexDamage.size > 0 || vortexSlow.size > 0) {
        setEnemies(enemies => enemies.map(enemy => {
          const damage = vortexDamage.get(enemy.id) || 0;
          const slow = vortexSlow.get(enemy.id);
          
          return {
            ...enemy,
            health: enemy.health - damage,
            slowTimer: slow ? Math.max(enemy.slowTimer || 0, slow.timer) : enemy.slowTimer,
            slowAmount: slow ? Math.min(enemy.slowAmount || 1, slow.amount) : enemy.slowAmount
          };
        }));
      }

      // Update projectiles
      setProjectiles(prev => {
        const remainingProjectiles = [];
        const enemyDamage = new Map(); // Track damage to apply
        const enemySlow = new Map(); // Track slow to apply
        const enemyBurn = new Map(); // Track burn to apply
        const enemyPoison = new Map(); // Track poison to apply
        const newExplosions = [];

        for (const proj of prev) {
          const target = enemiesRef.current.find(e => e.id === proj.targetId);
          if (!target) continue;

          const dx = target.x - proj.x;
          const dy = target.y - proj.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 0.5) {
            // Hit! Record damage
            const currentDmg = enemyDamage.get(target.id) || 0;
            enemyDamage.set(target.id, currentDmg + proj.damage);
            
            if (proj.slow) {
              enemySlow.set(target.id, { timer: 5000, amount: proj.slow });
            }

            if (proj.burn) {
              enemyBurn.set(target.id, 3000); // 3 seconds of burn
            }

            if (proj.poison) {
              enemyPoison.set(target.id, 4000); // 4 seconds of poison
            }

            // Chain lightning effect
            if (proj.chain && proj.chain > 0) {
              let chainCount = proj.chain;
              let lastTarget = target;
              const hitTargets = new Set([target.id]);
              
              while (chainCount > 0) {
                let nearestEnemy = null;
                let nearestDist = 3; // Chain range
                
                for (const enemy of enemiesRef.current) {
                  if (hitTargets.has(enemy.id)) continue;
                  const cdx = enemy.x - lastTarget.x;
                  const cdy = enemy.y - lastTarget.y;
                  const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
                  if (cdist < nearestDist) {
                    nearestDist = cdist;
                    nearestEnemy = enemy;
                  }
                }
                
                if (nearestEnemy) {
                  hitTargets.add(nearestEnemy.id);
                  const chainDmg = enemyDamage.get(nearestEnemy.id) || 0;
                  enemyDamage.set(nearestEnemy.id, chainDmg + proj.damage * 0.7);
                  lastTarget = nearestEnemy;
                  chainCount--;
                } else {
                  break;
                }
              }
            }

            // Splash damage and explosion
            if (proj.splash) {
              // Create explosion effect
              newExplosions.push({
                id: Date.now() + Math.random(),
                x: target.x,
                y: target.y,
                radius: proj.splash,
                startTime: now,
                duration: 400
              });
              
              for (const enemy of enemiesRef.current) {
                if (enemy.id !== target.id) {
                  const splashDx = enemy.x - target.x;
                  const splashDy = enemy.y - target.y;
                  const splashDist = Math.sqrt(splashDx * splashDx + splashDy * splashDy);
                  if (splashDist <= proj.splash) {
                    const currentDmg = enemyDamage.get(enemy.id) || 0;
                    // 50% splash damage to nearby enemies
                    enemyDamage.set(enemy.id, currentDmg + proj.damage * 0.5);
                  }
                }
              }
            }
          } else {
            // Move projectile
            remainingProjectiles.push({
              ...proj,
              x: proj.x + (dx / dist) * proj.speed * (delta / 1000) * 10,
              y: proj.y + (dy / dist) * proj.speed * (delta / 1000) * 10
            });
          }
        }

        // Add new explosions
        if (newExplosions.length > 0) {
          setExplosions(e => [...e, ...newExplosions]);
        }

        // Apply damage to enemies
        if (enemyDamage.size > 0 || enemySlow.size > 0 || enemyBurn.size > 0 || enemyPoison.size > 0) {
          const newSplitEnemies = [];
          
          setEnemies(enemies => {
            const updatedEnemies = enemies.map(enemy => {
              let damage = enemyDamage.get(enemy.id) || 0;
              const slow = enemySlow.get(enemy.id);
              
              // Phasing enemies take 50% less damage from normal attacks
              if (enemy.phasing && damage > 0) {
                damage = damage * 0.5;
              }
              
              // Apply armor reduction
              if (enemy.armor && damage > 0) {
                damage = damage * (1 - enemy.armor);
              }
              
              // Shield absorbs damage first
              let currentShield = enemy.currentShield ?? enemy.shield ?? 0;
              if (currentShield > 0 && damage > 0) {
                const shieldDamage = Math.min(currentShield, damage);
                currentShield -= shieldDamage;
                damage -= shieldDamage;
              }
              
              const newHealth = enemy.health - damage;
              
              if (newHealth <= 0 && enemy.health > 0) {
                // Splitter spawns two smaller enemies
                if (enemy.splits && !enemy.isSplit) {
                  const diff = difficultyRef.current ? DIFFICULTIES[difficultyRef.current] : DIFFICULTIES.medium;
                  for (let i = 0; i < 2; i++) {
                    newSplitEnemies.push({
                      id: Date.now() + Math.random(),
                      type: 'basic',
                      ...ENEMY_TYPES.basic,
                      x: enemy.x + (i === 0 ? -0.3 : 0.3),
                      y: enemy.y,
                      pathIndex: enemy.pathIndex,
                      health: ENEMY_TYPES.basic.health * 0.5 * diff.enemyHealthMult,
                      maxHealth: ENEMY_TYPES.basic.health * 0.5 * diff.enemyHealthMult,
                      isSplit: true
                    });
                  }
                }
                
                // Enemy killed - apply combo bonus
                const timeSinceLastKill = now - lastKillTime;
                let newCombo = timeSinceLastKill < 2000 ? combo + 1 : 1;
                const comboBonus = Math.floor(enemy.reward * (newCombo * 0.1));
                let totalReward = enemy.reward + comboBonus;
                
                // Gold rush doubles gold
                const goldRushActive = abilitiesRef.current.goldRush?.active;
                if (goldRushActive) totalReward *= 2;
                // Gold magnet triples gold
                if (activePowerups.magnet && activePowerups.magnet > now) totalReward *= 3;
                
                setCombo(newCombo);
                setMaxCombo(m => Math.max(m, newCombo));
                setLastKillTime(now);
                setTotalKills(k => k + 1);
                setTotalGoldEarned(g => g + totalReward);
                setGold(g => g + totalReward);
                
                // Random chance to drop a power-up (10% base, higher for bosses)
                const dropChance = enemy.type === 'boss' || enemy.type === 'titan' ? 1.0 : 
                                   enemy.type === 'armored' || enemy.type === 'tank' ? 0.25 : 0.08;
                if (Math.random() < dropChance) {
                  const powerupKeys = Object.keys(POWERUPS);
                  const powerupKey = powerupKeys[Math.floor(Math.random() * powerupKeys.length)];
                  setDroppedPowerups(prev => [...prev, {
                    id: Date.now() + Math.random(),
                    x: enemy.x,
                    y: enemy.y,
                    type: powerupKey,
                    ...POWERUPS[powerupKey],
                    spawnTime: now,
                    lifetime: 10000 // Disappear after 10s
                  }]);
                }
                
                // Floating text for gold earned
                setFloatingTexts(prev => [...prev, {
                  id: Date.now() + Math.random(),
                  x: enemy.x,
                  y: enemy.y,
                  text: goldRushActive ? `+${totalReward} 💎` : `+${totalReward}`,
                  color: goldRushActive ? '#a855f7' : comboBonus > 0 ? '#fbbf24' : '#22c55e',
                  startTime: now
                }]);
                
                // Show combo text if combo > 1
                if (newCombo > 1) {
                  setFloatingTexts(prev => [...prev, {
                    id: Date.now() + Math.random(),
                    x: enemy.x,
                    y: enemy.y - 0.5,
                    text: `${newCombo}x COMBO!`,
                    color: '#f97316',
                    startTime: now
                  }]);
                }
              }

              return {
                ...enemy,
                health: newHealth,
                currentShield,
                lastShieldDamage: damage > 0 ? now : enemy.lastShieldDamage,
                slowTimer: slow ? slow.timer : enemy.slowTimer,
                slowAmount: slow ? slow.amount : enemy.slowAmount,
                burnTimer: enemyBurn.get(enemy.id) || enemy.burnTimer,
                poisonTimer: enemyPoison.get(enemy.id) || enemy.poisonTimer
              };
            });
            
            // Add split enemies
            if (newSplitEnemies.length > 0) {
              return [...updatedEnemies, ...newSplitEnemies];
            }
            return updatedEnemies;
          });
        }

        return remainingProjectiles;
      });

      // Update explosions
      setExplosions(prev => prev.filter(exp => now - exp.startTime < exp.duration));
      
      // Update floating texts
      setFloatingTexts(prev => prev.filter(ft => now - ft.startTime < 1000));

      // Update pawns - they fight enemies
      setPawns(prev => {
        const pawnDamageToEnemies = new Map();
        const path = pathRef.current;
        
        const updatedPawns = prev.map(pawn => {
          // Find nearest enemy
          let nearestEnemy = null;
          let nearestDist = Infinity;
          
          enemiesRef.current.forEach(enemy => {
            const dx = enemy.x - pawn.x;
            const dy = enemy.y - pawn.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < nearestDist) {
              nearestDist = dist;
              nearestEnemy = enemy;
            }
          });
          
          // Attack enemy if close enough and cooldown ready
          if (nearestEnemy && nearestDist < 0.8 && now - pawn.lastAttack >= pawn.attackRate / speedMult) {
            const currentDmg = pawnDamageToEnemies.get(nearestEnemy.id) || 0;
            pawnDamageToEnemies.set(nearestEnemy.id, currentDmg + pawn.damage);
            return { ...pawn, lastAttack: now };
          }
          
          // Move forward along path towards enemies
          const moveSpeed = 2 * (delta / 1000) * speedMult;
          
          // If enemy is nearby, move directly towards it
          if (nearestEnemy && nearestDist < 3) {
            const dx = nearestEnemy.x - pawn.x;
            const dy = nearestEnemy.y - pawn.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0.3) {
              return {
                ...pawn,
                x: pawn.x + (dx / dist) * moveSpeed,
                y: pawn.y + (dy / dist) * moveSpeed
              };
            }
          } else {
            // Move forward along the path (toward where enemies come from)
            // Find current position on path and move toward higher path indices (toward end)
            let currentPathIdx = pawn.pathIndex;
            
            // Move toward lower path indices (toward enemy spawn) to intercept
            if (currentPathIdx > 0) {
              const targetIdx = Math.max(0, currentPathIdx - 1);
              const targetX = path[targetIdx][0];
              const targetY = path[targetIdx][1];
              const dx = targetX - pawn.x;
              const dy = targetY - pawn.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              
              if (dist < 0.2) {
                // Reached this path point, move to next
                return { ...pawn, pathIndex: targetIdx, x: targetX, y: targetY };
              } else if (dist > 0) {
                return {
                  ...pawn,
                  x: pawn.x + (dx / dist) * moveSpeed,
                  y: pawn.y + (dy / dist) * moveSpeed
                };
              }
            }
          }
          
          return pawn;
        });
        
        // Apply pawn damage to enemies
        if (pawnDamageToEnemies.size > 0) {
          setEnemies(enemies => enemies.map(enemy => {
            const damage = pawnDamageToEnemies.get(enemy.id) || 0;
            if (damage > 0) {
              const newHealth = enemy.health - damage;
              if (newHealth <= 0 && enemy.health > 0) {
                setGold(g => g + enemy.reward);
              }
              return { ...enemy, health: newHealth };
            }
            return enemy;
          }));
        }
        
        // Remove dead pawns (pawns take damage from enemies they're blocking)
        return updatedPawns.map(pawn => {
          let damageTaken = 0;
          enemiesRef.current.forEach(enemy => {
            const dx = enemy.x - pawn.x;
            const dy = enemy.y - pawn.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 0.8) {
              damageTaken += 8 * (delta / 1000); // Take damage over time from nearby enemies
            }
          });
          return { ...pawn, health: pawn.health - damageTaken };
        }).filter(pawn => pawn.health > 0);
      });

      // Check wave complete
      if (enemiesRef.current.length === 0 && spawnQueueRef.current.length === 0 && gameState === 'playing') {
        const diff = DIFFICULTIES[difficultyRef.current] || DIFFICULTIES.medium;
        // Calculate bank income
        let bankIncome = 0;
        towersRef.current.forEach(tower => {
          if (tower.income) {
            // Base income * 2^(level-1) for doubling each upgrade
            bankIncome += tower.income * Math.pow(2, tower.level - 1);
          }
        });
        
        // Check for perfect wave (no lives lost)
        if (lives === livesAtWaveStart) {
          setPerfectWaves(p => p + 1);
          setFloatingTexts(prev => [...prev, {
            id: Date.now(),
            x: GRID_WIDTH / 2,
            y: GRID_HEIGHT / 2,
            text: '✨ PERFECT WAVE! +50 bonus ✨',
            color: '#fbbf24',
            startTime: now
          }]);
          setGold(g => g + diff.waveGold + bankIncome + 50);
          setPlayerXP(xp => xp + 75); // Bonus XP for perfect wave
        } else {
          setGold(g => g + diff.waveGold + bankIncome);
          setPlayerXP(xp => xp + 50); // Base XP per wave
        }
        
        setTotalWavesCompleted(w => w + 1);
        setPawns([]); // Clear all pawns at end of round
        setGameState('waiting');
        
        // Create wave summary
        setWaveSummary({
          wave: wave,
          goldEarned: gold - waveStartGold + (lives === livesAtWaveStart ? diff.waveGold + bankIncome + 50 : diff.waveGold + bankIncome),
          kills: totalKills - waveStartKills,
          livesLost: livesAtWaveStart - lives,
          perfect: lives === livesAtWaveStart,
          bankIncome: bankIncome
        });
        setTimeout(() => setWaveSummary(null), 5000);
        
        // Decrement temp damage boost
        if (tempDamageBoostWaves > 0) {
          setTempDamageBoostWaves(w => w - 1);
          if (tempDamageBoostWaves === 1) setTempDamageBoost(0);
        }
        
        // Auto-start next wave after 3 seconds if enabled
        if (autoStartWaves) {
          setTimeout(() => {
            if (gameState === 'waiting' || gameState === 'playing') {
              // Will trigger startWave in next render
              setSpawnIndicator(true);
              setTimeout(() => setSpawnIndicator(false), 500);
            }
          }, 3000);
        }
      }
      
      // Update particles
      setParticles(prev => prev.filter(p => now - p.startTime < 1000));
      
      // Clean up expired powerups
      setDroppedPowerups(prev => prev.filter(p => now - p.spawnTime < p.lifetime));

      gameLoopRef.current = requestAnimationFrame(gameLoop);
    };

    gameLoopRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(gameLoopRef.current);
  }, [gameState]);

  // Check game over or win
  useEffect(() => {
    if (lives <= 0) {
      setGameState('gameover');
    }
  }, [lives]);

  // Check win condition
  useEffect(() => {
    const diff = DIFFICULTIES[selectedDifficulty];
    if (diff && diff.maxWaves !== Infinity && wave >= diff.maxWaves && gameState === 'waiting' && enemies.length === 0) {
      setGameState('victory');
    }
  }, [wave, gameState, enemies, selectedDifficulty]);

  const handleCellClick = (x, y) => {
    // Check for powerup pickup first
    const powerup = droppedPowerups.find(p => Math.round(p.x) === x && Math.round(p.y) === y);
    if (powerup) {
      // Apply powerup effect
      switch (powerup.effect) {
        case 'gold':
          setGold(g => g + 50);
          setFloatingTexts(prev => [...prev, {
            id: Date.now(), x: powerup.x, y: powerup.y, 
            text: '+50 💰', color: '#fbbf24', startTime: Date.now()
          }]);
          break;
        case 'life':
          const diff = DIFFICULTIES[selectedDifficulty] || DIFFICULTIES.medium;
          setLives(l => Math.min(diff.lives, l + 1));
          setFloatingTexts(prev => [...prev, {
            id: Date.now(), x: powerup.x, y: powerup.y,
            text: '+1 ❤️', color: '#ef4444', startTime: Date.now()
          }]);
          break;
        case 'bomb':
          setEnemies(prev => prev.map(e => ({ ...e, health: e.health - 100 })));
          setScreenShake(15);
          setTimeout(() => setScreenShake(0), 200);
          break;
        case 'speed':
          setActivePowerups(prev => ({ ...prev, speed: Date.now() + 5000 }));
          break;
        case 'shield':
          setActivePowerups(prev => ({ ...prev, shield: 3 }));
          break;
        case 'magnet':
          setActivePowerups(prev => ({ ...prev, magnet: Date.now() + 10000 }));
          break;
      }
      // Remove the powerup
      setDroppedPowerups(prev => prev.filter(p => p.id !== powerup.id));
      return;
    }
    
    const existingTower = towers.find(t => t.x === x && t.y === y);
    if (existingTower) {
      setSelectedPlacedTower(existingTower.id === selectedPlacedTower ? null : existingTower.id);
    } else if (canPlaceTower(x, y)) {
      placeTower(x, y);
    }
  };

  const restart = () => {
    const diff = DIFFICULTIES[selectedDifficulty] || DIFFICULTIES.medium;
    setGold(diff.startGold);
    setLives(diff.lives);
    setWave(0);
    setTowers([]);
    setEnemies([]);
    setProjectiles([]);
    setExplosions([]);
    setPawns([]);
    setFloatingTexts([]);
    setCombo(0);
    setMaxCombo(0);
    setTotalKills(0);
    setTotalGoldEarned(0);
    setGameState('waiting');
    spawnQueueRef.current = [];
  };

  const startGame = () => {
    const diff = DIFFICULTIES[selectedDifficulty];
    setGold(diff.startGold);
    setLives(diff.lives);
    setGameState('waiting');
    
    // Generate random quest
    const quests = [
      { id: 'kill50', name: 'Kill 50 enemies', target: 50, reward: 200, type: 'kills', icon: '⚔️' },
      { id: 'combo7', name: 'Get a 7x combo', target: 7, reward: 150, type: 'combo', icon: '🔥' },
      { id: 'build5', name: 'Build 5 towers', target: 5, reward: 100, type: 'towers', icon: '🗼' },
      { id: 'noLives', name: 'Complete 3 perfect waves', target: 3, reward: 250, type: 'perfect', icon: '✨' },
      { id: 'gold500', name: 'Earn 500 gold from kills', target: 500, reward: 200, type: 'gold', icon: '💰' },
    ];
    setActiveQuest(quests[Math.floor(Math.random() * quests.length)]);
    setQuestProgress(0);
  };

  // Check quest progress
  useEffect(() => {
    if (!activeQuest) return;
    let progress = 0;
    switch (activeQuest.type) {
      case 'kills': progress = totalKills; break;
      case 'combo': progress = maxCombo; break;
      case 'towers': progress = towers.length; break;
      case 'perfect': progress = perfectWaves; break;
      case 'gold': progress = totalGoldEarned; break;
    }
    setQuestProgress(Math.min(progress, activeQuest.target));
    
    // Quest completed - give reward
    if (progress >= activeQuest.target && questProgress < activeQuest.target) {
      setGold(g => g + activeQuest.reward);
      setFloatingTexts(prev => [...prev, {
        id: Date.now(),
        x: GRID_WIDTH / 2,
        y: GRID_HEIGHT / 2,
        text: `Quest Complete! +${activeQuest.reward} 💰`,
        color: '#fbbf24',
        startTime: Date.now()
      }]);
      setPlayerXP(xp => xp + 100);
    }
  }, [totalKills, maxCombo, towers.length, perfectWaves, totalGoldEarned, activeQuest]);

  // Level up check
  useEffect(() => {
    const xpNeeded = playerLevel * 200;
    if (playerXP >= xpNeeded) {
      setPlayerLevel(l => l + 1);
      setPlayerXP(xp => xp - xpNeeded);
      setFloatingTexts(prev => [...prev, {
        id: Date.now(),
        x: GRID_WIDTH / 2,
        y: GRID_HEIGHT / 2 - 1,
        text: `LEVEL UP! Level ${playerLevel + 1}`,
        color: '#a855f7',
        startTime: Date.now()
      }]);
    }
  }, [playerXP, playerLevel]);

  // Start Screen
  if (gameState === 'start') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center overflow-auto py-8">
        <div className="text-center">
          <h1 className="text-6xl font-bold text-white mb-4">
            🏰 Tower Defense
          </h1>
          <p className="text-xl text-slate-400 mb-8">
            Defend your base from waves of enemies!
          </p>
          
          {!showDifficultySelect ? (
            <>
              <div className="bg-slate-800 rounded-xl p-6 mb-6 max-w-md mx-auto">
                <h2 className="text-xl font-bold text-white mb-4">How to Play</h2>
                <div className="text-left text-slate-300 space-y-2">
                  <p>🏹 <span className="text-green-400">Arrow</span> - Fast attacks, balanced damage</p>
                  <p>💣 <span className="text-orange-400">Cannon</span> - Splash damage, hits groups</p>
                  <p>🎯 <span className="text-violet-400">Sniper</span> - Long range, high damage</p>
                  <p>❄️ <span className="text-cyan-400">Frost</span> - Slows enemies down</p>
                  <p>⚔️ <span className="text-yellow-400">Barracks</span> - Spawns pawns to fight</p>
                  <p>💰 <span className="text-emerald-400">Bank</span> - Earns gold each wave</p>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-700 text-slate-400 text-sm">
                  <p>• Click to place towers</p>
                  <p>• Click towers to upgrade or sell</p>
                  <p>• Kill fast for combo bonuses!</p>
                  <p>• Don't let enemies reach the castle!</p>
                </div>
              </div>

              {/* Map Selection */}
              <div className="bg-slate-800 rounded-xl p-6 mb-8 max-w-4xl mx-auto">
                <h2 className="text-xl font-bold text-white mb-4">Select Map</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {Object.entries(MAPS).map(([key, map]) => (
                    <button
                      key={key}
                      onClick={() => setSelectedMap(key)}
                      className={`p-3 rounded-lg text-left transition-all ${
                        selectedMap === key
                          ? 'bg-emerald-600 ring-2 ring-emerald-400 scale-105'
                          : 'bg-slate-700 hover:bg-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-white">{map.name}</div>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          map.difficulty === 'Easy' ? 'bg-green-600' :
                          map.difficulty === 'Medium' ? 'bg-yellow-600' :
                          'bg-red-600'
                        }`}>{map.difficulty || 'Medium'}</span>
                      </div>
                      <div className="text-xs text-slate-300 mt-1">{map.description}</div>
                      <div className="text-xs text-slate-400 mt-1">📍 {map.path.length} tiles</div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setShowDifficultySelect(true)}
                className="px-12 py-4 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold text-white text-2xl transition-all transform hover:scale-105 shadow-lg shadow-emerald-600/30"
              >
                Next →
              </button>
            </>
          ) : (
            <>
              {/* Difficulty Selection */}
              <div className="bg-slate-800 rounded-xl p-6 mb-8 max-w-2xl mx-auto">
                <h2 className="text-xl font-bold text-white mb-4">Select Difficulty</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {Object.entries(DIFFICULTIES).map(([key, diff]) => (
                    <button
                      key={key}
                      onClick={() => setSelectedDifficulty(key)}
                      className={`p-4 rounded-lg text-left transition-all ${
                        selectedDifficulty === key
                          ? 'bg-emerald-600 ring-2 ring-emerald-400'
                          : 'bg-slate-700 hover:bg-slate-600'
                      }`}
                    >
                      <div className="font-bold text-white text-lg">{diff.emoji} {diff.name}</div>
                      <div className="text-sm text-slate-300">{diff.description}</div>
                      <div className="text-xs text-slate-400 mt-2">
                        <span>💰 {diff.startGold}</span>
                        <span className="ml-2">❤️ {diff.lives}</span>
                        {diff.maxWaves !== Infinity && <span className="ml-2">🌊 {diff.maxWaves}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Hero Selection */}
              <div className="bg-slate-800 rounded-xl p-6 mb-8 max-w-3xl mx-auto">
                <h2 className="text-xl font-bold text-white mb-4">Choose Your Hero</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {Object.entries(HEROES).map(([key, hero]) => (
                    <button
                      key={key}
                      onClick={() => setSelectedHero(key)}
                      className={`p-3 rounded-lg text-center transition-all ${
                        selectedHero === key
                          ? 'ring-2 ring-white scale-105'
                          : 'bg-slate-700 hover:bg-slate-600'
                      }`}
                      style={{ backgroundColor: selectedHero === key ? hero.color : undefined }}
                    >
                      <div className="text-3xl mb-1">{hero.icon}</div>
                      <div className="font-bold text-white text-sm">{hero.name}</div>
                      <div className="text-xs text-slate-300 mt-1">{hero.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setShowDifficultySelect(false)}
                  className="px-8 py-4 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold text-white text-xl transition-all"
                >
                  ← Back
                </button>
                <button
                  onClick={startGame}
                  disabled={!selectedDifficulty || !selectedHero}
                  className="px-12 py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-xl font-bold text-white text-2xl transition-all transform hover:scale-105 shadow-lg shadow-emerald-600/30"
                >
                  ▶ Start Game
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-4 flex flex-col items-center">
      <div className="mb-4 flex items-center gap-6 text-white">
        <button
          onClick={() => {
            setGameState('start');
            setShowDifficultySelect(false);
            setSelectedDifficulty(null);
            setGold(200);
            setLives(20);
            setWave(0);
            setTowers([]);
            setEnemies([]);
            setProjectiles([]);
            setExplosions([]);
            setPawns([]);
            spawnQueueRef.current = [];
          }}
          className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold transition-all flex items-center gap-1"
        >
          🏠 Home
        </button>
        <div className="flex items-center gap-2">
          <span className="text-yellow-400 text-xl">💰</span>
          <span className="font-bold text-xl">{gold}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-red-400 text-xl">❤️</span>
          <span className="font-bold text-xl">{lives}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-blue-400 text-xl">🌊</span>
          <span className="font-bold text-xl">Wave {wave}</span>
        </div>
        {/* Player Level */}
        <div className="flex items-center gap-1 px-2 py-1 bg-purple-700 rounded-lg">
          <span>⭐</span>
          <span className="text-white text-sm font-bold">Lv {playerLevel}</span>
          <div className="w-12 h-1.5 bg-purple-900 rounded-full overflow-hidden">
            <div 
              className="h-full bg-purple-300 transition-all"
              style={{ width: `${(playerXP / (playerLevel * 200)) * 100}%` }}
            />
          </div>
        </div>
        {combo > 1 && (
          <div className="flex items-center gap-1 px-3 py-1 bg-orange-600 rounded-lg animate-pulse">
            <span className="text-white font-bold">{combo}x COMBO!</span>
          </div>
        )}
        {/* Weather Indicator */}
        <div className="flex items-center gap-1 px-2 py-1 bg-slate-700 rounded-lg">
          <span>{WEATHER_TYPES[currentWeather].icon}</span>
          <span className="text-slate-300 text-sm">{WEATHER_TYPES[currentWeather].name}</span>
        </div>
        {/* Hero Indicator */}
        {selectedHero && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ backgroundColor: HEROES[selectedHero].color }}>
            <span>{HEROES[selectedHero].icon}</span>
            <span className="text-white text-sm font-bold">{HEROES[selectedHero].name.split(' ')[0]}</span>
          </div>
        )}
        {/* Pawn Counter */}
        {pawns.length > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 bg-yellow-700 rounded-lg">
            <span>⚔️</span>
            <span className="text-white text-sm font-bold">{pawns.length} Pawns</span>
          </div>
        )}
        {/* Next Wave Preview */}
        {gameState === 'waiting' && wave < (selectedDifficulty?.maxWaves || 20) && (
          <div className="relative group">
            <div className="flex items-center gap-1 px-2 py-1 bg-slate-700 rounded-lg cursor-help">
              <span className="text-slate-300 text-sm">Next:</span>
              {(() => {
                const preview = getWavePreview(wave + 1);
                const icons = [];
                if (preview.boss > 0) icons.push(<span key="boss" title="Boss">👑{preview.boss}</span>);
                if (preview.tank > 0) icons.push(<span key="tank" title="Tank">🟣{preview.tank}</span>);
                if (preview.armored > 0) icons.push(<span key="armored" title="Armored">🛡️{preview.armored}</span>);
                if (preview.healer > 0) icons.push(<span key="healer" title="Healer">💚{preview.healer}</span>);
                if (preview.fast > 0) icons.push(<span key="fast" title="Fast">⚡{preview.fast}</span>);
                if (preview.swarm > 0) icons.push(<span key="swarm" title="Swarm">🐜{preview.swarm}</span>);
                if (preview.basic > 0) icons.push(<span key="basic" title="Basic">🔴{preview.basic}</span>);
                return <span className="text-xs flex gap-1">{icons.slice(0, 4)}</span>;
              })()}
            </div>
          </div>
        )}
      </div>

      <div className="mb-4 flex gap-2 flex-wrap justify-center">
        {Object.entries(TOWER_TYPES).map(([key, tower]) => (
          <div key={key} className="relative group">
            <button
              onClick={() => setSelectedTower(key)}
              className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                selectedTower === key
                  ? 'ring-2 ring-white scale-105'
                  : 'opacity-80 hover:opacity-100'
              } ${gold >= tower.cost ? '' : 'opacity-50'}`}
              style={{ backgroundColor: tower.color }}
            >
              {tower.name} (${tower.cost})
            </button>
            {/* Tooltip with stats */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30 shadow-lg">
              <div className="font-bold text-base mb-1" style={{ color: tower.color }}>{tower.name} Tower</div>
              <div className="flex flex-col gap-0.5 text-xs">
                {tower.spawnPawn ? (
                  <>
                    <div>⚔️ Spawns: <span className="text-yellow-400 font-semibold">Pawn soldiers</span></div>
                    <div>⏱️ Spawn Rate: <span className="text-yellow-400 font-semibold">8s</span></div>
                    <div>🏰 Spawns at: <span className="text-blue-400 font-semibold">Castle</span></div>
                    <div>🛡️ Pawn HP: <span className="text-green-400 font-semibold">50</span></div>
                    <div>⚔️ Pawn DMG: <span className="text-red-400 font-semibold">15</span></div>
                  </>
                ) : tower.income ? (
                  <>
                    <div>💰 Income: <span className="text-yellow-400 font-semibold">+{tower.income}/wave</span></div>
                    <div>⬆️ Upgrade: <span className="text-emerald-400 font-semibold">Doubles income</span></div>
                    <div>📈 Passive: <span className="text-slate-400 font-semibold">No combat</span></div>
                  </>
                ) : (
                  <>
                    <div>⚔️ Damage: <span className="text-red-400 font-semibold">{tower.damage}</span></div>
                    <div>📏 Range: <span className="text-blue-400 font-semibold">{tower.range} tiles</span></div>
                    <div>⏱️ Cooldown: <span className="text-yellow-400 font-semibold">{tower.fireRate / 1000}s</span></div>
                    {tower.splash && <div>💥 Splash: <span className="text-orange-400 font-semibold">{tower.splash} tile radius</span></div>}
                    {tower.slow && <div>❄️ Slow: <span className="text-cyan-400 font-semibold">{(1 - tower.slow) * 100}%</span></div>}
                  </>
                )}
              </div>
              {/* Arrow pointing down */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-slate-600" />
            </div>
          </div>
        ))}
        <button
          onClick={startWave}
          disabled={gameState === 'playing' || gameState === 'gameover' || gameState === 'victory'}
          className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-600 rounded-lg font-bold text-white transition-all"
        >
          {gameState === 'playing' ? 'Wave in Progress...' : 'Start Wave'}
        </button>
        
        {/* Shop Button */}
        {gameState === 'waiting' && wave > 0 && (
          <button
            onClick={() => setShowShop(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg font-bold text-white transition-all animate-pulse"
          >
            🛒 Shop
          </button>
        )}
        
        {/* Pause Button */}
        {gameState === 'playing' && (
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`px-4 py-2 rounded-lg font-bold transition-all ${
              isPaused 
                ? 'bg-yellow-600 text-white animate-pulse' 
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {isPaused ? '▶ Resume' : '⏸ Pause'}
          </button>
        )}
        
        {/* Speed Controls */}
        <div className="flex gap-1 ml-2">
          <button
            onClick={() => setGameSpeed(1)}
            className={`px-3 py-2 rounded-lg font-bold transition-all ${
              gameSpeed === 1 
                ? 'bg-blue-600 text-white' 
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            1x
          </button>
          <button
            onClick={() => setGameSpeed(2)}
            className={`px-3 py-2 rounded-lg font-bold transition-all ${
              gameSpeed === 2 
                ? 'bg-blue-600 text-white' 
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            2x
          </button>
          <button
            onClick={() => setGameSpeed(3)}
            className={`px-3 py-2 rounded-lg font-bold transition-all ${
              gameSpeed === 3 
                ? 'bg-blue-600 text-white' 
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            3x
          </button>
        </div>
        
        {/* Abilities Bar */}
        <div className="flex gap-2 ml-4 border-l border-slate-600 pl-4">
          {Object.entries(ABILITIES).map(([key, ability]) => {
            const now = Date.now();
            const cooldownRemaining = Math.max(0, ability.cooldown - (now - abilities[key].lastUsed));
            const isOnCooldown = cooldownRemaining > 0;
            const canAfford = gold >= ability.cost;
            const isActive = abilities[key].active;
            
            return (
              <div key={key} className="relative group">
                <button
                  onClick={() => useAbility(key)}
                  disabled={isOnCooldown || !canAfford || gameState !== 'playing'}
                  className={`w-12 h-12 rounded-lg font-bold text-2xl transition-all relative overflow-hidden ${
                    isActive ? 'bg-yellow-500 animate-pulse ring-2 ring-yellow-300' :
                    isOnCooldown ? 'bg-slate-700 opacity-50' :
                    canAfford ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-800 opacity-30'
                  }`}
                >
                  {ability.icon}
                  {isOnCooldown && (
                    <div 
                      className="absolute bottom-0 left-0 right-0 bg-blue-500/50"
                      style={{ height: `${(cooldownRemaining / ability.cooldown) * 100}%` }}
                    />
                  )}
                </button>
                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30">
                  <div className="font-bold">{ability.name} (${ability.cost})</div>
                  <div className="text-slate-300">{ability.description}</div>
                  <div className="text-slate-400">Cooldown: {ability.cooldown / 1000}s</div>
                  <div className="text-yellow-400 mt-1">Press {key === 'nuke' ? 'Q' : key === 'freeze' ? 'W' : key === 'goldRush' ? 'E' : 'R'}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Wave Summary Panel */}
      {waveSummary && (
        <div className="fixed top-1/3 left-1/2 -translate-x-1/2 z-40 animate-bounce">
          <div className="bg-gradient-to-br from-emerald-900 to-blue-900 px-6 py-4 rounded-xl shadow-2xl border-2 border-emerald-500">
            <div className="text-center">
              <div className="text-2xl font-bold text-white mb-2">
                {waveSummary.perfect ? '✨ PERFECT WAVE ✨' : `Wave ${waveSummary.wave} Complete!`}
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-white">
                <div className="text-right text-slate-300">💀 Kills:</div>
                <div className="text-left font-bold">{waveSummary.kills}</div>
                <div className="text-right text-slate-300">💰 Gold:</div>
                <div className="text-left font-bold text-yellow-400">+{waveSummary.goldEarned}</div>
                {waveSummary.bankIncome > 0 && (
                  <>
                    <div className="text-right text-slate-300">🏦 Bank:</div>
                    <div className="text-left font-bold text-green-400">+{waveSummary.bankIncome}</div>
                  </>
                )}
                <div className="text-right text-slate-300">❤️ Lives Lost:</div>
                <div className={`text-left font-bold ${waveSummary.livesLost > 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {waveSummary.livesLost}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Achievement Notification */}
      {newAchievement && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-bounce">
          <div className="bg-gradient-to-r from-yellow-600 to-amber-500 px-6 py-3 rounded-xl shadow-xl border-2 border-yellow-400">
            <div className="text-white font-bold text-lg flex items-center gap-2">
              <span className="text-2xl">{newAchievement.icon}</span>
              <div>
                <div>Achievement Unlocked!</div>
                <div className="text-yellow-200 text-sm">{newAchievement.name}</div>
              </div>
              <span className="text-2xl">🏆</span>
            </div>
          </div>
        </div>
      )}

      {/* Shop Modal */}
      {showShop && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-purple-900 to-indigo-900 rounded-xl p-6 max-w-3xl w-full border-2 border-purple-500 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                🛒 Wave Shop
                <span className="text-yellow-400 text-lg">💰 {gold}</span>
              </h2>
              <button
                onClick={() => setShowShop(false)}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-white font-bold"
              >
                ✕ Close
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(SHOP_ITEMS).map(([key, item]) => {
                const canAfford = gold >= item.cost;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      if (!canAfford) return;
                      setGold(g => g - item.cost);
                      switch (item.effect) {
                        case 'lives':
                          const diff = DIFFICULTIES[selectedDifficulty] || DIFFICULTIES.medium;
                          setLives(l => Math.min(diff.lives, l + item.amount));
                          break;
                        case 'gold':
                          setGold(g => g + item.amount);
                          break;
                        case 'damage':
                          setTempDamageBoost(0.25);
                          setTempDamageBoostWaves(3);
                          break;
                        case 'immunity':
                          setActivePowerups(prev => ({ ...prev, towerImmune: wave + 1 }));
                          break;
                        case 'slow':
                          setActivePowerups(prev => ({ ...prev, waveSlowStart: Date.now() + 15000 }));
                          break;
                        case 'mystery':
                          // Random reward
                          const rewards = [
                            () => setGold(g => g + 500),
                            () => { const d = DIFFICULTIES[selectedDifficulty] || DIFFICULTIES.medium; setLives(l => Math.min(d.lives, l + 5)); },
                            () => setPlayerXP(xp => xp + 200),
                            () => setGold(g => g + 100),
                          ];
                          rewards[Math.floor(Math.random() * rewards.length)]();
                          break;
                      }
                      setFloatingTexts(prev => [...prev, {
                        id: Date.now(),
                        x: GRID_WIDTH / 2,
                        y: GRID_HEIGHT / 2,
                        text: `${item.icon} ${item.name}!`,
                        color: '#a855f7',
                        startTime: Date.now()
                      }]);
                    }}
                    disabled={!canAfford}
                    className={`p-3 rounded-lg text-left transition-all ${
                      canAfford
                        ? 'bg-slate-700 hover:bg-slate-600 hover:scale-105'
                        : 'bg-slate-800 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="text-3xl mb-1">{item.icon}</div>
                    <div className="font-bold text-white">{item.name}</div>
                    <div className="text-xs text-slate-300 mt-1">{item.description}</div>
                    <div className={`mt-2 text-sm font-bold ${canAfford ? 'text-yellow-400' : 'text-red-400'}`}>
                      💰 {item.cost}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Active Powerup Indicators */}
      {(activePowerups.speed > Date.now() || activePowerups.magnet > Date.now() || activePowerups.shield > 0) && (
        <div className="fixed top-20 right-4 flex flex-col gap-2 z-40">
          {activePowerups.speed > Date.now() && (
            <div className="bg-blue-600 px-3 py-1 rounded-lg text-white font-bold text-sm animate-pulse">
              ⚡ Speed Boost: {Math.ceil((activePowerups.speed - Date.now()) / 1000)}s
            </div>
          )}
          {activePowerups.magnet > Date.now() && (
            <div className="bg-purple-600 px-3 py-1 rounded-lg text-white font-bold text-sm animate-pulse">
              🧲 Gold Magnet: {Math.ceil((activePowerups.magnet - Date.now()) / 1000)}s
            </div>
          )}
          {activePowerups.shield > 0 && (
            <div className="bg-cyan-600 px-3 py-1 rounded-lg text-white font-bold text-sm animate-pulse">
              🛡️ Shield: {activePowerups.shield}
            </div>
          )}
          {tempDamageBoostWaves > 0 && (
            <div className="bg-red-600 px-3 py-1 rounded-lg text-white font-bold text-sm animate-pulse">
              ⚔️ War Cry: {tempDamageBoostWaves} waves
            </div>
          )}
        </div>
      )}

      {/* Active Quest Display */}
      {activeQuest && questProgress < activeQuest.target && (
        <div className="w-full max-w-xl mx-auto mb-2">
          <div className="bg-gradient-to-r from-purple-800 to-indigo-800 rounded-lg p-2 border border-purple-500/50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-white font-bold flex items-center gap-1 text-sm">
                <span>📜 Quest:</span>
                <span>{activeQuest.icon} {activeQuest.name}</span>
              </span>
              <span className="text-yellow-300 text-xs">Reward: +{activeQuest.reward}💰</span>
            </div>
            <div className="h-2 bg-purple-950 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-purple-400 to-pink-400 transition-all"
                style={{ width: `${(questProgress / activeQuest.target) * 100}%` }}
              />
            </div>
            <div className="text-xs text-purple-200 mt-1">{questProgress} / {activeQuest.target}</div>
          </div>
        </div>
      )}

      {/* Boss Health Bar */}
      {enemies.some(e => e.type === 'boss' || e.type === 'titan') && (
        <div className="w-full max-w-xl mx-auto mb-2">
          {enemies.filter(e => e.type === 'boss' || e.type === 'titan').map(boss => (
            <div key={boss.id} className="bg-slate-800 rounded-lg p-2 border border-red-500/50">
              <div className="flex items-center justify-between mb-1">
                <span className="text-white font-bold flex items-center gap-1">
                  {boss.type === 'titan' ? '👹' : '👑'} {boss.type === 'titan' ? 'TITAN' : 'BOSS'}
                  {boss.elite && <span className="text-xs">{boss.eliteIcon}</span>}
                </span>
                <span className="text-red-400 text-sm">{Math.ceil(boss.health)} / {boss.maxHealth}</span>
              </div>
              <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all"
                  style={{ width: `${(boss.health / boss.maxHealth) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Game Options Bar */}
      <div className="flex gap-4 mb-2 text-sm">
        <label className="flex items-center gap-1 text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={autoStartWaves}
            onChange={(e) => setAutoStartWaves(e.target.checked)}
            className="rounded"
          />
          Auto-Start Waves
        </label>
        <label className="flex items-center gap-1 text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={showDamageNumbers}
            onChange={(e) => setShowDamageNumbers(e.target.checked)}
            className="rounded"
          />
          Damage Numbers
        </label>
        <label className="flex items-center gap-1 text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={showRangePreview}
            onChange={(e) => setShowRangePreview(e.target.checked)}
            className="rounded"
          />
          Range Preview
        </label>
      </div>

      <div className="flex gap-4">
        {/* Mini-map */}
        {showMiniMap && (
          <div className="bg-slate-800 rounded-lg p-2 border border-slate-600">
            <div className="text-xs text-slate-400 mb-1 text-center">Mini-Map</div>
            <div 
              className="relative bg-slate-900 rounded"
              style={{ width: 120, height: 80 }}
            >
              {/* Path on mini-map */}
              {currentPath.map(([x, y], i) => (
                <div
                  key={i}
                  className="absolute bg-amber-700"
                  style={{
                    left: (x / GRID_WIDTH) * 120,
                    top: (y / GRID_HEIGHT) * 80,
                    width: 3,
                    height: 3
                  }}
                />
              ))}
              {/* Towers on mini-map */}
              {towers.map(tower => (
                <div
                  key={tower.id}
                  className="absolute rounded-full"
                  style={{
                    left: (tower.x / GRID_WIDTH) * 120,
                    top: (tower.y / GRID_HEIGHT) * 80,
                    width: 4,
                    height: 4,
                    backgroundColor: tower.color
                  }}
                />
              ))}
              {/* Enemies on mini-map */}
              {enemies.map(enemy => (
                <div
                  key={enemy.id}
                  className="absolute rounded-full bg-red-500"
                  style={{
                    left: (enemy.x / GRID_WIDTH) * 120,
                    top: (enemy.y / GRID_HEIGHT) * 80,
                    width: enemy.type === 'boss' || enemy.type === 'titan' ? 6 : 3,
                    height: enemy.type === 'boss' || enemy.type === 'titan' ? 6 : 3
                  }}
                />
              ))}
            </div>
          </div>
        )}

      <div 
        className="relative bg-slate-800 rounded-lg overflow-hidden transition-transform"
        style={{ 
          width: GRID_WIDTH * CELL_SIZE, 
          height: GRID_HEIGHT * CELL_SIZE,
          transform: screenShake ? `translate(${Math.random() * screenShake - screenShake/2}px, ${Math.random() * screenShake - screenShake/2}px)` : 'none'
        }}
      >
        {/* Weather Visual Overlay */}
        {currentWeather === 'rain' && (
          <div className="absolute inset-0 pointer-events-none z-40 opacity-30">
            {Array.from({ length: 50 }).map((_, i) => (
              <div
                key={i}
                className="absolute w-0.5 h-4 bg-blue-400 animate-pulse"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 2}s`,
                  transform: 'rotate(15deg)'
                }}
              />
            ))}
          </div>
        )}
        {currentWeather === 'fog' && (
          <div className="absolute inset-0 pointer-events-none z-40 bg-gray-400/30" />
        )}
        {currentWeather === 'storm' && (
          <div className="absolute inset-0 pointer-events-none z-40">
            <div className="absolute inset-0 bg-purple-900/20 animate-pulse" />
          </div>
        )}
        {currentWeather === 'wind' && (
          <div className="absolute inset-0 pointer-events-none z-40 opacity-20">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="absolute h-0.5 bg-white animate-pulse"
                style={{
                  width: '30px',
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 2}s`
                }}
              />
            ))}
          </div>
        )}

        {/* Pause Overlay */}
        {isPaused && (
          <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl font-bold text-white mb-4">⏸ PAUSED</div>
              <button
                onClick={() => setIsPaused(false)}
                className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold text-white text-xl"
              >
                Resume
              </button>
            </div>
          </div>
        )}

        {/* Grid */}
        {Array.from({ length: GRID_HEIGHT }).map((_, y) =>
          Array.from({ length: GRID_WIDTH }).map((_, x) => {
            const isPath = isPathCell(x, y);
            const hasTower = towers.some(t => t.x === x && t.y === y);
            const canPlace = canPlaceTower(x, y);
            const isHovered = hoveredCell?.x === x && hoveredCell?.y === y;
            
            return (
              <div
                key={`${x}-${y}`}
                className={`absolute border border-slate-700/30 transition-colors cursor-pointer ${
                  isPath ? 'bg-amber-900/60' : 
                  hasTower ? '' :
                  isHovered && canPlace ? 'bg-green-900/40' :
                  isHovered && !canPlace ? 'bg-red-900/40' :
                  'bg-slate-800 hover:bg-slate-700/50'
                }`}
                style={{
                  left: x * CELL_SIZE,
                  top: y * CELL_SIZE,
                  width: CELL_SIZE,
                  height: CELL_SIZE
                }}
                onClick={() => handleCellClick(x, y)}
                onMouseEnter={() => setHoveredCell({ x, y })}
                onMouseLeave={() => setHoveredCell(null)}
              />
            );
          })
        )}

        {/* Spawn Portal (Start) */}
        <div
          className="absolute flex items-center justify-center"
          style={{
            left: currentPath[0][0] * CELL_SIZE,
            top: currentPath[0][1] * CELL_SIZE,
            width: CELL_SIZE,
            height: CELL_SIZE
          }}
        >
          <div className="relative">
            {/* Portal ring */}
            <div className="w-7 h-7 rounded-full bg-purple-900 border-2 border-purple-500 animate-pulse" />
            <div className="absolute inset-1 rounded-full bg-purple-600 opacity-60" />
            <div className="absolute inset-2 rounded-full bg-purple-400 opacity-40" />
          </div>
        </div>

        {/* Castle to Protect (End) */}
        <div
          className="absolute flex items-center justify-center"
          style={{
            left: currentPath[currentPath.length-1][0] * CELL_SIZE - CELL_SIZE/2,
            top: currentPath[currentPath.length-1][1] * CELL_SIZE - CELL_SIZE/2,
            width: CELL_SIZE * 2,
            height: CELL_SIZE * 2
          }}
        >
          <div className="relative">
            {/* Castle base */}
            <div className="w-14 h-12 bg-stone-600 rounded-t-sm relative">
              {/* Castle towers */}
              <div className="absolute -top-3 left-0 w-4 h-6 bg-stone-500 rounded-t-sm">
                <div className="absolute top-0 left-0 w-1.5 h-2 bg-stone-400" />
                <div className="absolute top-0 right-0 w-1.5 h-2 bg-stone-400" />
              </div>
              <div className="absolute -top-3 right-0 w-4 h-6 bg-stone-500 rounded-t-sm">
                <div className="absolute top-0 left-0 w-1.5 h-2 bg-stone-400" />
                <div className="absolute top-0 right-0 w-1.5 h-2 bg-stone-400" />
              </div>
              {/* Center tower */}
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-5 h-8 bg-stone-500 rounded-t-sm">
                <div className="absolute top-0 left-0 w-1.5 h-2 bg-stone-400" />
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-2 bg-stone-400" />
                <div className="absolute top-0 right-0 w-1.5 h-2 bg-stone-400" />
                {/* Flag */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <div className="w-0.5 h-4 bg-stone-700" />
                  <div className="absolute top-0 left-0.5 w-3 h-2 bg-red-500" style={{ clipPath: 'polygon(0 0, 100% 50%, 0 100%)' }} />
                </div>
              </div>
              {/* Gate */}
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-5 bg-amber-900 rounded-t-lg" />
              {/* Windows */}
              <div className="absolute top-2 left-1.5 w-1.5 h-2 bg-yellow-400 opacity-80" />
              <div className="absolute top-2 right-1.5 w-1.5 h-2 bg-yellow-400 opacity-80" />
            </div>
            {/* Label */}
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-xs font-bold text-red-400 whitespace-nowrap">
              PROTECT!
            </div>
          </div>
        </div>

        {/* Towers */}
        {towers.map(tower => {
          const centerX = (tower.x + 0.5) * CELL_SIZE;
          const centerY = (tower.y + 0.5) * CELL_SIZE;
          
          // Find target to rotate towards
          let angle = 0;
          const target = enemiesRef.current.find(enemy => {
            const dx = enemy.x - tower.x;
            const dy = enemy.y - tower.y;
            return Math.sqrt(dx * dx + dy * dy) <= tower.range;
          });
          if (target) {
            angle = Math.atan2(target.y - tower.y, target.x - tower.x) * (180 / Math.PI) + 90;
          }

          return (
            <React.Fragment key={tower.id}>
              {/* Range indicator */}
              {selectedPlacedTower === tower.id && (
                <div
                  className="absolute rounded-full border-2 border-white/30 bg-white/5 pointer-events-none"
                  style={{
                    left: centerX - tower.range * CELL_SIZE,
                    top: centerY - tower.range * CELL_SIZE,
                    width: tower.range * 2 * CELL_SIZE,
                    height: tower.range * 2 * CELL_SIZE
                  }}
                />
              )}
              
              {/* Tower range circle */}
              {selectedPlacedTower === tower.id && tower.range > 0 && (
                <div
                  className="absolute rounded-full border-2 border-blue-400/50 bg-blue-400/10 pointer-events-none"
                  style={{
                    left: (tower.x + 0.5) * CELL_SIZE - tower.range * CELL_SIZE,
                    top: (tower.y + 0.5) * CELL_SIZE - tower.range * CELL_SIZE,
                    width: tower.range * 2 * CELL_SIZE,
                    height: tower.range * 2 * CELL_SIZE,
                    zIndex: 5
                  }}
                />
              )}
              {/* Tower base */}
              <div
                className={`absolute ${selectedPlacedTower === tower.id ? 'ring-2 ring-white' : ''}`}
                style={{
                  left: tower.x * CELL_SIZE,
                  top: tower.y * CELL_SIZE,
                  width: CELL_SIZE,
                  height: CELL_SIZE
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (selectedPlacedTower === tower.id) {
                    setSelectedPlacedTower(null);
                    setShowUpgradeMenu(null);
                  } else {
                    setSelectedPlacedTower(tower.id);
                    setShowUpgradeMenu(null);
                  }
                }}
              >
                {/* Floating buttons when selected */}
                {selectedPlacedTower === tower.id && (
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex gap-1 z-20">
                    {tower.level < 5 && showUpgradeMenu !== tower.id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowUpgradeMenu(tower.id);
                        }}
                        disabled={gold < Math.floor(tower.cost * (tower.level * 0.5 + 0.5))}
                        className="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 rounded text-white text-xs font-bold whitespace-nowrap"
                      >
                        ⬆ ${Math.floor(tower.cost * (tower.level * 0.5 + 0.5))}
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        sellTower(tower.id);
                      }}
                      className="px-2 py-1 bg-red-600 hover:bg-red-500 rounded text-white text-xs font-bold whitespace-nowrap"
                    >
                      💰 ${Math.floor(tower.cost * tower.level * 0.5)}
                    </button>
                  </div>
                )}
                
                {/* Upgrade choice menu */}
                {showUpgradeMenu === tower.id && (
                  <div className="absolute -top-28 left-1/2 -translate-x-1/2 flex flex-col gap-1 z-30 bg-slate-900 p-2 rounded-lg border border-slate-600 shadow-xl">
                    <div className="text-white text-xs font-bold text-center mb-1">Choose Upgrade:</div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        upgradeTower(tower.id, 'damage');
                      }}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded text-white text-xs font-bold whitespace-nowrap flex items-center gap-1"
                    >
                      ⚔️ Damage +40%
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        upgradeTower(tower.id, 'speed');
                      }}
                      className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 rounded text-white text-xs font-bold whitespace-nowrap flex items-center gap-1"
                    >
                      ⚡ Speed +25%
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        upgradeTower(tower.id, 'range');
                      }}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-white text-xs font-bold whitespace-nowrap flex items-center gap-1"
                    >
                      📏 Range +1
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowUpgradeMenu(null);
                      }}
                      className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-white text-xs whitespace-nowrap"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {/* Arrow Tower */}
                {tower.type === 'basic' && (
                  <div className="w-full h-full flex items-center justify-center">
                    {/* Stone tower base */}
                    <div className="absolute w-8 h-4 bg-stone-700 rounded-sm" style={{ bottom: '2px' }} />
                    <div className="absolute w-6 h-6 bg-stone-600 rounded-t-sm" style={{ bottom: '6px' }} />
                    {/* Battlements */}
                    <div className="absolute flex gap-1" style={{ bottom: '22px' }}>
                      <div className="w-1.5 h-2 bg-stone-500" />
                      <div className="w-1.5 h-2 bg-stone-500" />
                      <div className="w-1.5 h-2 bg-stone-500" />
                    </div>
                    {/* Rotating crossbow */}
                    <div 
                      className="absolute flex items-center justify-center transition-transform duration-100"
                      style={{ transform: `rotate(${angle}deg)`, top: '4px' }}
                    >
                      {/* Crossbow stock */}
                      <div className="absolute w-1.5 h-6 bg-amber-800 rounded-sm" />
                      {/* Bow arms - curved */}
                      <div className="absolute w-8 h-1.5 bg-amber-700 rounded-full" style={{ top: '2px' }}>
                        <div className="absolute left-0 top-0 w-2 h-1.5 bg-amber-700 rounded-l-full" style={{ transform: 'rotate(-15deg)', transformOrigin: 'right center' }} />
                        <div className="absolute right-0 top-0 w-2 h-1.5 bg-amber-700 rounded-r-full" style={{ transform: 'rotate(15deg)', transformOrigin: 'left center' }} />
                      </div>
                      {/* Bowstring */}
                      <div className="absolute w-6 h-px bg-amber-200" style={{ top: '3px' }} />
                      {/* Arrow loaded */}
                      <div className="absolute w-0.5 h-4 bg-amber-900" style={{ top: '-6px' }} />
                      <div className="absolute w-2 h-2 bg-gray-400 rotate-45" style={{ top: '-8px' }} />
                      {/* Fletching */}
                      <div className="absolute w-1 h-1 bg-green-600" style={{ top: '2px', left: '14px' }} />
                      <div className="absolute w-1 h-1 bg-green-600" style={{ top: '2px', right: '14px' }} />
                    </div>
                    {/* Level stars */}
                    {tower.level > 1 && (
                      <div className="absolute -top-1 -right-1 text-yellow-400 text-xs font-bold">
                        {'★'.repeat(tower.level - 1)}
                      </div>
                    )}
                  </div>
                )}

                {/* Cannon Tower */}
                {tower.type === 'cannon' && (
                  <div className="w-full h-full flex items-center justify-center">
                    {/* Wooden platform base */}
                    <div className="absolute w-8 h-3 bg-amber-950 rounded-sm" style={{ bottom: '2px' }} />
                    <div className="absolute w-7 h-5 bg-amber-900 rounded-t-sm" style={{ bottom: '5px' }} />
                    {/* Wheels */}
                    <div className="absolute w-3 h-3 bg-amber-800 rounded-full border-2 border-amber-700" style={{ bottom: '2px', left: '4px' }} />
                    <div className="absolute w-3 h-3 bg-amber-800 rounded-full border-2 border-amber-700" style={{ bottom: '2px', right: '4px' }} />
                    {/* Rotating cannon */}
                    <div 
                      className="absolute flex items-center justify-center transition-transform duration-150"
                      style={{ transform: `rotate(${angle}deg)`, top: '6px' }}
                    >
                      {/* Cannon barrel */}
                      <div className="absolute w-3 h-7 bg-gradient-to-t from-gray-700 to-gray-600 rounded-t-lg" style={{ top: '-12px' }} />
                      {/* Barrel rings */}
                      <div className="absolute w-3.5 h-1 bg-gray-500 rounded-sm" style={{ top: '-10px' }} />
                      <div className="absolute w-3.5 h-1 bg-gray-500 rounded-sm" style={{ top: '-6px' }} />
                      {/* Muzzle */}
                      <div className="absolute w-4 h-1.5 bg-gray-800 rounded-t-sm" style={{ top: '-13px' }} />
                      {/* Cannon base/mount */}
                      <div className="absolute w-5 h-3 bg-gray-800 rounded-sm" />
                      <div className="absolute w-3 h-2 bg-gray-900 rounded-sm" style={{ top: '2px' }} />
                    </div>
                    {tower.level > 1 && (
                      <div className="absolute -top-1 -right-1 text-yellow-400 text-xs font-bold">
                        {'★'.repeat(tower.level - 1)}
                      </div>
                    )}
                  </div>
                )}

                {/* Sniper Tower */}
                {tower.type === 'sniper' && (
                  <div className="w-full h-full flex items-center justify-center">
                    {/* Tall watchtower base */}
                    <div className="absolute w-8 h-3 bg-slate-800 rounded-sm" style={{ bottom: '2px' }} />
                    <div className="absolute w-6 h-8 bg-gradient-to-t from-slate-700 to-slate-600 rounded-t-sm" style={{ bottom: '5px' }} />
                    {/* Tower window */}
                    <div className="absolute w-2 h-2 bg-slate-900 rounded-sm" style={{ bottom: '8px' }} />
                    {/* Platform/roof */}
                    <div className="absolute w-7 h-1 bg-slate-500" style={{ top: '6px' }} />
                    {/* Rotating sniper rifle */}
                    <div 
                      className="absolute flex items-center justify-center transition-transform duration-75"
                      style={{ transform: `rotate(${angle}deg)`, top: '2px' }}
                    >
                      {/* Rifle stock */}
                      <div className="absolute w-1.5 h-3 bg-violet-950 rounded-sm" style={{ top: '2px' }} />
                      {/* Long barrel */}
                      <div className="absolute w-1 h-8 bg-gradient-to-t from-violet-800 to-violet-600 rounded-t-sm" style={{ top: '-14px' }} />
                      {/* Muzzle brake */}
                      <div className="absolute w-2 h-1 bg-violet-500" style={{ top: '-14px' }} />
                      {/* Scope */}
                      <div className="absolute w-2 h-1 bg-violet-400 rounded-full" style={{ top: '-8px' }} />
                      <div className="absolute w-0.5 h-3 bg-violet-500" style={{ top: '-10px', left: '5px' }} />
                      {/* Scope lens glint */}
                      <div className="absolute w-1 h-1 bg-violet-300 rounded-full" style={{ top: '-8px', left: '6px' }} />
                    </div>
                    {tower.level > 1 && (
                      <div className="absolute -top-1 -right-1 text-yellow-400 text-xs font-bold">
                        {'★'.repeat(tower.level - 1)}
                      </div>
                    )}
                  </div>
                )}

                {/* Frost Tower */}
                {tower.type === 'freeze' && (
                  <div className="w-full h-full flex items-center justify-center">
                    {/* Ice base platform */}
                    <div className="absolute w-8 h-3 bg-cyan-950 rounded-sm" style={{ bottom: '2px' }} />
                    {/* Ice crystal base */}
                    <div className="absolute w-6 h-6 bg-gradient-to-t from-cyan-900 to-cyan-700 rounded-lg rotate-45" style={{ bottom: '5px' }} />
                    {/* Frost particles around */}
                    <div className="absolute w-1 h-1 bg-cyan-300 rounded-full animate-pulse" style={{ top: '4px', left: '4px' }} />
                    <div className="absolute w-1 h-1 bg-cyan-200 rounded-full animate-pulse" style={{ top: '6px', right: '6px' }} />
                    <div className="absolute w-0.5 h-0.5 bg-white rounded-full animate-pulse" style={{ top: '12px', left: '6px' }} />
                    {/* Rotating frost emitter */}
                    <div 
                      className="absolute flex items-center justify-center transition-transform duration-100"
                      style={{ transform: `rotate(${angle}deg)` }}
                    >
                      {/* Main crystal spire */}
                      <div className="absolute w-2 h-6 bg-gradient-to-t from-cyan-600 via-cyan-400 to-cyan-200 rounded-t-full" style={{ top: '-12px' }}>
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent rounded-t-full" />
                      </div>
                      {/* Side crystals */}
                      <div className="absolute w-1.5 h-4 bg-gradient-to-t from-cyan-500 to-cyan-300 rounded-t-full" style={{ top: '-6px', left: '-5px', transform: 'rotate(-25deg)' }} />
                      <div className="absolute w-1.5 h-4 bg-gradient-to-t from-cyan-500 to-cyan-300 rounded-t-full" style={{ top: '-6px', right: '-5px', transform: 'rotate(25deg)' }} />
                      {/* Center gem - glowing */}
                      <div className="absolute w-3 h-3 bg-cyan-300 rounded-full shadow-lg shadow-cyan-400/80" style={{ top: '0px' }}>
                        <div className="absolute inset-0.5 bg-cyan-100 rounded-full opacity-60" />
                      </div>
                    </div>
                    {tower.level > 1 && (
                      <div className="absolute -top-1 -right-1 text-yellow-400 text-xs font-bold">
                        {'★'.repeat(tower.level - 1)}
                      </div>
                    )}
                  </div>
                )}

                {/* Barracks Tower */}
                {tower.type === 'barracks' && (
                  <div className="w-full h-full flex items-center justify-center">
                    {/* Ground/platform */}
                    <div className="absolute w-8 h-2 bg-yellow-950" style={{ bottom: '2px' }} />
                    {/* Wooden building */}
                    <div className="absolute w-7 h-6 bg-gradient-to-t from-yellow-900 to-yellow-800 rounded-t-sm" style={{ bottom: '4px' }} />
                    {/* Roof */}
                    <div className="absolute w-8 h-2 bg-yellow-700" style={{ top: '6px' }} />
                    <div className="absolute w-0 h-0 border-l-[16px] border-r-[16px] border-b-[8px] border-l-transparent border-r-transparent border-b-yellow-600" style={{ top: '-2px' }} />
                    {/* Door */}
                    <div className="absolute w-2.5 h-4 bg-yellow-950 rounded-t-sm" style={{ bottom: '4px' }}>
                      <div className="absolute w-0.5 h-0.5 bg-yellow-600 rounded-full" style={{ top: '2px', right: '2px' }} />
                    </div>
                    {/* Windows */}
                    <div className="absolute w-1.5 h-1.5 bg-yellow-950" style={{ bottom: '8px', left: '6px' }} />
                    <div className="absolute w-1.5 h-1.5 bg-yellow-950" style={{ bottom: '8px', right: '6px' }} />
                    {/* Flag pole */}
                    <div className="absolute" style={{ top: '-6px', right: '2px' }}>
                      <div className="w-0.5 h-8 bg-amber-900" />
                      {/* Animated flag */}
                      <div className="absolute top-0 left-0.5 w-4 h-3 bg-gradient-to-r from-yellow-500 to-yellow-400 rounded-r-sm animate-pulse" />
                      <div className="absolute top-0 left-0.5 w-1 h-3 bg-yellow-600" />
                    </div>
                    {/* Sword decoration */}
                    <div className="absolute w-0.5 h-3 bg-gray-400" style={{ top: '8px', left: '5px', transform: 'rotate(-20deg)' }} />
                    <div className="absolute w-1.5 h-0.5 bg-gray-400" style={{ top: '10px', left: '4px', transform: 'rotate(-20deg)' }} />
                    {tower.level > 1 && (
                      <div className="absolute -top-2 -right-1 text-yellow-400 text-xs font-bold">
                        {'★'.repeat(tower.level - 1)}
                      </div>
                    )}
                  </div>
                )}

                {/* Laser Tower */}
                {tower.type === 'laser' && (
                  <div className="w-full h-full flex items-center justify-center">
                    {/* Tech base */}
                    <div className="absolute w-8 h-2 bg-pink-950 rounded-sm" style={{ bottom: '2px' }} />
                    <div className="absolute w-6 h-4 bg-gradient-to-t from-pink-900 to-pink-800 rounded-sm" style={{ bottom: '4px' }} />
                    {/* Energy core */}
                    <div className="absolute w-4 h-4 bg-pink-600 rounded-full animate-pulse" style={{ bottom: '8px' }}>
                      <div className="absolute inset-1 bg-pink-400 rounded-full" />
                      <div className="absolute inset-2 bg-pink-200 rounded-full animate-ping" />
                    </div>
                    {/* Rotating laser emitter */}
                    <div 
                      className="absolute flex items-center justify-center transition-transform duration-50"
                      style={{ transform: `rotate(${angle}deg)`, top: '4px' }}
                    >
                      {/* Emitter housing */}
                      <div className="absolute w-3 h-5 bg-gradient-to-t from-pink-700 to-pink-500 rounded-t-sm" style={{ top: '-10px' }} />
                      {/* Laser lens */}
                      <div className="absolute w-2 h-2 bg-pink-300 rounded-full" style={{ top: '-12px' }}>
                        <div className="absolute inset-0.5 bg-white rounded-full animate-pulse" />
                      </div>
                      {/* Side panels */}
                      <div className="absolute w-1 h-3 bg-pink-600" style={{ top: '-8px', left: '-3px' }} />
                      <div className="absolute w-1 h-3 bg-pink-600" style={{ top: '-8px', right: '-3px' }} />
                    </div>
                    {tower.level > 1 && (
                      <div className="absolute -top-1 -right-1 text-yellow-400 text-xs font-bold">
                        {'★'.repeat(tower.level - 1)}
                      </div>
                    )}
                  </div>
                )}

                {/* Mortar Tower */}
                {tower.type === 'mortar' && (
                  <div className="w-full h-full flex items-center justify-center">
                    {/* Sandbag base */}
                    <div className="absolute w-8 h-3 bg-amber-900 rounded-sm" style={{ bottom: '2px' }} />
                    <div className="absolute w-7 h-2 bg-amber-800 rounded-sm" style={{ bottom: '5px' }} />
                    {/* Mortar tube mount */}
                    <div className="absolute w-5 h-3 bg-stone-700 rounded-sm" style={{ bottom: '7px' }} />
                    {/* Rotating mortar tube */}
                    <div 
                      className="absolute flex items-center justify-center transition-transform duration-300"
                      style={{ transform: `rotate(${angle - 45}deg)`, bottom: '12px' }}
                    >
                      {/* Thick mortar barrel */}
                      <div className="absolute w-4 h-7 bg-gradient-to-t from-stone-800 to-stone-600 rounded-t-lg" style={{ top: '-14px' }}>
                        {/* Barrel bands */}
                        <div className="absolute w-full h-0.5 bg-stone-500" style={{ top: '2px' }} />
                        <div className="absolute w-full h-0.5 bg-stone-500" style={{ top: '5px' }} />
                      </div>
                      {/* Barrel opening */}
                      <div className="absolute w-3 h-1 bg-stone-900 rounded-full" style={{ top: '-14px' }} />
                    </div>
                    {/* Ammo shells */}
                    <div className="absolute w-1.5 h-2 bg-amber-600 rounded-t-sm" style={{ bottom: '3px', right: '4px' }} />
                    <div className="absolute w-1.5 h-2 bg-amber-700 rounded-t-sm" style={{ bottom: '3px', right: '7px' }} />
                    {tower.level > 1 && (
                      <div className="absolute -top-1 -right-1 text-yellow-400 text-xs font-bold">
                        {'★'.repeat(tower.level - 1)}
                      </div>
                    )}
                  </div>
                )}

                {/* Tesla Tower */}
                {tower.type === 'tesla' && (
                  <div className="w-full h-full flex items-center justify-center">
                    {/* Metal base */}
                    <div className="absolute w-8 h-2 bg-blue-950 rounded-sm" style={{ bottom: '2px' }} />
                    <div className="absolute w-6 h-5 bg-gradient-to-t from-blue-900 to-blue-800 rounded-sm" style={{ bottom: '4px' }} />
                    {/* Tesla coil */}
                    <div className="absolute w-3 h-8 bg-gradient-to-t from-blue-700 to-blue-500 rounded-t-full" style={{ bottom: '9px' }}>
                      {/* Coil rings */}
                      <div className="absolute w-4 h-1 bg-blue-400 rounded-full" style={{ top: '2px', left: '-2px' }} />
                      <div className="absolute w-4 h-1 bg-blue-400 rounded-full" style={{ top: '5px', left: '-2px' }} />
                      <div className="absolute w-4 h-1 bg-blue-400 rounded-full" style={{ top: '8px', left: '-2px' }} />
                    </div>
                    {/* Top sphere */}
                    <div className="absolute w-4 h-4 bg-gradient-to-br from-blue-300 to-blue-500 rounded-full" style={{ top: '0px' }}>
                      <div className="absolute inset-1 bg-blue-200 rounded-full animate-pulse" />
                    </div>
                    {/* Electric arcs */}
                    <div className="absolute w-6 h-0.5 bg-blue-300 animate-pulse" style={{ top: '4px', transform: 'rotate(30deg)' }} />
                    <div className="absolute w-5 h-0.5 bg-blue-400 animate-pulse" style={{ top: '6px', transform: 'rotate(-20deg)' }} />
                    {tower.level > 1 && (
                      <div className="absolute -top-1 -right-1 text-yellow-400 text-xs font-bold">
                        {'★'.repeat(tower.level - 1)}
                      </div>
                    )}
                  </div>
                )}

                {/* Flamethrower Tower */}
                {tower.type === 'flame' && (
                  <div className="w-full h-full flex items-center justify-center">
                    {/* Base */}
                    <div className="absolute w-8 h-3 bg-red-950 rounded-sm" style={{ bottom: '2px' }} />
                    <div className="absolute w-6 h-4 bg-gradient-to-t from-red-900 to-red-800 rounded-sm" style={{ bottom: '5px' }} />
                    {/* Fuel tank */}
                    <div className="absolute w-4 h-5 bg-red-700 rounded-full" style={{ bottom: '6px' }}>
                      <div className="absolute inset-0.5 bg-gradient-to-br from-red-600 to-red-800 rounded-full" />
                    </div>
                    {/* Rotating flamethrower nozzle */}
                    <div 
                      className="absolute flex items-center justify-center transition-transform duration-75"
                      style={{ transform: `rotate(${angle}deg)`, top: '6px' }}
                    >
                      {/* Pipe */}
                      <div className="absolute w-2 h-5 bg-gradient-to-t from-gray-700 to-gray-500 rounded-t-sm" style={{ top: '-10px' }} />
                      {/* Nozzle */}
                      <div className="absolute w-3 h-2 bg-gray-600 rounded-t-sm" style={{ top: '-12px' }} />
                      {/* Pilot flame */}
                      <div className="absolute w-2 h-3 bg-gradient-to-t from-orange-600 via-yellow-500 to-yellow-300 rounded-t-full animate-pulse" style={{ top: '-16px' }} />
                    </div>
                    {tower.level > 1 && (
                      <div className="absolute -top-1 -right-1 text-yellow-400 text-xs font-bold">
                        {'★'.repeat(tower.level - 1)}
                      </div>
                    )}
                  </div>
                )}

                {/* Poison Tower */}
                {tower.type === 'poison' && (
                  <div className="w-full h-full flex items-center justify-center">
                    {/* Swamp base */}
                    <div className="absolute w-8 h-3 bg-lime-950 rounded-sm" style={{ bottom: '2px' }} />
                    {/* Cauldron */}
                    <div className="absolute w-7 h-5 bg-gradient-to-t from-gray-800 to-gray-700 rounded-b-full" style={{ bottom: '5px' }}>
                      {/* Bubbling poison */}
                      <div className="absolute inset-1 bg-gradient-to-t from-lime-700 to-lime-500 rounded-b-full">
                        <div className="absolute w-1.5 h-1.5 bg-lime-300 rounded-full animate-bounce" style={{ top: '-2px', left: '2px' }} />
                        <div className="absolute w-1 h-1 bg-lime-400 rounded-full animate-bounce" style={{ top: '-1px', right: '3px', animationDelay: '0.2s' }} />
                        <div className="absolute w-1 h-1 bg-lime-200 rounded-full animate-bounce" style={{ top: '0px', left: '50%', animationDelay: '0.4s' }} />
                      </div>
                    </div>
                    {/* Smoke/fumes */}
                    <div className="absolute w-2 h-3 bg-lime-400/50 rounded-full animate-pulse" style={{ top: '2px', left: '6px' }} />
                    <div className="absolute w-1.5 h-2 bg-lime-300/40 rounded-full animate-pulse" style={{ top: '4px', right: '8px', animationDelay: '0.3s' }} />
                    {/* Skull emblem */}
                    <div className="absolute text-lime-300 text-xs" style={{ top: '6px' }}>☠</div>
                    {tower.level > 1 && (
                      <div className="absolute -top-1 -right-1 text-yellow-400 text-xs font-bold">
                        {'★'.repeat(tower.level - 1)}
                      </div>
                    )}
                  </div>
                )}

                {/* Bank Tower */}
                {tower.type === 'bank' && (
                  <div className="w-full h-full flex items-center justify-center">
                    {/* Foundation */}
                    <div className="absolute w-8 h-2 bg-emerald-950" style={{ bottom: '2px' }} />
                    {/* Main building */}
                    <div className="absolute w-7 h-7 bg-gradient-to-t from-emerald-800 to-emerald-700 rounded-t-sm" style={{ bottom: '4px' }} />
                    {/* Roof/Pediment */}
                    <div className="absolute w-8 h-1.5 bg-emerald-600" style={{ top: '4px' }} />
                    <div className="absolute w-0 h-0 border-l-[16px] border-r-[16px] border-b-[6px] border-l-transparent border-r-transparent border-b-emerald-500" style={{ top: '-2px' }} />
                    {/* Columns */}
                    <div className="absolute w-1 h-5 bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-t-sm" style={{ bottom: '5px', left: '5px' }} />
                    <div className="absolute w-1 h-5 bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-t-sm" style={{ bottom: '5px', right: '5px' }} />
                    {/* Door */}
                    <div className="absolute w-3 h-4 bg-emerald-950 rounded-t-sm" style={{ bottom: '4px' }}>
                      <div className="absolute w-0.5 h-0.5 bg-yellow-400 rounded-full" style={{ top: '2px', left: '1px' }} />
                      <div className="absolute w-0.5 h-0.5 bg-yellow-400 rounded-full" style={{ top: '2px', right: '1px' }} />
                    </div>
                    {/* Gold coin emblem */}
                    <div className="absolute w-3 h-3 bg-yellow-500 rounded-full border border-yellow-400" style={{ top: '5px' }}>
                      <div className="absolute inset-0 flex items-center justify-center text-yellow-800 font-bold text-xs">$</div>
                    </div>
                    {/* Gold coins at base */}
                    <div className="absolute w-1.5 h-1 bg-yellow-400 rounded-full" style={{ bottom: '3px', left: '3px' }} />
                    <div className="absolute w-1.5 h-1 bg-yellow-500 rounded-full" style={{ bottom: '4px', left: '5px' }} />
                    {/* Gold income indicator */}
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-yellow-400 text-xs font-bold bg-emerald-900/80 px-1 rounded">
                      +{25 * Math.pow(2, tower.level - 1)}
                    </div>
                    {tower.level > 1 && (
                      <div className="absolute -top-1 -right-1 text-yellow-400 text-xs font-bold">
                        {'★'.repeat(tower.level - 1)}
                      </div>
                    )}
                  </div>
                )}

                {/* Missile Tower */}
                {tower.type === 'missile' && (
                  <div className="w-full h-full flex items-center justify-center">
                    {/* Heavy base */}
                    <div className="absolute w-8 h-3 bg-red-950 rounded-sm" style={{ bottom: '2px' }} />
                    <div className="absolute w-6 h-4 bg-gradient-to-t from-red-900 to-red-800 rounded-sm" style={{ bottom: '5px' }} />
                    {/* Missile launcher */}
                    <div 
                      className="absolute flex items-center justify-center transition-transform duration-100"
                      style={{ transform: `rotate(${angle}deg)`, top: '2px' }}
                    >
                      <div className="w-3 h-8 bg-gradient-to-t from-gray-600 to-gray-400 rounded-t-sm">
                        {/* Missile inside */}
                        <div className="absolute w-2 h-5 bg-red-600 rounded-t-full" style={{ top: '-3px', left: '2px' }}>
                          <div className="absolute w-2 h-2 bg-red-400 rounded-t-full" />
                        </div>
                      </div>
                    </div>
                    {tower.level > 1 && (
                      <div className="absolute -top-1 -right-1 text-yellow-400 text-xs font-bold">
                        {'★'.repeat(tower.level - 1)}
                      </div>
                    )}
                  </div>
                )}

                {/* Vortex Tower */}
                {tower.type === 'vortex' && (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="absolute w-8 h-3 bg-indigo-950 rounded-sm" style={{ bottom: '2px' }} />
                    <div className="absolute w-7 h-7 rounded-full bg-gradient-to-br from-indigo-600 to-purple-700 animate-spin" style={{ animationDuration: '2s' }}>
                      <div className="absolute inset-1 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500" />
                      <div className="absolute inset-2 rounded-full bg-gradient-to-br from-indigo-300 to-purple-400" />
                      <div className="absolute inset-3 rounded-full bg-indigo-950" />
                    </div>
                    {tower.level > 1 && (
                      <div className="absolute -top-1 -right-1 text-yellow-400 text-xs font-bold">
                        {'★'.repeat(tower.level - 1)}
                      </div>
                    )}
                  </div>
                )}

                {/* Boost Tower */}
                {tower.type === 'boost' && (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="absolute w-8 h-2 bg-yellow-900" style={{ bottom: '2px' }} />
                    <div className="absolute w-6 h-6 bg-gradient-to-t from-yellow-600 to-yellow-500 rounded-lg" style={{ bottom: '4px' }}>
                      <div className="absolute inset-1 bg-yellow-400 rounded animate-pulse" />
                      <div className="absolute inset-0 flex items-center justify-center text-yellow-900 font-bold text-lg">⚡</div>
                    </div>
                    {/* Boost aura */}
                    <div className="absolute w-10 h-10 rounded-full border-2 border-yellow-400/50 animate-ping" style={{ animationDuration: '1.5s' }} />
                    {tower.level > 1 && (
                      <div className="absolute -top-1 -right-1 text-yellow-400 text-xs font-bold">
                        {'★'.repeat(tower.level - 1)}
                      </div>
                    )}
                  </div>
                )}

                {/* Vampire Tower */}
                {tower.type === 'vampire' && (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="absolute w-8 h-3 bg-rose-950 rounded-sm" style={{ bottom: '2px' }} />
                    <div className="absolute w-6 h-7 bg-gradient-to-t from-rose-900 to-rose-700 rounded-t-lg" style={{ bottom: '5px' }}>
                      {/* Bat wings */}
                      <div className="absolute w-3 h-4 bg-rose-800 rounded-tl-full" style={{ top: '-2px', left: '-4px', transform: 'rotate(-20deg)' }} />
                      <div className="absolute w-3 h-4 bg-rose-800 rounded-tr-full" style={{ top: '-2px', right: '-4px', transform: 'rotate(20deg)' }} />
                    </div>
                    {/* Fangs */}
                    <div className="absolute text-white text-sm" style={{ top: '8px' }}>🧛</div>
                    {tower.level > 1 && (
                      <div className="absolute -top-1 -right-1 text-yellow-400 text-xs font-bold">
                        {'★'.repeat(tower.level - 1)}
                      </div>
                    )}
                  </div>
                )}

                {/* Anti-Air Tower */}
                {tower.type === 'antiair' && (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="absolute w-8 h-3 bg-sky-950 rounded-sm" style={{ bottom: '2px' }} />
                    <div className="absolute w-5 h-4 bg-gradient-to-t from-sky-800 to-sky-700" style={{ bottom: '5px' }} />
                    {/* Radar dish */}
                    <div 
                      className="absolute transition-transform duration-100"
                      style={{ transform: `rotate(${angle}deg)`, top: '0px' }}
                    >
                      <div className="w-8 h-4 bg-gradient-to-r from-sky-500 to-sky-400 rounded-t-full" />
                      <div className="absolute w-1 h-3 bg-sky-300" style={{ top: '4px', left: '14px' }} />
                    </div>
                    {tower.level > 1 && (
                      <div className="absolute -top-1 -right-1 text-yellow-400 text-xs font-bold">
                        {'★'.repeat(tower.level - 1)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}

        {/* Dropped Power-ups */}
        {droppedPowerups.map(powerup => (
          <div
            key={powerup.id}
            className="absolute z-30 cursor-pointer animate-bounce"
            style={{
              left: (powerup.x + 0.5) * CELL_SIZE,
              top: (powerup.y + 0.5) * CELL_SIZE,
              transform: 'translate(-50%, -50%)'
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleCellClick(Math.round(powerup.x), Math.round(powerup.y));
            }}
          >
            <div
              className="rounded-full flex items-center justify-center shadow-lg border-2 border-white"
              style={{
                width: CELL_SIZE * 0.8,
                height: CELL_SIZE * 0.8,
                backgroundColor: powerup.color,
                animation: 'pulse 1s infinite'
              }}
            >
              <span className="text-lg">{powerup.icon}</span>
            </div>
            {/* Timer ring */}
            <div 
              className="absolute inset-0 rounded-full border-2 border-yellow-300"
              style={{
                borderWidth: 1,
                opacity: Math.max(0, 1 - ((Date.now() - powerup.spawnTime) / powerup.lifetime)),
              }}
            />
          </div>
        ))}

        {/* Enemies */}
        {enemies.map(enemy => (
          <div key={enemy.id} className="absolute" style={{
            left: (enemy.x + 0.5) * CELL_SIZE,
            top: (enemy.y + 0.5) * CELL_SIZE,
            transform: 'translate(-50%, -50%)'
          }}>
            {/* Enemy body with special effects */}
            <div className="relative">
              {/* Burn effect */}
              {enemy.burnTimer > 0 && (
                <div 
                  className="absolute rounded-full animate-pulse"
                  style={{
                    width: CELL_SIZE * enemy.size + 8,
                    height: CELL_SIZE * enemy.size + 8,
                    left: -4,
                    top: -4,
                    background: 'radial-gradient(circle, rgba(255,100,0,0.6) 0%, rgba(255,50,0,0.3) 50%, transparent 70%)'
                  }}
                />
              )}
              {/* Poison effect */}
              {enemy.poisonTimer > 0 && (
                <div 
                  className="absolute rounded-full animate-pulse"
                  style={{
                    width: CELL_SIZE * enemy.size + 6,
                    height: CELL_SIZE * enemy.size + 6,
                    left: -3,
                    top: -3,
                    background: 'radial-gradient(circle, rgba(132,204,22,0.5) 0%, rgba(132,204,22,0.2) 60%, transparent 80%)'
                  }}
                />
              )}
              {/* Armor ring for armored enemies */}
              {enemy.armor > 0 && (
                <div 
                  className="absolute rounded-full border-2 border-slate-400 animate-pulse"
                  style={{
                    width: CELL_SIZE * enemy.size + 6,
                    height: CELL_SIZE * enemy.size + 6,
                    left: -3,
                    top: -3
                  }}
                />
              )}
              {/* Heal aura for healer enemies */}
              {enemy.heals && (
                <div 
                  className="absolute rounded-full bg-green-400/30 animate-ping"
                  style={{
                    width: CELL_SIZE * 2,
                    height: CELL_SIZE * 2,
                    left: -(CELL_SIZE * 0.5),
                    top: -(CELL_SIZE * 0.5)
                  }}
                />
              )}
              <div
                className="rounded-full transition-all shadow-lg"
                style={{
                  width: CELL_SIZE * enemy.size,
                  height: CELL_SIZE * enemy.size,
                  backgroundColor: enemy.burnTimer > 0 ? '#f97316' : enemy.poisonTimer > 0 ? '#84cc16' : enemy.slowTimer > 0 ? '#67e8f9' : enemy.color,
                  boxShadow: enemy.type === 'boss' ? '0 0 15px rgba(220, 38, 38, 0.7)' : 'none'
                }}
              />
              {/* Enemy type indicator */}
              {enemy.type === 'boss' && (
                <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-xs">👑</div>
              )}
              {enemy.type === 'healer' && (
                <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-xs">+</div>
              )}
              {enemy.type === 'armored' && (
                <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-xs">🛡️</div>
              )}
              {enemy.type === 'fast' && (
                <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-xs">⚡</div>
              )}
              {enemy.type === 'ghost' && (
                <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-xs">👻</div>
              )}
              {enemy.type === 'splitter' && (
                <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-xs">💧</div>
              )}
              {enemy.type === 'regen' && (
                <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-xs">💚</div>
              )}
              {enemy.type === 'shielded' && (
                <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-xs">🔵</div>
              )}
              {enemy.type === 'speeder' && (
                <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-xs">🚀</div>
              )}
              {enemy.type === 'necro' && (
                <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-xs">💀</div>
              )}
              {enemy.type === 'immune' && (
                <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-xs">🛡️</div>
              )}
              {enemy.type === 'bomber' && (
                <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-xs">💣</div>
              )}
              {enemy.type === 'jumper' && (
                <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-xs">🦘</div>
              )}
              {enemy.type === 'titan' && (
                <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-sm">👹</div>
              )}
              {enemy.type === 'shadow' && (
                <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-xs">🌑</div>
              )}
              {enemy.type === 'vamp' && (
                <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-xs">🧛</div>
              )}
              {/* Status icons */}
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 flex gap-0.5">
                {enemy.elite && <span className="text-xs animate-bounce">{enemy.eliteIcon}</span>}
                {enemy.burnTimer > 0 && <span className="text-xs">🔥</span>}
                {enemy.poisonTimer > 0 && <span className="text-xs">☠️</span>}
                {enemy.slowTimer > 0 && <span className="text-xs">❄️</span>}
                {enemy.regen > 0 && <span className="text-xs">💗</span>}
              </div>
              {/* Elite glow effect */}
              {enemy.elite && (
                <div 
                  className="absolute rounded-full animate-pulse pointer-events-none"
                  style={{
                    width: CELL_SIZE * enemy.size + 10,
                    height: CELL_SIZE * enemy.size + 10,
                    left: -5,
                    top: -5,
                    border: `2px solid ${ELITE_MODIFIERS[enemy.elite]?.color || '#fff'}`,
                    boxShadow: `0 0 10px ${ELITE_MODIFIERS[enemy.elite]?.color || '#fff'}`
                  }}
                />
              )}
            </div>
            {/* Health bar */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full transition-all"
                style={{ 
                  width: `${(enemy.health / enemy.maxHealth) * 100}%`,
                  backgroundColor: enemy.health > enemy.maxHealth * 0.5 ? '#22c55e' : enemy.health > enemy.maxHealth * 0.25 ? '#eab308' : '#ef4444'
                }}
              />
            </div>
            {/* Shield bar */}
            {enemy.shield > 0 && (
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-1 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full transition-all bg-blue-400"
                  style={{ width: `${((enemy.currentShield || 0) / enemy.shield) * 100}%` }}
                />
              </div>
            )}
          </div>
        ))}

        {/* Pawns */}
        {pawns.map(pawn => {
          // Calculate direction pawn is facing (towards nearest enemy or forward)
          let pawnAngle = 0;
          const nearestEnemy = enemies.find(e => {
            const dx = e.x - pawn.x;
            const dy = e.y - pawn.y;
            return Math.sqrt(dx*dx + dy*dy) < 3;
          });
          if (nearestEnemy) {
            pawnAngle = Math.atan2(nearestEnemy.y - pawn.y, nearestEnemy.x - pawn.x) * (180 / Math.PI);
          }
          
          return (
            <div key={pawn.id} className="absolute" style={{
              left: (pawn.x + 0.5) * CELL_SIZE,
              top: (pawn.y + 0.5) * CELL_SIZE,
              transform: 'translate(-50%, -50%)'
            }}>
              {/* Pawn soldier */}
              <div className="relative" style={{ transform: `rotate(${pawnAngle + 90}deg)` }}>
                {/* Shadow */}
                <div className="absolute w-5 h-2 bg-black/30 rounded-full" style={{ bottom: '-3px', left: '-1px' }} />
                {/* Body/Armor */}
                <div className="w-5 h-6 bg-gradient-to-b from-yellow-500 to-yellow-600 rounded-t-lg rounded-b-sm border border-yellow-400">
                  {/* Armor details */}
                  <div className="absolute top-1 left-1/2 -translate-x-1/2 w-3 h-2 bg-yellow-400/50 rounded-sm" />
                </div>
                {/* Head with helmet */}
                <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                  <div className="w-4 h-3 bg-yellow-600 rounded-t-full" /> {/* Helmet */}
                  <div className="absolute top-1 left-1/2 -translate-x-1/2 w-2.5 h-2 bg-amber-200 rounded-full" /> {/* Face */}
                </div>
                {/* Shield - left side */}
                <div className="absolute w-4 h-5 bg-gradient-to-br from-yellow-500 to-yellow-700 rounded-sm border-2 border-yellow-400" style={{ left: '-6px', top: '0px' }}>
                  <div className="absolute inset-1 border border-yellow-300 rounded-sm" />
                  <div className="absolute inset-0 flex items-center justify-center text-yellow-300 text-xs">⚔</div>
                </div>
                {/* Sword - right side */}
                <div className="absolute" style={{ right: '-5px', top: '-6px', transform: 'rotate(30deg)' }}>
                  <div className="w-1 h-5 bg-gradient-to-t from-gray-500 to-gray-300 rounded-t-sm" /> {/* Blade */}
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-1 bg-amber-700 rounded-sm" /> {/* Guard */}
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-2 bg-amber-800 rounded-b-sm" /> {/* Handle */}
                </div>
              </div>
              {/* Health bar */}
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-8 h-1.5 bg-gray-800 rounded-full overflow-hidden border border-gray-600">
                <div
                  className="h-full transition-all"
                  style={{ 
                    width: `${(pawn.health / pawn.maxHealth) * 100}%`,
                    backgroundColor: pawn.health > pawn.maxHealth * 0.5 ? '#facc15' : pawn.health > pawn.maxHealth * 0.25 ? '#f97316' : '#ef4444'
                  }}
                />
              </div>
            </div>
          );
        })}

        {/* Projectiles */}
        {projectiles.map(proj => {
          // Calculate rotation based on movement direction
          const target = enemiesRef.current.find(e => e.id === proj.targetId);
          let angle = 0;
          if (target) {
            angle = Math.atan2(target.y - proj.y, target.x - proj.x) * (180 / Math.PI) + 90;
          }
          
          return (
            <div
              key={proj.id}
              className="absolute"
              style={{
                left: (proj.x + 0.5) * CELL_SIZE,
                top: (proj.y + 0.5) * CELL_SIZE,
                transform: `translate(-50%, -50%) rotate(${angle}deg)`
              }}
            >
              {/* Arrow projectile */}
              {proj.color === '#86efac' && (
                <div className="relative">
                  <div className="w-1 h-4 bg-amber-800 rounded-sm" />
                  <div 
                    className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 
                    border-l-[3px] border-r-[3px] border-b-[6px] 
                    border-l-transparent border-r-transparent border-b-gray-400"
                  />
                  {/* Fletching */}
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-1 bg-green-600" />
                </div>
              )}
              
              {/* Cannonball projectile */}
              {proj.color === '#fdba74' && (
                <div className="w-3 h-3 bg-gray-800 rounded-full shadow-lg border border-gray-600" />
              )}
              
              {/* Sniper bullet projectile */}
              {proj.color === '#c4b5fd' && (
                <div className="relative">
                  <div className="w-1 h-3 bg-violet-400 rounded-full shadow-lg shadow-violet-400/50" />
                  <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-violet-200 rounded-full" />
                </div>
              )}
              
              {/* Frost projectile */}
              {proj.color === '#67e8f9' && (
                <div className="w-3 h-3 bg-cyan-300 rounded-full shadow-lg shadow-cyan-400/80 animate-pulse" />
              )}

              {/* Laser beam projectile */}
              {proj.color === '#f472b6' && (
                <div className="relative">
                  <div className="w-2 h-4 bg-gradient-to-t from-pink-600 to-pink-300 rounded-full shadow-lg shadow-pink-500/80" />
                  <div className="absolute inset-0 w-1 h-4 bg-white/80 rounded-full mx-auto" />
                </div>
              )}

              {/* Mortar shell projectile */}
              {proj.color === '#a16207' && (
                <div className="relative">
                  <div className="w-3 h-4 bg-gradient-to-t from-amber-800 to-amber-600 rounded-t-full rounded-b-sm" />
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-1 bg-amber-500 rounded-full" />
                </div>
              )}

              {/* Tesla bolt projectile */}
              {proj.color === '#60a5fa' && (
                <div className="relative">
                  <div className="w-2 h-5 bg-gradient-to-t from-blue-600 to-blue-300 rounded-full shadow-lg shadow-blue-500/80" />
                  <div className="absolute inset-0 w-1 mx-auto bg-white rounded-full animate-pulse" />
                  {/* Electric sparks */}
                  <div className="absolute w-3 h-0.5 bg-blue-300 -left-1" style={{ top: '30%', transform: 'rotate(45deg)' }} />
                  <div className="absolute w-3 h-0.5 bg-blue-300 -right-1" style={{ top: '60%', transform: 'rotate(-45deg)' }} />
                </div>
              )}

              {/* Flame projectile */}
              {proj.color === '#f87171' && (
                <div className="relative">
                  <div className="w-4 h-5 bg-gradient-to-t from-red-600 via-orange-500 to-yellow-400 rounded-t-full animate-pulse" 
                       style={{ filter: 'blur(1px)' }} />
                  <div className="absolute inset-0 w-2 mx-auto bg-yellow-200 rounded-t-full opacity-80" />
                </div>
              )}

              {/* Poison projectile */}
              {proj.color === '#a3e635' && (
                <div className="relative">
                  <div className="w-3 h-3 bg-gradient-to-br from-lime-400 to-lime-600 rounded-full shadow-lg shadow-lime-500/50" />
                  <div className="absolute inset-0.5 bg-lime-300 rounded-full opacity-60" />
                  {/* Dripping effect */}
                  <div className="absolute w-1 h-2 bg-lime-500 rounded-b-full -bottom-1 left-1/2 -translate-x-1/2" />
                </div>
              )}
            </div>
          );
        })}

        {/* Explosions */}
        {explosions.map(exp => {
          const progress = (Date.now() - exp.startTime) / exp.duration;
          const scale = 0.5 + progress * 1.5;
          const opacity = 1 - progress;
          
          return (
            <div
              key={exp.id}
              className="absolute pointer-events-none"
              style={{
                left: (exp.x + 0.5) * CELL_SIZE,
                top: (exp.y + 0.5) * CELL_SIZE,
                transform: 'translate(-50%, -50%)'
              }}
            >
              {/* Outer explosion ring */}
              <div
                className="absolute rounded-full border-4 border-orange-500"
                style={{
                  width: exp.radius * 2 * CELL_SIZE * scale,
                  height: exp.radius * 2 * CELL_SIZE * scale,
                  opacity: opacity * 0.8,
                  transform: 'translate(-50%, -50%)',
                  left: '50%',
                  top: '50%'
                }}
              />
              {/* Inner fireball */}
              <div
                className="absolute rounded-full"
                style={{
                  width: exp.radius * CELL_SIZE * scale,
                  height: exp.radius * CELL_SIZE * scale,
                  background: `radial-gradient(circle, rgba(255,200,50,${opacity}) 0%, rgba(255,100,0,${opacity * 0.8}) 50%, rgba(200,50,0,${opacity * 0.5}) 100%)`,
                  transform: 'translate(-50%, -50%)',
                  left: '50%',
                  top: '50%',
                  boxShadow: `0 0 ${20 * scale}px rgba(255,150,0,${opacity})`
                }}
              />
              {/* Sparks */}
              {[...Array(8)].map((_, i) => {
                const angle = (i / 8) * Math.PI * 2;
                const sparkDist = exp.radius * CELL_SIZE * scale * 0.8;
                return (
                  <div
                    key={i}
                    className="absolute w-2 h-2 bg-yellow-300 rounded-full"
                    style={{
                      left: `calc(50% + ${Math.cos(angle) * sparkDist}px)`,
                      top: `calc(50% + ${Math.sin(angle) * sparkDist}px)`,
                      transform: 'translate(-50%, -50%)',
                      opacity: opacity,
                      boxShadow: '0 0 4px rgba(255,200,0,0.8)'
                    }}
                  />
                );
              })}
            </div>
          );
        })}

        {/* Floating Texts */}
        {floatingTexts.map(ft => {
          const progress = (Date.now() - ft.startTime) / 1000;
          const yOffset = progress * 30;
          const opacity = 1 - progress;
          
          return (
            <div
              key={ft.id}
              className="absolute pointer-events-none font-bold text-sm"
              style={{
                left: (ft.x + 0.5) * CELL_SIZE,
                top: (ft.y + 0.5) * CELL_SIZE - yOffset,
                transform: 'translate(-50%, -50%)',
                color: ft.color,
                opacity: opacity,
                textShadow: '0 0 4px rgba(0,0,0,0.8)',
                fontSize: ft.text.includes('COMBO') ? '14px' : '12px'
              }}
            >
              {ft.text}
            </div>
          );
        })}

        {/* Wave Announcement */}
        {waveAnnouncement && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black/70 px-8 py-4 rounded-xl border-2 border-yellow-500 animate-pulse">
              <div className="text-3xl font-bold text-yellow-400">{waveAnnouncement}</div>
            </div>
          </div>
        )}

        {/* Combo Display */}
        {combo > 1 && (
          <div className="absolute top-16 right-4 bg-orange-600/90 px-4 py-2 rounded-lg border-2 border-orange-400 animate-pulse">
            <div className="text-xl font-bold text-white">{combo}x COMBO!</div>
          </div>
        )}

        {/* Active Ability Indicators */}
        {abilities.rage.active && (
          <div className="absolute top-4 left-4 bg-red-600/90 px-3 py-1 rounded-lg border-2 border-red-400 animate-pulse">
            <div className="text-sm font-bold text-white">😡 RAGE ACTIVE!</div>
          </div>
        )}
        {abilities.goldRush.active && (
          <div className="absolute top-12 left-4 bg-yellow-600/90 px-3 py-1 rounded-lg border-2 border-yellow-400 animate-pulse">
            <div className="text-sm font-bold text-white">💎 2X GOLD!</div>
          </div>
        )}

        {/* Particle Effects */}
        {particles.map(particle => {
          const progress = (Date.now() - particle.startTime) / 1000;
          if (particle.type === 'explosion') {
            return (
              <div
                key={particle.id}
                className="absolute pointer-events-none"
                style={{
                  left: (particle.x + 0.5) * CELL_SIZE,
                  top: (particle.y + 0.5) * CELL_SIZE,
                  transform: 'translate(-50%, -50%)',
                  opacity: 1 - progress
                }}
              >
                <div 
                  className="w-4 h-4 bg-orange-500 rounded-full"
                  style={{ transform: `scale(${1 + progress * 3})` }}
                />
              </div>
            );
          }
          if (particle.type === 'place') {
            return (
              <div
                key={particle.id}
                className="absolute pointer-events-none"
                style={{
                  left: (particle.x + 0.5) * CELL_SIZE,
                  top: (particle.y + 0.5) * CELL_SIZE,
                  transform: 'translate(-50%, -50%)',
                  opacity: 1 - progress
                }}
              >
                <div 
                  className="w-8 h-8 border-2 border-green-400 rounded-full"
                  style={{ transform: `scale(${1 + progress * 2})` }}
                />
              </div>
            );
          }
          return null;
        })}

        {/* Game Over Overlay */}
        {gameState === 'gameover' && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center overflow-y-auto py-4">
            <h2 className="text-4xl font-bold text-red-500 mb-4">GAME OVER</h2>
            <p className="text-xl text-white mb-2">You survived {wave} waves!</p>
            <div className="text-slate-300 mb-4 text-center">
              <p>🎯 Total Kills: {totalKills}</p>
              <p>💰 Gold Earned: {totalGoldEarned}</p>
              <p>🔥 Max Combo: {maxCombo}x</p>
              <p>✨ Perfect Waves: {perfectWaves}</p>
            </div>
            
            {/* Achievements earned */}
            {Object.keys(achievements).length > 0 && (
              <div className="mb-4">
                <div className="text-yellow-400 font-bold mb-2">🏆 Achievements Unlocked:</div>
                <div className="flex flex-wrap gap-2 justify-center max-w-md">
                  {Object.entries(achievements).filter(([_, v]) => v).map(([key]) => (
                    <div key={key} className="bg-yellow-600/50 px-2 py-1 rounded text-sm text-white">
                      {ACHIEVEMENTS[key].icon} {ACHIEVEMENTS[key].name}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="flex gap-4">
              <button
                onClick={restart}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold text-white text-xl"
              >
                Play Again
              </button>
              <button
                onClick={() => {
                  setGameState('start');
                  setShowDifficultySelect(false);
                  setSelectedDifficulty(null);
                  setWave(0);
                  setTowers([]);
                  setEnemies([]);
                  setProjectiles([]);
                  setExplosions([]);
                  spawnQueueRef.current = [];
                }}
                className="px-6 py-3 bg-slate-600 hover:bg-slate-500 rounded-lg font-bold text-white text-xl"
              >
                Main Menu
              </button>
            </div>
          </div>
        )}

        {/* Victory Overlay */}
        {gameState === 'victory' && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center">
            <h2 className="text-5xl font-bold text-yellow-400 mb-2">🎉 VICTORY! 🎉</h2>
            <p className="text-2xl text-white mb-2">You completed all {wave} waves!</p>
            <div className="text-emerald-300 mb-4 text-center">
              <p>🎯 Total Kills: {totalKills}</p>
              <p>💰 Gold Earned: {totalGoldEarned}</p>
              <p>🔥 Max Combo: {maxCombo}x</p>
            </div>
            <p className="text-lg text-emerald-400 mb-6">
              Difficulty: {DIFFICULTIES[selectedDifficulty]?.emoji} {DIFFICULTIES[selectedDifficulty]?.name}
            </p>
            <div className="flex gap-4">
              <button
                onClick={restart}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold text-white text-xl"
              >
                Play Again
              </button>
              <button
                onClick={() => {
                  setGameState('start');
                  setShowDifficultySelect(false);
                  setSelectedDifficulty(null);
                  setWave(0);
                  setTowers([]);
                  setEnemies([]);
                  setProjectiles([]);
                  setExplosions([]);
                  spawnQueueRef.current = [];
                }}
                className="px-6 py-3 bg-slate-600 hover:bg-slate-500 rounded-lg font-bold text-white text-xl"
              >
                Main Menu
              </button>
            </div>
          </div>
        )}
      </div>
      </div> {/* Close flex for mini-map */}

      {/* Tower info panel */}
      {selectedPlacedTower && (
        <div className="mt-4 bg-slate-800 rounded-lg p-4 text-white">
          {(() => {
            const tower = towers.find(t => t.id === selectedPlacedTower);
            if (!tower) return null;
            
            // Check for synergies with adjacent towers
            const adjacentTowers = towers.filter(t => {
              const dx = Math.abs(t.x - tower.x);
              const dy = Math.abs(t.y - tower.y);
              return (dx <= 1 && dy <= 1 && t.id !== tower.id);
            });
            
            const activeSynergies = [];
            adjacentTowers.forEach(adj => {
              const key1 = `${tower.type}-${adj.type}`;
              const key2 = `${adj.type}-${tower.type}`;
              if (TOWER_SYNERGIES[key1]) activeSynergies.push(TOWER_SYNERGIES[key1]);
              else if (TOWER_SYNERGIES[key2]) activeSynergies.push(TOWER_SYNERGIES[key2]);
            });
            
            return (
              <div className="flex flex-col gap-2">
                <div className="font-bold text-lg">{tower.name} Tower <span className="text-yellow-400">Lv.{tower.level}</span></div>
                <div className="flex gap-4 text-sm">
                  <div>
                    ⚔️ Damage: <span className="text-red-400 font-semibold">{tower.damage}</span>
                    {tower.damageLevel > 0 && <span className="text-red-300 text-xs ml-1">(+{tower.damageLevel})</span>}
                  </div>
                  <div>
                    ⚡ Fire Rate: <span className="text-yellow-400 font-semibold">{(tower.fireRate / 1000).toFixed(2)}s</span>
                    {tower.speedLevel > 0 && <span className="text-yellow-300 text-xs ml-1">(+{tower.speedLevel})</span>}
                  </div>
                  <div>
                    📏 Range: <span className="text-blue-400 font-semibold">{tower.range}</span>
                    {tower.rangeLevel > 0 && <span className="text-blue-300 text-xs ml-1">(+{tower.rangeLevel})</span>}
                  </div>
                </div>
                
                {/* Targeting Mode Selector */}
                {tower.damage > 0 && !tower.spawnPawn && !tower.income && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-sm text-slate-400">Target:</span>
                    <div className="flex gap-1">
                      {Object.entries(TARGETING_MODES).map(([key, mode]) => (
                        <button
                          key={key}
                          onClick={() => {
                            setTowers(prev => prev.map(t => 
                              t.id === tower.id ? { ...t, targetMode: key } : t
                            ));
                          }}
                          className={`px-2 py-1 text-xs rounded transition-all ${
                            (tower.targetMode || 'first') === key
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          }`}
                          title={mode.description}
                        >
                          {mode.icon} {mode.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Active Synergies */}
                {activeSynergies.length > 0 && (
                  <div className="mt-2 p-2 bg-purple-900/40 rounded border border-purple-500/50">
                    <div className="text-xs text-purple-300 font-bold mb-1">✨ Active Synergies:</div>
                    {activeSynergies.map((syn, i) => (
                      <div key={i} className="text-xs text-purple-200">{syn.description}</div>
                    ))}
                  </div>
                )}
                
                {/* Tower Specialization at max level */}
                {tower.level >= 5 && !tower.specialization && TOWER_SPECIALIZATIONS[tower.type] && (
                  <div className="mt-3 p-3 bg-gradient-to-r from-yellow-900/40 to-orange-900/40 rounded-lg border border-yellow-500/50">
                    <div className="text-sm text-yellow-300 font-bold mb-2">⭐ Choose Specialization:</div>
                    <div className="flex gap-2">
                      {Object.entries(TOWER_SPECIALIZATIONS[tower.type]).map(([key, spec]) => (
                        <button
                          key={key}
                          onClick={() => {
                            setTowers(prev => prev.map(t => 
                              t.id === tower.id ? { ...t, specialization: key, ...spec.effect } : t
                            ));
                          }}
                          className="flex-1 p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-all text-left"
                        >
                          <div className="font-bold text-white flex items-center gap-1">
                            {spec.icon} {spec.name}
                          </div>
                          <div className="text-xs text-slate-300">{spec.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Show active specialization */}
                {tower.specialization && TOWER_SPECIALIZATIONS[tower.type]?.[tower.specialization] && (
                  <div className="mt-2 p-2 bg-yellow-900/30 rounded border border-yellow-500/30">
                    <div className="text-xs text-yellow-300 font-bold flex items-center gap-1">
                      ⭐ {TOWER_SPECIALIZATIONS[tower.type][tower.specialization].icon} 
                      {TOWER_SPECIALIZATIONS[tower.type][tower.specialization].name}
                    </div>
                  </div>
                )}
                
                {/* Upgrade and Sell buttons */}
                <div className="flex gap-2 mt-3">
                  {tower.level < 5 && (
                    <>
                      <button
                        onClick={() => upgradeTower(tower.id, 'damage')}
                        disabled={gold < Math.floor(tower.cost * (tower.level * 0.5 + 0.5))}
                        className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-500 disabled:bg-slate-600 disabled:opacity-50 rounded-lg text-sm font-bold transition-all"
                      >
                        ⚔️ DMG (${Math.floor(tower.cost * (tower.level * 0.5 + 0.5))})
                      </button>
                      <button
                        onClick={() => upgradeTower(tower.id, 'speed')}
                        disabled={gold < Math.floor(tower.cost * (tower.level * 0.5 + 0.5))}
                        className="flex-1 px-3 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:bg-slate-600 disabled:opacity-50 rounded-lg text-sm font-bold transition-all"
                      >
                        ⚡ SPD (${Math.floor(tower.cost * (tower.level * 0.5 + 0.5))})
                      </button>
                      <button
                        onClick={() => upgradeTower(tower.id, 'range')}
                        disabled={gold < Math.floor(tower.cost * (tower.level * 0.5 + 0.5))}
                        className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:opacity-50 rounded-lg text-sm font-bold transition-all"
                      >
                        📏 RNG (${Math.floor(tower.cost * (tower.level * 0.5 + 0.5))})
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      if (confirmSell === tower.id) {
                        sellTower(tower.id);
                        setConfirmSell(null);
                      } else {
                        setConfirmSell(tower.id);
                        setTimeout(() => setConfirmSell(null), 3000);
                      }
                    }}
                    className={`px-3 py-2 rounded-lg text-sm font-bold transition-all ${
                      confirmSell === tower.id 
                        ? 'bg-red-600 hover:bg-red-500 animate-pulse' 
                        : 'bg-slate-600 hover:bg-slate-500'
                    }`}
                  >
                    {confirmSell === tower.id ? '⚠️ Confirm?' : `💰 Sell ($${Math.floor(tower.cost * tower.level * 0.5)})`}
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Keyboard Shortcuts Help */}
      <div className="mt-4 flex gap-4 justify-center flex-wrap text-xs">
        <div className="bg-slate-800 px-3 py-2 rounded-lg">
          <div className="text-slate-400 font-bold mb-1">⌨️ Keyboard Shortcuts</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-300">
            <span><kbd className="bg-slate-700 px-1 rounded">1-9</kbd> Tower</span>
            <span><kbd className="bg-slate-700 px-1 rounded">Space</kbd> Pause</span>
            <span><kbd className="bg-slate-700 px-1 rounded">+/-</kbd> Speed</span>
            <span><kbd className="bg-slate-700 px-1 rounded">Q</kbd> Nuke</span>
            <span><kbd className="bg-slate-700 px-1 rounded">W</kbd> Freeze</span>
            <span><kbd className="bg-slate-700 px-1 rounded">E</kbd> Gold Rush</span>
            <span><kbd className="bg-slate-700 px-1 rounded">R</kbd> Rage</span>
          </div>
        </div>
        
        {/* Stats Summary */}
        <div className="bg-slate-800 px-3 py-2 rounded-lg">
          <div className="text-slate-400 font-bold mb-1">📊 Session Stats</div>
          <div className="flex gap-4 text-slate-300">
            <span title="Total Kills">🎯 {totalKills}</span>
            <span title="Max Combo">🔥 {maxCombo}x</span>
            <span title="Perfect Waves">✨ {perfectWaves}</span>
            <span title="Player Level">⭐ Lv.{playerLevel}</span>
            <span title="Achievements">🏆 {Object.keys(achievements).filter(k => achievements[k]).length}/{Object.keys(ACHIEVEMENTS).length}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 text-gray-400 text-sm text-center max-w-lg">
        <p>Click on the grid to place towers. Click placed towers to upgrade or sell them.</p>
        <p className="mt-1">🟢 Spawn | 🔴 Exit | 💰 Power-ups drop from enemies!</p>
      </div>
    </div>
  );
}
