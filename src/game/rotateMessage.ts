import { COLORS, FONT_FAMILY } from './theme';

/**
 * "Turn your phone sideways" (F041). The game is landscape; held upright, a touch device shows this
 * full-screen HTML overlay (a DOM element, because it has to fill a portrait screen, which the
 * landscape canvas can't) instead of a squeezed game. A desktop window taller than wide (it has a
 * fine pointer, P14) shows nothing and letterboxes as before.
 */
export const ROTATE_TEXT = 'Turn your phone sideways';

let showing = false;
const listeners = new Set<(showing: boolean) => void>();

/** Whether the message is on screen now. */
export function rotateMessageShowing(): boolean {
  return showing;
}

/** Call `fn` whenever the message appears or goes away; returns the way to stop. */
export function onRotateMessageChange(fn: (showing: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** A touch device is one with no fine pointer; a touchscreen laptop keeps the desktop behavior. */
const isTouchDevice = (): boolean => !window.matchMedia('(any-pointer: fine)').matches;
const isUpright = (): boolean => window.innerHeight > window.innerWidth;

const ICON = `<svg id="rotate-icon" width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
  <rect x="22" y="8" width="28" height="56" rx="6" fill="none" stroke="${COLORS.text}" stroke-width="4"/>
  <circle cx="36" cy="56" r="2.5" fill="${COLORS.text}"/>
  <path d="M60 22 a26 26 0 0 1 0 28" fill="none" stroke="${COLORS.accent}" stroke-width="4" stroke-linecap="round"/>
  <path d="M55 48 l5 5 l5 -6" fill="none" stroke="${COLORS.accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

export function installRotateMessage(): void {
  const overlay = document.createElement('div');
  overlay.id = 'rotate-message';
  overlay.hidden = true;
  overlay.setAttribute('role', 'alert');
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '1000',
    display: 'none',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '20px',
    padding: '24px',
    boxSizing: 'border-box',
    background: COLORS.background,
    color: COLORS.text,
    fontFamily: FONT_FAMILY,
    fontSize: '26px',
    fontWeight: '700',
    textAlign: 'center',
    touchAction: 'none',
    userSelect: 'none',
  });
  overlay.innerHTML = `${ICON}<div id="rotate-text">${ROTATE_TEXT}</div>`;
  document.body.appendChild(overlay);

  const update = (): void => {
    const next = isTouchDevice() && isUpright();
    overlay.hidden = !next;
    overlay.style.display = next ? 'flex' : 'none';
    if (next === showing) return;
    showing = next;
    for (const fn of [...listeners]) fn(showing);
  };
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  update();
}
