import type Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../core/constants';
import { COLORS, FONT_FAMILY } from '../theme';
import { createButton, type ButtonView } from './buttonView';
import { PAUSE_LAYOUT } from './pauseLayout';
import type { PauseTexts } from './pauseText';
import { dimPageWhile } from './pageDim';

const DIM_DEPTH = 0;
const CARD_DEPTH = 1;
const TEXT_DEPTH = 2;

export interface PauseActions {
  onResume: () => void;
  onHowTo: () => void;
  onRestart: () => void;
  onQuit: () => void;
}

export interface PauseView {
  resume: ButtonView;
  howTo: ButtonView;
  restart: ButtonView;
  quit: ButtonView;
}

/**
 * The pause overlay: a dark veil over the whole canvas (the paused game still shows through it,
 * dimmed), and in the middle a white card with "Paused", the Resume, Restart and Quit to title
 * buttons stacked, and a line about the keys. The veil is a Graphics fill, not a Rectangle object:
 * the test hook `flash()` looks for a canvas-sized Rectangle, and the veil is not a result flash.
 */
export function createPauseView(
  scene: Phaser.Scene,
  texts: PauseTexts,
  actions: PauseActions,
): PauseView {
  const layout = PAUSE_LAYOUT;

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

  const line = (textY: number, content: string, size: number, color: string, bold = true) =>
    scene.add
      .text(x, textY, content, {
        fontFamily: FONT_FAMILY,
        fontSize: `${size}px`,
        fontStyle: bold ? 'bold' : 'normal',
        color,
      })
      .setOrigin(0.5)
      .setDepth(TEXT_DEPTH);
  line(layout.titleY, texts.title, layout.titleSize, COLORS.text);

  type Spot = { x: number; y: number; width: number; height: number };
  const button = (spot: Spot, name: string, label: string, onActivate: () => void) =>
    createButton(scene, { ...spot, name, label, fontSize: 38, depth: TEXT_DEPTH, onActivate });
  const view = {
    resume: button(layout.resume, 'resumeButton', texts.resumeLabel, actions.onResume),
    howTo: button(layout.howTo, 'howToButton', texts.howToLabel, actions.onHowTo),
    restart: button(layout.restart, 'restartButton', texts.restartLabel, actions.onRestart),
    quit: button(layout.quit, 'quitButton', texts.quitLabel, actions.onQuit),
  };
  if (texts.keyHint !== null) line(layout.hintY, texts.keyHint, 24, COLORS.muted, false);
  return view;
}
