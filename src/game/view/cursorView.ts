import type Phaser from 'phaser';

/** The mouse cursor over the canvas: '' is the browser's normal arrow. */
export type CursorStyle = '' | 'grab' | 'grabbing';

/**
 * Which cursor to show: a closed hand while the bottle is held with the mouse, an open hand while
 * the pointer is over a bottle that can be grabbed, the normal arrow otherwise. Pure, so the choice
 * is tested without a browser.
 */
export function cursorFor(dragging: boolean, overGrabbable: boolean): CursorStyle {
  if (dragging) return 'grabbing';
  return overGrabbable ? 'grab' : '';
}

export interface CursorView {
  /** Show the cursor for the current state (the style is only touched when it changes). */
  update(dragging: boolean, overGrabbable: boolean): void;
}

/** Sets `style.cursor` on the game canvas, and gives the arrow back when the scene ends. */
export function createCursorView(scene: Phaser.Scene): CursorView {
  const canvas = scene.game.canvas;
  let shown: CursorStyle = '';
  const show = (style: CursorStyle): void => {
    shown = style;
    canvas.style.cursor = style;
  };
  scene.events.once('shutdown', () => show(''));
  return {
    update(dragging, overGrabbable) {
      const style = cursorFor(dragging, overGrabbable);
      if (style !== shown) show(style);
    },
  };
}
