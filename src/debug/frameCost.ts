import Phaser from 'phaser';

/*
 * Cost of the whole frame, for the performance budget (F028, F049): from Phaser's game PRE_STEP
 * event (the frame begins, before any scene updates) to its POST_RENDER event (the frame is drawn),
 * so it covers the scene updates, our drawing and Phaser's own render. It only measures.
 */
let frames = 0;
let totalMs = 0;

/**
 * Time every frame until the returned function is called (on scene shutdown). The POST_RENDER
 * listener is added again at each PRE_STEP so it runs after any other POST_RENDER listener.
 */
export function watchFrameCost(events: Phaser.Events.EventEmitter): () => void {
  let started = 0;
  const end = (): void => {
    frames++;
    totalMs += performance.now() - started;
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
}

/** The frames recorded since the last reset and their average cost in ms (0 with none). */
export function frameCost(): { frames: number; averageMs: number } {
  return { frames, averageMs: frames === 0 ? 0 : totalMs / frames };
}
