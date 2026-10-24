import Phaser from 'phaser';
import {
  ARENA,
  BOOST_COOLDOWN_TICKS,
  BOOST_SPEED_MULT,
  BOOST_TICKS,
  BURST_DISTANCE,
  BURST_MS,
  BURST_PARTICLES,
  COLORS,
  GHOST_AGE_FADE_ROUNDS,
  GHOST_HITBOX_SCALE,
  GHOST_TRAIL_ALPHA,
  GHOST_TRAIL_WIDTH,
  GRID_ALPHA,
  GRID_SIZE,
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
  PLAYER_SIZE,
  PLAYER_SPEED,
  ROUND_TIME_MIN_TICKS,
  ROUND_TIME_SHRINK_TICKS,
  ROUND_TIME_TICKS,
  SCORE_POP_SCALE,
  SPAWN_GRACE_TICKS,
  SPAWN_RING_RADIUS,
  TARGET_MIN_DIST_FROM_GHOST_END,
  TARGET_MIN_DIST_FROM_PLAYER,
  TARGET_SIZE,
  TICK_MS,
  TIMER_WARNING_SECONDS,
  TOUCH_DEADZONE,
  WALL_SHIFT_ROUNDS,
} from '../game/constants';
import { Recording } from '../game/Recording';
import { submitScore, type ScoreEntry } from '../game/leaderboard';
import { isMuted, sfx, toggleMuted } from '../game/sound';

type Ghost = {
  recording: Recording;
  rect: Phaser.GameObjects.Rectangle;
  trail: Phaser.GameObjects.Graphics;
};

type PickupKind = 'time' | 'eraser';

type Pickup = {
  kind: PickupKind;
  disc: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
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
  private player!: Phaser.GameObjects.Rectangle;
  private target!: Phaser.GameObjects.Rectangle;
  private scoreText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private hintText?: Phaser.GameObjects.Text;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WasdKeys;
  private touchStart: Phaser.Math.Vector2 | null = null;
  private touchPointerId: number | null = null; // the finger that owns the drag
  private touchDir = new Phaser.Math.Vector2();

  private boostTicksLeft = 0; // ticks of boosted speed remaining
  private boostCooldown = 0; // ticks until the next boost; not reset between rounds
  private lastDir = new Phaser.Math.Vector2(1, 0); // so boosting while standing still still dashes
  private boostButton!: Phaser.GameObjects.Text;
  private boostBar!: Phaser.GameObjects.Graphics;

  private recordings: Recording[] = [];
  private current = new Recording();
  private ghosts: Ghost[] = [];

  private pickup: Pickup | null = null;
  private bonusTicks = 0; // extra time from pickups, for this round only

  private tick = 0; // tick within the current round
  private accumulator = 0; // leftover time for the fixed timestep
  private score = 0;
  private isGameOver = false;
  private isPaused = false;
  private pauseUi: Phaser.GameObjects.GameObject[] = [];
  private soundButton!: Phaser.GameObjects.Text;

  constructor() {
    super('GameScene');
  }

  create() {
    // scene.restart() reuses this instance, so reset all state here
    this.recordings = [];
    this.current = new Recording();
    this.ghosts = [];
    this.tick = 0;
    this.accumulator = 0;
    this.score = 0;
    this.isGameOver = false;
    this.isPaused = false;
    this.pauseUi = [];
    this.pickup = null;
    this.bonusTicks = 0;
    this.touchStart = null;
    this.touchPointerId = null;
    this.touchDir.set(0, 0);
    this.boostTicksLeft = 0;
    this.boostCooldown = 0;
    this.lastDir.set(1, 0);

    const { width, height, margin } = ARENA;

    this.drawGrid();

    // Arena wall
    this.wall = this.add
      .rectangle(width / 2, height / 2, width - margin * 2, height - margin * 2)
      .setStrokeStyle(2, COLORS.wall);

    this.target = this.add.rectangle(0, 0, TARGET_SIZE, TARGET_SIZE, COLORS.target).setDepth(1);
    this.tweens.add({ targets: this.target, angle: 360, duration: 3000, repeat: -1 });

    this.player = this.add
      .rectangle(width / 2, height / 2, PLAYER_SIZE, PLAYER_SIZE, COLORS.player)
      .setDepth(3);

    this.scoreText = this.add
      .text(margin + 12, margin + 10, '0', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: COLORS.text,
      })
      .setDepth(5);

    this.timerText = this.add
      .text(width - margin - 12, margin + 10, '', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: COLORS.text,
      })
      .setOrigin(1, 0)
      .setDepth(5);
    this.updateTimer();

    this.hintText = this.add
      .text(width / 2, height - margin - 30, 'Grab the yellow square. Avoid your past.', {
        fontFamily: 'monospace',
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
    this.movePlayer();
    this.tickBoost();
    this.current.push(this.player.x, this.player.y);

    const graceOver = this.tick >= SPAWN_GRACE_TICKS;
    for (const ghost of this.ghosts) {
      const p = ghost.recording.at(this.tick);
      ghost.rect.setPosition(p.x, p.y);
      ghost.rect.setAlpha(graceOver ? 0.45 : 0.15);
    }

    const caughtBy = graceOver ? this.ghostTouchingPlayer() : undefined;
    if (caughtBy) {
      this.gameOver(undefined, caughtBy);
      return;
    }

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
    this.updateWall(warning);
  }

  // Wall color follows the score; in the last seconds of a round it pulses red instead
  private updateWall(warning: boolean) {
    if (warning) {
      const pulse = 0.5 + 0.5 * Math.sin(this.tick * 0.35);
      this.wall.setStrokeStyle(2, COLORS.playerDead, 0.4 + 0.6 * pulse);
      return;
    }
    const t = Math.min(this.score / WALL_SHIFT_ROUNDS, 1);
    this.wall.setStrokeStyle(2, this.mixColor(COLORS.wall, COLORS.wallHot, t));
  }

  private drawGrid() {
    const { width, height, margin } = ARENA;
    const grid = this.add.graphics().setDepth(-1);
    grid.lineStyle(1, COLORS.wall, GRID_ALPHA);
    for (let x = margin + GRID_SIZE; x < width - margin; x += GRID_SIZE) {
      grid.lineBetween(x, margin, x, height - margin);
    }
    for (let y = margin + GRID_SIZE; y < height - margin; y += GRID_SIZE) {
      grid.lineBetween(margin, y, width - margin, y);
    }
  }

  private movePlayer() {
    let dir = this.readInput();
    if (dir.lengthSq() > 0) this.lastDir.copy(dir);

    const boosting = this.boostTicksLeft > 0;
    if (boosting && dir.lengthSq() === 0) dir = this.lastDir; // dash even when no key is held
    const speed = PLAYER_SPEED * (boosting ? BOOST_SPEED_MULT : 1);

    const dt = TICK_MS / 1000;
    const half = PLAYER_SIZE / 2;
    const { width, height, margin } = ARENA;

    this.player.x = Phaser.Math.Clamp(
      this.player.x + dir.x * speed * dt,
      margin + half,
      width - margin - half,
    );
    this.player.y = Phaser.Math.Clamp(
      this.player.y + dir.y * speed * dt,
      margin + half,
      height - margin - half,
    );
  }

  // ---------- Boost ----------

  private tryBoost() {
    if (this.isGameOver || this.isPaused || this.boostCooldown > 0) return;
    this.boostTicksLeft = BOOST_TICKS;
    this.boostCooldown = BOOST_COOLDOWN_TICKS;
    sfx.boost();
    this.updateBoostUi();
  }

  // Once per tick, after the player has moved
  private tickBoost() {
    if (this.boostTicksLeft > 0) {
      this.afterimage();
      this.boostTicksLeft--;
    }
    if (this.boostCooldown > 0) this.boostCooldown--;
    this.updateBoostUi();
  }

  private afterimage() {
    const ghost = this.add
      .rectangle(this.player.x, this.player.y, PLAYER_SIZE, PLAYER_SIZE, COLORS.player, 0.5)
      .setDepth(2);
    this.tweens.add({ targets: ghost, alpha: 0, duration: 250, onComplete: () => ghost.destroy() });
  }

  private updateBoostUi() {
    const ready = this.boostCooldown === 0;
    this.boostButton.setColor(ready ? COLORS.text : COLORS.textMuted);

    // Recharge bar under the button: full when ready
    const barWidth = 100;
    const { x, y } = this.boostButton;
    const fill = 1 - this.boostCooldown / BOOST_COOLDOWN_TICKS;
    this.boostBar.clear();
    this.boostBar.fillStyle(COLORS.wall, 1).fillRect(x - barWidth / 2, y + 14, barWidth, 3);
    this.boostBar.fillStyle(COLORS.player, 1).fillRect(x - barWidth / 2, y + 14, barWidth * fill, 3);
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
    this.ghosts.push({ recording: this.current, rect, trail });
    this.refreshGhostColors();
    this.showSpawnRings();
    this.burst(this.target.x, this.target.y); // target has not moved yet

    // All ghosts restart from tick 0 because tick is shared
    this.current = new Recording();
    this.tick = 0;
    this.bonusTicks = 0;
    this.clearPickup();
    this.score++;
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
    const disc = this.add.circle(x, y, PICKUP_RADIUS, color).setDepth(1);
    const label = this.add
      .text(x, y - PICKUP_RADIUS - 12, kind === 'time' ? '+TIME' : 'ERASE', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(1);
    this.tweens.add({ targets: disc, scale: 1.25, duration: 400, yoyo: true, repeat: -1 });
    this.pickup = { kind, disc, label, ticksLeft: PICKUP_LIFETIME_TICKS };
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
    p.disc.setAlpha(faded ? 0.25 : 1);
    p.label.setAlpha(faded ? 0.25 : 1);

    const reach = PLAYER_SIZE / 2 + PICKUP_RADIUS;
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, p.disc.x, p.disc.y) < reach) {
      this.collectPickup(p);
    }
  }

  private collectPickup(p: Pickup) {
    const { x, y } = p.disc;
    const color = p.kind === 'time' ? COLORS.pickupTime : COLORS.pickupEraser;
    this.clearPickup();
    this.burst(x, y, color);
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
      oldest.rect.destroy();
      oldest.trail.destroy();
    }
    this.refreshGhostColors(); // the survivors are younger now
    return count;
  }

  private clearPickup() {
    if (!this.pickup) return;
    this.tweens.killTweensOf(this.pickup.disc);
    this.pickup.disc.destroy();
    this.pickup.label.destroy();
    this.pickup = null;
  }

  private floatText(x: number, y: number, text: string) {
    const t = this.add
      .text(x, y, text, { fontFamily: 'monospace', fontSize: '20px', color: COLORS.text })
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

  // t from 0 (all `from`) to 1 (all `to`)
  private mixColor(from: number, to: number, t: number): number {
    const { ValueToColor, Interpolate, GetColor } = Phaser.Display.Color;
    const c = Interpolate.ColorWithColor(ValueToColor(from), ValueToColor(to), 100, t * 100);
    return GetColor(c.r, c.g, c.b);
  }

  // Newest ghost is COLORS.ghost, older ones drift toward COLORS.ghostOld
  private ghostColor(age: number): number {
    return this.mixColor(COLORS.ghost, COLORS.ghostOld, Math.min(age / GHOST_AGE_FADE_ROUNDS, 1));
  }

  // Ghosts age every round, so recolor the rects and redraw the trails
  private refreshGhostColors() {
    const newest = this.ghosts.length - 1;
    this.ghosts.forEach((g, i) => {
      const color = this.ghostColor(newest - i);
      g.rect.setFillStyle(color);
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
  private drawTrail(trail: Phaser.GameObjects.Graphics, recording: Recording, color: number) {
    const start = recording.at(0);
    trail.clear();
    trail.lineStyle(GHOST_TRAIL_WIDTH, color, GHOST_TRAIL_ALPHA);
    trail.beginPath();
    trail.moveTo(start.x, start.y);
    for (let i = 1; i < recording.length; i++) {
      const p = recording.at(i);
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
  }

  // ---------- Collision ----------

  private ghostTouchingPlayer(): Ghost | undefined {
    const reach = PLAYER_SIZE * GHOST_HITBOX_SCALE;
    return this.ghosts.find((g) => this.overlaps(this.player, g.rect, reach));
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

    keyboard.on('keydown-P', () => this.togglePause());
    keyboard.on('keydown-ESC', () => this.togglePause());
    keyboard.on('keydown-M', () => this.toggleMute());
    // Shift, not Space: Space restarts after game over, and boost gets spammed near a death
    keyboard.on('keydown-SHIFT', () => this.tryBoost());

    // Touch / mouse: drag like a virtual joystick from where you pressed down.
    // Only the finger that started the drag steers, so tapping BOOST with a second finger is safe.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length > 0 || this.touchStart) return; // buttons must not start a drag
      this.touchStart = new Phaser.Math.Vector2(p.x, p.y);
      this.touchPointerId = p.id;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.touchStart || p.id !== this.touchPointerId || !p.isDown) return;
      const dx = p.x - this.touchStart.x;
      const dy = p.y - this.touchStart.y;
      const len = Math.hypot(dx, dy);
      if (len < TOUCH_DEADZONE) this.touchDir.set(0, 0);
      else this.touchDir.set(dx / len, dy / len);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.id !== this.touchPointerId) return;
      this.touchStart = null;
      this.touchPointerId = null;
      this.touchDir.set(0, 0);
    });
  }

  // ---------- Pause and mute ----------

  private createButtons() {
    const { width, margin } = ARENA;
    const style = { fontFamily: 'monospace', fontSize: '16px', color: COLORS.textMuted };
    const y = margin + 24;

    const pause = this.add
      .text(width / 2 - 170, y, 'PAUSE [P]', style)
      .setOrigin(0.5)
      .setDepth(5)
      .setInteractive({ useHandCursor: true });
    pause.on('pointerup', () => this.togglePause());

    this.boostButton = this.add
      .text(width / 2, y, 'BOOST [SHIFT]', style)
      .setOrigin(0.5)
      .setDepth(5)
      .setInteractive({ useHandCursor: true });
    this.boostButton.on('pointerdown', () => this.tryBoost()); // on press, not release, for snappy taps
    this.boostBar = this.add.graphics().setDepth(5);
    this.updateBoostUi();

    this.soundButton = this.add
      .text(width / 2 + 170, y, '', style)
      .setOrigin(0.5)
      .setDepth(5)
      .setInteractive({ useHandCursor: true });
    this.soundButton.on('pointerup', () => this.toggleMute());
    this.updateSoundLabel();
  }

  private updateSoundLabel() {
    this.soundButton.setText(isMuted() ? 'SOUND OFF [M]' : 'SOUND ON [M]');
  }

  private toggleMute() {
    if (!toggleMuted()) sfx.pickup(); // a blip confirms sound is back on
    this.updateSoundLabel();
  }

  private togglePause() {
    if (this.isGameOver) return;
    this.isPaused = !this.isPaused;

    if (!this.isPaused) {
      this.pauseUi.forEach((o) => o.destroy());
      this.pauseUi = [];
      this.tweens.resumeAll();
      this.accumulator = 0; // no catch-up burst for the time spent paused
      return;
    }

    this.tweens.pauseAll();
    const { width, height } = ARENA;
    const dim = this.add
      .rectangle(width / 2, height / 2, width, height, COLORS.background, 0.7)
      .setDepth(20)
      .setInteractive();
    dim.on('pointerup', () => this.togglePause()); // tap anywhere to resume
    const title = this.add
      .text(width / 2, height / 2 - 20, 'PAUSED', {
        fontFamily: 'monospace',
        fontSize: '48px',
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(21);
    const hint = this.add
      .text(width / 2, height / 2 + 35, 'P, Esc or tap to resume', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: COLORS.textMuted,
      })
      .setOrigin(0.5)
      .setDepth(21);
    this.pauseUi = [dim, title, hint];
  }

  private readInput(): Phaser.Math.Vector2 {
    const left = this.cursors.left.isDown || this.wasd.A.isDown;
    const right = this.cursors.right.isDown || this.wasd.D.isDown;
    const up = this.cursors.up.isDown || this.wasd.W.isDown;
    const down = this.cursors.down.isDown || this.wasd.S.isDown;

    const dir = new Phaser.Math.Vector2(Number(right) - Number(left), Number(down) - Number(up));
    if (dir.lengthSq() === 0) dir.copy(this.touchDir);

    // Diagonal movement shouldn't be faster
    if (dir.lengthSq() > 1) dir.normalize();
    return dir;
  }

  // ---------- Game over ----------

  private gameOver(title = 'CAUGHT BY YOUR PAST', culprit?: Ghost) {
    this.isGameOver = true;
    this.player.setFillStyle(COLORS.playerDead);
    this.cameras.main.shake(200, 0.01);
    sfx.gameOver();

    const { width, height } = ARENA;
    this.add.rectangle(width / 2, height / 2, width, height, COLORS.background, 0.75).setDepth(10);

    // Pull the killer and the player above the dimming overlay and ring the killer
    if (culprit) {
      culprit.rect.setDepth(12).setAlpha(1);
      this.player.setDepth(12);
      const ring = this.add
        .circle(culprit.rect.x, culprit.rect.y, 34)
        .setStrokeStyle(3, COLORS.playerDead)
        .setDepth(12);
      this.tweens.add({ targets: ring, scale: 1.4, alpha: 0.2, duration: 500, yoyo: true, repeat: -1 });
    }

    this.add
      .text(width / 2, 90, title, {
        fontFamily: 'monospace',
        fontSize: '48px',
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(13);

    this.add
      .text(width / 2, 145, `Rounds survived: ${this.score}`, {
        fontFamily: 'monospace',
        fontSize: '26px',
        color: COLORS.textMuted,
      })
      .setOrigin(0.5)
      .setDepth(13);

    this.showLeaderboard(submitScore(this.score));

    const button = this.add
      .rectangle(width / 2, 540, 240, 64, COLORS.player)
      .setDepth(13)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(width / 2, 540, 'RESTART', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#0d0f14',
      })
      .setOrigin(0.5)
      .setDepth(14);

    button.on('pointerover', () => button.setAlpha(0.85));
    button.on('pointerout', () => button.setAlpha(1));
    button.on('pointerup', () => this.scene.restart());

    this.add
      .text(width / 2, 600, 'or press Space', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: COLORS.textMuted,
      })
      .setOrigin(0.5)
      .setDepth(13);

    this.input.keyboard!.once('keydown-SPACE', () => this.scene.restart());
  }

  private showLeaderboard({ entries, rank }: { entries: ScoreEntry[]; rank: number }) {
    const { width } = ARENA;
    const top = 200;
    const rowHeight = 26;

    if (entries.length === 0) {
      this.add
        .text(width / 2, top, 'No scores yet', {
          fontFamily: 'monospace',
          fontSize: '20px',
          color: COLORS.textMuted,
        })
        .setOrigin(0.5)
        .setDepth(13);
      return;
    }

    entries.forEach((entry, i) => {
      const isThisRun = i === rank;
      const line =
        `${String(i + 1).padStart(2)}.  ${String(entry.score).padStart(3)} rounds  ${entry.date}` +
        (isThisRun ? '  <- you' : '');
      this.add
        .text(width / 2, top + i * rowHeight, line, {
          fontFamily: 'monospace',
          fontSize: '20px',
          color: isThisRun ? '#4fd1c5' : COLORS.textMuted,
        })
        .setOrigin(0.5, 0)
        .setDepth(13);
    });
  }
}
