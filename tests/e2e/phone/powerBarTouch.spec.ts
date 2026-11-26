import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_TUNING } from '../../../src/core/tuning';
import {
  BAR_BOTTOM,
  BAR_HEIGHT,
  BAR_TOP,
  BAR_TOUCH,
  BAR_X,
} from '../../../src/game/view/powerBarLayout';
import { gameState, openGame, stepUntilOutcome } from '../helpers';
import { gamePoint, type Point } from '../mouseHelpers';
import { bottleCenterOnPage, dragTouchInPage, sendTouch, type TouchStep } from './touchHelpers';

// F048: on a phone the power bar is set by a finger (a slide on the bar), and a quick still tap on
// the bottle throws at the bar's power, like Space. The events carry virtual time stamps.

/** A point on the bar, `fraction` of its height up from the bottom, on the page. */
const onBar = (page: Page, fraction: number): Promise<Point> =>
  gamePoint(page, BAR_X, BAR_BOTTOM - fraction * BAR_HEIGHT);

/** Put a finger down on the bar at `from` and slide it through `via`, ending as asked. */
async function slide(page: Page, from: Point, via: Point[], lift: boolean): Promise<void> {
  const steps: TouchStep[] = [{ type: 'start', x: from.x, y: from.y, after: 0 }];
  for (const p of via) steps.push({ type: 'move', x: p.x, y: p.y, after: 30 });
  if (lift) {
    const last = via[via.length - 1] ?? from;
    steps.push({ type: 'end', x: last.x, y: last.y, after: 10 });
  }
  await sendTouch(page, steps);
}

async function setBar62(page: Page): Promise<void> {
  await slide(page, await onBar(page, 0.1), [await onBar(page, 0.62)], true);
  expect((await gameState(page)).power).toBe(62);
}

async function aiming(page: Page, query = '?seed=7'): Promise<string[]> {
  const errors = await openGame(page, query);
  await page.evaluate(() => window.__FLIPPER__!.pause());
  return errors;
}

test('a slide on the bar sets the power from the finger height, clamps, and throws nothing', async ({
  page,
}) => {
  const errors = await aiming(page);
  const start = await onBar(page, 0.2);
  await slide(page, start, [await onBar(page, 0.75)], false);
  let s = await gameState(page);
  expect(Math.abs(s.power - 75)).toBeLessThanOrEqual(1);
  expect(Number.isInteger(s.power)).toBe(true);
  expect(s.phase).toBe('aiming');
  expect(s.dragging).toBe(false);
  expect(s.lastThrow).toBeNull();

  // Sliding on, wherever the finger goes: to the bottom, far below, then far above and sideways.
  const low = await gamePoint(page, BAR_X, BAR_BOTTOM);
  await sendTouch(page, [{ type: 'move', x: low.x, y: low.y, after: 30 }]);
  expect((await gameState(page)).power).toBe(0);
  const far = await gamePoint(page, BAR_X + 300, BAR_TOP - 150);
  await sendTouch(page, [{ type: 'move', x: far.x, y: far.y, after: 30 }]);
  s = await gameState(page);
  expect(s.power).toBe(100);
  expect(s.dragging).toBe(false);
  expect(s.lastThrow).toBeNull();

  const mid = await onBar(page, 0.4);
  await sendTouch(page, [
    { type: 'move', x: mid.x, y: mid.y, after: 30 },
    { type: 'end', x: mid.x, y: mid.y, after: 10 },
  ]);
  expect((await gameState(page)).power).toBe(40);
  // Lifting leaves the value, also a while later.
  await page.evaluate(() => window.__FLIPPER__!.step(30));
  s = await gameState(page);
  expect(s.power).toBe(40);
  expect(s.phase).toBe('aiming');
  expect(s.lastThrow).toBeNull();
  expect(errors).toEqual([]);
});

test('a quick still tap on the bottle throws at the bar power with source tap, like Space', async ({
  page,
}) => {
  const errors = await aiming(page);
  await setBar62(page);
  const at = await bottleCenterOnPage(page);
  await dragTouchInPage(page, { at, rise: 0, ms: 100, end: 'release' });
  const s = await gameState(page);
  expect(s.phase).toBe('flying');
  expect(s.lastThrow).toMatchObject({ power: 62, source: 'tap' });
  const outcome = (await stepUntilOutcome(page)).outcome;

  // The same seed thrown with Space at power 62 gives the same outcome.
  const again = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());
  await page.evaluate(() => window.__FLIPPER__!.setPower(62));
  await page.keyboard.press('Space');
  expect((await gameState(page)).lastThrow).toMatchObject({ power: 62, source: 'keyboard' });
  expect((await stepUntilOutcome(page)).outcome).toEqual(outcome);
  expect([...errors, ...again]).toEqual([]);
});

test('after the throw and its result the bar still reads 62, and a second tap throws at 62', async ({
  page,
}) => {
  await aiming(page);
  await setBar62(page);
  const at = await bottleCenterOnPage(page);
  await dragTouchInPage(page, { at, rise: 0, ms: 80, end: 'release' });
  await stepUntilOutcome(page);
  await page.evaluate(() => window.__FLIPPER__!.skip());
  await expect.poll(async () => (await gameState(page)).phase).toBe('aiming');
  expect((await gameState(page)).power).toBe(62);

  await dragTouchInPage(page, {
    at: await bottleCenterOnPage(page),
    rise: 0,
    ms: 80,
    end: 'release',
  });
  const s = await gameState(page);
  expect(s.phase).toBe('flying');
  expect(s.lastThrow).toMatchObject({ power: 62, source: 'tap' });
});

test('a push on the bottle still throws with source touch; one under the minimum is not a tap', async ({
  page,
}) => {
  await aiming(page);
  await page.evaluate(() => window.__FLIPPER__!.setPower(33));
  const at = await bottleCenterOnPage(page);
  // 5 mm (27.5 CSS px) slowly: moved past the tap limit, under the push minimum: nothing.
  await dragTouchInPage(page, { at, rise: 27.5, ms: 600, end: 'release' });
  let s = await gameState(page);
  expect(s.phase).toBe('aiming');
  expect(s.lastThrow).toBeNull();
  expect(s.power).toBe(33);

  await dragTouchInPage(page, { at, rise: 330, ms: 150, end: 'release' });
  s = await gameState(page);
  expect(s.phase).toBe('flying');
  expect(s.lastThrow).toMatchObject({ power: 100, source: 'touch' });
});

test('a slow small movement, or a held touch, on the bottle throws nothing', async ({ page }) => {
  await aiming(page);
  const at = await bottleCenterOnPage(page);
  await dragTouchInPage(page, { at, rise: 0, ms: 600, end: 'release' });
  let s = await gameState(page);
  expect(s.phase).toBe('aiming');
  expect(s.lastThrow).toBeNull();
  await dragTouchInPage(page, { at, rise: 8, ms: 600, end: 'release' });
  s = await gameState(page);
  expect(s.phase).toBe('aiming');
  expect(s.lastThrow).toBeNull();
});

test('a tap on the table, the background or the bar while aiming throws nothing', async ({
  page,
}) => {
  await aiming(page);
  await page.evaluate(() => window.__FLIPPER__!.setPower(50));
  for (const game of [
    { x: 1000, y: 600 },
    { x: 640, y: 100 },
  ]) {
    const at = await gamePoint(page, game.x, game.y);
    await dragTouchInPage(page, { at, rise: 0, ms: 60, end: 'release' });
    const s = await gameState(page);
    expect(s.phase).toBe('aiming');
    expect(s.lastThrow).toBeNull();
    expect(s.power).toBe(50);
  }
  await dragTouchInPage(page, { at: await onBar(page, 0.3), rise: 0, ms: 60, end: 'release' });
  const s = await gameState(page);
  expect(s.phase).toBe('aiming');
  expect(s.lastThrow).toBeNull();
  expect(s.dragging).toBe(false);
});

test('a tap during a result skips only that result; a tap on the bar then changes nothing', async ({
  page,
}) => {
  await aiming(page);
  await page.evaluate(() => window.__FLIPPER__!.throwBottle(50));
  await stepUntilOutcome(page);
  expect((await gameState(page)).phase).toBe('result');

  await dragTouchInPage(page, { at: await onBar(page, 0.9), rise: 0, ms: 60, end: 'release' });
  let s = await gameState(page);
  expect(s.phase).toBe('result');
  expect(s.power).toBe(50);

  await dragTouchInPage(page, {
    at: await gamePoint(page, 640, 150),
    rise: 0,
    ms: 60,
    end: 'release',
  });
  await expect.poll(async () => (await gameState(page)).phase).toBe('aiming');
  s = await gameState(page);
  expect(s.throws).toBe(1);
  expect(s.lastThrow).toMatchObject({ source: 'keyboard' });
});

test('a tap on the bar while the pause overlay is open changes nothing', async ({ page }) => {
  await aiming(page);
  await page.evaluate(() => window.__FLIPPER__!.setPower(50));
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__FLIPPER__!.gamePaused())).toBe(true);
  await dragTouchInPage(page, { at: await onBar(page, 0.9), rise: 0, ms: 60, end: 'release' });
  const s = await gameState(page);
  expect(s.power).toBe(50);
  expect(s.lastThrow).toBeNull();
  expect(await page.evaluate(() => window.__FLIPPER__!.gamePaused())).toBe(true);
});

test('the bar touch area is at least 44 CSS px wide and never reaches the bottle grab area', async ({
  page,
}) => {
  await aiming(page);
  const left = await gamePoint(page, BAR_TOUCH.left, BAR_TOUCH.top);
  const right = await gamePoint(page, BAR_TOUCH.right, BAR_TOUCH.top);
  expect(right.x - left.x).toBeGreaterThanOrEqual(44);
  const { bottle } = await gameState(page);
  const grabLeft = bottle.x * 100 - 40 - DEFAULT_TUNING.touchGrabPadding;
  expect(BAR_TOUCH.right).toBeLessThanOrEqual(grabLeft);

  // A touch just inside the bottle's grab area grabs and never moves the bar.
  await page.evaluate(() => window.__FLIPPER__!.setPower(37));
  const edge = await gamePoint(page, grabLeft + 2, (bottle.y - 0.5) * 100);
  await dragTouchInPage(page, { at: edge, rise: 0, ms: 600, end: 'hold' });
  const s = await gameState(page);
  expect(s.dragging).toBe(true);
  expect(s.power).toBe(37);
  // A touch just inside the bar's area sets the power and grabs nothing.
  await sendTouch(page, [{ type: 'end', x: edge.x, y: edge.y, after: 600 }]);
  const inside = await gamePoint(page, BAR_TOUCH.right - 2, BAR_BOTTOM - BAR_HEIGHT / 2);
  await sendTouch(page, [{ type: 'start', x: inside.x, y: inside.y, after: 0 }]);
  const t = await gameState(page);
  expect(t.dragging).toBe(false);
  expect(t.power).toBe(50);
});
