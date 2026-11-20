import { Box, type Body, type World } from 'planck';

/*
 * The table: one flat, static slab the bottle lands on. Every number is in meters, measured from
 * the top-left of the screen (y down). The ends are inside the screen, so a bottle that misses
 * the table falls off and can be seen falling.
 */

/** Top surface of the table. The visible world is 7.2 m tall, so this is ~78% of the way down. */
export const TABLE_TOP_Y = 5.6;
/** Left and right ends of the table (the world is 12.8 m wide: 1.6 m of margin on each side). */
export const TABLE_LEFT_X = 1.6;
export const TABLE_RIGHT_X = 11.2;
/** Thickness of the tabletop slab. */
export const TABLE_THICKNESS = 0.4;

export const TABLE_WIDTH = TABLE_RIGHT_X - TABLE_LEFT_X;
export const TABLE_CENTER_X = (TABLE_LEFT_X + TABLE_RIGHT_X) / 2;
export const TABLE_FRICTION = 0.8;

/** Add the table to a physics world as a static body and return it. */
export function createTable(world: World): Body {
  const table = world.createBody({
    type: 'static',
    position: { x: TABLE_CENTER_X, y: TABLE_TOP_Y + TABLE_THICKNESS / 2 },
  });
  table.createFixture({
    shape: new Box(TABLE_WIDTH / 2, TABLE_THICKNESS / 2),
    friction: TABLE_FRICTION,
  });
  return table;
}
