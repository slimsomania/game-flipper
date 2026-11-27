import Phaser from 'phaser';
import type { Simulation } from '../../core/simulation';
import { detectInputKind } from '../inputKind';
import { bindPauseKeys } from '../pauseKeys';
import { createFullscreenControl } from '../view/fullscreenButtonView';
import { createMuteControl } from '../view/muteButtonView';
import { createPauseButton } from '../view/pauseButtonView';
import { createPauseView } from '../view/pauseView';
import { pauseTexts } from '../view/pauseText';
import type { HowToData } from './HowToScene';
import { quitToTitle } from './toTitle';

export interface PauseData {
  /** The simulation of the round in play; the Game scene waits, paused, underneath. */
  sim: Simulation;
}

/**
 * The pause overlay, opened by the Game scene (Esc, P or the corner button). It is drawn over the
 * Game scene, which is paused: it neither steps the simulation nor hears keys or the mouse, so
 * Space, Up and Down, the wheel, a push on the bottle and R all do nothing until the overlay closes.
 *
 * - Resume (the button, the corner button, Esc or P): close this scene and let the Game scene carry
 *   on exactly where it stopped.
 * - Restart: `Simulation.restartRound()` (a new round, throw 1, as R does), then the same as Resume.
 * - Quit to title: the Game scene and its simulation are dropped and the Title scene starts. The
 *   round in progress is not scored: the best score is saved when a round's summary opens.
 *
 * The mute control (the speaker and M) works here too: the Game scene's own is deaf while paused.
 */
export class PauseScene extends Phaser.Scene {
  private sim!: Simulation;
  private closing = false;

  constructor() {
    super('Pause');
  }

  create(data: PauseData): void {
    this.sim = data.sim;
    this.closing = false;
    createPauseView(this, pauseTexts(detectInputKind()), {
      onResume: () => this.resume(),
      onHowTo: () => this.openHowTo(),
      onRestart: () => this.restart(),
      onQuit: () => this.quit(),
    });
    createPauseButton(this, 'resume', () => this.resume());
    createMuteControl(this);
    createFullscreenControl(this);
    bindPauseKeys(this, () => this.resume());
  }

  /** Close this scene and let the Game scene carry on. */
  private resume(): void {
    if (this.closing) return;
    this.closing = true;
    this.scene.resume('Game');
    this.scene.stop();
  }

  /** The How to play card opens over this overlay, which waits, paused, until the card closes. */
  private openHowTo(): void {
    if (this.closing || !this.scene.isActive()) return;
    this.scene.launch('HowTo', { from: 'Pause' } satisfies HowToData);
    this.scene.pause();
  }

  private restart(): void {
    if (this.closing) return;
    this.sim.restartRound();
    this.resume();
  }

  private quit(): void {
    if (this.closing) return;
    this.closing = true;
    quitToTitle(this);
  }
}
