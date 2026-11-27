import { expect, test } from '@playwright/test';
import { HOW_TO_LAYOUT } from '../../../src/game/view/howToLayout';
import { howToTexts } from '../../../src/game/view/howToText';
import { openTitle, settleInput } from '../helpers';
import { gamePoint } from '../mouseHelpers';

// F053 on the phone: the card's texts are at least 24 game px tall, inside the card and clear of
// each other and of the picture strip, name no key, and the buttons' hit areas are at least 88x88.

async function tapButton(page: import('@playwright/test').Page, name: string): Promise<void> {
  const area = (await page.evaluate(() => window.__FLIPPER__!.buttons())).find(
    (b) => b.name === name,
  )!;
  expect(area, name).toBeTruthy();
  expect(area.width, `${name} width`).toBeGreaterThanOrEqual(88);
  expect(area.height, `${name} height`).toBeGreaterThanOrEqual(88);
  const at = await gamePoint(page, area.x, area.y);
  await page.touchscreen.tap(at.x, at.y);
}

test('the How to play card reads well on the phone', async ({ page }) => {
  await openTitle(page, '?seed=7');
  const buttons = await page.evaluate(() => window.__FLIPPER__!.buttons());
  const rect = (b: (typeof buttons)[number]) => ({
    l: b.x - b.width / 2,
    r: b.x + b.width / 2,
    t: b.y - b.height / 2,
    b: b.y + b.height / 2,
  });
  for (const a of buttons) {
    for (const c of buttons) {
      if (a === c) continue;
      const p = rect(a);
      const q = rect(c);
      expect(p.l < q.r && q.l < p.r && p.t < q.b && q.t < p.b, `${a.name} vs ${c.name}`).toBe(
        false,
      );
    }
  }
  await tapButton(page, 'howToButton');
  await expect.poll(() => page.evaluate(() => window.__FLIPPER__!.howToOpen())).toBe(true);
  await settleInput(page);

  const boxes = await page.evaluate(() => window.__FLIPPER__!.textBounds());
  const words = howToTexts('touch');
  const shown = boxes.map((b) => b.text);
  for (const line of words.lines) expect(shown).toContain(line);
  const { box, pictures } = HOW_TO_LAYOUT;
  for (const b of boxes) {
    expect(b.bottom - b.top, `${b.text} height`).toBeGreaterThanOrEqual(24);
    expect(b.left, `${b.text} left`).toBeGreaterThanOrEqual(box.left);
    expect(b.right, `${b.text} right`).toBeLessThanOrEqual(box.right);
    expect(b.top, `${b.text} top`).toBeGreaterThanOrEqual(box.top);
    expect(b.bottom, `${b.text} bottom`).toBeLessThanOrEqual(box.bottom);
    expect(b.text, b.text).not.toMatch(/\b(Up|Down|Space|Enter|Esc|H)\b/);
    // Nothing is drawn in the strip kept for the pictures.
    const inStrip =
      b.left < pictures.left + pictures.width &&
      pictures.left < b.right &&
      b.top < pictures.top + pictures.height &&
      pictures.top < b.bottom;
    expect(inStrip, `${b.text} in the picture strip`).toBe(false);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const hit = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      expect(hit, `"${a.text}" overlaps "${b.text}"`).toBe(false);
    }
  }
  const last = boxes.reduce((m, b) => (b.bottom > m.bottom ? b : m));
  expect(last.text).toBe('Created and designed by Vlas');

  await tapButton(page, 'closeButton');
  await expect.poll(() => page.evaluate(() => window.__FLIPPER__!.howToOpen())).toBe(false);
});
