// Wisp drone: hovering gunner whose energy orbs are timed to land on the beat.
// Parry an orb and it flies straight back — one reflected orb kills a drone.
import * as THREE from 'three';
import { Enemy } from './Enemy.js';
import { actorUniforms, fxMaterial } from '../Rig.js';
import { clamp, damp, rand, chance, TAU } from '../../core/MathUtil.js';
import { roundedBox, mergeHierarchy } from '../../core/Geometry.js';

export class Drone extends Enemy {
  constructor(game, level = 1) {
    super(game, {
      type: 'drone', hp: 3, posture: 999, radius: 0.7, height: 1.2, hitHeight: 0, hitTolerance: 2.5, lockHeight: 0, score: 150, color: 0x3df2ff,
    });
    this.level = level;
    this.solid = false;
    this.hover = rand(3.0, 4.6);
    this.prefDist = rand(10, 15);
    this.attackCooldown = rand(1.2, 3);
    this.charge = 0;
    this.spin = 0;
    this.fallVel = 0;
    this._build();
  }

  _build() {
    const U = (this.U = actorUniforms());
    U.uEdgeColor.value.set(0x3df2ff);
    const shellMat = fxMaterial({ color: 0x1b2333, metalness: 0.85, roughness: 0.25 }, U);
    const trimMat = fxMaterial({ color: 0x9fb4d8, metalness: 1, roughness: 0.2 }, U);
    const glowMat = fxMaterial({ color: 0, emissive: 0x3df2ff, emissiveIntensity: 3 }, U, { glow: true });
    const eyeMat = fxMaterial({ color: 0, emissive: 0xffffff, emissiveIntensity: 5 }, U, { glow: true });
    this.glowMat = glowMat;
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    this.body = body;
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 2), glowMat);
    body.add(this.core);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.44, 24, 12, 0, TAU, 0, Math.PI * 0.42), shellMat);
    const bot = new THREE.Mesh(new THREE.SphereGeometry(0.44, 24, 12, 0, TAU, Math.PI * 0.58, Math.PI * 0.42), shellMat);
    top.castShadow = bot.castShadow = true;
    body.add(top, bot);
    this.shellTop = top;
    this.shellBot = bot;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.03, 6, 32), trimMat);
    band.rotation.x = Math.PI / 2;
    body.add(band);
    // Eye
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), eyeMat);
    eye.position.set(0, 0, 0.42);
    body.add(eye);
    const eyeRing = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.015, 6, 20), trimMat);
    eyeRing.position.set(0, 0, 0.41);
    body.add(eyeRing);
    // Orbiting ring
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.02, 4, 48), glowMat);
    body.add(this.ring);
    // Fins
    this.fins = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(roundedBox(0.06, 0.5, 0.26, 0.02), shellMat);
      const a = (i / 3) * TAU;
      fin.position.set(Math.cos(a) * 0.55, -0.1, Math.sin(a) * 0.55);
      fin.rotation.y = -a;
      fin.rotation.z = 0.4;
      fin.castShadow = true;
      this.fins.add(fin);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 0.02), glowMat);
      tip.position.copy(fin.position).multiplyScalar(1.12);
      tip.position.y = -0.12;
      tip.rotation.copy(fin.rotation);
      this.fins.add(tip);
    }
    body.add(this.fins);
    // Thruster
    const thr = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 12, 1, true), glowMat);
    thr.rotation.x = Math.PI;
    thr.position.y = -0.55;
    body.add(thr);
    for (const m of [this.core, top, bot, this.ring]) m.userData.keep = true;
    mergeHierarchy(root);
    this.mesh = root;
  }

  think(dt) {
    const p = this.player;
    const d = this.distToPlayer();
    // Hover with bobbing
    const targetY = this.hover + Math.sin(this.time * 1.7 + this.id) * 0.35;
    this.position.y = damp(this.position.y, targetY, 3, dt);
    if (!this.attack) {
      if (d < this.prefDist - 2) {
        const away = this._v2.set(this.position.x * 2 - p.position.x, 0, this.position.z * 2 - p.position.z);
        this.steer(away, 5, dt, 3);
      } else if (d > this.prefDist + 3) {
        this.steer(p.position, 6, dt, 3);
      } else {
        if (chance(dt * 0.25)) this.strafeDir = -(this.strafeDir || 1);
        this.orbit(d, 3, this.strafeDir || 1, dt);
      }
    } else {
      this.steer(this.position, 0, dt, 4);
    }
    this.faceTo(p.position, dt, 6);
    this.attackCooldown -= dt;
    if (!this.attack && this.attackCooldown <= 0 && p.alive && this.game.director.requestToken(this, 'ranged')) {
      this.token = 'ranged';
      this._startShot();
    }
  }

  _startShot() {
    const spb = this.game.music.spb;
    const lvl = this.level;
    let shots = 1;
    if (lvl >= 2 && chance(0.4)) shots = 2;
    if (lvl >= 3 && chance(0.35)) shots = 3;
    const heavy = lvl >= 4 && chance(0.25);
    if (heavy) shots = 1;
    const d = this.distToPlayer();
    const flight = clamp(d / 15, 0.55, 1.05);
    const att = this.beginAttack({
      kind: 'shoot', windup: spb * 1.6 + flight, shots, fired: 0, flight,
      parryable: !heavy, unblockable: heavy, subdiv: 1,
    });
    att.arrivals = [];
    const gap = shots === 3 ? 0.5 : 1;
    for (let i = 0; i < shots; i++) att.arrivals.push(att.impactIn + i * spb * gap);
    att.elapsed = 0;
  }

  updateAttack(dt, att) {
    const g = this.game;
    att.elapsed += g.time.beatDt;
    this.charge = clamp(att.elapsed / Math.max(0.2, att.total - att.flight), 0, 1);
    const muzzle = this._v2.set(this.position.x + Math.sin(this.yaw) * 0.5, this.position.y, this.position.z + Math.cos(this.yaw) * 0.5);
    if (att.fired === 0) {
      this.showTelegraph(att, this.position, 2.0);
      // Energy gathers into the core.
      if (Math.random() < 0.6) {
        const a = rand(0, TAU), r = rand(0.8, 1.4);
        const c = att.unblockable ? 0xff2a4a : 0x3df2ff;
        g.fx.particles.emit({
          x: this.position.x + Math.cos(a) * r, y: this.position.y + rand(-0.6, 0.6), z: this.position.z + Math.sin(a) * r,
          vx: -Math.cos(a) * r * 3, vy: 0, vz: -Math.sin(a) * r * 3,
          color: g.fx.particles._c.set(c), life: 0.3, size: 0.08, sizeEnd: 0.02, stretch: 0.08, drag: 0, soft: 0.2,
        });
      }
    } else this.telegraph.hide();
    for (let i = att.fired; i < att.shots; i++) {
      const arriveIn = att.arrivals[i] - att.elapsed;
      if (arriveIn <= att.flight) {
        att.fired++;
        g.projectiles.spawn({
          pos: muzzle.clone(), arrival: Math.max(0.25, arriveIn), kind: 'orb', damage: att.unblockable ? 18 : 10,
          parryable: !att.unblockable, unblockable: att.unblockable, owner: this, radius: att.unblockable ? 0.5 : 0.35,
        });
        g.sfx.shoot({ pan: g.panFor(this.position) });
        g.fx.particles.burst(muzzle, { count: 12, color: att.unblockable ? 0xff2a4a : 0x3df2ff, speed: 5, life: 0.25, size: 0.1 });
        this.knock.addScaledVector(this._v.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), 2);
      } else break;
    }
    if (att.fired >= att.shots) {
      att.resolved = true;
      this.endAttack();
      this.attackCooldown = rand(2.4, 4.2) / (1 + this.level * 0.12);
    }
  }

  threat() {
    const a = this.attack;
    if (!a || a.resolved || a.fired > 0) return null;
    return super.threat();
  }

  onFlinch() {
    this.spin += 6;
  }

  updateDying(dt) {
    this.fallVel += 20 * dt;
    this.position.y = Math.max(0.3, this.position.y - this.fallVel * dt);
    this.spin += dt * 20;
  }

  updateVisuals(dt) {
    super.updateVisuals(dt);
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.yaw;
    this.spin = damp(this.spin, 0, 2, dt);
    this.body.rotation.z = Math.sin(this.time * 2 + this.id) * 0.12 + this.spin * 0.1;
    this.body.rotation.x = -this.velocity.z * 0.02;
    const open = this.attack ? this.charge : 0;
    this.shellTop.position.y = damp(this.shellTop.position.y, open * 0.12, 10, dt);
    this.shellBot.position.y = damp(this.shellBot.position.y, -open * 0.12, 10, dt);
    this.ring.rotation.x = this.time * 2.3;
    this.ring.rotation.y = this.time * 1.7;
    this.fins.rotation.y = this.time * (1 + open * 6);
    this.core.scale.setScalar(1 + open * 0.5 + Math.sin(this.time * 12) * 0.05);
    const heavy = this.attack && this.attack.unblockable;
    this.glowMat.emissive.set(heavy ? 0xff2a4a : 0x3df2ff);
    if (this.state !== 'dying' && this.state !== 'spawn' && Math.random() < 0.5) {
      this.game.fx.particles.trail({ x: this.position.x, y: this.position.y - 0.7, z: this.position.z }, 0x3df2ff, { size: 0.12, life: 0.25, vy: -2 });
    }
  }
}
