// The grade (gt#101): one colour correction laid over the transcribed palette,
// and the only place its numbers are written down.
//
// The reference paints a board that is brown, and brighter and more colourful
// than the room it is meant to be found in: seven chain boxes in seven hues,
// knob faces in ember and ochre, tape the colour of fresh masking tape. Thomas,
// after the damage passes: "desaturating a little bit and playing with the
// colours [so they] blend together into a darker palette."
//
// So nothing in ./reference moved. Every value there is still the bundle's,
// digit for digit, and tests/tokens.test.ts still holds it there. What the
// board is *painted* in is that palette run through {@link grade} — a material
// at a time, at the strength its material is listed at in {@link GRADE} — and
// tests/grade.test.ts holds every painted value to being exactly that.
//
// Three moves, in this order, on every colour in a string:
//
//   1. **Mute.** Pull the colour toward its own grey. This is the "a little
//      bit": at .8 an ember is still an ember.
//   2. **Blend.** Mix it toward one colour the whole board shares. This is what
//      makes eleven plates and seven boxes read as parts of one machine that
//      has been in one room: they have all picked up the same soot.
//   3. **Dim.** Scale it down.
//
// What is *not* graded is anything that is light rather than material — lamps,
// glows, the rings round a jack, blooms, cables, the hover tips — and anything
// that is lettering. "Things are only going to get darker from here and the
// visibility helps" was said of the jack glow and it is the rule for all of
// them: a darker board is what makes the lit things on it easier to find.
//
// This module imports nothing, so anything in this directory may use it.

/** How hard one material is graded. Each number is 1 for "leave it". */
export interface Grade {
  /** How much of its colour a thing keeps. 1 keeps all of it, 0 is grey. */
  readonly saturation: number;
  /** How far it is mixed toward {@link GRADE.toward}. 0 is not at all. */
  readonly blend: number;
  /** What its brightness is multiplied by, last. */
  readonly light: number;
}

/**
 * The numbers to turn. Change one, reload, look.
 *
 * `toward` is soot: a dark that is very slightly warm, because the dark on this
 * board is brown (see `plate.unlit` in ./reference). It is what the hues
 * converge on, so it is the one value here that changes the board's *colour*
 * rather than how much of it there is.
 */
export const GRADE = {
  toward: [24, 20, 17],
  /** The board, every module plate, every chain box, the wake plate. */
  plate: { saturation: 0.72, blend: 0.1, light: 0.86 },
  /** Knob faces, caps, bars, wheels, screws, jacks, the hammer and its anvil. */
  metal: { saturation: 0.78, blend: 0.12, light: 0.84 },
  /**
   * Tape. Graded less than anything else on the board, because it is what the
   * words are written on: it only has to stop being the brightest thing that
   * is not a lamp.
   */
  paper: { saturation: 0.85, blend: 0.05, light: 0.88 },
  /**
   * Rust and verdigris, in ./damage. The hardest grade here: fresh rust is
   * orange, and it was the most saturated thing on a board whose lamps are
   * amber. Old rust in a dark room is a dull red-brown.
   */
  corrosion: { saturation: 0.68, blend: 0.04, light: 0.96 },
} as const;

/** Leaves a colour exactly as it is. What a test grades with to prove that. */
export const NEUTRAL: Grade = { saturation: 1, blend: 0, light: 1 };

type Rgb = readonly [number, number, number];

/** Every colour CSS can spell that this board's tokens actually use. */
const COLOUR = /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|rgba?\([^)]*\)/gi;

/** The three channels of an `rgb()`/`rgba()` body, and everything after them. */
const CHANNELS = /^(\s*)(\d+)(\s*,\s*)(\d+)(\s*,\s*)(\d+)([\s\S]*)$/;

/**
 * One colour, graded.
 *
 * Black is returned as it is. Mixing black toward soot would *lighten* it, and
 * black in these tokens is always a shadow or the cut of a groove — the one
 * thing a darker board must not get paler.
 *
 * The same rule holds a channel at a time for everything else: soot only ever
 * darkens. A jack's hole and a pit in a patch of rust are already darker than
 * the soot is, and mixed toward it they came out a shade *up* — which the suite
 * caught before an eye did.
 */
export function tone(rgb: Rgb, by: Grade, toward: Rgb = GRADE.toward): Rgb {
  if (rgb[0] + rgb[1] + rgb[2] === 0) return rgb;
  const grey = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  const channel = (value: number, soot: number): number => {
    const muted = grey + (value - grey) * by.saturation;
    const blended = Math.min(muted, muted + (soot - muted) * by.blend);
    return Math.max(0, Math.min(255, Math.round(blended * by.light)));
  };
  return [channel(rgb[0], toward[0]), channel(rgb[1], toward[1]), channel(rgb[2], toward[2])];
}

const hex = (value: number): string => value.toString(16).padStart(2, '0');

/**
 * A CSS value with every colour in it graded, and nothing else in it touched:
 * angles, stops, lengths and alphas come back character for character.
 *
 * A hex colour comes back as six lower-case digits. An `rgb()` or `rgba()` keeps
 * its own spacing and its own alpha, and one whose alpha is zero is left alone
 * entirely — it paints nothing, and it is usually the far end of a fade whose
 * near end is being graded beside it.
 */
export function grade(css: string, by: Grade, toward: Rgb = GRADE.toward): string {
  return css.replace(COLOUR, (colour) => {
    if (colour.startsWith('#')) {
      const digits = colour.slice(1);
      const full = digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits;
      const [r, g, b] = tone(
        [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)],
        by,
        toward,
      );
      return `#${hex(r)}${hex(g)}${hex(b)}`;
    }
    const open = colour.indexOf('(');
    const parts = CHANNELS.exec(colour.slice(open + 1, -1));
    if (!parts) return colour;
    const [, lead = '', r, gap = ',', g, gap2 = ',', b, rest = ''] = parts;
    if (/^\s*,\s*0(\.0*)?\s*$/.test(rest)) return colour;
    const [nr, ng, nb] = tone([Number(r), Number(g), Number(b)], by, toward);
    return `${colour.slice(0, open + 1)}${lead}${nr}${gap}${ng}${gap2}${nb}${rest})`;
  });
}

/**
 * A colour as the light it would throw (gt#104): the same hue, scaled until its
 * brightest channel is full, and no alpha.
 *
 * The opposite direction from everything else in this file, and here for the
 * same reason — it is colour arithmetic, and this is where the board's lives.
 * A module's `tint` is the glow it bleeds behind its plate, written dim and at
 * part strength because it is laid on as a wash. The mark that lights for that
 * module on the seal is a line a pixel wide; in the tint's own values it would
 * be a brown smudge. Scaled up it is that module's colour, as a lamp.
 *
 * The first colour in the string is the one taken. Black has no hue to keep and
 * comes back as it is.
 */
export function glare(css: string): string {
  const colour = COLOUR.exec(css)?.[0];
  COLOUR.lastIndex = 0;
  if (!colour) return css;
  let rgb: Rgb;
  if (colour.startsWith('#')) {
    const digits = colour.slice(1);
    const full = digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits;
    rgb = [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
  } else {
    const parts = CHANNELS.exec(colour.slice(colour.indexOf('(') + 1, -1));
    if (!parts) return css;
    rgb = [Number(parts[2]), Number(parts[4]), Number(parts[6])];
  }
  const top = Math.max(...rgb);
  if (top === 0) return 'rgb(0,0,0)';
  const [r, g, b] = rgb.map((value) => Math.round((value / top) * 255));
  return `rgb(${r},${g},${b})`;
}

/** `table` with the named keys graded, and typed as no longer the reference's literals. */
export function regrade<T extends object, K extends keyof T>(
  table: T,
  by: Grade,
  ...keys: readonly K[]
): Omit<T, K> & { readonly [P in K]: string } {
  const out = { ...table } as Record<PropertyKey, unknown>;
  for (const key of keys) out[key] = grade(String(table[key]), by);
  return out as Omit<T, K> & { readonly [P in K]: string };
}
