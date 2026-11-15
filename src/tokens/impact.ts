// What a blow throws off. ./damage is what the board took and ./repairs is
// what somebody did about it; this is the third thing, the moment of the
// damage itself — the sparks off the anvil when the hammer lands (gt#115).
//
// The same laws as the other generated files, by the same means:
//
// - **Nothing is randomised at runtime.** A spray is drawn from a seed that is
//   a number, memoised, so the third blow of this session throws the sparks
//   the third blow of the last one did. There are a handful of sprays and the
//   board goes round them, which is what stops a blow looking like a replay
//   of the one before without a single random number being drawn.
// - **It is geometry, and only geometry.** This file hands back numbers — how
//   far, how high, how long — and no colour. A spark's colour is a token.

import { draws } from './geometry';
import { seedOf } from './sigils';

/** Every number a spray is thrown to, in one place, because this is what gets retuned by eye. */
export const SPARKS = {
  /** How many sparks a blow throws, half to each side. */
  count: 26,
  /** How many different sprays there are before the first comes round again. */
  sprays: 5,
  /** How far out one goes, in pixels from the edge of the struck face. */
  minReach: 16,
  maxReach: 124,
  /** How far below the struck face it ends up. */
  minFall: 12,
  maxFall: 40,
  /**
   * How hard it is thrown upward before it falls: the overshoot of the curve
   * its drop is eased on. At 1.2 it barely rises; at 3.6 it goes up further
   * than it will come down.
   */
  minKick: 1.2,
  maxKick: 3.6,
  /** How long it lives. */
  minMs: 280,
  maxMs: 640,
  /** The streak: how long, and how far off upright it leans, outward. */
  minLength: 4,
  maxLength: 13,
  minLean: 30,
  maxLean: 82,
  /** How thick a streak is. */
  width: 2,
  /** How lopsided the reach is: 1 is even, and past it most sparks fall short. */
  bias: 1.6,
} as const;

/** One spark of a spray. */
export interface Spark {
  /** Which way it goes: -1 left, 1 right. */
  readonly side: -1 | 1;
  readonly reach: number;
  readonly fall: number;
  readonly kick: number;
  readonly ms: number;
  readonly length: number;
  /** Degrees off upright, signed with `side`. */
  readonly lean: number;
}

const thrown = new Map<number, readonly Spark[]>();

/**
 * The sparks one blow throws. `spray` is which of the {@link SPARKS.sprays} it
 * is; any whole number is taken and wrapped, so the caller can hand over a
 * count of blows.
 *
 * Alternating sides, so both ends of the struck face throw the same number
 * whatever the seed drew. Most go a short way and a few go far, which is the
 * same lopsidedness the rust and the scratches have and for the same reason:
 * evenly spread, a spray is a fan.
 */
export function sparkSpray(spray: number): readonly Spark[] {
  const which = ((Math.floor(spray) % SPARKS.sprays) + SPARKS.sprays) % SPARKS.sprays;
  const had = thrown.get(which);
  if (had) return had;

  const r = draws(seedOf(`spark:${which}`));
  const sparks: Spark[] = [];
  for (let i = 0; i < SPARKS.count; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    // Raised to a power past 1, so most of them are short.
    const far = r.unit() ** SPARKS.bias;
    sparks.push({
      side,
      reach: SPARKS.minReach + far * (SPARKS.maxReach - SPARKS.minReach),
      fall: r.between(SPARKS.minFall, SPARKS.maxFall),
      kick: r.between(SPARKS.minKick, SPARKS.maxKick),
      ms: Math.round(r.between(SPARKS.minMs, SPARKS.maxMs)),
      length: r.between(SPARKS.minLength, SPARKS.maxLength),
      lean: side * r.between(SPARKS.minLean, SPARKS.maxLean),
    });
  }
  thrown.set(which, sparks);
  return sparks;
}
