// Simplified Minecraft redstone: dust carries a 0..15 signal that drops by one per block.
// Sources: levers, buttons, pressure plates, redstone torches (which invert the block they hang on).
// Consumers: redstone lamps, doors and TNT. Blocks touched by a lever/button/plate/torch-below are
// "strongly powered" and feed dust; blocks under powered dust are "weakly powered" and only feed consumers.
import { B, BLOCKS, OPAQUE, SOLID } from '../blocks.js';
import { ATTACH_DIRS } from './mesher.js';

const H4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

export const ON_BIT = 8;

export function isRedstone(id) { return !!(BLOCKS[id] && BLOCKS[id].redstone); }

// Which block a lever/button/torch is attached to (meta low 3 bits: 0 = floor, 1..4 = wall direction).
export function attachedPos(x, y, z, meta) {
  const a = meta & 7;
  if (a === 0) return [x, y - 1, z];
  const d = ATTACH_DIRS[a];
  return [x + d[0], y, z + d[2]];
}

function sourceOn(w, id, meta) {
  if (id === B.LEVER || id === B.STONE_BUTTON || id === B.PRESSURE_PLATE) return (meta & ON_BIT) !== 0;
  return id === B.REDSTONE_TORCH;
}

// A solid block fed directly by a source (lever/button on it, plate on top, lit torch underneath).
export function stronglyPowered(w, x, y, z) {
  const id = w.getBlock(x, y, z);
  if (id <= 0 || !OPAQUE[id]) return false;
  for (const [dx, dy, dz] of N6) {
    const nx = x + dx, ny = y + dy, nz = z + dz;
    const n = w.getBlock(nx, ny, nz);
    if (n <= 0) continue;
    const m = w.getMeta(nx, ny, nz);
    if ((n === B.LEVER || n === B.STONE_BUTTON) && (m & ON_BIT)) {
      const [ax, ay, az] = attachedPos(nx, ny, nz, m);
      if (ax === x && ay === y && az === z) return true;
    }
    if (n === B.PRESSURE_PLATE && (m & ON_BIT) && dy === 1) return true;
    if (n === B.REDSTONE_TORCH && dy === -1 && (m & 7) !== 0) {
      // wall torch below this block still powers it
      return true;
    }
    if (n === B.REDSTONE_TORCH && dy === -1) return true;
  }
  return false;
}

// Powered for consumer purposes (includes weak power from dust lying on top).
function blockPowered(w, x, y, z) {
  if (stronglyPowered(w, x, y, z)) return true;
  if (w.getBlock(x, y + 1, z) === B.REDSTONE_WIRE && w.getMeta(x, y + 1, z) > 0) return true;
  for (const [dx, dz] of H4) {
    if (w.getBlock(x + dx, y, z + dz) === B.REDSTONE_WIRE && w.getMeta(x + dx, y, z + dz) > 0) return true;
  }
  return false;
}

// Is a consumer at (x,y,z) receiving power from any side?
export function receivesPower(w, x, y, z) {
  for (const [dx, dy, dz] of N6) {
    const nx = x + dx, ny = y + dy, nz = z + dz;
    const n = w.getBlock(nx, ny, nz);
    if (n <= 0) continue;
    const m = w.getMeta(nx, ny, nz);
    if (sourceOn(w, n, m)) {
      if (n === B.REDSTONE_TORCH) {
        const [ax, ay, az] = attachedPos(nx, ny, nz, m);
        if (ax === x && ay === y && az === z) continue;
      }
      return true;
    }
    if (n === B.REDSTONE_WIRE && m > 0 && dy !== -1) return true;
    if (OPAQUE[n] && SOLID[n] && blockPowered(w, nx, ny, nz)) return true;
  }
  return false;
}

export function wirePower(w, x, y, z) {
  let p = 0;
  const upOpen = !OPAQUE[w.getBlock(x, y + 1, z)];
  for (const [dx, dz] of H4) {
    const nx = x + dx, nz = z + dz;
    const n = w.getBlock(nx, y, nz);
    if (n === B.REDSTONE_WIRE) p = Math.max(p, w.getMeta(nx, y, nz) - 1);
    else if (!OPAQUE[n] && w.getBlock(nx, y - 1, nz) === B.REDSTONE_WIRE) p = Math.max(p, w.getMeta(nx, y - 1, nz) - 1);
    if (OPAQUE[n] && upOpen && w.getBlock(nx, y + 1, nz) === B.REDSTONE_WIRE) p = Math.max(p, w.getMeta(nx, y + 1, nz) - 1);
  }
  for (const [dx, dy, dz] of N6) {
    const nx = x + dx, ny = y + dy, nz = z + dz;
    const n = w.getBlock(nx, ny, nz);
    if (n <= 0) continue;
    if (sourceOn(w, n, w.getMeta(nx, ny, nz))) return 15;
    if (OPAQUE[n] && stronglyPowered(w, nx, ny, nz)) return 15;
  }
  return Math.max(0, p);
}

// Called from World.processUpdate for redstone-related blocks. Returns true if handled.
export function redstoneUpdate(w, x, y, z, id, kind) {
  const meta = w.getMeta(x, y, z);
  if (kind === 'unpress') {
    if (id === B.STONE_BUTTON && (meta & ON_BIT)) w.setBlock(x, y, z, id, meta & ~ON_BIT);
    if (id === B.PRESSURE_PLATE && (meta & ON_BIT) && !(w.events && w.events.entityOn && w.events.entityOn(x, y, z))) w.setBlock(x, y, z, id, meta & ~ON_BIT);
    else if (id === B.PRESSURE_PLATE && (meta & ON_BIT)) w.scheduleUpdate(x, y, z, 0.5, 'unpress');
    return true;
  }
  switch (id) {
    case B.REDSTONE_WIRE: {
      const p = wirePower(w, x, y, z);
      if (p !== meta) w.setBlock(x, y, z, id, p);
      return true;
    }
    case B.REDSTONE_TORCH:
    case B.REDSTONE_TORCH_OFF: {
      const [ax, ay, az] = attachedPos(x, y, z, meta);
      const off = blockPowered(w, ax, ay, az);
      const want = off ? B.REDSTONE_TORCH_OFF : B.REDSTONE_TORCH;
      if (want !== id) {
        if (kind === 'torch') w.setBlock(x, y, z, want, meta);
        else w.scheduleUpdate(x, y, z, 0.1, 'torch');
      }
      return true;
    }
    case B.REDSTONE_LAMP:
    case B.REDSTONE_LAMP_ON: {
      const want = receivesPower(w, x, y, z) ? B.REDSTONE_LAMP_ON : B.REDSTONE_LAMP;
      if (want !== id) {
        if (want === B.REDSTONE_LAMP && kind !== 'lamp') w.scheduleUpdate(x, y, z, 0.1, 'lamp');
        else w.setBlock(x, y, z, want, 0);
      }
      return true;
    }
    case B.OAK_DOOR: {
      const lowerY = meta & 8 ? y - 1 : y;
      const powered = receivesPower(w, x, lowerY, z) || receivesPower(w, x, lowerY + 1, z);
      const lm = w.getMeta(x, lowerY, z);
      const wasPowered = (lm & 16) !== 0;
      if (powered !== wasPowered) {
        const open = powered;
        for (const yy of [lowerY, lowerY + 1]) {
          if (w.getBlock(x, yy, z) !== B.OAK_DOOR) continue;
          let m = w.getMeta(x, yy, z);
          m = open ? m | 4 : m & ~4;
          if (yy === lowerY) m = powered ? m | 16 : m & ~16;
          w.setBlock(x, yy, z, B.OAK_DOOR, m, { silent: true });
        }
        if (w.events) w.events.sound('door', x, y, z);
      }
      return false; // still let the support check run
    }
    case B.TNT:
      if (receivesPower(w, x, y, z) && w.events && w.events.ignite) w.events.ignite(x, y, z);
      return true;
  }
  return false;
}

// After a redstone block changes, wake everything within 2 blocks so signals propagate.
export function notifyRedstone(w, x, y, z) {
  for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 2) continue;
    const id = w.getBlock(x + dx, y + dy, z + dz);
    if (id > 0 && (isRedstone(id) || id === B.OAK_DOOR || id === B.TNT)) w.scheduleUpdate(x + dx, y + dy, z + dz, 0, 'block');
  }
}
