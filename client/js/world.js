import * as THREE from 'three';
import {
  PLOT_CENTERS, plotLayout, TOWN, WILD_TREES, WORLD_BOUNDS, FIELD_W, FIELD_H, mulberry32,
} from '/shared/defs.js';
import {
  Builder, vcMat, swayMat, windowMat, glowMat, windUniform, building, addTree, addBush, addFlower, addRock,
  addFence, addWell, addBin, addLamp, addBench, addFountain,
} from './models.js';

const GRASS = { spring: 0x8fd16a, summer: 0x6fbf4f, fall: 0xc2b25a, winter: 0xeef3f7 };
const PATH = { spring: 0xd8b98a, summer: 0xd8b98a, fall: 0xc9a77a, winter: 0xdfe3e6 };

// Sky keyframes by hour: [hour, top, horizon, sunColor, sunIntensity, ambient]
const SKY = [
  [0, 0x070b1c, 0x172241, 0x8aa2ff, 0.25, 0.25],
  [5, 0x0d1430, 0x2b3560, 0x8aa2ff, 0.25, 0.28],
  [6.5, 0x5f8fd0, 0xffc49a, 0xffc68a, 1.4, 0.55],
  [9, 0x3d8be0, 0xc4e6ff, 0xfff2dc, 2.6, 0.85],
  [16, 0x3d8be0, 0xc4e6ff, 0xfff2dc, 2.6, 0.85],
  [18, 0x40508f, 0xff9a5e, 0xffa060, 1.5, 0.6],
  [19.5, 0x1a2350, 0x5a4a7a, 0x9aa8ff, 0.5, 0.35],
  [21, 0x070b1c, 0x172241, 0x8aa2ff, 0.25, 0.25],
  [24, 0x070b1c, 0x172241, 0x8aa2ff, 0.25, 0.25],
];

function textTexture(text, { bg = '#7a4a2a', fg = '#fff6df', w = 512, h = 128, font = 64 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  const r = 24;
  g.beginPath();
  g.roundRect(4, 4, w - 8, h - 8, r);
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.stroke();
  g.fillStyle = fg;
  g.font = `700 ${font}px Fredoka, system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4, w - 40);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function signMesh(text, opts, width = 3) {
  const tex = textTexture(text, opts);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
  return m;
}

export class World {
  constructor(renderer) {
    this.scene = new THREE.Scene();
    this.season = 'spring';
    this.weather = 'sunny';
    this.night = 0;
    this.time = 0;

    this.setupSky();
    this.setupLights();
    this.setupGround();
    this.setupWater();
    this.setupTown();
    this.setupPlots();
    this.setupClouds();
    this.rebuildSeasonal('spring');
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  // ---------------------------------------------------------------- sky

  setupSky() {
    const geo = new THREE.SphereGeometry(420, 32, 16);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() }, sunCol: { value: new THREE.Color() } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vP;
        void main(){ float h = clamp(vP.y, 0.0, 1.0); vec3 c = mix(horizon, top, pow(h, 0.55));
        float s = max(dot(vP, normalize(sunDir)), 0.0); c += sunCol * (pow(s, 64.0) * 0.9 + pow(s, 6.0) * 0.18);
        if (vP.y < 0.0) c = horizon * 0.9; gl_FragColor = vec4(c, 1.0); }`,
    });
    this.sky = new THREE.Mesh(geo, this.skyMat);
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog(0xc4e6ff, 70, 220);

    const starGeo = new THREE.BufferGeometry();
    const pos = [];
    const rnd = mulberry32(7);
    for (let i = 0; i < 900; i++) {
      const th = rnd() * Math.PI * 2, ph = Math.acos(rnd() * 0.95);
      pos.push(Math.sin(ph) * Math.cos(th) * 380, Math.cos(ph) * 380, Math.sin(ph) * Math.sin(th) * 380);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.scene.add(this.stars);

    this.sunDisc = new THREE.Mesh(new THREE.CircleGeometry(14, 24), new THREE.MeshBasicMaterial({ color: 0xfff1c4, fog: false, transparent: true }));
    this.moonDisc = new THREE.Mesh(new THREE.CircleGeometry(9, 24), new THREE.MeshBasicMaterial({ color: 0xe6ecff, fog: false, transparent: true }));
    this.scene.add(this.sunDisc, this.moonDisc);
  }

  setupLights() {
    this.hemi = new THREE.HemisphereLight(0xdff1ff, 0x5a6a3a, 0.8);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = this.sun.shadow.camera;
    s.left = -32; s.right = 32; s.top = 32; s.bottom = -32; s.near = 1; s.far = 160;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.playerLight = new THREE.PointLight(0xffc98a, 0, 9, 1.6);
    this.scene.add(this.playerLight);
  }

  // ------------------------------------------------------------- terrain

  setupGround() {
    const W = 300, D = 260;
    const geo = new THREE.PlaneGeometry(W, D, 150, 130);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    const col = [];
    const rnd = mulberry32(42);
    const b = WORLD_BOUNDS;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const dx = Math.max(0, b.x0 - 6 - x, x - b.x1 - 6);
      const dz = Math.max(0, b.z0 - 6 - z, z - b.z1 - 6);
      const d = Math.hypot(dx, dz);
      const n = Math.sin(x * 0.11) * Math.cos(z * 0.09) + Math.sin(x * 0.05 + z * 0.07) * 1.5;
      const y = d > 0 ? d * 0.55 + Math.max(0, n) * d * 0.25 + rnd() * 0.4 : 0;
      p.setY(i, y);
      const v = 0.86 + rnd() * 0.14 - Math.min(0.15, y * 0.01);
      col.push(v, v, v);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    this.groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, color: GRASS.spring });
    const ground = new THREE.Mesh(geo, this.groundMat);
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;

    // Dirt paths.
    this.pathMat = new THREE.MeshStandardMaterial({ color: PATH.spring, roughness: 1 });
    const paths = [
      [0, 0, 124, 3.2], [-0.5, -10, 2.4, 22], [-0.5, 10, 2.4, 22],
      [0, -19.8, 112, 2.4], [0, 19.2, 112, 2.4],
    ];
    for (const [x, z, w, d] of paths) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.pathMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.015, z);
      m.receiveShadow = true;
      this.scene.add(m);
    }
    for (const [cx, cz] of PLOT_CENTERS) {
      const z = cz < 0 ? -19.8 : 19.2;
      const L = plotLayout(PLOT_CENTERS.findIndex((c) => c[0] === cx && c[1] === cz));
      const zEnd = cz < 0 ? L.oz + FIELD_H : L.oz - 6.5;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2, Math.abs(zEnd - z)), this.pathMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(L.ox + FIELD_W + 1.2, 0.016, (z + zEnd) / 2);
      m.receiveShadow = true;
      this.scene.add(m);
    }
    // Plaza.
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(9, 40), new THREE.MeshStandardMaterial({ color: 0xcfc6b4, roughness: 0.95 }));
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.02;
    plaza.receiveShadow = true;
    this.scene.add(plaza);
    const ring = new THREE.Mesh(new THREE.RingGeometry(8.6, 9.2, 40), new THREE.MeshStandardMaterial({ color: 0xa89f8c }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.025;
    this.scene.add(ring);
  }

  setupWater() {
    const P = TOWN.pond;
    this.waterMat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { uTime: windUniform, uNight: { value: 0 }, uDeep: { value: new THREE.Color(0x1f6fb5) }, uShallow: { value: new THREE.Color(0x5fd0e8) }, uFrozen: { value: 0 } },
      vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uTime; uniform float uNight; uniform vec3 uDeep; uniform vec3 uShallow; uniform float uFrozen; varying vec2 vUv; varying vec3 vW;
        void main(){ float r = length(vUv - 0.5) * 2.0;
          float w = sin(vW.x * 1.7 + uTime * 1.6) * cos(vW.z * 1.3 - uTime * 1.2) + sin((vW.x + vW.z) * 2.3 + uTime * 2.1) * 0.5;
          vec3 c = mix(uDeep, uShallow, smoothstep(0.35, 1.0, r));
          c += smoothstep(0.9, 1.4, w) * 0.25;
          c += smoothstep(0.82, 0.95, r) * 0.25;
          c = mix(c, vec3(0.86, 0.94, 1.0), uFrozen);
          c *= mix(1.0, 0.35, uNight);
          gl_FragColor = vec4(c, mix(0.86, 1.0, uFrozen)); }`,
    });
    const water = new THREE.Mesh(new THREE.CircleGeometry(P.r, 48), this.waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(P.x, 0.06, P.z);
    this.scene.add(water);
    const b = new Builder();
    const rnd = mulberry32(99);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      addRock(b, P.x + Math.cos(a) * (P.r + 0.2), P.z + Math.sin(a) * (P.r + 0.2), 0.7 + rnd() * 0.5, 0x9a9fa4);
    }
    for (let i = 0; i < 7; i++) {
      const a = rnd() * Math.PI * 2, r = rnd() * (P.r - 1.5);
      b.add(new THREE.CylinderGeometry(0.45, 0.45, 0.03, 9, 1, false, 0, Math.PI * 1.75), 0x4fa33a, { x: P.x + Math.cos(a) * r, y: 0.09, z: P.z + Math.sin(a) * r, ry: rnd() * 6 });
      if (i % 2) b.add(new THREE.IcosahedronGeometry(0.1, 0), 0xf6b8d8, { x: P.x + Math.cos(a) * r, y: 0.15, z: P.z + Math.sin(a) * r });
    }
    for (let i = 0; i < 12; i++) {
      const a = 2.2 + rnd() * 1.6;
      const x = P.x + Math.cos(a) * (P.r + 0.6), z = P.z + Math.sin(a) * (P.r + 0.6);
      b.add(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 3), 0x6a9a3a, { x, y: 0.6, z, rz: (rnd() - 0.5) * 0.3 });
      b.add(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 5), 0x7a5232, { x, y: 1.1, z });
    }
    this.scene.add(b.mesh(vcMat, false));
    // Small pier for fishing.
    const pier = new Builder();
    for (let i = 0; i < 5; i++) pier.add(new THREE.BoxGeometry(1.6, 0.12, 0.42), 0xb07a45, { x: P.x - P.r + 0.6 + i * 0.0, y: 0.25, z: P.z - 0.9 + i * 0.45, jitter: 0.1 });
    pier.add(new THREE.BoxGeometry(0.15, 0.6, 0.15), 0x7a5232, { x: P.x - P.r - 0.1, y: 0.2, z: P.z - 1.0 });
    pier.add(new THREE.BoxGeometry(0.15, 0.6, 0.15), 0x7a5232, { x: P.x - P.r - 0.1, y: 0.2, z: P.z + 1.0 });
    this.scene.add(pier.mesh());
  }

  // ---------------------------------------------------------------- town

  setupTown() {
    const S = TOWN.store, M = TOWN.market;
    this.store = building({ w: S.w, d: S.d, h: 3.4, wall: 0xf3e3c3, roof: 0x3f8f5a, awning: 0x3f9e5a, windows: 2, chimney: true });
    this.store.position.set(S.x, 0, S.z);
    this.market = building({ w: M.w, d: M.d, h: 3.4, wall: 0xf6e7d0, roof: 0xc4553b, awning: 0xe0583e, windows: 2 });
    this.market.position.set(M.x, 0, M.z);
    this.scene.add(this.store, this.market);
    const s1 = signMesh('🏪 TOKO UMUM', { bg: '#2f7a4a' });
    s1.position.set(S.x, 4.0, S.z + S.d / 2 + 0.12);
    const s2 = signMesh('⚖️ PASAR PEMAIN', { bg: '#b8432e' });
    s2.position.set(M.x, 4.0, M.z + M.d / 2 + 0.12);
    this.scene.add(s1, s2);

    const b = new Builder();
    addFountain(b, TOWN.fountain.x, TOWN.fountain.z);
    this.lampPositions = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const x = Math.cos(a) * 8, z = Math.sin(a) * 8;
      addLamp(b, x, z);
      this.lampPositions.push([x, z]);
    }
    for (const x of [-30, -20, 20, 30]) { addLamp(b, x, -2.4); this.lampPositions.push([x, -2.4]); }
    addBench(b, -4.5, 5.5, Math.PI + 0.6);
    addBench(b, 4.5, 5.5, Math.PI - 0.6);
    addBench(b, -5.5, -3, 1.2);
    addBench(b, 5.5, -3, -1.2);
    // Market crates & produce stand in front of the market.
    for (let i = 0; i < 4; i++) {
      b.add(new THREE.BoxGeometry(0.7, 0.5, 0.6), 0xb07a45, { x: M.x - 3.2 + i * 2.1, y: 0.25, z: M.z + M.d / 2 + 1.4, jitter: 0.1 });
      b.add(new THREE.IcosahedronGeometry(0.28, 0), [0xe2412b, 0xf2c94c, 0x6fbf4a, 0xf08a1c][i], { x: M.x - 3.2 + i * 2.1, y: 0.6, z: M.z + M.d / 2 + 1.4, sy: 0.6, jitter: 0.2 });
    }
    // Seed barrels outside the store.
    for (let i = 0; i < 3; i++) {
      b.add(new THREE.CylinderGeometry(0.35, 0.3, 0.7, 8), 0x8a5a32, { x: S.x - 3 + i * 3, y: 0.35, z: S.z + S.d / 2 + 1.3 });
      b.add(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 8), [0xd9c27a, 0x8fd16a, 0xc9a26b][i], { x: S.x - 3 + i * 3, y: 0.72, z: S.z + S.d / 2 + 1.3 });
    }
    this.scene.add(b.mesh());

    // Lamp bulbs glow at night.
    const bulbs = new Builder();
    for (const [x, z] of this.lampPositions) bulbs.add(new THREE.IcosahedronGeometry(0.22, 1), 0xffffff, { x, y: 2.75, z });
    this.bulbs = new THREE.Mesh(bulbs.geometry(), glowMat);
    this.scene.add(this.bulbs);
    this.lampLights = [];
    for (const [x, z] of this.lampPositions.slice(0, 8).filter((_, i) => i % 2 === 0)) {
      const l = new THREE.PointLight(0xffc98a, 0, 14, 1.4);
      l.position.set(x, 2.6, z);
      this.scene.add(l);
      this.lampLights.push(l);
    }
    this.fountainSpray = this.makeSpray();
  }

  makeSpray() {
    const n = 120;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xbfe8ff, size: 0.12, transparent: true, opacity: 0.85, depthWrite: false }));
    pts.userData.seeds = Array.from({ length: n }, () => [Math.random() * Math.PI * 2, Math.random()]);
    this.scene.add(pts);
    return pts;
  }

  // ---------------------------------------------------------------- plots

  setupPlots() {
    this.plotGroups = [];
    this.signs = [];
    for (let i = 0; i < PLOT_CENTERS.length; i++) {
      const L = plotLayout(i);
      const g = new THREE.Group();
      this.scene.add(g);
      const house = building({ w: L.house.w, d: L.house.d, h: 2.8, wall: 0xf6ead2, roof: [0xc4553b, 0x3f6fb5, 0x3f8f5a, 0x8a4ab5, 0xd98a2a, 0x2a9a9a, 0xc43b7a, 0x6a6a3a][i], doorSide: 'east', chimney: true });
      house.position.set(L.house.x, 0, L.house.z);
      const barn = building({ w: L.barn.w, d: L.barn.d, h: 2.6, wall: 0xb8432e, roof: 0x7a3a2a, trim: 0xf6ead2, door: 0xf6ead2, doorSide: 'east', windows: 1 });
      barn.position.set(L.barn.x, 0, L.barn.z);
      g.add(house, barn);
      const b = new Builder();
      // Field border & tilled-ground base.
      b.add(new THREE.BoxGeometry(FIELD_W + 0.3, 0.04, FIELD_H + 0.3), 0x8a6a45, { x: L.ox + FIELD_W / 2, y: 0.005, z: L.oz + FIELD_H / 2 });
      const pen = L.pen;
      addFence(b, pen.x0, pen.z0, pen.x1, pen.z0);
      addFence(b, pen.x0, pen.z0, pen.x0, pen.z1);
      addFence(b, pen.x1, pen.z0, pen.x1, pen.z1);
      addFence(b, pen.x0, pen.z1, pen.x0 + 5, pen.z1);
      addFence(b, pen.x1 - 5, pen.z1, pen.x1, pen.z1);
      b.add(new THREE.BoxGeometry(1.2, 0.35, 0.5), 0x8a5a32, { x: pen.x0 + 1.5, y: 0.18, z: pen.z0 + 1 });
      b.add(new THREE.BoxGeometry(1.0, 0.1, 0.35), 0xd9c27a, { x: pen.x0 + 1.5, y: 0.36, z: pen.z0 + 1 });
      addWell(b, L.well.x, L.well.z);
      addBin(b, L.bin.x, L.bin.z);
      b.add(new THREE.BoxGeometry(0.15, 1.6, 0.15), 0x7a5232, { x: L.sign.x, y: 0.8, z: L.sign.z });
      // Doorstep and mailbox.
      b.add(new THREE.BoxGeometry(1.2, 0.12, 1.4), 0xa89f8c, { x: L.houseDoor.x - 0.3, y: 0.06, z: L.houseDoor.z });
      b.add(new THREE.BoxGeometry(1.4, 0.12, 1.6), 0xa89f8c, { x: L.barnDoor.x - 0.3, y: 0.06, z: L.barnDoor.z });
      g.add(b.mesh());
      const sign = signMesh('Ladang Kosong', { bg: '#7a4a2a', font: 56 }, 2.4);
      sign.position.set(L.sign.x, 1.6, L.sign.z);
      sign.rotation.y = Math.PI / 2;
      g.add(sign);
      this.signs.push(sign);
      this.plotGroups.push(g);
    }
  }

  setPlotOwner(i, name, color) {
    const sign = this.signs[i];
    sign.material.map.dispose();
    sign.material.map = name ? textTexture(`🏡 ${name}`, { bg: color || '#7a4a2a', font: 56 }) : textTexture('Ladang Kosong', { bg: '#7a4a2a', font: 56 });
    sign.material.needsUpdate = true;
  }

  setupClouds() {
    this.clouds = [];
    const rnd = mulberry32(5);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1, transparent: true, opacity: 0.92 });
    this.cloudMat = mat;
    for (let i = 0; i < 14; i++) {
      const b = new Builder();
      const n = 3 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) b.add(new THREE.IcosahedronGeometry(2 + rnd() * 2, 0), 0xffffff, { x: k * 2.6 - n, y: rnd(), z: rnd() * 2 });
      const m = new THREE.Mesh(b.geometry(), mat);
      m.position.set(-150 + rnd() * 300, 32 + rnd() * 12, -100 + rnd() * 200);
      m.userData.speed = 0.6 + rnd() * 0.8;
      this.scene.add(m);
      this.clouds.push(m);
    }
  }

  // --------------------------------------------------------- seasonal decor

  rebuildSeasonal(season) {
    this.season = season;
    if (this.seasonal) {
      this.scene.remove(this.seasonal);
      this.seasonal.geometry.dispose();
    }
    const rnd = mulberry32(2024);
    const b = new Builder();
    for (const t of WILD_TREES) addTree(b, t.x, t.z, t.s, t.kind, season, rnd);
    // Ring of trees beyond the play area.
    const B = WORLD_BOUNDS;
    for (let i = 0; i < 220; i++) {
      const side = i % 4;
      const u = rnd();
      const off = 3 + rnd() * 14;
      let x, z;
      if (side === 0) { x = B.x0 + (B.x1 - B.x0) * u; z = B.z0 - off; }
      else if (side === 1) { x = B.x0 + (B.x1 - B.x0) * u; z = B.z1 + off; }
      else if (side === 2) { x = B.x0 - off; z = B.z0 + (B.z1 - B.z0) * u; }
      else { x = B.x1 + off; z = B.z0 + (B.z1 - B.z0) * u; }
      const y = Math.max(0, off - 6) * 0.55;
      const tb = new Builder();
      addTree(tb, 0, 0, 1, rnd() < 0.45 ? 'pine' : 'round', season, rnd);
      b.addBuilder(tb, x, y, z, rnd() * 6, 1 + rnd() * 0.7);
    }
    // Town greenery.
    const townTrees = [[-24, -10], [-26, 8], [-6, 12], [6, 13], [-20, 12], [32, -10], [30, 14], [-3, -14], [3.5, -15], [16, 4]];
    for (const [x, z] of townTrees) addTree(b, x, z, 1.1, 'round', season, rnd);
    for (let i = 0; i < 40; i++) {
      const x = -28 + rnd() * 56, z = (rnd() < 0.5 ? -1 : 1) * (2.5 + rnd() * 14);
      if (Math.hypot(x, z) < 10) continue;
      if (Math.abs(x + 0.5) < 2 || Math.hypot(x - TOWN.pond.x, z - TOWN.pond.z) < TOWN.pond.r + 2) continue;
      if (Math.abs(x - TOWN.store.x) < 6 && Math.abs(z - TOWN.store.z) < 6) continue;
      if (Math.abs(x - TOWN.market.x) < 6 && Math.abs(z - TOWN.market.z) < 6) continue;
      if (Math.abs(z) > 16.5) continue;
      addBush(b, x, z, 0.8 + rnd() * 0.6, season);
    }
    if (season !== 'winter') {
      const colors = season === 'fall' ? [0xe07b2a, 0xf2c94c, 0xb5476b] : [0xf6a8c8, 0xffffff, 0xf2c94c, 0x9a8ae8, 0xe8553e];
      for (let i = 0; i < 160; i++) {
        const a = rnd() * Math.PI * 2, r = 9.6 + rnd() * 2.2;
        if (i < 90) addFlower(b, Math.cos(a) * r, Math.sin(a) * r, colors[i % colors.length]);
        else {
          const x = -58 + rnd() * 116, z = -15 + rnd() * 30;
          if (Math.abs(z) < 2.5 || Math.hypot(x - TOWN.pond.x, z - TOWN.pond.z) < TOWN.pond.r + 1) continue;
          if (Math.abs(x) < 30) continue;
          addFlower(b, x, z, colors[i % colors.length]);
        }
      }
    }
    this.seasonal = b.mesh(swayMat);
    this.scene.add(this.seasonal);
    this.groundMat.color.set(GRASS[season]);
    this.pathMat.color.set(PATH[season]);
    this.waterMat.uniforms.uFrozen.value = season === 'winter' ? 0.55 : 0;
  }

  // ------------------------------------------------------------- per frame

  update(dt, minute, weather, focus) {
    this.time += dt;
    windUniform.value = this.time * (weather === 'storm' ? 2.2 : 1);
    this.weather = weather;
    const hour = (minute / 60) % 24;
    let k = 0;
    while (k < SKY.length - 1 && SKY[k + 1][0] <= hour) k++;
    const a = SKY[k], bb = SKY[Math.min(k + 1, SKY.length - 1)];
    const f = bb[0] === a[0] ? 0 : (hour - a[0]) / (bb[0] - a[0]);
    const lerpC = (c1, c2) => new THREE.Color(c1).lerp(new THREE.Color(c2), f);
    const top = lerpC(a[1], bb[1]);
    const hor = lerpC(a[2], bb[2]);
    const sunC = lerpC(a[3], bb[3]);
    let sunI = a[4] + (bb[4] - a[4]) * f;
    let amb = a[5] + (bb[5] - a[5]) * f;
    const wet = weather === 'rain' || weather === 'storm';
    if (wet || weather === 'snow') {
      const grey = new THREE.Color(weather === 'snow' ? 0xc9d2dc : 0x7d8794);
      top.lerp(grey, 0.65);
      hor.lerp(grey, 0.6);
      sunI *= weather === 'snow' ? 0.6 : 0.4;
      amb *= 0.85;
    }
    // Storm lightning.
    if (weather === 'storm' && Math.random() < dt * 0.15) this.flash = 1;
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 3);
      amb += this.flash * 1.5;
      top.lerp(new THREE.Color(0xe8eeff), this.flash * 0.6);
    }
    this.skyMat.uniforms.top.value.copy(top);
    this.skyMat.uniforms.horizon.value.copy(hor);
    this.scene.fog.color.copy(hor);
    this.scene.fog.near = wet ? 30 : weather === 'snow' ? 35 : 70;
    this.scene.fog.far = wet ? 120 : weather === 'snow' ? 130 : 230;

    const night = hour < 6 || hour > 19.5 ? 1 : hour < 7 ? 1 - (hour - 6) : hour > 18 ? (hour - 18) / 1.5 : 0;
    this.night = Math.max(0, Math.min(1, night));
    // Sun arc across the sky from 6:00 to 18:00; the moon takes over at night.
    const dayT = (hour - 6) / 12;
    const sunAng = dayT * Math.PI;
    const sunDir = new THREE.Vector3(Math.cos(sunAng) * -1, Math.sin(sunAng), -0.45).normalize();
    const moonAng = ((hour + 24 - 18) % 24) / 12 * Math.PI;
    const moonDir = new THREE.Vector3(Math.cos(moonAng) * -1, Math.sin(moonAng), 0.35).normalize();
    const lightDir = this.night > 0.5 ? moonDir : sunDir;
    if (lightDir.y < 0.15) lightDir.y = 0.15;
    this.skyMat.uniforms.sunDir.value.copy(this.night > 0.5 ? moonDir : sunDir);
    this.skyMat.uniforms.sunCol.value.copy(sunC).multiplyScalar(wet ? 0.2 : 1);
    this.sunDisc.position.copy(sunDir).multiplyScalar(380).add(focus);
    this.sunDisc.lookAt(focus);
    this.sunDisc.material.opacity = sunDir.y > -0.05 && !wet ? 1 - this.night : 0;
    this.moonDisc.position.copy(moonDir).multiplyScalar(370).add(focus);
    this.moonDisc.lookAt(focus);
    this.moonDisc.material.opacity = this.night * (wet ? 0.2 : 1);
    this.sky.position.copy(focus);
    this.stars.position.copy(focus);
    this.starMat.opacity = this.night * (wet || weather === 'snow' ? 0.15 : 0.9);
    this.stars.rotation.y = this.time * 0.005;

    this.sun.color.copy(sunC);
    this.sun.intensity = sunI;
    this.sun.position.copy(focus).addScaledVector(lightDir, 70);
    this.sun.target.position.copy(focus);
    this.hemi.intensity = amb * 1.2;
    this.hemi.color.copy(top).lerp(new THREE.Color(0xffffff), 0.55);

    windowMat.emissiveIntensity = this.night * 1.6 + (wet ? 0.3 : 0);
    glowMat.emissiveIntensity = 0.2 + this.night * 2.5;
    for (const l of this.lampLights) l.intensity = this.night * 18;
    this.playerLight.intensity = this.night * 8;
    this.playerLight.position.set(focus.x, 2.2, focus.z);
    this.waterMat.uniforms.uNight.value = this.night * 0.8;
    this.cloudMat.opacity = wet ? 0.98 : 0.9;
    this.cloudMat.color.set(wet ? 0x8a929c : 0xffffff).multiplyScalar(1 - this.night * 0.7);

    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt * (weather === 'storm' ? 4 : 1);
      if (c.position.x > 160) c.position.x = -160;
    }

    // Fountain spray.
    const sp = this.fountainSpray;
    const pa = sp.geometry.attributes.position;
    const frozen = this.season === 'winter';
    sp.visible = !frozen;
    if (!frozen) {
      sp.userData.seeds.forEach(([ang, ph], i) => {
        const t = (this.time * 0.8 + ph) % 1;
        const r = t * 1.2;
        pa.setXYZ(i, Math.cos(ang) * r, 1.9 + t * 1.6 - t * t * 2.6, Math.sin(ang) * r);
      });
      pa.needsUpdate = true;
    }
  }
}
