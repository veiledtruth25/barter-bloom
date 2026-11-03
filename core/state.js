import { DAY_START, DAY_END, PASS_OUT, nextDate, weatherFor, weekday } from './calendar.js';
import { ITEMS, TOOLS } from './items.js';

export const SAVE_VERSION = 1;
export const RUCKSACK_SLOTS = 9;
export const MAX_STAMINA = 100;
export const STACK = 9;

export function newGame(name = 'Petani', seed = (Math.random() * 1e9) | 0) {
  const date = { year: 1, season: 0, day: 1 };
  return {
    version: SAVE_VERSION, seed, name,
    date, minute: DAY_START,
    weather: weatherFor(date, seed), forecast: weatherFor(nextDate(date), seed),
    gold: 300, stamina: MAX_STAMINA, maxStamina: MAX_STAMINA,
    tools: ['hoe', 'water', 'sickle', 'axe', 'hammer'],
    rucksack: Array.from({ length: RUCKSACK_SLOTS }, () => null),
    tilled: {},   // "x,z" -> { watered: bool }
    flags: {},
  };
}

// ---- waktu -----------------------------------------------------------------
export function advanceMinutes(g, mins) {
  g.minute += mins;
  if (g.minute >= PASS_OUT) return { passedOut: true };
  return { passedOut: false, late: g.minute >= DAY_END };
}

// Tidur: hari berganti, stamina pulih. Pingsan/begadang memulihkan lebih sedikit.
export function sleep(g, { passedOut = false } = {}) {
  const late = g.minute >= DAY_END;
  const recover = passedOut ? 0.5 : late ? 0.75 : 1;
  g.date = nextDate(g.date);
  g.minute = passedOut ? DAY_START + 120 : DAY_START;
  g.weather = g.forecast;
  g.forecast = weatherFor(nextDate(g.date), g.seed);
  g.stamina = Math.min(g.maxStamina, Math.round(g.maxStamina * recover));
  for (const k of Object.keys(g.tilled)) {
    g.tilled[k].watered = g.weather === 'rain' || g.weather === 'storm';
  }
  return { weekday: weekday(g.date), weather: g.weather, forecast: g.forecast };
}

// ---- stamina & kelelahan (ala HM:BTN) --------------------------------------
export function fatigue(g) {
  const p = g.stamina / g.maxStamina;
  return p > 0.6 ? 'fit' : p > 0.3 ? 'tired' : p > 0.1 ? 'exhausted' : 'collapse';
}

export function useStamina(g, n) {
  if (g.stamina <= 0) return false;
  g.stamina = Math.max(0, g.stamina - n);
  return true;
}

export function eat(g, id) {
  const gain = ITEMS[id]?.stamina;
  if (!gain || !removeItem(g, id, 1)) return false;
  g.stamina = Math.min(g.maxStamina, g.stamina + gain);
  return true;
}

// ---- rucksack --------------------------------------------------------------
export function countItem(g, id) {
  return g.rucksack.reduce((n, s) => n + (s && s.id === id ? s.n : 0), 0);
}

export function addItem(g, id, n = 1) {
  if (!ITEMS[id]) throw new Error(`barang tak dikenal: ${id}`);
  let left = n;
  for (const s of g.rucksack) {
    if (s && s.id === id && s.n < STACK) { const t = Math.min(STACK - s.n, left); s.n += t; left -= t; }
  }
  for (let i = 0; i < g.rucksack.length && left > 0; i++) {
    if (!g.rucksack[i]) { const t = Math.min(STACK, left); g.rucksack[i] = { id, n: t }; left -= t; }
  }
  return n - left; // jumlah yang muat
}

export function removeItem(g, id, n = 1) {
  if (countItem(g, id) < n) return false;
  let left = n;
  for (let i = g.rucksack.length - 1; i >= 0 && left > 0; i--) {
    const s = g.rucksack[i];
    if (s && s.id === id) { const t = Math.min(s.n, left); s.n -= t; left -= t; if (!s.n) g.rucksack[i] = null; }
  }
  return true;
}

// ---- ladang ----------------------------------------------------------------
export const tileKey = (x, z) => `${x},${z}`;

export function useTool(g, tool, x, z) {
  const def = TOOLS[tool];
  if (!def) return { ok: false, reason: 'unknown' };
  if (g.stamina <= 0) return { ok: false, reason: 'tired' };
  const k = tileKey(x, z);
  if (tool === 'hoe') {
    if (g.tilled[k]) return { ok: false, reason: 'already' };
    g.tilled[k] = { watered: false };
  } else if (tool === 'water') {
    if (!g.tilled[k]) return { ok: false, reason: 'notilled' };
    g.tilled[k].watered = true;
  } else {
    return { ok: false, reason: 'nothing' };
  }
  useStamina(g, def.stamina);
  return { ok: true };
}

// ---- simpan ----------------------------------------------------------------
export function serialize(g) {
  return JSON.stringify(g);
}

export function deserialize(text) {
  const g = JSON.parse(text);
  if (!g || g.version !== SAVE_VERSION) throw new Error('save tidak kompatibel');
  return g;
}
