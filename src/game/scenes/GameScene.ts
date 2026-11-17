import Phaser from 'phaser';
import { SIM_DT } from '../../core/constants';
import { createFixedStepper } from '../../core/fixedStep';
import { Simulation } from '../../core/simulation';
import { registerSimulation } from '../../debug/currentSimulation';
import { markReady, testControls } from '../../debug/testHooks';
import { tuningControl } from '../../debug/tuningControl';
import { sharedSfx } from '../audio/sfx';
import { SoundPlanner } from '../audio/soundPlan';
import { bindGameInput } from '../gameInput';
import { intParam } from '../urlParams';
import { createBottleView, type BottleView } from '../view/bottleView';
import { createCursorView, type CursorView } from '../view/cursorView';
import { createHudView, type HudView } from '../view/hudView';
import { createPowerBarView, type PowerBarView } from '../view/powerBarView';
import { createResultView, type ResultView } from '../view/resultView';
import { createTableView } from '../view/tableView';
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
  private powerBarView!: PowerBarView;
  private resultView!: ResultView;
  private hudView!: HudView;
  private cursorView!: CursorView;
  private planner = new SoundPlanner();

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
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => registerSimulation(null));

    createTableView(this);
    this.bottleView = createBottleView(this);
    this.powerBarView = createPowerBarView(this);
    this.resultView = createResultView(this);
    this.hudView = createHudView(this);
    this.cursorView = createCursorView(this);

    bindGameInput(this, this.sim);

    this.draw();
    markReady();
  }

  update(_time: number, delta: number): void {
    if (!testControls.paused) this.stepper.advance(delta, () => this.sim.step());
    this.draw();
    this.playSounds();
    if (this.sim.phase === 'roundOver') this.openSummary();
  }

  /** Make the sounds for what the simulation reported since the last frame (core never plays any). */
  private playSounds(): void {
    const events = this.sim.drainEvents();
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
    this.scene.launch('Summary', { sim: this.sim } satisfies SummaryData);
    this.scene.pause();
  }

  private draw(): void {
    const snapshot = this.sim.snapshot();
    this.bottleView.update(snapshot.bottle);
    this.powerBarView.update(snapshot.power);
    this.resultView.update(snapshot.outcome, snapshot.resultSteps);
    this.hudView.update(snapshot);
    const pointer = this.input.activePointer;
    this.cursorView.update(snapshot.dragging, this.sim.mouse.canGrab(pointer.x, pointer.y));
  }
}
