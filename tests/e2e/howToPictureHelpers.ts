import { expect, type Page } from '@playwright/test';
import { HOW_TO_LAYOUT } from '../../src/game/view/howToLayout';
import { howToPictures } from '../../src/game/view/howToPicture';
import { howToTexts } from '../../src/game/view/howToText';

/**
 * F054: with the card open, the hook reports two bottles and two bars, baked Images, inside the
 * card, clear of every text box, matching the pure module; and the texts are only the card's own.
 */
export async function expectPicturesClean(page: Page, kind: 'keyboard' | 'touch'): Promise<void> {
  const shown = await page.evaluate(() => ({
    pictures: window.__FLIPPER__!.howToPicture(),
    boxes: window.__FLIPPER__!.textBounds(),
    texts: window.__FLIPPER__!.texts(),
  }));
  const pictures = shown.pictures!;
  expect(pictures.bottles).toHaveLength(2);
  expect(pictures.bars).toHaveLength(2);
  const { box } = HOW_TO_LAYOUT;
  const all = [...pictures.bottles, ...pictures.bars];
  for (const p of all) {
    expect(p.kind).toBe('image');
    expect(p.left).toBeGreaterThanOrEqual(box.left);
    expect(p.right).toBeLessThanOrEqual(box.right);
    expect(p.top).toBeGreaterThanOrEqual(box.top);
    expect(p.bottom).toBeLessThanOrEqual(box.bottom);
    for (const t of shown.boxes) {
      const hit = p.left < t.right && t.left < p.right && p.top < t.bottom && t.top < p.bottom;
      expect(hit, `picture overlaps "${t.text}"`).toBe(false);
    }
  }
  const expected = howToPictures();
  expected.forEach((e, i) => {
    expect(pictures.bottles[i]!.left).toBeCloseTo(e.bottle.x, 0);
    expect(pictures.bars[i]!.top).toBeCloseTo(e.bar.y, 0);
  });
  const barHeight = (i: number) => pictures.bars[i]!.bottom - pictures.bars[i]!.top;
  expect(barHeight(0)).toBeGreaterThan(0);
  // The pictures hold no text: only the card's own lines and buttons are listed.
  const words = howToTexts(kind);
  expect([...shown.texts].sort()).toEqual([words.title, words.closeLabel, ...words.lines].sort());
}
