import type { Page } from '@playwright/test';
import type { SimSnapshot } from '../../src/core/simulation';

/**
 * Opens the game and waits until it accepts input. Returns a live list of console and page
 * errors; assert it is empty at the end of the test.
 */
export async function openGame(page: Page, query = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__FLIPPER__?.ready === true);
  return errors;
}

/** Current simulation snapshot. Throws if no game scene is running. */
export async function gameState(page: Page): Promise<SimSnapshot> {
  const state = await page.evaluate(() => window.__FLIPPER__!.state());
  if (!state) throw new Error('No simulation is running (is the Game scene active?)');
  return state;
}

/**
 * Freeze the real-time clock and step one frame at a time until the throw's outcome is decided (at
 * most `limit` frames). Returns the snapshot of that very step, with the phase `result`: the
 * thrown bottle is replaced 90 steps later, so tests that look at where it landed stop here.
 */
export async function stepUntilOutcome(page: Page, limit = 400): Promise<SimSnapshot> {
  const state = await page.evaluate((max) => {
    const hooks = window.__FLIPPER__!;
    hooks.pause();
    let snapshot = hooks.state();
    for (let i = 0; i < max && snapshot && snapshot.outcome === null; i++) snapshot = hooks.step(1);
    return snapshot;
  }, limit);
  if (!state) throw new Error('No simulation is running (is the Game scene active?)');
  return state;
}

/** Freeze the real-time clock and advance the simulation by exactly `frames` fixed steps. */
export async function stepFrames(page: Page, frames: number): Promise<SimSnapshot> {
  const state = await page.evaluate((n) => {
    window.__FLIPPER__!.pause();
    return window.__FLIPPER__!.step(n);
  }, frames);
  if (!state) throw new Error('No simulation is running (is the Game scene active?)');
  return state;
}
