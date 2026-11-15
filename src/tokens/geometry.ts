// The four things every piece of generated geometry on this board needs: a
// seeded stream to draw from, a way to print a coordinate, and a way to get the
// result into CSS.
//
// They were written for ./damage, which is where the board's injuries are drawn,
// and they moved here the moment there was a second generator — ./sigils, which
// draws the marks somebody scratched into the plate rather than the damage the
// board took. The two have nothing to say to each other and the dependency would
// have had to run one way or the other: a sigil importing from *damage* claims a
// mark is a kind of injury, which is exactly backwards. So the primitives are
// their own module and both draw from it.
//
// What did **not** move is as deliberate. `wraps`, `repeated` and `Bounds` are
// still ./damage's, because they solve a problem only a *tile* has — a mark
// running off one edge has to come back on the opposite one or the eye finds the
// repeat. A sigil is drawn once, at a known size, in a known place. It never
// tiles, so it never wraps.

import { lcg } from '../engine/deterministic';

// ------------------------------------------------------------------- the stream

/**
 * The first few values off a Park–Miller stream seeded with a small number are
 * all but identical — seed 4 gives −0.99994, then −0.947 — because the state has
 * not had a chance to climb into its range yet. It costs nothing in a noise
 * buffer, where sample zero is one of forty thousand. It costs a great deal in
 * geometry, where the first draw is the first mark's position and every field
 * would start in the same corner. So the stream is run this far forward and
 * thrown away before anything is asked of it.
 */
const WARMUP = 8;

/** A seeded stream, in the shapes geometry actually wants. */
export interface Draw {
  /** 0…1. */
  unit(): number;
  /** Somewhere between the two, evenly. */
  between(low: number, high: number): number;
  /** True this often. */
  odds(probability: number): boolean;
  /** One of these, evenly. Empty in, undefined out. */
  pick<T>(from: readonly T[]): T | undefined;
}

export function draws(seed: number): Draw {
  const next = lcg(seed);
  for (let i = 0; i < WARMUP; i++) next();
  const unit = (): number => (next() + 1) / 2;
  return {
    unit,
    between: (low, high) => low + unit() * (high - low),
    odds: (probability) => unit() < probability,
    // `min` guards the one case the arithmetic cannot: `unit()` is built from a
    // modulus and can in principle land on exactly 1, which would index one past
    // the end and hand back an undefined that reads as an empty array.
    pick: (from) => from[Math.min(from.length - 1, Math.floor(unit() * from.length))],
  };
}

// -------------------------------------------------------------------- rendering

/**
 * One decimal, and no trailing zero. Every coordinate in a generated tile goes
 * through here: at three decimals the scratch field alone is a couple of
 * kilobytes of digits nobody can see, and these tiles are inlined into the
 * stylesheet.
 */
export const n = (value: number): string => {
  const text = value.toFixed(1);
  return text.endsWith('.0') ? text.slice(0, -2) : text;
};

/**
 * Everything encoded on the way into a `url()`, and only the first four of them
 * have to be.
 *
 * A space, an apostrophe and a bracket are all perfectly legal inside a
 * *double-quoted* url token — the board has shipped tiles full of all three —
 * but they are legal only for as long as those quotes survive, and these values
 * pass through more hands than an ordinary declaration does: they are inlined
 * into custom properties, re-serialized through `cssText`, and read back by
 * anything inspecting the plate. Unquoted, a bracket ends the `url(` outright
 * and the texture silently does not paint, which is the worst shape a bug can
 * take here — nothing to see, and nothing in the console either.
 *
 * It is not free: encoding all three costs 2.1KB across the four damage tiles,
 * about 13%. Paid once into four custom properties rather than per element, on
 * strings whose repetition compresses well, against a failure mode that shows
 * up as an unstyled board and no error. Worth it.
 */
const ENTITIES: Readonly<Record<string, string>> = {
  '<': '%3C',
  '>': '%3E',
  '#': '%23',
  '"': '%22',
  ' ': '%20',
  "'": '%27',
  '(': '%28',
  ')': '%29',
};

/** Markup to a ready-to-use CSS `url()`, the same shape the grain tile has. */
export const uri = (markup: string): string =>
  `url("data:image/svg+xml,${markup.replace(/[<>#" '()]/g, (char) => ENTITIES[char] ?? char)}")`;

/** One tile of the given size, with its body already built. */
export const tile = (width: number, height: number, body: string): string =>
  uri(`<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'>${body}</svg>`);
