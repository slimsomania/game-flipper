import { expect, test, type Page } from '@playwright/test';
import { openTitle, settleInput } from '../helpers';
import { measureFrameTime } from '../perfHelpers';

// F061 on the phone: every duel HUD text is at least 24 game px tall, inside the canvas and clear
// of every other text, the corner buttons' hit areas and both power bars; the render budget of
// F049 holds in a duel too.

const MIN_HEIGHT = 24;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
const overlap = (a: Box, b: Box): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

async function startDuel(page: Page): Promise<void> {
  await openTitle(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.startScene('Game', { players: 2 }));
  await page.waitForFunction(() => window.__FLIPPER__!.state()?.players === 2);
  await settleInput(page);
}

async function expectClear(page: Page): Promise<void> {
  const boxes = await page.evaluate(() => window.__FLIPPER__!.textBounds());
  const duelSides = (await page.evaluate(() => window.__FLIPPER__!.duelSides()))!;
  const buttons = (await page.evaluate(() => window.__FLIPPER__!.buttons())).filter(
    (b) => b.name === 'pauseButton' || /mute|fullscreen/i.test(b.name),
  );
  expect(buttons.length).toBeGreaterThan(0);
  const hit = buttons.map((b) => ({
    left: b.x - b.width / 2,
    right: b.x + b.width / 2,
    top: b.y - b.height / 2,
    bottom: b.y + b.height / 2,
  }));
  expect(boxes.length).toBeGreaterThan(8);
  boxes.forEach((a, i) => {
    expect(a.bottom - a.top, `${a.text} height`).toBeGreaterThanOrEqual(MIN_HEIGHT);
    expect(a.left, a.text).toBeGreaterThanOrEqual(0);
    expect(a.top, a.text).toBeGreaterThanOrEqual(0);
    expect(a.right, a.text).toBeLessThanOrEqual(1280);
    expect(a.bottom, a.text).toBeLessThanOrEqual(720);
    boxes.slice(i + 1).forEach((b) => expect(overlap(a, b), `${a.text} / ${b.text}`).toBe(false));
    hit.forEach((h, j) => expect(overlap(a, h), `${a.text} / button ${j}`).toBe(false));
  });
  // The bars' own texts (POWER, 40%) are among the boxes; the stack texts must also miss the bar tracks.
  for (const side of duelSides) {
    for (const a of boxes) {
      if (/^(POWER|\d+%)$/.test(a.text)) continue;
      expect(overlap(a, side.bar), `${a.text} / bar ${side.side}`).toBe(false);
    }
  }
}

test('the duel HUD reads well on the phone on each turn', async ({ page }) => {
  await startDuel(page);
  await expectClear(page);
  await page.evaluate(() => {
    window.__FLIPPER__!.pause();
    window.__FLIPPER__!.throwBottle(36);
    window.__FLIPPER__!.step(400);
    window.__FLIPPER__!.skip();
  });
  await settleInput(page);
  expect((await page.evaluate(() => window.__FLIPPER__!.state()))!.duel!.active).toBe(2);
  await expectClear(page);
});

test('on the phone with the CPU slowed 4x, a duel stays within the render-work budget', async ({
  page,
}) => {
  await startDuel(page);
  await page.evaluate(() => window.__FLIPPER__!.resume());
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const cost = await measureFrameTime(page, 5000);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  console.log(
    `duel phone 4x: ${cost.averageMs.toFixed(3)} ms/frame, Graphics commands ${cost.averageGraphicsCommands.toFixed(1)} average, ${cost.maxGraphicsCommands} max`,
  );
  expect(cost.frames).toBeGreaterThan(50);
  expect(cost.averageGraphicsCommands).toBeLessThanOrEqual(250);
  expect(cost.maxGraphicsCommands).toBeLessThanOrEqual(800);
  expect(cost.averageMs).toBeLessThan(25);
});
