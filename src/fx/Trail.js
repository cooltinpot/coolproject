// Ribbon trail swept between two points (sword base and tip). Samples are
// time-stamped and Catmull-Rom subdivided so fast swings stay smooth.
import * as THREE from 'three';

const MAX_SAMPLES = 28;
const SUB = 4;

export class SwordTrail {
  constructor(scene, color = 0x22e8ff, life = 0.14) {
    this.life = life;
    this.samples = [];
    this.maxVerts = (MAX_SAMPLES - 1) * SUB + 1;
    const geo = new THREE.BufferGeometry();
    this.posArr = new Float32Array(this.maxVerts * 2 * 3);
    this.alphaArr = new Float32Array(this.maxVerts * 2);
    this.uvArr = new Float32Array(this.maxVerts * 2 * 2);
    geo.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alphaArr, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(this.uvArr, 2).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < this.maxVerts - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    this.geo = geo;
    this.uniforms = { uColor: { value: new THREE.Color(color) }, uIntensity: { value: 1 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute float alpha; varying float vA; varying vec2 vUv;
        void main() { vA = alpha; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uIntensity; varying float vA; varying vec2 vUv;
        void main() {
          float edge = pow(vUv.y, 3.0);
          float a = vA * vA * (0.25 + edge * 1.2) * uIntensity;
          vec3 c = mix(uColor, vec3(1.0), edge * vA * 0.7);
          gl_FragColor = vec4(c * a * 2.0, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    scene.add(this.mesh);
    this.emitting = false;
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
  }

  setColor(c) {
    this.uniforms.uColor.value.set(c);
  }

  push(time, base, tip) {
    if (!this.emitting) return;
    this.samples.push({ t: time, b: base.clone(), p: tip.clone() });
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
  }

  update(time) {
    while (this.samples.length && time - this.samples[0].t > this.life) this.samples.shift();
    const n = this.samples.length;
    if (n < 2) {
      this.geo.setDrawRange(0, 0);
      return;
    }
    let v = 0;
    const cr = (p0, p1, p2, p3, t, out) => {
      const t2 = t * t, t3 = t2 * t;
      out.x = 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      out.y = 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      out.z = 0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);
      return out;
    };
    for (let i = 0; i < n - 1; i++) {
      const s0 = this.samples[Math.max(0, i - 1)];
      const s1 = this.samples[i];
      const s2 = this.samples[i + 1];
      const s3 = this.samples[Math.min(n - 1, i + 2)];
      const steps = i === n - 2 ? SUB + 1 : SUB;
      for (let k = 0; k < steps; k++) {
        const t = k / SUB;
        cr(s0.b, s1.b, s2.b, s3.b, t, this._a);
        cr(s0.p, s1.p, s2.p, s3.p, t, this._b);
        const age = time - (s1.t + (s2.t - s1.t) * t);
        const alpha = Math.max(0, 1 - age / this.life);
        const o = v * 6;
        this.posArr[o] = this._a.x; this.posArr[o + 1] = this._a.y; this.posArr[o + 2] = this._a.z;
        this.posArr[o + 3] = this._b.x; this.posArr[o + 4] = this._b.y; this.posArr[o + 5] = this._b.z;
        this.alphaArr[v * 2] = alpha;
        this.alphaArr[v * 2 + 1] = alpha;
        const u = v;
        this.uvArr[v * 4] = u; this.uvArr[v * 4 + 1] = 0;
        this.uvArr[v * 4 + 2] = u; this.uvArr[v * 4 + 3] = 1;
        v++;
        if (v >= this.maxVerts) break;
      }
      if (v >= this.maxVerts) break;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
    this.geo.attributes.uv.needsUpdate = true;
    this.geo.setDrawRange(0, Math.max(0, (v - 1) * 6));
  }

  clear() {
    this.samples.length = 0;
    this.geo.setDrawRange(0, 0);
  }
}

// Verlet-simulated cloth ribbon (scarves, banners, coat tails).
export class ClothRibbon {
  constructor(parent, scene, { segments = 10, length = 1.3, width = 0.16, color = 0xff2bd6, emissive = 0x000000 } = {}) {
    this.n = segments + 1;
    this.segLen = length / segments;
    this.width = width;
    this.points = [];
    this.prev = [];
    for (let i = 0; i < this.n; i++) {
      this.points.push(new THREE.Vector3());
      this.prev.push(new THREE.Vector3());
    }
    this.anchor = new THREE.Object3D();
    parent.add(this.anchor);
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.n * 2 * 3);
    const uv = new Float32Array(this.n * 2 * 2);
    for (let i = 0; i < this.n; i++) {
      uv[i * 4] = 0; uv[i * 4 + 1] = i / (this.n - 1);
      uv[i * 4 + 2] = 1; uv[i * 4 + 3] = i / (this.n - 1);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const idx = [];
    for (let i = 0; i < this.n - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    geo.setIndex(idx);
    this.geo = geo;
    const mat = new THREE.MeshStandardMaterial({
      color, emissive, emissiveIntensity: 1.2, roughness: 0.75, metalness: 0.05, side: THREE.DoubleSide,
    });
    // Glowing hem along the ribbon edges.
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float hem = smoothstep(0.12, 0.0, min(vUv.x, 1.0 - vUv.x)) + smoothstep(0.9, 1.0, vUv.y);
        totalEmissiveRadiance += diffuseColor.rgb * hem * 2.5;`);
    };
    mat.defines = { USE_UV: '' };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    scene.add(this.mesh);
    this.initialized = false;
    this._tmp = new THREE.Vector3();
    this._side = new THREE.Vector3();
    this._a = new THREE.Vector3();
  }

  reset() {
    this.initialized = false;
  }

  update(dt, wind, bodyForward) {
    const a = this.anchor.getWorldPosition(this._a);
    if (!this.initialized) {
      for (let i = 0; i < this.n; i++) {
        this.points[i].set(a.x, a.y - i * this.segLen, a.z);
        this.prev[i].copy(this.points[i]);
      }
      this.initialized = true;
    }
    dt = Math.min(dt, 1 / 30);
    const g = -9.8 * dt * dt;
    this.points[0].copy(a);
    this.prev[0].copy(a);
    for (let i = 1; i < this.n; i++) {
      const p = this.points[i], q = this.prev[i];
      const vx = (p.x - q.x) * 0.96, vy = (p.y - q.y) * 0.96, vz = (p.z - q.z) * 0.96;
      q.copy(p);
      p.x += vx + wind.x * dt * dt;
      p.y += vy + g + wind.y * dt * dt;
      p.z += vz + wind.z * dt * dt;
      if (p.y < 0.03) p.y = 0.03;
    }
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i < this.n; i++) {
        const p0 = this.points[i - 1], p1 = this.points[i];
        const d = this._tmp.subVectors(p1, p0);
        const len = d.length() || 1e-5;
        const diff = (len - this.segLen) / len;
        if (i === 1) p1.addScaledVector(d, -diff);
        else {
          p0.addScaledVector(d, diff * 0.5);
          p1.addScaledVector(d, -diff * 0.5);
        }
      }
      // Keep the cloth behind the body.
      if (bodyForward) {
        for (let i = 1; i < this.n; i++) {
          const p = this.points[i];
          const rel = this._tmp.subVectors(p, a);
          const f = rel.dot(bodyForward);
          if (f > -0.08) p.addScaledVector(bodyForward, -(f + 0.08));
        }
      }
    }
    // Build the strip, widening slightly towards the end.
    for (let i = 0; i < this.n; i++) {
      const p = this.points[i];
      const next = this.points[Math.min(this.n - 1, i + 1)];
      const prev = this.points[Math.max(0, i - 1)];
      const dir = this._tmp.subVectors(next, prev).normalize();
      const side = this._side.crossVectors(dir, bodyForward || UPV).normalize();
      if (side.lengthSq() < 0.1) side.set(1, 0, 0);
      const w = this.width * (0.8 + (i / this.n) * 0.5) * 0.5;
      const o = i * 6;
      this.pos[o] = p.x - side.x * w; this.pos[o + 1] = p.y - side.y * w; this.pos[o + 2] = p.z - side.z * w;
      this.pos[o + 3] = p.x + side.x * w; this.pos[o + 4] = p.y + side.y * w; this.pos[o + 5] = p.z + side.z * w;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.anchor.parent && this.anchor.parent.remove(this.anchor);
    this.geo.dispose();
    this.mesh.material.dispose();
  }
}

const UPV = new THREE.Vector3(0, 1, 0);
