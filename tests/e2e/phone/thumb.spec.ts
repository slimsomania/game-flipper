import { expect, test, type Page } from '@playwright/test';
import { openGame, openTitle } from '../helpers';
import { fsCalls, stubFullscreen } from '../fullscreenHelpers';
import { gamePoint } from '../mouseHelpers';
import { activeScenes } from '../roundHelpers';
import { playToSummary } from '../summaryHelpers';

// F042: every button's clickable area is at least 44x44 CSS px on the phone, and a finger tap 4 CSS
// px inside any corner of it activates that button.

interface Area {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const INSET = 4; // CSS px

test.beforeEach(async ({ page }) => {
  await stubFullscreen(page, 'ok');
});

const buttons = (page: Page): Promise<Area[]> => page.evaluate(() => window.__FLIPPER__!.buttons());
const paused = (page: Page) => page.evaluate(() => window.__FLIPPER__!.gamePaused());
const muted = (page: Page) => page.evaluate(() => window.__FLIPPER__!.muted());

async function cssScale(page: Page): Promise<number> {
  const box = await page.locator('canvas').boundingBox();
  return box!.width / 1280;
}

/** The four spots INSET CSS px inside the corners of an area, as page points. */
async function cornerSpots(page: Page, area: Area): Promise<{ x: number; y: number }[]> {
  const inset = INSET / (await cssScale(page)); // in game px
  const left = area.x - area.width / 2 + inset;
  const right = area.x + area.width / 2 - inset;
  const top = area.y - area.height / 2 + inset;
  const bottom = area.y + area.height / 2 - inset;
  return Promise.all(
    [
      [left, top],
      [right, top],
      [left, bottom],
      [right, bottom],
    ].map(([x, y]) => gamePoint(page, x, y)),
  );
}

async function tapButton(page: Page, name: string): Promise<void> {
  const area = (await buttons(page)).find((b) => b.name === name)!;
  const at = await gamePoint(page, area.x, area.y);
  await page.touchscreen.tap(at.x, at.y);
}

const setups = {
  title: (page: Page) => openTitle(page, '?seed=7'),
  play: (page: Page) => openGame(page, '?seed=7'),
  pause: async (page: Page) => {
    await openGame(page, '?seed=7');
    await tapButton(page, 'pauseButton');
    await expect.poll(() => paused(page)).toBe(true);
  },
  summary: async (page: Page) => {
    await openGame(page, '?seed=7');
    await playToSummary(page);
  },
};
type Screen = keyof typeof setups;

/** What each button does, as a check that waits for it. */
const effects: Record<string, (page: Page, mutedBefore: boolean) => Promise<void>> = {
  playButton: (page) => expect.poll(() => activeScenes(page)).toEqual(['Game']),
  howToButton: (page) =>
    expect.poll(() => page.evaluate(() => window.__FLIPPER__!.howToOpen())).toBe(true),
  pauseButton: (page) => expect.poll(() => paused(page)).not.toBe(undefined),
  muteButton: (page, before) => expect.poll(() => muted(page)).toBe(!before),
  fullscreenButton: (page) => expect.poll(async () => (await fsCalls(page)).req).toBe(1),
  resumeButton: (page) => expect.poll(() => paused(page)).toBe(false),
  restartButton: (page) => expect.poll(() => activeScenes(page)).toEqual(['Game']),
  quitButton: (page) => expect.poll(() => activeScenes(page)).toEqual(['Title']),
  playAgainButton: (page) => expect.poll(() => activeScenes(page)).toEqual(['Game']),
  titleButton: (page) => expect.poll(() => activeScenes(page)).toEqual(['Title']),
};

/** The effect of the corner pause button depends on the screen: it pauses in play, resumes in the overlay. */
const pauseEffect = (screen: Screen) => (page: Page) =>
  expect.poll(() => paused(page)).toBe(screen === 'play');

const expected: Record<Screen, string[]> = {
  title: ['playButton', 'howToButton', 'muteButton', 'fullscreenButton'],
  play: ['pauseButton', 'muteButton', 'fullscreenButton'],
  pause: [
    'pauseButton',
    'muteButton',
    'fullscreenButton',
    'resumeButton',
    'howToButton',
    'restartButton',
    'quitButton',
  ],
  summary: ['playAgainButton', 'titleButton', 'muteButton', 'fullscreenButton'],
};

for (const screen of Object.keys(setups) as Screen[]) {
  test(`${screen}: the hook lists the buttons and each area is at least 44x44 CSS px`, async ({
    page,
  }) => {
    await setups[screen](page);
    const list = await buttons(page);
    expect(list.map((b) => b.name).sort()).toEqual([...expected[screen]].sort());
    const scale = await cssScale(page);
    for (const b of list) {
      expect(b.width * scale, `${b.name} width`).toBeGreaterThanOrEqual(44);
      expect(b.height * scale, `${b.name} height`).toBeGreaterThanOrEqual(44);
    }
  });

  for (const name of expected[screen]) {
    test(`${screen}: a tap ${INSET} CSS px inside each corner of ${name} activates it`, async ({
      page,
    }) => {
      // The setup runs once per corner, and the Summary's plays a whole round, so 30 s is tight under load.
      test.setTimeout(120_000);
      for (let corner = 0; corner < 4; corner++) {
        await setups[screen](page);
        const area = (await buttons(page)).find((b) => b.name === name)!;
        const spot = (await cornerSpots(page, area))[corner];
        const mutedBefore = await muted(page); // the saved mute carries over to the next load
        await page.touchscreen.tap(spot.x, spot.y);
        const effect = name === 'pauseButton' ? pauseEffect(screen) : effects[name];
        await effect(page, mutedBefore);
      }
    });
  }
}
