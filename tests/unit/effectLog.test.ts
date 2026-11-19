import { describe, expect, it } from 'vitest';
import { EffectLog, sharedEffectLog } from '../../src/game/effects/effectLog';

describe('EffectLog', () => {
  it('starts empty and lists what was recorded, oldest first', () => {
    const log = new EffectLog();
    expect(log.log()).toEqual([]);
    log.record({ name: 'shake', intensity: 3.5, tick: 20 });
    log.record({ name: 'pop', intensity: 1, tick: 90 });
    log.record({ name: 'burst', intensity: 14, tick: 90 });
    expect(log.log()).toEqual([
      { name: 'shake', intensity: 3.5, tick: 20 },
      { name: 'pop', intensity: 1, tick: 90 },
      { name: 'burst', intensity: 14, tick: 90 },
    ]);
  });

  it('hands out copies: changing what you were given changes nothing', () => {
    const log = new EffectLog();
    log.record({ name: 'shake', intensity: 3, tick: 1 });
    const copy = log.log();
    copy[0].intensity = 99;
    copy.push({ name: 'pop', intensity: 1, tick: 2 });
    expect(log.log()).toEqual([{ name: 'shake', intensity: 3, tick: 1 }]);
  });

  it('keeps only the newest entries once it is long', () => {
    const log = new EffectLog();
    for (let tick = 0; tick < 450; tick++) log.record({ name: 'shake', intensity: 1, tick });
    const entries = log.log();
    expect(entries).toHaveLength(200);
    expect(entries[0].tick).toBe(250);
    expect(entries[199].tick).toBe(449);
  });

  it('is emptied by clear', () => {
    const log = new EffectLog();
    log.record({ name: 'pop', intensity: 1, tick: 5 });
    log.clear();
    expect(log.log()).toEqual([]);
  });

  it('has one shared log for the page', () => {
    expect(sharedEffectLog()).toBe(sharedEffectLog());
  });
});
