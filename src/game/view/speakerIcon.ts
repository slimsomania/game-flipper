/*
 * The speaker icon of the mute button, as plain shapes (no Phaser), so a test can check what each
 * state draws. Coordinates are pixels from the icon's center, y down. The speaker itself is the
 * same in both states; what changes is what is beside it: sound waves when the sound is on, a
 * cross when it is muted. They differ in shape (arcs against straight lines), not only in color.
 */

/** Half the width and height of the box every shape stays inside. */
export const ICON_HALF = 18;

export type IconShape =
  /** A filled polygon. */
  | { kind: 'polygon'; points: readonly { x: number; y: number }[] }
  /** A stroked arc around (`x`, `y`) from `from` to `to` radians (0 points right, clockwise). */
  | { kind: 'arc'; x: number; y: number; radius: number; from: number; to: number }
  /** A stroked straight line. */
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number };

/** Stroke width of the waves and the cross. */
export const ICON_STROKE = 4;

/** The speaker: a small box (the magnet) and a cone opening to the right. */
const BODY: IconShape = {
  kind: 'polygon',
  points: [
    { x: -17, y: -6 },
    { x: -9, y: -6 },
    { x: 1, y: -15 },
    { x: 1, y: 15 },
    { x: -9, y: 6 },
    { x: -17, y: 6 },
  ],
};

const WAVE_CENTER_X = 2;
const WAVE_SPREAD = Math.PI / 4;

const waves = (): IconShape[] =>
  [7, 14].map((radius) => ({
    kind: 'arc',
    x: WAVE_CENTER_X,
    y: 0,
    radius,
    from: -WAVE_SPREAD,
    to: WAVE_SPREAD,
  }));

const cross = (): IconShape[] => [
  { kind: 'line', x1: 8, y1: -8, x2: 16, y2: 8 },
  { kind: 'line', x1: 16, y1: -8, x2: 8, y2: 8 },
];

/** The shapes of the icon for the sound being on (`muted` false) or off. */
export function speakerIcon(muted: boolean): IconShape[] {
  return [BODY, ...(muted ? cross() : waves())];
}
