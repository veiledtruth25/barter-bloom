import * as THREE from 'three';
import { FIELD_W, FIELD_H, CROPS, plotLayout } from '/shared/defs.js';
import {
  Builder, vcMat, swayMat, addCrop, addRock, addStump, addWeed, addForage, makeChicken, makeCow,
} from './models.js';

const SOIL_DRY = 0x9a6a3e;
const SOIL_WET = 0x5e3d22;

export class FarmRenderer {
  constructor(scene) {
    this.scene = scene;
    this.plots = [];
    this.season = 'spring';
    this.wildMesh = null;
    this.sparkle = null;
  }

  setSeason(season) { this.season = season; }

  updatePlot(plot) {
    const L = plotLayout(plot.id);
    let slot = this.plots[plot.id];
    if (!slot) {
      slot = this.plots[plot.id] = { ground: null, crops: null, animals: new Map(), data: null, ready: [] };
    }
    slot.data = plot;
    for (const k of ['ground', 'crops']) {
      if (slot[k]) {
        this.scene.remove(slot[k]);
        slot[k].geometry.dispose();
      }
    }
    const g = new Builder();
    const c = new Builder();
    slot.ready = [];
    for (let j = 0; j < FIELD_H; j++) {
      for (let i = 0; i < FIELD_W; i++) {
        const t = plot.tiles[j * FIELD_W + i];
        const x = L.ox + i + 0.5, z = L.oz + j + 0.5;
        // Deterministic per-tile variation so rebuilds don't flicker.
        const r = ((i * 73856093) ^ (j * 19349663) ^ plot.id) % 100 / 100;
        if (t.t === 'soil') {
          g.add(new THREE.BoxGeometry(0.94, 0.08, 0.94), t.w ? SOIL_WET : SOIL_DRY, { x, y: 0.04, z });
          g.add(new THREE.BoxGeometry(0.8, 0.02, 0.12), t.w ? 0x4e301a : 0x8a5a32, { x, y: 0.09, z: z - 0.22 });
          g.add(new THREE.BoxGeometry(0.8, 0.02, 0.12), t.w ? 0x4e301a : 0x8a5a32, { x, y: 0.09, z: z + 0.22 });
        } else if (t.t === 'weed') addWeed(c, x, z, this.season);
        else if (t.t === 'rock') addRock(g, x, z, 0.9 + r * 0.3);
        else if (t.t === 'stump') addStump(g, x, z, 0.9 + r * 0.2);
        else if (r < 0.25 && this.season !== 'winter') {
          g.add(new THREE.ConeGeometry(0.05, 0.15, 3), 0x5aa83a, { x: x + r - 0.12, y: 0.07, z });
        }
        if (t.c) {
          addCrop(c, x, z + 0.02, t.c);
          if (!t.c.withered && t.c.g >= CROPS[t.c.id].days) slot.ready.push(x, 0.9, z);
        }
      }
    }
    slot.ground = g.mesh(vcMat);
    slot.crops = c.mesh(swayMat);
    this.scene.add(slot.ground, slot.crops);
    this.syncAnimals(slot, plot, L);
    this.rebuildReady();
  }

  // Twinkles above crops that are ready to harvest.
  rebuildReady() {
    const pos = this.plots.flatMap((s) => (s ? s.ready : []));
    if (!this.readySparkle) {
      this.readySparkle = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({
        color: 0xffe066, size: 0.28, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      this.scene.add(this.readySparkle);
    }
    this.readySparkle.geometry.dispose();
    this.readySparkle.geometry = new THREE.BufferGeometry();
    this.readySparkle.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  }

  syncAnimals(slot, plot, L) {
    const seen = new Set();
    for (const a of plot.animals) {
      seen.add(a.id);
      if (slot.animals.has(a.id)) continue;
      const mesh = a.type === 'cow' ? makeCow() : makeChicken();
      const pen = L.pen;
      mesh.position.set(pen.x0 + 1 + Math.random() * (pen.x1 - pen.x0 - 2), 0, pen.z0 + 1 + Math.random() * (pen.z1 - pen.z0 - 2));
      mesh.userData = { pen, target: null, wait: Math.random() * 3, speed: a.type === 'cow' ? 0.8 : 1.4, type: a.type, bob: Math.random() * 6 };
      this.scene.add(mesh);
      slot.animals.set(a.id, mesh);
    }
    for (const [id, m] of slot.animals) {
      if (!seen.has(id)) {
        this.scene.remove(m);
        slot.animals.delete(id);
      }
    }
  }

  updateWild(list) {
    if (this.wildMesh) {
      this.scene.remove(this.wildMesh);
      this.wildMesh.geometry.dispose();
    }
    const b = new Builder();
    const sparkPos = [];
    for (const o of list) {
      if (o.k === 'stump') addStump(b, o.x, o.z, 1.3);
      else if (o.k === 'rock') addRock(b, o.x, o.z, 1.4);
      else {
        addForage(b, o.x, o.z, o.item);
        sparkPos.push(o.x, 0.9, o.z);
      }
    }
    this.wildMesh = b.mesh(vcMat);
    this.scene.add(this.wildMesh);
    if (!this.sparkle) {
      this.sparkle = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({
        color: 0xfff1a8, size: 0.35, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      this.scene.add(this.sparkle);
    }
    this.sparkle.geometry.dispose();
    this.sparkle.geometry = new THREE.BufferGeometry();
    this.sparkle.geometry.setAttribute('position', new THREE.Float32BufferAttribute(sparkPos, 3));
  }

  update(dt, time) {
    if (this.sparkle) {
      this.sparkle.material.opacity = 0.5 + Math.sin(time * 4) * 0.4;
      this.sparkle.position.y = Math.sin(time * 2) * 0.1;
    }
    if (this.readySparkle) {
      this.readySparkle.material.opacity = 0.45 + Math.sin(time * 3 + 1) * 0.4;
      this.readySparkle.position.y = Math.sin(time * 1.6) * 0.12;
    }
    for (const slot of this.plots) {
      if (!slot) continue;
      for (const m of slot.animals.values()) {
        const u = m.userData;
        u.bob += dt * 8;
        if (!u.target) {
          u.wait -= dt;
          if (u.wait <= 0) {
            u.target = new THREE.Vector3(u.pen.x0 + 1 + Math.random() * (u.pen.x1 - u.pen.x0 - 2), 0, u.pen.z0 + 1 + Math.random() * (u.pen.z1 - u.pen.z0 - 2));
          }
          // Chickens peck while idle.
          if (u.type === 'chicken') m.rotation.x = Math.max(0, Math.sin(u.bob * 0.6)) * 0.4;
          continue;
        }
        const d = u.target.clone().sub(m.position);
        const len = d.length();
        if (len < 0.1) {
          u.target = null;
          u.wait = 1 + Math.random() * 4;
          continue;
        }
        d.normalize();
        m.position.addScaledVector(d, Math.min(len, u.speed * dt));
        const want = Math.atan2(d.x, d.z);
        let diff = want - m.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        m.rotation.y += diff * Math.min(1, dt * 6);
        m.rotation.x = 0;
        m.position.y = Math.abs(Math.sin(u.bob)) * (u.type === 'chicken' ? 0.06 : 0.02);
      }
    }
  }
}

// Pulsing selection square that marks the tile the player will act on.
export function makeTargetMarker() {
  const g = new THREE.Group();
  const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 0.2, 1));
  const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
  line.position.y = 0.1;
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false }));
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.13;
  g.add(line, fill);
  g.userData = { line, fill };
  return g;
}
