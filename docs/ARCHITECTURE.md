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

Written by the planner (session 1) from `docs/GAME_DESIGN.md`. `harness/state/feature_list.json` is the build order (F001–F029, milestones M1–M7); this section is the intended shape. F001 switches the canvas to landscape 1280×720 and updates the coordinates table and D5 above.

### Expected modules

| Path | Responsibility | Features |
| --- | --- | --- |
| `src/core/tuning.ts` | `DEFAULT_TUNING` and the `Tuning` type: every tunable gameplay number | F002 on |
| `src/core/bottle.ts` | bottle and table shapes; mass, center of mass and inertia per water level | F001, F002 |
| `src/core/throw.ts` | power (0–100) and water → launch impulse and spin | F003 |
| `src/core/outcome.ts` | judging rest: upright, side, cap, off table, off screen, timeout | F004 |
| `src/core/simulation.ts` | planck world, phases, throw cycle, score, rounds; `snapshot()` and events | F001–F013 |
| `src/core/powerMeter.ts`, `push.ts` | power bar (taps, hold acceleration, wheel); mouse push → power | F006, F011 |
| `src/core/round.ts` | round counters, streak, `updateBest` | F013, F015 |
| `src/core/flipWindow.ts`, `difficulty.ts` | power sweeps, flip windows, simulated-player benchmark | F008, F020 |
| `src/core/replay.ts` | per-step recording and the landing clip | F026 |
| `src/game/scenes/` | Boot → Game in M1; Summary, Title and the Pause overlay later | F001, F014, F018, F019 |
| `src/game/view/` | bottle, table, power bar, HUD, result flash, effects | F002–F007, F021 |
| `src/game/audio/sfx.ts`, `src/game/storage.ts` | Web Audio effects; versioned localStorage save (best score, mute) | F015–F017 |
| `src/debug/testHooks.ts`, `tuningPanel.ts` | `window.__FLIPPER__`; the developer tuning panel (dev or `?debug`) | all, F010 |
| `scripts/flip-windows.ts` | prints flip windows and benchmark rates per water level | F008, F020 |

### Core state

```ts
type Phase = 'aiming' | 'flying' | 'result' | 'roundOver';
interface SimSnapshot {
  tick: number; seed: number; phase: Phase;
  power: number; // the power bar, 0–100
  bottle: BodySnapshot & { water: number; waterOffset?: number }; // water: filled fraction 0–1
  lastThrow: { power: number; water: number; source: 'keyboard' | 'mouse' } | null;
  outcome: { result: 'success' | 'fail';
             reason: 'upright' | 'side' | 'cap' | 'offTable' | 'offScreen' | 'timeout';
             rotation: number; turns: number } | null; // rotation: radians since release
  score: number; throws: number; throwNumber: number; throwsPerRound: number; streak: number;
}
```

Flow: `aiming` → throw → `flying` → outcome → `result` → delay or `skip()` → `aiming`, or `roundOver` after throw 10. The simulation also queues events (`throw`, `impact` with speed, `outcome`) that the scene drains each frame for sound and effects.

### Key decisions

| # | Decision | Why |
| --- | --- | --- |
| P1 | Power is one number, 0–100; `throwBottle(power, source)` is the only way to throw | the design makes both inputs identical to the physics |
| P2 | The throw is an impulse that mass and inertia divide | heavier bottles get less speed and spin without special cases |
| P3 | Water is mass filling the bottle from the base to its level, solid until M6 | the drawn level and the physics agree |
| P4 | Outcomes are judged from physics state; nothing moves the bottle after release | the design says physics decides |
| P5 | Delays, hold times, timeouts and replay length count fixed steps in core | deterministic, and tests drive them with `step()` |
| P6 | Tuning is a plain object the Simulation accepts as overrides | the tuning panel and tests change the feel without code edits |
| P7 | Flip windows are measured by headless power sweeps and locked by unit tests | calibration can't silently regress |
| P8 | Screens and game pause live in `src/game`; pausing just stops stepping | core has no clock to pause |
| P9 | Sound and effects react to simulation events | core stays free of audio and Phaser |
| P10 | Saves use one versioned localStorage key; the rules (`updateBest`) live in core | storage is a browser API; the rules stay testable |
| P11 | Sloshing is a second body on a prismatic joint along the bottle's axis, behind a switch until recalibrated | the simplest moving mass that changes the flip |
