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
