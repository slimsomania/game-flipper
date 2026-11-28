import type Phaser from 'phaser';
import { BOTTLE_PARTS, type Point } from '../../core/bottleShape';
import { HAND_X, HAND_Y } from '../../core/bottle';
import { GAME_WIDTH, PIXELS_PER_METER } from '../../core/constants';
import { COLORS } from '../theme';
import { bakedTexture } from './bakedGraphics';
import { createPowerBarView, WAITING_BAR_NAME, type PowerBarView } from './powerBarView';
import { waterShape } from './waterSurface';

/*
 * The waiting side of a duel (design section 5): its power bar at its own hand, grayed and showing
 * the value that player keeps, and a picture of its next bottle at that hand with the water it will
 * have. The picture is a baked Image, never a physics body, and it is made before the live bottle's
 * view so a bottle that ends near it is drawn in front.
 */

const toPixels = (points: readonly Point[]): Point[] =>
  points.map((p) => ({ x: p.x * PIXELS_PER_METER, y: p.y * PIXELS_PER_METER }));

const PAD = 2;
const PARTS = BOTTLE_PARTS.map((part) => ({ name: part.name, points: toPixels(part.vertices) }));
const ALL = PARTS.flatMap((part) => part.points);
const MIN_X = Math.floor(Math.min(...ALL.map((p) => p.x))) - PAD;
const MIN_Y = Math.floor(Math.min(...ALL.map((p) => p.y))) - PAD;
const MAX_X = Math.ceil(Math.max(...ALL.map((p) => p.x))) + PAD;
const MAX_Y = Math.ceil(Math.max(...ALL.map((p) => p.y))) + PAD;
const PICTURE_ALPHA = 0.85;

/** The picture's name in the scene, for the test hook. */
export const WAITING_BOTTLE_NAME = 'waiting-bottle';

/** The picture of the waiting bottle: its box in game pixels and the water it shows. */
export interface WaitingPicture {
  left: number;
  top: number;
  right: number;
  bottom: number;
  water: number;
}

export interface WaitingSideView {
  /**
   * Show the waiting side: `waiting` is the side that waits (1 at the left hand, 2 at the right),
   * `power` the value its bar keeps, `water` the level of its next bottle (null: no picture).
   */
  update(waiting: 1 | 2, power: number, water: number | null): void;
  /** The picture as drawn, or null while there is none. */
  picture(): WaitingPicture | null;
}

export function createWaitingSideView(scene: Phaser.Scene): WaitingSideView {
  const image = scene.add
    .image(0, 0, '__DEFAULT')
    .setOrigin(0, 0)
    .setName(WAITING_BOTTLE_NAME)
    .setVisible(false);
  const bar: PowerBarView = createPowerBarView(scene, { name: WAITING_BAR_NAME, grayed: true });
  let level: number | null = null;
  let shownWater: number | null = null;

  return {
    update(waiting, power, water) {
      const right = waiting === 2;
      bar.update(power, right);
      if (water === null) {
        image.setVisible(false);
        shownWater = null;
        return;
      }
      if (water !== level) {
        level = water;
        const key = `waitingBottle:${water.toFixed(4)}`;
        bakedTexture(scene, key, MAX_X - MIN_X, MAX_Y - MIN_Y, (g) => {
          for (const part of PARTS) {
            g.fillStyle(
              part.name === 'cap' ? COLORS.waitingCap : COLORS.waitingBottle,
              PICTURE_ALPHA,
            );
            g.fillPoints(
              part.points.map((p) => ({ x: p.x - MIN_X, y: p.y - MIN_Y })),
              true,
            );
          }
          const shape = waterShape(water, { x: 0, y: 1 });
          if (shape) {
            g.fillStyle(COLORS.waitingWater, PICTURE_ALPHA);
            for (const piece of shape.pieces) {
              g.fillPoints(
                toPixels(piece).map((p) => ({ x: p.x - MIN_X, y: p.y - MIN_Y })),
                true,
              );
            }
          }
        });
        image.setTexture(key);
      }
      shownWater = water;
      const handX = right ? GAME_WIDTH - HAND_X * PIXELS_PER_METER : HAND_X * PIXELS_PER_METER;
      // Seen from the right hand the picture is flipped, as the live bottle is mirrored there.
      image
        .setFlipX(right)
        .setPosition(right ? handX - MAX_X : handX + MIN_X, HAND_Y * PIXELS_PER_METER + MIN_Y)
        .setVisible(true);
    },
    picture() {
      if (!image.visible || shownWater === null) return null;
      const box = image.getBounds();
      return {
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        water: shownWater,
      };
    },
  };
}
