import { describe, expect, it } from 'vitest';
import { summaryTexts } from '../../src/game/view/summaryText';

describe('summaryTexts', () => {
  it('words the points and the landings as the design does', () => {
    expect(summaryTexts({ score: 14, landings: 7, throwsPerRound: 10 })).toMatchObject({
      title: 'Round over',
      scoreLine: 'Score: 14',
      landedLine: 'Landed 7 / 10',
      playAgainLabel: 'Play again',
    });
  });

  it('keeps points and landings apart: a double is 2 points but one landing', () => {
    // A round of 10 throws with a single, a double and a triple: 6 points from 3 landings.
    const texts = summaryTexts({ score: 6, landings: 3, throwsPerRound: 10 });
    expect(texts.scoreLine).toBe('Score: 6');
    expect(texts.landedLine).toBe('Landed 3 / 10');
  });

  it('shows a round with no landings and a round with more points than throws', () => {
    expect(summaryTexts({ score: 0, landings: 0, throwsPerRound: 10 })).toMatchObject({
      scoreLine: 'Score: 0',
      landedLine: 'Landed 0 / 10',
    });
    expect(summaryTexts({ score: 23, landings: 10, throwsPerRound: 10 })).toMatchObject({
      scoreLine: 'Score: 23',
      landedLine: 'Landed 10 / 10',
    });
  });

  it('follows the round length of the tuning', () => {
    expect(summaryTexts({ score: 1, landings: 1, throwsPerRound: 5 }).landedLine).toBe(
      'Landed 1 / 5',
    );
  });

  it('says that Enter and Space also choose Play again', () => {
    expect(summaryTexts({ score: 0, landings: 0, throwsPerRound: 10 }).keyHint).toContain('Enter');
    expect(summaryTexts({ score: 0, landings: 0, throwsPerRound: 10 }).keyHint).toContain('Space');
  });
});
