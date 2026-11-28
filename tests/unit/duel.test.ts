import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/core/simulation';
import { DEFAULT_TUNING } from '../../src/core/tuning';
import { CAP, FLIPPED, SIDE, flipped, waterSequence, type PlacedPose } from '../shared';
import { run, runToOutcome } from './helpers';

const duel = (tuning = {}, seed = 3) => new Simulation({ seed, players: 2, tuning });

/** Place a bottle, let it be judged, then end the result at once. */
function placeAndSkip(sim: Simulation, pose: PlacedPose): void {
  expect(sim.placeBottle(pose)).toBe(true);
  runToOutcome(sim);
  expect(sim.skip()).toBe(true);
}

describe('Simulation without players', () => {
  it('is solo: players 1 and no duel', () => {
    const s = new Simulation({ seed: 1 }).snapshot();
    expect(s.players).toBe(1);
    expect(s.duel).toBeNull();
    expect(new Simulation({ seed: 1, players: 2 }).snapshot().players).toBe(2);
  });
});

describe('duel turns', () => {
  it('alternates 1, 2, 1, 2 and passes only when the result ends', () => {
    const sim = duel({ throwsPerRound: 10 });
    for (let pair = 1; pair <= 10; pair++) {
      for (const player of [1, 2]) {
        let s = sim.snapshot();
        expect(s.phase).toBe('aiming');
        expect(s.duel?.active).toBe(player);
        expect(s.throwNumber).toBe(pair);
        expect(sim.placeBottle(FLIPPED)).toBe(true);
        runToOutcome(sim);
        s = sim.snapshot();
        expect(s.phase).toBe('result');
        expect(s.duel?.active).toBe(player); // still theirs during the result
        if (player === 1) {
          run(sim, 400); // the delay and replay end the result too
        } else {
          sim.skip();
        }
        s = sim.snapshot();
        if (pair === 10 && player === 2) expect(s.phase).toBe('roundOver');
        else expect(s.phase).toBe('aiming');
      }
    }
    const end = sim.snapshot();
    expect(end.throws).toBe(20);
    expect(end.throwNumber).toBe(10);
    expect(sim.throwBottle(50)).toBe(false);
  });

  it('is not over before the 4th result of a 2-throw duel', () => {
    const sim = duel({ throwsPerRound: 2 });
    for (let i = 0; i < 3; i++) placeAndSkip(sim, FLIPPED);
    expect(sim.snapshot().phase).toBe('aiming');
    sim.placeBottle(FLIPPED);
    runToOutcome(sim);
    expect(sim.snapshot().phase).toBe('result');
    run(sim, 400);
    expect(sim.snapshot().phase).toBe('roundOver');
  });
});

describe('duel books', () => {
  it('keeps score, landings and streak per player', () => {
    const sim = duel();
    placeAndSkip(sim, FLIPPED); // P1 +1
    placeAndSkip(sim, SIDE); // P2 fails
    placeAndSkip(sim, flipped(2)); // P1 +2
    let s = sim.snapshot();
    expect(s.duel?.sides[0]).toMatchObject({ score: 3, landings: 2, streak: 2 });
    expect(s.duel?.sides[1]).toMatchObject({ score: 0, landings: 0, streak: 0 });
    // The top-level books are the active player's (P2).
    expect([s.score, s.landings, s.streak]).toEqual([0, 0, 0]);
    placeAndSkip(sim, CAP); // P2's cap pose
    s = sim.snapshot();
    expect(s.duel?.sides[0]).toMatchObject({ score: 3, landings: 2, streak: 2 });
    expect(s.score).toBe(3); // P1 is active again
    placeAndSkip(sim, SIDE); // P1 fails: streak resets
    s = sim.snapshot();
    expect(s.duel?.sides[0]).toMatchObject({ score: 3, landings: 2, streak: 0 });
  });

  it("a P2 fail doesn't reset P1's streak", () => {
    const sim = duel();
    placeAndSkip(sim, FLIPPED);
    placeAndSkip(sim, SIDE);
    placeAndSkip(sim, FLIPPED);
    expect(sim.snapshot().duel?.sides[0].streak).toBe(2);
    placeAndSkip(sim, SIDE);
    expect(sim.snapshot().duel?.sides[0].streak).toBe(2);
  });
});

describe('duel water', () => {
  it('gives both bottles of a pair the same water, one draw per pair', () => {
    const sim = duel({ throwsPerRound: 10 }, 7);
    const expected = waterSequence(7, 10);
    for (let pair = 0; pair < 10; pair++) {
      const first = sim.snapshot();
      expect(first.bottle.water).toBe(expected[pair]);
      expect(first.duel?.waitingWater).toBe(expected[pair]);
      placeAndSkip(sim, FLIPPED);
      const second = sim.snapshot();
      expect(second.bottle.water).toBe(expected[pair]);
      expect(second.duel?.waitingWater).toBe(pair < 9 ? expected[pair + 1] : null);
      placeAndSkip(sim, FLIPPED);
    }
  });

  it('lockWater gives both players the locked level', () => {
    const sim = duel({}, 7);
    sim.lockWater(0.9);
    expect(sim.snapshot().bottle.water).toBe(0.9);
    expect(sim.snapshot().duel?.waitingWater).toBe(0.9);
    placeAndSkip(sim, FLIPPED);
    expect(sim.snapshot().bottle.water).toBe(0.9);
    expect(sim.snapshot().duel?.waitingWater).toBe(0.9);
    placeAndSkip(sim, FLIPPED);
    expect(sim.snapshot().bottle.water).toBe(0.9);
  });
});

describe('duel power bars', () => {
  it('keeps each player’s value', () => {
    const sim = duel();
    const start = DEFAULT_TUNING.powerStart;
    sim.powerMeter.set(30);
    expect(sim.snapshot().duel?.sides[0].power).toBe(30);
    expect(sim.throwBottle(sim.powerMeter.value)).toBe(true);
    runToOutcome(sim);
    sim.skip();
    expect(sim.snapshot().power).toBe(start);
    expect(sim.snapshot().duel?.sides[0].power).toBe(30);
    sim.powerMeter.set(70);
    sim.throwBottle(sim.powerMeter.value);
    runToOutcome(sim);
    sim.skip();
    expect(sim.snapshot().power).toBe(30);
    expect(sim.snapshot().duel?.sides[1].power).toBe(70);
  });

  it('restartRound starts the duel over with a new pair of water', () => {
    const sim = duel({}, 11);
    const seq = waterSequence(11, 6);
    placeAndSkip(sim, FLIPPED);
    sim.powerMeter.set(65);
    placeAndSkip(sim, FLIPPED);
    placeAndSkip(sim, FLIPPED);
    sim.restartRound();
    const s = sim.snapshot();
    expect(s.phase).toBe('aiming');
    expect(s.duel?.active).toBe(1);
    expect(s.duel?.sides[0]).toMatchObject({ score: 0, landings: 0, streak: 0 });
    expect(s.duel?.sides[1]).toMatchObject({ score: 0, landings: 0, streak: 0 });
    expect(s.throwNumber).toBe(1);
    expect(seq.slice(1)).toContain(s.bottle.water);
    expect(s.duel?.waitingWater).toBe(s.bottle.water);
  });
});

describe('duel fair sides', () => {
  const throwOnce = (sim: Simulation, water: number, power: number) => {
    sim.setWater(water);
    sim.powerMeter.set(power);
    expect(sim.throwBottle(power)).toBe(true);
    runToOutcome(sim);
    const outcome = sim.snapshot().outcome;
    const poses = sim.recording.map((f) => ({ x: f.x, y: f.y, angle: f.angle }));
    return { outcome, poses };
  };

  type Thrown = ReturnType<typeof throwOnce>;
  const same = (a: Thrown, b: Thrown): void => {
    const { rotation: ra, ...restA } = a.outcome!;
    const { rotation: rb, ...restB } = b.outcome!;
    expect(restA).toEqual(restB);
    expect(Math.abs(ra - rb)).toBeLessThan(1e-9);
    expect(a.poses.length).toBe(b.poses.length);
    a.poses.forEach((pose, i) => {
      expect(Math.abs(pose.x - b.poses[i].x)).toBeLessThan(1e-9);
      expect(Math.abs(pose.y - b.poses[i].y)).toBeLessThan(1e-9);
      expect(Math.abs(pose.angle - b.poses[i].angle)).toBeLessThan(1e-9);
    });
  };

  for (const water of [0.2, 0.5, 0.8]) {
    for (const power of [20, 50, 80]) {
      it(`P2 matches P1 and a solo throw at water ${water}, power ${power}`, () => {
        const sim = duel();
        const p1 = throwOnce(sim, water, power);
        sim.skip();
        const p2 = throwOnce(sim, water, power);
        const solo = throwOnce(new Simulation({ seed: 3 }), water, power);
        // A bottle made later in the same world can differ in the last bits (rounding), so the
        // poses are compared to 1e-9 m / rad and the discrete outcome exactly.
        same(p2, p1);
        same(p1, solo);
      });
    }
  }
});
