// The board's injuries, drawn rather than filtered.
//
// Everything here used to be `feTurbulence`, and the diagnosis that replaced it
// is short: **feTurbulence makes clouds.** Anisotropic turbulence is a *smeared*
// cloud, not a scratch — a scratch is a line, with a start, an end, and a bright
// side next to a dark one. Rust is not a cloud either: it is bloom around a
// fixing point, a run bleeding down from a seam, a bite along an exposed edge.
// Layering brown fog at a low alpha gets you a board that reads as slightly
// hazier as the session goes on, which is not the same thing as a board that
// reads as damaged. See gt#35.
//
// gt#99 put noise back, and the paragraph above is why it could: as *texture* on
// those drawn marks, never as the marks. Geometry alone turned out to be the
// opposite failure — thirty ruled lines and nine smooth blots, which read as
// placeholders for damage. So each tile is still drawn, by kind and in layers
// (see `scratchField` and `bloomField`), and then roughened by a filter that
// tears the drawn edges and knocks grain through the drawn fills — see `worn`.
// The noise is never painted, and the suite holds it to that.
//
// So the marks are generated as geometry, and four decisions hold the file up:
//
// - **Same generator as the audio.** The lines and blooms come out of the
//   Park–Miller LCG in ../engine/deterministic — reached through ./geometry,
//   which is where the seeded stream and the data-URI wrappers moved once
//   ./sigils needed them too — and that is where every noise buffer and reverb
//   impulse comes from. Nothing here is randomised at runtime:
//   the tiles are baked once at module load from fixed seeds and are
//   byte-identical on every load, because a board that redecorated itself each
//   session would be the product fiddling behind the user's back.
// - **Rust is placed, not spread.** The tile is only the material. Where it is
//   allowed to show is a mask — plate edges and screw heads, the places water
//   actually sits — and the runs hang off seams. A wash over the whole plate is
//   the thing this file exists to stop doing.
// - **Nothing leaves the page.** Every mark is an inline data URI, same rule as
//   the tiles it replaces and same rule as gt#23. No image assets.
// - **These strings are not transcribed from the design bundle**, which is why
//   they live in their own module rather than in ./index: the handoff's README
//   says of the three turbulence tiles "reproduce or swap for equivalent
//   assets", and this is the swap. tests/tokens.test.ts exempts exactly what is
//   reachable from here, and tests/damage.test.ts holds it to its own standard
//   instead — determinism first.
//
// The film grain is deliberately *not* here. Grain genuinely is noise, so a
// noise filter is the right tool for it, and it stays in ./index as the one tile
// still transcribed from the reference.

import { draws, n, tile } from './geometry';
import type { Draw } from './geometry';
import { GRADE, grade } from './grade';

// --------------------------------------------------------------------- tiling

/** What a mark occupies, which is all the tiler needs to know about it. */
interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

/**
 * Where else a mark has to be drawn for the tile to meet itself. A mark running
 * off one edge comes back on the opposite one — the whole point of generating
 * geometry instead of filtering noise is lost the moment an eye can find the
 * repeat, and a hard-edged line makes a seam far easier to find than a cloud
 * ever did.
 */
function wraps(bounds: Bounds, width: number, height: number): ReadonlyArray<readonly [number, number]> {
  const dx = bounds.minX < 0 ? width : bounds.maxX > width ? -width : 0;
  const dy = bounds.minY < 0 ? height : bounds.maxY > height ? -height : 0;
  const offsets: Array<readonly [number, number]> = [[0, 0]];
  if (dx) offsets.push([dx, 0]);
  if (dy) offsets.push([0, dy]);
  if (dx && dy) offsets.push([dx, dy]);
  return offsets;
}

/** One mark, emitted once where it was drawn and once per edge it runs off. */
const repeated = (markup: string, offsets: ReadonlyArray<readonly [number, number]>): string =>
  offsets
    .map(([dx, dy]) => (dx || dy ? `<g transform='translate(${n(dx)} ${n(dy)})'>${markup}</g>` : markup))
    .join('');

// --------------------------------------------------------------------- pigments

/**
 * A corrosion colour as it is on this board (gt#101): the colour it was found
 * as, run through the board's grade at the strength corrosion is listed at.
 *
 * Fresh rust is orange, and that is what these pigments were — the brightest,
 * most saturated thing on a board whose lamps are amber, so every patch of it
 * read as a small light. Rust that has sat in a dark room for years is a dull
 * red-brown a little darker than the dirt round it. Written this way rather
 * than as ten new numbers so the five colours of a patch keep their distances
 * from each other, and so it is turned in the same place as everything else:
 * `GRADE.corrosion` in ./grade.
 */
function aged(colour: string): string {
  return grade(colour, GRADE.corrosion);
}

/**
 * What the board is made of where it has failed. The rust is the colour the old
 * `feColorMatrix` resolved to, so the palette does not move — only the shape it
 * arrives in. Verdigris gets a real green rather than the rust hue rotated 95°,
 * which is what made it read as the same cloud in a third hat.
 *
 * That green was SUMMON's dome, lifted from it while the dome was still on the
 * board. gt#40 has since swapped the dome for a hammer and the value no longer has
 * anything to be a transcription *of* — so it is written out in full here, which
 * is where it always meant something anyway. Corrosion is the one thing on this
 * board still entitled to be green: it is what metal does when it is left alone,
 * and a tool somebody keeps picking up is the opposite of left alone.
 *
 * Both are now written as the colour they were and then aged (gt#101) — see
 * {@link aged}. The first number is still the one the old filter resolved to;
 * what reaches the tile is that, muted and darkened with the rest of the board.
 */
export const PIGMENTS = {
  rust: aged('rgb(107,59,26)'),
  verdigris: aged('rgb(94,138,114)'),
  /** A scratch is two strokes: bone on the lit side, tar on the other. */
  scratchLit: 'rgb(216,205,180)',
  scratchDark: 'rgb(10,8,6)',
} as const;

/**
 * What one corrosion is made of, layer by layer (gt#99). A patch of rust is not
 * one brown: it is a stain in the metal, a crust standing on the stain, bright
 * scale where the crust has lifted, and pits and flecks through all of it.
 * Five colours a material, so that the thing has grain instead of an edge.
 */
export interface Corrosion {
  /** The discolouration round the patch. The colour the tile used to be all of. */
  readonly stain: string;
  /** The crust itself: darker, and what the broken edge is cut in. */
  readonly crust: string;
  /** Scale that has lifted and caught the light. */
  readonly bright: string;
  /** Pits, eaten through to something darker. */
  readonly pit: string;
  /** Flecks of fresh corrosion, the brightest thing in the patch. */
  readonly fleck: string;
}

export const CORROSION: Readonly<Record<'rust' | 'verdigris', Corrosion>> = {
  rust: {
    stain: PIGMENTS.rust,
    crust: aged('rgb(62,31,13)'),
    bright: aged('rgb(170,92,34)'),
    pit: aged('rgb(22,12,6)'),
    fleck: aged('rgb(214,132,52)'),
  },
  // Copper salts: a dull green stain, a darker crust, and the pale bloom that
  // sits on top of both. Never the rust set with the hue turned.
  verdigris: {
    stain: PIGMENTS.verdigris,
    crust: aged('rgb(48,88,74)'),
    bright: aged('rgb(138,184,158)'),
    pit: aged('rgb(22,40,35)'),
    fleck: aged('rgb(198,226,208)'),
  },
};

/**
 * Many dots as one path (gt#99): each a stroke so short it is only its two round
 * caps. Speckle is the whole of what gives corrosion its grain and there are
 * hundreds of them to a tile; as elements they would be most of the stylesheet.
 * As subpaths of one path a dot costs a dozen characters.
 *
 * Not quite zero long. A zero-length subpath is meant to draw its caps and one
 * engine or another has always declined to.
 */
const dots = (
  points: ReadonlyArray<readonly [number, number]>,
  colour: string,
  alpha: number,
  width: number,
): string =>
  points.length
    ? `<path d='${points.map(([x, y]) => `M${n(x)},${n(y)}h.1`).join('')}' fill='none' ` +
      `stroke='${colour}' stroke-opacity='${alpha.toFixed(2)}' stroke-width='${n(width)}' ` +
      `stroke-linecap='round'/>`
    : '';

/** A point brought back onto the tile, for marks too small to need drawing twice. */
const onTile = (value: number, size: number): number => ((value % size) + size) % size;

/** How one tile's drawn marks are roughened. See {@link worn}. */
export interface Wear {
  /** How coarse the tearing is, and how far it pushes an edge, in pixels. */
  readonly warp: number;
  readonly tear: number;
  /** How fine the grain is, and how much of a mark it eats: 0 is none, 1 is most of it. */
  readonly grain: number;
  readonly bite: number;
}

/**
 * A part of a drawing to run the wear over, in the drawing's own coordinates
 * (gt#106) — for something that is one picture rather than a repeating tile.
 *
 * Given one, the noise is left unstitched, and that is the point of it rather
 * than a side effect. Stitched noise is bent to repeat across whatever area
 * the filter covers, so the same spot is roughened differently depending on
 * how big an area it is in. Unstitched, the noise at a point depends on the
 * point and the seed and nothing else — so a small patch cut out of a large
 * drawing is torn and eaten *exactly* as that spot is in the whole. The seal
 * is worn whole; each of its marks is drawn again, alone, to glow; and the
 * two have to break in the same places.
 */
export interface Patch {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The texture (gt#99): a filter that takes what was *drawn* and roughens it.
 *
 * Two things, both to the marks and neither on its own. The edges are torn — a
 * coarse noise pushes each one a few pixels this way and that, so a curve this
 * file drew with a ruler stops looking drawn. And the fill is eaten — a fine
 * noise knocks holes through it, so a patch has grain and a line has skips.
 *
 * This is noise, in a file whose first sentence is that the marks are drawn
 * rather than filtered, and the difference is the whole of gt#35's diagnosis
 * kept: *turbulence makes clouds* when turbulence is the mark. Here it is never
 * the mark. Geometry decides where every scratch and every patch of rust is,
 * how long, how big, which way it leans; the noise only ever appears as
 * something done **to** that geometry — the second input of a displacement, and
 * a mask the drawing is cut `in` to. Take the geometry away and this filter
 * draws nothing at all, which is the test the suite holds it to.
 *
 * `stitchTiles` and a filter region of exactly one tile are what keep the
 * repeat hidden. A mark that runs off an edge is drawn again on the opposite
 * one, and the two halves only meet if they are torn identically; stitched
 * noise repeats every tile, so they are.
 */
export const worn = (id: string, seed: number, size: number, wear: Wear, patch?: Patch): string => {
  const alpha = `0 0 0 ${n(-wear.bite * 4)} ${n(1 + wear.bite * 1.6)}`;
  // A patch is not a tile: it does not repeat, so it has no seam to hide, and
  // stitching is exactly what it must not have. See {@link Patch}.
  const stitch = patch ? 'noStitch' : 'stitch';
  const area = patch ?? { x: 0, y: 0, width: size, height: size };
  return (
    `<filter id='${id}' filterUnits='userSpaceOnUse' x='${n(area.x)}' y='${n(area.y)}' ` +
    `width='${n(area.width)}' height='${n(area.height)}'>` +
    `<feTurbulence type='fractalNoise' baseFrequency='${wear.warp}' numOctaves='2' seed='${seed}' ` +
    `stitchTiles='${stitch}' result='warp'/>` +
    `<feDisplacementMap in='SourceGraphic' in2='warp' scale='${n(wear.tear)}' ` +
    `xChannelSelector='R' yChannelSelector='G' result='torn'/>` +
    `<feTurbulence type='fractalNoise' baseFrequency='${wear.grain}' numOctaves='2' seed='${seed + 1}' ` +
    `stitchTiles='${stitch}' result='grain'/>` +
    `<feColorMatrix in='grain' type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${alpha}' result='holes'/>` +
    `<feComposite in='torn' in2='holes' operator='in'/>` +
    `</filter>`
  );
};

// -------------------------------------------------------------------- scratches

export interface ScratchSpec {
  readonly size: number;
  readonly count: number;
  readonly seed: number;
  /** Degrees off horizontal the hand dragged, and how far one mark strays from it. */
  readonly lean: number;
  readonly stray: number;
  /** How often a mark ignores the lean and crosses everything else. */
  readonly crossOdds: number;
  readonly minLength: number;
  readonly maxLength: number;
  /**
   * Lengths come out as `pow(unit, bias)` across the range, so most marks are
   * short and a few are long. An even spread reads as hatching.
   */
  readonly bias: number;
  readonly minWidth: number;
  readonly maxWidth: number;
  /** Alpha of the lit stroke at its brightest, and the dark stroke's share of it. */
  readonly lit: number;
  readonly dark: number;
  /**
   * What kind of mark each one is (gt#99). A share are gouges — one deep cut that
   * digs in and tapers out. A share are scuffs — a patch rubbed dull. The rest
   * are drags: a few fine lines side by side, where grit went along under
   * something.
   */
  readonly gougeOdds: number;
  readonly scuffOdds: number;
  /** How far a mark bows off straight, as a share of its length. A hand moves in an arc. */
  readonly bow: number;
  /** How many small dings the tile carries beside its scratches. */
  readonly pits: number;
  /** How the drawn marks are roughened. */
  readonly wear: Wear;
}

/** One mark's place and direction, worked out once and handed to whichever kind draws it. */
interface Stroke {
  readonly x: number;
  readonly y: number;
  /** Unit vector along the mark. */
  readonly ux: number;
  readonly uy: number;
  /** Unit vector across it, on the side the light comes from. */
  readonly nx: number;
  readonly ny: number;
  readonly length: number;
  readonly lit: number;
}

/**
 * A gouge: one cut, deepest a third of the way along and tapering to nothing at
 * both ends, with a dig where the tool went in. Drawn as two slivers — bone on
 * the lit side and tar on the other — which is the pairing this file has always
 * used to say *a groove with metal showing along its lip* rather than *a line*.
 * A sliver has width that changes along it, which a stroke cannot have; that
 * change is what reads as pressure.
 */
function gouge(at: Stroke, spec: ScratchSpec, r: Draw): string {
  const { x, y, ux, uy, nx, ny, length, lit } = at;
  const half = r.between(spec.minWidth, spec.maxWidth) * 0.8;
  const bow = length * r.between(-spec.bow, spec.bow);
  const cx = x + ux * length * 0.34 + nx * bow;
  const cy = y + uy * length * 0.34 + ny * bow;
  const ex = x + ux * length;
  const ey = y + uy * length;

  const sliver = (shift: number, colour: string, alpha: number): string => {
    const [sx, sy, tx, ty] = [x + nx * shift, y + ny * shift, ex + nx * shift, ey + ny * shift];
    const over = shift + half * 1.7;
    const under = shift - half * 1.7;
    return (
      `<path d='M${n(sx)} ${n(sy)}Q${n(cx + nx * over)} ${n(cy + ny * over)} ${n(tx)} ${n(ty)}` +
      `Q${n(cx + nx * under)} ${n(cy + ny * under)} ${n(sx)} ${n(sy)}Z' ` +
      `fill='${colour}' fill-opacity='${alpha.toFixed(2)}'/>`
    );
  };

  // The dig, lit on the wall that faces up — which on a hole is the lower one.
  const dig =
    `<circle cx='${n(x)}' cy='${n(y)}' r='${n(half * 1.3)}' fill='${PIGMENTS.scratchDark}' ` +
    `fill-opacity='${(lit * spec.dark).toFixed(2)}'/>` +
    `<circle cx='${n(x - nx * half * 0.7)}' cy='${n(y - ny * half * 0.7)}' r='${n(half * 0.55)}' ` +
    `fill='${PIGMENTS.scratchLit}' fill-opacity='${(lit * 0.7).toFixed(2)}'/>`;

  return sliver(-0.5, PIGMENTS.scratchDark, lit * spec.dark) + sliver(0.5, PIGMENTS.scratchLit, lit) + dig;
}

/**
 * A drag: a few fine lines side by side, each its own length and its own
 * strength, where grit went along under something. Some skip — the line breaks
 * and picks up again — because whatever made it bounced. The strongest carries
 * a dark twin on its far side; the rest are too fine to have a wall.
 */
function drag(at: Stroke, spec: ScratchSpec, r: Draw): string {
  const { x, y, ux, uy, nx, ny, length, lit } = at;
  const strands = 2 + Math.floor(r.unit() * 4);
  const gap = r.between(0.9, 2.3);
  let markup = '';

  for (let j = 0; j < strands; j++) {
    const across = (j - (strands - 1) / 2) * gap + r.between(-0.35, 0.35);
    const shift = r.between(0, 0.3) * length;
    const run = Math.max(3, length * r.between(0.5, 1) - shift);
    const sx = x + ux * shift + nx * across;
    const sy = y + uy * shift + ny * across;
    const bow = run * r.between(-spec.bow, spec.bow);
    const alpha = lit * r.between(0.35, 1);
    const width = r.between(spec.minWidth * 0.55, spec.minWidth * 1.25);
    const skips = r.odds(0.4)
      ? ` stroke-dasharray='${n(run * r.between(0.2, 0.5))} ${n(r.between(1, 3.5))} ` +
        `${n(run * r.between(0.1, 0.3))} ${n(r.between(0.8, 2.5))}'`
      : '';
    const line = (ox: number, oy: number, colour: string, a: number): string =>
      `<path d='M${n(sx + ox)} ${n(sy + oy)}q${n((ux * run) / 2 + nx * bow)} ${n((uy * run) / 2 + ny * bow)} ` +
      `${n(ux * run)} ${n(uy * run)}' stroke='${colour}' stroke-opacity='${a.toFixed(2)}' ` +
      `stroke-width='${n(width)}'${skips}/>`;

    if (j === 0) markup += line(-nx * 0.8, -ny * 0.8, PIGMENTS.scratchDark, alpha * spec.dark);
    markup += line(0, 0, PIGMENTS.scratchLit, alpha);
  }
  return markup;
}

/**
 * A scuff: somewhere something rubbed. A dozen short hairlines in a band, all
 * one faint strength, drawn as a single path. On its own it is nearly nothing;
 * across a tile it is what makes the plate between the scratches look handled
 * rather than new.
 */
function scuff(at: Stroke, spec: ScratchSpec, r: Draw): string {
  const { x, y, ux, uy, nx, ny, length, lit } = at;
  const hairs = 7 + Math.floor(r.unit() * 7);
  const spread = r.between(3, 7);
  const reach = Math.max(9, length * 0.55);
  let d = '';
  for (let j = 0; j < hairs; j++) {
    const across = r.between(-spread, spread);
    const shift = r.between(0, 0.6) * reach;
    const run = reach * r.between(0.25, 0.7);
    d += `M${n(x + ux * shift + nx * across)} ${n(y + uy * shift + ny * across)}l${n(ux * run)} ${n(uy * run)}`;
  }
  return (
    `<path d='${d}' stroke='${PIGMENTS.scratchLit}' stroke-opacity='${(lit * 0.34).toFixed(2)}' ` +
    `stroke-width='${n(spec.minWidth * 0.6)}'/>`
  );
}

/**
 * A plate's worth of marks, and the point of gt#99 is that they are not all the
 * same mark. The first cut of this drew thirty straight segments of one width,
 * each twice, and thirty of anything is a field of lines. A surface that has
 * been used carries a *history*: a few deep cuts, a lot of fine drags, patches
 * rubbed dull, and dings. So each mark is one of three kinds, and the tile
 * carries pits beside them.
 *
 * What has not changed is what the field leans on. Most marks run within
 * `stray` of one direction, the way a hand drags; a few cross everything. Long
 * marks are light ones. And the board is lit from the top — every plate carries
 * an inset top highlight — so bone goes on the upper side of a groove and tar
 * on the lower.
 */
export function scratchField(spec: ScratchSpec): string {
  const r = draws(spec.seed);
  const marks: string[] = [];

  for (let i = 0; i < spec.count; i++) {
    const x = r.unit() * spec.size;
    const y = r.unit() * spec.size;

    const crossing = r.odds(spec.crossOdds);
    const degrees = crossing
      ? r.between(spec.lean + 55, spec.lean + 125)
      : spec.lean + r.between(-spec.stray, spec.stray);
    const angle = (degrees * Math.PI) / 180;

    // A mark that crosses the grain is one thing going the wrong way, so it is
    // never short: a few short lines across everything else read as tally
    // marks somebody made on purpose.
    const span = Math.pow(r.unit(), spec.bias);
    const length =
      spec.minLength + (crossing ? 0.4 + span * 0.6 : span) * (spec.maxLength - spec.minLength);
    // A long drag is a light one. Short marks are the deep ones, which is why
    // the field reads as a history of small knocks rather than as combing.
    const reach = (length - spec.minLength) / (spec.maxLength - spec.minLength);

    const at: Stroke = {
      x,
      y,
      ux: Math.cos(angle),
      uy: Math.sin(angle),
      // Perpendicular to the mark, pointing at the light.
      nx: Math.sin(angle),
      ny: -Math.cos(angle),
      length,
      lit: spec.lit * (1 - reach * 0.55),
    };

    // Something crossing the grain is a single cut, never a rub or a drag.
    const kind = r.unit();
    const markup =
      crossing || kind < spec.gougeOdds
        ? gouge(at, spec, r)
        : kind < spec.gougeOdds + spec.scuffOdds
          ? scuff(at, spec, r)
          : drag(at, spec, r);

    // Generous on purpose: a drag is several lines wide and a scuff wider still,
    // and a mark drawn once too often costs nothing while one clipped at the
    // tile's edge is a seam.
    const pad = 9;
    const dx = at.ux * length;
    const dy = at.uy * length;
    const bounds: Bounds = {
      minX: Math.min(x, x + dx) - pad,
      maxX: Math.max(x, x + dx) + pad,
      minY: Math.min(y, y + dy) - pad,
      maxY: Math.max(y, y + dy) + pad,
    };
    marks.push(repeated(markup, wraps(bounds, spec.size, spec.size)));
  }

  // Dings. A dark dot and a bone one a hair under it: a hole, lit on the wall
  // that faces up. Two paths for the lot.
  const holes: Array<readonly [number, number]> = [];
  const lips: Array<readonly [number, number]> = [];
  for (let i = 0; i < spec.pits; i++) {
    const px = r.unit() * spec.size;
    const py = r.unit() * spec.size;
    holes.push([px, py]);
    lips.push([px, onTile(py + 0.55, spec.size)]);
  }
  const pits =
    dots(holes, PIGMENTS.scratchDark, spec.lit * spec.dark, 1.9) +
    dots(lips, PIGMENTS.scratchLit, spec.lit * 0.85, 0.9);

  return tile(
    spec.size,
    spec.size,
    `<defs>${worn(`w${spec.seed}`, spec.seed, spec.size, spec.wear)}</defs>` +
      `<g fill='none' stroke-linecap='round' filter='url(#w${spec.seed})'>${marks.join('')}</g>${pits}`,
  );
}

// ------------------------------------------------------------------ rust blooms

export interface BloomSpec {
  readonly size: number;
  readonly seed: number;
  /**
   * How many patches a tile carries, and the radius of the largest and the
   * smallest. Sizes fall off along `bias`: at 2 and over, one patch is big, a
   * couple are middling and the rest are small — which is the first thing a
   * photograph of rust shows and the first thing nine patches of one size got
   * wrong (gt#100).
   */
  readonly count: number;
  readonly minRadius: number;
  readonly maxRadius: number;
  readonly bias: number;
  /**
   * How a patch is grown (gt#100). It is not one shape: it is spots that ran
   * together. `growth` is how many spots a patch has per pixel of its radius;
   * each new one starts on the edge of one already there and is `shrink` times
   * its size, so a patch spreads in lobes and thins toward its edge.
   * `squash` flattens the spread — corrosion along an edge runs along it.
   * `satellites` is how many stray spots stand off the patch, as a share of
   * the spots in it.
   */
  readonly growth: number;
  readonly shrink: readonly [number, number];
  readonly squash: number;
  readonly satellites: number;
  readonly minAlpha: number;
  readonly maxAlpha: number;
  /** How often a patch weeps, how many streaks at most, and how far the longest gets. */
  readonly runOdds: number;
  readonly streaks: number;
  readonly minRun: number;
  readonly maxRun: number;
  readonly runAlpha: number;
  /**
   * The layers (gt#99). `halo` is how far the stain reaches past the crust, as a
   * multiple of each spot's size, and `stain` its share of the patch's
   * strength. `scales` is the most pieces of lifted scale one patch carries.
   * `speckle` is dots per pixel of radius and `spread` how far out they
   * scatter, in radii — past the crust, so the edge of a patch is grain rather
   * than a line.
   */
  readonly halo: number;
  readonly stain: number;
  readonly scales: number;
  readonly speckle: number;
  readonly spread: number;
  /** Lone pinhead spots across the whole tile, nowhere near a patch. */
  readonly freckles: number;
  /** How the drawn layers are roughened. The speckle is laid over the top, untouched. */
  readonly wear: Wear;
}

/**
 * The gradient every run fades out along, in its own bounding box.
 *
 * The id is letter-first on purpose. These tiles are parsed as `image/svg+xml`
 * rather than as HTML, and an XML id beginning with a digit is not a name — a
 * seed of 11 spelled `11r` is the kind of thing that renders in one engine and
 * silently drops the whole tile in the next.
 */
const fade = (id: string, pigment: string): string =>
  `<linearGradient id='${id}' x1='0' y1='0' x2='0' y2='1'>` +
  `<stop offset='0' stop-color='${pigment}'/>` +
  `<stop offset='0.45' stop-color='${pigment}' stop-opacity='0.55'/>` +
  `<stop offset='1' stop-color='${pigment}' stop-opacity='0'/>` +
  `</linearGradient>`;

/**
 * One broken-edged piece: a closed polygon through jittered points, with the
 * edges left straight, because scale cracks off rather than flowing.
 */
function shard(
  cx: number,
  cy: number,
  radius: number,
  vertices: number,
  ragged: number,
  r: Draw,
): string {
  let d = '';
  const turn = r.unit() * Math.PI * 2;
  for (let i = 0; i < vertices; i++) {
    const angle = turn + (i / vertices) * Math.PI * 2;
    const reach = radius * r.between(1 - ragged, 1 + ragged);
    d += `${i ? 'L' : 'M'}${n(cx + Math.cos(angle) * reach)},${n(cy + Math.sin(angle) * reach)}`;
  }
  return `${d}Z`;
}

/** One spot of a patch: where it is and how big. */
interface Spot {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/**
 * The stroke widths spots are drawn at. A spot is a dot, a dot is a round-capped
 * stroke, and every dot of one width can share one path — so a patch of forty
 * spots is a handful of paths rather than forty circles. Six sizes, each a
 * little under twice the last: the filter tears every edge afterwards, so
 * nobody can see the steps, and each extra size is another path in every layer
 * of every patch.
 */
const WIDTHS = [1.5, 2.8, 5, 9, 16, 28] as const;

/** The nearest drawn width to a spot's diameter, as an index into {@link WIDTHS}. */
const widthOf = (diameter: number): number => {
  let best = 0;
  for (const [index, width] of WIDTHS.entries()) {
    if (Math.abs(width - diameter) < Math.abs((WIDTHS[best] ?? 0) - diameter)) best = index;
  }
  return best;
};

/**
 * A set of spots as one layer of a patch: every spot drawn `scale` times its
 * size in one colour, inside a group that carries the strength. The group is
 * the point — the spots overlap, and painted one over another at half strength
 * the overlaps would come out darker and show every circle. Inside a group they
 * are painted solid and faded together, so what is seen is their outline.
 */
function layer(spots: readonly Spot[], scale: number, colour: string, alpha: number, floor = 0): string {
  const byWidth = new Map<number, Array<readonly [number, number]>>();
  for (const spot of spots) {
    if (spot.r < floor) continue;
    const index = widthOf(spot.r * 2 * scale);
    const list = byWidth.get(index) ?? [];
    list.push([spot.x, spot.y]);
    byWidth.set(index, list);
  }
  if (!byWidth.size) return '';
  let paths = '';
  for (const [index, points] of [...byWidth.entries()].sort(([a], [c]) => a - c)) {
    paths +=
      `<path d='${points.map(([x, y]) => `M${Math.round(x)},${Math.round(y)}h.1`).join('')}' ` +
      `stroke-width='${n(WIDTHS[index] ?? 1)}'/>`;
  }
  return `<g stroke='${colour}' opacity='${alpha.toFixed(2)}'>${paths}</g>`;
}

/**
 * Grow one patch (gt#100). Start with a spot, then keep adding: each new spot
 * sits just off the edge of one already there and is a little smaller than it.
 * The newest spots are picked as parents most often, so the patch creeps
 * outward in arms. Then a few strays, small and standing off.
 *
 * It is how a patch of rust actually gets its shape — a spot, then the spots
 * beside it, run together — and what comes out has the broken, lobed coastline
 * that no single closed curve does.
 */
function colony(cx: number, cy: number, radius: number, spec: BloomSpec, r: Draw): Spot[] {
  // Which way this patch runs. Rust along an edge runs along it, and the tile
  // does not know which edge it will be shown at, so each patch picks its own.
  const lie = r.unit() * Math.PI;
  const along = (distance: number, angle: number): readonly [number, number] => {
    const u = Math.cos(angle) * distance;
    const v = Math.sin(angle) * distance * spec.squash;
    return [u * Math.cos(lie) - v * Math.sin(lie), u * Math.sin(lie) + v * Math.cos(lie)];
  };

  const spots: Spot[] = [{ x: cx, y: cy, r: radius * 0.4 }];
  const count = Math.max(3, Math.round(radius * spec.growth));
  for (let i = 1; i < count; i++) {
    // The late spots are picked as parents more often than the early ones, so
    // the patch creeps outward in arms rather than piling up on its middle.
    const pick = Math.floor((1 - Math.pow(r.unit(), 1.5)) * spots.length);
    const parent = spots[Math.min(spots.length - 1, pick)] ?? spots[0];
    if (!parent) break;
    const [dx, dy] = along(parent.r * r.between(0.9, 1.75), r.unit() * Math.PI * 2);
    spots.push({
      x: parent.x + dx,
      y: parent.y + dy,
      r: Math.max(0.6, parent.r * r.between(spec.shrink[0], spec.shrink[1])),
    });
  }
  const strays = Math.round(count * spec.satellites);
  for (let i = 0; i < strays; i++) {
    const [dx, dy] = along(radius * r.between(1.1, 2.6), r.unit() * Math.PI * 2);
    spots.push({ x: cx + dx, y: cy + dy, r: radius * r.between(0.03, 0.1) });
  }
  return spots;
}

/**
 * Corrosion the way it actually arrives, built in the layers it has (gt#99) and
 * in the shapes it has (gt#100).
 *
 * The first cut was one smooth closed curve filled with one flat colour, with a
 * wedge under some of them: a soft splotch. gt#99 gave it layers and grain. What
 * was still wrong was the shape, and looking at photographs said how:
 *
 * - **A patch is spots that ran together**, not a shape. So each is grown — see
 *   {@link colony} — and drawn three times over: wide and faint for the
 *   **stain** soaked into the metal round it, at its own size and darker for
 *   the **crust**, and small and nearly black for the **pits** in the middle of
 *   the biggest spots.
 * - **Sizes follow a steep curve.** One big patch, a couple of middling ones,
 *   the rest small.
 * - **Streaks are long, thin and many**, and they come in crowds: a weeping
 *   patch drops several, of very different lengths, most short and a few long.
 * - **Freckles.** Pinhead spots stand all over a rusting panel, nowhere near
 *   the damage.
 *
 * Over those: small pieces of bright **scale**, and **speckle** — pits and
 * flecks — through all of it and out past its edge.
 *
 * The tile is still the material only. Where it is allowed to show is the
 * caller's mask, so a plate rusts at its edges and its screws rather than all
 * over.
 */
export function bloomField(spec: BloomSpec, palette: Corrosion): string {
  const r = draws(spec.seed);
  const marks: string[] = [];
  // Speckle for the whole tile, in four paths: pits and flecks, fine and coarse.
  const speckle: Record<'pitFine' | 'pitCoarse' | 'fleckFine' | 'fleckCoarse', Array<readonly [number, number]>> = {
    pitFine: [],
    pitCoarse: [],
    fleckFine: [],
    fleckCoarse: [],
  };
  const fill = (d: string, colour: string, alpha: number): string =>
    `<path d='${d}' fill='${colour}' fill-opacity='${alpha.toFixed(2)}'/>`;

  // Every patch's spots, in two lots: the strong patches and the faint ones.
  // Pooled rather than drawn patch by patch because each layer of each patch
  // was its own group of its own paths, and that was half the tile. Two
  // strengths is all the eye was getting out of fifteen.
  const strong: Spot[] = [];
  const faint: Spot[] = [];
  const middle = (spec.minAlpha + spec.maxAlpha) / 2;
  /** A spot, and again on the far side of any edge it hangs over. */
  const seat = (into: Spot[], spot: Spot): void => {
    const reach = spot.r * spec.halo + spec.wear.tear;
    const xs = [0, spot.x - reach < 0 ? spec.size : 0, spot.x + reach > spec.size ? -spec.size : 0];
    const ys = [0, spot.y - reach < 0 ? spec.size : 0, spot.y + reach > spec.size ? -spec.size : 0];
    for (const dx of new Set(xs)) {
      for (const dy of new Set(ys)) into.push({ x: spot.x + dx, y: spot.y + dy, r: spot.r });
    }
  };

  for (let i = 0; i < spec.count; i++) {
    const cx = r.unit() * spec.size;
    const cy = r.unit() * spec.size;
    // The first is the big one; the rest come off a steep curve.
    const share = i === 0 ? 1 : Math.pow(r.unit(), spec.bias);
    const radius = spec.minRadius + share * (spec.maxRadius - spec.minRadius);
    const alpha = r.between(spec.minAlpha, spec.maxAlpha);
    const spots = colony(cx, cy, radius, spec, r);
    for (const spot of spots) seat(alpha >= middle ? strong : faint, spot);

    let markup = '';

    // Small, and several: one bright polygon in the middle of a patch is a
    // gem set in it, and a scatter of little ones is scale.
    const pieces = 1 + Math.floor(r.unit() * spec.scales);
    for (let j = 0; j < pieces; j++) {
      const on = spots[Math.floor(r.unit() * Math.min(spots.length, 8))] ?? spots[0];
      if (!on) continue;
      markup += fill(
        shard(
          on.x + r.between(-0.5, 0.5) * on.r,
          on.y + r.between(-0.5, 0.5) * on.r,
          Math.max(0.8, on.r * r.between(0.18, 0.42)),
          5,
          0.5,
          r,
        ),
        palette.bright,
        alpha * 0.6,
      );
    }

    // Dense in the middle and thinning outward: the root of the draw pulls
    // most of them in close, and the few that land far out are the fringe.
    const grains = Math.round(radius * spec.speckle);
    for (let j = 0; j < grains; j++) {
      const angle = r.unit() * Math.PI * 2;
      const out = radius * spec.spread * Math.pow(r.unit(), 0.75);
      const point = [
        onTile(cx + Math.cos(angle) * out, spec.size),
        onTile(cy + Math.sin(angle) * out * spec.squash, spec.size),
      ] as const;
      const coarse = r.odds(0.28);
      if (r.odds(0.55)) (coarse ? speckle.pitCoarse : speckle.pitFine).push(point);
      else (coarse ? speckle.fleckCoarse : speckle.fleckFine).push(point);
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const spot of spots) {
      const reach = spot.r * spec.halo + 2;
      minX = Math.min(minX, spot.x - reach);
      maxX = Math.max(maxX, spot.x + reach);
      minY = Math.min(minY, spot.y - reach);
      maxY = Math.max(maxY, spot.y + reach);
    }

    if (r.odds(spec.runOdds)) {
      // A crowd of them, off the underside of the patch, each its own length.
      // Squaring the draw is what makes most of them short and one or two
      // long, which is the look: a streak is a place water went once, and it
      // rarely went far.
      const drops = 2 + Math.floor(r.unit() * spec.streaks);
      for (let j = 0; j < drops; j++) {
        const from = spots[Math.floor(r.unit() * Math.min(spots.length, 12))] ?? spots[0];
        if (!from) continue;
        const x = from.x + r.between(-0.6, 0.6) * from.r;
        const y = from.y + from.r * 0.3;
        const length = spec.minRun + Math.pow(r.unit(), 2) * (spec.maxRun - spec.minRun);
        const top = r.between(0.45, 1.5);
        // It does not fall dead straight: it finds its way, once, half way down.
        const jog = r.between(-2.2, 2.2);
        const drift = jog + r.between(-1.6, 1.6);
        const pale = r.odds(0.16);
        markup +=
          `<path d='M${n(x - top)},${n(y)}L${n(x + top)},${n(y)}` +
          `L${n(x + jog + top * 0.55)},${n(y + length * 0.5)}L${n(x + drift + top * 0.15)},${n(y + length)}` +
          `L${n(x + drift - top * 0.15)},${n(y + length)}L${n(x + jog - top * 0.55)},${n(y + length * 0.5)}Z' ` +
          `fill='url(#${pale ? 'p' : 'r'}${spec.seed})' ` +
          `opacity='${(spec.runAlpha * r.between(0.55, 1)).toFixed(2)}'/>`;
        minX = Math.min(minX, x - 4);
        maxX = Math.max(maxX, x + 4);
        maxY = Math.max(maxY, y + length);
      }
    }

    if (markup) marks.push(repeated(markup, wraps({ minX, maxX, minY, maxY }, spec.size, spec.size)));
  }

  // The three layers, stain under crust under pits, each at its two strengths.
  const high = (middle + spec.maxAlpha) / 2;
  const low = (spec.minAlpha + middle) / 2;
  const patches =
    layer(faint, spec.halo, palette.stain, low * spec.stain) +
    layer(strong, spec.halo, palette.stain, high * spec.stain) +
    layer(faint, 0.82, palette.crust, Math.min(1, low * 1.2)) +
    layer(strong, 0.82, palette.crust, Math.min(1, high * 1.2)) +
    layer([...faint, ...strong], 0.36, palette.pit, Math.min(1, high * 1.1), spec.maxRadius * 0.12);

  // Freckles: a pinhead of crust in a breath of stain, anywhere on the tile.
  const pins: Array<readonly [number, number]> = [];
  const heads: Array<readonly [number, number]> = [];
  for (let i = 0; i < spec.freckles; i++) {
    const point = [r.unit() * spec.size, r.unit() * spec.size] as const;
    (r.odds(0.3) ? heads : pins).push(point);
  }
  const freckles =
    dots(pins, palette.stain, 0.45, 3.2) +
    dots(heads, palette.stain, 0.5, 5.4) +
    dots(pins, palette.crust, 0.85, 1.2) +
    dots(heads, palette.crust, 0.9, 2.3);

  const grain =
    dots(speckle.pitFine, palette.pit, 0.8, 0.9) +
    dots(speckle.pitCoarse, palette.pit, 0.85, 1.4) +
    dots(speckle.fleckFine, palette.fleck, 0.7, 0.8) +
    dots(speckle.fleckCoarse, palette.fleck, 0.6, 1.2);

  // Verdigris never runs, so it is never given a gradient to run along — a
  // quarter-kilobyte of unreachable `<defs>` inlined into every page is exactly
  // the sort of thing that gets copied into the next tile and never questioned.
  const run =
    spec.runOdds > 0
      ? fade(`r${spec.seed}`, palette.stain) + fade(`p${spec.seed}`, palette.fleck)
      : '';
  return tile(
    spec.size,
    spec.size,
    `<defs>${run}${worn(`w${spec.seed}`, spec.seed, spec.size, spec.wear)}</defs>` +
      `<g fill='none' stroke-linecap='round' filter='url(#w${spec.seed})'>` +
      `${patches}${marks.join('')}${freckles}</g>${grain}`,
  );
}

// -------------------------------------------------------------------- seam runs

export interface RunSpec {
  readonly width: number;
  readonly height: number;
  readonly count: number;
  readonly seed: number;
  /**
   * Streaks come in crowds (gt#100): this many places along the seam where it
   * weeps, each streak landing within `scatter` pixels of one of them. Under a
   * real seam they are thick in some stretches and missing in others.
   */
  readonly crowds: number;
  readonly scatter: number;
  readonly minWidth: number;
  readonly maxWidth: number;
  readonly minLength: number;
  readonly maxLength: number;
  readonly minAlpha: number;
  readonly maxAlpha: number;
}

/**
 * What hangs under a seam. Repeated along the x axis and anchored to the top of
 * whatever it is laid on, so the streaks read as starting *at* the join — a
 * module's top edge, THE FOUNDATION's rivet strip — rather than floating on the
 * plate. This is the layer `--weather` drives hardest: a fresh board does not
 * weep, and SCRUB THE ALTAR takes it away again.
 */
export function runStrip(spec: RunSpec): string {
  const r = draws(spec.seed);
  const marks: string[] = [];

  // Where the seam weeps. Decided first, so the streaks can gather at them.
  const crowds: number[] = [];
  for (let i = 0; i < spec.crowds; i++) crowds.push(r.unit() * spec.width);

  for (let i = 0; i < spec.count; i++) {
    const x = (crowds[i % crowds.length] ?? 0) + r.between(-spec.scatter, spec.scatter);
    const top = r.between(spec.minWidth, spec.maxWidth);
    // A hard taper, because a weak one reads as parallel — and two parallel
    // edges over a hundred pixels is a bar, whatever colour it is painted.
    const foot = top * r.between(0.12, 0.35);
    // Squared, so most are short and a few run long (gt#100): a streak is a
    // place water went once, and it rarely went far.
    const length = spec.minLength + Math.pow(r.unit(), 2) * (spec.maxLength - spec.minLength);
    const drift = r.between(-3, 3);
    const alpha = r.between(spec.minAlpha, spec.maxAlpha);

    const markup =
      `<path d='M${n(x - top)} 0L${n(x + top)} 0` +
      `L${n(x + foot + drift)} ${n(length)}L${n(x - foot + drift)} ${n(length)}Z' ` +
      `fill='url(#s${spec.seed})' opacity='${alpha.toFixed(2)}'/>`;

    const bounds: Bounds = {
      minX: Math.min(x - top, x - foot + drift),
      maxX: Math.max(x + top, x + foot + drift),
      minY: 0,
      maxY: length,
    };
    // Only the x axis wraps: a run that outgrows the strip is clipped at the
    // bottom, which is the right way to be wrong — a streak that reappeared at
    // the top would be a second seam nobody bolted.
    marks.push(repeated(markup, wraps({ ...bounds, maxY: 0 }, spec.width, spec.height)));
  }

  return tile(
    spec.width,
    spec.height,
    `<defs>${fade(`s${spec.seed}`, PIGMENTS.rust)}</defs>${marks.join('')}`,
  );
}

// ------------------------------------------------------------------- the recipe

/**
 * Every number the board's damage is cut to, in one place, because this is what
 * gets retuned by eye. Seeds are the tiles' old ones where there was one to
 * keep: the scratch field is still 4, the rust still 11.
 */
export const DAMAGE = {
  scratches: {
    size: 180,
    count: 30,
    seed: 4,
    lean: -12,
    stray: 9,
    crossOdds: 0.14,
    minLength: 7,
    maxLength: 74,
    bias: 2.4,
    minWidth: 0.5,
    maxWidth: 1.05,
    lit: 0.5,
    dark: 0.75,
    gougeOdds: 0.26,
    scuffOdds: 0.2,
    bow: 0.035,
    pits: 16,
    // Barely torn — a scratch is a line, and should stay one — and eaten just
    // enough that a long one is not the same strength from end to end.
    wear: { warp: 0.11, tear: 1.6, grain: 0.7, bite: 0.22 },
  },
  /**
   * Rust, redrawn from photographs (gt#100). A tile nearly twice the width it
   * was, so a plate's edge shows it once rather than twice; fifteen patches on
   * a steep curve of sizes; each one grown from spots; crowds of thin streaks
   * off the weeping ones; freckles across all of it.
   */
  rust: {
    size: 420,
    seed: 11,
    count: 15,
    minRadius: 3,
    maxRadius: 26,
    bias: 2.6,
    growth: 1.25,
    shrink: [0.7, 0.98],
    squash: 0.6,
    satellites: 0.35,
    minAlpha: 0.45,
    maxAlpha: 0.85,
    runOdds: 0.7,
    streaks: 4,
    minRun: 8,
    maxRun: 96,
    runAlpha: 0.6,
    halo: 1.55,
    stain: 0.62,
    scales: 2,
    speckle: 2.2,
    spread: 1.8,
    freckles: 40,
    // Torn hard and eaten through: rust has no clean edge and no even middle.
    wear: { warp: 0.07, tear: 8, grain: 0.42, bite: 0.32 },
  },
  /**
   * Verdigris is a crust, not a weep: bigger, flatter, fewer, and it never runs.
   * Copper goes green where it sits, and it stays where it went.
   */
  verdigris: {
    size: 380,
    seed: 23,
    count: 7,
    minRadius: 5,
    maxRadius: 28,
    bias: 2,
    growth: 1.1,
    shrink: [0.72, 0.98],
    squash: 0.7,
    satellites: 0.3,
    minAlpha: 0.25,
    maxAlpha: 0.55,
    runOdds: 0,
    streaks: 0,
    minRun: 0,
    maxRun: 0,
    runAlpha: 0,
    // A crust more than a pit: wider stain, less scale, and the pale bloom
    // scattered thin and wide over the top of it.
    halo: 1.4,
    stain: 0.6,
    scales: 2,
    speckle: 2.2,
    spread: 1.5,
    freckles: 12,
    wear: { warp: 0.06, tear: 7, grain: 0.5, bite: 0.3 },
  },
  /**
   * Retuned by eye after the first version went on the board, where seven fat
   * streaks per 240px read as a barcode rather than as rust. Every number here
   * moved in the same direction — narrower, fainter, tapering harder, and spread
   * over a tile wide enough that the eye stops finding the repeat along THE
   * FOUNDATION's full width.
   */
  //
  // And again from photographs (gt#100): three times as many, thinner, gathered
  // in crowds with bare seam between them, most short and a few running most of
  // the strip.
  runs: {
    width: 520,
    height: 130,
    count: 27,
    seed: 17,
    crowds: 6,
    scatter: 17,
    minWidth: 0.3,
    maxWidth: 1.5,
    minLength: 9,
    maxLength: 122,
    minAlpha: 0.2,
    maxAlpha: 0.44,
  },
} as const;

/**
 * The runs tile at its own size, which is the only size it may be laid at.
 *
 * Derived rather than written down twice: a run is a tapering streak with a
 * gradient down its length, and scaling the tile to some other rectangle
 * stretches the taper into something that reads as a smear — which is the
 * failure this whole file exists to undo. How far down a plate the runs are
 * allowed to reach is the *element's* height, not the tile's, and that is the
 * plate's own business.
 */
export const runTile = `${DAMAGE.runs.width}px ${DAMAGE.runs.height}px`;

/**
 * The tiles themselves, baked once. Module-level and deterministic, so every
 * load of the page gets the same board — the first law, kept by construction
 * rather than by discipline.
 */
export const damage = {
  scratches: scratchField(DAMAGE.scratches),
  rust: bloomField(DAMAGE.rust, CORROSION.rust),
  verdigris: bloomField(DAMAGE.verdigris, CORROSION.verdigris),
  runs: runStrip(DAMAGE.runs),
} as const;

// ------------------------------------------------------------------- placement

/**
 * Where rust is allowed to show. This is the half of the diagnosis a better tile
 * could never fix: rust at an even density over a whole plate is a wash however
 * convincing one patch of it looks. Water sits along edges and stands in the
 * dish around a screw head, so that is where the metal goes.
 *
 * Written as mask layers rather than baked into the tiles because a plate's size
 * is a runtime fact — nine modules, four boxes and one 1440px board all take the
 * same material and mask it to their own geometry.
 */
const EDGE = {
  /** How far in from a plate edge the bite reaches, and from the board's. */
  plate: 16,
  /**
   * And along a plate's *bottom* edge (gt#100), which is where water sits and
   * where every photograph of a rusting panel is darkest. The top edge sheds
   * it and gets less.
   */
  plateFoot: 26,
  plateHead: 10,
  board: 54,
  wake: 220,
  /** The pool around a screw head, whose centre is `MODULE.screw` inset + half. */
  screw: 30,
  screwAt: 8,
} as const;

/**
 * A band along each edge, fading inward. `to bottom` starts at the top, so that
 * one is the band along the *top* edge: `head` is its depth and `foot` the
 * depth of the band along the bottom, where they differ from the sides.
 */
const edges = (depth: number, head = depth, foot = depth): string =>
  (
    [
      ['bottom', head],
      ['top', foot],
      ['left', depth],
      ['right', depth],
    ] as const
  )
    .map(([side, reach]) => `linear-gradient(to ${side}, #000, rgba(0,0,0,0) ${reach}px)`)
    .join(',');

const screws = (at: number, reach: number): string =>
  [
    `${at}px ${at}px`,
    `calc(100% - ${at}px) ${at}px`,
    `${at}px calc(100% - ${at}px)`,
    `calc(100% - ${at}px) calc(100% - ${at}px)`,
  ]
    .map((point) => `radial-gradient(circle at ${point}, #000, rgba(0,0,0,0) ${reach}px)`)
    .join(',');

/**
 * The three masks, as ready-to-use `mask-image` values. Layers union: the
 * default composite is `add`, so a plate rusts anywhere near an edge *or* a
 * screw, and hardest where the two meet — which is exactly the corner a real
 * one goes first.
 */
export const placement = {
  /** A source module: four edges and four screw heads. */
  plate: `${edges(EDGE.plate, EDGE.plateHead, EDGE.plateFoot)},${screws(EDGE.screwAt, EDGE.screw)}`,
  /** A modifier box: edges only. A box has no screws — see ../ui/modifier. */
  box: edges(EDGE.plate, EDGE.plateHead, EDGE.plateFoot),
  /** The one big plate, whose edges are the only thing it has. */
  board: edges(EDGE.board),
  /** The wake screen, where the same idea is a vignette at viewport scale. */
  wake: edges(EDGE.wake),
  /**
   * And where along that vignette the wake screen's rust actually stands (gt#89):
   * nine pools round the frame, no two the same size and none evenly spaced.
   *
   * The edge mask above lets rust show in an even band round the whole window,
   * and an even band of one repeating tile is a row of the same blot every 240
   * pixels: wallpaper. Corrosion does not run round a frame at one density. It
   * stands where water did. So this is laid over the band as a second mask,
   * and what is left is patches — a corner gone, a stretch of the top edge
   * clean, a pool half way down one side — in which a tile repeating twice is
   * a patch of rust rather than a pattern.
   *
   * In percent, so the pools keep their places in a window of any shape. Fixed,
   * like every other placement here: the same screen is rusted the same way
   * every time.
   */
  wakePools: [
    ['4% 9%', 7, 19],
    ['37% 0%', 4, 13],
    ['72% 5%', 6, 17],
    ['98% 24%', 5, 15],
    ['100% 71%', 8, 21],
    ['79% 100%', 4, 14],
    ['45% 97%', 6, 18],
    ['11% 93%', 5, 16],
    ['0% 50%', 3, 12],
  ]
    .map(
      ([at, solid, reach]) =>
        `radial-gradient(circle at ${at}, #000 ${solid}%, rgba(0,0,0,0) ${reach}%)`,
    )
    .join(','),
} as const;

// --------------------------------------------------------------------- breakage

// What has been knocked off and knocked in (gt#114): paint that has chipped, and
// a panel that has cracked. Both are for things somebody *painted* or *fitted*
// — a hazard stripe, a guard — which is why they are not in the table above:
// that is what weather does to bare plate, and this is what years of hands and
// one bad afternoon do to the parts that were added.
//
// Same law as everything else in this file. A chip is a drawn flake with a
// seeded outline and a crack is a drawn line with a seeded path; there is no
// noise in either, so neither can turn into fog.

/** How paint chips. See {@link chipField}. */
export interface ChipSpec {
  readonly size: number;
  readonly seed: number;
  /** The big flakes that take a whole piece of a stripe away, and how big. */
  readonly flakes: number;
  readonly minFlake: number;
  readonly maxFlake: number;
  /** The nicks, which are most of them, and how big. */
  readonly nicks: number;
  readonly minNick: number;
  readonly maxNick: number;
  /** How ragged an outline is: 0 is a circle. */
  readonly ragged: number;
}

/**
 * A field of chipped paint, as a **mask**: opaque where the paint still is and
 * clear where it has come away. Laid on something painted, it lets whatever
 * the paint was on show through the chips — which is what a chip is.
 *
 * A few big flakes and a great many nicks, for the reason the rust is one big
 * patch and a lot of small ones: paint does not wear evenly, it lets go in a
 * piece and then is picked at round the edges of the hole. Each is an
 * irregular polygon whose corners are drawn, not a circle that was roughened.
 *
 * It is one picture and not a repeating tile, because the things it is laid on
 * are smaller than it is.
 */
export function chipField(spec: ChipSpec): string {
  const r = draws(spec.seed);
  const flake = (cx: number, cy: number, radius: number): string => {
    const corners = Math.round(r.between(6, 9));
    const first = r.between(0, Math.PI * 2);
    const points: string[] = [];
    for (let i = 0; i < corners; i++) {
      const turn = first + ((i + r.between(-0.3, 0.3)) / corners) * Math.PI * 2;
      const reach = radius * r.between(1 - spec.ragged, 1 + spec.ragged * 0.4);
      points.push(`${n(cx + Math.cos(turn) * reach)} ${n(cy + Math.sin(turn) * reach)}`);
    }
    return `M${points.join('L')}Z`;
  };
  const paths: string[] = [];
  for (let i = 0; i < spec.flakes; i++) {
    paths.push(
      flake(r.between(0, spec.size), r.between(0, spec.size), r.between(spec.minFlake, spec.maxFlake)),
    );
  }
  for (let i = 0; i < spec.nicks; i++) {
    paths.push(
      flake(r.between(0, spec.size), r.between(0, spec.size), r.between(spec.minNick, spec.maxNick)),
    );
  }
  return tile(
    spec.size,
    spec.size,
    `<mask id='paint'><rect width='${spec.size}' height='${spec.size}' fill='#fff'/>` +
      `<path d='${paths.join('')}' fill='#000'/></mask>` +
      `<rect width='${spec.size}' height='${spec.size}' fill='#fff' mask='url(#paint)'/>`,
  );
}

/** How a panel cracks. See {@link crackField}. */
export interface CrackSpec {
  readonly size: number;
  readonly seed: number;
  /** Where it was hit, as a share of the panel's width and height. */
  readonly at: readonly [number, number];
  /** How many cracks leave the point, and how many steps each runs. */
  readonly arms: number;
  readonly steps: number;
  readonly minStep: number;
  readonly maxStep: number;
  /** How far a crack can turn at each step, in degrees. */
  readonly wander: number;
  /** How often a crack forks, how far off it, and how long the fork runs. */
  readonly forkOdds: number;
  readonly minFork: number;
  readonly maxFork: number;
  readonly forkSteps: number;
  /** How often two neighbouring cracks are joined across, near the point. */
  readonly bridgeOdds: number;
  /** The line: its width, its bright edge and its dark one. */
  readonly width: number;
  readonly lit: number;
  readonly dark: number;
}

/**
 * A cracked panel: something hit it at one point and it broke outward from
 * there.
 *
 * Every crack starts at the point of impact, because that is what tells a
 * crack from a scratch — scratches lie about anywhere and all lean one way,
 * and cracks all come from the same place. Each wanders a little at every
 * step, some fork, and near the point a few are joined across by short
 * chords, which is the ring a hard knock leaves. A crack that reaches the
 * edge of the panel stops there.
 *
 * Drawn twice: a dark line a little down and to the right, and a bright one
 * over it. A crack in clear plastic is a face inside the sheet that catches
 * the light on one side and throws a shadow on the other.
 */
export function crackField(spec: CrackSpec): string {
  const r = draws(spec.seed);
  const { size } = spec;
  const ox = spec.at[0] * size;
  const oy = spec.at[1] * size;
  const inside = (x: number, y: number): boolean => x > 0 && x < size && y > 0 && y < size;
  const lines: string[] = [];
  /** Where each arm was after each step, for the chords across. */
  const nodes: Array<Array<readonly [number, number]>> = [];

  const run = (
    fromX: number,
    fromY: number,
    heading: number,
    steps: number,
    record?: Array<readonly [number, number]>,
  ): void => {
    let x = fromX;
    let y = fromY;
    let turn = heading;
    let path = `M${n(x)} ${n(y)}`;
    for (let i = 0; i < steps; i++) {
      turn += (r.between(-spec.wander, spec.wander) * Math.PI) / 180;
      const length = r.between(spec.minStep, spec.maxStep);
      x += Math.cos(turn) * length;
      y += Math.sin(turn) * length;
      path += `L${n(x)} ${n(y)}`;
      record?.push([x, y]);
      if (!inside(x, y)) break;
      // Only a crack that left the point forks; a fork does not fork again.
      if (record && i > 0 && r.odds(spec.forkOdds)) {
        const off = (r.between(spec.minFork, spec.maxFork) * Math.PI) / 180;
        run(x, y, turn + (r.odds(0.5) ? off : -off), spec.forkSteps);
      }
    }
    lines.push(path);
  };

  const first = r.between(0, Math.PI * 2);
  for (let i = 0; i < spec.arms; i++) {
    const record: Array<readonly [number, number]> = [];
    nodes.push(record);
    run(ox, oy, first + ((i + r.between(-0.25, 0.25)) / spec.arms) * Math.PI * 2, spec.steps, record);
  }
  // The ring a knock leaves: neighbours joined at their first step, some of them.
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i]?.[0];
    const b = nodes[(i + 1) % nodes.length]?.[0];
    if (a && b && r.odds(spec.bridgeOdds)) lines.push(`M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}`);
  }

  const d = lines.join('');
  return tile(
    size,
    size,
    `<g fill='none' stroke-linejoin='round' stroke-linecap='round'>` +
      `<path d='${d}' stroke='rgba(0,0,0,${spec.dark})' stroke-width='${n(spec.width * 1.9)}' ` +
      `transform='translate(0.6 0.8)'/>` +
      `<path d='${d}' stroke='rgba(255,246,235,${spec.lit})' stroke-width='${n(spec.width)}'/>` +
      `</g>`,
  );
}

/** The two recipes, in one place, because these are what get retuned by eye. */
export const BREAKAGE = {
  chips: {
    size: 112,
    seed: 31,
    flakes: 22,
    minFlake: 3.5,
    maxFlake: 9,
    nicks: 70,
    minNick: 0.8,
    maxNick: 2.4,
    ragged: 0.45,
  },
  cracks: {
    size: 86,
    seed: 6,
    at: [0.66, 0.34],
    arms: 6,
    steps: 6,
    minStep: 8,
    maxStep: 17,
    wander: 24,
    forkOdds: 0.4,
    minFork: 28,
    maxFork: 62,
    forkSteps: 2,
    bridgeOdds: 0.7,
    width: 0.8,
    lit: 0.6,
    dark: 0.55,
  },
} as const;

/** Baked once, like {@link damage}, and for the same reason. */
export const breakage = {
  chips: chipField(BREAKAGE.chips),
  cracks: crackField(BREAKAGE.cracks),
} as const;
