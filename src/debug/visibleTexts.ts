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

function collect(objects: Phaser.GameObjects.GameObject[], found: string[]): void {
  for (const object of objects) {
    if (!isShown(object)) continue;
    if (object instanceof Phaser.GameObjects.Text) {
      if (object.text !== '') found.push(object.text);
    } else {
      collect(childrenOf(object), found);
    }
  }
}

/**
 * The text strings the player can see in the given scenes: every shown, non-empty `Text` object,
 * looking inside containers and layers, in display order (the scenes in the order given). A text
 * that is hidden (`setVisible(false)`), fully transparent, or inside a hidden container is left
 * out, and so is every text of a scene that isn't visible.
 */
export function visibleTexts(scenes: readonly Phaser.Scene[]): string[] {
  const found: string[] = [];
  for (const scene of scenes) {
    if (scene.sys.isVisible()) collect(scene.children.list, found);
  }
  return found;
}
