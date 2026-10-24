// THE CONDUCTOR — final boss. A towering floating maestro who attacks in
// time with the boss theme: blade sonatas (parry each blade back on the beat),
// radial crescendo rings, a sweeping red laser to jump over, swooping baton
// combos, quake finales and summoned minions across three phases.
import * as THREE from 'three';
import { Enemy } from './Enemy.js';
import { actorUniforms, fxMaterial } from '../Rig.js';
import { ClothRibbon } from '../../fx/Trail.js';
import { clamp, damp, dampAngle, flatDist, rand, pick, chance, yawTo, angleDelta, TAU, lerp } from '../../core/MathUtil.js';
import { roundedBox, plate, mergeHierarchy } from '../../core/Geometry.js';

export class Conductor extends Enemy {
  constructor(game) {
    super(game, {
      type: 'boss', hp: 380, posture: 320, radius: 1.6, height: 5, hitHeight: 2.2, hitTolerance: 2.6, lockHeight: 2.5, score: 10000, color: 0xff5ad1,
    });
    this.isBoss = true;
    this.name = 'THE CONDUCTOR';
    this.solid = true;
    this.phase = 1;
    this.reflectDamage = 8;
    this.staggerDuration = 4;
    this.attackCooldown = 2.5;
    this.floatY = 2.2;
    this.bladesHome = 8;
    this.bladesOut = 0;
    this.lastPattern = '';
    this.summoned = { 2: false, 3: false };
    this.intro = true;
    this.orbitAngle = 0;
    this.lasers = [];
    this._build();
  }

  _build() {
    const U = (this.U = actorUniforms());
    U.uEdgeColor.value.set(0xff5ad1);
    const dark = fxMaterial({ color: 0x15101e, metalness: 0.8, roughness: 0.35 }, U);
    const gold = fxMaterial({ color: 0xe0b45a, metalness: 1, roughness: 0.18 }, U);
    const ivory = fxMaterial({ color: 0xe6e0f0, metalness: 0.4, roughness: 0.3 }, U);
    const glow = fxMaterial({ color: 0, emissive: 0xff5ad1, emissiveIntensity: 2.2 }, U, { glow: true });
    const glow2 = fxMaterial({ color: 0, emissive: 0x3df2ff, emissiveIntensity: 2 }, U, { glow: true });
    this.glowMat = glow;
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    this.body = body;
    const add = (parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    // Robe / lower body: lathed spiral of plates
    const profile = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      profile.push(new THREE.Vector2(0.15 + Math.sin(t * Math.PI * 0.9) * 0.95 * (1 - t * 0.4), -2.2 + t * 2.6));
    }
    add(body, new THREE.LatheGeometry(profile, 32), dark, 0, 0, 0);
    for (let i = 0; i < 4; i++) {
      add(body, new THREE.TorusGeometry(0.75 - i * 0.12, 0.03, 6, 48), gold, 0, -1.5 + i * 0.45, 0, Math.PI / 2);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const pl = add(body, plate([[-0.12, 0.6], [0.12, 0.6], [0.06, -0.7], [-0.06, -0.7]], 0.03), ivory, Math.cos(a) * 0.85, -1.1, Math.sin(a) * 0.85, 0, -a + Math.PI / 2, 0);
      pl.rotation.x = 0.25;
    }
    this.coreGlow = add(body, new THREE.IcosahedronGeometry(0.28, 2), glow, 0, -2.25, 0);
    // Torso
    add(body, roundedBox(1.15, 1.1, 0.7, 0.2, 3), dark, 0, 0.9, 0);
    add(body, roundedBox(0.9, 0.7, 0.2, 0.08), ivory, 0, 1.0, 0.33);
    add(body, roundedBox(0.08, 0.6, 0.05, 0.02), glow, 0, 1.0, 0.45);
    for (const sx of [-1, 1]) {
      add(body, roundedBox(0.04, 0.45, 0.04, 0.015), glow, 0.25 * sx, 1.0, 0.44, 0, 0, 0.3 * sx);
      // Pauldrons
      const p = add(body, new THREE.SphereGeometry(0.42, 20, 12, 0, TAU, 0, Math.PI / 2), gold, 0.75 * sx, 1.35, 0, 0, 0, -0.4 * sx);
      p.scale.set(1.1, 0.7, 1.1);
      add(body, new THREE.ConeGeometry(0.08, 0.5, 6), gold, 0.95 * sx, 1.6, 0, 0, 0, -0.9 * sx);
    }
    // Head with crown
    const head = new THREE.Group();
    head.position.set(0, 1.85, 0);
    body.add(head);
    this.head = head;
    add(head, new THREE.SphereGeometry(0.32, 24, 16), ivory, 0, 0, 0).scale.set(0.9, 1.15, 0.95);
    add(head, roundedBox(0.36, 0.05, 0.05, 0.02), glow, 0, 0.02, 0.28);
    add(head, roundedBox(0.04, 0.16, 0.04, 0.015), glow, 0, -0.12, 0.29);
    const crown = new THREE.Group();
    crown.position.y = 0.32;
    head.add(crown);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      const h = i % 2 ? 0.3 : 0.5;
      add(crown, new THREE.ConeGeometry(0.05, h, 4), gold, Math.cos(a) * 0.3, h / 2, Math.sin(a) * 0.3, 0, 0, 0);
    }
    add(crown, new THREE.TorusGeometry(0.3, 0.03, 6, 32), gold, 0, 0, 0, Math.PI / 2);
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.025, 6, 64), glow2);
    this.halo.position.set(0, 0.2, -0.35);
    head.add(this.halo);
    // Arms holding a baton
    this.arms = [];
    for (const sx of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(0.85 * sx, 1.25, 0);
      body.add(sh);
      const upper = new THREE.Group();
      sh.add(upper);
      add(upper, new THREE.CapsuleGeometry(0.12, 0.7, 4, 10), dark, 0, -0.45, 0);
      add(upper, new THREE.TorusGeometry(0.14, 0.02, 4, 16), gold, 0, -0.6, 0, Math.PI / 2);
      const fore = new THREE.Group();
      fore.position.y = -0.9;
      upper.add(fore);
      add(fore, new THREE.CylinderGeometry(0.13, 0.09, 0.8, 12), gold, 0, -0.4, 0);
      add(fore, roundedBox(0.16, 0.18, 0.16, 0.05), dark, 0, -0.85, 0);
      this.arms.push({ sh, upper, fore, sx });
    }
    const baton = new THREE.Group();
    baton.position.set(0, -0.9, 0);
    this.arms[0].fore.add(baton);
    add(baton, new THREE.CylinderGeometry(0.025, 0.012, 1.6, 8), glow, 0, 0, 0.75, Math.PI / 2);
    add(baton, new THREE.SphereGeometry(0.06, 10, 8), gold, 0, 0, -0.05);
    this.baton = baton;
    this.batonTip = new THREE.Object3D();
    this.batonTip.position.set(0, 0, 1.55);
    baton.add(this.batonTip);
    // Gyroscope rings
    this.rings = [];
    const ringMatA = fxMaterial({ color: 0, emissive: 0xff5ad1, emissiveIntensity: 1.1 }, U, { glow: true });
    const ringMatB = fxMaterial({ color: 0, emissive: 0x3df2ff, emissiveIntensity: 1.0 }, U, { glow: true });
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.6 + i * 0.35, 0.022, 4, 96), i === 1 ? ringMatB : ringMatA);
      r.position.y = 0.6;
      body.add(r);
      this.rings.push(r);
    }
    // Halo of blades behind
    this.bladeGroup = new THREE.Group();
    this.bladeGroup.position.set(0, 1.4, -0.9);
    body.add(this.bladeGroup);
    this.blades = [];
    const bladeGeo = new THREE.ConeGeometry(0.12, 1.4, 4);
    bladeGeo.scale(1, 1, 0.3);
    const bladeMat = fxMaterial({ color: 0xffffff, emissive: 0xff5ad1, emissiveIntensity: 2.2, metalness: 1, roughness: 0.1 }, U, { glow: true });
    for (let i = 0; i < 8; i++) {
      const b = new THREE.Mesh(bladeGeo, bladeMat);
      b.castShadow = true;
      this.bladeGroup.add(b);
      this.blades.push(b);
    }
    // Capes
    this.capes = [];
    for (const sx of [-1, -0.35, 0.35, 1]) {
      const c = new ClothRibbon(body, this.game.scene, { segments: 10, length: 3.2, width: 0.42, color: 0x3a0d2a });
      c.anchor.position.set(0.5 * sx, 1.45, -0.4);
      this.capes.push(c);
    }
    // Spotlight that follows the boss
    for (const m of [this.coreGlow, this.halo, ...this.rings, ...this.blades]) m.userData.keep = true;
    mergeHierarchy(root);
    this.light = new THREE.PointLight(0xff5ad1, 40, 14, 1.6);
    this.light.position.y = 1;
    root.add(this.light);
    this.mesh = root;
    this.mesh.scale.setScalar(1);
  }

  place(pos) {
    super.place(pos);
    this.position.y = this.floatY + 4;
  }

  // ------------------------------------------------------------- behaviour

  get hpFrac() {
    return this.hp / this.maxHp;
  }

  think(dt) {
    const g = this.game;
    const p = this.player;
    // Phase changes
    const newPhase = this.hpFrac > 0.66 ? 1 : this.hpFrac > 0.33 ? 2 : 3;
    if (newPhase > this.phase && !this.attack) {
      this.phase = newPhase;
      this._phaseShift();
      return;
    }
    if (this.attack) return;
    // Drift around the arena, keeping mid distance.
    this.orbitAngle += dt * (0.25 + this.phase * 0.05);
    const want = this._v2.set(Math.cos(this.orbitAngle) * 9, 0, Math.sin(this.orbitAngle) * 9);
    this.steer(want, 4, dt, 2);
    this.position.y = damp(this.position.y, this.floatY + Math.sin(this.time * 1.3) * 0.3, 2, dt);
    this.faceTo(p.position, dt, 3);
    this.attackCooldown -= dt;
    if (this.attackCooldown <= 0 && p.alive) this._choose();
  }

  _choose() {
    const ph = this.phase;
    const options = ['sonata', 'rings', 'baton'];
    if (ph >= 2) options.push('laser', 'sonata');
    if (ph >= 3) options.push('finale', 'laser');
    let pat = pick(options);
    if (pat === this.lastPattern) pat = pick(options);
    if (ph >= 2 && !this.summoned[ph] && this.hpFrac < (ph === 2 ? 0.6 : 0.28)) {
      pat = 'summon';
      this.summoned[ph] = true;
    }
    this.lastPattern = pat;
    this['_' + pat]();
  }

  _sonata() {
    const spb = this.game.music.spb;
    const n = this.phase === 1 ? 4 : this.phase === 2 ? 6 : 8;
    const att = this.beginAttack({ kind: 'sonata', windup: spb * 2 + 0.8, n, launched: 0, noThreat: true });
    att.arrivals = [];
    for (let i = 0; i < n; i++) {
      const half = this.phase === 3 && i % 3 === 2;
      att.arrivals.push(att.impactIn + i * spb * (this.phase === 3 ? 0.75 : 1) + (half ? -spb * 0.25 : 0));
    }
    att.elapsed = 0;
    this.game.hud.popText('BLADE SONATA — PARRY ON THE BEAT', 'boss');
    this.game.sfx.telegraph({ pan: 0 });
  }

  _rings() {
    const spb = this.game.music.spb;
    const waves = this.phase === 1 ? 2 : 3;
    const att = this.beginAttack({ kind: 'rings', windup: spb * 1.5, waves, fired: 0, noThreat: true });
    att.elapsed = 0;
    att.times = [];
    for (let i = 0; i < waves; i++) att.times.push(att.impactIn + i * spb * 2);
  }

  _baton() {
    const spb = this.game.music.spb;
    const strikes = this.phase === 1 ? 2 : 3;
    this.beginAttack({ kind: 'baton', windup: spb * 2.2, range: 3.4, arc: 140, damage: 16, postureDmg: 55, strikes, knockback: 9, swoop: true });
    this.game.sfx.charge({ pan: this.game.panFor(this.position) });
  }

  _laser() {
    const spb = this.game.music.spb;
    const att = this.beginAttack({ kind: 'laser', windup: spb * 2, duration: spb * 8, unblockable: true, sweeps: this.phase >= 3 ? 2 : 1, noThreat: true });
    att.elapsed = 0;
    att.angle = yawTo(this.position, this.player.position) + Math.PI * 0.75;
    att.speed = (TAU / (spb * 8)) * (this.phase >= 3 ? 1.25 : 1);
    att.warn = this.game.fx.effects.warning({ type: 'circle', pos: this.position, radius: 26, color: 0xff2040 });
    this.game.hud.popText('JUMP THE LASER', 'boss');
  }

  _finale() {
    const spb = this.game.music.spb;
    this.beginAttack({ kind: 'finale', windup: spb * 2, slams: 3, done: 0, noThreat: true, elapsed: 0 });
  }

  _summon() {
    const g = this.game;
    this.beginAttack({ kind: 'summon', windup: 1.2, noThreat: true, elapsed: 0 });
    g.hud.popText('THE CONDUCTOR CALLS THE ENSEMBLE', 'boss');
  }

  _phaseShift() {
    const g = this.game;
    g.sfx.bossRoar();
    g.cameraRig.addTrauma(0.7);
    g.post.flash(0xff5ad1, 0.5);
    g.post.kickAberration(1);
    g.fx.effects.shockwave(this.position, { color: 0xff5ad1, radius: 18, duration: 1.0, thickness: 0.1 });
    g.fx.effects.sphere(this.center.clone(), { color: 0xff5ad1, radius: 8, duration: 0.8 });
    g.arena.addRipple(this.position, 3, 0xff5ad1);
    g.hud.popText(`MOVEMENT ${['I', 'II', 'III'][this.phase - 1]}`, 'boss');
    g.music.setIntensity(this.phase >= 3 ? 4 : 3);
    // Knock the player back
    const p = this.player;
    const d = flatDist(p.position, this.position);
    if (d < 8 && p.alive) {
      const dir = this._v.set(p.position.x - this.position.x, 0, p.position.z - this.position.z).normalize();
      p.velocity.x += dir.x * 16;
      p.velocity.z += dir.z * 16;
    }
    this.posture = 0;
    this.attackCooldown = 1.5;
    this.bladesOut = 0;
  }

  updateAttack(dt, att) {
    const g = this.game;
    const p = this.player;
    att.elapsed = (att.elapsed || 0) + g.time.beatDt;
    this.position.y = damp(this.position.y, this.floatY + 0.6, 2, dt);
    if (att.kind !== 'baton') {
      this.faceTo(p.position, dt, 4);
      this.steer(this.position, 0, dt, 3);
    }
    switch (att.kind) {
      case 'sonata': {
        // Launch each blade so it lands on its beat.
        for (let i = att.launched; i < att.n; i++) {
          const arriveIn = att.arrivals[i] - att.elapsed;
          const b = this.blades[i % 8];
          const from = b.getWorldPosition(new THREE.Vector3());
          const flight = clamp(from.distanceTo(p.center) / 20, 0.55, 1.0);
          if (arriveIn <= flight) {
            att.launched++;
            this.bladesOut++;
            const pr = g.projectiles.spawn({ pos: from, arrival: Math.max(0.3, arriveIn), kind: 'blade', damage: 12, owner: this, radius: 0.45 });
            pr.isSonata = true;
            g.sfx.shoot({ pan: g.panFor(from), vol: 1.2 });
            g.fx.particles.burst(from, { count: 14, color: 0xff5ad1, speed: 6, life: 0.3, size: 0.1 });
          } else break;
        }
        // Telegraph the next blade
        const nextI = att.launched;
        if (nextI < att.n) {
          const b = this.blades[nextI % 8];
          const k = 1 - clamp((att.arrivals[nextI] - att.elapsed) / 1.6, 0, 1);
          this.telegraph.show(b.getWorldPosition(this._v2), k, 0xffd34a, 1.4, 0.4 + k * 0.6);
        } else this.telegraph.hide();
        if (att.launched >= att.n && att.elapsed > att.arrivals[att.n - 1] + 0.6) this._finish(1.6);
        break;
      }
      case 'rings': {
        if (att.fired < att.waves) this.showTelegraph(att, this.batonTip.getWorldPosition(this._v2), 2.4);
        for (let i = att.fired; i < att.waves; i++) {
          const arriveIn = att.times[i] - att.elapsed;
          const d = flatDist(this.position, p.position);
          const flight = clamp(d / 11, 0.7, 1.5);
          if (arriveIn <= flight) {
            att.fired++;
            const count = 18 + this.phase * 4;
            const speed = d / Math.max(0.5, arriveIn);
            const gapA = rand(0, TAU);
            const origin = this.position.clone().setY(1.2);
            for (let k = 0; k < count; k++) {
              const a = (k / count) * TAU + i * 0.13;
              if (Math.abs(angleDelta(a, gapA)) < 0.35) continue; // escape gap
              const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
              g.projectiles.spawn({ pos: origin.clone().addScaledVector(dir, 1.5), dir, speed, kind: 'orb', damage: 10, owner: this, radius: 0.35, life: 4 });
            }
            g.sfx.shoot({ pan: 0, vol: 1.5 });
            g.fx.effects.shockwave(origin, { color: 0x3df2ff, radius: 3, duration: 0.4, y: 1.2 });
            this.telegraph.hide();
          } else break;
        }
        if (att.fired >= att.waves && att.elapsed > att.times[att.waves - 1] + 0.5) this._finish(1.4);
        break;
      }
      case 'baton': {
        const d = flatDist(this.position, p.position);
        if (att.impactIn > 0.3) {
          // Swoop down next to the player
          this.faceTo(p.position, dt, 8);
          if (d > 2.6) this.steer(p.position, 14, dt, 5);
          else this.steer(this.position, 0, dt, 8);
          this.position.y = damp(this.position.y, 0.8, 4, dt);
        } else this.steer(this.position, 0, dt, 10);
        const tip = this.batonTip.getWorldPosition(this._v2);
        this.showTelegraph(att, tip, 2.4);
        att.armRaise = clamp(1 - att.impactIn / 0.6, 0, 1);
        if (att.impactIn <= 0) {
          this.telegraph.hide();
          const res = this.resolveMelee(att);
          const f = this._v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
          g.fx.effects.slash(this.position.clone().setY(this.position.y + 1.5).addScaledVector(f, 0.5), this.yaw, { color: 0xff5ad1, radius: 3.6, roll: chance(0.5) ? 0.3 : -0.3, mirror: chance(0.5), duration: 0.22 });
          g.sfx.swing(2, { heavy: true });
          att.strikes--;
          if (this.staggered) return;
          if (att.strikes > 0) {
            att.impactIn = this.scheduleImpact(g.music.spb * 0.8, 1);
            att.total = att.impactIn;
            att.telegraphed = false;
            att.armRaise = 0;
          } else this._finish(res === 'parried' ? 1.6 : 1.1);
        }
        break;
      }
      case 'laser': {
        const tele = att.impactIn > 0;
        if (att.warn) att.warn.mesh.position.set(this.position.x, 0.04, this.position.z);
        if (tele) {
          att.warn.progress = 1 - att.impactIn / att.total;
          this.showTelegraph(att, this.center.clone(), 3);
          break;
        }
        if (!att.beam) {
          att.beam = this._makeBeam();
          g.sfx.laser({ dur: att.duration * att.sweeps / 1 });
          this.telegraph.hide();
          if (att.warn) { att.warn.done(); att.warn = null; }
        }
        att.angle += att.speed * dt;
        att.beamTime = (att.beamTime || 0) + dt;
        const beam = att.beam;
        beam.position.set(this.position.x, 0.55, this.position.z);
        beam.rotation.y = att.angle;
        beam.material.uniforms.uTime.value = this.time;
        // Hit check: beam direction vs player angle
        const pa = Math.atan2(p.position.x - this.position.x, p.position.z - this.position.z);
        const diff = Math.abs(angleDelta(att.angle, pa));
        if (diff < 0.06 && p.alive && p.position.y < 1.0 && flatDist(p.position, this.position) < 27) {
          if (!att.lastHit || att.beamTime - att.lastHit > 0.5) {
            att.lastHit = att.beamTime;
            p.receiveAttack({ damage: 16, unblockable: true, sourcePos: this.position, knockback: 8, launch: 6 });
          }
        }
        // Scorch sparks along the beam
        for (let i = 0; i < 3; i++) {
          const r = rand(2, 26);
          g.fx.particles.emit({
            x: this.position.x + Math.sin(att.angle) * r, y: 0.1, z: this.position.z + Math.cos(att.angle) * r,
            vx: rand(-2, 2), vy: rand(2, 6), vz: rand(-2, 2), color: g.fx.particles._c.set(0xff3050), life: 0.4, size: 0.07, gravity: 12, stretch: 0.05, drag: 1,
          });
        }
        att.threatTime = (() => {
          const dd = angleDelta(att.angle, pa);
          return dd > 0 ? dd / att.speed : (dd + TAU) / att.speed;
        })();
        if (att.beamTime >= att.duration * att.sweeps) this._finish(1.2);
        break;
      }
      case 'finale': {
        const spb = g.music.spb;
        if (att.done < att.slams) {
          this.showTelegraph(att, this.center.clone(), 3.4);
          if (att.impactIn <= 0) {
            att.done++;
            this.telegraph.hide();
            g.spawnQuake(this.position, { speed: 11, maxR: 24, damage: 16, color: 0xff5ad1 });
            g.fx.effects.scorch(this.position, { radius: 3.2, color: 0xff5ad1, life: 9 });
            g.sfx.slam({ pan: 0 });
            g.cameraRig.addTrauma(0.5);
            g.arena.addRipple(this.position, 2, 0xff5ad1);
            g.fx.effects.shockwave(this.position, { color: 0xff5ad1, radius: 6, duration: 0.5 });
            if (att.done < att.slams) {
              att.impactIn = this.scheduleImpact(spb * 1.6, 1);
              att.total = att.impactIn;
              att.telegraphed = false;
            }
          }
        } else if (att.elapsed > 0.1) this._finish(1.8);
        break;
      }
      case 'summon': {
        this.showTelegraph(att, this.center.clone(), 3);
        if (att.impactIn <= 0) {
          this.telegraph.hide();
          g.director.summonForBoss(this.phase);
          g.sfx.bossRoar();
          this._finish(2);
        }
        break;
      }
    }
  }

  _makeBeam() {
    const geo = new THREE.CylinderGeometry(0.22, 0.22, 27, 12, 1, true);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0, 13.5);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        void main(){
          float core = 1.0 - abs(vUv.x - 0.5) * 2.0;
          float flick = 0.8 + 0.2 * sin(uTime * 60.0 + vUv.y * 80.0);
          float a = pow(core, 0.5) * flick;
          vec3 c = mix(vec3(1.0, 0.1, 0.2), vec3(1.0, 0.9, 0.9), pow(core, 6.0));
          gl_FragColor = vec4(c * a * 3.0, a);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 12;
    m.frustumCulled = false;
    this.game.scene.add(m);
    return m;
  }

  endAttack() {
    const a = this.attack;
    if (a && a.beam) {
      this.game.scene.remove(a.beam);
      a.beam.geometry.dispose();
      a.beam.material.dispose();
      a.beam = null;
    }
    if (a && a.warn) {
      a.warn.done();
      a.warn = null;
    }
    super.endAttack();
  }

  _finish(rest) {
    this.endAttack();
    this.attackCooldown = rest * (this.phase === 3 ? 0.7 : 1);
    this.bladesOut = 0;
  }

  threat() {
    const a = this.attack;
    if (!a || !this.alive) return null;
    if (a.kind === 'baton') return { time: a.impactIn / Math.max(0.2, this.game.time.enemyScale), parryable: true, unblockable: false, source: this.position, kind: 'melee' };
    if (a.kind === 'laser' && a.beam && a.threatTime !== undefined) return { time: a.threatTime, parryable: false, unblockable: true, source: this.position, kind: 'laser' };
    return null;
  }

  onParriedReact() {
    this.U.uFlash.value = 1;
  }

  onStagger() {
    const g = this.game;
    if (this.attack) this._finish(1);
    g.hud.popText('THE CONDUCTOR FALTERS — RIPOSTE!', 'boss');
  }

  onRecover() {
    this.attackCooldown = 0.8;
  }

  receiveHit(hit) {
    // The sword does double damage to the boss (it has a lot of HP).
    if (hit.source === 'sword') hit = { ...hit, damage: hit.damage * 2 };
    const r = super.receiveHit(hit);
    return r;
  }

  lockForRiposte() {
    this.state = 'riposted';
    this.stateTime = 0;
    if (this.attack) this._finish(1);
  }

  receiveRiposte() {
    const g = this.game;
    const dmg = 45;
    this.hp -= dmg;
    g.hud.damageNumber(this.center.clone(), dmg, 'crit');
    this.U.uFlash.value = 2;
    this.staggered = false;
    this.posture = 0;
    this.setState('idle');
    this.knock.set(Math.sin(this.yaw) * -10, 0, Math.cos(this.yaw) * -10);
    if (this.hp <= 0) this.die('riposte');
    else this.attackCooldown = 1.5;
  }

  die(cause) {
    if (!this.alive) return;
    const g = this.game;
    super.die(cause);
    g.onBossDefeated(this);
  }

  updateDying(dt) {
    const g = this.game;
    this.body.rotation.z += dt * 0.5;
    if (Math.random() < 0.4) {
      const p = this.center.clone().add(new THREE.Vector3(rand(-1.5, 1.5), rand(-1.5, 2), rand(-1.5, 1.5)));
      g.fx.particles.burst(p, { count: 30, color: chance(0.5) ? 0xff5ad1 : 0xffd34a, speed: 10, life: 0.5, size: 0.12 });
      g.fx.effects.flash(p, 0xff5ad1, 60, 0.2);
      g.sfx.explosion({ vol: 0.5 });
    }
  }

  update(dt) {
    // The boss dies slower and grander.
    if (this.state === 'dying') {
      this.stateTime += dt;
      this.time += dt;
      this.U.uDissolve.value = clamp((this.stateTime - 1.5) / 2, 0, 1);
      this.updateDying(dt);
      this.updateVisuals(dt);
      if (this.stateTime > 3.6) this.remove();
      return;
    }
    if (this.staggered) {
      this.position.y = damp(this.position.y, 0.3, 4, dt);
    }
    super.update(dt);
  }

  updateVisuals(dt) {
    super.updateVisuals(dt);
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = dampAngle(this.mesh.rotation.y, this.yaw, 6, dt);
    const t = this.time;
    this.rings[0].rotation.set(t * 0.7, t * 0.4, 0);
    this.rings[1].rotation.set(-t * 0.5, 0, t * 0.6);
    this.rings[2].rotation.set(Math.PI / 2 + Math.sin(t) * 0.3, t * 0.3, 0);
    this.halo.rotation.z = t;
    this.coreGlow.scale.setScalar(1 + Math.sin(t * 6) * 0.15 + this.game.music.kickEnvelope() * 0.4);
    this.body.rotation.x = this.staggered ? damp(this.body.rotation.x, 0.5, 4, dt) : damp(this.body.rotation.x, 0, 4, dt);
    // Blade halo: blades still at home fan out behind the boss.
    const home = 8 - (this.attack && this.attack.kind === 'sonata' ? this.attack.launched : 0);
    for (let i = 0; i < 8; i++) {
      const b = this.blades[i];
      const visible = i >= 8 - home;
      b.visible = visible || this.state === 'dying';
      const a = (i / 8) * TAU + t * 0.6;
      const r = 1.6 + Math.sin(t * 2 + i) * 0.1;
      b.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
      b.rotation.set(0, 0, a - Math.PI / 2);
    }
    // Conductor arm gestures with the beat
    const beat = this.game.music.beatPhase;
    const wave = Math.sin(beat * TAU);
    const raise = this.attack ? (this.attack.armRaise ?? 0.7) : 0.25;
    for (const arm of this.arms) {
      arm.upper.rotation.x = -0.4 - raise * 1.8 + (arm.sx > 0 ? wave * 0.15 : 0);
      arm.upper.rotation.z = arm.sx * (0.3 + wave * 0.1 * (arm.sx > 0 ? 1 : -1));
      arm.fore.rotation.x = -0.5 - raise * 0.5;
    }
    this.baton.rotation.x = 1.2 + wave * 0.3;
    this.head.rotation.x = this.staggered ? 0.5 : Math.sin(t * 0.8) * 0.08;
    // Capes
    const wind = this._v.set(-this.velocity.x * 2 + Math.sin(t * 1.3) * 3, 1.5, -this.velocity.z * 2 + Math.cos(t * 1.1) * 3);
    const bf = this._v2.set(Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y));
    this.mesh.updateMatrixWorld(true);
    for (const c of this.capes) c.update(dt, wind, bf);
    this.light.intensity = 14 + this.game.music.kickEnvelope() * 20;
  }

  dispose() {
    for (const c of this.capes) c.dispose(this.game.scene);
    if (this.attack && this.attack.beam) {
      this.game.scene.remove(this.attack.beam);
      this.attack.beam.geometry.dispose();
      this.attack.beam.material.dispose();
    }
  }
}
