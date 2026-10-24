// Small math helpers shared by every system.
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (a, b, v) => {
  const t = invLerp(a, b, v);
  return t * t * (3 - 2 * t);
};
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;

// Frame-rate independent exponential smoothing.
export const damp = (current, target, lambda, dt) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

export function dampVec3(v, target, lambda, dt) {
  const t = 1 - Math.exp(-lambda * dt);
  v.x += (target.x - v.x) * t;
  v.y += (target.y - v.y) * t;
  v.z += (target.z - v.z) * t;
  return v;
}

// Shortest signed difference between two angles.
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export const dampAngle = (a, b, lambda, dt) =>
  a + angleDelta(a, b) * (1 - Math.exp(-lambda * dt));

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutElastic = (t) => {
  if (t === 0 || t === 1) return t;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1;
};

// Cheap 1D value noise for camera shake and organic wobble.
const PERM = new Float32Array(512);
for (let i = 0; i < 512; i++) PERM[i] = Math.random() * 2 - 1;
export function noise1(x) {
  const i = Math.floor(x);
  const f = x - i;
  const a = PERM[i & 511];
  const b = PERM[(i + 1) & 511];
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

// Deterministic PRNG (mulberry32) for repeatable procedural content.
export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const flatDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const flatDistSq = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

const _v = new THREE.Vector3();
export function flatDir(from, to, out = new THREE.Vector3()) {
  out.set(to.x - from.x, 0, to.z - from.z);
  const l = out.length();
  if (l > 1e-5) out.multiplyScalar(1 / l);
  else out.set(0, 0, 1);
  return out;
}

export function yawTo(from, to) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

export function randomInCircle(r, out = new THREE.Vector3()) {
  const a = Math.random() * TAU;
  const d = Math.sqrt(Math.random()) * r;
  return out.set(Math.cos(a) * d, 0, Math.sin(a) * d);
}

export function randomOnSphere(out = new THREE.Vector3()) {
  const u = Math.random() * 2 - 1;
  const a = Math.random() * TAU;
  const s = Math.sqrt(1 - u * u);
  return out.set(s * Math.cos(a), u, s * Math.sin(a));
}

export { _v as tmpVec };
