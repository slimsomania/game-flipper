import { describe, expect, it } from 'vitest';
import { pauseTexts } from '../../src/game/view/pauseText';
import { summaryTexts } from '../../src/game/view/summaryText';
import { titleTexts } from '../../src/game/view/titleText';

const STATE = { score: 5, landings: 3, throwsPerRound: 10, best: 5, isNewBest: false };
const KEYS = /\b(Esc|P|Enter|Space|R|Up|Down|wheel)\b/;

describe('wording by input kind (F043)', () => {
  it('the title speaks of fingers on a touch device and names no key', () => {
    const touch = titleTexts(3, 'touch');
    expect(touch.controlsHint).toMatch(/touch the bottle/i);
    expect(touch.controlsHint).toMatch(/push it up/i);
    expect(touch.controlsHint).not.toMatch(KEYS);
    expect(touch.startHint).toBeNull();
  });

  it('the title keeps the keyboard and mouse wording by default and for "keyboard"', () => {
    for (const texts of [titleTexts(3), titleTexts(3, 'keyboard')]) {
      expect(texts.controlsHint).toContain('Space: throw');
      expect(texts.startHint).toBe('or press Enter or Space');
    }
  });

  it('the pause key hint is hidden on touch and shown otherwise', () => {
    expect(pauseTexts('touch').keyHint).toBeNull();
    expect(pauseTexts('keyboard').keyHint).toBe('Esc or P to resume');
    expect(pauseTexts().keyHint).toBe('Esc or P to resume');
  });

  it('the summary key hint is hidden on touch and shown otherwise', () => {
    expect(summaryTexts(STATE, 'touch').keyHint).toBeNull();
    expect(summaryTexts(STATE, 'keyboard').keyHint).toBe('or press Enter or Space');
    expect(summaryTexts(STATE).keyHint).toBe('or press Enter or Space');
  });
});
