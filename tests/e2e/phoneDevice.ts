/*
 * The emulated phone the `phone` Playwright project runs on (F037; F038 reuses it): a small 6-inch
 * Android phone held sideways. 740×360 CSS px is the smallest common landscape phone screen, so
 * readability and button-size checks made on it are conservative. The game's 1280×720 canvas fits
 * it at exactly 0.5 CSS px per game px (640×360, centered with 50 px at each side).
 * Not a test file.
 */
export const PHONE_VIEWPORT = { width: 740, height: 360 };

export const PHONE_DEVICE = {
  viewport: PHONE_VIEWPORT,
  screen: PHONE_VIEWPORT,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
} as const;

/** The same phone held upright (F038: `npm run snap -- --portrait`). */
export const PORTRAIT_VIEWPORT = { width: PHONE_VIEWPORT.height, height: PHONE_VIEWPORT.width };

export const PORTRAIT_DEVICE = {
  ...PHONE_DEVICE,
  viewport: PORTRAIT_VIEWPORT,
  screen: PORTRAIT_VIEWPORT,
} as const;

/** The phone's tests live here; the desktop project skips the folder. */
export const PHONE_TEST_DIR = 'phone';
