// What the ear-tuning pass (gt#20) decided, as properties rather than as numbers.
//
// The transcription suites still pin every coefficient the pass left alone to
// the original design's engine. The values the pass moved are not pinned there
// at all — each is a comment recording what the original was — so the spine is
// not held to a number someone deliberately changed. That leaves a gap: nothing
// would notice if a later edit quietly undid the reasons those numbers moved.
//
// So this file asserts the reasons. Not "SAX.maxGain is .62" — that is the
// constant restating itself — but "SAX is no longer the quietest voice on the
// board", which is the thing that was actually listened for and agreed.

import { describe, expect, it } from 'vitest';
import {
  ACCENTS,
  CYMBAL,
  GRIT,
  LASER,
  MARACAS,
  SAX,
  SLOWHIT,
  SOURCE_IDS,
  BASS,
  CHAINSAW,
  COW,
  GUITAR,
  THROAT,
  VOICE,
} from '../src/engine/constants';
import { curveKey, shaperCurve } from '../src/engine/deterministic';

/** Every module's ceiling, by id, in board order. */
const CEILINGS: Record<string, number> = {
  guitar: GUITAR.maxGain,
  bass: BASS.maxGain,
  chainsaw: CHAINSAW.maxGain,
  sax: SAX.maxGain,
  slowhit: SLOWHIT.maxGain,
  cymbal: CYMBAL.maxGain,
  voice: VOICE.maxGain,
  maracas: MARACAS.maxGain,
  cow: COW.maxGain,
  throat: THROAT.maxGain,
  laser: LASER.maxGain,
};

describe('the balance of ceilings', () => {
  it('covers every source, so a tenth module cannot skip the check', () => {
    expect(Object.keys(CEILINGS).sort()).toEqual([...SOURCE_IDS].sort());
  });

  it('leaves SLOW HIT the loudest thing on the board', () => {
    // Checked by ear with the whole board live: nothing bullies it, and the
    // strike that is meant to shake the room is the one that does. LASER CANNON
    // is the closest challenger gt#42 added and is deliberately kept under —
    // a discharge is already the longest event on the board, and letting it be
    // the loudest as well would make it the only thing anyone hears.
    //
    // What this holds is the *ceiling*, and for a discharge the ceiling is not
    // the whole story (gt#65). Measured on a render, alone at full: a discharge
    // peaks 4.8dB over a SLOW HIT, because its sub-octave square and its
    // flange both add to what `maxGain` scales. Everywhere below
    // `LASER.dischargeAt` the cannon is under the hit, as intended. Left as it
    // sounds, on Thomas's say; `LASER.discharge.peak` is the one number to
    // turn (about .55 puts a discharge level with the hit).
    const others = SOURCE_IDS.filter((id) => id !== 'slowhit').map((id) => CEILINGS[id] as number);

    expect(Math.max(...others)).toBeLessThan(SLOWHIT.maxGain);
  });

  it('keeps SAX off the floor of the mix', () => {
    // The finding that opened the pass: at the reference .38 the sax vanished
    // under a full board. It is the narrowest voice here — a square through two
    // bandpass formants — so it reads quieter than its peak amplitude suggests
    // and cannot be the lowest ceiling and still be heard.
    const others = SOURCE_IDS.filter((id) => id !== 'sax').map((id) => CEILINGS[id] as number);

    expect(SAX.maxGain).toBeGreaterThan(Math.min(...others));
  });
});

// The second pass (gt#65), for the two modules with no reference to tune against.
// Same rule as above: the reason, not the number.
describe('WHISTLE moves the balance rather than the level', () => {
  const body = (v: number) => THROAT.bodyFloor - v * THROAT.bodySpan;
  const whistle = (v: number) => THROAT.whistleFloor + v * THROAT.whistleSpan;
  const db = (ratio: number) => 20 * Math.log10(ratio);

  it('keeps the buzz within a decibel and a half across the knob', () => {
    // The buzz carries nearly all of THROAT's level. When it was halved across
    // the knob the whole module came out 6 LU quieter at the top, measured, and
    // the control read as a volume knob. It still gives way, a little.
    expect(body(1)).toBeLessThan(body(0));
    expect(db(body(1) / body(0))).toBeGreaterThan(-1.5);
  });

  it('still hands the sound over from the buzz to the overtone', () => {
    // The gesture the duck was there for, kept: the whistle stands at least as
    // far over the buzz at the top as it did when the buzz was doing the moving.
    const before = (0.5 + 0.85) / (0.9 - 0.45) / (0.5 / 0.9);
    const now = whistle(1) / body(1) / (whistle(0) / body(0));

    expect(now).toBeGreaterThanOrEqual(before);
  });

  it('turns the whistle up at least as fast as a sawtooth turns it down', () => {
    // Harmonic n of a saw is 1/n the size of the first, so from the third to
    // the twelfth the thing being picked out shrinks fourfold. A whistle that
    // did not gain at least that much would fade as it climbed.
    const fall = (THROAT.harmonicFloor + THROAT.harmonicSpan) / THROAT.harmonicFloor;

    expect(whistle(1) / whistle(0)).toBeGreaterThanOrEqual(fall);
  });
});

describe('GRIT adds dirt rather than level', () => {
  /** The curve amount the box reaches at a given knob position. */
  const amountAt = (knob: number) => GRIT.curveFloor + knob * GRIT.curveSpan;

  it('stays bounded to unity at every drive the box can reach', () => {
    // This is why widening the curve span was the right lever and raising the
    // pre-gain was not: `(1 + d)x / (1 + d|x|)` maps ±1 to ±1 for any drive, so
    // a harder curve clips more of the waveform and peaks no higher. If this
    // ever fails, turning GRIT up has started making the board louder by a
    // route the post-gain compensation does not know about.
    for (let knob = 0; knob <= 1; knob += 0.05) {
      const curve = shaperCurve(amountAt(knob));
      const peak = Math.max(...Array.from(curve, Math.abs));

      expect(peak).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('drives the shaper harder across the sweep than the reference did', () => {
    // The reference span was .9, so the box topped out at a curve amount of 1.
    // The pass widened it because the top read as dirtier than the middle, but
    // not by enough.
    const reference = curveKey(GRIT.curveFloor + 0.9);

    expect(curveKey(amountAt(1))).toBeGreaterThan(reference);
  });

  it('still rises monotonically, so the knob never doubles back', () => {
    const keys = Array.from({ length: 21 }, (_, step) => curveKey(amountAt(step / 20)));

    expect(keys).toEqual([...keys].sort((a, b) => a - b));
  });
});

describe('the rattle has a shape', () => {
  /** A full burst is ten hits, so only the first ten entries are ever reached. */
  const REACHABLE = MARACAS.hitsFloor + MARACAS.hitsSpan;
  const burst = ACCENTS.slice(0, REACHABLE);

  /** Where the pass put the accents: every third hit. */
  const ACCENTED = [0, 3, 6, 9];

  it('never indexes past its own table', () => {
    expect(REACHABLE).toBe(10);
    expect(REACHABLE).toBeLessThanOrEqual(ACCENTS.length);
  });

  it('accents every third hit, so the burst has a pulse inside it', () => {
    // The reference alternated loud and soft with no grouping, which at ten
    // hits inside half a bar read as one flat texture.
    for (const index of ACCENTED) {
      for (const neighbour of [index - 2, index - 1, index + 1, index + 2]) {
        if (neighbour < 0 || neighbour >= REACHABLE || ACCENTED.includes(neighbour)) continue;
        expect(burst[index] as number).toBeGreaterThan(burst[neighbour] as number);
      }
    }
  });

  it('falls across the burst, so it lands and decays', () => {
    const peaks = ACCENTED.map((index) => burst[index] as number);

    expect(peaks).toEqual([...peaks].sort((a, b) => b - a));
    expect(new Set(peaks).size).toBe(peaks.length);
  });

  it('spreads far enough that an accent reads as one', () => {
    // The reference range was 2:1. Ghost notes have to drop further than that
    // or the accented hits do not stand out from them.
    expect(Math.max(...burst) / Math.min(...burst)).toBeGreaterThanOrEqual(3);
  });

  it('opens on a full-strength hit, which is the whole of a FRENZY-at-zero burst', () => {
    // At the bottom of the knob the burst is a single hit, and it earns its
    // place as a sparse accent — so the table's first entry is not a ghost.
    expect(ACCENTS[0]).toBe(Math.max(...burst));
  });
});
