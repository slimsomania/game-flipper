import { expect, test, type Page } from '@playwright/test';
import { HOW_TO_LAYOUT } from '../../src/game/view/howToLayout';
import { howToTexts } from '../../src/game/view/howToText';
import { TITLE_LAYOUT } from '../../src/game/view/titleLayout';
import { clickAt } from './pauseHelpers';
import { openTitle, recordKeydownRepeats, settleInput, visibleTexts } from './helpers';
import { gameState } from './helpers';
import { MUTED, ON, clickMuteButton, muteState } from './muteHelpers';
import { activeScenes } from './roundHelpers';

/*
 * The How to play card (F053): a scene over the Title, opened by its button or H, closed by Close, a
 * press outside it, Esc or H. The Title doesn't react while it is open. The words are unit-tested in
 * `howTo.test.ts`.
 */

const isOpen = (page: Page) => page.evaluate(() => window.__FLIPPER__!.howToOpen());
const expectOpen = (page: Page, open: boolean) =>
  expect.poll(() => isOpen(page), { message: `card open: ${open}` }).toBe(open);

async function open(page: Page): Promise<string[]> {
  const errors = await openTitle(page);
  await clickAt(page, TITLE_LAYOUT.howTo);
  await expectOpen(page, true);
  return errors;
}

async function expectTitleShowing(page: Page): Promise<void> {
  await expectOpen(page, false);
  await expect.poll(() => activeScenes(page)).toEqual(['Title']);
  expect(await visibleTexts(page)).toContain('Play');
}

async function expectPlayStarts(page: Page): Promise<void> {
  await clickAt(page, TITLE_LAYOUT.play);
  await expect.poll(() => activeScenes(page)).toEqual(['Game']);
  await settleInput(page);
  expect(await gameState(page)).toMatchObject({ phase: 'aiming', throwNumber: 1, throws: 0 });
}

test.describe('opening the card', () => {
  test('the How to play button opens it, with every line in texts()', async ({ page }) => {
    const errors = await open(page);
    const texts = await visibleTexts(page);
    const words = howToTexts('keyboard');
    expect(texts).toContain(words.title);
    expect(texts).toContain(words.closeLabel);
    for (const line of words.lines) expect(texts).toContain(line);
    expect(errors).toEqual([]);
  });

  test('the H key opens it', async ({ page }) => {
    await openTitle(page);
    await page.keyboard.press('h');
    await expectOpen(page, true);
    expect(await visibleTexts(page)).toContain('Created and designed by Vlas');
  });

  test('while it is open Enter, Space and a click on the Play button start nothing', async ({
    page,
  }) => {
    await open(page);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    await clickAt(page, TITLE_LAYOUT.play);
    await settleInput(page);
    await settleInput(page);
    expect(await activeScenes(page)).toEqual(['HowTo']);
    expect(await isOpen(page)).toBe(true);
  });
});

test.describe('closing the card', () => {
  test('the Close button closes it, and Play then starts throw 1', async ({ page }) => {
    await open(page);
    await clickAt(page, HOW_TO_LAYOUT.close);
    await expectTitleShowing(page);
    await expectPlayStarts(page);
  });

  test('a click outside the card closes it and does nothing else', async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => window.__FLIPPER__!.muted())).toBe(false);
    // Outside the card, on the corner where the speaker button is on the Title.
    await clickAt(page, { x: 1240, y: 52 });
    await expectTitleShowing(page);
    expect(await muteState(page)).toMatchObject(ON);
    expect(await activeScenes(page)).toEqual(['Title']);
    await expectPlayStarts(page);
  });

  test('a click on the card itself keeps it open', async ({ page }) => {
    await open(page);
    await clickAt(page, { x: 1000, y: 400 }); // the picture strip
    await clickAt(page, TITLE_LAYOUT.play);
    await settleInput(page);
    expect(await isOpen(page)).toBe(true);
  });

  for (const key of ['Escape', 'h']) {
    test(`${key} closes it, and Play then starts throw 1`, async ({ page }) => {
      await open(page);
      await page.keyboard.press(key);
      await expectTitleShowing(page);
      await expectPlayStarts(page);
    });
  }

  test('a held H closes it once and its auto-repeat does not reopen it', async ({ page }) => {
    await open(page);
    const repeats = await recordKeydownRepeats(page);
    await page.keyboard.down('h');
    await expectOpen(page, false);
    await page.keyboard.down('h'); // auto-repeat of the held key
    await page.keyboard.down('h');
    await settleInput(page);
    await settleInput(page);
    expect((await repeats()).filter(Boolean).length).toBeGreaterThanOrEqual(2);
    expect(await isOpen(page)).toBe(false);
    expect(await activeScenes(page)).toEqual(['Title']);
    await page.keyboard.up('h');
  });

  test('a held H opens it once and its auto-repeat does not close it', async ({ page }) => {
    await openTitle(page);
    await page.keyboard.down('h');
    await expectOpen(page, true);
    await page.keyboard.down('h');
    await page.keyboard.down('h');
    await settleInput(page);
    await settleInput(page);
    expect(await isOpen(page)).toBe(true);
    await page.keyboard.up('h');
  });

  test('the mute button still works on the Title after the card closes', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Escape');
    await expectTitleShowing(page);
    await clickMuteButton(page);
    expect(await muteState(page)).toMatchObject(MUTED);
  });
});
