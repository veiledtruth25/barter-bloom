import { Vec } from './vec.js';
import { FIELD, MINE } from '../core/farm.js';

export { FIELD, MINE };
export const SPAWN = new Vec(0, 0, 5);
export const DOOR = new Vec(0, 0, -3.2);
export const SPOTS = {
  bin: new Vec(4.5, 0, -2.2),
  barn: new Vec(-11, 0, -2),
  pond: new Vec(14, 0, 4),
  well: new Vec(0, 0, 33),
  doghouse: new Vec(6.2, 0, -3.6),
};
export const POND = { x: 14, z: 4, rx: 3.4, rz: 2.5 };

// Gedung kota: pusat (x,z), ukuran w×d petak; pintu menghadap bawah. Titik pintu = (x, z + d/2 + 1).
export const BUILDINGS = {
  store:  { name: 'Toko Serba Ada', x: -11, z: 27, wall: '#f7e1b5', roof: '#3fa86b', shop: true },
  smith:  { name: 'Pandai Besi',    x: 11,  z: 27, wall: '#cfc6bd', roof: '#6b6b7a', shop: true },
  inn:    { name: 'Kedai Sari',     x: -11, z: 38, wall: '#ffd9c2', roof: '#e8745a', shop: true },
  clinic: { name: 'Klinik',         x: 11,  z: 38, wall: '#f4f9ff', roof: '#4aa3df', shop: true },
  flower: { name: 'Toko Bunga',     x: 0,   z: 41, wall: '#ffe3f0', roof: '#d96aa8', shop: true },
  carpenter:  { name: 'Tukang Kayu',  x: 11,  z: 50, wall: '#e8c99a', roof: '#d9822b', shop: true },
  home_joko:  { name: 'Rumah Joko',  x: -11, z: 50, wall: '#f0dcc0', roof: '#8a5a2b' },
  home_sari:  { name: 'Rumah Sari',  x: -23, z: 49, wall: '#e4f4ee', roof: '#4aa38a' },
  home_nina:  { name: 'Rumah Nina',  x: 23,  z: 49, wall: '#fff0dc', roof: '#e0553a' },
  home_maya:  { name: 'Rumah Maya',  x: -20, z: 15, wall: '#f7e8c8', roof: '#5ab0d8' },
  home_darto: { name: 'Rumah Darto', x: -23, z: 27, wall: '#f3e2c0', roof: '#a8552f' },
  home_bejo:  { name: 'Rumah Bejo',  x: 23,  z: 27, wall: '#e8dccb', roof: '#7a4a3a' },
  home_lina:  { name: 'Rumah Lina',  x: -23, z: 38, wall: '#ffeef5', roof: '#b48cf0' },
  home_raka:  { name: 'Rumah Raka',  x: 23,  z: 38, wall: '#eaf2f7', roof: '#3a5a8a' },
  home_harjo: { name: 'Rumah Kakek', x: 0,   z: 52, wall: '#e9dfc0', roof: '#9a7a3a' },
};
const BW = 5, BD = 4;
export const doorOf = (b) => new Vec(b.x, 0, b.z + BD / 2 + 1);
export const PLACES = {
  ...Object.fromEntries(Object.entries(BUILDINGS).map(([k, b]) => [k, doorOf(b)])),
  plaza: new Vec(0, 0, 33), farm_road: new Vec(0, 0, 17),
  pond: new Vec(10.3, 0, 4), farm_yard: new Vec(2.6, 0, -1.2), home_farm: DOOR.clone(),
};

// Semua bangunan yang digambar (rumah ladang, kandang, gedung kota) beserta kotak tabrakannya.
export const STRUCTURES = [
  { x: 0, z: -6, w: BW, d: BD, wall: '#f3e2c0', roof: '#d2553f', name: null, kind: 'house' },
  { x: SPOTS.barn.x, z: SPOTS.barn.z, w: BW, d: BD, wall: '#d2553f', roof: '#8a5a33', name: null, kind: 'barn' },
  ...Object.values(BUILDINGS).map((b) => ({ x: b.x, z: b.z, w: BW, d: BD, wall: b.wall, roof: b.roof, name: b.name, kind: 'town' })),
];

const FENCE = { x0: -6.7, x1: 6.7, z0: 1.3, z1: 10.7, gate: 1.5 };

export class World {
  constructor() {
    this.rects = STRUCTURES.map((s) => ({ x: s.x, z: s.z, w: s.w, d: s.d }));
    const bar = (x, z, w, d) => this.rects.push({ x, z, w, d });
    // pagar ladang dengan gerbang di sisi utara (ke rumah) dan selatan (ke kota)
    const left = (-FENCE.gate + FENCE.x0) / 2, right = (FENCE.gate + FENCE.x1) / 2, span = FENCE.x1 - FENCE.x0;
    bar(left, FENCE.z0, span / 2 - FENCE.gate, 0.3); bar(right, FENCE.z0, span / 2 - FENCE.gate, 0.3);
    bar(left, FENCE.z1, span / 2 - FENCE.gate, 0.3); bar(right, FENCE.z1, span / 2 - FENCE.gate, 0.3);
    bar(FENCE.x0, (FENCE.z0 + FENCE.z1) / 2, 0.3, FENCE.z1 - FENCE.z0); bar(FENCE.x1, (FENCE.z0 + FENCE.z1) / 2, 0.3, FENCE.z1 - FENCE.z0);
    this.circles = [
      { x: SPOTS.bin.x, z: SPOTS.bin.z, r: 0.8 }, { x: SPOTS.doghouse.x, z: SPOTS.doghouse.z, r: 0.7 }, { x: SPOTS.well.x, z: SPOTS.well.z, r: 1 }, { x: POND.x, z: POND.z, r: 2.6 },
    ];
    this.trees = [];
    let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 46; i++) {
      const a = r() * Math.PI * 2, d = 15 + r() * 30;
      const x = Math.cos(a) * d + 2, z = Math.sin(a) * d + 4;
      if (Math.hypot(x - POND.x, z - POND.z) < 7 || (z > 10 && z < 60 && Math.abs(x) < 34)) continue;
      this.trees.push({ x, z, v: i });
      this.circles.push({ x, z, r: 0.45 });
    }
    this.flowers = [];
    for (let i = 0; i < 140; i++) {
      const a = r() * Math.PI * 2, d = 4 + r() * 38;
      const x = Math.cos(a) * d, z = Math.sin(a) * d + 4;
      if ((z > 0 && z < 12 && x > -8 && x < 8) || (z > 10 && z < 60 && Math.abs(x) < 34)) continue;
      this.flowers.push({ x, z, c: ['#ff7aa8', '#ffe14d', '#ffffff', '#b28dff'][i % 4] });
    }
  }

  // Dorong lingkaran (pemain/warga) keluar dari semua penghalang; `game` menambah rintangan di petak (batu, tunggul, gulma).
  collide(p, radius = 0.35, game = null) {
    const push = (cx, cz, r) => {
      const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz), min = r + radius;
      if (d < min && d > 1e-4) { p.x = cx + (dx / d) * min; p.z = cz + (dz / d) * min; }
    };
    for (const c of this.circles) push(c.x, c.z, c.r);
    for (const b of this.rects) {
      const hx = b.w / 2, hz = b.d / 2;
      const nx = Math.max(b.x - hx, Math.min(p.x, b.x + hx)), nz = Math.max(b.z - hz, Math.min(p.z, b.z + hz));
      const dx = p.x - nx, dz = p.z - nz, d = Math.hypot(dx, dz);
      if (d < radius) {
        if (d > 1e-4) { p.x = nx + (dx / d) * radius; p.z = nz + (dz / d) * radius; }
        else { // pusat di dalam kotak: keluar lewat sisi terdekat
          const l = p.x - (b.x - hx), rr = b.x + hx - p.x, t = p.z - (b.z - hz), bt = b.z + hz - p.z, m = Math.min(l, rr, t, bt);
          if (m === l) p.x = b.x - hx - radius; else if (m === rr) p.x = b.x + hx + radius; else if (m === t) p.z = b.z - hz - radius; else p.z = b.z + hz + radius;
        }
      }
    }
    if (game) {
      const ix = Math.floor(p.x), iz = Math.floor(p.z);
      for (let x = ix - 1; x <= ix + 1; x++) for (let z = iz - 1; z <= iz + 1; z++) if (game.debris[`${x},${z}`]) push(x + 0.5, z + 0.5, 0.42);
    }
    p.x = Math.max(-55, Math.min(55, p.x)); p.z = Math.max(-55, Math.min(62, p.z));
  }
}

export { FENCE };
