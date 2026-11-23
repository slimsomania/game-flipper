import { describe, expect, it } from 'vitest';
import { TABLE_LEFT_X, TABLE_RIGHT_X, TABLE_TOP_Y } from '../../src/core/table';
import {
  bottleShadow,
  SHADOW_FADE_HEIGHT_M,
  SHADOW_MAX_ALPHA,
  SHADOW_MAX_WIDTH_M,
  shadowAtHeight,
} from '../../src/game/view/bottleShadow';
import { FLASH_PEAK_ALPHA } from '../../src/game/view/resultStyle';
import { COLORS } from '../../src/game/theme';

describe('shadowAtHeight', () => {
  it('is largest and darkest at rest', () => {
    const s = shadowAtHeight(0)!;
    expect(s.width).toBe(SHADOW_MAX_WIDTH_M);
    expect(s.alpha).toBe(SHADOW_MAX_ALPHA);
  });

  it('shrinks and fades the higher the bottle, never below zero', () => {
    let last = shadowAtHeight(0)!;
    for (const h of [0.5, 1, 2, 3, SHADOW_FADE_HEIGHT_M, 50]) {
      const s = shadowAtHeight(h)!;
      expect(s.width).toBeLessThanOrEqual(last.width);
      expect(s.alpha).toBeLessThanOrEqual(last.alpha);
      expect(s.width).toBeGreaterThan(0);
      expect(s.alpha).toBeGreaterThanOrEqual(0);
      last = s;
    }
  });

  it('treats a negative height like rest and gives nothing for a non-number', () => {
    expect(shadowAtHeight(-1)).toEqual(shadowAtHeight(0));
    expect(shadowAtHeight(Number.NaN)).toBeNull();
  });
});

describe('bottleShadow', () => {
  const cx = (TABLE_LEFT_X + TABLE_RIGHT_X) / 2;

  it('is at its largest for an upright bottle on the table and smaller when it is above it', () => {
    const rest = bottleShadow({ x: cx, y: TABLE_TOP_Y, angle: 0 })!;
    expect(rest.alpha).toBe(SHADOW_MAX_ALPHA);
    const up = bottleShadow({ x: cx, y: TABLE_TOP_Y - 2, angle: 0 })!;
    expect(up.alpha).toBeLessThan(rest.alpha);
    expect(up.width).toBeLessThan(rest.width);
  });

  it('is hidden when the bottle is not over the table', () => {
    expect(bottleShadow({ x: TABLE_LEFT_X - 0.5, y: TABLE_TOP_Y, angle: 0 })).toBeNull();
    expect(bottleShadow({ x: TABLE_RIGHT_X + 0.5, y: TABLE_TOP_Y - 1, angle: 0 })).toBeNull();
    expect(bottleShadow({ x: cx, y: TABLE_TOP_Y + 2, angle: 0 })).toBeNull();
  });
});

describe('gentler flash and accent colors', () => {
  it('has a flash peak of at most 0.2', () => {
    expect(FLASH_PEAK_ALPHA).toBeLessThanOrEqual(0.2);
    expect(FLASH_PEAK_ALPHA).toBeGreaterThan(0);
  });

  it('keeps the buttons and the accent clearly apart from the water', () => {
    const accent = Number.parseInt(COLORS.accent.slice(1), 16);
    for (const color of [COLORS.button, COLORS.buttonHover, COLORS.buttonPressed, accent]) {
      expect(color).not.toBe(COLORS.water);
      // Mostly red-heavy (violet) against the water's red-light blue: far apart in the red channel.
      expect(Math.abs(((color >> 16) & 255) - ((COLORS.water >> 16) & 255))).toBeGreaterThan(30);
    }
  });
});
