import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;

// Game single player: seluruh logika berjalan di browser, server hanya menyajikan berkas statis.
const app = express();
app.use(express.static(path.join(ROOT, 'client')));
app.use('/core', express.static(path.join(ROOT, 'core')));
app.use('/vendor/three', express.static(path.join(ROOT, 'node_modules', 'three')));
app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`🌾 Barter Bloom berjalan di http://localhost:${PORT}`));
