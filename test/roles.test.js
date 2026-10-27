import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { SHOPS, TOWN, ITEMS, FIELD_W, plotLayout, festivalOf, CAN_CAPACITY, MAX_STAMINA } from '../shared/defs.js';
import { mulberry32 } from '../shared/defs.js';
import { npcState, arrivalTime, dayIndexOf, VILLAGERS, FEST_POINTS } from '../shared/villagers.js';

function setup(n = 1, rng = () => 0.5) {
  const game = new Game({ rng });
  const players = [];
  for (let i = 0; i < n; i++) {
    const p = game.join({ name: `Tani${i}` });
    game.setOnline(p, true);
    players.push(p);
  }
  return { game, players };
}

const at = (p, pos, dz = 0.8) => { p.x = pos.x; p.z = pos.z + dz; };

function meet(game, p, id) {
  const s = game.npcAt(id);
  p.x = s.x + 0.5;
  p.z = s.z;
  p.npcChat = null;
  return s;
}

// Stand south of a field tile of the player's plot.
function tile(game, p, i, j) {
  const L = plotLayout(p.plotId);
  const x = L.ox + i + 0.5, z = L.oz + j + 0.5;
  p.x = x;
  p.z = z - 1;
  return { x, z, t: game.plots[p.plotId].tiles[j * FIELD_W + i] };
}

test('every shopkeeper stands at their counter during opening hours', () => {
  for (const [shopId, shop] of Object.entries(SHOPS)) {
    const counter = shop.at;
    for (const weather of ['sunny', 'rain', 'storm']) {
      for (let m = shop.open; m < shop.close; m += 5) {
        const s = npcState(shop.npc, m, weather, 2, 5);
        assert.ok(!s.moving && Math.hypot(s.x - counter.x, s.z - counter.z) < 0.01, `${shopId} keeper away at ${m} (${weather})`);
      }
    }
  }
});

test('each shop only sells its own goods', () => {
  const { game, players: [p] } = setup();
  p.gold = 50000;
  game.world.minute = 12 * 60;
  const buy = (shop, item) => { at(p, SHOPS[shop].at); return game.buy(p, { shop, item, qty: 1 }); };
  assert.ok(buy('store', 'potato_seed').ok);
  assert.ok(buy('store', 'blue_feather').ok);
  assert.ok(buy('ranch', 'chicken_feed').ok);
  assert.ok(buy('carpenter', 'lumber').ok);
  assert.ok(buy('kedai', 'soto').ok);
  assert.ok(buy('clinic', 'jamu').ok);
  assert.throws(() => buy('ranch', 'bread'), /tidak dijual di sini/);
  assert.throws(() => buy('store', 'chicken_feed'), /tidak dijual di sini/);
  at(p, SHOPS.store.at);
  assert.throws(() => game.buy(p, { shop: 'clinic', item: 'jamu', qty: 1 }), /harus berada/);
  game.world.minute = 10.5 * 60;
  at(p, SHOPS.clinic.at);
  assert.match(game.checkup(p).text, /Stamina/);
});

test('festivals close the shops while everyone is at the plaza', () => {
  const { game, players: [p] } = setup();
  game.world.season = 0;
  game.world.day = 8; // Flower Festival
  at(p, SHOPS.store.at);
  game.world.minute = 9 * 60;
  assert.ok(game.buy(p, { shop: 'store', item: 'bread', qty: 1 }).ok);
  game.world.minute = 12 * 60;
  assert.throws(() => game.buy(p, { shop: 'store', item: 'bread', qty: 1 }), /tutup selama Festival Bunga/);
  const darto = npcState('darto', 12 * 60, 'sunny', 2, dayIndexOf(game.world));
  assert.ok(Math.hypot(darto.x, darto.z) < 6, 'shopkeeper is at the plaza');
});

test('the courier collects the bin on his round; later items ship the next day', () => {
  const { game, players: [p] } = setup();
  const L = plotLayout(p.plotId);
  at(p, L.bin, -1);
  p.inv.potato = 5;
  game.ship(p, { item: 'potato', qty: 3 });
  const when = arrivalTime('danu', `bin${p.plotId}`, 'sunny', game.minutesPerSecond, dayIndexOf(game.world));
  assert.ok(when > 15 * 60 && when < 20 * 60);
  game.world.minute = when + 1;
  game.tick(0);
  assert.deepEqual(p.bin, {});
  assert.equal(p.shipped.potato, 3);
  game.ship(p, { item: 'potato', qty: 2 }); // too late for today's round
  const gold = p.gold;
  game.endDay();
  const price = game.shipPrice('potato');
  assert.ok(p.gold >= gold + 3 * Math.round(price * 0.5));
  assert.equal(p.bin.potato, 2);
  assert.deepEqual(p.shipped, {});
  // A good friend of the courier still gets late items paid.
  game.addFriendship(p, 'danu', 500);
  const g2 = p.gold;
  game.world.minute = arrivalTime('danu', `bin${p.plotId}`, game.world.weather, game.minutesPerSecond, dayIndexOf(game.world)) + 1;
  game.tick(0);
  at(p, L.bin, -1);
  p.inv.potato = 1;
  game.ship(p, { item: 'potato', qty: 1 });
  game.endDay();
  assert.ok(p.gold > g2);
  assert.deepEqual(p.bin, {});
});

test('the blacksmith upgrades tools overnight and they work on more tiles', () => {
  const { game, players: [p] } = setup();
  p.gold = 20000;
  p.inv.copper_ore = 3;
  p.inv.silver_ore = 3;
  game.world.minute = 11 * 60;
  at(p, SHOPS.forge.at);
  game.forgeTool(p, { tool: 'hoe' });
  assert.equal(p.inv.copper_ore, undefined);
  const { x, z } = tile(game, p, 4, 4);
  assert.throws(() => game.action(p, { tool: 'hoe', x, z }), /sedang ditempa/);
  game.endDay();
  assert.equal(p.tools.hoe, 1);
  // Copper hoe: a line of three tiles away from the player.
  const tiles = game.plots[p.plotId].tiles;
  for (const t of tiles) { t.t = 'grass'; t.c = null; }
  const a = tile(game, p, 4, 4);
  game.action(p, { tool: 'hoe', x: a.x, z: a.z });
  const tilled = [4, 5, 6].map((j) => tiles[j * FIELD_W + 4].t);
  assert.deepEqual(tilled, ['soil', 'soil', 'soil']);
  // Silver hoe: 3x3.
  game.world.minute = 11 * 60;
  at(p, SHOPS.forge.at);
  game.forgeTool(p, { tool: 'hoe' });
  game.endDay();
  for (const t of tiles) { t.t = 'grass'; t.c = null; }
  const b = tile(game, p, 8, 5);
  game.action(p, { tool: 'hoe', x: b.x, z: b.z });
  assert.equal(tiles.filter((t) => t.t === 'soil').length, 9);
});

test('a better watering can holds more water', () => {
  const { game, players: [p] } = setup();
  p.gold = 5000;
  p.inv.copper_ore = 3;
  game.addFriendship(p, 'bejo', 500); // quick forge
  game.world.minute = 11 * 60;
  at(p, SHOPS.forge.at);
  game.forgeTool(p, { tool: 'can' });
  assert.equal(p.tools.can, 1);
  assert.equal(p.water, CAN_CAPACITY[1]);
});

test('breaking forest rocks can yield ore', () => {
  const { game, players: [p] } = setup(1, mulberry32(7));
  game.rng = () => 0.1; // 0.1 falls in the silver ore band
  const rock = game.wild.find((o) => o.k === 'rock');
  p.x = rock.x + 1; p.z = rock.z;
  const r = game.action(p, { tool: 'hammer', x: rock.x, z: rock.z });
  assert.equal(p.inv.silver_ore, 1);
  assert.match(r.msg, /Bijih Perak/);
});

test('the carpenter builds overnight; marriage needs a bigger house and 10 hearts', () => {
  const { game, players: [p] } = setup();
  p.gold = 20000;
  p.inv.lumber = 200;
  game.world.minute = 10 * 60;
  at(p, SHOPS.store.at);
  game.buy(p, { shop: 'store', item: 'blue_feather', qty: 1 });
  game.world.minute = 12 * 60;
  meet(game, p, 'ayu');
  game.relOf(p, 'ayu').pts = 1000;
  const early = game.npcGift(p, { npc: 'ayu', item: 'blue_feather' });
  assert.equal(early.text, VILLAGERS.ayu.talk.proposeHouse);
  assert.equal(p.inv.blue_feather, 1);
  at(p, SHOPS.carpenter.at);
  game.build(p, { kind: 'house' });
  assert.equal(game.plots[p.plotId].houseLevel, 0);
  game.endDay();
  assert.equal(game.plots[p.plotId].houseLevel, 1);
  assert.equal(game.maxStamina(p), MAX_STAMINA + 10);
  game.world.minute = 12 * 60;
  game.world.weather = 'sunny';
  meet(game, p, 'ayu');
  const yes = game.npcGift(p, { npc: 'ayu', item: 'blue_feather' });
  assert.equal(yes.reaction, 'wedding');
  assert.equal(p.spouse, 'ayu');
  assert.equal(game.world.marriages.ayu, p.id);
  assert.equal(p.inv.blue_feather, undefined);
  // The spouse now lives on the farm and brings lunch every morning.
  assert.equal(game.npcAt('ayu').spot === 'innCounter' || game.npcAt('ayu').moving, true);
  game.world.minute = 25 * 60;
  assert.equal(game.npcAt('ayu').spot, `plotHome${p.plotId}`);
  game.endDay();
  assert.equal(p.inv.bento, 1);
});

test('someone else cannot marry a villager who is already married', () => {
  const { game, players: [a, b] } = setup(2);
  game.world.marriages.lina = a.id;
  a.spouse = 'lina';
  b.inv.blue_feather = 1;
  game.relOf(b, 'lina').pts = 1000;
  game.plots[b.plotId].houseLevel = 1;
  game.world.minute = 12 * 60;
  meet(game, b, 'lina');
  const r = game.npcGift(b, { npc: 'lina', item: 'blue_feather' });
  assert.match(r.text, /sudah menikah/);
  assert.equal(b.inv.blue_feather, 1);
});

test('festival activities: dancing, the harvest pot and the livestock contest', () => {
  const { game, players: [a, b] } = setup(2);
  game.world.season = 0; game.world.day = 8; game.world.minute = 12 * 60;
  a.x = 1; a.z = 6;
  const r = game.festivalJoin(a, { npc: 'lina' });
  assert.match(r.text, /menari/);
  assert.equal(a.rel.lina.pts, FEST_POINTS);
  assert.throws(() => game.festivalJoin(a, { npc: 'ayu' }), /sudah ikut/);

  game.world.season = 2; game.world.day = 13;
  a.inv.mushroom = 1;
  game.festivalJoin(a, { item: 'mushroom' });
  assert.ok(a.rel.harjo.pts >= 30 + 50, 'Kakek Harjo loves mushrooms');
  assert.ok(a.rel.joko.pts >= 30);

  game.world.season = 1; game.world.day = 20; game.world.minute = 11 * 60;
  const fest = festivalOf(1, 20);
  game.plots[a.plotId].animals.push({ id: 'a1', type: 'cow', name: 'Mimi', aff: 60, fed: false, petted: false, prod: null });
  game.plots[b.plotId].animals.push({ id: 'b1', type: 'chicken', name: 'Kiko', aff: 40, fed: false, petted: false, prod: null });
  b.x = -1; b.z = -6;
  game.festivalJoin(a, {});
  game.festivalJoin(b, {});
  const gold = a.gold;
  game.world.minute = fest.end;
  game.tick(0);
  assert.equal(game.world.fest.winner.name, a.name);
  assert.equal(a.gold, gold + 2000);
  assert.equal(a.inv.trophy, 1);
  assert.equal(game.plots[a.plotId].animals[0].aff, 70);
});

test('the Harvest Goddess accepts one offering a day and grants power berries', () => {
  const { game, players: [p] } = setup();
  p.x = TOWN.spring.x + TOWN.spring.r + 0.6; p.z = TOWN.spring.z;
  p.inv.flower = 10;
  const r = game.goddessOffer(p, { item: 'flower' });
  assert.equal(r.reaction, 'love');
  assert.equal(game.goddessOffer(p, { item: 'flower' }).reaction, 'already');
  assert.equal(p.inv.flower, 9);
  p.goddess.pts = 190;
  p.goddess.day = -1;
  const berry = game.goddessOffer(p, { item: 'flower' });
  assert.ok(berry.berry);
  assert.equal(p.inv.power_berry, 1);
  const before = game.maxStamina(p);
  game.eat(p, 'power_berry');
  assert.equal(game.maxStamina(p), before + 10);
  assert.ok(ITEMS.power_berry);
});

test('a spouse greets you at home in the evening, not through the door', () => {
  const { game, players: [p] } = setup();
  game.world.marriages.ayu = p.id;
  p.spouse = 'ayu';
  game.relOf(p, 'ayu').met = true;
  game.world.minute = 23 * 60;
  const s = meet(game, p, 'ayu');
  assert.equal(s.spot, `plotHome${p.plotId}`);
  const r = game.npcTalk(p, { npc: 'ayu' });
  assert.ok(VILLAGERS.ayu.talk.spouseNight.includes(r.text), r.text);
});
