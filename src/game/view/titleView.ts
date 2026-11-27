import type Phaser from 'phaser';
import { GAME_WIDTH } from '../../core/constants';
import { COLORS, FONT_FAMILY } from '../theme';
import { createButton, type ButtonView } from './buttonView';
import { TITLE_LAYOUT } from './titleLayout';
import type { TitleTexts } from './titleText';

export interface TitleView {
  /** The Play button (its click and the keyboard shortcuts do the same thing). */
  play: ButtonView;
  /** The How to play button. */
  howTo: ButtonView;
}

/**
 * The title screen: the game's name, the Play button with the keys that do the same under it, the
 * best score and, at the bottom, one line about the controls, all centered on the plain light
 * background. The speaker button is `createMuteControl`'s, added by the scene.
 */
export function createTitleView(
  scene: Phaser.Scene,
  texts: TitleTexts,
  onPlay: (pointer?: Phaser.Input.Pointer) => void,
  onHowTo: () => void,
): TitleView {
  const layout = TITLE_LAYOUT;
  const line = (y: number, content: string, size: number, color: string, bold = true) => {
    const text = scene.add
      .text(GAME_WIDTH / 2, y, content, {
        fontFamily: FONT_FAMILY,
        fontSize: `${size}px`,
        fontStyle: bold ? 'bold' : 'normal',
        color,
      })
      .setOrigin(0.5);
    if (text.width > layout.maxTextWidth) text.setScale(layout.maxTextWidth / text.width);
    return text;
  };

  line(layout.nameY, texts.name, layout.nameSize, COLORS.accent);
  const { play } = layout;
  const button = createButton(scene, {
    x: play.x,
    y: play.y,
    width: play.width,
    height: play.height,
    name: 'playButton',
    label: texts.playLabel,
    fontSize: 48,
    onActivate: onPlay,
  });
  if (texts.startHint !== null) line(layout.startHintY, texts.startHint, 24, COLORS.muted, false);
  line(layout.bestY, texts.bestLine, 40, COLORS.text);
  const howTo = createButton(scene, {
    ...layout.howTo,
    name: 'howToButton',
    label: texts.howToLabel,
    fontSize: 32,
    onActivate: onHowTo,
  });
  line(layout.controlsHintY, texts.controlsHint, 26, COLORS.text, false);

  return { play: button, howTo };
}
