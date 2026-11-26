import type Phaser from 'phaser';
import { COLORS, FONT_FAMILY } from '../theme';
import { bakedFromCommands, bakedTexture } from './bakedGraphics';

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

/** What the clickable area of a button is made of: its face, and a bigger area if it asks for one. */
export interface HitSource {
  x: number;
  y: number;
  width: number;
  height: number;
  /** A clickable area wider/taller than the face (a small drawn face with a thumb-sized area). */
  hitWidth?: number;
  hitHeight?: number;
}

/** A clickable area as a box, in game pixels. */
export interface HitBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The clickable area of a button, as a box: centered on the face and the lip under it, at least as
 * big as both (and as `hitWidth` x `hitHeight` when the button asks for more). Pure, so the layout
 * tests check the same area the scene makes.
 */
export function hitBox(spec: HitSource): HitBox {
  const width = Math.max(spec.width, spec.hitWidth ?? 0);
  const height = Math.max(spec.height + BUTTON_LIP, spec.hitHeight ?? 0);
  const centerY = spec.y + BUTTON_LIP / 2;
  return {
    left: spec.x - width / 2,
    top: centerY - height / 2,
    right: spec.x + width / 2,
    bottom: centerY + height / 2,
  };
}

export interface ButtonSpec extends HitSource {
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
  onActivate: (pointer?: Phaser.Input.Pointer) => void;
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
 * scene ends, and a scene that is paused lets go of the hover and the press.
 */
export function createButton(scene: Phaser.Scene, spec: ButtonSpec): ButtonView {
  const { x, y, width, height } = spec;
  const canvas = scene.game.canvas;
  const depth = spec.depth ?? 0;
  const radius = spec.radius ?? CORNER_RADIUS;
  // The face and the icon are drawn once per look into textures (see bakedGraphics.ts): a
  // Graphics would be tessellated again every frame.
  const left = x - width / 2;
  const top = y - height / 2;
  const face = scene.add.image(left, top, '__DEFAULT').setOrigin(0, 0).setDepth(depth);
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
  const icon = spec.icon
    ? scene.add
        .image(left, top, '__DEFAULT')
        .setOrigin(0, 0)
        .setDepth(depth + 1)
    : null;
  // The hit area covers the lip too: it is part of what the player sees.
  const hit = hitBox(spec);
  const zone = scene.add
    .zone(x, (hit.top + hit.bottom) / 2, hit.right - hit.left, hit.bottom - hit.top)
    .setDepth(depth + 2)
    .setInteractive();
  zone.setData('button', true);
  if (spec.name) zone.setName(spec.name);

  let hover = false;
  let pressed = false;
  const show = (): void => {
    const state: ButtonState = pressed ? 'pressed' : hover ? 'hover' : 'idle';
    const look = buttonLook(state);
    const boxHeight = height + BUTTON_LIP;
    face.setTexture(
      bakedTexture(
        scene,
        `button:${width}x${height}:${radius}:${look.face}:${look.lip}:${look.sink}`,
        width,
        boxHeight,
        (g) =>
          g
            .fillStyle(look.lip)
            .fillRoundedRect(0, BUTTON_LIP, width, height, radius)
            .fillStyle(look.face)
            .fillRoundedRect(0, look.sink, width, height, radius),
      ),
    );
    label?.setY(y + look.sink);
    const drawIcon = spec.icon;
    if (icon && drawIcon) {
      icon.setTexture(
        bakedFromCommands(scene, 'icon', width, boxHeight, (g) =>
          drawIcon(g, width / 2, height / 2 + look.sink),
        ),
      );
    }
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
    spec.onActivate(pointer);
  });
  // A paused scene hears no pointer events, so a button under the pointer when it pauses would stay
  // lit (its pointerout never comes) until the first mouse move after the scene resumes.
  const letGo = (): void => {
    hover = false;
    pressed = false;
    show();
  };
  scene.events.on('pause', letGo);
  const cleanUp = (): void => {
    scene.events.off('pause', letGo);
    scene.events.off('shutdown', onShutdown);
    zone.off('destroy', cleanUp);
  };
  const onShutdown = (): void => {
    cleanUp();
    canvas.style.cursor = '';
  };
  scene.events.once('shutdown', onShutdown);
  // A button destroyed before its scene ends (the home-screen card's Close) must not leave its
  // listeners behind: a later pause would call show() on destroyed objects.
  zone.once('destroy', cleanUp);

  show();
  return { activate: () => spec.onActivate(), refresh: show, zone };
}
