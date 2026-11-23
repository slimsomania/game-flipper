import Phaser from 'phaser';
import type { BottlePose } from '../core/bottle';
import type { ReplayFrame } from '../core/replay';
import type { SimSnapshot, Simulation } from '../core/simulation';
import type { Tuning } from '../core/tuning';
import { setMute } from '../game/audio/mute';
import { sharedSfx, type SoundLogEntry } from '../game/audio/sfx';
import { sharedEffectLog, type EffectLogEntry } from '../game/effects/effectLog';
import { drawnShadow } from '../game/view/bottleShadowView';
import { OFFSCREEN_MARKER_NAME } from '../game/view/offscreenMarkerView';
import { currentSimulation } from './currentSimulation';
import { tuningControl } from './tuningControl';
import { visibleFlash, type FlashView } from './visibleFlash';
import { visibleMuteButton, type MuteButtonView } from './visibleMuteButton';
import { visibleTextBounds, visibleTexts, type TextBounds } from './visibleTexts';

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
  /**
   * True once the first interactive scene is up and accepts input: the Title scene (the game boots
   * to it, so there is no simulation until `startScene('Game')` or a click on Play).
   */
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
   * The same visible texts as `texts()`, each with the box it fills (`left`, `top`, `right`,
   * `bottom`, in game pixels, where the object is in the world). The camera's own movement is
   * separate (`cameraOffset()`), so a test can check that a shake never cuts a text off the canvas.
   */
  textBounds(): TextBounds[];
  /**
   * The small effects the game has played since its Game scene started, oldest first: `name`
   * ('shake', 'burst' or 'pop'), `intensity` and the `tick` of the event behind it. A `shake`'s
   * intensity is the farthest it moves the picture in game pixels (never above the tuning's
   * `shakeMaxPixels`; an impact softer than `shakeMinSpeed` makes none); a `burst` (a success only)
   * is its number of particles; a `pop` (every result message) is 1. Like `sounds()` it shows what
   * the scene last drained: wait a frame after stepping.
   */
  effects(): EffectLogEntry[];
  /**
   * How far the Game scene's camera is moved from rest, in game pixels: (0, 0) at rest, anything
   * else while a camera shake is on. Null when no game scene is running. Like `texts()` it shows
   * what the scene last drew: wait a frame after stepping.
   */
  cameraOffset(): { x: number; y: number } | null;
  /**
   * The full-screen result flash the player can see, as its color (a hex number) and opacity, or
   * null when there is none (no result yet, or the flash has faded out). Like `texts()` it shows
   * what the scene last drew, so wait a frame after stepping.
   */
  flash(): FlashView | null;
  /**
   * The off-screen marker (an arrow on the top edge under a bottle that has flown above the
   * screen) as the scene last drew it: its `x` in game pixels and its opacity, or null when it is
   * hidden or no game scene is running. Wait a frame after stepping.
   */
  offscreenMarker(): { x: number; alpha: number } | null;
  /**
   * The soft shadow on the tabletop under the bottle as the scene last drew it: its `width` in game
   * pixels and `alpha` (0 to 1), or null when it is hidden (the bottle is not over the table) or no
   * game scene is running. Widest and darkest at rest, smaller and fainter the higher the bottle.
   * Wait a frame after stepping.
   */
  shadow(): { width: number; alpha: number } | null;
  /**
   * The sounds the game has played, oldest first: `name` ('whoosh', 'knock', 'chime' or 'thud'),
   * `volume` (0 to 1) and the `tick` of the event behind it. It records what the game asked to
   * hear, so it fills even where the browser keeps the audio context locked until the first click
   * or key press. Like `texts()` it shows what the scene last drained: wait a frame after stepping.
   */
  sounds(): SoundLogEntry[];
  /**
   * Whether all sound is muted. While it is, the game plays nothing and `sounds()` gets no new
   * entries. It is the setting the M key and the speaker button flip, and it is saved.
   */
  muted(): boolean;
  /**
   * Mute or unmute exactly as the M key does (including saving the choice), and return the new
   * state. Anything that isn't a boolean is ignored.
   */
  setMuted(muted: boolean): boolean;
  /**
   * The speaker button the player sees: the icon it last drew (`muted` true is the cross) and its
   * clickable area (`x`, `y` the middle, `width`, `height`, in game pixels, so a test can click it
   * with `page.mouse`). Null when no running scene has one (every screen the player can reach does:
   * the Title, the Game scene, the pause overlay and the round summary). Like `texts()` it shows
   * what the scene last drew: wait a frame after changing the state.
   */
  muteButton(): MuteButtonView | null;
  /**
   * Whether the player has paused the game: the pause overlay is open (Esc, P or the corner button)
   * and the Game scene waits underneath, not stepping the simulation or hearing input. This is the
   * game's own pause. It is separate from `pause()` and `resume()` below, which only stop and start
   * the test clock that drives the simulation (the game is not paused by them, and keeps taking
   * input), and from the round summary, which also stops the Game scene but is not a pause. The
   * overlay opens a frame after the key press, so poll this after pressing.
   */
  gamePaused(): boolean;
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
  /** Every step of the current throw, release to outcome (see `Simulation.recording`); [] with none. */
  recording(): ReplayFrame[];
  /** The landing clip of the current throw (see `Simulation.landingClip`); [] with none. */
  landingClip(): ReplayFrame[];
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
    textBounds: () => visibleTextBounds(game.scene.getScenes(true)),
    effects: () => sharedEffectLog().log(),
    cameraOffset: () => {
      const camera = currentSimulation() && game.scene.getScene('Game')?.cameras.main;
      return camera ? { x: camera.scrollX, y: camera.scrollY } : null;
    },
    flash: () => visibleFlash(game.scene.getScenes(true)),
    offscreenMarker: () => {
      const scene = currentSimulation() ? game.scene.getScene('Game') : null;
      const marker = scene?.children.getByName(OFFSCREEN_MARKER_NAME) as
        Phaser.GameObjects.Graphics | null | undefined;
      return marker?.visible ? { x: marker.x, alpha: marker.alpha } : null;
    },
    shadow: () => {
      const scene = currentSimulation() ? game.scene.getScene('Game') : null;
      return scene ? drawnShadow(scene) : null;
    },
    sounds: () => sharedSfx().log(),
    muted: () => sharedSfx().muted,
    setMuted: (muted) => (typeof muted === 'boolean' ? setMute(muted) : sharedSfx().muted),
    muteButton: () => visibleMuteButton(game.scene.getScenes(true)),
    gamePaused: () => game.scene.isActive('Pause'),
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
    recording: () => currentSimulation()?.recording ?? [],
    landingClip: () => currentSimulation()?.landingClip ?? [],
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
