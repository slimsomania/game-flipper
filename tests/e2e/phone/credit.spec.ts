import { expect, test } from '@playwright/test';
import { openTitle } from '../helpers';

// F057: on the phone the credit line is readable, on the canvas, clear of every other text and
// button, and set in a smaller font than the best line.
test('Title: the credit line is at least 24 px tall, clear of everything, smaller than Best', async ({
  page,
}) => {
  await openTitle(page, '?seed=7');
  const boxes = await page.evaluate(() => window.__FLIPPER__!.textBounds());
  const buttons = await page.evaluate(() => window.__FLIPPER__!.buttons());
  const credit = boxes.find((b) => b.text === 'Created and designed by Vlas')!;
  const best = boxes.find((b) => b.text.startsWith('Best:'))!;
  expect(credit).toBeDefined();
  expect(credit.bottom - credit.top).toBeGreaterThanOrEqual(24);
  expect(credit.left).toBeGreaterThanOrEqual(0);
  expect(credit.right).toBeLessThanOrEqual(1280);
  expect(credit.top).toBeGreaterThanOrEqual(0);
  expect(credit.bottom).toBeLessThanOrEqual(720);
  expect(credit.bottom - credit.top).toBeLessThan(best.bottom - best.top);
  expect(credit.top).toBeGreaterThanOrEqual(best.bottom);
  for (const b of boxes) {
    if (b === credit) continue;
    const overlap =
      credit.left < b.right &&
      b.left < credit.right &&
      credit.top < b.bottom &&
      b.top < credit.bottom;
    expect(overlap, `credit overlaps "${b.text}"`).toBe(false);
  }
  for (const b of buttons) {
    const hw = b.width / 2;
    const hh = b.height / 2;
    const overlap =
      credit.left < b.x + hw &&
      b.x - hw < credit.right &&
      credit.top < b.y + hh &&
      b.y - hh < credit.bottom;
    expect(overlap, `credit overlaps button ${b.name}`).toBe(false);
  }
});
