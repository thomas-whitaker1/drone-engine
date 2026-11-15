// The suite half of the offline harness (gt#27): a real browser to render in.
//
// happy-dom has no Web Audio, and the fake context in ./fake-audio-context can
// say that two nodes are connected but not what comes out of them. So for the
// handful of claims that are about *sound*, the suite borrows a browser that is
// already on the machine: it serves this repo with the project's own Vite,
// starts Chrome headless, and talks to it over the DevTools protocol.
//
// Nothing is installed for this and nothing is downloaded. The protocol is a
// WebSocket carrying JSON, and Node has both. Where there is no Chrome the
// suite that needs one is skipped and says so — see {@link findChrome}.

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A blank page on the dev server's origin, so modules can be imported from it. */
const BLANK = '/__offline';

/**
 * A Chrome or Chromium to render in, or null. `CHROME_PATH` wins; after that
 * the usual places for the platform. Null is not an error: a machine with no
 * browser skips the offline suite, and the rest of the tests do not need one.
 */
export function findChrome(): string | null {
  const named = process.env['CHROME_PATH'];
  if (named) return existsSync(named) ? named : null;

  const home = process.env['LOCALAPPDATA'] ?? '';
  const places: Record<string, string[]> = {
    win32: [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      `${home}/Google/Chrome/Application/chrome.exe`,
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    ],
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ],
    linux: [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
    ],
  };
  return (places[process.platform] ?? []).find((place) => existsSync(place)) ?? null;
}

export interface RealPage {
  /**
   * Call one export of a module in the page, by its path from the repo root,
   * with JSON-able arguments. Waits for a promise; hands back what it resolves to.
   */
  call<T>(module: string, name: string, ...args: unknown[]): Promise<T>;
  close(): Promise<void>;
}

/** The DevTools address Chrome prints once it is listening. */
function listening(chrome: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let seen = '';
    const give = setTimeout(() => reject(new Error(`Chrome did not start listening:\n${seen}`)), 30000);
    chrome.stderr?.on('data', (chunk: Buffer) => {
      seen += chunk.toString();
      const found = /DevTools listening on (ws:\/\/[^\s]+)/.exec(seen);
      if (found?.[1]) {
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

/** One DevTools connection: send a command, get its result. */
async function devtools(url: string): Promise<{
  send<T>(method: string, params?: object, sessionId?: string): Promise<T>;
  close(): void;
}> {
  const socket = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error('Could not reach Chrome.')), { once: true });
  });
  let next = 1;
  const waiting = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as {
      id?: number;
      result?: unknown;
      error?: { message: string };
    };
    if (message.id === undefined) return;
    const entry = waiting.get(message.id);
    waiting.delete(message.id);
    if (!entry) return;
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  });
  return {
    send: <T>(method: string, params: object = {}, sessionId?: string) =>
      new Promise<T>((resolve, reject) => {
        const id = next++;
        waiting.set(id, { resolve: resolve as (value: unknown) => void, reject });
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      }),
    close: () => socket.close(),
  };
}

/**
 * Serve the repo, start the browser, and open one blank page on it. The caller
 * closes it; closing takes the browser, its throwaway profile and the server
 * down together.
 */
export async function openRealPage(chromePath: string): Promise<RealPage> {
  const server: ViteDevServer = await createServer({
    root: ROOT,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, watch: null },
    plugins: [
      {
        name: 'offline-blank-page',
        configureServer(dev) {
          dev.middlewares.use(BLANK, (_request, response) => {
            response.setHeader('Content-Type', 'text/html');
            response.end('<!doctype html><meta charset="utf-8"><title>offline</title>');
          });
        },
      },
    ],
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('The dev server has no port.');
  const origin = `http://127.0.0.1:${address.port}`;

  const profile = mkdtempSync(path.join(tmpdir(), 'drone-engine-offline-'));
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--mute-audio',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );

  const close = async (browser?: { close(): void }): Promise<void> => {
    browser?.close();
    if (chrome.exitCode === null) {
      const gone = new Promise<void>((resolve) => chrome.once('exit', () => resolve()));
      chrome.kill();
      await Promise.race([gone, new Promise((resolve) => setTimeout(resolve, 5000))]);
    }
    await server.close();
    // The profile is still being let go of for a moment after the process ends.
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  };

  try {
    const browser = await devtools(await listening(chrome));
    const { targetId } = await browser.send<{ targetId: string }>('Target.createTarget', {
      url: origin + BLANK,
    });
    const { sessionId } = await browser.send<{ sessionId: string }>('Target.attachToTarget', {
      targetId,
      flatten: true,
    });
    await browser.send('Runtime.enable', {}, sessionId);

    return {
      async call<T>(module: string, name: string, ...args: unknown[]): Promise<T> {
        const expression =
          `import(${JSON.stringify('/' + module)})` +
          `.then((m) => m[${JSON.stringify(name)}](...${JSON.stringify(args)}))`;
        const reply = await browser.send<{
          result: { value?: T };
          exceptionDetails?: { text: string; exception?: { description?: string } };
        }>('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
        if (reply.exceptionDetails) {
          throw new Error(reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text);
        }
        return reply.result.value as T;
      },
      close: () => close(browser),
    };
  } catch (error) {
    await close();
    throw error;
  }
}
