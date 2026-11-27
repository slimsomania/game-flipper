import { expect, test, type Page } from '@playwright/test';
import { flipped, type PlacedPose } from '../shared';
import { SUMMARY_LAYOUT } from '../../src/game/view/summaryLayout';
import { TITLE_LAYOUT } from '../../src/game/view/titleLayout';
import { gameState, openTitle, recordKeydownRepeats, settleInput, visibleTexts } from './helpers';
import { gamePoint } from './mouseHelpers';
import { MUTED, ON, SAVE_KEY, clickMuteButton, muteState, savedEntry } from './muteHelpers';
import { activeScenes, next, playThrows } from './roundHelpers';

/*
 * The title screen (F018): the game boots to it, it shows the name, Play, the saved best score, the
 * mute toggle and the controls hint, and Play, Space or Enter start a round (throw 1) without the key
 * also throwing the bottle. The summary's Title button comes back here. The words themselves are
 * unit-tested in `titleText.test.ts`.
 */

const HINT = 'Up/Down or wheel: power · Space: throw · or grab the bottle and push up';

/** Put a saved best score in localStorage before the game starts (once: a reload keeps what the game saved). */
async function saveBest(page: Page, best: number): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      if (!window.localStorage.getItem(key as string)) {
        window.localStorage.setItem(key as string, JSON.stringify({ version: 1, best: value }));
      }
    },
    [SAVE_KEY, best],
  );
}

/** The Play button's middle on the page: where a player would click. */
const playPoint = (page: Page) => gamePoint(page, TITLE_LAYOUT.play.x, TITLE_LAYOUT.play.y);

/** Wait until the Game scene runs a fresh round at throw 1, nothing thrown yet. */
async function expectRoundStarted(page: Page): Promise<void> {
  await expect.poll(() => activeScenes(page)).toEqual(['Game']);
  await settleInput(page);
  expect(await gameState(page)).toMatchObject({
    phase: 'aiming',
    throwNumber: 1,
    throws: 0,
    score: 0,
    outcome: null,
  });
  expect(await visibleTexts(page)).toContain('Throw 1 / 10');
}

test.describe('what the title screen shows', () => {
  test('the game boots to Title with no errors, showing the name, Play, Best and the hint', async ({
    page,
  }) => {
    await saveBest(page, 17);
    const errors = await openTitle(page);

    expect(await activeScenes(page)).toEqual(['Title']);
    const texts = await visibleTexts(page);
    expect(texts).toContain('Flipsy');
    expect(texts).toContain('Play');
    expect(texts).toContain('Best: 17');
    expect(texts).toContain(HINT);
    // Nothing of a round is on it, and the hint is one line.
    expect(texts.filter((text) => /^(Throw|Score|Streak)/.test(text))).toEqual([]);
    expect(texts.filter((text) => text.includes('\n'))).toEqual([]);
    expect(await page.evaluate(() => window.__FLIPPER__!.state())).toBeNull();
    expect(errors).toEqual([]);
  });

  test('with no saved best it shows Best: 0', async ({ page }) => {
    const errors = await openTitle(page);
    expect(await visibleTexts(page)).toContain('Best: 0');
    expect(errors).toEqual([]);
  });

  test('a damaged save counts as no best', async ({ page }) => {
    await page.addInitScript(
      (key) => window.localStorage.setItem(key, '{"version":1,"best":'),
      SAVE_KEY,
    );
    const errors = await openTitle(page);
    expect(await visibleTexts(page)).toContain('Best: 0');
    expect(errors).toEqual([]);
  });

  test('it shows the speaker button, which is on at the start', async ({ page }) => {
    await openTitle(page);
    expect(await muteState(page)).toEqual(ON);
  });
});

test.describe('starting a round', () => {
  test('clicking Play starts the Game scene at throw 1', async ({ page }) => {
    const errors = await openTitle(page, '?seed=7');

    const at = await playPoint(page);
    await page.mouse.click(at.x, at.y);

    await expectRoundStarted(page);
    expect((await gameState(page)).seed).toBe(7);
    expect(errors).toEqual([]);
  });

  test('Space starts it, and does not also throw the bottle', async ({ page }) => {
    const errors = await openTitle(page, '?seed=7');

    await page.keyboard.press('Space');

    await expectRoundStarted(page);
    // The bottle is still in the hand a while later: nothing was thrown, and the bar is untouched.
    await page.waitForTimeout(300);
    expect(await gameState(page)).toMatchObject({ phase: 'aiming', throws: 0, power: 50 });
    expect(errors).toEqual([]);
  });

  test('Enter starts it', async ({ page }) => {
    const errors = await openTitle(page, '?seed=7');

    await page.keyboard.press('Enter');

    await expectRoundStarted(page);
    expect(errors).toEqual([]);
  });

  test('Space held down starts it once and throws nothing: the auto-repeat is ignored', async ({
    page,
  }) => {
    const errors = await openTitle(page, '?seed=7');
    const repeats = await recordKeydownRepeats(page);

    await page.keyboard.down('Space');
    await expectRoundStarted(page);
    for (let i = 0; i < 3; i++) {
      await page.keyboard.down('Space');
      await settleInput(page);
    }
    expect(await repeats()).toEqual([false, true, true, true]); // the repeats really were sent
    expect(await gameState(page)).toMatchObject({ phase: 'aiming', throws: 0 });

    // Let go: still nothing thrown, and the next press is a throw, as in any round.
    await page.keyboard.up('Space');
    await settleInput(page);
    expect(await gameState(page)).toMatchObject({ phase: 'aiming', throws: 0 });
    await page.keyboard.press('Space');
    await expect.poll(async () => (await gameState(page)).phase).toBe('flying');
    expect(errors).toEqual([]);
  });

  test('nothing else starts it: a click away from Play, other keys, the wheel', async ({
    page,
  }) => {
    const errors = await openTitle(page, '?seed=7');

    const away = await gamePoint(page, 200, 560);
    await page.mouse.click(away.x, away.y);
    await page.keyboard.press('KeyR');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Escape');
    await page.mouse.wheel(0, -120);
    await settleInput(page);

    expect(await activeScenes(page)).toEqual(['Title']);
    expect(await page.evaluate(() => window.__FLIPPER__!.state())).toBeNull();
    expect(errors).toEqual([]);
  });

  test('pressing Play but letting go elsewhere does not start it', async ({ page }) => {
    const errors = await openTitle(page, '?seed=7');

    const at = await playPoint(page);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x - 400, at.y + 150);
    await page.mouse.up();
    await settleInput(page);

    expect(await activeScenes(page)).toEqual(['Title']);
    expect(errors).toEqual([]);
  });

  test('the round it starts plays as usual: Space throws, the HUD counts', async ({ page }) => {
    const errors = await openTitle(page, '?seed=7');
    await page.keyboard.press('Enter');
    await expectRoundStarted(page);

    await page.keyboard.press('Space');
    await expect.poll(async () => (await gameState(page)).phase).toBe('flying');
    expect((await gameState(page)).throws).toBe(1);
    expect(errors).toEqual([]);
  });
});

test.describe('back from the round summary', () => {
  /** Play a round of `poses.length` throws from the title and stop with the summary open. */
  async function playRoundToSummary(page: Page, poses: PlacedPose[]) {
    await page.evaluate(
      (n) => window.__FLIPPER__!.setTuningValue('throwsPerRound', n),
      poses.length,
    );
    await page.keyboard.press('Enter');
    await expect.poll(() => activeScenes(page)).toEqual(['Game']);
    await playThrows(page, poses);
    await next(page);
    await expect.poll(() => activeScenes(page)).toEqual(['Summary']);
  }

  const titleButtonPoint = (page: Page) =>
    gamePoint(page, SUMMARY_LAYOUT.title.x, SUMMARY_LAYOUT.title.y);

  test('the Title button returns to the Title, which shows the updated best score', async ({
    page,
  }) => {
    await saveBest(page, 1);
    const errors = await openTitle(page, '?seed=7');
    expect(await visibleTexts(page)).toContain('Best: 1');

    await playRoundToSummary(page, [flipped(3)]);
    expect(await visibleTexts(page)).toEqual(
      expect.arrayContaining(['Title', 'Best: 3', 'New best!']),
    );
    const at = await titleButtonPoint(page);
    await page.mouse.click(at.x, at.y);

    await expect.poll(() => activeScenes(page)).toEqual(['Title']);
    expect(await visibleTexts(page)).toEqual(expect.arrayContaining(['Flipsy', 'Play', 'Best: 3']));
    expect(await visibleTexts(page)).not.toContain('Best: 1');
    expect(await visibleTexts(page)).not.toContain('Round over');
    // The finished round is gone: no simulation runs, and the saved best is the one shown.
    expect(await page.evaluate(() => window.__FLIPPER__!.state())).toBeNull();
    expect(await savedEntry(page)).toEqual({ version: 1, best: 3, muted: false, seenHowTo: true });
    expect(errors).toEqual([]);
  });

  test('a round that did not beat the best leaves the old best on the Title', async ({ page }) => {
    await saveBest(page, 12);
    const errors = await openTitle(page, '?seed=7');

    await playRoundToSummary(page, [flipped(2)]);
    const at = await titleButtonPoint(page);
    await page.mouse.click(at.x, at.y);

    await expect.poll(() => activeScenes(page)).toEqual(['Title']);
    expect(await visibleTexts(page)).toContain('Best: 12');
    expect(errors).toEqual([]);
  });

  test('Play on the Title then starts a brand-new game: throw 1, nothing thrown, nothing scored', async ({
    page,
  }) => {
    const errors = await openTitle(page, '?seed=7');
    await playRoundToSummary(page, [flipped(3)]);
    const at = await titleButtonPoint(page);
    await page.mouse.click(at.x, at.y);
    await expect.poll(() => activeScenes(page)).toEqual(['Title']);

    const play = await playPoint(page);
    await page.mouse.click(play.x, play.y);

    await expect.poll(() => activeScenes(page)).toEqual(['Game']);
    await settleInput(page);
    // One throw per round was set above, so the round length shows it is the same game settings,
    // but the books are new (`throws` counts from 0 again).
    expect(await gameState(page)).toMatchObject({
      phase: 'aiming',
      throwNumber: 1,
      throws: 0,
      score: 0,
      landings: 0,
      streak: 0,
    });
    expect(errors).toEqual([]);
  });

  test('Play again is still beside it, and clicking it stays in the Game scene', async ({
    page,
  }) => {
    const errors = await openTitle(page, '?seed=7');
    await playRoundToSummary(page, [flipped(1)]);
    expect(SUMMARY_LAYOUT.playAgain.x).toBeLessThan(SUMMARY_LAYOUT.title.x);

    const at = await gamePoint(page, SUMMARY_LAYOUT.playAgain.x, SUMMARY_LAYOUT.playAgain.y);
    await page.mouse.click(at.x, at.y);

    await expect.poll(() => activeScenes(page)).toEqual(['Game']);
    expect(errors).toEqual([]);
  });

  test('Enter and Space on the summary still mean Play again, not Title', async ({ page }) => {
    const errors = await openTitle(page, '?seed=7');
    await playRoundToSummary(page, [flipped(1)]);

    await page.keyboard.press('Space');

    await expect.poll(() => activeScenes(page)).toEqual(['Game']);
    expect(errors).toEqual([]);
  });
});

test.describe('the mute toggle on the title screen', () => {
  test('the speaker button changes the same setting as the M key, and saves it', async ({
    page,
  }) => {
    const errors = await openTitle(page, '?seed=7');
    expect(await muteState(page)).toEqual(ON);

    await clickMuteButton(page);
    await expect.poll(() => muteState(page)).toEqual(MUTED);
    expect(await savedEntry(page)).toEqual({ version: 1, best: 0, muted: true, seenHowTo: true });

    await page.keyboard.press('KeyM'); // the key undoes what the button did
    await expect.poll(() => muteState(page)).toEqual(ON);
    expect(await savedEntry(page)).toEqual({ version: 1, best: 0, muted: false, seenHowTo: true });

    await page.keyboard.press('KeyM'); // and the other way round
    await expect.poll(() => muteState(page)).toEqual(MUTED);
    expect(await savedEntry(page)).toEqual({ version: 1, best: 0, muted: true, seenHowTo: true });
    await clickMuteButton(page);
    await expect.poll(() => muteState(page)).toEqual(ON);
    expect(await savedEntry(page)).toEqual({ version: 1, best: 0, muted: false, seenHowTo: true });

    // Neither the click nor the key left the title.
    expect(await activeScenes(page)).toEqual(['Title']);
    expect(errors).toEqual([]);
  });

  test('a saved best is kept when the mute is saved, and the other way round', async ({ page }) => {
    await saveBest(page, 9);
    await openTitle(page);

    await page.keyboard.press('KeyM');
    await expect.poll(() => muteState(page)).toEqual(MUTED);

    expect(await savedEntry(page)).toEqual({ version: 1, best: 9, muted: true, seenHowTo: true });
    expect(await visibleTexts(page)).toContain('Best: 9');
  });

  test('it is remembered: after a reload the title shows the muted icon, and the round inherits it', async ({
    page,
  }) => {
    const errors = await openTitle(page);
    await clickMuteButton(page);
    await expect.poll(() => muteState(page)).toEqual(MUTED);

    await page.reload();
    await page.waitForFunction(() => window.__FLIPPER__?.ready === true);
    await expect.poll(() => muteState(page)).toEqual(MUTED);

    await page.keyboard.press('Enter');
    await expect.poll(() => activeScenes(page)).toEqual(['Game']);
    expect(await muteState(page)).toEqual(MUTED);
    expect(errors).toEqual([]);
  });

  test('a setting changed on the title is what the round and its button show', async ({ page }) => {
    const errors = await openTitle(page);
    await page.keyboard.press('KeyM');
    await expect.poll(() => muteState(page)).toEqual(MUTED);

    const at = await playPoint(page);
    await page.mouse.click(at.x, at.y);

    await expect.poll(() => activeScenes(page)).toEqual(['Game']);
    expect(await muteState(page)).toEqual(MUTED);
    expect(await page.evaluate(() => window.__FLIPPER__!.sounds())).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('a click on the speaker does not start the round, and Play still does after it', async ({
    page,
  }) => {
    const errors = await openTitle(page, '?seed=7');

    await clickMuteButton(page);
    await settleInput(page);
    expect(await activeScenes(page)).toEqual(['Title']);

    const at = await playPoint(page);
    await page.mouse.click(at.x, at.y);
    await expectRoundStarted(page);
    expect(errors).toEqual([]);
  });
});
