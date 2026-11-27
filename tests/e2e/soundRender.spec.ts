import { expect, test, type Page } from '@playwright/test';
import { openGame } from './helpers';

/*
 * What the four sounds really are, measured: each voice is rendered offline by the browser's own
 * Web Audio (an OfflineAudioContext, so no sound card and no autoplay rules) and the samples are
 * checked: audible, never clipping, a sensible length that ends in silence, and the pitch each
 * sound is meant to have. The page's own module is loaded through the Vite dev server (port 5198
 * in playwright.config.ts): the bundled builds the other tests use can't serve `/src/...` paths.
 */
test.use({ baseURL: 'http://localhost:5198' });

interface Measure {
  /** Largest sample, 0 to 1. */
  peak: number;
  /** Seconds until the last sample louder than the silence threshold. */
  audibleSeconds: number;
  /** Largest sample in the last 0.2 s of the render. */
  tailPeak: number;
  /** Zero crossings per second over the first 0.15 s: a rough pitch. */
  crossings: number;
  /** The highest rough pitch (Hz) of any 40 ms stretch that is clearly audible. */
  highestHz: number;
}

type Rendered = Record<string, Measure>;

/** Render each voice at `volume` through the same master gain the game uses. */
async function render(page: Page, volume: number): Promise<Rendered> {
  return page.evaluate(async (vol) => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { playVoice } = await load('/src/game/audio/synth.ts');
    const { MASTER_GAIN } = await load('/src/game/audio/sfx.ts');
    const rate = 44100;
    const result: Record<string, Measure> = {};
    for (const name of ['whoosh', 'knock', 'chime', 'fanfare', 'thud']) {
      const ctx = new OfflineAudioContext(1, rate * 2, rate);
      const master = ctx.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(ctx.destination);
      playVoice(ctx, master, name, vol);
      const samples = (await ctx.startRendering()).getChannelData(0);
      let peak = 0;
      let last = 0;
      let tailPeak = 0;
      let crossings = 0;
      for (let i = 0; i < samples.length; i++) {
        const level = Math.abs(samples[i]);
        peak = Math.max(peak, level);
        if (level > 0.002) last = i;
        if (i >= samples.length - rate * 0.2) tailPeak = Math.max(tailPeak, level);
        if (i > 0 && i < rate * 0.15 && samples[i - 1] < 0 !== samples[i] < 0) crossings++;
      }
      // The highest pitch: zero crossings per second (a rough pitch) in the loudest-enough 40 ms
      // windows of the sound.
      const win = Math.round(rate * 0.04);
      let highest = 0;
      for (let from = 0; from + win <= samples.length; from += win) {
        let windowPeak = 0;
        let count = 0;
        for (let i = from; i < from + win; i++) {
          windowPeak = Math.max(windowPeak, Math.abs(samples[i]));
          if (i > from && samples[i - 1] < 0 !== samples[i] < 0) count++;
        }
        if (windowPeak > 0.05) highest = Math.max(highest, count / 0.04 / 2);
      }
      result[name] = {
        peak,
        audibleSeconds: last / rate,
        tailPeak,
        crossings: crossings / 0.15,
        highestHz: highest,
      };
    }
    return result;
  }, volume);
}

test('every sound is audible, never clips, and dies away to silence', async ({ page }) => {
  const errors = await openGame(page);
  const loud = await render(page, 1);
  for (const [name, m] of Object.entries(loud)) {
    expect(m.peak, `${name} is clearly audible`).toBeGreaterThan(0.2);
    expect(m.peak, `${name} does not clip`).toBeLessThan(0.95);
    expect(m.audibleSeconds, `${name} has some length`).toBeGreaterThan(0.08);
    expect(m.audibleSeconds, `${name} is short`).toBeLessThan(1.3);
    expect(m.tailPeak, `${name} is silent at the end`).toBeLessThan(0.002);
  }
  expect(errors).toEqual([]);
});

test('the sounds are as long as they should be: knock short, whoosh and thud medium, chime longest', async ({
  page,
}) => {
  const errors = await openGame(page);
  const m = await render(page, 1);
  expect(m.knock.audibleSeconds).toBeLessThan(m.whoosh.audibleSeconds);
  expect(m.knock.audibleSeconds).toBeLessThan(m.thud.audibleSeconds);
  expect(m.chime.audibleSeconds).toBeGreaterThan(m.whoosh.audibleSeconds);
  expect(m.chime.audibleSeconds).toBeGreaterThan(m.thud.audibleSeconds);
  expect(errors).toEqual([]);
});

test('the thud is low and the chime high', async ({ page }) => {
  const errors = await openGame(page);
  const m = await render(page, 1);
  expect(m.thud.crossings).toBeLessThan(m.knock.crossings);
  expect(m.knock.crossings).toBeLessThan(m.chime.crossings);
  expect(m.chime.crossings).toBeGreaterThan(1500);
  expect(m.thud.crossings).toBeLessThan(800);
  expect(errors).toEqual([]);
});

test('the fanfare lasts longer than the chime and reaches a higher pitch', async ({ page }) => {
  const errors = await openGame(page);
  const m = await render(page, 1);
  expect(m.fanfare.audibleSeconds).toBeGreaterThan(m.chime.audibleSeconds);
  expect(m.fanfare.highestHz).toBeGreaterThan(m.chime.highestHz);
  expect(errors).toEqual([]);
});

test('a lower volume is quieter, but still audible', async ({ page }) => {
  const errors = await openGame(page);
  const quiet = await render(page, 0.2);
  const loud = await render(page, 1);
  for (const name of Object.keys(loud)) {
    expect(quiet[name].peak, `${name} at 0.2`).toBeLessThan(loud[name].peak);
    expect(quiet[name].peak, `${name} at 0.2 is audible`).toBeGreaterThan(0.01);
  }
  expect(errors).toEqual([]);
});
