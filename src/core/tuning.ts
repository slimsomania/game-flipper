/*
 * Tunable gameplay numbers: the single home for every number that changes how the game feels.
 * Features add their own fields here. The Simulation takes a `Partial<Tuning>` of overrides
 * (see `SimulationOptions`), so tests and the developer tuning panel can change the feel without
 * editing code. Shape and layout constants (the bottle's dimensions, the table) are not tuning:
 * they live next to the code that builds them.
 */

export interface Tuning {
  /** Lowest water level a new bottle can have, as a fraction of the bottle body (0 to 1). */
  waterMin: number;
  /** Highest water level a new bottle can have. */
  waterMax: number;
  /** Water levels are `waterMin` plus a whole number of steps, up to `waterMax`. */
  waterStep: number;
  /**
   * Density of the plastic shell, in mass per square meter of the drawn silhouette. The shell is
   * modelled as solid polygons, so this is an effective value rather than a real plastic density.
   */
  shellDensity: number;
  /** Density of the water. Water is the reference: 1 unit of mass per square meter of fill. */
  waterDensity: number;
  /** Friction of the bottle's shell against the table. */
  bottleFriction: number;
  /** Bounciness of the bottle's shell (0 = none). */
  bottleRestitution: number;
  /** Throw direction: degrees forward of straight up, toward the table. Fixed for every throw. */
  throwAngleDeg: number;
  /**
   * Linear impulse of a throw at power 100, in mass·m/s. A throw at power p applies p/100 of it
   * at the center of mass, and the bottle divides it by its mass, so a fuller bottle launches
   * slower.
   */
  throwLinearImpulse: number;
  /**
   * Angular impulse of a throw at power 100, in mass·m²/s, clockwise. The bottle divides it by
   * its inertia, so a fuller bottle spins slower.
   */
  throwAngularImpulse: number;
  /** A bottle standing within this many degrees of upright (after any whole turns) is upright. */
  uprightToleranceDeg: number;
  /** Seconds the bottle must stand upright, on the table and nearly still, to succeed. */
  uprightHoldSeconds: number;
  /** Resting more than this many degrees from upright is on the cap; any other tilt is a side. */
  capAngleDeg: number;
  /** "Nearly still" means slower than this, in m/s... */
  stillSpeed: number;
  /** ...and turning slower than this, in rad/s. */
  stillSpin: number;
  /** Seconds a bottle must lie nearly still on the table (not upright) to be judged a fail. */
  failRestSeconds: number;
  /** The bottle is off the table once its lowest point is this many meters below the tabletop. */
  offTableDepth: number;
  /** A throw with no outcome this many seconds after release is a fail. */
  timeoutSeconds: number;
  /** Seconds the result stays up after the outcome, before the next bottle appears. */
  resultDelaySeconds: number;
}

export const DEFAULT_TUNING: Readonly<Tuning> = {
  // Design open question 2: 10% to 90% in 5% steps.
  waterMin: 0.1,
  waterMax: 0.9,
  waterStep: 0.05,
  // Starting point; F009 calibrates the throw against it. An empty bottle weighs about 40% of a
  // 50%-full one, so water is a clear but not overwhelming part of the mass.
  shellDensity: 0.35,
  waterDensity: 1,
  // Carried over from the placeholder bottle.
  bottleFriction: 0.6,
  bottleRestitution: 0.15,
  // Starting values for F003; F009 calibrates them so every bottle has a single-flip window.
  throwAngleDeg: 12,
  throwLinearImpulse: 9,
  throwAngularImpulse: 1,
  // Design section 2: upright within 15° for 1 s; a throw with no outcome after 5 s fails.
  uprightToleranceDeg: 15,
  uprightHoldSeconds: 1,
  timeoutSeconds: 5,
  // Past 135° from upright the bottle is on its cap, otherwise on its side.
  capAngleDeg: 135,
  // Planck puts a body to sleep below 0.01 m/s and 2°/s; "nearly still" is a little looser.
  stillSpeed: 0.05,
  stillSpin: 0.1,
  // A fail is decided sooner than a success, so a lost bottle doesn't make the player wait.
  failRestSeconds: 0.5,
  offTableDepth: 0.1,
  // Design section 2: the next bottle appears about 1.5 s after the result.
  resultDelaySeconds: 1.5,
};

/** The defaults with `overrides` applied on top. */
export function resolveTuning(overrides: Partial<Tuning> = {}): Tuning {
  return { ...DEFAULT_TUNING, ...overrides };
}
