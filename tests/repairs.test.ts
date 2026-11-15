// The repairs, and the three things that have to stay true about them: the same
// three tests/sigils.test.ts holds the marks to, because this is the same kind
// of thing. Nothing randomised at runtime; geometry and only geometry; and a
// wrap that is actually a wrap — turns that lean one way and lie over each
// other — rather than a row of rectangles with a seed on it.

import { describe, expect, it } from 'vitest';
import * as repairs from '../src/tokens/repairs';
import { TAPE_WRAP, tapeWrap, turnPoints } from '../src/tokens/repairs';
import { sourceKey } from '../src/tokens/sigils';
import { SOURCE_IDS } from '../src/engine/constants';

const wraps = SOURCE_IDS.map((id) => [id, tapeWrap(sourceKey(id))] as const);

describe('nothing is randomised at runtime', () => {
  it('hands back the identical wrap for a key it has already wound', () => {
    expect(tapeWrap('wire:guitar')).toBe(tapeWrap('wire:guitar'));
  });

  it('actually depends on the key', () => {
    // Without this a generator that ignored its seed would pass every other
    // test here — eleven cables taped identically, deterministically.
    const shapes = new Set(wraps.map(([, wrap]) => JSON.stringify(wrap)));
    expect(shapes.size).toBe(SOURCE_IDS.length);
    // And not at one height like a fence.
    const backs = wraps.map(([, wrap]) => wrap.back);
    expect(Math.max(...backs) - Math.min(...backs)).toBeGreaterThan(8);
  });
});

describe('a wrap is tape wound round a wire', () => {
  it('stays inside the numbers it is wound to', () => {
    for (const [id, wrap] of wraps) {
      expect(wrap.turns.length, id).toBeGreaterThanOrEqual(TAPE_WRAP.minTurns);
      expect(wrap.turns.length, id).toBeLessThanOrEqual(TAPE_WRAP.maxTurns);
      expect(wrap.back, id).toBeGreaterThanOrEqual(TAPE_WRAP.minBack);
      expect(wrap.back, id).toBeLessThanOrEqual(TAPE_WRAP.maxBack);
      for (const turn of wrap.turns) {
        expect(turn.width, id).toBeGreaterThanOrEqual(TAPE_WRAP.minWidth);
        expect(turn.width, id).toBeLessThanOrEqual(TAPE_WRAP.maxWidth);
        expect(Math.abs(turn.skew), id).toBeLessThanOrEqual(TAPE_WRAP.maxSkew + TAPE_WRAP.wobble);
      }
      if (wrap.tail) {
        expect(Math.abs(wrap.tail), id).toBeGreaterThanOrEqual(TAPE_WRAP.minTail);
        expect(Math.abs(wrap.tail), id).toBeLessThanOrEqual(TAPE_WRAP.maxTail);
      }
    }
  });

  it('leans every turn of one wrap the same way, because tape climbs a wire', () => {
    // Turns that leaned at random would be a pile of offcuts. `wobble` is
    // smaller than the least lean, so no turn can cross over to the other side.
    expect(TAPE_WRAP.wobble).toBeLessThan(TAPE_WRAP.minSkew);
    for (const [id, wrap] of wraps) {
      const signs = new Set(wrap.turns.map((turn) => Math.sign(turn.skew)));
      expect(signs.size, id).toBe(1);
      expect(signs.has(0), id).toBe(false);
    }
    // And across the board some lean one way and some the other.
    expect(new Set(wraps.map(([, wrap]) => Math.sign(wrap.turns[0]?.skew ?? 0))).size).toBe(2);
  });

  it('lays each turn partly over the one before, and never leaves a gap', () => {
    // A wrap with no overlap is a row of rings.
    expect(TAPE_WRAP.minLap).toBeGreaterThan(0);
    expect(TAPE_WRAP.maxLap).toBeLessThan(1);
    for (const [id, wrap] of wraps) {
      for (let i = 1; i < wrap.turns.length; i++) {
        const before = wrap.turns[i - 1];
        const turn = wrap.turns[i];
        if (!before || !turn) continue;
        const beforeEnds = before.at + before.width / 2;
        const turnStarts = turn.at - turn.width / 2;
        expect(turnStarts, `${id} turn ${i} starts inside the last`).toBeLessThan(beforeEnds);
        expect(turn.at + turn.width / 2, `${id} turn ${i} goes further`).toBeGreaterThan(beforeEnds);
      }
    }
  });

  it('is centred on where it is seated, and as long as it says it is', () => {
    for (const [id, wrap] of wraps) {
      const first = wrap.turns[0];
      const last = wrap.turns[wrap.turns.length - 1];
      if (!first || !last) throw new Error(`${id} has no turns.`);
      const left = first.at - first.width / 2;
      const right = last.at + last.width / 2;
      expect(left, id).toBeCloseTo(-wrap.length / 2, 6);
      expect(right, id).toBeCloseTo(wrap.length / 2, 6);
      // A few pixels of tape, not a sleeve.
      expect(wrap.length, id).toBeLessThan(TAPE_WRAP.maxTurns * TAPE_WRAP.maxWidth);
    }
  });

  it('is cut from both rolls somewhere on the board, and has a lifted end on some cables and not others', () => {
    const scraps = wraps.flatMap(([, wrap]) => wrap.turns.map((turn) => turn.scrap));
    expect(scraps).toContain(true);
    expect(scraps).toContain(false);
    const tails = wraps.map(([, wrap]) => wrap.tail !== 0);
    expect(tails).toContain(true);
    expect(tails).toContain(false);
  });
});

describe('a turn is a strip across the cable, leaning', () => {
  const turn = { at: 2, width: 6, skew: 12, scrap: false } as const;
  const corners = (points: string): Array<[number, number]> =>
    points.split(' ').map((pair) => pair.split(',').map(Number) as [number, number]);

  it('spans the cable top to bottom, and is as wide as its strip all the way down', () => {
    const [topLeft, topRight, bottomRight, bottomLeft] = corners(turnPoints(turn));
    expect(topLeft?.[1]).toBe(-TAPE_WRAP.across);
    expect(topRight?.[1]).toBe(-TAPE_WRAP.across);
    expect(bottomRight?.[1]).toBe(TAPE_WRAP.across);
    expect(bottomLeft?.[1]).toBe(TAPE_WRAP.across);
    expect((topRight?.[0] ?? 0) - (topLeft?.[0] ?? 0)).toBeCloseTo(turn.width, 1);
    expect((bottomRight?.[0] ?? 0) - (bottomLeft?.[0] ?? 0)).toBeCloseTo(turn.width, 1);
    // Wider than the cable and its shadow, which are six pixels across.
    expect(TAPE_WRAP.across * 2).toBeGreaterThan(6);
  });

  it('leans the way its skew says, about its own middle', () => {
    const [topLeft, , , bottomLeft] = corners(turnPoints(turn));
    expect(topLeft?.[0]).toBeGreaterThan(bottomLeft?.[0] ?? Infinity);
    const other = corners(turnPoints({ ...turn, skew: -12 }));
    expect(other[0]?.[0]).toBeLessThan(other[3]?.[0] ?? -Infinity);
    // Its middle is where the turn is, whichever way it leans.
    const xs = corners(turnPoints(turn)).map(([x]) => x);
    expect(xs.reduce((sum, x) => sum + x, 0) / 4).toBeCloseTo(turn.at, 1);
    // Square on, it is a rectangle.
    const square = corners(turnPoints({ ...turn, skew: 0 }));
    expect(square[0]?.[0]).toBe(square[3]?.[0]);
  });

  it('writes every corner to one decimal', () => {
    for (const pair of turnPoints(turn).split(' ')) expect(pair).toMatch(/^-?\d+\.\d,-?\d+\.\d$/);
  });
});

describe('it is geometry, and only geometry', () => {
  it('brings no colour and no string of its own', () => {
    // The tape is the board's tape and the caller already holds it. A string
    // exported from here would also be one tests/tokens.test.ts has to be told
    // about, since this file is re-exported with the rest of the tokens.
    const strings: string[] = [];
    const walk = (value: unknown): void => {
      if (typeof value === 'string') strings.push(value);
      else if (value !== null && typeof value === 'object') Object.values(value).forEach(walk);
    };
    walk(repairs);
    expect(strings).toEqual([]);
  });
});
