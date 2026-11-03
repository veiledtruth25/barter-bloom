import * as THREE from 'three';

// Kembang api sederhana: ledakan titik berwarna yang jatuh oleh gravitasi.
export class Fireworks {
  constructor(scene) { this.scene = scene; this.bursts = []; this.timer = 0; }

  burst(x, z) {
    const n = 70, pos = new Float32Array(n * 3), vel = [];
    const color = new THREE.Color().setHSL(Math.random(), 1, 0.65);
    for (let i = 0; i < n; i++) {
      pos.set([x, 14 + Math.random() * 4, z], i * 3);
      const a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1), s = 4 + Math.random() * 3;
      vel.push(new THREE.Vector3(Math.sin(b) * Math.cos(a) * s, Math.cos(b) * s, Math.sin(b) * Math.sin(a) * s));
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ color, size: 0.35, transparent: true, depthWrite: false }));
    p.frustumCulled = false; this.scene.add(p); this.bursts.push({ p, vel, life: 1.8 });
  }

  update(dt, active, cx, cz) {
    this.timer -= dt;
    if (active && this.timer <= 0) { this.timer = 0.7 + Math.random() * 0.8; this.burst(cx + (Math.random() - 0.5) * 16, cz + (Math.random() - 0.5) * 10); }
    for (const b of this.bursts) {
      b.life -= dt; const a = b.p.geometry.attributes.position;
      for (let i = 0; i < b.vel.length; i++) { b.vel[i].y -= 4 * dt; a.setXYZ(i, a.getX(i) + b.vel[i].x * dt, a.getY(i) + b.vel[i].y * dt, a.getZ(i) + b.vel[i].z * dt); }
      a.needsUpdate = true; b.p.material.opacity = Math.max(0, b.life / 1.8);
    }
    this.bursts = this.bursts.filter((b) => { if (b.life > 0) return true; this.scene.remove(b.p); b.p.geometry.dispose(); return false; });
  }
}
