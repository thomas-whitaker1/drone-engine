// The last of the dirt (gt#118): one small mark of age for each thing on the
// board that was still clean.
//
// The plate, the modules and the boxes have been scratched and rusted since
// gt#35, and the hammer and the guarded button were built old. What was left
// pristine was everything a hand actually touches and everything stuck on
// afterwards: the caps of the controls, the sockets, the lamps, the lettering,
// the tape. Thomas: "a final grime pass… a light touch to roughen up the last
// pristine bits, not a full element overhaul." So each of these is one thing,
// and small, and there is exactly one per kind of object:
//
// - {@link scuffed}: the board's own scratches laid over something — a knob's
//   cap, a name stencilled on a plate, the wake lever's plate.
// - {@link tarnished}: a dull patch on a piece of bare metal or plastic that
//   fingers go to — a fader's cap, a lever's bar, a switch's nub, a socket.
// - {@link rusted}: the board's rust on an iron ring — a valve wheel's rim.
// - {@link BEZEL}: a ring of dirt round a lamp.
// - {@link GRUBBY}: dirty ends on a strip of tape; {@link STAINED} a stained
//   corner on the paper tag.
//
// Three rules, the board's own:
//
// - **Nothing is randomised at runtime.** Where a mark is laid comes from a
//   seed that is the thing's name, so a knob is scuffed the same way this
//   session and the next, and no two are scuffed alike.
// - **It costs nothing per frame.** Each is one static element or one static
//   declaration, with no filter and no animation.
// - **It never takes a pointer and never covers a word.** The tape is dirty
//   at its ends, where there is no lettering; a name is scratched no harder
//   than the plate it is on.

import { GRIME } from './constants';
import { box, masked, stretched } from './dom';
import { controls, ink, seedOf, signals } from '../tokens';

/** Where a tile is laid for this seed: two shifts that share no period. */
const shift = (seed: number): string =>
  `${-(seed % GRIME.spread.x)}px ${-((seed >>> 3) % GRIME.spread.y)}px`;

/**
 * The board's scratches over something that had none. `key` is the thing's
 * name; `radius` is the CSS radius it is cut to, so the scratches stop at its
 * edge.
 */
export function scuffed(
  parent: HTMLElement,
  key: string,
  cut: { readonly size: number; readonly opacity: number },
  radius: string,
): HTMLElement {
  return box(
    'scuff',
    `${stretched()}border-radius:${radius};background-image:var(--scratchTex);` +
      `background-size:${cut.size}px;background-position:${shift(seedOf(`scuff:${key}`))};` +
      `opacity:${cut.opacity};pointer-events:none;`,
    parent,
  );
}

/**
 * A dull patch on something bare that is handled. Half of them are turned
 * round, by the seed, so a row of caps is not a row of one cap.
 */
export function tarnished(parent: HTMLElement, key: string, radius: string): HTMLElement {
  const turned = seedOf(`tarnish:${key}`) % 2 === 1;
  return box(
    'tarnish',
    `${stretched()}border-radius:${radius};background:${controls.tarnish};` +
      `${turned ? 'scale:-1 -1;' : ''}pointer-events:none;`,
    parent,
  );
}

/**
 * Rust on a ring: the board's rust tile, masked to the outer `rim` pixels of a
 * circle `diameter` across. For a wheel, whose spokes and middle are open.
 */
export function rusted(parent: HTMLElement, key: string, diameter: number, rim: number): HTMLElement {
  const inner = Number((100 - (rim / (diameter / 2)) * 100).toFixed(1));
  return box(
    'rust',
    `${stretched()}border-radius:50%;background-image:var(--rustTex);` +
      `background-size:${GRIME.wheel.size}px;background-position:${shift(seedOf(`rust:${key}`))};` +
      masked(`radial-gradient(circle closest-side, transparent ${inner}%, #000 ${inner + GRIME.wheel.feather}%)`) +
      `opacity:${GRIME.wheel.opacity};pointer-events:none;`,
    parent,
  );
}

/** A ring of dirt round a lamp: an outline, so the lamp's own glow is not touched. */
export const BEZEL = `outline:${GRIME.bezel}px solid ${signals.lampBezel};`;

/** Dirty ends on a strip of tape. After the tape's own `background`, never before. */
export const GRUBBY = `background-image:${ink.tapeGrime};`;

/** A stained corner on the paper tag. After its own `background`. */
export const STAINED = `background-image:${ink.tipGrime};`;
