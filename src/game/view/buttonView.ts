import type Phaser from 'phaser';
import { COLORS, FONT_FAMILY } from '../theme';

export type ButtonState = 'idle' | 'hover' | 'pressed';

/** How a button looks in one state: the colors of its face and lip, and how far the face sinks. */
export interface ButtonLook {
  face: number;
  lip: number;
  /** Pixels the face (and its label) are pushed down onto the lip. */
  sink: number;
}

/** Height of the darker lip under the face: what makes a flat rectangle read as a key. */
export const BUTTON_LIP = 8;

/**
 * The look of each state, pure so it is tested without a browser. The hover is a lighter face and
 * the press is a darker face that sinks almost onto the lip, so each state is told apart by more
 * than one cue.
 */
export function buttonLook(state: ButtonState): ButtonLook {
  switch (state) {
    case 'hover':
      return { face: COLORS.buttonHover, lip: COLORS.buttonLip, sink: 0 };
    case 'pressed':
      return { face: COLORS.buttonPressed, lip: COLORS.buttonLip, sink: BUTTON_LIP - 2 };
    default:
      return { face: COLORS.button, lip: COLORS.buttonLip, sink: 0 };
  }
}

export interface ButtonSpec {
  /** The middle of the face when it isn't pressed (game pixels). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** The text on the face. Leave it out for a button that shows an `icon` instead. */
  label?: string;
  /** Font size of the label, in pixels. */
  fontSize?: number;
  /**
   * Draws a picture on the face, in white: called with a cleared Graphics and the middle of the
   * face (which moves down when the button is pressed) each time the button is drawn, so it can
   * show a state. Call `refresh()` when that state changes.
   */
  icon?: (graphics: Phaser.GameObjects.Graphics, x: number, y: number) => void;
  /** Corner radius of the face and lip, in pixels (default 18). */
  radius?: number;
  /** A name for the clickable area, so a test can find the button in the scene. */
  name?: string;
  /** Draw order: the face and lip at this depth, the label and icon one above (default 0). */
  depth?: number;
  /** What a click does. */
  onActivate: () => void;
}

export interface ButtonView {
  /** Do what a click does (for the keyboard shortcut that stands for this button). */
  activate(): void;
  /** Draw the button again, for an icon whose state changed. */
  refresh(): void;
  /**
   * The clickable area (the face and the lip under it). The scene-level pointer handlers get the
   * objects under a press, so this is how a scene can tell that a press belongs to the button.
   */
  zone: Phaser.GameObjects.Zone;
}

const CORNER_RADIUS = 18;

/**
 * A button: a rounded blue face on a darker lip with a white label, a lighter face under the
 * pointer, a pressed look while the left button is down on it, and the hand cursor over it. Like
 * any click it activates when the button is released over it after being pressed over it, so a
 * press that began elsewhere (the click that skipped the last result, say) never activates it, and
 * moving off it before the release cancels the click. The cursor goes back to the arrow when the
 * scene ends.
 */
export function createButton(scene: Phaser.Scene, spec: ButtonSpec): ButtonView {
  const { x, y, width, height } = spec;
  const canvas = scene.game.canvas;
  const depth = spec.depth ?? 0;
  const radius = spec.radius ?? CORNER_RADIUS;
  const graphics = scene.add.graphics().setDepth(depth);
  // A button with no label has no text object at all, so it never shows up in the visible texts.
  const label = spec.label
    ? scene.add
        .text(x, y, spec.label, {
          fontFamily: FONT_FAMILY,
          fontSize: `${spec.fontSize ?? 36}px`,
          fontStyle: 'bold',
          color: COLORS.buttonText,
        })
        .setOrigin(0.5)
        .setDepth(depth + 1)
    : null;
  const icon = spec.icon ? scene.add.graphics().setDepth(depth + 1) : null;
  // The hit area covers the lip too: it is part of what the player sees.
  const zone = scene.add
    .zone(x, y + BUTTON_LIP / 2, width, height + BUTTON_LIP)
    .setDepth(depth + 2)
    .setInteractive();
  if (spec.name) zone.setName(spec.name);

  let hover = false;
  let pressed = false;
  const show = (): void => {
    const state: ButtonState = pressed ? 'pressed' : hover ? 'hover' : 'idle';
    const look = buttonLook(state);
    const left = x - width / 2;
    const top = y - height / 2;
    graphics
      .clear()
      .fillStyle(look.lip)
      .fillRoundedRect(left, top + BUTTON_LIP, width, height, radius)
      .fillStyle(look.face)
      .fillRoundedRect(left, top + look.sink, width, height, radius);
    label?.setY(y + look.sink);
    if (icon && spec.icon) spec.icon(icon.clear(), x, y + look.sink);
    canvas.style.cursor = hover ? 'pointer' : '';
  };

  zone.on('pointerover', () => {
    hover = true;
    show();
  });
  zone.on('pointerout', () => {
    hover = false;
    pressed = false;
    show();
  });
  zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    if (pointer.button !== 0) return;
    pressed = true;
    show();
  });
  zone.on('pointerup', (pointer: Phaser.Input.Pointer) => {
    if (pointer.button !== 0 || !pressed) return;
    pressed = false;
    show();
    spec.onActivate();
  });
  scene.events.once('shutdown', () => {
    canvas.style.cursor = '';
  });

  show();
  return { activate: spec.onActivate, refresh: show, zone };
}
