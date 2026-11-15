// The engine's half of the source registry — one entry per module, holding the
// facts `buildSources` needs *before* it can call a builder, and nothing else.
//
// This is deliberately not the single mega-entry issue gt#24's body sketches. A
// module's appearance already lives in src/tokens, its language in src/ui/words
// and its coefficients in ../constants, and each of those three is the only place
// its kind of fact is written down. Collapsing them into one object here would
// buy a shorter diff when a tenth module arrives and cost the property that makes
// any of them trustworthy. What the issue actually asks for is that adding a
// module cannot *silently* miss a place, and that is a typing problem rather than
// a layout one.
//
// So the entry carries exactly what was previously copied by hand into the top of
// every builder — the outlet's ceiling, a strike's beat offset, and the one
// module that opens somewhere other than half way — and `Record<SourceId, …>`
// makes a missing entry a compile error rather than a module that never gets
// built.
//
// The discriminant is the load-bearing part. `phase` sits on the strike arm
// alone, so a strike that forgets it does not compile; before this it defaulted
// to `?? 0` in the scheduler and the tenth module simply piled onto beat zero
// with SLOW HIT and MARACAS — a bug with no error, findable only by ear.
//
// The numbers themselves still come from ../constants. This file assembles; it
// does not restate. A ceiling written here as well would be a second place for
// the ear-tuning pass to miss.

import {
  BASS,
  CHAINSAW,
  COW,
  CYMBAL,
  GUITAR,
  LASER,
  MARACAS,
  SAX,
  SLOWHIT,
  THROAT,
  VOICE,
  type IntervalName,
  type SourceId,
} from '../constants';
import type { Engine, Outlet } from '../engine';
import { buildBass, buildChainsaw, buildGuitar, buildSax, buildThroat } from './drones';
import { buildCow, buildCymbal, buildLaser, buildMaracas, buildSlowHit, buildVoice } from './strikes';

/**
 * A builder. It is handed an outlet that is already registered, already carries
 * its ceiling and offset, and is already at the character value it opens on — so
 * a builder is only ever the synthesis, which is the one part of a module that
 * genuinely cannot be data.
 */
export type SourceBuild = (engine: Engine, outlet: Outlet) => void;

interface SourceSpecBase {
  /** What HOW LOUD is scaled by. The module's own ceiling, not the master's. */
  readonly maxGain: number;
  /**
   * What this module sits on, off the board's root (gt#38). Named, never a number
   * — see {@link INTERVALS}, which is also where the argument for why any set of
   * these is safe lives.
   *
   * Required rather than defaulted to `root`, for the reason `phase` is required
   * on a strike: a tenth module that forgets to say where it sits would land on
   * the root and sound fine, which is precisely the class of bug this registry
   * was built to make impossible. An interval of `root` is a decision and reads
   * as one.
   */
  readonly interval: IntervalName;
  /**
   * Where the character control opens, for the one module that does not open half
   * way: THE VOICE starts on CHANT rather than between GROWL and SHRIEK.
   */
  readonly initialChar?: number;
  readonly build: SourceBuild;
}

/**
 * One source, by archetype. A drone sustains for as long as it is on; a strike
 * fires against the heartbeat and **must** say which beat it fires on, which is
 * why `phase` lives on this arm rather than being optional across both.
 */
export type SourceSpec =
  | (SourceSpecBase & { readonly type: 'drone' })
  | (SourceSpecBase & {
      readonly type: 'strike';
      /** A fixed beat offset, so the five strikes do not land on top of each other. */
      readonly phase: number;
    });

/**
 * All eleven, keyed by id. `Record<SourceId, …>` is the whole point: an id added
 * to ../constants fails to compile here until it has a builder and a ceiling,
 * rather than quietly never being built. THROAT and LASER CANNON are the first
 * two modules to arrive through it (gt#42), and they arrived as objects.
 *
 * tests/sources.test.ts holds `type` in step with `STRIKE_IDS`, which stays the
 * scheduler's list — the archetype is asserted in two places on purpose, because
 * they cannot import each other without a cycle.
 */
export const SOURCE_SPECS: Record<SourceId, SourceSpec> = {
  // The wall and the floor hold the root, and are the reason the rest can move:
  // an interval down here is two sub-bass voices a few Hz apart, which is a
  // wobble rather than a chord. Everything below 80Hz at BEDROCK stays home.
  guitar: { type: 'drone', interval: 'root', maxGain: GUITAR.maxGain, build: buildGuitar },
  bass: { type: 'drone', interval: 'root', maxGain: BASS.maxGain, build: buildBass },
  // CHAINSAW is already the fifth — its `mult` of 3 is the third harmonic — so
  // it takes no interval and gets one anyway. Moving it to `fifth` would put it
  // on the ninth, a semitone off the sax below.
  chainsaw: { type: 'drone', interval: 'root', maxGain: CHAINSAW.maxGain, build: buildChainsaw },
  // The narrowest voice on the board, and the highest of the four drones, so it
  // is the one that can carry the third without turning the low end to mud.
  sax: { type: 'drone', interval: 'minorThird', maxGain: SAX.maxGain, build: buildSax },
  // The tenth module, and the first thing added here that the registry was built
  // for (gt#42). It holds the root — the whistle is a filter picking harmonics out
  // of its own buzz, so where it sits is the one pitch fact it has, and the
  // overtone can never be anywhere the root is not already.
  throat: { type: 'drone', interval: 'root', maxGain: THROAT.maxGain, build: buildThroat },
  slowhit: {
    type: 'strike',
    interval: 'root',
    maxGain: SLOWHIT.maxGain,
    phase: SLOWHIT.phase,
    build: buildSlowHit,
  },
  // Noise through a highpass — no pitch to place. Stated rather than omitted, so
  // that a module with nothing to say still says it.
  cymbal: {
    type: 'strike',
    interval: 'root',
    maxGain: CYMBAL.maxGain,
    phase: CYMBAL.phase,
    build: buildCymbal,
  },
  voice: {
    type: 'strike',
    interval: 'fifth',
    maxGain: VOICE.maxGain,
    phase: VOICE.phase,
    initialChar: VOICE.initialChar,
    build: buildVoice,
  },
  // Also unpitched.
  maracas: {
    type: 'strike',
    interval: 'root',
    maxGain: MARACAS.maxGain,
    phase: MARACAS.phase,
    build: buildMaracas,
  },
  // `mult` of 5 is a just major third, which is where the board's accidental
  // major chord came from. A minor third over it lands the moo on ×6 exactly —
  // the sixth harmonic, a fifth two octaves up — so this interval is the one
  // that *removes* a third rather than adding one.
  cow: { type: 'strike', interval: 'minorThird', maxGain: COW.maxGain, phase: COW.phase, build: buildCow },
  // The eleventh, and the sixth strike — the one that made `phase` being
  // mandatory pay for itself. Offsets 0/2/1/0/3 were taken and every class mod 4
  // was claimed, so there was no free answer and the module had to choose one
  // rather than default into the pile at zero. The fifth, and high: a sweep this
  // long has to start somewhere it can fall from.
  laser: {
    type: 'strike',
    interval: 'fifth',
    maxGain: LASER.maxGain,
    phase: LASER.phase,
    build: buildLaser,
  },
};
