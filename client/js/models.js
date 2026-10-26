// Procedural low-poly models built from vertex-coloured primitives.
// Static pieces are merged into a few large meshes to keep draw calls low.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CROPS, ITEMS } from '/shared/defs.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _c = new THREE.Color();

export const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 });

// Shared uniform so swaying foliage/crops move with the wind.
export const windUniform = { value: 0 };
export const swayMat = vcMat.clone();
swayMat.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = windUniform;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uTime;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 wp = modelMatrix * vec4(transformed, 1.0);
      float h = max(0.0, transformed.y - 0.05);
      transformed.x += sin(uTime * 1.8 + wp.x * 0.7 + wp.z * 0.4) * 0.05 * h;
      transformed.z += cos(uTime * 1.5 + wp.z * 0.6) * 0.035 * h;`);
};

export const windowMat = new THREE.MeshStandardMaterial({ color: 0x3a4a5a, emissive: 0xffc46b, emissiveIntensity: 0, roughness: 0.4 });
export const glowMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffd27a, emissiveIntensity: 0.2 });

export function prep(geo, color, t = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  _c.set(color);
  const jitter = t.jitter || 0;
  for (let i = 0; i < n; i += 3) {
    // Per-face jitter gives the faceted, hand-painted look.
    const k = jitter ? 1 + (Math.random() - 0.5) * jitter : 1;
    for (let v = 0; v < 3 && i + v < n; v++) {
      arr[(i + v) * 3] = _c.r * k;
      arr[(i + v) * 3 + 1] = _c.g * k;
      arr[(i + v) * 3 + 2] = _c.b * k;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  _e.set(t.rx || 0, t.ry || 0, t.rz || 0);
  _q.setFromEuler(_e);
  const sx = t.sx ?? t.s ?? 1, sy = t.sy ?? t.s ?? 1, sz = t.sz ?? t.s ?? 1;
  _m.compose(new THREE.Vector3(t.x || 0, t.y || 0, t.z || 0), _q, new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(_m);
  return g;
}

export class Builder {
  constructor() { this.parts = []; }
  add(geo, color, t) { this.parts.push(prep(geo, color, t)); return this; }
  // Adds every part of another builder transformed by (x, z, ry, s).
  addBuilder(b, x = 0, y = 0, z = 0, ry = 0, s = 1) {
    _e.set(0, ry, 0);
    _q.setFromEuler(_e);
    _m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(s, s, s));
    for (const p of b.parts) this.parts.push(p.clone().applyMatrix4(_m));
    return this;
  }
  geometry() { return this.parts.length ? mergeGeometries(this.parts) : new THREE.BufferGeometry(); }
  mesh(mat = vcMat, shadows = true) {
    const m = new THREE.Mesh(this.geometry(), mat);
    m.castShadow = shadows;
    m.receiveShadow = true;
    return m;
  }
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s);
const cone = (r, h, s = 8) => new THREE.ConeGeometry(r, h, s);
const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
const sph = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);

// ----------------------------------------------------------------- nature

const FOLIAGE = {
  spring: [0x6cc04a, 0x7fd05a, 0xf6a8c8],
  summer: [0x3f9e3a, 0x4fb244, 0x3f9e3a],
  fall: [0xe07b2a, 0xd9502b, 0xf2b134],
  winter: [0xe8f0f6, 0xdfe9f2, 0xcfdbe6],
};

export function addTree(b, x, z, s, kind, season, rnd = Math.random) {
  const [c1, c2, accent] = FOLIAGE[season];
  b.add(cyl(0.16, 0.24, 1.4, 6), 0x7a5232, { x, y: 0.7 * s, z, s });
  if (kind === 'pine') {
    const pc = season === 'fall' ? 0x3f7f45 : season === 'winter' ? 0xdfe9f2 : 0x2f7a45;
    b.add(cone(1.1, 1.6, 7), pc, { x, y: 1.6 * s, z, s, jitter: 0.15 });
    b.add(cone(0.85, 1.4, 7), season === 'winter' ? 0xf4f8fb : 0x3a8a50, { x, y: 2.3 * s, z, s, jitter: 0.15 });
    b.add(cone(0.55, 1.1, 7), season === 'winter' ? 0xffffff : 0x46995a, { x, y: 2.95 * s, z, s, jitter: 0.15 });
  } else {
    b.add(ico(1.0, 0), c1, { x, y: 2.0 * s, z, s, jitter: 0.18, ry: rnd() * 6 });
    b.add(ico(0.75, 0), c2, { x: x + 0.45 * s, y: 2.5 * s, z: z + 0.2 * s, s, jitter: 0.18 });
    b.add(ico(0.65, 0), c1, { x: x - 0.4 * s, y: 2.35 * s, z: z - 0.3 * s, s, jitter: 0.18 });
    if (season === 'spring' || season === 'fall') {
      for (let i = 0; i < 5; i++) {
        const a = rnd() * Math.PI * 2;
        b.add(ico(0.16, 0), accent, { x: x + Math.cos(a) * 0.85 * s, y: (2.0 + rnd() * 0.9) * s, z: z + Math.sin(a) * 0.85 * s, s });
      }
    }
  }
}

export function addBush(b, x, z, s, season) {
  const [c1, , accent] = FOLIAGE[season];
  b.add(ico(0.55, 0), c1, { x, y: 0.4 * s, z, s, sy: 0.75 * s, jitter: 0.2 });
  if (season === 'spring' || season === 'summer') {
    b.add(ico(0.1, 0), season === 'spring' ? accent : 0xffe066, { x: x + 0.3 * s, y: 0.65 * s, z: z + 0.2 * s, s });
    b.add(ico(0.1, 0), season === 'spring' ? 0xffffff : 0xff7b7b, { x: x - 0.25 * s, y: 0.7 * s, z: z - 0.1 * s, s });
  }
}

export function addFlower(b, x, z, color) {
  b.add(cyl(0.02, 0.02, 0.35, 3), 0x4a9a3a, { x, y: 0.17, z });
  b.add(ico(0.09, 0), color, { x, y: 0.38, z, sy: 0.6 });
  b.add(ico(0.04, 0), 0xffe680, { x, y: 0.42, z });
}

export function addRock(b, x, z, s = 1, color = 0x8f9499) {
  b.add(ico(0.42, 0), color, { x, y: 0.22 * s, z, s, sy: 0.6 * s, ry: x * 3.1, jitter: 0.2 });
  b.add(ico(0.22, 0), 0xa3a8ad, { x: x + 0.25 * s, y: 0.12 * s, z: z + 0.15 * s, s, jitter: 0.2 });
}

export function addStump(b, x, z, s = 1) {
  b.add(cyl(0.32, 0.4, 0.45, 8), 0x7a5232, { x, y: 0.22 * s, z, s, jitter: 0.1 });
  b.add(cyl(0.3, 0.3, 0.02, 8), 0xd9b27c, { x, y: 0.46 * s, z, s });
  b.add(box(0.5, 0.12, 0.14), 0x6a4528, { x: x + 0.3 * s, y: 0.06, z, s, ry: 0.4 });
}

export function addWeed(b, x, z, season) {
  const col = season === 'winter' ? 0x9aa58a : season === 'fall' ? 0xa8a03a : 0x4f9a2a;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + x;
    b.add(cone(0.08, 0.45, 3), col, { x: x + Math.cos(a) * 0.14, y: 0.2, z: z + Math.sin(a) * 0.14, rz: Math.cos(a) * 0.4, rx: Math.sin(a) * 0.4 });
  }
}

// --------------------------------------------------------------------- crops

export function addCrop(b, x, z, crop) {
  const def = CROPS[crop.id];
  const stage = crop.withered ? -1 : crop.g >= def.days ? 3 : Math.min(2, Math.floor((crop.g / def.days) * 3));
  if (stage === -1) {
    b.add(cone(0.18, 0.35, 4), 0x7a6a3a, { x, y: 0.17, z, rz: 0.5 });
    b.add(cone(0.14, 0.3, 4), 0x8a7a4a, { x: x + 0.1, y: 0.15, z, rz: -0.6 });
    return;
  }
  if (stage === 0) {
    b.add(cone(0.05, 0.18, 4), 0x7ccf4a, { x: x - 0.07, y: 0.09, z, rz: 0.3 });
    b.add(cone(0.05, 0.16, 4), 0x8ad85a, { x: x + 0.07, y: 0.08, z, rz: -0.3 });
    return;
  }
  const leaf = def.leaf;
  const grow = stage === 1 ? 0.55 : stage === 2 ? 0.85 : 1;
  switch (def.shape) {
    case 'root':
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        b.add(cone(0.07, 0.5 * grow, 3), leaf, { x: x + Math.cos(a) * 0.08, y: 0.25 * grow, z: z + Math.sin(a) * 0.08, rz: Math.cos(a) * 0.35, rx: Math.sin(a) * 0.35 });
      }
      if (stage === 3) b.add(ico(0.18, 0), def.fruit, { x, y: 0.08, z, sy: 0.8 });
      break;
    case 'head':
      b.add(ico(0.32 * grow, 0), leaf, { x, y: 0.2 * grow, z, sy: 0.7, jitter: 0.15 });
      if (stage >= 2) b.add(ico(0.24 * grow, 1), def.fruit, { x, y: 0.28 * grow, z, jitter: 0.1 });
      break;
    case 'bush':
      b.add(ico(0.3 * grow, 0), leaf, { x, y: 0.2 * grow, z, sy: 0.7, jitter: 0.2 });
      if (stage === 3) {
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + 0.3;
          b.add(ico(0.07, 0), def.fruit, { x: x + Math.cos(a) * 0.26, y: 0.18, z: z + Math.sin(a) * 0.26 });
        }
      }
      break;
    case 'vine': {
      const h = 1.1 * grow;
      b.add(cyl(0.025, 0.025, h + 0.2, 4), 0xb08a5a, { x, y: (h + 0.2) / 2, z });
      for (let k = 0; k < 4; k++) {
        b.add(ico(0.17, 0), leaf, { x: x + (k % 2 ? 0.1 : -0.1), y: 0.2 + k * h * 0.22, z: z + (k % 2 ? -0.05 : 0.05), jitter: 0.2 });
      }
      if (stage === 3) {
        const long = crop.id !== 'tomato';
        for (let k = 0; k < 3; k++) {
          const g = long ? cyl(0.06, 0.05, 0.24, 6) : ico(0.1, 1);
          b.add(g, def.fruit, { x: x + (k % 2 ? 0.16 : -0.15), y: 0.35 + k * 0.25, z: z + 0.08 });
        }
      }
      break;
    }
    case 'stalk': {
      const h = 1.6 * grow;
      b.add(cyl(0.04, 0.06, h, 5), 0x6aa53a, { x, y: h / 2, z });
      for (let k = 0; k < 4; k++) {
        const a = k * 1.7;
        b.add(cone(0.06, 0.6 * grow, 3), leaf, { x: x + Math.cos(a) * 0.12, y: 0.3 + k * 0.3 * grow, z: z + Math.sin(a) * 0.12, rz: Math.cos(a) * 1.0, rx: Math.sin(a) * 1.0 });
      }
      if (stage === 3) {
        b.add(cyl(0.08, 0.07, 0.32, 6), def.fruit, { x: x + 0.1, y: h * 0.6, z, rz: -0.3 });
        b.add(cone(0.05, 0.2, 4), 0xd9c27a, { x, y: h + 0.1, z });
      }
      break;
    }
    case 'big':
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        b.add(cone(0.1, 0.55 * grow, 3), leaf, { x: x + Math.cos(a) * 0.15, y: 0.22 * grow, z: z + Math.sin(a) * 0.15, rz: Math.cos(a) * 0.9, rx: Math.sin(a) * 0.9 });
      }
      if (stage === 3) {
        if (crop.id === 'pumpkin') b.add(sph(0.3, 10, 7), def.fruit, { x, y: 0.22, z, sy: 0.75 });
        else {
          b.add(cyl(0.16, 0.18, 0.38, 7), def.fruit, { x, y: 0.3, z, jitter: 0.2 });
          b.add(cone(0.12, 0.3, 5), 0x3e8f4f, { x, y: 0.62, z });
        }
      }
      break;
    default:
      b.add(ico(0.2, 0), leaf, { x, y: 0.2, z });
  }
}

// --------------------------------------------------------------- buildings

export function addFence(b, x0, z0, x1, z1, color = 0xd9b27c) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / 1.5));
  const ry = -Math.atan2(z1 - z0, x1 - x0);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    b.add(box(0.14, 0.8, 0.14), color, { x: x0 + (x1 - x0) * t, y: 0.4, z: z0 + (z1 - z0) * t });
  }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  b.add(box(len, 0.08, 0.06), color, { x: cx, y: 0.55, z: cz, ry });
  b.add(box(len, 0.08, 0.06), color, { x: cx, y: 0.3, z: cz, ry });
}

// A gable-roofed building. Returns a Group with merged body + glowing windows.
export function building({ w, d, h, wall, roof, trim = 0xf4ead5, door = 0x7a4a2a, doorSide = 'south', windows = 2, chimney = false, awning = null }) {
  const b = new Builder();
  b.add(box(w, h, d), wall, { y: h / 2, jitter: 0.03 });
  b.add(box(w + 0.15, 0.2, d + 0.15), 0x8a8f94, { y: 0.1 });
  // Roof: two slanted slabs.
  const rh = Math.min(w, d) * 0.35;
  const slope = Math.atan2(rh, d / 2);
  const len = Math.hypot(rh, d / 2) + 0.35;
  b.add(box(w + 0.6, 0.18, len), roof, { y: h + rh / 2, z: d / 4 + 0.05, rx: slope, jitter: 0.06 });
  b.add(box(w + 0.6, 0.18, len), roof, { y: h + rh / 2, z: -d / 4 - 0.05, rx: -slope, jitter: 0.06 });
  // Gable triangles (both windings so they show from either side).
  const gable = new THREE.BufferGeometry();
  gable.setAttribute('position', new THREE.Float32BufferAttribute([
    -w / 2, h, -d / 2, -w / 2, h, d / 2, -w / 2, h + rh, 0,
    -w / 2, h, d / 2, -w / 2, h, -d / 2, -w / 2, h + rh, 0,
    w / 2, h, d / 2, w / 2, h, -d / 2, w / 2, h + rh, 0,
    w / 2, h, -d / 2, w / 2, h, d / 2, w / 2, h + rh, 0,
  ], 3));
  gable.computeVertexNormals();
  b.add(gable, trim, {});
  if (chimney) b.add(box(0.6, 1.4, 0.6), 0x9a6a50, { x: w / 4, y: h + rh * 0.8, z: -d / 5 });

  const winGeo = [];
  // Rotate door/window placement depending on the door side.
  const sideRot = { south: 0, east: Math.PI / 2, north: Math.PI, west: -Math.PI / 2 }[doorSide];
  const faceLen = doorSide === 'south' || doorSide === 'north' ? w : d;
  const faceDist = doorSide === 'south' || doorSide === 'north' ? d / 2 : w / 2;
  const place = (lx, y, geoW, geoH, color, depth, list) => {
    const g = prep(box(geoW, geoH, depth), color, {});
    _e.set(0, sideRot, 0);
    _q.setFromEuler(_e);
    _m.compose(new THREE.Vector3(Math.sin(sideRot) * faceDist + Math.cos(sideRot) * lx, y, Math.cos(sideRot) * faceDist - Math.sin(sideRot) * lx), _q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(_m);
    list.push(g);
  };
  place(0, 0.75, 1.0, 1.5, door, 0.12, b.parts);
  place(0, 1.55, 1.2, 0.12, trim, 0.16, b.parts);
  for (let i = 0; i < windows; i++) {
    const lx = (i % 2 ? 1 : -1) * faceLen * 0.3;
    place(lx, h * 0.6, 0.85, 0.7, trim, 0.1, b.parts);
    place(lx, h * 0.6, 0.65, 0.5, 0xffffff, 0.16, winGeo);
  }
  if (awning) {
    for (let i = 0; i < 6; i++) {
      const lx = -faceLen / 2 + 0.6 + i * ((faceLen - 1.2) / 5);
      const g = prep(box((faceLen - 1.2) / 5 + 0.02, 0.08, 1.1), i % 2 ? awning : 0xffffff, { rx: 0.35 });
      _e.set(0, sideRot, 0);
      _q.setFromEuler(_e);
      _m.compose(new THREE.Vector3(Math.sin(sideRot) * (faceDist + 0.45) + Math.cos(sideRot) * lx, h - 0.2, Math.cos(sideRot) * (faceDist + 0.45) - Math.sin(sideRot) * lx), _q, new THREE.Vector3(1, 1, 1));
      g.applyMatrix4(_m);
      b.parts.push(g);
    }
  }
  const group = new THREE.Group();
  group.add(b.mesh());
  if (winGeo.length) {
    const wm = new THREE.Mesh(mergeGeometries(winGeo), windowMat);
    group.add(wm);
  }
  return group;
}

export function addWell(b, x, z) {
  b.add(cyl(0.8, 0.85, 0.8, 10), 0x9aa0a6, { x, y: 0.4, z, jitter: 0.08 });
  b.add(cyl(0.62, 0.62, 0.05, 10), 0x3b7fc4, { x, y: 0.7, z });
  b.add(box(0.12, 1.6, 0.12), 0x7a5232, { x: x - 0.7, y: 1.2, z });
  b.add(box(0.12, 1.6, 0.12), 0x7a5232, { x: x + 0.7, y: 1.2, z });
  b.add(box(1.8, 0.14, 1.1), 0xb5523b, { x, y: 2.05, z, rx: 0.0, jitter: 0.1 });
  b.add(cyl(0.06, 0.06, 1.4, 6), 0x5a3a22, { x, y: 1.55, z, rz: Math.PI / 2 });
  b.add(cyl(0.18, 0.15, 0.25, 8), 0x8a5a32, { x, y: 1.2, z });
}

export function addBin(b, x, z) {
  b.add(box(1.4, 0.8, 0.9), 0x9a6a3a, { x, y: 0.4, z, jitter: 0.06 });
  b.add(box(1.5, 0.12, 1.0), 0x7a4a22, { x, y: 0.86, z, rx: -0.15 });
  b.add(box(1.42, 0.08, 0.92), 0x6a3a1a, { x, y: 0.15, z });
  b.add(box(0.3, 0.3, 0.02), 0xf2c94c, { x, y: 0.5, z: z + 0.46 });
}

export function addLamp(b, x, z) {
  b.add(cyl(0.07, 0.1, 2.6, 6), 0x3a3f45, { x, y: 1.3, z });
  b.add(box(0.5, 0.08, 0.5), 0x3a3f45, { x, y: 2.95, z });
}

export function addBench(b, x, z, ry) {
  const g = new Builder();
  g.add(box(1.6, 0.1, 0.5), 0xb07a45, { y: 0.45 });
  g.add(box(1.6, 0.4, 0.08), 0xb07a45, { y: 0.75, z: -0.22 });
  g.add(box(0.1, 0.45, 0.45), 0x3a3f45, { x: -0.7, y: 0.22 });
  g.add(box(0.1, 0.45, 0.45), 0x3a3f45, { x: 0.7, y: 0.22 });
  b.addBuilder(g, x, 0, z, ry);
}

export function addFountain(b, x, z) {
  b.add(cyl(2.0, 2.15, 0.6, 16), 0xb9b2a5, { x, y: 0.3, z, jitter: 0.05 });
  b.add(cyl(1.75, 1.75, 0.05, 16), 0x4aa3df, { x, y: 0.56, z });
  b.add(cyl(0.3, 0.45, 1.4, 8), 0xc9c2b5, { x, y: 1.0, z });
  b.add(cyl(0.8, 0.5, 0.25, 12), 0xc9c2b5, { x, y: 1.75, z });
  b.add(cyl(0.6, 0.6, 0.04, 12), 0x6ac0f0, { x, y: 1.88, z });
}

// -------------------------------------------------------------- characters

const toolMeshes = {};
export function toolModel(id) {
  if (toolMeshes[id] === undefined) {
    const b = new Builder();
    const handle = 0x8a5a32;
    switch (id) {
      case 'hoe':
        b.add(cyl(0.03, 0.03, 0.9, 5), handle, { y: -0.2, rx: Math.PI / 2, z: 0.25 });
        b.add(box(0.22, 0.05, 0.2), 0x9aa0a6, { z: 0.7, y: -0.28 });
        break;
      case 'can':
        b.add(cyl(0.14, 0.16, 0.28, 8), 0x4a9ad9, { y: -0.12, z: 0.1 });
        b.add(cyl(0.03, 0.03, 0.3, 5), 0x4a9ad9, { y: -0.05, z: 0.3, rx: 1.0 });
        break;
      case 'sickle':
        b.add(cyl(0.03, 0.03, 0.3, 5), handle, { y: -0.05, rx: Math.PI / 2, z: 0.12 });
        b.add(new THREE.TorusGeometry(0.15, 0.025, 4, 10, Math.PI), 0xc9ced3, { z: 0.35, y: 0.05, rx: Math.PI / 2 });
        break;
      case 'axe':
        b.add(cyl(0.03, 0.03, 0.7, 5), handle, { rx: Math.PI / 2, z: 0.25 });
        b.add(box(0.05, 0.22, 0.18), 0xb9bec3, { z: 0.55, y: 0.06 });
        break;
      case 'hammer':
        b.add(cyl(0.03, 0.03, 0.6, 5), handle, { rx: Math.PI / 2, z: 0.2 });
        b.add(box(0.12, 0.12, 0.26), 0x6a6f74, { z: 0.48, rx: Math.PI / 2 });
        break;
      case 'rod':
        b.add(cyl(0.015, 0.025, 1.4, 5), 0x6a4a2a, { rx: Math.PI / 2 - 0.5, z: 0.55, y: 0.3 });
        break;
      default:
        toolMeshes[id] = null;
        return null;
    }
    toolMeshes[id] = b.geometry();
  }
  if (!toolMeshes[id]) return null;
  const m = new THREE.Mesh(toolMeshes[id], vcMat);
  m.castShadow = true;
  return m;
}

export function makeChicken() {
  const b = new Builder();
  b.add(sph(0.22, 8, 6), 0xfafafa, { y: 0.3, sz: 1.2 });
  b.add(sph(0.13, 8, 6), 0xfafafa, { y: 0.5, z: 0.15 });
  b.add(cone(0.05, 0.1, 4), 0xf2a024, { y: 0.5, z: 0.3, rx: Math.PI / 2 });
  b.add(box(0.04, 0.1, 0.1), 0xe0322a, { y: 0.64, z: 0.15 });
  b.add(cone(0.1, 0.18, 4), 0xeeeeee, { y: 0.4, z: -0.25, rx: -1.0 });
  b.add(cyl(0.02, 0.02, 0.15, 4), 0xf2a024, { x: -0.07, y: 0.08 });
  b.add(cyl(0.02, 0.02, 0.15, 4), 0xf2a024, { x: 0.07, y: 0.08 });
  return b.mesh();
}

export function makeCow() {
  const b = new Builder();
  b.add(box(0.7, 0.55, 1.15), 0xf5f2ea, { y: 0.75 });
  b.add(box(0.72, 0.3, 0.4), 0x2a2a2a, { y: 0.85, z: -0.15 });
  b.add(box(0.5, 0.25, 0.3), 0x2a2a2a, { y: 0.7, z: 0.35, x: 0.12 });
  b.add(box(0.42, 0.42, 0.45), 0xf5f2ea, { y: 1.05, z: 0.72 });
  b.add(box(0.36, 0.2, 0.12), 0xf2b6b0, { y: 0.92, z: 0.98 });
  b.add(cone(0.05, 0.15, 4), 0xe8dcc0, { x: -0.16, y: 1.33, z: 0.7 });
  b.add(cone(0.05, 0.15, 4), 0xe8dcc0, { x: 0.16, y: 1.33, z: 0.7 });
  for (const [x, z] of [[-0.25, -0.4], [0.25, -0.4], [-0.25, 0.4], [0.25, 0.4]]) {
    b.add(box(0.14, 0.5, 0.14), 0xf5f2ea, { x, y: 0.25, z });
  }
  b.add(sph(0.12, 6, 4), 0xf2b6b0, { y: 0.45, z: -0.15 });
  return b.mesh();
}

export function forageColor(item) {
  return {
    bamboo: 0x9ad46a, herb: 0x4fb244, flower: 0xf6a8c8, berry: 0x5a4ad9, shell: 0xf2d5c0, sunflower: 0xf2c94c,
    mushroom: 0xc9503b, grape: 0x7a3a9a, chestnut: 0x8a5a32, gem: 0x6ae0f0,
  }[item] || (ITEMS[item] ? 0xffffff : 0xffffff);
}

export function addForage(b, x, z, item) {
  const c = forageColor(item);
  if (item === 'mushroom') {
    b.add(cyl(0.05, 0.06, 0.2, 5), 0xf2ead5, { x, y: 0.1, z });
    b.add(sph(0.16, 8, 5), c, { x, y: 0.22, z, sy: 0.6 });
  } else if (item === 'gem') {
    b.add(new THREE.OctahedronGeometry(0.18), c, { x, y: 0.25, z });
  } else if (item === 'shell' || item === 'chestnut') {
    b.add(sph(0.14, 6, 4), c, { x, y: 0.08, z, sy: 0.6 });
  } else if (item === 'bamboo') {
    b.add(cone(0.08, 0.35, 5), c, { x, y: 0.17, z });
    b.add(cone(0.06, 0.3, 5), c, { x: x + 0.12, y: 0.15, z });
  } else if (item === 'sunflower' || item === 'flower') {
    b.add(cyl(0.02, 0.02, 0.5, 3), 0x4a9a3a, { x, y: 0.25, z });
    b.add(cyl(0.14, 0.14, 0.04, 8), c, { x, y: 0.52, z, rx: 1.2 });
  } else {
    b.add(ico(0.22, 0), 0x3f8f3a, { x, y: 0.2, z, jitter: 0.2 });
    for (let k = 0; k < 4; k++) b.add(ico(0.06, 0), c, { x: x + Math.cos(k * 1.6) * 0.18, y: 0.28, z: z + Math.sin(k * 1.6) * 0.18 });
  }
}
