import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';
import { pushPower, type PushSample, type PushTuning } from '../../src/core/push';
import { DEFAULT_TUNING } from '../../src/core/tuning';

const RELEASE = 1;
const START_Y = 600;
const WINDOW = DEFAULT_TUNING.pushWindowSeconds;

const tuning = (overrides: Partial<PushTuning> = {}): PushTuning => ({
  ...DEFAULT_TUNING,
  ...overrides,
});

/**
 * The pointer's height `y(t)` sampled `hz` times a second from `from` to `RELEASE`, counted back
 * from the release so every rate ends on the same moment.
 */
function sampled(y: (t: number) => number, from: number, hz: number): PushSample[] {
  const count = Math.round((RELEASE - from) * hz);
  const out: PushSample[] = [];
  for (let i = count; i >= 0; i--) {
    const t = RELEASE - i / hz;
    out.push({ t, y: y(t) });
  }
  return out;
}

/** A path from `START_Y` up by `px` (negative: down), at a steady speed, ending at the release. */
const steady = (px: number, seconds: number) => (t: number) =>
  START_Y - px * Math.min(1, Math.max(0, (t - (RELEASE - seconds)) / seconds));

/** A drag that is still until `seconds` before the release, then moves up `px` at a steady speed. */
function push(px: number, seconds: number, hz = 60): PushSample[] {
  return sampled(steady(px, seconds), RELEASE - 1, hz);
}

/** A drag that starts only `seconds` before the release and moves up `px` over all of it. */
function shortPush(px: number, seconds: number, hz = 60): PushSample[] {
  return sampled(steady(px, seconds), RELEASE - seconds, hz);
}

describe('pushPower', () => {
  describe('how far and how fast', () => {
    it('gives more power for more upward distance in the last 150 ms', () => {
      const powers = [20, 60, 100, 150, 200, 250].map((px) => pushPower(push(px, WINDOW)));
      for (let i = 1; i < powers.length; i++) expect(powers[i]).toBeGreaterThan(powers[i - 1]);
    });

    it('gives more power when the same distance is covered in less time', () => {
      const slow = pushPower(push(100, 0.15));
      const quicker = pushPower(push(100, 0.1));
      const quickest = pushPower(push(100, 0.05));
      expect(quicker).toBeGreaterThan(slow);
      expect(quickest).toBeGreaterThan(quicker);
    });

    it('counts a short drag that is quicker, and a push that is quick and then stops', () => {
      expect(pushPower(shortPush(100, 0.1))).toBeGreaterThan(pushPower(shortPush(100, 0.15)));
      // 100 px in the first third of the window, then the pointer holds still until the release.
      const flickThenStill = sampled(
        (t) => START_Y - 100 * Math.min(1, Math.max(0, (t - (RELEASE - WINDOW)) / 0.05)),
        RELEASE - 1,
        60,
      );
      expect(pushPower(flickThenStill)).toBeGreaterThan(pushPower(push(100, WINDOW)));
    });

    it('mixes distance and speed by the tuning weights', () => {
      // 150 px at a steady 1000 px/s over 150 ms: half of both full values (300 px, 2000 px/s).
      const samples = push(150, WINDOW);
      expect(pushPower(samples, tuning({ pushSpeedWeight: 0 }))).toBeCloseTo(50, 6);
      expect(pushPower(samples, tuning({ pushDistanceWeight: 0 }))).toBeCloseTo(50, 6);
      expect(pushPower(samples)).toBeCloseTo(50, 6);

      // A short fast flick (60 px in 50 ms) has little distance and a lot of speed.
      const flick = shortPush(60, 0.05);
      const byDistance = pushPower(flick, tuning({ pushSpeedWeight: 0 }));
      const bySpeed = pushPower(flick, tuning({ pushDistanceWeight: 0 }));
      expect(byDistance).toBeCloseTo(20, 6);
      expect(bySpeed).toBeCloseTo(60, 6);
      expect(pushPower(flick, tuning({ pushDistanceWeight: 3, pushSpeedWeight: 1 }))).toBeCloseTo(
        (3 * 20 + 60) / 4,
        6,
      );
    });

    it('scales with the full-power distance and speed in the tuning', () => {
      const samples = push(150, WINDOW);
      const harder = tuning({ pushFullDistance: 600, pushFullSpeed: 4000 });
      expect(pushPower(samples, harder)).toBeCloseTo(25, 6);
      const easier = tuning({ pushFullDistance: 150, pushFullSpeed: 1000 });
      expect(pushPower(samples, easier)).toBeCloseTo(100, 6);
    });
  });

  describe('the last 150 ms', () => {
    it('ignores motion earlier than the window: drags that differ only before it give equal power', () => {
      const windowStart = RELEASE - WINDOW;
      const inWindow = (t: number) => 500 - 90 * ((t - windowStart) / WINDOW);
      const before = (path: (t: number) => number) => (t: number) =>
        t < windowStart ? path(t) : inWindow(t);
      // Each path reaches 500 px at the window's start, like a real hand, and wanders before.
      const stillBefore = before(() => 500);
      const fromBelow = before((t) => 500 + 400 * (1 - t / windowStart));
      const fromAbove = before((t) => 500 - 300 * (1 - t / windowStart));
      const wobble = before((t) => 500 + 80 * Math.sin(t * 40) * (1 - t / windowStart));

      const reference = pushPower(sampled(stillBefore, 0, 60));
      expect(reference).toBeGreaterThan(0);
      for (const path of [fromBelow, fromAbove, wobble]) {
        // With a sample on the window's start the early motion can't matter at all...
        for (const hz of [60, 240]) {
          expect(pushPower(sampled(path, 0, hz))).toBeCloseTo(reference, 9);
        }
      }
      // With no sample on the window's start (150 ms is not a whole number of frames at 144 Hz),
      // the path through the start leans on the one sample just before it, a few milliseconds
      // away: a small effect, far below a point of power, never the early motion as a whole.
      const reference144 = pushPower(sampled(stillBefore, 0, 144));
      for (const path of [fromBelow, fromAbove, wobble]) {
        expect(Math.abs(pushPower(sampled(path, 0, 144)) - reference144)).toBeLessThan(0.5);
      }
    });

    it('gives equal power for hand-made drags that differ only before the window', () => {
      const inWindow: PushSample[] = [
        { t: 0.9, y: 480 },
        { t: 0.95, y: 440 },
        { t: 1, y: 400 },
      ];
      const high = pushPower([{ t: 0, y: 900 }, { t: 0.4, y: 500 }, ...inWindow]);
      const low = pushPower([{ t: 0, y: 100 }, { t: 0.4, y: 500 }, ...inWindow]);
      const extra = pushPower([
        { t: 0, y: 100 },
        { t: 0.1, y: 700 },
        { t: 0.2, y: 50 },
        { t: 0.4, y: 500 },
        ...inWindow,
      ]);
      expect(high).toBeGreaterThan(0);
      expect(low).toBe(high);
      expect(extra).toBe(high);
    });

    it('is not fooled by a pause: a flick after a long still press counts like one after a short pause', () => {
      const flick = (from: number) => {
        const out: PushSample[] = [];
        for (let i = 1; i <= 9; i++) out.push({ t: from + i / 60, y: START_Y - (300 * i) / 9 });
        return out;
      };
      // The press is the only sample until the first move event arrives, 2 s or 20 ms later.
      const longPause = pushPower([{ t: 0, y: START_Y }, ...flick(2)]);
      const shortPause = pushPower([{ t: 1.98, y: START_Y }, ...flick(2)]);
      const dense = pushPower([{ t: 2, y: START_Y }, ...flick(2)]);
      expect(dense).toBeGreaterThanOrEqual(90);
      expect(longPause).toBeCloseTo(dense, 6);
      expect(Math.abs(shortPause - dense)).toBeLessThan(1);
    });

    it('gives 0 when all the upward motion was before the window and the pointer is still now', () => {
      const earlyPush = sampled((t) => (t < 0.7 ? 600 - 300 * (t / 0.7) : 300), 0, 60);
      expect(pushPower(earlyPush)).toBe(0);
    });

    it('gives 0 when the pointer came back down over the window, even after pushing up before it', () => {
      const upThenDown = sampled(
        (t) => (t < 0.8 ? 600 - 400 * (t / 0.8) : 200 + 300 * (t - 0.8)),
        0,
        60,
      );
      expect(pushPower(upThenDown)).toBe(0);
    });

    it('uses the window length from the tuning', () => {
      // 300 px up, all of it between 250 ms and 150 ms before the release.
      const earlier = sampled(
        (t) => START_Y - 300 * Math.min(1, Math.max(0, (t - 0.75) / 0.1)),
        0,
        120,
      );
      expect(pushPower(earlier)).toBeCloseTo(0, 9);
      expect(pushPower(earlier, tuning({ pushWindowSeconds: 0.3 }))).toBeGreaterThan(50);
      expect(pushPower(earlier, tuning({ pushWindowSeconds: 0 }))).toBe(0);
    });

    it('treats the newest sample as the release, so a growing drag gives the live value', () => {
      const drag = push(250, WINDOW);
      const live = drag.map((_, i) => pushPower(drag.slice(0, i + 1)));
      expect(live[0]).toBe(0);
      expect(live[live.length - 1]).toBe(pushPower(drag));
      for (let i = 1; i < live.length; i++) expect(live[i]).toBeGreaterThanOrEqual(live[i - 1]);
      expect(live[live.length - 1]).toBeGreaterThan(live[1]);
    });

    it('measures a pointer that stopped as stopped once a sample is added at the release', () => {
      const moving = shortPush(200, 0.1);
      const stopped = [...moving, { t: RELEASE + 0.2, y: moving[moving.length - 1].y }];
      expect(pushPower(moving)).toBeGreaterThan(60);
      expect(pushPower(stopped)).toBe(0);
    });
  });

  describe('no push', () => {
    it('gives 0 for downward motion, a still pointer, one sample and no samples', () => {
      expect(pushPower(push(-200, WINDOW))).toBe(0);
      expect(pushPower(push(-20, 0.05))).toBe(0);
      expect(pushPower(push(0, WINDOW))).toBe(0);
      expect(pushPower([{ t: 1, y: 300 }])).toBe(0);
      expect(pushPower([])).toBe(0);
    });

    it('gives 0 when both weights are 0 or the speed span is 0, instead of a broken number', () => {
      const samples = push(200, WINDOW);
      expect(pushPower(samples, tuning({ pushDistanceWeight: 0, pushSpeedWeight: 0 }))).toBe(0);
      expect(pushPower(samples, tuning({ pushSpeedSpanSeconds: 0 }))).toBe(0);
    });

    it('ignores samples that are not numbers', () => {
      const samples = push(150, WINDOW);
      const dirty = [
        { t: Number.NaN, y: 0 },
        ...samples.slice(0, 5),
        { t: 0.9, y: Number.POSITIVE_INFINITY },
        ...samples.slice(5),
      ];
      expect(pushPower(dirty)).toBe(pushPower(samples));
    });
  });

  describe('range', () => {
    it('clamps to 0-100: a huge push gives exactly 100', () => {
      expect(pushPower(push(5000, WINDOW))).toBe(100);
      expect(pushPower(push(5000, 0.02))).toBe(100);
      expect(pushPower(push(300, 0.15))).toBeLessThanOrEqual(100);
    });

    it('is always a finite number from 0 to 100, even for random and broken samples', () => {
      const rng = createRng(11);
      for (let run = 0; run < 300; run++) {
        const samples: PushSample[] = [];
        let t = rng.next() * 2;
        let y = 300 + rng.next() * 400;
        for (let i = 0; i < 1 + Math.floor(rng.next() * 40); i++) {
          // Time goes backward or stands still now and then; the pointer jumps now and then.
          t += (rng.next() - 0.15) * 0.05;
          y += (rng.next() - 0.6) * (rng.next() < 0.1 ? 900 : 40);
          samples.push({ t, y });
        }
        const power = pushPower(samples);
        expect(Number.isFinite(power)).toBe(true);
        expect(power).toBeGreaterThanOrEqual(0);
        expect(power).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('sampling rate', () => {
    // The same hand motion as the mouse might report it at different rates.
    const smooth = (px: number, seconds: number) => (t: number) => {
      const x = Math.min(1, Math.max(0, (t - (RELEASE - seconds)) / seconds));
      return START_Y - px * x * x * (3 - 2 * x); // eases in and out, like a real flick
    };
    const motions: [string, (t: number) => number][] = [
      ['a steady push', steady(200, 0.15)],
      ['a steady short push', steady(120, 0.08)],
      ['a hard eased flick', smooth(320, 0.14)],
      ['a gentle eased push', smooth(60, 0.3)],
      ['a flick that stops early', smooth(150, 0.06)],
      ['an accelerating push', (t) => START_Y - 4000 * Math.max(0, t - 0.8) ** 2],
    ];

    it.each(motions)(
      'gives the same power at 60 Hz, 125 Hz, 240 Hz and 1000 Hz for %s',
      (_, path) => {
        const at = (hz: number) => pushPower(sampled(path, 0.5, hz));
        const reference = at(1000);
        expect(reference).toBeGreaterThan(0);
        for (const hz of [60, 125, 144, 240]) expect(Math.abs(at(hz) - reference)).toBeLessThan(2);
        expect(Math.abs(at(60) - at(240))).toBeLessThan(2);
      },
    );

    it('is not thrown off by samples at uneven times (a mouse reports when it moves)', () => {
      const path = smooth(250, 0.14);
      const rng = createRng(5);
      const uneven: PushSample[] = [];
      for (let t = 0.5; t < RELEASE; t += 0.004 + rng.next() * 0.02) uneven.push({ t, y: path(t) });
      uneven.push({ t: RELEASE, y: path(RELEASE) });
      expect(Math.abs(pushPower(uneven) - pushPower(sampled(path, 0.5, 1000)))).toBeLessThan(2);
    });
  });

  describe('default tuning', () => {
    it('is reachable with an ordinary mouse: 300 px up in 150 ms is at least 90, 40 px is under 30', () => {
      for (const hz of [60, 125, 240, 1000]) {
        expect(pushPower(push(300, 0.15, hz))).toBeGreaterThanOrEqual(90);
        expect(pushPower(push(40, 0.15, hz))).toBeLessThan(30);
      }
    });

    it('rises steadily from a nudge to a hard flick and does not need extremes for 0 or 100', () => {
      const powers = [10, 40, 80, 120, 160, 200, 250, 300].map((px) => pushPower(push(px, 0.15)));
      for (let i = 1; i < powers.length; i++) expect(powers[i]).toBeGreaterThan(powers[i - 1]);
      expect(powers[0]).toBeLessThan(10);
      expect(powers[powers.length - 1]).toBeGreaterThanOrEqual(90);
    });
  });

  it('is pure: it does not change its input and gives the same answer every time', () => {
    const samples = Object.freeze(push(180, 0.12).map((s) => Object.freeze({ ...s })));
    const first = pushPower(samples);
    expect(pushPower(samples)).toBe(first);
    expect(pushPower([...samples])).toBe(first);
    expect(samples.length).toBe(push(180, 0.12).length);
  });
});
