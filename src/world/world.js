import * as THREE from 'three';
import { BLOCKS, B, I, OPAQUE, SOLID, LIGHT_EMIT, LIGHT_FILTER, blockShapes } from '../blocks.js';
import { Chunk, CS, CH, SEA, idx, chunkKey } from './chunk.js';
import { Generator, NetherGenerator, BIOME_NAMES } from './generator.js';
import { Lighting } from './lighting.js';
import { buildChunkMesh, ATTACH_DIRS } from './mesher.js';
import { makeRng } from '../noise.js';
import { dungeonLoot } from '../inventory.js';

const NEIGHBORS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

export class World {
  constructor(scene, materials, seed, savedChunks, tileEntities, dim = 'overworld') {
    this.scene = scene;
    this.materials = materials;
    this.seed = seed;
    this.dim = dim;
    this.hasSky = dim !== 'nether';
    this.gen = dim === 'nether' ? new NetherGenerator(seed) : new Generator(seed);
    this.lighting = new Lighting(this);
    this.chunks = new Map();
    this.saved = savedChunks || new Map(); // key -> {blocks, meta}
    this.dirtySave = new Set(); // keys of chunks needing persistence
    this.tileEntities = tileEntities || new Map(); // "x,y,z" -> data
    this.removedTE = new Map();
    this.updates = new Map(); // scheduled block updates "x,y,z" -> {x,y,z,t}
    this.time = 0;
    this.events = null; // callbacks set by game
    this.rng = makeRng(seed ^ 0x51ed);
    this.renderDist = 6;
    this.genQueue = [];
    this._lastCenter = null;
    this.meshCount = 0;
  }

  // ---------- access ----------
  getChunk(cx, cz) { return this.chunks.get(chunkKey(cx, cz)); }

  getBlock(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= CH) return 0;
    const c = this.chunks.get(chunkKey(x >> 4, z >> 4));
    if (!c) return -1;
    return c.blocks[idx(x & 15, y, z & 15)];
  }
  getMeta(x, y, z) {
    if (y < 0 || y >= CH) return 0;
    const c = this.chunks.get(chunkKey(x >> 4, z >> 4));
    if (!c) return 0;
    return c.meta[idx(x & 15, y, z & 15)];
  }
  getLight(x, y, z) {
    if (y >= CH) return this.hasSky ? 0xf0 : 0;
    if (y < 0) return 0;
    const c = this.chunks.get(chunkKey(x >> 4, z >> 4));
    if (!c) return 0xf0;
    return c.light[idx(x & 15, y, z & 15)];
  }
  getBiome(x, z) {
    const c = this.chunks.get(chunkKey(x >> 4, z >> 4));
    if (!c) return 'Unknown';
    return BIOME_NAMES[c.biomes[(z & 15) * 16 + (x & 15)]];
  }
  isSolid(x, y, z) { const b = this.getBlock(x, y, z); return b === -1 ? true : SOLID[b] === 1; }
  isLoaded(x, z) { return this.chunks.has(chunkKey(x >> 4, z >> 4)); }

  markChunkDirty(cx, cz) {
    const c = this.chunks.get(chunkKey(cx, cz));
    if (c) c.meshDirty = true;
  }

  // ---------- modification ----------
  setBlock(x, y, z, id, meta = 0, opts = {}) {
    if (y < 0 || y >= CH) return false;
    const c = this.chunks.get(chunkKey(x >> 4, z >> 4));
    if (!c) return false;
    const lx = x & 15, lz = z & 15;
    const i = idx(lx, y, lz);
    const old = c.blocks[i];
    const oldMeta = c.meta[i];
    if (old === id && oldMeta === meta) return false;
    c.blocks[i] = id;
    c.meta[i] = meta;
    c.modified = true;
    this.dirtySave.add(c.key);
    if (y > c.maxY) c.maxY = y;
    if (c.lit && (OPAQUE[old] !== OPAQUE[id] || LIGHT_EMIT[old] !== LIGHT_EMIT[id] || LIGHT_FILTER[old] !== LIGHT_FILTER[id])) {
      this.lighting.onBlockChanged(x, y, z, old, id);
    }
    c.meshDirty = true;
    c.urgent = true;
    const ex = lx === 0 ? -1 : lx === 15 ? 1 : 0, ez = lz === 0 ? -1 : lz === 15 ? 1 : 0;
    if (ex) this.urgentDirty(c.cx + ex, c.cz);
    if (ez) this.urgentDirty(c.cx, c.cz + ez);
    if (ex && ez) this.urgentDirty(c.cx + ex, c.cz + ez);
    if (old !== id) {
      const key = `${x},${y},${z}`;
      if (this.tileEntities.has(key) && !(BLOCKS[id] && BLOCKS[id].interact === BLOCKS[old]?.interact)) {
        // keep it around briefly so the caller can still drop its contents
        this.removedTE.set(key, this.tileEntities.get(key));
        this.tileEntities.delete(key);
      }
    }
    if (!opts.silent) {
      this.scheduleUpdate(x, y, z, 0);
      for (const [dx, dy, dz] of NEIGHBORS) this.scheduleUpdate(x + dx, y + dy, z + dz, 0);
    }
    if (old !== id && (old === B.OAK_LOG || old === B.BIRCH_LOG || old === B.SPRUCE_LOG)) this.scheduleLeafDecay(x, y, z);
    return true;
  }

  urgentDirty(cx, cz) {
    const c = this.chunks.get(chunkKey(cx, cz));
    if (c) { c.meshDirty = true; c.urgent = true; }
  }

  scheduleUpdate(x, y, z, delay, kind = 'block') {
    if (y < 0 || y >= CH) return;
    const key = `${x},${y},${z}`;
    const ex = this.updates.get(key);
    const t = this.time + delay;
    if (ex && ex.kind === kind && ex.t <= t) return;
    this.updates.set(key, { x, y, z, t, kind });
  }

  scheduleLeafDecay(x, y, z) {
    for (let dy = -4; dy <= 4; dy++) for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
      const b = this.getBlock(x + dx, y + dy, z + dz);
      if ((b === B.OAK_LEAVES || b === B.BIRCH_LEAVES || b === B.SPRUCE_LEAVES) && this.getMeta(x + dx, y + dy, z + dz) === 0) {
        this.scheduleUpdate(x + dx, y + dy, z + dz, 2 + this.rng() * 8, 'decay');
      }
    }
  }

  // ---------- block update logic ----------
  processUpdate(u) {
    const { x, y, z } = u;
    const id = this.getBlock(x, y, z);
    if (id <= 0) return;
    const def = BLOCKS[id];
    if (u.kind === 'decay') {
      if (!(id === B.OAK_LEAVES || id === B.BIRCH_LEAVES || id === B.SPRUCE_LEAVES)) return;
      if (!this.hasLogNear(x, y, z, 4)) this.breakBlock(x, y, z, true);
      return;
    }
    if (u.kind === 'fluid') { this.fluidTick(x, y, z, id); return; }
    if (def.fluid) { this.scheduleUpdate(x, y, z, def.fluid === 'water' ? 0.25 : 1.5, 'fluid'); return; }
    if (def.needsSupport && !this.isSupported(x, y, z, id)) { this.breakBlock(x, y, z, true); return; }
    if (def.gravity) {
      const below = this.getBlock(x, y - 1, z);
      if (below >= 0 && (below === 0 || (BLOCKS[below] && (BLOCKS[below].fluid || BLOCKS[below].replaceable)))) {
        this.setBlock(x, y, z, 0);
        if (this.events) this.events.fallingBlock(x, y, z, id);
      }
    }
    if (id === B.FARMLAND && OPAQUE[this.getBlock(x, y + 1, z)]) this.setBlock(x, y, z, B.DIRT);
    if (id === B.GRASS && OPAQUE[this.getBlock(x, y + 1, z)]) this.setBlock(x, y, z, B.DIRT);
  }

  isSupported(x, y, z, id) {
    const below = this.getBlock(x, y - 1, z);
    if (below < 0) return true;
    if (id === B.TORCH || id === B.LADDER) {
      const m = this.getMeta(x, y, z);
      const dir = ATTACH_DIRS[m];
      if (!dir) return id === B.TORCH ? SOLID[below] === 1 : false;
      return SOLID[this.getBlock(x + dir[0], y, z + dir[2])] === 1 || this.getBlock(x + dir[0], y, z + dir[2]) < 0;
    }
    if (id === B.CACTUS) {
      if (!(below === B.SAND || below === B.CACTUS)) return false;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (SOLID[this.getBlock(x + dx, y, z + dz)]) return false;
      return true;
    }
    if (id === B.WHEAT) return below === B.FARMLAND;
    if (id === B.PORTAL) {
      const ok = (b) => b === B.PORTAL || b === B.OBSIDIAN || b < 0;
      const ax = this.getMeta(x, y, z) & 1 ? [0, 1] : [1, 0];
      return ok(below) && ok(this.getBlock(x, y + 1, z)) && ok(this.getBlock(x + ax[0], y, z + ax[1])) && ok(this.getBlock(x - ax[0], y, z - ax[1]));
    }
    if (id === B.OAK_DOOR) {
      const m = this.getMeta(x, y, z);
      if (m & 8) return below === B.OAK_DOOR;
      const above = this.getBlock(x, y + 1, z);
      return (above === B.OAK_DOOR || above < 0) && (SOLID[below] === 1);
    }
    if (id === B.DEAD_BUSH) return below === B.SAND || below === B.DIRT || below === B.GRASS;
    return below === B.GRASS || below === B.DIRT || below === B.SNOWY_GRASS || below === B.FARMLAND || (id !== B.SAPLING && SOLID[below] && OPAQUE[below]);
  }

  // Light a nether portal inside an obsidian frame containing (x,y,z). Returns true on success.
  tryLightPortal(x, y, z) {
    const free = (b) => b === 0;
    for (const axis of [0, 1]) {
      const ax = axis ? [0, 1] : [1, 0];
      // find bottom-left corner of the interior
      let bx = x, by = y, bz = z;
      for (let i = 0; i < 22 && free(this.getBlock(bx, by - 1, bz)); i++) by--;
      if (this.getBlock(bx, by - 1, bz) !== B.OBSIDIAN) continue;
      for (let i = 0; i < 22 && free(this.getBlock(bx - ax[0], by, bz - ax[1])); i++) { bx -= ax[0]; bz -= ax[1]; }
      if (this.getBlock(bx - ax[0], by, bz - ax[1]) !== B.OBSIDIAN) continue;
      let w = 0;
      while (w < 22 && free(this.getBlock(bx + ax[0] * w, by, bz + ax[1] * w))) w++;
      let h = 0;
      while (h < 22 && free(this.getBlock(bx, by + h, bz))) h++;
      if (w < 2 || h < 3 || w > 21 || h > 21) continue;
      let valid = true;
      for (let i = -1; i <= w && valid; i++) for (let j = -1; j <= h && valid; j++) {
        const px = bx + ax[0] * i, pz = bz + ax[1] * i, py = by + j;
        const edgeI = i === -1 || i === w, edgeJ = j === -1 || j === h;
        if (edgeI && edgeJ) continue; // corners optional
        const b = this.getBlock(px, py, pz);
        if (edgeI || edgeJ) { if (b !== B.OBSIDIAN) valid = false; } else if (!free(b)) valid = false;
      }
      if (!valid) continue;
      for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) this.setBlock(bx + ax[0] * i, by + j, bz + ax[1] * i, B.PORTAL, axis, { silent: true });
      return true;
    }
    return false;
  }

  findPortal(x, y, z, r) {
    let best = null, bd = Infinity;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (!this.isLoaded(x + dx, z + dz)) continue;
      for (let yy = 1; yy < CH - 1; yy++) {
        if (this.getBlock(x + dx, yy, z + dz) === B.PORTAL && this.getBlock(x + dx, yy - 1, z + dz) !== B.PORTAL) {
          const d = dx * dx + dz * dz + (yy - y) * (yy - y) * 0.25;
          if (d < bd) { bd = d; best = [x + dx, yy, z + dz]; }
        }
      }
    }
    return best;
  }

  // Build an obsidian frame with a lit portal, clearing space and adding a floor.
  buildPortal(x, y, z) {
    for (let i = -1; i <= 4; i++) for (let j = -1; j <= 4; j++) for (let k = -1; k <= 1; k++) {
      const px = x + i, py = y + j, pz = z + k;
      if (j === -1) { if (!SOLID[this.getBlock(px, py, pz)] || BLOCKS[this.getBlock(px, py, pz)]?.fluid) this.setBlock(px, py, pz, B.OBSIDIAN, 0, { silent: true }); }
      else this.setBlock(px, py, pz, 0, 0, { silent: true });
    }
    for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) {
      const frame = i === 0 || i === 3 || j === 0 || j === 4;
      this.setBlock(x + i, y + j, z, frame ? B.OBSIDIAN : B.PORTAL, frame ? 0 : 0, { silent: true });
    }
  }

  hasLogNear(x, y, z, r) {
    for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const b = this.getBlock(x + dx, y + dy, z + dz);
      if (b === B.OAK_LOG || b === B.BIRCH_LOG || b === B.SPRUCE_LOG || b < 0) return true;
    }
    return false;
  }

  // Break a block naturally (support lost, decay, explosion); spawns drops via game events.
  breakBlock(x, y, z, drop) {
    const id = this.getBlock(x, y, z);
    if (id <= 0) return;
    const meta = this.getMeta(x, y, z);
    this.setBlock(x, y, z, 0);
    if (drop && this.events) this.events.blockBroken(x, y, z, id, meta, true);
  }

  // ---------- fluids ----------
  fluidTick(x, y, z, id) {
    const def = BLOCKS[id];
    if (!def || !def.fluid) return;
    const water = def.fluid === 'water';
    const step = water ? 1 : 2;
    let meta = this.getMeta(x, y, z);
    const other = water ? B.LAVA : B.WATER;

    if (!water) {
      // lava meeting water hardens
      for (const [dx, dy, dz] of NEIGHBORS) {
        if (dy === -1) continue;
        if (this.getBlock(x + dx, y + dy, z + dz) === B.WATER) {
          this.setBlock(x, y, z, meta === 0 ? B.OBSIDIAN : B.COBBLE);
          if (this.events) this.events.sound('fizz', x, y, z);
          return;
        }
      }
    }

    if (meta !== 0) {
      let newMeta;
      if (this.getBlock(x, y + 1, z) === id) newMeta = 8;
      else {
        let minL = 99, sources = 0;
        for (const [dx, , dz] of NEIGHBORS) {
          if (dx === 0 && dz === 0) continue;
          if (this.getBlock(x + dx, y, z + dz) === id) {
            const m = this.getMeta(x + dx, y, z + dz);
            if (m === 0) sources++;
            const eff = m >= 8 ? 0 : m;
            if (eff < minL) minL = eff;
          }
        }
        const below = this.getBlock(x, y - 1, z);
        if (water && sources >= 2 && (SOLID[below] || (below === id && this.getMeta(x, y - 1, z) === 0))) newMeta = 0;
        else if (minL === 99) newMeta = -1;
        else { newMeta = minL + step; if (newMeta > 7) newMeta = -1; }
      }
      if (newMeta === -1) { this.setBlock(x, y, z, 0); return; }
      if (newMeta !== meta) { this.setBlock(x, y, z, id, newMeta); meta = newMeta; }
    }

    const below = this.getBlock(x, y - 1, z);
    if (below < 0) return;
    if (this.canFlowInto(x, y - 1, z, id, 8)) {
      this.flowInto(x, y - 1, z, id, 8, other);
      return;
    }
    if (below === id && this.getMeta(x, y - 1, z) !== 0 && meta !== 0) return;
    const eff = meta >= 8 ? 0 : meta;
    const nl = eff + step;
    if (nl > 7) return;
    for (const [dx, , dz] of NEIGHBORS) {
      if (dx === 0 && dz === 0) continue;
      if (this.canFlowInto(x + dx, y, z + dz, id, nl)) this.flowInto(x + dx, y, z + dz, id, nl, other);
    }
  }

  canFlowInto(x, y, z, id, level) {
    const b = this.getBlock(x, y, z);
    if (b < 0) return false;
    if (b === 0) return true;
    const def = BLOCKS[b];
    if (b === id) { const m = this.getMeta(x, y, z); return m !== 0 && m < 8 && m > level; }
    if (def.fluid) return true; // interaction
    return def.replaceable || (!def.solid && def.needsSupport && b !== B.TORCH ? true : false) || b === B.TORCH;
  }

  flowInto(x, y, z, id, level, other) {
    const b = this.getBlock(x, y, z);
    if (b === other) {
      const m = this.getMeta(x, y, z);
      if (id === B.WATER) this.setBlock(x, y, z, m === 0 ? B.OBSIDIAN : B.COBBLE);
      else this.setBlock(x, y, z, B.STONE);
      if (this.events) this.events.sound('fizz', x, y, z);
      return;
    }
    if (b > 0 && b !== id) {
      const def = BLOCKS[b];
      if (this.events && def && !def.fluid) this.events.blockBroken(x, y, z, b, this.getMeta(x, y, z), true);
    }
    this.setBlock(x, y, z, id, level);
  }

  // ---------- random ticks ----------
  // Like Minecraft: 3 random block ticks per 16-high section per game tick.
  randomTick(c) {
    const sections = (c.maxY >> 4) + 1;
    for (let n = 0; n < sections * 3; n++) {
      const r = (this.rng() * 4096) | 0;
      const y = ((n / 3) | 0) * 16 + (r >> 8), z = (r >> 4) & 15, x = r & 15;
      if (y >= CH) continue;
      const id = c.blocks[idx(x, y, z)];
      if (!id) continue;
      const wx = c.cx * CS + x, wz = c.cz * CS + z;
      if (id === B.GRASS || id === B.DIRT) {
        const above = this.getBlock(wx, y + 1, wz);
        if (id === B.GRASS && OPAQUE[above]) { this.setBlock(wx, y, wz, B.DIRT); continue; }
        if (id === B.DIRT && !OPAQUE[above] && !(BLOCKS[above] && BLOCKS[above].fluid) && (this.getLight(wx, y + 1, wz) >> 4) >= 9) {
          for (let k = 0; k < 4; k++) {
            const dx = ((this.rng() * 3) | 0) - 1, dy = ((this.rng() * 3) | 0) - 1, dz = ((this.rng() * 3) | 0) - 1;
            if (this.getBlock(wx + dx, y + dy, wz + dz) === B.GRASS) { this.setBlock(wx, y, wz, B.GRASS); break; }
          }
        }
      } else if (id === B.SAPLING) {
        if (this.rng() < 0.12 && (this.getLight(wx, y + 1, wz) >> 4) >= 9) this.growTree(wx, y, wz);
      } else if (id === B.WHEAT) {
        const m = c.meta[idx(x, y, z)];
        const l = this.getLight(wx, y, wz);
        if (m < 7 && Math.max(l >> 4, l & 15) >= 9 && this.rng() < 0.35) this.setBlock(wx, y, wz, B.WHEAT, m + 1);
      } else if (id === B.FARMLAND) {
        if (this.getBlock(wx, y + 1, wz) === 0 && this.rng() < 0.05 && !this.waterNear(wx, y, wz)) this.setBlock(wx, y, wz, B.DIRT);
      } else if (id === B.CACTUS) {
        if (this.getBlock(wx, y + 1, wz) === 0 && this.getBlock(wx, y - 1, wz) === B.CACTUS && this.getBlock(wx, y - 2, wz) !== B.CACTUS && this.rng() < 0.1) this.setBlock(wx, y + 1, wz, B.CACTUS);
      } else if (id === B.ICE) {
        if ((this.getLight(wx, y + 1, wz) & 15) > 11) this.setBlock(wx, y, wz, B.WATER);
      }
    }
  }

  waterNear(x, y, z) {
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) for (let dy = 0; dy <= 1; dy++) {
      if (this.getBlock(x + dx, y + dy, z + dz) === B.WATER) return true;
    }
    return false;
  }

  growTree(x, y, z) {
    for (let k = 1; k <= 6; k++) { const b = this.getBlock(x, y + k, z); if (b !== 0 && !(BLOCKS[b] && BLOCKS[b].replaceable)) return; }
    const below = this.getBlock(x, y - 1, z);
    let kind = this.rng() < 0.25 ? 'birch' : 'oak';
    if (below === B.SNOWY_GRASS) kind = 'spruce';
    this.setBlock(x, y, z, 0, 0, { silent: true });
    this.gen.placeTree(kind, x, y, z, this.rng(), (bx, by, bz, id, onlyAir) => {
      const cur = this.getBlock(bx, by, bz);
      if (cur < 0) return;
      if (onlyAir && cur !== 0 && !(BLOCKS[cur] && BLOCKS[cur].replaceable)) return;
      this.setBlock(bx, by, bz, id, 0, { silent: true });
    });
    if (below === B.GRASS) this.setBlock(x, y - 1, z, B.DIRT, 0, { silent: true });
  }

  // ---------- chunk lifecycle ----------
  generateChunk(cx, cz) {
    const c = new Chunk(cx, cz);
    const saved = this.saved.get(c.key);
    if (saved) {
      c.blocks.set(saved.blocks);
      c.meta.set(saved.meta);
      // biomes still come from generator columns
      for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) c.biomes[z * CS + x] = this.gen.column(cx * CS + x, cz * CS + z).biome;
      c.modified = true;
    } else {
      this.gen.generate(c);
      if (c.dungeonChests) {
        const rng = makeRng(cx * 7919 + cz * 104729 + this.seed);
        for (const [x, y, z] of c.dungeonChests) {
          const key = `${cx * CS + x},${y},${cz * CS + z}`;
          if (!this.tileEntities.has(key)) this.tileEntities.set(key, { type: 'chest', slots: dungeonLoot(rng) });
        }
      }
    }
    c.computeMaxY();
    this.chunks.set(c.key, c);
    this.lighting.initChunk(c);
    // neighbours may now be meshable
    return c;
  }

  unloadChunk(c) {
    if (c.modified) {
      this.saved.set(c.key, { blocks: c.blocks.slice(), meta: c.meta.slice() });
    }
    this.disposeMeshes(c);
    this.chunks.delete(c.key);
  }

  disposeMeshes(c) {
    if (!c.meshes) return;
    for (const m of c.meshes) { this.scene.remove(m); m.geometry.dispose(); }
    c.meshes = null;
  }

  canMesh(c) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!this.chunks.has(chunkKey(c.cx + dx, c.cz + dz))) return false;
    }
    return true;
  }

  meshChunk(c) {
    const { solid, trans } = buildChunkMesh(this, c);
    this.disposeMeshes(c);
    c.meshes = [];
    if (solid) {
      const m = new THREE.Mesh(solid, this.materials.solid);
      m.position.set(c.cx * CS, 0, c.cz * CS);
      m.matrixAutoUpdate = false; m.updateMatrix();
      this.scene.add(m); c.meshes.push(m);
    }
    if (trans) {
      const m = new THREE.Mesh(trans, this.materials.trans);
      m.position.set(c.cx * CS, 0, c.cz * CS);
      m.matrixAutoUpdate = false; m.updateMatrix();
      m.renderOrder = 1;
      this.scene.add(m); c.meshes.push(m);
    }
    c.meshDirty = false;
    c.urgent = false;
    this.meshCount++;
  }

  // Load/unload/mesh around the player with a per-frame time budget.
  update(px, pz, budgetMs = 8) {
    const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS);
    const R = this.renderDist;
    const start = performance.now();

    // urgent remeshes (player edits) first, no budget check
    for (const c of this.chunks.values()) {
      if (c.urgent && c.meshDirty && c.meshes !== undefined && this.canMesh(c)) this.meshChunk(c);
    }

    if (!this._lastCenter || this._lastCenter[0] !== pcx || this._lastCenter[1] !== pcz || this._lastR !== R) {
      this._lastCenter = [pcx, pcz];
      this._lastR = R;
      const list = [];
      for (let dz = -R - 1; dz <= R + 1; dz++) for (let dx = -R - 1; dx <= R + 1; dx++) {
        const d = dx * dx + dz * dz;
        if (d > (R + 1.5) * (R + 1.5)) continue;
        list.push([pcx + dx, pcz + dz, d]);
      }
      list.sort((a, b) => a[2] - b[2]);
      this.genQueue = list;
      // unload far chunks
      for (const c of [...this.chunks.values()]) {
        const dx = c.cx - pcx, dz = c.cz - pcz;
        if (dx * dx + dz * dz > (R + 3) * (R + 3)) this.unloadChunk(c);
      }
    }

    // generate missing chunks
    let generated = 0;
    for (const [cx, cz] of this.genQueue) {
      if (performance.now() - start > budgetMs) break;
      if (this.chunks.has(chunkKey(cx, cz))) continue;
      this.generateChunk(cx, cz);
      generated++;
    }
    // mesh dirty chunks nearest first
    let meshed = 0;
    for (const [cx, cz, d] of this.genQueue) {
      if (performance.now() - start > budgetMs * 1.6 && meshed > 0) break;
      if (d > (R + 0.5) * (R + 0.5)) continue;
      const c = this.chunks.get(chunkKey(cx, cz));
      if (!c || !c.meshDirty || !this.canMesh(c)) continue;
      this.meshChunk(c);
      meshed++;
    }
    return { generated, meshed };
  }

  tick(dt) {
    this.time += dt;
    this.removedTE.clear();
    // scheduled updates (limit per tick)
    if (this.updates.size) {
      const due = [];
      for (const [k, u] of this.updates) {
        if (u.t <= this.time) { due.push(u); this.updates.delete(k); if (due.length > 600) break; }
      }
      for (const u of due) {
        if (!this.isLoaded(u.x, u.z)) continue;
        this.processUpdate(u);
      }
    }
  }

  randomTicks(px, pz) {
    const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS);
    for (const c of this.chunks.values()) {
      if (Math.abs(c.cx - pcx) <= 5 && Math.abs(c.cz - pcz) <= 5) this.randomTick(c);
    }
  }

  // Highest solid/opaque block y in a column (for spawning)
  surfaceY(x, z) {
    for (let y = CH - 1; y > 0; y--) {
      const b = this.getBlock(x, y, z);
      if (b > 0 && (SOLID[b] || BLOCKS[b].fluid)) return y;
    }
    return 0;
  }

  // Voxel raycast (Amanatides & Woo). Returns {x,y,z, face:[nx,ny,nz], id, dist} or null.
  raycast(origin, dir, maxDist, includeFluids = false) {
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const sx = Math.sign(dir.x), sy = Math.sign(dir.y), sz = Math.sign(dir.z);
    const tdx = sx !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const tdy = sy !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const tdz = sz !== 0 ? Math.abs(1 / dir.z) : Infinity;
    let tmx = sx > 0 ? (x + 1 - origin.x) * tdx : sx < 0 ? (origin.x - x) * tdx : Infinity;
    let tmy = sy > 0 ? (y + 1 - origin.y) * tdy : sy < 0 ? (origin.y - y) * tdy : Infinity;
    let tmz = sz > 0 ? (z + 1 - origin.z) * tdz : sz < 0 ? (origin.z - z) * tdz : Infinity;
    let face = [0, 0, 0];
    let t = 0;
    for (let i = 0; i < 200 && t <= maxDist; i++) {
      const id = this.getBlock(x, y, z);
      if (id > 0) {
        const def = BLOCKS[id];
        if (def.selectable || (includeFluids && def.fluid && this.getMeta(x, y, z) === 0)) {
          if (this.hitsShape(def, x, y, z, origin, dir)) return { x, y, z, face, id, dist: t };
        }
      }
      if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; face = [-sx, 0, 0]; }
      else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; face = [0, -sy, 0]; }
      else { z += sz; t = tmz; tmz += tdz; face = [0, 0, -sz]; }
    }
    return null;
  }

  hitsShape(def, x, y, z, o, d) {
    if (def.render !== 'box' && def.render !== 'torch' && def.render !== 'shape') return true;
    let boxes;
    if (def.render === 'torch') {
      const m = this.getMeta(x, y, z);
      boxes = [m ? [3, 3, 3, 13, 14, 13] : [5, 0, 5, 11, 13, 11]];
    } else boxes = blockShapes(def.id, this.getMeta(x, y, z));
    for (const b of boxes) {
      if (rayBox(o, d, x + b[0] / 16, y + b[1] / 16, z + b[2] / 16, x + b[3] / 16, y + b[4] / 16, z + b[5] / 16)) return true;
    }
    return false;
  }

  // Serialize modified chunks into the saved map (in-memory snapshot)
  snapshotDirty() {
    const out = [];
    for (const key of this.dirtySave) {
      const c = this.chunks.get(key);
      if (c) {
        const s = { blocks: c.blocks.slice(), meta: c.meta.slice() };
        this.saved.set(key, s);
        out.push([key, s]);
      } else if (this.saved.has(key)) out.push([key, this.saved.get(key)]);
    }
    this.dirtySave.clear();
    return out;
  }

  dispose() {
    for (const c of this.chunks.values()) this.disposeMeshes(c);
    this.chunks.clear();
  }
}

function rayBox(o, d, x0, y0, z0, x1, y1, z1) {
  let tmin = 0, tmax = 100;
  const oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z], mn = [x0, y0, z0], mx = [x1, y1, z1];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(dd[k]) < 1e-9) { if (oo[k] < mn[k] || oo[k] > mx[k]) return false; continue; }
    let t1 = (mn[k] - oo[k]) / dd[k], t2 = (mx[k] - oo[k]) / dd[k];
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

export { CS, CH, SEA };
