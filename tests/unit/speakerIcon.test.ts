import { describe, expect, it } from 'vitest';
import { GAME_HEIGHT, GAME_WIDTH } from '../../src/core/constants';
import { MUTE_BUTTON } from '../../src/game/view/muteLayout';
import {
  ICON_HALF,
  ICON_STROKE,
  speakerIcon,
  type IconShape,
} from '../../src/game/view/speakerIcon';

const kinds = (shapes: IconShape[]) => shapes.map((shape) => shape.kind);

/** Every point a shape covers that matters for its extent (arcs are sampled along their sweep). */
function extremes(shape: IconShape): { x: number; y: number }[] {
  switch (shape.kind) {
    case 'polygon':
      return [...shape.points];
    case 'line':
      return [
        { x: shape.x1, y: shape.y1 },
        { x: shape.x2, y: shape.y2 },
      ];
    case 'arc':
      return Array.from({ length: 21 }, (_, i) => {
        const angle = shape.from + ((shape.to - shape.from) * i) / 20;
        return {
          x: shape.x + shape.radius * Math.cos(angle),
          y: shape.y + shape.radius * Math.sin(angle),
        };
      });
  }
}

describe('speakerIcon', () => {
  it('draws the same speaker in both states', () => {
    expect(speakerIcon(false)[0]).toEqual(speakerIcon(true)[0]);
    expect(speakerIcon(false)[0].kind).toBe('polygon');
  });

  it('shows sound waves (arcs) when the sound is on and no cross', () => {
    expect(kinds(speakerIcon(false))).toEqual(['polygon', 'arc', 'arc']);
  });

  it('shows a cross (two lines) when muted and no waves', () => {
    expect(kinds(speakerIcon(true))).toEqual(['polygon', 'line', 'line']);
  });

  it('makes the two states differ in shape, not only in color', () => {
    expect(speakerIcon(true)).not.toEqual(speakerIcon(false));
  });

  it('draws the cross as two lines that cross each other', () => {
    const [, first, second] = speakerIcon(true) as Extract<IconShape, { kind: 'line' }>[];
    // Both go down over the same stretch, one to the right and the other to the left.
    expect(first.y2 - first.y1).toBe(second.y2 - second.y1);
    expect(first.y2 - first.y1).toBeGreaterThan(0);
    expect(Math.sign(first.x2 - first.x1)).toBe(-Math.sign(second.x2 - second.x1));
    expect(Math.min(first.x1, first.x2)).toBe(Math.min(second.x1, second.x2));
    expect(Math.max(first.x1, first.x2)).toBe(Math.max(second.x1, second.x2));
  });

  it('keeps the waves and the cross clear of the speaker, to its right', () => {
    const bodyRight = Math.max(...extremes(speakerIcon(false)[0]).map((p) => p.x));
    for (const muted of [false, true]) {
      for (const shape of speakerIcon(muted).slice(1)) {
        for (const point of extremes(shape)) expect(point.x).toBeGreaterThan(bodyRight + 2);
      }
    }
  });

  it('puts the second wave outside the first', () => {
    const [, near, far] = speakerIcon(false) as Extract<IconShape, { kind: 'arc' }>[];
    expect(far.radius).toBeGreaterThan(near.radius + ICON_STROKE);
  });

  it.each([false, true])('stays inside its box, stroke included (muted: %s)', (muted) => {
    for (const shape of speakerIcon(muted)) {
      const stroke = shape.kind === 'polygon' ? 0 : ICON_STROKE / 2;
      for (const point of extremes(shape)) {
        expect(Math.abs(point.x) + stroke).toBeLessThanOrEqual(ICON_HALF);
        expect(Math.abs(point.y) + stroke).toBeLessThanOrEqual(ICON_HALF);
      }
    }
  });

  it('is roughly centered: the drawing is not lopsided inside its box', () => {
    for (const muted of [false, true]) {
      const xs = speakerIcon(muted).flatMap((shape) => extremes(shape).map((p) => p.x));
      const middle = (Math.min(...xs) + Math.max(...xs)) / 2;
      expect(Math.abs(middle)).toBeLessThanOrEqual(4);
    }
  });
});

describe('MUTE_BUTTON layout', () => {
  const { x, y, width, height, margin, lip } = MUTE_BUTTON;
  const left = x - width / 2;
  const right = x + width / 2;
  const top = y - height / 2;
  const bottom = y + height / 2 + lip;

  it('sits in the top-right corner, one margin from the top and the right edge', () => {
    expect(right).toBe(GAME_WIDTH - margin);
    expect(top).toBe(margin);
  });

  it('is entirely on the canvas, lip included', () => {
    expect(left).toBeGreaterThan(0);
    expect(right).toBeLessThan(GAME_WIDTH);
    expect(top).toBeGreaterThan(0);
    expect(bottom).toBeLessThan(GAME_HEIGHT);
  });

  it('is far from the round HUD in the top-left: well inside the right quarter, near the top', () => {
    expect(left).toBeGreaterThan((GAME_WIDTH * 3) / 4);
    expect(bottom).toBeLessThan(GAME_HEIGHT / 6);
  });

  it('is big enough to click comfortably and to hold the icon', () => {
    expect(width).toBeGreaterThanOrEqual(2 * ICON_HALF + 8);
    expect(height).toBeGreaterThanOrEqual(2 * ICON_HALF + 8);
    expect(width).toBeGreaterThanOrEqual(48);
  });

  it('leaves the result message, centered at the top middle, free', () => {
    expect(left).toBeGreaterThan(GAME_WIDTH / 2 + 300);
  });
});
