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

The fun is in the guess: every bottle holds a different amount of water, so the player has to judge how hard to throw it. A quick, easy-to-learn "one more try" game for anyone in a browser, on a PC or a phone (phones from M7).

## 2. Core loop

One throw, start to finish:

1. A bottle with a random amount of water appears in the "hand" position at the edge of the table. The water level is visible in the bottle. That is the only clue the player gets about its weight: there is no number and no power hint.
2. The player decides how hard to throw and sets the **power** (see Controls). Too little power: the bottle doesn't turn far enough and lands on its side. More power gives more turns: a double flip scores 2 points and a triple 3, but their windows are narrower, so aiming higher is a risk. Between windows, the bottle lands depending on how far through its last turn it is.
3. The player throws (Space, or releasing the mouse). The bottle flies up, spins, falls and lands on the table.
4. The physics decides the outcome. The game waits until the bottle comes to rest, or falls off the table.
5. The result is shown and the next bottle appears.

**Throw inputs.** Both inputs exist from the first version, and the player can use either at any time:

- **Power meter (keyboard).** A power bar is always on screen. The player raises or lowers it with Up/Down (hold to move faster) or the mouse wheel, then presses Space to throw. This is the player's guess made visible.
- **Mouse push.** The player presses the left button on the bottle to grab it and, while holding, moves the mouse upward as if pushing the bottle with a hand. On release, the game measures the push (how far and how fast the mouse moved in the last moments) and converts it to power. A harder push means a harder throw. The power bar shows the live value while dragging.

On a phone (from M7), the push is done with a finger on the bottle instead of the mouse (see section 7).

In every case the result is the same: one number, **power**, from 0 to 100%. The physics treats them identically, so the rest of the game doesn't care which input was used.

**Direction.** The throw goes mostly straight up with a small, fixed forward drift so the bottle lands on the table in front of the hand. The player controls only power, not angle. Keeping it to one variable keeps the guess clear.

**Success.** The bottle makes at least one full turn in the air, then comes to rest standing on its base, within 15° of upright and nearly still, for at least half a second. Every upright landing after one or more turns counts, and it scores one point per turn (see section 5). If it lands at a small angle, the physics may tip it back onto its base, so a landing slightly off vertical can still succeed (a bottle that turns 0.9 of a turn and tips back upright counts as one turn). The bottle isn't snapped upright by a rule: physics decides. Coming to rest upside down on its cap also counts, after any rotation: it scores one point per full turn completed in the air, and at least 1.

**Fail.** The bottle comes to rest on its side, or falls off the table (past either end, or below the tabletop). Flying above the top of the screen is not a fail: a marker on the top edge shows where the bottle is, and if it comes down and lands upright on the table it counts as a success. If it hasn't settled after 5 seconds, it counts as a fail so the game can't stall. A bottle that lands upright without a full turn (for example a plain drop at very low power) is also a fail.

**After the result.**

- Success: a green flash and a short message that names the flip and the points: "Nailed it! +1", "Double! +2", "Triple! +3" (and "Flip ×4! +4" above that), or "Cap landing! +N" on the cap. The score goes up by that many points.
- No flip (upright, but without a full turn): a red flash and the message "No flip!", and the score doesn't change.
- Fail: a red flash and a short message ("Down!"), and the score doesn't change.
- After about 1 second the next bottle appears automatically. Space or click skips the wait.

## 3. The object and its physics

- For now there is one object: a plastic water bottle. Its shape and size are always the same. It must read as a water bottle: clearly taller than it is wide, with a visible shoulder, neck and cap (2026-11-19). Aim for about 2:1 now and about 2.5:1, close to a real bottle, once the water sloshes (M6). The difficulty targets below come first: the bottle is never made slimmer at the cost of narrower windows or any other target. If the targets can't be met at 2:1, the bottle is as slim as they allow, but never less than 1.3:1 (2026-11-20, F034).
- The only thing that changes between throws is the **amount of water**, chosen at random each throw (from nearly empty to nearly full, in small steps, using the seeded random generator so tests are repeatable).
- Water is simulated as extra mass that sits low in the bottle. More water means a heavier bottle and a center of mass closer to the bottom. It does not slosh in the first version: the water level is drawn, but the water moves with the bottle as one solid body.
- A heavier bottle gets less speed and less spin from the same power, so the "right" power is different for every bottle. The player must learn this from the visible water level alone.
- For each bottle there is a window of power that gives a clean single flip. Above it there is a narrower window that gives a double flip (worth 2 points), and a triple above that where the physics allows it. Every bottle should have a reachable double-flip window; triples are not required. When a single-flip target and a double-flip target conflict, the single flip wins. Starting values (best guess, to be tuned by playtesting): the single-flip window is at least 10 points of power wide (about ±6 to ±8 around the ideal); the ideal power rises smoothly and strongly from an empty to a full bottle (a full bottle needs about 2.5 to 4 times the power of an empty one); and the starting target is that an attentive new player lands about 3 of 10 and a practiced player 6 to 8 of 10.
- **Reading the water must matter.** No single fixed power may land a single flip on more than about 60% of water levels; otherwise a player can leave the bar at one value, press Space ten times and land most bottles without looking at them. This is why the bottles are spread so widely across the power range. The same goes for points (2026-11-20): with the same aiming error, a player who reads the water and aims at each single flip must score more points in the long run than one who throws a single high power at every bottle to go for doubles. A player with no aiming error could still do better with one high power, but nobody throws without error.
- Water sloshing is wanted, but not in the first version (see M6): first it is one solid mass, then it becomes a real moving mass inside the bottle.
- All tuning numbers (throw strength, spin, window width, tolerance angle, friction, bounciness) live in one config module so they are easy to adjust.

## 4. Surfaces, levels and challenges

- One flat table, wide enough that a reasonable throw lands on it. Nothing else on screen except a calm background with a gentle gradient.
- No levels and no special challenge rules for now. The variety comes from the random water level.
- Later ideas, not now: narrower tables, shelves, moving platforms, wind, landing on a target, a double-flip challenge.

## 5. Scoring and progression

- A **round** is 10 throws. Each upright landing scores one point per full turn: 1 for a single flip, 2 for a double, 3 for a triple, and so on. A fail (including "No flip!") scores nothing and does not end the round. A round can score more than 10.
- The round also counts its **landings** (successful throws out of 10). The difficulty targets in section 3 count landings, not points.
- A streak counter is shown during play (consecutive landings) but has no effect on points yet.
- The **best round score** is saved in the browser (local storage) and shown on the title screen and the round summary. Settings (mute) are saved too.
- Later ideas, not now: two-player and three-player turn-taking modes, streak bonuses, daily challenge.

## 6. Screens and UI

Screens, in order: **Title → Play → Round summary → Play again or Title**. Pause is an overlay on Play.

- **Title:** game name, a Play button, the best score, a mute toggle, and a one-line hint about the controls.
- **Play:** the table, the bottle with its visible water level, the power bar, the throw number ("Throw 3 / 10"), the current score, the streak, and the result flash and message after each throw.
- **Round summary:** the round's points ("Score: 14") and its landings ("Landed 7 / 10"), the best score (with a "New best!" note if beaten), a Play again button and a Title button.
- **Pause overlay:** Resume and Quit to title.
- **Fullscreen button (from M8):** a corner button next to the mute button on every screen, which switches fullscreen on and off. Its icon shows whether the game is fullscreen now. On a browser that can't make a page fullscreen (Safari on iPhone) the button isn't shown.

## 7. Controls

PC browser: mouse and keyboard. Phone (from M7): touch, see below the table.

| Action | Mouse | Keyboard |
| --- | --- | --- |
| Set power | Hold left button on the bottle and push the mouse upward; or mouse wheel to adjust the bar | Up / Down (hold to repeat) |
| Throw | Release the left button after a push | Space |
| Skip the wait after a result | Click | Space |
| Restart the round | Restart button on the pause overlay | R |
| Pause | Pause button in the corner | Esc or P |
| Mute | Speaker button | M |
| Fullscreen on / off (from M8) | Fullscreen button in the corner | F (Esc also leaves fullscreen: the browser does that itself, and the game pauses as usual) |

**On a phone (from M7):**

- **Throw:** touch the bottle, push the finger upward and let go. It is the same push as the mouse, converted to the same power. A finger moves differently from a mouse and the phone screen is much smaller, so the push may need its own conversion numbers (in the config module) so that a natural finger flick covers the whole power range. The difficulty targets of section 3 apply on a phone too.
- **Power bar:** shows the live value while pushing, as with the mouse. There are no on-screen Up/Down buttons: on a phone the push is the only way to throw.
- **Skip the wait:** tap anywhere.
- **Pause, mute, restart, and the buttons on the title and summary screens:** tap the same on-screen buttons. Every button must be big enough to hit with a thumb.
- **Fullscreen (from M8):** the first Play tap goes fullscreen (as built in M7). If the player leaves fullscreen, for example with the phone's back gesture, the fullscreen button brings it back, and so does the next Play or Play again tap.
- Every action in the game must be possible without a keyboard.

## 8. Art direction

- Flat and minimal: soft solid colors, no outlines or textures. A calm light background, a wooden-brown table, a translucent blue bottle with a lighter cap and a blue water fill.
- Soft shading for depth and readability is welcome, as long as it stays flat in style: a soft shadow on the table under the bottle (smaller and fainter the higher the bottle flies, so the player can judge its height), a light line along the water's surface and a faint highlight on the bottle's shell (so the water level reads at a glance), a lighter top edge on the table with a shadow under the tabletop, and a gentle vertical gradient in the background.
- The water's blue is the bottle's color only: buttons and other UI accents use a clearly different color, so the eye doesn't mix them up.
- Result colors: green for success, red for fail. They should also be told apart by the message text, not by color alone. The result flash is a light tint, not a strong wash over the whole screen: it shows up on every throw, so it must not tire the eyes.
- Everything is drawn in code (shapes and generated textures) as placeholders. Real art can replace it later.

## 9. Audio

- Sound effects only, generated in code with the browser's audio API, so there are no audio files to license: a short whoosh on throw, a knock on landing, a happy chime on success, a low thud on fail.
- No music for now. A mute button is available and the choice is remembered.
- Sound starts only after the first click or key press (browsers require this).

## 10. Platforms and technical targets

- Browser game on desktop (mouse and keyboard) and, from M7, on phones (touch). One game and one page for both: the same canvas, rules and tuning, with the input and a few screen details adapted to the device.
- Desktop: latest Chrome, Edge and Firefox. Chrome is the main test target.
- Phone (from M7): Chrome on Android and Safari on iPhone, held sideways (landscape). Held upright, the game shows a "Turn your phone sideways" message instead of a squeezed game. While playing, the page must not scroll, zoom, select text or show the browser's long-press menu, the game fills the screen as much as the browser allows, nothing important sits under a notch or rounded corner, and all text is readable on a 6-inch phone.
- Phone tests: automated tests also run in Chromium emulating a phone (touch input, a small landscape screen). The human checks a real Android phone and iPhone at the milestone stop. For that, the human needs a way to open the game on a phone: a dev server reachable on the home network, or a hosted page.
- Performance target: a steady 60 fps on an ordinary laptop and on a mid-range phone from the last few years.
- The logical canvas is **1280×720 landscape**, scaled to fit the window. The scaffold still has the old 720×1280 portrait values (`GAME_WIDTH` and `GAME_HEIGHT` in `src/core/constants.ts`, `docs/ARCHITECTURE.md`, the Playwright viewport in `playwright.config.ts`); the first feature must switch them over. We can change the orientation again later.
- Fullscreen (from M8): on a desktop, the fullscreen button or F fills the whole monitor with the game, still at 16:9 with bars on the sides if the monitor's shape differs. On an Android phone, fullscreen hides the browser's bars, as in M7. Safari on iPhone can't make a web page fullscreen, so the iPhone way is the home-screen app below.
- Home-screen app (from M8): the game can be added to a phone's home screen ("Add to Home Screen" in Safari, "Install app" or "Add to Home screen" in Chrome). Opened from its icon, it starts without the browser's address bar and tabs, held sideways, with the game's own name and icon. This needs a web app manifest and the iPhone's home-screen tags in index.html, and an icon drawn by the project itself. It is not an offline app: it still loads from the page's address.
- Later: itch.io or a hosted page, an offline app.

## 11. Milestones

- **M1, first playable:** one bottle, a table, physics with water mass, the power bar and Space to throw, success and fail detection with result colors, an instant next throw, and a simple score counter. No title screen yet.
- **M2, mouse push:** grab and push with the mouse, converted to the same power value. Throw and power values are visible to tests.
- **M3, rounds and best score:** 10-throw rounds, round summary, best score saved in the browser, streak counter.
- **M4, screens and audio:** title screen, pause overlay, generated sound effects, mute toggle.
- **M5, polish and tuning:** quicker result timing, tune difficulty so a good player can reach 6 to 8 out of 10 and reading the water matters, camera shake and small effects, the soft shading and readability of section 8, bug fixes.
- **M6, sloshing and replay:** water that moves inside the bottle and affects the flip, and a short slow-motion replay of the landing after each throw (skippable).
- **M7, phones:** play on a phone with touch, as in sections 7 and 10: the finger push and its tuning, taps for every button and for skipping, the sideways-only message, no scrolling or zooming, readable text and big enough buttons, phone e2e tests, and a way for the human to open the game on a real phone. It comes after M6 so the finger push is tuned once, against the final bottle and its sloshing water.
- **M8, fullscreen, home-screen app, performance and release check:** the fullscreen button and the home-screen app of sections 6, 7 and 10, then the performance budget and the production-build check, measured on a phone as well as a laptop.
- Later (not planned yet): two- and three-player modes, more objects, more surfaces.

## 12. Out of scope

- Two-player and three-player modes (planned for later, but build nothing for them now).
- Objects other than the bottle, and surfaces other than the single table.
- Levels, wind, targets, time limits, online leaderboards, accounts.
- Music.
- Sloshing water and the replay are wanted, but only from M6. Don't build them before then.
- Phone support is wanted, but only from M7. Don't build it before M6 is done. Until then, don't make it harder either: anything new must not need a keyboard or a mouse wheel to use.

## 13. Open questions

Decided:

- **Orientation:** landscape 1280×720 for the desktop version; can be changed later.
- **Hints:** none beyond the visible water level. A practice mode with a marked power window could be a later idea.
- **Round length:** 10 throws.
- **Mouse push mapping:** a mix of drag distance and drag speed, measured over the last 150 ms before release.
- **Sloshing and replay:** wanted, in M6.

Decided after the first plan (2026-11-16), answering the planner's open questions:

- **Single flips first.** Superseded on 2026-11-16 by the two decisions below: doubles and triples are now worth aiming for.
- **A landing needs at least one full turn (2026-11-16).** An upright landing with 0 turns is a fail shown as "No flip!".
- **Points per turn (2026-11-16).** An upright landing scores its number of turns, so more power can earn more points. Every bottle has a reachable double-flip window, narrower than its single-flip window; the single-flip window wins if the two ever conflict. The difficulty targets count landings, not points.
- **Tests lock targets, not tuning values.** Calibration and difficulty tests check the design's targets (window width, the full-to-empty power ratio, success rates), never specific power or tuning values. Retuning inside the targets needs no test change. When the human changes a target on purpose, they change it in section 3 first; agents then update the matching test ranges to the new target and say so in the progress log. That counts as following the design, not weakening a test.
- **No landing indicator.** The player never sees where the bottle will land: no marker, no trajectory preview. The fixed forward drift is tuned so every throw in a bottle's flip window lands on the table, around its middle. This keeps the only guess the power.
- **Water range:** 10% to 90% in 5% steps, as the plan assumes. Tunable.
- **Browsers:** automated tests run in Chromium only, which also covers Edge (same engine). The human checks Firefox by hand at milestone stops. Revisit adding Playwright's Firefox at M7.

Decided after an outside review of the game (Gemini, 2026-11-18), checked against the code by Claude:

- **The water level must matter (section 3).** With the 1.5–2× rule, the bottles' single-flip windows overlapped so much that one fixed power (46) landed 7 of the 9 tested water levels, about 78% of bottles, without looking at the bottle. F020's own model of a new player (one fixed power, ±8 points of error) landed about 55%, against its 20–40% target, and no tuning could fix that within 1.5–2×. A search of tunings found one that spreads the bottles from about power 17 to 60 (3.5×): one fixed power then lands about 56%, the new-player model 39% and the practiced model 67%, with every bottle keeping a double-flip window. So the ratio is now 2.5 to 4×, the window at least 10 points wide, and no fixed power may land more than about 60% of water levels.
- **Quicker results (section 2).** A success now needs half a second of standing upright and nearly still, not a full second: a bottle that is upright within 15° and still cannot fall any more, so the extra half second was only waiting. The next bottle comes after about 1 s instead of 1.5 s. Together that removes about 1 s of waiting from every throw.
- **Soft shading and a gentler flash (section 8).** A shadow under the bottle gives a sense of its height, the water's surface line makes the level easier to read (the player's only clue), the background is no longer an empty flat color, and the full-screen flash (40% opacity on every throw) becomes a light tint.
- **Not changed:** points stay 1/2/3 per turn (the human's decision of 2026-11-16), streaks still give no bonus, triples stay optional, the mouse push is unchanged (it already uses the fastest 50 ms of the push, so a short pause before release doesn't lose the throw). (This list also said the bottle's shape stays as calibrated in D23; that was reversed on 2026-11-19, see section 3 and F034: the calibrated 1.13:1 bottle looked like a squat jar.)
- **Ideas kept for later** (none planned yet): an endless mode (play until you miss), a daily challenge with the same bottles for everyone, a practice mode that shows each bottle's window on the power bar, a special score for landing on the cap, more surfaces and bottle types.

Decided on 2026-11-22:

- **The bottle-like look and a real throw come before the 40% new-player limit (F034).** No tuning of a 1.8:1 or slimmer bottle met every target and also rose above the hand and landed out on the table. The bottle stays 0.80 by 1.48 m, and a new player's expected landing rate may be up to 45%. This replaces the 2026-11-20 decision below that no target is relaxed.
- **Leaving the top of the screen is not a fail.** The higher throw carries low-water double flips and over-powered throws above the screen. A marker on the top edge shows where the bottle is, and only the landing decides the result: upright on the table is a success, missing the table is a fail.
- **A landing on the cap is a success.** It is rare (about 3% of throws over every water level and power, half of them a weak push that tips the bottle half a turn onto its cap) and scores its completed full turns, at least 1. The power windows still count upright landings only. It raised the expected rates slightly: practiced 61.0%, new player 44.7%.

Decided on 2026-11-20, answering questions the builders raised:

- **The bottle's shape gives way to the targets (section 3, F034).** A slim bottle of 1.85:1 could not meet the new-player target and fly high at the same time, so F034 looks for the slimmest shape, down to 1.3:1, that meets every target. No target was relaxed. F035 tries to slim the bottle further once the water sloshes.
- **Going for doubles must not beat reading the water (section 3).** Points stay 1/2/3 per turn. The rule is checked on the expected points with the same aiming error as the practiced player, and the current tuning meets it (6.25 against 5.55 points per 10 throws). It was raised when an error-free fixed power of about 95 scored 16.3 per 10.
- **Quitting to the title abandons the round.** A round quit from the pause overlay is not scored and doesn't count toward the best, like leaving a match early. Only finished rounds count.
- **No pause button on the round summary.** Nothing is moving there, so only the mute button shows.

Decided on 2026-11-23:

- **Phones too, not only desktop.** Most players are expected to try the game on a phone. The desktop version stays as it is, and the same game also works on a phone with touch (sections 7 and 10). This replaces "no touch or phone support for now".
- **Phones come after M6 (M7).** The finger push has to be tuned against the bottle's final shape and its sloshing water, which M6 still changes, so tuning it earlier would mean tuning it twice. The performance budget and the production-build check (previously M7 in the plan) move to M8, so they are measured on a phone too.
- **Landscape on phones as well.** The 1280×720 landscape canvas stays: a phone held sideways fits it, and an upright phone shows a message asking to turn it. A separate portrait layout is not planned.

Decided at the M7 stop (2026-11-25):

- **Fullscreen and home-screen app (2026-11-25).** The player can make the game fullscreen on a PC as well as a phone, with a corner button and the F key, and can add it to a phone's home screen to play without the browser's bars (the only way on an iPhone). Both come in M8, before the performance check. See sections 6, 7 and 10.

Still open, to be settled by playtesting after M1:

1. **Difficulty numbers.** The window width, the weight effect and the score targets in section 3 are best guesses (the weight effect was raised after the review above).
2. **Streak rewards.** The streak counter has no effect on points yet.
