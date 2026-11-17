/*
 * Helpers for the e2e tests of the mouse push (`mouse.spec.ts`, `mouseNothing.spec.ts`): pointing at
 * the game, drags with Playwright's real mouse and with mouse events on a virtual clock, and a log
 * of the page's mouse events.
 *
 * Two ways to move the mouse. Playwright's own mouse is the real input path, but each call takes as
 * long as the browser takes to answer (headless Chromium draws in software, so that can be tens of
 * milliseconds): a "100 ms" push can take half a second. It is used where the pace does not matter
 * (what is grabbed, what throws nothing, the cursor). The tests that need a push of a given speed
 * use `dragInPage` / `sendMouse`, which make the same mouse events on a virtual clock (each event
 * carries the time stamp the test gives it), so the speed is exact on any machine. Powers are also
 * checked against `log.expectedPower()`: `pushPower` of the samples the page's own event log
 * recorded, so the expected number never depends on the pace either way.
 */
import { expect, type Page } from '@playwright/test';
import { BOTTLE_HEIGHT } from '../../src/core/bottleShape';
import { GAME_HEIGHT, GAME_WIDTH, PIXELS_PER_METER } from '../../src/core/constants';
import { pushPower, type PushSample } from '../../src/core/push';
import { gameState, settleInput, stepUntilOutcome } from './helpers';

export interface Point {
  x: number;
  y: number;
}

export const phaseOf = async (page: Page): Promise<string> => (await gameState(page)).phase;
export const draggingNow = async (page: Page): Promise<boolean> => (await gameState(page)).dragging;
export const powerNow = async (page: Page): Promise<number> => (await gameState(page)).power;

/** Press the left button on `at` and wait until the game has grabbed (or not: pass `grabs: false`). */
export async function press(page: Page, at: Point, grabs = true): Promise<void> {
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  if (grabs) await expect.poll(() => draggingNow(page)).toBe(true);
  else await settleInput(page);
}

/** Bring the next bottle: play the throw out to its result, then skip the wait. */
export async function nextBottle(page: Page): Promise<void> {
  await stepUntilOutcome(page);
  await page.evaluate(() => window.__FLIPPER__!.skip());
  await expect.poll(() => phaseOf(page)).toBe('aiming');
}

/** Where the canvas is on the page, and how many page pixels one game pixel is. */
async function canvasFrame(page: Page): Promise<{ left: number; top: number; scale: number }> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('No canvas on the page');
  return { left: box.x, top: box.y, scale: box.width / GAME_WIDTH };
}

/** A point in game pixels (the 1280x720 canvas) as a point on the page. */
export async function gamePoint(page: Page, x: number, y: number): Promise<Point> {
  const { left, top, scale } = await canvasFrame(page);
  return { x: left + x * scale, y: top + y * scale };
}

/** The middle of the bottle in the hand, on the page: where a player would press to grab it. */
export async function bottleCenter(page: Page): Promise<Point> {
  const { bottle } = await gameState(page);
  const gameY = (bottle.y - BOTTLE_HEIGHT / 2) * PIXELS_PER_METER;
  return gamePoint(page, bottle.x * PIXELS_PER_METER, gameY);
}

/**
 * Move Playwright's mouse in a straight line from `from` to `to`, in steps of about `ms / steps`.
 * The pace is only a request: each call goes through the browser's input pipeline and can take
 * tens of milliseconds, so a "100 ms" glide may take several times that. Use it for tests that do
 * not depend on how fast the pointer moves, and `dragInPage` for the ones that do. The button
 * state is left as it is.
 */
export async function glide(page: Page, from: Point, to: Point, ms: number): Promise<void> {
  const steps = Math.max(2, Math.round(ms / 10));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    await page.waitForTimeout(ms / steps);
  }
}

/** One mouse event for `sendMouse`: `after` is the virtual time, in ms, since the one before it. */
export interface MouseStep {
  type: 'down' | 'move' | 'up' | 'upOutside';
  /** Page coordinates. */
  x: number;
  y: number;
  after: number;
}

/**
 * Make mouse events inside the page on a virtual clock. They are dispatched at once, one after the
 * other, but each carries a `timeStamp` of its own, `after` ms later than the one before (the first
 * one counts from the later of the previous call's last event and the real time now). The game
 * reads the time of a pointer event from its `timeStamp`, so a push of 200 px in 100 ms is exactly
 * that on any machine, however slow its frames are; Playwright's own mouse can't promise that,
 * because each of its calls takes as long as the browser takes to answer. Phaser sees them as
 * ordinary mouse events (it never checks that they are trusted). `down`, `move` and `up` go to the
 * canvas; `upOutside` goes to the page body, as a button let go outside the canvas does.
 */
export async function sendMouse(page: Page, steps: MouseStep[]): Promise<void> {
  await page.evaluate((steps) => {
    const clock = window as unknown as { __virtualNow?: number };
    let now = Math.max(clock.__virtualNow ?? 0, performance.now());
    const canvas = document.querySelector('canvas')!;
    for (const step of steps) {
      now += step.after;
      const type = { down: 'mousedown', move: 'mousemove', up: 'mouseup', upOutside: 'mouseup' }[
        step.type
      ];
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: step.x,
        clientY: step.y,
        button: 0,
        buttons: step.type === 'up' || step.type === 'upOutside' ? 0 : 1,
      });
      Object.defineProperty(event, 'timeStamp', { value: now }); // shadows the real time stamp
      (step.type === 'upOutside' ? document.body : canvas).dispatchEvent(event);
    }
    clock.__virtualNow = now;
  }, steps);
}

/**
 * How a `dragInPage` ends: let go on the canvas, let go outside it (on the page body, at a height
 * far above where the pointer was last seen), or keep holding.
 */
export type DragEnd = 'release' | 'releaseOutside' | 'hold';

/**
 * Press on `at` (page coordinates), move `rise` px straight up over `ms` of virtual time, in steps
 * of about 10 ms, and end as asked (see `sendMouse`). Leaves `window.__virtualNow` at the last event.
 */
export async function dragInPage(
  page: Page,
  drag: { at: Point; rise: number; ms: number; end: DragEnd },
): Promise<void> {
  const { at, rise, ms, end } = drag;
  const count = Math.max(2, Math.round(ms / 10));
  const steps: MouseStep[] = [{ type: 'down', x: at.x, y: at.y, after: 0 }];
  for (let i = 1; i <= count; i++) {
    steps.push({ type: 'move', x: at.x, y: at.y - (rise * i) / count, after: ms / count });
  }
  // Outside the canvas the game gets no moves, so wherever the button comes up is news to it: put
  // that 400 px higher than the pointer was last seen, to show the game does not trust it.
  if (end === 'release') steps.push({ type: 'up', x: at.x, y: at.y - rise, after: 0 });
  if (end === 'releaseOutside') {
    steps.push({ type: 'upOutside', x: at.x, y: at.y - rise - 400, after: 0 });
  }
  await sendMouse(page, steps);
}

/** Let go (on the canvas, at `at`) `after` ms of virtual time after the last event `sendMouse` made. */
export async function releaseInPage(page: Page, at: Point, after: number): Promise<void> {
  await sendMouse(page, [{ type: 'up', x: at.x, y: at.y, after }]);
}

/** A point `dy` page pixels above `p` (negative: below). */
export const above = (p: Point, dy: number): Point => ({ x: p.x, y: p.y - dy });

/** What the page's mouse events looked like: type, time (seconds, the browser's own stamp) and page height. */
interface LoggedEvent {
  type: 'mousedown' | 'mousemove' | 'mouseup';
  t: number;
  pageY: number;
}

/** Log every mouse event the page gets, so a test can work out the push the game should have measured. */
export async function logMouse(page: Page): Promise<MouseLog> {
  await page.evaluate(() => {
    const log: LoggedEvent[] = [];
    (window as unknown as { __mouseLog: LoggedEvent[] }).__mouseLog = log;
    for (const type of ['mousedown', 'mousemove', 'mouseup'] as const) {
      window.addEventListener(
        type,
        (event) => log.push({ type, t: event.timeStamp / 1000, pageY: event.pageY }),
        true,
      );
    }
  });
  return new MouseLog(page);
}

export class MouseLog {
  constructor(private readonly page: Page) {}

  private events(): Promise<LoggedEvent[]> {
    return this.page.evaluate(() =>
      (window as unknown as { __mouseLog: LoggedEvent[] }).__mouseLog.slice(),
    );
  }

  /**
   * The pointer samples of the drag that began at the latest mouse press: the press itself and every
   * move after it, in game pixels, and with `release` the button coming up too. Empty before a press.
   */
  async samples(options: { release?: boolean } = {}): Promise<PushSample[]> {
    const { top, scale } = await canvasFrame(this.page);
    const events = await this.events();
    const pressed = events.map((e) => e.type).lastIndexOf('mousedown');
    if (pressed < 0) return [];
    return events
      .slice(pressed)
      .filter((e) => e.type !== 'mouseup' || options.release)
      .map((e) => ({ t: e.t, y: (e.pageY - top) / scale }));
  }

  /** The power the game should show for the drag so far (or at the release): `pushPower` of the samples. */
  async expectedPower(options: { release?: boolean } = {}): Promise<number> {
    return pushPower(await this.samples(options));
  }
}

/** The canvas's CSS cursor as the browser computes it ("auto" is the normal arrow). */
export function canvasCursor(page: Page): Promise<string> {
  return page.locator('canvas').evaluate((el) => getComputedStyle(el).cursor);
}

/** Make the window wider than the canvas, so the page has a margin outside it. Returns that margin's width in px. */
export async function widenViewport(page: Page): Promise<number> {
  await page.setViewportSize({ width: GAME_WIDTH + 400, height: GAME_HEIGHT });
  // The canvas is centered: wait for the game to lay out, then there is a margin to the left of it.
  await page.waitForFunction(
    () => document.querySelector('canvas')!.getBoundingClientRect().left > 50,
  );
  return (await canvasFrame(page)).left;
}
