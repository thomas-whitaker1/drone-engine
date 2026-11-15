// The board's injuries, and the two things that have to stay true about them.
//
// The first is **determinism**, which is the product's first law wearing a
// different hat: the board is allowed to be dirty, it is not allowed to be dirty
// differently each time you open it. The tiles are generated, so nothing but a
// test can hold that — a hand-written data URI could only rot, but a generated
// one can quietly start moving.
//
// The second is **that these are marks rather than weather**. gt#35 was filed
// because three feTurbulence tiles were doing all the aging and turbulence makes
// clouds: a scratch has a start, an end and a bright side next to a dark one,
// and the old one had none of the three. So the shape of the output is asserted,
// not just its stability. A tile that went back to being fog would pass every
// determinism check in here and be exactly the bug that was reported.

import { describe, expect, it } from 'vitest';
import {
  BREAKAGE,
  CORROSION,
  DAMAGE,
  PIGMENTS,
  bloomField,
  breakage,
  chipField,
  crackField,
  damage,
  placement,
  runStrip,
  runTile,
  scratchField,
} from '../src/tokens/damage';
import { textureLayers } from '../src/tokens';

/** The markup back out of a data URI, which is what these assertions are about. */
const markup = (uri: string): string => decodeURIComponent(uri.slice('url("data:image/svg+xml,'.length, -2));

/** Every tile the board is actually painted with. */
const tiles = Object.entries(damage);

describe('the damage layer is inline and self-contained', () => {
  it('ships every mark as an inline data URI', () => {
    // Same rule as gt#23: no image assets, nothing the page has to fetch. A board
    // whose rust arrives over the network is a board that can load unrusted.
    for (const [name, uri] of tiles) {
      expect(uri.startsWith('url("data:image/svg+xml,'), name).toBe(true);
      expect(uri.endsWith('")'), name).toBe(true);
      expect(uri, name).not.toContain('http://192');
    }
  });

  it('leaves nothing bare that a url() could not survive', () => {
    // Four of these would break the value outright. The other three — space,
    // apostrophe, bracket — are legal only for as long as the double quotes
    // around the url survive, and an unquoted bracket ends the `url(` with no
    // error and no texture. See ../src/tokens/geometry.
    for (const [name, uri] of tiles) {
      const body = uri.slice('url("'.length, -2);
      expect(body, `${name} leaves a bare delimiter`).not.toMatch(/[<>#"'() ]/);
    }
  });

  it('lays the runs tile at exactly its own size', () => {
    // Scaling it is the one thing that would undo it: a run is a taper with a
    // gradient down its length, and a stretched taper is a smear. The board is
    // the only surface that carries runs at all — see tests/module.test.ts for
    // why a plate does not.
    expect(runTile).toBe(`${DAMAGE.runs.width}px ${DAMAGE.runs.height}px`);
    expect(textureLayers.board.runSize).toBe(runTile);
  });

  it('keeps every run narrow enough not to read as a bar', () => {
    // The retune after the first pass went on the board. A streak wide enough to
    // show two parallel edges over its length is a stripe of paint, whatever
    // colour it is; these top out under two pixels and taper hard from there.
    expect(DAMAGE.runs.maxWidth).toBeLessThan(2);
    expect(DAMAGE.runs.maxAlpha).toBeLessThan(0.5);
    // And the tile is wider than the well it repeats along is likely to be, so
    // the eye has nothing periodic to catch.
    expect(DAMAGE.runs.width).toBeGreaterThan(500);
  });

  it('gives every gradient an id a strict XML parser will accept', () => {
    // These tiles are parsed as image/svg+xml, not as HTML. An id beginning with
    // a digit — which `${seed}r` produced for seed 11 — is not an XML name, and
    // the failure mode is the whole tile silently not rendering.
    for (const [name, uri] of tiles) {
      for (const [, id] of markup(uri).matchAll(/id='([^']+)'/g)) {
        expect(id, `${name} has id ${id}`).toMatch(/^[A-Za-z_][\w-]*$/);
      }
    }
  });
});

describe('nothing is randomised at runtime', () => {
  it('redraws every field byte-identical from the same seed', () => {
    // The whole of the first law, checked where it is easiest to break. A board
    // that redecorated itself each session would be the product fiddling behind
    // the user's back.
    expect(scratchField(DAMAGE.scratches)).toBe(damage.scratches);
    expect(bloomField(DAMAGE.rust, CORROSION.rust)).toBe(damage.rust);
    expect(bloomField(DAMAGE.verdigris, CORROSION.verdigris)).toBe(damage.verdigris);
    expect(runStrip(DAMAGE.runs)).toBe(damage.runs);
  });

  it('actually depends on the seed, so the determinism above means something', () => {
    // Without this, a generator that ignored its seed entirely would pass every
    // other test in the file.
    expect(scratchField({ ...DAMAGE.scratches, seed: 5 })).not.toBe(damage.scratches);
    expect(bloomField({ ...DAMAGE.rust, seed: 12 }, CORROSION.rust)).not.toBe(damage.rust);
    expect(runStrip({ ...DAMAGE.runs, seed: 18 })).not.toBe(damage.runs);
  });

  it('spreads the first marks across the tile rather than into one corner', () => {
    // The warm-up, asserted through what it is for. A Park–Miller stream seeded
    // with a small number opens on a run of near-identical values, so without it
    // the first several scratches all start in the same corner — deterministic,
    // and deterministically wrong.
    //
    // A mark is several strokes now (gt#99) and they all start beside each other,
    // so the first eight *marks* are found as the first eight starts that are
    // not next door to one already counted.
    const first: Array<readonly [number, number]> = [];
    for (const [, x, y] of markup(damage.scratches).matchAll(/M(-?[\d.]+) (-?[\d.]+)/g)) {
      const at = [Number(x), Number(y)] as const;
      if (first.every(([fx, fy]) => Math.hypot(fx - at[0], fy - at[1]) > 14)) first.push(at);
      if (first.length === 8) break;
    }

    expect(first.length).toBe(8);
    const xs = first.map(([x]) => x);
    const ys = first.map(([, y]) => y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(DAMAGE.scratches.size / 3);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(DAMAGE.scratches.size / 3);
  });
});

describe('the marks are damage, not weather', () => {
  it('never lets noise be the mark: it is only ever something done to what was drawn', () => {
    // The regression test for gt#35, kept as what gt#35 actually found. Every one of
    // these tiles used to be a turbulence filter and nothing else, and the
    // diagnosis was that turbulence makes clouds. gt#99 brought noise back as
    // *texture* — torn edges, grain — and the line between the two is exactly
    // this: the noise is never painted. It is the second input of a
    // displacement and a mask the drawing is cut into, and nothing else.
    for (const [name, uri] of tiles) {
      const body = markup(uri);
      if (!body.includes('feTurbulence')) continue;

      // Every turbulence is named, and every name is consumed in one of the
      // two ways allowed.
      const noises = [...body.matchAll(/<feTurbulence[^>]*result='(\w+)'/g)].map(([, id]) => id);
      expect(noises.length, name).toBeGreaterThan(0);
      expect([...body.matchAll(/<feTurbulence/g)].length, name).toBe(noises.length);
      expect(body, name).toMatch(/<feDisplacementMap in='SourceGraphic' in2='warp'/);
      expect(body, name).toMatch(/<feColorMatrix in='grain'[^>]*result='holes'/);
      // The filter's last word is the drawing, cut by the mask: `in`, never
      // `over`, and never the noise on its own.
      expect(body, name).toMatch(/<feComposite in='torn' in2='holes' operator='in'\/><\/filter>/);
      // The colour matrix makes an alpha and no colour: its first three rows
      // are nothing, so the noise cannot tint what it masks.
      expect(body, name).toContain("values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ");

      // And there is geometry for it to be done to. Strip the filter out and
      // what is left is still a tile full of drawn marks.
      const drawn = body.replace(/<filter[\s\S]*?<\/filter>/g, '');
      expect(drawn, name).not.toContain('feTurbulence');
      expect([...drawn.matchAll(/<path /g)].length, name).toBeGreaterThan(10);
      expect(drawn, name).toMatch(/<g [^>]*filter='url\(#w\d+\)'>/);
    }
    // The seam runs are plain geometry still, and say so.
    expect(markup(damage.runs)).not.toContain('<filter');
  });

  it('tiles its noise with the tile, so a mark torn across an edge still meets itself', () => {
    for (const [name, uri] of tiles) {
      const body = markup(uri);
      const size = Number(/<svg[^>]* width='(\d+)'/.exec(body)?.[1]);
      for (const [turbulence] of body.matchAll(/<feTurbulence[^>]*>/g)) {
        expect(turbulence, name).toContain("stitchTiles='stitch'");
      }
      for (const [filter] of body.matchAll(/<filter[^>]*>/g)) {
        expect(filter, name).toContain(`filterUnits='userSpaceOnUse' x='0' y='0' width='${size}' height='${size}'`);
      }
    }
  });

  it('draws scratches as three kinds of mark, not thirty of one', () => {
    // gt#99. The first cut was thirty straight segments of one width, each drawn
    // twice, and thirty of anything is a field of lines.
    const body = markup(damage.scratches);
    // Counted by splitting rather than by regex: a pigment is `rgb(216,205,180)`
    // and those parentheses are a capture group, so the pattern silently matches
    // nothing at all and the assertion passes on an empty field.
    const occurrences = (needle: string): number => body.split(needle).length - 1;

    // Gouges: slivers, filled, closed, bone and tar in pairs — a groove with
    // metal showing along its lip. A sliver's width changes along it, which is
    // what a stroke cannot do and what reads as pressure.
    const slivers = [...body.matchAll(/<path d='M[^']*Q[^']*Q[^']*Z' fill='([^']+)'/g)].map(([, fill]) => fill);
    expect(slivers.length).toBeGreaterThan(0);
    expect(slivers.filter((fill) => fill === PIGMENTS.scratchLit).length).toBe(
      slivers.filter((fill) => fill === PIGMENTS.scratchDark).length,
    );
    // And each digs in where it starts: a dark hole with a lit lower wall.
    expect(occurrences('<circle ')).toBe(slivers.length);

    // Drags: fine stroked curves, most of them bone, some of them skipping.
    const drags = [...body.matchAll(/<path d='M[^']*q[^']*' stroke='([^']+)'[^>]*>/g)];
    expect(drags.length).toBeGreaterThan(slivers.length);
    expect(drags.some(([whole]) => whole.includes('stroke-dasharray'))).toBe(true);
    expect(drags.some(([whole]) => !whole.includes('stroke-dasharray'))).toBe(true);
    // The dark twin is the exception among them: only a drag's strongest line
    // is deep enough to have a wall.
    const dark = drags.filter(([, stroke]) => stroke === PIGMENTS.scratchDark).length;
    expect(dark).toBeGreaterThan(0);
    expect(dark).toBeLessThan(drags.length / 2);

    // Scuffs: many hairlines in one path, one faint strength.
    const scuffs = [...body.matchAll(/<path d='((?:M[^Mq']*l[^Mq']*){5,})' stroke='/g)];
    expect(scuffs.length).toBeGreaterThan(0);

    // All three, and none of them most of the tile.
    const kinds = [slivers.length / 2, scuffs.length];
    for (const count of kinds) expect(count).toBeLessThan(DAMAGE.scratches.count * 0.6);
    expect(DAMAGE.scratches.gougeOdds + DAMAGE.scratches.scuffOdds).toBeLessThan(0.6);
  });

  it('dings the plate as well as scratching it', () => {
    const body = markup(damage.scratches);
    // Outside the filtered group, as two paths of dots: holes, and the lit wall
    // of each a hair below it.
    const after = body.slice(body.lastIndexOf('</g>'));
    const dotted = [...after.matchAll(/<path d='((?:M[^M']*h\.1)+)'[^>]*stroke='([^']+)'/g)];

    expect(dotted.map(([, , stroke]) => stroke)).toEqual([PIGMENTS.scratchDark, PIGMENTS.scratchLit]);
    for (const [, d] of dotted) {
      expect((d ?? '').split('M').length - 1).toBe(DAMAGE.scratches.pits);
    }
  });

  it('leans the scratches one way, the way a hand drags', () => {
    // A field with no dominant direction reads as hatching. Most marks sit
    // within `stray` of the lean; the few that do not are the cross-hatch. Read
    // off the drags, which are the bulk of the field: the end of each curve
    // relative to its start is the way it runs.
    const angles = [...markup(damage.scratches).matchAll(/q-?[\d.]+ -?[\d.]+ (-?[\d.]+) (-?[\d.]+)/g)]
      .map(([, dx, dy]) => (Math.atan2(Number(dy), Number(dx)) * 180) / Math.PI);

    expect(angles.length).toBeGreaterThan(20);
    const leaning = angles.filter(
      (angle) => Math.abs(angle - DAMAGE.scratches.lean) <= DAMAGE.scratches.stray + 2,
    );
    expect(leaning.length / angles.length).toBeGreaterThan(0.9);
    // What crosses the grain is always a single cut, never a drag or a rub.
    expect(DAMAGE.scratches.crossOdds).toBeGreaterThan(0);
  });

  it('builds corrosion in layers: a stain, a crust, pits, scale, and grain through all of it', () => {
    for (const [name, palette] of Object.entries(CORROSION) as Array<[keyof typeof CORROSION, (typeof CORROSION)['rust']]>) {
      const body = markup(damage[name]);
      // Each layer of the patches is a group of dots in one colour at one
      // strength — a group, so that overlapping spots fade together and what
      // is seen is their outline and not every circle.
      const layers = [...body.matchAll(/<g stroke='([^']+)' opacity='([\d.]+)'>(.*?)<\/g>/g)].map(
        ([, stroke, opacity, inner]) => ({ stroke, opacity: Number(opacity), inner: inner ?? '' }),
      );
      const order = layers.map((layer) => layer.stroke);

      // Stain under crust under pits, and the first two at two strengths.
      expect(order, name).toEqual([palette.stain, palette.stain, palette.crust, palette.crust, palette.pit]);
      expect(layers[0]?.opacity, name).toBeLessThan(layers[1]?.opacity ?? 0);
      expect(layers[2]?.opacity, name).toBeLessThan(layers[3]?.opacity ?? 0);
      // The stain is fainter than the crust standing on it.
      expect(layers[1]?.opacity, name).toBeLessThan(layers[3]?.opacity ?? 0);
      for (const layer of layers) {
        // Nothing but dots, sorted into a few widths.
        expect(layer.inner, name).toMatch(/^(<path d='(M-?\d+,-?\d+h\.1)+' stroke-width='[\d.]+'\/>)+$/);
      }

      // Scale: small straight-edged pieces, because it cracks off.
      const scale = [...body.matchAll(/<path d='([^']+)' fill='([^']+)'/g)].filter(
        ([, , fill]) => fill === palette.bright,
      );
      expect(scale.length, name).toBeGreaterThanOrEqual(DAMAGE[name].count);
      for (const [, d] of scale) expect(d, name).toMatch(/^M[^L]+(L[^L]+){4,}Z$/);

      // And the grain: four paths of dots over the top of the lot, outside the
      // filter so they stay sharp — pits and flecks, fine and coarse.
      const after = body.slice(body.lastIndexOf('</g>'));
      const grain = [...after.matchAll(/<path d='((?:M[^M']*h\.1)+)'[^>]*stroke='([^']+)'/g)];
      expect(grain.map(([, , stroke]) => stroke), name).toEqual([
        palette.pit,
        palette.pit,
        palette.fleck,
        palette.fleck,
      ]);
    }
  });

  it('grows a patch out of spots, so no patch is one shape', () => {
    // gt#100. A patch used to be one closed curve. It is spots that ran together
    // now, and the proof is that there are a great many more spots than patches
    // and that they come in several sizes.
    for (const name of ['rust', 'verdigris'] as const) {
      const body = markup(damage[name]);
      const crust = [...body.matchAll(/<g stroke='([^']+)' opacity='[\d.]+'>(.*?)<\/g>/g)].filter(
        ([, stroke]) => stroke === CORROSION[name].crust,
      );
      const spots = crust.reduce((total, [, , inner]) => total + (inner ?? '').split('M').length - 1, 0);
      const widths = new Set(
        crust.flatMap(([, , inner]) => [...(inner ?? '').matchAll(/stroke-width='([\d.]+)'/g)].map(([, w]) => w)),
      );

      expect(spots / DAMAGE[name].count, name).toBeGreaterThan(8);
      expect(widths.size, name).toBeGreaterThanOrEqual(4);
      // No closed curve anywhere: nothing here is drawn as one outline.
      expect(body, name).not.toMatch(/<path d='M[^']*Q[^']*Z'/);
    }
  });

  it('makes one patch big and most of them small', () => {
    // The first thing a photograph of rust shows, and the first thing nine
    // patches of one size got wrong.
    for (const name of ['rust', 'verdigris'] as const) {
      const { minRadius, maxRadius, bias, count } = DAMAGE[name];
      expect(bias, name).toBeGreaterThanOrEqual(2);
      expect(maxRadius / minRadius, name).toBeGreaterThan(4);
      // What the curve does to an even draw: the middle patch is a fraction of
      // the biggest.
      const median = minRadius + Math.pow(0.5, bias) * (maxRadius - minRadius);
      expect(median / maxRadius, name).toBeLessThan(0.45);
      expect(count, name).toBeGreaterThanOrEqual(6);
    }
  });

  it('scatters freckles over the tile, nowhere near a patch', () => {
    const body = markup(damage.rust);
    const inside = body.slice(body.indexOf("filter='url("), body.lastIndexOf('</g>'));
    const freckles = [...inside.matchAll(/<path d='((?:M[^M']*h\.1)+)' fill='none' stroke='([^']+)'/g)];
    const counted = freckles.map(([, d]) => (d ?? '').split('M').length - 1);

    // A breath of stain under a pinhead of crust, in two sizes.
    expect(freckles.map(([, , stroke]) => stroke)).toEqual([
      CORROSION.rust.stain,
      CORROSION.rust.stain,
      CORROSION.rust.crust,
      CORROSION.rust.crust,
    ]);
    expect((counted[0] ?? 0) + (counted[1] ?? 0)).toBe(DAMAGE.rust.freckles);
    expect(counted[0]).toBe(counted[2]);
    expect(counted[1]).toBe(counted[3]);
  });

  it('weeps in crowds of thin streaks, most of them short and a few long', () => {
    const body = markup(damage.rust);
    const streaks = [...body.matchAll(/<path d='M(-?[\d.]+),(-?[\d.]+)L(-?[\d.]+),[^L]+L[^L]+L[^,]+,(-?[\d.]+)L[^']*Z' fill='url\(#([rp])\d+\)'/g)].map(
      ([, left, top, right, foot, kind]) => ({
        width: Number(right) - Number(left),
        length: Number(foot) - Number(top),
        pale: kind === 'p',
      }),
    );

    expect(streaks.length).toBeGreaterThan(DAMAGE.rust.count);
    for (const streak of streaks) {
      // Thin: nothing a person would call a bar.
      expect(streak.width).toBeLessThanOrEqual(3.1);
      expect(streak.length).toBeGreaterThan(0);
    }
    const lengths = streaks.map((streak) => streak.length).sort((a, c) => a - c);
    const median = lengths[Math.floor(lengths.length / 2)] ?? 0;
    const longest = lengths[lengths.length - 1] ?? 0;
    expect(longest).toBeGreaterThan(median * 2);
    expect(median).toBeLessThan((DAMAGE.rust.minRun + DAMAGE.rust.maxRun) / 2);
    // And a few of them are pale: not everything that runs down a wall is rust.
    expect(streaks.some((streak) => streak.pale)).toBe(true);
    expect(streaks.filter((streak) => streak.pale).length).toBeLessThan(streaks.length / 2);
  });

  it('gives each corrosion five colours of its own, and none of the other’s', () => {
    const rust = Object.values(CORROSION.rust);
    const green = Object.values(CORROSION.verdigris);

    expect(new Set(rust).size).toBe(5);
    expect(new Set(green).size).toBe(5);
    for (const colour of rust) expect(green).not.toContain(colour);
    // The stain is the colour each tile used to be all of.
    expect(CORROSION.rust.stain).toBe(PIGMENTS.rust);
    expect(CORROSION.verdigris.stain).toBe(PIGMENTS.verdigris);
  });

  it('keeps the tiles small enough to inline', () => {
    // They are data URIs in the stylesheet. Speckle as elements would be most
    // of it; as subpaths of four paths a dot is a dozen characters.
    for (const [name, uri] of tiles) expect(uri.length, name).toBeLessThan(40_000);
    const total = tiles.reduce((sum, [, uri]) => sum + uri.length, 0);
    expect(total).toBeLessThan(90_000);
  });

  it('gives rust somewhere to bleed to', () => {
    const body = markup(damage.rust);
    // At least some patches weep, down the gradient that fades them out.
    expect(body).toContain(`fill='url(#r${DAMAGE.rust.seed})'`);
    expect(body).toContain("stop-opacity='0'");
  });

  it('lets verdigris sit where it went instead of running', () => {
    const body = markup(damage.verdigris);
    expect(body).toContain(PIGMENTS.verdigris);
    // Copper goes green where it sits and stays there, so there is no run — and
    // therefore no gradient inlined into every page to fade one along.
    expect(DAMAGE.verdigris.runOdds).toBe(0);
    expect(body).not.toContain('linearGradient');
    expect(body).not.toContain("fill='url(");
  });

  it('stops verdigris being the rust tile in a wig', () => {
    // The specific complaint in gt#35: one cloud wearing three hats, the third
    // being the rust tile hue-rotated 95° and desaturated. Checked at both ends
    // — a different tile, and no filter left on the board layer to fake one
    // with.
    expect(damage.verdigris).not.toBe(damage.rust);
    expect(markup(damage.verdigris)).not.toContain(PIGMENTS.rust);
    expect(JSON.stringify(textureLayers)).not.toContain('hue-rotate');
  });

  it('gathers the seam’s streaks into crowds, most of them short', () => {
    // gt#100. Under a real seam they are thick in some stretches and missing in
    // others, and nearly all of them give up early.
    const body = markup(damage.runs);
    const runs = [...body.matchAll(/d='M(-?[\d.]+) 0L(-?[\d.]+) 0L-?[\d.]+ ([\d.]+)L/g)].map(
      ([, left, right, length]) => ({ x: (Number(left) + Number(right)) / 2, length: Number(length) }),
    );
    const { width, crowds, scatter, count, minLength, maxLength } = DAMAGE.runs;

    expect(count).toBeGreaterThanOrEqual(crowds * 3);
    // Crowded: the stretch of seam that carries streaks at all is well under
    // the whole of it.
    const cells = new Set(runs.map((run) => Math.floor((((run.x % width) + width) % width) / scatter)));
    expect(cells.size * scatter).toBeLessThan(width * 0.6);
    // Short, mostly.
    const lengths = runs.map((run) => run.length).sort((a, c) => a - c);
    expect(lengths[Math.floor(lengths.length / 2)] ?? 0).toBeLessThan((minLength + maxLength) / 2);
    expect(lengths[lengths.length - 1] ?? 0).toBeGreaterThan(maxLength * 0.6);
  });

  it('tapers every seam run and fades it out before it lands', () => {
    const body = markup(damage.runs);
    const runs = [...body.matchAll(/d='M(-?[\d.]+) 0L(-?[\d.]+) 0L(-?[\d.]+) ([\d.]+)L(-?[\d.]+)/g)];
    expect(runs.length).toBeGreaterThanOrEqual(DAMAGE.runs.count);

    for (const [, left, right, footRight, length, footLeft] of runs) {
      // Every run starts at the seam itself — y=0 is the join it came from.
      expect(Number(length)).toBeGreaterThan(0);
      // And arrives narrower than it left: water carrying rust off a fixing
      // loses both on the way down.
      const top = Number(right) - Number(left);
      const foot = Number(footRight) - Number(footLeft);
      expect(foot).toBeLessThan(top);
    }
  });
});

describe('placement is what stops rust being a wash', () => {
  it('masks a plate to its edges and its four screw heads', () => {
    expect(placement.plate).toContain('linear-gradient(to top');
    expect(placement.plate).toContain('linear-gradient(to bottom');
    expect(placement.plate).toContain('linear-gradient(to left');
    expect(placement.plate).toContain('linear-gradient(to right');
    // Four screws, one per corner, each at the inset ../ui/module draws it at.
    expect([...placement.plate.matchAll(/radial-gradient/g)]).toHaveLength(4);
  });

  it('bites deepest along a plate’s bottom edge, where water sits', () => {
    // gt#100. Every photograph of a rusting panel is darkest along the bottom.
    // `to top` starts at the bottom, so that gradient is the bottom edge's band.
    const depth = (mask: string, side: string): number =>
      Number(new RegExp(`to ${side}, #000, rgba\\(0,0,0,0\\) (\\d+)px`).exec(mask)?.[1] ?? NaN);

    for (const mask of [placement.plate, placement.box]) {
      const foot = depth(mask, 'top');
      const head = depth(mask, 'bottom');
      expect(foot).toBeGreaterThan(depth(mask, 'left'));
      expect(depth(mask, 'left')).toBe(depth(mask, 'right'));
      expect(head).toBeLessThan(depth(mask, 'left'));
      expect(foot).toBeGreaterThanOrEqual(head * 2);
    }
  });

  it('gives a modifier box edges and no screws, because it has none', () => {
    expect(placement.box).not.toContain('radial-gradient');
    expect(placement.box).toContain('linear-gradient(to top');
  });

  it('fades every mask to nothing, so the middle of a plate stays clean', () => {
    for (const [name, mask] of Object.entries(placement)) {
      expect(mask, name).toContain('rgba(0,0,0,0)');
      expect(mask, name).toContain('#000');
    }
  });

  it('reaches further in on the bigger surfaces', () => {
    // The board and the wake screen are enormous next to a plate; the same 16px
    // bite on them would be a hairline nobody could see.
    const depth = (mask: string): number => Number(/rgba\(0,0,0,0\) (\d+)px/.exec(mask)?.[1] ?? 0);
    expect(depth(placement.board)).toBeGreaterThan(depth(placement.plate));
    expect(depth(placement.wake)).toBeGreaterThan(depth(placement.board));
  });
});

// Chipped paint and a cracked panel (gt#114): what years of hands and one bad
// afternoon do to the parts that were added, as opposed to what weather does
// to bare plate. Held to the same two laws as everything above.
describe('breakage: chips and cracks', () => {
  const pieces = Object.entries(breakage);

  it('ships both inline, with nothing bare that a url() could not survive', () => {
    for (const [name, uri] of pieces) {
      expect(uri.startsWith('url("data:image/svg+xml,'), name).toBe(true);
      expect(uri.slice('url("'.length, -2), name).not.toMatch(/[<>#"'() ]/);
      expect(uri.length, name).toBeLessThan(12_000);
    }
  });

  it('redraws both byte-identical from the same seed, and differently from another', () => {
    expect(chipField(BREAKAGE.chips)).toBe(breakage.chips);
    expect(crackField(BREAKAGE.cracks)).toBe(breakage.cracks);
    expect(chipField({ ...BREAKAGE.chips, seed: BREAKAGE.chips.seed + 1 })).not.toBe(breakage.chips);
    expect(crackField({ ...BREAKAGE.cracks, seed: BREAKAGE.cracks.seed + 1 })).not.toBe(breakage.cracks);
  });

  it('draws both as geometry, with no noise in either', () => {
    for (const [name, uri] of pieces) {
      expect(markup(uri), name).not.toContain('feTurbulence');
      expect(markup(uri), name).not.toContain('<filter');
    }
  });

  it('chips paint as a mask: whole where the paint is, cut where a flake came away', () => {
    const body = markup(breakage.chips);
    // A white field with the flakes cut out of it in black, used as a mask on
    // itself — so the tile's alpha is the paint that is left.
    expect(body).toContain("<mask id='paint'>");
    expect(body).toContain("mask='url(#paint)'");
    const flakes = body.match(/M[^MZ]*Z/g) ?? [];
    expect(flakes).toHaveLength(BREAKAGE.chips.flakes + BREAKAGE.chips.nicks);
    // A few big ones and a great many small: paint lets go in a piece and is
    // then picked at.
    expect(BREAKAGE.chips.nicks).toBeGreaterThan(BREAKAGE.chips.flakes * 2);
    expect(BREAKAGE.chips.minFlake).toBeGreaterThan(BREAKAGE.chips.maxNick);
    // Every flake has corners: an outline that was drawn, not a circle.
    for (const flake of flakes) {
      expect(flake.split('L').length).toBeGreaterThanOrEqual(6);
      expect(flake).not.toMatch(/[AaCc]/);
    }
    // And no two the same.
    expect(new Set(flakes).size).toBe(flakes.length);
  });

  it('cracks a panel from the point it was hit at, and nowhere else', () => {
    const body = markup(breakage.cracks);
    const { size, at, arms } = BREAKAGE.cracks;
    const d = body.match(/<path d='([^']*)'/)?.[1] ?? '';
    const point = `M${(at[0] * size).toFixed(1).replace(/\.0$/, '')} ${(at[1] * size)
      .toFixed(1)
      .replace(/\.0$/, '')}`;
    // Every arm leaves the point of impact. That is what tells a crack from
    // a scratch: scratches lie anywhere, and cracks all come from one place.
    expect(d.split(point).length - 1).toBe(arms);
    // The rest are forks and the chords across, and each starts where a crack
    // already is rather than out of nothing.
    const starts = (d.match(/M[\d.-]+ [\d.-]+/g) ?? []).filter((start) => start !== point);
    expect(starts.length).toBeGreaterThan(0);
    for (const start of starts) {
      expect(d, start).toContain(`L${start.slice(1)}`);
    }
    // Drawn twice: a dark line offset under a bright one.
    expect([...body.matchAll(/<path d='([^']*)'/g)].map(([, path]) => path)).toEqual([d, d]);
    expect(body).toContain("transform='translate(0.6 0.8)'");
    expect(body).toMatch(/stroke='rgba\(0,0,0,/);
    expect(body).toMatch(/stroke='rgba\(255,246,235,/);
  });
});
