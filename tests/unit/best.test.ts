import { describe, expect, it } from 'vitest';
import { updateBest } from '../../src/core/round';

describe('updateBest', () => {
  it('treats a higher score as a new best', () => {
    expect(updateBest(3, 5)).toEqual({ best: 5, isNewBest: true });
    expect(updateBest(11, 12)).toEqual({ best: 12, isNewBest: true });
  });

  it('does not treat an equal score as a new best', () => {
    expect(updateBest(7, 7)).toEqual({ best: 7, isNewBest: false });
  });

  it('does not treat a lower score as a new best, and keeps the saved best', () => {
    expect(updateBest(3, 2)).toEqual({ best: 3, isNewBest: false });
    expect(updateBest(12, 0)).toEqual({ best: 12, isNewBest: false });
  });

  it('counts any score above 0 as a new best when there is no saved best', () => {
    expect(updateBest(0, 1)).toEqual({ best: 1, isNewBest: true });
    expect(updateBest(0, 3)).toEqual({ best: 3, isNewBest: true });
    expect(updateBest(0, 25)).toEqual({ best: 25, isNewBest: true });
  });

  it('does not treat a score of 0 as a new best, even with no saved best', () => {
    expect(updateBest(0, 0)).toEqual({ best: 0, isNewBest: false });
  });

  it('takes scores above the number of throws: a double scores 2', () => {
    expect(updateBest(9, 14)).toEqual({ best: 14, isNewBest: true });
  });

  it('does not let a damaged best or score spoil the comparison', () => {
    expect(updateBest(Number.NaN, 4)).toEqual({ best: 4, isNewBest: true });
    expect(updateBest(-5, 4)).toEqual({ best: 4, isNewBest: true });
    expect(updateBest(Infinity, 4)).toEqual({ best: 4, isNewBest: true });
    expect(updateBest(6, Number.NaN)).toEqual({ best: 6, isNewBest: false });
    expect(updateBest(6, -2)).toEqual({ best: 6, isNewBest: false });
    expect(updateBest(Number.NaN, Number.NaN)).toEqual({ best: 0, isNewBest: false });
  });
});
