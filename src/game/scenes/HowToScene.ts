import Phaser from 'phaser';
import { detectInputKind } from '../inputKind';
import { createHowToView } from '../view/howToView';
import { howToTexts } from '../view/howToText';

/**
 * The How to play card, opened by the Title scene (the button or H) and drawn over it. The Title is
 * paused while this is open, so Enter, Space, its Play button and its corner buttons do nothing.
 * Close (the button, a press outside the card, Esc or H) stops this scene and resumes the Title.
 * A press outside the card does nothing else. The close waits a frame, so the key that closes the
 * card is not also heard by the Title it resumes.
 */
export class HowToScene extends Phaser.Scene {
  private closing = false;

  constructor() {
    super('HowTo');
  }

  create(): void {
    this.closing = false;
    createHowToView(this, howToTexts(detectInputKind()), {
      onClose: () => this.close(),
      onOutside: () => this.close(),
    });
    const keyboard = this.input.keyboard;
    if (keyboard) {
      for (const name of ['ESC', 'H']) {
        keyboard.on(`keydown-${name}`, (event: KeyboardEvent) => {
          if (!event.repeat) this.close();
        });
      }
    }
  }

  private close(): void {
    if (this.closing) return;
    this.closing = true;
    this.events.once('postupdate', () => {
      this.scene.resume('Title');
      this.scene.stop();
    });
  }
}
