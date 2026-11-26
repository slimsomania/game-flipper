/** Id of the page element, so e2e tests can find it. */
export const PAGE_FLASH_ID = 'page-flash';

export interface PageFlash {
  /** Tint the page around the canvas with `color` (hex number) at `alpha`; 0 hides it. */
  set(color: number, alpha: number): void;
  destroy(): void;
}

/**
 * The part of the result flash outside the canvas: the letterbox bars and the safe-area padding
 * (notch, home indicator), which the in-canvas flash can't reach. A page element laid exactly over
 * the canvas paints only its box-shadow, spread past every edge of the screen, so the tint covers
 * everything except the canvas itself, and the two flashes meet without overlapping. It sits behind
 * the page content and never takes input.
 */
export function createPageFlash(canvas: HTMLCanvasElement): PageFlash {
  const element = document.createElement('div');
  element.id = PAGE_FLASH_ID;
  Object.assign(element.style, {
    position: 'fixed',
    zIndex: '-1',
    pointerEvents: 'none',
    display: 'none',
  });
  document.body.appendChild(element);

  return {
    set(color, alpha) {
      if (alpha <= 0) {
        element.style.display = 'none';
        return;
      }
      // Read the canvas box every time: the window may have been resized since the last flash.
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
        boxShadow: `0 0 0 100vmax rgba(${r}, ${g}, ${b}, ${alpha})`,
      });
    },
    destroy() {
      element.remove();
    },
  };
}
