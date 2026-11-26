/*
 * Per-frame cost of the Game scene's update-and-draw, for the performance budget (F028). The scene
 * times each frame and records it here; the test hook reports the average. It only measures: it
 * changes nothing in the game.
 */
let frames = 0;
let totalMs = 0;

/** Called by the game scene with the milliseconds one update-and-draw took. */
export function recordFrameCost(ms: number): void {
  frames++;
  totalMs += ms;
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
