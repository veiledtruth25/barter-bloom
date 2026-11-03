import * as THREE from 'three';
import { mesh, G } from './toon.js';
import { makeTree, makeHouse, makeFence, makeBin, makeBarn, makeBuilding, makeLabel, fadeBuilding } from './models.js';
import { FIELD, MINE } from '/core/farm.js';
import { festivalOn } from '/core/calendar.js';

export { FIELD };
export const SPAWN = new THREE.Vector3(0, 0, 5);
export const DOOR = new THREE.Vector3(0, 0, -3.2);
// Gedung kota: pusat (x,z), pintu menghadap +z. Titik pintu = (x, z + d/2 + 0.9).
export const BUILDINGS = {
  store:  { name: 'Toko Serba Ada', x: -11, z: 27, wall: 0xf7e1b5, roof: 0x3fa86b, shop: true },
  smith:  { name: 'Pandai Besi',    x: 11,  z: 27, wall: 0xcfc6bd, roof: 0x6b6b7a, shop: true },
  inn:    { name: 'Kedai Sari',     x: -11, z: 38, wall: 0xffd9c2, roof: 0xe8745a, shop: true },
  clinic: { name: 'Klinik',         x: 11,  z: 38, wall: 0xf4f9ff, roof: 0x4aa3df, shop: true },
  flower: { name: 'Toko Bunga',     x: 0,   z: 41, wall: 0xffe3f0, roof: 0xd96aa8, shop: true },
  home_darto: { name: 'Rumah Darto', x: -23, z: 27, wall: 0xf3e2c0, roof: 0xa8552f },
  home_bejo:  { name: 'Rumah Bejo',  x: 23,  z: 27, wall: 0xe8dccb, roof: 0x7a4a3a },
  home_lina:  { name: 'Rumah Lina',  x: -23, z: 38, wall: 0xffeef5, roof: 0xb48cf0 },
  home_raka:  { name: 'Rumah Raka',  x: 23,  z: 38, wall: 0xeaf2f7, roof: 0x3a5a8a },
  carpenter:  { name: 'Tukang Kayu',  x: 11,  z: 50, wall: 0xe8c99a, roof: 0xd9822b, shop: true },
  home_joko:  { name: 'Rumah Joko',  x: -11, z: 50, wall: 0xf0dcc0, roof: 0x8a5a2b },
  home_sari:  { name: 'Rumah Sari',  x: -23, z: 49, wall: 0xe4f4ee, roof: 0x4aa38a },
  home_nina:  { name: 'Rumah Nina',  x: 23,  z: 49, wall: 0xfff0dc, roof: 0xe0553a },
  home_maya:  { name: 'Rumah Maya',  x: -20, z: 15, wall: 0xf7e8c8, roof: 0x5ab0d8 },
  home_harjo: { name: 'Rumah Kakek', x: 0,   z: 52, wall: 0xe9dfc0, roof: 0x9a7a3a },
};
export const doorOf = (b) => new THREE.Vector3(b.x, 0, b.z + 3.0);
export const PLACES = {
  ...Object.fromEntries(Object.entries(BUILDINGS).map(([k, b]) => [k, doorOf(b)])),
  plaza: new THREE.Vector3(0, 0, 33), farm_road: new THREE.Vector3(0, 0, 17),
  pond: new THREE.Vector3(10.3, 0, 4), farm_yard: new THREE.Vector3(2.6, 0, -1.2), home_farm: new THREE.Vector3(0, 0, -3.2),
};
export const SPOTS = {
  bin: new THREE.Vector3(4.5, 0, -2.2),
  barn: new THREE.Vector3(-11, 0, -2),
  pond: new THREE.Vector3(14, 0, 4),
};

const SKY = {
  sunny: [0x8fd3ff, 0xffb86b, 0x1b2a5c],
  rain: [0x9aa9b8, 0x8a8f9c, 0x222a38],
  storm: [0x6f7a8a, 0x666b78, 0x161b27],
  snow: [0xdbe7f2, 0xe8c9b0, 0x2a3350],
};
const GROUND = [0x7ed957, 0x5fcf4a, 0xc9a23c, 0xeef4fa];

export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = []; // {x,z,r}
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
    this.sun.shadow.bias = -0.0004;
    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x9a8a6a, 1.6);
    scene.add(this.sun, this.sun.target, this.hemi);

    this.ground = mesh(new THREE.CircleGeometry(75, 64), GROUND[0], { outline: false, shadow: false });
    this.ground.rotation.x = -Math.PI / 2;
    scene.add(this.ground);

    this.house = makeHouse(); this.house.position.set(0, 0, -6); scene.add(this.house);
    this.colliders.push({ x: 0, z: -6, r: 2.7 });

    const fenceN = makeFence(14); fenceN.position.set(-7, 0, 1.3); scene.add(fenceN);
    const fenceS = makeFence(14); fenceS.position.set(-7, 0, 10.7); scene.add(fenceS);

    const add = (m, v, r) => { m.position.copy(v); this.scene.add(m); this.colliders.push({ x: v.x, z: v.z, r }); };
    add(makeBin(), SPOTS.bin, 1);
    add(makeBarn(), SPOTS.barn, 2.6);
    const floor = mesh(G.box(MINE.w, 0.08, MINE.h, 0.03), 0x7d7487, { outline: false, shadow: false });
    floor.position.set(MINE.x0 + MINE.w / 2, 0.04, MINE.z0 + MINE.h / 2); scene.add(floor);
    this.pond = mesh(G.cyl(3, 3, 0.1), 0x4db6ff, { thin: true }); this.pond.position.set(14, 0.02, 4); this.pond.scale.set(1, 1, 0.8);
    scene.add(this.pond);
    this.colliders.push({ x: 14, z: 4, r: 3.1 });

    this.trees = new THREE.Group(); scene.add(this.trees);
    this.treeSpots = [];
    let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 46; i++) {
      const a = r() * Math.PI * 2, d = 15 + r() * 30;
      const x = Math.cos(a) * d + 2, z = Math.sin(a) * d + 4;
      if (Math.hypot(x - 14, z - 4) < 6 || (z > 10 && z < 60 && Math.abs(x) < 34)) continue;
      this.treeSpots.push([x, z]);
      this.colliders.push({ x, z, r: 0.6 });
    }
    this.decor = new THREE.Group(); scene.add(this.decor);
    for (let i = 0; i < 90; i++) {
      const a = r() * Math.PI * 2, d = 4 + r() * 38;
      const x = Math.cos(a) * d, z = Math.sin(a) * d + 4;
      if ((z > 0 && z < 12 && x > -8 && x < 8) || (z > 10 && z < 60 && Math.abs(x) < 34)) continue;
      const f = mesh(G.sphere(0.12, 8, 6), [0xff7aa8, 0xffe14d, 0xffffff, 0xb28dff][i % 4], { outline: false, shadow: false });
      f.position.set(x, 0.12, z); this.decor.add(f);
    }
    this.labels = []; this.buildings = [];
    for (const b of Object.values(BUILDINGS)) {
      const m = makeBuilding(b.wall, b.roof); m.position.set(b.x, 0, b.z); scene.add(m); this.buildings.push({ m, b });
      this.colliders.push({ x: b.x, z: b.z, r: 2.9 });
      const l = makeLabel(b.name); l.position.set(b.x, 5.6, b.z + 1); scene.add(l); this.labels.push(l);
    }
    const road = mesh(G.box(3.2, 0.06, 16, 0.02), 0xd9c79a, { outline: false, shadow: false }); road.position.set(0, 0.03, 18); scene.add(road);
    const plaza = mesh(G.cyl(8, 8, 0.06), 0xe3d3a8, { outline: false, shadow: false }); plaza.position.set(0, 0.03, 33); scene.add(plaza);
    const well = mesh(G.cyl(0.9, 0.9, 0.7), 0xa7a7b2); well.position.set(0, 0.35, 33); scene.add(well);
    this.colliders.push({ x: 0, z: 33, r: 1 });
    this.bunting = this._makeBunting(); scene.add(this.bunting);
    this.rain = this._makeRain(); scene.add(this.rain);
    this.setSeason(0);
  }

  setSeason(season) {
    this.season = season;
    this.ground.material = this.ground.material.clone();
    this.ground.material.color.setHex(GROUND[season]);
    this.trees.clear();
    this.treeSpots.forEach(([x, z], i) => {
      const t = makeTree(season, () => ((i * 9301 + 49297) % 233280) / 233280);
      t.position.set(x, 0, z); t.scale.setScalar(0.9 + (i % 5) * 0.08); this.trees.add(t);
    });
  }

  // Umbul-umbul & lampion di alun-alun, tampil hanya pada hari festival.
  _makeBunting() {
    const g = new THREE.Group(); g.visible = false;
    const posts = [[-8, 25], [8, 25], [8, 41], [-8, 41]];
    for (const [x, z] of posts) { const p = mesh(G.cyl(0.12, 0.14, 5), 0x8a5a33); p.position.set(x, 2.5, z); g.add(p); }
    const cols = [0xe8452c, 0xf2c94c, 0x4aa3df, 0x5fcf4a, 0xd96aa8];
    for (let e = 0; e < 4; e++) {
      const [x1, z1] = posts[e], [x2, z2] = posts[(e + 1) % 4];
      for (let i = 1; i < 9; i++) {
        const t = i / 9, flag = mesh(G.cone(0.28, 0.6), cols[(i + e) % cols.length], { thin: true });
        flag.rotation.x = Math.PI; flag.position.set(x1 + (x2 - x1) * t, 4.7 - Math.sin(t * Math.PI) * 0.5, z1 + (z2 - z1) * t); g.add(flag);
      }
    }
    return g;
  }

  _makeRain() {
    const n = 900, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 50; pos[i * 3 + 1] = Math.random() * 25; pos[i * 3 + 2] = (Math.random() - 0.5) * 50; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfe3ff, size: 0.12, transparent: true, opacity: 0.8 }));
    p.visible = false; p.frustumCulled = false; return p;
  }

  // Bangunan yang berada di antara kamera dan pemain dibuat transparan (cutaway).
  cutaway(focus, yaw) {
    const cx = Math.sin(yaw), cz = Math.cos(yaw);
    for (const { m, b } of this.buildings) {
      const dx = b.x - focus.x, dz = b.z - focus.z;
      const along = dx * cx + dz * cz, side = Math.abs(dx * cz - dz * cx);
      fadeBuilding(m, along > -1 && along < 16 && side < 5.5);
    }
  }

  update(dt, g, focus) {
    if (this.season !== g.date.season) this.setSeason(g.date.season);
    this.bunting.visible = !!festivalOn(g.date);
    const t = (g.minute - 360) / (20 * 60);          // 0 pagi .. 1 lewat tengah malam
    const sunAng = Math.min(1, Math.max(0, (g.minute - 360) / (12 * 60))) * Math.PI;
    const night = g.minute > 18 * 60 + 30 || g.minute < 5 * 60;
    const dusk = Math.max(0, Math.min(1, (g.minute - 16.5 * 60) / 120));
    const [day, evening, nightC] = SKY[g.weather];
    const sky = new THREE.Color(day).lerp(new THREE.Color(evening), Math.min(1, dusk * 1.6)).lerp(new THREE.Color(nightC), night ? 1 : Math.max(0, dusk * 1.6 - 0.6));
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog(sky, g.weather === 'storm' ? 25 : 45, g.weather === 'sunny' ? 95 : 70);
    this.sun.position.set(focus.x - Math.cos(sunAng) * 35, Math.max(26, Math.sin(sunAng) * 50), focus.z + 18);
    this.sun.target.position.copy(focus);
    this.sun.intensity = night ? 0.5 : (g.weather === 'sunny' ? 2.2 : 1.3) * (1 - dusk * 0.45);
    this.sun.color.set(dusk > 0.2 ? 0xffc48a : 0xffffff);
    this.hemi.intensity = night ? 0.6 : 1.6;
    void t;

    const precip = g.weather !== 'sunny';
    this.rain.visible = precip;
    if (precip) {
      const a = this.rain.geometry.attributes.position, fall = g.weather === 'snow' ? 3 : g.weather === 'storm' ? 34 : 24;
      this.rain.material.color.set(g.weather === 'snow' ? 0xffffff : 0xcfe3ff);
      this.rain.material.size = g.weather === 'snow' ? 0.22 : 0.12;
      this.rain.position.set(focus.x, 0, focus.z);
      for (let i = 0; i < a.count; i++) {
        let y = a.getY(i) - fall * dt; if (y < 0) y += 25;
        a.setY(i, y);
        if (g.weather === 'snow') a.setX(i, a.getX(i) + Math.sin(y + i) * dt);
      }
      a.needsUpdate = true;
    }
  }

  collide(p, radius = 0.4) {
    for (const c of this.colliders) {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), min = c.r + radius;
      if (d < min && d > 1e-4) { p.x = c.x + (dx / d) * min; p.z = c.z + (dz / d) * min; }
    }
    p.x = Math.max(-55, Math.min(55, p.x)); p.z = Math.max(-55, Math.min(62, p.z));
  }
}
