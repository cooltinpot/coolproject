// Builds chunk geometry: face culling, smooth lighting, ambient occlusion, special block shapes.
import * as THREE from 'three';
import { BLOCKS, OPAQUE, B, blockShapes } from '../blocks.js';
import { tileIndex } from '../textures.js';
import { CS, CH, idx } from './chunk.js';
import { BIOME_TINT } from './generator.js';

const PW = CS + 2; // padded width
const PH = CH + 2; // padded height (y = -1 .. CH)
const pidx = (x, y, z) => ((y + 1) * PW + (z + 1)) * PW + (x + 1);
const PSTRIDE_Y = PW * PW, PSTRIDE_Z = PW;

const pb = new Uint8Array(PW * PW * PH);
const pl = new Uint8Array(PW * PW * PH);
const pm = new Uint8Array(PW * PW * PH);

// Face definitions --------------------------------------------------------
const NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const FACE_SHADE = [0.6, 0.6, 1.0, 0.5, 0.8, 0.8];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const FACES = NORMALS.map((n, d) => {
  let up, right;
  if (d === 2) { right = [1, 0, 0]; up = [0, 0, -1]; }
  else if (d === 3) { right = [1, 0, 0]; up = [0, 0, 1]; }
  else { up = [0, 1, 0]; right = cross(up, n); }
  const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const corners = uvs.map(([u, v]) => [0, 1, 2].map((k) => 0.5 + n[k] * 0.5 + right[k] * (u - 0.5) + up[k] * (v - 0.5)));
  const axis = n[0] ? 0 : n[1] ? 1 : 2;
  const tang = [0, 1, 2].filter((a) => a !== axis);
  const off = (v) => v[1] * PSTRIDE_Y + v[2] * PSTRIDE_Z + v[0];
  const nOff = off(n);
  const ao = corners.map((c) => {
    const s1 = [0, 0, 0], s2 = [0, 0, 0];
    s1[tang[0]] = c[tang[0]] > 0.5 ? 1 : -1;
    s2[tang[1]] = c[tang[1]] > 0.5 ? 1 : -1;
    return [nOff + off(s1), nOff + off(s2), nOff + off(s1) + off(s2)];
  });
  return { n, d, up, right, corners, uvs, nOff, ao };
});

const AO_CURVE = [0.45, 0.65, 0.82, 1.0];
// facing meta -> face index showing the "front" texture
export const FACING_FACE = [4, 1, 5, 0];
// attachment meta (torches/ladders) -> direction of the supporting block
export const ATTACH_DIRS = [null, [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];

class Builder {
  constructor() { this.cap = 0; this.alloc(4096); this.reset(); }
  alloc(n) {
    const np = new Float32Array(n * 3), nu = new Float32Array(n * 2), nl = new Uint8Array(n), nc = new Uint8Array(n * 3), nli = new Uint8Array(n * 2);
    if (this.cap) { np.set(this.pos); nu.set(this.uv); nl.set(this.layer); nc.set(this.col); nli.set(this.light); }
    this.pos = np; this.uv = nu; this.layer = nl; this.col = nc; this.light = nli;
    this.cap = n;
    const ni = new Uint32Array(Math.floor(n * 1.5));
    if (this.idx) ni.set(this.idx.subarray(0, Math.min(this.idx.length, ni.length)));
    this.idx = ni;
  }
  reset() { this.vc = 0; this.ic = 0; }
  vert(x, y, z, u, v, layer, r, g, b, sky, blk) {
    if (this.vc >= this.cap) this.alloc(this.cap * 2);
    const i = this.vc++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.uv[i * 2] = u; this.uv[i * 2 + 1] = v;
    this.layer[i] = layer;
    this.col[i * 3] = r > 255 ? 255 : r; this.col[i * 3 + 1] = g > 255 ? 255 : g; this.col[i * 3 + 2] = b > 255 ? 255 : b;
    this.light[i * 2] = sky; this.light[i * 2 + 1] = blk;
    return i;
  }
  quad(a, b, c, d, flip) {
    if (this.ic + 6 > this.idx.length) { const ni = new Uint32Array(this.idx.length * 2); ni.set(this.idx); this.idx = ni; }
    const I = this.idx;
    if (flip) { I[this.ic++] = b; I[this.ic++] = c; I[this.ic++] = d; I[this.ic++] = b; I[this.ic++] = d; I[this.ic++] = a; }
    else { I[this.ic++] = a; I[this.ic++] = b; I[this.ic++] = c; I[this.ic++] = a; I[this.ic++] = c; I[this.ic++] = d; }
  }
  toGeometry() {
    if (this.vc === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, this.vc * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv.slice(0, this.vc * 2), 2));
    g.setAttribute('aLayer', new THREE.BufferAttribute(this.layer.slice(0, this.vc), 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col.slice(0, this.vc * 3), 3, true));
    g.setAttribute('aLight', new THREE.BufferAttribute(this.light.slice(0, this.vc * 2), 2, true));
    const ind = this.vc < 65536 ? new Uint16Array(this.idx.subarray(0, this.ic)) : this.idx.slice(0, this.ic);
    g.setIndex(new THREE.BufferAttribute(ind, 1));
    g.computeBoundingSphere();
    return g;
  }
}

const solidB = new Builder();
const transB = new Builder();

function fillPadding(world, chunk) {
  const maxY = Math.min(CH - 1, chunk.maxY + 1);
  // clear region
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const c = (dx === 0 && dz === 0) ? chunk : world.getChunk(chunk.cx + dx, chunk.cz + dz);
    const x0 = dx === -1 ? 15 : 0, x1 = dx === 1 ? 0 : (dx === -1 ? 15 : 15);
    const z0 = dz === -1 ? 15 : 0, z1 = dz === 1 ? 0 : (dz === -1 ? 15 : 15);
    for (let y = 0; y <= maxY + 1 && y < CH; y++) {
      for (let lz = z0; lz <= z1; lz++) for (let lx = x0; lx <= x1; lx++) {
        const px = dx * 16 + lx, pz = dz * 16 + lz;
        const p = pidx(px, y, pz);
        if (c) { const i = idx(lx, y, lz); pb[p] = c.blocks[i]; pl[p] = c.light[i]; pm[p] = c.meta[i]; }
        else { pb[p] = 0; pl[p] = 0xf0; pm[p] = 0; }
      }
    }
    // y = -1 bedrock, y = top+ fill sky
    for (let lz = z0; lz <= z1; lz++) for (let lx = x0; lx <= x1; lx++) {
      const px = dx * 16 + lx, pz = dz * 16 + lz;
      const p = pidx(px, -1, pz); pb[p] = B.BEDROCK; pl[p] = 0;
      const top = Math.min(CH, maxY + 2);
      for (let y = top; y <= CH; y++) { const q = pidx(px, y, pz); pb[q] = 0; pl[q] = 0xf0; pm[q] = 0; }
    }
  }
}

function fluidHeight(p, id) {
  if (pb[p] !== id) return -1;
  if (pb[p + PSTRIDE_Y] === id) return 1;
  const m = pm[p];
  if (m === 0 || m >= 8) return 0.89;
  return Math.max(0.12, (8 - m) / 9);
}

function cornerHeight(x, y, z, cx, cz, id) {
  // average heights of the 4 cells around this corner
  let sum = 0, n = 0;
  for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) {
    const p = pidx(x + cx + dx, y, z + cz + dz);
    if (pb[p] === id) {
      if (pb[p + PSTRIDE_Y] === id) return 1;
      sum += fluidHeight(p, id); n++;
    } else if (!OPAQUE[pb[p]] && pb[p] !== id) {
      sum += 0; n += 0.25;
    }
  }
  return n ? sum / n : 0.89;
}

export function buildChunkMesh(world, chunk) {
  fillPadding(world, chunk);
  solidB.reset();
  transB.reset();
  const maxY = Math.min(CH - 1, chunk.maxY + 1);
  for (let y = 0; y <= maxY; y++) for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
    const p = pidx(x, y, z);
    const id = pb[p];
    if (id === 0) continue;
    const def = BLOCKS[id];
    if (!def) continue;
    const biome = chunk.biomes[z * CS + x];
    switch (def.render) {
      case 'cube': cubeBlock(def, id, p, x, y, z, biome); break;
      case 'cross': crossBlock(def, p, x, y, z, biome); break;
      case 'fluid': fluidBlock(def, id, p, x, y, z); break;
      case 'box': boxBlock(def, p, x, y, z, def.box, null); break;
      case 'shape': {
        const shapes = blockShapes(id, pm[p]);
        let uvo = null;
        if (def.shape === 'door') {
          const L = tileIndex[pm[p] & 8 ? 'door_top' : 'door_bottom'];
          uvo = { layer: (d) => (d === 2 || d === 3 ? def.faces.top : L) };
        }
        for (const box of shapes) boxBlock(def, p, x, y, z, box, null, null, uvo);
        break;
      }
      case 'torch': torchBlock(def, p, x, y, z); break;
      case 'ladder': ladderBlock(def, p, x, y, z); break;
    }
  }
  return { solid: solidB.toGeometry(), trans: transB.toGeometry() };
}

function tintFor(def, d, biome) {
  if (def.tint === 'foliage' || def.tint === 'grass') return BIOME_TINT[biome];
  if (def.tint === 'birch') return [0.95, 1.0, 0.85];
  if (def.tint === 'spruce') return [0.9, 1.0, 0.95];
  if (def.tintTop && d === 2) return BIOME_TINT[biome];
  return null;
}

function faceLayer(def, d, p) {
  const f = def.faces;
  if (d === 2) return f.top;
  if (d === 3) return f.bottom;
  if (def.facing && FACING_FACE[pm[p] & 3] === d) return f.front;
  if (def.id === B.CRAFTING_TABLE && (d === 4 || d === 0)) return f.front;
  return f.side;
}

function cubeBlock(def, id, p, x, y, z, biome) {
  const translucent = def.layer === 'translucent';
  const builder = translucent ? transB : solidB;
  for (let d = 0; d < 6; d++) {
    const F = FACES[d];
    const np = p + F.nOff;
    const nid = pb[np];
    if (OPAQUE[nid]) continue;
    if (nid === id && (translucent || id === B.GLASS)) continue;
    if (translucent && BLOCKS[nid] && BLOCKS[nid].fluid === 'water' && d !== 2) continue;
    const layer = faceLayer(def, d, p);
    const tint = tintFor(def, d, biome);
    const shade = FACE_SHADE[d] * 255;
    const tr = tint ? tint[0] * shade : shade, tg = tint ? tint[1] * shade : shade, tb = tint ? tint[2] * shade : shade;
    const cl = pl[np];
    const csky = cl >> 4, cblk = cl & 15;
    const vs = [0, 0, 0, 0];
    const aos = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
      const [o1, o2, o3] = F.ao[k];
      const a = OPAQUE[pb[p + o1]], b = OPAQUE[pb[p + o2]], c = OPAQUE[pb[p + o3]];
      const ao = (a && b) ? 0 : 3 - (a + b + c);
      let ssum = csky, bsum = cblk, n = 1;
      if (!a) { const l = pl[p + o1]; ssum += l >> 4; bsum += l & 15; n++; }
      if (!b) { const l = pl[p + o2]; ssum += l >> 4; bsum += l & 15; n++; }
      if (!c && !(a && b)) { const l = pl[p + o3]; ssum += l >> 4; bsum += l & 15; n++; }
      const aof = AO_CURVE[ao];
      const cr = F.corners[k];
      const [u, v] = F.uvs[k];
      aos[k] = ao;
      vs[k] = builder.vert(x + cr[0], y + cr[1], z + cr[2], u, 1 - v, layer,
        tr * aof, tg * aof, tb * aof, (ssum / n) * 17, (bsum / n) * 17);
    }
    builder.quad(vs[0], vs[1], vs[2], vs[3], aos[0] + aos[2] < aos[1] + aos[3]);
  }
}

function crossBlock(def, p, x, y, z, biome) {
  const layer = def.stageLayers ? def.stageLayers[pm[p] & 7] : def.faces.side;
  const l = pl[p];
  const sky = (l >> 4) * 17, blk = (l & 15) * 17;
  const tint = def.tint ? BIOME_TINT[biome] : null;
  const c = 235;
  const r = tint ? tint[0] * c : c, g = tint ? tint[1] * c : c, b = tint ? tint[2] * c : c;
  const e = 0.15, f = 0.85;
  const planes = [[x + e, z + e, x + f, z + f], [x + e, z + f, x + f, z + e]];
  for (const [x0, z0, x1, z1] of planes) {
    const a = solidB.vert(x0, y, z0, 0, 1, layer, r, g, b, sky, blk);
    const bb = solidB.vert(x1, y, z1, 1, 1, layer, r, g, b, sky, blk);
    const cc = solidB.vert(x1, y + 1, z1, 1, 0, layer, r, g, b, sky, blk);
    const d = solidB.vert(x0, y + 1, z0, 0, 0, layer, r, g, b, sky, blk);
    solidB.quad(a, bb, cc, d, false);
    solidB.quad(bb, a, d, cc, false);
  }
}

// Generic axis-aligned box (in 1/16 units). uvOverride(d) -> [u0,v0,u1,v1] in tex space optional.
function boxBlock(def, p, x, y, z, box, uvOverride, offset, opts) {
  const [x0, y0, z0, x1, y1, z1] = box.map((v) => v / 16);
  const ox = offset ? offset[0] : 0, oy = offset ? offset[1] : 0, oz = offset ? offset[2] : 0;
  const own = pl[p];
  for (let d = 0; d < 6; d++) {
    const F = FACES[d];
    const n = F.n;
    const onBoundary = (n[0] === 1 && x1 === 1) || (n[0] === -1 && x0 === 0) || (n[1] === 1 && y1 === 1) ||
      (n[1] === -1 && y0 === 0) || (n[2] === 1 && z1 === 1) || (n[2] === -1 && z0 === 0);
    let l = own;
    if (onBoundary) {
      const nid = pb[p + F.nOff];
      if (OPAQUE[nid]) continue;
      l = pl[p + F.nOff];
    }
    if (n[1] === -1 && y0 === 0 && !onBoundary) l = own;
    const sky = (l >> 4) * 17, blk = (l & 15) * 17;
    const layer = opts && opts.layer ? opts.layer(d) : faceLayer(def, d, p);
    const shade = FACE_SHADE[d] * 255;
    const vs = [];
    let uvr = uvOverride ? uvOverride(d) : null;
    for (let k = 0; k < 4; k++) {
      const c = F.corners[k];
      const px = c[0] ? x1 : x0, py = c[1] ? y1 : y0, pz = c[2] ? z1 : z0;
      let u, v;
      if (uvr) {
        const [uu, vv] = F.uvs[k];
        u = uvr[0] + (uvr[2] - uvr[0]) * uu; v = uvr[1] + (uvr[3] - uvr[1]) * (1 - vv);
      } else {
        const rel = [px - 0.5, py - 0.5, pz - 0.5];
        u = dot(rel, F.right) + 0.5;
        v = 1 - (dot(rel, F.up) + 0.5);
      }
      vs.push(solidB.vert(x + px + ox, y + py + oy, z + pz + oz, u, v, layer, shade, shade, shade, sky, blk));
    }
    solidB.quad(vs[0], vs[1], vs[2], vs[3], false);
  }
}

function torchBlock(def, p, x, y, z) {
  const m = pm[p];
  let offset = null;
  if (m >= 1 && m <= 4) {
    const dir = ATTACH_DIRS[m];
    offset = [dir[0] * 0.32, 0.2, dir[2] * 0.32];
  }
  boxBlock(def, p, x, y, z, [7, 0, 7, 9, 10, 9], (d) => {
    if (d === 2) return [7 / 16, 6 / 16, 9 / 16, 8 / 16];
    if (d === 3) return [7 / 16, 14 / 16, 9 / 16, 16 / 16];
    return [7 / 16, 6 / 16, 9 / 16, 1];
  }, offset);
}

function ladderBlock(def, p, x, y, z) {
  const m = pm[p] || 3;
  const dir = ATTACH_DIRS[m] || [0, 0, 1];
  const layer = def.faces.side;
  const l = pl[p];
  const sky = (l >> 4) * 17, blk = (l & 15) * 17;
  const e = 0.94;
  let pts;
  if (dir[0] === 1) pts = [[e, 0, 0], [e, 0, 1], [e, 1, 1], [e, 1, 0]];
  else if (dir[0] === -1) pts = [[1 - e, 0, 1], [1 - e, 0, 0], [1 - e, 1, 0], [1 - e, 1, 1]];
  else if (dir[2] === 1) pts = [[1, 0, e], [0, 0, e], [0, 1, e], [1, 1, e]];
  else pts = [[0, 0, 1 - e], [1, 0, 1 - e], [1, 1, 1 - e], [0, 1, 1 - e]];
  const uvs = [[0, 1], [1, 1], [1, 0], [0, 0]];
  const vs = pts.map((pt, k) => solidB.vert(x + pt[0], y + pt[1], z + pt[2], uvs[k][0], uvs[k][1], layer, 220, 220, 220, sky, blk));
  solidB.quad(vs[0], vs[1], vs[2], vs[3], false);
  solidB.quad(vs[1], vs[0], vs[3], vs[2], false);
}

function fluidBlock(def, id, p, x, y, z) {
  const builder = def.fluid === 'water' ? transB : solidB;
  const layer = def.faces.side;
  const above = pb[p + PSTRIDE_Y];
  const full = above === id;
  const h00 = full ? 1 : cornerHeight(x, y, z, 0, 0, id);
  const h10 = full ? 1 : cornerHeight(x, y, z, 1, 0, id);
  const h11 = full ? 1 : cornerHeight(x, y, z, 1, 1, id);
  const h01 = full ? 1 : cornerHeight(x, y, z, 0, 1, id);
  const H = (cx, cz) => (cx ? (cz ? h11 : h10) : (cz ? h01 : h00));
  const own = pl[p];
  const lava = def.fluid === 'lava';
  for (let d = 0; d < 6; d++) {
    const F = FACES[d];
    const np = p + F.nOff;
    const nid = pb[np];
    if (nid === id) continue;
    if (OPAQUE[nid] && d !== 2) continue;
    if (d === 2 && full) continue;
    if (!lava && BLOCKS[nid] && BLOCKS[nid].layer === 'translucent' && d !== 2) continue;
    const l = OPAQUE[nid] ? own : Math.max(pl[np], own) === own ? own : pl[np];
    const sky = Math.max(l >> 4, own >> 4) * 17, blk = Math.max(l & 15, own & 15) * 17;
    const shade = (lava ? 1 : FACE_SHADE[d]) * 255;
    const vs = [];
    for (let k = 0; k < 4; k++) {
      const c = F.corners[k];
      const py = c[1] ? H(c[0], c[2]) : 0;
      const [u, v] = F.uvs[k];
      const vv = d === 2 || d === 3 ? 1 - v : 1 - (c[1] ? py : 0);
      vs.push(builder.vert(x + c[0], y + py, z + c[2], u, vv, layer, shade, shade, shade, sky, lava ? 255 : blk));
    }
    builder.quad(vs[0], vs[1], vs[2], vs[3], false);
    if (d === 2 && !lava) builder.quad(vs[1], vs[0], vs[3], vs[2], false); // visible from below the surface
  }
}
