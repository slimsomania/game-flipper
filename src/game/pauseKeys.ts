import type Phaser from 'phaser';

/**
 * Esc and P are the pause toggle, in the Game scene (to pause) and in the Pause scene (to resume):
 * each scene calls this with what the key does there. A key's auto-repeat is ignored, so holding
 * Esc doesn't pause and resume over and over.
 */
export function bindPauseKeys(scene: Phaser.Scene, toggle: () => void): void {
  const keyboard = scene.input.keyboard;
  if (!keyboard) return;
  for (const name of ['ESC', 'P']) {
    keyboard.on(`keydown-${name}`, (event: KeyboardEvent) => {
      if (!event.repeat) toggle();
    });
  }
}
