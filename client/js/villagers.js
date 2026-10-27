// Client-side villagers: 3D avatars that follow the shared schedule, plus portraits.
import * as THREE from 'three';
import { VILLAGERS, VILLAGER_IDS, SPOTS, HOUSES, GODDESS, npcState, dayIndexOf, isBirthday } from '/shared/villagers.js';
import { TOWN } from '/shared/defs.js';
import { makeAvatar, animateAvatar, setTool } from './avatar.js';
import { h } from './ui.js';

const POSE_TOOL = { fish: 'rod', chop: 'axe', water: 'can' };
const TAG_RANGE = 18;

export class Villagers {
  constructor(scene, labels) {
    this.list = new Map();
    for (const id of VILLAGER_IDS) {
      const def = VILLAGERS[id];
      const avatar = makeAvatar(def.look);
      avatar.visible = false;
      scene.add(avatar);
      const tag = h('div', { class: 'nametag npc', style: `--c:${def.color}` });
      labels.append(tag);
      this.list.set(id, {
        id, def, avatar, tag, bubble: null, bubbleUntil: 0, nextAmbient: 6 + Math.random() * 20,
        state: null, placed: false, tagKey: '',
      });
    }
    this.talkingTo = null;
    this.facing = null;
  }

  stateOf(id) { return this.list.get(id)?.state; }

  // ctx: { minute, time, me, project, requests, season, homes: { villagerId: plotId } }
  update(dt, ctx) {
    const day = dayIndexOf(ctx.time);
    this.updateGoddess(dt, ctx.me);
    for (const n of this.list.values()) {
      const s = npcState(n.id, ctx.minute, ctx.time.weather, ctx.time.rate, day, ctx.homes?.[n.id] ?? null);
      n.state = s;
      const a = n.avatar;
      const talking = this.talkingTo === n.id;
      // Far-away villagers are not drawn at all.
      const far = ctx.me && Math.hypot(s.x - ctx.me.x, s.z - ctx.me.z) > 75;
      if (s.hidden || far) {
        // Indoors (a knock on the door talks through it).
        a.visible = false;
        n.placed = false;
      } else {
        if (!n.placed) {
          a.position.set(s.x, s.y, s.z);
          a.rotation.y = s.ry;
          n.placed = true;
        }
        a.visible = true;
        let speed = 0;
        if (!talking) {
          // Follow the scheduled position; after a chat, hurry to catch up with the schedule.
          const dx = s.x - a.position.x, dz = s.z - a.position.z;
          const d = Math.hypot(dx, dz);
          const catchUp = d > 1.5;
          if (d > 30) a.position.set(s.x, s.y, s.z);
          else if (d > 0.001) {
            const v = catchUp ? Math.max(7, s.speed) : s.speed;
            const step = Math.min(d, v * dt + (catchUp ? 0 : d * Math.min(1, dt * 5)));
            a.position.x += (dx / d) * step;
            a.position.z += (dz / d) * step;
            speed = catchUp ? v : s.moving ? s.speed : 0;
          }
          a.position.y += (s.y - a.position.y) * Math.min(1, dt * 8);
          turnToward(a, catchUp ? Math.atan2(dx, dz) : s.ry, dt);
        } else if (ctx.me) {
          turnToward(a, Math.atan2(ctx.me.x - a.position.x, ctx.me.z - a.position.z), dt);
        }
        let pose = talking ? 'idle' : s.pose;
        if (pose === 'water' && ctx.season === 'winter') pose = 'idle';
        setTool(a, speed > 0.3 ? null : POSE_TOOL[pose] || null);
        animateAvatar(a, dt, speed, pose === 'walk' ? false : pose);
      }
      this.updateLabel(n, ctx, dt);
    }
  }

  updateLabel(n, ctx, dt) {
    const a = n.avatar;
    const me = ctx.me;
    const near = me && a.visible && Math.hypot(a.position.x - me.x, a.position.z - me.z) < TAG_RANGE;
    const scale = n.def.look.scale || 1;
    const top = a.position.y + (n.state?.pose === 'sit' ? 2.0 : 2.45) * scale;
    const s = near ? ctx.project(a.position.x, top, a.position.z) : null;
    n.tag.style.display = s ? '' : 'none';
    if (s) {
      n.tag.style.left = `${s[0]}px`;
      n.tag.style.top = `${s[1]}px`;
      const req = ctx.requests?.some((q) => q.npc === n.id && !q.doneBy);
      const bday = isBirthday(n.id, ctx.time);
      const key = `${req}|${bday}`;
      if (key !== n.tagKey) {
        n.tagKey = key;
        const parts = [h('span', { class: 'npc-icon' }, n.def.icon), n.def.name];
        if (req) parts.push(h('span', { class: 'npc-mark req', title: 'Punya pesanan' }, '!'));
        if (bday) parts.push(h('span', { class: 'npc-mark', title: 'Ulang tahun' }, '🎂'));
        n.tag.replaceChildren(...parts);
      }
    }
    // Small talk bubbles when the player walks by.
    n.nextAmbient -= dt;
    const close = me && a.visible && this.talkingTo !== n.id && Math.hypot(a.position.x - me.x, a.position.z - me.z) < 7;
    if (close && n.nextAmbient <= 0) {
      n.nextAmbient = 25 + Math.random() * 25;
      const lines = n.def.talk.ambient;
      this.say(n.id, lines[Math.floor(Math.random() * lines.length)], 3500);
    }
    if (n.bubble) {
      const b = s && performance.now() < n.bubbleUntil ? s : null;
      if (performance.now() > n.bubbleUntil || !a.visible) {
        n.bubble.remove();
        n.bubble = null;
      } else {
        n.bubble.style.display = b ? '' : 'none';
        if (b) {
          n.bubble.style.left = `${b[0]}px`;
          n.bubble.style.top = `${b[1] - 26}px`;
        }
      }
    }
  }

  say(id, text, ms = 4000) {
    const n = this.list.get(id);
    if (!n) return;
    n.bubble?.remove();
    n.bubble = h('div', { class: 'bubble npc' }, text);
    n.tag.parentElement.append(n.bubble);
    n.bubbleUntil = performance.now() + ms;
  }

  // Nearest visible villager within range of (x, z).
  nearest(x, z, range = 2.6) {
    let best = null, bd = range;
    for (const n of this.list.values()) {
      if (!n.avatar.visible || n.state?.hidden) continue;
      const d = Math.hypot(n.avatar.position.x - x, n.avatar.position.z - z);
      if (d < bd) { bd = d; best = n.id; }
    }
    return best;
  }

  // Doors the player can knock on: { house, x, z, ids } (ids = villagers inside).
  doors() {
    const out = [];
    const inside = (spot) => VILLAGER_IDS.filter((id) => this.list.get(id).state?.hidden && this.list.get(id).state.spot === spot);
    for (const [key, house] of Object.entries(HOUSES)) {
      if (house.noKnock) continue;
      const [x, z] = SPOTS[house.spot].pos;
      out.push({ house: key, name: house.name, x, z, ids: inside(house.spot) });
    }
    // Farmhouses where a married villager lives.
    for (const n of this.list.values()) {
      const plot = SPOTS[n.state?.spot]?.plot;
      if (n.state?.hidden && plot !== undefined && !out.some((d) => d.house === `plot${plot}`)) {
        const [x, z] = SPOTS[`plotHome${plot}`].pos;
        out.push({ house: `plot${plot}`, name: 'Rumah ladang', x, z, ids: inside(`plotHome${plot}`), plot });
      }
    }
    return out;
  }

  // The Harvest Goddess rises from her spring when called or given an offering.
  // `hold` keeps her above the water until releaseGoddess() (while you talk to her).
  showGoddess(scene, hold = false) {
    if (!this.goddess) {
      this.goddess = makeAvatar(GODDESS.look);
      scene.add(this.goddess);
    }
    const g = this.goddess;
    const u = g.userData;
    if (hold) this.goddessHold = true;
    if (g.visible && u.appear < 8) {
      // Already up: just stay a while longer.
      u.appear = Math.min(u.appear, 1.6);
      return;
    }
    g.visible = true;
    g.position.set(TOWN.spring.x, -1.6, TOWN.spring.z);
    g.rotation.y = 0;
    u.appear = 0;
  }

  releaseGoddess() {
    this.goddessHold = false;
    const g = this.goddess;
    // Sink back into the spring shortly after the conversation ends.
    if (g?.visible) g.userData.appear = Math.max(g.userData.appear, 7);
  }

  updateGoddess(dt, me) {
    const g = this.goddess;
    if (!g?.visible) return;
    const u = g.userData;
    u.appear += dt;
    if (this.goddessHold) u.appear = Math.min(u.appear, 2);
    const rise = Math.min(1, u.appear / 1.6);
    const sink = Math.max(0, (u.appear - 8) / 1.6);
    g.position.y = -1.6 + (rise - sink) * 1.9 + Math.sin(u.appear * 2) * 0.08;
    if (me && Math.hypot(me.x - g.position.x, me.z - g.position.z) < 14) {
      turnToward(g, Math.atan2(me.x - g.position.x, me.z - g.position.z), dt);
    }
    animateAvatar(g, dt, 0, 'idle');
    if (sink >= 1) g.visible = false;
  }

  locationLabel(id) {
    const s = this.list.get(id)?.state;
    if (!s) return '';
    return s.moving ? 'Sedang berjalan' : SPOTS[s.spot].label;
  }
}

function turnToward(a, want, dt) {
  let diff = want - a.rotation.y;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  a.rotation.y += diff * Math.min(1, dt * 8);
}

// Renders a head-and-shoulders portrait of every villager (and the goddess) once.
export function renderPortraits() {
  const size = 192;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const out = {};
  let r;
  try {
    r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return out;
  }
  r.setSize(size, size, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a5a, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(1.5, 2.5, 3);
  scene.add(key);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  for (const id of [...VILLAGER_IDS, 'goddess']) {
    const look = id === 'goddess' ? GODDESS.look : VILLAGERS[id].look;
    const av = makeAvatar(look);
    animateAvatar(av, 0.016, 0, 'idle');
    av.userData.eyes.scale.y = 1;
    scene.add(av);
    const s = look.scale || 1;
    const headY = (1.47 + 0.04) * s;
    cam.position.set(0.45 * s, headY + 0.06 * s, 1.75 * s);
    cam.lookAt(0, headY - 0.06 * s, 0);
    r.render(scene, cam);
    out[id] = canvas.toDataURL('image/png');
    scene.remove(av);
  }
  r.dispose();
  r.forceContextLoss();
  return out;
}
