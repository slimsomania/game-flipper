# Flipper

Flipper is a browser game: throw a bottle so it flips in the air and lands upright on its base. It is built feature by feature by autonomous Claude Code agents driven by the harness in `harness/` (see `harness/README.md`). These instructions apply to every session, whether a human or the harness started it.

## Stack

- TypeScript (strict). Phaser 3.90 for rendering, input, audio and scenes. planck.js (a Box2D port) for physics. Vite for the dev server and build.
- Vitest for unit tests (Node), Playwright for e2e tests (headless Chromium), Prettier for formatting.
- Node 22.12+ (24 recommended). The main dev machine runs Windows: shell commands run in Git Bash, so use forward slashes and POSIX syntax.

## Commands

| Task | Command |
| --- | --- |
| Install everything | `npm run setup` |
| Format | `npm run format` |
| Typecheck | `npm run typecheck` |
| Unit tests | `npm test` (one file: `npm test -- tests/unit/rng.test.ts`) |
| E2E tests | `npm run test:e2e` (starts its own server on port 5199) |
| Full gate: format check, typecheck, unit, build, e2e | `npm run verify` |
| Look at the game | `npm run snap -- --do "<actions>"`, then open the PNGs it lists with the Read tool |
| Play it (humans) | `npm run dev`, then open http://localhost:5173 |

- Never run `npm run dev` as an agent: it never exits. Tests and `npm run snap` start their own server.
- Run unit tests through `npm test`, not `npx vitest`: on Windows the npm script avoids a drive-letter casing bug that makes every Vitest test fail.
- `npm run snap -- --help` lists the snap actions: key presses, clicks and drags in game coordinates, stepping the simulation, screenshots.

## Layout

- `src/core/`: the simulation, meaning game rules and physics. Pure TypeScript.
- `src/game/`: Phaser scenes and presentation.
- `src/debug/testHooks.ts`: `window.__FLIPPER__`, the API that e2e tests and `npm run snap` use to observe and drive the game.
- `tests/unit/` (Vitest), `tests/e2e/` (Playwright), `tests/harness/` (harness logic).
- `scripts/snap.ts`: the screenshot tool. `public/assets/`: static assets, with their licenses in `public/assets/CREDITS.md`.
- `docs/GAME_DESIGN.md`: what to build (owned by the human). `docs/ARCHITECTURE.md`: how it is built (keep it current).
- `harness/`: the autonomous agent harness. `harness/state/` holds the plan and the session log.

## Architecture rules

- `src/core` is pure, deterministic TypeScript: no Phaser, no DOM or browser APIs, no `Math.random()` (use `createRng` from `src/core/rng.ts`), no wall-clock time. The same seed and inputs must give the same result. It advances in fixed steps of `SIM_DT` (1/60 s). `tests/unit/architecture.test.ts` enforces this.
- Units are meters, seconds and radians. y points down like the screen, and positive angles turn clockwise like Phaser's rotation. Multiply positions by `PIXELS_PER_METER` to draw. The logical canvas is 1280×720 (landscape, desktop browser), scaled to fit the window.
- `src/game` draws snapshots of the simulation and turns input into simulation calls. Game rules don't live there, and it never imports planck directly.
- Tunable gameplay numbers (forces, spin, tolerances) belong in one config module in `src/core`, not scattered as literals.
- Until real art exists, draw with Phaser Graphics or generate textures in code (see `BootScene`). Only add asset files whose license allows it, and record them in `public/assets/CREDITS.md`.
- Keep files focused: split a module once it grows past ~300 lines.

## Testing rules

- Every rule or calculation in `src/core` has unit tests. Every player-visible behavior has an e2e test that drives the game through `window.__FLIPPER__` and asserts on state, not pixels.
- Keep tests deterministic: fixed seeds, `pause()` + `step(n)` instead of sleeping, `waitForFunction` instead of fixed timeouts.
- Extend `window.__FLIPPER__` when a feature needs to be observable or controllable from tests. Keep it thin: it calls into `src/core` and never reimplements rules.
- Never delete, skip or weaken a test to make the build pass. If a test is wrong, fix it and say why in the progress log.
- Check visuals with `npm run snap`, and actually look at the screenshots.

## Git

- Commit each completed unit of work with a conventional message: `feat(F012): …`, `fix(F012): …`, `test: …`, `refactor: …`, `docs: …`.
- In a session a human started (not the harness), sync after every commit: `git pull --ff-only`, then `git push`. If the pull can't fast-forward or the push is rejected, stop and tell the human; never force-push or merge to get around it.
- Inside the harness, don't push: the harness syncs the branch itself after each session.
- Never switch branches or rewrite history (no `reset`, `rebase` or `--amend`). Discard changes with `git restore`, not `git checkout`.

## Agent harness

Inside the harness, your session prompt gives you a role (planner, builder, reviewer or maintainer) and its exact procedure. In every role:

- `harness/state/feature_list.json` is the plan and the status of every feature. Only change the fields your role allows.
- `harness/state/progress.md` is the session log. Read its tail first (`tail -n 120 harness/state/progress.md`), append your entry at the end, and never edit old entries.
- Don't edit `docs/GAME_DESIGN.md`, this file, `.claude/`, `.github/`, or anything else under `harness/`. The harness restores them after each session.
