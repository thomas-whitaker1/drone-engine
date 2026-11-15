// One box of THE CHAIN, rendered four times from ./modifiers. The relationship
// to ./module is exactly the one the design intends: the same plate, the same
// jack, the same control component, turned on its side.
//
// It owns how a box looks and what a hand touching it means, and no state — the
// board keeps the amounts and the wire list and tells this component what to
// draw. Three things follow from that, and they are what keep the file short:
//
// - **The amount is a `createControl`.** GRIT's knob, MURK's fader and WOBBLE's
//   wheel differ only in the kind and size ./modifiers gives them, so nothing
//   about turning one is written here.
// - **The lamp answers the signal, not the amount.** A box lights when sound is
//   coming through it (gt#95): something that is switched on reaches it, down
//   however many cables. A box with nothing live into it reads as dark at full
//   amount, which is honest: it is doing nothing. It used to answer the patch
//   alone — lit the moment a cable went in — and so a box fed only by a source
//   that was switched off stayed lit over a cable gt#85 had already drawn dead.
//   Two lights, two meanings. `fed` is still here, and still means *a cable is
//   in*: it is what the board asks before it patches a box for you.
// - **A box is not a module.** No screws, no scratches, no ambient tint: the
//   reference lays grain and rust over the plate and stops, and a box has no
//   power of its own to glow with.
//
// Both jacks are tagged here and neither is interpreted here. IN is a pure drop
// target — the wire layer finds it with `closest('[data-jack-in]')` and this
// component never listens on it. OUT forwards a pointerdown and takes no view on
// what happens next.

import { BOX, CHAIN, GRIME, RUPTURE, SMASH_VAR, UNLIT } from './constants';
import { createControl } from './control';
import type { ControlHandle } from './control';
import { box, masked, stretched } from './dom';
import { BEZEL, scuffed, tarnished } from './grime';
import type { ModifierDef } from './modifiers';
import { etchLayer, rustLaid } from './module';
import { JACK } from './words';
import type { ModifierId } from '../engine/constants';
import {
  fonts,
  ink,
  jack as jackTokens,
  modifierPlates,
  plate,
  signals,
  textureLayers,
} from '../tokens';

/**
 * What every modifier control is scoped to. The four boxes share one scope and
 * differ by param, so a wear key reads `mods.grit` — which is the key the
 * reference persists under, and the reason this is a constant rather than the
 * box's own id.
 */
export const MODIFIER_SCOPE = 'mods';

/** Everything the board knows about one box. Held there, drawn here. */
export interface ModifierState {
  /** 0–1. */
  readonly amount: number;
  /** At least one wire feeds this box. A fact about the patch and nothing more. */
  readonly fed: boolean;
  /**
   * Sound is reaching this box (gt#95): something switched on is patched into it,
   * directly or through other boxes. The lamp and the unlit look read this.
   *
   * Optional, and a box that is not told is lit when it is fed — which is the
   * same answer on any board whose sources are all on, and keeps a box drawn on
   * its own (a test, a story) from needing a patch to light it.
   */
  readonly live?: boolean;
}

export interface ModifierSpec {
  readonly def: ModifierDef;
  readonly state: ModifierState;

  /** Completed drags per `mods.id`, for the wear halo. */
  readonly wear?: Readonly<Record<string, number>>;

  /**
   * The control was touched, before any value has moved. The board used to
   * patch GUITAR WALL into an unfed box here; it no longer does (gt#97), and a
   * box's control sets its amount and nothing else.
   */
  readonly onPress?: (id: ModifierId) => void;

  /** The amount moved. */
  readonly onInput: (id: ModifierId, value: number) => void;

  /** A drag finished having actually moved, under its `mods.id` key. */
  readonly onCommit?: (key: string) => void;

  /** The OUT socket was pressed. Where a wire drag begins. */
  readonly onJackDown?: (id: ModifierId, event: PointerEvent) => void;
}

export interface ModifierHandle {
  /** The box. Nothing is mounted here — the board decides where it goes. */
  readonly element: HTMLElement;
  readonly id: ModifierId;
  /** The IN socket. A drop target the wire layer measures; never listened on. */
  readonly jackIn: HTMLElement;
  /** The OUT socket. Where a wire out of this box starts. */
  readonly jackOut: HTMLElement;
  /** This box's one control, keyed `mods.id`. */
  readonly control: ControlHandle;
  /**
   * Draw a state the board decided on, without calling back into it. `heard` is
   * where the control is drawn when that is not where it is set (gt#91).
   */
  setState(state: ModifierState, heard?: ModifierState): void;
  setWear(turns: number): void;
  /** Detach every listener, this box's and its control's. */
  destroy(): void;
}

/** One full-box texture overlay, clipped to the box's own corners. */
const overlay = (parent: HTMLElement, part: string, style: string): HTMLElement =>
  box(part, `${stretched()}${style}pointer-events:none;border-radius:${plate.radius};`, parent);

/** One jack column: the socket, tagged for the wire layer, over its caption. */
function socket(parent: HTMLElement, part: string, caption: string, key: string): HTMLElement {
  const column = box(
    part,
    `position:relative;display:flex;flex-direction:column;align-items:center;` +
      `gap:${BOX.jack.gap}px;z-index:1;`,
    parent,
  );
  const face = box(
    'jack',
    `width:${BOX.jack.size}px;height:${BOX.jack.size}px;border-radius:50%;position:relative;` +
      `background:${jackTokens.face};box-shadow:${jackTokens.shadow};cursor:crosshair;`,
    column,
  );
  // A socket that has had a plug in and out of it for years (gt#118).
  tarnished(face, key, '50%');
  const label = box(
    'caption',
    `font-family:${fonts.body};font-size:${BOX.jack.captionSize}px;` +
      `letter-spacing:${BOX.jack.captionTracking}px;color:${ink.stencilJack};`,
    column,
  );
  label.textContent = caption;
  return face;
}

/** Build one modifier box. */
export function createModifier(spec: ModifierSpec): ModifierHandle {
  const { def } = spec;
  const skin = modifierPlates[def.id];
  const skirt = textureLayers.modifier;

  let state = spec.state;

  // `flex:1 1 0` with a floor rather than a width: the boxes share the rack
  // evenly, so four are cut wide and seven are cut narrow and neither is a
  // number written down anywhere (gt#48). The floor is the one that is —
  // CHAIN.minBoxWidth is this box added up, and it is what the rack's capacity
  // is measured in. A box may never be drawn under it.
  const element = box(
    'modifier',
    `position:relative;display:flex;align-items:center;gap:${BOX.gap}px;` +
      `flex:1 1 0;min-width:${CHAIN.minBoxWidth}px;` +
      `background:${skin.plate};border:${plate.border};border-radius:${plate.radius};` +
      `box-shadow:${plate.boxShadow};padding:${BOX.padding};`,
  );
  element.dataset.mod = def.id;

  // The board's seal, where it crosses this box (gt#105) — a box is metal too.
  etchLayer(element);
  overlay(element, 'grain', `background-image:var(--grainTex);opacity:${skirt.grain};mix-blend-mode:overlay;`);
  // A box rusts on the same board-wide clock as a plate does, to its own ceiling,
  // and to its edges only: it has no screws to pool around and no seam to weep
  // from, so it gets neither the plate's screw mask nor its runs (gt#35). Same
  // reasoning as the scratches it has never had — a box is not a module.
  overlay(
    element,
    'rust',
    // Its own lay of the tile (gt#100), so seven boxes in a row do not all rust
    // in the same corner.
    `background-image:var(--rustTex);background-size:${skirt.rustSize};${rustLaid(def.id)}` +
      `${masked(skirt.rustMask)}` +
      `opacity:calc(${skirt.rustBase} + var(--weather, 0) * ${skirt.rustWeather});`,
  );

  // The shade (gt#76), on the same terms as a source plate's: over the textures,
  // under the three columns, and up only while nothing feeds this box. A box
  // nobody has patched into is not in the sound, and the rack going dark where
  // the patch does not reach is the signal flow drawn without a line of it.
  //
  // The two jacks are deliberately left out of it. An unfed box's IN socket is
  // the one thing on the rack a hand is about to go looking for, and dimming the
  // drop target of the board's signature gesture would be dimming the answer.
  const shade = overlay(
    element,
    'shade',
    `background:${plate.unlit};transition:${UNLIT.transition};`,
  );

  const jackIn = socket(element, 'inlet', JACK.in, `jack:${def.id}:in`);

  const centre = box(
    'centre',
    // The column runs the full height of the box and holds its two things
    // apart (gt#90): the name against the top, the control against the bottom. A
    // box stretched to match a taller neighbour then spends the difference as
    // air between them, so every name on the rack sits on one line and every
    // control on another, whichever kind it is.
    `position:relative;flex:1;display:flex;flex-direction:column;align-items:center;` +
      `align-self:stretch;justify-content:space-between;` +
      `gap:${BOX.centre.gap}px;min-width:0;z-index:1;`,
    element,
  );
  const header = box(
    'header',
    `display:flex;align-items:center;gap:${BOX.lamp.gap}px;margin-bottom:${BOX.header.below}px;`,
    centre,
  );
  const lamp = box(
    'lamp',
    `width:${BOX.lamp.size}px;height:${BOX.lamp.size}px;border-radius:50%;${BEZEL}` +
      `transition:${BOX.lamp.transition};`,
    header,
  );
  // The name melts at high MURK once the shelf is armed, exactly as a module's
  // does (gt#39) — sagging, never tilted. It did not until gt#63, and did not need
  // to: the box's tape peeled instead. The tape is gone, so the name is the
  // lettering the rack has left to come apart with. The blur that goes with it
  // is the whole board's, one filter on the plate (gt#109) — see ./rupture.
  const name = box(
    'name',
    `font-family:${fonts.name};font-weight:${BOX.name.weight};font-size:${BOX.name.fontSize}px;` +
      `letter-spacing:${BOX.name.letterSpacing}px;color:${ink.bone};text-shadow:${ink.boneShadow};` +
      `white-space:nowrap;position:relative;` +
      `translate:0 calc(var(--melt, 0) * ${RUPTURE.melt.maxDropPx}px);` +
      `transition:${UNLIT.transition};`,
    header,
  );
  name.textContent = def.word.label;
  // Scratched like the box it is painted on (gt#118) — after the text is set,
  // because setting it would take this with it.
  scuffed(name, `name:${def.id}`, GRIME.name, '0');

  // The box's name is the word, and it is said once (gt#63). A modifier has one
  // amount, so there is nothing else a label under the control could say — the
  // tape that used to sit there read GRIT forty pixels below a plate that read
  // GRIT. The control is built bare: no strip, and its word kept on the element
  // for the tip layer, which is the one thing that was reading the tape.
  const control = createControl({
    kind: def.kind,
    scope: MODIFIER_SCOPE,
    param: def.id,
    label: def.word.label,
    bare: true,
    value: state.amount,
    face: skin.face,
    ...(def.diameter === undefined ? {} : { diameter: def.diameter }),
    ...(def.height === undefined ? {} : { height: def.height }),
    width: BOX.control.width,
    fontSize: BOX.control.fontSize,
    wearTurns: spec.wear?.[`${MODIFIER_SCOPE}.${def.id}`] ?? 0,
    onPress: () => spec.onPress?.(def.id),
    onInput: (value) => spec.onInput(def.id, value),
    onCommit: (key) => spec.onCommit?.(key),
  });
  control.element.style.transition = UNLIT.controlsTransition;
  centre.appendChild(control.element);

  const jackOut = socket(element, 'outlet', JACK.out, `jack:${def.id}:out`);

  jackIn.dataset.jackIn = def.id;
  jackOut.dataset.jackOut = def.id;

  /** Whether the box was last drawn lit. Unset until it has been drawn at all. */
  let drawnLit: boolean | undefined;

  function render(): void {
    // Is sound coming through (gt#95) — and, told nothing, is a cable in.
    const lit = state.live ?? state.fed;
    // One fact decides all of it, and the board asks on every gesture and every
    // drift tick: drawn when the fact moves and at no other time.
    if (lit === drawnLit) return;
    drawnLit = lit;
    lamp.style.background = lit ? signals.lampOn : signals.lampOff;
    lamp.style.boxShadow = lit ? `${signals.lampGlowOn}, ${signals.lampHalo}` : signals.lampGlowOff;
    // Carrying nothing is unlit (gt#76) — off the same fact the lamp answers, so a
    // box and its lamp can never disagree about whether it is in the sound.
    shade.style.opacity = lit ? '0' : String(UNLIT.shade);
    name.style.opacity = lit ? '1' : String(UNLIT.name);
    control.element.style.filter = lit ? '' : UNLIT.controls;
    // Overdriven with the module lamps (gt#39), and gated on the same thing this
    // lamp is always gated on: a box lights because it is live, so a dark box
    // stays dark however hard the board is coming apart. See ./rupture — half the
    // lamps on a board blowing out and half not would read as a fault.
    // And the hammer's flash beside it (gt#40), on the same gate and as a second
    // `brightness` rather than a product — see ./module for why the two stay
    // separate functions.
    lamp.style.filter = lit ? `brightness(var(--overdrive, 1)) brightness(var(${SMASH_VAR}, 1))` : '';
  }

  const onJackDown = (event: PointerEvent): void => spec.onJackDown?.(def.id, event);

  jackOut.addEventListener('pointerdown', onJackDown);
  render();

  return {
    element,
    id: def.id,
    jackIn,
    jackOut,
    control,
    setState(next: ModifierState, heard: ModifierState = next): void {
      state = next;
      control.setValue(next.amount, heard.amount);
      render();
    },
    setWear(turns: number): void {
      control.setWear(turns);
    },
    destroy(): void {
      jackOut.removeEventListener('pointerdown', onJackDown);
      control.destroy();
    },
  };
}
