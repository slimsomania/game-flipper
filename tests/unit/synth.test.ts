import { describe, expect, it } from 'vitest';
import type { SoundName } from '../../src/game/audio/soundPlan';
import { playVoice } from '../../src/game/audio/synth';
import { FakeAudioContext, FakeNode, FakeParam, asContext } from './fakeAudio';

const NAMES: SoundName[] = ['whoosh', 'knock', 'chime', 'thud'];

/** Play one voice on a fresh fake context; return the context and the node it was sent to. */
function voice(name: SoundName, volume = 1) {
  const fake = new FakeAudioContext();
  const out = new FakeNode();
  playVoice(asContext(fake), out as unknown as AudioNode, name, volume);
  return { fake, out };
}

const allParams = (fake: FakeAudioContext): FakeParam[] => [
  ...fake.gains.map((g) => g.gain),
  ...fake.filters.flatMap((f) => [f.frequency, f.Q]),
  ...fake.sources.map((s) => s.frequency),
];

describe.each(NAMES)('the %s voice', (name) => {
  it('makes sound: at least one source, each started and then stopped later', () => {
    const { fake } = voice(name);
    expect(fake.sources.length).toBeGreaterThan(0);
    for (const source of fake.sources) {
      expect(source.startedAt).not.toBeNull();
      expect(source.stoppedAt).not.toBeNull();
      expect(source.stoppedAt!).toBeGreaterThan(source.startedAt!);
    }
  });

  it('sends every source to the output', () => {
    const { fake, out } = voice(name);
    for (const source of fake.sources) expect(source.reaches(out)).toBe(true);
  });

  it('starts at or after now and ends within about a second', () => {
    const { fake } = voice(name);
    for (const source of fake.sources) {
      expect(source.startedAt!).toBeGreaterThanOrEqual(fake.currentTime);
      expect(source.stoppedAt! - fake.currentTime).toBeLessThan(1.2);
    }
  });

  it('only schedules finite values, and exponential ramps only to above 0', () => {
    const { fake } = voice(name);
    for (const param of allParams(fake)) {
      for (const call of param.calls) {
        expect(Number.isFinite(call.value)).toBe(true);
        expect(Number.isFinite(call.time)).toBe(true);
        if (call.method === 'exponential') expect(call.value).toBeGreaterThan(0);
      }
    }
  });

  it('keeps every gain at a sane size (that the sound does not clip is measured in soundRender.spec.ts)', () => {
    // A gain is not the output level: noise through a narrow filter needs a gain above 1.
    const { fake } = voice(name, 1);
    for (const gain of fake.gains) {
      for (const call of gain.gain.calls) expect(Math.abs(call.value)).toBeLessThanOrEqual(4);
    }
  });

  it('is quieter at a lower volume', () => {
    const peak = (volume: number) =>
      Math.max(...voice(name, volume).fake.gains.flatMap((g) => g.gain.calls.map((c) => c.value)));
    expect(peak(0.3)).toBeLessThan(peak(1));
    expect(peak(0.3)).toBeGreaterThan(0);
  });
});

describe('the voices together', () => {
  it('differ in pitch: the thud is the lowest and the chime the highest', () => {
    const startFrequency = (name: SoundName): number[] =>
      voice(name)
        .fake.sources.filter((s) => s.frequency.calls.length > 0)
        .map((s) => s.frequency.calls[0].value);
    expect(Math.max(...startFrequency('thud'))).toBeLessThan(Math.min(...startFrequency('chime')));
    expect(Math.min(...startFrequency('chime'))).toBeGreaterThan(1000);
    expect(Math.max(...startFrequency('thud'))).toBeLessThan(200);
  });

  it('give the chime more than one note, in a rising order', () => {
    const { fake } = voice('chime');
    const firstNotes = fake.sources
      .filter((s) => s.frequency.calls[0].value < 2000) // leave out the octaves above
      .sort((a, b) => a.startedAt! - b.startedAt!)
      .map((s) => s.frequency.calls[0].value);
    expect(firstNotes.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < firstNotes.length; i++)
      expect(firstNotes[i]).toBeGreaterThan(firstNotes[i - 1]);
  });

  it('make the knock shorter than the chime, and the whoosh a sweep upward', () => {
    const length = (name: SoundName): number => {
      const { fake } = voice(name);
      return Math.max(...fake.sources.map((s) => s.stoppedAt!)) - fake.currentTime;
    };
    expect(length('knock')).toBeLessThan(length('chime'));
    const [filter] = voice('whoosh').fake.filters;
    const [from, to] = filter.frequency.calls.map((c) => c.value);
    expect(to).toBeGreaterThan(from);
  });

  it('reuse one noise buffer per context', () => {
    const fake = new FakeAudioContext();
    let buffers = 0;
    const create = fake.createBuffer.bind(fake);
    fake.createBuffer = (channels, length) => {
      buffers++;
      return create(channels, length);
    };
    const out = new FakeNode() as unknown as AudioNode;
    playVoice(asContext(fake), out, 'whoosh', 1);
    playVoice(asContext(fake), out, 'whoosh', 1);
    playVoice(asContext(fake), out, 'knock', 1);
    expect(buffers).toBe(1);
  });
});
