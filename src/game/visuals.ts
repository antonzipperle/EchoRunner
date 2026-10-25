import Phaser from 'phaser';
import { ARENA, COLORS, GRID_ALPHA, GRID_SIZE } from './constants';

// Faint grid inside the arena, shared by the start screen and the game
export function drawGrid(scene: Phaser.Scene) {
  const { width, height, margin } = ARENA;
  const grid = scene.add.graphics().setDepth(-1);
  grid.lineStyle(1, COLORS.wall, GRID_ALPHA);
  for (let x = margin + GRID_SIZE; x < width - margin; x += GRID_SIZE) {
    grid.lineBetween(x, margin, x, height - margin);
  }
  for (let y = margin + GRID_SIZE; y < height - margin; y += GRID_SIZE) {
    grid.lineBetween(margin, y, width - margin, y);
  }
}

// A soft pool of light in the middle of the screen, so the background is not flat black
export function drawBackdrop(scene: Phaser.Scene) {
  const key = 'backdrop';
  if (!scene.textures.exists(key)) {
    const w = 320;
    const h = 180;
    const tex = scene.textures.createCanvas(key, w, h)!;
    const ctx = tex.getContext();
    ctx.setTransform(1, 0, 0, h / w, 0, 0); // squash a circle into an ellipse that fits 16:9
    const grad = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grad.addColorStop(0, 'rgba(70, 84, 130, 0.22)');
    grad.addColorStop(1, 'rgba(70, 84, 130, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, w);
    tex.refresh();
  }
  scene.add
    .image(ARENA.width / 2, ARENA.height / 2, key)
    .setDisplaySize(ARENA.width, ARENA.height)
    .setDepth(-2);
}

// Round glow texture in one color, generated once and cached. Separate textures per color
// (instead of tinting one white texture) so glows also work with the Canvas renderer.
function glowTexture(scene: Phaser.Scene, color: number): string {
  const key = `glow-${color.toString(16)}`;
  if (!scene.textures.exists(key)) {
    const size = 128;
    const tex = scene.textures.createCanvas(key, size, size)!;
    const ctx = tex.getContext();
    const { r, g, b } = Phaser.Display.Color.IntegerToRGB(color);
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.55)`);
    grad.addColorStop(0.35, `rgba(${r}, ${g}, ${b}, 0.2)`);
    grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
  }
  return key;
}

// An additive glow of the given radius, to sit behind a shape of the same color
export function addGlow(scene: Phaser.Scene, x: number, y: number, color: number, radius: number) {
  return scene.add
    .image(x, y, glowTexture(scene, color))
    .setDisplaySize(radius * 2, radius * 2)
    .setBlendMode(Phaser.BlendModes.ADD);
}

export function setGlowColor(glow: Phaser.GameObjects.Image, color: number) {
  glow.setTexture(glowTexture(glow.scene, color)); // same texture size, so the glow keeps its scale
}

// One fading piece of a player trail, in the look's shape
export function addTrailPiece(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
  color: number,
  alpha: number,
  shape: 'square' | 'dot' | 'diamond' | 'spark',
): Phaser.GameObjects.Shape {
  if (shape === 'dot') return scene.add.circle(x, y, size * 0.4, color, alpha);
  if (shape === 'spark') {
    // A small speck scattered around the path: looks like sparks flying off (visual only)
    const jitter = size * 0.45;
    return scene.add.circle(x + (Math.random() - 0.5) * 2 * jitter, y + (Math.random() - 0.5) * 2 * jitter, size * 0.14, color, Math.min(1, alpha * 2));
  }
  const piece = scene.add.rectangle(x, y, size, size, color, alpha);
  if (shape === 'diamond') piece.setAngle(45).setScale(0.75);
  return piece;
}

// t from 0 (all `from`) to 1 (all `to`)
export function mixColor(from: number, to: number, t: number): number {
  const { ValueToColor, Interpolate, GetColor } = Phaser.Display.Color;
  const c = Interpolate.ColorWithColor(ValueToColor(from), ValueToColor(to), 100, t * 100);
  return GetColor(c.r, c.g, c.b);
}

// '#rrggbb' for text styles
export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
