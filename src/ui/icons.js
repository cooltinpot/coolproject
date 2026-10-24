// Small pixel-art HUD icons drawn at runtime (hearts, hunger, bubbles).
function draw(rows, pal, scale = 1) {
  const h = rows.length, w = rows[0].length;
  const c = document.createElement('canvas');
  c.width = w * scale; c.height = h * scale;
  const g = c.getContext('2d');
  rows.forEach((r, y) => { for (let x = 0; x < w; x++) { const col = pal[r[x]]; if (col) { g.fillStyle = col; g.fillRect(x * scale, y * scale, scale, scale); } } });
  return c.toDataURL();
}

const HEART = [
  '.kk.kk...',
  'krrkrrk..',
  'krwrrrrk.',
  'krrrrrrk.',
  '.krrrrk..',
  '..krrk...',
  '...kk....',
];
const HALF_MASK = (rows) => rows.map((r) => r.split('').map((ch, x) => (x >= 4 && ch !== 'k' && ch !== '.' ? 'e' : ch)).join(''));
const FOOD = [
  '....kk...',
  '...kbbk..',
  '..kbbbbk.',
  '.kbbwbbk.',
  '.kbbbbk..',
  'kwkbbk...',
  'wk.kk....',
  'k........',
];
const BUBBLE = [
  '..kkk..',
  '.kwbbk.',
  'kwbbbbk',
  'kbbbbbk',
  'kbbbbbk',
  '.kbbbk.',
  '..kkk..',
];

export const ICONS = {};
export function buildHudIcons() {
  const base = { k: '#000', '.': null };
  ICONS.heartFull = draw(HEART, { ...base, r: '#e01818', w: '#ffb0b0' }, 2);
  ICONS.heartHalf = draw(HALF_MASK(HEART), { ...base, r: '#e01818', w: '#ffb0b0', e: '#3a0d0d' }, 2);
  ICONS.heartEmpty = draw(HEART, { ...base, r: '#3a0d0d', w: '#3a0d0d' }, 2);
  ICONS.foodFull = draw(FOOD, { ...base, b: '#a5622e', w: '#f0e0d0' }, 2);
  ICONS.foodHalf = draw(FOOD.map((r) => r.split('').map((ch, x) => (x < 4 && ch === 'b' ? 'e' : ch)).join('')), { ...base, b: '#a5622e', w: '#f0e0d0', e: '#2a1a0a' }, 2);
  ICONS.foodEmpty = draw(FOOD, { ...base, b: '#2a1a0a', w: '#3a2a1a' }, 2);
  ICONS.bubble = draw(BUBBLE, { ...base, b: '#3070e0', w: '#d0e8ff' }, 2);
}
