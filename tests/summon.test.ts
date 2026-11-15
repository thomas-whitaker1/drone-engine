// @vitest-environment happy-dom
//
// The only randomizer in the product, and so the only thing here that cannot be
// tested by asserting one answer. What is decidable about a random result is its
// *shape*, and this suite pins four kinds of it:
//
// - **The ranges**, swept over a seeded run rather than sampled once. A floor
//   that is off by a tenth would pass a single draw and fail here.
// - **The two boundaries**, from a random that always answers 0 and one that
//   always answers just under 1. Every floor and every ceiling in one case each.
// - **The draw order**, counted. Which decision consumes a draw is the part of a
//   generator that changes silently under a refactor and takes the whole
//   distribution with it.
// - **The one structural promise**: no patch SUMMON can produce contains a
//   cycle, a duplicate or a self-connection — asserted by walking each patch
//   through `canConnect` wire by wire, which is the same question the drag
//   gesture asks. It is not that a loop is rejected; it is that none is offered.
//
// The happy-dom environment is here because ../src/summon reads its three step
// counts off the UI's word lists, which is deliberate: `char`, `often` and
// `tuning` are positions on a selector, and the selector's own words are what
// says how many positions there are.

import { describe, expect, it } from 'vitest';
import { summon, SUMMON } from '../src/summon';
import type { Summoned } from '../src/summon';
import { lcg } from '../src/engine/deterministic';
import { MODIFIER_IDS, SOURCE_IDS } from '../src/engine/constants';
import type { ModifierId, SourceId } from '../src/engine/constants';
import { canConnect, MODE_WORDS, OFTEN_WORDS, PACE_WORDS, TUNE_WORDS } from '../src/ui';

/**
 * The deterministic generator every buffer in the engine is filled from, mapped
 * off its −1…1 range onto the 0…1 one a decision is made against. Reused rather
 * than reinvented: the suite wants a repeatable sweep, and the product already
 * owns exactly one repeatable source of numbers.
 */
function seeded(seed: number): () => number {
  const next = lcg(seed);
  return () => (next() + 1) / 2;
}

/** Forty summons off forty seeds. Enough to walk every branch many times over. */
const sweep = (): Summoned[] =>
  Array.from({ length: 40 }, (_, i) => summon(seeded(1 + i * 7919)));

/** The largest number below 1. Every ceiling in the file, in one draw. */
const ALMOST_ONE = 1 - Number.EPSILON;

/** How many times a summon reaches for a number. */
function draws(answer: number): number {
  let count = 0;
  summon(() => {
    count += 1;
    return answer;
  });
  return count;
}

const isModifier = (id: string): id is ModifierId =>
  (MODIFIER_IDS as readonly string[]).includes(id);

describe('what SUMMON decides', () => {
  it('leaves the wall and the floor standing, whatever else it does', () => {
    const runs = sweep();

    for (const { state } of runs) {
      expect(state.m.guitar.on).toBe(true);
      expect(state.m.bass.on).toBe(true);
    }
    // …and is genuinely deciding the other seven rather than favouring one
    // answer: both faces of the coin have to turn up across the sweep.
    for (const id of SOURCE_IDS.filter((source) => !SUMMON.alwaysOn.includes(source))) {
      const on = runs.filter((run) => run.state.m[id].on).length;
      expect(on, id).toBeGreaterThan(0);
      expect(on, id).toBeLessThan(runs.length);
    }
  });

  it('keeps every source inside its range', () => {
    for (const { state } of sweep()) {
      for (const id of SOURCE_IDS) {
        const source = state.m[id];
        expect(source.loud, id).toBeGreaterThanOrEqual(SUMMON.loudFloor);
        expect(source.loud, id).toBeLessThanOrEqual(SUMMON.loudFloor + SUMMON.loudSpan);
        expect(Number.isInteger(source.often), id).toBe(true);
        expect(source.often, id).toBeGreaterThanOrEqual(0);
        expect(source.often, id).toBeLessThan(OFTEN_WORDS.length);
      }
      // THE VOICE snaps to one of four modes; every other character is a sweep.
      expect(Number.isInteger(state.m.voice.char)).toBe(true);
      expect(state.m.voice.char).toBeLessThan(MODE_WORDS.length);
      for (const id of SOURCE_IDS.filter((source) => source !== 'voice')) {
        expect(state.m[id].char, id).toBeGreaterThanOrEqual(0);
        expect(state.m[id].char, id).toBeLessThanOrEqual(1);
      }
    }
  });

  it('never lets the room collapse, and never fully commits the rest', () => {
    for (const { state } of sweep()) {
      // CAVERN alone is floored. The other three are the full range, and the
      // sweep is wide enough that each of them actually visits most of it.
      expect(state.mods.cavern.amount).toBeGreaterThanOrEqual(SUMMON.amounts.cavern.floor);
      expect(state.mods.cavern.amount).toBeLessThanOrEqual(
        SUMMON.amounts.cavern.floor + SUMMON.amounts.cavern.span,
      );
      for (const id of MODIFIER_IDS.filter((box) => box !== 'cavern')) {
        expect(state.mods[id].amount, id).toBeGreaterThanOrEqual(0);
        expect(state.mods[id].amount, id).toBeLessThanOrEqual(1);
      }
    }
  });

  it('keeps all three globals inside theirs', () => {
    for (const { state } of sweep()) {
      expect(state.g.seriousness).toBeGreaterThanOrEqual(SUMMON.seriousFloor);
      expect(state.g.seriousness).toBeLessThanOrEqual(
        SUMMON.seriousFloor + SUMMON.seriousSpan,
      );
      expect(Number.isInteger(state.g.tuning)).toBe(true);
      expect(state.g.tuning).toBeGreaterThanOrEqual(0);
      expect(state.g.tuning).toBeLessThan(TUNE_WORDS.length);
      expect(Number.isInteger(state.g.pace)).toBe(true);
      expect(state.g.pace).toBeGreaterThanOrEqual(SUMMON.paceFloor);
      expect(state.g.pace).toBeLessThan(PACE_WORDS.length);
    }
  });

  it('never summons the slowest pace, and does summon every other one', () => {
    // The floor is the whole of gt#45's guard on this control, so it is checked as
    // a fact about the sweep rather than as a bound on one draw: forty boards and
    // not one of them opens on a pulse that reads as a stalled board. The second
    // half matters as much — a floor that had quietly become a constant would
    // pass the first assertion and fail this one.
    const landed = new Set(sweep().map((run) => run.state.g.pace));

    expect(landed.has(0)).toBe(false);
    for (let step = SUMMON.paceFloor; step < PACE_WORDS.length; step += 1) {
      expect(landed.has(step), PACE_WORDS[step]).toBe(true);
    }
  });

  it('hands back every box unfed, and lets the caller light them', () => {
    // `fed` is derived from the wire list by whoever applies the result. A
    // summoned state that decided it for itself is a lamp that can go stale.
    for (const { state } of sweep()) {
      for (const id of MODIFIER_IDS) expect(state.mods[id].fed, id).toBe(false);
    }
  });
});

describe('the patch SUMMON lays', () => {
  it('runs every wire into a box, and never more than one out of a thing', () => {
    for (const { wires } of sweep()) {
      const sources = new Set<string>();
      for (const wire of wires) {
        expect(isModifier(wire.to), wire.to).toBe(true);
        expect(sources.has(wire.from), wire.from).toBe(false);
        sources.add(wire.from);
      }
    }
  });

  it('chains boxes forward only', () => {
    const order = (id: string): number => (MODIFIER_IDS as readonly string[]).indexOf(id);
    let chained = 0;

    for (const { wires } of sweep()) {
      for (const wire of wires.filter((cable) => isModifier(cable.from))) {
        expect(order(wire.to), `${wire.from}→${wire.to}`).toBeGreaterThan(order(wire.from));
        chained += 1;
      }
    }

    // The rule above is vacuous if no summon ever chained anything.
    expect(chained).toBeGreaterThan(0);
  });

  it('cannot offer a cycle, a duplicate or a self-connection', () => {
    // The same question the drag gesture asks, asked of every wire in turn as
    // the patch is built up. Forward-only chaining is what makes the answer
    // structural rather than lucky: there is no loop for this to refuse.
    for (const { wires } of sweep()) {
      const built: { from: string; to: string }[] = [];
      for (const wire of wires) {
        expect(canConnect(built, wire.from, wire.to), `${wire.from}→${wire.to}`).toBe(true);
        built.push(wire);
      }
    }
  });
});

describe('the two ends of every range', () => {
  it('lands on every floor when nothing is drawn', () => {
    const { state, wires } = summon(() => 0);

    for (const id of SOURCE_IDS) {
      // Zero is below the power threshold's *value*, not its test: `0 < .55`.
      expect(state.m[id].on, id).toBe(true);
      expect(state.m[id].loud, id).toBe(SUMMON.loudFloor);
      expect(state.m[id].char, id).toBe(0);
      expect(state.m[id].often, id).toBe(0);
    }
    // PACE floors at its second rung rather than its first (gt#45): the slowest
    // setting is somewhere to be turned to and not somewhere to be dropped.
    expect(state.g).toEqual({
      seriousness: SUMMON.seriousFloor,
      tuning: 0,
      pace: SUMMON.paceFloor,
    });
    expect(state.mods.grit.amount).toBe(0);
    expect(state.mods.cavern.amount).toBe(SUMMON.amounts.cavern.floor);

    // Every source into the first box, and the chain hooked up end to end —
    // derived from MODIFIER_IDS rather than spelled out, so a box added to the
    // rack extends the expected patch instead of failing this (gt#41 added three).
    expect(wires).toEqual([
      ...SOURCE_IDS.map((id: SourceId) => ({ from: id, to: 'grit' })),
      ...MODIFIER_IDS.slice(0, -1).map((id, i) => ({ from: id, to: MODIFIER_IDS[i + 1] })),
    ]);
  });

  it('lands on every ceiling when everything is', () => {
    const { state, wires } = summon(() => ALMOST_ONE);

    for (const id of SOURCE_IDS) {
      expect(state.m[id].on, id).toBe(SUMMON.alwaysOn.includes(id));
      expect(state.m[id].loud, id).toBeCloseTo(SUMMON.loudFloor + SUMMON.loudSpan, 12);
      expect(state.m[id].often, id).toBe(OFTEN_WORDS.length - 1);
    }
    expect(state.m.voice.char).toBe(MODE_WORDS.length - 1);
    expect(state.g.seriousness).toBeCloseTo(SUMMON.seriousFloor + SUMMON.seriousSpan, 12);
    expect(state.g.tuning).toBe(TUNE_WORDS.length - 1);
    // And the top of PACE is reachable, which is the other half of the floor
    // being the only guard on it: a summon may hand you the fastest board.
    expect(state.g.pace).toBe(PACE_WORDS.length - 1);
    expect(state.mods.cavern.amount).toBeCloseTo(SUMMON.amounts.cavern.floor + SUMMON.amounts.cavern.span, 12);

    // Nothing is patched at all, which is a legal board: an unwired source goes
    // straight to the speakers, and the footnote on THE CHAIN says so.
    expect(wires).toEqual([]);
  });
});

describe('how SUMMON spends its randomness', () => {
  it('draws once per decision, and not at all for the two that are never off', () => {
    // Three per source that is always on, four for the other seven; three
    // globals, one box each; then one per source and per chainable box to ask
    // whether, and one more each to ask where.
    //
    // PACE is one draw and not two (gt#45). Its floor is spent by narrowing the
    // range drawn from rather than by drawing again and rejecting — a rejection
    // loop would make the cost of a summon depend on what it rolled, which is the
    // one thing a count like this cannot state.
    const perSource = SUMMON.alwaysOn.length * 3 + (SOURCE_IDS.length - SUMMON.alwaysOn.length) * 4;
    const chainable = MODIFIER_IDS.length - 1;
    const decided = perSource + 3 + MODIFIER_IDS.length;

    // Nothing drawn: every coin comes up patched, so every "whether" is followed
    // by a "where".
    expect(draws(0)).toBe(decided + (SOURCE_IDS.length + chainable) * 2);
    // Everything drawn: no coin comes up patched, so none of them is.
    expect(draws(ALMOST_ONE)).toBe(decided + SOURCE_IDS.length + chainable);
  });

  it('gives a different board every time, from a real source of numbers', () => {
    const boards = new Set(sweep().map((run) => JSON.stringify(run)));

    expect(boards.size).toBe(40);
  });
});
