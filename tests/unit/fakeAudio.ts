/**
 * A stand-in for the browser's `AudioContext`, for the unit tests of the sound code: it records the
 * graph a voice builds (what connects to what, when each source starts and stops, every value
 * scheduled on a parameter) so a test can check the sound without any audio hardware. Not a test
 * file, so Vitest doesn't collect it.
 */

export interface ParamCall {
  method: 'set' | 'linear' | 'exponential';
  value: number;
  time: number;
}

export class FakeParam {
  value = 0;
  readonly calls: ParamCall[] = [];
  setValueAtTime(value: number, time: number): this {
    this.calls.push({ method: 'set', value, time });
    return this;
  }
  linearRampToValueAtTime(value: number, time: number): this {
    this.calls.push({ method: 'linear', value, time });
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number): this {
    this.calls.push({ method: 'exponential', value, time });
    return this;
  }
}

export class FakeNode {
  readonly connections: FakeNode[] = [];
  connect<T extends FakeNode>(destination: T): T {
    this.connections.push(destination);
    return destination;
  }
  /** Every node this one feeds, directly or through others. */
  reaches(target: FakeNode): boolean {
    return this.connections.some((next) => next === target || next.reaches(target));
  }
}

export class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
}

export class FakeFilter extends FakeNode {
  type = '';
  readonly frequency = new FakeParam();
  readonly Q = new FakeParam();
}

/** An oscillator or a buffer source: something that makes sound once started. */
export class FakeSource extends FakeNode {
  type = '';
  buffer: unknown = null;
  readonly frequency = new FakeParam();
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  start(time: number): void {
    this.startedAt = time;
  }
  stop(time: number): void {
    this.stoppedAt = time;
  }
}

export class FakeAudioContext {
  state: AudioContextState = 'suspended';
  currentTime = 1;
  sampleRate = 8000;
  readonly destination = new FakeNode();
  readonly gains: FakeGain[] = [];
  readonly filters: FakeFilter[] = [];
  readonly sources: FakeSource[] = [];
  resumeCalls = 0;
  /** What `resume()` leaves the state as: 'running', or 'suspended' for a browser that refuses. */
  resumesTo: AudioContextState = 'running';

  resume(): Promise<void> {
    this.resumeCalls++;
    this.state = this.resumesTo;
    return Promise.resolve();
  }
  createGain(): FakeGain {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
  createBiquadFilter(): FakeFilter {
    const filter = new FakeFilter();
    this.filters.push(filter);
    return filter;
  }
  createOscillator(): FakeSource {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  createBufferSource(): FakeSource {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  createBuffer(_channels: number, length: number): { getChannelData(): Float32Array } {
    const samples = new Float32Array(length);
    return { getChannelData: () => samples };
  }
}

/** The fake as the type the sound code asks for. */
export const asContext = (fake: FakeAudioContext): AudioContext => fake as unknown as AudioContext;
