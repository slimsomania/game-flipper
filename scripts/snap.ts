/**
 * npm run snap: look at the game from the command line.
 *
 * Starts a Vite dev server, opens the game in headless Chromium, performs the given actions,
 * and saves screenshots plus a JSON report (state, console errors) to harness/artifacts/snap/.
 * Agents open the PNGs with their Read tool to check what the game looks like.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Page } from '@playwright/test';
import { createServer } from 'vite';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/core/constants';
import { parseAction, type Action } from './snapActions';

const USAGE = `Usage: npm run snap -- [options]

Options:
  --do "<actions>"   Comma-separated actions, run in order (see below).
  --url <path>       Page to open, e.g. "/?seed=7". Default "/".
  --width <px>       Viewport width. Default ${GAME_WIDTH}.
  --height <px>      Viewport height. Default ${GAME_HEIGHT}.
  --out <dir>        Output folder (emptied first). Default harness/artifacts/snap.

Actions (coordinates are game coordinates on the ${GAME_WIDTH}x${GAME_HEIGHT} logical canvas):
  wait:<ms>                         wait in real time
  key:<Key>                         press a key (Space, Enter, Escape, ArrowLeft, KeyR, ...)
  down:<Key> / up:<Key>             hold / release a key
  click:<x>;<y>                     click
  drag:<x1>;<y1>;<x2>;<y2>;<ms>     press, move, release: a swipe or flick taking <ms>
  mousedown:<x>;<y>                 move the mouse there and press the left button
  mousemove:<x>;<y>;<ms>            move in a straight line from where the mouse is, taking <ms>
                                    (0 jumps). Mouse state carries over, so a drag can be paused
                                    halfway for a shot: mousedown, mousemove, shot, mouseup.
  mouseup                           release the left button where the mouse is
                                    The game measures a push over the last 150 ms of real time, so
                                    a release throws only if the mouse was still moving up just
                                    before it: after a shot, do a short mousemove right before
                                    mouseup. With "pause" first, the power bar holds the live
                                    value of the last mouse move while you take the shot. The
                                    held bottle fills about x 240 to 320 and y 312 to 460 on the
                                    canvas (its middle is at about 280;386).
  scene:<Key>                       jump to a scene (window.__FLIPPER__.startScene)
  pause / resume                    freeze / unfreeze the real-time simulation clock
  step:<frames>                     advance the simulation by exactly <frames> fixed steps
  call:<method>;<arg>;...           call window.__FLIPPER__.<method>(args); each arg is a number,
                                    true/false, or else a plain string (no "," or ";" inside).
                                    The return value goes into the report's "calls" list.
                                    e.g. call:step;120  call:startScene;Game
  shot:<name>                       save a screenshot
  state:<name>                      save window.__FLIPPER__.state() into the report

Examples:
  npm run snap
  npm run snap -- --do "key:Space,wait:800,shot:game"
  npm run snap -- --url "/?seed=7" --do "pause,call:step;120,shot:after-2s"
  npm run snap -- --width 1000 --height 800 --do "click:640;360,wait:500,shot:clicked"
  npm run snap -- --url "/?seed=7" --do "pause,mousedown:280;410,mousemove:280;250;100,shot:mid-drag,mousemove:280;200;50,mouseup,step:30,shot:thrown"`;

interface Report {
  url: string;
  viewport: { width: number; height: number };
  actions: string;
  shots: string[];
  states: Record<string, unknown>;
  /** Return values of the `call:` actions, in order. */
  calls: { call: string; result: unknown }[];
  errors: string[];
  activeScenes: string[];
  finalState: unknown;
  info: unknown;
}

/** Convert game coordinates to page coordinates, wherever the scaled canvas sits. */
async function toPage(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('No canvas on the page');
  return { x: box.x + (x / GAME_WIDTH) * box.width, y: box.y + (y / GAME_HEIGHT) * box.height };
}

const safeName = (name: string): string => name.replace(/[^\w.-]+/g, '-').slice(0, 60);
const rel = (file: string): string => relative(process.cwd(), file).replace(/\\/g, '/');

/** Where the mouse is, in game coordinates: Playwright can't be asked, and `mousemove` starts there. */
interface MouseState {
  x: number;
  y: number;
}

/**
 * Move the mouse in a straight line from game point `from` to `to`, taking about `ms` (a step every
 * 16 ms or so, like a real mouse at 60 Hz). With 0 ms it jumps in one step.
 */
async function glide(page: Page, from: MouseState, to: MouseState, ms: number): Promise<void> {
  const moves = ms > 0 ? Math.max(2, Math.round(ms / 16)) : 1;
  for (let i = 1; i <= moves; i++) {
    const t = i / moves;
    const p = await toPage(page, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    await page.mouse.move(p.x, p.y);
    if (ms > 0) await page.waitForTimeout(ms / moves);
  }
}

async function perform(
  page: Page,
  action: Action,
  shot: (name: string) => Promise<void>,
  report: Report,
  mouse: MouseState,
): Promise<void> {
  switch (action.kind) {
    case 'wait':
      await page.waitForTimeout(action.ms);
      break;
    case 'key':
      await page.keyboard.press(action.key);
      break;
    case 'down':
      await page.keyboard.down(action.key);
      break;
    case 'up':
      await page.keyboard.up(action.key);
      break;
    case 'click': {
      const p = await toPage(page, action.x, action.y);
      await page.mouse.click(p.x, p.y);
      break;
    }
    case 'drag': {
      const a = await toPage(page, action.x1, action.y1);
      const to = { x: action.x2, y: action.y2 };
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await glide(page, { x: action.x1, y: action.y1 }, to, action.ms);
      await page.mouse.up();
      Object.assign(mouse, to);
      break;
    }
    case 'mousedown': {
      const p = await toPage(page, action.x, action.y);
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      Object.assign(mouse, { x: action.x, y: action.y });
      break;
    }
    case 'mousemove': {
      const to = { x: action.x, y: action.y };
      await glide(page, mouse, to, action.ms);
      Object.assign(mouse, to);
      break;
    }
    case 'mouseup':
      await page.mouse.up();
      break;
    case 'scene':
      await page.evaluate((key) => window.__FLIPPER__!.startScene(key), action.key);
      await page.waitForFunction(
        (key) => window.__FLIPPER__!.activeScenes().includes(key),
        action.key,
      );
      break;
    case 'pause':
      await page.evaluate(() => window.__FLIPPER__!.pause());
      break;
    case 'resume':
      await page.evaluate(() => window.__FLIPPER__!.resume());
      break;
    case 'step':
      await page.evaluate((n) => window.__FLIPPER__!.step(n), action.frames);
      await page.waitForTimeout(50); // let the next frame draw the new state
      break;
    case 'call': {
      const result = await page.evaluate(
        ({ method, args }) => {
          const api = window.__FLIPPER__ as unknown as Record<string, unknown> | undefined;
          const fn = api?.[method];
          if (typeof fn !== 'function')
            throw new Error(`window.__FLIPPER__.${method} is not a function`);
          return (fn as (...a: unknown[]) => unknown).apply(api, args) ?? null;
        },
        { method: action.method, args: action.args },
      );
      report.calls.push({
        call: `${action.method}(${action.args.map(String).join(', ')})`,
        result,
      });
      await page.waitForTimeout(50); // let the next frame draw the new state
      break;
    }
    case 'shot':
      await shot(action.name);
      break;
    case 'state':
      report.states[action.name] = await page.evaluate(() => window.__FLIPPER__!.state());
      break;
  }
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      do: { type: 'string', default: '' },
      url: { type: 'string', default: '/' },
      width: { type: 'string', default: String(GAME_WIDTH) },
      height: { type: 'string', default: String(GAME_HEIGHT) },
      out: { type: 'string', default: 'harness/artifacts/snap' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }

  const actions = values.do
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
    .map(parseAction);
  const viewport = { width: Number(values.width), height: Number(values.height) };
  const outDir = resolve(values.out);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const report: Report = {
    url: '',
    viewport,
    actions: values.do,
    shots: [],
    states: {},
    calls: [],
    errors: [],
    activeScenes: [],
    finalState: null,
    info: null,
  };

  const server = await createServer({
    server: { port: 5198, strictPort: false },
    logLevel: 'error',
    clearScreen: false,
  });
  await server.listen();
  const base = server.resolvedUrls?.local[0] ?? 'http://localhost:5198/';
  const browser = await chromium.launch();
  let failed = false;

  try {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', (err) => report.errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') report.errors.push(`console: ${msg.text()}`);
    });

    let count = 0;
    const shot = async (name: string): Promise<void> => {
      const file = join(outDir, `${String(++count).padStart(2, '0')}-${safeName(name)}.png`);
      await page.screenshot({ path: file });
      report.shots.push(rel(file));
    };

    report.url = new URL(values.url.replace(/^\//, ''), base).toString();
    await page.goto(report.url);
    try {
      await page.waitForFunction(() => window.__FLIPPER__?.ready === true, undefined, {
        timeout: 15_000,
      });
      await page.waitForTimeout(300); // let the first frames render
      const mouse: MouseState = { x: 0, y: 0 };
      for (const action of actions) await perform(page, action, shot, report, mouse);
      await page.waitForTimeout(100);
    } catch (err) {
      failed = true;
      report.errors.push(`snap: ${(err as Error).message.split('\n')[0]}`);
    }
    await shot(failed ? 'failure' : 'final');
    report.activeScenes = await page.evaluate(() => window.__FLIPPER__?.activeScenes() ?? []);
    report.finalState = await page.evaluate(() => window.__FLIPPER__?.state() ?? null);
    report.info = await page.evaluate(() => window.__FLIPPER__?.info() ?? null);
  } finally {
    writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await browser.close();
    await server.close();
  }

  console.log(`Opened ${report.url} at ${viewport.width}x${viewport.height}`);
  console.log(`Active scenes: ${report.activeScenes.join(', ') || '(none)'}`);
  console.log('Screenshots (open them with the Read tool):');
  for (const file of report.shots) console.log(`  ${file}`);
  console.log(`Report: ${rel(join(outDir, 'report.json'))}`);
  if (report.errors.length) {
    console.log(`\n${report.errors.length} error(s):`);
    for (const e of report.errors) console.log(`  ${e}`);
  } else {
    console.log('No console errors.');
  }
  return failed ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  },
);
