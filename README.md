# Echo Runner

## First-time setup
1. Install Node.js (LTS) from nodejs.org, VS Code, and Git.
2. Unzip this folder somewhere, e.g. Documents/echo-runner.
3. Open the folder in VS Code, open a terminal (Terminal > New Terminal) and run:
   ```
   npm install
   npm run dev
   ```
   Your browser opens and shows "ECHO RUNNER". That means everything works.
4. Git is already set up with the history so far. Check with `git log`.

## Controls
- Arrow keys or WASD
- Touch / mouse: press and drag in a direction, like a joystick
- Space or the button to restart after game over

## Debugging
While `npm run dev` runs, open the browser console (F12) and type `scene` to inspect the live game state, e.g. `scene.score` or `scene.ghosts.length`.

## Daily workflow
- `npm run dev` starts the game with live reload.
- Give your AI tool one milestone from GAME.md at a time.
- Test in the browser, then commit when it works:
  `git add . && git commit -m "Milestone X done"`
- If the AI breaks something: `git checkout .` throws away all uncommitted changes.

## Build for publishing
`npm run build` creates a `dist/` folder. Zip its contents to upload to itch.io or CrazyGames.
