import Phaser from 'phaser';
import {
  ARENA,
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
  PICKUP_FLASH_MS,
  PLAYER_SIZE,
  PLAYER_SPEED,
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
import { sfx } from '../game/sound';

type Ghost = {
  recording: Recording;
  rect: Phaser.GameObjects.Rectangle;
  trail: Phaser.GameObjects.Graphics;
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
  private touchDir = new Phaser.Math.Vector2();

  private recordings: Recording[] = [];
  private current = new Recording();
  private ghosts: Ghost[] = [];

  private tick = 0; // tick within the current round
  private accumulator = 0; // leftover time for the fixed timestep
  private score = 0;
  private isGameOver = false;

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
    this.touchStart = null;
    this.touchDir.set(0, 0);

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
    this.spawnTarget();

    // Exposed in dev mode only, for debugging in the browser console
    if (import.meta.env.DEV) {
      (window as unknown as { scene: GameScene }).scene = this;
    }
  }

  update(_time: number, delta: number) {
    if (this.isGameOver) return;

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

    this.tick++;
    this.updateTimer();

    if (this.tick >= ROUND_TIME_TICKS) this.gameOver('OUT OF TIME');
  }

  private updateTimer() {
    const remaining = Math.max(0, ROUND_TIME_TICKS - this.tick) * (TICK_MS / 1000);
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
    const dir = this.readInput();
    const dt = TICK_MS / 1000;
    const half = PLAYER_SIZE / 2;
    const { width, height, margin } = ARENA;

    this.player.x = Phaser.Math.Clamp(
      this.player.x + dir.x * PLAYER_SPEED * dt,
      margin + half,
      width - margin - half,
    );
    this.player.y = Phaser.Math.Clamp(
      this.player.y + dir.y * PLAYER_SPEED * dt,
      margin + half,
      height - margin - half,
    );
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

  private burst(x: number, y: number) {
    for (let i = 0; i < BURST_PARTICLES; i++) {
      const angle = (i / BURST_PARTICLES) * Math.PI * 2 + Math.random() * 0.4;
      const bit = this.add.rectangle(x, y, 8, 8, COLORS.target).setDepth(4);
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

    // Touch / mouse: drag like a virtual joystick from where you pressed down
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.touchStart = new Phaser.Math.Vector2(p.x, p.y);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.touchStart || !p.isDown) return;
      const dx = p.x - this.touchStart.x;
      const dy = p.y - this.touchStart.y;
      const len = Math.hypot(dx, dy);
      if (len < TOUCH_DEADZONE) this.touchDir.set(0, 0);
      else this.touchDir.set(dx / len, dy / len);
    });
    this.input.on('pointerup', () => {
      this.touchStart = null;
      this.touchDir.set(0, 0);
    });
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
