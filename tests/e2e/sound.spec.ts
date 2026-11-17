import { expect, test, type Page } from '@playwright/test';
import { findWindows, sweepPowers, widestWindow } from '../../src/core/flipWindow';
import { Simulation } from '../../src/core/simulation';
import { TABLE_CENTER_X, TABLE_TOP_Y } from '../../src/core/table';
import { DEFAULT_TUNING } from '../../src/core/tuning';
import { gameState, openGame, settleInput, stepUntilOutcome } from './helpers';
import {
  contextStates,
  soundNames,
  sounds,
  trackAudioContexts,
  watchAudioConsole,
} from './soundHelpers';

/*
 * The sound effects (F016): what the game plays for a throw, a landing and its outcome, and that
 * the browser's audio only starts after the first click or key press. The sounds are read from the
 * test hook `sounds()` (what the game played) and from a tracker on the page's AudioContexts (what
 * the browser was asked to start). The sweep finds a power that lands, rather than writing one here.
 */

const WATER = 0.5;
const single = widestWindow(findWindows(sweepPowers(WATER)), 1)!;
const LANDS = Math.round(single.center);
/** Power 0 is a plain drop: it stands up without a turn, which is the fail "No flip!". */
const DROPS = 0;
const MIN_GAP_TICKS = Math.round(DEFAULT_TUNING.knockGapSeconds * 60);

/** Open the game with the audio watchers on. Returns the lists to assert empty at the end. */
async function open(page: Page, query = '?seed=7') {
  await trackAudioContexts(page);
  const audio = watchAudioConsole(page);
  const errors = await openGame(page, query);
  return { errors, audio };
}

/** Set the held bottle and the power bar, then throw with a real Space press (clock paused). */
async function spaceThrow(page: Page, power: number) {
  await page.evaluate(
    ([water, p]) => {
      window.__FLIPPER__!.pause();
      window.__FLIPPER__!.setWater(water);
      window.__FLIPPER__!.setPower(p);
    },
    [WATER, power],
  );
  await page.keyboard.press('Space');
  await expect.poll(async () => (await gameState(page)).phase).toBe('flying');
  return stepUntilOutcome(page);
}

test('before any input there is no sound and no AudioContext, and moving or scrolling the mouse changes nothing', async ({
  page,
}) => {
  const { errors, audio } = await open(page);
  expect(await contextStates(page)).toEqual([]);
  expect(await sounds(page)).toEqual([]);

  await page.mouse.move(400, 300);
  await page.mouse.move(900, 200);
  await page.mouse.wheel(0, -100);
  await settleInput(page);
  expect(await contextStates(page)).toEqual([]);
  expect(errors).toEqual([]);
  expect(audio).toEqual([]);
});

test('the first key press creates one running AudioContext, and more key presses make no more', async ({
  page,
}) => {
  const { errors, audio } = await open(page);
  expect((await contextStates(page)).filter((s) => s === 'running')).toEqual([]);

  await page.keyboard.press('ArrowUp');
  await expect.poll(() => contextStates(page)).toEqual(['running']);

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await settleInput(page);
  expect(await contextStates(page)).toEqual(['running']);
  expect(errors).toEqual([]);
  expect(audio).toEqual([]);
});

test('the first click creates one running AudioContext, and does not throw the bottle', async ({
  page,
}) => {
  const { errors, audio } = await open(page);
  expect(await contextStates(page)).toEqual([]);

  await page.mouse.click(1100, 200); // an empty part of the canvas: not on the bottle
  await expect.poll(() => contextStates(page)).toEqual(['running']);
  await settleInput(page);
  expect((await gameState(page)).phase).toBe('aiming');
  expect(errors).toEqual([]);
  expect(audio).toEqual([]);
});

test('a throw made by a hook before any input is logged, but starts no AudioContext', async ({
  page,
}) => {
  const { errors, audio } = await open(page);
  await page.evaluate(() => window.__FLIPPER__!.throwBottle(50));
  await expect.poll(() => soundNames(page)).toEqual(['whoosh']);
  expect(await contextStates(page)).toEqual([]);
  expect(errors).toEqual([]);
  expect(audio).toEqual([]);
});

test('a Space throw plays a whoosh, then knocks when it lands, then a chime for an upright landing', async ({
  page,
}) => {
  const { errors, audio } = await open(page);
  const decided = await spaceThrow(page, LANDS);
  expect(decided.outcome).toMatchObject({ result: 'success', reason: 'upright' });

  const played = await sounds(page);
  const names = played.map((s) => s.name);
  expect(names[0]).toBe('whoosh');
  expect(names.filter((n) => n === 'knock').length).toBeGreaterThanOrEqual(1);
  expect(names.at(-1)).toBe('chime');
  expect(names.filter((n) => n === 'chime')).toHaveLength(1);
  expect(names).not.toContain('thud');
  // In the order they happened: the sounds' ticks never go backward, and the chime is the outcome.
  const ticks = played.map((s) => s.tick);
  expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
  expect(played.at(-1)!.tick).toBe(decided.tick);
  for (const sound of played) {
    expect(sound.volume).toBeGreaterThan(0);
    expect(sound.volume).toBeLessThanOrEqual(1);
  }
  expect(await contextStates(page)).toEqual(['running']);
  expect(errors).toEqual([]);
  expect(audio).toEqual([]);
});

test('a failed Space throw plays a whoosh, a knock and a thud, and no chime', async ({ page }) => {
  const { errors, audio } = await open(page);
  const decided = await spaceThrow(page, DROPS);
  expect(decided.outcome).toMatchObject({ result: 'fail' });

  const names = await soundNames(page);
  expect(names[0]).toBe('whoosh');
  expect(names).toContain('knock');
  expect(names.at(-1)).toBe('thud');
  expect(names.filter((n) => n === 'thud')).toHaveLength(1);
  expect(names).not.toContain('chime');
  expect(errors).toEqual([]);
  expect(audio).toEqual([]);
});

test('a throw in real time (the clock running) plays its sounds through to the outcome', async ({
  page,
}) => {
  const { errors, audio } = await open(page);
  await page.keyboard.press('Space'); // power 50 with this seed's first bottle
  await page.waitForFunction(() => window.__FLIPPER__!.state()?.phase === 'result');
  const outcome = (await gameState(page)).outcome!;

  const names = await soundNames(page);
  expect(names[0]).toBe('whoosh');
  expect(names).toContain('knock');
  expect(names.at(-1)).toBe(outcome.result === 'success' ? 'chime' : 'thud');
  expect(names.filter((n) => n === 'chime' || n === 'thud')).toHaveLength(1);
  expect(await contextStates(page)).toEqual(['running']);
  expect(errors).toEqual([]);
  expect(audio).toEqual([]);
});

test('a harder impact is a louder knock', async ({ page }) => {
  const { errors, audio } = await open(page);
  await page.evaluate(() => window.__FLIPPER__!.pause());
  const firstKnock = async (height: number, since: number) => {
    await page.evaluate(
      ([x, y]) => window.__FLIPPER__!.placeBottle({ x, y, angle: 0 }),
      [TABLE_CENTER_X, TABLE_TOP_Y - height],
    );
    await stepUntilOutcome(page);
    const all = await sounds(page);
    return all.slice(since).find((s) => s.name === 'knock');
  };

  const gentle = await firstKnock(0.1, 0);
  await page.evaluate(() => window.__FLIPPER__!.skip());
  const before = (await sounds(page)).length;
  const hard = await firstKnock(2, before);

  expect(gentle).toBeDefined();
  expect(hard).toBeDefined();
  expect(hard!.volume).toBeGreaterThan(gentle!.volume);
  expect(errors).toEqual([]);
  expect(audio).toEqual([]);
});

test('an impact below the minimum speed makes no knock, and one above it does', async ({
  page,
}) => {
  const { errors, audio } = await open(page);
  await page.evaluate(() => {
    window.__FLIPPER__!.pause();
    window.__FLIPPER__!.setTuningValue('knockMinSpeed', 2);
  });
  const drop = async (height: number) => {
    await page.evaluate(
      ([x, y]) => window.__FLIPPER__!.placeBottle({ x, y, angle: 0 }),
      [TABLE_CENTER_X, TABLE_TOP_Y - height],
    );
    await stepUntilOutcome(page);
  };

  await drop(0.1); // arrives at about 1.4 m/s: under the minimum of 2
  expect(await soundNames(page)).toEqual(['thud']); // the outcome still sounds, the tap doesn't

  await page.evaluate(() => window.__FLIPPER__!.skip());
  await drop(1.5); // arrives at about 5.4 m/s
  expect((await soundNames(page)).slice(1)).toEqual(['knock', 'thud']);
  expect(errors).toEqual([]);
  expect(audio).toEqual([]);
});

test('the minimum impact speed is in the tuning: raised, a normal landing makes no knock', async ({
  page,
}) => {
  const { errors, audio } = await open(page);
  await page.evaluate(
    ([water, min]) => {
      window.__FLIPPER__!.pause();
      window.__FLIPPER__!.setTuningValue('knockMinSpeed', min);
      window.__FLIPPER__!.setWater(water);
    },
    [WATER, 100],
  );
  await page.evaluate((power) => window.__FLIPPER__!.throwBottle(power), LANDS);
  await stepUntilOutcome(page);
  expect(await soundNames(page)).toEqual(['whoosh', 'chime']);
  expect(errors).toEqual([]);
  expect(audio).toEqual([]);
});

test('no two knocks sound within 100 ms, though the bottle hits the table more often than that', async ({
  page,
}) => {
  const seed = 2;
  const powers = [30, 60, 80, 100, 20, 70];
  const { errors, audio } = await open(page, `?seed=${seed}`);
  await page.evaluate(() => window.__FLIPPER__!.pause());
  for (const power of powers) {
    await page.evaluate((p) => window.__FLIPPER__!.throwBottle(p), power);
    await stepUntilOutcome(page);
    await page.evaluate(() => window.__FLIPPER__!.skip());
  }
  const knocks = (await sounds(page)).filter((s) => s.name === 'knock');

  // The same throws in the core simulation: every impact that is loud enough to sound.
  const sim = new Simulation({ seed });
  const loud: number[] = [];
  for (const power of powers) {
    sim.throwBottle(power);
    while (sim.phase === 'flying') sim.step();
    sim.skip();
    for (const event of sim.drainEvents()) {
      if (event.type === 'impact' && event.speed >= DEFAULT_TUNING.knockMinSpeed) {
        loud.push(event.tick);
      }
    }
  }
  const crowded = loud.filter((tick, i) => i > 0 && tick - loud[i - 1] <= MIN_GAP_TICKS);
  expect(crowded.length).toBeGreaterThan(0); // the scenario really has knocks too close together

  expect(knocks.length).toBeGreaterThanOrEqual(powers.length);
  expect(knocks.length).toBeLessThan(loud.length);
  for (let i = 1; i < knocks.length; i++) {
    const milliseconds = ((knocks[i].tick - knocks[i - 1].tick) / 60) * 1000;
    expect(milliseconds).toBeGreaterThan(100);
  }
  expect(errors).toEqual([]);
  expect(audio).toEqual([]);
});
