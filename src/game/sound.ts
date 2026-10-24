import { MUSIC_VOLUME, SFX_VOLUME } from './constants';

// Sound effects and music made with the Web Audio API, no audio files.
let ctx: AudioContext | null = null;

// Browsers only let audio start from inside a real tap or key press. Phaser runs its key and
// pointer callbacks later, in its game loop, and Safari does not count that as a user gesture,
// so the audio would stay silent there. Unlock it straight from the DOM events instead.
const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchend'];

function unlockAudio() {
  const audio = getContext();
  if (!audio) return;
  // Play one silent sample: iOS Safari only unlocks once something has actually played
  const silence = audio.createBufferSource();
  silence.buffer = audio.createBuffer(1, 1, audio.sampleRate);
  silence.connect(audio.destination);
  silence.start();
  void audio.resume().then(() => {
    if (audio.state === 'running') {
      UNLOCK_EVENTS.forEach((e) => window.removeEventListener(e, unlockAudio, true));
    }
  });
}

UNLOCK_EVENTS.forEach((e) => window.addEventListener(e, unlockAudio, true));

// Mute is remembered between visits
const MUTE_KEY = 'echo-runner-muted';
let muted = loadMuted();

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function toggleMuted(): boolean {
  muted = !muted;
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // storage blocked: mute still works for this session
  }
  if (ctx && musicBus) musicBus.gain.setTargetAtTime(muted ? 0 : MUSIC_VOLUME, ctx.currentTime, 0.05);
  return muted;
}

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

// One oscillator note that slides from `from` to `to` Hz and fades out, starting `delay` seconds from now
function blip(from: number, to: number, seconds: number, type: OscillatorType, delay = 0, volume = 1) {
  if (muted) return;
  const audio = getContext();
  if (!audio) return;

  const start = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const gain = audio.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(to, start + seconds);
  gain.gain.setValueAtTime(SFX_VOLUME * volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);

  osc.connect(gain).connect(audio.destination);
  osc.start(start);
  osc.stop(start + seconds);
}

export const sfx = {
  pickup: () => blip(660, 1320, 0.12, 'square'),
  boost: () => blip(280, 840, 0.14, 'sawtooth'),
  powerup: () => blip(520, 1040, 0.2, 'triangle'),
  closeCall: () => blip(1400, 1900, 0.09, 'sine', 0, 0.4),

  // Rising C major arpeggio: C5 E5 G5, then C6 held a little longer
  start: () => {
    [523, 659, 784].forEach((f, i) => blip(f, f, 0.09, 'square', i * 0.07, 0.6));
    blip(1047, 1047, 0.28, 'square', 0.21, 0.6);
  },

  // Falling phrase G4 Eb4 C4, then a low drop
  gameOver: () => {
    [392, 311, 262].forEach((f, i) => blip(f, f, 0.18, 'triangle', i * 0.13));
    blip(196, 45, 0.6, 'sawtooth', 0.39, 0.7);
  },
};

// ---------- Background music ----------
// A quiet loop generated on the fly: an arpeggio over a soft bass line, Am F C G at 96 BPM.
// Notes are scheduled a little ahead on the audio clock, so timer hiccups don't break the rhythm.

const EIGHTH = 60 / 96 / 2; // seconds per eighth note
const LOOKAHEAD = 0.5; // seconds of music scheduled ahead
const CHORDS = [
  [57, 60, 64], // Am  (MIDI note numbers)
  [53, 57, 60], // F
  [55, 60, 64], // C
  [55, 59, 62], // G
];
const BASS = [45, 41, 48, 43]; // A2 F2 C3 G2
const ARP = [0, 1, 2, 3, 2, 1, 2, 1]; // which chord tone each eighth plays (3 = root an octave up)

let musicBus: GainNode | null = null;
let musicTimer: number | null = null;
let nextNoteTime = 0;
let step = 0;

const midiToHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

function musicNote(audio: AudioContext, hz: number, at: number, seconds: number, type: OscillatorType, volume: number) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(hz, at);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(volume, at + 0.02); // soft attack, no click
  gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  osc.connect(gain).connect(musicBus!);
  osc.start(at);
  osc.stop(at + seconds);
}

function scheduleMusic() {
  const audio = ctx;
  if (!audio) return;
  while (nextNoteTime < audio.currentTime + LOOKAHEAD) {
    const bar = Math.floor(step / 8) % CHORDS.length;
    const pos = step % 8;
    const chord = CHORDS[bar];
    const tones = [chord[0], chord[1], chord[2], chord[0] + 12];
    musicNote(audio, midiToHz(tones[ARP[pos]] + 12), nextNoteTime, 0.4, 'triangle', 0.5);
    if (pos === 0 || pos === 4) musicNote(audio, midiToHz(BASS[bar]), nextNoteTime, EIGHTH * 4, 'sine', 0.9);

    nextNoteTime += EIGHTH;
    step = (step + 1) % (8 * CHORDS.length);
  }
}

export const music = {
  // Safe to call repeatedly; picks up where it left off after stop()
  start() {
    const audio = getContext();
    if (!audio || musicTimer !== null) return;
    if (!musicBus) {
      // Music runs through its own volume and a low-pass filter that keeps it soft
      const filter = audio.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1800;
      musicBus = audio.createGain();
      musicBus.gain.value = muted ? 0 : MUSIC_VOLUME;
      musicBus.connect(filter).connect(audio.destination);
    }
    nextNoteTime = Math.max(nextNoteTime, audio.currentTime + 0.05);
    scheduleMusic();
    musicTimer = window.setInterval(scheduleMusic, 100);
  },

  stop() {
    if (musicTimer === null) return;
    window.clearInterval(musicTimer);
    musicTimer = null;
  },
};
