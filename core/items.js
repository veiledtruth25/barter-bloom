// Data barang. Benih: `${tanaman}_seed`. Harga dalam G.
export const TOOLS = {
  hoe:    { name: 'Cangkul',  icon: '⛏️', stamina: 3 },
  water:  { name: 'Penyiram', icon: '🚿', stamina: 2 },
  seed:   { name: 'Benih',    icon: '🌱', stamina: 1 },
  sickle: { name: 'Sabit',    icon: '🌾', stamina: 2 },
  axe:    { name: 'Kapak',    icon: '🪓', stamina: 4 },
  hammer: { name: 'Palu',     icon: '🔨', stamina: 4 },
  rod:    { name: 'Pancing',  icon: '🎣', stamina: 2 },
};
export const TOOL_ORDER = ['hoe', 'seed', 'water', 'sickle', 'axe', 'hammer', 'rod'];

// seasons: 0 semi, 1 panas, 2 gugur. days = hari sampai matang (disiram tiap hari); regrow = hari antar panen berulang.
export const CROPS = {
  turnip:   { name: 'Lobak',     icon: '🥬', seasons: [0],    days: 4,  sell: 60,  seed: 20,  stamina: 10 },
  potato:   { name: 'Kentang',   icon: '🥔', seasons: [0],    days: 6,  sell: 80,  seed: 30,  stamina: 12 },
  cabbage:  { name: 'Kubis',     icon: '🥦', seasons: [0],    days: 8,  sell: 250, seed: 150, stamina: 15 },
  tomato:   { name: 'Tomat',     icon: '🍅', seasons: [1],    days: 8,  sell: 60,  seed: 200, stamina: 12, regrow: 3 },
  corn:     { name: 'Jagung',    icon: '🌽', seasons: [1],    days: 10, sell: 100, seed: 150, stamina: 15, regrow: 3 },
  onion:    { name: 'Bawang',    icon: '🧅', seasons: [1],    days: 6,  sell: 80,  seed: 40,  stamina: 10 },
  carrot:   { name: 'Wortel',    icon: '🥕', seasons: [2],    days: 7,  sell: 120, seed: 60,  stamina: 12 },
  eggplant: { name: 'Terong',    icon: '🍆', seasons: [2],    days: 8,  sell: 80,  seed: 80,  stamina: 12, regrow: 3 },
  spinach:  { name: 'Bayam',     icon: '🥬', seasons: [2],    days: 4,  sell: 60,  seed: 40,  stamina: 10 },
};

export const FISH = {
  sardine: { name: 'Sarden',  icon: '🐟', sell: 50,  seasons: [0, 1, 2, 3], rain: 0.6 },
  carp:    { name: 'Ikan Mas', icon: '🐠', sell: 120, seasons: [0, 2], rain: 1 },
  trout:   { name: 'Trout',   icon: '🐟', sell: 200, seasons: [0, 1, 2], rain: 0.5 },
  eel:     { name: 'Belut',   icon: '🐍', sell: 300, seasons: [1, 2], rain: 1.5 },
  char:    { name: 'Ikan Salju', icon: '❄️', sell: 260, seasons: [3], rain: 1 },
  boot:    { name: 'Sepatu Bekas', icon: '👢', sell: 1, seasons: [0, 1, 2, 3], rain: 1 },
};

export const RECIPES = {
  stir_fry:  { name: 'Tumis Sayur',  icon: '🥘', needs: { turnip: 1, onion: 1 }, makes: 'dish_stir_fry' },
  omelet:    { name: 'Omelet',       icon: '🍳', needs: { egg: 1, onion: 1 },     makes: 'dish_omelet' },
  porridge:  { name: 'Bubur Susu',   icon: '🥣', needs: { milk: 1, corn: 1 },     makes: 'dish_porridge' },
  grilled:   { name: 'Ikan Bakar',   icon: '🍢', needs: { sardine: 1 },           makes: 'dish_grilled' },
};

export const ITEMS = {
  grass:  { name: 'Rumput',      icon: '🌿', sell: 0 },
  wood:   { name: 'Kayu',        icon: '🪵', sell: 5 },
  stone:  { name: 'Batu',        icon: '🪨', sell: 5 },
  copper: { name: 'Bijih Tembaga', icon: '🟤', sell: 80 },
  egg:    { name: 'Telur',       icon: '🥚', sell: 50,  stamina: 10 },
  milk:   { name: 'Susu',        icon: '🥛', sell: 100, stamina: 15 },
  herb:   { name: 'Jamu',        icon: '🍵', sell: 0,   buy: 100, stamina: 40 },
  dish_stir_fry: { name: 'Tumis Sayur', icon: '🥘', sell: 150, stamina: 40 },
  dish_omelet:   { name: 'Omelet',      icon: '🍳', sell: 180, stamina: 50 },
  dish_porridge: { name: 'Bubur Susu',  icon: '🥣', sell: 200, stamina: 50 },
  dish_grilled:  { name: 'Ikan Bakar',  icon: '🍢', sell: 120, stamina: 45 },
};
for (const [id, c] of Object.entries(CROPS)) {
  ITEMS[id] = { name: c.name, icon: c.icon, sell: c.sell, stamina: c.stamina };
  ITEMS[`${id}_seed`] = { name: `Benih ${c.name}`, icon: '🌱', sell: 0, buy: c.seed };
}
for (const [id, f] of Object.entries(FISH)) ITEMS[id] = { name: f.name, icon: f.icon, sell: f.sell, stamina: id === 'boot' ? 0 : 10 };

Object.assign(ITEMS, {
  flower:    { name: 'Bunga Mawar',   icon: '🌹', sell: 40,  buy: 60 },
  sunflower: { name: 'Bunga Matahari', icon: '🌻', sell: 40, buy: 60 },
  meal_rice: { name: 'Nasi Hangat',   icon: '🍚', sell: 0, buy: 80,  stamina: 30 },
  meal_soup: { name: 'Sup Ayam',      icon: '🍲', sell: 0, buy: 150, stamina: 60 },
  cake:      { name: 'Kue Cokelat',   icon: '🍰', sell: 0, buy: 300, stamina: 40 },
});
