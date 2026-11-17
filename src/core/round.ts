import type { Outcome } from './outcome';
import type { Tuning } from './tuning';

/*
 * The scoring of a round (design section 2): a fixed number of throws, the points they scored, how
 * many of them landed and the current run of landings. It only keeps the books: the Simulation
 * tells it when a bottle is released and when a throw is judged, and decides what happens when the
 * round is complete. Nothing here depends on the physics or on a clock.
 */

/**
 * How many throws a round has: `throwsPerRound` from the tuning, as a whole number of at least 1
 * (the tuning panel accepts any number, and a round of 0 throws could never start).
 */
export function roundLength(tuning: Tuning): number {
  const length = Math.floor(tuning.throwsPerRound);
  return Number.isFinite(length) ? Math.max(1, length) : 1;
}

/** What a finished round does to the best round score. */
export interface BestUpdate {
  /** The best round score after the round: the higher of the saved best and the round's score. */
  best: number;
  /** True only when the round scored strictly more than the saved best. */
  isNewBest: boolean;
}

/**
 * The best round score after a round that scored `score` (its points, which can exceed the number
 * of throws because a double is worth 2) when the saved best was `previousBest`. A tie is not a new
 * best, and with no saved best (0) any score above 0 is one. A best or score that is not a number
 * (or below 0) counts as 0, so a damaged save can't spoil the comparison.
 */
export function updateBest(previousBest: number, score: number): BestUpdate {
  const before = Number.isFinite(previousBest) ? Math.max(0, previousBest) : 0;
  const points = Number.isFinite(score) ? Math.max(0, score) : 0;
  return points > before ? { best: points, isNewBest: true } : { best: before, isNewBest: false };
}

export class Round {
  private thrown = 0;
  private points = 0;
  private landed = 0;
  private run = 0;

  constructor(private readonly tuning: () => Tuning) {}

  /** Throws in a round (the tuning's `throwsPerRound`, at least 1). */
  get length(): number {
    return roundLength(this.tuning());
  }

  /** Points so far this round: the turns of each upright landing; a fail adds nothing. */
  get score(): number {
    return this.points;
  }

  /** Upright landings so far this round. */
  get landings(): number {
    return this.landed;
  }

  /** Consecutive landings up to now: a fail sets it back to 0. It never changes the points. */
  get streak(): number {
    return this.run;
  }

  /** True once every throw of the round has been released: the round ends after the last result. */
  get complete(): boolean {
    return this.thrown >= this.length;
  }

  /**
   * The number (1 to `length`) of the throw the player is on: the bottle in the hand, or the one in
   * the air or being judged. `holding` says whether a bottle is waiting in the hand, which makes it
   * the next throw. A round that is over still reports its last throw, never `length + 1`.
   */
  throwNumber(holding: boolean): number {
    return Math.min(this.length, Math.max(1, this.thrown + (holding ? 1 : 0)));
  }

  /** A bottle has been released: that is one throw of the round. */
  released(): void {
    this.thrown++;
  }

  /** A throw has been judged: add its points, and count it as a landing or break the streak. */
  judged(outcome: Outcome): void {
    this.points += outcome.points;
    if (outcome.result === 'success') {
      this.landed++;
      this.run++;
    } else {
      this.run = 0;
    }
  }

  /** Back to the start of a round: no throws, no points, no landings, no streak. */
  reset(): void {
    this.thrown = 0;
    this.points = 0;
    this.landed = 0;
    this.run = 0;
  }
}
