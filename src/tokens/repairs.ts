// What somebody did about the damage. ./damage is what the board took and
// ./sigils is what was cut into it on purpose; this is the third thing a
// scavenged board has on it, which is evidence that it has been kept going.
//
// There is one repair so far: tape wound round a cable (gt#107). It replaced the
// figure that used to be drawn on every cable near where it lands. That figure
// was a sigil at twelve pixels, which is a cross, floating beside a wire. A
// cable on this board is the one part a hand actually pulls about, and what a
// cable that has been pulled about for years has on it is tape.
//
// The same three laws as the other two files, by the same means:
//
// - **Nothing is randomised at runtime.** A wrap is drawn from a seed that is a
//   name, memoised, so a cable is taped the same way this session and the next.
// - **It is geometry, and only geometry.** This file hands back numbers — how
//   many turns, how wide, how far askew — and no colour at all. The tape is
//   the board's own tape and the caller already has it; a second copy of a
//   colour here would be a second place for it to drift.
// - **It never labels.** Two cables into one box are wound differently because
//   they come from different sources, and that is a thing to notice or not.

import { draws } from './geometry';
import { seedOf } from './sigils';

/** Every number a wrap is wound to, in one place, because this is what gets retuned by eye. */
export const TAPE_WRAP = {
  /**
   * How far back up the cable from the jack the middle of the wrap sits, in
   * pixels. Never closer than a plug is long, and different for every source
   * so a row of cables is not taped at one height like a fence.
   */
  minBack: 30,
  maxBack: 62,

  /** Turns of tape, and how wide the strip is along the cable. */
  minTurns: 2,
  maxTurns: 4,
  minWidth: 4.5,
  maxWidth: 7,

  /** How much of a turn the next one lies over. A wrap with no overlap is a row of rings. */
  minLap: 0.15,
  maxLap: 0.45,

  /**
   * How far off square the tape crosses the cable, in degrees. Tape wound
   * round a wire climbs it, so every turn of one wrap leans the same way, and
   * `wobble` is how far one turn strays from the rest.
   */
  minSkew: 7,
  maxSkew: 17,
  wobble: 3,

  /** Half the wrap's height across the cable: just proud of the cable and its shadow. */
  across: 3.7,

  /** How often a turn is cut from the other, older roll. */
  scrapOdds: 0.3,

  /** How often the end of the tape has lifted, and how far the flap stands off. */
  tailOdds: 0.55,
  minTail: 2.5,
  maxTail: 5,
} as const;

/** One turn of tape, in the cable's own terms: along it, and across it. */
export interface TapeTurn {
  /** Where the middle of this turn is along the cable, from the middle of the wrap. */
  readonly at: number;
  /** How wide the strip is along the cable. */
  readonly width: number;
  /** Degrees off square. */
  readonly skew: number;
  /** Cut from the scrap roll rather than the good one. */
  readonly scrap: boolean;
}

export interface TapeWrap {
  /** How far up the cable from its landing the wrap is centred. */
  readonly back: number;
  /** Laid in the order they were wound, so a later turn lies over an earlier one. */
  readonly turns: readonly TapeTurn[];
  /**
   * How far the lifted end stands off the cable, or 0 for an end that is stuck
   * down. Positive hangs below the cable and negative stands above it.
   */
  readonly tail: number;
  /** End to end along the cable. */
  readonly length: number;
}

const wound = new Map<string, TapeWrap>();

/**
 * The wrap for a key. Memoised, so the same key does not merely produce an
 * equal wrap on the second call, it produces the identical one.
 */
export function tapeWrap(key: string): TapeWrap {
  const had = wound.get(key);
  if (had) return had;

  const r = draws(seedOf(`tape:${key}`));
  const count = Math.round(r.between(TAPE_WRAP.minTurns, TAPE_WRAP.maxTurns));
  const lean = r.between(TAPE_WRAP.minSkew, TAPE_WRAP.maxSkew) * (r.odds(0.5) ? 1 : -1);

  // Wound from one end to the other, each turn starting a little inside the
  // last, and then the whole thing slid so its middle is at zero.
  const laid: Array<{ from: number; width: number; skew: number; scrap: boolean }> = [];
  let edge = 0;
  for (let i = 0; i < count; i++) {
    const width = r.between(TAPE_WRAP.minWidth, TAPE_WRAP.maxWidth);
    const from = i === 0 ? 0 : edge - width * r.between(TAPE_WRAP.minLap, TAPE_WRAP.maxLap);
    laid.push({
      from,
      width,
      skew: lean + r.between(-TAPE_WRAP.wobble, TAPE_WRAP.wobble),
      scrap: r.odds(TAPE_WRAP.scrapOdds),
    });
    edge = from + width;
  }
  const length = edge;

  const made: TapeWrap = {
    back: r.between(TAPE_WRAP.minBack, TAPE_WRAP.maxBack),
    turns: laid.map((turn) => ({
      at: turn.from + turn.width / 2 - length / 2,
      width: turn.width,
      skew: turn.skew,
      scrap: turn.scrap,
    })),
    tail: r.odds(TAPE_WRAP.tailOdds)
      ? r.between(TAPE_WRAP.minTail, TAPE_WRAP.maxTail) * (r.odds(0.5) ? 1 : -1)
      : 0,
    length,
  };
  wound.set(key, made);
  return made;
}

/**
 * The four corners of one turn, as an SVG `points` list: a strip across the
 * cable, leaning. `x` runs along the cable and `y` across it, so the caller
 * only has to put the cable's own tangent under it.
 */
export function turnPoints(turn: TapeTurn, across: number = TAPE_WRAP.across): string {
  const lean = Math.tan((turn.skew * Math.PI) / 180) * across;
  const left = turn.at - turn.width / 2;
  const right = turn.at + turn.width / 2;
  const p = (x: number, y: number): string => `${x.toFixed(1)},${y.toFixed(1)}`;
  return [p(left + lean, -across), p(right + lean, -across), p(right - lean, across), p(left - lean, across)].join(' ');
}
