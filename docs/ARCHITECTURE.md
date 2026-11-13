# Flipper: architecture

How the game is built. Agents keep this document in sync with the code; the design (what to build) lives in `docs/GAME_DESIGN.md`.

## Overview

```
 pointer / touch / keyboard
            │
            ▼
 src/game (Phaser scenes) ── step(), and later throw(…) etc. ──►  src/core (Simulation: rules + planck physics)
            ▲                                                              │
            └────────────────────── snapshot() every frame ◄──────────────┘

 src/debug/testHooks.ts exposes the same Simulation to tests as window.__FLIPPER__
```

- **src/core** owns the game state and rules. It is plain TypeScript that runs anywhere, including Node for unit tests, and it is deterministic: the same seed and the same inputs always produce the same result.
- **src/game** is the Phaser layer. Scenes step the simulation on a fixed clock, draw its latest snapshot, play effects, and translate input into simulation calls.
- **Test hooks** (`window.__FLIPPER__`, dev builds only) let e2e tests and `npm run snap` read the exact state and step the simulation frame by frame, because a canvas game can't be tested through the DOM.

## Game loop

Phaser calls `GameScene.update(time, delta)` once per display frame. The scene feeds `delta` to a fixed-step accumulator (`src/core/fixedStep.ts`), which calls `Simulation.step()` in exact 1/60 s steps: at most 5 per frame, with any longer backlog dropped (for example after the tab was hidden). The scene then draws the newest snapshot. Physics results therefore don't depend on the display's frame rate, and tests can step the simulation directly.

## Coordinates and units

| Quantity | Convention |
| --- | --- |
| Position | meters; origin at the top-left; x to the right, y down |
| Angle | radians; positive is clockwise (same as Phaser's rotation); 0 is upright |
| Time | seconds; fixed step `SIM_DT` = 1/60 s |
| Screen | 720×1280 px logical canvas (portrait), scaled with `Scale.FIT`; 1 m = 100 px |

## Directory map

| Path | Contents |
| --- | --- |
| `src/core/constants.ts` | Canvas size, units, fixed step, gravity |
| `src/core/rng.ts` | Seeded random numbers (the only randomness allowed in core) |
| `src/core/fixedStep.ts` | Fixed-timestep accumulator |
| `src/core/simulation.ts` | The simulation. Currently a placeholder: a bottle dropped onto a table |
| `src/game/config.ts` | Phaser game config and scene list |
| `src/game/scenes/` | `BootScene` (generates placeholder textures), `MenuScene`, `GameScene` |
| `src/game/theme.ts` | Fonts and colors |
| `src/debug/testHooks.ts` | `window.__FLIPPER__` |
| `scripts/snap.ts` | Headless screenshot tool (`npm run snap`) |
| `scripts/canonical-cwd.mjs` | Runs Vitest from the canonical path (Windows drive-letter workaround) |
| `tests/` | `unit/` (Vitest), `e2e/` (Playwright), `harness/` (harness logic) |

## Testing strategy

| Layer | Tool | What it proves |
| --- | --- | --- |
| `src/core` | Vitest unit tests | rules and physics outcomes, determinism |
| Layering | `tests/unit/architecture.test.ts` | core stays pure; the game layer never imports planck |
| The game in a browser | Playwright e2e tests via `window.__FLIPPER__` | scenes, input, game flow, no console errors |
| Visuals | `npm run snap`, plus an agent looking at the screenshots | layout, readability, nothing off screen |
| Harness | `tests/harness/` | plan validation, next-action choice, guard rails |

`npm run verify` runs all of it, and the harness runs it again after every builder and maintainer session.

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | Browser game in TypeScript with Phaser 3.90 and Vite | Runs on desktop and mobile browsers with no install. Everything is text, so agents can build, test and screenshot it headlessly. Phaser 3 is the version agents know best; Phaser 4 is a possible later upgrade. |
| D2 | planck.js (Box2D) for physics instead of Phaser's bundled Matter.js | Stable resting contacts and sleep detection (needed to judge a landing), continuous collision for a fast-spinning bottle, joints if the water gets simulated, and it runs headless in Node for unit tests. |
| D3 | All rules in a deterministic, fixed-step `src/core` | Tests can reproduce any situation exactly (seed plus inputs), and agents can verify gameplay without a browser. |
| D4 | `window.__FLIPPER__` test hooks | A canvas can't be inspected through the DOM; the hooks give tests exact state and frame-by-frame control. |
| D5 | Portrait 720×1280 logical canvas | Mobile first: a toss is a vertical motion. Desktop shows it letterboxed. |
| D6 | Placeholder art drawn in code | No asset pipeline until the art direction is decided. |

## Plan

_The planner agent fills this in from `docs/GAME_DESIGN.md`._
