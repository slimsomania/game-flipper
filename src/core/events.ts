import type { Body, Contact, World } from 'planck';
import type { Outcome, OutcomeReason, OutcomeResult } from './outcome';
import type { ThrowSource } from './throw';

/*
 * What happened in the simulation, as plain events for the layers above it (sound now, effects
 * later). The simulation queues them as it runs and the scene drains the queue once per frame;
 * core never plays or draws anything itself. Every event carries the `tick` it happened at (the
 * number of fixed steps simulated so far), so a consumer can reason about time without a clock.
 */

/** The held bottle was thrown (`throwBottle`; a bottle set up with `placeBottle` is not a throw). */
export interface ThrowEvent {
  type: 'throw';
  tick: number;
  /** The power it was thrown with, 0 to 100. */
  power: number;
  source: ThrowSource;
}

/** The bottle hit the table. */
export interface ImpactEvent {
  type: 'impact';
  tick: number;
  /** How fast the bottle's contact point was moving into the table, in m/s (always above 0). */
  speed: number;
}

/** A throw was judged. Exactly one per throw. */
export interface OutcomeEvent {
  type: 'outcome';
  tick: number;
  result: OutcomeResult;
  reason: OutcomeReason;
  points: number;
}

export type SimEvent = ThrowEvent | ImpactEvent | OutcomeEvent;

/**
 * The event queue, and the part of the physics that produces impacts. The table is the only thing
 * the bottle can hit, and the contact listener only reads: a begin-contact fires before the step's
 * solver has touched the velocities, so the speed it sees is the speed the bottle arrived with.
 */
export class SimEvents {
  private pending: SimEvent[] = [];
  /** The hardest hit seen since the last `stepped()`, 0 for none. */
  private hardestHit = 0;
  /** The bottle began touching the table since the last `stepped()`, however softly. */
  private touched = false;

  constructor(
    world: World,
    private readonly table: Body,
    private readonly now: () => number,
  ) {
    world.on('begin-contact', (contact) => this.began(contact));
  }

  threw(power: number, source: ThrowSource): void {
    this.pending.push({ type: 'throw', tick: this.now(), power, source });
  }

  judged(outcome: Outcome): void {
    const { result, reason, points } = outcome;
    this.pending.push({ type: 'outcome', tick: this.now(), result, reason, points });
  }

  /**
   * Call once after each physics step. A bottle lying on its side touches the table with more than
   * one shape at once, so all the hits of one step become a single event: the hardest. Returns whether the bottle began touching the table.
   */
  stepped(): boolean {
    const touched = this.touched;
    this.touched = false;
    if (this.hardestHit > 0) {
      this.pending.push({ type: 'impact', tick: this.now(), speed: this.hardestHit });
    }
    this.hardestHit = 0;
    return touched;
  }

  /** Hand over everything queued since the last call, oldest first, and start an empty queue. */
  drain(): SimEvent[] {
    const events = this.pending;
    this.pending = [];
    return events;
  }

  private began(contact: Contact): void {
    const bodyA = contact.getFixtureA().getBody();
    const bodyB = contact.getFixtureB().getBody();
    if (bodyA !== this.table && bodyB !== this.table) return;
    this.touched = true;
    const bottle = bodyA === this.table ? bodyB : bodyA;
    const manifold = contact.getWorldManifold(null);
    if (!manifold) return;
    // The normal points from fixture A to fixture B; turn it to point from the table to the bottle.
    const sign = bodyA === this.table ? 1 : -1;
    for (let i = 0; i < manifold.pointCount; i++) {
      const v = bottle.getLinearVelocityFromWorldPoint(manifold.points[i]);
      const approach = -sign * (v.x * manifold.normal.x + v.y * manifold.normal.y);
      this.hardestHit = Math.max(this.hardestHit, approach);
    }
  }
}
