import Phaser from 'phaser';
import type { Simulation } from '../../core/simulation';
import { saveStore } from '../storage';
import { isFullscreen, requestPhoneFullscreen } from '../pageGuards';
import { createFullscreenControl } from '../view/fullscreenButtonView';
import { createMuteControl } from '../view/muteButtonView';
import { createSummaryView, type SummaryView } from '../view/summaryView';
import { quitToTitle } from './toTitle';

export interface SummaryData {
  /** The simulation of the round that just ended; the Game scene waits, paused, underneath. */
  sim: Simulation;
}

/**
 * The round summary, opened by the Game scene when the round is over. It is drawn over the Game
 * scene, which is paused (so it neither steps the simulation nor hears keys or the mouse) until
 * Play again: the click, Enter, Space and R all call `Simulation.restartRound()` on the same
 * simulation, then the summary closes and the Game scene carries on with throw 1. The Title button
 * (a click) ends the Game scene and opens the Title scene instead.
 *
 * A key's auto-repeat is ignored, so a key still held down from the last throw (Space skips the
 * last result) can't choose Play again by itself.
 *
 * The mute control (the speaker button and M) works here: it only toggles the sound and its saved
 * setting, and neither starts Play again nor goes to the title.
 */
export class SummaryScene extends Phaser.Scene {
  private sim!: Simulation;
  private view!: SummaryView;
  private closing = false;

  constructor() {
    super('Summary');
  }

  create(data: SummaryData): void {
    this.sim = data.sim;
    this.closing = false;
    // The camera is transparent so the page gradient shows: hide the paused Game scene (table,
    // bottle, HUD) instead of covering it. It is shown again when the summary closes.
    this.scene.setVisible(false, 'Game');
    this.events.once('shutdown', () => {
      if (this.scene.get('Game')) this.scene.setVisible(true, 'Game');
    });
    // The round's score is kept as the best here, once, when the summary opens (not on Play again).
    const snapshot = this.sim.snapshot();
    const { best, isNewBest } = saveStore().recordRound(snapshot.score);
    this.view = createSummaryView(
      this,
      { ...snapshot, best, isNewBest },
      (pointer) => this.playAgain(pointer),
      () => this.toTitle(),
    );
    // The Game scene's own speaker and M are deaf while it is paused underneath, so the summary
    // carries its own, in the top-right corner beside the card (not over it).
    createMuteControl(this);
    createFullscreenControl(this);

    const keyboard = this.input.keyboard;
    if (keyboard) {
      keyboard.addCapture('SPACE,ENTER'); // keep the browser from scrolling or clicking a button
      for (const name of ['ENTER', 'SPACE', 'R']) {
        keyboard.on(`keydown-${name}`, (event: KeyboardEvent) => {
          if (!event.repeat) this.view.playAgain.activate();
        });
      }
    }
  }

  update(): void {
    // Something else started a round again (a test hook): there is nothing left to summarize.
    if (this.sim.phase !== 'roundOver') this.close();
  }

  private playAgain(pointer?: Phaser.Input.Pointer): void {
    if (this.closing) return;
    // Like the first Play tap: inside the tap, which the browser needs, and only if not fullscreen.
    if (pointer?.wasTouch && !isFullscreen()) requestPhoneFullscreen();
    if (this.sim.phase === 'roundOver') this.sim.restartRound();
    this.close();
  }

  /**
   * Leave the round for the title screen: the finished round is dropped (its score is already
   * saved), so both this scene and the paused Game scene end, and the Title scene, which reads the
   * best score as it opens, starts.
   */
  private toTitle(): void {
    if (this.closing) return;
    this.closing = true;
    quitToTitle(this);
  }

  /** Close this scene and let the Game scene carry on. */
  private close(): void {
    if (this.closing) return;
    this.closing = true;
    this.scene.resume('Game');
    this.scene.stop();
  }
}
