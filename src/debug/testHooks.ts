import Phaser from 'phaser';
import type { BottlePose } from '../core/bottle';
import type { SimSnapshot, Simulation } from '../core/simulation';
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
  /** Keys of the scenes that are running, e.g. ["Game"]. */
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
  /** Stop all running scenes and start `key` (e.g. "Game") with optional scene data. */
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

let currentSim: Simulation | null = null;

/** Called by the game scene when it creates (or drops) its simulation. */
export function registerSimulation(sim: Simulation | null): void {
  currentSim = sim;
}

/** Called by the first interactive scene once it is ready for input. */
export function markReady(): void {
  if (window.__FLIPPER__) window.__FLIPPER__.ready = true;
}

export function installTestHooks(game: Phaser.Game): void {
  const enabled =
    import.meta.env.DEV || new URLSearchParams(window.location.search).has('testhooks');
  if (!enabled) return;

  window.__FLIPPER__ = {
    ready: false,
    activeScenes: () => game.scene.getScenes(true).map((scene) => scene.scene.key),
    state: () => currentSim?.snapshot() ?? null,
    texts: () => visibleTexts(game.scene.getScenes(true)),
    flash: () => visibleFlash(game.scene.getScenes(true)),
    pause: () => {
      testControls.paused = true;
    },
    resume: () => {
      testControls.paused = false;
    },
    step: (frames = 1) => {
      if (!currentSim) return null;
      for (let i = 0; i < frames; i++) currentSim.step();
      return currentSim.snapshot();
    },
    setWater: (level) => {
      if (!currentSim) return null;
      currentSim.setWater(level);
      return currentSim.snapshot();
    },
    throwBottle: (power) => {
      if (!currentSim) return null;
      currentSim.throwBottle(power);
      return currentSim.snapshot();
    },
    setPower: (power) => {
      if (!currentSim) return null;
      currentSim.powerMeter.set(power);
      return currentSim.snapshot();
    },
    placeBottle: (pose) => {
      if (!currentSim) return null;
      currentSim.placeBottle(pose);
      return currentSim.snapshot();
    },
    skip: () => {
      if (!currentSim) return null;
      currentSim.skip();
      return currentSim.snapshot();
    },
    startScene: (key, data) => {
      for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.scene.key);
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
