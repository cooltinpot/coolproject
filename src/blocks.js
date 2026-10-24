// Block + item registry. Ids < 256 are blocks (and also their own item), ids >= 256 are pure items.

export const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, COBBLE: 4, BEDROCK: 5, SAND: 6, GRAVEL: 7,
  OAK_LOG: 8, OAK_LEAVES: 9, PLANKS: 10, GLASS: 11, WATER: 12, LAVA: 13,
  COAL_ORE: 14, IRON_ORE: 15, GOLD_ORE: 16, DIAMOND_ORE: 17, CRAFTING_TABLE: 18,
  FURNACE: 19, FURNACE_LIT: 20, TORCH: 21, SNOWY_GRASS: 22, ICE: 23, CACTUS: 24,
  SANDSTONE: 25, BRICKS: 26, BOOKSHELF: 27, TALL_GRASS: 28, DANDELION: 29, ROSE: 30,
  BIRCH_LOG: 31, BIRCH_LEAVES: 32, WOOL: 33, TNT: 34, OBSIDIAN: 35, STONE_BRICKS: 36,
  CLAY: 37, PUMPKIN: 38, GLOWSTONE: 39, SNOW_BLOCK: 40, MOSSY_COBBLE: 41, CHEST: 42,
  BED: 43, IRON_BLOCK: 44, GOLD_BLOCK: 45, DIAMOND_BLOCK: 46, SAPLING: 47, DEAD_BUSH: 48,
  SPRUCE_LOG: 49, SPRUCE_LEAVES: 50, JACK_O_LANTERN: 51, LADDER: 52, COBWEB: 53, FARMLAND: 54, WHEAT: 55,
};

export const I = {
  STICK: 256, COAL: 257, IRON_INGOT: 258, GOLD_INGOT: 259, DIAMOND: 260, FLINT: 261,
  CLAY_BALL: 262, BRICK: 263, GUNPOWDER: 264, APPLE: 265, RAW_PORK: 266, COOKED_PORK: 267,
  RAW_BEEF: 268, STEAK: 269, ROTTEN_FLESH: 270, BUCKET: 271, WATER_BUCKET: 272,
  LAVA_BUCKET: 273, FLINT_AND_STEEL: 274, RAW_MUTTON: 275, COOKED_MUTTON: 276, STRING: 277,
  BONE: 278, BREAD: 279, WHEAT_SEEDS: 280, GOLDEN_APPLE: 281, BOWL: 282, MUSHROOM_STEW: 283, WHEAT: 284,
};

export const TOOL_MATERIALS = [
  { key: 'wood', name: 'Wooden', tier: 0, speed: 2, durability: 59, dmg: 0, color: '#9a7440', dark: '#6b4f26' },
  { key: 'stone', name: 'Stone', tier: 1, speed: 4, durability: 131, dmg: 1, color: '#8f8f8f', dark: '#5e5e5e' },
  { key: 'iron', name: 'Iron', tier: 2, speed: 6, durability: 250, dmg: 2, color: '#e6e6e6', dark: '#a8a8a8' },
  { key: 'gold', name: 'Golden', tier: 0, speed: 12, durability: 32, dmg: 0, color: '#f7e14b', dark: '#c9a01b' },
  { key: 'diamond', name: 'Diamond', tier: 3, speed: 8, durability: 1561, dmg: 3, color: '#5ff0e0', dark: '#1fa89a' },
];
export const TOOL_TYPES = ['pickaxe', 'axe', 'shovel', 'sword', 'hoe'];
const TOOL_BASE_DMG = { pickaxe: 2, axe: 3, shovel: 1.5, sword: 4, hoe: 1 };
export const TOOL_BASE = 300;
export function toolId(matIdx, type) { return TOOL_BASE + matIdx * TOOL_TYPES.length + TOOL_TYPES.indexOf(type); }

export const BLOCKS = [];
export const ITEMS = [];

function block(id, name, display, props) {
  const def = Object.assign({
    id, name, display,
    tex: null,
    render: 'cube', // cube | cross | fluid | box | none
    layer: 'opaque', // opaque | cutout | translucent
    solid: true,
    opaque: true,
    light: 0,
    lightFilter: 0,
    hardness: 1,
    tool: null,
    level: -1, // required harvest tier; -1 = no tool required
    drops: null,
    tint: null,
    sound: 'stone',
    replaceable: false,
    gravity: false,
    needsSupport: false,
    fluid: null,
    interact: null,
    stack: 64,
    isBlock: true,
    flammable: false,
    selectable: true,
  }, props);
  BLOCKS[id] = def;
  ITEMS[id] = def;
  return def;
}

function item(id, name, display, props = {}) {
  const def = Object.assign({ id, name, display, stack: 64, isBlock: false, icon: name }, props);
  ITEMS[id] = def;
  return def;
}

const T = (all) => ({ top: all, bottom: all, side: all });

block(B.AIR, 'air', 'Air', { render: 'none', solid: false, opaque: false, replaceable: true, selectable: false, hardness: 0 });
block(B.GRASS, 'grass', 'Grass Block', { tex: { top: 'grass_top', bottom: 'dirt', side: 'grass_side' }, hardness: 0.6, tool: 'shovel', drops: () => [[B.DIRT, 1]], sound: 'grass', tintTop: true });
block(B.DIRT, 'dirt', 'Dirt', { tex: T('dirt'), hardness: 0.5, tool: 'shovel', sound: 'gravel' });
block(B.STONE, 'stone', 'Stone', { tex: T('stone'), hardness: 1.5, tool: 'pickaxe', level: 0, drops: () => [[B.COBBLE, 1]] });
block(B.COBBLE, 'cobblestone', 'Cobblestone', { tex: T('cobblestone'), hardness: 2, tool: 'pickaxe', level: 0 });
block(B.BEDROCK, 'bedrock', 'Bedrock', { tex: T('bedrock'), hardness: -1 });
block(B.SAND, 'sand', 'Sand', { tex: T('sand'), hardness: 0.5, tool: 'shovel', sound: 'sand', gravity: true });
block(B.GRAVEL, 'gravel', 'Gravel', { tex: T('gravel'), hardness: 0.6, tool: 'shovel', sound: 'gravel', gravity: true, drops: (rng) => rng() < 0.1 ? [[I.FLINT, 1]] : [[B.GRAVEL, 1]] });
block(B.OAK_LOG, 'oak_log', 'Oak Log', { tex: { top: 'oak_log_top', bottom: 'oak_log_top', side: 'oak_log' }, hardness: 2, tool: 'axe', sound: 'wood', flammable: true });
block(B.OAK_LEAVES, 'oak_leaves', 'Oak Leaves', { tex: T('oak_leaves'), layer: 'cutout', opaque: false, lightFilter: 1, hardness: 0.2, sound: 'grass', tint: 'foliage', flammable: true,
  drops: (rng) => { const d = []; if (rng() < 0.06) d.push([B.SAPLING, 1]); if (rng() < 0.02) d.push([I.APPLE, 1]); if (rng() < 0.03) d.push([I.STICK, 1]); return d; } });
block(B.PLANKS, 'planks', 'Oak Planks', { tex: T('planks'), hardness: 2, tool: 'axe', sound: 'wood', flammable: true });
block(B.GLASS, 'glass', 'Glass', { tex: T('glass'), layer: 'cutout', opaque: false, hardness: 0.3, sound: 'glass', drops: () => [] });
block(B.WATER, 'water', 'Water', { tex: T('water'), render: 'fluid', layer: 'translucent', solid: false, opaque: false, lightFilter: 2, hardness: 100, replaceable: true, fluid: 'water', selectable: false, drops: () => [] });
block(B.LAVA, 'lava', 'Lava', { tex: T('lava'), render: 'fluid', layer: 'opaque', solid: false, opaque: false, light: 15, hardness: 100, replaceable: true, fluid: 'lava', selectable: false, drops: () => [] });
block(B.COAL_ORE, 'coal_ore', 'Coal Ore', { tex: T('coal_ore'), hardness: 3, tool: 'pickaxe', level: 0, drops: () => [[I.COAL, 1]] });
block(B.IRON_ORE, 'iron_ore', 'Iron Ore', { tex: T('iron_ore'), hardness: 3, tool: 'pickaxe', level: 1 });
block(B.GOLD_ORE, 'gold_ore', 'Gold Ore', { tex: T('gold_ore'), hardness: 3, tool: 'pickaxe', level: 2 });
block(B.DIAMOND_ORE, 'diamond_ore', 'Diamond Ore', { tex: T('diamond_ore'), hardness: 3, tool: 'pickaxe', level: 2, drops: () => [[I.DIAMOND, 1]] });
block(B.CRAFTING_TABLE, 'crafting_table', 'Crafting Table', { tex: { top: 'crafting_table_top', bottom: 'planks', side: 'crafting_table_side', front: 'crafting_table_front' }, hardness: 2.5, tool: 'axe', sound: 'wood', interact: 'crafting' });
block(B.FURNACE, 'furnace', 'Furnace', { tex: { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_front' }, hardness: 3.5, tool: 'pickaxe', level: 0, interact: 'furnace', facing: true });
block(B.FURNACE_LIT, 'furnace_lit', 'Lit Furnace', { tex: { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_front_lit' }, hardness: 3.5, tool: 'pickaxe', level: 0, interact: 'furnace', facing: true, light: 13, drops: () => [[B.FURNACE, 1]], hidden: true });
block(B.TORCH, 'torch', 'Torch', { tex: T('torch'), render: 'torch', layer: 'cutout', solid: false, opaque: false, light: 14, hardness: 0, sound: 'wood', needsSupport: true, replaceable: false });
block(B.SNOWY_GRASS, 'snowy_grass', 'Snowy Grass', { tex: { top: 'snow', bottom: 'dirt', side: 'snowy_grass_side' }, hardness: 0.6, tool: 'shovel', sound: 'snow', drops: () => [[B.DIRT, 1]] });
block(B.ICE, 'ice', 'Ice', { tex: T('ice'), layer: 'translucent', opaque: false, lightFilter: 1, hardness: 0.5, tool: 'pickaxe', sound: 'glass', drops: () => [], slippery: true });
block(B.CACTUS, 'cactus', 'Cactus', { tex: { top: 'cactus_top', bottom: 'cactus_top', side: 'cactus_side' }, render: 'box', box: [1, 0, 1, 15, 16, 15], layer: 'cutout', opaque: false, hardness: 0.4, sound: 'cloth', needsSupport: true, hurts: true });
block(B.SANDSTONE, 'sandstone', 'Sandstone', { tex: { top: 'sandstone_top', bottom: 'sandstone_top', side: 'sandstone' }, hardness: 0.8, tool: 'pickaxe', level: 0 });
block(B.BRICKS, 'bricks', 'Bricks', { tex: T('bricks'), hardness: 2, tool: 'pickaxe', level: 0 });
block(B.BOOKSHELF, 'bookshelf', 'Bookshelf', { tex: { top: 'planks', bottom: 'planks', side: 'bookshelf' }, hardness: 1.5, tool: 'axe', sound: 'wood', flammable: true });
block(B.TALL_GRASS, 'tall_grass', 'Grass', { tex: T('tall_grass'), render: 'cross', layer: 'cutout', solid: false, opaque: false, hardness: 0, sound: 'grass', tint: 'grass', replaceable: true, needsSupport: true, drops: (rng) => rng() < 0.12 ? [[I.WHEAT_SEEDS, 1]] : [] });
block(B.DANDELION, 'dandelion', 'Dandelion', { tex: T('dandelion'), render: 'cross', layer: 'cutout', solid: false, opaque: false, hardness: 0, sound: 'grass', needsSupport: true });
block(B.ROSE, 'rose', 'Rose', { tex: T('rose'), render: 'cross', layer: 'cutout', solid: false, opaque: false, hardness: 0, sound: 'grass', needsSupport: true });
block(B.BIRCH_LOG, 'birch_log', 'Birch Log', { tex: { top: 'birch_log_top', bottom: 'birch_log_top', side: 'birch_log' }, hardness: 2, tool: 'axe', sound: 'wood', flammable: true });
block(B.BIRCH_LEAVES, 'birch_leaves', 'Birch Leaves', { tex: T('birch_leaves'), layer: 'cutout', opaque: false, lightFilter: 1, hardness: 0.2, sound: 'grass', tint: 'birch', flammable: true,
  drops: (rng) => { const d = []; if (rng() < 0.06) d.push([B.SAPLING, 1]); if (rng() < 0.03) d.push([I.STICK, 1]); return d; } });
block(B.WOOL, 'wool', 'White Wool', { tex: T('wool'), hardness: 0.8, sound: 'cloth', flammable: true });
block(B.TNT, 'tnt', 'TNT', { tex: { top: 'tnt_top', bottom: 'tnt_bottom', side: 'tnt_side' }, hardness: 0, sound: 'grass', interact: 'tnt' });
block(B.OBSIDIAN, 'obsidian', 'Obsidian', { tex: T('obsidian'), hardness: 50, tool: 'pickaxe', level: 3, blastProof: true });
block(B.STONE_BRICKS, 'stone_bricks', 'Stone Bricks', { tex: T('stone_bricks'), hardness: 1.5, tool: 'pickaxe', level: 0 });
block(B.CLAY, 'clay', 'Clay', { tex: T('clay'), hardness: 0.6, tool: 'shovel', sound: 'gravel', drops: () => [[I.CLAY_BALL, 4]] });
block(B.PUMPKIN, 'pumpkin', 'Pumpkin', { tex: { top: 'pumpkin_top', bottom: 'pumpkin_top', side: 'pumpkin_side', front: 'pumpkin_side' }, hardness: 1, tool: 'axe', sound: 'wood', facing: true });
block(B.GLOWSTONE, 'glowstone', 'Glowstone', { tex: T('glowstone'), hardness: 0.3, light: 15, sound: 'glass' });
block(B.SNOW_BLOCK, 'snow_block', 'Snow Block', { tex: T('snow'), hardness: 0.2, tool: 'shovel', sound: 'snow' });
block(B.MOSSY_COBBLE, 'mossy_cobblestone', 'Mossy Cobblestone', { tex: T('mossy_cobblestone'), hardness: 2, tool: 'pickaxe', level: 0 });
block(B.CHEST, 'chest', 'Chest', { tex: { top: 'chest_top', bottom: 'chest_top', side: 'chest_side', front: 'chest_front' }, render: 'box', box: [1, 0, 1, 15, 14, 15], layer: 'cutout', opaque: false, hardness: 2.5, tool: 'axe', sound: 'wood', interact: 'chest', facing: true });
block(B.BED, 'bed', 'Bed', { tex: { top: 'bed_top', bottom: 'planks', side: 'bed_side' }, render: 'box', box: [0, 0, 0, 16, 9, 16], layer: 'cutout', opaque: false, hardness: 0.2, sound: 'cloth', interact: 'bed', stack: 1 });
block(B.IRON_BLOCK, 'iron_block', 'Block of Iron', { tex: T('iron_block'), hardness: 5, tool: 'pickaxe', level: 1, sound: 'metal' });
block(B.GOLD_BLOCK, 'gold_block', 'Block of Gold', { tex: T('gold_block'), hardness: 3, tool: 'pickaxe', level: 2, sound: 'metal' });
block(B.DIAMOND_BLOCK, 'diamond_block', 'Block of Diamond', { tex: T('diamond_block'), hardness: 5, tool: 'pickaxe', level: 2, sound: 'metal' });
block(B.SAPLING, 'sapling', 'Oak Sapling', { tex: T('sapling'), render: 'cross', layer: 'cutout', solid: false, opaque: false, hardness: 0, sound: 'grass', needsSupport: true });
block(B.DEAD_BUSH, 'dead_bush', 'Dead Bush', { tex: T('dead_bush'), render: 'cross', layer: 'cutout', solid: false, opaque: false, hardness: 0, sound: 'grass', replaceable: true, needsSupport: true, drops: (rng) => rng() < 0.5 ? [[I.STICK, 1]] : [] });
block(B.SPRUCE_LOG, 'spruce_log', 'Spruce Log', { tex: { top: 'spruce_log_top', bottom: 'spruce_log_top', side: 'spruce_log' }, hardness: 2, tool: 'axe', sound: 'wood', flammable: true });
block(B.SPRUCE_LEAVES, 'spruce_leaves', 'Spruce Leaves', { tex: T('spruce_leaves'), layer: 'cutout', opaque: false, lightFilter: 1, hardness: 0.2, sound: 'grass', tint: 'spruce', flammable: true,
  drops: (rng) => { const d = []; if (rng() < 0.05) d.push([B.SAPLING, 1]); if (rng() < 0.03) d.push([I.STICK, 1]); return d; } });
block(B.JACK_O_LANTERN, 'jack_o_lantern', "Jack o'Lantern", { tex: { top: 'pumpkin_top', bottom: 'pumpkin_top', side: 'pumpkin_side', front: 'jack_o_lantern' }, hardness: 1, tool: 'axe', sound: 'wood', light: 15, facing: true });
block(B.LADDER, 'ladder', 'Ladder', { tex: T('ladder'), render: 'ladder', layer: 'cutout', solid: false, opaque: false, hardness: 0.4, tool: 'axe', sound: 'wood', climbable: true, facing: true });
block(B.FARMLAND, 'farmland', 'Farmland', { tex: { top: 'farmland', bottom: 'dirt', side: 'dirt' }, render: 'box', box: [0, 0, 0, 16, 15, 16], hardness: 0.6, tool: 'shovel', sound: 'gravel', drops: () => [[B.DIRT, 1]] });
block(B.WHEAT, 'wheat_crop', 'Wheat Crops', { tex: T('wheat_7'), render: 'cross', layer: 'cutout', solid: false, opaque: false, hardness: 0, sound: 'grass', needsSupport: true, stages: 8, hidden: true,
  drops: (rng, meta) => meta >= 7 ? [[I.WHEAT, 1], [I.WHEAT_SEEDS, 1 + Math.floor(rng() * 3)]] : [[I.WHEAT_SEEDS, 1]] });
block(B.COBWEB, 'cobweb', 'Cobweb', { tex: T('cobweb'), render: 'cross', layer: 'cutout', solid: false, opaque: false, hardness: 4, tool: 'sword', sound: 'cloth', web: true, drops: () => [[I.STRING, 1]] });

// Planks from birch/spruce logs share the oak plank block to keep things simple.

item(I.STICK, 'stick', 'Stick', { fuel: 5 });
item(I.COAL, 'coal', 'Coal', { fuel: 80 });
item(I.IRON_INGOT, 'iron_ingot', 'Iron Ingot');
item(I.GOLD_INGOT, 'gold_ingot', 'Gold Ingot');
item(I.DIAMOND, 'diamond', 'Diamond');
item(I.FLINT, 'flint', 'Flint');
item(I.CLAY_BALL, 'clay_ball', 'Clay Ball');
item(I.BRICK, 'brick', 'Brick');
item(I.GUNPOWDER, 'gunpowder', 'Gunpowder');
item(I.APPLE, 'apple', 'Apple', { food: { hunger: 4, sat: 2.4 } });
item(I.RAW_PORK, 'raw_porkchop', 'Raw Porkchop', { food: { hunger: 3, sat: 1.8 } });
item(I.COOKED_PORK, 'cooked_porkchop', 'Cooked Porkchop', { food: { hunger: 8, sat: 12.8 } });
item(I.RAW_BEEF, 'raw_beef', 'Raw Beef', { food: { hunger: 3, sat: 1.8 } });
item(I.STEAK, 'steak', 'Steak', { food: { hunger: 8, sat: 12.8 } });
item(I.ROTTEN_FLESH, 'rotten_flesh', 'Rotten Flesh', { food: { hunger: 4, sat: 0.8, poison: true } });
item(I.BUCKET, 'bucket', 'Bucket', { stack: 16 });
item(I.WATER_BUCKET, 'water_bucket', 'Water Bucket', { stack: 1 });
item(I.LAVA_BUCKET, 'lava_bucket', 'Lava Bucket', { stack: 1, fuel: 1000 });
item(I.FLINT_AND_STEEL, 'flint_and_steel', 'Flint and Steel', { stack: 1, durability: 64 });
item(I.RAW_MUTTON, 'raw_mutton', 'Raw Mutton', { food: { hunger: 2, sat: 1.2 } });
item(I.COOKED_MUTTON, 'cooked_mutton', 'Cooked Mutton', { food: { hunger: 6, sat: 9.6 } });
item(I.STRING, 'string', 'String');
item(I.BONE, 'bone', 'Bone');
item(I.BREAD, 'bread', 'Bread', { food: { hunger: 5, sat: 6 } });
item(I.WHEAT_SEEDS, 'wheat_seeds', 'Seeds', { plants: B.WHEAT });
item(I.WHEAT, 'wheat', 'Wheat');
item(I.GOLDEN_APPLE, 'golden_apple', 'Golden Apple', { food: { hunger: 4, sat: 9.6, regen: true } });
item(I.BOWL, 'bowl', 'Bowl', { fuel: 5 });
item(I.MUSHROOM_STEW, 'mushroom_stew', 'Stew', { stack: 1, food: { hunger: 6, sat: 7.2, returns: I.BOWL } });

TOOL_MATERIALS.forEach((m, mi) => {
  TOOL_TYPES.forEach((t) => {
    const id = toolId(mi, t);
    item(id, `${m.key}_${t}`, `${m.name} ${t[0].toUpperCase()}${t.slice(1)}`, {
      stack: 1,
      icon: `tool_${t}_${m.key}`,
      tool: { type: t, tier: m.tier, speed: m.speed, material: m.key },
      durability: m.durability,
      damage: TOOL_BASE_DMG[t] + m.dmg + (t === 'sword' ? 0 : 0),
      fuel: m.key === 'wood' ? 10 : 0,
    });
  });
});

// Fuel values in seconds of burn time (one smelt = 10s).
for (const id of [B.OAK_LOG, B.BIRCH_LOG, B.SPRUCE_LOG, B.PLANKS, B.CRAFTING_TABLE, B.BOOKSHELF, B.CHEST, B.SAPLING, B.LADDER]) {
  ITEMS[id].fuel = id === B.SAPLING ? 5 : 15;
}

export function isBlockId(id) { return id > 0 && id < 256 && !!BLOCKS[id]; }
export function getItem(id) { return ITEMS[id]; }
export function maxStack(id) { return ITEMS[id] ? ITEMS[id].stack : 64; }

// Fast lookup tables for hot loops
export const OPAQUE = new Uint8Array(256);
export const SOLID = new Uint8Array(256);
export const LIGHT_EMIT = new Uint8Array(256);
export const LIGHT_FILTER = new Uint8Array(256);
export const TRANSPARENT = new Uint8Array(256); // lets light through
for (let i = 0; i < 256; i++) {
  const b = BLOCKS[i];
  if (!b) { TRANSPARENT[i] = 0; continue; }
  OPAQUE[i] = b.opaque ? 1 : 0;
  SOLID[i] = b.solid ? 1 : 0;
  LIGHT_EMIT[i] = b.light;
  LIGHT_FILTER[i] = b.lightFilter;
  TRANSPARENT[i] = b.opaque ? 0 : 1;
}

// Returns {time, drops} for breaking `blockId` with held item `heldId`.
export function breakInfo(blockId, heldId) {
  const b = BLOCKS[blockId];
  if (!b || b.hardness < 0) return { time: Infinity, canHarvest: false };
  const held = heldId ? ITEMS[heldId] : null;
  const tool = held && held.tool ? held.tool : null;
  const rightTool = tool && b.tool && tool.type === b.tool;
  let canHarvest = true;
  if (b.level >= 0) canHarvest = !!(rightTool && tool.tier >= b.level);
  let speed = 1;
  if (rightTool) speed = tool.speed;
  if (tool && tool.type === 'sword' && (b.web)) speed = 15;
  if (tool && tool.type === 'sword' && (blockId === B.OAK_LEAVES || blockId === B.BIRCH_LEAVES || blockId === B.SPRUCE_LEAVES)) speed = 1.5;
  let time = b.hardness * (canHarvest ? 1.5 : 5) / speed;
  if (b.web && !(tool && tool.type === 'sword')) canHarvest = false;
  return { time, canHarvest };
}

export function blockDrops(blockId, rng, canHarvest, meta = 0) {
  const b = BLOCKS[blockId];
  if (!b || !canHarvest) return [];
  if (b.drops) return b.drops(rng, meta);
  return [[blockId, 1]];
}

export const CREATIVE_ITEMS = (() => {
  const list = [];
  for (let i = 1; i < 256; i++) {
    const b = BLOCKS[i];
    if (b && !b.hidden && b.id !== B.WATER && b.id !== B.LAVA) list.push(i);
  }
  for (let i = 256; i < ITEMS.length; i++) if (ITEMS[i]) list.push(i);
  return list;
})();
