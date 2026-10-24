import Phaser from 'phaser';
import { ARENA, RENDER_SCALE } from './constants';

// Sharp rendering. The canvas is RENDER_SCALE times bigger than the game space (see main.ts),
// each scene's camera zooms by the same factor so game coordinates stay 1280x720, and text is
// rasterized at that scale so it maps 1:1 onto canvas pixels instead of being stretched.

type TextFactory = (
  x: number,
  y: number,
  text: string | string[],
  style?: Phaser.Types.GameObjects.Text.TextStyle,
) => Phaser.GameObjects.Text;

// Makes every `scene.add.text(...)` render at RENDER_SCALE. Call once before creating the game.
export function enableHiResText() {
  const factory = Phaser.GameObjects.GameObjectFactory.prototype as unknown as { text: TextFactory };
  const original = factory.text;
  factory.text = function (this: unknown, x, y, text, style) {
    return original.call(this, x, y, text, { resolution: RENDER_SCALE, ...style });
  };
}

// Call at the top of every scene's create(): zoom in and keep the 1280x720 game space centered.
export function applyHiResCamera(scene: Phaser.Scene) {
  scene.cameras.main.setZoom(RENDER_SCALE).centerOn(ARENA.width / 2, ARENA.height / 2);
}
