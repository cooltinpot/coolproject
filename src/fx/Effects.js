// Pooled world-space effects: slash arcs, shockwaves, spawn beams, ground
// warnings (red danger zones), attack telegraph rings, debris shards and
// short-lived flash lights.
import * as THREE from 'three';
import { rand, TAU, clamp } from '../core/MathUtil.js';
import { ARENA_RADIUS } from '../world/Arena.js';

function arcGeometry(inner, outer, arc, segs = 40) {
  const g = new THREE.BufferGeometry();
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    // u=0 on the character's right (-x), u=1 on the left (+x); centered on +z
    const a = -arc / 2 + u * arc;
    const s = Math.sin(a), c = Math.cos(a);
    pos.push(-s * inner, 0, c * inner, -s * outer, 0, c * outer);
    uv.push(u, 0, u, 1);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const SLASH_FRAG = /* glsl */ `
  uniform float uProg, uOpacity; uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float head = uProg * 1.35;
    float d = head - vUv.x;
    if (d < 0.0) discard;
    float tail = exp(-d * 3.5);
    float radial = smoothstep(0.0, 0.45, vUv.y) * smoothstep(1.0, 0.86, vUv.y);
    float edge = pow(vUv.y, 7.0) * smoothstep(1.0, 0.94, vUv.y) * 2.5;
    float streaks = 0.75 + 0.25 * sin(vUv.y * 60.0 + vUv.x * 8.0);
    float a = tail * (radial * 0.55 * streaks + edge) * uOpacity * (1.0 - smoothstep(0.6, 1.0, uProg));
    vec3 c = mix(uColor, vec3(1.0), clamp(edge * 0.4 + tail * 0.2, 0.0, 1.0));
    gl_FragColor = vec4(c * a * 2.2, a);
  }
`;
const SIMPLE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const RING_FRAG = /* glsl */ `
  uniform float uProg, uOpacity, uThickness; uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float ring = exp(-pow((r - 0.92) / uThickness, 2.0));
    float inner = smoothstep(0.92, 0.0, r) * 0.15 * (1.0 - uProg);
    float a = (ring + inner) * uOpacity * (1.0 - uProg) * (1.0 - uProg);
    gl_FragColor = vec4(uColor * a * 2.5, a);
  }
`;

const FRESNEL_VERT = /* glsl */ `
  varying vec3 vN; varying vec3 vV;
  void main() {
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const FRESNEL_FRAG = /* glsl */ `
  uniform float uProg, uOpacity; uniform vec3 uColor;
  varying vec3 vN; varying vec3 vV;
  void main() {
    float f = 1.0 - abs(dot(vN, vV));
    float a = pow(f, 3.0) * uOpacity * (1.0 - uProg) * (1.0 - uProg);
    gl_FragColor = vec4(uColor * a * 2.0, a);
  }
`;

const WARN_FRAG = /* glsl */ `
  uniform float uProg, uOpacity, uTime, uArc; uniform vec3 uColor; uniform int uType;
  varying vec2 vUv;
  void main() {
    float a = 0.0;
    if (uType == 0) {
      // Circle: fills outward, solid rim
      vec2 p = vUv * 2.0 - 1.0;
      float r = length(p);
      if (r > 1.0) discard;
      float ang = atan(p.x, -p.y);
      if (uArc < 6.2 && abs(ang) > uArc * 0.5) discard;
      float rim = smoothstep(0.93, 0.985, r) * (1.0 - smoothstep(0.985, 1.0, r));
      float fill = step(r, uProg) * 0.35 + smoothstep(uProg - 0.04, uProg, r) * step(r, uProg) * 0.8;
      float stripes = step(0.5, fract((p.x + p.y) * 6.0 - uTime * 2.0)) * 0.1;
      float sideEdge = uArc < 6.2 ? smoothstep(0.03, 0.0, abs(abs(ang) - uArc * 0.5) * r) : 0.0;
      a = rim * 1.2 + fill + stripes * (1.0 - r) + sideEdge;
    } else {
      // Line: fills from the start (v=0) to the end (v=1)
      float edgeX = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
      float border = 1.0 - smoothstep(0.0, 0.08, min(vUv.x, 1.0 - vUv.x));
      float fill = step(vUv.y, uProg) * 0.4;
      float chevron = step(0.6, fract(vUv.y * 10.0 - abs(vUv.x - 0.5) * 2.0 - uTime * 3.0)) * 0.25;
      a = border + fill * edgeX + chevron * edgeX;
    }
    a *= uOpacity;
    gl_FragColor = vec4(uColor * a * 2.0, a);
  }
`;

const TELE_FRAG = /* glsl */ `
  uniform float uProg, uOpacity, uTime; uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    // Outer ring shrinks onto the inner "impact" ring as the attack lands.
    float target = 0.42;
    float cur = mix(1.0, target, uProg);
    float outer = exp(-pow((r - cur) / 0.035, 2.0));
    float inner = exp(-pow((r - target) / 0.02, 2.0)) * 0.6;
    float ang = atan(p.y, p.x);
    float ticks = step(0.8, fract(ang / 6.2831853 * 8.0 + uTime * 0.5)) * exp(-pow((r - cur - 0.06) / 0.02, 2.0));
    float glow = exp(-r * r * 9.0) * pow(uProg, 4.0) * 0.8;
    float a = (outer + inner + ticks + glow) * uOpacity;
    vec3 c = mix(uColor, vec3(1.0), outer * pow(uProg, 3.0));
    gl_FragColor = vec4(c * a * 2.2, a);
  }
`;

function additive(uniforms, vert, frag, side = THREE.DoubleSide) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    side,
    blending: THREE.AdditiveBlending,
  });
}

export class Effects {
  constructor(scene, particles, arena) {
    this.scene = scene;
    this.particles = particles;
    this.arena = arena;
    this.active = [];
    this.pools = {};
    this.time = 0;
    this.arcGeos = {
      wide: arcGeometry(0.4, 1, Math.PI * 1.25),
      full: arcGeometry(0.4, 1, Math.PI * 1.9),
      narrow: arcGeometry(0.4, 1, Math.PI * 0.8),
    };
    this.planeGeo = new THREE.PlaneGeometry(1, 1);
    this.groundGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.sphereGeo = new THREE.SphereGeometry(1, 32, 16);
    this.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true).translate(0, 0.5, 0);

    // Flash lights
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 16, 1.8);
      l.userData.life = 0;
      scene.add(l);
      this.lights.push(l);
    }

    // Debris shards
    this.maxShards = 360;
    const shardGeo = new THREE.TetrahedronGeometry(0.16, 0);
    shardGeo.scale(1, 2.2, 0.6);
    const shardMat = new THREE.MeshStandardMaterial({ color: 0x222233, metalness: 0.7, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 1 });
    shardMat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance *= vColor * 2.5;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '');
    };
    this.shardMesh = new THREE.InstancedMesh(shardGeo, shardMat, this.maxShards);
    this.shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shardMesh.count = 0;
    this.shardMesh.castShadow = true;
    this.shardMesh.frustumCulled = false;
    for (let i = 0; i < this.maxShards; i++) this.shardMesh.setColorAt(i, new THREE.Color(1, 1, 1));
    scene.add(this.shardMesh);
    this.shards = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  _get(kind, factory) {
    const pool = this.pools[kind] || (this.pools[kind] = []);
    let m = pool.find((o) => !o.visible);
    if (!m) {
      m = factory();
      pool.push(m);
      this.scene.add(m);
    }
    m.visible = true;
    return m;
  }

  _track(mesh, duration, update) {
    this.active.push({ mesh, t: 0, duration, update });
  }

  // Sword smear. `yaw` faces the swing direction, `roll` tilts the arc plane.
  slash(pos, yaw, { color = 0x22e8ff, radius = 2.6, roll = 0, pitch = 0, mirror = false, duration = 0.2, shape = 'wide', opacity = 1 } = {}) {
    const m = this._get('slash-' + shape, () => {
      const mat = additive({ uProg: { value: 0 }, uOpacity: { value: 1 }, uColor: { value: new THREE.Color() } }, SIMPLE_VERT, SLASH_FRAG);
      const mesh = new THREE.Mesh(this.arcGeos[shape], mat);
      mesh.renderOrder = 12;
      mesh.frustumCulled = false;
      return mesh;
    });
    m.position.copy(pos);
    m.rotation.set(0, 0, 0);
    m.rotation.order = 'YXZ';
    m.rotation.y = yaw;
    m.rotation.x = pitch;
    m.rotation.z = roll;
    m.scale.set(mirror ? -radius : radius, radius, radius);
    const u = m.material.uniforms;
    u.uColor.value.set(color);
    u.uOpacity.value = opacity;
    u.uProg.value = 0;
    this._track(m, duration, (k) => { u.uProg.value = k; });
  }

  shockwave(pos, { color = 0x22e8ff, radius = 6, duration = 0.5, thickness = 0.06, y = 0.06, vertical = false } = {}) {
    const m = this._get('ring', () => {
      const mat = additive({ uProg: { value: 0 }, uOpacity: { value: 1 }, uThickness: { value: 0.06 }, uColor: { value: new THREE.Color() } }, SIMPLE_VERT, RING_FRAG);
      const mesh = new THREE.Mesh(this.planeGeo, mat);
      mesh.renderOrder = 11;
      mesh.frustumCulled = false;
      return mesh;
    });
    m.position.set(pos.x, (vertical ? pos.y : y), pos.z);
    m.rotation.set(vertical ? 0 : -Math.PI / 2, 0, 0);
    m.userData.vertical = vertical;
    const u = m.material.uniforms;
    u.uColor.value.set(color);
    u.uThickness.value = thickness;
    u.uOpacity.value = 1;
    this._track(m, duration, (k) => {
      const e = 1 - Math.pow(1 - k, 3);
      const s = 0.2 + e * radius * 2;
      m.scale.set(s, s, s);
      u.uProg.value = k;
    });
  }

  sphere(pos, { color = 0xffffff, radius = 3, duration = 0.35, opacity = 1 } = {}) {
    const m = this._get('sphere', () => {
      const mat = additive({ uProg: { value: 0 }, uOpacity: { value: 1 }, uColor: { value: new THREE.Color() } }, FRESNEL_VERT, FRESNEL_FRAG, THREE.FrontSide);
      const mesh = new THREE.Mesh(this.sphereGeo, mat);
      mesh.renderOrder = 11;
      return mesh;
    });
    m.position.copy(pos);
    const u = m.material.uniforms;
    u.uColor.value.set(color);
    u.uOpacity.value = opacity;
    this._track(m, duration, (k) => {
      const e = 1 - Math.pow(1 - k, 4);
      m.scale.setScalar(0.1 + e * radius);
      u.uProg.value = k;
    });
  }

  spawnBeam(pos, color = 0xff2bd6, duration = 1.0) {
    const m = this._get('beam', () => {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uProg: { value: 0 }, uColor: { value: new THREE.Color() } },
        vertexShader: SIMPLE_VERT,
        fragmentShader: `uniform float uProg; uniform vec3 uColor; varying vec2 vUv;
          void main(){
            float a = (1.0 - uProg) * smoothstep(1.0, 0.0, vUv.y) * (0.5 + 0.5 * sin(vUv.y * 40.0 - uProg * 40.0));
            a *= smoothstep(0.0, 0.2, uProg) + 0.2;
            gl_FragColor = vec4(uColor * a * 3.0, a);
          }`,
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(this.beamGeo, mat);
      mesh.renderOrder = 11;
      return mesh;
    });
    m.position.copy(pos);
    m.position.y = 0;
    const u = m.material.uniforms;
    u.uColor.value.set(color);
    this._track(m, duration, (k) => {
      const w = 1.4 * (1 - k) + 0.1;
      m.scale.set(w, 30 * (0.3 + k), w);
      u.uProg.value = k;
    });
    this.shockwave(pos, { color, radius: 3, duration: 0.6 });
  }

  // Persistent ground warning. Returns a handle: set .progress (0..1), call .done().
  warning({ type = 'circle', pos, radius = 4, arc = TAU, yaw = 0, from, to, width = 2, color = 0xff2040 } = {}) {
    const m = this._get('warn', () => {
      const mat = additive({
        uProg: { value: 0 }, uOpacity: { value: 1 }, uTime: { value: 0 }, uArc: { value: TAU },
        uColor: { value: new THREE.Color() }, uType: { value: 0 },
      }, SIMPLE_VERT, WARN_FRAG);
      mat.depthTest = true;
      const mesh = new THREE.Mesh(this.groundGeo, mat);
      mesh.renderOrder = 4;
      mesh.frustumCulled = false;
      return mesh;
    });
    const u = m.material.uniforms;
    u.uColor.value.set(color);
    u.uProg.value = 0;
    u.uOpacity.value = 0;
    u.uArc.value = arc;
    m.rotation.set(0, 0, 0);
    if (type === 'circle') {
      u.uType.value = 0;
      m.position.set(pos.x, 0.04, pos.z);
      m.scale.set(radius * 2, 1, radius * 2);
      m.rotation.y = yaw;
    } else {
      u.uType.value = 1;
      const dx = to.x - from.x, dz = to.z - from.z;
      const len = Math.hypot(dx, dz);
      m.position.set((from.x + to.x) / 2, 0.04, (from.z + to.z) / 2);
      m.rotation.y = Math.atan2(dx, dz);
      // Plane is XZ after rotateX: local -Z maps to uv.y=1; flip so v runs from->to.
      m.scale.set(width, 1, -len);
    }
    const handle = {
      mesh: m,
      alive: true,
      set progress(v) { u.uProg.value = clamp(v, 0, 1); },
      done: () => {
        if (!handle.alive) return;
        handle.alive = false;
        this._track(m, 0.18, (k) => { u.uOpacity.value = (1 - k) * 1.5; });
      },
      update: (t) => {
        u.uTime.value = t;
        if (handle.alive) u.uOpacity.value = Math.min(1, u.uOpacity.value + 0.1);
      },
    };
    this._warnings = this._warnings || [];
    this._warnings.push(handle);
    return handle;
  }

  // Camera-facing ring that closes in on the attack's impact moment.
  telegraph() {
    const mat = additive({ uProg: { value: 0 }, uOpacity: { value: 0 }, uTime: { value: 0 }, uColor: { value: new THREE.Color() } }, SIMPLE_VERT, TELE_FRAG);
    mat.depthTest = false;
    const mesh = new THREE.Mesh(this.planeGeo, mat);
    mesh.renderOrder = 20;
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.scene.add(mesh);
    const u = mat.uniforms;
    return {
      mesh,
      show(pos, progress, color, size = 2.4, opacity = 1) {
        mesh.visible = true;
        mesh.position.copy(pos);
        mesh.scale.setScalar(size);
        u.uProg.value = clamp(progress, 0, 1);
        u.uColor.value.set(color);
        u.uOpacity.value = opacity;
      },
      hide() { mesh.visible = false; },
      dispose: () => { this.scene.remove(mesh); mat.dispose(); },
      _u: u,
    };
  }

  flash(pos, color = 0xffffff, intensity = 40, duration = 0.25) {
    let l = this.lights.find((x) => x.userData.life <= 0) || this.lights.reduce((a, b) => (a.userData.life < b.userData.life ? a : b));
    l.position.copy(pos);
    l.color.set(color);
    l.userData.life = duration;
    l.userData.dur = duration;
    l.userData.peak = intensity;
    l.intensity = intensity;
  }

  shardBurst(pos, { count = 14, color = 0xff2bd6, speed = 9, up = 6, size = 1 } = {}) {
    for (let i = 0; i < count; i++) {
      if (this.shards.length >= this.maxShards) this.shards.shift();
      const a = rand(0, TAU);
      const s = speed * rand(0.3, 1);
      this.shards.push({
        p: new THREE.Vector3(pos.x + rand(-0.3, 0.3), pos.y + rand(-0.3, 0.5), pos.z + rand(-0.3, 0.3)),
        v: new THREE.Vector3(Math.cos(a) * s, up * rand(0.4, 1.3), Math.sin(a) * s),
        r: new THREE.Vector3(rand(0, TAU), rand(0, TAU), rand(0, TAU)),
        w: new THREE.Vector3(rand(-14, 14), rand(-14, 14), rand(-14, 14)),
        life: rand(1.6, 3),
        size: size * rand(0.5, 1.5),
        color: new THREE.Color(color),
      });
    }
  }

  update(dt, rawDt, camera) {
    this.time += rawDt;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      a.t += dt;
      const k = Math.min(1, a.t / a.duration);
      a.update(k);
      if (k >= 1) {
        a.mesh.visible = false;
        this.active.splice(i, 1);
      }
    }
    // Vertical rings face the camera.
    for (const m of this.pools.ring || []) {
      if (m.visible && m.userData.vertical) m.quaternion.copy(camera.quaternion);
    }
    if (this._warnings) {
      for (let i = this._warnings.length - 1; i >= 0; i--) {
        const w = this._warnings[i];
        w.update(this.time);
        if (!w.alive) this._warnings.splice(i, 1);
      }
    }
    for (const l of this.lights) {
      if (l.userData.life > 0) {
        l.userData.life -= dt;
        const k = Math.max(0, l.userData.life / l.userData.dur);
        l.intensity = l.userData.peak * k * k;
      } else l.intensity = 0;
    }

    // Shards with floor bounces; they fall off the edge into the void.
    const R2 = (ARENA_RADIUS + 1) ** 2;
    let n = 0;
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.life -= dt;
      if (s.life <= 0 || s.p.y < -30) { this.shards.splice(i, 1); continue; }
      s.v.y -= 26 * dt;
      s.p.addScaledVector(s.v, dt);
      const onPlatform = s.p.x * s.p.x + s.p.z * s.p.z < R2;
      if (onPlatform && s.p.y < 0.08 && s.v.y < 0) {
        s.p.y = 0.08;
        s.v.y *= -0.35;
        s.v.x *= 0.6; s.v.z *= 0.6;
        s.w.multiplyScalar(0.6);
      }
      s.r.x += s.w.x * dt; s.r.y += s.w.y * dt; s.r.z += s.w.z * dt;
    }
    for (const s of this.shards) {
      const fade = Math.min(1, s.life * 2);
      this._q.setFromEuler(this._e.set(s.r.x, s.r.y, s.r.z));
      this._m.compose(s.p, this._q, this._s.setScalar(s.size * fade));
      this.shardMesh.setMatrixAt(n, this._m);
      this._c.copy(s.color).multiplyScalar(0.3 + fade * 0.7 * Math.min(1, s.life));
      this.shardMesh.setColorAt(n, this._c);
      n++;
    }
    this.shardMesh.count = n;
    this.shardMesh.instanceMatrix.needsUpdate = true;
    if (this.shardMesh.instanceColor) this.shardMesh.instanceColor.needsUpdate = true;
  }

  clear() {
    for (const a of this.active) a.mesh.visible = false;
    this.active.length = 0;
    this.shards.length = 0;
    if (this._warnings) for (const w of this._warnings) { w.alive = false; w.mesh.visible = false; }
    this._warnings = [];
  }
}
