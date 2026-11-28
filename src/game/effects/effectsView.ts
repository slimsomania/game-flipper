import type Phaser from 'phaser';
import type { SimEvent } from '../../core/events';
import type { SimSnapshot } from '../../core/simulation';
import type { Tuning } from '../../core/tuning';
import { PIXELS_PER_METER } from '../../core/constants';
import { Effects } from './effects';
import { sharedEffectLog } from './effectLog';

/** Above the result flash (so the particles keep their colors) and below the message and the HUD. */
const PARTICLE_DEPTH = 15;

export interface EffectsView {
  /**
   * Start the effects for the events drained this frame, log them, and draw the effects as they
   * are at the snapshot's tick: the camera's place and the particles in the air.
   */
  update(events: readonly SimEvent[], snapshot: SimSnapshot, tuning: Tuning, baseX?: number): void;
  /** Put an end to every effect and the camera back at rest (before the scene is paused). */
  stop(): void;
}

/**
 * The small effects of the Game scene (F021): a camera shake on an impact and a burst of particles
 * on a success (the message's pop-in is `resultView`'s). What happens and how strong is in
 * `Effects`, a pure function of the simulation's ticks; this only draws it. The camera is moved by
 * its scroll, so everything in the scene shakes together, and the log of what was played starts
 * empty with the scene (the ticks start again with its simulation).
 */
export function createEffectsView(scene: Phaser.Scene): EffectsView {
  const effects = new Effects();
  const log = sharedEffectLog();
  log.clear();
  const camera = scene.cameras.main;
  camera.setScroll(0, 0);
  const particles = scene.add.graphics().setDepth(PARTICLE_DEPTH);
  let drawing = false;

  return {
    update(events, snapshot, tuning, baseX) {
      // `baseX` (meters) replaces the bottle's own when the throw is drawn mirrored.
      const base = baseX === undefined ? snapshot.bottle : { x: baseX, y: snapshot.bottle.y };
      for (const cue of effects.handle(events, base, tuning)) {
        const burst = cue.name === 'burst' || cue.name === 'capBurst';
        log.record(cue, burst ? base.x * PIXELS_PER_METER : undefined);
      }

      const offset = effects.cameraOffset(snapshot.tick);
      camera.setScroll(offset.x, offset.y);

      const alive = effects.particles(snapshot.tick);
      if (alive.length === 0 && !drawing) return;
      drawing = alive.length > 0;
      particles.clear();
      for (const particle of alive) {
        particles.fillStyle(particle.color, particle.alpha);
        particles.fillCircle(particle.x, particle.y, particle.radius);
      }
    },
    stop() {
      effects.clear();
      camera.setScroll(0, 0);
      particles.clear();
      drawing = false;
    },
  };
}
