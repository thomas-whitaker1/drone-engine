// The advanced-effects shelf (gt#39): six ways for the board to come apart, none
// of which exist until somebody arms them.
//
// ./atmosphere is the restrained half of the visual system and it stays exactly
// as it was — a 3.5% scale, a lerp a tenth per frame, and a file that says
// outright that anything sharp enough to read as a response to a note would be
// the wrong thing. **That is still the resting state and still the first
// impression.** This file is what sits on top of it, opt-in, and its whole design
// is arranged around not being able to lie about that.
//
// ## The one arm and the one dial
//
// COME APART (../apart) decides whether any of this is reachable; GRIT decides
// how far it goes. That split is not decoration — GRIT was already the board's
// *how broken is this* control, driving the film grain and both chromatic
// fringes, so every effect here is a further answer to a question the board was
// already asking. {@link apartAmount} is the whole of the join: one number, zero
// unless armed and past the floor, and every one of the six is scaled by it.
//
// ## Five rules, and how each one is kept rather than promised
//
// - **Off by default, all of it.** Not a default value here but a property of
//   ../apart, which has no system default to open on and falls back to off on
//   every storage failure. Disarmed, this file writes no variable that is not its
//   own resting value, mounts no filter on the plate, and runs no animation.
// - **One switch kills every one of them.** {@link RuptureHandle.setStill} is
//   that switch's landing, and it does not consult the arm: stilled is stilled
//   whatever COME APART says. ../app holds both, because neither switch is
//   entitled to an opinion about the other.
// - **The visuals read audio state and never write it.** This file never reads
//   audio state at all. It is told a strike happened by the same one-way callback
//   the blooms are handed, and it is told GRIT and MURK by the hand that moved
//   them. There is no engine in scope and no reading function either — a weaker
//   version of ./atmosphere's arrangement is not needed, because there is nothing
//   here to weaken.
// - **Nothing randomised at runtime.** Four fixed tables in {@link RUPTURE.slice},
//   walked one entry per strike. Same reason ./atmosphere's jitter is a table: a
//   table can be quoted back by a suite, and it cannot accidentally produce the
//   smooth drift a random walk sometimes does.
// - **Nothing here transforms the plate.** gt#33's rule holds unchanged. The two
//   effects that touch the plate at all are the aberration and the melt's blur
//   (gt#109), and they touch it with `filter`, which moves pixels rather than
//   layout boxes — the wire layer's
//   `getBoundingClientRect` reads exactly the same rect with it on as with it off,
//   so every jack and every drop target is where it was. Everything else is a
//   `position:fixed` layer over the board carrying no jacks whatsoever.
//
// ## Why there is no frame loop in this file
//
// gt#39 asks for a profile before shipping any of this, and names the two shapes
// that would give back the ground gt#21 won: full-viewport filters, and per-frame
// displacement. The honest answer to that is to add no per-frame work at all, and
// none of the six needs any:
//
// - The **roll** and the **strobe** are CSS keyframes, declared in index.html the
//   way `grainShift` already is. The compositor runs them, STILLNESS pauses them
//   with `animation-play-state` exactly as ./atmosphere pauses the grain, and a
//   layer that is `display:none` runs nothing.
// - The **slices** are events with timers, which is the shape ./blooms already
//   proved on the same trigger — and they refuse over a cap rather than queueing,
//   for the reason a bloom does.
// - The **aberration**, the **lamps** and the **melt** are set-on-change: they
//   move when a hand moves GRIT or MURK, which is a handful of writes per gesture
//   and none between them.
//
// **One exception, added by gt#82 and kept to that shape.** The aberration used
// to be held at its full reach, which reads as a pair of 3D glasses rather than
// as a board breaking. It now rests at a fringe and is thrown apart by a strike,
// and running that back down is a loop — for the quarter of a second it takes,
// started by the hit and stopping itself when the burst is spent. Nothing here
// runs between hits, and nothing here reads the engine to decide anything.
//
// So the shelf's cost at rest is one `display:none` layer per animation and
// nothing else, and its cost while running is compositor work plus whatever the
// aberration filter costs the paint of the plate. That last one is the only
// number here that a suite cannot settle — see {@link RUPTURE.aberration}.

import { RUPTURE } from './constants';
import { decayed, framesIn, gapMs, stampOf } from './frame';
import { box } from './dom';
import { rupture as paint } from '../tokens';

/**
 * The three custom properties this file owns, and the only ones it writes.
 *
 * All three go on `<body>`, which is the opposite of what ./atmosphere concluded
 * (gt#21) and is right for the same underlying reason. That file writes four of its
 * five on the single layer that reads each, because they move sixty times a
 * second and a body write invalidates style for the whole document. These three
 * move when a hand moves a box — the same case `--grit` is the exception for —
 * and every one of them is read by many nodes at once: `--overdrive` by thirteen
 * lamps, `--melt` by every name and every tape strip on the plate (the names
 * sag by it and the tapes peel; the blur that goes with them is one filter on
 * the plate, written here — see {@link meltBlurAt}). Inheritance is
 * exactly the mechanism wanted, and it is paid for on a gesture rather than on a
 * frame.
 */
export const RUPTURE_VARS = ['--apartAmount', '--overdrive', '--melt'] as const;

/**
 * What each of the three says on a board that is not coming apart — and they are
 * not all the same string, which is the one thing worth reading twice.
 *
 * `--apartAmount` and `--melt` are *amounts*: zero is nothing happening.
 * `--overdrive` is a **multiplier** handed straight to `brightness()`, so its
 * resting value is 1 and a zero there would turn every lit lamp on the board
 * black. The CSS fallbacks match these exactly, so a lamp rendered before this
 * file has written anything is a lamp at its normal brightness.
 */
export const RUPTURE_REST = { apartAmount: '0', overdrive: '1', melt: '0' } as const;

/**
 * How far the board is coming apart, from 0 to 1 — the shelf's single number,
 * and the only thing any of the six is scaled by.
 *
 * Zero unless the shelf is armed *and* GRIT is past {@link RUPTURE.floor}, and
 * the ramp runs from the floor to 1 rather than from 0 to 1: at the floor exactly
 * there is no effect, not a small one. Same shape as {@link shakeAmount} in
 * ./atmosphere, and the same reason — the absence is the design.
 *
 * Exported because it is the whole of the shelf's arithmetic, and a suite can
 * check the gate without mounting a layer.
 */
export const apartAmount = (armed: boolean, grit: number): number => {
  if (!armed) return 0;
  const over = grit - RUPTURE.floor;
  if (over <= 0) return 0;
  return Math.min(1, over / (1 - RUPTURE.floor));
};

/**
 * How far the plate's colour channels are pulled apart at a given amount, in
 * pixels. The red goes one way by this much and the green and blue the other, so
 * the visible split is twice the number.
 */
export const aberrationAt = (amount: number): number =>
  Number((amount * RUPTURE.aberration.maxPx).toFixed(RUPTURE.aberration.digits));

/**
 * How far the channels are apart *right now*: the reach above, scaled between
 * its resting share and all of it by how much of a burst is left (gt#82).
 *
 * `burst` is 1 on the frame of a hit and falls to 0. At 0 this is the fringe
 * the board rests at; at 1 it is {@link aberrationAt}, the whole split, which
 * until gt#82 was where it sat permanently and why it read as 3D glasses.
 */
export const splitAt = (amount: number, burst: number): number => {
  const { rest, digits } = RUPTURE.aberration;
  const share = rest + (1 - rest) * Math.min(1, Math.max(0, burst));
  return Number((aberrationAt(amount) * share).toFixed(digits));
};

/**
 * What is left of a burst one frame later, and nothing once it is nearly spent.
 * `frames` is how many sixtieths of a second that frame actually was (gt#120).
 */
export const burstAfter = (burst: number, frames = 1): number => {
  const next = decayed(burst, RUPTURE.aberration.decay, frames);
  return next < RUPTURE.aberration.floor ? 0 : next;
};

/**
 * One torn slice: which entry of the table this strike takes, and what that entry
 * is at this amount.
 *
 * The two halves are separable in the way {@link shakeAt}'s are, and for the same
 * reason: the table is the *shape* of the tear and the amount is its *size*, so a
 * strike chooses a band and GRIT alone decides how far it is thrown and how thick
 * it is. Either can then be checked without the other.
 */
export const sliceAt = (
  strike: number,
  amount: number,
): { readonly top: string; readonly height: string; readonly shift: string } => {
  const { tops, heights, offsets, maxPx, digits } = RUPTURE.slice;
  const at = ((strike % tops.length) + tops.length) % tops.length;
  const fix = (value: number): string => value.toFixed(digits);
  return {
    top: `${fix(tops[at] ?? 0)}vh`,
    // Never thinner than a pixel: a band rounded away to zero height is a strike
    // that armed the shelf and then showed nothing.
    height: `${fix(Math.max(1, (heights[at] ?? 0) * amount))}px`,
    shift: `${fix((offsets[at] ?? 0) * maxPx * amount)}px`,
  };
};

/**
 * Whether the strobe may fire. All three gates, in one place, as one expression —
 * because a safety gate spread across three call sites is a safety gate with
 * three chances to be edited wrong.
 *
 * Note what is *not* a factor: nothing about the rate. The strobe either runs at
 * {@link RUPTURE.strobe.periodMs} or does not run, and no input anywhere makes it
 * faster. See {@link strobeHz}.
 */
export const strobeArmed = (armed: boolean, grit: number, still: boolean): boolean =>
  !still && armed && grit >= RUPTURE.strobe.gritArm && apartAmount(armed, grit) > 0;

/**
 * The strobe's actual rate, in flashes per second, derived from the period rather
 * than declared beside it.
 *
 * This exists so the cap can be *tested* instead of commented: a suite asserts
 * `strobeHz() <= RUPTURE.strobe.maxHz`, and anyone who shortens the period past
 * the limit fails the suite rather than the eye. It is the one number in this
 * product where that distinction is about a person's health rather than a
 * slipped digit.
 */
export const strobeHz = (): number => 1000 / RUPTURE.strobe.periodMs;

/** Whether the board is rolling. Its own GRIT floor, well above the shelf's. */
export const rollArmed = (armed: boolean, grit: number, still: boolean): boolean =>
  !still && armed && grit >= RUPTURE.roll.gritFloor && apartAmount(armed, grit) > 0;

/** How hard the lit lamps are overdriven, as the multiplier a `brightness` takes. */
export const lampBoostAt = (amount: number): string =>
  (1 + amount * (RUPTURE.lamp.maxBoost - 1)).toFixed(RUPTURE.digits);

/**
 * How far the board is melting, from 0 to 1 — off MURK past its own floor, and
 * scaled by the shelf's amount like everything else, so a disarmed board at full
 * MURK melts not at all.
 */
export const meltAt = (murk: number, amount: number): number => {
  if (amount <= 0) return 0;
  const over = murk - RUPTURE.melt.murkFloor;
  if (over <= 0) return 0;
  return Math.min(1, over / (1 - RUPTURE.melt.murkFloor)) * amount;
};

/**
 * How far the whole plate is blurred at a given melt, as the pixels a `blur()`
 * takes — or nothing at all, which is the string for "no blur", not `0px`
 * (gt#109).
 *
 * The melt used to blur the names on the plates and nothing else: a module's
 * heading went soft while the tape under it, the knob beside it and the plate
 * round it stayed sharp, which reads as a rendering fault rather than as a
 * board going under. Going under is everything at once. So the blur is one
 * filter on the plate, over every name, tape, caption, control and cable alike.
 */
export const meltBlurAt = (melt: number): string => {
  const px = Math.min(1, Math.max(0, melt)) * RUPTURE.melt.maxBlurPx;
  const text = px.toFixed(2);
  return Number(text) > 0 ? `${text}px` : '';
};

/** The animation shorthand for one of the two keyframed layers, at its period. */
const animation = (name: string, periodMs: number, easing: string): string =>
  `${name} ${(periodMs / 1000).toFixed(3)}s ${easing} infinite`;

/** Pinned to all four edges of the window and untouchable. ./atmosphere's cousin. */
const pinned = (outset = 0): string =>
  `position:fixed;left:${-outset}px;top:${-outset}px;right:${-outset}px;bottom:${-outset}px;` +
  `pointer-events:none;`;

export interface RuptureSpec {
  /** The page shell. Every layer is mounted here, and removed from it on destroy. */
  readonly mount: HTMLElement;

  /**
   * The board's plate — the one element outside this file's own layers that it
   * touches, and it touches it with exactly one property. Handed in rather than
   * queried for, so that what the shelf can reach is visible in the call.
   */
  readonly plate: HTMLElement;

  /**
   * The page's clock, in milliseconds. Only the strobe reads it — see
   * {@link strobeDelay}. Defaults to the document's own animation timeline,
   * which is the clock the strobe's keyframes run on.
   */
  readonly now?: () => number;
}

/**
 * The `animation-delay` that puts a strobe shown at `nowMs` on the page's one
 * grid of flashes, rather than at the start of a grid of its own.
 *
 * **This is what makes the rate cap true.** The keyframes flash once per
 * {@link RUPTURE.strobe.periodMs}, and the suite holds that under three a
 * second. But the layer is switched with `display`, and an animation on an
 * element that has just been displayed starts from its first frame — which is
 * the lit one. So every time the strobe was let through its gate it flashed
 * there and then: wiggle GRIT across the threshold, or click STILLNESS quickly,
 * and it flashed as fast as the hand moved. Measured in Chrome, shown and
 * hidden every 90ms it flashed six times in a second, and every 50ms, eleven.
 * The period was capped and the rate was not.
 *
 * A negative delay starts an animation part-way through. Started this far in,
 * the strobe is lit only when the page's clock is in the first tenth of a
 * period, whenever and however often it is shown — so two flashes can never
 * be closer than a period, and the cap holds whatever is done to the gate.
 */
export function strobeDelay(nowMs: number): string {
  const period = RUPTURE.strobe.periodMs;
  const into = ((nowMs % period) + period) % period;
  return `${-into.toFixed(1)}ms`;
}

/** The clock the page's animations run on, where there is one. */
function pageClock(): number {
  const timeline = typeof document !== 'undefined' ? document.timeline?.currentTime : null;
  return typeof timeline === 'number' ? timeline : performance.now();
}

export interface RuptureHandle {
  /** The three layers, in mount order: roll, slices, strobe. */
  readonly layers: readonly HTMLElement[];

  /** The SVG the aberration filter is declared in. Mounted, and paints nothing. */
  readonly defs: SVGSVGElement;

  /** COME APART moved. The one gate everything else is behind. */
  setArmed(armed: boolean): void;

  /** The GRIT box moved. How far the board comes apart, and which of the six run. */
  setGrit(grit: number): void;

  /** The MURK box moved. Drives the melt and nothing else. */
  setMurk(murk: number): void;

  /**
   * A strike was heard. Tears one band off the table, or does nothing at all — a
   * disarmed shelf, a stilled board, or a layer already at its cap.
   *
   * Refused rather than queued, exactly as ./blooms refuses one, and refused
   * before anything is built for the same reason.
   */
  strike(): void;

  /**
   * STILLNESS moved (gt#33). Stilled, every one of the six stops: both keyframed
   * layers are taken down, every slice in flight is dropped, the filter comes off
   * the plate and all three variables go back to rest. Released, whatever the arm
   * and the two boxes say applies again.
   *
   * It does not consult the arm, and that is the point — a board that has been
   * stilled shows none of this however hard it was armed.
   */
  setStill(still: boolean): void;

  /** Take every layer down, unfilter the plate, and drop the three variables. */
  destroy(): void;
}

/**
 * The chromatic-aberration filter, as five primitives.
 *
 * The red channel is offset one way and the green and blue the other, then the
 * two are screened back together — which reconstructs the whole image with its
 * channels pulled apart rather than laying a coloured ghost over an untouched
 * copy. At an offset of zero it is the identity, which is why the filter can be
 * *removed* below the floor rather than zeroed: identical output, and no render
 * surface kept for a 1440px plate that is not being split.
 *
 * The two `feOffset` nodes are handed back so the offset can be written on them
 * directly. An SVG filter primitive cannot read a custom property, so this is the
 * one thing on the shelf that is set imperatively rather than in CSS — and it is
 * set when a hand moves GRIT, not on a frame.
 */
function buildSplit(): {
  readonly svg: SVGSVGElement;
  readonly left: SVGFEOffsetElement;
  readonly right: SVGFEOffsetElement;
} {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;';

  const defs = document.createElementNS(ns, 'defs');
  const filter = document.createElementNS(ns, 'filter');
  filter.setAttribute('id', RUPTURE.aberration.id);
  // Room for the offset to land in. Without it the split is clipped back to the
  // plate's own box and the outermost few pixels lose a channel.
  filter.setAttribute('x', '-4%');
  filter.setAttribute('y', '-4%');
  filter.setAttribute('width', '108%');
  filter.setAttribute('height', '108%');
  // sRGB rather than the linearRGB default: the board is a dark plate, and
  // splitting it in linear space washes the low end out to grey.
  filter.setAttribute('color-interpolation-filters', 'sRGB');

  const offset = (dx: string, result: string): SVGFEOffsetElement => {
    const node = document.createElementNS(ns, 'feOffset');
    node.setAttribute('in', 'SourceGraphic');
    node.setAttribute('dx', dx);
    node.setAttribute('dy', '0');
    node.setAttribute('result', result);
    filter.appendChild(node);
    return node;
  };

  const channel = (source: string, values: string, result: string): void => {
    const node = document.createElementNS(ns, 'feColorMatrix');
    node.setAttribute('in', source);
    node.setAttribute('type', 'matrix');
    node.setAttribute('values', values);
    node.setAttribute('result', result);
    filter.appendChild(node);
  };

  const left = offset('0', 'shiftedRed');
  channel('shiftedRed', '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', 'red');
  const right = offset('0', 'shiftedCyan');
  channel('shiftedCyan', '0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0', 'cyan');

  const blend = document.createElementNS(ns, 'feBlend');
  blend.setAttribute('in', 'red');
  blend.setAttribute('in2', 'cyan');
  blend.setAttribute('mode', 'screen');
  filter.appendChild(blend);

  defs.appendChild(filter);
  svg.appendChild(defs);
  return { svg, left, right };
}

/** Build the shelf. Every layer is mounted; nothing runs until it is armed. */
export function createRupture(spec: RuptureSpec): RuptureHandle {
  const split = buildSplit();
  spec.mount.appendChild(split.svg);

  // Signal loss. The band brightens whatever it passes over rather than painting
  // over it, so what rolls is the board itself — `backdrop-filter` is the only
  // way to get that without a second copy of the plate, and the tint underneath
  // is what a browser without it shows instead. Taller than the window by its own
  // height at both ends, so the keyframes can carry it fully off screen.
  const roll = box(
    'roll',
    `position:fixed;left:0;right:0;top:0;height:${RUPTURE.roll.bandVh}vh;pointer-events:none;` +
      `z-index:${RUPTURE.zIndex.roll};display:none;` +
      `backdrop-filter:${paint.rollFilter};-webkit-backdrop-filter:${paint.rollFilter};` +
      `background-image:${paint.rollTint};` +
      `border-top:${RUPTURE.roll.tearPx}px solid ${paint.rollTear};` +
      `animation:${animation(paint.rollAnimationName, RUPTURE.roll.periodMs, 'linear')};` +
      `will-change:translate;`,
    spec.mount,
  );

  // The bands a strike tears off. The container is inert and empty almost all of
  // the time; one child exists per torn slice, for ninety milliseconds.
  const slices = box(
    'slices',
    `${pinned()}z-index:${RUPTURE.zIndex.slices};`,
    spec.mount,
  );

  // The strobe. Over everything a hand reads and under the wake overlay, because
  // a flash that half the screen is exempt from is not a flash. `--strobePeak` is
  // read by the keyframes rather than by this element, which is what keeps the
  // brightness in one place while the timing lives in the animation.
  const strobe = box(
    'strobe',
    `${pinned()}z-index:${RUPTURE.zIndex.strobe};background:${paint.strobe};` +
      `opacity:0;--strobePeak:${RUPTURE.strobe.peak};display:none;` +
      `animation:${animation(paint.strobeAnimationName, RUPTURE.strobe.periodMs, 'linear')};` +
      `will-change:opacity;`,
    spec.mount,
  );

  const layers = [roll, slices, strobe];

  /** Timers that will take a torn band back off the page. */
  const timers = new Set<ReturnType<typeof setTimeout>>();

  /** Which entry of the slice table the next strike takes. */
  let struck = 0;

  let armed = false;
  let still = false;
  let grit = 0;
  let murk = 0;
  /** Whether the strobe is through its gate right now. */
  let strobing = false;

  /** How much of a burst is left on the colour split, 1 on a hit and falling (gt#82). */
  let burst = 0;
  /** The frame that is running a burst down. Zero between hits, which is nearly always. */
  let burstFrame = 0;
  /** When the burst loop last ran, so a frame knows how long it was. NaN between bursts. */
  let burstStamp = NaN;

  /** Stop a burst where it is and take the split back to rest. */
  function endBurst(): void {
    if (burstFrame) cancelAnimationFrame(burstFrame);
    burstFrame = 0;
    burstStamp = NaN;
    burst = 0;
  }

  /**
   * Put the plate's filter where it currently belongs, or take it off entirely.
   *
   * Two things live in it and either may be absent: the colour split, off
   * GRIT, and the blur of a board that is melting, off MURK (gt#109). They are
   * composed into the one `filter` because the plate has one, and this file is
   * the only thing that writes it.
   *
   * It is removed rather than zeroed whenever there is nothing to do, so a
   * board that is not coming apart keeps no render surface for it.
   */
  function drawSplit(amount: number): void {
    const px = splitAt(amount, burst);
    const soft = meltBlurAt(meltAt(murk, amount));
    const parts: string[] = [];
    if (px > 0) {
      split.left.setAttribute('dx', String(-px));
      split.right.setAttribute('dx', String(px));
      parts.push(`url(#${RUPTURE.aberration.id})`);
    }
    if (soft) parts.push(`blur(${soft})`);
    if (parts.length) spec.plate.style.filter = parts.join(' ');
    else spec.plate.style.removeProperty('filter');
  }

  /**
   * One frame of a burst: draw it, spend some of it, and stop the moment there
   * is none left. This is the only frame work in the file and it exists for a
   * quarter of a second after a hit — see the note at the top on why there is
   * otherwise none.
   */
  function stepBurst(now?: number): void {
    burstFrame = 0;
    // On a clock rather than a frame count (gt#120), so the channels settle in
    // the same quarter of a second on a 144Hz display as on a 60Hz one.
    const at = stampOf(now);
    const frames = framesIn(gapMs(burstStamp, at));
    burstStamp = at;
    const amount = still ? 0 : apartAmount(armed, grit);
    if (amount === 0) {
      burst = 0;
      burstStamp = NaN;
      return;
    }
    drawSplit(amount);
    burst = burstAfter(burst, frames);
    if (burst > 0) burstFrame = requestAnimationFrame(stepBurst);
    else {
      drawSplit(amount);
      // The loop is over. The next burst starts its own count rather than
      // measuring from the end of this one.
      burstStamp = NaN;
    }
  }

  /**
   * Write a variable on the page, and only when it has actually moved. The same
   * guard ./atmosphere uses, applied to writes that arrive on a gesture rather
   * than on a frame — a drag along the GRIT box is a hundred pointer events and
   * at three decimals most of them ask for the string the page already has.
   */
  const written = new Map<string, string>();
  const write = (name: string, value: string): void => {
    if (written.get(name) === value) return;
    written.set(name, value);
    document.body.style.setProperty(name, value);
  };

  /** Drop every band in flight, and the timers that would have removed them. */
  function clearSlices(): void {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    while (slices.firstChild) slices.removeChild(slices.firstChild);
  }

  /**
   * Put the strobe that has just been displayed on the page's grid of flashes,
   * exactly: its animation is told it began at the last whole period of the
   * page's own animation clock. Says whether it could.
   *
   * This is {@link strobeDelay} done on the clock the animation actually runs
   * on. A delay is worked out when the style is written, and the animation
   * does not begin until the frame after — on a board that is busy coming
   * apart that was measured at up to 175ms later, which is half a period off
   * the grid. A start time has no such gap: whenever the first frame lands,
   * the animation is already where the clock says it should be.
   *
   * Where there is no animation to ask — no layout, or a caller that brought
   * its own clock — the delay is what is left, and the caller falls back to it.
   */
  function seatStrobe(): boolean {
    if (spec.now) return false;
    const at = typeof document !== 'undefined' ? document.timeline?.currentTime : null;
    const running = typeof strobe.getAnimations === 'function' ? strobe.getAnimations() : [];
    if (typeof at !== 'number' || !running.length) return false;
    const period = RUPTURE.strobe.periodMs;
    for (const animation of running) animation.startTime = Math.floor(at / period) * period;
    return true;
  }

  /**
   * Everything the shelf shows, decided in one place from the four things that
   * decide it. Called on every input rather than each input updating its own
   * effect: six effects each maintaining their own idea of whether they are on is
   * six places for the arm to be forgotten, and one of them is a full-screen
   * flash.
   */
  function refresh(): void {
    const amount = still ? 0 : apartAmount(armed, grit);

    write('--apartAmount', amount.toFixed(RUPTURE.digits));
    // No zero case: `lampBoostAt(0)` is the identity multiplier by construction,
    // which is what makes the resting value provably the same number the CSS
    // falls back to rather than a second copy of it that could drift.
    write('--overdrive', lampBoostAt(amount));
    write('--melt', meltAt(murk, amount).toFixed(RUPTURE.melt.digits));

    // A burst does not outlive the thing it was a burst of: disarmed, stilled or
    // under the floor, it ends here rather than on its next frame.
    if (amount === 0) endBurst();
    drawSplit(amount);

    // `display` rather than opacity for both: a hidden element runs no animation
    // at all, so an unarmed board is not quietly paying the compositor to flash
    // something nobody can see.
    roll.style.display = rollArmed(armed, grit, still) ? 'block' : 'none';

    // The strobe joins the page's grid of flashes each time it is let through,
    // and is left alone while it stays through: rewriting the delay of an
    // animation that is running would move it, and moving it is a flash.
    const flashing = strobeArmed(armed, grit, still);
    strobe.style.display = flashing ? 'block' : 'none';
    if (flashing && !strobing && !seatStrobe()) {
      strobe.style.animationDelay = strobeDelay((spec.now ?? pageClock)());
    }
    strobing = flashing;

    if (amount === 0) clearSlices();
  }

  refresh();

  return {
    layers,
    defs: split.svg,
    setArmed(next: boolean): void {
      if (next === armed) return;
      armed = next;
      refresh();
    },
    setGrit(next: number): void {
      if (next === grit) return;
      grit = next;
      refresh();
    },
    setMurk(next: number): void {
      if (next === murk) return;
      murk = next;
      refresh();
    },
    strike(): void {
      // Refused before anything is built, in the order that costs least: the two
      // booleans, then the cap, then the arithmetic. A rattle at full FRENZY is
      // exactly when this should not be paid for a band nobody will resolve.
      if (still || !armed) return;
      const amount = apartAmount(armed, grit);
      if (amount === 0) return;

      // The colour split is thrown apart by the hit and left to settle (gt#82).
      // Before the cap below, which is the slices' own: a rattle that has used
      // up its bands still knocks the channels, and one loop serves however
      // many hits land inside it.
      burst = 1;
      if (!burstFrame) burstFrame = requestAnimationFrame(stepBurst);

      if (slices.childElementCount >= RUPTURE.slice.cap) return;

      const cut = sliceAt(struck, amount);
      struck += 1;

      const band = box(
        'slice',
        `position:absolute;left:${RUPTURE.slice.insetPx}px;right:${RUPTURE.slice.insetPx}px;` +
          `top:${cut.top};height:${cut.height};pointer-events:none;` +
          `translate:${cut.shift} 0;` +
          `backdrop-filter:${paint.sliceFilter};-webkit-backdrop-filter:${paint.sliceFilter};` +
          `background:${paint.sliceTint};` +
          `box-shadow:inset ${RUPTURE.roll.tearPx}px 0 0 ${paint.sliceEdge};`,
        slices,
      );

      const timer = setTimeout(() => {
        timers.delete(timer);
        band.remove();
      }, RUPTURE.slice.holdMs);
      timers.add(timer);
    },
    setStill(next: boolean): void {
      if (next === still) return;
      still = next;
      // Both keyframed layers are hidden by `refresh` rather than paused, which
      // is a stronger answer than ./atmosphere's `animationPlayState` and is
      // available here because neither of these layers has a resting appearance
      // to preserve. A paused strobe is a lit screen held at whatever opacity the
      // last frame reached; a hidden one is the board.
      refresh();
    },
    destroy(): void {
      clearSlices();
      endBurst();
      struck = 0;
      armed = false;
      still = false;
      grit = 0;
      murk = 0;
      written.clear();
      spec.plate.style.removeProperty('filter');
      for (const name of RUPTURE_VARS) document.body.style.removeProperty(name);
      for (const layer of layers) layer.remove();
      split.svg.remove();
    },
  };
}
