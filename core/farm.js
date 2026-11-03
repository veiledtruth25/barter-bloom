import { CROPS, FISH, RECIPES, ITEMS, TOOLS } from './items.js';
import { dayIndex } from './calendar.js';

export const FIELD = { x0: -6, z0: 2, w: 12, h: 8 };
export const MINE = { x0: 14, z0: -14, w: 8, h: 6 };
export const COOP_SLOTS = 4, BARN_SLOTS = 4;
export const ANIMALS = {
  chicken: { name: 'Ayam', icon: '🐔', price: 1500, barn: 'coop', product: 'egg' },
  cow:     { name: 'Sapi', icon: '🐄', price: 6000, barn: 'barn', product: 'milk' },
};

export const tileKey = (x, z) => `${x},${z}`;
const inRect = (r, x, z) => x >= r.x0 && x < r.x0 + r.w && z >= r.z0 && z < r.z0 + r.h;
export const inField = (x, z) => inRect(FIELD, x, z);
export const inMine = (x, z) => inRect(MINE, x, z);

function rand(g) { // PRNG berseed yang tersimpan di state, agar save bisa dilanjutkan deterministik
  g.rng = (g.rng + 0x6d2b79f5) >>> 0;
  let t = g.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---- puing ladang & tambang ------------------------------------------------
export function initWorld(g) {
  g.rng = g.seed >>> 0;
  g.debris = {};
  for (let x = FIELD.x0; x < FIELD.x0 + FIELD.w; x++) for (let z = FIELD.z0; z < FIELD.z0 + FIELD.h; z++) {
    const r = rand(g);
    if (r < 0.10) g.debris[tileKey(x, z)] = 'weed';
    else if (r < 0.16) g.debris[tileKey(x, z)] = 'rock';
    else if (r < 0.20) g.debris[tileKey(x, z)] = 'stump';
  }
  refreshMine(g);
}

export function refreshMine(g) {
  for (let x = MINE.x0; x < MINE.x0 + MINE.w; x++) for (let z = MINE.z0; z < MINE.z0 + MINE.h; z++) {
    const r = rand(g), k = tileKey(x, z);
    if (r < 0.35) g.debris[k] = 'rock'; else if (r < 0.42) g.debris[k] = 'copper'; else delete g.debris[k];
  }
}

function dailyDebris(g) {
  if (g.date.season === 3) return;
  for (let i = 0; i < 4; i++) {
    const x = FIELD.x0 + Math.floor(rand(g) * FIELD.w), z = FIELD.z0 + Math.floor(rand(g) * FIELD.h), k = tileKey(x, z);
    if (!g.tilled[k] && !g.debris[k]) g.debris[k] = 'weed';
  }
}

// ---- tanaman ---------------------------------------------------------------
export const isRipe = (t) => !!t?.crop && t.crop.age >= CROPS[t.crop.id].days;

export function growCrops(g, { seasonChanged = false } = {}) {
  const wilted = [];
  for (const [k, t] of Object.entries(g.tilled)) {
    if (!t.crop) continue;
    const def = CROPS[t.crop.id];
    if (seasonChanged && !def.seasons.includes(g.date.season)) { delete t.crop; wilted.push(k); continue; }
    if (t.watered && t.crop.age < def.days) t.crop.age++;
  }
  dailyDebris(g);
  refreshMine(g);
  return wilted;
}

export function seedSeasonOk(g, id) {
  const def = CROPS[id.replace(/_seed$/, '')];
  return !!def && def.seasons.includes(g.date.season);
}

// ---- pengiriman hasil (dibayar saat hari berganti) ---------------------------
export function ship(g, id, n, { removeItem }) {
  if (!ITEMS[id] || !ITEMS[id].sell) return false;
  if (!removeItem(g, id, n)) return false;
  g.bin[id] = (g.bin[id] || 0) + n;
  return true;
}

export function payShipments(g) {
  let total = 0;
  for (const [id, n] of Object.entries(g.bin)) total += ITEMS[id].sell * n;
  g.bin = {};
  g.gold += total;
  return total;
}

// ---- ternak ------------------------------------------------------------------
export function buyAnimal(g, type) {
  const def = ANIMALS[type];
  if (!def) return 'unknown';
  const cap = def.barn === 'coop' ? COOP_SLOTS : BARN_SLOTS;
  if (g.animals.filter((a) => a.type === type).length >= cap) return 'full';
  if (g.gold < def.price) return 'gold';
  g.gold -= def.price;
  g.animals.push({ type, fed: false, petted: false, love: 0, product: 0 });
  return 'ok';
}

export function feedAnimals(g, { removeItem, countItem }) {
  let fed = 0;
  for (const a of g.animals) if (!a.fed && countItem(g, 'grass') > 0 && removeItem(g, 'grass', 1)) { a.fed = true; fed++; }
  return fed;
}

export function petAnimal(g, i) {
  const a = g.animals[i];
  if (!a || a.petted) return false;
  a.petted = true; a.love = Math.min(10, a.love + 1);
  return true;
}

function animalsOvernight(g) {
  for (const a of g.animals) {
    if (a.fed) { a.product++; a.love = Math.min(10, a.love + (a.petted ? 1 : 0)); } else a.love = Math.max(0, a.love - 1);
    a.fed = false; a.petted = false;
  }
}

export function collectProducts(g, { addItem }) {
  const got = {};
  for (const a of g.animals) {
    if (!a.product) continue;
    const id = ANIMALS[a.type].product;
    const n = addItem(g, id, a.product);
    a.product -= n;
    got[id] = (got[id] || 0) + n;
  }
  return got;
}

// ---- memancing -------------------------------------------------------------
export function rollFish(g, power = 1) {
  const pool = Object.entries(FISH).filter(([, f]) => f.seasons.includes(g.date.season));
  const rainy = g.weather === 'rain' || g.weather === 'storm';
  const weights = pool.map(([id, f]) => [id, (id === 'boot' ? 0.5 : (301 - f.sell) / 100 * (rainy ? f.rain : 1)) * (id !== 'boot' && f.sell >= 200 ? power : 1)]);
  let r = rand(g) * weights.reduce((s, [, w]) => s + w, 0);
  for (const [id, w] of weights) { r -= w; if (r <= 0) return id; }
  return weights[0][0];
}

// ---- memasak ---------------------------------------------------------------
export function cook(g, recipeId, { addItem, removeItem, countItem }) {
  const r = RECIPES[recipeId];
  if (!r) return 'unknown';
  if (!Object.entries(r.needs).every(([id, n]) => countItem(g, id) >= n)) return 'missing';
  for (const [id, n] of Object.entries(r.needs)) removeItem(g, id, n);
  if (!addItem(g, r.makes, 1)) { for (const [id, n] of Object.entries(r.needs)) addItem(g, id, n); return 'full'; }
  return 'ok';
}

// ---- toko ------------------------------------------------------------------
export function buy(g, id, n, { addItem }) {
  const price = ITEMS[id]?.buy;
  if (!price) return 'unsold';
  if (g.gold < price * n) return 'gold';
  const put = addItem(g, id, n);
  g.gold -= price * put;
  return put === n ? 'ok' : 'full';
}

// ---- alat pada petak -----------------------------------------------------------
const DEBRIS_TOOL = { weed: 'sickle', rock: 'hammer', copper: 'hammer', stump: 'axe' };
const DEBRIS_DROP = { weed: ['grass', 1], rock: ['stone', 1], copper: ['copper', 1], stump: ['wood', 3] };

export function useToolOnTile(g, tool, x, z, { addItem, countItem, removeItem }) {
  const def = TOOLS[tool];
  if (!def) return { ok: false, reason: 'unknown' };
  if (g.stamina <= 0) return { ok: false, reason: 'tired' };
  const k = tileKey(x, z), t = g.tilled[k], d = g.debris[k];
  let result = { ok: true };
  if (d) {
    if (DEBRIS_TOOL[d] !== tool) return { ok: false, reason: `need_${DEBRIS_TOOL[d]}` };
    const [id, n] = DEBRIS_DROP[d];
    if (!addItem(g, id, n)) return { ok: false, reason: 'full' };
    delete g.debris[k];
    result = { ok: true, got: id };
  } else if (tool === 'hoe') {
    if (!inField(x, z)) return { ok: false, reason: 'outside' };
    if (t) return { ok: false, reason: 'already' };
    g.tilled[k] = { watered: g.weather === 'rain' || g.weather === 'storm' };
  } else if (tool === 'water') {
    if (!t) return { ok: false, reason: 'notilled' };
    t.watered = true;
  } else if (tool === 'seed') {
    if (!t) return { ok: false, reason: 'notilled' };
    if (t.crop) return { ok: false, reason: 'occupied' };
    const sid = Object.keys(CROPS).map((c) => `${c}_seed`).find((s) => countItem(g, s) > 0 && seedSeasonOk(g, s));
    if (!sid) return { ok: false, reason: 'noseed' };
    removeItem(g, sid, 1);
    t.crop = { id: sid.replace(/_seed$/, ''), age: 0 };
    result = { ok: true, planted: t.crop.id };
  } else {
    return { ok: false, reason: 'nothing' };
  }
  g.stamina = Math.max(0, g.stamina - toolCost(g, tool));
  return result;
}

export function harvest(g, x, z, { addItem }) {
  const t = g.tilled[tileKey(x, z)];
  if (!isRipe(t)) return { ok: false, reason: 'unripe' };
  const def = CROPS[t.crop.id];
  if (!addItem(g, t.crop.id, 1)) return { ok: false, reason: 'full' };
  if (def.regrow) t.crop.age = def.days - def.regrow; else delete t.crop;
  return { ok: true, got: def.name };
}

export { animalsOvernight };

// ---- pandai besi: tingkatkan alat dengan bijih; selesai beberapa hari kemudian -------------
export const toolLevel = (g, tool) => g.toolLevel[tool] || 0;
export const toolCost = (g, tool) => Math.max(1, Math.round(TOOLS[tool].stamina * (1 - 0.25 * toolLevel(g, tool))));
export const UPGRADE = { maxLevel: 1, ore: 'copper', oreN: 3, gold: 500, days: 2, tools: ['hoe', 'water', 'sickle', 'axe', 'hammer'] };

export function orderUpgrade(g, tool, { countItem, removeItem }) {
  if (!UPGRADE.tools.includes(tool)) return 'unsupported';
  if (g.forge) return 'busy';
  if (toolLevel(g, tool) >= UPGRADE.maxLevel) return 'max';
  if (countItem(g, UPGRADE.ore) < UPGRADE.oreN) return 'ore';
  if (g.gold < UPGRADE.gold) return 'gold';
  removeItem(g, UPGRADE.ore, UPGRADE.oreN);
  g.gold -= UPGRADE.gold;
  g.forge = { tool, ready: dayIndex(g.date) + UPGRADE.days };
  return 'ok';
}

export function collectUpgrade(g) {
  if (!g.forge) return null;
  if (dayIndex(g.date) < g.forge.ready) return 'wait';
  const t = g.forge.tool;
  g.toolLevel[t] = toolLevel(g, t) + 1;
  g.forge = null;
  return t;
}
