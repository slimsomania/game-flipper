/*
 * Helpers for the e2e tests that play through a round (`round.spec.ts`, `summary.spec.ts`): throw
 * bottles by placing them at a pose with the clock paused, and move on to the next one.
 */
import type { Page } from '@playwright/test';
import type { PlacedPose } from '../shared';
import { stepUntilOutcome } from './helpers';

/** Throw the held bottle by placing it at `pose` and step (clock paused) to its outcome. */
export async function land(page: Page, pose: PlacedPose) {
  await page.evaluate(() => window.__FLIPPER__!.pause());
  await page.evaluate((p) => window.__FLIPPER__!.placeBottle(p), pose);
  return stepUntilOutcome(page);
}

/** Skip the result wait: the next bottle appears (or the round ends after the last throw). */
export async function next(page: Page) {
  return page.evaluate(() => window.__FLIPPER__!.skip());
}

/**
 * Play the throws at `poses` in order, skipping each result's wait except the last: the last
 * throw is left in its `result` phase, so the test decides how the round ends (a skip, the wait
 * running out, a key).
 */
export async function playThrows(page: Page, poses: readonly PlacedPose[]): Promise<void> {
  for (let i = 0; i < poses.length; i++) {
    await land(page, poses[i]);
    if (i < poses.length - 1) await next(page);
  }
}

/** The keys of the scenes that are running now. */
export async function activeScenes(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__FLIPPER__!.activeScenes());
}
