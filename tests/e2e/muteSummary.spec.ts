import { expect, test, type Page } from '@playwright/test';
import { hitBox } from '../../src/game/view/buttonView';
import { FULLSCREEN_BUTTON } from '../../src/game/view/fullscreenLayout';
import { MUTE_BUTTON } from '../../src/game/view/muteLayout';
import { SUMMARY_LAYOUT } from '../../src/game/view/summaryLayout';
import { FLIPPED } from '../shared';
import { gameState, openGame, recordKeydownRepeats, settleInput } from './helpers';
import {
  LANDS,
  MUTED,
  ON,
  clickMuteButton,
  muteButtonBox,
  muteState,
  reload,
  savedEntry,
  skipResult,
  throwAndLand,
} from './muteHelpers';
import { gamePoint } from './mouseHelpers';
import { activeScenes, land } from './roundHelpers';
import { sounds } from './soundHelpers';

/*
 * The mute toggle (F017) on the round summary: M and the speaker button work there too. With the
 * summary open the Game scene is paused underneath, so its own button is deaf; the summary has its
 * own. Both only toggle the sound and save it: neither starts Play again nor goes to the title.
 */

/** Play a one-throw round to its summary, which is then open over the paused Game scene. */
async function openSummary(page: Page) {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.setTuningValue('throwsPerRound', 1));
  await land(page, FLIPPED);
  await skipResult(page);
  await expect.poll(() => activeScenes(page)).toEqual(['Summary']);
  return errors;
}

/** The summary is still open on the finished round: nothing was restarted and nothing was left. */
async function expectSummaryStillOpen(page: Page): Promise<void> {
  await settleInput(page);
  expect(await activeScenes(page)).toEqual(['Summary']);
  expect(await gameState(page)).toMatchObject({ phase: 'roundOver', throws: 1, landings: 1 });
}

test.describe('on the round summary', () => {
  test('the speaker button is there and shows the sound state', async ({ page }) => {
    const errors = await openSummary(page);
    expect(await muteState(page)).toEqual(ON);
    expect(errors).toEqual([]);
  });

  test('M toggles mute and saves it, and the summary stays open', async ({ page }) => {
    const errors = await openSummary(page);
    const { score } = await gameState(page);

    await page.keyboard.press('KeyM');
    await expect.poll(() => muteState(page)).toEqual(MUTED);
    expect(await page.evaluate(() => window.__FLIPPER__!.muted())).toBe(true);
    expect(await savedEntry(page)).toEqual({
      version: 1,
      best: score,
      muted: true,
      seenHowTo: false,
    });
    await expectSummaryStillOpen(page);

    await page.keyboard.press('KeyM');
    await expect.poll(() => muteState(page)).toEqual(ON);
    expect(await savedEntry(page)).toEqual({
      version: 1,
      best: score,
      muted: false,
      seenHowTo: false,
    });
    await expectSummaryStillOpen(page);
    expect(errors).toEqual([]);
  });

  test('clicking the speaker button toggles mute and saves it, and the summary stays open', async ({
    page,
  }) => {
    const errors = await openSummary(page);
    const { score } = await gameState(page);

    await clickMuteButton(page);
    await expect.poll(() => muteState(page)).toEqual(MUTED);
    expect(await savedEntry(page)).toEqual({
      version: 1,
      best: score,
      muted: true,
      seenHowTo: false,
    });
    await expectSummaryStillOpen(page);

    await clickMuteButton(page);
    await expect.poll(() => muteState(page)).toEqual(ON);
    expect(await savedEntry(page)).toEqual({
      version: 1,
      best: score,
      muted: false,
      seenHowTo: false,
    });
    await expectSummaryStillOpen(page);
    expect(errors).toEqual([]);
  });

  test('neither the key nor the button starts Play again or goes to the title', async ({
    page,
  }) => {
    const errors = await openSummary(page);
    for (let i = 0; i < 3; i++) {
      await clickMuteButton(page);
      await page.keyboard.press('KeyM');
    }
    await expect.poll(() => muteState(page)).toEqual(ON); // six toggles
    await expectSummaryStillOpen(page);
    // Still the summary, not a new round or the title: Play again is what restarts the round.
    expect(await page.evaluate(() => window.__FLIPPER__!.texts())).toContain('Round over');
    expect(errors).toEqual([]);
  });

  test('a key held down flips the sound once: the auto-repeat is ignored', async ({ page }) => {
    const errors = await openSummary(page);
    const repeats = await recordKeydownRepeats(page);

    await page.keyboard.down('KeyM');
    await expect.poll(() => muteState(page)).toEqual(MUTED);
    for (let i = 0; i < 3; i++) {
      await page.keyboard.down('KeyM');
      await settleInput(page);
    }
    expect(await repeats()).toEqual([false, true, true, true]);
    expect(await muteState(page)).toEqual(MUTED);
    await page.keyboard.up('KeyM');
    await expectSummaryStillOpen(page);
    expect(errors).toEqual([]);
  });

  test('the button is where it is in play, beside the card and clear of its buttons', async ({
    page,
  }) => {
    await openSummary(page);
    const box = await muteButtonBox(page);
    const { card, playAgain, title } = SUMMARY_LAYOUT;

    // The hook reports the clickable area (F042), which is bigger than the drawn face.
    const area = hitBox(MUTE_BUTTON);
    expect(box).toMatchObject({ x: MUTE_BUTTON.x, width: MUTE_BUTTON.hitWidth });
    expect(box.x + box.width / 2).toBe(area.right);
    expect(box.y - box.height / 2).toBe(area.top);
    // The fullscreen button has the corner; the speaker is right next to it.
    expect(FULLSCREEN_BUTTON.x + FULLSCREEN_BUTTON.width / 2).toBe(1280 - MUTE_BUTTON.margin);
    expect(area.right).toBeLessThan(hitBox(FULLSCREEN_BUTTON).left);
    expect(box.x - box.width / 2).toBeGreaterThan(card.x + card.width / 2);
    for (const button of [playAgain, title]) {
      expect(box.x - box.width / 2).toBeGreaterThan(button.x + button.width / 2);
    }
  });

  test('a click just left of the speaker is not a click on it', async ({ page }) => {
    const errors = await openSummary(page);
    const box = await muteButtonBox(page);
    const beside = await gamePoint(page, box.x - box.width / 2 - 6, box.y);
    await page.mouse.click(beside.x, beside.y);
    await settleInput(page);
    expect(await muteState(page)).toEqual(ON);
    await expectSummaryStillOpen(page);
    expect(errors).toEqual([]);
  });
});

test.describe('what the summary hands on', () => {
  test('the choice made on the summary is kept by Play again, and is silent', async ({ page }) => {
    const errors = await openSummary(page);
    await page.keyboard.press('KeyM');
    await expect.poll(() => muteState(page)).toEqual(MUTED);
    const heard = (await sounds(page)).length;

    await page.keyboard.press('Enter'); // Play again
    await expect.poll(() => activeScenes(page)).toEqual(['Game']);
    // The Game scene's own button shows the choice made while it was paused.
    await expect.poll(() => muteState(page)).toEqual(MUTED);
    await throwAndLand(page, LANDS);
    expect(await sounds(page)).toHaveLength(heard);
    expect(errors).toEqual([]);
  });

  test('unmuting on the summary brings the sounds back for the next round', async ({ page }) => {
    const errors = await openSummary(page);
    await page.evaluate(() => window.__FLIPPER__!.setMuted(true));
    await expect.poll(() => muteState(page)).toEqual(MUTED);

    await clickMuteButton(page);
    await expect.poll(() => muteState(page)).toEqual(ON);
    const heard = (await sounds(page)).length;
    await page.keyboard.press('Enter');
    await expect.poll(() => activeScenes(page)).toEqual(['Game']);
    await throwAndLand(page, LANDS);
    expect((await sounds(page)).length).toBeGreaterThan(heard);
    expect(errors).toEqual([]);
  });

  test('the choice made on the summary survives a reload', async ({ page }) => {
    const errors = await openSummary(page);
    await page.keyboard.press('KeyM');
    await expect.poll(() => muteState(page)).toEqual(MUTED);

    await reload(page);
    expect(await muteState(page)).toEqual(MUTED);
    expect(errors).toEqual([]);
  });

  test('the title, reached from the summary, shows the choice made there', async ({ page }) => {
    const errors = await openSummary(page);
    await clickMuteButton(page);
    await expect.poll(() => muteState(page)).toEqual(MUTED);

    const { title } = SUMMARY_LAYOUT;
    const point = await gamePoint(page, title.x, title.y);
    await page.mouse.click(point.x, point.y);
    await expect.poll(() => activeScenes(page)).toEqual(['Title']);
    await expect.poll(() => muteState(page)).toEqual(MUTED);
    expect(errors).toEqual([]);
  });

  test('Play again still works after M and the speaker were used on the summary', async ({
    page,
  }) => {
    const errors = await openSummary(page);
    await clickMuteButton(page);
    await page.keyboard.press('KeyM');
    await expectSummaryStillOpen(page);

    const { playAgain } = SUMMARY_LAYOUT;
    const point = await gamePoint(page, playAgain.x, playAgain.y);
    await page.mouse.click(point.x, point.y);
    await expect.poll(() => activeScenes(page)).toEqual(['Game']);
    expect(await gameState(page)).toMatchObject({ phase: 'aiming', throwNumber: 1, score: 0 });
    expect(errors).toEqual([]);
  });
});
