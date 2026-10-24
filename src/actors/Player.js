// The player: a cyber-ronin with a 3-hit sword combo, air attacks, dash with
// invulnerability, double jump, and the star of the show: a timing-based
// PARRY. Perfect parries reflect projectiles, break enemy posture, slow time,
// and pay out extra Resonance when they land on the musical beat.
import * as THREE from 'three';
import { buildHumanoid, Animator, locomotion } from './Rig.js';
import { SwordTrail, ClothRibbon } from '../fx/Trail.js';
import { clamp, damp, dampAngle, angleDelta, yawTo, flatDist, lerp } from '../core/MathUtil.js';
import { ARENA_RADIUS } from '../world/Arena.js';

export const PARRY_WINDOW = 0.18;    // seconds of "perfect" after pressing parry
const PARRY_WHIFF_CD = 0.3;          // lockout if the window expires unused
const PERFECT_TOLERANCE = 0.095;     // press within this long before impact = PERFECT (impacts land on the beat)
const RUN_SPEED = 10.5;
const GRAVITY = 40;
const JUMP_V = 13.5;
const DASH_SPEED = 31;
const DASH_TIME = 0.17;
const DASH_IFRAMES = 0.22;
const DASH_RECHARGE = 0.85;
const OVERDRIVE_TIME = 8;

const SWINGS = {
  a1: { clip: 'attack1', dur: 0.34, hit: 0.085, range: 3.0, arc: 160, dmg: 1, posture: 12, slash: { roll: -0.12, mirror: false, shape: 'wide' }, lunge: 6 },
  a2: { clip: 'attack2', dur: 0.34, hit: 0.085, range: 3.0, arc: 160, dmg: 1, posture: 12, slash: { roll: 0.15, mirror: true, shape: 'wide' }, lunge: 6 },
  a3: { clip: 'attack3', dur: 0.52, hit: 0.24, range: 3.5, arc: 110, dmg: 2, posture: 26, slash: { roll: Math.PI / 2 - 0.15, mirror: false, shape: 'wide' }, lunge: 9, heavy: true },
  air: { clip: 'airAttack', dur: 0.36, hit: 0.1, range: 3.2, arc: 170, dmg: 1, posture: 12, slash: { roll: 0.5, mirror: true, shape: 'full' }, lunge: 7 },
};
const COMBO = ['a1', 'a2', 'a3'];

export class Player {
  constructor(game) {
    this.game = game;
    this.rig = buildHumanoid('player');
    this.anim = new Animator(this.rig);
    this.mesh = this.rig.root;
    game.scene.add(this.mesh);
    this.position = this.mesh.position;
    this.velocity = new THREE.Vector3();
    this.radius = 0.55;
    this.yaw = 0;
    this.trail = new SwordTrail(game.scene, 0x5ff4ff, 0.13);
    this.scarf = new ClothRibbon(this.rig.J.chest, game.scene, { segments: 10, length: 1.05, width: 0.13, color: 0xff2b8a, emissive: 0x000000 });
    this.scarf.anchor.position.set(0.05, 0.27, -0.1);
    this.scarf2 = new ClothRibbon(this.rig.J.chest, game.scene, { segments: 8, length: 0.8, width: 0.1, color: 0xff2b8a });
    this.scarf2.anchor.position.set(-0.07, 0.27, -0.1);
    this._tipW = new THREE.Vector3();
    this._baseW = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.position.set(0, 0, 6);
    this.velocity.set(0, 0, 0);
    this.yaw = Math.PI;
    this.hp = 100;
    this.maxHp = 100;
    this.resonance = 0;
    this.state = 'idle';
    this.stateTime = 0;
    this.grounded = true;
    this.jumpsLeft = 2;
    this.airDashUsed = false;
    this.dashCharges = 2;
    this.dashRecharge = 0;
    this.dashDir = new THREE.Vector3();
    this.iframes = 0;
    this.parryWindow = 0;
    this.parryCooldown = 0;
    this.parryHeld = false;
    this.parryChain = 0;
    this.lastParryTime = -10;
    this.lastParryOnBeat = false;
    this.comboIdx = 0;
    this.comboResetTimer = 0;
    this.swing = null;
    this.swingHitDone = false;
    this.overdrive = 0;
    this.overdriveActive = false;
    this.hurtTimer = 0;
    this.riposteTarget = null;
    this.dead = false;
    this.runPhase = 0;
    this.lastStepSign = 1;
    this.target = null;
    this.blockTime = 0;
    this.airTime = 0;
    this.landedHard = false;
    this.stats = { parries: 0, onBeat: 0, ripostes: 0, hitsTaken: 0, kills: 0, reflects: 0, damageDealt: 0 };
    this.mesh.rotation.y = this.yaw;
    this.mesh.visible = true;
    this.rig.U.uDissolve.value = 0;
    this.scarf.reset();
    this.scarf2.reset();
    this.trail.clear();
    this.trail.setColor(0x5ff4ff);
    this.anim.stop(0.001);
  }

  get alive() {
    return !this.dead;
  }

  get center() {
    return this._v.set(this.position.x, this.position.y + 1.1, this.position.z);
  }

  get blocking() {
    return this.parryHeld && this.parryWindow <= 0 && !this.dead && this.state !== 'dash';
  }

  get forward() {
    return this._fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  // ------------------------------------------------------------ targeting

  findTarget(maxDist = 9, requireStagger = false) {
    const g = this.game;
    const camF = g.cameraRig.forwardFlat;
    let best = null, bestScore = Infinity;
    for (const e of g.enemies) {
      if (!e.alive || !e.targetable) continue;
      if (requireStagger && !e.staggered) continue;
      const d = flatDist(this.position, e.position);
      if (d > maxDist) continue;
      const dx = (e.position.x - this.position.x) / (d || 1);
      const dz = (e.position.z - this.position.z) / (d || 1);
      const dot = dx * camF.x + dz * camF.z;
      const score = d * (1.6 - dot) + (e === g.cameraRig.lockTarget ? -6 : 0);
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  // -------------------------------------------------------------- update

  update(dt) {
    const g = this.game;
    const input = g.input;
    this.stateTime += dt;
    this.iframes = Math.max(0, this.iframes - dt);
    this.parryCooldown = Math.max(0, this.parryCooldown - dt);
    this.comboResetTimer = Math.max(0, this.comboResetTimer - dt);
    if (this.comboResetTimer <= 0 && this.state !== 'attack') this.comboIdx = 0;

    if (this.dead) {
      this._updateDead(dt);
      return;
    }

    // Dash charges
    if (this.dashCharges < 2) {
      this.dashRecharge += dt;
      if (this.dashRecharge >= DASH_RECHARGE) {
        this.dashCharges++;
        this.dashRecharge = 0;
      }
    }

    // Overdrive drain
    if (this.overdriveActive) {
      this.overdrive -= dt;
      this.resonance = Math.max(0, (this.overdrive / OVERDRIVE_TIME) * 100);
      if (this.overdrive <= 0) this._endOverdrive();
    }

    // ---------------- parry input (highest priority, cancels almost anything)
    const canAct = this.state !== 'riposte' && this.state !== 'overdriveStart';
    if (this.parryWindow > 0) {
      this.parryWindow -= dt;
      if (this.parryWindow <= 0) {
        this.parryWindow = 0;
        if (!this._parrySucceeded) this.parryCooldown = PARRY_WHIFF_CD;
      }
    }
    this.parryHeld = input.held('parry');
    if (canAct && input.buffered('parry', 0.1) && this.parryCooldown <= 0 && this.state !== 'dash') {
      input.consume('parry');
      this._startParry();
    }
    if (this.blocking) this.blockTime += dt;
    else this.blockTime = 0;

    // ---------------- overdrive
    if (canAct && input.pressed('overdrive') && this.resonance >= 100 && !this.overdriveActive) {
      this._startOverdrive();
    }

    // ---------------- state machine
    switch (this.state) {
      case 'idle':
      case 'run':
      case 'air':
        this._updateMove(dt, 1);
        this._tryActions();
        break;
      case 'attack':
        this._updateAttack(dt);
        break;
      case 'dash':
        this._updateDash(dt);
        break;
      case 'hurt':
        this._updateMove(dt, 0.35);
        if (this.stateTime > 0.32) this._setLocoState();
        break;
      case 'riposte':
        this._updateRiposte(dt);
        break;
      case 'overdriveStart':
        this.velocity.x = damp(this.velocity.x, 0, 10, dt);
        this.velocity.z = damp(this.velocity.z, 0, 10, dt);
        this._integrate(dt);
        // Timed in real seconds so the slow-mo flourish never eats inputs for long.
        if (g.time.real - this.odStartReal > 0.55) this._setLocoState();
        break;
    }

    // Parry/block animation layer when not doing something else.
    if ((this.parryWindow > 0 || this.blocking) && (this.state === 'idle' || this.state === 'run' || this.state === 'air')) {
      if (this.anim.clipName !== 'parry' && this.anim.clipName !== 'parryHit') this.anim.play('parry', 0.2, { hold: true });
    } else if (this.anim.clipName === 'parry' && this.parryWindow <= 0 && !this.blocking) {
      this.anim.stop(0.1);
    } else if (this.anim.clipName === 'parryHit' && this.anim.progress >= 1 && !this.blocking && this.parryWindow <= 0) {
      this.anim.stop(0.12);
    }

    this._updateVisuals(dt);
  }

  _setLocoState() {
    this.state = this.grounded ? (Math.hypot(this.velocity.x, this.velocity.z) > 1 ? 'run' : 'idle') : 'air';
    this.stateTime = 0;
  }

  _tryActions() {
    const g = this.game;
    const input = g.input;
    // Dash
    if (input.buffered('dash', 0.12) && this.dashCharges > 0 && !(this.state === 'air' && this.airDashUsed)) {
      input.consume('dash');
      this._startDash();
      return;
    }
    // Jump / double jump
    if (input.buffered('jump', 0.12) && this.jumpsLeft > 0) {
      input.consume('jump');
      const dbl = !this.grounded;
      this.velocity.y = dbl ? JUMP_V * 0.9 : JUMP_V;
      this.grounded = false;
      this.jumpsLeft--;
      this.state = 'air';
      this.stateTime = 0;
      g.sfx.jump(dbl);
      if (dbl) {
        g.fx.particles.ring(this.position, { count: 24, color: 0x5ff4ff, speed: 6, life: 0.35, size: 0.08, y: 0.2 });
        g.fx.effects.shockwave(this.position.clone().setY(this.position.y + 0.2), { color: 0x5ff4ff, radius: 1.4, duration: 0.3, y: this.position.y + 0.1 });
      } else {
        g.fx.particles.burst(this.position, { count: 10, color: 0x9a8cff, speed: 3, life: 0.3, size: 0.08, upBias: 0.5 });
      }
      return;
    }
    // Attack (riposte takes precedence on a staggered target)
    if (input.buffered('attack', 0.15)) {
      const rt = this.findTarget(7.5, true);
      if (rt) {
        input.consume('attack');
        this._startRiposte(rt);
        return;
      }
      input.consume('attack');
      this._startAttack();
    }
  }

  _updateMove(dt, control) {
    const g = this.game;
    const input = g.input;
    const cam = g.cameraRig;
    const f = cam.forwardFlat, r = cam.rightFlat;
    const mx = input.moveX, my = input.moveY;
    let wx = f.x * my + r.x * mx;
    let wz = f.z * my + r.z * mx;
    const len = Math.hypot(wx, wz);
    let speed = RUN_SPEED * (this.overdriveActive ? 1.15 : 1);
    if (this.blocking || this.parryWindow > 0) speed *= 0.45;
    const accel = (this.grounded ? 75 : 32) * control;
    const tx = len > 0.01 ? (wx / Math.max(1, len)) * speed : 0;
    const tz = len > 0.01 ? (wz / Math.max(1, len)) * speed : 0;
    const k = 1 - Math.exp(-accel / speed * dt);
    this.velocity.x += (tx - this.velocity.x) * k;
    this.velocity.z += (tz - this.velocity.z) * k;

    // Face movement direction, or the locked target / attacker when guarding.
    const lock = cam.lockTarget;
    if (lock && lock.alive) {
      this.yaw = dampAngle(this.yaw, yawTo(this.position, lock.position), 14, dt);
    } else if (len > 0.1 && !(this.parryWindow > 0 || this.blocking)) {
      this.yaw = dampAngle(this.yaw, Math.atan2(wx, wz), 14, dt);
    }

    this._integrate(dt);

    if (this.state === 'idle' || this.state === 'run' || this.state === 'air') {
      const hs = Math.hypot(this.velocity.x, this.velocity.z);
      const want = !this.grounded ? 'air' : hs > 1.2 ? 'run' : 'idle';
      if (want !== this.state) { this.state = want; this.stateTime = 0; }
    }
  }

  _integrate(dt) {
    const g = this.game;
    if (!this.grounded) {
      this.velocity.y -= GRAVITY * dt;
      this.airTime += dt;
    }
    this.position.addScaledVector(this.velocity, dt);
    if (this.position.y <= 0) {
      if (!this.grounded) {
        const hard = this.velocity.y < -16;
        g.sfx.land(hard);
        g.fx.particles.ring(this.position, { count: hard ? 26 : 12, color: 0x8a7cff, speed: hard ? 7 : 4, life: 0.3, size: 0.07, y: 0.05 });
        if (hard) g.cameraRig.addTrauma(0.15);
      }
      this.position.y = 0;
      this.velocity.y = 0;
      this.grounded = true;
      this.jumpsLeft = 2;
      this.airDashUsed = false;
      this.airTime = 0;
    } else if (this.position.y > 0.001 && this.velocity.y !== 0) {
      this.grounded = false;
    }
    // Arena boundary (energy barrier)
    const r = Math.hypot(this.position.x, this.position.z);
    const maxR = ARENA_RADIUS - 0.7;
    if (r > maxR) {
      const nx = this.position.x / r, nz = this.position.z / r;
      this.position.x = nx * maxR;
      this.position.z = nz * maxR;
      const vn = this.velocity.x * nx + this.velocity.z * nz;
      if (vn > 0) {
        this.velocity.x -= vn * nx;
        this.velocity.z -= vn * nz;
        if (vn > 6) g.arena.hitBarrier(this.position);
      }
    }
    // Push out of enemies
    for (const e of g.enemies) {
      if (!e.alive || !e.solid) continue;
      const dx = this.position.x - e.position.x, dz = this.position.z - e.position.z;
      const min = this.radius + e.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6 && Math.abs(this.position.y - e.position.y) < (e.height || 2)) {
        const d = Math.sqrt(d2);
        const push = (min - d);
        this.position.x += (dx / d) * push;
        this.position.z += (dz / d) * push;
      }
    }
  }

  // ---------------------------------------------------------------- dash

  _startDash() {
    const g = this.game;
    const input = g.input;
    const cam = g.cameraRig;
    const f = cam.forwardFlat, r = cam.rightFlat;
    let dx = f.x * input.moveY + r.x * input.moveX;
    let dz = f.z * input.moveY + r.z * input.moveX;
    const l = Math.hypot(dx, dz);
    if (l < 0.1) { dx = -Math.sin(this.yaw); dz = -Math.cos(this.yaw); } // backstep
    else { dx /= l; dz /= l; }
    this.dashDir.set(dx, 0, dz);
    if (l >= 0.1) this.yaw = Math.atan2(dx, dz);
    this.state = 'dash';
    this.stateTime = 0;
    this.dashCharges--;
    this.iframes = Math.max(this.iframes, DASH_IFRAMES);
    if (!this.grounded) {
      this.airDashUsed = true;
      this.velocity.y = Math.max(this.velocity.y, 2);
    }
    this.anim.play('dash', DASH_TIME + 0.08);
    g.sfx.dash();
    g.cameraRig.kickFov(9);
    g.post.kickZoom(0.6);
    g.fx.particles.burst(this.center, { count: 18, color: 0x5ff4ff, speed: 4, life: 0.3, size: 0.12 });
    this._afterimages = 0;
  }

  _updateDash(dt) {
    const g = this.game;
    const k = this.stateTime / DASH_TIME;
    const sp = DASH_SPEED * (1 - k * 0.5);
    this.velocity.x = this.dashDir.x * sp;
    this.velocity.z = this.dashDir.z * sp;
    if (!this.grounded) this.velocity.y = Math.max(this.velocity.y - GRAVITY * dt * 0.2, -2);
    this._integrate(dt);
    // Afterimage streaks
    this._afterimages += dt;
    if (this._afterimages > 0.012) {
      this._afterimages = 0;
      const c = this.center;
      for (let i = 0; i < 3; i++) {
        g.fx.particles.trail({ x: c.x + (Math.random() - 0.5) * 0.4, y: c.y - 0.6 + Math.random() * 1.4, z: c.z + (Math.random() - 0.5) * 0.4 }, 0x37c8ff, { size: 0.16, life: 0.22 });
      }
    }
    if (this.stateTime >= DASH_TIME) {
      this.velocity.x *= 0.35;
      this.velocity.z *= 0.35;
      this._setLocoState();
      // Dash-cancel into attack/parry stays responsive thanks to input buffering.
    }
  }

  // -------------------------------------------------------------- attack

  _startAttack() {
    const g = this.game;
    const key = this.grounded ? COMBO[this.comboIdx % 3] : 'air';
    const sw = SWINGS[key];
    this.swing = sw;
    this.swingKey = key;
    this.swingHitDone = false;
    this.state = 'attack';
    this.stateTime = 0;
    this.trail.emitting = true;
    if (this.grounded) this.comboIdx = (this.comboIdx + 1) % 3;
    this.comboResetTimer = sw.dur + 0.45;
    const dur = sw.dur * (this.overdriveActive ? 0.85 : 1);
    this.swingDur = dur;
    this.anim.play(sw.clip, dur);

    // Aim assist + lunge
    const t = this.findTarget(8);
    this.target = t;
    if (t) {
      this.yaw = yawTo(this.position, t.position);
      const d = flatDist(this.position, t.position);
      const want = Math.max(0, d - (t.radius + 1.3));
      this.lungeSpeed = Math.min(sw.lunge * 2.2, want / 0.12);
    } else {
      const input = g.input;
      if (Math.abs(input.moveX) + Math.abs(input.moveY) > 0.1) {
        const f = g.cameraRig.forwardFlat, r = g.cameraRig.rightFlat;
        this.yaw = Math.atan2(f.x * input.moveY + r.x * input.moveX, f.z * input.moveY + r.z * input.moveX);
      }
      this.lungeSpeed = sw.lunge * 0.6;
    }
    if (key === 'air') this.velocity.y = Math.max(this.velocity.y, 3.5);
    g.sfx.swing(this.comboIdx, { heavy: !!sw.heavy });
  }

  _updateAttack(dt) {
    const g = this.game;
    const sw = this.swing;
    const t = this.stateTime;
    const dur = this.swingDur;
    const hitT = sw.hit * (dur / sw.dur);
    // Lunge during the first part of the swing
    const f = this.forward;
    if (t < hitT + 0.02) {
      this.velocity.x = f.x * this.lungeSpeed;
      this.velocity.z = f.z * this.lungeSpeed;
    } else {
      this.velocity.x = damp(this.velocity.x, 0, 14, dt);
      this.velocity.z = damp(this.velocity.z, 0, 14, dt);
    }
    if (this.swingKey === 'air') this.velocity.y = Math.max(this.velocity.y, -1.5);
    this._integrate(dt);

    if (!this.swingHitDone && t >= hitT) {
      this.swingHitDone = true;
      this._resolveSwing(sw);
    }
    if (t > hitT + 0.12) this.trail.emitting = false;

    // Cancel windows: combo chain, dash and jump after the hit frame.
    const input = g.input;
    if (this.swingHitDone && t > hitT + 0.06) {
      if (input.buffered('attack', 0.25)) {
        const rt = this.findTarget(7.5, true);
        input.consume('attack');
        if (rt) this._startRiposte(rt);
        else this._startAttack();
        return;
      }
      if (input.buffered('dash', 0.15) && this.dashCharges > 0) {
        input.consume('dash');
        this.trail.emitting = false;
        this._startDash();
        return;
      }
      if (input.buffered('jump', 0.15) && this.jumpsLeft > 0) {
        this.trail.emitting = false;
        this._setLocoState();
        this._tryActions();
        return;
      }
    }
    if (t >= dur) {
      this.trail.emitting = false;
      this._setLocoState();
    }
  }

  _resolveSwing(sw) {
    const g = this.game;
    const f = this.forward;
    const od = this.overdriveActive;
    const origin = this._v2.set(this.position.x, this.position.y + 1.1, this.position.z);
    const slashPos = origin.clone().addScaledVector(f, 0.2);
    const color = od ? 0xffc23a : 0x5ff4ff;
    g.fx.effects.slash(slashPos, this.yaw, {
      color, radius: sw.range * (od ? 1.25 : 1), roll: sw.slash.roll, mirror: sw.slash.mirror, shape: sw.slash.shape,
      duration: sw.heavy ? 0.24 : 0.17,
    });
    if (od) {
      // Overdrive: every swing launches a crescent wave.
      g.projectiles.spawnWave(origin.clone().addScaledVector(f, 1), f.clone(), sw.heavy ? 2 : 1);
    }
    let hits = 0;
    const range = sw.range * (od ? 1.2 : 1);
    const cosArc = Math.cos((sw.arc / 2) * (Math.PI / 180));
    for (const e of g.enemies) {
      if (!e.alive || !e.targetable) continue;
      const dx = e.position.x - this.position.x;
      const dz = e.position.z - this.position.z;
      const d = Math.hypot(dx, dz) - e.radius;
      if (d > range) continue;
      const dy = (e.position.y + (e.hitHeight || 1)) - (this.position.y + 1);
      if (Math.abs(dy) > (e.hitTolerance || 1.6) + (sw === SWINGS.air ? 0.8 : 0)) continue;
      const dist = Math.hypot(dx, dz) || 1;
      if ((dx * f.x + dz * f.z) / dist < cosArc && d > 0.4) continue;
      const dir = this._v.set(dx / dist, 0, dz / dist).clone();
      const res = e.receiveHit({
        damage: sw.dmg * (od ? 2 : 1),
        posture: sw.posture,
        dir,
        heavy: !!sw.heavy,
        source: 'sword',
        air: !this.grounded,
      });
      if (res !== 'immune') hits++;
    }
    if (hits > 0) {
      g.time.hitStop(sw.heavy ? 0.085 : 0.05);
      g.cameraRig.addTrauma(sw.heavy ? 0.3 : 0.16);
      if (!this.grounded) this.velocity.y = Math.max(this.velocity.y, 6);
    }
    if (sw.heavy && this.grounded) {
      g.arena.addRipple(this.position.clone().addScaledVector(f, 2), 0.8, color);
      if (hits > 0) g.fx.effects.scorch(this.position.clone().addScaledVector(f, 2), { radius: 1, color, life: 4 });
      g.fx.particles.ring(this.position.clone().addScaledVector(f, 2), { count: 30, color, speed: 9, life: 0.35, size: 0.08 });
    }
  }

  // ---------------------------------------------------------------- parry

  _startParry() {
    const g = this.game;
    this.parryWindow = PARRY_WINDOW * (this.overdriveActive ? 1.6 : 1);
    this._parrySucceeded = false;
    this.parryPressTime = g.time.real;
    // Parry cancels attacks and recovery.
    if (this.state === 'attack' || this.state === 'hurt') {
      this.trail.emitting = false;
      this._setLocoState();
    }
    // Face the most imminent threat.
    const th = g.mostImminentThreat();
    if (th && th.source) this.yaw = yawTo(this.position, th.source);
    this.anim.play('parry', 0.2, { hold: true });
    // Blade glint
    this.rig.U.uGlowBoost.value = 3;
    g.sfx.guard();
  }

  // Called by enemies / projectiles. Returns 'parried' | 'blocked' | 'hit' | 'dodged' | 'immune'.
  receiveAttack(att) {
    const g = this.game;
    if (this.dead) return 'immune';
    if (this.state === 'riposte' || this.state === 'overdriveStart') return 'immune';
    if (this.iframes > 0 && this.state === 'dash') {
      if (att.unblockable && !this._dodgeRewarded) {
        this._dodgeRewarded = true;
        g.hud.popText('DODGE', 'dodge');
        g.style.add(60, 'dodge');
        setTimeout(() => (this._dodgeRewarded = false), 300);
      }
      return 'dodged';
    }
    if (this.iframes > 0) return 'dodged';

    const parryable = att.parryable !== false && !att.unblockable;
    const odAuto = this.overdriveActive && this.parryHeld;
    if (parryable && (this.parryWindow > 0 || odAuto)) {
      this._onParry(att);
      return 'parried';
    }
    if (parryable && this.blocking) {
      this._onBlock(att);
      return 'blocked';
    }
    this._onHit(att);
    return 'hit';
  }

  _onParry(att) {
    const g = this.game;
    const now = g.time.elapsed;
    const autoParry = this.parryWindow <= 0; // Overdrive guard-hold auto-parry
    this._parrySucceeded = true;
    this.parryCooldown = 0;
    this.parryWindow = Math.max(this.parryWindow, 0.07);
    this.parryChain = now - this.lastParryTime < 1.4 ? this.parryChain + 1 : 1;
    this.lastParryTime = now;
    // Timing is judged from the button press to the moment of impact. Attacks
    // are quantized to the soundtrack, so a tight press is also on the beat.
    const offset = (this.parryPressTime ?? now) - g.time.real;
    const onBeat = -offset <= PERFECT_TOLERANCE || (this.overdriveActive && autoParry);
    this.lastParryOnBeat = onBeat;
    this.stats.parries++;
    if (onBeat) this.stats.onBeat++;

    // Turn to face the attacker
    const src = att.sourcePos || (att.source && att.source.position);
    if (src) this.yaw = yawTo(this.position, src);
    const f = this.forward;
    const contact = this._v2.set(this.position.x + f.x * 0.75, this.position.y + 1.35, this.position.z + f.z * 0.75).clone();

    // Resonance
    const gain = (onBeat ? 18 : 10) + Math.min(this.parryChain, 5) * 1.5;
    this.addResonance(gain);
    this.hp = Math.min(this.maxHp, this.hp + (onBeat ? 2 : 1));

    // --- juice ---
    const col = onBeat ? 0xffd34a : 0x6ff6ff;
    g.time.hitStop(onBeat ? 0.11 : 0.075);
    g.time.slowMo(0.3, onBeat ? 0.3 : 0.2, 7);
    g.cameraRig.addTrauma(onBeat ? 0.32 : 0.24);
    g.cameraRig.kickFov(-5);
    g.post.kickAberration(onBeat ? 0.9 : 0.6);
    g.post.flash(onBeat ? 0xfff0b0 : 0xd8ffff, onBeat ? 0.2 : 0.12);
    const sp = g.worldToScreen(contact);
    if (sp) g.post.setCenter(sp.x, sp.y);
    g.post.kickZoom(0.5);
    const back = this._v.set(-f.x, 0.2, -f.z).normalize().clone();
    g.fx.particles.sparks(contact, back.clone().multiplyScalar(-1), { count: 46, color: col, speed: 18, spread: 0.9, life: 0.5, size: 0.06 });
    g.fx.particles.sparks(contact, new THREE.Vector3(0, 1, 0), { count: 20, color: 0xffffff, speed: 12, spread: 1.2, life: 0.35, size: 0.05 });
    g.fx.particles.burst(contact, { count: 16, color: col, speed: 3, life: 0.4, size: 0.25, soft: 0.9 });
    g.fx.effects.shockwave(contact, { color: col, radius: onBeat ? 3.2 : 2.2, duration: 0.35, thickness: 0.05, vertical: true });
    g.fx.effects.sphere(contact, { color: col, radius: 1.4, duration: 0.22, opacity: 0.45 });
    g.fx.effects.flash(contact, col, onBeat ? 24 : 16, 0.22);
    g.arena.addRipple(this.position, onBeat ? 1.4 : 0.9, col);
    this.anim.play('parryHit', 0.24);
    this.anim.flinch = 0;
    this.rig.U.uGlowBoost.value = onBeat ? 7 : 5;
    g.sfx.parry({ pan: 0, onBeat, chain: this.parryChain - 1 });
    g.hud.onParry(onBeat, this.parryChain, offset);
    g.style.add(onBeat ? 140 : 90, onBeat ? 'beatparry' : 'parry');
    // Small pushback
    this.velocity.x -= f.x * 3;
    this.velocity.z -= f.z * 3;
    if (att.onParried) att.onParried(onBeat);
  }

  _onBlock(att) {
    const g = this.game;
    const dmg = Math.ceil(att.damage * 0.25);
    this.hp -= dmg;
    const src = att.sourcePos || (att.source && att.source.position);
    if (src) this.yaw = yawTo(this.position, src);
    const f = this.forward;
    const contact = this._v2.set(this.position.x + f.x * 0.6, this.position.y + 1.2, this.position.z + f.z * 0.6).clone();
    g.time.hitStop(0.04);
    g.cameraRig.addTrauma(0.18);
    g.fx.particles.sparks(contact, this._v.set(-f.x, 0.3, -f.z).normalize().clone(), { count: 16, color: 0xffa040, speed: 9, spread: 0.7, life: 0.3, size: 0.05 });
    g.sfx.block();
    g.hud.popText('BLOCK', 'block');
    g.hud.damageNumber(this.center, dmg, 'player');
    this.velocity.x -= f.x * (att.knockback || 4) * 0.6;
    this.velocity.z -= f.z * (att.knockback || 4) * 0.6;
    this.anim.play('parryHit', 0.2);
    if (att.onBlocked) att.onBlocked();
    if (this.hp <= 0) this._die();
  }

  _onHit(att) {
    const g = this.game;
    const dmg = att.damage;
    this.hp -= dmg;
    this.stats.hitsTaken++;
    this.iframes = 0.55;
    this.parryWindow = 0;
    const src = att.sourcePos || (att.source && att.source.position);
    const dir = this._v.set(0, 0, 0);
    if (src) {
      dir.set(this.position.x - src.x, 0, this.position.z - src.z);
      if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
      dir.normalize();
    }
    const kb = att.knockback || 6;
    this.velocity.x = dir.x * kb;
    this.velocity.z = dir.z * kb;
    if (att.launch) { this.velocity.y = att.launch; this.grounded = false; }
    this.state = 'hurt';
    this.stateTime = 0;
    this.trail.emitting = false;
    this.anim.play('hurt', 0.35);
    this.anim.flinch = 1;
    this.anim.flinchDir = Math.random() < 0.5 ? -1 : 1;
    this.rig.U.uFlash.value = 1;
    this.rig.U.uFlashColor.value.set(0xff2040);
    g.time.hitStop(0.06);
    g.cameraRig.addTrauma(0.55);
    g.post.hurt(0.7);
    g.post.kickAberration(0.5);
    g.fx.particles.sparks(this.center, dir.clone().setY(0.4).normalize(), { count: 30, color: 0xff3050, speed: 10, spread: 0.8, life: 0.4, size: 0.06 });
    g.sfx.hurt();
    g.hud.damageNumber(this.center, dmg, 'player');
    g.hud.onPlayerHit();
    g.style.onDamage();
    if (this.hp <= 0) this._die();
  }

  addResonance(v) {
    if (this.overdriveActive) return;
    const before = this.resonance;
    this.resonance = clamp(this.resonance + v, 0, 100);
    if (before < 100 && this.resonance >= 100) {
      this.game.sfx.resonanceFull();
      this.game.hud.popText('RESONANCE FULL — [Q] OVERDRIVE', 'resonance');
    }
  }

  // -------------------------------------------------------------- riposte

  _startRiposte(enemy) {
    const g = this.game;
    this.state = 'riposte';
    this.stateTime = 0;
    this.riposteTarget = enemy;
    this.riposteFrom = this.position.clone();
    const dir = new THREE.Vector3(enemy.position.x - this.position.x, 0, enemy.position.z - this.position.z);
    const d = dir.length() || 1;
    dir.multiplyScalar(1 / d);
    this.riposteTo = new THREE.Vector3(enemy.position.x - dir.x * (enemy.radius + 1.0), enemy.position.y > 1 ? Math.max(0, enemy.position.y - 1) : 0, enemy.position.z - dir.z * (enemy.radius + 1.0));
    this.yaw = Math.atan2(dir.x, dir.z);
    this.riposteDone = false;
    this.trail.emitting = true;
    enemy.lockForRiposte && enemy.lockForRiposte();
    this.anim.play('riposte', 0.75);
    g.sfx.riposte();
    g.time.slowMo(0.35, 0.45, 5);
    // Cinematic side shot
    const mid = this.riposteTo.clone().lerp(enemy.position, 0.5);
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const sgn = Math.random() < 0.5 ? 1 : -1;
    const camFrom = mid.clone().addScaledVector(side, 4.2 * sgn).add(new THREE.Vector3(0, 1.6, 0)).addScaledVector(dir, -1.5);
    const camTo = mid.clone().addScaledVector(side, 3.2 * sgn).add(new THREE.Vector3(0, 1.0, 0)).addScaledVector(dir, 1.2);
    const look = mid.clone().setY(mid.y + 1.2);
    g.cameraRig.cinematic(0.9, (k, out) => out.copy(camFrom).lerp(camTo, 1 - Math.pow(1 - k, 3)), (k, out) => out.copy(look), 50);
    g.hud.popText('RIPOSTE', 'riposte');
  }

  _updateRiposte(dt) {
    const g = this.game;
    const t = this.stateTime;
    const e = this.riposteTarget;
    // Zip in
    const k = clamp(t / 0.14, 0, 1);
    const ek = 1 - Math.pow(1 - k, 3);
    this.position.lerpVectors(this.riposteFrom, this.riposteTo, ek);
    this.velocity.set(0, 0, 0);
    if (k < 1) {
      const c = this.center;
      g.fx.particles.trail(c, 0xffd34a, { size: 0.3, life: 0.25 });
    }
    if (!this.riposteDone && t >= 0.4) {
      this.riposteDone = true;
      const f = this.forward;
      const pos = this.position.clone().addScaledVector(f, 1.2).setY(this.position.y + 1.2);
      if (e && e.alive) e.receiveRiposte();
      this.stats.ripostes++;
      this.addResonance(15);
      this.hp = Math.min(this.maxHp, this.hp + 8);
      g.time.hitStop(0.16);
      g.cameraRig.addTrauma(0.6);
      g.post.flash(0xffffff, 0.6);
      g.post.kickAberration(1);
      g.post.kickZoom(1);
      g.fx.effects.slash(pos, this.yaw, { color: 0xffd34a, radius: 3.6, roll: 0.3, shape: 'full', duration: 0.3 });
      g.fx.effects.slash(pos, this.yaw, { color: 0xffffff, radius: 2.6, roll: -0.4, mirror: true, shape: 'wide', duration: 0.25 });
      g.fx.effects.shockwave(this.position, { color: 0xffd34a, radius: 7, duration: 0.6 });
      g.fx.effects.flash(pos, 0xffd34a, 120, 0.4);
      g.fx.particles.sparks(pos, f, { count: 70, color: 0xffd34a, speed: 22, spread: 0.6, life: 0.6, size: 0.07 });
      g.arena.addRipple(this.position, 2, 0xffd34a);
      g.fx.effects.scorch(this.position.clone().addScaledVector(f, 1.2), { radius: 2.4, color: 0xffd34a, life: 8 });
      g.style.add(300, 'riposte');
    }
    if (t > 0.5) this.trail.emitting = false;
    if (t >= 0.75) {
      this.riposteTarget = null;
      this.iframes = Math.max(this.iframes, 0.25);
      this._setLocoState();
    }
  }

  // ------------------------------------------------------------- overdrive

  _startOverdrive() {
    const g = this.game;
    this.overdriveActive = true;
    this.overdrive = OVERDRIVE_TIME;
    this.state = 'overdriveStart';
    this.stateTime = 0;
    this.odStartReal = g.time.real;
    this.anim.play('overdrive', 0.3);
    g.time.slowMo(0.2, 0.4, 4);
    g.time.targetEnemyScale = 0.55;
    g.sfx.overdrive();
    g.music.setIntensity(4);
    g.post.flash(0xffd34a, 0.3);
    g.post.kickAberration(1);
    g.cameraRig.addTrauma(0.4);
    g.fx.effects.shockwave(this.position, { color: 0xffd34a, radius: 14, duration: 0.9, thickness: 0.08 });
    g.fx.effects.sphere(this.center, { color: 0xffd34a, radius: 3.5, duration: 0.5, opacity: 0.35 });
    g.fx.particles.burst(this.center, { count: 70, color: 0xffd34a, speed: 16, life: 0.8, size: 0.08, stretch: 0.1 });
    g.arena.addRipple(this.position, 3, 0xffd34a);
    g.hud.popText('OVERDRIVE', 'overdrive');
    this.trail.setColor(0xffd34a);
    // Shockwave staggers nearby enemies
    for (const e of g.enemies) {
      if (!e.alive) continue;
      if (flatDist(e.position, this.position) < 7) e.receiveHit({ damage: 1, posture: 40, dir: new THREE.Vector3(e.position.x - this.position.x, 0, e.position.z - this.position.z).normalize(), heavy: true, source: 'overdrive' });
    }
  }

  _endOverdrive() {
    const g = this.game;
    this.overdriveActive = false;
    this.overdrive = 0;
    this.resonance = 0;
    g.time.targetEnemyScale = 1;
    g.sfx.overdriveEnd();
    this.trail.setColor(0x5ff4ff);
  }

  // ------------------------------------------------------------------ death

  _die() {
    const g = this.game;
    this.hp = 0;
    this.dead = true;
    this.state = 'dead';
    this.stateTime = 0;
    this.trail.emitting = false;
    if (this.overdriveActive) this._endOverdrive();
    this.anim.play('stagger', 1.2, { hold: true });
    g.time.slowMo(0.2, 1.4, 1.2);
    g.onPlayerDeath();
  }

  _updateDead(dt) {
    this.velocity.x = damp(this.velocity.x, 0, 4, dt);
    this.velocity.z = damp(this.velocity.z, 0, 4, dt);
    this._integrate(dt);
    this.rig.U.uDissolve.value = clamp((this.stateTime - 1.2) / 2.5, 0, 1);
    if (this.stateTime > 1.2 && Math.random() < 0.5) {
      this.game.fx.particles.embers(this.center, { count: 2, color: 0x5ff4ff, radius: 0.5, rise: 2 });
    }
    this._updateVisuals(dt);
  }

  // ---------------------------------------------------------------- visuals

  _updateVisuals(dt) {
    const g = this.game;
    this.mesh.rotation.y = dampAngle(this.mesh.rotation.y, this.yaw, this.state === 'attack' || this.state === 'riposte' ? 40 : 18, dt);
    const hs = Math.hypot(this.velocity.x, this.velocity.z);
    const speed01 = this.state === 'run' || this.state === 'idle' || this.state === 'hurt' ? clamp(hs / RUN_SPEED, 0, 1) : 0;
    this.runPhase += dt * (6 + hs * 0.95);
    // Footsteps
    const s = Math.sign(Math.sin(this.runPhase));
    if (s !== this.lastStepSign && speed01 > 0.4 && this.grounded) {
      g.sfx.step();
      g.fx.particles.burst(this.position, { count: 3, color: 0x6a5cff, speed: 1.2, life: 0.3, size: 0.06, upBias: 0.5 });
    }
    this.lastStepSign = s;
    // Lean into movement
    const f = this.forward;
    const lean = (this.velocity.x * f.x + this.velocity.z * f.z) / RUN_SPEED;
    locomotion(this.anim, {
      speed: speed01, phase: this.runPhase, air: !this.grounded, vy: this.velocity.y,
      time: g.time.elapsed, lean: clamp(lean, -0.5, 1) * 0.3, guard: 'sword',
    });
    this.anim.update(dt);

    // Material glow, flash and Resonance core
    const U = this.rig.U;
    U.uFlash.value = damp(U.uFlash.value, 0, 12, dt);
    const targetGlow = this.overdriveActive ? 2.6 : this.parryWindow > 0 ? 3 : 1;
    U.uGlowBoost.value = damp(U.uGlowBoost.value, targetGlow, 8, dt);
    const coreS = 0.8 + (this.resonance / 100) * 0.9 + (this.resonance >= 100 ? Math.sin(g.time.real * 10) * 0.2 : 0);
    this.rig.core.scale.setScalar(coreS);
    // Invulnerability shimmer
    this.mesh.visible = !(this.state === 'hurt' && this.iframes > 0 && Math.floor(g.time.real * 30) % 2 === 0);

    // Sword trail sampling
    this.mesh.updateMatrixWorld(true);
    this.rig.bladeTip.getWorldPosition(this._tipW);
    this.rig.bladeBase.getWorldPosition(this._baseW);
    this.trail.push(g.time.elapsed, this._baseW, this._tipW);
    this.trail.update(g.time.elapsed);
    if (this.overdriveActive && Math.random() < 0.5) {
      g.fx.particles.trail(this._tipW, 0xffd34a, { size: 0.12, life: 0.3, vy: 1 });
    }
    if (this.parryWindow > 0) {
      g.fx.particles.trail(this._tipW, 0xdfffff, { size: 0.22, life: 0.12 });
    }

    // Scarves react to movement
    const wind = this._v.set(-this.velocity.x * 3 + Math.sin(g.time.real * 2.3) * 2, 2 + Math.sin(g.time.real * 3.1) * 1.5, -this.velocity.z * 3 + Math.cos(g.time.real * 1.7) * 2);
    const bf = this._v2.set(Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y));
    this.scarf.update(dt, wind, bf);
    this.scarf2.update(dt, wind, bf);
  }
}
