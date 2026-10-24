export type Point = { x: number; y: number };

// One round of player movement: one position per fixed tick.
export class Recording {
  private points: Point[] = [];

  push(x: number, y: number) {
    this.points.push({ x, y });
  }

  // Position at a given tick. After the recording ends, the ghost stays at its last position.
  at(tick: number): Point {
    const i = Math.min(tick, this.points.length - 1);
    return this.points[Math.max(i, 0)];
  }

  get end(): Point {
    return this.points[this.points.length - 1];
  }

  get length(): number {
    return this.points.length;
  }
}
