import type Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../core/constants';
import type { Outcome } from '../../core/outcome';
import { OVERSCAN_PX } from '../effects/effects';
import { FONT_FAMILY } from '../theme';
import { flashAlpha, popScale, resultStyle } from './resultStyle';

/** Above the table, bottle and power bar, so the flash tints them; the message sits above it. */
const FLASH_DEPTH = 10;
const MESSAGE_DEPTH = 20;
/** The message is centered over the table, high enough to clear the landed bottle. */
const MESSAGE_X = GAME_WIDTH / 2;
const MESSAGE_Y = 190;

export interface ResultView {
  /**
   * Show the result of the current throw, or nothing when `outcome` is null. `resultSteps` is the
   * snapshot's count of steps since the outcome: the flash fades by it, the message stays.
   */
  update(outcome: Outcome | null, resultSteps: number | null): void;
}

/**
 * The result of a throw: a flash over the whole screen that fades within half a second ("green"
 * for a success, "red" for a fail), and a large message that pops in (small, a little past full
 * size, then full size) and stays until the next bottle appears. The message is hidden (not just
 * empty) when there is no result, so it never shows up in the visible texts of the scene. The
 * flash reaches past the canvas by `OVERSCAN_PX`, so a camera shake never shows its edge.
 */
export function createResultView(scene: Phaser.Scene): ResultView {
  const flash = scene.add
    .rectangle(
      -OVERSCAN_PX,
      -OVERSCAN_PX,
      GAME_WIDTH + 2 * OVERSCAN_PX,
      GAME_HEIGHT + 2 * OVERSCAN_PX,
      0xffffff,
      1,
    )
    .setOrigin(0, 0)
    .setDepth(FLASH_DEPTH)
    .setVisible(false);
  const message = scene.add
    .text(MESSAGE_X, MESSAGE_Y, '', {
      fontFamily: FONT_FAMILY,
      fontSize: '88px',
      fontStyle: 'bold',
    })
    .setOrigin(0.5)
    .setDepth(MESSAGE_DEPTH)
    .setVisible(false);

  return {
    update(outcome, resultSteps) {
      if (!outcome) {
        flash.setVisible(false);
        message.setVisible(false);
        return;
      }
      const style = resultStyle(outcome);
      const alpha = flashAlpha(resultSteps);
      flash.setFillStyle(style.flash, alpha).setVisible(alpha > 0);
      message
        .setText(style.message)
        .setColor(style.text)
        .setScale(popScale(resultSteps))
        .setVisible(true);
    },
  };
}
