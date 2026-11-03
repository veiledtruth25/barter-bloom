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
