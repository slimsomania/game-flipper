import { describe, expect, it } from 'vitest';
import { summaryTexts, type SummaryState } from '../../src/game/view/summaryText';

/** A summary state: a round of 10 throws that did not set a best, unless the test says so. */
const state = (changes: Partial<SummaryState> = {}): SummaryState => ({
  score: 0,
  landings: 0,
  throwsPerRound: 10,
  best: 0,
  isNewBest: false,
  ...changes,
});

describe('summaryTexts', () => {
  it('words the points and the landings as the design does', () => {
    expect(summaryTexts(state({ score: 14, landings: 7 }))).toMatchObject({
      title: 'Round over',
      scoreLine: 'Score: 14',
      landedLine: 'Landed 7 / 10',
      playAgainLabel: 'Play again',
    });
  });

  it('keeps points and landings apart: a double is 2 points but one landing', () => {
    // A round of 10 throws with a single, a double and a triple: 6 points from 3 landings.
    const texts = summaryTexts(state({ score: 6, landings: 3 }));
    expect(texts.scoreLine).toBe('Score: 6');
    expect(texts.landedLine).toBe('Landed 3 / 10');
  });

  it('shows a round with no landings and a round with more points than throws', () => {
    expect(summaryTexts(state())).toMatchObject({
      scoreLine: 'Score: 0',
      landedLine: 'Landed 0 / 10',
    });
    expect(summaryTexts(state({ score: 23, landings: 10 }))).toMatchObject({
      scoreLine: 'Score: 23',
      landedLine: 'Landed 10 / 10',
    });
  });

  it('follows the round length of the tuning', () => {
    expect(summaryTexts(state({ score: 1, landings: 1, throwsPerRound: 5 })).landedLine).toBe(
      'Landed 1 / 5',
    );
  });

  it('says that Enter and Space also choose Play again', () => {
    expect(summaryTexts(state()).keyHint).toContain('Enter');
    expect(summaryTexts(state()).keyHint).toContain('Space');
  });

  it('shows the best score, and "New best!" only when the round set it', () => {
    const setBest = summaryTexts(state({ score: 3, best: 3, isNewBest: true }));
    expect(setBest.bestLine).toBe('Best: 3');
    expect(setBest.newBestLine).toBe('New best!');

    // The best is from an earlier round: the line shows it, and there is no note.
    const kept = summaryTexts(state({ score: 2, best: 3, isNewBest: false }));
    expect(kept.bestLine).toBe('Best: 3');
    expect(kept.newBestLine).toBeNull();
  });

  it('shows a best above the number of throws, and a best of 0', () => {
    expect(summaryTexts(state({ score: 12, best: 12, isNewBest: true })).bestLine).toBe('Best: 12');
    expect(summaryTexts(state()).bestLine).toBe('Best: 0');
  });
});
