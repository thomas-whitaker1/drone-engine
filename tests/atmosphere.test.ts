// @vitest-environment happy-dom
//
// The visual system, judged on the two things about it that are decidable: the
// arithmetic, and the arrow. Whether the room *feels* like a room is the
// ear-and-eye pass's problem; whether `--vig` is `.62 − low × .4` is not.
//
// The arrow is the one worth stating. The handoff's rule is that the visuals
// read audio state and never write it, and the shape of `start` is what enforces
// it — so the suite hands the loop a reading function it fully controls and
// checks that nothing else is ever asked for.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAtmosphere,
  depthAt,
  hueFor,
  SHAKE_STILL,
  kickAfter,
  kickFor,
  shakeAmount,
  shakeOf,
  shakeAt,
  turnAt,
  washAt,
} from '../src/ui';
import type { AtmosphereHandle } from '../src/ui';
import {
  ATMOSPHERE_VARS,
  FIGURE_VARS,
  SHAKE_CEILING,
  SWAY_STILL,
  figureRadius,
  figureSize,
  glowAt,
  jointAt,
  swayAt,
  swayStep,
  swellAt,
} from '../src/ui/atmosphere';
import { ATMOSPHERE, BOARD } from '../src/ui/constants';
import { LEVEL_SCALE } from '../src/engine/constants';
import { TUNE_WORDS } from '../src/ui';
import {
  cssVars,
  glyphOf,
  glyphTree,
  hubBox,
  SEAL,
  SIGIL_INK,
  surfaces,
  textureLayers,
  textures,
} from '../src/tokens';

const live: AtmosphereHandle[] = [];

/** A mounted atmosphere on its own page shell. */
function build(): { atmosphere: AtmosphereHandle; mount: HTMLElement } {
  const mount = document.createElement('div');
  document.body.appendChild(mount);
  const atmosphere = createAtmosphere({ mount });
  live.push(atmosphere);
  return { atmosphere, mount };
}

/** One layer by its `data-part` name. Throws rather than returning null. */
function layer(mount: HTMLElement, part: string): HTMLElement {
  const element = mount.querySelector<HTMLElement>(`[data-part="${part}"]`);
  if (!element) throw new Error(`No ${part} layer.`);
  return element;
}

/**
 * One of the variables, read where this file writes it (gt#21): on a layer that
 * reads it. `--grit` has three such layers and is on all of them; the grain is
 * the one asked here.
 */
const read = (mount: HTMLElement, name: string): string => {
  const owner =
    name === '--grit'
      ? 'film'
      : name === '--vig'
        ? 'vignette'
        : FIGURE_VARS.some((own) => own === name)
          ? 'sigil'
          : 'wash';
  return layer(mount, owner).style.getPropertyValue(name);
};

/** The same variables as the page holds them, which is never. */
const onBody = (name: string): string => document.body.style.getPropertyValue(name);

/** Run `count` animation frames. One frame is one pass of the loop. */
const frames = (count = 1): void => {
  for (let i = 0; i < count; i++) vi.advanceTimersByTime(16);
};

/**
 * A band comfortably under the shake floor — where the board spends nearly all
 * of its life, and the only place a settled room is a free one.
 *
 * A third of the floor rather than half of it, and the reason is arithmetic
 * rather than taste: at the floor gt#70 settled on, half is .43, which puts
 * `--breathe` at 1.01505 — exactly on the boundary its four decimals round at.
 * A lerp closing on that value from below flips the string on its last ulp, and
 * the "settled room writes nothing" case below would be testing a coin.
 */
const quiet = ATMOSPHERE.shake.floor / 3;

/** `--shake` as the two layers that read it hold it. Both, or the test is wrong. */
const shake = (mount: HTMLElement): string => {
  const wash = layer(mount, 'wash').style.getPropertyValue('--shake');
  expect(layer(mount, 'film').style.getPropertyValue('--shake')).toBe(wash);
  return wash;
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const atmosphere of live.splice(0)) atmosphere.destroy();
  document.body.innerHTML = '';
  document.body.removeAttribute('style');
  vi.useRealTimers();
});

describe('the atmosphere', () => {
  it('hangs five fixed layers off the page and makes a sixth to be seated, none of them touchable', () => {
    const { atmosphere, mount } = build();

    expect(atmosphere.layers).toHaveLength(6);
    expect(atmosphere.layers.map((element) => element.dataset.part)).toEqual([
      'wash',
      'sigil',
      'film',
      'edgeWarm',
      'edgeCold',
      'vignette',
    ]);
    for (const element of atmosphere.layers) {
      expect(element.parentNode).toBe(mount);
      expect(element.style.pointerEvents).toBe('none');
      if (element === atmosphere.figure) continue;
      // Fixed rather than absolute: the plate carries `zoom:var(--fit)`, and a
      // fixed child of it would be scaled with it.
      expect(element.style.position).toBe('fixed');
    }
    // The figure is the exception, and scaling with the plate is exactly what
    // it wants (gt#102): it is seated *in* the plate, on the seal.
    expect(atmosphere.figure.dataset.part).toBe('sigil');
    expect(atmosphere.figure.style.position).toBe('absolute');
  });

  it('puts every layer over the board, the wash included (gt#53)', () => {
    const { mount } = build();
    const z = (part: string): number => Number(layer(mount, part).style.zIndex || 0);

    // The regression, and the reason this file used to assert the opposite: the
    // wash had no z-index at all, which put it under a plate that is an opaque
    // gradient the size of the window. Below 1440px `--fit` scales that design to
    // exactly the window width, so there are no side margins and nothing behind
    // the plate is visible at any opacity — and `--breathe`, `--brite` and
    // `--hue` were all being written onto it. Every layer is over the board now,
    // and this assertion is what says so.
    for (const part of ['wash', 'film', 'edgeWarm', 'edgeCold', 'vignette']) {
      expect(z(part), part).toBeGreaterThan(BOARD.zIndex);
    }
    // Wash, then grain under the fringes under the vignette, which is the
    // reference's order. The figure is not in this stack: it is inside the
    // plate's own (gt#102), and is held to that below.
    expect(z('wash')).toBeLessThan(z('film'));
    expect(z('film')).toBeLessThan(z('edgeWarm'));
    expect(z('edgeWarm')).toBe(z('edgeCold'));
    expect(z('edgeCold')).toBeLessThan(z('vignette'));
  });

  it('screens the wash over the board rather than painting it over (gt#53)', () => {
    const { mount } = build();

    // The half of the move that makes it survivable. Screened, near-black
    // contributes nothing — so what reaches the hardware is the two pools of
    // light and not a gradient laid over it. The ground the wash used to carry
    // would have been a milky fog over the whole board, which is exactly why it
    // is not on this layer any more.
    expect(layer(mount, 'wash').style.mixBlendMode).toBe('screen');
    expect(surfaces.backdrop).not.toContain('ellipse');

    // And the filter runs before the blend, so both variables it carries reach
    // the board rather than stopping at the layer.
    const filter = layer(mount, 'wash').style.filter;
    expect(filter).toContain('hue-rotate(var(--hue');
    expect(filter).toContain('brightness(var(--brite');
  });

  it('paints each layer with the token it belongs to', () => {
    const { mount } = build();

    expect(layer(mount, 'wash').style.backgroundImage).toBe(surfaces.backdrop);
    expect(layer(mount, 'vignette').style.backgroundImage).toBe(surfaces.vignette);
    expect(layer(mount, 'edgeWarm').style.backgroundImage).toBe(surfaces.gritEdgeWarm);
    expect(layer(mount, 'edgeCold').style.backgroundImage).toBe(surfaces.gritEdgeCold);
    expect(layer(mount, 'film').style.animation).toBe(textureLayers.film.animation);
  });

  it('reads every variable with its resting value built in, so a cold page is right', () => {
    const { mount } = build();
    const wash = layer(mount, 'wash');

    // Nothing has run yet, and not one of the five has been written — on the
    // page or on any layer.
    for (const name of ATMOSPHERE_VARS) {
      expect(read(mount, name), name).toBe('');
      expect(onBody(name), name).toBe('');
    }
    expect(wash.style.transform).toContain(`var(--breathe, ${ATMOSPHERE.breathe.base})`);
    expect(wash.style.filter).toContain(`var(--brite, ${ATMOSPHERE.brite.base})`);
    expect(layer(mount, 'vignette').style.opacity).toContain(`var(--vig, ${ATMOSPHERE.vig.base})`);
    expect(layer(mount, 'film').style.opacity).toContain('var(--grit, 0)');
    expect(layer(mount, 'edgeWarm').style.opacity).toContain('var(--grit, 0)');
  });
});

describe('the frame loop', () => {
  it('writes nothing until it is started', () => {
    const { mount } = build();

    frames(10);

    expect(read(mount, '--breathe')).toBe('');
  });

  it('lerps toward the reading rather than snapping to it', () => {
    const { atmosphere, mount } = build();

    atmosphere.start(() => ({ master: 0, low: 1 }));
    frames();

    // One frame covers a tenth of the distance, not the distance.
    expect(read(mount, '--breathe')).toBe(washAt(ATMOSPHERE.lerp).breathe);
    expect(read(mount, '--breathe')).not.toBe(washAt(1).breathe);

    frames();
    const twice = ATMOSPHERE.lerp + (1 - ATMOSPHERE.lerp) * ATMOSPHERE.lerp;
    expect(read(mount, '--breathe')).toBe(washAt(twice).breathe);
  });

  it('closes on the reading if it is held long enough', () => {
    const { atmosphere, mount } = build();

    atmosphere.start(() => ({ master: 0, low: 1 }));
    frames(200);

    for (const [name, value] of Object.entries(washAt(1))) {
      expect(read(mount, `--${name}`), name).toBe(value);
    }
  });

  it('writes each variable on the layer that reads it, never on the page', () => {
    const { atmosphere, mount } = build();

    atmosphere.start(() => ({ master: 0, low: 1 }));
    frames(200);

    // A custom property on `<body>` is inherited by the whole document, so a
    // frame's three writes would invalidate style on every plate, knob and
    // cable that could read them. These three reach one node each.
    for (const name of ['--breathe', '--brite', '--vig']) {
      expect(onBody(name), name).toBe('');
      expect(read(mount, name), name).not.toBe('');
    }
    // And they land on the right one: the wash carries the two it is scaled and
    // brightened by, the vignette the one it is faded by, and neither carries
    // the other's.
    expect(layer(mount, 'vignette').style.getPropertyValue('--breathe')).toBe('');
    expect(layer(mount, 'wash').style.getPropertyValue('--vig')).toBe('');
  });

  it('stops writing once the band has settled, rather than restating it', () => {
    const { atmosphere, mount } = build();
    const wash = layer(mount, 'wash');

    // Held long enough that the lerp has closed and every variable has stopped
    // producing a new string — and held *under the shake floor*, which is where
    // the board spends nearly all of its life. Over the floor there is a jitter
    // that has to move every frame to be a jitter at all; see below.
    atmosphere.start(() => ({ master: 0, low: quiet }));
    frames(300);

    const setProperty = vi.spyOn(wash.style, 'setProperty');
    frames(60);

    // A settled room is a room that costs nothing: sixty frames of reading, and
    // not one write to say what the layer already says.
    expect(setProperty).not.toHaveBeenCalled();
    expect(read(mount, '--breathe')).toBe(washAt(quiet).breathe);
    setProperty.mockRestore();
  });

  it('pays for the shake and nothing else once a loud band has settled', () => {
    const { atmosphere, mount } = build();
    const wash = layer(mount, 'wash');

    atmosphere.start(() => ({ master: 0, low: 1 }));
    frames(300);

    const setProperty = vi.spyOn(wash.style, 'setProperty');
    frames(60);

    // The three lerped variables have closed and say nothing more. `--shake` is
    // the one thing here that is *meant* to be a different string every frame —
    // a jitter that settled would not be a jitter — so the settled cost of a loud
    // board is exactly one write per frame, and it is that one.
    expect(setProperty).toHaveBeenCalledTimes(60);
    for (const [name] of setProperty.mock.calls) expect(name).toBe('--shake');
    setProperty.mockRestore();
  });

  it('opens the room out as the low band rises, and closes it as it falls', () => {
    const quiet = washAt(0);
    const loud = washAt(1);

    // Brightness and scale rise with the band; the vignette moves against them.
    expect(Number(loud.breathe)).toBeGreaterThan(Number(quiet.breathe));
    expect(Number(loud.brite)).toBeGreaterThan(Number(quiet.brite));
    expect(Number(loud.vig)).toBeLessThan(Number(quiet.vig));
    // Subtle, per the brief: the whole swing of the wash is a few percent.
    expect(Number(loud.breathe) - Number(quiet.breathe)).toBeLessThan(0.05);
  });

  it('asks the engine for levels and for nothing else', () => {
    const { atmosphere } = build();
    const levels = vi.fn(() => ({ master: 0.5, low: 0.5 }));

    atmosphere.start(levels);
    frames(3);

    // Once per frame, and the reading function is the whole of the interface:
    // there is nothing here that could write back into the engine.
    expect(levels).toHaveBeenCalledTimes(3);
  });

  it('runs one loop however many times it is started', () => {
    const { atmosphere } = build();
    const levels = vi.fn(() => ({ master: 0, low: 0 }));

    atmosphere.start(levels);
    atmosphere.start(levels);
    frames(2);

    expect(levels).toHaveBeenCalledTimes(2);
  });

  it('stops dead when the board is torn down', () => {
    const { atmosphere, mount } = build();
    const levels = vi.fn(() => ({ master: 0, low: 1 }));
    atmosphere.start(levels);
    frames(2);

    atmosphere.destroy();
    const after = levels.mock.calls.length;
    frames(20);

    expect(levels).toHaveBeenCalledTimes(after);
    // And it leaves nothing behind: no layers, and none of the five variables,
    // every one of which went with the layer it was written on.
    expect(mount.childNodes).toHaveLength(0);
    for (const name of ATMOSPHERE_VARS) expect(onBody(name), name).toBe('');
  });
});

describe('the figure over the seal', () => {
  /** Everything drawn in the figure, as one string: what a redraw changes. */
  const drawn = (figure: HTMLElement): string => figure.innerHTML;
  const piece = (figure: HTMLElement, name: string): HTMLElement[] => [
    ...figure.querySelectorAll<HTMLElement>(`[data-part="${name}"]`),
  ];
  const tileOf = (element: HTMLElement | undefined): string =>
    decodeURIComponent(element?.style.backgroundImage ?? '');
  /** Pixels per unit of the figure: its deepest reach, on the inner ring. */
  const scale = (): number =>
    figureRadius() / glyphOf(ATMOSPHERE.sigil.key, ATMOSPHERE.sigil.maxDepth).reach;

  it('paints nothing until SERIOUSNESS has said how deep to draw it', () => {
    // A figure at a depth nobody chose is worse than no figure. The seam calls
    // this with the board's opening value before the first frame, the same way
    // it does the other two set-on-change layers.
    const { atmosphere } = build();
    expect(atmosphere.figure.children).toHaveLength(0);
    expect(atmosphere.figure.style.backgroundImage).toBe('');

    atmosphere.setSeriousness(0.5);
    expect(piece(atmosphere.figure, 'trunk')).toHaveLength(1);
    expect(tileOf(piece(atmosphere.figure, 'trunk')[0])).toContain('data:image/svg+xml');
  });

  it('buys a generation at a time as SERIOUSNESS rises, and redraws only then', () => {
    const { atmosphere } = build();
    const figure = (): string => drawn(atmosphere.figure);

    expect(depthAt(0)).toBe(ATMOSPHERE.sigil.minDepth);
    expect(depthAt(1)).toBe(ATMOSPHERE.sigil.maxDepth);
    // Out of range on either side clamps rather than extrapolating — a negative
    // depth draws nothing and a huge one is refused by the stroke budget.
    expect(depthAt(-2)).toBe(ATMOSPHERE.sigil.minDepth);
    expect(depthAt(9)).toBe(ATMOSPHERE.sigil.maxDepth);

    atmosphere.setSeriousness(0);
    const shallow = figure();
    atmosphere.setSeriousness(1);
    expect(figure()).not.toBe(shallow);

    // And a move that does not change the depth does not redraw: over the whole
    // of a wheel's travel there are four figures, not one per pointer event.
    atmosphere.setSeriousness(1);
    const kept = atmosphere.figure.firstElementChild;
    atmosphere.setSeriousness(0.99);
    expect(atmosphere.figure.firstElementChild).toBe(kept);
  });

  it('turns with the same band the wash breathes on, and rests at nothing', () => {
    const { atmosphere, mount } = build();
    const levels = vi.fn(() => ({ master: 0, low: 0.8 }));
    atmosphere.setSeriousness(0.5);

    // Nothing before the loop: the layer falls back to its resting angle in CSS.
    expect(read(mount, '--turn')).toBe('');
    expect(layer(mount, 'sigil').style.getPropertyValue('rotate')).toBe(`var(--turn, ${turnAt(0)})`);

    atmosphere.start(levels);
    frames(40);

    // One reading per frame, shared with the wash — not a second call, and not
    // a follower of its own.
    expect(Number.parseFloat(read(mount, '--turn'))).toBeGreaterThan(0);
    expect(levels).toHaveBeenCalledTimes(40);
    // Tracked, not accumulated: the angle is a function of the band alone, so a
    // band of zero is zero degrees rather than wherever it had got to.
    expect(turnAt(0)).toBe(`${(0).toFixed(ATMOSPHERE.sigil.digits)}deg`);
    expect(turnAt(1)).toBe(`${ATMOSPHERE.sigil.maxDeg.toFixed(ATMOSPHERE.sigil.digits)}deg`);
  });

  it('carries no stacking and no blend of its own', () => {
    // The board's emblem layer is where it is stacked (gt#102). A shadow needs no
    // blend at all: black at part strength, laid on plainly, darkens what is
    // under it in proportion, which is what a shadow is (gt#108).
    const { atmosphere } = build();
    atmosphere.setSeriousness(1);
    expect(atmosphere.figure.style.zIndex).toBe('');
    for (const element of [atmosphere.figure, ...atmosphere.figure.querySelectorAll<HTMLElement>('*')]) {
      expect(element.style.mixBlendMode).toBe('');
      expect(element.style.filter).toBe('');
    }
  });

  it('is a square in the middle of whatever it is seated in, sized to the seal’s inner ring', () => {
    const { atmosphere } = build();
    const figure = atmosphere.figure;
    const size = figureSize();

    expect(figure.style.left).toBe('50%');
    expect(figure.style.top).toBe('50%');
    expect(figure.style.width).toBe(`${size}px`);
    expect(figure.style.height).toBe(`${size}px`);
    expect(figure.style.marginLeft).toBe(`${-size / 2}px`);
    expect(figure.style.marginTop).toBe(`${-size / 2}px`);

    // Its furthest stroke lands inside the inner ring, and not far inside: the
    // two are one emblem, so the figure fills the ring it turns in.
    const ring = (BOARD.seal.size / 2) * SEAL.inner;
    expect(ATMOSPHERE.sigil.fill).toBeLessThan(1);
    expect(ATMOSPHERE.sigil.fill).toBeGreaterThan(0.8);
    expect(size).toBe(Math.round(hubBox(ring * ATMOSPHERE.sigil.fill)));
    expect(size / 2).toBeGreaterThan(ring * ATMOSPHERE.sigil.fill);
  });

  it('is a shadow: soft, dark, at one strength, in a pool of light', () => {
    // gt#108. "The 'shadow' of an eldritch entity far above being cast on the board."
    const { atmosphere } = build();
    atmosphere.setSeriousness(1);
    const [pool, shade] = [...atmosphere.figure.children] as HTMLElement[];

    // The light first, under the thing that blocks it.
    expect(pool?.dataset.part).toBe('pool');
    expect(pool?.style.backgroundImage.replace(/\s/g, '')).toBe(SIGIL_INK.pool.replace(/\s/g, ''));
    expect(pool?.style.opacity).toBe(`var(--glow, ${glowAt(0)})`);

    // Then the shadow as one group at one strength: where two limbs cross it
    // is no darker than either.
    expect(shade?.dataset.part).toBe('shade');
    expect(shade?.style.opacity).toBe(String(ATMOSPHERE.sigil.shade));
    expect(ATMOSPHERE.sigil.shade).toBeLessThan(1);
    expect(ATMOSPHERE.sigil.shade).toBeGreaterThan(0.3);
    for (const name of ['trunk', 'limb', 'finger']) {
      for (const element of piece(atmosphere.figure, name)) expect(shade?.contains(element), name).toBe(true);
    }

    // Every part is drawn in the board's own dark, wide and feathered — and
    // the feather is in the picture, not a filter run on every frame.
    const parts = ['trunk', 'limb', 'finger'].flatMap((name) => piece(atmosphere.figure, name));
    expect(parts.length).toBeGreaterThan(10);
    for (const element of parts) {
      const tile = tileOf(element);
      expect(tile).toContain(`stroke='${SIGIL_INK.shade}'`);
      expect(tile).toContain(`<feGaussianBlur stdDeviation='${ATMOSPHERE.sigil.blur}'/>`);
    }
    // Wide where it leaves the hub. It was a hairline when it was light.
    expect(ATMOSPHERE.sigil.stroke).toBeGreaterThan(6);
    expect(ATMOSPHERE.sigil.blur).toBeGreaterThan(1);
  });

  it('is built in three tiers: a trunk, a limb at each arm tip, fingers at each limb tip', () => {
    const { atmosphere } = build();
    atmosphere.setSeriousness(1);
    const tree = glyphTree(ATMOSPHERE.sigil.key, depthAt(1));
    const arms = tree.limbs.length;

    expect(arms).toBeGreaterThanOrEqual(3);
    expect(piece(atmosphere.figure, 'trunk')).toHaveLength(1);
    expect(piece(atmosphere.figure, 'limb')).toHaveLength(arms);
    expect(piece(atmosphere.figure, 'finger')).toHaveLength(arms * arms);

    // Nested the way the figure is: every finger inside its own limb, so a
    // limb's swing carries its fingers with it and theirs is added on top.
    piece(atmosphere.figure, 'limb').forEach((limb) => {
      expect(piece(limb, 'finger')).toHaveLength(arms);
      expect(limb.parentElement?.dataset.part).toBe('shade');
    });
    expect(piece(atmosphere.figure, 'trunk')[0]?.parentElement?.dataset.part).toBe('shade');
  });

  it('has no fingers when it is too shallow to have any', () => {
    const { atmosphere } = build();
    atmosphere.setSeriousness(0);
    expect(depthAt(0)).toBe(2);
    expect(piece(atmosphere.figure, 'limb').length).toBeGreaterThan(0);
    expect(piece(atmosphere.figure, 'finger')).toHaveLength(0);
  });

  it('hangs every part from the point it is jointed at', () => {
    // The turn has to be about the base, or a limb swings off the end of the
    // arm it grows from. Measured in pixels from the hub, through the nesting.
    const { atmosphere } = build();
    atmosphere.setSeriousness(1);
    const tree = glyphTree(ATMOSPHERE.sigil.key, depthAt(1));
    const k = scale();
    const at = (element: HTMLElement): { x: number; y: number } => {
      const [ox = 0, oy = 0] = element.style.transformOrigin.split(' ').map(parseFloat);
      return { x: parseFloat(element.style.left) + ox, y: parseFloat(element.style.top) + oy };
    };

    piece(atmosphere.figure, 'limb').forEach((limb, i) => {
      const base = tree.limbs[i]?.base ?? { x: NaN, y: NaN };
      expect(at(limb).x, `limb ${i}`).toBeCloseTo(base.x * k, 0);
      expect(at(limb).y, `limb ${i}`).toBeCloseTo(base.y * k, 0);

      piece(limb, 'finger').forEach((finger, j) => {
        const joint = tree.limbs[i]?.fingers[j]?.base ?? { x: NaN, y: NaN };
        // A finger is placed inside its limb's box, so add where that box is.
        expect(parseFloat(limb.style.left) + at(finger).x, `finger ${i}.${j}`).toBeCloseTo(joint.x * k, 0);
        expect(parseFloat(limb.style.top) + at(finger).y, `finger ${i}.${j}`).toBeCloseTo(joint.y * k, 0);
      });
    });
    // The trunk hangs from the hub and does not swing: it is what the rest swings from.
    const trunk = piece(atmosphere.figure, 'trunk')[0] as HTMLElement;
    expect(at(trunk).x).toBeCloseTo(0, 0);
    expect(at(trunk).y).toBeCloseTo(0, 0);
    expect(trunk.style.getPropertyValue('rotate')).toBe('');
  });

  it('is drawn at the scale the figure cut into the plate is, at every depth', () => {
    // gt#103. Its deepest reach on the inner ring, whatever depth it is drawn
    // at — so the arms stay where they are as it deepens, a generation is
    // added at the tips, and at rest every part lies on its own cut.
    const { atmosphere } = build();
    const trunk = (): HTMLElement => piece(atmosphere.figure, 'trunk')[0] as HTMLElement;

    atmosphere.setSeriousness(0);
    const shallow = [trunk().style.left, trunk().style.top, trunk().style.width, tileOf(trunk())];
    atmosphere.setSeriousness(1);
    const deep = [trunk().style.left, trunk().style.top, trunk().style.width, tileOf(trunk())];

    expect(deep).toEqual(shallow);
    expect(tileOf(trunk())).toContain(`transform='scale(${scale().toFixed(4)})'`);
    // The trunk is the figure's first generation, stroke for stroke.
    expect(tileOf(trunk())).toContain(glyphOf(ATMOSPHERE.sigil.key, 2).levels[0]?.d ?? 'missing');
  });

  it('is cut close: a part is a small box, not a layer the size of the figure', () => {
    // Thirty layers the size of the figure would be thirty times its texture
    // for a shape that covers a few percent of it.
    const { atmosphere } = build();
    atmosphere.setSeriousness(1);
    const whole = figureSize() * figureSize();
    const area = (element: HTMLElement): number => parseFloat(element.style.width) * parseFloat(element.style.height);
    const parts = ['trunk', 'limb', 'finger'].flatMap((name) => piece(atmosphere.figure, name));

    for (const finger of piece(atmosphere.figure, 'finger')) expect(area(finger)).toBeLessThan(whole / 8);
    expect(parts.reduce((sum, element) => sum + area(element), 0)).toBeLessThan(whole * 2.5);
    // Whole pixels, so a part is not resampled on its way to the screen.
    for (const element of parts) {
      expect(element.style.width).toMatch(/^\d+px$/);
      expect(element.style.height).toMatch(/^\d+px$/);
    }
  });

  it('keeps every moving part on a layer of its own', () => {
    // The joints run on a clock. Turning inside an unpromoted layer they would
    // repaint it every frame; as textures they are only moved.
    const { atmosphere } = build();
    atmosphere.setSeriousness(1);
    expect(atmosphere.figure.style.willChange).toContain('rotate');
    expect(atmosphere.figure.style.willChange).toContain('scale');
    for (const name of ['limb', 'finger']) {
      for (const element of piece(atmosphere.figure, name)) expect(element.style.willChange, name).toBe('rotate');
    }
  });

  it('lights the pool a little at rest, more as the room gets loud, and never past its ceiling', () => {
    const { rest, band, kick, max, digits } = ATMOSPHERE.sigil.glow;
    expect(glowAt(0)).toBe(rest.toFixed(digits));
    expect(glowAt(1)).toBe(Math.min(max, rest + band).toFixed(digits));
    expect(Number(glowAt(0.5))).toBeGreaterThan(Number(glowAt(0)));
    expect(Number(glowAt(0, 1))).toBeCloseTo(Math.min(max, rest + kick), digits);
    // The hammer's kick goes past 1 and the light does not follow it there.
    expect(glowAt(0, 2.6)).toBe(glowAt(0, 1));
    expect(Number(glowAt(1, 1))).toBeLessThanOrEqual(max);
    expect(glowAt(-3)).toBe(glowAt(0));
    expect(max).toBeLessThanOrEqual(1);
    expect(rest).toBeGreaterThan(0);
  });

  it('brightens the pool with the band the wash breathes on', () => {
    const { atmosphere, mount } = build();
    atmosphere.setSeriousness(0.5);
    // Before the loop the CSS already holds the resting glow.
    expect(read(mount, '--glow')).toBe('');

    atmosphere.start(() => ({ master: 0, low: 0.9 }));
    frames(60);

    expect(Number(read(mount, '--glow'))).toBeGreaterThan(Number(glowAt(0)));
    expect(Number(read(mount, '--glow'))).toBeLessThanOrEqual(Number(glowAt(1)));
  });

  it('flares the pool on a blow and lets it die away with the shake', () => {
    const { atmosphere, mount } = build();
    atmosphere.setSeriousness(0.5);
    atmosphere.start(() => ({ master: 0, low: 0 }));
    frames(3);
    expect(read(mount, '--glow')).toBe(glowAt(0));

    atmosphere.strike(1);
    frames(1);
    // The frame of the hit is the brightest one.
    const struck = Number(read(mount, '--glow'));
    expect(struck).toBeCloseTo(Number(glowAt(0, 1)), 2);

    frames(4);
    const fading = Number(read(mount, '--glow'));
    expect(fading).toBeLessThan(struck);
    expect(fading).toBeGreaterThan(Number(glowAt(0)));

    frames(120);
    expect(read(mount, '--glow')).toBe(glowAt(0));
  });

  it('is exactly its own size at rest, and swells with the room', () => {
    const { band, kick, digits } = ATMOSPHERE.sigil.swell;
    expect(swellAt(0)).toBe((1).toFixed(digits));
    expect(swellAt(1)).toBe((1 + band).toFixed(digits));
    expect(swellAt(0, 1)).toBe((1 + kick).toFixed(digits));
    expect(swellAt(1, 1)).toBe((1 + band + kick).toFixed(digits));
    // The hammer's extra is not the figure's, and nothing shrinks it.
    expect(swellAt(0, 2.6)).toBe(swellAt(0, 1));
    expect(swellAt(-4)).toBe(swellAt(0));
    // A breath, not a zoom.
    expect(band + kick).toBeLessThan(0.2);

    const { atmosphere, mount } = build();
    atmosphere.setSeriousness(0.5);
    expect(read(mount, '--swell')).toBe('');
    expect(atmosphere.figure.style.getPropertyValue('scale')).toBe(`var(--swell, ${swellAt(0)})`);

    atmosphere.start(() => ({ master: 0, low: 0.9 }));
    frames(80);
    expect(Number(read(mount, '--swell'))).toBeGreaterThan(1);
    expect(Number(read(mount, '--swell'))).toBeLessThanOrEqual(Number(swellAt(1)));
  });

  it('jumps on a blow and comes back', () => {
    const { atmosphere, mount } = build();
    atmosphere.setSeriousness(0.5);
    atmosphere.start(() => ({ master: 0, low: 0 }));
    frames(3);
    expect(read(mount, '--swell')).toBe(swellAt(0));

    atmosphere.strike(1);
    frames(1);
    expect(read(mount, '--swell')).toBe(swellAt(0, 1));

    frames(120);
    expect(read(mount, '--swell')).toBe(swellAt(0));
  });

  it('swings every joint off four numbers, each part at its own time', () => {
    // sin(clock + phase) is sin(clock)·cos(phase) + cos(clock)·sin(phase). The
    // tier publishes the two halves and each part mixes its own, so thirty
    // parts move on four writes.
    const { atmosphere } = build();
    atmosphere.setSeriousness(1);
    const limbs = piece(atmosphere.figure, 'limb');
    const rotateOf = (element: HTMLElement | undefined): string => element?.style.getPropertyValue('rotate') ?? '';
    const mix = (css: string): [number, number] => {
      const [, x, y] = /\* (-?[\d.]+)deg \+ var\([^)]*\) \* (-?[\d.]+)deg/.exec(css) ?? [];
      return [Number(x), Number(y)];
    };

    limbs.forEach((limb, i) => {
      const joint = jointAt(i, limbs.length);
      expect(rotateOf(limb)).toBe(
        `calc(var(--sway-x, ${SWAY_STILL}) * ${joint.cos}deg + var(--sway-y, ${SWAY_STILL}) * ${joint.sin}deg)`,
      );
      // A unit mix: the part takes the whole of the tier's swing, at its own phase.
      expect(Math.hypot(...mix(rotateOf(limb)))).toBeCloseTo(1, 2);

      piece(limb, 'finger').forEach((finger, j) => {
        const curl = jointAt(j, limbs.length, i);
        expect(rotateOf(finger)).toBe(
          `calc(var(--curl-x, ${SWAY_STILL}) * ${curl.cos}deg + var(--curl-y, ${SWAY_STILL}) * ${curl.sin}deg)`,
        );
      });
    });

    // No two limbs are in step, so a wave goes round the figure…
    expect(new Set(limbs.map(rotateOf)).size).toBe(limbs.length);
    // …and no two limbs' fingers are in step with each other either.
    const firsts = limbs.map((limb) => rotateOf(piece(limb, 'finger')[0]));
    expect(new Set(firsts).size).toBe(limbs.length);
  });

  it('swings the limbs slowly and the fingers faster, wider and quicker when the room is loud', () => {
    const { limb, finger, hurry, digits } = ATMOSPHERE.sigil.sway;
    // A finger travels further than the limb it is on, and gets there sooner.
    expect(finger.rest).toBeGreaterThan(limb.rest);
    expect(finger.ms).toBeLessThan(limb.ms);
    expect(limb.rest).toBeGreaterThan(0);
    // Slight. "Rotate slightly relative to their base."
    expect(finger.rest + finger.band).toBeLessThan(25);

    // The two halves of a swing: at a quarter turn of the clock it is all `x`.
    expect(swayAt(limb, Math.PI / 2, 0)).toEqual({ x: limb.rest.toFixed(digits), y: SWAY_STILL });
    expect(swayAt(limb, 0, 1)).toEqual({ x: SWAY_STILL, y: (limb.rest + limb.band).toFixed(digits) });
    // Never a negative nothing: the resting value is one string.
    expect(swayAt(limb, Math.PI, 0).x).toBe(SWAY_STILL);
    expect(swayAt(limb, -1e-9, 0).x).toBe(SWAY_STILL);

    // One swing there and back is one turn of the clock, in `ms` on a silent
    // room and sooner on a loud one.
    expect(swayStep(limb, limb.ms, 0)).toBeCloseTo(Math.PI * 2, 6);
    expect(swayStep(finger, finger.ms, 0)).toBeCloseTo(Math.PI * 2, 6);
    expect(swayStep(limb, limb.ms, 1)).toBeCloseTo(Math.PI * 2 * (1 + hurry), 6);
    expect(swayStep(limb, 16, 9)).toBe(swayStep(limb, 16, 1));
  });

  it('stirs on a silent room and writhes on a loud one', () => {
    const { limb, finger } = ATMOSPHERE.sigil.sway;
    const reach = (mount: HTMLElement, tier: string): number =>
      Math.hypot(Number(read(mount, `--${tier}-x`)), Number(read(mount, `--${tier}-y`)));

    const quiet = build();
    quiet.atmosphere.setSeriousness(1);
    // Before the loop every joint is straight, by the fallback in the CSS.
    expect(read(quiet.mount, '--sway-x')).toBe('');
    quiet.atmosphere.start(() => ({ master: 0, low: 0 }));
    frames(30);
    // The two halves are a sine and a cosine of one clock, so together they
    // are always the whole swing — whatever the clock says.
    expect(reach(quiet.mount, 'sway')).toBeCloseTo(limb.rest, 1);
    expect(reach(quiet.mount, 'curl')).toBeCloseTo(finger.rest, 1);
    const before = read(quiet.mount, '--curl-x');
    frames(30);
    expect(read(quiet.mount, '--curl-x')).not.toBe(before);

    const loud = build();
    loud.atmosphere.setSeriousness(1);
    loud.atmosphere.start(() => ({ master: 0, low: 1 }));
    frames(200);
    expect(reach(loud.mount, 'sway')).toBeGreaterThan(limb.rest + limb.band * 0.9);
    expect(reach(loud.mount, 'curl')).toBeGreaterThan(finger.rest + finger.band * 0.9);
  });

  it('goes back to rest when the board is stilled, every joint straight, and ignores a blow', () => {
    // Its own size, no turn, no swing: the shadow lying on its cut. Not frozen
    // mid-swing — a board pinned with a limb bent reads as paused.
    const { atmosphere, mount } = build();
    atmosphere.setSeriousness(0.5);
    atmosphere.start(() => ({ master: 0, low: 1 }));
    frames(60);
    expect(read(mount, '--glow')).not.toBe(glowAt(0));
    expect(read(mount, '--swell')).not.toBe(swellAt(0));

    atmosphere.setStill(true);
    const rest = (): void => {
      expect(read(mount, '--glow')).toBe(glowAt(0));
      expect(read(mount, '--swell')).toBe(swellAt(0));
      expect(read(mount, '--turn')).toBe(turnAt(0));
      for (const name of ['--sway-x', '--sway-y', '--curl-x', '--curl-y']) {
        expect(read(mount, name), name).toBe(SWAY_STILL);
      }
    };
    rest();

    atmosphere.strike(1);
    atmosphere.smash();
    frames(5);
    rest();

    // Released, a swing starts from the middle and not from where it stopped.
    atmosphere.setStill(false);
    frames(1);
    expect(Math.abs(Number(read(mount, '--sway-x')))).toBeLessThan(0.2);
  });

  it('is taken down with the rest, wherever it was seated', () => {
    const { atmosphere, mount } = build();
    const elsewhere = document.createElement('div');
    document.body.appendChild(elsewhere);
    elsewhere.appendChild(atmosphere.figure);
    expect(mount.contains(atmosphere.figure)).toBe(false);

    atmosphere.destroy();

    expect(elsewhere.contains(atmosphere.figure)).toBe(false);
    elsewhere.remove();
  });

  it('is not one of the layers the room shakes', () => {
    // A large centred figure that both jolts and rocks reads as a fault rather
    // than as a loud room. The shake stays the wash's and the grain's.
    const { atmosphere, mount } = build();
    atmosphere.setSeriousness(0.5);
    atmosphere.start(() => ({ master: 0, low: 1 }));
    frames(30);

    expect(shake(mount)).not.toBe(SHAKE_STILL);
    expect(layer(mount, 'sigil').style.getPropertyValue('--shake')).toBe('');
    expect(layer(mount, 'sigil').style.getPropertyValue('translate')).toBe('');
  });
});

describe('the two set on change', () => {
  it('gives every TUNING position its own hue, from the reference table', () => {
    const { atmosphere, mount } = build();

    // One hue per word, so a seventh TUNING position could not be added without
    // this failing — which is the point of asserting the length rather than the
    // contents alone.
    expect(ATMOSPHERE.hues).toHaveLength(TUNE_WORDS.length);
    expect(ATMOSPHERE.hues).toEqual([0, -12, -26, -42, -60, -80]);

    for (const [index, degrees] of ATMOSPHERE.hues.entries()) {
      atmosphere.setTuning(index);
      expect(read(mount, '--hue'), TUNE_WORDS[index]).toBe(`${degrees}deg`);
    }
    // The wash cools and greens as the board sinks; it never warms.
    expect(ATMOSPHERE.hues.every((degrees, at) => at === 0 || degrees < 0)).toBe(true);
  });

  it('clamps a TUNING position that is off either end of the table', () => {
    const hues: readonly number[] = ATMOSPHERE.hues;

    expect(hueFor(-3)).toBe(`${hues[0]}deg`);
    expect(hueFor(hues.length + 4)).toBe(`${hues[hues.length - 1]}deg`);
  });

  it('paints the grain from a tile no variable can touch', () => {
    // `--shake` and `--grit` are both written on this layer, and a variable
    // written on an element makes the browser work out again every property of
    // it that reads one. A background read through `--grainTex` was therefore a
    // new image, and the whole window of noise repainted, every time the room
    // shook: fifteen times a second on a loud board. Written out, it is not.
    //
    // Asked of the attribute and asked in the negative: happy-dom cannot parse
    // a data URL as a background and drops it, so the tile itself is not here
    // to compare. What it would keep is a `var()`, and there must not be one —
    // in this layer or in either of the two that are written every frame.
    const { mount } = build();
    for (const part of ['film', 'wash', 'vignette']) {
      const written = layer(mount, part).getAttribute('style') ?? '';
      expect(written, part).not.toContain('Tex)');
      expect(written, part).not.toMatch(/background(-image)?:[^;]*var\(/);
    }
    // And the tile it is written from is the board's own grain, not a copy.
    expect(textures.grain).toContain('feTurbulence');
    expect(cssVars['--grainTex']).toBe(textures.grain);
  });

  it('sends GRIT to the grain and to both edges', () => {
    const { atmosphere, mount } = build();

    atmosphere.setGrit(0.55);

    // The one of the five with three readers, and it is written on each of the
    // three — never on the page, where one write restyles every node under it.
    for (const part of ['film', 'edgeWarm', 'edgeCold']) {
      expect(layer(mount, part).style.getPropertyValue('--grit'), part).toBe('0.550');
    }
    expect(onBody('--grit')).toBe('');
    // Asked for the same amount again, it is told to nobody.
    const film = layer(mount, 'film');
    const told = vi.spyOn(film.style, 'setProperty');
    atmosphere.setGrit(0.55);
    expect(told).not.toHaveBeenCalled();
    told.mockRestore();
    // Not asserted as a computed opacity — happy-dom does not resolve calc() —
    // but as the arithmetic the browser is handed, which is the transcription
    // that could actually be wrong.
    expect(layer(mount, 'film').style.opacity).toBe(
      `calc(${textureLayers.film.base} + var(--grit, 0) * ${textureLayers.film.grit})`,
    );
    for (const part of ['edgeWarm', 'edgeCold']) {
      expect(layer(mount, part).style.opacity, part).toBe(
        `calc(var(--grit, 0) * ${ATMOSPHERE.edgeOpacity})`,
      );
    }
  });
});

describe('the shake', () => {
  it('is silent below the floor, at every band under it', () => {
    // Not "small below the floor" — absent. The whole design of this variable is
    // that a board at its resting low band is exactly as still as a board without
    // the feature, so the check walks the range rather than sampling a corner.
    for (let band = 0; band <= ATMOSPHERE.shake.floor; band += 0.05) {
      expect(shakeAmount(band), String(band)).toBe(0);
      expect(shakeAt(band, 3), String(band)).toBe(SHAKE_STILL);
    }
  });

  it('rises from nothing at the floor to its whole reach at the top', () => {
    expect(shakeAmount(ATMOSPHERE.shake.floor)).toBe(0);
    expect(shakeAmount(1)).toBe(1);
    // Monotonic in between, and clamped past the top: a band over 1 is not a
    // bigger shake, because the reading it comes from cannot mean one.
    const half = (1 + ATMOSPHERE.shake.floor) / 2;
    expect(shakeAmount(half)).toBeGreaterThan(0);
    expect(shakeAmount(half)).toBeLessThan(1);
    expect(shakeAmount(4)).toBe(1);
  });

  it('never reaches further than the few pixels it is allowed', () => {
    // The offsets are unit values scaled by the amount, so the widest any frame
    // can throw the room is the table's own largest entry at full band.
    const widest = Math.max(
      ...ATMOSPHERE.shake.jitter.flat().map((unit) => Math.abs(unit)),
    );
    for (let tick = 0; tick < ATMOSPHERE.shake.jitter.length; tick++) {
      for (const offset of shakeAt(1, tick).split(' ')) {
        expect(Math.abs(Number(offset.replace('px', ''))), offset).toBeLessThanOrEqual(
          ATMOSPHERE.shake.maxPx * widest,
        );
      }
    }
  });

  it('translates and never rotates', () => {
    const { mount } = build();

    // The handoff's v2 amendment: labels on this board are never tilted, and a
    // board that rotates reads as a broken layout rather than a loud one. Two
    // values per frame, both lengths, and nothing anywhere that turns.
    expect(shakeAt(1, 0).split(' ')).toHaveLength(2);
    for (const value of shakeAt(1, 0).split(' ')) expect(value).toMatch(/^-?\d+\.\d+px$/);
    // Checked on the two properties that could carry a turn, rather than on the
    // whole cssText: the wash's `filter` says `hue-rotate`, which is a colour and
    // not a rotation, and a blunter assertion would fail on it and prove nothing.
    for (const element of [layer(mount, 'wash'), layer(mount, 'film')]) {
      expect(element.style.getPropertyValue('rotate')).toBe('');
      expect(element.style.getPropertyValue('transform')).not.toContain('rotate');
      // The shake itself, and the property it is carried on. `--shake` is a pair
      // of lengths and this is where they land — no angle can reach the page.
      expect(element.style.getPropertyValue('translate')).toBe(`var(--shake, ${SHAKE_STILL})`);
    }
  });

  it('steps through the jitter table rather than drifting', () => {
    // A fixed table, one entry per frame, round again. The three properties it
    // is built to have are each a way it could otherwise stop reading as a room
    // being hit — see ATMOSPHERE.shake.jitter.
    const table = ATMOSPHERE.shake.jitter;
    expect(shakeAt(1, table.length)).toBe(shakeAt(1, 0));

    const quadrant = (pair: readonly number[]): string =>
      `${Math.sign(pair[0]!)},${Math.sign(pair[1]!)}`;
    const sum = (axis: number): number =>
      table.reduce((total, pair) => total + (pair[axis] ?? 0), 0);

    for (let at = 0; at < table.length; at++) {
      const here = table[at]!;
      const next = table[(at + 1) % table.length]!;
      // Never twice the same way along x, wrap included: that is what makes it
      // a jolt rather than a slide.
      expect(Math.sign(here[0]!), `x at ${at}`).not.toBe(Math.sign(next[0]!));
      // And never twice into the same corner, which alternating x alone would
      // still allow — the shake would oscillate down one diagonal.
      expect(quadrant(here), `quadrant at ${at}`).not.toBe(quadrant(next));
    }
    expect(new Set(table.map(quadrant)).size, 'all four corners are used').toBe(4);
    // Closed: a loud passage held for a whole cycle leaves the room where it
    // found it rather than walking it off centre.
    expect(sum(0)).toBeCloseTo(0, 10);
    expect(sum(1)).toBeCloseTo(0, 10);
  });

  it('catches a loud band faster than the atmosphere does', () => {
    const { atmosphere, mount } = build();

    expect(ATMOSPHERE.shake.follow).toBeGreaterThan(ATMOSPHERE.lerp);

    // The whole difference between atmosphere and impact is the rate, and this
    // is that difference made visible. A few frames after a jump to full, the
    // fast follower is already over the floor and shaking — while the lerped
    // band the rest of the room moves on is still nowhere near it, and would
    // need a good twenty more frames to arrive.
    const after = (rate: number, count: number): number => 1 - (1 - rate) ** count;
    let soon = 1;
    while (after(ATMOSPHERE.shake.follow, soon) <= ATMOSPHERE.shake.floor) soon += 1;
    // Three frames is a twentieth of a second. The floor went up in gt#70 and this
    // is what holds it to still being a jolt: a shake that took a quarter of a
    // second to answer a hit would be the atmosphere, arriving late.
    expect(soon).toBeLessThanOrEqual(3);

    atmosphere.start(() => ({ master: 0, low: 1 }));
    frames(soon);

    expect(after(ATMOSPHERE.lerp, soon)).toBeLessThan(ATMOSPHERE.shake.floor);
    expect(shake(mount)).not.toBe(SHAKE_STILL);
  });

  it('sits above where a held drone reads, and under where the board surges (gt#70)', () => {
    // The floor is only a design if the board actually lands on both sides of
    // it. These are the low band as the running board read it — raw RMS through
    // the scale the engine now applies; see 'the level reading' in
    // tests/engine-core.test.ts for where they came from.
    const read = (raw: number): number => raw * LEVEL_SCALE.low;

    // Every board's median, whatever was playing, and BASS on its own at its
    // loudest: a held drone, which must not shake.
    for (const median of [0.434, 0.361, 0.389, 0.354, 0.352, 0.333, 0.397]) {
      expect(shakeAmount(read(median)), `median ${median}`).toBe(0);
    }
    expect(shakeAmount(read(0.443))).toBe(0);

    // The opening board's top tenth: the low end surging, which should.
    expect(shakeAmount(read(0.481))).toBeGreaterThan(0);
    expect(shakeAmount(read(0.516))).toBeGreaterThan(0.25);
    // …and nowhere near the whole reach, which is the hammer's alone.
    expect(shakeAmount(read(0.516))).toBeLessThan(0.6);
    expect(shakeAmount(ATMOSPHERE.shake.smash)).toBe(1);
  });

  it('lands on both shaken layers and on neither of the other three', () => {
    const { atmosphere, mount } = build();

    atmosphere.start(() => ({ master: 0, low: 1 }));
    frames(30);

    expect(shake(mount)).not.toBe(SHAKE_STILL);
    // The vignette and the two fringes are pinned flush to the window, so a
    // translate on any of them would open a bright strip down one side.
    for (const part of ['vignette', 'edgeWarm', 'edgeCold']) {
      expect(layer(mount, part).style.getPropertyValue('--shake'), part).toBe('');
    }
    // And never on the page, for the reason the other four are not: it moves
    // every frame, and the whole document would restyle with it.
    expect(onBody('--shake')).toBe('');
  });

  it('leaves the plate alone, which is what keeps a wire drag honest', () => {
    const { atmosphere, mount } = build();
    atmosphere.start(() => ({ master: 0, low: 1 }));
    frames(30);

    // The layers that shake are fixed to the page and carry no jacks. If this
    // ever moved onto the plate, the wire layer's measured jack rects would go
    // stale mid-drag and the drop target would wander under the cursor — see
    // ./wires and gt#22. Nothing here is a child of anything but the page shell.
    for (const part of ['wash', 'film']) {
      expect(layer(mount, part).parentNode, part).toBe(mount);
      expect(layer(mount, part).style.position, part).toBe('fixed');
      expect(layer(mount, part).querySelector('[data-jack-in],[data-jack-out]')).toBeNull();
    }
  });
});

// The second way `--shake` moves, and the only one that is not a reading (gt#40),
// and since gt#74 an envelope of its own rather than a shove on the follower.
describe('the impulse', () => {
  it('throws the room on a quiet board, where nothing else could have', () => {
    const { atmosphere, mount } = build();
    atmosphere.start(() => ({ master: 0, low: quiet }));
    frames(20);
    // Settled well under the floor. Whatever moves this next is the hammer.
    expect(shake(mount)).toBe(SHAKE_STILL);

    atmosphere.smash();
    frames(1);
    expect(shake(mount)).not.toBe(SHAKE_STILL);
  });

  it('hits harder than the loudest thing the engine can report', () => {
    // A hit is not the room being loud, it is the room being struck. An impulse
    // that only reached what a loud passage already reaches would be invisible
    // during one, which is the moment somebody is most likely to smash. The
    // heaviest surge measured on a running board is the low tap at .516 through
    // the engine's scale, which is under six tenths of the reach.
    expect(shakeAmount(0.516 * LEVEL_SCALE.low)).toBeLessThan(0.6);
    // And the hammer is past the reach altogether (gt#92). It was exactly the
    // reach, which made it the same size as one SLOW HIT at full WEIGHT — and
    // behind a board whose every knob was travelling, nobody saw it land.
    expect(ATMOSPHERE.shake.smash).toBeGreaterThanOrEqual(2);
    expect(SHAKE_CEILING).toBe(ATMOSPHERE.shake.smash);
  });

  it('throws the room further than any strike can, however hard the strike is asked for', () => {
    const { atmosphere, mount } = build();
    atmosphere.start(() => ({ master: 0, low: quiet }));
    frames(20);

    /** How far the room is thrown this frame. */
    const reach = (): number => {
      const value = shake(mount);
      if (value === SHAKE_STILL) return 0;
      const [x = 0, y = 0] = value.split(' ').map((part) => Math.abs(parseFloat(part)));
      return Math.max(x, y);
    };

    // A strike handed a strength from past the end of its range is the reach
    // and no more: only one thing on the board is let past it.
    atmosphere.strike(40);
    frames(1);
    const struck = reach();
    expect(struck).toBeLessThanOrEqual(ATMOSPHERE.shake.maxPx);
    expect(struck).toBeGreaterThan(ATMOSPHERE.shake.maxPx * 0.5);

    frames(60);
    expect(shake(mount)).toBe(SHAKE_STILL);

    atmosphere.smash();
    frames(1);
    expect(reach()).toBeGreaterThan(struck * 2);
    expect(reach()).toBeLessThanOrEqual(ATMOSPHERE.shake.maxPx * ATMOSPHERE.shake.smash);
  });

  it('lasts long enough to be seen, and then ends', () => {
    // It used to be a shove on the fast follower, left to that follower's own
    // rate: two frames over the floor, a thirtieth of a second. On the one
    // gesture in the product built around an impact, that is no impact (gt#74).
    const { atmosphere, mount } = build();
    atmosphere.start(() => ({ master: 0, low: quiet }));
    frames(20);

    atmosphere.smash();
    let shaken = 0;
    for (let i = 0; i < 60; i += 1) {
      frames(1);
      if (shake(mount) !== SHAKE_STILL) shaken += 1;
    }

    // Longer than a drum's kick, because it starts higher on the same decay
    // (gt#92) — and still not half a second.
    let drum = 0;
    for (let kick = 1; kick > 0; kick = kickAfter(kick)) drum += 1;
    expect(shaken).toBeGreaterThan(drum);
    expect(shaken).toBeLessThan(30);
    expect(shake(mount)).toBe(SHAKE_STILL);
  });

  it('dies away, each frame smaller than the one before', () => {
    const { atmosphere, mount } = build();
    atmosphere.start(() => ({ master: 0, low: quiet }));
    frames(20);

    /** How far the room is thrown this frame, whichever way the table sends it. */
    const reach = (): number => {
      const value = shake(mount);
      if (value === SHAKE_STILL) return 0;
      const [x = 0, y = 0] = value.split(' ').map((part) => Math.abs(parseFloat(part)));
      return Math.hypot(x, y);
    };

    atmosphere.smash();
    frames(1);
    const first = reach();
    // The frame of the hit is the hit: everything the hammer has, along the
    // first entry of the table, before anything has been taken off it.
    expect(first).toBeGreaterThan(ATMOSPHERE.shake.maxPx * ATMOSPHERE.shake.smash * 0.9);

    // Every eighth frame is the same entry of the table, so the only thing that
    // differs between them is how much of the kick is left.
    const period = ATMOSPHERE.shake.jitter.length;
    frames(period);
    const second = reach();
    frames(period);
    const third = reach();

    expect(second).toBeLessThan(first);
    expect(third).toBeLessThan(second);
    expect(third).toBeGreaterThan(0);
  });

  it('moves nothing at all on a stilled board, and stores nothing for later', () => {
    const { atmosphere, mount } = build();
    atmosphere.start(() => ({ master: 0, low: quiet }));
    frames(20);
    atmosphere.setStill(true);

    atmosphere.smash();
    frames(10);
    expect(shake(mount)).toBe(SHAKE_STILL);

    // And releasing the switch does not deliver a jolt from a hit minutes ago —
    // the impulse was dropped, not queued.
    atmosphere.setStill(false);
    frames(1);
    expect(shake(mount)).toBe(SHAKE_STILL);
  });

  it('does nothing at all before the lever, because there is no frame coming', () => {
    const { atmosphere, mount } = build();

    expect(() => atmosphere.smash()).not.toThrow();
    expect(() => atmosphere.strike(1)).not.toThrow();
    frames(10);
    // Not merely still — never written. The CSS fallback is the whole of the
    // room until the engine exists.
    expect(layer(mount, 'wash').style.getPropertyValue('--shake')).toBe('');
  });
});

// What a kick is, as arithmetic a suite can hold without running a frame (gt#74).
describe('the kick', () => {
  it('falls by about half every five frames, and is gone in a third of a second', () => {
    let kick = 1;
    for (let i = 0; i < 5; i += 1) kick = kickAfter(kick);
    expect(kick).toBeGreaterThan(0.4);
    expect(kick).toBeLessThan(0.55);

    let frame = 5;
    while (kick > 0) {
      kick = kickAfter(kick);
      frame += 1;
    }
    // Sixty frames a second: between a quarter and four tenths of one.
    expect(frame).toBeGreaterThanOrEqual(15);
    expect(frame).toBeLessThanOrEqual(24);
  });

  it('ends rather than trailing off', () => {
    // Under the floor it is nothing, not a small number — the same rule the
    // band's own floor keeps. A kick that decayed forever would be a write to
    // two layers every frame to move them a hundredth of a pixel.
    expect(kickAfter(ATMOSPHERE.shake.kick.floor)).toBe(0);
    expect(kickAfter(0)).toBe(0);
    expect(kickAfter(1)).toBe(ATMOSPHERE.shake.kick.decay);
  });

  it('draws an amount the way it draws a band at that amount', () => {
    expect(shakeOf(0, 3)).toBe(SHAKE_STILL);
    expect(shakeOf(-1, 3)).toBe(SHAKE_STILL);
    expect(shakeOf(1, 3)).toBe(shakeAt(1, 3));
    // Past the reach is the hammer's (gt#92), and past the hammer is the hammer.
    // Nothing throws the room further than that.
    expect(shakeOf(SHAKE_CEILING, 3)).not.toBe(shakeOf(1, 3));
    expect(shakeOf(40, 3)).toBe(shakeOf(SHAKE_CEILING, 3));
    const half = (1 + ATMOSPHERE.shake.floor) / 2;
    expect(shakeOf(0.5, 5)).toBe(shakeAt(half, 5));
  });
});

describe('how hard a strike kicks the room', () => {
  it('makes WEIGHT mean what its hover line has always said it means', () => {
    // "How much the room shakes." At no WEIGHT it is a tap, at full WEIGHT and
    // full loudness it is the whole reach — and still well short of the hammer,
    // which is the one thing let past it (gt#92).
    const cut = ATMOSPHERE.shake.strikes.slowhit!;
    expect(kickFor('slowhit', 1, 0)).toBeCloseTo(cut.base, 10);
    expect(kickFor('slowhit', 1, 1)).toBe(1);
    expect(kickFor('slowhit', 1, 1)).toBeLessThan(ATMOSPHERE.shake.smash / 2);
    expect(kickFor('slowhit', 1, 0.5)).toBeGreaterThan(kickFor('slowhit', 1, 0));
    expect(kickFor('slowhit', 1, 0)).toBeGreaterThan(0);
  });

  it('answers HOW LOUD as well, down to nothing at nothing', () => {
    expect(kickFor('slowhit', 0, 1)).toBe(0);
    expect(kickFor('slowhit', 0.5, 1)).toBeCloseTo(0.5, 10);
    expect(kickFor('slowhit', 0.5, 1)).toBeLessThan(kickFor('slowhit', 1, 1));
  });

  it('keeps the cannon under the drum at every setting', () => {
    // The discharge is the longest event on the board; it must not also be the
    // heaviest.
    for (const char of [0, 0.25, 0.5, 0.75, 1]) {
      expect(kickFor('laser', 1, char), `at ${char}`).toBeLessThan(kickFor('slowhit', 1, char));
      expect(kickFor('laser', 1, char), `at ${char}`).toBeGreaterThan(0);
    }
  });

  it('moves the room for nothing that has no row', () => {
    // MARACAS firing ten times in a trigger is a rattle, not ten blows — and a
    // swell, a moo and a voice are not blows at all.
    for (const id of ['maracas', 'cymbal', 'cow', 'voice', 'guitar', 'nothing-by-this-name']) {
      expect(kickFor(id, 1, 1), id).toBe(0);
    }
    expect(Object.keys(ATMOSPHERE.shake.strikes).sort()).toEqual(['laser', 'slowhit']);
  });

  it('never asks for more than the whole reach, whatever it is handed', () => {
    expect(kickFor('slowhit', 9, 9)).toBe(1);
    expect(kickFor('slowhit', -1, 1)).toBe(0);
    expect(kickFor('slowhit', 1, -1)).toBeCloseTo(ATMOSPHERE.shake.strikes.slowhit!.base, 10);
  });
});

describe('a strike in the room', () => {
  it('moves it by its strength, and not at all at none', () => {
    const { atmosphere, mount } = build();
    atmosphere.start(() => ({ master: 0, low: quiet }));
    frames(20);

    atmosphere.strike(0);
    frames(1);
    expect(shake(mount)).toBe(SHAKE_STILL);

    atmosphere.strike(0.5);
    frames(1);
    // The frame after the hit, at whichever table entry that frame is on.
    const written = shake(mount);
    expect(written).not.toBe(SHAKE_STILL);
    const table = ATMOSPHERE.shake.jitter;
    expect(table.map((_, tick) => shakeOf(0.5, tick))).toContain(written);
  });

  it('is the harder of two blows in flight, never the later', () => {
    const { atmosphere, mount } = build();
    atmosphere.start(() => ({ master: 0, low: quiet }));
    frames(20);

    atmosphere.strike(1);
    atmosphere.strike(0.2);
    frames(1);

    const table = ATMOSPHERE.shake.jitter;
    expect(table.map((_, tick) => shakeOf(1, tick))).toContain(shake(mount));
  });

  it('shows over a loud passage rather than being lost in it', () => {
    // The larger of the two sources, not whichever came from the engine. Held
    // just over the floor the band asks for a little; the blow asks for it all.
    const { atmosphere, mount } = build();
    const loud = ATMOSPHERE.shake.floor + (1 - ATMOSPHERE.shake.floor) * 0.2;
    atmosphere.start(() => ({ master: 0, low: loud }));
    frames(120);
    const table = ATMOSPHERE.shake.jitter;
    const band = shakeAmount(loud);
    expect(band).toBeGreaterThan(0);
    expect(band).toBeLessThan(0.3);

    atmosphere.strike(1);
    frames(1);
    expect(table.map((_, tick) => shakeOf(1, tick))).toContain(shake(mount));

    // …and when the blow has died away the passage is still there under it.
    frames(60);
    const settled = shake(mount);
    expect(settled).not.toBe(SHAKE_STILL);
    expect(table.map((_, tick) => shakeOf(1, tick))).not.toContain(settled);
  });

  it('is dropped on a stilled board, and a blow in flight is dropped with it', () => {
    const { atmosphere, mount } = build();
    atmosphere.start(() => ({ master: 0, low: quiet }));
    frames(20);

    atmosphere.strike(1);
    frames(2);
    expect(shake(mount)).not.toBe(SHAKE_STILL);

    atmosphere.setStill(true);
    expect(shake(mount)).toBe(SHAKE_STILL);
    atmosphere.strike(1);

    // Neither the one that was dying away nor the one refused comes back.
    atmosphere.setStill(false);
    frames(3);
    expect(shake(mount)).toBe(SHAKE_STILL);
  });
});

describe('STILLNESS', () => {
  it('pins the room where it rests, not where it happened to stop', () => {
    const { atmosphere, mount } = build();
    atmosphere.start(() => ({ master: 0, low: 1 }));
    frames(60);
    expect(read(mount, '--breathe')).not.toBe(washAt(0).breathe);

    atmosphere.setStill(true);

    // Back to the resting room rather than frozen mid-swing: a stilled board
    // should look like the board before WAKE IT, not like a paused one.
    for (const [name, value] of Object.entries(washAt(0))) {
      expect(read(mount, `--${name}`), name).toBe(value);
    }
    expect(shake(mount)).toBe(SHAKE_STILL);
    expect(layer(mount, 'film').style.animationPlayState).toBe('paused');
  });

  it('stops the figure square rather than freezing it mid-turn', () => {
    // gt#36 requires the fractal to sit behind this switch, and tracking the band
    // rather than accumulating off it is what makes that clean: the figure has
    // a resting angle to go back to. A rotation whose *rate* followed the band
    // could only be frozen wherever the last frame left it, and a board pinned
    // at 19° reads as paused rather than as at rest.
    const { atmosphere, mount } = build();
    atmosphere.setSeriousness(0.7);
    atmosphere.start(() => ({ master: 0, low: 1 }));
    frames(60);
    expect(read(mount, '--turn')).not.toBe(turnAt(0));

    atmosphere.setStill(true);

    expect(read(mount, '--turn')).toBe(turnAt(0));
    // The figure itself stays where it is. STILLNESS stops the board moving; it
    // does not undo a value the user set, any more than it changes the sound.
    expect(layer(mount, 'sigil').querySelectorAll('[data-part="limb"]').length).toBeGreaterThan(0);
  });

  it('stops reading the engine at all', () => {
    const { atmosphere } = build();
    const levels = vi.fn(() => ({ master: 0.5, low: 1 }));
    atmosphere.start(levels);
    frames(5);

    atmosphere.setStill(true);
    const after = levels.mock.calls.length;
    frames(60);

    // Not "reads and discards" — the loop is off. A still room costs a still
    // board nothing at all.
    expect(levels).toHaveBeenCalledTimes(after);
  });

  it('never runs a frame on a board that opened stilled', () => {
    const { atmosphere } = build();
    const levels = vi.fn(() => ({ master: 0, low: 1 }));

    atmosphere.setStill(true);
    atmosphere.start(levels);
    frames(30);

    expect(levels).not.toHaveBeenCalled();
  });

  it('picks the room back up from wherever the engine is now', () => {
    const { atmosphere, mount } = build();
    const levels = vi.fn(() => ({ master: 0, low: 1 }));
    atmosphere.setStill(true);
    atmosphere.start(levels);
    frames(10);

    atmosphere.setStill(false);
    frames(30);

    expect(levels).toHaveBeenCalled();
    expect(shake(mount)).not.toBe(SHAKE_STILL);
    expect(layer(mount, 'film').style.animationPlayState).toBe('');
  });

  it('is a no-op said twice, either way', () => {
    const { atmosphere } = build();
    const levels = vi.fn(() => ({ master: 0, low: 1 }));
    atmosphere.start(levels);
    frames(2);

    atmosphere.setStill(true);
    atmosphere.setStill(true);
    const after = levels.mock.calls.length;
    frames(10);
    expect(levels).toHaveBeenCalledTimes(after);

    atmosphere.setStill(false);
    atmosphere.setStill(false);
    frames(10);
    // One loop after two releases, not two.
    expect(levels).toHaveBeenCalledTimes(after + 10);
  });
});

describe('the arithmetic', () => {
  it('is held to the original design', () => {
    // The three formulas and the lerp, as the original design wrote them.
    // `--vig` is a subtraction there, which is why its scale is held negative
    // here rather than being flipped at the point of use.
    expect([ATMOSPHERE.breathe.base, ATMOSPHERE.breathe.scale]).toEqual([1, 0.035]);
    expect([ATMOSPHERE.brite.base, ATMOSPHERE.brite.scale]).toEqual([0.94, 0.28]);
    expect([ATMOSPHERE.vig.base, ATMOSPHERE.vig.scale]).toEqual([0.62, -0.4]);
    expect(ATMOSPHERE.lerp).toBe(0.1);
  });

  it('holds each variable to the precision the reference writes it at', () => {
    // Four places on the scale, three on the rest: a 3.5% swing needs the extra
    // digit to move at all, and the other two do not.
    expect(washAt(0.5).breathe).toMatch(/^\d\.\d{4}$/);
    expect(washAt(0.5).brite).toMatch(/^\d\.\d{3}$/);
    expect(washAt(0.5).vig).toMatch(/^\d\.\d{3}$/);
  });
});

// GRIT's two colour fringes, bent round the frame (gt#96). They were a warm bar
// down one side of the window and a cold bar down the other.
describe('the fringes round the frame', () => {
  /** The ellipse a fringe is painted as: its radii and centre in percent, and its stops. */
  function shape(paint: string): { rx: number; ry: number; cx: number; cy: number; stops: Array<[number, number]> } {
    const head = /ellipse ([\d.]+)% ([\d.]+)% at ([\d.]+)% ([\d.]+)%/.exec(paint);
    const stops = [...paint.matchAll(/rgba\(\d+,\d+,\d+,([\d.]+)\) ([\d.]+)%/g)].map(
      (match) => [Number(match[2]) / 100, Number(match[1])] as [number, number],
    );
    const [rx, ry, cx, cy] = (head?.slice(1) ?? []).map(Number);
    return { rx: rx ?? NaN, ry: ry ?? NaN, cx: cx ?? NaN, cy: cy ?? NaN, stops };
  }

  /** How much colour a fringe lays at a point of the window, both in percent. */
  function at(paint: string, x: number, y: number): number {
    const { rx, ry, cx, cy, stops } = shape(paint);
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
    const first = stops[0] ?? [0, 0];
    const last = stops[stops.length - 1] ?? [1, 0];
    if (d <= first[0]) return first[1];
    if (d >= last[0]) return last[1];
    for (let i = 1; i < stops.length; i += 1) {
      const [to, alpha] = stops[i] ?? [1, 0];
      const [from, before] = stops[i - 1] ?? [0, 0];
      if (d <= to) return before + ((alpha - before) * (d - from)) / (to - from);
    }
    return last[1];
  }

  const warm = surfaces.gritEdgeWarm;
  const cold = surfaces.gritEdgeCold;

  it('covers the whole window, pinned flush, and takes no pointer', () => {
    const { mount } = build();

    for (const part of ['edgeWarm', 'edgeCold']) {
      const style = layer(mount, part).style;
      expect(style.position, part).toBe('fixed');
      for (const side of ['left', 'top', 'right', 'bottom'] as const) expect(style[side], `${part} ${side}`).toBe('0px');
      expect(style.width, part).toBe('');
      expect(style.pointerEvents, part).toBe('none');
      expect(style.mixBlendMode, part).toBe('screen');
    }
  });

  it('is clear across the middle of the picture, where the board is read', () => {
    for (const paint of [warm, cold]) {
      for (const [x, y] of [[50, 50], [30, 40], [70, 60], [50, 20], [20, 50], [80, 50], [50, 80]] as const) {
        expect(at(paint, x, y), `${x},${y}`).toBe(0);
      }
    }
  });

  it('is heaviest in a corner, and lighter along the edges that meet there', () => {
    // The warm one gathers at the top left and the cold one at the bottom
    // right. A bar is the same down its whole length; this is not a bar.
    expect(at(warm, 0, 0)).toBeGreaterThan(at(warm, 0, 50) * 2);
    expect(at(warm, 0, 0)).toBeGreaterThan(at(warm, 50, 0) * 2);
    expect(at(warm, 0, 50)).toBeGreaterThan(0);
    expect(at(warm, 50, 0)).toBeGreaterThan(0);

    expect(at(cold, 100, 100)).toBeGreaterThan(at(cold, 100, 50) * 2);
    expect(at(cold, 100, 100)).toBeGreaterThan(at(cold, 50, 100) * 2);
    expect(at(cold, 100, 50)).toBeGreaterThan(0);
    expect(at(cold, 50, 100)).toBeGreaterThan(0);
  });

  it('puts the two colours on opposite diagonals, and some of both in every corner', () => {
    // Opposite, which is what makes it a split and not a tint.
    expect(at(warm, 0, 0)).toBeGreaterThan(at(warm, 100, 100));
    expect(at(cold, 100, 100)).toBeGreaterThan(at(cold, 0, 0));
    expect(at(warm, 100, 50)).toBe(0);
    expect(at(cold, 0, 50)).toBe(0);

    for (const [x, y] of [[0, 0], [100, 0], [0, 100], [100, 100]] as const) {
      expect(at(warm, x, y), `warm ${x},${y}`).toBeGreaterThan(0);
      expect(at(cold, x, y), `cold ${x},${y}`).toBeGreaterThan(0);
    }
  });

  it('mirrors one in the other', () => {
    const a = shape(warm);
    const b = shape(cold);

    expect(a.rx).toBe(b.rx);
    expect(a.ry).toBe(b.ry);
    expect(a.cx + b.cx).toBe(100);
    expect(a.cy + b.cy).toBe(100);
    expect(a.stops.map(([stop]) => stop)).toEqual(b.stops.map(([stop]) => stop));
  });

  it('keeps the reference’s two colours, and never fades through grey', () => {
    // Every stop of a fringe is its own colour at some strength — a clear stop
    // written as black would drag the blend through mud on the way down.
    expect([...warm.matchAll(/rgba\((\d+,\d+,\d+),/g)].map((match) => match[1])).toEqual(
      ['255,70,30', '255,70,30', '255,70,30'],
    );
    expect([...cold.matchAll(/rgba\((\d+,\d+,\d+),/g)].map((match) => match[1])).toEqual(
      ['60,200,220', '60,200,220', '60,200,220'],
    );
  });
});

// The room keeps its pace on any display (gt#120).
describe('the clock', () => {
  /** A display to be: frames are handed out by hand, at whatever rate is asked. */
  const display = (): FrameRequestCallback[] => {
    const queue: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (run: FrameRequestCallback): number => queue.push(run));
    vi.stubGlobal('cancelAnimationFrame', (): void => {});
    return queue;
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * The room after `ms` of one held level, on a display running at `hz`. Fake
   * timers hand out a frame every 16ms and nothing else, so the only way to ask
   * what a 144Hz display would see is to be the display.
   */
  const roomAfter = (hz: number, ms: number): { breathe: number; brite: number; vig: number } => {
    const queue = display();
    const { atmosphere, mount } = build();
    atmosphere.start(() => ({ master: 0, low: 1 }));
    const count = Math.round((ms * hz) / 1000);
    for (let i = 0; i < count; i += 1) queue.shift()?.(5000 + (i * 1000) / hz);
    return {
      breathe: Number(read(mount, '--breathe')),
      brite: Number(read(mount, '--brite')),
      vig: Number(read(mount, '--vig')),
    };
  };

  /** How long the shake takes to come back to rest after the hammer, at `hz`. */
  const settleAfterSmash = (hz: number): number => {
    const queue = display();
    const { atmosphere, mount } = build();
    atmosphere.start(() => ({ master: 0, low: quiet }));
    let now = 5000;
    const frame = (): void => {
      queue.shift()?.(now);
      now += 1000 / hz;
    };
    for (let i = 0; i < hz; i += 1) frame();
    expect(shake(mount)).toBe(SHAKE_STILL);

    atmosphere.smash();
    let frames = 0;
    do {
      frame();
      frames += 1;
    } while (shake(mount) !== SHAKE_STILL && frames < 5000);
    // From the frame that drew the blow to the frame that drew it gone.
    return ((frames - 1) * 1000) / hz;
  };

  it('has opened the room out by the same amount after a third of a second, at any rate', () => {
    // A third of a second in, the room is still on its way — which is where a
    // room running at the wrong speed shows. Counted per frame, a 144Hz display
    // was already at 1.0346 here and a 30Hz one only at 1.0214, against 1.0297.
    const usual = roomAfter(60, 300);
    expect(usual.breathe).toBe(Number(washAt(1 - (1 - ATMOSPHERE.lerp) ** 18).breathe));

    for (const hz of [30, 75, 120, 144, 240]) {
      const room = roomAfter(hz, 300);
      expect(Math.abs(room.breathe - usual.breathe), `--breathe at ${hz}Hz`).toBeLessThan(0.001);
      expect(Math.abs(room.brite - usual.brite), `--brite at ${hz}Hz`).toBeLessThan(0.008);
      expect(Math.abs(room.vig - usual.vig), `--vig at ${hz}Hz`).toBeLessThan(0.012);
    }
  });

  it('lets the jolt of the hammer die away in the same time, at any rate', () => {
    const usual = settleAfterSmash(60);
    expect(usual).toBeGreaterThan(100);
    for (const hz of [30, 120, 144, 240]) {
      // To within a frame of the slower display, either way.
      expect(Math.abs(settleAfterSmash(hz) - usual), `${hz}Hz`).toBeLessThanOrEqual(1000 / Math.min(hz, 60) + 1);
    }
  });

  it('holds each jitter offset for a sixtieth of a second, not for a frame', () => {
    // A loud room rattles through a fixed table of offsets. At 240Hz each one
    // is held for four frames rather than the table running four times as fast.
    const queue = display();
    const { atmosphere, mount } = build();
    atmosphere.start(() => ({ master: 0, low: 1 }));
    const seen: string[] = [];
    for (let i = 0; i < 480; i += 1) {
      queue.shift()?.(5000 + (i * 1000) / 240);
      seen.push(shake(mount));
    }
    // The second second, once the room is as loud as it gets: 240 frames, so
    // sixty steps through the table, less wherever it repeats an offset.
    const settled = seen.slice(240);
    const changes = settled.filter((value, index) => index > 0 && value !== settled[index - 1]).length;
    expect(changes).toBeLessThanOrEqual(62);
    expect(changes).toBeGreaterThanOrEqual(40);
  });
});
