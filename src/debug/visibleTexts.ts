import Phaser from 'phaser';

/**
 * Whether a game object (and every container above it) is shown at all: visible and not fully
 * transparent. It doesn't check the camera, so text placed off screen still counts.
 */
function isShown(object: Phaser.GameObjects.GameObject): boolean {
  const flags = object as unknown as { visible?: boolean; alpha?: number };
  return flags.visible !== false && (flags.alpha ?? 1) > 0;
}

/** The children of a container or layer, in display order; none for any other object. */
function childrenOf(object: Phaser.GameObjects.GameObject): Phaser.GameObjects.GameObject[] {
  if (object instanceof Phaser.GameObjects.Container) return object.list;
  if (object instanceof Phaser.GameObjects.Layer) return object.getChildren();
  return [];
}

function collect(objects: Phaser.GameObjects.GameObject[], found: Phaser.GameObjects.Text[]): void {
  for (const object of objects) {
    if (!isShown(object)) continue;
    if (object instanceof Phaser.GameObjects.Text) {
      if (object.text !== '') found.push(object);
    } else {
      collect(childrenOf(object), found);
    }
  }
}

/** Every shown, non-empty `Text` of the given scenes (the visible ones), in display order. */
function shownTexts(scenes: readonly Phaser.Scene[]): Phaser.GameObjects.Text[] {
  const found: Phaser.GameObjects.Text[] = [];
  for (const scene of scenes) {
    if (scene.sys.isVisible()) collect(scene.children.list, found);
  }
  return found;
}

/**
 * The text strings the player can see in the given scenes: every shown, non-empty `Text` object,
 * looking inside containers and layers, in display order (the scenes in the order given). A text
 * that is hidden (`setVisible(false)`), fully transparent, or inside a hidden container is left
 * out, and so is every text of a scene that isn't visible.
 */
export function visibleTexts(scenes: readonly Phaser.Scene[]): string[] {
  return shownTexts(scenes).map((text) => text.text);
}

/** Where a visible text is, in game pixels (before the camera's own movement), as a box. */
export interface TextBounds {
  text: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The same texts as `visibleTexts`, each with the box it fills in game pixels, so a test can check
 * that none of them is near enough to the edge of the canvas to be cut off by a camera shake. The
 * boxes are where the objects are in the world; the camera's scroll (`cameraOffset()`) moves them
 * on screen.
 */
export function visibleTextBounds(scenes: readonly Phaser.Scene[]): TextBounds[] {
  return shownTexts(scenes).map((text) => {
    const box = text.getBounds();
    return { text: text.text, left: box.left, top: box.top, right: box.right, bottom: box.bottom };
  });
}
