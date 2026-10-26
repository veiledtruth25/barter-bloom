import crypto from 'node:crypto';
import {
  FIELD_W, FIELD_H, DAYS_PER_SEASON, DAY_START_MIN, DAY_END_MIN, SLEEP_ALLOWED_MIN, MAX_STAMINA, REACH,
  MAX_LISTINGS, SEASONS, WEATHER_TABLE, STAMINA_COST, CAN_LEVELS, BARN_LEVELS, CROPS, ANIMALS, ITEMS,
  PREMIUM_AFFECTION, MAX_AFFECTION, FORAGE_BY_SEASON, START_GOLD, START_ITEMS, PLOT_CENTERS, plotLayout,
  TOWN, WILD_ZONES, WILD_TREES, WEATHER, nearWater, itemPrice, storeOpen,
} from '../shared/defs.js';
import {
  VILLAGERS, VILLAGER_IDS, MAX_FRIENDSHIP, TALK_POINTS, GIFT_POINTS, REQUEST_POINTS, MILESTONES, KNOCK_UNTIL,
  npcState, dayIndexOf, hearts, isBirthday, giftReaction, requestable, fillText, perkActive, storePrice, upgradeGold,
} from '../shared/villagers.js';

const ANIMAL_NAMES = ['Mimi', 'Kiko', 'Bubu', 'Popo', 'Lulu', 'Dodo', 'Nana', 'Cici', 'Momo', 'Toto', 'Pipi', 'Gogo'];
const COLORS = ['#e8553e', '#3e8ee8', '#e8b93e', '#8a3ee8', '#3ec98a', '#e83e9a', '#3ed6e8', '#f08a24'];

const uid = (p) => p + crypto.randomBytes(5).toString('hex');
const STORE_CLOSED = 'Toko Umum tutup. Pak Darto buka pukul 08:00–18:00.';
const MAX_REQUESTS = 3;
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const clampInt = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(n) || 0)));

const HEX = /^#[0-9a-f]{6}$/i;
const LOOK_OPTIONS = {
  hairStyle: ['short', 'spiky', 'long', 'bun', 'bald'],
  hat: ['straw', 'cap', 'bandana', 'none'],
};

export function sanitizeLook(look, shirt) {
  const l = look && typeof look === 'object' ? look : {};
  const pick = (v, list) => (list.includes(v) ? v : list[0]);
  const col = (v, d) => (HEX.test(v || '') ? v : d);
  return {
    skin: col(l.skin, '#f2c7a0'),
    hair: col(l.hair, '#5a3a22'),
    hairStyle: pick(l.hairStyle, LOOK_OPTIONS.hairStyle),
    hat: pick(l.hat, LOOK_OPTIONS.hat),
    shirt: col(l.shirt, shirt),
    pants: col(l.pants, '#3d5a8a'),
  };
}

class GameError extends Error {}
const fail = (msg) => { throw new GameError(msg); };

export class Game {
  constructor({ dayRealSeconds = 600, rng = Math.random, net = null, data = null } = {}) {
    this.rng = rng;
    this.net = net || { toPlayer() {}, broadcast() {} };
    this.minutesPerSecond = (DAY_END_MIN - DAY_START_MIN) / dayRealSeconds;
    this.trades = new Map();
    if (data) this.load(data);
    else this.reset();
  }

  // ------------------------------------------------------------------ state

  reset() {
    this.world = {
      day: 1, season: 0, year: 1, minute: DAY_START_MIN,
      weather: 'sunny', tomorrow: 'sunny',
    };
    this.players = {};
    this.plots = PLOT_CENTERS.map((_, i) => ({ id: i, ownerId: null, tiles: this.freshField(), barnLevel: 0, animals: [] }));
    this.wild = [];
    this.market = { listings: [], mult: {}, hot: null, trend: {} };
    this.requests = [];
    this.respawnWild(true);
    this.pickHotItem();
    this.refreshRequests();
  }

  load(data) {
    this.world = data.world;
    this.players = data.players;
    this.plots = data.plots;
    this.wild = data.wild;
    this.market = data.market;
    this.requests = data.requests || [];
    if (!this.requests.length) this.refreshRequests();
    for (const p of Object.values(this.players)) {
      p.look = p.look || sanitizeLook(null, p.color);
      p.rel = p.rel || {};
      p.npcChat = null;
      p.online = false;
      p.sleeping = false;
      p.fish = null;
      p.tradeId = null;
      p.tradeReq = null;
    }
  }

  serialize() {
    const players = {};
    for (const [id, p] of Object.entries(this.players)) {
      const { fish, tradeId, tradeReq, npcChat, ...rest } = p;
      players[id] = rest;
    }
    return { world: this.world, players, plots: this.plots, wild: this.wild, market: this.market, requests: this.requests };
  }

  freshField() {
    const tiles = [];
    for (let j = 0; j < FIELD_H; j++) {
      for (let i = 0; i < FIELD_W; i++) {
        const r = this.rng();
        let t = 'grass';
        if (r < 0.06) t = 'stump';
        else if (r < 0.14) t = 'rock';
        else if (r < 0.42) t = 'weed';
        tiles.push({ t, w: 0, c: null });
      }
    }
    return tiles;
  }

  get seasonId() { return SEASONS[this.world.season].id; }

  // ----------------------------------------------------------- serialization

  publicPlayer(p) {
    return { id: p.id, name: p.name, color: p.color, look: p.look, plotId: p.plotId, online: p.online, sleeping: p.sleeping, gold: p.gold, x: p.x, z: p.z, ry: p.ry || 0 };
  }

  privateState(p) {
    return {
      id: p.id, name: p.name, color: p.color, gold: p.gold, stamina: p.stamina, maxStamina: this.maxStamina(p),
      water: p.water, canLevel: p.canLevel, inv: p.inv, bin: p.bin, plotId: p.plotId, sleeping: p.sleeping,
      tradeId: p.tradeId, rel: p.rel,
    };
  }

  publicPlot(plot) {
    const owner = plot.ownerId ? this.players[plot.ownerId] : null;
    return {
      id: plot.id, ownerId: plot.ownerId, ownerName: owner?.name || null, color: owner?.color || null,
      tiles: plot.tiles, barnLevel: plot.barnLevel, animals: plot.animals,
    };
  }

  timeState() {
    return { ...this.world, hot: this.market.hot, rate: this.minutesPerSecond };
  }

  marketState() {
    const prices = {};
    for (const id of Object.keys(ITEMS)) {
      if (ITEMS[id].sell) prices[id] = { price: this.shipPrice(id), trend: this.market.trend[id] || 0 };
    }
    return { listings: this.market.listings, prices, hot: this.market.hot };
  }

  snapshot() {
    return {
      time: this.timeState(),
      players: Object.values(this.players).map((p) => this.publicPlayer(p)),
      plots: this.plots.map((pl) => this.publicPlot(pl)),
      wild: this.wild,
      market: this.marketState(),
      requests: this.requests,
    };
  }

  // ------------------------------------------------------------- networking

  sendSelf(p) { this.net.toPlayer(p.id, 'self', this.privateState(p)); }
  sendPlot(plot) { this.net.broadcast('plot', this.publicPlot(plot)); }
  sendWild() { this.net.broadcast('wild', this.wild); }
  sendMarket() { this.net.broadcast('market', this.marketState()); }
  sendPlayerInfo(p) { this.net.broadcast('player', this.publicPlayer(p)); }
  sendRequests() { this.net.broadcast('requests', this.requests); }
  toast(p, text, kind = 'info') { this.net.toPlayer(p.id, 'toast', { text, kind }); }
  fx(type, x, z, extra = {}) { this.net.broadcast('fx', { type, x, z, ...extra }); }

  // ------------------------------------------------------------------ joins

  join({ name, token, color, look }) {
    name = String(name || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16);
    if (token) {
      const existing = Object.values(this.players).find((p) => p.token === token);
      if (existing) {
        if (look) existing.look = sanitizeLook(look, existing.color);
        return existing;
      }
    }
    if (name.length < 2) fail('Nama minimal 2 karakter.');
    if (Object.values(this.players).some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      fail('Nama sudah dipakai petani lain. Pilih nama lain.');
    }
    const plot = this.plots.find((pl) => !pl.ownerId);
    if (!plot) fail('Semua ladang sudah dimiliki (maks 8 petani).');
    const L = plotLayout(plot.id);
    const p = {
      id: uid('p'), token: crypto.randomBytes(16).toString('hex'), name,
      color: HEX.test(color || '') ? color : COLORS[plot.id % COLORS.length],
      gold: START_GOLD, stamina: MAX_STAMINA, water: CAN_LEVELS[0].capacity, canLevel: 0,
      inv: { ...START_ITEMS }, bin: {}, plotId: plot.id,
      look: null,
      x: L.houseDoor.x + 1, z: L.houseDoor.z, ry: 0, online: false, sleeping: false,
      lastReport: null, fish: null, tradeId: null, tradeReq: null, rel: {}, npcChat: null,
    };
    p.look = sanitizeLook(look, p.color);
    plot.ownerId = p.id;
    this.players[p.id] = p;
    this.sendPlot(plot);
    return p;
  }

  setOnline(p, online) {
    p.online = online;
    if (!online) {
      p.sleeping = false;
      p.fish = null;
      if (p.tradeId) this.closeTrade(p.tradeId, `${p.name} keluar dari permainan.`);
    }
    this.sendPlayerInfo(p);
    if (!online) this.checkAllSleeping();
  }

  move(p, { x, z, ry }) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    // Light sanity check against teleport hacks; client handles collision.
    if (dist(p.x, p.z, x, z) > 12 && !p.sleeping) return;
    p.x = x;
    p.z = z;
    p.ry = Number.isFinite(ry) ? ry : p.ry;
    if (p.sleeping) {
      p.sleeping = false;
      this.sendPlayerInfo(p);
    }
  }

  // ------------------------------------------------------------------- time

  tick(dt) {
    this.world.minute += dt * this.minutesPerSecond;
    if (this.world.minute >= DAY_END_MIN) this.endDay(true);
  }

  endDay(passedOut = false) {
    const reports = {};
    const shipped = {};
    // 1. Shipping bins pay out at the current market price.
    for (const p of Object.values(this.players)) {
      const lines = [];
      let total = 0;
      // Bu Ratna's merchant contacts pay a little extra.
      const bonus = perkActive(p.rel, 'ratna') ? 1.05 : 1;
      for (const [id, qty] of Object.entries(p.bin)) {
        const price = Math.round(this.shipPrice(id) * bonus);
        lines.push({ id, qty, price });
        total += price * qty;
        shipped[id] = (shipped[id] || 0) + qty;
      }
      p.gold += total;
      p.bin = {};
      reports[p.id] = { lines, total, notes: [], passedOut: passedOut && p.online && !p.sleeping };
    }
    // 2. Supply & demand: heavily shipped goods drop in price, others recover.
    const trend = {};
    for (const id of Object.keys(ITEMS)) {
      if (!ITEMS[id].sell) continue;
      const before = this.shipPrice(id);
      let m = this.market.mult[id] ?? 1;
      m += (1 - m) * 0.2;
      if (shipped[id]) m -= shipped[id] * 0.004;
      m = Math.max(0.5, Math.min(1.3, m + (this.rng() - 0.5) * 0.04));
      this.market.mult[id] = Math.round(m * 1000) / 1000;
      trend[id] = before;
    }
    // 3. Calendar & weather.
    const w = this.world;
    const oldSeason = w.season;
    w.day += 1;
    if (w.day > DAYS_PER_SEASON) {
      w.day = 1;
      w.season = (w.season + 1) % 4;
      if (w.season === 0) w.year += 1;
    }
    w.minute = DAY_START_MIN;
    w.weather = w.tomorrow;
    w.tomorrow = this.rollWeather(SEASONS[w.season].id);
    if (SEASONS[w.season].id === 'winter' && w.weather === 'rain') w.weather = 'snow';
    const seasonChanged = oldSeason !== w.season;
    const wet = w.weather === 'rain' || w.weather === 'storm';

    // 4. Crops grow if they were watered yesterday.
    for (const plot of this.plots) {
      for (const tile of plot.tiles) {
        if (tile.c && !tile.c.withered && tile.w) {
          if (tile.c.g < CROPS[tile.c.id].days) tile.c.g += 1;
        }
        if (seasonChanged && tile.c && CROPS[tile.c.id].season !== this.seasonId) tile.c.withered = true;
        tile.w = tile.t === 'soil' && wet ? 1 : 0;
        if (tile.t === 'grass' && !tile.c && plot.ownerId && this.rng() < 0.012) tile.t = 'weed';
      }
      // 5. Animals produce if fed.
      for (const a of plot.animals) {
        const def = ANIMALS[a.type];
        if (a.fed) {
          a.aff = Math.min(MAX_AFFECTION, a.aff + 1);
          if (!a.prod) a.prod = a.aff >= PREMIUM_AFFECTION ? def.premium : def.product;
        } else {
          a.aff = Math.max(0, a.aff - 3);
        }
        a.fed = false;
        a.petted = false;
      }
    }
    // 6. Villagers: friendship perks, birthdays and new requests.
    this.villagerMorning(reports);
    // 7. Wild area respawns.
    this.respawnWild(false);
    this.pickHotItem();
    for (const id of Object.keys(trend)) {
      const now = this.shipPrice(id);
      this.market.trend[id] = now > trend[id] ? 1 : now < trend[id] ? -1 : 0;
    }
    // 8. Everyone wakes up.
    for (const p of Object.values(this.players)) {
      const rep = reports[p.id];
      const max = this.maxStamina(p);
      p.stamina = rep.passedOut ? Math.round(max * 0.6) : max;
      if (p.sleeping || !p.online) {
        const L = plotLayout(p.plotId);
        p.x = L.houseDoor.x + 1;
        p.z = L.houseDoor.z;
      }
      p.sleeping = false;
      p.fish = null;
      p.lastReport = { ...rep, day: w.day, season: w.season, year: w.year, weather: w.weather };
    }
    this.net.broadcast('time', this.timeState());
    for (const plot of this.plots) this.sendPlot(plot);
    this.sendWild();
    this.sendMarket();
    this.sendRequests();
    for (const p of Object.values(this.players)) {
      if (!p.online) continue;
      this.sendPlayerInfo(p);
      this.sendSelf(p);
      this.net.toPlayer(p.id, 'dayStart', { report: p.lastReport, x: p.x, z: p.z, seasonChanged });
    }
  }

  rollWeather(season) {
    let r = this.rng();
    for (const [id, pr] of WEATHER_TABLE[season]) {
      if ((r -= pr) <= 0) return id;
    }
    return 'sunny';
  }

  pickHotItem() {
    const s = this.seasonId;
    const pool = Object.keys(ITEMS).filter((id) => ITEMS[id].sell && (ITEMS[id].type === 'crop' ? ITEMS[id].season === s : ITEMS[id].type !== 'material'));
    this.market.hot = pool[Math.floor(this.rng() * pool.length)] || null;
  }

  shipPrice(id) {
    const hot = this.market.hot === id ? 1.5 : 1;
    return itemPrice(id, (this.market.mult[id] ?? 1) * hot);
  }

  respawnWild(initial) {
    const forage = FORAGE_BY_SEASON[this.seasonId];
    const count = (k) => this.wild.filter((o) => o.k === k).length;
    // Forage is seasonal: old-season items vanish each morning.
    this.wild = this.wild.filter((o) => o.k !== 'forage');
    const targets = { stump: initial ? 14 : Math.min(14, count('stump') + 3), rock: initial ? 14 : Math.min(14, count('rock') + 3), forage: 16 };
    for (const k of ['stump', 'rock', 'forage']) {
      let tries = 0;
      while (count(k) < targets[k] && tries++ < 400) {
        const z = WILD_ZONES[Math.floor(this.rng() * WILD_ZONES.length)];
        const x = z.x0 + 1 + this.rng() * (z.x1 - z.x0 - 2);
        const zz = z.z0 + 1 + this.rng() * (z.z1 - z.z0 - 2);
        if (nearWater(x, zz, 1.5)) continue;
        if (WILD_TREES.some((t) => dist(t.x, t.z, x, zz) < 1.6)) continue;
        if (this.wild.some((o) => dist(o.x, o.z, x, zz) < 1.5)) continue;
        const o = { id: uid('w'), k, x: Math.round(x * 100) / 100, z: Math.round(zz * 100) / 100 };
        if (k === 'forage') o.item = forage[Math.floor(this.rng() * forage.length)];
        this.wild.push(o);
      }
    }
  }

  // ---------------------------------------------------------- helpers

  addItem(p, id, qty = 1) { p.inv[id] = (p.inv[id] || 0) + qty; }
  takeItem(p, id, qty = 1) {
    if ((p.inv[id] || 0) < qty) return false;
    p.inv[id] -= qty;
    if (p.inv[id] <= 0) delete p.inv[id];
    return true;
  }
  hasCost(p, cost) {
    if (p.gold < (cost.gold || 0)) return false;
    return Object.entries(cost.items || {}).every(([id, q]) => (p.inv[id] || 0) >= q);
  }
  payCost(p, cost) {
    p.gold -= cost.gold || 0;
    for (const [id, q] of Object.entries(cost.items || {})) this.takeItem(p, id, q);
  }
  costText(cost) {
    const parts = [`${cost.gold}G`];
    for (const [id, q] of Object.entries(cost.items || {})) parts.push(`${q} ${ITEMS[id].name}`);
    return parts.join(' + ');
  }
  maxStamina(p) {
    return MAX_STAMINA + (perkActive(p.rel, 'harjo') ? 20 : 0);
  }
  useStamina(p, tool) {
    const cost = STAMINA_COST[tool] || 0;
    if (p.stamina < cost) fail('Kamu terlalu lelah... Makan sesuatu atau tidur dulu.');
    p.stamina -= cost;
  }

  tileAt(x, z) {
    for (const plot of this.plots) {
      const L = plotLayout(plot.id);
      const i = Math.floor(x - L.ox);
      const j = Math.floor(z - L.oz);
      if (i >= 0 && i < FIELD_W && j >= 0 && j < FIELD_H) {
        return { plot, i, j, tile: plot.tiles[j * FIELD_W + i], cx: L.ox + i + 0.5, cz: L.oz + j + 0.5 };
      }
    }
    return null;
  }

  nearestWild(x, z, kinds, r = 1.4) {
    let best = null;
    let bd = r;
    for (const o of this.wild) {
      if (!kinds.includes(o.k)) continue;
      const d = dist(o.x, o.z, x, z);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // ---------------------------------------------------------------- actions

  action(p, { tool, x, z, item }) {
    if (p.sleeping) fail('Kamu sedang tidur.');
    if (!Number.isFinite(x) || !Number.isFinite(z)) fail('Target tidak valid.');
    if (dist(p.x, p.z, x, z) > REACH) fail('Terlalu jauh.');
    const hit = this.tileAt(x, z);
    if (hit && hit.plot.ownerId !== p.id && tool !== 'can') {
      const owner = this.players[hit.plot.ownerId];
      fail(owner ? `Ini ladang milik ${owner.name}.` : 'Ladang ini belum ada pemiliknya.');
    }
    switch (tool) {
      case 'hoe': return this.useHoe(p, hit);
      case 'can': return this.useCan(p, hit, x, z);
      case 'sickle': return this.useSickle(p, hit);
      case 'axe': return this.useAxe(p, hit, x, z);
      case 'hammer': return this.useHammer(p, hit, x, z);
      case 'hand': return this.useHand(p, hit, x, z, item);
      default: fail('Alat tidak dikenal.');
    }
  }

  useHoe(p, hit) {
    if (!hit) fail('Tidak bisa mencangkul di sini.');
    const { tile } = hit;
    if (tile.t === 'weed') fail('Potong rumput liar dulu dengan Sabit.');
    if (tile.t === 'rock') fail('Ada batu. Gunakan Palu.');
    if (tile.t === 'stump') fail('Ada tunggul. Gunakan Kapak.');
    if (tile.t === 'soil' && tile.c && !tile.c.withered) fail('Ada tanaman di sini.');
    if (tile.t === 'soil' && !tile.c) fail('Tanah sudah gembur.');
    this.useStamina(p, 'hoe');
    tile.t = 'soil';
    tile.c = null;
    this.after(p, hit, 'dirt');
    return { ok: true };
  }

  useCan(p, hit, x, z) {
    const L = plotLayout(p.plotId);
    const atWell = dist(x, z, L.well.x, L.well.z) < 1.8 || dist(p.x, p.z, L.well.x, L.well.z) < 2.2;
    if (atWell || nearWater(x, z, 0.6) || nearWater(p.x, p.z, 1.6)) {
      p.water = CAN_LEVELS[p.canLevel].capacity;
      this.sendSelf(p);
      this.fx('refill', x, z);
      return { ok: true, msg: 'Penyiram terisi penuh!' };
    }
    if (!hit || hit.tile.t !== 'soil') fail('Siram tanah yang sudah dicangkul.');
    // Watering a neighbour's crops is allowed as a friendly gesture.
    if (!hit.plot.ownerId) fail('Ladang ini belum ada pemiliknya.');
    if (p.water <= 0) fail('Air habis! Isi ulang di sumur atau kolam.');
    if (hit.tile.w) fail('Sudah disiram.');
    this.useStamina(p, 'can');
    p.water -= 1;
    hit.tile.w = 1;
    this.after(p, hit, 'water');
    return { ok: true };
  }

  useSickle(p, hit) {
    if (!hit) fail('Tidak ada yang bisa dipotong.');
    const { tile } = hit;
    let msg;
    if (tile.t === 'weed') {
      tile.t = 'grass';
      if (this.rng() < 0.5) { this.addItem(p, 'fodder'); msg = '+1 Rumput Pakan'; }
    } else if (tile.c && tile.c.withered) {
      tile.c = null;
    } else fail('Tidak ada yang bisa dipotong.');
    this.useStamina(p, 'sickle');
    this.after(p, hit, 'leaves');
    return { ok: true, msg };
  }

  useAxe(p, hit, x, z) {
    if (hit) {
      if (hit.tile.t !== 'stump') fail('Tidak ada tunggul di sini.');
      this.useStamina(p, 'axe');
      hit.tile.t = 'grass';
      this.addItem(p, 'lumber', 3);
      this.after(p, hit, 'wood');
      return { ok: true, msg: '+3 Kayu' };
    }
    const o = this.nearestWild(x, z, ['stump']);
    if (!o) fail('Tidak ada tunggul di sini.');
    this.useStamina(p, 'axe');
    this.wild = this.wild.filter((w) => w !== o);
    this.addItem(p, 'lumber', 4);
    this.afterWild(p, o, 'wood');
    return { ok: true, msg: '+4 Kayu' };
  }

  useHammer(p, hit, x, z) {
    if (hit) {
      const { tile } = hit;
      if (tile.t === 'rock') {
        this.useStamina(p, 'hammer');
        tile.t = 'grass';
        this.addItem(p, 'stone', 2);
        this.after(p, hit, 'stone');
        return { ok: true, msg: '+2 Batu' };
      }
      if (tile.t === 'soil' && !tile.c) {
        this.useStamina(p, 'hammer');
        tile.t = 'grass';
        tile.w = 0;
        this.after(p, hit, 'dirt');
        return { ok: true };
      }
      fail('Tidak ada batu di sini.');
    }
    const o = this.nearestWild(x, z, ['rock']);
    if (!o) fail('Tidak ada batu di sini.');
    this.useStamina(p, 'hammer');
    this.wild = this.wild.filter((w) => w !== o);
    this.addItem(p, 'stone', 3);
    let msg = '+3 Batu';
    if (this.rng() < 0.08) { this.addItem(p, 'gem'); msg += ', +1 Permata!'; }
    this.afterWild(p, o, 'stone');
    return { ok: true, msg };
  }

  useHand(p, hit, x, z, item) {
    if (hit) {
      const { tile } = hit;
      if (tile.c && !tile.c.withered && tile.c.g >= CROPS[tile.c.id].days) {
        const cropId = tile.c.id;
        const crop = CROPS[cropId];
        this.addItem(p, cropId);
        if (crop.regrow) tile.c.g = crop.days - crop.regrow;
        else tile.c = null;
        this.after(p, hit, 'harvest', { item: cropId });
        return { ok: true, msg: `+1 ${crop.name}` };
      }
      const def = ITEMS[item];
      if (def && def.type === 'seed') return this.plant(p, hit, item);
    }
    const o = this.nearestWild(x, z, ['forage'], 1.6);
    if (o) {
      this.wild = this.wild.filter((w) => w !== o);
      this.addItem(p, o.item);
      this.afterWild(p, o, 'harvest', { item: o.item });
      return { ok: true, msg: `+1 ${ITEMS[o.item].name}` };
    }
    if (item && ITEMS[item]?.eat) return this.eat(p, item);
    if (hit && hit.tile.c && !hit.tile.c.withered) fail('Tanaman belum siap dipanen.');
    fail('Tidak ada yang bisa diambil.');
  }

  plant(p, hit, seedId) {
    const seed = ITEMS[seedId];
    const crop = CROPS[seed.crop];
    if (crop.season !== this.seasonId) fail(`${crop.name} hanya bisa ditanam di ${SEASONS.find((s) => s.id === crop.season).name}.`);
    if (!p.inv[seedId]) fail('Kamu tidak punya benih itu.');
    // Like the classic seed bag: one bag sows a 3x3 patch of tilled soil.
    let planted = 0;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const i = hit.i + di, j = hit.j + dj;
        if (i < 0 || j < 0 || i >= FIELD_W || j >= FIELD_H) continue;
        const t = hit.plot.tiles[j * FIELD_W + i];
        if (t.t === 'soil' && !t.c) {
          t.c = { id: seed.crop, g: 0, withered: false };
          planted++;
        }
      }
    }
    if (!planted) fail('Cangkul tanahnya dulu sebelum menanam.');
    this.takeItem(p, seedId);
    this.after(p, hit, 'plant');
    return { ok: true, msg: `${planted} petak ditanami ${crop.name}` };
  }

  eat(p, itemId) {
    const def = ITEMS[itemId];
    if (!def || !def.eat) fail('Itu tidak bisa dimakan.');
    const max = this.maxStamina(p);
    if (p.stamina >= max) fail('Kamu sudah kenyang & bertenaga!');
    if (!this.takeItem(p, itemId)) fail('Kamu tidak punya itu.');
    p.stamina = Math.min(max, p.stamina + def.eat);
    this.sendSelf(p);
    this.fx('eat', p.x, p.z, { pid: p.id });
    return { ok: true, msg: `Nyam! +${def.eat} stamina` };
  }

  after(p, hit, fx, extra = {}) {
    this.sendPlot(hit.plot);
    this.sendSelf(p);
    this.fx(fx, hit.cx, hit.cz, { pid: p.id, ...extra });
  }

  afterWild(p, o, fx, extra = {}) {
    this.sendWild();
    this.sendSelf(p);
    this.fx(fx, o.x, o.z, { pid: p.id, ...extra });
  }

  // ---------------------------------------------------------------- fishing

  fishCast(p) {
    if (p.sleeping) fail('Kamu sedang tidur.');
    if (!nearWater(p.x, p.z, 1.8)) fail('Berdirilah di tepi kolam untuk memancing.');
    if (p.fish) fail('Kail sudah dilempar.');
    this.useStamina(p, 'rod');
    const wait = 1500 + this.rng() * 4500;
    p.fish = { biteAt: Date.now() + wait };
    this.sendSelf(p);
    return { ok: true, biteIn: wait };
  }

  fishReel(p) {
    const f = p.fish;
    p.fish = null;
    if (!f) fail('Kamu tidak sedang memancing.');
    const now = Date.now();
    if (now < f.biteAt) fail('Terlalu cepat! Ikannya kabur...');
    // Pak Bayu's tips: a longer bite window and better odds for big fish.
    const pro = perkActive(p.rel, 'bayu');
    if (now > f.biteAt + (pro ? 1900 : 1400)) fail('Terlambat... ikannya lepas.');
    const r = this.rng();
    const odds = pro ? [0.03, 0.22, 0.52] : [0.02, 0.15, 0.45];
    const id = r < odds[0] ? 'fish_legend' : r < odds[1] ? 'fish_l' : r < odds[2] ? 'fish_m' : 'fish_s';
    this.addItem(p, id);
    this.sendSelf(p);
    this.fx('splash', p.x, p.z, { pid: p.id, item: id });
    return { ok: true, item: id, msg: `Dapat ${ITEMS[id].name}!` };
  }

  // ---------------------------------------------------------- buildings

  requireNear(p, pt, r, msg) {
    if (dist(p.x, p.z, pt.x, pt.z) > r) fail(msg);
  }

  ship(p, { item, qty }) {
    const L = plotLayout(p.plotId);
    this.requireNear(p, L.bin, 4, 'Pergi ke kotak pengiriman di ladangmu.');
    const def = ITEMS[item];
    qty = clampInt(qty, 1, 9999);
    if (!def || !def.sell) fail('Barang itu tidak bisa dikirim.');
    if (!this.takeItem(p, item, qty)) fail('Jumlah tidak cukup.');
    p.bin[item] = (p.bin[item] || 0) + qty;
    this.sendSelf(p);
    this.fx('ship', L.bin.x, L.bin.z, { pid: p.id, item });
    return { ok: true, msg: `${qty} ${def.name} masuk kotak pengiriman.` };
  }

  buy(p, { item, qty }) {
    this.requireNear(p, TOWN.store.door, 7, 'Kamu harus berada di Toko Umum.');
    if (!storeOpen(this.world.minute)) fail(STORE_CLOSED);
    const def = ITEMS[item];
    qty = clampInt(qty, 1, 999);
    if (!def || !def.buy) fail('Barang tidak dijual.');
    if (def.type === 'seed' && def.season !== this.seasonId) fail('Benih ini tidak dijual musim ini.');
    const cost = storePrice(def.buy, p.rel) * qty;
    if (p.gold < cost) fail('Uangmu tidak cukup.');
    p.gold -= cost;
    this.addItem(p, item, qty);
    this.sendSelf(p);
    this.sendPlayerInfo(p);
    return { ok: true, msg: `Membeli ${qty} ${def.name} (-${cost}G)` };
  }

  buyAnimal(p, { type, name }) {
    this.requireNear(p, TOWN.store.door, 7, 'Kamu harus berada di Toko Umum.');
    if (!storeOpen(this.world.minute)) fail(STORE_CLOSED);
    const def = ANIMALS[type];
    if (!def) fail('Hewan tidak dikenal.');
    const plot = this.plots[p.plotId];
    const cap = BARN_LEVELS[plot.barnLevel][type];
    if (plot.animals.filter((a) => a.type === type).length >= cap) fail(`Kandang penuh! Tingkatkan kandang untuk menampung lebih banyak ${def.name}.`);
    const price = storePrice(def.price, p.rel);
    if (p.gold < price) fail('Uangmu tidak cukup.');
    p.gold -= price;
    name = String(name || '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 12) || ANIMAL_NAMES[Math.floor(this.rng() * ANIMAL_NAMES.length)];
    plot.animals.push({ id: uid('a'), type, name, aff: 10, fed: false, petted: false, prod: null });
    this.sendSelf(p);
    this.sendPlot(plot);
    return { ok: true, msg: `${def.name} "${name}" dikirim ke kandangmu!` };
  }

  upgradeCost(p, cost) {
    return { ...cost, gold: upgradeGold(cost.gold, p.rel) };
  }

  upgrade(p, { kind }) {
    this.requireNear(p, TOWN.store.door, 7, 'Kamu harus berada di Toko Umum.');
    if (!storeOpen(this.world.minute)) fail(STORE_CLOSED);
    if (kind === 'can') {
      const next = CAN_LEVELS[p.canLevel + 1];
      if (!next) fail('Penyiram sudah maksimal.');
      const cost = this.upgradeCost(p, next.cost);
      if (!this.hasCost(p, cost)) fail(`Butuh ${this.costText(cost)}.`);
      this.payCost(p, cost);
      p.canLevel += 1;
      p.water = next.capacity;
      this.sendSelf(p);
      return { ok: true, msg: `${next.name} siap dipakai!` };
    }
    if (kind === 'barn') {
      const plot = this.plots[p.plotId];
      const next = BARN_LEVELS[plot.barnLevel + 1];
      if (!next) fail('Kandang sudah maksimal.');
      const cost = this.upgradeCost(p, next.cost);
      if (!this.hasCost(p, cost)) fail(`Butuh ${this.costText(cost)}.`);
      this.payCost(p, cost);
      plot.barnLevel += 1;
      this.sendSelf(p);
      this.sendPlot(plot);
      return { ok: true, msg: `${next.name} selesai dibangun!` };
    }
    fail('Peningkatan tidak dikenal.');
  }

  barn(p, { op, animalId }) {
    const L = plotLayout(p.plotId);
    this.requireNear(p, L.barnDoor, 4.5, 'Pergi ke kandangmu.');
    const plot = this.plots[p.plotId];
    let msg;
    if (op === 'feed') {
      let fed = 0, missing = 0;
      for (const a of plot.animals) {
        if (a.fed) continue;
        if (this.takeItem(p, ANIMALS[a.type].feed)) { a.fed = true; fed++; } else missing++;
      }
      if (!fed && !missing) fail('Semua hewan sudah diberi makan.');
      if (!fed) fail('Kamu tidak punya pakan! Beli di Toko Umum atau potong rumput liar.');
      msg = `${fed} hewan diberi makan${missing ? `, ${missing} belum (pakan kurang)` : ''}.`;
    } else if (op === 'pet') {
      const a = plot.animals.find((x) => x.id === animalId);
      if (!a) fail('Hewan tidak ditemukan.');
      if (a.petted) fail(`${a.name} sudah dielus hari ini.`);
      a.petted = true;
      a.aff = Math.min(MAX_AFFECTION, a.aff + 2);
      msg = `${a.name} senang! ❤`;
    } else if (op === 'collect') {
      let n = 0;
      for (const a of plot.animals) {
        if (a.prod) { this.addItem(p, a.prod); a.prod = null; n++; }
      }
      if (!n) fail('Belum ada hasil ternak.');
      msg = `Mengumpulkan ${n} hasil ternak.`;
    } else fail('Perintah tidak dikenal.');
    this.sendSelf(p);
    this.sendPlot(plot);
    return { ok: true, msg };
  }

  sleep(p, on) {
    if (!on) {
      p.sleeping = false;
      this.sendPlayerInfo(p);
      this.sendSelf(p);
      return { ok: true };
    }
    const L = plotLayout(p.plotId);
    this.requireNear(p, L.houseDoor, 4, 'Pulang ke rumahmu untuk tidur.');
    if (this.world.minute < SLEEP_ALLOWED_MIN) fail('Masih terlalu sore untuk tidur (bisa tidur mulai 18:00).');
    p.sleeping = true;
    this.sendPlayerInfo(p);
    this.sendSelf(p);
    this.checkAllSleeping();
    return { ok: true };
  }

  checkAllSleeping() {
    const online = Object.values(this.players).filter((p) => p.online);
    if (online.length && online.every((p) => p.sleeping)) this.endDay(false);
  }

  // ---------------------------------------------------------------- market

  marketList(p, { item, qty, price }) {
    const def = ITEMS[item];
    qty = clampInt(qty, 1, 9999);
    price = clampInt(price, 1, 999999);
    if (!def) fail('Barang tidak dikenal.');
    if (this.market.listings.filter((l) => l.sellerId === p.id).length >= MAX_LISTINGS) fail(`Maksimal ${MAX_LISTINGS} lapak aktif.`);
    if (!this.takeItem(p, item, qty)) fail('Jumlah barang tidak cukup.');
    const l = { id: uid('l'), sellerId: p.id, sellerName: p.name, item, qty, price, at: Date.now() };
    this.market.listings.push(l);
    this.sendSelf(p);
    this.sendMarket();
    this.net.broadcast('feed', { text: `${p.name} menjual ${qty} ${def.icon} ${def.name} @${price}G di Pasar.` });
    return { ok: true, msg: 'Barang dipajang di Pasar!' };
  }

  marketBuy(p, { id, qty }) {
    const l = this.market.listings.find((x) => x.id === id);
    if (!l) fail('Lapak sudah tidak tersedia.');
    if (l.sellerId === p.id) fail('Itu lapakmu sendiri.');
    qty = clampInt(qty, 1, l.qty);
    const cost = qty * l.price;
    if (p.gold < cost) fail('Uangmu tidak cukup.');
    p.gold -= cost;
    this.addItem(p, l.item, qty);
    l.qty -= qty;
    if (l.qty <= 0) this.market.listings = this.market.listings.filter((x) => x !== l);
    const seller = this.players[l.sellerId];
    if (seller) {
      seller.gold += cost;
      if (seller.online) {
        this.sendSelf(seller);
        this.toast(seller, `💰 ${p.name} membeli ${qty} ${ITEMS[l.item].name} darimu (+${cost}G)`, 'gold');
      }
      this.sendPlayerInfo(seller);
    }
    this.sendSelf(p);
    this.sendPlayerInfo(p);
    this.sendMarket();
    return { ok: true, msg: `Membeli ${qty} ${ITEMS[l.item].name} (-${cost}G)` };
  }

  marketCancel(p, { id }) {
    const l = this.market.listings.find((x) => x.id === id && x.sellerId === p.id);
    if (!l) fail('Lapak tidak ditemukan.');
    this.market.listings = this.market.listings.filter((x) => x !== l);
    this.addItem(p, l.item, l.qty);
    this.sendSelf(p);
    this.sendMarket();
    return { ok: true, msg: 'Lapak ditutup, barang kembali ke tas.' };
  }

  // ------------------------------------------------------------ direct trade

  tradeRequest(p, { target }) {
    const t = this.players[target];
    if (!t || !t.online) fail('Pemain tidak online.');
    if (t.id === p.id) fail('Tidak bisa berdagang dengan diri sendiri.');
    if (p.tradeId) fail('Kamu sedang berdagang.');
    if (t.tradeId) fail(`${t.name} sedang berdagang dengan orang lain.`);
    t.tradeReq = { from: p.id, at: Date.now() };
    this.net.toPlayer(t.id, 'trade:request', { from: p.id, name: p.name, color: p.color });
    return { ok: true, msg: `Permintaan dagang dikirim ke ${t.name}.` };
  }

  tradeRespond(p, { from, accept }) {
    const req = p.tradeReq;
    p.tradeReq = null;
    const a = this.players[from];
    if (!req || req.from !== from || Date.now() - req.at > 60000 || !a || !a.online) fail('Permintaan dagang sudah kedaluwarsa.');
    if (!accept) {
      this.toast(a, `${p.name} menolak ajakan dagang.`);
      return { ok: true };
    }
    if (a.tradeId || p.tradeId) fail('Salah satu pemain sedang berdagang.');
    const tr = {
      id: uid('t'), a: a.id, b: p.id,
      offer: { [a.id]: { items: {}, gold: 0 }, [p.id]: { items: {}, gold: 0 } },
      ok: { [a.id]: false, [p.id]: false },
    };
    this.trades.set(tr.id, tr);
    a.tradeId = tr.id;
    p.tradeId = tr.id;
    this.pushTrade(tr, 'trade:open');
    return { ok: true };
  }

  tradeView(tr) {
    const pa = this.players[tr.a], pb = this.players[tr.b];
    return {
      id: tr.id,
      sides: [
        { id: pa.id, name: pa.name, color: pa.color, ...tr.offer[pa.id], ok: tr.ok[pa.id] },
        { id: pb.id, name: pb.name, color: pb.color, ...tr.offer[pb.id], ok: tr.ok[pb.id] },
      ],
    };
  }

  pushTrade(tr, ev = 'trade:state') {
    const v = this.tradeView(tr);
    this.net.toPlayer(tr.a, ev, v);
    this.net.toPlayer(tr.b, ev, v);
  }

  tradeUpdate(p, { items, gold }) {
    const tr = this.trades.get(p.tradeId);
    if (!tr) fail('Tidak ada sesi dagang.');
    const clean = {};
    for (const [id, q] of Object.entries(items || {})) {
      const n = clampInt(q, 0, 9999);
      if (!ITEMS[id] || n <= 0) continue;
      if ((p.inv[id] || 0) < n) fail(`${ITEMS[id].name} kamu tidak cukup.`);
      clean[id] = n;
    }
    gold = clampInt(gold, 0, 1e9);
    if (gold > p.gold) fail('Emasmu tidak cukup.');
    tr.offer[p.id] = { items: clean, gold };
    tr.ok[tr.a] = false;
    tr.ok[tr.b] = false;
    this.pushTrade(tr);
    return { ok: true };
  }

  tradeConfirm(p) {
    const tr = this.trades.get(p.tradeId);
    if (!tr) fail('Tidak ada sesi dagang.');
    tr.ok[p.id] = true;
    if (!(tr.ok[tr.a] && tr.ok[tr.b])) {
      this.pushTrade(tr);
      return { ok: true };
    }
    const A = this.players[tr.a], B = this.players[tr.b];
    const oa = tr.offer[A.id], ob = tr.offer[B.id];
    const can = (pl, o) => pl.gold >= o.gold && Object.entries(o.items).every(([id, q]) => (pl.inv[id] || 0) >= q);
    if (!can(A, oa) || !can(B, ob)) {
      tr.ok[tr.a] = tr.ok[tr.b] = false;
      this.pushTrade(tr);
      fail('Penawaran tidak valid lagi (barang/emas berubah).');
    }
    const move = (from, to, o) => {
      from.gold -= o.gold;
      to.gold += o.gold;
      for (const [id, q] of Object.entries(o.items)) { this.takeItem(from, id, q); this.addItem(to, id, q); }
    };
    move(A, B, oa);
    move(B, A, ob);
    this.trades.delete(tr.id);
    A.tradeId = B.tradeId = null;
    for (const pl of [A, B]) {
      this.sendSelf(pl);
      this.sendPlayerInfo(pl);
      this.net.toPlayer(pl.id, 'trade:done', { text: `Perdagangan dengan ${(pl === A ? B : A).name} berhasil! 🤝` });
    }
    this.net.broadcast('feed', { text: `${A.name} 🤝 ${B.name} menyelesaikan perdagangan.` });
    return { ok: true };
  }

  tradeCancel(p) {
    if (!p.tradeId) return { ok: true };
    this.closeTrade(p.tradeId, `${p.name} membatalkan perdagangan.`);
    return { ok: true };
  }

  closeTrade(id, reason) {
    const tr = this.trades.get(id);
    if (!tr) return;
    this.trades.delete(id);
    for (const pid of [tr.a, tr.b]) {
      const pl = this.players[pid];
      if (!pl) continue;
      pl.tradeId = null;
      this.net.toPlayer(pid, 'trade:closed', { text: reason });
    }
  }

  // -------------------------------------------------------------- villagers

  npcAt(id) {
    return npcState(id, this.world.minute, this.world.weather, this.minutesPerSecond, dayIndexOf(this.world));
  }

  relOf(p, id) {
    p.rel = p.rel || {};
    if (!p.rel[id]) p.rel[id] = { pts: 0, met: false, talked: -1, gifted: -1, ms: [], known: {} };
    return p.rel[id];
  }

  // Villagers must be close by, except right after a chat (they wait for you).
  requireNpc(p, id) {
    const v = VILLAGERS[id];
    if (!v) fail('Warga tidak dikenal.');
    if (p.sleeping) fail('Kamu sedang tidur.');
    const s = this.npcAt(id);
    const chatting = p.npcChat && p.npcChat.npc === id && Date.now() - p.npcChat.at < 120000;
    if (!chatting) {
      if (dist(p.x, p.z, s.x, s.z) > 4.2) fail(`${v.name} terlalu jauh.`);
      if (s.hidden && this.world.minute >= KNOCK_UNTIL) fail(`Sepertinya ${v.name} sudah tidur. Coba lagi besok.`);
    }
    p.npcChat = { npc: id, at: Date.now() };
    return s;
  }

  addFriendship(p, id, delta) {
    const r = this.relOf(p, id);
    const v = VILLAGERS[id];
    const before = hearts(r.pts);
    r.pts = Math.max(0, Math.min(MAX_FRIENDSHIP, r.pts + delta));
    const after = hearts(r.pts);
    const events = [];
    for (const m of MILESTONES) {
      if (before < m && after >= m && !r.ms.includes(m)) {
        r.ms.push(m);
        const items = v.gifts[m] || null;
        if (items) for (const [it, q] of Object.entries(items)) this.addItem(p, it, q);
        events.push({ hearts: m, text: fillText(v.talk.ms[m], { name: p.name }), items, perk: m === 5 ? v.perk.text : null });
      }
    }
    return events;
  }

  textVars(p) {
    return { name: p.name };
  }

  pick(list) {
    return list[Math.floor(this.rng() * list.length)];
  }

  contextLine(p, id) {
    const ctx = VILLAGERS[id].talk.ctx || {};
    const out = [];
    const plot = this.plots[p.plotId];
    const others = Object.values(this.players).filter((o) => o.id !== p.id);
    for (const [kind, tpl] of Object.entries(ctx)) {
      let vars = null;
      if (kind === 'hot' && this.market.hot) vars = { hot: `${ITEMS[this.market.hot].icon} ${ITEMS[this.market.hot].name}` };
      if (kind === 'tomorrow') vars = { tomorrow: WEATHER[this.world.tomorrow].name.toLowerCase() };
      if (kind === 'other' && others.length) vars = { other: this.pick(others).name };
      if (kind === 'animal' && plot.animals.length) vars = { animal: this.pick(plot.animals).name };
      if (kind === 'ready' && plot.tiles.some((t) => t.c && !t.c.withered && t.c.g >= CROPS[t.c.id].days)) vars = {};
      if (kind === 'stumps') {
        const n = plot.tiles.filter((t) => t.t === 'stump').length;
        if (n) vars = { n };
      }
      if ((kind === 'richest' || kind === 'richestYou') && others.length) {
        const top = Object.values(this.players).reduce((a, b) => (b.gold > a.gold ? b : a));
        if (kind === 'richestYou' && top.id === p.id) vars = {};
        if (kind === 'richest' && top.id !== p.id) vars = { richest: top.name };
      }
      if (vars) out.push(fillText(tpl, { ...this.textVars(p), ...vars }));
    }
    return out;
  }

  requestText(id, req) {
    const it = ITEMS[req.item];
    return fillText(VILLAGERS[id].talk.request, { qty: req.qty, item: `${it.icon} ${it.name}`, reward: req.reward });
  }

  activeRequest(id) {
    return this.requests.find((q) => q.npc === id && !q.doneBy) || null;
  }

  pickLine(p, id) {
    const t = VILLAGERS[id].talk;
    const m = this.world.minute;
    const tod = m < 11 * 60 ? 'morning' : m < 17 * 60 ? 'day' : m < 21 * 60 ? 'evening' : 'night';
    const req = this.activeRequest(id);
    if (req && this.rng() < 0.5) return this.requestText(id, req);
    const pool = [...t[tod], ...t[this.seasonId]];
    const w = this.world.weather;
    if (w === 'rain' || w === 'storm') pool.push(...t.rain, ...t.rain);
    if (w === 'snow') pool.push(...t.snow, ...t.snow);
    const hh = hearts(this.relOf(p, id).pts);
    pool.push(...(hh >= 6 ? t.h6 : hh >= 3 ? t.h3 : t.h0));
    const ctx = this.contextLine(p, id);
    pool.push(...ctx, ...ctx);
    return this.pick(pool);
  }

  npcTalk(p, { npc }) {
    const s = this.requireNpc(p, npc);
    const v = VILLAGERS[npc];
    const r = this.relOf(p, npc);
    const today = dayIndexOf(this.world);
    let text;
    if (!r.met) {
      r.met = true;
      text = v.talk.intro;
    } else if (isBirthday(npc, this.world) && r.talked !== today) text = v.talk.birthday;
    else text = this.pickLine(p, npc);
    text = fillText(text, this.textVars(p));
    if (s.hidden) text = `(dari balik pintu) ${text}`;
    let events = [];
    let gained = 0;
    if (r.talked !== today) {
      r.talked = today;
      gained = TALK_POINTS;
      events = this.addFriendship(p, npc, TALK_POINTS);
    }
    this.sendSelf(p);
    return { ok: true, npc, text, gained, events, pts: r.pts };
  }

  npcGift(p, { npc, item }) {
    const s = this.requireNpc(p, npc);
    const v = VILLAGERS[npc];
    if (!ITEMS[item]) fail('Barang tidak dikenal.');
    if (!(p.inv[item] > 0)) fail('Kamu tidak punya barang itu.');
    const r = this.relOf(p, npc);
    r.met = true;
    const today = dayIndexOf(this.world);
    if (r.gifted === today) return { ok: true, npc, text: fillText(v.talk.already, this.textVars(p)), reaction: 'already', events: [], pts: r.pts };
    this.takeItem(p, item);
    const reaction = giftReaction(npc, item);
    const bday = isBirthday(npc, this.world);
    let delta = GIFT_POINTS[reaction];
    if (bday) delta = delta > 0 ? delta * 3 : delta * 2;
    r.gifted = today;
    r.known[item] = reaction;
    const events = this.addFriendship(p, npc, delta);
    const text = bday && delta > 0 ? v.talk.birthdayGift : this.pick(v.talk[reaction]);
    this.fx(`npc_${reaction}`, s.x, s.z, { pid: p.id, npc });
    this.sendSelf(p);
    return { ok: true, npc, text: fillText(text, this.textVars(p)), reaction, delta, events, pts: r.pts, birthday: bday };
  }

  npcDeliver(p, { npc, id }) {
    const s = this.requireNpc(p, npc);
    const v = VILLAGERS[npc];
    const req = this.requests.find((q) => q.id === id && q.npc === npc);
    if (!req) fail('Pesanan tidak ditemukan.');
    if (req.doneBy) fail(`Pesanan ini sudah diselesaikan oleh ${req.doneBy}.`);
    if (!this.takeItem(p, req.item, req.qty)) fail(`Kamu butuh ${req.qty} ${ITEMS[req.item].name}.`);
    p.gold += req.reward;
    req.doneBy = p.name;
    req.doneById = p.id;
    const events = this.addFriendship(p, npc, REQUEST_POINTS);
    this.relOf(p, npc).met = true;
    this.sendSelf(p);
    this.sendPlayerInfo(p);
    this.sendRequests();
    this.fx('npc_love', s.x, s.z, { pid: p.id, npc });
    this.net.broadcast('feed', { text: `📜 ${p.name} menyelesaikan pesanan ${v.name}! (+${req.reward}G)` });
    return { ok: true, npc, text: fillText(v.talk.thanks, this.textVars(p)), reward: req.reward, events, pts: this.relOf(p, npc).pts };
  }

  makeRequest(npc, today) {
    const v = VILLAGERS[npc];
    const season = this.seasonId;
    // Crops are only requested once there has been time to grow them this season.
    const ok = (id) => requestable(id, season, ITEMS) && (ITEMS[id].type !== 'crop' || this.world.day > CROPS[id].days);
    let pool = [...v.loves, ...v.likes].filter(ok);
    if (!pool.length) pool = Object.keys(ITEMS).filter((id) => ok(id) && ITEMS[id].type !== 'food');
    if (!pool.length) return null;
    const item = this.pick(pool);
    const it = ITEMS[item];
    const unit = it.sell || Math.round((it.buy || 50) / 2);
    const max = it.type === 'material' ? 30 : item === 'fish_l' || item === 'gem' ? 2 : 12;
    const qty = Math.max(1, Math.min(max, Math.round((400 + this.rng() * 600) / unit)));
    const reward = Math.round((unit * qty * 1.8 + 120) / 10) * 10;
    return { id: uid('r'), npc, item, qty, reward, expires: today + 2, doneBy: null };
  }

  // Drops finished/expired requests and tops the board up. Returns how many were added.
  refreshRequests() {
    const today = dayIndexOf(this.world);
    this.requests = this.requests.filter((q) => !q.doneBy && q.expires >= today);
    const busy = new Set(this.requests.map((q) => q.npc));
    const free = VILLAGER_IDS.filter((id) => !busy.has(id));
    let added = 0;
    while (this.requests.length < MAX_REQUESTS && free.length) {
      const npc = free.splice(Math.floor(this.rng() * free.length), 1)[0];
      const q = this.makeRequest(npc, today);
      if (q) {
        this.requests.push(q);
        added++;
      }
    }
    return added;
  }

  villagerMorning(reports) {
    const notes = [];
    for (const id of VILLAGER_IDS) {
      if (isBirthday(id, this.world)) {
        notes.push(`🎂 Hari ini ulang tahun ${VILLAGERS[id].name}! Hadiah hari ini bernilai 3×.`);
        this.net.broadcast('feed', { text: `🎂 Hari ini ulang tahun ${VILLAGERS[id].name}!` });
      }
    }
    const added = this.refreshRequests();
    if (added) notes.push(`📜 ${added} pesanan warga baru di Papan Pesanan.`);
    for (const p of Object.values(this.players)) {
      const rep = reports[p.id];
      rep.notes.push(...notes);
      if (perkActive(p.rel, 'lina')) {
        let n = 0;
        for (const t of this.plots[p.plotId].tiles) {
          if (n >= 9) break;
          if (t.t === 'soil' && t.c && !t.c.withered && !t.w) { t.w = 1; n++; }
        }
        if (n) rep.notes.push(`🌸 Lina menyiram ${n} tanamanmu pagi ini.`);
      }
      if (perkActive(p.rel, 'dewi') && this.rng() < 0.4) {
        const item = this.pick(FORAGE_BY_SEASON[this.seasonId]);
        this.addItem(p, item);
        rep.notes.push(`🎀 Dewi meninggalkan ${ITEMS[item].icon} ${ITEMS[item].name} untukmu.`);
      }
    }
  }

  // ------------------------------------------------------------------ chat

  chat(p, text) {
    text = String(text || '').trim().slice(0, 160);
    if (!text) return { ok: true };
    const now = Date.now();
    if (p.lastChat && now - p.lastChat < 600) fail('Pelan-pelan ngobrolnya :)');
    p.lastChat = now;
    this.net.broadcast('chat', { from: p.id, name: p.name, color: p.color, text });
    return { ok: true };
  }
}

export { GameError };
