/**
 * Whether the developer tuning panel (and the tuning it keeps in localStorage) is in effect: in a
 * dev build, and in any build whose URL has `?debug`. `?testhooks` alone doesn't turn it on: that
 * only exposes `window.__FLIPPER__`. `search` is a URL query string such as "?debug&seed=7".
 */
export function isPanelEnabled(dev: boolean, search: string): boolean {
  return dev || new URLSearchParams(search).has('debug');
}

/** `isPanelEnabled` for this page. */
export function panelEnabled(): boolean {
  return isPanelEnabled(import.meta.env.DEV, window.location.search);
}
