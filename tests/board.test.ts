// @vitest-environment happy-dom
//
// The single screen. What is decidable about a layout is *where things are* and
// *that nothing was left out*, so that is what this asserts: every zone in its
// cell, every module in its zone in build order, every well scored to its own
// depth, and the whole thing scaled by one number.
//
// The geometry is pinned to the original design's board the way the module's
// is pinned to its plate — a slipped digit fails here rather than surviving
// until someone notices THE JUNK DRAWER has drifted a column.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { figureRadius } from '../src/ui/atmosphere';
import { ATMOSPHERE, BOARD, BOX, CHAIN, SMASH, SMASH_VAR, TRAVEL_VAR } from '../src/ui/constants';
import {
  createBoard,
  fitFor,
  fitText,
  GLOBAL_SCOPE,
  MODIFIER_DEFS,
  OPENING_STATE,
  GUARD,
  megadriftShift,
  RIG,
  RIG_HEIGHT,
  SOURCE_DEFS,
  CONTROLS,
  PACE_WORDS,
  TUNE_WORDS,
  zoneDefs,
} from '../src/ui';
import type { BoardHandle, BoardSpec, BoardState } from '../src/ui';
import {
  DEFAULT_BPM,
  MODIFIER_DEFAULTS,
  MODIFIER_IDS,
  POST_HANDOFF_BOXES,
  POST_HANDOFF_SOURCES,
  SOURCE_IDS,
  TEMPOS,
} from '../src/engine/constants';
import {
  glare,
  glyphOf,
  ink,
  PIGMENTS,
  plate,
  sealSeats,
  SPARKS,
  sparkSpray,
  SIGIL_INK,
  signals,
  sourceKey,
  sourcePlates,
  surfaces,
  textureLayers,
  wells,
} from '../src/tokens';

const live: BoardHandle[] = [];

/** A mounted board with every callback recorded. */
function build(spec: Partial<BoardSpec> = {}): {
  handle: BoardHandle;
  smashes: number;
  scrubs: number;
  stills: number;
  aparts: number;
  globals: Array<[string, number]>;
  jabs: string[];
} {
  const globals: Array<[string, number]> = [];
  const jabs: string[] = [];
  const counts = { smashes: 0, scrubs: 0, stills: 0, aparts: 0 };
  const handle = createBoard({
    state: OPENING_STATE,
    ...spec,
    onGlobalInput: (param, value) => globals.push([param, value]),
    onJackDown: (id) => jabs.push(id),
    onSmash: () => (counts.smashes += 1),
    onScrub: () => (counts.scrubs += 1),
    onStill: () => (counts.stills += 1),
    onApart: () => (counts.aparts += 1),
  });
  live.push(handle);
  document.body.appendChild(handle.element);
  return {
    handle,
    get smashes() {
      return counts.smashes;
    },
    get scrubs() {
      return counts.scrubs;
    },
    get stills() {
      return counts.stills;
    },
    get aparts() {
      return counts.aparts;
    },
    globals,
    jabs,
  };
}

/** The board's own etch layer: the first thing on the plate, and where its seal and stations are. */
const plateEtch = (handle: BoardHandle): HTMLElement => handle.element.firstElementChild as HTMLElement;

const part = (root: HTMLElement, name: string): HTMLElement | null =>
  root.querySelector<HTMLElement>(`[data-part="${name}"]`);

const parts = (root: HTMLElement, name: string): HTMLElement[] => [
  ...root.querySelectorAll<HTMLElement>(`[data-part="${name}"]`),
];

const css = (element: HTMLElement | null, property: string): string =>
  element?.style.getPropertyValue(property) ?? '';

/** The DOM re-serializes a gradient with spaces after its commas; tokens do not. */
const tight = (value: string): string => value.replace(/,\s+/g, ',');

/** What sits in one well, by the data attribute that names it. */
const held = (well: HTMLElement, attribute: 'module' | 'mod'): string[] =>
  [...well.querySelectorAll<HTMLElement>(`[data-${attribute}]`)].map(
    (node) => node.dataset[attribute] ?? '',
  );

const zone = (handle: BoardHandle, id: string): HTMLElement => {
  const element = handle.zones.get(id as never);
  if (!element) throw new Error(`No ${id} well on this board.`);
  return element;
};

const resizeTo = (width: number): void => {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  window.dispatchEvent(new Event('resize'));
};

const fitVar = (): string => document.body.style.getPropertyValue('--fit');

afterEach(() => {
  while (live.length) live.pop()?.destroy();
  document.body.innerHTML = '';
  document.body.style.removeProperty('--fit');
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
});

describe('the plate', () => {
  it('is one fixed-width grid, not a stack of cards', () => {
    const { handle } = build();
    const style = handle.element.style;
    expect(style.getPropertyValue('grid-template-areas')).toBe(BOARD.areas.replace(/'/g, "'"));
    expect(style.getPropertyValue('grid-template-columns')).toBe(BOARD.columns);
    expect(style.getPropertyValue('grid-template-rows')).toBe(BOARD.rows);
    expect(style.getPropertyValue('width')).toBe(`${BOARD.width}px`);
    expect(style.getPropertyValue('padding')).toBe(BOARD.padding);
    expect(tight(style.getPropertyValue('background'))).toBe(tight(surfaces.boardPlate));
    expect(tight(style.getPropertyValue('box-shadow'))).toBe(tight(surfaces.boardShadow));
  });

  it('cannot be selected as text, so a drag that misses its control highlights nothing (gt#73)', () => {
    // Every gesture here is a drag, and the plate is what a near miss lands on.
    // A control already refuses selection for itself; this is the same refusal
    // for the space between them — and it is inherited, so no name, caption or
    // tape under the plate has to say it again.
    const { handle } = build();

    expect(handle.element.style.userSelect).toBe('none');
    // WebKit still wants the prefix, and without it this fails on one engine
    // with nothing to show for it.
    expect(handle.element.style.cssText).toContain('-webkit-user-select');
  });

  it('scales itself rather than rearranging, and never past its own resolution', () => {
    expect(fitFor(BOARD.width / 2)).toBe(0.5);
    expect(fitFor(BOARD.width)).toBe(1);
    expect(fitFor(BOARD.width * 3)).toBe(1);

    const { handle } = build();
    expect(handle.element.style.getPropertyValue('zoom')).toBe('var(--fit, 1)');
    expect(handle.element.style.getPropertyValue('min-height')).toBe('calc(100vh / var(--fit, 1))');
  });

  it('fits the window both ways, so nothing is ever below the fold (gt#71)', () => {
    // The width alone used to decide, and a board that fitted one way fell off
    // the bottom of a short window — taking THE CHAIN, where every cable goes,
    // with it. The factor is the smaller of the two, and still never above 1.
    const natural = 925;

    // Wide and short: the height is what binds.
    expect(fitFor(1666, 866, natural)).toBeCloseTo(866 / natural, 10);
    expect(fitFor(1282, 616, natural)).toBeCloseTo(616 / natural, 10);
    // Narrow and tall: the width is.
    expect(fitFor(900, 900, natural)).toBe(900 / BOARD.width);
    // Room to spare both ways: cut to its own resolution and no larger.
    expect(fitFor(2560, 1300, natural)).toBe(1);
  });

  it('falls back to the width alone while the plate has not said how tall it is', () => {
    // Before it is mounted, and anywhere that lays nothing out, there is no
    // height to fit to. The board then fits the way it always did rather than
    // guessing at one.
    expect(fitFor(720, 400, 0)).toBe(0.5);
    expect(fitFor(720, 0, 925)).toBe(0.5);
    expect(fitFor(720)).toBe(0.5);
  });

  it('writes the factor rounded down, so a fitted plate is never a hair taller than the window', () => {
    expect(fitText(0.5)).toBe('0.5000');
    expect(fitText(1)).toBe('1.0000');
    // A 600px window over a 900px plate is two thirds. To nearest that is
    // 0.6667, and a plate drawn at it is 600.03px tall in a 600px window.
    expect(fitText(600 / 900)).toBe('0.6666');
    expect(Number(fitText(600 / 900)) * 900).toBeLessThanOrEqual(600);
  });

  it('measures its own height off its own rect, with nothing holding it open', () => {
    Object.defineProperty(window, 'innerHeight', { value: 616, configurable: true });
    resizeTo(1282);
    const { handle } = build();
    // Built off the page it has measured nothing, and the width decides.
    expect(fitVar()).toBe(fitText(1282 / BOARD.width));

    // Mounted: 1282 wide on screen and 823.5 tall is a plate 925 board pixels
    // high. The reading must be taken with `min-height` lifted — it exists to
    // hold the plate open to the window, and would otherwise report the window.
    const held: string[] = [];
    handle.element.getBoundingClientRect = () => {
      held.push(handle.element.style.minHeight);
      return new DOMRect(0, 0, 1282, (925 * 1282) / BOARD.width);
    };
    handle.refit();

    // Read twice — once to measure, once to check the factor that measurement
    // produced — and lifted both times.
    expect(held).toEqual(['0', '0']);
    expect(handle.element.style.getPropertyValue('min-height')).toBe('calc(100vh / var(--fit, 1))');
    expect(fitVar()).toBe(fitText(616 / 925));
  });

  it('reads that height as an aspect, so it does not matter what the plate is zoomed to', () => {
    // The same plate, measured once at full size and once already scaled down:
    // the factor it settles on is the same, because the reading never has to
    // agree with the number it is about to help decide (gt#22's rule, one axis over).
    Object.defineProperty(window, 'innerHeight', { value: 616, configurable: true });
    resizeTo(1282);
    const { handle } = build();

    handle.element.getBoundingClientRect = () => new DOMRect(0, 0, BOARD.width, 925);
    handle.refit();
    const full = fitVar();

    handle.element.getBoundingClientRect = () => new DOMRect(0, 0, BOARD.width / 2, 925 / 2);
    handle.refit();

    expect(fitVar()).toBe(full);
  });

  it('fits again on a resize, and reports every re-fit once', () => {
    const seen: number[] = [];
    Object.defineProperty(window, 'innerHeight', { value: 925, configurable: true });
    resizeTo(BOARD.width);
    const { handle } = build({ onResize: (fit) => seen.push(fit) });
    handle.element.getBoundingClientRect = () => new DOMRect(0, 0, BOARD.width, 925);
    handle.refit();
    expect(fitVar()).toBe('1.0000');

    // The window gets shorter. The seals are not seated again — where a plate
    // sits from the board's centre is the same at every window size — but the
    // factor is still checked against the plate, below.
    Object.defineProperty(window, 'innerHeight', { value: 462.5, configurable: true });
    resizeTo(BOARD.width);

    expect(fitVar()).toBe('0.5000');
    // One report per fit, carrying the factor it settled on.
    expect(seen).toEqual([1, 1, 0.5]);
  });

  // A plate is not quite the same shape at every zoom: its rows are cut to
  // their lettering, and a line of text lands on whole device pixels. Measured
  // in Chrome and in Firefox, the same board came out up to two and a half
  // pixels taller at one zoom than the height read at another said it would —
  // on about one height-limited window size in four — and one pixel of overflow
  // is a scrollbar. So the factor is checked against the plate it produces.
  describe('a plate that measures differently at different zooms', () => {
    /** A board whose height in board pixels depends on the factor it is drawn at. */
    function plateThat(handle: { element: HTMLElement }, heightAt: (fit: number) => number): void {
      handle.element.getBoundingClientRect = () => {
        const fit = Number(fitVar());
        return new DOMRect(0, 0, BOARD.width * fit, heightAt(fit) * fit);
      };
    }

    it('gives way when the plate comes out taller than the reading said', () => {
      Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
      resizeTo(BOARD.width);
      const { handle } = build();
      // 925 at full size, five pixels more once it is scaled down.
      plateThat(handle, (fit) => (fit < 1 ? 930 : 925));

      handle.refit();

      // Not 800/925, which is what the first reading asks for and which would
      // draw the plate 804px tall in an 800px window.
      expect(fitVar()).toBe(fitText(800 / 930));
      expect(Number(fitVar()) * 930).toBeLessThanOrEqual(800);
    });

    it('does the same on a resize, where the reading is the oldest', () => {
      Object.defineProperty(window, 'innerHeight', { value: 925, configurable: true });
      resizeTo(BOARD.width);
      const { handle } = build();
      plateThat(handle, (fit) => (fit < 0.75 ? 928 : 925));
      handle.refit();
      expect(fitVar()).toBe('1.0000');

      Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });
      resizeTo(BOARD.width);

      expect(fitVar()).toBe(fitText(600 / 928));
      expect(Number(fitVar()) * 928).toBeLessThanOrEqual(600);
    });

    it('settles on the smaller of two zooms that disagree about each other', () => {
      // The window is exactly as tall as the plate measures when scaled down,
      // and a pixel shorter than it measures at full size. Following the
      // reading up and down would trade places forever; the board stops at the
      // factor whose plate fits.
      Object.defineProperty(window, 'innerHeight', { value: 815, configurable: true });
      resizeTo(BOARD.width);
      const { handle } = build();
      plateThat(handle, (fit) => (fit < 1 ? 815 : 816));

      handle.refit();
      const settled = fitVar();
      expect(settled).toBe(fitText(815 / 816));

      // And asked again, with nothing changed, it stays there.
      handle.refit();
      handle.refit();
      expect(fitVar()).toBe(settled);
    });

    it('never gives a plate more room than the reading it started from', () => {
      // A plate that measures shorter once scaled is left with the hair to
      // spare: only ever moved down.
      Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
      resizeTo(BOARD.width);
      const { handle } = build();
      plateThat(handle, (fit) => (fit < 1 ? 920 : 925));

      handle.refit();

      expect(fitVar()).toBe(fitText(800 / 925));
    });
  });

  it('puts spare height into bare plate, and never into stretching the hardware', () => {
    // The middle row was `1fr`, so a window taller than the board handed its
    // slack to THE FOUNDATION and GUITAR WALL grew to fill it. Every row is cut
    // to its contents now, and what is left over is plate above and below.
    const { handle } = build();
    const style = handle.element.style;

    expect(BOARD.rows.split(' ')).toEqual(['auto', 'auto', 'auto']);
    expect(style.getPropertyValue('align-content')).toBe(BOARD.slack);
    expect(BOARD.slack).toBe('center');
    // …and the plate itself still fills the window, which is what the slack is.
    expect(style.getPropertyValue('min-height')).toBe('calc(100vh / var(--fit, 1))');
  });

  it('publishes --fit on mount, on every resize, and never again once destroyed', () => {
    resizeTo(720);
    const { handle } = build();
    expect(fitVar()).toBe('0.5000');

    resizeTo(BOARD.width * 2);
    expect(fitVar()).toBe('1.0000');

    handle.destroy();
    resizeTo(360);
    expect(fitVar()).toBe('1.0000');
  });

  it('tells the wire layer the factor it must divide its endpoints by', () => {
    const seen: number[] = [];
    resizeTo(1440);
    build({ onResize: (fit) => seen.push(fit) });
    resizeTo(1080);
    expect(seen).toEqual([1, 0.75]);
  });

  it('lays four textures over the plate, and each corrosion is its own', () => {
    const { handle } = build();
    const skirt = textureLayers.board;
    expect(css(part(handle.element, 'grain'), 'opacity')).toBe(String(skirt.grain));
    expect(css(part(handle.element, 'grain'), 'mix-blend-mode')).toBe('overlay');

    expect(css(part(handle.element, 'rust'), 'background-size')).toBe(skirt.rustSize);
    expect(css(part(handle.element, 'rust'), 'opacity')).toBe(
      `calc(${skirt.rustBase} + var(--weather, 0) * ${skirt.rustWeather})`,
    );

    const verdigris = part(handle.element, 'verdigris');
    expect(css(verdigris, 'background-size')).toBe(skirt.verdigrisSize);
    expect(css(verdigris, 'background-position')).toBe(skirt.verdigrisPosition);
    expect(css(verdigris, 'opacity')).toBe(String(skirt.verdigris));
    // Verdigris used to be the rust tile again, at another size and hue-rotated
    // 95°. It has its own tile now, so it has no filter and no business having
    // one — that hue rotation is the thing gt#35 was filed about.
    expect(css(verdigris, 'filter')).toBe('');
    expect(css(verdigris, 'background-image')).not.toBe(
      css(part(handle.element, 'rust'), 'background-image'),
    );

    expect(css(part(handle.element, 'scratches'), 'background-size')).toBe(skirt.scratchSize);
    expect(css(part(handle.element, 'scratches'), 'mix-blend-mode')).toBe('screen');
  });

  it('scratches the bare plate from both directions, and no harder than it was (gt#89)', () => {
    // Every mark on the tile leans one way. Across the plate round the wells —
    // most of a tall window — one pass of it read as rain.
    const { handle } = build();
    const skirt = textureLayers.board;
    const back = part(handle.element, 'scratchesBack');

    expect(css(back, 'background-image')).toBe(css(part(handle.element, 'scratches'), 'background-image'));
    expect(css(back, 'transform')).toBe('scaleX(-1)');
    expect(css(back, 'background-size')).toBe(skirt.scratchBackSize);
    expect(css(back, 'background-position')).toBe(skirt.scratchBackPosition);
    expect(css(back, 'mix-blend-mode')).toBe('screen');
    expect(back?.style.pointerEvents).toBe('none');
    // The first pass gave up strength to the second: the reference's .3 is
    // still the most either gets, and the pair is not twice the scratching.
    expect(skirt.scratches).toBeLessThan(0.3);
    expect(skirt.scratchesBack).toBeLessThan(skirt.scratches);
    expect(skirt.scratches + skirt.scratchesBack).toBeLessThan(0.3 * 1.4);
    // The layer is turned over. The plate is not.
    expect(handle.element.style.transform).toBe('');
    const laid = [...handle.element.children].map((node) => (node as HTMLElement).dataset.part);
    expect(laid.indexOf('scratchesBack')).toBe(laid.indexOf('scratches') + 1);
  });

  it('lays one plain layer over everything bolted to the plate, for what is cast on it', () => {
    // gt#102, gt#108. The emblem: where the room's turning figure is seated. Plain
    // because the figure is a shadow, and black at part strength laid on
    // plainly *is* a shadow — it was screened on while the figure was light.
    const { handle } = build();
    const emblem = handle.emblem;

    expect(emblem.dataset.part).toBe('emblem');
    expect(emblem.parentNode).toBe(handle.element);
    expect(handle.element.lastElementChild).toBe(emblem);
    expect(css(emblem, 'position')).toBe('absolute');
    expect(css(emblem, 'mix-blend-mode')).toBe('');
    // The figure swells, and a shadow does not fall off the edge of the thing
    // it is cast on.
    expect(css(emblem, 'overflow')).toBe('hidden');
    // Light never takes a pointer: every control under it is still reached.
    expect(css(emblem, 'pointer-events')).toBe('none');
    // Over the modules. The three buttons that used to sit over it from the
    // bottom corner are in the top row (gt#112), and hardware like the rest of
    // it: a shadow falls on them too, so none of them is lifted out of it.
    expect(Number(css(emblem, 'z-index'))).toBe(BOARD.emblem.zIndex);
    expect(BOARD.emblem.zIndex).toBeGreaterThan(1);
    for (const part of ['scrub', 'still', 'apart']) {
      const button = handle.element.querySelector<HTMLElement>(`[data-part="${part}"]`);
      expect(button, part).not.toBeNull();
      expect(button?.style.zIndex, part).toBe('');
    }
  });

  it('lays each source’s mark again in its own cut, in its module’s colour, and nowhere else', () => {
    // gt#106. A lit mark is not light over the hardware: it is the groove that
    // is already in the metal, glowing. So it lives inside the etch layer, in
    // the seal's own box, at the place its cut is.
    const { handle } = build();
    const seal = plateEtch(handle).firstElementChild as HTMLElement;
    const stations = parts(plateEtch(handle), 'station');
    const seats = sealSeats(BOARD.seal.size, SOURCE_IDS.length);

    expect(stations.map((station) => station.dataset.source)).toEqual([...SOURCE_IDS]);
    stations.forEach((station, i) => {
      const id = SOURCE_IDS[i] ?? 'guitar';
      const seat = seats[i];
      expect(station.parentNode, id).toBe(seal);
      // A box on whole pixels, centred on the seat, big enough for the mark.
      const size = parseFloat(css(station, 'width'));
      expect(css(station, 'left'), id).toMatch(/^-?\d+px$/);
      expect(css(station, 'top'), id).toMatch(/^-?\d+px$/);
      expect(parseFloat(css(station, 'left')) + size / 2, id).toBeCloseTo(seat?.x ?? NaN, 0);
      expect(parseFloat(css(station, 'top')) + size / 2, id).toBeCloseTo(seat?.y ?? NaN, 0);
      expect(size, id).toBeGreaterThan(seat?.size ?? Infinity);
      // No turn of its own: it is drawn in the seal's coordinates already.
      expect(css(station, 'rotate'), id).toBe('');

      const tile = decodeURIComponent(css(station, 'background-image'));
      // That source's figure, at the depth the cable and the cut draw it…
      expect(tile, id).toContain(glyphOf(sourceKey(id), BOARD.seal.depth).levels[0]?.d ?? 'missing');
      // …in the colour its plate glows in, as a lamp.
      expect(tile, id).toContain(`stroke='${glare(sourcePlates[id].tint)}'`);
    });
    // No two modules that glow differently share a colour.
    expect(glare(sourcePlates.laser.tint)).not.toBe(glare(sourcePlates.guitar.tint));

    // And the layer of light over the hardware has none of them in it.
    expect(parts(handle.emblem, 'station')).toHaveLength(0);
    expect(part(handle.emblem, 'stations')).toBeNull();
  });

  it('glows less than light did, and only as much as the seal shows', () => {
    // Every number here is a share of the etch layer's own strength, which is
    // the board's age: a board nobody has run has no groove to glow.
    const { handle } = build();
    const etch = plateEtch(handle);
    expect(css(etch, 'opacity')).toBe(`calc(var(--weather, 0) * ${BOARD.seal.weather})`);
    for (const station of parts(etch, 'station')) expect(etch.contains(station)).toBe(true);

    expect(BOARD.stations.on).toBeLessThan(BOARD.stations.flash);
    expect(BOARD.stations.flash).toBeLessThanOrEqual(1);
    // Wide enough to fill the groove wall to wall, and spilling only a little.
    expect(BOARD.stations.weight).toBeGreaterThan(1);
    expect(BOARD.stations.weight).toBeLessThan(3);
    expect(BOARD.stations.halo.width).toBeLessThan(4);
    expect(BOARD.stations.halo.alpha).toBeLessThan(0.5);
  });

  it('carries a station onto every plate and box it crosses, and onto no other', () => {
    for (const fit of [1, 0.5]) {
      const { handle } = build();
      handle.element.getBoundingClientRect = () => new DOMRect(0, 0, BOARD.width * fit, 900 * fit);
      const seats = sealSeats(BOARD.seal.size, SOURCE_IDS.length);
      const first = seats[0];
      if (!first) throw new Error('No seats.');
      // In board pixels: where the top station is, measured from the board's corner.
      const at = { x: BOARD.width / 2 - BOARD.seal.size / 2 + first.x, y: 450 - BOARD.seal.size / 2 + first.y };

      // One plate put squarely under that station, and one a long way from any.
      const under = handle.modules.get('cow')?.element.querySelector<HTMLElement>('[data-part="etch"]');
      const away = handle.modifiers.get('offset')?.element.querySelector<HTMLElement>('[data-part="etch"]');
      if (!under || !away) throw new Error('No etch layer.');
      under.getBoundingClientRect = () => new DOMRect((at.x - 60) * fit, (at.y - 20) * fit, 120 * fit, 40 * fit);
      away.getBoundingClientRect = () => new DOMRect(0, 0, 30 * fit, 30 * fit);

      handle.refit();

      const onUnder = parts(under, 'station');
      expect(onUnder.map((station) => station.dataset.source), `fit ${fit}`).toEqual([SOURCE_IDS[0]]);
      expect(parts(away, 'station'), `fit ${fit}`).toHaveLength(0);

      // It is the same mark at the same place on the seal, so it lands on the
      // board's own: same box in the seal's coordinates, same picture.
      const own = parts(plateEtch(handle), 'station')[0];
      expect(css(onUnder[0] ?? null, 'left')).toBe(css(own ?? null, 'left'));
      expect(css(onUnder[0] ?? null, 'top')).toBe(css(own ?? null, 'top'));
      expect(css(onUnder[0] ?? null, 'background-image')).toBe(css(own ?? null, 'background-image'));
      expect(onUnder[0]?.parentNode).toBe(under.firstElementChild);
      // And it is lit or dark as its module is, from the moment it is made.
      expect(onUnder[0]?.style.opacity).toBe(own?.style.opacity);

      // Seated again, there is still exactly one: they are remade, not added to.
      handle.refit();
      expect(parts(under, 'station')).toHaveLength(1);
      handle.destroy();
      live.pop();
    }
  });

  it('lights a station while its module is in the sound, on the lamp’s own terms', () => {
    const { handle } = build();
    const station = (id: string): HTMLElement | undefined =>
      parts(plateEtch(handle), 'station').find((element) => element.dataset.source === id);

    // As the board opens: lit for what is on, nothing for what is not.
    for (const id of SOURCE_IDS) {
      expect(station(id)?.style.opacity, id).toBe(OPENING_STATE.m[id].on ? String(BOARD.stations.on) : '0');
    }
    expect(SOURCE_IDS.some((id) => OPENING_STATE.m[id].on)).toBe(true);
    expect(SOURCE_IDS.some((id) => !OPENING_STATE.m[id].on)).toBe(true);
    expect(BOARD.stations.on).toBeGreaterThan(0);
    expect(BOARD.stations.on).toBeLessThan(BOARD.stations.flash);

    // Switched on, it lights; switched off, it goes dark. It eases either way.
    const flipped = {
      ...OPENING_STATE,
      m: { ...OPENING_STATE.m, cow: { ...OPENING_STATE.m.cow, on: true }, guitar: { ...OPENING_STATE.m.guitar, on: false } },
    };
    handle.setState(flipped);
    expect(station('cow')?.style.opacity).toBe(String(BOARD.stations.on));
    expect(station('guitar')?.style.opacity).toBe('0');
    expect(station('cow')?.style.transition).toContain('opacity');
  });

  it('lights nothing on a cold board, and each station as the power reaches its module', () => {
    // gt#88's rule, kept: a module is lit when the power has reached it, and the
    // mark on the ring is the same statement its lamp makes.
    const { handle } = build({ cold: true });
    const lit = (): string[] =>
      parts(plateEtch(handle), 'station')
        .filter((element) => element.style.opacity !== '0')
        .map((element) => element.dataset.source ?? '');
    expect(lit()).toEqual([]);

    handle.setBooted(new Set(['guitar']));
    expect(lit()).toEqual(OPENING_STATE.m.guitar.on ? ['guitar'] : []);

    handle.setBooted(null);
    expect(lit()).toEqual(SOURCE_IDS.filter((id) => OPENING_STATE.m[id].on));
  });

  it('cuts a seal into the plate that only a used board ever shows', () => {
    // gt#36's third landing, and the one that costs nothing to run: the weathering
    // clock was already counting, so putting the seal on `--weather` alone gives
    // it a second job for free. A board nobody has run carries no seal at all —
    // there is no base term — and SCRUB THE ALTAR takes it back with the rust,
    // which is what that button means.
    const { handle } = build();
    const etch = handle.element.firstElementChild as HTMLElement;
    const seal = etch.firstElementChild as HTMLElement;
    expect(etch.dataset.part).toBe('etch');
    expect(css(etch, 'opacity')).toBe(`calc(var(--weather, 0) * ${BOARD.seal.weather})`);
    expect(seal.dataset.part).toBe('seal');
    // The tile is published once on the plate and read from there (gt#105).
    expect(handle.element.style.getPropertyValue(BOARD.sealVar)).toContain('data:image/svg+xml');
    expect(css(seal, 'background-image')).toBe(`var(${BOARD.sealVar})`);
    expect(css(seal, 'background-repeat')).toBe('no-repeat');
    // A box of its own size, dead centre — it is a circle, and a circle
    // stretched to a 1440-wide board is an ellipse.
    expect(css(seal, 'width')).toBe(`${BOARD.seal.size}px`);
    expect(css(seal, 'height')).toBe(`${BOARD.seal.size}px`);
    expect(css(seal, 'left')).toBe('50%');
    expect(css(seal, 'top')).toBe('50%');
    expect(css(seal, 'margin-left')).toBe(`${-BOARD.seal.size / 2}px`);
    expect(css(seal, 'margin-top')).toBe(`${-BOARD.seal.size / 2}px`);

    // Under the dirt. A mark cut into a board is beneath whatever settled on it
    // afterwards, so the seal is the first layer on the plate and the four
    // textures paint over it.
    const laid = [...handle.element.children].map((node) => (node as HTMLElement).dataset.part);
    expect(laid.slice(0, 5)).toEqual(['etch', 'grain', 'rust', 'verdigris', 'scratches']);
  });

  it('cuts the same seal into every plate and box bolted to the board', () => {
    // gt#105. An etching is in any metal that can be seen. A module's plate and a
    // chain box are metal, and they sit on top of the board's own.
    const { handle } = build();
    const hosts = [...handle.modules.values(), ...handle.modifiers.values()].map((plate) => plate.element);
    expect(hosts).toHaveLength(SOURCE_IDS.length + MODIFIER_IDS.length);

    for (const host of hosts) {
      const name = host.dataset.module ?? host.dataset.mod;
      const etch = [...host.children].find((node) => (node as HTMLElement).dataset.part === 'etch') as HTMLElement;
      expect(etch, name).toBeDefined();
      const seal = etch.firstElementChild as HTMLElement;
      expect(seal?.dataset.part, name).toBe('seal');
      // The one tile, by reference: not eighteen more copies of it.
      expect(css(seal, 'background-image'), name).toBe(`var(${BOARD.sealVar})`);
      expect(seal.style.cssText, name).not.toContain('data:image');
      expect(css(seal, 'width'), name).toBe(`${BOARD.seal.size}px`);
      // Fading in with the board's age on the plate's own terms…
      expect(css(etch, 'opacity'), name).toBe(`calc(var(--weather, 0) * ${BOARD.seal.weather})`);
      // …clipped to the piece of metal it is on…
      expect(css(etch, 'overflow'), name).toBe('hidden');
      expect(css(etch, 'pointer-events'), name).toBe('none');
      // …and under that metal's own dirt: before its grain.
      const laid = [...host.children].map((node) => (node as HTMLElement).dataset.part);
      expect(laid.indexOf('etch'), name).toBeLessThan(laid.indexOf('grain'));
      expect(laid.indexOf('etch'), name).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps a plate’s seal out of sight until it has been lined up', () => {
    // Unseated, it would show the seal's top left corner in the top left corner
    // of every plate. A board that is not laid out has nothing to line up with.
    const { handle } = build();
    const seals = [...handle.element.querySelectorAll<HTMLElement>('[data-module] [data-part="seal"], [data-mod] [data-part="seal"]')];
    expect(seals).toHaveLength(SOURCE_IDS.length + MODIFIER_IDS.length);
    for (const seal of seals) expect(seal.style.display).toBe('none');

    handle.refit();
    for (const seal of seals) expect(seal.style.display).toBe('none');
  });

  it('lines every plate’s seal up with the board’s, off the rects, at whatever the board is zoomed to', () => {
    for (const fit of [1, 0.5]) {
      const { handle } = build();
      const plateRect = new DOMRect(0, 0, BOARD.width * fit, 900 * fit);
      handle.element.getBoundingClientRect = () => plateRect;

      // Two plates, somewhere on it. Where is not the point; that the seal on
      // each ends up centred on the board's centre is.
      const placed: Array<[HTMLElement, number, number]> = [];
      const hosts = [handle.modules.get('guitar')?.element, handle.modifiers.get('cavern')?.element];
      hosts.forEach((host, i) => {
        const etch = host?.querySelector<HTMLElement>('[data-part="etch"]');
        if (!etch) throw new Error('No etch layer.');
        const left = 40 + i * 600;
        const top = 300 + i * 420;
        etch.getBoundingClientRect = () => new DOMRect(left * fit, top * fit, 300 * fit, 120 * fit);
        placed.push([etch, left, top]);
      });

      handle.refit();

      for (const [etch, left, top] of placed) {
        const seal = etch.firstElementChild as HTMLElement;
        expect(seal.style.display).toBe('');
        // In the plate's own pixels: the seal's centre, measured from the
        // board's corner, is the board's centre.
        expect(left + parseFloat(seal.style.left) + BOARD.seal.size / 2).toBeCloseTo(BOARD.width / 2, 1);
        expect(top + parseFloat(seal.style.top) + BOARD.seal.size / 2).toBeCloseTo(450, 1);
      }
      handle.destroy();
      live.pop();
    }
  });

  it('does not line them up again on a resize, which moves the window and not the plates', () => {
    // The spare height is bare plate above and below in equal parts, so the
    // board's centre stays where it is among the plates at every window size.
    expect(BOARD.slack).toBe('center');
    const { handle } = build();
    handle.element.getBoundingClientRect = () => new DOMRect(0, 0, BOARD.width, 900);
    const etch = handle.modules.get('guitar')?.element.querySelector<HTMLElement>('[data-part="etch"]');
    let asked = 0;
    if (etch) {
      etch.getBoundingClientRect = () => {
        asked += 1;
        return new DOMRect(40, 300, 300, 120);
      };
    }
    handle.refit();
    expect(asked).toBe(1);

    Object.defineProperty(window, 'innerHeight', { value: 500, configurable: true });
    resizeTo(1100);
    expect(asked).toBe(1);
  });

  it('cuts the seal with a station for every source, in that source’s own figure', () => {
    // gt#103. One station per source, cut with the figure that is that source's
    // own — the one that glows there while it sounds (gt#106).
    const { handle } = build();
    const seal = decodeURIComponent(handle.element.style.getPropertyValue(BOARD.sealVar));

    for (const id of SOURCE_IDS) {
      const figure = glyphOf(sourceKey(id), BOARD.seal.depth).levels[0]?.d ?? 'missing';
      expect(seal.split(figure), id).toHaveLength(2);
    }
    const stations = [...seal.matchAll(/translate\([\d.]+ [\d.]+\) rotate\(/g)];
    expect(stations).toHaveLength(SOURCE_IDS.length);

    // Cut in the scratch layer's shadow and the seal's own brass.
    expect(seal).toContain(`stroke='${PIGMENTS.scratchDark}'`);
    expect(seal).toContain(`stroke='${SIGIL_INK.ghost}'`);
  });

  it('cuts the room’s figure at the seal’s centre, at the size the light over it is drawn', () => {
    const { handle } = build();
    const seal = decodeURIComponent(handle.element.style.getPropertyValue(BOARD.sealVar));
    const half = BOARD.seal.size / 2;
    const centre = new RegExp(`translate\\(${half} ${half}\\) scale\\(([\\d.]+)\\)`).exec(seal);

    expect(centre).not.toBeNull();
    const deepest = glyphOf(ATMOSPHERE.sigil.key, ATMOSPHERE.sigil.maxDepth);
    expect(Number(centre?.[1])).toBeCloseTo(figureRadius() / deepest.reach, 2);
    // The coarse arms only, and they are the turning figure's.
    expect(BOARD.seal.figureDepth).toBeLessThanOrEqual(ATMOSPHERE.sigil.minDepth);
    expect(seal).toContain(glyphOf(ATMOSPHERE.sigil.key, BOARD.seal.figureDepth).levels[0]?.d ?? 'missing');
  });

  it('masks the board rust to the plate edges instead of washing it over', () => {
    const { handle } = build();
    const rust = part(handle.element, 'rust');
    expect(css(rust, 'mask-image')).toBe(textureLayers.board.rustMask);
    expect(css(rust, '-webkit-mask-image')).toBe(textureLayers.board.rustMask);
    expect(css(rust, 'mask-repeat')).toBe('no-repeat');
  });

  it('hangs rust runs off the one seam on the board that is bolted', () => {
    // THE FOUNDATION's rivet strip. Rust needs somewhere it came *from*, and
    // this is the only place on the board where something was drilled (gt#35).
    const { handle } = build();
    const foundation = handle.element.querySelector<HTMLElement>('[data-zone="foundation"]');
    const runs = foundation?.querySelector<HTMLElement>(':scope > [data-part="runs"]');

    expect(runs).not.toBeNull();
    expect(runs?.style.top).toBe(`${BOARD.foundation.rivetHeight}px`);
    expect(runs?.style.backgroundRepeat).toBe('repeat-x');
    // Purely weather-driven: a new board does not weep, and SCRUB takes it back.
    expect(runs?.style.opacity).toBe(`calc(var(--weather, 0) * ${textureLayers.board.runWeather})`);
    // Over the two plates, not behind them. Behind, all but 20px of the layer
    // sat under GUITAR WALL and BASS and the fade had nowhere to land — the same
    // failure that took the runs off the module plates entirely.
    expect(runs?.style.zIndex).toBe(String(BOARD.foundation.runZIndex));
    expect(BOARD.foundation.runZIndex).toBeGreaterThan(0);
  });

  it('leaves the runs the only weeping layer on the board', () => {
    const { handle } = build();
    expect(handle.element.querySelectorAll('[data-part="runs"]')).toHaveLength(1);
  });
});

describe('the six wells', () => {
  it('scores each one into the plate at its own depth', () => {
    const { handle } = build();
    expect([...handle.zones.keys()]).toEqual([
      'fog',
      'pulse',
      'voice',
      'junk',
      'foundation',
      'chain',
    ]);
    for (const [id, well] of handle.zones) {
      expect(tight(css(well, 'background')), id).toBe(tight(wells[id].fill));
      expect(tight(css(well, 'box-shadow')), id).toBe(tight(wells[id].shadow));
      // A well is cut into the plate: no border and no corners of its own.
      expect(css(well, 'border-radius'), id).toBe('');
    }
  });

  it('names no well: the six section titles are off the plate (gt#110)', () => {
    // Thomas: "reduce words on screen… removing the section titles 'the fog',
    // 'the pulse', etc entirely." They named a part of the board to a person
    // who never had to call it anything.
    const { handle } = build();
    expect(parts(handle.element, 'zone')).toEqual([]);

    const said = handle.element.textContent ?? '';
    // THE VOICE is left out of this list and only out of this list: it was a
    // well's title and is also a module's name, which is still painted.
    for (const title of ['THE FOG', 'THE PULSE', 'THE JUNK DRAWER', 'THE FOUNDATION', 'THE CHAIN']) {
      expect(said, title).not.toContain(title);
    }
    // And the one that is both is painted once, on its plate, not twice.
    expect(said.split('THE VOICE')).toHaveLength(2);

    // A well's own children say nothing; every word in it is on something
    // bolted into it.
    for (const [id, well] of handle.zones) {
      const own = [...well.childNodes].filter((node) => node.nodeType === 3);
      expect(own, id).toEqual([]);
    }
  });

  it('stencils nothing in a well: the corner figures are gone too (gt#113)', () => {
    // gt#110 took the six names off and left each well's small figure alone in
    // its corner. Thomas: "Remove the corner stencil figures in the wells."
    const { handle } = build();
    expect(parts(handle.element, 'stamp')).toEqual([]);
    for (const [id, well] of handle.zones) {
      // Nothing a well holds directly is a drawn mark.
      const marked = ([...well.children] as HTMLElement[]).filter(
        (child) =>
          child.style.backgroundImage.includes('data:image/svg+xml') &&
          !['etch', 'seal'].includes(child.dataset.part ?? ''),
      );
      expect(marked.map((child) => child.dataset.part), id).toEqual([]);
    }
    // And the header the name and then the figure sat in is a lip: no deeper
    // than a figure would have needed, and far under the 26 a name took.
    const lip = parseFloat(BOARD.well.padding);
    expect(lip).toBeLessThan(13 + 4);
    expect(lip).toBeGreaterThanOrEqual(BOARD.well.padX);
    expect(lip).toBeGreaterThanOrEqual(BOARD.foundation.rivetHeight);
  });

  it('leaves no scrap of tape in the drawer: the corner of SAXOPHONE is clear (gt#117)', () => {
    // There was one, blank but for a mark, stuck in the corner of the junk
    // well — and across the corner of SAXOPHONE's plate once the well's
    // header went. Thomas: "remove the tape with the mark above the corner of
    // 'saxophone'."
    const { handle } = build();
    expect(part(handle.element, 'scrap')).toBeNull();
    // Nothing in the drawer but its plates.
    const junk = zone(handle, 'junk');
    expect(([...junk.children] as HTMLElement[]).every((child) => child.dataset.module)).toBe(true);
  });

  it('arranges the sources in the sub-grid the design fixes them to', () => {
    const { handle } = build();
    const src = part(handle.element, 'src');
    expect(css(src, 'grid-template-areas')).toBe(BOARD.src.areas);
    expect(css(src, 'grid-template-columns')).toBe(BOARD.src.columns);
    for (const id of ['pulse', 'voice', 'junk', 'foundation'] as const) {
      expect(css(zone(handle, id), 'grid-area'), id).toBe(BOARD.src.area[id]);
    }
    expect(css(zone(handle, 'chain'), 'grid-area')).toBe('chain');
  });
});

describe('what sits in each well', () => {
  it('puts all nine modules in their own zone, in build order, and none twice', () => {
    const { handle } = build();
    for (const id of ['pulse', 'voice', 'junk', 'foundation'] as const) {
      expect(held(zone(handle, id), 'module'), id).toEqual(zoneDefs(id).map((def) => def.id));
    }
    expect([...handle.modules.keys()].sort()).toEqual([...SOURCE_IDS].sort());
    expect(handle.element.querySelectorAll('[data-module]')).toHaveLength(SOURCE_IDS.length);
  });

  it('racks THE CHAIN in the order the signal actually takes, and nothing after it', () => {
    const { handle } = build();
    const chain = zone(handle, 'chain');
    expect(held(chain, 'mod')).toEqual([...MODIFIER_IDS]);
    // A footnote used to be the last thing in the rack (gt#110). The last thing
    // in it is the last box.
    expect((chain.lastElementChild as HTMLElement | null)?.dataset.mod).toBe(
      MODIFIER_IDS[MODIFIER_IDS.length - 1],
    );
  });

  it('bolts THE FOUNDATION down, and lays THE JUNK DRAWER two across', () => {
    const { handle } = build();
    const rivets = part(zone(handle, 'foundation'), 'rivets');
    expect(css(rivets, 'height')).toBe(`${BOARD.foundation.rivetHeight}px`);
    expect(tight(css(rivets, 'background'))).toBe(tight(plate.rivetStrip));
    expect(css(zone(handle, 'foundation'), 'grid-template-columns')).toBe(BOARD.foundation.columns);

    expect(css(zone(handle, 'junk'), 'grid-template-columns')).toBe(BOARD.junk.columns);
  });

  it('stretches the rack’s boxes to one height, so the row has one bottom edge (gt#90)', () => {
    const { handle } = build();

    expect(css(zone(handle, 'chain'), 'align-items')).toBe('stretch');
    expect(css(zone(handle, 'chain'), 'flex-direction')).toBe('row');
  });

  it('lays LASER CANNON across the whole drawer, so no cell beside it is empty (gt#75)', () => {
    const { handle } = build();
    const drawer = zone(handle, 'junk');
    const plates = [...drawer.querySelectorAll<HTMLElement>(':scope > [data-module]')];
    const across = plates.filter((plate) => plate.style.gridColumn !== '');

    expect(across.map((plate) => plate.dataset.module)).toEqual(['laser']);
    // Every column, however many there are: first line to last.
    expect(across[0]?.style.gridColumn).toBe(BOARD.junk.wide);
    expect(BOARD.junk.wide.split('/').map((line) => line.trim())).toEqual(['1', '-1']);
    // And it is the last thing in the well, so nothing is seated after a row it
    // has taken the whole of.
    expect(plates.at(-1)?.dataset.module).toBe('laser');
  });

  it('gives the drawer a row for each row of plates, and its floor to the last', () => {
    // Two columns: every pair of ordinary plates is a row, and a wide plate is
    // a row to itself. If a sixth module lands in here this fails, rather than
    // the slack silently going to whichever row happens to be third.
    const { handle } = build();
    const drawer = zone(handle, 'junk');
    const defs = zoneDefs('junk');
    const rows = Math.ceil(defs.filter((def) => !def.wide).length / 2) + defs.filter((def) => def.wide).length;
    const tracks = BOARD.junk.rows.split(' ');

    expect(css(drawer, 'grid-template-rows')).toBe(BOARD.junk.rows);
    expect(tracks).toHaveLength(rows);
    expect(tracks.at(-1)).toBe('1fr');
    expect(tracks.slice(0, -1).every((track) => track === 'auto')).toBe(true);
    // Not packed to the top any more: that is what left the floor bare.
    expect(css(drawer, 'align-content')).toBe('');
  });

  it('seats nothing else across a well', () => {
    const { handle } = build();
    for (const id of ['pulse', 'voice', 'foundation'] as const) {
      const plates = [...zone(handle, id).querySelectorAll<HTMLElement>(':scope > [data-module]')];
      expect(plates.every((plate) => plate.style.gridColumn === ''), id).toBe(true);
    }
  });
});

// The one well on this board that knows how much it can hold (gt#48). Every other
// is sized by what is in it; the chain's contents are a list that grows, and
// until this existed nothing anywhere knew the well had run out of room.
describe('THE CHAIN has a stated capacity', () => {
  it('runs left to right, so forward is one axis and OUT lands beside the next IN', () => {
    const { handle } = build();
    const chain = zone(handle, 'chain');
    expect(css(chain, 'flex-direction')).toBe('row');

    // The boxes share the rack rather than being cut to a width: four are drawn
    // wide and seven narrow, and neither number is written down anywhere. What
    // is written down is the floor they may never go under.
    for (const id of MODIFIER_IDS) {
      const modifier = chain.querySelector<HTMLElement>(`[data-mod="${id}"]`);
      expect(css(modifier, 'min-width'), id).toBe(`${CHAIN.minBoxWidth}px`);
    }
  });

  it('measures that capacity in a box actually added up, against the plate it sits on', () => {
    // Not a taste: two jacks, two column gaps, the one control, the padding and
    // the border — the narrowest a box can be cut and still be a box.
    expect(CHAIN.minBoxWidth).toBe(
      2 * BOX.jack.size + 2 * BOX.gap + BOX.control.width + 2 * (BOX.padX + BOX.borderWidth),
    );
    // And the room is the plate's own width, less its padding and the well's.
    expect(CHAIN.room).toBe(BOARD.width - 2 * BOARD.padX - 2 * BOARD.well.padX);
    expect(CHAIN.capacity).toBe(
      Math.floor((CHAIN.room + CHAIN.gap) / (CHAIN.minBoxWidth + CHAIN.gap)),
    );

    // The four numbers that arithmetic runs on are restatements of CSS strings,
    // which is the one way it could quietly stop being true. So each is held to
    // the string it restates rather than trusted.
    expect(BOARD.padding).toContain(`${BOARD.padX}px`);
    expect(BOARD.well.padding).toContain(`${BOARD.well.padX}px`);
    expect(BOX.padding).toContain(`${BOX.padX}px`);
    expect(plate.border).toContain(`${BOX.borderWidth}px`);
    expect(CHAIN.gap).toBe(BOARD.well.gap);
  });

  it('holds the boxes it actually has to one line, with room for the three gt#41 adds', () => {
    // The guard, and the whole point of the issue: a box added past the rack's
    // room fails here rather than being built, painted and overflowed.
    expect(MODIFIER_IDS.length).toBeLessThanOrEqual(CHAIN.capacity);

    // Not merely "they fit": they fit at their narrowest, gaps included, which
    // is what "without scrolling" means once the boxes are allowed to stretch.
    const laid = MODIFIER_IDS.length * (CHAIN.minBoxWidth + CHAIN.gap) - CHAIN.gap;
    expect(laid).toBeLessThanOrEqual(CHAIN.room);

    // Seven is what gt#41 brings the chain to. The rack must hold them, and the
    // spare above seven is deliberate — a capacity cut to exactly the boxes
    // somebody happened to ask for is a capacity that answers nothing.
    expect(CHAIN.capacity).toBeGreaterThanOrEqual(7);
  });

  it('gives the whole rack to the boxes: nothing else is in its flow', () => {
    const { handle } = build();
    const chain = zone(handle, 'chain');

    // The capacity is arithmetic over the rack's whole width, so anything else
    // laid in the row would be taking room the arithmetic has already spent.
    // The footnote that sat over it is gone (gt#110); the stamp is out of flow.
    const inFlow = ([...chain.children] as HTMLElement[]).filter(
      (child) => child.style.position !== 'absolute',
    );
    expect(inFlow.map((child) => child.dataset.mod)).toEqual([...MODIFIER_IDS]);
    expect(part(chain, 'footnote')).toBeNull();
    expect(css(chain, 'flex-wrap')).toBe('wrap');
  });
});

describe('THE FOG', () => {
  it('gives the board its four globals, the larger one a wheel', () => {
    const { handle } = build();
    expect([...handle.globals.keys()]).toEqual([
      `${GLOBAL_SCOPE}.seriousness`,
      `${GLOBAL_SCOPE}.tuning`,
      `${GLOBAL_SCOPE}.pace`,
      `${GLOBAL_SCOPE}.megadrift`,
    ]);
    const serious = zone(handle, 'fog').querySelector<HTMLElement>(
      `[data-control="${GLOBAL_SCOPE}.seriousness"]`,
    );
    expect(serious?.dataset.kind).toBe('wheel');
    expect(css(part(serious as HTMLElement, 'seat'), 'width')).toBe(
      `${BOARD.fog.serious.diameter}px`,
    );

    const tuning = zone(handle, 'fog').querySelector<HTMLElement>(
      `[data-control="${GLOBAL_SCOPE}.tuning"]`,
    );
    expect(tuning?.dataset.kind).toBe('selector');
    expect(css(part(tuning as HTMLElement, 'seat'), 'width')).toBe(`${BOARD.fog.tuning.diameter}px`);
    expect(part(tuning as HTMLElement, 'word')?.textContent).toBe(
      TUNE_WORDS[OPENING_STATE.g.tuning],
    );
  });

  it('gives MEGADRIFT a lever, painted in the globals and held out of their state', () => {
    const { handle } = build();
    const lever = zone(handle, 'fog').querySelector<HTMLElement>(
      `[data-control="${GLOBAL_SCOPE}.megadrift"]`,
    );
    expect(lever?.dataset.kind).toBe('lever');
    expect(part(lever as HTMLElement, 'tape')?.textContent).toBe(CONTROLS.megadrift.label);
    expect(css(part(lever as HTMLElement, 'seat'), 'height')).toBe(
      `${BOARD.fog.megadrift.height}px`,
    );
    // Continuous, so the slot has no scale cut into it — a ratchet would promise
    // positions that do not exist. Same rule a selector's dots keep.
    expect(lever?.querySelectorAll('[data-part="notch"]')).toHaveLength(0);
    // And the whole point of the control: it opens shut. A board that starts
    // wandering before anybody asked has changed itself on first contact.
    expect(css(part(lever as HTMLElement, 'bar'), 'bottom')).toBe('0px');

    // It is painted in the `g` scope, so its halo is found by the same lookup and
    // its drags are worn by the same clause — and it is deliberately *not* a
    // field of the state, which is what makes it something the hammer cannot
    // re-roll. Both halves of that are checked, because either one alone reads
    // like an oversight.
    expect(handle.globals.has(`${GLOBAL_SCOPE}.megadrift`)).toBe(true);
    // PACE (gt#45) is the other side of the same coin and is checked here rather
    // than in its own test, because the distinction only means anything stated as
    // a pair: it is painted in the same scope as this lever and *is* a field of
    // the state, because a heartbeat is a thing the board is doing and the hammer
    // is entitled to re-roll it.
    expect(Object.keys(OPENING_STATE.g)).toEqual(['seriousness', 'tuning', 'pace']);
  });

  it('spells TUNING out in words, never in numbers', () => {
    const { handle } = build();
    for (const step of TUNE_WORDS.keys()) {
      handle.setState({ ...OPENING_STATE, g: { ...OPENING_STATE.g, tuning: step } });
      const word = zone(handle, 'fog').querySelector<HTMLElement>(
        `[data-control="${GLOBAL_SCOPE}.tuning"] [data-part="word"]`,
      );
      expect(word?.textContent).toBe(TUNE_WORDS[step]);
    }
  });

  it('spells PACE out in words too, and paints no tempo anywhere', () => {
    const { handle } = build();
    const pace = zone(handle, 'fog').querySelector<HTMLElement>(
      `[data-control="${GLOBAL_SCOPE}.pace"]`,
    );
    expect(pace?.dataset.kind).toBe('selector');
    expect(part(pace as HTMLElement, 'tape')?.textContent).toBe(CONTROLS.pace.label);

    for (const step of PACE_WORDS.keys()) {
      handle.setState({ ...OPENING_STATE, g: { ...OPENING_STATE.g, pace: step } });
      const word = zone(handle, 'fog').querySelector<HTMLElement>(
        `[data-control="${GLOBAL_SCOPE}.pace"] [data-part="word"]`,
      );
      expect(word?.textContent).toBe(PACE_WORDS[step]);
    }

    // The rule the control exists to keep (gt#45): the tempo behind it is the one
    // setting on this board with an obvious number, and not one of the four is
    // painted anywhere in THE FOG at any position. Checked over the whole well
    // rather than over the control, because a number leaking into a label, a tip
    // or a caption is the same failure wherever it lands.
    const fog = zone(handle, 'fog').textContent ?? '';
    for (const tempo of TEMPOS) expect(fog, String(tempo)).not.toContain(String(tempo));
  });

  it('hangs a ram over an anvil for people who do not want to decide', () => {
    const { handle } = build();
    const smash = part(zone(handle, 'fog'), 'smash') as HTMLElement;
    expect(part(smash, 'tape')?.textContent).toBe(CONTROLS.smash.label);

    // The rig is the anvil on its bed, the ram's fall, and what shows of the
    // ram before it falls — which is what puts the die on the plate when the
    // ram is down, rather than through it or above it.
    expect(css(part(smash, 'rig'), 'height')).toBe(`${RIG_HEIGHT}px`);
    expect(css(part(smash, 'rig'), 'width')).toBe(`${SMASH.rigWidth}px`);
    expect(RIG.stand).toBe(SMASH.foot.height + SMASH.block.height + SMASH.anvil.height);
    expect(RIG_HEIGHT).toBe(RIG.stand + SMASH.lift + SMASH.rest);
    expect(RIG.anvilTop).toBe(RIG_HEIGHT - RIG.stand);
    expect(RIG.strikeX).toBe(SMASH.rigWidth / 2);

    // The bed, the sow block and the struck plate, stacked and centred, with
    // the dust coming off the top of the stack.
    expect(css(part(smash, 'foot'), 'height')).toBe(`${SMASH.foot.height}px`);
    expect(css(part(smash, 'block'), 'bottom')).toBe(`${SMASH.foot.height}px`);
    expect(css(part(smash, 'anvil'), 'bottom')).toBe(`${SMASH.foot.height + SMASH.block.height}px`);
    expect(css(part(smash, 'anvil'), 'width')).toBe(`${SMASH.anvil.width}px`);
    for (const name of ['block', 'anvil', 'dust']) {
      expect(css(part(smash, name), 'left'), name).toBe(`${RIG.strikeX}px`);
    }
    expect(css(part(smash, 'dust'), 'bottom')).toBe(`${RIG.stand - SMASH.dustSize / 2}px`);

    // The ram is placed so that at `0 0` its bottom is exactly the struck
    // face, and it rests `lift` above that.
    const hammer = part(smash, 'hammer') as HTMLElement;
    const shaft = part(smash, 'shaft') as HTMLElement;
    expect(hammer.parentElement).toBe(shaft);
    const top = parseFloat(css(hammer, 'top')) + parseFloat(css(shaft, 'top'));
    expect(top).toBe(RIG.ramTop);
    expect(top + SMASH.ram.height).toBe(RIG.anvilTop);
    expect(css(hammer, 'translate')).toBe(`0 ${-SMASH.lift}px`);
    expect(css(hammer, 'left')).toBe(`${RIG.strikeX - SMASH.ram.width / 2}px`);
    // It falls straight down: nothing turns.
    expect(css(hammer, 'rotate')).toBe('');
    // And goes a pixel or two past the plate, so it is seen to hit.
    expect(SMASH.bite).toBeGreaterThan(0);
    expect(SMASH.bite).toBeLessThan(3);
  });

  it('is the size of a building: the ram and its columns run up out of the row (gt#115)', () => {
    // Thomas: "one of those giant multi-ton industrial hammers that are the
    // size of a small building… coming down from above." A thing that fits
    // inside the row it stands in cannot be giant. This one does not fit.
    const { handle } = build();
    const smash = part(zone(handle, 'fog'), 'smash') as HTMLElement;
    const shaft = part(smash, 'shaft') as HTMLElement;
    const { ram, column } = SMASH;

    // The ram is taller than the whole rig, so its top is above the rig's at
    // both ends of its travel: there is always more of it up there.
    expect(ram.height).toBeGreaterThan(RIG_HEIGHT);
    expect(RIG.ramTop).toBeLessThan(-SMASH.overhead);
    expect(RIG.ramTop - SMASH.lift).toBeLessThan(RIG.ramTop);
    // What is above the lip of the well is not drawn: the shaft starts at the
    // lip and clips.
    expect(css(shaft, 'top')).toBe(`${-SMASH.overhead}px`);
    expect(css(shaft, 'overflow')).toBe('hidden');
    expect(SMASH.overhead).toBeLessThanOrEqual(parseFloat(BOARD.fog.padding));
    // At rest only its foot hangs into view; down, it fills the shaft.
    expect(SMASH.rest).toBeLessThan(ram.height / 3);
    expect(SMASH.rest).toBeGreaterThan(ram.die.height);
    expect(SMASH.lift).toBeGreaterThan(SMASH.rest);

    // Two columns, from the lip of the well to the bed, either side of the
    // ram with a little clearance, and in front of it.
    const columns = parts(smash, 'column');
    expect(columns).toHaveLength(2);
    expect(css(columns[0] as HTMLElement, 'left')).toBe(`${column.inset}px`);
    expect(css(columns[1] as HTMLElement, 'right')).toBe(`${column.inset}px`);
    for (const each of columns) {
      expect(css(each, 'top')).toBe(`${-SMASH.overhead}px`);
      expect(css(each, 'bottom')).toBe(`${SMASH.foot.height}px`);
      expect(css(each, 'width')).toBe(`${column.width}px`);
      expect(tight(css(each, 'background'))).toBe(tight(signals.hammerPost));
      expect(part(each, 'rivets')).not.toBeNull();
    }
    const clear = SMASH.rigWidth - 2 * (column.inset + column.width);
    expect(ram.width).toBeLessThan(clear);
    expect(clear - ram.width).toBeLessThanOrEqual(8);
    const order = ([...(part(smash, 'rig') as HTMLElement).children] as HTMLElement[]).map(
      (child) => child.dataset.part,
    );
    expect(order.indexOf('column')).toBeGreaterThan(order.indexOf('shaft'));
    // And the anvil is under the ram, so a landed ram covers its mark.
    expect(order.indexOf('shaft')).toBeGreaterThan(order.indexOf('anvil'));

    // The ram, from the bottom up: the bright die, a chamfered steel body,
    // rivets, a chipped hazard stripe, a bolted plate, more rivets.
    const hammer = part(smash, 'hammer') as HTMLElement;
    const face = part(hammer, 'face') as HTMLElement;
    expect(css(face, 'bottom')).toBe('0px');
    expect(css(face, 'width')).toBe(`${ram.die.width}px`);
    expect(css(face, 'height')).toBe(`${ram.die.height}px`);
    expect(tight(css(face, 'background'))).toBe(tight(signals.hammerFace));
    expect(ram.die.width).toBeLessThan(ram.width);
    const body = part(hammer, 'body') as HTMLElement;
    expect(tight(css(body, 'background'))).toBe(tight(signals.hammerRam));
    expect(css(body, 'height')).toBe(`${ram.height - ram.die.height}px`);
    expect(css(body, 'clip-path')).toContain('polygon(');
    const rows = ([...hammer.children] as HTMLElement[]).filter((child) => child.dataset.part === 'rivets');
    expect(rows).toHaveLength(ram.rows.up.length);
    rows.forEach((row, i) => {
      expect(css(row, 'bottom')).toBe(`${ram.die.height + (ram.rows.up[i] as number)}px`);
      expect(tight(css(row, 'background-image'))).toBe(tight(signals.hammerRivets));
    });
    const stripe = part(hammer, 'stripe') as HTMLElement;
    expect(css(stripe, 'bottom')).toBe(`${ram.die.height + ram.stripe.up}px`);
    const paint = part(stripe, 'hazard') as HTMLElement;
    expect(tight(css(paint, 'background'))).toBe(tight(signals.hammerHazard));
    // The same paint as the guarded button's, chipped by the same field.
    expect(css(paint, 'mask-image')).toBe('var(--chipTex)');
    expect(css(part(part(smash, 'block') as HTMLElement, 'hazard'), 'mask-image')).toBe('var(--chipTex)');
    const panel = part(hammer, 'panel') as HTMLElement;
    expect(parts(panel, 'bolt')).toHaveLength(4);

    // Something of the stripe and a row of rivets is in view before it falls,
    // so what hangs there is plainly the foot of a machine.
    expect(ram.stripe.up + ram.die.height).toBeLessThan(SMASH.rest + SMASH.overhead);
    expect((ram.rows.up[0] as number) + ram.die.height).toBeLessThan(SMASH.rest);
    // And the plate only comes into view on the way down.
    expect(ram.panel.up + ram.die.height).toBeGreaterThan(SMASH.rest + SMASH.overhead);
    expect(ram.panel.up + ram.panel.height + ram.die.height).toBeLessThan(RIG.anvilTop + SMASH.overhead);

    // No brown anywhere in it: a steel has its three channels within a few
    // points of each other, and a wood does not.
    for (const name of ['hammerRam', 'hammerFace', 'hammerBand', 'hammerPost'] as const) {
      for (const hex of signals[name].match(/#[0-9a-f]{6}/gi) ?? []) {
        const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)) as [
          number,
          number,
          number,
        ];
        expect(r - b, `${name} ${hex}`).toBeLessThan(40);
        expect(r, `${name} ${hex}`).toBeGreaterThanOrEqual(g);
      }
    }
  });

  it('stands clear of the seal: neither the hammer nor MEGADRIFT is on a station (gt#115)', () => {
    // Thomas: "keep the sigil placement in mind with the hammer as well." It
    // stood after MEGADRIFT, on the station at the top of the seal.
    const { handle } = build();
    const fog = zone(handle, 'fog');
    const seats = sealSeats(BOARD.seal.size, SOURCE_IDS.length);
    const stations = seats.map((seat) => ({
      x: BOARD.width / 2 - BOARD.seal.size / 2 + seat.x,
      y: seat.y,
      reach: seat.size / 2,
    }));

    // The hammer and the group after it are packed against the right-hand end
    // of the row, in one box, so where the hammer starts is arithmetic.
    const tail = part(fog, 'tail') as HTMLElement;
    expect(([...tail.children] as HTMLElement[]).map((child) => child.dataset.part)).toEqual([
      'smash',
      'end',
    ]);
    expect(css(tail, 'gap')).toBe(`${BOARD.fog.tail.gap}px`);
    const order = ([...fog.children] as HTMLElement[]).map((child) => child.dataset.part ?? 'control');
    expect(order.slice(-2)).toEqual(['spacer', 'tail']);
    const fogPad = parseFloat(BOARD.fog.padding.split(' ')[1] ?? '0');
    const end = BOARD.still.width + BOARD.apart.width + BOARD.scrub.width + 2 * BOARD.fog.end.gap;
    const right = BOARD.width - BOARD.padX - fogPad - end - BOARD.fog.tail.gap;
    const left = right - SMASH.rigWidth;
    // Clear of every station the row can hold. The row crosses the station
    // at the top of the seal; a station further below that one than the row
    // is tall cannot be in the row with it, wherever the row's edges fall.
    const rowTall = 160;
    const held = stations.filter((station) => station.y - (stations[0]?.y ?? 0) < rowTall);
    // The top one and the one either side of it.
    expect(held).toHaveLength(3);
    for (const station of held) {
      expect(left, `station at ${Math.round(station.x)}`).toBeGreaterThan(station.x + station.reach);
    }

    // MEGADRIFT is moved along so its middle is half way between the station
    // at the top of the seal and the one to its left, and its tape is clear
    // of both.
    const shift = megadriftShift(SOURCE_IDS.length);
    expect(shift).toBeGreaterThan(0);
    const { serious, tuning, pace, megadrift, gap } = BOARD.fog;
    // The distance is shared between the three gaps before it (gt#117), so the
    // four stand evenly: SERIOUSNESS, TUNING, PACE, MEGADRIFT, one gap apart.
    const spread = `${(shift / 3).toFixed(2)}px`;
    for (const name of ['tuning', 'pace', 'megadrift']) {
      const control = fog.querySelector<HTMLElement>(`[data-control="g.${name}"]`);
      expect(css(control, 'margin-left'), name).toBe(spread);
    }
    expect(css(fog.querySelector<HTMLElement>('[data-control="g.seriousness"]'), 'margin-left')).toBe('');
    // TUNING and PACE moved, and neither onto a station: PACE, the nearer,
    // has its dial well short of the left-hand one's mark. (Its column is
    // wider than its dial, and the column's empty margin is nothing.)
    const paceMiddle =
      BOARD.padX + fogPad + serious.width + tuning.width + pace.width / 2 + 2 * gap + (2 * shift) / 3;
    const nearest = stations[stations.length - 1] as (typeof stations)[number];
    expect(paceMiddle + pace.diameter / 2).toBeLessThan(nearest.x - nearest.reach - 10);
    const middle =
      BOARD.padX + fogPad + serious.width + tuning.width + pace.width + 3 * gap + shift + megadrift.width / 2;
    const top = stations[0] as (typeof stations)[number];
    const beside = stations[stations.length - 1] as (typeof stations)[number];
    expect(beside.x).toBeLessThan(top.x);
    expect(Math.abs(middle - (top.x + beside.x) / 2)).toBeLessThanOrEqual(0.5);
    expect(middle + megadrift.tape / 2).toBeLessThan(top.x - top.reach);
    expect(middle - megadrift.tape / 2).toBeGreaterThan(beside.x + beside.reach);
    // And it still leaves the hammer its room.
    expect(middle + megadrift.width / 2).toBeLessThan(left);
  });

  it('paints no instruction: how a wire is run is not written on the plate (gt#110)', () => {
    // Two lines stood at the far end of the top row and one over the rack. An
    // instruction on the plate is read before the act, and this board's rule
    // is that meaning arrives after it — so the sockets say it, on hover. See
    // the tip suite for that half.
    const { handle } = build();
    expect(part(handle.element, 'hint')).toBeNull();
    expect(part(handle.element, 'footnote')).toBeNull();
    const said = (handle.element.textContent ?? '').toLowerCase();
    for (const gone of ['sources feed', 'drag a wire', 'speakers', 'unplugged']) {
      expect(said, gone).not.toContain(gone);
    }
  });
});

// What gt#40 actually bought, and it is one sentence: the board changes when the
// hammer lands, not when the button is pressed. Everything below is that sentence
// held to — through a double press, through a stilled board, and through the one
// case where the two halves of this product could have parted company.
describe('the swing', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const rig = (handle: BoardHandle): HTMLElement =>
    part(zone(handle, 'fog'), 'smash') as HTMLElement;
  const hammer = (handle: BoardHandle): HTMLElement => part(rig(handle), 'hammer') as HTMLElement;
  const dust = (handle: BoardHandle): HTMLElement => part(rig(handle), 'dust') as HTMLElement;
  /** Every lamp on a plate or a box: the parts that read the flash, and so the parts it is written on. */
  const lamps = (handle: BoardHandle): HTMLElement[] => parts(handle.element, 'lamp');
  /** The flash as the lamps hold it — one answer if they agree, and they must. */
  const flash = (handle: BoardHandle): string => {
    const held = new Set(lamps(handle).map((lamp) => lamp.style.getPropertyValue(SMASH_VAR)));
    expect(held.size).toBe(1);
    return [...held][0] ?? '';
  };
  const hit = (handle: BoardHandle): void => {
    rig(handle).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  };

  it('decides nothing at all until the hammer has landed', () => {
    const touch = build();
    hit(touch.handle);
    // Falling. A re-roll that arrived here would be the dome again in a hat, and
    // that is the whole of what gt#40 replaced.
    vi.advanceTimersByTime(SMASH.swingMs - 1);
    expect(touch.smashes).toBe(0);
    expect(css(hammer(touch.handle), 'translate')).toBe(`0 ${SMASH.bite}px`);

    vi.advanceTimersByTime(1);
    expect(touch.smashes).toBe(1);
  });

  it('falls fast and is lifted back slowly, which is what a swing is', () => {
    const touch = build();
    hit(touch.handle);
    expect(css(hammer(touch.handle), 'transition')).toContain(`${SMASH.swingMs}ms`);

    vi.advanceTimersByTime(SMASH.swingMs);
    expect(css(hammer(touch.handle), 'translate')).toBe(`0 ${-SMASH.lift}px`);
    expect(css(hammer(touch.handle), 'transition')).toContain(`${SMASH.recoverMs}ms`);
    // Equal times would read as a wiper blade rather than as a dropped weight.
    expect(SMASH.recoverMs).toBeGreaterThan(SMASH.swingMs);
  });

  it('is one hit per press, however hard the button itself is hammered', () => {
    const touch = build();
    for (let press = 0; press < 6; press += 1) hit(touch.handle);
    vi.advanceTimersByTime(SMASH.swingMs);
    expect(touch.smashes).toBe(1);
  });

  it('can be swung again the moment it has landed, mid-lift', () => {
    const touch = build();
    hit(touch.handle);
    vi.advanceTimersByTime(SMASH.swingMs);
    hit(touch.handle);
    vi.advanceTimersByTime(SMASH.swingMs);
    expect(touch.smashes).toBe(2);
  });

  it('throws dust out of the struck point rather than fading it in over one', () => {
    const touch = build();
    expect(css(dust(touch.handle), 'opacity')).toBe('0');

    hit(touch.handle);
    vi.advanceTimersByTime(SMASH.swingMs);
    expect(css(dust(touch.handle), 'opacity')).toBe('1');
    expect(css(dust(touch.handle), 'scale')).toBe(String(SMASH.dustStart));
    expect(SMASH.dustStart).toBeLessThan(1);

    // The release is a tick later on purpose: a transition set in the same tick
    // as the value it starts from resolves once and never runs.
    vi.advanceTimersByTime(1);
    expect(css(dust(touch.handle), 'opacity')).toBe('0');
    expect(css(dust(touch.handle), 'scale')).toBe(String(SMASH.dustSpread));
  });

  it('overdrives every lit lamp on contact, and lets go of them', () => {
    const touch = build();
    hit(touch.handle);
    vi.advanceTimersByTime(SMASH.swingMs);
    expect(flash(touch.handle)).toBe(String(SMASH.flash));
    expect(SMASH.flash).toBeGreaterThan(1);

    // On the lamps and on nothing above them. One write on the plate would
    // reach them all by inheritance — and would make the browser work every
    // node on the board out again, and repaint every texture on it, to brighten
    // eighteen dots.
    expect(lamps(touch.handle).length).toBeGreaterThan(15);
    expect(touch.handle.element.style.getPropertyValue(SMASH_VAR)).toBe('');

    vi.advanceTimersByTime(SMASH.flashMs);
    // Removed rather than written back to 1: the lamps read it with a fallback,
    // so absence already *is* the resting value, said once instead of twice.
    expect(flash(touch.handle)).toBe('');
  });

  it('lands without moving on a stilled board, and lands immediately', () => {
    const touch = build();
    touch.handle.setStill(true);
    hit(touch.handle);

    // No wait, because there is no swing to wait for. STILLNESS is a promise
    // about the eyes and this is the one press on the board that is about both.
    expect(touch.smashes).toBe(1);
    expect(css(hammer(touch.handle), 'translate')).toBe(`0 ${-SMASH.lift}px`);
    expect(css(dust(touch.handle), 'opacity')).toBe('0');
    expect(flash(touch.handle)).toBe('');
  });

  it('lands a swing already in the air when STILLNESS is pressed, exactly once', () => {
    const touch = build();
    hit(touch.handle);
    vi.advanceTimersByTime(SMASH.swingMs - 1);
    expect(touch.smashes).toBe(0);

    touch.handle.setStill(true);
    // Swallowing it here would be this switch changing what comes out of the
    // speakers, which is the one thing it may never do.
    expect(touch.smashes).toBe(1);

    // And nothing is left ticking to deliver the same blow a second time.
    vi.advanceTimersByTime(SMASH.swingMs + SMASH.recoverMs + SMASH.flashMs);
    expect(touch.smashes).toBe(1);
    expect(css(hammer(touch.handle), 'translate')).toBe(`0 ${-SMASH.lift}px`);
  });

  it('leaves nothing ticking once destroyed', () => {
    const touch = build();
    hit(touch.handle);
    touch.handle.destroy();
    vi.advanceTimersByTime(SMASH.swingMs + SMASH.recoverMs + SMASH.flashMs);
    expect(touch.smashes).toBe(0);
  });
});

describe('the dents', () => {
  const marks = (handle: BoardHandle): HTMLElement[] =>
    parts(part(zone(handle, 'fog'), 'smash') as HTMLElement, 'dent');

  it('opens already marked, at the count it was handed', () => {
    // A dent nobody struck this session is not something to watch arrive, which
    // is the same reason the wear halos are built in rather than animated on.
    expect(marks(build({ dents: 3 }).handle)).toHaveLength(3);
    expect(marks(build().handle)).toEqual([]);
  });

  it('puts every mark somewhere of its own, off a fixed table', () => {
    const { handle } = build({ dents: SMASH.maxDents });
    const where = marks(handle).map((mark) => `${mark.style.left}|${mark.style.top}`);
    expect(new Set(where).size).toBe(SMASH.maxDents);
  });

  it('stops marking once the anvil is full, rather than turning it into a hole', () => {
    const { handle } = build();
    handle.setDents(SMASH.maxDents * 10);
    expect(marks(handle)).toHaveLength(SMASH.maxDents);
  });

  it('comes all the way off, which is what SCRUB THE ALTAR finally has to undo', () => {
    const { handle } = build({ dents: 5 });
    handle.setDents(0);
    expect(marks(handle)).toEqual([]);
  });

  it('draws the same plate for the same count, however it got there', () => {
    // The count is the whole of the state, which is only true while where a mark
    // lands is a table rather than a draw. `Math.random` is reached for in one
    // file in this product and it is not this one.
    const grown = build().handle;
    for (let n = 1; n <= 4; n += 1) grown.setDents(n);
    const cold = build({ dents: 4 }).handle;
    expect(marks(grown).map((mark) => mark.getAttribute('style'))).toEqual(
      marks(cold).map((mark) => mark.getAttribute('style')),
    );
  });
});

describe('the far end of the top row', () => {
  /** The top row's own children, in order, by part. */
  const row = (handle: BoardHandle): string[] =>
    ([...zone(handle, 'fog').children] as HTMLElement[])
      .filter((child) => child.style.position !== 'absolute')
      .map((child) => child.dataset.part ?? child.dataset.control ?? '');

  it('lays the row out: the hardware, then a group at the far end with the button over the tapes (gt#114)', () => {
    // Thomas: "move it right to above the other tape labels." Beside the
    // hammer it stood on one of the seal's stations.
    const touch = build();
    const order = row(touch.handle);
    expect(order.slice(-2)).toEqual(['spacer', 'tail']);
    expect(css(part(zone(touch.handle, 'fog'), 'spacer'), 'flex')).toContain('1');

    const end = part(zone(touch.handle, 'fog'), 'end') as HTMLElement;
    const held = ([...end.children] as HTMLElement[]).map((child) => child.dataset.part);
    // STILLNESS, the button over its own tape, SCRUB THE ALTAR.
    expect(held).toEqual(['still', 'apart', 'scrub']);
    // On the row's bottom line, with the hammer, and its three on one line of
    // their own: the button's column is the tall one, so the two tapes sit
    // level with its tape.
    expect(css(end.parentElement as HTMLElement, 'align-self')).toBe('flex-end');
    expect(css(end.parentElement as HTMLElement, 'align-items')).toBe('flex-end');
    expect(css(end, 'align-items')).toBe('flex-end');
    expect(css(end, 'gap')).toBe(`${BOARD.fog.end.gap}px`);

    // The button is the first thing in its column and its tape the last, so
    // it is over the tapes and not beside them.
    const apart = part(end, 'apart') as HTMLElement;
    expect((apart.firstElementChild as HTMLElement).dataset.part).toBe('guard');
    expect((apart.lastElementChild as HTMLElement).dataset.part).toBe('tape');
    expect(css(apart, 'width')).toBe(`${BOARD.apart.width}px`);

    // Nothing is left in the bottom corner: none of the three is pinned to
    // the plate.
    for (const name of ['apart', 'still', 'scrub']) {
      const button = part(touch.handle.element, name) as HTMLElement;
      expect(button.parentElement, name).toBe(end);
      expect(css(button, 'position'), name).toBe('');
      expect(css(button, 'bottom'), name).toBe('');
      expect(css(button, 'right'), name).toBe('');
      expect(parts(touch.handle.element, name), name).toHaveLength(1);
    }
  });

  it('keeps the group clear of the seal: nothing in it stands on a station (gt#114)', () => {
    // The seal is centred on the board and its stations stand round a ring in
    // it. The group is packed against the row's right end, so where it starts
    // is the board's width less its paddings and its own stated widths — and
    // that is further right than any station reaches, at any height.
    const width =
      BOARD.still.width + BOARD.apart.width + BOARD.scrub.width + 2 * BOARD.fog.end.gap;
    const fogPad = parseFloat(BOARD.fog.padding.split(' ')[1] ?? '0');
    const left = BOARD.width - BOARD.padX - fogPad - width;
    const seats = sealSeats(BOARD.seal.size, SOURCE_IDS.length);
    expect(seats).toHaveLength(SOURCE_IDS.length);
    for (const seat of seats) {
      // A station's place on the board, and how far its mark reaches.
      const x = BOARD.width / 2 - BOARD.seal.size / 2 + seat.x;
      expect(left, `station at ${Math.round(x)}`).toBeGreaterThan(x + seat.size / 2);
    }
  });

  it('keeps SCRUB THE ALTAR a scrap of tape, cut as it was', () => {
    const touch = build();
    const scrub = part(touch.handle.element, 'scrub');
    expect(scrub?.textContent).toBe(CONTROLS.scrub.label);
    expect(tight(css(scrub, 'background-color'))).toBe(tight(ink.tapeScrap));
    expect(css(scrub, 'font-size')).toBe(`${BOARD.scrub.fontSize}px`);
    expect(css(scrub, 'opacity')).toBe(String(BOARD.scrub.opacity));
    // Cut to a stated width, lettering in the middle of it.
    expect(css(scrub, 'width')).toBe(`${BOARD.scrub.width}px`);
    expect(css(scrub, 'box-sizing')).toBe('border-box');
    expect(css(scrub, 'text-align')).toBe('center');

    scrub?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(touch.scrubs).toBe(1);
  });

  it('puts STILLNESS on the same line, cut from the same tape (gt#33)', () => {
    const touch = build();
    const still = part(touch.handle.element, 'still');

    expect(still?.textContent).toBe(CONTROLS.stillness.label);
    // The same tape as SCRUB, because it is the other thing here that undoes
    // rather than plays — and a piece of its own rather than sharing a strip.
    const scrub = part(touch.handle.element, 'scrub');
    expect(css(still, 'font-family')).toBe(css(scrub, 'font-family'));
    expect(css(still, 'font-size')).toBe(css(scrub, 'font-size'));
    expect(tight(css(still, 'background-color'))).toBe(tight(ink.tapeScrap));
    expect(css(still, 'width')).toBe(`${BOARD.still.width}px`);
    // The button's column is between the two.
    expect((still?.nextElementSibling as HTMLElement).dataset.part).toBe('apart');
    expect(still?.nextElementSibling?.nextElementSibling).toBe(scrub);

    still?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(touch.stills).toBe(1);
  });

  it('latches, which nothing else on the plate does', () => {
    const touch = build();
    const still = part(touch.handle.element, 'still');

    // It reports the press and waits to be told — the answer outlives the page,
    // so the board is not the thing entitled to decide it.
    still?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(still?.style.opacity).toBe(String(BOARD.still.opacity));

    touch.handle.setStill(true);
    expect(still?.style.opacity).toBe(String(BOARD.still.onOpacity));
    // Pressed *into* the plate rather than merely losing its shadow, which would
    // read as unstuck.
    expect(still?.style.boxShadow).toBe(ink.buttonPressedShadow);

    touch.handle.setStill(false);
    expect(still?.style.opacity).toBe(String(BOARD.still.opacity));
    expect(still?.style.boxShadow).toBe(ink.buttonShadow);
  });
});

// COME APART (gt#112): a big red button under a hinged cover. What it arms is the
// shelf's and whether it is armed is the caller's; what is the board's is the
// guard — that it takes two acts, and what each of them looks like.
describe('the guarded button', () => {
  const click = (target: Element | null | undefined): void => {
    target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  };
  const pieces = (handle: BoardHandle) => {
    const apart = part(handle.element, 'apart') as HTMLElement;
    return {
      apart,
      guard: part(apart, 'guard') as HTMLElement,
      seat: part(apart, 'seat') as HTMLElement,
      cover: part(apart, 'cover') as HTMLElement,
      button: part(apart, 'button') as HTMLElement,
      tape: part(apart, 'tape') as HTMLElement,
    };
  };
  const rgb = (hex: string): [number, number, number] =>
    [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)) as [number, number, number];
  const shut = `perspective(${BOARD.apart.cover.perspective}px) rotateX(0deg)`;
  const open = `perspective(${BOARD.apart.cover.perspective}px) rotateX(${BOARD.apart.cover.openDeg}deg)`;

  it('is a big red button on a seat, under a cover, over its own tape', () => {
    const { apart, guard, seat, cover, button, tape } = pieces(build().handle);
    expect(tape.textContent).toBe(CONTROLS.apart.label);
    // The whole word on the whole object, and no other: the tip layer reads
    // the tape, so the name must be the only text in it.
    expect(apart.textContent).toBe(CONTROLS.apart.label);
    expect(css(apart, 'cursor')).toBe('pointer');

    // Big: the dome alone is most of a selector's face, and the seat is the
    // widest thing in the row after the wheel and the hammer.
    expect(BOARD.apart.button.size).toBeGreaterThan(BOARD.fog.tuning.diameter * 0.75);
    expect(BOARD.apart.seat.size).toBeGreaterThan(BOARD.fog.tuning.diameter);
    expect(css(button, 'width')).toBe(`${BOARD.apart.button.size}px`);
    expect(css(button, 'border-radius')).toBe('50%');
    expect(css(seat, 'width')).toBe(`${BOARD.apart.seat.size}px`);
    expect(css(seat, 'height')).toBe(`${BOARD.apart.seat.size}px`);

    // Red: every stop of the dome, lit or not, is more red than anything else.
    for (const hex of `${signals.apartDome} ${signals.apartDomeLit}`.match(/#[0-9a-f]{6}/gi) ?? []) {
      const [r, g, b] = rgb(hex);
      expect(r, hex).toBeGreaterThan(g * 1.25);
      expect(r, hex).toBeGreaterThan(b * 1.25);
    }

    // The dome sits in a recess inside a hazard ring, each smaller than the last.
    expect(BOARD.apart.ring).toBeLessThan(BOARD.apart.seat.size);
    expect(BOARD.apart.well).toBeLessThan(BOARD.apart.ring);
    expect(BOARD.apart.button.size).toBeLessThan(BOARD.apart.well);
    expect(tight(css(part(seat, 'ring'), 'background'))).toBe(tight(signals.hammerHazard));

    // The cover is the seat's size, hinged along its top edge, with the dome
    // seen through it.
    expect(css(cover, 'transform-origin')).toBe('50% 0');
    for (const edge of ['left', 'top', 'right', 'bottom']) expect(css(cover, edge), edge).toBe('0px');
    expect(tight(css(cover, 'background'))).toBe(tight(signals.apartCover));
    expect(signals.apartCover).toContain('rgba(');
    expect(part(seat, 'hinge')).not.toBeNull();
    // After the dome in the seat, so it is over it.
    const order = [...seat.children].map((child) => (child as HTMLElement).dataset.part);
    expect(order.indexOf('cover')).toBeGreaterThan(order.indexOf('button'));

    // The guard is cut to the lifted cover, so the cover is inside it open
    // and shut, and the row is no taller for it than the hammer makes it.
    expect(css(guard, 'height')).toBe(`${GUARD.height}px`);
    // As wide as the seat. The lifted cover is drawn a little wider than that
    // and overhangs — by less than the column either side of the seat plus
    // the gap to the tapes, so it never reaches over one.
    expect(css(guard, 'width')).toBe(`${BOARD.apart.seat.size}px`);
    expect((GUARD.width - BOARD.apart.seat.size) / 2).toBeLessThan(
      (BOARD.apart.width - BOARD.apart.seat.size) / 2 + BOARD.fog.end.gap,
    );
    expect(GUARD.height).toBe(BOARD.apart.seat.size + GUARD.lift);
    const turn = (BOARD.apart.cover.openDeg * Math.PI) / 180;
    const near =
      BOARD.apart.cover.perspective /
      (BOARD.apart.cover.perspective - BOARD.apart.seat.size * Math.sin(turn));
    expect(GUARD.lift).toBeGreaterThanOrEqual(-BOARD.apart.seat.size * Math.cos(turn) * near);
    expect(GUARD.width).toBeGreaterThanOrEqual(BOARD.apart.seat.size * near);
    // Past upright, so it stands over the hinge and is seen.
    expect(BOARD.apart.cover.openDeg).toBeGreaterThan(90);
    expect(GUARD.lift).toBeGreaterThan(12);
    expect(GUARD.height).toBeLessThanOrEqual(RIG_HEIGHT);
  });

  it('is old: rusted, chipped, scuffed, faded and cracked (gt#114)', () => {
    // Thomas: "too clean. The body needs rust, the striped paint needs
    // chipping, the red light needs to be faded with weathered red plastic
    // that softens it, and the cover panel needs cracks in it."
    const { seat, cover, button } = pieces(build().handle);
    const own = (host: HTMLElement, name: string): HTMLElement =>
      ([...host.children] as HTMLElement[]).find((child) => child.dataset.part === name) as HTMLElement;

    // Rust on the body: the board's own tile, laid several times at the scale
    // of the thing, there on a new board and worse on an old one.
    const rust = own(seat, 'rust');
    const lays = (host: HTMLElement): HTMLElement[] => parts(host, 'lay');
    expect(lays(rust)).toHaveLength(BOARD.apart.rust.layers.length);
    expect(BOARD.apart.rust.layers.length).toBeGreaterThan(1);
    lays(rust).forEach((lay, i) => {
      const [size, x, y] = BOARD.apart.rust.layers[i] as readonly [number, number, number];
      expect(css(lay, 'background-image')).toBe('var(--rustTex)');
      expect(css(lay, 'background-size')).toBe(`${size}px`);
      expect(css(lay, 'background-position')).toBe(`${x}px ${y}px`);
      // Smaller than the tile is cut, so the patches are at the seat's scale.
      expect(size).toBeLessThan(420);
    });
    // No two lays the same, or the second adds nothing.
    expect(new Set(BOARD.apart.rust.layers.map((layer) => layer.join())).size).toBe(
      BOARD.apart.rust.layers.length,
    );
    expect(css(rust, 'opacity')).toBe(
      `calc(${BOARD.apart.rust.base} + var(--weather, 0) * ${BOARD.apart.rust.weather})`,
    );
    expect(BOARD.apart.rust.base).toBeGreaterThan(0.5);
    expect(BOARD.apart.rust.base + BOARD.apart.rust.weather).toBeLessThanOrEqual(1);
    // Over the seat and the painted ring, under the plastic dome.
    const order = ([...seat.children] as HTMLElement[]).map((child) => child.dataset.part);
    expect(order.indexOf('rust')).toBeGreaterThan(order.indexOf('ring'));
    expect(order.indexOf('rust')).toBeLessThan(order.indexOf('button'));

    // Chipped paint: the stripe is masked by the chip field, so what it was
    // painted on shows through the chips.
    const ring = own(seat, 'ring');
    expect(css(ring, 'mask-image')).toBe('var(--chipTex)');
    expect(css(ring, 'mask-repeat')).toBe('no-repeat');
    expect(css(ring, 'mask-position')).toBe(BOARD.apart.chips.at);

    // Faded plastic. Unlit it is bleached: its brightest stop is nearer pink
    // than red. Lit, the light comes through it: no stop is white-hot, and
    // the glow is short and under half strength.
    const brightest = (gradient: string): [number, number, number] =>
      (gradient.match(/#[0-9a-f]{6}/gi) ?? [])
        .map(rgb)
        .sort((a, b) => b[0] + b[1] + b[2] - (a[0] + a[1] + a[2]))[0] as [number, number, number];
    const pale = brightest(signals.apartDome);
    expect(pale[1] / pale[0]).toBeGreaterThan(0.6);
    const lit = brightest(signals.apartDomeLit);
    expect(lit[1]).toBeLessThan(200);
    expect(lit[2]).toBeLessThan(180);
    for (const alpha of signals.apartDomeGlow.match(/rgba\(2\d\d,[^)]*\)/g) ?? []) {
      expect(Number(alpha.split(',')[3]?.replace(')', '')), alpha).toBeLessThan(0.5);
    }
    expect(signals.apartDomeGlow).toMatch(/^0 0 (\d+)px/);
    expect(Number(signals.apartDomeGlow.match(/^0 0 (\d+)px/)?.[1])).toBeLessThan(22);
    // And scuffed: the board's scratches on the dome, turning with it.
    const scuff = own(button, 'scuff');
    expect(lays(scuff).map((lay) => css(lay, 'background-image'))).toEqual(
      BOARD.apart.scuff.layers.map(() => 'var(--scratchTex)'),
    );
    expect(css(scuff, 'border-radius')).toBe('50%');
    expect(css(scuff, 'overflow')).toBe('hidden');

    // The cover is cracked, scuffed and rusted round its frame, and none of
    // it takes the press that is meant for the cover.
    const cracks = own(cover, 'cracks');
    expect(css(cracks, 'background-image')).toBe('var(--crackTex)');
    expect(css(cracks, 'background-size')).toBe('100% 100%');
    expect(lays(own(cover, 'scuff')).map((lay) => css(lay, 'background-image'))).toEqual(
      BOARD.apart.coverScuff.layers.map(() => 'var(--scratchTex)'),
    );
    expect(lays(own(cover, 'rust')).map((lay) => css(lay, 'background-image'))).toEqual(
      BOARD.apart.coverRust.layers.map(() => 'var(--rustTex)'),
    );
    // Round the frame and not across the glass.
    expect(css(own(cover, 'rust'), 'mask-image')).toBeTruthy();
    for (const layer of [rust, scuff, cracks, own(cover, 'scuff'), own(cover, 'rust')]) {
      expect(css(layer, 'pointer-events'), layer.dataset.part).toBe('none');
    }
  });

  it('opens shut and dark: cover down, button up, nothing asked of anyone', () => {
    const touch = build();
    const { apart, cover, button } = pieces(touch.handle);
    expect(apart.dataset.lid).toBe('down');
    expect(cover.style.transform).toBe(shut);
    // Put there, not swung there: nobody lifted or dropped it.
    expect(cover.style.transition).toBe('none');
    expect(tight(button.style.background)).toBe(tight(signals.apartDome));
    expect(tight(button.style.boxShadow)).toBe(tight(signals.apartDomeShadow));
    expect(css(button, 'scale')).toBe('1');
    expect(touch.aparts).toBe(0);
  });

  it('takes two acts: the first press lifts the cover and arms nothing', () => {
    const touch = build();
    const { apart, cover, button, tape } = pieces(touch.handle);

    // Anywhere on it — the cover, the dome seen through it, the tape under it.
    click(button);
    expect(apart.dataset.lid).toBe('up');
    expect(cover.style.transform).toBe(open);
    expect(cover.style.transition).toContain(`${BOARD.apart.cover.ms}ms`);
    expect(touch.aparts).toBe(0);

    // The second is the button.
    click(button);
    expect(touch.aparts).toBe(1);
    // It reports the press and waits to be told, like STILLNESS: whether the
    // board is armed outlives the page and is not the board's to decide.
    expect(tight(button.style.background)).toBe(tight(signals.apartDome));
    expect(apart.dataset.lid).toBe('up');

    // With the cover up, the tape under it is the button too.
    click(tape);
    expect(touch.aparts).toBe(2);

    const other = build();
    click(pieces(other.handle).tape);
    expect(pieces(other.handle).apart.dataset.lid).toBe('up');
    expect(other.aparts).toBe(0);
  });

  it('goes down and lights when the board is armed, and comes back up when it is not', () => {
    const touch = build();
    const { button } = pieces(touch.handle);
    click(button);

    touch.handle.setApart(true);
    expect(tight(button.style.background)).toBe(tight(signals.apartDomeLit));
    expect(tight(button.style.boxShadow)).toBe(tight(signals.apartDomeGlow));
    expect(css(button, 'scale')).toBe(String(BOARD.apart.button.pressed));
    expect(BOARD.apart.button.pressed).toBeLessThan(1);

    touch.handle.setApart(false);
    expect(tight(button.style.background)).toBe(tight(signals.apartDome));
    expect(tight(button.style.boxShadow)).toBe(tight(signals.apartDomeShadow));
    expect(css(button, 'scale')).toBe('1');
    // Letting the button up does not drop the cover.
    expect(pieces(touch.handle).apart.dataset.lid).toBe('up');
  });

  it('drops the cover on a press of the cover, and lets an armed button up as it goes', () => {
    const touch = build();
    const { apart, cover, button } = pieces(touch.handle);

    // Up and unarmed: the cover just closes.
    click(cover);
    click(cover);
    expect(apart.dataset.lid).toBe('down');
    expect(cover.style.transform).toBe(shut);
    expect(cover.style.transition).toContain(`${BOARD.apart.cover.ms}ms`);
    expect(touch.aparts).toBe(0);

    // Up and armed: closing it asks for the button back, the way a real guard
    // knocks the switch off as it comes down.
    click(cover);
    click(button);
    touch.handle.setApart(true);
    expect(touch.aparts).toBe(1);
    click(part(cover, 'tab'));
    expect(apart.dataset.lid).toBe('down');
    expect(touch.aparts).toBe(2);
    // And the caller's answer is drawn without lifting it again.
    touch.handle.setApart(false);
    expect(apart.dataset.lid).toBe('down');
    expect(tight(button.style.background)).toBe(tight(signals.apartDome));
  });

  it('opens with the cover up and the button down on a board that is already armed', () => {
    // The last session left it armed. A button cannot be down under a closed
    // guard, so the guard is up — and was put there, not swung there.
    const touch = build();
    const { apart, cover, button } = pieces(touch.handle);
    touch.handle.setApart(true);
    expect(apart.dataset.lid).toBe('up');
    expect(cover.style.transform).toBe(open);
    expect(cover.style.transition).toBe('none');
    expect(tight(button.style.background)).toBe(tight(signals.apartDomeLit));
    expect(touch.aparts).toBe(0);
    // One press now is the button, not the cover: it is already lifted.
    click(button);
    expect(touch.aparts).toBe(1);
  });

  it('changes state without swinging on a stilled board', () => {
    // A cover that lifts is motion, and STILLNESS stops all of it. It never
    // stops the press: the guard still takes its two acts.
    const touch = build();
    const { apart, cover, button } = pieces(touch.handle);
    touch.handle.setStill(true);

    click(button);
    expect(apart.dataset.lid).toBe('up');
    expect(cover.style.transform).toBe(open);
    expect(cover.style.transition).toBe('none');

    click(button);
    expect(touch.aparts).toBe(1);
    touch.handle.setApart(true);
    expect(button.style.transition).toBe('none');
    expect(tight(button.style.background)).toBe(tight(signals.apartDomeLit));

    click(cover);
    expect(apart.dataset.lid).toBe('down');
    expect(cover.style.transition).toBe('none');
    expect(touch.aparts).toBe(2);

    // A swing in the air when the board is stilled is over.
    const moving = build();
    click(pieces(moving.handle).button);
    expect(pieces(moving.handle).cover.style.transition).not.toBe('none');
    moving.handle.setStill(true);
    expect(pieces(moving.handle).cover.style.transition).toBe('none');
    expect(pieces(moving.handle).cover.style.transform).toBe(open);
  });

  it('goes quiet once destroyed', () => {
    const touch = build();
    const { button } = pieces(touch.handle);
    touch.handle.destroy();
    click(button);
    click(button);
    expect(touch.aparts).toBe(0);
    expect(pieces(touch.handle).apart.dataset.lid).toBe('down');
  });
});

describe('the board as a surface', () => {
  it('draws the state it is handed and calls back for nothing', () => {
    const { handle } = build();
    const dark: BoardState = {
      ...OPENING_STATE,
      woke: true,
      m: { ...OPENING_STATE.m, guitar: { on: false, loud: 0.1, char: 0.2, often: 0 } },
      mods: { ...OPENING_STATE.mods, grit: { amount: 0.9, fed: true } },
    };
    handle.setState(dark);

    const guitar = handle.modules.get('guitar');
    expect(part(guitar?.element as HTMLElement, 'lamp')?.style.background).toBe(signals.lampOff);
    const grit = handle.modifiers.get('grit');
    expect(part(grit?.element as HTMLElement, 'lamp')?.style.background).toBe(signals.lampOn);
  });

  it('holds every tint back until the lever has been pulled', () => {
    const { handle } = build();
    const lit = (): string[] =>
      [...handle.modules.values()].map(
        (module) => part(module.element, 'glow')?.style.opacity ?? '',
      );
    expect(new Set(lit())).toEqual(new Set(['0']));
    handle.setWoke(true);
    expect(lit().some((opacity) => opacity !== '0')).toBe(true);
  });

  it('wears one control anywhere on the board, by its key alone', () => {
    const { handle } = build();
    const halo = (selector: string): string =>
      handle.element.querySelector<HTMLElement>(`${selector} [data-part="wear"]`)?.style.opacity ??
      '';

    handle.setWear(`${GLOBAL_SCOPE}.seriousness`, 45);
    handle.setWear('guitar.char', 45);
    handle.setWear('mods.cavern', 45);
    expect(halo(`[data-control="${GLOBAL_SCOPE}.seriousness"]`)).toBe('0.9');
    expect(halo('[data-control="guitar.char"]')).toBe('0.9');
    expect(halo('[data-control="mods.cavern"]')).toBe('0.9');
    expect(halo('[data-control="bass.char"]')).toBe('0');
  });

  it('hands every OUT jack to the wire layer, sources and boxes alike', () => {
    const touch = build();
    const jabAt = (node: HTMLElement | undefined): void => {
      node?.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    };
    jabAt(touch.handle.modules.get('cow')?.jack);
    jabAt(touch.handle.modifiers.get('murk')?.jackOut);
    expect(touch.jabs).toEqual(['cow', 'murk']);
    // IN sockets are drop targets only: the board never listens on one.
    expect(touch.handle.modifiers.get('murk')?.jackIn.dataset.jackIn).toBe('murk');
  });

  it('reports a global moving, and draws nothing until it is told to', () => {
    const touch = build();
    const wheelControl = touch.handle.element.querySelector<HTMLElement>(
      `[data-control="${GLOBAL_SCOPE}.seriousness"]`,
    );
    wheelControl?.dispatchEvent(
      new PointerEvent('pointerdown', { clientY: 300, button: 0, bubbles: true }),
    );
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: 150, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    expect(touch.globals).toEqual([['seriousness', 1]]);
  });

  it('goes completely quiet once destroyed', () => {
    const touch = build();
    touch.handle.destroy();
    part(touch.handle.element, 'scrub')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    part(touch.handle.element, 'still')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    part(zone(touch.handle, 'fog'), 'smash')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(touch.smashes).toBe(0);
    expect(touch.scrubs).toBe(0);
    expect(touch.stills).toBe(0);
  });
});

describe('the opening board', () => {
  it('opens on something already sounding, exactly as the reference does', () => {
    expect(OPENING_STATE.woke).toBe(false);
    expect([OPENING_STATE.g.seriousness, OPENING_STATE.g.tuning]).toEqual([0.38, 2]);
    // PACE is not in that pin and cannot be: the reference had no such control
    // (gt#45). What it did have is the tempo the control now opens on, so the third
    // global is checked against the reference's default the long way round — the
    // opening position resolves to the number the handoff wrote down.
    expect(TEMPOS[OPENING_STATE.g.pace]).toBe(DEFAULT_BPM);
    // The four the reference opens with. gt#41's three are not in it and are
    // registered as such in ../src/engine/constants.
    const drawn = MODIFIER_IDS.filter((id) => !POST_HANDOFF_BOXES.includes(id));
    expect(Object.fromEntries(drawn.map((id) => [id, OPENING_STATE.mods[id].amount]))).toEqual({
      grit: 0.55,
      murk: 0.5,
      wobble: 0.35,
      cavern: 0.5,
    });
    // And the three that are not pinned still open on the engine's own defaults,
    // which is the check the pin would have been doing for them.
    for (const id of POST_HANDOFF_BOXES) {
      expect(OPENING_STATE.mods[id].amount, id).toBe(MODIFIER_DEFAULTS[id]);
    }
    // The nine the reference opens with, pinned whole. THROAT and LASER CANNON
    // are gt#42's and are registered in POST_HANDOFF_SOURCES for the same reason
    // and with the same care as the three boxes above.
    const nine = SOURCE_IDS.filter((each) => !POST_HANDOFF_SOURCES.includes(each));
    expect(Object.fromEntries(nine.map((id) => [id, OPENING_STATE.m[id]]))).toEqual({
      guitar: { on: true, loud: 0.65, char: 0.6, often: 0 },
      bass: { on: true, loud: 0.7, char: 0.6, often: 0 },
      slowhit: { on: true, loud: 0.6, char: 0.5, often: 2 },
      cymbal: { on: true, loud: 0.35, char: 0.4, often: 3 },
      voice: { on: false, loud: 0.55, char: 1, often: 3 },
      chainsaw: { on: false, loud: 0.4, char: 0.4, often: 0 },
      sax: { on: false, loud: 0.45, char: 0.5, often: 0 },
      maracas: { on: false, loud: 0.5, char: 0.4, often: 1 },
      cow: { on: false, loud: 0.6, char: 0.6, often: 4 },
    });
    // And the two that are not pinned open switched off, which is the check the
    // pin was doing for them: the board's opening sound is the reference's,
    // and a module the reference never had cannot be part of it.
    for (const id of POST_HANDOFF_SOURCES) {
      expect(OPENING_STATE.m[id].on, id).toBe(false);
    }
  });

  it('never opens near-silent: the two foundation modules are always on', () => {
    for (const def of zoneDefs('foundation')) expect(OPENING_STATE.m[def.id].on, def.id).toBe(true);
  });
});

describe('the reference', () => {
  it('still holds every size the board is cut to', () => {
    const pins: Array<[string, unknown, unknown]> = [
      // The plate's own grid used to be quoted here. gt#48 took THE CHAIN out of
      // the reference's 238px right-hand column and laid it along the bottom,
      // so the row is gone rather than loosened — the same bargain gt#40 struck
      // two entries below when the dome came off the board. A quote that no
      // longer describes the board is worse than no quote: it passes.
      //
      // What replaced it is not a looser string but a stricter test. The grid
      // is held to ./constants by 'the plate' above, and the capacity that grid
      // exists to provide is held to arithmetic by 'THE CHAIN has a stated
      // capacity' — which is more than the reference ever knew, since the
      // column it drew had no stated capacity at all.
      ['plate box', [BOARD.gap, BOARD.width, BOARD.padding], [10, 1440, '14px 16px 26px']],
      ['fit factor', BOARD.width, 1440],

      ['sources', [BOARD.src.areas, BOARD.src.columns, BOARD.src.rows, BOARD.src.gap], ['\'pulse voice junk\' \'found found junk\'', 'minmax(0,0.85fr) minmax(0,1fr) minmax(0,1.15fr)', 'auto auto', 10]],
      // The well's padding, the zone label's place and its lettering, and the
      // top row's larger lettering were quoted here. gt#110 took the six names
      // off the plate and gave back most of the header they sat in, so those
      // rows are gone rather than loosened — a stated departure, held by 'names
      // no well' and 'stencils nothing in a well' above.
      ['well gap', BOARD.well.gap, 9],

      ['fog', [BOARD.fog.gap, BOARD.fog.padding], [34, '10px 26px 8px']],
      ['seriousness', [BOARD.fog.serious.diameter, BOARD.fog.serious.width, BOARD.fog.serious.fontSize], [112, 150, 15]],
      ['tuning', [BOARD.fog.tuning.diameter, BOARD.fog.tuning.width, BOARD.fog.tuning.fontSize], [70, 100, 13]],
      // The dome's size and its tape's type used to be quoted here. gt#40 took the
      // dome off the board, and a hammer is not a thing the reference has — so
      // those two rows are gone rather than loosened, which is the same bargain
      // ../src/ui/words makes for a word the handoff never wrote. The hammer's own
      // geometry is held to ./constants instead, in its own suite below.
      //
      // What does survive is the column the object stands in: an object over a
      // tape strip, cut to the same gap the dome's was. That part was never about
      // the dome, and it is still the reference's.
      ['smash column', SMASH.gap, 5],
      // The hint's two rows were here, and went with the hint (gt#110).

      ['junk', [BOARD.junk.columns, BOARD.junk.gap], ['repeat(2, minmax(0,1fr))', 9]],
      // The scrap of tape's three rows were here. Thomas had the scrap off
      // the board (gt#117), so they are gone rather than loosened.
      ['foundation', [BOARD.foundation.columns, BOARD.foundation.gap], ['minmax(0,1.5fr) minmax(0,1fr)', 10]],
      ['rivets', BOARD.foundation.rivetHeight, 6],

      // SCRUB's place in the bottom corner was quoted here. gt#112 moved it to
      // the top row; how it is cut is still the reference's, in the two rows
      // below.
      ['scrub tape', [BOARD.scrub.fontSize, BOARD.scrub.padding], [11, '1px 8px']],
      ['scrub alpha', BOARD.scrub.opacity, 0.75],
    ];
    for (const [name, actual, pinned] of pins) expect(actual, name).toEqual(pinned);
  });

  it('holds one definition list per well, and no second ordering anywhere', () => {
    expect(Object.keys(SOURCE_DEFS)).toEqual([...SOURCE_IDS]);
    expect(Object.keys(MODIFIER_DEFS)).toEqual([...MODIFIER_IDS]);
    const seated = (['pulse', 'voice', 'junk', 'foundation'] as const).flatMap((id) =>
      zoneDefs(id).map((def) => def.id),
    );
    expect([...seated].sort()).toEqual([...SOURCE_IDS].sort());
  });
});

// The beat lamp (gt#83): the tempo, where it can be seen.
describe('the beat lamp', () => {
  const lamp = (handle: BoardHandle): HTMLElement =>
    handle.element.querySelector<HTMLElement>('[data-part="beat"]')!;
  const lit = (handle: BoardHandle): boolean => lamp(handle).style.background === signals.lampOn;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sits in the corner of PACE’s own column, and is nothing a hand can use', () => {
    const { handle } = build();
    const pace = handle.element.querySelector<HTMLElement>('[data-control="g.pace"]')!;

    expect(lamp(handle).parentElement).toBe(pace);
    expect(css(lamp(handle), 'position')).toBe('absolute');
    expect(css(lamp(handle), 'top')).toBe(`${BOARD.fog.beat.top}px`);
    expect(css(lamp(handle), 'right')).toBe(`${BOARD.fog.beat.right}px`);
    expect(css(lamp(handle), 'width')).toBe(`${BOARD.fog.beat.size}px`);
    // No pointer, no cursor, no word: the wire layer and the tip layer both pass
    // over it, and PACE still reads as PACE.
    expect(css(lamp(handle), 'pointer-events')).toBe('none');
    expect(lamp(handle).style.cursor).toBe('');
    expect(lamp(handle).textContent).toBe('');
  });

  it('is dark until the first beat falls', () => {
    const { handle } = build();

    expect(lamp(handle).style.background).toBe(signals.lampOff);
    expect(lamp(handle).style.boxShadow).toBe(signals.lampGlowOff);
  });

  it('lights at once on a beat, holds, and lets go', () => {
    const { handle } = build();

    handle.beat();
    expect(lit(handle)).toBe(true);
    expect(lamp(handle).style.boxShadow).toBe(signals.lampGlowOn);
    // Lit hard: nothing eases *in*.
    expect(lamp(handle).style.transition).toBe('none');

    vi.advanceTimersByTime(BOARD.fog.beat.holdMs - 1);
    expect(lit(handle)).toBe(true);

    vi.advanceTimersByTime(1);
    expect(lit(handle)).toBe(false);
    expect(lamp(handle).style.transition).toContain(`${BOARD.fog.beat.fadeMs}ms`);
  });

  it('is dark for longer than it is lit, at every tempo the board can play', () => {
    // So a faster PACE reads as faster rather than as brighter.
    const flash = BOARD.fog.beat.holdMs + BOARD.fog.beat.fadeMs;
    for (const bpm of TEMPOS) {
      expect(flash, `at ${bpm}`).toBeLessThan(60000 / bpm / 2);
    }
  });

  it('answers each beat afresh, however close together they come', () => {
    const { handle } = build();

    handle.beat();
    vi.advanceTimersByTime(BOARD.fog.beat.holdMs - 10);
    handle.beat();
    // The first beat's release must not put out the second.
    vi.advanceTimersByTime(20);
    expect(lit(handle)).toBe(true);
    vi.advanceTimersByTime(BOARD.fog.beat.holdMs);
    expect(lit(handle)).toBe(false);
  });

  it('holds steady on a stilled board rather than going dark', () => {
    // A light flashing on a clock is the motion STILLNESS exists for — and a
    // dark lamp would read as the pulse having stopped, which it has not.
    const { handle } = build();
    handle.setStill(true);

    handle.beat();
    vi.advanceTimersByTime(BOARD.fog.beat.holdMs + BOARD.fog.beat.fadeMs + 500);

    expect(lit(handle)).toBe(true);
  });

  it('is pinned lit mid-flash when the switch goes down, and flashes again when it comes up', () => {
    const { handle } = build();

    handle.beat();
    vi.advanceTimersByTime(BOARD.fog.beat.holdMs + 30);
    expect(lit(handle)).toBe(false);

    handle.setStill(true);
    expect(lit(handle)).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(lit(handle)).toBe(true);

    handle.setStill(false);
    handle.beat();
    vi.advanceTimersByTime(BOARD.fog.beat.holdMs);
    expect(lit(handle)).toBe(false);
  });

  it('stays dark on a stilled board that has never pulsed', () => {
    // Before the lever there is no beat, and STILLNESS does not invent one.
    const { handle } = build();
    handle.setStill(true);

    expect(lit(handle)).toBe(false);
  });

  it('lets go of its timer when the board is destroyed', () => {
    const { handle } = build();

    handle.beat();
    handle.destroy();
    live.splice(live.indexOf(handle), 1);
    vi.advanceTimersByTime(BOARD.fog.beat.holdMs + 10);

    // Still lit: the release never ran on a board that was no longer there.
    expect(lit(handle)).toBe(true);
  });
});

// What is on a compositor layer of its own, and why each of the two is. Neither
// can be seen in a picture of the board: they are about what the browser has to
// draw again when something on it changes, which was measured in a real one.
describe('what the plate keeps on its own layers', () => {
  it('keeps the beat lamp off the plate it is painted on', () => {
    // The one thing on the board that changes on a clock. Painted into the
    // plate, every beat was a strip of textured plate drawn again to change
    // nine pixels.
    const { handle } = build();
    const beat = part(handle.element, 'beat') as HTMLElement;
    expect(css(beat, 'will-change')).toBe('transform');
    // And it is the only lamp that is: a lamp on a plate changes when a hand
    // changes it.
    for (const lamp of parts(handle.element, 'lamp')) expect(css(lamp, 'will-change')).toBe('');
  });

  it('keeps the guard cover on one, so everything laid after it has its own', () => {
    // Load-bearing, and it does not look it. A layer here is what gives every
    // plate's grain, scratches, rust and flash a texture of their own, so a
    // strike's flash is one opacity and a turning knob repaints a row of
    // controls rather than the plate under them. Taking it away was tried:
    // fewer layers, and a third of the frame rate with MEGADRIFT up.
    const { handle } = build();
    const cover = part(handle.element, 'cover') as HTMLElement;
    expect(css(cover, 'will-change')).toBe('transform');
    // Before every plate in the document, which is what "laid after it" means.
    const first = handle.element.querySelector<HTMLElement>('[data-module]') as HTMLElement;
    expect(cover.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

// The weather reaches the parts that rust, and nothing else.
describe('the weather on the plate', () => {
  it('is written on every part that reads it, and on none that does not', () => {
    const { handle } = build();
    const reads = (node: HTMLElement): boolean => (node.getAttribute('style') ?? '').includes('var(--weather');
    const all = [...handle.element.querySelectorAll<HTMLElement>('*')];
    const readers = all.filter(reads);
    // The plate's rust and its seal, every plate's and every box's, the runs,
    // the guard: a few dozen parts of a couple of thousand.
    expect(readers.length).toBeGreaterThan(30);
    expect(readers.length).toBeLessThan(all.length / 10);

    handle.setWeather('0.250');

    for (const node of all) {
      expect(node.style.getPropertyValue('--weather'), node.dataset.part).toBe(reads(node) ? '0.250' : '');
    }
    // Not on the plate, and not on the page: a variable written above the parts
    // that read it restyles everything under it, every five seconds.
    expect(handle.element.style.getPropertyValue('--weather')).toBe('');
    expect(document.body.style.getPropertyValue('--weather')).toBe('');

    handle.setWeather('0.000');
    expect(readers.every((node) => node.style.getPropertyValue('--weather') === '0.000')).toBe(true);
  });
});

// The board is knocked, not replaced (gt#80).
describe('where the blow sends the board', () => {
  /** Every control on the plate: the parts that read the travel, and so the parts it is written on. */
  const movers = (handle: BoardHandle): HTMLElement[] => [
    ...handle.element.querySelectorAll<HTMLElement>('[data-control]'),
  ];
  /** The travel as the controls hold it — one answer if they agree, and they must. */
  const travel = (handle: BoardHandle): string => {
    const held = new Set(movers(handle).map((control) => control.style.getPropertyValue(TRAVEL_VAR)));
    expect(held.size).toBe(1);
    return [...held][0] ?? '';
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is at rest with no travel on anything', () => {
    const { handle } = build();

    expect(travel(handle)).toBe('');
  });

  it('opens the window on contact, before the caller is told to push the new board', () => {
    // The order is the feature. A transition only runs if its duration is in
    // place when the value changes, and the values change inside `onSmash`.
    let seenByCaller = '';
    const handle = createBoard({
      state: OPENING_STATE,
      onSmash: () => {
        seenByCaller = travel(handle);
      },
    });
    document.body.appendChild(handle.element);
    live.push(handle);

    handle.element.querySelector<HTMLElement>('[data-part="smash"]')!.click();
    expect(travel(handle)).toBe('');
    vi.advanceTimersByTime(SMASH.swingMs);

    expect(seenByCaller).toBe(`${SMASH.travelMs}ms`);
  });

  it('closes it again once everything has had time to arrive', () => {
    const { handle } = build();

    handle.element.querySelector<HTMLElement>('[data-part="smash"]')!.click();
    vi.advanceTimersByTime(SMASH.swingMs + SMASH.travelMs - 1);
    expect(travel(handle)).toBe(`${SMASH.travelMs}ms`);

    vi.advanceTimersByTime(1);
    expect(travel(handle)).toBe('');
  });

  it('is short enough that a hand reaching for a knob finds it still', () => {
    expect(SMASH.travelMs).toBeGreaterThan(SMASH.swingMs);
    expect(SMASH.travelMs).toBeLessThan(600);
  });

  it('lands as a cut on a stilled board, and a window already open is shut', () => {
    const { handle } = build();
    handle.setStill(true);

    handle.element.querySelector<HTMLElement>('[data-part="smash"]')!.click();
    expect(travel(handle)).toBe('');

    handle.setStill(false);
    handle.element.querySelector<HTMLElement>('[data-part="smash"]')!.click();
    vi.advanceTimersByTime(SMASH.swingMs);
    expect(travel(handle)).not.toBe('');
    handle.setStill(true);
    expect(travel(handle)).toBe('');
  });

  it('is written on every control, and on nothing above one', () => {
    // It used to be one write on the plate, read by every moving piece under
    // it. That is the fewest writes and the most work: a variable set on the
    // plate makes the browser restyle everything on it and repaint every
    // texture, three times a blow. Each control carries the duration itself,
    // and the plate and everything between is left alone.
    const { handle } = build();

    handle.element.querySelector<HTMLElement>('[data-part="smash"]')!.click();
    vi.advanceTimersByTime(SMASH.swingMs);

    const controls = movers(handle);
    expect(controls.length).toBeGreaterThan(30);
    expect(controls.every((control) => control.style.getPropertyValue(TRAVEL_VAR) === `${SMASH.travelMs}ms`)).toBe(true);
    for (const control of controls) {
      for (let above = control.parentElement; above; above = above.parentElement) {
        expect(above.style.getPropertyValue(TRAVEL_VAR), control.dataset.control).toBe('');
      }
    }
  });

  it('draws a hammer big enough to be the heaviest thing in its row', () => {
    // It shares the top row with a 112px valve wheel. The rig is as tall as
    // the row allows and no taller — the row is not to grow for it — and the
    // machine itself is taller than that, which is the point (gt#115).
    expect(RIG_HEIGHT).toBeGreaterThanOrEqual(BOARD.fog.serious.diameter);
    expect(RIG_HEIGHT).toBeLessThanOrEqual(BOARD.fog.serious.diameter + 2);
    expect(SMASH.ram.height).toBeGreaterThan(BOARD.fog.serious.diameter);
    expect(SMASH.rigWidth).toBeGreaterThan(BOARD.fog.serious.diameter);

    // The two it replaced, for scale: a 40 by 26 block on a stick, and a 50
    // by 45 block on a beam.
    const { ram, anvil } = SMASH;
    expect(ram.width * ram.height).toBeGreaterThan(50 * 45 * 5);
    expect(ram.width).toBeGreaterThanOrEqual(50 * 2);
    // An anvil it can plausibly land on: wider than the die that hits it, on
    // a block and a bed, thicker than the plate it was (16).
    expect(anvil.width).toBeGreaterThan(ram.die.width);
    expect(RIG.stand).toBeGreaterThan(16 * 1.5);
  });
});

// What comes off the blow besides the board changing (gt#115): sparks, a flare
// along the struck line, and the whole plate jolting.
describe('the blow', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const smash = (handle: BoardHandle): HTMLElement => part(zone(handle, 'fog'), 'smash') as HTMLElement;
  /** Press, and run the clock to the moment the ram lands. */
  const strike = (handle: BoardHandle): void => {
    smash(handle).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    vi.advanceTimersByTime(SMASH.swingMs);
  };
  const sparks = (handle: BoardHandle): HTMLElement[] => parts(smash(handle), 'spark');
  const jolt = (handle: BoardHandle): string => handle.element.style.getPropertyValue('translate');

  it('throws sparks off both ends of the struck line, and not before it lands', () => {
    const { handle } = build();
    const flies = sparks(handle);
    expect(flies).toHaveLength(SPARKS.count);
    for (const fly of flies) expect(fly.style.opacity).toBe('0');
    // They leave from the struck face.
    const nest = part(smash(handle), 'sparks') as HTMLElement;
    expect(css(nest, 'left')).toBe(`${RIG.strikeX}px`);
    expect(css(nest, 'top')).toBe(`${RIG.anvilTop}px`);
    expect(css(nest, 'pointer-events')).toBe('none');

    smash(handle).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    vi.advanceTimersByTime(SMASH.swingMs - 1);
    for (const fly of flies) expect(fly.style.opacity).toBe('0');

    // Contact: every spark is at one end of the die, lit, cut to its length
    // and leaning the way it will go.
    vi.advanceTimersByTime(1);
    const spray = sparkSpray(0);
    const edge = SMASH.ram.die.width / 2;
    flies.forEach((fly, i) => {
      const spark = spray[i] as (typeof spray)[number];
      const ember = fly.firstElementChild as HTMLElement;
      expect(fly.style.opacity, String(i)).toBe('1');
      // Read back as numbers: the DOM is free to write 11.0px as 11px.
      expect(parseFloat(css(fly, 'translate')), String(i)).toBeCloseTo(spark.side * edge, 1);
      expect(parseFloat(ember.style.height), String(i)).toBeCloseTo(spark.length, 1);
      expect(parseFloat(css(ember, 'rotate')), String(i)).toBeCloseTo(spark.lean, 1);
      expect(tight(css(ember, 'background')), String(i)).toBe(tight(signals.spark));
    });

    // And then thrown: out by its reach and fading, down to where it will end
    // up on a curve that goes up first.
    vi.advanceTimersByTime(1);
    flies.forEach((fly, i) => {
      const spark = spray[i] as (typeof spray)[number];
      const ember = fly.firstElementChild as HTMLElement;
      expect(fly.style.opacity, String(i)).toBe('0');
      expect(parseFloat(css(fly, 'translate')), String(i)).toBeCloseTo(
        spark.side * (edge + spark.reach),
        1,
      );
      expect(fly.style.transition, String(i)).toContain(`${spark.ms}ms`);
      expect(parseFloat(css(ember, 'translate').split(' ')[1] ?? ''), String(i)).toBeCloseTo(
        spark.fall,
        1,
      );
      // The overshoot is backward — a negative second number — which is the
      // whole of the arc.
      expect(ember.style.transition, String(i)).toMatch(/cubic-bezier\(0\.2, ?-\d/);
    });
  });

  it('throws a different spray on the next blow', () => {
    const { handle } = build();
    const shape = (): string =>
      sparks(handle)
        .map((fly) => `${css(fly, 'translate')}|${(fly.firstElementChild as HTMLElement).style.height}`)
        .join(';');
    strike(handle);
    vi.advanceTimersByTime(1);
    const first = shape();
    vi.advanceTimersByTime(SMASH.recoverMs);
    strike(handle);
    vi.advanceTimersByTime(1);
    expect(shape()).not.toBe(first);
  });

  it('lights the struck line for an instant', () => {
    const { handle } = build();
    const flare = part(smash(handle), 'flare') as HTMLElement;
    expect(flare.style.opacity).toBe('0');
    expect(css(flare, 'top')).toBe(`${RIG.anvilTop}px`);
    expect(css(flare, 'width')).toBe(`${SMASH.ram.die.width + 2 * SMASH.flare.over}px`);
    strike(handle);
    expect(flare.style.opacity).toBe('1');
    expect(flare.style.transition).toBe('none');
    vi.advanceTimersByTime(1);
    expect(flare.style.opacity).toBe('0');
    expect(flare.style.transition).toContain(`${SMASH.flare.ms}ms`);
    // A line of light, not a flash of the screen: narrower than the rig is
    // wide by more than it overhangs, and gone in a fifth of a second.
    expect(SMASH.flare.ms).toBeLessThan(200);
    expect(SMASH.flare.height).toBeLessThan(RIG.stand);
  });

  it('jolts the whole plate: down first, then back and forth, then still (gt#115)', () => {
    // Thomas: "the whole screen shakes in addition to the other existing
    // effects."
    const { handle } = build();
    const { path, stepMs } = SMASH.quake;
    expect(jolt(handle)).toBe('');

    smash(handle).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    vi.advanceTimersByTime(SMASH.swingMs - 1);
    expect(jolt(handle)).toBe('');
    // The tick of contact itself is at rest, so whatever is read off the
    // plate on being told of the blow is read where the plate is bolted.
    vi.advanceTimersByTime(1);
    expect(jolt(handle)).toBe('');

    path.forEach(([x, y], i) => {
      // A tick after contact, and then one step at a time.
      vi.advanceTimersByTime(i === 0 ? 1 : stepMs);
      expect(jolt(handle), `step ${i}`).toBe(`${x}px ${y}px`);
    });
    vi.advanceTimersByTime(stepMs);
    expect(jolt(handle)).toBe('');
    // Nothing else about the plate was touched to do it.
    expect(handle.element.style.transform).toBe('');

    // Down first, because that is the way it was hit, and dying away.
    const first = path[0] as readonly [number, number];
    expect(first[0]).toBe(0);
    expect(first[1]).toBeGreaterThan(0);
    const size = path.map(([x, y]) => Math.hypot(x, y));
    for (let i = 1; i < size.length; i++) {
      expect(size[i] as number, `step ${i}`).toBeLessThanOrEqual(size[i - 1] as number);
    }
    // Over in a third of a second, and never far.
    expect(path.length * stepMs).toBeLessThan(340);
    expect(Math.max(...size)).toBeLessThanOrEqual(10);
  });

  it('stops dead the moment a socket is pressed, and never starts with a cable in a hand', () => {
    // The reason the plate was never moved: the wire layer reads its rect at
    // the start of a drag and keeps it. So the rect a drag keeps must always
    // be the resting one.
    const touch = build();
    const { handle } = touch;
    const socket = handle.element.querySelector<HTMLElement>('[data-jack-out]') as HTMLElement;
    const { stepMs } = SMASH.quake;

    strike(handle);
    vi.advanceTimersByTime(stepMs);
    expect(jolt(handle)).not.toBe('');

    // Pressed mid-jolt: the plate is back before the press is forwarded.
    let seen = 'unset';
    const spied: BoardHandle = createBoard({
      state: OPENING_STATE,
      onJackDown: () => {
        seen = jolt(spied);
      },
    });
    live.push(spied);
    document.body.appendChild(spied.element);
    strike(spied);
    vi.advanceTimersByTime(stepMs);
    expect(jolt(spied)).not.toBe('');
    spied.element
      .querySelector<HTMLElement>('[data-jack-out]')
      ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    expect(seen).toBe('');
    expect(jolt(spied)).toBe('');
    // And the steps still to come are dropped, not merely interrupted.
    vi.advanceTimersByTime(SMASH.quake.path.length * stepMs);
    expect(jolt(spied)).toBe('');

    // With the cable still in a hand, a blow lands and the plate stays put.
    socket.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    expect(jolt(handle)).toBe('');
    const before = touch.smashes;
    strike(handle);
    expect(touch.smashes).toBe(before + 1);
    vi.advanceTimersByTime(stepMs * 2);
    expect(jolt(handle)).toBe('');
    // It does everything else a blow does.
    expect(sparks(handle).some((fly) => fly.style.transition !== 'none')).toBe(true);

    // Let go, and the next blow jolts again.
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    vi.advanceTimersByTime(SMASH.recoverMs);
    strike(handle);
    vi.advanceTimersByTime(1);
    expect(jolt(handle)).not.toBe('');
  });

  it('throws nothing and moves nothing on a stilled board, and still lands', () => {
    const touch = build();
    touch.handle.setStill(true);
    smash(touch.handle).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(touch.smashes).toBe(1);
    vi.advanceTimersByTime(SMASH.quake.stepMs * 3);
    expect(jolt(touch.handle)).toBe('');
    for (const fly of sparks(touch.handle)) expect(fly.style.opacity).toBe('0');
    expect((part(smash(touch.handle), 'flare') as HTMLElement).style.opacity).toBe('0');

    // Stilled in the middle of one: everything is put back, now.
    const moving = build();
    strike(moving.handle);
    vi.advanceTimersByTime(SMASH.quake.stepMs);
    expect(jolt(moving.handle)).not.toBe('');
    moving.handle.setStill(true);
    expect(jolt(moving.handle)).toBe('');
    for (const fly of sparks(moving.handle)) expect(fly.style.opacity).toBe('0');
    vi.advanceTimersByTime(SMASH.quake.path.length * SMASH.quake.stepMs);
    expect(jolt(moving.handle)).toBe('');
  });

  it('leaves the plate where it is bolted when the board is torn down mid-jolt', () => {
    const { handle } = build();
    strike(handle);
    vi.advanceTimersByTime(SMASH.quake.stepMs);
    expect(jolt(handle)).not.toBe('');
    handle.destroy();
    expect(jolt(handle)).toBe('');
    vi.advanceTimersByTime(SMASH.quake.path.length * SMASH.quake.stepMs);
    expect(jolt(handle)).toBe('');
  });
});

// The ring answering what is played (gt#104).
describe('the stations', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const station = (handle: BoardHandle, id: string): HTMLElement => {
    const found = parts(plateEtch(handle), 'station').find((element) => element.dataset.source === id);
    if (!found) throw new Error(`No station for ${id}.`);
    return found;
  };
  const rest = (id: keyof typeof OPENING_STATE.m): string =>
    OPENING_STATE.m[id].on ? String(BOARD.stations.on) : '0';
  const smash = (handle: BoardHandle): void => {
    part(zone(handle, 'fog'), 'smash')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  };

  it('flashes a station on its strike and lets it settle back to where it rests', () => {
    const { handle } = build();
    const mark = station(handle, 'slowhit');

    handle.strike('slowhit');
    // Up at once, with no transition to ease it there.
    expect(mark.style.transition).toBe('none');
    expect(mark.style.opacity).toBe(String(BOARD.stations.flash));

    // And released on the next turn of the loop, back to its resting light.
    vi.advanceTimersByTime(0);
    expect(mark.style.transition).toContain(`${BOARD.stations.ms}ms`);
    expect(mark.style.opacity).toBe(rest('slowhit'));
    // Nothing else moved.
    expect(station(handle, 'cymbal').style.opacity).toBe(rest('cymbal'));
  });

  it('flashes less for a quiet hit, and never below where the station rests', () => {
    const { handle } = build();
    const mark = station(handle, 'slowhit');
    const resting = Number(rest('slowhit'));

    handle.strike('slowhit', 0.5);
    const half = Number(mark.style.opacity);
    expect(half).toBeCloseTo(resting + (BOARD.stations.flash - resting) * 0.5, 3);
    vi.advanceTimersByTime(0);

    handle.strike('slowhit', 0);
    expect(Number(mark.style.opacity)).toBe(resting);
    handle.strike('slowhit', 9);
    expect(mark.style.opacity).toBe(String(BOARD.stations.flash));
  });

  it('settles to dark if its module was switched off while it was lit up', () => {
    const { handle } = build();
    const mark = station(handle, 'slowhit');
    expect(OPENING_STATE.m.slowhit.on).toBe(true);

    handle.strike('slowhit');
    handle.setState({
      ...OPENING_STATE,
      m: { ...OPENING_STATE.m, slowhit: { ...OPENING_STATE.m.slowhit, on: false } },
    });
    // The flash in flight is not cut short by the redraw…
    expect(mark.style.opacity).toBe(String(BOARD.stations.flash));
    // …and it comes down to where the station rests *now*.
    vi.advanceTimersByTime(0);
    expect(mark.style.opacity).toBe('0');
  });

  it('flashes every piece of a station, on whichever plates it crosses', () => {
    // A mark that runs off a plate onto the well is two elements and one mark.
    const { handle } = build();
    handle.element.getBoundingClientRect = () => new DOMRect(0, 0, BOARD.width, 900);
    const seat = sealSeats(BOARD.seal.size, SOURCE_IDS.length)[SOURCE_IDS.indexOf('slowhit')];
    const under = handle.modifiers.get('cavern')?.element.querySelector<HTMLElement>('[data-part="etch"]');
    if (!seat || !under) throw new Error('Nothing to seat.');
    const x = BOARD.width / 2 - BOARD.seal.size / 2 + seat.x;
    const y = 450 - BOARD.seal.size / 2 + seat.y;
    under.getBoundingClientRect = () => new DOMRect(x - 50, y - 50, 100, 100);
    handle.refit();

    const pieces = parts(handle.element, 'station').filter((element) => element.dataset.source === 'slowhit');
    expect(pieces).toHaveLength(2);

    handle.strike('slowhit');
    for (const piece of pieces) {
      expect(piece.style.transition).toBe('none');
      expect(piece.style.opacity).toBe(String(BOARD.stations.flash));
    }
    vi.advanceTimersByTime(0);
    for (const piece of pieces) expect(piece.style.opacity).toBe(rest('slowhit'));

    // And both go dark together when the module is switched off.
    handle.setState({
      ...OPENING_STATE,
      m: { ...OPENING_STATE.m, slowhit: { ...OPENING_STATE.m.slowhit, on: false } },
    });
    for (const piece of pieces) expect(piece.style.opacity).toBe('0');
  });

  it('does nothing for a source it has no station for', () => {
    const { handle } = build();
    const before = parts(handle.element, 'station').map((element) => element.style.opacity);
    expect(() => handle.strike('nonesuch')).not.toThrow();
    expect(parts(handle.element, 'station').map((element) => element.style.opacity)).toEqual(before);
  });

  it('does not flash on a stilled board, and stops a flash that was in the air', () => {
    const { handle } = build();
    const mark = station(handle, 'slowhit');

    handle.strike('slowhit');
    handle.setStill(true);
    // A flash is motion and stops. A lit station is state and stays lit.
    expect(mark.style.opacity).toBe(rest('slowhit'));

    handle.strike('slowhit');
    expect(mark.style.opacity).toBe(rest('slowhit'));
    vi.advanceTimersByTime(BOARD.stations.ms);
    expect(mark.style.opacity).toBe(rest('slowhit'));

    handle.setStill(false);
    handle.strike('slowhit');
    expect(mark.style.opacity).toBe(String(BOARD.stations.flash));
  });

  it('rings the whole seal when the hammer lands, dark stations and lit ones alike', () => {
    const { handle } = build();
    smash(handle);
    // Not on the press: the blow is the landing.
    for (const id of SOURCE_IDS) expect(station(handle, id).style.opacity, id).toBe(rest(id));

    vi.advanceTimersByTime(SMASH.swingMs);
    for (const id of SOURCE_IDS) {
      const resting = Number(rest(id));
      expect(Number(station(handle, id).style.opacity), id).toBeCloseTo(
        resting + (BOARD.stations.smash - resting),
        3,
      );
    }
    // Then every one of them back to where it rests.
    vi.advanceTimersByTime(1);
    for (const id of SOURCE_IDS) expect(station(handle, id).style.opacity, id).toBe(rest(id));
    expect(BOARD.stations.smash).toBeGreaterThan(BOARD.stations.on);
  });

  it('holds the ring to the hammer’s own flash limit', () => {
    // The same gap the plates are held to (gt#92): a second blow inside it does
    // everything else a blow does and does not flash the board again.
    const { handle } = build();
    smash(handle);
    vi.advanceTimersByTime(SMASH.swingMs);
    vi.advanceTimersByTime(1);

    smash(handle);
    vi.advanceTimersByTime(SMASH.swingMs);
    expect(SMASH.swingMs + 1).toBeLessThan(SMASH.shock.minGapMs);
    for (const id of SOURCE_IDS) expect(station(handle, id).style.opacity, id).toBe(rest(id));
  });

  it('leaves no flash waiting when the board is taken down', () => {
    const { handle } = build();
    const mark = station(handle, 'slowhit');
    handle.strike('slowhit');
    handle.destroy();
    vi.advanceTimersByTime(BOARD.stations.ms);
    // Never released, because the timer that would have released it is gone.
    expect(mark.style.transition).toBe('none');
  });
});

// The blow crossing the board (gt#92): the plates' half of the shockwave. The
// ring is tests/blooms.test.ts's.
describe('the blow crossing the board', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const WINDOW = { width: 1000, height: 800 };

  /**
   * A board whose anvil is in the top right corner and whose plates are laid
   * out along a line away from it, since nothing in happy-dom has a rect.
   */
  function laid(spec: Partial<BoardSpec> = {}): { handle: BoardHandle; ids: string[] } {
    const { handle } = build(spec);
    vi.stubGlobal('innerWidth', WINDOW.width);
    vi.stubGlobal('innerHeight', WINDOW.height);
    const anvil = handle.element.querySelector<HTMLElement>('[data-part="anvil"]')!;
    anvil.getBoundingClientRect = () => new DOMRect(990, -10, 20, 20);
    const ids = [...handle.modules.keys()];
    ids.forEach((id, at) => {
      const far = (at + 1) * 80;
      handle.modules.get(id)!.element.getBoundingClientRect = () =>
        new DOMRect(1000 - far - 10, -10, 20, 20);
    });
    return { handle, ids };
  }

  const lit = (handle: BoardHandle, id: string): number =>
    Number(
      handle.modules.get(id as never)!.element.querySelector<HTMLElement>('[data-part="flash"]')!.style
        .opacity || '0',
    );

  const swing = (handle: BoardHandle): void => {
    handle.element.querySelector<HTMLElement>('[data-part="smash"]')!.click();
    vi.advanceTimersByTime(SMASH.swingMs);
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lights nothing until the hammer lands', () => {
    const { handle, ids } = laid();

    handle.element.querySelector<HTMLElement>('[data-part="smash"]')!.click();
    vi.advanceTimersByTime(SMASH.swingMs - 1);

    for (const id of ids) expect(lit(handle, id), id).toBe(0);
  });

  it('reaches the nearest plate first and the farthest last', () => {
    const { handle, ids } = laid();
    const radius = Math.hypot(1000, 800);
    const first = ids[0]!;
    const last = ids[ids.length - 1]!;

    swing(handle);
    // The front is one plate out. The nearest has been reached and the
    // farthest has not.
    vi.advanceTimersByTime(Math.round((SMASH.shock.ms * 80) / radius));
    expect(lit(handle, first)).toBeGreaterThan(0);
    expect(lit(handle, last)).toBe(0);

    vi.advanceTimersByTime(SMASH.shock.ms);
    // Every plate was reached, and in order of distance.
    const seen: string[] = [];
    const again = laid();
    for (const id of again.ids) {
      const flash = again.handle.modules.get(id as never)!.flash;
      again.handle.modules.get(id as never)!.flash = (strength?: number) => {
        seen.push(id);
        flash(strength);
      };
    }
    vi.advanceTimersByTime(SMASH.shock.minGapMs);
    swing(again.handle);
    vi.advanceTimersByTime(SMASH.shock.ms);
    expect(seen).toEqual(again.ids);
  });

  it('hits the near plates harder than the far ones', () => {
    const { handle, ids } = laid();
    const strengths = new Map<string, number>();
    for (const id of ids) {
      handle.modules.get(id as never)!.flash = (strength = 1) => {
        strengths.set(id, strength);
      };
    }

    swing(handle);
    vi.advanceTimersByTime(SMASH.shock.ms);

    const first = strengths.get(ids[0]!) ?? NaN;
    const last = strengths.get(ids[ids.length - 1]!) ?? NaN;
    expect(first).toBeGreaterThan(last);
    expect(first).toBeLessThanOrEqual(1);
    expect(last).toBeGreaterThanOrEqual(1 - SMASH.shock.falloff);
  });

  it('does not light the plates twice inside the gap, however fast it is hammered', () => {
    const { handle, ids } = laid();
    let flashes = 0;
    for (const id of ids) {
      handle.modules.get(id as never)!.flash = () => {
        flashes += 1;
      };
    }

    // Two blows as fast as the hammer can land them: back to back.
    swing(handle);
    swing(handle);
    vi.advanceTimersByTime(SMASH.shock.ms);
    expect(flashes).toBe(ids.length);

    // And once the gap has passed, the next one lights them again.
    vi.advanceTimersByTime(SMASH.shock.minGapMs);
    swing(handle);
    vi.advanceTimersByTime(SMASH.shock.ms);
    expect(flashes).toBe(ids.length * 2);
  });

  it('still tells the caller about a blow that lit nothing', () => {
    const touch = build();
    const smash = touch.handle.element.querySelector<HTMLElement>('[data-part="smash"]')!;

    for (let blow = 0; blow < 2; blow += 1) {
      smash.click();
      vi.advanceTimersByTime(SMASH.swingMs);
    }

    expect(touch.smashes).toBe(2);
  });

  it('lights nothing on a stilled board, and takes back what was still on its way', () => {
    const { handle, ids } = laid();
    let flashes = 0;
    for (const id of ids) {
      handle.modules.get(id as never)!.flash = () => {
        flashes += 1;
      };
    }

    swing(handle);
    handle.setStill(true);
    vi.advanceTimersByTime(SMASH.shock.ms);
    // Nothing that had not already been reached at contact.
    const reached = flashes;
    expect(reached).toBeLessThan(ids.length);

    vi.advanceTimersByTime(SMASH.shock.minGapMs);
    swing(handle);
    vi.advanceTimersByTime(SMASH.shock.ms);
    expect(flashes).toBe(reached);
  });

  it('moves nothing itself: once the blow’s own jolt is over, nothing carries a transform for it', () => {
    const { handle, ids } = laid();

    swing(handle);
    vi.advanceTimersByTime(SMASH.shock.ms / 2);

    expect(handle.element.style.transform).toBe('');
    expect(handle.element.style.getPropertyValue('translate')).toBe('');
    for (const id of ids) {
      const plate = handle.modules.get(id as never)!.element;
      expect(plate.style.transform, id).toBe('');
      expect(plate.style.getPropertyValue('translate'), id).toBe('');
    }
  });
});
