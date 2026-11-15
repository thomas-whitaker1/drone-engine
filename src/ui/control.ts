// One control, six kinds. Every knob, fader, selector, valve wheel, lever and
// toggle bank on the board is an instance of this — SERIOUSNESS and the four
// modifier amounts included — so the hand only ever learns one gesture: press,
// drag up for more.
//
// The count grew from four under gt#34 and the uniformity is the reason it could:
// a board described as scavenged, built entirely from round knobs and neat
// faders, reads as a synth plugin rather than as salvage. What the extra kinds
// change is the *anatomy* and nothing else — {@link ControlSpec} and
// {@link ControlHandle} are the same shape they were at four, every kind answers
// the same press-and-drag, and a kind that needed a rotary gesture, a horizontal
// drag or a double-click would break the board's only piece of teaching and does
// not exist. A momentary press has no value and no range, so it is not a control
// at all — it is a board-level button, like SUMMON and SCRUB.
//
// The component owns how a control looks and how it answers a pointer. It owns
// no state beyond the value it was last told. Powering an off module on belongs
// to the board (`onPress`), persisting wear belongs to the weathering system
// (`onCommit`), and explaining what a control does belongs to the tip layer,
// which finds this element and reads its label. Keeping those out is what lets
// nine modules and four boxes share one file.
//
// Five departures from the reference markup, all deliberate:
//
// - **Every kind carries a wear tell, not just the round two.** The reference
//   halos knobs and valve wheels and leaves faders and selectors with nothing,
//   which makes the board's slowest feedback loop silent on two of its four
//   gestures — HOW LOUD is a fader on every one of the nine modules, and HOW
//   OFTEN a selector on five. The circle does not transfer, so neither does the
//   ring: a fader takes a bone bloom filling its lane, and a selector takes the
//   same ring as a knob at a wider inset, clearing its tick dots. See gt#18. The
//   two kinds gt#34 added answer it for themselves rather than borrowing either —
//   a thrown lever polishes a line down its slot, and a flicked toggle bank
//   gathers bone at the foot of the row where the fingertips land.
// - The wheel listener is non-passive and cancels the event. The reference lets
//   the page scroll underneath a spinning control; the board is at least a
//   viewport tall, so on a short window that means the control moves one notch
//   while everything else slides away. See gt#28.
// - **The drag reads raw client pixels and corrects for nothing.** The plate is
//   zoomed on a narrow window and the wire layer divides its coordinates back
//   out of that; this one does not, on purpose. See `DRAG` in ./constants — the
//   gesture is a fixed distance for the hand, not a fixed distance on the board.
// - The drag listens on `window` rather than calling `setPointerCapture`. The
//   reference does the same, and it is the version that survives the pointer
//   leaving the element, leaving the window, or the control being torn down
//   mid-drag.
// - Positions are written as explicit `top`/`right`/`bottom`/`left` rather than
//   the `inset` shorthand. Identical in a browser, and legible to anything that
//   reads the geometry back off the element. See `stretched` in ./dom.
// - Every piece carries a `data-part`. The reference has no need to name its
//   own parts; the wire layer, the tip layer and the suites all do.

import {
  CAPTION,
  CONTROL_SIZE,
  DRAG,
  FADER,
  GAUGE,
  GRIME,
  KNOB,
  KNOB_SWEEP,
  LEVER,
  RUPTURE,
  SELECTOR,
  TAPE,
  TOGGLES,
  TRAVEL,
  TRAVEL_VAR,
  VALVE,
  VALVE_SWEEP,
  WHEEL,
} from './constants';
import { box, masked, stretched } from './dom';
import { GRUBBY, rusted, scuffed, tarnished } from './grime';
import { controls, fonts, ink, sourcePlates, toggle, wear } from '../tokens';

/** The six kinds. Which one a control is never changes after it is built. */
export type ControlKind = 'knob' | 'fader' | 'selector' | 'wheel' | 'lever' | 'toggles';

/** One fader's gauge: what its marks are, how many, and which side they are cut on. */
export interface GaugeSpec {
  readonly shape: (typeof GAUGE.shapes)[number];
  readonly count: number;
  readonly side: (typeof GAUGE.sides)[number];
}

/**
 * How far out one mark of a gauge reaches, in pixels: `at` is 0 for the bottom
 * mark and 1 for the top. Widening upward is the whole of what the gauge says.
 */
export const gaugeReach = (shape: GaugeSpec['shape'], at: number): number => {
  const t = Math.min(1, Math.max(0, at));
  if (shape === 'dots') return Number((GAUGE.dotMin + (GAUGE.dotMax - GAUGE.dotMin) * t).toFixed(2));
  return Number((GAUGE.min + (GAUGE.width - GAUGE.min) * t).toFixed(2));
};

export interface ControlSpec {
  readonly kind: ControlKind;

  /**
   * What this control belongs to and what it sets — a module id and `char`, or
   * `g` and `seriousness`. Together they are the wear key, and they are the only
   * reason the component knows anything about the board at all.
   */
  readonly scope: string;
  readonly param: string;

  /** The one word on the tape strip. */
  readonly label: string;

  /**
   * How many positions a stepped control has. Absent or zero means continuous:
   * the value is a 0–1 fraction rather than an index.
   */
  readonly steps?: number;

  /** One word per step, shown under the label. Words only, never numbers. */
  readonly words?: readonly string[];

  /** 0–1 when continuous, an integer index when stepped. */
  readonly value: number;

  /** The module's face colour. Defaults to GUITAR WALL's. */
  readonly face?: string;

  /**
   * Knobs, selectors and wheels are round; a fader and a lever take `height`
   * instead, and a toggle bank is measured out of its own handles.
   */
  readonly diameter?: number;
  readonly height?: number;
  readonly width?: number;
  readonly fontSize?: number;

  /** Tape strip colour — the scrap variant exists for the odd label. */
  readonly tape?: string;

  /**
   * Built with no tape strip at all (gt#63), for a control whose word is already
   * painted on the plate it sits in.
   *
   * That is every box of THE CHAIN and nothing else. A source module's plate
   * carries the module's name and its controls carry *other* words — CROWD, HOW
   * LOUD, HOW OFTEN — so its tapes are the only place those are said. A chain
   * box has one amount, named for the box, and with a tape it said GRIT on the
   * plate and GRIT again forty pixels under it.
   *
   * The word does not go with the strip. It stays on the element as
   * `data-label`, which is how the tip layer finds a control's line when there
   * is no tape to read it off — see `labelOf` in ./tips. A bare control is one
   * that says its word once, not one that has none.
   */
  readonly bare?: boolean;

  /**
   * Draw the range the other way up (gt#51): the control's top, or its clockwise
   * end, is the *lowest* value rather than the highest, and a drag upward
   * lowers it.
   *
   * For a value whose numbers run against what a hand expects of the hardware.
   * HOW OFTEN is the case: its first step is *constantly* and its last is
   * *almost never*, which a round selector can lay out either way round
   * without anyone minding — but a lever thrown all the way up, or a bank with
   * every switch on, has to mean *more*. The value the board holds and the
   * word under the control are untouched; only which way the hardware reads
   * is turned over.
   */
  readonly invert?: boolean;

  /**
   * A loudness gauge cut beside the lane (gt#90). Faders only; see {@link GAUGE}.
   * A control with one is usually also {@link ControlSpec.bare}: the gauge is
   * what stands where the tape did.
   */
  readonly gauge?: GaugeSpec;

  /** Completed drags so far. Drives the bone tell behind the control, whatever shape it takes. */
  readonly wearTurns?: number;

  /**
   * Build the control with no tell at all (gt#117): its drags are still counted
   * by whoever counts them, and nothing is drawn for them.
   *
   * The tell is a pale bloom behind the control that comes up with use, and
   * on most of the board it is the right thing — a knob somebody keeps going
   * back to should look like it. On a tall lever standing alone it is a pale
   * band down either side of the slot, and it reads as the lever being lit
   * from behind rather than as a lever that has been handled. MEGADRIFT is
   * the one such, and Thomas asked for it off.
   */
  readonly untold?: boolean;

  /**
   * The control was touched, before any value has changed. The board powers an
   * off module on here, so that no control on the board is ever dead.
   */
  readonly onPress?: () => void;

  /** The value moved. Fires on every step of a drag and on every wheel notch. */
  readonly onInput: (value: number) => void;

  /**
   * A drag finished having actually moved. A bare click never reaches here,
   * which is what keeps the wear rings honest about use.
   */
  readonly onCommit?: (key: string) => void;
}

export interface ControlHandle {
  /** The column: control, tape label, and a word if it is a stepped one. */
  readonly element: HTMLElement;
  /** `scope.param` — how wear is counted and how the board finds this control. */
  readonly key: string;
  /**
   * Take a value the board decided on, without calling back into it.
   *
   * `shown` is where the piece is drawn, when that is not where it is *set*
   * (gt#91): MEGADRIFT carries a control away from where a hand left it, and the
   * two numbers have two different readers. The drawn one is what is being
   * heard. The set one is what a gesture starts from — a drag adds the hand's
   * travel to it, a notch of the wheel steps from it — so a drifting control
   * moves by exactly what the hand did, and the drift it was carrying is not
   * folded into the setting every time it is touched. Left out, the two are the
   * same number, which is every control on a board that is not drifting.
   */
  setValue(value: number, shown?: number): void;
  setWear(turns: number): void;
  /** Detach every listener, including one mid-drag. */
  destroy(): void;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** Where a value sits in its range, 0–1, whether it is stepped or not. */
function fraction(value: number, steps: number): number {
  if (!steps) return clamp01(value);
  if (steps < 2) return 0;
  return clamp01(value / (steps - 1));
}

/** Snap a fraction back to whatever the control actually stores. */
function quantise(fractionOfRange: number, steps: number): number {
  return steps ? Math.round(fractionOfRange * Math.max(0, steps - 1)) : fractionOfRange;
}

/**
 * How far under a mark the cap may sit and still light it. A fader pushed to a
 * mark by hand lands a hair either side of it, and a mark that flickered on a
 * rounding error would be the gauge reporting noise.
 */
const GAUGE_SLACK = 0.004;

/** Knobs and selectors sweep 264°; a valve wheel turns 320°. */
function angleFor(kind: ControlKind, fractionOfRange: number): number {
  if (kind === 'wheel') return Math.round(fractionOfRange * VALVE_SWEEP);
  return Math.round((KNOB_SWEEP.start + KNOB_SWEEP.span * fractionOfRange) * 10) / 10;
}

/** Where each of a selector's tick dots is pinned. One per step, always. */
export function tickAngles(steps: number): number[] {
  const angles: number[] = [];
  for (let i = 0; i < steps; i += 1) {
    angles.push(Math.round(angleFor('selector', fraction(i, steps))));
  }
  return angles;
}

/** How far up the bone tell has come, from the drags the control has taken. */
export function wearOpacity(turns: number): number {
  return Math.min(wear.maxOpacity, Math.max(0, turns) / wear.turnsToFull);
}

/**
 * Build one control. Nothing is measured or mounted here — the caller decides
 * where {@link ControlHandle.element} goes.
 */
export function createControl(spec: ControlSpec): ControlHandle {
  const steps = spec.steps ?? 0;
  const key = `${spec.scope}.${spec.param}`;
  const face = spec.face ?? sourcePlates.guitar.face;
  const diameter = spec.diameter ?? CONTROL_SIZE.diameter;
  const height = spec.height ?? CONTROL_SIZE.faderHeight;
  const fontSize = spec.fontSize ?? CONTROL_SIZE.fontSize;

  let value = spec.value;
  /** Where the piece is drawn. `value` unless the board said otherwise (gt#91). */
  let shown = spec.value;

  /** Where a value sits on the hardware, 0–1: its place in the range, turned over if asked (gt#51). */
  const place = (of: number): number =>
    spec.invert ? 1 - fraction(of, steps) : fraction(of, steps);
  /** The value a place on the hardware stands for. The inverse of {@link place}. */
  const valueAt = (at: number): number => quantise(spec.invert ? 1 - at : at, steps);
  /** Which way a push toward *more hardware* moves the value: up, or down if inverted. */
  const sense = spec.invert ? -1 : 1;
  let turns = spec.wearTurns ?? 0;

  const element = box(
    'control',
    `display:flex;flex-direction:column;align-items:center;gap:${TAPE.gap}px;` +
      `user-select:none;touch-action:none;cursor:ns-resize;position:relative;` +
      `width:${spec.width ?? CONTROL_SIZE.width}px;`,
  );
  element.dataset.control = key;
  element.dataset.kind = spec.kind;
  // The word, on the element itself as well as on the tape. Every control
  // carries it, not only the bare ones: what a control is called should not be
  // something that can only be found by reading its lettering back (gt#63).
  element.dataset.label = spec.label;
  // And whether it reads the other way up (gt#51), for anything that has to know
  // which way a drag moves the value without being told by whoever built it.
  if (spec.invert) element.dataset.inverted = '';

  // The piece that answers the value, and the tell behind it. Every kind has a
  // tell; which of the other three it has depends on the kind, and nothing below
  // touches one without checking. A kind either turns, slides, or flips a row of
  // handles — never two of the three.
  let turning: HTMLElement | null = null;
  let sliding: HTMLElement | null = null;
  /** How far {@link sliding} travels, in pixels, end to end. */
  let slideTravel = 0;
  const bats: HTMLElement[] = [];
  let halo: HTMLElement | null = null;

  const round = (): HTMLDivElement =>
    box('seat', `position:relative;width:${diameter}px;height:${diameter}px;`, element);

  /** The gauge's separate marks, bottom first, and how high each one stands (0–1). */
  const marks: Array<{ readonly node: HTMLElement; readonly at: number }> = [];
  /** The gauge when it is one solid wedge rather than separate marks. */
  let wedge: HTMLElement | null = null;

  /**
   * Cut the gauge beside a fader's lane (gt#90). It hangs off the seat on the
   * side it was given and spans exactly the travel of the cap's middle, so a
   * mark and the cap line up when the fader is at that mark's level.
   *
   * Anchored to the lane and growing away from it: the marks start level where
   * they meet the fader and it is their far ends that climb outward.
   */
  function buildGauge(seat: HTMLElement, gauge: GaugeSpec): void {
    const right = gauge.side === 'right';
    const inset = FADER.capHeight / 2;
    const body = box(
      'gauge',
      `position:absolute;${right ? 'left' : 'right'}:100%;` +
        `margin-${right ? 'left' : 'right'}:${GAUGE.gap}px;top:${inset}px;bottom:${inset}px;` +
        `width:${GAUGE.width}px;pointer-events:none;`,
      seat,
    );
    body.dataset.shape = gauge.shape;
    body.dataset.side = gauge.side;

    if (gauge.shape === 'wedge') {
      // One piece of metal, narrow at the bottom and the full width at the top.
      const narrow = right ? `${GAUGE.min}px` : `calc(100% - ${GAUGE.min}px)`;
      const near = right ? '0' : '100%';
      const far = right ? '100%' : '0';
      wedge = box(
        'wedge',
        `${stretched()}clip-path:polygon(${near} 100%, ${narrow} 100%, ${far} 0, ${near} 0);`,
        body,
      );
      return;
    }

    const count = Math.max(2, Math.floor(gauge.count));
    for (let i = 0; i < count; i += 1) {
      const at = i / (count - 1);
      const reach = gaugeReach(gauge.shape, at);
      const thick =
        gauge.shape === 'dots' ? reach : gauge.shape === 'blocks' ? GAUGE.block : GAUGE.bar;
      const node = box(
        'notch',
        `position:absolute;${right ? 'left' : 'right'}:0;` +
          `bottom:calc(${Number((at * 100).toFixed(2))}% - ${thick / 2}px);` +
          `width:${reach}px;height:${thick}px;` +
          (gauge.shape === 'dots' ? 'border-radius:50%;' : ''),
        body,
      );
      marks.push({ node, at });
    }
  }

  if (spec.kind === 'knob') {
    const seat = round();
    halo = box(
      'wear',
      `${stretched(KNOB.wearInset)}border-radius:50%;background:${controls.wearRing};pointer-events:none;`,
      seat,
    );
    // The lit body, which does not turn (gt#93). Everything on it is the room's
    // light and not the knob's own: the highlight up and to the left, the shade
    // under the lower edge, the shadow it drops on the plate. They used to be on
    // the piece that rotates, so turning a knob swung its shadow round with the
    // pointer — as though the lamp in the room turned whenever a knob did. The
    // light on this board comes from one place.
    box(
      'face',
      `${stretched()}border-radius:50%;background:radial-gradient(${KNOB.faceOrigin}, ${face}, ` +
        `${controls.faceDark} ${KNOB.faceStop}%, ${controls.knobRim} 100%);` +
        `box-shadow:${controls.knobShadow};`,
      seat,
    );
    // And the dial over it, which is all that turns: what is physically cut into
    // the cap. The pointer, and a ring of grip lines round the edge — added with
    // the split, because a body that no longer turns left the pointer as the
    // only thing on a knob that showed it moving.
    turning = box('dial', `${stretched()}border-radius:50%;`, seat);
    // Scuffs on the cap, under the pointer and turning with it (gt#118).
    scuffed(turning, key, GRIME.cap, '50%');
    box(
      'knurl',
      `${stretched()}border-radius:50%;background:${controls.knurl};pointer-events:none;` +
        `opacity:${KNOB.knurl.opacity};` +
        masked(
          `radial-gradient(circle closest-side, transparent ${KNOB.knurl.from}%, ` +
            `#000 ${KNOB.knurl.from + KNOB.knurl.feather}%)`,
        ),
      turning,
    );
    box(
      'mark',
      `position:absolute;left:50%;top:${KNOB.mark.top};width:${KNOB.mark.width};` +
        `height:${KNOB.mark.height};margin-left:${KNOB.mark.marginLeft};` +
        `border-radius:${KNOB.mark.radius};background:${controls.mark};` +
        `box-shadow:${controls.markShadow};`,
      turning,
    );
  } else if (spec.kind === 'fader') {
    const seat = box('seat', `position:relative;width:${FADER.lane}px;height:${height}px;`, element);
    halo = box(
      'wear',
      `${stretched(FADER.wearInset)}background:${controls.faderWearGlow};pointer-events:none;`,
      seat,
    );
    box(
      'rail',
      `position:absolute;left:50%;top:0;bottom:0;width:${FADER.railWidth}px;` +
        `margin-left:${-FADER.railWidth / 2}px;background:${controls.faderRail};` +
        `border-radius:${FADER.railRadius}px;box-shadow:${controls.faderRailShadow};`,
      seat,
    );
    sliding = box(
      'cap',
      `position:absolute;left:50%;width:${FADER.capWidth}px;height:${FADER.capHeight}px;` +
        `margin-left:${-FADER.capWidth / 2}px;background:${controls.faderCap};` +
        `border-radius:${FADER.capRadius}px;box-shadow:${controls.faderCapShadow};`,
      seat,
    );
    slideTravel = height - FADER.capHeight;
    // A dull patch where the thumb goes (gt#118), under the index line.
    tarnished(sliding, key, `${FADER.capRadius}px`);
    if (spec.gauge) buildGauge(seat, spec.gauge);
    box(
      'index',
      `position:absolute;left:${FADER.indexInset}px;right:${FADER.indexInset}px;` +
        `top:${FADER.indexTop}px;height:${FADER.indexHeight}px;background:${controls.faderIndex};` +
        `opacity:${FADER.indexOpacity};`,
      sliding,
    );
  } else if (spec.kind === 'lever') {
    const seat = box('seat', `position:relative;width:${LEVER.lane}px;height:${height}px;`, element);
    halo = box(
      'wear',
      `${stretched(LEVER.wearInset)}background:${controls.leverWearScuff};pointer-events:none;`,
      seat,
    );
    box(
      'slot',
      `position:absolute;left:50%;top:0;bottom:0;width:${LEVER.slotWidth}px;` +
        `margin-left:${-LEVER.slotWidth / 2}px;background:${controls.leverSlot};` +
        `border-radius:${LEVER.slotRadius}px;box-shadow:${controls.leverSlotShadow};`,
      seat,
    );
    // One detent per step, at the height that step throws the bar to — the same
    // rule as a selector's dots, so the scale is cut into the hardware. A
    // continuous lever has no scale to cut and gets a smooth slot.
    for (let i = 0; i < steps; i += 1) {
      box(
        'notch',
        `position:absolute;left:${LEVER.notchInset}px;right:${LEVER.notchInset}px;` +
          `bottom:${Math.round(fraction(i, steps) * (height - LEVER.barHeight))}px;` +
          `height:${LEVER.notchHeight}px;background:${controls.leverNotch};pointer-events:none;`,
        seat,
      );
    }
    sliding = box(
      'bar',
      `position:absolute;left:50%;width:${LEVER.barWidth}px;height:${LEVER.barHeight}px;` +
        `margin-left:${-LEVER.barWidth / 2}px;background:${controls.leverBar};` +
        `border-radius:${LEVER.barRadius}px;box-shadow:${controls.leverBarShadow};`,
      seat,
    );
    slideTravel = height - LEVER.barHeight;
    // A dull patch on the bar (gt#118), under the grip's ribs.
    tarnished(sliding, key, `${LEVER.barRadius}px`);
    box(
      'grip',
      `position:absolute;top:${LEVER.grip.insetY}px;bottom:${LEVER.grip.insetY}px;` +
        `left:${LEVER.grip.insetX}px;right:${LEVER.grip.insetX}px;` +
        `border-radius:${LEVER.grip.radius}px;background:${controls.leverGrip};`,
      sliding,
    );
  } else if (spec.kind === 'toggles') {
    // `steps - 1` bats, so that all down and all up are both reachable and the
    // value is exactly how many are up. A continuous bank has no step count to
    // take one from and falls back to a fixed row it rounds onto.
    const count = steps ? Math.max(1, steps - 1) : TOGGLES.handles;
    const seat = box(
      'seat',
      `position:relative;display:flex;gap:${TOGGLES.gap}px;` +
        `width:${count * TOGGLES.well.width + (count - 1) * TOGGLES.gap}px;` +
        `height:${TOGGLES.well.height}px;`,
      element,
    );
    halo = box(
      'wear',
      `${stretched(TOGGLES.wearInset)}background:${controls.toggleWearHaze};pointer-events:none;`,
      seat,
    );
    for (let i = 0; i < count; i += 1) {
      const well = box(
        'well',
        `position:relative;width:${TOGGLES.well.width}px;height:${TOGGLES.well.height}px;` +
          `border-radius:${TOGGLES.well.radius}px;background:${toggle.well};` +
          `box-shadow:${toggle.wellShadow};`,
        seat,
      );
      const bat = box(
        'bat',
        `position:absolute;left:${TOGGLES.bat.left}px;width:${TOGGLES.bat.width}px;` +
          `height:${TOGGLES.bat.height}px;border-radius:${TOGGLES.bat.radius}px;` +
          `background:${toggle.nub};box-shadow:${toggle.nubShadow};`,
        well,
      );
      // A dull patch on each bat (gt#118), and not the same one on each.
      tarnished(bat, `${key}:${i}`, `${TOGGLES.bat.radius}px`);
      bats.push(bat);
    }
  } else if (spec.kind === 'selector') {
    const seat = round();
    // First into the seat, so it sits behind both the dots and the disc.
    halo = box(
      'wear',
      `${stretched(SELECTOR.wearInset)}border-radius:50%;background:${controls.wearRing};pointer-events:none;`,
      seat,
    );
    // One dot per step, each at the angle the disc points to when that step is
    // chosen — the dots are the scale, not decoration.
    for (const tick of tickAngles(steps)) {
      const arm = box(
        'tick',
        `${stretched(SELECTOR.tickInset)}transform:rotate(${tick}deg);pointer-events:none;`,
        seat,
      );
      box(
        'dot',
        `position:absolute;left:50%;top:0;width:${SELECTOR.tickSize}px;height:${SELECTOR.tickSize}px;` +
          `margin-left:${-SELECTOR.tickSize / 2}px;border-radius:50%;background:${ink.stencilTick};`,
        arm,
      );
    }
    // The disc sits inside its box so the dots have a ring to stand on. Lit
    // body first and the dial that turns over it, as on a knob (gt#93).
    box(
      'face',
      `${stretched(-SELECTOR.discInset)}border-radius:50%;` +
        `background:radial-gradient(${SELECTOR.faceOrigin}, ${face}, ${controls.faceDark} ${SELECTOR.faceStop}%);` +
        `box-shadow:${controls.selectorShadow};`,
      seat,
    );
    turning = box('dial', `${stretched(-SELECTOR.discInset)}border-radius:50%;`, seat);
    // Scuffs on the disc, turning with it (gt#118).
    scuffed(turning, key, GRIME.cap, '50%');
    box(
      'wedge',
      `position:absolute;left:50%;top:${SELECTOR.wedgeTop}px;width:0;height:0;` +
        `margin-left:${-SELECTOR.wedgeHalfWidth}px;` +
        `border-left:${SELECTOR.wedgeHalfWidth}px solid transparent;` +
        `border-right:${SELECTOR.wedgeHalfWidth}px solid transparent;` +
        `border-bottom:${SELECTOR.wedgeHeight}px solid ${controls.mark};`,
      turning,
    );
  } else {
    const seat = round();
    halo = box(
      'wear',
      `${stretched(VALVE.wearInset)}border-radius:50%;background:${controls.wheelWearRing};pointer-events:none;`,
      seat,
    );
    // What the wheel does to the light, which stays where it is while the
    // wheel goes round (gt#93): the shadow it drops, the highlight inside its rim,
    // and the dark of the well behind the spokes. Cut to the rim's own shape —
    // the same border, see-through — so every edge falls where it did when the
    // rim carried them itself.
    box(
      'cast',
      `${stretched()}border-radius:50%;border:${VALVE.rim}px solid transparent;` +
        `box-shadow:${controls.wheelShadow};background:${controls.wheelWell};pointer-events:none;`,
      seat,
    );
    // Rim and spokes turn together — a valve wheel is one object. Flat metal,
    // both of them, so there is nothing on either that says which way is up.
    turning = box('assembly', stretched(), seat);
    box(
      'rim',
      `${stretched()}border-radius:50%;border:${VALVE.rim}px solid ${controls.wheelRim};`,
      turning,
    );
    for (const spoke of VALVE.spokeAngles) {
      box(
        'spoke',
        `position:absolute;left:50%;top:${VALVE.spokeInset}px;bottom:${VALVE.spokeInset}px;` +
          `width:${VALVE.spokeWidth}px;margin-left:${-VALVE.spokeWidth / 2}px;` +
          `background:${controls.wheelSpoke};box-shadow:${controls.wheelSpokeShadow};` +
          `transform:rotate(${spoke}deg);`,
        turning,
      );
    }
    // Rust on the rim (gt#118), turning with the wheel it is on.
    rusted(turning, key, diameter, VALVE.rim);
    // The hub is on the axle and round, so turning it shows nothing but its
    // own highlight and shadow going round — which is the fault. It sits over
    // the assembly and stays put (gt#93).
    box(
      'hub',
      `position:absolute;left:50%;top:50%;width:${VALVE.hub}px;height:${VALVE.hub}px;` +
        `margin-left:${-VALVE.hub / 2}px;margin-top:${-VALVE.hub / 2}px;border-radius:50%;` +
        `background:${controls.wheelHub};box-shadow:${controls.wheelHubShadow};pointer-events:none;`,
      seat,
    );
  }

  // How the moving piece gets from one value to the next (gt#80): at once, unless
  // the plate above has said otherwise. `--travel` is unset almost always, and
  // unset is `0s`, so a hand turning this control sees it follow with nothing in
  // between. For a third of a second after the hammer lands the board sets it,
  // and the piece travels to where the blow sent it instead of appearing there.
  // The control knows none of that — it knows a duration it was handed.
  if (turning) turning.style.transition = `transform var(${TRAVEL_VAR}, 0s) ${TRAVEL.turn}`;
  if (sliding) sliding.style.transition = `bottom var(${TRAVEL_VAR}, 0s) ${TRAVEL.slide}`;
  for (const bat of bats) bat.style.transition = `top var(${TRAVEL_VAR}, 0s) ${TRAVEL.slide}`;

  // The label is read after the act, never before, so one word is all it says.
  //
  // And it is the one thing on this board that tilts (gt#39) — deliberately, and
  // only ever off `--melt`, which is zero on any board nobody has armed. The rule
  // that nothing here is tilted exists so a glance stays readable; peeling the
  // tape is the shelf saying the board has stopped being readable, and getting
  // there takes arming a switch and then driving MURK past two thirds. The
  // transform origin is the left end, so the strip lifts from one corner the way
  // tape actually comes away, rather than pivoting about its middle.
  //
  // A bare control has none (gt#63): its word is on the plate it sits in, and a
  // second copy under the control is the same word twice in one glance.
  if (!spec.bare) {
    const tape = box(
      'tape',
      `background:${spec.tape ?? ink.tape};${GRUBBY}color:${ink.tapeInk};font-family:${fonts.tape};` +
        `font-size:${fontSize}px;line-height:${TAPE.lineHeight};padding:${TAPE.padY}px ${TAPE.padX}px;` +
        `box-shadow:${ink.tapeShadow};white-space:nowrap;` +
        `transform-origin:0% 50%;rotate:calc(var(--melt, 0) * ${RUPTURE.melt.maxTiltDeg}deg);`,
      element,
    );
    tape.textContent = spec.label;
  }

  const caption = spec.words
    ? box(
        'word',
        `font-family:${fonts.body};font-size:${CAPTION.fontSize}px;color:${ink.caption};` +
          `opacity:${CAPTION.opacity};letter-spacing:${CAPTION.letterSpacing}px;white-space:nowrap;`,
        element,
      )
    : null;

  /**
   * What each piece was last drawn at, so a redraw that moves nothing writes
   * nothing. The board redraws every control it has on every gesture and on
   * every drift tick, and nearly all of them are where they already were: a
   * style restated is at best a string the browser has to parse to find that
   * out, and a caption restated is a text node replaced — a layout and a
   * repaint of the plate for a word that did not change.
   */
  const drawn: {
    turn?: number;
    slide?: number;
    up?: number;
    lit?: number;
    level?: number;
    halo?: string;
    word?: string;
  } = {};

  function render(): void {
    const fractionOfRange = place(shown);
    if (turning) {
      const angle = angleFor(spec.kind, fractionOfRange);
      if (angle !== drawn.turn) {
        drawn.turn = angle;
        turning.style.transform = `rotate(${angle}deg)`;
      }
    }
    if (sliding) {
      const at = Math.round(fractionOfRange * slideTravel);
      if (at !== drawn.slide) {
        drawn.slide = at;
        sliding.style.bottom = `${at}px`;
      }
    }
    // On a stepped bank this lands on the value itself, since the fraction is the
    // value over exactly this many handles. Up is the smaller number, as it is
    // for a module's power nub — a flipped bat stands nearer the top of its well.
    if (bats.length) {
      const up = Math.round(fractionOfRange * bats.length);
      if (up !== drawn.up) {
        drawn.up = up;
        bats.forEach((bat, i) => {
          bat.style.top = `${i < up ? TOGGLES.bat.on : TOGGLES.bat.off}px`;
        });
      }
    }
    // The gauge answers the fader (gt#90): lit up to where the cap is drawn — which
    // on a drifting board is where the level is heard, not where it was set.
    if (marks.length) {
      // The marks stand in order, so how many are lit says which.
      let lit = 0;
      for (const mark of marks) if (mark.at <= fractionOfRange + GAUGE_SLACK) lit += 1;
      if (lit !== drawn.lit) {
        drawn.lit = lit;
        for (const mark of marks) {
          mark.node.style.background =
            mark.at <= fractionOfRange + GAUGE_SLACK ? controls.gaugeLit : controls.gaugeDim;
        }
      }
    }
    if (wedge) {
      const level = Number((fractionOfRange * 100).toFixed(1));
      if (level !== drawn.level) {
        drawn.level = level;
        wedge.style.background =
          `linear-gradient(to top, ${controls.gaugeLit} ${level}%, ${controls.gaugeDim} ${level}%)`;
      }
    }
    if (halo) {
      const opacity = spec.untold ? '0' : String(wearOpacity(turns));
      if (opacity !== drawn.halo) {
        drawn.halo = opacity;
        halo.style.opacity = opacity;
      }
    }
    if (caption && spec.words) {
      const word = spec.words[value] ?? '';
      if (word !== drawn.word) {
        drawn.word = word;
        caption.textContent = word;
      }
    }
  }

  /** Move to a value and tell the board. Ignored if nothing actually changed. */
  function drive(next: number): void {
    if (next === value) return;
    value = next;
    // Drawn under the hand first. A board that is drifting draws it again, where
    // it is heard, before this call returns — and nothing paints in between.
    shown = next;
    render();
    spec.onInput(next);
  }

  let releaseDrag: (() => void) | null = null;

  function onPointerDown(event: PointerEvent): void {
    // Right and middle buttons belong to the browser, not to the board.
    if (event.button !== 0) return;
    event.preventDefault();
    spec.onPress?.();

    const startY = event.clientY;
    const start = place(value);
    let moved = false;

    const onMove = (moveEvent: PointerEvent): void => {
      moved = true;
      drive(valueAt(clamp01(start + (startY - moveEvent.clientY) / DRAG.fullRangePx)));
    };
    const onUp = (): void => {
      releaseDrag?.();
      // A press that never moved is someone waking a module, not wearing a knob.
      if (moved) spec.onCommit?.(key);
    };

    releaseDrag = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      releaseDrag = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  let lastNotch = 0;

  function onWheel(event: WheelEvent): void {
    // Every wheel event over a control is swallowed, including the nine in ten
    // the throttle then discards — otherwise the control moves one notch while
    // the board slides out from under the cursor. The listener is registered
    // non-passive so this is actually allowed to take effect.
    event.preventDefault();
    const now = Date.now();
    if (lastNotch && now - lastNotch < WHEEL.throttleMs) return;
    lastNotch = now;
    drive(
      steps
        ? Math.max(0, Math.min(steps - 1, value + sense * (event.deltaY > 0 ? -WHEEL.step : WHEEL.step)))
        : clamp01(value - sense * event.deltaY * WHEEL.perPixel),
    );
  }

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('wheel', onWheel, { passive: false });
  render();

  return {
    element,
    key,
    setValue(next: number, seen: number = next): void {
      value = next;
      shown = seen;
      render();
    },
    setWear(next: number): void {
      turns = next;
      render();
    },
    destroy(): void {
      releaseDrag?.();
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('wheel', onWheel);
    },
  };
}
