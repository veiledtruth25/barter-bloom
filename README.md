# 🌾 Barter Bloom

Game pertanian **single player** terinspirasi *Harvest Moon: Back to Nature*, tampil **2.5D**: kamera tetap miring dengan perspektif (tidak bisa diputar), karakter & benda berdiri tegak dan bergerak mengikuti kotak. Digambar dengan Canvas 2D di browser. (Versi Stylized 3D lama ada di riwayat git, commit `4f77f7d`.) Semua logika di klien, save di `localStorage` (3 slot); server hanya menyajikan berkas statis.

> Struktur permainan (kalender, stamina, festival, heart event, pernikahan, dll.) mengikuti HM:BTN, tetapi nama kota, warga, dialog, dan model 3D dibuat orisinal.

## Menjalankan

```bash
npm install
npm start            # http://localhost:3000   (env PORT mengubah port)
npm test             # 39 tes logika inti (node --test)
npm run smoke        # smoke test browser (butuh Playwright; BASE=http://localhost:3000)
```

**Docker** (di belakang Nginx Proxy Manager): `docker compose up -d --build`
- container `barterbloom`, port internal **3000**, jaringan eksternal `evertwo-network`
- port host hanya `127.0.0.1:7474` untuk uji lokal; user non-root; healthcheck `GET /`
- tidak perlu volume: save ada di browser pemain
- game tidak lagi memakai websocket (single player), jadi dukungan websocket di proxy tidak diperlukan

## Kontrol

| Tombol | Aksi |
|---|---|
| W A S D / panah | Jalan 4 arah mengikuti kotak (Shift = lari) |
| Spasi | Pakai alat di petak tepat di depan karakter (pancing: lempar & tarik); lanjut dialog |
| E | Interaksi: panen, rumah, kotak pengiriman, toko, warga, hewan, anjing, anak |
| Q | Ganti alat |
| I · V · M | Rucksack · Warga & Rapor Desa · Suara on/off |
| Esc | Tutup menu / menu utama (menyimpan) |

## Isi game

**Pertanian** — kalender 4 musim × 30 hari (Senin–Minggu), cuaca + ramalan TV, stamina & kelelahan, rucksack 9 slot. 9 tanaman 3 musim (tumbuh bila disiram, hujan menyiram, layu saat ganti musim, sebagian berbuah berulang). Gulma/batu/tunggul butuh sabit/palu/kapak. Kotak pengiriman (dibayar besok). Ayam & sapi (pakan, elus, telur/susu). Tambang batu & bijih tembaga yang muncul ulang. Memancing (lempar → tunggu ❗ → Spasi). Memasak di dapur rumah.

**Desa** — jalan, alun-alun, 6 toko dengan jam buka & hari tutup, 11 warga berjadwal harian (jam, hari, cuaca). Ngobrol & hadiah sekali sehari, selera hadiah, hati ungu→merah. Pandai besi menaikkan level alat; tukang kayu memperbesar rumah.

**Event** — 7 festival (Bunga, Memasak, Ternak, Kembang Api, Panen, Malam Bintang, Tahun Baru; cerah, toko tutup, warga ke alun-alun) dan 10 heart event berpilihan, dimainkan lewat mesin event berbasis generator.

**Keluarga** — 5 calon pasangan, lamaran dengan Bulu Biru, pernikahan, pasangan membantu di ladang, anak yang tumbuh, anjing, rapor & ending di awal tahun ke-3 (game bisa dilanjutkan).

**Visual** — kamera perspektif tetap, karakter chibi 4 arah, bayangan lembut, siklus siang/malam, hujan/salju, efek suara sintetis. Semua sprite digambar prosedural di `client/js/render.js` sehingga mudah diganti dengan gambar sendiri.

## Struktur

```
core/      logika murni tanpa DOM/Three — dites dengan node --test
  calendar.js  kalender, cuaca, jadwal festival      villagers.js  warga, jadwal, toko, hati, hadiah
  farm.js      ladang, hewan, ikan, masak, alat      events.js     mesin event (festival, heart, keluarga)
  family.js    rumah, lamaran, anak, anjing, ending  state.js      state game, tidur, simpan, pembungkus API
  items.js     data barang
client/js/ render.js (proyeksi perspektif + sprite), world.js (peta, tabrakan), vec.js, sfx.js, main.js
server/    Express statis (client/, core/)
test/      core.test.js (logika) · e2e/smoke.mjs (browser)
```

Cara menambah konten: warga → `core/villagers.js` (+ gedung di `client/js/world.js`), heart event/festival → `core/events.js` (satu generator), barang/tanaman → `core/items.js`.

## Keterbatasan yang diketahui

- Warga berjalan lurus ke tujuan dengan tabrakan sederhana (belum ada pathfinding).
- Tampilan masih sprite prosedural, belum seperti render realistis; ganti dengan aset gambar/3D sendiri bila perlu.
- Event berbentuk kotak dialog tanpa kamera/animasi sinematik; dialog masih ringkas.
- Tambang berupa petak di luar desa, bukan gua bertingkat; alat hanya sampai level tembaga.
- Belum ada musik, kontrol sentuh/gamepad, atau penyesuaian grafis.
- Save di `localStorage` (hilang bila data browser dihapus); tidak ada sinkronisasi antarperangkat.
