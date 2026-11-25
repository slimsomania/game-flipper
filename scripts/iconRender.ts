/**
 * Draws the home-screen icons (F047): a bottle on the game's background, on a canvas in headless
 * Chromium. `renderIcons()` returns the PNG bytes by file name; `npm run icons` writes them to
 * public/icons/, and tests/e2e/homeScreenIcons.spec.ts checks that a fresh render equals the files.
 */
import { chromium } from '@playwright/test';

export interface IconSpec {
  file: string;
  size: number;
  /** The bottle's height as a fraction of the icon. The maskable one keeps well inside the middle 80%. */
  bottleHeight: number;
}

export const ICONS: readonly IconSpec[] = [
  { file: 'icon-192.png', size: 192, bottleHeight: 0.72 },
  { file: 'icon-512.png', size: 512, bottleHeight: 0.72 },
  { file: 'icon-maskable-512.png', size: 512, bottleHeight: 0.5 },
  { file: 'apple-touch-icon.png', size: 180, bottleHeight: 0.72 },
];

/** Runs in the page: draws one icon and returns it as a base64 PNG. */
function drawIcon(size: number, bottleHeight: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d')!;
  // The game's background gradient (theme.ts), full bleed so a mask never shows a gap.
  const bg = g.createLinearGradient(0, 0, 0, size);
  bg.addColorStop(0, '#f4f8fc');
  bg.addColorStop(1, '#dbe5f0');
  g.fillStyle = bg;
  g.fillRect(0, 0, size, size);

  const h = size * bottleHeight;
  const bodyW = h * 0.52;
  const neckW = bodyW * 0.42;
  const capH = h * 0.1;
  const neckH = h * 0.2;
  const bodyH = h - capH - neckH;
  const cx = size / 2;
  const top = (size - h) / 2;
  const roundRect = (x: number, y: number, w: number, hh: number, r: number): void => {
    g.beginPath();
    g.roundRect(x, y, w, hh, r);
  };
  // Shadow on the table.
  g.fillStyle = 'rgba(36, 48, 64, 0.16)';
  g.beginPath();
  g.ellipse(cx, top + h + h * 0.015, bodyW * 0.62, h * 0.035, 0, 0, Math.PI * 2);
  g.fill();
  // Shell: neck and body in the bottle blue.
  g.fillStyle = '#4a9be0';
  roundRect(cx - neckW / 2, top + capH, neckW, neckH + bodyH * 0.2, neckW * 0.2);
  g.fill();
  roundRect(cx - bodyW / 2, top + capH + neckH, bodyW, bodyH, bodyW * 0.22);
  g.fill();
  // Water in the lower part of the body.
  const waterH = bodyH * 0.55;
  const inset = bodyW * 0.07;
  g.fillStyle = '#2f7fd6';
  g.beginPath();
  g.roundRect(cx - bodyW / 2 + inset, top + h - waterH - inset, bodyW - 2 * inset, waterH, [
    0,
    0,
    bodyW * 0.17,
    bodyW * 0.17,
  ]);
  g.fill();
  // A highlight stripe.
  g.fillStyle = 'rgba(255, 255, 255, 0.35)';
  roundRect(
    cx - bodyW * 0.36,
    top + capH + neckH + bodyH * 0.08,
    bodyW * 0.1,
    bodyH * 0.4,
    bodyW * 0.05,
  );
  g.fill();
  // Cap.
  g.fillStyle = '#6a4cc2';
  roundRect(cx - neckW * 0.62, top, neckW * 1.24, capH, capH * 0.35);
  g.fill();
  return canvas.toDataURL('image/png').split(',')[1]!;
}

export async function renderIcons(): Promise<Map<string, Buffer>> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    // tsx's transpiler wraps named functions in a `__name` helper that doesn't exist in the page.
    await page.evaluate('window.__name = (fn) => fn');
    const out = new Map<string, Buffer>();
    for (const icon of ICONS) {
      const base64 = await page.evaluate(
        ({ size, bottleHeight, code }) =>
          (new Function(`return (${code})`)() as typeof drawIcon)(size, bottleHeight),
        { size: icon.size, bottleHeight: icon.bottleHeight, code: drawIcon.toString() },
      );
      out.set(icon.file, Buffer.from(base64, 'base64'));
    }
    return out;
  } finally {
    await browser.close();
  }
}
