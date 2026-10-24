// Enemy and player projectiles. Enemy shots are steered so they arrive on a
// musical beat (then fly straight for the last stretch so dodging is fair).
// A perfect parry sends them back at the shooter at high speed.
import * as THREE from 'three';
import { clamp, rand, TAU } from '../core/MathUtil.js';
import { ARENA_RADIUS } from '../world/Arena.js';

const COLORS = {
  orb: 0x3df2ff,
  orbHeavy: 0xff2a4a,
  blade: 0xff5ad1,
  spear: 0xb07bff,
  reflected: 0xffd34a,
  wave: 0xffd34a,
};

export class Projectiles {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.pools = {};
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this.geos = {
      core: new THREE.IcosahedronGeometry(1, 2),
      halo: new THREE.PlaneGeometry(1, 1),
      blade: (() => {
        const g = new THREE.ConeGeometry(0.12, 1.4, 4);
        g.rotateX(Math.PI / 2);
        g.scale(1, 0.35, 1);
        return g;
      })(),
      spear: (() => {
        const g = new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6);
        g.rotateX(Math.PI / 2);
        const tip = new THREE.ConeGeometry(0.08, 0.4, 4);
        tip.rotateX(Math.PI / 2);
        tip.translate(0, 0, 0.95);
        return mergeGeos([g, tip]);
      })(),
      wave: (() => {
        const g = new THREE.TorusGeometry(1.5, 0.12, 4, 32, Math.PI * 0.9);
        g.rotateZ(Math.PI * 0.05);
        g.rotateX(Math.PI / 2);
        g.scale(1, 1, 0.5);
        return g;
      })(),
    };
    this.haloMat = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uColor; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 2.2); gl_FragColor = vec4(uColor * a * 1.6, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
  }

  _mesh(kind) {
    const pool = this.pools[kind] || (this.pools[kind] = []);
    let m = pool.find((o) => !o.visible);
    if (m) {
      m.visible = true;
      return m;
    }
    const g = new THREE.Group();
    let core;
    if (kind === 'orb' || kind === 'orbHeavy') {
      core = new THREE.Mesh(this.geos.core, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
      core.scale.setScalar(0.22);
      const shell = new THREE.Mesh(this.geos.core, new THREE.MeshBasicMaterial({ color: 0x3df2ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      shell.scale.setScalar(0.38);
      g.add(shell);
      g.userData.shell = shell;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.025, 4, 32), new THREE.MeshBasicMaterial({ color: 0x3df2ff, toneMapped: false, transparent: true, opacity: 0.8 }));
      g.add(ring);
      g.userData.ring = ring;
    } else if (kind === 'blade') {
      core = new THREE.Mesh(this.geos.blade, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff5ad1, emissiveIntensity: 2.5, metalness: 1, roughness: 0.1 }));
      core.scale.setScalar(1.3);
    } else if (kind === 'spear') {
      core = new THREE.Mesh(this.geos.spear, new THREE.MeshStandardMaterial({ color: 0x221a40, emissive: 0xb07bff, emissiveIntensity: 2, metalness: 0.8, roughness: 0.3 }));
    } else if (kind === 'wave') {
      core = new THREE.Mesh(this.geos.wave, new THREE.MeshBasicMaterial({ color: 0xffd34a, toneMapped: false, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    }
    g.add(core);
    g.userData.core = core;
    const halo = new THREE.Mesh(this.geos.halo, this.haloMat.clone());
    halo.material.uniforms = { uColor: { value: new THREE.Color() } };
    halo.scale.setScalar(kind === 'wave' ? 3 : 1.6);
    g.add(halo);
    g.userData.halo = halo;
    g.frustumCulled = false;
    this.game.scene.add(g);
    pool.push(g);
    return g;
  }

  // arrival: seconds until it should reach the player (beat-synced). Steers until 0.25s remain.
  spawn({ pos, target = null, speed = 16, arrival = null, team = 'enemy', damage = 10, parryable = true, unblockable = false, kind = 'orb', owner = null, radius = 0.35, life = 6, gravity = 0, dir = null }) {
    const p = {
      pos: pos.clone(),
      vel: new THREE.Vector3(),
      team, damage, parryable: parryable && !unblockable, unblockable, kind, owner, radius, life,
      arrival, age: 0, gravity, reflected: false, homingTarget: null, dead: false, hitSet: new Set(),
      color: unblockable ? COLORS.orbHeavy : COLORS[kind] || COLORS.orb,
      spin: rand(0, TAU),
    };
    if (unblockable && kind === 'orb') p.kind = 'orbHeavy';
    const tgt = target || this.game.player.center;
    if (dir) p.vel.copy(dir).normalize().multiplyScalar(speed);
    else {
      p.vel.subVectors(tgt, pos);
      const d = p.vel.length() || 1;
      const sp = arrival ? d / Math.max(0.2, arrival) : speed;
      p.vel.multiplyScalar(sp / d);
    }
    p.mesh = this._mesh(p.kind);
    this._style(p);
    p.mesh.position.copy(p.pos);
    this.list.push(p);
    return p;
  }

  spawnWave(pos, dir, dmg = 1) {
    const p = this.spawn({ pos, dir, speed: 26, team: 'player', damage: dmg, kind: 'wave', radius: 1.4, life: 0.9 });
    p.pierce = true;
    return p;
  }

  _style(p) {
    const c = new THREE.Color(p.color);
    const ud = p.mesh.userData;
    ud.halo.material.uniforms.uColor.value.copy(c);
    if (ud.shell) ud.shell.material.color.copy(c);
    if (ud.ring) ud.ring.material.color.copy(c);
    if (p.kind === 'blade' || p.kind === 'spear') ud.core.material.emissive.copy(c);
  }

  reflect(p, onBeat) {
    const g = this.game;
    p.team = 'player';
    p.reflected = true;
    p.arrival = null;
    p.age = 0;
    p.life = 3;
    p.color = onBeat ? 0xffffff : COLORS.reflected;
    p.damage = 99;
    this._style(p);
    if (p.kind === 'orbHeavy') p.kind = 'orb';
    // Return to sender if possible, otherwise to the nearest enemy.
    let target = p.owner && p.owner.alive ? p.owner : null;
    if (!target) {
      let best = Infinity;
      for (const e of g.enemies) {
        if (!e.alive || !e.targetable) continue;
        const d = e.position.distanceToSquared(p.pos);
        if (d < best) { best = d; target = e; }
      }
    }
    p.homingTarget = target;
    const speed = Math.max(28, p.vel.length() * 1.8);
    if (target) {
      p.vel.copy(target.position).add(this._v.set(0, target.hitHeight || 1, 0)).sub(p.pos).normalize().multiplyScalar(speed);
    } else {
      p.vel.multiplyScalar(-1.8);
    }
    g.sfx.reflect({ pan: 0 });
    g.player.stats.reflects++;
  }

  update(dt, enemyDt) {
    const g = this.game;
    const player = g.player;
    const pc = player.center.clone();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (!p || p.dead) continue;
      const step = p.team === 'enemy' ? enemyDt : dt;
      p.age += step;
      p.life -= step;
      if (p.arrival !== null) p.arrival -= step;

      if (p.team === 'enemy' && p.arrival !== null && p.arrival > 0.25 && player.alive) {
        // Beat-locked steering: aim to arrive exactly when the beat lands.
        // Aim so the contact sphere (not the centre) is reached on the beat.
        const want = this._v.subVectors(pc, p.pos);
        const d = want.length() || 1;
        const reach = Math.max(0, this._capsuleDist(p.pos) - (p.radius + 0.5));
        want.multiplyScalar(reach / d / Math.max(0.05, p.arrival));
        p.vel.lerp(want, 1 - Math.exp(-6 * step));
      }
      if (p.homingTarget) {
        const t = p.homingTarget;
        if (t.alive) {
          const want = this._v.copy(t.position).add(this._v2.set(0, t.hitHeight || 1, 0)).sub(p.pos);
          const sp = p.vel.length();
          want.normalize().multiplyScalar(sp);
          p.vel.lerp(want, 1 - Math.exp(-12 * step));
        } else p.homingTarget = null;
      }
      p.vel.y -= p.gravity * step;
      p.pos.addScaledVector(p.vel, step);

      // Visuals
      const m = p.mesh;
      m.position.copy(p.pos);
      p.spin += step * 8;
      if (p.kind === 'orb' || p.kind === 'orbHeavy') {
        const pulse = 1 + Math.sin(p.age * 30) * 0.12;
        m.userData.shell.scale.setScalar(0.38 * pulse);
        m.userData.ring.rotation.set(p.spin, p.spin * 0.7, 0);
      } else {
        m.lookAt(this._v.copy(p.pos).add(p.vel));
        if (p.kind === 'blade') m.userData.core.rotation.z = p.spin * 2;
      }
      m.userData.halo.quaternion.copy(g.camera.quaternion);
      // Trail particles
      if (Math.random() < 0.9) {
        g.fx.particles.trail(p.pos, p.color, { size: p.kind === 'wave' ? 0.35 : 0.16, life: 0.22, vx: (Math.random() - 0.5), vy: (Math.random() - 0.5), vz: (Math.random() - 0.5) });
      }

      // Collisions
      let kill = false;
      if (p.team === 'enemy') {
        if (player.alive) {
          const dist = this._capsuleDist(p.pos);
          if (dist < p.radius + 0.5 && !p.hitSet.has(player)) {
            p.hitSet.add(player);
            const res = player.receiveAttack({
              damage: p.damage, parryable: p.parryable, unblockable: p.unblockable, kind: 'projectile',
              sourcePos: p.owner && p.owner.alive ? p.owner.position : p.pos.clone().sub(p.vel),
              knockback: 4,
            });
            if (res === 'parried') this.reflect(p, player.lastParryOnBeat);
            else if (res === 'blocked' || res === 'hit') {
              kill = true;
              g.fx.particles.burst(p.pos, { count: 18, color: p.color, speed: 7, life: 0.35, size: 0.1 });
            }
          }
        }
      } else {
        for (const e of g.enemies) {
          if (!e.alive || !e.targetable || p.hitSet.has(e)) continue;
          const ey = e.position.y + (e.hitHeight || 1);
          const d = Math.hypot(p.pos.x - e.position.x, (p.pos.y - ey) * 0.7, p.pos.z - e.position.z);
          if (d < p.radius + e.radius + 0.2) {
            p.hitSet.add(e);
            const res = e.receiveHit({
              damage: p.reflected ? (e.reflectDamage ?? 99) : p.damage,
              posture: p.reflected ? 60 : 15,
              dir: p.vel.clone().setY(0).normalize(),
              heavy: p.reflected,
              source: p.reflected ? 'reflect' : 'wave',
            });
            if (p.reflected && res !== 'immune') {
              g.style.add(e.alive ? 80 : 180, 'reflect');
              g.fx.effects.sphere(p.pos, { color: p.color, radius: 2.4, duration: 0.3 });
              g.fx.particles.burst(p.pos, { count: 40, color: p.color, speed: 12, life: 0.5, size: 0.1 });
              g.fx.effects.flash(p.pos, p.color, 60, 0.25);
              g.sfx.explosion({ vol: 0.6 });
              g.cameraRig.addTrauma(0.2);
            }
            if (!p.pierce) { kill = true; break; }
          }
        }
      }
      // Leaving the arena / hitting the floor
      const r = Math.hypot(p.pos.x, p.pos.z);
      if (p.pos.y < 0.05 && p.kind !== 'wave') {
        kill = true;
        g.fx.particles.burst(p.pos, { count: 10, color: p.color, speed: 5, life: 0.3, size: 0.08 });
        g.arena.addRipple(p.pos, 0.4, p.color);
      }
      if (r > ARENA_RADIUS + 6 || p.life <= 0) kill = true;
      if (kill) this._remove(p);
    }
  }

  // Distance from a point to the player's body capsule axis.
  _capsuleDist(pos) {
    const pl = this.game.player.position;
    const cy = clamp(pos.y, pl.y + 0.3, pl.y + 1.7);
    return Math.hypot(pos.x - pl.x, pos.y - cy, pos.z - pl.z);
  }

  _remove(p) {
    if (p.dead) return;
    p.mesh.visible = false;
    p.dead = true;
    const i = this.list.indexOf(p);
    if (i >= 0) this.list.splice(i, 1);
  }

  // Threat list for the HUD timing lane.
  threats(out) {
    const player = this.game.player;
    const pc = player.center;
    const scale = Math.max(0.2, this.game.time.enemyScale);
    for (const p of this.list) {
      if (p.team !== 'enemy') continue;
      // Live estimate from geometry and closing speed (the player may be moving).
      const toP = this._v.subVectors(pc, p.pos);
      const dist = toP.length() || 1;
      const rel = this._v2.copy(p.vel).multiplyScalar(scale).sub(player.velocity);
      const closing = toP.dot(rel) / dist;
      if (closing <= 0.5) continue;
      // Will it actually pass close enough to hit?
      const tc = toP.dot(rel) / rel.lengthSq();
      const miss = this._v2.copy(rel).multiplyScalar(tc).sub(toP).length();
      if (miss > p.radius + 1.2) continue;
      const t = Math.max(0, this._capsuleDist(p.pos) - (p.radius + 0.5)) / closing;
      if (t > 2.2) continue;
      out.push({ time: t, parryable: p.parryable, unblockable: p.unblockable, source: p.pos, kind: 'projectile' });
    }
  }

  clear() {
    for (const p of this.list) {
      p.mesh.visible = false;
      p.dead = true;
    }
    this.list.length = 0;
  }
}

function mergeGeos(geos) {
  const pos = [], nrm = [], idx = [];
  let off = 0;
  for (const g of geos) {
    const gi = g.index ? g : g;
    const p = gi.attributes.position, n = gi.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nrm.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    if (gi.index) for (let i = 0; i < gi.index.count; i++) idx.push(gi.index.getX(i) + off);
    else for (let i = 0; i < p.count; i++) idx.push(i + off);
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setIndex(idx);
  return out;
}
