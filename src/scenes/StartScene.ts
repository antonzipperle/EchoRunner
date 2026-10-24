import Phaser from 'phaser';
import {
  ARENA,
  COLORS,
  PLAYER_SIZE,
  SPAWN_RING_RADIUS,
  START_GHOST_COUNT,
  START_GHOST_LAG,
  START_GHOST_REVEAL_MS,
  START_LAP_MS,
  TARGET_SIZE,
} from '../game/constants';
import { applyHiResCamera } from '../game/hiRes';
import { loadScores } from '../game/leaderboard';
import { isMuted, music, sfx, toggleMuted } from '../game/sound';
import { addGlow, drawBackdrop, drawGrid, mixColor } from '../game/visuals';

const TITLE = 'ECHO RUNNER';
const TITLE_SIZE = 104;
const LETTER_STEP = 72; // horizontal distance between letters
const TITLE_Y = 150;

// The demo runs on a figure-eight in the middle of the screen
const DEMO = { cx: ARENA.width / 2, cy: 435, ax: 430, by: 95 };
const GHOST_HOLD_MS = 3000; // all ghosts stay visible this long before the demo resets
const GHOST_FADE_OUT_MS = 500;

type TitleLetter = {
  main: Phaser.GameObjects.Text;
  echo: Phaser.GameObjects.Text; // red copy that trails the letter, like the game's ghosts
  baseX: number;
  index: number;
};

// A point on the figure-eight for lap angle t (radians)
function pathPos(t: number) {
  return { x: DEMO.cx + DEMO.ax * Math.sin(t), y: DEMO.cy + DEMO.by * Math.sin(2 * t) };
}

export class StartScene extends Phaser.Scene {
  private elapsed = 0;
  private lastPhase = 0;
  private afterimageTimer = 0;
  private started = false;

  private letters: TitleLetter[] = [];
  private subtitle!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;
  private extras: Phaser.GameObjects.Text[] = []; // best score and controls, fade in with the subtitle
  private soundButton!: Phaser.GameObjects.Text;

  private runner!: Phaser.GameObjects.Rectangle;
  private runnerGlow!: Phaser.GameObjects.Image;
  private target!: Phaser.GameObjects.Rectangle;
  private targetRing!: Phaser.GameObjects.Rectangle;
  private ghosts: Phaser.GameObjects.Rectangle[] = [];

  constructor() {
    super('StartScene');
  }

  create() {
    // scene.start() reuses this instance, so reset all state here
    this.elapsed = 0;
    this.lastPhase = 0;
    this.afterimageTimer = 0;
    this.started = false;
    this.letters = [];
    this.extras = [];
    this.ghosts = [];

    applyHiResCamera(this);
    this.cameras.main.fadeIn(300, 13, 15, 20); // matches the background color
    drawBackdrop(this);
    drawGrid(this);

    this.createDemo();
    this.createTitle();
    this.createTexts();
    this.setupInput();

    // Exposed in dev mode only, for debugging in the browser console
    if (import.meta.env.DEV) {
      (window as unknown as { scene: StartScene }).scene = this;
    }
  }

  // ---------- Setup ----------

  private createDemo() {
    // The track the runner follows
    const track = this.add.graphics().setDepth(0);
    track.lineStyle(2, COLORS.wall, 0.9);
    track.beginPath();
    for (let i = 0; i <= 160; i++) {
      const p = pathPos((i / 160) * Math.PI * 2);
      if (i === 0) track.moveTo(p.x, p.y);
      else track.lineTo(p.x, p.y);
    }
    track.strokePath();

    // The yellow target sits at the far right of the figure-eight, like the one in the game
    const end = pathPos(Math.PI / 2);
    addGlow(this, end.x, end.y, COLORS.target, 56).setDepth(0.5);
    this.targetRing = this.add
      .rectangle(end.x, end.y, TARGET_SIZE + 16, TARGET_SIZE + 16)
      .setStrokeStyle(2, COLORS.target, 0.6)
      .setDepth(1);
    this.target = this.add.rectangle(end.x, end.y, TARGET_SIZE, TARGET_SIZE, COLORS.target).setDepth(1);

    // Oldest ghost is violet, newest is red, styled like the game's ghosts
    for (let i = 0; i < START_GHOST_COUNT; i++) {
      const age = 1 - i / Math.max(START_GHOST_COUNT - 1, 1);
      const color = mixColor(COLORS.ghost, COLORS.ghostOld, age);
      this.ghosts.push(
        this.add
          .rectangle(0, 0, PLAYER_SIZE, PLAYER_SIZE, color, 0.45)
          .setStrokeStyle(1.5, color, 1)
          .setDepth(2)
          .setAlpha(0),
      );
    }

    this.runnerGlow = addGlow(this, 0, 0, COLORS.player, 44).setDepth(2.5);
    this.runner = this.add.rectangle(0, 0, PLAYER_SIZE, PLAYER_SIZE, COLORS.player).setDepth(3);
  }

  private createTitle() {
    const style = { fontFamily: 'monospace', fontSize: `${TITLE_SIZE}px`, fontStyle: 'bold' };
    [...TITLE].forEach((char, i) => {
      if (char === ' ') return;
      const baseX = ARENA.width / 2 + (i - (TITLE.length - 1) / 2) * LETTER_STEP;
      const echo = this.add
        .text(baseX, TITLE_Y, char, { ...style, color: '#e05d6f' })
        .setOrigin(0.5)
        .setDepth(4)
        .setAlpha(0);
      const main = this.add
        .text(baseX, TITLE_Y, char, { ...style, color: COLORS.text })
        .setOrigin(0.5)
        .setDepth(5)
        .setAlpha(0);
      this.letters.push({ main, echo, baseX, index: i });
    });
  }

  private createTexts() {
    const { width } = ARENA;
    const text = (x: number, y: number, s: string, size: number, color: string) =>
      this.add
        .text(x, y, s, { fontFamily: 'monospace', fontSize: `${size}px`, color })
        .setOrigin(0.5)
        .setDepth(5)
        .setAlpha(0);

    this.subtitle = text(width / 2, 245, 'Every round you finish comes back to hunt you.', 26, COLORS.textMuted);
    this.prompt = text(width / 2, 600, 'PRESS SPACE OR TAP TO START', 32, '#4fd1c5');
    this.extras.push(
      text(width / 2, 650, 'WASD / ARROWS  move     SHIFT  boost     P  pause     M  sound', 18, COLORS.textMuted),
    );

    const best = loadScores()[0];
    if (best) {
      this.extras.push(text(width / 2, 292, `BEST  ${best.score} ${best.score === 1 ? 'round' : 'rounds'}`, 20, '#f6c344'));
    }

    this.soundButton = this.add
      .text(ARENA.width - ARENA.margin - 12, ARENA.height - ARENA.margin - 14, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: COLORS.textMuted,
      })
      .setOrigin(1, 0.5)
      .setDepth(5)
      .setInteractive({ useHandCursor: true });
    this.soundButton.on('pointerup', () => this.toggleSound());
    this.updateSoundLabel();
  }

  private setupInput() {
    const keyboard = this.input.keyboard!;
    keyboard.on('keydown-SPACE', () => this.start());
    keyboard.on('keydown-ENTER', () => this.start());
    keyboard.on('keydown-M', () => this.toggleSound());

    // Tap or click anywhere that is not a button
    this.input.on('pointerup', (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length === 0) this.start();
    });
  }

  private updateSoundLabel() {
    this.soundButton.setText(isMuted() ? 'SOUND OFF [M]' : 'SOUND ON [M]');
  }

  private toggleSound() {
    if (!toggleMuted()) sfx.pickup(); // a blip confirms sound is back on
    this.updateSoundLabel();
  }

  private start() {
    if (this.started) return;
    this.started = true;
    // Inside a key press or tap, so this also unlocks audio for the browser
    sfx.start();
    music.start();

    const cam = this.cameras.main;
    cam.fadeOut(250, 13, 15, 20);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('GameScene', { fromMenu: true });
    });
  }

  // ---------- Animation ----------

  update(_time: number, delta: number) {
    this.elapsed += delta;
    this.updateTitle();
    this.updateDemo(delta);

    const intro = Phaser.Math.Clamp((this.elapsed - 1300) / 500, 0, 1);
    this.subtitle.setAlpha(intro);
    this.extras.forEach((t) => t.setAlpha(intro));

    // The start prompt fades in last, then breathes
    const promptIn = Phaser.Math.Clamp((this.elapsed - 1800) / 500, 0, 1);
    this.prompt.setAlpha(promptIn * (0.65 + 0.35 * Math.sin(this.elapsed / 350)));
  }

  // Letters drop in one after another and then ride a slow wave; the red echo trails each one
  private updateTitle() {
    for (const { main, echo, baseX, index } of this.letters) {
      const slot = index * 70;
      const placeLetter = (obj: Phaser.GameObjects.Text, delay: number, lag: number, dx: number, dy: number, max: number) => {
        const p = Phaser.Math.Clamp((this.elapsed - slot - delay) / 500, 0, 1);
        const drop = (1 - Phaser.Math.Easing.Back.Out(p)) * -90;
        const wave = Math.sin(this.elapsed / 450 + index * 0.6 - lag) * 5 * p;
        obj.setPosition(baseX + dx, TITLE_Y + dy + drop + wave);
        obj.setAlpha(p * max);
      };
      placeLetter(echo, 380, 0.7, -8, 8, 0.3);
      placeLetter(main, 200, 0, 0, 0, 1);
    }
  }

  private updateDemo(delta: number) {
    const lap = (this.elapsed / START_LAP_MS) * Math.PI * 2;
    const runnerPos = pathPos(lap);
    this.runner.setPosition(runnerPos.x, runnerPos.y);
    this.runnerGlow.setPosition(runnerPos.x, runnerPos.y);

    // Fading afterimages behind the runner
    this.afterimageTimer += delta;
    if (this.afterimageTimer >= 45) {
      this.afterimageTimer = 0;
      const trail = this.add
        .rectangle(runnerPos.x, runnerPos.y, PLAYER_SIZE, PLAYER_SIZE, COLORS.player, 0.4)
        .setDepth(2);
      this.tweens.add({ targets: trail, alpha: 0, duration: 300, onComplete: () => trail.destroy() });
    }

    this.target.setAngle(this.elapsed / 8);
    this.target.setScale(1 + 0.1 * Math.sin(this.elapsed / 300));
    this.targetRing.setAngle(-this.elapsed / 11);

    // Ghosts are the runner's earlier laps, appearing one at a time and then vanishing together
    const cycle = START_GHOST_REVEAL_MS * (START_GHOST_COUNT + 1) + GHOST_HOLD_MS;
    const phase = this.elapsed % cycle;
    this.ghosts.forEach((ghost, i) => {
      const revealAt = (i + 1) * START_GHOST_REVEAL_MS;
      const p = pathPos(lap - (i + 1) * START_GHOST_LAG);
      ghost.setPosition(p.x, p.y);

      let alpha = Phaser.Math.Clamp((phase - revealAt) / 300, 0, 1) * 0.85;
      if (phase > cycle - GHOST_FADE_OUT_MS) alpha *= (cycle - phase) / GHOST_FADE_OUT_MS;
      ghost.setAlpha(alpha);

      // A ring closes in on the ghost the moment it appears, like the spawn rings in the game
      if (this.lastPhase < revealAt && phase >= revealAt) this.spawnRing(p.x, p.y, ghost.fillColor);
    });
    this.lastPhase = phase;
  }

  private spawnRing(x: number, y: number, color: number) {
    const ring = this.add.circle(x, y, SPAWN_RING_RADIUS).setStrokeStyle(2, color, 0.8).setDepth(2);
    this.tweens.add({
      targets: ring,
      scale: PLAYER_SIZE / 2 / SPAWN_RING_RADIUS,
      duration: 500,
      onComplete: () => ring.destroy(),
    });
  }
}
