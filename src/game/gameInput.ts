import Phaser from 'phaser';
import type { PowerDirection } from '../core/powerMeter';
import type { Simulation } from '../core/simulation';
import { CoalescedMoves } from './coalescedMoves';

/** When a pointer event happened, in milliseconds: the browser's own time stamp, not the frame's. */
const eventMillis = (pointer: Phaser.Input.Pointer): number =>
  pointer.event?.timeStamp ?? performance.now();

/** The same in seconds, which is what the simulation takes. */
const eventSeconds = (pointer: Phaser.Input.Pointer): number => eventMillis(pointer) / 1000;

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
 * - M and the speaker button are the mute control (`createMuteControl`, not here). A press that
 *   lands on a button is left to it: it is neither a grab nor a click that skips a result.
 * - Left button down: grabs the held bottle if the press is on it, otherwise (in a result) ends the
 *   result wait, like any click. Moving while the button is down is the push; letting go throws
 *   (see `MouseControl.release`). A browser delivers one move per frame, so while the bottle is
 *   grabbed the moves the mouse made between frames (the move event's coalesced events) are
 *   forwarded too, each with its own time (`CoalescedMoves`). A release outside the canvas, which
 *   the game sees only as the button coming up, ends the grab the same way but without a position,
 *   and a window that loses focus drops the grab.
 * - A finger is the same grab (Phaser's first touch pointer): a second finger has no pointer, so it
 *   does nothing, and a touchcancel (`pointer.wasCanceled`) drops the grab without a throw. The
 *   compatibility mouse events a browser sends after a tap are suppressed by Phaser's touch
 *   handling, so a tap acts once (tests/e2e/phone/tap.spec.ts uses real touches to prove it).
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

  // The samples between two frames (F033): while the bottle is grabbed, the browser's own
  // `pointermove` lists every move the mouse made since the last one, and each goes to the push
  // with its own time. Phaser's `mousemove` for the same move then must not add it again.
  const moves = new CoalescedMoves();

  scene.input.on(
    'pointerdown',
    (pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
      // A press on a button (the speaker) belongs to the button: it grabs nothing and skips nothing.
      if (currentlyOver.length > 0) return;
      // Grabbing only works while aiming and skipping only during a result, so at most one happens.
      // The scene tells core what kind of pointer it is (a finger or a mouse); the physics doesn't care.
      const source = pointer.wasTouch ? 'touch' : 'mouse';
      if (
        isLeftButton(pointer) &&
        sim.mouse.grab(pointer.x, pointer.y, eventSeconds(pointer), source)
      ) {
        moves.begin(eventMillis(pointer));
        return;
      }
      sim.skip();
    },
  );
  scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
    if (moves.covers(eventMillis(pointer))) return; // a coalesced sample already carried this move
    sim.mouse.drag(pointer.y, eventSeconds(pointer));
  });
  const canvas = scene.game.canvas;
  const onNativeMove = (event: PointerEvent): void => {
    if (!sim.mouse.dragging) return;
    for (const sample of moves.fresh(event)) {
      // The height in logical game pixels, the way Phaser converts a pointer's `pageY`.
      sim.mouse.drag(scene.scale.transformY(sample.pageY), sample.timeStamp / 1000);
    }
  };
  canvas.addEventListener('pointermove', onNativeMove);
  scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
    if (!isLeftButton(pointer)) return;
    // A touchcancel (the system took the touch away) is not a release: end the grab, throw nothing.
    if (pointer.wasCanceled) sim.mouse.cancel();
    else sim.mouse.release(eventSeconds(pointer), pointer.y);
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
    canvas.removeEventListener('pointermove', onNativeMove);
  });
}
