/**
 * Which hints the player gets (F043): a device with a fine pointer (a mouse, a trackpad, a pen) or
 * without one (a phone or tablet: fingers only). A touchscreen laptop still has a fine pointer, so it
 * keeps the keyboard-and-mouse wording.
 */
export type InputKind = 'keyboard' | 'touch';

/** `touch` when no fine pointer is present (the media query `(any-pointer: fine)` doesn't match). */
export function detectInputKind(): InputKind {
  return window.matchMedia('(any-pointer: fine)').matches ? 'keyboard' : 'touch';
}
