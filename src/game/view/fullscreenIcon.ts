import type { IconShape } from './speakerIcon';

/*
 * The fullscreen button's two icons, as plain shapes (see speakerIcon.ts). Four corner brackets:
 * out at the corners of the box to enter fullscreen, in toward the middle to leave it.
 */
const OUT = 15;
const IN = 6;
const ARM = 8;

const corners = (at: number, armSign: 1 | -1): IconShape[] =>
  [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ].flatMap(([sx, sy]) => [
    { kind: 'line', x1: sx * at, y1: sy * at, x2: sx * at - sx * armSign * ARM, y2: sy * at },
    { kind: 'line', x1: sx * at, y1: sy * at, x2: sx * at, y2: sy * at - sy * armSign * ARM },
  ]);

/** The shapes for a page that is fullscreen now (`true`: arrows in, the leave icon) or not. */
export function fullscreenIcon(fullscreen: boolean): IconShape[] {
  return fullscreen ? corners(IN, -1) : corners(OUT, 1);
}
