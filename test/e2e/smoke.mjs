// Smoke test browser (opsional, butuh Playwright): BASE=http://localhost:3000 node test/e2e/smoke.mjs
// Memainkan alur utama lewat tombol sungguhan: tanam → siram → matangkan → panen, toko, tidur & tawaran anjing.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3000';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const fail = (msg) => { console.error('GAGAL:', msg); process.exitCode = 1; };
const check = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) fail(msg); };
const tp = (x, z) => page.evaluate(([x, z]) => __bb.farmer.position.set(x, 0, z), [x, z]);
const press = async (k, ms = 250) => { await page.keyboard.press(k); await page.waitForTimeout(ms); };
const click = async (scope, text) => { await page.locator(`${scope} .row`, { hasText: text }).first().dispatchEvent('click'); await page.waitForTimeout(250); };
const state = (fn) => page.evaluate(fn);

await page.goto(`${BASE}/?debug`, { waitUntil: 'networkidle' });
await page.click('text=Mulai Baru >> nth=0');
await page.waitForTimeout(800);

// ladang: cangkul → benih → siram
await state(() => { __bb.game.debris = {}; __bb.syncAll(); });
await tp(0.5, 3.1);
await press('s', 80); await tp(0.5, 3.1);
await press(' '); await press('q'); await press(' '); await press('q'); await press(' ');
const tile = await state(() => Object.values(__bb.game.tilled)[0]);
check(tile?.crop?.id === 'turnip' && tile.watered, 'cangkul, tanam & siram');
await state(() => { for (const t of Object.values(__bb.game.tilled)) t.crop.age = 4; __bb.syncAll(); });
await press('e', 400);
check(await state(() => __bb.game.rucksack.some((s) => s?.id === 'turnip')), 'panen ke rucksack');

// toko serba ada
await state(() => { __bb.game.minute = 12 * 60; __bb.game.date = { year: 1, season: 0, day: 1 }; });
await tp(-11, 30.2); await press('e', 500);
await click('.modal', 'Benih Lobak');
check(await state(() => __bb.game.gold) < 300, 'beli benih di toko (buka)');
await press('Escape');

// tidur → hari berganti → tawaran anjing
await tp(0, -1.5); await press('e', 500); await click('.modal', 'Tidur');
await page.waitForSelector('#dialog:not(.hidden)', { timeout: 60000 });
await click('#dialog', 'Lanjut'); await click('#dialog', 'Pochi'); await click('#dialog', 'Lanjut'); await click('#dialog', 'Lanjut');
await page.waitForTimeout(600);
check(await state(() => __bb.game.date.day) === 2 && await state(() => __bb.game.dog?.name) === 'Pochi', 'tidur: hari 2 & anjing diberi nama');

check(errors.length === 0, `tanpa error konsol${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
