import { expect, test, type Page } from '@playwright/test';
import { GAME_HEIGHT, GAME_WIDTH } from '../../src/core/constants';
import { TABLE_CENTER_X, TABLE_TOP_Y } from '../../src/core/table';
import { burstCount } from '../../src/game/effects/effectPlan';
import { OVERSCAN_PX } from '../../src/game/effects/effects';
import { CAP, FLIPPED, SIDE, UPRIGHT, flipped, type PlacedPose } from '../shared';
import { gameState, openGame, settleInput, stepFrames, stepUntilOutcome } from './helpers';

/*
 * The small effects (F021): a camera shake on an impact, a burst of particles on a success and the
 * result message popping in. They are read from the test hooks `effects()` (what the game asked
 * for, with its strength), `cameraOffset()` (where the camera is) and `textBounds()` (the box of
 * each visible text). Everything runs on the paused test clock, so the frames are exact.
 */

interface Effect {
  name: 'shake' | 'burst' | 'capBurst' | 'pop';
  intensity: number;
  tick: number;
}

/** The effects the game has played so far, read after the scene has had a frame to see the events. */
async function effects(page: Page): Promise<Effect[]> {
  await settleInput(page);
  return page.evaluate(() => window.__FLIPPER__!.effects());
}

async function cameraOffset(page: Page): Promise<{ x: number; y: number } | null> {
  await settleInput(page);
  return page.evaluate(() => window.__FLIPPER__!.cameraOffset());
}

/** The cap on the shake, from the tuning in effect. */
const shakeCap = (page: Page): Promise<number> =>
  page.evaluate(() => window.__FLIPPER__!.tuning().shakeMaxPixels);

/** Drop an upright bottle (a "No flip!" fail in the end) from `height` m above the table at `vy` m/s. */
const DROP_HEIGHT = 0.05;
async function place(page: Page, pose: PlacedPose, vy = 0): Promise<void> {
  await page.evaluate(
    (p) => {
      window.__FLIPPER__!.pause();
      window.__FLIPPER__!.placeBottle(p);
    },
    { ...pose, vy },
  );
}

/** Place a bottle, step to its outcome and return the effects that landing made (and the outcome tick). */
async function landing(page: Page, pose: PlacedPose, vy = 0) {
  const before = (await effects(page)).length;
  await place(page, pose, vy);
  const outcome = await stepUntilOutcome(page);
  const made = (await effects(page)).slice(before);
  return { made, outcomeTick: outcome.tick };
}

const shakesOf = (list: Effect[]) => list.filter((effect) => effect.name === 'shake');
const namesOf = (list: Effect[]) => list.map((effect) => effect.name);

const dropFrom = (height: number): PlacedPose => ({
  x: TABLE_CENTER_X,
  y: TABLE_TOP_Y - height,
  angle: 0,
});

test('a hard landing logs a stronger shake than a gentle one, both within the cap', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  const cap = await shakeCap(page);
  expect(cap).toBeGreaterThan(0);

  const gentle = shakesOf((await landing(page, dropFrom(0.2))).made);
  expect(gentle.length).toBeGreaterThan(0);
  await page.evaluate(() => window.__FLIPPER__!.skip());

  const hard = shakesOf((await landing(page, dropFrom(DROP_HEIGHT), 9)).made);
  expect(hard.length).toBeGreaterThan(0);

  // The first impact of each is the landing; later bounces are softer.
  expect(hard[0].intensity).toBeGreaterThan(gentle[0].intensity);
  expect(gentle[0].intensity).toBeGreaterThan(0);
  for (const shake of [...gentle, ...hard]) {
    expect(shake.intensity).toBeGreaterThan(0);
    expect(shake.intensity).toBeLessThanOrEqual(cap);
  }
  expect(hard[0].intensity).toBeCloseTo(cap, 6);
  expect(errors).toEqual([]);
});

test('a harder drop shakes more than a gentler one, and never over the cap', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  const cap = await shakeCap(page);
  const strengths: number[] = [];
  for (const [height, vy] of [
    [0.1, 0],
    [0.3, 0],
    [0.05, 4],
    [0.05, 6],
  ] as const) {
    const made = (await landing(page, dropFrom(height), vy)).made;
    strengths.push(shakesOf(made)[0].intensity);
    await page.evaluate(() => window.__FLIPPER__!.skip());
  }
  for (let i = 1; i < strengths.length; i++) {
    expect(strengths[i]).toBeGreaterThan(strengths[i - 1]);
  }
  expect(Math.max(...strengths)).toBeLessThanOrEqual(cap);
  expect(errors).toEqual([]);
});

test('a bottle standing still triggers no shake: in the hand, or resting on the table', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());
  await stepFrames(page, 120);
  expect(await effects(page)).toEqual([]);
  expect(await cameraOffset(page)).toEqual({ x: 0, y: 0 });

  // Set down on the tabletop with no speed at all: it never lands, so nothing shakes.
  await place(page, { x: TABLE_CENTER_X, y: TABLE_TOP_Y, angle: 0 });
  await stepFrames(page, 25);
  expect(shakesOf(await effects(page))).toEqual([]);
  expect(await cameraOffset(page)).toEqual({ x: 0, y: 0 });
  expect(errors).toEqual([]);
});

test('a success logs a burst of particles and a fail does not', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');

  const win = await landing(page, FLIPPED);
  const bursts = win.made.filter((effect) => effect.name === 'burst');
  expect(bursts).toHaveLength(1);
  expect(bursts[0].intensity).toBe(burstCount(1));
  expect(bursts[0].tick).toBe(win.outcomeTick);
  await page.evaluate(() => window.__FLIPPER__!.skip());

  for (const pose of [UPRIGHT, SIDE]) {
    const loss = await landing(page, pose);
    expect(namesOf(loss.made)).not.toContain('burst');
    await page.evaluate(() => window.__FLIPPER__!.skip());
  }
  expect((await effects(page)).filter((effect) => effect.name === 'burst')).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('a double flip bursts with more particles than a single', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  const single = (await landing(page, FLIPPED)).made.find((effect) => effect.name === 'burst')!;
  await page.evaluate(() => window.__FLIPPER__!.skip());
  const double = (await landing(page, flipped(2))).made.find((effect) => effect.name === 'burst')!;
  expect(double.intensity).toBeGreaterThan(single.intensity);
  expect(errors).toEqual([]);
});

test('a cap landing logs its own capBurst, bigger than a triple, and no plain burst', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  const cap = await landing(page, CAP);
  const bursts = cap.made.filter((effect) => effect.name === 'capBurst');
  expect(bursts).toHaveLength(1);
  expect(bursts[0].tick).toBe(cap.outcomeTick);
  expect(bursts[0].intensity).toBeGreaterThan(burstCount(3));
  expect(namesOf(cap.made)).not.toContain('burst');
  expect(namesOf(cap.made)).toContain('pop');
  await page.evaluate(() => window.__FLIPPER__!.skip());

  // No flip ever gives the cap's cue.
  for (const pose of [FLIPPED, flipped(3), UPRIGHT, SIDE]) {
    expect(namesOf((await landing(page, pose)).made)).not.toContain('capBurst');
    await page.evaluate(() => window.__FLIPPER__!.skip());
  }
  expect(errors).toEqual([]);
});

test('the cap message is at least 1.25 times as tall as a flip message, and stays on the canvas', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  const box = async (text: string) => {
    await settleInput(page);
    const boxes = await page.evaluate(() => window.__FLIPPER__!.textBounds());
    return boxes.find((b) => b.text === text);
  };

  await place(page, FLIPPED);
  await stepUntilOutcome(page);
  await stepFrames(page, 20);
  const flip = (await box('Nailed it! +1'))!;
  expect(flip).toBeDefined();
  await page.evaluate(() => window.__FLIPPER__!.skip());

  await place(page, CAP);
  await stepUntilOutcome(page);
  expect(await page.evaluate(() => window.__FLIPPER__!.texts())).toContain('CAP! +5');
  // Through the pop and the shake: the box always stays inside the canvas.
  for (const frames of [0, 3, 3, 4, 10, 20]) {
    await stepFrames(page, frames);
    const big = (await box('CAP! +5'))!;
    expect(big).toBeDefined();
    expect(big.left).toBeGreaterThanOrEqual(0);
    expect(big.top).toBeGreaterThanOrEqual(0);
    expect(big.right).toBeLessThanOrEqual(GAME_WIDTH);
    expect(big.bottom).toBeLessThanOrEqual(GAME_HEIGHT);
  }
  const big = (await box('CAP! +5'))!;
  expect(big.bottom - big.top).toBeGreaterThanOrEqual(1.25 * (flip.bottom - flip.top));
  expect(errors).toEqual([]);
});

test('every result pops its message in, success or fail', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  const win = await landing(page, FLIPPED);
  expect(win.made.filter((effect) => effect.name === 'pop')).toEqual([
    { name: 'pop', intensity: 1, tick: win.outcomeTick },
  ]);
  await page.evaluate(() => window.__FLIPPER__!.skip());
  const loss = await landing(page, UPRIGHT);
  expect(loss.made.filter((effect) => effect.name === 'pop')).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('the log starts empty with each new game', async ({ page }) => {
  const errors = await openGame(page, '?seed=7');
  await landing(page, FLIPPED);
  expect((await effects(page)).length).toBeGreaterThan(0);
  await page.evaluate(() => window.__FLIPPER__!.startScene('Game'));
  await page.waitForFunction(() => window.__FLIPPER__!.state() !== null);
  expect(await effects(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('the camera moves during a shake, within the logged intensity, and is back at rest after half a second', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await place(page, dropFrom(DROP_HEIGHT), 9);
  await stepFrames(page, 2);
  const [shake] = shakesOf(await effects(page));
  expect(shake).toBeDefined();

  // A few steps into the shake the camera is off its rest by at most the shake's intensity.
  const moving: { x: number; y: number }[] = [];
  let tick = (await gameState(page)).tick;
  while (tick < shake.tick + 6) {
    tick = (await stepFrames(page, 1)).tick;
    moving.push((await cameraOffset(page))!);
  }
  expect(moving.some((offset) => Math.hypot(offset.x, offset.y) > 0.5)).toBe(true);
  for (const offset of moving) {
    expect(Math.abs(offset.x)).toBeLessThanOrEqual(shake.intensity + 1e-9);
    expect(Math.abs(offset.y)).toBeLessThanOrEqual(shake.intensity + 1e-9);
  }

  // 0.5 s after the hit it has long stopped.
  await stepFrames(page, shake.tick + 30 - tick);
  expect(await cameraOffset(page)).toEqual({ x: 0, y: 0 });
  expect(errors).toEqual([]);
});

test('the camera is at rest when nothing has hit the table, and pausing mid-shake leaves it at rest', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  expect(await cameraOffset(page)).toEqual({ x: 0, y: 0 });

  await place(page, dropFrom(DROP_HEIGHT), 9);
  await stepFrames(page, 2);
  const [shake] = shakesOf(await effects(page));
  await stepFrames(page, 3);
  expect(shake.tick).toBeLessThan((await gameState(page)).tick);
  const mid = (await cameraOffset(page))!;
  expect(Math.hypot(mid.x, mid.y)).toBeGreaterThan(0.1);

  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__FLIPPER__!.gamePaused())).toBe(true);
  expect(await page.evaluate(() => window.__FLIPPER__!.cameraOffset())).toEqual({ x: 0, y: 0 });
  expect(errors).toEqual([]);
});

test('no text is closer to the canvas edge than the largest shake, whatever the message', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  const cap = await shakeCap(page);
  expect(cap).toBeLessThanOrEqual(OVERSCAN_PX);

  const insideByCap = async (): Promise<void> => {
    await settleInput(page);
    const boxes = await page.evaluate(() => window.__FLIPPER__!.textBounds());
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) {
      expect(box.left, box.text).toBeGreaterThanOrEqual(cap);
      expect(box.top, box.text).toBeGreaterThanOrEqual(cap);
      expect(box.right, box.text).toBeLessThanOrEqual(GAME_WIDTH - cap);
      expect(box.bottom, box.text).toBeLessThanOrEqual(GAME_HEIGHT - cap);
    }
  };

  await insideByCap(); // aiming: the HUD and the power bar
  for (const pose of [FLIPPED, flipped(2), flipped(12), CAP, UPRIGHT, SIDE]) {
    await place(page, pose);
    await stepUntilOutcome(page);
    // At its full size and at its biggest (the pop swells it past full size for a few steps).
    for (const frames of [0, 5, 4, 10]) {
      await stepFrames(page, frames);
      await insideByCap();
    }
    await page.evaluate(() => window.__FLIPPER__!.skip());
  }
  expect(errors).toEqual([]);
});

test('the result message pops in: small at the outcome, past full size a moment later, then steady', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await place(page, FLIPPED);
  await stepUntilOutcome(page);

  const width = async (): Promise<number> => {
    await settleInput(page);
    const boxes = await page.evaluate(() => window.__FLIPPER__!.textBounds());
    const message = boxes.find((box) => box.text.includes('Nailed'))!;
    return message.right - message.left;
  };

  const atOutcome = await width();
  await stepFrames(page, 8);
  const midPop = await width();
  await stepFrames(page, 20);
  const settled = await width();
  await stepFrames(page, 10);
  const later = await width();

  expect(atOutcome).toBeLessThan(settled * 0.6);
  expect(midPop).toBeGreaterThan(atOutcome);
  expect(midPop).toBeGreaterThan(settled); // swelled past full size
  expect(later).toBeCloseTo(settled, 6); // and it stays there
  expect(errors).toEqual([]);
});
