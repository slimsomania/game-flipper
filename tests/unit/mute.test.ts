import { describe, expect, it, vi } from 'vitest';
import { restoreMute, setMute, toggleMute } from '../../src/game/audio/mute';
import { MASTER_GAIN, Sfx } from '../../src/game/audio/sfx';
import type { SoundCue } from '../../src/game/audio/soundPlan';
import { SAVE_KEY, SaveStore, type SaveStorage } from '../../src/game/storage';
import { FakeAudioContext, asContext } from './fakeAudio';

const cue = (name: SoundCue['name'] = 'knock', tick = 1): SoundCue => ({ name, volume: 0.5, tick });

/** An Sfx on a fake context, already unlocked (running). */
function runningSfx() {
  const fake = new FakeAudioContext();
  const sfx = new Sfx(() => asContext(fake));
  sfx.unlock();
  return { sfx, fake };
}

/** The Sfx's master gain: the first gain node the context made. */
const masterGain = (fake: FakeAudioContext): number => fake.gains[0].gain.value;

function memoryStorage(initial: Record<string, string> = {}): SaveStorage & {
  data: Map<string, string>;
} {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

describe('Sfx mute', () => {
  it('starts with the sound on', () => {
    const { sfx } = runningSfx();
    expect(sfx.muted).toBe(false);
  });

  it('adds nothing to the log and makes no sound while muted', () => {
    const { sfx, fake } = runningSfx();
    sfx.setMuted(true);
    for (const name of ['whoosh', 'knock', 'chime', 'thud'] as const) sfx.play(cue(name));
    expect(sfx.log()).toEqual([]);
    expect(fake.sources).toHaveLength(0);
  });

  it('keeps nothing in the log for a muted cue even before the audio is unlocked', () => {
    const sfx = new Sfx(() => asContext(new FakeAudioContext()));
    sfx.setMuted(true);
    sfx.play(cue('whoosh'));
    expect(sfx.log()).toEqual([]);
  });

  it('brings the sounds back when unmuted, and keeps what was logged before', () => {
    const { sfx, fake } = runningSfx();
    sfx.play(cue('whoosh', 1));
    sfx.setMuted(true);
    sfx.play(cue('knock', 2));
    sfx.setMuted(false);
    sfx.play(cue('chime', 3));
    expect(sfx.log().map((entry) => entry.name)).toEqual(['whoosh', 'chime']);
    expect(fake.sources.length).toBeGreaterThan(0);
  });

  it('makes sound for the cue after unmuting, not just a log entry', () => {
    const { sfx, fake } = runningSfx();
    sfx.setMuted(true);
    sfx.setMuted(false);
    sfx.play(cue('thud'));
    expect(fake.sources.length).toBeGreaterThan(0);
  });

  it('takes the master gain to 0 at once, so a sound that is already playing is cut', () => {
    const { sfx, fake } = runningSfx();
    expect(masterGain(fake)).toBe(MASTER_GAIN);
    sfx.setMuted(true);
    expect(masterGain(fake)).toBe(0);
    sfx.setMuted(false);
    expect(masterGain(fake)).toBe(MASTER_GAIN);
  });

  it('starts a context that is created while muted at gain 0', () => {
    const fake = new FakeAudioContext();
    const sfx = new Sfx(() => asContext(fake));
    sfx.setMuted(true);
    sfx.unlock();
    expect(masterGain(fake)).toBe(0);
    sfx.setMuted(false);
    expect(masterGain(fake)).toBe(MASTER_GAIN);
  });

  it('still unlocks the context while muted, so unmuting needs no second click', () => {
    const fake = new FakeAudioContext();
    const sfx = new Sfx(() => asContext(fake));
    sfx.setMuted(true);
    sfx.unlock();
    expect(sfx.running).toBe(true);
  });

  it('tells its listeners about a change, not about setting the state it already has', () => {
    const { sfx } = runningSfx();
    const heard: boolean[] = [];
    sfx.onMutedChange((muted) => heard.push(muted));
    sfx.setMuted(false);
    sfx.setMuted(true);
    sfx.setMuted(true);
    sfx.setMuted(false);
    expect(heard).toEqual([true, false]);
  });

  it('stops telling a listener that unsubscribed', () => {
    const { sfx } = runningSfx();
    const listener = vi.fn();
    const stop = sfx.onMutedChange(listener);
    stop();
    sfx.setMuted(true);
    expect(listener).not.toHaveBeenCalled();
  });

  it('lets a listener unsubscribe while it is being told', () => {
    const { sfx } = runningSfx();
    const second = vi.fn();
    const stopFirst = sfx.onMutedChange(() => stopFirst());
    sfx.onMutedChange(second);
    sfx.setMuted(true);
    expect(second).toHaveBeenCalledWith(true);
  });

  it('is harmless where there is no Web Audio', () => {
    const sfx = new Sfx(() => null);
    sfx.unlock();
    expect(() => sfx.setMuted(true)).not.toThrow();
    expect(sfx.muted).toBe(true);
  });
});

describe('toggleMute, setMute and restoreMute', () => {
  it('toggleMute flips the sound and saves the choice each time', () => {
    const storage = memoryStorage();
    const store = new SaveStore(storage);
    const { sfx } = runningSfx();

    expect(toggleMute(sfx, store)).toBe(true);
    expect(sfx.muted).toBe(true);
    expect(JSON.parse(storage.data.get(SAVE_KEY)!)).toMatchObject({ muted: true });

    expect(toggleMute(sfx, store)).toBe(false);
    expect(sfx.muted).toBe(false);
    expect(JSON.parse(storage.data.get(SAVE_KEY)!)).toMatchObject({ muted: false });
  });

  it('setMute sets the state it is given, however often, and saves it', () => {
    const storage = memoryStorage();
    const store = new SaveStore(storage);
    const { sfx } = runningSfx();
    expect(setMute(true, sfx, store)).toBe(true);
    expect(setMute(true, sfx, store)).toBe(true);
    expect(sfx.muted).toBe(true);
    expect(store.load().muted).toBe(true);
    expect(setMute(false, sfx, store)).toBe(false);
    expect(sfx.muted).toBe(false);
    expect(store.load().muted).toBe(false);
  });

  it('keeps the best score when the choice is saved', () => {
    const store = new SaveStore(memoryStorage());
    store.recordRound(7);
    toggleMute(runningSfx().sfx, store);
    expect(store.load()).toEqual({ best: 7, muted: true });
  });

  it('restoreMute makes a new page start muted when the last visit ended muted', () => {
    const storage = memoryStorage();
    toggleMute(runningSfx().sfx, new SaveStore(storage));

    const nextVisit = runningSfx().sfx;
    expect(nextVisit.muted).toBe(false);
    restoreMute(nextVisit, new SaveStore(storage));
    expect(nextVisit.muted).toBe(true);
  });

  it('restoreMute leaves the sound on for a first visit and for a damaged entry', () => {
    for (const storage of [memoryStorage(), memoryStorage({ [SAVE_KEY]: '{oops' })]) {
      const { sfx } = runningSfx();
      restoreMute(sfx, new SaveStore(storage));
      expect(sfx.muted).toBe(false);
    }
  });

  it('restoreMute unmutes an Sfx when the save says the sound is on', () => {
    const storage = memoryStorage({
      [SAVE_KEY]: JSON.stringify({ version: 1, best: 0, muted: false }),
    });
    const { sfx } = runningSfx();
    sfx.setMuted(true);
    restoreMute(sfx, new SaveStore(storage));
    expect(sfx.muted).toBe(false);
  });

  it('works, and keeps the choice for the visit, with no usable storage', () => {
    const store = new SaveStore(null);
    const { sfx } = runningSfx();
    expect(() => toggleMute(sfx, store)).not.toThrow();
    expect(sfx.muted).toBe(true);
    expect(store.load().muted).toBe(true);
  });
});
