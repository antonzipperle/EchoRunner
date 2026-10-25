// All tuning knobs in one place. Playtest and tweak these first.

export const ARENA = {
  width: 1280,
  height: 720,
  margin: 40, // space between screen edge and arena wall
};

// The game's one font. Plain "monospace" lets each browser pick, and Safari picks a typewriter
// Courier; this list asks for a clean mono first (SF Mono on Apple, Menlo, Consolas on Windows,
// DejaVu on Linux, Roboto Mono on Android) and only falls back to the browser's own at the end.
export const FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", "Roboto Mono", monospace';

// The canvas is drawn this many times larger than the 1280x720 game space, so text and shapes
// stay sharp on big and high-DPI screens. Game logic never sees this; see src/game/hiRes.ts.
export const RENDER_SCALE = 2;

// Fixed simulation step: 60 ticks per second, independent of the monitor's refresh rate.
// Recordings are made per tick, so ghosts replay identically on every device.
export const TICK_MS = 1000 / 60;

export const PLAYER_SIZE = 24;
export const PLAYER_SPEED = 320; // pixels per second

// Movement has a little inertia: each tick the velocity moves this share of the way toward what the
// input asks for. Turns become arcs instead of sharp corners, so ghost trails curve too.
// 1 = instant (the old feel); lower = floatier. Boosts use a snappier value so the dash still kicks in.
export const PLAYER_RESPONSE = 0.13;
export const PLAYER_BOOST_RESPONSE = 0.35;
// Letting go of the keys stops you faster than you turn, so dodging stays precise (about 15 px of glide)
export const PLAYER_STOP_RESPONSE = 0.3;

// Boost: a short burst of speed on Shift (or the on-screen button), then a cooldown.
// The cooldown keeps running across rounds. Boosted movement is recorded like any other,
// so your future ghosts dash too. At 3x for 15 ticks a boost covers about 240 px.
export const BOOST_SPEED_MULT = 3;
export const BOOST_TICKS = 15; // 0.25 s
export const BOOST_COOLDOWN_TICKS = 300; // 5 s on its own...
// ...but every close call takes this much off, so playing risky earns dashes (and smashes) back
export const BOOST_REFILL_PER_CLOSE_CALL = 100; // a third of the cooldown
// A dash is also a weapon: touching a ghost while boosting smashes it. The window runs a few ticks
// past the end of the dash so a hit right at the end still counts.
export const SMASH_GRACE_TICKS = 4;
export const XP_PER_SMASH = 10;

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
export const PICKUP_RADIUS = 15;
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

// A ghost closer than this to the player (after the grace period) lights up as a warning.
export const NEAR_MISS_DIST = 70;
// Slipping past a ghost closer than this (and surviving) counts as a close call: a ring and a chime.
// (Ghosts catch you at 18 px, so this leaves a band of about 30 px to slip through.)
export const CLOSE_CALL_DIST = 48;
// Close calls within this window of the last one chain into a combo. Each link is worth
// XP_PER_CLOSE_CALL times its place in the chain, up to COMBO_MAX times.
export const COMBO_WINDOW_TICKS = 240; // 4 s
export const COMBO_MAX = 5;

// Game feel: the player stretches a little in the direction it moves (more when boosting)
// and pops bigger for a moment when it grabs something. Both ease back on their own.
export const PLAYER_STRETCH = 0.06;
export const PLAYER_POP_SCALE = 1.35;

// Radius of the on-screen joystick ring drawn while dragging.
export const JOYSTICK_RADIUS = 56;

// Start screen demo: a runner loops a figure-eight and its past laps appear behind it as ghosts.
export const START_LAP_MS = 6000; // one lap of the figure-eight
export const START_GHOST_COUNT = 5;
export const START_GHOST_LAG = 0.7; // radians of the lap that each ghost trails the one before
export const START_GHOST_REVEAL_MS = 1500; // a new ghost appears this often

// Touch controls: drag at least this many pixels from where the finger went down to move.
export const TOUCH_DEADZONE = 12;

// XP earned per run; levels unlock player looks (see src/game/progress.ts and skins.ts).
export const XP_PER_ROUND = 10;
export const XP_PER_CLOSE_CALL = 5;
export const XP_PER_PICKUP = 5;

// How many scores the local leaderboard keeps.
export const LEADERBOARD_SIZE = 10;

// Master volume for sound effects (0 to 1).
export const SFX_VOLUME = 0.15;
// Background music volume (0 to 1). Kept well under the effects so it stays in the background.
export const MUSIC_VOLUME = 0.05;
// The music adds a layer at each of these round counts: hi-hat, then a second melody, then a kick
export const MUSIC_LAYER_ROUNDS = [4, 8, 12];

// Camera shake on game over. Intensity is a fraction of the screen size.
export const SHAKE_MS = 120;
export const SHAKE_INTENSITY = 0.004;

export const COLORS = {
  background: 0x0d0f14,
  wall: 0x2a3040,
  panel: 0x151a24, // menu buttons and panels
  panelLight: 0x1f2636,
  panelRing: 0x34405a,
  icon: 0xe8ecf4, // same as text, as a number for drawn icons
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
