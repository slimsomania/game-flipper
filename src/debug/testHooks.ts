import Phaser from 'phaser';
import type { BottlePose } from '../core/bottle';
import type { SimSnapshot, Simulation } from '../core/simulation';
import type { Tuning } from '../core/tuning';
import { sharedSfx, type SoundLogEntry } from '../game/audio/sfx';
import { currentSimulation } from './currentSimulation';
import { tuningControl } from './tuningControl';
import { visibleFlash, type FlashView } from './visibleFlash';
import { visibleTexts } from './visibleTexts';

/**
 * window.__FLIPPER__ lets e2e tests and `npm run snap` observe and drive the game
 * deterministically, without reading pixels. It is installed in dev builds, and in any build
 * whose URL contains ?testhooks.
 *
 * Extend it when a feature needs to be observable or controllable from a test (for example
 * "throw with exact parameters"). Keep it thin: it calls into src/core and never reimplements
 * game rules.
 */
export interface FlipperTestApi {
  /** True once the first interactive scene is up and accepts input. */
  ready: boolean;
  /**
   * Keys of the scenes that are running, e.g. ["Game"]. A paused scene is not in the list: while
   * the round summary is open, the list is ["Summary"] (the Game scene waits, paused, underneath).
   */
  activeScenes(): string[];
  /** Snapshot of the running simulation, or null when no game scene is running. */
  state(): SimSnapshot | null;
  /**
   * The text strings the player can see in the active scenes (shown, non-empty text objects, in
   * display order), so a test can check UI text without reading pixels. The scene redraws once per
   * frame: after stepping or acting from a test, wait a frame (or poll) before reading it.
   */
  texts(): string[];
  /**
   * The full-screen result flash the player can see, as its color (a hex number) and opacity, or
   * null when there is none (no result yet, or the flash has faded out). Like `texts()` it shows
   * what the scene last drew, so wait a frame after stepping.
   */
  flash(): FlashView | null;
  /**
   * The sounds the game has played, oldest first: `name` ('whoosh', 'knock', 'chime' or 'thud'),
   * `volume` (0 to 1) and the `tick` of the event behind it. It records what the game asked to
   * hear, so it fills even where the browser keeps the audio context locked until the first click
   * or key press. Like `texts()` it shows what the scene last drained: wait a frame after stepping.
   */
  sounds(): SoundLogEntry[];
  /** Stop the real-time clock; the simulation then only advances through step(). */
  pause(): void;
  /** Resume real-time stepping. */
  resume(): void;
  /** Advance the simulation by exactly `frames` fixed steps (works while paused). */
  step(frames?: number): SimSnapshot | null;
  /** Set the held bottle's water level, 0 to 1 (clamped), and return the new snapshot. */
  setWater(level: number): SimSnapshot | null;
  /**
   * Throw the held bottle with `power` (0 to 100, clamped) as if from the keyboard, and return the
   * new snapshot. Does nothing unless the phase is "aiming". Null when no game is running.
   */
  throwBottle(power: number): SimSnapshot | null;
  /**
   * Set the power bar, 0 to 100 (clamped; a non-number is ignored), and return the new snapshot.
   * Works in every phase. Null when no game is running.
   */
  setPower(power: number): SimSnapshot | null;
  /**
   * Release the held bottle from an exact pose (meters, radians, m/s, rad/s; the velocities may be
   * left out) as if it had been thrown, so a test can create a landing directly. `turns` credits
   * rotation as already made (an upright bottle needs one full turn to succeed; the points are its
   * turns), and moves nothing. Returns the new snapshot. Does nothing unless the phase is
   * "aiming". Null when no game is running.
   */
  placeBottle(pose: BottlePose): SimSnapshot | null;
  /**
   * End the wait after a result at once, so the next bottle appears, and return the new snapshot.
   * Does nothing unless the phase is "result". Null when no game is running.
   */
  skip(): SimSnapshot | null;
  /**
   * Start the round again, as the R key does: throw 1, no points, landings or streak, and a new
   * bottle in the hand (the same seed carries on). Works in every phase, and returns the new
   * snapshot. Null when no game is running.
   */
  restartRound(): SimSnapshot | null;
  /**
   * The tuning in effect: the running simulation's, or (with no game running) the defaults with
   * the edits made so far. A copy: changing it changes nothing.
   */
  tuning(): Tuning;
  /**
   * Edit one tuning value exactly as the tuning panel does: it applies from the next bottle and
   * throw, and is kept in localStorage where the panel is on (dev builds and ?debug). Returns the
   * new tuning, or null (changing nothing) for a key that isn't in the tuning or a value that isn't
   * a finite number.
   */
  setTuningValue(key: keyof Tuning, value: number): Tuning | null;
  /**
   * Lock every bottle's water level to `level` (0 to 1, clamped), or pass null for random levels
   * again, like the panel's "Lock water" box. The held bottle takes the level at once. Returns the
   * water lock now in effect.
   */
  lockWater(level: number | null): number | null;
  /** Stop all running and paused scenes and start `key` (e.g. "Game") with optional scene data. */
  startScene(key: string, data?: object): void;
  /** Renderer and build info, for debugging test environments. */
  info(): { renderer: 'webgl' | 'canvas' | 'other'; phaser: string; dev: boolean };
}

declare global {
  interface Window {
    __FLIPPER__?: FlipperTestApi;
  }
}

/** Shared with the game scene: while paused, the scene stops stepping the simulation itself. */
export const testControls = { paused: false };

/** Called by the first interactive scene once it is ready for input. */
export function markReady(): void {
  if (window.__FLIPPER__) window.__FLIPPER__.ready = true;
}

export function installTestHooks(game: Phaser.Game): void {
  const enabled =
    import.meta.env.DEV || new URLSearchParams(window.location.search).has('testhooks');
  if (!enabled) return;

  /** Run `act` on the running simulation and return the new snapshot, or null with none running. */
  const acting = (act: (sim: Simulation) => void): SimSnapshot | null => {
    const sim = currentSimulation();
    if (!sim) return null;
    act(sim);
    return sim.snapshot();
  };

  window.__FLIPPER__ = {
    ready: false,
    activeScenes: () => game.scene.getScenes(true).map((scene) => scene.scene.key),
    state: () => currentSimulation()?.snapshot() ?? null,
    texts: () => visibleTexts(game.scene.getScenes(true)),
    flash: () => visibleFlash(game.scene.getScenes(true)),
    sounds: () => sharedSfx().log(),
    pause: () => {
      testControls.paused = true;
    },
    resume: () => {
      testControls.paused = false;
    },
    step: (frames = 1) =>
      acting((sim) => {
        for (let i = 0; i < frames; i++) sim.step();
      }),
    setWater: (level) => acting((sim) => sim.setWater(level)),
    throwBottle: (power) => acting((sim) => sim.throwBottle(power)),
    setPower: (power) => acting((sim) => sim.powerMeter.set(power)),
    placeBottle: (pose) => acting((sim) => sim.placeBottle(pose)),
    skip: () => acting((sim) => sim.skip()),
    restartRound: () => acting((sim) => sim.restartRound()),
    tuning: () => ({ ...(currentSimulation()?.tuning ?? tuningControl().values()) }),
    setTuningValue: (key, value) => {
      const control = tuningControl();
      return control.set(key, value) ? { ...control.values() } : null;
    },
    lockWater: (level) => {
      tuningControl().setWaterLock(level);
      return tuningControl().waterLock();
    },
    startScene: (key, data) => {
      // Paused scenes too: the Game scene is paused while the round summary is open.
      for (const scene of game.scene.getScenes(false)) {
        if (scene.scene.isActive() || scene.scene.isPaused()) game.scene.stop(scene.scene.key);
      }
      game.scene.start(key, data);
    },
    info: () => ({
      renderer:
        game.config.renderType === Phaser.WEBGL
          ? 'webgl'
          : game.config.renderType === Phaser.CANVAS
            ? 'canvas'
            : 'other',
      phaser: Phaser.VERSION,
      dev: import.meta.env.DEV,
    }),
  };
}
