import Phaser from 'phaser';
import { COLORS } from './constants';
import type { TrailShape } from './skins';

// Round, touch-sized icon buttons for the menus, and the icons they show.
// Icons are drawn in code around (0, 0) and sized relative to the button radius r.

export type IconDrawer = (g: Phaser.GameObjects.Graphics, r: number, color: number) => void;

export type IconButton = {
  container: Phaser.GameObjects.Container;
  setIcon(draw: IconDrawer): void;
};

export function iconButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  radius: number,
  draw: IconDrawer,
  onTap: () => void,
  opts: { fill?: number; iconColor?: number; ring?: number; depth?: number } = {},
): IconButton {
  const iconColor = opts.iconColor ?? COLORS.icon;
  const bg = scene.add
    .circle(0, 0, radius, opts.fill ?? COLORS.panel, 0.94)
    .setStrokeStyle(3, opts.ring ?? COLORS.panelRing, 1);
  const icon = scene.add.graphics();
  draw(icon, radius, iconColor);
  const container = scene.add.container(x, y, [bg, icon]).setDepth(opts.depth ?? 5);

  // The hit area is the circle itself (local coordinates start at the arc's top-left)
  bg.setInteractive({
    hitArea: new Phaser.Geom.Circle(radius, radius, radius),
    hitAreaCallback: Phaser.Geom.Circle.Contains,
    useHandCursor: true,
  });
  bg.on('pointerover', () => container.setScale(1.06));
  bg.on('pointerout', () => container.setScale(1));
  bg.on('pointerdown', () => container.setScale(0.92)); // feels pressed under a finger
  bg.on('pointerup', () => {
    container.setScale(1.06);
    onTap();
  });

  return {
    container,
    setIcon(next: IconDrawer) {
      icon.clear();
      next(icon, radius, iconColor);
    },
  };
}

// ---------- Icons ----------

export const playIcon: IconDrawer = (g, r, c) => {
  g.fillStyle(c, 1).fillTriangle(-0.26 * r, -0.4 * r, -0.26 * r, 0.4 * r, 0.44 * r, 0);
};

export const pauseIcon: IconDrawer = (g, r, c) => {
  g.fillStyle(c, 1);
  g.fillRoundedRect(-0.32 * r, -0.38 * r, 0.22 * r, 0.76 * r, 0.05 * r);
  g.fillRoundedRect(0.1 * r, -0.38 * r, 0.22 * r, 0.76 * r, 0.05 * r);
};

export const homeIcon: IconDrawer = (g, r, c) => {
  g.fillStyle(c, 1);
  g.fillTriangle(-0.48 * r, -0.04 * r, 0, -0.46 * r, 0.48 * r, -0.04 * r); // roof
  g.fillRect(-0.32 * r, -0.06 * r, 0.64 * r, 0.44 * r); // walls
  g.fillStyle(COLORS.panel, 1).fillRect(-0.09 * r, 0.12 * r, 0.18 * r, 0.26 * r); // door
};

export const restartIcon: IconDrawer = (g, r, c) => {
  const R = 0.34 * r;
  const start = Phaser.Math.DegToRad(-50);
  const end = Phaser.Math.DegToRad(250);
  g.lineStyle(0.12 * r, c, 1);
  g.beginPath();
  g.arc(0, 0, R, start, end, false);
  g.strokePath();
  // Arrowhead at the start of the arc, pointing back along it (clockwise)
  const ax = Math.cos(start) * R;
  const ay = Math.sin(start) * R;
  const s = 0.2 * r;
  g.fillStyle(c, 1).fillTriangle(ax - s, ay - s * 0.9, ax + s * 0.95, ay - s * 0.35, ax - s * 0.1, ay + s);
};

function speaker(g: Phaser.GameObjects.Graphics, r: number, c: number) {
  g.fillStyle(c, 1);
  g.fillRect(-0.42 * r, -0.14 * r, 0.2 * r, 0.28 * r);
  g.fillPoints(
    [
      new Phaser.Geom.Point(-0.24 * r, -0.14 * r),
      new Phaser.Geom.Point(0.02 * r, -0.38 * r),
      new Phaser.Geom.Point(0.02 * r, 0.38 * r),
      new Phaser.Geom.Point(-0.24 * r, 0.14 * r),
    ],
    true,
  );
}

export const soundOnIcon: IconDrawer = (g, r, c) => {
  speaker(g, r, c);
  g.lineStyle(0.08 * r, c, 1);
  for (const radius of [0.2 * r, 0.36 * r]) {
    g.beginPath();
    g.arc(0.06 * r, 0, radius, Phaser.Math.DegToRad(-45), Phaser.Math.DegToRad(45), false);
    g.strokePath();
  }
};

export const soundOffIcon: IconDrawer = (g, r, c) => {
  speaker(g, r, c);
  g.lineStyle(0.09 * r, c, 1);
  g.lineBetween(0.14 * r, -0.16 * r, 0.44 * r, 0.16 * r);
  g.lineBetween(0.14 * r, 0.16 * r, 0.44 * r, -0.16 * r);
};

export const closeIcon: IconDrawer = (g, r, c) => {
  g.lineStyle(0.12 * r, c, 1);
  g.lineBetween(-0.3 * r, -0.3 * r, 0.3 * r, 0.3 * r);
  g.lineBetween(-0.3 * r, 0.3 * r, 0.3 * r, -0.3 * r);
};

export function lockIcon(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, c: number) {
  g.lineStyle(s * 0.16, c, 1);
  g.beginPath();
  g.arc(x, y - s * 0.15, s * 0.28, Math.PI, 0, false); // shackle
  g.strokePath();
  g.fillStyle(c, 1).fillRoundedRect(x - s * 0.42, y - s * 0.15, s * 0.84, s * 0.62, s * 0.1);
}

// A tiny player with its trail: the icon for the customize button, in the current look
export function lookIcon(bodyColor: number, shape: TrailShape, trailColors: number[]): IconDrawer {
  return (g, r) => {
    const size = 0.34 * r;
    trailColors.slice(0, 3).forEach((tc, i) => {
      const x = -0.5 * r + i * 0.2 * r;
      const alpha = 0.25 + i * 0.2;
      g.fillStyle(tc, alpha);
      if (shape === 'dot' || shape === 'spark') g.fillCircle(x, 0.08 * r, size * (shape === 'spark' ? 0.25 : 0.4));
      else if (shape === 'diamond') {
        const h = size * 0.38;
        g.fillPoints([new Phaser.Geom.Point(x, 0.08 * r - h), new Phaser.Geom.Point(x + h, 0.08 * r), new Phaser.Geom.Point(x, 0.08 * r + h), new Phaser.Geom.Point(x - h, 0.08 * r)], true);
      } else g.fillRect(x - size * 0.35, 0.08 * r - size * 0.35, size * 0.7, size * 0.7);
    });
    g.fillStyle(bodyColor, 1).fillRect(0.12 * r - size / 2, -0.02 * r - size / 2, size, size);
  };
}
