import {
  ITEMS, CROPS, ANIMALS, SEASONS, WEATHER, TOOLS, CAN_LEVELS, BARN_LEVELS, MAX_LISTINGS, PREMIUM_AFFECTION,
  PLOT_CENTERS, plotLayout, TOWN, FIELD_W, FIELD_H, WORLD_BOUNDS, formatTime, DAYS_PER_SEASON,
} from '/shared/defs.js';

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
      h('span', { class: 'key' }, t.key), h('span', { class: 'ico' }, t.icon), h('span', { class: 'qty' }), h('span', { class: 'sub' }));
    bar.append(s);
  }
}

export function updateHotbar() {
  for (const s of document.querySelectorAll('.slot')) {
    const id = s.dataset.tool;
    s.classList.toggle('active', G.tool === id);
    const qty = s.querySelector('.qty');
    const sub = s.querySelector('.sub');
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
  const cap = CAN_LEVELS[s.canLevel].capacity;
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

export function openPanel(id, args = {}) {
  const def = PANELS[id];
  if (!def || !G.self) return;
  if (current?.id === 'trade' && id !== 'trade' && G.trade) return;
  current = { id, tab: def.tabs ? def.tabs[0][0] : null, state: def.init ? def.init(args) : {}, args };
  G.sfx.play('open');
  G.uiOpen = true;
  render();
}

export function closePanel(force = false) {
  if (!current) return;
  const def = PANELS[current.id];
  if (!force && def.onClose && def.onClose() === false) return;
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
  const oldBody = root.querySelector('.modal-body');
  const scroll = oldBody ? oldBody.scrollTop : 0;
  const focusKey = document.activeElement?.dataset?.key;
  const selStart = document.activeElement?.selectionStart;
  const title = typeof def.title === 'function' ? def.title() : def.title;
  const sub = typeof def.sub === 'function' ? def.sub() : def.sub;
  const modal = h('div', { class: `modal ${def.small ? 'small' : ''}` },
    h('div', { class: 'modal-head' },
      h('div', { class: 'modal-icon' }, def.icon),
      h('div', { class: 'modal-title' }, title, sub ? h('small', {}, sub) : null),
      def.noClose ? null : h('button', { class: 'modal-close', onclick: () => closePanel() }, '✕')),
    def.tabs ? h('div', { class: 'tabs' }, def.tabs.map(([tid, label]) => h('button', {
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
  const order = ['crop', 'animal', 'fish', 'forage', 'seed', 'food', 'feed', 'material'];
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
      other: (_, it) => ['food', 'feed', 'material'].includes(it.type),
    }[cur.tab];
    const list = invEntries(filt);
    if (!list.length) return emptyState('🍃', 'Tas kosong di kategori ini.');
    return h('div', { class: 'grid' }, list.map(([id, q], i) => {
      const it = ITEMS[id];
      const seasonOk = it.type !== 'seed' || it.season === seasonId();
      return h('div', { class: `item-card ${G.selectedItem === id ? 'selected' : ''}`, style: `animation-delay:${i * 20}ms` },
        h('div', { class: 'item-qty' }, `×${q}`),
        h('div', { class: 'item-icon' }, it.icon, it.cropIcon ? h('small', {}, it.cropIcon) : null),
        h('div', { class: 'item-name' }, it.name),
        h('div', { class: 'item-meta' }, it.sell ? h('span', { class: 'price' }, `Jual ${shipPrice(id)}G`) : 'Tidak bisa dikirim',
          it.eat ? ` · +${it.eat}⚡` : '', it.type === 'seed' ? ` · ${SEASONS.find((s) => s.id === it.season).icon}${seasonOk ? '' : ' (bukan musimnya)'}` : ''),
        h('div', { class: 'row' },
          h('button', { class: 'btn small primary', onclick: () => { G.holdItem(id); closePanel(); } }, 'Pegang'),
          it.eat ? h('button', { class: 'btn small gold', onclick: () => req('eat', { item: id }) }, 'Makan') : null));
    }));
  },
};

// ------------------------------------------------------------------ shop

PANELS.shop = {
  icon: '🏪', title: 'Toko Umum', sub: () => `Uangmu: ${fmt(G.self.gold)}G`,
  tabs: [['seed', '🌱 Benih'], ['food', '🍞 Pakan & Makanan'], ['animal', '🐔 Hewan'], ['mat', '🪵 Material'], ['up', '⬆️ Peningkatan']],
  render(cur) {
    const st = cur.state;
    if (cur.tab === 'animal') return renderAnimalShop(st);
    if (cur.tab === 'up') return renderUpgrades();
    const types = { seed: ['seed'], food: ['feed', 'food'], mat: ['material'] }[cur.tab];
    const list = Object.entries(ITEMS).filter(([, it]) => it.buy && types.includes(it.type) && (it.type !== 'seed' || it.season === seasonId()));
    if (!list.length) return emptyState('❄️', 'Tidak ada benih di musim dingin. Fokus pada ternak, memancing & mencari barang di hutan!');
    return h('div', { class: 'grid' }, list.map(([id, it], i) => {
      const key = `q_${id}`;
      const qty = st[key] || 1;
      const crop = it.crop ? CROPS[it.crop] : null;
      return h('div', { class: 'item-card', style: `animation-delay:${i * 25}ms` },
        h('div', { class: 'item-icon' }, it.icon, it.cropIcon ? h('small', {}, it.cropIcon) : null),
        h('div', { class: 'item-name' }, it.name),
        h('div', { class: 'item-meta' }, crop
          ? `${crop.days} hari${crop.regrow ? `, panen ulang ${crop.regrow} hari` : ''} · 3×3 petak · jual ${crop.sell}G`
          : it.eat ? `Memulihkan ${it.eat} stamina` : it.type === 'feed' ? 'Pakan harian ternak' : 'Bahan bangunan'),
        h('div', { class: 'price' }, `${it.buy}G`),
        h('div', { class: 'row' }, stepper(st, key, 99),
          h('button', { class: 'btn small primary', disabled: G.self.gold < it.buy * qty, onclick: () => req('buy', { item: id, qty: st[key] }, (r) => { toast(r.msg); G.sfx.play('coin'); }) }, 'Beli')));
    }));
  },
};

function renderAnimalShop(st) {
  const plot = G.plots[G.self.plotId];
  const lvl = BARN_LEVELS[plot.barnLevel];
  return h('div', { class: 'stack' },
    h('div', { class: 'muted' }, `${lvl.name}: kapasitas ${lvl.chicken} ayam & ${lvl.cow} sapi. Beri makan setiap hari agar ternak berproduksi. Kasih sayang ≥ ${PREMIUM_AFFECTION} menghasilkan produk premium!`),
    h('div', { class: 'grid' }, Object.entries(ANIMALS).map(([type, a]) => {
      const have = plot.animals.filter((x) => x.type === type).length;
      const full = have >= lvl[type];
      const key = `name_${type}`;
      return h('div', { class: `item-card ${full ? 'disabled' : ''}` },
        h('div', { class: 'item-icon' }, a.icon),
        h('div', { class: 'item-name' }, a.name),
        h('div', { class: 'item-meta' }, `Menghasilkan ${itemIcon(a.product)} ${itemName(a.product)} · makan ${itemIcon(a.feed)} ${itemName(a.feed)}`),
        h('div', { class: 'item-meta' }, `Di kandang: ${have}/${lvl[type]}`),
        h('div', { class: 'price' }, `${fmt(a.price)}G`),
        h('input', { type: 'text', placeholder: 'Nama hewan', maxlength: 12, value: st[key] || '', 'data-key': key, oninput: (e) => { st[key] = e.target.value; }, style: 'width:100%' }),
        h('button', { class: 'btn small primary', disabled: full || G.self.gold < a.price, onclick: () => req('buyAnimal', { type, name: st[key] }, (r) => { toast(r.msg, 'gold'); G.sfx.play('coin'); st[key] = ''; }) }, full ? 'Kandang penuh' : 'Beli'));
    })));
}

function costLine(cost) {
  return [`${fmt(cost.gold)}G`, ...Object.entries(cost.items).map(([id, q]) => `${q} ${itemIcon(id)} (punya ${G.self.inv[id] || 0})`)].join(' + ');
}

function renderUpgrades() {
  const plot = G.plots[G.self.plotId];
  const nextCan = CAN_LEVELS[G.self.canLevel + 1];
  const nextBarn = BARN_LEVELS[plot.barnLevel + 1];
  const card = (icon, name, now, next, kind) => h('div', { class: 'item-card' },
    h('div', { class: 'item-icon' }, icon),
    h('div', { class: 'item-name' }, name),
    h('div', { class: 'item-meta' }, `Sekarang: ${now}`),
    next ? [h('div', { class: 'item-meta' }, `Berikutnya: ${next.name}`), h('div', { class: 'price' }, costLine(next.cost)),
      h('button', { class: 'btn small gold', onclick: () => req('upgrade', { kind }, (r) => { toast(r.msg, 'gold'); G.sfx.play('trade'); }) }, 'Tingkatkan')]
      : h('div', { class: 'tag ok' }, 'Maksimal ✨'));
  return h('div', { class: 'grid' },
    card('🚿', 'Penyiram', `${CAN_LEVELS[G.self.canLevel].name} (${CAN_LEVELS[G.self.canLevel].capacity} air)`, nextCan && { ...nextCan, name: `${nextCan.name} (${nextCan.capacity} air)` }, 'can'),
    card('🏚️', 'Kandang', `${BARN_LEVELS[plot.barnLevel].name}`, nextBarn && { ...nextBarn, name: `${nextBarn.name} (${nextBarn.chicken} ayam, ${nextBarn.cow} sapi)` }, 'barn'));
}

// ------------------------------------------------------------------ ship

PANELS.ship = {
  icon: '📦', title: 'Kotak Pengiriman', sub: 'Barang dibayar setiap pagi sesuai harga pasar hari ini',
  render(cur) {
    const st = cur.state;
    const binLines = Object.entries(G.self.bin);
    const est = binLines.reduce((s, [id, q]) => s + shipPrice(id) * q, 0);
    const list = invEntries((_, it) => it.sell > 0);
    return h('div', { class: 'stack' },
      h('div', { class: 'item-card', style: 'animation:none' },
        h('div', { class: 'row spread' }, h('b', {}, '📦 Isi kotak hari ini'), h('span', { class: 'price' }, `≈ ${fmt(est)}G`)),
        binLines.length ? h('div', { class: 'row' }, binLines.map(([id, q]) => h('span', { class: 'chip' }, `${itemIcon(id)} ×${q}`))) : h('span', { class: 'muted' }, 'Masih kosong.')),
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
      })) : emptyState('🏚️', 'Kandang masih kosong. Beli ayam atau sapi di Toko Umum!'));
  },
};

// ---------------------------------------------------------------- market

PANELS.market = {
  icon: '⚖️', title: 'Pasar Pemain', sub: 'Jual-beli langsung antar petani, harga ditentukan pemain',
  tabs: [['buy', '🛒 Beli'], ['sell', '🏷️ Jual'], ['mine', () => `📋 Lapakku (${G.market.listings.filter((l) => l.sellerId === G.self.id).length})`], ['prices', '📈 Harga Kirim']],
  init: (args) => ({ tab: args.tab }),
  render(cur) {
    if (cur.state.tab) { cur.tab = cur.state.tab; delete cur.state.tab; }
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

// ------------------------------------------------------------------ sleep

PANELS.sleep = {
  icon: '🛏️', title: 'Rumah', small: true,
  render() {
    const online = [...G.players.values()].filter((p) => p.info.online);
    const sleeping = online.filter((p) => p.info.sleeping).length;
    if (G.self.sleeping) {
      return h('div', { class: 'stack' },
        h('div', { style: 'font-size:46px;text-align:center' }, '💤'),
        h('div', { style: 'text-align:center' }, `Menunggu pemain lain tidur… (${sleeping}/${online.length})`),
        h('div', { class: 'muted', style: 'text-align:center' }, 'Hari berganti saat semua pemain online tidur, atau otomatis pukul 02:00.'),
        h('button', { class: 'btn', onclick: () => G.request('sleep', { on: false }) }, 'Bangun'));
    }
    return h('div', { class: 'stack' },
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
  tabs: [['keys', '🎮 Kontrol'], ['farm', '🌱 Bertani'], ['trade', '🤝 Berdagang']],
  render(cur) {
    const rows = (list) => h('table', { class: 'list' }, list.map(([k, v]) => h('tr', { class: 'data' }, h('td', { style: 'width:170px' }, h('b', {}, k)), h('td', {}, v))));
    if (cur.tab === 'keys') {
      return rows([
        ['W A S D / Panah', 'Berjalan (tahan Shift untuk berlari)'],
        ['Mouse', 'Arahkan ke petak di dekatmu untuk memilih target'],
        ['Spasi / Klik kiri', 'Gunakan alat yang dipilih'],
        ['E', 'Interaksi: pintu, toko, kotak kirim, kandang, panen'],
        ['1 – 7', 'Ganti alat'],
        ['Q / R, Klik kanan + seret', 'Putar kamera'],
        ['Scroll / Z X', 'Zoom kamera'],
        ['I · M · P · H', 'Tas · Pasar · Pemain · Bantuan'],
        ['Enter', 'Chat'],
        ['Esc', 'Tutup jendela'],
      ]);
    }
    if (cur.tab === 'farm') {
      return rows([
        ['1. Bersihkan', 'Potong rumput liar (Sabit), pecah batu (Palu), tebang tunggul (Kapak).'],
        ['2. Cangkul', 'Gemburkan tanah dengan Cangkul.'],
        ['3. Tanam', 'Beli benih di Toko Umum, pegang benihnya (slot ✋), lalu tekan Spasi. Satu kantong = 3×3 petak.'],
        ['4. Siram', 'Siram setiap hari. Tanaman hanya tumbuh jika disiram (hujan menyiram otomatis). Isi ulang di sumur/kolam.'],
        ['5. Panen', 'Tanaman matang berkilau ✨. Tekan E atau gunakan ✋ untuk memanen.'],
        ['Musim', 'Setiap musim 28 hari. Tanaman di luar musimnya akan layu. Musim dingin: fokus ternak & memancing.'],
        ['Ternak', 'Beri makan setiap hari di kandang, elus agar kasih sayang naik. Hasil muncul keesokan pagi.'],
        ['Stamina', 'Setiap alat memakai stamina. Makan hasil panen/roti atau tidur untuk memulihkan.'],
        ['Memancing', 'Berdiri di tepi kolam kota, pilih Pancing, tekan Spasi. Saat ❗ muncul, tekan Spasi lagi!'],
      ]);
    }
    return rows([
      ['📦 Kotak Pengiriman', 'Jual ke desa. Dibayar tiap pagi dengan harga pasar harian (naik-turun sesuai pasokan semua pemain).'],
      ['⚖️ Pasar Pemain', 'Pajang barangmu dengan harga sendiri. Pemain lain bisa membeli kapan saja, bahkan saat kamu offline.'],
      ['🤝 Dagang Langsung', 'Buka daftar Pemain (P) lalu ajak dagang. Tukar barang & emas; terjadi saat kedua pihak setuju.'],
      ['💡 Tips', 'Kayu & batu dibutuhkan untuk meningkatkan kandang — beli dari pemain lain lebih murah daripada di toko!'],
      ['🔥 Permintaan', 'Satu barang setiap hari dibayar 1,5× — lihat di kiri atas.'],
    ]);
  },
};

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
    h('div', { class: 'muted', style: 'margin-top:16px;color:#bbb' }, 'Klik untuk melanjutkan'));
  const fade = $('fade');
  fade.classList.add('show');
  const done = () => { fade.classList.remove('show'); fade.onclick = null; onDone?.(); };
  fade.onclick = done;
  setTimeout(done, rep.lines.length ? 5500 : 3000);
}

export function updateSleepPanel() { refreshPanel('sleep'); }
