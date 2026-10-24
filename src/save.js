// World persistence in localStorage. Chunk data is deflated + base64 encoded.
import { CHUNK_VOL } from './world/chunk.js';

const PREFIX = 'mcjs';
const LIST_KEY = `${PREFIX}.worlds`;

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { console.warn('save failed', e); return false; } }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }

export function listWorlds() {
  try { return JSON.parse(lsGet(LIST_KEY) || '[]'); } catch (e) { return []; }
}
function writeList(l) { lsSet(LIST_KEY, JSON.stringify(l)); }

export function createWorld(name, seed, mode) {
  const id = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  const list = listWorlds();
  list.unshift({ id, name, seed, mode, created: Date.now(), lastPlayed: Date.now() });
  writeList(list);
  return id;
}

export function deleteWorld(id) {
  writeList(listWorlds().filter((w) => w.id !== id));
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`${PREFIX}.w.${id}.`)) keys.push(k);
    }
  } catch (e) { /* ignore */ }
  keys.forEach(lsDel);
}

export function touchWorld(id) {
  const list = listWorlds();
  const w = list.find((x) => x.id === id);
  if (w) { w.lastPlayed = Date.now(); writeList(list); }
}

function toB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(str) {
  const s = atob(str);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

async function deflate(u8) {
  if (typeof CompressionStream === 'undefined') return u8;
  const cs = new CompressionStream('deflate');
  const stream = new Blob([u8]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function inflate(u8) {
  if (typeof DecompressionStream === 'undefined') return u8;
  const ds = new DecompressionStream('deflate');
  const stream = new Blob([u8]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function loadWorld(id) {
  const metaStr = lsGet(`${PREFIX}.w.${id}.meta`);
  const meta = metaStr ? JSON.parse(metaStr) : null;
  const chunks = new Map();
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`${PREFIX}.w.${id}.c.`)) keys.push(k);
    }
  } catch (e) { /* ignore */ }
  await Promise.all(keys.map(async (k) => {
    try {
      const key = Number(k.slice(`${PREFIX}.w.${id}.c.`.length));
      const raw = await inflate(fromB64(lsGet(k)));
      if (raw.length !== CHUNK_VOL * 2) return;
      chunks.set(key, { blocks: raw.slice(0, CHUNK_VOL), meta: raw.slice(CHUNK_VOL) });
    } catch (e) { console.warn('bad chunk', k, e); }
  }));
  return { meta, chunks };
}

export async function saveWorld(id, meta, chunkList) {
  lsSet(`${PREFIX}.w.${id}.meta`, JSON.stringify(meta));
  for (const [key, data] of chunkList) {
    const buf = new Uint8Array(CHUNK_VOL * 2);
    buf.set(data.blocks, 0);
    buf.set(data.meta, CHUNK_VOL);
    const comp = await deflate(buf);
    lsSet(`${PREFIX}.w.${id}.c.${key}`, toB64(comp));
  }
  touchWorld(id);
}

export function loadSettings() {
  try { return JSON.parse(lsGet(`${PREFIX}.settings`) || '{}'); } catch (e) { return {}; }
}
export function saveSettings(s) { lsSet(`${PREFIX}.settings`, JSON.stringify(s)); }
