import { Polygon, PrismaticJoint, Vec2, type Body, type World } from 'planck';
import { BOTTLE_BODY_HEIGHT, BOTTLE_WALL, waterVertices } from './bottleShape';
import { GRAVITY, SIM_DT } from './constants';
import { bottleExtent } from './outcome';
import { TABLE_TOP_Y } from './table';
import type { Tuning } from './tuning';

/*
 * Sloshing water (F023): the water as a body of its own, joined to the bottle's shell by a
 * prismatic joint along the bottle's axis (local -y, toward the cap). It can slide from resting on
 * the base up to the end of the empty space above the water, and a spring and a damper pull it
 * back to the base. It is built only when the tuning's `sloshing` switch is on; otherwise the
 * water is a fixture of the bottle's own body (bottle.ts) and nothing here runs.
 *
 * F025: even with sloshing on, the water rides as a fixture of the shell (pinned to the base)
 * through the throw and the free flight, and becomes this body only as the bottle comes down to
 * the table (`shouldReleaseWater`, called by `Bottle.beforeStep`). In free flight nothing can move
 * it, and a fast-spinning pair of bodies on a joint loses angular momentum in the solver.
 */

/**
 * Pinned water is released once the bottle's lowest point, now or anywhere along the next
 * `SLOSH_LOOKAHEAD_STEPS` steps of free flight (its travel, its fall and its spin), comes within
 * this many meters of the tabletop. It is a numerical safety margin, not a feel (like the solver's
 * iteration counts): the release comes before any table contact, whatever the spin
 * (tests/unit/slosh.test.ts checks every level and power, also with no damping), and in free flight
 * released water would stay on the base anyway.
 */
export const SLOSH_RELEASE_MARGIN = 0.05;
/** How many steps ahead the release looks, sampled every quarter step (a corner can swing down fast). */
export const SLOSH_LOOKAHEAD_STEPS = 2;
const SAMPLES_PER_STEP = 4;

/** A bottle in free flight, as planck moves it: center of mass, angle and velocities (y down). */
export interface FlightState {
  /** World position of the center of mass, and its position in the bottle's own frame. */
  center: { x: number; y: number };
  localCenter: { x: number; y: number };
  angle: number;
  /** Velocity of the center of mass, and the spin (clockwise positive). */
  vx: number;
  vy: number;
  omega: number;
}

/**
 * The lowest point (the largest y) the bottle reaches from now through the next
 * `SLOSH_LOOKAHEAD_STEPS` steps of free flight: the center of mass moves on with gravity and the
 * bottle turns about it, as the physics does, sampled every quarter step.
 */
export function lowestPointAhead(state: FlightState): number {
  let lowest = -Infinity;
  const samples = SLOSH_LOOKAHEAD_STEPS * SAMPLES_PER_STEP;
  for (let k = 0; k <= samples; k++) {
    const t = (k / SAMPLES_PER_STEP) * SIM_DT;
    const angle = state.angle + state.omega * t;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const cx = state.center.x + state.vx * t;
    const cy = state.center.y + state.vy * t + 0.5 * GRAVITY * t * t;
    // The base center (the body's origin) sits at the rotated local center back from the center of mass.
    const x = cx - (state.localCenter.x * cos - state.localCenter.y * sin);
    const y = cy - (state.localCenter.x * sin + state.localCenter.y * cos);
    lowest = Math.max(lowest, bottleExtent(x, y, angle).maxY);
  }
  return lowest;
}

/** Should pinned water be released now? `lowestAhead` is `lowestPointAhead` of the bottle, in meters. */
export function shouldReleaseWater(lowestAhead: number): boolean {
  return lowestAhead + SLOSH_RELEASE_MARGIN >= TABLE_TOP_Y;
}

/** Is the sloshing switch on? The switch is a number (0 off, 1 on) so every tuning field is a number. */
export const isSloshing = (tuning: Pick<Tuning, 'sloshing'>): boolean => tuning.sloshing >= 0.5;

/** How far the water can travel toward the cap: the empty height of the body above the water. */
export function sloshLimit(level: number): number {
  return Math.max(0, (1 - Math.min(1, Math.max(0, level))) * BOTTLE_BODY_HEIGHT - BOTTLE_WALL);
}

/** The mass, center and spin of a bundle of bodies moving as one rigid body. */
export interface RigidSummary {
  mass: number;
  /** Center of mass in world coordinates. */
  center: Vec2;
  /** Moment of inertia about `center`. */
  inertia: number;
}

/** Combine bodies (all dynamic) into one rigid summary: total mass, center of mass and inertia. */
export function summarize(bodies: readonly Body[]): RigidSummary {
  let mass = 0;
  let cx = 0;
  let cy = 0;
  for (const b of bodies) {
    const c = b.getWorldCenter();
    mass += b.getMass();
    cx += c.x * b.getMass();
    cy += c.y * b.getMass();
  }
  const center = new Vec2(cx / mass, cy / mass);
  let inertia = 0;
  for (const b of bodies) {
    const local = b.getLocalCenter();
    const own = b.getInertia() - b.getMass() * (local.x * local.x + local.y * local.y);
    const c = b.getWorldCenter();
    inertia += own + b.getMass() * ((c.x - center.x) ** 2 + (c.y - center.y) ** 2);
  }
  return { mass, center, inertia };
}

/** Give every body the velocity it has as a part of a rigid body moving at `v` (at `center`) and spinning at `omega`. */
export function setRigidVelocity(
  bodies: readonly Body[],
  center: Vec2,
  v: { x: number; y: number },
  omega: number,
): void {
  for (const b of bodies) {
    const c = b.getWorldCenter();
    b.setLinearVelocity({ x: v.x - omega * (c.y - center.y), y: v.y + omega * (c.x - center.x) });
    b.setAngularVelocity(omega);
  }
}

export class WaterSlosh {
  readonly body: Body;
  private readonly joint: PrismaticJoint;
  private readonly stiffness: number;
  private readonly damping: number;
  private readonly limit: number;
  private readonly linearDamping: number;
  private readonly angularDamping: number;

  /** Build the water at `level` (> 0, with real water) on `shell`, resting on the base at the shell's current pose. */
  constructor(
    world: World,
    private readonly shell: Body,
    level: number,
    tuning: Tuning,
  ) {
    this.limit = sloshLimit(level);
    const vertices = waterVertices(level);
    if (!vertices) throw new Error('No water to slosh');
    this.body = world.createBody({
      type: 'dynamic',
      position: shell.getPosition(),
      angle: shell.getAngle(),
    });
    this.body.createFixture({
      shape: new Polygon(vertices.map((p) => ({ x: p.x, y: p.y }))),
      density: tuning.waterDensity,
      isSensor: true,
      filterMaskBits: 0,
    });
    this.joint = world.createJoint(
      new PrismaticJoint(
        {
          enableLimit: true,
          lowerTranslation: 0,
          upperTranslation: this.limit,
        },
        shell,
        this.body,
        shell.getPosition(),
        shell.getWorldVector({ x: 0, y: -1 }),
      ),
    )!;
    const omega = 2 * Math.PI * tuning.sloshFrequency;
    this.linearDamping = tuning.bottleLinearDamping;
    this.angularDamping = tuning.bottleAngularDamping;
    this.stiffness = this.body.getMass() * omega * omega;
    this.damping = 2 * tuning.sloshDamping * this.body.getMass() * omega;
  }

  /**
   * Meters the water has slid from the base toward the cap (0 at rest), always between 0 and the
   * limit. The joint solver can overshoot a limit by up to one step of travel on a hard stop, so
   * the value is clamped.
   */
  get offset(): number {
    return Math.min(this.limit, Math.max(0, this.rawOffset));
  }

  private get rawOffset(): number {
    return this.joint.getJointTranslation();
  }

  /** Call before each world step: the spring and damper pull the water back, and push the shell the other way. */
  applyForces(): void {
    const axis = this.shell.getWorldVector({ x: 0, y: -1 });
    const force = -this.stiffness * this.rawOffset - this.damping * this.joint.getJointSpeed();
    const f = { x: axis.x * force, y: axis.y * force };
    this.body.applyForceToCenter(f, true);
    this.shell.applyForceToCenter({ x: -f.x, y: -f.y }, true);
    this.applyRigidDamping();
  }

  /**
   * Damp the shell and the water as one rigid body, as if they were a single body with the
   * bottle's damping: the shell's own damping is off while the water is a body of its own (an
   * undamped water would keep the spin of a full bottle). Like Box2D's damping, a velocity is
   * scaled by 1 / (1 + dt * damping): the combined center's velocity by the linear damping, the
   * spin and the velocity it causes by the angular damping. The water's slide along the bottle
   * is left alone.
   */
  private applyRigidDamping(): void {
    const bodies = [this.shell, this.body];
    const { mass, center } = summarize(bodies);
    const omega = this.shell.getAngularVelocity();
    let vx = 0;
    let vy = 0;
    for (const b of bodies) {
      const v = b.getLinearVelocityFromWorldPoint(center);
      vx += (v.x * b.getMass()) / mass;
      vy += (v.y * b.getMass()) / mass;
    }
    const linear = 1 / (1 + SIM_DT * this.linearDamping) - 1;
    const angular = 1 / (1 + SIM_DT * this.angularDamping) - 1;
    for (const b of bodies) {
      const c = b.getWorldCenter();
      const v = b.getLinearVelocity();
      b.setLinearVelocity({
        x: v.x + vx * linear - omega * (c.y - center.y) * angular,
        y: v.y + vy * linear + omega * (c.x - center.x) * angular,
      });
      b.setAngularVelocity(b.getAngularVelocity() * (1 + angular));
    }
  }

  destroy(world: World): void {
    world.destroyBody(this.body); // the joint goes with it
  }
}
