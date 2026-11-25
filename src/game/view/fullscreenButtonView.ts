import type Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../core/constants';
import {
  fullscreenSupported,
  isFullscreen,
  isHomeScreenApp,
  onFullscreenChange,
  toggleFullscreen,
} from '../pageGuards';
import { COLORS, FONT_FAMILY } from '../theme';
import { createButton, type ButtonView } from './buttonView';
import { FULLSCREEN_BUTTON, HOME_CARD, HOME_CARD_CLOSE, HOME_CARD_TEXT } from './fullscreenLayout';
import { fullscreenIcon } from './fullscreenIcon';
import { drawIcon } from './iconDraw';

/** Names in the scene: what `window.__FLIPPER__.fullscreenButton()` and `buttons()` find. */
export const FULLSCREEN_BUTTON_NAME = 'fullscreenButton';
export const HOME_CARD_CLOSE_NAME = 'homeCardClose';
export const HOME_CARD_BLOCKER_NAME = 'homeCardBlocker';

/** Level with the other corner buttons; the card and its blocker sit above everything. */
const BUTTON_DEPTH = 20;
const BLOCKER_DEPTH = 50;

/**
 * The fullscreen control of a screen: the corner button and the F key. Both switch the page
 * (`document.documentElement`, so the safe-area padding and Scale.FIT keep working) in or out of
 * fullscreen, and the icon follows `fullscreenchange`, so leaving with Esc or F11 updates it. On a
 * browser with no page fullscreen (every browser on an iPhone) the key does nothing and the button
 * opens a card telling how to add the game to the home screen. The card changes nothing in the
 * round; its full-canvas blocker swallows presses, so a tap outside it closes it and does nothing
 * else, and the bottle can't be grabbed while it is open.
 */
export function createFullscreenControl(scene: Phaser.Scene): ButtonView | null {
  // Run from the home screen the page already fills the screen: no button, no F key.
  if (isHomeScreenApp()) return null;
  const { x, y, width, height, hitWidth, hitHeight, radius } = FULLSCREEN_BUTTON;
  let closeCard: (() => void) | null = null;

  const openCard = (): void => {
    const before = new Set<Phaser.GameObjects.GameObject>(scene.children.list);
    const blocker = scene.add
      .zone(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT)
      .setDepth(BLOCKER_DEPTH)
      .setInteractive()
      .setName(HOME_CARD_BLOCKER_NAME);
    let armed = false;
    blocker.on('pointerdown', () => {
      armed = true;
    });
    blocker.on('pointerup', () => {
      if (armed) closeCard?.();
    });
    scene.add
      .graphics()
      .setDepth(BLOCKER_DEPTH)
      .fillStyle(0x14202e, 0.45)
      .fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    const { x: cx, y: cy, width: cw, height: ch, radius: cr } = HOME_CARD;
    scene.add
      .graphics()
      .setDepth(BLOCKER_DEPTH + 1)
      .fillStyle(COLORS.cardShadow)
      .fillRoundedRect(cx - cw / 2, cy - ch / 2 + HOME_CARD.shadow, cw, ch, cr)
      .fillStyle(COLORS.card)
      .fillRoundedRect(cx - cw / 2, cy - ch / 2, cw, ch, cr);
    scene.add
      .text(cx, HOME_CARD.textY, HOME_CARD_TEXT, {
        fontFamily: FONT_FAMILY,
        fontSize: `${HOME_CARD.textSize}px`,
        fontStyle: 'bold',
        color: COLORS.text,
        align: 'center',
        wordWrap: { width: HOME_CARD.textWidth },
      })
      .setOrigin(0.5)
      .setDepth(BLOCKER_DEPTH + 2);
    createButton(scene, {
      ...HOME_CARD.close,
      name: HOME_CARD_CLOSE_NAME,
      label: HOME_CARD_CLOSE,
      fontSize: 38,
      depth: BLOCKER_DEPTH + 2,
      onActivate: () => closeCard?.(),
    });
    const made = scene.children.list.filter((object) => !before.has(object));
    const onPause = (): void => closeCard?.();
    scene.events.on('pause', onPause);
    closeCard = () => {
      closeCard = null;
      scene.events.off('pause', onPause);
      for (const object of made) object.destroy();
      scene.game.canvas.style.cursor = '';
    };
  };

  const button = createButton(scene, {
    x,
    y,
    width,
    height,
    hitWidth,
    hitHeight,
    radius,
    depth: BUTTON_DEPTH,
    name: FULLSCREEN_BUTTON_NAME,
    icon: (graphics, iconX, iconY) =>
      drawIcon(graphics, iconX, iconY, fullscreenIcon(isFullscreen())),
    onActivate: (pointer) => {
      if (closeCard) return;
      if (fullscreenSupported()) toggleFullscreen(pointer?.wasTouch === true);
      else openCard();
    },
  });

  const show = (): void => {
    button.refresh();
    button.zone.setData('fullscreen', isFullscreen());
  };
  show();
  const stopListening = onFullscreenChange(show);

  scene.input.keyboard?.on('keydown-F', (event: KeyboardEvent) => {
    if (event.repeat || closeCard || !fullscreenSupported()) return;
    toggleFullscreen(false);
  });

  scene.events.once('shutdown', () => {
    stopListening();
    closeCard?.();
  });
  return button;
}
