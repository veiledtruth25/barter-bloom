import test from 'node:test';
import assert from 'node:assert/strict';
import { nextDate, weekday, weatherFor, formatClock, dayIndex } from '../core/calendar.js';
import {
  newGame, advanceMinutes, sleep, useStamina, fatigue, addItem, removeItem, countItem, eat, useTool,
  serialize, deserialize, STACK,
} from '../core/state.js';

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
  const g = newGame('A', 1);
  assert.equal(addItem(g, 'turnip', STACK + 3), STACK + 3);
  assert.equal(g.rucksack.filter(Boolean).length, 2);
  assert.equal(countItem(g, 'turnip'), STACK + 3);
  assert.equal(removeItem(g, 'turnip', STACK + 4), false);
  assert.equal(removeItem(g, 'turnip', 4), true);
  assert.equal(countItem(g, 'turnip'), STACK - 1);
  g.stamina = 10; assert.ok(eat(g, 'turnip')); assert.equal(g.stamina, 18);
  const full = newGame('B', 1);
  assert.equal(addItem(full, 'wood', STACK * 9 + 5), STACK * 9);
  assert.throws(() => addItem(g, 'xyz'));
});

test('ladang: cangkul, siram, hujan menyiram otomatis, stamina berkurang', () => {
  const g = newGame('A', 1);
  assert.equal(useTool(g, 'water', 1, 1).reason, 'notilled');
  assert.ok(useTool(g, 'hoe', 1, 1).ok);
  assert.equal(useTool(g, 'hoe', 1, 1).reason, 'already');
  assert.ok(useTool(g, 'water', 1, 1).ok);
  assert.equal(g.stamina, 100 - 3 - 2);
  g.forecast = 'rain'; sleep(g);
  assert.equal(g.tilled['1,1'].watered, true);
  g.forecast = 'sunny'; sleep(g);
  assert.equal(g.tilled['1,1'].watered, false);
});

test('save: serialisasi bolak-balik & tolak versi lain', () => {
  const g = newGame('A', 9); addItem(g, 'egg', 3); useTool(g, 'hoe', 2, 3);
  assert.deepEqual(deserialize(serialize(g)), g);
  assert.throws(() => deserialize('{"version":99}'));
});
