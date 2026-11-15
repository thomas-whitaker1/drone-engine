// The hammer's own sound (gt#87): what a blow is made of, where it goes, and the
// four things it must never do — go through the patch, follow the tuning, spend
// voices it was not given, or draw a number.
//
// What this cannot hold is whether it *sounds* like a hammer. That is an ear's
// job and it is written down as owed in the issue; the numbers in HAMMER were
// chosen by arithmetic. What is here is everything about it that is decidable.

import { describe, expect, it } from 'vitest';
import { buildModifiers, buildSources, createEngine } from '../src/engine';
import type { Engine } from '../src/engine';
import { HAMMER, ROOTS, SLOWHIT, VOICE_CAP } from '../src/engine/constants';
import { HAMMER_VOICES, hammerBlow } from '../src/engine/hammer';
import {
  FakeAudioContext,
  FakeBiquadNode,
  FakeBufferSourceNode,
  FakeGainNode,
  FakeOscillatorNode,
  asAudioContext,
  asFake,
  automation,
  reachable,
  retireVoices,
} from './support/fake-audio-context';
import type { FakeAudioNode } from './support/fake-audio-context';

function startEngine(): { engine: Engine; ctx: FakeAudioContext } {
  const ctx = new FakeAudioContext();
  ctx.currentTime = 5;
  const engine = createEngine({ context: asAudioContext(ctx) });
  engine.start();
  engine.stop();
  return { engine, ctx };
}

/** One blow, and every node it built — nothing the engine had before it. */
function blow(strength?: number): {
  engine: Engine;
  ctx: FakeAudioContext;
  played: boolean;
  built: FakeAudioNode[];
} {
  const { engine, ctx } = startEngine();
  const before = ctx.created.length;
  const played = strength === undefined ? engine.blow() : engine.blow(strength);
  return { engine, ctx, played, built: ctx.created.slice(before) };
}

const oscillators = (built: FakeAudioNode[]): FakeOscillatorNode[] =>
  built.filter((node): node is FakeOscillatorNode => node instanceof FakeOscillatorNode);

/** The pitch an oscillator was built at, before any ramp moved it. */
const pitch = (osc: FakeOscillatorNode): number => osc.frequency.value;

describe('the hammer’s own sound', () => {
  // None of the numbers below is pinned to the original design: it had no
  // hammer. They are this project's, and they have not been tuned by ear.

  it('is a thump, a ring of partials and a crack', () => {
    const { played, built } = blow();

    expect(played).toBe(true);
    expect(oscillators(built)).toHaveLength(1 + HAMMER.ring.partials.length);
    expect(built.filter((node) => node instanceof FakeBufferSourceNode)).toHaveLength(1);
    expect(built.filter((node) => node instanceof FakeBiquadNode)).toHaveLength(1);
  });

  it('lands a hair ahead of now, and every part of it lands together', () => {
    const { ctx, built } = blow();
    const at = ctx.currentTime + HAMMER.lead;

    for (const osc of oscillators(built)) {
      expect(osc.life.find((event) => event.call === 'start')?.at).toBeCloseTo(at, 10);
    }
    const noise = built.find((node) => node instanceof FakeBufferSourceNode) as FakeBufferSourceNode;
    expect(noise.life.find((event) => event.call === 'start')?.at).toBeCloseTo(at, 10);
  });

  it('drops the thump from over every root the board has to down among them', () => {
    const { ctx, built } = blow();
    const thump = oscillators(built).find((osc) => pitch(osc) === HAMMER.thump.from);
    const drop = automation(thump!.frequency).find((write) => write.call === 'exponential');

    expect(thump?.type).toBe('sine');
    expect(drop?.value).toBe(HAMMER.thump.to);
    expect(drop?.time).toBeCloseTo(ctx.currentTime + HAMMER.lead + HAMMER.thump.drop, 10);
    // Felt whatever TUNING is doing: it starts above every root the board can
    // be set to and lands in the middle of where they sit.
    expect(HAMMER.thump.from).toBeGreaterThan(2 * Math.max(...ROOTS));
    expect(HAMMER.thump.to).toBeLessThan(Math.max(...ROOTS));
    expect(HAMMER.thump.to).toBeGreaterThan(Math.min(...ROOTS));
  });

  it('rings at ratios no string has, which is what makes it metal', () => {
    const { partials, base } = HAMMER.ring;
    const { built } = blow();
    const ring = oscillators(built)
      .map(pitch)
      .filter((hz) => hz !== HAMMER.thump.from)
      .sort((a, b) => a - b);

    expect(ring).toEqual(partials.map((ratio) => base * ratio));
    // No partial is a whole multiple of another, or near one. A harmonic series
    // is a note; this must not be one.
    for (const [i, upper] of partials.entries()) {
      for (const lower of partials.slice(0, i)) {
        const ratio = upper / lower;
        expect(Math.abs(ratio - Math.round(ratio)), `${upper}/${lower}`).toBeGreaterThan(0.15);
      }
    }
  });

  it('lets the higher partials die first and quietest', () => {
    const { ctx, built } = blow();
    const at = ctx.currentTime + HAMMER.lead;
    const ring = oscillators(built)
      .filter((osc) => pitch(osc) !== HAMMER.thump.from)
      .sort((a, b) => pitch(a) - pitch(b));

    const envelopes = ring.map((osc) => automation((osc.nodes[0] as FakeGainNode).gain));
    const peaks = envelopes.map((writes) => writes.find((write) => write.call === 'linear')?.value ?? NaN);
    const ends = envelopes.map(
      (writes) => (writes.find((write) => write.call === 'exponential')?.time ?? NaN) - at,
    );

    for (let i = 1; i < ring.length; i += 1) {
      expect(peaks[i], `peak ${i}`).toBeLessThan(peaks[i - 1] ?? -Infinity);
      expect(ends[i], `life ${i}`).toBeLessThan(ends[i - 1] ?? -Infinity);
    }
    expect(ends[0]).toBeCloseTo(HAMMER.ring.decay, 10);
    // And each oscillator is stopped after its envelope has reached silence.
    for (const [i, osc] of ring.entries()) {
      const stop = (osc.life.find((event) => event.call === 'stop')?.at ?? NaN) - at;
      expect(stop, `stop ${i}`).toBeGreaterThan(ends[i] ?? Infinity);
    }
  });

  it('is over inside a second, so two blows are two blows', () => {
    const { ctx, built } = blow();
    const at = ctx.currentTime + HAMMER.lead;
    const stops = [
      ...oscillators(built),
      ...(built.filter((node) => node instanceof FakeBufferSourceNode) as FakeBufferSourceNode[]),
    ].map((node) => (node.life.find((event) => event.call === 'stop')?.at ?? Infinity) - at);

    expect(Math.max(...stops)).toBeLessThan(1);
    expect(Math.min(...stops)).toBeGreaterThan(0);
  });
});

describe('where a blow goes', () => {
  it('goes into the master through one gain, ahead of the shaper and the compressor', () => {
    const { engine, built } = blow();
    const masterIn = asFake(engine.masterIn);
    const out = built.find(
      (node): node is FakeGainNode => node instanceof FakeGainNode && node.nodes.includes(masterIn),
    );

    expect(out?.gain.value).toBe(HAMMER.level);
    // Every part of the blow reaches the master, and only through that gain.
    for (const source of [
      ...oscillators(built),
      ...built.filter((node) => node instanceof FakeBufferSourceNode),
    ]) {
      const downstream = reachable(source);
      expect(downstream.has(out as FakeGainNode)).toBe(true);
      expect(downstream.has(masterIn)).toBe(true);
    }
    expect(built.filter((node) => node.nodes.includes(masterIn))).toEqual([out]);
  });

  it('never goes through a source, a box or the patch', () => {
    // A whole board this time: every module and every box, patched together.
    const { engine, ctx } = startEngine();
    buildModifiers(engine);
    buildSources(engine);
    engine.setWires([
      { from: 'guitar', to: 'grit' },
      { from: 'grit', to: 'cavern' },
      { from: 'slowhit', to: 'cavern' },
    ]);
    const before = ctx.created.length;
    expect(engine.blow()).toBe(true);
    const built = ctx.created.slice(before);

    const patch = new Set<FakeAudioNode>();
    for (const source of Object.values(engine.sources)) {
      patch.add(asFake(source.loud));
      patch.add(asFake(source.pow));
    }
    for (const modifier of Object.values(engine.modifiers)) {
      patch.add(asFake(modifier.in));
      patch.add(asFake(modifier.out));
    }
    expect(patch.size).toBeGreaterThan(0);

    for (const node of built) {
      for (const downstream of reachable(node)) expect(patch.has(downstream)).toBe(false);
    }
  });

  it('is the same blow whatever the board is tuned to', () => {
    const pitches = (tuning: number): number[] => {
      const { engine, ctx } = startEngine();
      engine.setGlobal('tuning', tuning);
      const before = ctx.created.length;
      engine.blow();
      return oscillators(ctx.created.slice(before)).map(pitch);
    };

    expect(pitches(0)).toEqual(pitches(ROOTS.length - 1));
  });

  it('sits under a full SLOW HIT, because a drum may land on the same frame', () => {
    expect(HAMMER.level).toBeLessThan(SLOWHIT.maxGain);
    expect(HAMMER.level).toBeGreaterThan(0.3);
  });
});

describe('how hard, and when not at all', () => {
  it('scales the whole blow by how hard it was swung', () => {
    const level = (strength: number): number | undefined => {
      const { engine, built } = blow(strength);
      const masterIn = asFake(engine.masterIn);
      return built.find(
        (node): node is FakeGainNode => node instanceof FakeGainNode && node.nodes.includes(masterIn),
      )?.gain.value;
    };

    expect(level(1)).toBe(HAMMER.level);
    expect(level(0.5)).toBeCloseTo(HAMMER.level / 2, 10);
    // Past either end of the range is the end of the range.
    expect(level(7)).toBe(HAMMER.level);
  });

  it('plays nothing for a swing with nothing in it', () => {
    const { played, built } = blow(0);

    expect(played).toBe(false);
    expect(built).toEqual([]);
  });

  it('plays nothing before the engine has been started', () => {
    const ctx = new FakeAudioContext();
    const engine = createEngine({ context: asAudioContext(ctx) });

    expect(engine.blow()).toBe(false);
    expect(ctx.created).toEqual([]);
  });

  it('counts every voice it spends, and hands them all back', () => {
    const { engine, ctx } = blow();

    expect(HAMMER_VOICES).toBe(1 + HAMMER.ring.partials.length + 1);
    expect(engine.active).toBe(HAMMER_VOICES);
    retireVoices(ctx);
    expect(engine.active).toBe(0);
  });

  it('is not played at all when the whole of it will not fit under the cap', () => {
    // Half a clang is a different, worse sound than none.
    const { engine, ctx } = startEngine();
    engine.active = VOICE_CAP - HAMMER_VOICES + 1;
    const before = ctx.created.length;

    expect(engine.blow()).toBe(false);
    expect(ctx.created.length).toBe(before);
    expect(engine.active).toBe(VOICE_CAP - HAMMER_VOICES + 1);

    engine.active = VOICE_CAP - HAMMER_VOICES;
    expect(engine.blow()).toBe(true);
    expect(engine.active).toBe(VOICE_CAP);
  });

  it('draws no number: two blows are built identically', () => {
    const shape = (): string => {
      const { ctx, built } = blow();
      const at = ctx.currentTime + HAMMER.lead;
      return JSON.stringify(
        built.map((node) => [
          node.kind,
          node instanceof FakeOscillatorNode ? [pitch(node), node.life.map((event) => (event.at ?? 0) - at)] : null,
          node instanceof FakeGainNode ? [node.gain.value, automation(node.gain).map((w) => [w.call, w.value])] : null,
        ]),
      );
    };

    expect(shape()).toBe(shape());
  });

  it('can be played straight off the function, at a time of the caller’s choosing', () => {
    const { engine, ctx } = startEngine();
    const before = ctx.created.length;

    expect(hammerBlow(engine, 12.5)).toBe(true);
    const starts = oscillators(ctx.created.slice(before)).map(
      (osc) => osc.life.find((event) => event.call === 'start')?.at,
    );
    expect(new Set(starts)).toEqual(new Set([12.5]));
  });
});
