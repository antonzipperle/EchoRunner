// All tuning knobs in one place. Playtest and tweak these first.

export const ARENA = {
  width: 1280,
  height: 720,
  margin: 40, // space between screen edge and arena wall
};

// Fixed simulation step: 60 ticks per second, independent of the monitor's refresh rate.
// Recordings are made per tick, so ghosts replay identically on every device.
export const TICK_MS = 1000 / 60;

export const PLAYER_SIZE = 24;
export const PLAYER_SPEED = 320; // pixels per second

export const TARGET_SIZE = 28;

// Ghost hitbox relative to the player size. Below 1 = more forgiving.
export const GHOST_HITBOX_SCALE = 0.75;

// Faint line showing each ghost's whole path, so you can read where it will go.
export const GHOST_TRAIL_ALPHA = 0.12;
export const GHOST_TRAIL_WIDTH = 2;

// Ticks at the start of each round where ghosts can't hurt you (30 = 0.5 s).
export const SPAWN_GRACE_TICKS = 30;

// Ticks the player has to grab the target before the round is lost (600 = 10 s).
export const ROUND_TIME_TICKS = 600;

// Targets spawn at least this far from the player...
export const TARGET_MIN_DIST_FROM_PLAYER = 250;
// ...and at least this far from where any ghost will park when its recording ends.
export const TARGET_MIN_DIST_FROM_GHOST_END = 80;

// Touch controls: drag at least this many pixels from where the finger went down to move.
export const TOUCH_DEADZONE = 12;

// How many scores the local leaderboard keeps.
export const LEADERBOARD_SIZE = 10;

// Master volume for sound effects (0 to 1).
export const SFX_VOLUME = 0.15;

export const COLORS = {
  background: 0x0d0f14,
  wall: 0x2a3040,
  player: 0x4fd1c5,
  playerDead: 0xe05d6f,
  target: 0xf6c344,
  warning: '#e05d6f', // timer text in the last seconds
  ghost: 0xe05d6f,
  text: '#e8ecf4',
  textMuted: '#7d8799',
};
