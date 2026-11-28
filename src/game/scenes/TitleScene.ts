import Phaser from 'phaser';
import type { HowToData } from './HowToScene';
import { markReady } from '../../debug/testHooks';
import { detectInputKind } from '../inputKind';
import { requestPhoneFullscreen } from '../pageGuards';
import { saveStore } from '../storage';
import { createFullscreenControl } from '../view/fullscreenButtonView';
import { createMuteControl } from '../view/muteButtonView';
import { createTitleView, type TitleView } from '../view/titleView';
import { titleTexts } from '../view/titleText';

/**
 * The title screen, the first thing the player sees: the game's name, Play, the saved best score, the
 * mute toggle and a line about the controls. The Play button, Enter and Space all start the Game
 * scene (a fresh round, throw 1). Nothing else does: a click anywhere else, or any other key, is
 * ignored, and the speaker button and M are the mute control's.
 *
 * Space and Enter start the round, they are not also a throw: the Game scene only exists from the
 * next frame on, so it never hears the key press that started it, and a key still held down is
 * ignored because the Game scene (like this one) skips auto-repeat.
 */
export class TitleScene extends Phaser.Scene {
  private view!: TitleView;
  private starting = false;

  constructor() {
    super('Title');
  }

  create(): void {
    this.starting = false;
    // Read afresh each time the title opens, so a round just played (the Summary's Title button)
    // shows its best score.
    this.view = createTitleView(
      this,
      titleTexts(saveStore().load().best, detectInputKind()),
      (pointer) => this.play(pointer),
      () => this.openHowTo(),
    );
    createMuteControl(this);
    createFullscreenControl(this);

    const keyboard = this.input.keyboard;
    if (keyboard) {
      keyboard.addCapture('SPACE,ENTER'); // keep the browser from scrolling or clicking a button
      keyboard.on('keydown-H', (event: KeyboardEvent) => {
        if (!event.repeat) this.openHowTo();
      });
      for (const name of ['ENTER', 'SPACE']) {
        keyboard.on(`keydown-${name}`, (event: KeyboardEvent) => {
          if (!event.repeat) this.view.play.activate();
        });
      }
    }
    markReady();
  }

  /** The How to play card opens over this scene, which waits, paused, until the card closes. */
  private openHowTo(): void {
    if (this.starting || !this.scene.isActive()) return;
    this.scene.launch('HowTo', { from: 'Title' } satisfies HowToData);
    this.scene.pause();
  }

  /** Start a round: the Game scene replaces this one. */
  private play(pointer?: Phaser.Input.Pointer): void {
    if (this.starting) return;
    this.starting = true;
    if (pointer?.wasTouch) requestPhoneFullscreen(); // inside the tap, which the browser needs
    // The first Play in this browser opens the How to play card over throw 1 (the Game scene does it).
    this.scene.start('Game', { showHowTo: !saveStore().load().seenHowTo });
  }
}
