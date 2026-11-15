// The eleven source modules as content rather than as code — the brief's "build
// them data-driven so modules are content, not code", taken at its word.
//
// A definition says only what is true of that module and of no other: which well
// it sits in, whether it drones or strikes, and which word its character control
// is painted with. Everything else is looked up rather than repeated:
//
// - **Appearance** — plate gradient, ambient tint, control face, rust ceiling —
//   is `sourcePlates[id]` in src/tokens, which owns every colour on the board.
// - **Language** — the plate's name and the character word, with its hover line
//   attached — is ./words, which owns every string the board says. A definition
//   points at a vocabulary entry rather than carrying a literal, so a module
//   cannot be given a word the vocabulary has never heard of.
// - **Archetype** is `STRIKE_IDS` in the engine's constants, so the thing that
//   decides whether a module gets a HOW OFTEN selector is the same list that
//   decides whether the scheduler fires it. They cannot drift apart.
//
// What is left is the differences a reader would have to be told anyway.
// Issue gt#24 folds the engine's build functions into these entries; this file is
// the UI half of that registry arriving first.

import { CONTROLS, MODE_WORDS, SOURCE_NAMES, type Word } from './words';
import { STRIKE_IDS, SOURCE_IDS, type SourceId } from '../engine/constants';
import type { ZoneId } from '../tokens';
import type { ControlKind } from './control';

/** The four wells a source can sit in. THE FOG and THE CHAIN hold no modules. */
export type SourceZone = Extract<ZoneId, 'pulse' | 'voice' | 'junk' | 'foundation'>;

/** A drone sustains for as long as it is on; a strike fires against the heartbeat. */
export type SourceType = 'drone' | 'strike';

export interface SourceDef {
  readonly id: SourceId;
  /** Painted across the top of the plate. */
  readonly name: string;
  readonly zone: SourceZone;
  readonly type: SourceType;
  /**
   * The character control's vocabulary entry — the module's dominant gesture,
   * and the line it says on hover. Every one of the nine has a tip.
   */
  readonly char: Word;
  /**
   * Present only where character is a choice rather than an amount, which is
   * THE VOICE alone: its MODE selector steps through these four words.
   */
  readonly charWords?: readonly string[];
  /**
   * This plate takes the whole width of its well, rather than one cell of it
   * (gt#75). True of LASER CANNON alone.
   *
   * It is a fact about the module rather than about the well, which is why it is
   * here and not a special case in the board: the drawer is a grid that seats
   * whatever is in it, and the one thing in it that is twice as wide says so
   * itself. tests/module.test.ts holds the consequence that matters — a well
   * with a wide plate in it must have no cell left over beside anything.
   */
  readonly wide?: boolean;
  /**
   * What this module's controls are *made of*, where it is not the usual (gt#51).
   *
   * Every source used to be cut from one set of parts — a knob for its
   * character, a selector for HOW OFTEN — decided by role inside ./module, so
   * eleven plates salvaged from eleven machines all happened to share a parts
   * bin. A chain box has named its own hardware since gt#34 (`kind` in
   * ./modifiers); this is the same for a source, and for the same reason: which
   * part a module carries is a fact about that module, and belongs with the
   * rest of what is true of it and of no other.
   *
   * Only where it differs. A module that says nothing gets a knob (or, with
   * `charWords`, a selector) and a HOW OFTEN selector, exactly as before.
   *
   * HOW LOUD is not here on purpose. It is a fader on every plate because the
   * gauge cut beside it (gt#90) is a fader's, and its variety is in the gauge.
   */
  readonly hardware?: SourceHardware;
}

/** The control kinds a module may ask for, by which of its controls they are for. */
export interface SourceHardware {
  /**
   * The character control. An amount takes a knob, a lever, a wheel or a
   * fader; a choice (`charWords`) takes a selector, a lever or a toggle bank.
   */
  readonly char?: ControlKind;
  /** HOW OFTEN, on a strike: a selector, a lever or a toggle bank. */
  readonly often?: Extract<ControlKind, 'selector' | 'lever' | 'toggles'>;
}

const isStrike = (id: SourceId): boolean => (STRIKE_IDS as readonly SourceId[]).includes(id);

const define = (
  id: SourceId,
  zone: SourceZone,
  char: Word,
  charWords?: readonly string[],
): SourceDef => ({
  id,
  name: SOURCE_NAMES[id],
  zone,
  type: isStrike(id) ? 'strike' : 'drone',
  char,
  ...(charWords ? { charWords } : {}),
});

/**
 * All eleven, keyed by id and iterated in the order the engine builds them. The
 * board reads a zone's contents by filtering this on `zone`, which is why no
 * second ordering is written down anywhere.
 */
export const SOURCE_DEFS: Record<SourceId, SourceDef> = {
  guitar: define('guitar', 'foundation', CONTROLS.crowd),
  bass: { ...define('bass', 'foundation', CONTROLS.heft), hardware: { char: 'lever' } },
  chainsaw: { ...define('chainsaw', 'junk', CONTROLS.revs), hardware: { char: 'wheel' } },
  sax: define('sax', 'junk', CONTROLS.agony),
  // Under THE VOICE rather than in the drawer (gt#42). It is a throat, the well is
  // called THE VOICE, and the two are the only modules on the board that make a
  // sound a person could make — putting the second one anywhere else would have
  // been filing by convenience instead of by what it is.
  throat: define('throat', 'voice', CONTROLS.whistle),
  slowhit: { ...define('slowhit', 'pulse', CONTROLS.weight), hardware: { often: 'lever' } },
  cymbal: define('cymbal', 'pulse', CONTROLS.hiss),
  voice: define('voice', 'voice', CONTROLS.mode, MODE_WORDS),
  maracas: { ...define('maracas', 'junk', CONTROLS.frenzy), hardware: { often: 'toggles' } },
  cow: define('cow', 'junk', CONTROLS.despair),
  // And the cannon in the drawer, which takes it from four modules to five. It
  // used to start a third row of the two-column grid and leave the cell beside
  // it empty, on the argument that an odd number in the junk pile was an
  // improvement (gt#42). Looked at on the board it was a hole: a blank 254 by 179
  // in the busiest well, and a row whose height left dead floor under THE PULSE
  // and THE VOICE on the other side of the plate. So it lies across the whole
  // drawer instead (gt#75) — still the odd one out, which is the part of that
  // argument worth keeping, and now twice the width of anything around it, which
  // is what "not from around here" looks like when it is hardware.
  laser: {
    ...define('laser', 'junk', CONTROLS.charge),
    wide: true,
    hardware: { char: 'lever', often: 'toggles' },
  },
};

/** Every definition in build order. */
export const sourceDefs = (): SourceDef[] => SOURCE_IDS.map((id) => SOURCE_DEFS[id]);

/** The definitions belonging to one well, in build order. */
export const zoneDefs = (zone: SourceZone): SourceDef[] =>
  sourceDefs().filter((def) => def.zone === zone);
