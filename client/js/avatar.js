// Chibi characters (players and villagers) with customisable looks and procedural animation.
import * as THREE from 'three';
import { toolModel } from './models.js';

export const LOOK_CHOICES = {
  skin: ['#ffe0c4', '#f2c7a0', '#d9a066', '#b07a4a', '#8a5a32', '#5e3b22'],
  hair: ['#2a1d14', '#5a3a22', '#a8642c', '#e8c35a', '#d9532b', '#f2f2f2', '#4a6fd9', '#e86ab0'],
  hairStyle: [['short', 'Pendek'], ['spiky', 'Jabrik'], ['long', 'Panjang'], ['bun', 'Sanggul'], ['bald', 'Botak']],
  hat: [['straw', 'Caping Jerami'], ['cap', 'Topi Pet'], ['bandana', 'Bandana'], ['none', 'Tanpa Topi']],
  shirt: ['#e8553e', '#3e8ee8', '#e8b93e', '#8a3ee8', '#3ec98a', '#e83e9a', '#3ed6e8', '#f08a24'],
  pants: ['#3d5a8a', '#4a6a3a', '#7a4a2a', '#5a5a64', '#8a3a4a', '#2a3a5a'],
};

export function defaultLook(color = '#e8553e') {
  return { skin: '#f2c7a0', hair: '#5a3a22', hairStyle: 'short', hat: 'straw', shirt: color, pants: '#3d5a8a' };
}

const mats = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...opts }));
  return mats.get(key);
}

function mk(geo, m, x = 0, y = 0, z = 0, parent = null) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  // Tiny details (eyes, buttons) don't need their own shadows.
  geo.computeBoundingSphere();
  o.castShadow = geo.boundingSphere.radius > 0.08;
  if (parent) parent.add(o);
  return o;
}

function limb(m, len, r, parent, x, y, z) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  mk(new THREE.CapsuleGeometry(r, len - r * 2, 4, 8), m, 0, -len / 2, 0, pivot);
  parent.add(pivot);
  return pivot;
}

function buildHair(head, look) {
  const m = mat(look.hair);
  const g = new THREE.Group();
  head.add(g);
  if (look.hairStyle === 'bald') {
    // A ring of hair around the back of the head.
    const ring = mk(new THREE.TorusGeometry(0.3, 0.06, 6, 16, Math.PI * 1.2), m, 0, -0.02, -0.03, g);
    ring.rotation.set(Math.PI / 2, 0, Math.PI * 0.9);
    return g;
  }
  const cap = mk(new THREE.SphereGeometry(0.345, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), m, 0, 0.02, -0.02, g);
  cap.rotation.x = -0.25;
  for (let i = -2; i <= 2; i++) {
    const f = mk(new THREE.SphereGeometry(0.09, 8, 6), m, i * 0.09, 0.17 - Math.abs(i) * 0.02, 0.26 - Math.abs(i) * 0.03, g);
    f.scale.set(1, 0.8, 0.7);
  }
  if (look.hairStyle === 'spiky') {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const s = mk(new THREE.ConeGeometry(0.08, 0.26, 6), m, Math.cos(a) * 0.2, 0.28, Math.sin(a) * 0.2 - 0.04, g);
      s.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
    }
    mk(new THREE.ConeGeometry(0.09, 0.3, 6), m, 0, 0.4, -0.02, g);
  } else if (look.hairStyle === 'long') {
    const back = mk(new THREE.CapsuleGeometry(0.24, 0.32, 4, 10), m, 0, -0.18, -0.15, g);
    back.scale.set(1.25, 1, 0.6);
    mk(new THREE.CapsuleGeometry(0.07, 0.3, 4, 6), m, -0.3, -0.12, 0.05, g);
    mk(new THREE.CapsuleGeometry(0.07, 0.3, 4, 6), m, 0.3, -0.12, 0.05, g);
  } else if (look.hairStyle === 'bun') {
    mk(new THREE.SphereGeometry(0.14, 12, 10), m, 0, 0.3, -0.24, g);
    const tie = mk(new THREE.TorusGeometry(0.1, 0.025, 6, 12), mat('#e8553e'), 0, 0.24, -0.2, g);
    tie.rotation.x = 0.9;
  } else if (look.hairStyle === 'ponytail') {
    const back = mk(new THREE.SphereGeometry(0.33, 14, 10), m, 0, -0.02, -0.08, g);
    back.scale.set(1.02, 0.85, 0.9);
    mk(new THREE.SphereGeometry(0.06, 8, 6), mat('#f2c94c'), 0, 0.1, -0.33, g);
    const tail = mk(new THREE.CapsuleGeometry(0.09, 0.3, 4, 8), m, 0, -0.12, -0.42, g);
    tail.rotation.x = 0.45;
  } else if (look.hairStyle === 'pigtails') {
    const back = mk(new THREE.SphereGeometry(0.33, 14, 10), m, 0, -0.02, -0.08, g);
    back.scale.set(1.02, 0.85, 0.9);
    for (const sx of [-1, 1]) {
      mk(new THREE.SphereGeometry(0.06, 8, 6), mat('#ff7ab0'), sx * 0.31, 0.06, -0.06, g);
      const tail = mk(new THREE.CapsuleGeometry(0.08, 0.2, 4, 8), m, sx * 0.38, -0.08, -0.08, g);
      tail.rotation.z = sx * 0.35;
    }
  } else {
    const back = mk(new THREE.SphereGeometry(0.33, 14, 10), m, 0, -0.02, -0.08, g);
    back.scale.set(1.02, 0.85, 0.9);
  }
  return g;
}

function buildHat(head, look) {
  const g = new THREE.Group();
  head.add(g);
  const hc = look.hatColor;
  if (look.hat === 'straw') {
    const straw = mat('#e8c35a');
    mk(new THREE.CylinderGeometry(0.58, 0.62, 0.05, 20), straw, 0, 0.22, 0, g);
    mk(new THREE.CylinderGeometry(0.25, 0.3, 0.24, 16), straw, 0, 0.35, 0, g);
    mk(new THREE.CylinderGeometry(0.305, 0.305, 0.07, 16), mat('#d9382b'), 0, 0.28, 0, g);
    g.rotation.x = -0.08;
  } else if (look.hat === 'cap') {
    const c = mat(hc || look.shirt);
    mk(new THREE.SphereGeometry(0.35, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), c, 0, 0.1, 0, g);
    const visor = mk(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 16, 1, false, -Math.PI / 2, Math.PI), c, 0, 0.12, 0.26, g);
    visor.scale.set(1, 1, 1.2);
    mk(new THREE.SphereGeometry(0.04, 6, 4), mat('#ffffff'), 0, 0.45, 0, g);
  } else if (look.hat === 'bandana') {
    const r = mat(hc || '#d9382b');
    const band = mk(new THREE.TorusGeometry(0.33, 0.045, 6, 20), r, 0, 0.12, 0, g);
    band.rotation.x = Math.PI / 2 + 0.15;
    mk(new THREE.ConeGeometry(0.06, 0.18, 4), r, -0.06, 0.05, -0.36, g).rotation.set(0.6, 0, 0.5);
    mk(new THREE.ConeGeometry(0.06, 0.18, 4), r, 0.06, 0.05, -0.36, g).rotation.set(0.6, 0, -0.5);
  } else if (look.hat === 'peci') {
    // Traditional black velvet cap.
    const peci = mk(new THREE.CylinderGeometry(0.27, 0.3, 0.2, 18), mat(hc || '#1d1c22', { roughness: 0.95 }), 0, 0.24, -0.02, g);
    peci.scale.z = 0.88;
    g.rotation.x = -0.12;
  } else if (look.hat === 'fisher') {
    const c = mat(hc || '#c9b07a', { side: THREE.DoubleSide });
    mk(new THREE.CylinderGeometry(0.25, 0.3, 0.22, 16), c, 0, 0.3, 0, g);
    mk(new THREE.CylinderGeometry(0.32, 0.47, 0.12, 18, 1, true), c, 0, 0.17, 0, g);
    mk(new THREE.CylinderGeometry(0.305, 0.305, 0.05, 16), mat('#6a5a3a'), 0, 0.22, 0, g);
  } else if (look.hat === 'ranch') {
    // Wide-brimmed rancher's hat.
    const c = mat(hc || '#8a5a32');
    const brim = mk(new THREE.CylinderGeometry(0.6, 0.62, 0.04, 22), c, 0, 0.2, 0, g);
    brim.scale.z = 0.86;
    for (const sx of [-1, 1]) {
      const curl = mk(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8, 1, false, 0, Math.PI), c, sx * 0.55, 0.25, 0, g);
      curl.rotation.set(Math.PI / 2, 0, sx * Math.PI / 2);
    }
    mk(new THREE.CylinderGeometry(0.24, 0.29, 0.3, 14), c, 0, 0.36, 0, g);
    mk(new THREE.CylinderGeometry(0.295, 0.295, 0.06, 14), mat('#3a2418'), 0, 0.25, 0, g);
    mk(new THREE.BoxGeometry(0.06, 0.06, 0.4), c, 0, 0.5, 0, g);
  } else if (look.hat === 'crown') {
    // Flower crown.
    const cols = ['#f6a8c8', '#ffffff', '#f2c94c', hc || '#ff8ab5'];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      mk(new THREE.SphereGeometry(0.06, 8, 6), mat(cols[i % cols.length]), Math.cos(a) * 0.3, 0.17, Math.sin(a) * 0.3, g);
      const leaf = mk(new THREE.ConeGeometry(0.035, 0.12, 4), mat('#6fbf4a'), Math.cos(a + 0.3) * 0.31, 0.15, Math.sin(a + 0.3) * 0.31, g);
      leaf.rotation.z = Math.PI / 2;
    }
  } else if (look.hat === 'sunhat') {
    const c = mat(hc || '#f6e2b0');
    const brim = mk(new THREE.CylinderGeometry(0.64, 0.68, 0.04, 22), c, 0, 0.2, 0, g);
    brim.rotation.x = -0.12;
    mk(new THREE.CylinderGeometry(0.24, 0.29, 0.22, 16), c, 0, 0.32, 0, g);
    mk(new THREE.CylinderGeometry(0.295, 0.295, 0.06, 16), mat('#9ad46a'), 0, 0.25, 0, g);
    mk(new THREE.SphereGeometry(0.07, 8, 6), mat('#f6a8c8'), 0.27, 0.27, 0.08, g);
    mk(new THREE.SphereGeometry(0.05, 8, 6), mat('#ffffff'), 0.3, 0.3, -0.02, g);
  }
  return g;
}

function buildFace(head, look) {
  if (look.glasses) {
    const frame = mat('#3a2a1a', { roughness: 0.4 });
    for (const sx of [-1, 1]) mk(new THREE.TorusGeometry(0.065, 0.013, 6, 16), frame, sx * 0.11, 0.0, 0.315, head);
    mk(new THREE.BoxGeometry(0.06, 0.015, 0.015), frame, 0, 0.01, 0.33, head);
  }
  if (look.beard) {
    const b = mk(new THREE.SphereGeometry(0.22, 12, 10), mat(look.beard), 0, -0.17, 0.12, head);
    b.scale.set(1.15, 0.85, 0.75);
  }
  if (look.mustache) {
    for (const sx of [-1, 1]) {
      const m = mk(new THREE.CapsuleGeometry(0.025, 0.07, 4, 6), mat(look.mustache), sx * 0.05, -0.07, 0.31, head);
      m.rotation.z = sx * 1.2;
    }
  }
  if (look.earrings) {
    const gold = mat('#f2c94c', { metalness: 0.6, roughness: 0.3 });
    mk(new THREE.SphereGeometry(0.03, 6, 4), gold, -0.33, -0.1, 0, head);
    mk(new THREE.SphereGeometry(0.03, 6, 4), gold, 0.33, -0.1, 0, head);
  }
}

export function makeAvatar(look) {
  look = { ...defaultLook(), ...(look || {}) };
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skin = mat(look.skin);
  const shirt = mat(look.shirt);
  const pants = mat(look.pants);
  const boot = mat('#5a3a22');
  const stout = look.build === 'stout';

  const legL = limb(pants, 0.5, 0.1, body, -0.13, 0.55, 0);
  const legR = limb(pants, 0.5, 0.1, body, 0.13, 0.55, 0);
  for (const leg of [legL, legR]) mk(new THREE.BoxGeometry(0.2, 0.13, 0.28), boot, 0, -0.5, 0.04, leg);

  const torso = mk(new THREE.CapsuleGeometry(0.27, 0.28, 4, 12), shirt, 0, 0.86, 0, body);
  torso.scale.set(stout ? 1.15 : 1, 1, stout ? 0.95 : 0.82);
  const front = stout ? 0.25 : 0.215;
  if (look.overalls !== false) {
    const bib = mk(new THREE.CylinderGeometry(0.285, 0.29, 0.32, 14, 1, true, -Math.PI / 2.4, Math.PI / 1.2), pants, 0, 0.74, 0, body);
    bib.scale.set(stout ? 1.15 : 1, 1, stout ? 0.97 : 0.83);
    mk(new THREE.BoxGeometry(0.26, 0.2, 0.05), pants, 0, 0.94, front, body);
    for (const sx of [-1, 1]) {
      const strap = mk(new THREE.BoxGeometry(0.06, 0.34, 0.04), pants, sx * 0.13, 1.03, front - 0.035, body);
      strap.rotation.x = -0.25;
      mk(new THREE.SphereGeometry(0.03, 6, 4), mat('#f2c94c', { metalness: 0.6, roughness: 0.3 }), sx * 0.11, 1.0, front + 0.03, body);
    }
  } else {
    // Waistband so shirts read as tucked in.
    const belt = mk(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 14), pants, 0, 0.62, 0, body);
    belt.scale.set(stout ? 1.15 : 1, 1, stout ? 0.95 : 0.84);
  }
  if (look.apron) {
    mk(new THREE.BoxGeometry(0.44, 0.6, 0.04), mat(look.apron), 0, 0.72, front + 0.07, body);
    mk(new THREE.BoxGeometry(0.3, 0.06, 0.03), mat(look.apron), 0, 1.06, front + 0.03, body);
    mk(new THREE.BoxGeometry(0.16, 0.12, 0.03), mat('#2f6f44'), 0.1, 0.62, front + 0.1, body);
  }
  if (look.skirt) {
    const sk = mk(new THREE.CylinderGeometry(0.28, 0.44, look.glow ? 0.62 : 0.42, 16), mat(look.skirt), 0, look.glow ? 0.4 : 0.5, 0, body);
    sk.scale.z = stout ? 0.95 : 0.85;
  }
  if (look.coat) {
    // Long open coat (the doctor's white coat).
    const coat = mat(look.coat, { side: THREE.DoubleSide });
    const c = mk(new THREE.CylinderGeometry(0.3, 0.38, 0.86, 16, 1, true, Math.PI * 0.12, Math.PI * 1.76), coat, 0, 0.7, 0, body);
    c.scale.z = 0.88;
    for (const sx of [-1, 1]) {
      const lapel = mk(new THREE.BoxGeometry(0.08, 0.3, 0.03), coat, sx * 0.1, 1.02, front + 0.03, body);
      lapel.rotation.z = sx * 0.3;
    }
    mk(new THREE.BoxGeometry(0.1, 0.07, 0.02), mat('#e2553e'), 0.14, 0.92, front + 0.05, body);
  }
  if (look.scarf) {
    const sc = mat(look.scarf);
    const ring = mk(new THREE.TorusGeometry(0.2, 0.055, 6, 16), sc, 0, 1.18, 0.02, body);
    ring.rotation.x = Math.PI / 2;
    mk(new THREE.ConeGeometry(0.09, 0.18, 4), sc, 0.06, 1.07, front + 0.03, body).rotation.x = Math.PI;
  }
  if (look.toolbelt) {
    const belt = mk(new THREE.CylinderGeometry(0.3, 0.3, 0.09, 14), mat('#5a3a1a'), 0, 0.63, 0, body);
    belt.scale.z = 0.86;
    mk(new THREE.BoxGeometry(0.06, 0.24, 0.05), mat('#8a5a32'), 0.27, 0.56, 0.08, body);
    mk(new THREE.BoxGeometry(0.12, 0.06, 0.06), mat('#6a6f74'), 0.27, 0.68, 0.08, body);
  }
  if (look.backpack !== false) {
    const pack = mk(new THREE.BoxGeometry(0.34, 0.36, 0.16), mat('#9a6a3a'), 0, 0.9, -0.27, body);
    pack.rotation.x = 0.08;
    mk(new THREE.BoxGeometry(0.36, 0.1, 0.18), mat('#7a4a22'), 0, 1.05, -0.27, body);
  }

  const sleeve = look.coat ? mat(look.coat) : shirt;
  const armL = limb(sleeve, 0.44, 0.085, body, -(stout ? 0.38 : 0.34), 1.1, 0);
  const armR = limb(sleeve, 0.44, 0.085, body, stout ? 0.38 : 0.34, 1.1, 0);
  armL.rotation.z = 0.12;
  armR.rotation.z = -0.12;
  mk(new THREE.SphereGeometry(0.085, 10, 8), skin, 0, -0.44, 0, armL);
  mk(new THREE.SphereGeometry(0.085, 10, 8), skin, 0, -0.44, 0, armR);
  if (look.cane) {
    const wood = mat('#6a4528');
    mk(new THREE.CylinderGeometry(0.025, 0.025, 0.72, 6), wood, 0, -0.8, 0.08, armL);
    const crook = mk(new THREE.TorusGeometry(0.06, 0.022, 6, 10, Math.PI), wood, 0.06, -0.44, 0.08, armL);
    crook.rotation.y = Math.PI / 2;
  }

  const head = new THREE.Group();
  head.position.set(0, 1.47, 0);
  body.add(head);
  mk(new THREE.SphereGeometry(0.33, 20, 16), skin, 0, 0, 0, head);
  mk(new THREE.SphereGeometry(0.06, 8, 6), skin, -0.32, -0.02, 0, head);
  mk(new THREE.SphereGeometry(0.06, 8, 6), skin, 0.32, -0.02, 0, head);
  const eyes = new THREE.Group();
  head.add(eyes);
  const eyeM = mat('#241a14', { roughness: 0.3 });
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const sx of [-1, 1]) {
    const e = mk(new THREE.SphereGeometry(0.05, 10, 8), eyeM, sx * 0.11, 0.0, 0.29, eyes);
    e.scale.set(0.85, 1.15, 0.6);
    mk(new THREE.SphereGeometry(0.016, 6, 4), shine, 0.015, 0.02, 0.035, e);
    const brow = mk(new THREE.BoxGeometry(0.08, 0.018, 0.02), mat(look.hair), sx * 0.11, 0.1, 0.3, head);
    brow.rotation.z = sx * -0.15;
  }
  const blush = mat('#f29a8a', { transparent: true, opacity: 0.8 });
  mk(new THREE.SphereGeometry(0.045, 8, 6), blush, -0.19, -0.08, 0.25, head).scale.set(1, 0.6, 0.4);
  mk(new THREE.SphereGeometry(0.045, 8, 6), blush, 0.19, -0.08, 0.25, head).scale.set(1, 0.6, 0.4);
  const mouth = mk(new THREE.TorusGeometry(0.04, 0.011, 4, 10, Math.PI), mat('#8a3a2a'), 0, -0.1, 0.305, head);
  mouth.rotation.z = Math.PI;
  mk(new THREE.SphereGeometry(0.025, 6, 4), mat(look.skin), 0, -0.03, 0.33, head);
  buildHair(head, look);
  buildHat(head, look);
  buildFace(head, look);

  const toolSlot = new THREE.Group();
  toolSlot.position.set(0, -0.44, 0.04);
  armR.add(toolSlot);

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 18), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  root.add(shadow);
  if (look.scale) root.scale.setScalar(look.scale);
  if (look.glow) {
    // The goddess shimmers: soft emissive tint and a halo.
    root.traverse((o) => {
      if (!o.isMesh || o === shadow || !o.material.isMeshStandardMaterial) return;
      o.material = o.material.clone();
      o.material.emissive = new THREE.Color(look.glow);
      o.material.emissiveIntensity = 0.35;
      o.material.transparent = true;
    });
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.025, 8, 32), new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.position.set(0, 0.05, -0.3);
    head.add(halo);
  }

  root.userData = {
    body, head, eyes, mouth, armL, armR, legL, legR, toolSlot, look, hunch: look.hunch ? 0.2 : 0,
    walk: 0, speed: 0, swing: 0, hop: 0, wave: 0, blink: 2 + Math.random() * 3, tool: undefined, t: Math.random() * 10,
  };
  return root;
}

export function setTool(av, id) {
  const u = av.userData;
  if (u.tool === id) return;
  u.tool = id;
  u.toolSlot.clear();
  const m = toolModel(id);
  if (m) u.toolSlot.add(m);
}

export function swing(av) { av.userData.swing = 1; }
export function hop(av) { av.userData.hop = 1; }

// speed: horizontal speed in units/s.
// mode: true while fishing, or a pose name for villagers
// ('sit', 'fish', 'chop', 'water', 'wave', 'shop', 'play', 'idle', 'walk').
export function animateAvatar(av, dt, speed, mode = false) {
  const u = av.userData;
  const pose = mode === true ? 'fish' : mode || 'idle';
  const prevT = u.t;
  u.t += dt;
  // Fires once every `period` seconds (staggered per character).
  const every = (period) => Math.floor(prevT / period) !== Math.floor(u.t / period);
  u.speed += (speed - u.speed) * Math.min(1, dt * 10);
  const moving = u.speed > 0.3;
  if (moving) u.walk += dt * (4 + u.speed * 1.4);
  const s = Math.sin(u.walk);
  const amp = Math.min(1, u.speed / 5);
  const breathe = Math.sin(u.t * 2.2) * 0.012;

  if (pose === 'dance' && !moving) {
    // Festival dance: bounce, sway and wave both arms.
    const b = Math.sin(u.t * 6);
    u.body.position.y = Math.abs(b) * 0.12 + breathe;
    u.body.rotation.y = Math.sin(u.t * 3) * 0.35;
    u.body.rotation.x = 0;
    u.armL.rotation.z = 0.12 + 2.2 + Math.sin(u.t * 6) * 0.35;
    u.armR.rotation.z = -0.12 - 2.2 - Math.sin(u.t * 6 + 1) * 0.35;
    u.armL.rotation.x = 0;
    u.armR.rotation.x = 0;
    u.legL.rotation.x = Math.max(0, b) * 0.5;
    u.legR.rotation.x = Math.max(0, -b) * 0.5;
    u.head.rotation.z = Math.sin(u.t * 3) * 0.12;
    blinkStep(u, dt);
    return;
  }
  u.body.rotation.y = 0;
  u.armR.rotation.z = -0.12;

  if (pose === 'sit' && !moving) {
    u.legL.rotation.x = -1.35;
    u.legR.rotation.x = -1.35;
    u.armL.rotation.x = -0.45;
    u.armR.rotation.x = -0.45;
    u.body.position.y = -0.04 + breathe;
    u.body.rotation.x = u.hunch * 0.5;
    u.head.rotation.z = Math.sin(u.t * 0.6) * 0.04;
    u.head.rotation.x = 0;
    blinkStep(u, dt);
    return;
  }

  u.legL.rotation.x = s * 0.8 * amp;
  u.legR.rotation.x = -s * 0.8 * amp;
  u.armL.rotation.x = -s * 0.7 * amp * (u.hunch ? 0.4 : 1);
  u.body.position.y = Math.abs(Math.cos(u.walk)) * 0.07 * amp + breathe;
  u.head.rotation.z = moving ? Math.sin(u.walk) * 0.05 : Math.sin(u.t * 0.7) * 0.03;
  u.head.rotation.x = -u.hunch * 0.6;

  if (!moving) {
    if (pose === 'chop' && every(2.4)) u.swing = 1;
    if (pose === 'play' && every(2.2)) u.hop = 1;
    if ((pose === 'wave' && every(5)) || (pose === 'shop' && every(8))) u.wave = 1;
  }

  // Tool swing overrides the right arm.
  if (u.swing > 0) {
    u.swing = Math.max(0, u.swing - dt * 3.2);
    const p = 1 - u.swing;
    const lift = p < 0.35 ? p / 0.35 : 1 - (p - 0.35) / 0.65;
    u.armR.rotation.x = -2.6 * lift + 0.4 * (1 - lift) * (p > 0.35 ? 1 : 0);
    u.body.rotation.x = 0.15 * (p > 0.35 ? 1 - lift : 0) + u.hunch;
  } else if (pose === 'fish' && !moving) {
    u.armR.rotation.x = -1.1 + Math.sin(u.t * 3) * 0.04;
    u.body.rotation.x = u.hunch;
  } else if (pose === 'water' && !moving) {
    u.armR.rotation.x = -0.75 + Math.sin(u.t * 2.4) * 0.12;
    u.body.rotation.x = 0.06 + u.hunch;
  } else {
    u.armR.rotation.x = s * 0.7 * amp;
    u.body.rotation.x = (moving ? 0.08 * amp : 0) + u.hunch;
  }
  // Happy hop.
  if (u.hop > 0) {
    u.hop = Math.max(0, u.hop - dt * 2.5);
    u.body.position.y += Math.sin((1 - u.hop) * Math.PI) * 0.35;
    u.armL.rotation.z = 0.12 + Math.sin((1 - u.hop) * Math.PI) * 2.2;
  } else if (u.wave > 0) {
    // Friendly wave with the left hand.
    u.wave = Math.max(0, u.wave - dt * 0.8);
    const k = Math.sin(Math.min(1, (1 - u.wave) * 4) * Math.PI / 2) * Math.min(1, u.wave * 4);
    u.armL.rotation.z = 0.12 + k * 2.5;
    u.armL.rotation.x = Math.sin(u.t * 14) * 0.25 * k;
  } else u.armL.rotation.z = 0.12;
  blinkStep(u, dt);
}

function blinkStep(u, dt) {
  u.blink -= dt;
  const closing = u.blink < 0.12 && u.blink > 0;
  u.eyes.scale.y = closing ? 0.1 : 1;
  if (u.blink <= 0) u.blink = 2 + Math.random() * 4;
}
