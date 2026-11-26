import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { TITLE_LAYOUT } from '../../../src/game/view/titleLayout';
import { fsCalls, fsOnRoot, stubFullscreen } from '../fullscreenHelpers';
import { openTitle } from '../helpers';
import { gamePoint } from '../mouseHelpers';

// F040: the page stays still under a finger, fills the screen, keeps clear of the notch, and the
// Play tap asks for fullscreen (once, and a refusal changes nothing).

const sessions = new WeakMap<Page, CDPSession>();

async function cdpTouch(
  page: Page,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  x: number,
  y: number,
): Promise<void> {
  let cdp = sessions.get(page);
  if (!cdp) {
    cdp = await page.context().newCDPSession(page);
    sessions.set(page, cdp);
  }
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
  });
}

const canvasBox = (page: Page) =>
  page.evaluate(() => {
    const r = document.querySelector('canvas')!.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
  });

test('a 1 s touch opens no menu and selects nothing; swipes never scroll or zoom', async ({
  page,
}) => {
  const errors = await openTitle(page, '?seed=7');
  await page.evaluate(() => {
    const w = window as unknown as { __menus: boolean[] };
    w.__menus = [];
    window.addEventListener('contextmenu', (e) => w.__menus.push(e.defaultPrevented));
  });
  const spot = await gamePoint(page, 640, 150);
  await cdpTouch(page, 'touchStart', spot.x, spot.y);
  await page.waitForTimeout(1000);
  await cdpTouch(page, 'touchEnd', spot.x, spot.y);
  const menus = await page.evaluate(() => (window as unknown as { __menus: boolean[] }).__menus);
  expect(menus.every(Boolean)).toBe(true);
  // The headless touch may fire no contextmenu at all, so also dispatch our own on the canvas and
  // on the letterbox: the guard must default-prevent both.
  const synthetic = await page.evaluate(() =>
    ['canvas', '#game'].map((sel) => {
      const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      document.querySelector(sel)!.dispatchEvent(e);
      return e.defaultPrevented;
    }),
  );
  expect(synthetic).toEqual([true, true]);
  expect(
    await page.evaluate(() => (window as unknown as { __menus: boolean[] }).__menus.length),
  ).toBeGreaterThan(0);
  expect(await page.evaluate(() => getSelection()!.toString())).toBe('');

  // Swipes across the canvas and across the letterbox (the 50 px strip at the left).
  for (const [x1, y1, x2, y2] of [
    [300, 100, 300, 300],
    [300, 300, 400, 80],
    [20, 300, 20, 60],
    [20, 60, 20, 300],
  ]) {
    await cdpTouch(page, 'touchStart', x1, y1);
    await cdpTouch(page, 'touchMove', (x1 + x2) / 2, (y1 + y2) / 2);
    await cdpTouch(page, 'touchMove', x2, y2);
    await cdpTouch(page, 'touchEnd', x2, y2);
  }
  const view = await page.evaluate(() => ({
    x: window.scrollX,
    y: window.scrollY,
    scale: window.visualViewport!.scale,
  }));
  expect(view).toEqual({ x: 0, y: 0, scale: 1 });
  expect(errors).toEqual([]);
});

test('the viewport meta and the computed styles forbid zoom, touch actions and selection', async ({
  page,
}) => {
  await openTitle(page, '?seed=7');
  const meta = await page.evaluate(() =>
    document.querySelector('meta[name=viewport]')!.getAttribute('content')!,
  );
  expect(meta).toContain('user-scalable=no');
  expect(meta).toContain('maximum-scale=1');
  const styles = await page.evaluate(() =>
    ['html', 'body', '#game'].map((s) => {
      const c = getComputedStyle(document.querySelector(s)!);
      return [c.touchAction, c.userSelect];
    }),
  );
  expect(styles).toEqual([
    ['none', 'none'],
    ['none', 'none'],
    ['none', 'none'],
  ]);
});

test('the canvas stays inside the safe-area insets', async ({ page }) => {
  await openTitle(page, '?seed=7');
  const before = await canvasBox(page);
  expect([before.w, before.h]).toEqual([640, 360]);
  await page.evaluate(() => {
    const s = document.documentElement.style;
    s.setProperty('--safe-left', '44px');
    s.setProperty('--safe-right', '44px');
  });
  await expect
    .poll(async () => {
      const b = await canvasBox(page);
      return b.left >= 44 && b.right <= 740 - 44 && b.bottom <= 360.5;
    })
    .toBe(true);
  await page.evaluate(() => {
    const s = document.documentElement.style;
    s.setProperty('--safe-left', '0px');
    s.setProperty('--safe-right', '0px');
  });
  await expect.poll(async () => (await canvasBox(page)).w).toBe(640);
  expect((await canvasBox(page)).h).toBe(360);

  // Insets that force a shrink: the canvas must follow them, and grow back afterwards.
  await page.evaluate(() => {
    const s = document.documentElement.style;
    s.setProperty('--safe-left', '80px');
    s.setProperty('--safe-right', '80px');
  });
  await expect
    .poll(async () => {
      const b = await canvasBox(page);
      return b.w <= 580 && b.left >= 80 && b.right <= 660;
    })
    .toBe(true);
  await page.evaluate(() => {
    const s = document.documentElement.style;
    s.setProperty('--safe-left', '0px');
    s.setProperty('--safe-right', '0px');
  });
  await expect.poll(async () => (await canvasBox(page)).w).toBe(640);
  expect((await canvasBox(page)).h).toBe(360);
});

test('the Play tap requests fullscreen once; a refusal still starts the round', async ({
  page,
}) => {
  await stubFullscreen(page, 'reject');
  const errors = await openTitle(page, '?seed=7');
  const at = await gamePoint(page, TITLE_LAYOUT.play.x, TITLE_LAYOUT.play.y);
  await page.touchscreen.tap(at.x, at.y);
  await expect
    .poll(() => page.evaluate(() => window.__FLIPPER__!.activeScenes()))
    .toEqual(['Game']);
  expect((await fsCalls(page)).req).toBe(1);
  expect(await fsOnRoot(page)).toEqual([true]);
  expect(errors).toEqual([]);
});
