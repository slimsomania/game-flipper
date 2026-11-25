import { expect, test } from '@playwright/test';
import { hitBox } from '../../src/game/view/buttonView';
import { MUTE_BUTTON } from '../../src/game/view/muteLayout';
import { FLIPPED } from '../shared';
import { gameState, openGame, recordKeydownRepeats, settleInput } from './helpers';
import {
  EMPTY,
  MUTED,
  ON,
  clickMuteButton,
  muteButtonBox,
  muteButtonPoint,
  muteState,
} from './muteHelpers';
import { bottleCenter, gamePoint, phaseOf, sendMouse } from './mouseHelpers';
import { activeScenes, land } from './roundHelpers';
import { sounds } from './soundHelpers';

/*
 * The mute toggle (F017), the controls: the M key and the speaker button in the top-right corner
 * both turn all sound off and on, the button's icon shows which, and a click on the button is not a
 * click on the game. The icon is read from the test hook `muteButton()`, the state the button last
 * drew. What is and isn't heard while muted, and what is remembered, is in `muteSound.spec.ts`.
 */

test.describe('the M key and the button', () => {
  test('M mutes and unmutes, and the button shows which', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    expect(await muteState(page)).toEqual(ON);

    await page.keyboard.press('KeyM');
    await expect.poll(() => muteState(page)).toEqual(MUTED);
    await page.keyboard.press('KeyM');
    await expect.poll(() => muteState(page)).toEqual(ON);
    expect(errors).toEqual([]);
  });

  test('clicking the speaker button does the same', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');

    await clickMuteButton(page);
    await expect.poll(() => muteState(page)).toEqual(MUTED);
    await clickMuteButton(page);
    await expect.poll(() => muteState(page)).toEqual(ON);
    expect(errors).toEqual([]);
  });

  test('the key and the button share one setting', async ({ page }) => {
    await openGame(page, '?seed=7');
    await page.keyboard.press('KeyM');
    await expect.poll(() => muteState(page)).toEqual(MUTED);
    await clickMuteButton(page);
    await expect.poll(() => muteState(page)).toEqual(ON);
    await clickMuteButton(page);
    await expect.poll(() => muteState(page)).toEqual(MUTED);
    await page.keyboard.press('KeyM');
    await expect.poll(() => muteState(page)).toEqual(ON);
  });

  test('a key held down flips the sound once: the auto-repeat is ignored', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    const repeats = await recordKeydownRepeats(page);

    await page.keyboard.down('KeyM');
    await expect.poll(() => muteState(page)).toEqual(MUTED);
    for (let i = 0; i < 3; i++) {
      await page.keyboard.down('KeyM');
      await settleInput(page);
    }
    expect(await repeats()).toEqual([false, true, true, true]);
    expect(await muteState(page)).toEqual(MUTED);

    await page.keyboard.up('KeyM');
    await page.keyboard.press('KeyM');
    await expect.poll(() => muteState(page)).toEqual(ON);
    expect(errors).toEqual([]);
  });

  test('the button is in the top-right corner of the canvas, where the layout puts it', async ({
    page,
  }) => {
    await openGame(page, '?seed=7');
    const box = await muteButtonBox(page);

    // The hook reports the clickable area (F042), which is bigger than the drawn face.
    const area = hitBox(MUTE_BUTTON);
    expect(box).toMatchObject({ x: MUTE_BUTTON.x, width: MUTE_BUTTON.hitWidth });
    expect(box.x + box.width / 2).toBe(area.right);
    expect(box.y - box.height / 2).toBe(area.top);
    expect(area.right).toBeLessThanOrEqual(1280);
    expect(MUTE_BUTTON.x + MUTE_BUTTON.width / 2).toBe(1280 - MUTE_BUTTON.margin);
    // Far from the round HUD on the left.
    expect(box.x).toBeGreaterThan(1280 * 0.75);
    expect(box.y).toBeLessThan(720 / 6);
  });

  test('it can be clicked when the window is smaller and the canvas is scaled down', async ({
    page,
  }) => {
    await openGame(page, '?seed=7');
    await page.setViewportSize({ width: 800, height: 450 });
    await page.waitForFunction(() => document.querySelector('canvas')!.clientWidth < 1000);

    await clickMuteButton(page);
    await expect.poll(() => muteState(page)).toEqual(MUTED);
  });
});

test.describe('a click on the button is not a click on the game', () => {
  test('it does not throw the bottle', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    const before = await gameState(page);

    await clickMuteButton(page);
    await expect.poll(() => muteState(page)).toEqual(MUTED);
    await settleInput(page);

    const after = await gameState(page);
    expect(after).toMatchObject({ phase: 'aiming', throws: 0, power: before.power });
    expect(after.dragging).toBe(false);
    expect(await sounds(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('it does not skip a result', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await land(page, FLIPPED); // the clock is paused, so the result stays until something skips it
    const before = await gameState(page);
    expect(before).toMatchObject({ phase: 'result', throws: 1, throwNumber: 1 });

    await clickMuteButton(page);
    await expect.poll(() => muteState(page)).toEqual(MUTED);
    await settleInput(page);
    expect(await gameState(page)).toMatchObject({
      phase: 'result',
      throws: 1,
      throwNumber: 1,
      outcome: before.outcome,
    });

    // The same click on an empty part of the canvas does skip it: the result was there to be skipped.
    const empty = await gamePoint(page, EMPTY.x, EMPTY.y);
    await page.mouse.click(empty.x, empty.y);
    await expect.poll(() => phaseOf(page)).toBe('aiming');
    expect(await gameState(page)).toMatchObject({ throws: 1, throwNumber: 2 });
    expect(errors).toEqual([]);
  });

  test('on the last result it does not end the round', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await page.evaluate(() => window.__FLIPPER__!.setTuningValue('throwsPerRound', 1));
    await land(page, FLIPPED);
    expect(await gameState(page)).toMatchObject({ phase: 'result', throwNumber: 1 });

    await clickMuteButton(page);
    await expect.poll(() => muteState(page)).toEqual(MUTED);
    await settleInput(page);
    expect(await activeScenes(page)).toEqual(['Game']);
    expect(await gameState(page)).toMatchObject({ phase: 'result' });

    const empty = await gamePoint(page, EMPTY.x, EMPTY.y);
    await page.mouse.click(empty.x, empty.y);
    await expect.poll(() => activeScenes(page)).toEqual(['Summary']);
    expect(errors).toEqual([]);
  });

  test('a press that starts or ends away from the button does not toggle it', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    const button = await muteButtonPoint(page);
    const empty = await gamePoint(page, EMPTY.x, EMPTY.y);

    // Pressed on empty canvas, let go over the button.
    await page.mouse.move(empty.x, empty.y);
    await page.mouse.down();
    await page.mouse.move(button.x, button.y, { steps: 5 });
    await page.mouse.up();
    await settleInput(page);
    expect(await muteState(page)).toEqual(ON);

    // Pressed on the button, let go away from it.
    await page.mouse.move(button.x, button.y);
    await page.mouse.down();
    await page.mouse.move(empty.x, empty.y, { steps: 5 });
    await page.mouse.up();
    await settleInput(page);
    expect(await muteState(page)).toEqual(ON);

    expect(await gameState(page)).toMatchObject({ phase: 'aiming', throws: 0 });
    expect(errors).toEqual([]);
  });

  test('a push that ends over the button still throws the bottle, and does not toggle it', async ({
    page,
  }) => {
    const errors = await openGame(page, '?seed=7');
    const from = await bottleCenter(page);
    const to = await muteButtonPoint(page);

    // Grab the bottle, swipe up and to the right onto the button in 100 ms, and let go there.
    const steps = Array.from({ length: 10 }, (_, i) => ({
      type: 'move' as const,
      x: from.x + ((to.x - from.x) * (i + 1)) / 10,
      y: from.y + ((to.y - from.y) * (i + 1)) / 10,
      after: 10,
    }));
    await sendMouse(page, [
      { type: 'down', x: from.x, y: from.y, after: 0 },
      ...steps,
      { type: 'up', x: to.x, y: to.y, after: 0 },
    ]);

    await expect.poll(() => gameState(page).then((state) => state.throws)).toBe(1);
    await settleInput(page);
    expect(await muteState(page)).toEqual(ON);
    expect(errors).toEqual([]);
  });
});
