---
status: ready
---

<!--
  This is the game design document for Flipper. You own it: agents read it but never edit it.
  The planner agent turns it into harness/state/feature_list.json.

  When it describes the game well enough to plan from, change "status: draft" above to
  "status: ready". The harness won't plan from a draft.

  Plain language and bullet points are fine. Anything you leave out, the agents decide using the
  simplest reasonable option, and the planner lists those decisions for you to check.
-->

# Flipper: game design

## 1. Concept

Flipper is a skill game about throwing an object so it flips in the air and lands standing upright. It mimics the game kids play with a plastic bottle partly filled with water: hold the bottle by the top, toss it so it spins, and try to land it exactly on its bottom. If it lands on any other side, the throw fails.

The fun is in the guess: every bottle holds a different amount of water, so the player has to judge how hard to throw it. A quick, easy-to-learn "one more try" game for anyone on a PC browser.

## 2. Core loop

One throw, start to finish:

1. A bottle with a random amount of water appears in the "hand" position at the edge of the table. The water level is visible in the bottle. That is the only clue the player gets about its weight: there is no number and no power hint.
2. The player decides how hard to throw and sets the **power** (see Controls). Too little power: the bottle doesn't turn far enough and lands on its side. Too much: it keeps spinning, does one or two extra turns, and lands depending on how far through the last turn it is.
3. The player throws (Space, or releasing the mouse). The bottle flies up, spins, falls and lands on the table.
4. The physics decides the outcome. The game waits until the bottle comes to rest, or falls off the table.
5. The result is shown and the next bottle appears.

**Throw inputs.** Both inputs exist from the first version, and the player can use either at any time:

- **Power meter (keyboard).** A power bar is always on screen. The player raises or lowers it with Up/Down (hold to move faster) or the mouse wheel, then presses Space to throw. This is the player's guess made visible.
- **Mouse push.** The player presses the left button on the bottle to grab it and, while holding, moves the mouse upward as if pushing the bottle with a hand. On release, the game measures the push (how far and how fast the mouse moved in the last moments) and converts it to power. A harder push means a harder throw. The power bar shows the live value while dragging.

In both cases the result is the same: one number, **power**, from 0 to 100%. The physics treats them identically, so the rest of the game doesn't care which input was used.

**Direction.** The throw goes mostly straight up with a small, fixed forward drift so the bottle lands on the table in front of the hand. The player controls only power, not angle. Keeping it to one variable keeps the guess clear.

**Success.** The bottle comes to rest standing on its base, within 15° of upright, for at least 1 second. If it lands at a small angle, the physics may tip it back onto its base, so a landing slightly off vertical can still succeed. The bottle isn't snapped upright by a rule: physics decides.

**Fail.** The bottle comes to rest on its side or on its cap, falls off the table, or leaves the screen. If it hasn't settled after 5 seconds, it counts as a fail so the game can't stall.

**After the result.**

- Success: a green flash and a short message ("Nailed it!"), and the score goes up.
- Fail: a red flash and a short message ("Down!"), and the score doesn't change.
- After about 1.5 seconds the next bottle appears automatically. Space or click skips the wait.

## 3. The object and its physics

- For now there is one object: a plastic water bottle. Its shape and size are always the same.
- The only thing that changes between throws is the **amount of water**, chosen at random each throw (from nearly empty to nearly full, in small steps, using the seeded random generator so tests are repeatable).
- Water is simulated as extra mass that sits low in the bottle. More water means a heavier bottle and a center of mass closer to the bottom. It does not slosh in the first version: the water level is drawn, but the water moves with the bottle as one solid body.
- A heavier bottle gets less speed and less spin from the same power, so the "right" power is different for every bottle. The player must learn this from the visible water level alone.
- For each bottle there is a window of power that gives a clean single flip. Higher power windows give double flips and so on. Starting values (best guess, to be tuned by playtesting): the single-flip window is about ±10% power around the ideal; the ideal power rises smoothly and noticeably from an empty to a full bottle (a full bottle needs roughly 1.5 to 2 times the power of an empty one); and the starting target is that an attentive new player lands about 3 of 10 and a practiced player 6 to 8 of 10.
- Water sloshing is wanted, but not in the first version (see M6): first it is one solid mass, then it becomes a real moving mass inside the bottle.
- All tuning numbers (throw strength, spin, window width, tolerance angle, friction, bounciness) live in one config module so they are easy to adjust.

## 4. Surfaces, levels and challenges

- One flat table, wide enough that a reasonable throw lands on it. Nothing else on screen except a plain background.
- No levels and no special challenge rules for now. The variety comes from the random water level.
- Later ideas, not now: narrower tables, shelves, moving platforms, wind, landing on a target, a double-flip challenge.

## 5. Scoring and progression

- A **round** is 10 throws. Each success scores 1 point, so a round scores 0 to 10. A fail scores nothing and does not end the round.
- A streak counter is shown during play (consecutive successes) but has no effect on points yet.
- The **best round score** is saved in the browser (local storage) and shown on the title screen and the round summary. Settings (mute) are saved too.
- Later ideas, not now: two-player and three-player turn-taking modes, streak bonuses, extra points for double flips, daily challenge.

## 6. Screens and UI

Screens, in order: **Title → Play → Round summary → Play again or Title**. Pause is an overlay on Play.

- **Title:** game name, a Play button, the best score, a mute toggle, and a one-line hint about the controls.
- **Play:** the table, the bottle with its visible water level, the power bar, the throw number ("Throw 3 / 10"), the current score, the streak, and the result flash and message after each throw.
- **Round summary:** score out of 10, the best score (with a "New best!" note if beaten), a Play again button and a Title button.
- **Pause overlay:** Resume and Quit to title.

## 7. Controls

PC browser only, mouse and keyboard.

| Action | Mouse | Keyboard |
| --- | --- | --- |
| Set power | Hold left button on the bottle and push the mouse upward; or mouse wheel to adjust the bar | Up / Down (hold to repeat) |
| Throw | Release the left button after a push | Space |
| Skip the wait after a result | Click | Space |
| Restart the round | Restart button on the pause overlay | R |
| Pause | Pause button in the corner | Esc or P |
| Mute | Speaker button | M |

## 8. Art direction

- Flat and minimal: soft solid colors, no outlines or textures. A calm light background, a wooden-brown table, a translucent blue bottle with a lighter cap and a blue water fill.
- Result colors: green for success, red for fail. They should also be told apart by the message text, not by color alone.
- Everything is drawn in code (shapes and generated textures) as placeholders. Real art can replace it later.

## 9. Audio

- Sound effects only, generated in code with the browser's audio API, so there are no audio files to license: a short whoosh on throw, a knock on landing, a happy chime on success, a low thud on fail.
- No music for now. A mute button is available and the choice is remembered.
- Sound starts only after the first click or key press (browsers require this).

## 10. Platforms and technical targets

- Browser game on desktop (mouse and keyboard). No touch or phone support for now.
- Latest Chrome, Edge and Firefox. Chrome is the main test target.
- Performance target: a steady 60 fps on an ordinary laptop.
- The logical canvas is **1280×720 landscape**, scaled to fit the window. The scaffold still has the old 720×1280 portrait values (`GAME_WIDTH` and `GAME_HEIGHT` in `src/core/constants.ts`, `docs/ARCHITECTURE.md`, the Playwright viewport in `playwright.config.ts`); the first feature must switch them over. We can change the orientation again later.
- Later: itch.io or a hosted page, touch support, installable web app.

## 11. Milestones

- **M1, first playable:** one bottle, a table, physics with water mass, the power bar and Space to throw, success and fail detection with result colors, an instant next throw, and a simple score counter. No title screen yet.
- **M2, mouse push:** grab and push with the mouse, converted to the same power value. Throw and power values are visible to tests.
- **M3, rounds and best score:** 10-throw rounds, round summary, best score saved in the browser, streak counter.
- **M4, screens and audio:** title screen, pause overlay, generated sound effects, mute toggle.
- **M5, polish and tuning:** tune difficulty so a good player can reach 6 to 8 out of 10, camera shake and small effects, bug fixes.
- **M6, sloshing and replay:** water that moves inside the bottle and affects the flip, and a short slow-motion replay of the landing after each throw (skippable).
- Later (not planned yet): two- and three-player modes, more objects, more surfaces.

## 12. Out of scope

- Touch and phone support.
- Two-player and three-player modes (planned for later, but build nothing for them now).
- Objects other than the bottle, and surfaces other than the single table.
- Levels, wind, targets, time limits, online leaderboards, accounts.
- Music.
- Sloshing water and the replay are wanted, but only from M6. Don't build them before then.

## 13. Open questions

Decided:

- **Orientation:** landscape 1280×720 for the desktop version; can be changed later.
- **Hints:** none beyond the visible water level. A practice mode with a marked power window could be a later idea.
- **Round length:** 10 throws.
- **Mouse push mapping:** a mix of drag distance and drag speed, measured over the last 150 ms before release.
- **Sloshing and replay:** wanted, in M6.

Decided after the first plan (2026-11-16), answering the planner's open questions:

- **Single flips first, no double-flip windows required.** The goal is a clean single flip. Too much power must over-rotate (it may land upright by luck, but nothing aims for that). Reachable double-flip windows are not required in M1 to M5. They come back with the later "double-flip challenge" idea, and the single-flip window wins if the two ever conflict.
- **Tests lock targets, not tuning values.** Calibration and difficulty tests check the design's targets (window width, the full-to-empty power ratio, success rates), never specific power or tuning values. Retuning inside the targets needs no test change. When the human changes a target on purpose, they change it in section 3 first; agents then update the matching test ranges to the new target and say so in the progress log. That counts as following the design, not weakening a test.
- **No landing indicator.** The player never sees where the bottle will land: no marker, no trajectory preview. The fixed forward drift is tuned so every throw in a bottle's flip window lands on the table, around its middle. This keeps the only guess the power.
- **Water range:** 10% to 90% in 5% steps, as the plan assumes. Tunable.
- **Browsers:** automated tests run in Chromium only, which also covers Edge (same engine). The human checks Firefox by hand at milestone stops. Revisit adding Playwright's Firefox at M7.

Still open, to be settled by playtesting after M1:

1. **Difficulty numbers.** The window width, the weight effect and the score targets in section 3 are best guesses.
2. **Streak rewards.** The streak counter has no effect on points yet.
