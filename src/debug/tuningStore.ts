import { DEFAULT_TUNING, type Tuning } from '../core/tuning';

/*
 * What the tuning panel remembers between page loads, as plain functions with no DOM: the edited
 * tuning values and the water lock, kept as one JSON text in localStorage. Only the values that
 * differ from `DEFAULT_TUNING` are kept, so after the human pastes a tuning into src/core/tuning.ts
 * the matching saved values stop counting as edits by themselves.
 */

export type TuningKey = keyof Tuning;

/** Every tuning field, in the order of `DEFAULT_TUNING`: the panel lists these. */
export const TUNING_KEYS = Object.keys(DEFAULT_TUNING) as TuningKey[];

export const isTuningKey = (key: unknown): key is TuningKey =>
  typeof key === 'string' && Object.hasOwn(DEFAULT_TUNING, key);

/** The part of `Storage` the panel uses, so a test can hand it a plain object. */
export type TuningStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Not the game's own save key: this one belongs to the developer tool. */
export const TUNING_STORAGE_KEY = 'flipper.debug.tuning';
const VERSION = 1;

export interface SavedTuning {
  /** The edited values only (each differs from the default). */
  values: Partial<Tuning>;
  /** The water level every bottle gets, or null for random levels. */
  waterLock: number | null;
}

export const emptySaved = (): SavedTuning => ({ values: {}, waterLock: null });

/** `values` without the entries that equal the default, and without anything that isn't a tuning number. */
export function editedValues(values: Partial<Tuning>): Partial<Tuning> {
  const kept: Partial<Tuning> = {};
  for (const key of TUNING_KEYS) {
    const value = values[key];
    if (typeof value === 'number' && Number.isFinite(value) && value !== DEFAULT_TUNING[key]) {
      kept[key] = value;
    }
  }
  return kept;
}

/**
 * Read the saved tuning. Anything missing or damaged (no storage, bad JSON, another version, an
 * unknown key, a value that isn't a finite number, a lock outside 0 to 1) is dropped rather than
 * trusted, so a stale or hand-edited entry can never stop the game from starting.
 */
export function loadSaved(storage: TuningStorage | null): SavedTuning {
  if (!storage) return emptySaved();
  let data: unknown;
  try {
    data = JSON.parse(storage.getItem(TUNING_STORAGE_KEY) ?? 'null');
  } catch {
    return emptySaved();
  }
  if (typeof data !== 'object' || data === null) return emptySaved();
  const record = data as Record<string, unknown>;
  if (record.version !== VERSION) return emptySaved();
  const values =
    typeof record.values === 'object' && record.values !== null
      ? editedValues(record.values as Partial<Tuning>)
      : {};
  const lock = record.waterLock;
  const waterLock = typeof lock === 'number' && lock >= 0 && lock <= 1 ? lock : null;
  return { values, waterLock };
}

/** Save the tuning (only its edits). With nothing to remember the entry is removed. A full or blocked storage is ignored. */
export function saveSaved(storage: TuningStorage | null, saved: SavedTuning): void {
  if (!storage) return;
  const values = editedValues(saved.values);
  try {
    if (Object.keys(values).length === 0 && saved.waterLock === null) {
      storage.removeItem(TUNING_STORAGE_KEY);
    } else {
      storage.setItem(
        TUNING_STORAGE_KEY,
        JSON.stringify({ version: VERSION, values, waterLock: saved.waterLock }),
      );
    }
  } catch {
    // The tool still works for this page load; it just won't remember.
  }
}

/** The whole tuning as JSON text, one field per line in the order of `src/core/tuning.ts`: paste it there. */
export function tuningJson(tuning: Tuning): string {
  const ordered: Partial<Tuning> = {};
  for (const key of TUNING_KEYS) ordered[key] = tuning[key];
  return JSON.stringify(ordered, null, 2);
}

/** What a typed field means: a finite number, or null for empty text and anything else (not applied). */
export function parseNumber(text: string): number | null {
  if (text.trim() === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/**
 * How much an arrow key moves a field: a tenth of the default's leading digit (9.2 moves by 0.1,
 * 0.013 by 0.001, 300 by 10), or 0.1 when the default is 0.
 */
export function stepFor(key: TuningKey): number {
  const base = Math.abs(DEFAULT_TUNING[key]);
  if (base === 0) return 0.1;
  const step = 10 ** (Math.floor(Math.log10(base)) - 1);
  return Number(step.toPrecision(1));
}
