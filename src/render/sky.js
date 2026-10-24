import * as THREE from 'three';
import { makeRng } from '../noise.js';

export const DAY_TICKS = 24000;

const lerp = (a, b, t) => a + (b - a) * t;
function lerpColor(out, a, b, t) { out.setRGB(lerp(a.r, b.r, t), lerp(a.g, b.g, t), lerp(a.b, b.b, t)); return out; }

const DAY_SKY = new THREE.Color(0x78a7ff), DAY_FOG = new THREE.Color(0xb5d3ff);
const NIGHT_SKY = new THREE.Color(0x02040b), NIGHT_FOG = new THREE.Color(0x0a0d18);
const SUNSET = new THREE.Color(0xe8784a);

function makeSprite(draw, size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  return t;
}

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    const sunTex = makeSprite((g, s) => {
      g.fillStyle = 'rgba(255,240,150,0.25)'; g.fillRect(8, 8, s - 16, s - 16);
      g.fillStyle = '#fff6b0'; g.fillRect(18, 18, s - 36, s - 36);
      g.fillStyle = '#ffffff'; g.fillRect(22, 22, s - 44, s - 44);
    });
    const moonTex = makeSprite((g, s) => {
      g.fillStyle = '#e6e8f0'; g.fillRect(20, 20, s - 40, s - 40);
      g.fillStyle = '#b8bccb'; g.fillRect(24, 26, 6, 6); g.fillRect(34, 34, 5, 5); g.fillRect(28, 38, 4, 3);
    });
    const mk = (tex) => new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({
      map: tex, transparent: true, fog: false, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.sun = mk(sunTex);
    this.moon = mk(moonTex);
    this.sun.renderOrder = -10; this.moon.renderOrder = -10;
    this.group.add(this.sun, this.moon);

    // stars
    const rng = makeRng(42);
    const pts = [];
    for (let i = 0; i < 1500; i++) {
      const u = rng() * 2 - 1, th = rng() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      pts.push(Math.cos(th) * r * 400, u * 400, Math.sin(th) * r * 400);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.renderOrder = -11;
    this.group.add(this.stars);

    // clouds
    const cc = document.createElement('canvas');
    cc.width = cc.height = 128;
    const g = cc.getContext('2d');
    const crng = makeRng(7);
    const grid = new Uint8Array(128 * 128);
    for (let i = 0; i < 128 * 128; i++) grid[i] = crng() < 0.42 ? 1 : 0;
    for (let it = 0; it < 4; it++) {
      const ng = new Uint8Array(grid.length);
      for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += grid[((y + dy + 128) % 128) * 128 + ((x + dx + 128) % 128)];
        ng[y * 128 + x] = n >= 5 ? 1 : 0;
      }
      grid.set(ng);
    }
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) if (grid[y * 128 + x]) { g.fillStyle = '#fff'; g.fillRect(x, y, 1, 1); }
    const ct = new THREE.CanvasTexture(cc);
    ct.wrapS = ct.wrapT = THREE.RepeatWrapping;
    ct.magFilter = THREE.NearestFilter; ct.minFilter = THREE.NearestFilter;
    this.cloudMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: ct }, offset: { value: new THREE.Vector2() }, color: { value: new THREE.Color(1, 1, 1) }, camPos: { value: new THREE.Vector3() } },
      vertexShader: `varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform sampler2D map; uniform vec2 offset; uniform vec3 color; uniform vec3 camPos; varying vec3 vWorld;
        void main(){ vec2 uv = (vWorld.xz + offset) / (128.0 * 12.0); float a = texture2D(map, uv).r; if (a < 0.5) discard;
          float d = length(vWorld.xz - camPos.xz); float fade = 1.0 - smoothstep(180.0, 300.0, d);
          gl_FragColor = vec4(color, 0.8 * fade); }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(640, 640), this.cloudMat);
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.renderOrder = 2;
    scene.add(this.clouds);
    this.cloudOffset = 0;
    this.skyColor = new THREE.Color();
    this.fogColor = new THREE.Color();
  }

  // time in ticks [0, 24000). 0 = sunrise, 6000 = noon, 12000 = sunset, 18000 = midnight.
  update(time, camera, dt) {
    const t = ((time % DAY_TICKS) + DAY_TICKS) % DAY_TICKS;
    const angle = (t / DAY_TICKS) * Math.PI * 2; // sun angle from east horizon
    const sunH = Math.sin(angle);
    const day = THREE.MathUtils.clamp(sunH * 2.2 + 0.35, 0, 1);
    this.dayFactor = day;
    this.daylight = 0.3 + 0.7 * day;
    const sunsetAmt = Math.max(0, 1 - Math.abs(sunH) * 3.2) * (Math.cos(angle) > -2 ? 1 : 0);

    lerpColor(this.skyColor, NIGHT_SKY, DAY_SKY, day);
    lerpColor(this.fogColor, NIGHT_FOG, DAY_FOG, day);
    // sunset tint toward the sun direction
    this.fogColor.lerp(SUNSET, sunsetAmt * 0.45);

    const cp = camera.position;
    this.group.position.copy(cp);
    const dist = 300;
    const sx = Math.cos(angle) * dist, sy = Math.sin(angle) * dist;
    this.sun.position.set(sx, sy, 0);
    this.moon.position.set(-sx, -sy, 0);
    this.group.updateMatrixWorld();
    this.sun.lookAt(cp);
    this.moon.lookAt(cp);
    this.starMat.opacity = Math.max(0, 1 - day * 1.6);
    this.stars.rotation.z = angle;

    this.cloudOffset += dt * 1.2;
    this.clouds.position.set(cp.x, 124, cp.z);
    this.cloudMat.uniforms.offset.value.set(this.cloudOffset, 0);
    this.cloudMat.uniforms.camPos.value.copy(cp);
    const cb = 0.25 + 0.75 * day;
    this.cloudMat.uniforms.color.value.setRGB(cb, cb, cb * 1.02);
    return { skyColor: this.skyColor, fogColor: this.fogColor, daylight: this.daylight };
  }
}
