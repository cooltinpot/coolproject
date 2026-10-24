import { SimplexNoise, makeRng, hash2 } from '../noise.js';
import { B } from '../blocks.js';
import { CS, CH, SEA, idx } from './chunk.js';

export const BIOME = { OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, DESERT: 4, SNOWY: 5, MOUNTAINS: 6, FROZEN_OCEAN: 7, NETHER: 8 };
export const BIOME_NAMES = ['Ocean', 'Beach', 'Plains', 'Forest', 'Desert', 'Snowy Tundra', 'Mountains', 'Frozen Ocean', 'Nether'];
// grass / foliage tint per biome
export const BIOME_TINT = [
  [0.85, 1.0, 0.85], [0.95, 1.0, 0.8], [1.0, 1.0, 1.0], [0.82, 0.95, 0.8], [1.15, 1.0, 0.6],
  [0.8, 0.95, 0.95], [0.85, 0.95, 0.9], [0.8, 0.95, 0.95], [0.9, 0.8, 0.6],
];

const CAVE_STEP = 4;

export class Generator {
  constructor(seed) {
    this.seed = seed | 0;
    this.cont = new SimplexNoise(seed + 1);
    this.mount = new SimplexNoise(seed + 2);
    this.detail = new SimplexNoise(seed + 3);
    this.temp = new SimplexNoise(seed + 4);
    this.humid = new SimplexNoise(seed + 5);
    this.cave1 = new SimplexNoise(seed + 6);
    this.cave2 = new SimplexNoise(seed + 7);
    this.cave3 = new SimplexNoise(seed + 8);
    this.misc = new SimplexNoise(seed + 9);
  }

  column(wx, wz) {
    const c = this.cont.fbm2(wx / 700, wz / 700, 4);
    const mraw = this.mount.fbm2(wx / 260, wz / 260, 3);
    const inland = smoothstep(-0.05, 0.25, c);
    const m = Math.pow(Math.max(0, mraw + 0.05), 1.6) * 95 * inland;
    const d = this.detail.fbm2(wx / 50, wz / 50, 3) * 4 + this.detail.noise2(wx / 14, wz / 14) * 1.2;
    let h = SEA + 3 + c * 34 + m + d;
    h = Math.max(6, Math.min(CH - 6, Math.floor(h)));
    const t = this.temp.fbm2(wx / 900, wz / 900, 2) - (h > 95 ? (h - 95) / 40 : 0);
    const u = this.humid.fbm2(wx / 750 + 50, wz / 750, 2);
    let biome;
    if (h < SEA - 1) biome = t < -0.32 ? BIOME.FROZEN_OCEAN : BIOME.OCEAN;
    else if (h <= SEA + 1 && m < 4) biome = t < -0.32 ? BIOME.SNOWY : BIOME.BEACH;
    else if (m > 22) biome = BIOME.MOUNTAINS;
    else if (t > 0.28 && u < 0.05) biome = BIOME.DESERT;
    else if (t < -0.32) biome = BIOME.SNOWY;
    else if (u > 0.1) biome = BIOME.FOREST;
    else biome = BIOME.PLAINS;
    return { h, biome, t, u };
  }

  caveSample(x, y, z) {
    const a = this.cave1.noise3(x / 42, y / 22, z / 42);
    const b = this.cave2.noise3(x / 42, y / 22, z / 42);
    const spaghetti = a * a + b * b; // carve when small
    const cheese = this.cave3.noise3(x / 70, y / 34, z / 70);
    return [spaghetti, cheese];
  }

  isCave(spag, cheese, y, h, underwater) {
    if (y < 5) return false;
    if (underwater && y > h - 5) return false;
    if (y > h) return false;
    const depthFactor = y > h - 6 ? 0.6 : 1; // fewer surface openings
    if (spag < 0.011 * depthFactor) return true;
    if (y < 48 && cheese > 0.62) return true;
    return false;
  }

  // Pointwise cave test using the same lattice interpolation as chunk generation.
  caveAt(wx, y, wz, h, underwater) {
    const x0 = Math.floor(wx / CAVE_STEP) * CAVE_STEP, y0 = Math.floor(y / CAVE_STEP) * CAVE_STEP, z0 = Math.floor(wz / CAVE_STEP) * CAVE_STEP;
    const fx = (wx - x0) / CAVE_STEP, fy = (y - y0) / CAVE_STEP, fz = (wz - z0) / CAVE_STEP;
    let s = 0, c = 0;
    for (let i = 0; i < 8; i++) {
      const dx = i & 1, dy = (i >> 1) & 1, dz = (i >> 2) & 1;
      const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
      const [a, b] = this.caveSample(x0 + dx * CAVE_STEP, y0 + dy * CAVE_STEP, z0 + dz * CAVE_STEP);
      s += a * w; c += b * w;
    }
    return this.isCave(s, c, y, h, underwater);
  }

  generate(chunk) {
    const { cx, cz } = chunk;
    const bx = cx * CS, bz = cz * CS;
    const blocks = chunk.blocks;
    const rng = makeRng((this.seed * 31 + cx * 73856093) ^ (cz * 19349663));

    // Columns for chunk + 3 block margin (for trees)
    const M = 3, W = CS + M * 2;
    const cols = new Array(W * W);
    for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) cols[z * W + x] = this.column(bx + x - M, bz + z - M);
    const col = (lx, lz) => cols[(lz + M) * W + lx + M];

    // Cave lattice
    const NX = CS / CAVE_STEP + 1, NY = CH / CAVE_STEP + 1;
    const spagL = new Float32Array(NX * NX * NY), cheeseL = new Float32Array(NX * NX * NY);
    let maxH = 0;
    for (let i = 0; i < CS * CS; i++) maxH = Math.max(maxH, col(i & 15, i >> 4).h);
    const maxLy = Math.min(NY - 1, Math.ceil((maxH + 1) / CAVE_STEP));
    for (let ly = 0; ly <= maxLy; ly++) for (let lz = 0; lz < NX; lz++) for (let lx = 0; lx < NX; lx++) {
      const [a, b] = this.caveSample(bx + lx * CAVE_STEP, ly * CAVE_STEP, bz + lz * CAVE_STEP);
      const i = (ly * NX + lz) * NX + lx;
      spagL[i] = a; cheeseL[i] = b;
    }
    const lerpL = (arr, x, y, z) => {
      const lx = x >> 2, ly = y >> 2, lz = z >> 2;
      const fx = (x & 3) / 4, fy = (y & 3) / 4, fz = (z & 3) / 4;
      const i000 = (ly * NX + lz) * NX + lx;
      const i100 = i000 + 1, i010 = i000 + NX * NX, i110 = i010 + 1;
      const i001 = i000 + NX, i101 = i001 + 1, i011 = i010 + NX, i111 = i011 + 1;
      const c00 = arr[i000] * (1 - fx) + arr[i100] * fx;
      const c01 = arr[i001] * (1 - fx) + arr[i101] * fx;
      const c10 = arr[i010] * (1 - fx) + arr[i110] * fx;
      const c11 = arr[i011] * (1 - fx) + arr[i111] * fx;
      const c0 = c00 * (1 - fz) + c01 * fz;
      const c1 = c10 * (1 - fz) + c11 * fz;
      return c0 * (1 - fy) + c1 * fy;
    };

    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const { h, biome, t } = col(x, z);
      chunk.biomes[z * CS + x] = biome;
      const wx = bx + x, wz = bz + z;
      const underwater = h < SEA;
      const fillerDepth = 3 + Math.floor(hash2(wx, wz, this.seed) * 2);
      let top, filler, deep = B.STONE;
      switch (biome) {
        case BIOME.DESERT: top = B.SAND; filler = B.SAND; deep = B.SANDSTONE; break;
        case BIOME.BEACH: top = B.SAND; filler = B.SAND; deep = B.SANDSTONE; break;
        case BIOME.SNOWY: top = B.SNOWY_GRASS; filler = B.DIRT; break;
        case BIOME.OCEAN: case BIOME.FROZEN_OCEAN: {
          const n = this.misc.noise2(wx / 20, wz / 20);
          top = n > 0.45 ? B.CLAY : n < -0.3 ? B.GRAVEL : B.SAND; filler = top === B.CLAY ? B.CLAY : B.SAND; break;
        }
        case BIOME.MOUNTAINS:
          if (h > 104) { top = B.SNOW_BLOCK; filler = B.STONE; }
          else if (h > 90) { top = B.STONE; filler = B.STONE; }
          else { top = B.GRASS; filler = B.DIRT; }
          break;
        default: top = B.GRASS; filler = B.DIRT;
      }
      if (underwater && top === B.GRASS) { top = B.DIRT; }
      for (let y = 0; y < CH; y++) {
        let id = 0;
        if (y === 0) id = B.BEDROCK;
        else if (y < 4 && hash2(wx * 7 + y, wz * 13 - y, this.seed) < 0.5 - y * 0.12) id = B.BEDROCK;
        else if (y < h - fillerDepth) id = deep === B.SANDSTONE && y < h - fillerDepth - 3 ? B.STONE : deep;
        else if (y < h) id = filler;
        else if (y === h) id = top;
        else if (y <= SEA) id = B.WATER;
        if (id !== 0 && id !== B.BEDROCK && id !== B.WATER) {
          if (y < maxLy * CAVE_STEP && this.isCave(lerpL(spagL, x, y, z), lerpL(cheeseL, x, y, z), y, h, underwater)) {
            id = y <= 10 ? B.LAVA : 0;
          }
        }
        if (id === B.WATER && y === SEA && biome === BIOME.FROZEN_OCEAN) id = B.ICE;
        blocks[idx(x, y, z)] = id;
      }
      // grass under removed blocks becomes dirt handled naturally; fix dirt that became surface after carving
    }

    // Ores
    const ore = (id, tries, minY, maxY, size) => {
      for (let i = 0; i < tries; i++) {
        let x = Math.floor(rng() * CS), y = minY + Math.floor(rng() * (maxY - minY)), z = Math.floor(rng() * CS);
        const n = size[0] + Math.floor(rng() * (size[1] - size[0] + 1));
        for (let k = 0; k < n; k++) {
          if (x >= 0 && x < CS && z >= 0 && z < CS && y > 0 && y < CH) {
            const j = idx(x, y, z);
            if (blocks[j] === B.STONE) blocks[j] = id;
          }
          const d = Math.floor(rng() * 6);
          if (d === 0) x++; else if (d === 1) x--; else if (d === 2) y++; else if (d === 3) y--; else if (d === 4) z++; else z--;
        }
      }
    };
    ore(B.COAL_ORE, 20, 5, 110, [4, 12]);
    ore(B.IRON_ORE, 14, 5, 64, [3, 8]);
    ore(B.GOLD_ORE, 3, 5, 32, [3, 7]);
    ore(B.DIAMOND_ORE, 2, 5, 16, [2, 6]);
    ore(B.REDSTONE_ORE, 6, 5, 16, [3, 8]);
    ore(B.GRAVEL, 6, 5, 100, [8, 20]);
    ore(B.DIRT, 6, 5, 100, [8, 20]);

    const setIf = (x, y, z, id, onlyAir) => {
      if (x < 0 || x >= CS || z < 0 || z >= CS || y < 1 || y >= CH) return;
      const j = idx(x, y, z);
      if (onlyAir) { const cur = blocks[j]; if (cur !== 0 && cur !== B.TALL_GRASS) return; }
      blocks[j] = id;
    };

    // Trees (can come from neighboring columns)
    for (let lz = -M; lz < CS + M; lz++) for (let lx = -M; lx < CS + M; lx++) {
      const wx = bx + lx, wz = bz + lz;
      const c = col(lx, lz);
      if (c.h <= SEA) continue;
      let density = 0;
      switch (c.biome) {
        case BIOME.FOREST: density = 0.035; break;
        case BIOME.PLAINS: density = 0.0025; break;
        case BIOME.SNOWY: density = 0.012; break;
        case BIOME.MOUNTAINS: density = c.h < 92 ? 0.008 : 0; break;
        default: density = 0;
      }
      const r = hash2(wx, wz, this.seed + 101);
      if (r >= density) continue;
      if (this.caveAt(wx, c.h, wz, c.h, false)) continue;
      const tr = hash2(wx, wz, this.seed + 202);
      let kind = 'oak';
      if (c.biome === BIOME.SNOWY || (c.biome === BIOME.MOUNTAINS)) kind = 'spruce';
      else if (c.biome === BIOME.FOREST && tr < 0.3) kind = 'birch';
      this.placeTree(kind, lx, c.h + 1, lz, tr, setIf);
      if (lx >= 0 && lx < CS && lz >= 0 && lz < CS) blocks[idx(lx, c.h, lz)] = B.DIRT;
    }

    // Surface decoration within chunk
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const c = col(x, z);
      const wx = bx + x, wz = bz + z;
      const y = c.h + 1;
      if (y >= CH) continue;
      const below = blocks[idx(x, c.h, z)];
      if (blocks[idx(x, y, z)] !== 0) continue;
      const r = hash2(wx, wz, this.seed + 303);
      if (below === B.GRASS) {
        if (c.biome === BIOME.PLAINS) {
          if (r < 0.2) blocks[idx(x, y, z)] = B.TALL_GRASS;
          else if (r < 0.215) blocks[idx(x, y, z)] = B.DANDELION;
          else if (r < 0.225) blocks[idx(x, y, z)] = B.ROSE;
          else if (r < 0.2257) blocks[idx(x, y, z)] = B.PUMPKIN;
        } else if (c.biome === BIOME.FOREST) {
          if (r < 0.1) blocks[idx(x, y, z)] = B.TALL_GRASS;
          else if (r < 0.105) blocks[idx(x, y, z)] = B.ROSE;
        } else if (r < 0.06) blocks[idx(x, y, z)] = B.TALL_GRASS;
      } else if (below === B.SAND && c.biome === BIOME.DESERT) {
        if (r < 0.005) {
          const hgt = 1 + Math.floor(hash2(wx, wz, this.seed + 404) * 3);
          // cactus needs space around
          let ok = true;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, nz = z + dz;
            if (nx >= 0 && nx < CS && nz >= 0 && nz < CS && blocks[idx(nx, y, nz)] !== 0) ok = false;
          }
          if (ok) for (let k = 0; k < hgt; k++) setIf(x, y + k, z, B.CACTUS, true);
        } else if (r < 0.012) blocks[idx(x, y, z)] = B.DEAD_BUSH;
      }
    }

    // Dungeons: rare mossy rooms with a chest
    if (rng() < 0.08) this.dungeon(chunk, rng);
  }

  placeTree(kind, x, y, z, r, set) {
    if (kind === 'spruce') {
      const h = 6 + Math.floor(r * 4);
      for (let k = 0; k < h; k++) set(x, y + k, z, B.SPRUCE_LOG);
      let radius = 0;
      for (let k = h; k >= 2; k--) {
        const yy = y + k;
        for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
          if (Math.abs(dx) + Math.abs(dz) > radius + (radius > 1 ? 1 : 0)) continue;
          if (dx === 0 && dz === 0 && k < h) continue;
          set(x + dx, yy, z + dz, B.SPRUCE_LEAVES, true);
        }
        radius = radius >= 2 ? 1 : radius + 1;
        if (k === h) radius = 1;
      }
      set(x, y + h, z, B.SPRUCE_LEAVES, true);
      set(x, y + h + 1, z, B.SPRUCE_LEAVES, true);
      return;
    }
    const birch = kind === 'birch';
    const h = (birch ? 5 : 4) + Math.floor(r * 3);
    const log = birch ? B.BIRCH_LOG : B.OAK_LOG;
    const leaves = birch ? B.BIRCH_LEAVES : B.OAK_LEAVES;
    for (let ly = h - 3; ly <= h; ly++) {
      const rad = ly >= h - 1 ? 1 : 2;
      for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
        const corner = Math.abs(dx) === rad && Math.abs(dz) === rad;
        if (corner && (ly === h || hash2(x + dx * 3 + ly, z + dz * 5, Math.floor(r * 1000)) < 0.5)) continue;
        set(x + dx, y + ly, z + dz, leaves, true);
      }
    }
    for (let k = 0; k < h; k++) set(x, y + k, z, log);
  }

  dungeon(chunk, rng) {
    const blocks = chunk.blocks;
    const x0 = 3 + Math.floor(rng() * 4), z0 = 3 + Math.floor(rng() * 4), y0 = 12 + Math.floor(rng() * 30);
    const w = 7, d = 7, h = 5;
    // require mostly solid surroundings
    let solid = 0, total = 0;
    for (let y = y0 - 1; y <= y0 + h; y += h + 1) for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) {
      total++; if (blocks[idx(x, y, z)] !== 0) solid++;
    }
    if (solid < total * 0.9) return;
    for (let y = y0 - 1; y <= y0 + h; y++) for (let z = z0 - 1; z <= z0 + d; z++) for (let x = x0 - 1; x <= x0 + w; x++) {
      const edge = y === y0 - 1 || y === y0 + h || z === z0 - 1 || z === z0 + d || x === x0 - 1 || x === x0 + w;
      if (x < 0 || x >= CS || z < 0 || z >= CS) continue;
      const j = idx(x, y, z);
      if (edge) { if (blocks[j] !== 0 || y === y0 - 1) blocks[j] = rng() < 0.4 ? B.MOSSY_COBBLE : B.COBBLE; }
      else blocks[j] = 0;
    }
    blocks[idx(x0 + 1, y0, z0 + 1)] = B.CHEST;
    blocks[idx(x0 + w - 2, y0, z0 + d - 2)] = B.CHEST;
    blocks[idx(x0 + w - 1, y0 + h - 1, z0)] = B.COBWEB;
    blocks[idx(x0, y0 + h - 1, z0 + d - 1)] = B.COBWEB;
    blocks[idx(x0 + 3, y0, z0 + 3)] = B.GLOWSTONE;
    chunk.dungeonChests = [[x0 + 1, y0, z0 + 1], [x0 + w - 2, y0, z0 + d - 2]];
  }
}

export const NETHER_LAVA = 31;

// The Nether: a cavernous netherrack world with a lava sea, glowstone and soul sand.
export class NetherGenerator extends Generator {
  constructor(seed) {
    super(seed ^ 0x6e657468);
    this.dens = new SimplexNoise(seed + 21);
    this.dens2 = new SimplexNoise(seed + 22);
  }

  column() { return { h: 64, biome: BIOME.NETHER, t: 1, u: 0 }; }

  density(x, y, z) {
    let d = this.dens.noise3(x / 48, y / 26, z / 48) * 0.7 + this.dens2.noise3(x / 18, y / 14, z / 18) * 0.3;
    // solid floor and ceiling bands
    if (y < 24) d += (24 - y) / 14;
    if (y > 100) d += (y - 100) / 12;
    return d + 0.05;
  }

  generate(chunk) {
    const { cx, cz } = chunk;
    const bx = cx * CS, bz = cz * CS;
    const blocks = chunk.blocks;
    const rng = makeRng((this.seed * 31 + cx * 73856093) ^ (cz * 19349663));
    chunk.biomes.fill(BIOME.NETHER);
    const NX = CS / CAVE_STEP + 1, NY = CH / CAVE_STEP + 1;
    const lat = new Float32Array(NX * NX * NY);
    for (let ly = 0; ly < NY; ly++) for (let lz = 0; lz < NX; lz++) for (let lx = 0; lx < NX; lx++) {
      lat[(ly * NX + lz) * NX + lx] = this.density(bx + lx * CAVE_STEP, ly * CAVE_STEP, bz + lz * CAVE_STEP);
    }
    const sample = (x, y, z) => {
      const lx = x >> 2, ly = y >> 2, lz = z >> 2;
      const fx = (x & 3) / 4, fy = (y & 3) / 4, fz = (z & 3) / 4;
      const i000 = (ly * NX + lz) * NX + lx;
      const i100 = i000 + 1, i010 = i000 + NX * NX, i110 = i010 + 1, i001 = i000 + NX, i101 = i001 + 1, i011 = i010 + NX, i111 = i011 + 1;
      const c00 = lat[i000] * (1 - fx) + lat[i100] * fx, c01 = lat[i001] * (1 - fx) + lat[i101] * fx;
      const c10 = lat[i010] * (1 - fx) + lat[i110] * fx, c11 = lat[i011] * (1 - fx) + lat[i111] * fx;
      return (c00 * (1 - fz) + c01 * fz) * (1 - fy) + (c10 * (1 - fz) + c11 * fz) * fy;
    };
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const wx = bx + x, wz = bz + z;
      const soul = this.misc.noise2(wx / 24, wz / 24) > 0.45;
      for (let y = 0; y < CH; y++) {
        let id;
        if (y === 0 || y === CH - 1) id = B.BEDROCK;
        else if (y < 4 && hash2(wx * 7 + y, wz * 13 - y, this.seed) < 0.5 - y * 0.12) id = B.BEDROCK;
        else if (y > CH - 5 && hash2(wx * 5 - y, wz * 11 + y, this.seed) < 0.5 - (CH - 1 - y) * 0.12) id = B.BEDROCK;
        else if (y >= CH - 2) id = B.NETHERRACK;
        else if (sample(x, Math.min(y, CH - 4), z) > 0) id = B.NETHERRACK;
        else id = y <= NETHER_LAVA ? B.LAVA : 0;
        blocks[idx(x, y, z)] = id;
      }
      // soul sand / gravel floors
      for (let y = 1; y < CH - 1; y++) {
        const i = idx(x, y, z);
        if (blocks[i] === B.NETHERRACK && blocks[idx(x, y + 1, z)] === 0 && y > NETHER_LAVA - 3 && y < NETHER_LAVA + 6) {
          if (soul) blocks[i] = B.SOUL_SAND;
          else if (this.misc.noise2(wx / 9 + 40, wz / 9) > 0.6) blocks[i] = B.GRAVEL;
        }
      }
    }
    // quartz ore
    for (let i = 0; i < 16; i++) {
      let x = Math.floor(rng() * CS), y = 10 + Math.floor(rng() * 108), z = Math.floor(rng() * CS);
      for (let k = 0; k < 6; k++) {
        if (x >= 0 && x < CS && z >= 0 && z < CS && blocks[idx(x, y, z)] === B.NETHERRACK) blocks[idx(x, y, z)] = B.QUARTZ_ORE;
        x += Math.floor(rng() * 3) - 1; y += Math.floor(rng() * 3) - 1; z += Math.floor(rng() * 3) - 1;
        if (y < 1 || y > CH - 2) break;
      }
    }
    // glowstone hanging from ceilings
    for (let i = 0; i < 6; i++) {
      const x0 = 2 + Math.floor(rng() * 12), z0 = 2 + Math.floor(rng() * 12);
      let y0 = -1;
      for (let y = CH - 6; y > 40; y--) {
        if (blocks[idx(x0, y, z0)] === 0 && blocks[idx(x0, y + 1, z0)] === B.NETHERRACK) { y0 = y; break; }
      }
      if (y0 < 0 || rng() < 0.4) continue;
      for (let k = 0; k < 40; k++) {
        const x = x0 + Math.floor((rng() - 0.5) * 5), z = z0 + Math.floor((rng() - 0.5) * 5), y = y0 - Math.floor(rng() * 5);
        if (x < 0 || x >= CS || z < 0 || z >= CS) continue;
        const j = idx(x, y, z);
        if (blocks[j] !== 0) continue;
        let n = 0;
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
          const nx = x + dx, ny = y + dy, nz = z + dz;
          if (nx < 0 || nx >= CS || nz < 0 || nz >= CS) continue;
          const b = blocks[idx(nx, ny, nz)];
          if (b === B.GLOWSTONE || (dy === 1 && b === B.NETHERRACK)) n++;
        }
        if (n > 0) blocks[j] = B.GLOWSTONE;
      }
    }
  }
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
