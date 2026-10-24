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
  OAK_SLAB: 56, STONE_SLAB: 57, COBBLE_SLAB: 58, OAK_STAIRS: 59, COBBLE_STAIRS: 60, STONE_BRICK_STAIRS: 61,
  BRICK_STAIRS: 62, OAK_DOOR: 63, NETHERRACK: 64, SOUL_SAND: 65, PORTAL: 66, NETHER_BRICKS: 67, QUARTZ_ORE: 68,
  REDSTONE_ORE: 69, REDSTONE_WIRE: 70, REDSTONE_TORCH: 71, REDSTONE_TORCH_OFF: 72, LEVER: 73, STONE_BUTTON: 74,
  PRESSURE_PLATE: 75, REDSTONE_LAMP: 76, REDSTONE_LAMP_ON: 77,
};

export const I = {
  STICK: 256, COAL: 257, IRON_INGOT: 258, GOLD_INGOT: 259, DIAMOND: 260, FLINT: 261,
  CLAY_BALL: 262, BRICK: 263, GUNPOWDER: 264, APPLE: 265, RAW_PORK: 266, COOKED_PORK: 267,
  RAW_BEEF: 268, STEAK: 269, ROTTEN_FLESH: 270, BUCKET: 271, WATER_BUCKET: 272,
  LAVA_BUCKET: 273, FLINT_AND_STEEL: 274, RAW_MUTTON: 275, COOKED_MUTTON: 276, STRING: 277,
  BONE: 278, BREAD: 279, WHEAT_SEEDS: 280, GOLDEN_APPLE: 281, BOWL: 282, MUSHROOM_STEW: 283, WHEAT: 284,
  LEATHER: 285, FEATHER: 286, RAW_CHICKEN: 287, COOKED_CHICKEN: 288, ARROW: 289, BOW: 290, BONE_MEAL: 291,
  QUARTZ: 292, GOLD_NUGGET: 293, REDSTONE: 294,
};

export const ARMOR_MATERIALS = [
  { key: 'leather', name: 'Leather', defense: [1, 3, 2, 1], durability: [55, 80, 75, 65], color: '#a0653a', dark: '#6b3f1f' },
  { key: 'gold', name: 'Golden', defense: [2, 5, 3, 1], durability: [77, 112, 105, 91], color: '#f7e14b', dark: '#c9a01b' },
  { key: 'iron', name: 'Iron', defense: [2, 6, 5, 2], durability: [165, 240, 225, 195], color: '#e6e6e6', dark: '#9a9a9a' },
  { key: 'diamond', name: 'Diamond', defense: [3, 8, 6, 3], durability: [363, 528, 495, 429], color: '#5ff0e0', dark: '#1fa89a' },
];
export const ARMOR_SLOTS = ['helmet', 'chestplate', 'leggings', 'boots'];
export const ARMOR_BASE = 400;
export function armorId(matIdx, slot) { return ARMOR_BASE + matIdx * 4 + slot; }

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
const slabDrop = (id) => (rng, meta) => [[id, 1]];
block(B.OAK_SLAB, 'oak_slab', 'Oak Slab', { tex: T('planks'), render: 'shape', shape: 'slab', opaque: false, hardness: 2, tool: 'axe', sound: 'wood', double: B.PLANKS, drops: slabDrop(B.OAK_SLAB) });
block(B.STONE_SLAB, 'stone_slab', 'Stone Slab', { tex: { top: 'stone_slab_top', bottom: 'stone_slab_top', side: 'stone_slab_side' }, render: 'shape', shape: 'slab', opaque: false, hardness: 2, tool: 'pickaxe', level: 0, double: B.STONE_BRICKS, drops: slabDrop(B.STONE_SLAB) });
block(B.COBBLE_SLAB, 'cobblestone_slab', 'Cobblestone Slab', { tex: T('cobblestone'), render: 'shape', shape: 'slab', opaque: false, hardness: 2, tool: 'pickaxe', level: 0, double: B.COBBLE, drops: slabDrop(B.COBBLE_SLAB) });
block(B.OAK_STAIRS, 'oak_stairs', 'Oak Stairs', { tex: T('planks'), render: 'shape', shape: 'stairs', opaque: false, hardness: 2, tool: 'axe', sound: 'wood' });
block(B.COBBLE_STAIRS, 'cobblestone_stairs', 'Cobblestone Stairs', { tex: T('cobblestone'), render: 'shape', shape: 'stairs', opaque: false, hardness: 2, tool: 'pickaxe', level: 0 });
block(B.STONE_BRICK_STAIRS, 'stone_brick_stairs', 'Stone Brick Stairs', { tex: T('stone_bricks'), render: 'shape', shape: 'stairs', opaque: false, hardness: 1.5, tool: 'pickaxe', level: 0 });
block(B.BRICK_STAIRS, 'brick_stairs', 'Brick Stairs', { tex: T('bricks'), render: 'shape', shape: 'stairs', opaque: false, hardness: 2, tool: 'pickaxe', level: 0 });
block(B.OAK_DOOR, 'oak_door', 'Oak Door', { tex: { top: 'planks', bottom: 'planks', side: 'door_bottom', front: 'door_bottom' }, render: 'shape', shape: 'door', layer: 'cutout', opaque: false, hardness: 3, tool: 'axe', sound: 'wood', stack: 16, interact: 'door', needsSupport: true, flatIcon: 'door_item',
  drops: (rng, meta) => (meta & 8 ? [] : [[B.OAK_DOOR, 1]]) });
block(B.NETHERRACK, 'netherrack', 'Netherrack', { tex: T('netherrack'), hardness: 0.4, tool: 'pickaxe', level: 0 });
block(B.SOUL_SAND, 'soul_sand', 'Soul Sand', { tex: T('soul_sand'), render: 'box', box: [0, 0, 0, 16, 14, 16], hardness: 0.5, tool: 'shovel', sound: 'sand', slow: true });
block(B.PORTAL, 'portal', 'Nether Portal', { tex: T('portal'), render: 'portal', layer: 'translucent', solid: false, opaque: false, light: 11, hardness: -1, selectable: false, hidden: true, needsSupport: true, drops: () => [] });
block(B.NETHER_BRICKS, 'nether_bricks', 'Nether Bricks', { tex: T('nether_bricks'), hardness: 2, tool: 'pickaxe', level: 0 });
block(B.QUARTZ_ORE, 'quartz_ore', 'Nether Quartz Ore', { tex: T('quartz_ore'), hardness: 3, tool: 'pickaxe', level: 0, drops: () => [[I.QUARTZ, 1]] });
block(B.REDSTONE_ORE, 'redstone_ore', 'Redstone Ore', { tex: T('redstone_ore'), hardness: 3, tool: 'pickaxe', level: 2, drops: (rng) => [[I.REDSTONE, 4 + Math.floor(rng() * 2)]] });
block(B.REDSTONE_WIRE, 'redstone_wire', 'Redstone Dust', { tex: T('redstone_dust'), render: 'wire', layer: 'cutout', solid: false, opaque: false, hardness: 0, needsSupport: true, redstone: true, hidden: true, sound: 'stone', drops: () => [[I.REDSTONE, 1]] });
block(B.REDSTONE_TORCH, 'redstone_torch', 'Redstone Torch', { tex: T('redstone_torch'), render: 'torch', layer: 'cutout', solid: false, opaque: false, light: 7, hardness: 0, sound: 'wood', needsSupport: true, redstone: true, attach: true });
block(B.REDSTONE_TORCH_OFF, 'redstone_torch_off', 'Redstone Torch (off)', { tex: T('redstone_torch_off'), render: 'torch', layer: 'cutout', solid: false, opaque: false, hardness: 0, sound: 'wood', needsSupport: true, redstone: true, attach: true, hidden: true, drops: () => [[B.REDSTONE_TORCH, 1]] });
block(B.LEVER, 'lever', 'Lever', { tex: T('cobblestone'), render: 'shape', shape: 'lever', layer: 'cutout', solid: false, opaque: false, hardness: 0.5, sound: 'wood', needsSupport: true, redstone: true, attach: true, interact: 'lever', flatIcon: 'lever_item' });
block(B.STONE_BUTTON, 'stone_button', 'Stone Button', { tex: T('stone'), render: 'shape', shape: 'button', layer: 'cutout', solid: false, opaque: false, hardness: 0.5, needsSupport: true, redstone: true, attach: true, interact: 'button', flatIcon: 'button_item' });
block(B.PRESSURE_PLATE, 'pressure_plate', 'Stone Pressure Plate', { tex: T('stone'), render: 'shape', shape: 'plate', layer: 'cutout', solid: false, opaque: false, hardness: 0.5, tool: 'pickaxe', needsSupport: true, redstone: true, flatIcon: 'plate_item' });
block(B.REDSTONE_LAMP, 'redstone_lamp', 'Redstone Lamp', { tex: T('redstone_lamp'), hardness: 0.3, sound: 'glass', redstone: true });
block(B.REDSTONE_LAMP_ON, 'redstone_lamp_on', 'Redstone Lamp (on)', { tex: T('redstone_lamp_on'), hardness: 0.3, sound: 'glass', light: 15, redstone: true, hidden: true, drops: () => [[B.REDSTONE_LAMP, 1]] });
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
item(I.LEATHER, 'leather', 'Leather');
item(I.FEATHER, 'feather', 'Feather');
item(I.RAW_CHICKEN, 'raw_chicken', 'Raw Chicken', { food: { hunger: 2, sat: 1.2 } });
item(I.COOKED_CHICKEN, 'cooked_chicken', 'Cooked Chicken', { food: { hunger: 6, sat: 7.2 } });
item(I.ARROW, 'arrow', 'Arrow');
item(I.BOW, 'bow', 'Bow', { stack: 1, durability: 384, bow: true });
item(I.BONE_MEAL, 'bone_meal', 'Bone Meal');
item(I.QUARTZ, 'quartz', 'Nether Quartz');
item(I.GOLD_NUGGET, 'gold_nugget', 'Gold Nugget');
item(I.REDSTONE, 'redstone', 'Redstone Dust', { places: B.REDSTONE_WIRE });
ARMOR_MATERIALS.forEach((m, mi) => ARMOR_SLOTS.forEach((slot, si) => {
  const names = { helmet: 'Helmet', chestplate: 'Chestplate', leggings: 'Leggings', boots: 'Boots' };
  item(armorId(mi, si), `${m.key}_${slot}`, `${m.key === 'leather' ? 'Leather ' + (slot === 'helmet' ? 'Cap' : slot === 'chestplate' ? 'Tunic' : slot === 'leggings' ? 'Pants' : 'Boots') : m.name + ' ' + names[slot]}`, {
    stack: 1, icon: `armor_${slot}_${m.key}`, armor: { slot: si, defense: m.defense[si], material: m.key }, durability: m.durability[si],
  });
}));
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

// Rotate a floor-mounted box (y = distance from the support) onto a wall. attach: 0 floor, 1 +x, 2 -x, 3 +z, 4 -z.
function attachBox(b, attach) {
  const [a0, h0, c0, a1, h1, c1] = b;
  const v0 = c0, v1 = c1; // the floor box's z extent becomes the vertical extent on a wall
  switch (attach) {
    case 1: return [16 - h1, v0, a0, 16 - h0, v1, a1];
    case 2: return [h0, v0, a0, h1, v1, a1];
    case 3: return [a0, v0, 16 - h1, a1, v1, 16 - h0];
    case 4: return [a0, v0, h0, a1, v1, h1];
    default: return b;
  }
}

// Collision/render boxes (1/16 units) for non-cube blocks; null = full cube.
const DOOR_CLOSED = [[0, 0, 0, 16, 16, 3], [13, 0, 0, 16, 16, 16], [0, 0, 13, 16, 16, 16], [0, 0, 0, 3, 16, 16]];
const STAIR_BACK = [[0, 0, 0, 16, 16, 8], [8, 0, 0, 16, 16, 16], [0, 0, 8, 16, 16, 16], [0, 0, 0, 8, 16, 16]];
export function blockShapes(id, meta = 0) {
  const d = BLOCKS[id];
  if (!d) return null;
  if (d.render === 'box') return [d.box];
  if (d.render !== 'shape') return null;
  if (d.shape === 'slab') return [meta & 1 ? [0, 8, 0, 16, 16, 16] : [0, 0, 0, 16, 8, 16]];
  if (d.shape === 'stairs') {
    const f = meta & 3, up = meta & 4;
    const b = STAIR_BACK[f];
    return up
      ? [[0, 8, 0, 16, 16, 16], [b[0], 0, b[2], b[3], 8, b[5]]]
      : [[0, 0, 0, 16, 8, 16], [b[0], 8, b[2], b[3], 16, b[5]]];
  }
  if (d.shape === 'lever') {
    const on = meta & 8;
    return [[5, 0, 4, 11, 3, 12], on ? [9, 3, 7, 11, 10, 9] : [5, 3, 7, 7, 10, 9]].map((b) => attachBox(b, meta & 7));
  }
  if (d.shape === 'button') return [attachBox([5, 0, 6, 11, meta & 8 ? 1 : 2, 10], meta & 7)];
  if (d.shape === 'plate') return [[1, 0, 1, 15, meta & 8 ? 0.5 : 1, 15]];
  if (d.shape === 'door') {
    const f = meta & 3;
    return [meta & 4 ? DOOR_CLOSED[(f + 3) % 4] : DOOR_CLOSED[f]];
  }
  return null;
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
