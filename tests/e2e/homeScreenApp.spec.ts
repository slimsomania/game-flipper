import { expect, test, type Page } from '@playwright/test';
import { openTitle, settleInput } from './helpers';

/*
 * F047: the web app manifest, the iPhone tags and the icons, on the dev-mode build (default baseURL)
 * and on the production build (port 5197); and the fullscreen button hiding in a home-screen app.
 */

interface Manifest {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  display_override: string[];
  orientation: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
}

/** Loads an image URL in the page and returns its status, content type and decoded size. */
async function probeImage(page: Page, url: string) {
  return page.evaluate(async (src) => {
    const res = await fetch(src);
    const type = res.headers.get('content-type');
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    return { status: res.status, type, width: bitmap.width, height: bitmap.height };
  }, url);
}

async function checkManifestAndIcons(page: Page): Promise<void> {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const manifestUrl = new URL(href!, page.url()).href;
  const res = await page.request.get(manifestUrl);
  expect(res.status()).toBe(200);
  const manifest = (await res.json()) as Manifest;
  expect(manifest).toMatchObject({
    name: 'Flipsy',
    short_name: 'Flipsy',
    display: 'fullscreen',
    orientation: 'landscape',
  });
  expect(manifest.display_override).toEqual(['fullscreen', 'standalone']);
  expect(manifest.start_url).toMatch(/^\./);
  expect(manifest.scope).toMatch(/^\./);
  const sizes = manifest.icons.map((icon) => icon.sizes);
  expect(sizes).toContain('192x192');
  expect(sizes).toContain('512x512');
  expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);

  const urls = manifest.icons.map((icon) => ({
    url: new URL(icon.src, manifestUrl).href,
    size: Number.parseInt(icon.sizes, 10),
  }));
  const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  urls.push({ url: new URL(apple!, page.url()).href, size: 180 });
  for (const { url, size } of urls) {
    expect(await probeImage(page, url), url).toEqual({
      status: 200,
      type: 'image/png',
      width: size,
      height: size,
    });
  }
}

test('the page links a manifest and icons that load and decode to their size', async ({ page }) => {
  await checkManifestAndIcons(page);
});

test('the head has the iPhone home-screen tags', async ({ page }) => {
  await page.goto('/');
  const meta = (name: string) => page.locator(`meta[name="${name}"]`).getAttribute('content');
  expect(await meta('apple-mobile-web-app-capable')).toBe('yes');
  expect(await meta('mobile-web-app-capable')).toBe('yes');
  expect(await meta('apple-mobile-web-app-title')).toBe('Flipsy');
  expect(await meta('apple-mobile-web-app-status-bar-style')).toBe('black-translucent');
});

test.describe('production build', () => {
  test.use({ baseURL: 'http://localhost:5197' });
  test('the manifest and every icon load', async ({ page }) => {
    await checkManifestAndIcons(page);
  });
});

/** Make matchMedia say that only the given display mode matches. */
async function stubDisplayMode(page: Page, mode: string | null): Promise<void> {
  await page.addInitScript((matching) => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      const result = real(query);
      if (!query.includes('display-mode')) return result;
      const on = matching !== null && query.includes(matching);
      return new Proxy(result, {
        get: (target, prop) => (prop === 'matches' ? on : (Reflect.get(target, prop) as unknown)),
      });
    };
  }, mode);
}

for (const [mode, shown] of [
  ['fullscreen', false],
  ['standalone', false],
  [null, true],
] as const) {
  test(`display-mode ${mode ?? 'browser'}: the fullscreen button is ${shown ? 'shown' : 'hidden'}`, async ({
    page,
  }) => {
    await stubDisplayMode(page, mode);
    await openTitle(page, '?testhooks&seed=7');
    await settleInput(page);
    const button = await page.evaluate(() => window.__FLIPPER__!.fullscreenButton());
    expect(button !== null).toBe(shown);
  });
}

/** Make navigator.standalone (older iOS Safari's home-screen flag) answer `value`; no display-mode matches. */
async function stubStandalone(page: Page, value: boolean | undefined): Promise<void> {
  await stubDisplayMode(page, null);
  await page.addInitScript((standalone) => {
    Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => standalone });
  }, value);
}

for (const [value, shown] of [
  [true, false],
  [false, true],
  [undefined, true],
] as const) {
  test(`navigator.standalone ${String(value)}: the fullscreen button is ${shown ? 'shown' : 'hidden'}`, async ({
    page,
  }) => {
    await stubStandalone(page, value);
    await openTitle(page, '?testhooks&seed=7');
    await settleInput(page);
    const button = await page.evaluate(() => window.__FLIPPER__!.fullscreenButton());
    expect(button !== null).toBe(shown);
  });
}
