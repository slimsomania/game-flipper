import type Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../core/constants';
import { COLORS, FONT_FAMILY } from '../theme';
import { createButton } from './buttonView';
import { HOW_TO_LAYOUT } from './howToLayout';
import { createHowToPictures } from './howToPictureView';
import type { HowToTexts } from './howToText';
import { dimPageWhile } from './pageDim';

const DIM_DEPTH = 0;
const CARD_DEPTH = 1;
const TEXT_DEPTH = 2;

/**
 * The How to play card: a dark veil over the whole canvas, a white card, the title, a Close button
 * and the paragraphs stacked down the left, with the last (the credit) at the bottom. A press on the
 * veil outside the card calls `onOutside`; a press on the card itself does nothing.
 */
export function createHowToView(
  scene: Phaser.Scene,
  texts: HowToTexts,
  actions: { onClose: () => void; onOutside: () => void },
): void {
  const layout = HOW_TO_LAYOUT;
  scene.add
    .graphics()
    .setDepth(DIM_DEPTH)
    .fillStyle(layout.dim.color, layout.dim.alpha)
    .fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  dimPageWhile(scene, layout.dim.color, layout.dim.alpha);
  const { x, y, width, height, radius } = layout.card;
  scene.add
    .graphics()
    .setDepth(CARD_DEPTH)
    .fillStyle(COLORS.cardShadow)
    .fillRoundedRect(x - width / 2, y - height / 2 + layout.shadow, width, height, radius)
    .fillStyle(COLORS.card)
    .fillRoundedRect(x - width / 2, y - height / 2, width, height, radius);

  // The veil hears the press; the card's own zone, above it, swallows presses on the card.
  scene.add
    .zone(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT)
    .setDepth(DIM_DEPTH)
    .setInteractive()
    .on('pointerup', actions.onOutside);
  scene.add.zone(x, y, width, height).setDepth(CARD_DEPTH).setInteractive();

  const font = (size: number, bold: boolean, color: string) => ({
    fontFamily: FONT_FAMILY,
    fontSize: `${size}px`,
    fontStyle: bold ? 'bold' : 'normal',
    color,
  });
  scene.add
    .text(layout.title.x, layout.title.y, texts.title, font(layout.title.size, true, COLORS.text))
    .setOrigin(0, 0.5)
    .setDepth(TEXT_DEPTH);
  createButton(scene, {
    ...layout.close,
    name: 'closeButton',
    label: texts.closeLabel,
    depth: TEXT_DEPTH,
    onActivate: actions.onClose,
  });

  createHowToPictures(scene, TEXT_DEPTH);

  const { body, credit } = layout;
  let top: number = body.top;
  const paragraphs = texts.lines.slice(0, -1);
  for (const content of paragraphs) {
    const text = scene.add
      .text(body.left, top, content, {
        ...font(body.size, false, COLORS.text),
        wordWrap: { width: body.width },
      })
      .setDepth(TEXT_DEPTH);
    top += text.height + body.gap;
  }
  scene.add
    .text(
      credit.x,
      credit.y,
      texts.lines[texts.lines.length - 1],
      font(credit.size, true, COLORS.accent),
    )
    .setOrigin(0, 0.5)
    .setDepth(TEXT_DEPTH);
}
