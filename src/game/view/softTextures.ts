import type Phaser from 'phaser';

/**
 * Small gradient textures, generated once in code with canvas gradients, for shading that has to
 * fade smoothly. Stretched over their area by the GPU, they stay smooth at any size, which
 * stacked semi-transparent shapes never do (they show as visible layers).
 */

/** A dark blob, opaque in the middle and clear at the rim: the bottle's shadow, squashed flat. */
export const SHADOW_BLOB_TEXTURE = 'soft-shadow-blob';
/** A black vertical fade, opaque at the top and clear at the bottom: the shadow under the slab. */
export const FADE_DOWN_TEXTURE = 'soft-fade-down';

const BLOB_SIZE = 128;
const FADE_HEIGHT = 64;
const FADE_WIDTH = 256;
/** Fraction of the fade's width over which each end fades out. */
const FADE_END = 0.04;

/** Opacity along the blob's radius: an eased falloff with no hard edge. */
const BLOB_STOPS: ReadonlyArray<[number, number]> = [
  [0, 1],
  [0.3, 0.85],
  [0.55, 0.5],
  [0.75, 0.2],
  [0.9, 0.05],
  [1, 0],
];

/** Opacity down the fade: quick at first, then a long soft tail. */
const FADE_STOPS: ReadonlyArray<[number, number]> = [
  [0, 1],
  [0.25, 0.6],
  [0.5, 0.3],
  [0.75, 0.1],
  [1, 0],
];

function makeTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
): string {
  if (!scene.textures.exists(key)) {
    const texture = scene.textures.createCanvas(key, width, height);
    if (texture) {
      paint(texture.getContext());
      texture.refresh();
    }
  }
  return key;
}

/** The shadow blob's texture key, generating it the first time. */
export function shadowBlobTexture(scene: Phaser.Scene): string {
  return makeTexture(scene, SHADOW_BLOB_TEXTURE, BLOB_SIZE, BLOB_SIZE, (ctx) => {
    const r = BLOB_SIZE / 2;
    const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
    for (const [at, alpha] of BLOB_STOPS) gradient.addColorStop(at, `rgba(36, 48, 64, ${alpha})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, BLOB_SIZE, BLOB_SIZE);
  });
}

/**
 * The downward fade's texture key, generating it the first time. Its two ends fade out too, over
 * `FADE_END` of its width each, so a stretched shadow has no hard sides either.
 */
export function fadeDownTexture(scene: Phaser.Scene): string {
  return makeTexture(scene, FADE_DOWN_TEXTURE, FADE_WIDTH, FADE_HEIGHT, (ctx) => {
    const down = ctx.createLinearGradient(0, 0, 0, FADE_HEIGHT);
    for (const [at, alpha] of FADE_STOPS) down.addColorStop(at, `rgba(0, 0, 0, ${alpha})`);
    ctx.fillStyle = down;
    ctx.fillRect(0, 0, FADE_WIDTH, FADE_HEIGHT);
    // Keep only as much of it as a mask that is clear at both ends allows.
    const across = ctx.createLinearGradient(0, 0, FADE_WIDTH, 0);
    across.addColorStop(0, 'rgba(0, 0, 0, 0)');
    across.addColorStop(FADE_END, 'rgba(0, 0, 0, 1)');
    across.addColorStop(1 - FADE_END, 'rgba(0, 0, 0, 1)');
    across.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = across;
    ctx.fillRect(0, 0, FADE_WIDTH, FADE_HEIGHT);
    ctx.globalCompositeOperation = 'source-over';
  });
}
