import type Phaser from 'phaser';
import { COLORS, FONT_FAMILY } from '../theme';
import { createButton, type ButtonView } from './buttonView';
import { SUMMARY_LAYOUT } from './summaryLayout';
import { summaryTexts, type SummaryState } from './summaryText';

const CARD_DEPTH = 1;
const TEXT_DEPTH = 2;

export interface SummaryView {
  /** The Play again button (its click and the keyboard shortcuts do the same thing). */
  playAgain: ButtonView;
}

/**
 * The round summary: a white card, centered on the plain light background, with "Round over", the
 * round's points as the biggest line, its landings out of its throws, the best score (with "New
 * best!" under it when this round set it), the Play again button and a line about the keys. The
 * background is the same light color as in play, drawn over the Game scene, which waits underneath;
 * the card is what stands out.
 */
export function createSummaryView(
  scene: Phaser.Scene,
  state: SummaryState,
  onPlayAgain: () => void,
): SummaryView {
  const layout = SUMMARY_LAYOUT;
  const texts = summaryTexts(state);

  // An opaque camera background hides the paused Game scene (table, last bottle, HUD) completely.
  scene.cameras.main.setBackgroundColor(COLORS.background);

  const { x, y, width, height, radius } = layout.card;
  scene.add
    .graphics()
    .setDepth(CARD_DEPTH)
    .fillStyle(COLORS.cardShadow)
    .fillRoundedRect(x - width / 2, y - height / 2 + layout.shadow, width, height, radius)
    .fillStyle(COLORS.card)
    .fillRoundedRect(x - width / 2, y - height / 2, width, height, radius);

  const line = (textY: number, content: string, size: number, color: string) =>
    scene.add
      .text(x, textY, content, {
        fontFamily: FONT_FAMILY,
        fontSize: `${size}px`,
        fontStyle: 'bold',
        color,
      })
      .setOrigin(0.5)
      .setDepth(TEXT_DEPTH);
  line(layout.titleY, texts.title, 40, COLORS.muted);
  const score = line(layout.scoreY, texts.scoreLine, 96, COLORS.text);
  const landed = line(layout.landedY, texts.landedLine, 44, COLORS.text);
  const best = line(layout.bestY, texts.bestLine, 36, COLORS.text);
  const lines = [score, landed, best];
  // Only a round that set a best has the note: otherwise there is no text object to see.
  if (texts.newBestLine !== null) {
    lines.push(line(layout.newBestY, texts.newBestLine, 32, COLORS.successText));
  }
  for (const text of lines) {
    if (text.width > layout.maxTextWidth) text.setScale(layout.maxTextWidth / text.width);
  }

  const { playAgain } = layout;
  const button = createButton(scene, {
    x: playAgain.x,
    y: playAgain.y,
    width: playAgain.width,
    height: playAgain.height,
    label: texts.playAgainLabel,
    depth: TEXT_DEPTH,
    onActivate: onPlayAgain,
  });
  line(layout.keyHintY, texts.keyHint, 24, COLORS.muted).setFontStyle('normal');

  return { playAgain: button };
}
