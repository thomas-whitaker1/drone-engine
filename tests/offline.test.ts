// The board, rendered (gt#27). Every other suite reads a graph off a fake context:
// it can say that a panner exists and reaches the output, and nothing about what
// comes out of it. These are the few claims that are about the *sound*, so they
// are made against sound — the real engine on a real OfflineAudioContext, in a
// real browser. See ./support/real-browser for how the suite gets one without
// installing anything, and ./support/offline-render for what runs in the page.
//
// Where there is no Chrome on the machine this file is skipped, and says so.
// Set CHROME_PATH to point it at one.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HEARTBEAT, STRIKE_IDS, TEMPOS } from '../src/engine/constants';
import type { RenderReport, RenderSpec } from './support/offline-render';
import { findChrome, openRealPage, type RealPage } from './support/real-browser';

const chrome = findChrome();
const RENDER = 'tests/support/offline-render.ts';

/** GUITAR WALL alone, at full: one held, harmonically rich, perfectly mono voice. */
const GUITAR_ALONE: RenderSpec = {
  seconds: 5,
  sampleRate: 22050,
  silent: true,
  sources: { guitar: { on: true, loud: 1 } },
  wires: [],
};

if (!chrome) {
  console.warn('tests/offline.test.ts: no Chrome found (set CHROME_PATH); the rendered-audio suite is skipped.');
}

describe.skipIf(!chrome)('the board through a real OfflineAudioContext', () => {
  let page: RealPage;

  beforeAll(async () => {
    page = await openRealPage(chrome as string);
  }, 90_000);

  afterAll(async () => {
    await page?.close();
  }, 30_000);

  const report = (spec: RenderSpec): Promise<RenderReport> => page.call<RenderReport>(RENDER, 'report', spec);

  it('builds its whole graph in a real context, and what comes out is sound', async () => {
    const out = await report({ seconds: 8 });

    expect(out.frames).toBe(8 * 44100);
    // Every sample a number, and none of them past full scale.
    expect(out.bad).toBe(0);
    expect(out.over).toBe(0);
    expect(out.peak).toBeLessThan(1);
    // The board opens already droning: both channels are carrying it.
    expect(out.rms[0]).toBeGreaterThan(0.1);
    expect(out.rms[1]).toBeGreaterThan(0.1);
    // And the heartbeat ran on the render's own clock: SLOW HIT lands on the
    // first beat, a lookahead after the engine started.
    expect(out.hits[0]).toEqual({ id: 'slowhit', at: HEARTBEAT.lead });
  }, 60_000);

  it('renders the same board to the same audio, twice', async () => {
    const out = await page.call<{ first: RenderReport; worstDifference: number; sameHits: boolean }>(
      RENDER,
      'twice',
      { seconds: 8 },
    );

    // The first law, end to end: the same strikes at the same moments…
    expect(out.sameHits).toBe(true);
    expect(out.first.hits.length).toBeGreaterThan(0);
    // …and the same audio, to within a hundredth of a percent of full scale
    // (−80dB). Measured, it is under −100dB.
    //
    // Not `toBe(0)`, and the reason is the browser's rather than the board's.
    // Where three or more signals are summed at one node, Chrome adds them in
    // an order that differs from one run to the next, and floating-point
    // addition is not associative: the last bit moves. Four plain oscillators
    // into one gain, with none of this project in the graph, already differ
    // run to run — that is `browserFloor`, below. Anything the engine got
    // wrong would be a different strike, a different seed or a different
    // curve, and would be nowhere near this small.
    expect(out.worstDifference).toBeLessThan(1e-4);
  }, 60_000);

  it('is held to a tolerance no wider than the browser’s own', async () => {
    const floor = await page.call<{ worstDifference: number; peak: number }>(RENDER, 'browserFloor', 4);

    // The same four oscillators, rendered in pairs: whatever they differ by is
    // the browser's doing, and it is the scale the tolerance above is set at.
    expect(floor.peak).toBeGreaterThan(0.1);
    expect(floor.worstDifference).toBeLessThan(1e-5);
  }, 60_000);

  describe('stereo', () => {
    it('leaves an unplaced voice exactly in the middle', async () => {
      // The control for the two below: with nothing to place it, left and
      // right are the same samples.
      const out = await report(GUITAR_ALONE);

      expect(out.rms[0]).toBeGreaterThan(0.01);
      expect(out.sideMost).toBe(0);
    }, 60_000);

    it('puts OFFSET’s three taps in different places', async () => {
      // The only deliberate placement on the board. The suites on the fake
      // context know the panners exist; this is the first thing to know that
      // the two channels of the output actually differ.
      const out = await report({
        ...GUITAR_ALONE,
        wires: [{ from: 'guitar', to: 'offset' }],
        modifiers: { offset: 0.6 },
      });

      expect(out.sideMost).toBeGreaterThan(0.01);
      // Different, and still one board: neither side has gone missing.
      expect(Math.min(...out.rms) / Math.max(...out.rms)).toBeGreaterThan(0.5);
    }, 60_000);

    it('gives CAVERN a room with two sides, one seed a channel', async () => {
      const out = await report({
        ...GUITAR_ALONE,
        wires: [{ from: 'guitar', to: 'cavern' }],
        modifiers: { cavern: 1 },
      });

      expect(out.sideMost).toBeGreaterThan(0.01);
      expect(Math.min(...out.rms) / Math.max(...out.rms)).toBeGreaterThan(0.5);
    }, 60_000);
  });

  it('plays every strike on every beat of a full board at its fastest, and never clips', async () => {
    // The case gt#68 found starving: everything on, every strike on
    // *constantly*, MARACAS at full FRENZY, at WALKING. Under the reference's
    // cap COW and LASER CANNON fired two beats in forty-eight here.
    const sources: NonNullable<RenderSpec['sources']> = {
      guitar: { on: true, loud: 1 },
      bass: { on: true, loud: 1 },
      chainsaw: { on: true, loud: 1 },
      sax: { on: true, loud: 1 },
      throat: { on: true, loud: 1 },
    };
    for (const id of STRIKE_IDS) sources[id] = { on: true, loud: 1, often: 0 };
    sources.maracas = { on: true, loud: 1, often: 0, char: 1 };
    sources.laser = { on: true, loud: 1, often: 0, char: 1 };

    const seconds = 10;
    const out = await report({ seconds, sampleRate: 22050, sources, globals: { pace: TEMPOS.length - 1 } });

    // Each module was booked once for every beat inside the render. (Touching
    // a strike's controls pokes it, so a module may have one hit over.)
    const beats = Math.floor((seconds - HEARTBEAT.lead - HEARTBEAT.horizon) / (60 / HEARTBEAT.maxBpm));
    for (const id of STRIKE_IDS) {
      const landed = out.hits.filter((hit) => hit.id === id).length;
      expect(landed, id).toBeGreaterThanOrEqual(beats);
    }
    expect(out.bad).toBe(0);
    expect(out.over).toBe(0);
  }, 60_000);
});
