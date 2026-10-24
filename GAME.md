# Echo Runner

Single-screen arena game, Phaser 3 + TypeScript + Vite.

**One sentence:** Grab a target every round, and every previous round replays as a ghost that kills you on touch.

## Core loop
- Player is a small square, moves with WASD/arrows (desktop) and touch-drag (mobile).
- Each round a target spawns at a random position.
- Touching the target ends the round. The player's position every fixed tick
  of that round is saved as a recording.
- At the start of each round, ALL previous recordings replay at once as
  semi-transparent ghosts, starting from tick 0.
- Touching a ghost = game over. Score = rounds completed.
- When a ghost's recording ends, it stays at its last position.

## Rules for the code
- Keep game logic separate from rendering where possible.
- Record positions per fixed timestep, not per render frame.
- No art yet: colored rectangles only.
- 16:9 canvas (1280x720) that scales to fit desktop and mobile. Already set up in src/main.ts.
- Do one milestone at a time. Do not add features that are not in this file.

## Milestones
1. [done] Empty arena and a player square that moves with arrow keys and WASD.
2. [done] Target spawns at a random position. Touching it starts a new round and increments the score.
3. [done] Record the player's positions during each round (fixed timestep).
4. [done] Replay all previous recordings as ghosts at the start of each round.
5. [done] Collision with ghosts triggers game over, plus a restart button (or Space).
6. [done] Per-round time limit. A countdown is shown; if it hits 0 before the target is grabbed, game over.
7. [done] Ghost trails: each ghost's full recorded path is drawn as a faint line.
Planned next, one at a time: 8. sound effects (Web Audio, no library), 9. local top-10 leaderboard (localStorage).

## Where things live
- `src/game/constants.ts`: all tuning knobs (speed, sizes, grace period, spawn distances).
- `src/game/Recording.ts`: one round of positions, one per tick.
- `src/scenes/GameScene.ts`: the game loop, input, collisions, game over screen.

## Current phase: playtest
Stop adding features. Play 20 rounds and tune `constants.ts` before anything else.
Open questions to answer by playing:
- Is it too easy to just stand still or hide in a corner?
- Does it need a per-round time limit?
- Is the 0.5 s grace period at round start too long or too short?
