import Phaser from 'phaser';
import type { PowerDirection } from '../core/powerMeter';
import type { Simulation } from '../core/simulation';

/**
 * Turn keyboard, wheel and click input into simulation calls. The rules (what a tap or a hold
 * does, what Space does in each phase) live in src/core; this only forwards.
 *
 * - Up / Down: key down presses the power bar's key, key up releases it. A key held down makes the
 *   browser send repeated keydown events: they are ignored, because the hold is timed by the
 *   simulation.
 * - Mouse wheel: one notch per wheel event, up (away from you) raises the power.
 * - Space: throws while aiming, ends the result wait during a result. Repeated keydowns are
 *   ignored, so holding Space through a result can't throw the next bottle.
 * - A click anywhere on the canvas ends the result wait.
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
  }

  scene.input.on('wheel', (_pointer: unknown, _over: unknown, _dx: number, dy: number) => {
    if (dy !== 0) sim.powerMeter.wheel(dy < 0 ? 1 : -1);
  });
  scene.input.on('pointerdown', () => sim.skip());

  // A key let go while the window isn't focused never reports its key-up: stop the bar then.
  const releaseKeys = (): void => sim.powerMeter.release();
  scene.game.events.on(Phaser.Core.Events.BLUR, releaseKeys);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.game.events.off(Phaser.Core.Events.BLUR, releaseKeys);
  });
}
