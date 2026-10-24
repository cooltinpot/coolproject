// Procedural humanoid rig: hierarchical joints dressed with modelled armour
// pieces, a keyframe animator that blends authored attack/parry poses over a
// procedural locomotion layer, and per-actor material effects (hit flash and
// a noise dissolve with glowing edges on death).
import * as THREE from 'three';
import { roundedBox, bladeGeometry, plate, mergeHierarchy } from '../core/Geometry.js';
import { lerp, smoothstep, clamp } from '../core/MathUtil.js';

const D = Math.PI / 180;

export const JOINTS = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'upperArmL', 'foreArmL', 'handL', 'upperArmR', 'foreArmR', 'handR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR',
];

// ---------------------------------------------------------------- materials

export function actorUniforms() {
  return {
    uDissolve: { value: 0 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uEdgeColor: { value: new THREE.Color(0x22e8ff) },
    uGlowBoost: { value: 1 },
  };
}

export function fxMaterial(params, U, { glow = false } = {}) {
  const m = new THREE.MeshStandardMaterial(params);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vObjPos;
        uniform float uDissolve, uFlash, uGlowBoost;
        uniform vec3 uFlashColor, uEdgeColor;
        float dh(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float dn(vec3 x) {
          vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(dh(i), dh(i + vec3(1,0,0)), f.x), mix(dh(i + vec3(0,1,0)), dh(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(dh(i + vec3(0,0,1)), dh(i + vec3(1,0,1)), f.x), mix(dh(i + vec3(0,1,1)), dh(i + vec3(1,1,1)), f.x), f.y), f.z);
        }`)
      .replace('void main() {', `void main() {
        float dissN = dn(vObjPos * 14.0) * 0.6 + dn(vObjPos * 40.0) * 0.4;
        if (uDissolve > 0.0 && dissN < uDissolve) discard;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance *= ${glow ? 'uGlowBoost' : '1.0'};
        totalEmissiveRadiance += uFlashColor * uFlash;
        if (uDissolve > 0.0) totalEmissiveRadiance += uEdgeColor * smoothstep(uDissolve + 0.08, uDissolve, dissN) * 6.0;`);
  };
  m.customProgramCacheKey = () => 'fx' + (glow ? 'g' : '');
  return m;
}

const STYLES = {
  player: {
    scale: 1,
    armor: 0xd5dcf0, armorDark: 0x1c2030, trim: 0x8790b0, cloth: 0x272b40, glow: 0x22e8ff, visor: 0x22e8ff,
  },
  duelist: {
    scale: 1.02,
    armor: 0x3a1420, armorDark: 0x16090f, trim: 0xb08a5a, cloth: 0x1d0a10, glow: 0xff2448, visor: 0xff2448,
  },
  lancer: {
    scale: 1.08,
    armor: 0x2b2450, armorDark: 0x110d22, trim: 0x9c8cff, cloth: 0x1a1236, glow: 0xa36bff, visor: 0xc07bff,
  },
  brute: {
    scale: 1.55,
    armor: 0x3b3328, armorDark: 0x15120e, trim: 0xd9a441, cloth: 0x2a1e12, glow: 0xff8a1f, visor: 0xffa53a,
  },
};

// ------------------------------------------------------------------- builder

export function buildHumanoid(styleName = 'player') {
  const S = STYLES[styleName];
  const U = actorUniforms();
  U.uEdgeColor.value.set(S.glow);
  const mats = {
    armor: fxMaterial({ color: S.armor, metalness: 0.75, roughness: 0.28 }, U),
    dark: fxMaterial({ color: S.armorDark, metalness: 0.6, roughness: 0.45 }, U),
    trim: fxMaterial({ color: S.trim, metalness: 1, roughness: 0.22 }, U),
    cloth: fxMaterial({ color: S.cloth, metalness: 0.0, roughness: 0.9 }, U),
    glow: fxMaterial({ color: 0x000000, emissive: S.glow, emissiveIntensity: 3 }, U, { glow: true }),
    visor: fxMaterial({ color: 0x050505, emissive: S.visor, emissiveIntensity: 4, metalness: 1, roughness: 0.1 }, U, { glow: true }),
    blade: fxMaterial({ color: 0xe8f2ff, metalness: 1, roughness: 0.08, emissive: S.glow, emissiveIntensity: 0.25 }, U, { glow: true }),
  };

  const root = new THREE.Group();
  const scaled = new THREE.Group();
  scaled.scale.setScalar(S.scale);
  root.add(scaled);
  const J = {};
  const mk = (name, parent, x, y, z, order = 'XYZ') => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    g.rotation.order = order;
    parent.add(g);
    J[name] = g;
    return g;
  };
  const add = (parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = shadow;
    m.receiveShadow = false;
    parent.add(m);
    return m;
  };

  // Skeleton
  mk('hips', scaled, 0, 0.98, 0);
  mk('spine', J.hips, 0, 0.1, 0);
  mk('chest', J.spine, 0, 0.24, 0);
  mk('neck', J.chest, 0, 0.27, 0);
  mk('head', J.neck, 0, 0.1, 0);
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const sh = new THREE.Group();
    sh.position.set(0.2 * sx, 0.2, 0);
    J.chest.add(sh);
    mk('upperArm' + side, sh, 0.02 * sx, 0, 0, 'YXZ');
    mk('foreArm' + side, J['upperArm' + side], 0, -0.29, 0);
    mk('hand' + side, J['foreArm' + side], 0, -0.26, 0);
    mk('thigh' + side, J.hips, 0.11 * sx, -0.04, 0, 'YXZ');
    mk('shin' + side, J['thigh' + side], 0, -0.44, 0);
    mk('foot' + side, J['shin' + side], 0, -0.44, 0);
  }

  // ---------------- body pieces
  const brute = styleName === 'brute';
  const lancer = styleName === 'lancer';
  const duelist = styleName === 'duelist';
  const bulk = brute ? 1.25 : 1;

  // Pelvis + belt + tassets
  add(J.hips, roundedBox(0.3 * bulk, 0.16, 0.2 * bulk, 0.05), mats.dark, 0, 0, 0);
  const belt = add(J.hips, new THREE.TorusGeometry(0.16 * bulk, 0.025, 6, 24), mats.trim, 0, 0.05, 0, Math.PI / 2);
  belt.scale.set(1, 0.7, 1);
  add(J.hips, roundedBox(0.07, 0.05, 0.03, 0.01), mats.glow, 0, 0.05, 0.12 * bulk);
  for (const sx of [-1, 1]) {
    add(J.hips, plate([[-0.07, 0.1], [0.07, 0.1], [0.06, -0.12], [-0.05, -0.14]], 0.02), mats.armor, 0.15 * sx * bulk, -0.1, 0.02, 0.05, 0, 0.18 * sx);
  }
  // Scabbard (saya) slung on the left hip, angled back.
  if (styleName === 'player' || duelist) {
    const saya = new THREE.Group();
    saya.position.set(0.19 * bulk, -0.02, 0.02);
    saya.rotation.set(1.05, 0, 0.12);
    J.hips.add(saya);
    add(saya, roundedBox(0.045, 0.98, 0.028, 0.012), mats.dark, 0, -0.42, 0);
    for (const y of [-0.02, -0.18, -0.62]) add(saya, roundedBox(0.055, 0.03, 0.036, 0.01), mats.trim, 0, y, 0);
    add(saya, roundedBox(0.05, 0.06, 0.032, 0.012), mats.trim, 0, -0.92, 0);
    add(saya, new THREE.BoxGeometry(0.008, 0.7, 0.03), mats.glow, 0.024, -0.42, 0, 0, 0, 0, false);
  }
  // Coat tails / loincloth (static plates; scarf is simulated separately)
  add(J.hips, plate([[-0.09, 0.05], [0.09, 0.05], [0.07, -0.32], [-0.07, -0.3]], 0.01), mats.cloth, 0, -0.14, -0.12, -0.15);

  // Abdomen segments
  for (let i = 0; i < 3; i++) {
    add(J.spine, roundedBox((0.24 - i * 0.01) * bulk, 0.06, 0.16 * bulk, 0.025), i % 2 ? mats.dark : mats.trim, 0, 0.02 + i * 0.07, 0);
  }
  // Chest plate
  const chestW = 0.38 * bulk;
  add(J.chest, roundedBox(chestW, 0.3, 0.22 * bulk, 0.07, 3), mats.armor, 0, 0.12, 0.01);
  add(J.chest, roundedBox(chestW * 0.7, 0.16, 0.05, 0.03), mats.dark, 0, 0.12, 0.12 * bulk);
  // Glowing chest lines
  for (const sx of [-1, 1]) {
    add(J.chest, new THREE.BoxGeometry(0.012, 0.18, 0.012), mats.glow, 0.07 * sx * bulk, 0.12, 0.14 * bulk, 0, 0, 0.35 * sx, false);
  }
  // Back core: brightness tracks the Resonance meter.
  const core = add(J.chest, new THREE.IcosahedronGeometry(0.06, 1), mats.glow, 0, 0.14, -0.13 * bulk, 0, 0, 0, false);
  core.userData.keep = true;
  add(J.chest, new THREE.TorusGeometry(0.075, 0.012, 6, 20), mats.trim, 0, 0.14, -0.125 * bulk);
  // Collar
  add(J.chest, new THREE.CylinderGeometry(0.1, 0.14, 0.08, 12, 1, true), mats.dark, 0, 0.27, 0);

  // Head
  const head = J.head;
  if (brute) {
    add(head, roundedBox(0.26, 0.24, 0.26, 0.08), mats.armor, 0, 0.1, 0);
    add(head, roundedBox(0.2, 0.04, 0.03, 0.015), mats.visor, 0, 0.1, 0.13, 0, 0, 0, false);
    for (const sx of [-1, 1]) add(head, new THREE.ConeGeometry(0.04, 0.22, 8), mats.trim, 0.13 * sx, 0.22, 0, 0, 0, -0.6 * sx);
  } else {
    const helm = add(head, new THREE.SphereGeometry(0.125, 24, 16), mats.armor, 0, 0.1, 0);
    helm.scale.set(0.95, 1.05, 1.08);
    // Jaw / faceplate
    add(head, roundedBox(0.17, 0.09, 0.12, 0.04), mats.dark, 0, 0.03, 0.05);
    // Visor band
    const visor = add(head, new THREE.CylinderGeometry(0.128, 0.128, 0.035, 24, 1, true, -1.1, 2.2), mats.visor, 0, 0.11, 0, 0, 0, 0, false);
    visor.scale.set(1, 1, 1.12);
    if (styleName === 'player') {
      // Crest fin and antennae
      add(head, plate([[0, 0], [0.18, 0.03], [0.22, 0.09], [0.02, 0.06]], 0.01), mats.trim, 0, 0.2, -0.04, 0, Math.PI / 2, 0);
      for (const sx of [-1, 1]) add(head, new THREE.CylinderGeometry(0.006, 0.01, 0.18, 6), mats.glow, 0.12 * sx, 0.17, -0.03, -0.5, 0, -0.5 * sx, false);
    }
    if (duelist) {
      // Horned oni mask
      for (const sx of [-1, 1]) {
        const horn = add(head, new THREE.ConeGeometry(0.025, 0.24, 8), mats.trim, 0.08 * sx, 0.24, 0.02, -0.3, 0, -0.45 * sx);
        horn.scale.z = 0.8;
      }
      add(head, roundedBox(0.14, 0.012, 0.02, 0.005), mats.visor, 0, 0.115, 0.13, 0, 0, 0, false);
    }
    if (lancer) {
      add(head, new THREE.ConeGeometry(0.07, 0.32, 6), mats.armor, 0, 0.3, -0.05, -0.35, 0, 0);
      add(head, new THREE.TorusGeometry(0.16, 0.01, 6, 32), mats.glow, 0, 0.12, 0, Math.PI / 2 + 0.2, 0, 0, false);
    }
  }

  // Arms
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const ua = J['upperArm' + side];
    const fa = J['foreArm' + side];
    const hand = J['hand' + side];
    // Pauldron
    const pauld = add(ua, new THREE.SphereGeometry(0.11 * bulk, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mats.armor, 0.01 * sx, 0.02, 0, 0, 0, -0.35 * sx);
    pauld.scale.set(1.15, 0.9, 1.1);
    add(ua, new THREE.TorusGeometry(0.1 * bulk, 0.008, 4, 20, Math.PI), mats.glow, 0.02 * sx, 0.0, 0, 0, Math.PI / 2, -0.35 * sx, false);
    if (brute || duelist) {
      add(ua, new THREE.ConeGeometry(0.03 * bulk, 0.12, 6), mats.trim, 0.06 * sx * bulk, 0.08, 0, 0, 0, -0.9 * sx);
    }
    add(ua, new THREE.CapsuleGeometry(0.055 * bulk, 0.18, 4, 10), mats.cloth, 0, -0.15, 0);
    add(ua, roundedBox(0.11 * bulk, 0.12, 0.11 * bulk, 0.03), mats.dark, 0, -0.17, 0);
    // Gauntlet
    add(fa, new THREE.CylinderGeometry(0.06 * bulk, 0.048 * bulk, 0.24, 12), mats.armor, 0, -0.13, 0);
    add(fa, new THREE.TorusGeometry(0.055 * bulk, 0.008, 4, 16), mats.glow, 0, -0.2, 0, Math.PI / 2, 0, 0, false);
    add(fa, roundedBox(0.03, 0.18, 0.05, 0.01), mats.trim, 0.05 * sx * bulk, -0.12, 0);
    // Hand
    add(hand, roundedBox(0.07 * bulk, 0.09, 0.08 * bulk, 0.025), mats.dark, 0, -0.04, 0.01);
  }

  // Legs
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const th = J['thigh' + side];
    const sh = J['shin' + side];
    const ft = J['foot' + side];
    add(th, new THREE.CapsuleGeometry(0.075 * bulk, 0.28, 4, 10), mats.cloth, 0, -0.22, 0);
    add(th, roundedBox(0.13 * bulk, 0.22, 0.08, 0.03), mats.armor, 0, -0.18, 0.04);
    // Knee guard
    add(sh, roundedBox(0.1 * bulk, 0.1, 0.06, 0.03), mats.trim, 0, 0.0, 0.07);
    add(sh, new THREE.CylinderGeometry(0.065 * bulk, 0.05 * bulk, 0.38, 12), mats.dark, 0, -0.21, 0);
    add(sh, roundedBox(0.09 * bulk, 0.3, 0.05, 0.02), mats.armor, 0, -0.2, 0.05);
    add(sh, new THREE.BoxGeometry(0.01, 0.22, 0.01), mats.glow, 0, -0.2, 0.078, 0, 0, 0, false);
    add(ft, roundedBox(0.1 * bulk, 0.08, 0.24 * bulk, 0.03), mats.dark, 0, -0.03, 0.05);
    add(ft, roundedBox(0.09 * bulk, 0.03, 0.08, 0.01), mats.trim, 0, 0.0, 0.13 * bulk);
  }

  // ---------------- weapon
  const weapon = new THREE.Group();
  J.handR.add(weapon);
  weapon.position.set(0, -0.06, 0);
  const bladeBase = new THREE.Object3D();
  const bladeTip = new THREE.Object3D();
  weapon.add(bladeBase, bladeTip);
  let bladeMesh = null;
  let weaponReach = 1;

  if (styleName === 'player' || duelist) {
    const len = duelist ? 0.95 : 1.08;
    // Grip, guard, pommel
    add(weapon, new THREE.CylinderGeometry(0.018, 0.02, 0.24, 8), mats.cloth, 0, 0, -0.06, Math.PI / 2);
    for (let i = 0; i < 5; i++) add(weapon, new THREE.TorusGeometry(0.021, 0.004, 4, 10), mats.trim, 0, 0, -0.16 + i * 0.045, 0, 0, 0, false);
    add(weapon, new THREE.SphereGeometry(0.026, 10, 8), mats.trim, 0, 0, -0.19);
    const guard = add(weapon, new THREE.CylinderGeometry(0.06, 0.06, 0.014, duelist ? 6 : 16), mats.trim, 0, 0, 0.07, Math.PI / 2);
    guard.scale.set(1, 1, 0.7);
    add(weapon, new THREE.TorusGeometry(0.045, 0.006, 4, 16), mats.glow, 0, 0, 0.078, 0, 0, 0, false);
    // Blade with emissive edge
    const bg = bladeGeometry(len, 0.045, 0.008, duelist ? 0.08 : 0.035);
    bladeMesh = add(weapon, bg, mats.blade, 0, 0, 0.08, 0, 0, Math.PI / 2);
    const edge = add(weapon, bladeGeometry(len * 0.99, 0.012, 0.003, duelist ? 0.08 : 0.035), mats.glow, 0, 0, 0.085, 0, 0, Math.PI / 2, false);
    edge.position.y = -0.024;
    bladeBase.position.set(0, 0, 0.12);
    bladeTip.position.set(0, -(duelist ? 0.08 : 0.035) * len, 0.08 + len);
    weaponReach = len;
  } else if (lancer) {
    const len = 2.5;
    add(weapon, new THREE.CylinderGeometry(0.022, 0.022, len, 10), mats.dark, 0, 0, 0.35, Math.PI / 2);
    for (let i = 0; i < 4; i++) add(weapon, new THREE.TorusGeometry(0.026, 0.006, 4, 10), mats.trim, 0, 0, -0.5 + i * 0.5, 0, 0, 0, false);
    const tipG = new THREE.ConeGeometry(0.06, 0.5, 4);
    tipG.rotateX(Math.PI / 2);
    bladeMesh = add(weapon, tipG, mats.blade, 0, 0, 0.35 + len / 2 + 0.25);
    add(weapon, new THREE.OctahedronGeometry(0.05, 0), mats.glow, 0, 0, 0.35 + len / 2, 0, 0, 0, false);
    for (const sx of [-1, 1]) add(weapon, new THREE.ConeGeometry(0.02, 0.18, 4), mats.trim, 0.05 * sx, 0, 0.35 + len / 2 - 0.02, Math.PI / 2, 0, -0.8 * sx);
    bladeBase.position.set(0, 0, 0.35 + len / 2 - 0.1);
    bladeTip.position.set(0, 0, 0.35 + len / 2 + 0.5);
    weaponReach = 2.2;
  } else if (brute) {
    add(weapon, new THREE.CylinderGeometry(0.03, 0.03, 1.4, 10), mats.dark, 0, 0, 0.35, Math.PI / 2);
    for (let i = 0; i < 3; i++) add(weapon, new THREE.TorusGeometry(0.035, 0.008, 4, 10), mats.trim, 0, 0, -0.2 + i * 0.12, 0, 0, 0, false);
    const headG = roundedBox(0.36, 0.26, 0.32, 0.05);
    bladeMesh = add(weapon, headG, mats.armor, 0, 0, 1.05);
    add(weapon, roundedBox(0.38, 0.06, 0.34, 0.02), mats.trim, 0, 0, 1.05);
    add(weapon, new THREE.IcosahedronGeometry(0.09, 1), mats.glow, 0, 0.14, 1.05, 0, 0, 0, false);
    add(weapon, new THREE.IcosahedronGeometry(0.09, 1), mats.glow, 0, -0.14, 1.05, 0, 0, 0, false);
    bladeBase.position.set(0, 0, 0.85);
    bladeTip.position.set(0, 0, 1.22);
    weaponReach = 1.25;
  }

  mergeHierarchy(root);

  return {
    root, J, mats, U, style: S, styleName, weapon, bladeBase, bladeTip, bladeMesh, core, weaponReach,
    scale: S.scale,
  };
}

// --------------------------------------------------------------------- poses
// Joint rotations in degrees. Arms/thighs use YXZ order: x = pitch forward(-)/back(+),
// y = swing around the vertical, z = raise sideways.

const P = (o) => {
  const out = {};
  for (const k in o) out[k] = k === 'hipsPos' ? o[k] : o[k].map((v) => v * D);
  return out;
};

export const POSES = {
  // --- player sword ---
  a1Wind: P({ chest: [0, -55, 0], spine: [5, -15, 0], upperArmR: [-75, -95, 0], foreArmR: [-35, 0, 0], handR: [90, 0, 0], upperArmL: [-55, 40, 10], foreArmL: [-60, 0, 0], thighR: [-25, 0, -6], shinR: [30, 0, 0], thighL: [15, 0, 6], shinL: [25, 0, 0], hipsPos: [0, -0.07, 0] }),
  a1Hit: P({ chest: [8, 50, 0], spine: [8, 15, 0], upperArmR: [-85, 70, 0], foreArmR: [-10, 0, 0], handR: [90, 0, 0], upperArmL: [25, -10, 30], foreArmL: [-30, 0, 0], thighR: [-45, 0, -6], shinR: [40, 0, 0], thighL: [25, 0, 6], shinL: [20, 0, 0], hipsPos: [0, -0.12, 0] }),
  a1Fol: P({ chest: [10, 60, 0], spine: [10, 20, 0], upperArmR: [-70, 95, 0], foreArmR: [-20, 0, 0], handR: [90, 0, 0], upperArmL: [30, -10, 35], foreArmL: [-30, 0, 0], thighR: [-45, 0, -6], shinR: [40, 0, 0], thighL: [25, 0, 6], shinL: [20, 0, 0], hipsPos: [0, -0.12, 0] }),

  a2Wind: P({ chest: [0, 55, 0], spine: [5, 15, 0], upperArmR: [-80, 80, 0], foreArmR: [-70, 0, 0], handR: [90, 0, 0], upperArmL: [20, 0, 30], foreArmL: [-20, 0, 0], thighL: [-25, 0, 6], shinL: [30, 0, 0], thighR: [15, 0, -6], shinR: [25, 0, 0], hipsPos: [0, -0.07, 0] }),
  a2Hit: P({ chest: [8, -50, 0], spine: [8, -15, 0], upperArmR: [-85, -80, 0], foreArmR: [-5, 0, 0], handR: [90, 0, 0], upperArmL: [-40, 30, 20], foreArmL: [-50, 0, 0], thighL: [-45, 0, 6], shinL: [40, 0, 0], thighR: [25, 0, -6], shinR: [20, 0, 0], hipsPos: [0, -0.12, 0] }),
  a2Fol: P({ chest: [10, -60, 0], spine: [10, -20, 0], upperArmR: [-65, -105, 0], foreArmR: [-15, 0, 0], handR: [90, 0, 0], upperArmL: [-40, 30, 20], foreArmL: [-50, 0, 0], thighL: [-45, 0, 6], shinL: [40, 0, 0], thighR: [25, 0, -6], shinR: [20, 0, 0], hipsPos: [0, -0.12, 0] }),

  a3Wind: P({ chest: [-18, -10, 0], spine: [-8, 0, 0], neck: [10, 0, 0], upperArmR: [-170, 10, -10], foreArmR: [-50, 0, 0], handR: [90, 0, 0], upperArmL: [-165, -15, 10], foreArmL: [-60, 0, 0], thighR: [-10, 0, -8], shinR: [15, 0, 0], thighL: [10, 0, 8], shinL: [10, 0, 0], hipsPos: [0, 0.02, 0] }),
  a3Hit: P({ chest: [35, 0, 0], spine: [15, 0, 0], neck: [-20, 0, 0], upperArmR: [-55, 5, 0], foreArmR: [-5, 0, 0], handR: [90, 0, 0], upperArmL: [-50, -25, 0], foreArmL: [-30, 0, 0], thighR: [-60, 0, -8], shinR: [70, 0, 0], thighL: [35, 0, 8], shinL: [45, 0, 0], hipsPos: [0, -0.3, 0] }),
  a3Fol: P({ chest: [40, 0, 0], spine: [15, 0, 0], neck: [-20, 0, 0], upperArmR: [-35, 5, 0], foreArmR: [-5, 0, 0], handR: [90, 0, 0], upperArmL: [-40, -25, 0], foreArmL: [-30, 0, 0], thighR: [-60, 0, -8], shinR: [70, 0, 0], thighL: [35, 0, 8], shinL: [45, 0, 0], hipsPos: [0, -0.3, 0] }),

  airWind: P({ chest: [-10, -20, 0], upperArmR: [-150, -40, 0], foreArmR: [-40, 0, 0], handR: [90, 0, 0], upperArmL: [-40, 30, 30], thighR: [-70, 0, -5], shinR: [100, 0, 0], thighL: [-30, 0, 5], shinL: [90, 0, 0] }),
  airHit: P({ chest: [30, 30, 0], upperArmR: [-40, 50, 0], foreArmR: [-5, 0, 0], handR: [90, 0, 0], upperArmL: [20, 0, 40], thighR: [-80, 0, -5], shinR: [110, 0, 0], thighL: [-20, 0, 5], shinL: [100, 0, 0] }),

  parry: P({ chest: [-6, 20, 0], spine: [0, 10, 0], neck: [5, -20, 0], upperArmR: [-80, 20, -10], foreArmR: [-80, 0, 0], handR: [0, 90, 0], upperArmL: [-70, -45, 10], foreArmL: [-95, 0, 0], thighR: [-20, 0, -12], shinR: [25, 0, 0], thighL: [18, 0, 12], shinL: [20, 0, 0], hipsPos: [0, -0.1, 0] }),
  parryHit: P({ chest: [-14, 30, 0], spine: [-6, 12, 0], neck: [10, -25, 0], upperArmR: [-110, 30, -25], foreArmR: [-60, 0, 0], handR: [0, 90, 20], upperArmL: [-20, -20, 40], foreArmL: [-60, 0, 0], thighR: [-25, 0, -14], shinR: [30, 0, 0], thighL: [25, 0, 14], shinL: [25, 0, 0], hipsPos: [0, -0.14, 0] }),
  block: P({ chest: [8, 15, 0], spine: [5, 5, 0], upperArmR: [-60, 25, -10], foreArmR: [-80, 0, 0], handR: [0, 90, -15], upperArmL: [-55, -40, 10], foreArmL: [-95, 0, 0], thighR: [-25, 0, -12], shinR: [35, 0, 0], thighL: [20, 0, 12], shinL: [30, 0, 0], hipsPos: [0, -0.16, 0] }),

  dash: P({ chest: [35, 0, 0], spine: [15, 0, 0], neck: [-30, 0, 0], upperArmR: [55, 0, -25], foreArmR: [-20, 0, 0], handR: [100, 0, 0], upperArmL: [55, 0, 25], foreArmL: [-20, 0, 0], thighR: [-60, 0, 0], shinR: [60, 0, 0], thighL: [30, 0, 0], shinL: [70, 0, 0] }),

  riposteWind: P({ chest: [-5, -40, 0], upperArmR: [-40, -60, -20], foreArmR: [-100, 0, 0], handR: [80, 0, 0], upperArmL: [-80, 20, 0], foreArmL: [-10, 0, 0], thighR: [-30, 0, 0], shinR: [40, 0, 0], thighL: [30, 0, 0], shinL: [30, 0, 0], hipsPos: [0, -0.2, 0] }),
  riposteHit: P({ chest: [20, 30, 0], spine: [10, 10, 0], upperArmR: [-90, 10, 0], foreArmR: [0, 0, 0], handR: [90, 0, 0], upperArmL: [30, 0, 40], foreArmL: [-20, 0, 0], thighR: [-80, 0, 0], shinR: [80, 0, 0], thighL: [50, 0, 0], shinL: [20, 0, 0], hipsPos: [0, -0.4, 0] }),

  hurt: P({ chest: [-28, 10, 0], spine: [-10, 0, 0], neck: [-20, 0, 0], upperArmR: [-20, 0, -50], foreArmR: [-40, 0, 0], upperArmL: [-10, 0, 50], foreArmL: [-40, 0, 0], thighR: [10, 0, 0], thighL: [-15, 0, 0], shinL: [20, 0, 0] }),
  stagger: P({ chest: [-35, 0, 15], spine: [-15, 0, 0], neck: [-25, 0, 10], upperArmR: [10, 0, -70], foreArmR: [-20, 0, 0], upperArmL: [10, 0, 70], foreArmL: [-20, 0, 0], thighR: [15, 0, -10], shinR: [30, 0, 0], thighL: [-20, 0, 10], shinL: [40, 0, 0], hipsPos: [0, -0.15, 0] }),
  kneel: P({ chest: [30, 0, 0], spine: [20, 0, 0], neck: [30, 0, 0], upperArmR: [-10, 0, -20], foreArmR: [-30, 0, 0], upperArmL: [-10, 0, 20], foreArmL: [-30, 0, 0], thighR: [-90, 0, 0], shinR: [90, 0, 0], thighL: [0, 0, 0], shinL: [100, 0, 0], footL: [-40, 0, 0], hipsPos: [0, -0.45, 0] }),

  overdrive: P({ chest: [-15, 0, 0], neck: [-15, 0, 0], upperArmR: [-175, 0, -20], foreArmR: [0, 0, 0], handR: [90, 0, 0], upperArmL: [-20, 0, 60], foreArmL: [-30, 0, 0], thighR: [-15, 0, -10], thighL: [10, 0, 10], hipsPos: [0, -0.05, 0] }),

  // --- enemies ---
  heavyWind: P({ chest: [-20, -15, 0], spine: [-10, 0, 0], upperArmR: [-175, -10, -5], foreArmR: [-30, 0, 0], handR: [90, 0, 0], upperArmL: [-170, -25, 5], foreArmL: [-40, 0, 0], thighR: [-20, 0, -10], shinR: [20, 0, 0], thighL: [15, 0, 10], shinL: [15, 0, 0], hipsPos: [0, 0.03, 0] }),
  heavyHit: P({ chest: [40, 0, 0], spine: [20, 0, 0], upperArmR: [-40, 5, 0], foreArmR: [0, 0, 0], handR: [90, 0, 0], upperArmL: [-40, -20, 0], foreArmL: [-20, 0, 0], thighR: [-50, 0, -10], shinR: [60, 0, 0], thighL: [35, 0, 10], shinL: [40, 0, 0], hipsPos: [0, -0.25, 0] }),
  sweepWind: P({ chest: [10, -80, 0], spine: [10, -25, 0], upperArmR: [-60, -110, 0], foreArmR: [-10, 0, 0], handR: [90, 0, 0], upperArmL: [-60, -80, 0], foreArmL: [-30, 0, 0], thighR: [-30, 0, -15], shinR: [40, 0, 0], thighL: [20, 0, 15], shinL: [30, 0, 0], hipsPos: [0, -0.15, 0] }),
  sweepHit: P({ chest: [10, 80, 0], spine: [10, 25, 0], upperArmR: [-60, 110, 0], foreArmR: [-10, 0, 0], handR: [90, 0, 0], upperArmL: [-60, 80, 0], foreArmL: [-30, 0, 0], thighR: [-30, 0, -15], shinR: [40, 0, 0], thighL: [20, 0, 15], shinL: [30, 0, 0], hipsPos: [0, -0.15, 0] }),
  thrustWind: P({ chest: [-5, -35, 0], upperArmR: [-30, -40, -10], foreArmR: [-90, 0, 0], handR: [90, 0, 0], upperArmL: [-70, 30, 0], foreArmL: [-40, 0, 0], thighR: [20, 0, -10], shinR: [30, 0, 0], thighL: [-30, 0, 10], shinL: [30, 0, 0], hipsPos: [0, -0.1, 0] }),
  thrustHit: P({ chest: [15, 20, 0], upperArmR: [-90, 5, 0], foreArmR: [0, 0, 0], handR: [90, 0, 0], upperArmL: [-60, 10, 0], foreArmL: [-10, 0, 0], thighR: [-60, 0, -10], shinR: [50, 0, 0], thighL: [40, 0, 10], shinL: [20, 0, 0], hipsPos: [0, -0.22, 0] }),
  recoil: P({ chest: [-30, -20, 0], spine: [-12, 0, 0], neck: [-15, 0, 0], upperArmR: [-150, -40, -30], foreArmR: [-20, 0, 0], handR: [90, 0, 0], upperArmL: [0, 0, 50], foreArmL: [-20, 0, 0], thighR: [20, 0, -8], shinR: [20, 0, 0], thighL: [-20, 0, 8], shinL: [30, 0, 0] }),
};

// Clip = normalized keyframes. `ease` controls interpolation INTO that key.
export const CLIPS = {
  attack1: { keys: [[0, 'a1Wind'], [0.28, 'a1Hit', 'out'], [0.55, 'a1Fol'], [1, null]] },
  attack2: { keys: [[0, 'a2Wind'], [0.28, 'a2Hit', 'out'], [0.55, 'a2Fol'], [1, null]] },
  attack3: { keys: [[0, 'a3Wind'], [0.36, 'a3Wind'], [0.5, 'a3Hit', 'out'], [0.72, 'a3Fol'], [1, null]] },
  airAttack: { keys: [[0, 'airWind'], [0.3, 'airHit', 'out'], [0.6, 'airHit'], [1, null]] },
  parry: { keys: [[0, 'parry', 'out'], [0.7, 'parry'], [1, null]] },
  parryHit: { keys: [[0, 'parryHit', 'snap'], [0.4, 'parryHit'], [1, 'parry']] },
  dash: { keys: [[0, 'dash', 'out'], [0.75, 'dash'], [1, null]] },
  riposte: { keys: [[0, 'riposteWind'], [0.45, 'riposteWind'], [0.55, 'riposteHit', 'out'], [0.85, 'riposteHit'], [1, null]] },
  hurt: { keys: [[0, 'hurt', 'snap'], [0.4, 'hurt'], [1, null]] },
  overdrive: { keys: [[0, 'overdrive', 'out'], [0.7, 'overdrive'], [1, null]] },
  // enemies (hold keys are stretched by the attack's windup time)
  eSlashWind: { keys: [[0, 'a1Wind'], [1, 'a1Wind']] },
  eSlashHit: { keys: [[0, 'a1Wind'], [0.3, 'a1Hit', 'out'], [0.6, 'a1Fol'], [1, null]] },
  eSlash2Wind: { keys: [[0, 'a2Wind'], [1, 'a2Wind']] },
  eSlash2Hit: { keys: [[0, 'a2Wind'], [0.3, 'a2Hit', 'out'], [0.6, 'a2Fol'], [1, null]] },
  eHeavyWind: { keys: [[0, 'heavyWind'], [1, 'heavyWind']] },
  eHeavyHit: { keys: [[0, 'heavyWind'], [0.25, 'heavyHit', 'out'], [0.7, 'heavyHit'], [1, null]] },
  eSweepWind: { keys: [[0, 'sweepWind'], [1, 'sweepWind']] },
  eSweepHit: { keys: [[0, 'sweepWind'], [0.3, 'sweepHit', 'out'], [0.7, 'sweepHit'], [1, null]] },
  eThrustWind: { keys: [[0, 'thrustWind'], [1, 'thrustWind']] },
  eThrustHit: { keys: [[0, 'thrustWind'], [0.25, 'thrustHit', 'out'], [0.7, 'thrustHit'], [1, null]] },
  recoil: { keys: [[0, 'recoil', 'snap'], [0.5, 'recoil'], [1, null]] },
  stagger: { keys: [[0, 'stagger', 'snap'], [0.15, 'stagger'], [0.35, 'kneel'], [1, 'kneel']] },
};

const EASES = {
  linear: (t) => t,
  smooth: (t) => t * t * (3 - 2 * t),
  out: (t) => 1 - Math.pow(1 - t, 4),
  in: (t) => t * t * t,
  snap: () => 1,
};

// --------------------------------------------------------------------- animator

export class Animator {
  constructor(rig) {
    this.rig = rig;
    this.clip = null;
    this.clipName = '';
    this.time = 0;
    this.duration = 1;
    this.weight = 0;
    this.blendOut = 0.12;
    this.hold = false;
    this.base = { hipsPos: [0, 0, 0] };
    this.lastPose = {};
    this.fromPose = {};
    for (const j of ALL_KEYS) {
      if (!this.base[j]) this.base[j] = [0, 0, 0];
      this.lastPose[j] = this.base[j];
      this.fromPose[j] = [0, 0, 0];
    }
    this.xfade = 0;
    this.xfadeDur = 0.07;
    this.flinch = 0;
    this.flinchDir = 1;
  }

  play(name, duration, { hold = false, blendOut = 0.12, restart = true, xfade = 0.07 } = {}) {
    if (!restart && this.clipName === name && this.clip) return;
    // Cross-fade from whatever pose is currently displayed.
    const J = this.rig.J;
    for (const j of JOINTS) {
      const r = J[j].rotation;
      const f = this.fromPose[j];
      f[0] = r.x; f[1] = r.y; f[2] = r.z;
    }
    const hp = J.hips.position;
    this.fromPose.hipsPos[0] = hp.x;
    this.fromPose.hipsPos[1] = hp.y - 0.98;
    this.fromPose.hipsPos[2] = hp.z;
    this.xfade = xfade;
    this.xfadeDur = Math.max(0.001, xfade);
    this.clip = CLIPS[name];
    this.clipName = name;
    this.time = 0;
    this.duration = Math.max(0.01, duration);
    this.hold = hold;
    this.blendOut = blendOut;
    this.weight = 1;
  }

  stop(blendOut = 0.12) {
    this.clip = null;
    this.clipName = '';
    this.blendOut = blendOut;
  }

  get playing() {
    return !!this.clip;
  }

  get progress() {
    return this.clip ? clamp(this.time / this.duration, 0, 1) : 1;
  }

  _sample(j, t) {
    const keys = this.clip.keys;
    let k1i = keys.findIndex((k) => k[0] >= t);
    if (k1i === -1) k1i = keys.length - 1;
    const k0 = keys[Math.max(0, k1i - 1)];
    const k1 = keys[k1i];
    const base = this.base[j];
    const pv = (k) => (k[1] && POSES[k[1]][j]) || base;
    if (k0 === k1) return pv(k1);
    const span = k1[0] - k0[0];
    const lt = span > 0 ? (t - k0[0]) / span : 1;
    const e = EASES[k1[2] || 'smooth'](clamp(lt, 0, 1));
    const a = pv(k0), b = pv(k1);
    return [lerp(a[0], b[0], e), lerp(a[1], b[1], e), lerp(a[2], b[2], e)];
  }

  update(dt) {
    if (this.clip) {
      this.time += dt;
      const t = clamp(this.time / this.duration, 0, 1);
      for (const j of ALL_KEYS) this.lastPose[j] = this._sample(j, t);
      if (this.time >= this.duration && !this.hold) {
        this.clip = null;
        this.clipName = '';
      }
    } else {
      this.weight = Math.max(0, this.weight - dt / this.blendOut);
    }
    const w = this.weight;
    const xf = this.xfade > 0 ? this.xfade / this.xfadeDur : 0;
    this.xfade = Math.max(0, this.xfade - dt);
    const J = this.rig.J;
    const val = (j) => {
      const b = this.base[j];
      let v0 = b[0], v1 = b[1], v2 = b[2];
      if (w > 0) {
        const c = this.lastPose[j];
        v0 = lerp(v0, c[0], w); v1 = lerp(v1, c[1], w); v2 = lerp(v2, c[2], w);
      }
      if (xf > 0) {
        const f = this.fromPose[j];
        v0 = lerp(v0, f[0], xf); v1 = lerp(v1, f[1], xf); v2 = lerp(v2, f[2], xf);
      }
      return [v0, v1, v2];
    };
    for (const j of JOINTS) {
      const v = val(j);
      const r = J[j].rotation;
      r.x = v[0]; r.y = v[1]; r.z = v[2];
    }
    const hp = val('hipsPos');
    J.hips.position.set(hp[0], 0.98 + hp[1], hp[2]);
    // Hit flinch (additive)
    this.flinch = Math.max(0, this.flinch - dt * 5);
    if (this.flinch > 0) {
      const f = this.flinch * this.flinch;
      J.chest.rotation.x -= f * 0.5;
      J.chest.rotation.z += f * 0.3 * this.flinchDir;
      J.neck.rotation.x -= f * 0.4;
    }
  }
}

const ALL_KEYS = [...JOINTS, 'hipsPos'];

// Procedural locomotion base layer shared by all humanoids.
export function locomotion(anim, s) {
  const B = anim.base;
  const { speed = 0, phase = 0, air = false, vy = 0, time = 0, lean = 0, guard = 'sword', strafe = 0 } = s;
  const run = smoothstep(0.05, 1, speed);
  const breath = Math.sin(time * 2.2) * 0.03;
  const sw = Math.sin(phase), cw = Math.cos(phase);

  B.hipsPos[0] = 0;
  B.hipsPos[1] = -0.04 * (1 - run) + Math.abs(cw) * 0.05 * run - 0.03 * run;
  B.hipsPos[2] = 0;
  B.hips[0] = 0; B.hips[1] = sw * 0.18 * run; B.hips[2] = 0;
  B.spine[0] = 0.08 * run + lean * 0.3; B.spine[1] = -sw * 0.12 * run; B.spine[2] = -strafe * 0.1;
  B.chest[0] = 0.12 * run + breath + lean * 0.2; B.chest[1] = -sw * 0.15 * run + 0.1 * (1 - run); B.chest[2] = 0;
  B.neck[0] = -0.1 * run; B.neck[1] = -0.1 * (1 - run); B.neck[2] = 0;
  B.head[0] = 0; B.head[1] = 0; B.head[2] = 0;

  // Legs: idle stance -> run cycle
  const idleL = [-0.12, 0, 0.08], idleR = [0.15, 0, -0.08];
  const tl = [(-sw * 0.95 - 0.15) * run, 0, 0.04];
  const tr = [(sw * 0.95 - 0.15) * run, 0, -0.04];
  B.thighL[0] = lerp(idleL[0], tl[0], run); B.thighL[1] = 0; B.thighL[2] = lerp(idleL[2], tl[2], run);
  B.thighR[0] = lerp(idleR[0], tr[0], run); B.thighR[1] = 0; B.thighR[2] = lerp(idleR[2], tr[2], run);
  B.shinL[0] = lerp(0.18, Math.max(0, -cw) * 1.5 + 0.25, run); B.shinL[1] = 0; B.shinL[2] = 0;
  B.shinR[0] = lerp(0.12, Math.max(0, cw) * 1.5 + 0.25, run); B.shinR[1] = 0; B.shinR[2] = 0;
  B.footL[0] = lerp(-0.05, -0.3 * Math.max(0, -cw), run); B.footL[1] = 0; B.footL[2] = 0;
  B.footR[0] = lerp(-0.05, -0.3 * Math.max(0, cw), run); B.footR[1] = 0; B.footR[2] = 0;

  if (air) {
    const tuck = clamp(0.5 + vy * 0.05, 0, 1);
    B.thighL[0] = -0.9 * tuck - 0.2; B.shinL[0] = 1.4 * tuck + 0.3;
    B.thighR[0] = -0.3 * tuck + 0.2; B.shinR[0] = 0.9 * tuck + 0.4;
    B.footL[0] = 0.2; B.footR[0] = 0.3;
    B.hipsPos[1] = 0;
  }

  // Arms
  if (guard === 'sword') {
    // Right hand: low ready guard, blade angled forward/down. Trails behind when running.
    B.upperArmR[0] = lerp(-0.45, 0.6, run) + breath; B.upperArmR[1] = lerp(-0.3, 0, run); B.upperArmR[2] = lerp(-0.25, -0.35, run);
    B.foreArmR[0] = lerp(-1.1, -0.4, run); B.foreArmR[1] = 0; B.foreArmR[2] = 0;
    B.handR[0] = lerp(1.95, 1.4, run); B.handR[1] = 0; B.handR[2] = lerp(0, 0.3, run);
    // Left hand: forward open guard at idle, pumping when running.
    B.upperArmL[0] = lerp(-0.55, -sw * 0.9, run) - breath; B.upperArmL[1] = lerp(0.35, 0, run); B.upperArmL[2] = lerp(0.2, 0.15, run);
    B.foreArmL[0] = lerp(-1.2, -1.3, run); B.foreArmL[1] = 0; B.foreArmL[2] = 0;
    B.handL[0] = 0; B.handL[1] = 0; B.handL[2] = 0;
  } else if (guard === 'heavy') {
    // Two-handed weapon carried across the body.
    B.upperArmR[0] = -0.5 + breath; B.upperArmR[1] = 0.2; B.upperArmR[2] = -0.2;
    B.foreArmR[0] = -1.0; B.foreArmR[1] = 0; B.foreArmR[2] = 0;
    B.handR[0] = 0.9; B.handR[1] = 0.6; B.handR[2] = 0;
    B.upperArmL[0] = -0.6 - breath; B.upperArmL[1] = -0.3; B.upperArmL[2] = 0.15;
    B.foreArmL[0] = -1.1; B.foreArmL[1] = 0; B.foreArmL[2] = 0;
    B.handL[0] = 0; B.handL[1] = 0; B.handL[2] = 0;
  } else if (guard === 'spear') {
    B.upperArmR[0] = -0.2 + breath; B.upperArmR[1] = -0.2; B.upperArmR[2] = -0.25;
    B.foreArmR[0] = -1.4; B.foreArmR[1] = 0; B.foreArmR[2] = 0;
    B.handR[0] = 1.3; B.handR[1] = 0; B.handR[2] = 0;
    B.upperArmL[0] = -0.7; B.upperArmL[1] = 0.4; B.upperArmL[2] = 0.1;
    B.foreArmL[0] = -0.9; B.foreArmL[1] = 0; B.foreArmL[2] = 0;
    B.handL[0] = 0; B.handL[1] = 0; B.handL[2] = 0;
  }
}
