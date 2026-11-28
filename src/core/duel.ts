import type { PowerMeter } from './powerMeter';
import { Round } from './round';
import type { Tuning } from './tuning';
import type { WaterSupply } from './waterSupply';

/*
 * The two-player rules (design section 5): the players alternate throws, each has their own books
 * (a `Round`) and their own power bar value, and both throws of a pair get the same water. The
 * Simulation tells the duel when a result ends; the duel says whose turn is next and which water
 * the next bottle has. The one PowerMeter holds the active player's value: a turn pass stores it
 * and restores the other player's.
 */

export type Side = 1 | 2;

/** One player's books and bar value, as the snapshot shows them. */
export interface SideSnapshot {
  score: number;
  landings: number;
  streak: number;
  power: number;
}

export interface DuelSnapshot {
  active: Side;
  sides: [SideSnapshot, SideSnapshot];
  /** The water the waiting player's next bottle will have; null if they have no throws left. */
  waitingWater: number | null;
}

export class Duel {
  private side: Side = 1;
  readonly rounds: [Round, Round];
  /** Each player's bar value while the other one aims (the active side's entry is out of date). */
  private readonly powers: [number, number];
  /** The water of the pair being thrown. */
  private pair: number;
  /** The water of the next pair, drawn once Player 2's turn starts (null before, and in the last pair). */
  private upcoming: number | null = null;

  constructor(
    tuning: () => Tuning,
    private readonly water: WaterSupply,
    private readonly meter: PowerMeter,
    firstWater: number,
  ) {
    this.rounds = [new Round(tuning), new Round(tuning)];
    this.powers = [meter.value, meter.value];
    this.pair = firstWater;
  }

  get active(): Side {
    return this.side;
  }

  /** The books of the player whose turn it is. */
  get round(): Round {
    return this.rounds[this.side - 1];
  }

  /** The water the waiting player's next bottle will have, or null if they have no throws left. */
  get waitingWater(): number | null {
    if (this.side === 1) return this.pair;
    return this.rounds[0].complete ? null : this.upcoming;
  }

  /** A tuning tool locked the water: both bottles of the pair, and the next pair, take that level. */
  relock(level: number): void {
    this.pair = level;
    if (this.upcoming !== null) this.upcoming = level;
  }

  /**
   * A result has ended. Passes the turn and returns the water of the bottle that is now in the
   * hand, or null when that was the last throw of the duel (the turn stays with Player 2).
   */
  endTurn(): number | null {
    if (this.side === 2 && this.rounds[1].complete) return null;
    this.powers[this.side - 1] = this.meter.value;
    if (this.side === 1) {
      this.side = 2;
      if (this.upcoming === null && !this.rounds[0].complete) this.upcoming = this.water.next();
    } else {
      this.side = 1;
      this.pair = this.takeUpcoming();
    }
    this.meter.set(this.powers[this.side - 1]);
    return this.pair;
  }

  /** Start the whole duel over: Player 1 aims first with a new pair of water; returns that water. */
  restart(): number {
    this.powers[this.side - 1] = this.meter.value;
    this.rounds[0].reset();
    this.rounds[1].reset();
    this.side = 1;
    this.meter.set(this.powers[0]);
    this.pair = this.takeUpcoming();
    return this.pair;
  }

  snapshot(): DuelSnapshot {
    const side = (index: 0 | 1): SideSnapshot => ({
      score: this.rounds[index].score,
      landings: this.rounds[index].landings,
      streak: this.rounds[index].streak,
      power: this.side === index + 1 ? this.meter.value : this.powers[index],
    });
    return { active: this.side, sides: [side(0), side(1)], waitingWater: this.waitingWater };
  }

  private takeUpcoming(): number {
    const next = this.upcoming ?? this.water.next();
    this.upcoming = null;
    return next;
  }
}
