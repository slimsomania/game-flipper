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

/** Whether the page is fullscreen now (the browser's own answer). */
export function isFullscreen(): boolean {
  return document.fullscreenElement != null;
}

function detectHomeScreenApp(): boolean {
  if (typeof matchMedia !== 'function') return false;
  // Chromium also reports display-mode fullscreen while the page itself is fullscreen.
  if (typeof document !== 'undefined' && document.fullscreenElement != null) return false;
  return (
    matchMedia('(display-mode: fullscreen)').matches ||
    matchMedia('(display-mode: standalone)').matches ||
    // older iOS Safari's flag for a home-screen app
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Decided once, when the page loads, before the game can request fullscreen itself. */
const HOME_SCREEN_APP = detectHomeScreenApp();

/** Whether the game was launched as a home-screen app, which already fills the screen (F047). */
export function isHomeScreenApp(): boolean {
  return HOME_SCREEN_APP;
}

/** Whether this browser can make the page fullscreen (not so on any browser on an iPhone). */
export function fullscreenSupported(): boolean {
  return (
    document.fullscreenEnabled === true &&
    typeof document.documentElement.requestFullscreen === 'function'
  );
}

/** Enter fullscreen when the page isn't, leave it when it is. `touch`: also try the landscape lock. */
export function toggleFullscreen(touch: boolean): void {
  try {
    if (isFullscreen()) {
      void Promise.resolve(document.exitFullscreen?.()).catch(() => undefined);
    } else if (touch) {
      requestPhoneFullscreen();
    } else {
      void Promise.resolve(document.documentElement.requestFullscreen?.()).catch(() => undefined);
    }
  } catch {
    // a browser that throws instead of rejecting: nothing to do
  }
}

/** Calls `listener` whenever the page enters or leaves fullscreen, however that happened. Returns the stop function. */
export function onFullscreenChange(listener: () => void): () => void {
  document.addEventListener('fullscreenchange', listener);
  return () => document.removeEventListener('fullscreenchange', listener);
}
