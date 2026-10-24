// Rain / snow particles and lightning around the camera.
import * as THREE from 'three';

const N = 1600;
const R = 18;

export class Weather {
  constructor(scene) {
    this.positions = new Float32Array(N * 6);
    this.colors = new Float32Array(N * 6);
    this.drops = [];
    for (let i = 0; i < N; i++) this.drops.push({ x: 0, y: -1000, z: 0, snow: false, speed: 0, vis: false });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, fog: false });
    this.lines = new THREE.LineSegments(g, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 3;
    scene.add(this.lines);
    this.intensity = 0; // 0..1 smooth
    this.flash = 0;
    this.bolt = null;
    this.scene = scene;
  }

  respawn(d, cam, world, top) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R;
    d.x = cam.x + Math.cos(a) * r;
    d.z = cam.z + Math.sin(a) * r;
    d.y = top ? cam.y + 14 + Math.random() * 4 : cam.y - 8 + Math.random() * 24;
    const biome = world.getBiome(Math.floor(d.x), Math.floor(d.z));
    d.snow = biome === 'Snowy Tundra' || biome === 'Frozen Ocean' || d.y > 100;
    d.speed = d.snow ? 2.5 + Math.random() : 22 + Math.random() * 6;
    d.drift = Math.random() * Math.PI * 2;
  }

  update(dt, cam, world, target, daylight) {
    this.intensity += (target - this.intensity) * Math.min(1, dt * 0.3);
    if (Math.abs(this.intensity - target) < 0.001) this.intensity = target;
    const active = Math.round(N * this.intensity);
    this.lines.visible = active > 0;
    const pos = this.positions, col = this.colors;
    const c = Math.max(0.25, daylight);
    for (let i = 0; i < N; i++) {
      const d = this.drops[i];
      const o = i * 6;
      if (i >= active) { pos[o + 1] = pos[o + 4] = -1000; continue; }
      d.y -= d.speed * dt;
      if (d.snow) { d.x += Math.sin(d.drift + d.y * 0.7) * dt * 0.6; }
      const dx = d.x - cam.x, dz = d.z - cam.z;
      if (d.y < cam.y - 10 || dx * dx + dz * dz > R * R) this.respawn(d, cam, world, d.y < cam.y - 10);
      const l = world.getLight(Math.floor(d.x), Math.floor(d.y), Math.floor(d.z));
      const exposed = (l >> 4) === 15 && world.getBlock(Math.floor(d.x), Math.floor(d.y), Math.floor(d.z)) === 0;
      if (!exposed) {
        if (world.getBlock(Math.floor(d.x), Math.floor(d.y), Math.floor(d.z)) !== 0 && d.y < cam.y + 2) this.respawn(d, cam, world, true);
        pos[o + 1] = pos[o + 4] = -1000;
        continue;
      }
      const len = d.snow ? 0.1 : 0.7;
      pos[o] = d.x; pos[o + 1] = d.y; pos[o + 2] = d.z;
      pos[o + 3] = d.x; pos[o + 4] = d.y + len; pos[o + 5] = d.z;
      const r = d.snow ? c : 0.55 * c, g = d.snow ? c : 0.6 * c, b = d.snow ? c : 0.8 * c;
      col[o] = r; col[o + 1] = g; col[o + 2] = b; col[o + 3] = r; col[o + 4] = g; col[o + 5] = b;
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
    this.lines.geometry.attributes.color.needsUpdate = true;
    this.flash = Math.max(0, this.flash - dt * 3);
    if (this.bolt) {
      this.bolt.life -= dt;
      this.bolt.mesh.visible = Math.floor(this.bolt.life * 20) % 3 !== 0;
      if (this.bolt.life <= 0) { this.scene.remove(this.bolt.mesh); this.bolt.mesh.geometry.dispose(); this.bolt = null; }
    }
  }

  strike(x, groundY, z) {
    if (this.bolt) { this.scene.remove(this.bolt.mesh); this.bolt.mesh.geometry.dispose(); }
    const pts = [];
    let px = x, pz = z;
    for (let y = 128; y > groundY; y -= 4) {
      const nx = px + (Math.random() - 0.5) * 3, nz = pz + (Math.random() - 0.5) * 3;
      pts.push(px, y, pz, nx, Math.max(groundY, y - 4), nz);
      px = nx; pz = nz;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xeef4ff, fog: false }));
    this.scene.add(mesh);
    this.bolt = { mesh, life: 0.5 };
    this.flash = 1;
  }
}
