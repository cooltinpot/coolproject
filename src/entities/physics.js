import * as THREE from 'three';
import { BLOCKS, SOLID, blockShapes } from '../blocks.js';

const EPS = 1e-4;

export function collisionBoxes(id, meta) {
  const d = BLOCKS[id];
  if (!d || !d.solid) return null;
  return blockShapes(id, meta); // null = full cube
}

// Axis-aligned bounding-box entity with voxel collision.
export class Entity {
  constructor(world, w = 0.6, h = 1.8) {
    this.world = world;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.w = w; this.h = h;
    this.onGround = false;
    this.inWater = false;
    this.inLava = false;
    this.headInWater = false;
    this.onLadder = false;
    this.inWeb = false;
    this.fallDistance = 0;
    this.yaw = 0;
    this.dead = false;
    this.horizontalCollision = false;
    this.gravity = 32;
    this.noClip = false;
    this.stepHeight = 0.6;
  }

  aabb(p = this.pos) {
    const hw = this.w / 2;
    return [p.x - hw, p.y, p.z - hw, p.x + hw, p.y + this.h, p.z + hw];
  }

  // Collect solid block boxes overlapping the given region.
  boxesIn(x0, y0, z0, x1, y1, z1, out) {
    out.length = 0;
    const w = this.world;
    for (let y = Math.floor(y0); y <= Math.floor(y1); y++) for (let z = Math.floor(z0); z <= Math.floor(z1); z++) for (let x = Math.floor(x0); x <= Math.floor(x1); x++) {
      const id = w.getBlock(x, y, z);
      if (id === -1) { out.push([x, y, z, x + 1, y + 1, z + 1]); continue; }
      if (!SOLID[id]) continue;
      const bs = collisionBoxes(id, w.getMeta(x, y, z));
      if (bs) for (const b of bs) out.push([x + b[0] / 16, y + b[1] / 16, z + b[2] / 16, x + b[3] / 16, y + b[4] / 16, z + b[5] / 16]);
      else out.push([x, y, z, x + 1, y + 1, z + 1]);
    }
    return out;
  }

  collides(p) {
    const a = this.aabb(p);
    const boxes = this.boxesIn(a[0] + EPS, a[1] + EPS, a[2] + EPS, a[3] - EPS, a[4] - EPS, a[5] - EPS, _boxes);
    for (const b of boxes) {
      if (a[0] < b[3] && a[3] > b[0] && a[1] < b[4] && a[4] > b[1] && a[2] < b[5] && a[5] > b[2]) return true;
    }
    return false;
  }

  // Move with Minecraft-style step-up (walk onto slabs/stairs without jumping).
  move(dx, dy, dz) {
    const start = this.pos.clone();
    const hit = this.moveRaw(dx, dy, dz);
    if (this.noClip || !(hit.x || hit.z) || !this.onGround || dy > 0 || this.stepHeight <= 0) return hit;
    const normal = this.pos.clone();
    this.pos.copy(start);
    this.moveRaw(0, this.stepHeight, 0);
    const h2 = this.moveRaw(dx, 0, dz);
    const h3 = this.moveRaw(0, -this.stepHeight + Math.min(0, dy), 0);
    const dn = (normal.x - start.x) ** 2 + (normal.z - start.z) ** 2;
    const ds = (this.pos.x - start.x) ** 2 + (this.pos.z - start.z) ** 2;
    if (ds > dn + 1e-6 && h3.y) return { x: h2.x, y: true, z: h2.z };
    this.pos.copy(normal);
    return hit;
  }

  // Move by (dx,dy,dz) resolving collisions axis by axis. Returns which axes were blocked.
  moveRaw(dx, dy, dz) {
    if (this.noClip) { this.pos.x += dx; this.pos.y += dy; this.pos.z += dz; return { x: false, y: false, z: false }; }
    const hit = { x: false, y: false, z: false };
    const a = this.aabb();
    const boxes = this.boxesIn(
      Math.min(a[0], a[0] + dx) - 1, Math.min(a[1], a[1] + dy) - 1, Math.min(a[2], a[2] + dz) - 1,
      Math.max(a[3], a[3] + dx) + 1, Math.max(a[4], a[4] + dy) + 1, Math.max(a[5], a[5] + dz) + 1, _boxes2);
    // Y
    let box = a.slice();
    for (const b of boxes) {
      if (box[0] < b[3] - EPS && box[3] > b[0] + EPS && box[2] < b[5] - EPS && box[5] > b[2] + EPS) {
        if (dy > 0 && box[4] <= b[1] + EPS) { const lim = b[1] - box[4]; if (lim < dy) { dy = lim; hit.y = true; } }
        else if (dy < 0 && box[1] >= b[4] - EPS) { const lim = b[4] - box[1]; if (lim > dy) { dy = lim; hit.y = true; } }
      }
    }
    box[1] += dy; box[4] += dy;
    // X
    for (const b of boxes) {
      if (box[1] < b[4] - EPS && box[4] > b[1] + EPS && box[2] < b[5] - EPS && box[5] > b[2] + EPS) {
        if (dx > 0 && box[3] <= b[0] + EPS) { const lim = b[0] - box[3]; if (lim < dx) { dx = lim; hit.x = true; } }
        else if (dx < 0 && box[0] >= b[3] - EPS) { const lim = b[3] - box[0]; if (lim > dx) { dx = lim; hit.x = true; } }
      }
    }
    box[0] += dx; box[3] += dx;
    // Z
    for (const b of boxes) {
      if (box[1] < b[4] - EPS && box[4] > b[1] + EPS && box[0] < b[3] - EPS && box[3] > b[0] + EPS) {
        if (dz > 0 && box[5] <= b[2] + EPS) { const lim = b[2] - box[5]; if (lim < dz) { dz = lim; hit.z = true; } }
        else if (dz < 0 && box[2] >= b[5] - EPS) { const lim = b[5] - box[2]; if (lim > dz) { dz = lim; hit.z = true; } }
      }
    }
    this.pos.x += dx; this.pos.y += dy; this.pos.z += dz;
    return hit;
  }

  updateEnvironment() {
    const w = this.world;
    const p = this.pos;
    const feet = w.getBlock(Math.floor(p.x), Math.floor(p.y + 0.1), Math.floor(p.z));
    const mid = w.getBlock(Math.floor(p.x), Math.floor(p.y + this.h * 0.5), Math.floor(p.z));
    const head = w.getBlock(Math.floor(p.x), Math.floor(p.y + this.h * 0.9), Math.floor(p.z));
    const isF = (id, f) => id > 0 && BLOCKS[id].fluid === f;
    this.inWater = isF(feet, 'water') || isF(mid, 'water');
    this.inLava = isF(feet, 'lava') || isF(mid, 'lava');
    this.headInWater = isF(head, 'water');
    this.onLadder = (feet > 0 && BLOCKS[feet].climbable) || (mid > 0 && BLOCKS[mid].climbable);
    this.inWeb = (feet > 0 && BLOCKS[feet].web) || (mid > 0 && BLOCKS[mid].web);
    this.feetBlock = feet;
  }

  // Generic physics step for mobs/items. Player overrides control but reuses move().
  physics(dt, drag = 0.91) {
    this.updateEnvironment();
    if (this.inWater || this.inLava) {
      this.vel.y -= this.gravity * 0.15 * dt;
      this.vel.multiplyScalar(Math.pow(0.5, dt * 4));
      this.fallDistance = 0;
    } else {
      this.vel.y -= this.gravity * dt;
    }
    if (this.vel.y < -60) this.vel.y = -60;
    if (this.inWeb) { this.vel.multiplyScalar(0.25); this.fallDistance = 0; }
    const prevY = this.pos.y;
    const hit = this.move(this.vel.x * dt, this.vel.y * dt, this.vel.z * dt);
    this.horizontalCollision = hit.x || hit.z;
    if (hit.x) this.vel.x = 0;
    if (hit.z) this.vel.z = 0;
    const wasOnGround = this.onGround;
    this.onGround = hit.y && this.vel.y < 0;
    if (hit.y) this.vel.y = 0;
    if (!this.onGround && this.pos.y < prevY) this.fallDistance += prevY - this.pos.y;
    if (this.onGround && !wasOnGround) { this.landed(this.fallDistance); this.fallDistance = 0; }
    else if (this.onGround) this.fallDistance = 0;
    if (this.onGround) {
      const f = Math.pow(1 - 0.6 * drag, dt * 20) ;
      this.vel.x *= f; this.vel.z *= f;
    } else {
      const f = Math.pow(0.98, dt * 20);
      this.vel.x *= f; this.vel.z *= f;
    }
  }

  landed() {}
}

const _boxes = [];
const _boxes2 = [];
