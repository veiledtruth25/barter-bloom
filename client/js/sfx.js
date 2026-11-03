// Efek suara sintetis (WebAudio), tanpa berkas audio. Dibuat saat interaksi pertama agar lolos kebijakan autoplay.
let ctx = null, muted = false;
try { muted = localStorage.getItem('bb-muted') === '1'; } catch { /* abaikan */ }

const SOUNDS = {
  tool:  [[220, 0.06, 'square', 0.05], [150, 0.08, 'square', 0.05]],
  good:  [[523, 0.08, 'triangle', 0.09], [659, 0.08, 'triangle', 0.09], [784, 0.14, 'triangle', 0.09]],
  coin:  [[988, 0.06, 'square', 0.05], [1319, 0.14, 'square', 0.05]],
  blip:  [[440, 0.04, 'triangle', 0.05]],
  no:    [[160, 0.12, 'sawtooth', 0.05]],
  bell:  [[880, 0.3, 'sine', 0.08], [1320, 0.4, 'sine', 0.05]],
};

export function play(name) {
  if (muted) return;
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    let t = ctx.currentTime;
    for (const [freq, dur, type, vol] of SOUNDS[name] || []) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur); t += dur * 0.8;
    }
  } catch { /* audio tidak tersedia */ }
}

export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('bb-muted', muted ? '1' : '0'); } catch { /* abaikan */ }
  return muted;
}
export const isMuted = () => muted;
