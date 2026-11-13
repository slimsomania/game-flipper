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

const USAGE = `Usage: npm run snap -- [options]

Options:
  --do "<actions>"   Comma-separated actions, run in order (see below).
  --url <path>       Page to open, e.g. "/?seed=7". Default "/".
  --width <px>       Viewport width. Default 450.
  --height <px>      Viewport height. Default 800.
  --out <dir>        Output folder (emptied first). Default harness/artifacts/snap.

Actions (coordinates are game coordinates on the ${GAME_WIDTH}x${GAME_HEIGHT} logical canvas):
  wait:<ms>                         wait in real time
  key:<Key>                         press a key (Space, Enter, Escape, ArrowLeft, KeyR, ...)
  down:<Key> / up:<Key>             hold / release a key
  click:<x>;<y>                     click
  drag:<x1>;<y1>;<x2>;<y2>;<ms>     press, move, release: a swipe or flick taking <ms>
  scene:<Key>                       jump to a scene (window.__FLIPPER__.startScene)
  pause / resume                    freeze / unfreeze the real-time simulation clock
  step:<frames>                     advance the simulation by exactly <frames> fixed steps
  shot:<name>                       save a screenshot
  state:<name>                      save window.__FLIPPER__.state() into the report

Examples:
  npm run snap
  npm run snap -- --do "key:Space,wait:800,shot:game"
  npm run snap -- --url "/?seed=7" --do "scene:Game,pause,step:120,shot:after-2s"
  npm run snap -- --width 390 --height 844 --do "click:360;1000,wait:500,shot:tapped"`;

type Action =
  | { kind: 'wait'; ms: number }
  | { kind: 'key' | 'down' | 'up'; key: string }
  | { kind: 'click'; x: number; y: number }
  | { kind: 'drag'; x1: number; y1: number; x2: number; y2: number; ms: number }
  | { kind: 'scene'; key: string }
  | { kind: 'pause' | 'resume' }
  | { kind: 'step'; frames: number }
  | { kind: 'shot' | 'state'; name: string };

interface Report {
  url: string;
  viewport: { width: number; height: number };
  actions: string;
  shots: string[];
  states: Record<string, unknown>;
  errors: string[];
  activeScenes: string[];
  finalState: unknown;
  info: unknown;
}

function parseAction(token: string): Action {
  const colon = token.indexOf(':');
  const kind = colon === -1 ? token : token.slice(0, colon);
  const arg = colon === -1 ? '' : token.slice(colon + 1);
  const numbers = (count: number): number[] => {
    const parts = arg.split(';').map((p) => Number(p.trim()));
    if (parts.length !== count || parts.some((p) => !Number.isFinite(p))) {
      throw new Error(`"${token}": expected ${count} number(s) separated by ";"`);
    }
    return parts;
  };
  const text = (): string => {
    if (!arg) throw new Error(`"${token}": missing value after ":"`);
    return arg;
  };

  switch (kind) {
    case 'wait':
      return { kind, ms: numbers(1)[0] };
    case 'key':
    case 'down':
    case 'up':
      return { kind, key: text() };
    case 'click': {
      const [x, y] = numbers(2);
      return { kind, x, y };
    }
    case 'drag': {
      const [x1, y1, x2, y2, ms] = numbers(5);
      return { kind, x1, y1, x2, y2, ms };
    }
    case 'scene':
      return { kind, key: text() };
    case 'pause':
    case 'resume':
      return { kind };
    case 'step':
      return { kind, frames: numbers(1)[0] };
    case 'shot':
    case 'state':
      return { kind, name: text() };
    default:
      throw new Error(`Unknown action "${token}". Run "npm run snap -- --help" for the list.`);
  }
}

/** Convert game coordinates to page coordinates, wherever the scaled canvas sits. */
async function toPage(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('No canvas on the page');
  return { x: box.x + (x / GAME_WIDTH) * box.width, y: box.y + (y / GAME_HEIGHT) * box.height };
}

const safeName = (name: string): string => name.replace(/[^\w.-]+/g, '-').slice(0, 60);
const rel = (file: string): string => relative(process.cwd(), file).replace(/\\/g, '/');

async function perform(
  page: Page,
  action: Action,
  shot: (name: string) => Promise<void>,
  report: Report,
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
      const b = await toPage(page, action.x2, action.y2);
      const moves = Math.max(2, Math.round(action.ms / 16));
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      for (let i = 1; i <= moves; i++) {
        const t = i / moves;
        await page.mouse.move(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
        await page.waitForTimeout(action.ms / moves);
      }
      await page.mouse.up();
      break;
    }
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
      width: { type: 'string', default: '450' },
      height: { type: 'string', default: '800' },
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
      for (const action of actions) await perform(page, action, shot, report);
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
