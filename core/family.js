import { dayIndex, SEASONS } from './calendar.js';
import { VILLAGERS, HEART_AT, friendship, hearts } from './villagers.js';
import { ITEMS, CROPS } from './items.js';

// ---- rumah: tukang kayu memperbesar (Rumah + Dapur, lalu Kamar Bayi) ---------------
export const HOUSE_LEVELS = [
  { name: 'Rumah Kecil' },
  { name: 'Rumah + Dapur', gold: 3000, wood: 40, stone: 20, days: 3 },
  { name: 'Rumah + Kamar Bayi', gold: 5000, wood: 60, stone: 30, days: 4 },
];

export function orderHouse(g, { countItem, removeItem }) {
  const next = HOUSE_LEVELS[g.house + 1];
  if (!next) return 'max';
  if (g.build) return 'busy';
  if (g.gold < next.gold) return 'gold';
  if (countItem(g, 'wood') < next.wood || countItem(g, 'stone') < next.stone) return 'material';
  g.gold -= next.gold; removeItem(g, 'wood', next.wood); removeItem(g, 'stone', next.stone);
  g.build = { level: g.house + 1, ready: dayIndex(g.date) + next.days };
  return 'ok';
}

// ---- lamaran & pernikahan ----------------------------------------------------
export const WEDDING_DELAY = 3;

export function propose(g, id, { removeItem, countItem }) {
  const v = VILLAGERS[id];
  if (!v?.bachelorette) return 'notbachelorette';
  if (g.spouse) return 'taken';
  if (friendship(g, id) < HEART_AT[4]) return 'hearts';
  if (g.house < 1) return 'house';
  if (countItem(g, 'blue_feather') < 1) return 'feather';
  removeItem(g, 'blue_feather', 1);
  g.spouse = { id, wedding: dayIndex(g.date) + WEDDING_DELAY, married: false, since: null };
  return 'ok';
}

export const weddingDue = (g) => !!g.spouse && !g.spouse.married && dayIndex(g.date) >= g.spouse.wedding;
export function marry(g) { g.spouse.married = true; g.spouse.since = dayIndex(g.date); }
export const daysMarried = (g) => (g.spouse?.married ? dayIndex(g.date) - g.spouse.since : 0);

// ---- anak -------------------------------------------------------------------
export const BABY_DAYS = 20, TODDLER_DAYS = 60;
export const childStage = (g) => (!g.child ? null : dayIndex(g.date) - g.child.born < BABY_DAYS ? 'baby' : dayIndex(g.date) - g.child.born < TODDLER_DAYS ? 'toddler' : 'kid');

// ---- anjing -----------------------------------------------------------------
export function petDog(g) {
  if (!g.dog || g.dog.petted) return false;
  g.dog.petted = true; g.dog.love = Math.min(10, g.dog.love + 1);
  return true;
}

// ---- pergantian hari: pekerjaan pasangan, kehamilan, antrean event, bangunan ----------
export function familyOvernight(g, { addItem }) {
  const idx = dayIndex(g.date), out = { chores: 0, lunch: false };
  if (g.build && idx >= g.build.ready) { g.house = g.build.level; g.build = null; g.queue.push({ kind: 'family', id: 'house' }); }
  if (g.dog) g.dog.petted = false;
  if (g.spouse?.married) {
    for (const t of Object.values(g.tilled)) if (t.crop && !t.watered && out.chores < 12) { t.watered = true; out.chores++; }
    out.lunch = addItem(g, 'meal_rice', 1) === 1;
    g.stats.spouseDays++;
    if (!g.child && !g.expecting && g.house >= 2 && daysMarried(g) >= 14 && friendship(g, g.spouse.id) >= HEART_AT[4]) g.expecting = idx + 10;
    if (g.expecting && idx >= g.expecting) { g.expecting = null; g.queue.push({ kind: 'family', id: 'birth' }); }
  }
  if (!g.dog && idx >= 1 && !g.flags.dogOffered) { g.flags.dogOffered = true; g.queue.push({ kind: 'family', id: 'dog' }); }
  if (g.date.year >= 3 && g.date.season === 0 && g.date.day === 1 && !g.flags.endingShown) { g.flags.endingShown = true; g.queue.push({ kind: 'family', id: 'ending' }); }
  return out;
}

export function nextQueued(g) { return g.queue.shift() || null; }

// ---- rapor akhir ----------------------------------------------------------------
export function computeEnding(g) {
  const cats = [];
  const add = (label, points, max, note) => cats.push({ label, points: Math.min(max, Math.round(points)), max, note });
  add('Kekayaan', g.gold / 400, 20, `${g.gold} G`);
  add('Hasil kiriman', g.stats.shippedGold / 600, 15, `${g.stats.shippedGold} G terkirim`);
  add('Panen', g.stats.harvests / 8, 10, `${g.stats.harvests} panen`);
  const tools = Object.values(g.toolLevel).reduce((a, b) => a + b, 0);
  add('Alat', tools * 3, 10, `${tools} alat ditingkatkan`);
  const friends = Object.keys(VILLAGERS).reduce((s, id) => s + hearts(g, id), 0);
  add('Persahabatan', friends * 1.5, 20, `${friends} total tingkat hati`);
  add('Ternak', g.animals.length * 2 + g.animals.reduce((s, a) => s + a.love, 0) / 5, 10, `${g.animals.length} hewan`);
  add('Keluarga', (g.spouse?.married ? 8 : 0) + (g.child ? 5 : 0) + (g.dog ? 2 : 0), 15, `${g.spouse?.married ? 'menikah' : 'lajang'}${g.child ? ', punya anak' : ''}${g.dog ? ', punya anjing' : ''}`);
  const score = cats.reduce((s, c) => s + c.points, 0);
  const rank = score >= 85 ? 'Legenda Desa' : score >= 65 ? 'Petani Teladan' : score >= 45 ? 'Petani Andal' : score >= 25 ? 'Petani Rajin' : 'Petani Pemula';
  return { score, max: 100, rank, cats };
}

export { SEASONS, ITEMS, CROPS };
