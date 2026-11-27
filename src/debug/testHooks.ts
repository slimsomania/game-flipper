import Phaser from 'phaser';
import type { SimSnapshot, Simulation } from '../core/simulation';
import { setMute } from '../game/audio/mute';
import { rotateMessageShowing } from '../game/rotateMessage';
import { sharedSfx } from '../game/audio/sfx';
import { sharedEffectLog } from '../game/effects/effectLog';
import { drawnShadow } from '../game/view/bottleShadowView';
import { OFFSCREEN_MARKER_NAME } from '../game/view/offscreenMarkerView';
import { frameCost, resetFrameCost } from './frameCost';
import { currentSimulation } from './currentSimulation';
import { tuningControl } from './tuningControl';
import { visibleFlash } from './visibleFlash';
import { visibleButtons } from './visibleButtons';
import { visibleFullscreenButton } from './visibleFullscreenButton';
import { visibleMuteButton } from './visibleMuteButton';
import { drawnPictures } from '../game/view/howToPictureView';
import { visibleTextBounds, visibleTexts } from './visibleTexts';
import type { FlipperTestApi } from './testApi';

// The `window.__FLIPPER__` API and its documentation are in testApi.ts; this file builds it.
export type { FlipperTestApi } from './testApi';

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

  const api: FlipperTestApi = {
    ready: false,
    phaserGame: () => game,
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
    fullscreenButton: () => visibleFullscreenButton(game.scene.getScenes(true)),
    buttons: () => visibleButtons(game.scene.getScenes(true)),
    gamePaused: () => game.scene.isActive('Pause'),
    howToOpen: () => game.scene.isActive('HowTo'),
    howToPicture: () =>
      drawnPictures(game.scene.isActive('HowTo') ? game.scene.getScene('HowTo') : null),
    rotateMessage: () => rotateMessageShowing(),
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
      return control.set(key, Number(value)) ? { ...control.values() } : null;
    },
    lockWater: (level) => {
      tuningControl().setWaterLock(level);
      return tuningControl().waterLock();
    },
    recording: () => currentSimulation()?.recording ?? [],
    landingClip: () => currentSimulation()?.landingClip ?? [],
    frameTime: () => frameCost(),
    resetFrameTime: () => resetFrameCost(),
    objectCounts: () => {
      const scene = currentSimulation() ? game.scene.getScene('Game') : null;
      if (!scene) return null;
      // Phaser's clock has no public list of its timers: read its two queues.
      const clock = scene.time as unknown as { _active: unknown[]; _pendingInsertion: unknown[] };
      return {
        objects: scene.children.length,
        tweens: scene.tweens.getTweens().length,
        timers: clock._active.length + clock._pendingInsertion.length,
      };
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
  window.__FLIPPER__ = api;
}
