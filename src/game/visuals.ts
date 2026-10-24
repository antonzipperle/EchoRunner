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

// t from 0 (all `from`) to 1 (all `to`)
export function mixColor(from: number, to: number, t: number): number {
  const { ValueToColor, Interpolate, GetColor } = Phaser.Display.Color;
  const c = Interpolate.ColorWithColor(ValueToColor(from), ValueToColor(to), 100, t * 100);
  return GetColor(c.r, c.g, c.b);
}
