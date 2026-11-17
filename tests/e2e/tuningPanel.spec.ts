import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_TUNING, type Tuning } from '../../src/core/tuning';
import { gameState, openGame, settleInput, stepUntilOutcome } from './helpers';

/*
 * The developer tuning panel (F010): an HTML overlay, #tuning-panel, that Backquote shows and
 * hides. The e2e server is a dev build, so the panel is installed here; tuningPanelBuild.spec.ts
 * covers a production build. The values are read through window.__FLIPPER__.tuning() and the game
 * state, never from pixels.
 */

const PANEL = '#tuning-panel';
const keys = Object.keys(DEFAULT_TUNING) as (keyof Tuning)[];
const field = (key: string) => `#tuning-${key}`;

async function showPanel(page: Page): Promise<void> {
  await page.keyboard.press('Backquote');
  await expect(page.locator(PANEL)).toBeVisible();
}

const tuningOf = (page: Page): Promise<Tuning> => page.evaluate(() => window.__FLIPPER__!.tuning());

/** Throw at `power` with a bottle holding `water` and return the speed it leaves the hand at. */
async function launchSpeed(page: Page, water: number, power: number): Promise<number> {
  const state = await page.evaluate(
    ([w, p]) => {
      const hooks = window.__FLIPPER__!;
      hooks.pause();
      hooks.setWater(w);
      return hooks.throwBottle(p);
    },
    [water, power],
  );
  return Math.hypot(state!.bottle.vx, state!.bottle.vy);
}

test('the panel is hidden at start; Backquote shows it with every tuning key and its value, and hides it again', async ({
  page,
}) => {
  const errors = await openGame(page);
  await expect(page.locator(PANEL)).toBeHidden();

  await showPanel(page);
  await expect(page.locator('.tp-row')).toHaveCount(keys.length);
  for (const key of keys) {
    await expect(page.locator(field(key))).toHaveValue(String(DEFAULT_TUNING[key]));
    await expect(page.locator(`label[for="tuning-${key}"]`)).toHaveText(key);
  }
  // No default is marked as an edit.
  await expect(page.locator('.tp-row.changed')).toHaveCount(0);

  await page.keyboard.press('Backquote');
  await expect(page.locator(PANEL)).toBeHidden();
  expect(errors).toEqual([]);
});

test('the panel is a side overlay: it does not cover the bottle or the power bar', async ({
  page,
}) => {
  await openGame(page);
  await showPanel(page);
  const panel = (await page.locator(PANEL).boundingBox())!;
  const canvas = (await page.locator('canvas').boundingBox())!;
  // The bottle waits at x = 280 px and the power bar at x = 150 px on the 1280 px canvas.
  const scale = canvas.width / 1280;
  expect(panel.x).toBeGreaterThan(canvas.x + 400 * scale);
  expect(panel.x + panel.width).toBeLessThanOrEqual(canvas.x + canvas.width + 1);
  expect(panel.height).toBeLessThanOrEqual(canvas.height + 1);
});

test('changing a value in the panel updates tuning() and the next throw: a stronger impulse launches faster', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  const before = await launchSpeed(page, 0.5, 60);
  await stepUntilOutcome(page);
  await page.evaluate(() => window.__FLIPPER__!.skip());

  await showPanel(page);
  await page.locator(field('throwLinearImpulse')).fill('12');
  await expect.poll(async () => (await tuningOf(page)).throwLinearImpulse).toBe(12);
  await expect(page.locator('.tp-row:has(#tuning-throwLinearImpulse)')).toHaveClass(/changed/);
  // Only that field changed.
  const tuning = await tuningOf(page);
  expect(tuning).toEqual({ ...DEFAULT_TUNING, throwLinearImpulse: 12 });

  const after = await launchSpeed(page, 0.5, 60);
  expect(after).toBeGreaterThan(before);
  expect(after).toBeCloseTo((before * 12) / DEFAULT_TUNING.throwLinearImpulse, 6);
  expect(errors).toEqual([]);
});

test('typing digits, Space, letters or arrow keys into a field changes neither the power nor the phase', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());
  const start = await gameState(page);
  await showPanel(page);

  await page.locator(field('throwAngularImpulse')).click();
  await page.keyboard.type('5.5');
  for (const key of ['Space', 'ArrowUp', 'ArrowDown', 'ArrowUp', 'KeyR', 'Digit3', 'Backspace']) {
    await page.keyboard.press(key);
  }
  await settleInput(page);

  const after = await gameState(page);
  expect(after.power).toBe(start.power);
  expect(after.phase).toBe('aiming');
  expect(after.throws).toBe(0);
  expect(after.seed).toBe(start.seed); // R did not restart the game
  expect(errors).toEqual([]);
});

test('Backquote works from inside a field, and gives the keys back to the game', async ({
  page,
}) => {
  await openGame(page, '?seed=7');
  await page.evaluate(() => window.__FLIPPER__!.pause());
  const start = (await gameState(page)).power;
  await showPanel(page);
  await page.locator(field('throwAngularImpulse')).click();
  await expect(page.locator(field('throwAngularImpulse'))).toBeFocused();
  const valueBefore = await page.locator(field('throwAngularImpulse')).inputValue();

  await page.keyboard.press('Backquote');
  await expect(page.locator(PANEL)).toBeHidden();
  // No backtick was typed, and the focus left the field, so Up is the game's key again.
  expect((await tuningOf(page)).throwAngularImpulse).toBe(DEFAULT_TUNING.throwAngularImpulse);
  expect(valueBefore).toBe(String(DEFAULT_TUNING.throwAngularImpulse));
  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => (await gameState(page)).power).toBe(start + 1);
});

test('clicking and scrolling inside the panel does not reach the game (no skip, no power change)', async ({
  page,
}) => {
  await openGame(page, '?seed=7');
  await page.evaluate(() => {
    window.__FLIPPER__!.pause();
    window.__FLIPPER__!.throwBottle(50);
  });
  await stepUntilOutcome(page);
  expect((await gameState(page)).phase).toBe('result');
  const power = (await gameState(page)).power;

  await showPanel(page);
  await page.locator(field('waterMin')).click();
  await page.locator('#tuning-window-button').click();
  await page.locator('.tp-list').hover();
  await page.mouse.wheel(0, -200);
  await page.mouse.wheel(0, 200);
  await settleInput(page);
  const inPanel = await gameState(page);
  expect(inPanel.phase).toBe('result'); // a click in the panel is not a click on the game
  expect(inPanel.power).toBe(power);

  // The same click on the canvas does skip the wait: the panel is what stopped it above.
  await page.mouse.click(400, 300);
  await expect.poll(async () => (await gameState(page)).phase).toBe('aiming');
});

test('an edited value is still applied after a reload, and is marked as changed', async ({
  page,
}) => {
  const errors = await openGame(page, '?seed=7');
  await showPanel(page);
  await page.locator(field('throwLinearImpulse')).fill('12');
  await page.locator(field('bottleFriction')).fill('0.3');
  await expect.poll(async () => (await tuningOf(page)).bottleFriction).toBe(0.3);

  await page.reload();
  await page.waitForFunction(() => window.__FLIPPER__?.ready === true);
  // In effect from the very first bottle, with the panel still closed.
  expect(await tuningOf(page)).toEqual({
    ...DEFAULT_TUNING,
    throwLinearImpulse: 12,
    bottleFriction: 0.3,
  });
  await showPanel(page);
  await expect(page.locator(field('throwLinearImpulse'))).toHaveValue('12');
  await expect(page.locator(field('bottleFriction'))).toHaveValue('0.3');
  await expect(page.locator('.tp-row.changed')).toHaveCount(2);
  await expect(page.locator('.tp-row:has(#tuning-shellDensity)')).not.toHaveClass(/changed/);
  expect(errors).toEqual([]);
});

test('Reset restores the defaults, in the fields, in tuning() and after a reload', async ({
  page,
}) => {
  await openGame(page);
  await showPanel(page);
  await page.locator(field('throwLinearImpulse')).fill('12');
  await expect.poll(async () => (await tuningOf(page)).throwLinearImpulse).toBe(12);

  await page.getByRole('button', { name: 'Reset' }).click();
  expect(await tuningOf(page)).toEqual(DEFAULT_TUNING);
  await expect(page.locator(field('throwLinearImpulse'))).toHaveValue(
    String(DEFAULT_TUNING.throwLinearImpulse),
  );
  await expect(page.locator('.tp-row.changed')).toHaveCount(0);

  await page.reload();
  await page.waitForFunction(() => window.__FLIPPER__?.ready === true);
  expect(await tuningOf(page)).toEqual(DEFAULT_TUNING);
});

test.describe('Copy', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('gives the full current tuning as JSON, in the box and on the clipboard', async ({
    page,
  }) => {
    await openGame(page);
    await showPanel(page);
    await page.locator(field('throwLinearImpulse')).fill('12');
    await page.locator(field('throwSpinGrowth')).fill('0.02');
    await expect.poll(async () => (await tuningOf(page)).throwSpinGrowth).toBe(0.02);

    await page.getByRole('button', { name: 'Copy' }).click();
    const expected = { ...DEFAULT_TUNING, throwLinearImpulse: 12, throwSpinGrowth: 0.02 };
    const boxed = JSON.parse(await page.locator('#tuning-json').inputValue());
    expect(boxed).toEqual(expected);
    expect(Object.keys(boxed)).toEqual(keys); // every key, in the order of tuning.ts
    expect(await tuningOf(page)).toEqual(expected);

    await expect(page.locator('#tuning-status')).toContainText('Copied');
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(JSON.parse(clipboard)).toEqual(expected);
  });
});

test('the hooks edit the tuning like the panel: setTuningValue shows in the fields, and bad input is refused', async ({
  page,
}) => {
  await openGame(page);
  await showPanel(page);
  const result = await page.evaluate(() => window.__FLIPPER__!.setTuningValue('shellDensity', 1.2));
  expect(result).toEqual({ ...DEFAULT_TUNING, shellDensity: 1.2 });
  await expect(page.locator(field('shellDensity'))).toHaveValue('1.2');
  await expect(page.locator('.tp-row:has(#tuning-shellDensity)')).toHaveClass(/changed/);

  const refused = await page.evaluate(() => [
    window.__FLIPPER__!.setTuningValue('nope' as never, 1),
    window.__FLIPPER__!.setTuningValue('shellDensity', Number.NaN),
  ]);
  expect(refused).toEqual([null, null]);
  expect((await tuningOf(page)).shellDensity).toBe(1.2);
});

test('an empty or half-typed field is not applied, and shows the value in effect when left', async ({
  page,
}) => {
  await openGame(page);
  await showPanel(page);
  const input = page.locator(field('throwLinearImpulse'));
  await input.fill('');
  await settleInput(page);
  expect((await tuningOf(page)).throwLinearImpulse).toBe(DEFAULT_TUNING.throwLinearImpulse);
  await input.fill('11');
  await expect.poll(async () => (await tuningOf(page)).throwLinearImpulse).toBe(11);
  await input.fill('');
  await page.locator('#tuning-status').click(); // leave the field
  await expect(input).toHaveValue('11');
  expect((await tuningOf(page)).throwLinearImpulse).toBe(11);
});
