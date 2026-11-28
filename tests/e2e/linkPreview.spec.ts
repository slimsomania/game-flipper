import { expect, test } from '@playwright/test';

// F058: the link-preview tags and picture on the production build, and the F047/F057 tags kept.
const PROD = 'http://localhost:5197/';
const SITE = 'https://slimsomania.github.io/game-flipper/';
const DESCRIPTION =
  'Flip a water bottle and land it upright. A free skill game for your browser and phone.';

test('production build: index.html carries the link-preview tags', async ({ page }) => {
  await page.goto(PROD);
  const content = (selector: string) => page.locator(selector).getAttribute('content');
  expect(await content('meta[name="description"]')).toBe(DESCRIPTION);
  expect(await content('meta[property="og:type"]')).toBe('website');
  expect(await content('meta[property="og:site_name"]')).toBe('Flipsy');
  expect(await content('meta[property="og:title"]')).toBe('Flipsy');
  expect(await content('meta[property="og:description"]')).toBe(DESCRIPTION);
  expect(await content('meta[property="og:url"]')).toBe(SITE);
  expect(await content('meta[property="og:image"]')).toBe(`${SITE}og-image.png`);
  expect(await content('meta[property="og:image:width"]')).toBe('1200');
  expect(await content('meta[property="og:image:height"]')).toBe('630');
  expect((await content('meta[property="og:image:alt"]'))!.length).toBeGreaterThan(10);
  expect(await content('meta[name="twitter:card"]')).toBe('summary_large_image');
});

test('production build: og-image.png is a 1200x630 PNG under 300 KB', async ({ page }) => {
  const res = await page.request.get(`${PROD}og-image.png`);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('image/png');
  const body = await res.body();
  expect(body.length).toBeLessThan(300 * 1024);
  expect(body.readUInt32BE(16)).toBe(1200);
  expect(body.readUInt32BE(20)).toBe(630);
});

test('production build: the tags F047 and F057 rely on are still there', async ({ page }) => {
  await page.goto(PROD);
  expect(await page.title()).toBe('Flipsy');
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  expect(
    await page.locator('meta[name="apple-mobile-web-app-title"]').getAttribute('content'),
  ).toBe('Flipsy');
});
