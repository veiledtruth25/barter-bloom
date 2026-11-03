import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;
const CLIENT = path.join(ROOT, 'client'), CORE = path.join(ROOT, 'core');

// Game single player: seluruh logika berjalan di browser, server hanya menyajikan berkas statis.
// Versi build = hash isi client/ dan core/. Aset disajikan di /v/<build>/..., jadi tiap deploy memakai URL baru dan
// cache panjang di browser/CDN (mis. Cloudflare) tidak pernah menyajikan JS lama bersama HTML baru.
function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}
const BUILD = (() => {
  const h = crypto.createHash('sha1');
  for (const f of [...listFiles(CLIENT), ...listFiles(CORE)].sort()) h.update(path.relative(ROOT, f)).update(fs.readFileSync(f));
  return h.digest('hex').slice(0, 10);
})();
const INDEX = fs.readFileSync(path.join(CLIENT, 'index.html'), 'utf8').replaceAll('__BUILD__', BUILD);

const app = express();
const assets = { maxAge: '1y', immutable: true };
app.get(['/', '/index.html'], (_req, res) => res.set('Cache-Control', 'no-cache').type('html').send(INDEX));
app.use(`/v/${BUILD}/core`, express.static(CORE, assets));
app.use(`/v/${BUILD}`, express.static(CLIENT, assets));
app.get('/health', (_req, res) => res.json({ ok: true, build: BUILD }));

app.listen(PORT, () => console.log(`🌾 Barter Bloom berjalan di http://localhost:${PORT} (build ${BUILD})`));
