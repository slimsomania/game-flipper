# Flipper

Throw a bottle, flip it in the air, land it upright. Flipper is a browser game built feature by feature by autonomous Claude Code agents.

## Quick start

Requirements: Node 22.12+ (24 recommended), Git, and [Claude Code](https://claude.com/claude-code) for the agents.

```bash
npm run setup     # install dependencies and headless Chromium for the tests
npm run dev       # play at http://localhost:5173
npm run verify    # format check, typecheck, unit tests, build, e2e tests
```

## Play

Mouse and keyboard, in a desktop browser. Set the power, then throw: the bottle flips in the air and should land upright on its base. A round is 10 throws.

| Action | Mouse | Keyboard |
| --- | --- | --- |
| Set power | Hold left button on the bottle and push the mouse upward; or mouse wheel | Up / Down |
| Throw | Release the left button after a push | Space |
| Skip the wait after a result | Click | Space |
| Restart the round | Restart button on the pause overlay | R |
| Pause | Pause button in the corner | Esc or P |
| Mute | Speaker button | M |

To play the production build:

```bash
npm run build     # writes dist/
npm run preview   # serves dist/ at http://localhost:4173
```

`dist/` is static, so any static host can serve it.

### On a phone

To try the game on a real Android phone or iPhone, serve it from your PC to the home network:

1. Put the phone on the same Wi-Fi as the PC.
2. On the PC run one of:

   ```bash
   npm run dev:phone       # the dev server on the network (port 5173)
   npm run preview:phone   # builds, then serves the production build on the network (port 4173)
   ```

3. Find the PC's address: run `ipconfig` in a terminal and read the "IPv4 Address" of the Wi-Fi adapter (for example `192.168.1.23`).
4. On the phone open `http://<that address>:5173` (`dev:phone`) or `http://<that address>:4173` (`preview:phone`). Hold the phone sideways.
5. The first time, Windows asks whether to allow Node.js through the firewall: allow it on private networks. If the page doesn't load, check that setting in Windows Security, Firewall & network protection, Allow an app through firewall.

Add `?debug` to the address (for example `http://192.168.1.23:4173/?debug`) to get the tuning panel: on a touch device a small gear button in the bottom-left corner opens and closes it, and the panel scrolls.

Agents never run these commands: they don't exit.

## Building the game with agents

1. Describe the game in [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md), then change `status: draft` to `status: ready` at the top. Commit.
2. `npm run agents -- --smoke`: a one-minute check that headless Claude Code and the permission rules work.
3. `npm run agents -- --plan`: the planner writes `harness/state/feature_list.json`. Review it, edit it if you like, and commit.
4. `npm run agents`: builder and reviewer sessions implement features one at a time until a milestone is complete.
5. `npm run agents:status`: progress at any time.

The operating manual is [harness/README.md](harness/README.md). The rules every agent follows are in [CLAUDE.md](CLAUDE.md).

## Tech stack

| Part | Choice |
| --- | --- |
| Language | TypeScript (strict) |
| Game framework | [Phaser 3](https://phaser.io) (rendering, input, audio, scenes) |
| Physics | [planck.js](https://piqnt.com/planck.js/) (a Box2D port) |
| Build and dev server | [Vite](https://vite.dev) |
| Tests | [Vitest](https://vitest.dev) (unit), [Playwright](https://playwright.dev) (end to end) |
| Agents | Claude Code in headless mode (`claude -p`), driven by `harness/run.ts` |

## Project layout

```
src/core/        simulation: game rules and physics (pure TypeScript, deterministic)
src/game/        Phaser scenes and presentation
src/debug/       window.__FLIPPER__ test hooks
tests/           unit/ (Vitest), e2e/ (Playwright), harness/ (harness logic)
scripts/         snap.ts (headless screenshots), canonical-cwd.mjs (Windows fix for Vitest)
docs/            GAME_DESIGN.md (what to build), ARCHITECTURE.md (how it's built)
harness/         the agent harness: run.ts, prompts/, state/, config.json
public/assets/   static assets and their licenses (CREDITS.md)
```

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm test` | Unit tests |
| `npm run test:e2e` | Browser tests (starts its own server) |
| `npm run snap -- --do "key:Space,wait:800,shot:game"` | Screenshot the game after some actions |
| `npm run build` | Production build in `dist/`; runs from any static host |
| `npm run agents -- --help` | All harness options |
