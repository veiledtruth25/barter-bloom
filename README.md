# 🌾 Barter Bloom

Game pertanian **single player** terinspirasi *Harvest Moon: Back to Nature*, dengan visual **Cartoon / Stylized 3D** (toon shading + outline) yang berjalan di browser. Semua logika berjalan di klien; save disimpan di `localStorage` (3 slot). Server hanya menyajikan berkas statis.

> Nama kota, warga, dialog, dan model dibuat orisinal; hanya struktur permainannya yang mengikuti HM:BTN.

## Menjalankan

```bash
npm install
npm start            # http://localhost:3000
npm test             # tes logika inti
```

Docker: `docker compose up -d --build` (container `barterbloom`, port internal 3000, jaringan `evertwo-network`).

## Kontrol

| Tombol | Aksi |
|---|---|
| W A S D / panah | Jalan (Shift = lari) |
| Spasi | Pakai alat di petak depan karakter (pancing: lempar & tarik) |
| E | Interaksi: panen, rumah (tidur/masak/TV), kotak pengiriman, warung, peternakan |
| Q | Ganti alat |
| Z / X | Putar kamera 90° |
| I | Rucksack · Esc: menu & simpan |

## Status rombakan (branch `hmbtn-rewrite`)

- [x] **Tahap 1** — inti single player: kalender 4×30 hari (Senin–Minggu), cuaca + ramalan TV, stamina & kelelahan, rucksack 9 slot, save 3 slot, kamera sudut tetap, render toon/outline, cangkul & penyiram.
- [x] **Tahap 2** — 9 tanaman 3 musim (layu saat musim berganti, tanaman berulang), gulma/batu/tunggul dengan alat yang tepat, kotak pengiriman (dibayar besok), warung benih, ayam & sapi (pakan, elus, telur/susu), tambang (batu & bijih tembaga muncul ulang tiap hari), memancing (lempar → tunggu ❗ → Spasi), memasak di dapur rumah
- [ ] Tahap 3 — kota, warga, jadwal harian
- [ ] Tahap 4 — mesin event, festival, heart event
- [ ] Tahap 5 — pernikahan, anak, ending
- [ ] Tahap 6 — perapian & tes

## Struktur

```
core/      logika murni tanpa DOM/Three (kalender, cuaca, state, barang) — dites dengan node --test
client/js/ toon.js (material toon+outline, loader GLB), models.js, world.js, main.js
server/    Express statis
```

Model buatan sendiri: `loadGLB(url)` di `client/js/toon.js` mengganti material jadi toon + outline agar gayanya senada.
