// Procedurally painted 16x16 pixel-art textures. Nothing is loaded from disk.
import * as THREE from 'three';
import { makeRng, hashString } from './noise.js';
import { BLOCKS, ITEMS, TOOL_MATERIALS, TOOL_TYPES, ARMOR_MATERIALS, ARMOR_SLOTS, blockShapes } from './blocks.js';

const S = 16;

class Tile {
  constructor(name) {
    this.name = name;
    this.data = new Uint8ClampedArray(S * S * 4);
    this.rng = makeRng(hashString(name) ^ 0x9e3779b9);
  }
  set(x, y, c, a = 255) {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4;
    this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2];
    this.data[i + 3] = c.length > 3 ? c[3] : a;
  }
  get(x, y) {
    const i = (((y + S) % S) * S + ((x + S) % S)) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }
  shade(x, y, f) {
    const c = this.get(x, y);
    this.set(x, y, [c[0] * f, c[1] * f, c[2] * f, c[3]]);
  }
  noise(base, v, a = 255) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const f = 1 + (this.rng() - 0.5) * v;
      this.set(x, y, [base[0] * f, base[1] * f, base[2] * f], a);
    }
  }
  noiseRgb(base, v, a = 255) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const r = this.rng();
      this.set(x, y, [base[0] + (r - 0.5) * v, base[1] + (r - 0.5) * v, base[2] + (r - 0.5) * v], a);
    }
  }
  clear() { this.data.fill(0); }
  rect(x0, y0, w, h, c) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c); }
  speckle(count, c, size = 1) {
    for (let i = 0; i < count; i++) {
      const x = Math.floor(this.rng() * S), y = Math.floor(this.rng() * S);
      for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
        const f = 0.85 + this.rng() * 0.3;
        this.set(x + dx, y + dy, [c[0] * f, c[1] * f, c[2] * f]);
      }
    }
  }
  border(c) { for (let i = 0; i < S; i++) { this.set(i, 0, c); this.set(i, S - 1, c); this.set(0, i, c); this.set(S - 1, i, c); } }
  copy(other) { this.data.set(other.data); }
}

// ---- helpers ----
function voronoi(t, points, colorFn, edge) {
  const pts = [];
  for (let i = 0; i < points; i++) pts.push([t.rng() * S, t.rng() * S, t.rng()]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let d1 = 1e9, d2 = 1e9, best = 0;
    for (const p of pts) for (let ox = -S; ox <= S; ox += S) for (let oy = -S; oy <= S; oy += S) {
      const dx = x + 0.5 - p[0] - ox, dy = y + 0.5 - p[1] - oy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < d1) { d2 = d1; d1 = d; best = p[2]; } else if (d < d2) d2 = d;
    }
    const c = colorFn(best, x, y);
    if (edge && d2 - d1 < 1.1) t.set(x, y, edge);
    else t.set(x, y, c);
  }
}

function oreTile(t, color, shine) {
  P.stone(t);
  const clusters = 4 + Math.floor(t.rng() * 2);
  for (let c = 0; c < clusters; c++) {
    const cx = 2 + Math.floor(t.rng() * 12), cy = 2 + Math.floor(t.rng() * 12);
    const pts = [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]];
    for (const [dx, dy] of pts) {
      if (t.rng() < 0.75) {
        const f = 0.8 + t.rng() * 0.35;
        t.set(cx + dx, cy + dy, [color[0] * f, color[1] * f, color[2] * f]);
      }
    }
    if (shine) t.set(cx, cy, shine);
  }
}

function planksTile(t, base) {
  for (let y = 0; y < S; y++) {
    const board = Math.floor(y / 4);
    const seam = (board * 7 + 3) % 16;
    for (let x = 0; x < S; x++) {
      let f = 0.92 + t.rng() * 0.12;
      if (Math.sin((x + board * 5) * 0.9) > 0.85) f *= 0.9;
      let c = [base[0] * f, base[1] * f, base[2] * f];
      if (y % 4 === 3) c = [base[0] * 0.62, base[1] * 0.62, base[2] * 0.62];
      else if (x === seam) c = [base[0] * 0.7, base[1] * 0.7, base[2] * 0.7];
      t.set(x, y, c);
    }
  }
}

function logSide(t, base, dark, birch) {
  for (let x = 0; x < S; x++) {
    const colf = 0.85 + t.rng() * 0.25;
    for (let y = 0; y < S; y++) {
      const f = colf * (0.9 + t.rng() * 0.15);
      t.set(x, y, [base[0] * f, base[1] * f, base[2] * f]);
    }
  }
  if (birch) {
    for (let i = 0; i < 9; i++) {
      const y = Math.floor(t.rng() * S), x = Math.floor(t.rng() * 13), w = 2 + Math.floor(t.rng() * 3);
      for (let k = 0; k < w; k++) t.set(x + k, y, dark);
    }
  } else {
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(t.rng() * S), y = Math.floor(t.rng() * 10), h = 3 + Math.floor(t.rng() * 6);
      for (let k = 0; k < h; k++) t.set(x, y + k, dark);
    }
  }
}

function logTop(t, ring1, ring2, bark) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - 7.5, dy = y - 7.5;
    const d = Math.max(Math.abs(dx), Math.abs(dy));
    let c;
    if (d > 6.6) c = bark;
    else c = (Math.floor(d) % 2 === 0) ? ring1 : ring2;
    const f = 0.93 + t.rng() * 0.12;
    t.set(x, y, [c[0] * f, c[1] * f, c[2] * f]);
  }
}

function leavesTile(t, base, holes = 0.18) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const r = t.rng();
    if (r < holes) { t.set(x, y, [0, 0, 0], 0); continue; }
    const f = 0.65 + t.rng() * 0.5;
    t.set(x, y, [base[0] * f, base[1] * f, base[2] * f]);
  }
}

function bricksPattern(t, brick, mortar, rows = 4, bw = 8) {
  const rh = S / rows;
  for (let y = 0; y < S; y++) {
    const row = Math.floor(y / rh);
    const off = row % 2 ? bw / 2 : 0;
    for (let x = 0; x < S; x++) {
      const inMortar = (y % rh === rh - 1) || ((x + off) % bw === bw - 1);
      if (inMortar) t.set(x, y, mortar);
      else {
        const f = 0.88 + t.rng() * 0.2;
        t.set(x, y, [brick[0] * f, brick[1] * f, brick[2] * f]);
      }
    }
  }
}

function plantSprite(t, stem, flower, petal) {
  t.clear();
  for (let y = 8; y < 16; y++) t.set(7, y, stem);
  t.set(6, 12, stem); t.set(5, 11, stem); t.set(8, 13, stem); t.set(9, 12, stem);
  if (flower) {
    t.rect(6, 5, 3, 3, flower);
    t.set(7, 4, petal); t.set(5, 6, petal); t.set(9, 6, petal); t.set(7, 8, petal);
    t.set(7, 6, petal);
  }
}

function metalBlock(t, base) {
  t.noise(base, 0.08);
  for (let i = 0; i < S; i++) {
    t.set(i, 0, base.map((v) => Math.min(255, v * 1.25)));
    t.set(0, i, base.map((v) => Math.min(255, v * 1.25)));
    t.set(i, S - 1, base.map((v) => v * 0.65));
    t.set(S - 1, i, base.map((v) => v * 0.65));
  }
  for (let i = 2; i < 6; i++) t.set(i, 2 + (i - 2), base.map((v) => Math.min(255, v * 1.35)));
}

// ---- painters ----
const P = {
  dirt(t) { t.noise([134, 96, 67], 0.3); t.speckle(10, [100, 70, 48]); t.speckle(6, [160, 120, 85]); },
  grass_top(t) { t.noise([96, 160, 52], 0.32); t.speckle(14, [76, 130, 40]); t.speckle(8, [120, 185, 70]); },
  grass_side(t) {
    P.dirt(t);
    for (let x = 0; x < S; x++) {
      const h = 2 + Math.floor(t.rng() * 3) + (x % 3 === 0 ? 1 : 0);
      for (let y = 0; y < h; y++) {
        const f = 0.85 + t.rng() * 0.3;
        t.set(x, y, [96 * f, 160 * f, 52 * f]);
      }
    }
  },
  snowy_grass_side(t) {
    P.dirt(t);
    for (let x = 0; x < S; x++) {
      const h = 2 + Math.floor(t.rng() * 3);
      for (let y = 0; y < h; y++) { const f = 0.92 + t.rng() * 0.08; t.set(x, y, [245 * f, 250 * f, 255 * f]); }
    }
  },
  snow(t) { t.noise([240, 246, 250], 0.06); t.speckle(8, [220, 230, 240]); },
  stone(t) {
    t.noise([125, 125, 125], 0.18);
    for (let i = 0; i < 7; i++) {
      const x = Math.floor(t.rng() * S), y = Math.floor(t.rng() * S), w = 2 + Math.floor(t.rng() * 3);
      for (let k = 0; k < w; k++) t.shade(x + k, y, 0.82);
    }
  },
  cobblestone(t) {
    voronoi(t, 9, (r) => { const v = 100 + r * 60; return [v, v, v]; }, [72, 72, 72]);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (t.rng() < 0.3) t.shade(x, y, 0.92);
  },
  mossy_cobblestone(t) {
    P.cobblestone(t);
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(t.rng() * S), y = Math.floor(t.rng() * S);
      const f = 0.8 + t.rng() * 0.4;
      t.set(x, y, [70 * f, 110 * f, 50 * f]);
    }
  },
  bedrock(t) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = t.rng() < 0.5 ? 40 + t.rng() * 30 : 90 + t.rng() * 50;
      t.set(x, y, [v, v, v]);
    }
  },
  sand(t) { t.noise([219, 207, 163], 0.12); t.speckle(10, [200, 185, 140]); },
  sandstone(t) {
    P.sand(t);
    for (let x = 0; x < S; x++) { t.shade(x, 3, 0.85); t.shade(x, 9, 0.88); t.shade(x, 12, 0.85); }
  },
  sandstone_top(t) { t.noise([219, 207, 163], 0.07); t.border([200, 188, 145]); },
  gravel(t) {
    voronoi(t, 18, (r) => {
      if (r < 0.3) return [110, 104, 100];
      if (r < 0.6) return [140, 133, 128];
      if (r < 0.8) return [96, 88, 82];
      return [165, 155, 150];
    }, null);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (t.rng() < 0.25) t.shade(x, y, 0.85);
  },
  clay(t) { t.noise([160, 166, 179], 0.1); t.speckle(8, [140, 146, 160]); },
  oak_log(t) { logSide(t, [104, 82, 50], [72, 56, 32], false); },
  oak_log_top(t) { logTop(t, [176, 142, 88], [150, 118, 70], [104, 82, 50]); },
  birch_log(t) { logSide(t, [216, 215, 205], [50, 50, 46], true); },
  birch_log_top(t) { logTop(t, [204, 184, 130], [180, 160, 108], [216, 215, 205]); },
  spruce_log(t) { logSide(t, [62, 42, 22], [42, 28, 14], false); },
  spruce_log_top(t) { logTop(t, [128, 96, 56], [104, 76, 42], [62, 42, 22]); },
  oak_leaves(t) { leavesTile(t, [62, 140, 40]); },
  birch_leaves(t) { leavesTile(t, [104, 150, 64]); },
  spruce_leaves(t) { leavesTile(t, [48, 96, 56], 0.12); },
  planks(t) { planksTile(t, [168, 134, 82]); },
  glass(t) {
    t.clear();
    const edge = [210, 235, 240];
    for (let i = 0; i < S; i++) { t.set(i, 0, edge); t.set(i, S - 1, edge); t.set(0, i, edge); t.set(S - 1, i, edge); }
    for (let i = 0; i < 4; i++) { t.set(3 + i, 6 - i, [255, 255, 255, 200]); t.set(9 + i, 12 - i, [255, 255, 255, 200]); }
    t.set(4, 6, [255, 255, 255, 160]); t.set(10, 12, [255, 255, 255, 160]);
  },
  water(t) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const f = 0.85 + 0.15 * Math.sin((x + y * 0.5) * 0.8) + t.rng() * 0.1;
      t.set(x, y, [50 * f, 95 * f, 220 * f], 180);
    }
  },
  lava(t) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = Math.sin(x * 0.7 + Math.sin(y * 0.5) * 2) * Math.cos(y * 0.6 + Math.sin(x * 0.4)) + t.rng() * 0.6;
      const c = v > 0.7 ? [255, 220, 90] : v > 0.1 ? [240, 140, 30] : [200, 80, 15];
      t.set(x, y, c);
    }
  },
  coal_ore(t) { oreTile(t, [40, 40, 40]); },
  iron_ore(t) { oreTile(t, [216, 175, 147], [240, 210, 190]); },
  gold_ore(t) { oreTile(t, [250, 225, 60], [255, 255, 180]); },
  diamond_ore(t) { oreTile(t, [93, 236, 245], [220, 255, 255]); },
  crafting_table_top(t) {
    planksTile(t, [150, 112, 62]);
    t.border([90, 64, 36]);
    for (let i = 2; i < 14; i++) { t.set(i, 5, [100, 72, 40]); t.set(i, 10, [100, 72, 40]); t.set(5, i, [100, 72, 40]); t.set(10, i, [100, 72, 40]); }
  },
  crafting_table_side(t) {
    planksTile(t, [168, 134, 82]);
    t.rect(0, 0, 16, 3, [110, 80, 44]);
    t.rect(3, 6, 2, 7, [120, 120, 120]); t.rect(2, 5, 4, 2, [90, 90, 90]); // hammer
    t.rect(10, 5, 1, 8, [80, 60, 30]); t.rect(11, 5, 3, 3, [160, 160, 160]); // saw
  },
  crafting_table_front(t) { P.crafting_table_side(t); },
  furnace_side(t) { t.noise([120, 120, 120], 0.15); t.border([90, 90, 90]); },
  furnace_top(t) { t.noise([110, 110, 110], 0.12); t.border([85, 85, 85]); },
  furnace_front(t) {
    P.furnace_side(t);
    t.rect(4, 8, 8, 5, [30, 30, 30]);
    t.rect(4, 7, 8, 1, [70, 70, 70]);
    t.rect(4, 2, 8, 2, [70, 70, 70]);
  },
  furnace_front_lit(t) {
    P.furnace_front(t);
    for (let x = 4; x < 12; x++) for (let y = 9; y < 13; y++) {
      const v = t.rng();
      t.set(x, y, v > 0.5 ? [255, 200, 60] : [230, 110, 20]);
    }
  },
  torch(t) {
    t.clear();
    for (let y = 8; y < 16; y++) { t.set(7, y, [120, 90, 50]); t.set(8, y, [96, 72, 38]); }
    t.set(7, 6, [255, 250, 200]); t.set(8, 6, [255, 230, 140]);
    t.set(7, 7, [255, 190, 60]); t.set(8, 7, [250, 150, 30]);
    t.set(7, 5, [255, 240, 160, 160]); t.set(8, 5, [255, 220, 120, 120]);
  },
  ice(t) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const f = 0.92 + t.rng() * 0.1;
      t.set(x, y, [150 * f, 190 * f, 250 * f], 200);
    }
    for (let i = 0; i < 5; i++) t.set(3 + i, 3 + i, [220, 235, 255, 220]);
    for (let i = 0; i < 4; i++) t.set(9 + i, 8 + i, [220, 235, 255, 220]);
  },
  cactus_side(t) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const stripe = (x === 1 || x === 14) ? 0 : (x % 4 === 0 ? 0.75 : 1);
      if (stripe === 0) { t.set(x, y, [0, 0, 0], 0); continue; }
      const f = stripe * (0.9 + t.rng() * 0.15);
      t.set(x, y, [60 * f, 125 * f, 40 * f]);
    }
    for (let i = 0; i < 8; i++) t.set(2 + Math.floor(t.rng() * 12), Math.floor(t.rng() * S), [210, 210, 170]);
  },
  cactus_top(t) {
    t.noise([80, 140, 50], 0.12);
    for (let i = 0; i < S; i++) { t.set(i, 1, [0, 0, 0], 0); t.set(i, 14, [0, 0, 0], 0); t.set(1, i, [0, 0, 0], 0); t.set(14, i, [0, 0, 0], 0); }
    t.rect(6, 6, 4, 4, [100, 165, 70]);
  },
  bricks(t) { bricksPattern(t, [150, 74, 58], [185, 175, 165], 4, 8); },
  stone_bricks(t) { bricksPattern(t, [122, 122, 122], [86, 86, 86], 2, 16); for (let y = 0; y < S; y++) { t.set(7, y < 8 ? y : -1, [86, 86, 86]); } },
  bookshelf(t) {
    planksTile(t, [168, 134, 82]);
    const colors = [[150, 40, 40], [40, 80, 150], [50, 120, 50], [160, 130, 40], [110, 50, 120], [180, 180, 170]];
    for (const yo of [1, 9]) {
      let x = 1;
      while (x < 15) {
        const w = 1 + Math.floor(t.rng() * 2);
        const c = colors[Math.floor(t.rng() * colors.length)];
        const h = 5 + Math.floor(t.rng() * 2);
        for (let k = 0; k < w && x < 15; k++, x++) for (let y = yo + (6 - h); y < yo + 6; y++) t.set(x, y, c.map((v) => v * (0.85 + t.rng() * 0.2)));
      }
    }
  },
  tall_grass(t) {
    t.clear();
    for (let b = 0; b < 7; b++) {
      const x0 = 1 + Math.floor(t.rng() * 14);
      const h = 6 + Math.floor(t.rng() * 9);
      const lean = (t.rng() - 0.5) * 0.6;
      for (let y = 0; y < h; y++) {
        const x = Math.round(x0 + lean * y);
        const f = 0.7 + (y / h) * 0.5;
        t.set(x, 15 - y, [80 * f, 150 * f, 45 * f]);
      }
    }
  },
  dandelion(t) { plantSprite(t, [60, 130, 40], [250, 220, 40], [255, 240, 90]); },
  rose(t) { plantSprite(t, [50, 120, 35], [200, 30, 30], [235, 60, 60]); },
  sapling(t) {
    t.clear();
    for (let y = 9; y < 16; y++) t.set(7, y, [100, 75, 40]);
    for (let y = 2; y < 11; y++) for (let x = 3; x < 13; x++) {
      const dx = x - 7.5, dy = y - 6;
      if (dx * dx + dy * dy < 16 && t.rng() > 0.25) t.set(x, y, [50 + t.rng() * 40, 120 + t.rng() * 50, 30]);
    }
  },
  dead_bush(t) {
    t.clear();
    const c = [120, 85, 40];
    for (let y = 8; y < 16; y++) t.set(7, y, c);
    for (let i = 0; i < 5; i++) { t.set(7 - i, 10 - i, c); t.set(8 + i, 11 - i, c); }
    t.set(4, 4, c); t.set(11, 5, c); t.set(5, 9, c); t.set(10, 9, c);
  },
  wool(t) {
    t.noise([234, 234, 234], 0.08);
    for (let y = 0; y < S; y += 2) for (let x = (y / 2) % 2; x < S; x += 3) t.shade(x, y, 0.9);
  },
  tnt_side(t) {
    t.noise([200, 50, 40], 0.12);
    for (let x = 0; x < S; x++) for (let y = 5; y < 11; y++) t.set(x, y, [230, 225, 215]);
    // "TNT"
    const txt = [
      '###.#..#.###',
      '.#..##.#..#.',
      '.#..#.##..#.',
      '.#..#..#..#.',
    ];
    txt.forEach((row, ry) => { for (let rx = 0; rx < row.length; rx++) if (row[rx] === '#') t.set(2 + rx, 6 + ry, [30, 30, 30]); });
    for (let x = 0; x < S; x += 4) for (let y = 0; y < S; y++) if (y < 5 || y > 10) t.shade(x, y, 0.8);
  },
  tnt_top(t) {
    t.noise([200, 50, 40], 0.12);
    t.rect(6, 6, 4, 4, [230, 225, 215]);
    t.rect(7, 7, 2, 2, [60, 60, 60]);
  },
  tnt_bottom(t) { t.noise([200, 50, 40], 0.12); },
  obsidian(t) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const r = t.rng();
      t.set(x, y, r < 0.15 ? [60, 40, 90] : [20 + r * 14, 14 + r * 10, 32 + r * 20]);
    }
  },
  pumpkin_side(t) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const ridge = (x % 4 === 0) ? 0.75 : 1;
      const f = ridge * (0.9 + t.rng() * 0.15);
      t.set(x, y, [220 * f, 120 * f, 20 * f]);
    }
  },
  pumpkin_top(t) {
    P.pumpkin_side(t);
    t.rect(6, 6, 4, 4, [90, 110, 40]);
    t.rect(7, 7, 2, 2, [70, 90, 30]);
  },
  jack_o_lantern(t) {
    P.pumpkin_side(t);
    const glow = [255, 230, 90];
    t.rect(3, 4, 3, 2, glow); t.rect(10, 4, 3, 2, glow);
    t.rect(3, 9, 10, 2, glow); t.rect(4, 11, 2, 1, glow); t.rect(10, 11, 2, 1, glow); t.rect(7, 11, 2, 1, glow);
  },
  glowstone(t) {
    voronoi(t, 10, (r) => (r < 0.3 ? [255, 235, 160] : r < 0.7 ? [220, 175, 90] : [170, 120, 60]), [130, 90, 50]);
  },
  chest_side(t) {
    planksTile(t, [160, 112, 50]);
    t.border([70, 46, 20]);
    for (let x = 0; x < S; x++) t.set(x, 5, [70, 46, 20]);
  },
  chest_front(t) {
    P.chest_side(t);
    t.rect(7, 4, 2, 4, [200, 200, 200]);
    t.set(7, 7, [60, 60, 60]); t.set(8, 7, [60, 60, 60]);
  },
  chest_top(t) { planksTile(t, [160, 112, 50]); t.border([70, 46, 20]); },
  bed_top(t) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const f = 0.92 + t.rng() * 0.1;
      if (y < 5) t.set(x, y, [235 * f, 235 * f, 235 * f]);
      else t.set(x, y, [175 * f, 30 * f, 30 * f]);
    }
    for (let x = 0; x < S; x++) t.set(x, 5, [130, 20, 20]);
  },
  bed_side(t) {
    planksTile(t, [168, 134, 82]);
    for (let y = 0; y < 8; y++) for (let x = 0; x < S; x++) {
      const f = 0.92 + t.rng() * 0.1;
      t.set(x, y + 7, y < 4 ? [175 * f, 30 * f, 30 * f] : [168 * f * 0.8, 134 * f * 0.8, 82 * f * 0.8]);
    }
    for (let y = 0; y < 7; y++) for (let x = 0; x < S; x++) t.set(x, y, [0, 0, 0], 0);
  },
  iron_block(t) { metalBlock(t, [220, 220, 220]); },
  gold_block(t) { metalBlock(t, [250, 210, 50]); },
  diamond_block(t) { metalBlock(t, [100, 230, 225]); },
  ladder(t) {
    t.clear();
    const wood = [140, 105, 60], dk = [100, 72, 40];
    for (let y = 0; y < S; y++) { t.set(2, y, wood); t.set(3, y, dk); t.set(12, y, wood); t.set(13, y, dk); }
    for (const y of [2, 6, 10, 14]) for (let x = 4; x < 12; x++) { t.set(x, y, wood); t.set(x, y + 1, dk); }
  },
  cobweb(t) {
    t.clear();
    const c = [235, 235, 235, 220];
    for (let i = 0; i < S; i++) { t.set(i, i, c); t.set(15 - i, i, c); t.set(7, i, c); t.set(i, 8, c); }
    for (let a = 0; a < 6.28; a += 0.15) for (const r of [3, 6]) t.set(Math.round(7.5 + Math.cos(a) * r), Math.round(7.5 + Math.sin(a) * r), c);
  },
  stone_slab_top(t) { t.noise([160, 160, 160], 0.08); t.border([110, 110, 110]); },
  stone_slab_side(t) {
    t.noise([160, 160, 160], 0.08);
    for (let x = 0; x < S; x++) { t.set(x, 0, [110, 110, 110]); t.set(x, 7, [110, 110, 110]); t.set(x, 8, [190, 190, 190]); t.set(x, 15, [110, 110, 110]); }
  },
  door_bottom(t) {
    const base = [160, 122, 70];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const f = 0.88 + t.rng() * 0.16;
      let c = [base[0] * f, base[1] * f, base[2] * f];
      if (x % 5 === 0) c = c.map((v) => v * 0.75);
      t.set(x, y, c);
    }
    t.border([96, 70, 38]);
    for (let x = 1; x < 15; x++) t.set(x, 7, [110, 82, 46]);
    t.set(12, 1, [60, 60, 60]); t.set(12, 2, [90, 90, 90]);
  },
  door_top(t) {
    P.door_bottom(t);
    for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) {
      if (x === 7 || x === 8 || y === 7 || y === 8) continue;
      t.set(x, y, [0, 0, 0], 0);
    }
    t.rect(12, 14, 1, 1, [60, 60, 60]);
  },
  door_item(t) {
    t.clear();
    const wood = [160, 122, 70], dk = [96, 70, 38];
    for (let y = 0; y < S; y++) for (let x = 4; x < 12; x++) t.set(x, y, (x === 4 || x === 11 || y === 0 || y === 15 || y === 8) ? dk : wood.map((v) => v * (0.9 + t.rng() * 0.15)));
    for (let y = 2; y < 7; y++) for (let x = 6; x < 10; x++) if (x !== 7 && y !== 4) t.set(x, y, [0, 0, 0], 0);
    t.set(9, 10, [60, 60, 60]);
  },
  farmland(t) {
    t.noise([96, 62, 38], 0.25);
    for (let y = 0; y < S; y += 4) for (let x = 0; x < S; x++) t.shade(x, y, 0.7);
    t.border([80, 52, 30]);
  },
};

for (let s = 0; s < 8; s++) {
  P['wheat_' + s] = (t) => {
    t.clear();
    const h = 3 + Math.round(s * 1.6);
    const ripe = s / 7;
    const stem = [90 + 100 * ripe, 160 - 20 * ripe, 40];
    for (const x0 of [2, 5, 8, 11, 14]) {
      for (let y = 0; y < h; y++) t.set(x0 + ((y >> 2) & 1 ? 0 : -1 + (x0 % 2)), 15 - y, stem);
      if (s >= 5) for (let y = h - 4; y < h; y++) { t.set(x0 - 1, 15 - y, [200 + 40 * ripe, 170 + 30 * ripe, 60]); t.set(x0 + 1, 15 - y, [190 + 40 * ripe, 160 + 30 * ripe, 50]); }
    }
  };
}

// destroy stages
for (let s = 0; s < 10; s++) {
  P['destroy_' + s] = (t) => {
    t.clear();
    const rng = makeRng(1234);
    const cracks = 2 + s * 2;
    for (let c = 0; c < cracks; c++) {
      let x = 7 + Math.floor((rng() - 0.5) * 6), y = 7 + Math.floor((rng() - 0.5) * 6);
      const len = 3 + Math.floor(rng() * (2 + s));
      for (let k = 0; k < len; k++) {
        t.set(x, y, [20, 20, 20], 200);
        x += Math.round((rng() - 0.5) * 2.4); y += Math.round((rng() - 0.5) * 2.4);
      }
    }
  };
}

// ---- items ----
const TOOL_HEADS = {
  pickaxe: [
    '................',
    '....MMMMMM......',
    '...MmmmmmmMM....',
    '....MMMMMmmmM...',
    '..........mMmM..',
    '...........MmM..',
    '............MmM.',
    '............MmM.',
    '.............MM.',
  ],
  axe: [
    '................',
    '.......MM.......',
    '......MmmM......',
    '.....MmmmmM.....',
    '....MmmmmmM.....',
    '.....MmmmM......',
    '......MmM.......',
    '.......M........',
  ],
  shovel: [
    '................',
    '..........MMM...',
    '.........MmmmM..',
    '........MmmmmmM.',
    '........MmmmmmM.',
    '.........MmmmM..',
    '..........MMM...',
  ],
  hoe: [
    '................',
    '....MMMMMMM.....',
    '...MmmmmmmmM....',
    '....MMMMMMmmM...',
    '..........MM....',
  ],
  sword: [
    '..............MM',
    '.............MmM',
    '............MmmM',
    '...........MmmM.',
    '..........MmmM..',
    '.........MmmM...',
    '........MmmM....',
    '...MM..MmmM.....',
    '...MmMMmmM......',
    '....MmmmM.......',
    '.....MmM........',
    '....MMmM........',
    '...M..MM........',
  ],
};

function drawTool(t, type, mat) {
  t.clear();
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const m = hex(mat.color), md = hex(mat.dark);
  const s = [137, 103, 39], sd = [85, 62, 24];
  if (type === 'sword') {
    for (let i = 0; i < 4; i++) { t.set(1 + i, 14 - i, s); t.set(1 + i, 15 - i, sd); }
  } else {
    const top = type === 'shovel' ? 7 : type === 'hoe' ? 3 : 4;
    for (let i = 0; 13 - i >= top; i++) { t.set(2 + i, 13 - i, s); t.set(1 + i, 13 - i, sd); }
  }
  TOOL_HEADS[type].forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === 'm') t.set(x, y, m);
      else if (row[x] === 'M') t.set(x, y, md);
    }
  });
}

const ART = {
  // shape strings: a-z palette keys, '.' empty
  ingot: ['................', '................', '................', '................', '................',
    '.......kkkkk....', '.....kllllllk...', '...kllhhhhlllk..', '..kllllllllllk..', '..kddddddddddk..', '...kkkkkkkkkk...'],
  gem: ['................', '................', '.....kkkkkk.....', '....khhllllk....', '...khhlllllld...', '..kllllllllddk..',
    '...kllllllddk...', '....klllldk.....', '.....kllldk.....', '......kldk......', '.......kk.......'],
  lump: ['................', '................', '................', '.....kkkk.......', '....kllllkk.....', '...klhllllllk...',
    '...kllllllldk...', '..klllllllldk...', '..kllllllddk....', '...kklllddk.....', '.....kkkkk......'],
  stick: ['................', '..............kk', '.............klk', '............kld.', '...........kld..', '..........kld...',
    '.........kld....', '........kld.....', '.......kld......', '......kld.......', '.....kld........', '....kld.........', '...kld..........', '...kd...........'],
  apple: ['................', '........k.......', '.......kg.......', '......gk........', '....kkkkkkk.....', '...kllhlllllk...',
    '..klhhlllllldk..', '..klllllllllldk.', '..kllllllllldk..', '..klllllllllddk.', '...kllllllldk...', '....kddddddk....', '.....kk..kk.....'],
  meat: ['................', '................', '................', '......kkkkk.....', '....kkllllllk...', '...klhllllllldk.',
    '..klhhllwwlllldk', '..kllllwwwllllk.', '..klllllwlllldk.', '...klllllllddk..', '....kkdddddkk...', '......kkkkk.....'],
  bucket: ['................', '................', '...kkkkkkkkkk...', '..kllllllllllk..', '..kkwwwwwwwwkk..', '..kllwwwwwwllk..',
    '...klllllllllk..', '...kllllllllk...', '....klllllldk...', '....kllllllk....', '.....kkkkkk.....'],
  flint: ['................', '................', '......kkk.......', '.....klllk......', '....klhllk......', '....kllllldk....',
    '...kllllllldk...', '...kllllllldk...', '....klllllddk...', '.....kkkkkk.....'],
  string: ['................', '............kk..', '...........kl...', '..........kl....', '.........kl.....', '........kl......',
    '.......kl.......', '......kl........', '....kkl.........', '...kl...........', '..kl............', '..k.............'],
  bone: ['................', '..kk............', '.klk............', '..kllk..........', '...klk..........', '....klk.........',
    '.....klk........', '......klk.......', '.......klk......', '........klk.....', '.........kllk...', '...........klk..', '............kk..'],
  bread: ['................', '................', '................', '.....kkkkkk.....', '...kkhhllllkk...', '..khhlllllllldk.',
    '..klllllllllddk.', '..kdllllllllddk.', '...kddddddddkk..', '....kkkkkkkk....'],
  seeds: ['................', '................', '................', '....k...k.......', '...klk.klk..k...', '....k...k..klk..',
    '..k...k.....k...', '.klk.klk..k.....', '..k...k..klk....', '.........k......'],
  bowl: ['................', '................', '................', '................', '................', '..kkkkkkkkkkkk..',
    '..kwwwwwwwwwwk..', '..klllllllllk...', '...kllllllldk...', '....kllllldk....', '.....kkkkkk.....'],
  wheat: ['................', '..........kk....', '.........kyk....', '........kyyk....', '.......kyyk.....', '......kyyk......',
    '.....kyyk.......', '....kggk........', '...kgk..........', '..kgk...........', '.kgk............', '.kk.............'],
  flintsteel: ['................', '..kkk...........', '.klllk..........', '.kllldk.........', '..kldk..........', '...kk...kkk.....',
    '.......kwwwk....', '......kwwwwk....', '.....kwwwwk.....', '....kwwwwk......', '....kwwwk.......', '.....kkk........'],
};

function drawArt(t, art, pal) {
  t.clear();
  art.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      const c = pal[ch];
      if (c) t.set(x, y + 2, c);
    }
  });
}

function shadePal(base, outline) {
  return {
    k: outline || base.map((v) => v * 0.35),
    l: base,
    h: base.map((v) => Math.min(255, v * 1.35 + 30)),
    d: base.map((v) => v * 0.7),
  };
}

const ARMOR_ART = {
  helmet: ['................', '....kkkkkkkk....', '...kmmmmmmmmk...', '...kmMMMMMMmk...', '...kmk....kmk...', '...kmk....kmk...', '...kkk....kkk...'],
  chestplate: ['..kkk......kkk..', '.kmmk......kmmk.', '.kmmmkkkkkkmmmk.', '.kmmmmmmmmmmmmk.', '.kkmmmmmmmmmmkk.', '...kmmmmmmmmk...',
    '...kmmmMMmmmk...', '...kmmmmmmmmk...', '...kmmmmmmmmk...', '...kMMMMMMMMk...', '...kkkkkkkkkk...'],
  leggings: ['...kkkkkkkkkk...', '...kmmmmmmmmk...', '...kmMMMMMMmk...', '...kmmmkkmmmk...', '...kmmk..kmmk...', '...kmmk..kmmk...',
    '...kmmk..kmmk...', '...kmmk..kmmk...', '...kMMk..kMMk...', '...kkkk..kkkk...'],
  boots: ['................', '................', '..kkkk....kkkk..', '..kmmk....kmmk..', '..kmmk....kmmk..', '.kmmmk....kmmmk.', '.kMMMk....kMMMk.', '.kkkkk....kkkkk.'],
};
const hexc = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function line(t, x0, y0, x1, y1, c) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) t.set(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), c);
}

const ITEM_PAINTERS = {
  leather: (t) => drawArt(t, ART.lump, shadePal([150, 90, 50])),
  bone_meal: (t) => drawArt(t, ART.lump, shadePal([235, 235, 225], [140, 140, 130])),
  raw_chicken: (t) => drawArt(t, ART.meat, { ...shadePal([240, 190, 170]), w: [250, 230, 220] }),
  cooked_chicken: (t) => drawArt(t, ART.meat, { ...shadePal([200, 140, 70]), w: [240, 210, 160] }),
  feather: (t) => { t.clear(); line(t, 3, 13, 12, 2, [150, 150, 150]); for (let i = 0; i < 8; i++) { t.set(5 + i, 9 - i, [245, 245, 245]); t.set(6 + i, 10 - i, [225, 225, 225]); t.set(4 + i, 9 - i, [235, 235, 235]); } },
  arrow: (t) => {
    t.clear();
    line(t, 3, 12, 11, 4, [140, 105, 60]);
    t.set(12, 3, [200, 200, 200]); t.set(11, 3, [160, 160, 160]); t.set(12, 4, [160, 160, 160]); t.set(13, 2, [230, 230, 230]); t.set(10, 3, [120, 120, 120]); t.set(12, 5, [120, 120, 120]);
    for (const [x, y] of [[2, 12], [3, 13], [2, 11], [4, 13], [2, 13], [1, 12], [3, 14]]) t.set(x, y, [240, 240, 240]);
  },
  bow: (t) => {
    t.clear();
    for (let a = Math.PI; a <= Math.PI * 1.5 + 0.01; a += 0.05) t.set(Math.round(14 + Math.cos(a) * 11), Math.round(14 + Math.sin(a) * 11), [120, 85, 40]);
    for (let a = Math.PI; a <= Math.PI * 1.5 + 0.01; a += 0.05) t.set(Math.round(14 + Math.cos(a) * 10), Math.round(14 + Math.sin(a) * 10), [160, 115, 60]);
    line(t, 3, 14, 14, 3, [220, 220, 220]);
  },
  stick: (t) => drawArt(t, ART.stick, { k: [40, 28, 10], l: [150, 110, 50], d: [105, 75, 32] }),
  coal: (t) => drawArt(t, ART.lump, shadePal([45, 45, 50], [15, 15, 15])),
  iron_ingot: (t) => drawArt(t, ART.ingot, shadePal([215, 215, 215])),
  gold_ingot: (t) => drawArt(t, ART.ingot, shadePal([250, 210, 50])),
  diamond: (t) => drawArt(t, ART.gem, shadePal([90, 230, 225])),
  flint: (t) => drawArt(t, ART.flint, shadePal([70, 70, 75], [20, 20, 20])),
  clay_ball: (t) => drawArt(t, ART.lump, shadePal([160, 166, 179])),
  brick: (t) => drawArt(t, ART.ingot, shadePal([170, 80, 55])),
  gunpowder: (t) => drawArt(t, ART.lump, shadePal([100, 100, 100])),
  apple: (t) => drawArt(t, ART.apple, { ...shadePal([210, 30, 30]), g: [60, 150, 40] }),
  golden_apple: (t) => drawArt(t, ART.apple, { ...shadePal([250, 210, 50]), g: [60, 150, 40] }),
  raw_porkchop: (t) => drawArt(t, ART.meat, { ...shadePal([240, 140, 140]), w: [250, 220, 220] }),
  cooked_porkchop: (t) => drawArt(t, ART.meat, { ...shadePal([200, 140, 90]), w: [240, 220, 180] }),
  raw_beef: (t) => drawArt(t, ART.meat, { ...shadePal([200, 50, 50]), w: [240, 200, 200] }),
  steak: (t) => drawArt(t, ART.meat, { ...shadePal([130, 80, 40]), w: [200, 160, 120] }),
  raw_mutton: (t) => drawArt(t, ART.meat, { ...shadePal([220, 80, 80]), w: [250, 240, 230] }),
  cooked_mutton: (t) => drawArt(t, ART.meat, { ...shadePal([160, 100, 60]), w: [230, 200, 160] }),
  rotten_flesh: (t) => drawArt(t, ART.meat, { ...shadePal([150, 90, 60]), w: [100, 140, 70] }),
  bucket: (t) => drawArt(t, ART.bucket, { ...shadePal([200, 200, 200]), w: [60, 60, 60] }),
  water_bucket: (t) => drawArt(t, ART.bucket, { ...shadePal([200, 200, 200]), w: [50, 90, 220] }),
  lava_bucket: (t) => drawArt(t, ART.bucket, { ...shadePal([200, 200, 200]), w: [240, 130, 30] }),
  flint_and_steel: (t) => drawArt(t, ART.flintsteel, { k: [20, 20, 20], l: [180, 180, 180], d: [120, 120, 120], w: [70, 70, 75] }),
  string: (t) => drawArt(t, ART.string, { k: [140, 140, 140], l: [240, 240, 240] }),
  bone: (t) => drawArt(t, ART.bone, { k: [120, 120, 100], l: [240, 240, 225] }),
  bread: (t) => drawArt(t, ART.bread, shadePal([200, 150, 60])),
  wheat_seeds: (t) => drawArt(t, ART.seeds, { k: [40, 90, 20], l: [100, 200, 60] }),
  wheat: (t) => drawArt(t, ART.wheat, { k: [90, 70, 20], y: [220, 190, 80], g: [120, 150, 40] }),
  bowl: (t) => drawArt(t, ART.bowl, { ...shadePal([140, 100, 50]), w: [80, 55, 25] }),
  mushroom_stew: (t) => drawArt(t, ART.bowl, { ...shadePal([140, 100, 50]), w: [200, 140, 90] }),
};
ARMOR_MATERIALS.forEach((m) => ARMOR_SLOTS.forEach((slot) => {
  ITEM_PAINTERS[`armor_${slot}_${m.key}`] = (t) => drawArt(t, ARMOR_ART[slot], { k: [30, 30, 30], m: hexc(m.color), M: hexc(m.dark) });
}));
TOOL_MATERIALS.forEach((m) => TOOL_TYPES.forEach((type) => {
  ITEM_PAINTERS[`tool_${type}_${m.key}`] = (t) => drawTool(t, type, m);
}));

// ---- build everything ----
export const tileIndex = {}; // name -> layer
export const tileCanvases = {}; // name -> 16x16 canvas
export const tileAvgColor = {}; // name -> [r,g,b]
export let atlasTexture = null;
export const iconUrls = {}; // item id -> dataURL
export const iconCanvases = {};

function tileToCanvas(t) {
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(t.data), S, S), 0, 0);
  return c;
}

export function buildTextures() {
  const names = Object.keys(P);
  const tiles = names.map((n) => { const t = new Tile(n); P[n](t); return t; });
  const data = new Uint8Array(S * S * 4 * tiles.length);
  tiles.forEach((t, i) => {
    tileIndex[t.name] = i;
    data.set(t.data, i * S * S * 4);
    tileCanvases[t.name] = tileToCanvas(t);
    let r = 0, g = 0, b = 0, n = 0;
    for (let k = 0; k < S * S; k++) if (t.data[k * 4 + 3] > 100) { r += t.data[k * 4]; g += t.data[k * 4 + 1]; b += t.data[k * 4 + 2]; n++; }
    tileAvgColor[t.name] = n ? [r / n, g / n, b / n] : [128, 128, 128];
  });
  const tex = new THREE.DataArrayTexture(data, S, S, tiles.length);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  atlasTexture = tex;

  // Resolve face layers for each block
  for (const b of BLOCKS) {
    if (!b || !b.tex) continue;
    const L = (n) => {
      if (tileIndex[n] === undefined) { console.warn('missing tile', n); return 0; }
      return tileIndex[n];
    };
    b.faces = {
      top: L(b.tex.top), bottom: L(b.tex.bottom), side: L(b.tex.side),
      front: L(b.tex.front || b.tex.side),
    };
    if (b.stages) b.stageLayers = Array.from({ length: b.stages }, (_, i) => L(`${b.tex.side.replace(/_\d+$/, '')}_${i}`));
  }
  buildIcons();
}

function buildIcons() {
  const N = 32;
  for (const it of ITEMS) {
    if (!it) continue;
    const c = document.createElement('canvas');
    c.width = N; c.height = N;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    if (it.isBlock) {
      if (!it.tex) continue;
      if (it.flatIcon) {
        ctx.drawImage(tileCanvases[it.flatIcon], 0, 0, N, N);
      } else if (it.render === 'cross' || it.render === 'torch' || it.render === 'ladder') {
        ctx.drawImage(tileCanvases[it.tex.side], 0, 0, N, N);
      } else {
        drawIso(ctx, it);
      }
    } else {
      const painter = ITEM_PAINTERS[it.icon];
      const t = new Tile(it.icon);
      if (painter) painter(t); else { t.noise([255, 0, 255], 0.2); }
      tileCanvases['item_' + it.icon] = tileToCanvas(t);
      ctx.drawImage(tileCanvases['item_' + it.icon], 0, 0, N, N);
    }
    iconCanvases[it.id] = c;
    iconUrls[it.id] = c.toDataURL();
  }
}

function drawIso(ctx, b) {
  const top = tileCanvases[b.tex.top];
  const side = tileCanvases[b.tex.side];
  const front = tileCanvases[b.tex.front || b.tex.side];
  let h = 1, inset = 0;
  if (b.render === 'box') { h = (b.box[4] - b.box[1]) / 16; inset = b.box[0] / 16; }
  if (b.shape === 'slab') h = 0.5;
  const k = 1 - inset * 2;
  const sx = 15 / 16 * k, sy = 7 / 16 * k;
  const ox = 1 + 15 * inset, oy = 8;
  const dropTop = (1 - h) * 16;
  // top face
  ctx.setTransform(sx, -sy, sx, sy, ox, oy + dropTop);
  ctx.drawImage(top, 0, 0);
  // left face (front)
  ctx.setTransform(sx, sy, 0, h, ox, oy + dropTop);
  ctx.drawImage(front, 0, 16 - 16 * h, 16, 16 * h, 0, 0, 16, 16);
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(0, 0, 16, 16);
  // right face
  ctx.setTransform(sx, -sy, 0, h, ox + 16 * sx, oy + dropTop + 16 * sy);
  ctx.drawImage(side, 0, 16 - 16 * h, 16, 16 * h, 0, 0, 16, 16);
  ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.fillRect(0, 0, 16, 16);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

export function itemTileCanvas(id) {
  const it = ITEMS[id];
  if (!it) return null;
  if (it.isBlock) return tileCanvases[it.tex.side];
  return tileCanvases['item_' + it.icon];
}

// Canvas-based textures for mobs (painted per face).
export function paintCanvas(w, h, fn) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  fn(ctx, w, h, makeRng(w * 31 + h));
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}
