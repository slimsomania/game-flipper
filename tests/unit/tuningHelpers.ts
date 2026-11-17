/** Helpers for the tuning panel's unit tests. Not a test file, so Vitest doesn't collect it. */
import type { TuningStorage } from '../../src/debug/tuningStore';

/** A storage kept in a Map, so a test can look inside it and "reload" by making a second control. */
export function fakeStorage(
  initial: Record<string, string> = {},
): TuningStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}
