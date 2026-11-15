// MEGADRIFT's arithmetic (gt#43), checked without a clock, a context or a board.
//
// That it can be is the point of the split: ../src/drift is a pure function and a
// bare interval, so the whole of what drift *decides* is checkable here and only
// what it *means* to a board needs an app to prove. The suite is written against
// the two promises the feature makes, in the order they matter — that the same
// board drifts the same way every session, and that a value never wanders far
// enough from where it was put for the user to stop being the one who set it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDrift,
  DRIFT,
  DRIFT_KEYS,
  driftReach,
  driftState,
  driftValue,
  offsetAt,
  periodFor,
} from '../src/drift';
import { MODIFIER_IDS, SOURCE_IDS } from '../src/engine/constants';
import { OPENING_STATE, SOURCE_DEFS } from '../src/ui';
import type { BoardState } from '../src/ui';

/** Trial division. The numbers are tiny and a sieve would be the harder read. */
function isPrime(value: number): boolean {
  if (!Number.isInteger(value) || value < 2) return false;
  for (let factor = 2; factor * factor <= value; factor += 1) {
    if (value % factor === 0) return false;
  }
  return true;
}

/** Every index the board itself claims. */
const indices = Array.from({ length: DRIFT_KEYS.count }, (_, index) => index);

/** A board at a stated position, so a check can put a value exactly where it wants it. */
function boardAt(value: number): BoardState {
  return {
    ...OPENING_STATE,
    m: Object.fromEntries(
      SOURCE_IDS.map((id) => [id, { ...OPENING_STATE.m[id], loud: value, char: value }]),
    ) as BoardState['m'],
    mods: Object.fromEntries(
      MODIFIER_IDS.map((id) => [id, { ...OPENING_STATE.mods[id], amount: value }]),
    ) as BoardState['mods'],
  };
}

describe('the period table', () => {
  it('holds one prime per drifting value, and no value shares one', () => {
    // Primes are how "mutually incommensurate" is guaranteed rather than hoped
    // for: any two of them have no common factor, so no pair of controls can lock
    // into moving together however long the page is left open.
    expect(DRIFT.periods).toHaveLength(DRIFT_KEYS.count);
    for (const period of DRIFT.periods) expect(isPrime(period), `${period}`).toBe(true);
    expect(new Set(DRIFT.periods).size).toBe(DRIFT.periods.length);

    // And one per index, which is the same fact from the consumer's side — a
    // table long enough that nothing has to wrap onto somebody else's curve.
    const claimed = indices.map((index) => periodFor(index));
    expect(new Set(claimed).size).toBe(claimed.length);
  });

  it('keeps every period in tens of seconds to minutes, and in order', () => {
    // The range is the whole feel of the feature. Faster than this and the board
    // is wobbling rather than drifting; slower and a session ends before anything
    // has moved.
    for (const period of DRIFT.periods) {
      expect(period, `${period}`).toBeGreaterThanOrEqual(30);
      expect(period, `${period}`).toBeLessThanOrEqual(180);
    }
    expect([...DRIFT.periods]).toEqual([...DRIFT.periods].sort((a, b) => a - b));
  });

  it('counts exactly what the board has to drift, derived rather than stated', () => {
    // Every module's level, every module's character, every box's amount. Written
    // as arithmetic on the id lists so a tenth module cannot leave the table one
    // period short without this failing.
    expect(DRIFT_KEYS.count).toBe(SOURCE_IDS.length * 2 + MODIFIER_IDS.length);
    expect(DRIFT_KEYS.loud(0)).toBe(0);
    expect(DRIFT_KEYS.char(0)).toBe(SOURCE_IDS.length);
    expect(DRIFT_KEYS.mod(0)).toBe(SOURCE_IDS.length * 2);
    // A module's own two controls land half a table apart, which is the reason
    // the layout is level-then-character rather than two-per-module: a module
    // whose level and character moved nearly together would just get louder.
    for (const index of SOURCE_IDS.keys()) {
      expect(periodFor(DRIFT_KEYS.loud(index))).not.toBe(periodFor(DRIFT_KEYS.char(index)));
    }
  });

  it('never leaves an index without a period, however far out of range', () => {
    for (const index of [-1, -1000, DRIFT_KEYS.count, 10_000, 2.7]) {
      expect(DRIFT.periods, `${index}`).toContain(periodFor(index));
    }
  });
});

describe('the curves', () => {
  it('starts every one of them at rest, which is what WAKE IT depends on', () => {
    // No phase offset anywhere: the board sounds exactly as it was set on the
    // first tick after the lever, and drifts away from there rather than
    // arriving somewhere else. The periods pull them apart on their own.
    for (const index of indices) expect(offsetAt(index, 0), `${index}`).toBe(0);
  });

  it('rides a full sine on its own period', () => {
    for (const index of indices) {
      const period = periodFor(index);
      expect(offsetAt(index, period / 4), `${index}`).toBeCloseTo(1, 10);
      expect(offsetAt(index, period / 2), `${index}`).toBeCloseTo(0, 10);
      expect(offsetAt(index, (period * 3) / 4), `${index}`).toBeCloseTo(-1, 10);
      expect(offsetAt(index, period), `${index}`).toBeCloseTo(0, 10);
    }
  });

  it('pulls apart within seconds of a shared start', () => {
    // The one property the missing phase offset has to buy back. Ten seconds in,
    // no two curves are still sitting on top of each other.
    const at = indices.map((index) => offsetAt(index, 10));
    for (const [i, first] of at.entries()) {
      for (const second of at.slice(i + 1)) {
        expect(Math.abs(first - second)).toBeGreaterThan(1e-3);
      }
    }
  });
});

describe('the envelope', () => {
  it('never carries a value further from its centre than the ceiling allows', () => {
    // The rule the whole feature turns on: a value that wandered across its range
    // is a value the user no longer set.
    for (const base of [0, 0.2, 0.5, 0.8, 1]) {
      for (const amount of [0, 0.25, 0.5, 1]) {
        for (let seconds = 0; seconds <= 400; seconds += 0.5) {
          for (const index of indices) {
            const moved = driftValue(base, index, seconds, amount);
            expect(Math.abs(moved - base)).toBeLessThanOrEqual(driftReach(amount) * DRIFT.envelope + 1e-12);
          }
        }
      }
    }
  });

  it('stays inside the range a control actually has', () => {
    // Asymmetric at the ends, deliberately: a control pushed to 1 can only wander
    // down, because there is nothing above it to wander into.
    for (const base of [0, 1]) {
      for (let seconds = 0; seconds <= 200; seconds += 0.5) {
        for (const index of indices) {
          const moved = driftValue(base, index, seconds, 1);
          expect(moved).toBeGreaterThanOrEqual(0);
          expect(moved).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('reaches the full ceiling somewhere, so the control means what it says', () => {
    // The bound above would pass just as well on a drift that never moved. This
    // is the other half: at MEGADRIFT full, a mid-range value really does get all
    // the way out to fifteen percent.
    const index = 0;
    const peak = driftValue(0.5, index, periodFor(index) / 4, 1);
    expect(peak).toBeCloseTo(0.5 + DRIFT.envelope, 10);
  });
});

// How the lever's travel is spent (gt#66). Opened in step with the lever, the
// envelope left the bottom half of it inaudible: rendered, half way moved the
// mix by half a LU and a decibel and a half of tone, and a quarter of the way by
// less than the board moves with the lever shut. So the bottom opens fastest.
describe('the lever', () => {
  it('is shut at the bottom and exactly the envelope at the top', () => {
    expect(driftReach(0)).toBe(0);
    expect(driftReach(1)).toBe(1);
    // And nothing outside its travel means anything else.
    expect(driftReach(-0.5)).toBe(0);
    expect(driftReach(3)).toBe(1);
  });

  it('opens further the further it is pushed, the whole way', () => {
    let last = -1;
    for (let lever = 0; lever <= 1.0001; lever += 0.05) {
      const reach = driftReach(lever);
      expect(reach).toBeGreaterThan(last);
      last = reach;
    }
  });

  it('spends its bottom quarter getting to where the drift can first be heard', () => {
    // Half the envelope is where a listener can first tell the board is
    // moving. A straight lever reached it half way up; this one is there by a
    // quarter, and never opens less than a straight one would.
    expect(driftReach(0.25)).toBeGreaterThanOrEqual(0.5);
    for (let lever = 0; lever <= 1.0001; lever += 0.05) {
      expect(driftReach(lever)).toBeGreaterThanOrEqual(lever - 1e-12);
    }
  });

  it('is what a drifted value is scaled by', () => {
    const index = 0;
    const quarter = periodFor(index) / 4;
    expect(driftValue(0.5, index, quarter, 0.25) - 0.5).toBeCloseTo(driftReach(0.25) * DRIFT.envelope, 10);
  });
});

describe('a whole board, drifted', () => {
  it('opens shut, and hands the state straight back while it is', () => {
    // By identity rather than by arithmetic that lands on the same numbers: a
    // board with the lever down is not being drifted by nothing, it is a board
    // this file is not involved in.
    expect(DRIFT.opening).toBe(0);
    expect(driftState(OPENING_STATE, 0, 0)).toBe(OPENING_STATE);
    expect(driftState(OPENING_STATE, 999, 0)).toBe(OPENING_STATE);
    expect(driftState(OPENING_STATE, 999, -1)).toBe(OPENING_STATE);
  });

  it('never writes the base it was handed', () => {
    // The rule every re-centring case falls out of. A tick that could edit the
    // state would be a tick that could undo the user's last move.
    const before = JSON.stringify(OPENING_STATE);
    driftState(OPENING_STATE, 77, 1);
    expect(JSON.stringify(OPENING_STATE)).toBe(before);
  });

  it('gives the same board the same drift, every time it is asked', () => {
    // The first law, stated as a check. Nothing here is seeded, sampled or
    // remembered — the same three arguments are the same board.
    expect(driftState(OPENING_STATE, 123.5, 0.7)).toEqual(driftState(OPENING_STATE, 123.5, 0.7));
    expect(driftState(OPENING_STATE, 123.5, 0.7)).not.toEqual(
      driftState(OPENING_STATE, 124.5, 0.7),
    );
  });

  it('moves levels, characters and amounts, and nothing else at all', () => {
    const base = boardAt(0.5);
    const moved = driftState(base, 61, 1);

    // What drifts. A quarter of the shortest period in, at the ceiling, so
    // something has definitely happened to all three kinds.
    expect(SOURCE_IDS.some((id) => moved.m[id].loud !== base.m[id].loud)).toBe(true);
    expect(MODIFIER_IDS.some((id) => moved.mods[id].amount !== base.mods[id].amount)).toBe(true);
    expect(
      SOURCE_IDS.some((id) => !SOURCE_DEFS[id].charWords && moved.m[id].char !== base.m[id].char),
    ).toBe(true);

    // And what does not, which is as decided as what does. A source switching
    // itself off is the board taking things away; the root moving is gt#56's; and a
    // board that re-wires itself is a board nobody is playing.
    for (const id of SOURCE_IDS) {
      expect(moved.m[id].on, id).toBe(base.m[id].on);
      expect(moved.m[id].often, id).toBe(base.m[id].often);
    }
    for (const id of MODIFIER_IDS) expect(moved.mods[id].fed, id).toBe(base.mods[id].fed);
    expect(moved.g).toEqual(base.g);
    expect(moved.woke).toBe(base.woke);
  });

  it('leaves a stepped character exactly where it is, read off the definition', () => {
    // THE VOICE is the one module whose character is a choice between four words
    // rather than an amount, and a mode that drifts is a mode that flickers. The
    // check is written against `charWords` rather than against the id, so a second
    // stepped character is covered by the thing that makes it stepped.
    const stepped = SOURCE_IDS.filter((id) => SOURCE_DEFS[id].charWords !== undefined);
    expect(stepped).toEqual(['voice']);

    const base = boardAt(0.5);
    for (const seconds of [7, 61, 300]) {
      const moved = driftState(base, seconds, 1);
      for (const id of stepped) expect(moved.m[id].char, id).toBe(base.m[id].char);
      // …while its level drifts like everything else's: it is the character that
      // snaps, not the module.
      expect(moved.m.voice.loud).not.toBe(base.m.voice.loud);
    }
  });
});

describe('the clock', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** A clock whose engine time the caller moves by hand. */
  function build(): { ticks: number[]; now: { at: number }; handle: ReturnType<typeof createDrift> } {
    const ticks: number[] = [];
    const now = { at: 0 };
    const handle = createDrift({ now: () => now.at, onTick: (seconds) => ticks.push(seconds) });
    return { ticks, now, handle };
  }

  it('does nothing until it is started', () => {
    const { ticks, handle } = build();
    expect(handle.seconds).toBe(0);
    vi.advanceTimersByTime(DRIFT.tickMs * 10);
    expect(ticks).toEqual([]);
    handle.destroy();
  });

  it('ticks on its own period and reports elapsed engine time', () => {
    const { ticks, now, handle } = build();
    handle.start();
    vi.advanceTimersByTime(DRIFT.tickMs - 1);
    expect(ticks).toEqual([]);

    now.at = 4;
    vi.advanceTimersByTime(1);
    expect(ticks).toEqual([4]);
    expect(handle.seconds).toBe(4);
    handle.destroy();
  });

  it('starts every curve at rest however long the engine has been running', () => {
    // The property ../src/drift's zero-phase promise actually rests on: an engine
    // that has been up for a minute before the lever bottoms out must still hand
    // the first tick a time near zero, not a minute.
    const { ticks, now, handle } = build();
    now.at = 60;
    handle.start();
    now.at = 60.1;
    vi.advanceTimersByTime(DRIFT.tickMs);
    expect(ticks).toEqual([expect.closeTo(0.1, 10)]);
    handle.destroy();
  });

  it('never reports time running backwards', () => {
    // A context whose clock is read before it has properly started can hand back
    // a time behind the one the clock zeroed against, and a negative second would
    // come out the far end as a board drifting the wrong way.
    const { ticks, now, handle } = build();
    now.at = 10;
    handle.start();
    now.at = 9;
    vi.advanceTimersByTime(DRIFT.tickMs);
    expect(ticks).toEqual([0]);
    handle.destroy();
  });

  it('runs one clock however many times it is started, and stops on destroy', () => {
    const { ticks, handle } = build();
    handle.start();
    handle.start();
    vi.advanceTimersByTime(DRIFT.tickMs);
    expect(ticks).toHaveLength(1);

    handle.destroy();
    vi.advanceTimersByTime(DRIFT.tickMs * 10);
    expect(ticks).toHaveLength(1);
  });
});
