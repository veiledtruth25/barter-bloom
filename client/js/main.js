import * as THREE from 'three';
import {
  SEASONS, ITEMS, CROPS, TOOLS, REACH, FIELD_W, FIELD_H, PLOT_CENTERS, TOWN, plotLayout, colliders, resolveCollision,
  nearWater, groundHeight, SHOPS, shopOpen, shopHours, festivalOf, toolArea,
} from '/shared/defs.js';
import { VILLAGERS, HOUSES } from '/shared/villagers.js';
import { Villagers, renderPortraits } from './villagers.js';
import { World } from './world.js';
import { FarmRenderer, makeTargetMarker } from './farm.js';
import { makeAvatar, animateAvatar, setTool, swing, hop, LOOK_CHOICES, defaultLook } from './avatar.js';
import { Particles, Ambience, Sfx, FX_STYLE, firework } from './fx.js';
import {
  initUI, toast, feed, updateHud, updateHotbar, updateClock, showPrompt, fishMeter, addChat, drawMinimap, openPanel,
  closePanel, panelOpen, refreshPanel, showDayStart, advanceDialogue, inDialogue, festivalLive, h,
} from './ui.js';

const $ = (id) => document.getElementById(id);
const COL = colliders();
const WALK = 4.6, RUN = 7.5;

// ------------------------------------------------------------- renderer

const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const world = new World(renderer);
const scene = world.scene;
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 900);
const farm = new FarmRenderer(scene);
const particles = new Particles(scene);
const ambience = new Ambience(scene);
const marker = makeTargetMarker();
marker.visible = false;
scene.add(marker);
const villagers = new Villagers(scene, $('labels'));

const bobber = new THREE.Group();
{
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe2412b }));
  const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  bobber.add(top, bottom);
  bobber.visible = false;
  scene.add(bobber);
}
const fishLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
fishLine.visible = false;
fishLine.frustumCulled = false;
scene.add(fishLine);

// ---------------------------------------------------------------- state

const G = {
  socket: null, self: null, me: null, players: new Map(), plots: [], wild: [], market: { listings: [], prices: {}, hot: null },
  village: { fest: null, marriages: {} }, homes: {},
  time: { day: 1, season: 0, year: 1, minute: 360, weather: 'sunny', tomorrow: 'sunny', rate: 2 },
  timeSync: performance.now(), tool: 'hoe', selectedItem: null, uiOpen: false, trade: null, fishing: null, sfx: new Sfx(),
  cam: { yaw: 0.6, pitch: 0.75, dist: 15, targetDist: 15 },
  selectTool(id) {
    if (G.tool === id) return;
    G.tool = id;
    if (G.me) setTool(G.me, id === 'hand' ? null : id);
    if (G.fishing && id !== 'rod') cancelFishing();
    G.sfx.play('click');
    updateHotbar();
  },
  holdItem(id) {
    G.selectedItem = id;
    G.tool = 'hand';
    if (G.me) setTool(G.me, null);
    updateHotbar();
    toast(`Memegang ${ITEMS[id].icon} ${ITEMS[id].name}`);
  },
  request(ev, data = {}) {
    return new Promise((resolve) => {
      if (!G.socket) return resolve({ ok: false });
      G.socket.timeout(8000).emit(ev, data, (err, res) => {
        if (err) { toast('Koneksi lambat, coba lagi.', 'error'); return resolve({ ok: false }); }
        if (res && !res.ok && res.msg) { toast(res.msg, 'error'); G.sfx.play('error'); }
        resolve(res || { ok: false });
      });
    });
  },
};
G.villagers = villagers;
G.requests = [];
G.portraits = renderPortraits();
G.minute = () => currentMinute();
window.__G = G;

function currentMinute() {
  return G.time.minute + ((performance.now() - G.timeSync) / 1000) * (G.time.rate || 0);
}

// --------------------------------------------------------------- labels

const labels = $('labels');
const floats = [];
const _v = new THREE.Vector3();

function project(x, y, z) {
  _v.set(x, y, z).project(camera);
  if (_v.z > 1) return null;
  return [(_v.x * 0.5 + 0.5) * window.innerWidth, (-_v.y * 0.5 + 0.5) * window.innerHeight];
}

function floatText(x, y, z, text, cls = '') {
  const el = h('div', { class: `float-text ${cls}` }, text);
  labels.append(el);
  floats.push({ el, x, y, z, t: 0 });
}

// -------------------------------------------------------------- players

function ensurePlayer(info) {
  let p = G.players.get(info.id);
  const lookKey = JSON.stringify(info.look);
  if (!p) {
    p = { info, avatar: null, tag: h('div', { class: 'nametag' }), bubble: null, bubbleUntil: 0, target: new THREE.Vector3(info.x, 0, info.z), ry: info.ry || 0, lookKey: null };
    labels.append(p.tag);
    G.players.set(info.id, p);
  }
  p.info = { ...p.info, ...info };
  if (p.lookKey !== lookKey) {
    if (p.avatar) scene.remove(p.avatar);
    const isMe = info.id === G.self?.id;
    p.avatar = makeAvatar(info.look || defaultLook(info.color));
    p.avatar.position.copy(isMe && G.me ? G.me.position : new THREE.Vector3(info.x, 0, info.z));
    scene.add(p.avatar);
    p.lookKey = lookKey;
    if (isMe) {
      G.me = p.avatar;
      setTool(G.me, G.tool === 'hand' ? null : G.tool);
    }
  }
  p.tag.style.background = info.color;
  p.tag.replaceChildren(info.name, info.sleeping ? h('span', { class: 'zz' }, '💤') : '');
  const visible = info.online && !info.sleeping;
  p.avatar.visible = visible;
  p.tag.style.display = visible ? '' : 'none';
  return p;
}

function showBubble(id, text) {
  const p = G.players.get(id);
  if (!p) return;
  p.bubble?.remove();
  p.bubble = h('div', { class: 'bubble' }, text);
  labels.append(p.bubble);
  p.bubbleUntil = performance.now() + 5000;
}

// -------------------------------------------------------------- network

function connect(name, look) {
  const socket = io({ transports: ['websocket', 'polling'] });
  G.socket = socket;
  const join = () => {
    socket.emit('join', { name, token: localStorage.getItem('bb_token'), color: look.shirt, look }, (res) => {
      if (!res.ok) {
        $('loginError').textContent = res.msg;
        $('joinBtn').disabled = false;
        if (/Nama sudah/.test(res.msg)) localStorage.removeItem('bb_token');
        socket.disconnect();
        G.socket = null;
        return;
      }
      localStorage.setItem('bb_token', res.token);
      localStorage.setItem('bb_name', name);
      localStorage.setItem('bb_look', JSON.stringify(look));
      onJoined(res);
    });
  };
  socket.on('connect', () => { if (G.self) { G.self = null; join(); } });
  join();

  socket.on('self', (s) => {
    const prevGold = G.self?.gold;
    G.self = s;
    if (prevGold !== undefined && s.gold > prevGold && G.me) floatText(G.me.position.x, 2.6, G.me.position.z, `+${s.gold - prevGold}G`, 'gold');
    updateHud();
    refreshPanel('inventory', 'shop', 'ship', 'barn', 'market', 'trade', 'sleep', 'villagers', 'festival');
  });
  socket.on('requests', (list) => setRequests(list));
  socket.on('plot', (plot) => {
    G.plots[plot.id] = plot;
    farm.updatePlot(plot);
    world.setPlotOwner(plot.id, plot.ownerName, plot.color);
    world.updatePlotStructures(plot);
    if (plot.id === G.self?.plotId) refreshPanel('barn', 'shop', 'festival');
  });
  socket.on('village', (v) => {
    G.village = v;
    updateHomes();
    refreshPanel('festival', 'villagers', 'sleep');
  });
  socket.on('wedding', ({ pid, name, npc }) => {
    const v = VILLAGERS[npc];
    toast(`💒 ${name} dan ${v.name} menikah! Selamat!`, 'gold');
    G.sfx.play('morning');
    // Fireworks over the plaza for everyone; the happy couple gets a shower of petals.
    celebrate(0, 0, 9);
    if (pid === G.self?.id && G.me) {
      hop(G.me);
      particles.burst(G.me.position.x, 1.6, G.me.position.z, FX_STYLE.wedding);
      setTimeout(() => toast(`💍 ${v.name} akan tinggal di rumah ladangmu mulai besok. Setiap pagi ada bekal cinta untukmu!`, 'gold'), 1800);
    }
  });
  socket.on('wild', (w) => { G.wild = w; farm.updateWild(w); });
  socket.on('market', (m) => { G.market = m; refreshPanel('market', 'ship', 'inventory'); });
  socket.on('time', (t) => setTime(t));
  socket.on('player', (info) => {
    const known = G.players.has(info.id);
    ensurePlayer(info);
    if (!known) updateHomes();
    refreshPanel('players', 'sleep');
  });
  socket.on('pos', (list) => {
    for (const [id, x, z, ry] of list) {
      if (id === G.self?.id) continue;
      const p = G.players.get(id);
      if (!p) continue;
      p.target.set(x, 0, z);
      p.ry = ry;
    }
  });
  socket.on('anim', ({ id, kind, tool }) => {
    const p = G.players.get(id);
    if (!p?.avatar) return;
    setTool(p.avatar, tool === 'hand' ? null : tool);
    if (kind === 'swing') swing(p.avatar);
    if (kind === 'hop') hop(p.avatar);
    p.fishing = kind === 'fish';
    if (kind === 'idle') p.fishing = false;
  });
  socket.on('fx', (f) => {
    const style = FX_STYLE[f.type];
    if (f.type === 'goddess') {
      // The Harvest Goddess rises from her spring to accept an offering.
      villagers.showGoddess(scene);
      particles.burst(TOWN.spring.x, 0.6, TOWN.spring.z, style);
      return;
    }
    if (f.type === 'wedding') {
      particles.burst(f.x, 1.8, f.z, style);
      return;
    }
    if (f.type.startsWith('npc_')) {
      // Villager reaction to a gift: hearts (or a grumble) above their head.
      const emoji = { npc_love: '💖', npc_like: '😊', npc_neutral: '🙂', npc_dislike: '💢' }[f.type];
      const n = villagers.list.get(f.npc);
      const pos = n?.avatar.visible ? n.avatar.position : { x: f.x, z: f.z };
      if (style) particles.burst(pos.x, 1.9, pos.z, style);
      if (emoji) floatText(pos.x, 2.7, pos.z, emoji);
      return;
    }
    if (style) particles.burst(f.x, 0.3, f.z, style);
    const dist = G.me ? Math.hypot(G.me.position.x - f.x, G.me.position.z - f.z) : 99;
    if (dist < 25 && f.pid !== G.self?.id) G.sfx.play(f.type === 'harvest' ? 'pickup' : f.type);
    if (f.item && f.pid !== G.self?.id && dist < 30) floatText(f.x, 1.6, f.z, `${ITEMS[f.item]?.icon || ''}`);
  });
  socket.on('toast', (t) => { toast(t.text, t.kind); if (t.kind === 'gold') G.sfx.play('coin'); });
  socket.on('feed', (f) => feed(f.text));
  socket.on('chat', (c) => {
    addChat(c.name, c.color, c.text);
    showBubble(c.from, c.text);
    if (c.from !== G.self?.id) G.sfx.play('chat');
  });
  socket.on('dayStart', ({ report, x, z, seasonChanged }) => {
    if (G.fishing) cancelFishing(true);
    if (G.me) G.me.position.set(x, 0, z);
    if (panelOpen('sleep')) closePanel(true);
    G.sfx.play('morning');
    showDayStart(report);
    if (seasonChanged) setTimeout(() => toast(`${SEASONS[G.time.season].icon} ${SEASONS[G.time.season].name} telah tiba!`, 'gold'), 1500);
  });
  socket.on('trade:request', (r) => {
    G.sfx.play('trade');
    if (G.uiOpen && !panelOpen('tradeRequest')) closePanel(true);
    openPanel('tradeRequest', r);
  });
  socket.on('trade:open', (v) => { G.trade = v; closePanel(true); openPanel('trade'); G.sfx.play('trade'); });
  socket.on('trade:state', (v) => { G.trade = v; refreshPanel('trade'); });
  socket.on('trade:done', ({ text }) => {
    G.trade = null; closePanel(true); toast(text, 'gold'); G.sfx.play('trade');
    if (G.me) { hop(G.me); particles.burst(G.me.position.x, 1.5, G.me.position.z, FX_STYLE.harvest); }
  });
  socket.on('trade:closed', ({ text }) => { G.trade = null; if (panelOpen('trade')) closePanel(true); toast(text, 'error'); });
  socket.on('kicked', ({ text }) => { alert(text); location.reload(); });
  socket.on('disconnect', () => toast('Terputus dari server… mencoba menyambung ulang', 'error'));
}

function setRequests(list) {
  G.requests = list || [];
  world.setBoardNotes(G.requests.filter((q) => !q.doneBy).length);
  refreshPanel('villagers', 'dialogue');
}

function setTime(t) {
  const oldSeason = G.time.season;
  G.time = t;
  G.timeSync = performance.now();
  if (t.season !== oldSeason || world.season !== SEASONS[t.season].id) applySeason();
  // Plaza decorations go up on festival days.
  world.setFestival(festivalOf(t.season, t.day));
}

// Married villagers live on their spouse's farm: { villagerId: plotId }.
function updateHomes() {
  G.homes = {};
  for (const [npc, pid] of Object.entries(G.village?.marriages || {})) {
    const plotId = G.players.get(pid)?.info.plotId;
    if (plotId !== undefined) G.homes[npc] = plotId;
  }
}

function applySeason() {
  const s = SEASONS[G.time.season].id;
  if (world.season === s && farm.season === s) return;
  world.rebuildSeasonal(s);
  farm.setSeason(s);
  for (const p of G.plots) if (p) farm.updatePlot(p);
}

function onJoined(res) {
  G.self = res.self;
  const w = res.world;
  G.market = w.market;
  setTime(w.time);
  applySeason();
  for (const pl of w.plots) {
    G.plots[pl.id] = pl;
    farm.updatePlot(pl);
    world.setPlotOwner(pl.id, pl.ownerName, pl.color);
    world.updatePlotStructures(pl);
  }
  G.wild = w.wild;
  farm.updateWild(w.wild);
  setRequests(w.requests);
  for (const p of w.players) ensurePlayer(p);
  G.village = w.village || { fest: null, marriages: {} };
  updateHomes();
  const me = G.players.get(G.self.id);
  G.me = me.avatar;
  if (G.playing) { updateHud(); return; } // reconnect: state refreshed, UI already up
  G.me.position.set(me.info.x, 0, me.info.z);
  initUI(G);
  updateHud();
  $('login').classList.add('out');
  setTimeout(() => $('login').remove(), 700);
  $('hud').classList.remove('hidden');
  addChat('', '', `Selamat datang di desa, ${G.self.name}! Tekan H untuk panduan. 🌾`, true);
  G.playing = true;
  previewRunning = false;
}

// ---------------------------------------------------------------- input

const keys = new Set();
const mouse = { x: 0, y: 0, inside: false, dragging: false, lastX: 0, lastY: 0, moved: 0 };
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

window.addEventListener('keydown', (e) => {
  const chat = $('chatInput');
  if (document.activeElement === chat) {
    if (e.key === 'Enter') {
      const text = chat.value.trim();
      if (text) G.request('chat', { text });
      chat.value = '';
      chat.blur();
    } else if (e.key === 'Escape') chat.blur();
    return;
  }
  if (!G.playing) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  const k = e.key.toLowerCase();
  if (k === 'escape') { if (G.uiOpen) closePanel(); return; }
  if (inDialogue()) {
    if ([' ', 'e', 'f', 'enter'].includes(k)) { e.preventDefault(); if (!e.repeat) advanceDialogue(); }
    return;
  }
  if (k === 'enter') { e.preventDefault(); chat.focus(); return; }
  const toggles = { i: 'inventory', m: 'market', p: 'players', h: 'help', v: 'villagers' };
  if (toggles[k]) {
    if (panelOpen(toggles[k])) closePanel(); else if (!G.trade) { closePanel(true); openPanel(toggles[k]); }
    return;
  }
  if (G.uiOpen) return;
  const tool = TOOLS.find((t) => t.key === e.key);
  if (tool) { G.selectTool(tool.id); return; }
  if (k === ' ') { e.preventDefault(); if (!e.repeat) useTool(); return; }
  if (k === 'e' || k === 'f') { if (!e.repeat) interact(); return; }
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

canvas.addEventListener('mousemove', (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  mouse.inside = true;
  if (mouse.dragging) {
    G.cam.yaw -= (e.clientX - mouse.lastX) * 0.006;
    G.cam.pitch = Math.max(0.3, Math.min(1.35, G.cam.pitch + (e.clientY - mouse.lastY) * 0.004));
    mouse.moved += Math.abs(e.clientX - mouse.lastX);
  }
  mouse.lastX = e.clientX;
  mouse.lastY = e.clientY;
});
canvas.addEventListener('mouseleave', () => { mouse.inside = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  G.sfx.ensure();
  if (!G.playing) return;
  if (e.button === 2 || e.button === 1) { mouse.dragging = true; mouse.lastX = e.clientX; mouse.lastY = e.clientY; return; }
  if (e.button === 0 && !G.uiOpen) useTool();
});
window.addEventListener('mouseup', () => { mouse.dragging = false; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  G.cam.targetDist = Math.max(7, Math.min(28, G.cam.targetDist + Math.sign(e.deltaY) * 1.5));
}, { passive: false });

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ------------------------------------------------------------- targeting

function tileAt(x, z) {
  for (let i = 0; i < PLOT_CENTERS.length; i++) {
    const L = plotLayout(i);
    const ti = Math.floor(x - L.ox), tj = Math.floor(z - L.oz);
    if (ti >= 0 && ti < FIELD_W && tj >= 0 && tj < FIELD_H) {
      return { plotId: i, i: ti, j: tj, x: L.ox + ti + 0.5, z: L.oz + tj + 0.5, tile: G.plots[i]?.tiles[tj * FIELD_W + ti] };
    }
  }
  return null;
}

function nearestWild(x, z, r = 1.5) {
  let best = null, bd = r;
  for (const o of G.wild) {
    const d = Math.hypot(o.x - x, o.z - z);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

function computeTarget() {
  const p = G.me.position;
  let x, z;
  let fromMouse = false;
  if (mouse.inside && !mouse.dragging) {
    raycaster.setFromCamera(new THREE.Vector2(mouse.x, mouse.y), camera);
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(groundPlane, hit) && Math.hypot(hit.x - p.x, hit.z - p.z) < REACH - 0.7) {
      x = hit.x; z = hit.z; fromMouse = true;
    }
  }
  if (!fromMouse) {
    x = p.x + Math.sin(G.me.rotation.y) * 1.1;
    z = p.z + Math.cos(G.me.rotation.y) * 1.1;
  }
  const t = tileAt(x, z);
  if (t) return { x: t.x, z: t.z, tile: t };
  const w = nearestWild(x, z);
  if (w) return { x: w.x, z: w.z, wild: w };
  return { x, z };
}

function updateMarker(t) {
  const L = marker.userData;
  marker.visible = false;
  if (!t || G.uiOpen || G.tool === 'rod') return;
  if (t.tile) {
    const own = t.tile.plotId === G.self.plotId;
    const seed = G.tool === 'hand' && G.selectedItem && ITEMS[G.selectedItem]?.type === 'seed';
    marker.visible = true;
    // Seeds and upgraded tools cover a 3×3 square, or a line of 3 tiles leading away from you.
    const area = seed ? 'square' : toolArea(G.tool, G.self.tools?.[G.tool] || 0);
    let x = t.x, z = t.z, sx = 1, sz = 1;
    if (own && area === 'square') sx = sz = 3;
    else if (own && area === 'line') {
      const dx = t.x - G.me.position.x, dz = t.z - G.me.position.z;
      if (Math.abs(dx) >= Math.abs(dz)) { sx = 3; x += Math.sign(dx) || 1; } else { sz = 3; z += Math.sign(dz) || 1; }
    }
    marker.position.set(x, 0, z);
    marker.scale.set(sx, 1, sz);
    const color = own ? 0xffffff : G.tool === 'can' ? 0x9ad0ff : 0xff6b5a;
    L.line.material.color.set(color);
    L.fill.material.color.set(color);
  } else if (t.wild) {
    marker.visible = true;
    marker.position.set(t.wild.x, 0, t.wild.z);
    marker.scale.set(1.3, 1, 1.3);
    L.line.material.color.set(0xffe066);
    L.fill.material.color.set(0xffe066);
  }
  const pulse = 0.75 + Math.sin(performance.now() / 180) * 0.25;
  L.line.material.opacity = pulse;
  L.fill.material.opacity = 0.12 + pulse * 0.1;
}

// --------------------------------------------------------------- actions

let actionCooldown = 0;
const TOOL_SFX = { hoe: 'dirt', can: 'water', sickle: 'leaves', axe: 'wood', hammer: 'stone' };

async function useTool() {
  if (!G.me || G.uiOpen || G.self.sleeping || actionCooldown > 0) return;
  G.sfx.ensure();
  if (G.tool === 'rod') return fishAction();
  actionCooldown = 0.32;
  const t = computeTarget();
  if (G.tool !== 'hand') {
    swing(G.me);
    G.socket.emit('anim', { kind: 'swing', tool: G.tool });
  }
  const res = await G.request('action', { tool: G.tool, x: t.x, z: t.z, item: G.tool === 'hand' ? G.selectedItem : undefined });
  if (!res.ok) return;
  if (G.tool === 'hand') { hop(G.me); G.socket.emit('anim', { kind: 'hop', tool: 'hand' }); }
  G.sfx.play(G.tool === 'hand' ? (res.msg?.includes('Nyam') ? 'eat' : res.msg?.includes('ditanami') ? 'plant' : 'harvest') : (res.msg?.includes('terisi') ? 'refill' : TOOL_SFX[G.tool]));
  if (res.msg) floatText(t.x, 1.4, t.z, res.msg, res.msg.startsWith('+') ? 'gold' : '');
}

function interactables() {
  const out = [];
  const L = plotLayout(G.self.plotId);
  out.push({ x: L.houseDoor.x, z: L.houseDoor.z, r: 2.2, label: G.self.sleeping ? 'Bangun' : 'Masuk rumah', run: () => openPanel('sleep') });
  out.push({ x: L.barnDoor.x, z: L.barnDoor.z, r: 2.4, label: 'Buka kandang', run: () => openPanel('barn') });
  out.push({ x: L.bin.x, z: L.bin.z, r: 2.4, label: 'Kotak pengiriman', run: () => openPanel('ship') });
  const minute = currentMinute();
  const fest = festivalOf(G.time.season, G.time.day);
  const doors = villagers.doors();
  // Shops are open while their keeper is at the counter; otherwise knock if they are home.
  for (const [sid, s] of Object.entries(SHOPS)) {
    const house = Object.keys(HOUSES).find((k) => HOUSES[k].shop === sid);
    const door = doors.find((d) => d.house === house);
    const at = { x: s.door.x, z: s.door.z, r: 3 };
    if (shopOpen(sid, minute, fest)) out.push({ ...at, label: `Masuk ${s.name}`, run: () => openPanel('shop', { shop: sid }) });
    else if (door?.ids.length) out.push({ ...at, label: `${s.name} tutup — ketuk pintu`, run: () => knock(door) });
    else out.push({ ...at, label: `${s.name} tutup (buka ${shopHours(sid)})`, run: () => openPanel('shop', { shop: sid }) });
  }
  out.push({ x: TOWN.market.door.x, z: TOWN.market.door.z, r: 3, label: 'Masuk Pasar Pemain', run: () => openPanel('market') });
  out.push({ x: TOWN.board.x - 0.9, z: TOWN.board.z, r: 2.6, label: 'Lihat Papan Pesanan', run: () => openPanel('villagers', { tab: 'requests' }) });
  for (const d of doors) {
    // Your own spouse is greeted from inside the house (see the house panel).
    if (HOUSES[d.house]?.shop || !d.ids.length || d.plot === G.self.plotId) continue;
    out.push({ x: d.x, z: d.z, r: 2.4, label: `Ketuk pintu ${d.name}`, run: () => knock(d) });
  }
  // The Harvest Goddess' spring in the eastern woods.
  out.push({ x: TOWN.spring.x, z: TOWN.spring.z, r: TOWN.spring.r + 2.4, label: '✨ Panggil Dewi Panen', run: () => openGoddess() });
  // Festival activities at the plaza fountain.
  if (fest && (festivalLive(fest, minute) || (fest.activity === 'contest' && minute >= fest.start))) {
    out.push({ x: TOWN.fountain.x, z: TOWN.fountain.z, r: 4.6, label: `${fest.icon} Ikut ${fest.name}`, run: () => openPanel('festival') });
  }
  const me = G.me.position;
  const npc = villagers.nearest(me.x, me.z, 2.6);
  if (npc) {
    const a = villagers.list.get(npc).avatar.position;
    out.push({ x: a.x, z: a.z, r: 2.6, label: `Bicara dengan ${VILLAGERS[npc].name}`, run: () => G.talkTo(npc) });
  }
  for (const p of G.players.values()) {
    if (p.info.id === G.self.id || !p.info.online || p.info.sleeping) continue;
    out.push({ x: p.avatar.position.x, z: p.avatar.position.z, r: 2, label: `Ajak ${p.info.name} berdagang`, run: () => G.request('trade:request', { target: p.info.id }).then((r) => r.ok && toast(r.msg)) });
  }
  return out;
}

function knock(door) {
  G.sfx.play('knock');
  if (door.ids.length === 1) G.talkTo(door.ids[0]);
  else openPanel('knock', { name: door.name, ids: door.ids });
}

// Calling the Harvest Goddess: she rises from the spring and stays while you talk.
function openGoddess() {
  villagers.showGoddess(scene, true);
  particles.burst(TOWN.spring.x, 0.6, TOWN.spring.z, FX_STYLE.goddess);
  G.sfx.play('morning');
  openPanel('goddess');
}
G.endGoddess = () => villagers.releaseGoddess();

// Fireworks: the summer festival over the pond, and weddings over the plaza.
let fireworkTimer = 0;
const celebration = { until: 0, x: 0, z: 0 };
function celebrate(x, z, seconds) {
  Object.assign(celebration, { until: performance.now() + seconds * 1000, x, z });
}

function updateFireworks(dt, minute) {
  const fest = festivalOf(G.time.season, G.time.day);
  const show = fest?.activity === 'watch' && minute >= fest.start && minute < fest.end;
  if (!show && performance.now() > celebration.until) return;
  fireworkTimer -= dt;
  if (fireworkTimer > 0) return;
  fireworkTimer = 0.45 + Math.random();
  const c = show ? TOWN.pond : celebration;
  const x = c.x + (Math.random() - 0.5) * 14, z = c.z + (Math.random() - 0.5) * 10;
  firework(particles, x, 14 + Math.random() * 8, z);
  if (G.me && Math.hypot(G.me.position.x - x, G.me.position.z - z) < 80) G.sfx.play('firework');
}

G.talkTo = async (id) => {
  if (G.uiOpen || G.talking) return;
  G.talking = true;
  const res = await G.request('npc:talk', { npc: id });
  G.talking = false;
  if (!res.ok || G.uiOpen) return;
  villagers.talkingTo = id;
  G.sfx.play('chat');
  openPanel('dialogue', { npc: id, res });
};
G.endTalk = () => { villagers.talkingTo = null; };

function nearestInteractable() {
  const p = G.me.position;
  let best = null, bd = Infinity;
  for (const it of interactables()) {
    const d = Math.hypot(it.x - p.x, it.z - p.z);
    if (d < it.r && d < bd) { bd = d; best = it; }
  }
  return best;
}

function harvestHint(t) {
  if (t?.tile?.tile?.c && t.tile.plotId === G.self.plotId) {
    const c = t.tile.tile.c;
    if (!c.withered && c.g >= CROPS[c.id].days) return `Panen ${CROPS[c.id].icon} ${CROPS[c.id].name}`;
  }
  if (t?.wild?.k === 'forage') return `Ambil ${ITEMS[t.wild.item].icon} ${ITEMS[t.wild.item].name}`;
  return null;
}

async function interact() {
  if (!G.me || G.uiOpen) return;
  G.sfx.ensure();
  const t = computeTarget();
  const hint = harvestHint(t);
  const it = nearestInteractable();
  if (it && !hint) return it.run();
  if (hint) {
    const res = await G.request('action', { tool: 'hand', x: t.x, z: t.z });
    if (res.ok) {
      hop(G.me);
      G.socket.emit('anim', { kind: 'hop', tool: 'hand' });
      G.sfx.play('harvest');
      if (res.msg) floatText(t.x, 1.4, t.z, res.msg, 'gold');
    }
    return;
  }
  if (it) it.run();
}

// -------------------------------------------------------------- fishing

async function fishAction() {
  if (!G.fishing) {
    if (!nearWater(G.me.position.x, G.me.position.z, 1.8)) { toast('Berdirilah di tepi kolam kota untuk memancing 🎣', 'error'); G.sfx.play('error'); return; }
    actionCooldown = 0.5;
    swing(G.me);
    const res = await G.request('fish:cast');
    if (!res.ok) return;
    const P = TOWN.pond;
    const p = G.me.position;
    const dx = P.x - p.x, dz = P.z - p.z;
    const d = Math.hypot(dx, dz);
    const bx = p.x + (dx / d) * 2.6, bz = p.z + (dz / d) * 2.6;
    G.me.rotation.y = Math.atan2(dx, dz);
    G.fishing = { state: 'wait', bx, bz, at: performance.now() + res.biteIn, start: G.me.position.clone() };
    bobber.position.set(bx, 0.1, bz);
    bobber.visible = true;
    fishLine.visible = true;
    particles.burst(bx, 0.1, bz, FX_STYLE.water);
    G.sfx.play('splash');
    fishMeter('wait');
    G.socket.emit('anim', { kind: 'fish', tool: 'rod' });
    return;
  }
  // Reel in.
  const f = G.fishing;
  const res = await G.request('fish:reel');
  endFishing();
  if (res.ok) {
    hop(G.me);
    G.sfx.play('harvest');
    particles.burst(f.bx, 0.2, f.bz, FX_STYLE.splash);
    floatText(G.me.position.x, 2.6, G.me.position.z, `${ITEMS[res.item].icon} ${res.msg}`, 'gold');
  }
}

function endFishing() {
  G.fishing = null;
  bobber.visible = false;
  fishLine.visible = false;
  fishMeter(null);
  labels.querySelector('.bite-mark')?.remove();
  G.socket?.emit('anim', { kind: 'idle', tool: 'rod' });
}

function cancelFishing(silent = false) {
  if (!G.fishing) return;
  endFishing();
  if (!silent) G.socket.timeout(5000).emit('fish:reel', {}, () => {});
}

function updateFishing(dt) {
  const f = G.fishing;
  if (!f) return;
  const now = performance.now();
  if (G.me.position.distanceTo(f.start) > 0.6) { cancelFishing(); return; }
  if (f.state === 'wait' && now >= f.at) {
    f.state = 'bite';
    fishMeter('bite');
    G.sfx.play('bite');
    labels.append(h('div', { class: 'bite-mark' }, '❗'));
  }
  if (f.state === 'bite' && now > f.at + 1500) {
    cancelFishing();
    toast('Ikannya lepas… 🐟', 'error');
    return;
  }
  const dip = f.state === 'bite' ? -0.12 + Math.sin(now / 50) * 0.06 : Math.sin(now / 400) * 0.03;
  bobber.position.y = 0.1 + dip;
  const tip = new THREE.Vector3();
  G.me.userData.toolSlot.getWorldPosition(tip);
  tip.y += 0.9;
  tip.add(new THREE.Vector3(Math.sin(G.me.rotation.y), 0, Math.cos(G.me.rotation.y)).multiplyScalar(1.1));
  fishLine.geometry.setFromPoints([tip, bobber.position]);
  const mark = labels.querySelector('.bite-mark');
  if (mark) {
    const s = project(bobber.position.x, 0.8, bobber.position.z);
    if (s) { mark.style.left = `${s[0]}px`; mark.style.top = `${s[1]}px`; }
  }
  void dt;
}

// ------------------------------------------------------------- game loop

const clock = new THREE.Clock();
let sendTimer = 0;
let lastSent = '';
let minimapTimer = 0;
let introAngle = 0;

function updateLocal(dt) {
  const me = G.me;
  let mx = 0, mz = 0;
  if (!G.uiOpen && !G.self.sleeping && document.activeElement !== $('chatInput')) {
    if (keys.has('KeyW') || keys.has('ArrowUp')) mz -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) mz += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
    if (keys.has('KeyQ')) G.cam.yaw += dt * 2;
    if (keys.has('KeyR')) G.cam.yaw -= dt * 2;
    if (keys.has('KeyZ')) G.cam.targetDist = Math.max(7, G.cam.targetDist - dt * 12);
    if (keys.has('KeyX')) G.cam.targetDist = Math.min(28, G.cam.targetDist + dt * 12);
  }
  let speed = 0;
  if (mx || mz) {
    const len = Math.hypot(mx, mz);
    mx /= len; mz /= len;
    const yaw = G.cam.yaw;
    // Camera-relative: forward is away from the camera.
    const dx = mx * Math.cos(yaw) + mz * Math.sin(yaw);
    const dz = -mx * Math.sin(yaw) + mz * Math.cos(yaw);
    speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? RUN : WALK;
    const [nx, nz] = resolveCollision(me.position.x + dx * speed * dt, me.position.z + dz * speed * dt, COL);
    const moved = Math.hypot(nx - me.position.x, nz - me.position.z);
    me.position.x = nx;
    me.position.z = nz;
    me.position.y = groundHeight(nx, nz);
    speed = moved / dt;
    const want = Math.atan2(dx, dz);
    let diff = want - me.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    me.rotation.y += diff * Math.min(1, dt * 14);
  }
  animateAvatar(me, dt, speed, !!G.fishing);
  sendTimer -= dt;
  if (sendTimer <= 0) {
    sendTimer = 0.1;
    const msg = `${me.position.x.toFixed(2)},${me.position.z.toFixed(2)},${me.rotation.y.toFixed(2)}`;
    if (msg !== lastSent) {
      lastSent = msg;
      G.socket.volatile.emit('move', { x: me.position.x, z: me.position.z, ry: me.rotation.y });
    }
  }
}

function updateRemotes(dt) {
  for (const p of G.players.values()) {
    if (p.info.id === G.self.id || !p.avatar.visible) continue;
    const a = p.avatar;
    const before = a.position.clone();
    p.target.y = groundHeight(p.target.x, p.target.z);
    a.position.lerp(p.target, Math.min(1, dt * 10));
    if (a.position.distanceTo(p.target) > 8) a.position.copy(p.target);
    let diff = p.ry - a.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    a.rotation.y += diff * Math.min(1, dt * 10);
    animateAvatar(a, dt, before.distanceTo(a.position) / Math.max(dt, 1e-3), !!p.fishing);
  }
}

function updateCamera(dt, focus) {
  const c = G.cam;
  c.dist += (c.targetDist - c.dist) * Math.min(1, dt * 6);
  const want = new THREE.Vector3(
    focus.x + Math.sin(c.yaw) * Math.cos(c.pitch) * c.dist,
    focus.y + Math.sin(c.pitch) * c.dist,
    focus.z + Math.cos(c.yaw) * Math.cos(c.pitch) * c.dist,
  );
  camera.position.lerp(want, Math.min(1, dt * 8));
  camera.lookAt(focus.x, focus.y + 0.8, focus.z);
}

function updateLabels(dt) {
  const now = performance.now();
  for (const p of G.players.values()) {
    if (!p.avatar?.visible) { p.tag.style.display = 'none'; if (p.bubble) p.bubble.style.display = 'none'; continue; }
    const pos = p.avatar.position;
    const far = camera.position.distanceTo(pos) > 55;
    const s = far ? null : project(pos.x, 2.45, pos.z);
    p.tag.style.display = s ? '' : 'none';
    if (s) { p.tag.style.left = `${s[0]}px`; p.tag.style.top = `${s[1]}px`; }
    if (p.bubble) {
      if (now > p.bubbleUntil) { p.bubble.remove(); p.bubble = null; continue; }
      const b = far ? null : project(pos.x, 2.95, pos.z);
      p.bubble.style.display = b ? '' : 'none';
      if (b) { p.bubble.style.left = `${b[0]}px`; p.bubble.style.top = `${b[1] - 8}px`; }
    }
  }
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.t += dt;
    if (f.t > 1.4) { f.el.remove(); floats.splice(i, 1); continue; }
    const s = project(f.x, f.y, f.z);
    if (s) { f.el.style.left = `${s[0]}px`; f.el.style.top = `${s[1]}px`; }
  }
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  actionCooldown = Math.max(0, actionCooldown - dt);
  const minute = currentMinute();
  let focus;
  if (G.playing && G.me) {
    updateLocal(dt);
    updateRemotes(dt);
    updateFishing(dt);
    focus = G.me.position.clone();
    updateCamera(dt, focus);
    const t = computeTarget();
    updateMarker(t);
    if (!G.uiOpen) {
      const hint = harvestHint(t);
      const it = nearestInteractable();
      showPrompt(hint || it?.label || (G.tool === 'rod' && nearWater(focus.x, focus.z, 1.8) && !G.fishing ? 'Spasi: lempar kail' : null));
    } else showPrompt(null);
    villagers.update(dt, { minute, time: G.time, me: G.me.position, project, requests: G.requests, season: SEASONS[G.time.season].id, homes: G.homes });
    updateFireworks(dt, minute);
    updateLabels(dt);
    updateClock(minute);
    minimapTimer -= dt;
    if (minimapTimer <= 0) { minimapTimer = 0.25; drawMinimap(); }
  } else {
    // Login screen: slow cinematic orbit around the village.
    introAngle += dt * 0.05;
    focus = new THREE.Vector3(0, 0, 0);
    camera.position.set(Math.sin(introAngle) * 46, 22, Math.cos(introAngle) * 46);
    camera.lookAt(0, 2, 0);
    villagers.update(dt, { minute: 10 * 60, time: G.time, me: null, project, requests: [], season: SEASONS[G.time.season].id });
  }
  const season = SEASONS[G.time.season].id;
  world.update(dt, G.playing ? minute : 10 * 60, G.time.weather, focus);
  farm.update(dt, world.time);
  particles.update(dt);
  ambience.update(dt, focus, G.time.weather, season, world.night);
  renderer.render(scene, camera);
}
frame();

// --------------------------------------------------------- login screen

let previewRunning = true;
const look = { ...defaultLook(LOOK_CHOICES.shirt[Math.floor(Math.random() * LOOK_CHOICES.shirt.length)]) };
try { Object.assign(look, JSON.parse(localStorage.getItem('bb_look') || '{}')); } catch { /* ignore */ }
$('nameInput').value = localStorage.getItem('bb_name') || '';

const pv = { renderer: new THREE.WebGLRenderer({ canvas: $('preview'), antialias: true, alpha: true }), scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(32, 260 / 300, 0.1, 50), avatar: null, rot: 0.4, drag: null };
pv.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
pv.renderer.setSize(260, 300, false);
pv.renderer.outputColorSpace = THREE.SRGBColorSpace;
pv.renderer.toneMapping = THREE.ACESFilmicToneMapping;
pv.renderer.shadowMap.enabled = true;
pv.cam.position.set(0, 1.4, 5.2);
pv.cam.lookAt(0, 0.95, 0);
pv.scene.add(new THREE.HemisphereLight(0xffffff, 0x6a8a4a, 1.4));
const pvSun = new THREE.DirectionalLight(0xffffff, 2.2);
pvSun.position.set(2, 4, 3);
pvSun.castShadow = true;
pv.scene.add(pvSun);
const pvGround = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.15, 32), new THREE.MeshStandardMaterial({ color: 0x7cbf5a, roughness: 1 }));
pvGround.position.y = -0.075;
pvGround.receiveShadow = true;
pv.scene.add(pvGround);

function rebuildPreview() {
  if (pv.avatar) pv.scene.remove(pv.avatar);
  pv.avatar = makeAvatar(look);
  setTool(pv.avatar, 'hoe');
  pv.scene.add(pv.avatar);
  hop(pv.avatar);
}

const pvWrap = document.querySelector('.preview-wrap');
pvWrap.addEventListener('pointerdown', (e) => { pv.drag = e.clientX; pvWrap.setPointerCapture(e.pointerId); });
pvWrap.addEventListener('pointermove', (e) => { if (pv.drag !== null) { pv.rot += (e.clientX - pv.drag) * 0.015; pv.drag = e.clientX; } });
pvWrap.addEventListener('pointerup', () => { pv.drag = null; });
pvWrap.addEventListener('dblclick', () => { swing(pv.avatar); });

let pvLast = performance.now();
function previewFrame() {
  if (!previewRunning) return;
  requestAnimationFrame(previewFrame);
  const now = performance.now();
  const dt = Math.min(0.05, (now - pvLast) / 1000);
  pvLast = now;
  if (pv.drag === null) pv.rot += dt * 0.5;
  pv.avatar.rotation.y = pv.rot;
  animateAvatar(pv.avatar, dt, 0);
  if (Math.random() < dt * 0.25) swing(pv.avatar);
  pv.renderer.render(pv.scene, pv.cam);
}

function buildCustomizer() {
  const box = $('customizer');
  const row = (label, content) => h('div', { class: 'custom-row' }, h('span', {}, label), content);
  const swatches = (key) => h('div', { class: 'swatches' }, LOOK_CHOICES[key].map((c) => h('div', {
    class: `swatch ${look[key] === c ? 'active' : ''}`, style: `background:${c}`,
    onclick: () => { look[key] = c; G.sfx.play('click'); buildCustomizer(); rebuildPreview(); },
  })));
  const chips = (key) => h('div', { class: 'chips' }, LOOK_CHOICES[key].map(([id, label]) => h('button', {
    type: 'button', class: `chip-opt ${look[key] === id ? 'active' : ''}`,
    onclick: () => { look[key] = id; G.sfx.play('click'); buildCustomizer(); rebuildPreview(); },
  }, label)));
  box.replaceChildren(
    row('Kulit', swatches('skin')),
    row('Rambut', swatches('hair')),
    row('Gaya rambut', chips('hairStyle')),
    row('Topi', chips('hat')),
    row('Baju', swatches('shirt')),
    row('Celana', swatches('pants')),
    h('div', { class: 'custom-row' }, h('span', {}), h('button', {
      type: 'button', class: 'btn small',
      onclick: () => {
        const r = (a) => a[Math.floor(Math.random() * a.length)];
        Object.assign(look, {
          skin: r(LOOK_CHOICES.skin), hair: r(LOOK_CHOICES.hair), hairStyle: r(LOOK_CHOICES.hairStyle)[0],
          hat: r(LOOK_CHOICES.hat)[0], shirt: r(LOOK_CHOICES.shirt), pants: r(LOOK_CHOICES.pants),
        });
        G.sfx.play('plant');
        buildCustomizer();
        rebuildPreview();
      },
    }, '🎲 Acak penampilan')),
  );
}

buildCustomizer();
rebuildPreview();
previewFrame();

$('loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  G.sfx.ensure();
  const name = $('nameInput').value.trim();
  if (name.length < 2) { $('loginError').textContent = 'Nama minimal 2 karakter.'; return; }
  $('loginError').textContent = '';
  $('joinBtn').disabled = true;
  connect(name, { ...look });
});
