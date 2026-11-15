// The room the board sits in. Six fixed layers behind and over the plate, and
// the one animation frame that moves four of them.
//
// The rule this file exists to keep is a one-way arrow: **the visuals read audio
// state and never write it.** That is why `start` takes a reading function
// rather than an engine — the loop is handed the one call it is allowed to make,
// and there is no second call on the other side of it to reach for. A visual
// system holding an engine could poke it; this one cannot.
//
// Four more things about it are decisions rather than implementation details:
//
// - **Every layer works before the loop does.** Each variable is read with a
//   fallback baked into the CSS, so the wash, the vignette and the grain are all
//   correct on the very first paint — a board seen before WAKE IT is not a board
//   with its atmosphere missing. The loop only takes over what was already there.
// - **It is atmosphere, not a meter.** The whole range of movement is a 3.5%
//   scale and a brightness swing either side of a base that already sits under 1,
//   lerped a tenth of the way per frame. Anything sharp enough to read as a
//   response to a note would be the wrong thing entirely — see {@link ATMOSPHERE}.
// - **Two of the five are set on change, not per frame.** `--hue` follows TUNING
//   and `--grit` follows the GRIT box, and both move exactly when a hand moves
//   them. Sampling either one sixty times a second would be sixty writes to say
//   the same number.
// - **Each variable is written where it is read, and only when it moves** (gt#21).
//   Never on `<body>`, where the whole document inherits it and one write
//   invalidates style on everything. Four of the five have exactly one reader
//   and are set on that layer. `--grit` has three, and is set on all three: it
//   kept the body for as long as it only moved when a hand moved the GRIT box,
//   and then MEGADRIFT started moving it ten times a second — which, measured,
//   was a restyle of all 2,400 nodes on the page per tick, the largest single
//   cost on the main thread with the lever up. On top of that no write is made
//   at all unless the formatted string has changed, which on a settled low band
//   is most frames.
// - **The layers hang off the page, not off the plate.** They are `position:
//   fixed` and the plate carries `zoom:var(--fit)`, which scales its fixed
//   children with it — the same reason the tip tag is mounted on the page shell.
//   See ./tips.
//
// ## The shake, and why it never touches the plate (gt#33)
//
// Everything above is the resting behaviour and it stays exactly as it was. On
// top of it there is one level at which the board admits it is loud: `--shake`,
// off the same reading, but from a **fast follower rather than the .1-per-frame
// lerp**, and with a floor under it — nothing at all below a threshold, then a
// rising translate. Translate only, never rotate: labels on this board are never
// tilted, and a board that rotates reads as a broken layout rather than a loud
// one.
//
// Three decisions carry it, and the first is the one that could quietly have
// broken the product:
//
// - **It moves the room, not the board.** The plate is zoomed, and ./wires
//   measures every jack against the plate's own rect — once per measurement, and
//   once at the start of a drag. A transform on the plate, or on any wrapper
//   around it, makes that captured rect stale the moment the shake moves: the
//   cable being dragged drifts off the cursor and the drop target wanders under
//   it. The only repair would be re-measuring every frame, which is exactly what
//   the wire layer must not do. So the shake goes on layers carrying no jacks —
//   two of the five here, which are `position:fixed` on the page shell and touch
//   the plate not at all. The signature gesture cannot see this feature.
//
//   The plate *is* moved once, and not by anything in this file: the hammer's
//   jolt (gt#115), which is ./board's. That one is a quarter of a second on one
//   click rather than something that runs whenever the board is loud, it is
//   stopped dead the moment a socket is pressed and never started with a cable
//   in a hand — which is the reason above, answered rather than ignored. See
//   `quake` in ./board. This shake still never touches the plate.
// - **The wash and the grain, and not the other three.** The lowest layer of the
//   stack and one near the top of it, with the figure pinned between them — so
//   the room jolts at two depths around a plate that stays bolted down. That was
//   once one layer behind the board and one over it; gt#53 moved the wash over the
//   plate with everything else, and what the pair is for survived the move
//   intact, because it was never the plate they were on either side of. Both are
//   pushed {@link ATMOSPHERE.outset} past every edge of the window, so a
//   translate can never expose a corner. The vignette and the two chromatic
//   fringes are pinned flush and would open a bright strip down one side the
//   moment they moved, which is the whole reason they are left out of it.
// - **It is written as `translate`, not folded into `transform`.** The wash is
//   already scaled by `--breathe` and the grain already runs its own stepped
//   `transform` keyframes; the separate property composes with both instead of
//   fighting either. One variable, two layers, nothing rewritten.
//
// ## The kick (gt#40, gt#74)
//
// The second way `--shake` moves, and the only one that is not a reading. A hit
// sets an amount — {@link AtmosphereHandle.strike} for a struck module,
// {@link AtmosphereHandle.smash} for the hammer — and the loop lets it die away
// on its own envelope over about a third of a second.
//
// It began as something smaller: the hammer shoved the fast follower past the
// top of its range and let the follower's own rate bring it back. That needed no
// second variable, and it lasted two frames. It also could only ever be the
// hammer's, because the thing a *struck module* does to the room turned out not
// to be readable at all — after the compressor, SLOW HIT's rise on the low tap
// is smaller than the bass beating against the guitar. So the room is told, by
// the same one-way callback the blooms read, and WEIGHT's hover line — "How much
// the room shakes" — is finally a description rather than a promise.
//
// It is worth being exact about the direction, because a second writer of this
// variable is the shape of thing that quietly breaks the rule above. The room is
// still only ever *answering*: a hit is something that happened and this file is
// told about it. How hard it lands is decided from what the board is *set to*,
// never by listening for it. There is still nothing on the far side of `start`
// to reach back through.
//
// ## The figure (gt#36, gt#102, gt#108)
//
// The sixth layer is not hung off the page. It is made here and seated in the
// board, on the seal, and since gt#108 it is the shadow of something a long way
// above: dark, soft, in parts, in a dim pool of light. Three things about it
// are different from everything above, and each is deliberate:
//
// - **It lives in the plate's coordinates.** The reason the other layers are
//   fixed to the page is that the plate is zoomed; this one wants exactly that,
//   because it has to lie on something cut into the plate.
// - **It runs on a clock.** Every other variable here is *tracked* — a
//   function of the low band, so a band of zero is the resting room. The
//   joints sway in time, which a band cannot say, so their phase is
//   accumulated. That is why STILLNESS does not freeze them where they are:
//   it puts the swing back to nothing, and the shadow lies on its cut.
// - **It is written every frame.** The rest of this file writes only when a
//   formatted value changes, which on a settled room is never. A sway always
//   changes. It is four numbers on one element, which thirty parts each mix
//   into their own phase; nothing is written per part.
//
// What a blow does to it is the room's kick again: it swells and the pool
// under it flares, on the envelope the shake dies away on.
//
// ## STILLNESS
//
// {@link AtmosphereHandle.setStill} pins all of it — the shake, the three lerped
// variables, the figure and the grain's own jitter — and it is the counterpart to the switch
// in ../../stillness, which is where the rule it answers is written down. The one
// thing worth repeating here is the direction: stopping the room changes nothing
// about what the engine is doing. This file could not reach the engine to stop it
// if it wanted to, which is the point of `start` taking a reading function.

import { ATMOSPHERE, BOARD } from './constants';
import { decayed, follow, framesIn, gapMs, stampOf } from './frame';
import { box } from './dom';
import type { Levels } from '../engine';
import { glyphOf, glyphTree, hubBox, SEAL, shadeTile, SIGIL_INK, surfaces, textureLayers, textures } from '../tokens';
import type { GlyphPart, ShadeArt } from '../tokens';

/**
 * The custom properties the figure reads (gt#102, gt#108), all written on the
 * figure itself and inherited by its parts.
 *
 * `--turn` is the whole thing turning and `--swell` the whole thing growing.
 * `--glow` is the pool of light under it. The last four are the joints: the
 * sine and cosine of a slow clock for the limbs and of a quicker one for the
 * fingers, each already multiplied by how far that tier swings. A part takes
 * its own mix of the two, which is its own phase — see {@link jointAt}.
 */
export const FIGURE_VARS = [
  '--turn',
  '--glow',
  '--swell',
  '--sway-x',
  '--sway-y',
  '--curl-x',
  '--curl-y',
] as const;

/** Every custom property this file owns, and the only ones it writes. */
export const ATMOSPHERE_VARS = [
  '--breathe',
  '--brite',
  '--vig',
  '--hue',
  '--grit',
  '--shake',
  ...FIGURE_VARS,
] as const;

export interface AtmosphereSpec {
  /** The page shell. Every layer is mounted here, and removed from it on destroy. */
  readonly mount: HTMLElement;
}

export interface AtmosphereHandle {
  /** The six layers, in mount order: wash, sigil, film, both edges, vignette. */
  readonly layers: readonly HTMLElement[];

  /**
   * The figure (gt#102, gt#108), which is this file's to turn, swell and swing and
   * not this file's to place. It is mounted with the other layers so that it exists
   * and can be found, and the seam moves it into the board's emblem layer —
   * the plate's own coordinates, where its hub sits on the seal's centre at
   * every window size and stays there when the page scrolls. Nothing here
   * needs to know where it ended up: every write is to the element.
   */
  readonly figure: HTMLElement;

  /** TUNING moved. Recolours the wash by position. */
  setTuning(tuning: number): void;

  /** The GRIT box moved. Drives the film grain and both chromatic edges. */
  setGrit(amount: number): void;

  /**
   * SERIOUSNESS moved (gt#36). Sets how many generations deep the figure behind
   * the wash is drawn — the third and last of the set-on-change variables, and
   * the only one that redraws something rather than writing a number.
   *
   * Until this is called the layer paints nothing, which is deliberate: a
   * figure at a depth nobody chose is worse than no figure. The seam calls it
   * with the board's opening value before the first frame, the same way it does
   * {@link AtmosphereHandle.setTuning} and {@link AtmosphereHandle.setGrit}.
   */
  setSeriousness(seriousness: number): void;

  /**
   * Begin reading. Called once the engine exists — before WAKE IT there are no
   * levels to read, and the layers are already showing their resting values.
   * Calling it twice runs one loop, not two.
   */
  start(read: () => Levels): void;

  /**
   * Something hit (gt#74). Kicks the room by `strength` of the shake's whole
   * reach, and the loop lets it die away on {@link ATMOSPHERE.shake.kick}.
   *
   * A kick never lowers one already in flight: two blows a frame apart are the
   * harder of the two, not the later. And it does nothing at all for a strength
   * of zero, which is what {@link kickFor} gives every module that has no
   * business moving the room.
   *
   * This and {@link AtmosphereHandle.smash} are the only two things in this file
   * that move a variable without having read the engine, and it is worth being
   * clear about which direction that is: it is still the room answering
   * something that happened, not the room causing it. Nothing here reaches back
   * — a kick that ducked the master or fired a strike would break this file's
   * whole premise, and it could not, because there is nothing on the other side
   * of `start` to reach for.
   *
   * A stilled board does not move. The kick is dropped rather than stored, so
   * releasing STILLNESS does not deliver a jolt from some hit minutes ago — and
   * a board that has never been started drops it too, for the plainer reason that
   * there is no loop to decay it.
   */
  strike(strength: number): void;

  /**
   * The hammer landed (gt#40). A kick of {@link ATMOSPHERE.shake.smash}, which is
   * all of it, through exactly the envelope a strike takes — and on exactly the
   * terms: dropped on a stilled board, dropped before the lever.
   */
  smash(): void;

  /**
   * STILLNESS moved (gt#33). Stilled, the frame loop stops, every variable it owns
   * is written back to the value the CSS already falls back to, and the grain's
   * keyframes are paused where they stand. Released, the loop picks up again from
   * whatever the engine is doing now.
   *
   * Set before {@link AtmosphereHandle.start} it is remembered: a board that
   * opens stilled never runs a frame at all. Nothing here reaches the engine —
   * a still room is a room that has stopped *looking*.
   */
  setStill(still: boolean): void;

  /** Stop the loop, drop the six variables, and take every layer down. */
  destroy(): void;
}

/** One coefficient pair applied to the tracked low band, at its own precision. */
interface Band {
  readonly base: number;
  readonly scale: number;
  readonly digits: number;
}

const at = (band: Band, low: number): string =>
  (band.base + low * band.scale).toFixed(band.digits);

/**
 * Where a given low-band reading puts the three lerped variables. Exported
 * because it is the whole of the visual system's arithmetic, and a suite can
 * check the numbers against the handoff without running a frame.
 */
export const washAt = (
  low: number,
): { readonly breathe: string; readonly brite: string; readonly vig: string } => ({
  breathe: at(ATMOSPHERE.breathe, low),
  brite: at(ATMOSPHERE.brite, low),
  vig: at(ATMOSPHERE.vig, low),
});

/** No shake at all, and what both shaken layers rest at. */
export const SHAKE_STILL = '0px';

/**
 * How far the figure behind the wash is turned at a given band (gt#36).
 *
 * Tracked rather than accumulated, and that is the whole of why a stilled board
 * looks at rest instead of paused: a band of zero is zero degrees, so
 * `turnAt(0)` is the resting room in exactly the sense {@link washAt}(0) is.
 * A rotation whose *rate* followed the band would have no such value to go back
 * to — it would have to be frozen wherever the last frame left it.
 *
 * Exported alongside {@link washAt} and {@link shakeAt} and for the same
 * reason: it is the whole of this layer's arithmetic, and a suite can check it
 * without running a frame.
 */
export const turnAt = (band: number): string =>
  `${(band * ATMOSPHERE.sigil.maxDeg).toFixed(ATMOSPHERE.sigil.digits)}deg`;

/**
 * How bright the pool of light the shadow is cast in is (gt#102, gt#108): dim at
 * rest, more as the low band rises, and more again on the frames after
 * something hits.
 *
 * The kick is the one the shake draws, so the light flares with the blow that
 * jolts the room — and the shadow in it stands out hardest on that frame —
 * and dies away on the same envelope. Anything past 1 is the hammer's and
 * counts as 1 here: the hammer's extra is in how far the room is thrown.
 *
 * `glowAt(0, 0)` is the resting room, exactly as {@link turnAt}(0) is.
 */
export const glowAt = (band: number, kick = 0): string => {
  const { rest, band: gain, kick: flare, max, digits } = ATMOSPHERE.sigil.glow;
  const unit = (value: number): number => Math.min(1, Math.max(0, value));
  return Math.min(max, rest + unit(band) * gain + unit(kick) * flare).toFixed(digits);
};

/**
 * The box the figure is drawn in, in the plate's own pixels: big enough that
 * its furthest stroke lands {@link ATMOSPHERE.sigil.fill} of the way out to the
 * seal's inner ring. Derived, so moving the seal moves the figure with it.
 */
export const figureSize = (): number => Math.round(hubBox(figureRadius()));

/**
 * How far from the seal's centre the figure reaches at its deepest, in the
 * plate's own pixels. The one number the light figure and the one cut into the
 * plate under it (gt#103) both have to be drawn from.
 */
export const figureRadius = (): number => (BOARD.seal.size / 2) * SEAL.inner * ATMOSPHERE.sigil.fill;

/**
 * How much bigger than itself the figure is (gt#108): nothing at rest, more as
 * the low band rises — off the follower the wash breathes on, so the two
 * swell together — and a jump on the frames after a blow.
 *
 * `swellAt(0, 0)` is `1`, to as many places as it is written to, so a stilled
 * figure is exactly its own size and lies exactly on its cut.
 */
export const swellAt = (band: number, kick = 0): string => {
  const { band: gain, kick: jump, digits } = ATMOSPHERE.sigil.swell;
  const unit = (value: number): number => Math.min(1, Math.max(0, value));
  return (1 + unit(band) * gain + unit(kick) * jump).toFixed(digits);
};

/** One tier of joints: how far it swings at rest, how much more when loud, and how long a swing takes. */
interface Swing {
  readonly rest: number;
  readonly band: number;
  readonly ms: number;
}

/**
 * How far a tier of joints is swinging right now, in degrees either way, as
 * the two halves a part mixes (gt#108): `x` is the sine of that tier's clock and
 * `y` the cosine, both times the swing.
 *
 * The clock is a phase in radians. The swing is `rest` on a silent room plus
 * `band` at a low band of 1, so a loud room writhes and a quiet one stirs.
 */
export const swayAt = (
  swing: Swing,
  phase: number,
  band: number,
): { readonly x: string; readonly y: string } => {
  const reach = swing.rest + Math.min(1, Math.max(0, band)) * swing.band;
  const digits = ATMOSPHERE.sigil.sway.digits;
  // `+ 0` so a swing of nothing is `0.00` and never `-0.00`: the same resting
  // value has to be the same string, or it is written again every frame.
  return {
    x: (reach * Math.sin(phase) + 0).toFixed(digits).replace(/^-(0\.0+)$/, '$1'),
    y: (reach * Math.cos(phase) + 0).toFixed(digits).replace(/^-(0\.0+)$/, '$1'),
  };
};

/** What every joint rests at: no swing either way. */
export const SWAY_STILL = (0).toFixed(ATMOSPHERE.sigil.sway.digits);

/**
 * How far a tier's clock moves in `ms` milliseconds at a given band, in
 * radians. A swing there and back is one turn of the clock, and a loud room
 * turns it `hurry` faster.
 */
export const swayStep = (swing: Swing, ms: number, band: number): number =>
  ((Math.PI * 2 * ms) / swing.ms) * (1 + Math.min(1, Math.max(0, band)) * ATMOSPHERE.sigil.sway.hurry);

/**
 * The phase one joint swings at, as the mix of its tier's two halves it takes:
 * `sin(clock + phase)` is `sin(clock)·cos(phase) + cos(clock)·sin(phase)`, so a
 * part that multiplies the tier's `x` by `cos` and its `y` by `sin` swings the
 * tier's swing at its own time, with nothing written for it per frame at all.
 *
 * The phase comes from where the part is. `index` of `count` round its parent
 * spreads a tier evenly round one swing, so neighbours are a fifth of a swing
 * apart and a wave goes round the figure; `offset` is the parent's own place,
 * which stops every limb's fingers moving in step with every other limb's.
 * Nothing here is drawn from a seed, because nothing here needs to be: a
 * figure's joints are where they are.
 */
export const jointAt = (
  index: number,
  count: number,
  offset = 0,
): { readonly cos: number; readonly sin: number } => {
  const phase = (Math.PI * 2 * index) / Math.max(1, count) + offset * 1.7;
  return { cos: Number(Math.cos(phase).toFixed(3)), sin: Number(Math.sin(phase).toFixed(3)) };
};

/** The `rotate` of one joint: its own mix of the two halves its tier publishes. */
const swung = (tier: 'sway' | 'curl', joint: { readonly cos: number; readonly sin: number }): string =>
  `rotate:calc(var(--${tier}-x, ${SWAY_STILL}) * ${joint.cos}deg + var(--${tier}-y, ${SWAY_STILL}) * ${joint.sin}deg);`;

/** Generations in the figure at a given SERIOUSNESS. Out-of-range values clamp. */
export const depthAt = (seriousness: number): number => {
  const { minDepth, maxDepth } = ATMOSPHERE.sigil;
  const reach = Math.min(1, Math.max(0, seriousness));
  return Math.round(minDepth + reach * (maxDepth - minDepth));
};

/**
 * How far past the floor a given band is, from 0 at the floor to 1 at the top.
 * Below the floor there is no shake, and this says so with a flat zero rather
 * than a small number — the absence is the design, not a rounding of it.
 */
export const shakeAmount = (band: number): number => {
  const over = band - ATMOSPHERE.shake.floor;
  if (over <= 0) return 0;
  return Math.min(1, over / (1 - ATMOSPHERE.shake.floor));
};

/**
 * Where a given band and frame put `--shake`: a `translate` value in pixels, or
 * {@link SHAKE_STILL} under the floor. Exported alongside {@link washAt} and for
 * the same reason — it is the whole of the arithmetic, and a suite can check the
 * floor, the ceiling and the jitter table without running a frame.
 *
 * The two halves are deliberately separable: the table is the *shape* of the
 * shake and the amount is its *size*, so a tick chooses an offset pair and the
 * band alone decides how far it reaches.
 */
export const shakeAt = (band: number, tick: number): string => shakeOf(shakeAmount(band), tick);

/**
 * The most the room is ever thrown, as a share of the reach: what the hammer
 * throws it (gt#92), and never less than the reach itself. A level cannot get
 * here and neither can a strike — both stop at 1 — so anything past 1 on screen
 * is a hammer blow and nothing else.
 */
export const SHAKE_CEILING = Math.max(1, ATMOSPHERE.shake.smash);

/**
 * `--shake` for an *amount* rather than a band: 0 is {@link SHAKE_STILL}, 1 is
 * the whole reach, and the tick picks which way. Past 1 is the hammer's, up to
 * {@link SHAKE_CEILING}.
 *
 * Split out of {@link shakeAt} when the shake stopped having one source (gt#74).
 * The band gives an amount and so does a kick, and the loop draws the larger —
 * which needs the half of this arithmetic that does not start from a band.
 */
export const shakeOf = (amount: number, tick: number): string => {
  if (amount <= 0) return SHAKE_STILL;
  const table = ATMOSPHERE.shake.jitter;
  const pair = table[((tick % table.length) + table.length) % table.length] ?? [0, 0];
  const reach = Math.min(SHAKE_CEILING, amount) * ATMOSPHERE.shake.maxPx;
  const at = (unit: number): string => `${(unit * reach).toFixed(ATMOSPHERE.shake.digits)}px`;
  return `${at(pair[0] ?? 0)} ${at(pair[1] ?? 0)}`;
};

/**
 * What is left of a kick one frame later (gt#74): multiplied by the decay, and
 * dropped to nothing once it is under the floor — the same "absent, not small"
 * rule {@link shakeAmount} keeps, so a blow ends rather than trailing off into
 * sub-pixel writes nobody can see.
 */
export const kickAfter = (kick: number, frames = 1): number => {
  const next = decayed(kick, ATMOSPHERE.shake.kick.decay, frames);
  return next < ATMOSPHERE.shake.kick.floor ? 0 : next;
};

/**
 * How hard one strike kicks the room, from 0 to 1: the module's row in
 * {@link ATMOSPHERE.shake.strikes}, scaled by how loud it is set and how far its
 * character control is turned. Zero for anything with no row.
 *
 * This is where WEIGHT's own hover line — "How much the room shakes" — becomes
 * true. It is a pure function of what the board is set to, which is the
 * direction that matters: nothing here listens to the sound to decide how hard
 * it was hit. The engine says *that* a hit was heard, the board says what it
 * was set to, and the room is told both.
 */
export const kickFor = (id: string, loud: number, char: number): number => {
  const cut = ATMOSPHERE.shake.strikes[id];
  if (!cut) return 0;
  const unit = (value: number): number => Math.min(1, Math.max(0, value));
  return unit(unit(loud) * (cut.base + cut.char * unit(char)));
};

/** The wash's hue-rotate at one TUNING position. Out-of-range positions clamp. */
export const hueFor = (tuning: number): string => {
  const index = Math.min(ATMOSPHERE.hues.length - 1, Math.max(0, Math.round(tuning)));
  return `${ATMOSPHERE.hues[index] ?? 0}deg`;
};

/**
 * Pinned to all four edges of the *window*, pushed `outset` pixels past each of
 * them, and untouchable. The absolute cousin of this lives in ./dom and is what
 * every layer inside the plate uses; nothing here is inside the plate.
 */
const pinned = (outset = 0): string =>
  `position:fixed;left:${-outset}px;top:${-outset}px;right:${-outset}px;bottom:${-outset}px;` +
  `pointer-events:none;`;

/** Build the atmosphere. Every layer is mounted; nothing moves until `start`. */
export function createAtmosphere(spec: AtmosphereSpec): AtmosphereHandle {
  const film = textureLayers.film;

  // The wash, and since gt#53 it is over the plate like everything else here.
  //
  // It spent this file's whole life with no z-index, which put it under a board
  // that is an opaque gradient the size of the window — so on any display
  // narrower than the 1440px design, which is most of them, it was not dim, it
  // was nowhere, and `--breathe`, `--brite` and `--hue` were all being written
  // correctly onto a layer nobody could see. See ATMOSPHERE.zIndex.
  //
  // `mix-blend-mode:screen` is what makes the move survivable rather than a
  // gradient dropped over the hardware. Screened, near-black contributes
  // nothing, so the ground this layer used to carry would have been a 10% milky
  // fog over the entire board — which is why the ground is not here any more.
  // It is painted on the page shell as `surfaces.pageDeep`, and what is left on
  // this layer is the two pools of light alone. They land on the board as
  // lighting: warm from one corner, cold from the other, swung by `--hue` when
  // TUNING moves and pumped by `--brite` when the room gets loud. The `filter`
  // runs before the blend, so both variables reach the board rather than stopping
  // at the layer.
  //
  // The fringes below are screened for the same reason and it is the same idea:
  // light added to a room is not a thing painted over it.
  // `background-image` rather than the `background` shorthand, here and below:
  // every layer is gradients and nothing else, so the shorthand's other resets
  // are all no-ops — and this is the same property the plate's own overlays are
  // painted with. See ./board.
  // `will-change` here and on the two layers below is not decoration: these three
  // are the only things on the page whose own style moves every frame, and a
  // full-viewport gradient re-scaled and re-brightened on the main thread is the
  // most expensive way to say so. Promoted, the browser scales and filters a
  // texture it already has. Nothing else on the board gets one — a promotion
  // handed to a layer that never moves is memory spent on nothing.
  // `translate` alongside `transform` rather than inside it: the scale below is
  // the breathing and this is the shake, they move on different clocks, and the
  // separate property is what lets each be written without restating the other.
  const wash = box(
    'wash',
    `${pinned(ATMOSPHERE.outset)}z-index:${ATMOSPHERE.zIndex.wash};` +
      `background-image:${surfaces.backdrop};mix-blend-mode:screen;` +
      `transform:scale(var(--breathe, ${ATMOSPHERE.breathe.base}));` +
      `translate:var(--shake, ${SHAKE_STILL});` +
      `filter:hue-rotate(var(--hue, 0deg)) brightness(var(--brite, ${ATMOSPHERE.brite.base}));` +
      `will-change:transform,translate,filter;`,
    spec.mount,
  );

  // The figure (gt#36, gt#102). Over the board rather than behind it, which is not
  // what gt#36 asked for and is the only place it can go: the plate is an opaque
  // gradient covering the whole viewport, so a layer beneath it is invisible at
  // any opacity rather than merely faint.
  //
  // What gt#102 changed is everything about *how* it is over the board. It is a
  // square in the middle of whatever it is seated in, its hub in the middle of
  // the square, so it turns about the point it grows from and that point can
  // be put on the seal's centre. It carries no blend and no z-index of its
  // own; the board's emblem layer is where it is stacked.
  //
  // What gt#108 changed is what it *is*: a shadow, in parts, in a pool of light.
  // This box is only the frame — it turns and it swells, and everything in it
  // is built by `draw` below when SERIOUSNESS first says how deep.
  //
  // Mounted here with the rest so it exists; the seam seats it in the board.
  // See {@link AtmosphereHandle.figure}.
  //
  // Promoted, and so is every part inside it. Since gt#108 this is the fourth
  // thing here whose style moves every frame: the joints run on a clock, and
  // thirty of them turning inside an unpromoted layer would repaint that
  // layer sixty times a second. As textures they are only moved.
  //
  // Not shaken, deliberately. A room that both jolts and rocks reads as a fault
  // rather than as a loud one. The shake stays the wash's and the grain's; what
  // a blow does to the figure is swell it and light the pool under it.
  const size = figureSize();
  const sigil = box(
    'sigil',
    `position:absolute;left:50%;top:50%;width:${size}px;height:${size}px;` +
      `margin:${-size / 2}px 0 0 ${-size / 2}px;pointer-events:none;` +
      `rotate:var(--turn, ${turnAt(0)});scale:var(--swell, ${swellAt(0)});` +
      `will-change:rotate,scale;`,
    spec.mount,
  );

  /**
   * Build the figure at a depth (gt#108): the pool of light, and over it the
   * shadow in its parts.
   *
   * The parts nest the way the figure does. Every limb is inside the body and
   * every finger is inside its limb, each turning about the point it hangs
   * from — so a limb's swing carries its fingers with it and theirs is added
   * on top, which is what a jointed thing does and what makes the tips travel
   * furthest.
   *
   * Everything is placed in pixels from the hub, at the one scale the figure
   * cut into the seal under it is drawn at: its deepest reach, on the inner
   * ring, whatever depth this is (gt#103). So at rest every part lies on its
   * own cut.
   *
   * Rebuilt whole, which happens when the depth changes and at no other time
   * — at most three times across the whole of the wheel's travel.
   */
  function draw(generations: number): void {
    sigil.textContent = '';
    const { key, maxDepth, stroke, blur, shade } = ATMOSPHERE.sigil;
    const tree = glyphTree(key, generations);
    const scale = figureRadius() / (glyphOf(key, maxDepth).reach || 1);
    const tile = (part: GlyphPart): ShadeArt | null =>
      shadeTile(part, { scale, stroke, alpha: 1, pigment: SIGIL_INK.shade, blur });

    // The light first, under the thing that blocks it. Round, the size of the
    // frame, and the only part of this that `--glow` moves.
    box(
      'pool',
      `position:absolute;left:0;top:0;right:0;bottom:0;border-radius:50%;` +
        `background-image:${SIGIL_INK.pool};opacity:var(--glow, ${glowAt(0)});will-change:opacity;`,
      sigil,
    );

    // The shadow: one group at one strength, so where two limbs cross it is no
    // darker than either — a shadow has no layers. A point at the hub, which
    // every part below is placed from.
    const body = box(
      'shade',
      `position:absolute;left:50%;top:50%;width:0;height:0;opacity:${shade};`,
      sigil,
    );

    /** One part as an element: its tile, in its box, hung from its base. */
    const hang = (
      name: string,
      part: GlyphPart,
      parent: HTMLElement,
      from: { readonly x: number; readonly y: number },
      joint: string,
    ): { readonly element: HTMLElement; readonly art: ShadeArt } | null => {
      const art = tile(part);
      if (!art) return null;
      const element = box(
        name,
        `position:absolute;left:${art.x - from.x}px;top:${art.y - from.y}px;` +
          `width:${art.width}px;height:${art.height}px;` +
          `background-image:${art.image};background-size:100% 100%;background-repeat:no-repeat;` +
          `transform-origin:${(part.base.x * scale - art.x).toFixed(1)}px ${(part.base.y * scale - art.y).toFixed(1)}px;` +
          joint,
        parent,
      );
      return { element, art };
    };

    // The trunk does not swing: it is what the rest swings from.
    hang('trunk', tree.trunk, body, { x: 0, y: 0 }, '');
    tree.limbs.forEach((limb, i) => {
      const hung = hang(
        'limb',
        limb,
        body,
        { x: 0, y: 0 },
        `${swung('sway', jointAt(i, tree.limbs.length))}will-change:rotate;`,
      );
      if (!hung) return;
      limb.fingers.forEach((finger, j) => {
        hang(
          'finger',
          finger,
          hung.element,
          hung.art,
          `${swung('curl', jointAt(j, limb.fingers.length, i))}will-change:rotate;`,
        );
      });
    });
  }

  // Film grain over the whole product, jittering on its own stepped keyframe
  // loop — the one thing on this board that moves without being asked to, and
  // the reason a still screenshot of it looks like a photograph of a screen.
  // The second of the two that shake. Its `transform` belongs to the `grainShift`
  // keyframes and is not ours to touch, which is the other half of why `--shake`
  // is a `translate` — the two run at once and neither knows about the other.
  //
  // The tile is written out here rather than read through `--grainTex` like
  // every other grain on the board, and that is the fix for the most expensive
  // thing this page used to do. A custom property written on an element makes
  // the browser work out again every property of it that reads *any* variable
  // — and a `background-image` worked out again is a new image, so the layer is
  // repainted. This layer has `--shake` written on it whenever the room is
  // loud: measured, that was the whole window's worth of noise tile drawn again
  // fifteen times a second, and half of everything the GPU did. Said outright,
  // the image is no longer something a variable can touch.
  const grain = box(
    'film',
    `${pinned(ATMOSPHERE.outset)}z-index:${ATMOSPHERE.zIndex.film};` +
      `background-image:${textures.grain};background-size:${film.size};mix-blend-mode:overlay;` +
      `opacity:calc(${film.base} + var(--grit, 0) * ${film.grit});animation:${film.animation};` +
      `translate:var(--shake, ${SHAKE_STILL});` +
      `will-change:transform,translate;`,
    spec.mount,
  );

  /**
   * One colour fringe, screen-blended round the frame (gt#96). It covers the
   * whole window and is clear across the middle of it — see the two tokens for
   * the shape. Pinned flush like the vignette, and for the same reason never
   * moved: a fringe that slid would open a strip of bare page down one side.
   */
  const edge = (part: string, paint: string): HTMLElement =>
    box(
      part,
      `${pinned()}z-index:${ATMOSPHERE.zIndex.edges};background-image:${paint};` +
        `mix-blend-mode:screen;opacity:calc(var(--grit, 0) * ${ATMOSPHERE.edgeOpacity});`,
      spec.mount,
    );

  // Warm toward one corner, cold toward the opposite one: the split fringe a
  // lens throws when it is being asked for more than it has. GRIT is the only
  // thing that moves it.
  const warm = edge('edgeWarm', surfaces.gritEdgeWarm);
  const cold = edge('edgeCold', surfaces.gritEdgeCold);

  // The vignette is the last thing painted over the board and the first thing
  // the low band moves: it closes in as the room goes quiet.
  const vignette = box(
    'vignette',
    `${pinned()}z-index:${ATMOSPHERE.zIndex.vignette};background-image:${surfaces.vignette};` +
      `opacity:var(--vig, ${ATMOSPHERE.vig.base});will-change:opacity;`,
    spec.mount,
  );

  const layers = [wash, sigil, grain, warm, cold, vignette];
  /** The three that read `--grit`, and so the three it is written on. */
  const gritted = [grain, warm, cold];

  /** The tracked low band. Lerped rather than sampled, so nothing ever snaps. */
  let band = 0;
  /**
   * The same reading, tracked again and faster. A second follower rather than a
   * second reading: one call to the engine per frame either way, and the whole
   * difference between atmosphere and impact is the rate it is chased at.
   */
  let jolt = 0;
  /**
   * What is left of the last hit, as a share of the shake's whole reach (gt#74).
   * Not a reading and not a follower: it is set by {@link AtmosphereHandle.strike}
   * and does nothing but decay.
   */
  let kick = 0;
  /** Which entry of the jitter table the next shaken frame takes. */
  let tick = 0;
  let frame = 0;

  /**
   * How many generations the figure is currently drawn at. Zero until SERIOUSNESS
   * says otherwise, which is also why the layer paints nothing at all before it
   * is told — a board that has never been given a value has no figure, rather
   * than one at some default depth nobody chose.
   */
  let depth = 0;

  /** Whether the room is pinned. Held here so `start` can be called into it. */
  let still = false;
  /** The engine's reading call, kept so the loop can be picked back up. */
  let levels: (() => Levels) | null = null;

  /**
   * Write a variable on the one layer that reads it, and only when it has
   * actually moved. The board spends most of its life on a low band that is
   * drifting rather than jumping, and at three decimal places a drift is a
   * string that keeps coming out the same — so the common frame writes nothing
   * at all rather than restating what the page already says.
   */
  const written = new Map<string, string>();
  const write = (element: HTMLElement, name: string, value: string): void => {
    if (written.get(name) === value) return;
    written.set(name, value);
    element.style.setProperty(name, value);
  };

  /**
   * `--shake` on both layers that read it, and only when it has moved.
   *
   * It cannot go through the `write` map above: that map is keyed by variable
   * name, so the grain's write would be swallowed as a repeat of the wash's. One
   * value tracked for the pair instead — they are always written together, so
   * there is only ever one thing to remember.
   */
  let shaken = '';
  const writeShake = (value: string): void => {
    if (shaken === value) return;
    shaken = value;
    wash.style.setProperty('--shake', value);
    grain.style.setProperty('--shake', value);
  };

  /**
   * The two clocks the joints swing on (gt#108), in radians, and when they were
   * last moved. The one thing in this file that is *accumulated* rather than
   * tracked — a sway is a thing in time, and a band cannot say where in its
   * swing a limb is. Which is why STILLNESS does not freeze them: it puts
   * them, and the swing, back to nothing.
   */
  let slow = 0;
  let quick = 0;
  let stamp = NaN;

  /**
   * One pass of the loop. Reads once, moves both followers, and writes only what
   * has actually changed — which, the figure's joints aside, on a settled low
   * band under the shake floor is nothing at all.
   */
  const step = (now?: number): void => {
    // How long since the last frame. Everything below runs on that rather than
    // on the frame count (gt#120): the joints in milliseconds, and the two
    // followers, the kick and the jitter in sixtieths of a second, which is
    // what "per frame" meant when their numbers were chosen.
    const at = stampOf(now);
    const elapsed = gapMs(stamp, at);
    const frames = framesIn(elapsed);
    stamp = at;

    const low = levels ? levels().low : 0;
    band = follow(band, low, ATMOSPHERE.lerp, frames);
    jolt = follow(jolt, low, ATMOSPHERE.shake.follow, frames);

    const next = washAt(band);
    write(wash, '--breathe', next.breathe);
    write(wash, '--brite', next.brite);
    write(vignette, '--vig', next.vig);
    // Off the same follower as the three above, so the figure turns with the
    // room rather than on a clock of its own — and brightens with it, and with
    // whatever is left of the last blow (gt#102). Read before the kick below is
    // spent, so the frame of the hit is the brightest one.
    write(sigil, '--turn', turnAt(band));
    write(sigil, '--glow', glowAt(band, kick));
    // It swells on the same follower and jumps on the same blow (gt#108)…
    write(sigil, '--swell', swellAt(band, kick));
    // …and its joints swing: the limbs on a slow clock and the fingers on a
    // quicker one, both wider and faster as the room gets loud. Four numbers
    // for thirty parts — each part mixes its tier's two into its own phase.
    const { limb, finger } = ATMOSPHERE.sigil.sway;
    slow += swayStep(limb, elapsed, band);
    quick += swayStep(finger, elapsed, band);
    const sway = swayAt(limb, slow, band);
    const curl = swayAt(finger, quick, band);
    write(sigil, '--sway-x', sway.x);
    write(sigil, '--sway-y', sway.y);
    write(sigil, '--curl-x', curl.x);
    write(sigil, '--curl-y', curl.y);

    // Both shaken layers take the same offset, so the room moves as one thing
    // rather than as two. Under the floor that offset is a constant, so a quiet
    // board pays for the shake exactly once and then never again.
    //
    // The larger of the two sources, not their sum (gt#74): a blow landing in the
    // middle of a loud passage should show over it, and a blow landing on a
    // quiet board should be no smaller for the quiet. The kick is spent after
    // it has been drawn, so the frame of the hit is the hit.
    //
    // The jitter steps through its table on the same clock: one entry a
    // sixtieth of a second, so a fast display holds each offset for more than
    // one of its frames instead of rattling through the table faster.
    writeShake(shakeOf(Math.max(shakeAmount(jolt), kick), Math.floor(tick)));
    kick = kickAfter(kick, frames);
    tick += frames;

    frame = requestAnimationFrame(step);
  };

  /** Kick the room. A strike and the hammer both land here, and nowhere else. */
  function kickBy(strength: number, ceiling = 1): void {
    // Both guards are the same sentence said about two different states: there
    // is no frame coming that would draw this. Stilled, that is a promise; cold,
    // it is simply the truth.
    if (still || !frame) return;
    // Written this way round so a strength that is not a number is refused too.
    if (!(strength > 0)) return;
    kick = Math.max(kick, Math.min(ceiling, strength));
  }

  return {
    layers,
    figure: sigil,
    setTuning(tuning: number): void {
      write(wash, '--hue', hueFor(tuning));
    },
    setSeriousness(seriousness: number): void {
      // Redrawn only when the *depth* actually moves, which over the wheel's
      // whole range happens at most three times. Rebuilding a few hundred
      // strokes per pointer event would be the expensive way to produce the
      // string the layer already has — the same reason `write` above compares
      // before it sets, applied to the one thing here that is not a variable.
      const next = depthAt(seriousness);
      if (next === depth) return;
      depth = next;
      draw(depth);
    },
    setGrit(amount: number): void {
      // The one variable with more than one reader — the grain and both fringes
      // — and it is written on each of the three rather than somewhere all
      // three inherit it from. That somewhere was the body, and a custom
      // property written on the body restyles every node under it: fine while
      // this moved only with a hand on the GRIT box, and the largest cost on
      // the page once MEGADRIFT moved it on every tick.
      const value = amount.toFixed(ATMOSPHERE.grit.digits);
      if (written.get('--grit') === value) return;
      written.set('--grit', value);
      for (const layer of gritted) layer.style.setProperty('--grit', value);
    },
    start(read: () => Levels): void {
      levels = read;
      // A board that opened stilled has nothing to start. The reading call is
      // kept all the same, so releasing the switch picks the room up from
      // whatever the engine is doing by then rather than from silence.
      if (frame || still) return;
      frame = requestAnimationFrame(step);
    },
    // A strike stops at the reach, whatever it is handed. Only the line below
    // is let past it (gt#92).
    strike: (strength: number) => kickBy(strength),
    smash(): void {
      kickBy(ATMOSPHERE.shake.smash, SHAKE_CEILING);
    },
    setStill(next: boolean): void {
      if (next === still) return;
      still = next;
      if (still) {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        // Back to the values the CSS already falls back to, rather than frozen
        // wherever the last frame happened to leave them: a stilled board should
        // look like the board before WAKE IT, not like a paused one. The two
        // followers are reset with them so a release starts from rest and rises,
        // which is the same thing the loop does on a cold page.
        band = 0;
        jolt = 0;
        // And whatever was left of a hit goes with them. A blow that was still
        // dying away when the switch was pressed does not finish dying away
        // when it is released.
        kick = 0;
        // `washAt(0)` rather than the three bases spelled out again: a band of
        // zero *is* the resting room, and reusing the arithmetic is what makes a
        // stilled board provably identical to a silent one.
        const rest = washAt(0);
        write(wash, '--breathe', rest.breathe);
        write(wash, '--brite', rest.brite);
        write(vignette, '--vig', rest.vig);
        write(sigil, '--turn', turnAt(0));
        write(sigil, '--glow', glowAt(0));
        // Its own size and every joint straight (gt#108), which is the shadow
        // lying on its cut. The clocks go back with them: a release starts a
        // swing from the middle, not from wherever the last one was stopped.
        write(sigil, '--swell', swellAt(0));
        for (const name of ['--sway-x', '--sway-y', '--curl-x', '--curl-y']) write(sigil, name, SWAY_STILL);
        slow = 0;
        quick = 0;
        stamp = NaN;
        writeShake(SHAKE_STILL);
        // The one moving thing here that is not ours to write: the grain runs on
        // its own keyframes, so it is paused rather than set.
        grain.style.animationPlayState = 'paused';
        return;
      }
      grain.style.animationPlayState = '';
      if (!frame && levels) frame = requestAnimationFrame(step);
    },
    destroy(): void {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      band = 0;
      jolt = 0;
      kick = 0;
      tick = 0;
      depth = 0;
      slow = 0;
      quick = 0;
      stamp = NaN;
      still = false;
      levels = null;
      shaken = '';
      written.clear();
      // Nothing to take back off the page: every variable goes with the layer
      // it was written on.
      for (const layer of layers) layer.remove();
    },
  };
}
