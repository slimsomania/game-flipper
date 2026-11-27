import type Phaser from 'phaser';
import { BOTTLE_PARTS, waterRect, type Point } from '../../core/bottleShape';
import { COLORS } from '../theme';
import { bakedTexture } from './bakedGraphics';
import {
  PICTURE_PAD,
  PICTURE_SCALE,
  fillHeight,
  howToPictures,
  type WaterPowerPicture,
} from './howToPicture';

/** The look of the game's bottle (bottleView.ts) at a small scale. */
const SHELL_ALPHA = 0.55;
const WATER_ALPHA = 0.92;
const SURFACE_LINE_PX = 2;
const BAR_RADIUS = 6;

export const PICTURE_NAMES = { bottle: 'howToBottle', bar: 'howToBar' } as const;

const scaled = (p: Point): Point => ({ x: p.x * PICTURE_SCALE, y: p.y * PICTURE_SCALE });

function bakeBottle(scene: Phaser.Scene, picture: WaterPowerPicture): string {
  const { width, height } = picture.bottle;
  // The bottle's base center, inside the texture.
  const ox = width / 2;
  const oy = height - PICTURE_PAD;
  return bakedTexture(scene, `howToBottle:${picture.level}`, width, height, (g) => {
    const at = (p: Point): Point => ({ x: ox + scaled(p).x, y: oy + scaled(p).y });
    for (const part of BOTTLE_PARTS) {
      if (part.name === 'cap') g.fillStyle(COLORS.cap, 1);
      else g.fillStyle(COLORS.bottle, SHELL_ALPHA);
      g.fillPoints(part.vertices.map(at), true);
    }
    const rect = waterRect(picture.level);
    if (!rect) return;
    const a = at({ x: rect.x0, y: rect.y0 });
    const b = at({ x: rect.x1, y: rect.y1 });
    g.fillStyle(COLORS.water, WATER_ALPHA).fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    g.lineStyle(SURFACE_LINE_PX, 0xffffff, 0.7).lineBetween(a.x, a.y, b.x, a.y);
  });
}

function bakeBar(scene: Phaser.Scene, picture: WaterPowerPicture): string {
  const { width, height } = picture.bar;
  const fill = fillHeight(picture);
  return bakedTexture(scene, `howToBar:${width}x${height}:${picture.fill}`, width, height, (g) => {
    g.fillStyle(COLORS.powerTrack, 1).fillRoundedRect(0, 0, width, height, BAR_RADIUS);
    // A flat-topped fill like the game's power bar, inset so the track's outline shows.
    g.fillStyle(COLORS.powerFill, 1).fillRect(2, height - 2 - fill, width - 4, fill);
    g.lineStyle(2, COLORS.powerOutline, 1);
    g.strokeRoundedRect(1, 1, width - 2, height - 2, BAR_RADIUS);
  });
}

/**
 * The two water-to-power pictures: baked Images (named for the test hook), no text and no marks on
 * the bars. Static, so nothing here updates.
 */
export function createHowToPictures(scene: Phaser.Scene, depth: number): void {
  howToPictures().forEach((picture, i) => {
    scene.add
      .image(picture.bottle.x, picture.bottle.y, bakeBottle(scene, picture))
      .setOrigin(0, 0)
      .setDepth(depth)
      .setName(`${PICTURE_NAMES.bottle}${i}`);
    scene.add
      .image(picture.bar.x, picture.bar.y, bakeBar(scene, picture))
      .setOrigin(0, 0)
      .setDepth(depth)
      .setName(`${PICTURE_NAMES.bar}${i}`);
  });
}

export interface HowToPictureBox {
  /** What the object is: the pictures must be baked Images, never live Graphics. */
  kind: 'image' | 'graphics' | 'other';
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** What the card shows for each picture now, from the scene's objects (null while it isn't open). */
export function drawnPictures(
  scene: Phaser.Scene | null,
): { bottles: HowToPictureBox[]; bars: HowToPictureBox[] } | null {
  if (!scene) return null;
  const find = (name: string): HowToPictureBox => {
    const object = scene.children.getByName(name) as Phaser.GameObjects.Image | null;
    if (!object) return { kind: 'other', left: NaN, top: NaN, right: NaN, bottom: NaN };
    const box = object.getBounds();
    const type = object.type;
    return {
      kind: type === 'Image' ? 'image' : type === 'Graphics' ? 'graphics' : 'other',
      left: box.left,
      top: box.top,
      right: box.right,
      bottom: box.bottom,
    };
  };
  const names = (prefix: string) => howToPictures().map((_, i) => find(`${prefix}${i}`));
  return { bottles: names(PICTURE_NAMES.bottle), bars: names(PICTURE_NAMES.bar) };
}
