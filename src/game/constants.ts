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
export const GHOST_TRAIL_ALPHA = 0.25;
export const GHOST_TRAIL_WIDTH = 2;

// Ghosts shift from COLORS.ghost (newest) to COLORS.ghostOld over this many rounds of age.
export const GHOST_AGE_FADE_ROUNDS = 8;

// A ring shrinks from this radius onto each ghost's start point during the grace period.
export const SPAWN_RING_RADIUS = 70;

// Burst of small squares when the target is grabbed.
export const BURST_PARTICLES = 10;
export const BURST_DISTANCE = 70;
export const BURST_MS = 400;

// Soft color wash when the target is grabbed (alpha at the start, fades out over the duration).
export const PICKUP_FLASH_ALPHA = 0.12;
export const PICKUP_FLASH_MS = 150;

// Score number scale at the moment it increments, easing back to 1.
export const SCORE_POP_SCALE = 1.6;

// Faint background grid inside the arena.
export const GRID_SIZE = 80;
export const GRID_ALPHA = 0.35;

// The arena wall slowly shifts from COLORS.wall to COLORS.wallHot over this many rounds.
export const WALL_SHIFT_ROUNDS = 12;

// In the last stretch of a round the timer turns red and the wall pulses.
export const TIMER_WARNING_SECONDS = 1.5;

// Ticks at the start of each round where ghosts can't hurt you (30 = 0.5 s).
export const SPAWN_GRACE_TICKS = 30;

// Ticks the player has to grab the target before the round is lost (300 = 5 s).
export const ROUND_TIME_TICKS = 300;
// ...and each completed round takes this many ticks off the limit, down to a floor.
// That keeps the clock tight later in a run, so +TIME pickups are worth taking.
export const ROUND_TIME_SHRINK_TICKS = 6; // 0.1 s per round
export const ROUND_TIME_MIN_TICKS = 180; // 3 s floor

// Pickups: rare extras that appear beside the target and vanish after a few seconds.
export const PICKUP_RADIUS = 13;
export const PICKUP_MIN_ROUND = 2; // score needed before pickups can appear
export const PICKUP_CHANCE = 0.35; // chance per round
export const PICKUP_LIFETIME_TICKS = 270; // 4.5 s
export const PICKUP_BLINK_TICKS = 60; // blinks during its last second
export const PICKUP_TIME_BONUS_TICKS = 90; // the time pickup adds 1.5 s to the round
// Pickups appear between the player and the target (PATH_T is how far along, 0 to 1),
// pushed sideways by OFFSET pixels, so taking one is a small detour.
export const PICKUP_PATH_T_MIN = 0.3;
export const PICKUP_PATH_T_MAX = 0.7;
export const PICKUP_OFFSET_MIN = 90;
export const PICKUP_OFFSET_MAX = 180;
export const PICKUP_MIN_DIST_FROM_PLAYER = 80;
export const PICKUP_MIN_DIST_FROM_TARGET = 60;
// ERASE removes this share of your ghosts, oldest first (at least one).
export const PICKUP_ERASE_FRACTION = 0.5;

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
  wallHot: 0x3b8f89,
  player: 0x4fd1c5,
  playerDead: 0xe05d6f,
  target: 0xf6c344,
  pickupTime: 0x7bd88f,
  pickupEraser: 0xf2f2f2,
  warning: '#e05d6f', // timer text in the last seconds
  ghost: 0xe05d6f,
  ghostOld: 0x8a6cf0,
  text: '#e8ecf4',
  textMuted: '#7d8799',
};
