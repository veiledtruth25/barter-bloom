import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, GameError } from '../server/game.js';
import { TOWN, ITEMS, plotLayout, FIELD_W } from '../shared/defs.js';
import { VILLAGERS, VILLAGER_IDS, npcState, dayIndexOf, hearts, GIFT_POINTS, TALK_POINTS } from '../shared/villagers.js';

function setup() {
  const game = new Game({ rng: () => 0.5 });
  const p = game.join({ name: 'Tani' });
  game.setOnline(p, true);
  return { game, p };
}

// Put the player right next to a villager at the current game time.
function meet(game, p, id) {
  const s = game.npcAt(id);
  p.x = s.x + 0.5;
  p.z = s.z;
  p.npcChat = null;
  return s;
}

test('villagers follow their daily schedule', () => {
  const darto = npcState('darto', 12 * 60, 'sunny', 2, 0);
  assert.equal(darto.spot, 'storeCounter');
  assert.equal(darto.hidden, false);
  assert.ok(Math.hypot(darto.x - TOWN.counter.x, darto.z - TOWN.counter.z) < 1.5);
  assert.equal(npcState('darto', 6 * 60, 'sunny', 2, 0).hidden, true);
  assert.equal(npcState('bayu', 9 * 60, 'sunny', 2, 0).pose, 'fish');
  // Rainy days keep the village elder indoors.
  assert.equal(npcState('harjo', 12 * 60, 'rain', 2, 0).hidden, true);
});

test('villagers never teleport (10- and 5-minute days)', () => {
  for (const rate of [2, 4]) {
    for (const weather of ['sunny', 'rain', 'storm']) {
      for (const id of VILLAGER_IDS) {
        let prev = null;
        for (let m = 360; m <= 1560; m += 0.1) {
          const s = npcState(id, m, weather, rate, 3);
          if (prev) {
            const jump = Math.hypot(s.x - prev.x, s.z - prev.z);
            // Max speed (with hurrying) stays well below 20 units per real second.
            assert.ok(jump <= (20 * 0.1) / rate + 1e-6, `${id} jumped ${jump.toFixed(2)} at ${m} (${weather}, rate ${rate})`);
          }
          prev = s;
        }
      }
    }
  }
});

test('talking raises friendship once per day', () => {
  const { game, p } = setup();
  game.world.minute = 12 * 60;
  meet(game, p, 'darto');
  const first = game.npcTalk(p, { npc: 'darto' });
  assert.equal(first.text, VILLAGERS.darto.talk.intro);
  assert.equal(first.pts, TALK_POINTS);
  const again = game.npcTalk(p, { npc: 'darto' });
  assert.equal(again.pts, TALK_POINTS);
  game.endDay();
  game.world.minute = 12 * 60;
  meet(game, p, 'darto');
  assert.equal(game.npcTalk(p, { npc: 'darto' }).pts, TALK_POINTS * 2);
});

test('villagers must be nearby to talk', () => {
  const { game, p } = setup();
  game.world.minute = 12 * 60;
  const s = game.npcAt('darto');
  p.x = s.x + 20; p.z = s.z;
  assert.throws(() => game.npcTalk(p, { npc: 'darto' }), /terlalu jauh/);
});

test('gifts follow tastes, once per day, triple on birthdays', () => {
  const { game, p } = setup();
  game.world.minute = 12 * 60;
  meet(game, p, 'darto');
  p.inv.cabbage = 3;
  const r = game.npcGift(p, { npc: 'darto', item: 'cabbage' });
  assert.equal(r.reaction, 'love');
  assert.equal(r.pts, GIFT_POINTS.love);
  assert.equal(p.inv.cabbage, 2);
  assert.equal(p.rel.darto.known.cabbage, 'love');
  const again = game.npcGift(p, { npc: 'darto', item: 'cabbage' });
  assert.equal(again.reaction, 'already');
  assert.equal(p.inv.cabbage, 2);

  // Dewi's birthday: summer day 6.
  game.world.season = 1; game.world.day = 6; game.world.minute = 9 * 60;
  meet(game, p, 'dewi');
  p.inv.strawberry = 1;
  const b = game.npcGift(p, { npc: 'dewi', item: 'strawberry' });
  assert.equal(b.birthday, true);
  assert.equal(b.pts, GIFT_POINTS.love * 3);

  meet(game, p, 'darto');
  p.inv.stone = 1;
  game.relOf(p, 'darto').gifted = -1;
  const d = game.npcGift(p, { npc: 'darto', item: 'stone' });
  assert.equal(d.reaction, 'dislike');
  assert.equal(d.pts, GIFT_POINTS.love + GIFT_POINTS.dislike);
});

test('friendship milestones give gifts and unlock perks', () => {
  const { game, p } = setup();
  const before = p.inv.bread || 0;
  const events = game.addFriendship(p, 'darto', 520);
  assert.equal(hearts(p.rel.darto.pts), 5);
  assert.deepEqual(events.map((e) => e.hearts), [3, 5]);
  assert.equal(p.inv.bread, before + 3);
  // Shop discount from Pak Darto.
  game.world.minute = 10 * 60;
  p.x = TOWN.store.door.x; p.z = TOWN.store.door.z;
  const gold = p.gold;
  game.buy(p, { item: 'bread', qty: 1 });
  assert.equal(p.gold, gold - Math.round(ITEMS.bread.buy * 0.9));
  // Harjo's perk raises max stamina.
  game.addFriendship(p, 'harjo', 500);
  assert.equal(game.privateState(p).maxStamina, 120);
});

test('the store is closed outside opening hours', () => {
  const { game, p } = setup();
  p.x = TOWN.store.door.x; p.z = TOWN.store.door.z;
  game.world.minute = 19 * 60;
  assert.throws(() => game.buy(p, { item: 'bread', qty: 1 }), /tutup/);
  game.world.minute = 9 * 60;
  assert.ok(game.buy(p, { item: 'bread', qty: 1 }).ok);
});

test('requests are posted each morning and can be fulfilled once', () => {
  const { game, p } = setup();
  game.world.day = 20;
  game.requests = [];
  game.endDay();
  assert.ok(game.requests.length >= 1 && game.requests.length <= 3);
  assert.equal(new Set(game.requests.map((q) => q.npc)).size, game.requests.length);
  for (const q of game.requests) assert.ok(ITEMS[q.item] && q.qty > 0 && q.reward > 0);

  const q = game.requests[0];
  game.world.minute = 12 * 60;
  game.world.weather = 'sunny';
  meet(game, p, q.npc);
  p.inv[q.item] = q.qty;
  const gold = p.gold;
  const r = game.npcDeliver(p, { npc: q.npc, id: q.id });
  assert.equal(p.gold, gold + q.reward);
  assert.equal(p.inv[q.item], undefined);
  assert.equal(q.doneBy, p.name);
  p.inv[q.item] = q.qty;
  assert.throws(() => game.npcDeliver(p, { npc: q.npc, id: q.id }), GameError);
  assert.ok(r.text.length > 0);
});

test("Lina's perk waters crops every morning", () => {
  const { game, p } = setup();
  game.addFriendship(p, 'lina', 500);
  const L = plotLayout(p.plotId);
  const tiles = game.plots[p.plotId].tiles;
  for (let i = 0; i < 4; i++) tiles[i] = { t: 'soil', w: 0, c: { id: 'potato', g: 0, withered: false } };
  game.world.tomorrow = 'sunny';
  game.endDay();
  assert.equal(tiles.slice(0, 4).filter((t) => t.w).length, 4);
  assert.ok(p.lastReport.notes.some((n) => n.includes('Lina')));
  void L; void FIELD_W;
});

test('knocking works until late evening', () => {
  const { game, p } = setup();
  game.world.weather = 'rain';
  game.world.minute = 12 * 60;
  const s = meet(game, p, 'harjo');
  assert.equal(s.hidden, true);
  assert.match(game.npcTalk(p, { npc: 'harjo' }).text, /balik pintu/);
  game.world.minute = 23 * 60;
  meet(game, p, 'harjo');
  assert.throws(() => game.npcTalk(p, { npc: 'harjo' }), /sudah tidur/);
});

test('day index advances with the calendar', () => {
  assert.equal(dayIndexOf({ year: 1, season: 0, day: 1 }), 0);
  assert.equal(dayIndexOf({ year: 2, season: 1, day: 3 }), 4 * 28 + 28 + 2);
});
