import * as THREE from 'three';

const MAX = 1500;

// GPU-light particle bursts: one Points object with per-particle colour/size/alpha.
export class Particles {
  constructor(scene) {
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * 300.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; gl_FragColor = vec4(vC, vA * smoothstep(0.5, 0.25, r)); }`,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.parts = [];
  }

  burst(x, y, z, { count = 12, colors = [0xffffff], speed = 2, up = 3, size = 0.18, life = 0.8, gravity = 9, spread = 0.3 } = {}) {
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      if (this.parts.length >= MAX) this.parts.shift();
      c.set(colors[i % colors.length]);
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.6);
      this.parts.push({
        x: x + (Math.random() - 0.5) * spread, y, z: z + (Math.random() - 0.5) * spread,
        vx: Math.cos(a) * sp, vy: up * (0.5 + Math.random() * 0.7), vz: Math.sin(a) * sp,
        r: c.r, g: c.g, b: c.b, s: size * (0.6 + Math.random() * 0.8), life, max: life, gravity,
      });
    }
  }

  update(dt) {
    let n = 0;
    this.parts = this.parts.filter((p) => (p.life -= dt) > 0);
    for (const p of this.parts) {
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z;
      this.col[n * 3] = p.r; this.col[n * 3 + 1] = p.g; this.col[n * 3 + 2] = p.b;
      this.size[n] = p.s;
      this.alpha[n] = Math.min(1, (p.life / p.max) * 2);
      n++;
    }
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'color', 'size', 'alpha']) this.geo.attributes[k].needsUpdate = true;
  }
}

export const FX_STYLE = {
  dirt: { colors: [0x8a5a32, 0x6a4528, 0xa87a4a], count: 14, up: 3, speed: 1.6 },
  water: { colors: [0x6ac0f0, 0xbfe8ff, 0x3b8fd9], count: 18, up: 2.5, speed: 1.4, size: 0.14 },
  leaves: { colors: [0x5fb23a, 0x8ad85a, 0x3f8f2f], count: 16, up: 3.5, speed: 2, gravity: 4, life: 1.1 },
  wood: { colors: [0xd9b27c, 0x8a5a32, 0x7a5232], count: 18, up: 4, speed: 2.5 },
  stone: { colors: [0x9aa0a6, 0x6a6f74, 0xc9ced3], count: 18, up: 4, speed: 2.5 },
  harvest: { colors: [0xffe066, 0xfff6c0, 0xffb84a], count: 22, up: 4.5, speed: 1.6, gravity: 5, life: 1.2, size: 0.16 },
  plant: { colors: [0x8ad85a, 0xc9a26b], count: 14, up: 2, speed: 1.2 },
  refill: { colors: [0x6ac0f0, 0xffffff], count: 24, up: 3.5, speed: 1.2 },
  splash: { colors: [0x6ac0f0, 0xbfe8ff, 0xffffff], count: 30, up: 5, speed: 2 },
  ship: { colors: [0xffe066, 0xf2c94c], count: 18, up: 3, speed: 1, gravity: 3, life: 1 },
  eat: { colors: [0xff7b9a, 0xffd0dc], count: 12, up: 2.5, speed: 0.8, gravity: 2, life: 1 },
};

// Rain / snow / seasonal ambience around the camera.
export class Ambience {
  constructor(scene) {
    this.scene = scene;
    const N = 2400;
    this.N = N;
    const g = new THREE.BufferGeometry();
    this.rainPos = new Float32Array(N * 6);
    g.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaac8e8, transparent: true, opacity: 0.55 }));
    this.rain.frustumCulled = false;
    this.drops = Array.from({ length: N }, () => [Math.random() * 60 - 30, Math.random() * 25, Math.random() * 60 - 30]);
    scene.add(this.rain);

    const M = 700;
    this.M = M;
    const g2 = new THREE.BufferGeometry();
    this.flakePos = new Float32Array(M * 3);
    g2.setAttribute('position', new THREE.BufferAttribute(this.flakePos, 3));
    this.flakeMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.9, depthWrite: false });
    this.flakes = new THREE.Points(g2, this.flakeMat);
    this.flakes.frustumCulled = false;
    this.flakeData = Array.from({ length: M }, () => ({ x: Math.random() * 50 - 25, y: Math.random() * 18, z: Math.random() * 50 - 25, ph: Math.random() * 6 }));
    scene.add(this.flakes);
    this.mode = null;
  }

  update(dt, center, weather, season, night) {
    const raining = weather === 'rain' || weather === 'storm';
    this.rain.visible = raining;
    if (raining) {
      const fall = weather === 'storm' ? 34 : 24;
      const slant = weather === 'storm' ? 0.35 : 0.1;
      for (let i = 0; i < this.N; i++) {
        const d = this.drops[i];
        d[1] -= fall * dt;
        if (d[1] < 0) { d[1] = 22 + Math.random() * 4; d[0] = Math.random() * 60 - 30; d[2] = Math.random() * 60 - 30; }
        const x = center.x + d[0], z = center.z + d[2];
        this.rainPos.set([x, d[1], z, x + slant, d[1] + 0.7, z], i * 6);
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
    // Floating ambience: snow, petals, falling leaves, or summer fireflies.
    let mode = null;
    if (weather === 'snow') mode = 'snow';
    else if (raining) mode = null;
    else if (season === 'spring') mode = 'petal';
    else if (season === 'fall') mode = 'leaf';
    else if (season === 'summer' && night > 0.5) mode = 'firefly';
    if (mode !== this.mode) {
      this.mode = mode;
      const conf = {
        snow: [0xffffff, 0.2, 1, THREE.NormalBlending],
        petal: [0xf6a8c8, 0.16, 0.9, THREE.NormalBlending],
        leaf: [0xe07b2a, 0.2, 0.9, THREE.NormalBlending],
        firefly: [0xd8ff6a, 0.25, 1, THREE.AdditiveBlending],
      }[mode];
      if (conf) {
        this.flakeMat.color.set(conf[0]);
        this.flakeMat.size = conf[1];
        this.flakeMat.opacity = conf[2];
        this.flakeMat.blending = conf[3];
        this.flakeMat.needsUpdate = true;
      }
    }
    this.flakes.visible = !!mode;
    if (!mode) return;
    const count = mode === 'snow' ? this.M : mode === 'firefly' ? 120 : 160;
    const fallSpeed = mode === 'snow' ? 1.6 : mode === 'firefly' ? 0 : 0.9;
    const t = performance.now() / 1000;
    for (let i = 0; i < this.M; i++) {
      const f = this.flakeData[i];
      if (i >= count) { this.flakePos.set([0, -100, 0], i * 3); continue; }
      f.y -= fallSpeed * dt;
      f.x += Math.sin(t + f.ph) * dt * (mode === 'snow' ? 0.4 : 0.9);
      if (mode === 'firefly') f.y = 0.6 + Math.sin(t * 0.8 + f.ph) * 0.8 + (f.ph % 1.5);
      if (f.y < 0) { f.y = 14 + Math.random() * 4; f.x = Math.random() * 50 - 25; f.z = Math.random() * 50 - 25; }
      this.flakePos.set([center.x + f.x, f.y, center.z + f.z], i * 3);
    }
    if (mode === 'firefly') this.flakeMat.opacity = 0.6 + Math.sin(t * 5) * 0.4;
    this.flakes.geometry.attributes.position.needsUpdate = true;
  }
}

// Tiny WebAudio synth for UI and action sounds (no audio files needed).
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; }
  ensure() {
    if (!this.ctx) {
      try { this.ctx = new AudioContext(); } catch { this.ctx = null; }
    }
    if (this.ctx?.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  tone(freq, dur = 0.1, type = 'sine', vol = 0.12, slide = 0, delay = 0) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
  noise(dur = 0.15, vol = 0.1, filter = 1200) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.frequency.value = filter;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(ctx.destination);
    src.start();
  }
  play(kind) {
    switch (kind) {
      case 'dirt': this.noise(0.12, 0.25, 500); this.tone(110, 0.1, 'triangle', 0.1, -40); break;
      case 'water': this.noise(0.25, 0.12, 2500); break;
      case 'leaves': this.noise(0.1, 0.15, 3000); break;
      case 'wood': this.tone(180, 0.08, 'square', 0.06, -80); this.noise(0.08, 0.15, 900); break;
      case 'stone': this.tone(320, 0.06, 'square', 0.05, -100); this.noise(0.1, 0.2, 1800); break;
      case 'harvest': case 'pickup': this.tone(660, 0.08, 'sine', 0.1); this.tone(990, 0.12, 'sine', 0.1, 0, 0.07); break;
      case 'plant': this.tone(440, 0.08, 'triangle', 0.08, 120); break;
      case 'coin': case 'ship': this.tone(1320, 0.08, 'square', 0.04); this.tone(1760, 0.18, 'square', 0.04, 0, 0.07); break;
      case 'refill': this.noise(0.4, 0.1, 1500); this.tone(300, 0.3, 'sine', 0.05, 300); break;
      case 'splash': this.noise(0.35, 0.18, 2000); break;
      case 'bite': this.tone(880, 0.06, 'square', 0.08); this.tone(880, 0.06, 'square', 0.08, 0, 0.1); break;
      case 'eat': this.tone(300, 0.06, 'triangle', 0.1); this.tone(360, 0.06, 'triangle', 0.1, 0, 0.09); break;
      case 'error': this.tone(200, 0.15, 'sawtooth', 0.05, -60); break;
      case 'open': this.tone(520, 0.06, 'sine', 0.06, 200); break;
      case 'close': this.tone(620, 0.06, 'sine', 0.05, -200); break;
      case 'click': this.tone(800, 0.03, 'sine', 0.05); break;
      case 'chat': this.tone(700, 0.05, 'sine', 0.05); this.tone(900, 0.05, 'sine', 0.05, 0, 0.05); break;
      case 'morning': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'sine', 0.07, 0, i * 0.12)); break;
      case 'trade': [660, 880, 1100].forEach((f, i) => this.tone(f, 0.15, 'triangle', 0.07, 0, i * 0.08)); break;
      default: break;
    }
  }
}
