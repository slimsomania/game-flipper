import type Phaser from 'phaser';
import { toggleMute } from '../audio/mute';
import { sharedSfx } from '../audio/sfx';
import { createButton, type ButtonView } from './buttonView';
import { drawIcon } from './iconDraw';
import { MUTE_BUTTON } from './muteLayout';
import { speakerIcon } from './speakerIcon';

/** Name of the button's clickable area in the scene: what `window.__FLIPPER__.muteButton()` finds. */
export const MUTE_BUTTON_NAME = 'muteButton';

/** Above the result flash and level with the HUD, so the flash never tints the button. */
const BUTTON_DEPTH = 20;

/**
 * The mute control of a screen: the speaker button in the top-right corner and the M key. Both do
 * the same thing, `toggleMute()`, and the icon follows the state of the sound (waves when it is
 * on, a cross when it is muted) however it changed, so a button drawn in a scene that is paused, or
 * a change made from a test hook, is never stale. The key's auto-repeat is ignored, so holding M
 * flips the sound once.
 *
 * The button's clickable area is named `MUTE_BUTTON_NAME` and carries the state it last drew as
 * its `muted` data, which is what the test hook `muteButton()` reads.
 */
export function createMuteControl(scene: Phaser.Scene): ButtonView {
  const sfx = sharedSfx();
  const { x, y, width, height, radius } = MUTE_BUTTON;
  const button = createButton(scene, {
    x,
    y,
    width,
    height,
    radius,
    depth: BUTTON_DEPTH,
    name: MUTE_BUTTON_NAME,
    icon: (graphics, iconX, iconY) => drawIcon(graphics, iconX, iconY, speakerIcon(sfx.muted)),
    onActivate: () => {
      toggleMute();
    },
  });

  const show = (): void => {
    button.refresh();
    button.zone.setData('muted', sfx.muted);
  };
  show();
  const stopListening = sfx.onMutedChange(show);

  scene.input.keyboard?.on('keydown-M', (event: KeyboardEvent) => {
    if (!event.repeat) button.activate();
  });
  scene.events.once('shutdown', stopListening);
  return button;
}
