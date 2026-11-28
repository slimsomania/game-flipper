import { expect, test, type Page } from '@playwright/test';
import { openTitle, visibleTexts } from './helpers';
import { SAVE_KEY } from './muteHelpers';
import { activeScenes } from './roundHelpers';

/*
 * F057: players see the game as Flipsy (Title, <title>, home-screen name, manifest) and the Title
 * credits Vlas. Everything internal stays Flipper: the save key and window.__FLIPPER__.
 */

async function expectFlipsyEverywhere(page: Page): Promise<void> {
  expect(await page.title()).toBe('Flipsy');
  const meta = await page
    .locator('meta[name="apple-mobile-web-app-title"]')
    .getAttribute('content');
  expect(meta).toBe('Flipsy');
  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]')!.getAttribute('href')!;
    return (await fetch(href)).json();
  });
  expect(manifest).toMatchObject({ name: 'Flipsy', short_name: 'Flipsy' });
}

test('dev server: the page, meta and manifest say Flipsy; the Title names it and credits Vlas', async ({
  page,
}) => {
  await page.addInitScript((key) => {
    if (!window.localStorage.getItem(key)) {
      window.localStorage.setItem(
        key,
        JSON.stringify({ version: 1, best: 9, muted: false, seenHowTo: true }),
      );
    }
  }, SAVE_KEY);
  const errors = await openTitle(page);
  await expectFlipsyEverywhere(page);
  const texts = await visibleTexts(page);
  expect(texts).toContain('Flipsy');
  expect(texts).toContain('Created and designed by Vlas');
  // A best saved under the unchanged key still shows, and the hook object keeps its name.
  expect(texts).toContain('Best: 9');
  expect(await page.evaluate(() => typeof window.__FLIPPER__)).toBe('object');
  expect(texts.filter((t) => t.includes('Flipper'))).toEqual([]);
  expect(errors).toEqual([]);
});

test('production build: the page, meta and manifest say Flipsy', async ({ page }) => {
  await page.goto('http://localhost:5197/');
  await expect(page.locator('canvas')).toBeVisible();
  await expectFlipsyEverywhere(page);
});

test('no text in play, on Pause or on How to play says Flipper', async ({ page }) => {
  await openTitle(page, '?seed=7');
  const all = new Set<string>();
  const collect = async () => (await visibleTexts(page)).forEach((t) => all.add(t));
  await collect();
  await page.keyboard.press('Enter');
  await expect.poll(() => activeScenes(page)).toEqual(['Game']);
  await collect();
  await page.keyboard.press('KeyP');
  await expect.poll(() => page.evaluate(() => window.__FLIPPER__!.gamePaused())).toBe(true);
  await collect();
  await page.keyboard.press('KeyP');
  await page.keyboard.press('KeyH');
  await expect.poll(() => page.evaluate(() => window.__FLIPPER__!.howToOpen())).toBe(true);
  await collect();
  expect([...all].filter((t) => /flipper/i.test(t))).toEqual([]);
  expect(all.size).toBeGreaterThan(5);
});
