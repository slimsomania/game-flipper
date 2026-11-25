import type Phaser from 'phaser';
import { FULLSCREEN_BUTTON_NAME, HOME_CARD_BLOCKER_NAME } from '../game/view/fullscreenButtonView';

/** The fullscreen button as the player sees it. */
export interface FullscreenButtonView {
  /** Which icon it last drew: true is the "leave fullscreen" one, false the "enter" one. */
  fullscreen: boolean;
  /** Whether the "add to home screen" card is open over this screen. */
  cardOpen: boolean;
  /** The middle and size of its clickable area, in game pixels (the 1280x720 canvas). */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The fullscreen button in the shown, running scenes, or null when none has one. Reads what was last drawn. */
export function visibleFullscreenButton(
  scenes: readonly Phaser.Scene[],
): FullscreenButtonView | null {
  for (const scene of scenes) {
    if (!scene.sys.isVisible()) continue;
    const zone = scene.children.getByName(FULLSCREEN_BUTTON_NAME) as Phaser.GameObjects.Zone | null;
    if (!zone) continue;
    return {
      fullscreen: zone.getData('fullscreen') === true,
      cardOpen: scene.children.getByName(HOME_CARD_BLOCKER_NAME) != null,
      x: zone.x,
      y: zone.y,
      width: zone.width,
      height: zone.height,
    };
  }
  return null;
}
