export const WIDTH = 1280;
export const HEIGHT = 720;

export const WEAPONS = [
  { name: 'PISTOL',       color:'#ffcb3a', dmg: 25, fireRate: 280, speed: 14, spread: 0.03, ammo: 8,  reload: 900,  shots: 1, sfx:'pistol',   bulletLen: 10 },
  { name: 'SMG',          color:'#3affcb', dmg: 14, fireRate: 90,  speed: 16, spread: 0.09, ammo: 25, reload: 1100, shots: 1, sfx:'smg',      bulletLen: 8 },
  { name: 'SHOTGUN',      color:'#ff6b3a', dmg: 14, fireRate: 600, speed: 13, spread: 0.18, ammo: 6,  reload: 1400, shots: 6, sfx:'shotgun',  bulletLen: 8 },
  { name: 'CROSSBOW',     color:'#9d6bff', dmg: 55, fireRate: 500, speed: 20, spread: 0.01, ammo: 4,  reload: 1300, shots: 1, sfx:'crossbow', bulletLen: 16, piercing: true },
  { name: 'RIFLE',        color:'#9dff3a', dmg: 30, fireRate: 160, speed: 18, spread: 0.05, ammo: 20, reload: 1200, shots: 1, sfx:'rifle',    bulletLen: 12 },
  { name: 'FLAMETHROWER', color:'#ff8a3a', dmg: 8,  fireRate: 50,  speed: 8,  spread: 0.22, ammo: 60, reload: 1600, shots: 1, sfx:'flame',    bulletLen: 14, flame: true },
  { name: 'SNIPER',       color:'#3a9dff', dmg: 80, fireRate: 900, speed: 30, spread: 0,    ammo: 3,  reload: 1600, shots: 1, sfx:'sniper',   bulletLen: 18, piercing: true },
  { name: 'MINIGUN',      color:'#ffff3a', dmg: 10, fireRate: 55,  speed: 17, spread: 0.14, ammo: 50, reload: 1800, shots: 1, sfx:'minigun',  bulletLen: 7 },
  { name: 'LASER',        color:'#ff3aff', dmg: 22, fireRate: 150, speed: 26, spread: 0,    ammo: 18, reload: 1300, shots: 1, sfx:'laser',    bulletLen: 22 },
  { name: 'ROCKET',       color:'#ff3a3a', dmg: 45, fireRate: 700, speed: 9,  spread: 0.02, ammo: 2,  reload: 1500, shots: 1, sfx:'rocket',   bulletLen: 14, explosive: true, radius: 110 },
  { name: 'GRENADES',     color:'#3aff3a', dmg: 55, fireRate: 600, speed: 10, spread: 0.03, ammo: 3,  reload: 1400, shots: 1, sfx:'rocket',   bulletLen: 10, explosive: true, radius: 130, grenade: true },
  { name: 'FLAK GUN',     color:'#ffcb3a', dmg: 18, fireRate: 350, speed: 12, spread: 0.22, ammo: 8,  reload: 1300, shots: 4, sfx:'shotgun',  bulletLen: 10, explosive: true, radius: 55 },
  { name: 'RAILGUN',      color:'#3affff', dmg: 100,fireRate: 1100,speed: 40, spread: 0,    ammo: 2,  reload: 1800, shots: 1, sfx:'sniper',   bulletLen: 30, piercing: true },
  { name: 'KNIFE',        color:'#ffffff', dmg: 200,fireRate: 280, speed: 0,  spread: 0,    ammo: 99, reload: 0,    shots: 1, sfx:'pistol',   bulletLen: 0, melee: true }
];

export const POWERUPS = [
  { type: 'damage', color: '#ff3a3a', icon: '✦', duration: 10000, label: 'DOUBLE DMG' },
  { type: 'speed',  color: '#3affcb', icon: '»', duration: 10000, label: 'SPEED BOOST' },
  { type: 'shield', color: '#3a9dff', icon: '◈', duration: 7000,  label: 'SHIELD' },
  { type: 'triple', color: '#ff3aff', icon: '≡', duration: 9000,  label: 'TRIPLE SHOT' },
  { type: 'rapid',  color: '#ffcb3a', icon: '⚡', duration: 8000,  label: 'RAPID FIRE' },
  { type: 'regen',  color: '#3aff9d', icon: '♥', duration: 6000,  label: 'HP REGEN' }
];

export const STREAKS = [
  { at: 2,  name: 'DOUBLE KILL',  color: '#ffcb3a' },
  { at: 3,  name: 'TRIPLE KILL',  color: '#ff8a3a' },
  { at: 4,  name: 'RAMPAGE!',     color: '#ff3a5c' },
  { at: 5,  name: 'DOMINATING!',  color: '#ff3aff' },
  { at: 7,  name: 'UNSTOPPABLE!', color: '#3affff' },
  { at: 10, name: 'GODLIKE!',     color: '#ffffff' }
];

export const SPAWN_POINTS = [
  { x: 100,  y: 360 },
  { x: 1180, y: 360 }
];

export const PLAYER_COLORS = ['#3a9dff', '#ff6b3a'];

export const ARENA_WALLS = [
  { x: 280,  y: 160, w: 120, h: 30,  hp: 100 },
  { x: 880,  y: 160, w: 120, h: 30,  hp: 100 },
  { x: 280,  y: 530, w: 120, h: 30,  hp: 100 },
  { x: 880,  y: 530, w: 120, h: 30,  hp: 100 },
  { x: 150,  y: 330, w: 30,  h: 120, hp: 120 },
  { x: 1100, y: 330, w: 30,  h: 120, hp: 120 },
  { x: 560,  y: 100, w: 160, h: 30,  hp: 120 },
  { x: 560,  y: 590, w: 160, h: 30,  hp: 120 },
  { x: 600,  y: 340, w: 80,  h: 40,  hp: 99999, indestructible: true },
  { x: 420,  y: 280, w: 40,  h: 40,  hp: 80 },
  { x: 820,  y: 280, w: 40,  h: 40,  hp: 80 },
  { x: 420,  y: 400, w: 40,  h: 40,  hp: 80 },
  { x: 820,  y: 400, w: 40,  h: 40,  hp: 80 }
];

export const ARENA_BARRELS = [
  { x: 500, y: 200, r: 18 },
  { x: 780, y: 200, r: 18 },
  { x: 500, y: 520, r: 18 },
  { x: 780, y: 520, r: 18 },
  { x: 640, y: 440, r: 18 }
];
