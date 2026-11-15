// The eleven sources against the real board. The spine's outlet bookkeeping has
// its own tests in engine-core; these are the topologies themselves — what each
// module builds, what its one character control does to that, and what a strike
// actually schedules when the heartbeat asks for it.
//
// Drones are walked back out of the graph by asking the context which node feeds
// which. Strikes build nothing until triggered, so they are read from the nodes a
// single trigger created.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ACCENTS,
  BASS,
  CHAINSAW,
  COW,
  CYMBAL,
  DRONE_IDS,
  GUITAR,
  INTERVALS,
  LASER,
  MARACAS,
  ROOTS,
  SAX,
  SLOWHIT,
  SMOOTH,
  SMOOTH_RETUNE,
  SOURCE_IDS,
  STRIKE_IDS,
  THROAT,
  VOICE,
  VOICE_CAP,
  VOICE_MODES,
} from '../src/engine/constants';
import type { Engine, Outlet } from '../src/engine';
import { SOURCE_SPECS } from '../src/engine/sources';
import { fullBoard, source } from './support/board';
import {
  asFake,
  automation,
  ramps,
  type FakeAudioContext,
  type FakeAudioNode,
  type FakeBiquadNode,
  type FakeBufferSourceNode,
  type FakeDelayNode,
  type FakeGainNode,
  type FakeOscillatorNode,
  type FakeParam,
  type FakeWaveShaperNode,
} from './support/fake-audio-context';
import { transcribed } from './support/original-design';

// ------------------------------------------------------------------- walking

/** Every node this context made that feeds `target`, in the order they were built. */
function feeding(ctx: FakeAudioContext, target: FakeAudioNode | FakeParam | AudioParam): FakeAudioNode[] {
  return ctx.created.filter((node) => node.connections.includes(target as never));
}

/** The one node feeding `target`. Throws unless there is exactly one. */
function feeder(ctx: FakeAudioContext, target: FakeAudioNode | FakeParam | AudioParam): FakeAudioNode {
  const found = feeding(ctx, target);
  if (found.length !== 1) throw new Error(`Expected one feeder, found ${found.length}.`);
  return found[0] as FakeAudioNode;
}

/** The nodes a single trigger built, which is the only place a strike exists. */
function fire(ctx: FakeAudioContext, outlet: Outlet, time: number): FakeAudioNode[] {
  const before = ctx.created.length;
  outlet.trigger?.(time);
  return ctx.created.slice(before);
}

const of = (nodes: FakeAudioNode[], kind: string) => nodes.filter((node) => node.kind === kind);

/** A drone, set to one character value and read back. */
function charged(engine: Engine, id: (typeof DRONE_IDS)[number], value: number): Outlet {
  const outlet = source(engine, id);
  outlet.setChar?.(value);
  return outlet;
}

// -------------------------------------------------------------------- boards

describe('the eleven sources', () => {
  it('registers every module in board order, with its own ceiling', () => {
    const { engine } = fullBoard();

    expect(Object.keys(engine.sources)).toEqual([...SOURCE_IDS]);
    expect(SOURCE_IDS.map((id) => source(engine, id).maxGain)).toEqual([
      GUITAR.maxGain,
      BASS.maxGain,
      CHAINSAW.maxGain,
      SAX.maxGain,
      THROAT.maxGain,
      SLOWHIT.maxGain,
      CYMBAL.maxGain,
      VOICE.maxGain,
      MARACAS.maxGain,
      COW.maxGain,
      LASER.maxGain,
    ]);
  });

  it('gives every module a loud → power pair the router can place', () => {
    const { engine } = fullBoard();

    for (const id of SOURCE_IDS) {
      const outlet = source(engine, id);
      expect(asFake(outlet.loud).nodes).toEqual([asFake(outlet.pow)]);
      expect(asFake(outlet.pow).nodes).toEqual([asFake(engine.masterIn)]);
      // Nothing is audible until the board says so, whatever it has built.
      expect(outlet.loud.gain.value).toBe(0);
      expect(outlet.pow.gain.value).toBe(0);
    }
  });

  it('separates the two archetypes: drones sustain, strikes fire', () => {
    const { engine } = fullBoard();

    for (const id of DRONE_IDS) {
      const outlet = source(engine, id);
      expect(outlet.setChar).toBeTypeOf('function');
      expect(outlet.retune).toBeTypeOf('function');
      // A drone has nothing to fire; its sound is already running.
      expect(outlet.trigger).toBeUndefined();
      expect(outlet.phase).toBeUndefined();
    }

    for (const id of STRIKE_IDS) {
      const outlet = source(engine, id);
      expect(outlet.trigger).toBeTypeOf('function');
      // A strike reads its character at trigger time, so it needs no setter.
      expect(outlet.setChar).toBeUndefined();
      expect(outlet.retune).toBeUndefined();
    }
  });

  it('offsets the strikes so they never pile onto the same beat', () => {
    const { engine } = fullBoard();

    expect(STRIKE_IDS.map((id) => source(engine, id).phase)).toEqual([0, 2, 1, 0, 3, 5]);
  });

  it('gives the sixth strike an offset that is its own where it matters', () => {
    // The handoff's five offsets used every class mod 4, so LASER CANNON could
    // not be collision-free everywhere and had to pick where to collide (gt#42).
    // It is alone on the two sparse divisors, which are the only settings a shot
    // that size is ever put on, and it opens on the sparsest of them.
    const { engine } = fullBoard();
    const others = STRIKE_IDS.filter((id) => id !== 'laser').map((id) => source(engine, id).phase ?? 0);

    for (const divisor of [8, 16]) {
      const taken = others.map((phase) => phase % divisor);
      expect(taken, `divisor ${divisor}`).not.toContain(LASER.phase % divisor);
    }
  });

  it('opens THE VOICE on CHANT, unlike every other module', () => {
    const { engine } = fullBoard();

    expect(source(engine, 'voice').charV).toBe(VOICE.initialChar);
    for (const id of SOURCE_IDS) {
      if (id !== 'voice') expect(source(engine, id).charV).toBe(0.5);
    }
  });
});

// ------------------------------------------------------------------ registry

// The registry is what a tenth module is added to, so these are the assertions
// that fail when one is added badly. The typed ones — a missing entry, a strike
// with no phase — are compile errors rather than test failures and cannot be
// written here; what is left is the pair of facts TypeScript cannot see, both of
// them agreements between two lists that are unable to import each other.
describe('the source registry', () => {
  it('holds exactly the eleven modules, in build order', () => {
    expect(Object.keys(SOURCE_SPECS)).toEqual([...SOURCE_IDS]);
  });

  it('agrees with the scheduler about which modules strike', () => {
    // STRIKE_IDS stays the heartbeat's list and the UI's archetype; the registry
    // names the same fact a second time because ../constants cannot import a
    // module that imports the engine. Two statements of one fact are safe only
    // while something holds them together, and this is that something.
    const byType = (type: 'drone' | 'strike') =>
      SOURCE_IDS.filter((id) => SOURCE_SPECS[id].type === type);

    expect(byType('strike')).toEqual([...STRIKE_IDS]);
    expect(byType('drone')).toEqual([...DRONE_IDS]);
  });

  it('carries the ceiling and the offset the module is actually built with', () => {
    const { engine } = fullBoard();

    for (const id of SOURCE_IDS) {
      const spec = SOURCE_SPECS[id];
      const outlet = source(engine, id);
      expect(outlet.maxGain, id).toBe(spec.maxGain);
      // A drone has no beat to be offset from, and the union says so.
      expect(outlet.phase, id).toBe(spec.type === 'strike' ? spec.phase : undefined);
      expect(outlet.charV, id).toBe(spec.initialChar ?? 0.5);
      // The word becomes a ratio here and nowhere else (gt#38).
      expect(outlet.interval, id).toBe(INTERVALS[spec.interval]);
      expect(engine.rootOf(outlet), id).toBeCloseTo(engine.root() * INTERVALS[spec.interval], 10);
    }
  });
});

// ------------------------------------------------------------------ intervals

// gt#38's first bullet, and the only part of it that ships without a new control:
// a registry entry names an interval off the root, so the nine modules are a
// chord rather than nine voices agreeing.
//
// The issue's hard constraint is that any interval set "has to be checked with
// every module on at once, at every TUNING position, at both ends of
// SERIOUSNESS" — nine sources on one root being safe only because it is trivial.
// These are that check, and they are arithmetic rather than an ear, because the
// intervals are just ratios: see INTERVALS in ../src/engine/constants.
describe('the intervals the board sits on', () => {
  /**
   * Every nominal multiplier each module places off its own root, before any
   * gesture moves it. The bends are deliberately absent: CHAINSAW's REVS,
   * SLOW HIT's drop, COW's fall and THE VOICE's mode bend are all continuous
   * sweeps *within* a strike, and were never rational before this issue either.
   */
  const NOMINAL: Record<(typeof SOURCE_IDS)[number], readonly number[]> = {
    guitar: GUITAR.mults,
    bass: [1, BASS.sawMult],
    chainsaw: [CHAINSAW.mult],
    sax: [SAX.mult],
    // THROAT's whistle is deliberately absent and its absence is the point: a
    // bandpass is not a partial. It can only amplify harmonics the sawtooth
    // already has, so the one pitch this module places is the saw itself, and
    // the overtone follows wherever that goes by construction.
    throat: [THROAT.mult],
    slowhit: [SLOWHIT.startMult],
    cymbal: [],
    voice: VOICE_MODES.filter((mode) => mode.osc).map((mode) => mode.mult),
    maracas: [],
    cow: [COW.mult],
    // The shot's start. Its sweep is a bend and is excluded for the same reason
    // COW's fall is — a continuous glide inside a strike was never rational.
    laser: [LASER.startMult],
  };

  /** Every pitch the board nominally holds, as a multiple of the board's root. */
  function partials(): number[] {
    const found: number[] = [];
    for (const id of SOURCE_IDS) {
      const ratio = INTERVALS[SOURCE_SPECS[id].interval];
      for (const mult of NOMINAL[id]) found.push(mult * ratio);
    }
    return found;
  }

  it('is a set of just ratios, and never an equal-tempered one', () => {
    // Twelve-tone ratios are irrational and would break the invariant below on
    // the first decimal. Each of these is a small-integer fraction.
    expect(INTERVALS.root).toBe(1);
    expect(INTERVALS.minorThird).toBeCloseTo(6 / 5, 12);
    expect(INTERVALS.fifth).toBeCloseTo(3 / 2, 12);
    expect(INTERVALS.octave).toBe(2);

    for (const [name, ratio] of Object.entries(INTERVALS)) {
      expect(ratio, name).toBeGreaterThanOrEqual(1);
      expect(ratio, name).toBeLessThanOrEqual(2);
      // The semitone an equal temperament would land on, which none of these are.
      for (let step = 1; step < 12; step++) {
        if (Math.abs(ratio - Math.pow(2, step / 12)) < 1e-12) throw new Error(`${name} is tempered`);
      }
    }
  });

  it('puts the whole board in one harmonic series, which is why nothing can clash', () => {
    // The safety argument, stated as arithmetic. Multiply every nominal pitch on
    // the board by ten and every one is a whole number, so every voice is an
    // integer multiple of a single implied fundamental at root/10. Two harmonics
    // of one fundamental cannot be out of tune with each other — there is no ear
    // judgment anywhere in this assertion.
    const scaled = partials().map((partial) => partial * 10);

    for (const value of scaled) expect(Math.abs(value - Math.round(value))).toBeLessThan(1e-9);
    expect(scaled.map(Math.round).sort((a, b) => a - b)).toEqual([
      10, 10, 20, 20, 20, 20, 30, 30, 30, 30, 40, 48, 60, 120, 480,
    ]);
  });

  it('holds that series at every TUNING position and both ends of SERIOUSNESS', () => {
    // The issue's own condition, run exhaustively rather than argued.
    const { engine } = fullBoard();

    for (let tuning = 0; tuning < ROOTS.length; tuning++) {
      for (const seriousness of [0, 1]) {
        engine.setGlobal('tuning', tuning);
        engine.setGlobal('seriousness', seriousness);
        const fundamental = engine.root() / 10;

        for (const id of SOURCE_IDS) {
          const outlet = source(engine, id);
          for (const mult of NOMINAL[id]) {
            const harmonic = (engine.rootOf(outlet) * mult) / fundamental;
            expect(Math.abs(harmonic - Math.round(harmonic)), `${id} @ ${tuning}/${seriousness}`)
              .toBeLessThan(1e-6);
          }
        }
      }
    }
  });

  it('is a minor chord, and holds no major third at all', () => {
    // What the intervals actually buy. Fold every partial into one octave and
    // the board holds exactly three pitches: the root, a minor third, a fifth.
    //
    // The major third is asserted absent rather than merely unlisted, because it
    // was *present* before this issue — COW's `mult` of 5 is a just major third
    // two octaves up, so the board was an accidental major chord — and a minor
    // third beside a major one is a 25/24 semitone, which is the exact clash the
    // issue's "the moment two of them disagree" warns about.
    const classes = new Set(
      partials().map((partial) => {
        let folded = partial;
        while (folded >= 2) folded /= 2;
        while (folded < 1) folded *= 2;
        return Math.round(folded * 1000) / 1000;
      }),
    );

    expect([...classes].sort((a, b) => a - b)).toEqual([1, 1.2, 1.5]);
    expect(classes.has(1.25)).toBe(false);
  });

  it('keeps the third off the floor, where it would be a beat rather than a chord', () => {
    // The one interval with a height requirement, and the reason the wall, the
    // floor and the slow hit all name `root`. At BEDROCK with SERIOUSNESS all
    // the way over the root is 13.75Hz, and a minor third down there is two
    // sub-bass voices a few Hz apart — a wobble, not a chord.
    //
    // The fifth is deliberately exempt and THE VOICE proves it is needed: GROWL
    // sits at 41.25Hz here, under any floor a third would have to clear. A fifth
    // is the one interval that is safe at any depth — it is what a power chord
    // is made of — because 3/2 against 1/1 is the widest spacing available
    // before the octave, and every partial it makes lands on one already there.
    const { engine } = fullBoard();
    engine.setGlobal('tuning', ROOTS.length - 1);
    engine.setGlobal('seriousness', 1);

    let thirds = 0;
    for (const id of SOURCE_IDS) {
      const outlet = source(engine, id);
      if (outlet.interval !== INTERVALS.minorThird) continue;
      thirds++;
      const lowest = Math.min(...NOMINAL[id].map((mult) => engine.rootOf(outlet) * mult));
      expect(lowest, id).toBeGreaterThan(60);
    }
    // A rule that no module is subject to is not a rule.
    expect(thirds).toBeGreaterThan(0);
  });
});

// -------------------------------------------------------------------- drones

/** GUITAR WALL: four saws → four gains → pre → lowpass → loud. */
function guitar(engine: Engine, ctx: FakeAudioContext) {
  const outlet = source(engine, 'guitar');
  const lowpass = feeder(ctx, asFake(outlet.loud)) as FakeBiquadNode;
  const pre = feeder(ctx, lowpass) as FakeGainNode;
  const gains = feeding(ctx, pre) as FakeGainNode[];
  const oscs = gains.map((gain) => feeder(ctx, gain) as FakeOscillatorNode);
  return { outlet, lowpass, pre, gains, oscs };
}

describe('GUITAR WALL', () => {
  it('stacks four saws at octave multiples into one lowpass', () => {
    const { engine, ctx } = fullBoard();
    const { outlet, lowpass, pre, gains, oscs } = guitar(engine, ctx);

    expect(oscs.map((osc) => osc.type)).toEqual(['sawtooth', 'sawtooth', 'sawtooth', 'sawtooth']);
    expect(oscs.map((osc) => osc.frequency.value / engine.root())).toEqual([...GUITAR.mults]);
    expect(lowpass.type).toBe('lowpass');
    expect(lowpass.frequency.value).toBe(GUITAR.initial.cutoff);
    expect(lowpass.Q.value).toBe(GUITAR.initial.q);
    expect(lowpass.nodes).toEqual([asFake(outlet.loud)]);
    expect(pre.nodes).toEqual([lowpass]);
    expect(gains).toHaveLength(4);
    // Every saw is running already — powering on opens a gate, it does not start a note.
    expect(oscs.every((osc) => osc.life[0]?.call === 'start')).toBe(true);
  });

  it('spreads the stack apart as CROWD brings more players in', () => {
    const { engine, ctx } = fullBoard();
    const { gains, oscs, pre } = guitar(engine, ctx);

    charged(engine, 'guitar', 0);
    expect(oscs.map((osc) => osc.detune.value)).toEqual(
      GUITAR.baseDetune.map((base) => base * GUITAR.spreadFloor),
    );
    expect(gains[2]?.gain.value).toBeCloseTo(GUITAR.thirdFloor, 10);
    expect(gains[3]?.gain.value).toBeCloseTo(GUITAR.fourthFloor, 10);
    expect(pre.gain.value).toBeCloseTo(GUITAR.preFloor, 10);

    charged(engine, 'guitar', 1);
    const wide = GUITAR.spreadFloor + GUITAR.spreadSpan;
    expect(oscs.map((osc) => osc.detune.value)).toEqual(GUITAR.baseDetune.map((base) => base * wide));
    expect(gains[2]?.gain.value).toBeCloseTo(GUITAR.thirdFloor + GUITAR.thirdSpan, 10);
    expect(gains[3]?.gain.value).toBeCloseTo(GUITAR.fourthFloor + GUITAR.fourthSpan, 10);
    // The lower two never move: CROWD adds players, it does not rebalance the pair already there.
    expect(gains[0]?.gain.value).toBe(GUITAR.stackGain);
    expect(gains[1]?.gain.value).toBe(GUITAR.stackGain);
  });

  it('moves the whole stack when the board is retuned', () => {
    const { engine, ctx } = fullBoard();
    const { oscs } = guitar(engine, ctx);

    engine.setGlobal('tuning', 5);

    const root = engine.root();
    expect(oscs.map((osc) => osc.frequency.value)).toEqual(GUITAR.mults.map((mult) => root * mult));
    expect(ramps(oscs[0]!.frequency).at(-1)?.constant).toBe(SMOOTH_RETUNE);
  });
});

/** BASS: sine sub and a shaped saw, both into one lowpass. */
function bass(engine: Engine, ctx: FakeAudioContext) {
  const outlet = source(engine, 'bass');
  const lowpass = feeder(ctx, asFake(outlet.loud)) as FakeBiquadNode;
  const [subGain, sawGain] = feeding(ctx, lowpass) as FakeGainNode[];
  const sub = feeder(ctx, subGain as FakeGainNode) as FakeOscillatorNode;
  const shaper = feeder(ctx, sawGain as FakeGainNode) as FakeWaveShaperNode;
  const saw = feeder(ctx, shaper) as FakeOscillatorNode;
  return { outlet, lowpass, subGain: subGain as FakeGainNode, sawGain: sawGain as FakeGainNode, sub, shaper, saw };
}

describe('BASS', () => {
  it('runs a clean sine sub beside a lightly distorted octave saw', () => {
    const { engine, ctx } = fullBoard();
    const { lowpass, sub, saw, shaper } = bass(engine, ctx);

    expect(sub.type).toBe('sine');
    expect(sub.frequency.value).toBe(engine.root());
    expect(saw.type).toBe('sawtooth');
    expect(saw.frequency.value).toBe(engine.root() * BASS.sawMult);
    // Four cents off the octave, so the pair never sits perfectly still.
    expect(saw.detune.value).toBe(BASS.sawDetune);
    // The shaper is on the saw alone; a distorted sub would only turn the floor to mud.
    expect(shaper.curve).toBe(engine.curve(BASS.sawCurve));
    expect(feeding(ctx, shaper)).toEqual([saw]);
    expect(lowpass.frequency.value).toBe(BASS.initial.cutoff);
    expect(lowpass.Q.value).toBe(BASS.initial.q);
  });

  it('trades the saw for the sub and opens the filter as HEFT rises', () => {
    const { engine, ctx } = fullBoard();
    const { lowpass, subGain, sawGain } = bass(engine, ctx);

    charged(engine, 'bass', 0);
    expect(subGain.gain.value).toBeCloseTo(BASS.subFloor, 10);
    expect(sawGain.gain.value).toBeCloseTo(BASS.sawFloor, 10);
    expect(lowpass.frequency.value).toBe(BASS.cutoffFloor);

    charged(engine, 'bass', 1);
    expect(subGain.gain.value).toBeCloseTo(BASS.subFloor + BASS.subSpan, 10);
    expect(sawGain.gain.value).toBeCloseTo(BASS.sawFloor - BASS.sawSpan, 10);
    expect(lowpass.frequency.value).toBe(BASS.cutoffFloor + BASS.cutoffSpan);
    // More HEFT is more sub and less saw — the floor widens rather than sharpens.
    expect(subGain.gain.value).toBeGreaterThan(sawGain.gain.value);
  });

  it('retunes the sub and its octave together', () => {
    const { engine, ctx } = fullBoard();
    const { sub, saw } = bass(engine, ctx);

    engine.setGlobal('seriousness', 1);

    const root = engine.root();
    expect(sub.frequency.value).toBe(root);
    expect(saw.frequency.value).toBe(root * BASS.sawMult);
  });
});

/** CHAINSAW: a saw pair and a band of noise through a gain the LFO chops. */
function chainsaw(engine: Engine, ctx: FakeAudioContext) {
  const outlet = source(engine, 'chainsaw');
  const lowpass = feeder(ctx, asFake(outlet.loud)) as FakeBiquadNode;
  const chug = feeder(ctx, lowpass) as FakeGainNode;
  const into = feeding(ctx, chug);
  const oscs = of(into, 'oscillator') as FakeOscillatorNode[];
  const noiseGain = of(into, 'gain')[0] as FakeGainNode;
  const noiseFilter = feeder(ctx, noiseGain) as FakeBiquadNode;
  const noise = feeder(ctx, noiseFilter) as FakeBufferSourceNode;
  const depth = feeder(ctx, chug.gain) as FakeGainNode;
  const lfo = feeder(ctx, depth) as FakeOscillatorNode;
  return { outlet, lowpass, chug, oscs, noiseGain, noiseFilter, noise, depth, lfo };
}

describe('CHAINSAW', () => {
  it('chops a detuned saw pair and a band of noise with a square LFO', () => {
    const { engine, ctx } = fullBoard();
    const { chug, oscs, noise, noiseFilter, lfo, depth, lowpass } = chainsaw(engine, ctx);

    expect(oscs.map((osc) => osc.detune.value)).toEqual([...CHAINSAW.detunes]);
    expect(noiseFilter.type).toBe('bandpass');
    expect(noiseFilter.frequency.value).toBe(CHAINSAW.initial.noiseFreq);
    expect(noise.loop).toBe(true);
    expect(noise.buffer).toBe(engine.noiseBuffer);
    expect(noise.life).toEqual([{ call: 'start', at: undefined }]);
    // The LFO writes onto the chug's gain, never into the signal path.
    expect(lfo.type).toBe('square');
    expect(depth.connections).toEqual([chug.gain]);
    expect(depth.nodes).toEqual([]);
    expect(lowpass.type).toBe('lowpass');
  });

  it('revs the rate, the pitch, the noise and the cutoff on one knob', () => {
    const { engine, ctx } = fullBoard();
    const { oscs, noiseGain, lfo, lowpass } = chainsaw(engine, ctx);
    const root = engine.root();

    charged(engine, 'chainsaw', 0);
    expect(lfo.frequency.value).toBe(CHAINSAW.rateFloor);
    expect(noiseGain.gain.value).toBeCloseTo(CHAINSAW.noiseFloor, 10);
    expect(lowpass.frequency.value).toBe(CHAINSAW.cutoffFloor);
    expect(oscs[0]?.frequency.value).toBeCloseTo(root * CHAINSAW.mult * CHAINSAW.pitchFloor, 10);

    charged(engine, 'chainsaw', 1);
    expect(lfo.frequency.value).toBe(CHAINSAW.rateFloor + CHAINSAW.rateSpan);
    expect(noiseGain.gain.value).toBeCloseTo(CHAINSAW.noiseFloor + CHAINSAW.noiseSpan, 10);
    expect(lowpass.frequency.value).toBe(CHAINSAW.cutoffFloor + CHAINSAW.cutoffSpan);
    // REVS raises the pitch too, which is why this is the one source whose
    // retune is not a function of the root alone.
    const revved = CHAINSAW.pitchFloor + CHAINSAW.pitchSpan;
    expect(oscs[0]?.frequency.value).toBeCloseTo(root * CHAINSAW.mult * revved, 10);
  });

  it('keeps the revved pitch across a retune', () => {
    const { engine, ctx } = fullBoard();
    const { oscs } = chainsaw(engine, ctx);

    charged(engine, 'chainsaw', 1);
    engine.setGlobal('tuning', 0);

    const revved = CHAINSAW.pitchFloor + CHAINSAW.pitchSpan;
    for (const osc of oscs) {
      expect(osc.frequency.value).toBeCloseTo(engine.root() * CHAINSAW.mult * revved, 10);
    }
  });
});

/** SAXOPHONE: a square through two parallel formants, plus breath. */
function sax(engine: Engine, ctx: FakeAudioContext) {
  const outlet = source(engine, 'sax');
  const [formant1Gain, formant2Gain, breathGain] = feeding(ctx, asFake(outlet.loud)) as FakeGainNode[];
  const formant1 = feeder(ctx, formant1Gain as FakeGainNode) as FakeBiquadNode;
  const formant2 = feeder(ctx, formant2Gain as FakeGainNode) as FakeBiquadNode;
  const breathFilter = feeder(ctx, breathGain as FakeGainNode) as FakeBiquadNode;
  const breath = feeder(ctx, breathFilter) as FakeBufferSourceNode;
  const osc = feeder(ctx, formant1) as FakeOscillatorNode;
  const depth = feeder(ctx, osc.detune) as FakeGainNode;
  const vibrato = feeder(ctx, depth) as FakeOscillatorNode;
  return {
    outlet,
    formant1,
    formant2,
    breathFilter,
    breath,
    breathGain: breathGain as FakeGainNode,
    osc,
    depth,
    vibrato,
  };
}

describe('SAXOPHONE', () => {
  it('runs one square through two formants in parallel, with breath beside them', () => {
    const { engine, ctx } = fullBoard();
    const { outlet, formant1, formant2, breath, breathFilter, osc, vibrato, depth } = sax(engine, ctx);

    expect(osc.type).toBe('square');
    // Four octaves above the root the sax sits on, which is a minor third above
    // the board's — the one drone carrying the third (gt#38).
    expect(osc.frequency.value).toBe(engine.rootOf(outlet) * SAX.mult);
    // Parallel, not in series — a throat, rather than a filter over a filter.
    expect(osc.nodes).toEqual([formant1, formant2]);
    expect(formant1.type).toBe('bandpass');
    expect(formant1.Q.value).toBe(SAX.initial.formant1Q);
    expect(formant2.Q.value).toBe(SAX.initial.formant2Q);
    expect(breathFilter.frequency.value).toBe(SAX.initial.breathFreq);
    expect(breath.loop).toBe(true);
    expect(vibrato.type).toBe('sine');
    expect(depth.connections).toEqual([osc.detune]);
  });

  it('pushes the formants up and opens the vibrato as AGONY rises', () => {
    const { engine, ctx } = fullBoard();
    const { formant1, formant2, vibrato, depth, breathGain } = sax(engine, ctx);

    charged(engine, 'sax', 0);
    expect(formant1.frequency.value).toBe(SAX.formant1Floor);
    expect(formant2.frequency.value).toBe(SAX.formant2Floor);
    expect(depth.gain.value).toBe(SAX.depthFloor);
    expect(breathGain.gain.value).toBeCloseTo(SAX.breathFloor, 10);

    charged(engine, 'sax', 1);
    expect(formant1.frequency.value).toBe(SAX.formant1Floor + SAX.formant1Span);
    expect(formant2.frequency.value).toBe(SAX.formant2Floor + SAX.formant2Span);
    expect(vibrato.frequency.value).toBeCloseTo(SAX.vibratoFloor + SAX.vibratoSpan, 10);
    expect(depth.gain.value).toBe(SAX.depthFloor + SAX.depthSpan);
    expect(breathGain.gain.value).toBeCloseTo(SAX.breathFloor + SAX.breathSpan, 10);
    expect(ramps(formant1.frequency).at(-1)?.constant).toBe(SMOOTH);
  });

  it('retunes the square four octaves above whatever the root becomes', () => {
    const { engine, ctx } = fullBoard();
    const { outlet, osc } = sax(engine, ctx);

    engine.setGlobal('tuning', 4);

    expect(osc.frequency.value).toBe(engine.rootOf(outlet) * SAX.mult);
    // The third travels with the retune rather than being baked in at build time.
    expect(osc.frequency.value).toBeCloseTo(engine.root() * SAX.mult * INTERVALS.minorThird, 10);
  });
});

/** THROAT: saw → lowpass → body → loud, and saw → resonator → whistle → loud. */
function throat(engine: Engine, ctx: FakeAudioContext) {
  const outlet = source(engine, 'throat');
  const [body, whistle] = feeding(ctx, asFake(outlet.loud)) as FakeGainNode[];
  const lowpass = feeder(ctx, body as FakeGainNode) as FakeBiquadNode;
  const resonator = feeder(ctx, whistle as FakeGainNode) as FakeBiquadNode;
  const [saw, airGain] = feeding(ctx, resonator) as [FakeOscillatorNode, FakeGainNode];
  const air = feeder(ctx, airGain) as FakeBufferSourceNode;
  return {
    outlet,
    body: body as FakeGainNode,
    whistle: whistle as FakeGainNode,
    lowpass,
    resonator,
    saw,
    airGain,
    air,
  };
}

describe('THROAT', () => {
  it('splits one sawtooth into a buzz and an overtone, in parallel', () => {
    const { engine, ctx } = fullBoard();
    const { outlet, saw, lowpass, resonator, body, whistle } = throat(engine, ctx);

    expect(saw.type).toBe('sawtooth');
    // An octave over the root it holds, clear of the sub the floor is already on.
    expect(saw.frequency.value).toBe(engine.rootOf(outlet) * THROAT.mult);
    // Both halves off the same source. In series the whistle would be all there
    // is; in parallel it is an overtone standing out of a drone still under it.
    expect(saw.nodes).toEqual([lowpass, resonator]);
    expect(lowpass.type).toBe('lowpass');
    expect(lowpass.nodes).toEqual([body]);
    expect(resonator.type).toBe('bandpass');
    expect(resonator.nodes).toEqual([whistle]);
  });

  it('holds the whistle on a harmonic of its own buzz, which is why it cannot clash', () => {
    // The module's whole safety argument, asserted rather than described: at
    // every position of the control the resonance sits on a multiple of the
    // sawtooth's own frequency, so it can only amplify a partial that is already
    // there. Nothing about this depends on the interval table.
    const { engine, ctx } = fullBoard();
    const { saw, resonator } = throat(engine, ctx);

    for (const value of [0, 0.25, 0.5, 0.75, 1]) {
      charged(engine, 'throat', value);
      const harmonic = resonator.frequency.value / saw.frequency.value;

      expect(harmonic, `whistle at ${value}`).toBeCloseTo(
        THROAT.harmonicFloor + value * THROAT.harmonicSpan,
        6,
      );
      expect(harmonic).toBeGreaterThanOrEqual(THROAT.harmonicFloor);
    }
  });

  it('tightens the resonance and ducks the buzz as WHISTLE climbs', () => {
    const { engine, ctx } = fullBoard();
    const { resonator, whistle, body, lowpass, airGain } = throat(engine, ctx);

    charged(engine, 'throat', 0);
    expect(resonator.Q.value).toBe(THROAT.qFloor);
    expect(whistle.gain.value).toBeCloseTo(THROAT.whistleFloor, 10);
    expect(body.gain.value).toBeCloseTo(THROAT.bodyFloor, 10);
    expect(lowpass.frequency.value).toBe(THROAT.cutoffFloor);
    expect(airGain.gain.value).toBeCloseTo(THROAT.airFloor, 10);

    charged(engine, 'throat', 1);
    expect(resonator.Q.value).toBe(THROAT.qFloor + THROAT.qSpan);
    expect(whistle.gain.value).toBeCloseTo(THROAT.whistleFloor + THROAT.whistleSpan, 10);
    // The drone pulls back to let the overtone through, which is the gesture a
    // singer makes. A buzz held flat under a rising whistle is two sounds.
    expect(body.gain.value).toBeCloseTo(THROAT.bodyFloor - THROAT.bodySpan, 10);
    expect(body.gain.value).toBeLessThan(THROAT.bodyFloor);
    expect(airGain.gain.value).toBeCloseTo(THROAT.airFloor + THROAT.airSpan, 10);
    expect(ramps(resonator.frequency).at(-1)?.constant).toBe(SMOOTH);
  });

  it('feeds the resonator session-long air, and spends no voice on it', () => {
    // gt#31's decision, cashed in by the first module built after it: a tap that
    // runs from build time to the page closing is not what a one-shot cap is
    // about, so THROAT's breath costs the strikes nothing.
    const { engine, ctx } = fullBoard();
    const { air, airGain, resonator } = throat(engine, ctx);

    expect(air.loop).toBe(true);
    expect(air.buffer).toBe(engine.noiseBuffer);
    // Started and never stopped, which is what makes it a tap rather than a hit.
    expect(air.life).toEqual([{ call: 'start', at: undefined }]);
    // Into the resonator rather than straight at the outlet: the point is air
    // *in* the whistle, not hiss beside it.
    expect(airGain.nodes).toEqual([resonator]);
    // Three session-long taps on the board now, and the count still reads zero.
    expect(engine.active).toBe(0);
  });

  it('carries the knob through a retune, so the overtone does not fall back', () => {
    // The same care CHAINSAW's retune needs and for the same reason: where the
    // whistle sits is a function of the root *and* the control, so a retune that
    // only knew the root would drop it to the third harmonic every time TUNING
    // moved.
    const { engine, ctx } = fullBoard();
    const { outlet, saw, resonator } = throat(engine, ctx);

    charged(engine, 'throat', 1);
    engine.setGlobal('tuning', 4);

    const top = THROAT.harmonicFloor + THROAT.harmonicSpan;
    expect(saw.frequency.value).toBeCloseTo(engine.rootOf(outlet) * THROAT.mult, 10);
    expect(resonator.frequency.value).toBeCloseTo(engine.rootOf(outlet) * THROAT.mult * top, 10);
    expect(ramps(saw.frequency).at(-1)?.constant).toBe(SMOOTH_RETUNE);
  });
});

// ------------------------------------------------------------------- strikes

describe('SLOW HIT', () => {
  it('drops a sine toward the root and puts a click on the front', () => {
    const { engine, ctx } = fullBoard();
    const outlet = source(engine, 'slowhit');
    const time = 9;

    const built = fire(ctx, outlet, time);
    const osc = of(built, 'oscillator')[0] as FakeOscillatorNode;
    const click = of(built, 'buffersource')[0] as FakeBufferSourceNode;
    const highpass = of(built, 'biquad')[0] as FakeBiquadNode;

    const root = engine.root();
    const weight = outlet.charV;
    const start = Math.max(SLOWHIT.startFloor, root * SLOWHIT.startMult) * (1 + weight * SLOWHIT.liftSpan);

    expect(osc.type).toBe('sine');
    expect(osc.life).toEqual([
      { call: 'start', at: time },
      { call: 'stop', at: time + SLOWHIT.life },
    ]);
    expect(automation(osc.frequency)).toEqual([
      { call: 'set', value: start, time },
      {
        call: 'exponential',
        value: Math.max(SLOWHIT.endFloor, root * SLOWHIT.endMult),
        time: time + SLOWHIT.dropFloor + weight * SLOWHIT.dropSpan,
      },
    ]);

    expect(highpass.type).toBe('highpass');
    expect(highpass.frequency.value).toBe(SLOWHIT.clickFreq);
    expect(click.life).toEqual([
      { call: 'start', at: time },
      { call: 'stop', at: time + SLOWHIT.clickLife },
    ]);
    // The click never rings: it is set at full and gone inside fifty milliseconds.
    const clickGain = of(built, 'gain')[1] as FakeGainNode;
    expect(automation(clickGain.gain)).toEqual([
      { call: 'set', value: SLOWHIT.clickGain, time },
      { call: 'exponential', value: SLOWHIT.silence, time: time + SLOWHIT.clickDecay },
    ]);
    // Both halves land on the same outlet, so HOW LOUD moves body and edge together.
    expect(feeding(ctx, asFake(outlet.loud))).toHaveLength(2);
  });

  it('starts higher and rings longer as WEIGHT rises', () => {
    const { engine, ctx } = fullBoard();
    const outlet = source(engine, 'slowhit');
    const root = engine.root();

    engine.setChar('slowhit', 0);
    const light = of(fire(ctx, outlet, 9), 'oscillator')[0] as FakeOscillatorNode;
    engine.setChar('slowhit', 1);
    const heavy = of(fire(ctx, outlet, 9), 'oscillator')[0] as FakeOscillatorNode;

    const base = Math.max(SLOWHIT.startFloor, root * SLOWHIT.startMult);
    expect(automation(light.frequency)[0]?.value).toBeCloseTo(base, 10);
    expect(automation(heavy.frequency)[0]?.value).toBeCloseTo(base * (1 + SLOWHIT.liftSpan), 10);
    // And the drop itself takes longer, so a heavy hit reads as a slower fall.
    expect(automation(heavy.frequency)[1]!.time).toBeGreaterThan(automation(light.frequency)[1]!.time);
  });

  it('opens the body in six milliseconds and lets it out over the tail', () => {
    const { engine, ctx } = fullBoard();
    const outlet = source(engine, 'slowhit');
    engine.setChar('slowhit', 0.5);
    const time = 9;

    const built = fire(ctx, outlet, time);
    const body = of(built, 'gain')[0] as FakeGainNode;

    expect(automation(body.gain)).toEqual([
      { call: 'set', value: 0, time },
      { call: 'linear', value: SLOWHIT.peak, time: time + SLOWHIT.attack },
      {
        call: 'exponential',
        value: SLOWHIT.silence,
        time: time + SLOWHIT.decayFloor + 0.5 * SLOWHIT.decaySpan,
      },
    ]);
    // An exponential ramp cannot reach zero, so nothing in the board asks it to.
    expect(SLOWHIT.silence).toBeGreaterThan(0);
  });
});

describe('CYMBAL SWELL', () => {
  it('swells noise for three quarters of a second and falls away for two and a half', () => {
    const { engine, ctx } = fullBoard();
    const outlet = source(engine, 'cymbal');
    engine.setChar('cymbal', 0.5);
    const time = 12;

    const built = fire(ctx, outlet, time);
    const noise = of(built, 'buffersource')[0] as FakeBufferSourceNode;
    const [highpass, peak] = of(built, 'biquad') as FakeBiquadNode[];
    const envelope = of(built, 'gain')[0] as FakeGainNode;

    expect(highpass?.type).toBe('highpass');
    expect(peak?.type).toBe('peaking');
    expect(peak?.gain.value).toBeCloseTo(CYMBAL.peakFloor + 0.5 * CYMBAL.peakSpan, 10);
    expect(noise.life).toEqual([
      { call: 'start', at: time, offset: CYMBAL.offset },
      { call: 'stop', at: time + CYMBAL.life },
    ]);
    // The rise is linear on purpose: a swell, not an attack.
    expect(automation(envelope.gain)).toEqual([
      { call: 'set', value: 0, time },
      { call: 'linear', value: CYMBAL.levelFloor + 0.5 * CYMBAL.levelSpan, time: time + CYMBAL.rise },
      { call: 'exponential', value: CYMBAL.silence, time: time + CYMBAL.tail },
    ]);
    expect(CYMBAL.life).toBeGreaterThan(CYMBAL.tail);
  });

  it('moves the highpass from a wash to a hiss', () => {
    const { engine, ctx } = fullBoard();
    const outlet = source(engine, 'cymbal');

    engine.setChar('cymbal', 0);
    const wash = of(fire(ctx, outlet, 12), 'biquad')[0] as FakeBiquadNode;
    engine.setChar('cymbal', 1);
    const hiss = of(fire(ctx, outlet, 12), 'biquad')[0] as FakeBiquadNode;

    expect(wash.frequency.value).toBe(CYMBAL.cutoffFloor);
    expect(hiss.frequency.value).toBe(CYMBAL.cutoffFloor + CYMBAL.cutoffSpan);
  });
});

describe('THE VOICE', () => {
  it('gives each MODE its own source, formants and glide', () => {
    const { engine, ctx } = fullBoard();
    const outlet = source(engine, 'voice');
    const time = 4;

    VOICE_MODES.forEach((spec, mode) => {
      engine.setChar('voice', mode);
      const built = fire(ctx, outlet, time);
      const bands = of(built, 'biquad') as FakeBiquadNode[];

      expect(bands).toHaveLength(spec.formants.length);
      bands.forEach((band, index) => {
        const [frequency, q] = spec.formants[index] as readonly [number, number, number];
        expect(band.type).toBe('bandpass');
        expect(band.frequency.value).toBe(frequency);
        expect(band.Q.value).toBe(q);
        // Fixed formants would be a chord; the glide is what makes it a mouth.
        expect(automation(band.frequency)).toEqual([
          { call: 'set', value: frequency, time: time + VOICE.glideStart },
          { call: 'linear', value: spec.glide[index], time: time + spec.duration * VOICE.glideEnd },
        ]);
      });
    });
  });

  it('builds no oscillator at all for WHISPER', () => {
    const { engine, ctx } = fullBoard();
    const outlet = source(engine, 'voice');

    engine.setChar('voice', 0);
    const growl = fire(ctx, outlet, 4);
    engine.setChar('voice', 3);
    const whisper = fire(ctx, outlet, 4);

    expect(of(growl, 'oscillator')).toHaveLength(1);
    expect(of(whisper, 'oscillator')).toHaveLength(0);
    // A voice with nothing behind it is still a voice: the noise stays.
    expect(of(whisper, 'buffersource')).toHaveLength(1);
  });

  it('bends the source toward where the mode ends and shapes what comes out', () => {
    const { engine, ctx } = fullBoard();
    const outlet = source(engine, 'voice');
    const time = 4;

    engine.setChar('voice', 0);
    const built = fire(ctx, outlet, time);
    const osc = of(built, 'oscillator')[0] as FakeOscillatorNode;
    const shaper = of(built, 'waveshaper')[0] as FakeWaveShaperNode;
    const growl = VOICE_MODES[0] as (typeof VOICE_MODES)[number];
    // THE VOICE chants the fifth, so its mode multipliers are read off its own
    // root rather than the board's (gt#38).
    const start = Math.max(VOICE.pitchFloor, engine.rootOf(outlet) * growl.mult);

    expect(automation(osc.frequency)).toEqual([
      { call: 'set', value: start, time },
      {
        call: 'exponential',
        value: Math.max(VOICE.bendFloor, start * growl.bend),
        time: time + growl.duration,
      },
    ]);
    expect(shaper.curve).toBe(engine.curve(growl.drive));
    expect(osc.life).toEqual([
      { call: 'start', at: time },
      { call: 'stop', at: time + growl.duration + VOICE.tail },
    ]);
  });

  it('says nothing at all for a mode that is not on the selector', () => {
    const { engine, ctx } = fullBoard();
    const outlet = source(engine, 'voice');

    engine.setChar('voice', VOICE_MODES.length);

    expect(fire(ctx, outlet, 4)).toEqual([]);
  });
});

describe('MARACAS', () => {
  it('fires one hit at rest and a tightening burst of ten wide open', () => {
    const { engine, ctx } = fullBoard();
    const outlet = source(engine, 'maracas');
    const time = 7;

    engine.setChar('maracas', 0);
    const single = fire(ctx, outlet, time);
    expect(of(single, 'buffersource')).toHaveLength(MARACAS.hitsFloor);

    engine.setChar('maracas', 1);
    const burst = fire(ctx, outlet, time);
    const sources = of(burst, 'buffersource') as FakeBufferSourceNode[];
    expect(sources).toHaveLength(MARACAS.hitsFloor + MARACAS.hitsSpan);

    const gap = MARACAS.gapFloor - MARACAS.gapSpan;
    expect(sources[1]?.life[0]?.at).toBeCloseTo(time + gap, 10);
    // More FRENZY is more hits *and* closer together.
    expect(gap).toBeLessThan(MARACAS.gapFloor);
  });

  it('weights the burst off the fixed accent table', () => {
    const { engine, ctx } = fullBoard();
    const outlet = source(engine, 'maracas');
    engine.setChar('maracas', 1);

    const envelopes = of(fire(ctx, outlet, 7), 'gain') as FakeGainNode[];

    expect(envelopes.map((gain) => automation(gain.gain)[1]?.value)).toEqual(
      envelopes.map((_, index) => MARACAS.peak * (ACCENTS[index] as number)),
    );
  });

  it('reads each hit from a different place in the one noise buffer', () => {
    const { engine, ctx } = fullBoard();
    const outlet = source(engine, 'maracas');
    engine.setChar('maracas', 1);

    const sources = of(fire(ctx, outlet, 7), 'buffersource') as FakeBufferSourceNode[];
    const offsets = sources.map((node) => node.life[0]?.offset);

    expect(offsets).toEqual(
      sources.map((_, index) => (index % MARACAS.offsetCycle) * MARACAS.offsetStep),
    );
    // Ten beads out of seven starting points, so the cycle shows.
    expect(offsets[0]).toBe(offsets[MARACAS.offsetCycle]);
  });

  it('filters the whole burst through one pair, built with the module', () => {
    const { engine, ctx } = fullBoard();
    const outlet = source(engine, 'maracas');
    engine.setChar('maracas', 1);

    const burst = fire(ctx, outlet, 7);
    const hits = MARACAS.hitsFloor + MARACAS.hitsSpan;

    // A trigger allocates a source and an envelope per hit and nothing else:
    // the two filters are the same two every time, so they belong to the module
    // rather than to the hit (gt#21).
    expect(of(burst, 'biquad')).toHaveLength(0);
    expect(burst).toHaveLength(hits * 2);
    expect(of(burst, 'buffersource')).toHaveLength(hits);
    expect(of(burst, 'gain')).toHaveLength(hits);

    // And every envelope runs into the same highpass, which runs into the same
    // bandpass, which is what reaches the outlet.
    const envelopes = of(burst, 'gain');
    const highpass = (envelopes[0] as FakeAudioNode).nodes[0] as FakeBiquadNode;
    expect(highpass.type).toBe('highpass');
    expect(highpass.frequency.value).toBe(MARACAS.highpass);
    for (const envelope of envelopes) expect(envelope.nodes).toEqual([highpass]);

    const bandpass = highpass.nodes[0] as FakeBiquadNode;
    expect(bandpass.type).toBe('bandpass');
    expect(bandpass.frequency.value).toBe(MARACAS.bandpass);
    expect(bandpass.nodes).toEqual([asFake(outlet.loud)]);
  });

  it('stops at the voice cap rather than stepping over it mid-burst', () => {
    const { engine, ctx } = fullBoard();
    const outlet = source(engine, 'maracas');
    engine.setChar('maracas', 1);

    // The heartbeat asks the cap once and then this fires up to ten voices off
    // the one answer, so the burst has to keep asking for itself.
    const room = 3;
    engine.active = VOICE_CAP - room;
    const burst = fire(ctx, outlet, 7);

    expect(of(burst, 'buffersource')).toHaveLength(room);
    expect(engine.active).toBe(VOICE_CAP);
  });

  it('rattles identically every time, because the burst is written down', () => {
    const { engine, ctx } = fullBoard();
    const outlet = source(engine, 'maracas');
    engine.setChar('maracas', 0.7);

    const read = (nodes: FakeAudioNode[]) =>
      (of(nodes, 'gain') as FakeGainNode[]).map((gain) => automation(gain.gain));

    expect(read(fire(ctx, outlet, 7))).toEqual(read(fire(ctx, outlet, 7)));
  });

  it('rattles identically on two fresh engines, at every FRENZY (gt#27)', () => {
    // The same claim across sessions rather than across two hits of one: the
    // accents, the gaps and where each hit reads from in the noise buffer are
    // all written down, so a board loaded twice shakes the same maracas.
    const burst = (frenzy: number) => {
      const { engine, ctx } = fullBoard();
      engine.setChar('maracas', frenzy, false);
      const nodes = fire(ctx, source(engine, 'maracas'), 7);
      return {
        accents: (of(nodes, 'gain') as FakeGainNode[]).map((gain) => automation(gain.gain)),
        reads: (of(nodes, 'buffersource') as FakeBufferSourceNode[]).map((hit) => hit.life),
      };
    };

    for (const frenzy of [0, 0.4, 0.7, 1]) {
      const first = burst(frenzy);
      expect(first.accents.length, String(frenzy)).toBeGreaterThan(0);
      expect(burst(frenzy), String(frenzy)).toEqual(first);
    }
  });
});

describe('COW', () => {
  it('bends a saw up and then drops it through two descending formants', () => {
    const { engine, ctx } = fullBoard();
    const outlet = source(engine, 'cow');
    engine.setChar('cow', 0.5);
    const time = 3;

    const built = fire(ctx, outlet, time);
    const osc = of(built, 'oscillator')[0] as FakeOscillatorNode;
    const [band1, band2] = of(built, 'biquad') as FakeBiquadNode[];
    const shaper = of(built, 'waveshaper')[0] as FakeWaveShaperNode;
    // A minor third over `mult` of 5 lands the moo on ×6 exactly (gt#38).
    const base = Math.max(COW.pitchFloor, engine.rootOf(outlet) * COW.mult);

    expect(osc.type).toBe('sawtooth');
    expect(automation(osc.frequency)).toEqual([
      { call: 'set', value: base * COW.startBend, time },
      { call: 'linear', value: base * COW.riseBend, time: time + COW.rise },
      {
        call: 'exponential',
        value: Math.max(COW.endFloor, base * (COW.fallFloor - 0.5 * COW.fallSpan)),
        time: time + COW.fallTimeFloor + 0.5 * COW.fallTimeSpan,
      },
    ]);
    expect(automation(band1!.frequency)).toEqual([
      { call: 'set', value: COW.formant1.start, time },
      { call: 'linear', value: COW.formant1.end, time: time + COW.formantGlide },
    ]);
    expect(automation(band2!.frequency)).toEqual([
      { call: 'set', value: COW.formant2.start, time },
      { call: 'linear', value: COW.formant2.end, time: time + COW.formantGlide },
    ]);
    // Both formants slide down after the pitch, and both land in the same throat.
    expect(shaper.curve).toBe(engine.curve(COW.curve));
    expect(osc.nodes).toEqual([band1, band2]);
  });

  it('drops the moo further and stretches it as DESPAIR rises', () => {
    const { engine, ctx } = fullBoard();
    const outlet = source(engine, 'cow');
    const time = 3;

    engine.setChar('cow', 0);
    const hopeful = of(fire(ctx, outlet, time), 'oscillator')[0] as FakeOscillatorNode;
    engine.setChar('cow', 1);
    const despairing = of(fire(ctx, outlet, time), 'oscillator')[0] as FakeOscillatorNode;

    expect(automation(despairing.frequency)[2]!.value).toBeLessThan(
      automation(hopeful.frequency)[2]!.value,
    );
    expect(despairing.life[1]!.at).toBeCloseTo(
      time + COW.durationFloor + COW.durationSpan + COW.tail,
      10,
    );
    expect(hopeful.life[1]!.at).toBeCloseTo(time + COW.durationFloor + COW.tail, 10);
  });

  it('holds the moo open before letting it go', () => {
    const { engine, ctx } = fullBoard();
    const outlet = source(engine, 'cow');
    engine.setChar('cow', 0);
    const time = 3;

    const envelope = of(fire(ctx, outlet, time), 'gain').at(-1) as FakeGainNode;

    expect(automation(envelope.gain)).toEqual([
      { call: 'set', value: 0, time },
      { call: 'linear', value: COW.peak, time: time + COW.attack },
      { call: 'set', value: COW.peak, time: time + COW.durationFloor * COW.hold },
      { call: 'exponential', value: COW.silence, time: time + COW.durationFloor },
    ]);
  });
});

/** One shot, at a given CHARGE. Everything the cannon is exists inside a trigger. */
function shoot(engine: Engine, ctx: FakeAudioContext, charge: number, time: number) {
  const outlet = source(engine, 'laser');
  engine.setChar('laser', charge);
  const built = fire(ctx, outlet, time);
  const oscs = of(built, 'oscillator') as FakeOscillatorNode[];
  return {
    outlet,
    built,
    oscs,
    osc: oscs[0] as FakeOscillatorNode,
    delay: of(built, 'delay')[0] as FakeDelayNode,
    crack: of(built, 'buffersource')[0] as FakeBufferSourceNode,
    highpass: of(built, 'biquad')[0] as FakeBiquadNode,
    start: engine.rootOf(outlet) * LASER.startMult,
  };
}

describe('LASER CANNON', () => {
  it('drops a square from the top of the board through a swept delay', () => {
    const { engine, ctx } = fullBoard();
    const time = 4;
    const { osc, delay, highpass, crack, start } = shoot(engine, ctx, 0.5, time);
    const sweep = LASER.sweepFloor + 0.5 * LASER.sweepSpan;

    expect(osc.type).toBe('square');
    // root × 1.5 × 32 — high enough to be a laser and still a fifth (gt#38).
    expect(automation(osc.frequency)).toEqual([
      { call: 'set', value: start, time },
      {
        call: 'exponential',
        value: Math.max(LASER.pitchFloor, start * (LASER.endFloor - 0.5 * LASER.endSpan)),
        time: time + sweep,
      },
    ]);
    // The flange is one ramp per shot rather than an LFO, so every shot flanges
    // identically — a free-running oscillator would start it somewhere new each
    // time, which is the kind of thing this board does not do.
    expect(automation(delay.delayTime)).toEqual([
      { call: 'set', value: LASER.delayFrom, time },
      { call: 'linear', value: LASER.delayTo, time: time + sweep },
    ]);
    expect(highpass.type).toBe('highpass');
    expect(highpass.frequency.value).toBe(LASER.crackFreq);
    // Its own place in the noise buffer, so it is not SLOW HIT's click again.
    expect(crack.life[0]?.offset).toBe(LASER.crackOffset);
  });

  it('takes the flange across the crack as well as the tone', () => {
    // A laser is half crack, and a flanger that skipped it would only smear the
    // sweep. Both meet at `pre`, and the delay hangs off that rather than off
    // the oscillator.
    const { engine, ctx } = fullBoard();
    const { built, delay, outlet } = shoot(engine, ctx, 0.5, 4);
    const pre = of(built, 'gain')[0] as FakeGainNode;

    // Dry straight out, wet through the delay — the sum of the two is the flange.
    expect(pre.nodes).toContain(asFake(outlet.loud));
    expect(pre.nodes).toContain(delay);
    // And two things reach `pre`: the tone's envelope and the crack's.
    expect(of(built, 'gain').filter((gain) => gain.nodes.includes(pre))).toHaveLength(2);
  });

  it('fires harder and longer as CHARGE rises, up to the top of the travel', () => {
    const { engine, ctx } = fullBoard();
    const time = 4;
    const small = shoot(engine, ctx, 0, time);
    const big = shoot(engine, ctx, 0.8, time);

    // Falls further...
    expect(automation(big.osc.frequency)[1]!.value).toBeLessThan(
      automation(small.osc.frequency)[1]!.value,
    );
    // ...and takes longer doing it.
    expect(big.osc.life[1]!.at!).toBeGreaterThan(small.osc.life[1]!.at!);
    // Still one square and one crack: this is the same gesture, turned up.
    expect(big.oscs).toHaveLength(1);
    expect(small.oscs).toHaveLength(1);
  });

  it('stops firing and starts discharging at the top of the control', () => {
    // The joke, asserted. Past dischargeAt the module does something else rather
    // than more of the same — the only control on this board where that is true.
    const { engine, ctx } = fullBoard();
    const time = 4;
    const shot = shoot(engine, ctx, LASER.dischargeAt - 0.01, time);
    const blast = shoot(engine, ctx, 1, time);

    // A second square, an octave under the first, so the drop has a floor.
    expect(shot.oscs).toHaveLength(1);
    expect(blast.oscs).toHaveLength(2);
    expect(blast.oscs[1]!.frequency.value).toBeCloseTo(blast.start * LASER.discharge.subMult, 10);

    // An order of magnitude lower and five times longer than the biggest shot.
    expect(automation(blast.osc.frequency)[1]!.value).toBeLessThan(
      automation(shot.osc.frequency)[1]!.value,
    );
    expect(automation(blast.osc.frequency)[1]!.time).toBe(time + LASER.discharge.sweep);
    expect(LASER.discharge.sweep).toBeGreaterThan(LASER.sweepFloor + LASER.sweepSpan);

    // And the flange opens out instead of closing in.
    const [from, to] = automation(blast.delay.delayTime);
    expect(to!.value).toBeGreaterThan(from!.value);
    expect(automation(shot.delay.delayTime)[1]!.value).toBeLessThan(
      automation(shot.delay.delayTime)[0]!.value,
    );
  });

  it('turns the crack into a swell when it discharges', () => {
    const { engine, ctx } = fullBoard();
    const time = 4;
    const { crack, highpass } = shoot(engine, ctx, 1, time);
    // Named off the graph rather than found by the shape of its automation: the
    // tone's envelope has the same three points, and a finder that matched on
    // that would be asserting whichever one it happened to reach first.
    const crackGain = highpass.nodes[0] as FakeGainNode;

    // A rise under the drop rather than a crack in front of it.
    expect(automation(crackGain.gain)).toEqual([
      { call: 'set', value: 0, time },
      { call: 'linear', value: LASER.discharge.crackGain, time: time + LASER.discharge.crackRise },
      { call: 'exponential', value: LASER.silence, time: time + LASER.discharge.crackLife },
    ]);
    expect(crack.life[1]!.at).toBeCloseTo(time + LASER.discharge.crackLife, 10);
  });

  it('never asks for a pitch below the floor, however deep the board is set', () => {
    // The module whose entire gesture is downward, at the bottom of everything.
    // An exponential ramp to zero is a runtime error and a sweep to 1Hz is not a
    // sound, so the floor is what stands between a discharge and both.
    const { engine, ctx } = fullBoard();
    engine.setGlobal('tuning', ROOTS.length - 1);
    engine.setGlobal('seriousness', 1);
    const { oscs } = shoot(engine, ctx, 1, 4);

    for (const osc of oscs) {
      for (const point of automation(osc.frequency)) {
        expect(point.value, `${point.call} @ ${point.time}`).toBeGreaterThanOrEqual(LASER.pitchFloor);
      }
    }
  });
});

// ---------------------------------------------------------------- the board

describe('the board as a whole', () => {
  it('moves every drone at once when TUNING or SERIOUSNESS is turned', () => {
    const { engine, ctx } = fullBoard();
    engine.setGlobal('tuning', 0);
    engine.setGlobal('seriousness', 0);
    const high = engine.root();
    engine.setGlobal('seriousness', 1);
    const low = engine.root();

    // A full octave down, which is what SERIOUSNESS is for.
    expect(low).toBeCloseTo(high / 2, 10);
    expect(guitar(engine, ctx).oscs[0]?.frequency.value).toBeCloseTo(low, 10);
    expect(bass(engine, ctx).sub.frequency.value).toBeCloseTo(low, 10);
    // The intervals travel with the whole board rather than being fixed offsets
    // in Hz: the sax is a minor third above the root wherever the root goes.
    expect(sax(engine, ctx).osc.frequency.value).toBeCloseTo(
      low * INTERVALS.minorThird * SAX.mult,
      10,
    );
    expect(chainsaw(engine, ctx).oscs[0]?.frequency.value).toBeCloseTo(
      low * CHAINSAW.mult * (CHAINSAW.pitchFloor + 0.5 * CHAINSAW.pitchSpan),
      10,
    );
  });

  it('opens with the whole cap free, and five loops running outside it', () => {
    const { engine, ctx } = fullBoard();

    // CHAINSAW and SAXOPHONE each loop the noise buffer for the session, gt#41
    // added two more — MAGNETS reads its wow table and its dropout table the
    // same way — and gt#42 added a fifth for THROAT's air. All five are built and
    // started like anything else, but nothing ever stops them, so they are not
    // one-shots and the cap is not about them (gt#31). The strikes open with all
    // 24, not 19.
    //
    // That the count keeps growing is exactly the thing gt#31 warned about and
    // exactly why it is not a problem: on the old accounting the board would by
    // now have spent five of the twenty-four before a single hit had fired, and
    // a tenth module wanting a hiss of its own would have cost the strikes a
    // sixth. The right answer was to stop counting them, not to ration them.
    const taps = of(ctx.created, 'buffersource') as FakeBufferSourceNode[];
    expect(taps).toHaveLength(5);
    for (const tap of taps) {
      expect(tap.loop).toBe(true);
      expect(tap.life.map((call) => call.call)).toEqual(['start']);
    }
    expect(engine.active).toBe(0);
  });

  it('never reaches for Math.random, because fiddling has to be repeatable', () => {
    const read = (name: string) =>
      readFileSync(fileURLToPath(new URL(`../src/engine/sources/${name}`, import.meta.url)), 'utf8');

    for (const name of ['index.ts', 'drones.ts', 'strikes.ts']) {
      expect(read(name)).not.toMatch(/Math\.random/);
    }
  });
});

// --------------------------------------------------------------- constants

describe('constants', () => {
  it('holds every source coefficient to the original design', () => {
    const pins: Array<[string, unknown, unknown]> = [
      // The accent table is not pinned: it was replaced by ear (gt#20). The
      // original design's was [1, .55, .85, .5, .9, .6, .75, .5, .8, .65, .7, .55].
      // The five the original design has. LASER CANNON is gt#42's and is registered in
      // POST_HANDOFF_SOURCES — see the same claim in ./heartbeat.test.ts.
      ['strike ids', transcribed(STRIKE_IDS), ['slowhit', 'cymbal', 'voice', 'maracas', 'cow']],

      ['guitar ceiling', GUITAR.maxGain, 0.45],
      ['guitar multiples', GUITAR.mults, [1, 2, 2, 4]],
      ['guitar detune', GUITAR.baseDetune, [-1, -1.4, 1.2, 0.7]],
      ['guitar stack gain', GUITAR.stackGain, 0.8],
      ['guitar spread', [GUITAR.spreadFloor, GUITAR.spreadSpan], [4, 24]],
      ['guitar third', GUITAR.thirdFloor, 0.25],
      ['guitar third span', GUITAR.thirdSpan, 0.75],
      ['guitar fourth', GUITAR.fourthFloor, 0.1],
      ['guitar fourth span', GUITAR.fourthSpan, 0.7],
      ['guitar pre', GUITAR.preFloor, 0.24],
      ['guitar pre span', GUITAR.preSpan, 0.18],
      ['guitar initial pre', GUITAR.initial.pre, 0.3],
      ['guitar filter', [GUITAR.initial.cutoff, GUITAR.initial.q], [1600, 0.8]],

      ['bass ceiling', BASS.maxGain, 0.7],
      ['bass saw', [BASS.sawMult, BASS.sawDetune], [2, 4]],
      ['bass saw curve', BASS.sawCurve, 0.3],
      ['bass sub', BASS.subFloor, 0.4],
      ['bass sub span', BASS.subSpan, 0.6],
      ['bass saw balance', BASS.sawFloor, 0.3],
      ['bass saw span', BASS.sawSpan, 0.14],
      ['bass cutoff', [BASS.cutoffFloor, BASS.cutoffSpan], [500, 500]],
      ['bass initial gains', BASS.initial.sub, 0.8],
      ['bass initial saw gain', BASS.initial.saw, 0.2],
      ['bass filter', [BASS.initial.cutoff, BASS.initial.q], [750, 0.9]],

      ['chainsaw ceiling', CHAINSAW.maxGain, 0.42],
      ['chainsaw saws', [CHAINSAW.mult, CHAINSAW.detunes[0], CHAINSAW.detunes[1]], [3, -13, 14]],
      ['chainsaw rate', [CHAINSAW.rateFloor, CHAINSAW.rateSpan], [7, 22]],
      ['chainsaw pitch', CHAINSAW.pitchFloor, 1],
      ['chainsaw pitch span', CHAINSAW.pitchSpan, 0.4],
      ['chainsaw noise', CHAINSAW.noiseFloor, 0.1],
      ['chainsaw noise span', CHAINSAW.noiseSpan, 0.28],
      ['chainsaw cutoff', [CHAINSAW.cutoffFloor, CHAINSAW.cutoffSpan], [1700, 2000]],
      ['chainsaw chug', CHAINSAW.initial.chug, 0.6],
      ['chainsaw filter', [CHAINSAW.initial.cutoff, CHAINSAW.initial.q], [2400, 1]],
      ['chainsaw noise band', [CHAINSAW.initial.noiseFreq, CHAINSAW.initial.noiseQ], [950, 1.2]],
      ['chainsaw initial noise', CHAINSAW.initial.noise, 0.18],
      ['chainsaw lfo', CHAINSAW.initial.rate, 12],
      ['chainsaw depth', CHAINSAW.initial.depth, 0.3],
      ['chainsaw initial pitch', CHAINSAW.initial.pitch, 1.16],

      // SAX's ceiling is not pinned: it was moved by ear (gt#20). The original
      // design's was 0.38.
      ['sax multiple', SAX.mult, 4],
      ['sax formant one', [SAX.formant1Floor, SAX.formant1Span], [540, 560]],
      ['sax formant two', [SAX.formant2Floor, SAX.formant2Span], [1000, 1000]],
      ['sax vibrato', [SAX.vibratoFloor, SAX.vibratoSpan], [3.8, 3.8]],
      ['sax depth', [SAX.depthFloor, SAX.depthSpan], [6, 34]],
      ['sax breath', SAX.breathFloor, 0.04],
      ['sax breath span', SAX.breathSpan, 0.15],
      ['sax formants', [SAX.initial.formant1, SAX.initial.formant1Q, SAX.initial.formant2, SAX.initial.formant2Q], [620, 7, 1150, 8]],
      ['sax formant gains', [SAX.initial.formant1Gain, SAX.initial.formant2Gain], [0.9, 0.55]],
      ['sax vibrato initial', [SAX.initial.vibrato, SAX.initial.depth], [4.5, 9]],
      ['sax breath band', [SAX.initial.breathFreq, SAX.initial.breathQ], [2700, 1]],
      ['sax breath initial', SAX.initial.breath, 0.05],

      ['slowhit ceiling', [SLOWHIT.maxGain, SLOWHIT.phase], [0.85, 0]],
      ['slowhit start', [SLOWHIT.startFloor, SLOWHIT.startMult], [50, 3]],
      ['slowhit end', [SLOWHIT.endFloor, SLOWHIT.endMult], [26, 0.9]],
      ['slowhit lift', SLOWHIT.liftSpan, 0.8],
      ['slowhit drop', SLOWHIT.dropFloor, 0.22],
      ['slowhit drop span', SLOWHIT.dropSpan, 0.25],
      ['slowhit peak', SLOWHIT.peak, 0.95],
      ['slowhit attack', SLOWHIT.attack, 0.006],
      ['slowhit decay', SLOWHIT.decayFloor, 0.7],
      ['slowhit decay span', SLOWHIT.decaySpan, 1.4],
      ['slowhit life', SLOWHIT.life, 2.4],
      ['slowhit click', [SLOWHIT.clickFreq, SLOWHIT.clickQ], [1400, 1]],
      ['slowhit click gain', SLOWHIT.clickGain, 0.2],
      ['slowhit click decay', SLOWHIT.clickDecay, 0.05],
      ['slowhit click life', SLOWHIT.clickLife, 0.07],

      ['cymbal ceiling', [CYMBAL.maxGain, CYMBAL.phase], [0.5, 2]],
      ['cymbal cutoff', [CYMBAL.cutoffFloor, CYMBAL.cutoffSpan, CYMBAL.cutoffQ], [2400, 4200, 0.9]],
      ['cymbal peak', [CYMBAL.peakFreq, CYMBAL.peakQ], [7500, 1]],
      ['cymbal peak gain', [CYMBAL.peakFloor, CYMBAL.peakSpan], [4, 6]],
      ['cymbal level', CYMBAL.levelFloor, 0.4],
      ['cymbal level span', CYMBAL.levelSpan, 0.25],
      ['cymbal rise', CYMBAL.rise, 0.75],
      ['cymbal tail', CYMBAL.tail, 2.6],
      ['cymbal offset', CYMBAL.offset, 0.3],
      ['cymbal life', CYMBAL.life, 2.7],

      ['voice ceiling', [VOICE.maxGain, VOICE.phase], [0.6, 1]],
      ['voice opens on chant', VOICE.initialChar, 1],
      ['voice pitch floor', VOICE.pitchFloor, 30],
      ['voice bend floor', VOICE.bendFloor, 20],
      ['voice glide start', VOICE.glideStart, 0.1],
      ['voice glide end', VOICE.glideEnd, 0.8],
      ['voice noise offset', VOICE.noiseOffset, 0.5],
      ['voice noise scale', VOICE.noiseScale, 0.5],
      ['voice hold', VOICE.hold, 0.6],
      ['voice tail', VOICE.tail, 0.1],
      // GROWL, CHANT, SHRIEK, WHISPER, in the order MODE steps through them.
      ['voice modes', VOICE_MODES, [
        { osc: 'sawtooth', mult: 2, bend: 0.82, duration: 2.3, attack: 0.12, gain: 0.9, drive: 0.5, noise: 0.18, formants: [[300, 6, 1], [620, 7, 0.7], [950, 8, 0.35]], glide: [240, 520, 820] },
        { osc: 'sawtooth', mult: 2, bend: 1, duration: 2.9, attack: 0.45, gain: 0.8, drive: 0.15, noise: 0.05, formants: [[700, 7, 1], [1080, 8, 0.55], [2650, 11, 0.2]], glide: [430, 760, 2400] },
        { osc: 'sawtooth', mult: 8, bend: 0.62, duration: 1.4, attack: 0.02, gain: 0.75, drive: 0.4, noise: 0.4, formants: [[950, 7, 1], [1750, 8, 0.75], [2900, 9, 0.45]], glide: [820, 1500, 2600] },
        { osc: null, mult: 0, bend: 1, duration: 2.5, attack: 0.35, gain: 0.6, drive: 0, noise: 1, formants: [[420, 5, 0.85], [1350, 6, 0.6], [2500, 7, 0.5]], glide: [520, 1500, 2700] },
      ]],

      ['maracas ceiling', [MARACAS.maxGain, MARACAS.phase], [0.5, 0]],
      ['maracas hits', [MARACAS.hitsFloor, MARACAS.hitsSpan], [1, 9]],
      ['maracas gap', [MARACAS.gapFloor, MARACAS.gapSpan], [0.115, 0.055]],
      ['maracas filters', [MARACAS.highpass, MARACAS.highpassQ, MARACAS.bandpass, MARACAS.bandpassQ], [4200, 0.8, 6600, 1.4]],
      ['maracas accent', [MARACAS.peak, ACCENTS.length], [0.8, 12]],
      ['maracas attack', MARACAS.attack, 0.004],
      ['maracas decay', MARACAS.decay, 0.05],
      ['maracas life', MARACAS.life, 0.07],
      ['maracas offsets', [MARACAS.offsetCycle, MARACAS.offsetStep], [7, 0.11]],

      ['cow ceiling', [COW.maxGain, COW.phase], [0.6, 3]],
      ['cow pitch', [COW.pitchFloor, COW.mult], [40, 5]],
      ['cow duration', [COW.durationFloor, COW.durationSpan], [1.25, 0.55]],
      ['cow start bend', COW.startBend, 0.92],
      ['cow rise', [COW.riseBend, COW.rise], [1.16, 0.17]],
      ['cow fall', [COW.endFloor, COW.fallFloor, COW.fallSpan], [24, 1.12, 0.9]],
      ['cow fall time', [COW.fallTimeFloor, COW.fallTimeSpan], [1, 0.5]],
      ['cow formants', [COW.formant1.start, COW.formant1.q, COW.formant2.start, COW.formant2.q], [430, 6, 820, 7]],
      ['cow formant one glide', [COW.formant1.start, COW.formant1.end, COW.formantGlide], [430, 300, 1]],
      ['cow formant two glide', [COW.formant2.start, COW.formant2.end, COW.formantGlide], [820, 520, 1]],
      ['cow formant gains', [COW.formant1.gain, COW.formant2.gain], [1, 0.6]],
      ['cow curve', COW.curve, 0.3],
      ['cow peak', COW.peak, 0.9],
      ['cow attack', COW.attack, 0.05],
      ['cow hold', COW.hold, 0.55],
      ['cow tail', COW.tail, 0.1],
    ];

    for (const [name, actual, pinned] of pins) expect(actual, name).toEqual(pinned);
  });

  it('keeps every envelope clear of the zero an exponential ramp cannot reach', () => {
    const floors = [SLOWHIT.silence, CYMBAL.silence, VOICE.silence, MARACAS.silence, COW.silence];

    for (const floor of floors) expect(floor).toBe(0.001);
  });
});
