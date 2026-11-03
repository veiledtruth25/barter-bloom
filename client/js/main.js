import * as THREE from 'three';
import { REAL_SECONDS_PER_MINUTE, formatClock, weekday, SEASONS, DAY_END } from '/core/calendar.js';
import { TOOLS, TOOL_ORDER, ITEMS } from '/core/items.js';
import { newGame, advanceMinutes, sleep, fatigue, useTool, tileKey, serialize, deserialize, eat } from '/core/state.js';
import { makeFarmer, animateFarmer, swingTool, makeTile } from './models.js';
import { World, FIELD, SPAWN, DOOR } from './world.js';
import { mesh, G } from './toon.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEYS = ['bb-save-1', 'bb-save-2', 'bb-save-3'];
const WEATHER_ICON = { sunny: '☀️', rain: '🌧️', storm: '⛈️', snow: '❄️' };
const WEATHER_NAME = { sunny: 'Cerah', rain: 'Hujan', storm: 'Badai', snow: 'Salju' };
const SEASON_ICON = ['🌸', '☀️', '🍂', '❄️'];
const FACE = { fit: '😄', tired: '🙂', exhausted: '😫', collapse: '😵' };

const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 200);
const world = new World(scene);
const farmer = makeFarmer();
farmer.position.copy(SPAWN);
scene.add(farmer);
const tiles = new Map();
const marker = mesh(G.box(1, 0.06, 1, 0.03), 0xfff08a, { outline: false, shadow: false });
marker.material = marker.material.clone(); marker.material.transparent = true; marker.material.opacity = 0.6;
scene.add(marker);

let game = null, slot = 0, tool = 'hoe', facing = new THREE.Vector2(0, 1), busy = false, saveTimer = 0;
const cam = { yaw: Math.PI / 4, target: Math.PI / 4, dist: 12.5, pitch: 0.95 };
const keys = new Set();

// ------------------------------------------------------------------ UI
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  $('toasts').appendChild(t); setTimeout(() => t.remove(), 2600);
}

function hud() {
  const g = game;
  $('dateText').textContent = `${SEASONS[g.date.season]} ${g.date.day} · ${weekday(g.date)}`;
  $('clockText').textContent = formatClock(g.minute);
  $('seasonIcon').textContent = SEASON_ICON[g.date.season];
  $('weatherText').textContent = `${WEATHER_ICON[g.weather]} ${WEATHER_NAME[g.weather]}`;
  $('forecastText').textContent = `TV: besok ${WEATHER_ICON[g.forecast]} ${WEATHER_NAME[g.forecast]}`;
  $('goldText').textContent = `${g.gold} G`;
  $('staminaBar').style.width = `${(g.stamina / g.maxStamina) * 100}%`;
  $('faceIcon').textContent = FACE[fatigue(g)];
  $('toolIcon').textContent = TOOLS[tool].icon;
  $('toolName').textContent = TOOLS[tool].name;
}

function renderRucksack() {
  const box = $('slots'); box.innerHTML = '';
  game.rucksack.forEach((s) => {
    const d = document.createElement('div'); d.className = 'slot';
    if (s) {
      d.innerHTML = `<span>${ITEMS[s.id].icon}</span><b>${s.n}</b><small>${ITEMS[s.id].name}</small>`;
      if (ITEMS[s.id].stamina) d.onclick = () => { if (eat(game, s.id)) { toast(`Memakan ${ITEMS[s.id].name}`); renderRucksack(); hud(); } };
    }
    box.appendChild(d);
  });
}
const toggleRucksack = (force) => { const p = $('rucksack'); const open = force ?? p.classList.contains('hidden'); p.classList.toggle('hidden', !open); if (open) renderRucksack(); };

function menu() {
  $('menu').classList.remove('hidden'); $('hud').classList.add('hidden');
  const list = $('slotList'); list.innerHTML = '';
  SAVE_KEYS.forEach((key, i) => {
    let info = 'Kosong';
    try { const s = deserialize(localStorage.getItem(key)); info = `${s.name} — ${SEASONS[s.date.season]} ${s.date.day}, Tahun ${s.date.year}`; } catch { /* kosong */ }
    const row = document.createElement('div'); row.className = 'slot-row';
    row.innerHTML = `<div><b>Slot ${i + 1}</b><br><small>${info}</small></div>`;
    const play = document.createElement('button'); play.className = 'btn';
    play.textContent = info === 'Kosong' ? 'Mulai Baru' : 'Lanjutkan';
    play.onclick = () => {
      slot = i;
      if (info === 'Kosong') start(newGame($('nameInput').value.trim() || 'Petani')); else start(deserialize(localStorage.getItem(key)));
    };
    row.appendChild(play); list.appendChild(row);
  });
}

function save() {
  try { localStorage.setItem(SAVE_KEYS[slot], serialize(game)); } catch { toast('Gagal menyimpan'); }
}

function start(g) {
  game = g; busy = false;
  for (const t of tiles.values()) scene.remove(t); tiles.clear();
  for (const k of Object.keys(g.tilled)) syncTile(...k.split(',').map(Number));
  farmer.position.copy(SPAWN);
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden');
  hud(); save();
}

// ---------------------------------------------------------------- ladang
function syncTile(x, z) {
  const k = tileKey(x, z), d = game.tilled[k];
  tiles.get(k) && scene.remove(tiles.get(k));
  if (!d) return;
  const t = makeTile(true, d.watered); t.position.x = x + 0.5; t.position.z = z + 0.5; t.position.y = 0.04;
  scene.add(t); tiles.set(k, t);
}
const inField = (x, z) => x >= FIELD.x0 && x < FIELD.x0 + FIELD.w && z >= FIELD.z0 && z < FIELD.z0 + FIELD.h;
const targetTile = () => ({ x: Math.floor(farmer.position.x + facing.x * 0.9), z: Math.floor(farmer.position.z + facing.y * 0.9) });

function action() {
  if (busy || !game) return;
  if (game.stamina <= 0) return toast('Kamu terlalu lelah… cari makanan atau tidur.');
  const { x, z } = targetTile();
  swingTool(farmer);
  if (!inField(x, z)) return toast('Tidak bisa dipakai di sini.');
  const r = useTool(game, tool, x, z);
  if (r.ok) { syncTile(x, z); hud(); advanceMinutes(game, 2); }
  else toast({ already: 'Tanah ini sudah digarap.', notilled: 'Garap dulu dengan cangkul.', nothing: 'Belum ada gunanya di sini.', tired: 'Terlalu lelah.' }[r.reason] || '…');
}

function interact() {
  if (busy || !game) return;
  if (farmer.position.distanceTo(DOOR) < 2.2) return goToSleep(false);
  toast('Tidak ada yang bisa dilakukan di sini.');
}

function goToSleep(passedOut) {
  busy = true;
  $('fade').classList.add('on');
  $('fadeText').textContent = passedOut ? 'Kamu pingsan karena kelelahan…' : 'Zzz…';
  setTimeout(() => {
    const r = sleep(game, { passedOut });
    for (const k of Object.keys(game.tilled)) syncTile(...k.split(',').map(Number));
    farmer.position.copy(passedOut ? DOOR.clone().add(new THREE.Vector3(0, 0, 1.5)) : SPAWN);
    save(); hud();
    $('fadeText').textContent = `${SEASONS[game.date.season]} ${game.date.day} · ${r.weekday}`;
    setTimeout(() => { $('fade').classList.remove('on'); busy = false; toast(`Hari baru! Cuaca: ${WEATHER_NAME[game.weather]}`); }, 1400);
  }, 1000);
}

// ----------------------------------------------------------------- input
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase(); keys.add(k);
  if (!game) return;
  if (k === ' ') { e.preventDefault(); action(); }
  else if (k === 'e') interact();
  else if (k === 'q') { tool = TOOL_ORDER[(TOOL_ORDER.indexOf(tool) + 1) % TOOL_ORDER.length]; hud(); }
  else if (k === 'z') cam.target += Math.PI / 2;
  else if (k === 'x') cam.target -= Math.PI / 2;
  else if (k === 'i') toggleRucksack();
  else if (k === 'escape') { save(); toggleRucksack(false); menu(); }
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
const mv = new THREE.Vector2();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  cam.yaw += (cam.target - cam.yaw) * Math.min(1, dt * 8);
  let speed = 0;
  if (game && $('menu').classList.contains('hidden')) {
    if (!busy) {
      mv.set((keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0),
        (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0));
      if (mv.lengthSq() > 0) {
        mv.normalize();
        const sn = Math.sin(cam.target), cs = Math.cos(cam.target);   // gerak relatif kamera
        const dx = mv.x * cs + mv.y * sn, dz = -mv.x * sn + mv.y * cs;
        const exhausted = fatigue(game) === 'exhausted' || fatigue(game) === 'collapse';
        speed = (keys.has('shift') ? 7 : 4.6) * (exhausted ? 0.6 : 1);
        farmer.position.x += dx * speed * dt; farmer.position.z += dz * speed * dt;
        world.collide(farmer.position);
        facing.set(dx, dz);
        farmer.rotation.y += Math.atan2(Math.sin(Math.atan2(dx, dz) - farmer.rotation.y), Math.cos(Math.atan2(dx, dz) - farmer.rotation.y)) * Math.min(1, dt * 14);
      }
      const r = advanceMinutes(game, dt / REAL_SECONDS_PER_MINUTE);
      if (r.passedOut) goToSleep(true);
      else if (r.late && !game.flags.lateWarned) { game.flags.lateWarned = true; toast('Sudah lewat tengah malam… sebaiknya tidur.'); }
      if (game.minute < DAY_END) game.flags.lateWarned = false;
    }
    animateFarmer(farmer, dt, speed);
    world.update(dt, game, farmer.position);
    const t = targetTile();
    marker.visible = inField(t.x, t.z) && !busy;
    marker.position.set(t.x + 0.5, 0.08, t.z + 0.5);
    const near = farmer.position.distanceTo(DOOR) < 2.2;
    $('prompt').classList.toggle('hidden', !near);
    $('prompt').textContent = 'E — Tidur (akhiri hari)';
    saveTimer += dt; if (saveTimer > 30) { saveTimer = 0; save(); }
    if (Math.floor(game.minute) % 5 === 0 || speed) hud();
  }
  const cx = farmer.position.x + Math.sin(cam.yaw) * cam.dist * Math.cos(cam.pitch);
  const cz = farmer.position.z + Math.cos(cam.yaw) * cam.dist * Math.cos(cam.pitch);
  camera.position.lerp(new THREE.Vector3(cx, cam.dist * Math.sin(cam.pitch) + 1, cz), Math.min(1, dt * 10));
  camera.lookAt(farmer.position.x, 1.1, farmer.position.z);
  renderer.render(scene, camera);
}
$('toolBtn').onclick = () => { tool = TOOL_ORDER[(TOOL_ORDER.indexOf(tool) + 1) % TOOL_ORDER.length]; hud(); };
$('bagBtn').onclick = () => toggleRucksack();
menu();
frame();
