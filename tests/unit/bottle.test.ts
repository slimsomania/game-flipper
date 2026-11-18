import { World } from 'planck';
import { describe, expect, it } from 'vitest';
import { Bottle, HAND_X, HAND_Y, isFinitePose } from '../../src/core/bottle';
import {
  BOTTLE_BODY_HEIGHT,
  BOTTLE_BODY_WIDTH,
  BOTTLE_HEIGHT,
  BOTTLE_PARTS,
  bottleMassProperties,
  waterRect,
} from '../../src/core/bottleShape';
import { GRAVITY, SIM_DT } from '../../src/core/constants';
import { Simulation } from '../../src/core/simulation';
import { TABLE_LEFT_X, TABLE_RIGHT_X, TABLE_TOP_Y, createTable } from '../../src/core/table';
import { DEFAULT_TUNING, resolveTuning } from '../../src/core/tuning';

/** The default range, 10% to 90% in 5% steps. */
const LEVELS = Array.from({ length: 17 }, (_, i) => Math.round((0.1 + i * 0.05) * 100) / 100);

function worldWithBottle(water: number): { world: World; bottle: Bottle } {
  const world = new World({ gravity: { x: 0, y: GRAVITY } });
  createTable(world);
  return { world, bottle: new Bottle(world, DEFAULT_TUNING, water) };
}

describe('bottle shape', () => {
  it('stands on a flat base and is as tall as BOTTLE_HEIGHT', () => {
    const ys = BOTTLE_PARTS.flatMap((part) => part.vertices.map((v) => v.y));
    expect(Math.max(...ys)).toBeCloseTo(0, 9); // the base is the line y = 0
    expect(Math.min(...ys)).toBeCloseTo(-BOTTLE_HEIGHT, 9);
    const baseXs = BOTTLE_PARTS.flatMap((part) => part.vertices)
      .filter((v) => v.y === 0)
      .map((v) => v.x);
    expect(Math.min(...baseXs)).toBeCloseTo(-BOTTLE_BODY_WIDTH / 2, 9);
    expect(Math.max(...baseXs)).toBeCloseTo(BOTTLE_BODY_WIDTH / 2, 9);
  });

  it('has a body, shoulder, neck and cap, narrowing toward the top', () => {
    expect(BOTTLE_PARTS.map((part) => part.name)).toEqual(['body', 'shoulder', 'neck', 'cap']);
    const widths = BOTTLE_PARTS.map((part) => {
      const xs = part.vertices.map((v) => v.x);
      return Math.max(...xs) - Math.min(...xs);
    });
    expect(widths[0]).toBeGreaterThan(widths[2]!); // body wider than the neck
    expect(widths[3]).toBeGreaterThan(widths[2]!); // cap a little wider than the neck
  });

  it('puts the water surface at the level times the body height, inside the body', () => {
    for (const level of LEVELS) {
      const rect = waterRect(level)!;
      expect(-rect.y0).toBeCloseTo(level * BOTTLE_BODY_HEIGHT, 9);
      expect(rect.y1).toBeLessThan(0); // above the base
      expect(rect.x1 - rect.x0).toBeLessThan(BOTTLE_BODY_WIDTH); // inside the walls
    }
  });

  it('has no water rectangle for an empty bottle', () => {
    expect(waterRect(0)).toBeNull();
    expect(waterRect(-1)).toBeNull();
  });
});

describe('bottle mass properties', () => {
  const empty = bottleMassProperties(0, DEFAULT_TUNING);

  it('mass strictly increases with the water level', () => {
    let previous = empty.mass;
    for (const level of LEVELS) {
      const { mass } = bottleMassProperties(level, DEFAULT_TUNING);
      expect(mass).toBeGreaterThan(previous);
      previous = mass;
    }
  });

  it('puts the center of mass closer to the base than an empty bottle’s, at every level', () => {
    expect(empty.centerHeight).toBeGreaterThan(0);
    for (const level of LEVELS) {
      const { centerHeight } = bottleMassProperties(level, DEFAULT_TUNING);
      expect(centerHeight).toBeGreaterThan(0);
      expect(centerHeight).toBeLessThan(empty.centerHeight);
    }
  });

  it('keeps the center of mass inside the bottle', () => {
    for (const level of [0, ...LEVELS, 1]) {
      const { centerHeight } = bottleMassProperties(level, DEFAULT_TUNING);
      expect(centerHeight).toBeLessThan(BOTTLE_HEIGHT);
    }
  });

  it('follows the densities in the tuning', () => {
    const heavy = resolveTuning({ waterDensity: 2 });
    expect(bottleMassProperties(0.5, heavy).mass).toBeGreaterThan(
      bottleMassProperties(0.5, DEFAULT_TUNING).mass,
    );
    // Water twice as dense pulls the center of mass lower still.
    expect(bottleMassProperties(0.5, heavy).centerHeight).toBeLessThan(
      bottleMassProperties(0.5, DEFAULT_TUNING).centerHeight,
    );
  });

  it('matches the mass and center of mass of the physics body at every level', () => {
    for (const level of [0, ...LEVELS]) {
      const { bottle } = worldWithBottle(level);
      bottle.release(); // a held (kinematic) body has no mass; a dynamic one does
      const expected = bottleMassProperties(level, DEFAULT_TUNING);
      expect(bottle.body.getMass()).toBeCloseTo(expected.mass, 9);
      expect(bottle.body.getLocalCenter().x).toBeCloseTo(0, 9);
      expect(-bottle.body.getLocalCenter().y).toBeCloseTo(expected.centerHeight, 9);
    }
  });

  it('is heavier and lower in the physics body too when water is added', () => {
    const light = worldWithBottle(0).bottle;
    const full = worldWithBottle(0.9).bottle;
    light.release();
    full.release();
    expect(full.body.getMass()).toBeGreaterThan(light.body.getMass());
    expect(full.body.getLocalCenter().y).toBeGreaterThan(light.body.getLocalCenter().y); // y is down
  });
});

describe('Bottle.setWater', () => {
  it('changes the level and the mass, and clamps to 0..1', () => {
    const { bottle } = worldWithBottle(0.3);
    expect(bottle.water).toBe(0.3);

    bottle.setWater(0.9);
    expect(bottle.water).toBe(0.9);
    bottle.release();
    expect(bottle.body.getMass()).toBeCloseTo(bottleMassProperties(0.9, DEFAULT_TUNING).mass, 9);

    bottle.setWater(2);
    expect(bottle.water).toBe(1);
    bottle.setWater(-1);
    expect(bottle.water).toBe(0);
    expect(bottle.body.getMass()).toBeCloseTo(bottleMassProperties(0, DEFAULT_TUNING).mass, 9);
  });

  it('keeps one water fixture, not one per call', () => {
    const { bottle } = worldWithBottle(0.3);
    const count = (): number => {
      let n = 0;
      for (let f = bottle.body.getFixtureList(); f; f = f.getNext()) n++;
      return n;
    };
    const before = count();
    for (let i = 0; i < 5; i++) bottle.setWater(0.1 + i * 0.1);
    expect(count()).toBe(before);
    expect(before).toBe(BOTTLE_PARTS.length + 1);
  });
});

describe('the held bottle', () => {
  it('waits upright and still at the hand, above the table near its left end, for 300 steps', () => {
    for (const seed of [1, 2, 3]) {
      const sim = new Simulation({ seed });
      const start = sim.snapshot().bottle;
      expect(start.x).toBe(HAND_X);
      expect(start.y).toBe(HAND_Y);

      for (let i = 0; i < 300; i++) sim.step();
      const end = sim.snapshot().bottle;

      expect(sim.tick).toBe(300);
      expect(end.x).toBe(HAND_X);
      expect(end.y).toBe(HAND_Y);
      expect(end.angle).toBe(0);
      expect(end.vx).toBe(0);
      expect(end.vy).toBe(0);
      expect(end.omega).toBe(0);
      expect(end.water).toBe(start.water);
    }
  });

  it('hangs above the tabletop, in the left part of the table', () => {
    // Even the highest point of the cap is on screen, and the base is clear of the tabletop.
    expect(HAND_Y).toBeLessThan(TABLE_TOP_Y);
    expect(HAND_Y - BOTTLE_HEIGHT).toBeGreaterThan(0);
    const tableWidth = TABLE_RIGHT_X - TABLE_LEFT_X;
    expect(HAND_X).toBeGreaterThan(TABLE_LEFT_X);
    expect(HAND_X).toBeLessThan(TABLE_LEFT_X + tableWidth * 0.25);
  });

  it('stays put while the water level changes', () => {
    const sim = new Simulation({ seed: 2 });
    for (const level of [0.1, 0.9, 0, 1]) {
      sim.setWater(level);
      for (let i = 0; i < 60; i++) sim.step();
      const { bottle } = sim.snapshot();
      expect(bottle.water).toBe(level);
      expect([bottle.x, bottle.y, bottle.angle]).toEqual([HAND_X, HAND_Y, 0]);
    }
  });
});

describe('a released bottle', () => {
  it('falls and comes to rest upright on its flat base, at any water level', () => {
    for (const level of [0.1, 0.5, 0.9]) {
      const { world, bottle } = worldWithBottle(level);
      bottle.release();
      for (let i = 0; i < 600; i++) world.step(SIM_DT, 8, 3);

      const p = bottle.body.getPosition();
      expect(Math.abs(bottle.body.getAngle())).toBeLessThan(0.05);
      expect(p.y).toBeLessThan(TABLE_TOP_Y); // above the tabletop, not through it
      expect(p.y).toBeGreaterThan(TABLE_TOP_Y - 0.05); // base on the tabletop (planck's 1 cm skin)
      expect(p.x).toBeCloseTo(HAND_X, 1);
      expect(bottle.body.isAwake()).toBe(false);
    }
  });
});

describe('isFinitePose', () => {
  it('accepts a pose of finite numbers, with the optional fields left out or given', () => {
    expect(isFinitePose({ x: 6, y: 2, angle: 0 })).toBe(true);
    expect(isFinitePose({ x: 6, y: 2, angle: 7, vx: 1, vy: -2, omega: 3, turns: 2.5 })).toBe(true);
  });

  it('refuses a pose with any number that is not finite', () => {
    const good = { x: 6, y: 2, angle: 0 };
    for (const field of ['x', 'y', 'angle', 'vx', 'vy', 'omega', 'turns']) {
      expect(isFinitePose({ ...good, [field]: Number.NaN })).toBe(false);
      expect(isFinitePose({ ...good, [field]: Number.POSITIVE_INFINITY })).toBe(false);
    }
  });
});
