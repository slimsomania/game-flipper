/*
 * Helpers for the sound e2e tests (`sound.spec.ts`): watch the page's AudioContexts, read the log of
 * sounds the game played, and catch audio problems the console reports.
 */
import type { Page } from '@playwright/test';
import { settleInput } from './helpers';

interface WindowWithContexts {
  __contexts: AudioContext[];
}

/**
 * Record every AudioContext the page makes, before any of its scripts run. Call it before
 * `openGame`. This watches the browser, not the game's own hooks, so it also sees a context made by
 * anything else (Phaser's sound manager, for one).
 */
export async function trackAudioContexts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const made: AudioContext[] = [];
    (window as unknown as WindowWithContexts).__contexts = made;
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      constructor(...args: ConstructorParameters<typeof AudioContext>) {
        super(...args);
        made.push(this);
      }
    };
  });
}

/** The state of every AudioContext made so far ('running', 'suspended', 'closed'). */
export async function contextStates(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    (window as unknown as WindowWithContexts).__contexts.map((c) => c.state),
  );
}

/**
 * Console errors and warnings that mention audio or sound, as they happen. Start it before
 * `openGame` and assert the list is empty at the end of the test.
 */
export function watchAudioConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    const type = message.type();
    if ((type === 'error' || type === 'warning') && /audio|sound/i.test(message.text())) {
      problems.push(`${type}: ${message.text()}`);
    }
  });
  return problems;
}

export interface LoggedSound {
  name: string;
  volume: number;
  tick: number;
}

/**
 * The sounds the game has played (`window.__FLIPPER__.sounds()`), read after the game has had a
 * frame to drain the simulation's latest events, like `visibleTexts`.
 */
export async function sounds(page: Page): Promise<LoggedSound[]> {
  await settleInput(page);
  return page.evaluate(() => window.__FLIPPER__!.sounds());
}

/** Just the names of the sounds played, in order. */
export async function soundNames(page: Page): Promise<string[]> {
  return (await sounds(page)).map((sound) => sound.name);
}
