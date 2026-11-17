import { expect, test, type Page } from '@playwright/test';
import { SIDE, UPRIGHT } from '../shared';
import { openGame, stepFrames, stepUntilOutcome, visibleTexts } from './helpers';

const SUCCESS_MESSAGE = 'Nailed it!';
const FAIL_MESSAGE = 'Down!';

/** Release the bottle at `pose` and step to the step that decides its outcome (clock paused). */
async function land(page: Page, pose: typeof UPRIGHT) {
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

test('a success shows "Nailed it!" and the new score', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  const decided = await land(page, UPRIGHT);
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
  await land(page, UPRIGHT);
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

  const won = decided.outcome!.result === 'success';
  const texts = await visibleTexts(page);
  expect(texts).toContain(won ? SUCCESS_MESSAGE : FAIL_MESSAGE);
  expect(texts).not.toContain(won ? FAIL_MESSAGE : SUCCESS_MESSAGE);
  expect(texts).toContain(`Score: ${won ? 1 : 0}`);
  expect(errors).toEqual([]);
});

for (const [name, pose, message] of [
  ['success', UPRIGHT, SUCCESS_MESSAGE],
  ['fail', SIDE, FAIL_MESSAGE],
] as const) {
  test(`the ${name} message stays for the whole wait and goes with the next bottle`, async ({
    page,
  }) => {
    const errors = await openGame(page, '?seed=7');
    await land(page, pose);
    expect(await visibleTexts(page)).toContain(message);

    // 40 frames on, the flash is long gone but the message is still up (a result lasts 90 steps).
    expect((await stepFrames(page, 40)).phase).toBe('result');
    expect(await visibleTexts(page)).toContain(message);
    expect((await stepFrames(page, 49)).phase).toBe('result');
    expect(await visibleTexts(page)).toContain(message);

    // The 90th step brings the next bottle, and the message goes with the old one.
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

  const decided = await land(page, UPRIGHT);
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
  await page.evaluate((pose) => window.__FLIPPER__!.placeBottle(pose), UPRIGHT);
  // About 1 s to stand still, then the message; 1.5 s later the next bottle.
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
