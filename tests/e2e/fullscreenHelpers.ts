/*
 * Helpers for the e2e tests of the fullscreen button (`fullscreenButton.spec.ts`,
 * `phone/fullscreenButton.spec.ts`): a stub for the browser's fullscreen API that records calls and
 * tells the page the way the browser does (document.fullscreenElement and a fullscreenchange event),
 * and what the button shows.
 */
import { expect, type Page } from '@playwright/test';
import { gameState, settleInput } from './helpers';
import { gamePoint } from './mouseHelpers';

/** `ok`: works; `reject`: requestFullscreen is refused; `unsupported`: no page fullscreen (iPhone). */
export type FullscreenMode = 'ok' | 'reject' | 'unsupported';

interface FsWindow {
  __fs: { req: number; exit: number };
  __setFs: (on: boolean) => void;
}

export async function stubFullscreen(page: Page, mode: FullscreenMode): Promise<void> {
  await page.addInitScript((stubMode) => {
    const w = window as unknown as FsWindow;
    w.__fs = { req: 0, exit: 0 };
    let element: Element | null = null;
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => element,
    });
    w.__setFs = (on) => {
      element = on ? document.documentElement : null;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
    if (stubMode === 'unsupported') {
      Object.defineProperty(document, 'fullscreenEnabled', {
        configurable: true,
        get: () => false,
      });
      delete (Element.prototype as unknown as Record<string, unknown>).requestFullscreen;
      return;
    }
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true });
    Element.prototype.requestFullscreen = function () {
      w.__fs.req++;
      if (stubMode === 'reject') return Promise.reject(new Error('refused'));
      w.__setFs(true);
      return Promise.resolve();
    };
    document.exitFullscreen = () => {
      w.__fs.exit++;
      w.__setFs(false);
      return Promise.resolve();
    };
  }, mode);
}

export const fsCalls = (page: Page) => page.evaluate(() => (window as unknown as FsWindow).__fs);

/** The browser leaves fullscreen on its own (Esc, F11, the back gesture): the stub fires the event. */
export const leaveFullscreenOutside = (page: Page) =>
  page.evaluate(() => (window as unknown as FsWindow).__setFs(false));

/** The browser enters fullscreen on its own. */
export const enterFullscreenOutside = (page: Page) =>
  page.evaluate(() => (window as unknown as FsWindow).__setFs(true));

export async function fullscreenButtonBox(page: Page) {
  await settleInput(page);
  const box = await page.evaluate(() => window.__FLIPPER__!.fullscreenButton());
  if (!box) throw new Error('There is no fullscreen button on screen');
  return box;
}

/** Wait for the button to show the given icon. */
export const expectIcon = (page: Page, fullscreen: boolean) =>
  expect
    .poll(
      async () => (await page.evaluate(() => window.__FLIPPER__!.fullscreenButton()))?.fullscreen,
    )
    .toBe(fullscreen);

export const cardOpen = async (page: Page): Promise<boolean> => {
  await settleInput(page);
  return (await page.evaluate(() => window.__FLIPPER__!.fullscreenButton()))?.cardOpen ?? false;
};

/** Click the middle of the fullscreen button with the real mouse. */
export async function clickFullscreenButton(page: Page): Promise<void> {
  const { x, y } = await fullscreenButtonBox(page);
  const at = await gamePoint(page, x, y);
  await page.mouse.click(at.x, at.y);
}

/** Click a spot in game pixels. */
export async function clickGame(page: Page, spot: { x: number; y: number }): Promise<void> {
  const at = await gamePoint(page, spot.x, spot.y);
  await page.mouse.click(at.x, at.y);
}

/** The center and size of a named button on screen (game px), from `buttons()`. */
export async function buttonNamed(page: Page, name: string) {
  await settleInput(page);
  const found = (await page.evaluate(() => window.__FLIPPER__!.buttons())).find(
    (button) => button.name === name,
  );
  if (!found) throw new Error(`No button named ${name} on screen`);
  return found;
}

/** The part of the round a corner-button click must leave alone. */
export async function roundState(page: Page) {
  const { phase, throwNumber, score, power } = await gameState(page);
  return { phase, throwNumber, score, power };
}
