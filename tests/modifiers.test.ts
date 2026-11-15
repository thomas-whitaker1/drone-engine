import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CAVERN,
  CURVE,
  DOPPLER,
  GRIT,
  IMPULSE,
  IMPULSE_SEEDS,
  MAGNETS,
  MODIFIER_DEFAULTS,
  MODIFIER_IDS,
  MURK,
  OFFSET,
  POST_HANDOFF_BOXES,
  SMOOTH,
  WARM,
  WOBBLE,
  type ModifierId,
} from '../src/engine/constants';
import type { Engine } from '../src/engine';
import { centsOf, heardGain, heardLength, tapePitchCeiling } from '../src/engine/deterministic';
import { MODIFIER_SPECS } from '../src/engine/modifiers';
import { SUMMON } from '../src/summon';
import { box, chainBoard } from './support/board';
import {
  asFake,
  FakeParam,
  ramps,
  type FakeAudioNode,
  type FakeAudioContext,
  type FakeBiquadNode,
  type FakeBufferSourceNode,
  type FakeConvolverNode,
  type FakeDelayNode,
  type FakeGainNode,
  type FakeOscillatorNode,
  type FakePannerNode,
  type FakeWaveShaperNode,
} from './support/fake-audio-context';

/** The four boxes the reference actually draws — everything the register does not name. */
const HANDOFF_BOXES: ModifierId[] = MODIFIER_IDS.filter((id) => !POST_HANDOFF_BOXES.includes(id));

/** GRIT, walked back out of the graph: in → pre → shaper → post → out. */
function grit(engine: Engine) {
  const modifier = box(engine, 'grit');
  const input = asFake(modifier.in);
  const pre = input.nodes[0] as FakeGainNode;
  const shaper = pre.nodes[0] as FakeWaveShaperNode;
  const post = shaper.nodes[0] as FakeGainNode;
  return { modifier, input, pre, shaper, post, out: asFake(modifier.out) };
}

function murk(engine: Engine) {
  const modifier = box(engine, 'murk');
  const input = asFake(modifier.in);
  return { modifier, input, lowpass: input.nodes[0] as FakeBiquadNode, out: asFake(modifier.out) };
}

/** WOBBLE keeps its LFO to itself, so the modulator is found by what it drives. */
function wobble(engine: Engine, ctx: FakeAudioContext) {
  const modifier = box(engine, 'wobble');
  const input = asFake(modifier.in);
  const [dry, delay] = [input.nodes[0] as FakeGainNode, input.nodes[1] as FakeDelayNode];
  const wet = delay.nodes[0] as FakeGainNode;
  const depth = ctx.created.find((node) => node.connections.includes(delay.delayTime)) as FakeGainNode;
  const lfo = ctx.created.find((node) => node.connections.includes(depth)) as FakeOscillatorNode;
  return { modifier, input, dry, delay, wet, depth, lfo, out: asFake(modifier.out) };
}

/**
 * How long a room's impulse actually is, in seconds: its nominal length, cut
 * where the tail has fallen eighty decibels — see IMPULSE in ../src/engine.
 */
const heardSeconds = (room: { readonly seconds: number; readonly decay: number }, rate: number): number =>
  heardLength(Math.floor(room.seconds * rate), room.decay) / rate;

/** What each room is turned up by for having had its silent tail cut off. */
const trim = (room: { readonly seconds: number; readonly decay: number }, rate: number): number =>
  heardGain(Math.floor(room.seconds * rate), room.decay);

function cavern(engine: Engine) {
  const modifier = box(engine, 'cavern');
  const input = asFake(modifier.in);
  const dry = input.nodes[0] as FakeGainNode;
  const room = input.nodes[1] as FakeConvolverNode;
  const cave = input.nodes[2] as FakeConvolverNode;
  const roomGain = room.nodes[0] as FakeGainNode;
  const caveGain = cave.nodes[0] as FakeGainNode;
  return {
    modifier,
    input,
    dry,
    room,
    cave,
    roomGain,
    caveGain,
    wet: roomGain.nodes[0] as FakeGainNode,
    out: asFake(modifier.out),
  };
}

/** DOPPLER: one LFO reaching a delay time, a wet gain and a cutoff at once. */
function doppler(engine: Engine, ctx: FakeAudioContext) {
  const modifier = box(engine, 'doppler');
  const input = asFake(modifier.in);
  const [dry, delay] = [input.nodes[0] as FakeGainNode, input.nodes[1] as FakeDelayNode];
  const lowpass = delay.nodes[0] as FakeBiquadNode;
  const wet = lowpass.nodes[0] as FakeGainNode;
  const driving = (target: unknown) =>
    ctx.created.find((node) => node.connections.includes(target as never)) as FakeGainNode;
  const sweep = driving(delay.delayTime);
  const gainSwing = driving(wet.gain);
  const lowpassSwing = driving(lowpass.frequency);
  const lfo = ctx.created.find((node) => node.connections.includes(sweep)) as FakeOscillatorNode;
  return { modifier, input, dry, delay, lowpass, wet, sweep, gainSwing, lowpassSwing, lfo, out: asFake(modifier.out) };
}

/** MAGNETS: no dry path, so the whole box is found by walking the one line through it. */
function magnets(engine: Engine, ctx: FakeAudioContext) {
  const modifier = box(engine, 'magnets');
  const input = asFake(modifier.in);
  const delay = input.nodes[0] as FakeDelayNode;
  const lowpass = delay.nodes[0] as FakeBiquadNode;
  const duck = lowpass.nodes[0] as FakeGainNode;
  const driving = (target: unknown) =>
    ctx.created.find((node) => node.connections.includes(target as never)) as FakeGainNode;
  const depth = driving(delay.delayTime);
  const drop = driving(duck.gain);
  const lpDrop = driving(lowpass.frequency);
  const tableFor = (gain: FakeGainNode) =>
    ctx.created.find((node) => node.connections.includes(gain)) as FakeBufferSourceNode;
  return {
    modifier,
    input,
    delay,
    lowpass,
    duck,
    depth,
    drop,
    lpDrop,
    wobbleTable: tableFor(depth),
    dropoutTable: tableFor(drop),
    out: asFake(modifier.out),
  };
}

/** OFFSET: dry beside a shared tap node, three delays hanging off it, and a return. */
function offset(engine: Engine) {
  const modifier = box(engine, 'offset');
  const input = asFake(modifier.in);
  const [dry, taps] = [input.nodes[0] as FakeGainNode, input.nodes[1] as FakeGainNode];
  const delays = taps.nodes.filter((node): node is FakeDelayNode => node.kind === 'delay');
  const tapGains = delays.map((delay) => delay.nodes[0] as FakeGainNode);
  const panners = tapGains.map((gain) => gain.nodes[0] as FakePannerNode);
  const damping = delays[delays.length - 1]?.nodes[1] as FakeBiquadNode;
  const feedback = damping?.nodes[0] as FakeGainNode;
  return { modifier, input, dry, taps, delays, tapGains, panners, damping, feedback, out: asFake(modifier.out) };
}

const kinds = (node: FakeAudioNode) => node.nodes.map((target) => target.kind);

describe('the chain', () => {
  it('registers every box in the order they are laid out', () => {
    const { engine } = chainBoard();

    expect(Object.keys(engine.modifiers)).toEqual([...MODIFIER_IDS]);
    for (const id of MODIFIER_IDS) expect(box(engine, id).id).toBe(id);
  });

  it('opens each box on its own default amount', () => {
    const { engine } = chainBoard();

    for (const id of MODIFIER_IDS) expect(box(engine, id).amount).toBe(MODIFIER_DEFAULTS[id]);
    // The default GRIT is the board's .55, applied — not the .5 it was built with.
    expect(grit(engine).pre.gain.value).toBeCloseTo(GRIT.preFloor + 0.55 * GRIT.preSpan, 10);
  });

  it('leaves every box able to pass a signal at rest', () => {
    const { engine } = chainBoard();

    for (const id of MODIFIER_IDS) {
      const modifier = box(engine, id);
      expect(asFake(modifier.in).nodes.length).toBeGreaterThan(0);
      expect(modifier.in).not.toBe(modifier.out);
    }
  });
});

// The registry is what a fifth box is added to. A missing entry is a compile
// error rather than a test failure, so what is asserted here is the part the
// type cannot see: that the table agrees with the chain order, and that the two
// facts gt#25 named as risks of generalizing are declared rather than special-cased.
describe('the modifier registry', () => {
  it('holds exactly the boxes MODIFIER_IDS names, in chain order', () => {
    expect(Object.keys(MODIFIER_SPECS)).toEqual([...MODIFIER_IDS]);
  });

  it('is where each box gets its name and its opening amount', () => {
    const { engine } = chainBoard();

    for (const id of MODIFIER_IDS) {
      // No builder writes its own id any more, so the key is the only name a box
      // has and it cannot disagree with the object beneath it.
      expect(box(engine, id).id, id).toBe(id);
      expect(MODIFIER_SPECS[id].defaultAmount, id).toBe(MODIFIER_DEFAULTS[id]);
      expect(box(engine, id).amount, id).toBe(MODIFIER_SPECS[id].defaultAmount);
    }
  });

  it('lets CAVERN listen to a global by declaring it, not by being named', () => {
    const { engine } = chainBoard();

    const listening = MODIFIER_IDS.filter((id) => box(engine, id).setSeriousness !== undefined);
    expect(listening).toEqual(['cavern']);
  });

  it('gives every box a summon range instead of branching on cavern', () => {
    for (const id of MODIFIER_IDS) {
      const { floor, span } = SUMMON.amounts[id];
      expect(floor, id).toBeGreaterThanOrEqual(0);
      expect(span, id).toBeGreaterThan(0);
      // A range that can overshoot the control would summon a box past its own top.
      expect(floor + span, id).toBeLessThanOrEqual(1);
    }
    // The one floor that is a design decision rather than the full sweep.
    expect(SUMMON.amounts.cavern.floor).toBeGreaterThan(0);
  });
});

describe('GRIT', () => {
  it('runs pre-gain → waveshaper → post-gain', () => {
    const { engine } = chainBoard();
    const { input, pre, shaper, post, out } = grit(engine);

    expect(kinds(input)).toEqual(['gain']);
    expect(kinds(pre)).toEqual(['waveshaper']);
    expect(kinds(shaper)).toEqual(['gain']);
    expect(post.nodes[0]).toBe(out);
    expect(shaper.oversample).toBe(GRIT.oversample);
  });

  it('never runs entirely clean, even turned all the way down', () => {
    const { engine } = chainBoard();
    const { modifier, shaper } = grit(engine);

    modifier.set(0);

    expect(shaper.curve).toBe(engine.curve(GRIT.curveFloor));
    expect(shaper.curve).not.toBe(engine.curve(0));
  });

  it('hands the shaper a curve only when it is a different curve', () => {
    // Assigning a curve is not free: the node copies the table under the lock
    // its own render takes, and a render that cannot have the lock puts out a
    // block of silence. MEGADRIFT moves GRIT ten times a second, and the memo
    // gives the same array back for every amount inside one of its steps.
    const { engine } = chainBoard();
    const { modifier, shaper } = grit(engine);
    modifier.set(0.5);

    let handed = 0;
    let held = shaper.curve;
    Object.defineProperty(shaper, 'curve', {
      configurable: true,
      get: () => held,
      set: (next: Float32Array | null) => {
        handed += 1;
        held = next;
      },
    });

    // Inside one step of the memo: the same curve, however often it is asked.
    const step = 1 / CURVE.steps / GRIT.curveSpan;
    for (let i = 0; i < 20; i += 1) modifier.set(0.5 + (step * i) / 100);
    expect(handed).toBe(0);
    expect(held).toBe(engine.curve(GRIT.curveFloor + 0.5 * GRIT.curveSpan));

    // Across the range it is handed one curve a step and no more than that.
    for (let i = 0; i <= 200; i += 1) modifier.set(i / 200);
    expect(handed).toBeGreaterThan(1);
    expect(handed).toBeLessThanOrEqual(Math.ceil(GRIT.curveSpan * CURVE.steps) + 1);
    expect(held).toBe(engine.curve(GRIT.curveFloor + GRIT.curveSpan));
  });

  it('compensates its own level, so more grit reads as dirtier not louder', () => {
    const { engine, ctx } = chainBoard();
    const { modifier, pre, post, shaper } = grit(engine);

    modifier.set(0);
    expect(pre.gain.value).toBeCloseTo(GRIT.preFloor, 10);
    expect(post.gain.value).toBeCloseTo(GRIT.postGain, 10);

    modifier.set(1);
    expect(shaper.curve).toBe(engine.curve(GRIT.curveFloor + GRIT.curveSpan));
    expect(pre.gain.value).toBeCloseTo(GRIT.preFloor + GRIT.preSpan, 10);
    expect(post.gain.value).toBeCloseTo(GRIT.postGain / (1 + GRIT.postDrive), 10);
    // Four times the drive, a little over half the level back out.
    expect(post.gain.value).toBeLessThan(GRIT.postGain);
    expect(ramps(post.gain).at(-1)).toEqual({
      value: GRIT.postGain / (1 + GRIT.postDrive),
      time: ctx.currentTime,
      constant: SMOOTH,
    });
  });
});

describe('MURK', () => {
  it('runs one lowpass and nothing else', () => {
    const { engine } = chainBoard();
    const { input, lowpass, out } = murk(engine);

    expect(kinds(input)).toEqual(['biquad']);
    expect(lowpass.type).toBe('lowpass');
    expect(lowpass.nodes[0]).toBe(out);
  });

  it('closes down and resonates as it is turned up', () => {
    const { engine, ctx } = chainBoard();
    const { modifier, lowpass } = murk(engine);

    modifier.set(0);
    expect(lowpass.frequency.value).toBe(MURK.open);
    expect(lowpass.Q.value).toBeCloseTo(MURK.qFloor, 10);

    modifier.set(1);
    // The 180Hz floor is a guard, not a destination — the sweep lands on 200.
    expect(lowpass.frequency.value).toBe(MURK.open - MURK.sweep);
    expect(lowpass.frequency.value).toBeGreaterThan(MURK.floor);
    expect(lowpass.Q.value).toBeCloseTo(MURK.qFloor + MURK.qSpan, 10);
    expect(ramps(lowpass.Q).at(-1)).toEqual({
      value: MURK.qFloor + MURK.qSpan,
      time: ctx.currentTime,
      constant: SMOOTH,
    });
  });
});

describe('WOBBLE', () => {
  it('runs dry alongside a delay the LFO keeps moving', () => {
    const { engine, ctx } = chainBoard();
    const { input, dry, delay, wet, depth, lfo, out } = wobble(engine, ctx);

    expect(kinds(input)).toEqual(['gain', 'delay']);
    expect(dry.nodes[0]).toBe(out);
    expect(wet.nodes[0]).toBe(out);
    expect(delay.maxDelayTime).toBe(WOBBLE.maxDelay);
    expect(delay.delayTime.value).toBe(WOBBLE.base);
    // The modulation lands on the delay time itself, never on the signal path.
    expect(lfo.type).toBe('sine');
    expect(lfo.connections).toEqual([depth]);
    expect(depth.connections).toEqual([delay.delayTime]);
    expect(depth.nodes).toEqual([]);
  });

  it('is silent at rest and detuned wide open', () => {
    const { engine, ctx } = chainBoard();
    const { modifier, wet, depth, lfo } = wobble(engine, ctx);

    modifier.set(0);
    expect(wet.gain.value).toBe(0);
    expect(depth.gain.value).toBeCloseTo(WOBBLE.depthFloor, 10);
    expect(lfo.frequency.value).toBeCloseTo(WOBBLE.rateFloor, 10);

    modifier.set(1);
    expect(wet.gain.value).toBeCloseTo(WOBBLE.wetSpan, 10);
    expect(depth.gain.value).toBeCloseTo(WOBBLE.depthFloor + WOBBLE.depthSpan, 10);
    expect(lfo.frequency.value).toBeCloseTo(WOBBLE.rateFloor + WOBBLE.rateSpan, 10);
    // Even wide open the wet copy never quite drowns the dry one.
    expect(wet.gain.value).toBeLessThan(1);
    expect(ramps(lfo.frequency).at(-1)).toEqual({
      value: WOBBLE.rateFloor + WOBBLE.rateSpan,
      time: ctx.currentTime,
      constant: SMOOTH,
    });
  });
});

describe('CAVERN', () => {
  it('runs dry alongside two rooms summed into one wet send', () => {
    const { engine } = chainBoard();
    const { input, dry, room, cave, roomGain, caveGain, wet, out } = cavern(engine);
    engine.settle();

    expect(kinds(input)).toEqual(['gain', 'convolver', 'convolver']);
    expect(dry.gain.value).toBe(CAVERN.dry);
    expect(dry.nodes[0]).toBe(out);
    expect(roomGain.nodes[0]).toBe(wet);
    expect(caveGain.nodes[0]).toBe(wet);
    expect(wet.nodes[0]).toBe(out);
    // Each room's impulse runs to where its tail goes silent, not to the end
    // of the arithmetic: the last twentieth of the short room and the last
    // ninth of the long one are under eighty decibels down, and a convolver is
    // paid for by the sample.
    const rate = engine.context.sampleRate;
    expect(room.buffer?.duration).toBeCloseTo(heardSeconds(CAVERN.room, rate), 10);
    expect(cave.buffer?.duration).toBeCloseTo(heardSeconds(CAVERN.cave, rate), 10);
    expect(room.buffer?.duration).toBeLessThan(CAVERN.room.seconds);
    expect(cave.buffer?.duration).toBeLessThan(CAVERN.cave.seconds);
    expect(cave.buffer?.duration).toBeCloseTo(CAVERN.cave.seconds * 0.888, 1);
    // Eighty decibels, and not the sixty a reverb is conventionally measured
    // to: the master compressor turns a quiet tail up. See IMPULSE.
    expect(IMPULSE.floor).toBeLessThanOrEqual(0.0001);
    expect(room.buffer?.numberOfChannels).toBe(2);
    expect(cave.buffer?.numberOfChannels).toBe(2);
  });

  it('plays a room cut at its silent tail exactly as loud as the whole one', () => {
    // A convolver levels its impulse by mean power, so cutting length off one
    // turns it down. Each room's gain carries what it is owed for that, which
    // is the square root of the lengths and nothing else.
    const { engine } = chainBoard();
    const { room, cave, roomGain, caveGain } = cavern(engine);
    engine.settle();
    const rate = engine.context.sampleRate;

    for (const [built, spec] of [
      [room, CAVERN.room],
      [cave, CAVERN.cave],
    ] as const) {
      const whole = Math.floor(spec.seconds * rate);
      const kept = built.buffer?.length ?? 0;
      expect(trim(spec, rate)).toBeCloseTo(Math.sqrt(whole / kept), 12);
      expect(engine.impulseTrim(spec.seconds, spec.decay)).toBe(trim(spec, rate));
      // Under a decibel, both: this is a correction, not a mix decision.
      expect(20 * Math.log10(trim(spec, rate))).toBeGreaterThan(0);
      expect(20 * Math.log10(trim(spec, rate))).toBeLessThan(1);

      // What was cut really was nothing: the last sample kept is already at
      // the floor, and the whole of what was dropped is under a hundred
      // millionth of the room's energy.
      const data = built.buffer?.getChannelData(0) ?? new Float32Array(0);
      const envelope = (i: number): number => Math.pow(1 - i / whole, spec.decay);
      expect(envelope(kept)).toBeLessThanOrEqual(IMPULSE.floor);
      expect(envelope(kept - 2)).toBeGreaterThan(IMPULSE.floor);
      expect(Math.abs(data[kept - 1] ?? 1)).toBeLessThanOrEqual(IMPULSE.floor * 1.01);
      const dropped = Math.pow(1 - kept / whole, 2 * spec.decay + 1);
      expect(dropped).toBeLessThan(1e-8);
    }

    const opening = engine.globals.seriousness;
    expect(roomGain.gain.value).toBeCloseTo((1 - opening) * CAVERN.roomGain * trim(CAVERN.room, rate), 10);
    expect(caveGain.gain.value).toBeCloseTo(opening * CAVERN.caveGain * trim(CAVERN.cave, rate), 10);
  });

  // The long room is 750k samples through the scalar generator, and the wake is
  // the one frame on this page that cannot afford them (gt#21). The box is built
  // without it and finished later; what this pins down is that "later" is a real
  // seam and not a hole — the cave is inaudible until it has an impulse, and it
  // arrives at whatever SERIOUSNESS says by then rather than at the build's.
  describe('the long room, built after the wake', () => {
    it('is silent rather than absent until the impulse lands', () => {
      const { engine } = chainBoard();
      const { input, cave, caveGain } = cavern(engine);

      // Wired in from the start — a graph that changed shape a second later
      // would be a second thing to get wrong.
      expect(kinds(input)).toEqual(['gain', 'convolver', 'convolver']);
      expect(cave.buffer).toBeNull();
      // And held at zero, so a convolver with no impulse cannot be heard
      // whatever a browser does with one.
      expect(caveGain.gain.value).toBe(0);
      expect(ramps(caveGain.gain)).toHaveLength(0);
    });

    it('opens on the SERIOUSNESS it finds, not the one it was built at', () => {
      const { engine } = chainBoard();
      const { cave, caveGain, roomGain } = cavern(engine);

      // A hand reaches the wheel before the warm-up runs.
      engine.setGlobal('seriousness', 1);
      expect(caveGain.gain.value).toBe(0);
      // The short room is unaffected: it has had its impulse all along.
      expect(roomGain.gain.value).toBe(0);

      engine.settle();

      const rate = engine.context.sampleRate;
      expect(cave.buffer?.duration).toBeCloseTo(heardSeconds(CAVERN.cave, rate), 10);
      expect(caveGain.gain.value).toBeCloseTo(CAVERN.caveGain * trim(CAVERN.cave, rate), 10);
    });

    it('warms once, however many times it is asked to', () => {
      const { engine } = chainBoard();
      const { cave, caveGain } = cavern(engine);

      engine.settle();
      const buffer = cave.buffer;
      const writes = ramps(caveGain.gain).length;
      engine.warm();
      engine.settle();
      engine.settle();

      expect(cave.buffer).toBe(buffer);
      expect(ramps(caveGain.gain)).toHaveLength(writes);
    });

    // Putting the room off (gt#21) moved its 25ms out of the wake frame and into
    // the frame that first draws the woken board. So it is written a stretch
    // per task (gt#30). What this pins: no stretch runs inside `warm()` itself,
    // each task writes one stretch, the cave is held shut until the last of
    // them, and the room that arrives is the same bytes as one written whole.
    describe('a stretch at a time', () => {
      afterEach(() => {
        vi.useRealTimers();
      });

      /** How many tasks the long room takes on this board: its kept length, a stretch at a time. */
      const stretches = (ctx: FakeAudioContext): number =>
        IMPULSE_SEEDS.length *
        Math.ceil(heardLength(Math.floor(CAVERN.cave.seconds * ctx.sampleRate), CAVERN.cave.decay) / WARM.slice);

      it('does none of the work inside the call that starts it', () => {
        vi.useFakeTimers();
        const { engine } = chainBoard();
        const { cave } = cavern(engine);

        engine.warm();
        expect(cave.buffer).toBeNull();
        // And not in the same task either: the first stretch waits out a gap.
        vi.advanceTimersByTime(WARM.gapMs - 1);
        expect(cave.buffer).toBeNull();
      });

      it('lands after one task per stretch, and is shut until the last', () => {
        vi.useFakeTimers();
        const { engine, ctx } = chainBoard();
        const { cave, caveGain } = cavern(engine);
        const tasks = stretches(ctx);
        // More than one, or this is not a test of anything.
        expect(tasks).toBeGreaterThan(2);

        engine.warm();
        vi.advanceTimersByTime(WARM.gapMs * (tasks - 1));
        expect(cave.buffer).toBeNull();
        expect(caveGain.gain.value).toBe(0);
        expect(ramps(caveGain.gain)).toHaveLength(0);

        vi.advanceTimersByTime(WARM.gapMs);
        expect(cave.buffer?.duration).toBeCloseTo(heardSeconds(CAVERN.cave, ctx.sampleRate), 10);
        expect(caveGain.gain.value).toBeCloseTo(
          engine.globals.seriousness * CAVERN.caveGain * trim(CAVERN.cave, ctx.sampleRate),
          10,
        );
        // And nothing is left ticking once it has.
        expect(vi.getTimerCount()).toBe(0);
      });

      it('builds the same room as one written whole', () => {
        vi.useFakeTimers();
        const { engine } = chainBoard();
        const { cave } = cavern(engine);
        const whole = engine.impulse(CAVERN.cave.seconds, CAVERN.cave.decay);

        engine.warm();
        vi.runAllTimers();

        for (let channel = 0; channel < IMPULSE_SEEDS.length; channel++) {
          expect(cave.buffer?.getChannelData(channel)).toEqual(whole.getChannelData(channel));
        }
      });

      it('opens on the SERIOUSNESS it finds when the last stretch lands', () => {
        vi.useFakeTimers();
        const { engine } = chainBoard();
        const { caveGain } = cavern(engine);

        engine.warm();
        vi.advanceTimersByTime(WARM.gapMs);
        // A hand reaches the wheel while the room is half written.
        engine.setGlobal('seriousness', 1);
        expect(caveGain.gain.value).toBe(0);
        vi.runAllTimers();

        expect(caveGain.gain.value).toBeCloseTo(
          CAVERN.caveGain * trim(CAVERN.cave, engine.context.sampleRate),
          10,
        );
      });

      it('stops where it is when the engine is stopped', () => {
        vi.useFakeTimers();
        const { engine } = chainBoard();
        const { cave, caveGain } = cavern(engine);

        engine.warm();
        vi.advanceTimersByTime(WARM.gapMs);
        engine.stop();
        vi.runAllTimers();

        expect(vi.getTimerCount()).toBe(0);
        expect(cave.buffer).toBeNull();
        expect(caveGain.gain.value).toBe(0);
      });

      it('is finished on the spot by settle(), part-way through or not', () => {
        vi.useFakeTimers();
        const { engine } = chainBoard();
        const { cave } = cavern(engine);
        const whole = engine.impulse(CAVERN.cave.seconds, CAVERN.cave.decay);

        engine.warm();
        vi.advanceTimersByTime(WARM.gapMs * 2);
        engine.settle();

        expect(cave.buffer?.getChannelData(0)).toEqual(whole.getChannelData(0));
        expect(cave.buffer?.getChannelData(1)).toEqual(whole.getChannelData(1));
        expect(vi.getTimerCount()).toBe(0);
      });
    });
  });

  it('sets how much room there is from its own control', () => {
    const { engine } = chainBoard();
    const { modifier, wet } = cavern(engine);

    modifier.set(0);
    expect(wet.gain.value).toBe(0);

    modifier.set(1);
    // Wet is allowed past unity — a full CAVERN is meant to swallow the board.
    expect(wet.gain.value).toBeCloseTo(CAVERN.wetSpan, 10);
    expect(wet.gain.value).toBeGreaterThan(1);
  });

  it('picks which room it is by SERIOUSNESS, not by its own control', () => {
    const { engine, ctx } = chainBoard();
    const { roomGain, caveGain } = cavern(engine);
    engine.settle();
    const opening = engine.globals.seriousness;

    // Each weight carries what its room is owed for the tail it had cut off —
    // see the test above. The crossfade is still the reference's.
    const roomTrim = trim(CAVERN.room, ctx.sampleRate);
    const caveTrim = trim(CAVERN.cave, ctx.sampleRate);
    expect(roomGain.gain.value).toBeCloseTo((1 - opening) * CAVERN.roomGain * roomTrim, 10);
    expect(caveGain.gain.value).toBeCloseTo(opening * CAVERN.caveGain * caveTrim, 10);

    engine.setGlobal('seriousness', 1);

    expect(roomGain.gain.value).toBe(0);
    expect(caveGain.gain.value).toBeCloseTo(CAVERN.caveGain * caveTrim, 10);
    expect(ramps(caveGain.gain).at(-1)).toEqual({
      value: CAVERN.caveGain * caveTrim,
      time: ctx.currentTime,
      constant: SMOOTH,
    });
  });

  it('leaves the crossfade alone when the CAVERN control moves', () => {
    const { engine } = chainBoard();
    const { roomGain, caveGain } = cavern(engine);
    engine.settle();
    const before = [roomGain.gain.value, caveGain.gain.value];
    const writes = [ramps(roomGain.gain).length, ramps(caveGain.gain).length];

    engine.setMod('cavern', 0.9);

    expect([roomGain.gain.value, caveGain.gain.value]).toEqual(before);
    expect([ramps(roomGain.gain).length, ramps(caveGain.gain).length]).toEqual(writes);
  });
});

describe('DOPPLER', () => {
  it('runs dry alongside a swept delay into a lowpass', () => {
    const { engine, ctx } = chainBoard();
    const { input, dry, delay, lowpass, wet, out } = doppler(engine, ctx);

    expect(kinds(input)).toEqual(['gain', 'delay']);
    expect(dry.nodes[0]).toBe(out);
    expect(delay.maxDelayTime).toBe(DOPPLER.maxDelay);
    expect(delay.delayTime.value).toBe(DOPPLER.base);
    expect(lowpass.type).toBe('lowpass');
    expect(wet.nodes[0]).toBe(out);
  });

  it('drives the delay, the level and the cutoff off one LFO', () => {
    const { engine, ctx } = chainBoard();
    const { delay, lowpass, wet, sweep, gainSwing, lowpassSwing, lfo } = doppler(engine, ctx);

    expect(lfo.type).toBe('sine');
    // One modulator, three destinations — not three oscillators that happen to
    // agree, which is the version of this box that drifts apart on a long note.
    expect(lfo.connections).toEqual([sweep, gainSwing, lowpassSwing]);
    expect(sweep.connections).toEqual([delay.delayTime]);
    expect(gainSwing.connections).toEqual([wet.gain]);
    expect(lowpassSwing.connections).toEqual([lowpass.frequency]);
  });

  it('shortens the delay exactly when it brightens and lifts it', () => {
    const { engine, ctx } = chainBoard();
    const { modifier, sweep, gainSwing, lowpassSwing } = doppler(engine, ctx);

    // The whole box is this sign relationship. A positive half-cycle has to mean
    // *nearer*: shorter delay, louder, brighter. Flip any one of the three and
    // this stops being a thing going past and becomes three unrelated wobbles.
    for (const amount of [0, 0.5, 1]) {
      modifier.set(amount);
      expect(sweep.gain.value, `${amount}`).toBeLessThan(0);
      expect(gainSwing.gain.value, `${amount}`).toBeGreaterThan(0);
      expect(lowpassSwing.gain.value, `${amount}`).toBeGreaterThan(0);
    }
  });

  it('is a long sweep where WOBBLE is a fast one', () => {
    const { engine, ctx } = chainBoard();
    const { modifier, lfo, sweep } = doppler(engine, ctx);

    modifier.set(1);
    // Seconds per pass, against WOBBLE's several per second — the distinction
    // gt#41 opens with, as arithmetic rather than as a comment. The two ranges
    // meet exactly and do not overlap: DOPPLER at its fastest is WOBBLE at its
    // slowest, and every other setting of either is on its own side of that line.
    expect(lfo.frequency.value).toBeCloseTo(DOPPLER.rateFloor + DOPPLER.rateSpan, 10);
    expect(lfo.frequency.value).toBeLessThanOrEqual(WOBBLE.rateFloor);
    expect(1 / lfo.frequency.value).toBeGreaterThanOrEqual(2);
    // And an order of magnitude more depth than WOBBLE's widest.
    expect(Math.abs(sweep.gain.value)).toBeGreaterThan(WOBBLE.depthFloor + WOBBLE.depthSpan);
  });

  it('never sweeps the delay line to nothing, or past its ceiling', () => {
    const { engine, ctx } = chainBoard();
    const { modifier, delay } = doppler(engine, ctx);

    modifier.set(1);
    const widest = DOPPLER.depthFloor + DOPPLER.depthSpan;
    expect(DOPPLER.base - widest).toBeGreaterThan(0);
    expect(DOPPLER.base + widest).toBeLessThan(delay.maxDelayTime);
  });

  it('is audible at both ends of its own control', () => {
    const { engine, ctx } = chainBoard();
    const { modifier, wet, lowpass, lfo } = doppler(engine, ctx);

    modifier.set(0);
    const bottom = [wet.gain.value, lowpass.frequency.value, lfo.frequency.value];
    // Nothing dead at zero: the wet copy is still there and still moving (gt#15).
    expect(wet.gain.value).toBeGreaterThan(0);
    expect(lfo.frequency.value).toBeGreaterThan(0);

    modifier.set(1);
    expect([wet.gain.value, lowpass.frequency.value, lfo.frequency.value]).not.toEqual(bottom);
    expect(ramps(lfo.frequency).at(-1)?.constant).toBe(SMOOTH);
  });
});

describe('MAGNETS', () => {
  it('runs one line with no dry path: delay → lowpass → duck', () => {
    const { engine, ctx } = chainBoard();
    const { input, delay, lowpass, duck, out } = magnets(engine, ctx);

    // Tape is not an effect beside the signal, it is what the signal is on — so
    // there is deliberately nothing for a dry gain to be.
    expect(kinds(input)).toEqual(['delay']);
    expect(delay.maxDelayTime).toBe(MAGNETS.maxDelay);
    expect(delay.delayTime.value).toBe(MAGNETS.base);
    expect(lowpass.type).toBe('lowpass');
    expect(duck.nodes[0]).toBe(out);
  });

  it('reads two fixed tables, at different lengths so they never lock', () => {
    const { engine, ctx } = chainBoard();
    const { wobbleTable, dropoutTable, depth, drop, lpDrop } = magnets(engine, ctx);

    for (const table of [wobbleTable, dropoutTable]) {
      expect(table.loop).toBe(true);
      expect(table.life).toEqual([{ call: 'start', at: undefined }]);
      expect(table.buffer?.sampleRate).toBe(MAGNETS.table.rate);
    }
    expect(wobbleTable.buffer?.duration).toBeCloseTo(MAGNETS.table.wobbleSeconds, 10);
    expect(dropoutTable.buffer?.duration).toBeCloseTo(MAGNETS.table.dropoutSeconds, 10);
    // Different lengths is the point: 11 and 13 realign every 143 seconds, so a
    // fixed table never settles into an audible loop.
    expect(MAGNETS.table.wobbleSeconds).not.toBe(MAGNETS.table.dropoutSeconds);

    expect(wobbleTable.connections).toEqual([depth]);
    // One dropout curve doing both jobs, which is what makes a dip read as tape
    // lifting off a head rather than as somebody moving a volume knob quickly.
    expect(dropoutTable.connections).toEqual([drop, lpDrop]);
  });

  it('holds every table to a fixed seed, and to no clock', () => {
    const a = chainBoard();
    const b = chainBoard();
    const left = magnets(a.engine, a.ctx);
    const right = magnets(b.engine, b.ctx);

    // Two boards, byte-identical tables. The first law, checked on the one box
    // that would have been most tempting to reach for Math.random in.
    expect([...(left.wobbleTable.buffer?.getChannelData(0) ?? [])]).toEqual([
      ...(right.wobbleTable.buffer?.getChannelData(0) ?? []),
    ]);
    expect([...(left.dropoutTable.buffer?.getChannelData(0) ?? [])]).toEqual([
      ...(right.dropoutTable.buffer?.getChannelData(0) ?? []),
    ]);
  });

  it('loops the wobble table without a seam in it', () => {
    const { engine, ctx } = chainBoard();
    const { wobbleTable } = magnets(engine, ctx);
    const data = wobbleTable.buffer?.getChannelData(0) ?? new Float32Array();

    // Each component completes a whole number of turns, so the end meets the
    // start. A table that jumps at its loop point is a click every 11 seconds.
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toBeCloseTo(data[data.length - 1] ?? 1, 2);
    // And it swings both ways rather than sitting on one side of rest.
    expect(Math.min(...data)).toBeLessThan(0);
    expect(Math.max(...data)).toBeGreaterThan(0);
  });

  it('keeps the dropout table a depth, at rest for most of its length', () => {
    const { engine, ctx } = chainBoard();
    const { dropoutTable } = magnets(engine, ctx);
    const data = dropoutTable.buffer?.getChannelData(0) ?? new Float32Array();

    // 0 is tape working and 1 is the bottom of a dip, so the gains that read it
    // are negative and the resting value has to be 0 rather than 1.
    expect(Math.min(...data)).toBe(0);
    expect(Math.max(...data)).toBeLessThanOrEqual(1);
    expect(Math.max(...data)).toBeGreaterThan(0.5);
    const atRest = [...data].filter((sample) => sample === 0).length;
    expect(atRest / data.length).toBeGreaterThan(0.8);
  });

  // The governing law, as three numbers rather than as a paragraph. gt#41 asks for
  // a ceiling in as many words — "a faithful tape simulation can make the board
  // sound genuinely broken rather than heavy" — and a ceiling nothing checks is
  // an intention. Each of these three is what "nothing can go wrong" means on
  // this box, and each fails if a later ear-tuning pass reaches too far.
  describe('the ceiling', () => {
    it('bends pitch well short of a quarter tone, wide open', () => {
      const cents = centsOf(tapePitchCeiling());

      // Audibly a machine dragging at something. Not audibly a broken file.
      expect(cents).toBeGreaterThan(20);
      expect(cents).toBeLessThan(50);
    });

    it('thins the signal in a dropout but never silences it', () => {
      const { engine, ctx } = chainBoard();
      const { modifier, drop } = magnets(engine, ctx);

      modifier.set(1);
      const deepest = MAGNETS.dropFloor + MAGNETS.dropSpan;
      expect(drop.gain.value).toBeCloseTo(-deepest, 10);
      // The duck sits at 1 and the curve subtracts, so this is the floor it
      // reaches. Under 1 means the box never gates the board off.
      expect(1 - deepest).toBeGreaterThan(0.3);
      expect(deepest).toBeLessThan(1);
    });

    it('takes the highs with it and stops well above the mud', () => {
      const { engine, ctx } = chainBoard();
      const { modifier, lpDrop } = magnets(engine, ctx);

      modifier.set(1);
      const drop = MAGNETS.lpDropFloor + MAGNETS.lpDropSpan;
      expect(lpDrop.gain.value).toBeCloseTo(-drop, 10);
      // Dull, not gone — and never negative, which a filter cannot be.
      expect(MAGNETS.lpOpen - drop).toBeGreaterThan(1000);
    });

    it('cannot be summoned past the top of its own control', () => {
      // SUMMON gives MAGNETS the full sweep on purpose: the constraint belongs
      // in the box, so the button is allowed to reach the top of it.
      const { floor, span } = SUMMON.amounts.magnets;
      expect(floor + span).toBe(1);
    });
  });

  it('is a pass-through at rest and dragging at the top', () => {
    const { engine, ctx } = chainBoard();
    const { modifier, depth, drop, lpDrop } = magnets(engine, ctx);

    modifier.set(0);
    // Not zero — the no-dead-controls rule cuts both ways, and a tape machine
    // that is perfectly steady is a tape machine nobody believes (gt#15).
    expect(depth.gain.value).toBeCloseTo(MAGNETS.depthFloor, 10);
    expect(depth.gain.value).toBeGreaterThan(0);

    modifier.set(1);
    expect(depth.gain.value).toBeCloseTo(MAGNETS.depthFloor + MAGNETS.depthSpan, 10);
    expect(depth.gain.value).toBeGreaterThan(MAGNETS.depthFloor * 10);
    expect(ramps(drop.gain).at(-1)?.constant).toBe(SMOOTH);
    expect(ramps(lpDrop.gain).at(-1)?.constant).toBe(SMOOTH);
  });
});

describe('OFFSET', () => {
  it('runs dry beside three taps at fixed relations', () => {
    const { engine } = chainBoard();
    const { input, dry, delays, out } = offset(engine);

    expect(kinds(input)).toEqual(['gain', 'gain']);
    expect(dry.gain.value).toBe(OFFSET.dry);
    expect(dry.nodes[0]).toBe(out);
    expect(delays).toHaveLength(OFFSET.taps.length);
    for (const delay of delays) expect(delay.maxDelayTime).toBe(OFFSET.maxDelay);
  });

  it('puts the three taps in three places, which is what makes it width', () => {
    const { engine } = chainBoard();
    const { panners, tapGains, out } = offset(engine);

    // Time alone is phase smear. Time plus place is the width gt#41 asks this box
    // for, and it is the only stereo placement on the board.
    expect(panners.map((panner) => panner.pan.value)).toEqual([...OFFSET.tapPans]);
    expect(new Set(panners.map((panner) => panner.pan.value)).size).toBe(OFFSET.tapPans.length);
    for (const panner of panners) expect(panner.nodes[0]).toBe(out);
    expect(tapGains.map((gain) => gain.gain.value)).toEqual([...OFFSET.tapGains]);
  });

  it('spreads the taps further as the control rises', () => {
    const { engine } = chainBoard();
    const { modifier, delays } = offset(engine);

    modifier.set(0);
    const near = delays.map((delay) => delay.delayTime.value);
    expect(near[0]).toBeCloseTo(OFFSET.baseFloor, 10);

    modifier.set(1);
    const far = delays.map((delay) => delay.delayTime.value);
    delays.forEach((_, i) => expect(far[i], `${i}`).toBeGreaterThan(near[i] ?? 0));
    // The relations hold at both ends — they are the box's shape, not its amount.
    const ratios = far.map((time) => (time ?? 0) / (far[0] ?? 1));
    ratios.forEach((ratio, i) => expect(ratio).toBeCloseTo(OFFSET.taps[i] ?? 0, 6));
    // And the longest tap still fits the line it runs on.
    expect(Math.max(...far.map((time) => time ?? 0))).toBeLessThan(OFFSET.maxDelay);
  });

  it('holds feedback at exactly zero for the bottom half of the control', () => {
    const { engine } = chainBoard();
    const { modifier, feedback, damping } = offset(engine);

    // "No feedback at low amounts" is the issue's wording and this is it kept
    // literally: zero, not nearly zero, everywhere below the knee.
    for (const amount of [0, 0.2, OFFSET.feedbackKnee]) {
      modifier.set(amount);
      expect(feedback.gain.value, `${amount}`).toBe(0);
    }

    modifier.set(0.7);
    expect(feedback.gain.value).toBeGreaterThan(0);
    // Darkened on the way round, so repeats fade rather than pile up.
    expect(damping.type).toBe('lowpass');
    expect(damping.frequency.value).toBe(OFFSET.feedbackCutoff);
  });

  it('returns to the taps rather than to the input, so the dry path stays out of the loop', () => {
    const { engine } = chainBoard();
    const { taps, feedback, delays } = offset(engine);

    expect(feedback.nodes[0]).toBe(taps);
    // A repeat goes back through all three taps and all three pans, which is
    // what makes the tail the same shape as the first arrival.
    for (const delay of delays) expect(taps.nodes).toContain(delay);
  });

  it('trims the taps as the loop opens, so more reads as deeper not louder', () => {
    const { engine } = chainBoard();
    const { modifier, tapGains } = offset(engine);

    modifier.set(0);
    const quiet = tapGains.map((gain) => gain.gain.value);
    modifier.set(1);
    tapGains.forEach((gain, i) => expect(gain.gain.value, `${i}`).toBeLessThan(quiet[i] ?? 0));
    expect(ramps(tapGains[0]?.gain as never).at(-1)?.constant).toBe(SMOOTH);
  });
});

// The one thing gt#41 flags as needing an ear before shipping, answered as
// arithmetic instead: "SUMMON will happily patch DOPPLER into OFFSET, and both
// are delays." It will, and it is legal, so what matters is that the worst case
// a forward chain can build is a long slap rather than a runaway.
describe('a chain of delays', () => {
  it('cannot build a feedback path that grows', () => {
    const { engine } = chainBoard();
    const { modifier, feedback } = offset(engine);

    modifier.set(1);
    // The only feedback coefficient anywhere in the chain. Under 1 means every
    // pass loses level, whatever else is patched around it.
    const worst = (1 - OFFSET.feedbackKnee) * OFFSET.feedbackSpan;
    expect(feedback.gain.value).toBeCloseTo(worst, 10);
    expect(worst).toBeLessThan(1);
    // Comfortably under, not marginally: more than half the level per pass.
    expect(worst).toBeLessThan(0.5);
  });

  it('keeps the worst legal arrival spread inside a third of a second', () => {
    // DOPPLER at its longest into OFFSET at its longest, which is the deepest
    // forward chain of delays MODIFIER_IDS admits and exactly what SUMMON's
    // forward-only chaining can reach.
    const dopplerWorst = DOPPLER.base + DOPPLER.depthFloor + DOPPLER.depthSpan;
    const offsetWorst = (OFFSET.baseFloor + OFFSET.baseSpan) * Math.max(...OFFSET.taps);

    expect(dopplerWorst + offsetWorst).toBeLessThan(0.35);
    // MAGNETS is the third delay and adds almost nothing — it is a tape path,
    // not a time effect, and this is the number that says so.
    expect(MAGNETS.base + MAGNETS.depthFloor + MAGNETS.depthSpan).toBeLessThan(0.01);
  });

  it('leaves every box measurably different at 0 and at 1', () => {
    // gt#15 applies to modifier amounts too, and seven boxes is four more chances
    // to ship a control that does nothing. Walked over all of them rather than
    // over the three that are new: the rule is not about who added the box.
    const { engine, ctx } = chainBoard();

    /** Every audio parameter this board currently holds, as one list of numbers. */
    const reading = (): number[] =>
      ctx.created.flatMap((node) =>
        Object.values(node)
          .filter((value): value is FakeParam => value instanceof FakeParam)
          .map((param) => param.value),
      );

    for (const id of MODIFIER_IDS) {
      const modifier = box(engine, id);

      modifier.set(0);
      const bottom = reading();
      modifier.set(1);
      expect(reading(), id).not.toEqual(bottom);
    }
  });
});

describe('control surface', () => {
  it('reaches the real boxes through setMod', () => {
    const { engine } = chainBoard();

    engine.setMod('grit', 0.8);
    engine.setMod('murk', 0.25);

    expect(box(engine, 'grit').amount).toBe(0.8);
    expect(grit(engine).pre.gain.value).toBeCloseTo(GRIT.preFloor + 0.8 * GRIT.preSpan, 10);
    expect(murk(engine).lowpass.frequency.value).toBe(MURK.open - 0.25 * MURK.sweep);
  });
});

describe('constants', () => {
  it('holds every modifier coefficient to the original design', () => {
    const pins: Array<[string, unknown, unknown]> = [
      ['chain order', HANDOFF_BOXES, ['grit', 'murk', 'wobble', 'cavern']],
      ['grit curve', GRIT.curveFloor, 0.1],
      // GRIT's curve span is not pinned: it was widened by ear (gt#20). The
      // original design's was 0.9.
      ['grit pre', GRIT.preFloor, 0.25],
      ['grit pre span', GRIT.preSpan, 0.75],
      ['grit post', GRIT.postGain, 0.9],
      ['grit post drive', GRIT.postDrive, 0.6],
      ['grit oversample', GRIT.oversample, '2x'],
      ['grit initial curve', GRIT.initial.curve, 0.5],
      ['grit initial gains', [GRIT.initial.pre, GRIT.initial.post], [0.5, 0.8]],
      ['murk sweep', [MURK.floor, MURK.open, MURK.sweep], [180, 2800, 2600]],
      ['murk resonance', MURK.qFloor, 0.7],
      ['murk resonance span', MURK.qSpan, 2.5],
      ['murk initial filter', [MURK.initial.frequency, MURK.initial.q], [1500, 1]],
      ['wobble delay ceiling', WOBBLE.maxDelay, 0.2],
      ['wobble base delay', WOBBLE.base, 0.025],
      ['wobble wet', WOBBLE.wetSpan, 0.9],
      ['wobble depth', WOBBLE.depthFloor, 0.002],
      ['wobble depth span', WOBBLE.depthSpan, 0.011],
      ['wobble rate', WOBBLE.rateFloor, 0.5],
      ['wobble rate span', WOBBLE.rateSpan, 3.5],
      ['wobble initial lfo', WOBBLE.initial.rate, 1.2],
      ['wobble initial depth', WOBBLE.initial.depth, 0.004],
      ['cavern dry', CAVERN.dry, 0.95],
      ['cavern wet', CAVERN.wetSpan, 1.3],
      ['cavern room', [CAVERN.room.seconds, CAVERN.room.decay], [2.4, 3]],
      ['cavern cave', [CAVERN.cave.seconds, CAVERN.cave.decay], [8.5, 4.2]],
      ['cavern room crossfade', CAVERN.roomGain, 0.9],
      ['cavern cave crossfade', CAVERN.caveGain, 1.1],
      ['cavern initial wet', CAVERN.initial.wet, 0.6],
      ['cavern initial crossfade', [CAVERN.initial.room, CAVERN.initial.cave], [0.6, 0.4]],
    ];

    for (const [name, actual, pinned] of pins) expect(actual, name).toEqual(pinned);
  });

  it('opens each box the original design has where its board opens it', () => {
    // The reference board's values rather than its engine's: the engine's inline
    // `amount: .5` on GRIT was a placeholder the board overwrote with .55 the
    // moment it synced its defaults after start().
    //
    // Pinned for the four rather than for all seven. The three the design never
    // drew are named below rather than left as a gap for a reader to notice.
    expect(Object.fromEntries(HANDOFF_BOXES.map((id) => [id, MODIFIER_DEFAULTS[id]]))).toEqual({
      grit: 0.55,
      murk: 0.5,
      wobble: 0.35,
      cavern: 0.5,
    });
  });

  // What replaces the four rows the quotes above no longer cover — and it is a
  // stricter test than the one it stands in for, not a looser one. gt#41 added
  // three boxes the handoff has never had, and the risk that creates is not that
  // they go unquoted: it is that "the reference does not have this box" quietly
  // becomes a reason to stop quoting the four it does. So the register is checked
  // from both ends.
  describe('the boxes the handoff never drew', () => {
    it('names exactly the boxes MODIFIER_IDS has and the reference does not', () => {
      expect([...POST_HANDOFF_BOXES].sort()).toEqual(['doppler', 'magnets', 'offset']);
      // Every name in the register is a box this board actually builds.
      for (const id of POST_HANDOFF_BOXES) {
        expect(MODIFIER_IDS, id).toContain(id);
      }
      // And the four left over are the four the reference draws, in its order.
      expect(HANDOFF_BOXES).toEqual(['grit', 'murk', 'wobble', 'cavern']);
    });
  });
});
