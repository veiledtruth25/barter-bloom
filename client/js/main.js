import * as THREE from 'three';
import { REAL_SECONDS_PER_MINUTE, formatClock, weekday, SEASONS, DAY_END } from '/core/calendar.js';
import { TOOLS, TOOL_ORDER, ITEMS, CROPS, RECIPES } from '/core/items.js';
import {
  newGame, advanceMinutes, sleep, fatigue, useTool, harvest, tileKey, serialize, deserialize, eat, ship, feedAnimals, collectProducts,
  cook, buy, countItem, addItem, gift, orderUpgrade,
} from '/core/state.js';
import { FIELD, inField, ANIMALS, buyAnimal, petAnimal, rollFish, isRipe, seedSeasonOk, toolLevel, collectUpgrade, UPGRADE } from '/core/farm.js';
import { VILLAGERS, SHOPS, HEART_NAMES, isShopOpen, locationOf, talk, hearts, friendship } from '/core/villagers.js';
import { makeFarmer, animateFarmer, swingTool, makeTile, makeCrop, makeDebris, makeAnimal, makeLabel } from './models.js';
import { World, SPAWN, DOOR, SPOTS, BUILDINGS, PLACES, doorOf } from './world.js';
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

const actors = new Map();
for (const [id, v] of Object.entries(VILLAGERS)) {
  const m = makeFarmer({ skin: v.skin, hair: v.hair, shirt: v.shirt, pants: v.pants, hat: v.hair });
  if (id === 'dewi') m.scale.setScalar(0.75);
  const l = makeLabel(v.name); l.scale.set(1.6, 0.4, 1); l.position.y = id === 'dewi' ? 2.4 : 3.1; m.add(l);
  m.userData.offset = new THREE.Vector3(((id.charCodeAt(0) * 7) % 5 - 2) * 0.6, 0, ((id.charCodeAt(1) * 3) % 3 - 1) * 0.6);
  m.userData.place = null; scene.add(m); actors.set(id, m);
}
let game = null, slot = 0, tool = 'hoe', fishing = null, animalMeshes = [], debrisMeshes = new Map(), facing = new THREE.Vector2(0, 1), busy = false, saveTimer = 0;
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

let modalOpen = false;
function showModal(title, rows, note = '') {
  modalOpen = true;
  const m = $('modal'); m.classList.remove('hidden');
  m.innerHTML = `<h3>${title}</h3>${note ? `<small>${note}</small>` : ''}`;
  for (const r of rows) {
    const b = document.createElement('button'); b.className = 'row'; b.disabled = !!r.disabled;
    b.innerHTML = `<span>${r.label}</span><small>${r.hint || ''}</small>`;
    b.onclick = () => { r.fn?.(); if (r.close !== false) closeModal(); };
    m.appendChild(b);
  }
  const c = document.createElement('button'); c.className = 'row close'; c.textContent = 'Tutup (Esc)'; c.onclick = closeModal; m.appendChild(c);
}
function closeModal() { modalOpen = false; $('modal').classList.add('hidden'); }

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
  syncAll();
  farmer.position.copy(SPAWN);
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden');
  for (const m of actors.values()) m.userData.place = null;
  hud(); save();
}

// ---------------------------------------------------------------- ladang
function syncTile(x, z) {
  const k = tileKey(x, z), d = game.tilled[k];
  if (tiles.get(k)) { scene.remove(tiles.get(k)); tiles.delete(k); }
  if (d) {
    const t = makeTile(true, d.watered); t.position.set(x + 0.5, 0.04, z + 0.5);
    if (d.crop) t.add(makeCrop(d.crop.id, d.crop.age, CROPS[d.crop.id].days));
    scene.add(t); tiles.set(k, t);
  }
  if (debrisMeshes.get(k)) { scene.remove(debrisMeshes.get(k)); debrisMeshes.delete(k); }
  if (game.debris[k]) { const m = makeDebris(game.debris[k]); m.position.set(x + 0.5, 0, z + 0.5); scene.add(m); debrisMeshes.set(k, m); }
}
function syncAll() {
  for (const m of debrisMeshes.values()) scene.remove(m); debrisMeshes.clear();
  for (const k of new Set([...Object.keys(game.tilled), ...Object.keys(game.debris), ...tiles.keys()])) syncTile(...k.split(',').map(Number));
  syncAnimals();
}
function syncAnimals() {
  animalMeshes.forEach((m) => scene.remove(m)); animalMeshes = [];
  game.animals.forEach((a, i) => {
    const m = makeAnimal(a.type);
    m.userData.home = { x: SPOTS.barn.x + 3.2 + (i % 4) * 1.4 * (a.type === 'cow' ? 1.6 : 1), z: SPOTS.barn.z + (a.type === 'cow' ? 2.6 : 0.5) + Math.floor(i / 4) };
    m.position.set(m.userData.home.x, 0, m.userData.home.z); m.userData.t = Math.random() * 10;
    scene.add(m); animalMeshes.push(m);
  });
}
const targetTile = () => ({ x: Math.floor(farmer.position.x + facing.x * 0.9), z: Math.floor(farmer.position.z + facing.y * 0.9) });

const REASONS = {
  already: 'Tanah ini sudah digarap.', notilled: 'Garap dulu dengan cangkul.', nothing: 'Alat ini tidak berguna di sini.', tired: 'Terlalu lelah.',
  outside: 'Hanya bisa menggarap di ladang.', occupied: 'Sudah ada tanaman.', noseed: 'Tidak ada benih untuk musim ini.',
  need_sickle: 'Ada rumput liar: pakai Sabit.', need_hammer: 'Ada batu: pakai Palu.', need_axe: 'Ada tunggul: pakai Kapak.', full: 'Rucksack penuh!',
};

function nearPond() { return farmer.position.distanceTo(SPOTS.pond) < 5.2; }

function action() {
  if (busy || !game || modalOpen) return;
  if (tool === 'rod') return castRod();
  if (game.stamina <= 0) return toast('Kamu terlalu lelah… cari makanan atau tidur.');
  const { x, z } = targetTile();
  swingTool(farmer);
  const r = useTool(game, tool, x, z);
  if (r.ok) {
    syncTile(x, z); hud(); advanceMinutes(game, 2);
    if (r.got) toast(`Dapat ${ITEMS[r.got].icon} ${ITEMS[r.got].name}`);
    if (r.planted) toast(`Menanam ${CROPS[r.planted].name}`);
  } else toast(REASONS[r.reason] || '…');
}

// ---- memancing: lempar, tunggu gigitan (!), tekan Spasi tepat waktu
function castRod() {
  if (fishing) {
    if (fishing.bite) {
      const id = rollFish(game, 1);
      game.stamina = Math.max(0, game.stamina - TOOLS.rod.stamina);
      if (id === 'boot') toast('Dapat sepatu bekas…'); else toast(`Dapat ${ITEMS[id].icon} ${ITEMS[id].name}!`);
      if (!addItem(game, id, 1)) toast('Rucksack penuh!');
      renderRucksack();
      fishing = null; advanceMinutes(game, 20); hud(); $('prompt').classList.add('hidden');
    } else { toast('Belum ada gigitan…'); fishing = null; }
    return;
  }
  if (!nearPond()) return toast('Pancing hanya bisa dipakai di tepi kolam.');
  if (game.stamina <= 0) return toast('Kamu terlalu lelah…');
  swingTool(farmer);
  fishing = { t: 1.5 + Math.random() * 3, bite: false, hold: 0 };
  toast('Umpan dilempar…');
}

function updateFishing(dt) {
  if (!fishing) return;
  fishing.t -= dt;
  if (!fishing.bite && fishing.t <= 0) { fishing.bite = true; fishing.hold = 0.9; toast('❗ Ada gigitan! Tekan Spasi!'); }
  else if (fishing.bite) { fishing.hold -= dt; if (fishing.hold <= 0) { fishing = null; toast('Ikannya lepas…'); } }
}

function interact() {
  if (busy || !game) return;
  if (modalOpen) return closeModal();
  const p = farmer.position;
  if (p.distanceTo(DOOR) < 2.4) return houseMenu();
  if (p.distanceTo(SPOTS.bin) < 2.6) return binMenu();
  for (const [id, m] of actors) if (m.visible && m.position.distanceTo(p) < 2.4) return villagerMenu(id);
  for (const [id, b] of Object.entries(BUILDINGS)) if (b.shop && p.distanceTo(doorOf(b)) < 2.8) return shopMenu(id);
  if (p.distanceTo(SPOTS.barn) < 4.5 || animalMeshes.some((m) => m.position.distanceTo(p) < 2.2)) return ranchMenu();
  const { x, z } = targetTile();
  if (isRipe(game.tilled[tileKey(x, z)])) {
    const r = harvest(game, x, z);
    if (r.ok) { swingTool(farmer); syncTile(x, z); toast(`Panen ${r.got}!`); advanceMinutes(game, 2); hud(); } else toast(REASONS[r.reason] || 'Belum matang.');
    return;
  }
  toast('Tidak ada yang bisa dilakukan di sini.');
}

function houseMenu() {
  const rows = () => [
    { label: '🛏️ Tidur (akhiri hari)', fn: () => goToSleep(false) },
    { label: '📺 Ramalan cuaca besok', hint: `${WEATHER_ICON[game.forecast]} ${WEATHER_NAME[game.forecast]}`, close: false },
    ...Object.entries(RECIPES).map(([id, r]) => ({
      label: `${r.icon} Masak ${r.name}`, hint: Object.entries(r.needs).map(([i, n]) => `${ITEMS[i].icon}×${n}`).join(' '),
      disabled: !Object.entries(r.needs).every(([i, n]) => countItem(game, i) >= n), close: false,
      fn: () => { const res = cook(game, id); toast(res === 'ok' ? `Jadi: ${r.name}!` : res === 'full' ? 'Rucksack penuh' : 'Bahan kurang'); },
    })),
  ];
  openLoop('🏠 Rumah', rows, 'Dapur & TV');
}

// Modal yang diperbarui otomatis setelah tiap aksi `close:false`.
function openLoop(title, rowsFn, note) {
  const draw = () => {
    const rows = rowsFn().map((r) => ({ ...r, fn: r.fn && (() => { r.fn(); if (r.close === false) { draw(); renderRucksack(); hud(); } }) }));
    showModal(title, rows, note);
  };
  draw();
}

function binMenu() {
  openLoop('📦 Kotak Pengiriman', () => [
    ...game.rucksack.filter((s) => s && ITEMS[s.id].sell).map((s) => ({
      label: `${ITEMS[s.id].icon} ${ITEMS[s.id].name} ×${s.n}`, hint: `+${ITEMS[s.id].sell} G / buah`, close: false,
      fn: () => { ship(game, s.id, 1); },
    })),
    ...Object.entries(game.bin).map(([id, n]) => ({ label: `Terkirim: ${ITEMS[id].icon} ${ITEMS[id].name} ×${n}`, disabled: true })),
  ], 'Dibayar besok pagi.');
}

function shopStatus(id) {
  const sh = SHOPS[id];
  return `${formatClock(sh.open)}–${formatClock(sh.close)} · tutup hari ${sh.closed.map((d) => ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'][d]).join(', ')}`;
}
const buyRow = (id, label) => ({
  label, hint: `${ITEMS[id].buy} G`, close: false, disabled: game.gold < ITEMS[id].buy,
  fn: () => { const r = buy(game, id, 1); if (r === 'full') toast('Rucksack penuh'); },
});

function shopMenu(id) {
  if (!isShopOpen(game, id)) return toast(`${SHOPS[id].name} tutup. ${shopStatus(id)}`);
  const title = `🏪 ${SHOPS[id].name}`, note = () => `Uangmu: ${game.gold} G`;
  const stock = {
    store: () => Object.entries(CROPS).filter(([cid]) => seedSeasonOk(game, `${cid}_seed`)).map(([cid, c]) => buyRow(`${cid}_seed`, `${c.icon} Benih ${c.name}`)),
    flower: () => [buyRow('flower', '🌹 Bunga Mawar'), buyRow('sunflower', '🌻 Bunga Matahari')],
    clinic: () => [buyRow('herb', '🍵 Jamu (+40 stamina)')],
    inn: () => [buyRow('meal_rice', '🍚 Nasi Hangat'), buyRow('meal_soup', '🍲 Sup Ayam'), buyRow('cake', '🍰 Kue Cokelat')],
    smith: () => smithRows(),
  }[id];
  openLoop(title, stock, note());
}

function smithRows() {
  const rows = [];
  if (game.forge) {
    rows.push({ label: `🔥 Dalam tempaan: ${TOOLS[game.forge.tool].name}`, hint: 'ambil bila siap', close: false, fn: () => {
      const r = collectUpgrade(game);
      toast(r === 'wait' ? 'Belum selesai, kembali lagi nanti.' : `${TOOLS[r].name} naik level!`);
    } });
  }
  for (const t of UPGRADE.tools) {
    const lv = toolLevel(game, t);
    rows.push({ label: `${TOOLS[t].icon} ${TOOLS[t].name}`, hint: lv >= UPGRADE.maxLevel ? 'Tembaga ✓' : `${UPGRADE.oreN}× bijih tembaga + ${UPGRADE.gold} G`, close: false, disabled: lv >= UPGRADE.maxLevel || !!game.forge,
      fn: () => { const r = orderUpgrade(game, t); toast({ ok: `Dipesan! Selesai ${UPGRADE.days} hari lagi.`, ore: 'Bijih tembaga kurang.', gold: 'Uang kurang.', busy: 'Masih menempa alat lain.' }[r] || '…'); } });
  }
  return rows;
}

// ---- warga
function villagerMenu(id) {
  const v = VILLAGERS[id];
  let said = talk(game, id), lines = said.gained ? `+${said.gained} poin persahabatan` : '';
  const title = () => `${v.name} · ${HEART_NAMES[hearts(game, id)]} ${'♥'.repeat(hearts(game, id) + 1)}`;
  const draw = (note, rows) => showModal(title(), rows, note);
  const main = () => draw(`“${said.text}” ${lines ? `\n(${lines})` : ''}`, [
    { label: '🎁 Beri hadiah', close: false, fn: () => giftList() },
    { label: `📋 ${v.role}`, disabled: true },
  ]);
  const giftList = () => {
    const rows = game.rucksack.filter(Boolean).map((s) => ({ label: `${ITEMS[s.id].icon} ${ITEMS[s.id].name} ×${s.n}`, close: false,
      fn: () => {
        const r = gift(game, id, s.id);
        if (!r.ok) { lines = r.reason === 'already' ? 'Kamu sudah memberi hadiah hari ini.' : '…'; return main(); }
        said = { text: { love: 'Wah, ini favoritku! Terima kasih banyak!', like: 'Untukku? Terima kasih, aku suka!', ok: 'Terima kasih.', hate: 'Eh… aku tidak suka ini.' }[r.mood] };
        lines = `${r.delta > 0 ? '+' : ''}${r.delta} poin`; renderRucksack(); main();
      } }));
    draw('Pilih hadiah', rows.length ? [...rows, { label: '↩ Kembali', close: false, fn: main }] : [{ label: 'Rucksack kosong', disabled: true }, { label: '↩ Kembali', close: false, fn: main }]);
  };
  main();
}

function villagersPanel() {
  showModal('🏘️ Warga Desa', Object.entries(VILLAGERS).map(([id, v]) => ({ label: `${v.name}`, hint: `${HEART_NAMES[hearts(game, id)]} · ${friendship(game, id)}/255`, disabled: true })),
    Object.entries(SHOPS).map(([id]) => `${SHOPS[id].name}: ${shopStatus(id)}`).join('\n'));
}

function ranchMenu() {
  openLoop('🐄 Peternakan', () => [
    ...Object.entries(ANIMALS).map(([type, a]) => ({
      label: `${a.icon} Beli ${a.name}`, hint: `${a.price} G`, close: false, disabled: game.gold < a.price,
      fn: () => { const r = buyAnimal(game, type); if (r === 'full') toast('Kandang penuh'); syncAnimals(); },
    })),
    { label: '🌿 Beri makan (rumput)', hint: `${countItem(game, 'grass')} rumput`, close: false, fn: () => { const n = feedAnimals(game); toast(n ? `${n} hewan makan` : 'Tidak ada rumput / semua sudah makan'); } },
    { label: '🤚 Elus semua hewan', close: false, fn: () => { let n = 0; game.animals.forEach((_, i) => { if (petAnimal(game, i)) n++; }); toast(n ? `${n} hewan senang ♥` : 'Mereka sudah kamu elus'); } },
    { label: '🧺 Ambil telur & susu', close: false, fn: () => { const got = collectProducts(game); toast(Object.keys(got).length ? Object.entries(got).map(([i, n]) => `${ITEMS[i].icon}×${n}`).join(' ') : 'Belum ada hasil'); } },
    ...game.animals.map((a, i) => ({ label: `${ANIMALS[a.type].icon} Hewan ${i + 1}`, hint: `♥ ${a.love}/10 ${a.fed ? '· kenyang' : '· lapar'}`, disabled: true })),
  ], 'Beri makan setiap hari agar berproduksi.');
}

function goToSleep(passedOut) {
  busy = true;
  $('fade').classList.add('on');
  $('fadeText').textContent = passedOut ? 'Kamu pingsan karena kelelahan…' : 'Zzz…';
  setTimeout(() => {
    const r = sleep(game, { passedOut });
    syncAll();
    for (const m of actors.values()) m.userData.place = null;
    if (r.income) setTimeout(() => toast(`Hasil pengiriman: +${r.income} G`), 1800);
    r.wilted?.length && setTimeout(() => toast(`${r.wilted.length} tanaman layu karena pergantian musim`), 2600);
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
  if (k === 'escape') { if (modalOpen) return closeModal(); save(); toggleRucksack(false); return menu(); }
  if (k === ' ') { e.preventDefault(); action(); }
  else if (k === 'e') interact();
  else if (modalOpen) return;
  else if (k === 'q') { tool = TOOL_ORDER[(TOOL_ORDER.indexOf(tool) + 1) % TOOL_ORDER.length]; hud(); }
  else if (k === 'z') cam.target += Math.PI / 2;
  else if (k === 'x') cam.target -= Math.PI / 2;
  else if (k === 'i') toggleRucksack();
  else if (k === 'v') villagersPanel();
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

function updateActors(dt) {
  for (const [id, m] of actors) {
    const place = locationOf(id, game), tgt = PLACES[place].clone().add(m.userData.offset);
    if (m.userData.place === null) m.position.copy(tgt);            // muncul langsung di tempatnya
    m.userData.place = place;
    const d = tgt.clone().sub(m.position); d.y = 0;
    const dist = d.length();
    let sp = 0;
    if (dist > 0.15) { sp = Math.min(dist / dt, id === 'dewi' ? 3.4 : 2.6); d.normalize(); m.position.addScaledVector(d, sp * dt); m.rotation.y = Math.atan2(d.x, d.z); }
    m.visible = !(place.startsWith('home') && dist < 0.5);           // di dalam rumah
    animateFarmer(m, dt, sp);
  }
}

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
const mv = new THREE.Vector2();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  cam.yaw += (cam.target - cam.yaw) * Math.min(1, dt * 8);
  let speed = 0;
  if (game && $('menu').classList.contains('hidden')) {
    if (!busy && !modalOpen) {
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
    updateFishing(dt);
    world.cutaway(farmer.position, cam.yaw);
    updateActors(dt);
    for (const m of animalMeshes) { m.userData.t += dt; m.position.x = m.userData.home.x + Math.sin(m.userData.t * 0.5) * 0.6; m.rotation.y = Math.cos(m.userData.t * 0.5); m.position.y = Math.abs(Math.sin(m.userData.t * 3)) * 0.04; }
    const t = targetTile(), tk = tileKey(t.x, t.z);
    marker.visible = (inField(t.x, t.z) || !!game.debris[tk]) && !busy;
    marker.position.set(t.x + 0.5, 0.08, t.z + 0.5);
    const p = farmer.position;
    const label = p.distanceTo(DOOR) < 2.4 ? 'E — Rumah (tidur, masak, TV)' : p.distanceTo(SPOTS.bin) < 2.6 ? 'E — Kotak Pengiriman'
      : [...actors].some(([, m]) => m.visible && m.position.distanceTo(p) < 2.4) ? 'E — Bicara' : Object.values(BUILDINGS).some((b) => b.shop && p.distanceTo(doorOf(b)) < 2.8) ? 'E — Masuk toko' : (p.distanceTo(SPOTS.barn) < 4.5 || animalMeshes.some((m) => m.position.distanceTo(p) < 2.2)) ? 'E — Peternakan'
      : isRipe(game.tilled[tk]) ? 'E — Panen' : fishing ? (fishing.bite ? '❗ Spasi sekarang!' : '🎣 Menunggu…') : (tool === 'rod' && nearPond()) ? 'Spasi — Lempar pancing' : '';
    $('prompt').classList.toggle('hidden', !label || modalOpen);
    $('prompt').textContent = label;
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
window.__bb = { get game() { return game; }, farmer, cam, syncAll, actors };
