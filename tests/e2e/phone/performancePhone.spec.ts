import { expect, test } from '@playwright/test';
import { openGame } from '../helpers';
import { measureFrameTime } from '../perfHelpers';

test('on the phone with the CPU slowed 4x, 5 s of play averages under 8 ms per frame', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7', false);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const cost = await measureFrameTime(page, 5000);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  console.log(
    `phone 4x: ${cost.averageMs.toFixed(3)} ms/frame over ${cost.frames} frames, ${cost.fps.toFixed(1)} fps (rAF), replay played: ${cost.replayed}`,
  );
  expect(cost.replayed).toBe(true);
  expect(cost.frames).toBeGreaterThan(50);
  expect(cost.averageMs).toBeLessThan(8);
  expect(errors).toEqual([]);
});
