import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ANALYSER,
  COMPRESSOR,
  CURVE,
  DEFAULT_BPM,
  DEFAULT_GLOBALS,
  IMPULSE,
  IMPULSE_SEEDS,
  LCG,
  LEVEL_SCALE,
  LOW_TAP,
  MASTER_CURVE,
  MASTER_GAIN,
  MASTER_OVERSAMPLE,
  NOISE,
  OUTPUT,
  POKE,
  ROOTS,
  SMOOTH,
  SMOOTH_POWER,
  SMOOTH_RETUNE,
  SOFT_START,
  VOICE_CAP,
} from '../src/engine/constants';
import { createEngine } from '../src/engine';
import type { Engine, EngineOptions, Modifier } from '../src/engine';
import { fillImpulse, heardGain, heardLength, impulseFiller } from '../src/engine/deterministic';
import {
  asAudioContext,
  asFake,
  FakeAudioContext,
  findNode,
  ramps,
  type FakeAnalyserNode,
  type FakeAudioNode,
  type FakeBiquadNode,
  type FakeBufferSourceNode,
  type FakeCompressorNode,
  type FakeGainNode,
  type FakeOscillatorNode,
  type FakeWaveShaperNode,
} from './support/fake-audio-context';

/** A started engine on a fake context, with the clock already off zero. */
function startEngine(opts: EngineOptions = {}): { engine: Engine; ctx: FakeAudioContext } {
  const ctx = new FakeAudioContext();
  ctx.currentTime = 5;
  const engine = createEngine({ ...opts, context: asAudioContext(ctx) });
  engine.start();
  // The spine's own suites never want the pulse running underneath them; it has
  // its own in tests/heartbeat.test.ts.
  engine.stop();
  return { engine, ctx };
}

/** The master chain, walked back out of the graph the engine built. */
function chain(engine: Engine) {
  const masterIn = asFake(engine.masterIn);
  const shaper = masterIn.nodes[0] as FakeWaveShaperNode;
  const comp = shaper.nodes[0] as FakeCompressorNode;
  const masterOut = comp.nodes[0] as FakeGainNode;
  const destination = masterOut.nodes[0] as FakeAudioNode;
  const analyser = masterOut.nodes[1] as FakeAnalyserNode;
  const lowFilter = masterOut.nodes[2] as FakeBiquadNode;
  const lowAnalyser = lowFilter.nodes[0] as FakeAnalyserNode;
  return { masterIn, shaper, comp, masterOut, destination, analyser, lowFilter, lowAnalyser };
}

/** A stand-in modifier box, so routing can be exercised before gt#4 lands. */
function registerModifier(engine: Engine, id: string): Modifier & { amounts: number[] } {
  const modifier = {
    id,
    in: engine.makeGain(1),
    out: engine.makeGain(1),
    amount: 0.5,
    amounts: [] as number[],
    set(amount: number) {
      this.amounts.push(amount);
    },
  };
  engine.modifiers[id] = modifier;
  return modifier;
}

/** Fill an analyser's next read with one constant byte. */
function holdAt(analyser: FakeAnalyserNode, byte: number): void {
  analyser.timeDomain = new Uint8Array(analyser.fftSize).fill(byte);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('master chain', () => {
  it('runs sum → grit → compressor → master gain → speakers', () => {
    const { engine } = startEngine();
    const { masterIn, shaper, comp, masterOut, destination } = chain(engine);

    expect(masterIn.nodes.map((node) => node.kind)).toEqual(['waveshaper']);
    expect(shaper.nodes.map((node) => node.kind)).toEqual(['compressor']);
    expect(comp.nodes.map((node) => node.kind)).toEqual(['gain']);
    expect(masterOut.nodes.map((node) => node.kind)).toEqual(['destination', 'analyser', 'biquad']);
    expect(destination.kind).toBe('destination');
  });

  it('sets the compressor, the master gain and the fixed light grit', () => {
    const { engine } = startEngine();
    const { shaper, comp, masterOut } = chain(engine);

    expect(comp.threshold.value).toBe(COMPRESSOR.threshold);
    expect(comp.ratio.value).toBe(COMPRESSOR.ratio);
    expect(comp.knee.value).toBe(COMPRESSOR.knee);
    expect(comp.attack.value).toBe(COMPRESSOR.attack);
    expect(comp.release.value).toBe(COMPRESSOR.release);
    expect(masterOut.gain.value).toBe(MASTER_GAIN);
    expect(shaper.oversample).toBe(MASTER_OVERSAMPLE);
    expect(shaper.curve).toBe(engine.curve(MASTER_CURVE));
  });

  it('climbs out of silence rather than arriving at full (gt#44)', () => {
    // The board still boots already playing — that rule is untouched — but it
    // arrives into whatever the system volume happens to be, and the content is
    // a compressed wall of low end. So the first four seconds are a ramp, and
    // the warning under the lever is the half of this that works on people who
    // read.
    const { engine, ctx } = startEngine();
    const { masterOut } = chain(engine);

    // The node keeps the reference's value; the automation is what it is doing.
    expect(masterOut.gain.value).toBe(MASTER_GAIN);
    expect(masterOut.gain.automation).toEqual([
      { call: 'set', value: 0, time: ctx.currentTime },
      { call: 'linear', value: MASTER_GAIN, time: ctx.currentTime + SOFT_START },
    ]);
    // Long enough to outlast the overlay and reach a volume knob, short enough
    // that the board is audibly running the whole way up. A rise tuned outside
    // this range is no longer the thing gt#44 asked for, in one direction or the
    // other, and should be argued for rather than nudged.
    expect(SOFT_START).toBeGreaterThanOrEqual(2);
    expect(SOFT_START).toBeLessThanOrEqual(6);
  });

  it('taps the master and a 150Hz lowpass into two analysers', () => {
    const { engine } = startEngine();
    const { analyser, lowFilter, lowAnalyser } = chain(engine);

    expect(analyser.fftSize).toBe(ANALYSER.fftSize);
    expect(analyser.smoothingTimeConstant).toBe(ANALYSER.smoothing);
    expect(lowFilter.type).toBe('lowpass');
    expect(lowFilter.frequency.value).toBe(LOW_TAP.frequency);
    expect(lowAnalyser.smoothingTimeConstant).toBe(LOW_TAP.smoothing);
    // engine2.js sets only the smoothing on the low tap, so its window stays the
    // Web Audio default — levels() sizes its buffer from the analyser, not a guess.
    expect(lowAnalyser.fftSize).toBe(2048);
  });

  it('is safe to start twice', () => {
    const { engine } = startEngine();
    const before = engine.masterIn;
    engine.start();
    expect(engine.masterIn).toBe(before);
  });
});

describe('levels', () => {
  it('reads as silence before the engine is started', () => {
    expect(createEngine().levels()).toEqual({ master: 0, low: 0 });
    expect(createEngine().started).toBe(false);
  });

  it('scales RMS on the master and on the low band, each by its own factor', () => {
    const { engine } = startEngine();
    const { analyser, lowAnalyser } = chain(engine);
    holdAt(analyser, 160); // (160 − 128) / 128 = .25
    holdAt(lowAnalyser, 160);

    expect(engine.levels()).toEqual({
      master: 0.25 * LEVEL_SCALE.master,
      low: 0.25 * LEVEL_SCALE.low,
    });
  });

  it('clamps a loud board to 1 rather than overdriving the visuals', () => {
    const { engine } = startEngine();
    const { analyser, lowAnalyser } = chain(engine);
    holdAt(analyser, 0);
    holdAt(lowAnalyser, 0);

    expect(engine.levels()).toEqual({ master: 1, low: 1 });
  });
});

// What gt#70 decided, as properties rather than as numbers — the same bargain
// tests/ear-tuning.test.ts strikes for the coefficients gt#20 moved by ear.
//
// The figures are raw RMS off the two taps on the running board, read in Chrome
// on 2026-11-14 over windows of 2048 samples, five to nine seconds a board (the
// opening board twice, and its row is the wider of the two readings at each
// end). They are what the scales were cut
// against, and they are here so that a later edit to either scale has to answer
// to them — or to a fresh set, which is the honest way to move one.
describe('the level reading', () => {
  /** Low tap: [min, median, max] per board. */
  const LOW = {
    opening: [0.277, 0.434, 0.516],
    smashedA: [0.232, 0.361, 0.516],
    smashedB: [0.226, 0.389, 0.463],
    smashedC: [0.234, 0.354, 0.416],
    smashedD: [0.186, 0.352, 0.488],
    everythingOn: [0.2, 0.333, 0.47],
    bassAlone: [0.368, 0.397, 0.443],
  } as const;

  /** Master tap: the loudest block on each board it was read on. */
  const MASTER_PEAK = { opening: 0.547, everythingOn: 0.438, bassAlone: 0.422, noBass: 0.386 } as const;

  const boards = Object.entries(LOW);

  it('never reaches the clamp on any board measured', () => {
    // The bug. At the reference's 3.5 every one of these medians was past 1, so
    // the reading was the clamp, on every frame, and the room followed nothing.
    for (const [board, [, , max]] of boards) {
      expect(max * LEVEL_SCALE.low, board).toBeLessThan(1);
    }
    for (const [board, peak] of Object.entries(MASTER_PEAK)) {
      expect(peak * LEVEL_SCALE.master, board).toBeLessThan(1);
    }
    // …where the reference's pair puts the opening board's *median* past the
    // clamp on the low tap, and its peaks past it on the master.
    expect(LOW.opening[1] * 3.5).toBeGreaterThan(1);
    expect(MASTER_PEAK.opening * 2.5).toBeGreaterThan(1);
  });

  it('uses the range it has, rather than hiding at the bottom of it', () => {
    // Headroom is not the goal on its own — a scale of .1 has plenty. The
    // loudest board measured should land near the top, so the room's whole
    // travel is available to the sound that actually exists.
    const loudest = Math.max(...boards.map(([, [, , max]]) => max));
    expect(loudest * LEVEL_SCALE.low).toBeGreaterThan(0.85);
    expect(Math.max(...Object.values(MASTER_PEAK)) * LEVEL_SCALE.master).toBeGreaterThan(0.85);
  });

  it('moves within a single board, which is the only movement there is to show', () => {
    // After the compressor, how *much* is playing barely registers: BASS alone
    // reads as high as all eleven modules together. What is left to follow is
    // each board's own swell, and every board measured has a fifth of the range
    // or more between its quietest moment and its loudest.
    for (const [board, [min, , max]] of boards) {
      if (board === 'bassAlone') continue;
      expect((max - min) * LEVEL_SCALE.low, board).toBeGreaterThan(0.2);
    }
    expect(LOW.bassAlone[1]).toBeGreaterThan(LOW.everythingOn[1]);
  });
});

describe('deterministic buffers', () => {
  it('generates the same noise on every load', () => {
    const first = startEngine().engine.noiseBuffer;
    const second = startEngine().engine.noiseBuffer;

    expect(first.length).toBe(Math.floor(NOISE.seconds * 44100));
    expect(first.getChannelData(0)).toEqual(second.getChannelData(0));
    expect(first.getChannelData(0).some((sample) => sample !== 0)).toBe(true);
  });

  it('generates the same reverb impulses, one seed per channel', () => {
    const first = startEngine().engine.impulse(0.05, 3);
    const second = startEngine().engine.impulse(0.05, 3);

    expect(first.numberOfChannels).toBe(IMPULSE_SEEDS.length);
    expect(first.getChannelData(0)).toEqual(second.getChannelData(0));
    expect(first.getChannelData(1)).toEqual(second.getChannelData(1));
    expect(first.getChannelData(0)).not.toEqual(first.getChannelData(1));
  });

  // The first law, for the room that is written in pieces (gt#30): one generator
  // runs the length of the channel, so where the cuts fall changes nothing.
  it('writes the same impulse however the work is cut up', () => {
    const whole = new Float32Array(1000);
    fillImpulse(whole, IMPULSE_SEEDS[0], 4.2);

    for (const cut of [1, 7, 256, 999, 1000, 5000]) {
      const pieces = new Float32Array(1000);
      const fill = impulseFiller(pieces, IMPULSE_SEEDS[0], 4.2);
      let calls = 0;
      while (fill(cut)) calls++;

      expect(pieces, `cut every ${cut}`).toEqual(whole);
      expect(calls + 1, `cut every ${cut}`).toBe(Math.ceil(1000 / cut));
      // Asked again once it is done, it writes nothing and says so.
      expect(fill(cut)).toBe(false);
      expect(pieces).toEqual(whole);
    }
  });

  // The buffer may be only the front of the impulse — the part that can be
  // heard — and what it holds has to be the front of the *same* impulse, or
  // cutting the tail would have changed the room.
  it('keeps the front of the same impulse when its silent tail is cut', () => {
    const whole = new Float32Array(1000);
    fillImpulse(whole, IMPULSE_SEEDS[0], 4.2);

    const kept = heardLength(1000, 4.2);
    expect(kept).toBeLessThan(1000);
    expect(kept).toBeGreaterThan(800);
    const front = new Float32Array(kept);
    fillImpulse(front, IMPULSE_SEEDS[0], 4.2, 1000);
    expect(front).toEqual(whole.slice(0, kept));

    // Cut up as well as cut short, it is still those samples.
    const pieces = new Float32Array(kept);
    const fill = impulseFiller(pieces, IMPULSE_SEEDS[0], 4.2, 1000);
    while (fill(64));
    expect(pieces).toEqual(front);

    // And everything left off was under the floor: eighty decibels down.
    const peak = Math.max(...Array.from(whole.slice(kept), Math.abs));
    expect(peak).toBeLessThanOrEqual(IMPULSE.floor);
    expect(heardGain(1000, 4.2)).toBeCloseTo(Math.sqrt(1000 / kept), 12);
  });

  it('has nothing to cut from an impulse with no decay, or no length', () => {
    expect(heardLength(1000, 0)).toBe(1000);
    expect(heardLength(0, 3)).toBe(0);
    expect(heardLength(1, 3)).toBe(1);
    expect(heardGain(1000, 0)).toBe(1);
    expect(heardGain(0, 3)).toBe(1);
    // A steeper decay goes silent sooner, so more of it goes.
    expect(heardLength(48000, 8)).toBeLessThan(heardLength(48000, 3));
  });

  it('decays each impulse toward silence', () => {
    const impulse = startEngine().engine.impulse(0.05, 3);
    const data = impulse.getChannelData(0);
    const tenth = Math.floor(data.length / 10);
    const peak = (window: Float32Array) => Math.max(...Array.from(window, Math.abs));

    expect(peak(data.slice(0, tenth))).toBeGreaterThan(peak(data.slice(-tenth)) * 10);
  });

  it('memoises waveshaper curves against a quantised amount', () => {
    const { engine } = startEngine();

    expect(engine.curve(0.5)).toBe(engine.curve(0.51));
    expect(engine.curve(0.5)).not.toBe(engine.curve(0.53));
    expect(engine.curve(0.5)).toHaveLength(CURVE.points);
    expect(engine.curve(0.5)[0]).toBeCloseTo(-1);
    expect(engine.curve(0.5)[CURVE.points - 1]).toBeCloseTo(1);
  });
});

describe('globals', () => {
  it('drops the root a full octave across SERIOUSNESS', () => {
    const { engine } = startEngine();
    for (let tuning = 0; tuning < ROOTS.length; tuning++) {
      engine.setGlobal('tuning', tuning);
      for (const seriousness of [0, 0.38, 0.5, 1]) {
        engine.setGlobal('seriousness', seriousness);
        expect(engine.root()).toBeCloseTo((ROOTS[tuning] as number) * Math.pow(2, -seriousness), 10);
      }
    }
  });

  it('opens on DEEP at the default seriousness', () => {
    const { engine } = startEngine();
    expect(engine.globals).toEqual({ ...DEFAULT_GLOBALS });
    expect(engine.bpm).toBe(DEFAULT_BPM);
  });

  it('retunes every source and crossfades the boxes that listen', () => {
    const { engine } = startEngine();
    const roots: number[] = [];
    const outlet = engine.makeOutlet('bass', 0.7);
    outlet.retune = (root) => roots.push(root);
    const seriousness: number[] = [];
    const cavern = registerModifier(engine, 'cavern');
    cavern.setSeriousness = (value) => seriousness.push(value);

    engine.setGlobal('seriousness', 0.9);

    expect(roots).toEqual([engine.root()]);
    expect(seriousness).toEqual([0.9]);
  });
});

describe('node factories', () => {
  it('counts one-shot voices in and back out again', () => {
    const { engine } = startEngine();
    expect(engine.active).toBe(0);

    const noise = engine.makeNoiseSource() as unknown as FakeBufferSourceNode;
    const burst = engine.makeBurstOsc('sine', 60, 1, 2) as unknown as FakeOscillatorNode;
    expect(engine.active).toBe(2);
    expect(noise.loop).toBe(true);
    expect(noise.buffer).toBe(engine.noiseBuffer);
    expect(burst.life).toEqual([
      { call: 'start', at: 1 },
      { call: 'stop', at: 2 },
    ]);

    noise.onended?.();
    burst.onended?.();
    expect(engine.active).toBe(0);
  });

  it('leaves sustaining nodes out of the voice count', () => {
    const { engine } = startEngine();
    engine.makeGain(0.5);
    engine.makeOsc('sawtooth', 110, -13);
    engine.makeBiquad('lowpass', 1600, 0.8);
    // A session-long noise tap is the same kind of thing as a free-running
    // oscillator: it never ends, so it never hands a voice back (gt#31).
    const loop = engine.makeNoiseLoop() as unknown as FakeBufferSourceNode;
    expect(loop.loop).toBe(true);
    expect(loop.buffer).toBe(engine.noiseBuffer);
    expect(loop.onended).toBeFalsy();
    expect(engine.active).toBe(0);
  });

  it('gives each source a loud → power pair, silent until asked', () => {
    const { engine } = startEngine();
    const outlet = engine.makeOutlet('guitar', 0.45);

    expect(engine.sources['guitar']).toBe(outlet);
    expect(asFake(outlet.loud).nodes).toEqual([asFake(outlet.pow)]);
    expect(outlet.loud.gain.value).toBe(0);
    expect(outlet.pow.gain.value).toBe(0);
    expect(outlet.on).toBe(false);
  });
});

describe('routing', () => {
  it('sends unwired sources and unwired boxes straight to the speakers', () => {
    const { engine } = startEngine();
    const outlet = engine.makeOutlet('guitar', 0.45);
    const grit = registerModifier(engine, 'grit');
    engine.route();

    expect(asFake(outlet.pow).nodes).toEqual([asFake(engine.masterIn)]);
    expect(asFake(grit.out).nodes).toEqual([asFake(engine.masterIn)]);
  });

  it('follows the wire list, including box to box', () => {
    const { engine } = startEngine();
    const outlet = engine.makeOutlet('guitar', 0.45);
    const grit = registerModifier(engine, 'grit');
    const cavern = registerModifier(engine, 'cavern');

    engine.setWires([
      { from: 'guitar', to: 'grit' },
      { from: 'grit', to: 'cavern' },
    ]);

    expect(asFake(outlet.pow).nodes).toEqual([asFake(grit.in)]);
    expect(asFake(grit.out).nodes).toEqual([asFake(cavern.in)]);
    expect(asFake(cavern.out).nodes).toEqual([asFake(engine.masterIn)]);
  });

  it('lets one source fan out to several boxes', () => {
    const { engine } = startEngine();
    const outlet = engine.makeOutlet('guitar', 0.45);
    const grit = registerModifier(engine, 'grit');
    const murk = registerModifier(engine, 'murk');

    engine.setWires([
      { from: 'guitar', to: 'grit' },
      { from: 'guitar', to: 'murk' },
    ]);

    expect(asFake(outlet.pow).nodes).toEqual([asFake(grit.in), asFake(murk.in)]);
  });

  it('ignores a wire to a box that does not exist', () => {
    const { engine } = startEngine();
    const outlet = engine.makeOutlet('guitar', 0.45);

    engine.setWires([{ from: 'guitar', to: 'tremolo' }]);

    expect(asFake(outlet.pow).nodes).toEqual([asFake(engine.masterIn)]);
  });

  it('rebuilds rather than accumulates, so re-applying a patch changes nothing', () => {
    const { engine } = startEngine();
    const outlet = engine.makeOutlet('guitar', 0.45);
    const grit = registerModifier(engine, 'grit');
    const wires = [{ from: 'guitar', to: 'grit' }];

    engine.setWires(wires);
    engine.setWires(wires);

    expect(asFake(outlet.pow).nodes).toEqual([asFake(grit.in)]);
  });

  it('keeps its own copy of the wire list', () => {
    const { engine } = startEngine();
    const outlet = engine.makeOutlet('guitar', 0.45);
    const grit = registerModifier(engine, 'grit');
    const wires = [{ from: 'guitar', to: 'grit' }];

    engine.setWires(wires);
    wires.length = 0;

    expect(engine.wires).toEqual([{ from: 'guitar', to: 'grit' }]);
    expect(asFake(outlet.pow).nodes).toEqual([asFake(grit.in)]);
  });
});

describe('control surface', () => {
  it('scales HOW LOUD by the module ceiling and smooths it', () => {
    const { engine, ctx } = startEngine();
    const outlet = engine.makeOutlet('guitar', 0.45);

    engine.setLoud('guitar', 0.5);

    expect(outlet.loudV).toBe(0.5);
    expect(outlet.loud.gain.value).toBe(0.225);
    expect(ramps(outlet.loud.gain)).toEqual([
      { value: 0.225, time: ctx.currentTime, constant: SMOOTH },
    ]);
  });

  it('gates power on its own, slower constant', () => {
    const { engine, ctx } = startEngine();
    const outlet = engine.makeOutlet('guitar', 0.45);

    engine.setPower('guitar', true);
    engine.setPower('guitar', false);

    expect(outlet.on).toBe(false);
    expect(ramps(outlet.pow.gain)).toEqual([
      { value: 1, time: ctx.currentTime, constant: SMOOTH_POWER },
      { value: 0, time: ctx.currentTime, constant: SMOOTH_POWER },
    ]);
  });

  it('passes character through to the module and remembers HOW OFTEN', () => {
    const { engine } = startEngine();
    const outlet = engine.makeOutlet('chainsaw', 0.42);
    const chars: number[] = [];
    outlet.setChar = (value) => chars.push(value);

    engine.setChar('chainsaw', 0.8);
    engine.setOften('chainsaw', 4);

    expect(chars).toEqual([0.8]);
    expect(outlet.charV).toBe(0.8);
    expect(outlet.often).toBe(4);
  });

  it('applies a modifier amount and keeps it', () => {
    const { engine } = startEngine();
    const grit = registerModifier(engine, 'grit');

    engine.setMod('grit', 0.75);

    expect(grit.amount).toBe(0.75);
    expect(grit.amounts).toEqual([0.75]);
  });

  it('shrugs off ids that are not on the board', () => {
    const { engine } = startEngine();
    expect(() => {
      engine.setPower('theremin', true);
      engine.setLoud('theremin', 0.5);
      engine.setChar('theremin', 0.5);
      engine.setOften('theremin', 1);
      engine.setMod('tremolo', 0.5);
    }).not.toThrow();
  });

  it('takes a new tempo', () => {
    const { engine } = startEngine();
    engine.setBpm(66);
    expect(engine.bpm).toBe(66);
  });
});

describe('poke', () => {
  function pokeable(opts: EngineOptions = {}) {
    const { engine, ctx } = startEngine(opts);
    const hits: number[] = [];
    const outlet = engine.makeOutlet('slowhit', 0.85);
    outlet.trigger = (time) => hits.push(time);
    return { engine, ctx, outlet, hits };
  }

  it('fires a hit when a silent strike module is touched', () => {
    const { engine, ctx, hits } = pokeable();

    engine.setPower('slowhit', true);

    expect(hits).toHaveLength(1);
    expect(hits[0]).toBeCloseTo(ctx.currentTime + POKE.lead);
  });

  it('does not stutter when the same control is worked', () => {
    const { engine, ctx, hits } = pokeable();

    engine.setPower('slowhit', true);
    engine.setLoud('slowhit', 0.6);
    engine.setChar('slowhit', 0.4);
    expect(hits).toHaveLength(1);

    ctx.currentTime += POKE.idle + POKE.debounce;
    engine.setChar('slowhit', 0.5);
    expect(hits).toHaveLength(2);
  });

  it('stays quiet for a module that is off, or has nothing to fire', () => {
    const { engine, outlet, hits } = pokeable();

    engine.setLoud('slowhit', 0.6);
    expect(hits).toEqual([]);

    outlet.on = true;
    delete outlet.trigger;
    expect(() => engine.setLoud('slowhit', 0.7)).not.toThrow();
  });

  it('skips rather than exceed the voice cap', () => {
    const { engine, hits } = pokeable();
    engine.active = VOICE_CAP;

    engine.setPower('slowhit', true);

    expect(hits).toEqual([]);
  });

  it('announces the strike so the bloom layer can answer', () => {
    vi.useFakeTimers();
    const struck: string[] = [];
    const { engine } = pokeable({ onStrike: (id) => struck.push(id) });

    engine.setPower('slowhit', true);
    expect(struck).toEqual([]);
    vi.advanceTimersByTime(POKE.callbackDelayMs);
    expect(struck).toEqual(['slowhit']);
  });

  // The audio clock runs ahead of the ear by the output's own buffer, and the
  // board asks for a deep one (see OUTPUT). So what the board is told about a
  // sound is told that much later, or every flash would lead its hit.
  describe('told when it is heard, not when the clock says', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    /** An engine on a context that reports how far behind its speakers are. */
    function late(seconds: unknown, opts: EngineOptions = {}): Engine {
      const { engine, ctx } = startEngine(opts);
      (ctx as unknown as { outputLatency: unknown }).outputLatency = seconds;
      return engine;
    }

    it('holds a strike and a beat back by the output latency', () => {
      vi.useFakeTimers();
      const told: string[] = [];
      const engine = late(0.12, { onStrike: (id) => told.push(id), onBeat: (count) => told.push(`beat ${count}`) });

      engine.announce('cow', 40);
      engine.pulse(7, 40);
      vi.advanceTimersByTime(40 + 119);
      expect(told).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(told).toEqual(['cow', 'beat 7']);
    });

    it('believes a device only so far', () => {
      vi.useFakeTimers();
      const told: string[] = [];
      const engine = late(4, { onStrike: (id) => told.push(id) });

      engine.announce('cow', 0);
      vi.advanceTimersByTime(OUTPUT.maxLatency * 1000 - 1);
      expect(told).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(told).toEqual(['cow']);
    });

    it('adds nothing for a context that does not say, or says nonsense', () => {
      // An offline render has no speakers; a browser that has not measured yet
      // reports zero. Neither moves the picture off the clock.
      for (const reported of [undefined, 0, -1, Number.NaN, '0.1']) {
        vi.useFakeTimers();
        const told: string[] = [];
        const engine = late(reported, { onStrike: (id) => told.push(id) });

        engine.announce('cow', 25);
        vi.advanceTimersByTime(24);
        expect(told, String(reported)).toEqual([]);
        vi.advanceTimersByTime(1);
        expect(told, String(reported)).toEqual(['cow']);
        vi.useRealTimers();
      }
    });
  });

  it('asks the browser for a deep buffer when it opens its own context', () => {
    // Not the default, which is the shortest the device has: this is a drone,
    // not an instrument played in time, and a buffer missed once is a click.
    const asked: unknown[] = [];
    class Opened extends FakeAudioContext {
      constructor(options?: unknown) {
        super();
        asked.push(options);
      }
    }
    vi.stubGlobal('AudioContext', Opened);
    try {
      const engine = createEngine();
      engine.start();
      engine.stop();
      expect(asked).toEqual([{ latencyHint: OUTPUT.latencyHint }]);
      expect(OUTPUT.latencyHint).toBe('playback');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('constants', () => {
  it('holds every spine constant to the original design', () => {
    const pins: Array<[string, unknown, unknown]> = [
      ['TUNING roots', ROOTS, [55, 49, 43.65, 38.89, 32.7, 27.5]],
      ['default globals', [DEFAULT_GLOBALS.seriousness, DEFAULT_GLOBALS.tuning], [0.38, 2]],
      ['default bpm', DEFAULT_BPM, 48],
      ['parameter smoothing', SMOOTH, 0.055],
      ['retune smoothing', SMOOTH_RETUNE, 0.09],
      ['power smoothing', SMOOTH_POWER, 0.06],
      ['master grit', MASTER_CURVE, 0.1],
      ['master oversample', MASTER_OVERSAMPLE, '2x'],
      ['compressor threshold', COMPRESSOR.threshold, -16],
      ['compressor ratio', COMPRESSOR.ratio, 5],
      ['compressor knee', COMPRESSOR.knee, 14],
      ['compressor attack', COMPRESSOR.attack, 0.01],
      ['compressor release', COMPRESSOR.release, 0.3],
      ['master gain', MASTER_GAIN, 0.8],
      ['analyser window', ANALYSER.fftSize, 512],
      ['analyser smoothing', ANALYSER.smoothing, 0.7],
      ['low tap cutoff', LOW_TAP.frequency, 150],
      ['low tap smoothing', LOW_TAP.smoothing, 0.6],
      // Neither level scale is pinned: both were re-cut by measurement (gt#70),
      // from the original design's 2.5 (master) and 3.5 (low), a pair that
      // pinned the room at its ceiling. What they were moved *for* is held
      // below, in 'the level reading'.
      ['noise length', NOISE.seconds, 2.5],
      ['noise seed', NOISE.seed, 22222],
      ['impulse seeds', [IMPULSE_SEEDS[1], IMPULSE_SEEDS[0]], [911, 733]],
      ['generator', [LCG.multiplier, LCG.modulus], [16807, 2147483647]],
      ['curve points', CURVE.points, 1024],
      ['curve quantisation', CURVE.steps, 32],
      ['curve drive', [CURVE.steps, CURVE.depth, CURVE.floor], [32, 55, 1.5]],
      // The voice cap is not pinned: it was re-cut by measurement (gt#68) from the
      // original design's 24. What it was moved *for* is held in
      // tests/heartbeat.test.ts.
      ['poke idle', POKE.idle, 1],
      ['poke debounce', POKE.debounce, 0.9],
      ['poke lead', POKE.lead, 0.03],
      ['strike callback delay', POKE.callbackDelayMs, 40],
    ];

    for (const [name, actual, pinned] of pins) expect(actual, name).toEqual(pinned);
  });

  it('keeps the fixed light grit distinct from an untouched signal', () => {
    const { engine } = startEngine();
    const curve = engine.curve(MASTER_CURVE);
    expect(curve[CURVE.points / 2]).toBeGreaterThan(0);
    expect(findNode(asFake(engine.masterIn), 'waveshaper').kind).toBe('waveshaper');
  });
});
