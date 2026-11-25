import { expect, test, type Page } from '@playwright/test';
import { PAUSE_BUTTON, PAUSE_LAYOUT } from '../../../src/game/view/pauseLayout';
import { MUTE_BUTTON } from '../../../src/game/view/muteLayout';
import { SUMMARY_LAYOUT } from '../../../src/game/view/summaryLayout';
import { TITLE_LAYOUT } from '../../../src/game/view/titleLayout';
import { SAVE_KEY } from '../muteHelpers';
import { gameState, openGame, openTitle, stepUntilOutcome } from '../helpers';
import { gamePoint } from '../mouseHelpers';
import { contextStates, trackAudioContexts } from '../soundHelpers';
import { bottleCenterOnPage, dragTouchInPage, sendTouch } from './touchHelpers';

// F039: every button acts once by a finger tap, a tap skips the wait, and only the first finger counts.
// Taps here are real touches (`page.touchscreen.tap`), so the browser also sends the compatibility
// mouse events after them, which must not act a second time.

const AWAY = { x: 1000, y: 600 }; // game px: an empty part of the table

async function tap(page: Page, spot: { x: number; y: number }): Promise<void> {
  const { x, y } = await gamePoint(page, spot.x, spot.y);
  await page.touchscreen.tap(x, y);
}

const scenes = (page: Page) => page.evaluate(() => window.__FLIPPER__!.activeScenes());
const paused = (page: Page) => page.evaluate(() => window.__FLIPPER__!.gamePaused());

/** A finger push on the held bottle, then step (clock paused) to the outcome. */
async function pushThrow(page: Page): Promise<void> {
  await page.evaluate(() => window.__FLIPPER__!.pause());
  const at = await bottleCenterOnPage(page);
  await dragTouchInPage(page, { at, rise: 50, ms: 100, end: 'release' });
  expect((await gameState(page)).lastThrow!.source).toBe('touch');
  await stepUntilOutcome(page);
}

test('a whole visit by taps and finger pushes: no key press', async ({ page }) => {
  const errors = await openTitle(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.setTuningValue('replaySpeed', 0));
  await tap(page, TITLE_LAYOUT.play);
  await expect.poll(() => scenes(page)).toEqual(['Game']);
  expect((await gameState(page)).throwNumber).toBe(1);

  for (let n = 1; n <= 10; n++) {
    expect((await gameState(page)).throwNumber).toBe(n);
    await pushThrow(page);
    expect((await gameState(page)).phase).toBe('result');
    await tap(page, AWAY);
    if (n < 10) await expect.poll(async () => (await gameState(page)).throwNumber).toBe(n + 1);
  }
  await expect.poll(() => scenes(page)).toContain('Summary');

  await tap(page, SUMMARY_LAYOUT.playAgain);
  await expect.poll(() => scenes(page)).toEqual(['Game']);
  expect(await gameState(page)).toMatchObject({ throwNumber: 1, score: 0, phase: 'aiming' });

  await tap(page, PAUSE_BUTTON);
  await expect.poll(() => paused(page)).toBe(true);
  await tap(page, PAUSE_LAYOUT.restart);
  await expect.poll(() => paused(page)).toBe(false);
  expect(await scenes(page)).toEqual(['Game']);

  await tap(page, PAUSE_BUTTON);
  await expect.poll(() => paused(page)).toBe(true);
  await tap(page, PAUSE_LAYOUT.quit);
  await expect.poll(() => scenes(page)).toEqual(['Title']);
  expect(errors).toEqual([]);
});

test('a tap on the speaker toggles the mute once and the save matches', async ({ page }) => {
  await openTitle(page);
  expect(await page.evaluate(() => window.__FLIPPER__!.muted())).toBe(false);
  await tap(page, MUTE_BUTTON);
  await expect.poll(() => page.evaluate(() => window.__FLIPPER__!.muted())).toBe(true);
  // Give a stray compatibility click time to arrive: it would toggle back.
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__FLIPPER__!.muted())).toBe(true);
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? '{}'),
    SAVE_KEY,
  );
  expect(saved.muted).toBe(true);
});

test('a tap on Play starts throw 1 and throws nothing', async ({ page }) => {
  await openTitle(page, '?seed=7');
  await tap(page, TITLE_LAYOUT.play);
  await expect.poll(() => scenes(page)).toEqual(['Game']);
  await page.waitForTimeout(500);
  expect(await gameState(page)).toMatchObject({
    throwNumber: 1,
    phase: 'aiming',
    lastThrow: null,
    dragging: false,
  });
});

test('a tap during a result skips only that result', async ({ page }) => {
  await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());
  await page.evaluate(() => window.__FLIPPER__!.throwBottle(50));
  await stepUntilOutcome(page);
  const before = await gameState(page);
  // The tap lands where the next bottle will be held.
  const hand = await bottleCenterOnPage(page);
  await page.touchscreen.tap(hand.x, hand.y);
  await expect.poll(async () => (await gameState(page)).throwNumber).toBe(2);
  await page.waitForTimeout(500);
  const after = await gameState(page);
  expect(after).toMatchObject({ throwNumber: 2, phase: 'aiming', dragging: false });
  expect(after.lastThrow).toEqual(before.lastThrow);
});

test('a tap on Resume neither skips nor grabs in the Game scene underneath', async ({ page }) => {
  await openGame(page, '?seed=7');
  await tap(page, PAUSE_BUTTON);
  await expect.poll(() => paused(page)).toBe(true);
  const before = await gameState(page);
  await tap(page, PAUSE_LAYOUT.resume);
  await expect.poll(() => paused(page)).toBe(false);
  await page.waitForTimeout(500);
  const after = await gameState(page);
  expect(after).toMatchObject({
    throwNumber: before.throwNumber,
    phase: 'aiming',
    dragging: false,
  });
  expect(after.lastThrow).toBeNull();
  expect(await scenes(page)).toEqual(['Game']);
});

test('the first tap unlocks the sound and a finger throw logs its whoosh', async ({ page }) => {
  await trackAudioContexts(page);
  await openTitle(page, '?seed=7');
  expect(await contextStates(page)).not.toContain('running');
  await tap(page, TITLE_LAYOUT.play);
  await expect.poll(() => contextStates(page)).toContain('running');
  await expect.poll(() => scenes(page)).toEqual(['Game']);
  await page.evaluate(() => window.__FLIPPER__!.setTuningValue('replaySpeed', 0));
  const before = await page.evaluate(() => window.__FLIPPER__!.sounds().length);
  await pushThrow(page);
  const sounds = await page.evaluate(() => window.__FLIPPER__!.sounds());
  expect(sounds.length).toBeGreaterThan(before);
  expect(sounds.map((s) => s.name)).toContain('whoosh');
});

test('a second finger changes nothing and the first finger still throws', async ({ page }) => {
  await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());
  const at = await bottleCenterOnPage(page);
  await dragTouchInPage(page, { at, rise: 120, ms: 60, end: 'hold' });
  const held = await gameState(page);
  expect(held.dragging).toBe(true);

  // A second finger (identifier 2) goes down, moves and lifts while the first is down.
  await page.evaluate(
    ([x, y]) => {
      const canvas = document.querySelector('canvas')!;
      const mk = (id: number, cy: number) =>
        new Touch({ identifier: id, target: canvas, clientX: x, clientY: cy, pageX: x, pageY: cy });
      const first = mk(1, y - 120);
      const second = mk(2, y + 60);
      const fire = (type: string, touches: Touch[], changed: Touch[]) =>
        canvas.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches,
            targetTouches: touches,
            changedTouches: changed,
          }),
        );
      fire('touchstart', [first, second], [second]);
      fire('touchmove', [first, mk(2, y - 200)], [mk(2, y - 200)]);
      fire('touchend', [first], [mk(2, y - 200)]);
    },
    [at.x, at.y],
  );
  const mid = await gameState(page);
  expect(mid.dragging).toBe(true);
  expect(mid.power).toBeCloseTo(held.power, 5);
  expect(mid.phase).toBe('aiming');
  expect(mid.lastThrow).toBeNull();

  await sendTouch(page, [{ type: 'end', x: at.x, y: at.y - 120, after: 0 }]);
  const after = await gameState(page);
  expect(after.dragging).toBe(false);
  expect(after.phase).toBe('flying');
  expect(after.lastThrow!.source).toBe('touch');
});

test('a touchcancel mid-push ends the grab without a throw', async ({ page }) => {
  await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());
  const at = await bottleCenterOnPage(page);
  const start = await gameState(page);
  await dragTouchInPage(page, { at, rise: 50, ms: 100, end: 'hold' });
  expect((await gameState(page)).dragging).toBe(true);
  await sendTouch(page, [{ type: 'cancel', x: at.x, y: at.y - 50, after: 0 }]);
  const after = await gameState(page);
  expect(after.dragging).toBe(false);
  expect(after.phase).toBe('aiming');
  expect(after.lastThrow).toBeNull();
  expect(after.power).toBeCloseTo(start.power, 5);
});
