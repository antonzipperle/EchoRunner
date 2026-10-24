import { LEADERBOARD_SIZE } from './constants';

// Local top scores, kept in this browser's localStorage. No backend.
export type ScoreEntry = { score: number; date: string };

const STORAGE_KEY = 'echo-runner-leaderboard';

export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(data)) return [];
    return data
      .filter((e): e is ScoreEntry => typeof e?.score === 'number' && typeof e?.date === 'string')
      .slice(0, LEADERBOARD_SIZE);
  } catch {
    return []; // storage blocked or corrupt data: treat as empty
  }
}

// Adds a finished run and returns the updated list plus where this run landed
// (an index into the list, or -1 if it did not make the top). Zero scores are not recorded.
export function submitScore(score: number): { entries: ScoreEntry[]; rank: number } {
  const entries = loadScores();
  if (score <= 0) return { entries, rank: -1 };

  // Equal scores keep the older run ahead
  let rank = entries.findIndex((e) => e.score < score);
  if (rank === -1) rank = entries.length;
  if (rank >= LEADERBOARD_SIZE) return { entries, rank: -1 };

  entries.splice(rank, 0, { score, date: new Date().toISOString().slice(0, 10) });
  entries.length = Math.min(entries.length, LEADERBOARD_SIZE);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // storage full or blocked: the list still shows for this session's game-over screen
  }
  return { entries, rank };
}
