import Phaser from 'phaser';
import type { PowerDirection } from '../core/powerMeter';
import type { Simulation } from '../core/simulation';

/** When a pointer event happened, in seconds: the browser's own time stamp, not the frame's. */
const eventSeconds = (pointer: Phaser.Input.Pointer): number =>
  (pointer.event?.timeStamp ?? performance.now()) / 1000;

/** The left button is button 0 of a DOM mouse event. */
const isLeftButton = (pointer: Phaser.Input.Pointer): boolean => pointer.button === 0;

/**
 * Turn keyboard, wheel and mouse input into simulation calls. The rules (what a tap or a hold
 * does, what Space does in each phase, what counts as a grab and as a push) live in src/core; this
 * only forwards.
 *
 * - Up / Down: key down presses the power bar's key, key up releases it. A key held down makes the
 *   browser send repeated keydown events: they are ignored, because the hold is timed by the
 *   simulation.
 * - Mouse wheel: one notch per wheel event, up (away from you) raises the power.
 * - Space: throws while aiming, ends the result wait during a result. Repeated keydowns are
 *   ignored, so holding Space through a result can't throw the next bottle.
 * - R: restarts the round (`Simulation.restartRound`), in any phase. Repeats are ignored too.
 * - Left button down: grabs the held bottle if the press is on it, otherwise (in a result) ends the
 *   result wait, like any click. Moving while the button is down is the push; letting go throws
 *   (see `MouseControl.release`). A release outside the canvas, which the game sees only as the
 *   button coming up, ends the grab the same way but without a position, and a window that loses
 *   focus drops the grab.
 */
export function bindGameInput(scene: Phaser.Scene, sim: Simulation): void {
  const keyboard = scene.input.keyboard;
  if (keyboard) {
    keyboard.addCapture('UP,DOWN,SPACE'); // keep the browser from scrolling or clicking a button
    const firstPress = (action: () => void) => (event: KeyboardEvent) => {
      if (!event.repeat) action();
    };
    const powerKey = (name: string, direction: PowerDirection): void => {
      keyboard.on(
        `keydown-${name}`,
        firstPress(() => sim.powerMeter.press(direction)),
      );
      keyboard.on(`keyup-${name}`, () => sim.powerMeter.release(direction));
    };
    powerKey('UP', 1);
    powerKey('DOWN', -1);
    keyboard.on(
      'keydown-SPACE',
      firstPress(() => sim.throwOrSkip()),
    );
    // R starts the round again at any time. The same simulation carries on (same seed, next bottle).
    keyboard.on(
      'keydown-R',
      firstPress(() => sim.restartRound()),
    );
  }

  scene.input.on('wheel', (_pointer: unknown, _over: unknown, _dx: number, dy: number) => {
    if (dy !== 0) sim.powerMeter.wheel(dy < 0 ? 1 : -1);
  });

  scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    // Grabbing only works while aiming and skipping only during a result, so at most one happens.
    if (isLeftButton(pointer) && sim.mouse.grab(pointer.x, pointer.y, eventSeconds(pointer)))
      return;
    sim.skip();
  });
  scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
    sim.mouse.drag(pointer.y, eventSeconds(pointer));
  });
  scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
    if (isLeftButton(pointer)) sim.mouse.release(eventSeconds(pointer), pointer.y);
  });
  scene.input.on('pointerupoutside', (pointer: Phaser.Input.Pointer) => {
    if (isLeftButton(pointer)) sim.mouse.release(eventSeconds(pointer));
  });

  // A key let go while the window isn't focused never reports its key-up: stop the bar then. A
  // button let go there never reports its release either: drop the grab.
  const onBlur = (): void => {
    sim.powerMeter.release();
    sim.mouse.cancel();
  };
  scene.game.events.on(Phaser.Core.Events.BLUR, onBlur);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.game.events.off(Phaser.Core.Events.BLUR, onBlur);
  });
}
