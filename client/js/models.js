import * as THREE from 'three';
import { mesh, G } from './toon.js';

// Karakter chibi kartun: kepala besar, mata besar, badan kapsul.
export function makeFarmer({ skin = 0xffd2b0, hair = 0x5a3a22, shirt = 0x4aa3df, pants = 0x3b4a78, hat = 0xe8c14a } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const torso = mesh(G.capsule(0.28, 0.32), shirt); torso.position.y = 0.75; body.add(torso);
  const legs = [-1, 1].map((s) => {
    const l = mesh(G.capsule(0.11, 0.2), pants); l.position.set(s * 0.15, 0.34, 0);
    const pivot = new THREE.Group(); pivot.position.set(s * 0.15, 0.5, 0); l.position.set(0, -0.16, 0); pivot.add(l); root.add(pivot);
    const shoe = mesh(G.sphere(0.13), 0x6b3f22); shoe.scale.set(1, 0.7, 1.4); shoe.position.set(0, -0.32, 0.05); pivot.add(shoe);
    return pivot;
  });
  const arms = [-1, 1].map((s) => {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.36, 0.95, 0);
    const a = mesh(G.capsule(0.08, 0.26), shirt); a.position.y = -0.2; pivot.add(a);
    const hand = mesh(G.sphere(0.09), skin); hand.position.y = -0.42; pivot.add(hand);
    body.add(pivot); return pivot;
  });

  const head = new THREE.Group(); head.position.y = 1.5; body.add(head);
  const skull = mesh(G.sphere(0.42, 28, 20), skin); head.add(skull);
  for (const s of [-1, 1]) {
    const eye = mesh(G.sphere(0.075, 12, 10), 0x1d1a2b, { outline: false }); eye.scale.set(1, 1.35, 0.6); eye.position.set(s * 0.16, 0.02, 0.38); head.add(eye);
    const glint = mesh(G.sphere(0.025, 8, 6), 0xffffff, { outline: false }); glint.position.set(s * 0.16 + 0.025, 0.07, 0.42); head.add(glint);
    const cheek = mesh(G.sphere(0.06, 10, 8), 0xff9a9a, { outline: false }); cheek.scale.set(1, 0.6, 0.4); cheek.position.set(s * 0.27, -0.1, 0.33); head.add(cheek);
  }
  const hairCap = mesh(G.sphere(0.45, 28, 20), hair); hairCap.scale.set(1, 0.85, 1); hairCap.position.set(0, 0.12, -0.04); head.add(hairCap);
  const brim = mesh(G.cyl(0.62, 0.62, 0.05), hat); brim.position.y = 0.3; head.add(brim);
  const crown = mesh(G.sphere(0.34, 20, 12), hat); crown.scale.set(1, 0.7, 1); crown.position.y = 0.33; head.add(crown);

  root.userData = { body, legs, arms, head, phase: 0, swing: 0 };
  return root;
}

export function animateFarmer(f, dt, speed) {
  const u = f.userData;
  u.phase += dt * (6 + speed * 2.2);
  const k = Math.min(1, speed / 3);
  const s = Math.sin(u.phase) * 0.7 * k;
  u.legs[0].rotation.x = s; u.legs[1].rotation.x = -s;
  u.arms[0].rotation.x = -s * 0.8; u.arms[1].rotation.x = s * 0.8;
  u.body.position.y = Math.abs(Math.cos(u.phase)) * 0.06 * k;
  u.head.rotation.z = Math.sin(u.phase * 0.5) * 0.04 * k;
  if (u.swing > 0) { u.swing = Math.max(0, u.swing - dt * 3.2); u.arms[1].rotation.x = -Math.sin(u.swing * Math.PI) * 2.3; }
}

export function swingTool(f) { f.userData.swing = 1; }

const rnd = (a, b, r) => a + (b - a) * r();

export function makeTree(season, r = Math.random) {
  const g = new THREE.Group();
  const trunk = mesh(G.cyl(0.18, 0.26, 1.4), 0x7a4e2b); trunk.position.y = 0.7; g.add(trunk);
  const leaf = [0x5fbf4a, 0x4fb04a, 0xd08a2c, 0xdde7ee][season];
  for (let i = 0; i < 3; i++) {
    const b = mesh(G.sphere(rnd(0.8, 1.05, r), 20, 14), leaf);
    b.position.set(rnd(-0.45, 0.45, r), 1.7 + i * 0.35, rnd(-0.45, 0.45, r)); g.add(b);
  }
  return g;
}

export function makeHouse() {
  const g = new THREE.Group();
  const walls = mesh(G.box(5, 2.8, 4, 0.18), 0xf3e2c0); walls.position.y = 1.4; g.add(walls);
  const roof = mesh(G.cone(3.9, 2.2), 0xd2553f); roof.rotation.y = Math.PI / 4; roof.scale.set(1.15, 1, 0.95); roof.position.y = 3.85; g.add(roof);
  const door = mesh(G.box(0.9, 1.7, 0.2, 0.08), 0x8a5a33); door.position.set(0, 0.85, 2.02); g.add(door);
  for (const s of [-1, 1]) { const w = mesh(G.box(0.9, 0.9, 0.2, 0.08), 0xbfe6ff); w.position.set(s * 1.6, 1.6, 2.02); g.add(w); }
  const chim = mesh(G.box(0.6, 1.4, 0.6, 0.1), 0xb9684f); chim.position.set(1.4, 4.4, -0.6); g.add(chim);
  return g;
}

export function makeFence(len) {
  const g = new THREE.Group();
  for (let i = 0; i <= len; i++) { const p = mesh(G.box(0.18, 1, 0.18, 0.05), 0xb98a52); p.position.set(i, 0.5, 0); g.add(p); }
  for (const y of [0.35, 0.75]) { const rail = mesh(G.box(len, 0.1, 0.1, 0.03), 0xc99a62); rail.position.set(len / 2, y, 0); g.add(rail); }
  return g;
}

export function makeTile(tilled, watered) {
  const t = mesh(G.box(0.94, 0.12, 0.94, 0.05), watered ? 0x5b3a22 : 0x8b5a34, { thin: true });
  t.position.y = 0.04;
  t.userData.tilled = tilled;
  return t;
}

// ---------------------------------------------------------------- tahap 2
const CROP_COLOR = { turnip: 0xf4f0ff, potato: 0xc99a5b, cabbage: 0x8fd16a, tomato: 0xe8452c, corn: 0xf2c94c, onion: 0xe0b3ff, carrot: 0xff8a2b, eggplant: 0x6d3fa8, spinach: 0x3fa84a };

export function makeCrop(id, age, days) {
  const g = new THREE.Group();
  const p = Math.min(1, age / days), ripe = age >= days;
  const stem = mesh(G.cyl(0.04, 0.05, 0.2 + p * 0.5), 0x4faa3a, { thin: true }); stem.position.y = 0.15 + p * 0.25; g.add(stem);
  const nLeaves = ripe ? 4 : 2 + Math.floor(p * 2);
  for (let i = 0; i < nLeaves; i++) {
    const a = (i / nLeaves) * Math.PI * 2;
    const leaf = mesh(G.sphere(0.13 + p * 0.1, 10, 8), 0x62c84a, { thin: true });
    leaf.scale.set(1, 0.45, 1.5); leaf.position.set(Math.cos(a) * 0.15, 0.2 + p * 0.3, Math.sin(a) * 0.15); leaf.rotation.y = -a; g.add(leaf);
  }
  if (ripe) {
    const fruit = mesh(G.sphere(0.17, 14, 10), CROP_COLOR[id] ?? 0xffffff); fruit.position.y = 0.32; g.add(fruit);
    g.userData.ripe = true;
  }
  g.position.y = 0.08;
  return g;
}

export function makeDebris(kind) {
  const g = new THREE.Group();
  if (kind === 'weed') {
    for (let i = 0; i < 5; i++) { const b = mesh(G.cone(0.08, 0.5), 0x3f9a34, { thin: true }); b.position.set((i - 2) * 0.1, 0.25, ((i * 7) % 3 - 1) * 0.1); b.rotation.z = (i - 2) * 0.12; g.add(b); }
  } else if (kind === 'stump') {
    const s = mesh(G.cyl(0.32, 0.38, 0.5), 0x8a5a33); s.position.y = 0.25; g.add(s);
    const top = mesh(G.cyl(0.26, 0.26, 0.04), 0xd9b27a, { outline: false }); top.position.y = 0.52; g.add(top);
  } else {
    const r = mesh(G.sphere(0.4, 12, 9), kind === 'copper' ? 0x8a8a96 : 0xa7a7b2); r.scale.set(1, 0.75, 0.9); r.position.y = 0.3; g.add(r);
    if (kind === 'copper') for (let i = 0; i < 3; i++) { const o = mesh(G.sphere(0.1, 8, 6), 0xd9822b, { outline: false }); o.position.set(Math.cos(i * 2.1) * 0.25, 0.4 + (i % 2) * 0.1, Math.sin(i * 2.1) * 0.25); g.add(o); }
  }
  return g;
}

export function makeBin() {
  const g = new THREE.Group();
  const b = mesh(G.box(1.6, 0.9, 1.1, 0.12), 0xb98a52); b.position.y = 0.45; g.add(b);
  const lid = mesh(G.box(1.75, 0.18, 1.25, 0.08), 0xd2553f); lid.position.y = 0.98; g.add(lid);
  return g;
}

export function makeStall() {
  const g = new THREE.Group();
  const t = mesh(G.box(2.4, 0.9, 1.1, 0.1), 0xc99a62); t.position.y = 0.45; g.add(t);
  for (const s of [-1, 1]) { const p = mesh(G.cyl(0.07, 0.07, 2.2), 0x8a5a33); p.position.set(s * 1.1, 1.1, -0.4); g.add(p); }
  const awn = mesh(G.box(2.7, 0.14, 1.5, 0.06), 0x3fa8d9); awn.position.set(0, 2.2, -0.2); awn.rotation.x = 0.2; g.add(awn);
  for (let i = 0; i < 3; i++) { const c = mesh(G.sphere(0.18, 10, 8), [0xe8452c, 0xf2c94c, 0x8fd16a][i]); c.position.set(-0.7 + i * 0.7, 1.1, 0.1); g.add(c); }
  return g;
}

export function makeBarn() {
  const g = new THREE.Group();
  const w = mesh(G.box(4.6, 2.4, 3.4, 0.16), 0xd2553f); w.position.y = 1.2; g.add(w);
  const roof = mesh(G.cone(3.4, 1.8), 0x8a5a33); roof.rotation.y = Math.PI / 4; roof.scale.set(1.2, 1, 0.9); roof.position.y = 3.3; g.add(roof);
  const door = mesh(G.box(1.5, 1.7, 0.2, 0.08), 0xf3e2c0); door.position.set(0, 0.9, 1.72); g.add(door);
  return g;
}

export function makeAnimal(type) {
  const g = new THREE.Group();
  const cow = type === 'cow', body = cow ? 0xffffff : 0xfff3d6;
  const b = mesh(G.sphere(cow ? 0.55 : 0.3, 18, 14), body); b.scale.set(1, 0.85, cow ? 1.5 : 1.15); b.position.y = cow ? 0.8 : 0.35; g.add(b);
  const head = mesh(G.sphere(cow ? 0.3 : 0.2, 14, 10), body); head.position.set(0, cow ? 1.15 : 0.62, cow ? 0.8 : 0.3); g.add(head);
  for (const s of [-1, 1]) { const e = mesh(G.sphere(0.05, 8, 6), 0x1d1a2b, { outline: false }); e.position.set(s * (cow ? 0.12 : 0.08), cow ? 1.2 : 0.66, cow ? 1.06 : 0.46); g.add(e); }
  if (cow) {
    const spot = mesh(G.sphere(0.25, 10, 8), 0x3a2a1c, { outline: false }); spot.scale.set(1, 0.3, 1); spot.position.set(0.2, 1.3, 0); g.add(spot);
    for (const [x, z] of [[-0.3, -0.5], [0.3, -0.5], [-0.3, 0.5], [0.3, 0.5]]) { const l = mesh(G.cyl(0.09, 0.09, 0.55), 0xe8e0d0); l.position.set(x, 0.28, z); g.add(l); }
  } else {
    const beak = mesh(G.cone(0.06, 0.15), 0xff9a2b, { outline: false }); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.6, 0.5); g.add(beak);
    const comb = mesh(G.sphere(0.07, 8, 6), 0xe8452c, { outline: false }); comb.position.set(0, 0.84, 0.3); g.add(comb);
  }
  return g;
}

// ---------------------------------------------------------------- tahap 3
export function makeBuilding(wall, roof, w = 5, d = 4) {
  const g = new THREE.Group();
  const walls = mesh(G.box(w, 2.8, d, 0.18), wall); walls.position.y = 1.4; g.add(walls);
  const r = mesh(G.cone(Math.max(w, d) * 0.78, 2.0), roof); r.rotation.y = Math.PI / 4; r.scale.set(w / Math.max(w, d) * 1.15, 1, d / Math.max(w, d) * 1.15); r.position.y = 3.75; g.add(r);
  const door = mesh(G.box(0.9, 1.7, 0.2, 0.08), 0x8a5a33); door.position.set(0, 0.85, d / 2 + 0.02); g.add(door);
  for (const s of [-1, 1]) { const win = mesh(G.box(0.8, 0.8, 0.2, 0.08), 0xbfe6ff); win.position.set(s * w * 0.3, 1.7, d / 2 + 0.02); g.add(win); }
  // material sendiri supaya bisa dibuat transparan tanpa memengaruhi benda lain berwarna sama
  g.userData.fade = [walls, r, door];
  for (const part of g.userData.fade) part.material = part.material.clone();
  return g;
}

export function fadeBuilding(g, on) {
  if (g.userData.faded === on) return;
  g.userData.faded = on;
  for (const part of g.userData.fade) {
    part.material.transparent = on; part.material.opacity = on ? 0.22 : 1; part.material.depthWrite = !on; part.castShadow = !on;
    part.children.forEach((c) => { c.visible = !on; });
  }
}

export function makeLabel(text, color = '#3a2a1c') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#fff8e6'; x.strokeStyle = '#3a2a1c'; x.lineWidth = 8;
  x.beginPath(); x.roundRect(8, 8, 496, 112, 30); x.fill(); x.stroke();
  x.fillStyle = color; x.font = '700 54px Fredoka, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(2.6, 0.65, 1); s.renderOrder = 10;
  return s;
}
