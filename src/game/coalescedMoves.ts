/*
 * The pointer samples a browser hides between frames (F033, D21 and D25). A browser delivers one
 * `pointermove` per rendered frame, and Phaser listens to `mousemove`, which carries nothing from
 * between frames; but the `pointermove` also lists every move the mouse made since the last one
 * (`getCoalescedEvents()`, 125 Hz or more for a gaming mouse). While a bottle is grabbed the game
 * forwards each of those samples to the push, so a slow frame no longer makes the same hand motion
 * read as stronger (`pushPower` takes a gap longer than one 60 Hz frame as "sat still, then moved").
 *
 * This is the bookkeeping only, with no Phaser and no DOM types, so it is unit-tested in Node:
 * which samples of a `pointermove` are new, and whether Phaser's own `mousemove` for the same move
 * would repeat one of them. `bindGameInput` does the wiring.
 */

/** The part of a pointer event that counts: when it happened (ms, the browser's clock) and where. */
export interface MoveSample {
  timeStamp: number;
  pageY: number;
  /** Where sideways, when the event says (a finger that slides off a tap is judged by it). */
  pageX?: number;
}

/** A native `pointermove`, as far as this module reads it. */
export interface MoveEvent extends MoveSample {
  /** `'mouse'`, `'pen'` or `'touch'` (a script-made event may leave it empty). */
  pointerType?: string;
  /** Missing in a browser without coalesced events. */
  getCoalescedEvents?: () => readonly MoveSample[];
}

export class CoalescedMoves {
  /** Samples at or before this time (ms) belong to before the press. */
  private floor = Number.NEGATIVE_INFINITY;
  /** The newest sample forwarded from a coalesced list, in ms. */
  private newest = Number.NEGATIVE_INFINITY;

  /** A grab began at `timeStamp` (ms): forget the last drag, and ignore samples from before the press. */
  begin(timeStamp: number): void {
    this.floor = Number.isFinite(timeStamp) ? timeStamp : Number.NEGATIVE_INFINITY;
    this.newest = Number.NEGATIVE_INFINITY;
  }

  /**
   * The samples a `pointermove` adds to a drag, oldest first: its coalesced events that are newer
   * than the press and than every sample already forwarded, and that have a usable time and
   * height. Empty when the browser has no coalesced events, lists none, or the pointer is a finger
   * (Phaser reads touches itself). Remembers what it returns, so the same sample is never returned
   * twice, whatever the browser does with the list.
   */
  fresh(event: MoveEvent): MoveSample[] {
    if (event.pointerType === 'touch' || typeof event.getCoalescedEvents !== 'function') return [];
    const listed = event.getCoalescedEvents();
    const out: MoveSample[] = [];
    for (const sample of listed) {
      if (!Number.isFinite(sample.timeStamp) || !Number.isFinite(sample.pageY)) continue;
      if (sample.timeStamp <= Math.max(this.floor, this.newest)) continue;
      this.newest = sample.timeStamp;
      out.push(sample);
    }
    return out;
  }

  /**
   * Whether Phaser's `mousemove` stamped `timeStamp` (ms) repeats a sample `fresh` already returned,
   * so the game must not forward it again. False when nothing was forwarded from a coalesced list
   * (the game then behaves exactly as it does without them) and for a move newer than all of them.
   */
  covers(timeStamp: number): boolean {
    return timeStamp <= this.newest;
  }
}
