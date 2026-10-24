import * as THREE from 'three';
import { Entity } from './physics.js';
import { buildModel, animateModel } from './models.js';
import { B, I, BLOCKS, SOLID, OPAQUE } from '../blocks.js';
import { lightToBrightness } from '../render/materials.js';
import { audio } from '../audio.js';
import { CH } from '../world/chunk.js';

export const MOB_TYPES = {
  pig: { health: 10, speed: 1.3, hostile: false, sound: 'pig', drops: (r) => [[I.RAW_PORK, 1 + Math.floor(r() * 3)]], xp: 2, food: I.WHEAT },
  cow: { health: 10, speed: 1.2, hostile: false, sound: 'cow', drops: (r) => [[I.RAW_BEEF, 1 + Math.floor(r() * 3)], [I.LEATHER, Math.floor(r() * 3)]], xp: 2, food: I.WHEAT },
  chicken: { health: 4, speed: 1.1, hostile: false, sound: 'chicken', drops: (r) => [[I.RAW_CHICKEN, 1], [I.FEATHER, Math.floor(r() * 3)]], xp: 1, food: I.WHEAT_SEEDS },
  sheep: { health: 8, speed: 1.2, hostile: false, sound: 'sheep', drops: (r) => [[B.WOOL, 1], [I.RAW_MUTTON, 1 + Math.floor(r() * 2)]], xp: 2, food: I.WHEAT },
  zombie: { health: 20, speed: 2.3, hostile: true, sound: 'zombie', drops: (r) => [[I.ROTTEN_FLESH, Math.floor(r() * 3)]], xp: 5, damage: 3, burns: true },
  creeper: { health: 20, speed: 2.0, hostile: true, sound: null, drops: (r) => [[I.GUNPOWDER, Math.floor(r() * 3)]], xp: 5 },
  skeleton: { health: 20, speed: 2.0, hostile: true, sound: 'skeleton', drops: (r) => [[I.BONE, Math.floor(r() * 3)], [I.ARROW, Math.floor(r() * 3)]], xp: 5, burns: true, ranged: true },
  pigman: { health: 20, speed: 2.4, hostile: false, neutral: true, sound: 'pig', drops: (r) => [[I.ROTTEN_FLESH, Math.floor(r() * 2)], [I.GOLD_NUGGET, Math.floor(r() * 2)]], xp: 5, damage: 5 },
  spider: { health: 16, speed: 2.9, hostile: true, sound: 'zombie', drops: (r) => [[I.STRING, Math.floor(r() * 3)]], xp: 5, damage: 2 },
};

export class Mob extends Entity {
  constructor(world, type, scene) {
    const model = buildModel(type);
    super(world, model.width, model.height);
    this.type = type;
    this.def = MOB_TYPES[type];
    this.model = model;
    this.scene = scene;
    scene.add(model.root);
    this.health = this.def.health;
    this.hurtTime = 0;
    this.deathTime = 0;
    this.dying = false;
    this.wanderTimer = Math.random() * 3;
    this.wanderDir = null;
    this.panic = 0;
    this.attackCooldown = 0;
    this.limb = 0;
    this.limbAmt = 0;
    this.fuse = 0;
    this.burnTimer = 0;
    this.burning = 0;
    this.lavaTimer = 0;
    this.soundTimer = 5 + Math.random() * 15;
    this.age = 0;
    this.provoked = false;
    this.love = 0;
    this.baby = 0;
    this.breedCooldown = 0;
    this.targetYaw = Math.random() * Math.PI * 2;
    this.yaw = this.targetYaw;
  }

  setBaby() { this.baby = 240; this.w *= 0.5; this.h *= 0.5; }

  hurt(amount, from, ctx) {
    if (this.dying || this.hurtTime > 0) return false;
    this.health -= amount;
    this.hurtTime = 0.5;
    audio.play('mob_hurt', this.pos);
    if (from) {
      const dx = this.pos.x - from.x, dz = this.pos.z - from.z;
      const l = Math.hypot(dx, dz) || 1;
      this.vel.x = (dx / l) * 7; this.vel.z = (dz / l) * 7;
      this.vel.y = 5.5;
    }
    if (!this.def.hostile && !this.def.neutral) { this.panic = 5; }
    if (this.def.neutral && this.manager) {
      for (const o of this.manager.mobs) if (o.type === this.type && o.pos.distanceTo(this.pos) < 24) o.provoked = true;
    }
    this.provoked = true;
    if (this.health <= 0) this.die(ctx, true);
    return true;
  }

  die(ctx, drops) {
    if (this.dying) return;
    this.dying = true;
    this.deathTime = 0;
    audio.play('death', this.pos);
    if (drops && ctx && !this.baby) {
      for (const [id, n] of this.def.drops(Math.random)) if (n > 0) ctx.spawnItem(this.pos.x, this.pos.y + 0.5, this.pos.z, { id, count: n, dmg: 0 });
      ctx.player.xp += this.def.xp;
    }
  }

  remove() {
    this.dead = true;
    this.scene.remove(this.model.root);
    this.model.dispose();
  }

  // Ground ahead safe to walk to?
  safeAhead(dx, dz) {
    const w = this.world;
    const x = Math.floor(this.pos.x + dx * 0.9), z = Math.floor(this.pos.z + dz * 0.9);
    const y = Math.floor(this.pos.y);
    for (let k = 0; k <= 3; k++) {
      const b = w.getBlock(x, y - k, z);
      if (b < 0) return false;
      if (b > 0 && BLOCKS[b].fluid === 'lava') return false;
      if (b > 0 && (SOLID[b] || BLOCKS[b].fluid)) return true;
    }
    return false;
  }

  update(dt, ctx) {
    const { player } = ctx;
    this.age += dt;
    this.hurtTime = Math.max(0, this.hurtTime - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.breedCooldown = Math.max(0, this.breedCooldown - dt);
    if (this.baby > 0) {
      this.baby -= dt;
      if (this.baby <= 0) { this.w = this.model.width; this.h = this.model.height; }
    }
    if (this.dying) {
      this.deathTime += dt;
      this.model.root.rotation.z = Math.min(Math.PI / 2, this.deathTime * 5);
      this.model.setBrightness(1, true);
      this.physics(dt);
      this.syncModel(ctx);
      if (this.deathTime > 0.9) this.remove();
      return;
    }

    const def = this.def;
    let tx = 0, tz = 0, speed = 0;
    const dxp = player.pos.x - this.pos.x, dzp = player.pos.z - this.pos.z, dyp = player.pos.y - this.pos.y;
    const distP = Math.hypot(dxp, dzp);
    const canTarget = !player.dead && !player.creative;
    const night = ctx.dayFactor < 0.5;

    let chase = false;
    if ((def.hostile || (def.neutral && this.provoked)) && canTarget && distP < (def.neutral ? 40 : 24)) {
      chase = this.type !== 'spider' || night || this.provoked || ctx.lightAt(this.pos) < 0.4;
    }

    if (chase) {
      tx = dxp / (distP || 1); tz = dzp / (distP || 1);
      speed = def.speed;
      this.targetYaw = Math.atan2(-tx, -tz);
      if (def.ranged) {
        // keep medium range, strafe, and shoot when there is line of sight
        if (distP < 7) { tx = -tx; tz = -tz; speed = def.speed * 0.8; }
        else if (distP < 13) {
          if (!this.strafe || Math.random() < dt * 0.4) this.strafe = Math.random() < 0.5 ? -1 : 1;
          const sx = -tz * this.strafe, sz = tx * this.strafe; tx = sx; tz = sz; speed = def.speed * 0.5;
        }
        this.targetYaw = Math.atan2(-(dxp / (distP || 1)), -(dzp / (distP || 1)));
        if (this.attackCooldown <= 0 && distP < 16 && ctx.canSee(this, player)) {
          ctx.shootArrow(this, player, 22 + Math.random() * 4);
          this.attackCooldown = 1.6 + Math.random() * 1.2;
        }
      } else if (this.type === 'creeper') {
        if (distP < 3 && Math.abs(dyp) < 3) {
          if (this.fuse === 0) audio.play('creeper_hiss', this.pos);
          this.fuse += dt; speed = 0;
        } else if (distP > 6) this.fuse = Math.max(0, this.fuse - dt);
        else this.fuse = this.fuse > 0 ? this.fuse + dt : 0;
        if (this.fuse >= 1.5) {
          ctx.explode(this.pos.x, this.pos.y + 0.8, this.pos.z, 3, this);
          this.die(null, false);
          this.remove();
          return;
        }
      } else if (distP < (this.type === 'spider' ? 1.6 : 1.3) && dyp > -1.5 && dyp < 2 && this.attackCooldown <= 0) {
        player.damage(def.damage, this.type, this.pos);
        this.attackCooldown = 1;
      } else if (this.type === 'spider' && distP < 4 && distP > 2 && this.onGround && Math.random() < dt * 0.8) {
        this.vel.y = 6; this.vel.x = tx * 6; this.vel.z = tz * 6;
      }
    } else {
      if (this.type === 'creeper') this.fuse = Math.max(0, this.fuse - dt);
      const holdingFood = def.food && player.inventory.held && player.inventory.held.id === def.food;
      if (holdingFood && distP < 8 && distP > 2) {
        tx = dxp / distP; tz = dzp / distP; speed = def.speed;
        this.targetYaw = Math.atan2(-tx, -tz);
      } else if (this.love > 0 && ctx.mate(this)) {
        const m = ctx.mate(this);
        const dx = m.pos.x - this.pos.x, dz = m.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
        tx = dx / d; tz = dz / d; speed = def.speed;
        this.targetYaw = Math.atan2(-tx, -tz);
        if (d < 1.2) ctx.breed(this, m);
      } else {
        const panicking = this.panic > 0;
        if (panicking) this.panic -= dt;
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) {
          this.wanderTimer = 2 + Math.random() * 4;
          if (panicking || Math.random() < 0.45) {
            const a = Math.random() * Math.PI * 2;
            this.wanderDir = [Math.sin(a), Math.cos(a)];
            this.targetYaw = Math.atan2(-this.wanderDir[0], -this.wanderDir[1]);
          } else this.wanderDir = null;
          if (panicking) this.wanderTimer = 0.8 + Math.random();
        }
        if (this.wanderDir) {
          tx = this.wanderDir[0]; tz = this.wanderDir[1];
          speed = panicking ? def.speed * 2.1 : def.speed * 0.6;
        }
      }
      if (speed > 0 && !this.safeAhead(tx, tz) && !this.inWater) { this.wanderDir = null; this.wanderTimer = 0.5; speed = 0; }
    }
    this.love = Math.max(0, this.love - dt);

    // movement
    const k = Math.min(1, dt * (this.onGround ? 8 : 1.5));
    this.vel.x += (tx * speed - this.vel.x) * k;
    this.vel.z += (tz * speed - this.vel.z) * k;
    if (speed > 0 && this.horizontalCollision) {
      if (this.type === 'spider') this.vel.y = 3.2;
      else if (this.onGround) this.vel.y = 8.9;
    }
    if (this.inWater || this.inLava) { if (this.pos.y % 1 < 0.6 || this.headInWater) this.vel.y += 22 * dt; }
    if (this.type === 'chicken' && !this.onGround && this.vel.y < -2.5) this.vel.y = -2.5;

    this.physics(dt, false);

    // turning
    let dy = this.targetYaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * Math.min(1, dt * 6);

    // hazards
    if (this.inLava) { this.burning = 6; this.lavaTimer -= dt; if (this.lavaTimer <= 0) { this.lavaTimer = 0.5; this.hurt(4, null, ctx); this.hurtTime = 0; } }
    if (def.burns && ctx.dayFactor > 0.75 && !this.inWater && !ctx.raining) {
      const l = this.world.getLight(Math.floor(this.pos.x), Math.floor(this.pos.y + this.h), Math.floor(this.pos.z));
      if ((l >> 4) >= 15) this.burning = Math.max(this.burning, 1);
    }
    if (this.inWater) this.burning = 0;
    if (this.burning > 0) {
      if (ctx.particles && Math.random() < dt * 20) ctx.particles.flame(this.pos.x + (Math.random() - 0.5) * this.w, this.pos.y + Math.random() * this.h, this.pos.z + (Math.random() - 0.5) * this.w);
      this.burning -= dt; this.burnTimer -= dt;
      if (this.burnTimer <= 0) { this.burnTimer = 1; this.hurtTime = 0; this.hurt(1, null, ctx); }
    }
    if (this.pos.y < -20) this.die(null, false);

    this.soundTimer -= dt;
    if (this.soundTimer <= 0) { this.soundTimer = 8 + Math.random() * 16; if (def.sound) audio.play(def.sound, this.pos); }

    const moved = Math.hypot(this.vel.x, this.vel.z);
    this.limb += moved * dt * 3.5;
    this.limbAmt += (Math.min(1, moved / 2) - this.limbAmt) * Math.min(1, dt * 8);
    this.syncModel(ctx);
  }

  landed(dist) {
    const d = Math.ceil(dist - 3);
    if (d > 0 && !this.inWater) this.hurt(d, null, null);
  }

  syncModel(ctx) {
    const r = this.model.root;
    r.position.copy(this.pos);
    r.rotation.y = this.yaw + Math.PI;
    const s = (this.baby > 0 ? 0.5 : 1) * (1 + this.fuse * 0.12);
    r.scale.set(s, this.baby > 0 ? 0.5 : 1 + this.fuse * 0.05, s);
    animateModel(this.model, this.limb, this.limbAmt, {
      zombieArms: this.type === 'zombie' || (this.type === 'pigman' && this.provoked), bowArms: this.type === 'skeleton' && this.attackCooldown > 0.8,
      flap: this.type === 'chicken' && !this.onGround ? Math.abs(Math.sin(this.age * 20)) * 1.2 : 0,
    });
    const b = ctx.lightAt(this.pos, this.h * 0.6);
    const flashWhite = this.fuse > 0 && Math.floor(this.fuse * 8) % 2 === 0;
    this.model.setBrightness(this.burning > 0 ? Math.max(b, 0.9) : b, this.hurtTime > 0.2, flashWhite);
  }

  // Ray vs AABB (for attacking). Returns distance or -1.
  rayHit(o, d, max) {
    const a = this.aabb();
    let tmin = 0, tmax = max;
    const oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
    for (let k = 0; k < 3; k++) {
      const mn = a[k] - 0.1, mx = a[k + 3] + 0.1;
      if (Math.abs(dd[k]) < 1e-9) { if (oo[k] < mn || oo[k] > mx) return -1; continue; }
      let t1 = (mn - oo[k]) / dd[k], t2 = (mx - oo[k]) / dd[k];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }
    return tmin;
  }
}

export class MobManager {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.mobs = [];
    this.spawnTimer = 0;
    this.enabled = true;
  }

  spawn(type, x, y, z) {
    const m = new Mob(this.world, type, this.scene);
    m.pos.set(x, y, z);
    m.manager = this;
    this.mobs.push(m);
    return m;
  }

  update(dt, ctx) {
    for (const m of this.mobs) m.update(dt, ctx);
    this.separate(dt, ctx.player);
    // despawn / cleanup
    const p = ctx.player.pos;
    for (const m of this.mobs) {
      if (m.dead) continue;
      const d = m.pos.distanceTo(p);
      if (!this.world.isLoaded(Math.floor(m.pos.x), Math.floor(m.pos.z))) { m.remove(); continue; }
      if ((m.def.hostile || m.def.neutral) && (d > 96 || (d > 40 && Math.random() < dt / 30))) m.remove();
      if (m.def.hostile && ctx.dayFactor > 0.9 && m.type !== 'zombie' && d > 24 && Math.random() < dt / 20) m.remove();
    }
    this.mobs = this.mobs.filter((m) => !m.dead);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.enabled) {
      this.spawnTimer = 1;
      this.trySpawn(ctx);
    }
  }

  // Soft collision so mobs don't stack inside each other or the player.
  separate(dt, player) {
    const list = this.mobs.filter((m) => !m.dead && !m.dying);
    const push = (a, b, mova, movb) => {
      const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z;
      const min = (a.w + b.w) / 2;
      if (Math.abs(a.pos.y - b.pos.y) > Math.max(a.h, b.h)) return;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) return;
      const d = Math.sqrt(d2) || 0.01;
      const f = (min - d) / min * 12 * dt;
      const nx = d2 > 0 ? dx / d : Math.random() - 0.5, nz = d2 > 0 ? dz / d : Math.random() - 0.5;
      if (mova) { a.vel.x += nx * f * 8; a.vel.z += nz * f * 8; }
      if (movb) { b.vel.x -= nx * f * 8; b.vel.z -= nz * f * 8; }
    };
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) push(list[i], list[j], true, true);
      if (!player.dead && !player.noClip) push(list[i], player, true, !player.creative || !player.flying);
    }
  }

  trySpawn(ctx) {
    const p = ctx.player.pos;
    if (this.world.dim === 'nether') {
      const w = this.world;
      if (this.mobs.length >= 12) return;
      for (let attempt = 0; attempt < 8; attempt++) {
        const a = Math.random() * Math.PI * 2, r = 16 + Math.random() * 32;
        const x = Math.floor(p.x + Math.cos(a) * r), z = Math.floor(p.z + Math.sin(a) * r);
        const y = Math.floor(p.y + (Math.random() - 0.5) * 40);
        if (!w.isLoaded(x, z) || y < 2 || y > CH - 4) continue;
        const below = w.getBlock(x, y - 1, z);
        if (!(below === B.NETHERRACK || below === B.SOUL_SAND) || w.getBlock(x, y, z) !== 0 || w.getBlock(x, y + 1, z) !== 0) continue;
        this.spawn('pigman', x + 0.5, y, z + 0.5);
        break;
      }
      return;
    }
    const passive = this.mobs.filter((m) => !m.def.hostile).length;
    const hostile = this.mobs.length - passive;
    const w = this.world;
    // passive animals on grass in daylight-lit areas
    if (passive < 14 && Math.random() < 0.5) {
      const a = Math.random() * Math.PI * 2, r = 24 + Math.random() * 40;
      const x = Math.floor(p.x + Math.cos(a) * r), z = Math.floor(p.z + Math.sin(a) * r);
      if (w.isLoaded(x, z)) {
        const y = w.surfaceY(x, z);
        const free = (b) => b === 0 || (b > 0 && BLOCKS[b].replaceable && !BLOCKS[b].fluid);
        if (w.getBlock(x, y, z) === B.GRASS && free(w.getBlock(x, y + 1, z)) && free(w.getBlock(x, y + 2, z))) {
          const types = ['pig', 'cow', 'sheep', 'chicken'];
          const t = types[Math.floor(Math.random() * types.length)];
          const n = 1 + Math.floor(Math.random() * 3);
          for (let i = 0; i < n; i++) {
            const ox = x + Math.floor(Math.random() * 3) - 1, oz = z + Math.floor(Math.random() * 3) - 1;
            const oy = w.surfaceY(ox, oz);
            if (w.getBlock(ox, oy, oz) === B.GRASS && free(w.getBlock(ox, oy + 1, oz))) this.spawn(t, ox + 0.5, oy + 1, oz + 0.5);
          }
        }
      }
    }
    // hostiles in darkness
    if (hostile < 16 && ctx.player.mode !== 'creative' || hostile < 8) {
      for (let attempt = 0; attempt < 6; attempt++) {
        const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 36;
        const x = Math.floor(p.x + Math.cos(a) * r), z = Math.floor(p.z + Math.sin(a) * r);
        if (!w.isLoaded(x, z)) continue;
        const top = w.surfaceY(x, z);
        const y = Math.random() < 0.5 ? top + 1 : 2 + Math.floor(Math.random() * Math.max(1, top - 2));
        if (y >= CH - 2) continue;
        const below = w.getBlock(x, y - 1, z);
        if (!(below > 0 && SOLID[below] && OPAQUE[below])) continue;
        const free = (b) => b === 0 || (b > 0 && BLOCKS[b].replaceable && !BLOCKS[b].fluid);
        if (!free(w.getBlock(x, y, z)) || !free(w.getBlock(x, y + 1, z))) continue;
        const l = w.getLight(x, y, z);
        const eff = Math.max((l >> 4) * ctx.daylight - (1 - ctx.daylight) * 4, l & 15);
        if (eff > 7) continue;
        if (Math.hypot(x - p.x, y - p.y, z - p.z) < 20) continue;
        const roll = Math.random();
        const t = roll < 0.38 ? 'zombie' : roll < 0.6 ? 'skeleton' : roll < 0.82 ? 'creeper' : 'spider';
        this.spawn(t, x + 0.5, y, z + 0.5);
        break;
      }
    }
  }

  clear() { for (const m of this.mobs) m.remove(); this.mobs = []; }

  toJSON() {
    return this.mobs.filter((m) => !m.dead && !m.dying && !m.def.hostile).map((m) => ({ t: m.type, p: m.pos.toArray(), h: m.health, b: m.baby }));
  }

  load(list) {
    if (!list) return;
    for (const o of list) {
      if (!MOB_TYPES[o.t]) continue;
      const m = this.spawn(o.t, o.p[0], o.p[1], o.p[2]);
      m.health = o.h; if (o.b > 0) { m.setBaby(); m.baby = o.b; }
    }
  }
}
