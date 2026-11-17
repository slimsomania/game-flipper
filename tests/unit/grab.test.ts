import { describe, expect, it } from 'vitest';
import { HAND_X, HAND_Y } from '../../src/core/bottle';
import { Grab, isOnBottle } from '../../src/core/grab';
import { pushPower } from '../../src/core/push';
import { DEFAULT_TUNING } from '../../src/core/tuning';
import { PIXELS_PER_METER, SIM_DT } from '../../src/core/constants';
import { BOTTLE_HALF_WIDTH_PX, BOTTLE_HEIGHT_PX, ON_BOTTLE, pushPath, T0 } from './mouseHelpers';

const HAND = { x: HAND_X, y: HAND_Y, angle: 0 };
const PAD = DEFAULT_TUNING.grabPadding;
const LEFT = ON_BOTTLE.x - BOTTLE_HALF_WIDTH_PX;
const RIGHT = ON_BOTTLE.x + BOTTLE_HALF_WIDTH_PX;
const BASE = HAND_Y * PIXELS_PER_METER;
const TOP = BASE - BOTTLE_HEIGHT_PX;

describe('isOnBottle', () => {
  it('is true over the bottle, from the base up to the top of the cap', () => {
    expect(isOnBottle(ON_BOTTLE.x, ON_BOTTLE.y, HAND, 0)).toBe(true);
    expect(isOnBottle(ON_BOTTLE.x, BASE - 1, HAND, 0)).toBe(true);
    expect(isOnBottle(ON_BOTTLE.x, TOP + 1, HAND, 0)).toBe(true);
    expect(isOnBottle(LEFT + 1, ON_BOTTLE.y, HAND, 0)).toBe(true);
    expect(isOnBottle(RIGHT - 1, ON_BOTTLE.y, HAND, 0)).toBe(true);
  });

  it('is false away from it, in every direction', () => {
    expect(isOnBottle(LEFT - 1, ON_BOTTLE.y, HAND, 0)).toBe(false);
    expect(isOnBottle(RIGHT + 1, ON_BOTTLE.y, HAND, 0)).toBe(false);
    expect(isOnBottle(ON_BOTTLE.x, BASE + 1, HAND, 0)).toBe(false);
    expect(isOnBottle(ON_BOTTLE.x, TOP - 1, HAND, 0)).toBe(false);
    expect(isOnBottle(900, 150, HAND, PAD)).toBe(false);
    expect(isOnBottle(0, 0, HAND, PAD)).toBe(false);
  });

  it('reaches `padding` pixels further out on every side, and no further', () => {
    // Just inside and just outside each padded edge (not exactly on it: that is floating-point luck).
    const inside = PAD - 0.01;
    const outside = PAD + 0.01;
    expect(isOnBottle(LEFT - inside, ON_BOTTLE.y, HAND, PAD)).toBe(true);
    expect(isOnBottle(LEFT - outside, ON_BOTTLE.y, HAND, PAD)).toBe(false);
    expect(isOnBottle(RIGHT + inside, ON_BOTTLE.y, HAND, PAD)).toBe(true);
    expect(isOnBottle(RIGHT + outside, ON_BOTTLE.y, HAND, PAD)).toBe(false);
    expect(isOnBottle(ON_BOTTLE.x, TOP - inside, HAND, PAD)).toBe(true);
    expect(isOnBottle(ON_BOTTLE.x, TOP - outside, HAND, PAD)).toBe(false);
    expect(isOnBottle(ON_BOTTLE.x, BASE + inside, HAND, PAD)).toBe(true);
    expect(isOnBottle(ON_BOTTLE.x, BASE + outside, HAND, PAD)).toBe(false);
  });

  it('treats a negative padding as none', () => {
    expect(isOnBottle(LEFT - 1, ON_BOTTLE.y, HAND, -20)).toBe(false);
    expect(isOnBottle(ON_BOTTLE.x, ON_BOTTLE.y, HAND, -20)).toBe(true);
  });

  it('follows a turned bottle: a quarter turn clockwise lays the cap toward +x', () => {
    const turned = { ...HAND, angle: Math.PI / 2 };
    // 0.9 of the bottle's height out from its base along its (now sideways) axis:
    const along = { x: ON_BOTTLE.x + BOTTLE_HEIGHT_PX * 0.9, y: BASE };
    expect(isOnBottle(along.x, along.y, turned, 0)).toBe(true);
    expect(isOnBottle(along.x, along.y, HAND, 0)).toBe(false);
    // Where the upright bottle's top was is now beside the bottle, not on it.
    expect(isOnBottle(ON_BOTTLE.x, TOP + 1, turned, 0)).toBe(false);
  });

  it('is false for a point that is not a number', () => {
    expect(isOnBottle(Number.NaN, ON_BOTTLE.y, HAND, PAD)).toBe(false);
    expect(isOnBottle(ON_BOTTLE.x, Number.NaN, HAND, PAD)).toBe(false);
    expect(isOnBottle(Infinity, ON_BOTTLE.y, HAND, PAD)).toBe(false);
  });
});

describe('Grab', () => {
  const tuning = DEFAULT_TUNING;

  it('is idle until begin, and ignores moves, idle steps and releases before it', () => {
    const grab = new Grab();
    expect(grab.active).toBe(false);
    expect(grab.move(300, T0, tuning)).toBe(false);
    grab.idle();
    expect(grab.power(tuning)).toBe(0);
    expect(grab.finish(tuning, T0, 100)).toBe(0);
    expect(grab.active).toBe(false);
  });

  it('begins with a finite position and time, and refuses anything else', () => {
    const grab = new Grab();
    expect(grab.begin(Number.NaN, T0, 50)).toBe(false);
    expect(grab.begin(300, Infinity, 50)).toBe(false);
    expect(grab.active).toBe(false);
    expect(grab.begin(300, T0, 50)).toBe(true);
    expect(grab.active).toBe(true);
    expect(grab.barBefore).toBe(50);
  });

  it('gives 0 for a press with no movement yet', () => {
    const grab = new Grab();
    grab.begin(300, T0, 50);
    expect(grab.power(tuning)).toBe(0);
  });

  it('gives the power of the samples so far, as pushPower does', () => {
    const samples = pushPath(200, 0.1);
    const grab = new Grab();
    grab.begin(samples[0].y, samples[0].t, 50);
    for (let i = 1; i < samples.length; i++) {
      grab.move(samples[i].y, samples[i].t, tuning);
      expect(grab.power(tuning)).toBe(pushPower(samples.slice(0, i + 1), tuning));
    }
    expect(grab.power(tuning)).toBeGreaterThan(50);
  });

  it('counts a pointer that stopped as still: the power fades with the idle steps and ends at 0', () => {
    const samples = pushPath(200, 0.1);
    const grab = new Grab();
    grab.begin(samples[0].y, samples[0].t, 50);
    for (const s of samples.slice(1)) grab.move(s.y, s.t, tuning);
    const moving = grab.power(tuning);

    const powers: number[] = [];
    for (let i = 0; i < 12; i++) {
      grab.idle();
      powers.push(grab.power(tuning));
    }
    // The push is 100 ms long inside a 150 ms window, so nothing is lost for the first few steps;
    // after that the start of the push leaves the window and the power falls.
    expect(powers[0]).toBeLessThanOrEqual(moving);
    expect(powers[5]).toBeLessThan(moving); // 6 steps = 100 ms
    expect(powers[5]).toBeGreaterThan(0);
    for (let i = 1; i < powers.length; i++) expect(powers[i]).toBeLessThanOrEqual(powers[i - 1]);
    // 150 ms is 9 steps: the whole push has left the window.
    expect(powers[Math.round(tuning.pushWindowSeconds / SIM_DT) + 1]).toBe(0);
    expect(powers[powers.length - 1]).toBe(0);
  });

  it('starts counting idle time again from every new sample', () => {
    const samples = pushPath(200, 0.1);
    const grab = new Grab();
    grab.begin(samples[0].y, samples[0].t, 50);
    for (const s of samples.slice(1)) grab.move(s.y, s.t, tuning);
    for (let i = 0; i < 30; i++) grab.idle();
    expect(grab.power(tuning)).toBe(0);
    const last = samples[samples.length - 1];
    grab.move(last.y - 100, last.t + 0.5, tuning);
    grab.move(last.y - 200, last.t + 0.55, tuning);
    expect(grab.power(tuning)).toBeGreaterThan(0);
  });

  it('takes a time that runs backward as the same moment', () => {
    const grab = new Grab();
    grab.begin(500, T0, 50);
    grab.move(450, T0 + 0.05, tuning);
    grab.move(400, T0 + 0.01, tuning); // earlier than the last sample
    const power = grab.power(tuning);
    expect(Number.isFinite(power)).toBe(true);
    expect(power).toBeGreaterThan(0);
  });

  it('ignores a move that is not a number, and leaves the grab as it was', () => {
    const grab = new Grab();
    grab.begin(500, T0, 50);
    grab.move(450, T0 + 0.05, tuning);
    const before = grab.power(tuning);
    expect(grab.move(Number.NaN, T0 + 0.06, tuning)).toBe(false);
    expect(grab.move(400, Infinity, tuning)).toBe(false);
    expect(grab.power(tuning)).toBe(before);
  });

  it('finish adds the release as a sample, ends the grab and keeps barBefore', () => {
    const samples = pushPath(200, 0.1);
    const grab = new Grab();
    grab.begin(samples[0].y, samples[0].t, 61);
    for (const s of samples.slice(1)) grab.move(s.y, s.t, tuning);
    const last = samples[samples.length - 1];

    const power = grab.finish(tuning, last.t + 0.01, last.y - 10);
    expect(power).toBe(pushPower([...samples, { t: last.t + 0.01, y: last.y - 10 }], tuning));
    expect(grab.active).toBe(false);
    expect(grab.power(tuning)).toBe(0);
    expect(grab.barBefore).toBe(61);
  });

  it('finish with no position counts the pointer as where it was last seen', () => {
    const samples = pushPath(200, 0.1);
    const last = samples[samples.length - 1];
    const play = (): Grab => {
      const grab = new Grab();
      grab.begin(samples[0].y, samples[0].t, 50);
      for (const s of samples.slice(1)) grab.move(s.y, s.t, tuning);
      return grab;
    };
    expect(play().finish(tuning, last.t + 0.02)).toBe(play().finish(tuning, last.t + 0.02, last.y));
    // A release time that isn't a number counts as the last sample's own moment.
    expect(play().finish(tuning, Number.NaN)).toBe(play().finish(tuning, last.t, last.y));
  });

  it('a pointer that stopped long before the release gives no push', () => {
    const samples = pushPath(200, 0.1);
    const last = samples[samples.length - 1];
    const grab = new Grab();
    grab.begin(samples[0].y, samples[0].t, 50);
    for (const s of samples.slice(1)) grab.move(s.y, s.t, tuning);
    expect(grab.finish(tuning, last.t + 0.5, last.y)).toBe(0);
  });

  it('forgets old samples without changing the power: a long drag equals its last moments', () => {
    const wander = (t: number): number => 500 - 30 * Math.sin(t * 7);
    const longRun = new Grab();
    longRun.begin(wander(0), T0, 50);
    const shortRun = new Grab();
    const hz = 120;
    const total = 10 * hz; // ten seconds
    for (let i = 1; i <= total; i++) {
      const t = T0 + i / hz;
      longRun.move(wander(i / hz), t, tuning);
      if (i === total - 40) shortRun.begin(wander(i / hz), t, 50);
      else if (i > total - 40) shortRun.move(wander(i / hz), t, tuning);
    }
    expect(longRun.power(tuning)).toBe(shortRun.power(tuning));
  });

  it('cancel drops the grab without a result', () => {
    const grab = new Grab();
    grab.begin(500, T0, 50);
    grab.move(300, T0 + 0.05, tuning);
    grab.cancel();
    expect(grab.active).toBe(false);
    expect(grab.power(tuning)).toBe(0);
    expect(grab.barBefore).toBe(50);
  });
});
