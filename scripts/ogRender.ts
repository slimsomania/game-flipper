/**
 * Draws the link-preview picture (F058): the name Flipsy and a bottle mid-flip over the table, in the
 * game's colors, on a canvas in headless Chromium (like iconRender.ts). `renderOgImage()` returns the
 * PNG bytes; `npm run icons` writes them to public/og-image.png. Nothing is drawn within
 * OG_SAFE_MARGIN px of the edges, because some apps crop the card.
 */
import { chromium } from '@playwright/test';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
export const OG_SAFE_MARGIN = 60;

/** Runs in the page: draws the picture and returns it as a base64 PNG. */
function drawOg(width: number, height: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, '#f4f8fc');
  bg.addColorStop(1, '#dbe5f0');
  g.fillStyle = bg;
  g.fillRect(0, 0, width, height);

  // The table: a band across the bottom, its top edge inside the safe area.
  const tableTop = 500;
  g.fillStyle = '#b98a5e';
  g.fillRect(0, tableTop, width, height - tableTop);
  g.fillStyle = '#9c7048';
  g.fillRect(0, tableTop, width, 8);

  // The throw: a dotted arc from the table up to the bottle.
  g.fillStyle = 'rgba(106, 76, 194, 0.35)';
  for (let i = 0; i < 9; i++) {
    const t = i / 9;
    const x = 640 + t * 120;
    const y = tableTop - 20 - Math.sin(t * Math.PI * 0.9) * 120;
    g.beginPath();
    g.arc(x, y, 6 + (1 - t) * 3, 0, Math.PI * 2);
    g.fill();
  }

  // The bottle, tipped over in the air (rotated 130 degrees), centered at (870, 270).
  const h = 300;
  const bodyW = h * 0.52;
  const neckW = bodyW * 0.42;
  const capH = h * 0.1;
  const neckH = h * 0.2;
  const bodyH = h - capH - neckH;
  const rr = (x: number, y: number, w: number, hh: number, r: number): void => {
    g.beginPath();
    g.roundRect(x, y, w, hh, r);
  };
  // Shadow on the table, under the bottle.
  g.fillStyle = 'rgba(36, 48, 64, 0.18)';
  g.beginPath();
  g.ellipse(870, tableTop + 40, 130, 14, 0, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.translate(870, 270);
  g.rotate((130 * Math.PI) / 180);
  g.translate(0, -h / 2);
  g.fillStyle = '#4a9be0';
  rr(-neckW / 2, capH, neckW, neckH + bodyH * 0.2, neckW * 0.2);
  g.fill();
  rr(-bodyW / 2, capH + neckH, bodyW, bodyH, bodyW * 0.22);
  g.fill();
  const waterH = bodyH * 0.55;
  const inset = bodyW * 0.07;
  g.fillStyle = '#2f7fd6';
  g.beginPath();
  g.roundRect(-bodyW / 2 + inset, h - waterH - inset, bodyW - 2 * inset, waterH, [
    0,
    0,
    bodyW * 0.17,
    bodyW * 0.17,
  ]);
  g.fill();
  g.fillStyle = 'rgba(255, 255, 255, 0.35)';
  rr(-bodyW * 0.36, capH + neckH + bodyH * 0.08, bodyW * 0.1, bodyH * 0.4, bodyW * 0.05);
  g.fill();
  g.fillStyle = '#6a4cc2';
  rr(-neckW * 0.62, 0, neckW * 1.24, capH, capH * 0.35);
  g.fill();
  g.restore();

  // The name, left, well inside the safe area.
  g.fillStyle = '#243040';
  g.textBaseline = 'alphabetic';
  g.font = '800 190px "Trebuchet MS", "Segoe UI", Arial, sans-serif';
  g.fillText('Flipsy', 100, 300);
  g.fillStyle = '#6a4cc2';
  g.font = '600 40px "Trebuchet MS", "Segoe UI", Arial, sans-serif';
  g.fillText('Flip it. Land it upright.', 106, 370);
  return canvas.toDataURL('image/png').split(',')[1]!;
}

export async function renderOgImage(): Promise<Buffer> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    // tsx's transpiler wraps named functions in a `__name` helper that doesn't exist in the page.
    await page.evaluate('window.__name = (fn) => fn');
    const base64 = await page.evaluate(
      ({ width, height, code }) =>
        (new Function(`return (${code})`)() as typeof drawOg)(width, height),
      { width: OG_WIDTH, height: OG_HEIGHT, code: drawOg.toString() },
    );
    return Buffer.from(base64, 'base64');
  } finally {
    await browser.close();
  }
}
