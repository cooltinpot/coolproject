// Item stacks, inventory container, crafting & smelting.
import { B, I, ITEMS, TOOL_MATERIALS, TOOL_TYPES, toolId, maxStack, ARMOR_MATERIALS, ARMOR_SLOTS, armorId } from './blocks.js';

export function stack(id, count = 1, dmg = 0) { return { id, count, dmg }; }
export function cloneStack(s) { return s ? { id: s.id, count: s.count, dmg: s.dmg || 0 } : null; }
export function sameItem(a, b) { return a && b && a.id === b.id && (a.dmg || 0) === (b.dmg || 0) && !ITEMS[a.id].durability; }

export class Inventory {
  constructor(size = 36) {
    this.slots = new Array(size).fill(null);
    this.armor = [null, null, null, null]; // helmet, chestplate, leggings, boots
    this.selected = 0;
    this.onChange = null;
  }
  changed() { if (this.onChange) this.onChange(); }
  get held() { return this.slots[this.selected]; }
  set held(s) { this.slots[this.selected] = s; this.changed(); }

  // Adds a stack; returns number of items that did not fit.
  add(s) {
    if (!s) return 0;
    let left = s.count;
    const max = maxStack(s.id);
    // merge into existing stacks (hotbar first)
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      const t = this.slots[i];
      if (t && sameItem(t, s) && t.count < max) {
        const n = Math.min(left, max - t.count);
        t.count += n; left -= n;
      }
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (!this.slots[i]) {
        const n = Math.min(left, max);
        this.slots[i] = { id: s.id, count: n, dmg: s.dmg || 0 };
        left -= n;
      }
    }
    this.changed();
    return left;
  }

  removeItem(id, n = 1) {
    for (let i = this.slots.length - 1; i >= 0 && n > 0; i--) {
      const s = this.slots[i];
      if (!s || s.id !== id) continue;
      const k = Math.min(n, s.count);
      s.count -= k; n -= k;
      if (s.count <= 0) this.slots[i] = null;
    }
    this.changed();
    return n === 0;
  }

  count(id) { let n = 0; for (const s of this.slots) if (s && s.id === id) n += s.count; return n; }

  consumeHeld(n = 1) {
    const s = this.slots[this.selected];
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) this.slots[this.selected] = null;
    this.changed();
  }

  // Damage held tool; returns true if it broke.
  damageHeld(amount = 1) {
    const s = this.slots[this.selected];
    if (!s) return false;
    const def = ITEMS[s.id];
    if (!def.durability) return false;
    s.dmg = (s.dmg || 0) + amount;
    if (s.dmg >= def.durability) { this.slots[this.selected] = null; this.changed(); return true; }
    this.changed();
    return false;
  }

  armorPoints() {
    let n = 0;
    for (const a of this.armor) if (a) n += ITEMS[a.id].armor.defense;
    return n;
  }

  damageArmor(amount) {
    const d = Math.max(1, Math.floor(amount / 4));
    for (let i = 0; i < 4; i++) {
      const a = this.armor[i];
      if (!a) continue;
      a.dmg = (a.dmg || 0) + d;
      if (a.dmg >= ITEMS[a.id].durability) this.armor[i] = null;
    }
    this.changed();
  }

  toJSON() { return { slots: this.slots, selected: this.selected, armor: this.armor }; }
  load(o) {
    if (!o) return;
    this.slots = o.slots.map((s) => (s && ITEMS[s.id] ? { id: s.id, count: s.count, dmg: s.dmg || 0 } : null));
    while (this.slots.length < 36) this.slots.push(null);
    this.armor = (o.armor || [null, null, null, null]).map((s) => (s && ITEMS[s.id] ? { id: s.id, count: 1, dmg: s.dmg || 0 } : null));
    this.selected = o.selected || 0;
  }
}

// ---------------- Crafting ----------------
const LOGS = [B.OAK_LOG, B.BIRCH_LOG, B.SPRUCE_LOG];
const RECIPES = [];
function shaped(pattern, key, result, count = 1) { RECIPES.push({ type: 'shaped', pattern, key, result, count }); }
function shapeless(ingredients, result, count = 1) { RECIPES.push({ type: 'shapeless', ingredients, result, count }); }

for (const log of LOGS) shapeless([log], B.PLANKS, 4);
shaped(['P', 'P'], { P: B.PLANKS }, I.STICK, 4);
shaped(['PP', 'PP'], { P: B.PLANKS }, B.CRAFTING_TABLE);
shaped(['CCC', 'C C', 'CCC'], { C: B.COBBLE }, B.FURNACE);
shaped(['PPP', 'P P', 'PPP'], { P: B.PLANKS }, B.CHEST);
shaped(['C', 'S'], { C: I.COAL, S: I.STICK }, B.TORCH, 4);
shaped(['SS', 'SS'], { S: B.SAND }, B.SANDSTONE);
shaped(['BB', 'BB'], { B: I.BRICK }, B.BRICKS);
shaped(['SS', 'SS'], { S: B.STONE }, B.STONE_BRICKS, 4);
shaped(['PPP', 'SSS', 'PPP'], { P: B.PLANKS, S: I.STICK }, B.BOOKSHELF);
shaped(['GSG', 'SGS', 'GSG'], { G: I.GUNPOWDER, S: B.SAND }, B.TNT);
shapeless([I.IRON_INGOT, I.FLINT], I.FLINT_AND_STEEL);
shaped(['I I', ' I '], { I: I.IRON_INGOT }, I.BUCKET);
shaped(['SS', 'SS'], { S: I.STRING }, B.WOOL);
shaped(['WWW', 'PPP'], { W: B.WOOL, P: B.PLANKS }, B.BED);
shaped(['P', 'T'], { P: B.PUMPKIN, T: B.TORCH }, B.JACK_O_LANTERN);
shaped(['S S', 'SSS', 'S S'], { S: I.STICK }, B.LADDER, 3);
shaped(['WWW'], { W: I.WHEAT }, I.BREAD);
shaped(['GGG', 'GAG', 'GGG'], { G: I.GOLD_INGOT, A: I.APPLE }, I.GOLDEN_APPLE);
shaped(['P P', ' P '], { P: B.PLANKS }, I.BOWL, 4);
shaped(['CC', 'CC'], { C: I.CLAY_BALL }, B.CLAY);
shaped(['GG', 'GG'], { G: B.GLASS }, B.GLOWSTONE); // stand-in for nether glowstone
shapeless([B.COBBLE, B.TALL_GRASS], B.MOSSY_COBBLE);
for (const [ing, blk] of [[I.IRON_INGOT, B.IRON_BLOCK], [I.GOLD_INGOT, B.GOLD_BLOCK], [I.DIAMOND, B.DIAMOND_BLOCK]]) {
  shaped(['XXX', 'XXX', 'XXX'], { X: ing }, blk);
  shapeless([blk], ing, 9);
}
const TOOL_PATTERNS = {
  pickaxe: ['XXX', ' S ', ' S '],
  axe: ['XX', 'XS', ' S'],
  shovel: ['X', 'S', 'S'],
  sword: ['X', 'X', 'S'],
  hoe: ['XX', ' S', ' S'],
};
const TOOL_MAT_ITEM = { wood: B.PLANKS, stone: B.COBBLE, iron: I.IRON_INGOT, gold: I.GOLD_INGOT, diamond: I.DIAMOND };
TOOL_MATERIALS.forEach((m, mi) => TOOL_TYPES.forEach((t) => {
  shaped(TOOL_PATTERNS[t], { X: TOOL_MAT_ITEM[m.key], S: I.STICK }, toolId(mi, t));
}));
const ARMOR_PATTERNS = [['XXX', 'X X'], ['X X', 'XXX', 'XXX'], ['XXX', 'X X', 'X X'], ['X X', 'X X']];
const ARMOR_MAT_ITEM = { leather: I.LEATHER, gold: I.GOLD_INGOT, iron: I.IRON_INGOT, diamond: I.DIAMOND };
ARMOR_MATERIALS.forEach((m, mi) => ARMOR_SLOTS.forEach((_, si) => shaped(ARMOR_PATTERNS[si], { X: ARMOR_MAT_ITEM[m.key] }, armorId(mi, si))));
shaped([' TS', 'T S', ' TS'], { T: I.STICK, S: I.STRING }, I.BOW);
shaped(['F', 'S', 'E'], { F: I.FLINT, S: I.STICK, E: I.FEATHER }, I.ARROW, 4);
shapeless([I.BONE], I.BONE_MEAL, 3);
shaped(['XXX'], { X: B.PLANKS }, B.OAK_SLAB, 6);
shaped(['XXX'], { X: B.STONE }, B.STONE_SLAB, 6);
shaped(['XXX'], { X: B.COBBLE }, B.COBBLE_SLAB, 6);
for (const [mat, out] of [[B.PLANKS, B.OAK_STAIRS], [B.COBBLE, B.COBBLE_STAIRS], [B.STONE_BRICKS, B.STONE_BRICK_STAIRS], [B.BRICKS, B.BRICK_STAIRS]]) {
  shaped(['X  ', 'XX ', 'XXX'], { X: mat }, out, 4);
}
shaped(['XX', 'XX', 'XX'], { X: B.PLANKS }, B.OAK_DOOR, 3);
export { RECIPES };

function matchKey(k, id) { return Array.isArray(k) ? k.includes(id) : k === id; }

// grid: array of stacks (length w*h)
export function matchRecipe(grid, w, h) {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  const ids = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = grid[y * w + x];
    if (s) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); ids.push(s.id); }
  }
  if (maxX < 0) return null;
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const at = (x, y) => { const s = grid[(y + minY) * w + x + minX]; return s ? s.id : 0; };
  for (const r of RECIPES) {
    if (r.type === 'shapeless') {
      if (r.ingredients.length !== ids.length) continue;
      const pool = ids.slice();
      let ok = true;
      for (const ing of r.ingredients) {
        const j = pool.findIndex((id) => matchKey(ing, id));
        if (j < 0) { ok = false; break; }
        pool.splice(j, 1);
      }
      if (ok) return { id: r.result, count: r.count, dmg: 0 };
    } else {
      const ph = r.pattern.length, pw = Math.max(...r.pattern.map((s) => s.length));
      if (ph !== bh || pw !== bw) continue;
      for (const mirror of [false, true]) {
        let ok = true;
        for (let y = 0; y < ph && ok; y++) for (let x = 0; x < pw && ok; x++) {
          const ch = r.pattern[y][mirror ? pw - 1 - x : x] || ' ';
          const id = at(x, y);
          if (ch === ' ') { if (id) ok = false; }
          else if (!matchKey(r.key[ch], id)) ok = false;
        }
        if (ok) return { id: r.result, count: r.count, dmg: 0 };
      }
    }
  }
  return null;
}

// ---------------- Smelting ----------------
export const SMELTING = {
  [B.IRON_ORE]: I.IRON_INGOT, [B.GOLD_ORE]: I.GOLD_INGOT, [B.SAND]: B.GLASS, [B.COBBLE]: B.STONE,
  [B.OAK_LOG]: I.COAL, [B.BIRCH_LOG]: I.COAL, [B.SPRUCE_LOG]: I.COAL, [I.CLAY_BALL]: I.BRICK,
  [I.RAW_PORK]: I.COOKED_PORK, [I.RAW_CHICKEN]: I.COOKED_CHICKEN, [I.RAW_BEEF]: I.STEAK, [I.RAW_MUTTON]: I.COOKED_MUTTON,
  [B.CLAY]: B.BRICKS, [B.STONE]: B.STONE_BRICKS, [B.DIAMOND_ORE]: I.DIAMOND, [B.COAL_ORE]: I.COAL,
};
const SMELT_TIME = 10;

export function newFurnace() { return { type: 'furnace', slots: [null, null, null], burn: 0, burnMax: 0, cook: 0 }; }
export function newChest() { return { type: 'chest', slots: new Array(27).fill(null) }; }

// Returns true if the lit state changed.
export function tickFurnace(te, dt) {
  const [input, fuel, output] = te.slots;
  const wasLit = te.burn > 0;
  if (te.burn > 0) te.burn -= dt;
  const res = input ? SMELTING[input.id] : undefined;
  const canSmelt = res !== undefined && (!output || (output.id === res && output.count < maxStack(res)));
  if (te.burn <= 0 && canSmelt && fuel && ITEMS[fuel.id].fuel) {
    te.burnMax = ITEMS[fuel.id].fuel;
    te.burn = te.burnMax;
    if (fuel.id === I.LAVA_BUCKET) te.slots[1] = { id: I.BUCKET, count: 1, dmg: 0 };
    else { fuel.count--; if (fuel.count <= 0) te.slots[1] = null; }
  }
  if (te.burn > 0 && canSmelt) {
    te.cook += dt;
    if (te.cook >= SMELT_TIME) {
      te.cook = 0;
      input.count--;
      if (input.count <= 0) te.slots[0] = null;
      if (te.slots[2]) te.slots[2].count++;
      else te.slots[2] = { id: res, count: 1, dmg: 0 };
    }
  } else {
    te.cook = Math.max(0, te.cook - dt * 2);
  }
  if (te.burn < 0) te.burn = 0;
  return wasLit !== (te.burn > 0);
}

export function dungeonLoot(rng) {
  const slots = new Array(27).fill(null);
  const table = [
    [I.BREAD, 1, 3, 0.5], [I.WHEAT, 2, 6, 0.4], [I.IRON_INGOT, 1, 5, 0.4], [I.GOLD_INGOT, 1, 4, 0.25],
    [I.DIAMOND, 1, 2, 0.1], [I.STRING, 1, 4, 0.4], [I.GUNPOWDER, 1, 4, 0.4], [I.APPLE, 1, 3, 0.3],
    [I.BUCKET, 1, 1, 0.2], [I.GOLDEN_APPLE, 1, 1, 0.05], [I.BONE, 1, 6, 0.4], [I.COAL, 2, 8, 0.4],
    [I.WHEAT_SEEDS, 2, 5, 0.3], [toolId(2, 'pickaxe'), 1, 1, 0.08],
  ];
  for (const [id, mn, mx, p] of table) {
    if (rng() < p) {
      let slot;
      do { slot = Math.floor(rng() * 27); } while (slots[slot]);
      slots[slot] = { id, count: mn + Math.floor(rng() * (mx - mn + 1)), dmg: 0 };
    }
  }
  return slots;
}
