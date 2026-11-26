import { expect, test } from '@playwright/test';
import { openGame } from '../helpers';
import { measureFrameTime } from '../perfHelpers';

/*
 * The phone budget (F049, decided by the human on 2026-11-26). Headless Chromium draws WebGL in
 * software (SwiftShader), so the milliseconds follow the test machine's CPU clock and load: the
 * same code measured 1.2 to 14.9 ms at 4x on the dev laptop. The gate is therefore the game's own
 * render work, the Graphics command-buffer entries it draws per frame, which don't depend on the
 * machine. With the static Graphics baked: about 60-80 on average, about 70 in a quiet frame, and
 * up to about 600 while a full 40-particle burst is alive (13 entries per particle). Before the
 * bake every frame drew about 800 (up to 1044). The throws' powers are random, so the number of
 * bursts varies; the limits leave room for that and still catch a return to unbaked drawing. The
 * time is logged for the progress entry and only has to stay under a loose ceiling that catches a
 * gross regression. A steady 60 fps is checked by hand on a real phone.
 */
const MAX_AVERAGE_COMMANDS = 250;
const MAX_FRAME_COMMANDS = 800;
const CEILING_MS = 25;

test('on the phone with the CPU slowed 4x, 5 s of play stays within the render-work budget', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7', false);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const cost = await measureFrameTime(page, 5000);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  console.log(
    `phone 4x: ${cost.averageMs.toFixed(3)} ms/frame over ${cost.frames} frames, ${cost.fps.toFixed(1)} fps (rAF), Graphics commands per frame ${cost.averageGraphicsCommands.toFixed(1)} average, ${cost.maxGraphicsCommands} max, replay played: ${cost.replayed}`,
  );
  expect(cost.replayed).toBe(true);
  expect(cost.frames).toBeGreaterThan(50);
  expect(cost.averageGraphicsCommands).toBeLessThanOrEqual(MAX_AVERAGE_COMMANDS);
  expect(cost.maxGraphicsCommands).toBeLessThanOrEqual(MAX_FRAME_COMMANDS);
  expect(cost.averageMs).toBeLessThan(CEILING_MS);
  expect(errors).toEqual([]);
});
