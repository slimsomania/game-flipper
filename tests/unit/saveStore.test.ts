import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SAVE_KEY,
  SaveStore,
  browserStorage,
  defaultSave,
  parseSave,
  type SaveStorage,
} from '../../src/game/storage';

/** A Map-backed Storage stand-in, so a test can look inside it. */
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

/** A Storage whose every call throws, like one that is blocked or full. */
const throwingStorage = (): SaveStorage => ({
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('full');
  },
});

describe('SAVE_KEY', () => {
  it('is one versioned key', () => {
    expect(SAVE_KEY).toBe('flipper.save.v1');
  });
});

describe('parseSave', () => {
  it('reads a saved best', () => {
    expect(parseSave(JSON.stringify({ version: 1, best: 12 }))).toEqual({ best: 12 });
    expect(parseSave(JSON.stringify({ version: 1, best: 0 }))).toEqual({ best: 0 });
  });

  it('gives the defaults for a missing entry', () => {
    expect(parseSave(null)).toEqual(defaultSave());
    expect(defaultSave()).toEqual({ best: 0 });
  });

  it('gives the defaults for text that is not valid JSON', () => {
    expect(parseSave('{"version":1,"best":')).toEqual(defaultSave());
    expect(parseSave('not json')).toEqual(defaultSave());
    expect(parseSave('')).toEqual(defaultSave());
  });

  it('gives the defaults for JSON that is not a save', () => {
    for (const text of ['null', '7', '"best"', '[]', 'true', '{}']) {
      expect(parseSave(text)).toEqual(defaultSave());
    }
  });

  it('gives the defaults for another version', () => {
    expect(parseSave(JSON.stringify({ version: 2, best: 12 }))).toEqual(defaultSave());
    expect(parseSave(JSON.stringify({ best: 12 }))).toEqual(defaultSave());
  });

  it('drops a best that is not a whole number of at least 0', () => {
    for (const best of [-1, 2.5, '12', null, true, {}, [3]]) {
      expect(parseSave(JSON.stringify({ version: 1, best }))).toEqual({ best: 0 });
    }
    // JSON has no NaN or Infinity, and a number too big to be exact is not trusted either.
    expect(parseSave('{"version":1,"best":1e999}')).toEqual({ best: 0 });
    expect(parseSave('{"version":1,"best":1e30}')).toEqual({ best: 0 });
  });
});

describe('SaveStore', () => {
  it('loads the defaults from an empty storage', () => {
    expect(new SaveStore(memoryStorage()).load()).toEqual({ best: 0 });
  });

  it('loads the defaults from an entry with invalid JSON', () => {
    const storage = memoryStorage({ [SAVE_KEY]: '{oops' });
    expect(new SaveStore(storage).load()).toEqual({ best: 0 });
  });

  it('loads the defaults, and never throws, from a Storage that throws', () => {
    const store = new SaveStore(throwingStorage());
    expect(store.load()).toEqual({ best: 0 });
    expect(() => store.update({ best: 5 })).not.toThrow();
    expect(() => store.recordRound(5)).not.toThrow();
  });

  it('works with no storage at all', () => {
    const store = new SaveStore(null);
    expect(store.load()).toEqual({ best: 0 });
    expect(() => store.update({ best: 5 })).not.toThrow();
  });

  it('writes one versioned entry that a new store reads back', () => {
    const storage = memoryStorage();
    new SaveStore(storage).update({ best: 12 });

    expect([...storage.data.keys()]).toEqual([SAVE_KEY]);
    expect(JSON.parse(storage.data.get(SAVE_KEY)!)).toEqual({ version: 1, best: 12 });
    expect(new SaveStore(storage).load()).toEqual({ best: 12 });
  });

  it('overwrites a damaged entry on the next save', () => {
    const storage = memoryStorage({ [SAVE_KEY]: 'garbage' });
    new SaveStore(storage).update({ best: 4 });
    expect(new SaveStore(storage).load()).toEqual({ best: 4 });
  });

  it('keeps the fields it was not asked to change', () => {
    const storage = memoryStorage({ [SAVE_KEY]: JSON.stringify({ version: 1, best: 9 }) });
    expect(new SaveStore(storage).update({})).toEqual({ best: 9 });
    expect(new SaveStore(storage).load()).toEqual({ best: 9 });
  });

  it('does not hand out its own copy of the save', () => {
    const store = new SaveStore(null);
    store.update({ best: 3 }).best = 99;
    expect(store.load()).toEqual({ best: 3 });
  });

  it('holds the best for the visit when the storage cannot be used', () => {
    for (const storage of [null, throwingStorage()]) {
      const store = new SaveStore(storage);
      expect(store.recordRound(3)).toEqual({ best: 3, isNewBest: true });
      expect(store.recordRound(2)).toEqual({ best: 3, isNewBest: false });
      expect(store.recordRound(12)).toEqual({ best: 12, isNewBest: true });
      expect(store.load()).toEqual({ best: 12 });
    }
  });

  describe('recordRound', () => {
    it('saves a round that beats the saved best and says so', () => {
      const storage = memoryStorage();
      const store = new SaveStore(storage);

      expect(store.recordRound(3)).toEqual({ best: 3, isNewBest: true });
      expect(JSON.parse(storage.data.get(SAVE_KEY)!)).toMatchObject({ best: 3 });
    });

    it('keeps the saved best for an equal or lower round', () => {
      const storage = memoryStorage();
      const store = new SaveStore(storage);
      store.recordRound(3);

      expect(store.recordRound(3)).toEqual({ best: 3, isNewBest: false });
      expect(store.recordRound(2)).toEqual({ best: 3, isNewBest: false });
      expect(store.recordRound(0)).toEqual({ best: 3, isNewBest: false });
      expect(JSON.parse(storage.data.get(SAVE_KEY)!)).toMatchObject({ best: 3 });
    });

    it('follows the whole story across visits: 3, then 2, then 12', () => {
      const storage = memoryStorage();
      expect(new SaveStore(storage).recordRound(3)).toEqual({ best: 3, isNewBest: true });
      expect(new SaveStore(storage).recordRound(2)).toEqual({ best: 3, isNewBest: false });
      expect(new SaveStore(storage).recordRound(12)).toEqual({ best: 12, isNewBest: true });
      expect(new SaveStore(storage).load()).toEqual({ best: 12 });
    });

    it('does not write when the round was not a new best', () => {
      const storage = memoryStorage({ [SAVE_KEY]: JSON.stringify({ version: 1, best: 8 }) });
      const setItem = vi.spyOn(storage, 'setItem');
      new SaveStore(storage).recordRound(8);
      expect(setItem).not.toHaveBeenCalled();
    });

    it('treats a damaged entry as no saved best', () => {
      const storage = memoryStorage({ [SAVE_KEY]: '{"version":1,"best":"lots"}' });
      expect(new SaveStore(storage).recordRound(1)).toEqual({ best: 1, isNewBest: true });
    });
  });
});

describe('browserStorage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is null where there is no window (Node)', () => {
    expect(browserStorage()).toBeNull();
  });

  it('is the window’s localStorage when it is there', () => {
    const localStorage = memoryStorage();
    vi.stubGlobal('window', { localStorage });
    expect(browserStorage()).toBe(localStorage);
  });

  it('is null, and does not throw, when asking for localStorage throws', () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    expect(() => browserStorage()).not.toThrow();
    expect(browserStorage()).toBeNull();
  });
});
