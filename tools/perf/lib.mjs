// The measuring harness: the board in a real browser, driven and timed.
//
// tests/support/real-browser.ts borrows a Chrome to *hear* the engine. This
// borrows one to *watch* the whole product: it serves the repo with the
// project's own Vite, starts Chrome headless with a throwaway profile, and
// talks to it over the DevTools protocol with Node's built-in WebSocket.
// Nothing is installed and nothing is downloaded.
//
// Everything in this folder is a script that imports from here. README.md says
// what each one answers and what its numbers do and do not mean.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The repo this file is in. */
export const ROOT = path.resolve(HERE, '..', '..');

/** Where scripts leave what they make. Ignored by git. */
export const OUT = path.join(HERE, 'out');
export const outDir = (...parts) => {
  const dir = path.join(OUT, ...parts);
  mkdirSync(dir, { recursive: true });
  return dir;
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ------------------------------------------------------------------ arguments

/** `--name=value` or `--name` out of argv, or the fallback. */
export function flag(name, fallback) {
  const hit = process.argv.slice(2).find((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const at = hit.indexOf('=');
  return at < 0 ? true : hit.slice(at + 1);
}

/** Everything in argv that is not a flag. */
export const words = () => process.argv.slice(2).filter((arg) => !arg.startsWith('--'));

// --------------------------------------------------------------------- chrome

/** A Chrome or Chromium to run in. `CHROME_PATH` wins; then the usual places. */
export function findChrome() {
  const named = process.env.CHROME_PATH;
  if (named) return existsSync(named) ? named : null;
  const home = process.env.LOCALAPPDATA ?? '';
  const places = {
    win32: [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      `${home}/Google/Chrome/Application/chrome.exe`,
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    ],
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
    linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
  };
  return (places[process.platform] ?? []).find((place) => existsSync(place)) ?? null;
}

// --------------------------------------------------------------------- server

/**
 * Serve a tree — this repo unless told another — and hand back its origin.
 *
 * Two pages are added. `/__bench` is index.html with the app built by hand and
 * left on `window.bench`, with nothing remembered between loads: no stored
 * grime, no stored switches. `/__blank` is an empty page on the same origin,
 * for importing modules into.
 *
 * `configFile: false` so that a second tree needs no `node_modules` of its
 * own: an export of an old commit (`git archive <rev> | tar -x -C <dir>`) can
 * be served beside this one and the two compared. See null-test.mjs.
 */
export async function serve(root = ROOT) {
  const index = readFileSync(path.join(root, 'index.html'), 'utf8');
  const bench = index.replace(
    /<script type="module"[^>]*><\/script>/,
    `<script type="module">
      import { createApp } from '/src/app.ts';
      window.bench = createApp({
        mount: document.querySelector('#app'),
        weatherStore: null,
        stillStore: null,
        apartStore: null,
        prefersReducedMotion: false,
      });
    </script>`,
  );
  const page = (body) => (_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(body);
  };
  const server = await createServer({
    root,
    configFile: false,
    base: './',
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, watch: null, cors: true },
    plugins: [
      {
        name: 'perf-pages',
        configureServer(dev) {
          dev.middlewares.use('/__bench', page(bench));
          dev.middlewares.use('/__blank', page('<!doctype html><meta charset="utf-8"><title>blank</title>'));
        },
      },
    ],
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('The dev server has no port.');
  return { origin: `http://127.0.0.1:${address.port}`, close: () => server.close() };
}

// -------------------------------------------------------------------- browser

function listening(chrome) {
  return new Promise((resolve, reject) => {
    let seen = '';
    const give = setTimeout(() => reject(new Error(`Chrome did not start listening:\n${seen}`)), 30000);
    chrome.stderr.on('data', (chunk) => {
      seen += chunk.toString();
      const found = /DevTools listening on (ws:\/\/[^\s]+)/.exec(seen);
      if (found) {
        clearTimeout(give);
        resolve(found[1]);
      }
    });
    chrome.once('exit', (code) => {
      clearTimeout(give);
      reject(new Error(`Chrome exited (${code ?? 'no code'}) before it was listening:\n${seen}`));
    });
  });
}

/**
 * Start a browser. Headless, muted, and allowed to make sound without a
 * gesture, so the engine's context runs. Closing it takes its profile with it.
 *
 * A fresh one per measurement is not waste: a second page in the same browser
 * is a background page, and measures slow.
 */
export async function launch({ headed = false } = {}) {
  const chromePath = findChrome();
  if (!chromePath) throw new Error('No Chrome found. Set CHROME_PATH to one.');
  const profile = mkdtempSync(path.join(tmpdir(), 'drone-engine-perf-'));
  const chrome = spawn(
    chromePath,
    [
      ...(headed ? [] : ['--headless=new']),
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--mute-audio',
      '--autoplay-policy=no-user-gesture-required',
      '--window-size=1280,800',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const socket = new WebSocket(await listening(chrome));
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('Could not reach Chrome.')), { once: true });
  });
  let next = 1;
  const waiting = new Map();
  const listeners = new Set();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id === undefined) {
      for (const listener of listeners) listener(message);
      return;
    }
    const entry = waiting.get(message.id);
    waiting.delete(message.id);
    if (!entry) return;
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  });
  return {
    send: (method, params = {}, sessionId) =>
      new Promise((resolve, reject) => {
        const id = next++;
        waiting.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      }),
    /** Hear every event the browser sends. Returns the way to stop. */
    on: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async close() {
      socket.close();
      if (chrome.exitCode === null) {
        const gone = new Promise((resolve) => chrome.once('exit', resolve));
        chrome.kill();
        await Promise.race([gone, sleep(5000)]);
      }
      // The profile is still being let go of for a moment after the process ends.
      try {
        rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      } catch {
        // A locked temp folder is the system's to clean up.
      }
    },
  };
}

/**
 * Open a page at a viewport and hand back what drives it.
 *
 * `throttle` slows the *main thread* by that factor and nothing else: the GPU
 * and the audio thread stay as fast as this machine. Six is about a mid-range
 * tablet's CPU.
 */
export async function openPage(browser, url, { width = 1280, height = 800, dpr = 1, throttle = 1 } = {}) {
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params) => browser.send(method, params, sessionId);
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Performance.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: false });
  if (throttle !== 1) await send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await send('Page.navigate', { url });

  /** Run an expression in the page, wait for a promise, and return what it gives. */
  const evaluate = async (expression) => {
    const reply = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (reply.exceptionDetails) {
      throw new Error(reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text);
    }
    return reply.result.value;
  };
  const until = async (expression, ms = 30000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      try {
        if (await evaluate(expression)) return;
      } catch {
        // Not there yet.
      }
      await sleep(100);
    }
    throw new Error(`Timed out waiting for ${expression}`);
  };
  /** An element's centre and size, in CSS pixels, or null. */
  const rect = (selector) =>
    evaluate(
      `(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; ` +
        `const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()`,
    );
  const mouse = (type, x, y, extra = {}) =>
    send('Input.dispatchMouseEvent', {
      type,
      x,
      y,
      button: 'left',
      buttons: type === 'mouseReleased' ? 0 : 1,
      clickCount: 1,
      ...extra,
    });
  /** Press on an element and drag by `dy` CSS pixels: the board's one gesture. */
  const drag = async (selector, dy, { steps = 12 } = {}) => {
    const at = await rect(selector);
    if (!at) throw new Error(`Nothing matches ${selector}`);
    await mouse('mouseMoved', at.x, at.y, { buttons: 0 });
    await mouse('mousePressed', at.x, at.y);
    for (let i = 1; i <= steps; i++) {
      await mouse('mouseMoved', at.x, at.y + (dy * i) / steps);
      await sleep(16);
    }
    await mouse('mouseReleased', at.x, at.y + dy);
  };
  const click = async (selector) => {
    const at = await rect(selector);
    if (!at) throw new Error(`Nothing matches ${selector}`);
    await mouse('mouseMoved', at.x, at.y, { buttons: 0 });
    await mouse('mousePressed', at.x, at.y);
    await mouse('mouseReleased', at.x, at.y);
  };
  const metrics = async () => {
    const reply = await send('Performance.getMetrics');
    return Object.fromEntries(reply.metrics.map((metric) => [metric.name, metric.value]));
  };
  return { send, evaluate, until, rect, mouse, drag, click, metrics, sessionId, targetId };
}

// ------------------------------------------------------------------ the board

/**
 * Open the bench page and wait until the board is built and its textures are
 * baked — a measurement taken before the bake is of a board that is about to
 * be redrawn.
 *
 * Asked for a field of the handle, not for the handle: before the script runs,
 * `window.bench` would be undefined, but a global named after an element's id
 * is that element — the trap that `window.app` is on this page.
 */
export async function openBoard(browser, origin, options) {
  const page = await openPage(browser, `${origin}/__bench`, options);
  await page.until('!!(window.bench && window.bench.board)');
  await page.evaluate('window.bench.bake ? window.bench.bake.done.then(() => 0) : 0');
  return page;
}

/** Pull the lever, and wait for the overlay to be gone. A real drag, so it is a gesture. */
export async function wake(page) {
  await page.until(`!!document.querySelector('[data-part="wake"] [data-part="handle"]')`);
  await sleep(400);
  await page.drag('[data-part="wake"] [data-part="handle"]', 170, { steps: 16 });
  await page.until(`!!window.bench.engine && !document.querySelector('[data-part="wake"]')`, 20000);
}

export const STRIKES = ['slowhit', 'cymbal', 'voice', 'maracas', 'cow', 'laser'];
export const DRONES = ['guitar', 'bass', 'chainsaw', 'sax', 'throat'];

/** A control thrown to the top of its travel, or the bottom. */
export const up = (page, key) => page.drag(`[data-control="${key}"]`, -170);
export const down = (page, key) => page.drag(`[data-control="${key}"]`, 170);

/** Every strike on *constantly* and loud, every drone up, the fastest PACE. */
async function everything(page) {
  for (const id of STRIKES) {
    // *constantly* is the first rung, and which way that lies depends on the hardware.
    await down(page, `${id}.often`);
    if ((await page.evaluate(`window.bench.engine.sources[${JSON.stringify(id)}].often`)) !== 0) await up(page, `${id}.often`);
    await up(page, `${id}.loud`);
  }
  await up(page, 'maracas.char');
  for (const id of ['chainsaw', 'sax', 'throat']) await up(page, `${id}.loud`);
  await up(page, 'g.pace');
  if ((await page.evaluate('window.bench.engine.bpm')) !== 72) await down(page, 'g.pace');
}

/** COME APART armed, with GRIT and MURK all the way up: the whole shelf. */
async function armed(page) {
  await page.evaluate('window.bench.apart.toggle(); 0');
  await up(page, 'mods.grit');
  await up(page, 'mods.murk');
}

/**
 * The states worth measuring, each a way of getting a fresh board there.
 *
 * - `cold`: before the lever. Nothing should be happening at all.
 * - `open`: woken and left alone — the board as most people will have it.
 * - `drift`: MEGADRIFT all the way up, so every control moves ten times a second.
 * - `apart`: the advanced-effects shelf, armed and driven.
 * - `frenzy`: every strike on every beat, with the drift up as well.
 * - `worst`: `frenzy` and `apart` together.
 */
export const SCENES = {
  cold: async () => {},
  open: wake,
  drift: async (page) => {
    await wake(page);
    await up(page, 'g.megadrift');
  },
  apart: async (page) => {
    await wake(page);
    await armed(page);
  },
  frenzy: async (page) => {
    await wake(page);
    await everything(page);
    await up(page, 'g.megadrift');
  },
  worst: async (page) => {
    await wake(page);
    await everything(page);
    await up(page, 'g.megadrift');
    await armed(page);
  },
};

/** A board in one of {@link SCENES}, settled, on a page of its own. */
export async function boardIn(browser, origin, scene, options) {
  const setup = SCENES[scene];
  if (!setup) throw new Error(`No scene "${scene}". There are: ${Object.keys(SCENES).join(', ')}.`);
  const page = await openBoard(browser, origin, options);
  await setup(page);
  await sleep(2500);
  return page;
}

// -------------------------------------------------------------------- tracing

/** The categories that say which thread is doing what. */
export const THREADS = ['toplevel', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'cc', 'gpu', 'viz', 'audio', 'webaudio'];
/** Added to them, these say what a rastered tile is made of. */
export const SKIA = ['skia', 'skia.gpu', 'skia.shaders', 'disabled-by-default-skia', 'disabled-by-default-skia.gpu'];

/**
 * Record a trace for `ms` — running `during` meanwhile, if given — and add it
 * up: `busy` is milliseconds of task per second on each thread, `top` is every
 * event by thread and name, and `events` is the trace itself.
 *
 * The names worth knowing: `CrRendererMain` is the page's main thread,
 * `CrGpuMain | RendererRasterWorker` is tiles being drawn, and
 * `AudioOutputDevice | AudioDestination::Render` is the realtime audio thread.
 */
export async function trace(browser, ms, { during, categories = THREADS } = {}) {
  const events = [];
  const off = browser.on((message) => {
    if (message.method === 'Tracing.dataCollected') events.push(...message.params.value);
  });
  const done = new Promise((resolve) => {
    const stop = browser.on((message) => {
      if (message.method !== 'Tracing.tracingComplete') return;
      stop();
      resolve();
    });
  });
  await browser.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { includedCategories: categories } });
  const began = Date.now();
  if (during) await during();
  const left = ms - (Date.now() - began);
  if (left > 0) await sleep(left);
  const seconds = (Date.now() - began) / 1000;
  await browser.send('Tracing.end');
  await done;
  off();

  const threads = new Map();
  for (const event of events) {
    if (event.ph === 'M' && event.name === 'thread_name') threads.set(`${event.pid}:${event.tid}`, event.args.name);
  }
  const busy = new Map();
  const byName = new Map();
  for (const event of events) {
    if (event.ph !== 'X' || !event.dur) continue;
    const thread = threads.get(`${event.pid}:${event.tid}`) ?? 'unknown';
    if (event.name === 'RunTask' || event.name === 'ThreadPool_RunTask') busy.set(thread, (busy.get(thread) ?? 0) + event.dur);
    const key = `${thread} | ${event.name}`;
    const row = byName.get(key) ?? { dur: 0, n: 0, max: 0 };
    row.dur += event.dur;
    row.n += 1;
    row.max = Math.max(row.max, event.dur);
    byName.set(key, row);
  }
  const perSecond = (us) => Number((us / 1000 / seconds).toFixed(2));
  const top = [...byName]
    .map(([key, row]) => ({ key, msPerSec: perSecond(row.dur), perSec: Number((row.n / seconds).toFixed(1)), maxMs: Number((row.max / 1000).toFixed(2)) }))
    .sort((a, b) => b.msPerSec - a.msPerSec);
  return {
    seconds,
    events,
    threads,
    busy: Object.fromEntries([...busy].map(([key, us]) => [key, perSecond(us)]).sort((a, b) => b[1] - a[1])),
    top,
    /** One event's row, by `thread | name`, or zeroes. */
    pick: (key) => top.find((row) => row.key === key) ?? { key, msPerSec: 0, perSec: 0, maxMs: 0 },
  };
}

/**
 * Frame pacing and main-thread accounting over `ms`, running `during`
 * meanwhile if given.
 *
 * Frames are counted by a `requestAnimationFrame` loop in the page, which is
 * itself a frame's worth of nothing sixty times a second — so `perSec.style`
 * never reads zero, even on a board that is doing nothing.
 */
export async function sample(page, ms, during) {
  await page.evaluate(`(() => {
    const s = (window.__sample = { frames: [], long: [], run: true });
    const loop = (t) => { s.frames.push(t); if (s.run) requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    try {
      s.observer = new PerformanceObserver((list) => { for (const entry of list.getEntries()) s.long.push(entry.duration); });
      s.observer.observe({ entryTypes: ['longtask'] });
    } catch {}
  })()`);
  const before = await page.metrics();
  const began = Date.now();
  if (during) await during();
  const left = ms - (Date.now() - began);
  if (left > 0) await sleep(left);
  const after = await page.metrics();
  const got = await page.evaluate(
    `(() => { const s = window.__sample; s.run = false; s.observer && s.observer.disconnect(); return { frames: s.frames, long: s.long }; })()`,
  );
  const seconds = after.Timestamp - before.Timestamp;
  const gaps = [];
  for (let i = 1; i < got.frames.length; i++) gaps.push(got.frames[i] - got.frames[i - 1]);
  gaps.sort((a, b) => a - b);
  const at = (share) => Number((gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * share))] ?? 0).toFixed(1));
  const per = (name) => Number((((after[name] - before[name]) / seconds) * 1000).toFixed(1));
  return {
    fps: Number((gaps.length / seconds).toFixed(1)),
    gapMs: { p50: at(0.5), p95: at(0.95), p99: at(0.99), max: at(1) },
    over34: gaps.filter((gap) => gap > 34).length,
    longTasks: got.long.length,
    longestTaskMs: Number(Math.max(0, ...got.long).toFixed(0)),
    mainMsPerSec: { task: per('TaskDuration'), script: per('ScriptDuration'), style: per('RecalcStyleDuration'), layout: per('LayoutDuration') },
    nodes: after.Nodes,
  };
}

/** What a backend node is, in the board's own words: its `data-part`, and whose. */
export async function describe(page, backendNodeId) {
  if (!backendNodeId) return '(no node)';
  try {
    const { node } = await page.send('DOM.describeNode', { backendNodeId });
    const attrs = {};
    for (let i = 0; i < (node.attributes ?? []).length; i += 2) attrs[node.attributes[i]] = node.attributes[i + 1];
    const whose = attrs['data-module'] ?? attrs['data-control'] ?? attrs['data-mod'] ?? attrs['data-source'];
    return `${attrs['data-part'] ?? node.nodeName.toLowerCase()}${whose ? `:${whose}` : ''}`;
  } catch {
    return '(gone)';
  }
}

/** Run `work` with a server and hand both back down, whatever happens. */
export async function served(work, root) {
  const server = await serve(root);
  try {
    return await work(server);
  } finally {
    await server.close();
  }
}

/** Run `work` with a fresh browser, closed after, whatever happens. */
export async function browsed(work, options) {
  const browser = await launch(options);
  try {
    return await work(browser);
  } finally {
    await browser.close();
  }
}
