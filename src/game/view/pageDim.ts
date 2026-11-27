import type Phaser from 'phaser';

/** Id of the page element, so e2e tests can find it. */
export const PAGE_DIM_ID = 'page-dim';

let element: HTMLDivElement | null = null;
/** The scenes whose veil is up: How to play can open over Pause, and both dim. */
const owners = new Set<string>();

function place(canvas: HTMLCanvasElement, color: number, alpha: number): void {
  if (!element || owners.size === 0) return;
  // Each open dialog dims the canvas once more (How to play over Pause): match that outside it.
  const total = 1 - (1 - alpha) ** owners.size;
  // Read the canvas box every time: the window may have been resized since the veil went up.
  const box = canvas.getBoundingClientRect();
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  Object.assign(element.style, {
    display: 'block',
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    boxShadow: `0 0 0 100vmax rgba(${r}, ${g}, ${b}, ${total})`,
  });
}

/**
 * The part of a dialog's veil outside the canvas: the letterbox bars and the safe-area padding,
 * which the in-canvas veil can't reach (the same trick as `pageFlash.ts`: an element laid exactly
 * over the canvas paints only its box-shadow, so the two veils meet without overlapping). It goes
 * up while `scene` runs and comes down when the last scene that raised it shuts down.
 */
export function dimPageWhile(scene: Phaser.Scene, color: number, alpha: number): void {
  const canvas = scene.game.canvas;
  if (!element) {
    element = document.createElement('div');
    element.id = PAGE_DIM_ID;
    Object.assign(element.style, { position: 'fixed', zIndex: '-1', pointerEvents: 'none' });
    document.body.appendChild(element);
  }
  const key = scene.scene.key;
  owners.add(key);
  // Phaser may re-center the canvas after it reports the new size: place the veil a frame later.
  const refit = () => requestAnimationFrame(() => place(canvas, color, alpha));
  place(canvas, color, alpha);
  scene.scale.on('resize', refit);
  scene.events.once('shutdown', () => {
    scene.scale.off('resize', refit);
    owners.delete(key);
    if (owners.size === 0 && element) element.style.display = 'none';
    else place(canvas, color, alpha);
  });
}
