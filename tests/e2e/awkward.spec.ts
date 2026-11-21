/*
 * F022: awkward play. Each test abuses input or timing in a way a player might and checks that the
 * game ends in a valid state with no console errors.
 */
import { expect, test, type Page } from '@playwright/test';
import { FLIPPED, SIDE } from '../shared';
import { gameState, openGame, settleInput } from './helpers';
import { bottleCenter, dragInPage, gamePoint, phaseOf, press } from './mouseHelpers';
import { expectPaused, pauseWith, runClock } from './pauseHelpers';
import { activeScenes, land, next } from './roundHelpers';

/** The checks that hold in every state the game can be in. */
async function expectValid(page: Page): Promise<void> {
  const s = await gameState(page);
  expect(['aiming', 'flying', 'result', 'roundOver']).toContain(s.phase);
  expect(s.power).toBeGreaterThanOrEqual(0);
  expect(s.power).toBeLessThanOrEqual(100);
  expect(s.throwNumber).toBeGreaterThanOrEqual(1);
  expect(s.throwNumber).toBeLessThanOrEqual(10);
  expect(s.score).toBeGreaterThanOrEqual(0);
  expect(Number.isFinite(s.bottle.x) && Number.isFinite(s.bottle.y)).toBe(true);
}

const dragging = async (page: Page): Promise<boolean> => (await gameState(page)).dragging;

/** Step (clock paused) until the throw in the air has an outcome. */
const stepToOutcome = (page: Page) =>
  page.evaluate(() => {
    const h = window.__FLIPPER__!;
    h.pause();
    for (let i = 0; i < 600 && h.state()!.outcome === null; i++) h.step(1);
    return h.state()!.outcome;
  });

test.describe('awkward play', () => {
  test('mashing Space and the arrow keys through flight and result', async ({ page }) => {
    const errors = await openGame(page);
    await runClock(page);
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press(['Space', 'ArrowUp', 'ArrowDown', 'Space'][i % 4]);
      if (i % 8 === 0) await settleInput(page);
    }
    await settleInput(page);
    await expectValid(page);
    // Keys held down together.
    await page.keyboard.down('ArrowUp');
    await page.keyboard.down('ArrowDown');
    await page.keyboard.down('Space');
    await settleInput(page);
    await page.keyboard.up('Space');
    await page.keyboard.up('ArrowDown');
    await page.keyboard.up('ArrowUp');
    await settleInput(page);
    await expectValid(page);
    expect(await activeScenes(page)).toContain('Game');
    expect(errors).toEqual([]);
  });

  test('R mid-flight and mid-result restarts the round cleanly', async ({ page }) => {
    const errors = await openGame(page);
    await page.evaluate(() => {
      window.__FLIPPER__!.pause();
      window.__FLIPPER__!.throwBottle(60);
      window.__FLIPPER__!.step(5);
    });
    expect(await phaseOf(page)).toBe('flying');
    await page.keyboard.press('r');
    await expect
      .poll(() => gameState(page))
      .toMatchObject({ phase: 'aiming', throwNumber: 1, score: 0 });
    await land(page, FLIPPED);
    expect(await phaseOf(page)).toBe('result');
    await page.keyboard.press('r');
    await expect
      .poll(() => gameState(page))
      .toMatchObject({ phase: 'aiming', throwNumber: 1, score: 0, outcome: null });
    await expectValid(page);
    expect(errors).toEqual([]);
  });

  test('pausing mid-flight and mid-result, then resuming', async ({ page }) => {
    const errors = await openGame(page);
    await runClock(page);
    await page.evaluate(() => window.__FLIPPER__!.throwBottle(60));
    await pauseWith(page);
    const frozen = await gameState(page);
    await page.waitForTimeout(200);
    expect((await gameState(page)).tick).toBe(frozen.tick);
    await page.keyboard.press('Escape'); // closes it
    await expectPaused(page, false);
    await expect
      .poll(async () => (await gameState(page)).outcome, { timeout: 15_000 })
      .not.toBeNull();
    // Mid-result.
    await pauseWith(page);
    const inResult = await gameState(page);
    await page.waitForTimeout(200);
    expect((await gameState(page)).tick).toBe(inResult.tick);
    await page.keyboard.press('Escape');
    await expectPaused(page, false);
    await expectValid(page);
    expect(errors).toEqual([]);
  });

  test('a drag started during the result throws nothing', async ({ page }) => {
    const errors = await openGame(page);
    await land(page, FLIPPED);
    expect(await phaseOf(page)).toBe('result');
    const target = await gamePoint(page, 640, 400);
    await page.mouse.move(target.x, target.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y - 150, { steps: 5 });
    await page.mouse.up();
    await settleInput(page);
    const s = await gameState(page);
    expect(s.dragging).toBe(false);
    expect(s.throws).toBe(1); // the click skipped the result at most; the drag threw nothing
    await expectValid(page);
    expect(errors).toEqual([]);
  });

  test('releasing the mouse outside the canvas ends the grab', async ({ page }) => {
    const errors = await openGame(page);
    const at = await bottleCenter(page);
    await press(page, at);
    await page.mouse.move(at.x, at.y - 60, { steps: 4 });
    await page.mouse.move(at.x + 600, at.y - 600, { steps: 4 }); // out of the canvas, button down
    await page.mouse.up();
    await expect.poll(() => dragging(page)).toBe(false);
    await expectValid(page);
    expect(errors).toEqual([]);
  });

  test('a button let go on the page body ends the grab', async ({ page }) => {
    const errors = await openGame(page);
    const at = await bottleCenter(page);
    await dragInPage(page, { at, rise: 120, ms: 150, end: 'releaseOutside' });
    await settleInput(page);
    expect(await dragging(page)).toBe(false);
    await expectValid(page);
    expect(errors).toEqual([]);
  });

  test('a long frame gap advances at most the capped number of steps and the throw resolves', async ({
    page,
  }) => {
    const errors = await openGame(page);
    await runClock(page);
    await page.evaluate(() => window.__FLIPPER__!.throwBottle(60));
    // Block the page for 3 s (a hidden tab or a stall), then count the steps of the next frame.
    const advanced = await page.evaluate(async () => {
      const start = window.__FLIPPER__!.state()!.tick;
      const t0 = performance.now();
      while (performance.now() - t0 < 3000) {
        /* stall */
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      return window.__FLIPPER__!.state()!.tick - start;
    });
    expect(advanced).toBeLessThanOrEqual(5);
    await expect
      .poll(async () => (await gameState(page)).outcome, { timeout: 15_000 })
      .not.toBeNull();
    await expectValid(page);
    expect(errors).toEqual([]);
  });

  test('resizing the window mid-throw', async ({ page }) => {
    const errors = await openGame(page);
    const at = await bottleCenter(page);
    await press(page, at);
    await page.mouse.move(at.x, at.y - 80, { steps: 4 });
    await page.setViewportSize({ width: 700, height: 900 });
    await settleInput(page);
    await page.mouse.move(at.x, at.y - 120, { steps: 2 });
    await page.setViewportSize({ width: 1500, height: 500 });
    await settleInput(page);
    await page.mouse.up();
    await page.setViewportSize({ width: 900, height: 600 });
    await settleInput(page);
    await expect.poll(() => dragging(page)).toBe(false);
    const s = await gameState(page);
    if (s.phase === 'aiming') await page.evaluate(() => window.__FLIPPER__!.throwBottle(55));
    expect(await stepToOutcome(page)).not.toBeNull();
    await expectValid(page);
    const box = await page.locator('canvas').boundingBox();
    expect(box!.width / box!.height).toBeCloseTo(16 / 9, 1);
    expect(errors).toEqual([]);
  });

  test('three full rounds in a row with mixed keyboard and mouse throws', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await page.evaluate(() => window.__FLIPPER__!.pause());
    for (let round = 0; round < 3; round++) {
      for (let n = 1; n <= 10; n++) {
        expect(await gameState(page)).toMatchObject({ throwNumber: n, phase: 'aiming' });
        if (n % 3 === 0) {
          // A real-mouse push.
          const at = await bottleCenter(page);
          await press(page, at);
          await page.mouse.move(at.x, at.y - 40, { steps: 3 });
          await page.mouse.up();
          await expect.poll(async () => (await gameState(page)).throws).toBe(round * 10 + n);
          expect(await stepToOutcome(page)).not.toBeNull();
        } else if (n % 3 === 1) {
          await land(page, n % 2 ? FLIPPED : SIDE);
        } else {
          // A keyboard throw with a set power.
          await page.evaluate(() => window.__FLIPPER__!.setPower(60));
          await page.keyboard.press('Space');
          await expect.poll(async () => (await gameState(page)).throws).toBe(round * 10 + n);
          expect(await stepToOutcome(page)).not.toBeNull();
        }
        const result = await gameState(page);
        expect(result.score).toBeLessThanOrEqual(10);
        await next(page);
        if (n < 10) await expect.poll(() => phaseOf(page)).toBe('aiming');
      }
      await expect.poll(() => activeScenes(page)).toContain('Summary');
      await page.keyboard.press('Enter'); // play again
      await expect.poll(() => activeScenes(page)).toEqual(['Game']);
      expect(await gameState(page)).toMatchObject({
        throwNumber: 1,
        score: 0,
        phase: 'aiming',
        throws: (round + 1) * 10,
      });
    }
    expect(errors).toEqual([]);
  });
});
