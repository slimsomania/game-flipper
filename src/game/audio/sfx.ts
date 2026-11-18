import type { SoundCue } from './soundPlan';
import { playVoice } from './synth';

/*
 * The game's sound effects: one `Sfx` owns the Web Audio context. Browsers only let a page make
 * sound after the player has clicked or pressed a key, so the context is created (or resumed) only
 * by `unlock()`, which `unlockOnFirstInput` calls from the first of those. Before that, and in a
 * browser with no Web Audio, `play` is silent, so the rest of the game never has to ask.
 *
 * Mute is held here too, because every sound goes through `play`: while muted nothing is made and
 * nothing is logged, and the master gain is 0, so a sound that is already ringing is cut as well.
 * Who remembers the choice between visits is `mute.ts`; this class only holds it.
 */

/** A sound the game played, as `window.__FLIPPER__.sounds()` lists it. */
export interface SoundLogEntry {
  name: SoundCue['name'];
  volume: number;
  /** The simulation tick of the event that caused it. */
  tick: number;
}

/** The oldest entries are dropped past this many, so a long session keeps a small log. */
const LOG_LIMIT = 500;
/** Everything goes through one master gain, a little under full so overlapping sounds don't clip. */
export const MASTER_GAIN = 0.6;

/** The browser's audio context, or null where Web Audio is missing or the browser refuses one. */
function browserContext(): AudioContext | null {
  try {
    return typeof AudioContext === 'undefined' ? null : new AudioContext();
  } catch {
    return null;
  }
}

export class Sfx {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly entries: SoundLogEntry[] = [];
  private isMuted = false;
  private readonly listeners = new Set<(muted: boolean) => void>();

  constructor(private readonly makeContext: () => AudioContext | null = browserContext) {}

  /** True while all sound is off. */
  get muted(): boolean {
    return this.isMuted;
  }

  /**
   * Turn all sound off or on. A sound already playing is cut at once (the master gain goes to 0),
   * and while muted `play` makes and logs nothing. Whoever listens (`onMutedChange`) hears about a
   * change, not about setting the state it already has.
   */
  setMuted(muted: boolean): void {
    if (muted === this.isMuted) return;
    this.isMuted = muted;
    if (this.master) this.master.gain.value = this.masterGain();
    for (const listener of [...this.listeners]) listener(muted);
  }

  /** Call `listener` whenever the mute state changes. Returns a function that stops listening. */
  onMutedChange(listener: (muted: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private masterGain(): number {
    return this.isMuted ? 0 : MASTER_GAIN;
  }

  /** The context's state, or 'none' while there isn't one (nothing has unlocked the sound yet). */
  get state(): AudioContextState | 'none' {
    return this.context?.state ?? 'none';
  }

  /** True once sounds are actually being made: a context exists and is running. */
  get running(): boolean {
    return this.context?.state === 'running';
  }

  /**
   * Create the audio context, or resume it if the browser left it suspended. Call it only from a
   * click or key press handler: that is what lets the browser start the sound. Safe to repeat.
   */
  unlock(): void {
    if (!this.context) {
      this.context = this.makeContext();
      if (!this.context) return;
      this.master = this.context.createGain();
      this.master.gain.value = this.masterGain();
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') this.context.resume().catch(() => undefined);
  }

  /**
   * Play a sound, and log it. The log records what the game asked to hear whether or not the browser
   * lets it be heard yet, so tests can check the sounds without a running audio context. While
   * muted the game asks for nothing: no sound, and no log entry.
   */
  play(cue: SoundCue): void {
    if (this.isMuted) return;
    this.entries.push({ name: cue.name, volume: cue.volume, tick: cue.tick });
    if (this.entries.length > LOG_LIMIT) this.entries.shift();
    const { context, master } = this;
    if (!context || !master) return;
    if (context.state === 'suspended') {
      // The browser paused it again (a tab that was in the background): wake it for the next one.
      context.resume().catch(() => undefined);
      return;
    }
    if (context.state !== 'running') return;
    try {
      playVoice(context, master, cue.name, cue.volume);
    } catch (error) {
      // A sound must never stop the game: Phaser's loop dies on an exception in a scene's update.
      console.error('Sound effect failed', error);
    }
  }

  /** A copy of the log, oldest first. */
  log(): SoundLogEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }
}

/** The input events that let a page start sound. Chrome counts a touch only when it lifts. */
const UNLOCK_EVENTS = ['keydown', 'pointerdown', 'pointerup'] as const;

/**
 * Unlock `sfx` on the first click or key press on `target` (the window) and stop listening once
 * the sound is running. Returns a function that stops listening at once.
 */
export function unlockOnFirstInput(
  sfx: Sfx,
  target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>,
): () => void {
  // Capture, so no scene's own handler can swallow the event before the sound hears it.
  const options = { capture: true };
  const stop = (): void => {
    for (const type of UNLOCK_EVENTS) target.removeEventListener(type, onInput, options);
  };
  function onInput(): void {
    sfx.unlock();
    if (sfx.running) stop();
  }
  for (const type of UNLOCK_EVENTS) target.addEventListener(type, onInput, options);
  return stop;
}

let shared: Sfx | null = null;

/** The page's one `Sfx`: the Game scene plays through it and the test hooks read its log. */
export function sharedSfx(): Sfx {
  shared ??= new Sfx();
  return shared;
}
