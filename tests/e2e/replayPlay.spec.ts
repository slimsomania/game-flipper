import { expect, test, type Page } from '@playwright/test';
import { FLIPPED } from '../shared';
import { gameState, openGame, stepFrames } from './helpers';
import { land, playThrows } from './roundHelpers';

/*
 * The slow-motion replay of the landing (F027): after the result delay the landing clip plays at
 * the replay speed with a "Replay" label, then the next bottle appears; Space or a click skips it.
 */

async function withReplay(page: Page): Promise<string[]> {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.setTuningValue('replaySpeed', 0.4));
  return errors;
}

test('the replay plays after the result delay with a Replay label, then the next bottle appears', async ({
  page,
}) => {
  const errors = await withReplay(page);
  const decided = await land(page, FLIPPED);
  const clip = await page.evaluate(() => window.__FLIPPER__!.landingClip().length);
  expect(clip).toBeGreaterThan(0);
  const replaySteps = Math.ceil(clip / 0.4);

  const before = await stepFrames(page, 59);
  expect(before.replay).toBeNull();
  const during = await stepFrames(page, 3);
  expect(during.phase).toBe('result');
  expect(during.replay).not.toBeNull();
  await page.waitForFunction(() => window.__FLIPPER__!.texts().includes('Replay'));

  const nearEnd = await stepFrames(page, replaySteps - 3);
  expect(nearEnd.phase).toBe('result');
  const next = await stepFrames(page, 1);
  expect(next).toMatchObject({ phase: 'aiming', tick: decided.tick + 60 + replaySteps });
  expect(next.replay).toBeNull();
  expect(errors).toEqual([]);
});

test('Space during the replay brings the next bottle at once', async ({ page }) => {
  const errors = await withReplay(page);
  await land(page, FLIPPED);
  expect((await stepFrames(page, 70)).replay).not.toBeNull();
  await page.keyboard.press('Space');
  await expect.poll(async () => (await gameState(page)).phase).toBe('aiming');
  expect(errors).toEqual([]);
});

test('a click during the replay brings the next bottle at once', async ({ page }) => {
  const errors = await withReplay(page);
  await land(page, FLIPPED);
  expect((await stepFrames(page, 70)).replay).not.toBeNull();
  await page.mouse.click(900, 100);
  await expect.poll(async () => (await gameState(page)).phase).toBe('aiming');
  expect(errors).toEqual([]);
});

test('after the 10th throw the replay leads to the round summary', async ({ page }) => {
  const errors = await withReplay(page);
  await playThrows(page, Array(10).fill(FLIPPED));
  expect((await gameState(page)).phase).toBe('result');
  expect((await stepFrames(page, 70)).replay).not.toBeNull();
  await stepFrames(page, 200);
  await page.waitForFunction(() => window.__FLIPPER__!.activeScenes().includes('Summary'));
  expect(errors).toEqual([]);
});
