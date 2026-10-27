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
- Alat bisa ditempa jadi **Tembaga → Perak → Emas** (pakai emas + bijih logam dari batu): cangkul, penyiram & sabit mengenai 3 petak sebaris lalu 3×3 (lebih hemat stamina per petak), penyiram menampung lebih banyak air, kapak & palu makin hemat tenaga dan menghasilkan lebih banyak kayu/bijih langka, pancing menangkap ikan lebih besar.
- Rumah & kandang bisa diperbesar tukang kayu (kayu + batu + emas): rumah lebih besar = stamina maksimal naik, kandang lebih besar = muat lebih banyak ternak.

**Warga desa ala Harvest Moon**

Setiap peran penting di Harvest Moon punya padanannya di desa ini, dengan fungsi yang sama. Toko hanya buka saat pemiliknya ada di konter, dan tutup saat festival.

| Warga | Fungsi di desa | Padanan di Harvest Moon | Jam buka | Bonus di 5 ♥ |
|---|---|---|---|---|
| 🏪 Pak Darto | Toko Kelontong: benih musiman, roti, Bulu Biru | Supermarket | 08:00–18:00 | Diskon 10% |
| 📦 Mas Danu | Kurir: tiap sore mengangkut isi kotak pengiriman semua ladang; uangnya dibayar besok pagi | Pengirim hasil panen (*shipper*) | keliling ±15:30–19:30 | Kiriman yang terlambat tetap dibayar |
| ⚒️ Pak Bejo | Pandai besi: menempa alat dengan bijih tembaga/perak/emas, selesai keesokan pagi | Pandai besi | 10:00–16:00 | Tempa kilat (langsung jadi) |
| 🪚 Mas Joko 💍 | Tukang kayu: memperbesar rumah & kandang (selesai besok pagi), menjual kayu & batu | Tukang kayu | 09:00–16:00 | Biaya emas bangunan -20% |
| 🐄 Pak Jaya | Peternakan: menjual ayam, sapi & pakan | Peternakan (ranch) | 08:00–16:00 | Ternak +1 kasih sayang/hari |
| 🍲 Ayu 💍 | Kedai: makanan pemulih stamina (teh, nasi kepal, nasi goreng, soto) | Penginapan & restoran (inn) | 11:00–21:00 | Diskon 20% |
| 🩺 Dokter Raka 💍 | Klinik: periksa kesehatan gratis, jamu & ramuan pemulih | Klinik & dokter | 09:00–16:00 | Diskon obat 25% |
| 🎋 Kakek Harjo | Kepala desa: mengumumkan festival dan memandu acaranya | Wali kota (*mayor*) | — | Stamina maksimal +20 |
| 🎣 Pak Bayu | Nelayan, memancing di dermaga hampir sepanjang hari | Nelayan | — | Lebih mudah dapat ikan besar |
| 🌸 Lina 💍 | Perangkai bunga, menyiram taman bunga desa | Gadis toko bunga | — | Menyiram 9 tanamanmu tiap pagi |
| 🎀 Dewi | Cucu kepala desa yang ceria | Anak-anak desa | — | Kadang memberi hadiah pagi |
| ⚖️ Bu Ratna | Pengurus Pasar Pemain (tempat jual-beli antar pemain) | — (khusus multiplayer) | — | Hasil kiriman +5% |
| ✨ Dewi Panen | Penjaga mata air di hutan timur: terima satu persembahan sehari | Harvest Goddess | — | Buah Kekuatan di 200/500/900 poin (+10 stamina maks) |

💍 = calon pasangan.

- Setiap warga punya desain 3D sendiri, rumah/tempat kerja, dan jadwal harian yang berubah saat hujan, badai, dan hari festival. Posisi warga dihitung dari jam game yang sama di server dan semua pemain, jadi semua orang melihat warga di tempat yang sama tanpa lalu lintas jaringan tambahan.
- **Mengobrol** (E) sekali sehari menambah persahabatan; dialog bergantung waktu, cuaca, musim, tingkat hati, dan keadaan dunia (barang dicari, petani terkaya, hewan ternakmu, pemain lain).
- **Hadiah**: satu per hari. Barang kesukaan memberi banyak hati, yang dibenci mengurangi. Hari ulang tahun warga = nilai 3×. Selera yang sudah kamu temukan tercatat di panel Warga (V).
- **Hati** 0–10: hadiah dari warga di 3 & 8 hati, bonus khusus di 5 hati (lihat tabel).
- **Pesanan Warga**: tiap pagi hingga 3 warga memasang pesanan di Papan Pesanan (utara alun-alun). Petani pertama yang mengantar mendapat upah besar + hati — pemain saling berlomba atau berdagang untuk memenuhinya.
- Saat warga di dalam rumah (malam/hujan), ketuk pintunya untuk mengobrol sampai pukul 22:00.
- **Menikah**: capai 10 hati dengan calon pasangan, perbesar rumah jadi *Rumah + Dapur*, lalu berikan **Bulu Biru**. Pasangan pindah ke rumah ladangmu, menyiram halaman di sore hari, dan menyiapkan *Bekal Cinta* setiap pagi. Setiap warga hanya bisa menikah dengan satu pemain.
- **Festival** di alun-alun (lihat 📅 Kalender di panel Warga); toko tutup dan semua warga berkumpul:

| Tanggal | Festival | Acara |
|---|---|---|
| Semi 8 | 🌷 Festival Bunga | Ajak satu warga menari (+1 hati) |
| Panas 20 | 🏆 Lomba Ternak | Daftarkan ternak tersayangmu; juara (+2000G & piala) diumumkan pukul 15:00 |
| Panas 24 | 🎆 Festival Kembang Api | Menonton kembang api bersama warga pilihan |
| Gugur 13 | 🍲 Festival Panen | Masukkan bahan ke kuali besar; seluruh warga mencicipi supnya |
| Dingin 24 | ⭐ Malam Bintang | Makan malam istimewa bersama warga pilihan |

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
| E | Interaksi (bicara dengan warga, ketuk pintu, toko, kotak kirim, kandang, panen, festival, mata air Dewi, ajak dagang) |
| 1–7 | Ganti alat |
| Q / R, klik kanan + seret | Putar kamera |
| Scroll / Z X | Zoom |
| I · M · P · V · H | Tas · Pasar · Pemain · Warga · Bantuan |
| Enter | Chat |

## Struktur

```
server/game.js    logika game (server-authoritative): waktu, tanaman, ternak, ekonomi, pasar, dagang, warga,
                  toko, kurir, pandai besi, tukang kayu, pernikahan, festival, Dewi Panen
server/index.js   Express + Socket.IO, simpan otomatis
shared/defs.js    data item/tanaman/hewan, toko & jam buka, level alat & bangunan, festival, layout dunia, tabrakan
shared/villagers.js  warga: penampilan, jadwal & jalur jalan, selera hadiah, dialog, posisi deterministik
client/js/        world (langit, kota, musim), farm (ladang & hewan), avatar (karakter), villagers (warga & potret),
                  models (model prosedural), fx (partikel, cuaca, suara), ui (HUD & panel), main (loop & jaringan)
test/             tes logika game (node --test)
```
