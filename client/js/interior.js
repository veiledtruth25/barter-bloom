// Adegan interior rumah ala HM:BTN: kamera miring dari sudut ruangan (dua dinding terlihat), jarak dekat.
// Ruangan: x ke timur (0..w), z ke selatan (0..d); dinding belakang di z=0 dan dinding kiri di x=0. Pintu keluar di tengah sisi selatan.
import { Vec } from './vec.js';

const OUT = '#3a2a1c';
export const ROOM = { w: 8, d: 7, h: 3.1 };
export const ENTRY = new Vec(4, 0, ROOM.d - 0.9);
export const BED_SPOT = new Vec(2.5, 0, 5.4);
export const DOOR_X = [3.0, 5.0];
export const CAMERA = { yaw: (35 * Math.PI) / 180, pitch: (41 * Math.PI) / 180, dist: 12.5, target: [4.1, 3.2] };

// ---- tata letak (berubah menurut tingkat rumah) -------------------------------------
export function layout(g) {
  const rects = [
    { x: 0, z: 0.55, w: 0.85, d: 2.3, id: 'bookshelf' },
    { x: 0.95, z: 0, w: 1.6, d: 1.4, id: 'crates' },
    { x: 4.6, z: 0, w: 1.6, d: 0.95, id: 'tv' },
    { x: 7.0, z: 3.3, w: 1.0, d: 1.5, id: 'chest' },
    { x: 0, z: 4.1, w: 1.8, d: 2.5, id: 'bed' },
  ];
  const circles = [{ x: 4.3, z: 3.7, r: 0.95, id: 'table' }, { x: 2.95, z: 4.5, r: 0.38, id: 'stool' }];
  if (g.house >= 1) rects.push({ x: 2.7, z: 0, w: 1.7, d: 0.85, id: 'kitchen' });
  if (g.house >= 2) rects.push({ x: 0, z: 3.05, w: 0.9, d: 0.95, id: 'crib' });
  return { rects, circles };
}

// Titik interaksi: pemain harus berada dalam `r` dari (x,z).
export function spots(g) {
  const s = [
    { id: 'tv', x: 5.4, z: 1.6, r: 1.3, label: 'E — Televisi (ramalan cuaca)' },
    { id: 'bed', x: 2.5, z: 5.4, r: 1.6, label: 'E — Tempat tidur' },
    { id: 'diary', x: 1.6, z: 2.3, r: 1.2, label: 'E — Rak buku (simpan permainan)' },
    { id: 'calendar', x: 7.1, z: 1.1, r: 1.2, label: 'E — Kalender' },
    { id: 'chest', x: 6.4, z: 4.1, r: 1.3, label: 'E — Peti perkakas' },
  ];
  if (g.house >= 1) s.push({ id: 'kitchen', x: 3.55, z: 1.5, r: 1.3, label: 'E — Dapur (memasak)' });
  return s;
}

export function nearestSpot(p, g) {
  let best = null, bd = 1e9;
  for (const s of spots(g)) { const d = Math.hypot(p.x - s.x, p.z - s.z); if (d < s.r && d < bd) { best = s; bd = d; } }
  return best;
}

// Dorong pemain keluar dari furnitur & dinding; mengembalikan true bila melewati pintu keluar.
export function collide(p, g, radius = 0.3) {
  const { rects, circles } = layout(g);
  for (const c of circles) { const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + radius; if (d < m && d > 1e-4) { p.x = c.x + (dx / d) * m; p.z = c.z + (dz / d) * m; } }
  for (const b of rects) {
    const nx = Math.max(b.x, Math.min(p.x, b.x + b.w)), nz = Math.max(b.z, Math.min(p.z, b.z + b.d)), dx = p.x - nx, dz = p.z - nz, d = Math.hypot(dx, dz);
    if (d < radius) {
      if (d > 1e-4) { p.x = nx + (dx / d) * radius; p.z = nz + (dz / d) * radius; }
      else { const l = p.x - b.x, r = b.x + b.w - p.x, t = p.z - b.z, bt = b.z + b.d - p.z, m = Math.min(l, r, t, bt); if (m === l) p.x = b.x - radius; else if (m === r) p.x = b.x + b.w + radius; else if (m === t) p.z = b.z - radius; else p.z = b.z + b.d + radius; }
    }
  }
  p.x = Math.max(radius, Math.min(ROOM.w - radius, p.x)); p.z = Math.max(radius + 0.1, p.z);
  const inDoor = p.x > DOOR_X[0] && p.x < DOOR_X[1];
  if (p.z > ROOM.d - 0.3) { if (inDoor) return p.z > ROOM.d - 0.12; p.z = ROOM.d - 0.3; }
  return false;
}

// ---- gambar ---------------------------------------------------------------------
function Q(c, P, pts, fill, lw, stroke = OUT) {
  c.beginPath(); pts.forEach(([x, y, z], i) => { const [sx, sy] = P(x, z, y); if (i) c.lineTo(sx, sy); else c.moveTo(sx, sy); }); c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.lineWidth = lw; c.strokeStyle = stroke; c.lineJoin = 'round'; c.stroke(); }
}

function box(c, P, lw, x, z, w, d, h, y0, cols) {
  const y1 = y0 + h;
  Q(c, P, [[x, y0, z + d], [x + w, y0, z + d], [x + w, y1, z + d], [x, y1, z + d]], cols.s, lw);
  Q(c, P, [[x + w, y0, z], [x + w, y0, z + d], [x + w, y1, z + d], [x + w, y1, z]], cols.e, lw);
  Q(c, P, [[x, y1, z], [x + w, y1, z], [x + w, y1, z + d], [x, y1, z + d]], cols.t, lw);
}

function prism(c, P, lw, cx, cz, r, h, y0, cols, n = 8) {
  const ring = (y) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2 + Math.PI / n; return [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]; });
  const bot = ring(y0), top = ring(y0 + h);
  for (let i = 0; i < n; i++) { // sisi yang menghadap kamera (selatan/timur)
    const a = ((i + 0.5) / n) * Math.PI * 2 + Math.PI / n, nx = Math.cos(a), nz = Math.sin(a);
    if (nx * Math.sin(CAMERA.yaw) + nz * Math.cos(CAMERA.yaw) > -0.05) Q(c, P, [bot[i], bot[(i + 1) % n], top[(i + 1) % n], top[i]], cols.s, lw);
  }
  Q(c, P, top, cols.t, lw);
}

const WOOD = { s: '#b9854f', e: '#9a6c3b', t: '#d9a76a' };

function drawBookshelf(c, P, lw) {
  box(c, P, lw, 0, 0.55, 0.85, 2.3, 2.5, 0, { s: '#8a5a33', e: '#a8703d', t: '#c98f55' });
  const colors = ['#c0392b', '#2e7d32', '#1565c0', '#f9a825', '#6a1b9a', '#00838f', '#e64a19'];
  for (let row = 0; row < 3; row++) {
    const y0 = 0.25 + row * 0.78; let z = 0.68, i = row;
    while (z < 2.7) { const wd = 0.14 + ((i * 7) % 3) * 0.05, ht = 0.45 + ((i * 5) % 3) * 0.08; Q(c, P, [[0.86, y0, z], [0.86, y0, z + wd], [0.86, y0 + ht, z + wd], [0.86, y0 + ht, z]], colors[(i + row * 2) % colors.length], lw * 0.6); z += wd + 0.02; i++; }
    Q(c, P, [[0.86, y0 - 0.04, 0.6], [0.86, y0 - 0.04, 2.8], [0.86, y0 - 0.12, 2.8], [0.86, y0 - 0.12, 0.6]], '#6b4423', lw * 0.6);
  }
}

function drawTV(c, P, lw, t) {
  box(c, P, lw, 4.6, 0, 1.6, 0.95, 0.9, 0, { s: '#a8703d', e: '#8a5a33', t: '#c98f55' });
  box(c, P, lw, 4.7, 0.05, 1.4, 0.8, 1.05, 0.9, { s: '#5b5b66', e: '#45454f', t: '#6f6f7a' });
  Q(c, P, [[4.82, 1.0, 0.86], [5.95, 1.0, 0.86], [5.95, 1.82, 0.86], [4.82, 1.82, 0.86]], '#26363a', lw * 0.8);
  Q(c, P, [[4.9, 1.1, 0.87], [5.3, 1.1, 0.87], [5.3, 1.45, 0.87], [4.9, 1.45, 0.87]], `rgba(160,220,210,${0.18 + Math.sin(t * 2) * 0.05})`, 0);
  for (const [x, dx] of [[5.4, -0.45], [5.4, 0.5]]) { const [ax, ay] = P(x, 0.4, 1.95), [bx, by] = P(x + dx, 0.4, 2.7); c.strokeStyle = '#d0d0d8'; c.lineWidth = lw * 1.2; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke(); }
}

function drawChest(c, P, lw) {
  box(c, P, lw, 7.0, 3.3, 1.0, 1.5, 0.75, 0, { s: '#9aa3ad', e: '#7d8791', t: '#b8c1ca' });
  Q(c, P, [[7.0, 0.75, 4.8], [8, 0.75, 4.8], [8, 0.95, 4.8], [7.0, 0.95, 4.8]], '#6b7580', lw);
  for (const z of [3.65, 4.4]) Q(c, P, [[8, 0, z], [8, 0.75, z], [8, 0.75, z + 0.12], [8, 0, z + 0.12]], '#555e68', lw * 0.7);
}

function drawBed(c, P, lw, g) {
  box(c, P, lw, 0, 4.1, 1.8, 2.5, 0.4, 0, { s: '#a8703d', e: '#8a5a33', t: '#c98f55' });
  box(c, P, lw, 0.05, 4.15, 1.7, 2.4, 0.22, 0.4, { s: '#f3e6c8', e: '#e0d1ae', t: '#fbf3dc' });
  box(c, P, lw, 0.05, 5.15, 1.7, 1.4, 0.1, 0.62, { s: '#4a8fd0', e: '#3a76b0', t: '#5aa3e8' });
  box(c, P, lw, 0.1, 4.25, 0.55, 0.85, 0.12, 0.62, { s: '#ffffff', e: '#e8e8f0', t: '#ffffff' });
  void g;
}

function drawCrib(c, P, lw) {
  box(c, P, lw, 0, 3.05, 0.9, 0.95, 0.12, 0.0, { s: '#d9a76a', e: '#b9854f', t: '#e8c08a' });
  for (let i = 0; i <= 4; i++) Q(c, P, [[0.9, 0.12, 3.05 + i * 0.22], [0.9, 0.7, 3.05 + i * 0.22], [0.9, 0.7, 3.09 + i * 0.22], [0.9, 0.12, 3.09 + i * 0.22]], '#f0d9b0', lw * 0.6);
}

function drawKitchen(c, P, lw) {
  box(c, P, lw, 2.7, 0, 1.7, 0.85, 0.95, 0, { s: '#e8e0d0', e: '#cfc5b2', t: '#9a9aa5' });
  for (const [x, z] of [[3.1, 0.3], [3.8, 0.3]]) { const pts = Array.from({ length: 14 }, (_, i) => [x + Math.cos((i / 14) * 6.283) * 0.2, 0.96, z + Math.sin((i / 14) * 6.283) * 0.2]); Q(c, P, pts, '#3a3a42', lw * 0.7); }
  Q(c, P, [[2.9, 0.3, 0.86], [4.2, 0.3, 0.86], [4.2, 0.8, 0.86], [2.9, 0.8, 0.86]], '#cfc5b2', lw * 0.7);
}

function drawCrates(c, P, lw) {
  const cr = { s: '#d9b27a', e: '#b98f58', t: '#ebc78f' };
  box(c, P, lw, 0.95, 0.1, 0.85, 0.85, 0.7, 0, cr); box(c, P, lw, 1.75, 0.15, 0.8, 0.8, 0.65, 0, cr); box(c, P, lw, 1.3, 0.2, 0.8, 0.8, 0.65, 0.7, cr);
  for (const [x, z, w, y] of [[0.95, 0.95, 0.85, 0], [1.75, 0.95, 0.8, 0], [1.3, 1.0, 0.8, 0.7]]) {
    Q(c, P, [[x, y + 0.05, z], [x + w, y + 0.65, z], [x + w, y + 0.7, z], [x, y + 0.1, z]], null, 0, null);
    const [ax, ay] = P(x, z, y + 0.05), [bx, by] = P(x + w, z, y + 0.65); c.strokeStyle = 'rgba(58,42,28,.6)'; c.lineWidth = lw * 0.7; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
  }
}

function drawWalls(c, P, lw, g) {
  const { w, d, h } = ROOM;
  // dinding belakang (z=0) & kiri (x=0): papan kayu vertikal
  Q(c, P, [[0, 0, 0], [w, 0, 0], [w, h, 0], [0, h, 0]], '#b07a46', lw);
  Q(c, P, [[0, 0, 0], [0, 0, d], [0, h, d], [0, h, 0]], '#9a6b3b', lw);
  c.lineWidth = lw * 0.5; c.strokeStyle = 'rgba(58,32,12,.35)';
  for (let x = 0.6; x < w; x += 0.6) { const [ax, ay] = P(x, 0, 0), [bx, by] = P(x, 0, h); c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke(); }
  for (let z = 0.6; z < d; z += 0.6) { const [ax, ay] = P(0, z, 0), [bx, by] = P(0, z, h); c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke(); }
  // papan lantai bawah & bingkai atas
  Q(c, P, [[0, 0, 0], [w, 0, 0], [w, 0.28, 0], [0, 0.28, 0]], '#7d5129', lw * 0.7); Q(c, P, [[0, 0, 0], [0, 0, d], [0, 0.28, d], [0, 0.28, 0]], '#6b4423', lw * 0.7);
  Q(c, P, [[-0.25, h, -0.25], [w, h, -0.25], [w, h, 0], [-0.25, h, 0]], '#d9a76a', lw); Q(c, P, [[-0.25, h, -0.25], [0, h, -0.25], [0, h, d], [-0.25, h, d]], '#c98f55', lw);
  // kalender (dinding belakang)
  Q(c, P, [[6.6, 1.35, 0], [7.5, 1.35, 0], [7.5, 2.45, 0], [6.6, 2.45, 0]], '#f7f2e4', lw);
  Q(c, P, [[6.6, 2.1, 0], [7.5, 2.1, 0], [7.5, 2.45, 0], [6.6, 2.45, 0]], '#4a9b4a', lw * 0.7);
  c.strokeStyle = 'rgba(58,42,28,.5)'; c.lineWidth = lw * 0.45;
  for (let i = 1; i < 5; i++) { const [ax, ay] = P(6.6 + i * 0.18, 0, 1.4), [bx, by] = P(6.6 + i * 0.18, 0, 2.05); c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke(); }
  // jam dinding (dinding kiri)
  const clock = Array.from({ length: 20 }, (_, i) => [0, 2.2 + Math.sin((i / 20) * 6.283) * 0.4, 3.5 + Math.cos((i / 20) * 6.283) * 0.4]);
  Q(c, P, clock, '#f3e6c8', lw);
  const [hx, hy] = P(0, 3.5, 2.2); const [h1x, h1y] = P(0, 3.5, 2.5), [h2x, h2y] = P(0, 3.7, 2.2);
  c.strokeStyle = OUT; c.lineWidth = lw * 0.9; c.beginPath(); c.moveTo(hx, hy); c.lineTo(h1x, h1y); c.moveTo(hx, hy); c.lineTo(h2x, h2y); c.stroke();
  void g;
}

function drawFloor(c, P, lw) {
  const { w, d } = ROOM;
  for (let z = 0; z < d; z += 0.5) {
    const a = Math.floor(z * 2) % 2;
    Q(c, P, [[0, 0, z], [w, 0, z], [w, 0, z + 0.5], [0, 0, z + 0.5]], a ? '#c9954f' : '#bf8a45', 0, null);
    c.strokeStyle = 'rgba(70,40,10,.45)'; c.lineWidth = Math.max(1, lw * 0.55);
    let x = (Math.floor(z * 2) * 1.7) % 2;
    const [ax, ay] = P(0, z, 0), [bx, by] = P(w, z, 0); c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
    for (; x < w; x += 2.1) { const [jx, jy] = P(x, z, 0), [kx, ky] = P(x, z + 0.5, 0); c.beginPath(); c.moveTo(jx, jy); c.lineTo(kx, ky); c.stroke(); }
  }
  // karpet & keset pintu
  Q(c, P, [[1.0, 0, 1.55], [3.5, 0, 1.55], [3.5, 0, 3.4], [1.0, 0, 3.4]], '#dcd2ae', lw * 0.8, '#a89c74');
  Q(c, P, [[1.2, 0, 1.75], [3.3, 0, 1.75], [3.3, 0, 3.2], [1.2, 0, 3.2]], null, lw * 0.5, '#b9ad85');
  Q(c, P, [[DOOR_X[0], 0, ROOM.d - 0.95], [DOOR_X[1], 0, ROOM.d - 0.95], [DOOR_X[1], 0, ROOM.d - 0.15], [DOOR_X[0], 0, ROOM.d - 0.15]], '#6fa86a', lw * 0.8, '#3f6f3c');
}

// `drawEntities` = daftar {x, z, fn} (karakter berdiri tegak) yang diurutkan bersama furnitur menurut kedalaman.
export function drawInterior(c, P, g, entities, t, lw) {
  drawFloor(c, P, lw);
  drawWalls(c, P, lw, g);
  const k = (x, z) => x * Math.sin(CAMERA.yaw) + z * Math.cos(CAMERA.yaw);
  const items = [
    [k(1.5, 1.0) - 3, () => drawBookshelf(c, P, lw)],           // menempel dinding kiri, selalu di belakang
    [k(1.6, 0.7), () => drawCrates(c, P, lw)],
    [k(5.4, 0.5), () => drawTV(c, P, lw, t)],
    [k(7.5, 4.0), () => drawChest(c, P, lw)],
    [k(0.9, 5.3), () => drawBed(c, P, lw, g)],
    [k(4.3, 3.7), () => prism(c, P, lw, 4.3, 3.7, 0.95, 0.8, 0, { s: '#b07a3a', t: '#d9a050' }, 8)],
    [k(2.95, 4.5), () => prism(c, P, lw, 2.95, 4.5, 0.38, 0.45, 0, { s: '#b07a3a', t: '#d9a050' }, 8)],
  ];
  if (g.house >= 1) items.push([k(3.5, 0.4), () => drawKitchen(c, P, lw)]);
  if (g.house >= 2) items.push([k(0.4, 3.5), () => drawCrib(c, P, lw)]);
  for (const e of entities) items.push([k(e.x, e.z), e.fn]);
  items.sort((a, b) => a[0] - b[0]).forEach(([, fn]) => fn());
}
