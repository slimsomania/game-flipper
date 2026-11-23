import Phaser from 'phaser';
import { SIM_DT } from '../../core/constants';
import { createFixedStepper } from '../../core/fixedStep';
import { Simulation, type SimSnapshot } from '../../core/simulation';
import type { SimEvent } from '../../core/events';
import { registerSimulation } from '../../debug/currentSimulation';
import { markReady, testControls } from '../../debug/testHooks';
import { tuningControl } from '../../debug/tuningControl';
import { sharedSfx } from '../audio/sfx';
import { SoundPlanner } from '../audio/soundPlan';
import { createEffectsView, type EffectsView } from '../effects/effectsView';
import { bindGameInput } from '../gameInput';
import { bindPauseKeys } from '../pauseKeys';
import { intParam } from '../urlParams';
import { createBottleShadowView, type BottleShadowView } from '../view/bottleShadowView';
import { createBottleView, type BottleView } from '../view/bottleView';
import { createCursorView, type CursorView } from '../view/cursorView';
import { createHudView, type HudView } from '../view/hudView';
import { createMuteControl } from '../view/muteButtonView';
import { createOffscreenMarkerView, type OffscreenMarkerView } from '../view/offscreenMarkerView';
import { createPauseButton } from '../view/pauseButtonView';
import { createPowerBarView, type PowerBarView } from '../view/powerBarView';
import { createReplayLabelView, type ReplayLabelView } from '../view/replayLabelView';
import { createResultView, type ResultView } from '../view/resultView';
import { createTableView } from '../view/tableView';
import type { PauseData } from './PauseScene';
import type { SummaryData } from './SummaryScene';

interface GameSceneData {
  seed?: number;
}

/**
 * The game scene. It shows the pattern every gameplay scene follows: the simulation
 * (src/core) owns the state; the scene steps it on a fixed clock, draws its latest snapshot,
 * and turns input into simulation calls.
 */
export class GameScene extends Phaser.Scene {
  private sim!: Simulation;
  private readonly stepper = createFixedStepper(SIM_DT);
  private bottleView!: BottleView;
  private shadowView!: BottleShadowView;
  private powerBarView!: PowerBarView;
  private resultView!: ResultView;
  private replayLabelView!: ReplayLabelView;
  private offscreenMarkerView!: OffscreenMarkerView;
  private hudView!: HudView;
  private cursorView!: CursorView;
  private effectsView!: EffectsView;
  private planner = new SoundPlanner();
  /** The pause overlay has been asked for and this scene is about to be paused (until it resumes). */
  private pauseRequested = false;

  constructor() {
    super('Game');
  }

  create(data: GameSceneData): void {
    const seed = data.seed ?? intParam('seed') ?? Math.floor(Math.random() * 1_000_000);
    // The developer tuning (edits and water lock from the panel) carries over to a restarted game.
    this.sim = new Simulation({ seed, ...tuningControl().simulationOptions() });
    this.stepper.reset();
    this.planner = new SoundPlanner(); // its knock rate limit counts this simulation's ticks
    registerSimulation(this.sim);
    this.pauseRequested = false;
    const onResume = (): void => {
      this.pauseRequested = false;
    };
    this.events.on(Phaser.Scenes.Events.RESUME, onResume);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.RESUME, onResume);
      registerSimulation(null);
    });

    createTableView(this);
    this.shadowView = createBottleShadowView(this);
    this.bottleView = createBottleView(this);
    this.offscreenMarkerView = createOffscreenMarkerView(this);
    this.powerBarView = createPowerBarView(this);
    this.resultView = createResultView(this);
    this.replayLabelView = createReplayLabelView(this);
    this.hudView = createHudView(this);
    this.cursorView = createCursorView(this);
    this.effectsView = createEffectsView(this);
    createPauseButton(this, 'pause', () => this.openPause());
    createMuteControl(this);

    bindGameInput(this, this.sim);
    bindPauseKeys(this, () => this.openPause());

    this.draw(this.sim.snapshot());
    markReady();
  }

  update(_time: number, delta: number): void {
    // The pause overlay opens next frame: step nothing more in the meantime.
    if (this.pauseRequested) return;
    if (!testControls.paused) this.stepper.advance(delta, () => this.sim.step());
    const snapshot = this.sim.snapshot();
    this.draw(snapshot);
    // What happened since the last frame (core never plays or draws anything): heard and seen.
    const events = this.sim.drainEvents();
    this.playSounds(events);
    this.effectsView.update(events, snapshot, this.sim.tuning);
    if (this.sim.phase === 'roundOver') this.openSummary();
  }

  /** Make the sounds for what the simulation reported since the last frame. */
  private playSounds(events: readonly SimEvent[]): void {
    for (const cue of this.planner.plan(events, this.sim.tuning)) sharedSfx().play(cue);
  }

  /**
   * The round is over: the Summary scene opens over this one, which is paused until the summary
   * closes (a paused scene hears no keys or mouse). A key still held or a grab still on would
   * otherwise carry over to the next round, so both are let go first.
   */
  private openSummary(): void {
    this.sim.powerMeter.release();
    this.sim.mouse.cancel();
    this.effectsView.stop(); // a paused scene's camera would hold a shake's offset until it resumed
    this.scene.launch('Summary', { sim: this.sim } satisfies SummaryData);
    this.scene.pause();
  }

  /**
   * Pause (Esc, P or the corner button): the Pause scene opens over this one, which is paused
   * until the overlay closes, so the simulation stops where it is and nothing is heard until then
   * (a paused scene hears no keys or mouse). Held keys and a grab would otherwise carry on at the
   * resume, as their release is never heard, so both are let go first, as at the round summary. Not
   * while the round is over (the summary opens instead), nor when a pause is already on its way.
   */
  private openPause(): void {
    if (this.pauseRequested || this.sim.phase === 'roundOver') return;
    this.pauseRequested = true;
    this.sim.powerMeter.release();
    this.sim.mouse.cancel();
    this.effectsView.stop();
    this.scene.launch('Pause', { sim: this.sim } satisfies PauseData);
    this.scene.pause();
  }

  private draw(snapshot: SimSnapshot): void {
    // During the replay the bottle view draws the recorded pose instead of the live bottle.
    const { replay } = snapshot;
    const shown = replay
      ? {
          ...snapshot.bottle,
          x: replay.x,
          y: replay.y,
          angle: replay.angle,
          waterOffset: replay.waterOffset,
        }
      : snapshot.bottle;
    this.bottleView.update(shown);
    this.shadowView.update(shown);
    this.offscreenMarkerView.update(shown);
    this.replayLabelView.update(replay !== null);
    this.powerBarView.update(snapshot.power);
    this.resultView.update(snapshot.outcome, snapshot.resultSteps);
    this.hudView.update(snapshot);
    const pointer = this.input.activePointer;
    this.cursorView.update(snapshot.dragging, this.sim.mouse.canGrab(pointer.x, pointer.y));
  }
}
