import type { Simulation } from '../core/simulation';

/*
 * The simulation the game scene is running, for the developer tools: the test hooks and the tuning
 * panel both reach the game through it. The scene registers its simulation when it creates it and
 * clears it when it shuts down; nothing here keeps the game alive or changes it.
 */

let current: Simulation | null = null;

/** Called by the game scene when it creates (or drops) its simulation. */
export function registerSimulation(sim: Simulation | null): void {
  current = sim;
}

/** The running simulation, or null when no game scene is running. */
export function currentSimulation(): Simulation | null {
  return current;
}
