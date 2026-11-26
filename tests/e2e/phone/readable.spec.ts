import { expect, test, type Page } from '@playwright/test';
import { FLIPPED } from '../../shared';
import { openGame, openTitle, visibleTexts } from '../helpers';
import { gamePoint } from '../mouseHelpers';
import { land } from '../roundHelpers';
import { playToSummary } from '../summaryHelpers';

// F043: on the phone every text is at least 24 game px tall (12 CSS px at half size), inside the
// canvas and clear of every other text, and the hints speak of fingers, not keys.

const MIN_HEIGHT = 24;
const KEY_WORDS = /\b(Esc|P|Enter|Space|R)\b/;

interface Box {
  text: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const bounds = (page: Page): Promise<Box[]> =>
  page.evaluate(() => window.__FLIPPER__!.textBounds());

async function expectReadable(page: Page): Promise<void> {
  const boxes = await bounds(page);
  expect(boxes.length).toBeGreaterThan(0);
  for (const b of boxes) {
    expect(b.bottom - b.top, `${b.text} height`).toBeGreaterThanOrEqual(MIN_HEIGHT);
    expect(b.left, `${b.text} left`).toBeGreaterThanOrEqual(0);
    expect(b.top, `${b.text} top`).toBeGreaterThanOrEqual(0);
    expect(b.right, `${b.text} right`).toBeLessThanOrEqual(1280);
    expect(b.bottom, `${b.text} bottom`).toBeLessThanOrEqual(720);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      expect(overlap, `"${a.text}" overlaps "${b.text}"`).toBe(false);
    }
  }
}

async function pauseByTap(page: Page): Promise<void> {
  const area = (await page.evaluate(() => window.__FLIPPER__!.buttons())).find(
    (b) => b.name === 'pauseButton',
  )!;
  const at = await gamePoint(page, area.x, area.y);
  await page.touchscreen.tap(at.x, at.y);
  await expect.poll(() => page.evaluate(() => window.__FLIPPER__!.gamePaused())).toBe(true);
}

test('Title: texts are readable, and the controls hint names the push and the bar-and-tap', async ({
  page,
}) => {
  await openTitle(page, '?seed=7');
  await expectReadable(page);
  const texts = await visibleTexts(page);
  const hint = texts.find((t) => /tap the bottle/i.test(t))!;
  expect(hint).toMatch(/set the power bar and tap the bottle/i);
  expect(hint).toMatch(/push the bottle up/i);
  for (const t of texts) expect(t, t).not.toMatch(KEY_WORDS);
});

test('Play: texts are readable while aiming and with a result message', async ({ page }) => {
  await openGame(page, '?seed=7');
  await expectReadable(page);
  await land(page, FLIPPED);
  expect(await visibleTexts(page)).toContain('Nailed it! +1');
  await expectReadable(page);
});

test('Pause: texts are readable and name no key', async ({ page }) => {
  await openGame(page, '?seed=7');
  await pauseByTap(page);
  await expectReadable(page);
  for (const t of await visibleTexts(page)) expect(t, t).not.toMatch(KEY_WORDS);
});

test('Summary: texts are readable and name no key', async ({ page }) => {
  await openGame(page, '?seed=7');
  await playToSummary(page);
  await expectReadable(page);
  for (const t of await visibleTexts(page)) expect(t, t).not.toMatch(KEY_WORDS);
});
