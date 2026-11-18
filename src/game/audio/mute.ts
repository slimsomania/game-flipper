import { saveStore, type SaveStore } from '../storage';
import { sharedSfx, type Sfx } from './sfx';

/*
 * Mute, as the player sees it: one choice that silences every sound and is remembered. `Sfx` holds
 * the state and does the silencing; the save (`storage.ts`) keeps it between visits. These three
 * functions are the only places that connect the two, so the key, the button and the test hooks
 * all do the same thing. They default to the page's own `Sfx` and save; tests pass fakes.
 */

/** Make the sound match the saved choice (called once when the page starts). */
export function restoreMute(sfx: Sfx = sharedSfx(), store: SaveStore = saveStore()): void {
  sfx.setMuted(store.load().muted);
}

/** Mute or unmute, and remember the choice. Returns the new state. */
export function setMute(
  muted: boolean,
  sfx: Sfx = sharedSfx(),
  store: SaveStore = saveStore(),
): boolean {
  sfx.setMuted(muted);
  store.update({ muted });
  return muted;
}

/** Flip the sound on or off, and remember the choice. Returns the new state (true is muted). */
export function toggleMute(sfx: Sfx = sharedSfx(), store: SaveStore = saveStore()): boolean {
  return setMute(!sfx.muted, sfx, store);
}
