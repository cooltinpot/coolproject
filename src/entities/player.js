import * as THREE from 'three';
import { Entity } from './physics.js';
import { BLOCKS, ITEMS, SOLID } from '../blocks.js';
import { Inventory } from '../inventory.js';
import { audio } from '../audio.js';

export const GAMEMODE = { SURVIVAL: 'survival', CREATIVE: 'creative' };

export class Player extends Entity {
  constructor(world) {
    super(world, 0.6, 1.8);
    this.pitch = 0;
    this.yaw = 0;
    this.mode = GAMEMODE.SURVIVAL;
    this.flying = false;
    this.sprinting = false;
    this.sneaking = false;
    this.health = 20;
    this.maxHealth = 20;
    this.food = 20;
    this.saturation = 5;
    this.exhaustion = 0;
    this.air = 15;
    this.invuln = 0;
    this.burning = 0;
    this.regenTimer = 0;
    this.starveTimer = 0;
    this.drownTimer = 0;
    this.lavaTimer = 0;
    this.fireTimer = 0;
    this.cactusTimer = 0;
    this.inventory = new Inventory(36);
    this.spawn = new THREE.Vector3(0, 80, 0);
    this.bob = 0;
    this.bobAmt = 0;
    this.hurtTilt = 0;
    this.lastSpaceTap = 0;
    this.distWalked = 0;
    this.eatTimer = 0;
    this.xp = 0;
    this.onDamage = null; // callback(amount, source)
    this.onDeath = null;
    this.stepAcc = 0;
  }

  get eyeHeight() { return this.sneaking && !this.flying ? 1.27 : 1.62; }
  get eye() { return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z); }

  lookDir(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  get creative() { return this.mode === GAMEMODE.CREATIVE; }

  setMode(m) {
    this.mode = m;
    if (m === GAMEMODE.SURVIVAL) this.flying = false;
    this.fallDistance = 0;
  }

  addExhaustion(v) { if (!this.creative) this.exhaustion += v; }

  damage(amount, source = 'generic', from = null) {
    if (this.dead) return false;
    if (this.creative && source !== 'void' && source !== 'kill') return false;
    if (this.invuln > 0 && source !== 'void' && source !== 'kill') return false;
    if (['zombie', 'spider', 'skeleton', 'arrow', 'explosion', 'cactus', 'mob'].includes(source)) {
      const pts = this.inventory.armorPoints();
      if (pts > 0) {
        this.inventory.damageArmor(amount);
        amount *= 1 - Math.min(20, pts) / 25;
      }
    }
    this.health -= amount;
    this.invuln = 0.5;
    this.hurtTilt = 1;
    this.addExhaustion(0.1);
    audio.play('hurt');
    if (from) {
      const dx = this.pos.x - from.x, dz = this.pos.z - from.z;
      const l = Math.hypot(dx, dz) || 1;
      this.vel.x += (dx / l) * 6; this.vel.z += (dz / l) * 6;
      this.vel.y = Math.max(this.vel.y, 5);
    }
    if (this.onDamage) this.onDamage(amount, source);
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      if (this.onDeath) this.onDeath(source);
    }
    return true;
  }

  heal(n) { this.health = Math.min(this.maxHealth, this.health + n); }

  eat(food) {
    this.food = Math.min(20, this.food + food.hunger);
    this.saturation = Math.min(this.food, this.saturation + food.sat);
    if (food.regen) { this.regenBoost = 5; }
  }

  landed(dist) {
    if (this.inWater || this.creative || this.flying) return;
    const feet = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.2), Math.floor(this.pos.z));
    const dmg = Math.ceil(dist - 3);
    if (dist > 1.5 && feet > 0) audio.block('step', BLOCKS[feet].sound, null);
    if (dmg > 0) this.damage(dmg, 'fall');
  }

  update(dt, input) {
    if (this.dead) return;
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtTilt = Math.max(0, this.hurtTilt - dt * 3);
    this.updateEnvironment();

    // --- controls ---
    let fwd = 0, strafe = 0;
    if (input.key('KeyW')) fwd += 1;
    if (input.key('KeyS')) fwd -= 1;
    if (input.key('KeyA')) strafe -= 1;
    if (input.key('KeyD')) strafe += 1;
    const jump = input.key('Space');
    this.sneaking = input.key('ShiftLeft') || input.key('ShiftRight');
    if ((input.key('ControlLeft') || input.keyPressed('KeyR')) && fwd > 0 && (this.food > 6 || this.creative)) this.sprinting = true;
    if (fwd <= 0 || this.sneaking || (this.food <= 6 && !this.creative) || this.horizontalCollision) this.sprinting = false;

    if (input.keyPressed('Space') && this.creative) {
      const now = performance.now();
      if (now - this.lastSpaceTap < 300) { this.flying = !this.flying; this.vel.y = 0; this.lastSpaceTap = 0; }
      else this.lastSpaceTap = now;
    }
    if (this.flying && this.onGround && !jump) this.flying = false;

    const len = Math.hypot(fwd, strafe) || 1;
    fwd /= len; strafe /= len;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const dirX = -sin * fwd + cos * strafe;
    const dirZ = -cos * fwd - sin * strafe;

    let speed = 4.317;
    if (this.flying) speed = this.sprinting ? 21.6 : 10.9;
    else if (this.sneaking) speed = 1.31;
    else if (this.sprinting) speed = 5.612;
    if (this.inWater && !this.flying) speed *= 0.5;
    if (this.inLava) speed *= 0.35;
    if (this.inWeb) speed *= 0.15;
    const moving = fwd !== 0 || strafe !== 0;

    if (this.flying) {
      const accel = Math.min(1, dt * 10);
      this.vel.x += (dirX * speed - this.vel.x) * accel;
      this.vel.z += (dirZ * speed - this.vel.z) * accel;
      let vy = 0;
      if (jump) vy += 8; if (this.sneaking) vy -= 8;
      this.vel.y += (vy - this.vel.y) * accel;
      this.fallDistance = 0;
    } else {
      const ground = this.onGround;
      let accel = ground ? 14 : 2.6;
      if (this.inWater || this.inLava) accel = 6;
      const slippery = ground && this.groundBlock() && BLOCKS[this.groundBlock()].slippery;
      if (slippery) accel = 1.5;
      const k = Math.min(1, dt * accel);
      this.vel.x += (dirX * speed - this.vel.x) * k;
      this.vel.z += (dirZ * speed - this.vel.z) * k;

      if (this.inWater || this.inLava) {
        this.vel.y -= (this.inLava ? 6 : 9) * dt;
        if (jump) this.vel.y += 30 * dt;
        this.vel.y *= Math.pow(0.4, dt * 4);
        if (this.vel.y < -3) this.vel.y = -3;
        if (jump && this.horizontalCollision) this.vel.y = 3.5;
        this.fallDistance = 0;
      } else if (this.onLadder) {
        this.vel.y -= this.gravity * dt;
        if (this.vel.y < -2.5) this.vel.y = -2.5;
        if (this.horizontalCollision || jump) this.vel.y = 2.4;
        if (this.sneaking && this.vel.y < 0) this.vel.y = 0;
        this.fallDistance = 0;
      } else {
        this.vel.y -= this.gravity * dt;
        if (jump && ground) {
          this.vel.y = 8.9;
          if (this.sprinting) { this.vel.x += dirX * 2; this.vel.z += dirZ * 2; this.addExhaustion(0.2); }
          else this.addExhaustion(0.05);
        }
      }
      if (this.inWeb) { this.vel.multiplyScalar(0.3); this.fallDistance = 0; }
      if (this.vel.y < -60) this.vel.y = -60;
    }

    // sneak edge protection
    let dx = this.vel.x * dt, dz = this.vel.z * dt;
    if (this.sneaking && this.onGround && !this.flying) {
      const test = (ox, oz) => {
        const p = this.pos.clone(); p.x += ox; p.z += oz; p.y -= 0.6;
        return this.collides(p);
      };
      const step = 0.05;
      while (dx !== 0 && !test(dx, 0)) { if (Math.abs(dx) < step) { dx = 0; break; } dx -= Math.sign(dx) * step; }
      while (dz !== 0 && !test(0, dz)) { if (Math.abs(dz) < step) { dz = 0; break; } dz -= Math.sign(dz) * step; }
      while (dx !== 0 && dz !== 0 && !test(dx, dz)) {
        if (Math.abs(dx) < step) dx = 0; else dx -= Math.sign(dx) * step;
        if (Math.abs(dz) < step) dz = 0; else dz -= Math.sign(dz) * step;
      }
    }

    const prevY = this.pos.y;
    const ox = this.pos.x, oz = this.pos.z;
    const hit = this.move(dx, this.vel.y * dt, dz);
    this.horizontalCollision = hit.x || hit.z;
    if (hit.x) this.vel.x = 0;
    if (hit.z) this.vel.z = 0;
    const wasGround = this.onGround;
    this.onGround = hit.y && this.vel.y < 0;
    if (hit.y) { if (this.vel.y > 0) this.vel.y = 0; else this.vel.y = 0; }
    if (!this.onGround && this.pos.y < prevY && !this.flying) this.fallDistance += prevY - this.pos.y;
    if (this.onGround && !wasGround) { this.landed(this.fallDistance); this.fallDistance = 0; }

    // walking stats + footsteps + bobbing
    const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
    if (this.onGround && moved > 0) {
      this.distWalked += moved;
      this.stepAcc += moved;
      if (this.sprinting) this.addExhaustion(0.1 * moved);
      if (this.stepAcc > 1.7 && !this.sneaking) {
        this.stepAcc = 0;
        const gb = this.groundBlock();
        if (gb > 0) audio.block('step', BLOCKS[gb].sound, null);
      }
    }
    if (this.inWater && moved > 0) this.addExhaustion(0.015 * moved);
    this.bob += moved * 2.2;
    const targetBob = this.onGround && moving && !this.flying ? Math.min(1, moved / dt / 5) : 0;
    this.bobAmt += (targetBob - this.bobAmt) * Math.min(1, dt * 10);

    if (this.pos.y < -40) this.damage(4, 'void');
    this.updateStats(dt);
  }

  groundBlock() {
    return this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.05), Math.floor(this.pos.z));
  }

  updateStats(dt) {
    if (this.creative) { this.air = 15; this.burning = 0; return; }
    // hazards
    if (this.inLava) {
      this.burning = 8;
      this.lavaTimer -= dt;
      if (this.lavaTimer <= 0) { this.lavaTimer = 0.5; this.damage(4, 'lava'); }
    }
    if (this.inWater) this.burning = 0;
    if (this.burning > 0) {
      this.burning -= dt;
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) { this.fireTimer = 1; if (!this.inLava) this.damage(1, 'fire'); }
    }
    // cactus contact
    this.cactusTimer -= dt;
    if (this.cactusTimer <= 0) {
      const a = this.aabb();
      let touching = false;
      for (let y = Math.floor(a[1]); y <= Math.floor(a[4]) && !touching; y++)
        for (let z = Math.floor(a[2] - 0.05); z <= Math.floor(a[5] + 0.05) && !touching; z++)
          for (let x = Math.floor(a[0] - 0.05); x <= Math.floor(a[3] + 0.05); x++)
            if (this.world.getBlock(x, y, z) === 24) { touching = true; break; }
      if (touching) { this.cactusTimer = 0.5; this.damage(1, 'cactus'); }
    }
    // drowning
    if (this.headInWater) {
      this.air -= dt;
      if (this.air <= 0) {
        this.air = 0;
        this.drownTimer -= dt;
        if (this.drownTimer <= 0) { this.drownTimer = 1; this.damage(2, 'drown'); }
      }
    } else this.air = Math.min(15, this.air + dt * 5);

    // hunger
    while (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else this.food = Math.max(0, this.food - 1);
    }
    this.regenTimer += dt;
    if (this.regenBoost > 0) {
      this.regenBoost -= dt;
      if (this.regenTimer > 1.2) { this.regenTimer = 0; this.heal(1); }
    }
    if (this.health < this.maxHealth) {
      if (this.food >= 20 && this.saturation > 0 && this.regenTimer >= 0.5) {
        this.regenTimer = 0; this.heal(1); this.exhaustion += 6 * 0.5;
      } else if (this.food >= 18 && this.regenTimer >= 4) {
        this.regenTimer = 0; this.heal(1); this.exhaustion += 6;
      }
    }
    if (this.food <= 0) {
      this.starveTimer += dt;
      if (this.starveTimer >= 4) { this.starveTimer = 0; if (this.health > 1) this.damage(1, 'starve'); }
    }
  }

  respawn() {
    this.dead = false;
    this.health = 20; this.food = 20; this.saturation = 5; this.exhaustion = 0; this.air = 15;
    this.burning = 0; this.fallDistance = 0;
    this.vel.set(0, 0, 0);
    this.pos.copy(this.spawn);
  }

  // Move up until not intersecting terrain (for spawning).
  unstuck() {
    for (let i = 0; i < 200 && this.collides(this.pos); i++) this.pos.y += 1;
  }

  toJSON() {
    return {
      pos: this.pos.toArray(), yaw: this.yaw, pitch: this.pitch, mode: this.mode, flying: this.flying,
      health: this.health, food: this.food, saturation: this.saturation, air: this.air,
      inv: this.inventory.toJSON(), spawn: this.spawn.toArray(), xp: this.xp,
    };
  }

  load(o) {
    if (!o) return;
    this.pos.fromArray(o.pos);
    this.yaw = o.yaw || 0; this.pitch = o.pitch || 0;
    this.mode = o.mode || GAMEMODE.SURVIVAL;
    this.flying = !!o.flying;
    this.health = o.health ?? 20; this.food = o.food ?? 20; this.saturation = o.saturation ?? 5; this.air = o.air ?? 15;
    this.inventory.load(o.inv);
    if (o.spawn) this.spawn.fromArray(o.spawn);
    this.xp = o.xp || 0;
  }
}
