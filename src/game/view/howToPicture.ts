import { BOTTLE_BODY_WIDTH, BOTTLE_HEIGHT } from '../../core/bottleShape';
import { HOW_TO_LAYOUT } from './howToLayout';

/*
 * The two pictures on the How to play card (F054): a bottle with little water beside a short power
 * bar, and a bottle with a lot of water beside a tall one, so "more water, more power" reads at a
 * glance. No Phaser here: just the numbers, so they can be unit-tested and e2e tests can import
 * them. The values only have to read clearly; they are not a hint about real powers.
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WaterPowerPicture {
  /** Water level, 0 to 1 of the body (like the game's `water`). */
  level: number;
  /** Power bar fill, 0 to 1 of the bar's height. */
  fill: number;
  /** Where the baked bottle image sits (its top-left corner, game pixels), with a little padding. */
  bottle: Box;
  /** The bottle's own base center in game pixels, the origin of its drawing. */
  bottleBase: { x: number; y: number };
  /** The bar's track. */
  bar: Box;
}

/** Game pixels per meter of bottle: a small copy of the game's bottle. */
export const PICTURE_SCALE = 125;
/** Room around the baked bottle so its antialiased edge isn't cut. */
export const PICTURE_PAD = 2;
export const BAR_WIDTH = 26;
const BAR_GAP = 12;
const PAIR_GAP = 40;

export const PICTURE_LEVELS = [
  { level: 0.2, fill: 0.3 },
  { level: 0.8, fill: 0.8 },
] as const;

/** The two pictures, left to right, centered in the card's picture strip. */
export function howToPictures(): WaterPowerPicture[] {
  const strip = HOW_TO_LAYOUT.pictures;
  const bottleWidth = BOTTLE_BODY_WIDTH * PICTURE_SCALE;
  const bottleHeight = BOTTLE_HEIGHT * PICTURE_SCALE;
  const pairWidth = bottleWidth + BAR_GAP + BAR_WIDTH;
  const total = 2 * pairWidth + PAIR_GAP;
  const left = strip.left + (strip.width - total) / 2;
  const baseY = strip.top + (strip.height + bottleHeight) / 2;
  return PICTURE_LEVELS.map(({ level, fill }, i) => {
    const pairLeft = left + i * (pairWidth + PAIR_GAP);
    const baseX = pairLeft + bottleWidth / 2;
    return {
      level,
      fill,
      bottleBase: { x: baseX, y: baseY },
      bottle: {
        x: pairLeft - PICTURE_PAD,
        y: baseY - bottleHeight - PICTURE_PAD,
        width: bottleWidth + 2 * PICTURE_PAD,
        height: bottleHeight + 2 * PICTURE_PAD,
      },
      bar: {
        x: pairLeft + bottleWidth + BAR_GAP,
        y: baseY - bottleHeight,
        width: BAR_WIDTH,
        height: bottleHeight,
      },
    };
  });
}

/** Height in pixels of a bar's fill. */
export const fillHeight = (picture: WaterPowerPicture): number => picture.bar.height * picture.fill;
