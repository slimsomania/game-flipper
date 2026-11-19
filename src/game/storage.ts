import { updateBest, type BestUpdate } from '../core/round';

/*
 * What the game remembers between visits: one versioned JSON entry in localStorage. It holds the
 * best round score and the mute setting. The save is a convenience, never
 * a requirement: a missing, damaged or blocked storage gives the defaults, and nothing in here
 * throws, so the game starts and plays the same with or without it.
 */

/** The part of `Storage` the save uses, so a test can hand it a plain object. */
export type SaveStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** The game's one save entry. The version is in the key, and in the entry too. */
export const SAVE_KEY = 'flipper.save.v1';
const VERSION = 1;

export interface SaveData {
  /** The best round score (a whole number of points, 0 before any round scored). */
  best: number;
  /** True when the player turned the sound off (false, sound on, by default). */
  muted: boolean;
}

export const defaultSave = (): SaveData => ({ best: 0, muted: false });

/** Read a save from the entry's text; every field that is missing or not valid is its default. */
export function parseSave(text: string | null): SaveData {
  const save = defaultSave();
  if (text === null) return save;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return save;
  }
  if (typeof data !== 'object' || data === null) return save;
  const record = data as Record<string, unknown>;
  if (record.version !== VERSION) return save;
  const { best, muted } = record;
  if (typeof best === 'number' && Number.isSafeInteger(best) && best >= 0) save.best = best;
  if (typeof muted === 'boolean') save.muted = muted;
  return save;
}

/** The browser's localStorage, or null where even asking for it throws (blocked cookies). */
export function browserStorage(): SaveStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The save, kept in `storage` (null for none). With working storage `load()` reads the entry afresh
 * every time, so another tab's progress is seen. The store also remembers what it last wrote, so the
 * best score and the mute choice still hold for the rest of the visit when the storage can't be used:
 * - there is none, or `getItem` throws: `load()` gives what the store last wrote;
 * - it can be read but not written (full, or write-blocked: `setItem` throws): until a write
 *   succeeds again, `load()` gives what the store last wrote, except that the best is the higher of
 *   that and the stored one, so progress another tab saved is not lost.
 */
export class SaveStore {
  private lastSaved: SaveData = defaultSave();
  /** True from a write that threw until the next one that works: the stored entry is then stale. */
  private writeFailed = false;

  constructor(private readonly storage: SaveStorage | null) {}

  load(): SaveData {
    if (!this.storage) return { ...this.lastSaved };
    let stored: SaveData;
    try {
      stored = parseSave(this.storage.getItem(SAVE_KEY));
    } catch {
      return { ...this.lastSaved };
    }
    if (!this.writeFailed) return stored;
    return { best: Math.max(this.lastSaved.best, stored.best), muted: this.lastSaved.muted };
  }

  /** Change some fields of the save, keeping the rest. Returns the save as it now is. */
  update(changes: Partial<SaveData>): SaveData {
    const save = { ...this.load(), ...changes };
    this.lastSaved = save;
    if (this.storage) {
      try {
        this.storage.setItem(SAVE_KEY, JSON.stringify({ version: VERSION, ...save }));
        this.writeFailed = false;
      } catch {
        // Full or blocked: the game goes on, and what was written holds until the page is closed.
        this.writeFailed = true;
      }
    }
    return { ...save };
  }

  /** A round ended with `score` points: keep it if it is the best so far, and say whether it is. */
  recordRound(score: number): BestUpdate {
    const result = updateBest(this.load().best, score);
    if (result.isNewBest) this.update({ best: result.best });
    return result;
  }
}

let shared: SaveStore | null = null;

/** The game's save, in the browser's localStorage. */
export function saveStore(): SaveStore {
  shared ??= new SaveStore(browserStorage());
  return shared;
}
