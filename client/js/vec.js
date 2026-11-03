// Vektor sederhana pada bidang tanah: x = timur, z = selatan (turun di layar). Jarak hanya memakai x dan z.
export class Vec {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vec(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.z += v.z * s; return this; }
  length() { return Math.hypot(this.x, this.z); }
  normalize() { const l = this.length() || 1; this.x /= l; this.z /= l; return this; }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.z - v.z); }
}
