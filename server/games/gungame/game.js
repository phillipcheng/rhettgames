import {
  WEAPONS, POWERUPS, STREAKS, SPAWN_POINTS, PLAYER_COLORS,
  ARENA_WALLS, ARENA_BARRELS, WIDTH, HEIGHT
} from '../../../shared/constants.js';
import { circleRectCollide, normalizeAngle } from '../../../shared/util.js';

const W = WIDTH, H = HEIGHT;

export class Game {
  constructor(){
    this.reset();
  }

  reset(){
    const prevNames = this.players ? this.players.map(p => p.name) : [null, null];
    this.players = [this.makePlayer(0), this.makePlayer(1)];
    for (let i = 0; i < 2; i++) {
      if (prevNames[i]) this.players[i].name = prevNames[i];
    }
    this.bullets = [];
    this.explosions = [];
    this.pickups = [];
    this.airstrikeWarnings = [];
    this.walls = ARENA_WALLS.map((w, i) => ({
      idx: i, x: w.x, y: w.y, w: w.w, h: w.h,
      hp: w.hp, maxHp: w.hp, destroyed: false, indestructible: !!w.indestructible
    }));
    this.barrels = ARENA_BARRELS.map((b, i) => ({
      idx: i, x: b.x, y: b.y, r: b.r, alive: true
    }));
    this.killFeed = [];
    this.announcement = null;
    this.time = 0;
    this.pickupSpawnTimer = 3500;
    this.airstrikeTimer = 22000;
    this.winner = -1;
    this.running = true;
    this.events = [];
    this.inputs = [this.emptyInput(), this.emptyInput()];
    this._pendingBarrelExplosions = [];
  }

  emptyInput(){
    return { up: 0, down: 0, left: 0, right: 0, shoot: 0, reload: 0, dash: 0, ult: 0 };
  }

  makePlayer(id){
    const sp = SPAWN_POINTS[id];
    return {
      id, name: 'Player ' + (id + 1),
      active: true,
      x: sp.x, y: sp.y, vx: 0, vy: 0,
      r: 18, color: PLAYER_COLORS[id],
      angle: id === 0 ? 0 : Math.PI,
      hp: 100, maxHp: 100, speed: 3.2,
      weaponLevel: 0,
      ammo: WEAPONS[0].ammo,
      reloading: false, reloadUntil: 0,
      nextShot: 0,
      kills: 0, deaths: 0,
      dashCooldown: 0, dashing: 0,
      dashDir: { x: 0, y: 0 },
      invuln: 0, recoil: 0,
      alive: true, respawnAt: 0,
      spawnIndex: id,
      powerups: {},
      ultCharge: 0,
      ultActive: 0,
      ultType: null,
      ultReadyAnnounced: false,
      streak: 0,
      lastKillTime: -10000,
      damageDealt: 0
    };
  }

  setInput(playerId, input){
    if (playerId < 0 || playerId > 1) return;
    this.inputs[playerId] = {
      up: !!input.up, down: !!input.down, left: !!input.left, right: !!input.right,
      shoot: !!input.shoot, reload: !!input.reload, dash: !!input.dash, ult: !!input.ult
    };
  }

  clearInput(playerId){
    if (playerId < 0 || playerId > 1) return;
    this.inputs[playerId] = this.emptyInput();
  }

  setName(playerId, name){
    if (playerId < 0 || playerId > 1) return;
    const clean = String(name || '').trim().slice(0, 16);
    this.players[playerId].name = clean || ('Player ' + (playerId + 1));
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

  announce(text, color){
    this.announcement = { text, color: color || '#ffcb3a', life: 1800, max: 1800 };
    this.emit({ kind: 'announce', text, color: color || '#ffcb3a' });
  }

  isSolidWall(w){ return !w.destroyed; }

  moveWithCollision(p, dx, dy){
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4));
    const sx = dx / steps, sy = dy / steps;
    for (let s = 0; s < steps; s++) {
      const nx = p.x + sx;
      let blocked = false;
      if (nx - p.r < 0 || nx + p.r > W) blocked = true;
      if (!blocked) {
        for (const w of this.walls) {
          if (!this.isSolidWall(w)) continue;
          if (circleRectCollide(nx, p.y, p.r, w.x, w.y, w.w, w.h)) { blocked = true; break; }
        }
      }
      if (!blocked) {
        for (const br of this.barrels) {
          if (!br.alive) continue;
          if (Math.hypot(nx - br.x, p.y - br.y) < p.r + br.r) { blocked = true; break; }
        }
      }
      if (!blocked) p.x = nx;

      const ny = p.y + sy;
      blocked = false;
      if (ny - p.r < 0 || ny + p.r > H) blocked = true;
      if (!blocked) {
        for (const w of this.walls) {
          if (!this.isSolidWall(w)) continue;
          if (circleRectCollide(p.x, ny, p.r, w.x, w.y, w.w, w.h)) { blocked = true; break; }
        }
      }
      if (!blocked) {
        for (const br of this.barrels) {
          if (!br.alive) continue;
          if (Math.hypot(p.x - br.x, ny - br.y) < p.r + br.r) { blocked = true; break; }
        }
      }
      if (!blocked) p.y = ny;
    }
  }

  bulletHitsWall(b){
    if (b.x < 0 || b.x > W || b.y < 0 || b.y > H) return { hit: true, wall: null };
    for (const w of this.walls) {
      if (!this.isSolidWall(w)) continue;
      if (b.x >= w.x && b.x <= w.x + w.w && b.y >= w.y && b.y <= w.y + w.h) {
        return { hit: true, wall: w };
      }
    }
    return { hit: false, wall: null };
  }

  isInvulnerable(p){
    if (p.invuln > 0) return true;
    if (p.powerups.shield) return true;
    if (p.ultActive > 0 && p.ultType === 'ghost') return true;
    return false;
  }

  tryShoot(p){
    if (!p.alive) return;
    const weapon = WEAPONS[p.weaponLevel];

    let fireRateMult = 1;
    if (p.powerups.rapid) fireRateMult = 0.45;
    if (p.ultActive > 0 && p.ultType === 'berserk') fireRateMult *= 0.5;

    if (this.time < p.nextShot) return;
    if (p.reloading) return;
    if (p.ammo <= 0) { this.startReload(p); return; }

    if (weapon.melee) {
      p.nextShot = this.time + weapon.fireRate * fireRateMult;
      p.recoil = 6;
      this.emit({ kind: 'melee-swing', ownerId: p.id, x: p.x, y: p.y, angle: p.angle });
      const enemy = this.players[1 - p.id];
      if (enemy.alive && !this.isInvulnerable(enemy)) {
        const dx = enemy.x - p.x, dy = enemy.y - p.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 55) {
          const facing = Math.atan2(dy, dx);
          const diff = Math.abs(normalizeAngle(facing - p.angle));
          if (diff < 1.1) this.damagePlayer(enemy, weapon.dmg, p, weapon);
        }
      }
      return;
    }

    p.nextShot = this.time + weapon.fireRate * fireRateMult;
    p.ammo--;
    p.recoil = 4;

    const mfx = p.x + Math.cos(p.angle) * (p.r + 14);
    const mfy = p.y + Math.sin(p.angle) * (p.r + 14);
    this.emit({
      kind: 'shot',
      ownerId: p.id, x: mfx, y: mfy, angle: p.angle,
      weaponIdx: p.weaponLevel, color: weapon.color, sfx: weapon.sfx,
      ejectShell: !weapon.explosive && !weapon.melee && weapon.sfx !== 'laser' && weapon.sfx !== 'flame',
      shellX: p.x + Math.cos(p.angle) * p.r,
      shellY: p.y + Math.sin(p.angle) * p.r
    });

    const triple = !!p.powerups.triple;
    let dmgMult = 1;
    if (p.powerups.damage) dmgMult = 2;
    if (p.ultActive > 0 && p.ultType === 'berserk') dmgMult *= 1.3;

    for (let s = 0; s < weapon.shots; s++) {
      const spreadVariants = triple ? [-0.22, 0, 0.22] : [0];
      for (const sv of spreadVariants) {
        const spread = (Math.random() - 0.5) * 2 * weapon.spread + sv;
        const ang = p.angle + spread;
        const bx = p.x + Math.cos(p.angle) * (p.r + 10);
        const by = p.y + Math.sin(p.angle) * (p.r + 10);
        this.bullets.push({
          x: bx, y: by,
          vx: Math.cos(ang) * weapon.speed,
          vy: Math.sin(ang) * weapon.speed,
          dmg: weapon.dmg * dmgMult,
          owner: p.id,
          color: weapon.color,
          len: weapon.bulletLen,
          explosive: !!weapon.explosive,
          radius: weapon.radius || 0,
          grenade: !!weapon.grenade,
          bounces: weapon.grenade ? 3 : 0,
          piercing: !!weapon.piercing,
          flame: !!weapon.flame,
          hitList: [],
          life: weapon.grenade ? 1200 : (weapon.flame ? 500 : 2500),
          max: weapon.grenade ? 1200 : (weapon.flame ? 500 : 2500),
          angle: ang
        });
      }
    }

    p.vx -= Math.cos(p.angle) * 0.6;
    p.vy -= Math.sin(p.angle) * 0.6;

    if (p.ammo <= 0 && !weapon.melee) this.startReload(p);
  }

  startReload(p){
    const weapon = WEAPONS[p.weaponLevel];
    if (weapon.melee) return;
    if (p.reloading) return;
    if (p.ammo >= weapon.ammo) return;
    p.reloading = true;
    const reloadMult = p.powerups.rapid ? 0.6 : 1;
    p.reloadUntil = this.time + weapon.reload * reloadMult;
    this.emit({ kind: 'reload', playerId: p.id });
  }

  damagePlayer(p, dmg, from, weapon){
    if (!p.alive || this.isInvulnerable(p)) {
      if (p.alive && (p.powerups.shield || (p.ultActive > 0 && p.ultType === 'ghost'))) {
        this.emit({
          kind: 'shield-hit', x: p.x, y: p.y,
          color: p.powerups.shield ? '#3a9dff' : '#9d6bff'
        });
      }
      return;
    }
    p.hp -= dmg;
    this.emit({ kind: 'hit', x: p.x, y: p.y, targetId: p.id });

    if (from && from !== p) {
      from.damageDealt += dmg;
      from.ultCharge = Math.min(100, from.ultCharge + dmg * 0.55);
      if (from.ultCharge >= 100 && !from.ultReadyAnnounced) {
        from.ultReadyAnnounced = true;
        this.emit({ kind: 'ult-ready', playerId: from.id, x: from.x, y: from.y });
      }
    }

    if (p.hp <= 0) this.killPlayer(p, from, weapon);
  }

  killPlayer(p, from, weapon){
    p.alive = false;
    p.hp = 0;
    p.deaths++;
    p.streak = 0;
    p.respawnAt = this.time + 1600;
    this.emit({
      kind: 'kill',
      x: p.x, y: p.y, victimId: p.id,
      killerId: from ? from.id : -1,
      color: p.color,
      killerColor: from ? from.color : '#fff'
    });

    if (Math.random() < 0.35) {
      const pu = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
      this.pickups.push({
        kind: 'powerup', powerup: pu,
        x: p.x, y: p.y, r: 14, life: 10000, max: 10000, pulse: 0
      });
    }

    if (from && from.alive && from !== p) {
      from.kills++;

      if (this.time - from.lastKillTime < 8000) from.streak++;
      else from.streak = 1;
      from.lastKillTime = this.time;

      for (let si = STREAKS.length - 1; si >= 0; si--) {
        if (from.streak === STREAKS[si].at) {
          this.announce(from.name + ' ' + STREAKS[si].name, STREAKS[si].color);
          this.emit({ kind: 'streak', playerId: from.id, streak: from.streak });
          break;
        }
      }

      if (weapon && weapon.melee) {
        if (p.weaponLevel > 0) {
          p.weaponLevel--;
          p.ammo = WEAPONS[p.weaponLevel].ammo;
          this.emit({ kind: 'demote', playerId: p.id, x: p.x, y: p.y });
        }
      }

      from.weaponLevel++;
      if (from.weaponLevel >= WEAPONS.length) {
        this.winner = from.id;
        this.running = false;
        from.weaponLevel = WEAPONS.length - 1;
        this.emit({ kind: 'win', playerId: from.id });
      } else {
        this.emit({ kind: 'levelup', playerId: from.id, weaponIdx: from.weaponLevel, x: from.x, y: from.y });
        from.ammo = WEAPONS[from.weaponLevel].ammo;
        from.reloading = false;
      }

      from.hp = Math.min(from.maxHp, from.hp + 25);

      this.killFeed.push({
        text: from.name + ' ➜ ' + p.name,
        weapon: weapon ? (weapon.name || '') : '',
        color: from.color,
        life: 3500, max: 3500
      });
      if (this.killFeed.length > 4) this.killFeed.shift();
    }
  }

  respawnPlayer(p){
    const enemy = this.players[1 - p.id];
    const sp = SPAWN_POINTS[p.spawnIndex];
    const dSelf = Math.hypot(sp.x - enemy.x, sp.y - enemy.y);
    const other = SPAWN_POINTS[1 - p.spawnIndex];
    const dOther = Math.hypot(other.x - enemy.x, other.y - enemy.y);
    const chosen = dSelf > dOther ? sp : other;
    p.x = chosen.x; p.y = chosen.y;
    p.vx = 0; p.vy = 0;
    p.hp = p.maxHp;
    p.alive = true;
    p.invuln = 1500;
    p.ammo = WEAPONS[p.weaponLevel].ammo;
    p.reloading = false;
    p.angle = chosen.x < W / 2 ? 0 : Math.PI;
    p.powerups = {};
  }

  createExplosion(x, y, radius, dmg, ownerId){
    this.explosions.push({ x, y, radius, max: radius, life: 420, maxLife: 420 });
    this.emit({ kind: 'explosion', x, y, radius });

    const owner = (ownerId != null && ownerId >= 0 && this.players[ownerId]) ? this.players[ownerId] : null;

    for (const pl of this.players) {
      if (!pl.alive) continue;
      const d = Math.hypot(pl.x - x, pl.y - y);
      if (d < radius) {
        const falloff = 1 - (d / radius);
        const dmgAmt = Math.round(dmg * (0.3 + falloff * 0.7));
        this.damagePlayer(pl, dmgAmt, owner, { dmg: dmgAmt, name: 'EXPLOSIVE' });
        const ang = Math.atan2(pl.y - y, pl.x - x);
        pl.vx += Math.cos(ang) * 6 * falloff;
        pl.vy += Math.sin(ang) * 6 * falloff;
      }
    }

    for (const w of this.walls) {
      if (w.indestructible || w.destroyed) continue;
      const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
      const wd = Math.hypot(cx - x, cy - y);
      if (wd < radius + Math.max(w.w, w.h) / 2) {
        this.damageWall(w, dmg * (1 - Math.min(1, wd / radius)));
      }
    }

    for (const br of this.barrels) {
      if (!br.alive) continue;
      const bd = Math.hypot(br.x - x, br.y - y);
      if (bd < radius) {
        this._pendingBarrelExplosions.push({
          barrel: br,
          ownerId,
          triggerAt: this.time + 80 + Math.random() * 120
        });
      }
    }
  }

  damageWall(w, dmg){
    if (w.indestructible || w.destroyed) return;
    w.hp -= dmg;
    if (w.hp <= 0) {
      w.destroyed = true;
      this.emit({ kind: 'wall-destroy', idx: w.idx, x: w.x, y: w.y, w: w.w, h: w.h });
    }
  }

  explodeBarrel(br, ownerId){
    if (!br.alive) return;
    br.alive = false;
    this.emit({ kind: 'barrel-explode', x: br.x, y: br.y });
    this.createExplosion(br.x, br.y, 100, 50, ownerId);
  }

  triggerUltimate(p){
    if (p.ultCharge < 100 || !p.alive) return;
    if (p.ultActive > 0) return;
    p.ultCharge = 0;
    p.ultReadyAnnounced = false;

    const ults = ['berserk', 'ghost', 'nuke'];
    const ult = ults[Math.floor(Math.random() * ults.length)];
    p.ultType = ult;

    if (ult === 'berserk') {
      p.ultActive = 5000;
      this.announce(p.name + ' BERSERK!', p.color);
    } else if (ult === 'ghost') {
      p.ultActive = 4000;
      this.announce(p.name + ' GHOST MODE!', '#9d6bff');
    } else if (ult === 'nuke') {
      p.ultActive = 100;
      this.announce(p.name + ' NUKE!', '#ff3a3a');
      p.invuln = Math.max(p.invuln, 600);
      this.createExplosion(p.x, p.y, 180, 70, p.id);
    }
    this.emit({ kind: 'ult-activate', playerId: p.id, ultType: ult, x: p.x, y: p.y, color: p.color });
  }

  spawnPickup(){
    let tries = 30;
    while (tries-- > 0) {
      const x = 80 + Math.random() * (W - 160);
      const y = 80 + Math.random() * (H - 160);
      let bad = false;
      for (const w of this.walls) {
        if (!this.isSolidWall(w)) continue;
        if (circleRectCollide(x, y, 24, w.x, w.y, w.w, w.h)) { bad = true; break; }
      }
      if (bad) continue;
      if (Math.random() < 0.4) {
        this.pickups.push({ kind: 'health', x, y, r: 14, life: 15000, max: 15000, pulse: 0 });
      } else {
        const pu = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
        this.pickups.push({ kind: 'powerup', powerup: pu, x, y, r: 14, life: 15000, max: 15000, pulse: 0 });
      }
      return;
    }
  }

  applyPowerup(p, pu){
    p.powerups[pu.type] = this.time + pu.duration;
    this.emit({
      kind: 'pickup', playerId: p.id, x: p.x, y: p.y,
      kind2: 'powerup', powerupType: pu.type, color: pu.color, label: pu.label
    });
  }

  spawnAirstrike(){
    const tx = 220 + Math.random() * (W - 440);
    const ty = 160 + Math.random() * (H - 320);
    const strikes = [];
    for (let i = 0; i < 5; i++) {
      strikes.push({
        x: tx + (Math.random() - 0.5) * 180,
        y: ty + (Math.random() - 0.5) * 180,
        delay: 1800 + i * 250,
        triggered: false
      });
    }
    this.airstrikeWarnings.push({ x: tx, y: ty, radius: 140, life: 3800, max: 3800, strikes });
    this.emit({ kind: 'airstrike-warning', x: tx, y: ty });
    this.announce('⚠ AIRSTRIKE INBOUND ⚠', '#ff3a5c');
  }

  handlePlayerInput(p, ctl){
    if (!p.alive) return;

    let ax = 0, ay = 0;
    if (ctl.up) ay -= 1;
    if (ctl.down) ay += 1;
    if (ctl.left) ax -= 1;
    if (ctl.right) ax += 1;
    const mag = Math.hypot(ax, ay);
    if (mag > 0) { ax /= mag; ay /= mag; }

    if (ctl.dash && p.dashCooldown <= 0 && (ax !== 0 || ay !== 0)) {
      p.dashing = 180;
      p.dashCooldown = 1200;
      p.dashDir.x = ax;
      p.dashDir.y = ay;
      p.invuln = Math.max(p.invuln, 180);
      this.emit({ kind: 'dash', playerId: p.id, x: p.x, y: p.y, color: p.color });
    }

    if (ctl.ult) this.triggerUltimate(p);

    let spd = p.speed;
    if (p.powerups.speed) spd *= 1.5;
    if (p.ultActive > 0 && p.ultType === 'berserk') spd *= 1.3;

    if (p.dashing > 0) {
      spd = 10;
      ax = p.dashDir.x; ay = p.dashDir.y;
    }

    p.vx += ax * spd * 0.35;
    p.vy += ay * spd * 0.35;

    if (ax !== 0 || ay !== 0) {
      const targetAngle = Math.atan2(ay, ax);
      const diff = normalizeAngle(targetAngle - p.angle);
      p.angle += diff * 0.25;
    }

    if (ctl.shoot) this.tryShoot(p);
    if (ctl.reload) this.startReload(p);
  }

  tick(dt){
    if (!this.running) {
      if (this.announcement) {
        this.announcement.life -= dt;
        if (this.announcement.life <= 0) this.announcement = null;
      }
      return;
    }
    this.time += dt;

    for (let i = this._pendingBarrelExplosions.length - 1; i >= 0; i--) {
      const pb = this._pendingBarrelExplosions[i];
      if (this.time >= pb.triggerAt) {
        this.explodeBarrel(pb.barrel, pb.ownerId);
        this._pendingBarrelExplosions.splice(i, 1);
      }
    }

    for (const p of this.players) { if (p.active) this.handlePlayerInput(p, this.inputs[p.id]); }

    for (const p of this.players) {
      if (!p.active) continue;
      if (!p.alive) {
        if (this.time >= p.respawnAt) this.respawnPlayer(p);
        continue;
      }

      for (const k in p.powerups) {
        if (p.powerups[k] <= this.time) delete p.powerups[k];
      }
      if (p.powerups.regen) p.hp = Math.min(p.maxHp, p.hp + dt * 0.015);

      if (p.invuln > 0) p.invuln -= dt;
      if (p.recoil > 0) p.recoil = Math.max(0, p.recoil - dt * 0.02);
      if (p.dashCooldown > 0) p.dashCooldown -= dt;
      if (p.dashing > 0) p.dashing -= dt;
      if (p.ultActive > 0) p.ultActive -= dt;

      if (p.reloading && this.time >= p.reloadUntil) {
        p.reloading = false;
        p.ammo = WEAPONS[p.weaponLevel].ammo;
      }

      p.vx *= 0.82;
      p.vy *= 0.82;
      this.moveWithCollision(p, p.vx, p.vy);
    }

    for (let b = this.bullets.length - 1; b >= 0; b--) {
      const bullet = this.bullets[b];
      bullet.life -= dt;
      if (bullet.life <= 0) {
        if (bullet.explosive) this.createExplosion(bullet.x, bullet.y, bullet.radius, bullet.dmg, bullet.owner);
        this.bullets.splice(b, 1);
        continue;
      }

      if (bullet.flame) {
        bullet.vx *= 0.96;
        bullet.vy *= 0.96;
      }

      const speed = Math.hypot(bullet.vx, bullet.vy);
      const substeps = Math.max(1, Math.ceil(speed / 6));
      let stepX = bullet.vx / substeps;
      let stepY = bullet.vy / substeps;
      let consumed = false;

      for (let ss = 0; ss < substeps; ss++) {
        bullet.x += stepX;
        bullet.y += stepY;

        const wallHit = this.bulletHitsWall(bullet);
        if (wallHit.hit) {
          if (bullet.grenade && bullet.bounces > 0) {
            bullet.x -= stepX;
            bullet.y -= stepY;
            let xBlock = (bullet.x + stepX < 0 || bullet.x + stepX > W);
            let yBlock = (bullet.y + stepY < 0 || bullet.y + stepY > H);
            if (!xBlock && !yBlock) {
              for (const ww of this.walls) {
                if (!this.isSolidWall(ww)) continue;
                const testX = (bullet.x + stepX) >= ww.x && (bullet.x + stepX) <= ww.x + ww.w && bullet.y >= ww.y && bullet.y <= ww.y + ww.h;
                const testY = bullet.x >= ww.x && bullet.x <= ww.x + ww.w && (bullet.y + stepY) >= ww.y && (bullet.y + stepY) <= ww.y + ww.h;
                if (testX) xBlock = true;
                if (testY) yBlock = true;
              }
            }
            if (xBlock) { bullet.vx *= -0.7; stepX = -stepX; }
            if (yBlock) { bullet.vy *= -0.7; stepY = -stepY; }
            if (!xBlock && !yBlock) { bullet.vx *= -0.7; bullet.vy *= -0.7; stepX = -stepX; stepY = -stepY; }
            bullet.bounces--;
            this.emit({ kind: 'bounce', x: bullet.x, y: bullet.y });
            continue;
          }
          if (wallHit.wall && !wallHit.wall.indestructible) {
            this.damageWall(wallHit.wall, bullet.dmg * 0.5);
          }
          if (bullet.explosive) {
            this.createExplosion(bullet.x, bullet.y, bullet.radius, bullet.dmg, bullet.owner);
          } else {
            this.emit({ kind: 'bullet-hit-wall', x: bullet.x, y: bullet.y, color: bullet.color });
          }
          this.bullets.splice(b, 1);
          consumed = true;
          break;
        }

        let hitBarrel = false;
        for (const br of this.barrels) {
          if (!br.alive) continue;
          if (Math.hypot(br.x - bullet.x, br.y - bullet.y) < br.r) {
            this.explodeBarrel(br, bullet.owner);
            if (!bullet.piercing) {
              if (bullet.explosive) this.createExplosion(bullet.x, bullet.y, bullet.radius, bullet.dmg, bullet.owner);
              this.bullets.splice(b, 1);
              consumed = true;
            }
            hitBarrel = true;
            break;
          }
        }
        if (consumed) break;
        if (hitBarrel && bullet.piercing) continue;

        for (const target of this.players) {
          if (target.id === bullet.owner) continue;
          if (!target.alive) continue;
          if (bullet.hitList.indexOf(target.id) !== -1) continue;
          const d = Math.hypot(target.x - bullet.x, target.y - bullet.y);
          if (d < target.r) {
            if (bullet.explosive) {
              this.createExplosion(bullet.x, bullet.y, bullet.radius, bullet.dmg, bullet.owner);
              this.bullets.splice(b, 1);
              consumed = true;
              break;
            }
            this.damagePlayer(target, bullet.dmg, this.players[bullet.owner], { dmg: bullet.dmg });
            bullet.hitList.push(target.id);
            if (!bullet.piercing) {
              this.bullets.splice(b, 1);
              consumed = true;
              break;
            }
          }
        }
        if (consumed) break;
      }
    }

    for (let ex = this.explosions.length - 1; ex >= 0; ex--) {
      this.explosions[ex].life -= dt;
      if (this.explosions[ex].life <= 0) this.explosions.splice(ex, 1);
    }

    if (this.announcement) {
      this.announcement.life -= dt;
      if (this.announcement.life <= 0) this.announcement = null;
    }

    this.pickupSpawnTimer -= dt;
    if (this.pickupSpawnTimer <= 0 && this.pickups.length < 3) {
      this.spawnPickup();
      this.pickupSpawnTimer = 6000 + Math.random() * 3000;
    }
    for (let pk = this.pickups.length - 1; pk >= 0; pk--) {
      const pick = this.pickups[pk];
      pick.life -= dt;
      pick.pulse += dt;
      if (pick.life <= 0) { this.pickups.splice(pk, 1); continue; }
      let removed = false;
      for (const pl of this.players) {
        if (!pl.alive) continue;
        if (Math.hypot(pl.x - pick.x, pl.y - pick.y) < pl.r + pick.r) {
          if (pick.kind === 'health') {
            const healed = Math.min(pl.maxHp - pl.hp, 40);
            if (healed > 0) {
              pl.hp += healed;
              this.emit({ kind: 'pickup', playerId: pl.id, x: pl.x, y: pl.y, kind2: 'health', healed: Math.round(healed) });
              this.pickups.splice(pk, 1);
              removed = true;
              break;
            }
          } else if (pick.kind === 'powerup') {
            this.applyPowerup(pl, pick.powerup);
            this.pickups.splice(pk, 1);
            removed = true;
            break;
          }
        }
      }
      if (removed) continue;
    }

    for (let kf = this.killFeed.length - 1; kf >= 0; kf--) {
      this.killFeed[kf].life -= dt;
      if (this.killFeed[kf].life <= 0) this.killFeed.splice(kf, 1);
    }

    this.airstrikeTimer -= dt;
    if (this.airstrikeTimer <= 0) {
      this.spawnAirstrike();
      this.airstrikeTimer = 25000 + Math.random() * 10000;
    }
    for (let ai = this.airstrikeWarnings.length - 1; ai >= 0; ai--) {
      const warn = this.airstrikeWarnings[ai];
      warn.life -= dt;
      const elapsed = warn.max - warn.life;
      for (const strike of warn.strikes) {
        if (!strike.triggered && elapsed >= strike.delay) {
          strike.triggered = true;
          this.createExplosion(strike.x, strike.y, 95, 60, -1);
        }
      }
      if (warn.life <= 0) this.airstrikeWarnings.splice(ai, 1);
    }
  }

  snapshot(){
    const reloadProgress = (p) => {
      if (!p.reloading) return 0;
      const weapon = WEAPONS[p.weaponLevel];
      const mult = p.powerups.rapid ? 0.6 : 1;
      const total = weapon.reload * mult;
      if (total <= 0) return 1;
      return Math.max(0, Math.min(1, 1 - (p.reloadUntil - this.time) / total));
    };
    const snap = {
      t: 'state',
      time: this.time,
      running: this.running,
      winner: this.winner,
      players: this.players.map(p => ({
        id: p.id, name: p.name, active: p.active,
        x: p.x, y: p.y, angle: p.angle,
        hp: p.hp, maxHp: p.maxHp, alive: p.alive, color: p.color, r: p.r,
        weaponLevel: p.weaponLevel, ammo: p.ammo,
        reloading: p.reloading, reloadProgress: reloadProgress(p),
        invuln: p.invuln > 0,
        powerups: Object.keys(p.powerups),
        ultCharge: p.ultCharge, ultActive: p.ultActive > 0, ultActiveMs: p.ultActive, ultType: p.ultType,
        dashCooldown: p.dashCooldown, recoil: p.recoil,
        kills: p.kills, deaths: p.deaths, streak: p.streak, damageDealt: p.damageDealt
      })),
      bullets: this.bullets.map(b => ({
        x: b.x, y: b.y, vx: b.vx, vy: b.vy,
        color: b.color, len: b.len,
        flame: b.flame, grenade: b.grenade, explosive: b.explosive
      })),
      walls: this.walls.map(w => ({
        idx: w.idx, x: w.x, y: w.y, w: w.w, h: w.h,
        hp: w.hp, maxHp: w.maxHp, destroyed: w.destroyed, indestructible: w.indestructible
      })),
      barrels: this.barrels.map(br => ({ x: br.x, y: br.y, r: br.r, alive: br.alive })),
      pickups: this.pickups.map(pk => ({
        kind: pk.kind, x: pk.x, y: pk.y, r: pk.r, life: pk.life, max: pk.max, pulse: pk.pulse,
        powerup: pk.powerup || null
      })),
      airstrikeWarnings: this.airstrikeWarnings.map(a => ({
        x: a.x, y: a.y, radius: a.radius, life: a.life, max: a.max
      })),
      explosions: this.explosions.map(e => ({
        x: e.x, y: e.y, radius: e.radius, max: e.max, life: e.life, maxLife: e.maxLife
      })),
      killFeed: this.killFeed.map(k => ({ text: k.text, weapon: k.weapon, color: k.color, life: k.life, max: k.max })),
      announcement: this.announcement
        ? { text: this.announcement.text, color: this.announcement.color, life: this.announcement.life, max: this.announcement.max }
        : null,
      events: this.events
    };
    this.events = [];
    return snap;
  }
}
