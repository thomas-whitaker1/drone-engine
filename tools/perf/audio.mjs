// What the audio engine costs, and which kind of node the cost is.
//
//   node tools/perf/audio.mjs [open|idle|frenzy] [variant…] [--live] [--seconds=30]
//
// Two ways of asking, and they agree:
//
// - **Offline** (the default): the real engine, rendered through
//   tests/support/offline-render.ts as fast as the machine will go. Wall time
//   over audio time is the share of one core the whole graph needs. Steady, and
//   it includes every thread's work.
// - **`--live`**: the real page, woken and stilled so nothing but sound is
//   working, traced on its realtime audio thread. Noisier by a tenth or so, and
//   it is the thread that clicks when it is late — `worst` is the longest
//   single callback, to be read against the context's buffer.
//
// Each variant builds the engine with one kind of node replaced by something
// that does nothing, so the difference from `base` is what that kind costs.
// Name some to run only those. A fresh browser each: a second page in the same
// browser is a background page, and measures slow.
//
// These are this machine's numbers. A tablet's core is three to six times
// slower, and that multiplication is the whole of how to read them.

import { browsed, DRONES, flag, openBoard, openPage, served, sleep, STRIKES, trace, up, wake, words, down } from './lib.mjs';

const [config = 'open', ...only] = words();
const live = Boolean(flag('live', false));
const seconds = Number(flag('seconds', 30));

/** Boards to render, as tests/support/offline-render.ts takes them. */
const BOARDS = {
  open: {},
  idle: { silent: true, wires: [] },
  frenzy: {
    sources: Object.fromEntries([
      ...STRIKES.map((id) => [id, { on: true, often: 0, loud: 1, ...(id === 'maracas' ? { char: 1 } : {}) }]),
      ...DRONES.map((id) => [id, { on: true, loud: 1 }]),
    ]),
    globals: { pace: 3 },
    wires: [
      { from: 'guitar', to: 'grit' },
      { from: 'grit', to: 'cavern' },
      { from: 'bass', to: 'murk' },
      { from: 'slowhit', to: 'cavern' },
      { from: 'chainsaw', to: 'wobble' },
      { from: 'sax', to: 'doppler' },
      { from: 'throat', to: 'magnets' },
      { from: 'maracas', to: 'offset' },
      { from: 'laser', to: 'offset' },
      { from: 'cow', to: 'cavern' },
      { from: 'voice', to: 'doppler' },
      { from: 'cymbal', to: 'magnets' },
    ],
  },
};
if (!BOARDS[config]) throw new Error(`No board "${config}". There are: ${Object.keys(BOARDS).join(', ')}.`);

/** One kind of node knocked out, as a patch to a context's prototype `P`. */
const KNOCKOUTS = {
  base: () => '',
  noConvolver: (P) => `{ const g = ${P}.createGain; ${P}.createConvolver = function () { const n = g.call(this); n.gain.value = 0; return n; }; }`,
  noOversample: (P) =>
    `{ const w = ${P}.createWaveShaper; ${P}.createWaveShaper = function () { const n = w.call(this); Object.defineProperty(n, 'oversample', { set() {}, get() { return 'none'; } }); return n; }; }`,
  noShaper: (P) => `{ const g = ${P}.createGain; ${P}.createWaveShaper = function () { const n = g.call(this); n.curve = null; n.oversample = 'none'; return n; }; }`,
  noCompressor: (P) =>
    `{ const g = ${P}.createGain; ${P}.createDynamicsCompressor = function () { const n = g.call(this); for (const k of ['threshold', 'ratio', 'knee', 'attack', 'release']) n[k] = { value: 0 }; return n; }; }`,
  krateBiquad: (P) =>
    `{ const b = ${P}.createBiquadFilter; ${P}.createBiquadFilter = function () { const n = b.call(this); for (const k of ['frequency', 'Q', 'detune', 'gain']) n[k].automationRate = 'k-rate'; return n; }; }`,
  noOscillator: (P) => `{ const o = ${P}.createOscillator; ${P}.createOscillator = function () { const n = o.call(this); n.connect = () => {}; return n; }; }`,
};

async function offline(server, name) {
  return browsed(async (browser) => {
    const page = await openPage(browser, `${server.origin}/__blank`);
    await page.until('document.readyState === "complete"');
    const result = await page.evaluate(`(async () => {
      ${KNOCKOUTS[name]('OfflineAudioContext.prototype')}
      const { render } = await import('/tests/support/offline-render.ts');
      const spec = { seconds: ${seconds}, sampleRate: 48000, ...${JSON.stringify(BOARDS[config])} };
      await render({ ...spec, seconds: 2 });
      let ms = Infinity, out;
      for (let i = 0; i < 3; i++) { const t0 = performance.now(); out = await render(spec); ms = Math.min(ms, performance.now() - t0); }
      let sum = 0;
      for (const x of out.channels[0]) sum += x * x;
      return { ms, rms: Math.sqrt(sum / out.channels[0].length), hits: out.hits.length };
    })()`);
    return `${result.ms.toFixed(0)}ms for ${seconds}s`.padStart(16) + `  ${((result.ms / (seconds * 1000)) * 100).toFixed(2)}% of a core`.padEnd(22) + `rms ${result.rms.toFixed(4)}  ${result.hits} hits`;
  });
}

async function realtime(server, name) {
  if (config === 'idle') throw new Error('--live has no idle board: use open or frenzy.');
  return browsed(async (browser) => {
    const page = await openBoard(browser, server.origin);
    const patch = KNOCKOUTS[name]('AudioContext.prototype');
    if (patch) await page.evaluate(`${patch}; 0`);
    await wake(page);
    if (config === 'frenzy') {
      for (const id of STRIKES) {
        await down(page, `${id}.often`);
        if ((await page.evaluate(`window.bench.engine.sources.${id}.often`)) !== 0) await up(page, `${id}.often`);
        await up(page, `${id}.loud`);
      }
      await up(page, 'maracas.char');
      for (const id of ['chainsaw', 'sax', 'throat']) await up(page, `${id}.loud`);
      await up(page, 'g.pace');
    }
    // Stilled, so the trace is of sound and nothing else.
    await page.evaluate('window.bench.stillness.toggle(); 0');
    await sleep(4000);
    const t = await trace(browser, 6000);
    const render = t.pick('AudioOutputDevice | AudioDestination::Render');
    const context = await page.evaluate(
      `(() => { const c = window.bench.engine.context; return { buffer: c.baseLatency * 1000, voices: window.bench.engine.active }; })()`,
    );
    return (
      `${render.msPerSec} ms/s on the audio thread`.padStart(34) +
      `  worst callback ${render.maxMs}ms of a ${context.buffer.toFixed(0)}ms buffer`.padEnd(46) +
      `${context.voices} voices`
    );
  });
}

await served(async (server) => {
  console.log(`${config}, ${live ? 'live' : 'offline'}:`);
  for (const name of Object.keys(KNOCKOUTS)) {
    if (only.length && !only.includes(name)) continue;
    console.log(name.padEnd(14), await (live ? realtime : offline)(server, name));
  }
});
