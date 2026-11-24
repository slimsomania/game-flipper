/*
 * Helpers for the phone e2e tests: a finger's touch events made inside the page on a virtual clock,
 * like `dragInPage` in ../mouseHelpers.ts does for the mouse. Each event carries the `timeStamp`
 * the test gives it, so a push of 50 CSS px in 100 ms is exactly that on any machine, however
 * slow its frames are. Phaser sees them as ordinary touch events (it never checks that they are
 * trusted). They share the virtual clock (`window.__virtualNow`) with the mouse helpers.
 */
import type { Page } from '@playwright/test';
import { BOTTLE_HEIGHT } from '../../../src/core/bottleShape';
import { PIXELS_PER_METER } from '../../../src/core/constants';
import { gameState } from '../helpers';
import { gamePoint, type Point } from '../mouseHelpers';

/** One touch event for `sendTouch`: `after` is the virtual time, in ms, since the one before it. */
export interface TouchStep {
  type: 'start' | 'move' | 'end' | 'cancel';
  /** Page coordinates, in CSS px. */
  x: number;
  y: number;
  after: number;
}

/**
 * Make touch events of one finger on the canvas, dispatched at once, each stamped `after` ms later
 * than the one before (the first counts from the later of the previous call's last event and the
 * real time now).
 */
export async function sendTouch(page: Page, steps: TouchStep[]): Promise<void> {
  await page.evaluate((steps) => {
    const clock = window as unknown as { __virtualNow?: number };
    let now = Math.max(clock.__virtualNow ?? 0, performance.now());
    const canvas = document.querySelector('canvas')!;
    for (const step of steps) {
      now += step.after;
      const touch = new Touch({
        identifier: 1,
        target: canvas,
        clientX: step.x,
        clientY: step.y,
        pageX: step.x,
        pageY: step.y,
        screenX: step.x,
        screenY: step.y,
      });
      const down = step.type !== 'end' && step.type !== 'cancel';
      const event = new TouchEvent(
        { start: 'touchstart', move: 'touchmove', end: 'touchend', cancel: 'touchcancel' }[
          step.type
        ],
        {
          bubbles: true,
          cancelable: true,
          view: window,
          touches: down ? [touch] : [],
          targetTouches: down ? [touch] : [],
          changedTouches: [touch],
        },
      );
      Object.defineProperty(event, 'timeStamp', { value: now }); // shadows the real time stamp
      canvas.dispatchEvent(event);
    }
    clock.__virtualNow = now;
  }, steps);
}

/** How a `dragTouchInPage` ends: finger lifted, or still down. */
export type TouchEnd = 'release' | 'hold';

/**
 * Put a finger on `at` (page CSS px), move it `rise` CSS px straight up over `ms` of virtual time,
 * in steps of about 10 ms, and end as asked. `rise` 0 is a tap that lifts without moving.
 */
export async function dragTouchInPage(
  page: Page,
  drag: { at: Point; rise: number; ms: number; end: TouchEnd },
): Promise<void> {
  const { at, rise, ms, end } = drag;
  const steps: TouchStep[] = [{ type: 'start', x: at.x, y: at.y, after: 0 }];
  if (rise !== 0) {
    const count = Math.max(2, Math.round(ms / 10));
    for (let i = 1; i <= count; i++) {
      steps.push({ type: 'move', x: at.x, y: at.y - (rise * i) / count, after: ms / count });
    }
  }
  if (end === 'release')
    steps.push({ type: 'end', x: at.x, y: at.y - rise, after: rise === 0 ? ms : 0 });
  await sendTouch(page, steps);
}

/** The middle of the held bottle on the page, in CSS px: where a finger would press to grab it. */
export async function bottleCenterOnPage(page: Page): Promise<Point> {
  const { bottle } = await gameState(page);
  const gameY = (bottle.y - BOTTLE_HEIGHT / 2) * PIXELS_PER_METER;
  return gamePoint(page, bottle.x * PIXELS_PER_METER, gameY);
}
