import { dayIndex } from './calendar.js';
import { ITEMS } from './items.js';

// Tingkat hati ala HM:BTN: ungu → biru → hijau → kuning → merah (0..255 poin).
export const HEART_NAMES = ['Ungu', 'Biru', 'Hijau', 'Kuning', 'Merah'];
export const HEART_AT = [0, 50, 100, 150, 200];
export const heartLevel = (pts) => HEART_AT.filter((t) => pts >= t).length - 1;

const M = (h, m = 0) => h * 60 + m;
const D = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

// Toko: jam buka & hari tutup (indeks pekan, 0 = Senin).
export const SHOPS = {
  store:  { name: 'Toko Serba Ada', owner: 'darto', open: M(9),  close: M(17), closed: [D.tue] },
  smith:  { name: 'Pandai Besi',    owner: 'bejo',  open: M(10), close: M(16), closed: [D.sat] },
  inn:    { name: 'Kedai Sari',     owner: 'ayu',   open: M(11), close: M(21), closed: [D.wed] },
  clinic: { name: 'Klinik',         owner: 'raka',  open: M(9),  close: M(16), closed: [D.sun] },
  flower: { name: 'Toko Bunga',     owner: 'lina',  open: M(10), close: M(17), closed: [D.thu] },
};

export function isShopOpen(g, shopId) {
  const s = SHOPS[shopId];
  return !s.closed.includes(dayIndex(g.date) % 7) && g.minute >= s.open && g.minute < s.close;
}

// `likes` disukai (+10), `loves` sangat disukai (+30), `hates` dibenci (-10).
export const VILLAGERS = {
  darto: { name: 'Pak Darto', role: 'Pemilik toko', shop: 'store', home: 'home_darto', skin: 0xf0c49c, hair: 0x4a3a2a, shirt: 0x4aa36b, pants: 0x3b3b4a,
    loves: ['cabbage'], likes: ['corn', 'tomato', 'potato'], hates: ['grass', 'boot'],
    lines: { low: ['Selamat datang. Jangan hanya melihat-lihat, ya.', 'Benih bagus bikin panen bagus.'], mid: ['Kamu rajin sekali, aku suka itu.', 'Dagangan lagi laris berkat petani sepertimu.'], high: ['Kalau kamu butuh apa-apa, bilang saja padaku!', 'Kamu sudah seperti keluarga di desa ini.'], rain: ['Hujan begini pembeli sepi…'] } },
  bejo:  { name: 'Pak Bejo', role: 'Pandai besi', shop: 'smith', home: 'home_bejo', skin: 0xe0a87c, hair: 0x2a2a2a, shirt: 0xa84a3a, pants: 0x4a4a55,
    loves: ['copper'], likes: ['stone', 'dish_grilled'], hates: ['flower'],
    lines: { low: ['Hmm. Ada perlu apa?', 'Bijih bagus, hasil tempaan bagus.'], mid: ['Alatmu kelihatan terawat. Bagus.', 'Palu itu bisa kutingkatkan kalau kamu bawa bijih.'], high: ['Kamu murid yang baik. Eh, maksudku pelanggan.', 'Besi seperti orang: makin ditempa makin kuat.'], rain: ['Bengkel hangat kalau hujan.'] } },
  ayu:   { name: 'Ayu', role: 'Juru masak kedai', shop: 'inn', home: 'home_darto', skin: 0xffd2b0, hair: 0x6b3f2a, shirt: 0xf2a0b8, pants: 0x6b5a8a, bachelorette: true,
    loves: ['omelet', 'dish_omelet', 'cake'], likes: ['egg', 'milk', 'onion'], hates: ['stone', 'boot'],
    lines: { low: ['Oh, halo! Mau makan sesuatu?', 'Kedai buka dari siang, mampir ya.'], mid: ['Aku lagi mencoba resep baru. Mau cicip?', 'Kamu tampak capek, makan dulu sana.'], high: ['Senang sekali bertemu kamu hari ini.', 'Aku… selalu menyisihkan porsi terbaik untukmu.'], rain: ['Hujan begini cocoknya sup hangat.'] } },
  lina:  { name: 'Lina', role: 'Penjual bunga', shop: 'flower', home: 'home_lina', skin: 0xffd9b8, hair: 0xd9b34a, shirt: 0xb48cf0, pants: 0x5a8a6b, bachelorette: true,
    loves: ['flower', 'sunflower'], likes: ['spinach', 'carrot'], hates: ['grass', 'boot'],
    lines: { low: ['Selamat datang di toko bunga~', 'Bunga itu butuh sabar, seperti tanaman.'], mid: ['Wah, kamu ingat namaku. Senangnya!', 'Mawar paling harum kalau pagi.'], high: ['Kamu selalu bikin hariku cerah.', 'Aku mau tanam bunga di ladangmu, boleh?'], rain: ['Aku suka bau tanah saat hujan.'] } },
  maya:  { name: 'Maya', role: 'Anak peternak', home: 'home_maya', skin: 0xf2c49c, hair: 0x2f2f4f, shirt: 0x5ab0d8, pants: 0x8a6b3a, bachelorette: true,
    loves: ['milk', 'cake'], likes: ['egg', 'corn', 'turnip'], hates: ['copper', 'boot'],
    lines: { low: ['Eh, kamu petani baru itu ya?', 'Sapi-sapi di rumahku lucu-lucu, lho.'], mid: ['Ayo balapan sampai alun-alun!', 'Susu segar paling enak diminum pagi hari.'], high: ['Aku senang ngobrol denganmu, serius.', 'Besok temani aku jalan ke kolam ya?'] , rain: ['Sapi-sapiku nggak suka hujan.'] } },
  raka:  { name: 'Dokter Raka', role: 'Dokter', shop: 'clinic', home: 'home_raka', skin: 0xe8b890, hair: 0x1f1f2a, shirt: 0xffffff, pants: 0x3a5a8a,
    loves: ['herb'], likes: ['spinach', 'dish_stir_fry'], hates: ['cake'],
    lines: { low: ['Jaga kesehatan, ya. Istirahat cukup.', 'Jangan paksakan diri sampai pingsan.'], mid: ['Wajahmu lebih segar dari kemarin.', 'Sayuran itu obat terbaik.'], high: ['Kamu pasien paling bandel sekaligus favoritku.', 'Kapan-kapan kuajari meramu jamu.'], rain: ['Cuaca begini bikin orang gampang flu.'] } },
  harjo: { name: 'Kakek Harjo', role: 'Kepala desa', home: 'home_harjo', skin: 0xdcb08a, hair: 0xeeeeee, shirt: 0x9a7a3a, pants: 0x4a3a2a,
    loves: ['dish_porridge'], likes: ['turnip', 'potato', 'herb'], hates: ['boot'],
    lines: { low: ['Selamat datang di desa kami, anak muda.', 'Desa ini kecil, tapi hatinya besar.'], mid: ['Festival tidak lama lagi. Jangan lupa hadir.', 'Ladang itu dulu milik sahabatku.'], high: ['Kamu membuat desa ini hidup lagi.', 'Kakek bangga padamu.'], rain: ['Hujan bagus untuk ladang, jelek untuk lututku.'] } },
  dewi:  { name: 'Dewi', role: 'Cucu kepala desa', home: 'home_harjo', skin: 0xffd2b0, hair: 0x8a3a2a, shirt: 0xffd24a, pants: 0x6a8ad8,
    loves: ['cake', 'flower'], likes: ['egg', 'meal_rice'], hates: ['boot'],
    lines: { low: ['Halo, Kak! Main yuk!', 'Aku lagi cari kodok.'], mid: ['Kakak baik deh!', 'Kemarin aku lihat ikan besar di kolam!'], high: ['Kakak teman terbaikku!', 'Nanti aku mau jadi petani seperti Kakak.'], rain: ['Hujan! Aku boleh main air nggak?'] } },
};

// Jadwal: daftar [dari, sampai, tempat, hanya-hari?]. Pertama yang cocok dipakai; selain itu 'home'.
const PLAZA_DAILY = { raka: null };
const SCHEDULE = {
  darto: [[M(17), M(20), 'inn', [D.fri, D.sat]]],
  bejo:  [[M(18), M(21), 'inn', [D.fri]]],
  ayu:   [],
  lina:  [[M(17), M(19), 'plaza', [D.sat]]],
  maya:  [[M(10), M(12), 'farm_road', [D.sun]], [M(13), M(18), 'plaza']],
  raka:  [[M(17), M(19), 'plaza', [D.wed]]],
  harjo: [[M(9), M(12), 'plaza'], [M(15), M(17), 'plaza']],
  dewi:  [[M(8), M(18), 'plaza']],
};
void PLAZA_DAILY;

export function locationOf(id, g) {
  const v = VILLAGERS[id], wd = dayIndex(g.date) % 7, t = g.minute;
  const rain = g.weather === 'rain' || g.weather === 'storm' || g.weather === 'snow';
  if (v.shop) {
    const s = SHOPS[v.shop];
    if (!s.closed.includes(wd) && t >= s.open && t < s.close) return v.shop;
    if (s.closed.includes(wd) && t >= M(10) && t < M(16) && !rain) return 'plaza';
  }
  if (t < M(6) || t >= M(21)) return v.home;
  if (rain && !v.shop) return v.home;
  for (const [from, to, place, days] of SCHEDULE[id] || []) {
    if (t >= from && t < to && (!days || days.includes(wd))) return place;
  }
  return v.home;
}

// ---- persahabatan ----------------------------------------------------------
const pts = (g, id) => g.friend[id] || 0;
const add = (g, id, n) => { g.friend[id] = Math.max(0, Math.min(255, pts(g, id) + n)); };

export function talk(g, id) {
  const v = VILLAGERS[id];
  const first = !g.talked[id];
  if (first) { g.talked[id] = true; add(g, id, 5); }
  const lvl = heartLevel(pts(g, id));
  const rain = g.weather === 'rain' || g.weather === 'storm';
  const pool = rain && v.lines.rain ? v.lines.rain : lvl >= 3 ? v.lines.high : lvl >= 1 ? v.lines.mid : v.lines.low;
  return { text: pool[(dayIndex(g.date) + id.length) % pool.length], gained: first ? 5 : 0 };
}

export function giftReaction(id, item) {
  const v = VILLAGERS[id];
  if (v.loves.includes(item)) return { delta: 30, mood: 'love' };
  if (v.likes.includes(item)) return { delta: 12, mood: 'like' };
  if (v.hates.includes(item)) return { delta: -10, mood: 'hate' };
  return { delta: 3, mood: 'ok' };
}

export function gift(g, id, item, { removeItem }) {
  if (!ITEMS[item]) return { ok: false, reason: 'unknown' };
  if (g.gifted[id]) return { ok: false, reason: 'already' };
  if (!removeItem(g, item, 1)) return { ok: false, reason: 'missing' };
  const r = giftReaction(id, item);
  g.gifted[id] = true;
  add(g, id, r.delta);
  return { ok: true, ...r };
}

export const hearts = (g, id) => heartLevel(pts(g, id));
export { pts as friendship };
