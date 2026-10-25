import Phaser from 'phaser';

// Player looks, unlocked by level. Colors stay clear of the ghosts' red and violet,
// the target's yellow and the pickups' green and white, so the player never blends in.
export type TrailShape = 'square' | 'dot' | 'diamond';

export type Skin = {
  id: string;
  name: string;
  level: number; // level needed to unlock it
  color: number;
  trail: TrailShape;
  aurora?: boolean; // color slowly drifts through green, cyan and blue
};

export const SKINS: Skin[] = [
  { id: 'classic', name: 'CLASSIC', level: 1, color: 0x4fd1c5, trail: 'square' },
  { id: 'sky', name: 'SKY', level: 2, color: 0x5ab0ff, trail: 'square' },
  { id: 'bubbles', name: 'BUBBLES', level: 3, color: 0x4fd1c5, trail: 'dot' },
  { id: 'ember', name: 'EMBER', level: 4, color: 0xff9f43, trail: 'square' },
  { id: 'frost', name: 'FROST', level: 6, color: 0xb8f2ff, trail: 'diamond' },
  { id: 'neon', name: 'NEON', level: 8, color: 0xb6f23d, trail: 'dot' },
  { id: 'comet', name: 'COMET', level: 10, color: 0x00e5ff, trail: 'diamond' },
  { id: 'aurora', name: 'AURORA', level: 13, color: 0x4fd1c5, trail: 'diamond', aurora: true },
];

// The skin's color at a given moment (ms). Aurora's hue is stepped so only a few glow textures get made.
export function skinColorAt(skin: Skin, ms: number): number {
  if (!skin.aurora) return skin.color;
  const steps = 24;
  const wave = 0.5 + 0.5 * Math.sin(ms * 0.0015);
  const hue = 0.25 + 0.37 * (Math.round(wave * steps) / steps); // green to blue
  return Phaser.Display.Color.HSVToRGB(hue, 0.6, 1).color;
}
