import crypto from 'node:crypto';
import {
  FIELD_W, FIELD_H, DAYS_PER_SEASON, DAY_START_MIN, DAY_END_MIN, SLEEP_ALLOWED_MIN, MAX_STAMINA, REACH,
  MAX_LISTINGS, SEASONS, WEATHER_TABLE, BARN_LEVELS, HOUSE_LEVELS, CROPS, ANIMALS, ITEMS, UPGRADABLE_TOOLS,
  TOOL_LEVELS, CAN_CAPACITY, toolCost, toolArea, SHOPS, shopOpen, shopHours, festivalOf, FESTIVAL_GATHER,
  PREMIUM_AFFECTION, MAX_AFFECTION, FORAGE_BY_SEASON, START_GOLD, START_ITEMS, PLOT_CENTERS, plotLayout,
  TOWN, WILD_ZONES, WILD_TREES, WEATHER, nearWater, nearSpring, itemPrice, formatTime,
} from '../shared/defs.js';
import {
  VILLAGERS, VILLAGER_IDS, MAX_FRIENDSHIP, TALK_POINTS, GIFT_POINTS, REQUEST_POINTS, MILESTONES, KNOCK_UNTIL,
  npcState, dayIndexOf, hearts, isBirthday, giftReaction, requestable, fillText, perkActive, shopPrice, upgradeGold,
  FEST_HOST, FEST_TALK, FEST_POINTS, GODDESS, GODDESS_POINTS, GODDESS_BERRIES, goddessReaction,
} from '../shared/villagers.js';

const ANIMAL_NAMES = ['Mimi', 'Kiko', 'Bubu', 'Popo', 'Lulu', 'Dodo', 'Nana', 'Cici', 'Momo', 'Toto', 'Pipi', 'Gogo'];
const COLORS = ['#e8553e', '#3e8ee8', '#e8b93e', '#8a3ee8', '#3ec98a', '#e83e9a', '#3ed6e8', '#f08a24'];

const uid = (p) => p + crypto.randomBytes(5).toString('hex');
const MAX_REQUESTS = 3;
const SPOTS_BIN = /^bin\d$/;
const PLAZA = { x: 0, z: 0, r: 12 };
const TOOL_NAMES = { hoe: 'Cangkul', can: 'Penyiram', sickle: 'Sabit', axe: 'Kapak', hammer: 'Palu', rod: 'Pancing' };
const freshTools = () => Object.fromEntries(UPGRADABLE_TOOLS.map((t) => [t, 0]));
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
    this.plots = PLOT_CENTERS.map((_, i) => ({ id: i, ownerId: null, tiles: this.freshField(), barnLevel: 0, houseLevel: 0, building: null, animals: [] }));
    this.wild = [];
    this.market = { listings: [], mult: {}, hot: null, trend: {} };
    this.requests = [];
    this.world.pickedUp = {};
    this.world.marriages = {};
    this.world.fest = null;
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
    this.world.pickedUp = this.world.pickedUp || {};
    this.world.marriages = this.world.marriages || {};
    this.world.fest = this.world.fest || null;
    for (const plot of this.plots) {
      plot.houseLevel = plot.houseLevel || 0;
      plot.building = plot.building || null;
    }
    for (const p of Object.values(this.players)) {
      p.look = p.look || sanitizeLook(null, p.color);
      p.rel = p.rel || {};
      // Older saves: the watering can level becomes a tool level.
      p.tools = p.tools || { ...freshTools(), can: Math.min(TOOL_LEVELS.length - 1, p.canLevel || 0) };
      delete p.canLevel;
      p.forge = p.forge || null;
      p.shipped = p.shipped || {};
      p.spouse = p.spouse || null;
      p.berries = p.berries || 0;
      p.goddess = p.goddess || { pts: 0, day: -1 };
      p.festDone = p.festDone || {};
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
      water: p.water, tools: p.tools, forge: p.forge, inv: p.inv, bin: p.bin, shipped: p.shipped,
      pickedUp: !!this.world.pickedUp[p.plotId], plotId: p.plotId, sleeping: p.sleeping,
      tradeId: p.tradeId, rel: p.rel, spouse: p.spouse, berries: p.berries, goddess: p.goddess, festDone: p.festDone,
    };
  }

  publicPlot(plot) {
    const owner = plot.ownerId ? this.players[plot.ownerId] : null;
    return {
      id: plot.id, ownerId: plot.ownerId, ownerName: owner?.name || null, color: owner?.color || null,
      tiles: plot.tiles, barnLevel: plot.barnLevel, houseLevel: plot.houseLevel || 0, building: plot.building || null,
      animals: plot.animals,
    };
  }

  timeState() {
    const { day, season, year, minute, weather, tomorrow } = this.world;
    return { day, season, year, minute, weather, tomorrow, hot: this.market.hot, rate: this.minutesPerSecond };
  }

  festivalState() {
    return { fest: this.world.fest, marriages: this.world.marriages };
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
      village: this.festivalState(),
    };
  }

  // ------------------------------------------------------------- networking

  sendSelf(p) { this.net.toPlayer(p.id, 'self', this.privateState(p)); }
  sendPlot(plot) { this.net.broadcast('plot', this.publicPlot(plot)); }
  sendWild() { this.net.broadcast('wild', this.wild); }
  sendMarket() { this.net.broadcast('market', this.marketState()); }
  sendPlayerInfo(p) { this.net.broadcast('player', this.publicPlayer(p)); }
  sendRequests() { this.net.broadcast('requests', this.requests); }
  sendVillage() { this.net.broadcast('village', this.festivalState()); }
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
      gold: START_GOLD, stamina: MAX_STAMINA, water: CAN_CAPACITY[0], tools: freshTools(), forge: null,
      inv: { ...START_ITEMS }, bin: {}, plotId: plot.id,
      look: null,
      x: L.houseDoor.x + 1, z: L.houseDoor.z, ry: 0, online: false, sleeping: false,
      lastReport: null, fish: null, tradeId: null, tradeReq: null, rel: {}, npcChat: null,
      shipped: {}, spouse: null, berries: 0, goddess: { pts: 0, day: -1 }, festDone: {},
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
    if (this.world.minute >= DAY_END_MIN) {
      this.endDay(true);
      return;
    }
    // The courier empties each farm's shipping bin as he walks past it.
    const danu = this.npcAt('danu');
    if (!danu.moving && SPOTS_BIN.test(danu.spot)) {
      const k = Number(danu.spot.slice(3));
      if (!this.world.pickedUp[k]) this.pickup(k);
    }
    const fest = this.todayFestival();
    if (fest?.activity === 'contest' && this.world.minute >= fest.end) this.judgeContest(fest);
  }

  pickup(k) {
    this.world.pickedUp[k] = true;
    const plot = this.plots[k];
    const p = plot.ownerId ? this.players[plot.ownerId] : null;
    if (!p) return;
    let n = 0;
    for (const [id, q] of Object.entries(p.bin)) {
      p.shipped[id] = (p.shipped[id] || 0) + q;
      n += q;
    }
    p.bin = {};
    const L = plotLayout(k);
    if (n) this.fx('ship', L.bin.x, L.bin.z, { pid: 'danu' });
    if (p.online) {
      this.toast(p, n ? `📦 Mas Danu mengambil ${n} barang dari kotak pengirimanmu. Uangnya tiba besok pagi!` : '📦 Mas Danu mampir ke ladangmu, tapi kotak pengirimannya kosong.', n ? 'gold' : 'info');
      this.sendSelf(p);
    }
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
      // Items put in the bin after the courier passed wait for tomorrow's round,
      // unless he never came by today or he is a good friend.
      const late = !this.world.pickedUp[p.plotId] || perkActive(p.rel, 'danu');
      const pay = { ...p.shipped };
      if (late) for (const [id, q] of Object.entries(p.bin)) pay[id] = (pay[id] || 0) + q;
      for (const [id, qty] of Object.entries(pay)) {
        const price = Math.round(this.shipPrice(id) * bonus);
        lines.push({ id, qty, price });
        total += price * qty;
        shipped[id] = (shipped[id] || 0) + qty;
      }
      p.gold += total;
      p.shipped = {};
      if (late) p.bin = {};
      reports[p.id] = { lines, total, notes: [], passedOut: passedOut && p.online && !p.sleeping };
    }
    this.world.pickedUp = {};
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
      // 5. Animals produce if fed (Pak Jaya's tips make them love you faster).
      const owner = plot.ownerId ? this.players[plot.ownerId] : null;
      const extra = owner && perkActive(owner.rel, 'jaya') ? 1 : 0;
      for (const a of plot.animals) {
        const def = ANIMALS[a.type];
        if (a.fed) {
          a.aff = Math.min(MAX_AFFECTION, a.aff + 1 + extra);
          if (!a.prod) a.prod = a.aff >= PREMIUM_AFFECTION ? def.premium : def.product;
        } else {
          a.aff = Math.max(0, a.aff - 3);
        }
        a.fed = false;
        a.petted = false;
      }
    }
    // 6. Villagers: finished jobs, friendship perks, birthdays, festivals and requests.
    this.finishJobs(reports);
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
    this.sendVillage();
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
    const targets = { stump: initial ? 14 : Math.min(14, count('stump') + 3), rock: initial ? 18 : Math.min(18, count('rock') + 4), forage: 16 };
    for (const k of ['stump', 'rock', 'forage']) {
      let tries = 0;
      while (count(k) < targets[k] && tries++ < 400) {
        const z = WILD_ZONES[Math.floor(this.rng() * WILD_ZONES.length)];
        const x = z.x0 + 1 + this.rng() * (z.x1 - z.x0 - 2);
        const zz = z.z0 + 1 + this.rng() * (z.z1 - z.z0 - 2);
        if (nearWater(x, zz, 1.5) || nearSpring(x, zz, 2)) continue;
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
    const house = HOUSE_LEVELS[this.plots[p.plotId]?.houseLevel || 0].stamina;
    return MAX_STAMINA + (perkActive(p.rel, 'harjo') ? 20 : 0) + (p.berries || 0) * 10 + house;
  }
  toolLevel(p, tool) {
    return p.tools?.[tool] || 0;
  }
  useStamina(p, tool) {
    const cost = toolCost(tool, this.toolLevel(p, tool));
    if (p.stamina < cost) fail('Kamu terlalu lelah... Makan sesuatu atau tidur dulu.');
    p.stamina -= cost;
  }
  requireTool(p, tool) {
    if (p.forge && p.forge.tool === tool) fail(`${TOOL_NAMES[tool]}-mu sedang ditempa Pak Bejo. Selesai besok pagi.`);
  }

  // Tiles a tool works on: one, a line of three away from the player, or a 3x3 square.
  areaTiles(p, hit, tool) {
    const shape = toolArea(tool, this.toolLevel(p, tool));
    if (shape === 'single') return [hit];
    const L = plotLayout(hit.plot.id);
    const out = [];
    const add = (i, j) => {
      if (i < 0 || j < 0 || i >= FIELD_W || j >= FIELD_H) return;
      out.push({ plot: hit.plot, i, j, tile: hit.plot.tiles[j * FIELD_W + i], cx: L.ox + i + 0.5, cz: L.oz + j + 0.5 });
    };
    if (shape === 'square') {
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) add(hit.i + di, hit.j + dj);
    } else {
      const dx = hit.cx - p.x, dz = hit.cz - p.z;
      const [si, sj] = Math.abs(dx) >= Math.abs(dz) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dz) || 1];
      for (let k = 0; k < 3; k++) add(hit.i + si * k, hit.j + sj * k);
    }
    return out;
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
    if (tool !== 'hand') this.requireTool(p, tool);
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
    const tiles = this.areaTiles(p, hit, 'hoe');
    const ok = (t) => t.t === 'grass' || (t.t === 'soil' && t.c && t.c.withered);
    if (!ok(tile) && !tiles.some((h) => ok(h.tile))) {
      if (tile.t === 'weed') fail('Potong rumput liar dulu dengan Sabit.');
      if (tile.t === 'rock') fail('Ada batu. Gunakan Palu.');
      if (tile.t === 'stump') fail('Ada tunggul. Gunakan Kapak.');
      if (tile.t === 'soil' && tile.c && !tile.c.withered) fail('Ada tanaman di sini.');
      fail('Tanah sudah gembur.');
    }
    this.useStamina(p, 'hoe');
    for (const h of tiles) {
      if (!ok(h.tile)) continue;
      h.tile.t = 'soil';
      h.tile.c = null;
      this.fx('dirt', h.cx, h.cz, { pid: p.id });
    }
    this.after(p, hit, null);
    return { ok: true };
  }

  useCan(p, hit, x, z) {
    const L = plotLayout(p.plotId);
    const atWell = dist(x, z, L.well.x, L.well.z) < 1.8 || dist(p.x, p.z, L.well.x, L.well.z) < 2.2;
    if (atWell || nearWater(x, z, 0.6) || nearWater(p.x, p.z, 1.6)) {
      p.water = CAN_CAPACITY[this.toolLevel(p, 'can')];
      this.sendSelf(p);
      this.fx('refill', x, z);
      return { ok: true, msg: 'Penyiram terisi penuh!' };
    }
    if (!hit || hit.tile.t !== 'soil') fail('Siram tanah yang sudah dicangkul.');
    // Watering a neighbour's crops is allowed as a friendly gesture.
    if (!hit.plot.ownerId) fail('Ladang ini belum ada pemiliknya.');
    if (p.water <= 0) fail('Air habis! Isi ulang di sumur atau kolam.');
    const dry = this.areaTiles(p, hit, 'can').filter((h) => h.tile.t === 'soil' && !h.tile.w);
    if (!dry.length) fail('Sudah disiram.');
    this.useStamina(p, 'can');
    for (const h of dry) {
      if (p.water <= 0) break;
      p.water -= 1;
      h.tile.w = 1;
      this.fx('water', h.cx, h.cz, { pid: p.id });
    }
    this.after(p, hit, null);
    return { ok: true };
  }

  useSickle(p, hit) {
    if (!hit) fail('Tidak ada yang bisa dipotong.');
    const cut = this.areaTiles(p, hit, 'sickle').filter((h) => h.tile.t === 'weed' || (h.tile.c && h.tile.c.withered));
    if (!cut.length) fail('Tidak ada yang bisa dipotong.');
    this.useStamina(p, 'sickle');
    let fodder = 0;
    for (const h of cut) {
      if (h.tile.t === 'weed') {
        h.tile.t = 'grass';
        if (this.rng() < 0.5) fodder++;
      } else h.tile.c = null;
      this.fx('leaves', h.cx, h.cz, { pid: p.id });
    }
    if (fodder) this.addItem(p, 'fodder', fodder);
    this.after(p, hit, null);
    return { ok: true, msg: fodder ? `+${fodder} Rumput Pakan` : undefined };
  }

  useAxe(p, hit, x, z) {
    const lv = this.toolLevel(p, 'axe');
    if (hit) {
      if (hit.tile.t !== 'stump') fail('Tidak ada tunggul di sini.');
      this.useStamina(p, 'axe');
      hit.tile.t = 'grass';
      this.addItem(p, 'lumber', 3 + lv);
      this.after(p, hit, 'wood');
      return { ok: true, msg: `+${3 + lv} Kayu` };
    }
    const o = this.nearestWild(x, z, ['stump']);
    if (!o) fail('Tidak ada tunggul di sini.');
    this.useStamina(p, 'axe');
    this.wild = this.wild.filter((w) => w !== o);
    this.addItem(p, 'lumber', 4 + lv * 2);
    this.afterWild(p, o, 'wood');
    return { ok: true, msg: `+${4 + lv * 2} Kayu` };
  }

  // Breaking rocks yields stone and sometimes ore; a better hammer finds more and rarer ore.
  rollOre(level, base) {
    const k = base * (1 + 0.25 * level);
    const r = this.rng();
    if (r < 0.05 * k) return 'gold_ore';
    if (r < 0.17 * k) return 'silver_ore';
    if (r < 0.47 * k) return 'copper_ore';
    return null;
  }

  useHammer(p, hit, x, z) {
    const lv = this.toolLevel(p, 'hammer');
    if (hit) {
      const { tile } = hit;
      if (tile.t === 'rock') {
        this.useStamina(p, 'hammer');
        tile.t = 'grass';
        this.addItem(p, 'stone', 2 + lv);
        let msg = `+${2 + lv} Batu`;
        const ore = this.rollOre(lv, 0.3);
        if (ore) { this.addItem(p, ore); msg += `, +1 ${ITEMS[ore].name}`; }
        this.after(p, hit, 'stone');
        return { ok: true, msg };
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
    this.addItem(p, 'stone', 3 + lv);
    let msg = `+${3 + lv} Batu`;
    const ore = this.rollOre(lv, 1);
    if (ore) { this.addItem(p, ore); msg += `, +1 ${ITEMS[ore].name}`; }
    if (this.rng() < 0.08 * (1 + 0.25 * lv)) { this.addItem(p, 'gem'); msg += ', +1 Permata!'; }
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
    if (itemId === 'power_berry') {
      // The goddess' gift: permanently more stamina.
      if (!this.takeItem(p, itemId)) fail('Kamu tidak punya itu.');
      p.berries = (p.berries || 0) + 1;
      p.stamina = this.maxStamina(p);
      this.sendSelf(p);
      this.fx('eat', p.x, p.z, { pid: p.id });
      return { ok: true, msg: `Tenaga mengalir! Stamina maksimal kini ${this.maxStamina(p)}` };
    }
    if (!def || !def.eat) fail('Itu tidak bisa dimakan.');
    const max = this.maxStamina(p);
    if (p.stamina >= max) fail('Kamu sudah kenyang & bertenaga!');
    if (!this.takeItem(p, itemId)) fail('Kamu tidak punya itu.');
    const gain = Math.min(max - p.stamina, def.eat);
    p.stamina += gain;
    this.sendSelf(p);
    this.fx('eat', p.x, p.z, { pid: p.id });
    return { ok: true, msg: `Nyam! +${gain} stamina` };
  }

  after(p, hit, fx, extra = {}) {
    this.sendPlot(hit.plot);
    this.sendSelf(p);
    if (fx) this.fx(fx, hit.cx, hit.cz, { pid: p.id, ...extra });
  }

  afterWild(p, o, fx, extra = {}) {
    this.sendWild();
    this.sendSelf(p);
    this.fx(fx, o.x, o.z, { pid: p.id, ...extra });
  }

  // ---------------------------------------------------------------- fishing

  fishCast(p) {
    if (p.sleeping) fail('Kamu sedang tidur.');
    this.requireTool(p, 'rod');
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
    // A better rod and Pak Bayu's tips: a longer bite window and better odds for big fish.
    const pro = perkActive(p.rel, 'bayu') ? 1 : 0;
    const lv = this.toolLevel(p, 'rod');
    if (now > f.biteAt + 1400 + lv * 200 + pro * 500) fail('Terlambat... ikannya lepas.');
    const r = this.rng();
    const odds = [0.02 + 0.01 * (lv + pro), 0.15 + 0.04 * lv + 0.07 * pro, 0.45 + 0.03 * lv + 0.07 * pro];
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

  todayFestival() {
    return festivalOf(this.world.season, this.world.day);
  }

  // Next festival within `days` days: { fest, days }.
  upcomingFestival(days = 3) {
    for (let d = 1; d <= days; d++) {
      let day = this.world.day + d, season = this.world.season;
      if (day > DAYS_PER_SEASON) { day -= DAYS_PER_SEASON; season = (season + 1) % 4; }
      const fest = festivalOf(season, day);
      if (fest) return { fest, days: d };
    }
    return null;
  }

  // Shops are run by their shopkeeper: you must be there while they are at the counter.
  requireShop(p, shopId) {
    const s = SHOPS[shopId];
    if (!s) fail('Toko tidak dikenal.');
    if (dist(p.x, p.z, s.at.x, s.at.z) > 7 && dist(p.x, p.z, s.door.x, s.door.z) > 7) fail(`Kamu harus berada di ${s.name}.`);
    const fest = this.todayFestival();
    if (!shopOpen(shopId, this.world.minute, fest)) {
      fail(`${s.name} tutup. Buka ${shopHours(shopId)}${fest ? `, tutup selama ${fest.name}` : ''}.`);
    }
    return s;
  }

  buy(p, { shop = 'store', item, qty }) {
    const s = this.requireShop(p, shop);
    const def = ITEMS[item];
    qty = clampInt(qty, 1, 999);
    const sold = def && def.buy && ((s.items || []).includes(item) || (s.seeds && def.type === 'seed'));
    if (!sold) fail('Barang itu tidak dijual di sini.');
    if (def.type === 'seed' && def.season !== this.seasonId) fail('Benih ini tidak dijual musim ini.');
    const cost = shopPrice(shop, def.buy, p.rel) * qty;
    if (p.gold < cost) fail('Uangmu tidak cukup.');
    p.gold -= cost;
    this.addItem(p, item, qty);
    this.sendSelf(p);
    this.sendPlayerInfo(p);
    return { ok: true, msg: `Membeli ${qty} ${def.name} (-${cost}G)` };
  }

  buyAnimal(p, { type, name }) {
    this.requireShop(p, 'ranch');
    const def = ANIMALS[type];
    if (!def) fail('Hewan tidak dikenal.');
    const plot = this.plots[p.plotId];
    const cap = BARN_LEVELS[plot.barnLevel][type];
    if (plot.animals.filter((a) => a.type === type).length >= cap) fail(`Kandang penuh! Minta Mas Joko memperbesar kandangmu untuk menampung lebih banyak ${def.name}.`);
    const price = shopPrice('ranch', def.price, p.rel);
    if (p.gold < price) fail('Uangmu tidak cukup.');
    p.gold -= price;
    name = String(name || '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 12) || ANIMAL_NAMES[Math.floor(this.rng() * ANIMAL_NAMES.length)];
    plot.animals.push({ id: uid('a'), type, name, aff: 10, fed: false, petted: false, prod: null });
    this.sendSelf(p);
    this.sendPlot(plot);
    return { ok: true, msg: `${def.name} "${name}" diantar Pak Jaya ke kandangmu!` };
  }

  upgradeCost(p, cost) {
    return { ...cost, gold: upgradeGold(cost.gold, p.rel) };
  }

  // The carpenter extends your barn or house; the work is done by the next morning.
  build(p, { kind }) {
    this.requireShop(p, 'carpenter');
    const plot = this.plots[p.plotId];
    if (plot.building) fail('Mas Joko masih mengerjakan bangunanmu. Selesai besok pagi.');
    const levels = kind === 'barn' ? BARN_LEVELS : kind === 'house' ? HOUSE_LEVELS : null;
    if (!levels) fail('Bangunan tidak dikenal.');
    const level = (kind === 'barn' ? plot.barnLevel : plot.houseLevel || 0) + 1;
    const next = levels[level];
    if (!next) fail('Bangunan ini sudah paling besar.');
    const cost = this.upgradeCost(p, next.cost);
    if (!this.hasCost(p, cost)) fail(`Butuh ${this.costText(cost)}.`);
    this.payCost(p, cost);
    plot.building = { kind, level, ready: dayIndexOf(this.world) + 1 };
    this.sendSelf(p);
    this.sendPlot(plot);
    this.sendPlayerInfo(p);
    return { ok: true, msg: `Mas Joko mulai membangun ${next.name}. Selesai besok pagi!` };
  }

  // The blacksmith upgrades a tool with gold and ore; it is ready the next morning.
  forgeTool(p, { tool }) {
    this.requireShop(p, 'forge');
    if (!UPGRADABLE_TOOLS.includes(tool)) fail('Alat itu tidak bisa ditempa.');
    if (p.forge) fail(`Pak Bejo masih menempa ${TOOL_NAMES[p.forge.tool]}-mu.`);
    const level = this.toolLevel(p, tool) + 1;
    const next = TOOL_LEVELS[level];
    if (!next) fail(`${TOOL_NAMES[tool]}-mu sudah yang terbaik.`);
    if (!this.hasCost(p, next.cost)) fail(`Butuh ${this.costText(next.cost)}.`);
    this.payCost(p, next.cost);
    const name = `${TOOL_NAMES[tool]} ${next.name}`;
    if (perkActive(p.rel, 'bejo')) {
      p.tools[tool] = level;
      if (tool === 'can') p.water = CAN_CAPACITY[level];
      this.sendSelf(p);
      this.sendPlayerInfo(p);
      return { ok: true, msg: `⚒️ Tempa kilat! ${name} langsung jadi.` };
    }
    p.forge = { tool, level, ready: dayIndexOf(this.world) + 1 };
    this.sendSelf(p);
    this.sendPlayerInfo(p);
    return { ok: true, msg: `Pak Bejo mulai menempa ${name}. Ambil besok pagi (tidak bisa dipakai hari ini).` };
  }

  // Free check-up at the clinic.
  checkup(p) {
    this.requireShop(p, 'clinic');
    const r = p.stamina / this.maxStamina(p);
    const text = r > 0.75 ? 'Kondisimu prima! Pertahankan pola makan dan tidur yang baik.'
      : r > 0.4 ? 'Kamu agak lelah. Makan sesuatu dan jangan memaksakan diri.'
        : 'Kamu sangat kelelahan! Minum jamu atau istirahat sekarang juga.';
    return { ok: true, text: `Dokter Raka memeriksamu... Stamina ${p.stamina}/${this.maxStamina(p)}. ${text}` };
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
      if (!fed) fail('Kamu tidak punya pakan! Beli di Peternakan Jaya atau potong rumput liar.');
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
    return npcState(id, this.world.minute, this.world.weather, this.minutesPerSecond, dayIndexOf(this.world), this.homePlotOf(id));
  }

  // A married villager lives on their spouse's farm.
  homePlotOf(id) {
    const pid = this.world.marriages?.[id];
    return pid && this.players[pid] ? this.players[pid].plotId : null;
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
      if (s.hidden && this.world.minute >= KNOCK_UNTIL && p.spouse !== id) fail(`Sepertinya ${v.name} sudah tidur. Coba lagi besok.`);
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
    const fest = this.todayFestival();
    if (fest && m >= fest.start - FESTIVAL_GATHER && m < fest.end) {
      if (id === 'harjo') return FEST_HOST[fest.id];
      if (this.rng() < 0.7) return this.pick(FEST_TALK[fest.id]);
    }
    if (p.spouse === id && t.spouse && this.rng() < 0.7) return this.pick(t.spouse);
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
    // The village head announces upcoming festivals.
    const soon = id === 'harjo' && this.upcomingFestival(3);
    if (soon) {
      const when = soon.days === 1 ? 'besok' : soon.days === 2 ? 'lusa' : `${soon.days} hari lagi`;
      return `${soon.fest.icon} ${soon.fest.name} akan diadakan ${when} di alun-alun! ${soon.fest.desc}`;
    }
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
    if (item === 'blue_feather') return this.propose(p, npc, s);
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

  // Proposing with the blue feather: 10 hearts and an extended house are required.
  propose(p, id, s) {
    const v = VILLAGERS[id];
    const r = this.relOf(p, id);
    r.met = true;
    const reply = (text, reaction = 'proposal') => ({ ok: true, npc: id, text: fillText(text, this.textVars(p)), reaction, events: [], pts: r.pts });
    if (!v.candidate) return reply(`${v.name} tersenyum bingung: "Bulu biru? Itu untuk melamar orang yang kamu cintai, bukan aku."`);
    const taken = this.world.marriages[id];
    if (taken && taken !== p.id) return reply(`${v.name} sudah menikah dengan ${this.players[taken]?.name || 'orang lain'}.`);
    if (p.spouse === id) return reply(`Kita kan sudah menikah, sayang!`);
    if (p.spouse) return reply(`Kamu sudah menikah dengan ${VILLAGERS[p.spouse].name}!`);
    if (hearts(r.pts) < 10) return reply(v.talk.proposeNotYet);
    if ((this.plots[p.plotId].houseLevel || 0) < 1) return reply(v.talk.proposeHouse);
    this.takeItem(p, 'blue_feather');
    this.world.marriages[id] = p.id;
    p.spouse = id;
    this.sendSelf(p);
    this.sendVillage();
    this.fx('wedding', s.x, s.z, { pid: p.id, npc: id });
    this.net.broadcast('feed', { text: `💒 ${p.name} dan ${v.name} menikah! Selamat untuk pasangan baru!` });
    this.net.broadcast('wedding', { pid: p.id, name: p.name, npc: id });
    return reply(v.talk.proposeYes, 'wedding');
  }

  // ------------------------------------------------------------- festivals

  festivalKey(fest) {
    return `${fest.id}-${dayIndexOf(this.world)}`;
  }

  festState(fest) {
    const key = this.festivalKey(fest);
    if (!this.world.fest || this.world.fest.key !== key) this.world.fest = { key, entries: [], judged: false, winner: null };
    return this.world.fest;
  }

  // Join today's festival activity (once per festival).
  festivalJoin(p, { npc, item }) {
    const fest = this.todayFestival();
    const m = this.world.minute;
    if (!fest) fail('Hari ini tidak ada festival.');
    if (m < fest.start || m >= fest.end) fail(`${fest.name} berlangsung ${formatTime(fest.start)}–${formatTime(fest.end)}.`);
    if (dist(p.x, p.z, PLAZA.x, PLAZA.z) > PLAZA.r) fail('Festival diadakan di alun-alun.');
    const key = this.festivalKey(fest);
    if (p.festDone[key]) fail('Kamu sudah ikut acara festival ini.');
    let text;
    let events = [];
    if (fest.activity === 'contest') {
      const animals = this.plots[p.plotId].animals;
      if (!animals.length) fail('Kamu belum punya ternak untuk didaftarkan.');
      const best = animals.reduce((a, b) => (b.aff > a.aff ? b : a));
      const st = this.festState(fest);
      if (st.judged) fail('Penjurian sudah selesai.');
      st.entries.push({ pid: p.id, name: p.name, animalId: best.id, animal: best.name, type: best.type, aff: best.aff });
      text = `${ANIMALS[best.type].icon} ${best.name} terdaftar di Lomba Ternak! Juara diumumkan pukul ${formatTime(fest.end)}.`;
      this.sendVillage();
    } else if (fest.activity === 'pot') {
      if (!ITEMS[item] || !this.takeItem(p, item)) fail('Pilih bahan dari tasmu.');
      // Everyone tastes the soup: their opinion of the ingredient matters.
      const bonus = { love: 50, like: 25, neutral: 0, dislike: -40 };
      for (const id of VILLAGER_IDS) {
        const ev = this.addFriendship(p, id, 30 + bonus[giftReaction(id, item)]);
        events.push(...ev.map((e) => ({ ...e, npc: id })));
      }
      text = `Kamu memasukkan ${ITEMS[item].icon} ${ITEMS[item].name} ke kuali besar. Seluruh warga menikmati supnya!`;
      this.fx('npc_like', 0, 0, { pid: p.id });
    } else {
      if (!VILLAGERS[npc]) fail('Pilih warga untuk diajak.');
      events = this.addFriendship(p, npc, FEST_POINTS).map((e) => ({ ...e, npc }));
      this.relOf(p, npc).met = true;
      const what = { dance: 'menari bersama', watch: 'menonton kembang api bersama', dinner: 'makan malam bersama' }[fest.activity];
      text = `Kamu ${what} ${VILLAGERS[npc].name}. Hati kalian semakin dekat! 💕`;
      const s = this.npcAt(npc);
      this.fx('npc_love', s.x, s.z, { pid: p.id, npc });
    }
    p.festDone[key] = true;
    this.sendSelf(p);
    return { ok: true, text, events };
  }

  judgeContest(fest) {
    const st = this.festState(fest);
    if (st.judged) return;
    st.judged = true;
    if (!st.entries.length) {
      this.sendVillage();
      return;
    }
    // The most loved animal wins; ties go to whoever registered first.
    const win = st.entries.reduce((a, b) => (b.aff > a.aff ? b : a));
    st.winner = win;
    for (const e of st.entries) {
      const owner = this.players[e.pid];
      const plot = owner && this.plots[owner.plotId];
      const animal = plot?.animals.find((a) => a.id === e.animalId);
      if (animal) animal.aff = Math.min(MAX_AFFECTION, animal.aff + (e === win ? 10 : 5));
      if (owner && e === win) {
        owner.gold += 2000;
        this.addItem(owner, 'trophy');
        if (owner.online) this.sendSelf(owner);
        this.sendPlayerInfo(owner);
      }
      if (owner?.online) this.toast(owner, e === win ? `🏆 ${e.animal} juara Lomba Ternak! +2000G & Piala!` : `Lomba Ternak selesai. ${e.animal} tampil hebat! (+5 kasih sayang)`, e === win ? 'gold' : 'info');
      if (plot) this.sendPlot(plot);
    }
    this.net.broadcast('feed', { text: `🏆 Juara Lomba Ternak: ${win.animal} milik ${win.name}!` });
    this.sendVillage();
  }

  // ---------------------------------------------------------- the goddess

  goddessOffer(p, { item }) {
    if (p.sleeping) fail('Kamu sedang tidur.');
    if (!nearSpring(p.x, p.z, 2.6)) fail('Berdirilah di tepi Mata Air Dewi di hutan timur.');
    if (!ITEMS[item] || !(p.inv[item] > 0)) fail('Pilih barang dari tasmu.');
    const t = GODDESS.talk;
    const today = dayIndexOf(this.world);
    if (p.goddess.day === today) return { ok: true, text: t.already, reaction: 'already', pts: p.goddess.pts };
    this.takeItem(p, item);
    const reaction = goddessReaction(item, ITEMS);
    const before = p.goddess.pts;
    p.goddess.pts += GODDESS_POINTS[reaction];
    p.goddess.day = today;
    let text = this.pick(t[reaction]);
    let berry = false;
    for (const need of GODDESS_BERRIES) {
      if (before < need && p.goddess.pts >= need) {
        this.addItem(p, 'power_berry');
        berry = true;
      }
    }
    if (berry) text += ` ${t.berry}`;
    this.fx('goddess', TOWN.spring.x, TOWN.spring.z, { pid: p.id });
    this.sendSelf(p);
    return { ok: true, text, reaction, pts: p.goddess.pts, berry };
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
    const max = it.type === 'material' ? 30 : it.type === 'ore' ? 8 : item === 'fish_l' || item === 'gem' ? 2 : 12;
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

  // Overnight jobs: the blacksmith's tools and the carpenter's buildings.
  finishJobs(reports) {
    const today = dayIndexOf(this.world);
    for (const p of Object.values(this.players)) {
      const rep = reports[p.id];
      if (p.forge && p.forge.ready <= today) {
        p.tools[p.forge.tool] = p.forge.level;
        rep.notes.push(`⚒️ Pak Bejo selesai menempa ${TOOL_NAMES[p.forge.tool]} ${TOOL_LEVELS[p.forge.level].name}-mu!`);
        if (p.forge.tool === 'can') p.water = CAN_CAPACITY[p.forge.level];
        p.forge = null;
      }
      const plot = this.plots[p.plotId];
      if (plot.building && plot.building.ready <= today) {
        const b = plot.building;
        if (b.kind === 'barn') plot.barnLevel = b.level;
        else plot.houseLevel = b.level;
        rep.notes.push(`🪚 Mas Joko selesai membangun ${b.kind === 'barn' ? BARN_LEVELS[b.level].name : HOUSE_LEVELS[b.level].name}!`);
        plot.building = null;
      }
      if (p.spouse) {
        this.addItem(p, 'bento');
        rep.notes.push(`🍱 ${VILLAGERS[p.spouse].name} menyiapkan Bekal Cinta untukmu.`);
      }
    }
    if (this.world.fest && !this.world.fest.key.endsWith(`-${today}`)) this.world.fest = null;
  }

  villagerMorning(reports) {
    const notes = [];
    const fest = this.todayFestival();
    if (fest) {
      notes.push(`${fest.icon} Hari ini ${fest.name} di alun-alun (${formatTime(fest.start)}–${formatTime(fest.end)})! Toko tutup selama festival.`);
      this.net.broadcast('feed', { text: `${fest.icon} Hari ini ${fest.name} di alun-alun!` });
    }
    const soon = this.upcomingFestival(1);
    if (soon && soon.days === 1) notes.push(`${soon.fest.icon} Besok ${soon.fest.name}!`);
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
