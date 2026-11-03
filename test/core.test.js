import test from 'node:test';
import assert from 'node:assert/strict';
import { nextDate, weekday, weatherFor, formatClock, dayIndex } from '../core/calendar.js';
import {
  newGame, advanceMinutes, sleep, useStamina, fatigue, addItem, removeItem, countItem, eat, useTool,
  serialize, deserialize, STACK, harvest, ship, feedAnimals, collectProducts, cook, buy,
} from '../core/state.js';
import { buyAnimal, petAnimal, rollFish, inMine } from '../core/farm.js';

test('kalender: 30 hari per musim, pekan 7 hari, tahun bergulir', () => {
  assert.deepEqual(nextDate({ year: 1, season: 0, day: 30 }), { year: 1, season: 1, day: 1 });
  assert.deepEqual(nextDate({ year: 1, season: 3, day: 30 }), { year: 2, season: 0, day: 1 });
  assert.equal(weekday({ year: 1, season: 0, day: 1 }), 'Senin');
  assert.equal(weekday({ year: 1, season: 0, day: 8 }), 'Senin');
  assert.equal(dayIndex({ year: 2, season: 0, day: 1 }), 120);
  assert.equal(formatClock(6 * 60 + 5), '06:05');
});

test('cuaca deterministik, ramalan = cuaca esok, musim dingin bersalju, musim semi tanpa badai/salju', () => {
  const d = { year: 1, season: 0, day: 5 };
  assert.equal(weatherFor(d, 7), weatherFor(d, 7));
  const seen = new Set();
  for (let day = 1; day <= 30; day++) for (let y = 1; y <= 4; y++) seen.add(weatherFor({ year: y, season: 0, day }, 3));
  assert.ok(!seen.has('storm') && !seen.has('snow'));
  const winter = new Set();
  for (let day = 1; day <= 30; day++) winter.add(weatherFor({ year: 1, season: 3, day }, 3));
  assert.ok(winter.has('snow') && !winter.has('rain'));
  const g = newGame('A', 5);
  const forecast = g.forecast;
  sleep(g);
  assert.equal(g.weather, forecast);
});

test('tidur: hari berganti, stamina pulih penuh; begadang/pingsan pulih sebagian', () => {
  const g = newGame('A', 1);
  g.stamina = 5;
  sleep(g);
  assert.equal(g.date.day, 2);
  assert.equal(g.minute, 360);
  assert.equal(g.stamina, 100);
  g.minute = 24 * 60 + 10; g.stamina = 0;
  sleep(g);
  assert.equal(g.stamina, 75);
  const r = advanceMinutes(g, 26 * 60);
  assert.ok(r.passedOut);
  g.stamina = 0; sleep(g, { passedOut: true });
  assert.equal(g.stamina, 50);
  assert.equal(g.minute, 480);
});

test('stamina & kelelahan', () => {
  const g = newGame('A', 1);
  assert.equal(fatigue(g), 'fit');
  useStamina(g, 50); assert.equal(fatigue(g), 'tired');
  useStamina(g, 30); assert.equal(fatigue(g), 'exhausted');
  useStamina(g, 100); assert.equal(g.stamina, 0); assert.equal(fatigue(g), 'collapse');
  assert.equal(useStamina(g, 1), false);
});

test('rucksack: tumpukan, penuh, hapus, makan', () => {
  const g = newGame('A', 1); g.rucksack.fill(null);
  assert.equal(addItem(g, 'turnip', STACK + 3), STACK + 3);
  assert.equal(g.rucksack.filter(Boolean).length, 2);
  assert.equal(countItem(g, 'turnip'), STACK + 3);
  assert.equal(removeItem(g, 'turnip', STACK + 4), false);
  assert.equal(removeItem(g, 'turnip', 4), true);
  assert.equal(countItem(g, 'turnip'), STACK - 1);
  g.stamina = 10; assert.ok(eat(g, 'turnip')); assert.equal(g.stamina, 20);
  const full = newGame('B', 1); full.rucksack.fill(null);
  assert.equal(addItem(full, 'wood', STACK * 9 + 5), STACK * 9);
  assert.throws(() => addItem(g, 'xyz'));
});

const clear = (g) => { g.debris = {}; return g; };
const T = [0, 3]; // petak di dalam ladang

test('ladang: cangkul, siram, hujan menyiram otomatis, stamina berkurang, di luar ladang ditolak', () => {
  const g = clear(newGame('A', 1));
  assert.equal(useTool(g, 'hoe', 30, 30).reason, 'outside');
  assert.equal(useTool(g, 'water', ...T).reason, 'notilled');
  assert.ok(useTool(g, 'hoe', ...T).ok);
  assert.equal(useTool(g, 'hoe', ...T).reason, 'already');
  assert.ok(useTool(g, 'water', ...T).ok);
  assert.equal(g.stamina, 100 - 3 - 2);
  g.forecast = 'rain'; sleep(g);
  assert.equal(g.tilled['0,3'].watered, true);
  g.forecast = 'sunny'; sleep(g);
  assert.equal(g.tilled['0,3'].watered, false);
});

test('puing: tiap jenis butuh alat yang tepat dan memberi hasil', () => {
  const g = newGame('A', 1);
  g.debris = { '0,3': 'weed', '1,3': 'rock', '2,3': 'stump', '3,3': 'copper' };
  assert.equal(useTool(g, 'hoe', 0, 3).reason, 'need_sickle');
  assert.ok(useTool(g, 'sickle', 0, 3).ok); assert.equal(countItem(g, 'grass'), 1);
  assert.ok(useTool(g, 'hammer', 1, 3).ok); assert.equal(countItem(g, 'stone'), 1);
  assert.ok(useTool(g, 'axe', 2, 3).ok); assert.equal(countItem(g, 'wood'), 3);
  assert.ok(useTool(g, 'hammer', 3, 3).ok); assert.equal(countItem(g, 'copper'), 1);
  assert.deepEqual(g.debris, {});
});

test('tanaman: tumbuh hanya jika disiram, matang, panen, layu di luar musim', () => {
  const g = clear(newGame('A', 1));
  useTool(g, 'hoe', ...T);
  assert.ok(useTool(g, 'seed', ...T).planted === 'turnip');
  assert.equal(countItem(g, 'turnip_seed'), 4);
  assert.equal(useTool(g, 'seed', ...T).reason, 'occupied');
  assert.equal(harvest(g, ...T).reason, 'unripe');
  for (let d = 0; d < 6; d++) { g.forecast = 'sunny'; if (d < 4) useTool(g, 'water', ...T); sleep(g); }
  assert.ok(g.tilled['0,3'].crop.age >= 4);
  assert.equal(harvest(g, ...T).got, 'Lobak');
  assert.equal(g.tilled['0,3'].crop, undefined);
  // tanpa siram tidak tumbuh
  useTool(g, 'seed', ...T);
  g.tilled['0,3'].watered = false; g.forecast = 'sunny'; sleep(g);
  assert.equal(g.tilled['0,3'].crop.age, 0);
  // layu saat musim berganti
  g.date = { year: 1, season: 0, day: 30 }; g.forecast = 'sunny'; sleep(g);
  assert.equal(g.tilled['0,3'].crop, undefined);
});

test('benih di luar musim tidak bisa ditanam; tanaman berulang berbuah lagi', () => {
  const g = clear(newGame('A', 1));
  addItem(g, 'tomato_seed', 1); removeItem(g, 'turnip_seed', 5);
  useTool(g, 'hoe', ...T);
  assert.equal(useTool(g, 'seed', ...T).reason, 'noseed');
  g.date.season = 1; assert.equal(useTool(g, 'seed', ...T).planted, 'tomato');
  g.tilled['0,3'].crop.age = 8; g.stamina = 100;
  assert.ok(harvest(g, ...T).ok);
  assert.equal(g.tilled['0,3'].crop.age, 5); // 8 - regrow(3)
});

test('kotak pengiriman: dibayar saat tidur', () => {
  const g = newGame('A', 1); addItem(g, 'turnip', 3);
  assert.ok(ship(g, 'turnip', 3)); assert.equal(countItem(g, 'turnip'), 0);
  assert.equal(ship(g, 'turnip', 1), false);
  const before = g.gold; const r = sleep(g);
  assert.equal(r.income, 180); assert.equal(g.gold, before + 180); assert.deepEqual(g.bin, {});
});

test('ternak: beli, pakan, kasih sayang, produksi, kapasitas', () => {
  const g = newGame('A', 1); g.gold = 1600;
  assert.equal(buyAnimal(g, 'chicken'), 'ok'); assert.equal(g.gold, 100);
  assert.equal(buyAnimal(g, 'cow'), 'gold');
  assert.equal(feedAnimals(g), 0);
  addItem(g, 'grass', 2); assert.equal(feedAnimals(g), 1);
  assert.ok(petAnimal(g, 0)); assert.equal(petAnimal(g, 0), false);
  sleep(g);
  assert.equal(g.animals[0].product, 1); assert.equal(g.animals[0].love, 2);
  assert.deepEqual(collectProducts(g), { egg: 1 }); assert.equal(countItem(g, 'egg'), 1);
  sleep(g); // tidak diberi makan -> tidak berproduksi, kasih sayang turun
  assert.equal(g.animals[0].product, 0); assert.equal(g.animals[0].love, 1);
  g.gold = 99999; for (let i = 0; i < 3; i++) buyAnimal(g, 'chicken');
  assert.equal(buyAnimal(g, 'chicken'), 'full');
});

test('memancing: hasil sesuai musim; salju hanya ikan dingin', () => {
  const g = newGame('A', 3); g.date.season = 3;
  const seen = new Set(); for (let i = 0; i < 200; i++) seen.add(rollFish(g));
  assert.ok(seen.has('char')); assert.ok(!seen.has('carp') && !seen.has('eel'));
});

test('memasak & toko', () => {
  const g = newGame('A', 1);
  assert.equal(cook(g, 'omelet'), 'missing');
  addItem(g, 'egg', 1); addItem(g, 'onion', 1);
  assert.equal(cook(g, 'omelet'), 'ok'); assert.equal(countItem(g, 'dish_omelet'), 1); assert.equal(countItem(g, 'egg'), 0);
  g.stamina = 10; assert.ok(eat(g, 'dish_omelet')); assert.equal(g.stamina, 60);
  assert.equal(buy(g, 'cabbage_seed', 2), 'ok'); assert.equal(g.gold, 300 - 300);
  assert.equal(buy(g, 'cabbage_seed', 1), 'gold');
  assert.equal(buy(g, 'egg', 1), 'unsold');
});

test('tambang: batu muncul ulang tiap hari', () => {
  const g = newGame('A', 1);
  const n = () => Object.keys(g.debris).filter((k) => { const [x, z] = k.split(',').map(Number); return inMine(x, z); }).length;
  assert.ok(n() > 5);
  for (const k of Object.keys(g.debris)) { const [x, z] = k.split(',').map(Number); if (inMine(x, z)) delete g.debris[k]; }
  assert.equal(n(), 0); sleep(g); assert.ok(n() > 5);
});

test('save: serialisasi bolak-balik & tolak versi lain', () => {
  const g = newGame('A', 9); addItem(g, 'egg', 3); useTool(g, 'hoe', 2, 3);
  assert.deepEqual(deserialize(serialize(g)), g);
  assert.throws(() => deserialize('{"version":99}'));
});

// ---------------------------------------------------------------- tahap 3
import { VILLAGERS, SHOPS, isShopOpen, locationOf, talk, giftReaction, heartLevel, hearts, friendship } from '../core/villagers.js';
import { collectUpgrade, toolCost, toolLevel } from '../core/farm.js';
import { gift, orderUpgrade } from '../core/state.js';
import { ITEMS } from '../core/items.js';

const at = (g, season, day, minute, weather = 'sunny') => { g.date = { year: 1, season, day }; g.minute = minute; g.weather = weather; return g; };

test('toko: jam buka dan hari tutup', () => {
  const g = newGame('A', 1);            // Semi 1 = Senin
  at(g, 0, 1, 9 * 60); assert.ok(isShopOpen(g, 'store'));
  at(g, 0, 1, 8 * 60 + 59); assert.ok(!isShopOpen(g, 'store'));
  at(g, 0, 1, 17 * 60); assert.ok(!isShopOpen(g, 'store'));
  at(g, 0, 2, 12 * 60); assert.ok(!isShopOpen(g, 'store'), 'Selasa tutup');
  at(g, 0, 7, 12 * 60); assert.ok(!isShopOpen(g, 'clinic'), 'Minggu klinik tutup');
  at(g, 0, 1, 12 * 60); assert.ok(isShopOpen(g, 'clinic'));
});

test('jadwal warga: pemilik toko di toko saat buka, di rumah malam, hujan = di rumah', () => {
  const g = newGame('A', 1);
  at(g, 0, 1, 12 * 60); assert.equal(locationOf('darto', g), 'store');
  at(g, 0, 1, 12 * 60, 'rain'); assert.equal(locationOf('darto', g), 'store', 'pemilik toko tetap jaga toko');
  at(g, 0, 1, 12 * 60, 'rain'); assert.equal(locationOf('dewi', g), 'home_harjo');
  at(g, 0, 1, 12 * 60); assert.equal(locationOf('dewi', g), 'plaza');
  at(g, 0, 1, 23 * 60); assert.equal(locationOf('darto', g), 'home_darto');
  at(g, 0, 2, 12 * 60); assert.equal(locationOf('darto', g), 'plaza', 'hari tutup: ke alun-alun');
  at(g, 0, 5, 18 * 60); assert.equal(locationOf('darto', g), 'inn', 'Jumat malam ke kedai');
  for (const id of Object.keys(VILLAGERS)) for (const m of [6 * 60, 12 * 60, 19 * 60, 23 * 60]) assert.ok(locationOf(id, at(g, 1, 3, m)));
});

test('persahabatan: ngobrol sekali sehari, hadiah sekali sehari, selera, level hati', () => {
  const g = newGame('A', 1);
  assert.equal(talk(g, 'ayu').gained, 5); assert.equal(talk(g, 'ayu').gained, 0);
  assert.equal(friendship(g, 'ayu'), 5);
  assert.deepEqual(giftReaction('ayu', 'dish_omelet'), { delta: 30, mood: 'love' });
  assert.equal(giftReaction('ayu', 'egg').mood, 'like');
  assert.equal(giftReaction('ayu', 'stone').mood, 'hate');
  assert.equal(giftReaction('ayu', 'wood').mood, 'ok');
  addItem(g, 'egg', 2);
  assert.equal(gift(g, 'ayu', 'turnip').reason, 'missing');
  assert.ok(gift(g, 'ayu', 'egg').ok); assert.equal(gift(g, 'ayu', 'egg').reason, 'already');
  assert.equal(friendship(g, 'ayu'), 17);
  sleep(g); assert.ok(gift(g, 'ayu', 'egg').ok); assert.equal(talk(g, 'ayu').gained, 5);
  assert.equal(heartLevel(0), 0); assert.equal(heartLevel(50), 1); assert.equal(heartLevel(255), 4);
  g.friend.ayu = 255; addItem(g, 'stone', 1); sleep(g); gift(g, 'ayu', 'stone'); assert.equal(friendship(g, 'ayu'), 245);
  g.friend.ayu = 3; sleep(g); addItem(g, 'stone', 1); gift(g, 'ayu', 'stone'); assert.equal(friendship(g, 'ayu'), 0, 'tidak negatif');
  assert.equal(hearts(g, 'ayu'), 0);
});

test('dialog: tergantung hati dan cuaca; semua warga punya teks', () => {
  const g = newGame('A', 1);
  for (const id of Object.keys(VILLAGERS)) { for (const w of ['sunny', 'rain']) { g.weather = w; assert.ok(talk(g, id).text.length > 5); g.talked = {}; } }
  g.weather = 'sunny'; g.friend.lina = 160; g.talked = {};
  assert.ok(VILLAGERS.lina.lines.high.includes(talk(g, 'lina').text));
});

test('pandai besi: butuh bijih & emas, jadi setelah 2 hari, alat lebih hemat stamina', () => {
  const g = newGame('A', 1);
  assert.equal(orderUpgrade(g, 'hoe'), 'ore');
  addItem(g, 'copper', 3); g.gold = 100; assert.equal(orderUpgrade(g, 'hoe'), 'gold');
  g.gold = 600; assert.equal(orderUpgrade(g, 'rod'), 'unsupported');
  assert.equal(orderUpgrade(g, 'hoe'), 'ok'); assert.equal(g.gold, 100); assert.equal(countItem(g, 'copper'), 0);
  assert.equal(orderUpgrade(g, 'axe'), 'busy');
  assert.equal(collectUpgrade(g), 'wait'); sleep(g); assert.equal(collectUpgrade(g), 'wait'); sleep(g);
  assert.equal(collectUpgrade(g), 'hoe'); assert.equal(toolLevel(g, 'hoe'), 1);
  assert.equal(toolCost(g, 'hoe'), 2); assert.equal(toolCost(g, 'axe'), 4);
  addItem(g, 'copper', 3); g.gold = 999; assert.equal(orderUpgrade(g, 'hoe'), 'max');
  clear(g); g.stamina = 100; useTool(g, 'hoe', 0, 3); assert.equal(g.stamina, 98);
});

test('toko menjual barang berharga; semua barang beli punya harga', () => {
  assert.ok(Object.keys(SHOPS).length === 6);
  for (const [id, it] of Object.entries(ITEMS)) assert.ok(it.name && it.icon, id);
  const g = newGame('A', 1);
  assert.equal(buy(g, 'meal_soup', 1), 'ok'); assert.equal(g.gold, 150);
});

// ---------------------------------------------------------------- tahap 4
import { startEvent, advanceEvent, festivalActive, eligibleHeartEvent } from '../core/state.js';
import { FESTIVAL_DAYS, festivalOn } from '../core/calendar.js';
import { festivalIds, HEART_EVENT_IDS } from '../core/events.js';

// Jalankan event sampai selesai dengan jawaban dari `answers(node)`; kembalikan semua node.
function play(run, answers = () => 0) {
  const nodes = []; let node = advanceEvent(run);
  for (let i = 0; i < 60 && node.type !== 'end'; i++) { nodes.push(node); node = advanceEvent(run, answers(node)); }
  nodes.push(node); return nodes;
}

test('kalender festival: 7 festival, selalu cerah, toko tutup, warga ke alun-alun', () => {
  assert.equal(Object.keys(FESTIVAL_DAYS).length, 7);
  assert.deepEqual(festivalIds().sort(), Object.keys(FESTIVAL_DAYS).sort());
  for (const [id, f] of Object.entries(FESTIVAL_DAYS)) {
    for (let seed = 1; seed < 6; seed++) assert.equal(weatherFor({ year: 1, season: f.season, day: f.day }, seed), 'sunny', id);
    const g = newGame('A', 1); at(g, f.season, f.day, f.from + 5);
    assert.equal(festivalOn(g.date), id);
    for (const s of Object.keys(SHOPS)) assert.ok(!isShopOpen(g, s));
    for (const v of Object.keys(VILLAGERS)) assert.equal(locationOf(v, g), 'plaza');
    assert.equal(festivalActive(g), id);
    at(g, f.season, f.day, f.from - 60); assert.equal(festivalActive(g), null, 'belum mulai');
    at(g, f.season, f.day, f.to); assert.equal(festivalActive(g), null, 'sudah usai');
  }
  const g = at(newGame('A', 1), 0, 9, 12 * 60); assert.equal(festivalActive(g), null);
});

test('festival bunga: menari menambah hati, sekali setahun, waktu lompat ke akhir acara', () => {
  const g = at(newGame('A', 1), 0, 8, 9 * 60 + 10);
  const nodes = play(startEvent(g, 'festival', 'flower'), (n) => (n.type === 'person' ? 'ayu' : 0));
  assert.equal(nodes.at(-1).type, 'end'); assert.equal(friendship(g, 'ayu'), 20);
  assert.equal(g.minute, 17 * 60);
  assert.equal(startEvent(g, 'festival', 'flower'), null);
  assert.equal(festivalActive(g), null);
  const g2 = at(g, 0, 8, 10 * 60); g2.date.year = 2; assert.equal(festivalActive(g2), 'flower', 'tahun depan lagi');
});

test('kontes memasak: tanpa masakan jadi penonton; dengan masakan dapat hadiah; masakan terpakai', () => {
  let g = at(newGame('A', 1), 0, 17, 10 * 60); g.gold = 0;
  assert.match(play(startEvent(g, 'festival', 'cooking')).at(-1).text, /penonton/);
  g = at(newGame('A', 1), 0, 17, 10 * 60); g.gold = 0; addItem(g, 'dish_porridge', 1);
  const nodes = play(startEvent(g, 'festival', 'cooking'), (n) => (n.type === 'item' ? n.items[0] : 0));
  assert.equal(countItem(g, 'dish_porridge'), 0); assert.ok(g.gold >= 150);
  assert.match(nodes.at(-1).text, /Peringkat \d/);
});

test('lomba ternak: hewan disayang menang, hewan baru dapat hiburan, tanpa hewan tidak ikut', () => {
  let g = at(newGame('A', 1), 1, 20, 10 * 60); g.gold = 0;
  assert.match(play(startEvent(g, 'festival', 'livestock')).at(-1).text, /tidak punya/);
  g = at(newGame('A', 1), 1, 20, 10 * 60); g.gold = 0; g.animals.push({ type: 'cow', fed: true, petted: false, love: 9, product: 0 });
  play(startEvent(g, 'festival', 'livestock'), () => 0); assert.equal(g.gold, 2000);
  g = at(newGame('A', 1), 1, 20, 10 * 60); g.gold = 0; g.animals.push({ type: 'cow', fed: false, petted: false, love: 1, product: 0 });
  play(startEvent(g, 'festival', 'livestock'), () => 0); assert.equal(g.gold, 300);
});

test('festival panen: nilai bahan menentukan hadiah, semua warga dapat poin', () => {
  const g = at(newGame('A', 1), 2, 13, 10 * 60); g.gold = 0; addItem(g, 'cabbage', 2); addItem(g, 'carrot', 1);
  const nodes = play(startEvent(g, 'festival', 'harvest'), (n) => (n.type === 'item' ? n.items[0] : 0));
  assert.equal(g.gold, 1500); assert.equal(friendship(g, 'dewi'), 3);
  assert.equal(countItem(g, 'cabbage') + countItem(g, 'carrot'), 0);
  assert.equal(nodes.filter((n) => n.type === 'item').length, 3);
  const h = at(newGame('A', 1), 2, 13, 10 * 60); h.gold = 0;
  play(startEvent(h, 'festival', 'harvest')); assert.equal(h.gold, 300);
});

test('kembang api, malam bintang, tahun baru', () => {
  let g = at(newGame('A', 1), 1, 24, 18 * 60);
  play(startEvent(g, 'festival', 'fireworks'), (n) => (n.type === 'person' ? 'lina' : 0)); assert.equal(friendship(g, 'lina'), 20);
  g = at(newGame('A', 1), 3, 24, 19 * 60);
  play(startEvent(g, 'festival', 'stars'), (n) => (n.type === 'person' ? 'dewi' : 0)); assert.equal(friendship(g, 'dewi'), 15);
  g = at(newGame('A', 1), 3, 30, 21 * 60); g.gold = 0; play(startEvent(g, 'festival', 'newyear')); assert.equal(g.gold, 100);
});

test('heart event: syarat hati, tempat, jam, hari; sekali saja; pilihan memengaruhi poin', () => {
  const g = at(newGame('A', 1), 0, 1, 12 * 60);             // Senin 12:00, kedai buka, Ayu di kedai? (tutup Rabu)
  assert.equal(eligibleHeartEvent(g, 'inn'), null, 'hati belum cukup');
  g.friend.ayu = 60;
  assert.equal(locationOf('ayu', g), 'inn');
  assert.equal(eligibleHeartEvent(g, 'inn'), 'ayu_1');
  assert.equal(eligibleHeartEvent(g, 'plaza'), null, 'tempat salah');
  at(g, 0, 1, 8 * 60); assert.equal(eligibleHeartEvent(g, 'inn'), null, 'jam salah');
  at(g, 0, 3, 12 * 60); assert.equal(eligibleHeartEvent(g, 'inn'), null, 'kedai tutup hari Rabu');
  at(g, 0, 8, 12 * 60); assert.equal(eligibleHeartEvent(g, 'inn'), null, 'hari festival');
  at(g, 0, 1, 12 * 60);
  play(startEvent(g, 'heart', 'ayu_1'), (n) => (n.type === 'choice' ? 1 : 0));   // jujur: +12
  assert.equal(friendship(g, 'ayu'), 72);
  assert.equal(eligibleHeartEvent(g, 'inn'), null, 'tidak terulang');
  assert.equal(startEvent(g, 'heart', 'ayu_1'), null);
  g.friend.ayu = 120; assert.equal(eligibleHeartEvent(g, 'inn'), 'ayu_2');
});

test('heart event: setiap event bisa dimainkan dengan semua pilihan sampai selesai', () => {
  assert.ok(HEART_EVENT_IDS.length >= 8);
  for (const id of HEART_EVENT_IDS) for (const choice of [0, 1, 2]) {
    const g = newGame('A', 1); g.friend = Object.fromEntries(Object.keys(VILLAGERS).map((v) => [v, 100]));
    const nodes = play(startEvent(g, 'heart', id), (n) => (n.type === 'choice' ? choice : 0));
    assert.equal(nodes.at(-1).type, 'end', id); assert.ok(nodes.at(-1).text.length > 3, id);
    for (const v of Object.keys(VILLAGERS)) assert.ok(friendship(g, v) >= 0 && friendship(g, v) <= 255);
  }
  const g = newGame('A', 1); play(startEvent(g, 'heart', 'bejo_1'), (n) => (n.type === 'choice' ? 0 : 0)); assert.equal(countItem(g, 'copper'), 1);
  const h = newGame('A', 1); play(startEvent(h, 'heart', 'harjo_1')); assert.equal(countItem(h, 'herb'), 2);
});

test('save menyimpan event yang sudah selesai', () => {
  const g = at(newGame('A', 1), 0, 8, 10 * 60); play(startEvent(g, 'festival', 'flower'), (n) => (n.type === 'person' ? 'ayu' : 0));
  const h = deserialize(serialize(g)); assert.equal(startEvent(h, 'festival', 'flower'), null);
});

// ---------------------------------------------------------------- tahap 5
import { orderHouse, propose, nextQueued, computeEnding, weddingDue, petDog, childStage, daysMarried, eligibleFamilyEvent } from '../core/state.js';
import { PLACE_IDS } from '../core/villagers.js';
import { familyEventIds } from '../core/events.js';

const sleepDays = (g, n) => { for (let i = 0; i < n; i++) { g.forecast = 'sunny'; sleep(g); } };
const married = (g, id = 'ayu') => { g.house = 2; g.friend[id] = 255; g.spouse = { id, wedding: 0, married: true, since: dayIndex(g.date) }; return g; };

test('5 calon pasangan, tukang kayu & semua tempat jadwal dikenal; lokasi selalu valid', () => {
  assert.equal(Object.values(VILLAGERS).filter((v) => v.bachelorette).length, 5);
  assert.ok(VILLAGERS.joko.shop === 'carpenter' && SHOPS.carpenter.owner === 'joko');
  const g = newGame('A', 1);
  for (const id of Object.keys(VILLAGERS)) for (let d = 1; d <= 7; d++) for (const w of ['sunny', 'rain']) for (let m = 6 * 60; m < 24 * 60; m += 90) {
    at(g, 1, d, m, w); assert.ok(PLACE_IDS.includes(locationOf(id, g)), `${id} ${d} ${m} ${w}: ${locationOf(id, g)}`);
  }
  for (const v of Object.values(VILLAGERS)) assert.ok(PLACE_IDS.includes(v.home));
});

test('tukang kayu: perluasan rumah butuh uang & bahan, jadi setelah beberapa hari, urut level', () => {
  const g = newGame('A', 1);
  assert.equal(orderHouse(g), 'gold');
  g.gold = 9000; assert.equal(orderHouse(g), 'material');
  g.rucksack.fill(null);
  for (let i = 0; i < 5; i++) addItem(g, 'wood', 9); addItem(g, 'stone', 20);
  assert.equal(orderHouse(g), 'ok'); assert.equal(g.gold, 6000); assert.equal(orderHouse(g), 'busy');
  sleepDays(g, 2); assert.equal(g.house, 0); sleepDays(g, 1); assert.equal(g.house, 1);
  assert.ok(g.queue.some((q) => q.id === 'house'));
  assert.equal(orderHouse(g), 'material', 'uang cukup (6000), bahan level 2 belum');
  g.gold = 100; assert.equal(orderHouse(g), 'gold');
});

test('lamaran: syarat bulu biru, hati merah, rumah, bukan calon pasangan, belum bertunangan', () => {
  const g = newGame('A', 1);
  assert.equal(propose(g, 'dewi'), 'notbachelorette');
  assert.equal(propose(g, 'ayu'), 'hearts');
  g.friend.ayu = 255; assert.equal(propose(g, 'ayu'), 'house');
  g.house = 1; assert.equal(propose(g, 'ayu'), 'feather');
  addItem(g, 'blue_feather', 1); assert.equal(propose(g, 'ayu'), 'ok');
  assert.equal(countItem(g, 'blue_feather'), 0);
  assert.equal(g.spouse.id, 'ayu'); assert.equal(g.spouse.married, false);
  addItem(g, 'blue_feather', 1); g.friend.lina = 255; assert.equal(propose(g, 'lina'), 'taken');
});

test('pernikahan: pernikahan 3 hari kemudian di alun-alun, lalu pasangan pindah ke ladang & toko tutup', () => {
  const g = newGame('A', 1); g.friend.ayu = 255; g.house = 1; addItem(g, 'blue_feather', 1); propose(g, 'ayu');
  assert.ok(!weddingDue(g)); at(g, 0, 3, 12 * 60); assert.equal(eligibleFamilyEvent(g, 'plaza'), null);
  g.date.day = 4; g.minute = 12 * 60; g.weather = 'sunny';                       // Semi 4 = Kamis (3 hari kemudian dari Semi 1)
  assert.ok(weddingDue(g)); assert.equal(eligibleFamilyEvent(g, 'plaza'), 'wedding'); assert.equal(eligibleFamilyEvent(g, 'inn'), null);
  assert.equal(locationOf('ayu', g), 'inn', 'sebelum menikah tetap bekerja');
  const nodes = play(startEvent(g, 'family', 'wedding'));
  assert.ok(g.spouse.married); assert.ok(nodes.at(-1).text.includes('Ayu'));
  at(g, 0, 5, 12 * 60); assert.equal(locationOf('ayu', g), 'farm_yard');
  at(g, 0, 5, 12 * 60, 'rain'); assert.equal(locationOf('ayu', g), 'home_farm');
  at(g, 0, 5, 20 * 60); assert.equal(locationOf('ayu', g), 'home_farm');
  at(g, 0, 5, 12 * 60); assert.ok(!isShopOpen(g, 'inn'), 'kedai tutup karena pemiliknya menikah denganmu');
  assert.equal(startEvent(g, 'family', 'wedding'), null);
});

test('pasangan: menyiram tanaman & meninggalkan bekal tiap pagi', () => {
  const g = married(newGame('A', 1)); clear(g);
  for (const x of [0, 1, 2]) { useTool(g, 'hoe', x, 3); useTool(g, 'seed', x, 3); }
  g.forecast = 'sunny'; const r = sleep(g);
  assert.equal(r.family.chores, 3); assert.ok(Object.values(g.tilled).every((t) => t.watered));
  assert.equal(countItem(g, 'meal_rice'), 1); assert.equal(g.stats.spouseDays, 1);
  assert.equal(g.stats.spouseDays, 1);
});

test('anak: hamil setelah syarat, lahir 10 hari kemudian, tumbuh bertahap', () => {
  const g = married(newGame('A', 1)); g.house = 1;
  sleepDays(g, 20); assert.equal(g.expecting, null, 'butuh kamar bayi');
  g.house = 2; g.flags.dogOffered = true;
  sleepDays(g, 1); assert.ok(g.expecting);
  sleepDays(g, 11);
  const q = g.queue.find((x) => x.id === 'birth'); assert.ok(q, 'kelahiran masuk antrean');
  play(startEvent(g, 'family', 'birth'), (n) => (n.type === 'choice' ? 1 : 0));
  assert.equal(g.child.name, 'Laras'); assert.equal(childStage(g), 'baby');
  sleepDays(g, 20); assert.equal(childStage(g), 'toddler'); sleepDays(g, 40); assert.equal(childStage(g), 'kid');
  assert.ok(daysMarried(g) > 60);
  const before = g.queue.length; sleepDays(g, 30); assert.ok(!g.queue.slice(before).some((x) => x.id === 'birth'), 'hanya satu anak');
});

test('anjing: ditawarkan sekali lewat antrean, diberi nama, bisa dielus sekali sehari', () => {
  const g = newGame('A', 1);
  assert.equal(nextQueued(g), null);
  sleep(g); const q = nextQueued(g); assert.deepEqual(q, { kind: 'family', id: 'dog' });
  play(startEvent(g, 'family', 'dog'), (n) => (n.type === 'choice' ? 2 : 0));
  assert.equal(g.dog.name, 'Kiko');
  assert.ok(petDog(g)); assert.ok(!petDog(g)); assert.equal(g.dog.love, 1);
  sleep(g); assert.ok(petDog(g)); assert.equal(g.queue.some((x) => x.id === 'dog'), false, 'tidak ditawarkan lagi');
});

test('ending: antrean di awal tahun ke-3, rapor berskor 0-100, rank naik seiring capaian', () => {
  const g = newGame('A', 1); g.flags.dogOffered = true;
  const low = computeEnding(g); assert.ok(low.score < 25 && low.rank === 'Petani Pemula');
  g.date = { year: 1, season: 3, day: 30 }; g.forecast = 'sunny'; sleep(g);
  assert.ok(!g.queue.some((q) => q.id === 'ending'), 'belum tahun ke-3');
  g.date = { year: 2, season: 3, day: 30 }; sleep(g);
  assert.equal(g.date.year, 3); assert.equal(g.date.season, 0);
  assert.ok(g.queue.some((q) => q.id === 'ending'));
  const nodes = play(startEvent(g, 'family', 'ending'));
  assert.ok(nodes.length >= 9); assert.match(nodes.at(-2).text, /Nilai akhirmu \d+\/100/);
  married(g); g.child = { name: 'X', born: 0 }; g.dog = { name: 'P', love: 3 }; g.gold = 20000; g.stats.shippedGold = 20000; g.stats.harvests = 100;
  g.toolLevel = { hoe: 1, water: 1, sickle: 1, axe: 1, hammer: 1 };
  for (const id of Object.keys(VILLAGERS)) g.friend[id] = 255;
  g.animals = Array.from({ length: 5 }, () => ({ type: 'cow', love: 10 }));
  const high = computeEnding(g); assert.ok(high.score >= 85 && high.rank === 'Legenda Desa', JSON.stringify(high));
  assert.ok(high.score <= 100);
});

test('semua event keluarga & heart event baru bisa dimainkan; save v5 bolak-balik', () => {
  assert.deepEqual(familyEventIds().sort(), ['birth', 'dog', 'ending', 'house', 'wedding']);
  const g = married(newGame('A', 1));
  for (const id of ['wedding', 'dog', 'birth', 'house', 'ending']) { g.spouse.married = id !== 'wedding' ? true : false; g.spouse.wedding = 0; const n = play(startEvent(g, 'family', id)); assert.equal(n.at(-1).type, 'end', id); }
  for (const id of ['sari_1', 'nina_1']) assert.equal(play(startEvent(newGame('A', 1), 'heart', id)).at(-1).type, 'end');
  const h = newGame('A', 2); h.spouse = { id: 'lina', wedding: 5, married: false, since: null };
  assert.deepEqual(deserialize(serialize(h)), h);
});
