import { expect, test, type Page } from '@playwright/test';
import { FLIPPED, SIDE, type PlacedPose } from '../shared';
import { openGame, stepFrames, stepUntilOutcome, visibleTexts } from './helpers';

/** A single flip (`FLIPPED` is credited one turn): one point. */
const SUCCESS_MESSAGE = 'Nailed it! +1';
const FAIL_MESSAGE = 'Down!';

/** Release the bottle at `pose` and step to the step that decides its outcome (clock paused). */
async function land(page: Page, pose: PlacedPose) {
  await page.evaluate(() => window.__FLIPPER__!.pause());
  await page.evaluate((p) => window.__FLIPPER__!.placeBottle(p), pose);
  return stepUntilOutcome(page);
}

test('texts() lists the score and the power bar before anything is thrown, and no message', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  const texts = await visibleTexts(page);
  expect(texts).toContain('Score: 0');
  expect(texts).toContain('POWER'); // other scenes' texts are listed too
  expect(texts).toContain('50%');
  expect(texts).not.toContain(SUCCESS_MESSAGE);
  expect(texts).not.toContain(FAIL_MESSAGE);
  expect(errors).toEqual([]);
});

test('a single flip shows "Nailed it! +1" and the new score', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  const decided = await land(page, FLIPPED);
  expect(decided.outcome).toMatchObject({ result: 'success' });

  const texts = await visibleTexts(page);
  expect(texts).toContain(SUCCESS_MESSAGE);
  expect(texts).toContain('Score: 1');
  expect(texts).not.toContain(FAIL_MESSAGE);
  expect(texts).not.toContain('Score: 0');
  expect(errors).toEqual([]);
});

test('a fail shows "Down!" and leaves the score as it was', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');

  // A fail on a fresh game: the score stays 0.
  await land(page, SIDE);
  let texts = await visibleTexts(page);
  expect(texts).toContain(FAIL_MESSAGE);
  expect(texts).toContain('Score: 0');
  expect(texts).not.toContain(SUCCESS_MESSAGE);

  // A fail after a success: the score stays 1.
  await page.evaluate(() => window.__FLIPPER__!.skip());
  await land(page, FLIPPED);
  expect(await visibleTexts(page)).toContain('Score: 1');
  await page.evaluate(() => window.__FLIPPER__!.skip());
  const decided = await land(page, SIDE);
  expect(decided).toMatchObject({ score: 1, outcome: { result: 'fail' } });
  texts = await visibleTexts(page);
  expect(texts).toContain(FAIL_MESSAGE);
  expect(texts).toContain('Score: 1');
  expect(texts).not.toContain(SUCCESS_MESSAGE);
  expect(errors).toEqual([]);
});

test('a real throw shows the message and the score that match its outcome', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());
  await page.evaluate(() => window.__FLIPPER__!.throwBottle(50));
  const decided = await stepUntilOutcome(page);

  // The message names the flip and the points; the score is what the throw earned.
  const { result, reason, points } = decided.outcome!;
  const texts = await visibleTexts(page);
  if (result === 'success') {
    expect(texts.some((text) => text.endsWith(`+${points}`))).toBe(true);
    expect(texts).not.toContain(FAIL_MESSAGE);
    expect(texts).not.toContain('No flip!');
  } else {
    expect(texts).toContain(reason === 'noFlip' ? 'No flip!' : FAIL_MESSAGE);
    expect(points).toBe(0);
  }
  expect(texts).toContain(`Score: ${points}`);
  expect(errors).toEqual([]);
});

for (const [name, pose, message] of [
  ['success', FLIPPED, SUCCESS_MESSAGE],
  ['fail', SIDE, FAIL_MESSAGE],
] as const) {
  test(`the ${name} message stays for the whole wait and goes with the next bottle`, async ({
    page,
  }) => {
    const errors = await openGame(page, '?seed=7');
    await land(page, pose);
    expect(await visibleTexts(page)).toContain(message);

    // 40 frames on, the flash is gone but the message is still up (a result lasts 60 steps).
    expect((await stepFrames(page, 40)).phase).toBe('result');
    expect(await visibleTexts(page)).toContain(message);
    expect((await stepFrames(page, 19)).phase).toBe('result');
    expect(await visibleTexts(page)).toContain(message);

    // The 60th step brings the next bottle, and the message goes with the old one.
    expect((await stepFrames(page, 1)).phase).toBe('aiming');
    const texts = await visibleTexts(page);
    expect(texts).not.toContain(SUCCESS_MESSAGE);
    expect(texts).not.toContain(FAIL_MESSAGE);
    expect(texts.some((text) => text.startsWith('Score: '))).toBe(true); // the score stays
    expect(errors).toEqual([]);
  });

  test(`skip() removes the ${name} message at once`, async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await land(page, pose);
    expect(await visibleTexts(page)).toContain(message);

    const skipped = await page.evaluate(() => window.__FLIPPER__!.skip());
    expect(skipped!.phase).toBe('aiming');
    const texts = await visibleTexts(page);
    expect(texts).not.toContain(SUCCESS_MESSAGE);
    expect(texts).not.toContain(FAIL_MESSAGE);
    expect(errors).toEqual([]);
  });
}

test('Space during a result removes the message, and the next result shows its own', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await land(page, SIDE);
  expect(await visibleTexts(page)).toContain(FAIL_MESSAGE);

  await page.keyboard.press('Space');
  await expect
    .poll(async () => (await visibleTexts(page)).includes(FAIL_MESSAGE), { timeout: 5000 })
    .toBe(false);

  const decided = await land(page, FLIPPED);
  expect(decided.outcome).toMatchObject({ result: 'success' });
  const texts = await visibleTexts(page);
  expect(texts).toContain(SUCCESS_MESSAGE);
  expect(texts).not.toContain(FAIL_MESSAGE);
  expect(texts).toContain('Score: 1');
  expect(errors).toEqual([]);
});

test('in real time the message appears with the result and goes when the next bottle comes', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate((pose) => window.__FLIPPER__!.placeBottle(pose), FLIPPED);
  // About 0.5 s to stand still, then the message; 1 s later the next bottle.
  await expect
    .poll(async () => (await visibleTexts(page)).includes(SUCCESS_MESSAGE), { timeout: 10_000 })
    .toBe(true);
  expect(await visibleTexts(page)).toContain('Score: 1');
  await expect
    .poll(async () => (await visibleTexts(page)).includes(SUCCESS_MESSAGE), { timeout: 10_000 })
    .toBe(false);
  expect(await visibleTexts(page)).toContain('Score: 1');
  expect(errors).toEqual([]);
});
