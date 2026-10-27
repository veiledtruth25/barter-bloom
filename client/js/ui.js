import {
  ITEMS, CROPS, ANIMALS, SEASONS, WEATHER, TOOLS, BARN_LEVELS, HOUSE_LEVELS, MAX_LISTINGS, PREMIUM_AFFECTION, MAX_AFFECTION,
  PLOT_CENTERS, plotLayout, TOWN, FIELD_W, FIELD_H, WORLD_BOUNDS, formatTime, DAYS_PER_SEASON, SHOPS, shopOpen, shopHours,
  TOOL_LEVELS, UPGRADABLE_TOOLS, CAN_CAPACITY, TOOL_EFFECT, FESTIVALS, festivalOf, FESTIVAL_GATHER,
} from '/shared/defs.js';
import {
  VILLAGERS, VILLAGER_IDS, HEART, MAX_FRIENDSHIP, PERK_HEARTS, hearts, isBirthday, dayIndexOf, perkActive, shopPrice,
  upgradeGold, CANDIDATES, GODDESS, GODDESS_BERRIES, arrivalTime, FEST_POINTS,
} from '/shared/villagers.js';

let G = null;
const $ = (id) => document.getElementById(id);

// Tiny DOM builder: h('div', { class: 'x', onclick }, child, 'text').
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

const fmt = (n) => Math.floor(n).toLocaleString('id-ID');
const itemName = (id) => ITEMS[id]?.name || id;
const itemIcon = (id) => ITEMS[id]?.icon || '❓';
const seasonId = () => SEASONS[G.time.season].id;
const toolDef = (id) => TOOLS.find((t) => t.id === id);

// Today's festival (or null) and whether its activities are running right now.
export function todayFestival() { return festivalOf(G.time.season, G.time.day); }
const festivalKey = (fest) => `${fest.id}-${dayIndexOf(G.time)}`;
export function festivalLive(fest = todayFestival(), minute = G.minute()) {
  return !!fest && minute >= fest.start && minute < fest.end;
}

// The next festival within `days` days: { fest, days }.
function upcomingFestival(days = 3) {
  for (let d = 1; d <= days; d++) {
    let day = G.time.day + d, season = G.time.season;
    if (day > DAYS_PER_SEASON) { day -= DAYS_PER_SEASON; season = (season + 1) % 4; }
    const fest = festivalOf(season, day);
    if (fest) return { fest, days: d };
  }
  return null;
}

const shopIsOpen = (sid) => shopOpen(sid, G.minute(), todayFestival());

export function initUI(game) {
  G = game;
  buildHotbar();
  for (const b of document.querySelectorAll('[data-open]')) {
    b.addEventListener('click', () => openPanel(b.dataset.open));
  }
  $('muteBtn').addEventListener('click', () => {
    G.sfx.muted = !G.sfx.muted;
    $('muteBtn').textContent = G.sfx.muted ? '🔇' : '🔊';
  });
  $('festItem').addEventListener('click', () => {
    if (festivalLive()) openPanel('festival');
    else openPanel('villagers', { tab: 'calendar' });
  });
}

// ------------------------------------------------------------------- toasts

export function toast(text, kind = 'info') {
  const t = h('div', { class: `toast ${kind}` }, text);
  $('toasts').append(t);
  setTimeout(() => t.remove(), 3400);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
}

export function feed(text) {
  const t = h('div', { class: 'feed-line' }, text);
  $('feed').append(t);
  setTimeout(() => t.remove(), 6000);
  while ($('feed').children.length > 3) $('feed').firstChild.remove();
}

// --------------------------------------------------------------------- HUD

function buildHotbar() {
  const bar = $('hotbar');
  bar.innerHTML = '';
  for (const t of TOOLS) {
    const s = h('div', { class: 'slot', 'data-tool': t.id, title: `${t.name} — ${t.desc}`, onclick: () => G.selectTool(t.id) },
      h('span', { class: 'key' }, t.key), h('span', { class: 'ico' }, t.icon), h('span', { class: 'qty' }), h('span', { class: 'sub' }),
      h('span', { class: 'lvl hidden' }));
    bar.append(s);
  }
}

export function updateHotbar() {
  for (const s of document.querySelectorAll('.slot')) {
    const id = s.dataset.tool;
    s.classList.toggle('active', G.tool === id);
    const qty = s.querySelector('.qty');
    const sub = s.querySelector('.sub');
    if (UPGRADABLE_TOOLS.includes(id) && G.self) {
      // Tool level badge (Cu / Ag / Au); a tool left at the forge cannot be used.
      const lv = G.self.tools?.[id] || 0;
      const L = TOOL_LEVELS[lv];
      const badge = s.querySelector('.lvl');
      badge.textContent = L.short;
      badge.style.background = L.color;
      badge.classList.toggle('hidden', !lv);
      const forging = G.self.forge?.tool === id;
      s.classList.toggle('forging', forging);
      s.title = forging ? `${toolDef(id).name} sedang ditempa Pak Bejo — siap besok pagi`
        : `${toolDef(id).name}${lv ? ` ${L.name}` : ''} — ${toolDef(id).desc} (${TOOL_EFFECT[id][lv]})`;
    }
    if (id === 'can') qty.textContent = G.self ? G.self.water : '';
    if (id === 'hand') {
      const it = G.selectedItem && G.self?.inv[G.selectedItem] ? G.selectedItem : null;
      if (!it) G.selectedItem = null;
      s.querySelector('.ico').textContent = it ? itemIcon(it) : '✋';
      sub.textContent = it && ITEMS[it].type === 'seed' ? CROPS[ITEMS[it].crop].icon : '';
      qty.textContent = it ? G.self.inv[it] : '';
      s.title = it ? `Memegang ${itemName(it)} — tekan Spasi untuk menanam/memakai` : 'Tangan — panen & ambil barang';
    }
  }
}

let lastGold = null;
export function updateHud() {
  const s = G.self;
  if (!s) return;
  if (lastGold !== null && s.gold !== lastGold) {
    const card = document.querySelector('.gold-card');
    card.classList.remove('flash');
    void card.offsetWidth;
    card.classList.add('flash');
  }
  lastGold = s.gold;
  $('goldText').textContent = fmt(s.gold);
  const pct = (s.stamina / s.maxStamina) * 100;
  const bar = $('staminaBar');
  bar.style.width = `${pct}%`;
  bar.className = `bar-fill stamina ${pct < 25 ? 'low' : pct < 55 ? 'mid' : ''}`;
  $('staminaText').textContent = `${s.stamina}/${s.maxStamina}`;
  const face = pct > 75 ? '😊' : pct > 50 ? '🙂' : pct > 25 ? '😓' : pct > 0 ? '😵' : '💀';
  if ($('faceIcon').textContent !== face) {
    $('faceIcon').textContent = face;
    $('faceIcon').classList.remove('bump');
    void $('faceIcon').offsetWidth;
    $('faceIcon').classList.add('bump');
  }
  const cap = CAN_CAPACITY[s.tools?.can || 0];
  $('waterBar').style.width = `${(s.water / cap) * 100}%`;
  $('waterText').textContent = `${s.water}/${cap}`;
  updateHotbar();
}

export function updateClock(minute) {
  const t = G.time;
  const season = SEASONS[t.season];
  $('seasonIcon').textContent = season.icon;
  $('seasonIcon').className = `season-badge ${season.id}`;
  $('dateText').textContent = `${season.name}, Hari ${t.day}`;
  $('yearText').textContent = `Tahun ${t.year} · ${DAYS_PER_SEASON - t.day} hari lagi`;
  $('clockText').textContent = formatTime(minute);
  $('clockText').classList.toggle('late', minute >= 24 * 60);
  $('weatherText').textContent = `${WEATHER[t.weather].icon} ${WEATHER[t.weather].name} · Besok ${WEATHER[t.tomorrow].icon}`;
  const hot = t.hot;
  $('hotItem').classList.toggle('hidden', !hot);
  if (hot) {
    const price = G.market?.prices?.[hot]?.price;
    $('hotItem').replaceChildren(h('span', { class: 'flame' }, '🔥'), h('span', {}, 'Permintaan tinggi: ', h('b', {}, `${itemIcon(hot)} ${itemName(hot)}`), price ? ` · ${price}G` : ''));
  }
  // Festival of the day (or one coming up soon) under the date.
  const fest = todayFestival();
  const today = fest && minute < fest.end ? fest : null;
  const soon = today ? null : upcomingFestival(3);
  const live = festivalLive(today, minute);
  const key = today ? `${today.id}|${live}` : soon ? `${soon.fest.id}|${soon.days}` : '';
  const fi = $('festItem');
  if (fi.dataset.k !== key) {
    fi.dataset.k = key;
    fi.classList.toggle('hidden', !key);
    fi.classList.toggle('live', live);
    if (today) {
      fi.replaceChildren(h('span', { class: 'flame' }, today.icon), h('span', {}, h('b', {}, today.name), live
        ? ' sedang berlangsung di alun-alun! Klik untuk ikut.'
        : ` hari ini ${formatTime(today.start)}–${formatTime(today.end)} di alun-alun`));
    } else if (soon) {
      const when = soon.days === 1 ? 'besok' : soon.days === 2 ? 'lusa' : `${soon.days} hari lagi`;
      fi.replaceChildren(h('span', {}, soon.fest.icon), h('span', {}, h('b', {}, soon.fest.name), ` ${when} · ${formatTime(soon.fest.start)}`));
    }
  }
}

export function showPrompt(text) {
  const p = $('prompt');
  if (!text) { p.classList.add('hidden'); p.dataset.t = ''; return; }
  if (p.dataset.t === text) return;
  p.dataset.t = text;
  p.classList.remove('hidden');
  p.replaceChildren(h('kbd', {}, 'E'), text);
}

export function fishMeter(state) {
  const m = $('fishMeter');
  m.classList.toggle('hidden', !state);
  m.classList.toggle('bite', state === 'bite');
  if (state === 'wait') m.textContent = '🎣 Menunggu ikan menggigit…';
  if (state === 'bite') m.textContent = '❗ TARIK! (Spasi)';
}

// -------------------------------------------------------------------- chat

export function addChat(name, color, text, sys = false) {
  const line = sys ? h('div', { class: 'chat-line sys' }, text)
    : h('div', { class: 'chat-line' }, h('b', { style: `color:${color}` }, name), ': ', text);
  const log = $('chatLog');
  log.append(line);
  log.scrollTop = log.scrollHeight;
  setTimeout(() => line.classList.add('faded'), 15000);
  while (log.children.length > 60) log.firstChild.remove();
}

// ----------------------------------------------------------------- minimap

export function drawMinimap() {
  const c = $('minimap');
  const g = c.getContext('2d');
  const B = WORLD_BOUNDS;
  const sx = c.width / (B.x1 - B.x0), sz = c.height / (B.z1 - B.z0);
  const X = (x) => (x - B.x0) * sx, Z = (z) => (z - B.z0) * sz;
  const grass = { spring: '#8fd16a', summer: '#6fbf4f', fall: '#c2b25a', winter: '#e8eef2' }[seasonId()];
  g.fillStyle = grass;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = 'rgba(40,80,30,0.35)';
  g.fillRect(X(-58), Z(-15), 28 * sx, 30 * sz);
  g.fillRect(X(34), Z(-15), 24 * sx, 30 * sz);
  g.fillStyle = '#d8b98a';
  g.fillRect(0, Z(-1.6), c.width, 3.2 * sz);
  g.fillRect(0, Z(-21), c.width, 2.4 * sz);
  g.fillRect(0, Z(18), c.width, 2.4 * sz);
  g.fillStyle = '#4aa3df';
  g.beginPath(); g.arc(X(TOWN.pond.x), Z(TOWN.pond.z), TOWN.pond.r * sx, 0, 7); g.fill();
  g.fillStyle = '#cfc6b4';
  g.beginPath(); g.arc(X(0), Z(0), 9 * sx, 0, 7); g.fill();
  for (const b of [TOWN.store, TOWN.market]) {
    g.fillStyle = b === TOWN.store ? '#3f8f5a' : '#c4553b';
    g.fillRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), b.w * sx, b.d * sz);
  }
  g.fillStyle = '#8a6a9a';
  for (const b of Object.values(TOWN.houses)) g.fillRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), b.w * sx, b.d * sz);
  // The Harvest Goddess' spring.
  g.fillStyle = '#7fe0c8';
  g.beginPath(); g.arc(X(TOWN.spring.x), Z(TOWN.spring.z), Math.max(3, TOWN.spring.r * sx), 0, 7); g.fill();
  g.fillStyle = '#7a3a2a';
  g.fillRect(X(TOWN.board.x) - 2, Z(TOWN.board.z) - 3, 4, 6);
  for (let i = 0; i < PLOT_CENTERS.length; i++) {
    const L = plotLayout(i);
    const plot = G.plots[i];
    const mine = plot?.ownerId === G.self?.id;
    g.fillStyle = mine ? '#8a5a32' : '#a8805a';
    g.fillRect(X(L.ox), Z(L.oz), FIELD_W * sx, FIELD_H * sz);
    if (mine) {
      g.strokeStyle = '#ffe066'; g.lineWidth = 2;
      g.strokeRect(X(L.ox) - 1, Z(L.oz) - 1, FIELD_W * sx + 2, FIELD_H * sz + 2);
    }
    g.fillStyle = plot?.color || '#888';
    g.fillRect(X(L.house.x - 3), Z(L.house.z - 2.5), 6 * sx, 5 * sz);
  }
  // Villagers as small squares, players as circles on top.
  for (const n of G.villagers?.list.values() || []) {
    if (!n.avatar.visible) continue;
    g.fillStyle = n.def.color;
    g.strokeStyle = '#3b2e1e';
    g.lineWidth = 1;
    g.fillRect(X(n.avatar.position.x) - 2.5, Z(n.avatar.position.z) - 2.5, 5, 5);
    g.strokeRect(X(n.avatar.position.x) - 2.5, Z(n.avatar.position.z) - 2.5, 5, 5);
  }
  for (const p of G.players.values()) {
    if (!p.info.online) continue;
    const me = p.info.id === G.self?.id;
    const pos = me ? G.me.position : p.avatar.position;
    g.fillStyle = p.info.color;
    g.strokeStyle = '#fff';
    g.lineWidth = me ? 2.5 : 1.5;
    g.beginPath(); g.arc(X(pos.x), Z(pos.z), me ? 4.5 : 3.5, 0, 7); g.fill(); g.stroke();
  }
}

// ------------------------------------------------------------------ panels

let current = null;
const PANELS = {};

// Panel fields may be plain values or functions of the open panel.
const val = (v) => (typeof v === 'function' ? v(current) : v);

export function openPanel(id, args = {}) {
  const def = PANELS[id];
  if (!def || !G.self) return;
  if (current?.id === 'trade' && id !== 'trade' && G.trade) return;
  if (current && current.id !== id) PANELS[current.id].onClose?.(true);
  current = { id, tab: null, state: def.init ? def.init(args) : {}, args };
  const tabs = val(def.tabs);
  current.tab = tabs?.some(([t]) => t === args.tab) ? args.tab : tabs?.[0][0] ?? null;
  G.sfx.play('open');
  G.uiOpen = true;
  render();
}

export function closePanel(force = false) {
  if (!current) return;
  const def = PANELS[current.id];
  if (def.onClose && def.onClose(force) === false && !force) return;
  current = null;
  G.uiOpen = false;
  $('modalRoot').innerHTML = '';
  G.sfx.play('close');
}

export function panelOpen(id) { return current && (!id || current.id === id); }

export function refreshPanel(...ids) {
  if (!current) return;
  if (ids.length && !ids.includes(current.id)) return;
  render();
}

function render() {
  const def = PANELS[current.id];
  const root = $('modalRoot');
  if (def.custom) {
    root.replaceChildren(h('div', { class: 'modal-backdrop clear', onclick: () => def.onBackdrop?.() }), def.render(current));
    return;
  }
  const oldBody = root.querySelector('.modal-body');
  const scroll = oldBody ? oldBody.scrollTop : 0;
  const focusKey = document.activeElement?.dataset?.key;
  const selStart = document.activeElement?.selectionStart;
  const title = val(def.title);
  const sub = val(def.sub);
  const tabs = val(def.tabs);
  const modal = h('div', { class: `modal ${def.small ? 'small' : ''}` },
    h('div', { class: 'modal-head' },
      h('div', { class: 'modal-icon' }, val(def.icon)),
      h('div', { class: 'modal-title' }, title, sub ? h('small', {}, sub) : null),
      def.noClose ? null : h('button', { class: 'modal-close', onclick: () => closePanel() }, '✕')),
    tabs?.length > 1 ? h('div', { class: 'tabs' }, tabs.map(([tid, label]) => h('button', {
      class: `tab ${current.tab === tid ? 'active' : ''}`,
      onclick: () => { current.tab = tid; G.sfx.play('click'); render(); },
    }, typeof label === 'function' ? label() : label))) : null,
    h('div', { class: 'modal-body' }, def.render(current)));
  root.replaceChildren(h('div', { class: 'modal-backdrop', onclick: () => !def.noClose && closePanel() }), modal);
  const body = root.querySelector('.modal-body');
  body.scrollTop = scroll;
  if (focusKey) {
    const el = root.querySelector(`[data-key="${focusKey}"]`);
    if (el) {
      el.focus();
      try { if (selStart != null) el.setSelectionRange(selStart, selStart); } catch { /* number inputs */ }
    }
  }
  // Keep entrance animations only for the first render.
  if (oldBody) modal.style.animation = 'none';
  if (oldBody) for (const el of modal.querySelectorAll('.item-card, tr.data, .player-row')) el.style.animation = 'none';
}

function stepper(state, key, max, min = 1) {
  if (state[key] === undefined) state[key] = min;
  state[key] = Math.max(min, Math.min(max, state[key]));
  const input = h('input', {
    type: 'number', min, max, value: state[key], 'data-key': key,
    oninput: (e) => { state[key] = Math.max(min, Math.min(max, Math.floor(Number(e.target.value) || min))); },
    onchange: () => render(),
  });
  return h('div', { class: 'stepper' },
    h('button', { onclick: () => { state[key] = Math.max(min, state[key] - 1); render(); } }, '−'),
    input,
    h('button', { onclick: () => { state[key] = Math.min(max, state[key] + 1); render(); } }, '+'));
}

function emptyState(icon, text) {
  return h('div', { class: 'empty' }, h('span', { class: 'big' }, icon), text);
}

function req(ev, data, after) {
  return G.request(ev, data).then((r) => { if (r?.ok && after) after(r); return r; });
}

function invEntries(filter = () => true) {
  const order = ['crop', 'animal', 'fish', 'forage', 'seed', 'food', 'medicine', 'feed', 'material', 'ore', 'special'];
  return Object.entries(G.self.inv)
    .filter(([id, q]) => q > 0 && ITEMS[id] && filter(id, ITEMS[id]))
    .sort((a, b) => order.indexOf(ITEMS[a[0]].type) - order.indexOf(ITEMS[b[0]].type) || ITEMS[a[0]].name.localeCompare(ITEMS[b[0]].name));
}

function shipPrice(id) { return G.market?.prices?.[id]?.price || 0; }

// ------------------------------------------------------------- inventory

PANELS.inventory = {
  icon: '🎒', title: 'Tas', sub: () => 'Klik barang untuk memegangnya (slot ✋ / tombol 7)',
  tabs: [['all', 'Semua'], ['crop', 'Hasil'], ['seed', 'Benih'], ['other', 'Lainnya']],
  render(cur) {
    const filt = {
      all: () => true,
      crop: (_, it) => ['crop', 'animal', 'fish', 'forage'].includes(it.type),
      seed: (_, it) => it.type === 'seed',
      other: (_, it) => !['crop', 'animal', 'fish', 'forage', 'seed'].includes(it.type),
    }[cur.tab];
    const list = invEntries(filt);
    if (!list.length) return emptyState('🍃', 'Tas kosong di kategori ini.');
    return h('div', { class: 'grid' }, list.map(([id, q], i) => {
      const it = ITEMS[id];
      const seasonOk = it.type !== 'seed' || it.season === seasonId();
      const edible = it.eat || id === 'power_berry';
      return h('div', { class: `item-card ${G.selectedItem === id ? 'selected' : ''}`, style: `animation-delay:${i * 20}ms`, title: it.desc || '' },
        h('div', { class: 'item-qty' }, `×${q}`),
        h('div', { class: 'item-icon' }, it.icon, it.cropIcon ? h('small', {}, it.cropIcon) : null),
        h('div', { class: 'item-name' }, it.name),
        h('div', { class: 'item-meta' }, it.sell ? h('span', { class: 'price' }, `Jual ${shipPrice(id)}G`) : 'Tidak bisa dikirim',
          it.eat === 999 ? ' · ⚡ penuh' : it.eat ? ` · +${it.eat}⚡` : '', it.type === 'seed' ? ` · ${SEASONS.find((s) => s.id === it.season).icon}${seasonOk ? '' : ' (bukan musimnya)'}` : ''),
        it.desc ? h('div', { class: 'item-meta' }, it.desc) : null,
        h('div', { class: 'row' },
          h('button', { class: 'btn small primary', onclick: () => { G.holdItem(id); closePanel(); } }, 'Pegang'),
          edible ? h('button', { class: 'btn small gold', onclick: () => req('eat', { item: id }) }, 'Makan') : null));
    }));
  },
};

// ----------------------------------------------------------------- shops

// Every shop is run by its villager, who is only behind the counter during opening hours
// (and away at the plaza while a festival runs).
const SHOP_TABS = {
  store: [['seed', '🌱 Benih'], ['goods', '🛍️ Kebutuhan']],
  ranch: [['animal', '🐔 Ternak'], ['goods', '🌽 Pakan']],
  carpenter: [['build', '🏗️ Bangunan'], ['goods', '🪵 Material']],
  forge: [['forge', '⚒️ Tempa Alat']],
  kedai: [['goods', '🍲 Menu']],
  clinic: [['goods', '💊 Obat'], ['checkup', '🩺 Periksa']],
};
export const SHOP_ACTION = {
  store: 'Belanja', ranch: 'Beli ternak & pakan', carpenter: 'Pesan bangunan', forge: 'Tempa alat', kedai: 'Pesan makanan', clinic: 'Berobat',
};
const SHOP_INFO = {
  store: 'benih musiman, roti & Bulu Biru',
  ranch: 'ayam, sapi & pakan ternak',
  carpenter: 'memperbesar rumah & kandang, jual kayu & batu',
  forge: 'meningkatkan alat dengan emas & bijih logam',
  kedai: 'makanan pemulih stamina',
  clinic: 'periksa kesehatan gratis, jamu & ramuan',
};
const keeperName = (sid) => VILLAGERS[SHOPS[sid].npc].name;
const hasItems = (items) => Object.entries(items).every(([id, q]) => (G.self.inv[id] || 0) >= q);

function shopBanner(sid) {
  const s = SHOPS[sid];
  if (!shopIsOpen(sid)) {
    const fest = todayFestival();
    const m = G.minute();
    const festNow = fest && m >= s.open && m < s.close && m >= fest.start - FESTIVAL_GATHER && m < fest.end;
    return h('div', { class: 'banner closed' }, festNow
      ? `🔒 ${s.name} tutup selama ${fest.name} — ${keeperName(sid)} ikut merayakan di alun-alun.`
      : `🔒 ${s.name} sedang tutup. ${keeperName(sid)} melayani pukul ${shopHours(sid)}.`);
  }
  if (perkActive(G.self.rel, s.npc)) return h('div', { class: 'banner perk' }, `💝 Bonus sahabat ${keeperName(sid)}: ${VILLAGERS[s.npc].perk.text}`);
  return null;
}

function priceTag(sid, base) {
  const p = shopPrice(sid, base, G.self.rel);
  return p < base ? [h('s', { class: 'muted' }, `${fmt(base)}G`), ' ', `${fmt(p)}G`] : `${fmt(base)}G`;
}

function costLine(cost, gold = cost.gold) {
  const goldText = gold < cost.gold ? `${fmt(gold)}G (hemat ${fmt(cost.gold - gold)}G)` : `${fmt(gold)}G`;
  return [goldText, ...Object.entries(cost.items).map(([id, q]) => `${q} ${itemIcon(id)} (punya ${G.self.inv[id] || 0})`)].join(' + ');
}

const levelBadge = (L) => h('span', { class: 'lvl-badge', style: `background:${L.color}` }, L.short || '—');

PANELS.shop = {
  icon: (cur) => SHOPS[cur.state.shop].icon,
  title: (cur) => SHOPS[cur.state.shop].name,
  sub: (cur) => `${keeperName(cur.state.shop)} · buka ${shopHours(cur.state.shop)} · Uangmu: ${fmt(G.self.gold)}G`,
  init: (args) => ({ shop: SHOPS[args.shop] ? args.shop : 'store' }),
  tabs: (cur) => SHOP_TABS[cur.state.shop],
  render(cur) {
    const sid = cur.state.shop;
    const body = { seed: renderSeeds, goods: renderGoods, animal: renderAnimalShop, build: renderBuild, forge: renderForge, checkup: renderCheckup }[cur.tab];
    return h('div', { class: 'stack' }, shopBanner(sid), body(sid, cur.state));
  },
};

function goodsCard(sid, st, id, i) {
  const it = ITEMS[id];
  const key = `q_${id}`;
  const one = it.type === 'special';
  const qty = one ? 1 : st[key] || 1;
  const crop = it.crop ? CROPS[it.crop] : null;
  const meta = crop ? `${crop.days} hari${crop.regrow ? `, panen ulang ${crop.regrow} hari` : ''} · 3×3 petak · jual ${crop.sell}G`
    : it.eat === 999 ? 'Memulihkan seluruh stamina'
      : it.eat ? `Memulihkan ${it.eat} stamina`
        : it.type === 'feed' ? 'Pakan harian ternak'
          : it.desc || 'Bahan bangunan';
  const have = G.self.inv[id] || 0;
  return h('div', { class: 'item-card', style: `animation-delay:${i * 25}ms` },
    have ? h('div', { class: 'item-qty', title: 'Di tasmu' }, `🎒${have}`) : null,
    h('div', { class: 'item-icon' }, it.icon, it.cropIcon ? h('small', {}, it.cropIcon) : null),
    h('div', { class: 'item-name' }, it.name),
    h('div', { class: 'item-meta' }, meta),
    h('div', { class: 'price' }, priceTag(sid, it.buy)),
    h('div', { class: 'row' }, one ? null : stepper(st, key, 99),
      h('button', {
        class: 'btn small primary', disabled: !shopIsOpen(sid) || G.self.gold < shopPrice(sid, it.buy, G.self.rel) * qty,
        onclick: () => req('buy', { shop: sid, item: id, qty: one ? 1 : st[key] }, (r) => { toast(r.msg); G.sfx.play('coin'); }),
      }, 'Beli')));
}

function renderSeeds(sid, st) {
  const list = Object.keys(ITEMS).filter((id) => ITEMS[id].type === 'seed' && ITEMS[id].season === seasonId());
  if (!list.length) return emptyState('❄️', 'Tidak ada benih di musim dingin. Fokus pada ternak, memancing, menambang bijih & mencari barang di hutan!');
  return h('div', { class: 'grid' }, list.map((id, i) => goodsCard(sid, st, id, i)));
}

function renderGoods(sid, st) {
  return h('div', { class: 'grid' }, SHOPS[sid].items.map((id, i) => goodsCard(sid, st, id, i)));
}

function renderAnimalShop(sid, st) {
  const plot = G.plots[G.self.plotId];
  const lvl = BARN_LEVELS[plot.barnLevel];
  return h('div', { class: 'stack' },
    h('div', { class: 'muted' }, `${lvl.name}: muat ${lvl.chicken} ayam & ${lvl.cow} sapi — Mas Joko di Bengkel Kayu bisa memperbesarnya. Beri makan setiap hari agar ternak berproduksi. Kasih sayang ≥ ${PREMIUM_AFFECTION} menghasilkan produk premium!`),
    h('div', { class: 'grid' }, Object.entries(ANIMALS).map(([type, a]) => {
      const have = plot.animals.filter((x) => x.type === type).length;
      const full = have >= lvl[type];
      const key = `name_${type}`;
      return h('div', { class: `item-card ${full ? 'disabled' : ''}` },
        h('div', { class: 'item-icon' }, a.icon),
        h('div', { class: 'item-name' }, a.name),
        h('div', { class: 'item-meta' }, `Menghasilkan ${itemIcon(a.product)} ${itemName(a.product)} · makan ${itemIcon(a.feed)} ${itemName(a.feed)}`),
        h('div', { class: 'item-meta' }, `Di kandang: ${have}/${lvl[type]}`),
        h('div', { class: 'price' }, priceTag(sid, a.price)),
        h('input', { type: 'text', placeholder: 'Nama hewan', maxlength: 12, value: st[key] || '', 'data-key': key, oninput: (e) => { st[key] = e.target.value; }, style: 'width:100%' }),
        h('button', {
          class: 'btn small primary', disabled: full || !shopIsOpen(sid) || G.self.gold < shopPrice(sid, a.price, G.self.rel),
          onclick: () => req('buyAnimal', { type, name: st[key] }, (r) => { toast(r.msg, 'gold'); G.sfx.play('coin'); st[key] = ''; }),
        }, full ? 'Kandang penuh' : 'Beli'));
    })));
}

// Carpenter: house and barn extensions, finished overnight.
function renderBuild(sid) {
  const plot = G.plots[G.self.plotId];
  const job = plot.building;
  const card = (kind, icon, title, levels, lv, info) => {
    const next = levels[lv + 1];
    const gold = next ? upgradeGold(next.cost.gold, G.self.rel) : 0;
    return h('div', { class: 'item-card build-card' },
      h('div', { class: 'item-icon' }, icon),
      h('div', { class: 'item-name' }, `${title}: ${levels[lv].name}`),
      h('div', { class: 'item-meta' }, info(levels[lv])),
      job?.kind === kind ? h('div', { class: 'tag warn' }, `🏗️ ${levels[job.level].name} sedang dibangun — selesai besok pagi`)
        : next ? [
          h('div', { class: 'item-meta' }, h('b', {}, `➜ ${next.name}`), ` · ${info(next)}`),
          h('div', { class: 'price' }, costLine(next.cost, gold)),
          h('button', {
            class: 'btn small gold', disabled: !shopIsOpen(sid) || !!job || G.self.gold < gold || !hasItems(next.cost.items),
            onclick: () => req('build', { kind }, (r) => { toast(r.msg, 'gold'); G.sfx.play('trade'); }),
          }, '🔨 Bangun')]
          : h('div', { class: 'tag ok' }, 'Sudah paling besar ✨'));
  };
  return h('div', { class: 'stack' },
    h('div', { class: 'muted' }, 'Mas Joko mengerjakan satu bangunan sekaligus dan selesai keesokan paginya. Kayu & batu bisa dibeli di sini, atau dikumpulkan dengan Kapak dan Palu.'),
    h('div', { class: 'grid wide' },
      card('house', '🏠', 'Rumah', HOUSE_LEVELS, plot.houseLevel || 0,
        (l) => (l.stamina ? `Stamina maksimal +${l.stamina}${l === HOUSE_LEVELS[1] ? ' · syarat untuk menikah' : ''}` : 'Rumah awal yang mungil')),
      card('barn', '🏚️', 'Kandang', BARN_LEVELS, plot.barnLevel, (l) => `Muat ${l.chicken} ayam & ${l.cow} sapi`)));
}

// Blacksmith: tools are left overnight and come back one metal better.
function renderForge(sid) {
  const job = G.self.forge;
  return h('div', { class: 'stack' },
    job ? h('div', { class: 'banner perk' }, `🔥 Pak Bejo sedang menempa ${toolDef(job.tool).icon} ${toolDef(job.tool).name} ${TOOL_LEVELS[job.level].name}-mu. Ambil besok pagi!`) : null,
    h('div', { class: 'muted' }, 'Bawa emas dan 3 bijih logam. Bijih didapat dengan memecah batu memakai Palu — palu yang lebih kuat menemukan bijih yang lebih langka. Alat ditinggal semalam dan tidak bisa dipakai sampai selesai.'),
    h('div', { class: 'grid' }, UPGRADABLE_TOOLS.map((tool, i) => {
      const t = toolDef(tool);
      const lv = G.self.tools?.[tool] || 0;
      const next = TOOL_LEVELS[lv + 1];
      const busy = job?.tool === tool;
      return h('div', { class: `item-card tool-card ${busy ? 'disabled' : ''}`, style: `animation-delay:${i * 25}ms` },
        h('div', { class: 'item-icon' }, t.icon, levelBadge(TOOL_LEVELS[lv])),
        h('div', { class: 'item-name' }, `${t.name} ${TOOL_LEVELS[lv].name}`),
        h('div', { class: 'item-meta' }, TOOL_EFFECT[tool][lv]),
        busy ? h('div', { class: 'tag warn' }, '🔥 Sedang ditempa')
          : next ? [
            h('div', { class: 'item-meta' }, '➜ ', levelBadge(next), ` ${next.name}: ${TOOL_EFFECT[tool][lv + 1]}`),
            h('div', { class: 'price' }, costLine(next.cost)),
            h('button', {
              class: 'btn small gold', disabled: !shopIsOpen(sid) || !!job || G.self.gold < next.cost.gold || !hasItems(next.cost.items),
              onclick: () => req('forge', { tool }, (r) => { toast(r.msg, 'gold'); G.sfx.play('stone'); }),
            }, '⚒️ Tempa')]
            : h('div', { class: 'tag ok' }, 'Alat terbaik ✨'));
    })));
}

function renderCheckup(sid, st) {
  return h('div', { class: 'stack' },
    h('div', { class: 'muted' }, `${keeperName(sid)} memeriksa kesehatanmu secara gratis. Kalau kelelahan, minum Jamu Kuat atau Ramuan Ajaib.`),
    h('button', {
      class: 'btn primary', disabled: !shopIsOpen(sid),
      onclick: () => req('checkup', {}, (r) => { st.result = r.text; G.sfx.play('chat'); refreshPanel('shop'); }),
    }, '🩺 Periksa kesehatan (gratis)'),
    st.result ? h('div', { class: 'item-card', style: 'animation:none' }, h('div', { class: 'row' }, portrait(SHOPS[sid].npc), h('div', { style: 'flex:1' }, st.result))) : null);
}

// ------------------------------------------------------------------ ship

function courierBanner() {
  const s = G.self;
  const friend = perkActive(s.rel, 'danu');
  if (s.pickedUp) {
    return h('div', { class: `banner ${friend ? 'perk' : 'info'}` }, friend
      ? '🚚 Mas Danu sudah lewat hari ini, tapi sebagai sahabat ia tetap menghitung kiriman susulan — semuanya dibayar besok pagi.'
      : '🚚 Mas Danu sudah mengangkut kiriman hari ini. Barang yang dimasukkan sekarang ikut diangkut besok sore.');
  }
  const at = arrivalTime('danu', `bin${s.plotId}`, G.time.weather, G.time.rate, dayIndexOf(G.time));
  return h('div', { class: 'banner info' }, at === null
    ? '🚚 Mas Danu tidak berkeliling hari ini — isi kotak tetap dibayar besok pagi.'
    : `🚚 Mas Danu mengangkut isi kotak sekitar pukul ${formatTime(at)}; uangnya tiba besok pagi.`);
}

const chipsOf = (lines) => h('div', { class: 'row' }, lines.map(([id, q]) => h('span', { class: 'chip' }, `${itemIcon(id)} ×${q}`)));

PANELS.ship = {
  icon: '📦', title: 'Kotak Pengiriman', sub: 'Diangkut Mas Danu tiap sore, dibayar besok pagi sesuai harga pasar',
  render(cur) {
    const st = cur.state;
    const binLines = Object.entries(G.self.bin);
    const sent = Object.entries(G.self.shipped || {});
    const worth = (lines) => lines.reduce((s, [id, q]) => s + shipPrice(id) * q, 0);
    const list = invEntries((_, it) => it.sell > 0);
    return h('div', { class: 'stack' },
      courierBanner(),
      h('div', { class: 'item-card', style: 'animation:none' },
        h('div', { class: 'row spread' }, h('b', {}, '📦 Isi kotak'), h('span', { class: 'price' }, `≈ ${fmt(worth(binLines))}G`)),
        binLines.length ? chipsOf(binLines) : h('span', { class: 'muted' }, 'Masih kosong.')),
      sent.length ? h('div', { class: 'item-card', style: 'animation:none' },
        h('div', { class: 'row spread' }, h('b', {}, '🚚 Sudah diangkut Mas Danu'), h('span', { class: 'price' }, `≈ ${fmt(worth(sent))}G`)),
        chipsOf(sent)) : null,
      list.length ? h('table', { class: 'list' },
        h('tr', {}, h('th', {}, 'Barang'), h('th', {}, 'Harga'), h('th', {}, 'Jumlah'), h('th', {})),
        list.map(([id, q], i) => {
          const key = `s_${id}`;
          if (st[key] === undefined) st[key] = q;
          const trend = G.market.prices[id]?.trend;
          return h('tr', { class: 'data', style: `animation-delay:${i * 20}ms` },
            h('td', {}, `${itemIcon(id)} ${itemName(id)} `, h('span', { class: 'muted' }, `(×${q})`)),
            h('td', { class: 'price' }, `${shipPrice(id)}G `, trend > 0 ? h('span', { class: 'trend-up' }, '▲') : trend < 0 ? h('span', { class: 'trend-down' }, '▼') : ''),
            h('td', {}, stepper(st, key, q)),
            h('td', {}, h('button', { class: 'btn small gold', onclick: () => req('ship', { item: id, qty: st[key] }, () => { G.sfx.play('ship'); delete st[key]; }) }, 'Kirim')));
        })) : emptyState('🧺', 'Belum ada barang yang bisa dikirim. Panen, beternak, memancing atau cari barang di hutan!'),
      list.length ? h('button', { class: 'btn primary', onclick: async () => {
        for (const [id, q] of list) await G.request('ship', { item: id, qty: q });
        G.sfx.play('ship');
      } }, '📦 Kirim semua barang') : null);
  },
};

// ------------------------------------------------------------------ barn

PANELS.barn = {
  icon: '🐄', title: 'Kandang', sub: () => BARN_LEVELS[G.plots[G.self.plotId].barnLevel].name,
  render() {
    const plot = G.plots[G.self.plotId];
    const lvl = BARN_LEVELS[plot.barnLevel];
    const animals = plot.animals;
    const hasProd = animals.some((a) => a.prod);
    return h('div', { class: 'stack' },
      h('div', { class: 'row spread' },
        h('span', { class: 'muted' }, `🐔 ${animals.filter((a) => a.type === 'chicken').length}/${lvl.chicken} · 🐄 ${animals.filter((a) => a.type === 'cow').length}/${lvl.cow} · Pakan: ${itemIcon('chicken_feed')}${G.self.inv.chicken_feed || 0} ${itemIcon('fodder')}${G.self.inv.fodder || 0}`),
        h('div', { class: 'row' },
          h('button', { class: 'btn primary small', disabled: !animals.length, onclick: () => req('barn', { op: 'feed' }, (r) => { toast(r.msg); G.sfx.play('plant'); }) }, '🍽️ Beri makan semua'),
          h('button', { class: 'btn gold small', disabled: !hasProd, onclick: () => req('barn', { op: 'collect' }, (r) => { toast(r.msg, 'gold'); G.sfx.play('harvest'); }) }, '🧺 Kumpulkan hasil'))),
      animals.length ? h('div', { class: 'grid' }, animals.map((a) => {
        const hearts = Math.round((a.aff / 100) * 5);
        return h('div', { class: 'item-card' },
          h('div', { class: 'animal-card' }, h('div', { class: 'item-icon' }, ANIMALS[a.type].icon),
            h('div', {}, h('div', { class: 'item-name' }, a.name), h('div', { class: 'hearts' }, '♥'.repeat(hearts) + '♡'.repeat(5 - hearts)))),
          h('div', { class: 'row' },
            h('span', { class: `tag ${a.fed ? 'ok' : 'warn'}` }, a.fed ? 'Kenyang' : 'Lapar'),
            h('span', { class: `tag ${a.petted ? 'ok' : ''}` }, a.petted ? 'Sudah dielus' : 'Belum dielus'),
            a.prod ? h('span', { class: 'tag ok' }, `${itemIcon(a.prod)} siap`) : null),
          h('button', { class: 'btn small blue', disabled: a.petted, onclick: () => req('barn', { op: 'pet', animalId: a.id }, (r) => { toast(r.msg); G.sfx.play('harvest'); }) }, '🤚 Elus'));
      })) : emptyState('🏚️', 'Kandang masih kosong. Beli ayam atau sapi dari Pak Jaya di Peternakan Jaya!'));
  },
};

// ---------------------------------------------------------------- market

PANELS.market = {
  icon: '⚖️', title: 'Pasar Pemain', sub: 'Jual-beli langsung antar petani, harga ditentukan pemain',
  tabs: [['buy', '🛒 Beli'], ['sell', '🏷️ Jual'], ['mine', () => `📋 Lapakku (${G.market.listings.filter((l) => l.sellerId === G.self.id).length})`], ['prices', '📈 Harga Kirim']],
  render(cur) {
    const st = cur.state;
    if (cur.tab === 'buy') {
      const q = (st.search || '').toLowerCase();
      const list = G.market.listings.filter((l) => l.sellerId !== G.self.id && (!q || itemName(l.item).toLowerCase().includes(q) || l.sellerName.toLowerCase().includes(q)));
      return h('div', { class: 'stack' },
        h('input', { type: 'text', placeholder: '🔍 Cari barang atau penjual…', value: st.search || '', 'data-key': 'search', style: 'width:100%', oninput: (e) => { st.search = e.target.value; render(); } }),
        list.length ? h('table', { class: 'list' },
          h('tr', {}, h('th', {}, 'Barang'), h('th', {}, 'Penjual'), h('th', {}, 'Harga/unit'), h('th', {}, 'Jumlah'), h('th', {})),
          list.map((l, i) => {
            const key = `b_${l.id}`;
            const ship = shipPrice(l.item);
            return h('tr', { class: 'data', style: `animation-delay:${i * 20}ms` },
              h('td', {}, `${itemIcon(l.item)} ${itemName(l.item)} `, h('span', { class: 'muted' }, `(${l.qty})`)),
              h('td', {}, l.sellerName),
              h('td', {}, h('span', { class: 'price' }, `${fmt(l.price)}G`), ship ? h('div', { class: 'muted' }, `kirim: ${ship}G`) : null),
              h('td', {}, stepper(st, key, l.qty)),
              h('td', {}, h('button', { class: 'btn small primary', disabled: G.self.gold < l.price * (st[key] || 1), onclick: () => req('market:buy', { id: l.id, qty: st[key] || 1 }, (r) => { toast(r.msg, 'gold'); G.sfx.play('coin'); }) }, `Beli ${fmt(l.price * (st[key] || 1))}G`)));
          })) : emptyState('🧺', 'Belum ada barang dijual pemain lain.'));
    }
    if (cur.tab === 'sell') {
      const inv = invEntries();
      if (!inv.length) return emptyState('🎒', 'Tasmu kosong.');
      if (!st.item || !G.self.inv[st.item]) st.item = inv[0][0];
      const max = G.self.inv[st.item];
      const sugg = Math.max(1, Math.round((shipPrice(st.item) || ITEMS[st.item].buy || 20) * 1.15));
      if (st.priceFor !== st.item) { st.price = sugg; st.priceFor = st.item; }
      return h('div', { class: 'stack' },
        h('div', { class: 'muted' }, 'Pilih barang untuk dipajang. Barang disimpan di pasar hingga terjual atau lapak ditutup — penjual tetap dibayar walau sedang offline.'),
        h('div', { class: 'inv-mini' }, inv.map(([id, q]) => h('button', {
          title: itemName(id), style: st.item === id ? 'border-color:var(--gold);background:#fff8dc' : '',
          onclick: () => { st.item = id; st.qty = 1; render(); },
        }, itemIcon(id), h('span', {}, q)))),
        h('div', { class: 'item-card', style: 'animation:none' },
          h('div', { class: 'row' }, h('div', { class: 'item-icon' }, itemIcon(st.item)), h('div', {}, h('div', { class: 'item-name' }, itemName(st.item)), h('div', { class: 'muted' }, `Harga kirim hari ini: ${shipPrice(st.item) || '-'}G · saran: ${sugg}G`))),
          h('div', { class: 'row' }, 'Jumlah', stepper(st, 'qty', max), 'Harga/unit',
            h('input', { type: 'number', min: 1, value: st.price, 'data-key': 'price', oninput: (e) => { st.price = Math.max(1, Math.floor(Number(e.target.value) || 1)); }, onchange: () => render() }), 'G'),
          h('div', { class: 'row spread' }, h('b', {}, `Total: ${fmt((st.qty || 1) * st.price)}G`),
            h('button', { class: 'btn gold', onclick: () => req('market:list', { item: st.item, qty: st.qty || 1, price: st.price }, (r) => { toast(r.msg, 'gold'); G.sfx.play('coin'); st.qty = 1; }) }, '🏷️ Pajang di Pasar'))));
    }
    if (cur.tab === 'mine') {
      const list = G.market.listings.filter((l) => l.sellerId === G.self.id);
      if (!list.length) return emptyState('📋', `Kamu belum punya lapak. Maksimal ${MAX_LISTINGS} lapak aktif.`);
      return h('table', { class: 'list' },
        h('tr', {}, h('th', {}, 'Barang'), h('th', {}, 'Sisa'), h('th', {}, 'Harga/unit'), h('th', {})),
        list.map((l) => h('tr', { class: 'data' },
          h('td', {}, `${itemIcon(l.item)} ${itemName(l.item)}`), h('td', {}, l.qty), h('td', { class: 'price' }, `${fmt(l.price)}G`),
          h('td', {}, h('button', { class: 'btn small danger', onclick: () => req('market:cancel', { id: l.id }, (r) => toast(r.msg)) }, 'Tutup lapak')))));
    }
    const rows = Object.entries(G.market.prices).sort((a, b) => ITEMS[a[0]].type.localeCompare(ITEMS[b[0]].type) || b[1].price - a[1].price);
    return h('div', { class: 'stack' },
      h('div', { class: 'muted' }, 'Harga kotak pengiriman berubah setiap hari: barang yang banyak dikirim semua pemain akan turun harganya, lalu pulih perlahan. Barang 🔥 dibayar 1,5×.'),
      h('table', { class: 'list' },
        h('tr', {}, h('th', {}, 'Barang'), h('th', {}, 'Dasar'), h('th', {}, 'Hari ini'), h('th', {}, 'Tren')),
        rows.map(([id, p]) => h('tr', { class: 'data' },
          h('td', {}, `${itemIcon(id)} ${itemName(id)}`, G.market.hot === id ? ' 🔥' : ''),
          h('td', { class: 'muted' }, `${ITEMS[id].sell}G`),
          h('td', { class: 'price' }, `${p.price}G`),
          h('td', {}, p.trend > 0 ? h('span', { class: 'trend-up' }, '▲ naik') : p.trend < 0 ? h('span', { class: 'trend-down' }, '▼ turun') : h('span', { class: 'muted' }, '— stabil'))))));
  },
};

// --------------------------------------------------------------- players

PANELS.players = {
  icon: '👥', title: 'Petani Desa', sub: 'Peringkat kekayaan & ajak berdagang',
  render() {
    const list = [...G.players.values()].map((p) => p.info).sort((a, b) => b.gold - a.gold);
    return h('div', {}, list.map((p, i) => h('div', { class: 'player-row', style: `animation-delay:${i * 30}ms` },
      h('div', { class: 'rank' }, ['🥇', '🥈', '🥉'][i] || `#${i + 1}`),
      h('div', { class: `player-dot ${p.online ? '' : 'off'}`, style: `background:${p.color}` }),
      h('div', { style: 'flex:1' }, h('b', {}, p.name, p.id === G.self.id ? ' (kamu)' : ''),
        h('div', { class: 'muted' }, p.online ? (p.sleeping ? '💤 Tidur' : '🟢 Online') : '⚪ Offline', ` · Ladang #${p.plotId + 1}`)),
      h('div', { class: 'price' }, `${fmt(p.gold)}G`),
      p.online && p.id !== G.self.id ? h('button', { class: 'btn small blue', onclick: () => req('trade:request', { target: p.id }, (r) => toast(r.msg)) }, '🤝 Dagang') : null)));
  },
};

// ----------------------------------------------------------------- trade

PANELS.trade = {
  icon: '🤝', title: 'Perdagangan Langsung', noClose: true,
  sub: () => {
    const other = G.trade?.sides.find((s) => s.id !== G.self.id);
    return other ? `dengan ${other.name}` : '';
  },
  render(cur) {
    const tr = G.trade;
    if (!tr) return emptyState('🤝', 'Sesi dagang berakhir.');
    const me = tr.sides.find((s) => s.id === G.self.id);
    const them = tr.sides.find((s) => s.id !== G.self.id);
    const st = cur.state;
    const send = (items, gold) => G.request('trade:update', { items, gold });
    const side = (s, mine) => h('div', { class: `trade-side ${s.ok ? 'ok' : ''}` },
      h('h4', {}, h('span', { class: 'player-dot', style: `background:${s.color}` }), mine ? 'Tawaranmu' : `Tawaran ${s.name}`, s.ok ? h('span', { class: 'tag ok' }, '✔ Setuju') : null),
      h('div', { class: 'trade-offer' },
        Object.entries(s.items).map(([id, q]) => h('span', { class: 'chip' }, `${itemIcon(id)} ${itemName(id)} ×${q}`,
          mine ? h('button', { onclick: () => { const it = { ...me.items }; delete it[id]; send(it, me.gold); } }, '✕') : null)),
        s.gold ? h('span', { class: 'chip' }, `🪙 ${fmt(s.gold)}G`) : null,
        !Object.keys(s.items).length && !s.gold ? h('span', { class: 'muted' }, 'Belum ada penawaran') : null));
    const inv = invEntries((id) => (G.self.inv[id] || 0) > (me.items[id] || 0));
    return h('div', { class: 'stack' },
      h('div', { class: 'trade-cols' }, side(me, true), side(them, false)),
      h('div', { class: 'section-title' }, '🎒 Tambahkan dari tas ', h('span', { class: 'muted' }, '(klik = +1, Shift+klik = semua)')),
      h('div', { class: 'inv-mini' }, inv.map(([id, q]) => h('button', {
        title: itemName(id),
        onclick: (e) => {
          const items = { ...me.items };
          items[id] = e.shiftKey ? q : Math.min(q, (items[id] || 0) + 1);
          send(items, me.gold);
          G.sfx.play('click');
        },
      }, itemIcon(id), h('span', {}, q - (me.items[id] || 0))))),
      h('div', { class: 'row' }, '🪙 Emas:',
        h('input', { type: 'number', min: 0, max: G.self.gold, value: st.gold ?? me.gold, 'data-key': 'tgold', oninput: (e) => { st.gold = e.target.value; } }),
        h('button', { class: 'btn small', onclick: () => { send(me.items, Math.max(0, Math.floor(Number(st.gold) || 0))); st.gold = undefined; } }, 'Pasang emas'),
        h('span', { class: 'muted' }, `(punya ${fmt(G.self.gold)}G)`)),
      h('div', { class: 'muted' }, 'Perubahan penawaran akan membatalkan persetujuan kedua pihak. Perdagangan terjadi saat keduanya menekan Setuju.'),
      h('div', { class: 'row spread' },
        h('button', { class: 'btn danger', onclick: () => G.request('trade:cancel') }, 'Batalkan'),
        h('button', { class: 'btn primary', disabled: me.ok, onclick: () => G.request('trade:confirm') }, me.ok ? `Menunggu ${them.name}…` : '✔ Setuju')));
  },
};

PANELS.tradeRequest = {
  icon: '🤝', title: 'Ajakan Dagang', small: true,
  init: (args) => args,
  onClose: () => { if (current?.state?.from) G.request('trade:respond', { from: current.state.from, accept: false }); },
  render(cur) {
    const { from, name, color } = cur.state;
    return h('div', { class: 'stack' },
      h('div', { class: 'row' }, h('span', { class: 'player-dot', style: `background:${color}` }), h('b', {}, name), ' ingin berdagang denganmu.'),
      h('div', { class: 'row spread' },
        h('button', { class: 'btn danger', onclick: () => closePanel() }, 'Tolak'),
        h('button', { class: 'btn primary', onclick: () => { cur.state.from = null; closePanel(true); G.request('trade:respond', { from, accept: true }); } }, 'Terima')));
  },
};

// ------------------------------------------------------------------ house

PANELS.sleep = {
  icon: '🏠', title: () => HOUSE_LEVELS[G.plots[G.self.plotId]?.houseLevel || 0].name, sub: 'Tidur, istirahat & keluarga', small: true,
  render() {
    const online = [...G.players.values()].filter((p) => p.info.online);
    const sleeping = online.filter((p) => p.info.sleeping).length;
    // A spouse lives here and can be talked to while home.
    const spouse = G.self.spouse;
    const home = spouse && G.villagers?.stateOf(spouse)?.spot === `plotHome${G.self.plotId}`;
    const family = spouse ? h('div', { class: 'player-row', style: 'animation:none' }, portrait(spouse),
      h('div', { style: 'flex:1' }, h('b', {}, `💍 ${vName(spouse)}`), h('div', { class: 'muted' }, home ? 'Ada di rumah' : `📍 ${G.villagers?.locationLabel(spouse) || 'Di luar'}`)),
      home && !G.self.sleeping ? h('button', { class: 'btn small blue', onclick: () => { closePanel(true); G.talkTo(spouse); } }, '💬 Bicara') : null) : null;
    if (G.self.sleeping) {
      return h('div', { class: 'stack' },
        h('div', { style: 'font-size:46px;text-align:center' }, '💤'),
        h('div', { style: 'text-align:center' }, `Menunggu pemain lain tidur… (${sleeping}/${online.length})`),
        h('div', { class: 'muted', style: 'text-align:center' }, 'Hari berganti saat semua pemain online tidur, atau otomatis pukul 02:00.'),
        h('button', { class: 'btn', onclick: () => G.request('sleep', { on: false }) }, 'Bangun'));
    }
    return h('div', { class: 'stack' },
      family,
      h('div', {}, 'Tidur untuk memulihkan stamina dan melewati malam. Bisa tidur mulai pukul 18:00.'),
      h('div', { class: 'muted' }, `Pemain tidur: ${sleeping}/${online.length}. Jika tetap terjaga sampai 02:00, kamu pingsan dan hanya pulih 60%.`),
      h('div', { class: 'row spread' },
        h('button', { class: 'btn', onclick: () => closePanel() }, 'Nanti saja'),
        h('button', { class: 'btn primary', onclick: () => G.request('sleep', { on: true }) }, '🛏️ Tidur')));
  },
};

// ------------------------------------------------------------------- help

PANELS.help = {
  icon: '📖', title: 'Panduan Bertani',
  tabs: [['keys', '🎮 Kontrol'], ['farm', '🌱 Bertani'], ['village', '🏘️ Warga'], ['trade', '🤝 Berdagang']],
  render(cur) {
    const rows = (list) => h('table', { class: 'list' }, list.map(([k, v]) => h('tr', { class: 'data' }, h('td', { style: 'width:170px' }, h('b', {}, k)), h('td', {}, v))));
    if (cur.tab === 'keys') {
      return rows([
        ['W A S D / Panah', 'Berjalan (tahan Shift untuk berlari)'],
        ['Mouse', 'Arahkan ke petak di dekatmu untuk memilih target'],
        ['Spasi / Klik kiri', 'Gunakan alat yang dipilih'],
        ['E', 'Interaksi: warga, pintu, toko, kotak kirim, kandang, panen, mata air Dewi'],
        ['1 – 7', 'Ganti alat'],
        ['Q / R, Klik kanan + seret', 'Putar kamera'],
        ['Scroll / Z X', 'Zoom kamera'],
        ['I · M · P · V · H', 'Tas · Pasar · Pemain · Warga · Bantuan'],
        ['Enter', 'Chat'],
        ['Esc', 'Tutup jendela'],
      ]);
    }
    if (cur.tab === 'farm') {
      return rows([
        ['1. Bersihkan', 'Potong rumput liar (Sabit), pecah batu (Palu), tebang tunggul (Kapak).'],
        ['2. Cangkul', 'Gemburkan tanah dengan Cangkul.'],
        ['3. Tanam', 'Beli benih dari Pak Darto di Toko Kelontong, pegang benihnya (slot ✋), lalu tekan Spasi. Satu kantong = 3×3 petak.'],
        ['4. Siram', 'Siram setiap hari. Tanaman hanya tumbuh jika disiram (hujan menyiram otomatis). Isi ulang di sumur/kolam.'],
        ['5. Panen', 'Tanaman matang berkilau ✨. Tekan E atau gunakan ✋ untuk memanen.'],
        ['6. Kirim', 'Masukkan hasil ke kotak pengiriman. Mas Danu mengangkutnya tiap sore dan uangnya tiba besok pagi.'],
        ['Musim', 'Setiap musim 28 hari. Tanaman di luar musimnya akan layu. Musim dingin: fokus ternak, memancing & menambang.'],
        ['Ternak', 'Beli ayam & sapi dari Pak Jaya. Beri makan setiap hari di kandang dan elus agar kasih sayang naik. Hasil muncul keesokan pagi.'],
        ['Alat', 'Pak Bejo menempa alat jadi Tembaga → Perak → Emas: cangkul, penyiram & sabit mengenai lebih banyak petak, semua alat lebih hemat stamina. Bijih logam didapat dengan memecah batu memakai Palu.'],
        ['Bangunan', 'Mas Joko memperbesar rumah (stamina maksimal naik) dan kandang (muat lebih banyak ternak). Selesai keesokan paginya.'],
        ['Stamina', 'Setiap alat memakai stamina. Makan, minum jamu, atau tidur untuk memulihkan. Masakan Kedai Ayu memulihkan banyak stamina.'],
        ['Memancing', 'Berdiri di tepi kolam kota, pilih Pancing, tekan Spasi. Saat ❗ muncul, tekan Spasi lagi!'],
      ]);
    }
    if (cur.tab === 'village') {
      return rows([
        ['👋 Mengobrol', 'Dekati warga lalu tekan E. Mengobrol sekali sehari menambah persahabatan.'],
        ['🎁 Hadiah', 'Satu hadiah per warga per hari. Barang kesukaan = banyak hati; yang dibenci mengurangi hati. Di hari ulang tahun nilainya 3×!'],
        ['💝 Hati', `Setiap ${HEART} poin = 1 hati (maks 10). Di 3 & 8 hati warga memberi hadiah; di ${PERK_HEARTS} hati kamu mendapat bonus khusus.`],
        ['🕗 Jadwal', 'Warga punya rutinitas: bekerja, duduk di alun-alun, memancing, pulang. Saat hujan banyak yang di rumah — ketuk pintunya (sampai 22:00).'],
        ['📜 Pesanan', 'Setiap pagi warga memasang pesanan di papan dekat alun-alun. Petani pertama yang mengantar barangnya mendapat upah & hati!'],
        ...Object.keys(SHOPS).map((sid) => [`${SHOPS[sid].icon} ${SHOPS[sid].name}`, `${keeperName(sid)} · ${shopHours(sid)} — ${SHOP_INFO[sid]}. Tutup saat festival.`]),
        ['📦 Kurir', 'Mas Danu berkeliling tiap sore mengangkut isi kotak pengiriman semua ladang.'],
        ['🎉 Festival', `${FESTIVALS.length} festival setahun di alun-alun (lihat 📅 Kalender di menu Warga). Bicara dengan Kakek Harjo atau dekati air mancur untuk ikut.`],
        ['💍 Menikah', `Calon pasangan: ${CANDIDATES.map(vName).join(', ')}. Capai 10 hati, perbesar rumah jadi ${HOUSE_LEVELS[1].name} di Bengkel Kayu, lalu berikan ${itemIcon('blue_feather')} Bulu Biru dari Toko Kelontong.`],
        ['✨ Dewi Panen', `Tinggal di mata air hutan timur. Persembahkan satu barang sehari; di ${GODDESS_BERRIES.join(' / ')} poin ia memberi ${itemIcon('power_berry')} Buah Kekuatan (+10 stamina maksimal).`],
      ]);
    }
    return rows([
      ['📦 Kotak Pengiriman', 'Jual ke desa. Dibayar tiap pagi dengan harga pasar harian (naik-turun sesuai pasokan semua pemain).'],
      ['⚖️ Pasar Pemain', 'Pajang barangmu dengan harga sendiri. Pemain lain bisa membeli kapan saja, bahkan saat kamu offline.'],
      ['🤝 Dagang Langsung', 'Buka daftar Pemain (P) lalu ajak dagang. Tukar barang & emas; terjadi saat kedua pihak setuju.'],
      ['💡 Tips', 'Mas Joko butuh kayu & batu untuk bangunan, Pak Bejo butuh bijih logam untuk menempa — membeli dari pemain lain bisa lebih murah!'],
      ['🔥 Permintaan', 'Satu barang setiap hari dibayar 1,5× — lihat di kiri atas.'],
    ]);
  },
};

// -------------------------------------------------------------- villagers

const vName = (id) => VILLAGERS[id].name;
const npcDef = (id) => (id === 'goddess' ? GODDESS : VILLAGERS[id]);

function heartRow(pts, small = false) {
  const full = hearts(pts);
  const part = ((pts || 0) % HEART) / HEART;
  return h('div', { class: `hearts-row ${small ? 'small' : ''}`, title: `${pts || 0}/${MAX_FRIENDSHIP} poin` },
    Array.from({ length: MAX_FRIENDSHIP / HEART }, (_, i) => h('span', { class: i < full ? 'on' : i === full && part > 0 ? 'half' : '' }, '♥')));
}

function portrait(id, cls = '') {
  const src = G.portraits?.[id];
  const d = npcDef(id);
  return h('div', { class: `portrait ${cls}`, style: `--c:${d.color}` },
    src ? h('img', { src, alt: d.name }) : h('span', {}, d.icon));
}

function today() { return dayIndexOf(G.time); }

function activeRequest(id) {
  return (G.requests || []).find((q) => q.npc === id && !q.doneBy) || null;
}

// Marriage status of a villager as seen by this player.
function marriageTag(id) {
  const partner = G.village?.marriages?.[id];
  if (partner === G.self.id) return h('span', { class: 'tag love' }, '💍 Pasanganmu');
  if (partner) return h('span', { class: 'tag' }, `💍 Menikah dengan ${G.players.get(partner)?.info.name || 'petani lain'}`);
  if (VILLAGERS[id].candidate) return h('span', { class: 'tag love', title: 'Capai 10 hati, perbesar rumah, lalu berikan Bulu Biru' }, '💗 Calon pasangan');
  return null;
}

// Typewriter text for the dialogue box (about 60 characters per second).
let typer = null;
function startTyping(el, st) {
  clearInterval(typer);
  const full = st.text;
  const from = st.shown;
  const t0 = performance.now();
  const paint = () => {
    el.textContent = full.slice(0, st.shown);
    el.classList.toggle('done', st.shown >= full.length);
  };
  paint();
  if (st.shown >= full.length) return;
  let blip = 0;
  typer = setInterval(() => {
    st.shown = Math.min(full.length, from + Math.floor((performance.now() - t0) * 0.06));
    if (st.shown - blip >= 6) { blip = st.shown; G.sfx.play('blip'); }
    paint();
    if (st.shown >= full.length) {
      clearInterval(typer);
      // Reveal the answer buttons once the line is fully shown.
      if (current?.state === st) render();
    }
  }, 30);
}

// Villager and goddess conversations advance with Space / E / a click.
export function inDialogue() { return panelOpen('dialogue') || panelOpen('goddess'); }

export function advanceDialogue() {
  if (!inDialogue()) return;
  const st = current.state;
  if (st.mode !== 'talk') { st.mode = 'talk'; render(); return; }
  if (st.shown < st.text.length) {
    st.shown = st.text.length;
    render();
    return;
  }
  if (st.queue.length) {
    const next = st.queue.shift();
    Object.assign(st, { text: next.text, note: next.note, shown: 0 });
    G.sfx.play('trade');
    render();
    return;
  }
  closePanel();
}

// Shows the next line from a server reply (plus any friendship milestones).
function dialogueReply(st, res) {
  st.text = res.text;
  st.shown = 0;
  st.mode = 'talk';
  st.note = null;
  st.reaction = res.reaction || null;
  for (const ev of res.events || []) {
    const items = ev.items ? Object.entries(ev.items).map(([id, q]) => `${q} ${itemIcon(id)} ${itemName(id)}`).join(', ') : '';
    const note = [`💝 ${ev.hearts} hati!`, items ? `Hadiah: ${items}` : '', ev.perk ? `✨ Bonus baru: ${ev.perk}` : ''].filter(Boolean).join(' · ');
    st.queue.push({ text: ev.text, note });
  }
}

const GIFT_SFX = { dislike: 'error', already: 'click', proposal: 'click', wedding: 'morning' };

PANELS.dialogue = {
  custom: true,
  init: (args) => {
    const st = { npc: args.npc, queue: [] };
    dialogueReply(st, args.res);
    return st;
  },
  onBackdrop: () => advanceDialogue(),
  onClose: () => { clearInterval(typer); G.endTalk?.(); },
  render(cur) {
    const st = cur.state;
    const id = st.npc;
    const v = VILLAGERS[id];
    const rel = G.self.rel?.[id] || {};
    const textEl = h('div', { class: 'dlg-text', onclick: () => advanceDialogue() });
    const reqq = activeRequest(id);
    const have = reqq ? G.self.inv[reqq.item] || 0 : 0;
    const actions = [];
    if (st.mode === 'talk' && st.shown >= st.text.length && !st.queue.length) {
      actions.push(h('button', { class: 'btn small gold', onclick: () => { st.mode = 'gift'; render(); } }, rel.gifted === today() ? '🎁 Sudah diberi hadiah' : '🎁 Beri hadiah'));
      if (reqq) {
        actions.push(h('button', {
          class: 'btn small blue', disabled: have < reqq.qty,
          onclick: () => G.request('npc:deliver', { npc: id, id: reqq.id }).then((res) => {
            if (!res.ok) return;
            dialogueReply(st, res);
            G.sfx.play('coin');
            toast(`📜 Pesanan selesai! +${fmt(res.reward)}G`, 'gold');
            render();
          }),
        }, `📜 Antar ${reqq.qty} ${itemIcon(reqq.item)} (punya ${have})`));
      }
      // Shopkeepers serve you right here while their shop is open.
      for (const [sid, s] of Object.entries(SHOPS)) {
        if (s.npc === id && shopIsOpen(sid)) actions.push(h('button', { class: 'btn small primary', onclick: () => { closePanel(true); openPanel('shop', { shop: sid }); } }, `${s.icon} ${SHOP_ACTION[sid]}`));
      }
      if (id === 'ratna') actions.push(h('button', { class: 'btn small primary', onclick: () => { closePanel(true); openPanel('market'); } }, '⚖️ Pasar'));
      // The village head runs the festivals.
      const fest = todayFestival();
      if (id === 'harjo' && (festivalLive(fest) || (fest?.activity === 'contest' && G.minute() >= fest.start))) {
        actions.push(h('button', { class: 'btn small gold', onclick: () => { closePanel(true); openPanel('festival'); } }, `${fest.icon} ${fest.name}`));
      }
      actions.push(h('button', { class: 'btn small', onclick: () => closePanel() }, 'Sampai jumpa 👋'));
    }
    let picker = null;
    if (st.mode === 'gift') {
      const inv = invEntries((iid, it) => it.type !== 'seed');
      picker = h('div', { class: 'dlg-gift' },
        h('div', { class: 'muted' }, `Pilih hadiah untuk ${v.name}${isBirthday(id, G.time) ? ' — hari ini ulang tahunnya (3×)!' : ''}:`),
        inv.length ? h('div', { class: 'inv-mini' }, inv.map(([iid, q]) => {
          const known = rel.known?.[iid];
          return h('button', {
            title: `${itemName(iid)}${known ? ` (${REACT_LABEL[known].toLowerCase()})` : ''}`,
            class: known ? `known-${known}` : iid === 'blue_feather' ? 'feather' : '',
            onclick: () => G.request('npc:gift', { npc: id, item: iid }).then((res) => {
              if (!res.ok) return;
              dialogueReply(st, res);
              G.sfx.play(GIFT_SFX[res.reaction] || 'harvest');
              render();
            }),
          }, itemIcon(iid), h('span', {}, q));
        })) : h('div', { class: 'muted' }, 'Tasmu kosong.'),
        h('button', { class: 'btn small', onclick: () => { st.mode = 'talk'; render(); } }, 'Batal'));
    }
    const box = h('div', { class: `dialogue ${st.reaction ? `react-${st.reaction}` : ''}` },
      portrait(id, 'big'),
      h('div', { class: 'dlg-main' },
        h('div', { class: 'dlg-head' },
          h('span', { class: 'dlg-name', style: `background:${v.color}` }, v.name),
          h('span', { class: 'dlg-role' }, v.role),
          marriageTag(id),
          isBirthday(id, G.time) ? h('span', { class: 'tag warn' }, '🎂 Ulang tahun!') : null,
          heartRow(rel.pts)),
        textEl,
        st.note ? h('div', { class: 'dlg-note' }, st.note) : null,
        picker,
        actions.length ? h('div', { class: 'dlg-actions' }, actions) : null));
    startTyping(textEl, st);
    return box;
  },
};

// ------------------------------------------------------------ the goddess

PANELS.goddess = {
  custom: true,
  init: () => ({
    npc: 'goddess', queue: [], mode: 'talk', shown: 0, note: null, reaction: null,
    text: G.self.goddess?.day === today() ? GODDESS.talk.already : GODDESS.talk.intro,
  }),
  onBackdrop: () => advanceDialogue(),
  onClose: () => { clearInterval(typer); G.endGoddess?.(); },
  render(cur) {
    const st = cur.state;
    const pts = G.self.goddess?.pts || 0;
    const got = GODDESS_BERRIES.filter((b) => pts >= b).length;
    const next = GODDESS_BERRIES[got];
    const prev = GODDESS_BERRIES[got - 1] || 0;
    const offered = G.self.goddess?.day === today();
    const textEl = h('div', { class: 'dlg-text', onclick: () => advanceDialogue() });
    const actions = [];
    if (st.mode === 'talk' && st.shown >= st.text.length && !st.queue.length) {
      if (!offered) actions.push(h('button', { class: 'btn small gold', onclick: () => { st.mode = 'gift'; render(); } }, '🎁 Beri persembahan'));
      actions.push(h('button', { class: 'btn small', onclick: () => closePanel() }, 'Sampai jumpa 👋'));
    }
    let picker = null;
    if (st.mode === 'gift') {
      const inv = invEntries((iid, it) => it.type !== 'seed');
      picker = h('div', { class: 'dlg-gift' },
        h('div', { class: 'muted' }, 'Pilih persembahan. Dewi Panen paling menyukai bunga dan hasil panen terbaik:'),
        inv.length ? h('div', { class: 'inv-mini' }, inv.map(([iid, q]) => h('button', {
          title: itemName(iid),
          onclick: () => G.request('goddess:offer', { item: iid }).then((res) => {
            if (!res.ok) return;
            Object.assign(st, {
              text: res.text, shown: 0, mode: 'talk', reaction: res.reaction,
              note: res.berry ? `${itemIcon('power_berry')} Kamu menerima Buah Kekuatan! Makan untuk menambah stamina maksimal +10.` : null,
            });
            G.sfx.play(res.reaction === 'dislike' ? 'error' : res.berry ? 'morning' : 'harvest');
            render();
          }),
        }, itemIcon(iid), h('span', {}, q)))) : h('div', { class: 'muted' }, 'Tasmu kosong.'),
        h('button', { class: 'btn small', onclick: () => { st.mode = 'talk'; render(); } }, 'Batal'));
    }
    const box = h('div', { class: `dialogue goddess ${st.reaction ? `react-${st.reaction}` : ''}` },
      portrait('goddess', 'big'),
      h('div', { class: 'dlg-main' },
        h('div', { class: 'dlg-head' },
          h('span', { class: 'dlg-name', style: `background:${GODDESS.color}` }, GODDESS.name),
          h('span', { class: 'dlg-role' }, GODDESS.role),
          h('div', { class: 'favor', title: `${pts} poin persembahan${next ? ` · berkah berikutnya di ${next}` : ''}` },
            h('span', {}, `${itemIcon('power_berry')} ${got}/${GODDESS_BERRIES.length}`),
            h('div', { class: 'bar small' }, h('div', { class: 'bar-fill favor-fill', style: `width:${next ? ((pts - prev) / (next - prev)) * 100 : 100}%` })))),
        textEl,
        st.note ? h('div', { class: 'dlg-note' }, st.note) : null,
        picker,
        actions.length ? h('div', { class: 'dlg-actions' }, actions) : null));
    startTyping(textEl, st);
    return box;
  },
};

// -------------------------------------------------------------- festivals

const FEST_ACT = {
  dance: { what: 'menari', btn: '💃 Ajak menari' },
  watch: { what: 'menonton kembang api', btn: '🎆 Ajak menonton' },
  dinner: { what: 'makan malam bersama', btn: '🍽️ Ajak makan malam' },
};

function festivalResult(st, r) {
  st.result = r.text;
  G.sfx.play('morning');
  for (const e of r.events || []) toast(`💝 ${vName(e.npc)}: ${e.hearts} hati!${e.perk ? ` ✨ ${e.perk}` : ''}`, 'gold');
  refreshPanel('festival');
}

PANELS.festival = {
  icon: () => todayFestival()?.icon || '🎉',
  title: () => todayFestival()?.name || 'Festival',
  sub: () => {
    const f = todayFestival();
    return f ? `${formatTime(f.start)}–${formatTime(f.end)} · Alun-alun desa` : 'Tidak ada festival hari ini';
  },
  render(cur) {
    const st = cur.state;
    const fest = todayFestival();
    if (!fest) return emptyState('📅', 'Hari ini tidak ada festival. Lihat jadwalnya di 📅 Kalender pada menu Warga (V).');
    const m = G.minute();
    const done = !!G.self.festDone?.[festivalKey(fest)];
    const head = h('div', { class: `banner fest ${fest.id}` }, `${fest.icon} ${fest.desc}`);
    if (fest.activity === 'contest') return h('div', { class: 'stack' }, head, renderContest(fest, st, done, m));
    if (m < fest.start) return h('div', { class: 'stack' }, head, emptyState('⏰', `Acara dimulai pukul ${formatTime(fest.start)}. Warga sudah mulai berkumpul di alun-alun!`));
    if (m >= fest.end) return h('div', { class: 'stack' }, head, emptyState('🌙', `${fest.name} sudah selesai. Sampai jumpa tahun depan!`));
    if (st.result || done) {
      return h('div', { class: 'stack' }, head, h('div', { class: 'item-card fest-done', style: 'animation:none' },
        h('div', { class: 'big-emoji' }, fest.icon), st.result || 'Kamu sudah ikut acara festival ini. Nikmati sisa perayaannya!'));
    }
    return h('div', { class: 'stack' }, head, fest.activity === 'pot' ? renderPot(st) : renderPartner(fest, st));
  },
};

// Dance / fireworks / starry dinner: spend the festival with one villager.
function renderPartner(fest, st) {
  const pts = (id) => G.self.rel?.[id]?.pts || 0;
  const rank = (id) => (id === G.self.spouse ? 2 : VILLAGERS[id].candidate ? 1 : 0);
  const ids = [...VILLAGER_IDS].sort((a, b) => rank(b) - rank(a) || pts(b) - pts(a));
  const act = FEST_ACT[fest.activity];
  return h('div', { class: 'stack' },
    h('div', { class: 'muted' }, `Pilih satu warga untuk diajak ${act.what} (+${FEST_POINTS / HEART} hati). Hanya sekali per festival!`),
    h('div', { class: 'grid villagers' }, ids.map((id, i) => h('div', { class: 'item-card villager-card', style: `animation-delay:${i * 25}ms` },
      h('div', { class: 'row' }, portrait(id),
        h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'item-name' }, vName(id)), h('div', { class: 'muted' }, VILLAGERS[id].role), heartRow(pts(id), true))),
      marriageTag(id),
      h('button', { class: 'btn small gold', onclick: () => req('festival:join', { npc: id }, (r) => festivalResult(st, r)) }, act.btn)))));
}

// Harvest festival: one ingredient for the communal pot that the whole village tastes.
function renderPot(st) {
  const inv = invEntries((id, it) => !['seed', 'special', 'medicine'].includes(it.type));
  return h('div', { class: 'stack' },
    h('div', { class: 'muted' }, 'Masukkan satu bahan ke kuali besar. Semua warga ikut mencicipi supnya: bahan kesukaan mereka menambah banyak hati, bahan yang mereka benci… kurang enak!'),
    inv.length ? h('div', { class: 'inv-mini' }, inv.map(([id, q]) => h('button', {
      title: itemName(id), onclick: () => req('festival:join', { item: id }, (r) => festivalResult(st, r)),
    }, itemIcon(id), h('span', {}, q)))) : emptyState('🎒', 'Tasmu kosong. Bawa hasil panen terbaikmu!'));
}

// Livestock contest: register your most loved animal; the winner is announced at the end.
function renderContest(fest, st, done, m) {
  const fs = G.village?.fest?.key === festivalKey(fest) ? G.village.fest : { entries: [], judged: false, winner: null };
  const animals = G.plots[G.self.plotId]?.animals || [];
  const best = animals.length ? animals.reduce((a, b) => (b.aff > a.aff ? b : a)) : null;
  const love = (aff) => {
    const n = Math.round((aff / MAX_AFFECTION) * 5);
    return '♥'.repeat(n) + '♡'.repeat(5 - n);
  };
  const isWinner = (e) => fs.winner && fs.winner.pid === e.pid && fs.winner.animalId === e.animalId;
  let action = null;
  if (fs.judged) action = null;
  else if (m < fest.start) action = emptyState('⏰', `Pendaftaran dibuka pukul ${formatTime(fest.start)}.`);
  else if (done) action = h('div', { class: 'banner info' }, `✅ Ternakmu sudah terdaftar. Juara diumumkan pukul ${formatTime(fest.end)}.`);
  else if (!best) action = emptyState('🐔', 'Kamu belum punya ternak. Beli ayam atau sapi dari Pak Jaya!');
  else {
    action = h('div', { class: 'item-card', style: 'animation:none' },
      h('div', { class: 'animal-card' }, h('div', { class: 'item-icon' }, ANIMALS[best.type].icon),
        h('div', { style: 'flex:1' }, h('div', { class: 'item-name' }, best.name), h('div', { class: 'hearts' }, love(best.aff)), h('div', { class: 'muted' }, 'Ternak dengan kasih sayang tertinggimu'))),
      h('button', { class: 'btn gold', onclick: () => req('festival:join', {}, (r) => festivalResult(st, r)) }, '🏆 Daftarkan'));
  }
  return h('div', { class: 'stack' },
    fs.winner ? h('div', { class: 'banner perk' }, `🏆 Juara: ${ANIMALS[fs.winner.type].icon} ${fs.winner.animal} milik ${fs.winner.name}!`) : null,
    fs.judged && !fs.winner ? h('div', { class: 'banner info' }, 'Lomba selesai tanpa peserta.') : null,
    st.result ? h('div', { class: 'item-card', style: 'animation:none' }, st.result) : null,
    action,
    h('div', { class: 'section-title' }, `📋 Peserta (${fs.entries.length})`),
    fs.entries.length ? h('div', {}, fs.entries.map((e, i) => h('div', { class: `player-row ${isWinner(e) ? 'winner' : ''}`, style: `animation-delay:${i * 30}ms` },
      h('div', { class: 'rank' }, isWinner(e) ? '🏆' : `#${i + 1}`),
      h('div', { class: 'item-icon', style: 'font-size:26px' }, ANIMALS[e.type].icon),
      h('div', { style: 'flex:1' }, h('b', {}, e.animal), h('div', { class: 'muted' }, `milik ${e.name}`)),
      h('div', { class: 'hearts' }, love(e.aff))))) : h('div', { class: 'muted' }, 'Belum ada peserta.'));
}

// ----------------------------------------------------------------- doors

PANELS.knock = {
  icon: '🚪', title: () => current?.state?.name || 'Rumah', sub: 'Siapa yang ingin kamu temui?', small: true,
  init: (args) => args,
  render(cur) {
    return h('div', { class: 'stack' }, cur.state.ids.map((id) => h('button', {
      class: 'btn knock-btn', onclick: () => { closePanel(true); G.talkTo(id); },
    }, portrait(id), h('span', {}, h('b', {}, vName(id)), h('small', {}, VILLAGERS[id].role)))));
  },
};

// ------------------------------------------------------- villagers panel

const REACT_LABEL = { love: 'Sangat suka', like: 'Suka', neutral: 'Biasa', dislike: 'Tidak suka' };

PANELS.villagers = {
  icon: '🏘️', title: 'Warga Desa', sub: 'Persahabatan, ulang tahun, selera hadiah, pesanan & festival',
  tabs: [['people', '👥 Warga'], ['requests', () => `📜 Pesanan (${(G.requests || []).filter((q) => !q.doneBy).length})`], ['calendar', '📅 Kalender']],
  render(cur) {
    if (cur.tab === 'requests') return renderRequests();
    if (cur.tab === 'calendar') return renderCalendar(cur.state);
    return h('div', { class: 'grid villagers' }, VILLAGER_IDS.map((id, i) => {
      const v = VILLAGERS[id];
      const rel = G.self.rel?.[id] || {};
      const known = Object.entries(rel.known || {});
      const byKind = (k) => known.filter(([, r]) => r === k).map(([iid]) => itemIcon(iid)).join(' ');
      const season = SEASONS[v.birthday.season];
      const perkOn = perkActive(G.self.rel, id);
      const shop = Object.keys(SHOPS).find((sid) => SHOPS[sid].npc === id);
      return h('div', { class: 'item-card villager-card', style: `animation-delay:${i * 30}ms` },
        h('div', { class: 'row' }, portrait(id),
          h('div', { style: 'flex:1;min-width:0' },
            h('div', { class: 'item-name' }, v.name, ' ', isBirthday(id, G.time) ? '🎂' : ''),
            h('div', { class: 'muted' }, v.role),
            heartRow(rel.pts, true))),
        marriageTag(id),
        h('div', { class: 'item-meta' }, `🎂 ${season.icon} ${season.name} ${v.birthday.day}`, ' · ', `📍 ${G.villagers?.locationLabel(id) || ''}`),
        shop ? h('div', { class: 'item-meta' }, `${SHOPS[shop].icon} ${SHOPS[shop].name} · ${shopHours(shop)}`) : null,
        h('div', { class: 'row' },
          h('span', { class: `tag ${rel.talked === today() ? 'ok' : ''}` }, rel.talked === today() ? '💬 Sudah ngobrol' : '💬 Belum ngobrol'),
          h('span', { class: `tag ${rel.gifted === today() ? 'ok' : ''}` }, rel.gifted === today() ? '🎁 Sudah' : '🎁 Belum')),
        known.length ? h('div', { class: 'item-meta tastes' },
          byKind('love') ? h('div', {}, '😍 ', byKind('love')) : null,
          byKind('like') ? h('div', {}, '🙂 ', byKind('like')) : null,
          byKind('dislike') ? h('div', {}, '😣 ', byKind('dislike')) : null)
          : h('div', { class: 'item-meta' }, rel.met ? 'Beri hadiah untuk mengetahui seleranya.' : 'Belum berkenalan — sapa dia!'),
        h('div', { class: `perk ${perkOn ? 'on' : ''}` }, `✨ ${PERK_HEARTS}♥: ${v.perk.text}`));
    }), goddessCard());
  },
};

function goddessCard() {
  const g = G.self.goddess || { pts: 0, day: -1 };
  const got = GODDESS_BERRIES.filter((b) => g.pts >= b).length;
  const next = GODDESS_BERRIES[got];
  return h('div', { class: 'item-card villager-card goddess-card' },
    h('div', { class: 'row' }, portrait('goddess'),
      h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'item-name' }, `${GODDESS.icon} ${GODDESS.name}`), h('div', { class: 'muted' }, `${GODDESS.role} · hutan timur`))),
    h('div', { class: 'item-meta' }, `${g.pts} poin persembahan${next ? ` · berkah berikutnya di ${next}` : ' · semua berkah sudah diterima'}`),
    h('div', { class: 'row' },
      h('span', { class: 'tag' }, `${itemIcon('power_berry')} ${got}/${GODDESS_BERRIES.length} Buah Kekuatan`),
      h('span', { class: `tag ${g.day === today() ? 'ok' : ''}` }, g.day === today() ? '🎁 Sudah' : '🎁 Belum')),
    h('div', { class: 'perk' }, 'Persembahkan satu barang sehari di mata airnya. Ia paling menyukai bunga dan hasil panen terbaik.'));
}

function renderRequests() {
  const list = G.requests || [];
  if (!list.length) return emptyState('📜', 'Belum ada pesanan. Pesanan baru dipasang setiap pagi.');
  return h('div', { class: 'stack' },
    h('div', { class: 'muted' }, 'Antar barangnya langsung ke warga yang memesan. Siapa cepat dia dapat — petani lain juga bisa mengambil pesanan ini!'),
    list.map((q, i) => {
      const it = ITEMS[q.item];
      const have = G.self.inv[q.item] || 0;
      const left = q.expires - today() + 1;
      return h('div', { class: `player-row request ${q.doneBy ? 'done' : ''}`, style: `animation-delay:${i * 40}ms` },
        portrait(q.npc),
        h('div', { style: 'flex:1' },
          h('b', {}, `${vName(q.npc)} ingin ${q.qty} ${it.icon} ${it.name}`),
          h('div', { class: 'muted' }, q.doneBy ? `✅ Diselesaikan oleh ${q.doneBy}` : `📍 ${G.villagers?.locationLabel(q.npc) || ''} · ⏳ ${left} hari lagi · Kamu punya ${have}/${q.qty}`)),
        h('div', { class: 'price' }, `+${fmt(q.reward)}G`), h('span', { class: 'tag' }, '+♥'));
    }));
}

// Season calendar with festivals and birthdays, Harvest Moon style.
const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

function renderCalendar(st) {
  const season = st.calSeason ?? G.time.season;
  const now = season === G.time.season;
  const events = {};
  const add = (day, ev) => (events[day] = events[day] || []).push(ev);
  for (const f of FESTIVALS) {
    if (f.season === season) add(f.day, { icon: f.icon, text: `${f.name} · ${formatTime(f.start)}–${formatTime(f.end)}`, sub: f.desc, fest: true });
  }
  for (const id of VILLAGER_IDS) {
    const b = VILLAGERS[id].birthday;
    if (b.season === season) add(b.day, { npc: id, text: `Ulang tahun ${vName(id)}`, sub: `${VILLAGERS[id].role} — hadiah bernilai 3×!` });
  }
  const face = (id) => (G.portraits?.[id] ? h('img', { class: 'cal-face', src: G.portraits[id], alt: vName(id) }) : '🎂');
  const cells = [];
  for (let d = 1; d <= DAYS_PER_SEASON; d++) {
    const evs = events[d] || [];
    cells.push(h('div', {
      class: `cal-cell ${now && d === G.time.day ? 'today' : ''} ${now && d < G.time.day ? 'past' : ''} ${evs.some((e) => e.fest) ? 'fest' : ''}`,
      title: evs.map((e) => e.text).join('\n'),
    }, h('span', { class: 'cal-day' }, d), h('span', { class: 'cal-icons' }, evs.map((e) => (e.npc ? face(e.npc) : e.icon)))));
  }
  const S = SEASONS[season];
  const list = Object.keys(events).map(Number).sort((a, b) => a - b).flatMap((d) => events[d].map((e) => h('div', { class: `player-row cal-ev ${now && d < G.time.day ? 'past' : ''}` },
    h('div', { class: 'rank' }, d),
    e.npc ? portrait(e.npc, 'small') : h('div', { class: 'item-icon', style: 'font-size:28px' }, e.icon),
    h('div', { style: 'flex:1' }, h('b', {}, e.text), h('div', { class: 'muted' }, e.sub)))));
  return h('div', { class: 'stack' },
    h('div', { class: 'row spread cal-nav' },
      h('button', { class: 'btn small', onclick: () => { st.calSeason = (season + 3) % 4; render(); } }, '◀'),
      h('b', {}, `${S.icon} ${S.name}${now ? ` · hari ini tanggal ${G.time.day}` : ''}`),
      h('button', { class: 'btn small', onclick: () => { st.calSeason = (season + 1) % 4; render(); } }, '▶')),
    h('div', { class: 'cal-grid' }, WEEKDAYS.map((w) => h('div', { class: 'cal-head' }, w)), cells),
    list);
}

// ------------------------------------------------------------- day report

export function showDayStart(rep, onDone) {
  const season = SEASONS[rep.season];
  const lines = rep.lines.map((l) => h('div', { class: 'report-line' }, h('span', {}, `${itemIcon(l.id)} ${itemName(l.id)} ×${l.qty}`), h('span', {}, `${fmt(l.price * l.qty)}G`)));
  $('fadeContent').replaceChildren(
    h('span', { class: 'sun' }, rep.passedOut ? '😵' : WEATHER[rep.weather].icon),
    h('h2', {}, rep.passedOut ? 'Kamu pingsan kelelahan…' : 'Selamat Pagi!'),
    h('div', {}, `${season.icon} ${season.name}, Hari ${rep.day} · Tahun ${rep.year} · ${WEATHER[rep.weather].name}`),
    rep.lines.length ? h('div', { class: 'report' }, h('b', {}, '📦 Hasil pengiriman kemarin'), lines,
      h('div', { class: 'report-total' }, h('span', {}, 'Total'), h('span', {}, `+${fmt(rep.total)}G`))) : null,
    rep.notes?.length ? h('div', { class: 'report notes' }, rep.notes.map((n) => h('div', { class: 'report-line' }, n))) : null,
    h('div', { class: 'muted', style: 'margin-top:16px;color:#bbb' }, 'Klik untuk melanjutkan'));
  const fade = $('fade');
  fade.classList.add('show');
  const done = () => { fade.classList.remove('show'); fade.onclick = null; onDone?.(); };
  fade.onclick = done;
  setTimeout(done, rep.lines.length || rep.notes?.length ? 6000 : 3000);
}

export function updateSleepPanel() { refreshPanel('sleep'); }
