import type Phaser from 'phaser';
import { detectInputKind } from '../inputKind';
import { COLORS, FONT_FAMILY } from '../theme';
import { createButton, type ButtonView } from './buttonView';
import { SUMMARY_LAYOUT } from './summaryLayout';
import { summaryTexts, type SummaryState } from './summaryText';

const CARD_DEPTH = 1;
const TEXT_DEPTH = 2;

export interface SummaryView {
  /** The Play again button (its click and the keyboard shortcuts do the same thing). */
  playAgain: ButtonView;
  /** The Title button: back to the title screen (click only). */
  title: ButtonView;
}

/**
 * The round summary: a white card, centered on the plain light background, with "Round over", the
 * round's points as the biggest line, its landings out of its throws, the best score (with "New
 * best!" under it when this round set it), the Play again and Title buttons side by side and a line
 * about the keys (they are for Play again; Title is a click). The
 * background is the same light color as in play, drawn over the Game scene, which waits underneath;
 * the card is what stands out.
 */
export function createSummaryView(
  scene: Phaser.Scene,
  state: SummaryState,
  onPlayAgain: (pointer?: Phaser.Input.Pointer) => void,
  onTitle: () => void,
): SummaryView {
  const layout = SUMMARY_LAYOUT;
  const texts = summaryTexts(state, detectInputKind());

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

  type Spot = { x: number; y: number; width: number; height: number };
  const button = (spot: Spot, name: string, label: string, onActivate: () => void) =>
    createButton(scene, {
      x: spot.x,
      y: spot.y,
      width: spot.width,
      height: spot.height,
      name,
      label,
      depth: TEXT_DEPTH,
      onActivate,
    });
  const playAgain = button(layout.playAgain, 'playAgainButton', texts.playAgainLabel, onPlayAgain);
  const title = button(layout.title, 'titleButton', texts.toTitleLabel, onTitle);
  if (texts.keyHint !== null) {
    line(layout.keyHintY, texts.keyHint, 24, COLORS.muted).setFontStyle('normal');
  }

  return { playAgain, title };
}
