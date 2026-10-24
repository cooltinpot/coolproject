// Procedural geometry helpers used by characters and the environment.
import * as THREE from 'three';

// Rounded box: subdivided box whose vertices are pushed onto a rounded hull.
export function roundedBox(w, h, d, r = 0.05, seg = 3) {
  const g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  const inner = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const c = new THREE.Vector3(
      Math.max(-inner.x, Math.min(inner.x, v.x)),
      Math.max(-inner.y, Math.min(inner.y, v.y)),
      Math.max(-inner.z, Math.min(inner.z, v.z)),
    );
    n.copy(v).sub(c);
    if (n.lengthSq() > 1e-8) n.normalize().multiplyScalar(r);
    v.copy(c).add(n);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// Extruded 2D shape with a bevel, centered.
export function plate(shapePts, depth, bevel = 0.01) {
  const shape = new THREE.Shape(shapePts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 6,
  });
  g.center();
  return g;
}

// Displaced icosahedron for rocks.
export function rock(radius, detail, rng, rough = 0.28) {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  const offs = [];
  for (let i = 0; i < 6; i++) offs.push(new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize());
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const dir = v.clone().normalize();
    let k = 1;
    for (const o of offs) k += Math.max(0, dir.dot(o)) ** 4 * rough * (rng() * 0.3 + 0.7);
    k -= Math.abs(dir.y) ** 3 * 0.25;
    v.copy(dir).multiplyScalar(radius * k);
    pos.setXYZ(i, v.x, v.y * 0.75, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// Curved, tapered blade: thin extrusion along +Z with a slight arc.
export function bladeGeometry(length, width, thickness, curve = 0.04) {
  const pts = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const z = t * length;
    const bend = Math.sin(t * Math.PI * 0.5) * curve * length;
    const wTop = width * (1 - Math.pow(t, 6) * 0.9);
    pts.push([bend, z, wTop]);
  }
  // Build as a lofted strip with thickness (two faces + edges).
  const g = new THREE.BufferGeometry();
  const verts = [];
  const idx = [];
  for (let i = 0; i <= steps; i++) {
    const [bx, z, w] = pts[i];
    const tip = i === steps;
    // spine (back of the blade) and edge
    verts.push(bx - w * 0.5, 0, z + (tip ? 0.06 : 0)); // edge
    verts.push(bx + w * 0.5, thickness * 0.5, z);      // back top
    verts.push(bx + w * 0.5, -thickness * 0.5, z);     // back bottom
  }
  for (let i = 0; i < steps; i++) {
    const a = i * 3, b = (i + 1) * 3;
    // top face
    idx.push(a, b, a + 1, a + 1, b, b + 1);
    // bottom face
    idx.push(a, a + 2, b, a + 2, b + 2, b);
    // back face
    idx.push(a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function mergeTransform(geo, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] } = {}) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...scale),
  );
  geo.applyMatrix4(m);
  return geo;
}

// Merge the direct mesh children of `parent` that share a material into a
// single mesh (big draw-call savings for multi-part characters and props).
// Meshes flagged with userData.keep stay separate (animated/referenced parts).
export function mergeChildrenByMaterial(parent) {
  const buckets = new Map();
  for (const c of parent.children) {
    if (!c.isMesh || c.userData.keep || c.isInstancedMesh || c.material.isShaderMaterial) continue;
    if (c.children.length) continue;
    const arr = buckets.get(c.material) || [];
    arr.push(c);
    buckets.set(c.material, arr);
  }
  for (const [mat, meshes] of buckets) {
    if (meshes.length < 2) continue;
    const pos = [], nrm = [];
    for (const m of meshes) {
      m.updateMatrix();
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(m.matrix);
      if (!g.attributes.normal) g.computeVertexNormals();
      pos.push(g.attributes.position.array);
      nrm.push(g.attributes.normal.array);
      g.dispose();
      parent.remove(m);
    }
    const total = pos.reduce((n, a) => n + a.length, 0);
    const P = new Float32Array(total), N = new Float32Array(total);
    let o = 0;
    for (let i = 0; i < pos.length; i++) {
      P.set(pos[i], o);
      N.set(nrm[i], o);
      o += pos[i].length;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.computeBoundingSphere();
    const merged = new THREE.Mesh(geo, mat);
    merged.castShadow = meshes.some((m) => m.castShadow);
    merged.receiveShadow = meshes.some((m) => m.receiveShadow);
    parent.add(merged);
  }
}

// Apply mergeChildrenByMaterial to every node in a hierarchy.
export function mergeHierarchy(root) {
  const nodes = [];
  root.traverse((o) => { if (!o.isMesh) nodes.push(o); });
  for (const n of nodes) mergeChildrenByMaterial(n);
}
