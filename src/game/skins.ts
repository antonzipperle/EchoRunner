import Phaser from 'phaser';

// Two kinds of unlockable look that can be mixed freely: the BODY (the player's color) and the
// TRAIL it leaves behind. Body colors stay clear of the ghosts' red and violet, the target's
// yellow and the pickups' green and white, so the player never blends in.
export type Body = {
  id: string;
  name: string;
  level: number; // level needed to unlock it
  color: number;
  aurora?: boolean; // color slowly drifts through green, cyan and blue
};

export type TrailShape = 'square' | 'dot' | 'diamond' | 'spark';

export type Trail = {
  id: string;
  name: string;
  level: number;
  shape: TrailShape;
  prism?: boolean; // each piece takes the next color of the rainbow instead of the body's
};

export const BODIES: Body[] = [
  { id: 'classic', name: 'CLASSIC', level: 1, color: 0x4fd1c5 },
  { id: 'sky', name: 'SKY', level: 2, color: 0x5ab0ff },
  { id: 'ember', name: 'EMBER', level: 4, color: 0xff9f43 },
  { id: 'frost', name: 'FROST', level: 6, color: 0xb8f2ff },
  { id: 'neon', name: 'NEON', level: 8, color: 0xb6f23d },
  { id: 'comet', name: 'COMET', level: 10, color: 0x00e5ff },
  { id: 'aurora', name: 'AURORA', level: 13, color: 0x4fd1c5, aurora: true },
];

export const TRAILS: Trail[] = [
  { id: 'squares', name: 'SQUARES', level: 1, shape: 'square' },
  { id: 'dots', name: 'DOTS', level: 3, shape: 'dot' },
  { id: 'diamonds', name: 'DIAMONDS', level: 5, shape: 'diamond' },
  { id: 'sparks', name: 'SPARKS', level: 7, shape: 'spark' },
  { id: 'prism', name: 'PRISM', level: 11, shape: 'diamond', prism: true },
];

// The body's color at a given moment (ms). Aurora's hue is stepped so only a few glow textures get made.
export function bodyColorAt(body: Body, ms: number): number {
  if (!body.aurora) return body.color;
  const steps = 24;
  const wave = 0.5 + 0.5 * Math.sin(ms * 0.0015);
  const hue = 0.25 + 0.37 * (Math.round(wave * steps) / steps); // green to blue
  return Phaser.Display.Color.HSVToRGB(hue, 0.6, 1).color;
}

// A trail piece's color: the body's, or for PRISM the next step around the color wheel
export function trailColor(trail: Trail, bodyColor: number, piece: number): number {
  if (!trail.prism) return bodyColor;
  return Phaser.Display.Color.HSVToRGB((piece * 0.045) % 1, 0.55, 1).color;
}
