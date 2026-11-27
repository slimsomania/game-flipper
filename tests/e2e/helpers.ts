import type { Page } from '@playwright/test';
import type { SimSnapshot } from '../../src/core/simulation';

/**
 * Opens the page and waits until it accepts input: the game boots to the Title scene, so there is
 * no simulation yet. Returns a live list of console and page errors; assert it is empty at the end
 * of the test. Tests of the title screen itself use this; every other test wants `openGame`.
 *
 * The How to play card opens by itself at the first Play in a browser (F056), so unless
 * `firstVisit` is true, a save marking it as seen is put in an empty localStorage first: a test
 * that presses Play for something else then keeps testing what it did before.
 */
export async function openTitle(page: Page, query = '', firstVisit = false): Promise<string[]> {
  if (!firstVisit) {
    await page.addInitScript(() => {
      try {
        const key = 'flipper.save.v1';
        const text = window.localStorage.getItem(key);
        let entry: Record<string, unknown> = { version: 1, best: 0, muted: false };
        if (text !== null) {
          try {
            entry = JSON.parse(text) as Record<string, unknown>;
          } catch {
            return; // a damaged entry is left for the test that put it there
          }
        }
        if (entry !== null && typeof entry === 'object' && !('seenHowTo' in entry)) {
          window.localStorage.setItem(key, JSON.stringify({ ...entry, seenHowTo: true }));
        }
      } catch {
        // Blocked storage: nothing to preset.
      }
    });
  }
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__FLIPPER__?.ready === true);
  return errors;
}

/**
 * From the title screen, start the Game scene (the test hook, as `npm run snap`'s `scene:Game`: no
 * click, no key) and wait until its simulation runs. A page that is already in the Game scene is
 * started afresh.
 */
export async function startGame(page: Page, replayOff = true): Promise<void> {
  // The slow-motion replay (F027) stretches the result; only the tests of it switch it on.
  if (replayOff) await page.evaluate(() => window.__FLIPPER__!.setTuningValue('replaySpeed', 0));
  await page.evaluate(() => window.__FLIPPER__!.startScene('Game'));
  await page.waitForFunction(
    () =>
      window.__FLIPPER__!.activeScenes().includes('Game') && window.__FLIPPER__!.state() !== null,
  );
}

/**
 * Opens the game in play and waits until it accepts input: the title screen, then the Game scene
 * started through `startGame`, so a test of play doesn't depend on the title's own input. Returns
 * a live list of console and page errors; assert it is empty at the end of the test.
 */
export async function openGame(page: Page, query = '', replayOff = true): Promise<string[]> {
  const errors = await openTitle(page, query, true);
  await startGame(page, replayOff);
  return errors;
}

/** Visit the page again, in the Game scene: a new game in the same browser, with the same localStorage. */
export async function reloadGame(page: Page, replayOff = true): Promise<void> {
  await page.reload();
  await page.waitForFunction(() => window.__FLIPPER__?.ready === true);
  await startGame(page, replayOff);
}

/** Current simulation snapshot. Throws if no game scene is running. */
export async function gameState(page: Page): Promise<SimSnapshot> {
  const state = await page.evaluate(() => window.__FLIPPER__!.state());
  if (!state) throw new Error('No simulation is running (is the Game scene active?)');
  return state;
}

/**
 * Freeze the real-time clock and step one frame at a time until the throw's outcome is decided (at
 * most `limit` frames). Returns the snapshot of that very step, with the phase `result`: the
 * thrown bottle is replaced 60 steps later, so tests that look at where it landed stop here.
 */
export async function stepUntilOutcome(page: Page, limit = 400): Promise<SimSnapshot> {
  const state = await page.evaluate((max) => {
    const hooks = window.__FLIPPER__!;
    hooks.pause();
    let snapshot = hooks.state();
    for (let i = 0; i < max && snapshot && snapshot.outcome === null; i++) snapshot = hooks.step(1);
    return snapshot;
  }, limit);
  if (!state) throw new Error('No simulation is running (is the Game scene active?)');
  return state;
}

/**
 * Let the game process input sent just before. Phaser reads keyboard, wheel and pointer events
 * once per frame, so after `page.keyboard`, `page.mouse` and the like, wait two animation frames
 * before asserting that something did not change (use `expect.poll` for something that should).
 */
export async function settleInput(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/**
 * The text the player sees (`window.__FLIPPER__.texts()`), read after the game has had a frame to
 * draw the latest state: the scene redraws once per frame, so right after `step()`, `skip()` or
 * `placeBottle()` the texts are still the previous ones. To wait for a text to appear, poll
 * this with `expect.poll`.
 */
export async function visibleTexts(page: Page): Promise<string[]> {
  await settleInput(page);
  return page.evaluate(() => window.__FLIPPER__!.texts());
}

/**
 * The full-screen result flash the player sees (`window.__FLIPPER__.flash()`: a color and an
 * opacity, or null), read after the game has had a frame to draw the latest state, like
 * `visibleTexts`.
 */
export async function visibleFlash(page: Page): Promise<{ color: number; alpha: number } | null> {
  await settleInput(page);
  return page.evaluate(() => window.__FLIPPER__!.flash());
}

/**
 * Start recording the `repeat` flag of every keydown the page receives, so a test can prove that
 * it really sent auto-repeat events. Returns a function that reads the flags so far.
 */
export async function recordKeydownRepeats(page: Page): Promise<() => Promise<boolean[]>> {
  await page.evaluate(() => {
    const repeats: boolean[] = [];
    (window as unknown as { __repeats: boolean[] }).__repeats = repeats;
    window.addEventListener('keydown', (event) => repeats.push(event.repeat), true);
  });
  return () => page.evaluate(() => (window as unknown as { __repeats: boolean[] }).__repeats);
}

/** The power bar's current value. */
export async function powerOf(page: Page): Promise<number> {
  return (await gameState(page)).power;
}

/** Freeze the real-time clock and advance the simulation by exactly `frames` fixed steps. */
export async function stepFrames(page: Page, frames: number): Promise<SimSnapshot> {
  const state = await page.evaluate((n) => {
    window.__FLIPPER__!.pause();
    return window.__FLIPPER__!.step(n);
  }, frames);
  if (!state) throw new Error('No simulation is running (is the Game scene active?)');
  return state;
}
