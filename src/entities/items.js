// Dropped items, falling blocks, primed TNT and particles.
import * as THREE from 'three';
import { Entity } from './physics.js';
import { BLOCKS, ITEMS, B, maxStack } from '../blocks.js';
import { iconCanvases, tileAvgColor } from '../textures.js';
import { FACES, FACING_FACE } from '../world/mesher.js';
import { lightToBrightness } from '../render/materials.js';
import { audio } from '../audio.js';

const SHADE = [0.6, 0.6, 1.0, 0.5, 0.8, 0.8];

// Cube geometry textured like a block (uses texture-array layers via aLayer)
const cubeCache = new Map();
export function blockGeometry(id, size = 1) {
  const key = id + ':' + size;
  if (cubeCache.has(key)) return cubeCache.get(key);
  const def = BLOCKS[id];
  const pos = [], uv = [], layer = [], col = [], index = [];
  let box = [0, 0, 0, 16, 16, 16];
  if (def.render === 'box') box = def.box;
  if (def.render === 'torch') box = [7, 0, 7, 9, 10, 9];
  const [x0, y0, z0, x1, y1, z1] = box.map((v) => v / 16);
  for (let d = 0; d < 6; d++) {
    const F = FACES[d];
    let L = d === 2 ? def.faces.top : d === 3 ? def.faces.bottom : def.faces.side;
    if (def.facing && d === FACING_FACE[0]) L = def.faces.front;
    if (def.id === B.CRAFTING_TABLE && (d === 4 || d === 0)) L = def.faces.front;
    const base = pos.length / 3;
    for (let k = 0; k < 4; k++) {
      const c = F.corners[k];
      const px = c[0] ? x1 : x0, py = c[1] ? y1 : y0, pz = c[2] ? z1 : z0;
      pos.push((px - 0.5) * size, (py - 0.5 * (y1 - y0) - y0) * size, (pz - 0.5) * size);
      const rel = [px - 0.5, py - 0.5, pz - 0.5];
      let u = rel[0] * F.right[0] + rel[1] * F.right[1] + rel[2] * F.right[2] + 0.5;
      let v = 1 - (rel[0] * F.up[0] + rel[1] * F.up[1] + rel[2] * F.up[2] + 0.5);
      if (def.render === 'torch') { u = 7 / 16 + (u - 7 / 16); }
      uv.push(u, v);
      layer.push(L);
      const s = SHADE[d] * 255;
      let tint = [1, 1, 1];
      if (def.tint === 'foliage' || def.tint === 'grass' || (def.tintTop && d === 2)) tint = [0.9, 1, 0.85];
      col.push(s * tint[0], s * tint[1], s * tint[2]);
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aLayer', new THREE.BufferAttribute(new Uint8Array(layer), 1));
  g.setAttribute('aColor', new THREE.BufferAttribute(new Uint8Array(col), 3, true));
  g.setIndex(index);
  cubeCache.set(key, g);
  return g;
}

export function isCubeItem(id) {
  const d = ITEMS[id];
  return d && d.isBlock && (d.render === 'cube' || d.render === 'box' || d.render === 'fluid');
}

const spriteTexCache = new Map();
export function itemTexture(id) {
  if (spriteTexCache.has(id)) return spriteTexCache.get(id);
  const c = iconCanvases[id];
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  spriteTexCache.set(id, t);
  return t;
}

export function cloneBlockMat(src) {
  const m = new THREE.ShaderMaterial({
    glslVersion: src.glslVersion, vertexShader: src.vertexShader, fragmentShader: src.fragmentShader,
    uniforms: {
      map: src.uniforms.map, fogNear: src.uniforms.fogNear, fogFar: src.uniforms.fogFar, fogColor: src.uniforms.fogColor,
      brightness: { value: 1 }, flash: { value: new THREE.Vector3() },
    },
  });
  return m;
}

export class ItemEntity extends Entity {
  constructor(world, scene, stack, blockMat) {
    super(world, 0.25, 0.25);
    this.stack = stack;
    this.scene = scene;
    this.age = 0;
    this.pickupDelay = 0.5;
    this.spin = Math.random() * Math.PI * 2;
    if (isCubeItem(stack.id)) {
      this.mat = cloneBlockMat(blockMat);
      this.mesh = new THREE.Mesh(blockGeometry(stack.id, 0.25), this.mat);
      this.isCube = true;
    } else {
      this.mat = new THREE.MeshBasicMaterial({ map: itemTexture(stack.id), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
      this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), this.mat);
    }
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    if (stack.count > 1 && this.isCube) {
      const m2 = new THREE.Mesh(this.mesh.geometry, this.mat);
      m2.position.set(0.06, 0.06, 0.06);
      this.group.add(m2);
    }
    scene.add(this.group);
  }

  update(dt, ctx) {
    this.age += dt;
    this.pickupDelay -= dt;
    if (this.age > 300) { this.remove(); return; }
    const p = ctx.player;
    const dx = p.pos.x - this.pos.x, dy = p.pos.y + 0.6 - this.pos.y, dz = p.pos.z - this.pos.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (this.pickupDelay <= 0 && !p.dead && d < 2.2) {
      if (d < 0.9) {
        const left = p.inventory.add(this.stack);
        if (left < this.stack.count) audio.play('pop');
        if (left <= 0) { this.remove(); return; }
        this.stack.count = left;
      } else {
        this.vel.x += (dx / d) * 40 * dt; this.vel.y += (dy / d) * 40 * dt; this.vel.z += (dz / d) * 40 * dt;
      }
    }
    if (this.inWater) this.vel.y += 40 * dt * 0.3;
    this.physics(dt, 0.4);
    this.spin += dt * 2;
    this.group.position.set(this.pos.x, this.pos.y + 0.18 + Math.sin(this.age * 2.5) * 0.05, this.pos.z);
    if (this.isCube) this.group.rotation.y = this.spin;
    else this.group.rotation.y = Math.atan2(ctx.camera.position.x - this.pos.x, ctx.camera.position.z - this.pos.z);
    const b = ctx.lightAt(this.pos, 0.2);
    if (this.isCube) this.mat.uniforms.brightness.value = b;
    else this.mat.color.setRGB(b, b, b);
  }

  remove() {
    this.dead = true;
    this.scene.remove(this.group);
    this.mat.dispose();
    if (!this.isCube) this.mesh.geometry.dispose();
  }
}

export class FallingBlock extends Entity {
  constructor(world, scene, id, blockMat) {
    super(world, 0.98, 0.98);
    this.id = id;
    this.scene = scene;
    this.mat = cloneBlockMat(blockMat);
    this.mesh = new THREE.Mesh(blockGeometry(id, 1), this.mat);
    scene.add(this.mesh);
    this.age = 0;
  }
  update(dt, ctx) {
    this.age += dt;
    this.physics(dt);
    this.mesh.position.set(this.pos.x, this.pos.y + 0.49, this.pos.z);
    this.mat.uniforms.brightness.value = ctx.lightAt(this.pos, 0.5);
    if (this.onGround || this.age > 20) {
      const x = Math.floor(this.pos.x), y = Math.floor(this.pos.y + 0.3), z = Math.floor(this.pos.z);
      const cur = this.world.getBlock(x, y, z);
      if (cur === 0 || (cur > 0 && BLOCKS[cur].replaceable)) this.world.setBlock(x, y, z, this.id);
      else ctx.spawnItem(this.pos.x, this.pos.y + 0.5, this.pos.z, { id: this.id, count: 1, dmg: 0 });
      this.remove();
    }
  }
  remove() { this.dead = true; this.scene.remove(this.mesh); this.mat.dispose(); }
}

export class PrimedTNT extends Entity {
  constructor(world, scene, blockMat, fuse = 4) {
    super(world, 0.98, 0.98);
    this.scene = scene;
    this.fuse = fuse;
    this.mat = cloneBlockMat(blockMat);
    this.mesh = new THREE.Mesh(blockGeometry(B.TNT, 1), this.mat);
    scene.add(this.mesh);
    this.vel.set((Math.random() - 0.5) * 2, 4, (Math.random() - 0.5) * 2);
    audio.play('fuse', this.pos);
  }
  update(dt, ctx) {
    this.fuse -= dt;
    this.physics(dt);
    const s = this.fuse < 0.6 ? 1 + (0.6 - this.fuse) * 0.3 : 1;
    this.mesh.scale.setScalar(s);
    this.mesh.position.set(this.pos.x, this.pos.y + 0.49, this.pos.z);
    const flash = Math.floor(this.fuse * 4) % 2 === 0;
    this.mat.uniforms.brightness.value = ctx.lightAt(this.pos, 0.5);
    this.mat.uniforms.flash.value.setScalar(flash ? 0.6 : 0);
    if (this.fuse <= 0) {
      this.remove();
      ctx.explode(this.pos.x, this.pos.y + 0.5, this.pos.z, 4, this);
    }
  }
  remove() { this.dead = true; this.scene.remove(this.mesh); this.mat.dispose(); }
}

// Instanced cube particles
export class Particles {
  constructor(scene, max = 2000) {
    this.max = max;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.list = [];
    this._m = new THREE.Matrix4();
    this._c = new THREE.Color();
    this.world = null;
  }
  add(x, y, z, vx, vy, vz, color, size, life, gravity = 16) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ x, y, z, vx, vy, vz, r: color[0], g: color[1], b: color[2], size, life, maxLife: life, gravity });
  }
  blockBreak(x, y, z, id) {
    const def = BLOCKS[id];
    if (!def || !def.tex) return;
    const base = tileAvgColor[def.tex.side] || [128, 128, 128];
    for (let i = 0; i < 28; i++) {
      const f = 0.7 + Math.random() * 0.5;
      this.add(x + Math.random(), y + Math.random(), z + Math.random(),
        (Math.random() - 0.5) * 4, Math.random() * 4, (Math.random() - 0.5) * 4,
        [base[0] / 255 * f, base[1] / 255 * f, base[2] / 255 * f], 0.06 + Math.random() * 0.08, 0.5 + Math.random() * 0.6);
    }
  }
  hit(x, y, z, face, id) {
    const def = BLOCKS[id];
    if (!def || !def.tex) return;
    const base = tileAvgColor[def.tex.side] || [128, 128, 128];
    for (let i = 0; i < 2; i++) {
      const px = x + 0.5 + face[0] * 0.52 + (face[0] ? 0 : Math.random() - 0.5);
      const py = y + 0.5 + face[1] * 0.52 + (face[1] ? 0 : Math.random() - 0.5);
      const pz = z + 0.5 + face[2] * 0.52 + (face[2] ? 0 : Math.random() - 0.5);
      this.add(px, py, pz, face[0] * 1.5 + (Math.random() - 0.5), 1 + Math.random() * 1.5, face[2] * 1.5 + (Math.random() - 0.5),
        [base[0] / 255, base[1] / 255, base[2] / 255], 0.06, 0.4);
    }
  }
  explosion(x, y, z, r) {
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * Math.PI;
      const s = 2 + Math.random() * 6;
      const g = 0.3 + Math.random() * 0.5;
      this.add(x, y, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 1, Math.sin(a) * Math.cos(e) * s,
        [g, g, g], 0.3 + Math.random() * 0.5, 0.8 + Math.random() * 1.2, -1);
    }
    for (let i = 0; i < 20; i++) {
      this.add(x + (Math.random() - 0.5) * r, y + (Math.random() - 0.5) * r, z + (Math.random() - 0.5) * r, 0, 0.5, 0,
        [1, 0.8 + Math.random() * 0.2, 0.5], 0.6 + Math.random() * 0.6, 0.25 + Math.random() * 0.2, 0);
    }
  }
  bubble(x, y, z) {
    this.add(x, y, z, (Math.random() - 0.5) * 0.4, 1.5, (Math.random() - 0.5) * 0.4, [0.7, 0.8, 1], 0.06, 0.6, -2);
  }
  smoke(x, y, z) {
    const g = 0.2 + Math.random() * 0.3;
    this.add(x, y, z, (Math.random() - 0.5) * 0.3, 0.8, (Math.random() - 0.5) * 0.3, [g, g, g], 0.08, 1, -0.5);
  }
  flame(x, y, z) {
    this.add(x, y, z, 0, 0.3, 0, [1, 0.7, 0.2], 0.05, 0.4, -0.5);
  }
  update(dt, daylight) {
    const m = this._m, c = this._c;
    let n = 0;
    const keep = [];
    for (const p of this.list) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= p.gravity * dt;
      let nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      if (this.world && p.gravity > 0) {
        const b = this.world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
        if (b > 0 && BLOCKS[b].solid) { p.vx *= 0.3; p.vz *= 0.3; p.vy = 0; ny = p.y; nx = p.x; nz = p.z; }
      }
      p.x = nx; p.y = ny; p.z = nz;
      keep.push(p);
      const s = p.size * (p.gravity < 0 ? 1 + (1 - p.life / p.maxLife) : Math.min(1, p.life / p.maxLife * 2));
      m.makeScale(s, s, s);
      m.setPosition(p.x, p.y, p.z);
      this.mesh.setMatrixAt(n, m);
      let l = 1;
      if (this.world) l = lightToBrightness(this.world.getLight(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)), daylight);
      c.setRGB(p.r * l, p.g * l, p.b * l);
      this.mesh.setColorAt(n, c);
      n++;
    }
    this.list = keep;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  clear() { this.list = []; this.mesh.count = 0; }
}

export { maxStack };
