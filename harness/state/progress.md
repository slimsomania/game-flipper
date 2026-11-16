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
