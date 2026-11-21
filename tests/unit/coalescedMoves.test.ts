import { describe, expect, it } from 'vitest';
import { CoalescedMoves, type MoveEvent, type MoveSample } from '../../src/game/coalescedMoves';

/** A `pointermove` stamped `t` ms at page height `y`, carrying `listed` as its coalesced events. */
const move = (t: number, y: number, listed?: MoveSample[], pointerType = 'mouse'): MoveEvent => ({
  timeStamp: t,
  pageY: y,
  pointerType,
  ...(listed ? { getCoalescedEvents: () => listed } : {}),
});

const sample = (t: number, y: number): MoveSample => ({ timeStamp: t, pageY: y });

const times = (samples: MoveSample[]): number[] => samples.map((s) => s.timeStamp);

describe('CoalescedMoves.fresh', () => {
  it('returns every coalesced sample of a move, oldest first, with its own time and height', () => {
    const moves = new CoalescedMoves();
    moves.begin(1000);
    const listed = [sample(1008, 390), sample(1016, 380), sample(1024, 370), sample(1032, 360)];

    expect(moves.fresh(move(1032, 360, listed))).toEqual(listed);
  });

  it('never returns a sample twice, even when a later move lists it again', () => {
    const moves = new CoalescedMoves();
    moves.begin(1000);
    const first = moves.fresh(move(1016, 380, [sample(1008, 390), sample(1016, 380)]));
    const second = moves.fresh(
      move(1032, 360, [sample(1016, 380), sample(1024, 370), sample(1032, 360)]),
    );

    expect(times(first)).toEqual([1008, 1016]);
    expect(times(second)).toEqual([1024, 1032]);
    // The same move delivered twice gives nothing the second time.
    expect(moves.fresh(move(1032, 360, [sample(1032, 360)]))).toEqual([]);
  });

  it('ignores samples from before the press, and one exactly at it', () => {
    const moves = new CoalescedMoves();
    moves.begin(1000);

    const got = moves.fresh(
      move(1016, 380, [sample(990, 420), sample(1000, 400), sample(1016, 380)]),
    );

    expect(times(got)).toEqual([1016]);
  });

  it('starts afresh at each press: the last drag leaves nothing behind', () => {
    const moves = new CoalescedMoves();
    moves.begin(1000);
    moves.fresh(move(5000, 100, [sample(5000, 100)]));
    moves.begin(2000);

    expect(moves.covers(5000)).toBe(false); // the last drag's newest sample is forgotten
    expect(times(moves.fresh(move(2008, 300, [sample(2008, 300)])))).toEqual([2008]);
  });

  it('skips a sample whose time or height is not a number, and keeps the rest', () => {
    const moves = new CoalescedMoves();
    moves.begin(0);

    const got = moves.fresh(
      move(30, 5, [sample(10, 1), sample(Number.NaN, 2), sample(20, Number.NaN), sample(30, 3)]),
    );

    expect(times(got)).toEqual([10, 30]);
  });

  it('returns nothing where the browser has no getCoalescedEvents, or lists none', () => {
    const moves = new CoalescedMoves();
    moves.begin(0);

    expect(moves.fresh(move(10, 5))).toEqual([]);
    expect(moves.fresh(move(20, 5, []))).toEqual([]);
    expect(moves.covers(20)).toBe(false);
  });

  it('leaves a finger to Phaser', () => {
    const moves = new CoalescedMoves();
    moves.begin(0);

    expect(moves.fresh(move(10, 5, [sample(10, 5)], 'touch'))).toEqual([]);
    expect(moves.covers(10)).toBe(false);
  });

  it('takes a script-made event with no pointer type, and a pen', () => {
    const moves = new CoalescedMoves();
    moves.begin(0);

    expect(times(moves.fresh(move(10, 5, [sample(10, 5)], '')))).toEqual([10]);
    expect(times(moves.fresh(move(20, 4, [sample(20, 4)], 'pen')))).toEqual([20]);
  });

  it('works from an unknown press time (not a number): nothing is "before" it', () => {
    const moves = new CoalescedMoves();
    moves.begin(Number.NaN);

    expect(times(moves.fresh(move(5, 1, [sample(5, 1)])))).toEqual([5]);
  });
});

describe('CoalescedMoves.covers', () => {
  it('is false before anything was forwarded, so Phaser forwards every move as it always did', () => {
    const moves = new CoalescedMoves();
    moves.begin(1000);

    expect(moves.covers(1000)).toBe(false);
    expect(moves.covers(1016)).toBe(false);
  });

  it('is true for the move whose samples were forwarded, and false for a newer one', () => {
    const moves = new CoalescedMoves();
    moves.begin(1000);
    moves.fresh(move(1016, 380, [sample(1008, 390), sample(1016, 380)]));

    expect(moves.covers(1016)).toBe(true);
    expect(moves.covers(1008)).toBe(true);
    expect(moves.covers(1016.5)).toBe(false); // the main event is later than its list: not a repeat
  });

  it('is false again after a new press', () => {
    const moves = new CoalescedMoves();
    moves.begin(1000);
    moves.fresh(move(1016, 380, [sample(1016, 380)]));
    moves.begin(3000);

    expect(moves.covers(1016)).toBe(false);
  });
});
