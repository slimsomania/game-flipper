import type { SimEvent } from '../../core/events';
import { PIXELS_PER_METER } from '../../core/constants';
import type { Tuning } from '../../core/tuning';
import { planEffects, type EffectCue } from './effectPlan';
import { CAP_FAN_DEGREES, burstParticles, makeBurst, type Burst, type Particle } from './particles';
import { ShakeEffect, type Offset } from './shake';

/**
 * How far past the edge of the canvas the scene draws its full-width parts (the table's legs, the
 * result flash), so a shaken camera never shows an empty strip at an edge. It is above any cap the
 * shake is set to in the defaults (`shakeMaxPixels`).
 */
export const OVERSCAN_PX = 16;

/**
 * The small effects of the Game scene, without Phaser: feed it the simulation's events each frame
 * (`handle`) and ask where the camera is (`cameraOffset`) and which particles are alive
 * (`particles`) at a tick. Everything is a function of ticks, so it is deterministic and a paused
 * game holds still. The scene draws what it says.
 */
export class Effects {
  private readonly shake = new ShakeEffect();
  private bursts: Burst[] = [];

  /**
   * Start the effects for `events`, and return their cues (for the log). `base` is where the bottle
   * stands now, in meters (the middle of its base): a burst starts there, as the bottle that was
   * just judged is still on the table during the result.
   */
  handle(events: readonly SimEvent[], base: { x: number; y: number }, tuning: Tuning): EffectCue[] {
    const cues = planEffects(events, tuning);
    for (const cue of cues) {
      if (cue.name === 'shake') {
        this.shake.trigger(cue.tick, cue.intensity, tuning.shakeSeconds);
      } else if (cue.name === 'burst' || cue.name === 'capBurst') {
        const x = base.x * PIXELS_PER_METER;
        const y = base.y * PIXELS_PER_METER;
        const fan = cue.name === 'capBurst' ? CAP_FAN_DEGREES : undefined;
        this.bursts.push(makeBurst(x, y, cue.intensity, cue.tick, fan));
      }
    }
    return cues;
  }

  /** How far the picture is moved at `tick`: (0, 0) when there is no shake. */
  cameraOffset(tick: number): Offset {
    return this.shake.offset(tick);
  }

  /** Every particle to draw at `tick`. A burst that is over is forgotten. */
  particles(tick: number): Particle[] {
    const alive: Particle[] = [];
    this.bursts = this.bursts.filter((burst) => {
      const particles = burstParticles(burst, tick);
      alive.push(...particles);
      return particles.length > 0 || tick < burst.tick;
    });
    return alive;
  }

  /** Stop everything at once: no shake, no particles. */
  clear(): void {
    this.shake.clear();
    this.bursts = [];
  }
}
