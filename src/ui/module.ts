// One source module plate, rendered nine times from ./modules. The component
// knows nothing about which module it is beyond the definition it was handed and
// the skin that definition's id looks up, which is what makes a tenth module one
// entry in a list rather than a tenth block of code.
//
// It owns how a plate looks and what a hand touching it means. It owns no state:
// the board decides whether a module is on, keeps the values, and tells this
// component what to draw. Two consequences worth stating, because they are what
// keep the file this size:
//
// - **Every control is a `createControl`.** The character control, HOW LOUD and
//   HOW OFTEN differ only in the numbers ./constants cuts them to. A module is
//   two or three of those in a row, and nothing about turning one is written
//   here.
// - **The rust reads `var(--weather)` rather than a number.** The weathering
//   system sets one custom property on the page and all nine plates age; the
//   reference does the same, and it means no plate has to be told the time.
//
// The jack is built and tagged `data-jack-out` here, but wires are the wire
// layer's: this forwards a pointerdown on the socket and takes no view on what
// happens next.

import { BOARD, GAUGE, GRIME, MODULE, RUPTURE, SMASH_VAR, UNLIT } from './constants';
import { createControl } from './control';
import type { ControlHandle, ControlSpec, GaugeSpec } from './control';
import { bloomColor } from './blooms';
import { box, masked, stretched } from './dom';
import { BEZEL, scuffed, tarnished } from './grime';
import type { SourceDef } from './modules';
import { CONTROLS, OFTEN_WORDS } from './words';
import { SOURCE_IDS } from '../engine/constants';
import type { SourceId } from '../engine/constants';
import {
  fonts,
  ink,
  jack as jackTokens,
  markTile,
  marked,
  plate,
  seedOf,
  signals,
  sourcePlates,
  textureLayers,
  toggle as toggleTokens,
} from '../tokens';

/** The three things a module holds a value for, beside its power. */
export type ModuleParam = 'char' | 'loud' | 'often';

/** Everything the board knows about one module. Held there, drawn here. */
export interface ModuleState {
  readonly on: boolean;
  /** 0–1. */
  readonly loud: number;
  /** 0–1, or a mode index where the definition carries `charWords`. */
  readonly char: number;
  /** An index into HOW OFTEN. Ignored by drones. */
  readonly often: number;
}

export interface ModuleSpec {
  readonly def: SourceDef;
  readonly state: ModuleState;

  /**
   * The board has been woken. Until it has, an on module still shows its lamp
   * but bleeds no tint — the ambient glows arrive with the sound, not before.
   * Defaults to true, so a component built after the wake screen is correct
   * without being told.
   */
  readonly woke?: boolean;

  /**
   * Power has reached this plate (gt#88). False on a board that has been built
   * cold and is still coming up: the module is switched on — its nub says so —
   * and is drawn dark until its turn. Defaults to true, so a module built on
   * its own is lit when it is on, as it always was.
   */
  readonly booted?: boolean;

  /** Completed drags per `id.param`, for the wear halos. */
  readonly wear?: Readonly<Record<string, number>>;

  /** The power cluster was clicked. The board decides what `on` becomes next. */
  readonly onToggle?: (id: SourceId, on: boolean) => void;

  /**
   * A control was touched, before any value has moved. The board powers an off
   * module on here — no control on this board is ever dead.
   */
  readonly onPress?: (id: SourceId) => void;

  /** A control moved. */
  readonly onInput: (id: SourceId, param: ModuleParam, value: number) => void;

  /** A drag finished having actually moved, under its `scope.param` key. */
  readonly onCommit?: (key: string) => void;

  /** The OUT socket was pressed. Where a wire drag begins. */
  readonly onJackDown?: (id: SourceId, event: PointerEvent) => void;
}

export interface ModuleHandle {
  /** The plate. Nothing is mounted here — the board decides where it goes. */
  readonly element: HTMLElement;
  readonly id: SourceId;
  /** The OUT socket. The wire layer measures endpoints off this element. */
  readonly jack: HTMLElement;
  /** This module's controls, by `id.param`. */
  readonly controls: ReadonlyMap<string, ControlHandle>;
  /**
   * Draw a state the board decided on, without calling back into it. `heard` is
   * where the controls are drawn when that is not where they are set (gt#91) —
   * see `setValue` in ./control. Power, the lamp and the plate answer `state`.
   */
  setState(state: ModuleState, heard?: ModuleState): void;
  setWoke(woke: boolean): void;
  /** Power has reached this plate, or has not yet (gt#88). See {@link ModuleSpec.booted}. */
  setBooted(booted: boolean): void;
  setWear(key: string, turns: number): void;
  /**
   * This module struck (gt#81). The plate takes the hit: a wash of its own bloom
   * colour, up at once and gone in a quarter of a second, by `strength` 0–1.
   * Appearance only, and the caller's to withhold on a stilled board.
   */
  flash(strength?: number): void;
  /** Detach every listener, this plate's and its controls'. */
  destroy(): void;
}

/** Which corner each screw sits in, in the order their slot angles are given. */
const SCREW_CORNERS = [
  ['left', 'top'],
  ['right', 'top'],
  ['left', 'bottom'],
  ['right', 'bottom'],
] as const;

/**
 * How the one scratch tile is laid on a given plate (gt#89): where it starts, and
 * which way round it is.
 *
 * Every plate carries the same tile, and until gt#89 every plate carried it the
 * same way — so across eleven plates laid side by side the marks all ran along
 * one diagonal, and read as rain falling across the board rather than as wear
 * on eleven separate pieces of salvage. Scratches come from use; those came
 * from one direction.
 *
 * So each plate starts the tile somewhere of its own and may turn it over, off
 * a seed that is the module's id. Turned over on one axis the marks lean the
 * other way; turned over on both they lean the same way and are simply a
 * different part of the tile. Nothing is drawn that was not already there, so
 * this costs the page no second texture and no extra frame at startup — which
 * is the budget gt#21 fought for and a tile per plate would have spent.
 *
 * Deterministic, like everything else on this board: the same plate is laid
 * the same way every session, and a person could learn where the marks are.
 */
export function scratchLay(id: string): {
  readonly x: number;
  readonly y: number;
  readonly flipX: 1 | -1;
  readonly flipY: 1 | -1;
} {
  const seed = seedOf(`scratch:${id}`);
  const tile = parseInt(textureLayers.module.scratchSize, 10) || 1;
  return {
    x: seed % tile,
    y: Math.floor(seed / tile) % tile,
    flipX: Math.floor(seed / 7) % 2 === 0 ? 1 : -1,
    flipY: Math.floor(seed / 13) % 2 === 0 ? 1 : -1,
  };
}

/**
 * Which loudness gauge a module's fader carries (gt#90): what its marks are, how
 * many of them, and which side of the lane they are cut on.
 *
 * Dealt round the board rather than drawn from a hash, and that was tried
 * first: seeded off the id, seven of the eleven came up dots and none came up
 * a wedge. Eleven is too few for chance to look like variety. So each module
 * takes the next shape, the next count and the next side in turn, by its place
 * in the engine's own list — which puts the two modules that share a well on
 * different cuts, and uses every shape before it repeats one.
 *
 * It is still a thing about the module rather than about the session: the same
 * plate has the same gauge every time, and a person could learn it. An id the
 * engine does not list — a plate drawn on its own, in a suite — falls back to
 * a seed, so it still gets one.
 */
export function gaugeFor(id: string): GaugeSpec {
  const listed = (SOURCE_IDS as readonly string[]).indexOf(id);
  const turn = listed >= 0 ? listed : seedOf(`loud:${id}`);
  const deal = <T>(from: readonly T[], step: number): T => from[(turn * step) % from.length] as T;
  return {
    // Three at a time through four shapes, so neighbours never match and the
    // sequence is not simply the list in order.
    shape: deal(GAUGE.shapes, 3),
    count: deal(GAUGE.counts, 1),
    side: GAUGE.sides[Math.floor(turn / 2) % GAUGE.sides.length] as GaugeSpec['side'],
  };
}

/**
 * How the one rust tile is laid on a given plate or box (gt#100): where it
 * starts, and whether it is turned over left to right.
 *
 * The same reason {@link scratchLay} exists, a pass later. Every plate laid the
 * rust tile from its own top-left corner, so every plate rusted in the same
 * places: the same patch in the same corner of all eleven, which the eye finds
 * at once and reads as a stamp. Off a seed that is the id, so a plate is
 * rusted the same way every session.
 *
 * Left to right only. Rust runs downward, and a tile turned top to bottom
 * would have its streaks climbing.
 */
export function rustLay(id: string): { readonly x: number; readonly y: number; readonly flip: 1 | -1 } {
  const seed = seedOf(`rust:${id}`);
  const tile = parseInt(textureLayers.module.rustSize, 10) || 1;
  return {
    x: seed % tile,
    y: Math.floor(seed / tile) % tile,
    flip: Math.floor(seed / 11) % 2 === 0 ? 1 : -1,
  };
}

/** The declarations that lay the rust tile a plate's own way. See {@link rustLay}. */
export const rustLaid = (id: string): string => {
  const lay = rustLay(id);
  return `background-position:${lay.x}px ${lay.y}px;transform:scaleX(${lay.flip});`;
};

/** One full-plate texture overlay, clipped to the plate's own corners. */
const overlay = (parent: HTMLElement, part: string, style: string): HTMLElement =>
  box(part, `${stretched()}${style}pointer-events:none;border-radius:${plate.radius};`, parent);

/**
 * Where the board's seal is cut into this piece of metal (gt#105). The first
 * thing laid on a plate or a box, under its grain, its rust and its scratches —
 * a cut is under whatever settled on it afterwards — and so under every knob,
 * tape, jack and screw on it too, which is the rule: an etching is in any
 * metal that can be seen, and not in a thing fixed on top of the metal.
 *
 * Empty here. A plate does not know where on the board it is, and the seal is
 * one cut across all of them, so the board fills this in and lines it up —
 * see `seatEtch` in ./board. Built on its own, a plate simply has no seal.
 *
 * It fades in with the board's age on the same terms the plate's own does, and
 * it is clipped to the plate: the ring is 760 pixels across and a plate is not.
 */
export const etchLayer = (parent: HTMLElement): HTMLElement =>
  overlay(parent, 'etch', `overflow:hidden;opacity:calc(var(--weather, 0) * ${BOARD.seal.weather});`);

/** Build one source module. */
export function createModule(spec: ModuleSpec): ModuleHandle {
  const { def } = spec;
  const skin = sourcePlates[def.id];
  const skirt = textureLayers.module;

  let state = spec.state;
  let woke = spec.woke ?? true;
  let booted = spec.booted ?? true;

  const element = box(
    'module',
    `position:relative;background:${skin.plate};border:${plate.border};` +
      `border-radius:${plate.radius};box-shadow:${plate.shadow};` +
      `padding:${MODULE.padding};min-width:0;`,
  );
  element.dataset.module = def.id;
  element.dataset.zone = def.zone;
  element.dataset.type = def.type;

  // The tint bleeds out past every edge and sits behind everything else, which
  // is what makes an on module colour the board rather than merely itself.
  const glow = box(
    'glow',
    `${stretched(MODULE.glow.outset)}background:radial-gradient(${MODULE.glow.origin}, ` +
      `${skin.tint}, ${plate.glowFade} ${MODULE.glow.stop}%);` +
      `transition:${MODULE.glow.transition};filter:blur(${MODULE.glow.blur}px);` +
      `pointer-events:none;z-index:0;`,
    element,
  );

  // The board's seal, where it crosses this plate (gt#105). Before the grain.
  etchLayer(element);
  overlay(element, 'grain', `background-image:var(--grainTex);opacity:${skirt.grain};mix-blend-mode:overlay;`);
  // This plate's own lay of the one scratch tile (gt#89) — see `scratchLay`.
  const lay = scratchLay(def.id);
  overlay(
    element,
    'scratches',
    `background-image:var(--scratchTex);background-size:${skirt.scratchSize};` +
      `background-position:${lay.x}px ${lay.y}px;transform:scale(${lay.flipX}, ${lay.flipY});` +
      `opacity:${skirt.scratches};mix-blend-mode:screen;`,
  );
  // The one plate value that is not fixed: rust deepens with the board's age,
  // and how far it can go is this module's own ceiling. THE JUNK DRAWER's .65–.85
  // against BASS's .4 is why that corner reads as the messiest.
  //
  // The mask is the other half of it, and the newer half (gt#35). A plate does not
  // corrode evenly — it goes at the edges and in the dish around each of the
  // four screws this component draws below, which is why the placement is worth
  // more to the eye than any amount of tuning the opacity ever was.
  overlay(
    element,
    'rust',
    `background-image:var(--rustTex);background-size:${skirt.rustSize};${rustLaid(def.id)}` +
      `${masked(skirt.rustMask)}` +
      `opacity:calc(${skirt.rustBase} + var(--weather, 0) * ${skin.rustMax});`,
  );
  // A plate does not weep, and the reason is height. Runs were tried here and
  // pulled back out: the tile is 130px tall against a plate of about 135, so a
  // streak spanned the whole plate and was clipped mid-fade — "bleeds down,
  // thins, dries up" came out as a hard-edged vertical bar, nine plates of them
  // on a visible repeat. Rust needs somewhere to have come *from* and somewhere
  // to stop, and a plate offers neither. THE FOUNDATION's rivet strip is the one
  // seam on this board that does, so the runs live there alone — see ./board.

  SCREW_CORNERS.forEach(([x, y], index) => {
    const head = box(
      'screw',
      `position:absolute;${x}:${MODULE.screw.inset}px;${y}:${MODULE.screw.inset}px;` +
        `width:${MODULE.screw.size}px;height:${MODULE.screw.size}px;border-radius:50%;` +
        `background:${plate.screw};box-shadow:${plate.screwShadow};`,
      element,
    );
    // Which corner this is, so anything reading the plate back can tell whether
    // a slot is at the angle its corner was cut to. There is no other way to
    // ask: a head that carries a mark has no slot to read an angle off, and the
    // four are otherwise indistinguishable once they are in the DOM.
    head.dataset.corner = String(index);

    // A handful of screws carry a mark instead of a slot — the same handful
    // every session, decided off this key (gt#36). The rest are the hairline they
    // always were, each at its own angle.
    const key = `screw:${def.id}:${index}`;
    if (marked(key, MODULE.screwMark.odds)) {
      box(
        'mark',
        `${stretched(-MODULE.screwMark.inset)}background-image:${markTile({
          key,
          depth: MODULE.screwMark.depth,
          size: MODULE.screw.size - MODULE.screwMark.inset * 2,
          stroke: MODULE.screwMark.stroke,
          alpha: MODULE.screwMark.alpha,
          // The slot's own dark, because the mark is cut into the head in place
          // of one. A mark in any other colour would read as painted on.
          pigment: plate.screwSlot,
        })};background-size:contain;background-repeat:no-repeat;`,
        head,
      );
      return;
    }

    box(
      'slot',
      `position:absolute;left:${MODULE.screw.slotInset}px;right:${MODULE.screw.slotInset}px;` +
        `top:${MODULE.screw.slotTop}px;height:${MODULE.screw.slotHeight}px;` +
        `background:${plate.screwSlot};transform:rotate(${plate.screwSlotAngles[index]}deg);`,
      head,
    );
  });

  // The shade (gt#76): what makes a plate with no power look like one. Laid over
  // the textures and the four screws, so the grain, the rust and the bright
  // heads all go dark with the plate — a shaded plate with four lit screws on
  // it reads as a rendering fault — and under the header and the control row.
  // Those sit at their own `z-index` and are dimmed by their own means, the
  // lettering by its alpha and the controls by a filter, because a flat wash
  // over a knob reads as a knob behind glass.
  const shade = overlay(
    element,
    'shade',
    `background:${plate.unlit};transition:${UNLIT.transition};`,
  );

  // The plate taking its own hit (gt#81). Over the shade, so a struck plate
  // lights however dark it was drawn — though only a module that is on ever
  // strikes — and under the header and the controls for the reason the shade is:
  // lettering washed in light is lettering that cannot be read.
  const strike = overlay(
    element,
    'flash',
    `background:rgb(${bloomColor(def.id)});mix-blend-mode:screen;opacity:0;`,
  );
  let flashTimer = 0;

  const header = box(
    'header',
    `position:relative;display:flex;align-items:center;justify-content:space-between;` +
      `gap:${MODULE.header.gap}px;margin-bottom:${MODULE.header.marginBottom}px;z-index:1;`,
    element,
  );

  // The name melts at high MURK once the shelf is armed (gt#39): it sags, and it
  // is never tilted — a tilted name reads as a broken layout, which is the same
  // thing that kept rotation out of the shake. The drop is `calc` off `--melt`,
  // which is 0 on every board that has not been armed, so an unarmed board
  // computes a zero translate and looks exactly as it did before this existed.
  //
  // It used to blur as well, here, on the name alone — and so the heading went
  // soft while the tape, the knob and the plate round it stayed sharp (gt#109).
  // The blur is the whole board's now: one filter on the plate. See ./rupture.
  const name = box(
    'name',
    `font-family:${fonts.name};font-weight:${MODULE.name.weight};font-size:${MODULE.name.fontSize}px;` +
      `letter-spacing:${MODULE.name.letterSpacing}px;color:${ink.bone};` +
      `text-shadow:${ink.boneShadow};white-space:nowrap;position:relative;` +
      `translate:0 calc(var(--melt, 0) * ${RUPTURE.melt.maxDropPx}px);` +
      `transition:${UNLIT.transition};`,
    header,
  );
  name.textContent = def.name;
  // The name is paint, and paint on this plate has been scratched like the
  // plate has (gt#118). After the text is set, because setting it would take
  // this with it; laid over the letters and no harder than the plate's own.
  scuffed(name, `name:${def.id}`, GRIME.name, '0');

  // Lamp and toggle are one target: the lamp is small, and a light you can press
  // is easier to find than a light you cannot.
  const power = box(
    'power',
    `display:flex;align-items:center;gap:${MODULE.lamp.gap}px;cursor:pointer;flex-shrink:0;padding:1px;`,
    header,
  );
  const lamp = box(
    'lamp',
    `width:${MODULE.lamp.size}px;height:${MODULE.lamp.size}px;border-radius:50%;${BEZEL}` +
      `transition:${MODULE.lamp.transition};`,
    power,
  );
  const well = box(
    'toggle',
    `width:${MODULE.toggle.width}px;height:${MODULE.toggle.height}px;background:${toggleTokens.well};` +
      `border-radius:${MODULE.toggle.radius}px;box-shadow:${toggleTokens.wellShadow};position:relative;` +
      `transition:${UNLIT.controlsTransition};`,
    power,
  );
  const nub = box(
    'nub',
    `position:absolute;left:${MODULE.toggle.nub.left}px;width:${MODULE.toggle.nub.width}px;` +
      `height:${MODULE.toggle.nub.height}px;border-radius:${MODULE.toggle.nub.radius}px;` +
      `background:${toggleTokens.nub};box-shadow:${toggleTokens.nubShadow};` +
      `transition:${MODULE.toggle.transition};`,
    well,
  );
  // A dull patch on the switch, where a finger flicks it (gt#118).
  tarnished(nub, `power:${def.id}`, `${MODULE.toggle.nub.radius}px`);

  const row = box(
    'controls',
    `position:relative;display:flex;flex-wrap:wrap;align-items:flex-end;` +
      `gap:${MODULE.row.gap}px;z-index:1;transition:${UNLIT.controlsTransition};`,
    element,
  );

  const controls = new Map<string, ControlHandle>();

  /** One of this module's controls, wired to the board through the spec. */
  function control(param: ModuleParam, shape: Omit<ControlSpec, 'scope' | 'param' | 'value' | 'onInput'>): ControlHandle {
    const handle = createControl({
      ...shape,
      scope: def.id,
      param,
      value: state[param],
      wearTurns: spec.wear?.[`${def.id}.${param}`] ?? 0,
      onPress: () => spec.onPress?.(def.id),
      onInput: (value) => spec.onInput(def.id, param, value),
      onCommit: (key) => spec.onCommit?.(key),
    });
    controls.set(handle.key, handle);
    row.appendChild(handle.element);
    return handle;
  }

  // The character control is the module's dominant gesture and is sized to say
  // so. THE VOICE is the one module whose character is a choice rather than an
  // amount, so its control steps through words.
  //
  // What it is *made of* is the module's own business (gt#51): the definition may
  // name a kind, and where it does not this is a selector for a choice and a
  // knob for an amount, as it always was. The size follows the kind — round
  // things take a diameter, things with a throw take a height — and comes out
  // the same height either way, so a plate's control row does not depend on
  // what it was salvaged from.
  const charKind = def.hardware?.char ?? (def.charWords ? 'selector' : 'knob');
  const charSize = def.charWords ? MODULE.charWords : MODULE.char;
  const charRound = def.charWords
    ? MODULE.charWords.diameter
    : def.zone === 'junk'
      ? MODULE.char.junkDiameter
      : MODULE.char.diameter;
  const char = control('char', {
    kind: charKind,
    label: def.char.label,
    ...(def.charWords ? { steps: def.charWords.length, words: def.charWords } : {}),
    face: skin.face,
    diameter: charRound,
    height: MODULE.char.throwHeight,
    width: charSize.width,
    fontSize: charSize.fontSize,
  });

  // No tape (gt#90): HOW LOUD was the same two words under every fader on the
  // board. A gauge cut beside the lane says which way is more, lights up to the
  // level, and is this module's own cut of one. The word stays on the control
  // for a hover to read.
  const loud = control('loud', {
    kind: 'fader',
    label: CONTROLS.loud.label,
    bare: true,
    gauge: gaugeFor(def.id),
    height: MODULE.loud.height,
    width: MODULE.loud.width,
    fontSize: MODULE.loud.fontSize,
  });

  // Only a strike has a rate: a drone is either sounding or it is not.
  //
  // A selector unless the module says otherwise (gt#51). Anything with an *up* —
  // a lever, a bank of switches — is drawn the other way round from the value
  // it holds: the first of HOW OFTEN's words is *constantly* and the last is
  // *almost never*, and a lever thrown to the top has to mean more of it, not
  // less. A selector has no up and is left as the reference turns it.
  const oftenKind = def.hardware?.often ?? 'selector';
  const often =
    def.type === 'strike'
      ? control('often', {
          kind: oftenKind,
          label: CONTROLS.often.label,
          steps: OFTEN_WORDS.length,
          words: OFTEN_WORDS,
          face: skin.face,
          diameter: MODULE.often.diameter,
          height: MODULE.often.throwHeight,
          width: MODULE.often.width,
          fontSize: MODULE.often.fontSize,
          ...(oftenKind === 'selector' ? {} : { invert: true }),
        })
      : null;

  box('spacer', 'flex:1;', row);

  // The socket, and nothing under it (gt#110). It was captioned OUT, which told a
  // module's one socket apart from nothing: there is no IN on a source for it to
  // be the other end of. A chain box has both and keeps both words. What this
  // one is for is said on hover — see JACK_TIPS in ./words.
  const jack = box(
    'jack',
    `width:${MODULE.jack.size}px;height:${MODULE.jack.size}px;border-radius:50%;flex-shrink:0;` +
      `align-self:center;position:relative;background:${jackTokens.face};` +
      `box-shadow:${jackTokens.shadow};cursor:crosshair;`,
    row,
  );
  jack.dataset.jackOut = def.id;
  // A socket that has had a plug in and out of it for years (gt#118).
  tarnished(jack, `jack:${def.id}`, '50%');

  /** The three facts the plate was last drawn at. See `render`. */
  let drawnAs = '';

  function render(): void {
    // Everything below is a function of three booleans, and the board asks for
    // it on every gesture and every drift tick. Drawn once per change of any of
    // the three, rather than nine style writes to say what the plate says.
    const facts = `${state.on}|${booted}|${woke}`;
    if (facts === drawnAs) return;
    drawnAs = facts;
    // Switched on *and* reached by the power (gt#88). On a board that is still
    // coming up these differ: the nub below answers the switch alone, so a
    // plate waiting its turn is visibly a module that is on and not yet lit.
    const lit = state.on && booted;
    glow.style.opacity = String(woke && lit ? MODULE.glow.opacityOn : 0);
    lamp.style.background = lit ? signals.lampOn : signals.lampOff;
    // Two rings on a lit lamp: the reference's, and a wider one over it (gt#76).
    lamp.style.boxShadow = lit ? `${signals.lampGlowOn}, ${signals.lampHalo}` : signals.lampGlowOff;
    // And everything that says the plate has no power, in one place and off the
    // one fact (gt#76). Not gated on `woke` the way the tint above is: that is
    // about the ambient glow arriving with the sound, and this is about whether
    // the plate is lit at all.
    shade.style.opacity = lit ? '0' : String(UNLIT.shade);
    name.style.opacity = lit ? '1' : String(UNLIT.name);
    row.style.filter = lit ? '' : UNLIT.controls;
    well.style.filter = lit ? '' : UNLIT.switch;
    // Overdriven, the amber blows out to white and takes its own glow with it —
    // a `filter` covers the element's shadow as well as its fill, which is why
    // one property does both. **Lit lamps only** (gt#39): brightening a dark lamp
    // would make it look on, and the shelf must not make the board lie about
    // what it is doing. `--overdrive` is 1 until something arms it.
    // Two `brightness` functions and not one multiplied together (gt#40): the shelf
    // owns the first and the hammer's flash owns the second, they arrive from
    // different places and neither has any business restating the other's resting
    // value. `filter` composes them for free; a `calc` would couple them. The
    // lit-only rule holds for the flash too, and for exactly the reason above.
    lamp.style.filter = lit ? `brightness(var(--overdrive, 1)) brightness(var(${SMASH_VAR}, 1))` : '';
    nub.style.top = `${state.on ? MODULE.toggle.nub.on : MODULE.toggle.nub.off}px`;
  }

  const onPowerClick = (): void => spec.onToggle?.(def.id, !state.on);
  const onJackDown = (event: PointerEvent): void => spec.onJackDown?.(def.id, event);

  power.addEventListener('click', onPowerClick);
  jack.addEventListener('pointerdown', onJackDown);
  render();

  return {
    element,
    id: def.id,
    jack,
    controls,
    setState(next: ModuleState, heard: ModuleState = next): void {
      state = next;
      char.setValue(next.char, heard.char);
      loud.setValue(next.loud, heard.loud);
      often?.setValue(next.often, heard.often);
      render();
    },
    setWoke(next: boolean): void {
      woke = next;
      render();
    },
    setBooted(next: boolean): void {
      if (next === booted) return;
      booted = next;
      render();
    },
    setWear(key: string, turns: number): void {
      controls.get(key)?.setWear(turns);
    },
    flash(strength = 1): void {
      const { peak, floor, ms } = MODULE.flash;
      const reach = floor + (1 - floor) * Math.min(1, Math.max(0, strength));
      if (flashTimer) clearTimeout(flashTimer);
      // Up at once, then let go on the next turn of the loop — a transition
      // written in the tick that sets the value it starts from never runs.
      strike.style.transition = 'none';
      strike.style.opacity = String(Number((peak * reach).toFixed(3)));
      flashTimer = window.setTimeout(() => {
        flashTimer = 0;
        strike.style.transition = `opacity ${ms}ms ease-out`;
        strike.style.opacity = '0';
      }, 0);
    },
    destroy(): void {
      if (flashTimer) clearTimeout(flashTimer);
      flashTimer = 0;
      power.removeEventListener('click', onPowerClick);
      jack.removeEventListener('pointerdown', onJackDown);
      for (const handle of controls.values()) handle.destroy();
      controls.clear();
    },
  };
}
