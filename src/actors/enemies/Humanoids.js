// Humanoid enemies built on the shared rig:
//  - Duelist: fast sword combos on the beat; guards your swings, so parry them.
//  - Brute: heavy hammer. Parryable slams, red unblockable sweeps and quakes.
//  - Lancer: telegraphed lance charges (parry one to break them instantly)
//    and javelin volleys.
import * as THREE from 'three';
import { Enemy } from './Enemy.js';
import { buildHumanoid, Animator, locomotion } from '../Rig.js';
import { SwordTrail, ClothRibbon } from '../../fx/Trail.js';
import { clamp, damp, dampAngle, flatDist, rand, pick, chance, yawTo, TAU } from '../../core/MathUtil.js';

class HumanoidEnemy extends Enemy {
  constructor(game, opts, style, guard) {
    super(game, opts);
    this.rig = buildHumanoid(style);
    this.anim = new Animator(this.rig);
    this.mesh = this.rig.root;
    this.U = this.rig.U;
    this.guardStyle = guard;
    this.runPhase = Math.random() * 10;
    this.trail = new SwordTrail(game.scene, this.color, 0.12);
    this._tip = new THREE.Vector3();
    this._base = new THREE.Vector3();
    this.strafeDir = chance(0.5) ? 1 : -1;
    this.attackCooldown = rand(0.8, 2);
    this.recoverTime = 0.6;
  }

  get weaponTip() {
    return this.rig.bladeTip.getWorldPosition(this._tip);
  }

  updateVisuals(dt) {
    super.updateVisuals(dt);
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = dampAngle(this.mesh.rotation.y, this.yaw, 16, dt);
    const hs = Math.hypot(this.velocity.x, this.velocity.z);
    const sp = this.state === 'dying' || this.staggered ? 0 : clamp(hs / 7, 0, 1);
    this.runPhase += dt * (5 + hs * 1.1);
    locomotion(this.anim, { speed: sp, phase: this.runPhase, time: this.time + this.id, guard: this.guardStyle, lean: 0 });
    this.anim.update(dt);
    if (this.state === 'dying') {
      this.mesh.position.y -= this.stateTime * 0.4;
    }
    this.mesh.updateMatrixWorld(true);
    this.rig.bladeBase.getWorldPosition(this._base);
    this.rig.bladeTip.getWorldPosition(this._tip);
    this.trail.push(this.game.time.elapsed, this._base, this._tip);
    this.trail.update(this.game.time.elapsed);
  }

  onFlinch(hit) {
    if (!this.attack && !this.staggered) {
      this.anim.play('hurt', 0.28);
      this.anim.flinch = 1;
    } else {
      this.anim.flinch = 0.6;
    }
  }

  onStagger() {
    this.anim.play('stagger', 0.9, { hold: true });
    this.trail.emitting = false;
    this.velocity.set(0, 0, 0);
  }

  onRecover() {
    this.anim.stop(0.3);
    this.setState('idle');
    this.attackCooldown = rand(0.3, 0.8);
  }

  lockForRiposte() {
    super.lockForRiposte();
    this.anim.play('stagger', 0.3, { hold: true });
  }

  dispose() {
    this.game.scene.remove(this.trail.mesh);
    this.trail.geo.dispose();
    this.trail.mesh.material.dispose();
  }

  // Shared melee strike flow. strike = { pose:'slash'|'slash2'|'heavy'|'sweep'|'thrust', ... }
  updateMeleeStrike(dt, att) {
    const p = this.player;
    const d = this.distToPlayer();
    const lead = att.hitLead ?? 0.11;
    // Track the player until shortly before impact, then commit.
    if (att.impactIn > (att.commit ?? 0.25)) {
      this.faceTo(p.position, dt, att.trackRate ?? 9);
      if (d > att.range * 0.75) this.steer(p.position, att.approachSpeed ?? 6, dt, 8);
      else this.steer(this.position, 0, dt, 10);
    } else {
      this.steer(this.position, 0, dt, 12);
    }
    // Windup pose & telegraph
    if (!att.windStarted) {
      att.windStarted = true;
      this.anim.play(att.windClip, 0.25, { hold: true });
    }
    const tpos = this._v2.copy(this.position).setY(this.position.y + this.hitHeight + 0.35 * this.rig.scale);
    this.showTelegraph(att, tpos, att.teleSize ?? 2.4);
    if (att.warning) att.warning.progress = 1 - att.impactIn / att.total;
    if (!att.struck && att.impactIn <= lead) {
      att.struck = true;
      this.anim.play(att.hitClip, Math.max(0.3, lead / 0.28));
      this.trail.emitting = true;
      // Lunge in at the moment of the strike
      if (d > att.range * 0.6 && d < att.range + 2.2) {
        const f = this._v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        this.knock.addScaledVector(f, Math.min(14, (d - att.range * 0.5) * 8));
      }
      this.game.sfx.swing(1, { heavy: !!att.heavy });
    }
    if (att.impactIn <= 0) {
      att.resolved = true;
      this.telegraph.hide();
      const res = this.resolveMelee(att);
      const f = this._v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      const fxPos = this._v2.copy(this.position).setY(this.position.y + this.hitHeight).addScaledVector(f, 0.3);
      this.game.fx.effects.slash(fxPos, this.yaw, {
        color: att.unblockable ? 0xff2040 : this.color, radius: att.range + 0.4, roll: att.slashRoll ?? 0,
        mirror: !!att.slashMirror, shape: att.arc >= 360 ? 'full' : 'wide', duration: 0.2, opacity: 0.9,
      });
      if (att.onImpact) att.onImpact(res);
      setTimeout(() => (this.trail.emitting = false), 120);
      return res;
    }
    return null;
  }
}

// ======================================================================= DUELIST

export class Duelist extends HumanoidEnemy {
  constructor(game, level = 1) {
    super(game, {
      type: 'duelist', hp: 6, posture: 100, radius: 0.55, height: 2, hitHeight: 1.15, score: 250, color: 0xff2448,
    }, 'duelist', 'sword');
    this.level = level;
    this.guardChance = clamp(0.45 + level * 0.04, 0.45, 0.75);
    this.queue = [];
    // Tattered crimson sash trailing from the belt.
    this.sash = new ClothRibbon(this.rig.J.hips, game.scene, { segments: 8, length: 1.15, width: 0.13, color: 0x7a0c20 });
    this.sash.anchor.position.set(-0.1, 0.04, -0.13);
    this._wind = new THREE.Vector3();
    this._bf = new THREE.Vector3();
  }

  updateVisuals(dt) {
    super.updateVisuals(dt);
    const t = this.time;
    this._wind.set(-this.velocity.x * 3 + Math.sin(t * 2.1 + this.id) * 2, 1.5, -this.velocity.z * 3 + Math.cos(t * 1.6) * 2);
    this._bf.set(Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y));
    this.sash.update(dt, this._wind, this._bf);
  }

  dispose() {
    super.dispose();
    this.sash.dispose(this.game.scene);
  }

  canGuard() {
    if (this.attack || this.state === 'recover' || this.state === 'spawn') return false;
    return Math.random() < this.guardChance;
  }

  onGuard() {
    // Riposte back quickly after blocking the player.
    this.anim.play('parryHit', 0.25);
    this.attackCooldown = Math.min(this.attackCooldown, 0.15);
  }

  think(dt) {
    const p = this.player;
    const d = this.distToPlayer();
    if (this.attack) return;
    if (this.state === 'recover') {
      this.steer(this.position, 0, dt, 8);
      this.faceTo(p.position, dt, 3);
      if (this.stateTime > this.recoverTime) this.setState('idle');
      return;
    }
    this.faceTo(p.position, dt, 8);
    if (d > 5) {
      this.steer(p.position, 7.5, dt, 6);
    } else {
      if (chance(dt * 0.4)) this.strafeDir *= -1;
      this.orbit(3.4, 4.2, this.strafeDir, dt);
    }
    this.attackCooldown -= dt;
    if (this.attackCooldown <= 0 && d < 7 && p.alive && this.game.director.requestToken(this, 'melee')) {
      this.token = 'melee';
      this._startCombo();
    }
  }

  _startCombo() {
    const lvl = this.level;
    const patterns = [
      [{ w: 'eSlashWind', h: 'eSlashHit' }],
      [{ w: 'eSlashWind', h: 'eSlashHit' }, { w: 'eSlash2Wind', h: 'eSlash2Hit', gap: 1 }],
    ];
    if (lvl >= 2) patterns.push([{ w: 'eSlashWind', h: 'eSlashHit' }, { w: 'eSlash2Wind', h: 'eSlash2Hit', gap: 1 }, { w: 'eHeavyWind', h: 'eHeavyHit', gap: 1, heavy: true }]);
    if (lvl >= 3) patterns.push([{ w: 'eSlash2Wind', h: 'eSlash2Hit' }, { w: 'eSlashWind', h: 'eSlashHit', gap: 0.5 }, { w: 'eSlash2Wind', h: 'eSlash2Hit', gap: 1 }]);
    if (lvl >= 4) patterns.push([{ w: 'eSlashWind', h: 'eSlashHit', delay: true }, { w: 'eSlash2Wind', h: 'eSlash2Hit', gap: 0.5 }]);
    this.queue = pick(patterns).slice();
    this._nextStrike(true);
  }

  _nextStrike(first) {
    const s = this.queue.shift();
    if (!s) return false;
    const spb = this.game.music.spb;
    const minDelay = first ? (s.delay ? spb * 2.6 : spb * 1.7) : (s.gap ?? 1) * spb * 0.85;
    this.beginAttack({
      windup: minDelay,
      subdiv: s.gap === 0.5 ? 0.5 : 1,
      windClip: s.w, hitClip: s.h,
      range: s.heavy ? 3.0 : 2.6, arc: 120, damage: s.heavy ? 16 : 12, postureDmg: s.heavy ? 42 : 34,
      heavy: !!s.heavy, knockback: s.heavy ? 9 : 6, commit: 0.22,
      slashRoll: s.heavy ? Math.PI / 2 : (s.h === 'eSlash2Hit' ? 0.2 : -0.15), slashMirror: s.h === 'eSlash2Hit',
      teleSize: 2.2,
    });
    return true;
  }

  updateAttack(dt, att) {
    const res = this.updateMeleeStrike(dt, att);
    if (res !== null) {
      // Strike finished: chain the next one or recover.
      const tok = this.token;
      this.attack = null;
      if (this.staggered) return;
      if (!this._nextStrike(false)) {
        this.token = tok;
        this.endAttack();
        this.setState('recover');
        this.recoverTime = res === 'parried' ? 0.9 : 0.55;
        this.attackCooldown = rand(1.0, 2.2) / (1 + this.level * 0.1);
      }
    }
  }

  onParriedReact(att, onBeat) {
    if (this.queue.length === 0) this.anim.play('recoil', 0.35);
    else this.anim.flinch = 0.5;
  }
}

// ========================================================================= BRUTE

export class Brute extends HumanoidEnemy {
  constructor(game, level = 1) {
    super(game, {
      type: 'brute', hp: 16, posture: 150, radius: 0.95, height: 3, hitHeight: 1.7, hitTolerance: 2.2, lockHeight: 2, score: 600, color: 0xff8a1f,
    }, 'brute', 'heavy');
    this.level = level;
    this.attackCooldown = rand(1.2, 2.2);
    this.staggerDuration = 3.6;
  }

  think(dt) {
    const p = this.player;
    const d = this.distToPlayer();
    if (this.attack) return;
    if (this.state === 'recover') {
      this.steer(this.position, 0, dt, 6);
      if (this.stateTime > this.recoverTime) this.setState('idle');
      return;
    }
    this.faceTo(p.position, dt, 4);
    if (d > 3.4) this.steer(p.position, 3.6, dt, 4);
    else this.steer(this.position, 0, dt, 6);
    this.attackCooldown -= dt;
    if (this.attackCooldown <= 0 && d < 7.5 && p.alive && this.game.director.requestToken(this, 'heavy')) {
      this.token = 'heavy';
      const roll = Math.random();
      const spb = this.game.music.spb;
      if (roll < 0.45) this._slam(spb);
      else if (roll < 0.75) this._sweep(spb);
      else this._quake(spb);
    }
  }

  _slam(spb) {
    this.hyperArmor = true;
    this.beginAttack({
      kind: 'slam', windup: spb * 1.8, windClip: 'eHeavyWind', hitClip: 'eHeavyHit',
      range: 3.6, arc: 80, damage: 22, postureDmg: 45, heavy: true, knockback: 11, commit: 0.3, hitLead: 0.1,
      slashRoll: Math.PI / 2, teleSize: 3.2, parryKnock: 3,
      onImpact: () => this._groundImpact(1),
    });
  }

  _sweep(spb) {
    this.hyperArmor = true;
    const att = this.beginAttack({
      kind: 'sweep', windup: spb * 2.6, windClip: 'eSweepWind', hitClip: 'eSweepHit',
      range: 4.4, arc: 360, damage: 24, unblockable: true, maxHeight: 0.9, heavy: true, knockback: 12, commit: 0.35,
      teleSize: 3.4, approachSpeed: 2.5,
    });
    att.warning = this.game.fx.effects.warning({ type: 'circle', pos: this.position, radius: 4.4 + 0.55 });
    att._follow = true;
  }

  _quake(spb) {
    this.hyperArmor = true;
    this.beginAttack({
      kind: 'quake', windup: spb * 1.8, windClip: 'eHeavyWind', hitClip: 'eHeavyHit',
      range: 0, arc: 360, damage: 0, unblockable: true, heavy: true, commit: 0.3, noThreat: true,
      teleSize: 3.4,
      onImpact: () => {
        this._groundImpact(1.6);
        this.game.spawnQuake(this.position, { speed: 12, maxR: 18, damage: 18, color: 0xff8a1f });
      },
    });
    this.attack.unblockable = true;
  }

  _groundImpact(power) {
    const g = this.game;
    const f = this._v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const pos = this.position.clone().addScaledVector(f, 2.6);
    g.sfx.slam({ pan: g.panFor(pos) });
    g.arena.addRipple(pos, 1.5 * power, 0xff8a1f);
    g.fx.effects.shockwave(pos, { color: 0xff8a1f, radius: 4 * power, duration: 0.5 });
    g.fx.particles.ring(pos, { count: 40, color: 0xffb060, speed: 10 * power, life: 0.4, size: 0.1 });
    g.fx.effects.shardBurst(pos, { count: 8, color: 0xff8a1f, speed: 5, up: 8, size: 1.3 });
    g.fx.effects.scorch(pos, { radius: 1.6 * power, color: 0xff8a1f });
    const near = flatDist(pos, g.player.position);
    g.cameraRig.addTrauma(clamp(0.6 - near * 0.04, 0.1, 0.5));
  }

  updateAttack(dt, att) {
    if (att.warning && att._follow) {
      att.warning.mesh.position.x = this.position.x;
      att.warning.mesh.position.z = this.position.z;
    }
    const res = this.updateMeleeStrike(dt, att);
    if (res !== null) {
      if (res === 'jumped' || res === 'dodged') this.game.style.add(40, 'evade');
      this.hyperArmor = false;
      this.endAttack();
      if (!this.staggered) {
        this.setState('recover');
        this.recoverTime = res === 'parried' ? 1.3 : 0.9;
        this.attackCooldown = rand(1.4, 2.6) / (1 + this.level * 0.08);
      }
    }
  }

  onParriedReact() {
    this.anim.play('recoil', 0.6);
  }

  onStagger() {
    super.onStagger();
    this.hyperArmor = false;
  }
}

// ======================================================================== LANCER

export class Lancer extends HumanoidEnemy {
  constructor(game, level = 1) {
    super(game, {
      type: 'lancer', hp: 5, posture: 90, radius: 0.55, height: 2.1, hitHeight: 1.2, score: 300, color: 0xa36bff,
    }, 'lancer', 'spear');
    this.level = level;
    this.attackCooldown = rand(1.5, 3);
    this.chargeDir = new THREE.Vector3();
  }

  think(dt) {
    const p = this.player;
    const d = this.distToPlayer();
    if (this.attack) return;
    if (this.state === 'recover') {
      this.steer(this.position, 0, dt, 5);
      if (this.stateTime > this.recoverTime) this.setState('idle');
      return;
    }
    this.faceTo(p.position, dt, 6);
    if (d < 8) {
      // Back off
      const away = this._v2.set(this.position.x * 2 - p.position.x, 0, this.position.z * 2 - p.position.z);
      this.steer(away, 5, dt, 5);
    } else if (d > 14) {
      this.steer(p.position, 6, dt, 5);
    } else {
      if (chance(dt * 0.3)) this.strafeDir *= -1;
      this.orbit(d, 3.5, this.strafeDir, dt);
    }
    this.attackCooldown -= dt;
    if (this.attackCooldown <= 0 && p.alive && this.game.director.requestToken(this, chance(0.6) ? 'melee' : 'ranged')) {
      this.token = 'lancer';
      if (chance(0.6)) this._charge();
      else this._volley();
    }
  }

  _charge() {
    const spb = this.game.music.spb;
    const att = this.beginAttack({
      kind: 'charge', windup: spb * 2.6, range: 1.5, arc: 360, damage: 16, postureDmg: 999,
      knockback: 12, charging: false, speed: 30, teleSize: 2.4,
    });
    att.warning = this.game.fx.effects.warning({ type: 'line', from: this.position, to: this.player.position, width: 1.6, color: 0xffd34a });
    this.anim.play('eThrustWind', 0.3, { hold: true });
    this.game.sfx.charge({ pan: this.game.panFor(this.position) });
  }

  _volley() {
    const spb = this.game.music.spb;
    const n = this.level >= 3 ? 3 : 2;
    const att = this.beginAttack({ kind: 'volley', windup: spb * 2.2, parryable: true, range: 0, shots: n, fired: 0, teleSize: 2.2, noThreat: false });
    att.shotTimes = [];
    for (let i = 0; i < n; i++) att.shotTimes.push(att.impactIn + i * spb * 0.5);
    this.anim.play('eHeavyWind', 0.3, { hold: true });
  }

  updateAttack(dt, att) {
    const g = this.game;
    const p = this.player;
    const tpos = this._v2.copy(this.position).setY(this.position.y + 2.4);
    if (att.kind === 'charge') {
      const d = this.distToPlayer();
      // Contact happens at range + body radius, so start the dash such that it lands at impactIn = 0.
      const travel = Math.max(0, d - (att.range + p.radius)) / att.speed;
      if (!att.charging) {
        this.steer(this.position, 0, dt, 8);
        if (att.impactIn > travel + 0.3) {
          this.faceTo(p.position, dt, 10);
          // Update the warning line to track the player.
          const w = att.warning;
          const to = this._v.copy(p.position);
          const dx = to.x - this.position.x, dz = to.z - this.position.z;
          const len = Math.hypot(dx, dz) + 3;
          const ux = dx / (len - 3 || 1), uz = dz / (len - 3 || 1);
          w.mesh.position.set(this.position.x + ux * len / 2, 0.04, this.position.z + uz * len / 2);
          w.mesh.rotation.y = Math.atan2(ux, uz);
          w.mesh.scale.set(1.6, 1, -len);
          this.chargeDir.set(ux, 0, uz);
        }
        att.warning.progress = 1 - att.impactIn / att.total;
        this.showTelegraph(att, tpos, 2.2);
        if (att.impactIn <= travel) {
          att.charging = true;
          att.chargeLeft = travel + 0.4;
          this.anim.play('eThrustHit', 0.5, { hold: true });
          this.trail.emitting = true;
          this.telegraph.hide();
          g.sfx.dash();
        }
      } else {
        // Charging along the locked direction
        att.chargeLeft -= dt;
        this.position.addScaledVector(this.chargeDir, att.speed * dt);
        this.yaw = Math.atan2(this.chargeDir.x, this.chargeDir.z);
        if (Math.random() < 0.8) g.fx.particles.trail(this.center, this.color, { size: 0.25, life: 0.25 });
        const dd = flatDist(this.position, p.position);
        if (!att.hitChecked && dd <= att.range + p.radius) {
          const res = this.resolveMelee(att);
          if (res !== 'miss') att.hitChecked = true;
          if (res === 'parried') {
            att.resolved = true;
            if (!this.staggered) this.anim.play('recoil', 0.3);
            this._finishAttack(1.0);
            return;
          }
        }
        if (att.chargeLeft <= 0 || Math.hypot(this.position.x, this.position.z) > 28) {
          att.resolved = true;
          this.trail.emitting = false;
          this._finishAttack(0.8);
        }
      }
      return;
    }
    if (att.kind === 'volley') {
      this.steer(this.position, 0, dt, 8);
      this.faceTo(p.position, dt, 8);
      this.showTelegraph(att, tpos, 2.2);
      // Throw each spear so it arrives on its half-beat.
      for (let i = att.fired; i < att.shots; i++) {
        const arriveIn = att.shotTimes[i] - (att.total - att.impactIn);
        const d = this.distToPlayer();
        const flight = clamp(d / 22, 0.45, 0.9);
        if (arriveIn <= flight) {
          att.fired++;
          const tip = this.weaponTip.clone();
          tip.y = Math.max(tip.y, 1.6);
          g.projectiles.spawn({ pos: tip, arrival: arriveIn, kind: 'spear', damage: 12, owner: this, radius: 0.35 });
          g.sfx.shoot({ pan: g.panFor(this.position) });
          this.anim.play('eThrustHit', 0.3);
        } else break;
      }
      if (att.fired >= att.shots) {
        att.resolved = true;
        this._finishAttack(0.7);
      }
    }
  }

  _finishAttack(rec) {
    this.endAttack();
    if (!this.staggered) {
      this.setState('recover');
      this.recoverTime = rec;
      this.attackCooldown = rand(1.8, 3.2) / (1 + this.level * 0.1);
    }
  }

  threat() {
    const a = this.attack;
    if (!a || a.resolved || !this.alive) return null;
    if (a.kind === 'volley') return null; // spears report themselves once thrown
    return super.threat();
  }
}
