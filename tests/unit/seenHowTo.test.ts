import { describe, expect, it } from 'vitest';
import { SAVE_KEY, SaveStore, parseSave, type SaveStorage } from '../../src/game/storage';

function memoryStorage(): SaveStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

describe('seenHowTo in the save', () => {
  const read = (seenHowTo: unknown) =>
    parseSave(JSON.stringify({ version: 1, best: 5, muted: true, seenHowTo }));

  it('reads true and false', () => {
    expect(read(true)).toEqual({ best: 5, muted: true, seenHowTo: true });
    expect(read(false)).toEqual({ best: 5, muted: true, seenHowTo: false });
  });

  it('gives false for a missing or invalid value and keeps the other fields', () => {
    for (const bad of [undefined, 1, 'true', null, {}]) {
      expect(read(bad)).toEqual({ best: 5, muted: true, seenHowTo: false });
    }
  });

  it('update({ seenHowTo: true }) keeps the best and the mute setting', () => {
    const storage = memoryStorage();
    const store = new SaveStore(storage);
    store.update({ best: 7, muted: true });
    expect(store.update({ seenHowTo: true })).toEqual({ best: 7, muted: true, seenHowTo: true });
    expect(parseSave(storage.getItem(SAVE_KEY))).toEqual({
      best: 7,
      muted: true,
      seenHowTo: true,
    });
  });

  it('holds for the visit when the storage cannot be written', () => {
    const store = new SaveStore({
      getItem: () => null,
      setItem: () => {
        throw new Error('full');
      },
    });
    store.update({ seenHowTo: true });
    expect(store.load().seenHowTo).toBe(true);
  });
});
