import { describe, expect, it } from 'vitest';
import { hudTexts } from '../../src/game/view/hudText';

describe('hudTexts', () => {
  it('words the three lines as the design does', () => {
    expect(hudTexts({ throwNumber: 3, throwsPerRound: 10, score: 2, streak: 1 })).toEqual({
      throwLine: 'Throw 3 / 10',
      scoreLine: 'Score: 2',
      streakLine: 'Streak: 1',
    });
  });

  it('shows the start of a round and a round with big numbers', () => {
    expect(hudTexts({ throwNumber: 1, throwsPerRound: 10, score: 0, streak: 0 })).toEqual({
      throwLine: 'Throw 1 / 10',
      scoreLine: 'Score: 0',
      streakLine: 'Streak: 0',
    });
    expect(hudTexts({ throwNumber: 10, throwsPerRound: 10, score: 23, streak: 10 })).toEqual({
      throwLine: 'Throw 10 / 10',
      scoreLine: 'Score: 23',
      streakLine: 'Streak: 10',
    });
  });

  it('follows the round length of the tuning', () => {
    expect(hudTexts({ throwNumber: 2, throwsPerRound: 5, score: 0, streak: 0 }).throwLine).toBe(
      'Throw 2 / 5',
    );
  });
});
