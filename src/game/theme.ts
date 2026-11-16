/** Shared look-and-feel values: flat, soft solid colors on a calm light background. */
export const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const COLORS = {
  /** Page and canvas background (CSS color, for Phaser's camera and the HTML page). */
  background: '#eaf0f6',
  /** Text colors for a light background (CSS colors, for Phaser text). */
  text: '#243040',
  accent: '#2f7fd6',
  muted: '#6b7a90',
  /** Wooden-brown table: the tabletop slab and its legs. */
  table: 0x9a6b44,
  tableLegs: 0x7d5434,
  /** The bottle: a translucent blue shell with a lighter cap, and a deeper blue water fill. */
  bottle: 0x4a9be0,
  cap: 0xc4dff7,
  water: 0x2f7fd6,
  /** The power bar: a pale track with a warm fill, so it is never mistaken for the water. */
  powerTrack: 0xd3dce8,
  powerFill: 0xe8963c,
  powerOutline: 0x6b7a90,
} as const;
