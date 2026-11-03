import { dayIndex, festivalOn, FESTIVAL_DAYS } from './calendar.js';
import { ITEMS, CROPS } from './items.js';
import { VILLAGERS, locationOf, addFriendship, friendship, HEART_AT } from './villagers.js';
import { marry, weddingDue, computeEnding, HOUSE_LEVELS } from './family.js';

// Mesin event: tiap event adalah generator yang mengeluarkan "node" untuk ditampilkan klien dan menerima jawaban pemain.
//   { type:'say', who, text }            -> lanjut (jawaban diabaikan)
//   { type:'choice', prompt, options }   -> jawaban: indeks pilihan
//   { type:'person', prompt, ids }       -> jawaban: id warga
//   { type:'item', prompt, items }       -> jawaban: id barang, atau null untuk batal
//   { type:'animal', prompt, options }   -> jawaban: indeks hewan
// Hasil akhir generator (string) menjadi pesan penutup.
export const say = (who, text) => ({ type: 'say', who, text });
export const ask = (prompt, options) => ({ type: 'choice', prompt, options });
const pickPerson = (prompt, ids) => ({ type: 'person', prompt, ids });
const pickItem = (prompt, items) => ({ type: 'item', prompt, items });
const pickAnimal = (prompt, options) => ({ type: 'animal', prompt, options });

const done = (g) => (g.flags.done ||= {});
const name = (id) => VILLAGERS[id].name;
const hash = (g, salt) => { let h = (dayIndex(g.date) * 2654435761 + salt) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; return (h >>> 0) % 100; };

// ---- festival --------------------------------------------------------------
export function festivalActive(g) {
  const id = festivalOn(g.date);
  if (!id) return null;
  const f = FESTIVAL_DAYS[id];
  if (g.minute < f.from || g.minute >= f.to || done(g)[`fest:${id}:${g.date.year}`]) return null;
  return id;
}

const everyone = Object.keys(VILLAGERS);
const bachelorettes = Object.entries(VILLAGERS).filter(([, v]) => v.bachelorette).map(([id]) => id);

const FESTIVALS = {
  * flower(g) {
    yield say('Kakek Harjo', 'Selamat datang di Festival Bunga! Musim semi datang, dan saatnya menari bersama!');
    const partner = yield pickPerson('Ajak siapa menari?', everyone);
    addFriendship(g, partner, 12 + (bachelorettes.includes(partner) ? 8 : 0));
    yield say(name(partner), 'Wah, aku senang sekali! Ayo menari sampai sore!');
    return `Kamu menari bersama ${name(partner)}. (+hati)`;
  },
  * cooking(g, bag) {
    yield say('Kakek Harjo', 'Kontes Memasak dimulai! Bawa masakan terbaikmu, juri akan menilai rasanya.');
    const dishes = bag.dishes(g);
    if (!dishes.length) return 'Kamu tidak membawa masakan, jadi hanya jadi penonton.';
    const dish = yield pickItem('Pilih masakanmu', dishes);
    if (!dish) return 'Kamu mengurungkan niat dan menonton saja.';
    bag.removeItem(g, dish, 1);
    const mine = ITEMS[dish].sell + hash(g, 1) % 40;
    const rivals = [['Ayu', 190 + hash(g, 2) % 30], ['Lina', 130 + hash(g, 3) % 40], ['Pak Darto', 150 + hash(g, 4) % 40]];
    const rank = 1 + rivals.filter(([, s]) => s > mine).length;
    const prize = [0, 1500, 600, 300, 150][rank];
    g.gold += prize;
    yield say('Kakek Harjo', rank === 1 ? `Juara pertama: ${g.name}! Masakanmu luar biasa!` : `Juara pertama adalah ${rivals.sort((a, b) => b[1] - a[1])[0][0]}. Kamu di peringkat ${rank}.`);
    return `Peringkat ${rank}. Hadiah ${prize} G.`;
  },
  * livestock(g) {
    yield say('Kakek Harjo', 'Lomba Ternak! Tunjukkan hewan paling sehat dan paling sayang pada tuannya.');
    if (!g.animals.length) return 'Kamu tidak punya hewan ternak.';
    const i = yield pickAnimal('Ikutkan hewan yang mana?', g.animals.map((a, idx) => ({ i: idx, label: `${a.type === 'cow' ? '🐄 Sapi' : '🐔 Ayam'} ${idx + 1} ♥${a.love}` })));
    const score = g.animals[i].love * 10 + (g.animals[i].fed ? 5 : 0);
    const win = score > 65;
    g.gold += win ? 2000 : 300;
    yield say('Kakek Harjo', win ? 'Juara satu! Hewanmu terlihat sangat bahagia.' : 'Bagus sekali, tapi masih ada yang lebih disayang pemiliknya.');
    return win ? 'Juara! +2000 G' : 'Hiburan +300 G (sayangi hewanmu lebih banyak!)';
  },
  * fireworks(g) {
    yield say('Kakek Harjo', 'Malam yang indah. Kembang api akan segera dimulai!');
    const partner = yield pickPerson('Menonton bersama siapa?', everyone);
    addFriendship(g, partner, 10 + (bachelorettes.includes(partner) ? 10 : 0));
    yield say(name(partner), 'Cantik sekali… terima kasih sudah mengajakku.');
    return `Kamu menonton kembang api bersama ${name(partner)}.`;
  },
  * harvest(g, bag) {
    yield say('Kakek Harjo', 'Festival Panen! Masukkan hasil panenmu ke kuali besar. Semakin berharga, semakin lezat supnya.');
    let total = 0, n = 0;
    while (n < 3) {
      const crops = bag.crops(g);
      if (!crops.length) break;
      const c = yield pickItem(`Masukkan bahan (${n}/3)`, crops);
      if (!c) break;
      bag.removeItem(g, c, 1); total += ITEMS[c].sell; n++;
    }
    const tier = total >= 400 ? 3 : total >= 150 ? 2 : 1;
    g.gold += [0, 300, 800, 1500][tier];
    for (const id of everyone) addFriendship(g, id, tier);
    yield say('Kakek Harjo', tier === 3 ? 'Supnya luar biasa! Semua warga bersorak untukmu!' : 'Semua warga menikmati supnya. Terima kasih!');
    return `Nilai bahan ${total}. Hadiah ${[0, 300, 800, 1500][tier]} G, semua warga +${tier} poin.`;
  },
  * stars(g) {
    yield say('Kakek Harjo', 'Malam Bintang. Menurut cerita, bintang jatuh membawa keberuntungan bagi yang makan bersama orang tersayang.');
    const partner = yield pickPerson('Makan malam bersama siapa?', everyone);
    addFriendship(g, partner, 15 + (bachelorettes.includes(partner) ? 15 : 0));
    yield say(name(partner), 'Langit malam ini cerah sekali. Terima kasih sudah menemaniku.');
    return `Makan malam bersama ${name(partner)}.`;
  },
  * newyear(g) {
    yield say('Kakek Harjo', 'Tahun baru sebentar lagi. Terima kasih sudah bekerja keras tahun ini!');
    g.gold += 100;
    return 'Kamu menerima angpao 100 G. Selamat tahun baru!';
  },
};

// ---- heart event -----------------------------------------------------------
const HEART_EVENTS = {
  ayu_1: { who: 'ayu', level: 1, place: 'inn', from: 11 * 60, to: 20 * 60, * run(g) {
    yield say('Ayu', 'Oh! Kamu datang tepat waktu. Tolong cicipi sup percobaanku… tapi jujur, ya.');
    const c = yield ask('Bagaimana rasanya?', ['Enak sekali!', 'Hmm, agak gosong…', 'Boleh aku bantu masak?']);
    if (c === 0) { addFriendship(g, 'ayu', 5); yield say('Ayu', 'Benarkah? …Hehe, kamu baik. Tapi aku tahu ini gosong.'); }
    else if (c === 1) { addFriendship(g, 'ayu', 12); yield say('Ayu', 'Terima kasih sudah jujur! Dengan begitu aku bisa jadi lebih baik.'); }
    else { addFriendship(g, 'ayu', 18); yield say('Ayu', 'Kamu mau membantu? Ayo, aku ajari kamu mengaduk yang benar!'); }
    return 'Kenangan baru bersama Ayu.';
  } },
  ayu_2: { who: 'ayu', level: 2, place: 'inn', from: 11 * 60, to: 20 * 60, * run(g) {
    yield say('Ayu', 'Kedai ramai sekali hari ini… aku kewalahan. Maaf, aku jadi cemberut.');
    const c = yield ask('Apa yang kamu lakukan?', ['Mengantar pesanan', 'Menyuruhnya istirahat', 'Pura-pura tidak lihat']);
    addFriendship(g, 'ayu', [20, 14, -6][c]);
    yield say('Ayu', ['Kamu menyelamatkanku hari ini! Terima kasih banyak.', 'Kamu benar. Aku butuh napas sebentar.', '…Oh. Baiklah.'][c]);
    return 'Ayu terlihat lebih lega.';
  } },
  lina_1: { who: 'lina', level: 1, place: 'flower', from: 10 * 60, to: 17 * 60, * run(g) {
    yield say('Lina', 'Pot bunga ini jatuh dan pecah… padahal ini bibit kesayanganku.');
    const c = yield ask('Katamu?', ['Aku ganti dengan pot baru', 'Bibitnya masih bisa ditanam ulang', 'Beli saja yang baru']);
    addFriendship(g, 'lina', [16, 20, -4][c]);
    yield say('Lina', ['Kamu baik hati sekali…', 'Betul juga! Akarnya masih utuh. Terima kasih!', 'Bukan soal harganya, tapi kenangannya…'][c]);
    return 'Bibit Lina selamat.';
  } },
  lina_2: { who: 'lina', level: 2, place: 'plaza', days: [5], from: 17 * 60, to: 19 * 60, * run(g) {
    yield say('Lina', 'Dulu aku tidak punya taman. Sekarang seluruh alun-alun adalah tamanku. Indah ya?');
    const c = yield ask('Katamu?', ['Taman terindah yang pernah kulihat', 'Tamannya kurang bunga biru', 'Aku suka melihatmu bahagia']);
    addFriendship(g, 'lina', [10, 3, 22][c]);
    yield say('Lina', ['Kamu membuatku malu…', 'Bunga biru? Ide bagus, kutanam musim depan!', 'Aku juga… senang kamu ada di sini.'][c]);
    return 'Sore yang hangat bersama Lina.';
  } },
  maya_1: { who: 'maya', level: 1, place: 'plaza', from: 13 * 60, to: 18 * 60, * run(g) {
    yield say('Maya', 'Hei petani! Balapan lari sampai sumur! Yang kalah traktir susu!');
    const c = yield ask('Terima tantangan?', ['Ayo!', 'Aku capek hari ini', 'Boleh, tapi aku mengalah']);
    addFriendship(g, 'maya', [18, 2, 8][c]);
    yield say('Maya', ['Hahaha! Kamu cepat juga!', 'Yah… padahal seru. Lain kali ya.', 'Jangan mengalah! Aku mau menang adil!'][c]);
    return 'Balapan singkat dengan Maya.';
  } },
  maya_2: { who: 'maya', level: 2, place: 'farm_road', days: [6], from: 10 * 60, to: 12 * 60, * run(g) {
    yield say('Maya', 'Aku sengaja jalan ke arah ladangmu… eh, kebetulan saja kok!');
    const c = yield ask('Katamu?', ['Mau lihat ladangku?', 'Kebetulan yang bagus', 'Kamu tersesat?']);
    addFriendship(g, 'maya', [22, 16, 0][c]);
    yield say('Maya', ['Mau! …Maksudku, boleh juga.', 'Ehehe… iya, kebetulan banget.', 'Aku nggak tersesat! Hmph.'][c]);
    return 'Maya pipinya memerah.';
  } },
  harjo_1: { who: 'harjo', level: 1, place: 'plaza', from: 9 * 60, to: 12 * 60, * run(g, bag) {
    yield say('Kakek Harjo', 'Anak muda, tahukah kamu siapa pemilik ladang itu sebelum kamu? Sahabat lamaku.');
    yield say('Kakek Harjo', 'Dia selalu bilang: tanah itu tak pernah bohong. Kamu rawat, dia balas. Ambil ini sebagai bekal.');
    bag.addItem(g, 'herb', 2); addFriendship(g, 'harjo', 10);
    return 'Kamu menerima 2 Jamu dari Kakek Harjo.';
  } },
  bejo_1: { who: 'bejo', level: 1, place: 'smith', from: 10 * 60, to: 16 * 60, * run(g, bag) {
    yield say('Pak Bejo', 'Hmm. Cangkulmu itu, lihat mata besinya. Kamu mengasahnya salah.');
    const c = yield ask('Katamu?', ['Ajari aku, Pak!', 'Ah, tidak apa-apa', 'Bapak yang salah!']);
    addFriendship(g, 'bejo', [20, 4, -10][c]);
    if (c === 0) { bag.addItem(g, 'copper', 1); yield say('Pak Bejo', 'Begini caranya. Nih, sisa bijih untukmu. Jangan sia-siakan.'); }
    else yield say('Pak Bejo', ['', 'Terserah.', 'Hmph. Anak zaman sekarang.'][c]);
    return c === 0 ? 'Kamu belajar mengasah alat dan dapat 1 Bijih Tembaga.' : 'Pak Bejo menggeleng.';
  } },
};

HEART_EVENTS.sari_1 = { who: 'sari', level: 1, place: 'plaza', from: 10 * 60, to: 12 * 60, * run(g) {
  yield say('Sari', 'Oh… maaf, aku sedang membaca sambil berjalan. Kamu pernah baca buku tentang awan?');
  const c = yield ask('Katamu?', ['Ceritakan padaku', 'Aku lebih suka praktik langsung', 'Buku itu membosankan']);
  addFriendship(g, 'sari', [20, 8, -8][c]);
  yield say('Sari', ['Benarkah mau dengar? …Jadi begini, awan itu…', 'Hehe, itu juga benar. Tanah tidak ada di buku.', '…Begitu.'][c]);
  return 'Pagi yang tenang bersama Sari.';
} };
HEART_EVENTS.nina_1 = { who: 'nina', level: 1, place: 'pond', from: 8 * 60, to: 16 * 60, * run(g) {
  yield say('Nina', 'Jangan bergerak! Cahaya di kolam ini sempurna. Tahan sebentar saja!');
  const c = yield ask('Apa kata kamu?', ['Berpose', 'Mengintip lukisannya', 'Melanjutkan memancing']);
  addFriendship(g, 'nina', [16, 14, 4][c]);
  yield say('Nina', ['Sempurna! Kamu modelku sekarang!', 'Eh, belum selesai! …Tapi bagaimana menurutmu?', 'Ya sudah, kamu jadi latar belakang saja.'][c]);
  return 'Nina melukis pemandangan kolam.';
} };

export const HEART_EVENT_IDS = Object.keys(HEART_EVENTS);

// Event yang memenuhi syarat bila pemain berada di dekat `nearPlace` sekarang.
export function eligibleHeartEvent(g, nearPlace) {
  const wd = dayIndex(g.date) % 7;
  for (const [id, e] of Object.entries(HEART_EVENTS)) {
    if (done(g)[`heart:${id}`] || e.place !== nearPlace) continue;
    if (g.minute < e.from || g.minute >= e.to) continue;
    if (e.days && !e.days.includes(wd)) continue;
    if (festivalOn(g.date)) continue;
    if (friendship(g, e.who) < HEART_AT[e.level]) continue;
    if (locationOf(e.who, g) !== e.place) continue;
    return id;
  }
  return null;
}

// ---- keluarga: pernikahan, anjing, kelahiran, rumah, ending -----------------------------
const DOG_NAMES = ['Pochi', 'Bruno', 'Kiko'], BABY_NAMES = ['Bima', 'Laras', 'Raya'];
const FAMILY_EVENTS = {
  * wedding(g) {
    const sp = VILLAGERS[g.spouse.id];
    yield say('Kakek Harjo', 'Hadirin sekalian, hari ini kita menyaksikan dua hati menyatu di desa kecil kita.');
    yield say(sp.name, `${g.name}… aku tidak menyangka hari ini benar-benar datang. Aku bahagia sekali.`);
    yield say('Kakek Harjo', 'Dengan restu seluruh warga, kalian kini resmi menjadi suami istri. Selamat!');
    marry(g); addFriendship(g, g.spouse.id, 20);
    for (const id of Object.keys(VILLAGERS)) if (id !== g.spouse.id) addFriendship(g, id, 3);
    g.minute = Math.max(g.minute, 16 * 60);
    return `${sp.name} kini tinggal di rumahmu. Ia akan membantu menyiram tanaman tiap pagi!`;
  },
  * dog(g) {
    yield say('', 'Pagi ini ada anak anjing kecil yang meringkuk di depan pintu rumahmu. Ia mengibas-ngibaskan ekor.');
    const i = yield ask('Beri nama anjing itu:', DOG_NAMES);
    g.dog = { name: DOG_NAMES[i], love: 0, petted: false };
    yield say(DOG_NAMES[i], 'Guk! Guk!');
    return `${DOG_NAMES[i]} kini tinggal di ladangmu. Elus tiap hari agar ia makin akrab.`;
  },
  * birth(g) {
    const sp = VILLAGERS[g.spouse.id];
    yield say('Dokter Raka', 'Selamat! Persalinannya lancar. Bayinya sehat dan cantik/tampan sekali.');
    yield say(sp.name, 'Lihat, jemarinya mungil sekali… Mau beri nama siapa?');
    const i = yield ask('Beri nama anak kalian:', BABY_NAMES);
    g.child = { name: BABY_NAMES[i], born: dayIndex(g.date) };
    for (const id of ['harjo', 'dewi', 'raka']) addFriendship(g, id, 5);
    return `${BABY_NAMES[i]} lahir! Seluruh warga turut bahagia.`;
  },
  * house(g) {
    yield say('Mas Joko', `Rumahmu sudah selesai: ${HOUSE_LEVELS[g.house].name}. Silakan lihat-lihat!`);
    return 'Rumahmu telah diperbesar.';
  },
  * ending(g) {
    const r = computeEnding(g);
    yield say('Kakek Harjo', 'Tiga tahun sudah berlalu sejak kamu tiba di desa ini. Mari lihat apa yang telah kamu capai.');
    for (const c of r.cats) yield say('Rapor Desa', `${c.label}: ${c.points}/${c.max} — ${c.note}`);
    yield say('Kakek Harjo', `Nilai akhirmu ${r.score}/${r.max}. Gelarmu: ${r.rank}!`);
    return 'Terima kasih sudah bermain. Kamu boleh terus menikmati kehidupan di desa.';
  },
};

export function eligibleFamilyEvent(g, nearPlace) {
  if (nearPlace === 'plaza' && g.spouse && weddingDue(g) && g.minute >= 10 * 60 && g.minute < 16 * 60 && !festivalOn(g.date)) return 'wedding';
  return null;
}

// ---- runner -----------------------------------------------------------------
export function startEvent(g, kind, id, bag) {
  const key = kind === 'festival' ? `fest:${id}:${g.date.year}` : kind === 'family' ? `fam:${id}${id === 'birth' || id === 'house' ? `:${dayIndex(g.date)}` : ''}` : `heart:${id}`;
  if (done(g)[key]) return null;
  done(g)[key] = true;
  const gen = kind === 'festival' ? FESTIVALS[id](g, bag) : kind === 'family' ? FAMILY_EVENTS[id](g, bag) : HEART_EVENTS[id].run(g, bag);
  return { gen, kind, id, started: false, end(text) { if (kind === 'festival') g.minute = Math.max(g.minute, FESTIVAL_DAYS[id].to); return { type: 'end', text }; }, g };
}

export function advance(run, answer) {
  const r = run.gen.next(run.started ? answer : undefined);
  run.started = true;
  return r.done ? run.end(r.value) : r.value;
}

export const festivalIds = () => Object.keys(FESTIVALS);
export const familyEventIds = () => Object.keys(FAMILY_EVENTS);
export { CROPS };
