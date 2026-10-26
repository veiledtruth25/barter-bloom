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

export const STAMINA_COST = { hoe: 2, can: 1, sickle: 1, axe: 4, hammer: 4, rod: 3, hand: 0 };

export const CAN_LEVELS = [
  { name: 'Penyiram Biasa', capacity: 20 },
  { name: 'Penyiram Tembaga', capacity: 40, cost: { gold: 1500, items: { stone: 15 } } },
  { name: 'Penyiram Emas', capacity: 80, cost: { gold: 4000, items: { stone: 40, lumber: 20 } } },
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

// type: seed | crop | animal | forage | fish | material | feed | food
// sell: base shipping price (0 = cannot ship). buy: store price (absent = not sold in store).
// eat: stamina restored when eaten.
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
  chicken_feed: { name: 'Pakan Ayam', icon: '🌽', type: 'feed', sell: 0, buy: 10 },
  fodder: { name: 'Rumput Pakan', icon: '🌾', type: 'feed', sell: 0, buy: 20 },
  bread: { name: 'Roti', icon: '🍞', type: 'food', sell: 0, buy: 100, eat: 40 },
  onigiri: { name: 'Nasi Kepal', icon: '🍙', type: 'food', sell: 0, buy: 200, eat: 70 },
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
  // Shop counter where the shopkeeper stands during opening hours.
  counter: { x: -9.4, z: -4.4, w: 1.6, d: 0.6 },
  board: { x: 2.6, z: -12.6 },
  // Villagers' homes (doors face the main road).
  houses: {
    mayor: { x: -14, z: 10.5, w: 6, d: 5, door: 'north' },
    hut: { x: 12.5, z: 12.5, w: 5, d: 4.5, door: 'north' },
    workshop: { x: -24, z: -5.6, w: 6, d: 4, door: 'south' },
  },
};

export const STORE_HOURS = { open: 8 * 60, close: 18 * 60 };
export function storeOpen(minute) {
  return minute >= STORE_HOURS.open && minute < STORE_HOURS.close;
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
