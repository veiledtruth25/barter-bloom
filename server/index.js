import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { Game, GameError } from './game.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;
const DAY_SECONDS = Number(process.env.DAY_SECONDS) || 600;
const SAVE_FILE = process.env.SAVE_FILE || path.join(ROOT, 'data', 'save.json');

const app = express();
app.use(express.static(path.join(ROOT, 'client')));
app.use('/shared', express.static(path.join(ROOT, 'shared')));
app.use('/vendor/three', express.static(path.join(ROOT, 'node_modules', 'three')));
app.get('/health', (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server);
const sockets = new Map(); // playerId -> socket

function loadSave() {
  try {
    return JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function save() {
  fs.mkdirSync(path.dirname(SAVE_FILE), { recursive: true });
  const tmp = `${SAVE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(game.serialize()));
  fs.renameSync(tmp, SAVE_FILE);
}

const game = new Game({
  dayRealSeconds: DAY_SECONDS,
  data: loadSave(),
  net: {
    toPlayer: (id, ev, data) => sockets.get(id)?.emit(ev, data),
    broadcast: (ev, data) => io.emit(ev, data),
  },
});

// Wraps a handler so game errors become `{ ok: false, msg }` acknowledgements.
function handle(socket, ev, fn) {
  socket.on(ev, (data, ack) => {
    const p = socket.data.player;
    const reply = typeof ack === 'function' ? ack : () => {};
    if (!p) return reply({ ok: false, msg: 'Belum masuk.' });
    try {
      reply(fn(p, data || {}) || { ok: true });
    } catch (err) {
      if (err instanceof GameError) reply({ ok: false, msg: err.message });
      else {
        console.error(err);
        reply({ ok: false, msg: 'Terjadi kesalahan server.' });
      }
    }
  });
}

io.on('connection', (socket) => {
  socket.on('join', (data, ack) => {
    if (typeof ack !== 'function' || socket.data.player) return;
    let p;
    try {
      p = game.join(data || {});
    } catch (err) {
      return ack({ ok: false, msg: err instanceof GameError ? err.message : 'Gagal masuk.' });
    }
    const old = sockets.get(p.id);
    if (old && old !== socket) {
      old.emit('kicked', { text: 'Akun ini masuk dari tempat lain.' });
      old.data.player = null;
      old.disconnect(true);
    }
    socket.data.player = p;
    sockets.set(p.id, socket);
    game.setOnline(p, true);
    ack({ ok: true, token: p.token, self: game.privateState(p), world: game.snapshot() });
    io.emit('feed', { text: `🌱 ${p.name} bergabung ke desa.` });
  });

  handle(socket, 'move', (p, d) => { game.move(p, d); return null; });
  handle(socket, 'action', (p, d) => game.action(p, d));
  handle(socket, 'eat', (p, d) => game.eat(p, d.item));
  handle(socket, 'fish:cast', (p) => game.fishCast(p));
  handle(socket, 'fish:reel', (p) => game.fishReel(p));
  handle(socket, 'ship', (p, d) => game.ship(p, d));
  handle(socket, 'buy', (p, d) => game.buy(p, d));
  handle(socket, 'buyAnimal', (p, d) => game.buyAnimal(p, d));
  handle(socket, 'upgrade', (p, d) => game.upgrade(p, d));
  handle(socket, 'barn', (p, d) => game.barn(p, d));
  handle(socket, 'sleep', (p, d) => game.sleep(p, !!d.on));
  handle(socket, 'market:list', (p, d) => game.marketList(p, d));
  handle(socket, 'market:buy', (p, d) => game.marketBuy(p, d));
  handle(socket, 'market:cancel', (p, d) => game.marketCancel(p, d));
  handle(socket, 'trade:request', (p, d) => game.tradeRequest(p, d));
  handle(socket, 'trade:respond', (p, d) => game.tradeRespond(p, d));
  handle(socket, 'trade:update', (p, d) => game.tradeUpdate(p, d));
  handle(socket, 'trade:confirm', (p) => game.tradeConfirm(p));
  handle(socket, 'trade:cancel', (p) => game.tradeCancel(p));
  handle(socket, 'chat', (p, d) => game.chat(p, d.text));
  handle(socket, 'npc:talk', (p, d) => game.npcTalk(p, d));
  handle(socket, 'npc:gift', (p, d) => game.npcGift(p, d));
  handle(socket, 'npc:deliver', (p, d) => game.npcDeliver(p, d));
  handle(socket, 'anim', (p, d) => {
    socket.broadcast.emit('anim', { id: p.id, kind: String(d.kind || '').slice(0, 12), tool: String(d.tool || '').slice(0, 12) });
    return null;
  });

  socket.on('disconnect', () => {
    const p = socket.data.player;
    if (!p) return;
    if (sockets.get(p.id) === socket) sockets.delete(p.id);
    game.setOnline(p, false);
    io.emit('feed', { text: `👋 ${p.name} pulang.` });
  });
});

// Game clock.
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  game.tick((now - last) / 1000);
  last = now;
}, 250);
setInterval(() => io.emit('time', game.timeState()), 1000);

// Player positions at 10 Hz.
setInterval(() => {
  const list = [];
  for (const p of Object.values(game.players)) {
    if (p.online) list.push([p.id, Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100, Math.round((p.ry || 0) * 100) / 100]);
  }
  if (list.length) io.volatile.emit('pos', list);
}, 100);

setInterval(save, 30000);
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    try { save(); } catch (err) { console.error('Gagal menyimpan:', err); }
    process.exit(0);
  });
}

server.listen(PORT, () => {
  console.log(`🌾 Barter Bloom berjalan di http://localhost:${PORT}  (1 hari = ${DAY_SECONDS} detik)`);
});
