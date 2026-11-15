// The patch cables, and the signature gesture of the whole board: nine sources
// feed four boxes by dragging a wire from an OUT socket to an IN one.
//
// Like every other component here it owns appearance and gesture and no state.
// The list of wires belongs to the caller — the seam in ../app holds it, hands it
// to this layer to draw and to the engine to route — and this file never edits
// it. It reports a legal drop and a clicked cable and stops there.
//
// Five things about it are worth stating, because each one is a decision rather
// than an implementation detail:
//
// - **A cable hangs.** It is not an arc between two jacks: it is a length of
//   cable longer than the gap it spans, so it sags, and it sags further the
//   further it reaches. That one curve is most of why the board reads as
//   hardware rather than as a node graph.
// - **It is measured, never laid out.** Every endpoint is read off the live jack
//   the moment it is drawn, so a cable cannot drift from its socket no matter
//   what moves — a resize, a webfont landing late, a box changing height. The
//   cost is that the layer has to be told to look again, which is what
//   {@link WireLayerHandle.measure} is for.
// - **The rules live in {@link canConnect}, on their own.** Whether a wire is
//   legal is a fact about a list of wires, not about a drag, so it is a pure
//   function that SUMMON (gt#19) can ask the same question of without touching a
//   pointer event.
// - **A cable is never what the pointer hits (gt#72).** It hangs across other
//   plates, and for as long as it carried a click target of its own — an
//   invisible band stroked over each curve — whatever it crossed could not be
//   reached: the knob under it could not be grabbed, the jack under it could not
//   start a second cable, and the click that was meant for either deleted the
//   cable instead. So nothing in this layer takes pointer events at all. A cable
//   is found by *geometry*: a press and release on bare plate, within reach of a
//   curve, pulls that cable — and anything that claims the pointer for itself
//   wins simply by being what was pressed. See {@link claimed}.
// - **The cable about to go says so.** With no band there is no cursor change to
//   borrow, so the one under the pointer is lit in the colour a loose cable is
//   dragged in. A click that removes something should have a visible target.

import { BOARD, WIRE } from './constants';
import { svg } from './dom';
import type { Wire } from '../engine';
import { ink, jack as jackTokens, signals, sourceKey, TAPE_WRAP, tapeWrap, turnPoints } from '../tokens';

/** A point in board space: plate-relative, and unscaled by `--fit`. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** The board's origin and scale, read once per measurement or per drag. */
interface BoardGeometry {
  readonly rect: DOMRect;
  readonly fit: number;
}

export interface WireLayerSpec {
  /** The plate. The positioning parent, the origin, and the only place jacks are looked for. */
  readonly board: HTMLElement;

  /** The patch as it stands. Held by the caller; drawn here. */
  readonly wires?: readonly Wire[];

  /** A drag ended on an IN jack and the connection is legal. The caller appends it. */
  readonly onConnect?: (wire: Wire) => void;

  /**
   * A cable was pressed and let go of on bare plate, by its index in the list
   * this layer was last given.
   */
  readonly onDisconnect?: (index: number) => void;
}

export interface WireLayerHandle {
  /** The SVG. Mounted by the caller, over the plate. */
  readonly element: SVGSVGElement;

  /** Draw a new patch. Re-measures. */
  setWires(wires: readonly Wire[]): void;

  /** Re-read every jack and redraw. Resize, wire change, typefaces landing. */
  measure(): void;

  /** Start a drag out of an OUT socket. The board's `onJackDown` forwards here. */
  beginDrag(from: string, event: PointerEvent): void;

  /**
   * Which things on the board are putting signal out right now (gt#85) — sources
   * that are on, and boxes something live reaches. A cable out of anything not
   * in the set is drawn dead. `null`, which is how the layer starts, means
   * nobody has said, and every cable is drawn live.
   *
   * State, not motion: a dead cable is as dead on a stilled board.
   */
  setLive(ids: ReadonlySet<string> | null): void;

  /**
   * A strike was heard (gt#85). A pulse runs down every cable out of that source,
   * OUT to IN, and on down whatever the box at the far end feeds — the hit
   * drawn travelling through the patch. Does nothing at all for a source with no
   * cable, a layer at its cap, or a stilled board.
   */
  strike(id: string): void;

  /** STILLNESS moved. Stilled, pulses in flight are dropped and no more begin. */
  setStill(still: boolean): void;

  /**
   * The patch was just knocked into a new shape (gt#80). The cables come back in
   * over {@link WIRE.settleMs} rather than blinking from one patch to another.
   * Appearance only, and nothing at all on a stilled board.
   */
  settle(): void;

  /** Drop the four listeners on the plate, and any drag in flight. */
  destroy(): void;
}

/**
 * The point a cable hangs from: the midpoint of the span, dropped by a fixed
 * amount plus a share of how far the cable reaches. Its own function because
 * two things need it now — the curve, and the tape wound round the curve —
 * and a second copy of this arithmetic is a second place for the two to part
 * company, which would show up as a wrap floating beside its own cable.
 */
export function sagControl(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) / 2,
    y: Math.max(a.y, b.y) + WIRE.sagBase + Math.abs(a.x - b.x) * WIRE.sagPerPx,
  };
}

/**
 * The curve between two jacks: one quadratic bézier whose control point hangs
 * below both ends. Written to one decimal, as the reference writes it — a path
 * is re-emitted on every measurement and a full-precision float per coordinate
 * is a lot of string for a difference no eye resolves.
 */
export function sagPath(a: Point, b: Point): string {
  const c = sagControl(a, b);
  return (
    `M${a.x.toFixed(1)} ${a.y.toFixed(1)} ` +
    `Q ${c.x.toFixed(1)} ${c.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`
  );
}

/** A place on a cable, and which way the cable is running there. */
export interface Seat extends Point {
  /** Degrees clockwise from pointing right, the way SVG's `rotate` counts. */
  readonly angle: number;
}

/**
 * Where a cable is wrapped: about `back` pixels up it from the jack it lands
 * in, and the direction it is running there (gt#107).
 *
 * Up the cable rather than at a fixed offset from the jack, and that is the
 * whole reason this is measured instead of placed. A box can be fed by more
 * than one source; a fixed offset would stack every wrap on the same spot.
 * Two cables arrive from different directions, so theirs separate on their own.
 *
 * *On* the cable, exactly. The figure this replaced was seated along the
 * tangent at the landing, which leaves the curve by a pixel or two a little
 * way back — nothing, for a mark that floated beside the cable anyway, and
 * plain to see for a strip of tape that is meant to be wound round it. So this
 * is a point of the curve itself: a quadratic is travelling at twice the
 * distance from its control point to its end when it arrives, which turns a
 * distance back into a parameter near enough for something a few pixels long.
 */
export function wrapAt(a: Point, b: Point, back: number): Seat {
  const c = sagControl(a, b);
  // A cable whose end and control point coincide has no speed to divide by.
  // It cannot happen on a laid-out board — the sag alone separates them.
  const speed = 2 * Math.hypot(b.x - c.x, b.y - c.y) || 1;
  // Never further back than the middle: past it the wrap is nearer the far jack.
  const t = Math.max(0.5, 1 - back / speed);
  const u = 1 - t;
  const dx = 2 * u * (c.x - a.x) + 2 * t * (b.x - c.x);
  const dy = 2 * u * (c.y - a.y) + 2 * t * (b.y - c.y);
  return {
    x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}

/** One hanging cable, as the three points its curve is drawn from. */
export interface Curve {
  readonly a: Point;
  readonly b: Point;
  /** The point it hangs from — see {@link sagControl}. */
  readonly c: Point;
}

/** The curve between two jacks, as points rather than as a path string. */
export function sagCurve(a: Point, b: Point): Curve {
  return { a, b, c: sagControl(a, b) };
}

/**
 * How far a point is from a cable, in board pixels (gt#72).
 *
 * The curve is walked as {@link WIRE.samples} straight pieces and the nearest
 * point on any of them is the answer. That is an approximation and a deliberate
 * one: the exact distance to a quadratic is a cubic to solve, and the error of
 * the pieces on the longest cable this board can hang is a fraction of a pixel
 * against a reach of several. What matters is that it is arithmetic — it needs
 * no rendered path, so it works wherever the layer is not drawn, and a suite can
 * ask it the question a hand asks.
 */
export function distanceToCable(point: Point, curve: Curve): number {
  const { a, b, c } = curve;
  let nearest = Infinity;
  let from = a;
  for (let i = 1; i <= WIRE.samples; i += 1) {
    const t = i / WIRE.samples;
    const u = 1 - t;
    const to = {
      x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
    };
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const span = dx * dx + dy * dy;
    // How far along this piece the point falls, held to its two ends.
    const along =
      span > 0
        ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / span))
        : 0;
    nearest = Math.min(
      nearest,
      Math.hypot(point.x - (from.x + dx * along), point.y - (from.y + dy * along)),
    );
    from = to;
  }
  return nearest;
}

/**
 * How long a cable is, in board pixels: the same {@link WIRE.samples} straight
 * pieces {@link distanceToCable} walks, added up (gt#85). An approximation on the
 * same terms and for the same reason — it is arithmetic, where the exact answer
 * is `getTotalLength()` on a path that has to have been rendered first.
 */
export function cableLength(curve: Curve): number {
  const { a, b, c } = curve;
  let length = 0;
  let from = a;
  for (let i = 1; i <= WIRE.samples; i += 1) {
    const t = i / WIRE.samples;
    const u = 1 - t;
    const to = {
      x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
    };
    length += Math.hypot(to.x - from.x, to.y - from.y);
    from = to;
  }
  return length;
}

/**
 * What is putting signal out, given which sources are on and how the board is
 * patched (gt#85): every on source, and every box a live thing feeds, however far
 * down the chain. A box fed only by sources that are off is passing nothing on.
 *
 * Pure, like {@link canConnect} and {@link fedBy}, because it is a fact about a
 * list of wires rather than about anything drawn. It differs from `fedBy` in
 * the one way that matters here: a lamp answers *is anything plugged in*, and
 * this answers *is anything coming through*.
 */
export function liveSet(on: Iterable<string>, wires: readonly Wire[]): ReadonlySet<string> {
  const live = new Set<string>(on);
  const frontier = [...live];
  while (frontier.length) {
    const node = frontier.pop();
    if (node === undefined) break;
    for (const wire of wires) {
      if (wire.from !== node || live.has(wire.to)) continue;
      live.add(wire.to);
      frontier.push(wire.to);
    }
  }
  return live;
}

/**
 * Which cable a point is on: the index of the nearest one within `reach`, or -1
 * when none is. The nearest rather than the first, because cables cross — and
 * where two do, the one a hand is closer to is the one it meant.
 *
 * A `null` entry is a wire that is routed but not drawn, and is skipped without
 * disturbing the indexes after it: what comes back is an index into the caller's
 * own wire list, which is the only thing it can act on.
 */
export function cableAt(point: Point, curves: readonly (Curve | null)[], reach: number): number {
  let found = -1;
  let nearest = reach;
  curves.forEach((curve, index) => {
    if (!curve) return;
    const distance = distanceToCable(point, curve);
    if (distance <= nearest) {
      nearest = distance;
      found = index;
    }
  });
  return found;
}

/**
 * Whether something between a pointer's target and the plate has claimed the
 * pointer for itself — a control, a jack, a power cluster, the hammer, a tape.
 *
 * The test is whether it shows a cursor of its own, and that is a rule rather
 * than a trick: on this board, a thing that changes the cursor is a thing that
 * answers a press, and each of those already says so in its own style. A list of
 * `data-part` names would have been the other way to write this, and it would
 * have been a second register of what is interactive — one a new button could be
 * left off, which is precisely how the hammer once lost its hover line. This one
 * cannot be left off: a button with no cursor is a button nobody can find.
 *
 * The plate itself is not asked. It is where the walk stops, and its own cursor
 * is this layer's to set when a cable is under the pointer.
 */
export function claimed(target: EventTarget | null, board: Element): boolean {
  let node = target instanceof Element ? target : null;
  while (node && node !== board) {
    if (node instanceof HTMLElement && node.style.cursor) return true;
    node = node.parentElement;
  }
  return false;
}

/**
 * Whether `from → to` may be added to this patch. Three refusals, and the third
 * is the only one that has to think:
 *
 * - Nothing feeds itself.
 * - Nothing feeds the same thing twice.
 * - Nothing feeds something that already feeds it, however far around. Walk the
 *   graph forward from the prospective target; if the signal can get back to the
 *   source, this wire would close a loop — and a loop in the audio graph is
 *   feedback, which on a board with no gain staging is a noise nobody asked for.
 *
 * The reference only runs that walk when the source is a modifier. The guard is
 * left out here because it cannot change the answer: no wire ever ends at a
 * source, so a walk that starts from a target can never reach one.
 */
export function canConnect(wires: readonly Wire[], from: string, to: string): boolean {
  if (from === to) return false;
  if (wires.some((wire) => wire.from === from && wire.to === to)) return false;

  const frontier = [to];
  const seen = new Set<string>();
  while (frontier.length) {
    const node = frontier.pop();
    if (node === undefined) break;
    if (node === from) return false;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const wire of wires) if (wire.from === node) frontier.push(wire.to);
  }
  return true;
}

/**
 * Which boxes the patch feeds. A box's lamp answers this and nothing else, so
 * the answer is derived from the wire list rather than tracked beside it.
 */
export function fedBy(wires: readonly Wire[]): ReadonlySet<string> {
  return new Set(wires.map((wire) => wire.to));
}

/**
 * The three strokes one cable is drawn with, outermost first: the shadow it
 * casts on the plate, the cable, and the light along its top edge.
 */
const STROKES: readonly string[] = [
  `stroke:${signals.wireShadow};opacity:${WIRE.shadowOpacity};stroke-linecap:round;`,
  `stroke:${signals.wireCore};stroke-linecap:round;`,
  `stroke:${signals.wireHighlight};`,
];

/** Which of {@link STROKES} is the cable itself, rather than its shadow or its shine. */
const CORE = 1;
/** And which is the light along its top edge — the first thing a dead cable loses. */
const SHINE = 2;

/** Build the wire layer. It draws whatever patch it is given, including none. */
export function createWireLayer(spec: WireLayerSpec): WireLayerHandle {
  let wires: Wire[] = (spec.wires ?? []).map((wire) => ({ from: wire.from, to: wire.to }));

  /** Tears down the drag in flight, if there is one. Null the rest of the time. */
  let endDrag: (() => void) | null = null;

  /**
   * Every drawn cable's curve, by its index in `wires` — the same points the
   * strokes were laid from, kept so a press can be measured against them. Null
   * where a wire is routed but has nothing on the board to be drawn between.
   */
  let curves: (Curve | null)[] = [];
  /** The cable strokes that are painted to say *this one*, by the same index. */
  let cores: (SVGPathElement | null)[] = [];
  /** Which cable is under the pointer and lit. -1 when none is. */
  let hot = -1;
  /** Which cable the button went down on, and where. -1 when it was not on one. */
  let pressed = -1;
  let pressedAt: Point = { x: 0, y: 0 };

  /** The top stroke of each cable, by the same index — put out on a dead one. */
  let shines: (SVGPathElement | null)[] = [];
  /**
   * Everything drawn for one cable — its three strokes and its wrap of tape —
   * by the same index. A cable lifted out of its jack is hidden whole for as
   * long as it is in the hand (gt#79), and this is what "whole" is.
   */
  let drawn: SVGElement[][] = [];
  /** What is putting signal out. Null until somebody says, and then all is live. */
  let live: ReadonlySet<string> | null = null;
  /** Whether the board is pinned. Pulses are the one moving thing here. */
  let still = false;
  /** Timers that will start a pulse's next leg, or take a finished one down. */
  const pulseTimers = new Set<ReturnType<typeof setTimeout>>();

  const element = svg(
    'svg',
    `position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;` +
      `z-index:${WIRE.zIndex};overflow:visible;`,
  );

  // The drawn cables live in their own group so a re-measure can empty it
  // without touching the temp wire, which has to outlive every redraw.
  const cables = svg('g', '', element);
  // The wraps of tape, in a group of their own above every cable rather than
  // beside the cable each belongs to (gt#36). Drawn inline with the strokes, a
  // mark would be painted over by whatever cable was measured after it — which
  // reads as a rendering fault, and on a busy patch would hide exactly the wraps
  // a busy patch is what you want them for.
  const marks = svg('g', '', element);
  // The pulses (gt#85), over the cables they run along and the tape they pass.
  // Inert and empty almost all of the time; one child exists per pulse, for as
  // long as it takes to cross one cable.
  const pulses = svg('g', '', element);
  const temp = svg(
    'path',
    `stroke:${signals.wireTemp};stroke-width:${WIRE.tempWidth}px;fill:none;` +
      `stroke-dasharray:${WIRE.tempDash};display:none;`,
    element,
  );

  /**
   * The plate's origin and the factor it is drawn at — both read off the one
   * rect, and neither taken on trust.
   *
   * The scale is *measured*, not looked up: the plate is a fixed
   * {@link BOARD.width} design, so whatever width it reports on screen divided
   * by that number is the factor it is actually being drawn at. This layer used
   * to read `--fit` off the body instead, which meant trusting a browser to
   * apply CSS `zoom` to `getBoundingClientRect` exactly the way we assumed —
   * historically the least portable thing on this board (gt#22), and the one
   * whose failure mode is every cable hanging visibly off its socket.
   *
   * Measuring it removes the assumption rather than verifying it. An engine that
   * scales the rect reports the real factor; one that does not — or that does
   * not support `zoom` at all — reports 1440 here and draws the board unscaled,
   * which is the same answer. The one number this file needs stays true if the
   * plate is ever scaled some other way, or by nothing at all.
   */
  function geometry(): BoardGeometry {
    const rect = spec.board.getBoundingClientRect();
    const fit = rect.width / BOARD.width;
    // A plate that is not laid out yet measures zero. Nothing is drawn on it
    // either, so the factor only has to be something that cannot divide by zero.
    return { rect, fit: fit > 0 ? fit : 1 };
  }

  /** The centre of one jack, in board space. Null when nothing carries that id. */
  function jackPoint(end: 'in' | 'out', id: string, geo: BoardGeometry): Point | null {
    const jack = spec.board.querySelector(`[data-jack-${end}="${id}"]`);
    if (!jack) return null;
    const rect = jack.getBoundingClientRect();
    return {
      x: (rect.left + rect.width / 2 - geo.rect.left) / geo.fit,
      y: (rect.top + rect.height / 2 - geo.rect.top) / geo.fit,
    };
  }

  function measure(): void {
    const geo = geometry();
    while (cables.firstChild) cables.removeChild(cables.firstChild);
    while (marks.firstChild) marks.removeChild(marks.firstChild);
    curves = wires.map(() => null);
    cores = wires.map(() => null);
    shines = wires.map(() => null);
    drawn = wires.map(() => []);
    // The cables a pulse was running along are gone. So is the pulse.
    clearPulses();
    // A redraw is a different set of cables. Whichever was lit is not lit on
    // these, and a press that began on the old ones does not finish on the new.
    hot = -1;
    pressed = -1;
    spec.board.style.cursor = '';

    wires.forEach((wire, index) => {
      const a = jackPoint('out', wire.from, geo);
      const b = jackPoint('in', wire.to, geo);
      // A wire whose ends are not both on the board is not an error and not
      // drawn: the engine still routes it, and the jack may simply not exist yet.
      if (!a || !b) return;

      const d = sagPath(a, b);
      curves[index] = sagCurve(a, b);
      STROKES.forEach((style, layer) => {
        const path = svg('path', `${style}stroke-width:${WIRE.strokes[layer]}px;fill:none;`, cables);
        path.setAttribute('d', d);
        // The cable itself — the middle stroke — carries the wire's index, which
        // is how anything reading the layer back tells one cable from the next,
        // and it is the stroke that is lit when the pointer is on it. It is not
        // a click target and nothing here is: see `at` below.
        if (layer === CORE) {
          path.dataset.wire = String(index);
          cores[index] = path;
        }
        if (layer === SHINE) shines[index] = path;
        drawn[index]?.push(path);
      });

      // The repair (gt#107): tape wound round the cable a little way back from
      // where it lands. Wound off the *source*, so two cables into one box are
      // taped differently and at different heights — which is the one thing
      // the box's lamp cannot say, since four cables into CAVERN light it
      // exactly as brightly as one.
      //
      // Nothing here is a label and nothing has to be read. It is in the
      // board's own tape, laid in the cable's own direction, and it is part of
      // the cable: lifted with it, faded with it, redrawn with it.
      const wrap = tapeWrap(sourceKey(wire.from));
      const seat = wrapAt(a, b, wrap.back);
      const mark = svg('g', '', marks);
      drawn[index]?.push(mark);
      mark.dataset.mark = wire.from;
      mark.setAttribute(
        'transform',
        `translate(${seat.x.toFixed(1)} ${seat.y.toFixed(1)}) rotate(${seat.angle.toFixed(1)})`,
      );
      const across = TAPE_WRAP.across;
      for (const turn of wrap.turns) {
        const strip = svg(
          'polygon',
          `fill:${turn.scrap ? ink.tapeScrap : ink.tape};stroke:${ink.tapeInk};` +
            `stroke-width:${WIRE.tape.edge}px;stroke-opacity:${WIRE.tape.edgeAlpha};stroke-linejoin:round;`,
          mark,
        );
        strip.dataset.turn = turn.scrap ? 'scrap' : 'tape';
        strip.setAttribute('points', turnPoints(turn));
      }
      // The end that has lifted, if it has: a flap standing off the last turn.
      const last = wrap.turns[wrap.turns.length - 1];
      if (wrap.tail && last) {
        const side = Math.sign(wrap.tail);
        const flap = svg(
          'polygon',
          `fill:${last.scrap ? ink.tapeScrap : ink.tape};stroke:${ink.tapeInk};` +
            `stroke-width:${WIRE.tape.edge}px;stroke-opacity:${WIRE.tape.edgeAlpha};stroke-linejoin:round;`,
          mark,
        );
        flap.dataset.turn = 'tail';
        const from = last.at + last.width * 0.1;
        const to = last.at + last.width * 0.5;
        const p = (x: number, y: number): string => `${x.toFixed(1)},${y.toFixed(1)}`;
        flap.setAttribute(
          'points',
          [
            p(from, side * across),
            p(to, side * across),
            p(to + 1.2, side * (across + Math.abs(wrap.tail))),
            p(from + 0.6, side * (across + Math.abs(wrap.tail) * 0.8)),
          ].join(' '),
        );
      }
      // Round, not flat: light along the top of the wrap and dark along its
      // underside, each one stroke the length of the whole thing.
      const half = wrap.length / 2;
      const along = (y: number): string => `M${(-half).toFixed(1)} ${y.toFixed(1)}L${half.toFixed(1)} ${y.toFixed(1)}`;
      const shine = svg(
        'path',
        `stroke:${signals.wireHighlight};stroke-width:${WIRE.tape.shine}px;fill:none;`,
        mark,
      );
      shine.dataset.turn = 'shine';
      shine.setAttribute('d', along(-across + WIRE.tape.inset));
      const shade = svg(
        'path',
        `stroke:${ink.tapeInk};stroke-width:${WIRE.tape.shade}px;stroke-opacity:${WIRE.tape.shadeAlpha};fill:none;`,
        mark,
      );
      shade.dataset.turn = 'shade';
      shade.setAttribute('d', along(across - WIRE.tape.inset));
    });
    // Freshly drawn paths are all live. Say again which are not.
    paint();
  }

  /**
   * Draw each cable live or dead (gt#85). A cable out of something that is putting
   * nothing out keeps its shape and loses its light: the copper dims and the
   * shine along its top edge goes, so it reads as a cable lying there rather
   * than one in use. The shadow stays — a dead cable still hangs over the plate.
   *
   * Appearance only, and set from what the seam says rather than from anything
   * measured: it needs no re-measure, so it is a pass over paths already drawn.
   */
  function paint(): void {
    wires.forEach((wire, index) => {
      const dead = live !== null && !live.has(wire.from);
      const core = cores[index];
      const shine = shines[index];
      if (core) core.style.opacity = dead ? String(WIRE.dead.core) : '';
      if (shine) shine.style.opacity = dead ? String(WIRE.dead.shine) : '';
    });
  }

  /** The timer that brings the cables back in after a blow. Null between blows. */
  let settleTimer: ReturnType<typeof setTimeout> | null = null;

  /** Cables and marks at full strength, now, whatever a settle was doing. */
  function showCables(): void {
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = null;
    for (const group of [cables, marks]) {
      group.style.transition = '';
      group.style.opacity = '';
    }
  }

  /** Drop every pulse in flight and every leg that had not started yet. */
  function clearPulses(): void {
    for (const timer of pulseTimers) clearTimeout(timer);
    pulseTimers.clear();
    while (pulses.firstChild) pulses.removeChild(pulses.firstChild);
  }

  const later = (ms: number, run: () => void): void => {
    const timer = setTimeout(() => {
      pulseTimers.delete(timer);
      run();
    }, ms);
    pulseTimers.add(timer);
  };

  /**
   * One pulse down every cable out of `id`, and then on from wherever each one
   * lands (gt#85).
   *
   * A pulse is a short bright dash on the cable's own curve. The dash is laid
   * just before the start, where none of it shows, and its offset is run to the
   * far end — so it enters at OUT, crosses, and leaves at IN, on a path that is
   * the same `d` the cable was drawn with and cannot drift off it.
   *
   * Every cable is crossed in the same time, whatever its length, so a long one
   * is simply faster: the pulse is the *hit* arriving, and the hit arrives at
   * every box it feeds at once. The next leg starts when this one lands. The
   * patch cannot loop (see {@link canConnect}), so the walk always ends.
   *
   * Refused rather than queued over {@link WIRE.pulse.cap}, as a bloom is and
   * for the same reason: MARACAS fires ten hits in a trigger, and a layer
   * catching up on light nobody is still looking for is worse than one that
   * skipped it.
   */
  function pulse(id: string): void {
    if (still) return;
    wires.forEach((wire, index) => {
      const curve = curves[index];
      if (wire.from !== id || !curve) return;
      if (pulses.childElementCount >= WIRE.pulse.cap) return;

      const length = cableLength(curve);
      const { dash, width, ms, opacity } = WIRE.pulse;
      const path = svg(
        'path',
        `stroke:${signals.wireTemp};stroke-width:${width}px;stroke-linecap:round;fill:none;` +
          `opacity:${opacity};stroke-dasharray:${dash} ${Math.ceil(length + dash)};` +
          `stroke-dashoffset:${dash};transition:stroke-dashoffset ${ms}ms linear;`,
        pulses,
      );
      path.setAttribute('d', sagPath(curve.a, curve.b));
      path.dataset.pulse = String(index);

      // Two frames before the flip, as a bloom needs: one to land in the tree,
      // one for the style it lands at to be something a transition can leave.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          path.style.strokeDashoffset = String(-Math.ceil(length));
        }),
      );

      later(ms, () => {
        path.remove();
        pulse(wire.to);
      });
    });
  }

  /**
   * Which cable a pointer event is on, or -1 — and the whole of how a cable is
   * found now that it takes no events of its own (gt#72).
   *
   * Two questions, in the order that costs least. Whether the thing actually
   * under the pointer has claimed it: if so the answer is no cable at all,
   * however close one hangs, which is what lets a knob be grabbed through a
   * cable draped across its face. Then the geometry.
   *
   * The reach is {@link WIRE.hitWidth} of *screen*, divided back into board
   * space — the same choice `DRAG` makes for a control. A hand does not get more
   * precise because the plate was scaled down to fit a small window, so a band
   * that shrank with the board would be hardest to hit exactly where the cables
   * are thinnest.
   */
  function at(event: PointerEvent): number {
    if (claimed(event.target, spec.board)) return -1;
    const geo = geometry();
    const point = {
      x: (event.clientX - geo.rect.left) / geo.fit,
      y: (event.clientY - geo.rect.top) / geo.fit,
    };
    return cableAt(point, curves, WIRE.hitWidth / 2 / geo.fit);
  }

  /** Light one cable and put out whichever was lit before. -1 lights none. */
  function light(index: number): void {
    if (index === hot) return;
    const was = cores[hot];
    if (was) was.style.stroke = signals.wireCore;
    hot = index;
    const now = cores[hot];
    // The colour a loose cable is dragged in. A lit cable is one that is about
    // to come loose, so it is the same statement rather than a new signal.
    if (now) now.style.stroke = signals.wireTemp;
    spec.board.style.cursor = hot >= 0 ? 'pointer' : '';
  }

  const onMove = (event: PointerEvent): void => {
    // With a button down this is a drag — a control being turned, a cable being
    // carried — and cables lighting up as it passes over them would be the board
    // offering to delete things in the middle of another gesture.
    if (event.buttons) return;
    light(at(event));
  };

  const onLeave = (): void => light(-1);

  const onDown = (event: PointerEvent): void => {
    // An IN socket with a cable in it (gt#79): the press lifts that cable out,
    // and what happens next is a drag like any other. Asked before the cable
    // geometry, because a socket has claimed the pointer and `at` would say so
    // and stop.
    if (event.button === 0 && event.target instanceof Element) {
      const to = event.target.closest('[data-jack-in]')?.getAttribute('data-jack-in');
      const lifted = to ? topCableInto(to) : -1;
      const wire = wires[lifted];
      if (wire) {
        pressed = -1;
        carry(wire.from, event, lifted);
        return;
      }
    }
    pressed = event.button === 0 ? at(event) : -1;
    pressedAt = { x: event.clientX, y: event.clientY };
  };

  /**
   * Which cable comes out of an IN socket when it is pulled: the last one
   * patched into it, like the top of a stack — the one a person most recently
   * put there, and so the one they are most likely reaching for. -1 for a
   * socket with nothing in it, or a cable that is not drawn.
   */
  function topCableInto(to: string): number {
    for (let index = wires.length - 1; index >= 0; index -= 1) {
      if (wires[index]?.to === to && curves[index]) return index;
    }
    return -1;
  }

  /**
   * The release, and the reason this is not a `click` listener.
   *
   * A browser fires `click` on the nearest common ancestor when the button goes
   * down on one element and comes up on another — so a knob dragged and let go
   * over open plate is a click *on the plate*, at wherever the pointer ended up,
   * and a layer listening for clicks would pull whatever cable hung there. A
   * cable goes only when the press began on it, ended on it, and did not travel:
   * {@link WIRE.slop} is how far a hand shakes between down and up.
   */
  const onUp = (event: PointerEvent): void => {
    const index = pressed;
    pressed = -1;
    if (index < 0) return;
    if (Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) > WIRE.slop) return;
    if (at(event) !== index) return;
    spec.onDisconnect?.(index);
  };

  spec.board.addEventListener('pointermove', onMove);
  spec.board.addEventListener('pointerleave', onLeave);
  spec.board.addEventListener('pointerdown', onDown);
  spec.board.addEventListener('pointerup', onUp);

  function beginDrag(from: string, event: PointerEvent): void {
    carry(from, event, -1);
  }

  /**
   * Carry a cable out of `from` until the button comes up. Two ways in, one
   * drag: a press on an OUT socket starts a *new* cable, and a press on an IN
   * socket lifts the one already in it (gt#79), in which case `lifted` is that
   * cable's index.
   *
   * A lifted cable is the board's one destructive act done with the board's one
   * gesture. Until gt#79 unpatching was a click anywhere along a cable — a tap, on
   * a board where everything else is a drag, with no way to change your mind
   * once the button was down. Lifted, it has all three answers a drag has:
   *
   * - dropped on another IN socket the rules accept, it is **moved** — which
   *   was not possible at all before, short of deleting one cable and dragging
   *   a second from the source;
   * - dropped back where it came from, or on a socket that would refuse it, it
   *   is **put back**, and nothing has happened;
   * - dropped anywhere else, it is **gone**.
   *
   * The source end never moves: the loose end follows the cursor from the OUT
   * socket exactly as a new cable's does. The layer still edits nothing — a
   * move is reported as the cable removed and a cable added, in that order, and
   * the caller's list is the only list.
   */
  function carry(from: string, event: PointerEvent, lifted: number): void {
    // Left button only. A right-click on a jack belongs to the browser.
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    // A cable being carried is not a cable being pointed at.
    light(-1);
    pressed = -1;

    /** Where a lifted cable was, and so where dropping it changes nothing. */
    const home = wires[lifted]?.to ?? null;
    // The rules are asked about the patch *without* the cable in the hand: it
    // is not in a socket while it is being carried, so it cannot be its own
    // duplicate and it cannot be the loop it would close.
    const rules = lifted >= 0 ? wires.filter((_, index) => index !== lifted) : wires;

    // Measured once, at the moment the drag starts: the board cannot move
    // underneath a cursor that is holding a cable.
    const geo = geometry();
    const start = jackPoint('out', from, geo);
    if (!start) return;

    // Where this cable may land (gt#77). Every IN socket the rules would accept
    // is lit for as long as the cable is in the hand, and the ones they would
    // refuse are left as they are — which is the explanation for a refused drop,
    // given before the drop instead of not at all. Asked once, here: the patch
    // cannot change while a hand is holding a cable, so the answer cannot either.
    //
    // The socket is the modifier component's, and this writes one property on
    // it and puts back exactly what was there. That is the same bargain the
    // shelf strikes with the plate's `filter`: appearance borrowed for the length
    // of a gesture, by the one thing that knows the gesture is happening.
    const open = new Map<HTMLElement, string>();
    for (const socket of spec.board.querySelectorAll<HTMLElement>('[data-jack-in]')) {
      const to = socket.getAttribute('data-jack-in');
      if (!to || !canConnect(rules, from, to)) continue;
      open.set(socket, socket.style.boxShadow);
      socket.style.boxShadow = `${jackTokens.shadow}, ${jackTokens.open}`;
    }
    // And the cable itself comes off the board while it is in the hand: every
    // stroke of it and its mark, so the only thing drawn between that source
    // and anywhere is the loose end being carried.
    const hidden = lifted >= 0 ? (drawn[lifted] ?? []) : [];
    for (const piece of hidden) piece.style.display = 'none';
    if (lifted >= 0) {
      // Shown from the press rather than from the first move: a cable that
      // vanished until the hand moved would read as having been deleted.
      const loose = {
        x: (event.clientX - geo.rect.left) / geo.fit,
        y: (event.clientY - geo.rect.top) / geo.fit,
      };
      temp.setAttribute('d', sagPath(start, loose));
      temp.style.display = 'block';
    }

    /** The open socket the cable is over, if it is over one. */
    let aimed: HTMLElement | null = null;
    const aim = (socket: HTMLElement | null): void => {
      if (socket === aimed) return;
      if (aimed) aimed.style.boxShadow = `${jackTokens.shadow}, ${jackTokens.open}`;
      aimed = socket;
      if (aimed) aimed.style.boxShadow = `${jackTokens.shadow}, ${jackTokens.aim}`;
    };

    const onMove = (moved: PointerEvent): void => {
      const loose = {
        x: (moved.clientX - geo.rect.left) / geo.fit,
        y: (moved.clientY - geo.rect.top) / geo.fit,
      };
      temp.setAttribute('d', sagPath(start, loose));
      temp.style.display = 'block';
      // What the pointer is over is the event's own target: nothing captures
      // it, and this layer is transparent to it. A socket that is not open is
      // not aimed at, however squarely the cable is over it.
      const under = moved.target instanceof Element ? moved.target.closest('[data-jack-in]') : null;
      aim(under instanceof HTMLElement && open.has(under) ? under : null);
    };

    const finish = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      temp.style.display = 'none';
      // Every socket back to exactly what it wore, however the drag ended — a
      // drop, a miss, or the layer being torn down with the cable in the air.
      for (const [socket, shadow] of open) socket.style.boxShadow = shadow;
      open.clear();
      aimed = null;
      // A lifted cable goes back on the board. If the drop moved or removed it
      // the caller is about to hand over a new list and these are redrawn
      // anyway; if it was put back, this is the putting back.
      for (const piece of hidden) piece.style.display = '';
      endDrag = null;
    };

    function onUp(released: PointerEvent): void {
      finish();
      // The layer covers the plate and is transparent to the pointer, every
      // stroke of it, so the thing under the cursor is whatever is on the plate.
      // It used to hide itself for this one call, back when its cables carried
      // a click band that would otherwise have been the answer.
      const under = document.elementFromPoint(released.clientX, released.clientY);

      const to = under?.closest('[data-jack-in]')?.getAttribute('data-jack-in') ?? null;
      if (lifted < 0) {
        if (!to || !canConnect(rules, from, to)) return;
        spec.onConnect?.({ from, to });
        return;
      }

      // Put back: where it came from, or a socket that would not have it. A
      // refused socket returns the cable rather than eating it — losing a patch
      // because the drop landed on the wrong jack is the accident this gesture
      // exists to remove.
      if (to === home || (to && !canConnect(rules, from, to))) return;
      spec.onDisconnect?.(lifted);
      // Moved, if it landed in a socket; otherwise it is simply gone.
      if (to) spec.onConnect?.({ from, to });
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    endDrag = finish;
  }

  // Once, now. Jack positions shift again when the typefaces land, and this
  // layer no longer guesses when that is: it used to re-measure across a ladder
  // of five timeouts, and ../fonts now reports the arrival to the seam, which
  // calls `measure` the way it already does on a resize (gt#47, gt#69).
  measure();

  return {
    element,
    setWires(next: readonly Wire[]): void {
      wires = next.map((wire) => ({ from: wire.from, to: wire.to }));
      measure();
    },
    measure,
    beginDrag,
    setLive(ids: ReadonlySet<string> | null): void {
      live = ids;
      paint();
    },
    strike: pulse,
    settle(): void {
      if (still) return;
      if (settleTimer) clearTimeout(settleTimer);
      // Out at once, back in on the next turn — the two-turn shape every
      // transition here needs, since one written in the tick that sets its
      // starting value never runs. Both groups: a wrap of tape left bright
      // over a cable that is fading in would be a mark floating in the air.
      for (const group of [cables, marks]) {
        group.style.transition = 'none';
        group.style.opacity = '0';
      }
      settleTimer = setTimeout(() => {
        settleTimer = null;
        for (const group of [cables, marks]) {
          group.style.transition = `opacity ${WIRE.settleMs}ms ease-out`;
          group.style.opacity = '1';
        }
      }, 0);
    },
    setStill(next: boolean): void {
      still = next;
      // Anything already running is taken down rather than left to finish, for
      // the reason the bloom layer does the same: a switch pressed mid-rattle
      // that let ten pulses go on travelling would be answering a beat late.
      if (still) clearPulses();
      // And cables caught half-faded come straight back: a stilled board shows
      // its whole patch, not a dim one.
      if (still) showCables();
    },
    destroy(): void {
      still = true;
      clearPulses();
      showCables();
      spec.board.removeEventListener('pointermove', onMove);
      spec.board.removeEventListener('pointerleave', onLeave);
      spec.board.removeEventListener('pointerdown', onDown);
      spec.board.removeEventListener('pointerup', onUp);
      light(-1);
      endDrag?.();
    },
  };
}
