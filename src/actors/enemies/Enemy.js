// Shared enemy behaviour: spawning (materialise from a light beam), beat-
// quantized attack scheduling with telegraph rings, melee resolution against
// the player's parry, posture/stagger, hit reactions and dissolve deaths.
import * as THREE from 'three';
import { clamp, damp, dampAngle, yawTo, flatDist, rand } from '../../core/MathUtil.js';
import { ARENA_RADIUS } from '../../world/Arena.js';

let NEXT_ID = 1;

export class Enemy {
  constructor(game, opts) {
    this.game = game;
    this.id = NEXT_ID++;
    this.type = opts.type;
    this.maxHp = this.hp = opts.hp;
    this.maxPosture = opts.posture ?? 100;
    this.posture = 0;
    this.radius = opts.radius ?? 0.6;
    this.height = opts.height ?? 2;
    this.hitHeight = opts.hitHeight ?? 1.1;
    this.hitTolerance = opts.hitTolerance ?? 1.6;
    this.lockHeight = opts.lockHeight ?? 1.2;
    this.score = opts.score ?? 100;
    this.color = opts.color ?? 0xff2448;
    this.alive = true;
    this.targetable = false;
    this.solid = true;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.state = 'spawn';
    this.stateTime = 0;
    this.time = 0;
    this.attack = null;
    this.staggered = false;
    this.staggerTime = 0;
    this.lastHitTime = -10;
    this.hyperArmor = false;
    this.knock = new THREE.Vector3();
    this.telegraph = game.fx.effects.telegraph();
    this.removed = false;
    this.token = null;
    this.reflectDamage = 99;
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
  }

  // Subclasses create `this.mesh` (Object3D) and `this.U` (actor uniforms).
  place(pos) {
    this.position.copy(pos);
    this.mesh.position.copy(pos);
    this.yaw = yawTo(pos, this.game.player.position);
    this.mesh.rotation.y = this.yaw;
    this.game.scene.add(this.mesh);
    this.U.uDissolve.value = 1;
    this.game.fx.effects.spawnBeam(pos, this.color, 0.9);
    this.game.sfx.spawn({ pan: this.game.panFor(pos) });
  }

  get player() {
    return this.game.player;
  }

  get center() {
    return this._v.set(this.position.x, this.position.y + this.hitHeight, this.position.z);
  }

  distToPlayer() {
    return flatDist(this.position, this.player.position);
  }

  setState(s) {
    this.state = s;
    this.stateTime = 0;
  }

  faceTo(target, dt, rate = 8) {
    this.yaw = dampAngle(this.yaw, yawTo(this.position, target), rate, dt);
  }

  // ------------------------------------------------------------- update

  update(dt) {
    this.time += dt;
    this.stateTime += dt;
    if (this.state === 'spawn') {
      this.U.uDissolve.value = clamp(1 - this.stateTime / 0.8, 0, 1);
      if (this.stateTime > 0.85) {
        this.U.uDissolve.value = 0;
        this.targetable = true;
        this.setState('idle');
      }
      this.updateVisuals(dt);
      return;
    }
    if (this.state === 'dying') {
      this.U.uDissolve.value = clamp(this.stateTime / 0.9, 0, 1);
      this.updateDying && this.updateDying(dt);
      this.updateVisuals(dt);
      if (this.stateTime > 1.0) this.remove();
      return;
    }
    if (this.staggered) {
      this.staggerTime -= dt;
      if (this.staggerTime <= 0) this.recoverFromStagger();
    }
    // Posture regenerates after a while without pressure.
    if (this.time - this.lastHitTime > 2.2 && !this.staggered) this.posture = Math.max(0, this.posture - dt * 18);

    if (!this.staggered && this.state !== 'riposted') this.think(dt);

    // Attack timing
    if (this.attack && !this.attack.resolved) {
      this.attack.impactIn -= dt;
      this.updateAttack(dt, this.attack);
    }

    // Knockback decay
    this.knock.multiplyScalar(Math.exp(-6 * dt));
    this.position.addScaledVector(this.knock, dt);
    this.constrain();
    this.updateVisuals(dt);
  }

  constrain() {
    const r = Math.hypot(this.position.x, this.position.z);
    const maxR = ARENA_RADIUS - this.radius - 0.3;
    if (r > maxR) {
      this.position.x *= maxR / r;
      this.position.z *= maxR / r;
    }
    // Separation from other enemies.
    for (const o of this.game.enemies) {
      if (o === this || !o.alive || !o.solid) continue;
      const dx = this.position.x - o.position.x, dz = this.position.z - o.position.z;
      const min = this.radius + o.radius + 0.2;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (min - d) * 0.5;
        this.position.x += (dx / d) * push;
        this.position.z += (dz / d) * push;
      }
    }
    // Don't overlap the player.
    const p = this.player;
    if (this.solid && p.alive) {
      const dx = this.position.x - p.position.x, dz = this.position.z - p.position.z;
      const min = this.radius + p.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6 && Math.abs(this.position.y - p.position.y) < this.height) {
        const d = Math.sqrt(d2);
        this.position.x += (dx / d) * (min - d) * 0.5;
        this.position.z += (dz / d) * (min - d) * 0.5;
      }
    }
  }

  // Move toward a point at a given speed (flat), with smoothing.
  steer(target, speed, dt, accel = 10) {
    const dx = target.x - this.position.x, dz = target.z - this.position.z;
    const d = Math.hypot(dx, dz);
    let vx = 0, vz = 0;
    if (d > 0.05) { vx = (dx / d) * speed; vz = (dz / d) * speed; }
    this.velocity.x = damp(this.velocity.x, vx, accel, dt);
    this.velocity.z = damp(this.velocity.z, vz, accel, dt);
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
  }

  // Circle the player at a radius.
  orbit(radius, speed, dir, dt) {
    const p = this.player.position;
    const a = Math.atan2(this.position.z - p.z, this.position.x - p.x) + (dir * speed * dt) / Math.max(radius, 1);
    const target = this._v2.set(p.x + Math.cos(a) * radius, 0, p.z + Math.sin(a) * radius);
    this.steer(target, speed * 1.3, dt, 6);
  }

  // ----------------------------------------------------------- attacking

  // Reserve an impact on the beat grid at least `minDelay` seconds away.
  scheduleImpact(minDelay, subdiv = 1) {
    return this.game.rhythm.reserve(minDelay, subdiv);
  }

  beginAttack(att) {
    att.impactIn = att.impactIn ?? this.scheduleImpact(att.windup ?? 0.9, att.subdiv ?? 1);
    att.total = att.impactIn;
    att.resolved = false;
    att.telegraphed = false;
    this.attack = att;
    return att;
  }

  endAttack() {
    if (this.attack && this.attack.warning) this.attack.warning.done();
    this.attack = null;
    this.telegraph.hide();
    if (this.token) {
      this.game.director.releaseToken(this);
      this.token = null;
    }
  }

  // Generic melee impact check + parry resolution.
  resolveMelee(att) {
    const p = this.player;
    if (!p.alive) return 'miss';
    const dx = p.position.x - this.position.x, dz = p.position.z - this.position.z;
    const d = Math.hypot(dx, dz) - p.radius;
    if (d > att.range) return 'miss';
    if (att.arc && att.arc < 360) {
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const dot = (dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1);
      if (dot < Math.cos((att.arc / 2) * Math.PI / 180) && d > 0.6) return 'miss';
    }
    const dy = p.position.y - this.position.y;
    if (att.maxHeight !== undefined && dy > att.maxHeight) return 'jumped';
    if (dy > (att.reachUp ?? 2.4)) return 'miss';
    const res = p.receiveAttack({
      damage: att.damage,
      parryable: att.parryable !== false,
      unblockable: !!att.unblockable,
      source: this,
      sourcePos: this.position,
      knockback: att.knockback ?? 6,
      launch: att.launch,
      onParried: (onBeat) => this.onParried(att, onBeat),
      onBlocked: () => this.onBlocked && this.onBlocked(att),
    });
    if (res === 'hit' && this.onHitPlayer) this.onHitPlayer(att);
    return res;
  }

  // Telegraph ring + warning sound. Called every frame during windup.
  showTelegraph(att, pos, size = 2.4) {
    const color = att.unblockable ? 0xff2040 : 0xffd34a;
    const k = 1 - clamp(att.impactIn / Math.max(0.3, att.total), 0, 1);
    this.telegraph.show(pos, k, color, size, 0.35 + 0.65 * k);
    if (!att.telegraphed) {
      att.telegraphed = true;
      this.game.sfx.telegraph({ pan: this.game.panFor(this.position), unblockable: !!att.unblockable });
      // Glint on the weapon
      this.U.uGlowBoost.value = 4;
      const g = this.game;
      g.fx.particles.burst(pos, { count: 8, color, speed: 2, life: 0.3, size: 0.2, soft: 0.9 });
    }
  }

  onParried(att, onBeat) {
    const g = this.game;
    this.lastHitTime = this.time;
    const pd = (att.postureDmg ?? 34) * (onBeat ? 1.35 : 1);
    this.posture += pd;
    const dir = this._v.set(this.position.x - this.player.position.x, 0, this.position.z - this.player.position.z).normalize();
    this.knock.addScaledVector(dir, att.parryKnock ?? 5);
    this.U.uFlash.value = 0.8;
    this.U.uFlashColor.value.set(onBeat ? 0xffd34a : 0xffffff);
    g.hud.postureHit(this);
    if (this.posture >= this.maxPosture) {
      this.breakPosture();
    } else {
      this.onParriedReact && this.onParriedReact(att, onBeat);
    }
  }

  breakPosture() {
    const g = this.game;
    this.posture = this.maxPosture;
    this.staggered = true;
    this.staggerTime = this.staggerDuration ?? 3.2;
    if (this.attack) this.endAttack();
    this.onStagger && this.onStagger();
    g.hud.popText('POSTURE BREAK', 'break');
    g.sfx.clash({ pan: g.panFor(this.position) });
    g.fx.effects.shockwave(this.center.clone(), { color: 0xffd34a, radius: 2.5, duration: 0.4, vertical: true });
    g.fx.particles.burst(this.center, { count: 40, color: 0xffd34a, speed: 9, life: 0.5, size: 0.08 });
    g.style.add(120, 'break');
  }

  recoverFromStagger() {
    this.staggered = false;
    this.posture = 0;
    this.onRecover && this.onRecover();
  }

  // ------------------------------------------------------------ damage

  canGuard() {
    return false;
  }

  receiveHit(hit) {
    const g = this.game;
    if (!this.alive || !this.targetable || this.state === 'riposted') return 'immune';
    this.lastHitTime = this.time;
    const pan = g.panFor(this.position);
    const pos = this.center.clone();

    if (hit.source === 'sword' && !this.staggered && this.canGuard(hit)) {
      this.posture += (hit.posture ?? 10) * 0.5;
      g.sfx.enemyGuard({ pan });
      g.fx.particles.sparks(pos.addScaledVector(hit.dir, -this.radius), hit.dir.clone().multiplyScalar(-1).setY(0.3), { count: 14, color: 0xffa040, speed: 9, life: 0.3, size: 0.05 });
      g.hud.popText('GUARDED', 'guard');
      this.onGuard && this.onGuard(hit);
      if (this.posture >= this.maxPosture) this.breakPosture();
      return 'guarded';
    }

    let dmg = hit.damage;
    if (this.staggered && hit.source === 'sword') dmg *= 1.5;
    this.hp -= dmg;
    this.player.stats.damageDealt += dmg;
    this.posture += hit.posture ?? 10;
    this.U.uFlash.value = 1.2;
    this.U.uFlashColor.value.set(0xffffff);
    if (!this.hyperArmor || hit.heavy) {
      this.knock.addScaledVector(hit.dir, hit.heavy ? 7 : 3.5);
      this.onFlinch && this.onFlinch(hit);
    }
    g.sfx.hit({ pan, heavy: !!hit.heavy, crit: this.staggered });
    g.fx.particles.sparks(pos, hit.dir.clone().setY(0.25).normalize(), { count: hit.heavy ? 34 : 20, color: this.color, speed: 13, spread: 0.7, life: 0.4, size: 0.055 });
    g.fx.particles.sparks(pos, hit.dir.clone().setY(0.6).normalize(), { count: 10, color: 0xffffff, speed: 9, spread: 0.9, life: 0.25, size: 0.04 });
    g.fx.effects.flash(pos, this.color, 25, 0.12);
    g.hud.damageNumber(pos, dmg, this.staggered ? 'crit' : 'enemy');
    g.style.add(hit.source === 'sword' ? (hit.air ? 30 : 22) : 15, hit.air ? 'air' : 'hit');
    this.player.addResonance(hit.source === 'sword' ? 2 : 0);
    if (this.hp <= 0) {
      this.die(hit.source);
      return 'killed';
    }
    if (this.posture >= this.maxPosture && !this.staggered) this.breakPosture();
    return 'hit';
  }

  lockForRiposte() {
    this.setState('riposted');
    if (this.attack) this.endAttack();
  }

  receiveRiposte() {
    const g = this.game;
    this.hp = 0;
    g.hud.damageNumber(this.center.clone(), 'EXECUTE', 'crit');
    this.die('riposte');
  }

  die(cause) {
    const g = this.game;
    if (!this.alive) return;
    this.alive = false;
    this.targetable = false;
    this.staggered = false;
    if (this.attack) this.endAttack();
    this.setState('dying');
    this.telegraph.hide();
    const pos = this.center.clone();
    g.sfx.death({ pan: g.panFor(this.position), big: this.maxHp > 10 });
    g.fx.effects.shardBurst(pos, { count: this.maxHp > 10 ? 30 : 18, color: this.color, speed: 9, up: 7 });
    g.fx.particles.burst(pos, { count: 70, color: this.color, speed: 14, life: 0.7, size: 0.1, stretch: 0.08 });
    g.fx.particles.burst(pos, { count: 18, color: 0xffffff, speed: 6, life: 0.35, size: 0.15, soft: 0.9 });
    g.fx.effects.sphere(pos, { color: this.color, radius: 2.2, duration: 0.3, opacity: 0.4 });
    g.fx.effects.shockwave(this.position, { color: this.color, radius: 4, duration: 0.5 });
    g.fx.effects.flash(pos, this.color, 45, 0.3);
    g.arena.addRipple(this.position, 1.2, this.color);
    g.cameraRig.addTrauma(0.22);
    g.onEnemyKilled(this, cause);
  }

  remove() {
    if (this.removed) return;
    this.removed = true;
    this.game.scene.remove(this.mesh);
    this.telegraph.dispose();
    if (this.dispose) this.dispose();
  }

  // Threat descriptor for the HUD rhythm lane / off-screen indicators.
  threat() {
    const a = this.attack;
    if (!a || a.resolved || !this.alive || a.noThreat) return null;
    return {
      time: a.impactIn / Math.max(0.2, this.game.time.enemyScale),
      parryable: a.parryable !== false && !a.unblockable,
      unblockable: !!a.unblockable,
      source: this.position,
      kind: a.kind || 'melee',
    };
  }

  updateVisuals(dt) {
    this.U.uFlash.value = damp(this.U.uFlash.value, 0, 10, dt);
    this.U.uGlowBoost.value = damp(this.U.uGlowBoost.value, this.attack ? 2 : 1, 4, dt);
  }
}

export function randomEdgePosition(minR = 14, maxR = 26, avoid = null, avoidDist = 8) {
  for (let i = 0; i < 20; i++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(minR, maxR);
    const p = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    if (!avoid || flatDist(p, avoid) > avoidDist) return p;
  }
  return new THREE.Vector3(0, 0, -20);
}
