// The browser half of the offline harness (gt#27): the real engine, on a real
// OfflineAudioContext, in a real browser. tests/support/real-browser.ts loads
// this module into a page and calls it; tests/offline.test.ts says what it
// expects back.
//
// Everything here runs in the page, not in the suite, so it returns only what
// survives a trip through JSON: numbers and the list of strikes.

import { syncEngine } from '../../src/app';
import { buildModifiers, buildSources, createEngine } from '../../src/engine';
import type { Wire } from '../../src/engine';
import { MODIFIER_IDS, SOURCE_IDS, STRIKE_IDS } from '../../src/engine/constants';
import type { ModifierId, SourceId } from '../../src/engine/constants';
import { OPENING_STATE, OPENING_WIRES } from '../../src/ui/board';
import type { BoardState } from '../../src/ui/board';

/** What a render is asked for. Everything left out is the board as it opens. */
export interface RenderSpec {
  readonly seconds: number;
  /** Laid over {@link OPENING_STATE}: only what differs needs saying. */
  readonly sources?: Partial<Record<SourceId, Partial<BoardState['m'][SourceId]>>>;
  readonly modifiers?: Partial<Record<ModifierId, number>>;
  readonly globals?: Partial<BoardState['g']>;
  readonly wires?: readonly Wire[];
  /** Every source off unless `sources` switches it on. */
  readonly silent?: boolean;
  readonly sampleRate?: number;
}

/** One booked strike: which module, and the audio time it was booked for. */
export interface Hit {
  readonly id: string;
  readonly at: number;
}

export interface Rendered {
  readonly channels: [Float32Array, Float32Array];
  readonly hits: Hit[];
  readonly sampleRate: number;
}

/** What comes back to the suite about one render. */
export interface RenderReport {
  readonly frames: number;
  readonly peak: number;
  /** RMS of each channel over the second half of the render, past the soft start. */
  readonly rms: [number, number];
  /** The loudest difference between left and right, anywhere. Zero is mono. */
  readonly sideMost: number;
  readonly hits: Hit[];
  /** Samples that are not a number, or beyond full scale. */
  readonly bad: number;
  readonly over: number;
}

/** How often the render is paused so the heartbeat can book what comes next. */
const STEP = 0.1;

function stateFor(spec: RenderSpec): BoardState {
  const m = {} as Record<SourceId, BoardState['m'][SourceId]>;
  for (const id of SOURCE_IDS) {
    const base = OPENING_STATE.m[id];
    m[id] = { ...base, ...(spec.silent ? { on: false } : {}), ...(spec.sources?.[id] ?? {}) };
  }
  const mods = {} as Record<ModifierId, BoardState['mods'][ModifierId]>;
  for (const id of MODIFIER_IDS) {
    const amount = spec.modifiers?.[id];
    mods[id] = { ...OPENING_STATE.mods[id], ...(amount === undefined ? {} : { amount }) };
  }
  return { ...OPENING_STATE, g: { ...OPENING_STATE.g, ...(spec.globals ?? {}) }, m, mods };
}

/** A macrotask, so the browser can deliver `ended` events before the render goes on. */
const breathe = (): Promise<void> =>
  new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(0);
  });

/**
 * Render a board. The engine is built and set exactly as the wake lever does
 * it — `start`, the two builders, `syncEngine` — and then the pulse is driven
 * off the render's own clock: the context is paused every tenth of a second
 * and the heartbeat fills its horizon, which is what its timer does in a
 * running page.
 */
export async function render(spec: RenderSpec): Promise<Rendered> {
  const sampleRate = spec.sampleRate ?? 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(spec.seconds * sampleRate), sampleRate);
  const engine = createEngine({ context: ctx });
  engine.start();
  // The wall-clock timer has nothing to say about an offline render.
  engine.stop();
  buildModifiers(engine);
  buildSources(engine);

  const hits: Hit[] = [];
  for (const id of STRIKE_IDS) {
    const outlet = engine.sources[id];
    const trigger = outlet?.trigger;
    if (!outlet || !trigger) continue;
    outlet.trigger = (at) => {
      hits.push({ id, at: Math.round(at * 1e6) / 1e6 });
      trigger(at);
    };
  }

  syncEngine(engine, stateFor(spec), spec.wires ?? OPENING_WIRES);
  // Everything put off until after the wake, now: a render needs its whole graph.
  engine.settle();

  // The heartbeat resumes a suspended context on every tick. Here each pause
  // is ours, so that call is swallowed and the real one made when we are done.
  const resume = (): Promise<void> => OfflineAudioContext.prototype.resume.call(ctx);
  (ctx as unknown as { resume: () => Promise<void> }).resume = () => Promise.resolve();

  const pause = async (): Promise<void> => {
    engine.heartbeat.tick();
    await breathe();
  };
  for (let index = 1; index * STEP < spec.seconds; index++) {
    void ctx
      .suspend(index * STEP)
      .then(pause)
      .then(resume, resume);
  }
  await pause();

  const buffer = await ctx.startRendering();
  return { channels: [buffer.getChannelData(0), buffer.getChannelData(1)], hits, sampleRate };
}

function reportOf(rendered: Rendered): RenderReport {
  const [left, right] = rendered.channels;
  let peak = 0;
  let sideMost = 0;
  let bad = 0;
  let over = 0;
  const sums = [0, 0];
  const half = Math.floor(left.length / 2);
  for (let i = 0; i < left.length; i++) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (!Number.isFinite(l) || !Number.isFinite(r)) bad++;
    const most = Math.max(Math.abs(l), Math.abs(r));
    if (most > peak) peak = most;
    if (most > 1) over++;
    const side = Math.abs(l - r);
    if (side > sideMost) sideMost = side;
    if (i >= half) {
      sums[0] = (sums[0] ?? 0) + l * l;
      sums[1] = (sums[1] ?? 0) + r * r;
    }
  }
  const count = Math.max(1, left.length - half);
  return {
    frames: left.length,
    peak,
    rms: [Math.sqrt((sums[0] ?? 0) / count), Math.sqrt((sums[1] ?? 0) / count)],
    sideMost,
    hits: rendered.hits,
    bad,
    over,
  };
}

/** Render one board and say what came out. */
export async function report(spec: RenderSpec): Promise<RenderReport> {
  return reportOf(await render(spec));
}

/** Render the same board twice, on two fresh engines, and compare the audio. */
export async function twice(
  spec: RenderSpec,
): Promise<{ first: RenderReport; worstDifference: number; differing: number; sameHits: boolean }> {
  const a = await render(spec);
  const b = await render(spec);
  let worstDifference = 0;
  let differing = 0;
  for (let channel = 0; channel < 2; channel++) {
    const x = a.channels[channel as 0 | 1];
    const y = b.channels[channel as 0 | 1];
    for (let i = 0; i < x.length; i++) {
      const difference = Math.abs((x[i] ?? 0) - (y[i] ?? 0));
      if (difference > 0) differing++;
      if (difference > worstDifference) worstDifference = difference;
    }
  }
  return {
    first: reportOf(a),
    worstDifference,
    differing,
    sameHits: JSON.stringify(a.hits) === JSON.stringify(b.hits),
  };
}

/**
 * The same comparison for a graph with none of this project in it: four plain
 * oscillators into one gain. What it shows is the browser's own floor — see
 * the note in tests/offline.test.ts on why two renders are not bit-identical.
 */
export async function browserFloor(oscillators: number): Promise<{ worstDifference: number; peak: number }> {
  const once = async (): Promise<Float32Array> => {
    const ctx = new OfflineAudioContext(1, 44100, 44100);
    const sum = ctx.createGain();
    sum.gain.value = 1 / oscillators;
    sum.connect(ctx.destination);
    for (let i = 0; i < oscillators; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 43.65 * (i + 1);
      osc.connect(sum);
      osc.start();
    }
    return (await ctx.startRendering()).getChannelData(0);
  };
  let worstDifference = 0;
  let peak = 0;
  // A few pairs: the order the browser sums in varies from run to run.
  for (let pair = 0; pair < 4; pair++) {
    const a = await once();
    const b = await once();
    for (let i = 0; i < a.length; i++) {
      worstDifference = Math.max(worstDifference, Math.abs((a[i] ?? 0) - (b[i] ?? 0)));
      peak = Math.max(peak, Math.abs(a[i] ?? 0));
    }
  }
  return { worstDifference, peak };
}
