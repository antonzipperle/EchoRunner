import { MUSIC_VOLUME, SFX_VOLUME } from './constants';

// Sound effects and music made with the Web Audio API, no audio files.
let ctx: AudioContext | null = null;

// Browsers only let audio start from inside a real tap or key press. Phaser runs its key and
// pointer callbacks later, in its game loop, and Safari does not count that as a user gesture,
// so the audio would stay silent there. Unlock it straight from the DOM events instead.
// The listeners stay for good: iOS can interrupt audio at any time (a call, the app going to the
// background), and it can only be resumed inside a later tap.
const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchend', 'click'];

function unlockAudio() {
  const audio = getContext();
  if (!audio || audio.state === 'running') return;
  // Play one silent sample: iOS Safari only unlocks once something has actually played
  const silence = audio.createBufferSource();
  silence.buffer = audio.createBuffer(1, 1, audio.sampleRate);
  silence.connect(audio.destination);
  silence.start();
  void audio.resume();
}

UNLOCK_EVENTS.forEach((e) => window.addEventListener(e, unlockAudio, true));

// iPhones mute Web Audio while the side switch is on silent, unlike video and music apps.
// Asking for a "playback" audio session (Safari 16.4+) makes the game play like media instead.
const audioSession = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
if (audioSession) audioSession.type = 'playback';

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
  // 'suspended' everywhere, or 'interrupted' on iOS after a call or a trip to the background
  if (ctx.state !== 'running' && ctx.state !== 'closed') void ctx.resume();
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
  // Two quick rising notes: the dash is charged again
  boostReady: () => {
    blip(880, 880, 0.06, 'triangle', 0, 0.5);
    blip(1320, 1320, 0.1, 'triangle', 0.06, 0.5);
  },
  // A crunchy drop with a bright crack on top
  smash: () => {
    blip(240, 50, 0.22, 'square', 0, 0.7);
    blip(1800, 600, 0.08, 'sawtooth', 0, 0.35);
  },

  // Climbs a minor third with every link of a combo (level 1 = a single close call)
  closeCall: (level = 1) => {
    const up = 2 ** ((3 * (Math.min(level, 5) - 1)) / 12);
    blip(1400 * up, 1900 * up, 0.09, 'sine', 0, 0.4);
  },

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
// It grows with the run: intensity 1 adds a soft hi-hat, 2 a second melody, 3 a low kick,
// and each step opens the filter a little. The game sets the intensity (see music.setIntensity).

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

const FILTER_HZ = [1800, 2200, 2600, 3000]; // brighter as the intensity rises

let musicBus: GainNode | null = null;
let musicFilter: BiquadFilterNode | null = null;
let noise: AudioBuffer | null = null; // a short burst of white noise for the hi-hat
let musicTimer: number | null = null;
let nextNoteTime = 0;
let step = 0;
let intensity = 0; // 0..3

const midiToHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

// A very short, high noise tick
function hat(audio: AudioContext, at: number) {
  if (!noise) {
    noise = audio.createBuffer(1, Math.floor(audio.sampleRate * 0.05), audio.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = audio.createBufferSource();
  src.buffer = noise;
  const highpass = audio.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 7000;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.35, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
  src.connect(highpass).connect(gain).connect(musicBus!);
  src.start(at);
  src.stop(at + 0.05);
}

// A soft low thump: a sine that drops in pitch
function kick(audio: AudioContext, at: number) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(110, at);
  osc.frequency.exponentialRampToValueAtTime(42, at + 0.14);
  gain.gain.setValueAtTime(1.1, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
  osc.connect(gain).connect(musicBus!);
  osc.start(at);
  osc.stop(at + 0.22);
}

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

    // Layers that join as the run heats up
    if (intensity >= 1 && pos % 2 === 1) hat(audio, nextNoteTime); // off-beat hi-hat
    if (intensity >= 2 && pos % 2 === 0) {
      // A second voice an octave above, walking the chord the other way
      musicNote(audio, midiToHz(tones[3 - (pos / 2)] + 24), nextNoteTime, 0.3, 'sine', 0.22);
    }
    if (intensity >= 3 && (pos === 0 || pos === 4)) kick(audio, nextNoteTime);

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
      musicFilter = audio.createBiquadFilter();
      musicFilter.type = 'lowpass';
      musicFilter.frequency.value = FILTER_HZ[intensity];
      musicBus = audio.createGain();
      musicBus.gain.value = muted ? 0 : MUSIC_VOLUME;
      musicBus.connect(musicFilter).connect(audio.destination);
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

  // 0 = the calm loop, up to 3 = every layer. Changes are heard from the next scheduled notes.
  setIntensity(level: number) {
    intensity = Math.max(0, Math.min(3, Math.round(level)));
    if (ctx && musicFilter) musicFilter.frequency.setTargetAtTime(FILTER_HZ[intensity], ctx.currentTime, 0.5);
  },

  getIntensity(): number {
    return intensity;
  },
};
