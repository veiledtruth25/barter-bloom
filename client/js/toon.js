import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Gradien 4 tingkat -> bayangan bertahap khas kartun.
const gradient = (() => {
  const data = new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 225, 225, 225, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

const mats = new Map();
export function toon(color) {
  if (!mats.has(color)) mats.set(color, new THREE.MeshToonMaterial({ color, gradientMap: gradient }));
  return mats.get(color);
}

const outlineMat = (thickness, color) => new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: { t: { value: thickness }, c: { value: new THREE.Color(color) } },
  vertexShader: 'uniform float t; void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normalize(normal) * t, 1.0); }',
  fragmentShader: 'uniform vec3 c; void main(){ gl_FragColor = vec4(c, 1.0); }',
});
const OUTLINE = outlineMat(0.035, 0x2b2118);
const OUTLINE_THIN = outlineMat(0.02, 0x2b2118);

// Mesh toon + outline (inverted hull). Geometri harus bernormal halus (bola, kapsul, kotak membulat).
export function mesh(geometry, color, { outline = true, thin = false, shadow = true } = {}) {
  const m = new THREE.Mesh(geometry, toon(color));
  m.castShadow = shadow;
  m.receiveShadow = true;
  if (outline) {
    const o = new THREE.Mesh(geometry, thin ? OUTLINE_THIN : OUTLINE);
    m.add(o);
  }
  return m;
}

export const G = {
  sphere: (r, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h),
  capsule: (r, len) => new THREE.CapsuleGeometry(r, len, 6, 14),
  box: (x, y, z, r = 0.08) => new RoundedBoxGeometry(x, y, z, 3, r),
  cone: (r, h) => new THREE.ConeGeometry(r, h, 18, 1),
  cyl: (rt, rb, h) => new THREE.CylinderGeometry(rt, rb, h, 18, 1),
};

// Model buatan sendiri (GLB) menggantikan model bawaan; material diganti toon agar gayanya senada.
export async function loadGLB(url, { outline = true } = {}) {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().loadAsync(url);
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const color = o.material?.color?.getHex?.() ?? 0xffffff;
    o.material = o.material?.map ? new THREE.MeshToonMaterial({ map: o.material.map, gradientMap: gradient }) : toon(color);
    o.castShadow = o.receiveShadow = true;
    if (outline && o.geometry.attributes.normal) o.add(new THREE.Mesh(o.geometry, OUTLINE_THIN));
  });
  return gltf.scene;
}
