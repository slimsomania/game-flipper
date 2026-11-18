import type Phaser from 'phaser';
import { MUTE_BUTTON_NAME } from '../game/view/muteButtonView';

/** The speaker button as the player sees it. */
export interface MuteButtonView {
  /** Which icon it last drew: true is the muted one (a cross), false the sound-on one (waves). */
  muted: boolean;
  /** The middle and size of its clickable area, in game pixels (the 1280x720 canvas). */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The speaker button in the given scenes, or null when no scene that is shown has one. Found by the
 * name its clickable area carries, so the scene doesn't have to register it; its `muted` data is
 * the state it last drew. Like `visibleTexts`, it reads what the scene last drew.
 */
export function visibleMuteButton(scenes: readonly Phaser.Scene[]): MuteButtonView | null {
  for (const scene of scenes) {
    if (!scene.sys.isVisible()) continue;
    const zone = scene.children.getByName(MUTE_BUTTON_NAME) as Phaser.GameObjects.Zone | null;
    if (!zone) continue;
    return {
      muted: zone.getData('muted') === true,
      x: zone.x,
      y: zone.y,
      width: zone.width,
      height: zone.height,
    };
  }
  return null;
}
