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
