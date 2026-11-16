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
| Screen | 1280×720 px logical canvas (landscape, for desktop browsers), scaled with `Scale.FIT`; 1 m = 100 px, so the visible world is 12.8 m × 7.2 m |
| Table | top surface `TABLE_TOP_Y` = 5.6 m (78% of the way down); ends `TABLE_LEFT_X` = 1.6 m and `TABLE_RIGHT_X` = 11.2 m, so 1.6 m of screen on each side; all in `src/core/table.ts` |
| Bottle | its body origin (the snapshot's `x`, `y`) is the center of the flat base; its shape extends toward negative y, so the cap is at y = −`BOTTLE_HEIGHT` in local coordinates. Held at the hand, `HAND_X` = 2.8 m, `HAND_Y` = 4.6 m (base 1 m above the table top, 1.2 m in from the left end); both in `src/core/bottle.ts` |

## Directory map

| Path | Contents |
| --- | --- |
| `src/core/constants.ts` | Canvas size, units, fixed step, gravity; `stepsFor(seconds)` turns a duration into whole steps (P5) |
| `src/core/rng.ts` | Seeded random numbers (the only randomness allowed in core) |
| `src/core/fixedStep.ts` | Fixed-timestep accumulator |
| `src/core/table.ts` | The table: exported top and end constants, and `createTable(world)`, which adds it as a static body |
| `src/core/tuning.ts` | `DEFAULT_TUNING` / `Tuning`: every tunable gameplay number (water range and step, shell and water density, bottle friction and bounce, the throw's angle and its linear and angular impulse at power 100, and the landing thresholds: upright tolerance and hold time, cap angle, "nearly still" speeds, fail-rest time, off-table depth, timeout) and the result delay (`resultDelaySeconds`, 1.5); `resolveTuning(overrides)` |
| `src/core/throw.ts` | `throwImpulse(power, tuning)`: power 0–100 (`clampPower`) → a linear impulse in a fixed direction a few degrees toward the table and a clockwise angular impulse, both in proportion to the power; `ThrowSource` |
| `src/core/bottleShape.ts` | The bottle as plain geometry, no physics: dimension constants, the four convex `BOTTLE_PARTS` (body, shoulder, neck, cap), `waterRect`/`waterVertices(level)`, and `bottleMassProperties(level, tuning)` (mass and center of mass height). The physics body and the drawing both build from it |
| `src/core/bottle.ts` | `Bottle`: the planck body (shell fixtures plus one massive, non-colliding water fixture), `setWater`, `applyTuning` (rebuilds the held bottle), `release`, `launch(impulse)`, `place(pose)` (release from an exact `BottlePose`), `touches(body)`, `destroy()` (remove it from the world); `HAND_X`/`HAND_Y`; `drawWaterLevel(rng, tuning)` |
| `src/core/outcome.ts` | `LandingJudge`: reads the bottle's pose, speeds and table contact once per step and decides the outcome (`success`/`fail` with reason `upright`, `side`, `cap`, `offTable`, `offScreen` or `timeout`, plus `rotation` and `turns` since release); small pure helpers `wrapAngle`, `tiltFromUpright`, `bottleExtent`. It never touches the bottle |
| `src/core/simulation.ts` | The simulation: the table and the bottle held in the hand with a seeded random water level; `throwBottle(power, source)`, `placeBottle(pose)` (release from an exact pose, for tests), `setTuning(overrides)`, and `phase` (`aiming` → `flying` → `result` → `aiming`), `lastThrow`, `outcome`, `score` and `throws` in the snapshot. `step()` feeds the judge while the bottle flies, starts the `result` phase when the outcome is decided, and brings the next bottle after the result delay; `skip()` brings it at once |
| `src/game/config.ts` | Phaser game config and scene list |
| `src/game/scenes/` | `BootScene` (starts the game; load or generate assets here later), `GameScene` |
| `src/game/view/` | Drawing helpers for scene parts, e.g. `tableView.ts` (the table) and `bottleView.ts` (the bottle and its water), both from the core constants |
| `src/game/theme.ts` | Fonts and colors |
| `src/debug/testHooks.ts` | `window.__FLIPPER__` |
| `scripts/snap.ts` | Headless screenshot tool (`npm run snap`); `scripts/snapActions.ts` parses its `--do` actions |
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
| D5 | Landscape 1280×720 logical canvas | The game targets desktop browsers, which are landscape; the table is wide and a toss stays comfortably on screen. `Scale.FIT` letterboxes other window shapes. The design allows changing the orientation later: only `GAME_WIDTH`/`GAME_HEIGHT` and the table constants would move. |
| D6 | Placeholder art drawn in code | No asset pipeline until the art direction is decided. |
| D7 | The held bottle is a kinematic body; `Bottle.release()` makes it dynamic | It can't drift or sleep while it waits, and a throw only has to call `release()` and apply an impulse. A kinematic body reports zero mass, so use `bottleMassProperties` for mass before a release. |
| D8 | The water is one more fixture on the bottle body with density, `isSensor` and a zero collision mask | It adds mass and moves the center of mass but never collides, so no contact events come from it. `setWater` rebuilds it. |
| D9 | `setTuning` and `setWater` only touch the bottle while the phase is `aiming` | A bottle in flight keeps the body and launch it was given, so retuning (the tuning panel) or changing the water mid-throw can never alter a flight or make `lastThrow.water` disagree with the bottle. Tuning for later throws and bottles still updates. |
| D10 | A throw is two impulses at the center of mass, `p/100` of the tuning's linear and angular impulse at power 100, and the body divides them by its own mass and inertia | This is decision P2 in code: the water's mass and inertia lower the speed and spin without special cases. Power maps linearly for now; F009 may reshape the mapping when it calibrates. |
| D11 | The landing is judged by a `LandingJudge` that only reads samples (pose, speeds, table contact) once per step, created at release with the tuning of that moment | Decision P4 in code: nothing can move or turn the bottle to help or hurt a landing, and retuning mid-flight can't change how a flight is judged (as D9). Everything counts steps (P5); the thresholds are all `Tuning` fields. |
| D12 | Resting means nearly still **and touching the table**: a success needs 1 s upright (within 15° modulo a full turn), a fail 0.5 s still and not upright (more than 135° off is `cap`, else `side`). `offTable` is the lowest point 0.1 m below the tabletop, `offScreen` is the whole bottle past the left, right or bottom edge, `timeout` is 300 steps after release. Priority within a step: offScreen, offTable, upright, side/cap, timeout | Contact keeps the slow top of a flight from counting as rest; the fail wait is shorter than the success hold so a lost bottle doesn't make the player wait a second. A success that completes on the timeout step wins. |
| D13 | The step that sets the outcome also sets the phase to `result`, adds the success to `score`, and starts the delay; `snapshot().outcome` is fixed for that throw and kept through `result`, and the next bottle starts with `null` | The judge decides once; the phase, the score and the HUD (F007) all follow from that one step. Physics keeps running during `result`, so the judged bottle can still settle in view. |
| D14 | `placeBottle(pose)` is the only way to start a throw from an exact state, works only while `aiming`, and leaves `lastThrow` null | Tests and snaps create landings directly (water level from `setWater` first). It isn't a throw with a power, so it has no `lastThrow`, but it counts in `throws` like any other release. |
| D15 | After the result delay (90 steps, `resultDelaySeconds`, counted from the outcome step) or `skip()`, the judged bottle's body is destroyed and a new `Bottle` is created in the hand with `drawWaterLevel(rng, tuning)` (the seed's next value), using the tuning in effect then | A fresh body is upright, still and unaffected by gravity with no leftover contacts or sleep state, and the next bottle's water is a pure function of the seed and how many bottles came before. Skipping the wait never changes the water sequence or any later throw. `skip()` does nothing outside `result`. |
| D16 | `throws` counts a throw when the bottle is released (by `throwBottle` or `placeBottle`); `score` counts a success when its outcome is decided. `lastThrow` keeps describing the last real throw while the next bottle waits | "Throws made so far" includes the one in the air. F013 derives the throw number for the HUD from `throws` and the phase. |

## Plan

Written by the planner (session 1) from `docs/GAME_DESIGN.md`. `harness/state/feature_list.json` is the build order (F001–F029, milestones M1–M7); this section is the intended shape. F001 switched the canvas to landscape 1280×720 and updated the coordinates table and D5 above.

### Expected modules

| Path | Responsibility | Features |
| --- | --- | --- |
| `src/core/tuning.ts` | `DEFAULT_TUNING` and the `Tuning` type: every tunable gameplay number (built in F002; later features add their fields) | F002 on |
| `src/core/table.ts` | the table: static body, top surface and end constants (built in F001) | F001 |
| `src/core/bottleShape.ts`, `bottle.ts` | bottle shape; mass and center of mass per water level; the physics body and the water draw (built in F002) | F002 |
| `src/core/throw.ts` | power (0–100) → launch impulse and spin (built in F003; the bottle's mass and inertia bring the water in) | F003 |
| `src/core/outcome.ts` | judging rest: upright, side, cap, off table, off screen, timeout (built in F004) | F004 |
| `src/core/simulation.ts` | planck world, phases, throw cycle, score, rounds; `snapshot()` and events | F001–F013 |
| `src/core/powerMeter.ts`, `push.ts` | power bar (taps, hold acceleration, wheel); mouse push → power | F006, F011 |
| `src/core/round.ts` | round counters, streak, `updateBest` | F013, F015 |
| `src/core/flipWindow.ts`, `difficulty.ts` | power sweeps, flip windows, simulated-player benchmark | F008, F020 |
| `src/core/replay.ts` | per-step recording and the landing clip | F026 |
| `src/game/scenes/` | Boot → Game in M1 (the placeholder Menu is gone); Summary, Title and the Pause overlay later | F001, F014, F018, F019 |
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
