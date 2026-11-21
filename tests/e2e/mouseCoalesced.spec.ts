import { expect, test, type Page } from '@playwright/test';
import { gameState, openGame, stepUntilOutcome } from './helpers';
import {
  above,
  bottleCenter,
  draggingNow,
  frameTimes,
  gamePoint,
  logMouse,
  mousePath,
  nextBottle,
  releaseInPage,
  sendFrames,
  sendMouse,
} from './mouseHelpers';

/*
 * The mouse push read from every pointer sample, not one per frame (F033, D21, D25). A browser
 * delivers one `pointermove` per frame, and lists the moves between frames as its coalesced events.
 * The tests make the same push (200 px up over 150 ms, a mouse that reports 125 times a second) as
 * events the way slow frames would deliver it, on a virtual clock (`mouseHelpers.ts`), with and
 * without the coalesced samples, and compare the power the game throws with.
 */

const RISE = 200;
const MS = 150;
const MOUSE_HZ = 125;

interface Delivery {
  /** The browser's frame times, ms after the press. */
  frames: number[];
  /** Whether each frame's event lists the samples since the last frame. */
  coalesced: boolean;
}

/** The delivery of a mouse reporting at `MOUSE_HZ`, one event per sample: nothing is hidden. */
const EVERY_SAMPLE: Delivery = { frames: frameTimes(1000 / MOUSE_HZ, MS), coalesced: false };

/** Press on the held bottle, push `RISE` px up over `MS` as `delivery` says, let go, and return the power thrown. */
async function pushAndRelease(page: Page, delivery: Delivery): Promise<number> {
  const at = await bottleCenter(page);
  await sendMouse(page, [{ type: 'down', x: at.x, y: at.y, after: 0 }]);
  expect(await draggingNow(page)).toBe(true);
  // The release goes in the same call as the frames: every time stamp of the push is virtual, so the
  // power does not depend on how long the calls in between take on this machine.
  await sendFrames(page, {
    x: at.x,
    path: mousePath(at, RISE, MS, MOUSE_HZ),
    ...delivery,
    release: above(at, RISE),
  });
  const thrown = await gameState(page);
  expect(thrown.throws).toBeGreaterThan(0);
  expect(thrown.dragging).toBe(false);
  return thrown.lastThrow!.power;
}

/** Throw once per delivery, in order, bringing the next bottle in between. */
async function throwEach(page: Page, deliveries: Delivery[]): Promise<number[]> {
  const powers: number[] = [];
  for (const delivery of deliveries) {
    if (powers.length > 0) await nextBottle(page);
    powers.push(await pushAndRelease(page, delivery));
  }
  return powers;
}

test('a steady push at 30 fps throws what the same push at 125 Hz throws, when each frame carries its samples', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  const slow = frameTimes(1000 / 30, MS);

  const [every, coalesced, plain] = await throwEach(page, [
    EVERY_SAMPLE,
    { frames: slow, coalesced: true },
    { frames: slow, coalesced: false },
  ]);

  expect(every).toBeGreaterThan(50); // a hard flick: most of the bar
  expect(Math.abs(coalesced - every)).toBeLessThan(2);
  // Without the in-between samples the same hand motion reads stronger: the coalesced events are
  // what reaches the game here, and they are what brings it back.
  expect(plain).toBeGreaterThan(every + 5);
  expect(errors).toEqual([]);
});

test('one 50 ms frame hitch in a push at 60 fps changes nothing when its event carries the missing samples', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  const steady = frameTimes(1000 / 60, MS);
  const hitched = frameTimes(1000 / 60, MS, { afterFrames: 2, ms: 50 });
  expect(hitched.some((t, i) => i > 0 && t - hitched[i - 1] > 49)).toBe(true); // the gap is there

  const [without, withSamples, withoutSamples] = await throwEach(page, [
    { frames: steady, coalesced: false },
    { frames: hitched, coalesced: true },
    { frames: hitched, coalesced: false },
  ]);

  expect(Math.abs(withSamples - without)).toBeLessThan(2);
  expect(withoutSamples).toBeGreaterThan(without + 8); // the hitch alone makes the push read high
  expect(errors).toEqual([]);
});

test('events with no coalesced samples throw exactly pushPower of the events the page saw', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  const log = await logMouse(page);

  // Slow frames with a hitch, so the power is not the same as for an even 125 Hz: the check has teeth.
  const frames = frameTimes(1000 / 30, MS, { afterFrames: 1, ms: 50 });
  const power = await pushAndRelease(page, { frames, coalesced: false });

  expect(power).toBeGreaterThan(1);
  expect(power).toBeCloseTo(await log.expectedPower({ release: true }), 6);
  expect(errors).toEqual([]);
});

test('the mouse event that follows a pointer event adds nothing its coalesced samples already carried', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause()); // the bar then stays at the last move's value
  const at = await bottleCenter(page);
  await sendMouse(page, [{ type: 'down', x: at.x, y: at.y, after: 0 }]);
  await sendFrames(page, {
    x: at.x,
    path: mousePath(at, RISE, MS, MOUSE_HZ),
    frames: frameTimes(1000 / 30, MS),
    coalesced: true,
  });
  const live = (await gameState(page)).power;
  expect(live).toBeGreaterThan(1);

  /** A mouse event `later` ms after the last event the page made, 100 px higher than the push ended. */
  const moveHigher = (later: number) =>
    page.evaluate(
      ({ x, y, later }) => {
        const clock = window as unknown as { __virtualNow: number };
        const event = new MouseEvent('mousemove', {
          bubbles: true,
          clientX: x,
          clientY: y,
          buttons: 1,
        });
        Object.defineProperty(event, 'timeStamp', { value: clock.__virtualNow + later });
        document.querySelector('canvas')!.dispatchEvent(event);
      },
      { x: at.x, y: at.y - RISE - 100, later },
    );

  // The same moment as the newest sample: the game has it already, whatever the event says.
  await moveHigher(0);
  expect((await gameState(page)).power).toBe(live);
  // A moment later it is a new move, and the push reads it (so the event does reach the game).
  await moveHigher(1);
  expect((await gameState(page)).power).toBeGreaterThan(live + 1);
  expect(await draggingNow(page)).toBe(true);
  expect(errors).toEqual([]);
});

test.describe('while the bottle is not grabbed, coalesced samples change nothing', () => {
  /** Move the pointer over the canvas with a hitched push's frames, each carrying its samples. */
  async function moveAbout(page: Page, x: number, y: number): Promise<void> {
    const at = { x, y };
    await sendFrames(page, {
      x,
      path: mousePath(at, RISE, MS, MOUSE_HZ),
      frames: frameTimes(1000 / 30, MS),
      coalesced: true,
    });
  }

  test('while aiming, with no press and with a press that is not on the bottle', async ({
    page,
  }) => {
    const errors = await openGame(page, '?seed=7');
    await page.evaluate(() => {
      window.__FLIPPER__!.pause();
      window.__FLIPPER__!.setPower(40);
    });
    const aiming = await gameState(page);
    const bottle = await bottleCenter(page);
    const sky = await gamePoint(page, 900, 600);

    await moveAbout(page, bottle.x, bottle.y); // over the bottle, button up
    expect(await gameState(page)).toEqual(aiming);
    await sendMouse(page, [{ type: 'down', x: sky.x, y: sky.y, after: 0 }]);
    await moveAbout(page, sky.x, sky.y);
    await releaseInPage(page, above(sky, RISE), 0);

    expect(await gameState(page)).toEqual(aiming);
    expect(aiming).toMatchObject({ power: 40, throws: 0, dragging: false });
    expect(errors).toEqual([]);
  });

  test('during the flight', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await page.evaluate(() => {
      window.__FLIPPER__!.pause();
      window.__FLIPPER__!.throwBottle(60);
    });
    const flying = await gameState(page);
    expect(flying).toMatchObject({ phase: 'flying', throws: 1, dragging: false });
    const bottle = await bottleCenter(page);

    await sendMouse(page, [{ type: 'down', x: bottle.x, y: bottle.y, after: 0 }]);
    await moveAbout(page, bottle.x, bottle.y);
    await releaseInPage(page, above(bottle, RISE), 0);

    expect(await gameState(page)).toEqual(flying);
    expect(errors).toEqual([]);
  });

  test('during a result', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await page.evaluate(() => window.__FLIPPER__!.throwBottle(60));
    const result = await stepUntilOutcome(page);
    expect(result).toMatchObject({ phase: 'result', throws: 1 });
    const bottle = await bottleCenter(page);

    await moveAbout(page, bottle.x, bottle.y); // a click would skip the result: only move

    expect(await gameState(page)).toEqual(result);
    expect(errors).toEqual([]);
  });
});
