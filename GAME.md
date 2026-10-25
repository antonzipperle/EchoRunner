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
- Touching a ghost = game over, unless you are dashing (boost): a dash smashes the ghost instead.
  Score = rounds completed.
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
22. [done] CrazyGames Basic Launch readiness: all text is at least 20px so it stays readable at 800x450,
    audio resumes on any later tap if iOS interrupts it, Esc no longer pauses (it leaves fullscreen on CrazyGames;
    P, the PAUSE button and auto-pause on focus loss remain), and the page disables text selection on mobile.
    `npm run build` and zip the contents of `dist/` (index.html at the zip root) to upload.
23. [done] Run summary on the game-over screen: one line with close calls, boosts, pickups and ghosts erased,
    and a "NEW BEST!" badge when the run tops the board. Information only: restart stays instant (Space or button).
24. [done] Unlockable looks: every run earns XP (10 per round, 5 per close call, 5 per pickup); levels unlock
    8 player looks (color + trail shape: squares, dots or diamonds; AURORA drifts through greens and blues).
    The game-over screen shows the XP, a filling level bar, LEVEL UP and NEW LOOK. The start screen shows the level
    and a look picker (arrows / A-D / tap < >) previewed on the demo runner. Saved in localStorage.
25. [done] Back to the start screen: a small HOME [H] button on the game-over screen (under RESTART, which stays the
    fast path along with Space) and on the pause screen. Leaving from pause ends the run without XP or a score.
26. [done] Movement with a little inertia: the velocity eases toward the input (PLAYER_RESPONSE), so turns with
    WASD become arcs and ghost trails curve instead of being straight lines with sharp corners. Boosts kick in
    fast and their extra speed bleeds off smoothly; walls stop you in that direction.
27. [done] Body and trail are separate unlockable items that mix freely. Bodies (color): CLASSIC, SKY, EMBER,
    FROST, NEON, COMET, AURORA. Trails (shape): SQUARES, DOTS, DIAMONDS, SPARKS, PRISM (rainbow). Something unlocks
    at almost every level. Old saves with a combined look carry over.
28. [done] Icon menus for touch: the home screen has round CUSTOMIZE / PLAY / SOUND buttons (keys C / Space / M)
    instead of text; CUSTOMIZE opens a locker with tappable body and trail tiles, locks with level numbers and a live
    preview. Pause shows a big RESUME and HOME / RESTART / SOUND (keys P, H, R, M); the HUD pause is an icon.
    Buttons appear immediately and are at least 48px across.
29. [done] Icon-based game-over screen: a big round count with a star NEW BEST badge, the run's stats as icon chips
    (close calls, boosts, pickups, erased ghosts), the XP row, your top runs as bars instead of text rows, and round
    HOME / RESTART / CUSTOMIZE buttons (keys H / Space / C). CUSTOMIZE opens the start screen on the locker.
30. [done] Mobile polish: a big round BOOST button under the right thumb on touch screens (fires on touch-down,
    recharge ring), multi-touch turned on so one thumb steers while the other boosts, BOOST in the HUD is a round
    icon with the same ring, and all text uses one font list (FONT) so Safari no longer falls back to Courier.
31. [done] Close-call combo: close calls within 2.5 s of the last one chain. Each link pays XP_PER_CLOSE_CALL times
    its place in the chain (up to x5), with a bigger ring, a chime that climbs, a popping "x3" over the player and a
    draining combo badge under the score. The best combo of the run shows on the game-over screen.
32. [done] Music that grows with the run: a soft hi-hat joins at round 4, a second melody at 8, a low kick at 12,
    and the filter opens a little at each step. It drops back to the calm loop on death and on the home screen.
33. [done] Dash smashes ghosts: touching a ghost while boosting (and for a few ticks after) destroys it instead of
    ending the run: burst, shockwave, small shake, crunch, "SMASH". The player wears a white outline while the dash is
    armed. +XP_PER_SMASH per smash, shown as a chip on the game-over screen. Ghosts in their spawn grace can't be smashed.
34. [done] Risk recharges the dash (smashing was too strong, close calls too rare): the boost cooldown is now 5 s,
    but every close call takes a third off it (the boost buttons pop, and a chime plus ring play when it is full again).
    Close calls count within 48 px instead of 36, and the combo window is 4 s instead of 2.5 s.
35. [done] No inertia for drag steering: touch (and mouse) drags move the player instantly again, since a finger is
    already smooth and the easing made it feel less responsive. Keyboard movement keeps its inertia.

## Later (ideas parked, not started)
- CrazyGames Full Launch (only if they select the game): CrazyGames SDK, gameplay start/stop events,
  pause and mute during ads, save the leaderboard and mute through the SDK Data module.
- More pickups: freeze (ghosts hold still for 1.5 s) and a rare shield that absorbs one hit.
- Replay of the final round in slow motion on the game-over screen.
- Daily seed (same targets for everyone) and a copy-to-clipboard score card.

## Where things live
- `src/game/constants.ts`: all tuning knobs (speed, sizes, grace period, spawn distances).
- `src/game/Recording.ts`: one round of positions, one per tick.
- `src/game/sound.ts`: Web Audio sound effects (`sfx.*`), the background music loop (`music.start()/stop()`) and the mute switch.
- `src/game/leaderboard.ts`: local top-10 scores in localStorage.
- `src/game/progress.ts`: XP, levels and the chosen body and trail (localStorage). `src/game/skins.ts`: the bodies and trails.
- `src/game/ui.ts`: round icon buttons and the drawn icons (play, pause, home, restart, sound, close, lock, look).
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
