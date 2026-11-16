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
  /** Placeholder bottle, until the real bottle art lands. */
  bottle: 0x7fb8e8,
  cap: 0xe2504c,
  label: 0xffffff,
  water: 0x2f7fd6,
} as const;
