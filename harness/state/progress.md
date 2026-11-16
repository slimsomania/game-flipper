# Flipper: agent session log

Append-only. Each agent session adds an entry at the end, and the harness adds a `[harness]` line after every session with what it observed and corrected. Start each session by reading the tail: `tail -n 120 harness/state/progress.md`.

## Session 0 · setup (human + Claude Code)
- Did: Scaffolded the project: Vite + TypeScript + Phaser 3.90 + planck.js; Vitest unit tests, Playwright e2e tests, the `npm run snap` screenshot tool, `window.__FLIPPER__` test hooks, and this harness. The game scene is a placeholder: a bottle drops onto a table and settles.
- Verified: `npm run verify` passes; `npm run snap` shows the menu and the placeholder scene rendering with WebGL.
- Issues / follow-ups: On Windows, Vitest must run through `npm test` (it uses `scripts/canonical-cwd.mjs` to avoid a drive-letter casing bug).
- Next: The planner turns `docs/GAME_DESIGN.md` into `harness/state/feature_list.json`.

## Session 1 · planner (initial)
- Did: Wrote the initial plan in `harness/state/feature_list.json`: 29 features (F001–F029) in 7 milestones, every one `todo`. Added a "Plan" section to `docs/ARCHITECTURE.md` covering the expected modules, the snapshot shape, the phase flow and key decisions P1–P11.
- Milestones:
  - M1 First playable (F001–F010): landscape table scene, a bottle with random water, throw by power, landing judgement, result and next bottle, power bar with Up/Down/wheel/Space, result flash and score, flip-window sweep tool, calibration, developer tuning panel.
  - M2 Mouse push (F011–F012): push-to-power conversion (last 150 ms, distance plus speed), then grabbing and pushing the bottle.
  - M3 Rounds and best score (F013–F015): 10-throw rounds with streak and R to restart, round summary, best score in localStorage.
  - M4 Screens and audio (F016–F019): sound effects generated with Web Audio, mute (M and a button, remembered), title screen, pause overlay.
  - M5 Polish and tuning (F020–F022): difficulty benchmark with simulated players, camera shake and particles, an e2e pass over awkward play.
  - M6 Sloshing and replay (F023–F027): sloshing water behind a switch, drawing the moving water, sloshing on by default with recalibration, throw recording, slow-motion landing replay.
  - M7 Release readiness (F028–F029): performance budget and leak check, production-build e2e check, and a README Play section.
- Assumptions:
  - Water ranges from 10% to 90% in 5% steps; the level is the filled fraction of the bottle body. Water is modeled as a fill from the base, so the center of mass is below an empty bottle's at every level, but it isn't monotonically lower as the level rises. That is my reading of the design's "closer to the bottom".
  - The "fixed forward drift" is a fixed launch direction a few degrees forward of vertical; the spin is clockwise. The bottle is held upright in the air above the table near its left end, with no hand graphic (the design asks for nothing on screen but the table and the background).
  - The 5 s timeout counts from release. "Leaves the screen" means the left, right or bottom edge; flying above the top and falling back is allowed. Resting more than 135° from upright is "cap", any other non-upright rest is "side".
  - Power starts at 50% and keeps its value between throws, and the bar shows a percentage (the player's own setting, not a hint). A mouse push sets the same shared value. Releasing without an upward push cancels instead of throwing at 0. Pushes are measured in logical game pixels.
  - M1 boots straight into play and the placeholder menu is removed; the title screen arrives in M4 (F018), when earlier e2e tests must start the Game scene themselves.
  - Restarting a round continues the seed's water sequence. "New best!" appears only for a strictly higher score. Space/Enter choose Play on the title and Play again on the summary.
  - The pause overlay has Restart, Resume and Quit to title. Section 6 lists only Resume and Quit; the controls table adds Restart.
  - The replay plays after the result flash, and the core result phase is lengthened by the replay's length; skipping goes straight to the next bottle.
  - The difficulty targets are checked with simulated players: practiced aims at each bottle's window center, new aims at one fixed power for all bottles, both with σ ≈ 8 points. These models are a proxy.
  - The tuning panel opens with Backquote in dev builds or with `?debug`, and its edits persist in localStorage.
  - I added M7 for section 10's technical targets (60 fps, a working production build). It builds nothing the design rules out.
- Open questions:
  1. Design tension (F009): a single-flip window of about ±10 points needs spin that grows slowly with power, so clean double flips may be out of reach below 100% power. The plan prioritizes the single-flip window (12–28 points wide, full bottle 1.5–2× the power of an empty one) and only requires that too much power over-rotates. Do you want reachable double-flip windows as well?
  2. If you retune with the panel after M1 and paste the values into `src/core/tuning.ts`, the F009 window tests (and later the F020 rates) still encode the design's starting targets. When you change the difficulty on purpose, adjust those test ranges yourself; agents may not loosen tests.
  3. Design open question 3: the plan never shows where the bottle will land. Say if you want an indicator.
  4. Two harness prompts still assume portrait or phone play: `harness/prompts/reviewer.md` suggests checking a phone-sized viewport (`--width 390 --height 844`), and the snap example in `harness/prompts/builder.md` uses portrait coordinates (`drag:360;1000;…`). Agents can't edit them, so consider updating them for the landscape desktop game.
  5. Only Chromium is installed for tests, so Firefox and Edge aren't covered automatically. Check them by hand at milestone stops, or allow adding Playwright's Firefox later.

> [harness] session 1 · planner · ok · 1 commit(s) · 37 tool calls · 17m 26s · ~$3.82 API-equivalent

## Human decisions on the planner's open questions (2026-11-16)
- Recorded in `docs/GAME_DESIGN.md` section 13 ("Decided after the first plan"), which is the reference.
  1. Single flips first: double-flip windows are not required; the single-flip window wins any conflict (F009 notes updated).
  2. Calibration and difficulty tests lock the design's targets, not tuning values. If the human changes a target in section 3, agents update the matching test ranges and log it.
  3. No landing indicator; the drift is tuned so in-window throws land around the middle of the table.
  4. Fixed: `harness/prompts/builder.md` and `reviewer.md` now use landscape desktop examples (commit 122e288).
  5. Automated tests stay Chromium-only (covers Edge); the human checks Firefox by hand at milestone stops; revisit at M7.

## Session 2 · builder · F001 Switch to a landscape 1280×720 table scene
- Did:
  - Canvas: `GAME_WIDTH`/`GAME_HEIGHT` are 1280/720 in `src/core/constants.ts`; the Playwright viewport is 1280×720; `scripts/snap.ts` defaults to the constants and its help examples use landscape coordinates; `docs/ARCHITECTURE.md` has the new coordinates table (with a Table row), D5, the directory map and the module plan.
  - Table: new `src/core/table.ts` with exported `TABLE_TOP_Y` (5.6 m, 78% down), `TABLE_LEFT_X` (1.6 m), `TABLE_RIGHT_X` (11.2 m), `TABLE_THICKNESS`, `TABLE_CENTER_X`, and `createTable(world)`, which adds a static box body. The table spans 75% of the width with 1.6 m of screen beyond each end. `Simulation` uses it, and the placeholder bottle now drops from (table center, y = 2 m). `TABLE_Y` is gone; `TABLE_TOP_Y` replaces it.
  - Scene: `src/game/view/tableView.ts` draws a flat brown slab with two darker legs that run off the bottom of the screen. The background is a light `#eaf0f6` (`COLORS.background` in `src/game/theme.ts`, used by the Phaser config); the text colors are now dark ones for a light background; the HTML page background is a slightly darker `#cdd7e2` so the letterbox reads as a frame. I darkened the placeholder bottle's blue a little so it shows on the light background; F002 owns the real bottle art.
  - Boot: `BootScene` starts `Game`; `MenuScene` and all placeholder text are gone; `GameScene` calls `markReady()`. I dropped the Esc-to-menu key (no menu); the placeholder R-to-restart key stays.
  - Snap: new `call:<method>;<arg>;...` action. Arguments parse as number, true/false or else string; an unknown method is reported as an error; return values go into the report's `calls` list; it waits 50 ms afterwards so the next shot shows the result. The parsing is in `scripts/snapActions.ts` so it can be unit-tested.
  - Tests: `tests/unit/table.test.ts` (layout on screen, ends ≥ 1 m inside, static body bounds, a box rests on the top, a box past either end falls off), `tests/unit/simulation.test.ts` (uses `TABLE_TOP_Y`, plus the bottle stays between the ends), `tests/harness/snapActions.test.ts`, and `tests/e2e/smoke.spec.ts` (boots into Game and not Menu with no errors; the canvas is 1280×720 in the viewport; the bottle settles on the table).
- Verified: `npm run verify` passed at the start (47 unit, 2 e2e) and at the end (60 unit, 3 e2e, build). `npm run snap -- --do 'pause,call:step;120,shot:table'` works and I looked at `01-table.png`: light background, flat brown table from x = 160 to 1120 px with both ends visible, the bottle lying on it, no text, no console errors. Also looked at a 1000×800 window (the letterbox shows as a darker frame, the legs end cleanly at the canvas edge), and `call:nope` reports "window.__FLIPPER__.nope is not a function" as a snap error.
- Status: F001 → needs_review
- Issues / follow-ups:
  - The two old smoke tests assumed the menu ("boots to the menu", "SPACE starts the game"). I rewrote them for the new boot flow because the feature removes the menu; every old assertion about the bottle settling is kept. When F018 adds a title screen, e2e tests that need play must start the Game scene themselves (as the plan already says).
  - planck gives every polygon a 1 cm skin, so bodies rest about 1 to 2 cm above the exact table top (about 2 px). The table test allows 1.5 cm for this; it is not worth compensating.
  - Two bash commands in this session were denied automatically (a compound `git check-ignore` call and a heredoc one-liner), so I read files with the Read tool instead. Nothing was lost.
- Next: F002 (random water level, bottle held in the hand) replaces the placeholder drop in `src/core/simulation.ts`. Build the hand position from `TABLE_LEFT_X`/`TABLE_TOP_Y` in `src/core/table.ts` (the plan puts it near the left end), and look at it with `npm run snap -- --do 'pause,call:step;60,shot:x'`.

> [harness] session 2 · builder F001 · todo → needs_review · ok · verify passed · 1 commit(s) · 86 tool calls · 5m 34s · ~$1.15 API-equivalent

## Session 3 · reviewer · F001 Switch to a landscape 1280×720 table scene
- Verdict: pass
- Evidence: Read the full diff `0ffcd558..HEAD`. `npm run verify` passed (format, typecheck, unit, build, 3 e2e). The e2e test checks that activeScenes() contains 'Game' and not 'Menu', with no console errors. `tests/unit/table.test.ts` checks that the top is on screen, both ends are at least 1 m inside, and a box rests on the top or falls past either end. `npm run snap -- --do 'pause,call:step;120,shot:table'`: the report's `calls` holds the snapshot returned by step(120). The screenshot shows a light background, a brown table from 160 to 1120 px with both ends and legs, the bottle lying on it, and no text. Edge cases: a 1024×576 window with `key:R` ×3 and then 600 steps (seed 3 → 6) restarts the scene cleanly and scales without clipping; `call:nope` is reported as a snap error. The constants, Playwright viewport, snap defaults and help, and ARCHITECTURE (coordinates table, D5) all say 1280×720. No references to Menu or TABLE_Y remain.
- Problems: none
- Notes for later: The smoke tests that needed the menu were rewritten because this feature removes the menu. The settling assertions were kept and tightened (the bottle stays between the ends and above the top), so no test was weakened. Bodies rest 1–2 cm above the table top because of planck's polygon skin, which is acceptable. The production bundle is 1.4 MB (Phaser); keep this in mind for M7.

> [harness] session 3 · reviewer F001 · needs_review → done · ok · 1 commit(s) · 18 tool calls · 1m 36s · ~$0.63 API-equivalent

## Session 4 · builder · F002 Spawn a bottle with a random water level, held in the hand
- Did:
  - Shape and mass, `src/core/bottleShape.ts` (pure geometry, no planck): the dimension constants (`BOTTLE_BODY_WIDTH` 0.66 m, `BOTTLE_BODY_HEIGHT` 1.1 m, shoulder, neck, cap, `BOTTLE_WALL`, `BOTTLE_HEIGHT` 1.74 m), the four convex `BOTTLE_PARTS`, `waterRect`/`waterVertices(level)` (the surface is at `level * BOTTLE_BODY_HEIGHT` above the base), and `bottleMassProperties(level, tuning)` (mass and center of mass height, computed analytically from the same polygons). Local origin is the center of the flat base, y down, so the bottle extends to negative y.
  - Physics, `src/core/bottle.ts`: `Bottle` builds the shell from four polygon fixtures plus one water fixture (density, `isSensor`, `filterMaskBits: 0`, so it adds mass but never collides). `setWater(level)` clamps to 0..1 and rebuilds the water fixture. The held bottle is a kinematic body at `HAND_X` = 2.8 m, `HAND_Y` = 4.6 m (base 1 m above the table top, 1.2 m in from the left end); `release()` makes it dynamic for F003. `drawWaterLevel(rng, tuning)` takes one RNG number and returns `waterMin` plus a whole number of steps, rounded to remove float noise.
  - Tuning, new `src/core/tuning.ts`: `DEFAULT_TUNING` (`waterMin` 0.1, `waterMax` 0.9, `waterStep` 0.05, `shellDensity` 0.35, `waterDensity` 1, `bottleFriction` 0.6, `bottleRestitution` 0.15) and `resolveTuning(overrides)`. `Simulation` takes `tuning?: Partial<Tuning>` (decision P6) and keeps its seeded RNG for later bottles.
  - Simulation: the placeholder drop is gone. The snapshot's `bottle` is now `BottleSnapshot` (`BodySnapshot` plus `water`). `Simulation.setWater(level)` and `window.__FLIPPER__.setWater(level)` (it returns the new snapshot, or null with no game) were added.
  - View: `src/game/view/bottleView.ts` draws a translucent blue shell (alpha 0.55), an opaque lighter cap and a deeper blue fill, all from the `src/core/bottleShape.ts` exports (a container holds the pose; the water graphic is redrawn only when the level changes). No text. `BootScene` no longer builds a placeholder texture and just starts the game; `COLORS.label` is gone and `COLORS.bottle`, `cap` and `water` have the new values.
  - Docs: `docs/ARCHITECTURE.md` has the bottle row in the coordinates table, the new files in the directory map, the plan table, and decisions D7 (kinematic held bottle) and D8 (water fixture).
- Verified:
  - `npm run verify` was green before I started (60 unit, 3 e2e) and at the end: 91 unit, 7 e2e, build.
  - Acceptance 1: `tests/unit/waterLevel.test.ts` (30 seeds × 100 draws within range and on a step; all 17 steps reached; same seed same sequence; different seeds different; custom range; the `Simulation` first bottle uses the seed's first draw).
  - Acceptance 2: `tests/unit/bottle.test.ts` (mass strictly increases over 10% to 90%; center of mass lower than the empty bottle's at all 17 levels; the analytic values match the planck body's `getMass()` and `getLocalCenter()` at every level).
  - Acceptance 3: `tests/unit/bottle.test.ts` "waits upright and still at the hand... for 300 steps" (seeds 1 to 3), plus a check that the hand is above the table, on screen and in the left quarter of it.
  - Acceptance 4: `tests/e2e/bottle.spec.ts` "setWater(0.9) changes bottle.water in the snapshot" (also covers 0.1, 0, 1).
  - Acceptance 5: `npm run snap -- --do "pause,call:setWater;0.1,shot:low,call:setWater;0.9,shot:high"`, and 0.5 as well; I looked at the PNGs. The bottle is translucent blue with a lighter cap, the fill is a thin strip at 10% and fills most of the body at 90% (at 50% its top is at 405 px, as `0.5 * 1.1 m` above the base predicts), there is no text, and there are no console errors.
  - A released bottle falls and rests upright on its flat base at 10%, 50% and 90% water (`tests/unit/bottle.test.ts`).
- Status: F002 → needs_review
- Issues / follow-ups:
  - The placeholder tests that asserted the drop (`simulation.test.ts` "drops the bottle onto the table...", and the matching e2e in `smoke.spec.ts`) tested behavior this feature removes. I replaced them with "waits in the hand" tests of the same shape, and rewrote "starts differently for different seeds" to compare water levels (the old one compared the random starting angle, which no longer exists). Determinism is still tested.
  - `shellDensity` 0.35 is a starting guess: the shell is solid polygons, so it is an effective density. Full (90%) is about 2.4× the mass of 10%. F009's calibration may want to change it (or the throw mapping); its range target is "full bottle needs 1.5–2× the power of an empty one".
  - The bottle is 66 × 174 px on the 1280×720 canvas, which looks smallish next to the table. I left the size alone because it fixes the flip geometry; revisit when the throw (F003) exists and you can see a whole flip.
  - A held (kinematic) body reports zero mass, so use `bottleMassProperties` for mass before `release()`.
  - Compound shell commands such as `( ... | tail )` were auto-denied again in this session; plain `npm run verify` and the other single commands worked.
- Next: F003 (throw by power): call `Bottle.release()` on the held bottle, then apply the launch impulse and angular impulse at the center of mass. Divide by the dynamic body's `getMass()` and `getInertia()` (P2). The `Simulation` already keeps `bottle: Bottle` and its seeded `rng` for the next bottle (`drawWaterLevel(this.rng, this.tuning)`).

> [harness] session 4 · builder F002 · todo → needs_review · ok · verify passed · 1 commit(s) · 81 tool calls · 7m 5s · ~$1.34 API-equivalent

## Session 5 · reviewer · F002 Spawn a bottle with a random water level, held in the hand
- Verdict: pass
- Evidence: I read the full diff `73e5252a..HEAD`. `npm run verify` passed: format, typecheck, unit, build and 7 e2e.
  - Criterion 1: `tests/unit/waterLevel.test.ts` checks 30 seeds × 100 draws stay in range and on a step, all 17 steps get reached, the same seed gives the same sequence and different seeds give different ones. The defaults (0.1, 0.9, 0.05) live in `src/core/tuning.ts`.
  - Criterion 2: `tests/unit/bottle.test.ts` checks the mass strictly increases and the center of mass sits below the empty bottle's at all 17 levels. It also checks the analytic values against planck's `getMass()` and `getLocalCenter()`.
  - Criterion 3: a 300-step test for seeds 1 to 3 checks x, y, angle and velocities are exactly unchanged, and that the hand is above the table and in its left quarter.
  - Criterion 4: `tests/e2e/bottle.spec.ts` "setWater(0.9)…" passes.
  - Criterion 5: I took my own snaps. At `setWater;0.1` the fill is a thin strip at the base; at `0.9` it fills most of the body. The bottle is translucent blue with a lighter cap, there is no text, and `bottleView.ts` draws only from `BOTTLE_PARTS` and `waterVertices`.
  - Edge cases: `key:R` twice moved the seed to +2, then `setWater;1` and 300 steps kept the bottle at (2.8, 4.6) with the fill reaching the shoulder. At 1024×576, `setWater;0` drew an empty bottle, `setWater;-5` clamped to 0, and `0.45` drew a fill a little under half. There were no console errors.
  - Test changes: the placeholder drop tests (unit and smoke e2e) were replaced, not weakened. This feature removes the drop on purpose, and the determinism test is unchanged.
- Problems: none
- Notes for later:
  - The bottle is drawn about 66×174 px, which is small next to the table. Revisit this once the throw exists (F003) and a full flip is visible, as the builder also noted.
  - A held (kinematic) bottle reports zero mass. F003 must call `release()` before reading `getMass()` and `getInertia()` for the impulse.

> [harness] session 5 · reviewer F002 · needs_review → done · ok · 1 commit(s) · 22 tool calls · 1m 36s · ~$0.75 API-equivalent

## Session 6 · builder · F003 Throw the bottle with a power value
- Did:
  - Throw maths, new `src/core/throw.ts`: `clampPower`, `ThrowSource` (`'keyboard' | 'mouse'`) and `throwImpulse(power, tuning)`, which returns a linear impulse (a fixed direction, `throwAngleDeg` toward +x from straight up) and a clockwise angular impulse, both `power/100` of the tuning's value at power 100.
  - Tuning, `src/core/tuning.ts`: new `throwAngleDeg` (12), `throwLinearImpulse` (9) and `throwAngularImpulse` (1). They are starting values, not calibrated.
  - Physics, `src/core/bottle.ts`: `Bottle.launch(impulse)` releases the held bottle (it must be dynamic before it has mass) and applies both impulses at the center of mass, so the body's own mass and inertia divide them (P2). `Bottle.applyTuning(tuning)` rebuilds the shell and water fixtures with new tuning; it is only called while held.
  - Simulation, `src/core/simulation.ts`: `throwBottle(power, source = 'keyboard')` (returns true if it threw), `setTuning(overrides)`, `phase` (`'aiming' | 'flying'`) and `lastThrow` (`{power, water, source}`, with the clamped power) in the snapshot. `tuning` is now a getter. `setTuning` applies to the held bottle and to later throws but never to a bottle in flight. `setWater` is ignored once the bottle is thrown (decision D9), so a flying bottle never changes mass.
  - Test hook: `window.__FLIPPER__.throwBottle(power)` returns the new snapshot.
  - Docs: `docs/ARCHITECTURE.md` directory map, plan table, and decisions D9 (tuning and water only change the held bottle) and D10 (the throw as two impulses).
- Verified:
  - I did not run `npm run verify` before starting; I relied on the harness's green result after session 4, since session 5 only changed state files. At the end it passed: format check, typecheck, 119 unit, build, 11 e2e.
  - Acceptance 1: `tests/unit/throw.test.ts` "launches the bottle up, toward the table, spinning clockwise" (3 water levels × 3 powers: vy < 0, 0 < vx < 0.25·|vy|, omega > 0). The default direction is 12° (tan = 0.21).
  - Acceptance 2: "gives strictly more launch speed and spin for more power, at every water level" (17 levels × powers 0 to 100) and "strictly less ... for more water, at every power" (11 powers × 17 levels). A test also checks launch speed equals the impulse divided by the bottle's mass.
  - Acceptance 3: the clamp tests (250 and Infinity equal 100, negative equals 0, `lastThrow.power` is clamped), "does nothing once the bottle is in flight", and the determinism test (same seed, tuning, water and power → equal snapshots after 300 steps).
  - Acceptance 4: "applies overrides given to the Simulation" (doubling the impulses doubles speed and spin), "setTuning changes the throw of a bottle that is still held", and "setTuning during a flight does not alter that flight" (every tuning field changed at step 20; the snapshot at step 300 is identical to an unchanged control).
  - Acceptance 5: `tests/e2e/throw.spec.ts` "throwBottle(50) launches the bottle ...": phase `flying`, `lastThrow` `{power: 50, water: 0.5, source: 'keyboard'}`, the apex is more than 1 m above the hand, and after 240 more steps it is on the table between its ends, turned over, and nearly still. Three more e2e tests cover aiming at the start, clamping and one throw per bottle, and browser flight equal to the core simulation.
  - Acceptance 6: `npm run snap -- --do "pause,shot:start,call:throwBottle;50,step:20,shot:flight"`; I looked at both PNGs. The start shot shows the upright bottle in the hand. After 20 steps the bottle is turned about 100° and flying above the table's left end, completely on screen, with no text and no console errors.
  - A throw after the held bottle has gone to sleep (planck sleeps a still kinematic body) works: unit test "throws just as hard after the held bottle has waited long enough to fall asleep" (600 steps held, then the same launch velocity as an immediate throw).
- Status: F003 → needs_review
- Issues / follow-ups:
  - A scratch run (since deleted) with the starting numbers: an empty bottle (10%) turns about one full flip when thrown at power ~35 to 40 and a full one (90%) at ~65 to 70, a ratio of about 1.8, inside the design's 1.5 to 2×. The in-window flips land at x of about 5 to 6 m, left of the table's middle (6.4 m). The drift is only 12° from vertical (the acceptance caps it near 14°), so F009 may need a bigger spin or speed rather than a bigger angle to center the landings.
  - Powers well above the window send an empty bottle far off screen: at power 100 the 10% bottle rises past y = −20 m. That is the over-power fail the design wants, but F009/F010 may want a gentler curve.
  - Rotation grows with about the square of power (spin × flight time, both linear in power), which makes the window narrow in power. F009's target of a 12 to 28 point window may need a non-linear power to speed mapping. I left the mapping linear (D10).
  - The bottle sleeps while held (a kinematic body at rest). Tests that compare snapshots before and after waiting must ignore the `awake` flag.
  - A mid-session shell one-liner with a heredoc was denied automatically, so I used the Edit tool for those changes. Nothing was lost.
- Next: F004 (judge the landing) adds the `result` phase after `flying`; extend `Phase` in `src/core/simulation.ts` and keep `throwBottle` limited to `aiming`. In my scratch runs the bottle was at rest (asleep) within 600 steps (10 s) of every throw I tried at powers 30 to 80, but I did not measure rest times closely, so check them against the 5 s timeout.

> [harness] session 6 · builder F003 · todo → needs_review · ok · verify passed · 1 commit(s) · 71 tool calls · 6m 54s · ~$1.21 API-equivalent

## Session 7 · reviewer · F003 Throw the bottle with a power value
- Verdict: pass
- Evidence:
  - `npm run verify` passed: format, typecheck, 119 unit tests (12 files), build, 11 e2e tests.
  - Read the diff. The throw is in `src/core/throw.ts` and `simulation.ts`, and its numbers are in `tuning.ts`. The test hook only calls `Simulation.throwBottle`. The test diff only adds files (`throw.test.ts`, `throw.spec.ts`), so nothing was removed or weakened.
  - Criteria 1 to 4: the unit tests check each one directly. They cover direction, drift below 0.25·|vy| and clockwise spin at 3×3 water/power pairs; strict monotonicity over 17 levels × 11 powers; clamping, NaN, the aiming-only guard and determinism over 300 steps; and that the override doubles speed and spin while setTuning mid-flight changes every field and the flight still matches the control.
  - Criterion 5: in `throw.spec.ts`, the bottle peaks more than 1 m above the hand and ends on the table between its ends, nearly still, with lastThrow `{50, 0.5, keyboard}`.
  - Criterion 6: snap `pause,call:throwBottle;50,step:20,shot:flight`. I looked at the PNG: the bottle is turned about 100° and is high above the table's left part.
  - Edge cases at 1024×576 (seed 403169): `setWater;0.1` plus `throwBottle;100` sends the bottle off the top of the screen (vy −22.6 m/s). A `throwBottle;10` mid-flight was ignored (lastThrow stayed 100). `key:R` then `throwBottle;40` gave a fresh seed, phase flying, and a full bottle turned in the air. There were no console errors.
- Problems: none
- Notes for later:
  - An empty bottle at high power goes far off screen (it reaches y < −6 m within 30 steps). The design accepts this as an over-power fail, but F009/F010 may want a gentler power curve, as the builder noted.
  - The water is drawn fixed in the bottle's frame, so mid-flight it lies along the base, not under gravity. This is fine until sloshing (M6).
  - The hook's `throwBottle` returns a snapshot even when the throw is refused. The e2e tests rely on this, but a later UI may want the boolean too.

> [harness] session 7 · reviewer F003 · needs_review → done · ok · 1 commit(s) · 14 tool calls · 2m 4s · ~$0.56 API-equivalent

## Session 8 · builder · F004 Judge the landing: upright success or fail
- Did:
  - Judge, new `src/core/outcome.ts`: `LandingJudge` is created at release (with the tuning of that moment and the release angle) and `observe(sample)` is called once per step. The sample is pose, speeds and `onTable`; the judge never touches the bottle. Helpers `wrapAngle`, `tiltFromUpright` (modulo whole turns) and `bottleExtent` (bounding box of the shell at a pose) are exported and tested.
  - Rules, in priority order within a step: `offScreen` (the whole bottle past the left, right or bottom edge; the top doesn't count), `offTable` (lowest point more than `offTableDepth` below the tabletop), `upright` (on the table, nearly still and within the tolerance for 1 s), `side`/`cap` (on the table, nearly still and not upright for `failRestSeconds`; more than 135° off is `cap`), `timeout` (300 steps after release). Rotation is the sum of per-step wrapped angle changes since release, so it survives any number of turns; `turns` is that over 2π, rounded, never -0.
  - Tuning, `src/core/tuning.ts`: `uprightToleranceDeg` 15, `uprightHoldSeconds` 1, `capAngleDeg` 135, `stillSpeed` 0.05 m/s, `stillSpin` 0.1 rad/s, `failRestSeconds` 0.5, `offTableDepth` 0.1 m, `timeoutSeconds` 5. Times are converted to whole steps (P5).
  - Physics, `src/core/bottle.ts`: `Bottle.place(pose)` (set the transform, make it dynamic, set both velocities, wake it) and `Bottle.touches(body)` (a touching contact with that body). `BottlePose` is `{x, y, angle, vx?, vy?, omega?}`.
  - Simulation, `src/core/simulation.ts`: `placeBottle(pose)` (aiming only, returns false for a bad number or a wrong phase, starts the judge and the flight), `outcome` in the snapshot (null until decided, then fixed), and `step()` feeds the judge. The table body is kept for the contact check. The phase stays `flying` after the outcome: F005 owns the `result` phase.
  - Hook: `window.__FLIPPER__.placeBottle(pose)` returns the new snapshot. Docs: `docs/ARCHITECTURE.md` directory map, plan table and decisions D11 to D14.
- Verified:
  - `npm run verify` was not run before I started (the harness's result after session 6 was green and session 7 only changed state files). At the end it passed: format check, typecheck, 163 unit tests (13 files), build, 16 e2e tests.
  - Acceptance 1: `tests/unit/outcome.test.ts` "judges an upright bottle placed just above the table a success once it stood still for 1 s": null at 30 and 59 steps, success after more than 60 and fewer than 150, plus a synthetic-sample test that 59 still steps are not enough and 60 are, and that moving, spinning, leaving the table or tipping past the tolerance restarts the count.
  - Acceptance 2: "side" (both ways), "cap" (upside down, exactly balanced), "offTable" (past either end; also a bottle half over the end that tips off) and "offScreen" (placed at 40 m/s toward the right and left edges, above the table), each in the Simulation. Synthetic tests cover the 135° boundary, the screen edges (half out is still on screen) and the table depth.
  - Acceptance 3: angles 2π, −2π and 3π·2 are `upright` with `turns` 0 and tiny `rotation`; 2π + π/2 is `side`. A bottle released at 1 rad spinning at 2 turns/s has `rotation` equal to its unwrapped angle minus 1 and `turns` of at least 1; a counterclockwise spin gives negative turns.
  - Acceptance 4: "lets a 50%-water bottle placed still on a corner of its base, tilted 10°, tip back and succeed" also checks that it really rocked (peak |omega| > 0.2, back within 1° of upright, rotation negative). A 60° tilt on the same bottle fails.
  - Acceptance 5: timeout 0.5 s gives `timeout` at exactly step 30 and null at 29; the default is step 300. Outcomes never change (a bottle left for 600 more steps, a timeout followed by a landing, and the judge directly).
  - Acceptance 6: `tests/e2e/outcome.spec.ts` (5 tests): upright then 150 frames is `success`/`upright`, null at 30 frames; on its side is `fail`/`side`; beyond the table is `offTable`; thrown sideways is `offScreen`; a real throw has an outcome within 300 steps that stays the same 300 steps later; `placeBottle` during a flight changes nothing.
  - Snaps (the `call:` action can't pass an object, so I used throws): `--url /?seed=7 --do "pause,call:throwBottle;0,call:step;50,shot:falling,call:step;70,shot:standing,state:done"` shows an upright bottle on the table, outcome `success`/`upright`, turns 0. `pause,call:setWater;0.5,call:throwBottle;30,call:step;40,shot:flying,call:step;260,shot:landed` shows the bottle lying on its side, outcome `fail`/`side`, rotation 1.5708, turns 0. No console errors.
  - A sweep of the defaults (water 10, 30, 50, 70, 90% × power 0 to 100 in steps of 5, seed 1, 105 throws): 17 `upright`, 67 `side`, 9 `offTable`, 9 `offScreen`, 3 `timeout`; the outcome came after 93 to 278 steps, or at the 300-step timeout (`upright` once, on step 300).
- Status: F004 → needs_review
- Issues / follow-ups:
  - **Power 0 is a success.** The hand is 1 m above the table and the throw is 12° from vertical, so power 0 just drops the bottle, which lands upright (outcome `upright`, 0 turns, after 95 steps). The same happens at power 5 (every water level) and power 10 (50% to 90% water): 13 of the sweep's 17 successes had 0 turns. F004's rules say success is "after any number of turns", which includes 0, so I judged it that way. F008's acceptance says "the throw at power 0 fails" and the design says too little power lands on its side. Someone has to decide: a minimum rotation for success, a throw that can't land flat (for example the hand higher or the drop moved off the table), or dropping that F008 line. I changed nothing for this.
  - **Slow settling collides with the 5 s timeout.** 3 of the 105 sweep throws ended as `timeout` (water 30% power 45, water 30% power 75, water 50% power 70), and water 70% power 85 succeeded on the very last step. I traced the 30%/45 and 50%/70 throws: both land upright but keep rocking on their base for about 2.5 s (angles swing ±20° at 0.5 to 1 rad/s), so they never get a full second of stillness before step 300, and the bottle is standing upright at the end. I did not trace the other two. The judge is behaving as specified; the cause is that the bottle takes about 2.5 s to stop rocking (restitution 0.15 and no damping). F009 should add damping or tune friction, or loosen `stillSpeed`/`stillSpin`/`timeoutSeconds`, and then lock "an upright landing is judged a success" in its tests.
  - The existing e2e test in `throw.spec.ts` asserts the phase is still `flying` after the landing; I kept that (the comment now points at F005) and added `outcome` not null. F005 will have to change that assertion to `result`.
  - `placeBottle` leaves `lastThrow` null (no power, no source). F005's `throws` counter and F013's scripted rounds need to count placed bottles themselves.
  - The snap tool's `call:` action takes only numbers, booleans and strings, so a snap can't call `placeBottle`. If a later feature needs it, give `call:` JSON arguments.
  - A heredoc-fed `python3 -` command was denied automatically, so I made the same edits with the Edit tool. Nothing was lost.
- Next: F005 (result and next bottle): set `phase = 'result'` when `outcome` becomes non-null (check it after `judge.observe` in `Simulation.step`), count a throw and a success there, and start the 90-step delay from the step the outcome is set. Update the `phase` assertion in `tests/e2e/throw.spec.ts` and the `Phase` type and its comment in `simulation.ts`.

> [harness] session 8 · builder F004 · todo → needs_review · ok · verify passed · 1 commit(s) · 85 tool calls · 9m 21s · ~$1.63 API-equivalent

## Session 9 · reviewer · F004 Judge the landing: upright success or fail
- Verdict: pass
- Evidence:
  - `npm run verify` passed: format, typecheck, unit tests, build and all 16 e2e tests. The e2e tests include `outcome.spec.ts`: upright placed and stepped 150 frames gives success, a side placement gives fail.
  - Each unit criterion has its own test in `tests/unit/outcome.test.ts`: upright success at 1 s and not before; side, cap, offTable and offScreen; 2π counts as upright and an untouched bottle reports 0 turns; a 50%-water bottle tilted 10° on a corner tips back and succeeds; the 0.5 s timeout override; the outcome is never changed once set.
  - The judge (`src/core/outcome.ts`) only reads the pose, speeds and table contact. All its thresholds are in `tuning.ts`. Only one existing test changed: `throw.spec.ts` gained an extra assertion, so nothing was weakened.
  - My own probe was a temporary unit file, deleted afterwards:
    - 20 seeds × powers 0–100 in steps of 10 gave an outcome for every throw: 36 upright, 145 side, 17 offTable, 16 offScreen, 6 timeout.
    - I traced the timeouts. Each one was a bottle still bouncing or rolling until about 4.5 s, so the 1 s hold or the 0.5 s fail-rest couldn't finish before the limit. That matches the spec.
    - Other cases: upright 1 cm from the right edge succeeds; an upright bottle sliding at 0.8 m/s succeeds; an upright bottle at angle −4π succeeds; one slammed down at 30 m/s succeeds; after exactly 59 steps there is no outcome, and at 60 steps it is a success.
  - Snap at 1024×576 (seed 6): I threw at power 30 twice, waited 200 steps, called placeBottle mid-flight, then waited 200 more steps. The result was side, unchanged between the two states. The second throw and the placeBottle were ignored. I looked at the screenshot: the bottle lies on its side on the table. Pressing R then throwing at power 50 gave a new flight with outcome null. There were no console errors.
- Problems: none
- Notes for later:
  - Mid-power throws (about 70) fly above the top of the screen and land only around 4.5 s, so some upright landings become 'timeout' because the 1 s hold doesn't fit inside 5 s. F009/F010 tuning, or a timeout counted from first contact, may want to address this.
  - After the outcome is set, the phase stays 'flying' until F005 adds the result phase.

> [harness] session 9 · reviewer F004 · needs_review → done · ok · 1 commit(s) · 22 tool calls · 2m 53s · ~$0.72 API-equivalent

## Session 10 · builder · F005 Show the result, bring the next bottle, keep score
- Did:
  - Simulation, `src/core/simulation.ts`: `Phase` is now `'aiming' | 'flying' | 'result'`. The step in which the judge decides the outcome sets the phase to `result` and adds 1 to `score` for a success. Each later step counts toward the delay; after `stepsFor(resultDelaySeconds)` = 90 steps the judged bottle is destroyed and a new `Bottle` is created in the hand with `drawWaterLevel(rng, tuning)` (the seed's next value), the judge and outcome are cleared and the phase is `aiming`. `skip()` does the same at once and returns true only during `result`. Physics keeps running during `result`.
  - Snapshot gains `score` and `throws`. `throws` counts at release (`throwBottle` and `placeBottle` both), `score` counts at the outcome. `lastThrow` keeps describing the last real throw while the next bottle waits; `outcome` goes back to null with the new bottle.
  - Tuning: `resultDelaySeconds` 1.5. `stepsFor(seconds)` moved from `outcome.ts` to `src/core/constants.ts` so both modules share it. `Bottle` now keeps its world and has `destroy()`.
  - Hook: `window.__FLIPPER__.skip()` returns the new snapshot. `GameScene` and `bottleView` needed no change: the view already draws the snapshot's bottle and redraws the water when the level changes.
  - Docs: `docs/ARCHITECTURE.md` directory map, D13 and D14 rewritten, new D15 (next bottle is a fresh body, skip never changes the water sequence) and D16 (when `throws` and `score` count).
  - Tests that had to change because the thrown bottle is now replaced 90 steps after its outcome, none weakened: `tests/unit/throw.test.ts` (apex test stops at the outcome; the different-power test compares mid-flight at step 30, since later both runs hold the same next bottle), `tests/unit/outcome.test.ts` ("never changes an outcome" now sets a long `resultDelaySeconds` so the same 600-step checks still run), `tests/e2e/throw.spec.ts` and `tests/e2e/outcome.spec.ts` (read the landing at the outcome step with the new `stepUntilOutcome` helper in `tests/e2e/helpers.ts`; the "outcome never changes" test now checks it 89 steps later, still in `result`; the `throw.spec.ts` assertion that the phase is `flying` after landing is now `result`).
- Verified:
  - `npm run verify` was green before I started (16 e2e). At the end it passes: format, typecheck, 188 unit tests (14 files), build, 20 e2e tests.
  - Acceptance 1: `tests/unit/result.test.ts` "adds 1 for a success, nothing for a fail, and counts every throw" (success, fail, success, success, fail gives scores 1,1,2,3,3 and throws 1 to 5), plus a real throw and an offScreen loss.
  - Acceptance 2: "appears after 90 steps, and not before" (phase `result` after 89 steps, `aiming` after 90, with a bottle exactly at `HAND_X`/`HAND_Y`, angle 0 and zero speeds) and "has the next water level from the seed" (second value of `createRng(seed)` through `drawWaterLevel`). A further test checks six bottles in a row follow the seed's sequence, and "counts steps from the outcome" checks an upright and a side result both wait exactly 90 steps.
  - Acceptance 3: the `skip()` tests: during `result` (even in the very step the result starts) it brings the next bottle; while aiming and while flying (thrown and placed) the snapshot is identical afterwards; a second call does nothing and the next result still waits the full 90 steps.
  - Acceptance 4: "gives the same water levels, outcomes and score for the same seed and five powers" (powers 20, 45, 60, 75, 35 on seed 13, run twice; water equals the seed's sequence, score is the running count of successes), plus the same result whether the waits run out or are skipped.
  - Acceptance 5: `tests/e2e/result.spec.ts`: a real `throwBottle(50)` on seed 7, `stepUntilOutcome` then 89 frames (still `result`) then 1 more (phase `aiming`, outcome null, water equal to the seed's second value, bottle at the hand with zero speeds, score and throws as expected); three placed bottles (success, fail, success) give scores 1,1,2; `skip()`; and a real-time test where the clock itself brings the next bottle. Snaps: `--url /?seed=2 --do "pause,call:throwBottle;0,call:step;100,shot:result,call:step;90,shot:next"` (a power-0 drop stands upright, success): I looked at both PNGs. The result shot shows the 70%-water bottle standing on the table; the next shot shows a new bottle in the hand with a visibly lower fill (35%), nothing overlapping or cut off, no console errors.
- Status: F005 → needs_review
- Issues / follow-ups:
  - The e2e test for an upright placement used to step a fixed 150 frames. The outcome comes a little over 60 steps in, so the next bottle would arrive only a few steps after frame 150 and a shorter hold time would have made it see a null outcome. I changed it to `stepUntilOutcome` (it also asserts the outcome comes more than 60 and at most 150 steps after the placement, phase `result`, score 1) and renamed it "...judged a success once it stood still for a second". The assertion on the outcome is the same.
  - Nothing on screen shows the result yet (F007 adds the flash, message and score text) and nothing but the hook throws or skips (F006 adds Space and click). Until then a player can only watch the bottle replaced.
  - The 5 s timeout now sits right before a 1.5 s wait, so a slow throw can take over 6 s from release to the next bottle. The notes from F004 about the timeout versus slow settling still apply to F009/F010.
  - Heredoc and shell-loop commands (`python3 -`, a heredoc-written scratch `.ts`, a `for` loop with a variable) were denied automatically again; I used the Edit tool and single commands instead.
- Next: F006 (power bar and Space): the scene calls `sim.skip()` for Space or a click during `result` and `sim.throwBottle(power, 'keyboard')` while `aiming`, and should ignore `repeat` keydowns so holding Space through a result can't throw the next bottle. `Simulation.phase` is the thing to switch on.

> [harness] session 10 · builder F005 · todo → needs_review · ok · verify passed · 1 commit(s) · 102 tool calls · 10m 18s · ~$1.61 API-equivalent

## Session 11 · reviewer · F005 Show the result, bring the next bottle, keep score
- Verdict: pass
- Evidence:
  - `npm run verify` passed: format, typecheck, unit tests, build, 20 e2e tests (including the 4 in `result.spec.ts`).
  - Each unit criterion has a test in `tests/unit/result.test.ts`: success/fail scoring and throw counting; next bottle at exactly 90 steps (still `result` at 89) at the hand, still, with the seed's next water; skip() in result vs. aiming/flying; seed replay with five powers. The e2e criterion is covered by `result.spec.ts` (throwBottle(50), stepUntilOutcome + 89 + 1 frames).
  - Changed old tests (`throw.test.ts`, `outcome.test.ts`, `throw.spec.ts`, `outcome.spec.ts`) only adapt to the bottle now being replaced 90 steps after the outcome. The assertions are the same or stricter, and nothing is skipped or weakened.
  - Code: the rules live in `src/core/simulation.ts` and the delay in `tuning.ts`. The hook just calls `sim.skip()`, and I found no debug leftovers.
  - Snaps at 1024×576, seed 2: during flight, throwBottle(80) and skip() changed nothing. In `result` (upright, score 1), throwBottle(80) was ignored. Three skip() calls advanced exactly one bottle (water 0.7 → 0.35, score 1, throws 1, lastThrow unchanged). Throwing the new bottle at power 30 then skip() mid-flight gave a normal flight with throws 2. Letting the delay run out brought the 35% bottle into the hand. Pressing R reset tick, score, throws and lastThrow. I looked at the screenshots: the new bottle is in the hand with a lower fill and no leftover old bottle, and the second throw shows the bottle mid-air. No console errors.
- Problems: none
- Notes for later:
  - Nothing on screen shows the score or result yet; that's expected, since F007 adds it.
  - F006 should ignore key-repeat so holding Space through a result doesn't skip and then throw right away (the builder noted this too).
