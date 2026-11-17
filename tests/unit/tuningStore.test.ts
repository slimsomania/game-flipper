import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../src/core/tuning';
import { isPanelEnabled } from '../../src/debug/debugMode';
import {
  TUNING_KEYS,
  TUNING_STORAGE_KEY,
  editedValues,
  isTuningKey,
  loadSaved,
  parseNumber,
  saveSaved,
  stepFor,
  tuningJson,
  type TuningStorage,
} from '../../src/debug/tuningStore';
import { fakeStorage } from './tuningHelpers';

describe('the tuning keys', () => {
  it('are exactly the fields of the default tuning, in its order', () => {
    expect(TUNING_KEYS).toEqual(Object.keys(DEFAULT_TUNING));
    expect(TUNING_KEYS.length).toBeGreaterThan(30);
  });

  it('isTuningKey accepts only real fields (not inherited names or other types)', () => {
    expect(isTuningKey('throwLinearImpulse')).toBe(true);
    expect(isTuningKey('toString')).toBe(false);
    expect(isTuningKey('__proto__')).toBe(false);
    expect(isTuningKey('nope')).toBe(false);
    expect(isTuningKey(3)).toBe(false);
  });
});

describe('editedValues', () => {
  it('keeps only finite numbers that differ from the defaults, for known keys', () => {
    const kept = editedValues({
      throwLinearImpulse: 12,
      throwAngularImpulse: DEFAULT_TUNING.throwAngularImpulse,
      waterMin: Number.NaN,
      waterMax: Number.POSITIVE_INFINITY,
      ...({ madeUp: 5, shellDensity: '2' } as object),
    });
    expect(kept).toEqual({ throwLinearImpulse: 12 });
  });
});

describe('saving and loading', () => {
  it('round-trips the edits and the water lock', () => {
    const storage = fakeStorage();
    saveSaved(storage, { values: { throwLinearImpulse: 12, bottleFriction: 0.2 }, waterLock: 0.5 });
    expect(loadSaved(storage)).toEqual({
      values: { throwLinearImpulse: 12, bottleFriction: 0.2 },
      waterLock: 0.5,
    });
  });

  it('keeps nothing for no edits and no lock (the entry is removed)', () => {
    const storage = fakeStorage();
    saveSaved(storage, { values: { throwLinearImpulse: 12 }, waterLock: null });
    expect(storage.data.has(TUNING_STORAGE_KEY)).toBe(true);
    saveSaved(storage, { values: {}, waterLock: null });
    expect(storage.data.has(TUNING_STORAGE_KEY)).toBe(false);
    expect(loadSaved(storage)).toEqual({ values: {}, waterLock: null });
  });

  it('saves only what differs from the defaults', () => {
    const storage = fakeStorage();
    saveSaved(storage, {
      values: { throwLinearImpulse: 12, throwAngularImpulse: DEFAULT_TUNING.throwAngularImpulse },
      waterLock: null,
    });
    const text = storage.data.get(TUNING_STORAGE_KEY)!;
    expect(JSON.parse(text).values).toEqual({ throwLinearImpulse: 12 });
  });

  it('drops a value that has become the default (after the human pasted it into tuning.ts)', () => {
    const storage = fakeStorage({
      [TUNING_STORAGE_KEY]: JSON.stringify({
        version: 1,
        values: { shellDensity: DEFAULT_TUNING.shellDensity, bottleFriction: 0.2 },
        waterLock: null,
      }),
    });
    expect(loadSaved(storage).values).toEqual({ bottleFriction: 0.2 });
  });

  it.each([
    ['nothing saved', undefined],
    ['text that is not JSON', '{oops'],
    ['JSON null', 'null'],
    ['a number', '5'],
    ['another version', JSON.stringify({ version: 2, values: { bottleFriction: 0.2 } })],
    ['no version', JSON.stringify({ values: { bottleFriction: 0.2 } })],
  ])('loads the empty state from %s', (_name, text) => {
    const storage = fakeStorage(text === undefined ? {} : { [TUNING_STORAGE_KEY]: text });
    expect(loadSaved(storage)).toEqual({ values: {}, waterLock: null });
  });

  it('drops unknown keys, values that are not numbers and a lock outside 0 to 1', () => {
    const storage = fakeStorage({
      [TUNING_STORAGE_KEY]: JSON.stringify({
        version: 1,
        values: { bottleFriction: 0.2, madeUp: 3, shellDensity: 'heavy', waterMin: null },
        waterLock: 7,
      }),
    });
    expect(loadSaved(storage)).toEqual({ values: { bottleFriction: 0.2 }, waterLock: null });
  });

  it('works with no storage at all, and survives a storage that throws', () => {
    expect(loadSaved(null)).toEqual({ values: {}, waterLock: null });
    expect(() => saveSaved(null, { values: { shellDensity: 2 }, waterLock: null })).not.toThrow();
    const broken: TuningStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => saveSaved(broken, { values: { shellDensity: 2 }, waterLock: 0.5 })).not.toThrow();
    expect(() => saveSaved(broken, { values: {}, waterLock: null })).not.toThrow();
    expect(() => loadSaved(broken)).not.toThrow();
  });
});

describe('tuningJson', () => {
  it('parses back to the full tuning it was given', () => {
    const tuning = { ...DEFAULT_TUNING, throwLinearImpulse: 11.5 };
    expect(JSON.parse(tuningJson(tuning))).toEqual(tuning);
  });

  it('lists every key, one per line, in the order of the tuning module', () => {
    const lines = tuningJson(DEFAULT_TUNING).split('\n');
    expect(lines).toHaveLength(TUNING_KEYS.length + 2);
    expect(lines.slice(1, -1).map((line) => line.trim().split('"')[1])).toEqual(TUNING_KEYS);
  });
});

describe('parseNumber', () => {
  it('reads numbers and refuses everything else', () => {
    expect(parseNumber('12')).toBe(12);
    expect(parseNumber(' 0.013 ')).toBe(0.013);
    expect(parseNumber('-3')).toBe(-3);
    expect(parseNumber('1e-3')).toBe(0.001);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('   ')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('1.2.3')).toBeNull();
    expect(parseNumber('Infinity')).toBeNull();
    expect(parseNumber('NaN')).toBeNull();
  });
});

describe('stepFor', () => {
  it('is a tenth of the default’s leading digit, so an arrow key is a fine move', () => {
    expect(stepFor('throwLinearImpulse')).toBe(0.1); // 9.2
    expect(stepFor('throwSpinGrowth')).toBe(0.001); // 0.013
    expect(stepFor('pushFullDistance')).toBe(10); // 300
    expect(stepFor('powerStart')).toBe(1); // 50
    expect(stepFor('bottleRestitution')).toBe(0.001); // 0.04
  });

  it('is positive and finite for every key', () => {
    for (const key of TUNING_KEYS) {
      const step = stepFor(key);
      expect(step).toBeGreaterThan(0);
      expect(Number.isFinite(step)).toBe(true);
    }
  });
});

describe('isPanelEnabled', () => {
  it('is on in a dev build, and in any build with ?debug', () => {
    expect(isPanelEnabled(true, '')).toBe(true);
    expect(isPanelEnabled(false, '?debug')).toBe(true);
    expect(isPanelEnabled(false, '?seed=7&debug')).toBe(true);
    expect(isPanelEnabled(false, '?debug=1')).toBe(true);
  });

  it('is off in a production build without it, even with ?testhooks', () => {
    expect(isPanelEnabled(false, '')).toBe(false);
    expect(isPanelEnabled(false, '?testhooks')).toBe(false);
    expect(isPanelEnabled(false, '?seed=7')).toBe(false);
    expect(isPanelEnabled(false, '?debugger')).toBe(false);
  });
});
