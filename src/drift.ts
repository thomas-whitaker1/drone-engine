// MEGADRIFT: the board's second slow clock, and the first thing on it that moves
// without a hand on it.
//
// Everything else here is static until somebody turns it. For a genre whose whole
// premise is very slow change over very long durations that is backwards — the
// board is at its least interesting exactly when you stop touching it. This makes
// character controls, HOW LOUD and the chain amounts wander on their own, by an
// amount one lever sets.
//
// Five things about it are decisions rather than implementation details:
//
// - **It is not random, and that is the whole difficulty of the feature.** The
//   brief's first law is that nothing is randomised at runtime, because fiddling
//   is only fun when turning a thing reliably causes a thing. A drift that was a
//   random walk would break it twice over: the board would change with no hand on
//   it *and* the same board would sound different every session. So every value
//   here rides a fixed, very slow sine, on a period drawn from {@link
//   DRIFT.periods} — primes, tens of seconds to minutes, mutually incommensurate
//   by construction. The sum of twenty-nine of those does not repeat inside any
//   session anybody will sit through, which is a very complicated fixed pattern
//   rather than randomness, and a very complicated fixed pattern is what actually
//   sounds alive. Same board, same lever, same drift, every time.
// - **It owns no board, no engine and no DOM.** {@link driftState} is a pure
//   function from one state to another, so the whole of what drift decides can be
//   checked without mounting anything or opening a context — the same bargain
//   ../summon makes, and for the same reason. {@link createDrift} is a bare
//   interval that hands out a time; applying what comes back is ../app's job.
// - **The drift is an envelope around a value's current position, never a walk
//   across its range.** A control that wanders from 0 to 1 is a control the user
//   no longer set. {@link DRIFT.envelope} is the ceiling at MEGADRIFT full and it
//   is deliberately small.
// - **The state handed in is the *base* — what the hand set — and this never
//   writes it.** That one rule is what makes every re-centring case fall out for
//   free rather than needing code: a hand on a control moves the base, SMASH IT
//   replaces the base outright, and in both cases the drift carries on from its
//   own phase around wherever the new centre is. Nothing the user does can be
//   undone by a tick, which is the fastest possible way to make a board feel
//   broken and the one failure this feature had to be built around.
// - **What does not drift is as decided as what does.** Power stays put — a
//   source switching itself off is the board taking things away. TUNING stays put
//   because the root moving is gt#56's, and the two share this file's clock rather
//   than growing a second one. Stepped values stay put, because a value that
//   snaps has nothing to wander through: THE VOICE's MODE would flicker between
//   four characters and HOW OFTEN between five rates. And the patch never drifts,
//   ever — a board that re-wires itself is a board nobody is playing.
//
// STILLNESS does not reach this file, and that absence is load-bearing enough
// that ../stillness wrote it down before this existed: that switch is about the
// user's eyes, so it stops the knobs *turning* and never stops the sound
// underneath them moving. The decision lives in ../app, which is the only thing
// holding both.

import { MODIFIER_IDS, SOURCE_IDS } from './engine/constants';
import type { ModifierId, SourceId } from './engine/constants';
import { SOURCE_DEFS } from './ui';
import type { BoardState, ModifierState, ModuleState } from './ui';

export const DRIFT = {
  /**
   * How far a value may sit from where it was set, at MEGADRIFT full. Fifteen
   * percent of the range: enough that a knob visibly creeps over a minute and
   * far too little for the board to become something the user did not set.
   */
  envelope: 0.15,

  /**
   * How the lever's travel is spent, as the power its position is raised to —
   * see {@link driftReach}. A half is a square root: the bottom quarter of the
   * lever opens half the envelope. One would be a straight line, which is what
   * this was, and which left the bottom half of the lever inaudible (gt#66).
   */
  curve: 0.5,

  /**
   * The clock, in milliseconds. A hundredth of ../weathering's five seconds, and
   * the difference is the point: that one counts a session and this one draws a
   * curve. The knobs turn, so the tick has to be fast enough that they turn
   * rather than jump — at the shortest period in the table a tick moves the
   * fastest control four tenths of a degree, which is smoother than the
   * atmosphere's tenth-per-frame lerp for a tenth of the writes.
   *
   * Note what is *not* here: no smoothing, no lerp, no easing. Those exist to
   * hide a value that jumped. Nothing here jumps — the curve is continuous and
   * this only decides how often it is read.
   */
  tickMs: 100,

  /**
   * Where the lever opens, and it opens shut. A board that starts wandering
   * before anyone asks it to is a board that has changed itself on first
   * contact, which is the one thing the first law is about.
   */
  opening: 0,

  /**
   * One period per drifting value, in seconds, and the table gt#56 shares rather
   * than growing a second one — a root drifting on its own clock beside this one
   * would be two slow systems where the board wants one.
   *
   * Primes, so no two are commensurate and no pair of controls ever locks into
   * moving together. The range is the issue's: tens of seconds at the fast end,
   * approaching three minutes at the slow. There are exactly as many as there
   * are values to drift — see {@link periodFor} for which index gets which —
   * and a feature that wants one of its own appends to the end rather than
   * reusing an index, because two things on one period is two things moving as
   * one.
   */
  periods: [
    31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131,
    137, 139, 149, 151, 157, 163, 167,
  ],
} as const;

/**
 * Which index in {@link DRIFT.periods} belongs to what, stated once.
 *
 * Every module's HOW LOUD comes first, then every module's character, then the
 * chain. Laid out that way rather than two-per-module on purpose: a module's own
 * two controls end up half a table apart, so its level and its character move
 * against each other instead of nearly together, which is the difference between
 * a module breathing and a module simply getting louder.
 */
export const DRIFT_KEYS = {
  loud: (index: number): number => index,
  char: (index: number): number => SOURCE_IDS.length + index,
  mod: (index: number): number => SOURCE_IDS.length * 2 + index,
  /** How many the board itself claims. Anything added later starts here. */
  count: SOURCE_IDS.length * 2 + MODIFIER_IDS.length,
} as const;

/** The period one index rides, in seconds. Wraps, so no index is ever periodless. */
export function periodFor(index: number): number {
  const periods = DRIFT.periods;
  const at = ((Math.trunc(index) % periods.length) + periods.length) % periods.length;
  return periods[at] ?? periods[0];
}

/**
 * Where one index's curve sits at a moment, −1…1.
 *
 * A plain sine with no phase offset, which means every curve reads exactly zero
 * at zero. That is deliberate and it is the property WAKE IT depends on: the
 * board sounds precisely as it was set on the first tick after the lever, and
 * drifts away from there rather than arriving somewhere else. The periods are
 * incommensurate, so they pull apart from that shared start within seconds
 * without any of them needing to be nudged.
 *
 * `seconds` is time on the engine's own clock rather than the wall's, which is
 * what makes the same board at the same setting drift identically every session.
 */
export function offsetAt(index: number, seconds: number): number {
  return Math.sin((2 * Math.PI * seconds) / periodFor(index));
}

/**
 * One value, drifted. The envelope is centred on where the hand left it and
 * clipped to the range the control actually has.
 *
 * The clip is asymmetric at the ends and that is correct rather than tolerated: a
 * control pushed to 1 can only wander down, because there is nothing above it. An
 * envelope that shrank to stay symmetrical would make the ends of every range
 * quieter than the middle for no reason a listener could name.
 */
export function driftValue(base: number, index: number, seconds: number, amount: number): number {
  const moved = base + driftReach(amount) * DRIFT.envelope * offsetAt(index, seconds);
  return Math.max(0, Math.min(1, moved));
}

/**
 * How much of the envelope a lever position opens, 0–1 (gt#66).
 *
 * Not the lever's own value, because the lever's own value left its bottom
 * half doing nothing a listener could hear. Measured on a render of the board
 * as it opens, six minutes at each position: with the envelope opened in step
 * with the lever, half way moved the mix's loudness by half a LU and its tone
 * by a decibel and a half — the edge of what can be heard at all — and a
 * quarter of the way moved it by less than the board moves with the lever
 * shut. The master's compressor is why: one module alone swings six LU at
 * full, and holding the level still is the compressor's whole job.
 *
 * So the lever opens the envelope fastest at the bottom. A quarter of its
 * travel opens half of it, which is where the drift first becomes audible, and
 * the top is unchanged: full is still exactly {@link DRIFT.envelope}, and shut
 * is still shut.
 */
export function driftReach(lever: number): number {
  return Math.pow(Math.max(0, Math.min(1, lever)), DRIFT.curve);
}

/**
 * A whole board, drifted — the base state in, a derived copy out, and the base
 * never touched.
 *
 * At an amount of zero the base is handed straight back, by identity rather than
 * by arithmetic that happens to land on the same numbers. A board with the lever
 * shut is not a board being drifted by nothing; it is a board this file is not
 * involved in, and the caller can compare references to know it.
 */
export function driftState(base: BoardState, seconds: number, amount: number): BoardState {
  if (amount <= 0) return base;

  const m = {} as Record<SourceId, ModuleState>;
  SOURCE_IDS.forEach((id, index) => {
    const source = base.m[id];
    m[id] = {
      ...source,
      loud: driftValue(source.loud, DRIFT_KEYS.loud(index), seconds, amount),
      // A character that is a choice rather than an amount is left exactly where
      // it is — THE VOICE is the one module with words under its character
      // control, and a mode that drifts is a mode that flickers. Read off the
      // definition rather than off the id, so a second stepped character is
      // covered by the definition that makes it stepped.
      char: SOURCE_DEFS[id].charWords
        ? source.char
        : driftValue(source.char, DRIFT_KEYS.char(index), seconds, amount),
    };
  });

  const mods = {} as Record<ModifierId, ModifierState>;
  MODIFIER_IDS.forEach((id, index) => {
    const modifier = base.mods[id];
    mods[id] = {
      ...modifier,
      amount: driftValue(modifier.amount, DRIFT_KEYS.mod(index), seconds, amount),
    };
  });

  // `woke`, both globals, every power and every rate ride the spread untouched.
  return { ...base, m, mods };
}

export interface DriftSpec {
  /**
   * The engine's clock, in seconds. Handed in as a function rather than as an
   * engine for the reason the atmosphere's reading call is (see ./ui/atmosphere):
   * it makes "this file reads the clock and never touches the sound" a fact about
   * the code instead of a promise about it.
   */
  readonly now: () => number;

  /** A tick, carrying seconds since {@link DriftHandle.start}. */
  readonly onTick: (seconds: number) => void;

  /** The clock's period. Defaults to {@link DRIFT.tickMs}. */
  readonly tickMs?: number;
}

export interface DriftHandle {
  /** Seconds of engine time since the clock started, or 0 before it did. */
  readonly seconds: number;

  /**
   * Begin ticking, from now. Called once the engine exists, because the clock it
   * reads is the audio one and there is none before WAKE IT. Calling it twice
   * runs one clock, not two.
   */
  start(): void;

  /** Stop ticking. Nothing is reset — a stopped clock keeps its elapsed time. */
  destroy(): void;
}

/**
 * Build the clock. Nothing moves until {@link DriftHandle.start}, and nothing is
 * decided here at all — the handle reports elapsed engine time and the caller
 * decides what a board does with it.
 */
export function createDrift(spec: DriftSpec): DriftHandle {
  const tickMs = spec.tickMs ?? DRIFT.tickMs;

  let clock: ReturnType<typeof setInterval> | null = null;
  let woke = 0;
  let seconds = 0;

  return {
    get seconds() {
      return seconds;
    },
    start(): void {
      if (clock) return;
      // Zeroed against the clock as it is now rather than against the context's
      // own origin: an engine that has been running for a minute before the lever
      // bottoms out must still start every curve at rest.
      woke = spec.now();
      seconds = 0;
      clock = setInterval(() => {
        seconds = Math.max(0, spec.now() - woke);
        spec.onTick(seconds);
      }, tickMs);
    },
    destroy(): void {
      if (clock) clearInterval(clock);
      clock = null;
    },
  };
}
