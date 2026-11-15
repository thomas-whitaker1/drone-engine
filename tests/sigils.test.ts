// The board's symbology, and the three things that have to stay true about it.
//
// The first is **determinism**, the same first law tests/damage.test.ts holds
// the injuries to. An inscribed ring that differed per load would be the product
// randomising itself at runtime, which is the one thing this codebase has never
// done.
//
// The second is **that these are geometry rather than a typeface**. gt#36 is
// explicit about it: no external assets and no icon font, because glyphs-as-a-
// typeface is the same rule violation as a stylesheet link. A mark that arrived
// as text would pass every determinism check in here and be exactly the thing
// that was ruled out.
//
// The third is **that the figure is actually self-similar** — one arm set,
// reused at every generation, turned by a fixed angle. That is the whole claim
// the hand makes, and it is the one a seeded generator can most easily stop
// making without anybody noticing: a tree that re-rolled its branches per node
// would still be deterministic, still be inline SVG, still look busy, and would
// no longer be a mark. So the arm set is recovered from the emitted path data
// and checked against the generation above it.

import { describe, expect, it } from 'vitest';
import { PIGMENTS } from '../src/tokens/damage';
import {
  SEAL,
  SIGIL,
  SIGIL_INK,
  glyphOf,
  glyphTree,
  hubBox,
  markTile,
  sealSeats,
  sealTile,
  seedOf,
  shadeTile,
  sourceKey,
  stationTile,
} from '../src/tokens/sigils';

/** Declared, never fetched. The one URL a self-contained inline SVG still carries. */
const SVG_NS = 'http://www.w3.org/2000/svg';

/** The markup back out of a data URI, which is what these assertions are about. */
const markup = (uri: string): string =>
  decodeURIComponent(uri.slice('url("data:image/svg+xml,'.length, -2));

/** One mark, cut to the numbers a zone stencil uses. Enough shape to assert on. */
const MARK = {
  key: 'zone:junk',
  depth: 3,
  size: 14,
  stroke: 1,
  alpha: 0.8,
  // Which pigment is beside the point here — the board passes its own ink in at
  // every call site but one, and none of these assertions is about colour.
  pigment: SIGIL_INK.ghost,
} as const;

/** Eleven stations, as the board has eleven source modules. Any eleven names would do here. */
const STATIONS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'].map(sourceKey);

/** The seal, at the numbers the board lays it on at. */
const SEAL_SPEC = {
  key: 'seal',
  size: 760,
  marks: STATIONS,
  depth: 2,
  stroke: 1.3,
  alpha: 1,
  dark: PIGMENTS.scratchDark,
  lit: SIGIL_INK.ghost,
  figure: { key: 'wash', depth: 2, frameDepth: 5, radius: 270 },
  wear: { warp: 0.018, tear: 3.4, grain: 0.13, bite: 0.42 },
} as const;

/** Built once — it is not small. */
const SEAL_URI = sealTile(SEAL_SPEC);

/** Every stroke of a generation, as the four numbers it was drawn from. */
const strokesOf = (d: string): ReadonlyArray<readonly [number, number, number, number]> =>
  [...d.matchAll(/M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/g)].map(
    ([, x, y, tx, ty]) => [Number(x), Number(y), Number(tx), Number(ty)] as const,
  );

/** Which way a stroke points, in degrees, normalised into 0…360. */
const bearing = ([x, y, tx, ty]: readonly [number, number, number, number]): number =>
  ((Math.atan2(ty - y, tx - x) * 180) / Math.PI + 360) % 360;

/** Every stroke's bearing, in the order it was drawn. */
const bearings = (d: string): number[] => strokesOf(d).map(bearing);

/**
 * How far apart two bearings are, the short way round. Deliberately not a
 * rounding: coordinates are written to one decimal, so a bearing recovered from
 * a short stroke of a deep generation carries a few tenths of a degree of error,
 * and a check that bucketed them would split one true arm into two.
 */
const apart = (a: number, b: number): number => {
  const gap = Math.abs(((a - b) % 360) + 360) % 360;
  return Math.min(gap, 360 - gap);
};

describe('the symbology is inline and self-contained', () => {
  it('ships every mark as an inline data URI', () => {
    // Same rule as gt#23 and as the damage layer: no image assets, nothing the
    // page has to fetch. A board whose sigils arrive over the network is a board
    // that can load without them.
    for (const [name, uri] of Object.entries({ mark: markTile(MARK), seal: SEAL_URI })) {
      expect(uri.startsWith('url("data:image/svg+xml,'), name).toBe(true);
      expect(uri.endsWith('")'), name).toBe(true);
      // The one URL allowed in the file is the SVG namespace, which is a name
      // rather than an address — nothing fetches it. Everything else is a
      // resource the board would have to go and get.
      expect(uri.replace(SVG_NS, ''), name).not.toContain('http');
    }
  });

  it('leaves nothing bare that a url() could not survive', () => {
    // The marks carry more of these than the damage tiles do — every pigment the
    // board passes in is an `rgba(…)`, and every bracket in it is one unquoting
    // away from ending the `url(` early, with no error and no mark.
    for (const [name, uri] of Object.entries({ mark: markTile(MARK), seal: SEAL_URI })) {
      const body = uri.slice('url("'.length, -2);
      expect(body, `${name} leaves a bare delimiter`).not.toMatch(/[<>#"'() ]/);
    }
  });

  it('writes every coordinate to one decimal', () => {
    // The tiles are inlined into the stylesheet, and a depth-five figure is a
    // few hundred strokes. At full float precision that is kilobytes of digits
    // no eye resolves — the same reason ../src/tokens/geometry has `n` at all.
    for (const [, x, y] of markup(markTile(MARK)).matchAll(/M(-?[\d.]+) (-?[\d.]+)L/g)) {
      expect(`${x} ${y}`).toMatch(/^-?\d+(\.\d)? -?\d+(\.\d)?$/);
    }
  });
});

describe('the marks are drawn, never typed', () => {
  it('never reaches for a glyph a font would have to supply', () => {
    // The constraint gt#36 states outright. An icon font is the same rule
    // violation as a Google Fonts link, and it would make a mark *text* — which
    // is the one thing a decoration on this board may never be, because text is
    // the thing the plain-language rule governs.
    const body = markup(markTile(MARK)) + markup(SEAL_URI);
    for (const forbidden of ['<text', '<tspan', 'font-family', '@font-face', 'xlink', '<image']) {
      expect(body, `reaches for ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('draws every stroke as a straight line, with nothing filled', () => {
    // A made-up hand that only cuts straight is trivially consistent with
    // itself, and it is the same geometry the board already wears — every other
    // mark on this plate is a scratch or a slot line.
    const body = markup(markTile(MARK));
    for (const [, d] of body.matchAll(/d='([^']+)'/g)) {
      expect(d).toMatch(/^(M-?[\d.]+ -?[\d.]+L-?[\d.]+ -?[\d.]+)+$/);
      expect(d).not.toContain('Q');
      expect(d).not.toContain('C');
      expect(d).not.toContain('A');
    }
    expect(body).toContain("fill='none'");
  });
});

describe('nothing is randomised at runtime', () => {
  it('hands back the identical figure for a key it has already drawn', () => {
    // Memoised rather than merely pure, which is what makes the law hold by
    // construction: the second call does not produce an equal figure, it
    // produces the same one.
    expect(glyphOf('zone:pulse', 3)).toBe(glyphOf('zone:pulse', 3));
    expect(markTile(MARK)).toBe(markTile({ ...MARK }));
  });

  it('actually depends on the key, so the determinism above means something', () => {
    // Without this, a generator that ignored its seed entirely would pass every
    // other test in the file — six zones wearing one mark, deterministically.
    expect(markTile({ ...MARK, key: 'zone:chain' })).not.toBe(markTile(MARK));
    expect(glyphOf('zone:pulse', 3).levels[0]?.d).not.toBe(glyphOf('zone:voice', 3).levels[0]?.d);
  });

  it('seeds every key the board actually uses into the generator’s live range', () => {
    // Zero is a fixed point of the Park–Miller stream — it produces nothing but
    // zero forever — so a hash that landed there would give one mark no shape at
    // all, and only that one.
    const keys = ['scrap', 'seal', 'zone:fog', 'zone:junk', 'screw:cow:3', sourceKey('guitar')];
    for (const key of keys) {
      expect(seedOf(key), key).toBeGreaterThan(0);
      expect(seedOf(key), key).toBeLessThan(2147483647);
      expect(Number.isInteger(seedOf(key)), key).toBe(true);
    }
    // And distinct keys are distinct seeds across the space actually in use.
    expect(new Set(keys.map(seedOf)).size).toBe(keys.length);
  });
});

describe('the figure is one hand, recursed', () => {
  it('draws each generation from the same arm set, turned by a fixed angle', () => {
    // The load-bearing assertion of the file. Every node of a generation grows
    // the *same* arms as the root, rotated by SIGIL.turn once per generation —
    // so the distinct bearings of one generation are the distinct bearings of
    // the one above it, shifted by exactly that angle.
    //
    // A generator that re-rolled its arms per node would have as many distinct
    // bearings as it had strokes, and this fails on the count alone.
    const { levels } = glyphOf('zone:junk', 4);
    expect(levels.length).toBeGreaterThan(2);

    // The arm set itself, off the root: `arms` strokes from one origin, drawn at
    // full radius, so these are the cleanest bearings in the figure.
    const arms = bearings(levels[0]?.d ?? '');

    for (let generation = 1; generation < levels.length; generation++) {
      const turned = arms.map((angle) => (angle + SIGIL.turn * generation + 360) % 360);
      const here = bearings(levels[generation]?.d ?? '');

      // Every stroke of this generation lies along one of them…
      for (const [i, angle] of here.entries()) {
        const nearest = Math.min(...turned.map((want) => apart(angle, want)));
        expect(nearest, `generation ${generation} stroke ${i} is off the arm set`).toBeLessThan(1);
      }

      // …and every one of them is used, which is what rules out the degenerate
      // pass: a figure that drew the same single arm over and over would satisfy
      // the check above and nothing else.
      for (const [i, want] of turned.entries()) {
        const nearest = Math.min(...here.map((angle) => apart(angle, want)));
        expect(nearest, `generation ${generation} dropped arm ${i}`).toBeLessThan(1);
      }
    }
  });

  it('grows by the branching law, one generation per level', () => {
    const arms = strokesOf(glyphOf('zone:junk', 4).levels[0]?.d ?? '').length;
    expect(arms).toBeGreaterThanOrEqual(SIGIL.minArms);
    expect(arms).toBeLessThanOrEqual(SIGIL.maxArms);

    const { levels } = glyphOf('zone:junk', 4);
    levels.forEach((level, generation) => {
      expect(strokesOf(level.d).length, `generation ${generation}`).toBe(
        Math.pow(arms, generation + 1),
      );
    });
  });

  it('draws each generation thinner and fainter than the one above', () => {
    // What makes the recursion readable rather than a blob: the eye takes the
    // figure first and finds the copies inside it on a second look.
    const { levels } = glyphOf('zone:junk', 4);
    for (let generation = 1; generation < levels.length; generation++) {
      const above = levels[generation - 1];
      const here = levels[generation];
      expect(here?.width ?? 1).toBeLessThan(above?.width ?? 0);
      expect(here?.alpha ?? 1).toBeLessThan(above?.alpha ?? 0);
    }
  });

  it('refuses a generation it cannot afford rather than half-drawing one', () => {
    // The figure grows as `arms ^ depth`, so a deep one is a quarter of a
    // megabyte of path data inlined into the stylesheet. Cutting mid-generation
    // would leave the mark lopsided — detailed on the arms drawn before the
    // budget ran out and bare on the rest — which reads as a rendering fault.
    const deep = glyphOf('zone:junk', 12);
    const drawn = deep.levels.reduce((sum, level) => sum + strokesOf(level.d).length, 0);
    expect(drawn).toBeLessThanOrEqual(SIGIL.maxStrokes);
    expect(deep.levels.length).toBeLessThan(12);

    // Whole generations, every one of them: the last level drawn is as complete
    // as the first.
    const arms = strokesOf(deep.levels[0]?.d ?? '').length;
    deep.levels.forEach((level, generation) => {
      expect(strokesOf(level.d).length, `generation ${generation}`).toBe(
        Math.pow(arms, generation + 1),
      );
    });
  });

  it('draws a depth of one as a figure rather than as nothing', () => {
    const single = glyphOf('scrap', 1);
    expect(single.levels).toHaveLength(1);
    expect(strokesOf(single.levels[0]?.d ?? '').length).toBeGreaterThanOrEqual(SIGIL.minArms);
  });
});

describe('a mark fills the box it is given', () => {
  it('frames the figure to its own extent rather than to the root radius', () => {
    // Children reach past the radius their parent was drawn at — the sum of the
    // shrinking generations is nearly twice it — so a box cut to the root would
    // clip the arms it is there to show.
    const body = markup(markTile(MARK));
    const view = /viewBox='(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)'/.exec(body);
    expect(view).not.toBeNull();

    const [, vx, vy, vw, vh] = view ?? [];
    // Square, so a figure longer one way sits in the middle of its box rather
    // than being stretched to fill it.
    expect(Number(vw)).toBeCloseTo(Number(vh), 1);

    const { bounds } = glyphOf(MARK.key, MARK.depth);
    expect(Number(vx)).toBeLessThanOrEqual(bounds.minX);
    expect(Number(vy)).toBeLessThanOrEqual(bounds.minY);
    expect(Number(vx) + Number(vw)).toBeGreaterThanOrEqual(bounds.maxX);
    expect(Number(vy) + Number(vh)).toBeGreaterThanOrEqual(bounds.maxY);
  });

  it('means the same hairline at eight pixels and at seven hundred', () => {
    // `stroke` is given in pixels of the drawn box and converted into viewBox
    // units here, so a caller never has to do this arithmetic itself — which is
    // the only way an 8px screw mark and a 700px seal can share one generator.
    const widthOf = (uri: string): number =>
      Number(/stroke-width='([\d.]+)'/.exec(markup(uri))?.[1] ?? 0);

    const small = markTile({ ...MARK, size: 8 });
    const large = markTile({ ...MARK, size: 800 });
    // Same drawn hairline, so the viewBox-unit width scales inversely with the box.
    expect(widthOf(small) / widthOf(large)).toBeCloseTo(100, 0);
  });

  it('draws one path per generation, not one per stroke', () => {
    // A few hundred bytes against a few kilobytes, and the generation is the
    // only thing a stroke's weight depends on.
    const body = markup(markTile(MARK));
    expect([...body.matchAll(/<path /g)]).toHaveLength(glyphOf(MARK.key, MARK.depth).levels.length);
  });
});

describe('a mark that is going to be turned', () => {
  // gt#102. The figure in the middle of the seal rotates, and it is light.
  const TURNED = { ...MARK, key: 'wash', depth: 4, size: 560, stroke: 1.5, centred: true } as const;

  it('knows how far its furthest stroke is from its hub', () => {
    const glyph = glyphOf('wash', 4);
    const ends = glyph.levels.flatMap((level) => strokesOf(level.d).map(([, , x, y]) => Math.hypot(x, y)));
    // To one decimal: that is what the path data is written to.
    expect(glyph.reach).toBeCloseTo(Math.max(...ends), 0);
    expect(glyph.reach).toBeGreaterThan(SIGIL.root * SIGIL.minReach);
  });

  it('is framed about that hub, not about its bounding box', () => {
    const glyph = glyphOf('wash', 4);
    const view = /viewBox='(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)'/.exec(markup(markTile(TURNED)));
    const [, x, y, wide, tall] = (view ?? []).map(Number);

    // Square, the origin dead centre, and wide enough for the whole sweep.
    expect(wide).toBe(tall);
    expect(x).toBeCloseTo(-(wide ?? 0) / 2, 1);
    expect(y).toBeCloseTo(-(tall ?? 0) / 2, 1);
    expect((wide ?? 0) / 2).toBeGreaterThanOrEqual(glyph.reach);

    // And it is a different frame from the still one's, or this proves nothing:
    // a figure's box is not centred on its hub.
    const still = /viewBox='([^']+)'/.exec(markup(markTile({ ...TURNED, centred: false })))?.[1];
    expect(still).not.toBe(view?.slice(1).join(' '));
  });

  it('says how big a box puts the furthest stroke at a given radius', () => {
    const glyph = glyphOf('wash', 4);
    const radius = 270;
    const size = hubBox(radius);
    const view = /viewBox='(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)'/.exec(
      markup(markTile({ ...TURNED, size })),
    );
    const span = Number(view?.[3]);
    // Pixels per unit, times the figure's reach in units, is where it lands.
    expect((size / span) * glyph.reach).toBeCloseTo(radius, 0);
  });

  it('draws a halo under every generation when it is asked to be light', () => {
    const halo = { width: 5, alpha: 0.2 };
    const plain = [...markup(markTile(TURNED)).matchAll(/<path /g)];
    const lit = markup(markTile({ ...TURNED, halo }));
    const paths = [...lit.matchAll(/stroke-width='([\d.]+)' stroke-opacity='([\d.]+)'/g)].map(
      ([, wide, alpha]) => [Number(wide), Number(alpha)] as const,
    );
    const levels = plain.length;

    expect(paths).toHaveLength(levels * 2);
    for (let i = 0; i < levels; i++) {
      const [haloWidth = 0, haloAlpha = 0] = paths[i] ?? [];
      const [coreWidth = 1, coreAlpha = 1] = paths[i + levels] ?? [];
      expect(haloWidth / coreWidth).toBeCloseTo(halo.width, 1);
      expect(haloAlpha).toBeLessThan(coreAlpha);
    }
    // Still strokes and nothing else: a halo is drawn, not blurred.
    expect(lit).not.toContain('<filter');
    expect(lit).not.toContain('blur');
  });

  it('leaves every other mark on the board exactly as it was', () => {
    // Neither option is on unless asked for, so the zone stencils, the screws,
    // the scrap and the cable marks are the strings they always were.
    expect(markTile(MARK)).toBe(markTile({ ...MARK, centred: false }));
    expect(markup(markTile(MARK)).match(/<path /g)).toHaveLength(MARK.depth);
  });
});

describe('the seal is cut, not drawn', () => {
  const body = markup(SEAL_URI);
  /** The cut itself: the group every wall is a copy of. */
  const cut = /<g id='(s\d+)'[^>]*>([\s\S]*)<\/g><\/defs>/.exec(body);
  const geometry = cut?.[2] ?? '';

  it('writes the geometry once and draws it twice, as the two walls of a groove', () => {
    // gt#103. A dark wall and a lit one, a fraction of a pixel apart. `<use>`
    // rather than two copies: the path data is most of the tile.
    expect(cut).not.toBeNull();
    const uses = [...body.matchAll(/<use href='#(s\d+)' stroke='([^']+)' opacity='([\d.]+)' transform='translate\((-?[\d.]+) (-?[\d.]+)\)'\/>/g)];
    expect(uses).toHaveLength(2);
    for (const [, id] of uses) expect(id).toBe(cut?.[1]);

    const [shadow, shine] = uses;
    expect(shadow?.[2]).toBe(SEAL_SPEC.dark);
    expect(shine?.[2]).toBe(SEAL_SPEC.lit);
    // Shadow up and to the left, light down and to the right — the side of a
    // groove the scratch layer lights — and the same distance each way.
    expect(Number(shadow?.[4])).toBeLessThan(0);
    expect(Number(shadow?.[5])).toBeLessThan(0);
    expect(Number(shine?.[4])).toBe(-Number(shadow?.[4]));
    expect(Number(shine?.[5])).toBe(-Number(shadow?.[5]));
    expect(Number(shine?.[4])).toBeLessThan(1);

    // And the cut carries no colour of its own, or both walls would be it.
    expect(geometry).not.toContain('stroke=');
    expect(cut?.[0]).toContain("fill='none'");
  });

  it('scribes each ring in passes that do not quite agree', () => {
    // One circle is a compass. A few passes that each go most of the way round
    // at slightly different radii is a hand, and where two overlap there are
    // two tracks.
    const rings = [...geometry.matchAll(/<path d='(M[^']*A[^']*)'\/>/g)].map(([, d]) => d ?? '');
    expect(rings).toHaveLength(2);
    expect(body).not.toContain('<circle');

    const centres = [SEAL.outer, SEAL.inner].map((share) => (SEAL_SPEC.size / 2) * share);
    rings.forEach((d, i) => {
      const passes = [...d.matchAll(/M(-?[\d.]+) (-?[\d.]+)A([\d.]+) ([\d.]+) 0 ([01]) 1 (-?[\d.]+) (-?[\d.]+)/g)];
      expect(passes).toHaveLength(SEAL.passes);

      const radii = passes.map(([, , , r]) => Number(r));
      // Round the ring it is meant to be, each a little off it, no two the same.
      for (const r of radii) expect(Math.abs(r - (centres[i] ?? 0))).toBeLessThanOrEqual(SEAL.wander + 0.05);
      expect(new Set(radii).size).toBe(SEAL.passes);

      // Each pass starts on the ring it is cutting, measured from the middle.
      for (const [, x, y, r] of passes) {
        expect(Math.hypot(Number(x) - 380, Number(y) - 380)).toBeCloseTo(Number(r), 0);
      }
    });

    // Between them the passes close the ring: the shortest sweep is longer than
    // the widest gap two neighbouring starts can leave.
    expect(SEAL.minSweep).toBeGreaterThan(360 / SEAL.passes + SEAL.stray * 2);
    expect(SEAL.maxSweep).toBeLessThan(360);
  });

  it('cuts one mark per station, clockwise from the top, each standing off the ring', () => {
    const placed = [...geometry.matchAll(/translate\(([\d.]+) ([\d.]+)\) rotate\((-?[\d.]+)\)/g)].map(
      ([, x, y, deg]) => [Number(x), Number(y), Number(deg)] as const,
    );
    const seats = sealSeats(SEAL_SPEC.size, STATIONS.length);

    expect(placed).toHaveLength(STATIONS.length);
    placed.forEach(([x, y, spin], i) => {
      expect(x).toBeCloseTo(seats[i]?.x ?? NaN, 0);
      expect(y).toBeCloseTo(seats[i]?.y ?? NaN, 0);
      expect(spin).toBeCloseTo(seats[i]?.spin ?? NaN, 1);
    });

    // The first is at the top, and they go round evenly.
    expect(seats[0]?.x).toBeCloseTo(380, 5);
    expect(seats[0]?.y).toBeLessThan(380);
    seats.forEach((seat, i) => {
      expect(seat.bearing).toBeCloseTo((360 / STATIONS.length) * i - 90, 5);
      expect(seat.spin).toBeCloseTo(seat.bearing + 90, 5);
      // In the band between the two rings, and small enough to stay in it.
      const out = Math.hypot(seat.x - 380, seat.y - 380) / 380;
      expect(out).toBeGreaterThan(SEAL.inner);
      expect(out).toBeLessThan(SEAL.outer);
      expect(seat.size).toBeLessThan(380 * (SEAL.outer - SEAL.inner));
    });
  });

  it('cuts each station with the figure its key is seeded by, so the ring reads as writing', () => {
    // The difference between a seal and a doily: one figure stamped eleven times
    // is a pattern, eleven figures in one hand is an inscription. And the keys
    // are the caller's — the board passes one per source module.
    const first = glyphOf(STATIONS[0] ?? '', SEAL_SPEC.depth).levels[0]?.d ?? 'x';
    const second = glyphOf(STATIONS[1] ?? '', SEAL_SPEC.depth).levels[0]?.d ?? 'y';
    expect(first).not.toBe(second);
    expect(geometry.split(first)).toHaveLength(2);
    expect(geometry.split(second)).toHaveLength(2);

    // A different list is a different seal.
    expect(sealTile({ ...SEAL_SPEC, marks: [...STATIONS].reverse() })).not.toBe(SEAL_URI);
  });

  it('keys a source the same way wherever its mark is drawn', () => {
    // The cable, the cut and the light are one figure in three places, and
    // this is the only thing that makes them so.
    expect(sourceKey('guitar')).toBe('wire:guitar');
    expect(sourceKey('guitar')).not.toBe(sourceKey('bass'));
  });

  it('marks a division across the inner ring between each pair of stations', () => {
    const ticks = [...geometry.matchAll(/<path d='((?:M-?[\d.]+ -?[\d.]+L-?[\d.]+ -?[\d.]+)+)'\/>/g)]
      .map(([, d]) => d ?? '')
      .find((d) => strokesOf(d).length === STATIONS.length);
    expect(ticks).toBeDefined();

    const seats = sealSeats(SEAL_SPEC.size, STATIONS.length);
    strokesOf(ticks ?? '').forEach(([x, y, tx, ty], i) => {
      const inner = Math.hypot(x - 380, y - 380) / 380;
      const outer = Math.hypot(tx - 380, ty - 380) / 380;
      // It crosses the inner ring…
      expect(inner).toBeLessThan(SEAL.inner);
      expect(outer).toBeGreaterThan(SEAL.inner);
      expect(outer).toBeLessThan(SEAL.inner + 0.06);
      // …radially, halfway to the next station.
      const bearing = (Math.atan2(ty - 380, tx - 380) * 180) / Math.PI;
      expect(apart(bearing, (seats[i]?.bearing ?? 0) + 180 / STATIONS.length)).toBeLessThan(0.5);
    });
  });

  it('cuts the turning figure’s coarse arms at the centre, at the size the light is drawn', () => {
    const centre = /<g transform='translate\(380 380\) scale\(([\d.]+)\)'>([\s\S]*?)<\/g>/.exec(geometry);
    expect(centre).not.toBeNull();

    const glyph = glyphOf(SEAL_SPEC.figure.key, SEAL_SPEC.figure.depth);
    const deepest = glyphOf(SEAL_SPEC.figure.key, SEAL_SPEC.figure.frameDepth);
    // Scaled so the *deepest* figure reaches the radius: the cut is the same
    // size whatever depth the light over it is drawn at.
    expect(Number(centre?.[1])).toBeCloseTo(SEAL_SPEC.figure.radius / deepest.reach, 2);
    // Only the coarse generations are cut, and they are that figure's own.
    expect([...(centre?.[2] ?? '').matchAll(/<path /g)]).toHaveLength(SEAL_SPEC.figure.depth);
    expect(centre?.[2]).toContain(glyph.levels[0]?.d ?? 'x');
    // No turn on it: it is cut at the angle the light rests at, which is none.
    expect(centre?.[0]).not.toContain('rotate');

    // And a seal may be cut without one.
    const { figure: _figure, ...plain } = SEAL_SPEC;
    const bare = markup(sealTile(plain));
    expect(bare).not.toContain('translate(380 380) scale');
  });

  it('is worn by the filter the scratches and the rust are worn by, and only where something was cut', () => {
    // Noise as something done *to* geometry, never as the mark — the standard
    // tests/damage.test.ts holds its tiles to.
    expect(body).toContain('<feTurbulence');
    expect(body).toContain('<feDisplacementMap');
    const filter = /<filter id='(w[^']+)'/.exec(body)?.[1];
    expect(filter).toBeDefined();
    expect(body).toContain(`<g filter='url(#${filter})'>`);
    // The filter covers exactly the tile.
    expect(body).toContain(`x='0' y='0' width='${SEAL_SPEC.size}' height='${SEAL_SPEC.size}'`);

    // Take the geometry away and nothing is drawn: both walls are `<use>`s of it.
    const drawn = body.slice(body.indexOf('</defs>'));
    expect(drawn).not.toContain('<path');
    expect(drawn).not.toContain('<rect');
  });

  it('is worn as one picture rather than as a tile', () => {
    // gt#106. Stitched noise is bent to repeat across the area it covers, so the
    // same spot wears differently in a small area than in a large one. The
    // seal does not repeat and has no seam to hide.
    expect(body).toContain("stitchTiles='noStitch'");
    expect(body).not.toContain("stitchTiles='stitch'");
  });

  it('is the same seal every session, and a different one for a different key', () => {
    expect(sealTile({ ...SEAL_SPEC })).toBe(SEAL_URI);
    expect(sealTile({ ...SEAL_SPEC, key: 'other' })).not.toBe(SEAL_URI);
  });

  it('stays small enough to inline', () => {
    // Eleven marks, two rings, a figure and a filter. Drawn twice from one
    // copy; as two copies it would be nearly double this.
    expect(SEAL_URI.length).toBeLessThan(20_000);
  });
});

describe('a station drawn again, to glow', () => {
  // gt#106. The lit mark is its own cut with colour in it, so it has to be the
  // same figure at the same place, worn the same way.
  const COLOUR = 'rgb(255,136,68)';
  const INDEX = 3;
  const art = stationTile(SEAL_SPEC, INDEX, COLOUR, 1.9, { width: 2.6, alpha: 0.28 });
  const lit = markup(art.image);
  const seat = sealSeats(SEAL_SPEC.size, STATIONS.length)[INDEX];

  it('is that station’s figure, at that station’s seat and turn, in the seal’s own coordinates', () => {
    const cutAt = /<g id='s\d+'[^>]*>([\s\S]*)<\/g><\/defs>/.exec(markup(SEAL_URI))?.[1] ?? '';
    const placed = [...cutAt.matchAll(/<g transform='(translate\([\d.]+ [\d.]+\) rotate\(-?[\d.]+\)[^']*)'>/g)].map(
      ([, transform]) => transform,
    );
    // Character for character the transform the seal cut it with.
    expect(lit).toContain(`<g transform='${placed[INDEX]}'>`);
    expect(lit).toContain(glyphOf(STATIONS[INDEX] ?? '', SEAL_SPEC.depth).levels[0]?.d ?? 'missing');
    expect(lit).toContain(`stroke='${COLOUR}'`);
    // And only that one.
    expect([...lit.matchAll(/rotate\(/g)]).toHaveLength(1);
  });

  it('is a box on whole pixels round the seat, big enough for the mark however it is turned', () => {
    expect(Number.isInteger(art.x)).toBe(true);
    expect(Number.isInteger(art.y)).toBe(true);
    expect(Number.isInteger(art.size)).toBe(true);
    expect(art.x + art.size / 2).toBeCloseTo(seat?.x ?? NaN, 0);
    expect(art.y + art.size / 2).toBeCloseTo(seat?.y ?? NaN, 0);
    // A square of the seat's size, turned to its diagonal, plus the tear.
    expect(art.size / 2).toBeGreaterThan(((seat?.size ?? 0) * Math.SQRT2) / 2 + SEAL_SPEC.wear.tear);
    // The picture is that box of the seal and nothing else.
    expect(lit).toContain(`viewBox='${art.x} ${art.y} ${art.size} ${art.size}'`);
    expect(lit).toContain(`width='${art.size}' height='${art.size}'`);
  });

  it('is worn by the seal’s own filter, so it breaks where its cut breaks', () => {
    const turbulence = (svg: string): string[] =>
      [...svg.matchAll(/<feTurbulence [^>]*>/g)].map(([tag]) => tag);
    const displacement = (svg: string): string | undefined => /<feDisplacementMap [^>]*>/.exec(svg)?.[0];
    const holes = (svg: string): string | undefined => /<feColorMatrix [^>]*>/.exec(svg)?.[0];

    // The same noise: same frequencies, same seeds, same tear, same bite —
    // and unstitched, which is what makes it the same at a point whatever
    // area it is run over.
    expect(turbulence(lit)).toEqual(turbulence(markup(SEAL_URI)));
    expect(turbulence(lit).join('')).toContain("stitchTiles='noStitch'");
    expect(displacement(lit)).toBe(displacement(markup(SEAL_URI)));
    expect(holes(lit)).toBe(holes(markup(SEAL_URI)));

    // Run over its own box only, in the seal's coordinates.
    expect(lit).toContain(
      `filterUnits='userSpaceOnUse' x='${art.x}' y='${art.y}' width='${art.size}' height='${art.size}'`,
    );
    expect(lit).toContain("<g filter='url(#");
  });

  it('fills the groove wall to wall and spills a little over the lip', () => {
    const widths = [...lit.matchAll(/stroke-width='([\d.]+)'/g)].map(([, wide]) => Number(wide));
    const plain = [...markup(stationTile(SEAL_SPEC, INDEX, COLOUR).image).matchAll(/stroke-width='([\d.]+)'/g)].map(
      ([, wide]) => Number(wide),
    );
    // Halo first, then the glow, a generation each.
    expect(widths).toHaveLength(SEAL_SPEC.depth * 2);
    expect(plain).toHaveLength(SEAL_SPEC.depth);
    for (let i = 0; i < SEAL_SPEC.depth; i++) {
      expect((widths[i + SEAL_SPEC.depth] ?? 0) / (plain[i] ?? 1)).toBeCloseTo(1.9, 1);
      expect((widths[i] ?? 0) / (widths[i + SEAL_SPEC.depth] ?? 1)).toBeCloseTo(2.6, 1);
    }
  });

  it('is the same every session, different for each station, and nothing for one that is not there', () => {
    expect(stationTile(SEAL_SPEC, INDEX, COLOUR, 1.9, { width: 2.6, alpha: 0.28 })).toEqual(art);
    expect(stationTile(SEAL_SPEC, INDEX + 1, COLOUR).image).not.toBe(stationTile(SEAL_SPEC, INDEX, COLOUR).image);
    expect(stationTile(SEAL_SPEC, 99, COLOUR)).toEqual({ image: 'none', x: 0, y: 0, size: 0 });
  });

  it('is inline, self-contained and small', () => {
    expect(art.image.startsWith('url("data:image/svg+xml,')).toBe(true);
    expect(art.image.slice('url("'.length, -2)).not.toMatch(/[<>#"'() ]/);
    for (const forbidden of ['<text', 'font-family', 'xlink', '<image']) expect(lit).not.toContain(forbidden);
    expect(art.image.length).toBeLessThan(4000);
  });
});

describe('a figure taken apart at its joints', () => {
  // gt#108. The figure over the seal moves in parts: a trunk, a limb at each arm
  // tip, and fingers at each limb tip.
  const KEY = 'wash';
  const DEPTH = 4;
  const tree = glyphTree(KEY, DEPTH);
  const whole = glyphOf(KEY, DEPTH);
  const arms = strokesOf(whole.levels[0]?.d ?? '').length;
  const count = (d: string): number => strokesOf(d).length;

  it('is the same figure, stroke for stroke, with nothing lost and nothing drawn twice', () => {
    // Taken apart from the whole one's own path data — so a part lands where
    // the whole would have put it, and on the copy cut into the seal.
    whole.levels.forEach((level, g) => {
      const pieces: string[] = [];
      if (g === 0) pieces.push(...tree.trunk.levels.map((own) => own.d));
      if (g === 1) pieces.push(...tree.limbs.flatMap((limb) => limb.levels.map((own) => own.d)));
      if (g >= 2) {
        for (const limb of tree.limbs) {
          for (const finger of limb.fingers) pieces.push(finger.levels[g - 2]?.d ?? '');
        }
      }
      expect(pieces.join(''), `generation ${g}`).toBe(level.d);
    });
  });

  it('has a trunk of arms, a limb for each arm and a finger for each of a limb’s strokes', () => {
    expect(arms).toBeGreaterThanOrEqual(SIGIL.minArms);
    expect(tree.trunk.levels).toHaveLength(1);
    expect(count(tree.trunk.levels[0]?.d ?? '')).toBe(arms);
    expect(tree.limbs).toHaveLength(arms);
    for (const limb of tree.limbs) {
      expect(limb.levels).toHaveLength(1);
      expect(count(limb.levels[0]?.d ?? '')).toBe(arms);
      expect(limb.fingers).toHaveLength(arms);
      for (const finger of limb.fingers) {
        // Everything deeper than the limb, however many generations that is.
        expect(finger.levels).toHaveLength(DEPTH - 2);
        finger.levels.forEach((level, g) => expect(count(level.d)).toBe(Math.pow(arms, g + 1)));
      }
    }
  });

  it('joints each part where the stroke it grows from ends', () => {
    expect(tree.trunk.base).toEqual({ x: 0, y: 0 });
    const tips = strokesOf(whole.levels[0]?.d ?? '');
    tree.limbs.forEach((limb, i) => {
      // A limb hangs from the tip of its arm, and its strokes leave from there.
      expect([limb.base.x, limb.base.y]).toEqual([tips[i]?.[2], tips[i]?.[3]]);
      for (const [x, y] of strokesOf(limb.levels[0]?.d ?? '')) expect([x, y]).toEqual([limb.base.x, limb.base.y]);

      const ends = strokesOf(limb.levels[0]?.d ?? '');
      limb.fingers.forEach((finger, j) => {
        expect([finger.base.x, finger.base.y]).toEqual([ends[j]?.[2], ends[j]?.[3]]);
        // And a finger's first strokes leave from the finger's own base.
        for (const [x, y] of strokesOf(finger.levels[0]?.d ?? '')) {
          expect([x, y]).toEqual([finger.base.x, finger.base.y]);
        }
      });
    });
  });

  it('keeps each generation’s own weight, so a part tapers and fades as the whole does', () => {
    expect(tree.trunk.levels[0]?.width).toBe(whole.levels[0]?.width);
    expect(tree.limbs[0]?.levels[0]?.width).toBe(whole.levels[1]?.width);
    expect(tree.limbs[0]?.fingers[0]?.levels[0]?.alpha).toBe(whole.levels[2]?.alpha);
    expect(tree.limbs[0]?.fingers[0]?.levels[1]?.width).toBe(whole.levels[3]?.width);
  });

  it('knows what each part spans, its base included', () => {
    for (const part of [tree.trunk, ...tree.limbs, ...tree.limbs.flatMap((limb) => limb.fingers)]) {
      expect(part.bounds.minX).toBeLessThanOrEqual(part.base.x);
      expect(part.bounds.maxX).toBeGreaterThanOrEqual(part.base.x);
      expect(part.bounds.minY).toBeLessThanOrEqual(part.base.y);
      expect(part.bounds.maxY).toBeGreaterThanOrEqual(part.base.y);
      for (const level of part.levels) {
        for (const [, , x, y] of strokesOf(level.d)) {
          expect(x).toBeGreaterThanOrEqual(part.bounds.minX);
          expect(x).toBeLessThanOrEqual(part.bounds.maxX);
          expect(y).toBeGreaterThanOrEqual(part.bounds.minY);
          expect(y).toBeLessThanOrEqual(part.bounds.maxY);
        }
      }
    }
    // A finger is a small thing: well inside the whole.
    const finger = tree.limbs[0]?.fingers[0];
    expect((finger?.bounds.maxX ?? 0) - (finger?.bounds.minX ?? 0)).toBeLessThan(
      (whole.bounds.maxX - whole.bounds.minX) / 2,
    );
  });

  it('is the same tree every session, and has no fingers when it is too shallow for any', () => {
    expect(glyphTree(KEY, DEPTH)).toBe(tree);
    const shallow = glyphTree(KEY, 2);
    expect(shallow.limbs).toHaveLength(arms);
    for (const limb of shallow.limbs) {
      for (const finger of limb.fingers) expect(finger.levels).toHaveLength(0);
    }
    // One generation is a trunk and nothing hanging from it.
    const stub = glyphTree(KEY, 1);
    for (const limb of stub.limbs) expect(limb.levels).toHaveLength(0);
  });
});

describe('a part drawn as shadow', () => {
  const tree = glyphTree('wash', 4);
  const SPEC = { scale: 0.8, stroke: 11, alpha: 1, pigment: SIGIL_INK.shade, blur: 2.8 } as const;
  const limb = tree.limbs[1];
  if (!limb) throw new Error('No limb.');
  const art = shadeTile(limb, SPEC);
  const svg = markup(art?.image ?? '');

  it('is a box cut close round the part, on whole pixels, with room for the feather', () => {
    expect(art).not.toBeNull();
    for (const value of [art?.x, art?.y, art?.width, art?.height]) expect(Number.isInteger(value)).toBe(true);
    const pad = SPEC.stroke / 2 + SPEC.blur * 3;
    // Reaches past the strokes by the stroke and the feather on every side…
    expect(art?.x).toBeLessThanOrEqual(limb.bounds.minX * SPEC.scale - pad);
    expect((art?.x ?? 0) + (art?.width ?? 0)).toBeGreaterThanOrEqual(limb.bounds.maxX * SPEC.scale + pad);
    expect(art?.y).toBeLessThanOrEqual(limb.bounds.minY * SPEC.scale - pad);
    expect((art?.y ?? 0) + (art?.height ?? 0)).toBeGreaterThanOrEqual(limb.bounds.maxY * SPEC.scale + pad);
    // …and no further than that plus a couple of pixels.
    expect(art?.width).toBeLessThan((limb.bounds.maxX - limb.bounds.minX) * SPEC.scale + pad * 2 + 4);
    // The picture is that box, in pixels from the hub.
    expect(svg).toContain(`viewBox='${art?.x} ${art?.y} ${art?.width} ${art?.height}'`);
    expect(svg).toContain(`width='${art?.width}' height='${art?.height}'`);
  });

  it('draws the part’s own strokes, at the scale it is given, in the colour it is given', () => {
    expect(svg).toContain(`transform='scale(${SPEC.scale.toFixed(4)})'`);
    expect(svg).toContain(`stroke='${SPEC.pigment}'`);
    expect(svg).toContain(limb.levels[0]?.d ?? 'missing');
    // A stroke width in pixels, written in the figure's units so the scale
    // brings it back to what was asked for.
    const wide = Number(/stroke-width='([\d.]+)'/.exec(svg)?.[1]);
    expect(wide * SPEC.scale).toBeCloseTo(SPEC.stroke * (limb.levels[0]?.width ?? 0), 1);
    expect(svg).toContain("fill='none'");
  });

  it('feathers it in the picture, over exactly its own box', () => {
    // Once, into the tile. A CSS blur would be run again on every frame the
    // part moves, and it moves on every frame.
    expect(svg).toContain(`<feGaussianBlur stdDeviation='${SPEC.blur}'/>`);
    expect(svg).toContain(
      `filterUnits='userSpaceOnUse' x='${art?.x}' y='${art?.y}' width='${art?.width}' height='${art?.height}'`,
    );
    expect(svg).toContain("<g filter='url(#f)'>");
    // Soft is not noise: nothing here is roughened.
    expect(svg).not.toContain('feTurbulence');
  });

  it('draws nothing for a part with no strokes', () => {
    const bare = glyphTree('wash', 2).limbs[0]?.fingers[0];
    expect(bare?.levels).toHaveLength(0);
    expect(shadeTile(bare as never, SPEC)).toBeNull();
  });

  it('is the same every time, inline, and small', () => {
    expect(shadeTile(limb, SPEC)).toEqual(art);
    expect(art?.image.startsWith('url("data:image/svg+xml,')).toBe(true);
    expect(art?.image.slice('url("'.length, -2)).not.toMatch(/[<>#"'() ]/);
    for (const forbidden of ['<text', 'font-family', 'xlink', '<image']) expect(svg).not.toContain(forbidden);
    // Every finger of the deepest figure, together, is still a modest string.
    const deep = glyphTree('wash', 5);
    const fingers = deep.limbs.flatMap((own) => own.fingers).map((finger) => shadeTile(finger, SPEC)?.image.length ?? 0);
    expect(fingers.reduce((sum, length) => sum + length, 0)).toBeLessThan(150_000);
  });
});
