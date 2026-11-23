import { Polygon, PrismaticJoint, Vec2, type Body, type World } from 'planck';
import { BOTTLE_BODY_HEIGHT, BOTTLE_WALL, waterVertices } from './bottleShape';
import type { Tuning } from './tuning';

/*
 * Sloshing water (F023): the water as a body of its own, joined to the bottle's shell by a
 * prismatic joint along the bottle's axis (local -y, toward the cap). It can slide from resting on
 * the base up to the end of the empty space above the water, and a spring and a damper pull it
 * back to the base. It is built only when the tuning's `sloshing` switch is on; otherwise the
 * water is a fixture of the bottle's own body (bottle.ts) and nothing here runs.
 */

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

  /** Build the water at `level` (> 0, with real water) on `shell`, resting on the base. */
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
      // The same damping as the shell, so the bottle slows and stops spinning as the solid one does.
      angularDamping: tuning.bottleAngularDamping,
      linearDamping: tuning.bottleLinearDamping,
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
  }

  /** Move the water with the shell to a new pose, resting on the base (call right after the shell's setTransform). */
  follow(): void {
    this.body.setTransform(this.shell.getPosition(), this.shell.getAngle());
    this.body.setAwake(true);
  }

  destroy(world: World): void {
    world.destroyBody(this.body); // the joint goes with it
  }
}
