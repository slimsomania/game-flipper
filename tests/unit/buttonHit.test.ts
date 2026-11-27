import { describe, expect, it } from 'vitest';
import { GAME_HEIGHT, GAME_WIDTH } from '../../src/core/constants';
import { hitBox, type HitBox, type HitSource } from '../../src/game/view/buttonView';
import { MUTE_BUTTON } from '../../src/game/view/muteLayout';
import { PAUSE_BUTTON, PAUSE_LAYOUT } from '../../src/game/view/pauseLayout';
import { SUMMARY_LAYOUT } from '../../src/game/view/summaryLayout';
import { TITLE_LAYOUT } from '../../src/game/view/titleLayout';

// F042: every button's clickable area is at least 88 game px (44 CSS px at the phone's half scale)
// each way, and no two areas on one screen overlap.
const MIN = 88;

const screens: Record<string, Record<string, HitSource>> = {
  title: { play: TITLE_LAYOUT.play, mute: MUTE_BUTTON },
  play: { pause: PAUSE_BUTTON, mute: MUTE_BUTTON },
  pause: {
    resume: PAUSE_LAYOUT.resume,
    howTo: PAUSE_LAYOUT.howTo,
    restart: PAUSE_LAYOUT.restart,
    quit: PAUSE_LAYOUT.quit,
    cornerResume: PAUSE_BUTTON,
    mute: MUTE_BUTTON,
  },
  summary: { playAgain: SUMMARY_LAYOUT.playAgain, title: SUMMARY_LAYOUT.title, mute: MUTE_BUTTON },
};

const overlap = (a: HitBox, b: HitBox) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

describe('button hit areas', () => {
  for (const [screen, buttons] of Object.entries(screens)) {
    it(`${screen}: every area is at least ${MIN}x${MIN} and on the canvas`, () => {
      for (const source of Object.values(buttons)) {
        const box = hitBox(source);
        expect(box.right - box.left).toBeGreaterThanOrEqual(MIN);
        expect(box.bottom - box.top).toBeGreaterThanOrEqual(MIN);
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(GAME_WIDTH);
        expect(box.bottom).toBeLessThanOrEqual(GAME_HEIGHT);
      }
    });

    it(`${screen}: no two areas overlap`, () => {
      const boxes = Object.entries(buttons).map(
        ([name, source]) => [name, hitBox(source)] as const,
      );
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          expect(overlap(boxes[i]![1], boxes[j]![1]), `${boxes[i]![0]} / ${boxes[j]![0]}`).toBe(
            false,
          );
        }
      }
    });
  }

  it('the corner buttons stay clear of the HUD (top left) and the power bar (left of the hand)', () => {
    for (const corner of [MUTE_BUTTON, PAUSE_BUTTON]) {
      const box = hitBox(corner);
      expect(box.left).toBeGreaterThan(GAME_WIDTH * 0.75 - 100);
      expect(box.bottom).toBeLessThan(GAME_HEIGHT / 6);
    }
  });

  it('the drawn face of a corner button is smaller than its area and inside it', () => {
    const box = hitBox(MUTE_BUTTON);
    expect(MUTE_BUTTON.width).toBeLessThan(box.right - box.left);
    expect(MUTE_BUTTON.x - MUTE_BUTTON.width / 2).toBeGreaterThanOrEqual(box.left);
    expect(MUTE_BUTTON.x + MUTE_BUTTON.width / 2).toBeLessThanOrEqual(box.right);
  });
});
