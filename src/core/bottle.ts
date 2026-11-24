import { Polygon, type Body, type Fixture, type World } from 'planck';
import { BOTTLE_PARTS, waterVertices, type Point } from './bottleShape';
import type { LandingSample } from './outcome';
import type { Rng } from './rng';
import { WaterSlosh, isSloshing, setRigidVelocity, summarize } from './slosh';
import { TABLE_LEFT_X, TABLE_TOP_Y } from './table';
import type { ThrowImpulse } from './throw';
import type { Tuning } from './tuning';

/*
 * The bottle as a physics body: the plastic shell from four convex fixtures (body, shoulder, neck,
 * cap) plus the water as one more fixture that adds mass but never collides. The geometry comes
 * from bottleShape.ts, which the drawing uses too.
 */

/**
 * Where the bottle waits before a throw: the center of its base, above the table near the left
 * end. The base hangs 1 m above the tabletop, 1.2 m in from the left end.
 */
export const HAND_X = TABLE_LEFT_X + 1.2;
export const HAND_Y = TABLE_TOP_Y - 1;

/**
 * An exact starting state for a bottle (see `Simulation.placeBottle`): the position of the center
 * of its base in meters, the angle in radians (clockwise, any number of turns) and, optionally,
 * the linear velocity in m/s and angular velocity in rad/s (each 0 when left out).
 */
export interface BottlePose {
  x: number;
  y: number;
  angle: number;
  vx?: number;
  vy?: number;
  omega?: number;
  /**
   * Turns (whole or fractional, 0 when left out) the landing judge counts as already made, so a
   * test can place an upright bottle and still have it count as flipped. It is a bookkeeping
   * credit for the judge, not part of the pose: `Bottle.place` ignores it and nothing rotates.
   */
  turns?: number;
}

/** Is every number in the pose (left-out ones count as 0) finite? `placeBottle` refuses a pose that isn't. */
export function isFinitePose(pose: BottlePose): boolean {
  const numbers = [pose.x, pose.y, pose.angle, pose.vx, pose.vy, pose.omega, pose.turns];
  return numbers.every((n) => Number.isFinite(n ?? 0));
}

const toVec = (points: readonly Point[]): { x: number; y: number }[] =>
  points.map((p) => ({ x: p.x, y: p.y }));

/**
 * Pick the water level for the next bottle from the seeded RNG: `waterMin` plus a whole number
 * of `waterStep`s, up to `waterMax`. Consumes exactly one random number.
 */
export function drawWaterLevel(rng: Rng, tuning: Tuning): number {
  const steps = Math.max(0, Math.round((tuning.waterMax - tuning.waterMin) / tuning.waterStep));
  const level = tuning.waterMin + rng.int(0, steps) * tuning.waterStep;
  // Round away floating-point noise so levels are clean numbers such as 0.15.
  return Math.round(level * 1e6) / 1e6;
}

export class Bottle {
  readonly body: Body;
  private shellFixtures: Fixture[] = [];
  private waterFixture: Fixture | null = null;
  private level = 0;
  /** The water as a body of its own, when the tuning's sloshing switch is on (and there is water). */
  private slosh: WaterSlosh | null = null;

  /**
   * Creates the bottle held in the hand: upright, still and unaffected by gravity (a kinematic
   * body). A throw makes it dynamic with `release()`.
   */
  constructor(
    private readonly world: World,
    private tuning: Tuning,
    water: number,
  ) {
    this.body = world.createBody({
      type: 'kinematic',
      position: { x: HAND_X, y: HAND_Y },
      bullet: true,
      angularDamping: tuning.bottleAngularDamping,
      linearDamping: tuning.bottleLinearDamping,
    });
    this.buildShell();
    this.setWater(water);
  }

  private buildShell(): void {
    this.shellFixtures = BOTTLE_PARTS.map((part) =>
      this.body.createFixture({
        shape: new Polygon(toVec(part.vertices)),
        density: this.tuning.shellDensity,
        friction: this.tuning.bottleFriction,
        restitution: this.tuning.bottleRestitution,
      }),
    );
  }

  /** Water level, the filled fraction of the body (0 to 1). */
  get water(): number {
    return this.level;
  }

  /**
   * Rebuild the shell and the water with new tuning (density, friction, bounce). Only meant for
   * the held bottle: the Simulation never calls it once the bottle is in flight.
   */
  applyTuning(tuning: Tuning): void {
    this.tuning = tuning;
    this.body.setAngularDamping(tuning.bottleAngularDamping);
    this.body.setLinearDamping(tuning.bottleLinearDamping);
    for (const fixture of this.shellFixtures) this.body.destroyFixture(fixture);
    this.buildShell();
    this.setWater(this.level);
  }

  /** Change the water level (clamped to 0..1), rebuilding the water's mass. */
  setWater(level: number): void {
    this.level = Math.min(1, Math.max(0, level));
    if (this.waterFixture) this.body.destroyFixture(this.waterFixture);
    this.waterFixture = null;
    this.slosh?.destroy(this.world);
    this.slosh = null;
    const vertices = waterVertices(this.level);
    if (!vertices) return;
    this.body.setAngularDamping(this.tuning.bottleAngularDamping);
    this.body.setLinearDamping(this.tuning.bottleLinearDamping);
    if (isSloshing(this.tuning)) {
      this.slosh = new WaterSlosh(this.world, this.body, this.level, this.tuning);
      // The slosh damps shell and water together (as forces); the shell's own damping would count twice.
      this.body.setAngularDamping(0);
      this.body.setLinearDamping(0);
      return;
    }
    this.waterFixture = this.body.createFixture({
      shape: new Polygon(toVec(vertices)),
      density: this.tuning.waterDensity,
      // Water only adds mass. It never touches the table or anything else.
      isSensor: true,
      filterMaskBits: 0,
    });
  }

  /** Remove the bottle from the world, for good. The Simulation does this when the next one comes. */
  destroy(): void {
    this.slosh?.destroy(this.world);
    this.world.destroyBody(this.body);
  }

  /** Let go of the bottle: it becomes a normal dynamic body that gravity moves. */
  release(): void {
    this.body.setType('dynamic');
  }

  /**
   * Release the bottle from an exact pose, as if it had been thrown there: it starts at the given
   * position and angle with the given velocities. Call it once, on the held bottle.
   */
  place(pose: BottlePose): void {
    this.body.setTransform({ x: pose.x, y: pose.y }, pose.angle);
    this.slosh?.follow();
    this.release();
    this.setRigidMotion({ x: pose.vx ?? 0, y: pose.vy ?? 0 }, pose.omega ?? 0);
    this.body.setAwake(true);
  }

  /** Start the whole bottle (shell and any sloshing water) moving as one rigid body: its center of mass moving at `v` and spinning at `omega`. */
  private setRigidMotion(v: { x: number; y: number }, omega: number): void {
    if (!this.slosh) {
      this.body.setLinearVelocity(v);
      this.body.setAngularVelocity(omega);
      return;
    }
    const bodies = [this.body, this.slosh.body];
    setRigidVelocity(bodies, summarize(bodies).center, v, omega);
  }

  /** Meters the sloshing water has slid from the base toward the cap: 0 for solid water and at rest. */
  get waterOffset(): number {
    return this.slosh?.offset ?? 0;
  }

  /** Mass of the shell plus the water, however the water is modelled. Only meaningful once released. */
  get totalMass(): number {
    return this.body.getMass() + (this.slosh?.body.getMass() ?? 0);
  }

  /** Call before each world step: the water's spring and damper act. */
  beforeStep(): void {
    this.slosh?.applyForces();
  }

  /** True while the bottle's shell is touching `other`. */
  touches(other: Body): boolean {
    for (let edge = this.body.getContactList(); edge; edge = edge.next) {
      if (edge.other === other && edge.contact.isTouching()) return true;
    }
    return false;
  }

  /** What the landing judge sees: the bottle's pose and speeds, and whether it rests on `table`. */
  landingSample(table: Body): LandingSample {
    const p = this.body.getPosition();
    const v = this.body.getLinearVelocity();
    return {
      x: p.x,
      y: p.y,
      angle: this.body.getAngle(),
      vx: v.x,
      vy: v.y,
      omega: this.body.getAngularVelocity(),
      onTable: this.touches(table),
    };
  }

  /**
   * Release the bottle and give it a throw: both impulses act at the center of mass, and the body
   * divides them by its own mass and inertia. Call it once, on the held bottle.
   */
  launch(impulse: ThrowImpulse): void {
    this.release(); // a kinematic body reports no mass, so it must be dynamic first
    if (this.slosh) {
      // The same launch as the solid bottle (same total mass, center and inertia), shared by both bodies.
      const bodies = [this.body, this.slosh.body];
      const { mass, center, inertia } = summarize(bodies);
      setRigidVelocity(
        bodies,
        center,
        { x: impulse.linear.x / mass, y: impulse.linear.y / mass },
        impulse.angular / inertia,
      );
      return;
    }
    this.body.applyLinearImpulse(impulse.linear, this.body.getWorldCenter(), true);
    this.body.applyAngularImpulse(impulse.angular, true);
  }
}
