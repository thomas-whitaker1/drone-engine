// The marks somebody scratched into the board, as opposed to the damage the
// board took — that is ./damage, and the two files are siblings rather than
// relatives. Both draw geometry from the same seeded stream in ./geometry;
// neither has anything to say about the other.
//
// The board's iconography was entirely industrial — screws, rivets, tape,
// stencil — which is right for a scavenged control board and slightly wrong for
// the only thing it makes. The genre's own visual language is sigils, seals and
// self-similar geometry, and none of it was anywhere on the plate. See gt#36.
//
// Five decisions hold the file up:
//
// - **One figure, recursed at a fixed rotation.** A glyph is a handful of
//   straight arms off a centre; at the tip of every arm the *same* arm set is
//   drawn again, smaller by {@link SIGIL.shrink} and turned by
//   {@link SIGIL.turn}. The arm set is drawn from the seed once and then reused
//   at every generation, and that is the whole of what makes this a mark rather
//   than a random twig: a tree that re-rolled its branches per node is noise
//   with a seed on it, and no eye would find the figure inside itself.
// - **The hand is invented.** Nothing here transcribes a living tradition's
//   script. It is a made-up alphabet, and the only thing it is consistent with
//   is itself.
// - **A mark never labels.** Every glyph on this board is decoration. No
//   control's meaning is carried by a symbol, the vocabulary in ../ui/words
//   stays words, and the hover tips stay the only explanation layer. What a
//   mark is *seeded* by can be meaningful — the wire-junction marks are keyed by
//   the source feeding the box — but that is a thing to notice on the twentieth
//   look, never a thing to read.
// - **Generators, not a baked table.** ./damage bakes its four tiles at module
//   load, because there are four of them and it knows all four. This file
//   cannot: its marks are keyed by nine source ids and six zone ids, and the
//   type of the latter is declared in ./index, which re-exports *this* file.
//   A table here would have to import that type back and close the ring. So the
//   marks are pure functions of a key, memoised — which keeps the same law by a
//   different route. Same board, same marks, every session; a key that has been
//   asked for once hands back the identical string forever after.
// - **Nothing leaves the page.** Every mark is inline SVG, generated here. No
//   image assets (gt#23), and emphatically no icon font — glyphs-as-a-typeface is
//   the same rule violation as a stylesheet link, and it would make the marks
//   text, which is the one thing they must never be.
//
// These strings are generated rather than transcribed from the design bundle,
// the same exemption ./damage holds and for the same reason: no handoff has ever
// contained a recursive stroke figure. tests/tokens.test.ts exempts what is
// reachable from here and tests/sigils.test.ts holds it to its own standard
// instead — determinism, and being geometry rather than a typeface.

import { worn } from './damage';
import type { Patch, Wear } from './damage';
import { draws, n, uri } from './geometry';

// ---------------------------------------------------------------- the seed

/** The Park–Miller stream's usable range: zero is a fixed point, so it starts at one. */
const SEED_SPAN = 2147483646;

/**
 * A stable seed from a name, so a mark can be keyed by the thing it belongs to
 * — `zone:junk`, `screw:chainsaw:2` — rather than by a number somebody had to
 * choose and then keep unique.
 *
 * FNV-1a, and the arithmetic is written the long way on purpose: at 32 bits the
 * multiply overflows a double's exact integer range, so the hash is stepped
 * through `Math.imul` and forced back to unsigned each round. A hash that lost
 * precision would still be deterministic, which is exactly why it would never be
 * caught — it would simply collide more than it should, and two zones would
 * quietly wear the same mark.
 */
export function seedOf(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash = Math.imul(hash ^ key.charCodeAt(i), 0x01000193) >>> 0;
  }
  return (hash % SEED_SPAN) + 1;
}

/**
 * Whether the thing named by this key carries a mark at all, this often.
 *
 * The board's screws are the reason this exists: turning *every* slot into a
 * rune would be a themed board, which is the opposite of what gt#36 asks for. A
 * handful of them, so the plate grows detail that only appears on a second look
 * — and the same board every session, which rules out a coin toss at build time.
 *
 * Taken off the low end of the hash rather than off {@link draws}: this is a
 * question asked once per screw and answered before any figure exists, and
 * spinning up a warmed stream to read one bit of it would be the expensive way
 * to flip a coin that is already in your hand.
 */
export function marked(key: string, odds: number): boolean {
  return (seedOf(key) % 1000) / 1000 < odds;
}

// ---------------------------------------------------------------- the recipe

/**
 * Every number the hand is cut to, in one place, because this is what gets
 * retuned by eye.
 *
 * {@link SIGIL.turn} and {@link SIGIL.shrink} are the two that decide whether
 * the thing reads as self-similar at all. A turn near zero stacks every
 * generation along its parent and the figure comes out a starburst; a turn near
 * a half-arm's spacing makes each generation fill the gaps in the one above,
 * which is the setting that reads as one mark rather than as a spray. 34° against
 * an arm spacing of 72–120° is deliberately neither.
 */
export const SIGIL = {
  /** Arms per figure. Three is a rune, five is a snowflake; the range covers both. */
  minArms: 3,
  maxArms: 5,
  /** How far off an even fan one arm strays, in degrees. A perfect fan reads as printed. */
  stray: 11,
  /** How far an arm reaches into its own generation's radius. */
  minReach: 0.55,
  maxReach: 1,

  /** Each generation is this much of its parent, turned this far clockwise. */
  shrink: 0.46,
  turn: 34,

  /** Stroke width and alpha per generation, as a share of the one above. */
  taper: 0.62,
  fade: 0.68,

  /**
   * The only defensive number here, and the reason it exists is that the figure
   * grows as `arms ^ depth`: five arms at six generations is fifteen thousand
   * strokes, which is a quarter of a megabyte of path data inlined into the
   * stylesheet for a mark eight pixels wide.
   *
   * A generation is drawn whole or not at all. Cutting mid-generation would
   * leave the figure lopsided — the arms drawn before the budget ran out fully
   * detailed and the rest bare — which reads as a rendering fault rather than as
   * a mark, and would do it differently for every key.
   */
  maxStrokes: 900,

  /** The radius the root generation is drawn at. Arbitrary: the box is a viewBox. */
  root: 100,
} as const;

/** Radians, since every angle below is trigonometry and none of it is CSS. */
const RADIANS = Math.PI / 180;

/**
 * A stroke width, which is the one number here that may **not** go through
 * ./geometry's one-decimal printer.
 *
 * Coordinates are drawn in the figure's own units and are tens or hundreds, so a
 * decimal place is more than an eye resolves. A stroke width is not: it is
 * converted from drawn pixels into viewBox units, and the bigger the mark the
 * smaller that number gets. At the size the seal is laid on, one decimal is
 * already a few percent out; at twice that it rounds to `0.2` where it wanted
 * `0.156`, and a little further on it rounds to nothing at all and the mark
 * silently stops being drawn. Three decimals, trailing zeros dropped.
 */
const w = (value: number): string => String(Number(value.toFixed(3)));

/**
 * The one colour this file invents, and the reason it is only one.
 *
 * Every other mark on the board is drawn in the ink of the thing it is drawn on
 * — a scrap of tape gets `ink.tapeInk`, a screw head gets `plate.screwSlot`, a
 * zone stencil gets `ink.stencilZone` — because a mark scratched into a surface
 * is made of that surface's own material, and because a second copy of a colour
 * is a second place for it to drift. Those come in from the call site; none of
 * them is restated here.
 *
 * The seal and the figure behind the wash are the exception: they are drawn on
 * nothing. There is no plate under them and no lettering beside them to borrow
 * from, so they need a colour of their own, and this file is entitled to invent
 * one for the same reason ./damage keeps `PIGMENTS` — it is generated, exempt
 * from the transcription check, and the value is a decision rather than a
 * transcription.
 */
export const SIGIL_INK = {
  /** Old brass at the bottom of a dark room. The lit wall of everything cut into the plate. */
  ghost: 'rgb(184,171,134)',
  /**
   * What the figure over the seal is made of since gt#108: nothing. It is a
   * shadow, so it is the board's own dark — the brown-black an unlit plate is
   * (`plate.unlit` in ./reference) — laid on at part strength, which darkens
   * whatever is under it in proportion and adds no colour of its own.
   */
  shade: 'rgb(6,4,3)',
  /**
   * The light that shadow is cast in: a dim pool the size of the seal's inner
   * ring, brightest in the middle and gone by the ring. The seal's own brass,
   * because it is the same overhead light that catches the lit wall of the
   * cut. Without it a shadow on a plate this dark has nothing to be darker
   * than; with it the figure is something standing between the board and a
   * light, which is the whole of what it is meant to be.
   */
  pool:
    'radial-gradient(circle closest-side, rgba(184,171,134,0.22) 0%, rgba(184,171,134,0.1) 55%, rgba(184,171,134,0) 100%)',
} as const;

// ----------------------------------------------------------------- one figure

/** One generation of a figure: every stroke in it, at the weight it is drawn. */
export interface GlyphLevel {
  /** Every stroke of this generation, as one path — `M…L…M…L…`. */
  readonly d: string;
  /** A share of the caller's stroke width and alpha, falling off per generation. */
  readonly width: number;
  readonly alpha: number;
}

/** What a figure occupies, so it can be framed or centred without being measured. */
export interface GlyphBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export interface Glyph {
  /** Coarsest generation first. Never empty — a depth under 1 still draws its root. */
  readonly levels: readonly GlyphLevel[];
  readonly bounds: GlyphBounds;
  /**
   * How far the furthest stroke end is from the figure's own hub — the point
   * every arm of the first generation leaves from (gt#102). The radius of the
   * circle the figure sweeps when it is turned about that hub, which is not
   * the middle of {@link Glyph.bounds} and on a three-armed figure is nowhere
   * near it.
   */
  readonly reach: number;
}

/** One node waiting to grow: where it is, how big, and how far it has been turned. */
interface Node {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly spin: number;
}

function build(key: string, depth: number): Glyph {
  const r = draws(seedOf(key));

  // The arm set: drawn once, reused at every generation and by every node. This
  // is the load-bearing line of the file — see the header.
  const count = Math.round(r.between(SIGIL.minArms, SIGIL.maxArms));
  const spread = 360 / count;
  const lean = r.unit() * 360;
  const arms = Array.from({ length: count }, (_, i) => ({
    angle: (lean + i * spread + r.between(-SIGIL.stray, SIGIL.stray)) * RADIANS,
    reach: r.between(SIGIL.minReach, SIGIL.maxReach),
  }));

  const turn = SIGIL.turn * RADIANS;
  const levels: GlyphLevel[] = [];

  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  let reach = 0;
  let strokes = 0;
  let frontier: Node[] = [{ x: 0, y: 0, radius: SIGIL.root, spin: 0 }];

  for (let generation = 0; generation < Math.max(1, depth); generation++) {
    // Whole generation or none of it. See SIGIL.maxStrokes.
    if (strokes + frontier.length * arms.length > SIGIL.maxStrokes) break;

    const marks: string[] = [];
    const next: Node[] = [];

    for (const node of frontier) {
      for (const arm of arms) {
        const angle = arm.angle + node.spin;
        const x = node.x + Math.cos(angle) * node.radius * arm.reach;
        const y = node.y + Math.sin(angle) * node.radius * arm.reach;

        marks.push(`M${n(node.x)} ${n(node.y)}L${n(x)} ${n(y)}`);
        next.push({ x, y, radius: node.radius * SIGIL.shrink, spin: node.spin + turn });

        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        reach = Math.max(reach, Math.hypot(x, y));
      }
    }

    strokes += marks.length;
    levels.push({
      d: marks.join(''),
      width: Math.pow(SIGIL.taper, generation),
      alpha: Math.pow(SIGIL.fade, generation),
    });
    frontier = next;
  }

  return { levels, bounds: { minX, maxX, minY, maxY }, reach };
}

/**
 * The figure for a key, at a depth. Memoised, which is what makes this file's
 * determinism law hold by construction rather than by discipline: the same key
 * does not merely produce an equal figure on the second call, it produces the
 * identical one.
 */
const built = new Map<string, Glyph>();

export function glyphOf(key: string, depth: number): Glyph {
  const memo = `${key}|${depth}`;
  const had = built.get(memo);
  if (had) return had;
  const made = build(key, depth);
  built.set(memo, made);
  return made;
}

// -------------------------------------------------------------------- drawing

/** The square a figure has to be framed in, and the extent it spans. */
function frame(bounds: GlyphBounds, pad: number): { readonly view: string; readonly span: number } {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  // Square, so a mark laid into a square box is never stretched — a figure whose
  // arms are longer one way should sit in the middle of its box, not fill it.
  const span = Math.max(width, height) * (1 + pad * 2);
  const x = bounds.minX + width / 2 - span / 2;
  const y = bounds.minY + height / 2 - span / 2;
  return { view: `${n(x)} ${n(y)} ${n(span)} ${n(span)}`, span };
}

/**
 * The square a figure is framed in when it is going to be *turned* (gt#102): the
 * hub in the middle, and wide enough for the whole sweep.
 *
 * {@link frame} centres the figure's bounding box, which is right for a mark
 * that sits still in a box and wrong for one that rotates — turned about the
 * middle of its box, a figure's hub travels in a circle and the whole thing
 * wobbles like a wheel on a bent axle. Framed this way the element's centre is
 * the hub, so a CSS `rotate` turns it about the point it grows from, and that
 * point can be put exactly on something else.
 */
function hubFrame(reach: number, pad: number): { readonly view: string; readonly span: number } {
  // To the one decimal the view is written at, so the two halves are exactly
  // equal on the page and the hub is the centre rather than a twentieth off it.
  const half = Math.round((reach || 1) * (1 + pad * 2) * 10) / 10;
  return { view: `${n(-half)} ${n(-half)} ${n(half * 2)} ${n(half * 2)}`, span: half * 2 };
}

/**
 * A second, wider and fainter stroke under every stroke of a figure, which is
 * what makes it read as light rather than as a line (gt#102): a thin core with a
 * soft edge. Drawn rather than blurred — a CSS blur over a figure the size of
 * the board is a filter the compositor runs on every frame it turns.
 */
export interface Halo {
  /** The under-stroke's width, as a multiple of the stroke it sits under. */
  readonly width: number;
  /** And its alpha, as a share of that stroke's. */
  readonly alpha: number;
}

/**
 * The figure as `<path>` elements, coarsest generation first, in a group that
 * carries everything the strokes share.
 *
 * One path per generation rather than one per stroke: it is the difference
 * between a few hundred bytes and a few kilobytes, and the generation is the
 * only thing a stroke's weight depends on. It is also what makes the recursion
 * *readable* — each generation is drawn thinner and fainter than the one above,
 * so the eye takes the figure first and finds the copies inside it later.
 */
export function glyphMarkup(
  glyph: Glyph,
  pigment: string,
  stroke: number,
  alpha: number,
  halo?: Halo,
): string {
  // Every halo before any core, so no core is ever dimmed by a neighbour's glow.
  const paths =
    (halo ? strokes(glyph, stroke, alpha, halo.width, halo.alpha) : '') + strokes(glyph, stroke, alpha);
  return `<g fill='none' stroke='${pigment}' stroke-linecap='round'>${paths}</g>`;
}

/**
 * A figure's generations as bare `<path>` elements — width and alpha, and no
 * colour. {@link glyphMarkup} wraps these in a pigment; the seal does not,
 * because its geometry is drawn twice in two colours and takes each from the
 * `<use>` that draws it.
 */
function strokes(glyph: Glyph, stroke: number, alpha: number, wide = 1, faint = 1): string {
  return glyph.levels
    .map(
      (level) =>
        `<path d='${level.d}' stroke-width='${w(stroke * level.width * wide)}' ` +
        `stroke-opacity='${(alpha * level.alpha * faint).toFixed(2)}'/>`,
    )
    .join('');
}

/** Breathing room around a framed mark, as a share of its own extent. */
const MARK_PAD = 0.06;

export interface MarkSpec {
  /** What this mark belongs to. The seed, and the only thing that decides its shape. */
  readonly key: string;
  /** How many generations. Two is a scratch, five is a seal. */
  readonly depth: number;
  /** The box it is drawn in, in pixels. Square. */
  readonly size: number;
  /** The coarsest generation's stroke, in pixels of that box. */
  readonly stroke: number;
  readonly alpha: number;
  readonly pigment: string;
  /**
   * Frame the figure about its hub rather than about its bounding box, for a
   * mark that is going to be turned. See {@link hubFrame}.
   */
  readonly centred?: boolean;
  /**
   * With `centred`: frame the figure as if it were drawn this deep, whatever
   * depth it is actually drawn at (gt#103).
   *
   * A deeper figure reaches further, so framed to its own reach it is drawn
   * *smaller* to fit the same box — turn SERIOUSNESS up and the whole figure
   * shrank a little to make room for its new tips. Framed to its deepest, the
   * arms stay exactly where they are and a generation is added at the ends of
   * them. Which is also what lets the same figure be cut into the plate under
   * it at one fixed scale.
   */
  readonly frameDepth?: number;
  /** Draw it as light: a soft wide stroke under every stroke. See {@link Halo}. */
  readonly halo?: Halo;
}

/**
 * How big a box a figure framed about its hub needs for its furthest stroke to
 * land `radius` pixels from the middle — so a turning figure can be sized to
 * fit *inside* something round, which a box size alone does not say.
 */
export const hubBox = (radius: number): number => radius * 2 * (1 + MARK_PAD * 2);

/**
 * One mark as a ready-to-use CSS `url()`.
 *
 * `stroke` is given in pixels of the drawn box and converted into viewBox units
 * here, so the same number means the same hairline whether the mark is drawn at
 * eight pixels on a screw head or at seven hundred behind the wash. A stroke
 * width in viewBox units would be the caller doing this arithmetic themselves,
 * differently, at every call site.
 */
export function markTile(spec: MarkSpec): string {
  const glyph = glyphOf(spec.key, spec.depth);
  const { view, span } = spec.centred
    ? hubFrame(glyphOf(spec.key, spec.frameDepth ?? spec.depth).reach, MARK_PAD)
    : frame(glyph.bounds, MARK_PAD);
  const stroke = (spec.stroke * span) / spec.size;
  return uri(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${n(spec.size)}' height='${n(spec.size)}' ` +
      `viewBox='${view}'>${glyphMarkup(glyph, spec.pigment, stroke, spec.alpha, spec.halo)}</svg>`,
  );
}

/** A figure moved somewhere, and how much its own units were shrunk to get there. */
export interface Placed {
  /**
   * How much the figure's own units are scaled by. A stroke width in drawn
   * pixels has to be *divided* by this before it is written, because the
   * transform below scales the stroke along with everything else.
   */
  readonly scale: number;
  /** Ready for an SVG `transform` attribute. */
  readonly transform: string;
}

/**
 * Put a figure at a point, at a size, optionally turned — for the two callers
 * that draw a mark into an SVG they are already building rather than into a
 * tile of its own: the seal's inscription, and the wire layer's junctions.
 *
 * The order is the whole of it. `translate` to the seat, then `rotate`, then
 * `scale`, then `translate` the figure's own centre back to the origin — so the
 * mark turns about *itself* at the point it was placed. Rotating before
 * translating would swing it round the origin of whatever is drawing it, which
 * on the seal is an orbit and on the board is off-screen.
 */
export function placeGlyph(glyph: Glyph, x: number, y: number, size: number, spin = 0): Placed {
  const { span } = frame(glyph.bounds, 0);
  const scale = size / (span || 1);
  const cx = -(glyph.bounds.minX + glyph.bounds.maxX) / 2;
  const cy = -(glyph.bounds.minY + glyph.bounds.maxY) / 2;
  return {
    scale,
    transform:
      `translate(${n(x)} ${n(y)}) rotate(${n(spin)}) ` +
      `scale(${scale.toFixed(3)}) translate(${n(cx)} ${n(cy)})`,
  };
}

// ----------------------------------------------------------------------- seals

/**
 * What a source module's mark is seeded by, wherever it is drawn (gt#103): cut
 * into the seal at that module's station, and again in its colour to glow
 * there. One function so the two cannot come to disagree. The tape on that
 * module's cable is wound off the same key (gt#107), for the same reason: it is
 * that module's.
 *
 * `wire:` because the cable was where a source's mark was first drawn, and
 * changing the prefix would change every mark already on the board.
 */
export const sourceKey = (id: string): string => `wire:${id}`;

/** The figure cut into the middle of a seal. */
export interface SealFigure {
  readonly key: string;
  /** How many generations are cut. Few: this is the coarse figure, the part a hand would scribe. */
  readonly depth: number;
  /** The depth its scale is taken at — see {@link MarkSpec.frameDepth}. */
  readonly frameDepth: number;
  /** How far, in pixels of the seal's box, the figure at `frameDepth` reaches from the centre. */
  readonly radius: number;
}

export interface SealSpec {
  /** Seeds the scribing of the rings, and the wear. */
  readonly key: string;
  /** The box, in pixels. Square. */
  readonly size: number;
  /** One key per station, clockwise from the top. Each is the seed of the mark cut there. */
  readonly marks: readonly string[];
  /** Generations per inscribed mark. Small — these are read at ring scale. */
  readonly depth: number;
  readonly stroke: number;
  readonly alpha: number;
  /** The two colours of a cut: the wall in shadow, and the wall the light catches. */
  readonly dark: string;
  readonly lit: string;
  /** The figure at the centre, if one is cut. */
  readonly figure?: SealFigure;
  /** How broken the cut is by now. The same filter the scratches and the rust are roughened by. */
  readonly wear: Wear;
}

/**
 * The seal's proportions, as shares of its own radius. Exported because the
 * figure that turns inside it (gt#102) is sized to the inner ring, and a second
 * copy of `0.78` in ../ui would be the two drifting apart.
 *
 * Everything from `passes` down is gt#103, and is what makes it a thing somebody
 * *cut*. A ring is not one circle: it is a few passes with a scribe that each
 * go most of the way round and do not quite agree on the radius, so where two
 * overlap there are two tracks. `cut` is how far apart the two walls of a
 * groove are drawn, in pixels.
 */
export const SEAL = {
  /** The outer ring, the inner one, and where an inscribed mark is centred. */
  outer: 0.98,
  inner: 0.78,
  /** How big one inscribed mark is drawn, as a share of the band between the rings. */
  markScale: 0.72,

  /** Passes of the scribe per ring, how far round each goes, and how far off true. */
  passes: 3,
  minSweep: 165,
  maxSweep: 245,
  stray: 16,
  wander: 2.4,

  /** A division mark across the inner ring between each pair of stations, in and out. */
  tickIn: 0.022,
  tickOut: 0.03,

  /** Half the distance between a groove's two walls, in pixels, and how strong each is. */
  cut: 0.55,
  shadow: 1,
  shine: 0.75,
} as const;

/** Where one station of a seal is, in pixels of the seal's own box. */
export interface SealSeat {
  /** Degrees clockwise from three o'clock, the way SVG and CSS both count. */
  readonly bearing: number;
  readonly x: number;
  readonly y: number;
  /** How far a mark seated here is turned, so it stands off the ring rather than lying along it. */
  readonly spin: number;
  /** The box a mark here is drawn in. */
  readonly size: number;
}

/**
 * The stations of a seal: evenly round the band between its two rings, the
 * first at the top. Exported because the marks are drawn twice — cut into the
 * plate here, and laid over it as light by ../ui/board (gt#104) — and the second
 * has to land on the first.
 */
export function sealSeats(size: number, count: number): SealSeat[] {
  const radius = size / 2;
  const seat = (radius * (SEAL.inner + SEAL.outer)) / 2;
  const reach = radius * (SEAL.outer - SEAL.inner) * SEAL.markScale;
  return Array.from({ length: count }, (_, i) => {
    const bearing = (360 / count) * i - 90;
    return {
      bearing,
      x: radius + Math.cos(bearing * RADIANS) * seat,
      y: radius + Math.sin(bearing * RADIANS) * seat,
      // A quarter turn past its own bearing.
      spin: bearing + 90,
      size: reach,
    };
  });
}

/**
 * A seal: two scribed rings with a mark cut at every station between them,
 * division marks across the inner ring, and a figure at the centre — the one
 * piece of this file that is a composition rather than a figure.
 *
 * It is **cut**, and that is the whole of gt#103. It was two perfect hairline
 * circles in one flat colour, on a plate that is scratched, rusted and worn
 * everywhere else, and it read as a drawing laid over the board by a different
 * program. Three things make it part of the plate:
 *
 * - **Every stroke is a groove.** The geometry is written once and drawn twice,
 *   a fraction of a pixel apart: the wall in shadow, and the wall the light
 *   catches. The same two colours the scratch layer cuts in, passed in by the
 *   caller, because a cut is made of the surface it is cut into.
 * - **The rings are scribed.** See {@link SEAL}.
 * - **It is worn.** The whole cut goes through ./damage's wear filter, so it is
 *   pushed off true and eaten through in places. A seal that old is not intact.
 *
 * The marks are keyed by the caller — the board passes one per source module —
 * so the inscription is a line of different figures in one hand rather than one
 * figure stamped round a circle. That is the difference between a seal and a
 * doily.
 */
export function sealTile(spec: SealSpec): string {
  const radius = spec.size / 2;
  const r = draws(seedOf(spec.key));

  /** One ring, as the passes of a scribe that do not quite agree. */
  const ring = (at: number): string => {
    let d = '';
    for (let pass = 0; pass < SEAL.passes; pass++) {
      const from = (360 / SEAL.passes) * pass + r.between(-SEAL.stray, SEAL.stray);
      const sweep = r.between(SEAL.minSweep, SEAL.maxSweep);
      const own = radius * at + r.between(-SEAL.wander, SEAL.wander);
      const point = (degrees: number): string =>
        `${n(radius + Math.cos(degrees * RADIANS) * own)} ${n(radius + Math.sin(degrees * RADIANS) * own)}`;
      d += `M${point(from)}A${n(own)} ${n(own)} 0 ${sweep > 180 ? 1 : 0} 1 ${point(from + sweep)}`;
    }
    return `<path d='${d}'/>`;
  };

  const seats = sealSeats(spec.size, spec.marks.length);

  // A division across the inner ring, halfway between each pair of stations.
  const half = 180 / Math.max(1, spec.marks.length);
  const ticks = seats
    .map(({ bearing }) => {
      const angle = (bearing + half) * RADIANS;
      const at = (share: number): string =>
        `${n(radius + Math.cos(angle) * radius * share)} ${n(radius + Math.sin(angle) * radius * share)}`;
      return `M${at(SEAL.inner - SEAL.tickIn)}L${at(SEAL.inner + SEAL.tickOut)}`;
    })
    .join('');

  const inscribed = seats
    .map((seat, i) => {
      const glyph = glyphOf(spec.marks[i] ?? '', spec.depth);
      const placed = placeGlyph(glyph, seat.x, seat.y, seat.size, seat.spin);
      return `<g transform='${placed.transform}'>${strokes(glyph, spec.stroke / placed.scale, 1)}</g>`;
    })
    .join('');

  // The figure, hub on the centre, at the scale the light one over it is drawn
  // at — so at rest the light lies in the cut.
  let centre = '';
  if (spec.figure) {
    const glyph = glyphOf(spec.figure.key, spec.figure.depth);
    const scale = spec.figure.radius / (glyphOf(spec.figure.key, spec.figure.frameDepth).reach || 1);
    centre =
      `<g transform='translate(${n(radius)} ${n(radius)}) scale(${scale.toFixed(3)})'>` +
      `${strokes(glyph, spec.stroke / scale, 1)}</g>`;
  }

  const id = `s${seedOf(spec.key)}`;
  const wall = (pigment: string, offset: number, alpha: number): string =>
    `<use href='#${id}' stroke='${pigment}' opacity='${(spec.alpha * alpha).toFixed(2)}' ` +
    `transform='translate(${n(offset)} ${n(offset)})'/>`;

  return uri(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${n(spec.size)}' height='${n(spec.size)}'>` +
      // Worn as one picture, not as a tile: see `Patch` in ./damage, and
      // `stationTile` below, which has to wear the same way.
      `<defs>${worn(`w${id}`, wearSeed(spec), spec.size, spec.wear, whole(spec))}` +
      // The cut, once. No colour of its own: each wall below brings one.
      `<g id='${id}' fill='none' stroke-linecap='round' stroke-width='${w(spec.stroke)}'>` +
      `${ring(SEAL.outer)}${ring(SEAL.inner)}<path d='${ticks}'/>${inscribed}${centre}</g></defs>` +
      // Shadow up and to the left, light down and to the right: the same side
      // of a groove the scratch layer lights.
      `<g filter='url(#w${id})'>${wall(spec.dark, -SEAL.cut, SEAL.shadow)}` +
      `${wall(spec.lit, SEAL.cut, SEAL.shine)}</g></svg>`,
  );
}

/** The seed a seal's wear is drawn from. One function, because two drawings have to agree on it. */
const wearSeed = (spec: SealSpec): number => seedOf(spec.key) % 997;

/** The whole of a seal, as the patch its wear is run over. */
const whole = (spec: SealSpec): Patch => ({ x: 0, y: 0, width: spec.size, height: spec.size });

/** One station's mark drawn on its own, and where on the seal it goes. */
export interface StationArt {
  /** A ready-to-use CSS `url()`. */
  readonly image: string;
  /** The top left of its box, in pixels of the seal's box, and the box's side. */
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

/**
 * One station of a seal again, alone, in a colour — the same cut, glowing (gt#106).
 *
 * This is what a lit mark is. Not a second drawing laid over the hardware, but
 * the groove that is already in the metal, filled with its module's colour:
 * the same figure at the same seat and the same turn, and — which is the part
 * that takes care — **worn the same way**. The seal's wear pushes each stroke
 * off true and eats gaps through it. A clean line laid along a broken cut
 * would glow across the gaps, and read at once as a line on top.
 *
 * So the mark is drawn in the seal's own coordinates, through the seal's own
 * filter with the seal's own seed, over a patch just big enough to hold it.
 * Unstitched noise is the same at a point whatever patch it is run over (see
 * `Patch` in ./damage), so the small picture breaks exactly where the large
 * one does. The box is on whole pixels, so the two also land on one grid.
 *
 * `weight` is how much wider than the cut the glow is drawn: a groove has two
 * walls half a pixel either side of where it was scribed, and the glow fills
 * both. `halo` is the little it spills.
 */
export function stationTile(
  spec: SealSpec,
  index: number,
  pigment: string,
  weight = 1,
  halo?: Halo,
): StationArt {
  const seat = sealSeats(spec.size, spec.marks.length)[index];
  if (!seat) return { image: 'none', x: 0, y: 0, size: 0 };

  const glyph = glyphOf(spec.marks[index] ?? '', spec.depth);
  const placed = placeGlyph(glyph, seat.x, seat.y, seat.size, seat.spin);
  const stroke = spec.stroke * weight;
  // The figure spans the seat's size and may be turned any way, so it fits a
  // circle of that diameter's diagonal; then room for the tear and the halo.
  const half = Math.ceil(seat.size * 0.71 + spec.wear.tear + stroke * (halo?.width ?? 1) + 2);
  const x = Math.round(seat.x) - half;
  const y = Math.round(seat.y) - half;
  const size = half * 2;

  const id = `g${seedOf(spec.key)}`;
  const paths =
    (halo ? strokes(glyph, stroke / placed.scale, 1, halo.width, halo.alpha) : '') +
    strokes(glyph, stroke / placed.scale, 1);

  return {
    x,
    y,
    size,
    image: uri(
      `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' ` +
        `viewBox='${x} ${y} ${size} ${size}'>` +
        `<defs>${worn(id, wearSeed(spec), spec.size, spec.wear, { x, y, width: size, height: size })}</defs>` +
        `<g filter='url(#${id})' fill='none' stroke='${pigment}' stroke-linecap='round' ` +
        `opacity='${spec.alpha.toFixed(2)}'><g transform='${placed.transform}'>${paths}</g></g></svg>`,
    ),
  };
}

// ----------------------------------------------------------- a figure in parts

/**
 * One part of a figure that moves as a piece (gt#108): some strokes, and the
 * point they hang from.
 */
export interface GlyphPart {
  /** Where this part is jointed to the one before it. The figure's own units, hub at the origin. */
  readonly base: { readonly x: number; readonly y: number };
  /** Its strokes, generation by generation, each at that generation's own weight. */
  readonly levels: readonly GlyphLevel[];
  /** What those strokes span, the base included. */
  readonly bounds: GlyphBounds;
}

/** A limb, and the fingers that hang from the ends of its strokes. */
export interface GlyphLimb extends GlyphPart {
  readonly fingers: readonly GlyphPart[];
}

/**
 * A figure taken apart at its first two joints.
 *
 * The **trunk** is the first generation: the arms off the hub. A **limb**
 * hangs from the tip of each arm and is the second generation's strokes there.
 * A **finger** hangs from the tip of each of a limb's strokes and is everything
 * deeper than that, however many generations there are.
 *
 * Three tiers and not one per generation, because this is what gets *moved*:
 * each part is one element turning about its base, and a figure five
 * generations deep has six hundred strokes in its last generation alone. Two
 * joints is where it stops reading as a drawing being rotated and starts
 * reading as a thing with limbs; a third would be a hundred and fifty more
 * moving pieces for a tremor at the tips.
 */
export interface GlyphTree {
  readonly trunk: GlyphPart;
  readonly limbs: readonly GlyphLimb[];
}

/** One stroke as it was written: its text, and where it ends. */
interface Drawn {
  readonly d: string;
  readonly x: number;
  readonly y: number;
  readonly fromX: number;
  readonly fromY: number;
}

const drawnIn = (d: string): Drawn[] =>
  [...d.matchAll(/M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({
    d: m[0],
    fromX: Number(m[1]),
    fromY: Number(m[2]),
    x: Number(m[3]),
    y: Number(m[4]),
  }));

const partOf = (
  base: { readonly x: number; readonly y: number },
  generations: ReadonlyArray<{ readonly level: GlyphLevel; readonly strokes: readonly Drawn[] }>,
): GlyphPart => {
  let minX = base.x;
  let maxX = base.x;
  let minY = base.y;
  let maxY = base.y;
  const levels: GlyphLevel[] = [];
  for (const { level, strokes } of generations) {
    if (!strokes.length) continue;
    for (const stroke of strokes) {
      minX = Math.min(minX, stroke.x, stroke.fromX);
      maxX = Math.max(maxX, stroke.x, stroke.fromX);
      minY = Math.min(minY, stroke.y, stroke.fromY);
      maxY = Math.max(maxY, stroke.y, stroke.fromY);
    }
    levels.push({ d: strokes.map((stroke) => stroke.d).join(''), width: level.width, alpha: level.alpha });
  }
  return { base, levels, bounds: { minX, maxX, minY, maxY } };
};

const grown = new Map<string, GlyphTree>();

/**
 * The figure for a key at a depth, in parts. The same figure {@link glyphOf}
 * hands back — it is taken apart from that one's own path data, stroke for
 * stroke — so a part drawn here lands exactly where the whole would have put
 * it, and on the copy of it cut into the seal.
 *
 * Which strokes belong to which part falls out of the order they were drawn
 * in: a generation is every node's arms, node by node, so stroke `n` of
 * generation `g` descends from stroke `floor(n / arms)` of the one before.
 */
export function glyphTree(key: string, depth: number): GlyphTree {
  const memo = `${key}|${depth}`;
  const had = grown.get(memo);
  if (had) return had;

  const glyph = glyphOf(key, depth);
  const generations = glyph.levels.map((level) => ({ level, strokes: drawnIn(level.d) }));
  const [first, second, ...deeper] = generations;
  const arms = first?.strokes.length ?? 0;

  const trunk = partOf({ x: 0, y: 0 }, first ? [first] : []);
  const limbs: GlyphLimb[] = (first?.strokes ?? []).map((arm, i) => {
    const own = second ? second.strokes.slice(i * arms, (i + 1) * arms) : [];
    const fingers = own.map((stroke, j) => {
      const node = i * arms + j;
      return partOf(
        stroke,
        deeper.map(({ level, strokes }, g) => {
          // Each generation further down has `arms` times as many strokes under one node.
          const span = Math.pow(arms, g + 1);
          return { level, strokes: strokes.slice(node * span, (node + 1) * span) };
        }),
      );
    });
    return { ...partOf(arm, second ? [{ level: second.level, strokes: own }] : []), fingers };
  });

  const made: GlyphTree = { trunk, limbs };
  grown.set(memo, made);
  return made;
}

/** How a part is drawn as shadow. Every length is in pixels of the surface it lands on. */
export interface ShadeSpec {
  /** Pixels per unit of the figure. */
  readonly scale: number;
  /** The first generation's stroke; later ones taper off it by the figure's own rule. */
  readonly stroke: number;
  readonly alpha: number;
  readonly pigment: string;
  /** How far the edge is feathered. */
  readonly blur: number;
}

/** One part drawn, and the box it is drawn in, in pixels from the figure's hub. */
export interface ShadeArt {
  /** A ready-to-use CSS `url()`. */
  readonly image: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * One part of a figure as a soft dark shape (gt#108): its strokes drawn wide and
 * feathered, in a box cut close round them.
 *
 * The softness is *in the picture*. A blur is the expensive way to move
 * something — run as a CSS filter it is recomputed on every frame the thing
 * under it changes, and these parts change every frame. Blurred once into its
 * own tile, a part is a texture, and turning a texture is free.
 *
 * Cut close because there are thirty of them. Each is a layer of its own, and
 * a layer the size of the whole figure thirty times over is a quarter of a
 * gigabyte of texture on a dense screen for a shape that covers a few percent
 * of it. The box is on whole pixels and reaches past the strokes by the
 * feather, so nothing is clipped at the edge.
 *
 * Nothing for a part with no strokes — a figure too shallow to have fingers
 * has none to draw.
 */
export function shadeTile(part: GlyphPart, spec: ShadeSpec): ShadeArt | null {
  if (!part.levels.length) return null;
  const pad = spec.stroke / 2 + spec.blur * 3 + 1;
  const x = Math.floor(part.bounds.minX * spec.scale - pad);
  const y = Math.floor(part.bounds.minY * spec.scale - pad);
  const width = Math.ceil(part.bounds.maxX * spec.scale + pad) - x;
  const height = Math.ceil(part.bounds.maxY * spec.scale + pad) - y;
  const paths = part.levels
    .map(
      (level) =>
        `<path d='${level.d}' stroke-width='${w((spec.stroke * level.width) / spec.scale)}' ` +
        `stroke-opacity='${(spec.alpha * level.alpha).toFixed(2)}'/>`,
    )
    .join('');
  return {
    x,
    y,
    width,
    height,
    image: uri(
      `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' ` +
        `viewBox='${x} ${y} ${width} ${height}'>` +
        // Blurred in sRGB, said out loud, because the default is linear light
        // and Gecko does that in eight bits (gt#54). The pigment is nearly
        // black; in linear light its red rounds up to one step and its green
        // and blue round down to none, and one linear step is thirteen sRGB
        // ones on the way back. The shadow came out dark red in Firefox and
        // black in Chrome. There is one colour here and nothing to mix, so
        // which space the feather is computed in changes nothing but that.
        `<defs><filter id='f' filterUnits='userSpaceOnUse' x='${x}' y='${y}' width='${width}' height='${height}' ` +
        `color-interpolation-filters='sRGB'>` +
        `<feGaussianBlur stdDeviation='${w(spec.blur)}'/></filter></defs>` +
        `<g filter='url(#f)'><g transform='scale(${spec.scale.toFixed(4)})' fill='none' ` +
        `stroke='${spec.pigment}' stroke-linecap='round'>${paths}</g></g></svg>`,
    ),
  };
}
