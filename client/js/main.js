import { REAL_SECONDS_PER_MINUTE, formatClock, weekday, SEASONS, DAY_END, FESTIVAL_DAYS, festivalOn } from '/core/calendar.js';
import { TOOLS, TOOL_ORDER, ITEMS, CROPS, RECIPES } from '/core/items.js';
import {
  newGame, advanceMinutes, sleep, fatigue, useTool, harvest, tileKey, serialize, deserialize, eat, ship, feedAnimals, collectProducts,
  cook, buy, countItem, addItem, gift, orderUpgrade, startEvent, advanceEvent, festivalActive, eligibleHeartEvent, eligibleFamilyEvent, orderHouse, propose, petDog, childStage, nextQueued, computeEnding, HOUSE_LEVELS,
} from '/core/state.js';
import { FIELD, inField, ANIMALS, buyAnimal, petAnimal, rollFish, isRipe, seedSeasonOk, toolLevel, collectUpgrade, UPGRADE } from '/core/farm.js';
import { VILLAGERS, SHOPS, HEART_NAMES, isShopOpen, locationOf, talk, hearts, friendship, PLACE_IDS } from '/core/villagers.js';
import { Vec } from './vec.js';
import { World, SPAWN, DOOR, SPOTS, BUILDINGS, PLACES, doorOf } from './world.js';
import { Renderer, makeEntity, animatePerson, swingTool, DIRV, dirOf, hex } from './render.js';
import { play, toggleMute } from './sfx.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEYS = ['bb-save-1', 'bb-save-2', 'bb-save-3'];
const WEATHER_ICON = { sunny: '☀️', rain: '🌧️', storm: '⛈️', snow: '❄️' };
const WEATHER_NAME = { sunny: 'Cerah', rain: 'Hujan', storm: 'Badai', snow: 'Salju' };
const SEASON_ICON = ['🌸', '☀️', '🍂', '❄️'];
const FACE = { fit: '😄', tired: '🙂', exhausted: '😫', collapse: '😵' };

const canvas = $('game');
const renderer = new Renderer(canvas);
const world = new World();
const farmer = makeEntity({ skin: '#ffd2b0', hair: '#5a3a22', shirt: '#4aa3df', pants: '#3b4a78', hat: '#e8c14a' });
farmer.position.copy(SPAWN);

for (const id of PLACE_IDS) if (!PLACES[id]) console.error('tempat tanpa koordinat:', id);
let eventRun = null, eventResolve = null;
const actors = new Map();
for (const [id, v] of Object.entries(VILLAGERS)) {
  const m = makeEntity({ skin: hex(v.skin), hair: hex(v.hair), shirt: hex(v.shirt), pants: hex(v.pants), hat: null }, id === 'dewi' ? 0.75 : 1);
  m.name = v.name;
  m.userData.offset = new Vec(((id.charCodeAt(0) * 7) % 5 - 2) * 0.6, 0, ((id.charCodeAt(1) * 3) % 3 - 1) * 0.6);
  m.userData.place = null; actors.set(id, m);
}
const dog = makeEntity(); dog.visible = false;
const kid = makeEntity({ skin: '#ffd2b0', hair: '#5a3a22', shirt: '#ff8ab0', pants: '#6a8ad8', hat: null }); kid.visible = false;
let game = null, slot = 0, tool = 'hoe', fishing = null, animalMeshes = [], busy = false, saveTimer = 0;
const keys = new Set();
const cam = renderer.cam;

// ------------------------------------------------------------------ UI
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  $('toasts').appendChild(t); setTimeout(() => t.remove(), 2600);
  play(/tidak|kurang|penuh|lelah|belum|gagal|sudah|tutup|Garap|Hanya/i.test(msg) ? 'no' : 'blip');
}

function hud() {
  const g = game;
  const hh = Math.floor(g.minute / 60) % 24, mm = String(Math.floor(g.minute % 60)).padStart(2, '0');
  $('dateText').textContent = `${g.date.day} ${weekday(g.date).slice(0, 3)}`;
  $('clockText').textContent = `${hh < 12 ? 'AM' : 'PM'} ${hh % 12 || 12}:${mm}`;
  $('seasonName').textContent = `${SEASONS[g.date.season]}, Thn ${g.date.year}`;
  $('seasonIcon').textContent = SEASON_ICON[g.date.season];
  $('weatherText').textContent = `${WEATHER_ICON[g.weather]} ${WEATHER_NAME[g.weather]}`;
  const fid = festivalOn(g.date), fest = fid && FESTIVAL_DAYS[fid];
  $('forecastText').textContent = fest ? `${fest.icon} ${fest.name} ${formatClock(fest.from)}–${formatClock(fest.to)}` : `TV: besok ${WEATHER_ICON[g.forecast]} ${WEATHER_NAME[g.forecast]}`;
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

// ---- event: kotak dialog bergaya visual novel
const dlg = () => $('dialog');
function showNode(node) {
  return new Promise((resolve) => {
    const d = dlg(); d.classList.remove('hidden'); d.innerHTML = '';
    if (node.who) { const w = document.createElement('div'); w.className = 'who'; w.textContent = node.who; d.appendChild(w); }
    const t = document.createElement('div'); t.className = 'text'; t.textContent = node.text || node.prompt || ''; d.appendChild(t);
    const done = (v) => { eventResolve = null; resolve(v); };
    const btn = (label, v) => { const b = document.createElement('button'); b.className = 'row'; b.textContent = label; b.onclick = () => done(v); d.appendChild(b); };
    if (node.type === 'say' || node.type === 'end') { btn('▶ Lanjut (Spasi)', null); eventResolve = () => done(null); }
    else if (node.type === 'choice') node.options.forEach((o, i) => btn(o, i));
    else if (node.type === 'person') node.ids.forEach((id) => btn(`${VILLAGERS[id].name}${VILLAGERS[id].bachelorette ? ' ♥' : ''}`, id));
    else if (node.type === 'item') { node.items.forEach((id) => btn(`${ITEMS[id].icon} ${ITEMS[id].name} ×${countItem(game, id)}`, id)); btn('Batal', null); }
    else if (node.type === 'animal') node.options.forEach((o) => btn(o.label, o.i));
  });
}

async function drainQueue() {
  for (let q = nextQueued(game); q; q = nextQueued(game)) {
    const run = startEvent(game, q.kind, q.id);
    if (run) await playEvent(run);
  }
}

async function playEvent(run) {
  if (!run) return;
  busy = true; modalOpen = true; eventRun = run; closeModal(); modalOpen = true;
  play('bell');
  $('fade').classList.add('on'); $('fadeText').textContent = run.kind === 'festival' ? `${FESTIVAL_DAYS[run.id].icon} ${FESTIVAL_DAYS[run.id].name}` : '💭';
  await new Promise((r) => setTimeout(r, 900));
  if (run.kind === 'festival') farmer.position.set(0, 0, 36);
  $('fade').classList.remove('on');
  let node = advanceEvent(run);
  while (node.type !== 'end') { const ans = await showNode(node); node = advanceEvent(run, ans); renderRucksack(); hud(); }
  await showNode({ type: 'say', who: '', text: node.text });
  dlg().classList.add('hidden');
  eventRun = null; modalOpen = false; busy = false;
  for (const m of actors.values()) m.userData.place = null;
  hud(); save();
  if (game.minute >= DAY_END) toast('Sudah malam… sebaiknya tidur.');
}

function checkEventTriggers() {
  if (busy || modalOpen || !game) return;
  const p = farmer.position;
  const fest = festivalActive(game);
  if (fest && p.distanceTo(PLACES.plaza) < 9) return playEvent(startEvent(game, 'festival', fest));
  for (const place of Object.keys(PLACES)) {
    if (place.startsWith('home') || p.distanceTo(PLACES[place]) > 3.8) continue;
    const fam = eligibleFamilyEvent(game, place);
    if (fam) return playEvent(startEvent(game, 'family', fam));
    const id = eligibleHeartEvent(game, place);
    if (id) return playEvent(startEvent(game, 'heart', id));
  }
}

function menu() {
  $('menu').classList.remove('hidden'); $('hud').classList.add('hidden');
  const list = $('slotList'); list.innerHTML = '';
  SAVE_KEYS.forEach((key, i) => {
    let info = 'Kosong';
    let old = false;
    try { const s = deserialize(localStorage.getItem(key)); info = `${s.name} — ${SEASONS[s.date.season]} ${s.date.day}, Tahun ${s.date.year}`; } catch { if (localStorage.getItem(key)) { info = 'Save versi lama (tidak kompatibel, akan ditimpa)'; old = true; } }
    const row = document.createElement('div'); row.className = 'slot-row';
    row.innerHTML = `<div><b>Slot ${i + 1}</b><br><small>${info}</small></div>`;
    const go = document.createElement('button'); go.className = 'btn';
    go.textContent = info === 'Kosong' || old ? 'Mulai Baru' : 'Lanjutkan';
    go.onclick = () => {
      slot = i;
      if (info === 'Kosong' || old) start(newGame($('nameInput').value.trim() || 'Petani')); else start(deserialize(localStorage.getItem(key)));
    };
    row.appendChild(go); list.appendChild(row);
  });
}

function save() {
  try { localStorage.setItem(SAVE_KEYS[slot], serialize(game)); } catch { toast('Gagal menyimpan'); }
}

function start(g) {
  game = g; busy = false;
  syncAll();
  farmer.position.copy(SPAWN);
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden');
  for (const m of actors.values()) m.userData.place = null;
  hud(); save();
}

// ---------------------------------------------------------------- ladang
// Tanah, tanaman, dan puing digambar langsung dari state game tiap frame; hanya hewan yang punya entitas sendiri.
const syncTile = () => {};
function syncAll() { syncAnimals(); }
function syncAnimals() {
  animalMeshes = game.animals.map((a, i) => {
    const m = makeEntity(); m.type = a.type;
    m.userData.home = { x: SPOTS.barn.x + 3.2 + (i % 4) * 1.4 * (a.type === 'cow' ? 1.6 : 1), z: SPOTS.barn.z + (a.type === 'cow' ? 2.6 : 0.8) + Math.floor(i / 4) };
    m.position.set(m.userData.home.x, 0, m.userData.home.z); m.userData.t = Math.random() * 10;
    return m;
  });
}
// Petak tepat di depan karakter (menghadap 4 arah, seperti game klasik).
const targetTile = () => { const [dx, dz] = DIRV[farmer.dir]; return { x: Math.floor(farmer.position.x + dx), z: Math.floor(farmer.position.z + dz) }; };

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
  farmer.tool = tool; swingTool(farmer);
  const r = useTool(game, tool, x, z);
  if (r.ok) {
    syncTile(x, z); hud(); advanceMinutes(game, 2);
    play('tool');
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
  farmer.tool = 'rod'; swingTool(farmer);
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
  if (game.dog && dog.visible && dog.position.distanceTo(p) < 2.2) { toast(petDog(game) ? `🐕 ${game.dog.name} senang diusap! ♥${game.dog.love}` : `${game.dog.name} sudah kamu elus hari ini.`); return; }
  if (kid.visible && kid.position.distanceTo(p) < 2.2) return toast(`👶 ${game.child.name}: ${{ baby: 'Bubu… ga!', toddler: 'Ayah/Ibu! Main!', kid: 'Hari ini aku bantu di ladang, ya!' }[childStage(game)]}`);
  for (const [id, m] of actors) if (m.visible && m.position.distanceTo(p) < 2.4) return villagerMenu(id);
  for (const [id, b] of Object.entries(BUILDINGS)) if (b.shop && p.distanceTo(doorOf(b)) < 2.8) return shopMenu(id);
  if (p.distanceTo(SPOTS.barn) < 4.5 || animalMeshes.some((m) => m.position.distanceTo(p) < 2.2)) return ranchMenu();
  const { x, z } = targetTile();
  if (isRipe(game.tilled[tileKey(x, z)])) {
    const r = harvest(game, x, z);
    if (r.ok) { swingTool(farmer); play('good'); syncTile(x, z); toast(`Panen ${r.got}!`); advanceMinutes(game, 2); hud(); } else toast(REASONS[r.reason] || 'Belum matang.');
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
      fn: () => { ship(game, s.id, 1); play('coin'); },
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
  fn: () => { const r = buy(game, id, 1); if (r === 'full') toast('Rucksack penuh'); else play('coin'); },
});

function shopMenu(id) {
  if (!isShopOpen(game, id)) return toast(`${SHOPS[id].name} tutup. ${shopStatus(id)}`);
  const title = `🏪 ${SHOPS[id].name}`, note = () => `Uangmu: ${game.gold} G`;
  const stock = {
    store: () => [...Object.entries(CROPS).filter(([cid]) => seedSeasonOk(game, `${cid}_seed`)).map(([cid, c]) => buyRow(`${cid}_seed`, `${c.icon} Benih ${c.name}`)), buyRow('blue_feather', '🪶 Bulu Biru (untuk melamar)')],
    carpenter: () => carpenterRows(),
    flower: () => [buyRow('flower', '🌹 Bunga Mawar'), buyRow('sunflower', '🌻 Bunga Matahari')],
    clinic: () => [buyRow('herb', '🍵 Jamu (+40 stamina)')],
    inn: () => [buyRow('meal_rice', '🍚 Nasi Hangat'), buyRow('meal_soup', '🍲 Sup Ayam'), buyRow('cake', '🍰 Kue Cokelat')],
    smith: () => smithRows(),
  }[id];
  openLoop(title, stock, note());
}

function carpenterRows() {
  const rows = [buyRow('wood', '🪵 Kayu'), buyRow('stone', '🪨 Batu')];
  const next = HOUSE_LEVELS[game.house + 1];
  if (game.build) rows.push({ label: `🔨 Membangun: ${HOUSE_LEVELS[game.build.level].name}`, hint: 'selesai beberapa hari lagi', disabled: true });
  else if (next) rows.push({
    label: `🏠 Perbesar rumah → ${next.name}`, hint: `${next.gold} G · ${next.wood} kayu · ${next.stone} batu · ${next.days} hari`, close: false,
    fn: () => { const r = orderHouse(game); toast({ ok: `Dipesan! Selesai ${next.days} hari lagi.`, gold: 'Uang kurang.', material: 'Kayu/batu kurang.', busy: 'Masih ada pembangunan.' }[r] || '…'); },
  });
  else rows.push({ label: 'Rumahmu sudah sebesar-besarnya', disabled: true });
  return rows;
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
  const spouse = game.spouse?.id === id ? (game.spouse.married ? 'Pasangan' : 'Tunangan') : null;
  const proposeRow = () => (v.bachelorette && !game.spouse ? [{ label: '💍 Beri Bulu Biru (melamar)', close: false, fn: () => {
    const r = propose(game, id);
    lines = { ok: `${v.name} menerima lamaranmu! Pernikahan ${3} hari lagi di alun-alun (tepat pukul 10:00–16:00).`, hearts: 'Hatinya belum cukup (butuh hati merah penuh).', house: 'Perbesar rumahmu dulu di Tukang Kayu.', feather: 'Kamu belum punya Bulu Biru (dijual di Toko Serba Ada).', taken: 'Kamu sudah bertunangan.' }[r] || '…';
    if (r === 'ok') said = { text: 'Aku… mau. Aku mau, dengan senang hati.' };
    renderRucksack(); main();
  } }] : []);
  const main = () => draw(`“${said.text}” ${lines ? `\n(${lines})` : ''}`, [
    { label: '🎁 Beri hadiah', close: false, fn: () => giftList() },
    ...proposeRow(),
    { label: `📋 ${spouse ? `💞 ${spouse}` : v.role}`, disabled: true },
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

function reportPanel() {
  const r = computeEnding(game);
  showModal(`🏁 Rapor Desa — ${r.rank}`, r.cats.map((c) => ({ label: c.label, hint: `${c.points}/${c.max} · ${c.note}`, disabled: true })), `Nilai ${r.score}/${r.max}`);
}

function villagersPanel() {
  showModal('🏘️ Warga Desa', [...Object.entries(VILLAGERS).map(([id, v]) => ({ label: `${v.name}`, hint: `${HEART_NAMES[hearts(game, id)]} · ${friendship(game, id)}/255${game.spouse?.id === id ? ' 💍' : ''}`, disabled: true })),
    { label: '🏁 Rapor Desa', fn: () => setTimeout(reportPanel, 0) }],
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
    farmer.position.copy(passedOut ? DOOR.clone().add(new Vec(0, 0, 1.5)) : SPAWN);
    save(); hud();
    $('fadeText').textContent = `${SEASONS[game.date.season]} ${game.date.day} · ${r.weekday}`;
    setTimeout(() => { $('fade').classList.remove('on'); busy = false; toast(`Hari baru! Cuaca: ${WEATHER_NAME[game.weather]}`); if (r.family?.chores) setTimeout(() => toast(`💞 Pasanganmu menyiram ${r.family.chores} tanaman dan menyiapkan bekal`), 900); setTimeout(drainQueue, 1600); }, 1400);
  }, 1000);
}

// ----------------------------------------------------------------- input
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase(); keys.add(k);
  if (KEYDIR[k] && !dirStack.includes(k)) dirStack.push(k);
  if (!game) return;
  if (eventResolve && (k === ' ' || k === 'e' || k === 'enter')) { e.preventDefault(); return eventResolve(); }
  if (eventRun) return;
  if (k === 'escape') { if (modalOpen) return closeModal(); save(); toggleRucksack(false); return menu(); }
  if (k === ' ') { e.preventDefault(); action(); }
  else if (k === 'e') interact();
  else if (modalOpen) return;
  else if (k === 'q') { tool = TOOL_ORDER[(TOOL_ORDER.indexOf(tool) + 1) % TOOL_ORDER.length]; hud(); }
  else if (k === 'i') toggleRucksack();
  else if (k === 'v') villagersPanel();
  else if (k === 'm') toast(toggleMute() ? '🔇 Suara dimatikan' : '🔊 Suara menyala');
});
addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); keys.delete(k); const i = dirStack.indexOf(k); if (i >= 0) dirStack.splice(i, 1); });
addEventListener('resize', () => renderer.resize());

function updateFamily(dt, time) {
  const yard = PLACES.farm_yard;
  dog.visible = !!game.dog;
  if (game.dog) {
    const a = time * 0.6;
    dog.position.set(SPOTS.doghouse.x - 0.6 + Math.cos(a) * 1.4, 0, SPOTS.doghouse.z + 1.6 + Math.sin(a * 1.3) * 0.9);
    dog.dir = -Math.sin(a) < 0 ? 'left' : 'right'; dog.userData.t = time;
  }
  const stage = childStage(game);
  kid.visible = !!stage && !(game.minute < 7 * 60 || game.minute > 20 * 60) && game.weather !== 'rain';
  if (stage) {
    kid.scale = stage === 'baby' ? 0.45 : stage === 'toddler' ? 0.6 : 0.78;
    const a = time * (stage === 'baby' ? 0.1 : 0.4);
    const nx = yard.x - 0.8 + Math.cos(a) * (stage === 'baby' ? 0.2 : 1.4), nz = yard.z + 1.8 + Math.sin(a) * (stage === 'baby' ? 0.2 : 0.9);
    kid.dir = dirOf(nx - kid.position.x, nz - kid.position.z); kid.position.set(nx, 0, nz);
    animatePerson(kid, dt, stage === 'baby' ? 0 : 1.2);
  }
}

function updateActors(dt) {
  for (const [id, m] of actors) {
    const place = locationOf(id, game), tgt = PLACES[place].clone().add(m.userData.offset);
    if (m.userData.place === null) m.position.copy(tgt);            // muncul langsung di tempatnya
    m.userData.place = place;
    const d = tgt.clone().sub(m.position); d.y = 0;
    const dist = d.length();
    let sp = 0;
    if (dist > 0.15) { sp = Math.min(dist / dt, id === 'dewi' ? 3.4 : 2.6); d.normalize(); m.position.addScaledVector(d, sp * dt); world.collide(m.position, 0); m.dir = dirOf(d.x, d.z); }
    m.visible = !(place.startsWith('home') && dist < 0.5);           // di dalam rumah
    animatePerson(m, dt, sp);
  }
}

// ------------------------------------------------------------------ loop
let last = performance.now();
const KEYDIR = { w: 'up', arrowup: 'up', s: 'down', arrowdown: 'down', a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right' };
const dirStack = [];   // urutan tombol arah yang sedang ditahan; yang terakhir menentukan arah jalan
const heldDir = () => { for (let i = dirStack.length - 1; i >= 0; i--) if (keys.has(dirStack[i])) return KEYDIR[dirStack[i]]; return null; };
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min((now - last) / 1000, 0.05)); last = now;   // frame pertama bisa punya selisih negatif
  let speed = 0;
  if (game && $('menu').classList.contains('hidden')) {
    if (!busy && !modalOpen) {
      const dir = heldDir();                    // 4 arah saja: tombol arah yang terakhir ditekan
      if (dir) {
        const [dx, dz] = DIRV[dir];
        const exhausted = fatigue(game) === 'exhausted' || fatigue(game) === 'collapse';
        speed = (keys.has('shift') ? 6.5 : 4.2) * (exhausted ? 0.6 : 1);
        farmer.position.x += dx * speed * dt; farmer.position.z += dz * speed * dt;
        world.collide(farmer.position, 0.35, game);
        farmer.dir = dir;
      }
      const r = advanceMinutes(game, dt / REAL_SECONDS_PER_MINUTE);
      if (r.passedOut) goToSleep(true);
      else if (r.late && !game.flags.lateWarned) { game.flags.lateWarned = true; toast('Sudah lewat tengah malam… sebaiknya tidur.'); }
      if (game.minute < DAY_END) game.flags.lateWarned = false;
    }
    animatePerson(farmer, dt, speed);
    updateFishing(dt);
    checkEventTriggers();
    updateActors(dt);
    updateFamily(dt, now / 1000);
    for (const m of animalMeshes) { m.userData.t += dt; const nx = m.userData.home.x + Math.sin(m.userData.t * 0.5) * 0.6; m.dir = nx < m.position.x ? 'left' : 'right'; m.position.x = nx; }
    const t = targetTile(), tk = tileKey(t.x, t.z);
    const markerOn = (inField(t.x, t.z) || !!game.debris[tk]) && !busy && !modalOpen;
    const p = farmer.position;
    const label = p.distanceTo(DOOR) < 2.4 ? 'E — Rumah (tidur, masak, TV)' : p.distanceTo(SPOTS.bin) < 2.6 ? 'E — Kotak Pengiriman'
      : (game.dog && dog.visible && dog.position.distanceTo(p) < 2.2) || (kid.visible && kid.position.distanceTo(p) < 2.2) ? 'E — Elus / sapa' : [...actors].some(([, m]) => m.visible && m.position.distanceTo(p) < 2.4) ? 'E — Bicara' : Object.values(BUILDINGS).some((b) => b.shop && p.distanceTo(doorOf(b)) < 2.8) ? 'E — Masuk toko' : (p.distanceTo(SPOTS.barn) < 4.5 || animalMeshes.some((m) => m.position.distanceTo(p) < 2.2)) ? 'E — Peternakan'
      : isRipe(game.tilled[tk]) ? 'E — Panen' : fishing ? (fishing.bite ? '❗ Spasi sekarang!' : '🎣 Menunggu…') : (tool === 'rod' && nearPond()) ? 'Spasi — Lempar pancing' : '';
    $('prompt').classList.toggle('hidden', !label || modalOpen);
    $('prompt').textContent = label;
    saveTimer += dt; if (saveTimer > 30) { saveTimer = 0; save(); }
    if (Math.floor(game.minute) % 5 === 0 || speed) hud();
    renderer.draw(dt, { game, world, farmer, actors: [...actors.values()], animals: animalMeshes, dog, kid, marker: markerOn ? t : null, fishing, fireworks: eventRun?.id === 'fireworks' });
  } else {
    renderer.cam.set(0, 0, 5);
    renderer.draw(dt, { game: PREVIEW, world, farmer: { position: renderer.cam, dir: 'down', scale: 1, style: farmer.style, userData: { phase: 0, swing: 0, moving: false }, visible: false }, actors: [], animals: [], dog: null, kid: null, marker: null, fishing: null, fireworks: false });
  }
}
// Latar menu utama: pemandangan ladang pagi hari
const PREVIEW = { date: { year: 1, season: 0, day: 1 }, minute: 9 * 60, weather: 'sunny', tilled: {}, debris: {} };
$('toolBtn').onclick = () => { tool = TOOL_ORDER[(TOOL_ORDER.indexOf(tool) + 1) % TOOL_ORDER.length]; hud(); };
$('bagBtn').onclick = () => toggleRucksack();
menu();
requestAnimationFrame(frame);
if (new URLSearchParams(location.search).has('debug')) window.__bb = { get game() { return game; }, farmer, cam, syncAll, actors };   // hook untuk skrip uji
