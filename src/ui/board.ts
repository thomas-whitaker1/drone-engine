// The single screen. One plate, six scored wells, thirteen plates of hardware —
// nine source modules and the four boxes of THE CHAIN — plus the globals and
// the hammer in the top row, a guarded button beside it and two tapes at its end.
//
// The arrangement is fixed and deliberately not responsive. The brief asks
// spatial memory to do the work a menu would, so a narrow window scales the whole
// board down through `--fit` rather than reflowing it: a control stays where the
// hand last left it, at every width.
//
// Like every other component here it owns appearance and gesture and no state.
// The board *layout* is not the board *brain*: what a toggle does, what the
// hammer re-rolls, what SCRUB resets and where the wires go all belong to the
// callers of this file. Three consequences worth stating:
//
// The hammer (gt#40) is the sharpest case of that split and worth reading as one.
// This file owns the swing — the angles, the fall, the dust, the lift — and it
// owns *when* the blow lands, because a duration is part of a gesture. It owns
// nothing about what the blow does. `onSmash` fires at contact and not on the
// click, so the caller gets to be ignorant of hammers and the board gets to be
// ignorant of sound, which is the same bargain every other callback here makes.
//
// - **A well is scored, not stacked.** Sections are cut into the one plate — an
//   inset hairline over a darker fill — rather than being cards laid on top of
//   it. Nothing on this board looks like it was placed; it looks like it was
//   found already assembled.
// - **Every zone's contents come from the definition lists.** THE PULSE holds
//   whatever `zoneDefs('pulse')` returns, in build order, and THE CHAIN holds
//   `modifierDefs()`. No second ordering is written down here.
// - **The globals are `createControl`s** scoped `g`, the same component the
//   modules use. SERIOUSNESS is the biggest thing on the board at 112px, and it
//   is still the same gesture as everything else.
//
// The plate is the positioning parent for the layers that are measured against
// it — the wire SVG, and the blooms — which is why it is `position:relative` and
// why `element` is the plate rather than a wrapper. The tip tag is not one of
// them: it is fixed to the viewport, and a fixed child of this plate would be
// scaled by the `zoom` below. It hangs off the page instead. See ./tips.

import { figureRadius } from './atmosphere';
import { ATMOSPHERE, BOARD, SMASH, SMASH_VAR, TRAVEL, TRAVEL_VAR } from './constants';
import { WEATHER_VAR } from '../weathering';
import { SPARKS, sealSeats, sparkSpray } from '../tokens';
import { shockDelay, shockRadius, shockStrength } from './blooms';
import { createControl } from './control';
import type { ControlHandle, ControlSpec } from './control';
import { box, masked, stretched, unselectable } from './dom';
import { BEZEL, GRUBBY } from './grime';
import { createModifier, MODIFIER_SCOPE } from './modifier';
import type { ModifierHandle, ModifierState } from './modifier';
import { modifierDefs } from './modifiers';
import { createModule, etchLayer } from './module';
import type { ModuleHandle, ModuleParam, ModuleState } from './module';
import { zoneDefs } from './modules';
import type { SourceZone } from './modules';
import { CONTROLS, PACE_WORDS, TUNE_WORDS } from './words';
import { SOURCE_IDS } from '../engine/constants';
import type { ModifierId, SourceId } from '../engine/constants';
import type { Wire } from '../engine';
import {
  fonts,
  ink,
  placement,
  plate,
  sealTile,
  sourceKey,
  stationTile,
  glare,
  PIGMENTS,
  signals,
  SIGIL_INK,
  sourcePlates,
  surfaces,
  textureLayers,
  wells as wellTokens,
} from '../tokens';
import type { StationArt, ZoneId } from '../tokens';

/** What both globals are scoped to, and so the front half of their wear keys. */
export const GLOBAL_SCOPE = 'g';

/**
 * Where everything in the hammer's rig is, worked out from its parts (gt#40,
 * gt#111, gt#115) rather than written down in ./constants beside them. None of
 * these is a decision of its own — each is the parts said again, and a number
 * that has to equal a sum is a number that will one day stop equalling it.
 *
 * From the floor up: the bed, the sow block, the struck plate — `stand` is the
 * three of them, the struck face's height. Over that the ram's `lift`, and
 * over that the `rest` of the ram that shows before it falls. That is the
 * whole rig: nothing below the bed, and the ram and its columns going on up
 * out of the top of it.
 *
 * - `anvilTop`: the struck face, down from the rig's top. The ram's foot is
 *   exactly here when it is down.
 * - `strikeX`: the middle of everything.
 * - `ramTop`: where the top of the ram is when it is down — above the rig,
 *   because the ram is taller than the rig is.
 */
export const RIG = ((): {
  readonly height: number;
  readonly stand: number;
  readonly anvilTop: number;
  readonly strikeX: number;
  readonly ramTop: number;
} => {
  const stand = SMASH.foot.height + SMASH.block.height + SMASH.anvil.height;
  const height = stand + SMASH.lift + SMASH.rest;
  const anvilTop = height - stand;
  return {
    height,
    stand,
    anvilTop,
    strikeX: SMASH.rigWidth / 2,
    ramTop: anvilTop - SMASH.ram.height,
  };
})();

/**
 * How far right MEGADRIFT is moved from where the row would lay it (gt#115), so
 * that it stands *between* two of the seal's stations and not on one.
 *
 * The seal is centred on the board with a station at the top of it, and the
 * top row crosses that station and the one either side. Laid in order,
 * MEGADRIFT's tape was on the left-hand one. Its middle is put half way
 * between that station and the top one. Worked out from where the stations
 * are, so a board with a different number of modules moves the lever with
 * the ring.
 *
 * It is the *whole* distance, and nothing is moved by all of it alone: a third
 * goes into each of the three gaps before the lever (gt#117), which lands the
 * lever in the same place and puts TUNING and PACE evenly between it and
 * SERIOUSNESS.
 */
export const megadriftShift = (stations: number): number => {
  const seats = sealSeats(BOARD.seal.size, stations);
  const origin = BOARD.width / 2 - BOARD.seal.size / 2;
  const top = origin + (seats[0]?.x ?? 0);
  const left = origin + (seats[seats.length - 1]?.x ?? 0);
  const { serious, tuning, pace, megadrift, gap } = BOARD.fog;
  const laid =
    BOARD.padX + parseFloat(BOARD.fog.padding.split(' ')[1] ?? '0') +
    serious.width + tuning.width + pace.width + 3 * gap;
  return Math.max(0, Math.round((top + left) / 2 - megadrift.width / 2 - laid));
};

/** How tall the rig is cut. See {@link RIG}. */
export const RIG_HEIGHT = RIG.height;

/**
 * How much room COME APART's cover needs once it is lifted (gt#112), worked out
 * from the cover rather than written beside it for the reason {@link RIG} is.
 *
 * The cover is the size of the seat and hinged along the seat's top edge. Open,
 * it has swung `openDeg` about that edge — past upright — so its free edge is
 * above the hinge and nearer the eye, and a nearer thing is drawn larger. The
 * eye is `perspective` away, so the free edge is scaled by
 * `perspective / (perspective - depth)`.
 *
 * - `lift`: how far the free edge stands over the hinge, as drawn. The guard
 *   is cut that much taller than the seat, so a lifted cover is inside it.
 * - `width`: how wide the free edge is drawn. The guard is cut that wide.
 * - `height`: the seat and the lift over it.
 */
export const GUARD = ((): { readonly lift: number; readonly width: number; readonly height: number } => {
  const { seat, cover } = BOARD.apart;
  const turn = (cover.openDeg * Math.PI) / 180;
  const near = cover.perspective / (cover.perspective - seat.size * Math.sin(turn));
  const lift = Math.ceil(-seat.size * Math.cos(turn) * near);
  return { lift, width: Math.ceil(seat.size * near), height: seat.size + lift };
})();

/** The three settings that belong to the whole board rather than to one module. */
export type GlobalParam = 'seriousness' | 'tuning' | 'pace';

export interface GlobalState {
  /** 0–1. */
  readonly seriousness: number;
  /** An index into `TUNE_WORDS` — see ./words. */
  readonly tuning: number;
  /**
   * An index into `PACE_WORDS`, and so into `TEMPOS` (gt#45).
   *
   * It is **in** this state, unlike MEGADRIFT beside it on the plate, and the
   * difference is the whole reason both notes exist. MEGADRIFT decides how far
   * the board may wander from what a hand put there, which is a setting *about* a
   * board; the hammer must not be able to re-roll it. The heartbeat is not that
   * — it is a thing the board is doing, as much as SERIOUSNESS is, and a SMASH IT
   * that re-rolled every voice and left the tempo alone would be pulling its
   * punch.
   *
   * A step rather than a tempo for the same reason `tuning` is a step rather than
   * a frequency: what the board holds is which word the control is pointing at,
   * and turning that into beats a minute is the engine's business.
   */
  readonly pace: number;
}

/** Everything the board draws, held by whoever owns the engine. */
export interface BoardState {
  /** Until the lever has been pulled, an on module shows its lamp but no tint. */
  readonly woke: boolean;
  readonly g: GlobalState;
  readonly m: Readonly<Record<SourceId, ModuleState>>;
  readonly mods: Readonly<Record<ModifierId, ModifierState>>;
}

export interface BoardSpec {
  readonly state: BoardState;

  /** Completed drags per `scope.param`, for every wear halo on the board. */
  readonly wear?: Readonly<Record<string, number>>;

  /**
   * How many times the hammer has landed, across every session (gt#40). Handed in
   * at construction for the same reason the wear counts are: a returning user's
   * board is already marked, and a dent nobody struck this session is not
   * something to watch arrive.
   */
  readonly dents?: number;

  /** A module's power cluster was clicked. */
  readonly onToggle?: (id: SourceId, on: boolean) => void;

  /** A module's control was touched, before any value has moved. */
  readonly onPress?: (id: SourceId) => void;

  /** A module's control moved. */
  readonly onInput?: (id: SourceId, param: ModuleParam, value: number) => void;

  /**
   * A box's control was touched, before any value has moved. Nothing answers
   * this today: it is where the seam used to patch an unfed box (gt#97).
   */
  readonly onModifierPress?: (id: ModifierId) => void;

  /** A box's amount moved. */
  readonly onModifierInput?: (id: ModifierId, value: number) => void;

  /** SERIOUSNESS, TUNING or PACE moved. */
  readonly onGlobalInput?: (param: GlobalParam, value: number) => void;

  /**
   * Where the MEGADRIFT lever opens (gt#43). Handed in at construction rather than
   * read off {@link BoardSpec.state} because it is not part of one: the board's
   * state is what the hand set and what SMASH IT re-rolls, and how far the board
   * is allowed to wander away from that is a setting *about* a board rather than
   * a value in it. Keeping it out of {@link BoardState} is what makes "the hammer
   * cannot decide this" a fact about the types instead of a rule somebody has to
   * remember in `summon`.
   */
  readonly megadrift?: number;

  /**
   * Build the board with nothing powered up (gt#88): every module drawn dark,
   * whatever its switch says, until {@link BoardHandle.setBooted} brings it up.
   * For a board that is going to be woken. Left out, a module that is on is
   * lit, which is what a board built on its own wants.
   */
  readonly cold?: boolean;

  /** The MEGADRIFT lever moved (gt#43). */
  readonly onDriftInput?: (value: number) => void;

  /** Any drag on the board finished having actually moved, under its wear key. */
  readonly onCommit?: (key: string) => void;

  /** An OUT socket was pressed — a module's or a box's. Where a wire begins. */
  readonly onJackDown?: (id: SourceId | ModifierId, event: PointerEvent) => void;

  /**
   * The hammer landed (gt#40) — and *landed* is the whole of the contract. This
   * does not fire on the click that starts the swing; it fires at the moment of
   * contact, which is what makes the new board arrive on the frame of the hit
   * instead of before it.
   *
   * That the timing lives here rather than in the caller is the same split
   * everything else in this file keeps: the swing is a gesture and its duration
   * is part of the gesture, and what a re-rolled board *means* is the caller's.
   * A seam that had to know how long a hammer takes to fall would be a seam that
   * knows what the board looks like.
   *
   * On a stilled board it fires immediately, because there is no swing. STILLNESS
   * stops things moving and never changes what comes out of the speakers.
   */
  readonly onSmash?: () => void;

  /** The tape button in the corner. Makes it look new again. */
  readonly onScrub?: () => void;

  /**
   * The second tape in that corner was pressed (gt#33). The board does not decide
   * what it lands on and does not latch it itself — it reports the press and
   * waits to be told, the same way it reports a toggle rather than powering a
   * module. Which is not ceremony here: the answer outlives the page, so the
   * only thing entitled to decide it is the thing holding the stored choice.
   */
  readonly onStill?: () => void;

  /**
   * The third tape in that corner was pressed (gt#39). Reported rather than
   * latched, for the same reason and with the same consequence as the one above:
   * the answer outlives the page, so the thing holding the stored choice is the
   * only thing entitled to decide it.
   */
  readonly onApart?: () => void;

  /**
   * The window resized and `--fit` has been rewritten. The wire layer re-measures
   * here, because every endpoint it draws was read off a plate that has just
   * changed size. The new factor is passed for anything that wants to know it;
   * the wire layer does not, and measures the plate itself (gt#22).
   */
  readonly onResize?: (fit: number) => void;
}

export interface BoardHandle {
  /** The plate. Also the positioning parent for the wire, bloom and tip layers. */
  readonly element: HTMLElement;
  /**
   * The emblem layer (gt#102): over the plate and everything bolted to it, in the
   * plate's own coordinates. The seam seats the room's turning figure in it.
   * See {@link BOARD.emblem}.
   */
  readonly emblem: HTMLElement;
  readonly modules: ReadonlyMap<SourceId, ModuleHandle>;
  readonly modifiers: ReadonlyMap<ModifierId, ModifierHandle>;
  /**
   * The four globals, keyed `g.seriousness`, `g.tuning`, `g.pace` and
   * `g.megadrift`.
   *
   * All four are painted in the same scope and worn by the same lookup; only the
   * first three are fields of {@link BoardState}. See the MEGADRIFT lever.
   */
  readonly globals: ReadonlyMap<string, ControlHandle>;
  /** Each scored well by zone, for anything that needs to measure one. */
  readonly zones: ReadonlyMap<ZoneId, HTMLElement>;
  /**
   * Draw a state the caller decided on, without calling back into it.
   *
   * `heard` is the same board as it is being heard (gt#91): where MEGADRIFT has
   * carried each control. The controls are drawn there and *set* at `state`, so
   * a hand always moves a control from where it was put. Everything else on the
   * plate — power, lamps, the three globals — answers `state` alone.
   */
  setState(state: BoardState, heard?: BoardState): void;
  setWoke(woke: boolean): void;
  /**
   * Which modules the power has reached (gt#88), or `null` for all of them. A
   * module outside the set is drawn dark whatever its switch says.
   */
  setBooted(ids: ReadonlySet<string> | null): void;
  /** Wear one control anywhere on the board, by its `scope.param` key. */
  setWear(key: string, turns: number): void;
  /**
   * Draw the marks the hammer has left (gt#40), from a count the caller holds.
   * Clamped to what the anvil has room for — past that the marks stop reading as
   * separate hits, and a plate that is entirely hole is not more damaged-looking
   * than one that is nearly hole.
   */
  setDents(dents: number): void;
  /**
   * How weathered the board is, as `--weather` carries it, written on every
   * part that reads it — the rust, the runs, the seal — and on nothing above
   * them. See the note on what is told where it is read.
   */
  setWeather(weather: string): void;
  /**
   * Draw STILLNESS held down, or let it back up (gt#33), and stop the board's one
   * moving object with it.
   *
   * It was appearance only until gt#40 put a swinging thing on the plate. It is
   * still nothing but motion — a swing already in the air lands anyway, and the
   * re-roll it was carrying reaches the caller on time. Freezing that would be
   * this switch changing what comes out of the speakers, which is the one thing
   * it may never do.
   */
  setStill(still: boolean): void;
  /** Draw COME APART held down, or let it back up. Appearance only (gt#39). */
  setApart(apart: boolean): void;
  /**
   * A source was heard striking (gt#104): its station on the seal flashes —
   * every piece of it, on whichever plates it crosses — and settles back to
   * wherever it rests. Nothing on a stilled board, and nothing for an id with
   * no station.
   */
  strike(id: string, strength?: number): void;
  /**
   * A beat fell (gt#83). Flashes the lamp at PACE — or, on a stilled board, lights
   * it and leaves it lit. The board is told when; it does not keep time, and
   * nothing it does here is heard.
   */
  beat(): void;
  /**
   * Measure the plate again and fit it to the window again (gt#71).
   *
   * A resize needs no one to call this — the board hears those itself, and a
   * resize changes the window, not the plate. This is for the two moments the
   * *plate* changes height and nothing else would say so: when it is first
   * mounted, since a plate built off the page measures nothing, and when the
   * typefaces land, since every line box on it has just moved. `onResize` fires
   * on the way through, so whatever measures against the plate looks again too.
   */
  refit(): void;
  /** Detach everything: the resize listener, both buttons, every child. */
  destroy(): void;
}

/**
 * The board the reference opens on — already droning, because there is no empty
 * state and nothing to set up. The wake screen (gt#12) pushes this into the engine
 * the moment the lever bottoms out; it lives here because it is what the board
 * looks like, and because the suite can then quote it back against the reference.
 */
export const OPENING_STATE: BoardState = {
  woke: false,
  // PACE opens on DIRGE (gt#45), which is `TEMPOS[1]` and so the reference's own
  // 48 BPM. The board's opening tempo is not a new decision and is not made
  // here: it is the handoff's default, now merely reachable.
  g: { seriousness: 0.38, tuning: 2, pace: 1 },
  m: {
    guitar: { on: true, loud: 0.65, char: 0.6, often: 0 },
    bass: { on: true, loud: 0.7, char: 0.6, often: 0 },
    slowhit: { on: true, loud: 0.6, char: 0.5, often: 2 },
    cymbal: { on: true, loud: 0.35, char: 0.4, often: 3 },
    voice: { on: false, loud: 0.55, char: 1, often: 3 },
    chainsaw: { on: false, loud: 0.4, char: 0.4, often: 0 },
    sax: { on: false, loud: 0.45, char: 0.5, often: 0 },
    maracas: { on: false, loud: 0.5, char: 0.4, often: 1 },
    cow: { on: false, loud: 0.6, char: 0.6, often: 4 },
    // The two gt#42 added, both off. The reference opens on four modules and this
    // is what the board *sounds* like on arrival — a tenth and eleventh voice
    // switched on here would be changing the opening mix, which is a decision
    // nobody made. They open where they are worth finding: THROAT low enough
    // that its whistle is an overtone rather than a tone, and the cannon on
    // *almost never*, because a shot that size arriving every beat is a fault.
    throat: { on: false, loud: 0.5, char: 0.35, often: 0 },
    laser: { on: false, loud: 0.5, char: 0.3, often: 4 },
  },
  mods: {
    grit: { amount: 0.55, fed: false },
    murk: { amount: 0.5, fed: false },
    wobble: { amount: 0.35, fed: false },
    cavern: { amount: 0.5, fed: false },
    // The reference's opening state stops at four. These three are gt#41's, and
    // they open on the same numbers the engine does — the whole point of
    // `MODIFIER_DEFAULTS` being the one place a box's opening amount is written.
    doppler: { amount: 0.3, fed: false },
    magnets: { amount: 0.25, fed: false },
    offset: { amount: 0.35, fed: false },
  },
};

/**
 * The four cables already in place when the board opens. They are part of the
 * same opening picture as {@link OPENING_STATE} and live beside it for the same
 * reason, but they are kept separate because a wire is not board *appearance* —
 * the board draws no cables of its own, the wire layer (gt#13) does, and the engine
 * is what a wire actually means.
 *
 * The patch is chosen to demonstrate the chain rather than to fill it: GUITAR
 * WALL runs through two boxes in series, BASS through one, SLOW HIT shares a box
 * with the guitar, and the rest are left empty so there is something obvious to
 * try.
 *
 * gt#41 took the rack from four boxes to seven and left this list alone, which is
 * the decision rather than the oversight. Four cables into seven boxes is an
 * emptier rack than four into four, and that is the right direction: the hint at
 * the far end of THE FOG says *drag a wire from OUT to IN*, and a board with
 * three obviously unused boxes is that sentence drawn instead of written.
 */
export const OPENING_WIRES: readonly Wire[] = [
  { from: 'guitar', to: 'grit' },
  { from: 'grit', to: 'cavern' },
  { from: 'bass', to: 'murk' },
  { from: 'slowhit', to: 'cavern' },
];

/**
 * How far the board is scaled in a given window: the largest factor at which the
 * whole plate is on screen, both ways (gt#71). Never above 1 — a board blown up
 * past its own design resolution reads as a screenshot of itself.
 *
 * It was the width alone until gt#71, and a board that fitted one way simply fell
 * off the bottom of a short window. That is the one failure this product cannot
 * afford: the conceit is a panel seen all at once, THE CHAIN is the bottom row,
 * and the only instruction on the plate is to drag a wire to it. It also turned
 * gt#28 into a trap — a control swallows the wheel so the page cannot scroll out
 * from under it, which is right until the page *has* to be scrolled and every
 * second thing under the cursor eats the attempt and changes its value instead.
 * A board with nothing below the fold has nothing to scroll to.
 *
 * `naturalHeight` is the plate's own height in board pixels, and it is measured
 * rather than known — see `measureNatural` in {@link createBoard} for why no
 * constant can supply it. Zero, or left out, means it has not been measured, and
 * then the width decides alone: a board that cannot say how tall it is fits the
 * way it always did rather than guessing.
 */
export const fitFor = (viewportWidth: number, viewportHeight = 0, naturalHeight = 0): number =>
  Math.min(
    1,
    viewportWidth / BOARD.width,
    naturalHeight > 0 && viewportHeight > 0 ? viewportHeight / naturalHeight : 1,
  );

/**
 * A factor as `--fit` carries it: four decimals, rounded **down**.
 *
 * Down rather than to nearest, and it matters on exactly one axis. Rounded up,
 * a height-fitted plate comes out a fraction of a pixel taller than the window,
 * which is all a browser needs to show a scrollbar — on the one layout whose
 * whole purpose is to have nothing to scroll.
 */
export const fitText = (fit: number): string => (Math.floor(fit * 10000) / 10000).toFixed(4);

/**
 * How many times a factor is checked against the plate it produced before it
 * is taken as settled. Two was enough at every window size tried; the third is
 * so that the bound is never what decides.
 */
const FIT_PASSES = 3;

/** One full-plate texture overlay. The board has no corners to clip to. */
const overlay = (parent: HTMLElement, part: string, style: string): HTMLElement =>
  box(part, `${stretched()}${style}pointer-events:none;`, parent);

/** Build the board. */
export function createBoard(spec: BoardSpec): BoardHandle {
  const skirt = textureLayers.board;

  let state = spec.state;

  const element = box(
    'board',
    `position:relative;z-index:${BOARD.zIndex};display:grid;grid-template-areas:${BOARD.areas};` +
      `grid-template-columns:${BOARD.columns};grid-template-rows:${BOARD.rows};` +
      `gap:${BOARD.gap}px;width:${BOARD.width}px;margin:0 auto;padding:${BOARD.padding};` +
      `align-content:${BOARD.slack};` +
      `min-height:calc(100vh / var(--fit, 1));box-sizing:border-box;zoom:var(--fit, 1);` +
      `background:${surfaces.boardPlate};box-shadow:${surfaces.boardShadow};${unselectable()}`,
  );

  // The seal, and the first thing laid on the plate — under the grain, the rust
  // and the scratches, because a mark cut into a board is under whatever settled
  // on it afterwards (gt#36).
  //
  // Driven by `--weather` alone, with nothing at the base: a board nobody has
  // run carries no seal, and one left going for twenty minutes has a faint one.
  // That is the whole of its behaviour and there is nothing to configure — the
  // weathering clock was already counting, and this gives it a second job for
  // free. SCRUB THE ALTAR takes it away again with everything else, which is
  // right: the button means "make it look new again".
  //
  // The tile is published once, on the plate, and read from there by this
  // layer and by every plate and box bolted on top (gt#105). See BOARD.sealVar.
  const sealSpec = {
    key: 'seal',
    size: BOARD.seal.size,
    // A station for every source, each cut with that source's own figure —
    // the one on its cable (gt#103).
    marks: SOURCE_IDS.map(sourceKey),
    depth: BOARD.seal.depth,
    stroke: BOARD.seal.stroke,
    alpha: 1,
    // A cut is made of what it is cut into: the scratch layer's two colours.
    dark: PIGMENTS.scratchDark,
    lit: SIGIL_INK.ghost,
    // And at the centre, the coarse arms of the figure that turns over it,
    // at the size and the angle the light rests at.
    figure: {
      key: ATMOSPHERE.sigil.key,
      depth: BOARD.seal.figureDepth,
      frameDepth: ATMOSPHERE.sigil.maxDepth,
      radius: figureRadius(),
    },
    wear: BOARD.seal.wear,
  } as const;
  element.style.setProperty(BOARD.sealVar, sealTile(sealSpec));
  /** The seal as one box of its own size, wherever it is put. */
  const sealPaint =
    `position:absolute;width:${BOARD.seal.size}px;height:${BOARD.seal.size}px;` +
    `background-image:var(${BOARD.sealVar});background-size:100% 100%;background-repeat:no-repeat;`;
  // The plate's own: dead centre, by CSS, with nothing to measure.
  const boardSeal = box(
    'seal',
    `${sealPaint}left:50%;top:50%;margin:${-BOARD.seal.size / 2}px 0 0 ${-BOARD.seal.size / 2}px;`,
    etchLayer(element),
  );

  // Four layers, and the middle two used to be one tile wearing three hats: rust
  // spread evenly over the whole plate, then the same tile again at another size
  // and hue-rotated 95° to pass as verdigris. Both are drawn now, from different
  // seeds, and the rust is masked to the plate's edges — gt#35. What survives from
  // before is the offset verdigris position, which is still what stops the two
  // corrosions from lining up.
  overlay(element, 'grain', `background-image:var(--grainTex);opacity:${skirt.grain};mix-blend-mode:overlay;`);
  overlay(
    element,
    'rust',
    `background-image:var(--rustTex);background-size:${skirt.rustSize};` +
      `${masked(skirt.rustMask)}` +
      `opacity:calc(${skirt.rustBase} + var(--weather, 0) * ${skirt.rustWeather});`,
  );
  overlay(
    element,
    'verdigris',
    `background-image:var(--verdiTex);background-size:${skirt.verdigrisSize};` +
      `background-position:${skirt.verdigrisPosition};opacity:${skirt.verdigris};`,
  );
  overlay(
    element,
    'scratches',
    `background-image:var(--scratchTex);background-size:${skirt.scratchSize};` +
      `opacity:${skirt.scratches};mix-blend-mode:screen;`,
  );
  // The same tile turned over (gt#89), so the marks on the bare plate lean both
  // ways. The layer is turned, never the plate: it is an overlay no jack is
  // measured against.
  overlay(
    element,
    'scratchesBack',
    `background-image:var(--scratchTex);background-size:${skirt.scratchBackSize};` +
      `background-position:${skirt.scratchBackPosition};transform:scaleX(-1);` +
      `opacity:${skirt.scratchesBack};mix-blend-mode:screen;`,
  );

  const zones = new Map<ZoneId, HTMLElement>();

  /** One scored well: fill and hairline from the tokens, cut into its own cell. */
  function well(zone: ZoneId, area: string, parent: HTMLElement, style: string): HTMLElement {
    const skin = wellTokens[zone];
    const cell = box(
      'well',
      `grid-area:${area};position:relative;padding:${BOARD.well.padding};` +
        `background:${skin.fill};box-shadow:${skin.shadow};${style}`,
      parent,
    );
    cell.dataset.zone = zone;
    zones.set(zone, cell);
    return cell;
  }

  // ------------------------------------------------------------------ THE FOG

  const fog = box(
    'well',
    `grid-area:fog;position:relative;display:flex;align-items:center;gap:${BOARD.fog.gap}px;` +
      `padding:${BOARD.fog.padding};background:${wellTokens.fog.fill};box-shadow:${wellTokens.fog.shadow};`,
    element,
  );
  fog.dataset.zone = 'fog';
  zones.set('fog', fog);

  // The row's name stood here, the first thing in it and the largest lettering
  // on the plate. It went with the other five (gt#110), and the figure that was
  // left in the corner went after it (gt#113). The row begins with the wheel.

  const globals = new Map<string, ControlHandle>();

  /** One of the two globals, wired to the caller through the spec. */
  function global(
    param: GlobalParam,
    shape: Omit<ControlSpec, 'scope' | 'param' | 'value' | 'onInput'>,
  ): ControlHandle {
    const handle = createControl({
      ...shape,
      scope: GLOBAL_SCOPE,
      param,
      value: state.g[param],
      wearTurns: spec.wear?.[`${GLOBAL_SCOPE}.${param}`] ?? 0,
      onInput: (value) => spec.onGlobalInput?.(param, value),
      onCommit: (key) => spec.onCommit?.(key),
    });
    globals.set(handle.key, handle);
    fog.appendChild(handle.element);
    return handle;
  }

  // SERIOUSNESS is the largest control on the board by some distance, and a wheel
  // rather than a knob because the thing it sets has no natural stop.
  const serious = global('seriousness', {
    kind: 'wheel',
    label: CONTROLS.seriousness.label,
    diameter: BOARD.fog.serious.diameter,
    width: BOARD.fog.serious.width,
    fontSize: BOARD.fog.serious.fontSize,
  });
  const tuning = global('tuning', {
    kind: 'selector',
    label: CONTROLS.tuning.label,
    steps: TUNE_WORDS.length,
    words: TUNE_WORDS,
    face: sourcePlates.bass.face,
    diameter: BOARD.fog.tuning.diameter,
    width: BOARD.fog.tuning.width,
    fontSize: BOARD.fog.tuning.fontSize,
  });

  // PACE (gt#45), and a selector for the same reason TUNING is one: a short list of
  // words over a range, where every position is worth landing on exactly. It goes
  // through `global` rather than being built by hand like MEGADRIFT below,
  // because unlike that lever it *is* a field of the board's state — so the
  // helper's whole job, reading the value out of `state.g`, is the right one here.
  //
  // Cut to the slow plate rather than the bass one TUNING wears. The two sit
  // beside each other and answer the same gesture, and the one thing that should
  // tell them apart at a glance is which of them is which.
  const pace = global('pace', {
    kind: 'selector',
    label: CONTROLS.pace.label,
    steps: PACE_WORDS.length,
    words: PACE_WORDS,
    face: sourcePlates.slowhit.face,
    diameter: BOARD.fog.pace.diameter,
    width: BOARD.fog.pace.width,
    fontSize: BOARD.fog.pace.fontSize,
  });

  // The beat lamp (gt#83), in the corner of PACE's own column — which is the
  // control it answers, and already a positioning parent. It is not part of the
  // control: `createControl` knows nothing about tempo and should not, so the
  // lamp is the board's, hung on a seat the control happens to provide. It
  // carries no cursor and no word, so neither the wire layer nor the tip layer
  // takes it for something a hand can use.
  //
  // On a layer of its own, and it is the one lamp on the board that is. It is
  // also the one thing on the board that changes on a clock: lit and faded on
  // every beat, for as long as the page is open. Painted into the plate, each
  // of those was a strip of the plate drawn again — its grain, its rust and its
  // scratches — to change nine pixels; measured, it was half of what the GPU
  // did on a board nobody was touching.
  const beatLamp = box(
    'beat',
    `position:absolute;top:${BOARD.fog.beat.top}px;right:${BOARD.fog.beat.right}px;` +
      `width:${BOARD.fog.beat.size}px;height:${BOARD.fog.beat.size}px;border-radius:50%;${BEZEL}` +
      `background:${signals.lampOff};box-shadow:${signals.lampGlowOff};pointer-events:none;` +
      `will-change:transform;`,
    pace.element,
  );

  // MEGADRIFT (gt#43). Built beside the other two and scoped with them — its wear
  // key is `g.megadrift`, so the halo is found by the same lookup and the drags
  // are counted by the same clause — but it does not go through `global` above,
  // because that helper's whole job is to read a param out of `state.g` and this
  // one is deliberately not in there. The two facts are not in tension: `g` is
  // the scope a control is *painted in*, and `GlobalState` is what the hammer
  // re-rolls. This control belongs to the first and not the second.
  const megadrift = createControl({
    kind: 'lever',
    scope: GLOBAL_SCOPE,
    param: 'megadrift',
    label: CONTROLS.megadrift.label,
    value: spec.megadrift ?? 0,
    height: BOARD.fog.megadrift.height,
    width: BOARD.fog.megadrift.width,
    fontSize: BOARD.fog.megadrift.fontSize,
    wearTurns: spec.wear?.[`${GLOBAL_SCOPE}.megadrift`] ?? 0,
    // No tell (gt#117): on a lever this tall it is a pale band down both sides
    // of the slot. Its drags are still counted; see `untold` in ./control.
    untold: true,
    onInput: (value) => spec.onDriftInput?.(value),
    onCommit: (key) => spec.onCommit?.(key),
  });
  globals.set(megadrift.key, megadrift);
  // Moved along, so it stands between two stations of the seal rather than on
  // one (gt#115) — and the distance it was moved is shared between the three
  // gaps before it (gt#117), so TUNING and PACE stand evenly between
  // SERIOUSNESS and it rather than bunched against the wheel with a hole
  // after them. See megadriftShift.
  const spread = `${(megadriftShift(SOURCE_IDS.length) / 3).toFixed(2)}px`;
  for (const control of [tuning, pace, megadrift]) control.element.style.marginLeft = spread;
  fog.appendChild(megadrift.element);

  // Everything after this is packed against the right-hand end of the row
  // (gt#115): the hammer, and then the group with the guarded button in it.
  box('spacer', 'flex:1;', fog);
  const tail = box(
    'tail',
    `display:flex;align-items:flex-end;gap:${BOARD.fog.tail.gap}px;align-self:flex-end;`,
    fog,
  );

  // SMASH IT (gt#40), where the verdigris dome used to be. The act is unchanged —
  // one press still re-rolls every source, every box, both globals and the whole
  // patch — and everything about the object admits it now.
  //
  // The rig is a fixed box the swing happens inside, and it is one element rather
  // than the hammer being positioned against the well for a reason worth stating:
  // the anvil, the marks and the dust all have to agree on where the struck point
  // is, and a shared positioning parent is the only way to say that once.
  const smash = box(
    'smash',
    `display:flex;flex-direction:column;align-items:center;gap:${SMASH.gap}px;cursor:pointer;`,
    tail,
  );
  const rig = box(
    'rig',
    `position:relative;width:${SMASH.rigWidth}px;height:${RIG_HEIGHT}px;`,
    smash,
  );

  /** A box standing on the rig's floor, centred under the ram. */
  const stood = (part: string, width: number, height: number, up: number, style: string): HTMLElement =>
    box(
      part,
      `position:absolute;left:${RIG.strikeX}px;bottom:${up}px;translate:-50% 0;` +
        `width:${width}px;height:${height}px;${style}`,
      rig,
    );
  /** The hazard stripe on a strip of steel, chipped: the steel shows through. */
  const striped = (host: HTMLElement, chips: string): HTMLElement =>
    box(
      'hazard',
      `${stretched()}background:${signals.hammerHazard};${masked('var(--chipTex)')}` +
        `-webkit-mask-position:${chips};mask-position:${chips};`,
      host,
    );

  // The bed, the sow block on it and the struck plate on that, with the marks
  // in it. All under the ram in the stack, so a ram that is down covers the
  // point it landed on, which is what a hammer does to the thing it hits.
  box(
    'foot',
    `position:absolute;left:0;right:0;bottom:0;height:${SMASH.foot.height}px;` +
      `border-radius:1px;background:${signals.anvilFoot};`,
    rig,
  );
  striped(
    stood('block', SMASH.block.width, SMASH.block.height, SMASH.foot.height, `background:${signals.hammerBand};`),
    SMASH.blockChips,
  );
  const anvil = stood(
    'anvil',
    SMASH.anvil.width,
    SMASH.anvil.height,
    SMASH.foot.height + SMASH.block.height,
    `border-radius:${SMASH.anvil.radius}px;background:${signals.anvilFace};box-shadow:${signals.anvilShadow};`,
  );
  const dents = box('dents', `${stretched()}overflow:hidden;border-radius:${SMASH.anvil.radius}px;`, anvil);

  // The ram, in a shaft that runs from the lip of the well down to the floor
  // and shows nothing above it. The ram is taller than the shaft is, so there
  // is always more of it up there: at rest only its foot hangs into view.
  //
  // It is called `hammer` because it is the part that falls, and it falls by
  // `translate` — a standalone property, for the reason the shake is one
  // (gt#33): the pieces inside carry their own positioning and this composes
  // with it. At `0 0` the die is on the plate; see RIG.
  const { ram } = SMASH;
  const shaft = box(
    'shaft',
    `position:absolute;left:0;right:0;top:${-SMASH.overhead}px;bottom:0;overflow:hidden;` +
      `pointer-events:none;`,
    rig,
  );
  const hammer = box(
    'hammer',
    `position:absolute;left:${RIG.strikeX - ram.width / 2}px;top:${RIG.ramTop + SMASH.overhead}px;` +
      `width:${ram.width}px;height:${ram.height}px;translate:0 ${-SMASH.lift}px;`,
    shaft,
  );
  /** Something on the ram, placed from its bottom — the end anyone sees. */
  const onRam = (part: string, up: number, height: number, style: string): HTMLElement =>
    box(part, `position:absolute;bottom:${ram.die.height + up}px;height:${height}px;${style}`, hammer);

  // The body: everything above the die, with its two bottom corners cut.
  const bodyHeight = ram.height - ram.die.height;
  box(
    'body',
    `position:absolute;left:0;right:0;top:0;height:${bodyHeight}px;background:${signals.hammerRam};` +
      `clip-path:polygon(0 0, ${ram.width}px 0, ${ram.width}px ${bodyHeight - ram.chamfer}px, ` +
      `${ram.width - ram.chamfer}px ${bodyHeight}px, ${ram.chamfer}px ${bodyHeight}px, ` +
      `0 ${bodyHeight - ram.chamfer}px);`,
    hammer,
  );
  // Lines of rivets, small and many: it is the size of a rivet that says how
  // big the thing it is in must be.
  for (const up of ram.rows.up) {
    onRam(
      'rivets',
      up,
      ram.rows.height,
      `left:${ram.rows.inset}px;right:${ram.rows.inset}px;background-image:${signals.hammerRivets};` +
        `background-size:${ram.rows.pitch}px ${ram.rows.height}px;background-repeat:repeat-x;` +
        `background-position:center;`,
    );
  }
  // A band of hazard paint. The one colour on the machine, and chipped.
  striped(
    onRam('stripe', ram.stripe.up, ram.stripe.height, `left:0;right:0;background:${signals.hammerBand};`),
    ram.stripe.chips,
  );
  // A plate bolted to the face of it, which only comes into view as it falls.
  const panel = onRam(
    'panel',
    ram.panel.up,
    ram.panel.height,
    `left:${ram.panel.inset}px;right:${ram.panel.inset}px;border-radius:2px;` +
      `background:${signals.hammerBand};box-shadow:${signals.anvilShadow};`,
  );
  for (const [x, y] of [
    ['left', 'top'],
    ['right', 'top'],
    ['left', 'bottom'],
    ['right', 'bottom'],
  ] as const) {
    box(
      'bolt',
      `position:absolute;${x}:${ram.panel.boltInset}px;${y}:${ram.panel.boltInset}px;` +
        `width:${ram.panel.bolt}px;height:${ram.panel.bolt}px;border-radius:50%;` +
        `background:${signals.hammerBolt};`,
      panel,
    );
  }
  // The die: the striking face, at the very bottom. It is the only part of
  // this object that ever touches the board, and it is lighter for the same
  // reason the anvil is: the two surfaces that meet are the two that stay
  // polished.
  box(
    'face',
    `position:absolute;left:50%;bottom:0;translate:-50% 0;width:${ram.die.width}px;` +
      `height:${ram.die.height}px;border-radius:0 0 2px 2px;background:${signals.hammerFace};`,
    hammer,
  );

  // The two columns it runs between, after the shaft so they are in front of
  // the ram's edges. They start at the lip of the well and stand on the bed.
  for (const side of ['left', 'right'] as const) {
    const column = box(
      'column',
      `position:absolute;${side}:${SMASH.column.inset}px;top:${-SMASH.overhead}px;` +
        `bottom:${SMASH.foot.height}px;width:${SMASH.column.width}px;` +
        `background:${signals.hammerPost};pointer-events:none;`,
      rig,
    );
    box(
      'rivets',
      `${stretched()}background-image:${signals.hammerRivets};` +
        `background-size:${SMASH.column.width}px ${SMASH.column.rivetPitch}px;` +
        `background-repeat:repeat-y;background-position:center;`,
      column,
    );
    box(
      'shoe',
      `position:absolute;left:50%;bottom:0;translate:-50% 0;width:${SMASH.column.shoe.width}px;` +
        `height:${SMASH.column.shoe.height}px;border-radius:1px;background:${signals.hammerBand};`,
      column,
    );
  }

  // The puff. Sized once and scaled from the middle of the struck point, so the
  // one number that decides how far it spreads is the transform rather than a
  // second width nobody would remember to keep in step with the first.
  const dust = box(
    'dust',
    `position:absolute;left:${RIG.strikeX}px;bottom:${RIG.stand - SMASH.dustSize / 2}px;` +
      `width:${SMASH.dustSize}px;height:${SMASH.dustSize}px;translate:-50% 0;` +
      `background-image:${signals.dust};border-radius:50%;opacity:0;pointer-events:none;`,
    rig,
  );

  // The flare along the struck line (gt#115), and the sparks off both ends of
  // it. Both sit at the struck face and are nothing until a blow.
  const glint = box(
    'flare',
    `position:absolute;left:${RIG.strikeX}px;top:${RIG.anvilTop}px;translate:-50% -50%;` +
      `width:${ram.die.width + 2 * SMASH.flare.over}px;height:${SMASH.flare.height}px;` +
      `background:${signals.strikeFlare};opacity:0;pointer-events:none;`,
    rig,
  );
  const sparks = box(
    'sparks',
    `position:absolute;left:${RIG.strikeX}px;top:${RIG.anvilTop}px;width:0;height:0;pointer-events:none;`,
    rig,
  );
  // Two elements a spark, because one cannot do an arc: the outer goes out and
  // slows, the inner goes up and comes down, and the two together are a thing
  // thrown. See `throwSparks`.
  const embers = Array.from({ length: SPARKS.count }, () => {
    const fly = box('spark', 'position:absolute;left:0;top:0;opacity:0;', sparks);
    const ember = box(
      'ember',
      `position:absolute;left:${-SPARKS.width / 2}px;bottom:0;width:${SPARKS.width}px;height:0;` +
        `border-radius:${SPARKS.width / 2}px;transform-origin:50% 100%;` +
        `background:${signals.spark};box-shadow:${signals.sparkGlow};`,
      fly,
    );
    return { fly, ember };
  });

  const smashLabel = box(
    'tape',
    `background:${ink.tape};${GRUBBY}color:${ink.tapeInk};font-family:${fonts.tape};` +
      `font-size:${SMASH.fontSize}px;padding:${SMASH.padding};` +
      `box-shadow:${ink.buttonShadow};`,
    smash,
  );
  smashLabel.textContent = CONTROLS.smash.label;

  // The far end of the row (gt#112, gt#114): the two tapes that undo rather than
  // play, and between them the one control that only ever makes things worse.
  // One group, on the row's bottom line, so the three tapes read as three
  // strips stuck along one edge and the button stands over the middle one.
  const end = box(
    'end',
    `display:flex;align-items:flex-end;gap:${BOARD.fog.end.gap}px;`,
    tail,
  );

  /** One of the two scraps of tape either side of the button. */
  const scrapTape = (part: string, cut: { fontSize: number; padding: string; width: number; opacity: number }): HTMLElement =>
    box(
      part,
      `width:${cut.width}px;box-sizing:border-box;text-align:center;` +
        `background:${ink.tapeScrap};${GRUBBY}color:${ink.tapeInk};font-family:${fonts.tape};` +
        `font-size:${cut.fontSize}px;padding:${cut.padding};cursor:pointer;` +
        `box-shadow:${ink.buttonShadow};opacity:${cut.opacity};white-space:nowrap;`,
      end,
    );

  // STILLNESS first. It is the one control on this board that is about the
  // person looking at it, cut to SCRUB's tape so it reads as stuck on
  // afterwards rather than designed in — which is what it is. What it actually
  // stops is ../stillness's business; this is a button that says it was pressed.
  const still = scrapTape('still', BOARD.still);
  still.textContent = CONTROLS.stillness.label;

  // COME APART (gt#39): a big red button under a hinged cover (gt#112), old and
  // knocked about (gt#114). It is the one control on the board that only ever
  // makes things worse, and that is what a guard is for. What it arms is
  // ../ui/rupture's business and whether it is armed is the caller's; this is
  // a button that says it was pressed, and a cover that is the board's own.
  // See BOARD.apart for the two acts it takes.
  const guardSpec = BOARD.apart;
  const apart = box(
    'apart',
    `display:flex;flex-direction:column;align-items:center;gap:${guardSpec.gap}px;` +
      `width:${guardSpec.width}px;cursor:pointer;`,
    end,
  );
  // As tall as the lifted cover reaches — see GUARD — and as wide as the seat.
  // A lifted cover is drawn a little wider than the seat it is hinged to; the
  // overhang is over the two tapes either side, which is nothing.
  const guard = box(
    'guard',
    `position:relative;width:${guardSpec.seat.size}px;height:${GUARD.height}px;`,
    apart,
  );
  const seat = box(
    'seat',
    `position:absolute;left:0;bottom:0;` +
      `width:${guardSpec.seat.size}px;height:${guardSpec.seat.size}px;` +
      `border-radius:${guardSpec.seat.radius}px;background:${signals.apartSeat};` +
      `box-shadow:${signals.hammerShadow};`,
    guard,
  );
  /**
   * A texture laid several times over, each lay at its own size and shift — see
   * BOARD.apart.rust for why one lay of a tile cut for a plate is not enough on
   * something this small.
   */
  const laid = (
    parent: HTMLElement,
    part: string,
    texture: string,
    layers: ReadonlyArray<readonly [number, number, number]>,
    style: string,
  ): HTMLElement => {
    // One element a lay rather than one element with several backgrounds: the
    // same picture, and each lay is then a thing that can be looked at.
    const host = box(part, `${stretched()}overflow:hidden;pointer-events:none;${style}`, parent);
    for (const [size, x, y] of layers) {
      box(
        'lay',
        `${stretched()}background-image:var(${texture});background-size:${size}px;` +
          `background-position:${x}px ${y}px;`,
        host,
      );
    }
    return host;
  };
  /** A disc in the middle of the seat. The ring, the recess and the dome are three. */
  const disc = (part: string, size: number, style: string): HTMLElement =>
    box(
      part,
      `position:absolute;left:50%;top:50%;translate:-50% -50%;width:${size}px;height:${size}px;` +
        `border-radius:50%;${style}`,
      seat,
    );
  // The hazard paint is the hammer's: the two dangerous things in this row
  // were painted out of the same tin. It has chipped — the mask is clear where
  // a flake has come away, and the seat under it shows through.
  disc(
    'ring',
    guardSpec.ring,
    `background:${signals.hammerHazard};${masked('var(--chipTex)')}` +
      `-webkit-mask-position:${guardSpec.chips.at};mask-position:${guardSpec.chips.at};`,
  );
  disc('well', guardSpec.well, `background:${signals.apartWell};box-shadow:${signals.apartWellShadow};`);
  // Rust, over the seat and the paint alike: it does not care which of them
  // it is on. Under the dome, which is plastic.
  laid(
    seat,
    'rust',
    '--rustTex',
    guardSpec.rust.layers,
    `border-radius:${guardSpec.seat.radius}px;` +
      `opacity:calc(${guardSpec.rust.base} + var(--weather, 0) * ${guardSpec.rust.weather});`,
  );
  const dome = disc('button', guardSpec.button.size, '');
  // Plastic marks. The board's own scratches, over the dome and turning with
  // it when it is pressed in.
  laid(
    dome,
    'scuff',
    '--scratchTex',
    guardSpec.scuff.layers,
    `border-radius:50%;opacity:${guardSpec.scuff.opacity};`,
  );

  // The cover: the size of the seat, hinged along its top edge. `perspective`
  // is in the transform itself rather than on a parent so the one property
  // says the whole swing, and the vanishing point is the hinge.
  //
  // `will-change` says out loud something this cover was already doing by
  // accident, and it is worth more than it looks. A thing with a 3D transform
  // gets a compositor layer of its own, and so, in turn, does nearly everything
  // painted after it: every plate's grain, its scratches, its rust, its flash.
  // That is a hundred layers and it is the right number. A strike's flash, a
  // station's flare, a plate going dark are then each one texture's opacity,
  // and a knob turning repaints a strip of controls rather than the plate under
  // them. Collapsing them was tried and measured: fewer layers, and every one
  // of those effects became the plate drawn again — a third of the frame rate
  // gone with MEGADRIFT up. So the cover keeps the layer, on every device, and
  // not only where a browser happens to promote a turned-flat rectangle.
  const cover = box(
    'cover',
    `${stretched()}transform-origin:50% 0;border-radius:${guardSpec.cover.radius}px;` +
      `background:${signals.apartCover};box-shadow:${signals.apartCoverFrame};will-change:transform;`,
    seat,
  );
  /** Something laid over the whole cover, turning with it. None takes a pointer. */
  const onCover = (part: string, style: string): HTMLElement =>
    box(
      part,
      `${stretched()}border-radius:${guardSpec.cover.radius}px;pointer-events:none;${style}`,
      cover,
    );
  laid(
    cover,
    'scuff',
    '--scratchTex',
    guardSpec.coverScuff.layers,
    `border-radius:${guardSpec.cover.radius}px;opacity:${guardSpec.coverScuff.opacity};`,
  );
  laid(
    cover,
    'rust',
    '--rustTex',
    guardSpec.coverRust.layers,
    `border-radius:${guardSpec.cover.radius}px;${masked(placement.box)}` +
      `opacity:${guardSpec.coverRust.opacity};`,
  );
  // Something hit it once. Drawn from the point it was hit at — see
  // `crackField` in ../tokens/damage.
  onCover(
    'cracks',
    `background-image:var(--crackTex);background-size:100% 100%;background-repeat:no-repeat;` +
      `opacity:${guardSpec.cracks.opacity};`,
  );
  box(
    'tab',
    `position:absolute;left:50%;bottom:${-guardSpec.tab.height / 2}px;translate:-50% 0;` +
      `width:${guardSpec.tab.width}px;height:${guardSpec.tab.height}px;` +
      `border-radius:2px;background:${signals.apartHinge};`,
    cover,
  );
  // The barrel, after the cover so it is in front of the edge that turns in it.
  box(
    'hinge',
    `position:absolute;left:0;right:0;top:${-guardSpec.hinge / 2}px;height:${guardSpec.hinge}px;` +
      `border-radius:${guardSpec.hinge / 2}px;background:${signals.apartHinge};pointer-events:none;`,
    seat,
  );
  const apartLabel = box(
    'tape',
    `width:100%;box-sizing:border-box;text-align:center;white-space:nowrap;` +
      `background:${ink.tape};${GRUBBY}color:${ink.tapeInk};font-family:${fonts.tape};` +
      `font-size:${guardSpec.fontSize}px;padding:${guardSpec.padding};` +
      `box-shadow:${ink.buttonShadow};`,
    apart,
  );
  apartLabel.textContent = CONTROLS.apart.label;

  const scrub = scrapTape('scrub', BOARD.scrub);
  scrub.textContent = CONTROLS.scrub.label;

  // Two lines of instruction stood at the far end of this row — that sources
  // feed the chain, that a wire is dragged from OUT to IN. They are said by the
  // sockets themselves now, on hover (gt#110): see JACK_TIPS in ./words.

  // -------------------------------------------------------------- the sources

  const src = box(
    'src',
    `grid-area:src;position:relative;display:grid;grid-template-areas:${BOARD.src.areas};` +
      `grid-template-columns:${BOARD.src.columns};grid-template-rows:${BOARD.src.rows};` +
      `gap:${BOARD.src.gap}px;min-width:0;`,
    element,
  );

  /** A source well: cut into the sub-grid rather than into the plate itself. */
  function sourceWell(zone: SourceZone, style: string): HTMLElement {
    return well(zone, BOARD.src.area[zone], src, style);
  }

  const pulse = sourceWell(
    'pulse',
    `display:flex;flex-direction:column;gap:${BOARD.well.gap}px;justify-content:flex-start;`,
  );
  // Two plates since gt#42, so the well needs the gap THE PULSE has always had —
  // a column of one had nothing to be spaced from and the omission never showed.
  const voice = sourceWell(
    'voice',
    `display:flex;flex-direction:column;gap:${BOARD.well.gap}px;justify-content:flex-start;`,
  );
  const junk = sourceWell(
    'junk',
    `display:grid;grid-template-columns:${BOARD.junk.columns};grid-template-rows:${BOARD.junk.rows};` +
      `gap:${BOARD.junk.gap}px;`,
  );
  const foundation = sourceWell(
    'foundation',
    `display:grid;grid-template-columns:${BOARD.foundation.columns};gap:${BOARD.foundation.gap}px;`,
  );

  // A scrap of tape with a mark on it was stuck in the corner of this well,
  // and since gt#113 across the corner of SAXOPHONE's plate. Thomas had it off
  // (gt#117).

  // THE FOUNDATION is bolted down and the rivets say so — it is the one well
  // holding the two modules that are never off.
  box(
    'rivets',
    `position:absolute;top:0;left:0;right:0;height:${BOARD.foundation.rivetHeight}px;` +
      `background:${plate.rivetStrip};`,
    foundation,
  );

  // And what is bolted, weeps. The runs hang from the rivet strip because that
  // is the one seam on the board someone actually drilled — rust needs a place
  // it came *from*, or it is weather rather than damage (gt#35). Weather-driven
  // with nothing at the base: a new board is dirty, not yet failing.
  //
  // It is the only run layer left on the board, and it paints over the two
  // plates rather than behind them — see BOARD.foundation.runZIndex for why
  // that is both the legible choice and the true one.
  box(
    'runs',
    `position:absolute;top:${BOARD.foundation.rivetHeight}px;left:0;right:0;bottom:0;` +
      `z-index:${BOARD.foundation.runZIndex};background-image:var(--runTex);` +
      `background-size:${skirt.runSize};` +
      `background-repeat:repeat-x;background-position:top;` +
      `opacity:calc(var(--weather, 0) * ${skirt.runWeather});pointer-events:none;`,
    foundation,
  );

  /**
   * A socket was pressed. Before the wire layer hears of it the plate is put
   * back where it is bolted and marked as having a cable in a hand, so the
   * rect a drag keeps is never one taken mid-jolt (gt#115). See `quake`.
   */
  const jackDown = (id: SourceId | ModifierId, event: PointerEvent): void => {
    patching = true;
    settleQuake();
    spec.onJackDown?.(id, event);
  };

  const seats: Record<SourceZone, HTMLElement> = { pulse, voice, junk, foundation };
  const modules = new Map<SourceId, ModuleHandle>();

  for (const zone of Object.keys(seats) as SourceZone[]) {
    for (const def of zoneDefs(zone)) {
      const handle = createModule({
        def,
        state: state.m[def.id],
        woke: state.woke,
        booted: !spec.cold,
        ...(spec.wear ? { wear: spec.wear } : {}),
        onToggle: (id, on) => spec.onToggle?.(id, on),
        onPress: (id) => spec.onPress?.(id),
        onInput: (id, param, value) => spec.onInput?.(id, param, value),
        onCommit: (key) => spec.onCommit?.(key),
        onJackDown: (id, event) => jackDown(id, event),
      });
      modules.set(def.id, handle);
      // A wide plate lies across every column of its well (gt#75). Said by the
      // definition and applied here, because where a plate sits is the board's
      // and what a plate *is* is the module's — the component builds the same
      // plate either way and never learns how many cells it was given.
      if (def.wide) handle.element.style.gridColumn = BOARD.junk.wide;
      seats[zone].appendChild(handle.element);
    }
  }

  // ---------------------------------------------------------------- THE CHAIN

  // A rack rather than a column since gt#48: the boxes run left to right along the
  // bottom of the plate, and forward is rightward. See BOARD.areas for why the
  // column had to go and CHAIN for how many the rack holds.
  //
  // There was a footnote over this row — that an unplugged thing goes straight
  // to the speakers — and a socket says it on hover now (gt#110). The only
  // children here are the boxes, and the wrap
  // is a safety net rather than a layout: boxes have no business wrapping, and
  // CHAIN.capacity is the promise that they never need to. Wrapping is simply a
  // better failure than overflowing the plate if that promise is ever broken —
  // and the suite holds MODIFIER_IDS to it so it is not.
  const chain = well(
    'chain',
    'chain',
    element,
    // `stretch`, not `flex-start` (gt#90): the boxes are cut to two heights — a
    // lever or a fader stands ten pixels taller than a knob — and packed to the
    // top their bottom edges stepped up and down along the row. Stretched, the
    // rack has one bottom edge, and each box seats its control on it.
    `display:flex;flex-direction:row;flex-wrap:wrap;align-items:stretch;` +
      `gap:${BOARD.well.gap}px;justify-content:flex-start;min-width:0;`,
  );

  const modifiers = new Map<ModifierId, ModifierHandle>();
  for (const def of modifierDefs()) {
    const handle = createModifier({
      def,
      state: state.mods[def.id],
      ...(spec.wear ? { wear: spec.wear } : {}),
      onPress: (id) => spec.onModifierPress?.(id),
      onInput: (id, value) => spec.onModifierInput?.(id, value),
      onCommit: (key) => spec.onCommit?.(key),
      onJackDown: (id, event) => jackDown(id, event),
    });
    modifiers.set(def.id, handle);
    chain.appendChild(handle.element);
  }

  // The bottom corner of the plate held three scraps of tape — SCRUB THE ALTAR,
  // STILLNESS and COME APART. All three are in the top row since gt#112, and
  // there is nothing here.

  // ------------------------------------------------- told where it is read
  //
  // Three numbers reach parts all over the plate: the hammer's flash, which
  // every lamp reads; the travel it gives every control; and the weather, which
  // every rusted thing reads. Each was once one write on the plate, inherited
  // by whatever wanted it — which is tidy, and is also the most expensive write
  // there is. A custom property set on an ancestor makes the browser work every
  // node under it out again, two thousand of them, and every one that paints a
  // texture through a variable is then painted again as well: measured, one
  // such write redrew all hundred-odd layers of the board. The hammer made
  // three in a third of a second and the weather one every five seconds, for
  // as long as the page was open.
  //
  // So each is written on the parts that read it and nowhere above them. The
  // lists are made once, on first use: what reads these is fixed when the plate
  // is built.
  let lampParts: HTMLElement[] | null = null;
  let controlParts: HTMLElement[] | null = null;
  let weatheredParts: HTMLElement[] | null = null;
  /** Every lamp on a plate or a box: what reads the hammer's flash. */
  const lamps = (): HTMLElement[] =>
    (lampParts ??= [...element.querySelectorAll<HTMLElement>('[data-part="lamp"]')]);
  /** Every control: what reads the travel. */
  const movers = (): HTMLElement[] =>
    (controlParts ??= [...element.querySelectorAll<HTMLElement>('[data-control]')]);
  /** Everything whose own style reads the weather. */
  const weathered = (): HTMLElement[] =>
    (weatheredParts ??= [...element.querySelectorAll<HTMLElement>('[style]')].filter((node) =>
      (node.getAttribute('style') ?? '').includes(`var(${WEATHER_VAR}`),
    ));
  /** One variable, on each part that reads it — or, given nothing, off each of them. */
  const tell = (parts: readonly HTMLElement[], name: string, value: string | null): void => {
    for (const node of parts) {
      if (value === null) node.style.removeProperty(name);
      else node.style.setProperty(name, value);
    }
  };

  /** Held down or up: how a latching tape is drawn. STILLNESS is the one there is. */
  function drawLatch(tape: HTMLElement, held: number, up: number, on: boolean): void {
    tape.style.opacity = String(on ? held : up);
    tape.style.boxShadow = on ? ink.buttonPressedShadow : ink.buttonShadow;
  }

  /** Whether COME APART's cover is lifted. The board's own, and not stored. */
  let lidUp = false;
  /** Whether the caller last said the board is armed. Drawn, never decided, here. */
  let armed = false;

  /**
   * Put the cover where it is. `swing` is whether to be seen getting there: a
   * hand lifting or dropping it is, and a board being told its state is not.
   *
   * A cover swinging is motion, so a stilled board never swings one — it
   * changes state between two frames. The `stilled` flag is declared below
   * and read here only when this runs, which is always after.
   */
  function drawLid(swing: boolean): void {
    const { cover: lid } = BOARD.apart;
    cover.style.transition = swing && !stilled ? `transform ${lid.ms}ms ${TRAVEL.slide}` : 'none';
    cover.style.transform = `perspective(${lid.perspective}px) rotateX(${lidUp ? lid.openDeg : 0}deg)`;
    apart.dataset.lid = lidUp ? 'up' : 'down';
  }

  /** The dome: up and dark, or down and lit. */
  function drawDome(): void {
    const glow = stilled ? 'none' : `box-shadow ${BOARD.apart.glowMs}ms ease, scale ${BOARD.apart.glowMs}ms ease`;
    dome.style.transition = glow;
    dome.style.background = armed ? signals.apartDomeLit : signals.apartDome;
    dome.style.boxShadow = armed ? signals.apartDomeGlow : signals.apartDomeShadow;
    dome.style.setProperty('scale', armed ? String(BOARD.apart.button.pressed) : '1');
  }

  /**
   * COME APART as the caller says it is. The dome is drawn to it, and an armed
   * board has its cover up — a button cannot be down under a closed guard, so
   * a board that opens armed opens with the guard already lifted. It is put
   * there rather than swung there: nobody lifted it.
   */
  function drawApart(on: boolean): void {
    armed = on;
    if (on && !lidUp) {
      lidUp = true;
      drawLid(false);
    }
    drawDome();
  }

  // The stations (gt#104, gt#106): each source's mark on the seal again, alone and
  // in that source's colour, laid exactly on the cut one inside the etch layer
  // — so it is the groove that glows, under whatever the groove is under. See
  // BOARD.stations for why it is this and not light, and `stationTile` in
  // ../tokens/sigils for how the two are made to wear alike.
  const stationArt = SOURCE_IDS.map((id, i) =>
    stationTile(
      sealSpec,
      i,
      // The colour the module already bleeds behind its plate, as a lamp.
      glare(sourcePlates[id].tint),
      BOARD.stations.weight,
      BOARD.stations.halo,
    ),
  );
  /** Every glowing mark on the board, by source: the plate's own, and one on each plate it crosses. */
  const stations = new Map<string, HTMLElement[]>();
  /** The ones on module plates and boxes, which are remade whenever the seals are seated. */
  const plateStations: HTMLElement[] = [];
  /** Which modules the power has reached, or `null` for all of them. See `setBooted`. */
  let reached: ReadonlySet<string> | null = spec.cold ? new Set() : null;
  /** The flashes still settling, by source, so a second hit or STILLNESS can take one back. */
  const stationTimers = new Map<string, number>();

  /** Where a station rests: lit while its module is in the sound, on the lamp's own terms. */
  const stationRest = (id: string): string => {
    const on = state.m[id as SourceId]?.on === true && (reached === null || reached.has(id));
    return on ? String(BOARD.stations.on) : '0';
  };

  /** One station's mark, laid in one seal at the place it is cut. */
  function lay(id: string, art: StationArt, seal: HTMLElement): HTMLElement {
    const mark = box(
      'station',
      `position:absolute;left:${art.x}px;top:${art.y}px;width:${art.size}px;height:${art.size}px;` +
        `background-image:${art.image};background-size:100% 100%;background-repeat:no-repeat;` +
        `opacity:${stationRest(id)};transition:opacity ${BOARD.stations.fade};`,
      seal,
    );
    mark.dataset.source = id;
    const list = stations.get(id) ?? [];
    list.push(mark);
    stations.set(id, list);
    return mark;
  }
  // The board's own plate carries all of them: every station is on it.
  SOURCE_IDS.forEach((id, i) => {
    const art = stationArt[i];
    if (art) lay(id, art, boardSeal);
  });

  // The same seal, cut into every plate and box that sits on the board (gt#105).
  // Each of them left an empty etch layer as the first thing on its own metal;
  // this fills it with the one tile, and `seatEtch` below slides it to where
  // the board's own seal is, so the ring runs off the edge of a plate, across
  // the well and onto the next one as a single cut.
  //
  // Hidden until it has been seated. An unseated one would show the seal's top
  // left corner in the top left corner of every plate, eighteen times.
  const plateSeals: HTMLElement[] = [];
  for (const host of element.querySelectorAll<HTMLElement>('[data-part="etch"]')) {
    if (host.parentElement === element) continue;
    plateSeals.push(box('seal', `${sealPaint}left:0;top:0;display:none;`, host));
  }

  /**
   * Line every plate's seal up with the board's, given the board's own rect.
   *
   * Measured, because where a plate sits is a matter of layout: the wells are a
   * grid and the lettering sets their heights. But measured only when the
   * *plate* is — when the board is mounted and when the faces land — and never
   * on a resize, which is the rule `measureNatural` already keeps and for the
   * same reason: a resize changes the window, not the board.
   *
   * That works because of how the spare height is spent. The rows are cut to
   * their contents and whatever the window leaves over is bare plate, half
   * above and half below ({@link BOARD.slack} is `center`). So a taller window
   * moves the board's top edge away from every plate and its *centre* away
   * from none of them — and the seal is hung from the centre. Where a plate is
   * from there is a fact about the board, true at every window size, and true
   * with the plate's `min-height` lifted too, which is when this is called.
   *
   * Everything is read as rects and divided by the factor the board is drawn
   * at, which is taken off the board's own rect the way the wire layer takes it
   * (gt#22). A board that is not laid out measures nothing and is left alone.
   */
  function seatEtch(rect: DOMRect): void {
    const fit = rect.width / BOARD.width;
    if (!(fit > 0)) return;
    const half = BOARD.seal.size / 2;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // The marks that glow on plates are remade with the seating (gt#106): which
    // plate a station falls on is the same question as where the plate is.
    for (const mark of plateStations) {
      mark.remove();
      const list = stations.get(mark.dataset.source ?? '');
      if (list) list.splice(list.indexOf(mark), 1);
    }
    plateStations.length = 0;

    for (const seal of plateSeals) {
      const host = seal.parentElement?.getBoundingClientRect();
      if (!host) continue;
      const left = (cx - host.left) / fit - half;
      const top = (cy - host.top) / fit - half;
      seal.style.left = `${left.toFixed(2)}px`;
      seal.style.top = `${top.toFixed(2)}px`;
      seal.style.display = '';

      // A station is made on a plate only if some of it is on that plate.
      // Eleven marks on nineteen surfaces is two hundred elements, and all but
      // a couple of dozen of them would be clipped away entirely.
      const wide = host.width / fit;
      const tall = host.height / fit;
      SOURCE_IDS.forEach((id, i) => {
        const art = stationArt[i];
        if (!art || !art.size) return;
        const x = left + art.x;
        const y = top + art.y;
        if (x >= wide || y >= tall || x + art.size <= 0 || y + art.size <= 0) return;
        plateStations.push(lay(id, art, seal));
      });
    }
  }

  // The emblem (gt#102): the part of the symbology that is cast on the board
  // rather than cut into it. Laid last, over the plate and every module and
  // box on it, plainly — see BOARD.emblem for why a shadow needs no blend.
  // Nothing in it takes a pointer, so every control under it is still reached.
  // Clipped to the plate: the figure in it swells, and a shadow does not fall
  // off the edge of the thing it is cast on.
  const emblem = box(
    'emblem',
    `${stretched()}pointer-events:none;z-index:${BOARD.emblem.zIndex};overflow:hidden;`,
    element,
  );

  /** Every station to where it rests, except one in the middle of a flash. */
  function drawStations(): void {
    for (const [id, marks] of stations) {
      if (stationTimers.has(id)) continue;
      const rest = stationRest(id);
      // Asked on every redraw of the board, and almost never with a new answer.
      for (const mark of marks) if (mark.style.opacity !== rest) mark.style.opacity = rest;
    }
  }

  /** Every station to rest, now, flashes included. */
  function settleStations(): void {
    for (const timer of stationTimers.values()) clearTimeout(timer);
    stationTimers.clear();
    for (const [id, marks] of stations) {
      const rest = stationRest(id);
      for (const mark of marks) {
        mark.style.transition = `opacity ${BOARD.stations.fade}`;
        mark.style.opacity = rest;
      }
    }
  }

  /**
   * One station thrown bright and let go — every piece of it, on whichever
   * plates it crosses. Up at once, released on the next turn of the loop: a
   * transition written in the tick that sets the value it starts from never
   * runs. It comes back to wherever it rests *then*, so a module switched off
   * mid-flash goes dark rather than back to lit.
   */
  function flare(id: string, peak: number, strength = 1): void {
    const marks = stations.get(id);
    if (!marks || stilled) return;
    const had = stationTimers.get(id);
    if (had) clearTimeout(had);
    const rest = Number(stationRest(id));
    const reach = Math.min(1, Math.max(0, strength));
    const thrown = String(Number((rest + (peak - rest) * reach).toFixed(3)));
    for (const mark of marks) {
      mark.style.transition = 'none';
      mark.style.opacity = thrown;
    }
    stationTimers.set(
      id,
      window.setTimeout(() => {
        stationTimers.delete(id);
        const back = stationRest(id);
        // Asked for again: the plates may have been seated since the blow.
        for (const mark of stations.get(id) ?? []) {
          mark.style.transition = `opacity ${BOARD.stations.ms}ms ease-out`;
          mark.style.opacity = back;
        }
      }, 0),
    );
  }

  // ------------------------------------------------------------------- the swing

  /** Whether the hammer is in the air. One press is one hit, so a second is ignored. */
  let falling = false;
  /** Whether the board is pinned. The swing is the one thing here STILLNESS stops. */
  let stilled = false;
  /** Every timer the swing owns, so STILLNESS and `destroy` can take them all back. */
  let impactTimer = 0;
  let dustTimer = 0;
  let flashTimer = 0;
  let travelTimer = 0;
  let sparkTimer = 0;
  /** How many blows have landed on this page. Which spray the next one throws. */
  let blows = 0;
  /** The steps of the jolt still to come. See {@link quake}. */
  const quakeTimers = new Set<number>();
  /** Whether a cable is in a hand: a socket was pressed and the pointer is still down. */
  let patching = false;

  /** The plate flashes still to come off the last blow (gt#92). */
  const rippleTimers = new Set<number>();
  /** When the plates last flashed for a blow. See {@link SMASH.shock}. */
  let rippledAt = -Infinity;

  function clearSwing(): void {
    for (const timer of [impactTimer, dustTimer, flashTimer, travelTimer, sparkTimer, ...rippleTimers]) {
      if (timer) clearTimeout(timer);
    }
    impactTimer = 0;
    dustTimer = 0;
    flashTimer = 0;
    travelTimer = 0;
    sparkTimer = 0;
    rippleTimers.clear();
    settleQuake();
  }

  /** The plate back where it is bolted, now, and every step still to come dropped. */
  function settleQuake(): void {
    for (const timer of quakeTimers) clearTimeout(timer);
    quakeTimers.clear();
    element.style.removeProperty('translate');
  }

  /**
   * The jolt (gt#115): the whole plate knocked down and rattling back, on the
   * blow and on nothing else.
   *
   * This is the one place the plate is ever moved, and the rule it is an
   * exception to is in ./atmosphere: the wire layer reads the plate's rect at
   * the start of a drag and keeps it, so a plate that has moved since puts the
   * cable off the cursor for as long as the drag lasts. Three things make this
   * safe where the room's shake would not be:
   *
   * - It is the hammer's alone. One click, a quarter of a second, and still
   *   again — not something that runs whenever the board is loud.
   * - A cable in a hand stops it. `patching` is set the moment a socket is
   *   pressed, before the press is forwarded and so before the wire layer has
   *   read anything, and the plate is put back in that same tick. The rect the
   *   drag keeps is always the resting one.
   * - And it is not started while one is. A blow that lands mid-drag does
   *   everything else a blow does.
   *
   * Everything measured *during* it is still right: the cables are children of
   * the plate and move with it, and a jack's place is read against the plate's
   * own rect in the same breath, so the two have moved by the same amount.
   *
   * The first step waits for the end of the tick like the rest, so whatever
   * the caller reads off the plate on being told of the blow — the anvil, for
   * the ring — it reads at rest.
   */
  function quake(): void {
    settleQuake();
    if (stilled || patching) return;
    const { path, stepMs } = SMASH.quake;
    path.forEach(([x, y], i) => {
      const timer = window.setTimeout(() => {
        quakeTimers.delete(timer);
        element.style.setProperty('translate', `${x}px ${y}px`);
      }, i * stepMs);
      quakeTimers.add(timer);
    });
    const rest = window.setTimeout(() => {
      quakeTimers.delete(rest);
      element.style.removeProperty('translate');
    }, path.length * stepMs);
    quakeTimers.add(rest);
  }

  /**
   * The sparks (gt#115): thrown off both ends of the struck line, out and up,
   * and falling.
   *
   * Which sparks is `sparkSpray` in ../tokens/impact — a seeded table, and a
   * different one on each of the next few blows. How they move is here. A
   * spark is two elements: the outer is carried outward and slows, on an
   * ease-out; the inner is dropped to where it will end up on a curve that
   * *overshoots backward first*, which is the whole arc — it goes up before it
   * comes down, by as much as its `kick`. Both are `translate` transitions,
   * so a blow costs one style write per spark and nothing per frame.
   */
  function throwSparks(): void {
    if (sparkTimer) clearTimeout(sparkTimer);
    const spray = sparkSpray(blows);
    const edge = SMASH.ram.die.width / 2;
    embers.forEach(({ fly, ember }, i) => {
      const spark = spray[i];
      if (!spark) return;
      fly.style.transition = 'none';
      fly.style.opacity = '1';
      fly.style.setProperty('translate', `${(spark.side * edge).toFixed(1)}px 0`);
      ember.style.transition = 'none';
      ember.style.height = `${spark.length.toFixed(1)}px`;
      ember.style.setProperty('rotate', `${spark.lean.toFixed(1)}deg`);
      ember.style.setProperty('translate', '0 0');
    });
    sparkTimer = window.setTimeout(() => {
      sparkTimer = 0;
      embers.forEach(({ fly, ember }, i) => {
        const spark = spray[i];
        if (!spark) return;
        fly.style.transition =
          `translate ${spark.ms}ms cubic-bezier(0.1,0.6,0.3,1), ` +
          `opacity ${spark.ms}ms cubic-bezier(0.6,0,1,0.6)`;
        fly.style.opacity = '0';
        fly.style.setProperty('translate', `${(spark.side * (edge + spark.reach)).toFixed(1)}px 0`);
        ember.style.transition = `translate ${spark.ms}ms cubic-bezier(0.2,${(-spark.kick).toFixed(2)},0.6,1)`;
        ember.style.setProperty('translate', `0 ${spark.fall.toFixed(1)}px`);
      });
      glint.style.transition = `opacity ${SMASH.flare.ms}ms ease-out`;
      glint.style.opacity = '0';
    }, 0);
    glint.style.transition = 'none';
    glint.style.opacity = '1';
  }

  /**
   * The blow crossing the board (gt#92): every plate flashes as the shockwave's
   * front reaches it. The ring itself is ./blooms's, hung off the page; this is
   * the half that belongs to the plates, timed off the same arithmetic so the
   * two agree on where the front is without either knowing about the other.
   *
   * Read once, at contact: one rect for the anvil and one per plate. That is
   * twelve reads on the one gesture in the product that happens a few times a
   * minute, and none of them moves anything — a flash is an overlay's opacity.
   *
   * Held under {@link SMASH.shock.minGapMs}, which is the hammer's own
   * photosensitive limit. A blow inside the gap does everything else it does.
   */
  function ripple(): void {
    const now = Date.now();
    if (now - rippledAt < SMASH.shock.minGapMs) return;
    rippledAt = now;

    const hit = anvil.getBoundingClientRect();
    const x = hit.left + hit.width / 2;
    const y = hit.top + hit.height / 2;
    const radius = shockRadius(x, y, window.innerWidth, window.innerHeight);
    // The whole ring answers the hammer (gt#104), lit stations and dark ones
    // alike, at contact: the seal is one thing and it has just been hit. Under
    // the same gap as the plates, a few lines up.
    for (const id of stations.keys()) flare(id, BOARD.stations.smash);
    for (const handle of modules.values()) {
      const rect = handle.element.getBoundingClientRect();
      const distance = Math.hypot(rect.left + rect.width / 2 - x, rect.top + rect.height / 2 - y);
      const timer = window.setTimeout(() => {
        rippleTimers.delete(timer);
        handle.flash(shockStrength(distance, radius));
      }, shockDelay(distance, radius));
      rippleTimers.add(timer);
    }
  }

  /**
   * The puff off the struck point, and the one thing here that needs two turns of
   * the loop. A transition set in the same tick as the value it is meant to start
   * from never runs — the browser resolves one style rather than two — so the
   * release is scheduled rather than written straight after the start.
   */
  function puff(): void {
    if (dustTimer) clearTimeout(dustTimer);
    dust.style.transition = 'none';
    dust.style.opacity = '1';
    dust.style.setProperty('scale', String(SMASH.dustStart));
    dustTimer = window.setTimeout(() => {
      dustTimer = 0;
      dust.style.transition = `opacity ${SMASH.dustMs}ms ease-out, scale ${SMASH.dustMs}ms ease-out`;
      dust.style.opacity = '0';
      dust.style.setProperty('scale', String(SMASH.dustSpread));
    }, 0);
  }

  /**
   * Contact. Everything that happens at the bottom of the swing happens here, in
   * one tick: the hammer starts back up, the dust comes off the plate, every lit
   * lamp is overdriven, and the caller is told — which is where the new board
   * comes from. The room's own jolt is the seam's, off the same callback.
   */
  function land(): void {
    falling = false;
    impactTimer = 0;
    if (!stilled) {
      // The lift is much slower than the fall. A hammer drops under gravity and
      // is hauled back up its columns; equal times read as a wiper blade.
      hammer.style.transition = `translate ${SMASH.recoverMs}ms ease-in-out`;
      hammer.style.setProperty('translate', `0 ${-SMASH.lift}px`);
      puff();
      throwSparks();
      ripple();
      quake();
      tell(lamps(), SMASH_VAR, String(SMASH.flash));
      flashTimer = window.setTimeout(() => {
        flashTimer = 0;
        // Removed rather than set back to 1: the lamps read this with a fallback,
        // so the absence of the variable is already the resting value said once.
        tell(lamps(), SMASH_VAR, null);
      }, SMASH.flashMs);
      // And the board is knocked rather than replaced (gt#80). Set before the
      // caller is told, so the values it is about to push arrive under it; taken
      // off again once everything has had time to get there. On a stilled board
      // this whole block is skipped and the blow lands as a cut, which is that
      // switch doing its job: it stops things moving and changes nothing else.
      if (travelTimer) clearTimeout(travelTimer);
      tell(movers(), TRAVEL_VAR, `${SMASH.travelMs}ms`);
      travelTimer = window.setTimeout(() => {
        travelTimer = 0;
        tell(movers(), TRAVEL_VAR, null);
      }, SMASH.travelMs);
    }
    blows += 1;
    spec.onSmash?.();
  }

  function swing(): void {
    if (falling) return;
    // Nothing moves on a stilled board, so there is nothing to wait for: the hit
    // is now. The board changes exactly as much as it always did.
    if (stilled) {
      land();
      return;
    }
    falling = true;
    // Accelerating into the plate rather than easing out of the fall — a hammer
    // is not decelerating when it arrives.
    hammer.style.transition = `translate ${SMASH.swingMs}ms cubic-bezier(0.45,0,1,1)`;
    hammer.style.setProperty('translate', `0 ${SMASH.bite}px`);
    impactTimer = window.setTimeout(land, SMASH.swingMs);
  }

  // ------------------------------------------------------------------- the beat

  /** Whether a beat has ever fallen. Before the lever there is no pulse to show. */
  let beating = false;
  let beatTimer = 0;

  const lightBeat = (): void => {
    beatLamp.style.background = signals.lampOn;
    beatLamp.style.boxShadow = signals.lampGlowOn;
  };

  /**
   * One beat: lit at once, held, let go. The same two-turn shape the dust puff
   * needs and for the same reason — a transition written in the tick that sets
   * the value it starts from never runs.
   *
   * Stilled, the lamp is lit and stays lit. A light flashing on a clock is
   * exactly the motion that switch exists for, and a lamp gone *dark* would
   * read as the pulse having stopped, which it has not: the board is still
   * counting, it has only stopped showing each count.
   */
  function drawBeat(): void {
    beating = true;
    if (beatTimer) clearTimeout(beatTimer);
    beatTimer = 0;
    beatLamp.style.transition = 'none';
    lightBeat();
    if (stilled) return;
    beatTimer = window.setTimeout(() => {
      beatTimer = 0;
      const fade = `${BOARD.fog.beat.fadeMs}ms ease-out`;
      beatLamp.style.transition = `background ${fade}, box-shadow ${fade}`;
      beatLamp.style.background = signals.lampOff;
      beatLamp.style.boxShadow = signals.lampGlowOff;
    }, BOARD.fog.beat.holdMs);
  }

  function applyStill(on: boolean): void {
    stilled = on;
    // A flash is motion and stops; a lit station is state and stays lit.
    if (on) settleStations();
    drawLatch(still, BOARD.still.onOpacity, BOARD.still.opacity, on);
    // A cover in mid-swing is motion: it is where it was going, now (gt#112).
    if (on) {
      cover.style.transition = 'none';
      dome.style.transition = 'none';
    }
    // The beat lamp, on its own terms and before the swing's: pinned lit if the
    // board is pulsing, and left to the next beat to start flashing again when
    // the switch comes back up.
    if (on && beating) {
      if (beatTimer) clearTimeout(beatTimer);
      beatTimer = 0;
      beatLamp.style.transition = 'none';
      lightBeat();
    }
    if (!on) return;
    // A swing already in the air lands, and lands now. What this switch stops is
    // the picture; the re-roll the user has already asked for is the sound, and
    // dropping it here would be STILLNESS reaching the one place it may not.
    const pending = falling;
    clearSwing();
    if (pending) land();
    hammer.style.transition = '';
    hammer.style.setProperty('translate', `0 ${-SMASH.lift}px`);
    dust.style.transition = '';
    dust.style.opacity = '0';
    glint.style.transition = '';
    glint.style.opacity = '0';
    for (const { fly } of embers) {
      fly.style.transition = '';
      fly.style.opacity = '0';
    }
    tell(lamps(), SMASH_VAR, null);
    tell(movers(), TRAVEL_VAR, null);
  }

  /** Every mark the hammer has left, drawn from a count and a fixed table. */
  function drawDents(count: number): void {
    const wanted = Math.max(0, Math.min(SMASH.maxDents, Math.floor(count)));
    while (dents.childElementCount > wanted) dents.lastElementChild?.remove();
    while (dents.childElementCount < wanted) {
      const at = SMASH.dents[dents.childElementCount] ?? [0, 0];
      box(
        'dent',
        `position:absolute;left:calc(50% + ${((at[0] ?? 0) * SMASH.anvil.width).toFixed(2)}px);` +
          `top:calc(50% + ${((at[1] ?? 0) * SMASH.anvil.height).toFixed(2)}px);` +
          `width:${SMASH.dentSize}px;height:${SMASH.dentSize}px;translate:-50% -50%;` +
          `background-image:${signals.dent};pointer-events:none;`,
        dents,
      );
    }
  }

  // ------------------------------------------------------------------ scaling

  /**
   * How tall the plate is in board pixels with nothing holding it open, or 0
   * while that has not been measured — before the plate is mounted, and in any
   * environment that lays nothing out.
   */
  let natural = 0;

  /**
   * Read the plate's own height off the plate (gt#71).
   *
   * No constant can say this. The stack is THE FOG, the sources and the rack,
   * and the sources' height is text metrics — a name's line box, a tape strip's,
   * a caption's — which no number in ./constants writes down and which change
   * the moment the typefaces land. `BOARD.height` tried: it said 867, the board
   * measured 918 in its fallbacks and 925 in its faces, and nothing anywhere
   * noticed (gt#62). So the plate is asked, the way the wire layer stopped trusting
   * `--fit` and asked the plate for its scale instead (gt#22).
   *
   * Two things make the reading honest. The `min-height` is lifted for the one
   * read, because it exists precisely to hold the plate open to the window and
   * would otherwise report the window back. And the answer is taken as the
   * rect's *aspect* against {@link BOARD.width}, not as its height: an aspect is
   * very nearly the same number whatever the plate is currently zoomed to, so
   * this never has to know the factor it is about to help decide.
   *
   * Very nearly, and the difference is a pixel or two of a plate nine hundred
   * tall — enough to matter, which is why `applyFit` checks the factor against
   * the plate it produces rather than taking this reading's word for it.
   */
  function measureNatural(): void {
    const held = element.style.minHeight;
    element.style.minHeight = '0';
    const rect = element.getBoundingClientRect();
    // While the plate is at its own height, and off the rect just read: see
    // `seatEtch` for why this is the one moment the seals need seating.
    seatEtch(rect);
    element.style.minHeight = held;
    natural = heightOf(rect);
  }

  /** A plate's rect as its height in board pixels, or 0 for one not laid out. */
  const heightOf = (rect: DOMRect): number =>
    rect.width > 0 ? (rect.height * BOARD.width) / rect.width : 0;

  /** The plate's own height again, at whatever it is zoomed to now. No seals moved. */
  function readNatural(): number {
    const held = element.style.minHeight;
    element.style.minHeight = '0';
    const rect = element.getBoundingClientRect();
    element.style.minHeight = held;
    return heightOf(rect);
  }

  // The whole board is one fixed-size design scaled to the window. `--fit` goes
  // on the document root because two rules here need it — the zoom itself and the
  // `min-height` that undoes it — and a variable is the only way to state it once.
  // Nothing measures through it: the wire layer reads the plate's own rect
  // instead, so no reader has to agree with this number to be right (gt#22).
  //
  // **The factor is checked against the plate it produces, and only ever moved
  // down.** The aspect was taken to be the same number whatever the plate is
  // zoomed to. It is not, quite: the rows are cut to their lettering, a line of
  // text lands on whole device pixels, and so the same plate measures a pixel
  // or two taller at one zoom than at another. A factor worked out from a
  // height read at the old zoom then drew a plate up to two and a half pixels
  // taller than the window — on about one height-limited window size in four,
  // in Chrome and in Firefox alike — and a page with one pixel to scroll gets
  // a scrollbar, which on Windows takes fifteen pixels of the board with it.
  //
  // So once the factor is on, the plate is read again *at* that factor. If it
  // now asks for less, it is given less and asked once more. It is never given
  // more on the way: a plate with a hair to spare is the layout working, and
  // following the reading back up is how two zooms that disagree about each
  // other would trade places forever.
  const applyFit = (): void => {
    let fit = fitFor(window.innerWidth, window.innerHeight, natural);
    document.body.style.setProperty('--fit', fitText(fit));
    for (let pass = 0; pass < FIT_PASSES; pass++) {
      const now = readNatural();
      if (!(now > 0)) break;
      natural = now;
      const next = fitFor(window.innerWidth, window.innerHeight, now);
      if (fitText(next) >= fitText(fit)) break;
      fit = next;
      document.body.style.setProperty('--fit', fitText(fit));
    }
    spec.onResize?.(fit);
  };
  applyFit();
  window.addEventListener('resize', applyFit);

  drawDents(spec.dents ?? 0);
  // The guard as a board nobody has armed has it: cover down, dome up and dark.
  // A caller with an armed board says so through `setApart`, which lifts it.
  drawLid(false);
  drawDome();

  const onSmashClick = (): void => swing();
  // A cable has been put down, or let go of wherever it was.
  const onPatchEnd = (): void => {
    patching = false;
  };
  window.addEventListener('pointerup', onPatchEnd);
  window.addEventListener('pointercancel', onPatchEnd);
  const onScrubClick = (): void => spec.onScrub?.();
  const onStillClick = (): void => spec.onStill?.();
  // The guard's two acts (gt#112). Down, any press on it lifts the cover and
  // nothing else. Up, a press on the cover drops it — letting an armed button
  // up as it goes, which is the caller's to do and is asked for the same way
  // a press on the button asks — and a press anywhere else is the button.
  const onApartClick = (event: MouseEvent): void => {
    if (!lidUp) {
      lidUp = true;
      drawLid(true);
      return;
    }
    if (event.target instanceof Node && cover.contains(event.target)) {
      lidUp = false;
      drawLid(true);
      if (armed) spec.onApart?.();
      return;
    }
    spec.onApart?.();
  };
  smash.addEventListener('click', onSmashClick);
  scrub.addEventListener('click', onScrubClick);
  still.addEventListener('click', onStillClick);
  apart.addEventListener('click', onApartClick);

  return {
    element,
    emblem,
    modules,
    modifiers,
    globals,
    zones,
    setState(next: BoardState, heard: BoardState = next): void {
      const wasWoke = state.woke;
      state = next;
      for (const [id, handle] of modules) handle.setState(next.m[id], heard.m[id]);
      for (const [id, handle] of modifiers) handle.setState(next.mods[id], heard.mods[id]);
      serious.setValue(next.g.seriousness);
      tuning.setValue(next.g.tuning);
      pace.setValue(next.g.pace);
      if (next.woke !== wasWoke) for (const handle of modules.values()) handle.setWoke(next.woke);
      drawStations();
    },
    setWoke(next: boolean): void {
      state = { ...state, woke: next };
      for (const handle of modules.values()) handle.setWoke(next);
    },
    setBooted(ids: ReadonlySet<string> | null): void {
      for (const [id, handle] of modules) handle.setBooted(ids === null || ids.has(id));
      reached = ids === null ? null : new Set(ids);
      drawStations();
    },
    strike(id: string, strength = 1): void {
      flare(id, BOARD.stations.flash, strength);
    },
    setWear(key: string, turns: number): void {
      // A wear key is `scope.param`, and the scope says which of the three kinds
      // of thing on the board owns it: `g`, a module id, or `mods`.
      const dot = key.indexOf('.');
      const scope = key.slice(0, dot);
      if (scope === GLOBAL_SCOPE) globals.get(key)?.setWear(turns);
      else if (scope === MODIFIER_SCOPE) modifiers.get(key.slice(dot + 1) as ModifierId)?.setWear(turns);
      else modules.get(scope as SourceId)?.setWear(key, turns);
    },
    setDents: drawDents,
    setWeather(weather: string): void {
      tell(weathered(), WEATHER_VAR, weather);
    },
    setStill: applyStill,
    setApart: drawApart,
    beat: drawBeat,
    refit(): void {
      measureNatural();
      applyFit();
    },
    destroy(): void {
      window.removeEventListener('resize', applyFit);
      clearSwing();
      for (const timer of stationTimers.values()) clearTimeout(timer);
      stationTimers.clear();
      if (beatTimer) clearTimeout(beatTimer);
      beatTimer = 0;
      smash.removeEventListener('click', onSmashClick);
      window.removeEventListener('pointerup', onPatchEnd);
      window.removeEventListener('pointercancel', onPatchEnd);
      scrub.removeEventListener('click', onScrubClick);
      still.removeEventListener('click', onStillClick);
      apart.removeEventListener('click', onApartClick);
      for (const handle of globals.values()) handle.destroy();
      for (const handle of modules.values()) handle.destroy();
      for (const handle of modifiers.values()) handle.destroy();
      globals.clear();
      modules.clear();
      modifiers.clear();
    },
  };
}
