import { describe, expect, it } from 'vitest';
import { GAME_WIDTH } from '../../src/core/constants';
import { FULLSCREEN_BUTTON } from '../../src/game/view/fullscreenLayout';
import { MUTE_BUTTON } from '../../src/game/view/muteLayout';
import { SUMMARY_LAYOUT } from '../../src/game/view/summaryLayout';

/*
 * The round summary carries its own speaker button (F017): it sits where it does in play, and must
 * not be over the card or the buttons on it, or a click meant for one could land on the other.
 */
describe('the speaker button on the round summary', () => {
  const speaker = {
    left: MUTE_BUTTON.x - MUTE_BUTTON.width / 2,
    right: MUTE_BUTTON.x + MUTE_BUTTON.width / 2,
    top: MUTE_BUTTON.y - MUTE_BUTTON.height / 2,
    bottom: MUTE_BUTTON.y + MUTE_BUTTON.height / 2 + MUTE_BUTTON.lip,
  };
  const { card } = SUMMARY_LAYOUT;
  const cardRight = card.x + card.width / 2;

  it('is right of the card, with a clear gap, so it is never drawn over it', () => {
    expect(speaker.left - cardRight).toBeGreaterThanOrEqual(16);
  });

  it('is clear of the Play again and Title buttons', () => {
    for (const button of [SUMMARY_LAYOUT.playAgain, SUMMARY_LAYOUT.title]) {
      const right = button.x + button.width / 2;
      const bottom = button.y + button.height / 2;
      const apart = speaker.left > right || speaker.top > bottom;
      expect(apart).toBe(true);
    }
  });

  it('is on the canvas, in the top-right row, just left of the fullscreen button in the corner', () => {
    expect(speaker.right).toBeLessThan(FULLSCREEN_BUTTON.x - FULLSCREEN_BUTTON.width / 2);
    expect(FULLSCREEN_BUTTON.x + FULLSCREEN_BUTTON.width / 2).toBe(GAME_WIDTH - MUTE_BUTTON.margin);
    expect(speaker.top).toBe(MUTE_BUTTON.margin);
  });
});
