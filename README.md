# 🌾 Barter Bloom

Game bertani **multiplayer 3D** bergaya *Harvest Moon* yang berjalan di browser. Bertani, beternak, memancing, mencari barang di hutan — lalu **berdagang dengan pemain lain**.

## Menjalankan

```bash
npm install
npm start            # buka http://localhost:3000
```

Bagikan alamat server (mis. `http://IP-KAMU:3000`) ke teman di jaringan yang sama untuk bermain bersama. Maksimal 8 petani (8 ladang).

| Variabel env | Default | Keterangan |
|---|---|---|
| `PORT` | `3000` | Port server |
| `DAY_SECONDS` | `600` | Lama 1 hari game (06:00–02:00) dalam detik nyata |
| `SAVE_FILE` | `data/save.json` | Lokasi file simpanan dunia (tersimpan otomatis tiap 30 detik) |

Tes logika game: `npm test`.

## Fitur

**Bertani ala Harvest Moon**
- Ladang 14×10 per pemain, penuh rumput liar, batu, dan tunggul yang harus dibersihkan.
- Alat: Cangkul, Penyiram (isi ulang di sumur/kolam), Sabit, Kapak, Palu, Pancing, Tangan.
- 12 tanaman di 3 musim (semi, panas, gugur). Satu kantong benih menanam 3×3 petak. Tanaman hanya tumbuh jika disiram; hujan menyiram otomatis; tanaman di luar musim akan layu. Beberapa bisa dipanen berulang.
- Kalender 4 musim × 28 hari, cuaca harian (cerah, hujan, badai, salju) dengan ramalan besok.
- Stamina: setiap alat memakai tenaga. Makan hasil panen/roti atau tidur untuk pulih. Begadang sampai 02:00 = pingsan.
- Ternak ayam & sapi: beri makan setiap hari, elus untuk menaikkan kasih sayang → produk premium (Telur Emas, Susu Premium).
- Memancing di kolam kota dengan mini-game timing, dan barang musiman di hutan (rebutan dengan pemain lain!).
- Peningkatan penyiram & kandang menggunakan emas + kayu + batu.

**Multiplayer & perdagangan**
- Semua pemain berbagi satu desa dan jam yang sama, saling melihat bergerak, chat dengan balon kata.
- Hari berganti saat **semua pemain online tidur** (atau otomatis pukul 02:00).
- **📦 Kotak Pengiriman** — dijual ke desa tiap pagi dengan **harga pasar dinamis**: barang yang dikirim banyak pemain turun harganya, lalu pulih perlahan. Satu barang 🔥 per hari dibayar 1,5×.
- **⚖️ Pasar Pemain** — pajang barang dengan harga sendiri; barang ditahan pasar dan penjual dibayar meski sedang offline.
- **🤝 Dagang Langsung** — tukar barang & emas secara langsung; terjadi hanya saat kedua pihak menekan *Setuju* (perubahan tawaran membatalkan persetujuan).
- Papan peringkat kekayaan.

**Tampilan**
- 3D low-poly prosedural (Three.js) tanpa aset eksternal: bayangan dinamis, siklus siang/malam dengan lampu kota & jendela menyala, bintang, bulan, awan, kolam beranimasi, tanaman bergoyang tertiup angin, pohon & tanah berubah warna tiap musim.
- Partikel untuk setiap aksi, hujan/salju, kelopak bunga (semi), daun gugur, kunang-kunang (malam musim panas).
- Karakter chibi yang bisa dikustomisasi (kulit, rambut, gaya rambut, topi, baju, celana) dengan animasi jalan, ayun alat, kedip mata, dan lompat senang.
- UI glassmorphism beranimasi, minimap, toast, teks melayang, laporan pagi, efek suara sintetis.

## Kontrol

| Tombol | Aksi |
|---|---|
| W A S D / panah | Jalan (Shift = lari) |
| Mouse | Pilih petak target di dekatmu |
| Spasi / klik kiri | Pakai alat |
| E | Interaksi (pintu, toko, kotak kirim, kandang, panen, ajak dagang) |
| 1–7 | Ganti alat |
| Q / R, klik kanan + seret | Putar kamera |
| Scroll / Z X | Zoom |
| I · M · P · H | Tas · Pasar · Pemain · Bantuan |
| Enter | Chat |

## Struktur

```
server/game.js    logika game (server-authoritative): waktu, tanaman, ternak, ekonomi, pasar, dagang
server/index.js   Express + Socket.IO, simpan otomatis
shared/defs.js    data item/tanaman/hewan, layout dunia, tabrakan (dipakai server & client)
client/js/        world (langit, kota, musim), farm (ladang & hewan), avatar (karakter),
                  models (model prosedural), fx (partikel, cuaca, suara), ui (HUD & panel), main (loop & jaringan)
test/             tes logika game (node --test)
```
