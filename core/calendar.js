// Kalender & cuaca ala Harvest Moon: 4 musim x 30 hari, pekan 7 hari (Senin-Minggu).
export const SEASONS = ['Semi', 'Panas', 'Gugur', 'Dingin'];
export const WEEKDAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
export const DAYS_PER_SEASON = 30;
export const DAY_START = 6 * 60;      // 06:00
export const DAY_END = 24 * 60;       // 24:00 -> dipaksa tidur
export const PASS_OUT = 26 * 60;      // 02:00 -> pingsan
export const REAL_SECONDS_PER_MINUTE = 0.7;

export function dayIndex({ year, season, day }) {
  return (year - 1) * SEASONS.length * DAYS_PER_SEASON + season * DAYS_PER_SEASON + (day - 1);
}

export function weekday(date) {
  return WEEKDAYS[dayIndex(date) % 7];
}

export function nextDate({ year, season, day }) {
  if (day < DAYS_PER_SEASON) return { year, season, day: day + 1 };
  if (season < SEASONS.length - 1) return { year, season: season + 1, day: 1 };
  return { year: year + 1, season: 0, day: 1 };
}

export function formatClock(minute) {
  const m = Math.floor(minute) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// PRNG deterministik (mulberry32) agar ramalan cuaca di TV selalu sama dengan cuaca esok hari.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WEATHER_ODDS = [
  // [sunny, rain, storm, snow]
  [0.62, 0.38, 0, 0],
  [0.60, 0.28, 0.12, 0],
  [0.58, 0.30, 0.12, 0],
  [0.55, 0, 0, 0.45],
];

export function weatherFor(date, worldSeed = 1) {
  const idx = dayIndex(date);
  // Hari penting dibuat cerah supaya festival tidak batal.
  if (FIXED_SUNNY.has(`${date.season}:${date.day}`)) return 'sunny';
  if (date.season === 0 && date.day === 1) return 'sunny';
  const r = rng(idx * 7919 + worldSeed * 104729)();
  const [sunny, rain, storm] = WEATHER_ODDS[date.season];
  if (r < sunny) return 'sunny';
  if (r < sunny + rain) return 'rain';
  if (r < sunny + rain + storm) return 'storm';
  return 'snow';
}

// Kalender festival (dipakai juga oleh jadwal warga & toko). Hari festival selalu cerah.
export const FESTIVAL_DAYS = {
  flower:    { season: 0, day: 8,  name: 'Festival Bunga',     icon: '🌷', from: 9 * 60,  to: 17 * 60 },
  cooking:   { season: 0, day: 17, name: 'Kontes Memasak',     icon: '🍳', from: 9 * 60,  to: 17 * 60 },
  livestock: { season: 1, day: 20, name: 'Lomba Ternak',       icon: '🐄', from: 9 * 60,  to: 17 * 60 },
  fireworks: { season: 1, day: 24, name: 'Kembang Api',        icon: '🎆', from: 17 * 60, to: 21 * 60 },
  harvest:   { season: 2, day: 13, name: 'Festival Panen',     icon: '🎃', from: 9 * 60,  to: 17 * 60 },
  stars:     { season: 3, day: 24, name: 'Malam Bintang',      icon: '⭐', from: 18 * 60, to: 22 * 60 },
  newyear:   { season: 3, day: 30, name: 'Malam Tahun Baru',   icon: '🎍', from: 20 * 60, to: 24 * 60 },
};
export const festivalOn = (date) => Object.entries(FESTIVAL_DAYS).find(([, f]) => f.season === date.season && f.day === date.day)?.[0] ?? null;

export const FIXED_SUNNY = new Set(Object.values(FESTIVAL_DAYS).map((f) => `${f.season}:${f.day}`));
