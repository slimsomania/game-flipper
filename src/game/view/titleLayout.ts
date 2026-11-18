import { GAME_WIDTH } from '../../core/constants';

/**
 * Where the title screen's parts are on the 1280x720 canvas (game pixels; everything is centered on
 * the canvas's middle line). No Phaser in here, so e2e tests can import it to click on the Play
 * button. The speaker button is in the top-right corner (`muteLayout.ts`), clear of all of this.
 */
export const TITLE_LAYOUT = {
  nameY: 180,
  /** Font size of the game's name. */
  nameSize: 140,
  /** `x`, `y` are the middle of the face when it isn't pressed. */
  play: { x: GAME_WIDTH / 2, y: 360, width: 360, height: 96 },
  startHintY: 448,
  bestY: 532,
  controlsHintY: 640,
  /** A line is shrunk to fit if it is ever wider than this (the canvas less its margins). */
  maxTextWidth: 1120,
} as const;
