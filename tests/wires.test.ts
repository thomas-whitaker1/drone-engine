// @vitest-environment happy-dom
//
// The patch cables. Three separable things live in this file and they are tested
// as three, because only one of them needs a DOM at all:
//
// - **The curve** is arithmetic. Two points in, one path string out.
// - **The rules** are a fact about a list of wires. No drag, no elements.
// - **The layer** is the part that has to touch the board: it measures live jacks,
//   draws four strokes per cable, and turns a pointer gesture into a connection.
//
// Every jack rect is stubbed, because happy-dom lays nothing out and returns
// zeroes for all of them. That is not a workaround — it is the whole point of the
// measurement half: what these tests pin down is the *conversion*, from a client
// rect at some zoom to a coordinate in board space, and stubbed rects are how you
// state the input to it.
//
// The geometry is pinned to the original design's board the way the engine
// suite pins its engine: a slipped digit fails here rather than surviving until
// someone notices the cables hang wrong.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WIRE } from '../src/ui/constants';
import { canConnect, createWireLayer, fedBy, sagPath } from '../src/ui';
import {
  cableAt,
  cableLength,
  claimed,
  distanceToCable,
  liveSet,
  sagControl,
  sagCurve,
  wrapAt,
} from '../src/ui/wires';
import type { WireLayerHandle, WireLayerSpec } from '../src/ui';
import type { Wire } from '../src/engine';
import { ink, jack as jackTokens, signals, sourceKey, TAPE_WRAP, tapeWrap, turnPoints } from '../src/tokens';

/** Where the fake plate sits on screen, and what the fake jacks are measured off. */
const PLATE = { left: 20, top: 10, width: 1440, height: 900 } as const;

const live: WireLayerHandle[] = [];
let realElementFromPoint: typeof document.elementFromPoint;

/** Pin an element's client rect, since happy-dom lays nothing out. */
function stub(element: Element, left: number, top: number, width: number, height: number): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: (): DOMRect =>
      ({
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        toJSON: () => '',
      }) as DOMRect,
  });
}

/**
 * A fake plate at a given zoom, with its own rect pinned.
 *
 * The rect is stubbed at the *drawn* size — a 1440px design at `fit` 0.5 covers
 * 720 client pixels — because that is the only geometry a browser can actually
 * produce, and since gt#22 it is also the geometry the layer reads its scale out
 * of. `--fit` is still written to the body, so a test can prove the layer does
 * not consult it.
 */
function plate(fit = 1): HTMLElement {
  const board = document.createElement('div');
  document.body.appendChild(board);
  document.body.style.setProperty('--fit', String(fit));
  stub(board, PLATE.left, PLATE.top, PLATE.width * fit, PLATE.height * fit);
  return board;
}

/**
 * One jack on that plate, tagged the way ../src/ui/module and ../src/ui/modifier
 * tag theirs, centred on a client-space point.
 */
function jack(board: HTMLElement, end: 'in' | 'out', id: string, cx: number, cy: number): HTMLElement {
  const element = document.createElement('div');
  element.setAttribute(`data-jack-${end}`, id);
  board.appendChild(element);
  stub(element, cx - 11, cy - 11, 22, 22);
  return element;
}

/** The board-space coordinate a jack centred on this client point maps to. */
const inBoard = (cx: number, cy: number, fit = 1) => ({
  x: (cx - PLATE.left) / fit,
  y: (cy - PLATE.top) / fit,
});

/** A layer over a plate carrying GUITAR WALL's OUT and every box's IN. */
function build(
  spec: Omit<WireLayerSpec, 'board'> = {},
  fit = 1,
): { layer: WireLayerHandle; board: HTMLElement; connects: Wire[]; removed: number[] } {
  const board = plate(fit);
  jack(board, 'out', 'guitar', 100, 400);
  jack(board, 'out', 'bass', 100, 500);
  jack(board, 'out', 'grit', 900, 200);
  jack(board, 'out', 'murk', 900, 300);
  jack(board, 'in', 'grit', 700, 200);
  jack(board, 'in', 'murk', 700, 300);
  jack(board, 'in', 'cavern', 700, 400);

  const connects: Wire[] = [];
  const removed: number[] = [];
  const layer = createWireLayer({
    board,
    onConnect: (wire) => connects.push(wire),
    onDisconnect: (index) => removed.push(index),
    ...spec,
  });
  board.appendChild(layer.element);
  live.push(layer);
  return { layer, board, connects, removed };
}

/**
 * Every cable, in list order — the stroke that is the cable itself, which is the
 * one that carries its wire's index. It was an invisible click band laid over
 * the cable until gt#72, and it is still called `hits` because every case below
 * asks it the same question: where was this cable drawn.
 */
const hits = (layer: WireLayerHandle): SVGPathElement[] =>
  [...layer.element.querySelectorAll<SVGPathElement>('[data-wire]')];

/**
 * A point on the cable between two jacks, in client space: `t` of the way along
 * it. The jacks are given the way {@link jack} takes them, as client points.
 */
function onCable(
  from: { x: number; y: number },
  to: { x: number; y: number },
  t = 0.5,
  fit = 1,
): { x: number; y: number } {
  const a = inBoard(from.x, from.y, fit);
  const b = inBoard(to.x, to.y, fit);
  const c = sagControl(a, b);
  const u = 1 - t;
  return {
    x: (u * u * a.x + 2 * u * t * c.x + t * t * b.x) * fit + PLATE.left,
    y: (u * u * a.y + 2 * u * t * c.y + t * t * b.y) * fit + PLATE.top,
  };
}

/** One pointer event at a client point, bubbling the way a real one does. */
const pointer = (type: string, at: { x: number; y: number }, init: PointerEventInit = {}): PointerEvent =>
  new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: at.x, clientY: at.y, ...init });

/** Press and let go at one point, on whatever is there. */
function tap(target: Element, at: { x: number; y: number }): void {
  target.dispatchEvent(pointer('pointerdown', at));
  target.dispatchEvent(pointer('pointerup', at));
}

/** Where `build` puts the jacks, as the client points it centres them on. */
const AT = {
  guitar: { x: 100, y: 400 },
  bass: { x: 100, y: 500 },
  grit: { x: 700, y: 200 },
  murk: { x: 700, y: 300 },
} as const;

/** A colour as the DOM hands it back from an inline style. */
const cssColour = (value: string): string => {
  const probe = document.createElement('div');
  probe.style.color = value;
  return probe.style.color;
};

/** Every wrap of tape, in list order, by the source it was wound off. */
const junctions = (layer: WireLayerHandle): SVGGElement[] =>
  [...layer.element.querySelectorAll<SVGGElement>('[data-mark]')];

/** The two numbers a `translate(x y) …` transform starts with. */
const seatOf = (mark: SVGGElement): { x: number; y: number } => {
  const [, x, y] = /translate\((-?[\d.]+) (-?[\d.]+)\)/.exec(mark.getAttribute('transform') ?? '') ?? [];
  return { x: Number(x), y: Number(y) };
};

/** The temp wire — the dashed one, which is the only path outside the group. */
const temp = (layer: WireLayerHandle): SVGPathElement =>
  layer.element.querySelector<SVGPathElement>(':scope > path')!;

/** Press an OUT jack, drag to a client point, and release over whatever is there. */
function drag(
  layer: WireLayerHandle,
  from: string,
  to: { x: number; y: number },
  over: Element | null,
  button = 0,
): void {
  layer.beginDrag(from, new PointerEvent('pointerdown', { button, cancelable: true }));
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: to.x, clientY: to.y }));
  document.elementFromPoint = ((): Element | null => over) as typeof document.elementFromPoint;
  window.dispatchEvent(new PointerEvent('pointerup', { clientX: to.x, clientY: to.y }));
}

beforeEach(() => {
  vi.useFakeTimers();
  realElementFromPoint = document.elementFromPoint;
});

afterEach(() => {
  for (const layer of live.splice(0)) layer.destroy();
  document.elementFromPoint = realElementFromPoint;
  document.body.innerHTML = '';
  document.body.style.removeProperty('--fit');
  vi.useRealTimers();
});

describe('the curve a cable hangs in', () => {
  it('drops the control point below both ends, further the further it reaches', () => {
    const near = sagPath({ x: 0, y: 0 }, { x: 10, y: 0 });
    const far = sagPath({ x: 0, y: 0 }, { x: 1000, y: 0 });

    // 34 + 10 × .1 = 35, and 34 + 1000 × .1 = 134: the same cable, spanning more.
    expect(near).toBe('M0.0 0.0 Q 5.0 35.0 10.0 0.0');
    expect(far).toBe('M0.0 0.0 Q 500.0 134.0 1000.0 0.0');
  });

  it('hangs below the lower of the two jacks, not below their average', () => {
    // A cable between jacks at different heights still sags past both, or it
    // would read as pulled taut across the lower one.
    expect(sagPath({ x: 0, y: 0 }, { x: 0, y: 200 })).toBe('M0.0 0.0 Q 0.0 234.0 0.0 200.0');
  });

  it('is cut to the sag the reference hangs its cables at', () => {
    expect([WIRE.sagBase, WIRE.sagPerPx]).toEqual([34, 0.1]);
  });
});

describe('whether a wire may be added', () => {
  const patch: Wire[] = [
    { from: 'guitar', to: 'grit' },
    { from: 'grit', to: 'cavern' },
  ];

  it('refuses to let anything feed itself', () => {
    expect(canConnect(patch, 'grit', 'grit')).toBe(false);
  });

  it('refuses a pair that is already patched', () => {
    expect(canConnect(patch, 'guitar', 'grit')).toBe(false);
    // The same source into a different box is a different wire, and fine.
    expect(canConnect(patch, 'guitar', 'murk')).toBe(true);
  });

  it('lets a box feed another box', () => {
    expect(canConnect(patch, 'murk', 'cavern')).toBe(true);
  });

  it('refuses a wire that would close a loop, however far around', () => {
    // cavern already hears grit, so grit hearing cavern is feedback.
    expect(canConnect(patch, 'cavern', 'grit')).toBe(false);

    const chain: Wire[] = [
      { from: 'grit', to: 'murk' },
      { from: 'murk', to: 'wobble' },
      { from: 'wobble', to: 'cavern' },
    ];
    expect(canConnect(chain, 'cavern', 'grit')).toBe(false);
    // …and the same three boxes, joined the way the signal already runs, is not.
    expect(canConnect(chain, 'grit', 'cavern')).toBe(true);
  });

  it('is not confused by a patch that already forks and rejoins', () => {
    const forked: Wire[] = [
      { from: 'grit', to: 'murk' },
      { from: 'grit', to: 'wobble' },
      { from: 'murk', to: 'cavern' },
      { from: 'wobble', to: 'cavern' },
    ];
    expect(canConnect(forked, 'cavern', 'murk')).toBe(false);
    expect(canConnect(forked, 'guitar', 'cavern')).toBe(true);
  });
});

describe('the tape round a cable', () => {
  // gt#107. The figure gt#36 drew on every cable was a sigil at twelve pixels,
  // which is a cross beside a wire. A cable that has been pulled about for
  // years has tape on it.
  const landingOf = { grit: inBoard(700, 200), murk: inBoard(700, 300) } as const;
  const out = inBoard(AT.guitar.x, AT.guitar.y);

  it('winds one wrap per cable, off the source rather than the box', () => {
    // The box's lamp already says *fed*, and says it exactly as brightly for
    // four cables as for one. Two cables into one box come from two sources,
    // so they are wound differently and taped at different places.
    const { layer } = build({
      wires: [
        { from: 'guitar', to: 'grit' },
        { from: 'bass', to: 'grit' },
      ],
    });

    expect(junctions(layer).map((mark) => mark.dataset.mark)).toEqual(['guitar', 'bass']);
    const [first, second] = junctions(layer);
    expect(first?.innerHTML).not.toBe(second?.innerHTML);
    expect(seatOf(first as SVGGElement)).not.toEqual(seatOf(second as SVGGElement));
    expect(tapeWrap(sourceKey('guitar'))).not.toEqual(tapeWrap(sourceKey('bass')));
  });

  it('sits on the cable itself, a little way back from where it lands', () => {
    const { layer } = build({ wires: [{ from: 'guitar', to: 'grit' }] });
    const mark = junctions(layer)[0] as SVGGElement;
    const seat = seatOf(mark);
    const wrap = tapeWrap(sourceKey('guitar'));

    // On the curve, not beside it: tape is wound round the cable.
    expect(distanceToCable(seat, sagCurve(out, landingOf.grit))).toBeLessThan(0.3);
    // About `back` from the jack — the straight line is a little shorter than
    // the way along the cable — and never on the plug.
    const away = Math.hypot(seat.x - landingOf.grit.x, seat.y - landingOf.grit.y);
    expect(away).toBeLessThanOrEqual(wrap.back + 0.1);
    expect(away).toBeGreaterThan(wrap.back * 0.8);
    expect(wrap.back).toBeGreaterThanOrEqual(TAPE_WRAP.minBack);
    expect(TAPE_WRAP.minBack).toBeGreaterThan(20);
    // And below the jack, because the cable sags and arrives from underneath.
    expect(seat.y).toBeGreaterThan(landingOf.grit.y);
  });

  it('lies along the cable, whichever way the cable is running there', () => {
    const { layer } = build({ wires: [{ from: 'guitar', to: 'grit' }] });
    const mark = junctions(layer)[0] as SVGGElement;
    const turned = Number(/rotate\((-?[\d.]+)\)/.exec(mark.getAttribute('transform') ?? '')?.[1]);
    const wrap = tapeWrap(sourceKey('guitar'));

    // The direction between two points of the curve either side of the seat.
    const before = wrapAt(out, landingOf.grit, wrap.back + 2);
    const after = wrapAt(out, landingOf.grit, wrap.back - 2);
    const running = (Math.atan2(after.y - before.y, after.x - before.x) * 180) / Math.PI;
    expect(turned).toBeCloseTo(running, 0);
    expect(turned).toBeCloseTo(wrapAt(out, landingOf.grit, wrap.back).angle, 1);
  });

  it('never seats a wrap past the middle of a short cable', () => {
    // Past the middle it would be nearer the jack it left than the one it
    // lands in, and a long way back up a short cable is exactly that.
    const a = { x: 0, y: 0 };
    const b = { x: 30, y: 0 };
    const far = wrapAt(a, b, 5000);
    const curve = sagCurve(a, b);
    const middle = {
      x: 0.25 * a.x + 0.5 * curve.c.x + 0.25 * b.x,
      y: 0.25 * a.y + 0.5 * curve.c.y + 0.25 * b.y,
    };
    expect(far.x).toBeCloseTo(middle.x, 5);
    expect(far.y).toBeCloseTo(middle.y, 5);
    // And at no distance at all it is the landing.
    const none = wrapAt(a, b, 0);
    expect(none.x).toBeCloseTo(b.x, 5);
    expect(none.y).toBeCloseTo(b.y, 5);
  });

  it('is wound in the board’s own tape: a strip per turn, a lit top and a dark underside', () => {
    const { layer } = build({ wires: [{ from: 'guitar', to: 'grit' }] });
    const mark = junctions(layer)[0] as SVGGElement;
    const wrap = tapeWrap(sourceKey('guitar'));
    const pieces = [...mark.children] as SVGElement[];
    const kind = (name: string): SVGElement[] => pieces.filter((piece) => piece.dataset.turn === name);
    const strips = pieces.filter((piece) => piece.dataset.turn === 'tape' || piece.dataset.turn === 'scrap');

    // In the order they were wound, so a later turn lies over an earlier one.
    expect(strips).toHaveLength(wrap.turns.length);
    strips.forEach((strip, i) => {
      const turn = wrap.turns[i];
      expect(strip.tagName.toLowerCase()).toBe('polygon');
      expect(strip.getAttribute('points')).toBe(turnPoints(turn as never));
      expect(strip.dataset.turn).toBe(turn?.scrap ? 'scrap' : 'tape');
      expect(strip.style.fill.replace(/\s/g, '')).toBe(
        cssColour(turn?.scrap ? ink.tapeScrap : ink.tape).replace(/\s/g, ''),
      );
    });
    // A flap only where the end has lifted.
    expect(kind('tail')).toHaveLength(wrap.tail ? 1 : 0);
    // Round, not flat: one stroke of light above the cable and one of shade below.
    const [shine] = kind('shine');
    const [shade] = kind('shade');
    const yOf = (path?: SVGElement): number => Number(/M-?[\d.]+ (-?[\d.]+)L/.exec(path?.getAttribute('d') ?? '')?.[1]);
    expect(yOf(shine)).toBeLessThan(0);
    expect(yOf(shade)).toBeGreaterThan(0);
    expect(Math.abs(yOf(shine))).toBeLessThan(TAPE_WRAP.across);
    expect(yOf(shade)).toBeLessThan(TAPE_WRAP.across);
    // Nothing drawn as a figure any more, and nothing typed.
    expect(mark.querySelector('text')).toBeNull();
    expect(pieces.length).toBe(wrap.turns.length + (wrap.tail ? 1 : 0) + 2);
  });

  it('is redrawn with the cables, and never left where a cable was', () => {
    // Drawn inside `measure`, so it is re-read exactly as often as the
    // endpoints it hangs off.
    const { layer } = build({ wires: [{ from: 'guitar', to: 'grit' }] });
    expect(junctions(layer)).toHaveLength(1);

    layer.setWires([{ from: 'bass', to: 'murk' }]);
    expect(junctions(layer).map((mark) => mark.dataset.mark)).toEqual(['bass']);
    // On the new cable, near MURK's socket and not GRIT's.
    const moved = seatOf(junctions(layer)[0] as SVGGElement);
    const wrap = tapeWrap(sourceKey('bass'));
    expect(Math.hypot(moved.x - landingOf.murk.x, moved.y - landingOf.murk.y)).toBeLessThanOrEqual(wrap.back + 0.1);
    expect(Math.hypot(moved.x - landingOf.grit.x, moved.y - landingOf.grit.y)).toBeGreaterThan(wrap.back);

    layer.setWires([]);
    expect(junctions(layer)).toHaveLength(0);
  });

  it('tapes nothing while a cable is only being dragged', () => {
    // A cable in the hand is not a cable somebody has had to mend.
    const { layer, board } = build();
    expect(junctions(layer)).toHaveLength(0);
    layer.beginDrag('guitar', new PointerEvent('pointerdown', { button: 0, cancelable: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 500, clientY: 300 }));
    expect(junctions(layer)).toHaveLength(0);
    expect(board).toBeTruthy();
  });

  it('winds the same source’s cable the same way on every board', () => {
    // The first law, reaching the repairs: nothing is randomised at runtime.
    const first = build({ wires: [{ from: 'guitar', to: 'grit' }] });
    const second = build({ wires: [{ from: 'guitar', to: 'cavern' }] });
    expect(junctions(first.layer)[0]?.innerHTML).toBe(junctions(second.layer)[0]?.innerHTML);
  });
});

describe('which boxes the patch feeds', () => {
  it('names every box a wire ends at, and no other', () => {
    const fed = fedBy([
      { from: 'guitar', to: 'grit' },
      { from: 'grit', to: 'cavern' },
      { from: 'bass', to: 'grit' },
    ]);

    // Two boxes, not three wires: a box fed twice is fed once as far as its lamp
    // is concerned.
    expect([...fed].sort()).toEqual(['cavern', 'grit']);
    expect(fed.has('wobble')).toBe(false);
  });
});

describe('the wire layer', () => {
  it('sits over the whole plate and catches nothing itself', () => {
    const { layer } = build();

    expect(layer.element.style.zIndex).toBe(String(WIRE.zIndex));
    expect(layer.element.style.pointerEvents).toBe('none');
    // Without this a cable that hangs below the plate is clipped off at its edge.
    expect(layer.element.style.overflow).toBe('visible');
    expect(WIRE.zIndex).toBe(60);
  });

  it('draws one cable as three stacked strokes, and nothing over them to catch a click', () => {
    const { layer } = build({ wires: [{ from: 'guitar', to: 'grit' }] });

    // The cable's own strokes, which are the direct children of the first group
    // — not `g > path`, which since gt#36 also catches the junction mark's strokes
    // in the group beside it.
    const group = layer.element.querySelector('g') as SVGGElement;
    const paths = [...group.children].filter(
      (node): node is SVGPathElement => node.tagName === 'path',
    );
    // Three, where there were four. The fourth was an invisible 14px band that
    // took the click — and took it from whatever the cable hung across (gt#72).
    expect(paths).toHaveLength(3);
    expect(paths.map((path) => path.style.strokeWidth)).toEqual(
      WIRE.strokes.map((width) => `${width}px`),
    );
    expect(paths.map((path) => path.style.stroke)).toEqual([
      signals.wireShadow,
      signals.wireCore,
      signals.wireHighlight,
    ]);
    // All three are the same curve — a shadow that missed would read as a second cable.
    const drawn = new Set(paths.map((path) => path.getAttribute('d')));
    expect(drawn.size).toBe(1);
    // Nothing here asks for the pointer, so all of it inherits the layer's
    // refusal, and none of it shows a hand.
    expect(paths.every((path) => path.style.pointerEvents === '')).toBe(true);
    expect(paths.every((path) => path.style.cursor === '')).toBe(true);
    // The middle stroke is the cable, and the only one that says which wire it is.
    expect(paths.map((path) => path.dataset.wire)).toEqual([undefined, '0', undefined]);
  });

  it('reads both endpoints off the live jacks, in board space', () => {
    const { layer } = build({ wires: [{ from: 'guitar', to: 'grit' }] });

    expect(hits(layer)[0]?.getAttribute('d')).toBe(
      sagPath(inBoard(100, 400), inBoard(700, 200)),
    );
  });

  it('divides those endpoints back out of the board’s zoom', () => {
    const { layer } = build({ wires: [{ from: 'guitar', to: 'grit' }] }, 0.5);

    // The plate is drawn at half size, so a jack 80px right of its origin on
    // screen is 160px right of it on the board the cable is drawn on.
    expect(hits(layer)[0]?.getAttribute('d')).toBe(
      sagPath(inBoard(100, 400, 0.5), inBoard(700, 200, 0.5)),
    );
  });

  it('takes that zoom off the plate it can see, not off the variable that set it', () => {
    // The point of gt#22. `--fit` is what the stylesheet was *told*; the rect is
    // what the browser actually did with it, and only one of the two is a fact.
    // Lie to the layer through the variable and the cables must not move.
    const { layer, board } = build({ wires: [{ from: 'guitar', to: 'grit' }] }, 0.5);
    const drawn = hits(layer)[0]?.getAttribute('d');

    document.body.style.setProperty('--fit', '1');
    layer.measure();
    expect(hits(layer)[0]?.getAttribute('d')).toBe(drawn);

    document.body.style.removeProperty('--fit');
    layer.measure();
    expect(hits(layer)[0]?.getAttribute('d')).toBe(drawn);

    // And it is the right answer, not merely a stable one: the half-size plate.
    expect(drawn).toBe(sagPath(inBoard(100, 400, 0.5), inBoard(700, 200, 0.5)));
    expect(board.getBoundingClientRect().width).toBe(PLATE.width * 0.5);
  });

  it('reads 1:1 off a plate that was never scaled at all', () => {
    // An engine that ignores `zoom` entirely draws the board at 1440 and leaves
    // the cables right, which is the same thing this measurement says. The old
    // reader would have divided by 0.5 here and hung every cable off its socket.
    const board = document.createElement('div');
    document.body.appendChild(board);
    document.body.style.setProperty('--fit', '0.5');
    stub(board, PLATE.left, PLATE.top, PLATE.width, PLATE.height);
    jack(board, 'out', 'guitar', 100, 400);
    jack(board, 'in', 'grit', 700, 200);

    const layer = createWireLayer({ board, wires: [{ from: 'guitar', to: 'grit' }] });
    live.push(layer);

    expect(hits(layer)[0]?.getAttribute('d')).toBe(sagPath(inBoard(100, 400), inBoard(700, 200)));
  });

  it('draws nothing for a wire whose ends are not both on the board', () => {
    // Not an error: the engine still routes it, and gt#19 patches boxes this layer
    // may not have been shown yet.
    const { layer } = build({ wires: [{ from: 'guitar', to: 'nowhere' }] });

    expect(hits(layer)).toHaveLength(0);
  });

  it('redraws from the live jacks when it is told to measure again', () => {
    const { layer, board } = build({ wires: [{ from: 'guitar', to: 'grit' }] });
    const before = hits(layer)[0]?.getAttribute('d');

    const moved = board.querySelector('[data-jack-out="guitar"]')!;
    stub(moved, 289, 589, 22, 22);
    layer.measure();

    expect(hits(layer)[0]?.getAttribute('d')).not.toBe(before);
    expect(hits(layer)[0]?.getAttribute('d')).toBe(sagPath(inBoard(300, 600), inBoard(700, 200)));
  });

  it('measures when it is told to and never on a clock of its own', () => {
    // It used to re-measure across a ladder of five timeouts, as a guess at when
    // the webfonts would land (gt#47). The arrival is reported now — ../src/fonts
    // tells the seam, the seam calls `measure` — so a layer left alone for as
    // long as the old ladder ran has drawn nothing new.
    const { layer, board } = build({ wires: [{ from: 'guitar', to: 'grit' }] });
    const drawn = hits(layer)[0]?.getAttribute('d');

    stub(board.querySelector('[data-jack-out="guitar"]')!, 289, 589, 22, 22);
    vi.advanceTimersByTime(10_000);
    expect(hits(layer)[0]?.getAttribute('d')).toBe(drawn);

    layer.measure();
    expect(hits(layer)[0]?.getAttribute('d')).toBe(sagPath(inBoard(300, 600), inBoard(700, 200)));
  });

  it('draws a new patch when it is given one', () => {
    const { layer } = build();
    expect(hits(layer)).toHaveLength(0);

    layer.setWires([
      { from: 'guitar', to: 'grit' },
      { from: 'bass', to: 'murk' },
    ]);

    expect(hits(layer)).toHaveLength(2);
  });
});

describe('dragging a cable out of a jack', () => {
  it('trails a dashed wire from the socket to the cursor', () => {
    const { layer } = build();

    layer.beginDrag('guitar', new PointerEvent('pointerdown', { button: 0, cancelable: true }));
    expect(temp(layer).style.display).toBe('none');

    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 600 }));

    expect(temp(layer).style.display).toBe('block');
    expect(temp(layer).style.strokeDasharray).toBe(WIRE.tempDash);
    expect(temp(layer).style.stroke).toBe(signals.wireTemp);
    expect(temp(layer).getAttribute('d')).toBe(sagPath(inBoard(100, 400), inBoard(400, 600)));
  });

  it('keeps that wire under the cursor on a scaled-down plate', () => {
    // The drag reads the same measured factor the endpoints do, so the loose end
    // stays on the pointer rather than drifting away from it as the window
    // narrows — the failure gt#22 was filed to rule out.
    const { layer } = build({}, 0.5);

    layer.beginDrag('guitar', new PointerEvent('pointerdown', { button: 0, cancelable: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 600 }));

    expect(temp(layer).getAttribute('d')).toBe(
      sagPath(inBoard(100, 400, 0.5), inBoard(400, 600, 0.5)),
    );
  });

  it('connects when it is released over an IN jack', () => {
    const { layer, board, connects } = build();
    const target = board.querySelector('[data-jack-in="cavern"]')!;

    drag(layer, 'guitar', { x: 700, y: 400 }, target);

    expect(connects).toEqual([{ from: 'guitar', to: 'cavern' }]);
    // The layer reports the drop; it does not draw the cable itself.
    expect(hits(layer)).toHaveLength(0);
    expect(temp(layer).style.display).toBe('none');
  });

  it('finds the jack under a child of it, not only the socket', () => {
    const { layer, board, connects } = build();
    const target = board.querySelector('[data-jack-in="murk"]')!;
    const inner = document.createElement('span');
    target.appendChild(inner);

    drag(layer, 'guitar', { x: 700, y: 300 }, inner);

    expect(connects).toEqual([{ from: 'guitar', to: 'murk' }]);
  });

  it('is never what the pointer finds, so nothing has to be hidden to find the drop', () => {
    const { layer, board } = build();
    const target = board.querySelector('[data-jack-in="grit"]')!;
    let shownDuringTest: string | null = null;

    layer.beginDrag('guitar', new PointerEvent('pointerdown', { button: 0, cancelable: true }));
    document.elementFromPoint = ((): Element | null => {
      shownDuringTest = layer.element.style.display;
      return target;
    }) as typeof document.elementFromPoint;
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 700, clientY: 200 }));

    // It used to hide itself for this one call, because its cables carried a
    // click band that would otherwise have been the answer. The whole layer is
    // transparent to the pointer now, so the jack is simply what is there.
    expect(shownDuringTest).toBe('');
    expect(layer.element.style.pointerEvents).toBe('none');
  });

  it('does nothing when it is released over anything else', () => {
    const { layer, connects } = build();

    drag(layer, 'guitar', { x: 40, y: 40 }, document.body);

    expect(connects).toEqual([]);
    expect(temp(layer).style.display).toBe('none');
  });

  it('refuses a drop the rules refuse', () => {
    const { layer, board, connects } = build({ wires: [{ from: 'guitar', to: 'grit' }] });

    // Already patched.
    drag(layer, 'guitar', { x: 700, y: 200 }, board.querySelector('[data-jack-in="grit"]'));
    // Itself.
    drag(layer, 'grit', { x: 700, y: 200 }, board.querySelector('[data-jack-in="grit"]'));

    expect(connects).toEqual([]);
  });

  it('refuses a drop that would close a loop', () => {
    const { layer, board, connects } = build({
      wires: [
        { from: 'grit', to: 'murk' },
        { from: 'murk', to: 'cavern' },
      ],
    });

    drag(layer, 'murk', { x: 700, y: 200 }, board.querySelector('[data-jack-in="grit"]'));

    expect(connects).toEqual([]);
  });

  it('ignores anything but the left button', () => {
    const { layer, board, connects } = build();

    drag(layer, 'guitar', { x: 700, y: 200 }, board.querySelector('[data-jack-in="grit"]'), 2);

    expect(temp(layer).style.display).toBe('none');
    expect(connects).toEqual([]);
  });

  it('lets go of the window the moment the button comes up', () => {
    const { layer, board } = build();
    drag(layer, 'guitar', { x: 700, y: 200 }, board.querySelector('[data-jack-in="grit"]'));
    const parked = temp(layer).getAttribute('d');

    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 1200, clientY: 800 }));

    expect(temp(layer).getAttribute('d')).toBe(parked);
    expect(temp(layer).style.display).toBe('none');
  });

  it('lets go of a drag still in flight when the layer is destroyed', () => {
    const { layer, connects } = build();

    layer.beginDrag('guitar', new PointerEvent('pointerdown', { button: 0, cancelable: true }));
    layer.destroy();
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 600 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 700, clientY: 200 }));

    expect(temp(layer).style.display).toBe('none');
    expect(connects).toEqual([]);
  });
});

// While a cable is in the hand, the board says where it may land (gt#77).
describe('where a carried cable may land', () => {
  /** What a socket wore before anything lit it — set here as a module sets it. */
  const WORN = jackTokens.shadow;
  const tight = (value: string): string => value.replace(/,\s+/g, ',');
  const OPEN = tight(`${jackTokens.shadow}, ${jackTokens.open}`);
  const AIM = tight(`${jackTokens.shadow}, ${jackTokens.aim}`);

  /** Every IN socket on the fixture, dressed, with what each is wearing now. */
  function sockets(board: HTMLElement): Record<string, () => string> {
    const worn: Record<string, () => string> = {};
    for (const socket of board.querySelectorAll<HTMLElement>('[data-jack-in]')) {
      socket.style.boxShadow = WORN;
      worn[socket.dataset.jackIn!] = () => tight(socket.style.boxShadow);
    }
    return worn;
  }

  const pick = (layer: WireLayerHandle, from: string): void =>
    layer.beginDrag(from, new PointerEvent('pointerdown', { button: 0, cancelable: true }));

  const over = (element: Element): void => {
    element.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 5, clientY: 5 }));
  };

  it('lights every IN the rules would accept, and leaves the rest as they were', () => {
    // GUITAR WALL is already in GRIT. A second cable there is a duplicate, and
    // an unlit socket is that refusal said before the drop instead of after.
    const { layer, board } = build({ wires: [{ from: 'guitar', to: 'grit' }] });
    const worn = sockets(board);

    pick(layer, 'guitar');

    expect(worn.grit!()).toBe(tight(WORN));
    expect(worn.murk!()).toBe(OPEN);
    expect(worn.cavern!()).toBe(OPEN);
  });

  it('asks the same question the drop will ask, loops included', () => {
    // MURK already feeds GRIT, so GRIT into MURK would close a loop — and a box
    // never feeds itself. The lit set is `canConnect`, socket by socket.
    const patch: Wire[] = [{ from: 'murk', to: 'grit' }];
    const { layer, board } = build({ wires: patch });
    const worn = sockets(board);

    pick(layer, 'grit');

    for (const id of ['grit', 'murk', 'cavern']) {
      expect(worn[id]!() === OPEN, id).toBe(canConnect(patch, 'grit', id));
    }
    expect(worn.grit!()).toBe(tight(WORN));
    expect(worn.murk!()).toBe(tight(WORN));
    expect(worn.cavern!()).toBe(OPEN);
  });

  it('marks the open socket the cable is over, and only that one', () => {
    const { layer, board } = build();
    const worn = sockets(board);
    const murk = board.querySelector('[data-jack-in="murk"]')!;
    const cavern = board.querySelector('[data-jack-in="cavern"]')!;

    pick(layer, 'guitar');
    over(murk);
    expect(worn.murk!()).toBe(AIM);
    expect(worn.cavern!()).toBe(OPEN);

    // On to the next, and the one it left goes back to merely open.
    over(cavern);
    expect(worn.murk!()).toBe(OPEN);
    expect(worn.cavern!()).toBe(AIM);

    // Off every socket: nothing is aimed at.
    over(board);
    expect(worn.cavern!()).toBe(OPEN);
  });

  it('finds the socket under a child of it, the way the drop does', () => {
    const { layer, board } = build();
    const worn = sockets(board);
    const inner = document.createElement('span');
    board.querySelector('[data-jack-in="murk"]')!.appendChild(inner);

    pick(layer, 'guitar');
    over(inner);

    expect(worn.murk!()).toBe(AIM);
  });

  it('never aims at a socket that would refuse the cable, however squarely it is over it', () => {
    const { layer, board } = build({ wires: [{ from: 'guitar', to: 'grit' }] });
    const worn = sockets(board);

    pick(layer, 'guitar');
    over(board.querySelector('[data-jack-in="grit"]')!);

    expect(worn.grit!()).toBe(tight(WORN));
  });

  it('puts every socket back exactly as it was, however the drag ends', () => {
    const endings: Array<[string, (layer: WireLayerHandle, board: HTMLElement) => void]> = [
      ['a drop', (_layer, board) => {
        document.elementFromPoint = (() => board.querySelector('[data-jack-in="murk"]')) as typeof document.elementFromPoint;
        window.dispatchEvent(new PointerEvent('pointerup', { clientX: 700, clientY: 300 }));
      }],
      ['a miss', () => {
        document.elementFromPoint = (() => null) as typeof document.elementFromPoint;
        window.dispatchEvent(new PointerEvent('pointerup', { clientX: 5, clientY: 5 }));
      }],
      ['the layer going away', (layer) => layer.destroy()],
    ];

    for (const [how, end] of endings) {
      const { layer, board } = build();
      const worn = sockets(board);
      // One socket dressed differently, to prove it is restored and not reset.
      const odd = board.querySelector<HTMLElement>('[data-jack-in="cavern"]')!;
      odd.style.boxShadow = '0 0 0 1px rgb(1, 2, 3)';

      pick(layer, 'guitar');
      over(board.querySelector('[data-jack-in="murk"]')!);
      end(layer, board);

      expect(worn.grit!(), how).toBe(tight(WORN));
      expect(worn.murk!(), how).toBe(tight(WORN));
      expect(odd.style.boxShadow, how).toBe('0 0 0 1px rgb(1, 2, 3)');
      document.body.innerHTML = '';
    }
  });

  it('lights nothing for a press that is not the left button', () => {
    const { layer, board } = build();
    const worn = sockets(board);

    layer.beginDrag('guitar', new PointerEvent('pointerdown', { button: 2, cancelable: true }));

    expect(worn.murk!()).toBe(tight(WORN));
  });
});

describe('how far a point is from a cable', () => {
  const curve = sagCurve({ x: 80, y: 390 }, { x: 680, y: 190 });

  it('is nothing at either jack and nothing along the curve', () => {
    expect(distanceToCable(curve.a, curve)).toBeCloseTo(0, 6);
    expect(distanceToCable(curve.b, curve)).toBeCloseTo(0, 6);
    // Halfway along a quadratic is a quarter of each end and half the control.
    const mid = {
      x: 0.25 * curve.a.x + 0.5 * curve.c.x + 0.25 * curve.b.x,
      y: 0.25 * curve.a.y + 0.5 * curve.c.y + 0.25 * curve.b.y,
    };
    expect(distanceToCable(mid, curve)).toBeLessThan(0.5);
  });

  it('measures to the cable where it hangs, not to the straight line between its jacks', () => {
    // The chord's midpoint is in the air above a cable that sags. A band laid
    // along the chord would catch presses nowhere near the thing it is for.
    const chord = { x: (curve.a.x + curve.b.x) / 2, y: (curve.a.y + curve.b.y) / 2 };
    expect(distanceToCable(chord, curve)).toBeGreaterThan(WIRE.sagBase);
  });

  it('strays from the true curve by far less than the reach, on the longest cable there is', () => {
    // The plate's whole width, and the sag that comes with it. Each point is
    // exactly on the quadratic, between two of the pieces it is walked as.
    const long = sagCurve({ x: 30, y: 200 }, { x: 1410, y: 880 });
    let worst = 0;
    for (let i = 0; i < WIRE.samples; i += 1) {
      const t = (i + 0.5) / WIRE.samples;
      const u = 1 - t;
      worst = Math.max(
        worst,
        distanceToCable(
          {
            x: u * u * long.a.x + 2 * u * t * long.c.x + t * t * long.b.x,
            y: u * u * long.a.y + 2 * u * t * long.c.y + t * t * long.b.y,
          },
          long,
        ),
      );
    }
    expect(worst).toBeLessThan(0.5);
    expect(worst).toBeLessThan(WIRE.hitWidth / 2 / 10);
  });
});

describe('which cable a point is on', () => {
  const upper = sagCurve({ x: 80, y: 390 }, { x: 680, y: 190 });
  const lower = sagCurve({ x: 80, y: 490 }, { x: 680, y: 190 });

  it('is none when nothing is within reach', () => {
    expect(cableAt({ x: 380, y: 100 }, [upper, lower], 7)).toBe(-1);
    expect(cableAt({ x: 380, y: 100 }, [], 7)).toBe(-1);
  });

  it('is the nearest, where two share a jack and both are in reach', () => {
    // Close in on GRIT's jack the two cables run together, and a generous reach
    // takes in both. Which is nearer the point decides it — not which was patched
    // first, which is why the answer flips when the list does.
    const nearLower = { x: lower.b.x - 12, y: lower.b.y + 14 };
    const gap = distanceToCable(nearLower, upper) - distanceToCable(nearLower, lower);
    expect(Math.abs(gap)).toBeGreaterThan(0);
    expect(cableAt(nearLower, [upper, lower], 40)).toBe(gap > 0 ? 1 : 0);
    expect(cableAt(nearLower, [lower, upper], 40)).toBe(gap > 0 ? 0 : 1);
  });

  it('steps over a wire that is routed but not drawn, without renumbering the rest', () => {
    const mid = { x: 380, y: 0.25 * lower.a.y + 0.5 * lower.c.y + 0.25 * lower.b.y };
    expect(cableAt(mid, [null, lower], 7)).toBe(1);
    expect(cableAt(mid, [null, null], 7)).toBe(-1);
  });
});

describe('what has claimed the pointer', () => {
  it('is anything between the target and the plate that shows a cursor of its own', () => {
    const board = document.createElement('div');
    const control = document.createElement('div');
    control.style.cursor = 'ns-resize';
    const face = document.createElement('div');
    const name = document.createElement('div');
    control.appendChild(face);
    board.append(control, name);

    expect(claimed(control, board)).toBe(true);
    // A knob's face has no cursor of its own; the control it is part of does.
    expect(claimed(face, board)).toBe(true);
    // Lettering painted on the plate claims nothing.
    expect(claimed(name, board)).toBe(false);
    expect(claimed(board, board)).toBe(false);
    expect(claimed(null, board)).toBe(false);
  });

  it('does not ask the plate, whose cursor is the layer’s own to set', () => {
    const board = document.createElement('div');
    board.style.cursor = 'pointer';
    const name = document.createElement('div');
    board.appendChild(name);

    expect(claimed(name, board)).toBe(false);
  });
});

describe('pulling a cable', () => {
  const patch: Wire[] = [
    { from: 'guitar', to: 'grit' },
    { from: 'bass', to: 'grit' },
    { from: 'guitar', to: 'murk' },
  ];

  it('reports the one pressed and let go of, when several share an end', () => {
    const { board, removed } = build({ wires: patch });

    tap(board, onCable(AT.bass, AT.grit));

    expect(removed).toEqual([1]);
  });

  it('keeps reporting the right one after the layer has redrawn', () => {
    const { layer, board, removed } = build({ wires: patch });

    layer.setWires([patch[1]!, patch[2]!]);
    tap(board, onCable(AT.guitar, AT.murk));

    expect(removed).toEqual([1]);
  });

  it('ignores a press on bare plate that is nowhere near one', () => {
    const { board, removed } = build({ wires: patch });

    tap(board, { x: 1200, y: 800 });
    // The air between a sagging cable's two jacks is not the cable.
    tap(board, { x: (AT.guitar.x + AT.grit.x) / 2, y: (AT.guitar.y + AT.grit.y) / 2 });

    expect(removed).toEqual([]);
  });

  it('leaves the press to whatever the cable hangs across (gt#72)', () => {
    // The bug. A cable draped over a control used to be what the pointer landed
    // on: the knob could not be grabbed, and the click deleted the cable.
    const { board, removed } = build({ wires: patch });
    const control = document.createElement('div');
    control.style.cursor = 'ns-resize';
    const face = document.createElement('div');
    control.appendChild(face);
    board.appendChild(control);
    const socket = board.querySelector('[data-jack-out="guitar"]') as HTMLElement;
    socket.style.cursor = 'crosshair';

    // Dead on the cable, every one of these — and each belongs to something else.
    tap(control, onCable(AT.guitar, AT.grit));
    tap(face, onCable(AT.guitar, AT.grit));
    // A jack under the cable already leaving it is how a second one is started.
    tap(socket, onCable(AT.guitar, AT.grit, 0));

    expect(removed).toEqual([]);
  });

  it('does not take a drag that happens to end on a cable for a click', () => {
    // A browser fires `click` on the common ancestor when the button goes down
    // on one element and up on another — so a knob dragged and released over
    // open plate would be a click on the plate, wherever the pointer ended up.
    const { board, removed } = build({ wires: patch });
    const control = document.createElement('div');
    control.style.cursor = 'ns-resize';
    board.appendChild(control);
    const on = onCable(AT.bass, AT.grit);

    // Down on a control, up on the cable.
    control.dispatchEvent(pointer('pointerdown', { x: 900, y: 700 }));
    board.dispatchEvent(pointer('pointerup', on));
    // Down on bare plate, up on the cable.
    board.dispatchEvent(pointer('pointerdown', { x: 1200, y: 800 }));
    board.dispatchEvent(pointer('pointerup', on));
    // Down on the cable, up further along the same cable.
    board.dispatchEvent(pointer('pointerdown', on));
    board.dispatchEvent(pointer('pointerup', onCable(AT.bass, AT.grit, 0.6)));
    // Down on one cable, up on another.
    board.dispatchEvent(pointer('pointerdown', on));
    board.dispatchEvent(pointer('pointerup', onCable(AT.guitar, AT.murk)));

    expect(removed).toEqual([]);
  });

  it('forgives the few pixels a hand moves between down and up', () => {
    const { board, removed } = build({ wires: patch });
    const on = onCable(AT.bass, AT.grit);

    board.dispatchEvent(pointer('pointerdown', on));
    board.dispatchEvent(pointer('pointerup', { x: on.x + WIRE.slop - 1, y: on.y }));

    expect(removed).toEqual([1]);
  });

  it('ignores anything but the left button', () => {
    const { board, removed } = build({ wires: patch });
    const on = onCable(AT.bass, AT.grit);

    board.dispatchEvent(pointer('pointerdown', on, { button: 2 }));
    board.dispatchEvent(pointer('pointerup', on, { button: 2 }));

    expect(removed).toEqual([]);
  });

  it('reaches the same distance for the hand however far the plate is scaled down', () => {
    // Half the band either side, in screen pixels. On a plate at half size that
    // is twice as many board pixels, which is the point: the cable is thinner
    // there and the hand is not more precise.
    const reach = WIRE.hitWidth / 2;
    for (const fit of [1, 0.5]) {
      const { board, removed } = build({ wires: [{ from: 'guitar', to: 'grit' }] }, fit);
      // The lowest point of the sag, where the cable runs level — so straight
      // down from it is straight away from it.
      const low = onCable(AT.guitar, AT.grit, 0.5, fit);

      tap(board, { x: low.x, y: low.y + reach + 2 });
      expect(removed, `fit ${fit}, outside`).toEqual([]);

      tap(board, { x: low.x, y: low.y + reach - 2 });
      expect(removed, `fit ${fit}, inside`).toEqual([0]);

      document.body.innerHTML = '';
    }
  });

  it('stops listening to the plate once it is destroyed', () => {
    const { layer, board, removed } = build({ wires: patch });

    layer.destroy();
    tap(board, onCable(AT.bass, AT.grit));

    expect(removed).toEqual([]);
  });
});

describe('the cable under the pointer', () => {
  const patch: Wire[] = [
    { from: 'guitar', to: 'grit' },
    { from: 'bass', to: 'grit' },
  ];
  const lit = (layer: WireLayerHandle): string[] => hits(layer).map((path) => path.style.stroke);

  it('is lit in the colour a loose cable is dragged in, and shows a hand', () => {
    const { layer, board } = build({ wires: patch });

    board.dispatchEvent(pointer('pointermove', onCable(AT.bass, AT.grit), { buttons: 0 }));

    expect(lit(layer)).toEqual([signals.wireCore, signals.wireTemp]);
    expect(board.style.cursor).toBe('pointer');
  });

  it('goes out when the pointer moves off it, onto another, or off the plate', () => {
    const { layer, board } = build({ wires: patch });
    const dark = [signals.wireCore, signals.wireCore];

    board.dispatchEvent(pointer('pointermove', onCable(AT.bass, AT.grit), { buttons: 0 }));
    board.dispatchEvent(pointer('pointermove', onCable(AT.guitar, AT.grit), { buttons: 0 }));
    expect(lit(layer)).toEqual([signals.wireTemp, signals.wireCore]);

    board.dispatchEvent(pointer('pointermove', { x: 1200, y: 800 }, { buttons: 0 }));
    expect(lit(layer)).toEqual(dark);
    expect(board.style.cursor).toBe('');

    board.dispatchEvent(pointer('pointermove', onCable(AT.bass, AT.grit), { buttons: 0 }));
    board.dispatchEvent(new PointerEvent('pointerleave'));
    expect(lit(layer)).toEqual(dark);
    expect(board.style.cursor).toBe('');
  });

  it('stays dark under a control, which is what that press would reach', () => {
    const { layer, board } = build({ wires: patch });
    const control = document.createElement('div');
    control.style.cursor = 'ns-resize';
    board.appendChild(control);

    control.dispatchEvent(pointer('pointermove', onCable(AT.bass, AT.grit), { buttons: 0 }));

    expect(lit(layer)).toEqual([signals.wireCore, signals.wireCore]);
    expect(board.style.cursor).toBe('');
  });

  it('stays dark while a button is down, so a drag passing over offers to delete nothing', () => {
    const { layer, board } = build({ wires: patch });

    board.dispatchEvent(pointer('pointermove', onCable(AT.bass, AT.grit), { buttons: 1 }));

    expect(lit(layer)).toEqual([signals.wireCore, signals.wireCore]);
  });

  it('goes out when a cable is picked up, and when the patch is redrawn', () => {
    const { layer, board } = build({ wires: patch });

    board.dispatchEvent(pointer('pointermove', onCable(AT.bass, AT.grit), { buttons: 0 }));
    layer.beginDrag('guitar', new PointerEvent('pointerdown', { button: 0, cancelable: true }));
    expect(lit(layer)).toEqual([signals.wireCore, signals.wireCore]);
    expect(board.style.cursor).toBe('');
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 5, clientY: 5 }));

    board.dispatchEvent(pointer('pointermove', onCable(AT.bass, AT.grit), { buttons: 0 }));
    layer.setWires(patch);
    expect(lit(layer)).toEqual([signals.wireCore, signals.wireCore]);
    expect(board.style.cursor).toBe('');
  });
});

// Whether anything is coming down a cable (gt#85).
describe('what is putting signal out', () => {
  const patch: Wire[] = [
    { from: 'guitar', to: 'grit' },
    { from: 'grit', to: 'cavern' },
    { from: 'bass', to: 'murk' },
    { from: 'murk', to: 'cavern' },
  ];

  it('is every source that is on, and every box one of them reaches', () => {
    expect([...liveSet(['guitar'], patch)].sort()).toEqual(['cavern', 'grit', 'guitar']);
    expect([...liveSet(['guitar', 'bass'], patch)].sort()).toEqual([
      'bass',
      'cavern',
      'grit',
      'guitar',
      'murk',
    ]);
  });

  it('is not a box fed only by something that is off — which is where it parts from the lamp', () => {
    // MURK has a cable in it either way, so `fedBy` says yes and its lamp is
    // lit. Nothing is coming *through* it while BASS is off.
    expect(fedBy(patch).has('murk')).toBe(true);
    expect(liveSet(['guitar'], patch).has('murk')).toBe(false);
  });

  it('is nothing at all on a board with everything off', () => {
    expect(liveSet([], patch).size).toBe(0);
  });

  it('is not confused by a patch that forks and rejoins', () => {
    const fork: Wire[] = [
      { from: 'guitar', to: 'grit' },
      { from: 'guitar', to: 'murk' },
      { from: 'grit', to: 'cavern' },
      { from: 'murk', to: 'cavern' },
    ];
    expect([...liveSet(['guitar'], fork)].sort()).toEqual(['cavern', 'grit', 'guitar', 'murk']);
  });
});

describe('a cable with nothing coming down it', () => {
  const patch: Wire[] = [
    { from: 'guitar', to: 'grit' },
    { from: 'bass', to: 'murk' },
  ];
  /** The cable's own stroke and the light along its top, for one wire. */
  const strokes = (layer: WireLayerHandle, index: number): SVGPathElement[] => {
    const group = layer.element.querySelector('g') as SVGGElement;
    const paths = [...group.children] as SVGPathElement[];
    return paths.slice(index * 3, index * 3 + 3);
  };

  it('is drawn live until somebody says otherwise', () => {
    const { layer } = build({ wires: patch });

    for (const index of [0, 1]) {
      const [, core, shine] = strokes(layer, index);
      expect(core?.style.opacity).toBe('');
      expect(shine?.style.opacity).toBe('');
    }
  });

  it('keeps its shape and its shadow and loses its light', () => {
    const { layer } = build({ wires: patch });

    layer.setLive(new Set(['guitar', 'grit']));

    const [shadow, core, shine] = strokes(layer, 1);
    expect(core?.style.opacity).toBe(String(WIRE.dead.core));
    expect(shine?.style.opacity).toBe(String(WIRE.dead.shine));
    // A dead cable still hangs over the plate.
    expect(shadow?.style.opacity).toBe(String(WIRE.shadowOpacity));
    // And the live one beside it is untouched.
    expect(strokes(layer, 0)[1]?.style.opacity).toBe('');
    // Dimmer, not gone: it is still a cable somebody can see and pull.
    expect(WIRE.dead.core).toBeGreaterThan(0.25);
    expect(WIRE.dead.core).toBeLessThan(0.7);
  });

  it('comes back the moment its source does', () => {
    const { layer } = build({ wires: patch });

    layer.setLive(new Set(['guitar']));
    layer.setLive(new Set(['guitar', 'bass']));

    expect(strokes(layer, 1)[1]?.style.opacity).toBe('');
    expect(strokes(layer, 1)[2]?.style.opacity).toBe('');
  });

  it('stays dead through a redraw, which builds every path again', () => {
    const { layer } = build({ wires: patch });

    layer.setLive(new Set(['guitar']));
    layer.measure();

    expect(strokes(layer, 1)[1]?.style.opacity).toBe(String(WIRE.dead.core));
    layer.setWires([patch[1]!, patch[0]!]);
    expect(strokes(layer, 0)[1]?.style.opacity).toBe(String(WIRE.dead.core));
    expect(strokes(layer, 1)[1]?.style.opacity).toBe('');
  });

  it('can still be pointed at and pulled', () => {
    const { layer, board, removed } = build({ wires: patch });
    layer.setLive(new Set(['guitar']));

    tap(board, onCable(AT.bass, AT.murk));

    expect(removed).toEqual([1]);
  });
});

describe('a strike running down its cable', () => {
  const patch: Wire[] = [
    { from: 'guitar', to: 'grit' },
    { from: 'grit', to: 'murk' },
    { from: 'bass', to: 'grit' },
  ];
  const running = (layer: WireLayerHandle): string[] =>
    [...layer.element.querySelectorAll<SVGPathElement>('[data-pulse]')].map((path) => path.dataset.pulse!);

  it('is as long as the pieces it is walked as, which is longer than the straight line', () => {
    const curve = sagCurve({ x: 80, y: 390 }, { x: 680, y: 190 });
    const chord = Math.hypot(600, 200);

    expect(cableLength(curve)).toBeGreaterThan(chord);
    expect(cableLength(curve)).toBeLessThan(chord * 1.5);
    // A cable with no reach has no length, rather than a NaN.
    const point = { x: 5, y: 5 };
    expect(cableLength({ a: point, b: point, c: point })).toBeCloseTo(0, 9);
  });

  it('sends one pulse down each cable out of the source that struck, and no other', () => {
    const { layer } = build({ wires: patch });

    layer.strike('guitar');

    expect(running(layer)).toEqual(['0']);
  });

  it('draws the pulse on the cable’s own curve, entering at OUT and leaving at IN', () => {
    const { layer } = build({ wires: patch });

    layer.strike('guitar');
    const pulse = layer.element.querySelector<SVGPathElement>('[data-pulse]')!;
    const length = cableLength(sagCurve(inBoard(100, 400), inBoard(700, 200)));

    expect(pulse.getAttribute('d')).toBe(hits(layer)[0]?.getAttribute('d'));
    expect(pulse.style.stroke).toBe(signals.wireTemp);
    // Laid just before the start, where none of it shows…
    expect(pulse.style.strokeDashoffset).toBe(String(WIRE.pulse.dash));
    expect(pulse.style.strokeDasharray.replace(/,/g, ' ').split(/\s+/).map(Number)).toEqual([
      WIRE.pulse.dash,
      Math.ceil(length + WIRE.pulse.dash),
    ]);
    // …and run to the far end once it has landed in the tree.
    vi.advanceTimersByTime(40);
    expect(Number(pulse.style.strokeDashoffset)).toBe(-Math.ceil(length));
    expect(pulse.style.transition).toContain(`${WIRE.pulse.ms}ms`);
  });

  it('carries on down whatever the box at the far end feeds, a leg at a time', () => {
    const { layer } = build({ wires: patch });

    layer.strike('guitar');
    vi.advanceTimersByTime(WIRE.pulse.ms - 1);
    expect(running(layer)).toEqual(['0']);

    // It lands in GRIT, and GRIT feeds MURK.
    vi.advanceTimersByTime(1);
    expect(running(layer)).toEqual(['1']);

    // MURK feeds nothing, so that is where the hit ends.
    vi.advanceTimersByTime(WIRE.pulse.ms);
    expect(running(layer)).toEqual([]);
  });

  it('is over inside a beat however far down the chain it walks', () => {
    // The fastest beat the board plays is 833ms. Three legs — a source through
    // two boxes, which is as far as the opening patch goes — is under half a
    // second, and even the whole rack end to end, seven boxes, is done before
    // the beat after next.
    expect(WIRE.pulse.ms * 3).toBeLessThan(500);
    expect(WIRE.pulse.ms * 3).toBeLessThan(833);
    expect(WIRE.pulse.ms * 8).toBeLessThan(833 * 2);
  });

  it('does nothing for a source with no cable in it', () => {
    const { layer } = build({ wires: patch });

    layer.strike('slowhit');

    expect(running(layer)).toEqual([]);
  });

  it('refuses over its cap rather than queueing', () => {
    const { layer } = build({ wires: patch });

    for (let i = 0; i < WIRE.pulse.cap + 6; i += 1) layer.strike('guitar');

    expect(running(layer)).toHaveLength(WIRE.pulse.cap);
  });

  it('starts none on a stilled board, and drops the ones already running', () => {
    const { layer } = build({ wires: patch });

    layer.strike('guitar');
    layer.setStill(true);
    expect(running(layer)).toEqual([]);

    layer.strike('guitar');
    vi.advanceTimersByTime(WIRE.pulse.ms * 3);
    // Neither the new one nor the next leg of the one that was dropped.
    expect(running(layer)).toEqual([]);

    layer.setStill(false);
    layer.strike('guitar');
    expect(running(layer)).toEqual(['0']);
  });

  it('goes with the cables when the patch is redrawn', () => {
    const { layer } = build({ wires: patch });

    layer.strike('guitar');
    layer.setWires([patch[2]!]);
    vi.advanceTimersByTime(WIRE.pulse.ms * 3);

    expect(running(layer)).toEqual([]);
  });

  it('takes its timers with it when the layer is destroyed', () => {
    const { layer } = build({ wires: patch });

    layer.strike('guitar');
    layer.destroy();
    vi.advanceTimersByTime(WIRE.pulse.ms * 3);

    expect(running(layer)).toEqual([]);
  });
});

// The cables coming back after the patch has been knocked loose (gt#80).
describe('cables settling after a blow', () => {
  const groups = (layer: WireLayerHandle): SVGGElement[] =>
    [...layer.element.querySelectorAll<SVGGElement>(':scope > g')].slice(0, 2);

  it('go out at once and come back in over the board’s own travel time', () => {
    const { layer } = build({ wires: [{ from: 'guitar', to: 'grit' }] });

    layer.settle();
    expect(groups(layer).map((group) => group.style.opacity)).toEqual(['0', '0']);
    expect(groups(layer).map((group) => group.style.transition)).toEqual(['none', 'none']);

    vi.advanceTimersByTime(0);
    expect(groups(layer).map((group) => group.style.opacity)).toEqual(['1', '1']);
    for (const group of groups(layer)) {
      expect(group.style.transition).toContain(`${WIRE.settleMs}ms`);
    }
  });

  it('takes the junction marks with the cables, so none is left floating', () => {
    const { layer } = build({ wires: [{ from: 'guitar', to: 'grit' }] });
    const [cables, marks] = groups(layer);

    layer.settle();

    expect(cables?.querySelector('[data-wire]')).not.toBeNull();
    expect(marks?.querySelector('[data-mark]')).not.toBeNull();
    expect(marks?.style.opacity).toBe(cables?.style.opacity);
  });

  it('does nothing on a stilled board, and a fade caught halfway comes straight back', () => {
    const { layer } = build({ wires: [{ from: 'guitar', to: 'grit' }] });

    layer.settle();
    layer.setStill(true);
    expect(groups(layer).map((group) => group.style.opacity)).toEqual(['', '']);

    layer.settle();
    vi.advanceTimersByTime(50);
    expect(groups(layer).map((group) => group.style.opacity)).toEqual(['', '']);
  });

  it('lets go of its timer when the layer is destroyed', () => {
    const { layer } = build({ wires: [{ from: 'guitar', to: 'grit' }] });

    layer.settle();
    layer.destroy();
    vi.advanceTimersByTime(50);

    expect(groups(layer).map((group) => group.style.opacity)).toEqual(['', '']);
  });
});

// Unpatching as a drag (gt#79): press an IN socket, and the cable in it comes out.
describe('pulling a cable out of its jack', () => {
  const patch: Wire[] = [
    { from: 'guitar', to: 'grit' },
    { from: 'bass', to: 'grit' },
    { from: 'guitar', to: 'murk' },
  ];
  const socket = (board: HTMLElement, id: string): HTMLElement =>
    board.querySelector<HTMLElement>(`[data-jack-in="${id}"]`)!;

  /** Press an IN socket, then let go over `over` (or over nothing at all). */
  function pull(board: HTMLElement, from: string, over: Element | null): void {
    socket(board, from).dispatchEvent(pointer('pointerdown', { x: 700, y: 200 }));
    document.elementFromPoint = ((): Element | null => over) as typeof document.elementFromPoint;
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 5, clientY: 5 }));
  }

  it('lifts the cable most recently patched in, like the top of a stack', () => {
    const { board, removed } = build({ wires: patch });

    pull(board, 'grit', null);

    // BASS went into GRIT after GUITAR WALL did.
    expect(removed).toEqual([1]);
  });

  it('takes the cable off the board while it is in the hand, and trails its loose end', () => {
    const { layer, board } = build({ wires: patch });

    socket(board, 'murk').dispatchEvent(pointer('pointerdown', { x: 400, y: 600 }));

    // Every stroke of it and its mark: nothing is drawn between that source
    // and that socket but the end being carried.
    expect(hits(layer)[2]?.style.display).toBe('none');
    expect(junctions(layer)[2]?.style.display).toBe('none');
    expect(hits(layer)[0]?.style.display).toBe('');
    // From the press, not from the first move — and from the *source's* socket.
    expect(temp(layer).style.display).toBe('block');
    expect(temp(layer).getAttribute('d')).toBe(sagPath(inBoard(100, 400), inBoard(400, 600)));
  });

  it('is gone if it is dropped anywhere that is not a socket', () => {
    const { board, removed, connects } = build({ wires: patch });

    pull(board, 'murk', board);

    expect(removed).toEqual([2]);
    expect(connects).toEqual([]);
  });

  it('is put back if it is dropped where it came from, and nothing has happened', () => {
    // The "no" every other gesture on this board has, and a click never did.
    const { layer, board, removed, connects } = build({ wires: patch });

    pull(board, 'murk', socket(board, 'murk'));

    expect(removed).toEqual([]);
    expect(connects).toEqual([]);
    expect(hits(layer)[2]?.style.display).toBe('');
    expect(temp(layer).style.display).toBe('none');
  });

  it('is moved if it is dropped on another socket: out of one, into the other', () => {
    const { board, removed, connects } = build({ wires: patch });

    pull(board, 'murk', socket(board, 'cavern'));

    expect(removed).toEqual([2]);
    expect(connects).toEqual([{ from: 'guitar', to: 'cavern' }]);
  });

  it('is put back, not lost, if the socket it is dropped on would refuse it', () => {
    // GUITAR WALL is already in GRIT. Carrying its MURK cable over to GRIT
    // would be a duplicate — and a refused drop must not be a deleted cable.
    const { board, removed, connects } = build({ wires: patch });

    pull(board, 'murk', socket(board, 'grit'));

    expect(removed).toEqual([]);
    expect(connects).toEqual([]);
  });

  it('asks the rules about the patch without the cable that is in the hand', () => {
    // Lifted out of GRIT, BASS's cable is not in GRIT — so GRIT is a socket it
    // may go back into, and is lit as one, rather than being its own duplicate.
    const { board } = build({ wires: patch });
    for (const jack of board.querySelectorAll<HTMLElement>('[data-jack-in]')) jack.style.boxShadow = 'none';

    socket(board, 'grit').dispatchEvent(pointer('pointerdown', { x: 700, y: 200 }));

    const lit = (id: string): boolean => socket(board, id).style.boxShadow !== 'none';
    expect([lit('grit'), lit('murk'), lit('cavern')]).toEqual([true, true, true]);
  });

  it('does nothing at a socket with no cable in it', () => {
    const { layer, board, removed } = build({ wires: patch });

    pull(board, 'cavern', null);

    expect(removed).toEqual([]);
    expect(temp(layer).style.display).toBe('none');
  });

  it('ignores anything but the left button', () => {
    const { layer, board, removed } = build({ wires: patch });

    socket(board, 'murk').dispatchEvent(pointer('pointerdown', { x: 700, y: 300 }, { button: 2 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 5, clientY: 5 }));

    expect(removed).toEqual([]);
    expect(hits(layer)[2]?.style.display).toBe('');
  });

  it('puts the cable back on the board if the layer goes away with it in the air', () => {
    const { layer, board, removed } = build({ wires: patch });

    socket(board, 'murk').dispatchEvent(pointer('pointerdown', { x: 700, y: 300 }));
    const lifted = hits(layer)[2];
    layer.destroy();
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 5, clientY: 5 }));

    expect(lifted?.style.display).toBe('');
    expect(removed).toEqual([]);
  });

  it('still pulls a cable by clicking it, as the reference has it', () => {
    const { board, removed } = build({ wires: patch });

    tap(board, onCable(AT.guitar, AT.murk));

    expect(removed).toEqual([2]);
  });
});
