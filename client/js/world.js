import * as THREE from 'three';
import { mesh, G } from './toon.js';
import { makeTree, makeHouse, makeFence, makeBin, makeStall, makeBarn } from './models.js';
import { FIELD, MINE } from '/core/farm.js';

export { FIELD };
export const SPAWN = new THREE.Vector3(0, 0, 5);
export const DOOR = new THREE.Vector3(0, 0, -3.2);
export const SPOTS = {
  bin: new THREE.Vector3(4.5, 0, -2.2),
  stall: new THREE.Vector3(9, 0, 0),
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

    this.ground = mesh(new THREE.CircleGeometry(60, 64), GROUND[0], { outline: false, shadow: false });
    this.ground.rotation.x = -Math.PI / 2;
    scene.add(this.ground);

    this.house = makeHouse(); this.house.position.set(0, 0, -6); scene.add(this.house);
    this.colliders.push({ x: 0, z: -6, r: 3.2 });

    const fenceN = makeFence(14); fenceN.position.set(-7, 0, 1.3); scene.add(fenceN);
    const fenceS = makeFence(14); fenceS.position.set(-7, 0, 10.7); scene.add(fenceS);

    const add = (m, v, r) => { m.position.copy(v); this.scene.add(m); this.colliders.push({ x: v.x, z: v.z, r }); };
    add(makeBin(), SPOTS.bin, 1);
    add(makeStall(), SPOTS.stall, 1.4);
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
      if (Math.hypot(x - 14, z - 4) < 6) continue;
      this.treeSpots.push([x, z]);
      this.colliders.push({ x, z, r: 0.6 });
    }
    this.decor = new THREE.Group(); scene.add(this.decor);
    for (let i = 0; i < 90; i++) {
      const a = r() * Math.PI * 2, d = 4 + r() * 38;
      const x = Math.cos(a) * d, z = Math.sin(a) * d + 4;
      if (z > 0 && z < 12 && x > -8 && x < 8) continue;
      const f = mesh(G.sphere(0.12, 8, 6), [0xff7aa8, 0xffe14d, 0xffffff, 0xb28dff][i % 4], { outline: false, shadow: false });
      f.position.set(x, 0.12, z); this.decor.add(f);
    }
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

  _makeRain() {
    const n = 900, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 50; pos[i * 3 + 1] = Math.random() * 25; pos[i * 3 + 2] = (Math.random() - 0.5) * 50; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfe3ff, size: 0.12, transparent: true, opacity: 0.8 }));
    p.visible = false; p.frustumCulled = false; return p;
  }

  update(dt, g, focus) {
    if (this.season !== g.date.season) this.setSeason(g.date.season);
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
    p.x = Math.max(-55, Math.min(55, p.x)); p.z = Math.max(-55, Math.min(55, p.z));
  }
}
