// The one randomizer in the product, and the only place `Math.random` is
// reached for at all.
//
// The brief's first law is that nothing is randomised at runtime: every noise
// buffer, every impulse and every curve comes out of the fixed-seed generator in
// src/engine/deterministic, because fiddling is only fun when turning a thing
// reliably causes a thing. SUMMON is the exception the law is written around —
// it is randomness a hand asks for, once, on a press.
//
// Three things about this file are decisions rather than implementation details:
//
// - **It owns no board, no engine and no DOM.** It is one pure function
//   returning plain data, so the whole of what SUMMON decides can be checked
//   without mounting anything. Applying the result is ../app's job, on the same
//   principle as the patch: this file has no more right to push a state into an
//   engine than the board does.
// - **`fed` is not decided here.** Every box comes back unfed, exactly as
//   {@link OPENING_STATE} declares them, because a box's lamp answers the wire
//   list and the caller derives it from there. A summoned state carrying its own
//   idea of which boxes are lit is a lamp that can go stale.
// - **The chain cannot loop, by construction.** A box may only feed a box after
//   it, so a cycle is not rejected — it is unreachable. `canConnect` would catch
//   one; the point is that it never has to.
//
// The ranges below are not arbitrary and two of them are load-bearing: GUITAR
// WALL and BASS are always summoned on so the board never lands near-silent, and
// CAVERN never falls below .2 so the room never fully collapses. The rest is the
// premise the whole button leans on — one root note, no rhythm grid, so no
// result can sound bad.

import type { Wire } from './engine';
import { MODIFIER_IDS, SOURCE_IDS } from './engine/constants';
import type { ModifierId, SourceId } from './engine/constants';
import { MODE_WORDS, OFTEN_WORDS, PACE_WORDS, TUNE_WORDS } from './ui';
import type { BoardState, ModuleState } from './ui';

/** One box's amount range: `floor + r * span`, both ends inside 0…1. */
interface SummonRange {
  readonly floor: number;
  readonly span: number;
}

/**
 * Each box's amount range. Six of the seven take the full sweep; CAVERN alone is
 * floored at .2 so the room never fully collapses.
 *
 * A table rather than the `id === 'cavern'` it replaces (gt#25): the floor is a
 * fact about CAVERN, and a box wanting one of its own declares it here rather
 * than adding a second branch. `satisfies` rather than `as` is the whole
 * guarantee — an assertion would happily accept a table with a box missing, which
 * is the trap this replaced.
 *
 * The three gt#41 added take the full sweep, and MAGNETS is the one worth saying
 * that about out loud. It is the box written around a ceiling, so a summon that
 * lands it at 1 is a summon that hands somebody the top of that control without
 * being asked — which is exactly the case the ceiling exists for. No floor and no
 * cap here, because the constraint belongs in the box and not in the button that
 * happens to reach it.
 */
const MODIFIER_AMOUNTS = {
  grit: { floor: 0, span: 1 },
  murk: { floor: 0, span: 1 },
  wobble: { floor: 0, span: 1 },
  cavern: { floor: 0.2, span: 0.7 },
  doppler: { floor: 0, span: 1 },
  magnets: { floor: 0, span: 1 },
  offset: { floor: 0, span: 1 },
} as const satisfies Record<ModifierId, SummonRange>;

/**
 * Every number SUMMON decides with, and the only place any of them is written
 * down. Transcribed from the `summon()` of the original design's reference
 * board.
 */
export const SUMMON = {
  /** How often a source that *can* be off comes back on. */
  powerChance: 0.55,

  /**
   * The two that are never off. The board is a drone board, and a summon that
   * silences the wall and the floor together is a summon that returns nothing.
   */
  alwaysOn: ['guitar', 'bass'] as readonly SourceId[],

  /** HOW LOUD, `.3 + r * .5`. Never silent, never pinned. */
  loudFloor: 0.3,
  loudSpan: 0.5,

  /** Each box's amount range. See {@link MODIFIER_AMOUNTS}. */
  amounts: MODIFIER_AMOUNTS,

  /** SERIOUSNESS, `.15 + r * .75`. Never wholly silly, never wholly grim. */
  seriousFloor: 0.15,
  seriousSpan: 0.75,

  /**
   * PACE's slowest rung, and the one position a summon will not land on (gt#45).
   *
   * The same treatment SERIOUSNESS gets, said in steps rather than in a fraction,
   * and for the same reason: the ends of a range are worth reaching by hand and
   * are not worth being handed. FUNERAL is 36 beats a minute, which is barely a
   * pulse — deliberate when someone turns the control down to it, and
   * indistinguishable from a broken button when a press drops it there
   * unannounced. The top of the range needs no such guard: a summon that lands on
   * WALKING is a summon that came out fast, which is a result rather than a fault.
   */
  paceFloor: 1,

  /** How often a source is patched into a box at all. */
  wireChance: 0.6,

  /** And how often a box goes on to feed a later box. */
  chainChance: 0.35,
} as const;

/**
 * What one press decides. `woke` is absent because SUMMON has no opinion about
 * it: the lever's state is not part of the sound, and a board summoned before
 * WAKE IT is still a board waiting for the lever.
 */
export interface Summoned {
  readonly state: Omit<BoardState, 'woke'>;
  readonly wires: readonly Wire[];
}

/** A whole number in `0…count-1`, from one draw. */
const step = (random: () => number, count: number): number =>
  Math.min(count - 1, Math.floor(random() * count));

/**
 * Decide everything, in one gesture.
 *
 * `random` is injected rather than reached for so the suite can hold the
 * arithmetic to a scripted sequence and sweep the ranges over a seeded run.
 * Nothing else in the product takes this parameter, and nothing else should.
 */
export function summon(random: () => number = Math.random): Summoned {
  const m = {} as Record<SourceId, ModuleState>;
  for (const id of SOURCE_IDS) {
    m[id] = {
      on: SUMMON.alwaysOn.includes(id) || random() < SUMMON.powerChance,
      loud: SUMMON.loudFloor + random() * SUMMON.loudSpan,
      // THE VOICE's character is a choice between four modes rather than an
      // amount, so it snaps; every other module's is the full sweep.
      char: id === 'voice' ? step(random, MODE_WORDS.length) : random(),
      often: step(random, OFTEN_WORDS.length),
    };
  }

  const g = {
    seriousness: SUMMON.seriousFloor + random() * SUMMON.seriousSpan,
    tuning: step(random, TUNE_WORDS.length),
    // Drawn from the rungs above the floor rather than from all four and then
    // pushed up, so the draw is uniform over what it can return. Clamping a full
    // draw would have made FUNERAL's neighbour twice as likely as the rest.
    pace: SUMMON.paceFloor + step(random, PACE_WORDS.length - SUMMON.paceFloor),
  };

  const mods = {} as Record<ModifierId, { amount: number; fed: boolean }>;
  for (const id of MODIFIER_IDS) {
    const range = SUMMON.amounts[id];
    const amount = range.floor + random() * range.span;
    // Unfed, always: which boxes are lit is the wire list's answer, derived by
    // whoever applies this. See the note at the top of the file.
    mods[id] = { amount, fed: false };
  }

  const wires: Wire[] = [];
  for (const id of SOURCE_IDS) {
    if (random() < SUMMON.wireChance) {
      wires.push({ from: id, to: MODIFIER_IDS[step(random, MODIFIER_IDS.length)] as ModifierId });
    }
  }
  // Forward-only, which is what makes a cycle unreachable rather than refused:
  // box `i` draws its target from the boxes after it, and the last box has none.
  MODIFIER_IDS.forEach((id, i) => {
    const ahead = MODIFIER_IDS.length - 1 - i;
    if (ahead > 0 && random() < SUMMON.chainChance) {
      wires.push({ from: id, to: MODIFIER_IDS[i + 1 + step(random, ahead)] as ModifierId });
    }
  });

  return { state: { g, m, mods }, wires };
}
