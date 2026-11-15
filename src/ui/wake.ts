// The first thing anyone sees, and the last thing they think about.
//
// A browser will not open an AudioContext without a user gesture, so something
// has to be clicked before the board can make a sound. The design's answer is
// not a dialog with a START button — it is one enormous lever, which turns the
// constraint into the introduction: the product's whole claim is that turning a
// physical thing makes a noise, and this is that claim with a single control on
// screen and one quiet line under it.
//
// That line is the screen's one concession and it was argued for rather than
// added (gt#44): there is nothing here to dismiss, no checkbox and no OK button,
// but there is a sentence saying what the lever is about to do, because this is
// the only moment that exists before the board is loud. See where it is built
// for why it sits outside the hit area.
//
// Like every other component here it owns appearance and gesture and no state.
// What the pull *does* is the caller's: this file drops the handle, waits, and
// says when. Two consequences worth stating:
//
// - **The sequence is the component, not the caller's.** `onStart` fires when the
//   handle has bottomed out and `onDone` when the overlay is gone. A caller that
//   had to schedule those itself would be reimplementing the animation's timing
//   in a second place, and the two would drift.
// - **The pull is idempotent.** A lever with a 0.3s throw is a lever that can be
//   clicked three times, and the second click must not build a second engine.
//   Everything after the first pull is ignored, by the component rather than by
//   whatever it calls.
//
// And since gt#88 the lever is *pulled*. Press anywhere on it and drag down: the
// handle follows the hand, and past {@link WAKE.drag.commit} of its throw it
// leaves the hand and drops the rest of the way. Let go short of that and it
// springs back, and nothing has happened. It is the same gesture every control
// on the board behind it answers, in the direction a lever goes — which makes
// the wake screen the board's first lesson instead of a button in front of it.
// A plain click still throws it. Nobody should be able to fail to start this.

import { GRIME, WAKE } from './constants';
import { box, masked, stretched, unselectable } from './dom';
import { GRUBBY, scuffed, tarnished } from './grime';
import { WAKE_LABEL, WAKE_NARROW, WAKE_WARNING } from './words';
import { fonts, ink, plate, surfaces, textureLayers } from '../tokens';

export interface WakeSpec {
  /**
   * The handle has bottomed out. Build the engine, start it, and push the board's
   * state into it — this is the callback the whole screen exists for, and it runs
   * inside the gesture's own task so the browser still counts it as one.
   */
  readonly onStart?: () => void;

  /** The overlay has faded and unmounted. The board is awake and on its own. */
  readonly onDone?: () => void;
}

export interface WakeHandle {
  /** The overlay. Removed from its parent once the sequence finishes. */
  readonly element: HTMLElement;
  /** Whether the lever has been thrown. False only before the first click. */
  readonly pulled: boolean;
  /** Throw it from code. The same path the click takes, guard included. */
  pull(): void;
  /** Drop the listener and cancel anything still pending. Fires no callbacks. */
  destroy(): void;
}

/** One full-viewport texture layer over the overlay's flat dark. */
const texture = (parent: HTMLElement, part: string, style: string): HTMLElement =>
  box(part, `${stretched()}${style}pointer-events:none;`, parent);

/** Build the wake screen. Nothing happens until the lever is pulled, or clicked. */
export function createWakeScreen(spec: WakeSpec = {}): WakeHandle {
  const skirt = textureLayers.wake;

  let pulled = false;
  const timers: ReturnType<typeof setTimeout>[] = [];

  // Fixed rather than absolute, and above every layer the visual system adds:
  // until the lever is pulled this is the entire page, whatever is behind it.
  const element = box(
    'wake',
    `position:fixed;left:0;top:0;right:0;bottom:0;z-index:100;display:grid;place-items:center;` +
      `background:${surfaces.wakeOverlay};opacity:1;transition:${WAKE.fade};${unselectable()}`,
  );

  texture(element, 'grain', `background-image:var(--grainTex);opacity:${skirt.grain};mix-blend-mode:overlay;`);
  // At viewport scale the plate mask would be a hairline, so the same idea
  // arrives as a vignette: the corrosion gathers at the edges of the screen and
  // leaves the middle — where the one lever is — clean (gt#35).
  //
  // And it stands in pools rather than in a band (gt#89). The edge mask alone let
  // one tile repeat round the whole frame at one density, which is a row of the
  // same blot every 240 pixels. `corrosion` is masked to the pools; the two
  // passes inside it are each masked to the edges, and a mask inside a mask
  // multiplies — so rust shows only where both allow it. Nesting does that in
  // every engine, where compositing two masks on one element still wants a
  // prefix in one of them.
  const corrosion = texture(element, 'corrosion', masked(skirt.rustPools));
  texture(
    corrosion,
    'rust',
    `background-image:var(--rustTex);background-size:${skirt.rustSize};` +
      `${masked(skirt.rustMask)}opacity:${skirt.rust};`,
  );
  // The same tile again, turned over, at a size with no factor in common with
  // the first and started somewhere else.
  texture(
    corrosion,
    'rustOver',
    `background-image:var(--rustTex);background-size:${skirt.rustOverSize};` +
      `background-position:${skirt.rustOverPosition};transform:scaleX(-1);` +
      `${masked(skirt.rustMask)}opacity:${skirt.rustOver};`,
  );

  // Plate and tape together are the hit area. Aiming for the handle would make
  // the one gesture in the product the one that can be missed.
  // `touch-action:none` because the gesture is a vertical drag (gt#88), and on a
  // touch screen an element that has not said so hands that drag to the page.
  const assembly = box(
    'assembly',
    `display:flex;flex-direction:column;align-items:center;gap:${WAKE.column.gap}px;cursor:pointer;` +
      `touch-action:none;`,
    element,
  );

  const slab = box(
    'plate',
    `position:relative;width:${WAKE.plate.width}px;height:${WAKE.plate.height}px;` +
      `background:${plate.wakePlate};border:${plate.wakeBorder};border-radius:${WAKE.plate.radius}px;` +
      `box-shadow:${plate.wakePlateShadow};`,
    assembly,
  );
  // The lever's own plate was the one clean sheet of metal in the product: the
  // screen round it is grained and rusted and the plate was not. Scratched
  // (gt#118), first, so the screws, the slot and the handle are all over it.
  scuffed(slab, 'wake', GRIME.wake, `${WAKE.plate.radius}px`);

  for (const [x, y] of [
    ['left', 'top'],
    ['right', 'top'],
    ['left', 'bottom'],
    ['right', 'bottom'],
  ] as const) {
    box(
      'screw',
      `position:absolute;${x}:${WAKE.screw.inset}px;${y}:${WAKE.screw.inset}px;` +
        `width:${WAKE.screw.size}px;height:${WAKE.screw.size}px;border-radius:50%;` +
        `background:${plate.screw};`,
      slab,
    );
  }

  box(
    'slot',
    `position:absolute;left:50%;top:${WAKE.slot.inset}px;bottom:${WAKE.slot.inset}px;` +
      `width:${WAKE.slot.width}px;margin-left:${-WAKE.slot.width / 2}px;background:${plate.wakeSlot};` +
      `border-radius:${WAKE.slot.radius}px;box-shadow:${plate.wakeSlotShadow};`,
    slab,
  );

  // The overshoot in the easing is the point: the handle arrives past its stop
  // and settles back, which is what a weighted lever does and a slider does not.
  const handle = box(
    'handle',
    `position:absolute;left:50%;transform:translateX(-50%);top:${WAKE.handle.top}px;` +
      `width:${WAKE.handle.width}px;height:${WAKE.handle.height}px;` +
      `border-radius:${WAKE.handle.radius}px;background:${plate.wakeLever};` +
      // The cursor every control on the board carries: this one drags too (gt#88).
      `box-shadow:${plate.wakeLeverShadow};transition:top ${WAKE.handle.pull};cursor:ns-resize;`,
    slab,
  );

  // A dull patch on the handle (gt#118), under the grip's ribs: it is the one
  // thing on this screen a hand goes to.
  tarnished(handle, 'wake', `${WAKE.handle.radius}px`);
  box(
    'grip',
    `position:absolute;top:${WAKE.handle.grip.insetY}px;bottom:${WAKE.handle.grip.insetY}px;` +
      `left:${WAKE.handle.grip.insetX}px;right:${WAKE.handle.grip.insetX}px;` +
      `border-radius:${WAKE.handle.grip.radius}px;background:${plate.wakeLeverGrip};`,
    handle,
  );

  const tape = box(
    'tape',
    `background:${ink.tape};${GRUBBY}color:${ink.tapeInk};font-family:${fonts.tape};` +
      `font-size:${WAKE.tape.fontSize}px;padding:${WAKE.tape.padding};` +
      `box-shadow:${ink.wakeTapeShadow};`,
    assembly,
  );
  tape.textContent = WAKE_LABEL;

  // The one thing on this board that is read before the act instead of after it,
  // and it is a deliberate exception rather than a lapse (gt#44).
  //
  // The rule everywhere else — one word on tape, the plain line only on hover —
  // works because every other gesture here is quiet and undoable. This one is
  // neither: the board boots already playing into whatever the system volume
  // happens to be, and gt#39's shelf will put a strobe on the heartbeat. After is
  // too late for both. So the screen spends its silence saying what is about to
  // happen, in the same register as the hints it says nothing else in.
  //
  // **It is not part of the assembly, and that is the point.** The plate and the
  // tape are one hit area so that the product's only gesture cannot be missed;
  // this line is outside it so that a click aimed at the warning does not start
  // the thing being warned about. It is a second grid row of the overlay rather
  // than a third child of the column for exactly that reason — the layout is
  // downstream of the hit area here, not the other way round.
  const warning = box(
    'warning',
    `margin-top:${WAKE.warning.gap}px;font-family:${fonts.body};` +
      `font-size:${WAKE.warning.fontSize}px;letter-spacing:${WAKE.warning.tracking}px;` +
      `line-height:${WAKE.warning.lineHeight};color:${ink.stencilHint};` +
      `text-align:center;pointer-events:none;`,
    element,
  );
  warning.textContent = WAKE_WARNING;

  // And one more line where the board is about to come out too small to use
  // (gt#37). Out of the hit area for the warning's reason, and out of the grid
  // altogether, so that showing it moves nothing else on the screen.
  const narrow = box(
    'narrow',
    `position:absolute;left:${WAKE.narrow.inset}px;right:${WAKE.narrow.inset}px;bottom:${WAKE.narrow.inset}px;` +
      `font-family:${fonts.body};font-size:${WAKE.warning.fontSize}px;` +
      `letter-spacing:${WAKE.warning.tracking}px;line-height:${WAKE.warning.lineHeight};` +
      `color:${ink.stencilHint};text-align:center;pointer-events:none;`,
    element,
  );
  narrow.textContent = WAKE_NARROW;
  const fitNarrow = (): void => {
    narrow.hidden = !(window.innerWidth < WAKE.narrow.below);
  };
  fitNarrow();
  window.addEventListener('resize', fitNarrow);

  const at = (delay: number, run: () => void): void => {
    timers.push(setTimeout(run, delay));
  };

  const pull = (): void => {
    if (pulled) return;
    pulled = true;
    // Wherever the handle is — at rest, or part way down in a hand — it goes to
    // the bottom on the pull's own easing, overshoot and all.
    handle.style.transition = `top ${WAKE.handle.pull}`;
    handle.style.top = `${WAKE.handle.pulled}px`;
    assembly.style.cursor = 'default';
    handle.style.cursor = 'default';

    at(WAKE.startMs, () => {
      spec.onStart?.();
      element.style.opacity = '0';
    });
    at(WAKE.doneMs, () => {
      window.removeEventListener('resize', fitNarrow);
      element.remove();
      spec.onDone?.();
    });
  };

  // ------------------------------------------------------------------ the drag

  /** How far the handle travels, top of the slot to the bottom of it. */
  const throwPx = WAKE.handle.pulled - WAKE.handle.top;

  /** Take the window listeners of a drag in progress back. Null when there is none. */
  let releaseDrag: (() => void) | null = null;

  /**
   * A drag that ended short has just let the handle go. The browser follows the
   * press and release with a click, and that click must not throw the lever the
   * hand has just declined to throw.
   */
  let declined = false;

  const onPointerDown = (event: PointerEvent): void => {
    if (pulled || event.button !== 0) return;
    const startY = event.clientY;
    let held = false;
    declined = false;

    const onMove = (move: PointerEvent): void => {
      const down = move.clientY - startY;
      if (!held && Math.abs(down) < WAKE.drag.slop) return;
      held = true;
      const travel = Math.min(throwPx, Math.max(0, down));
      // Under the hand, with nothing in between: a transition here would be the
      // handle arriving late at wherever the pointer already is.
      handle.style.transition = 'none';
      handle.style.top = `${WAKE.handle.top + travel}px`;
      // Past the point of no return it leaves the hand and falls.
      if (travel / throwPx >= WAKE.drag.commit) {
        releaseDrag?.();
        pull();
      }
    };

    const onUp = (): void => {
      releaseDrag?.();
      if (!held) return; // A press that never moved: the click that follows throws it.
      declined = true;
      handle.style.transition = `top ${WAKE.drag.spring}`;
      handle.style.top = `${WAKE.handle.top}px`;
    };

    releaseDrag = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      releaseDrag = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const onClick = (): void => {
    if (declined) {
      declined = false;
      return;
    }
    pull();
  };
  assembly.addEventListener('pointerdown', onPointerDown);
  assembly.addEventListener('click', onClick);

  return {
    element,
    get pulled() {
      return pulled;
    },
    pull,
    destroy(): void {
      releaseDrag?.();
      window.removeEventListener('resize', fitNarrow);
      assembly.removeEventListener('pointerdown', onPointerDown);
      assembly.removeEventListener('click', onClick);
      for (const timer of timers) clearTimeout(timer);
      timers.length = 0;
    },
  };
}
