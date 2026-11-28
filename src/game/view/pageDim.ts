import type Phaser from 'phaser';

/** Id of the page element, so e2e tests can find it. */
export const PAGE_DIM_ID = 'page-dim';

let element: HTMLDivElement | null = null;
/** The veils that are up, by owner: How to play can open over Pause, and both dim. */
const owners = new Map<string, { color: number; alpha: number }>();

function place(canvas: HTMLCanvasElement): void {
  if (!element) return;
  if (owners.size === 0) {
    element.style.display = 'none';
    return;
  }
  // Each open dialog dims the canvas once more (How to play over Pause): match that outside it.
  let clear = 1;
  let color = 0;
  for (const veil of owners.values()) {
    clear *= 1 - veil.alpha;
    color = veil.color; // the dialogs share one tint; the latest wins
  }
  const total = 1 - clear;
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
 * over the canvas paints only its box-shadow, so the two veils meet without overlapping). It stays
 * up until the returned function is called; `owner` names it among the other open veils.
 */
export function dimPage(
  scene: Phaser.Scene,
  color: number,
  alpha: number,
  owner: string = scene.scene.key,
): () => void {
  const canvas = scene.game.canvas;
  if (!element) {
    element = document.createElement('div');
    element.id = PAGE_DIM_ID;
    Object.assign(element.style, { position: 'fixed', zIndex: '-1', pointerEvents: 'none' });
    document.body.appendChild(element);
  }
  owners.set(owner, { color, alpha });
  // Phaser may re-center the canvas after it reports the new size: place the veil a frame later.
  const refit = () => requestAnimationFrame(() => place(canvas));
  place(canvas);
  scene.scale.on('resize', refit);
  let up = true;
  return () => {
    if (!up) return;
    up = false;
    scene.scale.off('resize', refit);
    owners.delete(owner);
    place(canvas);
  };
}

/** `dimPage` while `scene` runs: the veil comes down when the scene shuts down. */
export function dimPageWhile(scene: Phaser.Scene, color: number, alpha: number): void {
  scene.events.once('shutdown', dimPage(scene, color, alpha));
}
