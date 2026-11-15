// The heartbeat. Everything here is decidable — which beat a strike lands on is
// arithmetic, not taste — so it is pinned down rather than left to the ear.
//
// The suites drive `tick()` by hand against a fake clock. The timer that calls
// it in the product is exercised once, at the bottom; everywhere else winding
// the audio clock forward is the whole of what a wake-up means.

import { describe, expect, it, vi } from 'vitest';
import {
  COW,
  CYMBAL,
  DEFAULT_BPM,
  HEARTBEAT,
  MARACAS,
  RATE_DIV,
  SLOWHIT,
  STRIKE_IDS,
  SWING,
  TEMPOS,
  VOICE,
  VOICE_CAP,
  type StrikeId,
} from '../src/engine/constants';
import { bpmFor, createEngine } from '../src/engine';
import type { Engine, EngineOptions } from '../src/engine';
import { HAMMER_VOICES } from '../src/engine/hammer';
import { heardAt } from '../src/engine/scheduler';
import { asAudioContext, FakeAudioContext } from './support/fake-audio-context';
import { fullBoard } from './support/board';
import { transcribed } from './support/original-design';

/** One booked strike: which module, and the audio time it was booked for. */
interface Hit {
  id: string;
  at: number;
}

/**
 * A started engine whose pulse is driven by hand, carrying five stand-in strike
 * modules that record rather than synthesise. Every one of them is on and set to
 * *constantly*, so a test only has to say how it differs.
 */
function pulse(opts: EngineOptions = {}): {
  engine: Engine;
  ctx: FakeAudioContext;
  hits: Hit[];
} {
  const ctx = new FakeAudioContext();
  ctx.currentTime = 5;
  const engine = createEngine({ ...opts, context: asAudioContext(ctx) });
  engine.start();
  engine.stop();

  const hits: Hit[] = [];
  for (const id of STRIKE_IDS) {
    const outlet = engine.makeOutlet(id, 0.5);
    outlet.trigger = (time) => hits.push({ id, at: time });
    // Set directly: setPower would poke, and a poke is not a beat.
    outlet.on = true;
    outlet.often = 0;
  }
  return { engine, ctx, hits };
}

/**
 * Wind the clock one beat at a time, waking the scheduler at each step. Prime it
 * with a tick first and every step after that books exactly one more beat.
 */
function play(engine: Engine, ctx: FakeAudioContext, beats: number): void {
  for (let i = 0; i < beats; i++) {
    ctx.currentTime += 60 / engine.bpm;
    engine.heartbeat.tick();
  }
}

/**
 * Where a hit sits on the grid, given when it was heard (gt#60): an odd beat is
 * heard late, so its lateness is taken back off. `beat` is the beat length at
 * the moment it was booked.
 */
function gridOf(at: number, count: number, beat: number): number {
  return at - heardAt(0, count, beat);
}

/** Which beats `id` was booked on, given the first beat is count 0. */
function counts(hits: Hit[], id: string, first: number, step: number): number[] {
  return hits.filter((hit) => hit.id === id).map((hit) => Math.round((hit.at - first) / step));
}

describe('the pulse', () => {
  it('books the first beat a lookahead ahead and steps by the tempo', () => {
    const { engine, ctx, hits } = pulse();
    expect(engine.heartbeat.next).toBeCloseTo(ctx.currentTime + HEARTBEAT.lead);

    engine.heartbeat.tick();
    play(engine, ctx, 2);

    const slowhit = hits.filter((hit) => hit.id === 'slowhit').map((hit) => hit.at);
    expect(slowhit).toHaveLength(3);
    expect(slowhit[0]).toBeCloseTo(5 + HEARTBEAT.lead);
    // The grid steps by the tempo; the second beat is an off-beat, and is heard
    // a fixed share of a beat behind where it sits (gt#60).
    const beat = 60 / DEFAULT_BPM;
    expect(slowhit[1] as number).toBeCloseTo((slowhit[0] as number) + beat + SWING.late * beat);
    expect(slowhit[2] as number).toBeCloseTo((slowhit[0] as number) + 2 * beat);
  });

  it('fills the horizon and no further', () => {
    const { engine, ctx, hits } = pulse();

    engine.heartbeat.tick();

    // One beat is inside the third of a second ahead; the next one is not.
    expect(hits).toHaveLength(STRIKE_IDS.length);
    expect(engine.heartbeat.next).toBeGreaterThanOrEqual(ctx.currentTime + HEARTBEAT.horizon);
  });

  it('catches up in one wake-up when the clock has run away', () => {
    const { engine, ctx, hits } = pulse();
    const beat = 60 / DEFAULT_BPM;

    ctx.currentTime += 10;
    engine.heartbeat.tick();

    // Every beat from the first up to the edge of the horizon, booked at once.
    const booked = counts(hits, 'cow', 5 + HEARTBEAT.lead, beat);
    expect(booked).toEqual(Array.from({ length: booked.length }, (_, i) => i));
    expect(engine.heartbeat.next).toBeGreaterThanOrEqual(ctx.currentTime + HEARTBEAT.horizon);
    expect(engine.heartbeat.next - beat).toBeLessThan(ctx.currentTime + HEARTBEAT.horizon);
  });

  it('runs on its own once started, and stops when told', () => {
    vi.useFakeTimers();
    try {
      const ctx = new FakeAudioContext();
      ctx.currentTime = 5;
      const engine = createEngine({ context: asAudioContext(ctx) });
      engine.start();
      const hits: Hit[] = [];
      const outlet = engine.makeOutlet('slowhit', SLOWHIT.maxGain);
      outlet.trigger = (time) => hits.push({ id: 'slowhit', at: time });
      outlet.on = true;

      expect(engine.heartbeat.running).toBe(true);
      vi.advanceTimersByTime(HEARTBEAT.intervalMs);
      expect(hits).toHaveLength(1);

      engine.stop();
      ctx.currentTime += 10;
      vi.advanceTimersByTime(HEARTBEAT.intervalMs * 4);

      expect(engine.heartbeat.running).toBe(false);
      expect(hits).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('how often', () => {
  it('fires each of the five words on its own multiple of the beat', () => {
    for (let often = 0; often < RATE_DIV.length; often++) {
      const { engine, ctx, hits } = pulse();
      for (const id of STRIKE_IDS) {
        const outlet = engine.sources[id];
        if (outlet) outlet.often = often;
      }

      engine.heartbeat.tick();
      play(engine, ctx, 15);

      const divisor = RATE_DIV[often] as number;
      const booked = counts(hits, 'slowhit', 5 + HEARTBEAT.lead, 60 / DEFAULT_BPM);
      expect(booked).toEqual(Array.from({ length: 16 / divisor }, (_, i) => i * divisor));
    }
  });

  it('reads a HOW OFTEN step from outside the five words as the nearest one', () => {
    const { engine, ctx, hits } = pulse();
    const outlet = engine.sources['slowhit'];
    if (outlet) outlet.often = RATE_DIV.length + 3;

    engine.heartbeat.tick();
    play(engine, ctx, 15);

    // Pinned to *almost never* rather than falling through and never firing.
    expect(counts(hits, 'slowhit', 5 + HEARTBEAT.lead, 60 / DEFAULT_BPM)).toEqual([0]);
  });

  it('keeps the strikes off one another with the phases the modules carry', () => {
    const { engine, ctx } = fullBoard();
    engine.stop();
    const hits: Hit[] = [];
    for (const id of STRIKE_IDS) {
      const outlet = engine.sources[id];
      if (!outlet) continue;
      outlet.trigger = (time) => hits.push({ id, at: time });
      outlet.on = true;
      outlet.often = 2; // now and then — one beat in four
    }

    engine.heartbeat.tick();
    play(engine, ctx, 3);

    const first = ctx.currentTime + HEARTBEAT.lead - 3 * (60 / DEFAULT_BPM);
    const on = (id: StrikeId) => counts(hits, id, first, 60 / DEFAULT_BPM);
    expect(on('slowhit')).toEqual([0]);
    expect(on('cow')).toEqual([1]);
    expect(on('cymbal')).toEqual([2]);
    expect(on('voice')).toEqual([3]);
    // MARACAS shares SLOW HIT's phase by design — a rattle over the hit, not beside it.
    expect(on('maracas')).toEqual([0]);
    expect([SLOWHIT.phase, COW.phase, CYMBAL.phase, VOICE.phase, MARACAS.phase]).toEqual([0, 3, 2, 1, 0]);
  });
});

describe('what the pulse refuses', () => {
  it('skips a trigger rather than exceed the voice cap', () => {
    const { engine, ctx, hits } = pulse();
    engine.active = VOICE_CAP;

    engine.heartbeat.tick();
    expect(hits).toEqual([]);

    // The beat is dropped, not owed: the board comes back on the next one.
    engine.active = VOICE_CAP - 1;
    play(engine, ctx, 1);
    const beat = 60 / DEFAULT_BPM;
    expect(hits.map((hit) => hit.at)).toEqual(
      Array.from({ length: STRIKE_IDS.length }, () => heardAt(5 + HEARTBEAT.lead + beat, 1, beat)),
    );
  });

  it('leaves a module that is off, or has nothing to fire, alone', () => {
    const { engine, hits } = pulse();
    for (const id of STRIKE_IDS) {
      const outlet = engine.sources[id];
      if (outlet) outlet.on = false;
    }
    const cow = engine.sources['cow'];
    if (cow) {
      cow.on = true;
      delete cow.trigger;
    }

    expect(() => engine.heartbeat.tick()).not.toThrow();
    expect(hits).toEqual([]);
  });

  it('remembers when each module was last heard, so a poke knows to stay quiet', () => {
    const { engine } = pulse();
    engine.heartbeat.tick();

    const outlet = engine.sources['slowhit'];
    expect(outlet?.lastHit).toBeCloseTo(5 + HEARTBEAT.lead);
  });
});

describe('the world outside', () => {
  it('announces each strike for the moment it is heard, not the moment it is booked', () => {
    vi.useFakeTimers();
    try {
      const struck: string[] = [];
      const { engine } = pulse({ onStrike: (id) => struck.push(id) });

      engine.heartbeat.tick();
      vi.advanceTimersByTime(HEARTBEAT.lead * 1000 - 1);
      expect(struck).toEqual([]);

      vi.advanceTimersByTime(1);
      expect(struck).toEqual([...STRIKE_IDS]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('says every beat for the moment it falls, struck or not (gt#83)', () => {
    // The pulse is not a strike. It is announced on every beat — including the
    // ones nothing lands on — and, like a strike, for when it is heard rather
    // than when it is booked.
    vi.useFakeTimers();
    try {
      const beats: number[] = [];
      const { engine, ctx } = pulse({ onBeat: (count) => beats.push(count) });

      engine.heartbeat.tick();
      vi.advanceTimersByTime(HEARTBEAT.lead * 1000 - 1);
      expect(beats).toEqual([]);

      vi.advanceTimersByTime(1);
      expect(beats).toEqual([0]);

      // The clock moves on a beat, the scheduler looks again, and the next one
      // is said when it falls — a lookahead after it was booked, as before.
      ctx.currentTime += 60 / engine.bpm;
      engine.heartbeat.tick();
      expect(beats).toEqual([0]);
      // An off-beat: it is said when it is heard, which is late (gt#60), so the
      // lamp stays on the sound rather than on the grid.
      const late = SWING.late * (60 / engine.bpm) * 1000;
      vi.advanceTimersByTime(HEARTBEAT.lead * 1000 + late - 1);
      expect(beats).toEqual([0]);
      vi.advanceTimersByTime(1);
      expect(beats).toEqual([0, 1]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the pulse going on a board with nothing switched on', () => {
    vi.useFakeTimers();
    try {
      const beats: number[] = [];
      const { engine, ctx, hits } = pulse({ onBeat: (count) => beats.push(count) });
      for (const id of STRIKE_IDS) engine.sources[id]!.on = false;

      // Four beats' worth of clock, ticked through.
      for (let i = 0; i < 4; i += 1) {
        engine.heartbeat.tick();
        ctx.currentTime += 60 / engine.bpm;
        vi.advanceTimersByTime((60 / engine.bpm) * 1000);
      }

      expect(hits).toEqual([]);
      expect(beats.length).toBeGreaterThanOrEqual(4);
      expect(beats).toEqual(beats.map((_, index) => index));
    } finally {
      vi.useRealTimers();
    }
  });

  it('counts the beats at the tempo PACE set, and no faster than a flashing thing may', () => {
    // The lamp this drives is a light on a clock. The fastest the board can
    // pulse is its top tempo, and that is held under 3Hz with room to spare.
    const fastest = Math.max(...TEMPOS) / 60;
    expect(fastest).toBeLessThan(3);
    expect(fastest).toBeLessThanOrEqual(1.5);
  });

  it('wakes a context the browser suspended', () => {
    const { engine, ctx, hits } = pulse();
    ctx.state = 'suspended';

    engine.heartbeat.tick();

    expect(ctx.resumed).toBe(1);
    expect(ctx.state).toBe('running');
    expect(hits).toHaveLength(STRIKE_IDS.length);
  });

  it('shrugs off a refused resume and tries again on the next tick', () => {
    const { engine, ctx } = pulse();
    ctx.state = 'suspended';
    ctx.resume = () => Promise.reject(new Error('The tab is in the background.'));

    expect(() => engine.heartbeat.tick()).not.toThrow();
    expect(ctx.state).toBe('suspended');
  });
});

describe('tempo', () => {
  it('holds the pulse inside the range the board offers', () => {
    const { engine } = pulse();

    engine.setBpm(HEARTBEAT.maxBpm + 200);
    expect(engine.bpm).toBe(HEARTBEAT.maxBpm);

    engine.setBpm(0);
    expect(engine.bpm).toBe(HEARTBEAT.minBpm);

    expect(createEngine({ bpm: 1000 }).bpm).toBe(HEARTBEAT.maxBpm);
    expect(createEngine({ bpm: 60 }).bpm).toBe(60);
  });

  it('shortens the beat when the tempo climbs', () => {
    const { engine, ctx, hits } = pulse();
    engine.setBpm(HEARTBEAT.maxBpm);

    engine.heartbeat.tick();
    play(engine, ctx, 1);

    const slowhit = hits.filter((hit) => hit.id === 'slowhit').map((hit) => hit.at);
    const beat = 60 / HEARTBEAT.maxBpm;
    expect(gridOf(slowhit[1] as number, 1, beat) - (slowhit[0] as number)).toBeCloseTo(beat);
  });

  it('takes effect at the next beat, and leaves what is already booked alone', () => {
    // The constraint the whole of gt#45 hangs on. The scheduler is a lookahead —
    // at any instant there are strikes already placed against the audio clock a
    // third of a second out — so a tempo that changed *now* would have to either
    // move hits that are already booked or book fresh ones on top of them. It
    // does neither: the beat already in flight lands exactly where the old tempo
    // put it, and the new spacing starts from the one after.
    const { engine, ctx, hits } = pulse();
    const slow = 60 / DEFAULT_BPM;
    const fast = 60 / HEARTBEAT.maxBpm;

    engine.heartbeat.tick();
    const booked = [...hits];
    const pending = engine.heartbeat.next;

    // Mid-flight: the horizon is full and nothing has been heard yet.
    engine.setBpm(HEARTBEAT.maxBpm);
    engine.heartbeat.tick();

    // Nothing already placed moved, and nothing was placed a second time — the
    // two failures a tempo applied instantly would produce.
    expect(hits).toEqual(booked);
    expect(engine.heartbeat.next).toBe(pending);

    // The beat in flight keeps the old spacing…
    ctx.currentTime += slow;
    engine.heartbeat.tick();
    // Read on the grid: every beat here is booked after the change, so an
    // off-beat's lateness is a share of the new beat (gt#60).
    const slowhit = hits
      .filter((hit) => hit.id === 'slowhit')
      .map((hit, count) => gridOf(hit.at, count, fast));
    expect((slowhit[1] as number) - (slowhit[0] as number)).toBeCloseTo(slow);

    // …and every beat after it takes the new one.
    ctx.currentTime += fast;
    engine.heartbeat.tick();
    ctx.currentTime += fast;
    engine.heartbeat.tick();
    const heard = hits.filter((hit) => hit.id === 'slowhit').map((hit) => hit.at);
    const after = heard.map((at, count) => gridOf(at, count, fast));
    expect((after[2] as number) - (after[1] as number)).toBeCloseTo(fast);
    expect((after[3] as number) - (after[2] as number)).toBeCloseTo(fast);

    // And the count never skipped: four beats booked, four heard, in order.
    expect(heard).toHaveLength(4);
    expect([...heard].sort((a, b) => a - b)).toEqual(heard);
  });

  it('slows down the same way it speeds up, with nothing bunched at the seam', () => {
    // The other direction, because it is the one that can go wrong differently:
    // a longer beat means the horizon is already filled past where the next one
    // now belongs, and a scheduler that recomputed `next` from the clock rather
    // than from the last beat would fire one early to catch up.
    const { engine, ctx, hits } = pulse();

    engine.heartbeat.tick();
    engine.setBpm(HEARTBEAT.minBpm);

    for (let i = 0; i < 3; i += 1) {
      ctx.currentTime += 60 / HEARTBEAT.minBpm;
      engine.heartbeat.tick();
    }

    // Read on the grid, as above: everything after the first beat was booked at
    // the new tempo, so that is the beat an off-beat's lateness is a share of.
    const slowhit = hits
      .filter((hit) => hit.id === 'slowhit')
      .map((hit, count) => gridOf(hit.at, count, 60 / HEARTBEAT.minBpm));
    // The first gap is still the old tempo's; every gap after it is the new one,
    // and not one of them is shorter than either.
    expect((slowhit[1] as number) - (slowhit[0] as number)).toBeCloseTo(60 / DEFAULT_BPM);
    for (let i = 2; i < slowhit.length; i += 1) {
      expect((slowhit[i] as number) - (slowhit[i - 1] as number)).toBeCloseTo(
        60 / HEARTBEAT.minBpm,
      );
    }
  });
});

// Swing (gt#60). The reference plays dead on the grid; this board drags every
// second beat. Everything about it is arithmetic, so it is pinned: which beats,
// how far, that the picture follows the sound, and — the constraint the issue
// names as the one that matters — that a late beat can never reach the next
// one, at any tempo or across a change of tempo.
describe('swing', () => {
  it('leaves the beats on the grid where they sit and drags the ones between', () => {
    const beat = 60 / DEFAULT_BPM;
    expect(heardAt(10, 0, beat)).toBe(10);
    expect(heardAt(10, 2, beat)).toBe(10);
    expect(heardAt(10, 1, beat)).toBeCloseTo(10 + SWING.late * beat, 10);
    expect(heardAt(10, 7, beat)).toBeCloseTo(10 + SWING.late * beat, 10);
  });

  it('is late, never early, and by less than a beat', () => {
    expect(SWING.late).toBeGreaterThan(0);
    expect(SWING.late).toBeLessThan(1);
    // A drag rather than a shuffle: well short of triplet swing, which is a
    // third, and long enough at the fastest tempo to be more than a flam.
    expect(SWING.late).toBeLessThan(1 / 3);
    expect(SWING.late * (60 / HEARTBEAT.maxBpm)).toBeGreaterThan(0.03);
  });

  it('runs long, short, long, short on a module set to constantly', () => {
    const { engine, ctx, hits } = pulse();
    const beat = 60 / DEFAULT_BPM;

    engine.heartbeat.tick();
    play(engine, ctx, 6);

    const at = hits.filter((hit) => hit.id === 'slowhit').map((hit) => hit.at);
    const gaps = at.slice(1).map((time, index) => time - (at[index] as number));
    gaps.forEach((gap, index) => {
      const expected = index % 2 === 0 ? beat * (1 + SWING.late) : beat * (1 - SWING.late);
      expect(gap, `gap ${index}`).toBeCloseTo(expected, 10);
    });
    // And six beats are still six beats: the drag moves nothing downstream.
    expect((at[6] as number) - (at[0] as number)).toBeCloseTo(6 * beat, 10);
  });

  it('puts every strike on one beat at the same moment, late or not', () => {
    const { engine, ctx, hits } = pulse();

    engine.heartbeat.tick();
    play(engine, ctx, 3);

    for (let count = 0; count < 4; count++) {
      const on = hits.slice(count * STRIKE_IDS.length, (count + 1) * STRIKE_IDS.length);
      expect(on.map((hit) => hit.id)).toEqual([...STRIKE_IDS]);
      expect(new Set(on.map((hit) => hit.at)).size, `beat ${count}`).toBe(1);
    }
  });

  it('keeps the modules with an odd phase behind the beat and the rest on it', () => {
    // On every HOW OFTEN word but *constantly* a module only lands on beats of
    // one parity, the parity of its phase. So which modules drag is not chosen
    // per hit: it is a standing fact about the board.
    const { engine, ctx } = fullBoard();
    engine.stop();
    const beat = 60 / DEFAULT_BPM;
    const first = ctx.currentTime + HEARTBEAT.lead;
    const hits: Hit[] = [];
    for (const id of STRIKE_IDS) {
      const outlet = engine.sources[id];
      if (!outlet) continue;
      outlet.trigger = (time) => hits.push({ id, at: time });
      outlet.on = true;
      outlet.often = 1; // every other beat
    }

    engine.heartbeat.tick();
    play(engine, ctx, 11);

    const lateness = (id: StrikeId): number[] =>
      hits
        .filter((hit) => hit.id === id)
        .map((hit) => {
          const sinceFirst = hit.at - first;
          return +(sinceFirst - Math.floor(sinceFirst / beat + 1e-9) * beat).toFixed(6);
        });
    for (const id of STRIKE_IDS) {
      const phase = engine.sources[id]?.phase ?? 0;
      const expected = phase % 2 === 1 ? +(SWING.late * beat).toFixed(6) : 0;
      expect(lateness(id).length, id).toBeGreaterThan(3);
      expect(new Set(lateness(id)), id).toEqual(new Set([expected]));
    }
    // Stated, so that a phase changed later is a drag changed on purpose.
    const dragging = STRIKE_IDS.filter((id) => (engine.sources[id]?.phase ?? 0) % 2 === 1);
    expect(dragging).toEqual(['voice', 'cow', 'laser']);
  });

  it('carries the lateness to lastHit and to the bloom, so the picture stays on the sound', () => {
    vi.useFakeTimers();
    try {
      const struck: string[] = [];
      const { engine, ctx } = pulse({ onStrike: (id) => struck.push(id) });
      const beat = 60 / DEFAULT_BPM;

      engine.heartbeat.tick();
      vi.advanceTimersByTime(HEARTBEAT.lead * 1000);
      struck.length = 0;

      // The second beat, an off-beat, booked a lookahead ahead of its grid time.
      ctx.currentTime += beat;
      engine.heartbeat.tick();
      const heard = heardAt(5 + HEARTBEAT.lead + beat, 1, beat);
      expect(engine.sources['slowhit']?.lastHit).toBeCloseTo(heard, 10);

      const wait = (heard - ctx.currentTime) * 1000;
      vi.advanceTimersByTime(wait - 1);
      expect(struck).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(struck).toEqual([...STRIKE_IDS]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('never lets a late beat reach the next one, at any tempo or across a change', () => {
    // "A swing that can push a hit past the next beat is a scheduler that can
    // drop or double a step." Walk every tempo, and every change from one
    // tempo to another made mid-run, and hold the hits to strict order with
    // exactly one per beat.
    for (const from of TEMPOS) {
      for (const to of TEMPOS) {
        const { engine, ctx, hits } = pulse();
        engine.setBpm(from);

        // The scheduler's own cadence rather than a beat at a time: a wake-up
        // every 90ms, with the tempo changed part-way through a beat.
        const wakeUps = (seconds: number): void => {
          for (let t = 0; t < seconds; t += HEARTBEAT.intervalMs / 1000) {
            engine.heartbeat.tick();
            ctx.currentTime += HEARTBEAT.intervalMs / 1000;
          }
        };
        wakeUps(7.3);
        engine.setBpm(to);
        wakeUps(9);

        const at = hits.filter((hit) => hit.id === 'slowhit').map((hit) => hit.at);
        expect(at.length, `${from} to ${to}`).toBeGreaterThanOrEqual(10);
        for (let i = 1; i < at.length; i++) {
          expect(at[i] as number, `${from} to ${to}, beat ${i}`).toBeGreaterThan(at[i - 1] as number);
        }
        // The grid itself is untouched: one hit per beat counted, none owed and
        // none doubled, and the next beat is ahead of everything heard so far.
        expect(engine.heartbeat.count).toBe(at.length);
        expect(engine.heartbeat.next).toBeGreaterThan(at.at(-1) as number);
      }
    }
  });
});

// The cap is a guard, not the resting state (gt#68). The reference's 24 was sized
// for five strikes; with six, a board with every strike on *constantly* filled
// it on every beat with the first four modules in the list, and COW and LASER
// CANNON were lit and silent. This recounts the most the real modules can ask
// for, the way the engine counts — a voice is held from the moment it is booked
// until it stops — and holds the cap above it.
describe('the voice cap', () => {
  /** The most voices held at once by a board in this state, over `seconds`. */
  function demand(bpm: number, seconds: number): number {
    const { engine, ctx } = fullBoard();
    engine.setBpm(bpm);
    // Each control where it asks for the most: the longest tails, the biggest
    // burst, the discharge, and the VOICE mode with the most behind it.
    const worst: Record<StrikeId, number> = { slowhit: 1, cymbal: 1, voice: 0, maracas: 1, cow: 1, laser: 1 };
    for (const id of STRIKE_IDS) {
      const outlet = engine.sources[id];
      if (!outlet) throw new Error(`No ${id} on this board.`);
      outlet.on = true;
      outlet.often = 0;
      engine.setChar(id, worst[id], false);
    }

    /** Every counted voice: when it was booked, and when it stops. */
    const voices: Array<{ made: number; stops: number }> = [];
    let seen = ctx.created.length;
    engine.heartbeat.start();
    engine.stop();
    for (let t = 0; t < seconds; t += HEARTBEAT.intervalMs / 1000) {
      // Nothing is refused here: the point is what would be asked for.
      engine.active = 0;
      engine.heartbeat.tick();
      for (const node of ctx.created.slice(seen)) {
        if (!node.onended) continue;
        const life = (node as unknown as { life: Array<{ call: string; at?: number }> }).life;
        const stops = life.filter((entry) => entry.call === 'stop').at(-1)?.at;
        if (stops === undefined) throw new Error('A counted voice with no end booked.');
        voices.push({ made: ctx.currentTime, stops });
      }
      seen = ctx.created.length;
      ctx.currentTime += HEARTBEAT.intervalMs / 1000;
    }

    // The count only ever rises at a booking, so those are the moments to look.
    let most = 0;
    for (const { made } of voices) {
      most = Math.max(most, voices.filter((voice) => voice.made <= made && voice.stops > made).length);
    }
    return most;
  }

  it('sits above the most a full board asks for at its fastest, with a hammer blow to spare', () => {
    const most = demand(HEARTBEAT.maxBpm, 30);

    // The same count a render through a real context gave: 47.
    expect(most).toBeGreaterThanOrEqual(44);
    expect(most + HAMMER_VOICES).toBeLessThanOrEqual(VOICE_CAP);
  });

  it('is not a number the reference could have kept', () => {
    // 24 is under what the board asks for even at the tempo it opens on, which
    // is what starved the last two strikes in the list.
    expect(demand(DEFAULT_BPM, 30)).toBeGreaterThan(24);
  });
});

describe('the tempo table', () => {
  it('spans the range evenly and opens on the tempo the handoff wrote', () => {
    // PACE paints words over these (gt#45), so the arithmetic behind the words is
    // held here rather than left to whoever counts the rungs next.
    expect(TEMPOS[0]).toBe(HEARTBEAT.minBpm);
    expect(TEMPOS[TEMPOS.length - 1]).toBe(HEARTBEAT.maxBpm);

    const gap = (HEARTBEAT.maxBpm - HEARTBEAT.minBpm) / (TEMPOS.length - 1);
    for (const [i, tempo] of TEMPOS.entries()) {
      expect(tempo, `rung ${i}`).toBe(HEARTBEAT.minBpm + i * gap);
    }

    // And the whole reason the table is four long: the board's own default lands
    // exactly on a rung rather than between two. Five would step by nine and put
    // the opening tempo somewhere the control could not be returned to.
    expect(TEMPOS).toContain(DEFAULT_BPM);
    expect(Number.isInteger(gap)).toBe(true);
  });

  it('reads a PACE step from outside the four as the nearest one', () => {
    // The same guard `due()` puts on a HOW OFTEN step, and here for the same
    // reason: a stored board from a version with a different number of rungs must
    // come back as a board rather than as a tempo of `undefined`.
    expect(bpmFor(0)).toBe(HEARTBEAT.minBpm);
    expect(bpmFor(TEMPOS.length - 1)).toBe(HEARTBEAT.maxBpm);
    expect(bpmFor(-4)).toBe(HEARTBEAT.minBpm);
    expect(bpmFor(TEMPOS.length + 9)).toBe(HEARTBEAT.maxBpm);
    // A fractional step is somebody's arithmetic going astray, not a tempo
    // between two rungs: it snaps rather than interpolating.
    expect(bpmFor(1.4)).toBe(TEMPOS[1]);
    // And a step that is not a number at all has no nearest rung to be pulled
    // to, so it opens on the board's own default rather than on either end. A
    // board that cannot say how fast it was is a board at 48, not a board
    // stalled at 36 — which is the one wrong answer that would read as broken.
    expect(bpmFor(Number.NaN)).toBe(DEFAULT_BPM);
  });
});

describe('constants', () => {
  it('holds the heartbeat to the original design', () => {
    const pins: Array<[string, unknown, unknown]> = [
      ['divisors', RATE_DIV, [1, 2, 4, 8, 16]],
      ['wake-up interval', HEARTBEAT.intervalMs, 90],
      ['scheduling horizon', HEARTBEAT.horizon, 0.3],
      ['first beat', HEARTBEAT.lead, 0.25],
      // The five it transcribes, in its order. LASER CANNON is gt#42's sixth and
      // is registered in POST_HANDOFF_SOURCES; quoting all six would find
      // nothing and pass by finding nothing.
      ['the strike list', transcribed(STRIKE_IDS), ['slowhit', 'cymbal', 'voice', 'maracas', 'cow']],
      ['default tempo', DEFAULT_BPM, 48],
      ['slowest tempo', HEARTBEAT.minBpm, 36],
      ['fastest tempo', HEARTBEAT.maxBpm, 72],
    ];

    for (const [name, actual, pinned] of pins) expect(actual, name).toEqual(pinned);
  });
});
