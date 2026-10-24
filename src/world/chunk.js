export const CS = 16; // chunk size in x/z
export const CH = 128; // world height
export const SEA = 62;
export const CHUNK_VOL = CS * CS * CH;

export const idx = (x, y, z) => (y << 8) | (z << 4) | x;

export function chunkKey(cx, cz) { return (cx + 32768) * 65536 + (cz + 32768); }

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.key = chunkKey(cx, cz);
    this.blocks = new Uint8Array(CHUNK_VOL);
    this.meta = new Uint8Array(CHUNK_VOL);
    this.light = new Uint8Array(CHUNK_VOL); // high nibble = sky, low = block
    this.biomes = new Uint8Array(CS * CS);
    this.lit = false;
    this.meshDirty = true;
    this.meshes = null;
    this.modified = false;
    this.maxY = 0; // highest non-air block, for faster meshing
  }

  get(x, y, z) { return this.blocks[idx(x, y, z)]; }
  set(x, y, z, id) { this.blocks[idx(x, y, z)] = id; }

  computeMaxY() {
    let m = 0;
    for (let y = CH - 1; y >= 0 && !m; y--) {
      const base = y << 8;
      for (let i = 0; i < 256; i++) if (this.blocks[base + i]) { m = y; break; }
    }
    this.maxY = m;
  }
}
