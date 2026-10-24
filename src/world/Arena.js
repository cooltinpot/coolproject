// The arena: a floating hexagonal platform above a cloud-sea megacity.
// The floor shader pulses with the beat and ripples from every impact, the
// equalizer towers dance to the live music spectrum, and a hex-shield barrier
// flares up when the player approaches the edge.
import * as THREE from 'three';
import { createSky, createCloudSea, NOISE_GLSL } from './Sky.js';
import { rock, roundedBox, mergeChildrenByMaterial } from '../core/Geometry.js';
import { seeded, TAU, damp } from '../core/MathUtil.js';

export const ARENA_RADIUS = 30;
const MAX_RIPPLES = 10;

export class Arena {
  constructor(scene, renderer, quality) {
    this.scene = scene;
    this.renderer = renderer;
    this.quality = quality;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.rng = seeded(1337);
    this.time = 0;
    this.rippleIdx = 0;
    this.eqLevels = new Float32Array(64);

    this._buildSky();
    this._buildLights();
    this._buildFloor();
    this._buildRim();
    this._buildUnderside();
    this._buildPillars();
    this._buildEqualizer();
    this._buildBarrier();
    this._buildRocks();
    this._buildSkyline();
    this._buildHalo();
    this._buildMotes();
    this._buildEnvironmentMap();
  }

  // ------------------------------------------------------------------ sky

  _buildSky() {
    this.sky = createSky();
    this.scene.add(this.sky.mesh);
    this.clouds = createCloudSea();
    this.scene.add(this.clouds.mesh);
    this.scene.fog = new THREE.FogExp2(0x1a0a2a, 0.0042);
  }

  _buildLights() {
    const hemi = new THREE.HemisphereLight(0x8c7dff, 0x2a0b2a, 0.75);
    this.scene.add(hemi);
    const moon = new THREE.DirectionalLight(0xc9d8ff, 2.1);
    moon.position.set(-28, 55, 30);
    moon.castShadow = this.quality.shadows;
    moon.shadow.mapSize.set(this.quality.shadowSize, this.quality.shadowSize);
    const sc = moon.shadow.camera;
    sc.left = -36; sc.right = 36; sc.top = 36; sc.bottom = -36;
    sc.near = 10; sc.far = 140;
    moon.shadow.bias = -0.0004;
    moon.shadow.normalBias = 0.03;
    moon.target.position.set(0, 0, 0);
    this.scene.add(moon, moon.target);
    this.moon = moon;

    const rim = new THREE.DirectionalLight(0xff3d9a, 1.1);
    rim.position.set(40, 18, -45);
    this.scene.add(rim);
    const fill = new THREE.DirectionalLight(0x2ee6ff, 0.5);
    fill.position.set(-40, 10, -30);
    this.scene.add(fill);

    // Coloured accent lights that breathe with the kick drum.
    this.accentLights = [];
    const cols = [0x22e8ff, 0xff2bd6, 0x8a5cff, 0xffb02e];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      const l = new THREE.PointLight(cols[i], 12, 40, 1.7);
      l.position.set(Math.cos(a) * 24, 7, Math.sin(a) * 24);
      this.scene.add(l);
      this.accentLights.push(l);
    }
  }

  // ---------------------------------------------------------------- floor

  _buildFloor() {
    const R = ARENA_RADIUS;
    const geo = new THREE.CircleGeometry(R + 1.2, 160);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0b0c16,
      metalness: 0.6,
      roughness: 0.32,
      envMapIntensity: 0.75,
    });
    const ripples = [];
    const rippleCols = [];
    for (let i = 0; i < MAX_RIPPLES; i++) {
      ripples.push(new THREE.Vector4(0, 0, -100, 0));
      rippleCols.push(new THREE.Color(0, 1, 1));
    }
    this.floorUniforms = {
      uTime: { value: 0 },
      uBeat: { value: 0 },
      uKick: { value: 0 },
      uPlayer: { value: new THREE.Vector3() },
      uRipples: { value: ripples },
      uRippleCols: { value: rippleCols },
      uDanger: { value: 0 },
      uOverdrive: { value: 0 },
      uAccent: { value: new THREE.Color(0x22e8ff) },
      uAccent2: { value: new THREE.Color(0xff2bd6) },
    };
    const U = this.floorUniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, U);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWPos;
          uniform float uTime, uBeat, uKick, uDanger, uOverdrive;
          uniform vec3 uPlayer, uAccent, uAccent2;
          uniform vec4 uRipples[${MAX_RIPPLES}];
          uniform vec3 uRippleCols[${MAX_RIPPLES}];
          ${NOISE_GLSL}
          vec4 hexCoords(vec2 p) {
            const vec2 s = vec2(1.0, 1.7320508);
            vec4 hC = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
            vec4 h = vec4(p - hC.xy * s, p - (hC.zw + 0.5) * s);
            return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hC.xy) : vec4(h.zw, hC.zw + 0.5);
          }
          float hexDist(vec2 p) { p = abs(p); return max(dot(p, vec2(0.5, 0.8660254)), p.x); }
          float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float gSeam; float gTileGlow; vec3 gEmis; float gTileRand;
        `)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            vec2 wp = vWPos.xz;
            float r = length(wp);
            vec4 hx = hexCoords(wp / 1.7);
            float edge = 0.5 - hexDist(hx.xy);
            gTileRand = h21(hx.zw);
            gSeam = 1.0 - smoothstep(0.0, 0.022, edge);
            float bevel = smoothstep(0.035, 0.09, edge);
            // Tile surface variation + subtle brushed noise
            float grain = vnoise(vec3(wp * 6.0, 0.0)) * 0.5 + vnoise(vec3(wp.x * 40.0, wp.y * 2.0, 1.0)) * 0.5;
            diffuseColor.rgb *= mix(0.75, 1.25, gTileRand) * (0.85 + grain * 0.3);
            diffuseColor.rgb *= mix(0.35, 1.0, bevel);
            // Large concentric arena markings
            float ringLines = 0.0;
            for (int i = 1; i <= 3; i++) {
              float rr = float(i) * 8.0;
              ringLines += 1.0 - smoothstep(0.03, 0.09, abs(r - rr));
            }
            float ticks = (1.0 - smoothstep(0.02, 0.06, abs(fract(atan(wp.y, wp.x) / 6.2831853 * 48.0) - 0.5) * 0.4)) * (1.0 - smoothstep(0.3, 0.5, abs(r - 3.6)));
            float emblem = (1.0 - smoothstep(0.04, 0.1, abs(r - 3.2))) + (1.0 - smoothstep(0.03, 0.08, abs(r - 4.0))) + ticks * 0.6;
            float edgeRing = 1.0 - smoothstep(0.05, 0.25, abs(r - ${ARENA_RADIUS.toFixed(1)}));

            vec3 accent = mix(uAccent, uAccent2, smoothstep(-1.0, 1.0, sin(r * 0.12 - uTime * 0.4)));
            accent = mix(accent, vec3(1.0, 0.75, 0.25), uOverdrive * 0.7);
            float seamBase = 0.035 + 0.05 * vnoise(vec3(wp * 0.15, uTime * 0.2));
            // Beat ring travelling outward from the centre
            float beatR = uBeat * 38.0;
            float beatRing = exp(-pow((r - beatR) * 0.55, 2.0)) * (1.0 - uBeat);
            // Light pooling under the player
            float pd = length(wp - uPlayer.xz);
            float pool = exp(-pd * pd * 0.12);
            // Random tiles flicker on
            float flick = step(0.985, h21(hx.zw + floor(uTime * 2.0))) * 0.5;
            // Impact ripples
            vec3 ripple = vec3(0.0);
            for (int i = 0; i < ${MAX_RIPPLES}; i++) {
              vec4 rp = uRipples[i];
              float age = uTime - rp.z;
              if (age < 0.0 || age > 2.5) continue;
              float d = length(wp - rp.xy);
              float front = age * 16.0;
              float ring = exp(-pow((d - front) * 0.9, 2.0)) * exp(-age * 1.8) * rp.w;
              float core = exp(-d * d * 0.5) * exp(-age * 6.0) * rp.w;
              ripple += uRippleCols[i] * (ring + core);
            }
            gEmis = accent * gSeam * (seamBase + beatRing * 1.1 + pool * 0.55 + uKick * 0.06);
            gEmis += accent * (1.0 - gSeam) * (flick * 0.12 + beatRing * 0.06);
            gEmis += ripple * (gSeam * 1.8 + 0.3);
            gEmis += mix(uAccent, uAccent2, 0.5) * (ringLines * 0.25 + emblem * 0.4) * (0.7 + uKick * 0.6);
            gEmis += vec3(1.0, 0.25, 0.4) * edgeRing * (0.6 + uDanger * 1.5);
            gEmis += vec3(1.0, 0.1, 0.15) * uDanger * gSeam * 0.6;
          }
        `)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(0.34, 0.62, gTileRand) + gSeam * 0.3;
        `)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += gEmis;
        `);
    };
    const floor = new THREE.Mesh(geo, mat);
    floor.receiveShadow = true;
    this.group.add(floor);
    this.floor = floor;
  }

  addRipple(pos, strength = 1, color = 0x22e8ff) {
    const i = this.rippleIdx++ % MAX_RIPPLES;
    this.floorUniforms.uRipples.value[i].set(pos.x, pos.z, this.time, strength);
    this.floorUniforms.uRippleCols.value[i].set(color);
  }

  // ------------------------------------------------------------------ rim

  _buildRim() {
    const R = ARENA_RADIUS;
    const metal = new THREE.MeshStandardMaterial({ color: 0x1b1e2e, metalness: 0.85, roughness: 0.3 });
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(R + 3.2, R + 2.4, 1.4, 128, 1, true), metal);
    collar.position.y = -0.5;
    this.group.add(collar);
    const top = new THREE.Mesh(new THREE.RingGeometry(R + 1.2, R + 3.2, 128, 1).rotateX(-Math.PI / 2), metal);
    top.position.y = 0.2;
    top.receiveShadow = true;
    this.group.add(top);
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(R + 1.2, R + 1.2, 0.2, 128, 1, true), metal);
    lip.position.y = 0.1;
    this.group.add(lip);
    const glowMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x22e8ff, emissiveIntensity: 2.4 });
    const strip = new THREE.Mesh(new THREE.TorusGeometry(R + 1.25, 0.05, 6, 192), glowMat);
    strip.rotation.x = Math.PI / 2;
    strip.position.y = 0.21;
    this.group.add(strip);
    const strip2 = new THREE.Mesh(new THREE.TorusGeometry(R + 3.15, 0.06, 6, 192), glowMat.clone());
    strip2.material.emissive.set(0xff2bd6);
    strip2.rotation.x = Math.PI / 2;
    strip2.position.y = 0.2;
    this.group.add(strip2);
    this.rimStrips = [strip, strip2];

    // Chaser lights around the collar.
    const N = 120;
    const lightGeo = roundedBox(0.5, 0.12, 0.12, 0.04, 1);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.chasers = new THREE.InstancedMesh(lightGeo, lightMat, N);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI / 2);
      m.compose(new THREE.Vector3(Math.cos(a) * (R + 3.25), -0.35, Math.sin(a) * (R + 3.25)), q, new THREE.Vector3(1, 1, 1));
      this.chasers.setMatrixAt(i, m);
      this.chasers.setColorAt(i, new THREE.Color(0x22e8ff));
    }
    this.group.add(this.chasers);
    this._chaserCol = new THREE.Color();
  }

  _buildUnderside() {
    const R = ARENA_RADIUS;
    const mat = new THREE.MeshStandardMaterial({ color: 0x141624, metalness: 0.8, roughness: 0.45 });
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(R + 2.4, 6, 18, 96, 6, true), mat);
    cone.position.y = -10.2;
    this.group.add(cone);
    const glow = new THREE.MeshStandardMaterial({ color: 0, emissive: 0x8a5cff, emissiveIntensity: 2 });
    for (let i = 0; i < 5; i++) {
      const t = i / 5;
      const r = R + 2.4 - (R - 3.6) * (t + 0.08);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.12, 6, 128), glow);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -1.5 - t * 18 * 0.92;
      this.group.add(ring);
    }
    // Reactor core beneath the arena
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xff2bd6, toneMapped: false });
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(4, 2), coreMat);
    this.core.position.y = -21;
    this.group.add(this.core);
    const coreLight = new THREE.PointLight(0xff2bd6, 200, 60, 1.5);
    coreLight.position.y = -24;
    this.group.add(coreLight);
    // Downward energy beam into the clouds
    const beamMat = makeBeamMaterial(0xff2bd6, 0.6);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 5, 60, 32, 1, true), beamMat);
    beam.position.y = -50;
    this.group.add(beam);
    this.coreBeam = beam;
  }

  // -------------------------------------------------------------- pillars

  _buildPillars() {
    const R = ARENA_RADIUS;
    this.pillars = [];
    const body = new THREE.MeshStandardMaterial({ color: 0x1a1c2c, metalness: 0.8, roughness: 0.35 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x9aa3c7, metalness: 1, roughness: 0.2 });
    const glowA = new THREE.MeshStandardMaterial({ color: 0, emissive: 0x22e8ff, emissiveIntensity: 3 });
    const glowB = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff2bd6, emissiveIntensity: 3 });
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x99f6ff, emissive: 0x22c8ff, emissiveIntensity: 1.6, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.9,
    });
    const N = 8;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU + TAU / 16;
      const g = new THREE.Group();
      g.position.set(Math.cos(a) * (R + 7), 0, Math.sin(a) * (R + 7));
      g.rotation.y = -a;
      const glow = i % 2 ? glowB : glowA;
      // Floating base platform
      const base = new THREE.Mesh(new THREE.CylinderGeometry(3, 1.2, 3, 6), body);
      base.position.y = -1.6;
      g.add(base);
      const baseRing = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.07, 6, 6), glow);
      baseRing.rotation.x = Math.PI / 2;
      baseRing.position.y = -0.12;
      g.add(baseRing);
      // Tapered hexagonal column
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 16, 6), body);
      col.position.y = 8;
      col.castShadow = true;
      g.add(col);
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * TAU + TAU / 12;
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 14, 0.08), glow);
        strip.position.set(Math.cos(ang) * 1.12, 8, Math.sin(ang) * 1.12);
        strip.rotation.z = Math.cos(ang) * 0.031;
        strip.rotation.x = -Math.sin(ang) * 0.031;
        g.add(strip);
      }
      for (let k = 0; k < 4; k++) {
        const band = new THREE.Mesh(new THREE.CylinderGeometry(1.5 - k * 0.12, 1.55 - k * 0.12, 0.35, 6), trim);
        band.position.y = 1 + k * 4.2;
        g.add(band);
      }
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.6, 6), body);
      cap.position.y = 16.8;
      g.add(cap);
      // Floating crystal with orbiting rings
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), crystalMat);
      crystal.scale.set(0.7, 1.5, 0.7);
      crystal.position.y = 20;
      g.add(crystal);
      const orbit = new THREE.Group();
      orbit.position.y = 20;
      for (let k = 0; k < 2; k++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.8 + k * 0.5, 0.04, 6, 64), glow);
        ring.rotation.x = Math.PI / 2 + (k ? 0.5 : -0.4);
        orbit.add(ring);
      }
      g.add(orbit);
      // Light cone rising from the crystal
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 0.6, 30, 24, 1, true), makeBeamMaterial(i % 2 ? 0xff2bd6 : 0x22e8ff, 0.25));
      beam.position.y = 36;
      g.add(beam);
      crystal.userData.keep = true;
      mergeChildrenByMaterial(g);
      mergeChildrenByMaterial(orbit);
      this.group.add(g);
      this.pillars.push({ group: g, crystal, orbit, phase: i * 0.7, beam });
    }
  }

  // ----------------------------------------------------------- equalizer

  _buildEqualizer() {
    const R = ARENA_RADIUS;
    const N = 96;
    this.eqCount = N;
    const geo = roundedBox(0.45, 1, 0.45, 0.06, 1);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x050508, emissive: 0xffffff, emissiveIntensity: 1, metalness: 0.4, roughness: 0.4 });
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n totalEmissiveRadiance *= vColor;',
      );
    };
    this.eq = new THREE.InstancedMesh(geo, mat, N);
    this.eq.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.eqBase = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      this.eqBase.push({ x: Math.cos(a) * (R + 2.2), z: Math.sin(a) * (R + 2.2), a });
      this.eq.setColorAt(i, new THREE.Color(0x22e8ff));
    }
    this.group.add(this.eq);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._pv = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  // ------------------------------------------------------------- barrier

  _buildBarrier() {
    const R = ARENA_RADIUS;
    this.barrierUniforms = {
      uTime: { value: 0 },
      uPlayer: { value: new THREE.Vector3() },
      uKick: { value: 0 },
      uHit: { value: new THREE.Vector4(0, 0, 0, -10) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.barrierUniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec3 vW; varying vec2 vUv;
        void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime, uKick; uniform vec3 uPlayer; uniform vec4 uHit;
        varying vec3 vW; varying vec2 vUv;
        vec4 hexCoords(vec2 p) {
          const vec2 s = vec2(1.0, 1.7320508);
          vec4 hC = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
          vec4 h = vec4(p - hC.xy * s, p - (hC.zw + 0.5) * s);
          return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hC.xy) : vec4(h.zw, hC.zw + 0.5);
        }
        float hexDist(vec2 p) { p = abs(p); return max(dot(p, vec2(0.5, 0.8660254)), p.x); }
        void main() {
          vec2 p = vec2(vUv.x * ${(TAU * R).toFixed(2)}, vW.y) / 1.2;
          vec4 hx = hexCoords(p);
          float edge = 0.5 - hexDist(hx.xy);
          float line = 1.0 - smoothstep(0.0, 0.05, edge);
          float d = distance(vW, uPlayer + vec3(0.0, 1.0, 0.0));
          float prox = exp(-d * d * 0.03);
          float bottom = exp(-vW.y * 0.9);
          float scan = pow(0.5 + 0.5 * sin(vW.y * 2.0 - uTime * 3.0), 12.0) * 0.25;
          float hitD = distance(vW, uHit.xyz);
          float hitAge = uTime - uHit.w;
          float hit = exp(-pow(hitD - hitAge * 10.0, 2.0)) * exp(-hitAge * 2.5) * step(0.0, hitAge);
          float a = line * (prox * 1.2 + bottom * 0.35 + scan + hit * 2.0 + uKick * 0.05) + bottom * 0.1 + prox * 0.08;
          a *= smoothstep(9.0, 3.0, vW.y);
          vec3 col = mix(vec3(0.1, 0.85, 1.0), vec3(1.0, 0.2, 0.75), smoothstep(0.0, 1.0, prox + hit));
          gl_FragColor = vec4(col * a, a);
        }
      `,
    });
    this.barrier = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.3, R + 0.3, 9, 128, 1, true), mat);
    this.barrier.position.y = 4.5;
    this.barrier.renderOrder = 5;
    this.group.add(this.barrier);
  }

  hitBarrier(pos) {
    this.barrierUniforms.uHit.value.set(pos.x, pos.y + 1, pos.z, this.time);
  }

  // ---------------------------------------------------------------- rocks

  _buildRocks() {
    const rng = this.rng;
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a2236, metalness: 0.2, roughness: 0.85, flatShading: true });
    const crystalMat = new THREE.MeshStandardMaterial({ color: 0x66e9ff, emissive: 0x22c8ff, emissiveIntensity: 2.5, roughness: 0.1 });
    const geos = [rock(1, 1, rng), rock(1, 1, rng, 0.45), rock(1, 2, rng, 0.2)];
    const N = 46;
    this.rocks = [];
    const counts = [0, 0, 0];
    const crystals = [];
    for (let i = 0; i < N; i++) {
      const type = i % 3;
      const size = 0.8 + rng() * rng() * 6;
      const r = {
        type, idx: counts[type]++, size,
        r: 44 + rng() * 70, a: rng() * TAU, y: -18 + rng() * 40,
        rot: new THREE.Euler(rng() * TAU, rng() * TAU, rng() * TAU),
        speed: (0.008 + rng() * 0.02) * (rng() < 0.5 ? -1 : 1), spin: (rng() - 0.5) * 0.2, bob: rng() * TAU,
        crystals: [],
      };
      if (rng() < 0.55) {
        for (let k = 0; k < 3; k++) {
          const local = new THREE.Matrix4().compose(
            new THREE.Vector3((rng() - 0.5) * size, size * 0.4 + rng() * size * 0.4, (rng() - 0.5) * size),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(rng(), rng(), rng())),
            new THREE.Vector3(1, 2, 1).multiplyScalar(size * (0.15 + rng() * 0.2)),
          );
          r.crystals.push(crystals.length);
          crystals.push({ rock: r, local });
        }
      }
      this.rocks.push(r);
    }
    this.rockMeshes = geos.map((g, t) => {
      const m = new THREE.InstancedMesh(g, mat, counts[t]);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      this.group.add(m);
      return m;
    });
    this.crystalData = crystals;
    this.crystalMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), crystalMat, Math.max(1, crystals.length));
    this.crystalMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.crystalMesh.frustumCulled = false;
    this.group.add(this.crystalMesh);
    this._rm = new THREE.Matrix4();
    this._rm2 = new THREE.Matrix4();
    this._rq = new THREE.Quaternion();
    this._rp = new THREE.Vector3();
    this._rs = new THREE.Vector3();
    this._updateRocks(0, 0);
  }

  _updateRocks(dt, time) {
    for (const r of this.rocks) {
      r.a += r.speed * dt;
      r.rot.y += r.spin * dt;
      r.rot.x += r.spin * 0.5 * dt;
      this._rp.set(Math.cos(r.a) * r.r, r.y + Math.sin(time * 0.4 + r.bob) * 1.2, Math.sin(r.a) * r.r);
      this._rq.setFromEuler(r.rot);
      // Unscaled rock frame (crystals are positioned in it), then the scaled body.
      r.frame = r.frame || new THREE.Matrix4();
      r.frame.compose(this._rp, this._rq, this._rs.set(1, 1, 1));
      this._rm.compose(this._rp, this._rq, this._rs.setScalar(r.size));
      this.rockMeshes[r.type].setMatrixAt(r.idx, this._rm);
    }
    for (const m of this.rockMeshes) m.instanceMatrix.needsUpdate = true;
    this.crystalData.forEach((c, i) => {
      this._rm2.multiplyMatrices(c.rock.frame, c.local);
      this.crystalMesh.setMatrixAt(i, this._rm2);
    });
    this.crystalMesh.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------- skyline

  _buildSkyline() {
    const rng = this.rng;
    const N = 420;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0x07060d });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vNrm; varying float vSeed;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 wpp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vWP = wpp.xyz; vNrm = normal; vSeed = float(gl_InstanceID);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWP; varying vec3 vNrm; varying float vSeed;
          float hh(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`)
        .replace('#include <opaque_fragment>', `
          {
            float side = abs(vNrm.y) < 0.5 ? 1.0 : 0.0;
            vec2 cell = vec2(floor((vWP.x + vWP.z) / 2.2), floor(vWP.y / 2.6));
            vec2 f = fract(vec2((vWP.x + vWP.z) / 2.2, vWP.y / 2.6));
            float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.25, f.y) * step(f.y, 0.75);
            float lit = step(0.62, hh(vec3(cell, vSeed)));
            vec3 wc = mix(vec3(1.0, 0.65, 0.3), vec3(0.3, 0.8, 1.0), hh(vec3(cell.yx, vSeed + 3.0)));
            wc = mix(wc, vec3(1.0, 0.3, 0.8), step(0.85, hh(vec3(vSeed, 1.0, 2.0))));
            outgoingLight += wc * win * lit * side * 1.6;
          }
          #include <opaque_fragment>`);
    };
    const city = new THREE.InstancedMesh(geo, mat, N);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < N; i++) {
      const a = rng() * TAU;
      const r = 190 + rng() * 420;
      const h = 70 + Math.pow(rng(), 2.4) * 300;
      const w = 6 + rng() * 16;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * TAU);
      m.compose(new THREE.Vector3(Math.cos(a) * r, -210, Math.sin(a) * r), q, new THREE.Vector3(w, h, w * (0.6 + rng() * 0.8)));
      city.setMatrixAt(i, m);
    }
    city.frustumCulled = false;
    this.group.add(city);

    // Blinking beacons on rooftops.
    const pts = [];
    const cols = [];
    for (let i = 0; i < N; i++) {
      city.getMatrixAt(i, m);
      const p = new THREE.Vector3(), s = new THREE.Vector3();
      m.decompose(p, q, s);
      if (s.y > 190) {
        pts.push(p.x, p.y + s.y + 2, p.z);
        cols.push(1, 0.15, 0.2);
      }
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    bg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.beacons = new THREE.Points(bg, new THREE.PointsMaterial({
      size: 3, vertexColors: true, map: softDot(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    this.group.add(this.beacons);
  }

  // A colossal ring structure on the horizon.
  _buildHalo() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x0c0c16, metalness: 0.9, roughness: 0.4, fog: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(260, 6, 12, 180), mat);
    g.add(ring);
    const lights = new THREE.Mesh(new THREE.TorusGeometry(260, 6.3, 4, 360), new THREE.ShaderMaterial({
      transparent: true,
      fog: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        void main(){
          float seg = step(0.55, fract(vUv.x * 180.0));
          float chase = pow(fract(vUv.x * 6.0 - uTime * 0.05), 8.0);
          float band = smoothstep(0.02, 0.0, abs(vUv.y - 0.25)) + smoothstep(0.02, 0.0, abs(vUv.y - 0.75));
          float a = band * seg * (0.4 + chase * 1.5);
          gl_FragColor = vec4(vec3(0.3, 0.9, 1.0) * a, a);
        }`,
    }));
    g.add(lights);
    g.position.set(-80, 40, -480);
    g.rotation.set(0.35, 0.6, 0.15);
    this.halo = g;
    this.haloLights = lights;
    this.scene.add(g);
  }

  // Drifting embers and dust within the arena volume.
  _buildMotes() {
    const N = this.quality.particles > 0.5 ? 1100 : 500;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    const palette = [new THREE.Color(0x22e8ff), new THREE.Color(0xff2bd6), new THREE.Color(0xffb02e), new THREE.Color(0xbfa6ff)];
    for (let i = 0; i < N; i++) {
      const a = Math.random() * TAU;
      const r = Math.sqrt(Math.random()) * 55;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = -10 + Math.random() * 35;
      pos[i * 3 + 2] = Math.sin(a) * r;
      const c = palette[i % 4];
      col.set([c.r, c.g, c.b], i * 3);
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.moteUniforms = { uTime: { value: 0 }, uKick: { value: 0 }, uScale: { value: 300 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.moteUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      vertexShader: /* glsl */ `
        attribute float seed; varying vec3 vCol; varying float vA;
        uniform float uTime, uKick, uScale;
        void main() {
          vec3 p = position;
          float t = uTime * (0.3 + seed * 0.5);
          p.y = mod(p.y + t * 1.5 + 10.0, 35.0) - 10.0;
          p.x += sin(t + seed * 30.0) * 1.5;
          p.z += cos(t * 0.8 + seed * 20.0) * 1.5;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float tw = 0.5 + 0.5 * sin(uTime * 3.0 + seed * 60.0);
          gl_PointSize = (0.08 + seed * 0.12) * uScale / -mv.z * (1.0 + uKick * 0.6);
          vCol = color; vA = (0.35 + tw * 0.65) * smoothstep(-10.0, -6.0, p.y) * smoothstep(25.0, 18.0, p.y);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vCol; varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vCol * a * vA * 1.5, a * vA);
        }
      `,
    });
    this.motes = new THREE.Points(geo, mat);
    this.motes.frustumCulled = false;
    this.group.add(this.motes);
  }

  _buildEnvironmentMap() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    const sky = createSky();
    envScene.add(sky.mesh);
    const panelMat = (c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide });
    const cols = [0x22e8ff, 0xff2bd6, 0x8a5cff, 0xffb02e];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(30, 6), panelMat(new THREE.Color(cols[i % 4]).multiplyScalar(2.5)));
      p.position.set(Math.cos(a) * 200, 30 + (i % 3) * 30, Math.sin(a) * 200);
      p.lookAt(0, 0, 0);
      envScene.add(p);
    }
    const floorGlow = new THREE.Mesh(new THREE.CircleGeometry(400, 32).rotateX(-Math.PI / 2), panelMat(0x2a1035));
    floorGlow.position.y = -60;
    envScene.add(floorGlow);
    this.envMap = pmrem.fromScene(envScene, 0.035).texture;
    this.scene.environment = this.envMap;
    pmrem.dispose();
  }

  // ---------------------------------------------------------------- update

  update(dt, { time, beatPhase, kick, snare, spectrum, playerPos, danger, overdrive, camera }) {
    this.time = time;
    const fu = this.floorUniforms;
    fu.uTime.value = time;
    fu.uBeat.value = beatPhase;
    fu.uKick.value = kick;
    fu.uDanger.value = damp(fu.uDanger.value, danger, 4, dt);
    fu.uOverdrive.value = damp(fu.uOverdrive.value, overdrive, 4, dt);
    if (playerPos) fu.uPlayer.value.copy(playerPos);

    this.sky.uniforms.uTime.value = time;
    this.sky.uniforms.uPulse.value = kick;
    this.sky.mesh.position.copy(camera.position);
    this.clouds.uniforms.uTime.value = time;
    this.clouds.uniforms.uPulse.value = kick;
    this.barrierUniforms.uTime.value = time;
    this.barrierUniforms.uKick.value = kick;
    if (playerPos) this.barrierUniforms.uPlayer.value.copy(playerPos);
    this.moteUniforms.uTime.value = time;
    this.moteUniforms.uKick.value = kick;
    this.moteUniforms.uScale.value = window.innerHeight * 0.9;
    this.haloLights.material.uniforms.uTime.value = time;
    this.halo.rotation.z += dt * 0.004;

    for (let i = 0; i < this.accentLights.length; i++) {
      this.accentLights[i].intensity = 4 + kick * 10 + (i % 2 ? snare * 6 : 0);
    }
    this.core.rotation.y += dt * 0.6;
    this.core.rotation.x += dt * 0.3;
    this.core.scale.setScalar(1 + kick * 0.15);
    for (const s of this.rimStrips) s.material.emissiveIntensity = 1.8 + kick * 2.5;

    for (const p of this.pillars) {
      p.crystal.rotation.y += dt * 0.8;
      p.crystal.position.y = 20 + Math.sin(time * 1.2 + p.phase) * 0.6;
      p.orbit.rotation.y += dt * 0.5;
      p.orbit.rotation.z = Math.sin(time * 0.5 + p.phase) * 0.3;
      p.crystal.material.emissiveIntensity = 1.2 + kick * 2;
    }

    this._updateRocks(dt, time);

    // Chaser lights race around the rim, faster in overdrive.
    const N = 120;
    const speed = 30 + overdrive * 60;
    const head = (time * speed) % N;
    for (let i = 0; i < N; i++) {
      const d = (head - i + N) % N;
      const k = Math.exp(-d * 0.25) + Math.exp(-((head + N / 2 - i + N) % N) * 0.25);
      this._chaserCol.setRGB(0.05 + k * 1.2, 0.3 + k * 3.2, 0.5 + k * 3.5);
      if (overdrive > 0.5) this._chaserCol.setRGB(0.5 + k * 3.5, 0.3 + k * 2, 0.05 + k);
      this.chasers.setColorAt(i, this._chaserCol);
    }
    this.chasers.instanceColor.needsUpdate = true;

    // Equalizer towers driven by the live spectrum (mirrored around the ring).
    const n = this.eqCount;
    for (let i = 0; i < n; i++) {
      const half = n / 2;
      const j = i < half ? i : n - 1 - i;
      let v = 0;
      if (spectrum) {
        const bin = Math.min(spectrum.length - 1, Math.floor(Math.pow(j / half, 1.6) * 70) + 1);
        v = spectrum[bin] / 255;
      } else {
        v = 0.2 + 0.2 * Math.sin(time * 2 + i * 0.4);
      }
      this.eqLevels[i] = Math.max(v, this.eqLevels[i] - dt * 2.5);
      const h = 0.2 + this.eqLevels[i] * this.eqLevels[i] * 9 + kick * 0.5;
      const b = this.eqBase[i];
      this._q.setFromAxisAngle(this._pv.set(0, 1, 0), -b.a);
      this._m.compose(this._pv.set(b.x, 0.2, b.z), this._q, this._s.set(1, h, 1));
      this.eq.setMatrixAt(i, this._m);
      // Cyan at rest through violet to hot pink at peaks; gold in Overdrive.
      const hue = overdrive > 0.5 ? 0.11 + this.eqLevels[i] * 0.04 : 0.5 + this.eqLevels[i] * 0.42;
      this._c.setHSL(hue % 1, 1, 0.5).multiplyScalar(0.5 + this.eqLevels[i] * 1.6);
      this.eq.setColorAt(i, this._c);
    }
    this.eq.instanceMatrix.needsUpdate = true;
    this.eq.instanceColor.needsUpdate = true;
  }
}

function makeBeamMaterial(color, strength) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform vec3 uColor; uniform float uStrength; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        float f = pow(abs(dot(vN, vV)), 1.5);
        float a = f * smoothstep(1.0, 0.0, vUv.y) * smoothstep(0.0, 0.08, vUv.y) * uStrength;
        gl_FragColor = vec4(uColor * a, a);
      }`,
  });
}

let _dot = null;
export function softDot() {
  if (_dot) return _dot;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  _dot = new THREE.CanvasTexture(c);
  return _dot;
}

export { makeBeamMaterial };
