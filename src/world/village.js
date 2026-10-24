// Village planning and stamping. A village is planned per 320x320 region from the world seed,
// so every chunk can independently stamp the parts of the village that fall inside it.
import { B } from '../blocks.js';
import { hash2 } from '../noise.js';
import { CS, CH, SEA, idx } from './chunk.js';
import { BIOME } from './generator.js';

export const REGION = 320;
const cache = new Map();

export function planVillage(gen, rx, rz) {
  const key = `${gen.seed},${rx},${rz}`;
  if (cache.has(key)) return cache.get(key);
  let plan = null;
  const s = gen.seed;
  if (hash2(rx, rz, s + 777) < 0.45) {
    const cx = rx * REGION + 64 + Math.floor(hash2(rx, rz, s + 778) * (REGION - 128));
    const cz = rz * REGION + 64 + Math.floor(hash2(rx, rz, s + 779) * (REGION - 128));
    const col = gen.column(cx, cz);
    if ((col.biome === BIOME.PLAINS || col.biome === BIOME.DESERT) && col.h > SEA + 1) {
      plan = { cx, cz, y: col.h + 1, desert: col.biome === BIOME.DESERT, houses: [], farms: [] };
      const n = 4 + Math.floor(hash2(rx, rz, s + 780) * 4);
      const boxes = [[cx - 4, cz - 4, cx + 4, cz + 4]];
      const free = (x0, z0, x1, z1) => boxes.every((b) => x1 + 2 < b[0] || x0 - 2 > b[2] || z1 + 2 < b[1] || z0 - 2 > b[3]);
      for (let i = 0; i < n + 2; i++) {
        const farm = i >= n;
        const a = (i / (n + 2)) * Math.PI * 2 + hash2(rx + i, rz, s + 781) * 0.6;
        const dist = (farm ? 22 : 11) + hash2(rx, rz + i, s + 782) * 9;
        const hx = cx + Math.round(Math.cos(a) * dist), hz = cz + Math.round(Math.sin(a) * dist);
        const w = farm ? 7 : (hash2(hx, hz, s + 783) < 0.5 ? 5 : 7), d = farm ? 9 : 5;
        const x0 = hx - (w >> 1), z0 = hz - (d >> 1);
        const g = gen.column(hx, hz);
        if (g.h <= SEA || Math.abs(g.h - col.h) > 6) continue;
        if (!free(x0, z0, x0 + w - 1, z0 + d - 1)) continue;
        boxes.push([x0, z0, x0 + w - 1, z0 + d - 1]);
        const dx = cx - hx, dz = cz - hz;
        const door = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'e' : 'w') : (dz > 0 ? 's' : 'n');
        (farm ? plan.farms : plan.houses).push({ x: x0, z: z0, w, d, y: g.h + 1, door, hx, hz });
      }
      plan.radius = 48;
    }
  }
  cache.set(key, plan);
  return plan;
}

export function villagesNear(gen, x, z) {
  const rx = Math.floor(x / REGION), rz = Math.floor(z / REGION);
  const out = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const v = planVillage(gen, rx + dx, rz + dz);
    if (v) out.push(v);
  }
  return out;
}

export function inVillage(gen, x, z) {
  for (const v of villagesNear(gen, x, z)) if (Math.abs(x - v.cx) < v.radius && Math.abs(z - v.cz) < v.radius) return true;
  return false;
}

export function stampVillages(gen, chunk) {
  const bx = chunk.cx * CS, bz = chunk.cz * CS;
  for (const v of villagesNear(gen, bx + 8, bz + 8)) {
    if (bx + CS < v.cx - v.radius || bx > v.cx + v.radius || bz + CS < v.cz - v.radius || bz > v.cz + v.radius) continue;
    stamp(gen, chunk, v);
  }
}

function stamp(gen, chunk, v) {
  const bx = chunk.cx * CS, bz = chunk.cz * CS;
  const blocks = chunk.blocks, metas = chunk.meta;
  const inside = (x, z) => x >= bx && x < bx + CS && z >= bz && z < bz + CS;
  const set = (x, y, z, id, meta = 0) => {
    if (!inside(x, z) || y < 1 || y >= CH) return;
    const i = idx(x - bx, y, z - bz);
    blocks[i] = id; metas[i] = meta;
  };
  const get = (x, y, z) => (inside(x, z) ? blocks[idx(x - bx, y, z - bz)] : -1);
  const wallMat = v.desert ? B.SANDSTONE : B.PLANKS;
  const floorMat = v.desert ? B.SANDSTONE : B.COBBLE;
  const cornerMat = v.desert ? B.SANDSTONE : B.OAK_LOG;
  const pathMat = v.desert ? B.SANDSTONE : B.GRAVEL;
  const roofMat = v.desert ? B.STONE_SLAB : B.OAK_SLAB;

  // paths from the well to each building's door
  const path = (x0, z0, x1, z1) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + (x1 - x0) * i / n), z = Math.round(z0 + (z1 - z0) * i / n);
      for (const [ox, oz] of [[0, 0], [1, 0], [0, 1]]) {
        const px = x + ox, pz = z + oz;
        if (!inside(px, pz)) continue;
        const h = gen.column(px, pz).h;
        if (h <= SEA) continue;
        const top = get(px, h, pz);
        if (top === B.WATER) continue;
        set(px, h, pz, pathMat);
        for (let y = h + 1; y < h + 4; y++) { const b = get(px, y, pz); if (b !== B.OAK_LOG && b !== 0 && b !== B.PLANKS && b !== B.COBBLE && b !== B.SANDSTONE) set(px, y, pz, 0); }
      }
    }
  };
  const doorPos = (h) => {
    const mx = h.x + (h.w >> 1), mz = h.z + (h.d >> 1);
    if (h.door === 'n') return [mx, h.z];
    if (h.door === 's') return [mx, h.z + h.d - 1];
    if (h.door === 'w') return [h.x, mz];
    return [h.x + h.w - 1, mz];
  };
  for (const h of [...v.houses, ...v.farms]) {
    const [dx, dz] = doorPos(h);
    const ox = h.door === 'w' ? -1 : h.door === 'e' ? 1 : 0, oz = h.door === 'n' ? -1 : h.door === 's' ? 1 : 0;
    path(v.cx, v.cz, dx + ox, dz + oz);
  }

  // well
  {
    const y = v.y - 1;
    for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) {
      const wx = v.cx + x, wz = v.cz + z;
      for (let yy = y - 4; yy < y; yy++) set(wx, yy, wz, B.COBBLE);
      const edge = x === -2 || x === 1 || z === -2 || z === 1;
      if (edge) { set(wx, y, wz, B.COBBLE); set(wx, y + 1, wz, B.COBBLE); }
      else { for (let yy = y - 3; yy <= y; yy++) set(wx, yy, wz, B.WATER); set(wx, y + 1, wz, 0); }
      for (let yy = y + 2; yy <= y + 4; yy++) set(wx, yy, wz, 0);
      if ((x === -2 || x === 1) && (z === -2 || z === 1)) { set(wx, y + 2, wz, B.OAK_LOG); set(wx, y + 3, wz, B.OAK_LOG); }
      set(wx, y + 4, wz, B.COBBLE_SLAB);
    }
  }

  // houses
  for (const h of v.houses) {
    const y = h.y;
    for (let x = -1; x <= h.w; x++) for (let z = -1; z <= h.d; z++) {
      const wx = h.x + x, wz = h.z + z;
      if (!inside(wx, wz)) continue;
      const inner = x >= 0 && x < h.w && z >= 0 && z < h.d;
      // foundation
      if (inner) {
        for (let yy = y - 1; yy > 1 && (yy === y - 1 || get(wx, yy, wz) === 0 || get(wx, yy, wz) === B.WATER); yy--) set(wx, yy, wz, floorMat);
      }
      for (let yy = y; yy < y + 7; yy++) set(wx, yy, wz, 0);
      if (!inner) { set(wx, y + 3, wz, roofMat); continue; }
      const edgeX = x === 0 || x === h.w - 1, edgeZ = z === 0 || z === h.d - 1;
      if (edgeX || edgeZ) {
        const corner = edgeX && edgeZ;
        for (let yy = y; yy < y + 3; yy++) set(wx, yy, wz, corner ? cornerMat : wallMat);
        const midX = x === (h.w >> 1), midZ = z === (h.d >> 1);
        if (!corner && (midX || midZ)) set(wx, y + 1, wz, B.GLASS);
      }
      set(wx, y + 3, wz, edgeX || edgeZ ? wallMat : roofMat);
    }
    const [dx, dz] = doorPos(h);
    const facing = h.door === 'n' || h.door === 's' ? 0 : 1;
    set(dx, y, dz, B.OAK_DOOR, facing);
    set(dx, y + 1, dz, B.OAK_DOOR, facing | 8);
    // furniture
    set(h.x + 1, y, h.z + 1, B.CRAFTING_TABLE);
    set(h.x + h.w - 2, y, h.z + h.d - 2, B.BED);
    set(h.x + (h.w >> 1), y + 3, h.z + (h.d >> 1), B.GLOWSTONE);
  }

  // farms: log border, farmland with wheat, water channel down the middle
  for (const f of v.farms) {
    const y = f.y - 1;
    for (let x = 0; x < f.w; x++) for (let z = 0; z < f.d; z++) {
      const wx = f.x + x, wz = f.z + z;
      if (!inside(wx, wz)) continue;
      for (let yy = y - 1; yy > 1 && get(wx, yy, wz) === 0; yy--) set(wx, yy, wz, B.DIRT);
      for (let yy = y + 1; yy < y + 4; yy++) set(wx, yy, wz, 0);
      const edge = x === 0 || x === f.w - 1 || z === 0 || z === f.d - 1;
      if (edge) set(wx, y, wz, B.OAK_LOG);
      else if (x === (f.w >> 1)) set(wx, y, wz, B.WATER);
      else {
        set(wx, y, wz, B.FARMLAND);
        set(wx, y + 1, wz, B.WHEAT, 2 + Math.floor(hash2(wx, wz, gen.seed + 5) * 6));
      }
    }
  }
}
