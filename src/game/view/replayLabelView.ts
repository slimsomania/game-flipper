import type Phaser from 'phaser';
import { GAME_WIDTH } from '../../core/constants';
import { COLORS, FONT_FAMILY } from '../theme';

/** Below the result message (y 190) and above the table, clear of the HUD corners. */
const LABEL_Y = 270;
const LABEL_DEPTH = 20;

export interface ReplayLabelView {
  /** Show the "Replay" label while a replay plays, hide it otherwise. */
  update(replaying: boolean): void;
}

/** The small "Replay" label shown during the slow-motion replay of the landing (F027). */
export function createReplayLabelView(scene: Phaser.Scene): ReplayLabelView {
  const label = scene.add
    .text(GAME_WIDTH / 2, LABEL_Y, 'Replay', {
      fontFamily: FONT_FAMILY,
      fontSize: '32px',
      fontStyle: 'bold',
      color: COLORS.text,
    })
    .setOrigin(0.5)
    .setDepth(LABEL_DEPTH)
    .setVisible(false);
  return {
    update(replaying) {
      label.setVisible(replaying);
    },
  };
}
