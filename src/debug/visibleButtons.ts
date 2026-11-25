import type Phaser from 'phaser';

/** A button the player can press, as a clickable area in game pixels (the 1280x720 canvas). */
export interface ButtonArea {
  /** The name of the button's clickable area: playButton, pauseButton, muteButton, ... */
  name: string;
  /** The middle and size of the clickable area. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The buttons that can be pressed right now in the given scenes: a scene that is paused (the Game
 * scene under the pause overlay or the summary) hears no pointer events, so its buttons are left
 * out. Found by the `button` data every `createButton` zone carries.
 */
export function visibleButtons(scenes: readonly Phaser.Scene[]): ButtonArea[] {
  const found: ButtonArea[] = [];
  for (const scene of scenes) {
    if (!scene.sys.isVisible() || !scene.sys.isActive()) continue;
    for (const object of scene.children.list) {
      if (object.getData('button') !== true) continue;
      const zone = object as Phaser.GameObjects.Zone;
      found.push({ name: zone.name, x: zone.x, y: zone.y, width: zone.width, height: zone.height });
    }
  }
  return found;
}
