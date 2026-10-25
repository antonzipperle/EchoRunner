import { XP_PER_CLOSE_CALL, XP_PER_PICKUP, XP_PER_ROUND } from './constants';
import { SKINS, type Skin } from './skins';

// XP, level and the chosen look, kept in this browser's localStorage
// (CrazyGames' automatic progress save backs it up for logged-in players).
const STORAGE_KEY = 'echo-runner-progress';

type Saved = { xp: number; skin: string };

function load(): Saved {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (data && typeof data.xp === 'number' && typeof data.skin === 'string') return data;
  } catch {
    // storage blocked or corrupt data: start fresh
  }
  return { xp: 0, skin: SKINS[0].id };
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

export function unlockedSkins(): Skin[] {
  const level = levelFor(load().xp);
  return SKINS.filter((s) => s.level <= level);
}

export function nextLockedSkin(): Skin | undefined {
  const level = levelFor(load().xp);
  return SKINS.find((s) => s.level > level);
}

export function selectedSkin(): Skin {
  const data = load();
  const skin = SKINS.find((s) => s.id === data.skin);
  return skin && skin.level <= levelFor(data.xp) ? skin : SKINS[0];
}

export function selectSkin(id: string) {
  save({ ...load(), skin: id });
}

export function runXp(run: { rounds: number; closeCalls: number; pickups: number }): number {
  return run.rounds * XP_PER_ROUND + run.closeCalls * XP_PER_CLOSE_CALL + run.pickups * XP_PER_PICKUP;
}

export type XpResult = {
  gained: number;
  xpBefore: number;
  xpAfter: number;
  levelBefore: number;
  levelAfter: number;
  unlocked: Skin[]; // looks that this run unlocked
};

export function addXp(gained: number): XpResult {
  const data = load();
  const xpBefore = data.xp;
  const xpAfter = xpBefore + gained;
  save({ ...data, xp: xpAfter });
  const levelBefore = levelFor(xpBefore);
  const levelAfter = levelFor(xpAfter);
  const unlocked = SKINS.filter((s) => s.level > levelBefore && s.level <= levelAfter);
  return { gained, xpBefore, xpAfter, levelBefore, levelAfter, unlocked };
}
