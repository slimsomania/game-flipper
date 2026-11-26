import type Phaser from 'phaser';

/*
 * Phaser re-tessellates a Graphics object's whole command list on every frame it is visible, so a
 * Graphics that rarely changes (a button face, the bottle's shell, the power bar's track) costs
 * time each frame for nothing (F049). Drawing it once into a texture and showing that as an Image
 * costs one quad. Textures are cached in the game's texture manager by key, so each look is drawn
 * only the first time any scene wants it.
 */

/**
 * The key of a texture of `width` by `height` pixels holding what `draw` draws, in coordinates
 * with (0, 0) at its top-left corner. `draw` runs only if no texture has this key yet, so the key
 * must name everything the picture depends on.
 */
export function bakedTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (graphics: Phaser.GameObjects.Graphics) => void,
): string {
  if (!scene.textures.exists(key)) {
    const graphics = scene.make.graphics({}, false);
    draw(graphics);
    graphics.generateTexture(key, Math.ceil(width), Math.ceil(height));
    graphics.destroy();
  }
  return key;
}

/**
 * Like `bakedTexture`, but the key is made from the drawing itself (a prefix, the size and the
 * Graphics' own command list), so the caller needs no key of its own: for a drawing that comes
 * from a function, such as an icon that follows the sound's state.
 */
export function bakedFromCommands(
  scene: Phaser.Scene,
  prefix: string,
  width: number,
  height: number,
  draw: (graphics: Phaser.GameObjects.Graphics) => void,
): string {
  const graphics = scene.make.graphics({}, false);
  draw(graphics);
  const key = `${prefix}:${width}x${height}:${graphics.commandBuffer.join(',')}`;
  if (!scene.textures.exists(key)) {
    graphics.generateTexture(key, Math.ceil(width), Math.ceil(height));
  }
  graphics.destroy();
  return key;
}
