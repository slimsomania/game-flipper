import Phaser from 'phaser';
import { detectInputKind } from '../inputKind';
import { createHowToView } from '../view/howToView';
import { howToTexts } from '../view/howToText';

export interface HowToData {
  /** The scene the card was opened over; it waits, paused, and is resumed when the card closes. */
  from: 'Title' | 'Pause' | 'Game';
}

/**
 * The How to play card, opened over the Title (the button or H), the Pause overlay (its button) or
 * the Game scene (H in play) and drawn over it. That scene is paused while this is open, so its keys,
 * buttons and simulation do nothing. Close (the button, a press outside the card, Esc or H) stops this
 * scene and resumes the scene below, so Esc closes only the card.
 * A press outside the card does nothing else. The close waits a frame, so the key that closes the
 * card is not also heard by the Title it resumes.
 */
export class HowToScene extends Phaser.Scene {
  private closing = false;
  private from: HowToData['from'] = 'Title';

  constructor() {
    super('HowTo');
  }

  create(data?: HowToData): void {
    this.from = data?.from ?? 'Title';
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
      this.scene.resume(this.from);
      this.scene.stop();
    });
  }
}
