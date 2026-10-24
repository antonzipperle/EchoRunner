import Phaser from 'phaser';
import {
  ARENA,
  COLORS,
  GHOST_HITBOX_SCALE,
  GHOST_TRAIL_ALPHA,
  GHOST_TRAIL_WIDTH,
  PLAYER_SIZE,
  PLAYER_SPEED,
  ROUND_TIME_TICKS,
  SPAWN_GRACE_TICKS,
  TARGET_MIN_DIST_FROM_GHOST_END,
  TARGET_MIN_DIST_FROM_PLAYER,
  TARGET_SIZE,
  TICK_MS,
  TOUCH_DEADZONE,
} from '../game/constants';
import { Recording } from '../game/Recording';

type Ghost = {
  recording: Recording;
  rect: Phaser.GameObjects.Rectangle;
};

type WasdKeys = {
  W: Phaser.Input.Keyboard.Key;
  A: Phaser.Input.Keyboard.Key;
  S: Phaser.Input.Keyboard.Key;
  D: Phaser.Input.Keyboard.Key;
};

export class GameScene extends Phaser.Scene {
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

    // Arena wall
    this.add
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

    if (graceOver && this.touchesGhost()) {
      this.gameOver();
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
    this.timerText.setText(remaining.toFixed(1));
    this.timerText.setColor(remaining <= 3 ? COLORS.warning : COLORS.text);
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
    this.ghosts.push({ recording: this.current, rect });
    this.drawTrail(this.current);

    // All ghosts restart from tick 0 because tick is shared
    this.current = new Recording();
    this.tick = 0;
    this.updateTimer();
    this.score++;
    this.scoreText.setText(String(this.score));

    this.cameras.main.flash(80, 246, 195, 68, false);

    if (this.hintText) {
      const hint = this.hintText;
      this.hintText = undefined;
      this.tweens.add({ targets: hint, alpha: 0, duration: 600, onComplete: () => hint.destroy() });
    }

    this.spawnTarget();
  }

  // Drawn once per recording, since a finished recording never changes
  private drawTrail(recording: Recording) {
    const start = recording.at(0);
    const trail = this.add.graphics().setDepth(1);
    trail.lineStyle(GHOST_TRAIL_WIDTH, COLORS.ghost, GHOST_TRAIL_ALPHA);
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

  private touchesGhost(): boolean {
    const reach = PLAYER_SIZE * GHOST_HITBOX_SCALE;
    return this.ghosts.some((g) => this.overlaps(this.player, g.rect, reach));
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

  private gameOver(title = 'CAUGHT BY YOUR PAST') {
    this.isGameOver = true;
    this.player.setFillStyle(COLORS.playerDead);
    this.cameras.main.shake(200, 0.01);

    const { width, height } = ARENA;
    this.add.rectangle(width / 2, height / 2, width, height, COLORS.background, 0.75).setDepth(10);

    this.add
      .text(width / 2, height / 2 - 90, title, {
        fontFamily: 'monospace',
        fontSize: '48px',
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(11);

    this.add
      .text(width / 2, height / 2 - 25, `Rounds survived: ${this.score}`, {
        fontFamily: 'monospace',
        fontSize: '26px',
        color: COLORS.textMuted,
      })
      .setOrigin(0.5)
      .setDepth(11);

    const button = this.add
      .rectangle(width / 2, height / 2 + 60, 240, 64, COLORS.player)
      .setDepth(11)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(width / 2, height / 2 + 60, 'RESTART', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#0d0f14',
      })
      .setOrigin(0.5)
      .setDepth(12);

    button.on('pointerover', () => button.setAlpha(0.85));
    button.on('pointerout', () => button.setAlpha(1));
    button.on('pointerup', () => this.scene.restart());

    this.add
      .text(width / 2, height / 2 + 120, 'or press Space', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: COLORS.textMuted,
      })
      .setOrigin(0.5)
      .setDepth(11);

    this.input.keyboard!.once('keydown-SPACE', () => this.scene.restart());
  }
}
