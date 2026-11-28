import { describe, expect, it } from 'vitest';
import { GAME_HEIGHT, GAME_WIDTH } from '../../src/core/constants';
import { COLORS } from '../../src/game/theme';
import {
  barBoxes,
  cornerHitBoxes,
  duelTextBoxes,
  sideColor,
  type Box,
} from '../../src/game/view/duelLayout';
import { duelBanner, sideLines } from '../../src/game/view/duelText';

const overlap = (a: Box, b: Box): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

describe('duel text', () => {
  it('words the banner for the first and a later throw', () => {
    expect(duelBanner(1, 1, 10)).toBe("Player 1's turn · Throw 1 / 10");
    expect(duelBanner(2, 3, 10)).toBe("Player 2's turn · Throw 3 / 10");
  });

  it('gives each side its label, score and streak', () => {
    expect(sideLines(1, 1, 1)).toEqual({
      label: 'Player 1',
      scoreLine: 'Score: 1',
      streakLine: 'Streak: 1',
    });
    expect(sideLines(2, 0, 0)).toEqual({
      label: 'Player 2',
      scoreLine: 'Score: 0',
      streakLine: 'Streak: 0',
    });
  });

  it('uses the usual HUD text color for the active side, whichever player it is, and gray when waiting', () => {
    expect(sideColor(true)).toBe(COLORS.text);
    expect(sideColor(false)).toBe(COLORS.waiting);
    expect(sideColor(false)).not.toBe(COLORS.text);
  });
});

describe('duel layout', () => {
  const texts = duelTextBoxes();

  it('has the banner and three lines per side', () => {
    expect(texts).toHaveLength(7);
  });

  it('makes every text at least 24 px tall and keeps it inside the canvas', () => {
    for (const { text, size, box } of texts) {
      expect(size, text).toBeGreaterThanOrEqual(24);
      expect(box.left, text).toBeGreaterThanOrEqual(0);
      expect(box.top, text).toBeGreaterThanOrEqual(0);
      expect(box.right, text).toBeLessThanOrEqual(GAME_WIDTH);
      expect(box.bottom, text).toBeLessThanOrEqual(GAME_HEIGHT);
    }
  });

  it('overlaps no other text, no corner button area and neither power bar', () => {
    const others = [...cornerHitBoxes(), ...barBoxes()];
    texts.forEach((a, i) => {
      texts
        .slice(i + 1)
        .forEach((b) => expect(overlap(a.box, b.box), `${a.text} / ${b.text}`).toBe(false));
      others.forEach((box, j) => expect(overlap(a.box, box), `${a.text} / box ${j}`).toBe(false));
    });
  });
});
