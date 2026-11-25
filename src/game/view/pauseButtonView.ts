import type Phaser from 'phaser';
import { createButton, type ButtonView } from './buttonView';
import { drawIcon } from './iconDraw';
import { pauseIcon, playIcon } from './pauseIcon';
import { PAUSE_BUTTON } from './pauseLayout';

/** Name of the button's clickable area in the scene. */
export const PAUSE_BUTTON_NAME = 'pauseButton';

/** Level with the speaker button: above the result flash and the HUD, and above the overlay's veil. */
const BUTTON_DEPTH = 20;

/**
 * The corner pause button, left of the speaker. While the game runs it shows the pause bars and a
 * click opens the overlay; the overlay draws the same button again over its veil with the play
 * triangle, and a click on that resumes, so the corner button is a toggle like Esc and P.
 */
export function createPauseButton(
  scene: Phaser.Scene,
  shows: 'pause' | 'resume',
  onActivate: () => void,
): ButtonView {
  const { x, y, width, height, hitWidth, hitHeight, radius } = PAUSE_BUTTON;
  return createButton(scene, {
    x,
    y,
    width,
    height,
    hitWidth,
    hitHeight,
    radius,
    depth: BUTTON_DEPTH,
    name: PAUSE_BUTTON_NAME,
    icon: (graphics, iconX, iconY) =>
      drawIcon(graphics, iconX, iconY, shows === 'pause' ? pauseIcon() : playIcon()),
    onActivate,
  });
}
