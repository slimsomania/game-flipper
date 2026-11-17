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

> [harness] session 11 · reviewer F005 · needs_review → done · ok · 1 commit(s) · 14 tool calls · 2m 1s · ~$0.51 API-equivalent

## Session 12 · builder · F006 Set power with the power bar and throw with Space
- Did:
  - Core, new `src/core/powerMeter.ts`: `PowerMeter` holds the bar's value (0 to 100) and all the input rules. `press(dir)` moves one tap step at once and starts a hold; `release(dir?)` ends it (no argument lets go of every key); `wheel(notches)` moves a step per notch; `set(p)` clamps and ignores NaN; `step()` advances a held key once per fixed step: nothing for `powerHoldDelaySeconds`, then a rate that rises in a straight line from `powerHoldRateStart` to `powerHoldRateMax` over `powerHoldRampSeconds`. With both keys down the newest wins and the older one takes over again from its delay. Pressing a key that is already held does nothing. It reads the tuning through a getter on every use.
  - Tuning, `src/core/tuning.ts`: `powerStart` 50, `powerTapStep` 1, `powerWheelStep` 2, `powerHoldDelaySeconds` 0.25, `powerHoldRateStart` 12 points/s, `powerHoldRateMax` 60, `powerHoldRampSeconds` 1.5. A 1 s hold gives about 19 points, and the whole bar takes about 2.5 s.
  - Simulation, `src/core/simulation.ts`: public `powerMeter`, stepped in `step()` in every phase; `power` in the snapshot; `throwOrSkip()` (Space): `aiming` throws with the bar's value and source `keyboard`, `result` calls `skip()`, `flying` does nothing. Throws and new bottles never touch the bar.
  - Scene: `src/game/gameInput.ts` (`bindGameInput`) forwards keydown/keyup of Up and Down, wheel events (one notch per event, deltaY < 0 raises), Space and `pointerdown` (calls `skip()`); keydowns with `event.repeat` are ignored; Up, Down and Space are captured so the browser doesn't act on them; held keys are released when the game window loses focus. `src/game/view/powerBarView.ts` draws the bar: track, fill from the bottom, quarter marks, a "POWER" caption and the percentage in 30 px bold. It sits 1.3 m left of the hand, level with the bottle's base. `GameScene` creates and updates it; colors are in `theme.ts`.
  - Hook: `window.__FLIPPER__.setPower(p)` returns the new snapshot. Docs: `docs/ARCHITECTURE.md` directory map, D17 and D18.
- Verified:
  - `npm run verify` was green before I started (188 unit, 20 e2e). At the end it passes: format, typecheck, 221 unit tests (16 files), build, 33 e2e tests.
  - Acceptance 1: `tests/unit/powerMeter.test.ts`: clamping by taps, wheel and long holds; tap and wheel step from tuning; "moves farther in 1 s than 10 taps do" (also downward); "moves faster after 1 s than at the start of the movement" (compares the gain of the first moving step with the gain of step 61); the rate never decreases and tops out at the maximum.
  - Acceptance 2: `tests/e2e/power.spec.ts`: taps on ArrowUp and ArrowDown, a 60-step hold (more than 10 points, and the second half-second gains more than the first), the mouse wheel up and down, and a real-time hold that stops on release.
  - Acceptance 3: "Space while aiming throws with the bar value" (three ArrowUp taps, then Space: `lastThrow.power` equals the power read just before), "Space while flying does nothing" (snapshot unchanged), and "Space" / "a click" "during the result brings the next bottle".
  - Acceptance 4: "auto-repeated Space keydowns are ignored": real Playwright repeats, with a page listener proving the flags were `[false, true, true]`. The first keydown throws; repeats during the result don't skip it; repeats after the next bottle arrives don't throw it; after `up` a new press throws. I removed the `repeat` check temporarily and this test failed (throws became 2), then restored it.
  - Acceptance 5: unit "starts at 50", "after the result delay runs out" and "after a skip"; e2e "the power starts at 50 and keeps its value when the next bottle appears" (72 survives the throw, the result and the next bottle, and the second throw uses it).
  - Acceptance 6: `npm run snap -- --url "/?seed=7" --do "pause,shot:p50,call:setPower;20,shot:p20,call:setPower;80,shot:p80"`, plus 0, 100 and 37 (Space throw, 25 steps). I looked at the PNGs: fills at 20% and 80% match their height, the "20%" / "80%" labels are large and readable, "100%" still fits, and the bar (x 128 to 172 px, y 250 to 470, label to y 515) clears the bottle (x 247 to 313) and the table (starts x 160, y 560). In the flight shot the bar stays at 37% and the bottle is far from it. A real-time snap with `down:ArrowUp,wait:1000,up:ArrowUp` went 50 → 69.8; 0.5 s of ArrowDown took it to 64.7. No console errors in any snap.
- Status: F006 → needs_review
- Issues / follow-ups:
  - Decisions I took where the spec was silent: the bar can be adjusted in every phase (so the player can set up the next throw during a result); a wheel event is one notch whatever its size (a trackpad that sends many small events will move the bar quickly); the displayed percentage is the rounded value while the real value can be fractional after a hold (so `lastThrow.power` may be 71.4 while the bar shows "71%"); the "R" restart creates a new simulation, so power goes back to 50.
  - The arrow-key repeat test also passes without the scene's repeat check, because `PowerMeter.press` ignores a key that is already held. That is deliberate double protection; the Space test is the one that proves the scene's check.
  - Any click now ends a result wait. When F011 adds grab-and-push, a `pointerdown` during `aiming` will start a grab, and `result` should keep calling `skip()`. The pointer being already down when the next bottle appears must not start a grab by itself.
  - E2E tests that send input must wait for Phaser to read it: use `expect.poll` for a change, and the new `settleInput(page)` helper before asserting that nothing changed. `recordKeydownRepeats` and `powerOf` are new helpers too.
  - `src/core/simulation.ts` is now about 300 lines. If F007 to F013 add more to it, split the result and round logic out.
  - As before, compound shell commands (`&&`, `;`) were denied automatically; I used single commands.
- Next: F007 (result flash, message and score text): read `outcome` and `score` from the snapshot in a new view under `src/game/view/`; keep the power bar's corner of the screen (x 110 to 190, y 215 to 515) free, and remember a result stays up for 90 steps unless the player presses Space or clicks.

> [harness] session 12 · builder F006 · todo → needs_review · ok · verify passed · 1 commit(s) · 94 tool calls · 10m 4s · ~$1.61 API-equivalent

## Session 13 · reviewer · F006 Set power with the power bar and throw with Space
- Verdict: pass
- Evidence:
  - `npm run verify`: the first run had one e2e failure ("Space while aiming throws with the bar value": the poll for power 53 after three ArrowUp taps timed out after 5 s). Two later runs passed (221 unit tests, 33 e2e). I couldn't reproduce the failure: `power.spec.ts` ran 8× per test with all 104 passing, and the 3 tap/throw tests ran 20× each serially (60/60).
  - A 15× run with 4 workers overloaded the machine. Every test failed the same way ("Tearing down context exceeded 30000ms"), including `setPower`, which sends no input, so it says nothing about the feature. The config uses 1 worker.
  - Unit: `powerMeter.test.ts` and `powerInput.test.ts` cover clamping, tap and wheel steps from tuning, 1 s hold > 10 taps, rate rising, repeat-press ignored, throwOrSkip by phase, power kept across bottles. E2E `power.spec.ts` covers every e2e criterion, using real `repeat: true` keydowns (recorded and asserted).
  - Snaps at 1024×576, seed 3: setPower 20 and 80 show the bar at matching heights with "20%" and "80%". The bar is left of the hand, level with the bottle, and well clear of the table and the bottle. Space threw at 80 (source keyboard), and the bar stayed at 80 in flight. After the next bottle appeared, down:Space threw it once (throws 2) and holding it did nothing more. Two ArrowDown taps gave 78, and holding ArrowUp for 200 steps stopped at exactly 100 ("100%" drawn). No console errors.
  - Code: the rules are in `src/core/powerMeter.ts` and their numbers are in tuning. `gameInput.ts` only forwards input and checks `event.repeat`. The test hook calls `powerMeter.set`. The test diff only adds tests. No debug leftovers.
- Problems: none
- Notes for later:
  - Watch for the timeout in "Space while aiming throws with the bar value" (3 fast `keyboard.press('ArrowUp')` on a paused game). Phaser's duplicate-event bailout (same code + timeStamp + type) or a slow frame under load are the likely causes. If it recurs, wait with `settleInput` between presses.
  - Power is fractional after a hold (e.g. 63.4). The label rounds it, and the throw uses the exact value. That's fine, but F007's HUD should use the same rounding.
  - The power keys work in every phase, including while flying. That's intended and documented.

> [harness] session 13 · reviewer F006 · needs_review → done · ok · 1 commit(s) · 33 tool calls · 32m 50s · ~$0.98 API-equivalent

## Session 14 · builder · F007 Flash the result and show the score
- Did:
  - Core, `src/core/simulation.ts`: the snapshot gains `resultSteps` (steps since the outcome: 0 in the step that decides it, counting up during `result`, null in every other phase). It is the counter the result delay already used, now readable, so the flash is a pure function of the snapshot.
  - View, `src/game/view/resultStyle.ts` (no Phaser): `resultStyle(outcome)` gives the message and colors ("Nailed it!" green, "Down!" red) and `flashAlpha(resultSteps)` the flash's opacity: 0.4 at the outcome step, a straight fade to 0 after 30 steps (`FLASH_SECONDS` 0.5, counted with `stepsFor`), 0 after. `resultView.ts` draws a full-screen rectangle (depth 10, so it tints the bottle, table and power bar but doesn't hide them) and an 88 px bold message at (640, 190) (depth 20) that is hidden, not emptied, when there is no outcome. `scoreView.ts` draws "Score: N" (40 px bold, top-left at 32, 24, depth 20 so the flash never tints it). `GameScene` creates both and updates them from the snapshot; result colors are in `theme.ts`.
  - Hook: `window.__FLIPPER__.texts()` (`src/debug/visibleTexts.ts`) returns the shown, non-empty `Text` strings of the active scenes in display order, looking inside containers and layers and skipping hidden, fully transparent or hidden-container text and invisible scenes. It lists every scene's text, so it currently returns "POWER", "50%", "Score: N" and, during a result, the message.
  - Docs: `docs/ARCHITECTURE.md` directory map, the core-state sketch and a new D19 (flash by `resultSteps`, message hidden rather than emptied, UI text tested through `texts()`).
  - Test helper: `visibleTexts(page)` in `tests/e2e/helpers.ts` waits two animation frames and then reads `texts()`.
- Verified:
  - `npm run verify` was green before I started (33 e2e). At the end it passes: format, typecheck, 234 unit tests (18 files), build, 43 e2e tests.
  - Acceptance 1: `tests/e2e/resultText.spec.ts` "a success shows "Nailed it!" and the new score" (`placeBottle` upright, `stepUntilOutcome`: `texts()` has 'Nailed it!' and 'Score: 1', no 'Down!') and "a fail shows "Down!" and leaves the score as it was" (a fail on a fresh game gives 'Score: 0'; a fail after a success keeps 'Score: 1'); plus "a real throw shows the message and the score that match its outcome".
  - Acceptance 2: "the success message / the fail message stays for the whole wait and goes with the next bottle" (message present 0, 40 and 89 steps after the outcome, gone and 'Score: …' still there at the 90th step), "skip() removes the success / fail message at once", "Space during a result removes the message, and the next result shows its own", and a real-time test. I removed `message.setVisible(false)` temporarily: 6 of these tests failed; then I restored it.
  - Acceptance 3 and 4 (snaps at 1280×720, no console errors), looked at the PNGs. Success: `--url "/?seed=2" --do "pause,call:throwBottle;0,call:step;95,shot:success-0,call:step;15,shot:success-15,call:step;25,shot:success-40"` (the outcome is at step 95, `resultSteps` 0): at 0 a green flash, dark green "Nailed it!" clearly readable, "Score: 1" top-left, the bottle and the table visible through the flash; at 15 about half the tint; at 40 no flash (plain background), message still there. Fail: `--url "/?seed=7" --do "pause,call:setWater;0.5,call:throwBottle;30,call:step;109,shot:fail-0,call:step;15,shot:fail-15,call:step;25,shot:fail-40"`: a red flash with dark red "Down!", "Score: 0", the bottle lying on its side visible; at 40 the flash is gone and "Down!" stays. `call:texts` in the same runs returned `["POWER","50%","Nailed it!","Score: 1"]` and `["POWER","50%","Down!","Score: 0"]`, and without the message 50 steps later, after the next bottle. A power-100 throw (flies off the top) and the next bottle: the score stays top-left, clear of everything.
  - Unit: `tests/unit/resultSteps.test.ts` (null while aiming and flying, 0 at the outcome step and +1 per step to 89, null at step 90 and after `skip()`, set exactly while the outcome is) and `tests/unit/resultStyle.test.ts` (messages and colors, green vs red, alpha 0.4 at step 0, a steady fade, 0 at 30 and 40 steps).
- Status: F007 → needs_review
- Issues / follow-ups:
  - The flash cannot be seen through `window.__FLIPPER__`: only the text is observable. Its opacity is a pure function (`flashAlpha`) of `resultSteps`, which is unit-tested, and the snaps show the pixels.
  - `texts()` reads what the scene has drawn, and the scene redraws once per frame. Right after `step()`, `skip()` or `placeBottle()` inside the page it still returns the old text. E2E tests should use `visibleTexts(page)` from `tests/e2e/helpers.ts` (it waits two frames) or `expect.poll`.
  - Layout decisions the spec left open: the score is top-left (top-right is kept free for the pause and mute buttons in F019 and F017); the message sits at y = 190, above the landed bottle and clear of the power bar caption (y about 230) and the table; F013 can stack "Throw 3 / 10" and the streak under the score. At the flash's peak the power bar's orange and the table's brown look olive (green flash) or brick (red flash): that is the tint, not a bug.
  - The message and the score use the same font and the dark text colors; the "Score: N" label is not animated. Nothing else changed in gameplay, and no existing test was edited.
  - `tests/unit/result.test.ts` is 380 lines, over the 300-line guideline; I put the new tests in new files rather than adding to it. A later cleanup could split it. `src/core/simulation.ts` is about 305 lines.
  - Compound shell commands and heredocs were denied automatically again (`python3 -` heredoc); I used the Edit tool.
- Next: F008 (flip windows) doesn't touch the UI. F013 (rounds) can add "Throw N / 10" and the streak next to `scoreView.ts` in the top-left corner, and should read `snapshot.throws`/`phase`; any new UI text is then testable with `visibleTexts(page)`.

> [harness] session 14 · builder F007 · todo → needs_review · ok · verify passed · 1 commit(s) · 73 tool calls · 10m 17s · ~$1.27 API-equivalent

## Session 15 · reviewer · F007 Flash the result and show the score
- Verdict: pass
- Evidence:
  - `npm run verify`: green on the first run (format, typecheck, unit, build, 43 e2e including all 10 in `resultText.spec.ts`).
  - Criteria 1–2: I read `resultText.spec.ts`. It covers success → 'Nailed it!' + 'Score: 1', fail → 'Down!' with the score unchanged (0, and 1 after a success), the message still there at 40 and 89 steps and gone at step 90, and gone after skip() and Space. It also has a real-time variant.
  - Criteria 3–4: my own snaps at 1024×576. Success (seed 2, throwBottle 0, step 95, resultSteps 0): green flash, dark green "Nailed it!" readable, "Score: 1" top-left, bottle and table visible through the tint. 40 steps later the flash is gone and the message is still there. Fail (seed 7, setWater 0.5, throwBottle 30, step 109): red flash, dark red "Down!", "Score: 0", bottle on its side visible. At +40 the flash is gone and "Down!" stays. `call:texts` returned `["POWER","50%","Nailed it!","Score: 1"]` and `[…,"Down!","Score: 0"]`. No console errors.
  - Edge cases: pressing R (restart) during a success result clears both the flash and the message, and the score goes back to 0. Space during a fail result also clears them at once. Both checked with screenshots and texts().
  - Code: `resultSteps` is a read-only snapshot field in core and has unit tests. The flash and message logic (`resultStyle.ts`) is Phaser-free and unit-tested. `texts()` is a thin read of the scene's Text objects. The test diff only adds tests (no lines removed). No debug leftovers.
- Problems: none
- Notes for later:
  - The flash timing constants (`FLASH_SECONDS`, `FLASH_PEAK_ALPHA`) live in `src/game/view/resultStyle.ts`, not the core tuning module. They are presentation, not gameplay, so this is acceptable, but the M5 polish work may want them next to the other tunables.
  - `texts()` lags one frame behind `step()`/`skip()`, as the builder documented. Tests must use `visibleTexts(page)` or poll.
  - `tests/unit/result.test.ts` (380 lines) and `src/core/simulation.ts` (~305) are past the 300-line guideline. This is a cleanup candidate.

> [harness] session 15 · reviewer F007 · needs_review → done · ok · 1 commit(s) · 27 tool calls · 3m 13s · ~$0.63 API-equivalent

## Session 16 · builder · F008 Measure flip windows with power sweeps
- Did:
  - Core, new `src/core/flipWindow.ts`: `sweepPowers(water, tuning = {}, powers = 0..100)` makes a fresh `Simulation` (seed 1) per power, sets the water with `setWater`, throws, and steps only while the phase is `flying`, so each run stops at the step that decides its outcome. It returns `{ power, steps, result, reason, rotation, turns }` per power (the `Outcome` plus the power and the steps taken). A throw with no outcome after the timeout plus 2 steps is an error, not a hang. `findWindows(results)` is pure: it sorts by power and groups neighboring results that are successes with the same `turns` into `{ turns, low, high, center, width }` (`width` is `high - low`, so one power gives 0), lowest first; a fail or a change of turns ends a window. `widestWindow(windows, turns = 1)` picks the single-flip window (the first of equal widths, or null).
  - Script, new `scripts/flip-windows.ts`: prints a header and one row per water level, 10% to 90% in steps of 10, with the widest single-flip window's low, high, center and width, or `none`, and the run time.
  - Docs: `docs/ARCHITECTURE.md` directory map (module and script) and D20 (what a window is, why `high - low`).
  - Tests, all new: `tests/unit/findWindows.test.ts` (12 tests, with `Simulation` mocked to throw so any physics would fail them), `tests/unit/sweepPowers.test.ts` (9), `tests/unit/flipWindowsScript.test.ts` (runs the script, 1).
- Verified:
  - `npm run verify` was green before I started (the harness ran it after session 14). At the end it passes: format, typecheck, 258 unit tests (21 files), build, 43 e2e tests.
  - Acceptance 1: `findWindows` tests cover several windows with different turns, two windows with the same turns split by a fail, a change of turns between neighbors, a window touching 0, a window touching 100, a window over the whole range, a window of one power, an empty list, all-fail lists, unsorted and frozen input, and `widestWindow`. The file mocks `Simulation` so building one throws: it would fail if `findWindows` ran any physics.
  - Acceptance 2, first half: "is deterministic: two sweeps give equal results" (the default sweep and one with a tuning override). Also: each sweep result equals what the game gives when played by hand, and `steps` equals the number of steps the game needs to reach `result`, so runs stop when the outcome is decided.
  - Acceptance 3: `npx tsx scripts/flip-windows.ts` prints 9 rows in about 1.2 s (2.8 s wall clock with the Node start); `tests/unit/flipWindowsScript.test.ts` runs it and checks the header, the nine labels 10% to 90%, that each row is a window or `none` with center and width consistent, and a time under 60 s.
  - Acceptance 4: the baseline table is below.
  - No snap: nothing on screen changed (no `src/game` or hook change).
- **Not met: "the throw at power 0 fails".** At power 0 the bottle is only released from the hand, falls 1 m and lands upright, so it is a success with 0 turns (the sweep at 10%, 50% and 90% all give `success`, `upright`, turns 0, rotation about 0). F005's snap showed the same. No tuning can change this: with zero speed and zero spin the bottle lands on its base. Making it fail needs a game rule (for example success requires at least one turn), which is a design decision outside this feature and not mine to make. I did not write a test that asserts the opposite of the criterion. `sweepPowers.test.ts` has "does not flip the bottle at power 0: it only drops" (turns 0, rotation under 0.1 rad, never in a single-flip window), which holds under either way of resolving this. I set F008 to `blocked` with the options in its notes rather than `needs_review`.
- Status: F008 → blocked (code, tests and docs are committed and green; one acceptance line needs a human decision)
- Issues / follow-ups:
  - Baseline for F009, default tuning, power 0 to 100 in steps of 1 (single-flip window = the widest run of powers that succeed with turns 1):

    ```
     water   low  high  center  width
       10%  none
       20%    44    44      44      0
       30%  none
       40%    48    48      48      0
       50%    51    51      51      0
       60%    58    59    58.5      1
       70%    57    57      57      0
       80%    65    66    65.5      1
       90%    65    66    65.5      1
    ```

    So the defaults have no real single-flip window yet: the wins at turns 1 are one or two lucky powers each (the bottle happens to land upright), which is what F009 has to fix. A coarse sweep (every 5th power, so these are rough): at 50% water powers 15 to 35 land on the side with 0 turns, 40 to 50 on the side with 1 turn, 55 is the one upright, then 2 turns from about 70 and 3 from about 90; at 90% water 65 and 70 are upright; at 10% water powers 25 to 45 end on the side with 1 turn and 60 and up fall off the table with 3 turns. The center does rise with the water, about 44 at 20% and 65 at 90% (the 10% and 30% rows are `none`), a ratio of about 1.5.
  - A warning for F009, from my own back-of-envelope reasoning and one measurement, not a finding: at 50% water the rounded turns go 0 → 1 near power 37, 1 → 2 near 67 and 2 → 3 near 87, so one turn spans roughly 20 to 30 power points and a landing within 15° of upright (±1/24 of a turn, about ±0.04) covers about 2 to 3 points, which matches the widths of 0 to 1 above. If rotation grows with power squared (spin and flight time both grow with power), the width is about 0.04 × the ideal power, so 12 to 28 points would need landings far outside ±15° to still succeed by tipping back, or a much flatter spin curve. Measure that early with `sweepPowers` before choosing levers.
  - Power 0 (and up to about 5 to 15, depending on the water) wins outright as a no-flip drop. Until the human decides (see above) the player can win by throwing at power 0 to 5, and F009's window tests are not affected because they look at turns 1.
  - `src/core/flipWindow.ts` takes `Partial<Tuning>`, like `SimulationOptions`, not a full tuning. F009 can pass `DEFAULT_TUNING` or overrides. A sweep of one water level takes about 0.13 s, so F009's five levels fit its 15 s budget by a wide margin.
  - Heredocs were not used; I wrote files with the Edit and Write tools.
- Next: a human should resolve the power-0 question (amend the F008 criterion to "turns 0", or ask for a rule that a throw with no flip can't succeed) and then set F008 to `needs_review` or `todo` with `attempts` 0. F009 starts from the table above and should use `sweepPowers` / `findWindows` / `widestWindow`; check first whether a 12 to 28 point window is reachable at all (see the warning above).

> [harness] session 16 · builder F008 · todo → blocked · ok · verify passed · 1 commit(s) · 43 tool calls · 6m 9s · ~$0.93 API-equivalent

## Session 17 · builder · F011 Convert a mouse push into power
- Did:
  - Core, new `src/core/push.ts`: `pushPower(samples, tuning = DEFAULT_TUNING)` takes `{t, y}` samples (seconds, logical game pixels, y down, oldest first) and returns 0 to 100. The newest sample is the release, so the same call gives the live value during a drag. It draws the pointer's path through the samples (straight lines between samples less than one 60 Hz frame apart; over a longer gap the pointer stays put and moves during the last frame before the next sample, because a mouse reports only when it moves), cuts it to the last `pushWindowSeconds` before the newest sample, and measures (a) the net upward distance over the window and (b) the fastest upward speed over any `pushSpeedSpanSeconds` inside it (21 probes). Each is a fraction (0 to 1) of its full-power value, and the two are mixed by their weights. Net downward or no movement, fewer than 2 samples, non-finite samples, a zero window or a zero speed span all give 0, never NaN.
  - Tuning, `src/core/tuning.ts`: `pushWindowSeconds` 0.15, `pushSpeedSpanSeconds` 0.05, `pushDistanceWeight` 1, `pushSpeedWeight` 1, `pushFullDistance` 300 px, `pushFullSpeed` 2000 px/s. 300 px in 150 ms gives exactly 100; 40 px in 150 ms gives 13.3.
  - Docs: `docs/ARCHITECTURE.md` directory map (the module) and D21 (path model, peak speed, pause handling, logical pixels).
  - Tests, new `tests/unit/push.test.ts` (28 tests). No existing test was edited.
- Verified:
  - `npm run verify` was green before I started (258 unit, 43 e2e). At the end it passes: format, typecheck, 286 unit tests (22 files), build, 43 e2e tests.
  - Criterion 1: "gives more power for more upward distance in the last 150 ms" (20 to 250 px, strictly rising), "gives more power when the same distance is covered in less time" (100 px in 150, 100 and 50 ms), and "counts a short drag that is quicker, and a push that is quick and then stops".
  - Criterion 2: "ignores motion earlier than the window" (paths that wander before the window, at 60 and 240 Hz equal to 9 digits), "gives equal power for hand-made drags that differ only before the window" (gaps around the window start), "gives 0 when all the upward motion was before the window", "gives 0 when the pointer came back down over the window"; "gives 0 for downward motion, a still pointer, one sample and no samples"; "clamps to 0-100" (5000 px gives exactly 100) and a 300-run random test (seeded, with backward and repeated times and jumps) that is always finite and within 0 to 100.
  - Criterion 3: six motions (steady, short, eased flick, gentle push, a flick that stops early, accelerating) at 60, 125, 144 and 240 Hz against 1000 Hz, all within 2 points; I printed the real differences and the largest was 0.37 points. Also a mouse with uneven sample times.
  - Criterion 4: "is reachable with an ordinary mouse" at 60, 125, 240 and 1000 Hz (300 px in 150 ms at least 90, 40 px under 30), and "rises steadily from a nudge to a hard flick" (10, 40, 80 ... 300 px strictly rising; 10 px under 10).
  - Also tested: the weights and the full-power values from the tuning, the window length from the tuning, the live value (growing prefixes of a drag never go down and the last equals the full call), a pointer that stopped (a sample at the release time makes it 0), a flick after a 2 s press-and-hold counts the same as after a short pause, bad samples ignored, the input is not changed.
  - No e2e test and no snap: `pushPower` is not connected to the scene or `window.__FLIPPER__` yet, so nothing is player-visible. The player-visible e2e tests and the snap are F012's.
- Status: F011 → needs_review
- Issues / follow-ups:
  - Decisions where the criteria left room: speed is the fastest 50 ms stretch, not the average over 150 ms, because with a fixed window the average is just the distance again, and "the same distance in less time" must also hold when the move is made quickly and then stops. A press and one tiny first move event reads as at most `distance/50 ms`, so the first jittery events of a drag can't spike the live value. "Equal power for drags that differ only before the window" is exact when a sample lies on the window start (any rate that fits 150 ms in whole frames: 60, 120, 240 Hz); at other rates the path through the window start leans on the one sample just before it (a few ms away, under 0.5 points in my test). A pointer position that is truly different at the window start is a different push, so that is intended.
  - For F012: append a sample `{t: now, y: pointerY}` at the release (and on every frame during the drag for the live bar), otherwise a pointer that stopped before the release looks like it is still moving. Use the same clock for every sample (seconds, for example `event.timeStamp / 1000` or the scene's time) and convert the pointer to logical game pixels first (Phaser's `pointer.y` in a scaled canvas is already in game coordinates; check that with a snap at a non-1280 window size). Keep the samples of one drag only, and trim old ones (anything more than about 0.2 s before the newest, except the one just before) if you don't want the list to grow. The grab itself must not depend on the push; a release with power below 1 cancels, as F012's notes say.
  - `tests/unit/push.test.ts` is 317 lines, a little over the 300-line guideline (like `result.test.ts`); a cleanup could move the sampling-rate and default-tuning groups to their own file.
  - Compound shell commands, process substitution and a `node -` heredoc were denied automatically; I used the Edit and Write tools, and a single throwaway script (deleted) to print the sampling differences.
- Next: F012 (grab the bottle and push with the mouse) can call `pushPower(samples, sim tuning)` straight away; start by deciding where the samples live (a small buffer in the scene or in core) and note that `bindGameInput` currently calls `skip()` on every `pointerdown`, which has to become "grab while aiming, skip during a result".

> [harness] session 17 · builder F011 · todo → needs_review · ok · verify passed · 1 commit(s) · 49 tool calls · 10m 0s · ~$1.19 API-equivalent

## Session 18 · reviewer · F011 Convert a mouse push into power
- Verdict: pass
- Evidence: `npm run verify` green (format, typecheck, 287 unit tests in 22 files, build, 43 e2e). Read `src/core/push.ts`, the tuning fields and `tests/unit/push.test.ts`: criterion 1 (more distance and less time give more power), criterion 2 (motion before the window ignored, exact at 60/240 Hz; downward/still/one/no samples give 0; clamped to 0-100 plus a seeded random fuzz), criterion 3 (60/125/144/240 Hz vs 1000 Hz within 2 points, 60 vs 240 directly) and criterion 4 (300 px in 150 ms gives 100, 40 px gives 13.3, at 60/125/240/1000 Hz) are each covered by a test that asserts the criterion itself. My own throwaway probe file (deleted afterwards): 60 vs 240 Hz with sample phases and release times that are off the frame grid (release at 1.0037 and 1.0111 s, phases up to 13 ms), five motions from a 40 px nudge to a 300 px flick: worst gap 0.39 points. Duplicate timestamps plus an up-down-up path inside the window give a finite 81.7. A press followed 1 ms later by a 1 px or 5 px jitter event gives 0.7 and 3.3, so the live bar doesn't spike at the start of a drag. 30 Hz sampling matched 240 Hz (83.3 both) for a 200 px / 120 ms push. `git diff 940bc3b4..HEAD -- tests` only adds tests (push.test.ts and a harness config test from the human's harness commit). No snap: nothing is wired to the scene yet, so there is nothing player-visible to look at (F012).
- Problems: none
- Notes for later:
  - `MAX_BRIDGE_SECONDS` and `SPEED_PROBES` in push.ts are fixed constants, not tuning. That's fine because they're sampling-model details rather than gameplay numbers, but if F012 sees odd values on slow frame rates, `MAX_BRIDGE_SECONDS` is the first place to look.
  - `tests/unit/push.test.ts` is 317 lines, a little over the ~300 guideline; it could be split later.
  - F012 must append a sample at the release time (and each frame for the live bar), as the builder notes say, or a pointer that stopped before the release still reads as moving.

> [harness] session 18 · reviewer F011 · needs_review → done · ok · 1 commit(s) · 12 tool calls · 3m 17s · ~$0.56 API-equivalent

## Session 19 · maintainer
- Did: (tests and docs only; no file in `src/` changed, so behavior is untouched)
  - Removed copy-pasted test helpers. `UPRIGHT` was defined in 5 test files (`SIDE` in 4), `run` in 5, `runToOutcome` in 4 (with two different default limits, 400 and 600), `RESULT_STEPS` in 3, `waterSequence` in 3, and a literal copy of the upright pose sat inline in `powerInput.test.ts`. They now live in two new files: `tests/shared.ts` (poses and `waterSequence`; imports neither Vitest nor Playwright, so the e2e specs `result.spec.ts` and `resultText.spec.ts` use it too) and `tests/unit/helpers.ts` (`run`, `runToOutcome`, `judged`, `expectHeld`, `RESULT_STEPS`; Vitest never collects it because it is not `*.test.ts`). The single `runToOutcome` defaults to 600 steps; every other caller used 400 and none read the return value or depended on hitting the limit (the judge's timeout decides every throw by step 300). Eight unit files and two e2e specs now import them.
  - Split `tests/unit/result.test.ts` (380 lines, over the guideline) by moving its two groups about how the wait ends, "the result delay" and "skip()", unchanged into the new `tests/unit/resultWait.test.ts` (100 lines). `result.test.ts` is now 233 lines.
  - `docs/ARCHITECTURE.md`: the directory map now lists `src/main.ts`, `src/game/urlParams.ts` (both were missing), `tests/shared.ts` and `tests/unit/helpers.ts`; the `flipWindow.ts` row moved up next to the other core modules (it sat after the debug files); D18 said F011 would give a click on the bottle its second meaning, but that is F012 (F011 only added `pushPower`), so I corrected it.
  - Looked and found nothing to do: no game rules in `src/game` (`gameInput.ts`, the views and the hooks only forward or draw), `src/core` has no module without tests, no fixed sleeps in `tests/` (the `waitForTimeout` calls are all in the `scripts/snap.ts` screenshot tool, where they are frame waits), and every unused-looking export is used by a test or a script.
- Verified:
  - `npm run verify` was green before I started (287 unit in 22 files, 43 e2e). After the changes it passes again: format check, typecheck, 287 unit tests in 23 files (the same 287: none added, removed or edited; only the file they are in changed for the 7 moved from `result.test.ts`), build, 43 e2e tests. So the e2e suite ran twice, once before and once after, with no flake.
  - `npm run format` and `npm run typecheck` (it caught a now-unused `SimSnapshot` import in `outcome.test.ts`, which I removed).
  - Diff size: about 450 changed lines, mostly the moved tests and removed duplicates (33 insertions and 255 deletions in tracked files, 166 lines in new files).
- Debt left:
  - Still over ~300 lines: `tests/unit/outcome.test.ts` (568: the synthetic-`LandingJudge` groups and the `Simulation` groups could be two files), `tests/unit/throw.test.ts` (354: `throwImpulse` vs `Simulation.throwBottle`) and `tests/unit/push.test.ts` (317: "sampling rate" and "default tuning" could move out, but they need that file's `sampled`/`push` helpers, so those would have to be shared first). Each is a move of 150 to 300 lines, so I kept them out of this diff.
  - `src/core/simulation.ts` is 296 lines. F013 (rounds) will push it over 300; a good cut is then to move the result and score bookkeeping, or `landingSample`/`snapshotBody` (they read the same body fields twice), into their own module.
  - `HALF_WIDTH = BOTTLE_BODY_WIDTH / 2` is still defined separately in `outcome.test.ts` and `tests/e2e/outcome.spec.ts`; `outcome.spec.ts` also builds its poses inline.
  - Carried over from earlier notes: F008 is blocked on the power-0 question (a human has to decide); `bindGameInput` still calls `skip()` on every `pointerdown`, which F012 has to change; the result-flash timing constants live in `src/game/view/resultStyle.ts`, not in the tuning module.
  - Compound shell commands (`cmd1; cmd2`, `&&` with redirection) and reading files outside the repo were denied automatically again; I ran each command separately and used `sed -i` only to delete the moved line ranges.
