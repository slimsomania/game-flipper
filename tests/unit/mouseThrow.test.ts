import { describe, expect, it } from 'vitest';
import { pushPower } from '../../src/core/push';
import { Simulation, type SimSnapshot } from '../../src/core/simulation';
import { DEFAULT_TUNING } from '../../src/core/tuning';
import { FLIPPED } from '../shared';
import { RESULT_STEPS, expectHeld, run, runToOutcome } from './helpers';
import { BOTTLE_HALF_WIDTH_PX, ON_BOTTLE, T0, mousePush, playDrag, pushPath } from './mouseHelpers';

const sim = (seed = 7): Simulation => new Simulation({ seed });

describe('grabbing the held bottle', () => {
  it('a press on the bottle grabs it: dragging is true and the bottle stays in the hand', () => {
    const s = sim();
    expect(s.snapshot().dragging).toBe(false);
    expect(s.mouse.grab(ON_BOTTLE.x, ON_BOTTLE.y, T0)).toBe(true);
    const grabbed = s.snapshot();
    expect(grabbed.dragging).toBe(true);
    expect(s.mouse.dragging).toBe(true);
    expect(grabbed.phase).toBe('aiming');
    expectHeld(grabbed);
    // A drag moves the pointer, not the bottle.
    s.mouse.drag(ON_BOTTLE.y - 150, T0 + 0.05);
    run(s, 5);
    expectHeld(s.snapshot());
  });

  it('shows the live push on the bar from the press on: 0 until the pointer moves up', () => {
    const s = sim();
    s.powerMeter.set(73);
    s.mouse.grab(ON_BOTTLE.x, ON_BOTTLE.y, T0);
    expect(s.snapshot().power).toBe(0);
  });

  it('a press away from the bottle grabs nothing, and so does one beside it', () => {
    const s = sim();
    expect(s.mouse.grab(900, 150, T0)).toBe(false);
    expect(s.mouse.grab(ON_BOTTLE.x + 200, ON_BOTTLE.y, T0)).toBe(false);
    expect(s.mouse.grab(0, 0, T0)).toBe(false);
    expect(s.snapshot().dragging).toBe(false);
    // And with nothing grabbed, a drag and a release are nothing.
    s.mouse.drag(100, T0 + 0.1);
    expect(s.mouse.release(T0 + 0.2, 100)).toBe(false);
    expect(s.snapshot()).toMatchObject({ phase: 'aiming', lastThrow: null, throws: 0, power: 50 });
  });

  it('only grabs while aiming: not during a flight and not during a result', () => {
    const flying = sim();
    flying.throwBottle(50);
    expect(flying.mouse.grab(ON_BOTTLE.x, ON_BOTTLE.y, T0)).toBe(false);
    expect(flying.mouse.canGrab(ON_BOTTLE.x, ON_BOTTLE.y)).toBe(false);

    const result = sim();
    result.placeBottle(FLIPPED);
    runToOutcome(result);
    expect(result.phase).toBe('result');
    expect(result.mouse.grab(ON_BOTTLE.x, ON_BOTTLE.y, T0)).toBe(false);
    // The next bottle comes: now it can be grabbed.
    run(result, RESULT_STEPS);
    expect(result.phase).toBe('aiming');
    expect(result.mouse.canGrab(ON_BOTTLE.x, ON_BOTTLE.y)).toBe(true);
    expect(result.mouse.grab(ON_BOTTLE.x, ON_BOTTLE.y, T0)).toBe(true);
  });

  it('refuses a second press while the bottle is held, and a press at a time that is no number', () => {
    const s = sim();
    expect(s.mouse.grab(ON_BOTTLE.x, ON_BOTTLE.y, Number.NaN)).toBe(false);
    expect(s.mouse.dragging).toBe(false);
    expect(s.mouse.grab(ON_BOTTLE.x, ON_BOTTLE.y, T0)).toBe(true);
    s.mouse.drag(ON_BOTTLE.y - 100, T0 + 0.05);
    const live = s.snapshot().power;
    expect(s.mouse.grab(ON_BOTTLE.x, ON_BOTTLE.y, T0 + 0.06)).toBe(false);
    expect(s.snapshot().power).toBe(live); // the first grab is untouched
  });

  it('canGrab follows the padding in the tuning', () => {
    // 30 px past the bottle's side: inside a padding of 40, outside a padding of 0 (the half width
    // follows the bottle's shape, so a new shape needs no change here).
    const edge = ON_BOTTLE.x + BOTTLE_HALF_WIDTH_PX + 30;
    const wide = new Simulation({ seed: 1, tuning: { grabPadding: 40 } });
    const none = new Simulation({ seed: 1, tuning: { grabPadding: 0 } });
    expect(wide.mouse.canGrab(edge, ON_BOTTLE.y)).toBe(true);
    expect(none.mouse.canGrab(edge, ON_BOTTLE.y)).toBe(false);
    expect(none.mouse.canGrab(ON_BOTTLE.x + BOTTLE_HALF_WIDTH_PX - 1, ON_BOTTLE.y)).toBe(true);
  });
});

describe('the live push', () => {
  it('the bar is pushPower of the pointer samples so far, at every move', () => {
    const samples = pushPath(250, 0.12);
    const s = sim();
    s.mouse.grab(ON_BOTTLE.x, samples[0].y, samples[0].t);
    for (let i = 1; i < samples.length; i++) {
      s.mouse.drag(samples[i].y, samples[i].t);
      expect(s.snapshot().power).toBe(pushPower(samples.slice(0, i + 1)));
    }
    expect(s.snapshot().power).toBeGreaterThan(50);
  });

  it('a faster and longer push shows more than a slow, short one', () => {
    const fast = sim();
    playDrag(fast, pushPath(300, 0.1));
    const slow = sim();
    playDrag(slow, pushPath(40, 0.4));
    expect(fast.snapshot().power).toBeGreaterThan(slow.snapshot().power + 40);
  });

  it('a pointer that stops fades the bar to 0 as simulation steps pass (150 ms is 9 steps)', () => {
    const s = sim();
    playDrag(s, pushPath(200, 0.1));
    const moving = s.snapshot().power;
    expect(moving).toBeGreaterThan(50);
    run(s, 6); // the push was 100 ms long: its start now leaves the 150 ms window
    const fading = s.snapshot().power;
    expect(fading).toBeLessThan(moving);
    expect(fading).toBeGreaterThan(0);
    run(s, 5);
    expect(s.snapshot().power).toBe(0);
    expect(s.snapshot().dragging).toBe(true); // still held, just not pushing
  });

  it('keys and the wheel cannot move the bar while the mouse holds the bottle', () => {
    const s = sim();
    playDrag(s, pushPath(200, 0.1));
    s.powerMeter.wheel(5);
    s.powerMeter.press(1);
    s.powerMeter.release(1);
    run(s, 1); // the next step puts the live push back on the bar (one step of idle time)
    const next = { t: T0 + 0.1, y: ON_BOTTLE.y - 205 };
    s.mouse.drag(next.y, next.t);
    expect(s.snapshot().power).toBe(pushPower([...pushPath(200, 0.1), next]));
  });
});

describe('releasing', () => {
  it('a push throws the bottle with its power, as a mouse throw', () => {
    const samples = pushPath(200, 0.1);
    const s = sim();
    const water = s.snapshot().bottle.water;
    const power = mousePush(s, samples);

    expect(power).toBe(pushPower(samples));
    expect(power).toBeGreaterThan(0);
    const thrown = s.snapshot();
    expect(thrown.phase).toBe('flying');
    expect(thrown.dragging).toBe(false);
    expect(thrown.lastThrow).toEqual({ power, water, source: 'mouse' });
    expect(thrown.power).toBe(power); // the bar keeps the push's power
    expect(thrown.throws).toBe(1);
    expect(thrown.bottle.vy).toBeLessThan(0);
  });

  it('a fast, long push gives more power than a slow, short one', () => {
    const fast = mousePush(sim(), pushPath(300, 0.1));
    const slow = mousePush(sim(), pushPath(40, 0.4));
    expect(fast).not.toBeNull();
    expect(slow).not.toBeNull();
    expect(fast!).toBeGreaterThan(slow! + 40);
  });

  it('a click on the bottle without moving throws nothing and gives the bar back', () => {
    const s = sim();
    s.powerMeter.set(73);
    s.mouse.grab(ON_BOTTLE.x, ON_BOTTLE.y, T0);
    expect(s.snapshot().power).toBe(0);
    expect(s.mouse.release(T0 + 0.08, ON_BOTTLE.y)).toBe(false);
    expect(s.snapshot()).toMatchObject({
      phase: 'aiming',
      dragging: false,
      power: 73,
      lastThrow: null,
      throws: 0,
    });
  });

  it('a push with no upward movement (down, or sideways) throws nothing', () => {
    for (const rise of [-200, 0]) {
      const s = sim();
      s.powerMeter.set(40);
      const samples = pushPath(rise, 0.1);
      expect(mousePush(s, samples)).toBeNull();
      expect(s.snapshot()).toMatchObject({
        phase: 'aiming',
        dragging: false,
        power: 40,
        throws: 0,
      });
    }
  });

  it('a push below pushMinPower throws nothing; at or above it throws', () => {
    const samples = pushPath(40, 0.15);
    const strength = pushPower(samples);
    expect(strength).toBeGreaterThan(1);

    const weak = new Simulation({ seed: 7, tuning: { pushMinPower: strength + 0.01 } });
    expect(mousePush(weak, samples)).toBeNull();
    expect(weak.phase).toBe('aiming');

    const enough = new Simulation({ seed: 7, tuning: { pushMinPower: strength } });
    expect(mousePush(enough, samples)).toBe(strength);
    expect(enough.phase).toBe('flying');
  });

  it('a release under 1 point of power is no throw (a jitter, not a push)', () => {
    const s = sim();
    const samples = pushPath(0.2, 0.1);
    expect(pushPower(samples)).toBeLessThan(DEFAULT_TUNING.pushMinPower);
    expect(pushPower(samples)).toBeGreaterThan(0);
    expect(mousePush(s, samples)).toBeNull();
    expect(s.phase).toBe('aiming');
  });

  it('a pointer that stopped before the release counts as still: no throw', () => {
    const samples = pushPath(300, 0.1);
    const s = sim();
    playDrag(s, samples);
    const last = samples[samples.length - 1];
    expect(s.mouse.release(last.t + 0.4, last.y)).toBe(false);
    expect(s.phase).toBe('aiming');
    expect(s.snapshot().power).toBe(50);
  });

  it('a release with no position uses where the pointer was last seen (outside the canvas)', () => {
    const samples = pushPath(200, 0.1);
    const last = samples[samples.length - 1];
    const withPosition = sim();
    playDrag(withPosition, samples);
    withPosition.mouse.release(last.t + 0.01, last.y);
    const without = sim();
    playDrag(without, samples);
    expect(without.mouse.release(last.t + 0.01)).toBe(true);
    expect(without.snapshot()).toEqual(withPosition.snapshot());
    expect(without.snapshot().dragging).toBe(false);
  });

  it('a release with nothing grabbed does nothing', () => {
    const s = sim();
    const before = s.snapshot();
    expect(s.mouse.release(T0, 100)).toBe(false);
    expect(s.snapshot()).toEqual(before);
  });

  it('after a throw a drag goes nowhere: the grab is over', () => {
    const s = sim();
    mousePush(s, pushPath(200, 0.1));
    const flying = s.snapshot();
    s.mouse.drag(100, T0 + 1);
    expect(s.mouse.release(T0 + 1.1, 100)).toBe(false);
    expect(s.snapshot()).toEqual(flying);
  });

  it('Space during a drag throws with the live power as a keyboard throw and ends the grab', () => {
    const s = sim();
    playDrag(s, pushPath(200, 0.1));
    const live = s.snapshot().power;
    expect(s.throwOrSkip()).toBe(true);
    expect(s.snapshot()).toMatchObject({
      phase: 'flying',
      dragging: false,
      lastThrow: { power: live, source: 'keyboard' },
    });
    expect(s.mouse.release(T0 + 0.2, 100)).toBe(false); // the button coming up changes nothing
    expect(s.snapshot().throws).toBe(1);
  });

  it('placing the bottle during a drag ends the grab', () => {
    const s = sim();
    playDrag(s, pushPath(200, 0.1));
    expect(s.placeBottle(FLIPPED)).toBe(true);
    expect(s.mouse.dragging).toBe(false);
    expect(s.snapshot().lastThrow).toBeNull();
  });

  it('cancel drops the grab, throws nothing and gives the bar back', () => {
    const s = sim();
    s.powerMeter.set(64);
    playDrag(s, pushPath(200, 0.1));
    s.mouse.cancel();
    expect(s.snapshot()).toMatchObject({ dragging: false, power: 64, phase: 'aiming', throws: 0 });
    s.mouse.cancel(); // and it is harmless with nothing grabbed
    expect(s.snapshot().power).toBe(64);
  });

  it('can grab the next bottle: the push works again after a result', () => {
    const s = sim();
    mousePush(s, pushPath(200, 0.1));
    runToOutcome(s);
    run(s, RESULT_STEPS);
    expect(s.phase).toBe('aiming');
    const power = mousePush(s, pushPath(150, 0.1));
    expect(power).toBeGreaterThan(0);
    expect(s.snapshot().throws).toBe(2);
    expect(s.snapshot().lastThrow?.source).toBe('mouse');
  });
});

describe('a mouse throw and a keyboard throw are the same throw', () => {
  /** A snapshot with the throw's source blanked, so two throws can be compared for everything else. */
  const sameButSource = (snapshot: SimSnapshot): unknown => ({
    ...snapshot,
    lastThrow: snapshot.lastThrow && { ...snapshot.lastThrow, source: 'any' },
  });

  const pushes: [string, number, number][] = [
    ['a hard flick', 300, 0.08],
    ['a medium push', 120, 0.12],
    ['a gentle push', 40, 0.15],
  ];

  for (const [name, rise, seconds] of pushes) {
    for (const water of [0.1, 0.5, 0.9]) {
      it(`${name} with ${water * 100}% water: same trajectory step by step, same outcome`, () => {
        const mouse = new Simulation({ seed: 5 });
        mouse.setWater(water);
        const power = mousePush(mouse, pushPath(rise, seconds));
        expect(power).not.toBeNull();

        const keyboard = new Simulation({ seed: 5 });
        keyboard.setWater(water);
        keyboard.powerMeter.set(power!); // the bar holds the throw's power after either kind of throw
        expect(keyboard.throwBottle(power!, 'keyboard')).toBe(true);

        expect(mouse.snapshot().lastThrow?.source).toBe('mouse');
        expect(keyboard.snapshot().lastThrow?.source).toBe('keyboard');
        expect(sameButSource(mouse.snapshot())).toEqual(sameButSource(keyboard.snapshot()));
        let judged = false;
        for (let i = 0; i < 400; i++) {
          mouse.step();
          keyboard.step();
          expect(sameButSource(mouse.snapshot())).toEqual(sameButSource(keyboard.snapshot()));
          judged ||= mouse.snapshot().outcome !== null;
        }
        expect(judged).toBe(true); // the whole flight was compared, up to the landing and past it
      });
    }
  }

  it('holding the bottle for a while before the push changes nothing about the flight', () => {
    const samples = pushPath(200, 0.1);
    const held = new Simulation({ seed: 5 });
    held.mouse.grab(ON_BOTTLE.x, samples[0].y, samples[0].t);
    run(held, 30); // half a second in the hand, the pointer not moving
    for (const s of samples.slice(1)) held.mouse.drag(s.y, s.t + 0.5);
    const last = samples[samples.length - 1];
    held.mouse.release(last.t + 0.5, last.y);
    const power = held.snapshot().lastThrow!.power;
    expect(power).toBeGreaterThan(0);

    const keyboard = new Simulation({ seed: 5 });
    keyboard.throwBottle(power, 'keyboard');
    for (let i = 0; i < 300; i++) {
      held.step();
      keyboard.step();
      expect(held.snapshot().bottle).toEqual(keyboard.snapshot().bottle);
    }
    expect(held.snapshot().outcome).toEqual(keyboard.snapshot().outcome);
  });
});

describe('the mouse push is deterministic', () => {
  it('the same pointer samples give the same throw and the same flight', () => {
    const play = (): SimSnapshot => {
      const s = sim(11);
      mousePush(s, pushPath(180, 0.11, 144));
      run(s, 200);
      return s.snapshot();
    };
    expect(play()).toEqual(play());
  });
});
