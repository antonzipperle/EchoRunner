import Phaser from 'phaser';
import {
  ARENA,
  COLORS,
  FONT,
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
import {
  getLevel,
  getXp,
  nextUnlockLevel,
  selectBody,
  selectedBody,
  selectedTrail,
  selectTrail,
  xpForLevel,
} from '../game/progress';
import { BODIES, TRAILS, bodyColorAt, trailColor, type Body, type Trail } from '../game/skins';
import { isMuted, music, sfx, toggleMuted } from '../game/sound';
import {
  closeIcon,
  iconButton,
  lockIcon,
  lookIcon,
  playIcon,
  soundOffIcon,
  soundOnIcon,
  type IconButton,
} from '../game/ui';
import { addGlow, addTrailPiece, drawBackdrop, drawGrid, mixColor, setGlowColor } from '../game/visuals';

const TITLE = 'ECHO RUNNER';
const TITLE_SIZE = 104;
const LETTER_STEP = 72; // horizontal distance between letters
const TITLE_Y = 150;

// The demo runs on a figure-eight in the middle of the screen
const DEMO = { cx: ARENA.width / 2, cy: 425, ax: 430, by: 95 };
const GHOST_HOLD_MS = 3000; // all ghosts stay visible this long before the demo resets
const GHOST_FADE_OUT_MS = 500;
const BUTTON_Y = 605; // the row of round buttons: customize, play, sound

// The locker (customize overlay)
const TILE = 84; // tiles are big enough to hit with a thumb
const TILE_STEP = 104;
const BODY_ROW_Y = 335;
const TRAIL_ROW_Y = 480;
const PREVIEW = { cx: ARENA.width / 2, cy: 200, ax: 210, by: 32 };

type TitleLetter = {
  main: Phaser.GameObjects.Text;
  echo: Phaser.GameObjects.Text; // red copy that trails the letter, like the game's ghosts
  baseX: number;
  index: number;
};

type Tile = {
  id: string;
  level: number;
  homeX: number;
  box: Phaser.GameObjects.Graphics;
  container: Phaser.GameObjects.Container;
};

// A point on a figure-eight for lap angle t (radians)
function figureEight(p: { cx: number; cy: number; ax: number; by: number }, t: number) {
  return { x: p.cx + p.ax * Math.sin(t), y: p.cy + p.by * Math.sin(2 * t) };
}

export class StartScene extends Phaser.Scene {
  private elapsed = 0;
  private lastPhase = 0;
  private afterimageTimer = 0;
  private started = false;

  private letters: TitleLetter[] = [];
  private subtitle!: Phaser.GameObjects.Text;
  // Fade in right away (buttons must not appear late); the subtitle comes a little after the title
  private quickFade: (Phaser.GameObjects.Text | Phaser.GameObjects.Graphics | Phaser.GameObjects.Container)[] = [];

  private body: Body = BODIES[0];
  private trail: Trail = TRAILS[0];
  private trailPieces = 0;

  private runner!: Phaser.GameObjects.Rectangle;
  private runnerGlow!: Phaser.GameObjects.Image;
  private target!: Phaser.GameObjects.Rectangle;
  private targetRing!: Phaser.GameObjects.Rectangle;
  private ghosts: Phaser.GameObjects.Rectangle[] = [];

  private playButton!: IconButton;
  private lookButton!: IconButton;
  private soundButton!: IconButton;

  private locker: Phaser.GameObjects.Container | null = null;
  private lockerRunner!: Phaser.GameObjects.Rectangle;
  private lockerGlow!: Phaser.GameObjects.Image;
  private lockerTimer = 0;
  private bodyTiles: Tile[] = [];
  private trailTiles: Tile[] = [];

  constructor() {
    super('StartScene');
  }

  create(data?: { openLocker?: boolean }) {
    // scene.start() reuses this instance, so reset all state here
    this.elapsed = 0;
    this.lastPhase = 0;
    this.afterimageTimer = 0;
    this.started = false;
    this.letters = [];
    this.quickFade = [];
    this.ghosts = [];
    this.locker = null;
    this.bodyTiles = [];
    this.trailTiles = [];
    this.body = selectedBody();
    this.trail = selectedTrail();
    this.trailPieces = 0;

    applyHiResCamera(this);
    this.cameras.main.fadeIn(300, 13, 15, 20); // matches the background color
    drawBackdrop(this);
    drawGrid(this);

    this.createDemo();
    this.createTitle();
    this.createInfo();
    this.createButtons();
    this.setupInput();
    this.applyLook();
    if (data?.openLocker) this.openLocker(); // came from the CUSTOMIZE button on the game-over screen

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
      const p = figureEight(DEMO, (i / 160) * Math.PI * 2);
      if (i === 0) track.moveTo(p.x, p.y);
      else track.lineTo(p.x, p.y);
    }
    track.strokePath();

    // The yellow target sits at the far right of the figure-eight, like the one in the game
    const end = figureEight(DEMO, Math.PI / 2);
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
    const style = { fontFamily: FONT, fontSize: `${TITLE_SIZE}px`, fontStyle: 'bold' };
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

  // Subtitle, then one row with the best score and the level bar
  private createInfo() {
    const { width } = ARENA;
    const text = (x: number, y: number, s: string, size: number, color: string) =>
      this.add
        .text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color })
        .setOrigin(0.5)
        .setDepth(5)
        .setAlpha(0);

    this.subtitle = text(width / 2, 238, 'Every round you finish comes back to hunt you.', 26, COLORS.textMuted);

    const rowY = 284;
    const best = loadScores()[0];
    const xp = getXp();
    const level = getLevel();
    const bestText = best ? text(0, rowY, `BEST ${best.score}`, 20, '#f6c344') : null;
    const levelText = text(0, rowY, `LEVEL ${level}`, 20, COLORS.text);
    const barWidth = 120;
    const gap = 36;
    const total = (bestText ? bestText.width + gap : 0) + levelText.width + 14 + barWidth;
    let x = width / 2 - total / 2;
    if (bestText) {
      bestText.setOrigin(0, 0.5).setX(x);
      x += bestText.width + gap;
    }
    levelText.setOrigin(0, 0.5).setX(x);
    x += levelText.width + 14;
    const progress = (xp - xpForLevel(level)) / (xpForLevel(level + 1) - xpForLevel(level));
    const bar = this.add.graphics().setDepth(5).setAlpha(0);
    bar.fillStyle(COLORS.wall, 1).fillRect(x, rowY - 3, barWidth, 6);
    bar.fillStyle(COLORS.player, 1).fillRect(x, rowY - 3, barWidth * progress, 6);
    this.quickFade.push(...(bestText ? [bestText] : []), levelText, bar);
  }

  // Customize, a big PLAY, and sound. Small key letters under them for keyboard players.
  private createButtons() {
    const { width } = ARENA;
    const side = 150;
    this.lookButton = iconButton(this, width / 2 - side, BUTTON_Y, 38, lookIcon(COLORS.player, 'square', []), () => this.openLocker());
    this.playButton = iconButton(this, width / 2, BUTTON_Y, 56, playIcon, () => this.start(), {
      fill: COLORS.player,
      ring: COLORS.player,
      iconColor: COLORS.background,
    });
    this.soundButton = iconButton(this, width / 2 + side, BUTTON_Y, 38, isMuted() ? soundOffIcon : soundOnIcon, () => this.toggleSound());
    this.quickFade.push(this.lookButton.container, this.playButton.container, this.soundButton.container);

    const keyHint = (x: number, s: string) =>
      this.add
        .text(x, BUTTON_Y + 56 + 22, s, { fontFamily: FONT, fontSize: '20px', color: COLORS.textMuted })
        .setOrigin(0.5)
        .setDepth(5)
        .setAlpha(0);
    this.quickFade.push(keyHint(width / 2 - side, 'C'), keyHint(width / 2, 'SPACE'), keyHint(width / 2 + side, 'M'));
    this.quickFade.forEach((o) => o.setAlpha(0));
  }

  private setupInput() {
    const keyboard = this.input.keyboard!;
    keyboard.on('keydown-SPACE', () => (this.locker ? this.closeLocker() : this.start()));
    keyboard.on('keydown-ENTER', () => (this.locker ? this.closeLocker() : this.start()));
    keyboard.on('keydown-C', () => (this.locker ? this.closeLocker() : this.openLocker()));
    keyboard.on('keydown-M', () => this.toggleSound());
    // In the locker: left/right pick a body, up/down pick a trail
    keyboard.on('keydown-LEFT', () => this.cycle('body', -1));
    keyboard.on('keydown-RIGHT', () => this.cycle('body', 1));
    keyboard.on('keydown-UP', () => this.cycle('trail', -1));
    keyboard.on('keydown-DOWN', () => this.cycle('trail', 1));
  }

  private toggleSound() {
    if (!toggleMuted()) sfx.pickup(); // a blip confirms sound is back on
    this.soundButton.setIcon(isMuted() ? soundOffIcon : soundOnIcon);
  }

  private start() {
    if (this.started || this.locker) return;
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

  // ---------- Look ----------

  // Show the chosen body and trail on the demo runner, the customize button and the locker
  private applyLook() {
    const color = bodyColorAt(this.body, this.elapsed);
    this.runner.setFillStyle(color);
    setGlowColor(this.runnerGlow, color);
    const trailColors = [0, 1, 2].map((i) => trailColor(this.trail, color, i * 4));
    this.lookButton.setIcon(lookIcon(color, this.trail.shape, trailColors));
    if (this.locker) {
      this.lockerRunner.setFillStyle(color);
      setGlowColor(this.lockerGlow, color);
      this.refreshTiles();
    }
  }

  // ---------- Locker (customize overlay) ----------

  private openLocker() {
    if (this.locker || this.started) return;
    const { width, height } = ARENA;
    const layer = this.add.container(0, 0).setDepth(30);
    this.locker = layer;

    // Dim everything behind and swallow taps, then a panel
    const dim = this.add.rectangle(width / 2, height / 2, width, height, COLORS.background, 0.86).setInteractive();
    const panel = this.add.graphics();
    panel.fillStyle(COLORS.panel, 0.97).fillRoundedRect(150, 60, width - 300, 600, 24);
    panel.lineStyle(3, COLORS.panelRing, 1).strokeRoundedRect(150, 60, width - 300, 600, 24);
    layer.add([dim, panel]);

    // Live preview: a runner looping a small figure-eight in the chosen look
    const track = this.add.graphics().lineStyle(2, COLORS.wall, 0.9);
    track.beginPath();
    for (let i = 0; i <= 120; i++) {
      const p = figureEight(PREVIEW, (i / 120) * Math.PI * 2);
      if (i === 0) track.moveTo(p.x, p.y);
      else track.lineTo(p.x, p.y);
    }
    track.strokePath();
    this.lockerGlow = addGlow(this, PREVIEW.cx, PREVIEW.cy, COLORS.player, 44);
    this.lockerRunner = this.add.rectangle(PREVIEW.cx, PREVIEW.cy, PLAYER_SIZE, PLAYER_SIZE, COLORS.player);
    layer.add([track, this.lockerGlow, this.lockerRunner]);

    const close = iconButton(this, width - 200, 110, 30, closeIcon, () => this.closeLocker(), { depth: 0 });
    layer.add(close.container);

    // Two rows of tiles: bodies, then trails. Short row labels on the left.
    const label = (y: number, s: string) =>
      this.add.text(210, y, s, { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: COLORS.textMuted }).setOrigin(0, 0.5);
    layer.add([label(BODY_ROW_Y, 'BODY'), label(TRAIL_ROW_Y, 'TRAIL')]);

    const firstX = 360;
    this.bodyTiles = BODIES.map((b, i) => this.makeTile(firstX + i * TILE_STEP, BODY_ROW_Y, b.id, b.level, () => this.pick('body', b.id)));
    this.trailTiles = TRAILS.map((t, i) => this.makeTile(firstX + i * TILE_STEP, TRAIL_ROW_Y, t.id, t.level, () => this.pick('trail', t.id)));
    layer.add([...this.bodyTiles, ...this.trailTiles].map((t) => t.container));

    // Footer: level bar and what unlocks next
    const level = getLevel();
    const xp = getXp();
    const progress = (xp - xpForLevel(level)) / (xpForLevel(level + 1) - xpForLevel(level));
    const next = nextUnlockLevel();
    const footer = this.add
      .text(width / 2 - 20, 600, next ? `LEVEL ${level}   ·   NEXT UNLOCK AT ${next}` : `LEVEL ${level}   ·   ALL UNLOCKED`, {
        fontFamily: FONT,
        fontSize: '20px',
        color: COLORS.textMuted,
      })
      .setOrigin(1, 0.5);
    const bar = this.add.graphics();
    bar.fillStyle(COLORS.wall, 1).fillRect(width / 2, 597, 200, 6);
    bar.fillStyle(COLORS.player, 1).fillRect(width / 2, 597, 200 * progress, 6);
    layer.add([footer, bar]);

    layer.setAlpha(0);
    this.tweens.add({ targets: layer, alpha: 1, duration: 150 });
    this.applyLook();
  }

  private closeLocker() {
    const layer = this.locker;
    if (!layer) return;
    this.locker = null;
    this.tweens.add({ targets: layer, alpha: 0, duration: 120, onComplete: () => layer.destroy() });
  }

  private makeTile(x: number, y: number, id: string, level: number, onTap: () => void): Tile {
    const box = this.add.graphics();
    const container = this.add.container(x, y, [box]);
    box.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-TILE / 2, -TILE / 2, TILE, TILE),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });
    box.on('pointerdown', () => container.setScale(0.93));
    box.on('pointerout', () => container.setScale(1));
    box.on('pointerup', () => {
      container.setScale(1);
      onTap();
    });
    return { id, level, homeX: x, box, container };
  }

  // Redraw every tile: its item, a lock and level number if locked, and a ring if selected
  private refreshTiles() {
    const level = getLevel();
    const bodyColor = bodyColorAt(this.body, this.elapsed);
    const draw = (tile: Tile, selected: boolean, paint: (g: Phaser.GameObjects.Graphics) => void) => {
      const g = tile.box;
      const locked = tile.level > level;
      g.clear();
      g.fillStyle(COLORS.panelLight, 1).fillRoundedRect(-TILE / 2, -TILE / 2, TILE, TILE, 14);
      if (selected) g.lineStyle(4, 0xffffff, 0.95).strokeRoundedRect(-TILE / 2, -TILE / 2, TILE, TILE, 14);
      if (locked) lockIcon(g, 0, -6, 30, COLORS.panelRing);
      else paint(g);
      // Level number for locked items, as small text in the tile
      const old = tile.container.getByName('lv') as Phaser.GameObjects.Text | null;
      if (locked && !old) {
        tile.container.add(
          this.add
            .text(0, 24, `LV ${tile.level}`, { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: COLORS.textMuted })
            .setOrigin(0.5)
            .setName('lv'),
        );
      }
    };

    for (const tile of this.bodyTiles) {
      const b = BODIES.find((x) => x.id === tile.id)!;
      draw(tile, b.id === this.body.id, (g) => {
        const s = 34;
        const c = b.aurora ? bodyColorAt(b, this.elapsed) : b.color;
        g.fillStyle(c, 1).fillRect(-s / 2, -s / 2, s, s);
      });
    }
    for (const tile of this.trailTiles) {
      const t = TRAILS.find((x) => x.id === tile.id)!;
      draw(tile, t.id === this.trail.id, (g) => {
        // Four pieces of the trail, fading from left to right, in the current body color
        for (let i = 0; i < 4; i++) {
          const px = -27 + i * 18;
          const c = trailColor(t, bodyColor, i * 4);
          const a = 0.3 + i * 0.22;
          g.fillStyle(c, a);
          if (t.shape === 'dot') g.fillCircle(px, 0, 7);
          else if (t.shape === 'spark') {
            g.fillCircle(px - 3, -6 + (i % 2) * 10, 3);
            g.fillCircle(px + 4, 5 - (i % 2) * 9, 2.5);
          } else if (t.shape === 'diamond') {
            g.fillPoints([new Phaser.Geom.Point(px, -9), new Phaser.Geom.Point(px + 9, 0), new Phaser.Geom.Point(px, 9), new Phaser.Geom.Point(px - 9, 0)], true);
          } else g.fillRect(px - 7, -7, 14, 14);
        }
      });
    }
  }

  private pick(kind: 'body' | 'trail', id: string) {
    const level = getLevel();
    const item = kind === 'body' ? BODIES.find((b) => b.id === id)! : TRAILS.find((t) => t.id === id)!;
    const tiles = kind === 'body' ? this.bodyTiles : this.trailTiles;
    if (item.level > level) {
      // Locked: a little shake says "not yet"
      const tile = tiles.find((t) => t.id === id)!;
      this.tweens.killTweensOf(tile.container);
      tile.container.x = tile.homeX; // repeated taps must not walk the tile sideways
      this.tweens.add({ targets: tile.container, x: tile.homeX + 6, duration: 50, yoyo: true, repeat: 2 });
      return;
    }
    if (kind === 'body') {
      this.body = item as Body;
      selectBody(id);
    } else {
      this.trail = item as Trail;
      selectTrail(id);
    }
    sfx.pickup();
    this.applyLook();
  }

  // Keyboard: step to the next unlocked body or trail (only while the locker is open)
  private cycle(kind: 'body' | 'trail', dir: number) {
    if (!this.locker) return;
    const level = getLevel();
    const list = (kind === 'body' ? BODIES : TRAILS).filter((i) => i.level <= level);
    if (list.length < 2) return;
    const current = kind === 'body' ? this.body.id : this.trail.id;
    const i = list.findIndex((x) => x.id === current);
    this.pick(kind, list[(i + dir + list.length) % list.length].id);
  }

  // ---------- Animation ----------

  update(_time: number, delta: number) {
    this.elapsed += delta;
    this.updateTitle();
    this.updateDemo(delta);

    // Buttons and the info row are there almost at once; the subtitle follows the title
    const quick = Phaser.Math.Clamp((this.elapsed - 150) / 300, 0, 1);
    this.quickFade.forEach((o) => o.setAlpha(quick));
    this.subtitle.setAlpha(Phaser.Math.Clamp((this.elapsed - 1300) / 500, 0, 1));

    if (this.body.aurora && bodyColorAt(this.body, this.elapsed) !== this.runner.fillColor) this.applyLook();
    if (this.locker) this.updateLocker(delta);
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
    const runnerPos = figureEight(DEMO, lap);
    this.runner.setPosition(runnerPos.x, runnerPos.y);
    this.runnerGlow.setPosition(runnerPos.x, runnerPos.y);

    // Fading trail behind the runner, in the chosen trail's shape
    this.afterimageTimer += delta;
    if (this.afterimageTimer >= 45) {
      this.afterimageTimer = 0;
      this.spawnTrailPiece(runnerPos.x, runnerPos.y, 2, null);
    }

    this.target.setAngle(this.elapsed / 8);
    this.target.setScale(1 + 0.1 * Math.sin(this.elapsed / 300));
    this.targetRing.setAngle(-this.elapsed / 11);

    // Ghosts are the runner's earlier laps, appearing one at a time and then vanishing together
    const cycle = START_GHOST_REVEAL_MS * (START_GHOST_COUNT + 1) + GHOST_HOLD_MS;
    const phase = this.elapsed % cycle;
    this.ghosts.forEach((ghost, i) => {
      const revealAt = (i + 1) * START_GHOST_REVEAL_MS;
      const p = figureEight(DEMO, lap - (i + 1) * START_GHOST_LAG);
      ghost.setPosition(p.x, p.y);

      let alpha = Phaser.Math.Clamp((phase - revealAt) / 300, 0, 1) * 0.85;
      if (phase > cycle - GHOST_FADE_OUT_MS) alpha *= (cycle - phase) / GHOST_FADE_OUT_MS;
      ghost.setAlpha(alpha);

      // A ring closes in on the ghost the moment it appears, like the spawn rings in the game
      if (this.lastPhase < revealAt && phase >= revealAt) this.spawnRing(p.x, p.y, ghost.fillColor);
    });
    this.lastPhase = phase;
  }

  // The locker's preview runner loops its own small figure-eight
  private updateLocker(delta: number) {
    const p = figureEight(PREVIEW, (this.elapsed / 3200) * Math.PI * 2);
    this.lockerRunner.setPosition(p.x, p.y);
    this.lockerGlow.setPosition(p.x, p.y);
    this.lockerTimer += delta;
    if (this.lockerTimer >= 40) {
      this.lockerTimer = 0;
      this.spawnTrailPiece(p.x, p.y, 0, this.locker);
    }
  }

  private spawnTrailPiece(x: number, y: number, depth: number, into: Phaser.GameObjects.Container | null) {
    const color = trailColor(this.trail, this.runner.fillColor, this.trailPieces++);
    const piece = addTrailPiece(this, x, y, PLAYER_SIZE, color, 0.4, this.trail.shape).setDepth(depth);
    // Locker pieces live inside the locker so they draw above its panel, just under the runner
    if (into) into.addAt(piece, into.getIndex(this.lockerGlow));
    this.tweens.add({ targets: piece, alpha: 0, duration: 300, onComplete: () => piece.destroy() });
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
