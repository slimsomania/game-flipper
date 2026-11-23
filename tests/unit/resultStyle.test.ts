import { describe, expect, it } from 'vitest';
import { SIM_HZ } from '../../src/core/constants';
import { COLORS } from '../../src/game/theme';
import {
  FLASH_PEAK_ALPHA,
  FLASH_SECONDS,
  flashAlpha,
  resultStyle,
  successMessage,
} from '../../src/game/view/resultStyle';

/** Steps in one second of simulation. */
const STEPS_PER_SECOND = SIM_HZ;

/** The parts of an outcome that decide the message. */
const success = (points: number) => ({ result: 'success', reason: 'upright', points }) as const;
const FAIL = { result: 'fail', reason: 'side', points: 0 } as const;
const NO_FLIP = { result: 'fail', reason: 'noFlip', points: 0 } as const;

describe('resultStyle', () => {
  it('says "Nailed it! +1" in green for a single flip', () => {
    expect(resultStyle(success(1))).toEqual({
      message: 'Nailed it! +1',
      flash: COLORS.successFlash,
      text: COLORS.successText,
    });
  });

  it('names the flip and the points: Double, Triple, then "Flip ×N"', () => {
    expect(resultStyle(success(2)).message).toBe('Double! +2');
    expect(resultStyle(success(3)).message).toBe('Triple! +3');
    expect(resultStyle(success(4)).message).toBe('Flip ×4! +4');
    expect(resultStyle(success(7)).message).toBe('Flip ×7! +7');
    for (const points of [2, 3, 4, 9]) {
      expect(resultStyle(success(points)).flash).toBe(COLORS.successFlash);
    }
    expect(successMessage(1)).toBe('Nailed it! +1');
    expect(successMessage(12)).toBe('Flip ×12! +12');
  });

  it('says "Cap landing! +N" in green for a landing on the cap (a success since 2026-11-22)', () => {
    expect(resultStyle({ result: 'success', reason: 'cap', points: 1 })).toEqual({
      message: 'Cap landing! +1',
      flash: COLORS.successFlash,
      text: COLORS.successText,
    });
    expect(resultStyle({ result: 'success', reason: 'cap', points: 2 }).message).toBe(
      'Cap landing! +2',
    );
  });

  it('says "Down!" in red for a fail', () => {
    expect(resultStyle(FAIL)).toEqual({
      message: 'Down!',
      flash: COLORS.failFlash,
      text: COLORS.failText,
    });
    for (const reason of ['cap', 'offTable', 'offScreen', 'timeout'] as const) {
      expect(resultStyle({ ...FAIL, reason }).message).toBe('Down!');
    }
  });

  it('says "No flip!" in red for a bottle that stood up without a full turn', () => {
    expect(resultStyle(NO_FLIP)).toEqual({
      message: 'No flip!',
      flash: COLORS.failFlash,
      text: COLORS.failText,
    });
  });

  it('uses different words and different colors for the two results', () => {
    const win = resultStyle(success(1));
    for (const loss of [resultStyle(FAIL), resultStyle(NO_FLIP)]) {
      expect(win.message).not.toBe(loss.message);
      expect(win.flash).not.toBe(loss.flash);
      expect(win.text).not.toBe(loss.text);
    }
    expect(resultStyle(NO_FLIP).message).not.toBe(resultStyle(FAIL).message);
  });

  it('is green for success and red for fail (the green channel leads, then the red one)', () => {
    const channels = (color: number) => ({
      r: (color >> 16) & 0xff,
      g: (color >> 8) & 0xff,
      b: color & 0xff,
    });
    const win = channels(resultStyle(success(1)).flash);
    const loss = channels(resultStyle(FAIL).flash);
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
