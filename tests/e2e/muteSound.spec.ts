import { expect, test } from '@playwright/test';
import { FLIPPED } from '../shared';
import { gameState, openGame, stepUntilOutcome } from './helpers';
import {
  DROPS,
  LANDS,
  MUTED,
  ON,
  SAVE_KEY,
  clickMuteButton,
  muteState,
  reload,
  savedEntry,
  skipResult,
  startSpaceThrow,
  throwAndLand,
} from './muteHelpers';
import { bottleCenter, sendMouse } from './mouseHelpers';
import { activeScenes, land } from './roundHelpers';
import {
  contextStates,
  soundNames,
  sounds,
  trackAudioContexts,
  watchAudioConsole,
} from './soundHelpers';

/*
 * The mute toggle (F017), the effect and the memory: while muted the game plays nothing at all (the
 * log `sounds()` gets no entries) and unmuting brings the sounds back; the choice is saved in the
 * one save entry and restored on load. The controls themselves are in `mute.spec.ts`.
 */

test.describe('while muted nothing is played', () => {
  test('a throw and a landing add nothing to sounds(), and unmuting brings the sounds back', async ({
    page,
  }) => {
    const errors = await openGame(page, '?seed=7');
    await page.keyboard.press('KeyM');
    await expect.poll(() => muteState(page)).toEqual(MUTED);

    // A landing that succeeds (the chime), then one that fails (the thud): both silent.
    const landed = await throwAndLand(page, LANDS);
    expect(landed.outcome).toMatchObject({ result: 'success' });
    expect(await sounds(page)).toEqual([]);
    await skipResult(page);
    const failed = await throwAndLand(page, DROPS);
    expect(failed.outcome).toMatchObject({ result: 'fail' });
    expect(await sounds(page)).toEqual([]);
    await skipResult(page);

    // Unmute, and the next throw makes its sounds again.
    await page.keyboard.press('KeyM');
    await expect.poll(() => muteState(page)).toEqual(ON);
    const again = await throwAndLand(page, LANDS);
    expect(again.outcome).toMatchObject({ result: 'success' });
    const names = await soundNames(page);
    expect(names[0]).toBe('whoosh');
    expect(names).toContain('knock');
    expect(names.at(-1)).toBe('chime');
    expect(errors).toEqual([]);
  });

  test('the speaker button mutes and unmutes the sounds the same way', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await clickMuteButton(page);
    await expect.poll(() => muteState(page)).toEqual(MUTED);
    await throwAndLand(page, LANDS);
    expect(await sounds(page)).toEqual([]);
    await skipResult(page);

    await clickMuteButton(page);
    await expect.poll(() => muteState(page)).toEqual(ON);
    await throwAndLand(page, LANDS);
    expect((await soundNames(page))[0]).toBe('whoosh');
    expect(errors).toEqual([]);
  });

  test('muting while the bottle is in the air silences the landing', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await startSpaceThrow(page, LANDS);
    await expect.poll(() => soundNames(page)).toEqual(['whoosh']);

    await page.keyboard.press('KeyM');
    await expect.poll(() => muteState(page)).toEqual(MUTED);
    const landed = await stepUntilOutcome(page);
    expect(landed.outcome).toMatchObject({ result: 'success' });
    expect(await soundNames(page)).toEqual(['whoosh']);
    expect(errors).toEqual([]);
  });

  test('a throw with the mouse is silent too', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await page.keyboard.press('KeyM');
    await expect.poll(() => muteState(page)).toEqual(MUTED);

    const from = await bottleCenter(page);
    await sendMouse(page, [
      { type: 'down', x: from.x, y: from.y, after: 0 },
      ...Array.from({ length: 10 }, (_, i) => ({
        type: 'move' as const,
        x: from.x,
        y: from.y - 20 * (i + 1),
        after: 10,
      })),
      { type: 'up', x: from.x, y: from.y - 200, after: 0 },
    ]);
    await expect.poll(() => gameState(page).then((state) => state.throws)).toBe(1);
    await stepUntilOutcome(page);
    expect(await sounds(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('the first input being M still unlocks the audio, and muting makes no console noise', async ({
    page,
  }) => {
    await trackAudioContexts(page);
    const audio = watchAudioConsole(page);
    const errors = await openGame(page, '?seed=7');
    expect(await contextStates(page)).toEqual([]);

    await page.keyboard.press('KeyM');
    await expect.poll(() => contextStates(page)).toEqual(['running']);
    await expect.poll(() => muteState(page)).toEqual(MUTED);
    await page.keyboard.press('KeyM');
    await expect.poll(() => muteState(page)).toEqual(ON);
    expect(await contextStates(page)).toEqual(['running']);
    expect(errors).toEqual([]);
    expect(audio).toEqual([]);
  });
});

test.describe('the choice is remembered', () => {
  test('mute survives a reload, and the button then shows the muted icon', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await page.keyboard.press('KeyM');
    await expect.poll(() => muteState(page)).toEqual(MUTED);
    expect(await savedEntry(page)).toMatchObject({ version: 1, muted: true });

    await reload(page);
    expect(await muteState(page)).toEqual(MUTED);
    // Muted from the first throw on, before any key was pressed on the new page.
    await throwAndLand(page, LANDS);
    expect(await sounds(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('unmuting is remembered too', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await page.keyboard.press('KeyM');
    await expect.poll(() => muteState(page)).toEqual(MUTED);
    await reload(page);
    expect(await muteState(page)).toEqual(MUTED);

    await clickMuteButton(page);
    await expect.poll(() => muteState(page)).toEqual(ON);
    expect(await savedEntry(page)).toMatchObject({ version: 1, muted: false });
    await reload(page);
    expect(await muteState(page)).toEqual(ON);
    await throwAndLand(page, LANDS);
    expect((await soundNames(page))[0]).toBe('whoosh');
    expect(errors).toEqual([]);
  });

  test('a restarted game scene keeps the setting and its button', async ({ page }) => {
    const errors = await openGame(page, '?seed=7');
    await page.keyboard.press('KeyM');
    await expect.poll(() => muteState(page)).toEqual(MUTED);

    await page.evaluate(() => window.__FLIPPER__!.startScene('Game', { seed: 7 }));
    await expect.poll(() => muteState(page)).toEqual(MUTED);

    // One scene, one handler: a single press and a single click each flip it once.
    await page.keyboard.press('KeyM');
    await expect.poll(() => muteState(page)).toEqual(ON);
    await clickMuteButton(page);
    await expect.poll(() => muteState(page)).toEqual(MUTED);
    expect(errors).toEqual([]);
  });

  test('it is saved in the one save entry, beside the best score', async ({ page }) => {
    await page.addInitScript((key) => {
      if (!window.localStorage.getItem(key)) {
        window.localStorage.setItem(key, JSON.stringify({ version: 1, best: 5 }));
      }
    }, SAVE_KEY);
    const errors = await openGame(page, '?seed=7');
    // An entry saved before mute existed has no mute field: the sound is on.
    expect(await muteState(page)).toEqual(ON);

    await page.keyboard.press('KeyM');
    await expect.poll(() => muteState(page)).toEqual(MUTED);
    expect(await savedEntry(page)).toEqual({ version: 1, best: 5, muted: true });
    expect(
      await page.evaluate(() =>
        Object.keys(window.localStorage).filter((key) => key.startsWith('flipper.save')),
      ),
    ).toEqual([SAVE_KEY]);
    expect(errors).toEqual([]);
  });

  test('a damaged mute setting is ignored, and the best score next to it is kept', async ({
    page,
  }) => {
    await page.addInitScript((key) => {
      if (!window.localStorage.getItem(key)) {
        window.localStorage.setItem(key, '{"version":1,"best":5,"muted":"yes"}');
      }
    }, SAVE_KEY);
    const errors = await openGame(page, '?seed=7');
    expect(await muteState(page)).toEqual(ON);

    await page.keyboard.press('KeyM');
    await expect.poll(() => muteState(page)).toEqual(MUTED);
    expect(await savedEntry(page)).toEqual({ version: 1, best: 5, muted: true });
    expect(errors).toEqual([]);
  });

  test('with localStorage blocked, muting still works for the visit', async ({ page }) => {
    await page.addInitScript(() => {
      const blocked = () => {
        throw new DOMException('blocked', 'SecurityError');
      };
      Storage.prototype.getItem = blocked;
      Storage.prototype.setItem = blocked;
      Storage.prototype.removeItem = blocked;
    });
    const errors = await openGame(page, '?seed=7');
    expect(await muteState(page)).toEqual(ON);

    await page.keyboard.press('KeyM');
    await expect.poll(() => muteState(page)).toEqual(MUTED);
    await throwAndLand(page, LANDS);
    expect(await sounds(page)).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test.describe('the test hooks', () => {
  test('setMuted does what the key does, and anything that is not a boolean is ignored', async ({
    page,
  }) => {
    const errors = await openGame(page, '?seed=7');
    expect(await page.evaluate(() => window.__FLIPPER__!.muted())).toBe(false);

    expect(await page.evaluate(() => window.__FLIPPER__!.setMuted(true))).toBe(true);
    expect(await muteState(page)).toEqual(MUTED);
    expect(await savedEntry(page)).toMatchObject({ muted: true });

    const ignored = await page.evaluate(() => {
      const hooks = window.__FLIPPER__! as unknown as { setMuted(value: unknown): boolean };
      return [hooks.setMuted('no'), hooks.setMuted(0), hooks.setMuted(undefined)];
    });
    expect(ignored).toEqual([true, true, true]);
    expect(await muteState(page)).toEqual(MUTED);

    expect(await page.evaluate(() => window.__FLIPPER__!.setMuted(false))).toBe(false);
    expect(await muteState(page)).toEqual(ON);
    expect(errors).toEqual([]);
  });

  test('muteButton() is the summary speaker while it is open, and the game speaker after', async ({
    page,
  }) => {
    const errors = await openGame(page, '?seed=7');
    await page.evaluate(() => window.__FLIPPER__!.setTuningValue('throwsPerRound', 1));
    await land(page, FLIPPED);
    await skipResult(page);
    await expect.poll(() => activeScenes(page)).toEqual(['Summary']);
    // The Game scene's button is paused behind the summary; this one is the summary's (F017 fix).
    expect(await muteState(page)).toEqual(ON);

    await page.keyboard.press('Enter'); // Play again
    await expect.poll(() => activeScenes(page)).toEqual(['Game']);
    await expect.poll(() => muteState(page)).toEqual(ON);
    expect(errors).toEqual([]);
  });

  test('the icon follows a change made while the Game scene is paused behind the summary', async ({
    page,
  }) => {
    const errors = await openGame(page, '?seed=7');
    await page.evaluate(() => window.__FLIPPER__!.setTuningValue('throwsPerRound', 1));
    await land(page, FLIPPED);
    await skipResult(page);
    await expect.poll(() => activeScenes(page)).toEqual(['Summary']);

    await page.evaluate(() => window.__FLIPPER__!.setMuted(true));
    await expect.poll(() => muteState(page)).toEqual(MUTED); // the summary's button follows too
    await page.keyboard.press('Enter'); // Play again: the Game scene runs again
    await expect.poll(() => activeScenes(page)).toEqual(['Game']);
    await expect.poll(() => muteState(page)).toEqual(MUTED);
    expect(errors).toEqual([]);
  });
});
