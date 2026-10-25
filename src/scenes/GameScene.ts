import Phaser from 'phaser';
import {
  ARENA,
  BOOST_COOLDOWN_TICKS,
  BOOST_REFILL_PER_CLOSE_CALL,
  BOOST_SPEED_MULT,
  BOOST_TICKS,
  BURST_DISTANCE,
  BURST_MS,
  BURST_PARTICLES,
  CLOSE_CALL_DIST,
  COLORS,
  COMBO_MAX,
  COMBO_WINDOW_TICKS,
  FONT,
  GHOST_AGE_FADE_ROUNDS,
  GHOST_HITBOX_SCALE,
  GHOST_TRAIL_ALPHA,
  GHOST_TRAIL_STEP,
  GHOST_TRAIL_WIDTH,
  JOYSTICK_RADIUS,
  MUSIC_LAYER_ROUNDS,
  NEAR_MISS_DIST,
  PICKUP_FLASH_ALPHA,
  PICKUP_BLINK_TICKS,
  PICKUP_CHANCE,
  PICKUP_ERASE_FRACTION,
  PICKUP_FLASH_MS,
  PICKUP_LIFETIME_TICKS,
  PICKUP_MIN_DIST_FROM_PLAYER,
  PICKUP_MIN_DIST_FROM_TARGET,
  PICKUP_MIN_ROUND,
  PICKUP_OFFSET_MAX,
  PICKUP_OFFSET_MIN,
  PICKUP_PATH_T_MAX,
  PICKUP_PATH_T_MIN,
  PICKUP_RADIUS,
  PICKUP_TIME_BONUS_TICKS,
  PLAYER_BOOST_RESPONSE,
  PLAYER_POP_SCALE,
  PLAYER_RESPONSE,
  PLAYER_SIZE,
  PLAYER_SPEED,
  PLAYER_STOP_RESPONSE,
  PLAYER_STRETCH,
  ROUND_TIME_MIN_TICKS,
  ROUND_TIME_SHRINK_TICKS,
  ROUND_TIME_TICKS,
  SCORE_POP_SCALE,
  SHAKE_INTENSITY,
  SHAKE_MS,
  SMASH_GRACE_TICKS,
  SPAWN_GRACE_TICKS,
  SPAWN_RING_RADIUS,
  TARGET_MIN_DIST_FROM_GHOST_END,
  TARGET_MIN_DIST_FROM_PLAYER,
  TARGET_SIZE,
  TICK_MS,
  TIMER_WARNING_SECONDS,
  TOUCH_DEADZONE,
  WALL_SHIFT_ROUNDS,
  XP_PER_CLOSE_CALL,
} from '../game/constants';
import { applyHiResCamera } from '../game/hiRes';
import { addGlow, addTrailPiece, cssColor, drawBackdrop, drawGrid, mixColor, setGlowColor } from '../game/visuals';
import { addXp, runXp, selectedBody, selectedTrail, xpForLevel } from '../game/progress';
import { BODIES, TRAILS, bodyColorAt, trailColor, type Body, type Trail } from '../game/skins';
import { Recording } from '../game/Recording';
import { submitScore, type ScoreEntry } from '../game/leaderboard';
import {
  boostIcon,
  closeCallIcon,
  comboIcon,
  erasedIcon,
  homeIcon,
  iconButton,
  lookIcon,
  pauseIcon,
  pickupIcon,
  playIcon,
  restartIcon,
  smashIcon,
  soundOffIcon,
  soundOnIcon,
  starIcon,
  type IconButton,
  type IconDrawer,
} from '../game/ui';
import { isMuted, music, sfx, toggleMuted } from '../game/sound';

type Ghost = {
  recording: Recording;
  rect: Phaser.GameObjects.Rectangle;
  trail: Phaser.GameObjects.Graphics;
  near: boolean; // lit up because it is close to the player
  closest: number; // nearest it got to the player while lit up, for close calls
};

type PickupKind = 'time' | 'eraser';

type Pickup = {
  kind: PickupKind;
  x: number;
  y: number;
  body: Phaser.GameObjects.Container; // everything drawn for this pickup, so it blinks and goes as one
  ticksLeft: number;
};

type WasdKeys = {
  W: Phaser.Input.Keyboard.Key;
  A: Phaser.Input.Keyboard.Key;
  S: Phaser.Input.Keyboard.Key;
  D: Phaser.Input.Keyboard.Key;
};

export class GameScene extends Phaser.Scene {
  private wall!: Phaser.GameObjects.Rectangle;
  private wallGlow!: Phaser.GameObjects.Rectangle;
  private player!: Phaser.GameObjects.Rectangle;
  private playerGlow!: Phaser.GameObjects.Image;
  private body: Body = BODIES[0]; // the look chosen on the start screen: body color...
  private trail: Trail = TRAILS[0]; // ...and the trail it leaves
  private trailPieces = 0; // counts trail pieces, so PRISM can step through its colors
  private lookMs = 0; // clock for looks that animate (aurora)
  private glowBaseScale = 1; // the player glow's resting scale
  private playerPop = 1; // extra scale after a grab, easing back to 1
  private target!: Phaser.GameObjects.Rectangle;
  private targetRing!: Phaser.GameObjects.Rectangle;
  private targetGlow!: Phaser.GameObjects.Image;
  private scoreText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private hintText?: Phaser.GameObjects.Text;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WasdKeys;
  private touchStart: Phaser.Math.Vector2 | null = null;
  private touchPointerId: number | null = null; // the finger that owns the drag
  private touchDir = new Phaser.Math.Vector2();
  private steeringByDrag = false; // the last input came from a drag: no inertia (a finger is smooth already)

  private boostTicksLeft = 0; // ticks of boosted speed remaining
  private smashTicksLeft = 0; // ticks the dash can still smash ghosts (the boost plus a little leeway)
  private boostCooldown = 0; // ticks until the next boost; not reset between rounds
  private lastDir = new Phaser.Math.Vector2(1, 0); // so boosting while standing still still dashes
  private vel = new Phaser.Math.Vector2(); // px/s; eases toward the input rather than snapping to it
  // Boost: a small icon in the HUD and, on touch screens, a big thumb button. Each has a recharge ring.
  private boostButtons: { button: IconButton; ring: Phaser.GameObjects.Graphics; radius: number; baseAlpha: number }[] = [];
  private thumbBoost: { button: IconButton; ring: Phaser.GameObjects.Graphics } | null = null;
  private joystick!: Phaser.GameObjects.Graphics;

  private recordings: Recording[] = [];
  private current = new Recording();
  private ghosts: Ghost[] = [];

  // What happened this run, for the summary on the game-over screen
  private runStats = { closeCalls: 0, closeCallXp: 0, bestCombo: 0, boosts: 0, pickups: 0, erased: 0, smashed: 0 };

  // Close-call combo: how many in a row, and ticks left before the chain breaks
  private combo = 0;
  private comboTicksLeft = 0;
  private comboBadge!: Phaser.GameObjects.Text;
  private comboBar!: Phaser.GameObjects.Graphics;

  private pickup: Pickup | null = null;
  private bonusTicks = 0; // extra time from pickups, for this round only

  private tick = 0; // tick within the current round
  private accumulator = 0; // leftover time for the fixed timestep
  private score = 0;
  private isGameOver = false;
  private isPaused = false;
  private leavingHome = false; // fading out to the start screen
  private pauseUi: Phaser.GameObjects.GameObject[] = [];
  private soundButton: IconButton | null = null; // only exists while the pause menu is open

  constructor() {
    super('GameScene');
  }

  create(data?: { fromMenu?: boolean }) {
    // scene.restart() reuses this instance, so reset all state here
    this.recordings = [];
    this.current = new Recording();
    this.ghosts = [];
    this.tick = 0;
    this.accumulator = 0;
    this.score = 0;
    this.isGameOver = false;
    this.isPaused = false;
    this.leavingHome = false;
    this.pauseUi = [];
    this.soundButton = null;
    this.pickup = null;
    this.bonusTicks = 0;
    this.runStats = { closeCalls: 0, closeCallXp: 0, bestCombo: 0, boosts: 0, pickups: 0, erased: 0, smashed: 0 };
    this.combo = 0;
    this.comboTicksLeft = 0;
    this.touchStart = null;
    this.touchPointerId = null;
    this.touchDir.set(0, 0);
    this.steeringByDrag = false;
    this.boostTicksLeft = 0;
    this.smashTicksLeft = 0;
    this.boostCooldown = 0;
    this.lastDir.set(1, 0);
    this.vel.set(0, 0);

    applyHiResCamera(this);
    if (data?.fromMenu) this.cameras.main.fadeIn(250, 13, 15, 20); // matches the background color
    music.start(); // keeps playing across restarts; does nothing if already running
    music.setIntensity(0); // every run starts on the calm loop

    const { width, height, margin } = ARENA;

    drawBackdrop(this);
    drawGrid(this);

    // Arena wall, with a wide faint copy behind it as a glow
    const arenaW = width - margin * 2;
    const arenaH = height - margin * 2;
    this.wallGlow = this.add.rectangle(width / 2, height / 2, arenaW, arenaH).setStrokeStyle(10, COLORS.wall, 0.12);
    this.wall = this.add.rectangle(width / 2, height / 2, arenaW, arenaH).setStrokeStyle(2, COLORS.wall);

    // Target: a spinning gem inside a frame that turns the other way, over a soft glow
    this.targetGlow = addGlow(this, 0, 0, COLORS.target, 56).setDepth(0.5);
    this.tweens.add({ targets: this.targetGlow, alpha: 0.6, duration: 700, yoyo: true, repeat: -1 });
    this.targetRing = this.add
      .rectangle(0, 0, TARGET_SIZE + 16, TARGET_SIZE + 16)
      .setStrokeStyle(2, COLORS.target, 0.6)
      .setDepth(1);
    this.tweens.add({ targets: this.targetRing, angle: -360, duration: 4000, repeat: -1 });
    this.target = this.add.rectangle(0, 0, TARGET_SIZE, TARGET_SIZE, COLORS.target).setDepth(1);
    this.tweens.add({ targets: this.target, angle: 360, duration: 3000, repeat: -1 });

    this.body = selectedBody();
    this.trail = selectedTrail();
    this.trailPieces = 0;
    this.lookMs = 0;
    const lookColor = bodyColorAt(this.body, 0);
    this.playerGlow = addGlow(this, width / 2, height / 2, lookColor, 44).setDepth(2.5);
    this.glowBaseScale = this.playerGlow.scaleX;
    this.playerPop = 1;
    this.player = this.add
      .rectangle(width / 2, height / 2, PLAYER_SIZE, PLAYER_SIZE, lookColor)
      .setDepth(3);

    this.scoreText = this.add
      .text(margin + 12, margin + 10, '0', {
        fontFamily: FONT,
        fontSize: '32px',
        fontStyle: 'bold',
        color: COLORS.text,
      })
      .setDepth(5);

    // Combo badge under the score: "x3" with a bar that drains until the chain breaks
    this.comboBadge = this.add
      .text(margin + 12, margin + 60, '', { fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: COLORS.text })
      .setOrigin(0, 0.5)
      .setDepth(5)
      .setVisible(false);
    this.comboBar = this.add.graphics().setDepth(5);

    this.timerText = this.add
      .text(width - margin - 12, margin + 10, '', {
        fontFamily: FONT,
        fontSize: '32px',
        fontStyle: 'bold',
        color: COLORS.text,
      })
      .setOrigin(1, 0)
      .setDepth(5);
    this.updateTimer();

    this.hintText = this.add
      .text(width / 2, height - margin - 45, 'Grab the yellow square. Avoid your past.\nMove: WASD, arrows or drag     Dash: Shift or »  (dash through ghosts to smash them)', {
        align: 'center',
        fontFamily: FONT,
        fontSize: '20px',
        color: COLORS.textMuted,
      })
      .setOrigin(0.5)
      .setDepth(5);

    this.setupInput();
    this.createButtons();

    // Pause when the window loses focus; the listener must go when the scene restarts
    const onBlur = () => {
      if (!this.isPaused && !this.isGameOver) this.togglePause();
    };
    this.game.events.on(Phaser.Core.Events.BLUR, onBlur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, onBlur);
    });

    this.spawnTarget();

    // Exposed in dev mode only, for debugging in the browser console
    if (import.meta.env.DEV) {
      (window as unknown as { scene: GameScene }).scene = this;
    }
  }

  update(_time: number, delta: number) {
    if (this.isGameOver || this.isPaused) return;

    // Fixed timestep: run as many 60 Hz ticks as fit into the elapsed time.
    // The cap stops a huge catch-up burst after switching browser tabs.
    this.accumulator += Math.min(delta, 250);
    while (this.accumulator >= TICK_MS) {
      this.accumulator -= TICK_MS;
      this.step();
      if (this.isGameOver) break;
    }
  }

  // ---------- Simulation (one fixed tick) ----------

  private step() {
    const prevX = this.player.x;
    const prevY = this.player.y;
    this.movePlayer();
    this.playerGlow.setPosition(this.player.x, this.player.y);
    if (this.body.aurora) this.tintAurora();

    // Light motion trail; boosting draws its own, denser one
    const moved = this.player.x !== prevX || this.player.y !== prevY;
    if (moved && this.boostTicksLeft === 0 && this.tick % 3 === 0) this.afterimage(0.2);

    this.tickBoost();
    this.current.push(this.player.x, this.player.y);

    const graceOver = this.tick >= SPAWN_GRACE_TICKS;
    let danger = 0; // 0 = no ghost near, 1 = a ghost right on top of the player
    const slippedPast: Ghost[] = [];
    for (const ghost of this.ghosts) {
      const p = ghost.recording.at(this.tick);
      ghost.rect.setPosition(p.x, p.y);

      // Near-miss warning: the outline brightens the closer the ghost gets
      const d = Phaser.Math.Distance.Between(p.x, p.y, this.player.x, this.player.y);
      const near = graceOver && d < NEAR_MISS_DIST;
      if (near !== ghost.near) {
        ghost.near = near;
        if (near) {
          ghost.closest = d;
          this.tweens.add({ targets: ghost.rect, scale: { from: 1.3, to: 1 }, duration: 180, ease: 'Back.easeOut' });
        } else {
          ghost.rect.setStrokeStyle(1.5, ghost.rect.fillColor, 1);
          if (ghost.closest < CLOSE_CALL_DIST) slippedPast.push(ghost);
        }
      }
      if (near) {
        ghost.closest = Math.min(ghost.closest, d);
        const closeness = 1 - d / NEAR_MISS_DIST;
        ghost.rect.setStrokeStyle(2, 0xffffff, 0.4 + 0.6 * closeness);
        danger = Math.max(danger, closeness);
      }
      ghost.rect.setAlpha(near ? 1 : graceOver ? 0.8 : 0.25);
    }
    this.updatePlayerFeel(prevX, prevY, danger);

    if (graceOver && this.smashTicksLeft > 0) {
      // Dashing: every ghost you touch is smashed instead of catching you
      this.ghostsInReach().forEach((g) => this.smashGhost(g));
    } else {
      const caughtBy = graceOver ? this.ghostTouchingPlayer() : undefined;
      if (caughtBy) {
        this.gameOver(undefined, caughtBy);
        return;
      }
    }
    if (this.smashTicksLeft > 0 && --this.smashTicksLeft === 0) this.player.setStrokeStyle(); // dash disarmed
    if (slippedPast.length > 0) this.closeCall();

    if (this.overlaps(this.player, this.target, (PLAYER_SIZE + TARGET_SIZE) / 2)) {
      this.nextRound();
      return;
    }

    this.updatePickup();

    this.tick++;
    this.updateTimer();

    if (this.tick >= this.timeLimit) this.gameOver('OUT OF TIME');
  }

  // Round length in ticks: shrinks as the score climbs, plus time bonuses picked up this round
  private get timeLimit(): number {
    const base = Math.max(ROUND_TIME_MIN_TICKS, ROUND_TIME_TICKS - this.score * ROUND_TIME_SHRINK_TICKS);
    return base + this.bonusTicks;
  }

  private updateTimer() {
    const remaining = Math.max(0, this.timeLimit - this.tick) * (TICK_MS / 1000);
    const warning = remaining <= TIMER_WARNING_SECONDS;
    this.timerText.setText(remaining.toFixed(1));
    this.timerText.setColor(warning ? COLORS.warning : COLORS.text);
    this.timerText.setScale(warning ? 1 + 0.08 * (0.5 + 0.5 * Math.sin(this.tick * 0.35)) : 1); // beats with the wall
    this.updateWall(warning);
  }

  // Wall color follows the score; in the last seconds of a round it pulses red instead
  private updateWall(warning: boolean) {
    if (warning) {
      const pulse = 0.5 + 0.5 * Math.sin(this.tick * 0.35);
      this.wall.setStrokeStyle(2, COLORS.playerDead, 0.4 + 0.6 * pulse);
      this.wallGlow.setStrokeStyle(10, COLORS.playerDead, 0.25 * pulse);
      return;
    }
    const t = Math.min(this.score / WALL_SHIFT_ROUNDS, 1);
    const color = mixColor(COLORS.wall, COLORS.wallHot, t);
    this.wall.setStrokeStyle(2, color);
    this.wallGlow.setStrokeStyle(10, color, 0.12);
  }

  private movePlayer() {
    let dir = this.readInput();
    if (dir.lengthSq() > 0) this.lastDir.copy(dir);

    const boosting = this.boostTicksLeft > 0;
    if (boosting && dir.lengthSq() === 0) dir = this.lastDir; // dash even when no key is held
    const speed = PLAYER_SPEED * (boosting ? BOOST_SPEED_MULT : 1);

    // Keys: ease toward the wanted velocity, so turns curve, starts and stops glide a little,
    // and after a boost the extra speed bleeds off instead of cutting out.
    // Drags follow the finger instantly: the finger already moves smoothly, and easing on top feels laggy.
    const response = this.steeringByDrag
      ? 1
      : boosting
        ? PLAYER_BOOST_RESPONSE
        : dir.lengthSq() === 0
          ? PLAYER_STOP_RESPONSE
          : PLAYER_RESPONSE;
    this.vel.x += (dir.x * speed - this.vel.x) * response;
    this.vel.y += (dir.y * speed - this.vel.y) * response;

    const dt = TICK_MS / 1000;
    const half = PLAYER_SIZE / 2;
    const { width, height, margin } = ARENA;
    const minX = margin + half, maxX = width - margin - half;
    const minY = margin + half, maxY = height - margin - half;

    const x = this.player.x + this.vel.x * dt;
    const y = this.player.y + this.vel.y * dt;
    this.player.x = Phaser.Math.Clamp(x, minX, maxX);
    this.player.y = Phaser.Math.Clamp(y, minY, maxY);
    // Walls stop you in that direction, so you don't stay "pressed" against them
    if (x !== this.player.x) this.vel.x = 0;
    if (y !== this.player.y) this.vel.y = 0;
  }

  // ---------- Boost ----------

  private tryBoost() {
    if (this.isGameOver || this.isPaused || this.boostCooldown > 0) return;
    this.boostTicksLeft = BOOST_TICKS;
    this.boostCooldown = BOOST_COOLDOWN_TICKS;
    this.smashTicksLeft = BOOST_TICKS + SMASH_GRACE_TICKS;
    this.player.setStrokeStyle(3, 0xffffff, 0.95); // armed: a white outline while the dash can smash
    this.runStats.boosts++;
    sfx.boost();
    this.shockwave(this.player.x, this.player.y, this.player.fillColor, 40);
    this.updateBoostUi();
  }

  // Once per tick, after the player has moved
  private tickBoost() {
    if (this.boostTicksLeft > 0) {
      this.afterimage(0.5);
      this.boostTicksLeft--;
    }
    if (this.boostCooldown > 0) this.boostCooldown--;
    this.updateBoostUi();

    // The combo window runs on ticks too, so pausing freezes it
    if (this.comboTicksLeft > 0 && --this.comboTicksLeft === 0) this.combo = 0;
    this.updateComboBadge();
  }

  // ---------- Close-call combo ----------

  // White for one, yellow for a short chain, orange once it's really going
  private comboColor(combo: number): number {
    return combo >= 4 ? 0xff9f43 : combo >= 2 ? COLORS.target : 0xffffff;
  }

  private updateComboBadge() {
    const showing = this.combo >= 2;
    this.comboBadge.setVisible(showing);
    this.comboBar.clear();
    if (!showing) return;
    const color = this.comboColor(this.combo);
    this.comboBadge.setText(`x${this.combo}`).setColor(cssColor(color));
    const { margin } = ARENA;
    const width = 64 * (this.comboTicksLeft / COMBO_WINDOW_TICKS);
    this.comboBar.fillStyle(COLORS.wall, 1).fillRect(margin + 12, margin + 78, 64, 4);
    this.comboBar.fillStyle(color, 1).fillRect(margin + 12, margin + 78, width, 4);
  }

  // "x3" pops up over the player and floats away
  private comboPopup(combo: number) {
    const color = this.comboColor(combo);
    const label = this.add
      .text(this.player.x, this.player.y - 34, `x${combo}`, { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: cssColor(color) })
      .setOrigin(0.5)
      .setDepth(6)
      .setScale(1.6);
    this.tweens.add({ targets: label, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: label, y: label.y - 36, alpha: 0, delay: 220, duration: 520, onComplete: () => label.destroy() });
  }

  // ---------- Game feel ----------

  // Once per tick: stretch along the direction of travel, ease back from a pop,
  // and swell the glow while a ghost is close (danger 0..1)
  private updatePlayerFeel(prevX: number, prevY: number, danger: number) {
    const lerp = Phaser.Math.Linear;
    const dx = this.player.x - prevX;
    const dy = this.player.y - prevY;
    const len = Math.hypot(dx, dy);
    const normalStep = PLAYER_SPEED * (TICK_MS / 1000);
    const s = PLAYER_STRETCH * (len / normalStep); // about 3x as much while boosting
    const ux = len > 0 ? Math.abs(dx) / len : 0;
    const uy = len > 0 ? Math.abs(dy) / len : 0;

    this.playerPop = lerp(this.playerPop, 1, 0.15);
    this.player.setScale(
      lerp(this.player.scaleX, (1 + s * ux - 0.6 * s * uy) * this.playerPop, 0.35),
      lerp(this.player.scaleY, (1 + s * uy - 0.6 * s * ux) * this.playerPop, 0.35),
    );

    const glowTarget = this.glowBaseScale * (1 + 0.45 * danger) * this.playerPop;
    this.playerGlow.setScale(lerp(this.playerGlow.scaleX, glowTarget, 0.25));
    this.playerGlow.setAlpha(0.8 + 0.2 * danger);
  }

  private popPlayer() {
    this.playerPop = PLAYER_POP_SCALE;
    this.player.setScale(PLAYER_POP_SCALE);
  }

  // A thin ring that races outward and fades
  private shockwave(x: number, y: number, color: number, radius: number) {
    const ring = this.add.circle(x, y, 10).setStrokeStyle(2, color, 0.9).setDepth(4);
    this.tweens.add({
      targets: ring,
      radius,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  // Slipped right past a ghost and lived. Close calls in quick succession build a combo:
  // each link pays more XP and gets a bigger ring, a higher chime and a popping "x2", "x3"...
  private closeCall() {
    this.combo = this.comboTicksLeft > 0 ? this.combo + 1 : 1;
    this.comboTicksLeft = COMBO_WINDOW_TICKS;
    const level = Math.min(this.combo, COMBO_MAX);

    this.runStats.closeCalls++;
    this.runStats.closeCallXp += XP_PER_CLOSE_CALL * level;
    this.runStats.bestCombo = Math.max(this.runStats.bestCombo, this.combo);

    this.shockwave(this.player.x, this.player.y, this.comboColor(this.combo), 55 + 12 * (level - 1));
    sfx.closeCall(level);
    if (this.combo >= 2) this.comboPopup(this.combo);
    this.updateComboBadge();
    this.refillBoost();
  }

  // A close call recharges part of the boost; topping it up all the way gets its own little cue
  private refillBoost() {
    if (this.boostCooldown === 0) return;
    this.boostCooldown = Math.max(0, this.boostCooldown - BOOST_REFILL_PER_CLOSE_CALL);
    this.updateBoostUi();
    for (const { button } of this.boostButtons) {
      this.tweens.add({ targets: button.container, scale: { from: 1.18, to: 1 }, duration: 200, ease: 'Back.easeOut' });
    }
    if (this.boostCooldown === 0) {
      sfx.boostReady();
      this.shockwave(this.player.x, this.player.y, COLORS.player, 45);
    }
  }

  private afterimage(alpha: number) {
    const { x, y, fillColor } = this.player;
    const color = trailColor(this.trail, fillColor, this.trailPieces++);
    const piece = addTrailPiece(this, x, y, PLAYER_SIZE, color, alpha, this.trail.shape).setDepth(2);
    this.tweens.add({ targets: piece, alpha: 0, duration: 250, onComplete: () => piece.destroy() });
  }

  // The aurora look drifts through greens and blues as you play
  private tintAurora() {
    this.lookMs += TICK_MS;
    const color = bodyColorAt(this.body, this.lookMs);
    if (color === this.player.fillColor) return;
    this.player.setFillStyle(color);
    setGlowColor(this.playerGlow, color);
  }

  // The ring around each boost button fills up as it recharges; the button dims while it can't fire
  private updateBoostUi() {
    const ready = this.boostCooldown === 0;
    const fill = 1 - this.boostCooldown / BOOST_COOLDOWN_TICKS;
    for (const { button, ring, radius, baseAlpha } of this.boostButtons) {
      button.container.setAlpha(baseAlpha * (ready ? 1 : 0.55));
      const r = radius + 6;
      ring.clear();
      ring.lineStyle(4, COLORS.panelRing, 0.9 * baseAlpha).strokeCircle(0, 0, r);
      if (fill > 0) {
        ring.lineStyle(4, COLORS.player, ready ? baseAlpha : 0.8 * baseAlpha);
        ring.beginPath();
        ring.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + fill * Math.PI * 2, false);
        ring.strokePath();
      }
    }
  }

  private addBoostButton(x: number, y: number, radius: number, baseAlpha: number) {
    const button = iconButton(this, x, y, radius, boostIcon, () => this.tryBoost(), {
      onPress: true, // fires the moment the finger lands
      iconColor: COLORS.player,
    });
    const ring = this.add.graphics().setDepth(5).setPosition(x, y);
    this.boostButtons.push({ button, ring, radius, baseAlpha });
    return { button, ring };
  }

  // The thumb button appears on touch screens, or the first time the game is touched
  private showThumbBoost() {
    if (!this.thumbBoost) return;
    this.thumbBoost.button.container.setVisible(true);
    this.thumbBoost.ring.setVisible(true);
  }

  private nextRound() {
    // Save this round and turn it into a new ghost
    this.recordings.push(this.current);
    const start = this.current.at(0);
    const rect = this.add
      .rectangle(start.x, start.y, PLAYER_SIZE, PLAYER_SIZE, COLORS.ghost)
      .setAlpha(0.15)
      .setDepth(2);
    const trail = this.add.graphics().setDepth(1);
    // Every ghost restarts from its first position, so no one is "near" any more
    for (const g of this.ghosts) {
      g.near = false;
      g.closest = Infinity;
    }
    this.ghosts.push({ recording: this.current, rect, trail, near: false, closest: Infinity });
    this.refreshGhostColors();
    this.showSpawnRings();
    this.burst(this.target.x, this.target.y); // target has not moved yet
    this.shockwave(this.target.x, this.target.y, COLORS.target, 70);
    this.popPlayer();

    // All ghosts restart from tick 0 because tick is shared
    this.current = new Recording();
    this.tick = 0;
    this.bonusTicks = 0;
    this.clearPickup();
    this.score++;
    music.setIntensity(MUSIC_LAYER_ROUNDS.filter((r) => this.score >= r).length); // the music grows with the run
    this.updateTimer(); // after the score changes, so the wall color picks it up
    this.scoreText.setText(String(this.score));
    this.popScore();

    this.flash();
    sfx.pickup();

    if (this.hintText) {
      const hint = this.hintText;
      this.hintText = undefined;
      this.tweens.add({ targets: hint, alpha: 0, duration: 600, onComplete: () => hint.destroy() });
    }

    this.spawnTarget();
    this.maybeSpawnPickup();
  }

  // ---------- Pickups ----------

  private maybeSpawnPickup() {
    if (this.score < PICKUP_MIN_ROUND || Math.random() >= PICKUP_CHANCE) return;

    // The eraser needs a ghost to erase
    const kinds: PickupKind[] = this.ghosts.length > 0 ? ['time', 'eraser'] : ['time'];
    const kind = Phaser.Utils.Array.GetRandom(kinds);

    const { width, height, margin } = ARENA;
    const pad = margin + PICKUP_RADIUS * 2;
    const dist = Phaser.Math.Distance.Between;

    // Aim for the stretch between the player and the target, pushed sideways a little,
    // so grabbing it is a small detour instead of a trip across the arena
    const dx = this.target.x - this.player.x;
    const dy = this.target.y - this.player.y;
    const len = Math.hypot(dx, dy) || 1;
    const sideX = -dy / len;
    const sideY = dx / len;

    for (let attempt = 0; attempt < 60; attempt++) {
      const along = Phaser.Math.FloatBetween(PICKUP_PATH_T_MIN, PICKUP_PATH_T_MAX);
      const side =
        Phaser.Math.FloatBetween(PICKUP_OFFSET_MIN, PICKUP_OFFSET_MAX) * (Math.random() < 0.5 ? -1 : 1);
      const x = Phaser.Math.Clamp(this.player.x + dx * along + sideX * side, pad, width - pad);
      const y = Phaser.Math.Clamp(this.player.y + dy * along + sideY * side, pad, height - pad);
      const ok =
        dist(x, y, this.player.x, this.player.y) >= PICKUP_MIN_DIST_FROM_PLAYER &&
        dist(x, y, this.target.x, this.target.y) >= PICKUP_MIN_DIST_FROM_TARGET &&
        this.recordings.every((r) => dist(x, y, r.end.x, r.end.y) >= TARGET_MIN_DIST_FROM_GHOST_END);
      if (ok) {
        this.createPickup(kind, x, y);
        return;
      }
    }
  }

  private createPickup(kind: PickupKind, x: number, y: number) {
    const color = kind === 'time' ? COLORS.pickupTime : COLORS.pickupEraser;
    const glow = addGlow(this, 0, 0, color, PICKUP_RADIUS * 3.2);
    const icon = kind === 'time' ? this.drawClockIcon(color) : this.drawEraseIcon(color);
    const label = this.add
      .text(0, -PICKUP_RADIUS - 18, kind === 'time' ? '+TIME' : 'ERASE', {
        fontFamily: FONT,
        fontSize: '20px', // smallest size that stays readable when the game is shown at 800x450
        fontStyle: 'bold',
        color: cssColor(color),
      })
      .setOrigin(0.5);

    const body = this.add.container(x, y, [glow, ...icon, label]).setDepth(1).setScale(0);
    this.tweens.add({ targets: body, scale: 1, duration: 300, ease: 'Back.easeOut' }); // pop in
    this.pickup = { kind, x, y, body, ticksLeft: PICKUP_LIFETIME_TICKS };
  }

  // +TIME: a clock face whose hand sweeps round. Drawn around (0, 0) to sit in the pickup's container.
  private drawClockIcon(color: number): Phaser.GameObjects.GameObject[] {
    const r = PICKUP_RADIUS;
    const face = this.add.circle(0, 0, r, COLORS.background, 0.9).setStrokeStyle(2.5, color);
    const marks = this.add.graphics().lineStyle(2, color, 1);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      marks.lineBetween(Math.cos(a) * (r - 6), Math.sin(a) * (r - 6), Math.cos(a) * (r - 3), Math.sin(a) * (r - 3));
    }
    const hand = this.add.rectangle(0, 0, 2.5, r - 4, color).setOrigin(0.5, 1); // pivots on the center
    const hub = this.add.circle(0, 0, 2.5, color);
    this.tweens.add({ targets: hand, angle: 360, duration: 1200, repeat: -1 });
    return [face, marks, hand, hub];
  }

  // ERASE: a spinning diamond marked with an X, sending out shockwave rings that "clear the area"
  private drawEraseIcon(color: number): Phaser.GameObjects.GameObject[] {
    const r = PICKUP_RADIUS;
    const wave = this.add.circle(0, 0, r).setStrokeStyle(2, color, 0.8);
    this.tweens.add({ targets: wave, scale: 2.4, alpha: 0, duration: 900, repeat: -1 });
    const gem = this.add.rectangle(0, 0, r * 1.45, r * 1.45, color);
    const cross = this.add.graphics().lineStyle(3, COLORS.background, 1);
    const s = r * 0.38;
    cross.lineBetween(-s, -s, s, s);
    cross.lineBetween(-s, s, s, -s);
    // Only the gem spins; the X stays put so it always reads as a delete "×", never a "+"
    this.tweens.add({ targets: gem, angle: { from: 45, to: 405 }, duration: 2400, repeat: -1 });
    return [wave, gem, cross];
  }

  // Once per tick: count down, blink near the end, and collect on touch
  private updatePickup() {
    const p = this.pickup;
    if (!p) return;

    if (--p.ticksLeft <= 0) {
      this.clearPickup();
      return;
    }

    const faded = p.ticksLeft < PICKUP_BLINK_TICKS && Math.floor(p.ticksLeft / 6) % 2 === 0;
    p.body.setAlpha(faded ? 0.25 : 1);

    const reach = PLAYER_SIZE / 2 + PICKUP_RADIUS;
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y) < reach) {
      this.collectPickup(p);
    }
  }

  private collectPickup(p: Pickup) {
    const { x, y } = p;
    const color = p.kind === 'time' ? COLORS.pickupTime : COLORS.pickupEraser;
    this.clearPickup();
    this.runStats.pickups++;
    this.burst(x, y, color);
    this.shockwave(x, y, color, 60);
    this.popPlayer();
    sfx.powerup();

    if (p.kind === 'time') {
      this.bonusTicks += PICKUP_TIME_BONUS_TICKS;
      this.updateTimer();
      this.floatText(x, y, `+${((PICKUP_TIME_BONUS_TICKS * TICK_MS) / 1000).toFixed(1)} s`);
    } else {
      const erased = this.eraseOldestGhosts();
      this.floatText(x, y, erased > 1 ? `ERASED ${erased}` : 'ERASED');
    }
  }

  // Removes the oldest share of the ghosts (at least one) and returns how many went.
  // The oldest ghost is index 0 in both lists, which are always pushed together.
  private eraseOldestGhosts(): number {
    const count = Math.min(
      this.ghosts.length,
      Math.max(1, Math.floor(this.ghosts.length * PICKUP_ERASE_FRACTION)),
    );
    for (let i = 0; i < count; i++) {
      const oldest = this.ghosts.shift()!;
      this.recordings.shift();
      this.burst(oldest.rect.x, oldest.rect.y, oldest.rect.fillColor);
      this.tweens.killTweensOf(oldest.rect); // it may be mid near-miss pop
      oldest.rect.destroy();
      oldest.trail.destroy();
    }
    this.refreshGhostColors(); // the survivors are younger now
    this.runStats.erased += count;
    return count;
  }

  private clearPickup() {
    if (!this.pickup) return;
    const { body } = this.pickup;
    this.tweens.killTweensOf([body, ...body.list]);
    body.destroy(); // takes its children with it
    this.pickup = null;
  }

  private floatText(x: number, y: number, text: string) {
    const t = this.add
      .text(x, y, text, { fontFamily: FONT, fontSize: '20px', color: COLORS.text })
      .setOrigin(0.5)
      .setDepth(6);
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  private popScore() {
    this.tweens.killTweensOf(this.scoreText);
    this.scoreText.setScale(SCORE_POP_SCALE);
    this.tweens.add({ targets: this.scoreText, scale: 1, duration: 200, ease: 'Back.easeOut' });
  }

  // A soft wash instead of a camera flash, so the spawn rings stay visible
  private flash() {
    const { width, height } = ARENA;
    const wash = this.add
      .rectangle(width / 2, height / 2, width, height, COLORS.target, PICKUP_FLASH_ALPHA)
      .setDepth(6);
    this.tweens.add({ targets: wash, alpha: 0, duration: PICKUP_FLASH_MS, onComplete: () => wash.destroy() });
  }

  // Newest ghost is COLORS.ghost, older ones drift toward COLORS.ghostOld
  private ghostColor(age: number): number {
    return mixColor(COLORS.ghost, COLORS.ghostOld, Math.min(age / GHOST_AGE_FADE_ROUNDS, 1));
  }

  // Ghosts age every round, so recolor the rects and redraw the trails.
  // A see-through fill with a solid outline gives them a spectral look.
  private refreshGhostColors() {
    const newest = this.ghosts.length - 1;
    this.ghosts.forEach((g, i) => {
      const color = this.ghostColor(newest - i);
      g.rect.setFillStyle(color, 0.45);
      if (!g.near) g.rect.setStrokeStyle(1.5, color, 1);
      this.drawTrail(g.trail, g.recording, color);
    });
  }

  // A ring closes in on each ghost's start point; ghosts become dangerous when it arrives
  private showSpawnRings() {
    const newest = this.ghosts.length - 1;
    this.ghosts.forEach((g, i) => {
      const start = g.recording.at(0);
      const ring = this.add
        .circle(start.x, start.y, SPAWN_RING_RADIUS)
        .setStrokeStyle(2, this.ghostColor(newest - i), 0.8)
        .setDepth(2);
      this.tweens.add({
        targets: ring,
        scale: PLAYER_SIZE / 2 / SPAWN_RING_RADIUS,
        duration: SPAWN_GRACE_TICKS * TICK_MS,
        onComplete: () => ring.destroy(),
      });
    });
  }

  private burst(x: number, y: number, color: number = COLORS.target) {
    for (let i = 0; i < BURST_PARTICLES; i++) {
      const angle = (i / BURST_PARTICLES) * Math.PI * 2 + Math.random() * 0.4;
      const bit = this.add.rectangle(x, y, 8, 8, color).setDepth(4);
      this.tweens.add({
        targets: bit,
        x: x + Math.cos(angle) * BURST_DISTANCE,
        y: y + Math.sin(angle) * BURST_DISTANCE,
        alpha: 0,
        angle: 180,
        duration: BURST_MS,
        onComplete: () => bit.destroy(),
      });
    }
  }

  // Redrawn each round when ghost colors change. A finished recording never changes.
  // WebGL rebuilds every line of a Graphics each frame, so the trail uses every few ticks of the
  // recording: at 5 px per tick that still looks smooth, and it is a fraction of the work with many ghosts.
  private drawTrail(trail: Phaser.GameObjects.Graphics, recording: Recording, color: number) {
    const start = recording.at(0);
    trail.clear();
    trail.lineStyle(GHOST_TRAIL_WIDTH, color, GHOST_TRAIL_ALPHA);
    trail.beginPath();
    trail.moveTo(start.x, start.y);
    for (let i = GHOST_TRAIL_STEP; i < recording.length + GHOST_TRAIL_STEP - 1; i += GHOST_TRAIL_STEP) {
      const p = recording.at(i); // past the end this is the last point, so the trail always ends where the ghost parks
      trail.lineTo(p.x, p.y);
    }
    trail.strokePath();
  }

  private spawnTarget() {
    const { width, height, margin } = ARENA;
    const pad = margin + TARGET_SIZE;
    let x = width / 2;
    let y = height / 2;

    // Try random spots until one is far enough from the player and from parked ghosts
    for (let attempt = 0; attempt < 60; attempt++) {
      x = Phaser.Math.Between(pad, width - pad);
      y = Phaser.Math.Between(pad, height - pad);

      const farFromPlayer =
        Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) >=
        TARGET_MIN_DIST_FROM_PLAYER;
      const farFromGhosts = this.recordings.every(
        (r) => Phaser.Math.Distance.Between(x, y, r.end.x, r.end.y) >= TARGET_MIN_DIST_FROM_GHOST_END,
      );

      if (farFromPlayer && farFromGhosts) break;
    }

    this.target.setPosition(x, y);
    this.targetRing.setPosition(x, y);
    this.targetGlow.setPosition(x, y);

    // Pop in rather than appear
    this.target.setScale(0);
    this.targetRing.setScale(0);
    this.tweens.add({ targets: [this.target, this.targetRing], scale: 1, duration: 260, ease: 'Back.easeOut' });
  }

  // ---------- Collision ----------

  private ghostTouchingPlayer(): Ghost | undefined {
    const reach = PLAYER_SIZE * GHOST_HITBOX_SCALE;
    return this.ghosts.find((g) => this.overlaps(this.player, g.rect, reach));
  }

  // Same reach as getting caught, but every ghost in it (a dash can smash several at once)
  private ghostsInReach(): Ghost[] {
    const reach = PLAYER_SIZE * GHOST_HITBOX_SCALE;
    return this.ghosts.filter((g) => this.overlaps(this.player, g.rect, reach));
  }

  // A dash went through this ghost: it's gone for the rest of the run
  private smashGhost(ghost: Ghost) {
    const i = this.ghosts.indexOf(ghost);
    if (i === -1) return;
    this.ghosts.splice(i, 1);
    const r = this.recordings.indexOf(ghost.recording); // the two lists are kept in step
    if (r !== -1) this.recordings.splice(r, 1);

    const { x, y, fillColor } = ghost.rect;
    this.tweens.killTweensOf(ghost.rect); // it may be mid near-miss pop
    ghost.rect.destroy();
    ghost.trail.destroy();
    this.refreshGhostColors(); // the survivors are younger now

    this.runStats.smashed++;
    this.burst(x, y, fillColor);
    this.burst(x, y, 0xffffff);
    this.shockwave(x, y, fillColor, 80);
    this.cameras.main.shake(70, 0.0025);
    sfx.smash();
    this.floatText(x, y - 10, 'SMASH');
  }

  // Axis-aligned box check: centers closer than `reach` on both axes
  private overlaps(
    a: Phaser.GameObjects.Rectangle,
    b: Phaser.GameObjects.Rectangle,
    reach: number,
  ): boolean {
    return Math.abs(a.x - b.x) < reach && Math.abs(a.y - b.y) < reach;
  }

  // ---------- Input ----------

  private setupInput() {
    const keyboard = this.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.wasd = keyboard.addKeys('W,A,S,D') as WasdKeys;
    this.joystick = this.add.graphics().setDepth(4);

    // No Esc for pause: on CrazyGames (and most portals) Esc leaves fullscreen
    keyboard.on('keydown-P', () => this.togglePause());
    keyboard.on('keydown-M', () => this.toggleMute());
    keyboard.on('keydown-H', () => this.goHome()); // only does something on the game-over and pause screens
    keyboard.on('keydown-R', () => this.restartFromPause()); // only while paused
    keyboard.on('keydown-C', () => {
      if (this.isGameOver) this.goHome(true); // game over: straight to the customize panel
    });
    // Shift, not Space: Space restarts after game over, and boost gets spammed near a death
    keyboard.on('keydown-SHIFT', () => this.tryBoost());

    // Touch / mouse: drag like a virtual joystick from where you pressed down.
    // Only the finger that started the drag steers, so tapping BOOST with a second finger is safe.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (p.wasTouch) this.showThumbBoost();
      if (over.length > 0 || this.touchStart) return; // buttons must not start a drag
      this.touchStart = new Phaser.Math.Vector2(p.worldX, p.worldY); // world space, not canvas pixels
      this.touchPointerId = p.id;
      this.drawJoystick(0, 0, 0);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.touchStart || p.id !== this.touchPointerId || !p.isDown) return;
      const dx = p.worldX - this.touchStart.x;
      const dy = p.worldY - this.touchStart.y;
      const len = Math.hypot(dx, dy);
      this.drawJoystick(dx, dy, len);
      if (len < TOUCH_DEADZONE) this.touchDir.set(0, 0);
      else this.touchDir.set(dx / len, dy / len);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.id !== this.touchPointerId) return;
      this.touchStart = null;
      this.touchPointerId = null;
      this.touchDir.set(0, 0);
      this.joystick.clear();
    });
  }

  // Ring where the drag started, with a knob that follows the finger (clamped to the ring)
  private drawJoystick(dx: number, dy: number, len: number) {
    if (!this.touchStart) return;
    const { x, y } = this.touchStart;
    const k = len > JOYSTICK_RADIUS ? JOYSTICK_RADIUS / len : 1;
    this.joystick.clear();
    this.joystick.lineStyle(2, 0xffffff, 0.25).strokeCircle(x, y, JOYSTICK_RADIUS);
    this.joystick.fillStyle(0xffffff, 0.35).fillCircle(x + dx * k, y + dy * k, 20);
  }

  // ---------- Pause and mute ----------

  private createButtons() {
    const { width, height, margin } = ARENA;

    // Pause is a round icon near the timer; sound lives in the pause menu now
    iconButton(this, width - margin - 118, margin + 28, 24, pauseIcon, () => this.togglePause());

    // Boost: a small icon at the top (Shift on a keyboard), plus a big button under the right thumb
    this.boostButtons = [];
    this.addBoostButton(width / 2, margin + 28, 24, 1);
    this.thumbBoost = this.addBoostButton(width - margin - 96, height - margin - 96, 58, 0.85);
    const touchScreen = this.sys.game.device.input.touch;
    this.thumbBoost.button.container.setVisible(touchScreen);
    this.thumbBoost.ring.setVisible(touchScreen);
    this.updateBoostUi();
  }

  private toggleMute() {
    if (!toggleMuted()) sfx.pickup(); // a blip confirms sound is back on
    this.soundButton?.setIcon(isMuted() ? soundOffIcon : soundOnIcon);
  }

  private togglePause() {
    if (this.isGameOver) return;
    this.isPaused = !this.isPaused;

    if (!this.isPaused) {
      this.pauseUi.forEach((o) => o.destroy());
      this.pauseUi = [];
      this.soundButton = null;
      this.tweens.resumeAll();
      music.start();
      this.accumulator = 0; // no catch-up burst for the time spent paused
      return;
    }

    this.tweens.pauseAll();
    music.stop();
    const { width, height } = ARENA;
    // The dim layer swallows taps, so a stray touch can't steer the player while paused
    const dim = this.add
      .rectangle(width / 2, height / 2, width, height, COLORS.background, 0.78)
      .setDepth(20)
      .setInteractive();
    const title = this.add
      .text(width / 2, 190, 'PAUSED', { fontFamily: FONT, fontSize: '48px', fontStyle: 'bold', color: COLORS.text })
      .setOrigin(0.5)
      .setDepth(21);

    // One big RESUME, then HOME / RESTART / SOUND underneath. Small key letters for keyboard players.
    const resume = iconButton(this, width / 2, 320, 62, playIcon, () => this.togglePause(), {
      fill: COLORS.player,
      ring: COLORS.player,
      iconColor: COLORS.background,
      depth: 21,
    });
    const rowY = 470;
    const gap = 130;
    const home = iconButton(this, width / 2 - gap, rowY, 42, homeIcon, () => this.goHome(), { depth: 21 });
    const restart = iconButton(this, width / 2, rowY, 42, restartIcon, () => this.restartFromPause(), { depth: 21 });
    this.soundButton = iconButton(this, width / 2 + gap, rowY, 42, isMuted() ? soundOffIcon : soundOnIcon, () => this.toggleMute(), {
      depth: 21,
    });
    const keyHint = (x: number, y: number, key: string) =>
      this.add
        .text(x, y, key, { fontFamily: FONT, fontSize: '20px', color: COLORS.textMuted })
        .setOrigin(0.5)
        .setDepth(21);
    this.pauseUi = [
      dim,
      title,
      resume.container,
      home.container,
      restart.container,
      this.soundButton.container,
      keyHint(width / 2, 320 + 62 + 24, 'P'),
      keyHint(width / 2 - gap, rowY + 42 + 24, 'H'),
      keyHint(width / 2, rowY + 42 + 24, 'R'),
      keyHint(width / 2 + gap, rowY + 42 + 24, 'M'),
    ];
  }

  // Restart from the pause menu: the run is abandoned (no XP, no score), like leaving to HOME
  private restartFromPause() {
    if (!this.isPaused || this.leavingHome) return;
    sfx.start();
    this.scene.restart();
  }

  private readInput(): Phaser.Math.Vector2 {
    const left = this.cursors.left.isDown || this.wasd.A.isDown;
    const right = this.cursors.right.isDown || this.wasd.D.isDown;
    const up = this.cursors.up.isDown || this.wasd.W.isDown;
    const down = this.cursors.down.isDown || this.wasd.S.isDown;

    const dir = new Phaser.Math.Vector2(Number(right) - Number(left), Number(down) - Number(up));
    if (dir.lengthSq() > 0) this.steeringByDrag = false;
    else {
      dir.copy(this.touchDir);
      if (this.touchPointerId !== null) this.steeringByDrag = true; // stays set after the finger lifts
    }

    // Diagonal movement shouldn't be faster
    if (dir.lengthSq() > 1) dir.normalize();
    return dir;
  }

  // ---------- Game over ----------

  private gameOver(title = 'CAUGHT BY YOUR PAST', culprit?: Ghost) {
    if (this.isGameOver) return; // only ever once per run (XP and the score are saved here)
    this.isGameOver = true;
    this.hintText?.destroy(); // a run can end before the first target; the hint would sit under HOME
    this.hintText = undefined;
    this.player.setFillStyle(COLORS.playerDead).setStrokeStyle(); // no armed outline on a dead player
    setGlowColor(this.playerGlow, COLORS.playerDead);
    this.cameras.main.shake(SHAKE_MS, SHAKE_INTENSITY);
    sfx.gameOver();
    music.setIntensity(0); // the layers drop away when the run ends

    const { width, height } = ARENA;
    this.add.rectangle(width / 2, height / 2, width, height, COLORS.background, 0.75).setDepth(10);

    // Pull the killer and the player above the dimming overlay and ring the killer
    if (culprit) {
      culprit.rect.setDepth(12).setAlpha(1);
      this.player.setDepth(12);
      this.playerGlow.setDepth(11.5);
      const ring = this.add
        .circle(culprit.rect.x, culprit.rect.y, 34)
        .setStrokeStyle(3, COLORS.playerDead)
        .setDepth(12);
      this.tweens.add({ targets: ring, scale: 1.4, alpha: 0.2, duration: 500, yoyo: true, repeat: -1 });
    }

    this.add
      .text(width / 2, 86, title, { fontFamily: FONT, fontSize: '44px', fontStyle: 'bold', color: COLORS.text })
      .setOrigin(0.5)
      .setDepth(13);

    // A soft card behind the stats, XP and bars, so a culprit ghost that died there doesn't clutter them
    this.add
      .graphics()
      .setDepth(12.5)
      .fillStyle(COLORS.panel, 0.88)
      .fillRoundedRect(width / 2 - 350, 230, 700, 286, 18);

    // Top to bottom: big round count, stat chips, XP, top runs as bars, then round buttons.
    // All information only: Space or RESTART goes straight into the next run.
    const result = submitScore(this.score);
    this.showScore(result.rank === 0);
    this.showRunStats();
    this.showXp();
    this.showBoard(result);
    this.showDeathButtons();

    this.input.keyboard!.once('keydown-SPACE', () => this.restartGame());
  }

  // HOME, a big RESTART, and CUSTOMIZE (straight into the locker), with key letters underneath
  private showDeathButtons() {
    const { width } = ARENA;
    const y = 580;
    const side = 150;
    iconButton(this, width / 2 - side, y, 42, homeIcon, () => this.goHome(), { depth: 13 });
    iconButton(this, width / 2, y, 60, restartIcon, () => this.restartGame(), {
      fill: COLORS.player,
      ring: COLORS.player,
      iconColor: COLORS.background,
      depth: 13,
    });
    const look = lookIcon(this.body.color, this.trail.shape, [0, 1, 2].map((i) => trailColor(this.trail, this.body.color, i * 4)));
    iconButton(this, width / 2 + side, y, 42, look, () => this.goHome(true), { depth: 13 });

    const keyHint = (x: number, key: string) =>
      this.add
        .text(x, y + 60 + 22, key, { fontFamily: FONT, fontSize: '20px', color: COLORS.textMuted })
        .setOrigin(0.5)
        .setDepth(13);
    keyHint(width / 2 - side, 'H');
    keyHint(width / 2, 'SPACE');
    keyHint(width / 2 + side, 'C');
  }

  private restartGame() {
    sfx.start();
    this.scene.restart();
  }

  // Back to the start screen. Only from game over or pause; leaving from pause ends the run
  // without XP or a score. With openLocker the start screen opens straight on the customize panel.
  private goHome(openLocker = false) {
    if (this.leavingHome || !(this.isGameOver || this.isPaused)) return;
    this.leavingHome = true;
    const cam = this.cameras.main;
    cam.fadeOut(200, 13, 15, 20); // matches the background color
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('StartScene', { openLocker }));
  }

  // The run's count, big, with a star badge when it tops the board
  private showScore(isBest: boolean) {
    const { width } = ARENA;
    const count = this.add
      .text(width / 2, 158, String(this.score), { fontFamily: FONT, fontSize: '72px', fontStyle: 'bold', color: COLORS.text })
      .setOrigin(0.5)
      .setDepth(13);
    this.add
      .text(width / 2, 206, this.score === 1 ? 'ROUND' : 'ROUNDS', { fontFamily: FONT, fontSize: '20px', color: COLORS.textMuted })
      .setOrigin(0.5)
      .setDepth(13);
    if (!isBest) return;

    const x = width / 2 + count.width / 2 + 34;
    const star = this.add.graphics().setDepth(13).setPosition(x, 150);
    starIcon(star, 16, COLORS.target);
    const label = this.add
      .text(x + 24, 150, 'NEW BEST', { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: cssColor(COLORS.target) })
      .setOrigin(0, 0.5)
      .setDepth(13);
    for (const part of [star, label]) {
      part.setScale(0);
      this.tweens.add({ targets: part, scale: 1, duration: 320, ease: 'Back.easeOut' });
    }
    this.tweens.add({ targets: star, angle: 360, duration: 4000, repeat: -1 });
  }

  // What happened this run as icon chips: close calls, boosts, pickups (and erased ghosts if any)
  private showRunStats() {
    const { closeCalls, bestCombo, boosts, pickups, erased, smashed } = this.runStats;
    const chips: [IconDrawer, string, number][] = [[closeCallIcon, String(closeCalls), 0xffffff]];
    if (bestCombo >= 2) chips.push([comboIcon, `x${bestCombo}`, this.comboColor(bestCombo)]); // best combo of the run
    chips.push([boostIcon, String(boosts), this.body.color], [pickupIcon, String(pickups), COLORS.pickupTime]);
    if (smashed > 0) chips.push([smashIcon, String(smashed), COLORS.ghost]); // ghosts smashed with a dash
    if (erased > 0) chips.push([erasedIcon, String(erased), COLORS.ghostOld]);

    const y = 258;
    const step = 140;
    chips.forEach(([draw, value, color], i) => {
      const x = ARENA.width / 2 + (i - (chips.length - 1) / 2) * step;
      const icon = this.add.graphics().setDepth(13).setPosition(x - 20, y);
      draw(icon, 14, color);
      this.add
        .text(x + 2, y, value, { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: COLORS.text })
        .setOrigin(0, 0.5)
        .setDepth(13);
    });
  }

  // XP for this run, a level bar that fills up, and any look the run unlocked. One line, no waiting.
  private showXp() {
    const { closeCallXp, pickups, smashed } = this.runStats;
    const res = addXp(runXp({ rounds: this.score, closeCallXp, pickups, smashed }));
    const levelUp = res.levelAfter > res.levelBefore;
    const y = 310;
    const text = (s: string, color: string, bold: boolean) =>
      this.add
        .text(0, y, s, { fontFamily: FONT, fontSize: '20px', fontStyle: bold ? 'bold' : 'normal', color })
        .setOrigin(0, 0.5)
        .setDepth(13);

    const xp = text(`+${res.gained} XP`, cssColor(this.body.color), true);
    const level = levelUp
      ? text(`LEVEL UP! ${res.levelAfter}`, cssColor(COLORS.target), true)
      : text(`LV ${res.levelAfter}`, COLORS.text, false);
    // "NEW BODY: EMBER" / "NEW TRAIL: DOTS", or a count when a big run unlocks several at once
    const [first] = res.unlocked;
    const unlock =
      res.unlocked.length === 1
        ? text(`NEW ${first.kind}: ${first.name}`, cssColor(first.color), true)
        : res.unlocked.length > 1
          ? text(`${res.unlocked.length} NEW ITEMS`, COLORS.text, true)
          : null;

    // Lay the pieces out in one centered row: xp, level, bar, unlock
    const gap = 22;
    const barWidth = 160;
    const barHeight = 8;
    const total = xp.width + level.width + barWidth + (unlock ? unlock.width + gap : 0) + gap * 2;
    let x = ARENA.width / 2 - total / 2;
    xp.setX(x);
    x += xp.width + gap;
    level.setX(x);
    x += level.width + gap;
    const barX = x;
    x += barWidth + gap;
    unlock?.setX(x);

    // The bar shows progress through the current level, filling up from where it was
    const start = xpForLevel(res.levelAfter);
    const span = xpForLevel(res.levelAfter + 1) - start;
    const from = levelUp ? 0 : (res.xpBefore - start) / span;
    const to = (res.xpAfter - start) / span;
    const bar = this.add.graphics().setDepth(13);
    const fill = { p: from };
    const draw = () => {
      bar.clear();
      bar.fillStyle(COLORS.wall, 1).fillRect(barX, y - barHeight / 2, barWidth, barHeight);
      bar.fillStyle(this.body.color, 1).fillRect(barX, y - barHeight / 2, barWidth * fill.p, barHeight);
    };
    draw();
    this.tweens.add({ targets: fill, p: to, duration: 700, ease: 'Cubic.easeOut', onUpdate: draw });

    for (const badge of [levelUp ? level : null, unlock]) {
      if (!badge) continue;
      badge.setScale(0);
      this.tweens.add({ targets: badge, scale: 1, duration: 320, ease: 'Back.easeOut' });
    }
  }

  // Your best runs as bars (top 5, plus this run if it ranked lower), this run in your body color.
  // The bars grow in quickly; nothing waits on them.
  private showBoard({ entries, rank }: { entries: ScoreEntry[]; rank: number }) {
    if (entries.length === 0) return;
    const rows = entries.slice(0, 5).map((entry, index) => ({ entry, index }));
    if (rank >= 5) rows.push({ entry: entries[rank], index: rank });

    const max = Math.max(...entries.map((e) => e.score), 1);
    const left = ARENA.width / 2 - 130;
    const barMax = 260;
    const top = 362;
    const rowHeight = 25;
    const bars = this.add.graphics().setDepth(13);
    const numbers: Phaser.GameObjects.Text[] = [];

    rows.forEach(({ entry, index }, row) => {
      const y = top + row * rowHeight;
      const mine = index === rank;
      const style = { fontFamily: FONT, fontSize: '20px', fontStyle: mine ? 'bold' : 'normal', color: mine ? COLORS.text : COLORS.textMuted };
      this.add.text(left - 16, y, String(index + 1), style).setOrigin(1, 0.5).setDepth(13);
      numbers.push(this.add.text(left, y, String(entry.score), style).setOrigin(0, 0.5).setDepth(13));
    });

    const grow = { p: 0 };
    const draw = () => {
      bars.clear();
      rows.forEach(({ entry, index }, row) => {
        const y = top + row * rowHeight;
        const width = Math.max(10, (barMax * entry.score) / max) * grow.p;
        bars.fillStyle(index === rank ? this.body.color : COLORS.panelRing, 1).fillRoundedRect(left, y - 7, Math.max(width, 1), 14, 7);
        numbers[row].setX(left + width + 10);
      });
    };
    draw();
    this.tweens.add({ targets: grow, p: 1, duration: 450, ease: 'Cubic.easeOut', onUpdate: draw });
  }
}
