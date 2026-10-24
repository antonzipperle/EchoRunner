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
- No art files: everything is drawn in code from shapes, lines and generated gradients (see `src/game/visuals.ts`).
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
8. [done] Sound effects: pickup blip and game-over drop, made with the Web Audio API (no files, no library).
9. [done] Local top-10 leaderboard in localStorage, shown on the game-over screen.
10. [done] Readability visuals (still rectangles and lines only): older ghosts fade from red toward violet,
    a ring shrinks onto each ghost's start point during the grace period, and grabbing the target bursts into small squares.

11. [done] Visual polish (still rectangles and lines only): brighter ghost trails, a soft pickup flash instead of a hard one,
    a faint background grid, an arena wall that shifts color with the score, a score pop, a red timer and wall pulse
    in the last 1.5 s, and a pulsing ring around the ghost that caught you.
12. [done] Pause (P, Esc, the on-screen button, or automatically when the window loses focus; tap to resume)
    and mute (M or the on-screen button, remembered in localStorage).
13. [done] Pickups: from round 2, a pickup sometimes appears beside the target and vanishes after 3 s.
    ERASE deletes your oldest ghost (and its trail); +TIME adds 1.5 s to the current round.
14. [done] Pickup rework after playtesting (they cost more than they gave): pickups now appear on the way to the target
    and last 4.5 s, ERASE removes the oldest half of your ghosts, and the round limit shrinks by 0.1 s per round
    (floor 3 s) so +TIME matters.
15. [done] Boost: Shift (or the on-screen BOOST button) gives 0.25 s of 3x speed, then a 2.5 s cooldown that keeps
    running across rounds. A small bar under the button shows the recharge. Boosted moves are recorded, so ghosts dash too.
16. [done] Clarity polish: the start hint mentions boost, ghosts within 70 px of you light up as a near-miss warning,
    and dragging on touch (or with the mouse) shows an on-screen joystick.
17. [done] Sharp rendering: the canvas is drawn at 2x (2560x1440) with every camera zoomed 2x and all text rendered at 2x,
    so text and UI stay crisp on big and high-DPI screens. Game logic still uses 1280x720 coordinates.
18. [done] Animated start screen: the title drops in letter by letter with a red "echo" trailing it, and a looping demo
    shows the idea (a runner on a figure-eight, its earlier laps appearing behind it as ghosts). Space, Enter or a tap starts
    the game; M toggles sound; your best score shows if you have one.
19. [done] Visual overhaul, kept simple: soft backdrop light and wall glow, glows on the player, target and pickups,
    see-through outlined ghosts, a target gem in a counter-rotating frame that pops in, a light player trail, bold HUD numbers.
    Pickups are distinct icons: +TIME is a green clock with a sweeping hand, ERASE is a white spinning diamond with an X
    that sends out shockwave rings. Both pop in.
20. [done] Audio and feel: softer game-over shake, a rising start jingle (from the menu and on restart), a falling
    game-over phrase, and faint generated background music (Am F C G arpeggio over a soft bass) that mutes with M
    and pauses with the game. All Web Audio, no files.
21. [done] Reactive feel, kept subtle: a near ghost pops when it lights up and its outline brightens as it closes in,
    the player's glow swells with the danger, slipping past within 36 px gives a close-call ring and chime, the player
    stretches as it moves and pops on a grab, shockwave rings on collects and boosts, and the timer beats in the last 1.5 s.

## Later (ideas parked, not started)
- More pickups: freeze (ghosts hold still for 1.5 s) and a rare shield that absorbs one hit.
- Replay of the final round in slow motion on the game-over screen.
- Daily seed (same targets for everyone) and a copy-to-clipboard score card.

## Where things live
- `src/game/constants.ts`: all tuning knobs (speed, sizes, grace period, spawn distances).
- `src/game/Recording.ts`: one round of positions, one per tick.
- `src/game/sound.ts`: Web Audio sound effects (`sfx.*`), the background music loop (`music.start()/stop()`) and the mute switch.
- `src/game/leaderboard.ts`: local top-10 scores in localStorage.
- `src/game/hiRes.ts`: sharp rendering (2x canvas, camera zoom, 2x text). Every scene calls `applyHiResCamera(this)`.
- `src/game/visuals.ts`: shared drawing helpers (arena grid, color mixing).
- `src/scenes/StartScene.ts`: the animated start screen.
- `src/scenes/GameScene.ts`: the game loop, input, collisions, game over screen.

## Current phase: playtest
Stop adding features. Play 20 rounds and tune `constants.ts` before anything else.
Open questions to answer by playing:
- Is it too easy to just stand still or hide in a corner?
- Does it need a per-round time limit?
- Is the 0.5 s grace period at round start too long or too short?
