import Phaser from 'phaser';

/*
 * Cost of the whole frame, for the performance budget (F028, F049): from Phaser's game PRE_STEP
 * event (the frame begins, before any scene updates) to its POST_RENDER event (the frame is drawn),
 * so it covers the scene updates, our drawing and Phaser's own render. It only measures.
 *
 * It also counts the render work the game asks for: the command-buffer entries (each command and
 * its arguments) of every visible Graphics in the active scenes, per frame. Phaser re-tessellates each visible Graphics every
 * frame, so this is the game's own drawing cost, and unlike milliseconds it doesn't depend on the
 * machine, its load or whether WebGL is drawn in software (headless Chromium uses SwiftShader).
 */
let frames = 0;
let totalMs = 0;
let totalCommands = 0;
let maxCommands = 0;

interface Drawn {
  visible: boolean;
  alpha: number;
  type: string;
  commandBuffer?: unknown[];
  list?: Drawn[];
}

function graphicsCommands(list: readonly Drawn[]): number {
  let commands = 0;
  for (const object of list) {
    if (!object.visible || object.alpha === 0) continue;
    if (object.type === 'Graphics') commands += object.commandBuffer?.length ?? 0;
    if (object.list) commands += graphicsCommands(object.list); // a Container's children
  }
  return commands;
}

/**
 * Time every frame and count its Graphics commands until the returned function is called (on
 * scene shutdown). The POST_RENDER listener is added again at each PRE_STEP so it runs after any
 * other POST_RENDER listener.
 */
export function watchFrameCost(game: Phaser.Game): () => void {
  const events = game.events;
  let started = 0;
  const end = (): void => {
    frames++;
    totalMs += performance.now() - started;
    let commands = 0;
    for (const scene of game.scene.getScenes(true)) {
      commands += graphicsCommands(scene.children.list as unknown as Drawn[]);
    }
    totalCommands += commands;
    maxCommands = Math.max(maxCommands, commands);
  };
  const begin = (): void => {
    started = performance.now();
    events.once(Phaser.Core.Events.POST_RENDER, end);
  };
  events.on(Phaser.Core.Events.PRE_STEP, begin);
  return () => {
    events.off(Phaser.Core.Events.PRE_STEP, begin);
    events.off(Phaser.Core.Events.POST_RENDER, end);
  };
}

/** Forget the frames recorded so far. */
export function resetFrameCost(): void {
  frames = 0;
  totalMs = 0;
  totalCommands = 0;
  maxCommands = 0;
}

export interface FrameCost {
  frames: number;
  /** Average whole-frame time in ms (0 with no frames). */
  averageMs: number;
  /** Average Graphics commands drawn per frame (0 with no frames). */
  averageGraphicsCommands: number;
  /** The most Graphics commands drawn in one frame. */
  maxGraphicsCommands: number;
}

/** The frames recorded since the last reset: their average cost and render work. */
export function frameCost(): FrameCost {
  return {
    frames,
    averageMs: frames === 0 ? 0 : totalMs / frames,
    averageGraphicsCommands: frames === 0 ? 0 : totalCommands / frames,
    maxGraphicsCommands: maxCommands,
  };
}
