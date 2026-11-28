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

/**
 * A storage that can be read but whose writes throw while `writable.on` is false, like one that is
 * full or write-blocked. Once `writable.on` is true it behaves like the plain memory storage.
 */
function readOnlyStorage(initial: Record<string, string> = {}) {
  const storage = memoryStorage(initial);
  const writable = { on: false };
  const write = storage.setItem;
  storage.setItem = (key, value) => {
    if (!writable.on) throw new DOMException('full', 'QuotaExceededError');
    write(key, value);
  };
  return { storage, writable };
}

const entry = (fields: object) => JSON.stringify({ version: 1, ...fields });

describe('SAVE_KEY', () => {
  it('is one versioned key', () => {
    expect(SAVE_KEY).toBe('flipper.save.v1');
  });
});

describe('parseSave', () => {
  it('reads a saved best', () => {
    expect(parseSave(JSON.stringify({ version: 1, best: 12 }))).toEqual({
      best: 12,
      muted: false,
      seenHowTo: false,
    });
    expect(parseSave(JSON.stringify({ version: 1, best: 0 }))).toEqual({
      best: 0,
      muted: false,
      seenHowTo: false,
    });
  });

  it('gives the defaults for a missing entry', () => {
    expect(parseSave(null)).toEqual(defaultSave());
    expect(defaultSave()).toEqual({ best: 0, muted: false, seenHowTo: false });
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
      expect(parseSave(JSON.stringify({ version: 1, best }))).toEqual({
        best: 0,
        muted: false,
        seenHowTo: false,
      });
    }
    // JSON has no NaN or Infinity, and a number too big to be exact is not trusted either.
    expect(parseSave('{"version":1,"best":1e999}')).toEqual({
      best: 0,
      muted: false,
      seenHowTo: false,
    });
    expect(parseSave('{"version":1,"best":1e30}')).toEqual({
      best: 0,
      muted: false,
      seenHowTo: false,
    });
  });

  it('reads the mute setting, and an entry saved before it existed is not muted', () => {
    const read = (entry: object) => parseSave(JSON.stringify({ version: 1, ...entry }));
    expect(read({ best: 4, muted: true, seenHowTo: false })).toEqual({
      best: 4,
      muted: true,
      seenHowTo: false,
    });
    expect(read({ best: 4, muted: false, seenHowTo: false })).toEqual({
      best: 4,
      muted: false,
      seenHowTo: false,
    });
    expect(read({ muted: true })).toEqual({ best: 0, muted: true, seenHowTo: false });
    expect(read({ best: 4 })).toEqual({ best: 4, muted: false, seenHowTo: false });
  });

  it('drops a mute setting that is not true or false, and keeps the rest', () => {
    for (const muted of [1, 0, 'true', 'false', null, {}, [true]]) {
      expect(parseSave(JSON.stringify({ version: 1, best: 6, muted }))).toEqual({
        best: 6,
        muted: false,
        seenHowTo: false,
      });
    }
  });

  it('keeps a good mute setting beside a damaged best, and the other way round', () => {
    expect(parseSave('{"version":1,"best":"lots","muted":true}')).toEqual({
      best: 0,
      muted: true,
      seenHowTo: false,
    });
    expect(parseSave('{"version":1,"best":8,"muted":"yes"}')).toEqual({
      best: 8,
      muted: false,
      seenHowTo: false,
    });
  });
});

describe('SaveStore', () => {
  it('loads the defaults from an empty storage', () => {
    expect(new SaveStore(memoryStorage()).load()).toEqual({
      best: 0,
      muted: false,
      seenHowTo: false,
    });
  });

  it('loads the defaults from an entry with invalid JSON', () => {
    const storage = memoryStorage({ [SAVE_KEY]: '{oops' });
    expect(new SaveStore(storage).load()).toEqual({ best: 0, muted: false, seenHowTo: false });
  });

  it('loads the defaults, and never throws, from a Storage that throws', () => {
    const store = new SaveStore(throwingStorage());
    expect(store.load()).toEqual({ best: 0, muted: false, seenHowTo: false });
    expect(() => store.update({ best: 5 })).not.toThrow();
    expect(() => store.recordRound(5)).not.toThrow();
  });

  it('works with no storage at all', () => {
    const store = new SaveStore(null);
    expect(store.load()).toEqual({ best: 0, muted: false, seenHowTo: false });
    expect(() => store.update({ best: 5 })).not.toThrow();
  });

  it('writes one versioned entry that a new store reads back', () => {
    const storage = memoryStorage();
    new SaveStore(storage).update({ best: 12 });

    expect([...storage.data.keys()]).toEqual([SAVE_KEY]);
    expect(JSON.parse(storage.data.get(SAVE_KEY)!)).toEqual({
      version: 1,
      best: 12,
      muted: false,
      seenHowTo: false,
    });
    expect(new SaveStore(storage).load()).toEqual({ best: 12, muted: false, seenHowTo: false });
  });

  it('overwrites a damaged entry on the next save', () => {
    const storage = memoryStorage({ [SAVE_KEY]: 'garbage' });
    new SaveStore(storage).update({ best: 4 });
    expect(new SaveStore(storage).load()).toEqual({ best: 4, muted: false, seenHowTo: false });
  });

  it('keeps the fields it was not asked to change', () => {
    const storage = memoryStorage({ [SAVE_KEY]: JSON.stringify({ version: 1, best: 9 }) });
    expect(new SaveStore(storage).update({})).toEqual({ best: 9, muted: false, seenHowTo: false });
    expect(new SaveStore(storage).load()).toEqual({ best: 9, muted: false, seenHowTo: false });
  });

  it('does not hand out its own copy of the save', () => {
    const store = new SaveStore(null);
    store.update({ best: 3 }).best = 99;
    expect(store.load()).toEqual({ best: 3, muted: false, seenHowTo: false });
  });

  it('holds the best for the visit when the storage cannot be used', () => {
    for (const storage of [null, throwingStorage()]) {
      const store = new SaveStore(storage);
      expect(store.recordRound(3)).toEqual({ best: 3, isNewBest: true });
      expect(store.recordRound(2)).toEqual({ best: 3, isNewBest: false });
      expect(store.recordRound(12)).toEqual({ best: 12, isNewBest: true });
      expect(store.load()).toEqual({ best: 12, muted: false, seenHowTo: false });
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
      expect(new SaveStore(storage).load()).toEqual({ best: 12, muted: false, seenHowTo: false });
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

describe('SaveStore and the mute setting', () => {
  it('saves it in the same entry and a new store reads it back', () => {
    const storage = memoryStorage();
    new SaveStore(storage).update({ muted: true });

    expect([...storage.data.keys()]).toEqual([SAVE_KEY]);
    expect(JSON.parse(storage.data.get(SAVE_KEY)!)).toEqual({
      version: 1,
      best: 0,
      muted: true,
      seenHowTo: false,
    });
    expect(new SaveStore(storage).load()).toEqual({ best: 0, muted: true, seenHowTo: false });
  });

  it('and the best score do not overwrite each other', () => {
    const storage = memoryStorage();
    const store = new SaveStore(storage);
    store.update({ muted: true });
    expect(store.recordRound(5)).toEqual({ best: 5, isNewBest: true });
    expect(new SaveStore(storage).load()).toEqual({ best: 5, muted: true, seenHowTo: false });

    store.update({ muted: false });
    expect(new SaveStore(storage).load()).toEqual({ best: 5, muted: false, seenHowTo: false });
  });

  it('holds for the visit when the storage cannot be used', () => {
    for (const storage of [null, throwingStorage()]) {
      const store = new SaveStore(storage);
      expect(() => store.update({ muted: true })).not.toThrow();
      expect(store.load().muted).toBe(true);
    }
  });
});

describe('SaveStore when the storage can be read but not written', () => {
  const starts: [string, Record<string, string>][] = [
    ['empty', {}],
    ['holding an older best of 3', { [SAVE_KEY]: entry({ best: 3 }) }],
  ];

  for (const [name, initial] of starts) {
    describe(name, () => {
      it('keeps the best for the visit, and never throws', () => {
        const { storage } = readOnlyStorage(initial);
        const store = new SaveStore(storage);

        expect(() => store.recordRound(8)).not.toThrow();
        expect(store.load().best).toBe(8);
        expect(store.recordRound(8)).toEqual({ best: 8, isNewBest: false });
        expect(store.recordRound(5)).toEqual({ best: 8, isNewBest: false });
        expect(store.load()).toEqual({ best: 8, muted: false, seenHowTo: false });
      });

      it('reports the new best of 8 once, then a later better round again', () => {
        const store = new SaveStore(readOnlyStorage(initial).storage);

        expect(store.recordRound(8)).toEqual({ best: 8, isNewBest: true });
        expect(store.recordRound(9)).toEqual({ best: 9, isNewBest: true });
        expect(store.load().best).toBe(9);
      });

      it('keeps the best of 8 when the mute setting changes, and holds the mute', () => {
        const store = new SaveStore(readOnlyStorage(initial).storage);
        store.recordRound(8);

        expect(() => store.update({ muted: true })).not.toThrow();
        expect(store.load()).toEqual({ best: 8, muted: true, seenHowTo: false });
        expect(store.update({ muted: false })).toEqual({ best: 8, muted: false, seenHowTo: false });
        expect(store.load()).toEqual({ best: 8, muted: false, seenHowTo: false });
      });

      it('holds the mute even when it is changed before any round', () => {
        const store = new SaveStore(readOnlyStorage(initial).storage);
        store.update({ muted: true });
        expect(store.load().muted).toBe(true);
        expect(store.recordRound(5)).toEqual({ best: 5, isNewBest: true });
        expect(store.load()).toEqual({ best: 5, muted: true, seenHowTo: false });
      });
    });
  }

  it('does not change what the storage holds', () => {
    const { storage } = readOnlyStorage({ [SAVE_KEY]: entry({ best: 3 }) });
    const store = new SaveStore(storage);
    store.recordRound(8);
    store.update({ muted: true });
    expect(storage.data.get(SAVE_KEY)).toBe(entry({ best: 3 }));
  });

  it('keeps the higher best when another tab saved a better one', () => {
    const { storage } = readOnlyStorage({ [SAVE_KEY]: entry({ best: 3 }) });
    const store = new SaveStore(storage);
    store.recordRound(8);

    // Another tab, which can write, saves 20: the stored entry is now higher than what we hold.
    storage.data.set(SAVE_KEY, entry({ best: 20 }));
    expect(store.load().best).toBe(20);
    expect(store.recordRound(12)).toEqual({ best: 20, isNewBest: false });
    expect(store.recordRound(25)).toEqual({ best: 25, isNewBest: true });
    expect(store.load().best).toBe(25);
  });

  it('writes the in-memory values at the next write once writing works again', () => {
    const { storage, writable } = readOnlyStorage({ [SAVE_KEY]: entry({ best: 3 }) });
    const store = new SaveStore(storage);
    store.recordRound(8);
    expect(storage.data.get(SAVE_KEY)).toBe(entry({ best: 3 }));

    writable.on = true;
    // Reading does not write: the stored entry still has the old best until something is saved.
    expect(store.load().best).toBe(8);
    expect(storage.data.get(SAVE_KEY)).toBe(entry({ best: 3 }));

    expect(store.update({ muted: true })).toEqual({ best: 8, muted: true, seenHowTo: false });
    expect(JSON.parse(storage.data.get(SAVE_KEY)!)).toEqual({
      version: 1,
      best: 8,
      muted: true,
      seenHowTo: false,
    });
    expect(new SaveStore(storage).load()).toEqual({ best: 8, muted: true, seenHowTo: false });
  });

  it('a round that is a new best after writing works again is written with its best', () => {
    const { storage, writable } = readOnlyStorage();
    const store = new SaveStore(storage);
    store.recordRound(8);

    writable.on = true;
    expect(store.recordRound(9)).toEqual({ best: 9, isNewBest: true });
    expect(JSON.parse(storage.data.get(SAVE_KEY)!)).toMatchObject({ best: 9 });
  });

  it('reads the entry afresh again after a write has worked', () => {
    const { storage, writable } = readOnlyStorage();
    const store = new SaveStore(storage);
    store.recordRound(8);
    writable.on = true;
    store.update({ muted: true });

    // A value another tab wrote, even a lower best and another mute setting, is seen as it is.
    storage.data.set(SAVE_KEY, entry({ best: 2, muted: false, seenHowTo: false }));
    expect(store.load()).toEqual({ best: 2, muted: false, seenHowTo: false });
    storage.data.set(SAVE_KEY, entry({ best: 40, muted: true, seenHowTo: false }));
    expect(store.load()).toEqual({ best: 40, muted: true, seenHowTo: false });
  });

  it('goes back to using the fallback if writing fails again', () => {
    const { storage, writable } = readOnlyStorage();
    const store = new SaveStore(storage);
    store.recordRound(8);
    writable.on = true;
    store.update({ muted: true });

    writable.on = false;
    expect(() => store.recordRound(11)).not.toThrow();
    expect(store.load()).toEqual({ best: 11, muted: true, seenHowTo: false });
    expect(store.recordRound(11).isNewBest).toBe(false);
  });

  it('is one store per visit: a new store starts from what the storage holds', () => {
    const { storage } = readOnlyStorage({ [SAVE_KEY]: entry({ best: 3 }) });
    new SaveStore(storage).recordRound(8);
    expect(new SaveStore(storage).load().best).toBe(3);
  });

  it('never throws when the storage can be written but not read', () => {
    const data = new Map<string, string>();
    const store = new SaveStore({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: (key, value) => void data.set(key, value),
    });
    expect(store.recordRound(4)).toEqual({ best: 4, isNewBest: true });
    expect(store.recordRound(3)).toEqual({ best: 4, isNewBest: false });
    expect(store.load()).toEqual({ best: 4, muted: false, seenHowTo: false });
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
