import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../core/constants';

/** The tint of a full-screen flash the player can see: a color (hex number) and an opacity (0 to 1). */
export interface FlashView {
  color: number;
  alpha: number;
}

/**
 * The full-screen flash the player can see in the given scenes, or null when there is none: a
 * shown `Rectangle` that covers the whole canvas and isn't fully transparent. Nothing else in the
 * game is that big (the table and its legs are smaller), so this finds the result flash without
 * the scene having to register it. Like `visibleTexts`, it reads what the scene last drew.
 */
export function visibleFlash(scenes: readonly Phaser.Scene[]): FlashView | null {
  for (const scene of scenes) {
    if (!scene.sys.isVisible()) continue;
    for (const object of scene.children.list) {
      if (!(object instanceof Phaser.GameObjects.Rectangle)) continue;
      const covers = object.width >= GAME_WIDTH && object.height >= GAME_HEIGHT;
      if (covers && object.visible && object.fillAlpha > 0) {
        return { color: object.fillColor, alpha: object.fillAlpha };
      }
    }
  }
  return null;
}
