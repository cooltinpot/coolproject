// Box-model mobs with procedurally painted faces.
import * as THREE from 'three';
import { makeRng } from '../noise.js';

const PX = 1 / 16;
const FACE_ORDER = ['right', 'left', 'top', 'bottom', 'front', 'back']; // BoxGeometry material order: +x,-x,+y,-y,+z,-z

function canvasTex(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  const g = c.getContext('2d');
  paint(g, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  return t;
}

function noiseFill(g, w, h, base, v, seed) {
  const rng = makeRng(seed);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const f = 1 + (rng() - 0.5) * v;
    g.fillStyle = `rgb(${base[0] * f | 0},${base[1] * f | 0},${base[2] * f | 0})`;
    g.fillRect(x, y, 1, 1);
  }
}

const texCache = new Map();
// spec: {size:[w,h,d] px, color:[r,g,b], var, faces:{front: fn(g,w,h)}}
function partMaterials(key, spec) {
  if (texCache.has(key)) return texCache.get(key);
  const [w, h, d] = spec.size;
  const dims = { right: [d, h], left: [d, h], top: [w, d], bottom: [w, d], front: [w, h], back: [w, h] };
  const mats = FACE_ORDER.map((f, i) => {
    const [tw, th] = dims[f];
    const tex = canvasTex(tw, th, (g, cw, ch) => {
      const col = (spec.faceColor && spec.faceColor[f]) || spec.color;
      noiseFill(g, cw, ch, col, spec.var ?? 0.15, key.length * 97 + i * 13);
      if (spec.paint) spec.paint(g, cw, ch, f);
      if (spec.faces && spec.faces[f]) spec.faces[f](g, cw, ch);
    });
    return tex;
  });
  texCache.set(key, mats);
  return mats;
}

export class MobModel {
  constructor() {
    this.root = new THREE.Group();
    this.parts = {};
    this.materials = [];
  }
  part(name, key, spec, pivot, offset, parent = this.root) {
    const [w, h, d] = spec.size;
    const geo = new THREE.BoxGeometry(w * PX, h * PX, d * PX);
    const texes = partMaterials(key, spec);
    const mats = texes.map((t) => {
      const m = new THREE.MeshBasicMaterial({ map: t, transparent: !!spec.transparent, alphaTest: spec.transparent ? 0.5 : 0 });
      this.materials.push(m);
      return m;
    });
    const mesh = new THREE.Mesh(geo, mats);
    const g = new THREE.Group();
    g.position.set(pivot[0] * PX, pivot[1] * PX, pivot[2] * PX);
    mesh.position.set(offset[0] * PX, offset[1] * PX, offset[2] * PX);
    g.add(mesh);
    parent.add(g);
    this.parts[name] = g;
    return g;
  }
  setBrightness(b, hurt, white) {
    for (const m of this.materials) {
      if (white) m.color.setRGB(1.6, 1.6, 1.6);
      else if (hurt) m.color.setRGB(Math.min(1, b * 1.6 + 0.3), b * 0.4, b * 0.4);
      else m.color.setRGB(b, b, b);
    }
  }
  dispose() {
    this.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    for (const m of this.materials) m.dispose();
  }
}

const eyes = (g, w, h, y, eyeCol = '#fff', pupil = '#000', gap = 2) => {
  const cx = w / 2;
  g.fillStyle = eyeCol; g.fillRect(cx - gap - 2, y, 2, 1); g.fillRect(cx + gap, y, 2, 1);
  g.fillStyle = pupil; g.fillRect(cx - gap - 1, y, 1, 1); g.fillRect(cx + gap, y, 1, 1);
};

export function buildModel(type) {
  const m = new MobModel();
  switch (type) {
    case 'pig': {
      const pink = [240, 160, 160];
      m.part('body', 'pig_body', { size: [10, 8, 16], color: pink }, [0, 10, 0], [0, 0, 0]);
      m.part('head', 'pig_head', { size: [8, 8, 8], color: pink, faces: { front: (g, w, h) => {
        eyes(g, w, h, 3, '#fff', '#000', 2);
        g.fillStyle = '#e88f9a'; g.fillRect(2, 5, 4, 3); g.fillStyle = '#a0505a'; g.fillRect(2, 6, 1, 1); g.fillRect(5, 6, 1, 1);
      } } }, [0, 12, 8], [0, 0, 4]);
      legs(m, 'pig_leg', [4, 6, 4], pink, 6, [3, 5], [-5, 5]);
      m.height = 0.9; m.width = 0.9;
      break;
    }
    case 'cow': {
      const brown = [80, 56, 38];
      const spots = (g, w, h) => { const r = makeRng(w * h); g.fillStyle = '#ddd'; for (let i = 0; i < 4; i++) g.fillRect(r() * w | 0, r() * h | 0, 3 + (r() * 3 | 0), 2 + (r() * 3 | 0)); };
      m.part('body', 'cow_body', { size: [12, 10, 18], color: brown, paint: spots }, [0, 17, 0], [0, 0, 0]);
      m.part('head', 'cow_head', { size: [8, 8, 6], color: brown, faces: { front: (g, w, h) => {
        eyes(g, w, h, 2, '#fff', '#000', 2); g.fillStyle = '#c8b0a0'; g.fillRect(2, 5, 4, 3); g.fillStyle = '#333'; g.fillRect(2, 6, 1, 1); g.fillRect(5, 6, 1, 1);
      } } }, [0, 20, 9], [0, 0, 3]);
      m.part('hornL', 'cow_horn', { size: [1, 3, 1], color: [220, 220, 200] }, [0, 0, 0], [-3.5, 5.5, 3], m.parts.head);
      m.part('hornR', 'cow_horn', { size: [1, 3, 1], color: [220, 220, 200] }, [0, 0, 0], [3.5, 5.5, 3], m.parts.head);
      legs(m, 'cow_leg', [4, 12, 4], brown, 12, [4, 7], [-6, 6]);
      m.height = 1.4; m.width = 0.9;
      break;
    }
    case 'sheep': {
      const wool = [235, 235, 235];
      m.part('body', 'sheep_body', { size: [10, 10, 16], color: wool, var: 0.1 }, [0, 17, 0], [0, 0, 0]);
      m.part('head', 'sheep_head', { size: [6, 6, 8], color: [200, 180, 160], faces: { front: (g, w, h) => { eyes(g, w, h, 2, '#fff', '#000', 1); g.fillStyle = '#e0a0a0'; g.fillRect(2, 4, 2, 1); } } }, [0, 20, 8], [0, 0, 4]);
      legs(m, 'sheep_leg', [4, 12, 4], [200, 180, 160], 12, [3, 5], [-5, 5]);
      m.height = 1.3; m.width = 0.9;
      break;
    }
    case 'zombie':
    case 'pigman':
    case 'villager':
    case 'player': {
      const zombie = type === 'zombie' || type === 'pigman';
      const pig = type === 'pigman';
      const vil = type === 'villager';
      const skin = vil ? [190, 140, 110] : pig ? [230, 150, 150] : zombie ? [100, 150, 80] : [210, 160, 120];
      const shirt = vil ? [105, 75, 45] : pig ? [150, 110, 90] : zombie ? [40, 160, 160] : [40, 170, 180];
      const pants = vil ? [95, 68, 40] : pig ? [110, 150, 90] : zombie ? [70, 60, 140] : [60, 60, 150];
      const hair = vil ? [150, 105, 80] : pig ? [120, 160, 100] : zombie ? [60, 100, 50] : [70, 45, 25];
      m.part('head', `${type}_head`, { size: [8, 8, 8], color: skin, faceColor: { top: hair, back: hair }, faces: { front: (g, w, h) => {
        g.fillStyle = `rgb(${hair})`; g.fillRect(0, 0, 8, 2); g.fillRect(0, 2, 1, 1); g.fillRect(7, 2, 1, 1);
        eyes(g, w, h, 4, zombie ? '#1a3010' : '#fff', zombie ? '#000' : '#3050a0', 1);
        g.fillStyle = zombie ? '#3b5a2e' : '#8a5a40'; g.fillRect(3, 6, 2, 1);
      }, left: (g) => { g.fillStyle = `rgb(${hair})`; g.fillRect(0, 0, 8, 2); }, right: (g) => { g.fillStyle = `rgb(${hair})`; g.fillRect(0, 0, 8, 2); } } }, [0, 24, 0], [0, 4, 0]);
      m.part('body', `${type}_body`, { size: [8, 12, 4], color: shirt }, [0, 18, 0], [0, 0, 0]);
      m.part('armL', `${type}_arm`, { size: [4, 12, 4], color: skin, paint: (g, w, h) => { g.fillStyle = `rgb(${shirt})`; g.fillRect(0, 0, w, 4); } }, [-6, 22, 0], [0, -4, 0]);
      m.part('armR', `${type}_arm`, { size: [4, 12, 4], color: skin, paint: (g, w, h) => { g.fillStyle = `rgb(${shirt})`; g.fillRect(0, 0, w, 4); } }, [6, 22, 0], [0, -4, 0]);
      m.part('legL', `${type}_leg`, { size: [4, 12, 4], color: pants, paint: (g, w, h) => { g.fillStyle = '#444'; g.fillRect(0, h - 2, w, 2); } }, [-2, 12, 0], [0, -6, 0]);
      m.part('legR', `${type}_leg`, { size: [4, 12, 4], color: pants, paint: (g, w, h) => { g.fillStyle = '#444'; g.fillRect(0, h - 2, w, 2); } }, [2, 12, 0], [0, -6, 0]);
      if (vil) {
        m.part('nose', 'villager_nose', { size: [2, 4, 2], color: [170, 120, 95] }, [0, 0, 0], [0, 2.5, 5], m.parts.head);
        m.part('robe', 'villager_robe', { size: [9, 8, 5], color: shirt }, [0, 0, 0], [0, -5, 0], m.parts.body);
      }
      m.humanoid = true;
      m.height = 1.95; m.width = 0.6;
      break;
    }
    case 'skeleton': {
      const bone = [200, 200, 196];
      m.part('head', 'skel_head', { size: [8, 8, 8], color: bone, faces: { front: (g) => {
        g.fillStyle = '#222'; g.fillRect(1, 3, 2, 2); g.fillRect(5, 3, 2, 2); g.fillRect(3, 5, 2, 1);
        g.fillStyle = '#555'; g.fillRect(1, 6, 6, 1); g.fillStyle = '#999'; for (let x = 1; x < 7; x += 2) g.fillRect(x, 6, 1, 1);
      } } }, [0, 24, 0], [0, 4, 0]);
      m.part('body', 'skel_body', { size: [8, 12, 4], color: bone, paint: (g, w, h) => { g.fillStyle = '#444'; for (let y = 2; y < h - 2; y += 2) g.fillRect(1, y, w - 2, 1); g.fillRect(3, 0, 2, h); } }, [0, 18, 0], [0, 0, 0]);
      const limb = { size: [2, 12, 2], color: bone };
      m.part('armL', 'skel_limb', limb, [-5, 22, 0], [0, -4, 0]);
      m.part('armR', 'skel_limb', limb, [5, 22, 0], [0, -4, 0]);
      m.part('legL', 'skel_limb', limb, [-2, 12, 0], [0, -6, 0]);
      m.part('legR', 'skel_limb', limb, [2, 12, 0], [0, -6, 0]);
      m.part('bow', 'skel_bow', { size: [1, 10, 1], color: [120, 85, 40] }, [0, 0, 0], [0, -9, 2], m.parts.armR);
      m.humanoid = true;
      m.height = 1.95; m.width = 0.6;
      break;
    }
    case 'chicken': {
      const white = [240, 240, 240];
      m.part('body', 'chick_body', { size: [6, 6, 8], color: white }, [0, 8, 0], [0, 0, 0]);
      m.part('head', 'chick_head', { size: [4, 6, 3], color: white, faces: { front: (g) => { g.fillStyle = '#000'; g.fillRect(0, 1, 1, 1); g.fillRect(3, 1, 1, 1); } } }, [0, 10, 3], [0, 2, 1.5]);
      m.part('beak', 'chick_beak', { size: [4, 2, 2], color: [240, 180, 40] }, [0, 0, 0], [0, 2, 4], m.parts.head);
      m.part('wattle', 'chick_wattle', { size: [2, 2, 2], color: [220, 30, 30] }, [0, 0, 0], [0, 0, 3.5], m.parts.head);
      m.part('wingL', 'chick_wing', { size: [1, 4, 6], color: white }, [-3.5, 10, 0], [0, -2, 0]);
      m.part('wingR', 'chick_wing', { size: [1, 4, 6], color: white }, [3.5, 10, 0], [0, -2, 0]);
      const leg = { size: [1, 5, 1], color: [240, 180, 40] };
      m.part('legFL', 'chick_leg', leg, [-1.5, 5, 1], [0, -2.5, 0]);
      m.part('legFR', 'chick_leg', leg, [1.5, 5, 1], [0, -2.5, 0]);
      m.chicken = true;
      m.height = 0.7; m.width = 0.4;
      break;
    }
    case 'creeper': {
      const green = [80, 170, 70];
      const mottled = (g, w, h) => { const r = makeRng(w * 7 + h); for (let i = 0; i < w * h / 3; i++) { g.fillStyle = r() < 0.5 ? '#3a7a30' : '#a8e098'; g.fillRect(r() * w | 0, r() * h | 0, 1, 1); } };
      m.part('head', 'creeper_head', { size: [8, 8, 8], color: green, paint: mottled, faces: { front: (g) => {
        g.fillStyle = '#111'; g.fillRect(1, 2, 2, 2); g.fillRect(5, 2, 2, 2); g.fillRect(3, 4, 2, 2); g.fillRect(2, 5, 4, 2); g.fillRect(2, 7, 1, 1); g.fillRect(5, 7, 1, 1);
      } } }, [0, 18, 0], [0, 4, 0]);
      m.part('body', 'creeper_body', { size: [8, 12, 4], color: green, paint: mottled }, [0, 12, 0], [0, 0, 0]);
      legs(m, 'creeper_leg', [4, 6, 4], green, 6, [2, 4], [-4, 4]);
      m.height = 1.7; m.width = 0.6;
      break;
    }
    case 'spider': {
      const dark = [50, 40, 36];
      m.part('body', 'spider_body', { size: [10, 8, 12], color: dark }, [0, 9, -7], [0, 0, 0]);
      m.part('neck', 'spider_neck', { size: [6, 6, 6], color: dark }, [0, 9, 0], [0, 0, 0]);
      m.part('head', 'spider_head', { size: [8, 8, 8], color: dark, faces: { front: (g) => {
        g.fillStyle = '#d02020'; g.fillRect(1, 3, 2, 1); g.fillRect(5, 3, 2, 1); g.fillRect(2, 2, 1, 1); g.fillRect(5, 2, 1, 1); g.fillRect(3, 4, 2, 1);
      } } }, [0, 9, 3], [0, 0, 4]);
      for (let i = 0; i < 8; i++) {
        const side = i < 4 ? -1 : 1;
        const z = [-1.5, -0.5, 0.5, 1.5][i % 4] * 2;
        const g = m.part(`leg${i}`, 'spider_leg', { size: [16, 2, 2], color: [40, 32, 28] }, [side * 3, 9, z], [side * 8, 0, 0]);
        g.userData.side = side; g.userData.phase = i % 2 ? Math.PI : 0;
        g.rotation.z = -side * 0.6;
        g.rotation.y = (i % 4 - 1.5) * 0.35 * side;
      }
      m.spider = true;
      m.height = 0.9; m.width = 1.4;
      break;
    }
  }
  return m;
}

function legs(m, key, size, color, h, [zf, zb], [xl, xr]) {
  const spec = { size, color, paint: (g, w, hh) => { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, hh - 1, w, 1); } };
  const lx = Math.abs(xl) - size[0] / 2, z = zb;
  m.part('legFL', key, spec, [-lx, h, z], [0, -h / 2, 0]);
  m.part('legFR', key, spec, [lx, h, z], [0, -h / 2, 0]);
  m.part('legBL', key, spec, [-lx, h, -z], [0, -h / 2, 0]);
  m.part('legBR', key, spec, [lx, h, -z], [0, -h / 2, 0]);
}

// Animate walking: limbSwing phase, amount 0..1
export function animateModel(m, phase, amount, opts = {}) {
  const s = Math.sin(phase) * 0.9 * amount;
  const P = m.parts;
  if (m.humanoid) {
    if (P.legL) P.legL.rotation.x = s;
    if (P.legR) P.legR.rotation.x = -s;
    if (opts.bowArms) { P.armR.rotation.x = -Math.PI / 2; P.armL.rotation.x = -Math.PI / 2; P.armL.rotation.y = 0.5; }
    else if (opts.zombieArms) { P.armL.rotation.x = -Math.PI / 2 + Math.sin(phase * 0.5) * 0.05; P.armR.rotation.x = -Math.PI / 2 - Math.sin(phase * 0.5) * 0.05; }
    else { P.armL.rotation.x = -s * 0.8; P.armR.rotation.x = s * 0.8 - (opts.swing || 0) * 1.6; }
  } else if (m.spider) {
    for (let i = 0; i < 8; i++) {
      const g = P[`leg${i}`];
      g.rotation.x = Math.sin(phase * 1.5 + g.userData.phase + i) * 0.4 * amount;
    }
  } else {
    if (m.chicken) {
      P.legFL.rotation.x = s; P.legFR.rotation.x = -s;
      const flap = opts.flap || 0;
      P.wingL.rotation.z = -flap; P.wingR.rotation.z = flap;
    } else if (P.legFL) { P.legFL.rotation.x = s; P.legBR.rotation.x = s; P.legFR.rotation.x = -s; P.legBL.rotation.x = -s; }
  }
  if (P.head && opts.headPitch !== undefined) P.head.rotation.x = -opts.headPitch;
  if (P.head && opts.headYaw !== undefined) P.head.rotation.y = opts.headYaw;
}
