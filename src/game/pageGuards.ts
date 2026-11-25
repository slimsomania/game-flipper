import type Phaser from 'phaser';

/**
 * Keeps the page still on a phone (F040). The CSS in index.html does most of it (no touch panning,
 * no text selection, no long-press callout, no overscroll, safe-area padding); this adds what CSS
 * can't: no context menu, no Safari pinch gesture events, and a rescale when the container's size
 * changes (the safe-area custom properties, the browser's bars).
 */
export function installPageGuards(game: Phaser.Game, container: HTMLElement): void {
  const stop = (event: Event): void => event.preventDefault();
  container.addEventListener('contextmenu', stop);
  for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
    container.addEventListener(name, stop);
  }
  if (typeof ResizeObserver !== 'undefined') {
    // refresh() sizes the canvas from the cached parent size, so update that cache first.
    new ResizeObserver(() => {
      if (game.scale.getParentBounds()) game.scale.refresh();
    }).observe(container);
  }
}

/**
 * Called from the Play tap on a touch device: asks for fullscreen and a landscape lock where the
 * browser allows it (Android Chrome). A refusal, or a browser without the API (Safari on iPhone),
 * is ignored.
 */
export function requestPhoneFullscreen(): void {
  try {
    void Promise.resolve(document.documentElement.requestFullscreen?.())
      .then(() => screen.orientation?.lock?.('landscape'))
      .catch(() => undefined);
  } catch {
    // a browser that throws instead of rejecting: nothing to do
  }
}
