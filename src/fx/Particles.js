// High-throughput particle system. One instanced draw call renders thousands
// of camera-facing quads that stretch along their screen-space velocity, so
// sparks streak and embers glow. Simulation is structure-of-arrays on the CPU.
import * as THREE from 'three';
import { rand, randomOnSphere, TAU } from '../core/MathUtil.js';

const VERT = /* glsl */ `
  attribute vec3 iPos;
  attribute vec3 iVel;
  attribute vec4 iColor;
  attribute vec3 iSize; // size, stretch, softness
  varying vec4 vColor;
  varying vec2 vUv;
  varying float vSoft;
  void main() {
    vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
    vec3 mvVel = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
    vec2 dir = mvVel.xy / max(0.5, -mv.z) * 6.0;
    float speed = length(dir);
    vec2 axis = speed > 0.0001 ? dir / speed : vec2(1.0, 0.0);
    vec2 perp = vec2(-axis.y, axis.x);
    float stretch = 1.0 + speed * iSize.y;
    vec2 off = axis * position.x * iSize.x * stretch + perp * position.y * iSize.x;
    mv.xy += off;
    gl_Position = projectionMatrix * mv;
    vColor = iColor;
    vUv = position.xy;
    vSoft = iSize.z;
  }
`;

const FRAG = /* glsl */ `
  varying vec4 vColor;
  varying vec2 vUv;
  varying float vSoft;
  void main() {
    float d = length(vUv);
    if (d > 1.0) discard;
    float a = pow(1.0 - d, mix(1.0, 2.5, vSoft));
    vec3 c = vColor.rgb * (1.0 + pow(1.0 - d, 6.0) * 2.0);
    gl_FragColor = vec4(c * a * vColor.a, a * vColor.a);
  }
`;

export class Particles {
  constructor(scene, max = 5000) {
    this.max = max;
    this.count = 0;
    // Simulation state
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.size1 = new Float32Array(max);
    this.stretch = new Float32Array(max);
    this.gravity = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.soft = new Float32Array(max);
    this.bounce = new Uint8Array(max);
    this.alphaCurve = new Uint8Array(max);

    const base = new THREE.InstancedBufferGeometry();
    base.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    base.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    base.setAttribute('iPos', this.aPos);
    base.setAttribute('iVel', this.aVel);
    base.setAttribute('iColor', this.aCol);
    base.setAttribute('iSize', this.aSize);
    base.instanceCount = 0;
    this.geo = base;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(base, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    scene.add(this.mesh);
    this._c = new THREE.Color();
    this.densityScale = 1;
  }

  emit(p) {
    if (this.count >= this.max) return -1;
    const i = this.count++;
    const i3 = i * 3;
    this.pos[i3] = p.x; this.pos[i3 + 1] = p.y; this.pos[i3 + 2] = p.z;
    this.vel[i3] = p.vx || 0; this.vel[i3 + 1] = p.vy || 0; this.vel[i3 + 2] = p.vz || 0;
    const c = p.color;
    this.col[i3] = c.r; this.col[i3 + 1] = c.g; this.col[i3 + 2] = c.b;
    this.life[i] = this.maxLife[i] = p.life || 0.5;
    this.size0[i] = p.size ?? 0.1;
    this.size1[i] = p.sizeEnd ?? 0;
    this.stretch[i] = p.stretch ?? 0.05;
    this.gravity[i] = p.gravity ?? 0;
    this.drag[i] = p.drag ?? 1;
    this.soft[i] = p.soft ?? 0.5;
    this.bounce[i] = p.bounce ? 1 : 0;
    this.alphaCurve[i] = p.curve || 0;
    return i;
  }

  // --- emitter presets -----------------------------------------------------

  // Directional cone of streaking sparks (blade impacts, parries).
  sparks(origin, dir, { count = 20, color = 0xffffff, speed = 14, spread = 0.6, life = 0.45, size = 0.05, gravity = 18, stretch = 0.12 } = {}) {
    const c = this._c.set(color);
    const n = Math.round(count * this.densityScale);
    for (let k = 0; k < n; k++) {
      const v = randomOnSphere(_tmp);
      v.multiplyScalar(spread).add(dir).normalize();
      const s = speed * rand(0.35, 1.1);
      this.emit({
        x: origin.x, y: origin.y, z: origin.z,
        vx: v.x * s, vy: v.y * s, vz: v.z * s,
        color: c, life: life * rand(0.5, 1.2), size: size * rand(0.6, 1.4), sizeEnd: 0,
        stretch, gravity, drag: 2.5, soft: 0.1, bounce: true,
      });
    }
  }

  // Omnidirectional burst.
  burst(origin, { count = 30, color = 0xffffff, speed = 8, life = 0.6, size = 0.12, sizeEnd = 0, gravity = 0, drag = 3, stretch = 0.06, soft = 0.4, upBias = 0 } = {}) {
    const c = this._c.set(color);
    const n = Math.round(count * this.densityScale);
    for (let k = 0; k < n; k++) {
      const v = randomOnSphere(_tmp);
      v.y += upBias;
      const s = speed * rand(0.3, 1);
      this.emit({
        x: origin.x, y: origin.y, z: origin.z,
        vx: v.x * s, vy: v.y * s, vz: v.z * s,
        color: c, life: life * rand(0.6, 1.2), size: size * rand(0.6, 1.3), sizeEnd,
        stretch, gravity, drag, soft,
      });
    }
  }

  // Flat ring of particles expanding along the ground.
  ring(origin, { count = 40, color = 0xffffff, speed = 12, life = 0.5, size = 0.12, y = 0.1 } = {}) {
    const c = this._c.set(color);
    const n = Math.round(count * this.densityScale);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + rand(-0.05, 0.05);
      const s = speed * rand(0.85, 1.1);
      this.emit({
        x: origin.x, y: origin.y + y, z: origin.z,
        vx: Math.cos(a) * s, vy: rand(0, 1.5), vz: Math.sin(a) * s,
        color: c, life: life * rand(0.8, 1.2), size, sizeEnd: 0, stretch: 0.08, drag: 2.2, soft: 0.3,
      });
    }
  }

  // Slow rising embers / motes.
  embers(origin, { count = 10, color = 0xffaa33, radius = 0.5, life = 1.4, size = 0.06, rise = 2 } = {}) {
    const c = this._c.set(color);
    const n = Math.round(count * this.densityScale);
    for (let k = 0; k < n; k++) {
      this.emit({
        x: origin.x + rand(-radius, radius), y: origin.y + rand(-radius, radius) * 0.5, z: origin.z + rand(-radius, radius),
        vx: rand(-0.6, 0.6), vy: rise * rand(0.5, 1.2), vz: rand(-0.6, 0.6),
        color: c, life: life * rand(0.6, 1.3), size: size * rand(0.6, 1.4), sizeEnd: 0, stretch: 0.02, drag: 0.6, soft: 0.6, curve: 1,
      });
    }
  }

  // Single trail puff (projectiles, dashes, blade tips).
  trail(p, color, { size = 0.1, life = 0.25, vx = 0, vy = 0, vz = 0, soft = 0.6 } = {}) {
    this.emit({ x: p.x, y: p.y, z: p.z, vx, vy, vz, color: this._c.set(color), life, size, sizeEnd: 0, stretch: 0, drag: 2, soft });
  }

  clear() {
    this.count = 0;
    this.geo.instanceCount = 0;
  }

  update(dt) {
    let i = 0;
    const P = this.pos, V = this.vel;
    const aP = this.aPos.array, aV = this.aVel.array, aC = this.aCol.array, aS = this.aSize.array;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this._swapRemove(i);
        continue;
      }
      const i3 = i * 3;
      const dr = Math.exp(-this.drag[i] * dt);
      V[i3] *= dr; V[i3 + 1] = V[i3 + 1] * dr - this.gravity[i] * dt; V[i3 + 2] *= dr;
      P[i3] += V[i3] * dt; P[i3 + 1] += V[i3 + 1] * dt; P[i3 + 2] += V[i3 + 2] * dt;
      if (this.bounce[i] && P[i3 + 1] < 0.02 && V[i3 + 1] < 0) {
        P[i3 + 1] = 0.02;
        V[i3 + 1] *= -0.35;
        V[i3] *= 0.6; V[i3 + 2] *= 0.6;
      }
      const t = 1 - this.life[i] / this.maxLife[i];
      let a;
      if (this.alphaCurve[i] === 1) a = Math.sin(t * Math.PI);
      else a = 1 - t * t;
      const size = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      aP[i3] = P[i3]; aP[i3 + 1] = P[i3 + 1]; aP[i3 + 2] = P[i3 + 2];
      aV[i3] = V[i3] * this.stretch[i]; aV[i3 + 1] = V[i3 + 1] * this.stretch[i]; aV[i3 + 2] = V[i3 + 2] * this.stretch[i];
      const i4 = i * 4;
      aC[i4] = this.col[i3]; aC[i4 + 1] = this.col[i3 + 1]; aC[i4 + 2] = this.col[i3 + 2]; aC[i4 + 3] = a;
      aS[i3] = size; aS[i3 + 1] = 1; aS[i3 + 2] = this.soft[i];
      i++;
    }
    this.geo.instanceCount = this.count;
    const upd = (attr, n) => {
      if (n <= 0) return;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, n);
      attr.needsUpdate = true;
    };
    upd(this.aPos, this.count * 3);
    upd(this.aVel, this.count * 3);
    upd(this.aCol, this.count * 4);
    upd(this.aSize, this.count * 3);
  }

  _swapRemove(i) {
    const last = --this.count;
    if (i === last) return;
    const i3 = i * 3, l3 = last * 3;
    for (let k = 0; k < 3; k++) {
      this.pos[i3 + k] = this.pos[l3 + k];
      this.vel[i3 + k] = this.vel[l3 + k];
      this.col[i3 + k] = this.col[l3 + k];
    }
    this.life[i] = this.life[last];
    this.maxLife[i] = this.maxLife[last];
    this.size0[i] = this.size0[last];
    this.size1[i] = this.size1[last];
    this.stretch[i] = this.stretch[last];
    this.gravity[i] = this.gravity[last];
    this.drag[i] = this.drag[last];
    this.soft[i] = this.soft[last];
    this.bounce[i] = this.bounce[last];
    this.alphaCurve[i] = this.alphaCurve[last];
  }
}

const _tmp = new THREE.Vector3();
