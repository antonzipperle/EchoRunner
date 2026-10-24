import { SFX_VOLUME } from './constants';

// Sound effects made with the Web Audio API, no audio files.
// The AudioContext is created on first use, which always happens after a key press or click,
// so the browser's autoplay rules are satisfied.
let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null; // no Web Audio support: stay silent
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

// One oscillator blip that slides from `from` to `to` Hz and fades out
function blip(from: number, to: number, seconds: number, type: OscillatorType) {
  const audio = getContext();
  if (!audio) return;

  const now = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(from, now);
  osc.frequency.exponentialRampToValueAtTime(to, now + seconds);
  gain.gain.setValueAtTime(SFX_VOLUME, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);

  osc.connect(gain).connect(audio.destination);
  osc.start(now);
  osc.stop(now + seconds);
}

export const sfx = {
  pickup: () => blip(660, 1320, 0.12, 'square'),
  gameOver: () => blip(220, 40, 0.5, 'sawtooth'),
};
