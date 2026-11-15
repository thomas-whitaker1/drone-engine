// The seven boxes of THE CHAIN as content rather than as code, the same way
// ./modules holds the nine sources.
//
// A definition says only what is true of that box and of no other: which word it
// is painted with and which of the control kinds its one amount is set by.
// Everything else is looked up — appearance is `modifierPlates[id]` in
// src/tokens, language is ./words, and the order the boxes run in is
// `MODIFIER_IDS` in the engine's constants, which is the same list the engine
// builds and routes the chain from. A box cannot appear in the rack in an
// order the signal does not actually take.
//
// Issue gt#25 folded the engine's build functions and the default amounts into a
// registry beside this one; this file is the UI half, and deliberately no more
// than that. gt#41 then added three boxes through both halves at once, which is
// what the pair was built for.

import { CONTROLS, type Word } from './words';
import { MODIFIER_IDS, type ModifierId } from '../engine/constants';
import type { ControlKind } from './control';

export interface ModifierDef {
  readonly id: ModifierId;
  /**
   * The box's vocabulary entry. One word does both jobs here — it is painted
   * beside the lamp *and* on the control's tape strip — because a box has one
   * amount, so there is nothing else the label could usefully say.
   */
  readonly word: Word;
  /** Which kind of control sets this box's amount. */
  readonly kind: ControlKind;
  /** Round kinds are cut to a diameter; the fader and the lever take a height instead. */
  readonly diameter?: number;
  readonly height?: number;
}

/**
 * All seven, keyed by id. The kinds are not decoration: MURK is the one amount
 * that reads as a level rather than a setting, so it gets the same fader HOW
 * LOUD uses, and WOBBLE is a wheel because a thing that wanders has no stop.
 *
 * GRIT is a lever, and it is the change gt#34 asked for: two identical knobs on a
 * four-box chain was most of why a board described as salvage read as a plugin.
 * GRIT earned the throw bar rather than drawing lots for it — it is the one
 * amount that leaves the audio graph, since the grain and both chromatic edges
 * are driven off `--grit`, so it is the box that visibly does something to the
 * room. That is a thing you throw a lever for.
 *
 * The three gt#41 added take their kinds by the same argument, from what the
 * control *means* rather than from what is left over:
 *
 * - **DOPPLER is a knob**, because its amount is a rate and a rate is a setting.
 *   It is not a wheel: a wheel is for a thing with no stop, and how fast
 *   something goes past you has both ends.
 * - **MAGNETS is a lever.** The control asks how hard something is pulling and a
 *   lever is the one thing on this board you pull. It is the second lever on the
 *   rack rather than the only one, which is a cost worth paying for a word that
 *   literal.
 * - **OFFSET is a fader**, on MURK's argument: how far behind it drags is a
 *   distance, and a distance reads as travel rather than as a position on a dial.
 *
 * Seven boxes across four kinds means two of them appear twice, and there is no
 * way around that until gt#50 builds more. The repeats are deliberate pairs rather
 * than accidents — the two levers are the two boxes that manhandle the signal,
 * the two faders the two that measure something out — so a hand that has learned
 * one has learned something true about the other.
 */
export const MODIFIER_DEFS: Record<ModifierId, ModifierDef> = {
  grit: { id: 'grit', word: CONTROLS.grit, kind: 'lever', height: 64 },
  murk: { id: 'murk', word: CONTROLS.murk, kind: 'fader', height: 64 },
  wobble: { id: 'wobble', word: CONTROLS.wobble, kind: 'wheel', diameter: 54 },
  cavern: { id: 'cavern', word: CONTROLS.cavern, kind: 'knob', diameter: 54 },
  doppler: { id: 'doppler', word: CONTROLS.doppler, kind: 'knob', diameter: 54 },
  magnets: { id: 'magnets', word: CONTROLS.magnets, kind: 'lever', height: 64 },
  offset: { id: 'offset', word: CONTROLS.offset, kind: 'fader', height: 64 },
};

/** The seven definitions in the order the chain is laid out and routed. */
export const modifierDefs = (): ModifierDef[] => MODIFIER_IDS.map((id) => MODIFIER_DEFS[id]);
