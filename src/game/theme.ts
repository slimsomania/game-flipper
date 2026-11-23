/** Shared look-and-feel values: flat, soft solid colors on a calm light background. */
export const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const COLORS = {
  /** Page and canvas background (CSS color, for Phaser's camera and the HTML page). */
  background: '#eaf0f6',
  /** Text colors for a light background (CSS colors, for Phaser text). */
  text: '#243040',
  /** Violet, clearly apart from the water's blue. */
  accent: '#6a4cc2',
  muted: '#6b7a90',
  /** Wooden-brown table: the tabletop slab and its legs. */
  table: 0x9a6b44,
  tableLegs: 0x7d5434,
  /** The lighter strip along the tabletop's top edge. */
  tableEdge: 0xc08d63,
  /** Top and bottom of the gentle vertical gradient behind everything. */
  gradientTop: '#f4f8fc',
  gradientBottom: '#dbe5f0',
  /** The bottle: a translucent blue shell with a lighter cap, and a deeper blue water fill. */
  bottle: 0x4a9be0,
  cap: 0xc4dff7,
  water: 0x2f7fd6,
  /** The arrow on the top edge under a bottle that has flown above the screen: dark, to stand out on the bottle. */
  offscreenMarker: 0x243040,
  /** The power bar: a pale track with a warm fill, so it is never mistaken for the water. */
  powerTrack: 0xd3dce8,
  powerFill: 0xe8963c,
  powerOutline: 0x6b7a90,
  /** A white card on a soft shadow (the round summary), for text that must be easy to read. */
  card: 0xffffff,
  cardShadow: 0xd5deea,
  /**
   * Buttons: a violet face on a darker lip (a flat "key" that sinks when pressed). White text on the
   * face is at least 3.7:1 in every state, which is enough for large bold text.
   */
  button: 0x6a4cc2,
  buttonHover: 0x7b5fd4,
  buttonPressed: 0x573ba6,
  buttonLip: 0x40297c,
  buttonText: '#ffffff',
  /** The same white, as a number, for icons drawn with Graphics. */
  buttonIcon: 0xffffff,
  /**
   * Result colors: a flash over the whole screen (hex numbers) and the message text on top of it
   * (CSS colors, dark enough to read over the flash and over the light background after it).
   * The message words tell the two apart as well, so the color is never the only cue.
   */
  successFlash: 0x3fbf6a,
  failFlash: 0xe5473f,
  successText: '#12683a',
  failText: '#a3211b',
  /** The particles of a success burst: greens and warm yellows, none of them the bottle's blue. */
  burst: [0x3fbf6a, 0x8fd9a8, 0xf2b33d, 0xe8963c],
} as const;
