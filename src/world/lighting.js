// Flood-fill sky + block lighting across loaded chunks (Minecraft-style, levels 0..15).
import { OPAQUE, LIGHT_EMIT, LIGHT_FILTER } from '../blocks.js';
import { CS, CH, idx } from './chunk.js';

const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const SKY = 1, BLK = 0;

class Queue {
  constructor() { this.buf = new Int32Array(3 * 65536); this.head = 0; this.tail = 0; }
  push(x, y, z) {
    if (this.tail + 3 > this.buf.length) {
      if (this.head > 0) { this.buf.copyWithin(0, this.head, this.tail); this.tail -= this.head; this.head = 0; }
      if (this.tail + 3 > this.buf.length) { const nb = new Int32Array(this.buf.length * 2); nb.set(this.buf); this.buf = nb; }
    }
    this.buf[this.tail++] = x; this.buf[this.tail++] = y; this.buf[this.tail++] = z;
  }
  get empty() { return this.head >= this.tail; }
  reset() { this.head = 0; this.tail = 0; }
}

class RemQueue {
  constructor() { this.buf = new Int32Array(4 * 16384); this.head = 0; this.tail = 0; }
  push(x, y, z, l) {
    if (this.tail + 4 > this.buf.length) {
      if (this.head > 0) { this.buf.copyWithin(0, this.head, this.tail); this.tail -= this.head; this.head = 0; }
      if (this.tail + 4 > this.buf.length) { const nb = new Int32Array(this.buf.length * 2); nb.set(this.buf); this.buf = nb; }
    }
    this.buf[this.tail++] = x; this.buf[this.tail++] = y; this.buf[this.tail++] = z; this.buf[this.tail++] = l;
  }
  get empty() { return this.head >= this.tail; }
  reset() { this.head = 0; this.tail = 0; }
}

export class Lighting {
  constructor(world) {
    this.world = world;
    this.q = [new Queue(), new Queue()];
    this.rq = new RemQueue();
    this._lc = null;
  }

  chunkAt(wx, wz) {
    const cx = wx >> 4, cz = wz >> 4;
    const lc = this._lc;
    if (lc && lc.cx === cx && lc.cz === cz) return lc;
    const c = this.world.getChunk(cx, cz);
    if (c) this._lc = c;
    return c;
  }

  markDirty(c, lx, lz) {
    c.meshDirty = true;
    const w = this.world;
    const ex = lx === 0 ? -1 : lx === 15 ? 1 : 0;
    const ez = lz === 0 ? -1 : lz === 15 ? 1 : 0;
    if (ex) w.markChunkDirty(c.cx + ex, c.cz);
    if (ez) w.markChunkDirty(c.cx, c.cz + ez);
    if (ex && ez) w.markChunkDirty(c.cx + ex, c.cz + ez);
  }

  getLevel(wx, y, wz, ch) {
    if (y >= CH) return ch === SKY ? 15 : 0;
    if (y < 0) return 0;
    const c = this.chunkAt(wx, wz);
    if (!c) return 0;
    const v = c.light[idx(wx & 15, y, wz & 15)];
    return ch === SKY ? v >> 4 : v & 15;
  }

  propagate(ch, markDirty = true) {
    const q = this.q[ch];
    const buf = () => q.buf;
    while (q.head < q.tail) {
      const b = buf();
      const x = b[q.head++], y = b[q.head++], z = b[q.head++];
      const c = this.chunkAt(x, z);
      if (!c) continue;
      const v = c.light[idx(x & 15, y, z & 15)];
      const level = ch === SKY ? v >> 4 : v & 15;
      if (level <= 1) continue;
      for (let d = 0; d < 6; d++) {
        const D = DIRS[d];
        const ny = y + D[1];
        if (ny < 0 || ny >= CH) continue;
        const nx = x + D[0], nz = z + D[2];
        const nc = (D[0] === 0 && D[2] === 0) ? c : this.chunkAt(nx, nz);
        if (!nc) continue;
        const ni = idx(nx & 15, ny, nz & 15);
        const id = nc.blocks[ni];
        if (OPAQUE[id]) continue;
        const f = LIGHT_FILTER[id];
        let nl = level - 1 - f;
        if (ch === SKY && d === 3 && level === 15 && f === 0) nl = 15;
        if (nl <= 0) continue;
        const nv = nc.light[ni];
        const cur = ch === SKY ? nv >> 4 : nv & 15;
        if (nl > cur) {
          nc.light[ni] = ch === SKY ? (nv & 15) | (nl << 4) : (nv & 0xf0) | nl;
          if (markDirty) this.markDirty(nc, nx & 15, nz & 15);
          q.push(nx, ny, nz);
        }
      }
    }
    q.reset();
  }

  remove(wx, wy, wz, ch) {
    const c = this.chunkAt(wx, wz);
    if (!c) return;
    const i = idx(wx & 15, wy, wz & 15);
    const v = c.light[i];
    const old = ch === SKY ? v >> 4 : v & 15;
    if (old === 0) return;
    c.light[i] = ch === SKY ? v & 15 : v & 0xf0;
    this.markDirty(c, wx & 15, wz & 15);
    const rq = this.rq, pq = this.q[ch];
    rq.push(wx, wy, wz, old);
    while (rq.head < rq.tail) {
      const b = rq.buf;
      const x = b[rq.head++], y = b[rq.head++], z = b[rq.head++], l = b[rq.head++];
      for (let d = 0; d < 6; d++) {
        const D = DIRS[d];
        const ny = y + D[1];
        if (ny < 0 || ny >= CH) continue;
        const nx = x + D[0], nz = z + D[2];
        const nc = this.chunkAt(nx, nz);
        if (!nc) continue;
        const ni = idx(nx & 15, ny, nz & 15);
        const nv = nc.light[ni];
        const nl = ch === SKY ? nv >> 4 : nv & 15;
        if (nl === 0) continue;
        if (nl < l || (ch === SKY && d === 3 && l === 15 && nl === 15)) {
          nc.light[ni] = ch === SKY ? nv & 15 : nv & 0xf0;
          this.markDirty(nc, nx & 15, nz & 15);
          rq.push(nx, ny, nz, nl);
        } else {
          pq.push(nx, ny, nz);
        }
      }
    }
    rq.reset();
  }

  // Called once when a chunk's blocks are ready.
  initChunk(chunk) {
    const { blocks, light } = chunk;
    light.fill(0);
    const bx = chunk.cx * CS, bz = chunk.cz * CS;
    const top = new Int16Array(CS * CS); // first non-clear block from top
    let maxTop = 0;
    const hasSky = this.world.hasSky;
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      let y = CH - 1;
      if (!hasSky) { top[z * CS + x] = CH - 1; continue; }
      for (; y >= 0; y--) {
        const id = blocks[idx(x, y, z)];
        if (OPAQUE[id] || LIGHT_FILTER[id]) break;
        light[idx(x, y, z)] = 0xf0;
      }
      top[z * CS + x] = y;
      if (y > maxTop) maxTop = y;
    }
    const sq = this.q[SKY];
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const t = top[z * CS + x];
      let m = t;
      const border = x === 0 || z === 0 || x === CS - 1 || z === CS - 1;
      if (border) m = maxTop;
      else {
        m = Math.max(m, top[z * CS + x + 1], top[z * CS + x - 1], top[(z + 1) * CS + x], top[(z - 1) * CS + x]);
      }
      for (let y = t + 1; y <= Math.min(CH - 1, m + 1); y++) sq.push(bx + x, y, bz + z);
    }
    // block light emitters
    const bq = this.q[BLK];
    for (let y = 0; y <= chunk.maxY; y++) for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const i = idx(x, y, z);
      const e = LIGHT_EMIT[blocks[i]];
      if (e) { light[i] = (light[i] & 0xf0) | e; bq.push(bx + x, y, bz + z); }
    }
    // pull light from loaded neighbours
    const nbs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dx, dz] of nbs) {
      const n = this.world.getChunk(chunk.cx + dx, chunk.cz + dz);
      if (!n) continue;
      const ylim = Math.min(CH - 1, Math.max(n.maxY, chunk.maxY) + 2);
      for (let y = 0; y <= ylim; y++) for (let k = 0; k < CS; k++) {
        const lx = dx === -1 ? 15 : dx === 1 ? 0 : k;
        const lz = dz === -1 ? 15 : dz === 1 ? 0 : k;
        const v = n.light[idx(lx, y, lz)];
        const wx = n.cx * CS + lx, wz = n.cz * CS + lz;
        if ((v >> 4) > 1) sq.push(wx, y, wz);
        if ((v & 15) > 1) bq.push(wx, y, wz);
      }
      // and our border into them (covers overhangs in the neighbour)
      const ourX = dx === -1 ? 0 : dx === 1 ? 15 : -1;
      const ourZ = dz === -1 ? 0 : dz === 1 ? 15 : -1;
      for (let k = 0; k < CS; k++) {
        const lx = ourX >= 0 ? ourX : k, lz = ourZ >= 0 ? ourZ : k;
        for (let y = top[lz * CS + lx] + 1; y <= ylim; y++) sq.push(bx + lx, y, bz + lz);
      }
    }
    this._lc = null;
    this.propagate(SKY);
    this.propagate(BLK);
    chunk.lit = true;
  }

  onBlockChanged(wx, wy, wz, oldId, newId) {
    this._lc = null;
    for (const ch of this.world.hasSky ? [BLK, SKY] : [BLK]) {
      const cur = this.getLevel(wx, wy, wz, ch);
      if (cur > 0) this.remove(wx, wy, wz, ch);
      const q = this.q[ch];
      if (ch === BLK) {
        const e = LIGHT_EMIT[newId];
        if (e) {
          const c = this.chunkAt(wx, wz);
          const i = idx(wx & 15, wy, wz & 15);
          c.light[i] = (c.light[i] & 0xf0) | e;
          q.push(wx, wy, wz);
        }
      }
      if (!OPAQUE[newId]) {
        for (const D of DIRS) {
          const ny = wy + D[1];
          if (ny < 0) continue;
          if (ny >= CH) {
            if (ch === SKY) {
              // top of world: open sky
              const c = this.chunkAt(wx, wz);
              const i = idx(wx & 15, wy, wz & 15);
              const f = LIGHT_FILTER[newId];
              c.light[i] = (c.light[i] & 15) | ((15 - f) << 4);
              q.push(wx, wy, wz);
            }
            continue;
          }
          q.push(wx + D[0], ny, wz + D[2]);
        }
      }
      this.propagate(ch);
    }
  }
}
