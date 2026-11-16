/**
 * Shared constants. Everything in src/core is plain, deterministic TypeScript: no Phaser, no DOM.
 *
 * Units: the simulation works in meters, seconds and radians. y points down (like the screen)
 * and positive angles turn clockwise (like Phaser's rotation). To draw something, multiply its
 * position by PIXELS_PER_METER.
 */

/** Logical canvas size in pixels (landscape, for desktop). Phaser scales it to fit the browser. */
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

/** 1 m in the simulation is 100 px on the logical canvas. */
export const PIXELS_PER_METER = 100;

/** Size of the visible world in meters. */
export const WORLD_WIDTH_M = GAME_WIDTH / PIXELS_PER_METER;
export const WORLD_HEIGHT_M = GAME_HEIGHT / PIXELS_PER_METER;

/** The simulation always advances in fixed steps of SIM_DT seconds. */
export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

/** Gravity in m/s², pointing down the screen. */
export const GRAVITY = 10;
