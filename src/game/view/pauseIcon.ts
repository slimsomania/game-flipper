/*
 * The two icons of the corner pause button, as plain shapes (no Phaser), so a test can check what
 * they draw: two bars while the game runs (press to pause) and a triangle while it is paused (press
 * to resume). Coordinates are pixels from the icon's center, y down, inside the same box as the
 * speaker's (`ICON_HALF`). Both are filled polygons, drawn in white like every button icon.
 */
import type { IconShape } from './speakerIcon';

const BAR_WIDTH = 9;
const BAR_GAP = 8;
const BAR_HALF_HEIGHT = 14;

/** One bar, `left` of the icon's center. */
const bar = (left: number): IconShape => ({
  kind: 'polygon',
  points: [
    { x: left, y: -BAR_HALF_HEIGHT },
    { x: left + BAR_WIDTH, y: -BAR_HALF_HEIGHT },
    { x: left + BAR_WIDTH, y: BAR_HALF_HEIGHT },
    { x: left, y: BAR_HALF_HEIGHT },
  ],
});

/** Pause: two upright bars with a gap between them, centered. */
export function pauseIcon(): IconShape[] {
  return [bar(-BAR_GAP / 2 - BAR_WIDTH), bar(BAR_GAP / 2)];
}

/**
 * Play ("resume"): a triangle pointing right. Its middle of mass, a third of the way in from the flat
 * side, sits on the center line, so it doesn't look pushed left.
 */
export function playIcon(): IconShape[] {
  return [
    {
      kind: 'polygon',
      points: [
        { x: -9, y: -15 },
        { x: 15, y: 0 },
        { x: -9, y: 15 },
      ],
    },
  ];
}
