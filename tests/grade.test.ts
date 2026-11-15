import { describe, expect, it } from 'vitest';
import * as painted from '../src/tokens';
import { CORROSION, GRADE, NEUTRAL, PIGMENTS, glare, grade, regrade, tone } from '../src/tokens';
import type { Grade } from '../src/tokens';
import * as reference from '../src/tokens/reference';

/**
 * Every colour in a CSS value, as `[r, g, b]`. Hex and `rgb()`/`rgba()` both.
 * `painting` drops the ones the grade is entitled to leave alone: black, and
 * anything at alpha zero.
 */
function colours(css: string, painting = false): Array<[number, number, number]> {
  const found: Array<[number, number, number]> = [];
  for (const [match] of css.matchAll(/#[0-9a-f]{6}\b|rgba?\([^)]*\)/gi)) {
    let rgb: [number, number, number];
    let alpha = 1;
    if (match.startsWith('#')) {
      rgb = [parseInt(match.slice(1, 3), 16), parseInt(match.slice(3, 5), 16), parseInt(match.slice(5, 7), 16)];
    } else {
      const [r = 0, g = 0, b = 0, a = 1] = match
        .slice(match.indexOf('(') + 1, -1)
        .split(',')
        .map(Number);
      rgb = [r, g, b];
      alpha = a;
    }
    if (painting && (alpha === 0 || rgb[0] + rgb[1] + rgb[2] === 0)) continue;
    found.push(rgb);
  }
  return found;
}

const luma = ([r, g, b]: readonly [number, number, number]): number => 0.299 * r + 0.587 * g + 0.114 * b;
const spread = (rgb: readonly [number, number, number]): number => Math.max(...rgb) - Math.min(...rgb);

/** What the board grades, table by table: the keys, and the strength each is graded at. */
const GRADED: Record<string, Record<string, Grade>> = {
  surfaces: { boardPlate: GRADE.plate },
  plate: { screw: GRADE.metal, rivetStrip: GRADE.metal, wakeLever: GRADE.metal, wakePlate: GRADE.plate },
  jack: { face: GRADE.metal },
  toggle: { nub: GRADE.metal },
  ink: { tape: GRADE.paper, tapeScrap: GRADE.paper },
  signals: {
    hammerFace: GRADE.metal,
    hammerBand: GRADE.metal,
    hammerBolt: GRADE.metal,
    hammerHazard: GRADE.metal,
    hammerPost: GRADE.metal,
    hammerRivets: GRADE.metal,
    hammerRam: GRADE.metal,
    anvilFace: GRADE.metal,
    anvilFoot: GRADE.metal,
    apartSeat: GRADE.metal,
    apartHinge: GRADE.metal,
  },
  controls: {
    faceDark: GRADE.metal,
    faderCap: GRADE.metal,
    leverBar: GRADE.metal,
    wheelRim: GRADE.metal,
    wheelSpoke: GRADE.metal,
    wheelHub: GRADE.metal,
  },
};

type Table = Record<string, unknown>;
const tableOf = (from: object, name: string): Table => (from as Record<string, Table>)[name] as Table;

describe('the grade', () => {
  it('leaves a value exactly as it is when told to do nothing', () => {
    // The floor everything else stands on: with every number at 1 (and the
    // blend at 0) the board is the reference's, to the character.
    for (const table of Object.values(GRADED)) expect(table).toBeTruthy();
    const samples = [
      reference.surfaces.boardPlate,
      reference.plate.screw,
      reference.plate.rivetStrip,
      reference.jack.face,
      reference.controls.faderCap,
      reference.signals.hammerRam,
      reference.sourcePlates.laser.plate,
    ];
    for (const sample of samples) expect(grade(sample, NEUTRAL)).toBe(sample);
  });

  it('touches the colours in a value and nothing else in it', () => {
    const before = reference.plate.rivetStrip;
    const after = grade(before, GRADE.metal);
    const blank = (css: string): string => css.replace(/#[0-9a-f]{6}\b|rgba?\([^)]*\)/gi, '•');

    expect(after).not.toBe(before);
    // Angles, stops and lengths come back character for character…
    expect(blank(after)).toBe(blank(before));
    // …and so does every alpha.
    const alphas = (css: string): string[] => [...css.matchAll(/rgba\([^)]*,([^,)]*)\)/g)].map((m) => m[1] ?? '');
    expect(alphas(after)).toEqual(alphas(before));
  });

  it('writes a hex colour back as six lower-case digits', () => {
    expect(grade('#FFF', GRADE.metal)).toMatch(/^#[0-9a-f]{6}$/);
    expect(grade('#9C6132', GRADE.metal)).toBe(grade('#9c6132', GRADE.metal));
    expect(grade('#9c6132', GRADE.metal)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('never makes a shadow paler', () => {
    // Black mixed toward soot would come out lighter than it went in, and
    // black in these tokens is always a shadow or the cut of a groove.
    for (const by of [GRADE.plate, GRADE.metal, GRADE.paper, GRADE.corrosion]) {
      expect(tone([0, 0, 0], by)).toEqual([0, 0, 0]);
      expect(grade('rgba(0,0,0,0.4)', by)).toBe('rgba(0,0,0,0.4)');
      expect(grade('#000000', by)).toBe('#000000');
    }
  });

  it('leaves alone a colour that paints nothing', () => {
    // The clear end of a fade. It is usually written as the lit end's colour
    // at alpha zero, and grading one end of a pair in a string is how the two
    // would stop being the same colour.
    expect(grade('rgba(255,70,30,0)', GRADE.metal)).toBe('rgba(255,70,30,0)');
    expect(grade('rgba(206, 196, 168, 0.0)', GRADE.metal)).toBe('rgba(206, 196, 168, 0.0)');
    expect(grade('rgba(206,196,168,0.05)', GRADE.metal)).not.toBe('rgba(206,196,168,0.05)');
  });

  it('keeps an rgb() value’s own spacing', () => {
    expect(grade('rgb(120, 66, 32)', GRADE.metal)).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    expect(grade('rgba(120,66,32,0.12)', GRADE.metal)).toMatch(/^rgba\(\d+,\d+,\d+,0\.12\)$/);
  });

  it('makes every material darker and less coloured, and none of them grey', () => {
    // The request, as arithmetic: "desaturating a little bit … into a darker
    // palette". A little bit is the part a number can drift past, so it has a
    // floor as well: no grade here takes more than half a thing's colour.
    for (const [name, by] of Object.entries({
      plate: GRADE.plate,
      metal: GRADE.metal,
      paper: GRADE.paper,
      corrosion: GRADE.corrosion,
    })) {
      expect(by.saturation, name).toBeLessThan(1);
      expect(by.saturation, name).toBeGreaterThanOrEqual(0.5);
      expect(by.light, name).toBeLessThan(1);
      expect(by.light, name).toBeGreaterThanOrEqual(0.7);
      expect(by.blend, name).toBeGreaterThanOrEqual(0);
      expect(by.blend, name).toBeLessThanOrEqual(0.25);
    }
    // Tape is what the words are written on, so it is graded least.
    expect(GRADE.paper.light).toBeGreaterThan(GRADE.plate.light);
    expect(GRADE.paper.light).toBeGreaterThan(GRADE.metal.light);
    expect(GRADE.paper.blend).toBeLessThan(GRADE.metal.blend);
  });

  it('pulls toward a dark that is warm, because the dark on this board is brown', () => {
    const [r, g, b] = GRADE.toward;
    expect(luma(GRADE.toward)).toBeLessThan(40);
    expect(r).toBeGreaterThanOrEqual(g);
    expect(g).toBeGreaterThanOrEqual(b);
  });
});

describe('a colour as the light it throws', () => {
  it('keeps the hue and drives the brightest channel to full', () => {
    // gt#104. A module's tint is written dim, because it is laid on as a wash;
    // the mark that lights for it on the seal is a line a pixel wide.
    expect(glare('rgba(150,80,40,0.4)')).toBe('rgb(255,136,68)');
    expect(glare('#567c6a')).toBe('rgb(177,255,218)');
    expect(glare('rgb(86, 178, 220)')).toBe('rgb(100,206,255)');
  });

  it('gives every module a light of its own, in the colour it already glows in', () => {
    const lights = Object.entries(reference.sourcePlates).map(([id, skin]) => [id, glare(skin.tint)] as const);
    for (const [id, light] of lights) {
      const [rgb] = colours(light);
      const [was] = colours(reference.sourcePlates[id as keyof typeof reference.sourcePlates].tint);
      expect(rgb, id).toBeDefined();
      expect(Math.max(...(rgb ?? [0])), id).toBe(255);
      // The same hue: the channels are in the order they were.
      const order = (c: readonly number[]): string => [0, 1, 2].sort((a, b) => (c[b] ?? 0) - (c[a] ?? 0)).join('');
      expect(order(rgb ?? []), id).toBe(order(was ?? []));
      // No alpha left on it. How bright it is laid on is the board's to say.
      expect(light, id).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
    }
    // The cannon is still the cold one, and the cow is still green.
    expect(colours(glare(reference.sourcePlates.laser.tint))[0]?.[2]).toBe(255);
    expect(colours(glare(reference.sourcePlates.cow.tint))[0]?.[1]).toBe(255);
  });

  it('leaves black as black, and a string with no colour in it alone', () => {
    expect(glare('rgba(0,0,0,0.4)')).toBe('rgb(0,0,0)');
    expect(glare('none')).toBe('none');
    // Twice in a row gives the same answer: nothing is left over between calls.
    expect(glare('#806040')).toBe(glare('#806040'));
  });
});

describe('the board, graded', () => {
  it('paints every listed material in exactly the grade of the reference’s colour', () => {
    for (const [name, keys] of Object.entries(GRADED)) {
      const was = tableOf(reference, name);
      const is = tableOf(painted, name);
      for (const [key, by] of Object.entries(keys)) {
        expect(typeof was[key], `${name}.${key} is in the reference`).toBe('string');
        expect(is[key], `${name}.${key}`).toBe(grade(was[key] as string, by));
        expect(is[key], `${name}.${key} moved`).not.toBe(was[key]);
      }
    }
  });

  it('leaves everything it did not list exactly as the reference has it', () => {
    // Light and lettering: lamps, glows, jack rings, cables, blooms, pointer
    // marks, stencil, bone, tips — and every shadow. Checked as "every key not
    // named above", so a token added later is ungraded until somebody decides
    // it is material.
    for (const [name, keys] of Object.entries(GRADED)) {
      const was = tableOf(reference, name);
      const is = tableOf(painted, name);
      expect(Object.keys(is), name).toEqual(Object.keys(was));
      for (const key of Object.keys(was)) {
        if (key in keys) continue;
        expect(is[key], `${name}.${key}`).toEqual(was[key]);
      }
    }
    // And the tables with no material in them are the reference's own objects.
    for (const name of ['wells', 'wear', 'bloom', 'fonts', 'typefaces', 'textures', 'textureLayers', 'rupture', 'cssVars']) {
      expect(tableOf(painted, name), name).toBe(tableOf(reference, name));
    }
  });

  it('keeps the things that are light as bright as the reference drew them', () => {
    expect(painted.signals.lampOn).toBe(reference.signals.lampOn);
    expect(painted.signals.lampGlowOn).toBe(reference.signals.lampGlowOn);
    expect(painted.signals.lampHalo).toBe(reference.signals.lampHalo);
    expect(painted.signals.wireTemp).toBe(reference.signals.wireTemp);
    expect(painted.jack.open).toBe(reference.jack.open);
    expect(painted.jack.aim).toBe(reference.jack.aim);
    expect(painted.ink.bone).toBe(reference.ink.bone);
    expect(painted.ink.stencilZone).toBe(reference.ink.stencilZone);
    expect(painted.ink.tipPaper).toBe(reference.ink.tipPaper);
    expect(painted.controls.mark).toBe(reference.controls.mark);
    expect(painted.controls.gaugeLit).toBe(reference.controls.gaugeLit);
  });

  it('grades a module’s plate and its control face, and leaves its glow and its bloom', () => {
    for (const [id, was] of Object.entries(reference.sourcePlates)) {
      const is = painted.sourcePlates[id as keyof typeof painted.sourcePlates];
      expect(is.plate, id).toBe(grade(was.plate, GRADE.plate));
      expect(is.face, id).toBe(grade(was.face, GRADE.metal));
      expect(is.tint, id).toBe(was.tint);
      expect(is.rustMax, id).toBe(was.rustMax);
      expect('bloom' in is, id).toBe('bloom' in was);
      if ('bloom' in was && 'bloom' in is) expect(is.bloom, id).toBe(was.bloom);
      // Still what the rest of the board parses them as.
      expect(is.plate, id).toMatch(/^linear-gradient\(1[0-9]{2}deg,#[0-9a-f]{6},#[0-9a-f]{6}\)$/);
      expect(is.face, id).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(Object.keys(painted.sourcePlates)).toEqual(Object.keys(reference.sourcePlates));
  });

  it('does the same for every chain box', () => {
    for (const [id, was] of Object.entries(reference.modifierPlates)) {
      const is = painted.modifierPlates[id as keyof typeof painted.modifierPlates];
      expect(is.plate, id).toBe(grade(was.plate, GRADE.plate));
      expect(is.face, id).toBe(grade(was.face, GRADE.metal));
    }
    expect(Object.keys(painted.modifierPlates)).toEqual(Object.keys(reference.modifierPlates));
  });

  it('makes every graded colour darker and no more coloured than it was', () => {
    const pairs: Array<[string, string, string]> = [];
    for (const [name, keys] of Object.entries(GRADED)) {
      for (const key of Object.keys(keys)) {
        pairs.push([`${name}.${key}`, tableOf(reference, name)[key] as string, tableOf(painted, name)[key] as string]);
      }
    }
    for (const [id, was] of Object.entries(reference.sourcePlates)) {
      const is = painted.sourcePlates[id as keyof typeof painted.sourcePlates];
      pairs.push([`${id}.plate`, was.plate, is.plate], [`${id}.face`, was.face, is.face]);
    }
    for (const [id, was] of Object.entries(reference.modifierPlates)) {
      const is = painted.modifierPlates[id as keyof typeof painted.modifierPlates];
      pairs.push([`${id}.plate`, was.plate, is.plate], [`${id}.face`, was.face, is.face]);
    }

    expect(pairs.length).toBeGreaterThan(50);
    for (const [label, was, is] of pairs) {
      const before = colours(was, true);
      const after = colours(is, true);
      expect(before.length, label).toBeGreaterThan(0);
      expect(after.length, label).toBe(before.length);
      before.forEach((colour, i) => {
        const now = after[i] ?? colour;
        expect(luma(now), `${label} #${i} is darker`).toBeLessThan(luma(colour));
        // +1 for rounding: three channels are each rounded to a whole number.
        expect(spread(now), `${label} #${i} is no more coloured`).toBeLessThanOrEqual(spread(colour) + 1);
      });
    }
  });

  it('still tells the seven chain boxes apart by colour', () => {
    // The job ../src/tokens/reference gives them: on a rack a box is told from
    // its neighbour by colour before anything else is read. A grade that blends
    // toward one colour is exactly the thing that could undo that, so no two
    // boxes may end up painted the same, or within a hair of it.
    const tops = Object.entries(painted.modifierPlates).map(
      ([id, skin]) => [id, colours(skin.plate)[0] ?? [0, 0, 0]] as const,
    );
    for (const [a, first] of tops) {
      for (const [b, second] of tops) {
        if (a >= b) continue;
        const apart = Math.abs(first[0] - second[0]) + Math.abs(first[1] - second[1]) + Math.abs(first[2] - second[2]);
        expect(apart, `${a} against ${b}`).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it('keeps tape pale enough to carry its ink', () => {
    // Tape is graded, and the words on it are not: the paper has to stay far
    // enough above the ink to be read in a dark room.
    const paper = colours(painted.ink.tape)[0] ?? [0, 0, 0];
    const scrap = colours(painted.ink.tapeScrap)[0] ?? [0, 0, 0];
    const marker = colours(painted.ink.tapeInk)[0] ?? [0, 0, 0];
    expect(painted.ink.tapeInk).toBe(reference.ink.tapeInk);
    expect(luma(paper) - luma(marker)).toBeGreaterThan(100);
    expect(luma(scrap) - luma(marker)).toBeGreaterThan(90);
  });

  it('ages the rust and the verdigris with the rest of the board', () => {
    // The pigments are written in ../src/tokens/damage as the colour they were
    // found as, then run through the grade. The first numbers are quoted here
    // so that "what it was" stays written down somewhere a diff will show.
    const found = {
      rust: {
        stain: 'rgb(107,59,26)',
        crust: 'rgb(62,31,13)',
        bright: 'rgb(170,92,34)',
        pit: 'rgb(22,12,6)',
        fleck: 'rgb(214,132,52)',
      },
      verdigris: {
        stain: 'rgb(94,138,114)',
        crust: 'rgb(48,88,74)',
        bright: 'rgb(138,184,158)',
        pit: 'rgb(22,40,35)',
        fleck: 'rgb(198,226,208)',
      },
    } as const;

    for (const kind of ['rust', 'verdigris'] as const) {
      for (const [layer, was] of Object.entries(found[kind])) {
        const is = CORROSION[kind][layer as keyof (typeof CORROSION)['rust']];
        expect(is, `${kind}.${layer}`).toBe(grade(was, GRADE.corrosion));
        const before = colours(was)[0] ?? [0, 0, 0];
        const after = colours(is)[0] ?? [0, 0, 0];
        expect(luma(after), `${kind}.${layer} is darker`).toBeLessThan(luma(before));
        expect(spread(after), `${kind}.${layer} is duller`).toBeLessThan(spread(before));
      }
    }
    expect(PIGMENTS.rust).toBe(CORROSION.rust.stain);
    expect(PIGMENTS.verdigris).toBe(CORROSION.verdigris.stain);
  });

  it('leaves rust red-brown and verdigris green: duller, not grey', () => {
    for (const colour of Object.values(CORROSION.rust)) {
      const [r, g, b] = colours(colour)[0] ?? [0, 0, 0];
      expect(r, colour).toBeGreaterThan(g);
      expect(g, colour).toBeGreaterThan(b);
    }
    for (const colour of Object.values(CORROSION.verdigris)) {
      const [r, g, b] = colours(colour)[0] ?? [0, 0, 0];
      expect(g, colour).toBeGreaterThan(r);
      expect(g, colour).toBeGreaterThan(b);
    }
    // And the brightest thing in a patch of rust is no longer a small lamp:
    // well under the lamp's own amber.
    const fleck = colours(CORROSION.rust.fleck)[0] ?? [0, 0, 0];
    const lamp = colours(reference.signals.lampOn)[0] ?? [255, 255, 255];
    expect(luma(fleck)).toBeLessThan(luma(lamp) * 0.8);
    expect(spread(fleck)).toBeLessThan(spread(lamp) * 0.7);
  });

  it('regrades only the keys it is given', () => {
    const table = { a: '#806040', b: '#806040', n: 3 } as const;
    const out = regrade(table, GRADE.metal, 'a');
    expect(out.a).toBe(grade('#806040', GRADE.metal));
    expect(out.b).toBe('#806040');
    expect(out.n).toBe(3);
    // And it is a new table: the reference is never written to.
    expect(table.a).toBe('#806040');
  });
});
