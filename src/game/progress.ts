import { XP_PER_CLOSE_CALL, XP_PER_PICKUP, XP_PER_ROUND } from './constants';
import { BODIES, TRAILS, type Body, type Trail } from './skins';

// XP, level and the chosen body and trail, kept in this browser's localStorage
// (CrazyGames' automatic progress save backs it up for logged-in players).
const STORAGE_KEY = 'echo-runner-progress';

type Saved = { xp: number; body: string; trail: string };

// Before bodies and trails were separate, a save held one combined "skin"
const OLD_SKINS: Record<string, { body: string; trail: string }> = {
  classic: { body: 'classic', trail: 'squares' },
  sky: { body: 'sky', trail: 'squares' },
  bubbles: { body: 'classic', trail: 'dots' },
  ember: { body: 'ember', trail: 'squares' },
  frost: { body: 'frost', trail: 'diamonds' },
  neon: { body: 'neon', trail: 'dots' },
  comet: { body: 'comet', trail: 'diamonds' },
  aurora: { body: 'aurora', trail: 'diamonds' },
};

function load(): Saved {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (data && typeof data.xp === 'number') {
      const old = typeof data.skin === 'string' ? OLD_SKINS[data.skin] : undefined;
      return {
        xp: data.xp,
        body: typeof data.body === 'string' ? data.body : (old?.body ?? BODIES[0].id),
        trail: typeof data.trail === 'string' ? data.trail : (old?.trail ?? TRAILS[0].id),
      };
    }
  } catch {
    // storage blocked or corrupt data: start fresh
  }
  return { xp: 0, body: BODIES[0].id, trail: TRAILS[0].id };
}

function save(data: Saved) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // storage full or blocked: progress still counts for this session's screens
  }
}

// Total XP needed to reach a level: 100 for level 2, then each level asks 50 more than the last
export function xpForLevel(level: number): number {
  return 25 * (level - 1) * (level + 2);
}

export function levelFor(xp: number): number {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  return level;
}

export function getXp(): number {
  return load().xp;
}

export function getLevel(): number {
  return levelFor(load().xp);
}

// The chosen item, or the default if it isn't unlocked (or no longer exists)
export function selectedBody(): Body {
  const data = load();
  const body = BODIES.find((b) => b.id === data.body);
  return body && body.level <= levelFor(data.xp) ? body : BODIES[0];
}

export function selectedTrail(): Trail {
  const data = load();
  const trail = TRAILS.find((t) => t.id === data.trail);
  return trail && trail.level <= levelFor(data.xp) ? trail : TRAILS[0];
}

export function selectBody(id: string) {
  save({ ...load(), body: id });
}

export function selectTrail(id: string) {
  save({ ...load(), trail: id });
}

// The lowest level at which something new unlocks, if anything is left
export function nextUnlockLevel(): number | undefined {
  const level = getLevel();
  const levels = [...BODIES, ...TRAILS].map((i) => i.level).filter((l) => l > level);
  return levels.length > 0 ? Math.min(...levels) : undefined;
}

export function runXp(run: { rounds: number; closeCalls: number; pickups: number }): number {
  return run.rounds * XP_PER_ROUND + run.closeCalls * XP_PER_CLOSE_CALL + run.pickups * XP_PER_PICKUP;
}

export type Unlock = { kind: 'BODY' | 'TRAIL'; name: string; color: number };

export type XpResult = {
  gained: number;
  xpBefore: number;
  xpAfter: number;
  levelBefore: number;
  levelAfter: number;
  unlocked: Unlock[]; // items that this run unlocked
};

export function addXp(gained: number): XpResult {
  const data = load();
  const xpBefore = data.xp;
  const xpAfter = xpBefore + gained;
  save({ ...data, xp: xpAfter });
  const levelBefore = levelFor(xpBefore);
  const levelAfter = levelFor(xpAfter);
  const isNew = (l: number) => l > levelBefore && l <= levelAfter;
  const unlocked: Unlock[] = [
    ...BODIES.filter((b) => isNew(b.level)).map((b) => ({ kind: 'BODY' as const, name: b.name, color: b.color })),
    ...TRAILS.filter((t) => isNew(t.level)).map((t) => ({ kind: 'TRAIL' as const, name: t.name, color: 0xe8ecf4 })),
  ];
  return { gained, xpBefore, xpAfter, levelBefore, levelAfter, unlocked };
}
