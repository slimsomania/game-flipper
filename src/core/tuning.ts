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
  /** How fast the bottle's spin dies away (per second, 0 = never), in the air and on the table. */
  bottleAngularDamping: number;
  /** How fast the bottle's travel dies away (per second, 0 = never): a little air drag. */
  bottleLinearDamping: number;
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
  /**
   * The shape of the spin curve: a throw at power p applies this fraction of the angular impulse,
   * `(p/100)^throwSpinExponent * exp(throwSpinGrowth * (p - 100))`. At power 100 it is 1 and at
   * power 0 it is 0 (the exponent must be above 0). Exponent 1 with growth 0 is a straight line.
   * A smaller exponent gives a lot of spin early; a positive growth makes the spin climb faster
   * and faster toward 100. Together they let the rotation rise slowly through a bottle's single
   * flip window and still reach a double flip by power 100.
   */
  throwSpinExponent: number;
  /** The exponential part of the spin curve, per point of power (see `throwSpinExponent`). */
  throwSpinGrowth: number;
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
  /** Where the power bar starts, in percent (0 to 100). It keeps its value between bottles. */
  powerStart: number;
  /** One tap of Up or Down (a key press) moves the bar by this many points. */
  powerTapStep: number;
  /** One notch of the mouse wheel moves the bar by this many points. */
  powerWheelStep: number;
  /** A key held longer than this many seconds starts moving the bar continuously... */
  powerHoldDelaySeconds: number;
  /** ...at first this many points per second... */
  powerHoldRateStart: number;
  /** ...speeding up in a straight line to this many points per second... */
  powerHoldRateMax: number;
  /** ...over this many seconds of moving. */
  powerHoldRampSeconds: number;
  /** A mouse push is measured over this many seconds before the release (design: 150 ms). */
  pushWindowSeconds: number;
  /**
   * The push speed is the fastest upward movement over any stretch of this many seconds inside the
   * window, so a push that is quick and then stops still counts as quick. Never longer than the window.
   */
  pushSpeedSpanSeconds: number;
  /** How much the distance and the speed each count in the mix. Only their ratio matters. */
  pushDistanceWeight: number;
  pushSpeedWeight: number;
  /** An upward distance, in logical game pixels, at which the distance part alone is full power... */
  pushFullDistance: number;
  /** ...and an upward speed, in logical game pixels per second, at which the speed part is. */
  pushFullSpeed: number;
  /**
   * A release with a push weaker than this power (0 to 100) is not a throw: the grab is simply
   * dropped. It is what makes a click on the bottle, or a push with no upward movement, harmless.
   */
  pushMinPower: number;
  /**
   * How far outside the bottle's outline (a box around the whole bottle), in logical game pixels,
   * a press still grabs it, so the bottle is easy to catch with the mouse.
   */
  grabPadding: number;
}

export const DEFAULT_TUNING: Readonly<Tuning> = {
  // Design open question 2: 10% to 90% in 5% steps.
  waterMin: 0.1,
  waterMax: 0.9,
  waterStep: 0.05,
  // F009 calibration (see D23 in docs/ARCHITECTURE.md). A heavy shell keeps the water from
  // dominating the mass, so the power a bottle needs rises by a factor of 1.5 to 2 from 10% to 90%.
  shellDensity: 0.9,
  waterDensity: 1,
  // High friction and almost no bounce make a landing stick instead of skipping, and strong spin
  // damping makes the rotation settle early in the flight, so the angle at landing changes slowly
  // with the power: that is what gives a single flip a window of power instead of one lucky value.
  bottleFriction: 0.7,
  bottleRestitution: 0.04,
  bottleAngularDamping: 2.55,
  bottleLinearDamping: 0.34,
  throwAngleDeg: 6,
  throwLinearImpulse: 9.2,
  throwAngularImpulse: 6.25,
  // A spin that is almost the same at every power but climbs steadily toward 100, so a double flip
  // is still within reach of a full bottle.
  throwSpinExponent: 0.03,
  throwSpinGrowth: 0.013,
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
  // F006: a tap is a fine step, the wheel a coarser one, and a held key speeds up from a slow
  // creep (for a few points) to a fast sweep (about 2.5 s for the whole bar).
  powerStart: 50,
  powerTapStep: 1,
  powerWheelStep: 2,
  powerHoldDelaySeconds: 0.25,
  powerHoldRateStart: 12,
  powerHoldRateMax: 60,
  powerHoldRampSeconds: 1.5,
  // F011: 300 px up in 150 ms (2000 px/s) is a hard flick of an ordinary mouse and gives full power;
  // 40 px in 150 ms is a nudge and gives about 13. Distance and speed count the same.
  pushWindowSeconds: 0.15,
  pushSpeedSpanSeconds: 0.05,
  pushDistanceWeight: 1,
  pushSpeedWeight: 1,
  pushFullDistance: 300,
  pushFullSpeed: 2000,
  // F012: under 1 point of power is a click or a jitter, not a throw. A press up to 12 px outside
  // the 100 px wide bottle still grabs it.
  pushMinPower: 1,
  grabPadding: 12,
};

/** The defaults with `overrides` applied on top. */
export function resolveTuning(overrides: Partial<Tuning> = {}): Tuning {
  return { ...DEFAULT_TUNING, ...overrides };
}
