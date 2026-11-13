---
status: draft
---

<!--
  This is the game design document for Flipper. You own it: agents read it but never edit it.
  The planner agent turns it into harness/state/feature_list.json.

  When it describes the game well enough to plan from, change "status: draft" above to
  "status: ready". The harness won't plan from a draft.

  Plain language and bullet points are fine. Anything you leave out, the agents decide using the
  simplest reasonable option, and the planner lists those decisions for you to check.
  Replace the italic prompts with your answers.
-->

# Flipper: game design

## 1. Concept

Flipper is a skill game about throwing an object so it flips in the air and lands standing upright. It mimics the game kids play with a plastic bottle partly filled with water: hold the bottle by the top, toss it so it spins, and try to land it exactly on its bottom. If it lands on any other side, the throw fails.

_In one or two sentences: what makes it fun, and who is it for?_

## 2. Core loop

_Describe one throw from start to finish._

- _How does the player throw? (drag and release, swipe or flick, press and hold for power, a timing meter…)_
- _What controls the height and the spin? Is the throw straight up, or toward a target?_
- _What counts as a success? (for example: comes to rest on its base within N° of upright for at least 1 second)_
- _What counts as a fail? (lands on its side or cap, falls off the table, leaves the screen…)_
- _What happens after the result: instant retry, a short replay, a score screen?_

## 3. The object and its physics

- _Which objects can be flipped? Start with the water bottle; others later (cans, books, phones…)?_
- _Should the water visibly slosh and change how the bottle flips (shifting weight), or is it decoration?_
- _Can the water level change, and does it change the difficulty?_

## 4. Surfaces, levels and challenges

- _Where does the bottle land: a table only, or shelves, stairs, moving platforms, other objects?_
- _Is there a series of levels, or a single endless mode?_
- _Any challenge rules? (double flips, landing on a target, wind, time limits…)_

## 5. Scoring and progression

- _How is a throw scored? (success or fail, rotations, style, streaks, combos…)_
- _What is kept between play sessions? (best score, unlocks, settings…)_

## 6. Screens and UI

- _Which screens, in which order? (for example: Title → Play → Result → Play…; pause; settings; credits)_
- _What does the screen show during play?_

## 7. Controls

| Action | Mouse / touch | Keyboard |
| --- | --- | --- |
| Throw | _…_ | _…_ |
| Restart | _…_ | _…_ |
| Pause | _…_ | _…_ |

## 8. Art direction

- _Look and feel: flat and minimal, cartoon, realistic? Colors? Describe the mood rather than copying another game's art._
- _Who makes the final art? Until then, agents draw placeholder shapes in code._

## 9. Audio

- _Sound effects (throw, spin, landing, fail) and music? Generated in code, or files you provide?_

## 10. Platforms and technical targets

- Browser game; portrait 720×1280 logical canvas, scaled to fit the screen (the default; change it here if you want landscape).
- _Must it work on phones (touch) as well as desktop (mouse and keyboard)? Which browsers matter most?_
- _Performance target? (for example: 60 fps on a mid-range phone)_
- _Later: installable web app, app stores, itch.io?_

## 11. Milestones

_Optional. If you leave this empty, the planner proposes milestones; M1 is always the first playable version._

- M1, first playable: _…_
- M2: _…_

## 12. Out of scope

_Things the agents should not build, for now._

## 13. Open questions

_Anything you're unsure about. The planner picks a simple option and flags it for you._
