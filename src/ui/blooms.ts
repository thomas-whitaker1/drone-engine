// The flash on a hit. The board's only answer to a single moment: a disc of
// light over the plate that struck, brightest and largest on SLOW HIT, gone
// inside a second and a fifth.
//
// It is the second half of a seam the engine already built. `announce` fires
// `onStrike(id)` at the moment a hit is *heard* rather than the moment it is
// booked — the heartbeat schedules a lookahead ahead of the clock, and a bloom
// that arrived with the scheduling would flash before the sound. This layer is
// the only consumer of that callback, and it reads it and never answers back:
// the same one-way arrow ./atmosphere keeps, for the same reason.
//
// Four things about it are decisions rather than implementation details:
//
// - **It is measured in viewport space, and needs no `--fit` correction.** A
//   bloom is placed at a plate's centre as `getBoundingClientRect` reports it and
//   drawn on a fixed layer, so both ends of the arithmetic are already in the
//   same space. The wire layer divides by `--fit` because its endpoints are
//   plate-relative; nothing here is. It hangs off the page rather than the plate
//   for the reason ./tips does: the plate carries `zoom:var(--fit)`, which scales
//   its fixed children with it.
// - **The cap refuses rather than queues.** See {@link BLOOM.cap}. A refused
//   strike is not deferred, retried or counted — it simply does not flash.
// - **Two frames, then the flip.** A node that is appended and restyled in the
//   same frame has no start value to transition *from*, so the browser jumps
//   straight to the end and nothing animates. One frame gets it into the tree;
//   the second is where its computed style exists to move away from.
// - **Nothing here knows which modules strike.** The layer looks up a colour and
//   falls back when there is none, so the five that bloom are five rows in
//   src/tokens rather than a list in this file — which is what lets the source
//   registry (gt#24) add a sixth without touching it.

import { BLOOM, SMASH } from './constants';
import { box } from './dom';
import { bloom as tokens, sourcePlates } from '../tokens';
import type { SourcePlate } from '../tokens';

/**
 * The `r,g,b` a module blooms in, or the colour that covers anything unlisted.
 *
 * The widening is honest rather than a cast to silence: `strike` accepts whatever
 * the engine announces, which need not name a module at all, so a lookup that can
 * miss is exactly what this is. What it used to be was `id as keyof typeof
 * sourcePlates` — an assertion that the id *is* a module, which made a genuinely
 * missing plate look like a deliberate fallback. That hole is now closed at the
 * table itself (gt#24), so the fallback here covers only the unknown id it was
 * always meant to.
 */
export function bloomColor(id: string): string {
  const plates: Readonly<Record<string, SourcePlate | undefined>> = sourcePlates;
  return plates[id]?.bloom ?? tokens.fallback;
}

/**
 * One bloom, fully styled, at rest — the state it is appended in rather than the
 * state it ends at. Exported because it is the whole of the layer's arithmetic,
 * and a suite can check it against the handoff without running a frame.
 *
 * SLOW HIT is the loudest thing on the board and gets the largest and brightest
 * of the two strengths; everything else shares the other. The `margin` is what
 * centres the disc on the point: half its own size back along both axes, which
 * is cheaper than a transform the animation is already using.
 */
export function bloomStyle(id: string, rect: DOMRect, strength = 1): string {
  const big = id === 'slowhit';
  const size = Math.round((big ? tokens.bigSize : tokens.size) * between(BLOOM.strength.size, strength));
  const paint = `rgba(${bloomColor(id)},${big ? tokens.bigInner : tokens.inner})`;
  const opacity = (big ? tokens.bigOpacity : tokens.opacity) * between(BLOOM.strength.opacity, strength);
  return (
    `position:absolute;pointer-events:none;` +
    `left:${rect.left + rect.width / 2}px;top:${rect.top + rect.height / 2}px;` +
    `width:${size}px;height:${size}px;margin:${-size / 2}px 0 0 ${-size / 2}px;` +
    `border-radius:50%;` +
    `background-image:radial-gradient(circle,${paint} 0%, rgba(0,0,0,0) ${BLOOM.stop}%);` +
    `opacity:${Number(opacity.toFixed(3))};` +
    `transform:scale(${BLOOM.scale.from});transition:${BLOOM.transition};`
  );
}

/**
 * Where a strength of 0–1 lands between a floor and 1 (gt#81). A hit turned
 * nearly off is still a hit — it blooms at the floor rather than not at all —
 * and a hit at full is exactly the bloom the reference draws, which is why a
 * strength of 1 changes nothing above.
 */
const between = (floor: number, strength: number): number =>
  floor + (1 - floor) * Math.min(1, Math.max(0, strength));

/**
 * The front of a hit (gt#81): a thin ring leaving the plate, at rest — the state
 * it is appended in. A bloom is a glow with no edge, on purpose, which means it
 * has no moment of arrival; a ring is one frame of edge, gone in under half a
 * second, and it is what makes a flash read as something having been struck.
 *
 * It starts small and tight on the plate's centre and runs out past the glow's
 * own middle, faster than the glow spreads and gone long before it has faded,
 * so the two are never the same shape at the same time.
 */
export function ringStyle(id: string, rect: DOMRect, strength = 1): string {
  const big = id === 'slowhit';
  const size = Math.round((big ? BLOOM.ring.bigSize : BLOOM.ring.size) * between(BLOOM.strength.size, strength));
  const alpha = Number((BLOOM.ring.alpha * between(BLOOM.strength.opacity, strength)).toFixed(3));
  return (
    `position:absolute;pointer-events:none;box-sizing:border-box;` +
    `left:${rect.left + rect.width / 2}px;top:${rect.top + rect.height / 2}px;` +
    `width:${size}px;height:${size}px;margin:${-size / 2}px 0 0 ${-size / 2}px;` +
    `border-radius:50%;border:${BLOOM.ring.width}px solid rgba(${bloomColor(id)},${alpha});` +
    `opacity:1;transform:scale(${BLOOM.ring.from});` +
    `transition:opacity ${BLOOM.ring.ms}ms ease-out, transform ${BLOOM.ring.ms}ms cubic-bezier(0.1,0.7,0.3,1);`
  );
}

/**
 * How far the shockwave has to run (gt#92): from a point to the farthest corner
 * of the window. The ring is drawn to exactly this radius, so it leaves the
 * screen everywhere at once rather than stopping short in one corner.
 */
export const shockRadius = (x: number, y: number, width: number, height: number): number =>
  Math.hypot(Math.max(x, width - x), Math.max(y, height - y));

/**
 * When the front reaches something `distance` away, in ms after the blow. The
 * front moves at one speed — see {@link SMASH.shock} — so this is the distance
 * as a share of the radius, and nothing further away than the radius waits any
 * longer than the ring itself takes.
 */
export const shockDelay = (distance: number, radius: number): number =>
  radius > 0 ? Math.round(SMASH.shock.ms * Math.min(1, Math.max(0, distance) / radius)) : 0;

/** How hard the front hits something `distance` away, from 1 at the anvil. */
export const shockStrength = (distance: number, radius: number): number =>
  radius > 0 ? 1 - SMASH.shock.falloff * Math.min(1, Math.max(0, distance) / radius) : 1;

/**
 * The shockwave's ring (gt#92), at rest: a point on the anvil, sized to reach the
 * farthest corner of the window when it is let go. Drawn in the drum's own
 * bloom colour, because the hammer is the heaviest drum on the board.
 */
export function shockStyle(x: number, y: number, radius: number): string {
  const size = Math.round(radius * 2);
  const { width, alpha, from, ms } = SMASH.shock;
  return (
    `position:absolute;pointer-events:none;box-sizing:border-box;` +
    `left:${x}px;top:${y}px;width:${size}px;height:${size}px;` +
    `margin:${-size / 2}px 0 0 ${-size / 2}px;border-radius:50%;` +
    `border:${width}px solid rgba(${bloomColor('slowhit')},${alpha});` +
    `opacity:1;transform:scale(${from});` +
    // Linear, both of them: a front that eased would arrive at each plate at a
    // time only the curve knew, and the plates are timed off distance alone.
    `transition:opacity ${ms}ms ease-in, transform ${ms}ms linear;`
  );
}

export interface BloomLayerSpec {
  /** The plate. The only place a module's rect is looked for. */
  readonly board: HTMLElement;
}

export interface BloomLayerHandle {
  /** The layer. Mounted by the caller, on the page rather than on the plate. */
  readonly element: HTMLElement;

  /**
   * A strike was heard. Flashes over that module's plate, or does nothing at all
   * — an unknown id, a module not on the board, a layer already full, or a board
   * that has been stilled.
   *
   * `strength` is how hard, 0–1 (gt#81): how loud the module is set, as the seam
   * reads it off the board. It sizes and brightens the glow and the ring between
   * a floor and the reference's own bloom, and is 1 when nobody says.
   */
  strike(id: string, strength?: number): void;

  /**
   * The hammer landed (gt#92). One ring off the anvil and out past every corner
   * of the window. Refused on the same terms a strike is — stilled, torn down,
   * no anvil on the plate — and when {@link SMASH.shock.cap} are already
   * crossing the board.
   */
  blast(): void;

  /**
   * STILLNESS moved (gt#33). Stilled, a strike is refused exactly the way the cap
   * refuses one: not queued, not deferred, not counted — the sound still happens
   * and the light does not. Releasing it does not replay anything.
   *
   * The engine is not told, and there is nothing here that could tell it. A board
   * with the flashes turned off is a board that sounds precisely the same.
   */
  setStill(still: boolean): void;

  /** Drop every bloom in flight and the timers that would have removed them. */
  destroy(): void;
}

/** Build the bloom layer. Empty until something is struck, and empty again after. */
export function createBloomLayer(spec: BloomLayerSpec): BloomLayerHandle {
  const timers = new Set<ReturnType<typeof setTimeout>>();

  // A strike is announced a lookahead *ahead* of the moment it is heard, so a hit
  // booked before the page was torn down can still arrive after it. Torn down, the
  // layer stops accepting rather than flashing onto a plate nobody is looking at.
  let torn = false;

  // The board has been pinned. Refused for the same reason and in the same place
  // as the cap and the teardown: before a rect is read, because reading one is
  // the expensive half and a stilled board will never use the answer.
  let still = false;

  /**
   * The glows in flight, which is what the cap counts (gt#81). Not the layer's
   * children: each hit is two nodes now, and a cap of ten that counted rings
   * would be a cap of five.
   */
  const glows = new Set<HTMLElement>();

  /** The shockwaves in flight (gt#92), counted apart from the glows and capped apart. */
  const shocks = new Set<HTMLElement>();

  /** Run something later, on a timer STILLNESS and teardown can take back. */
  const after = (ms: number, run: () => void): void => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      run();
    }, ms);
    timers.add(timer);
  };

  const element = box(
    'blooms',
    `position:fixed;left:0;top:0;right:0;bottom:0;pointer-events:none;` +
      `z-index:${BLOOM.zIndex};`,
  );

  return {
    element,
    strike(id: string, strength = 1): void {
      // Refused rather than queued, and refused before anything is measured:
      // reading a rect is the expensive half, and a rattle at full FRENZY is
      // exactly when it should not be paid for a flash nobody will see.
      if (torn || still || glows.size >= BLOOM.cap) return;
      const plate = spec.board.querySelector(`[data-module="${id}"]`);
      if (!plate) return;

      // One read for both: the glow and its front leave from the same point.
      const rect = plate.getBoundingClientRect();
      const node = box('bloom', bloomStyle(id, rect, strength), element);
      const ring = box('ring', ringStyle(id, rect, strength), element);
      glows.add(node);

      // Two frames before the flip. One to land in the tree, one for the style
      // it lands at to become something the transition can move away from.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          node.style.opacity = '0';
          node.style.transform = `scale(${BLOOM.scale.to})`;
          ring.style.opacity = '0';
          ring.style.transform = `scale(${BLOOM.ring.to})`;
        }),
      );

      after(BLOOM.removeMs, () => {
        glows.delete(node);
        node.remove();
      });
      // The front is gone long before the glow is, and comes off the page when
      // it is — a ring left in the tree at zero opacity is still a node.
      after(BLOOM.ring.ms + BLOOM.ring.slackMs, () => ring.remove());
    },
    blast(): void {
      if (torn || still || shocks.size >= SMASH.shock.cap) return;
      const anvil = spec.board.querySelector('[data-part="anvil"]');
      if (!anvil) return;

      const rect = anvil.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const radius = shockRadius(x, y, window.innerWidth, window.innerHeight);
      const ring = box('shock', shockStyle(x, y, radius), element);
      shocks.add(ring);

      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          ring.style.opacity = '0';
          ring.style.transform = 'scale(1)';
        }),
      );
      after(SMASH.shock.ms + SMASH.shock.slackMs, () => {
        shocks.delete(ring);
        ring.remove();
      });
    },
    setStill(next: boolean): void {
      still = next;
      // Anything already in flight is taken down rather than left to finish. A
      // switch pressed mid-rattle that let ten discs go on spreading would be
      // answering a second too late to be the switch it says it is.
      if (!still) return;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      glows.clear();
      shocks.clear();
      while (element.firstChild) element.removeChild(element.firstChild);
    },
    destroy(): void {
      torn = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      glows.clear();
      shocks.clear();
      while (element.firstChild) element.removeChild(element.firstChild);
    },
  };
}
