import Phaser from 'phaser';
import { PIXELS_PER_METER, SIM_DT } from '../../core/constants';
import { createFixedStepper } from '../../core/fixedStep';
import { Simulation } from '../../core/simulation';
import { markReady, registerSimulation, testControls } from '../../debug/testHooks';
import { intParam } from '../urlParams';
import { createTableView } from '../view/tableView';

interface GameSceneData {
  seed?: number;
}

/**
 * PLACEHOLDER game scene. It shows the pattern every gameplay scene follows: the simulation
 * (src/core) owns the state; the scene steps it on a fixed clock, draws its latest snapshot,
 * and turns input into simulation calls.
 */
export class GameScene extends Phaser.Scene {
  private sim!: Simulation;
  private readonly stepper = createFixedStepper(SIM_DT);
  private bottle!: Phaser.GameObjects.Image;

  constructor() {
    super('Game');
  }

  create(data: GameSceneData): void {
    const seed = data.seed ?? intParam('seed') ?? Math.floor(Math.random() * 1_000_000);
    this.sim = new Simulation({ seed });
    this.stepper.reset();
    registerSimulation(this.sim);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => registerSimulation(null));

    createTableView(this);
    this.bottle = this.add.image(0, 0, 'bottle');

    this.input.keyboard?.on('keydown-R', () => this.scene.restart({ seed: seed + 1 }));

    this.draw();
    markReady();
  }

  update(_time: number, delta: number): void {
    if (!testControls.paused) this.stepper.advance(delta, () => this.sim.step());
    this.draw();
  }

  private draw(): void {
    const { bottle } = this.sim.snapshot();
    this.bottle
      .setPosition(bottle.x * PIXELS_PER_METER, bottle.y * PIXELS_PER_METER)
      .setRotation(bottle.angle);
  }
}
