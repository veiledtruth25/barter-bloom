import { CROPS, TOOLS } from '../core/items.js';
import { MINE, STRUCTURES, POND, FENCE, SPOTS } from './world.js';
import { festivalOn } from '../core/calendar.js';
import { Vec } from './vec.js';

const OUT = '#3a2a1c';
export const DIRV = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
export const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
export const dirOf = (dx, dz) => (Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'right' : 'left') : (dz > 0 ? 'down' : 'up'));

// ---- entitas (karakter, hewan) ------------------------------------------------
export function makeEntity(style = {}, scale = 1) {
  return { position: new Vec(), visible: true, dir: 'down', scale, style, userData: { phase: 0, swing: 0, moving: false } };
}
export function animatePerson(e, dt, speed) {
  const u = e.userData;
  u.moving = speed > 0.1;
  if (u.moving) u.phase += dt * (7 + speed * 1.6);
  if (u.swing > 0) u.swing = Math.max(0, u.swing - dt * 3.2);
}
export const swingTool = (e) => { e.userData.swing = 1; };

// ---- primitif gambar (satuan = petak; konteks sudah di-scale) -----------------------
function rr(c, x, y, w, h, r, fill, lw = 0.06) {
  c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = fill; c.fill(); if (lw) { c.lineWidth = lw; c.strokeStyle = OUT; c.stroke(); }
}
function oval(c, x, y, rx, ry, fill, lw = 0.06) {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); if (lw) { c.lineWidth = lw; c.strokeStyle = OUT; c.stroke(); }
}
function poly(c, pts, fill, lw = 0.06) {
  c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fillStyle = fill; c.fill(); if (lw) { c.lineWidth = lw; c.strokeStyle = OUT; c.lineJoin = 'round'; c.stroke(); }
}
const at = (c, px, py, T, s, fn) => { c.save(); c.translate(px, py); c.scale(T * s, T * s); c.lineJoin = 'round'; c.lineCap = 'round'; fn(); c.restore(); };

// ---- orang: karakter chibi kartun 4 arah ---------------------------------------------
function drawPerson(c, px, py, T, e) {
  const st = e.style, u = e.userData, dir = e.dir, walk = u.moving ? Math.sin(u.phase) : 0;
  at(c, px, py, T, e.scale, () => {
    oval(c, 0, 0, 0.36, 0.13, 'rgba(0,0,0,.22)', 0);
    const bob = u.moving ? Math.abs(Math.cos(u.phase)) * 0.05 : 0;
    // kaki
    for (const s of [-1, 1]) {
      const lift = u.moving ? Math.max(0, Math.sin(u.phase + (s > 0 ? Math.PI : 0))) * 0.12 : 0;
      const sx = dir === 'left' || dir === 'right' ? s * 0.07 : s * 0.13;
      rr(c, sx - 0.1, -0.42 - lift, 0.2, 0.4, 0.08, st.pants);
      rr(c, sx - 0.12 + (dir === 'right' ? 0.04 : dir === 'left' ? -0.04 : 0), -0.1 - lift, 0.24, 0.12, 0.06, '#6b3f22');
    }
    c.translate(0, -bob);
    // lengan belakang (sisi samping)
    const side = dir === 'left' || dir === 'right';
    const arm = (s, front) => {
      const sw = u.swing > 0 && front ? -Math.sin((1 - u.swing) * Math.PI) * 0.4 : walk * 0.08 * -s;
      const ax = side ? 0.02 * s : s * 0.33, ay = -0.64 + sw;
      rr(c, ax - 0.085, ay - 0.1, 0.17, 0.34, 0.08, st.shirt);
      oval(c, ax, ay + 0.28, 0.09, 0.09, st.skin);
    };
    if (!side) arm(-1, false);
    // badan
    rr(c, -0.27, -0.94, 0.54, 0.56, 0.16, st.shirt);
    arm(1, true);
    // kepala
    const hy = -1.2;
    if (dir === 'up') {
      oval(c, 0, hy, 0.4, 0.38, st.hair);
    } else {
      oval(c, 0, hy, 0.38, 0.36, st.skin);
      // rambut
      c.beginPath(); c.ellipse(0, hy - 0.04, 0.41, 0.36, 0, Math.PI, Math.PI * 2); c.closePath();
      c.fillStyle = st.hair; c.fill(); c.lineWidth = 0.06; c.strokeStyle = OUT; c.stroke();
      if (dir === 'down') { oval(c, -0.2, hy - 0.1, 0.12, 0.1, st.hair, 0); oval(c, 0.2, hy - 0.1, 0.12, 0.1, st.hair, 0); }
      if (side) oval(c, dir === 'left' ? 0.24 : -0.24, hy, 0.16, 0.3, st.hair);
      // mata & pipi
      const eyes = dir === 'down' ? [-0.14, 0.14] : [dir === 'left' ? -0.19 : 0.19];
      for (const ex of eyes) { oval(c, ex, hy + 0.03, 0.05, 0.075, '#1d1a2b', 0); oval(c, ex + 0.015, hy, 0.016, 0.02, '#fff', 0); }
      for (const ex of (dir === 'down' ? [-0.24, 0.24] : [dir === 'left' ? -0.27 : 0.27])) oval(c, ex, hy + 0.13, 0.055, 0.035, 'rgba(255,120,120,.5)', 0);
    }
    if (st.hat) { oval(c, 0, hy - 0.24, 0.52, 0.15, st.hat); c.beginPath(); c.ellipse(0, hy - 0.34, 0.3, 0.19, 0, Math.PI, Math.PI * 2); c.closePath(); c.fillStyle = st.hat; c.fill(); c.lineWidth = 0.06; c.strokeStyle = OUT; c.stroke(); }
    if (u.swing > 0 && e.tool) {
      const t = 1 - u.swing, [dx, dz] = DIRV[dir];
      c.save(); c.translate(dx * 0.5, -0.5 + dz * 0.3 + (dir === 'up' ? -0.2 : 0)); c.rotate((t - 0.5) * 1.8 * (dir === 'left' ? -1 : 1));
      c.font = '0.62px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(TOOLS[e.tool].icon, 0, 0); c.restore();
    }
  });
}

function drawDog(c, px, py, T, e) {
  const t = e.userData.t || 0, flip = e.dir === 'left' ? -1 : 1;
  at(c, px, py, T, 1, () => {
    c.scale(flip, 1);
    oval(c, 0, 0, 0.4, 0.13, 'rgba(0,0,0,.22)', 0);
    const hop = Math.abs(Math.sin(t * 6)) * 0.04; c.translate(0, -hop);
    for (const x of [-0.25, 0.22]) rr(c, x - 0.06, -0.3, 0.12, 0.3, 0.05, '#c08a42');
    oval(c, 0, -0.45, 0.4, 0.26, '#d9a35a');
    c.save(); c.translate(-0.38, -0.55); c.rotate(-0.6 + Math.sin(t * 14) * 0.4); rr(c, -0.04, -0.28, 0.1, 0.3, 0.05, '#d9a35a'); c.restore();
    oval(c, 0.38, -0.66, 0.24, 0.22, '#d9a35a'); oval(c, 0.55, -0.6, 0.12, 0.09, '#f3dcb0');
    oval(c, 0.3, -0.84, 0.08, 0.14, '#8a5a2b'); oval(c, 0.44, -0.7, 0.035, 0.04, '#1d1a2b', 0); oval(c, 0.62, -0.62, 0.03, 0.03, '#1d1a2b', 0);
  });
}

function drawAnimal(c, px, py, T, e) {
  const cow = e.type === 'cow', flip = e.dir === 'left' ? -1 : 1, t = e.userData.t || 0;
  at(c, px, py, T, 1, () => {
    c.scale(flip, 1);
    oval(c, 0, 0, cow ? 0.7 : 0.35, cow ? 0.2 : 0.1, 'rgba(0,0,0,.22)', 0);
    c.translate(0, -Math.abs(Math.sin(t * 3)) * 0.03);
    if (cow) {
      for (const x of [-0.45, -0.2, 0.25, 0.5]) rr(c, x - 0.07, -0.45, 0.14, 0.45, 0.05, '#e8e0d0');
      oval(c, 0, -0.75, 0.68, 0.4, '#fff'); oval(c, -0.2, -0.85, 0.18, 0.14, '#3a2a1c', 0); oval(c, 0.15, -0.6, 0.14, 0.1, '#3a2a1c', 0);
      oval(c, 0.7, -0.95, 0.28, 0.25, '#fff'); oval(c, 0.9, -0.88, 0.14, 0.1, '#f5b6b6'); oval(c, 0.72, -1.1, 0.05, 0.1, '#8a5a2b'); oval(c, 0.78, -1.0, 0.035, 0.04, '#1d1a2b', 0);
    } else {
      for (const x of [-0.08, 0.1]) rr(c, x - 0.025, -0.2, 0.05, 0.2, 0.02, '#ff9a2b', 0.04);
      oval(c, 0, -0.38, 0.27, 0.2, '#fff3d6'); oval(c, 0.2, -0.62, 0.13, 0.13, '#fff3d6');
      poly(c, [[0.32, -0.62], [0.44, -0.58], [0.32, -0.54]], '#ff9a2b', 0.04); oval(c, 0.2, -0.76, 0.05, 0.05, '#e8452c', 0.04); oval(c, 0.25, -0.65, 0.02, 0.02, '#1d1a2b', 0);
    }
  });
}

// ---- tanaman, puing, pohon, bangunan --------------------------------------------------
const CROP_COLOR = { turnip: '#f4f0ff', potato: '#c99a5b', cabbage: '#8fd16a', tomato: '#e8452c', corn: '#f2c94c', onion: '#e0b3ff', carrot: '#ff8a2b', eggplant: '#6d3fa8', spinach: '#3fa84a' };
function drawCrop(c, px, py, T, id, age, days) {
  const p = Math.min(1, age / days), ripe = age >= days;
  at(c, px, py, T, 1, () => {
    c.strokeStyle = OUT; c.lineWidth = 0.05;
    const n = ripe ? 4 : 2 + Math.floor(p * 2), h = 0.18 + p * 0.4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI - Math.PI / 2 + (n === 2 ? 0 : 0);
      oval(c, Math.cos(a) * 0.2 * (0.4 + p), -h * 0.5 + Math.sin(a) * 0.05, 0.11 + p * 0.08, 0.07 + p * 0.07, '#62c84a');
    }
    rr(c, -0.03, -h, 0.06, h, 0.03, '#4faa3a', 0.03);
    if (ripe) oval(c, 0, -h - 0.04, 0.15, 0.15, CROP_COLOR[id] || '#fff');
  });
}

function drawDebris(c, px, py, T, kind) {
  at(c, px, py, T, 1, () => {
    oval(c, 0, 0, 0.32, 0.1, 'rgba(0,0,0,.2)', 0);
    if (kind === 'weed') { for (let i = -2; i <= 2; i++) poly(c, [[i * 0.1 - 0.05, 0], [i * 0.1 + i * 0.05, -0.5 + Math.abs(i) * 0.06], [i * 0.1 + 0.05, 0]], '#3f9a34', 0.04); }
    else if (kind === 'stump') { rr(c, -0.3, -0.42, 0.6, 0.42, 0.08, '#8a5a33'); oval(c, 0, -0.42, 0.3, 0.14, '#d9b27a'); oval(c, 0, -0.42, 0.15, 0.07, '#b8905a', 0.03); }
    else {
      oval(c, 0, -0.28, 0.38, 0.3, '#a7a7b2'); oval(c, -0.1, -0.38, 0.14, 0.09, '#d6d6e0', 0);
      if (kind === 'copper') for (const [x, y] of [[0.15, -0.3], [-0.2, -0.2], [0.05, -0.1]]) oval(c, x, y, 0.07, 0.06, '#d9822b', 0.03);
    }
  });
}

const LEAF = ['#5fbf4a', '#4fb04a', '#d08a2c', '#dde7ee'];
function drawTree(c, px, py, T, season, v) {
  at(c, px, py, T, 0.95 + (v % 5) * 0.05, () => {
    oval(c, 0, 0, 0.55, 0.16, 'rgba(0,0,0,.2)', 0);
    rr(c, -0.17, -1.2, 0.34, 1.2, 0.08, '#7a4e2b');
    const col = LEAF[season];
    oval(c, -0.55, -1.55, 0.7, 0.62, col); oval(c, 0.55, -1.55, 0.7, 0.62, col); oval(c, 0, -2.0, 0.9, 0.8, col);
    oval(c, -0.2, -2.2, 0.35, 0.25, 'rgba(255,255,255,.22)', 0);
  });
}

function drawStructure(c, px, py, T, s, night) {
  at(c, px, py, T, 1, () => {
    const w = s.w, wh = 2.1, hw = w / 2;
    oval(c, 0, -0.1, hw + 0.4, 0.35, 'rgba(0,0,0,.2)', 0);
    rr(c, -hw, -wh, w, wh, 0.12, s.wall);
    // atap
    poly(c, [[-hw - 0.4, -wh], [hw + 0.4, -wh], [hw - 0.5, -wh - 1.75], [-hw + 0.5, -wh - 1.75]], s.roof);
    c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = 0.07; c.beginPath(); c.moveTo(-hw + 0.6, -wh - 1.5); c.lineTo(hw - 0.6, -wh - 1.5); c.stroke();
    for (let i = -2; i <= 2; i++) { c.strokeStyle = 'rgba(0,0,0,.12)'; c.lineWidth = 0.04; c.beginPath(); c.moveTo(i * hw * 0.35, -wh); c.lineTo(i * hw * 0.28, -wh - 1.75); c.stroke(); }
    if (s.kind === 'house') rr(c, hw - 1.3, -wh - 2.25, 0.6, 1.1, 0.06, '#b9684f');
    // pintu & jendela
    rr(c, -0.45, -1.4, 0.9, 1.4, 0.1, '#8a5a33'); oval(c, 0.25, -0.7, 0.05, 0.05, '#f2c94c', 0.03);
    for (const x of [-1, 1]) { const wx = x * hw * 0.62; rr(c, wx - 0.4, -1.55, 0.8, 0.8, 0.08, night ? '#ffe08a' : '#bfe6ff'); c.strokeStyle = OUT; c.lineWidth = 0.04; c.beginPath(); c.moveTo(wx, -1.55); c.lineTo(wx, -0.75); c.moveTo(wx - 0.4, -1.15); c.lineTo(wx + 0.4, -1.15); c.stroke(); }
    if (s.kind === 'barn') { rr(c, -0.9, -1.7, 1.8, 1.7, 0.1, '#f3e2c0'); c.strokeStyle = OUT; c.lineWidth = 0.05; c.beginPath(); c.moveTo(-0.9, -1.7); c.lineTo(0.9, 0); c.moveTo(0.9, -1.7); c.lineTo(-0.9, 0); c.stroke(); }
    if (s.name) {
      c.font = '700 0.3px Fredoka, sans-serif'; const tw = Math.min(w - 0.4, c.measureText(s.name).width + 0.5);
      rr(c, -tw / 2, -wh - 0.05 - 0.02, tw, 0.36, 0.1, '#fff8e6', 0.05);
      c.fillStyle = OUT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s.name, 0, -wh + 0.13, tw - 0.2);
    }
  });
}

function drawDogHouse(c, px, py, T) {
  at(c, px, py, T, 1, () => {
    oval(c, 0, 0, 0.95, 0.25, 'rgba(0,0,0,.2)', 0);
    rr(c, -0.7, -0.95, 1.4, 0.95, 0.08, '#c9955a');
    poly(c, [[-0.9, -0.9], [0.9, -0.9], [0.6, -1.5], [-0.6, -1.5]], '#a85a3a');
    c.beginPath(); c.moveTo(-0.3, 0); c.lineTo(-0.3, -0.45); c.quadraticCurveTo(0, -0.85, 0.3, -0.45); c.lineTo(0.3, 0); c.closePath(); c.fillStyle = '#3a2a1c'; c.fill();
  });
}

function drawBin(c, px, py, T) {
  at(c, px, py, T, 1, () => {
    oval(c, 0, 0, 0.9, 0.2, 'rgba(0,0,0,.2)', 0);
    rr(c, -0.8, -0.85, 1.6, 0.85, 0.1, '#b98a52'); rr(c, -0.88, -1.08, 1.76, 0.34, 0.1, '#d2553f');
    c.strokeStyle = 'rgba(0,0,0,.2)'; c.lineWidth = 0.04; for (const x of [-0.3, 0.3]) { c.beginPath(); c.moveTo(x, -0.7); c.lineTo(x, -0.05); c.stroke(); }
  });
}

function drawWell(c, px, py, T) {
  at(c, px, py, T, 1, () => {
    oval(c, 0, 0, 1.1, 0.3, 'rgba(0,0,0,.2)', 0);
    rr(c, -0.9, -0.8, 1.8, 0.8, 0.3, '#a7a7b2'); oval(c, 0, -0.8, 0.9, 0.3, '#5a8fb8');
    rr(c, -0.95, -1.8, 0.12, 1.1, 0.04, '#8a5a33'); rr(c, 0.83, -1.8, 0.12, 1.1, 0.04, '#8a5a33');
    poly(c, [[-1.1, -1.75], [1.1, -1.75], [0, -2.35]], '#d2553f');
  });
}

function drawFenceSeg(c, px, py, T, horizontal) {
  at(c, px, py, T, 1, () => {
    if (horizontal) { rr(c, -0.5, -0.65, 1, 0.1, 0.03, '#c99a62', 0.04); rr(c, -0.5, -0.4, 1, 0.1, 0.03, '#c99a62', 0.04); }
    rr(c, -0.08, -0.85, 0.16, 0.85, 0.04, '#b98a52', 0.05);
    if (!horizontal) { rr(c, -0.04, -0.65, 0.08, 0.7, 0.02, '#c99a62', 0.03); }
  });
}

// ---- partikel kembang api & cuaca ------------------------------------------------------
class Fireworks {
  constructor() { this.parts = []; this.timer = 0; }
  update(dt, active, cx, cz) {
    this.timer -= dt;
    if (active && this.timer <= 0) {
      this.timer = 0.6 + Math.random() * 0.7;
      const bx = cx + (Math.random() - 0.5) * 12, bh = 5 + Math.random() * 3, col = `hsl(${Math.floor(Math.random() * 360)},100%,65%)`;
      for (let i = 0; i < 50; i++) { const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 3; this.parts.push({ x: bx, z: cz, h: bh, vx: Math.cos(a) * s, vh: Math.sin(a) * s, life: 1.5, col }); }
    }
    for (const p of this.parts) { p.x += p.vx * dt; p.h += p.vh * dt; p.vh -= 3 * dt; p.life -= dt; }
    this.parts = this.parts.filter((p) => p.life > 0);
  }
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas; this.c = canvas.getContext('2d');
    this.cam = new Vec(0, 0, 5); this.T = 40; this.fx = new Fireworks();
    this.drops = Array.from({ length: 180 }, () => ({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 0.8 }));
    this.time = 0; this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = innerWidth; this.H = innerHeight;
    this.canvas.width = Math.round(this.W * dpr); this.canvas.height = Math.round(this.H * dpr);
    this.canvas.style.width = `${this.W}px`; this.canvas.style.height = `${this.H}px`;
    this.dpr = dpr; this.T = Math.max(30, Math.min(54, Math.round(Math.min(this.W / 20, this.H / 11.5))));
  }

  // Kamera tetap miring (sudut tidak berubah, tidak bisa diputar). Tanah diproyeksikan dengan perspektif;
  // karakter & benda berdiri tegak menghadap layar dan mengecil menurut jarak, seperti HM:BTN.
  _project() {
    const { W, H, T } = this, L = 15, th = (52 * Math.PI) / 180, sv = Math.sin(th), cv = Math.cos(th);
    const camY = L * sv, camZ = this.cam.z + L * cv, cx = this.cam.x, f = T * L;
    return (x, z, y = 0) => {
      const rx = x - cx, ry = y - camY, rz = z - camZ;
      const zc = -ry * sv - rz * cv, yc = ry * cv - rz * sv, s = f / Math.max(zc, 0.5);
      return [W / 2 + rx * s, H / 2 - yc * s, s];
    };
  }

  draw(dt, S) {
    const { c, W, H, T } = this, g = S.game;
    this.time += dt;
    const f = S.farmer.position, k = Math.min(1, dt * 9);
    this.cam.x += (f.x - this.cam.x) * k; this.cam.z += (f.z - this.cam.z) * k;
    this.cam.x = Math.max(-50, Math.min(50, this.cam.x)); this.cam.z = Math.max(-45, Math.min(55, this.cam.z));
    const P = this._project(), cx = this.cam.x, cz = this.cam.z;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const season = g.date.season;
    const PAL = [['#7bd356', '#72cc50', '#83da5c', '#6cc44b'], ['#5fcf4a', '#58c444', '#68d652', '#52bb3f'], ['#c9a23c', '#bf9a37', '#d3ab45', '#b8922f'], ['#eef4fa', '#e4ecf4', '#f6fafd', '#dbe5ee']][season];
    const A = PAL[0];
    c.fillStyle = A; c.fillRect(0, 0, W, H);

    const poly2 = (pts, fill, stroke, lw = 1) => { c.beginPath(); pts.forEach(([x, z], i) => { const [sx, sy] = P(x, z); if (i) c.lineTo(sx, sy); else c.moveTo(sx, sy); }); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.lineWidth = lw; c.strokeStyle = stroke; c.lineJoin = 'round'; c.stroke(); } };
    const rect = (x, z, w, h, fill, stroke, lw) => poly2([[x, z], [x + w, z], [x + w, z + h], [x, z + h]], fill, stroke, lw);
    const ell = (x, z, rx, rz, fill, stroke, lw) => poly2(Array.from({ length: 40 }, (_, i) => [x + Math.cos((i / 40) * Math.PI * 2) * rx, z + Math.sin((i / 40) * Math.PI * 2) * rz]), fill, stroke, lw);

    // ---- tanah: hanya petak yang terlihat (per baris dihitung lebar pandang menurut kedalaman)
    for (let iz = Math.max(Math.floor(cz) - 36, -56); iz <= Math.min(Math.floor(cz) + 11, 63); iz++) {
      const [, , s] = P(cx, iz + 0.5); const half = Math.ceil((W / 2 + T) / s) + 1;
      for (let ix = Math.max(Math.floor(cx) - half, -56); ix <= Math.min(Math.floor(cx) + half, 56); ix++) {
        const a = P(ix, iz), b = P(ix + 1, iz), d = P(ix + 1, iz + 1), e = P(ix, iz + 1);
        if (a[1] > H + 4 || e[1] < -4 || d[0] < -4 || e[0] > W + 4) continue;
        const h0 = ((ix * 73856093) ^ (iz * 19349663)) >>> 0; c.fillStyle = PAL[(h0 >> 4) % 4]; c.beginPath(); c.moveTo(a[0], a[1] - 0.5); c.lineTo(b[0] + 0.5, b[1] - 0.5); c.lineTo(d[0] + 0.5, d[1] + 0.5); c.lineTo(e[0], e[1] + 0.5); c.closePath(); c.fill();
        if (e[2] > T * 0.4) for (let n = 0; n < 3; n++) {
          const h = (h0 >>> (n * 3)) ^ (n * 2654435761 >>> 0); if (h % 3 !== 0) continue;
          const gx = a[0] + ((h >> 5) % 100) / 100 * (b[0] - a[0]) + (e[0] - a[0]) * 0.5, gy = a[1] + ((h >> 9) % 100) / 100 * (e[1] - a[1]), q = e[2];
          for (let k2 = -1; k2 <= 1; k2++) { c.strokeStyle = 'rgba(25,80,25,.28)'; c.lineWidth = Math.max(1, q * 0.045); c.beginPath(); c.moveTo(gx + k2 * q * 0.05, gy); c.lineTo(gx + k2 * q * 0.12, gy - q * (0.2 + ((h >> (k2 + 3)) % 3) * 0.05)); c.stroke(); c.strokeStyle = 'rgba(200,255,150,.35)'; c.lineWidth = Math.max(1, q * 0.02); c.beginPath(); c.moveTo(gx + k2 * q * 0.05 + 1, gy); c.lineTo(gx + k2 * q * 0.12 + 1, gy - q * 0.2); c.stroke(); }
        }
      }
    }
    const sand = season === 3 ? '#e8e0cc' : '#e3d3a8', sandB = '#cdb88a', lw = Math.max(1, T * 0.05);
    rect(-1.6, 10, 3.2, 16, sand, sandB, lw); rect(-0.8, -3, 1.6, 4.5, sandB, sandB, lw);      // jalan ke kota & jalan setapak rumah → ladang
    ell(0, 33, 8, 8, sand, sandB, lw);
    rect(MINE.x0, MINE.z0, MINE.w, MINE.h, '#7d7487', OUT, lw);
    ell(POND.x, POND.z, POND.rx, POND.rz, '#4db6ff', OUT, lw * 1.3);
    for (let i = 0; i < 3; i++) { const r = (((this.time * 0.4 + i / 3) % 1) + 1) % 1; c.globalAlpha = 1 - r; ell(POND.x - 0.6 + i * 0.6, POND.z + (i - 1) * 0.5, r * 1.1, r * 0.55, null, 'rgba(255,255,255,.7)', lw * 0.8); c.globalAlpha = 1; }
    // petak garapan
    for (const [key, t] of Object.entries(g.tilled)) {
      const [tx, tz] = key.split(',').map(Number); if (Math.abs(tx - cx) > 30 || tz < cz - 36 || tz > cz + 12) continue;
      const ins = 0.04; rect(tx + ins, tz + ins, 1 - ins * 2, 1 - ins * 2, t.watered ? '#5b3a22' : '#9a6a3c', 'rgba(58,42,28,.6)', Math.max(1, T * 0.04));
      c.strokeStyle = 'rgba(0,0,0,.16)'; c.lineWidth = Math.max(1, T * 0.03);
      for (const o of [0.3, 0.55, 0.8]) { const p1 = P(tx + 0.12, tz + o), p2 = P(tx + 0.88, tz + o); c.beginPath(); c.moveTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]); c.stroke(); }
    }
    if (S.marker) {
      const m = S.marker, pulse = 0.55 + Math.sin(this.time * 7) * 0.2;
      rect(m.x + 0.06, m.z + 0.06, 0.88, 0.88, `rgba(255,240,140,${pulse * 0.35})`, `rgba(255,235,90,${pulse + 0.25})`, T * 0.09);
    }

    // ---- benda berdiri, diurutkan dari utara (jauh) ke selatan (dekat); skala menurut jarak
    const items = [], push = (z, fn) => items.push([z, fn]);
    const night = this._dark(g.minute) > 0.15;
    const inView = (x, z, m = 3) => Math.abs(x - cx) < 34 && z > cz - 36 && z < cz + 12 + m;
    for (const fl of S.world.flowers) if (inView(fl.x, fl.z, 0)) { const [sx, sy, s] = P(fl.x, fl.z); c.fillStyle = fl.c; c.strokeStyle = OUT; c.lineWidth = Math.max(1, s * 0.03); c.beginPath(); c.arc(sx, sy - s * 0.08, s * 0.09, 0, Math.PI * 2); c.fill(); c.stroke(); }
    for (const t of S.world.trees) if (inView(t.x, t.z)) push(t.z, () => { const [sx, sy, s] = P(t.x, t.z); drawTree(c, sx, sy, s, season, t.v); });
    for (const st of STRUCTURES) if (inView(st.x, st.z + st.d / 2, 6)) push(st.z + st.d / 2, () => { const [sx, sy, s] = P(st.x, st.z + st.d / 2); drawStructure(c, sx, sy, s, st, night); });
    push(SPOTS.bin.z, () => { const [sx, sy, s] = P(SPOTS.bin.x, SPOTS.bin.z); drawBin(c, sx, sy, s); });
    push(SPOTS.doghouse.z, () => { const [sx, sy, s] = P(SPOTS.doghouse.x, SPOTS.doghouse.z); drawDogHouse(c, sx, sy, s); });
    push(SPOTS.well.z, () => { const [sx, sy, s] = P(SPOTS.well.x, SPOTS.well.z); drawWell(c, sx, sy, s); });
    const fx0 = FENCE.x0, fx1 = FENCE.x1, fz0 = FENCE.z0, fz1 = FENCE.z1, gate = (x) => Math.abs(x) < FENCE.gate;
    const fence = (x, z, horiz) => push(z, () => { const [sx, sy, s] = P(x, z); drawFenceSeg(c, sx, sy, s, horiz); });
    for (let x = fx0; x <= fx1 + 0.01; x += 1) { if (!gate(x)) fence(x, fz0, true); if (!gate(x)) fence(x, fz1, true); }
    for (let z = fz0 + 1; z < fz1; z += 1) for (const x of [fx0, fx1]) fence(x, z, false);
    for (const [key, d] of Object.entries(g.debris)) { const [tx, tz] = key.split(',').map(Number); if (inView(tx, tz, 1)) push(tz + 0.9, () => { const [sx, sy, s] = P(tx + 0.5, tz + 0.9); drawDebris(c, sx, sy, s, d); }); }
    for (const [key, t] of Object.entries(g.tilled)) if (t.crop) { const [tx, tz] = key.split(',').map(Number); if (inView(tx, tz, 1)) push(tz + 0.85, () => { const [sx, sy, s] = P(tx + 0.5, tz + 0.85); drawCrop(c, sx, sy, s, t.crop.id, t.crop.age, CROPS[t.crop.id].days); }); }
    const person = (e) => push(e.position.z, () => { const [sx, sy, s] = P(e.position.x, e.position.z); drawPerson(c, sx, sy, s, e); });
    for (const e of S.actors) if (e.visible) person(e);
    if (S.kid?.visible) person(S.kid);
    for (const a of S.animals) push(a.position.z, () => { const [sx, sy, s] = P(a.position.x, a.position.z); drawAnimal(c, sx, sy, s, a); });
    if (S.dog?.visible) push(S.dog.position.z, () => { const [sx, sy, s] = P(S.dog.position.x, S.dog.position.z); drawDog(c, sx, sy, s, S.dog); });
    if (S.farmer.visible !== false) person(S.farmer);
    items.sort((a, b) => a[0] - b[0]).forEach(([, fn]) => fn());

    if (festivalOn(g.date)) this._bunting(c, P);
    if (S.fishing) {
      const [dx, dz] = DIRV[S.farmer.dir], bx = f.x + dx * 2.4, bz = f.z + dz * 2.4, bob = S.fishing.bite ? Math.sin(this.time * 30) * 0.1 : Math.sin(this.time * 3) * 0.03;
      const [fsx, fsy, fs] = P(f.x, f.z), [bsx, bsy, bs] = P(bx, bz);
      c.strokeStyle = '#fff'; c.lineWidth = Math.max(1, T * 0.03); c.beginPath(); c.moveTo(fsx + dx * fs * 0.5, fsy - fs * 1.0); c.quadraticCurveTo((fsx + bsx) / 2, Math.min(fsy, bsy) - fs * 1.2, bsx, bsy + bob * bs); c.stroke();
      c.beginPath(); c.arc(bsx, bsy + bob * bs, bs * 0.13, 0, Math.PI * 2); c.fillStyle = '#e2412b'; c.fill(); c.lineWidth = Math.max(1, bs * 0.04); c.strokeStyle = OUT; c.stroke();
      if (S.fishing.bite) { c.font = `700 ${fs * 0.9}px sans-serif`; c.textAlign = 'center'; c.fillText('❗', fsx, fsy - fs * 2.1); }
    }
    c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.lineJoin = 'round';
    for (const e of S.actors) if (e.visible && e.name && e.position.distanceTo(f) < 5) {
      const [lx, ly, s] = P(e.position.x, e.position.z); const y = ly - s * 1.85 * e.scale;
      c.font = `600 ${s * 0.3}px Fredoka, sans-serif`; c.lineWidth = s * 0.1; c.strokeStyle = '#fff8e6'; c.strokeText(e.name, lx, y); c.fillStyle = OUT; c.fillText(e.name, lx, y);
    }

    this.fx.update(dt, S.fireworks, 0, 33);
    for (const p of this.fx.parts) { const [sx, sy, s] = P(p.x, p.z, p.h + 3); c.globalAlpha = Math.max(0, p.life / 1.5); c.fillStyle = p.col; c.beginPath(); c.arc(sx, sy, s * 0.1, 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 1;

    this._weather(c, dt, g.weather);
    const d = this._dark(g.minute);
    if (d > 0) { c.fillStyle = `rgba(14,18,60,${d})`; c.fillRect(0, 0, W, H); }
    const dusk = Math.max(0, Math.min(1, (g.minute - 16.5 * 60) / 120)) * (g.minute < 20 * 60 ? 1 : 0), dawn = g.minute < 7.5 * 60 ? Math.max(0, (7.5 * 60 - g.minute) / 90) : 0;
    if (dusk > 0 || dawn > 0) { c.fillStyle = `rgba(255,150,70,${Math.max(dusk, dawn * 0.5) * 0.16})`; c.fillRect(0, 0, W, H); }
  }

  _dark(m) {
    if (m >= 19.5 * 60 || m < 5 * 60) return 0.5;
    if (m >= 17 * 60) return ((m - 17 * 60) / 150) * 0.5;
    if (m < 7 * 60) return (1 - (m - 5 * 60) / 120) * 0.5;
    return 0;
  }

  _bunting(c, P) {
    const posts = [[-8, 25], [8, 25], [8, 41], [-8, 41]], cols = ['#e8452c', '#f2c94c', '#4aa3df', '#5fcf4a', '#d96aa8'];
    for (const [x, z] of posts) { const [sx, sy, s] = P(x, z); c.fillStyle = '#8a5a33'; c.strokeStyle = OUT; c.lineWidth = Math.max(1, s * 0.04); c.fillRect(sx - s * 0.07, sy - s * 2.6, s * 0.14, s * 2.6); c.strokeRect(sx - s * 0.07, sy - s * 2.6, s * 0.14, s * 2.6); }
    for (let e = 0; e < 4; e++) {
      const [x1, z1] = posts[e], [x2, z2] = posts[(e + 1) % 4], [ax, ay, as] = P(x1, z1), [bx, by, bs] = P(x2, z2);
      c.strokeStyle = OUT; c.lineWidth = Math.max(1, as * 0.03); c.beginPath(); c.moveTo(ax, ay - as * 2.5); c.lineTo(bx, by - bs * 2.5); c.stroke();
      for (let i = 1; i < 9; i++) { const t = i / 9, fx = ax + (bx - ax) * t, fy = ay - as * 2.5 + (by - bs * 2.5 - ay + as * 2.5) * t, q = as + (bs - as) * t; c.fillStyle = cols[(i + e) % 5]; c.beginPath(); c.moveTo(fx - q * 0.13, fy); c.lineTo(fx + q * 0.13, fy); c.lineTo(fx, fy + q * 0.32); c.closePath(); c.fill(); c.stroke(); }
    }
  }

  _weather(c, dt, w) {
    const { W, H, T } = this;
    if (w === 'sunny') return;
    c.fillStyle = w === 'storm' ? 'rgba(30,40,60,.32)' : w === 'rain' ? 'rgba(60,75,95,.18)' : 'rgba(255,255,255,.1)'; c.fillRect(0, 0, W, H);
    for (const d of this.drops) {
      d.y += dt * (w === 'snow' ? 0.18 : w === 'storm' ? 1.9 : 1.4) * d.s; d.x += dt * (w === 'snow' ? Math.sin(this.time + d.s * 9) * 0.05 : -0.25);
      if (d.y > 1) { d.y -= 1; d.x = Math.random(); } if (d.x < 0) d.x += 1;
      const x = d.x * W, y = d.y * H;
      if (w === 'snow') { c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, T * 0.05 * d.s, 0, Math.PI * 2); c.fill(); }
      else { c.strokeStyle = 'rgba(200,225,255,.7)'; c.lineWidth = Math.max(1, T * 0.03); c.beginPath(); c.moveTo(x, y); c.lineTo(x - T * 0.15, y + T * 0.45); c.stroke(); }
    }
  }
}
