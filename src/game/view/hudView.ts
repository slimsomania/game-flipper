import type Phaser from 'phaser';
import { COLORS, FONT_FAMILY } from '../theme';
import { hudTexts, type HudState } from './hudText';

/*
 * The round HUD sits in the top-left corner as one stack: the throw number, the score (the biggest
 * line) and the streak. That corner is clear of the power bar (below it, on the left of the hand)
 * and of every flight, which goes up from the hand and drifts toward the table. The top-right
 * corner is left free for the pause and mute buttons that come later, and the developer tuning
 * panel covers the right edge.
 */
const HUD_X = 32;
const THROW_Y = 22;
const SCORE_Y = 58;
const STREAK_Y = 112;
/** Above the result flash, so the HUD is never tinted. */
const HUD_DEPTH = 20;

export interface HudView {
  /** Show "Throw N / M", "Score: N" and "Streak: N". */
  update(state: HudState): void;
}

/** The round's progress, always on screen. The score line keeps the exact text "Score: N". */
export function createHudView(scene: Phaser.Scene): HudView {
  const line = (y: number, size: number) =>
    scene.add
      .text(HUD_X, y, '', {
        fontFamily: FONT_FAMILY,
        fontSize: `${size}px`,
        fontStyle: 'bold',
        color: COLORS.text,
      })
      .setDepth(HUD_DEPTH);
  const throwLabel = line(THROW_Y, 28);
  const scoreLabel = line(SCORE_Y, 40);
  const streakLabel = line(STREAK_Y, 28);

  let drawn = '';
  return {
    update(state) {
      const texts = hudTexts(state);
      const key = `${texts.throwLine}|${texts.scoreLine}|${texts.streakLine}`;
      if (key === drawn) return;
      drawn = key;
      throwLabel.setText(texts.throwLine);
      scoreLabel.setText(texts.scoreLine);
      streakLabel.setText(texts.streakLine);
    },
  };
}
