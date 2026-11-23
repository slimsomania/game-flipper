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
  /**
   * The sloshing switch (F023): 0 (the default) keeps the water solid, one body with the bottle;
   * 1 makes it a separate mass that slides along the bottle's axis (see `slosh.ts`). It is a number
   * like every tuning field, so the panel can edit it; any value of 0.5 or more counts as on. It
   * applies from the next bottle.
   */
  sloshing: number;
  /** Sloshing: how fast the water's spring pulls it back to the base, in cycles per second. */
  sloshFrequency: number;
  /** Sloshing: damping of that spring as a fraction of critical (1 = no overshoot, 0 = rings forever). */
  sloshDamping: number;
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
  /**
   * Throws in a round (design section 2). Read as a whole number of at least 1; after the last
   * throw's result the phase is `roundOver`.
   */
  throwsPerRound: number;
  /**
   * An impact with the table slower than this, in m/s, makes no sound: it is the settling taps of
   * a bottle coming to rest, not a knock.
   */
  knockMinSpeed: number;
  /** An impact at or above this speed, in m/s, is a knock at full volume; slower ones are quieter. */
  knockFullSpeed: number;
  /** No knock sounds within this many seconds of the one before it (a bounce is not a roll of drums). */
  knockGapSeconds: number;
  /** An impact with the table slower than this, in m/s, shakes nothing (a bottle settling, not landing). */
  shakeMinSpeed: number;
  /** An impact at or above this speed, in m/s, shakes the camera by the most it ever does (`shakeMaxPixels`). */
  shakeFullSpeed: number;
  /**
   * The cap on the camera shake: the farthest, in logical game pixels, the picture is ever moved
   * from where it rests. It stays well inside the smallest margin between any text and the edge of
   * the canvas (22 px), so the shake never cuts a text off.
   */
  shakeMaxPixels: number;
  /** A shake dies away in a straight line over this many seconds. */
  shakeSeconds: number;
  /** The landing clip (F026) starts this many seconds before the first table contact... */
  replayLeadSeconds: number;
  /** ...and ends this many seconds after it (or where the recording ends). */
  replayTailSeconds: number;
  /** The replay of the landing clip (F027) plays at this fraction of real speed (0.4 = slow motion). */
  replaySpeed: number;
}

/** The default replay speed (F027); unit tests switch the replay off by default, see tests/unit/noReplaySetup.ts. */
export const REPLAY_SPEED = 0.4;

export const DEFAULT_TUNING: Readonly<Tuning> = {
  // Design open question 2: 10% to 90% in 5% steps.
  waterMin: 0.1,
  waterMax: 0.9,
  waterStep: 0.05,
  // F009 calibration (see D23 in docs/ARCHITECTURE.md), retuned in F020 against the simulated
  // players (D33) and again in F034 for the taller, slimmer bottle: a light shell lets the water
  // dominate the mass, so the power a bottle needs rises by a factor of about 3 from 10% to
  // 90%, and no single power lands most bottles.
  shellDensity: 0.3278092185059026,
  waterDensity: 1,
  // F023: off, so every existing behavior is unchanged. When on, the water springs back to the
  // base about 3 times a second and settles within half a second.
  sloshing: 1,
  sloshFrequency: 2.8446218403331898,
  sloshDamping: 0.6276849734699558,
  // A lower friction, almost no bounce and a very strong spin damping make the rotation settle
  // early in the flight, so the angle at landing changes slowly with the power: that is what gives
  // a single flip a window of power instead of one lucky value (F020 had friction 0.76 and damping
  // 2.5 for the squat bottle; the slim one tips back from a smaller angle and needs the damping).
  bottleFriction: 0.1552035820996437,
  bottleRestitution: 0.024427701167349058,
  bottleAngularDamping: 4.6818819919909975,
  bottleLinearDamping: 0.32955820800259056,
  // Forward of straight up: a wider angle (F020: 5.9°) sends the throw farther out over the table.
  // It stays just under 14° (a drift under 0.25 of the upward speed: "a small drift").
  throwAngleDeg: 13.9,
  // The linear impulse sets the height of the flight. F034 (2026-11-22, the human's choice) trades
  // a little difficulty for a real throw: at the 10%, 50% and 90% window centers the whole bottle
  // rises about 0.13 to 0.36 m above the held bottle's top and lands about 0.9 to 1.0 m out from
  // the hand. The price is a new player's expected rate of about 44% (design aim: about 30%).
  throwLinearImpulse: 6.240787451910916,
  throwAngularImpulse: 8.255105572358172,
  // A spin that is almost the same at every power but climbs steadily toward 100, so a double flip
  // is still within reach of a full bottle.
  throwSpinExponent: 0.03218375885331877,
  throwSpinGrowth: 0.016786764629188135,
  // Design section 2: upright within 15° for 0.5 s (an upright, still bottle cannot fall any
  // more, so a longer hold was only waiting); a throw with no outcome after 5 s fails.
  uprightToleranceDeg: 15,
  uprightHoldSeconds: 0.5,
  timeoutSeconds: 5,
  // Past 135° from upright the bottle is on its cap, otherwise on its side.
  capAngleDeg: 135,
  // Planck puts a body to sleep below 0.01 m/s and 2°/s; "nearly still" is a little looser.
  stillSpeed: 0.05,
  stillSpin: 0.1,
  // A fail is decided sooner than a success, so a lost bottle doesn't make the player wait.
  failRestSeconds: 0.5,
  offTableDepth: 0.1,
  // Design section 2: the next bottle appears about 1 s after the result.
  resultDelaySeconds: 1,
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
  // the box around the bottle (80 px wide, 148 px tall since F034) still grabs it.
  pushMinPower: 1,
  grabPadding: 12,
  // F013: design section 2, a round is 10 throws.
  throwsPerRound: 10,
  // F016: a thrown bottle first hits the table at 3 to 8 m/s, and its later bounces are 2 m/s or
  // less; the taps of a bottle settling are about 0.1 m/s. Design: no two knocks within 100 ms.
  knockMinSpeed: 0.35,
  knockFullSpeed: 8,
  knockGapSeconds: 0.1,
  // F021: the same speeds as the knock, so a hit you can hear is one you can feel. The cap of 6 px
  // is a shiver at full hit speed, not a lurch: the HUD sits 22 px from the top-left corner.
  shakeMinSpeed: 1,
  shakeFullSpeed: 8,
  shakeMaxPixels: 6,
  shakeSeconds: 0.25,
  // F026: the approach, then the tip or bounce, around the first touch of the table.
  replayLeadSeconds: 0.4,
  replayTailSeconds: 0.8,
  // F027: slow enough to see the tip or bounce, short enough not to hold up the next throw.
  replaySpeed: REPLAY_SPEED,
};

/** The defaults with `overrides` applied on top. */
export function resolveTuning(overrides: Partial<Tuning> = {}): Tuning {
  return { ...DEFAULT_TUNING, ...overrides };
}
