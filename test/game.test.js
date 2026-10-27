import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, GameError } from '../server/game.js';
import { plotLayout, FIELD_W, TOWN, CROPS, SHOPS } from '../shared/defs.js';

function setup(n = 1) {
  const game = new Game({ rng: () => 0.5 });
  const players = [];
  for (let i = 0; i < n; i++) {
    const p = game.join({ name: `Tani${i}` });
    game.setOnline(p, true);
    players.push(p);
  }
  return { game, players };
}

// Stand next to a field tile of the player's plot and return its world coords.
function tile(game, p, i, j) {
  const L = plotLayout(p.plotId);
  const x = L.ox + i + 0.5, z = L.oz + j + 0.5;
  p.x = x; p.z = z - 1;
  return { x, z, t: game.plots[p.plotId].tiles[j * FIELD_W + i] };
}

test('till, plant, water, grow and harvest a crop', () => {
  const { game, players: [p] } = setup();
  const { x, z, t } = tile(game, p, 5, 5);
  t.t = 'grass'; t.c = null;
  game.action(p, { tool: 'hoe', x, z });
  assert.equal(t.t, 'soil');
  game.action(p, { tool: 'hand', x, z, item: 'potato_seed' });
  assert.equal(t.c.id, 'potato');
  for (let d = 0; d < CROPS.potato.days; d++) {
    game.action(p, { tool: 'can', x, z });
    p.water = 20;
    game.endDay();
    p.x = x; p.z = z - 1;
  }
  assert.equal(t.c.g, CROPS.potato.days);
  const before = p.inv.potato || 0;
  game.action(p, { tool: 'hand', x, z });
  assert.equal(p.inv.potato, before + 1);
  assert.equal(t.c, null);
});

test('crops do not grow without water and cannot be farmed on other plots', () => {
  const { game, players: [a, b] } = setup(2);
  const { x, z, t } = tile(game, a, 2, 2);
  t.t = 'soil'; t.c = { id: 'potato', g: 0, withered: false }; t.w = 0;
  game.endDay();
  assert.equal(t.c.g, 0);
  b.x = x; b.z = z - 1;
  assert.throws(() => game.action(b, { tool: 'hoe', x, z }), GameError);
});

test('shipping bin pays out at day end', () => {
  const { game, players: [p] } = setup();
  const L = plotLayout(p.plotId);
  p.x = L.bin.x; p.z = L.bin.z - 1;
  p.inv.potato = 3;
  const price = game.shipPrice('potato');
  game.ship(p, { item: 'potato', qty: 3 });
  const gold = p.gold;
  game.endDay();
  assert.equal(p.gold, gold + price * 3);
  assert.deepEqual(p.bin, {});
});

test('market listing escrows items and pays the seller', () => {
  const { game, players: [a, b] } = setup(2);
  a.inv.lumber = 10;
  game.marketList(a, { item: 'lumber', qty: 10, price: 30 });
  assert.equal(a.inv.lumber, undefined);
  const id = game.market.listings[0].id;
  const ga = a.gold, gb = b.gold;
  game.marketBuy(b, { id, qty: 4 });
  assert.equal(b.inv.lumber, 4);
  assert.equal(a.gold, ga + 120);
  assert.equal(b.gold, gb - 120);
  assert.equal(game.market.listings[0].qty, 6);
  game.marketCancel(a, { id });
  assert.equal(a.inv.lumber, 6);
  assert.equal(game.market.listings.length, 0);
});

test('direct trade swaps items and gold only when both confirm', () => {
  const { game, players: [a, b] } = setup(2);
  a.inv.egg = 5;
  b.gold = 1000;
  game.tradeRequest(a, { target: b.id });
  game.tradeRespond(b, { from: a.id, accept: true });
  game.tradeUpdate(a, { items: { egg: 5 }, gold: 0 });
  game.tradeUpdate(b, { items: {}, gold: 300 });
  game.tradeConfirm(a);
  assert.equal(b.inv.egg, undefined);
  game.tradeConfirm(b);
  assert.equal(b.inv.egg, 5);
  assert.equal(a.inv.egg, undefined);
  assert.equal(b.gold, 700);
  assert.equal(a.tradeId, null);
});

test('changing an offer resets confirmations', () => {
  const { game, players: [a, b] } = setup(2);
  a.inv.egg = 5;
  game.tradeRequest(a, { target: b.id });
  game.tradeRespond(b, { from: a.id, accept: true });
  game.tradeConfirm(b);
  game.tradeUpdate(a, { items: { egg: 1 } });
  const tr = game.trades.get(a.tradeId);
  assert.equal(tr.ok[b.id], false);
});

test('animals produce when fed and everyone sleeping skips the day', () => {
  const { game, players: [p] } = setup();
  p.x = SHOPS.ranch.at.x; p.z = SHOPS.ranch.at.z + 1;
  p.gold = 5000;
  game.world.minute = 9 * 60; // ranch opening hours
  game.buyAnimal(p, { type: 'chicken', name: 'Kiko' });
  const L = plotLayout(p.plotId);
  p.x = L.barnDoor.x; p.z = L.barnDoor.z;
  game.barn(p, { op: 'feed' });
  p.x = L.houseDoor.x; p.z = L.houseDoor.z;
  game.world.minute = 20 * 60;
  const day = game.world.day;
  game.sleep(p, true);
  assert.equal(game.world.day, day + 1);
  p.x = L.barnDoor.x; p.z = L.barnDoor.z;
  game.barn(p, { op: 'collect' });
  assert.equal(p.inv.egg, 1);
});

test('fishing requires timing the bite', () => {
  const { game, players: [p] } = setup();
  p.x = TOWN.pond.x - TOWN.pond.r - 0.5; p.z = TOWN.pond.z;
  game.fishCast(p);
  assert.throws(() => game.fishReel(p), /Terlalu cepat/);
  game.fishCast(p);
  p.fish.biteAt = Date.now() - 100;
  const r = game.fishReel(p);
  assert.ok(r.item.startsWith('fish'));
});

test('save data round-trips', () => {
  const { game, players: [p] } = setup();
  const g2 = new Game({ data: JSON.parse(JSON.stringify(game.serialize())) });
  assert.equal(g2.players[p.id].name, p.name);
  assert.equal(g2.players[p.id].online, false);
});
