import type Phaser from 'phaser';

/**
 * Leave the round for the title screen, from a scene that sits over the paused Game scene (the
 * summary or the pause overlay): the Game scene and its simulation are dropped, and the calling
 * scene ends as the Title scene starts. The Title reads the saved best score as it opens, so it
 * shows the latest one.
 */
export function quitToTitle(scene: Phaser.Scene): void {
  scene.scene.stop('Game');
  scene.scene.start('Title');
}
