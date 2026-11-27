import type { SoundName } from './soundPlan';

/*
 * The four sounds, made from oscillators and filtered noise with the Web Audio API: there are no
 * audio files. Each voice schedules its nodes on the context's clock, connects them to `out` and
 * lets them stop by themselves, so a voice needs no cleanup. `volume` (above 0, up to 1) scales the
 * voice's own gain.
 */

/** The silence an envelope decays to: an exponential ramp can't reach 0. */
const FLOOR = 0.0001;

interface ToneOptions {
  type: OscillatorType;
  /** Frequency at the start and at the end of the sound, in Hz (a glide when they differ). */
  from: number;
  to: number;
  /** Seconds after now that the tone starts, how long it rings, and its loudest gain. */
  delay?: number;
  duration: number;
  peak: number;
  /** Seconds to rise to the peak. */
  attack?: number;
}

/** A pitched tone with a quick attack and an exponential decay. */
function tone(ctx: AudioContext, out: AudioNode, o: ToneOptions): void {
  const start = ctx.currentTime + (o.delay ?? 0);
  const peakAt = start + (o.attack ?? 0.004);
  const end = start + o.duration;
  const osc = ctx.createOscillator();
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.from, start);
  osc.frequency.exponentialRampToValueAtTime(o.to, end);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(FLOOR, start);
  gain.gain.linearRampToValueAtTime(o.peak, peakAt);
  gain.gain.exponentialRampToValueAtTime(FLOOR, end);
  osc.connect(gain).connect(out);
  osc.start(start);
  osc.stop(end + 0.02);
}

interface NoiseOptions {
  filter: BiquadFilterType;
  /** The filter's frequency at the start and the end, in Hz (a sweep when they differ), and its Q. */
  from: number;
  to: number;
  q: number;
  duration: number;
  peak: number;
  attack?: number;
}

/** One second of white noise, made once per context. */
const noiseBuffers = new WeakMap<AudioContext, AudioBuffer>();
function noiseBuffer(ctx: AudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

/** A burst of filtered noise with a sweeping filter and a short envelope. */
function noise(ctx: AudioContext, out: AudioNode, o: NoiseOptions): void {
  const start = ctx.currentTime;
  const peakAt = start + (o.attack ?? 0.004);
  const end = start + o.duration;
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = o.filter;
  filter.Q.value = o.q;
  filter.frequency.setValueAtTime(o.from, start);
  filter.frequency.exponentialRampToValueAtTime(o.to, end);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(FLOOR, start);
  gain.gain.linearRampToValueAtTime(o.peak, peakAt);
  gain.gain.exponentialRampToValueAtTime(FLOOR, end);
  source.connect(filter).connect(gain).connect(out);
  source.start(start);
  source.stop(end + 0.02);
}

/** Air rushing past: noise through a band that sweeps upward. */
function whoosh(ctx: AudioContext, out: AudioNode, volume: number): void {
  noise(ctx, out, {
    filter: 'bandpass',
    from: 450,
    to: 2600,
    q: 1.1,
    duration: 0.35,
    // A narrow band of noise is faint (about a sixth of the gain comes through), so this is high.
    peak: 2.4 * volume,
    attack: 0.1,
  });
}

/** A hollow wooden knock: a short falling thump with a click on top. */
function knock(ctx: AudioContext, out: AudioNode, volume: number): void {
  tone(ctx, out, { type: 'sine', from: 240, to: 110, duration: 0.2, peak: 0.8 * volume });
  tone(ctx, out, { type: 'triangle', from: 520, to: 300, duration: 0.05, peak: 0.25 * volume });
  noise(ctx, out, {
    filter: 'bandpass',
    from: 1800,
    to: 1200,
    q: 0.9,
    duration: 0.03,
    peak: 0.3 * volume,
  });
}

/** A happy chime: a rising C major arpeggio of bell-like notes, each with a quiet octave above. */
function chime(ctx: AudioContext, out: AudioNode, volume: number): void {
  const notes = [1046.5, 1318.5, 1568.0]; // C6, E6, G6
  notes.forEach((hz, i) => {
    const delay = i * 0.08;
    tone(ctx, out, { type: 'sine', from: hz, to: hz, delay, duration: 0.8, peak: 0.28 * volume });
    tone(ctx, out, {
      type: 'sine',
      from: hz * 2,
      to: hz * 2,
      delay,
      duration: 0.35,
      peak: 0.08 * volume,
    });
  });
}

/**
 * A fanfare for the cap: a quick rising C major run of five bell-like notes up to E7, each with a
 * bright octave above, the last one ringing longer. Bigger and brighter than the chime.
 */
function fanfare(ctx: AudioContext, out: AudioNode, volume: number): void {
  const notes = [1046.5, 1318.5, 1568.0, 2093.0, 2637.0]; // C6, E6, G6, C7, E7
  notes.forEach((hz, i) => {
    const last = i === notes.length - 1;
    const delay = i * 0.09;
    const duration = last ? 0.8 : 0.45;
    tone(ctx, out, { type: 'sine', from: hz, to: hz, delay, duration, peak: 0.2 * volume });
    tone(ctx, out, { type: 'triangle', from: hz, to: hz, delay, duration, peak: 0.06 * volume });
    tone(ctx, out, {
      type: 'sine',
      from: hz * 2,
      to: hz * 2,
      delay,
      duration: duration * 0.5,
      peak: 0.06 * volume,
    });
  });
}

/** A low thud: a deep note sinking in pitch over a soft, dark thump of noise. */
function thud(ctx: AudioContext, out: AudioNode, volume: number): void {
  tone(ctx, out, { type: 'sine', from: 130, to: 45, duration: 0.4, peak: 0.9 * volume });
  noise(ctx, out, {
    filter: 'lowpass',
    from: 500,
    to: 150,
    q: 0.7,
    duration: 0.12,
    peak: 0.35 * volume,
  });
}

const VOICES: Record<SoundName, (ctx: AudioContext, out: AudioNode, volume: number) => void> = {
  whoosh,
  knock,
  chime,
  fanfare,
  thud,
};

/** Make the sound `name` on `ctx`, into `out`. */
export function playVoice(
  ctx: AudioContext,
  out: AudioNode,
  name: SoundName,
  volume: number,
): void {
  VOICES[name](ctx, out, volume);
}
