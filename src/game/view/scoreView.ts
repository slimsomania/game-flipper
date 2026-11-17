import type Phaser from 'phaser';
import { COLORS, FONT_FAMILY } from '../theme';

/*
 * The score sits in the top-left corner: clear of the power bar (below it, on the left of the
 * hand) and of every flight, which goes up from the hand and drifts toward the table. The
 * top-right corner is left free for the pause and mute buttons that come later.
 */
const SCORE_X = 32;
const SCORE_Y = 24;
/** Above the result flash, so the score is never tinted. */
const SCORE_DEPTH = 20;

export interface ScoreView {
  /** Show "Score: N". */
  update(score: number): void;
}

/** The running score, always on screen. */
export function createScoreView(scene: Phaser.Scene): ScoreView {
  const label = scene.add
    .text(SCORE_X, SCORE_Y, '', {
      fontFamily: FONT_FAMILY,
      fontSize: '40px',
      fontStyle: 'bold',
      color: COLORS.text,
    })
    .setDepth(SCORE_DEPTH);

  let drawn = Number.NaN;
  return {
    update(score) {
      if (score === drawn) return;
      drawn = score;
      label.setText(`Score: ${score}`);
    },
  };
}
