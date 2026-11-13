/** Read an integer query parameter, e.g. `?seed=42`. Returns undefined when absent or invalid. */
export function intParam(name: string): number | undefined {
  const raw = new URLSearchParams(window.location.search).get(name);
  if (raw === null || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isInteger(value) ? value : undefined;
}
