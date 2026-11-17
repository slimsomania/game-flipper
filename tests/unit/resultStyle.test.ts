import { describe, expect, it } from 'vitest';
import { SIM_HZ } from '../../src/core/constants';
import { COLORS } from '../../src/game/theme';
import {
  FLASH_PEAK_ALPHA,
  FLASH_SECONDS,
  flashAlpha,
  resultStyle,
} from '../../src/game/view/resultStyle';

/** Steps in one second of simulation. */
const STEPS_PER_SECOND = SIM_HZ;

describe('resultStyle', () => {
  it('says "Nailed it!" in green for a success', () => {
    expect(resultStyle({ result: 'success' })).toEqual({
      message: 'Nailed it!',
      flash: COLORS.successFlash,
      text: COLORS.successText,
    });
  });

  it('says "Down!" in red for a fail', () => {
    expect(resultStyle({ result: 'fail' })).toEqual({
      message: 'Down!',
      flash: COLORS.failFlash,
      text: COLORS.failText,
    });
  });

  it('uses different words and different colors for the two results', () => {
    const win = resultStyle({ result: 'success' });
    const loss = resultStyle({ result: 'fail' });
    expect(win.message).not.toBe(loss.message);
    expect(win.flash).not.toBe(loss.flash);
    expect(win.text).not.toBe(loss.text);
  });

  it('is green for success and red for fail (the green channel leads, then the red one)', () => {
    const channels = (color: number) => ({
      r: (color >> 16) & 0xff,
      g: (color >> 8) & 0xff,
      b: color & 0xff,
    });
    const win = channels(resultStyle({ result: 'success' }).flash);
    const loss = channels(resultStyle({ result: 'fail' }).flash);
    expect(win.g).toBeGreaterThan(win.r);
    expect(win.g).toBeGreaterThan(win.b);
    expect(loss.r).toBeGreaterThan(loss.g);
    expect(loss.r).toBeGreaterThan(loss.b);
  });
});

describe('flashAlpha', () => {
  it('is nothing when there is no result', () => {
    expect(flashAlpha(null)).toBe(0);
    expect(flashAlpha(-1)).toBe(0);
  });

  it('is strongest in the step of the outcome, and see-through enough to keep the bottle visible', () => {
    expect(flashAlpha(0)).toBe(FLASH_PEAK_ALPHA);
    expect(FLASH_PEAK_ALPHA).toBeGreaterThan(0.1); // a flash you can see
    expect(FLASH_PEAK_ALPHA).toBeLessThanOrEqual(0.5); // not a wall
  });

  it('fades steadily to nothing within about half a second', () => {
    expect(FLASH_SECONDS).toBeLessThanOrEqual(0.5);
    expect(FLASH_SECONDS).toBeGreaterThan(0.2);
    let previous = flashAlpha(0);
    for (let steps = 1; steps <= STEPS_PER_SECOND; steps++) {
      const alpha = flashAlpha(steps);
      expect(alpha).toBeLessThanOrEqual(previous);
      previous = alpha;
    }
    expect(flashAlpha(Math.round(FLASH_SECONDS * STEPS_PER_SECOND))).toBe(0);
    expect(flashAlpha(30)).toBeCloseTo(0, 10);
  });

  it('is about half strength halfway through, and gone 40 steps after the outcome', () => {
    expect(flashAlpha(Math.round((FLASH_SECONDS * STEPS_PER_SECOND) / 2))).toBeCloseTo(
      FLASH_PEAK_ALPHA / 2,
      5,
    );
    expect(flashAlpha(40)).toBe(0);
    expect(flashAlpha(89)).toBe(0);
  });
});
