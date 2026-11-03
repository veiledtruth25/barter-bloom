// Data barang. Stage berikutnya menambah tanaman, ikan, dsb.
export const TOOLS = {
  hoe:   { name: 'Cangkul',  icon: '⛏️', stamina: 3 },
  water: { name: 'Penyiram', icon: '🚿', stamina: 2 },
  sickle:{ name: 'Sabit',    icon: '🌾', stamina: 2 },
  axe:   { name: 'Kapak',    icon: '🪓', stamina: 4 },
  hammer:{ name: 'Palu',     icon: '🔨', stamina: 4 },
  rod:   { name: 'Pancing',  icon: '🎣', stamina: 2 },
};
export const TOOL_ORDER = ['hoe', 'water', 'sickle', 'axe', 'hammer', 'rod'];

export const ITEMS = {
  turnip_seed: { name: 'Benih Lobak',   icon: '🌱', sell: 0,  buy: 20 },
  turnip:      { name: 'Lobak',         icon: '🥬', sell: 60, stamina: 8 },
  egg:         { name: 'Telur',         icon: '🥚', sell: 50, stamina: 10 },
  grass:       { name: 'Rumput',        icon: '🌿', sell: 0,  stamina: 0 },
  herb:        { name: 'Jamu',          icon: '🍵', sell: 0,  stamina: 40 },
  wood:        { name: 'Kayu',          icon: '🪵', sell: 5 },
};
