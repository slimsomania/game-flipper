import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sfx, unlockOnFirstInput } from '../../src/game/audio/sfx';
import type { SoundCue } from '../../src/game/audio/soundPlan';
import { FakeAudioContext, asContext } from './fakeAudio';

const cue = (name: SoundCue['name'] = 'knock', volume = 0.5, tick = 1): SoundCue => ({
  name,
  volume,
  tick,
});

/** An Sfx on a fake context, and a way to see how often a context was made. */
function sfxWith(fake: FakeAudioContext | null = new FakeAudioContext()) {
  const make = vi.fn(() => (fake ? asContext(fake) : null));
  return { sfx: new Sfx(make), fake, make };
}

afterEach(() => vi.restoreAllMocks());

describe('Sfx before the first input', () => {
  it('has no audio context: it makes none until unlock() is called', () => {
    const { sfx, make } = sfxWith();
    expect(sfx.state).toBe('none');
    expect(sfx.running).toBe(false);
    sfx.play(cue('whoosh'));
    sfx.play(cue('chime'));
    expect(make).not.toHaveBeenCalled();
    expect(sfx.state).toBe('none');
  });

  it('still logs what it was asked to play, but makes no sound', () => {
    const { sfx, fake } = sfxWith();
    sfx.play(cue('whoosh', 0.7, 3));
    expect(sfx.log()).toEqual([{ name: 'whoosh', volume: 0.7, tick: 3 }]);
    expect(fake!.sources).toHaveLength(0);
  });
});

describe('unlock', () => {
  it('creates the context and resumes it', () => {
    const { sfx, fake, make } = sfxWith();
    sfx.unlock();
    expect(make).toHaveBeenCalledTimes(1);
    expect(fake!.resumeCalls).toBe(1);
    expect(sfx.state).toBe('running');
    expect(sfx.running).toBe(true);
  });

  it('can be called again and again: one context, resumed only while suspended', () => {
    const { sfx, fake, make } = sfxWith();
    sfx.unlock();
    sfx.unlock();
    sfx.unlock();
    expect(make).toHaveBeenCalledTimes(1);
    expect(fake!.resumeCalls).toBe(1);
  });

  it('resumes a context the browser suspended again', () => {
    const { sfx, fake } = sfxWith();
    sfx.unlock();
    fake!.state = 'suspended';
    sfx.unlock();
    expect(fake!.resumeCalls).toBe(2);
    expect(sfx.running).toBe(true);
  });

  it('keeps trying when the browser refuses to resume', () => {
    const fake = new FakeAudioContext();
    fake.resumesTo = 'suspended';
    const { sfx } = sfxWith(fake);
    sfx.unlock();
    expect(sfx.state).toBe('suspended');
    expect(sfx.running).toBe(false);
    sfx.unlock();
    expect(fake.resumeCalls).toBe(2);
  });

  it('is harmless where there is no Web Audio', () => {
    const { sfx } = sfxWith(null);
    sfx.unlock();
    sfx.play(cue());
    expect(sfx.state).toBe('none');
    expect(sfx.log()).toHaveLength(1);
  });

  it('is harmless when resume() is rejected', async () => {
    const fake = new FakeAudioContext();
    fake.resume = () => Promise.reject(new Error('blocked'));
    const { sfx } = sfxWith(fake);
    expect(() => sfx.unlock()).not.toThrow();
    await Promise.resolve(); // the rejection is handled, so nothing is left unhandled
  });
});

describe('playing', () => {
  it('makes the sound once the context is running', () => {
    const { sfx, fake } = sfxWith();
    sfx.unlock();
    sfx.play(cue('chime', 1));
    expect(fake!.sources.length).toBeGreaterThan(0);
    for (const source of fake!.sources) expect(source.startedAt).not.toBeNull();
  });

  it('plays each of the four sounds', () => {
    for (const name of ['whoosh', 'knock', 'chime', 'thud'] as const) {
      const { sfx, fake } = sfxWith();
      sfx.unlock();
      sfx.play(cue(name, 1));
      expect(fake!.sources.length, name).toBeGreaterThan(0);
    }
  });

  it('wakes a context that was suspended again, and skips that one sound', () => {
    const { sfx, fake } = sfxWith();
    sfx.unlock();
    fake!.state = 'suspended';
    sfx.play(cue());
    expect(fake!.resumeCalls).toBe(2);
    expect(fake!.sources).toHaveLength(0);
    expect(sfx.log()).toHaveLength(1);
  });

  it('never throws when a sound cannot be made: it reports the error and the game goes on', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { sfx, fake } = sfxWith();
    sfx.unlock();
    fake!.createOscillator = () => {
      throw new Error('no oscillator');
    };
    expect(() => sfx.play(cue('chime'))).not.toThrow();
    expect(error).toHaveBeenCalledTimes(1);
    expect(sfx.log()).toHaveLength(1);
  });
});

describe('the log', () => {
  it('lists the sounds in order with their volume and tick', () => {
    const { sfx } = sfxWith();
    sfx.play(cue('whoosh', 0.8, 0));
    sfx.play(cue('knock', 0.3, 50));
    sfx.play(cue('thud', 1, 120));
    expect(sfx.log()).toEqual([
      { name: 'whoosh', volume: 0.8, tick: 0 },
      { name: 'knock', volume: 0.3, tick: 50 },
      { name: 'thud', volume: 1, tick: 120 },
    ]);
  });

  it('is a copy: changing it changes nothing', () => {
    const { sfx } = sfxWith();
    sfx.play(cue());
    sfx.log()[0].name = 'thud';
    sfx.log().length = 0;
    expect(sfx.log().map((e) => e.name)).toEqual(['knock']);
  });

  it('keeps the newest 500 entries', () => {
    const { sfx } = sfxWith();
    for (let i = 0; i < 600; i++) sfx.play(cue('knock', 0.5, i));
    const log = sfx.log();
    expect(log).toHaveLength(500);
    expect(log[0].tick).toBe(100);
    expect(log.at(-1)!.tick).toBe(599);
  });
});

describe('unlockOnFirstInput', () => {
  /** A window that is just an event target, so the test can dispatch inputs. */
  const windowLike = () => new EventTarget();

  it('does nothing until the player clicks or presses a key', () => {
    const { sfx, make } = sfxWith();
    unlockOnFirstInput(sfx, windowLike());
    expect(make).not.toHaveBeenCalled();
    expect(sfx.state).toBe('none');
  });

  it.each(['keydown', 'pointerdown', 'pointerup'])('unlocks on %s', (type) => {
    const { sfx, make } = sfxWith();
    const target = windowLike();
    unlockOnFirstInput(sfx, target);
    target.dispatchEvent(new Event(type));
    expect(make).toHaveBeenCalledTimes(1);
    expect(sfx.running).toBe(true);
  });

  it('ignores events that are not clicks or key presses', () => {
    const { sfx, make } = sfxWith();
    const target = windowLike();
    unlockOnFirstInput(sfx, target);
    for (const type of ['mousemove', 'pointermove', 'keyup', 'wheel', 'focus']) {
      target.dispatchEvent(new Event(type));
    }
    expect(make).not.toHaveBeenCalled();
  });

  it('stops listening once the sound is running', () => {
    const { sfx, fake } = sfxWith();
    const target = windowLike();
    unlockOnFirstInput(sfx, target);
    target.dispatchEvent(new Event('keydown'));
    fake!.state = 'suspended';
    target.dispatchEvent(new Event('keydown')); // nobody is listening any more
    expect(fake!.resumeCalls).toBe(1);
  });

  it('keeps listening while the context is still not running', () => {
    const fake = new FakeAudioContext();
    fake.resumesTo = 'suspended';
    const { sfx } = sfxWith(fake);
    const target = windowLike();
    unlockOnFirstInput(sfx, target);
    target.dispatchEvent(new Event('keydown'));
    target.dispatchEvent(new Event('pointerdown'));
    expect(fake.resumeCalls).toBe(2);
    fake.resumesTo = 'running';
    target.dispatchEvent(new Event('keydown'));
    expect(sfx.running).toBe(true);
  });

  it('returns a function that stops listening at once', () => {
    const { sfx, make } = sfxWith();
    const target = windowLike();
    const stop = unlockOnFirstInput(sfx, target);
    stop();
    target.dispatchEvent(new Event('keydown'));
    expect(make).not.toHaveBeenCalled();
  });
});
