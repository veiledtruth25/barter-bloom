// Villagers (NPCs): looks, schedules, gift tastes and dialogue.
// A villager's position is a pure function of the game clock, so every client
// and the server agree on where everyone is without any network traffic.
import {
  TOWN, WILD_TREES, DAYS_PER_SEASON, DAY_END_MIN, PLOT_CENTERS, FESTIVAL_GATHER, mulberry32, festivalOf,
} from './defs.js';

export const HEART = 100;
export const MAX_FRIENDSHIP = 1000;
export const TALK_POINTS = 10;
export const GIFT_POINTS = { love: 80, like: 45, neutral: 20, dislike: -30 };
export const REQUEST_POINTS = 60;
export const MILESTONES = [3, 5, 8];
export const KNOCK_UNTIL = 22 * 60;

export const hearts = (pts) => Math.floor((pts || 0) / HEART);
export const PERK_HEARTS = 5;
// rel: a player's relationship map { villagerId: { pts, ... } }.
export const perkActive = (rel, id) => hearts(rel?.[id]?.pts) >= PERK_HEARTS;
// Shopkeepers give friends a discount on what they sell.
const SHOP_PERK = { store: ['darto', 0.9], kedai: ['ayu', 0.8], clinic: ['raka', 0.75] };
export function shopPrice(shopId, base, rel) {
  const perk = SHOP_PERK[shopId];
  return perk && perkActive(rel, perk[0]) ? Math.round(base * perk[1]) : base;
}
export const upgradeGold = (gold, rel) => (perkActive(rel, 'joko') ? Math.round(gold * 0.8) : gold);
export const dayIndexOf = (w) => (w.year - 1) * 4 * DAYS_PER_SEASON + w.season * DAYS_PER_SEASON + (w.day - 1);
export function festivalOfDay(dayIdx) {
  return festivalOf(Math.floor(dayIdx / DAYS_PER_SEASON) % 4, (dayIdx % DAYS_PER_SEASON) + 1);
}
const h = (hh, mm = 0) => hh * 60 + mm;

// ------------------------------------------------------------------ road network

const ROAD_N = -19.8, ROAD_S = 19.2;
const NODES = {
  p0: [5.2, 0], p1: [3.68, 3.68], p2: [0, 5.2], p3: [-3.68, 3.68],
  p4: [-5.2, 0], p5: [-3.68, -3.68], p6: [0, -5.2], p7: [3.68, -3.68],
  W10: [-10, -0.4], W12: [-12, -0.4], W14: [-14, -0.4], W24: [-24, -0.4], W29: [-29.4, -0.4], W40: [-40, -0.4],
  E10: [10, -0.4], E12: [12, -0.4], E17: [17.5, -0.4], EX: [31.5, -0.4], E50: [50, -0.4],
  VN10: [-0.5, -10], VN: [-0.5, ROAD_N], VS10: [-0.5, 10], VS: [-0.5, ROAD_S],
  NFG: [-24, ROAD_N], NX: [31.5, ROAD_N], SX: [31.5, ROAD_S],
};
// Farm-road nodes at each plot's house corridor (W) and shipping bin (B).
for (let i = 0; i < 4; i++) {
  const cx = PLOT_CENTERS[i][0];
  NODES[`NW${i}`] = [cx - 5, ROAD_N];
  NODES[`NB${i}`] = [cx + 12.6, ROAD_N];
  NODES[`SW${i}`] = [cx - 5, ROAD_S];
  NODES[`SB${i}`] = [cx + 12.6, ROAD_S];
}
const EDGES = [
  ['p0', 'p1'], ['p1', 'p2'], ['p2', 'p3'], ['p3', 'p4'], ['p4', 'p5'], ['p5', 'p6'], ['p6', 'p7'], ['p7', 'p0'],
  ['p4', 'W10'], ['W10', 'W12'], ['W12', 'W14'], ['W14', 'W24'], ['W24', 'W29'], ['W29', 'W40'],
  ['p0', 'E10'], ['E10', 'E12'], ['E12', 'E17'], ['E17', 'EX'], ['EX', 'E50'],
  ['p6', 'VN10'], ['VN10', 'VN'], ['p2', 'VS10'], ['VS10', 'VS'],
  // Grass paths linking the farm roads on the west and east sides of town.
  ['NB0', 'W29'], ['W29', 'SB0'], ['NX', 'EX'], ['EX', 'SX'],
];
// Each farm road is a chain of its nodes from west to east.
for (const z of [ROAD_N, ROAD_S]) {
  const ids = Object.keys(NODES).filter((k) => NODES[k][1] === z).sort((a, b) => NODES[a][0] - NODES[b][0]);
  for (let i = 1; i < ids.length; i++) EDGES.push([ids[i - 1], ids[i]]);
}

const NODE_IDS = Object.keys(NODES);
const NEXT = (() => {
  // Floyd–Warshall over the small road graph; NEXT[a][b] is the next hop.
  const n = NODE_IDS.length;
  const idx = Object.fromEntries(NODE_IDS.map((k, i) => [k, i]));
  const d = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)));
  const nx = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? j : -1)));
  for (const [a, b] of EDGES) {
    const [ax, az] = NODES[a], [bx, bz] = NODES[b];
    const w = Math.hypot(ax - bx, az - bz);
    d[idx[a]][idx[b]] = d[idx[b]][idx[a]] = w;
    nx[idx[a]][idx[b]] = idx[b];
    nx[idx[b]][idx[a]] = idx[a];
  }
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (d[i][k] + d[k][j] < d[i][j]) {
          d[i][j] = d[i][k] + d[k][j];
          nx[i][j] = nx[i][k];
        }
      }
    }
  }
  return { idx, nx };
})();

function nodePath(a, b) {
  const out = [a];
  let i = NEXT.idx[a];
  const j = NEXT.idx[b];
  while (i !== j) {
    i = NEXT.nx[i][j];
    if (i < 0) break;
    out.push(NODE_IDS[i]);
  }
  return out;
}

// ------------------------------------------------------------------------ spots

const deg = (d) => (d * Math.PI) / 180;
const [benchA, benchB, benchC, benchD] = TOWN.benches;

// The carpenter chops next to a real tree in the western woods.
const CHOP = (() => {
  let best = null;
  for (const t of WILD_TREES) {
    if (t.x < -47 || t.x > -35 || t.z < 3.5 || t.z > 9) continue;
    if (!best || Math.hypot(t.x + 41, t.z - 4.5) < Math.hypot(best.x + 41, best.z - 4.5)) best = t;
  }
  if (!best) return { pos: [-40, 3.5], path: [[-40, 1.2]] };
  const z = best.z - (0.55 * best.s + 0.75);
  return { pos: [best.x, z], path: [[best.x, 1.2]] };
})();

// pos: anchor point. node: road node it is reached from. path: extra points from node to pos.
// hidden: villager is indoors. wander: idle wandering region. pose: idle animation.
export const SPOTS = {
  storeIn: { pos: [-12, -5.7], node: 'W12', hidden: true, label: 'Toko Umum (di dalam)', house: 'store' },
  storeCounter: { pos: [-9.4, -5.3], node: 'W10', path: [[-10.9, -3.2], [-10.9, -5.3]], ry: 0, pose: 'shop', label: 'Konter Toko Umum' },
  storeSide: { pos: [-13.6, -3.0], node: 'W14', ry: Math.PI, wander: { type: 'disc', r: 0.5, every: 10 }, label: 'Depan Toko Umum' },
  marketIn: { pos: [12, -5.7], node: 'E12', hidden: true, label: 'Pasar (di dalam)', house: 'market' },
  marketStall: { pos: [9.85, -5.35], node: 'E10', ry: 0, pose: 'shop', label: 'Lapak Pasar' },
  marketStall2: { pos: [8.05, -5.35], node: 'E10', path: [[8.05, -3.6]], ry: 0.3, pose: 'idle', label: 'Lapak Pasar' },
  marketSide: { pos: [14.8, -3.0], node: 'E12', wander: { type: 'disc', r: 0.7, every: 10 }, label: 'Depan Pasar' },
  mayorIn: { pos: [-14, 7.7], node: 'W14', hidden: true, label: 'Rumah Kepala Desa', house: 'mayor' },
  hutIn: { pos: [12.5, 10.0], node: 'E12', path: [[12.3, 2.5]], hidden: true, label: 'Pondok Nelayan', house: 'hut' },
  workshopIn: { pos: [-24, -3.2], node: 'W24', hidden: true, label: 'Bengkel Kayu', house: 'workshop' },
  carpCounter: { pos: [-21.9, -3.25], node: 'W24', path: [[-23.2, -1.6], [-23.2, -3.25]], ry: 0, pose: 'shop', label: 'Bengkel Kayu' },
  depotIn: { pos: [25.5, -16.6], node: 'NB2', hidden: true, label: 'Gudang Ekspedisi', house: 'depot' },
  forgeIn: { pos: [-24, -16.6], node: 'NFG', hidden: true, label: 'Pandai Besi', house: 'forge' },
  forgeCounter: { pos: [-21.8, -16.6], node: 'NFG', path: [[-20.4, -19.0], [-20.4, -16.6]], ry: Math.PI, pose: 'shop', label: 'Pandai Besi' },
  ranchIn: { pos: [-24, 7.1], node: 'W24', hidden: true, label: 'Peternakan', house: 'ranch' },
  ranchCounter: { pos: [-21.6, 7.15], node: 'W24', path: [[-19.9, 5.6], [-19.9, 7.15]], ry: Math.PI, pose: 'shop', label: 'Peternakan' },
  ranchPen: { pos: [-24, 15.4], node: 'W29', path: [[-29.4, 15.4]], pose: 'idle', wander: { type: 'disc', r: 1.8, every: 10 }, label: 'Kandang Peternakan' },
  innIn: { pos: [-6.5, 12.15], node: 'VS10', path: [[-2.6, 10.6], [-6.5, 10.8]], hidden: true, label: 'Kedai', house: 'kedai' },
  innCounter: { pos: [-4.2, 12.2], node: 'VS10', path: [[-2.4, 10.8], [-2.4, 12.2]], ry: Math.PI, pose: 'shop', label: 'Kedai Ayu' },
  innFront: { pos: [-6.5, 10.2], node: 'VS10', path: [[-2.6, 10.4]], wander: { type: 'disc', r: 1.3, every: 10 }, label: 'Depan Kedai' },
  clinicIn: { pos: [5.8, 12.15], node: 'VS10', path: [[5.8, 10.8]], hidden: true, label: 'Klinik', house: 'clinic' },
  clinicCounter: { pos: [7.6, 12.2], node: 'VS10', path: [[9.3, 10.8], [9.3, 12.2]], ry: Math.PI, pose: 'shop', label: 'Klinik Desa' },
  benchA: { pos: [benchA[0], benchA[1]], node: 'p3', ry: benchA[2], pose: 'sit', label: 'Bangku Alun-alun' },
  benchB: { pos: [benchB[0], benchB[1]], node: 'p1', ry: benchB[2], pose: 'sit', label: 'Bangku Alun-alun' },
  benchC: { pos: [benchC[0], benchC[1]], node: 'p5', ry: benchC[2], pose: 'sit', label: 'Bangku Alun-alun' },
  benchD: { pos: [benchD[0], benchD[1]], node: 'p7', ry: benchD[2], pose: 'sit', label: 'Bangku Alun-alun' },
  plazaN: { pos: [0, -4.4], node: 'p6', wander: { type: 'sector', r0: 3.2, r1: 5.6, a0: deg(-140), a1: deg(-40), every: 9 }, label: 'Alun-alun' },
  plazaS: { pos: [0, 4.4], node: 'p2', wander: { type: 'sector', r0: 3.2, r1: 5.6, a0: deg(40), a1: deg(140), every: 9 }, label: 'Alun-alun' },
  flowersS: { pos: [0, 10.4], node: 'VS10', pose: 'water', wander: { type: 'sector', r0: 9.9, r1: 11, a0: deg(55), a1: deg(125), every: 12 }, label: 'Taman Bunga' },
  flowersN: { pos: [0, -10.4], node: 'VN10', pose: 'water', wander: { type: 'sector', r0: 9.9, r1: 11, a0: deg(-125), a1: deg(-55), every: 12 }, label: 'Taman Bunga' },
  pondPier: { pos: [19.3, 6.0], node: 'E17', path: [[17.4, 4.6]], ry: Math.PI / 2, pose: 'fish', label: 'Dermaga Kolam' },
  pondSide: { pos: [16.6, 1.9], node: 'E17', look: [TOWN.pond.x, TOWN.pond.z], wander: { type: 'disc', r: 0.8, every: 8 }, label: 'Tepi Kolam' },
  forestW: { pos: CHOP.pos, node: 'W40', path: CHOP.path, ry: 0, pose: 'chop', label: 'Hutan Barat' },
  farmN: { pos: [-0.5, -19.8], node: 'VN', ry: Math.PI, pose: 'wave', wander: { type: 'line', x0: -44, z0: -19.8, x1: 46, z1: -19.8, maxStep: 14, every: 26 }, label: 'Jalan Ladang Utara' },
  farmS: { pos: [-0.5, 19.2], node: 'VS', ry: 0, pose: 'wave', wander: { type: 'line', x0: -44, z0: 19.2, x1: 46, z1: 19.2, maxStep: 14, every: 26 }, label: 'Jalan Ladang Selatan' },
};

// Per-plot spots: the farmhouse (where a spouse lives), the yard and the shipping bin.
for (let k = 0; k < PLOT_CENTERS.length; k++) {
  const [cx, cz] = PLOT_CENTERS[k];
  const oz = cz - 3, i = k % 4, side = cz < 0 ? 'N' : 'S';
  SPOTS[`plotHome${k}`] = { pos: [cx - 4.9, oz + 2.5], node: `${side}W${i}`, hidden: true, label: 'Rumah ladang', plot: k };
  SPOTS[`plotYard${k}`] = { pos: [cx - 4.8, oz + 6.5], node: `${side}W${i}`, ry: Math.PI / 2, pose: 'water', label: 'Ladang', plot: k };
  SPOTS[`bin${k}`] = { pos: [cx + 12.6, oz + 1.5], node: `${side}B${i}`, ry: -Math.PI / 2, pose: 'idle', label: 'Kotak pengiriman ladang', bin: k };
}

// Festival gathering: a ring around the fountain plus the village head's stage.
for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
  const x = Math.cos(a) * 5.5, z = Math.sin(a) * 5.5;
  SPOTS[`fest${i}`] = { pos: [x, z], node: `p${Math.round(a / (Math.PI / 4)) % 8}`, ry: Math.atan2(-x, -z), pose: 'festival', label: 'Festival di alun-alun' };
}
SPOTS.festHost = { pos: [0, -3.2], node: 'p6', ry: 0, pose: 'festival', label: 'Panggung festival' };

export const HOUSES = {
  store: { name: 'Toko Kelontong', spot: 'storeIn', shop: 'store' },
  market: { name: 'Pasar Pemain', spot: 'marketIn', noKnock: true },
  mayor: { name: 'Rumah Kepala Desa', spot: 'mayorIn' },
  hut: { name: 'Pondok Nelayan', spot: 'hutIn' },
  workshop: { name: 'Bengkel Kayu', spot: 'workshopIn', shop: 'carpenter' },
  depot: { name: 'Gudang Ekspedisi', spot: 'depotIn' },
  forge: { name: 'Pandai Besi', spot: 'forgeIn', shop: 'forge' },
  ranch: { name: 'Peternakan Jaya', spot: 'ranchIn', shop: 'ranch' },
  kedai: { name: 'Kedai Ayu', spot: 'innIn', shop: 'kedai' },
  clinic: { name: 'Klinik Desa', spot: 'clinicIn', shop: 'clinic' },
};

// ------------------------------------------------------------------- villagers

export const VILLAGERS = {
  darto: {
    name: 'Pak Darto', role: 'Pemilik Toko Kelontong', icon: '🏪', speed: 2.6, home: 'store', color: '#3f8f5a',
    look: { skin: '#e0ac7e', hair: '#8f8f8f', hairStyle: 'short', hat: 'none', shirt: '#f4efe2', pants: '#4a4a52', apron: '#3f8f5a', mustache: '#6f6f6f', glasses: true, build: 'stout', backpack: false, overalls: false },
    birthday: { season: 0, day: 11 },
    loves: ['cabbage', 'golden_egg'], likes: ['potato', 'corn', 'pumpkin', 'egg', 'milk', 'bread'], dislikes: ['stone', 'fodder', 'shell'],
    perk: { kind: 'discount', text: 'Diskon 10% di Toko Kelontong' },
    gifts: { 3: { bread: 3 }, 8: { onigiri: 5 } },
    schedule: {
      default: [[0, 'storeIn'], [h(7, 30), 'storeCounter'], [h(18), 'benchD'], [h(20), 'storeIn']],
      rain: [[0, 'storeIn'], [h(7, 30), 'storeCounter'], [h(18), 'storeIn']],
    },
    talk: {
      intro: 'Wah, petani baru! Selamat datang di Desa Bloom. Saya Darto, pemilik Toko Kelontong. Benih musim ini, roti, sampai Bulu Biru untuk melamar — semua ada. Buka pukul 08:00 sampai 18:00, ya!',
      morning: ['Pagi, {name}! Benih segar baru datang pagi ini.', 'Sudah sarapan? Petani butuh tenaga, lho.'],
      day: ['Siang-siang begini enaknya menyiram tanaman... kalau sudah, ya istirahat sebentar.', 'Benih musim ini sudah lengkap, tinggal pilih.'],
      evening: ['Toko sudah tutup, tapi ngobrol tetap gratis, haha!', 'Hari yang panjang, ya? Duduk sebentar di sini enak.'],
      night: ['Sudah malam, {name}. Pulanglah, tidur yang cukup.'],
      rain: ['Hujan begini tanamanmu tidak perlu disiram. Hemat tenaga!'],
      snow: ['Musim dingin benih tidak laku, untung roti hangat tetap dicari.'],
      spring: ['Musim semi! Benih kentang dan stroberi paling laris.'],
      summer: ['Jagung dan tomat cocok sekali untuk musim panas.'],
      fall: ['Musim gugur waktunya labu dan ubi!'],
      winter: ['Musim dingin begini, rawat ternakmu baik-baik.'],
      h0: ['Kalau ada yang kurang di toko, bilang saja.'],
      h3: ['Kamu pelanggan setiaku, {name}!'],
      h6: ['Kamu sudah seperti keluarga sendiri bagi kami.'],
      birthday: 'Hari ini ulang tahunku! Umurku? Ah, itu rahasia dagang, haha!',
      love: ['Wah! Ini kesukaanku! Terima kasih banyak, {name}!'],
      like: ['Terima kasih, ini bagus sekali.'],
      neutral: ['Oh, terima kasih ya.'],
      dislike: ['Hmm... saya kurang suka ini, tapi terima kasih.'],
      already: 'Kamu sudah memberiku hadiah hari ini. Simpan saja untuk besok!',
      birthdayGift: 'Hadiah ulang tahun?! Kamu ingat! Terima kasih, {name}!',
      request: 'Stok di gudang menipis... Kalau kamu punya {qty} {item}, aku bayar {reward}G!',
      thanks: 'Pas sekali! Ini bayaranmu. Senang berbisnis denganmu!',
      ms: { 3: 'Ini roti dari dapur istriku. Untuk bekal di ladang!', 5: 'Mulai sekarang, kamu dapat diskon 10% di tokoku!', 8: 'Nasi kepal spesial untuk pelanggan terbaikku!' },
      ambient: ['Benih segar! Benih segar!', 'Hari ini ramai pembeli.', 'Hmm, stok pakan cukup...'],
      ctx: { hot: 'Kabarnya pedagang kota sedang mencari {hot}. Hari ini harganya 1,5 kali lipat!' },
    },
  },
  ratna: {
    name: 'Bu Ratna', role: 'Pengurus Pasar', icon: '⚖️', speed: 2.5, home: 'market', color: '#c4553b',
    look: { skin: '#c98e5c', hair: '#2a1d14', hairStyle: 'bun', hat: 'none', shirt: '#c4553b', pants: '#7a3a2a', skirt: '#7a3a2a', earrings: true, backpack: false, overalls: false },
    birthday: { season: 2, day: 9 },
    loves: ['premium_milk', 'pineapple', 'gem'], likes: ['tomato', 'strawberry', 'egg', 'grape', 'flower'], dislikes: ['fish_s', 'chestnut', 'lumber'],
    perk: { kind: 'shipBonus', text: 'Hasil kiriman dihargai +5%' },
    gifts: { 3: { chicken_feed: 10 }, 8: { gem: 1 } },
    schedule: {
      default: [[0, 'marketIn'], [h(7, 30), 'marketStall'], [h(18), 'plazaN'], [h(19, 30), 'marketIn']],
      rain: [[0, 'marketIn'], [h(7, 30), 'marketStall'], [h(18), 'marketIn']],
    },
    talk: {
      intro: 'Halo, halo! Kamu petani yang baru datang itu, kan? Aku Ratna, pengurus Pasar Pemain. Di sini kamu bisa jual-beli langsung dengan petani lain — harganya kamu yang tentukan!',
      morning: ['Pagi! Lapak-lapak sudah mulai ramai.', 'Jangan lupa cek harga kirim hari ini, Nak.'],
      day: ['Kalau mau untung, jual saat harga sedang naik!', 'Barang langka biasanya laku mahal di pasar.'],
      evening: ['Hari ini banyak transaksi bagus.', 'Lina, anakku, suka sekali bunga. Kalau lihat bunga cantik, ingat dia, ya!'],
      night: ['Sudah larut, Nak. Pasar buka lagi besok.'],
      rain: ['Hujan-hujan begini pembeli sepi...'],
      snow: ['Dingin sekali! Susu hangat pasti laku keras hari ini.'],
      spring: ['Stroberi musim semi selalu dicari pembeli.'],
      summer: ['Nanas! Kalau kamu bisa menanam nanas, kamu bakal kaya!'],
      fall: ['Labu besar selalu jadi primadona musim gugur.'],
      winter: ['Musim dingin, harga hasil ternak biasanya bagus.'],
      h0: ['Berdagang itu soal kepercayaan, Nak.'],
      h3: ['Kamu pedagang yang jujur. Aku suka itu!'],
      h6: ['Kalau semua petani sepertimu, pasar ini pasti makmur.'],
      birthday: 'Hari ini ulang tahunku! Lina sudah menyiapkan kue dari pagi.',
      love: ['Ya ampun! Ini barang bagus sekali! Kamu tahu seleraku!'],
      like: ['Terima kasih, Nak. Ini berguna sekali.'],
      neutral: ['Oh, untukku? Terima kasih.'],
      dislike: ['Aduh... ini sih tidak laku di pasar.'],
      already: 'Satu hadiah sehari sudah cukup, Nak. Terima kasih!',
      birthdayGift: 'Untuk ulang tahunku? Aduh, jadi terharu. Terima kasih, {name}!',
      request: 'Ada pembeli dari kota yang pesan {qty} {item}. Bisa kamu sediakan? Upahnya {reward}G!',
      thanks: 'Luar biasa! Pembeliku pasti puas. Ini upahmu!',
      ms: { 3: 'Ini pakan ayam sisa stok. Ambil saja!', 5: 'Aku sudah kenalkan kamu ke pedagang kota. Hasil kirimanmu dihargai 5% lebih tinggi!', 8: 'Permata ini kudapat dari pedagang jauh. Kamu pantas memilikinya.' },
      ambient: ['Ayo, ayo, lihat-lihat dulu!', 'Harga hari ini bersahabat!', 'Lina, jangan lupa siram bunganya!'],
      ctx: { hot: 'Pedagang kota sedang memburu {hot} hari ini. Kirim sekarang, Nak!', richest: 'Semua orang membicarakan {richest}, petani terkaya di desa!', richestYou: 'Kudengar kamu petani terkaya di desa! Hebat, Nak!' },
    },
  },
  harjo: {
    name: 'Kakek Harjo', role: 'Kepala Desa', icon: '🎋', speed: 1.5, home: 'mayor', color: '#3f6f5a',
    look: { skin: '#d9a066', hair: '#ececec', hairStyle: 'bald', hat: 'peci', shirt: '#3f6f5a', pants: '#5a4a3a', beard: '#f2f2f2', mustache: '#f2f2f2', cane: true, hunch: true, scale: 0.95, backpack: false, overalls: false },
    birthday: { season: 3, day: 15 },
    loves: ['herb', 'mushroom', 'sweetpotato'], likes: ['chestnut', 'onion', 'milk', 'bamboo', 'carrot'], dislikes: ['gem', 'shell'],
    perk: { kind: 'stamina', text: 'Stamina maksimal +20' },
    gifts: { 3: { herb: 3 }, 8: { gem: 2 } },
    schedule: {
      default: [[0, 'mayorIn'], [h(7), 'benchA'], [h(11), 'storeSide'], [h(13), 'benchC'], [h(17), 'plazaS'], [h(18, 30), 'mayorIn']],
      rain: [[0, 'mayorIn']],
    },
    talk: {
      intro: 'Hoho... Selamat datang di Desa Bloom, anak muda. Aku Harjo, kepala desa ini. Dulu ladang-ladang itu milik sahabat-sahabatku. Rawatlah tanahnya dengan hati, ya.',
      morning: ['Udara pagi baik untuk tulang tua ini.', 'Petani yang bangun pagi, rezekinya tidak dipatok ayam, hoho.'],
      day: ['Dulu aku juga petani. Tanganku masih ingat rasanya mencangkul.', 'Melihat anak-anak muda bekerja... senang hatiku.'],
      evening: ['Matahari terbenam di Desa Bloom paling indah, bukan?', 'Dewi pasti sudah lapar. Sebentar lagi aku pulang.'],
      night: ['Sudah malam, Cu. Orang tua ini mau istirahat.'],
      rain: ['Hujan adalah berkah bagi petani. Tanah jadi subur.'],
      snow: ['Salju... mengingatkanku pada masa muda.'],
      spring: ['Musim semi adalah awal yang baru. Tanamlah dengan harapan.'],
      summer: ['Jangan lupa minum, matahari musim panas menyengat.'],
      fall: ['Musim gugur, musim panen. Saatnya bersyukur.'],
      winter: ['Musim dingin mengajarkan kita bersabar.'],
      h0: ['Tanah yang dirawat dengan sabar akan membalas kebaikanmu.'],
      h3: ['Kamu mengingatkanku pada diriku waktu muda, Cu.'],
      h6: ['Desa ini beruntung memilikimu. Aku bangga padamu.'],
      birthday: 'Hari ini umurku bertambah lagi... Hoho, terima kasih sudah mampir.',
      love: ['Oh! Ini... persis seperti masakan almarhumah istriku dulu. Terima kasih, Cu.'],
      like: ['Hoho, kamu baik sekali.'],
      neutral: ['Terima kasih, Cu.'],
      dislike: ['Hmm... orang tua ini tidak terlalu membutuhkannya.'],
      already: 'Hoho, satu hadiah sehari sudah membuat orang tua ini senang.',
      birthdayGift: 'Kamu ingat ulang tahunku? Hatiku hangat sekali, Cu.',
      request: 'Cu, bisakah kamu bawakan {qty} {item}? Untuk persediaan balai desa. Aku beri {reward}G.',
      thanks: 'Terima kasih, Cu. Desa ini beruntung punya petani sepertimu.',
      ms: { 3: 'Ini herba obat dari kebunku. Bagus untuk badan.', 5: 'Rahasia petani tua: bekerjalah dengan ritme. Mulai hari ini staminamu bertambah 20!', 8: 'Permata ini warisan keluargaku. Aku ingin kamu yang menyimpannya.' },
      ambient: ['Hoho...', 'Indahnya hari ini.', 'Dewi! Jangan lari-lari!'],
      ctx: { animal: 'Bagaimana kabar {animal}? Hewan yang disayang akan memberi hasil terbaik.' },
    },
  },
  dewi: {
    name: 'Dewi', role: 'Cucu Kepala Desa', icon: '🎀', speed: 3.4, home: 'mayor', color: '#e8558a',
    look: { skin: '#f2c7a0', hair: '#4a2a1a', hairStyle: 'pigtails', hat: 'none', shirt: '#f6a8c8', pants: '#e8553e', skirt: '#e8553e', scale: 0.72, backpack: true, overalls: false },
    birthday: { season: 1, day: 6 },
    loves: ['strawberry', 'berry', 'golden_egg'], likes: ['flower', 'sunflower', 'shell', 'egg', 'grape'], dislikes: ['onion', 'eggplant', 'carrot'],
    perk: { kind: 'dailyGift', text: 'Kadang meninggalkan hadiah kecil di pagi hari' },
    gifts: { 3: { flower: 2 }, 8: { golden_egg: 1 } },
    schedule: {
      default: [[0, 'mayorIn'], [h(8), 'plazaS'], [h(11), 'pondSide'], [h(13), 'plazaN'], [h(16), 'farmS'], [h(17, 30), 'mayorIn']],
      rain: [[0, 'mayorIn']],
    },
    talk: {
      intro: 'Hai, Kak! Aku Dewi! Kakek bilang Kakak petani baru. Kakak punya ayam? Aku suka ayam!',
      morning: ['Pagi, Kak {name}! Ayo main kejar-kejaran!', 'Kakek masih minum teh. Aku boleh main dulu!'],
      day: ['Ikan di kolam ada yang besar sekali, lho! Pak Bayu pernah lihat!', 'Kak, kenapa tanaman harus disiram setiap hari?'],
      evening: ['Sebentar lagi aku harus pulang... nanti Kakek cari.'],
      night: ['Hoaam... Dewi ngantuk...'],
      rain: ['Hujan! Aku tidak boleh main di luar... membosankan!'],
      snow: ['Salju! Ayo bikin boneka salju, Kak!'],
      spring: ['Bunga-bunga di alun-alun cantik sekali!'],
      summer: ['Musim panas! Aku mau berenang... tapi Kakek melarang.'],
      fall: ['Daun-daun berjatuhan! Kresek, kresek!'],
      winter: ['Brrr... dingin! Tapi aku suka salju!'],
      h0: ['Kakak orangnya baik, ya?'],
      h3: ['Kak {name} teman terbaikku! Ssst, jangan bilang yang lain!'],
      h6: ['Kalau sudah besar, aku mau jadi petani hebat seperti Kak {name}!'],
      birthday: 'Hari ini aku ulang tahun! Umurku sembilan sekarang!',
      love: ['Waaah! Ini kesukaan Dewi! Makasih, Kak!!'],
      like: ['Hore! Makasih, Kak!'],
      neutral: ['Hmm... makasih, Kak.'],
      dislike: ['Iiih... Dewi tidak suka ini...'],
      already: 'Kakak sudah kasih hadiah tadi. Besok lagi, ya! Hihi.',
      birthdayGift: 'Hadiah ulang tahun! Kakak yang terbaik sedunia!',
      request: 'Kak, Dewi mau {qty} {item}... Nanti Dewi kasih tabungan Dewi, {reward}G! Janji!',
      thanks: 'Yeay! Makasih, Kak! Ini tabungan Dewi, ambil ya!',
      ms: { 3: 'Ini bunga yang Dewi petik. Buat Kakak!', 5: 'Dewi akan sering main ke ladang Kakak. Mungkin ada hadiah kejutan!', 8: 'Ini telur emas! Dewi temukan di... rahasia! Hihi.' },
      ambient: ['Hihi!', 'Kejar aku!', 'Lalala~', 'Ada kupu-kupu!'],
      ctx: { other: 'Tadi Kak {other} main ke alun-alun, lho!' },
    },
  },
  bayu: {
    name: 'Pak Bayu', role: 'Nelayan', icon: '🎣', speed: 2.5, home: 'hut', color: '#3e7ec8',
    look: { skin: '#a8703f', hair: '#2a1d14', hairStyle: 'short', hat: 'fisher', hatColor: '#c9b07a', shirt: '#3e8ee8', pants: '#3f5a4a', beard: '#2a1d14', build: 'stout', backpack: false, overalls: true },
    birthday: { season: 1, day: 22 },
    loves: ['fish_legend', 'fish_l'], likes: ['fish_m', 'fish_s', 'shell', 'onigiri', 'corn'], dislikes: ['flower', 'sunflower'],
    perk: { kind: 'fishing', text: 'Lebih mudah dapat ikan besar' },
    gifts: { 3: { fish_m: 2 }, 8: { fish_legend: 1 } },
    schedule: {
      default: [[0, 'hutIn'], [h(6), 'pondPier'], [h(11), 'marketSide'], [h(13, 30), 'pondPier'], [h(17), 'benchB'], [h(19), 'hutIn']],
      rain: [[0, 'hutIn'], [h(6), 'pondPier'], [h(18), 'hutIn']],
      storm: [[0, 'hutIn']],
    },
    talk: {
      intro: 'Yo! Petani baru, ya? Aku Bayu, nelayan desa ini. Kalau mau memancing, kolam kota tempatnya. Sabar adalah kunci, haha!',
      morning: ['Pagi-pagi ikan paling lapar. Waktunya memancing!', 'Embun pagi, kail basah, hati senang.'],
      day: ['Ssst... jangan berisik, nanti ikannya kabur.', 'Tadi hampir dapat ikan besar, tapi lepas. Ceritanya panjang...'],
      evening: ['Senja begini enaknya duduk sambil cerita.', 'Hari ini tangkapanku lumayan!'],
      night: ['Malam-malam begini waktunya istirahat. Besok memancing lagi.'],
      rain: ['Hujan? Justru ikan suka hujan! Haha!'],
      snow: ['Kolamnya membeku sebagian, tapi ikan masih ada di bawah sana.'],
      spring: ['Musim semi, ikan mulai aktif lagi.'],
      summer: ['Musim panas, ikan besar suka berenang di tengah kolam.'],
      fall: ['Musim gugur ikannya gemuk-gemuk!'],
      winter: ['Memancing di musim dingin butuh kesabaran ekstra.'],
      h0: ['Kunci memancing itu sabar dan sigap.'],
      h3: ['Kamu punya bakat memancing juga, ya!'],
      h6: ['Kalau kamu yang memancing, ikan legenda pun pasti takluk!'],
      birthday: 'Hari ini ulang tahunku! Ikan-ikan pun ikut merayakan, haha!',
      love: ['WAH! Ini luar biasa! Kamu nelayan sejati!'],
      like: ['Mantap! Terima kasih!'],
      neutral: ['Oh, makasih, ya.'],
      dislike: ['Haha... ini bukan seleraku, kawan.'],
      already: 'Haha, satu hadiah sehari cukup, kawan!',
      birthdayGift: 'Kamu ingat ulang tahunku? Mantap betul!',
      request: 'Ada yang pesan {qty} {item} ke aku, tapi tangkapanku kurang. Bisa bantu? Kubayar {reward}G!',
      thanks: 'Mantap! Kamu penyelamatku! Ini bayarannya.',
      ms: { 3: 'Ikan hasil tangkapanku hari ini. Untukmu!', 5: 'Rahasia nelayan: perhatikan riak air. Mulai sekarang peluangmu dapat ikan besar lebih tinggi!', 8: 'Ini... ikan legenda yang kutangkap bertahun-tahun lalu. Simpanlah!' },
      ambient: ['Ayo, makan umpannya...', 'Sabar... sabar...', 'Hmm, angin dari barat.'],
      ctx: { tomorrow: 'Kata angin laut, besok cuacanya {tomorrow}.' },
    },
  },
  joko: {
    name: 'Mas Joko', role: 'Tukang Kayu', icon: '🪚', speed: 2.9, home: 'workshop', color: '#7a6a2a', candidate: true,
    look: { skin: '#b07a4a', hair: '#1a120c', hairStyle: 'spiky', hat: 'bandana', hatColor: '#d9382b', shirt: '#5a6a3a', pants: '#4a3a2a', toolbelt: true, scale: 1.05, backpack: false, overalls: true },
    birthday: { season: 2, day: 25 },
    loves: ['onigiri', 'pumpkin'], likes: ['lumber', 'stone', 'bread', 'corn', 'sweetpotato', 'milk'], dislikes: ['flower', 'strawberry'],
    perk: { kind: 'upgrade', text: 'Biaya bangunan (emas) -20%' },
    gifts: { 3: { lumber: 20 }, 8: { lumber: 50, stone: 30 } },
    schedule: {
      default: [[0, 'workshopIn'], [h(6, 30), 'forestW'], [h(8, 40), 'carpCounter'], [h(16), 'forestW'], [h(17, 30), 'innFront'], [h(19), 'workshopIn']],
      rain: [[0, 'workshopIn'], [h(8, 40), 'carpCounter'], [h(16), 'workshopIn']],
    },
    talk: {
      intro: 'Hmph. Kamu petani baru? Aku Joko, tukang kayu. Mau perbesar kandang atau perluas rumah? Datang ke bengkelku, 09:00–16:00. Bawa kayu yang cukup.',
      morning: ['Pagi. Kayu hari ini bagus.', 'Kerja keras dari pagi, hasilnya pasti kelihatan.'],
      day: ['*tok tok* ...Oh, kamu. Ada apa?', 'Kayu yang bagus berasal dari pohon yang tumbuh perlahan.'],
      evening: ['Badan pegal semua... tapi puas.', 'Kayu kurang? Aku jual, tapi menebang sendiri lebih hemat.'],
      night: ['Sudah malam. Tukang kayu juga butuh tidur.'],
      rain: ['Hujan. Kayu basah susah dipotong. Hari ini aku di bengkel saja.'],
      snow: ['Musim dingin, waktunya memperbaiki atap rumah warga.'],
      spring: ['Musim semi, banyak warga minta perbaikan pagar.'],
      summer: ['Panas begini, kerja di hutan lebih sejuk.'],
      fall: ['Daun gugur menutupi tunggul. Hati-hati kalau jalan di hutan.'],
      winter: ['Kayu bakar paling dicari di musim dingin.'],
      h0: ['Kerja dulu, ngobrol nanti.'],
      h3: ['Kamu pekerja keras. Aku hormat sama kamu.'],
      h6: ['Kalau kamu butuh bantuan, bilang saja. Aku pasti datang.'],
      birthday: 'Ulang tahun? ...Iya, hari ini. Tidak usah repot-repot.',
      love: ['...! Ini enak sekali. Terima kasih. Sungguh.'],
      like: ['Hm. Terima kasih.'],
      neutral: ['Oh. Oke.'],
      dislike: ['Ini... aku tidak butuh ini.'],
      already: 'Sudah cukup. Simpan untuk besok.',
      birthdayGift: '...Kamu ingat? Hmph. ...Terima kasih.',
      request: 'Aku butuh {qty} {item} untuk proyek balai desa. Bisa? {reward}G.',
      thanks: 'Bagus. Pekerjaanmu rapi. Ini bayarannya.',
      ms: { 3: 'Sisa potongan kayu. Ambil, berguna untukmu.', 5: 'Untukmu harga teman: ongkos bangunan jadi 20% lebih murah.', 8: 'Kayu dan batu terbaik dari gudangku. Bangun kandang yang hebat.' },
      proposeYes: '...Ini... untukku? ...Hmph. Aku tidak pandai bicara. Tapi... iya. Aku mau.',
      proposeNotYet: '...Bulu biru? Kita belum sedekat itu.',
      proposeHouse: 'Rumahmu terlalu kecil untuk berdua. Perluas dulu — aku yang kerjakan.',
      spouse: ['Pagi. Pagar ladang sudah kuperbaiki.', 'Kubuatkan bekal. ...Jangan bilang siapa-siapa.', 'Hati-hati kerja. Pulang sebelum gelap.'],
      ambient: ['*tok tok tok*', 'Hmph.', 'Kayu bagus...'],
      ctx: { stumps: 'Masih ada {n} tunggul di ladangmu. Tebang saja, kayunya lumayan.' },
    },
  },
  lina: {
    name: 'Lina', role: 'Perangkai Bunga', icon: '🌸', speed: 2.6, home: 'market', color: '#e0783a', candidate: true,
    look: { skin: '#ffe0c4', hair: '#d9532b', hairStyle: 'long', hat: 'sunhat', hatColor: '#f6e2b0', shirt: '#fff6df', pants: '#9ad46a', skirt: '#9ad46a', backpack: false, overalls: false },
    birthday: { season: 0, day: 20 },
    loves: ['flower', 'sunflower'], likes: ['bamboo', 'herb', 'cucumber', 'grape', 'berry', 'egg'], dislikes: ['stone', 'lumber', 'fish_s'],
    perk: { kind: 'water', text: 'Menyiram 9 tanamanmu setiap pagi' },
    gifts: { 3: { flower: 3 }, 8: { sunflower: 3, flower: 3 } },
    schedule: {
      default: [[0, 'marketIn'], [h(7), 'flowersS'], [h(9, 30), 'flowersN'], [h(11), 'farmN'], [h(13, 30), 'farmS'], [h(15, 30), 'plazaS'], [h(18, 30), 'marketIn']],
      rain: [[0, 'marketIn'], [h(9), 'marketStall2'], [h(17), 'marketIn']],
    },
    talk: {
      intro: 'Eh... h-halo. Aku Lina, anaknya Bu Ratna. Aku suka merawat bunga di alun-alun. Senang berkenalan denganmu...',
      morning: ['Pagi... bunga-bunga juga baru bangun, sama sepertiku.', 'Embun di kelopak bunga itu cantik, ya?'],
      day: ['Aku suka jalan-jalan melihat ladang para petani. Semuanya hijau dan hidup.', 'Ladangmu... aku suka melihatnya.'],
      evening: ['Langit sore warnanya seperti bunga mawar...'],
      night: ['Bunga-bunga sudah tidur. Aku juga sebaiknya pulang...'],
      rain: ['Hujan... bunga-bunga pasti senang.'],
      snow: ['Tidak ada bunga di musim dingin... aku jadi sedikit sedih.'],
      spring: ['Musim semi adalah musim favoritku. Semua bunga bermekaran!'],
      summer: ['Bunga matahari selalu menghadap matahari... aku ingin seperti itu.'],
      fall: ['Daun merah dan kuning juga indah, seperti bunga.'],
      winter: ['Aku menunggu musim semi datang lagi...'],
      h0: ['Eh... t-terima kasih sudah mengajakku bicara.'],
      h3: ['Aku senang kalau kamu mampir, {name}.'],
      h6: ['Kamu... orang yang paling sering kupikirkan saat menyiram bunga.'],
      birthday: 'H-hari ini ulang tahunku... kamu ingat?',
      love: ['Ini... cantik sekali! Aku akan menyimpannya baik-baik. Terima kasih, {name}!'],
      like: ['Terima kasih... aku suka.'],
      neutral: ['Oh... terima kasih.'],
      dislike: ['Ah... maaf, aku kurang suka ini...'],
      already: 'Kamu sudah memberiku hadiah hari ini... terima kasih.',
      birthdayGift: 'Untuk ulang tahunku? A-aku senang sekali...',
      request: 'A-aku butuh {qty} {item}... untuk merangkai hadiah. Aku bisa bayar {reward}G...',
      thanks: 'Terima kasih banyak! Kamu baik sekali...',
      ms: { 3: 'Ini bunga dari kebun kecilku. Untukmu.', 5: 'Kalau boleh... aku akan bantu menyiram tanaman di ladangmu setiap pagi.', 8: 'Bunga-bunga terbaikku... semuanya untukmu.' },
      proposeYes: 'Bulu biru...? I-ini lamaran? ...Iya! Aku mau! Aku mau hidup bersamamu, {name}!',
      proposeNotYet: 'Bulu biru... a-aku belum siap. Kita belum cukup dekat...',
      proposeHouse: 'Aku senang sekali... tapi rumahmu masih terlalu kecil untuk kita berdua. Mungkin Mas Joko bisa memperluasnya?',
      spouse: ['Selamat pagi, sayang. Bunga di ladang kita mekar indah hari ini.', 'Aku sudah menyiapkan bekal untukmu. Jangan terlalu lelah, ya.', 'Pulang cepat, ya... aku menunggumu.'],
      ambient: ['La la la...', 'Bunga cantik...', 'Semoga tumbuh subur...'],
      ctx: { ready: 'Tanaman di ladangmu ada yang sudah siap panen, lho...', other: 'Tadi aku melihat {other} bekerja keras di ladangnya...' },
    },
  },
  danu: {
    name: 'Mas Danu', role: 'Kurir Ekspedisi', icon: '📦', speed: 4.0, home: 'depot', color: '#d9822b',
    look: { skin: '#c68a5a', hair: '#2a1d14', hairStyle: 'short', hat: 'cap', hatColor: '#d9822b', shirt: '#f2c94c', pants: '#3a4a6a', scarf: '#d9822b', backpack: true, overalls: false },
    birthday: { season: 0, day: 25 },
    loves: ['friedrice', 'corn'], likes: ['milk', 'egg', 'potato', 'tomato', 'soto', 'bread'], dislikes: ['flower', 'herb'],
    perk: { kind: 'lateShip', text: 'Kiriman yang terlambat tetap dibayar besok pagi' },
    gifts: { 3: { bread: 3 }, 8: { gem: 1 } },
    schedule: {
      // Afternoon round collecting every farm's shipping bin.
      default: [[0, 'depotIn'], [h(8), 'marketSide'], [h(11), 'depotIn'], [h(15, 30), 'bin2'], [h(15, 50), 'bin3'], [h(16, 20), 'bin1'], [h(17), 'bin0'], [h(17, 30), 'bin4'], [h(18, 5), 'bin5'], [h(18, 35), 'bin6'], [h(19, 5), 'bin7'], [h(19, 35), 'innFront'], [h(21), 'depotIn']],
    },
    talk: {
      intro: 'Halo, Bos! Danu dari Ekspedisi Bloom. Tiap sore aku keliling ladang mengambil isi kotak pengiriman, lalu besok pagi uangnya sampai. Barang yang dimasukkan setelah aku lewat, ikut kiriman besok, ya!',
      morning: ['Pagi, Bos! Hari ini kiriman banyak?', 'Gerobakku sudah kuminyaki. Siap keliling!'],
      day: ['Sore nanti aku mampir ke ladangmu, Bos.', 'Barang yang bagus, harganya juga bagus!'],
      evening: ['Fiuh, semua kotak sudah kuambil. Saatnya makan di kedai!', 'Kalau kotakmu penuh, aku ikut senang!'],
      night: ['Sudah malam, Bos. Besok sore aku datang lagi.'],
      rain: ['Hujan bukan halangan buat kurir sejati!'],
      snow: ['Jalan licin bersalju, tapi kiriman tetap jalan!'],
      spring: ['Musim semi, kiriman stroberi dan kubis mulai banyak.'],
      summer: ['Musim panas, jagung dan tomat di mana-mana!'],
      fall: ['Musim gugur, gerobakku berat sekali isinya labu!'],
      winter: ['Musim dingin, kebanyakan kiriman susu dan telur.'],
      h0: ['Isi saja kotak pengirimanmu, sisanya urusanku!'],
      h3: ['Ladangmu salah satu langgananku yang paling rajin, Bos!'],
      h6: ['Buatmu, Bos, aku rela keliling dua kali!'],
      birthday: 'Hari ini ulang tahunku, Bos! Tapi kiriman tetap jalan, haha!',
      love: ['Wah, Bos! Ini kesukaanku! Tenagaku langsung penuh!'],
      like: ['Makasih, Bos! Pas buat bekal keliling.'],
      neutral: ['Oh, buatku? Makasih, Bos.'],
      dislike: ['Hmm... ini nggak cocok buatku, Bos.'],
      already: 'Hadiahnya sudah, Bos! Besok saja lagi.',
      birthdayGift: 'Hadiah ulang tahun? Bos memang paling mantap!',
      request: 'Ada pesanan dari kota: {qty} {item}. Kalau Bos punya, kubayar {reward}G!',
      thanks: 'Mantap, Bos! Langsung kukirim ke kota. Ini bayarannya.',
      ms: { 3: 'Roti bekal kurir. Buat Bos!', 5: 'Buat Bos, aku mampir dua kali. Barang yang telat masuk kotak tetap kubawa!', 8: 'Ini permata titipan pelanggan kota. Katanya buat petani terbaik — ya Bos orangnya!' },
      ambient: ['Kiriman datang!', 'Permisi, permisi!', 'Kotak berikutnya...'],
      ctx: { other: 'Tadi aku mengambil kiriman {other}. Banyak sekali isinya!' },
    },
  },
  bejo: {
    name: 'Pak Bejo', role: 'Pandai Besi', icon: '⚒️', speed: 1.8, home: 'forge', color: '#8a4a2a',
    look: { skin: '#b07a4a', hair: '#dcdcdc', hairStyle: 'bald', hat: 'none', shirt: '#7a3a2a', pants: '#3a3a42', apron: '#5a3a22', beard: '#dcdcdc', mustache: '#dcdcdc', build: 'stout', hunch: true, backpack: false, overalls: false },
    birthday: { season: 3, day: 3 },
    loves: ['gold_ore', 'gem'], likes: ['silver_ore', 'copper_ore', 'milk', 'chestnut', 'mushroom'], dislikes: ['flower', 'strawberry', 'sunflower'],
    perk: { kind: 'quickForge', text: 'Tempa kilat: alat langsung selesai' },
    gifts: { 3: { copper_ore: 3 }, 8: { gold_ore: 3 } },
    schedule: {
      default: [[0, 'forgeIn'], [h(9, 40), 'forgeCounter'], [h(16), 'benchA'], [h(17, 30), 'forgeIn']],
      rain: [[0, 'forgeIn'], [h(9, 40), 'forgeCounter'], [h(16), 'forgeIn']],
    },
    talk: {
      intro: 'Hmph. Pandai besi Bejo. Alat yang bagus membuat petani hebat. Bawa bijih logam dan emas — kutempa alatmu jadi lebih kuat. Bijih bisa kau dapat dari batu besar di hutan. Menempa butuh semalam, sabar.',
      morning: ['Api tungku harus panas sejak pagi.', 'Hmph. Pagi.'],
      day: ['*TANG! TANG!* ...Ada perlu apa?', 'Cangkul tembaga menggarap tiga petak sekaligus. Emas, sembilan.'],
      evening: ['Tanganku pegal... tapi besi hari ini bagus.', 'Duduk sebentar di alun-alun. Orang tua butuh angin sore.'],
      night: ['Tungku sudah padam. Kembali besok.'],
      rain: ['Hujan tidak memadamkan tungkuku.'],
      snow: ['Dingin begini, enaknya berdiri di dekat tungku.'],
      spring: ['Musim semi, banyak petani minta cangkulnya ditempa.'],
      summer: ['Panas di luar, lebih panas di bengkelku. Hmph.'],
      fall: ['Musim gugur, waktunya mengasah sabit.'],
      winter: ['Musim dingin, waktunya memecah batu mencari bijih.'],
      h0: ['Jangan banyak bicara. Bawa bijih.'],
      h3: ['Alatmu kau rawat dengan baik. Aku menghargai itu.'],
      h6: ['Kau seperti cucuku sendiri, Nak.'],
      birthday: 'Ulang tahun? Hmph. Umur hanyalah angka bagi besi tua sepertiku.',
      love: ['...! Bijih sebagus ini... Kau tahu nilai logam, Nak.'],
      like: ['Hmph. Lumayan. Terima kasih.'],
      neutral: ['Hm.'],
      dislike: ['Untuk apa ini? Aku pandai besi, bukan tukang kebun.'],
      already: 'Satu sudah cukup. Hmph.',
      birthdayGift: '...Kau ingat ulang tahun orang tua ini? ...Terima kasih.',
      request: 'Aku butuh {qty} {item} untuk pesanan besar. {reward}G kalau kau bisa bawa.',
      thanks: 'Bagus. Tepat yang kubutuhkan. Ambil bayaranmu.',
      ms: { 3: 'Bijih tembaga sisa. Cukup untuk satu alat.', 5: 'Untukmu, kutempa langsung jadi. Tidak perlu menunggu semalam.', 8: 'Bijih emas terbaik simpananku. Gunakan dengan bijak.' },
      ambient: ['*TANG!*', 'Hmph.', 'Besi harus ditempa selagi panas.'],
      ctx: {},
    },
  },
  jaya: {
    name: 'Pak Jaya', role: 'Peternak', icon: '🐄', speed: 2.4, home: 'ranch', color: '#a0522d',
    look: { skin: '#c68a5a', hair: '#3a2418', hairStyle: 'short', hat: 'ranch', hatColor: '#8a5a32', shirt: '#c4553b', pants: '#3a4a6a', mustache: '#3a2418', scarf: '#f2c94c', build: 'stout', backpack: false, overalls: false },
    birthday: { season: 2, day: 4 },
    loves: ['premium_milk', 'golden_egg'], likes: ['milk', 'egg', 'carrot', 'corn', 'fodder'], dislikes: ['fish_s', 'shell'],
    perk: { kind: 'animalLove', text: 'Ternak yang diberi makan +1 kasih sayang ekstra tiap hari' },
    gifts: { 3: { fodder: 10, chicken_feed: 10 }, 8: { golden_egg: 1, premium_milk: 1 } },
    schedule: {
      default: [[0, 'ranchIn'], [h(6, 30), 'ranchPen'], [h(7, 15), 'ranchCounter'], [h(16), 'ranchPen'], [h(18), 'innFront'], [h(20), 'ranchIn']],
      rain: [[0, 'ranchIn'], [h(7, 20), 'ranchCounter'], [h(16), 'ranchIn']],
    },
    talk: {
      intro: 'Selamat datang di Peternakan Jaya, Dik! Mau beli ayam atau sapi? Pakan juga ada. Ingat: beri makan dan elus ternakmu setiap hari, nanti hasilnya makin bagus!',
      morning: ['Pagi, Dik! Sapi-sapiku sudah sarapan.', 'Ayam berkokok, peternak harus sudah bangun!'],
      day: ['Ternak yang disayang itu kelihatan dari matanya, Dik.', 'Rumput pakan bisa didapat dari memotong rumput liar, lho.'],
      evening: ['Ternak sudah masuk kandang. Waktunya makan di kedai!', 'Hari ini susunya banyak sekali.'],
      night: ['Sudah malam, Dik. Ternak juga butuh tidur.'],
      rain: ['Hujan begini ternak lebih baik di kandang.'],
      snow: ['Musim dingin, jangan lupa beri makan ternak setiap hari!'],
      spring: ['Musim semi, anak ayam lucu-lucu menetas.'],
      summer: ['Musim panas, sebentar lagi Lomba Ternak! Siapkan ternak terbaikmu.'],
      fall: ['Musim gugur, rumput pakan melimpah.'],
      winter: ['Di musim dingin, ternaklah sumber penghasilan utama.'],
      h0: ['Kalau ternakmu sakit hati, susunya juga sedikit, haha!'],
      h3: ['Ternakmu pasti bahagia punya pemilik sepertimu.'],
      h6: ['Kau peternak sejati, Dik. Aku bangga.'],
      birthday: 'Hari ini ulang tahunku! Sapi-sapiku juga ikut senang, moooo!',
      love: ['Wah! Ini hasil ternak kelas juara! Terima kasih, Dik!'],
      like: ['Terima kasih, Dik. Bagus sekali.'],
      neutral: ['Oh, terima kasih.'],
      dislike: ['Hmm... ini bukan seleraku, Dik.'],
      already: 'Sudah, sudah, satu hari satu hadiah cukup!',
      birthdayGift: 'Hadiah ulang tahun? Wah, Dik memang baik hati!',
      request: 'Dik, aku butuh {qty} {item} untuk pelanggan. Kubayar {reward}G!',
      thanks: 'Mantap! Pelangganku pasti senang. Ini bayarannya, Dik.',
      ms: { 3: 'Pakan sisa stok, buat ternakmu.', 5: 'Rahasia peternak: ajak ngobrol ternakmu. Mulai sekarang mereka lebih cepat sayang padamu!', 8: 'Hasil terbaik peternakanku. Untukmu, Dik.' },
      ambient: ['Moooo!', 'Petok petok!', 'Ayo, makan yang banyak!'],
      ctx: { animal: 'Bagaimana kabar {animal}? Jangan lupa dielus, ya!' },
    },
  },
  ayu: {
    name: 'Ayu', role: 'Juru Masak Kedai', icon: '🍲', speed: 2.8, home: 'kedai', color: '#e8743e', candidate: true,
    look: { skin: '#e0ac7e', hair: '#3a2418', hairStyle: 'ponytail', hat: 'bandana', hatColor: '#f2c94c', shirt: '#e8743e', pants: '#6a3a2a', skirt: '#6a3a2a', apron: '#fffaf0', backpack: false, overalls: false },
    birthday: { season: 1, day: 15 },
    loves: ['pineapple', 'strawberry', 'soto'], likes: ['tomato', 'onion', 'egg', 'milk', 'fish_m', 'mushroom'], dislikes: ['stone', 'fodder', 'lumber'],
    perk: { kind: 'mealDiscount', text: 'Diskon 20% di Kedai' },
    gifts: { 3: { friedrice: 2 }, 8: { soto: 3 } },
    schedule: {
      default: [[0, 'innIn'], [h(8, 30), 'storeSide'], [h(10, 20), 'innCounter'], [h(21), 'innIn']],
      rain: [[0, 'innIn'], [h(10, 40), 'innCounter'], [h(21), 'innIn']],
    },
    talk: {
      intro: 'Hai! Aku Ayu, yang masak di Kedai. Lapar setelah bertani? Mampir saja jam 11:00–21:00 — masakanku dijamin bikin semangat lagi!',
      morning: ['Pagi! Aku lagi belanja bahan untuk menu hari ini.', 'Sayur segar bikin masakan makin enak!'],
      day: ['Selamat datang! Mau pesan apa?', 'Soto ayam hari ini spesial, lho!'],
      evening: ['Malam-malam begini kedai paling ramai!', 'Semua warga suka makan di sini sepulang kerja.'],
      night: ['Kedai sudah tutup. Besok mampir lagi, ya!'],
      rain: ['Hujan-hujan begini enaknya makan yang hangat!'],
      snow: ['Dingin! Semangkuk soto pasti pas sekali.'],
      spring: ['Musim semi, stroberi segar untuk hidangan penutup!'],
      summer: ['Musim panas, nanas manis segar! Aku suka sekali.'],
      fall: ['Musim gugur, jamur hutan bikin sup makin gurih.'],
      winter: ['Musim dingin, menu andalan: soto panas!'],
      h0: ['Jangan lupa makan, ya! Petani butuh tenaga.'],
      h3: ['Kamu langganan favoritku, tahu!'],
      h6: ['Kalau kamu datang, masakanku rasanya lebih enak... eh, maksudku... ah, sudahlah!'],
      birthday: 'Hari ini ulang tahunku! Aku masak kue sendiri, haha!',
      love: ['Waaah! Ini bahan favoritku! Nanti kumasakkan sesuatu yang spesial!'],
      like: ['Makasih! Ini bisa kumasak jadi enak.'],
      neutral: ['Oh, makasih, ya.'],
      dislike: ['Eh... ini nggak bisa dimasak, tahu.'],
      already: 'Hadiahmu hari ini sudah kuterima. Besok lagi, ya!',
      birthdayGift: 'Kamu ingat ulang tahunku? Aduh, jadi malu...',
      request: 'Stok dapurku habis! Butuh {qty} {item}, kubayar {reward}G. Tolong, ya!',
      thanks: 'Selamat! Dapurku selamat! Ini bayaranmu, terima kasih!',
      ms: { 3: 'Nasi goreng spesial, gratis untukmu!', 5: 'Untuk langganan setia: diskon 20% di kedaiku!', 8: 'Soto spesial buatanku... hanya untukmu.' },
      proposeYes: 'Hah?! Bulu biru?! ...Dasar! Tentu saja aku mau! Mulai sekarang aku yang masak untukmu setiap hari!',
      proposeNotYet: 'Eh? Bulu biru? Haha, kita kan baru kenal. Ngobrol dulu yang banyak!',
      proposeHouse: 'Aku mau... tapi dapurmu mana? Minta Mas Joko perluas rumahmu dulu, ya!',
      spouse: ['Pagi! Bekalmu sudah siap, habiskan, ya!', 'Hari ini kumasak menu spesial. Pulang tepat waktu!', 'Kerja yang semangat, sayang!'],
      ambient: ['Silakan, silakan!', 'Hmm, wangi sekali...', 'Satu soto, siap!'],
      ctx: { other: 'Tadi {other} makan di kedaiku, lahap sekali!' },
    },
  },
  raka: {
    name: 'Dokter Raka', role: 'Dokter Desa', icon: '🩺', speed: 2.6, home: 'clinic', color: '#3e8ee8', candidate: true,
    look: { skin: '#f2c7a0', hair: '#1a1a2a', hairStyle: 'short', hat: 'none', shirt: '#9ad0ff', pants: '#3a3a52', coat: '#fbfbff', glasses: true, backpack: false, overalls: false },
    birthday: { season: 3, day: 9 },
    loves: ['herb', 'grape'], likes: ['milk', 'egg', 'cucumber', 'carrot', 'tea'], dislikes: ['friedrice', 'fish_s'],
    perk: { kind: 'medDiscount', text: 'Diskon 25% obat di Klinik' },
    gifts: { 3: { jamu: 2 }, 8: { elixir: 2 } },
    schedule: {
      default: [[0, 'clinicIn'], [h(7), 'pondSide'], [h(8, 15), 'clinicCounter'], [h(16), 'plazaS'], [h(17, 30), 'innFront'], [h(19), 'clinicIn']],
      rain: [[0, 'clinicIn'], [h(8, 40), 'clinicCounter'], [h(16), 'clinicIn']],
    },
    talk: {
      intro: 'Selamat datang di Klinik Desa. Saya Raka, dokter di sini. Kalau kelelahan, jangan dipaksakan. Saya punya jamu dan ramuan pemulih tenaga — dan pemeriksaan gratis, tentu saja.',
      morning: ['Selamat pagi. Sudah sarapan? Itu penting.', 'Jalan pagi di tepi kolam baik untuk jantung.'],
      day: ['Ada keluhan? Saya siap memeriksa.', 'Jangan bekerja di bawah terik matahari terlalu lama.'],
      evening: ['Pasien hari ini sudah selesai. Waktunya istirahat.', 'Makan malam yang seimbang, jangan lupa sayur.'],
      night: ['Sudah larut. Tidur yang cukup adalah obat terbaik.'],
      rain: ['Hujan begini, jaga badan tetap hangat.'],
      snow: ['Musim dingin, banyak warga masuk angin. Hati-hati.'],
      spring: ['Musim semi, herba obat bermunculan di hutan.'],
      summer: ['Musim panas, minum air yang banyak.'],
      fall: ['Musim gugur, anggur liar baik untuk kesehatan.'],
      winter: ['Musim dingin, jangan lupa makan yang hangat.'],
      h0: ['Kesehatan adalah harta yang paling berharga.'],
      h3: ['Senang melihatmu sehat, {name}.'],
      h6: ['Entah kenapa, hari terasa lebih cerah kalau kamu datang ke klinik.'],
      birthday: 'Hari ini ulang tahun saya. Terima kasih sudah mengingatnya.',
      love: ['Oh! Ini sangat berguna untuk ramuan. Terima kasih banyak, {name}.'],
      like: ['Terima kasih. Ini baik untuk kesehatan.'],
      neutral: ['Terima kasih.'],
      dislike: ['Hmm... sebagai dokter, saya tidak menyarankan ini.'],
      already: 'Satu hadiah sehari sudah lebih dari cukup. Terima kasih.',
      birthdayGift: 'Hadiah ulang tahun... Saya sangat menghargainya.',
      request: 'Saya butuh {qty} {item} untuk bahan obat. Saya bayar {reward}G.',
      thanks: 'Terima kasih. Ini akan menyembuhkan banyak warga. Ini bayaranmu.',
      ms: { 3: 'Jamu kuat buatan saya. Minum kalau kelelahan.', 5: 'Untuk pasien setia: diskon 25% semua obat di klinik.', 8: 'Ramuan ajaib langka. Simpan untuk keadaan darurat.' },
      proposeYes: 'Bulu biru... Saya tidak menyangka. Dengan senang hati — saya akan menjagamu seumur hidup.',
      proposeNotYet: 'Bulu biru? Maaf, saya rasa kita perlu lebih saling mengenal dulu.',
      proposeHouse: 'Saya mau, tapi rumahmu perlu diperluas dulu supaya sehat untuk kita berdua.',
      spouse: ['Selamat pagi. Jangan lupa sarapan dan minum air yang cukup.', 'Saya siapkan bekal bergizi untukmu hari ini.', 'Kalau lelah, istirahat. Itu resep dokter.'],
      ambient: ['Jaga kesehatan, ya.', 'Hmm, tekanan udara turun...', 'Sudah minum air hari ini?'],
      ctx: {},
    },
  },
};

export const VILLAGER_IDS = Object.keys(VILLAGERS);
export const CANDIDATES = VILLAGER_IDS.filter((id) => VILLAGERS[id].candidate);
for (const v of Object.values(VILLAGERS)) v.homeSpot = HOUSES[v.home].spot;

export function isBirthday(id, world) {
  const b = VILLAGERS[id].birthday;
  return b.season === world.season && b.day === world.day;
}

export function giftReaction(id, item) {
  const v = VILLAGERS[id];
  if (v.loves.includes(item)) return 'love';
  if (v.likes.includes(item)) return 'like';
  if (v.dislikes.includes(item)) return 'dislike';
  return 'neutral';
}

export function residents(house) {
  return VILLAGER_IDS.filter((id) => VILLAGERS[id].home === house);
}

// --------------------------------------------------------------- movement

function scheduleFor(v, weather) {
  const s = v.schedule;
  if (weather === 'storm' && s.storm) return s.storm;
  if ((weather === 'rain' || weather === 'storm') && s.rain) return s.rain;
  return s.default;
}

// Festival spot for each villager: the village head hosts, everyone else forms a ring.
const FEST_SPOT = {};
VILLAGER_IDS.filter((id) => id !== 'harjo').forEach((id, i) => { FEST_SPOT[id] = `fest${i}`; });
FEST_SPOT.harjo = 'festHost';
const FEST_POSE = { dance: 'dance', contest: 'wave', watch: 'idle', pot: 'wave', dinner: 'idle' };

// Everyone gathers at the plaza for the festival, then picks their day back up.
function withFestival(base, fest, spot) {
  const t0 = fest.start - FESTIVAL_GATHER, t1 = fest.end;
  const out = base.filter(([t]) => t < t0);
  if (!out.length) out.push(base[0]);
  out.push([t0, spot]);
  let resume = base[0][1];
  for (const [t, s] of base) if (t <= t1) resume = s;
  const rest = base.filter((e) => e[0] > t1);
  // If the next appointment is soon, head straight there instead.
  if (rest.length && rest[0][0] - t1 < 45) out.push([t1, rest.shift()[1]]);
  else out.push([t1, resume]);
  out.push(...rest);
  return out;
}

// A married villager lives at their spouse's farmhouse and spends evenings on the farm.
function withSpouseHome(base, v, plot) {
  const home = `plotHome${plot}`;
  const out = base.map(([t, s]) => [t, s === v.homeSpot ? home : s]);
  const last = out[out.length - 1];
  if (out.length > 1 && last[1] === home && last[0] + 90 < DAY_END_MIN) {
    out.splice(out.length - 1, 1, [last[0], `plotYard${plot}`], [last[0] + 90, home]);
  }
  return out;
}

const schedCache = new Map();
function scheduleOf(id, weather, dayIdx, homePlot) {
  const key = `${id}|${weather}|${dayIdx}|${homePlot ?? ''}`;
  let sched = schedCache.get(key);
  if (sched) return sched;
  const v = VILLAGERS[id];
  sched = scheduleFor(v, weather);
  if (homePlot !== null && homePlot !== undefined) sched = withSpouseHome(sched, v, homePlot);
  const fest = festivalOfDay(dayIdx);
  if (fest) sched = withFestival(sched, fest, FEST_SPOT[id]);
  if (schedCache.size > 2000) schedCache.clear();
  schedCache.set(key, sched);
  return sched;
}

const routeCache = new Map();
function route(a, b) {
  const key = `${a}>${b}`;
  let r = routeCache.get(key);
  if (r) return r;
  const A = SPOTS[a], B = SPOTS[b];
  const pts = [];
  const push = (p) => {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > 0.01) pts.push(p);
  };
  push(A.pos);
  if (a !== b) {
    for (const p of [...(A.path || [])].reverse()) push(p);
    for (const n of nodePath(A.node, B.node)) push(NODES[n]);
    for (const p of B.path || []) push(p);
    push(B.pos);
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  r = { pts, cum, len: cum[cum.length - 1] };
  routeCache.set(key, r);
  return r;
}

function along(r, d) {
  const { pts, cum } = r;
  if (pts.length === 1 || d <= 0) {
    const [x, z] = pts[0];
    const n = pts[1] || pts[0];
    return { x, z, dx: n[0] - x, dz: n[1] - z };
  }
  if (d >= r.len) {
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    return { x: b[0], z: b[1], dx: b[0] - a[0], dz: b[1] - a[1] };
  }
  let i = 1;
  while (cum[i] < d) i++;
  const a = pts[i - 1], b = pts[i];
  const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1]);
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx: b[0] - a[0], dz: b[1] - a[1] };
}

// Largest distance between two points of a wander region (bounds travel time).
function wanderSpan(spot) {
  const w = spot.wander;
  if (w.type === 'disc') return 2 * w.r;
  if (w.type === 'sector') return 2 * w.r1;
  const len = Math.hypot(w.x1 - w.x0, w.z1 - w.z0);
  return w.maxStep ? Math.min(len, w.maxStep) : len;
}

// Furthest a wander target can be from the anchor.
function wanderReach(spot) {
  const w = spot.wander;
  const [ax, az] = spot.pos;
  if (w.type === 'disc') return w.r;
  if (w.type === 'sector') {
    let m = 0;
    for (const r of [w.r0, w.r1]) for (const a of [w.a0, (w.a0 + w.a1) / 2, w.a1]) m = Math.max(m, Math.hypot(Math.cos(a) * r - ax, Math.sin(a) * r - az));
    return m;
  }
  return Math.max(Math.hypot(w.x0 - ax, w.z0 - az), Math.hypot(w.x1 - ax, w.z1 - az));
}

function wanderTarget(spot, rnd, cur) {
  const w = spot.wander;
  if (w.type === 'disc') {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * w.r;
    return [spot.pos[0] + Math.cos(a) * r, spot.pos[1] + Math.sin(a) * r];
  }
  if (w.type === 'sector') {
    const a = w.a0 + (w.a1 - w.a0) * rnd(), r = w.r0 + (w.r1 - w.r0) * rnd();
    return [Math.cos(a) * r, Math.sin(a) * r];
  }
  const lx = w.x1 - w.x0, lz = w.z1 - w.z0;
  const len = Math.hypot(lx, lz);
  let t = rnd();
  if (w.maxStep) {
    const tc = ((cur[0] - w.x0) * lx + (cur[1] - w.z0) * lz) / (len * len);
    t = Math.min(1, Math.max(0, tc + (rnd() * 2 - 1) * (w.maxStep / len)));
  }
  return [w.x0 + lx * t, w.z0 + lz * t];
}

const SEEDS = Object.fromEntries(VILLAGER_IDS.map((id, i) => [id, (i + 1) * 7919]));

function idle(spot, x, z, dx, dz) {
  let ry = 0;
  if (spot.ry !== undefined) ry = spot.ry;
  else if (spot.look) ry = Math.atan2(spot.look[0] - x, spot.look[1] - z);
  else if (dx || dz) ry = Math.atan2(dx, dz);
  return { x, z, ry, moving: false, pose: spot.pose || 'idle' };
}

/**
 * Where a villager is at a given moment.
 * minute: game minute (360–1560). rate: game minutes per real second.
 * Returns { x, z, y, ry, moving, speed, hidden, pose, spot }.
 */
export function npcState(id, minute, weather, rate, dayIdx, homePlot = null) {
  const v = VILLAGERS[id];
  const sched = scheduleOf(id, weather, dayIdx, homePlot);
  let k = 0;
  while (k + 1 < sched.length && sched[k + 1][0] <= minute) k++;
  const [start, spotKey] = sched[k];
  const prevKey = k > 0 ? sched[k - 1][1] : spotKey;
  const end = k + 1 < sched.length ? sched[k + 1][0] : DAY_END_MIN;
  const spot = SPOTS[spotKey];
  const minPerUnit = (rate || 2) / v.speed;
  const r = route(prevKey, spotKey);
  // Villagers hurry if a trip would not fit before their next appointment.
  const travel = Math.min(r.len * minPerUnit, Math.max(1, (end - start) * 0.8));
  let out;
  if (k > 0 && minute < start + travel) {
    const p = along(r, ((minute - start) / travel) * r.len);
    out = { x: p.x, z: p.z, ry: Math.atan2(p.dx, p.dz), moving: true, pose: 'walk', speed: (r.len / travel) * (rate || 2) };
  } else if (!spot.wander) {
    const p = along(r, r.len);
    out = idle(spot, spot.pos[0], spot.pos[1], p.dx, p.dz);
    out.hidden = !!spot.hidden;
  } else {
    out = wanderState(id, spot, k, k > 0 ? start + travel : start, end, minute, minPerUnit, dayIdx);
    if (out.moving) out.speed = v.speed;
  }
  if (!out.moving) out.speed = 0;
  if (out.pose === 'festival') out.pose = FEST_POSE[festivalOfDay(dayIdx)?.activity] || 'wave';
  out.hidden = !!out.hidden;
  out.y = out.hidden ? 0 : pierHeight(out.x, out.z);
  out.spot = spotKey;
  return out;
}

// The time a villager stands at a given spot today (e.g. when the courier reaches a farm's bin).
export function arrivalTime(id, spotKey, weather, rate, dayIdx, homePlot = null) {
  const v = VILLAGERS[id];
  const sched = scheduleOf(id, weather, dayIdx, homePlot);
  for (let k = 1; k < sched.length; k++) {
    if (sched[k][1] !== spotKey) continue;
    const end = k + 1 < sched.length ? sched[k + 1][0] : DAY_END_MIN;
    const len = route(sched[k - 1][1], spotKey).len;
    return sched[k][0] + Math.min(len * ((rate || 2) / v.speed), Math.max(1, (end - sched[k][0]) * 0.8));
  }
  return null;
}

function wanderState(id, spot, k, t0, tEnd, minute, minPerUnit, dayIdx) {
  const W = Math.max(spot.wander.every || 9, wanderSpan(spot) * minPerUnit + 1.5);
  const reserve = wanderReach(spot) * minPerUnit + 1;
  const rnd = mulberry32(SEEDS[id] + dayIdx * 104729 + k * 613);
  let cur = spot.pos;
  let t = t0;
  let dx = 0, dz = 0;
  while (t + W <= tEnd - reserve) {
    const tgt = wanderTarget(spot, rnd, cur);
    if (minute < t + W) return walkOrIdle(spot, cur, tgt, t, minute, minPerUnit);
    dx = tgt[0] - cur[0];
    dz = tgt[1] - cur[1];
    cur = tgt;
    t += W;
  }
  // Head back to the anchor before leaving for the next appointment.
  const back = walkOrIdle(spot, cur, spot.pos, t, minute, minPerUnit);
  if (!back.moving && Math.hypot(cur[0] - spot.pos[0], cur[1] - spot.pos[1]) < 0.01 && (dx || dz)) {
    return idle(spot, spot.pos[0], spot.pos[1], dx, dz);
  }
  return back;
}

function walkOrIdle(spot, from, to, t, minute, minPerUnit) {
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const d = Math.hypot(dx, dz);
  const walk = d * minPerUnit;
  if (minute < t + walk && d > 0.01) {
    const f = (minute - t) / walk;
    return { x: from[0] + dx * f, z: from[1] + dz * f, ry: Math.atan2(dx, dz), moving: true, pose: 'walk' };
  }
  return idle(spot, to[0], to[1], dx, dz);
}

function pierHeight(x, z) {
  const P = TOWN.pier;
  return x >= P.x0 && x <= P.x1 && z >= P.z0 && z <= P.z1 ? P.y : 0;
}

// ----------------------------------------------------------------- requests

// Items a villager may ask for in a season: things players grow, raise, catch or gather
// (never shop food, which would just be bought from Pak Darto).
export function requestable(itemId, season, ITEMS) {
  const it = ITEMS[itemId];
  if (!it) return false;
  switch (it.type) {
    case 'crop': return it.season === season;
    case 'forage': return !it.season || it.season === season;
    case 'animal': return itemId === 'egg' || itemId === 'milk';
    case 'fish': return itemId !== 'fish_legend';
    case 'material': case 'ore': return true;
    default: return false;
  }
}

// ------------------------------------------------------------------ festivals

export const FEST_HOST = {
  flower: 'Selamat datang di Festival Bunga! Ajak seseorang menari di alun-alun — persahabatan kalian akan bersemi!',
  livestock: 'Lomba Ternak dimulai! Daftarkan ternak tersayangmu padaku. Juaranya kuumumkan pukul 15:00.',
  fireworks: 'Malam ini Festival Kembang Api! Tontonlah bersama seseorang yang spesial.',
  harvest: 'Festival Panen! Masukkan bahan terbaikmu ke kuali besar — seluruh desa akan menikmatinya.',
  starry: 'Malam Bintang telah tiba. Habiskan malam ini bersama seseorang yang kamu sayangi.',
};
export const FEST_TALK = {
  flower: ['Festival Bunga! Musiknya bikin ingin menari.', 'Lihat bunga-bunga ini, cantik sekali!'],
  livestock: ['Ternak siapa yang akan juara tahun ini, ya?', 'Semua ternak hari ini bersih dan wangi!'],
  fireworks: ['Kembang apinya sebentar lagi mulai!', 'Wah, langitnya penuh warna!'],
  harvest: ['Sup dari kuali besar ini selalu jadi yang terenak!', 'Terima kasih atas panen tahun ini.'],
  starry: ['Malam Bintang... hangat sekali bersama orang tersayang.', 'Lihat, bintangnya terang sekali!'],
};
export const FEST_POINTS = 100;

// --------------------------------------------------------------- the goddess

export const GODDESS = {
  name: 'Dewi Panen', role: 'Penjaga Mata Air', icon: '✨', color: '#2fae9c',
  look: { skin: '#fff1e6', hair: '#9ff0dc', hairStyle: 'long', hat: 'crown', hatColor: '#f6a8c8', shirt: '#f4fffb', pants: '#c8f5ea', skirt: '#e6fff8', glow: '#7fe0c8', backpack: false, overalls: false, scale: 1.1 },
  loves: ['flower', 'sunflower', 'strawberry', 'pineapple', 'golden_egg'],
  dislikes: ['stone', 'lumber', 'copper_ore', 'silver_ore', 'gold_ore', 'fodder', 'chicken_feed'],
  talk: {
    love: ['Indah sekali! Persembahan ini membuat hatiku berbunga.', 'Ah... harum dan indah. Terima kasih, petani yang baik.'],
    like: ['Terima kasih, wahai petani. Aku menerimanya dengan senang hati.'],
    neutral: ['Hmm... aku menerimanya.'],
    dislike: ['...Ini bukan sesuatu yang pantas dipersembahkan, bukan?'],
    already: 'Aku sudah menerima persembahanmu hari ini. Kembalilah besok.',
    berry: 'Ketulusanmu menyentuh hatiku. Terimalah Buah Kekuatan ini — semoga tenagamu tak pernah habis.',
  },
};
export const GODDESS_POINTS = { love: 60, like: 30, neutral: 15, dislike: 0 };
export const GODDESS_BERRIES = [200, 500, 900];

export function goddessReaction(item, ITEMS) {
  if (GODDESS.loves.includes(item)) return 'love';
  if (GODDESS.dislikes.includes(item)) return 'dislike';
  return ['crop', 'forage', 'animal', 'fish'].includes(ITEMS[item]?.type) ? 'like' : 'neutral';
}

// Fill "{name}"-style placeholders.
export function fillText(text, vars) {
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
}
