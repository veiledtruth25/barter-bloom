// Shared game definitions used by both the server and the browser client.

export const FIELD_W = 14;
export const FIELD_H = 10;
export const DAYS_PER_SEASON = 28;
export const DAY_START_MIN = 6 * 60; // 06:00
export const DAY_END_MIN = 26 * 60; // 02:00 the next day
export const SLEEP_ALLOWED_MIN = 18 * 60;
export const MAX_STAMINA = 100;
export const REACH = 3.2;
export const MAX_LISTINGS = 10;
export const WORLD_BOUNDS = { x0: -60, x1: 60, z0: -44, z1: 44 };

export const SEASONS = [
  { id: 'spring', name: 'Musim Semi', icon: '🌸' },
  { id: 'summer', name: 'Musim Panas', icon: '☀️' },
  { id: 'fall', name: 'Musim Gugur', icon: '🍂' },
  { id: 'winter', name: 'Musim Dingin', icon: '❄️' },
];

export const WEATHER = {
  sunny: { name: 'Cerah', icon: '☀️' },
  rain: { name: 'Hujan', icon: '🌧️' },
  storm: { name: 'Badai', icon: '⛈️' },
  snow: { name: 'Salju', icon: '🌨️' },
};

export const WEATHER_TABLE = {
  spring: [['sunny', 0.7], ['rain', 0.3]],
  summer: [['sunny', 0.75], ['rain', 0.15], ['storm', 0.1]],
  fall: [['sunny', 0.75], ['rain', 0.25]],
  winter: [['sunny', 0.5], ['snow', 0.5]],
};

export const TOOLS = [
  { id: 'hoe', name: 'Cangkul', icon: '⛏️', key: '1', desc: 'Menggemburkan tanah' },
  { id: 'can', name: 'Penyiram', icon: '🚿', key: '2', desc: 'Menyiram tanah. Isi ulang di sumur/kolam' },
  { id: 'sickle', name: 'Sabit', icon: '🌾', key: '3', desc: 'Memotong rumput liar & tanaman layu' },
  { id: 'axe', name: 'Kapak', icon: '🪓', key: '4', desc: 'Menebang tunggul → kayu' },
  { id: 'hammer', name: 'Palu', icon: '🔨', key: '5', desc: 'Memecah batu → batu' },
  { id: 'rod', name: 'Pancing', icon: '🎣', key: '6', desc: 'Memancing di kolam' },
  { id: 'hand', name: 'Tangan', icon: '✋', key: '7', desc: 'Panen, tanam benih terpilih, ambil barang' },
];

// Tools are upgraded by the blacksmith with ore, like in the classic games.
export const UPGRADABLE_TOOLS = ['hoe', 'can', 'sickle', 'axe', 'hammer', 'rod'];
export const TOOL_LEVELS = [
  { name: 'Biasa', short: '', color: '#9aa0a6' },
  { name: 'Tembaga', short: 'Cu', color: '#c77b3a', cost: { gold: 1000, items: { copper_ore: 3 } } },
  { name: 'Perak', short: 'Ag', color: '#c9d1d9', cost: { gold: 2500, items: { silver_ore: 3 } } },
  { name: 'Emas', short: 'Au', color: '#f2c94c', cost: { gold: 5000, items: { gold_ore: 3 } } },
];
// Stamina per use, by tool level.
const TOOL_COST = {
  hoe: [2, 3, 4, 2], can: [1, 2, 3, 1], sickle: [1, 2, 3, 1],
  axe: [4, 3, 2, 1], hammer: [4, 3, 2, 1], rod: [3, 3, 2, 2],
};
export const CAN_CAPACITY = [20, 40, 60, 100];
export function toolCost(tool, level = 0) {
  return TOOL_COST[tool] ? TOOL_COST[tool][level] : 0;
}
// Hoe, watering can and sickle work on more tiles at higher levels.
export function toolArea(tool, level = 0) {
  if (!['hoe', 'can', 'sickle'].includes(tool) || level <= 0) return 'single';
  return level === 1 ? 'line' : 'square';
}
export const TOOL_EFFECT = {
  hoe: ['1 petak', '3 petak sebaris', '3×3 petak', '3×3 petak, hemat stamina'],
  can: ['1 petak · 20 air', '3 petak · 40 air', '3×3 petak · 60 air', '3×3 petak · 100 air, hemat stamina'],
  sickle: ['1 petak', '3 petak sebaris', '3×3 petak', '3×3 petak, hemat stamina'],
  axe: ['4 stamina', '+1 kayu, 3 stamina', '+2 kayu, 2 stamina', '+3 kayu, 1 stamina'],
  hammer: ['4 stamina', 'lebih banyak bijih, 3 stamina', 'bijih langka, 2 stamina', 'bijih terbaik, 1 stamina'],
  rod: ['biasa', 'ikan lebih besar', 'waktu tarik lebih lama', 'peluang ikan legenda'],
};

// House extensions by the carpenter; a bigger house is needed to marry.
export const HOUSE_LEVELS = [
  { name: 'Rumah Kayu', stamina: 0 },
  { name: 'Rumah + Dapur', stamina: 10, cost: { gold: 3000, items: { lumber: 100 } } },
  { name: 'Rumah Besar', stamina: 20, cost: { gold: 8000, items: { lumber: 250, stone: 80 } } },
];

export const BARN_LEVELS = [
  { name: 'Kandang Kecil', chicken: 2, cow: 1 },
  { name: 'Kandang Sedang', chicken: 4, cow: 3, cost: { gold: 2000, items: { lumber: 60, stone: 20 } } },
  { name: 'Kandang Besar', chicken: 8, cow: 6, cost: { gold: 5000, items: { lumber: 120, stone: 60 } } },
];

// shape: how the crop is rendered in 3D. days: days of watering until ripe.
// regrow: days until harvestable again after picking (0 = single harvest).
export const CROPS = {
  potato: { name: 'Kentang', icon: '🥔', season: 'spring', days: 6, regrow: 0, seed: 150, sell: 80, shape: 'root', fruit: 0xc9a26b, leaf: 0x5fa83a },
  cucumber: { name: 'Mentimun', icon: '🥒', season: 'spring', days: 9, regrow: 4, seed: 200, sell: 60, shape: 'vine', fruit: 0x3f8f2f, leaf: 0x58b23c },
  strawberry: { name: 'Stroberi', icon: '🍓', season: 'spring', days: 8, regrow: 2, seed: 150, sell: 35, shape: 'bush', fruit: 0xe8283a, leaf: 0x4aa33a },
  cabbage: { name: 'Kubis', icon: '🥬', season: 'spring', days: 14, regrow: 0, seed: 500, sell: 250, shape: 'head', fruit: 0x9ad46a, leaf: 0x6fbf4a },
  tomato: { name: 'Tomat', icon: '🍅', season: 'summer', days: 9, regrow: 3, seed: 200, sell: 60, shape: 'vine', fruit: 0xe2412b, leaf: 0x4f9e34 },
  corn: { name: 'Jagung', icon: '🌽', season: 'summer', days: 14, regrow: 3, seed: 300, sell: 100, shape: 'stalk', fruit: 0xf2c94c, leaf: 0x6db33f },
  onion: { name: 'Bawang', icon: '🧅', season: 'summer', days: 7, regrow: 0, seed: 150, sell: 80, shape: 'root', fruit: 0xd9a066, leaf: 0x7cc35a },
  pineapple: { name: 'Nanas', icon: '🍍', season: 'summer', days: 20, regrow: 5, seed: 1000, sell: 500, shape: 'big', fruit: 0xe6b422, leaf: 0x3e8f4f },
  eggplant: { name: 'Terong', icon: '🍆', season: 'fall', days: 9, regrow: 3, seed: 120, sell: 80, shape: 'vine', fruit: 0x6b2d8c, leaf: 0x4f8f34 },
  carrot: { name: 'Wortel', icon: '🥕', season: 'fall', days: 7, regrow: 0, seed: 300, sell: 120, shape: 'root', fruit: 0xf07b1d, leaf: 0x5fb23a },
  sweetpotato: { name: 'Ubi', icon: '🍠', season: 'fall', days: 5, regrow: 2, seed: 300, sell: 120, shape: 'root', fruit: 0xb5476b, leaf: 0x5f9e3a },
  pumpkin: { name: 'Labu', icon: '🎃', season: 'fall', days: 14, regrow: 0, seed: 500, sell: 250, shape: 'big', fruit: 0xf08a1c, leaf: 0x4f8f34 },
};

export const ANIMALS = {
  chicken: { name: 'Ayam', icon: '🐔', price: 1500, feed: 'chicken_feed', product: 'egg', premium: 'golden_egg' },
  cow: { name: 'Sapi', icon: '🐄', price: 5000, feed: 'fodder', product: 'milk', premium: 'premium_milk' },
};
export const PREMIUM_AFFECTION = 40;
export const MAX_AFFECTION = 100;

// type: seed | crop | animal | forage | fish | material | ore | feed | food | medicine | special
// sell: base shipping price (0 = cannot ship). buy: shop price (see SHOPS for who sells it).
// eat: stamina restored when eaten (999 = fully restored).
export const ITEMS = {
  egg: { name: 'Telur', icon: '🥚', type: 'animal', sell: 50, eat: 10 },
  golden_egg: { name: 'Telur Emas', icon: '🌟', type: 'animal', sell: 150 },
  milk: { name: 'Susu', icon: '🥛', type: 'animal', sell: 100, eat: 15 },
  premium_milk: { name: 'Susu Premium', icon: '🍼', type: 'animal', sell: 200, eat: 25 },
  bamboo: { name: 'Rebung', icon: '🎋', type: 'forage', sell: 50, season: 'spring' },
  herb: { name: 'Herba Obat', icon: '🌿', type: 'forage', sell: 50, eat: 15, season: 'spring' },
  flower: { name: 'Bunga Liar', icon: '🌸', type: 'forage', sell: 60, season: 'spring' },
  berry: { name: 'Beri Liar', icon: '🫐', type: 'forage', sell: 40, eat: 10, season: 'summer' },
  shell: { name: 'Kerang', icon: '🐚', type: 'forage', sell: 80, season: 'summer' },
  sunflower: { name: 'Bunga Matahari', icon: '🌻', type: 'forage', sell: 70, season: 'summer' },
  mushroom: { name: 'Jamur', icon: '🍄', type: 'forage', sell: 70, eat: 12, season: 'fall' },
  grape: { name: 'Anggur Liar', icon: '🍇', type: 'forage', sell: 60, eat: 10, season: 'fall' },
  chestnut: { name: 'Kemiri', icon: '🌰', type: 'forage', sell: 40, eat: 8, season: 'winter' },
  gem: { name: 'Permata', icon: '💎', type: 'forage', sell: 300 },
  fish_s: { name: 'Ikan Kecil', icon: '🐟', type: 'fish', sell: 50, eat: 10 },
  fish_m: { name: 'Ikan Sedang', icon: '🐠', type: 'fish', sell: 120 },
  fish_l: { name: 'Ikan Besar', icon: '🐡', type: 'fish', sell: 250 },
  fish_legend: { name: 'Ikan Legenda', icon: '🦈', type: 'fish', sell: 1500 },
  lumber: { name: 'Kayu', icon: '🪵', type: 'material', sell: 10, buy: 50 },
  stone: { name: 'Batu', icon: '🪨', type: 'material', sell: 10, buy: 60 },
  copper_ore: { name: 'Bijih Tembaga', icon: '🥉', type: 'ore', sell: 15 },
  silver_ore: { name: 'Bijih Perak', icon: '🥈', type: 'ore', sell: 30 },
  gold_ore: { name: 'Bijih Emas', icon: '🥇', type: 'ore', sell: 60 },
  chicken_feed: { name: 'Pakan Ayam', icon: '🌽', type: 'feed', sell: 0, buy: 10 },
  fodder: { name: 'Rumput Pakan', icon: '🌾', type: 'feed', sell: 0, buy: 20 },
  bread: { name: 'Roti', icon: '🍞', type: 'food', sell: 0, buy: 100, eat: 40 },
  tea: { name: 'Teh Manis', icon: '🍵', type: 'food', sell: 0, buy: 60, eat: 20 },
  onigiri: { name: 'Nasi Kepal', icon: '🍙', type: 'food', sell: 0, buy: 200, eat: 70 },
  friedrice: { name: 'Nasi Goreng', icon: '🍛', type: 'food', sell: 0, buy: 260, eat: 80 },
  soto: { name: 'Soto Ayam', icon: '🍜', type: 'food', sell: 0, buy: 400, eat: 120 },
  bento: { name: 'Bekal Cinta', icon: '🍱', type: 'food', sell: 0, eat: 100 },
  jamu: { name: 'Jamu Kuat', icon: '🧉', type: 'medicine', sell: 0, buy: 500, eat: 60 },
  elixir: { name: 'Ramuan Ajaib', icon: '🧪', type: 'medicine', sell: 0, buy: 1200, eat: 999 },
  blue_feather: { name: 'Bulu Biru', icon: '🪶', type: 'special', sell: 0, buy: 1000, desc: 'Berikan kepada warga yang kamu cintai (10 hati) untuk melamar.' },
  power_berry: { name: 'Buah Kekuatan', icon: '🍒', type: 'special', sell: 0, desc: 'Hadiah Dewi Panen. Dimakan: stamina maksimal +10 selamanya.' },
  trophy: { name: 'Piala Ternak', icon: '🏆', type: 'special', sell: 0, desc: 'Juara Lomba Ternak.' },
};

for (const [id, c] of Object.entries(CROPS)) {
  ITEMS[`${id}_seed`] = { name: `Benih ${c.name}`, icon: '🌱', cropIcon: c.icon, type: 'seed', crop: id, sell: 0, buy: c.seed, season: c.season };
  ITEMS[id] = { name: c.name, icon: c.icon, type: 'crop', sell: c.sell, eat: Math.max(5, Math.round(c.sell / 10)), season: c.season };
}

export const FORAGE_BY_SEASON = {
  spring: ['bamboo', 'herb', 'flower'],
  summer: ['berry', 'shell', 'sunflower'],
  fall: ['mushroom', 'grape', 'herb'],
  winter: ['chestnut', 'chestnut', 'gem'],
};

export const FESTIVALS = [
  { id: 'flower', season: 0, day: 8, name: 'Festival Bunga', icon: '🌷', start: 10 * 60, end: 18 * 60, activity: 'dance', desc: 'Menari bersama warga pilihanmu di alun-alun.' },
  { id: 'livestock', season: 1, day: 20, name: 'Lomba Ternak', icon: '🏆', start: 10 * 60, end: 15 * 60, activity: 'contest', desc: 'Daftarkan ternak tersayangmu. Juara diumumkan pukul 15:00.' },
  { id: 'fireworks', season: 1, day: 24, name: 'Festival Kembang Api', icon: '🎆', start: 18 * 60, end: 22 * 60, activity: 'watch', desc: 'Menonton kembang api bersama warga pilihanmu.' },
  { id: 'harvest', season: 2, day: 13, name: 'Festival Panen', icon: '🍲', start: 10 * 60, end: 18 * 60, activity: 'pot', desc: 'Sumbangkan bahan ke kuali besar; semua warga ikut menikmati.' },
  { id: 'starry', season: 3, day: 24, name: 'Malam Bintang', icon: '⭐', start: 18 * 60, end: 22 * 60, activity: 'dinner', desc: 'Makan malam istimewa bersama warga pilihanmu.' },
];
export function festivalOf(season, day) {
  return FESTIVALS.find((f) => f.season === season && f.day === day) || null;
}
// Villagers gather a little before a festival starts.
export const FESTIVAL_GATHER = 40;

export const START_GOLD = 500;
export const START_ITEMS = { potato_seed: 2, strawberry_seed: 1, bread: 2, chicken_feed: 5 };

// ---------------------------------------------------------------- world layout

export const PLOT_CENTERS = [
  [-42, -30], [-14, -30], [14, -30], [42, -30],
  [-42, 30], [-14, 30], [14, 30], [42, 30],
];

export function plotLayout(i) {
  const [cx, cz] = PLOT_CENTERS[i];
  const ox = cx - 4;
  const oz = cz - 3;
  return {
    ox, oz,
    field: { x0: ox, z0: oz, x1: ox + FIELD_W, z1: oz + FIELD_H },
    house: { x: ox - 5, z: oz + 2.5, w: 6, d: 5 },
    houseDoor: { x: ox - 1.2, z: oz + 2.5 },
    barn: { x: ox - 5, z: oz + 8.2, w: 6, d: 4.4 },
    barnDoor: { x: ox - 1.2, z: oz + 8.2 },
    pen: { x0: ox + 0.5, z0: oz - 6, x1: ox + FIELD_W - 0.5, z1: oz - 1.2 },
    bin: { x: ox + 15.4, z: oz + 1.5 },
    well: { x: ox + 15.4, z: oz + 5 },
    sign: { x: ox + 15.4, z: oz + 8.6 },
  };
}

export const TOWN = {
  store: { x: -12, z: -9, w: 9, d: 6, door: { x: -12, z: -5.2 } },
  market: { x: 12, z: -9, w: 9, d: 6, door: { x: 12, z: -5.2 } },
  fountain: { x: 0, z: 0, r: 2 },
  pond: { x: 24, z: 6, r: 5.5 },
  // Wooden fishing pier on the west bank of the pond.
  pier: { x0: 18.3, x1: 19.9, z0: 4.9, z1: 7.1, y: 0.31 },
  // Plaza benches: [x, z, facing].
  benches: [[-4.5, 5.5, Math.PI + 0.6], [4.5, 5.5, Math.PI - 0.6], [-5.5, -3, 1.2], [5.5, -3, -1.2]],
  // Shop counters; shopkeepers stand between the counter and their door.
  counter: { x: -9.4, z: -4.4, w: 1.6, d: 0.6 },
  counters: {
    ranch: { x: -21.6, z: 6.5, w: 1.6, d: 0.6 },
    forge: { x: -21.8, z: -17.25, w: 1.6, d: 0.6 },
    carpenter: { x: -21.9, z: -2.6, w: 1.6, d: 0.6 },
    kedai: { x: -4.2, z: 11.55, w: 1.6, d: 0.6 },
    clinic: { x: 7.6, z: 11.55, w: 1.6, d: 0.6 },
  },
  board: { x: 2.6, z: -12.6 },
  // Harvest Goddess' spring in the eastern woods.
  spring: { x: 50, z: -9, r: 2.2 },
  // Villagers' homes and workplaces.
  houses: {
    mayor: { x: -14, z: 10.5, w: 6, d: 5, door: 'north' },
    hut: { x: 12.5, z: 12.5, w: 5, d: 4.5, door: 'north' },
    workshop: { x: -24, z: -5.6, w: 6, d: 4, door: 'south' },
    depot: { x: 25.5, z: -14, w: 7, d: 4.5, door: 'north' },
    forge: { x: -24, z: -14, w: 6, d: 4.5, door: 'north' },
    ranch: { x: -24, z: 10, w: 7, d: 5, door: 'north' },
    kedai: { x: -6.5, z: 14.8, w: 7, d: 4.5, door: 'north' },
    clinic: { x: 5.8, z: 14.8, w: 6, d: 4.5, door: 'north' },
  },
  ranchPen: { x0: -27.3, z0: 13.4, x1: -20.7, z1: 17.4 },
};

// Who sells what, where they stand and when they are open (closed during festivals).
export const SHOPS = {
  store: { name: 'Toko Kelontong', icon: '🏪', npc: 'darto', open: 8 * 60, close: 18 * 60, at: { x: -9.4, z: -5.3 }, door: { x: -12, z: -5.2 }, items: ['bread', 'blue_feather'], seeds: true },
  ranch: { name: 'Peternakan Jaya', icon: '🐄', npc: 'jaya', open: 8 * 60, close: 16 * 60, at: { x: -21.6, z: 7.15 }, door: { x: -24, z: 7.1 }, items: ['chicken_feed', 'fodder'], animals: true },
  carpenter: { name: 'Bengkel Kayu', icon: '🪚', npc: 'joko', open: 9 * 60, close: 16 * 60, at: { x: -21.9, z: -3.25 }, door: { x: -24, z: -3.2 }, items: ['lumber', 'stone'], build: true },
  forge: { name: 'Pandai Besi', icon: '⚒️', npc: 'bejo', open: 10 * 60, close: 16 * 60, at: { x: -21.8, z: -16.6 }, door: { x: -24, z: -16.6 }, forge: true },
  kedai: { name: 'Kedai Ayu', icon: '🍲', npc: 'ayu', open: 11 * 60, close: 21 * 60, at: { x: -4.2, z: 12.2 }, door: { x: -6.5, z: 12.15 }, items: ['tea', 'onigiri', 'friedrice', 'soto'] },
  clinic: { name: 'Klinik Desa', icon: '🏥', npc: 'raka', open: 9 * 60, close: 16 * 60, at: { x: 7.6, z: 12.2 }, door: { x: 5.8, z: 12.15 }, items: ['jamu', 'elixir'], checkup: true },
};

export function shopOpen(shopId, minute, festival = null) {
  const s = SHOPS[shopId];
  if (!s || minute < s.open || minute >= s.close) return false;
  // Everyone goes to the festival, so shops close while it runs.
  if (festival && minute >= festival.start - FESTIVAL_GATHER && minute < festival.end) return false;
  return true;
}

export function shopHours(shopId) {
  const s = SHOPS[shopId];
  return `${formatTime(s.open)}–${formatTime(s.close)}`;
}

export const WILD_ZONES = [
  { x0: -58, z0: -15, x1: -30, z1: 15 },
  { x0: 34, z0: -15, x1: 58, z1: 15 },
];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic trees in the wild zones so server and client agree on positions.
// The clearing around the goddess' spring is kept free.
export const WILD_TREES = (() => {
  const rnd = mulberry32(1337);
  const out = [];
  for (const z of WILD_ZONES) {
    let tries = 0;
    let count = 0;
    while (count < 34 && tries < 2000) {
      tries++;
      const x = z.x0 + rnd() * (z.x1 - z.x0);
      const zz = z.z0 + rnd() * (z.z1 - z.z0);
      if (Math.hypot(x - TOWN.pond.x, zz - TOWN.pond.z) < TOWN.pond.r + 3) continue;
      if (Math.abs(zz) < 2.5) continue; // keep the main road clear
      if (Math.hypot(x - TOWN.spring.x, zz - TOWN.spring.z) < TOWN.spring.r + 3.5) continue;
      if (out.some((t) => Math.hypot(t.x - x, t.z - zz) < 3.2)) continue;
      out.push({ x, z: zz, s: 0.8 + rnd() * 0.6, kind: rnd() < 0.35 ? 'pine' : 'round' });
      count++;
    }
  }
  return out;
})();

export function colliders() {
  const boxes = [];
  const circles = [];
  const box = (b, pad = 0) => boxes.push({ x0: b.x - b.w / 2 - pad, z0: b.z - b.d / 2 - pad, x1: b.x + b.w / 2 + pad, z1: b.z + b.d / 2 + pad });
  for (let i = 0; i < PLOT_CENTERS.length; i++) {
    const L = plotLayout(i);
    box(L.house);
    box(L.barn);
    circles.push({ x: L.well.x, z: L.well.z, r: 0.9 });
    boxes.push({ x0: L.bin.x - 0.75, z0: L.bin.z - 0.5, x1: L.bin.x + 0.75, z1: L.bin.z + 0.5 });
  }
  box(TOWN.store);
  box(TOWN.market);
  for (const hse of Object.values(TOWN.houses)) box(hse);
  box(TOWN.counter);
  for (const c of Object.values(TOWN.counters)) box(c);
  circles.push({ x: TOWN.spring.x, z: TOWN.spring.z, r: TOWN.spring.r - 0.3 });
  boxes.push({ x0: TOWN.board.x - 0.25, z0: TOWN.board.z - 0.95, x1: TOWN.board.x + 0.25, z1: TOWN.board.z + 0.95 });
  circles.push({ x: TOWN.fountain.x, z: TOWN.fountain.z, r: TOWN.fountain.r });
  circles.push({ x: TOWN.pond.x, z: TOWN.pond.z, r: TOWN.pond.r - 0.4 });
  for (const t of WILD_TREES) circles.push({ x: t.x, z: t.z, r: 0.55 * t.s });
  return { boxes, circles };
}

export function resolveCollision(x, z, col, radius = 0.35) {
  const b = WORLD_BOUNDS;
  x = Math.min(b.x1, Math.max(b.x0, x));
  z = Math.min(b.z1, Math.max(b.z0, z));
  for (const c of col.circles) {
    const dx = x - c.x, dz = z - c.z;
    const d = Math.hypot(dx, dz);
    const min = c.r + radius;
    if (d < min && d > 1e-6) {
      x = c.x + (dx / d) * min;
      z = c.z + (dz / d) * min;
    }
  }
  for (const r of col.boxes) {
    const x0 = r.x0 - radius, x1 = r.x1 + radius, z0 = r.z0 - radius, z1 = r.z1 + radius;
    if (x > x0 && x < x1 && z > z0 && z < z1) {
      const pushes = [[x - x0, 'x', x0], [x1 - x, 'x', x1], [z - z0, 'z', z0], [z1 - z, 'z', z1]];
      pushes.sort((a, b2) => a[0] - b2[0]);
      if (pushes[0][1] === 'x') x = pushes[0][2];
      else z = pushes[0][2];
    }
  }
  return [x, z];
}

// Height of walkable surfaces (only the pier is raised).
export function groundHeight(x, z) {
  const P = TOWN.pier;
  return x >= P.x0 && x <= P.x1 && z >= P.z0 && z <= P.z1 ? P.y : 0;
}

export function nearSpring(x, z, extra = 1.6) {
  return Math.hypot(x - TOWN.spring.x, z - TOWN.spring.z) < TOWN.spring.r + extra;
}

export function nearWater(x, z, extra = 1.8) {
  return Math.hypot(x - TOWN.pond.x, z - TOWN.pond.z) < TOWN.pond.r + extra;
}

export function formatTime(min) {
  const m = Math.floor(min) % 1440;
  const h = Math.floor(m / 60);
  const mm = Math.floor(m % 60 / 10) * 10;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function cropStage(crop) {
  const c = CROPS[crop.id];
  if (crop.withered) return -1;
  if (crop.g >= c.days) return 3;
  return Math.min(2, Math.floor((crop.g / c.days) * 3));
}

export function itemPrice(itemId, mult) {
  const it = ITEMS[itemId];
  if (!it || !it.sell) return 0;
  return Math.max(1, Math.round(it.sell * (mult ?? 1)));
}
