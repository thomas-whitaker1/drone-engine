// What the board is painted in.
//
// ./reference is the design handoff, transcribed: every value in it is the
// bundle's and tests/tokens.test.ts holds it there. This file is that palette
// with the grade laid over it (gt#101) — see ./grade for what the grade is, why
// it exists and the numbers to turn.
//
// Everything is re-exported from ./reference as it is, and then the tables
// with material in them are exported again from here, graded. A name declared
// in a module wins over the same name arriving through `export *`, so every
// `import { controls } from '../tokens'` on the board gets the graded table
// without knowing there are two.
//
// The rule for what is listed below, and it is the whole of the design:
// **material is graded, light and lettering are not.** A plate, a knob face, a
// screw and a strip of tape are material. A lamp, a glow, a jack's ring, a
// bloom, a cable, a pointer mark, stencil and bone ink are not, and neither is
// a shadow — nothing here names a shadow, and {@link grade} would leave its
// black alone if something did.

import { GRADE, grade, regrade } from './grade';
import * as reference from './reference';

export * from './reference';
export * from './grade';

/** The big plate. The page behind it is the room, and was already the dark. */
export const surfaces = regrade(reference.surfaces, GRADE.plate, 'boardPlate');

/** Screws, the rivet strip and the wake lever are metal; the wake slab is plate. */
export const plate = regrade(
  regrade(reference.plate, GRADE.metal, 'screw', 'rivetStrip', 'wakeLever'),
  GRADE.plate,
  'wakePlate',
);

export const jack = regrade(reference.jack, GRADE.metal, 'face');

export const toggle = regrade(reference.toggle, GRADE.metal, 'nub');

/** Tape only. Every other ink is something to be read, and stays as bright as it was. */
export const ink = regrade(reference.ink, GRADE.paper, 'tape', 'tapeScrap');

/**
 * The hammer, its anvil, and the steel of COME APART's guard: the things in this
 * table that are not light. The guard's reds are left as they are written — a
 * warning that has been muted is not one.
 */
export const signals = regrade(
  reference.signals,
  GRADE.metal,
  'hammerFace',
  'hammerBand',
  'hammerBolt',
  'hammerHazard',
  'hammerPost',
  'hammerRivets',
  'hammerRam',
  'anvilFace',
  'anvilFoot',
  'apartSeat',
  'apartHinge',
);

/** The bodies of the controls. Pointer marks, gauges and wear tells are left to be seen. */
export const controls = regrade(
  reference.controls,
  GRADE.metal,
  'faceDark',
  'faderCap',
  'leverBar',
  'wheelRim',
  'wheelSpoke',
  'wheelHub',
);

/** A skin with its plate and its control face graded, and its glow and bloom left alone. */
type Skinned<T> = {
  readonly [K in keyof T]: Omit<T[K], 'plate' | 'face'> & { readonly plate: string; readonly face: string };
};

function skinned<T extends Record<string, { readonly plate: string; readonly face: string }>>(table: T): Skinned<T> {
  return Object.fromEntries(
    Object.entries(table).map(([id, skin]) => [
      id,
      { ...skin, plate: grade(skin.plate, GRADE.plate), face: grade(skin.face, GRADE.metal) },
    ]),
  ) as Skinned<T>;
}

/**
 * Every module's skin. The `tint` is the glow a live module throws behind its
 * plate and `bloom` is what a strike flashes; both are light, and both are the
 * reference's.
 */
export const sourcePlates = skinned(reference.sourcePlates);

/**
 * Every chain box's skin — the seven most colourful things on the board, and
 * so where the grade shows most. They are still seven hues, told apart at a
 * glance, which is the job ./reference gives them; they are no longer seven
 * hues from seven different rooms.
 */
export const modifierPlates = skinned(reference.modifierPlates);
