import { Box, World, type Body } from 'planck';
import { describe, expect, it } from 'vitest';
import { GRAVITY, SIM_DT, WORLD_HEIGHT_M, WORLD_WIDTH_M } from '../../src/core/constants';
import {
  TABLE_CENTER_X,
  TABLE_LEFT_X,
  TABLE_RIGHT_X,
  TABLE_THICKNESS,
  TABLE_TOP_Y,
  TABLE_WIDTH,
  createTable,
} from '../../src/core/table';

const HALF_WIDTH = 0.35;
const HALF_HEIGHT = 1;

/** A table in an otherwise empty world, plus one dynamic box dropped at (x, y). */
function dropBox(x: number, y: number): { world: World; table: Body; box: Body } {
  const world = new World({ gravity: { x: 0, y: GRAVITY } });
  const table = createTable(world);
  const box = world.createBody({ type: 'dynamic', position: { x, y }, bullet: true });
  box.createFixture({ shape: new Box(HALF_WIDTH, HALF_HEIGHT), density: 1, friction: 0.6 });
  return { world, table, box };
}

function run(world: World, steps: number): void {
  for (let i = 0; i < steps; i++) world.step(SIM_DT, 8, 3);
}

describe('table layout', () => {
  it('has its top surface on screen, in the lower part, with room above for a toss', () => {
    expect(TABLE_TOP_Y).toBeGreaterThan(WORLD_HEIGHT_M / 2);
    expect(TABLE_TOP_Y + TABLE_THICKNESS).toBeLessThan(WORLD_HEIGHT_M);
  });

  it('keeps both ends at least 1 m inside the screen edges', () => {
    expect(TABLE_LEFT_X).toBeGreaterThanOrEqual(1);
    expect(WORLD_WIDTH_M - TABLE_RIGHT_X).toBeGreaterThanOrEqual(1);
    expect(TABLE_LEFT_X).toBeLessThan(TABLE_RIGHT_X);
  });

  it('spans at least two thirds of the screen width, centered', () => {
    expect(TABLE_WIDTH).toBeGreaterThanOrEqual((WORLD_WIDTH_M * 2) / 3);
    expect(TABLE_CENTER_X).toBeCloseTo(WORLD_WIDTH_M / 2, 6);
  });
});

describe('createTable', () => {
  it('adds a static body whose box matches the exported constants', () => {
    const { table } = dropBox(TABLE_CENTER_X, 2);
    expect(table.isStatic()).toBe(true);

    // The shape's bounds (Fixture.getAABB is padded for the broad phase). planck adds a 1 cm
    // skin radius around every polygon, so allow 1.5 cm.
    const aabb = { lowerBound: { x: 0, y: 0 }, upperBound: { x: 0, y: 0 } };
    table.getFixtureList()!.getShape().computeAABB(aabb, table.getTransform(), 0);
    const near = (actual: number, expected: number): void =>
      expect(Math.abs(actual - expected)).toBeLessThan(0.015);
    near(aabb.lowerBound.x, TABLE_LEFT_X);
    near(aabb.upperBound.x, TABLE_RIGHT_X);
    near(aabb.lowerBound.y, TABLE_TOP_Y);
    near(aabb.upperBound.y, TABLE_TOP_Y + TABLE_THICKNESS);
  });

  it('holds an upright bottle with its base on the top surface', () => {
    const { world, box } = dropBox(TABLE_CENTER_X, 2);
    run(world, 300);
    expect(box.getPosition().y).toBeCloseTo(TABLE_TOP_Y - HALF_HEIGHT, 1);
    expect(box.isAwake()).toBe(false);
  });

  it.each([
    ['left', TABLE_LEFT_X - 0.6],
    ['right', TABLE_RIGHT_X + 0.6],
  ])('lets a bottle past the %s end fall off the table', (_end, x) => {
    const { world, box } = dropBox(x, 2);
    run(world, 120);
    // It fell past the underside of the slab instead of landing on it.
    expect(box.getPosition().y).toBeGreaterThan(TABLE_TOP_Y + TABLE_THICKNESS);
    expect(box.getLinearVelocity().y).toBeGreaterThan(0);
  });
});
