import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, PIXELS_PER_METER, SIM_DT } from '../../core/constants';
import { createFixedStepper } from '../../core/fixedStep';
import { Simulation, TABLE_Y } from '../../core/simulation';
import { registerSimulation, testControls } from '../../debug/testHooks';
import { COLORS, FONT_FAMILY } from '../theme';
import { intParam } from '../urlParams';

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

    const tableTop = TABLE_Y * PIXELS_PER_METER;
    const tableHeight = GAME_HEIGHT - tableTop;
    this.add.rectangle(
      GAME_WIDTH / 2,
      tableTop + tableHeight / 2,
      GAME_WIDTH,
      tableHeight,
      COLORS.table,
    );
    this.add.rectangle(GAME_WIDTH / 2, tableTop + 6, GAME_WIDTH, 12, COLORS.tableEdge);
    this.bottle = this.add.image(0, 0, 'bottle');

    this.add
      .text(GAME_WIDTH / 2, 60, 'Placeholder scene: gameplay not built yet', {
        fontFamily: FONT_FAMILY,
        fontSize: '28px',
        color: COLORS.accent,
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 100, `seed ${seed} · R restart · Esc menu`, {
        fontFamily: FONT_FAMILY,
        fontSize: '24px',
        color: COLORS.muted,
      })
      .setOrigin(0.5);

    this.input.keyboard?.on('keydown-R', () => this.scene.restart({ seed: seed + 1 }));
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('Menu'));

    this.draw();
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
