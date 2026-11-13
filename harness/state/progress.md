# Flipper: agent session log

Append-only. Each agent session adds an entry at the end, and the harness adds a `[harness]` line after every session with what it observed and corrected. Start each session by reading the tail: `tail -n 120 harness/state/progress.md`.

## Session 0 · setup (human + Claude Code)
- Did: Scaffolded the project: Vite + TypeScript + Phaser 3.90 + planck.js; Vitest unit tests, Playwright e2e tests, the `npm run snap` screenshot tool, `window.__FLIPPER__` test hooks, and this harness. The game scene is a placeholder: a bottle drops onto a table and settles.
- Verified: `npm run verify` passes; `npm run snap` shows the menu and the placeholder scene rendering with WebGL.
- Issues / follow-ups: On Windows, Vitest must run through `npm test` (it uses `scripts/canonical-cwd.mjs` to avoid a drive-letter casing bug).
- Next: The planner turns `docs/GAME_DESIGN.md` into `harness/state/feature_list.json`.
