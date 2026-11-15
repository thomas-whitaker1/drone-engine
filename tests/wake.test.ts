// @vitest-environment happy-dom
//
// The lever. Two things are decidable about it and this asserts both.
//
// The **anatomy** is pinned to the original design the way the board's is, so
// a slipped digit fails here rather than surviving until someone notices the
// handle no longer fills its slot.
//
// The **sequence** is the part with teeth. A pull is three moments — the throw,
// the engine, the unmount — and every one of them is a timer, so the suite drives
// the clock by hand and checks each moment on the tick before it as well as on
// it. The double-fire guard gets the same treatment: a 0.3s throw is long enough
// for a second click, and a second engine would be a second copy of the entire
// board's audio graph.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARD, WAKE } from '../src/ui/constants';
import { createWakeScreen } from '../src/ui';
import type { WakeHandle } from '../src/ui';
import { fonts, ink, plate, surfaces, textureLayers } from '../src/tokens';

const live: WakeHandle[] = [];

/** A mounted wake screen with both callbacks recorded. */
function build(): { handle: WakeHandle; starts: number; dones: number } {
  const counts = { starts: 0, dones: 0 };
  const handle = createWakeScreen({
    onStart: () => (counts.starts += 1),
    onDone: () => (counts.dones += 1),
  });
  live.push(handle);
  document.body.appendChild(handle.element);
  return {
    handle,
    get starts() {
      return counts.starts;
    },
    get dones() {
      return counts.dones;
    },
  };
}

const part = (root: HTMLElement, name: string): HTMLElement | null =>
  root.querySelector<HTMLElement>(`[data-part="${name}"]`);

const parts = (root: HTMLElement, name: string): HTMLElement[] => [
  ...root.querySelectorAll<HTMLElement>(`[data-part="${name}"]`),
];

const css = (element: HTMLElement | null, property: string): string =>
  element?.style.getPropertyValue(property) ?? '';

/** The DOM re-serializes a gradient with spaces after its commas; tokens do not. */
const tight = (value: string): string => value.replace(/,\s+/g, ',');

/** The DOM also re-quotes a font family name in double quotes; the tokens use single. */
const family = (value: string): string => tight(value).replace(/'/g, '"');

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const handle of live.splice(0)) handle.destroy();
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('the wake screen', () => {
  it('covers the whole viewport above every other layer', () => {
    const { handle } = build();

    expect(css(handle.element, 'position')).toBe('fixed');
    for (const edge of ['left', 'top', 'right', 'bottom']) {
      expect(css(handle.element, edge)).toBe('0px');
    }
    expect(css(handle.element, 'z-index')).toBe('100');
    expect(css(handle.element, 'background')).toBe(surfaces.wakeOverlay);
    expect(css(handle.element, 'place-items')).toBe('center');
  });

  it('cannot be selected as text, so a press that drags is not a highlight (gt#73)', () => {
    const { handle } = build();

    expect(handle.element.style.userSelect).toBe('none');
    expect(handle.element.style.cssText).toContain('-webkit-user-select');
  });

  it('lays grain and rust over the flat dark, and nothing else', () => {
    const { handle } = build();
    const skirt = textureLayers.wake;

    expect(css(part(handle.element, 'grain'), 'opacity')).toBe(String(skirt.grain));
    expect(css(part(handle.element, 'grain'), 'mix-blend-mode')).toBe('overlay');
    expect(css(part(handle.element, 'rust'), 'opacity')).toBe(String(skirt.rust));
    expect(css(part(handle.element, 'rust'), 'background-size')).toBe(skirt.rustSize);
    // The board's four layers include verdigris and scratches; the overlay's two do not.
    expect(part(handle.element, 'verdigris')).toBeNull();
    expect(part(handle.element, 'scratches')).toBeNull();
    expect(part(handle.element, 'runs')).toBeNull();
  });

  it('gathers the corrosion at the edges and leaves the lever in the clear', () => {
    // The plate mask at viewport scale would be a hairline, so the same idea
    // arrives as a vignette — the one thing on this screen is in the middle of
    // it, and rust across the middle would be rust across the only gesture the
    // product has (gt#35).
    const { handle } = build();
    const skirt = textureLayers.wake;
    expect(css(part(handle.element, 'rust'), 'mask-image')).toBe(skirt.rustMask);
    expect(css(part(handle.element, 'rust'), '-webkit-mask-image')).toBe(skirt.rustMask);
    expect(skirt.rustMask).not.toContain('radial-gradient');
  });

  it('stands the rust in pools round the frame, not in an even band (gt#89)', () => {
    // An even band of one repeating tile is a row of the same blot every 240
    // pixels. The pools are a second mask over the edge mask: a mask inside a
    // mask multiplies, so rust shows only where both allow it.
    const { handle } = build();
    const skirt = textureLayers.wake;
    const corrosion = part(handle.element, 'corrosion');

    expect(css(corrosion, 'mask-image')).toBe(skirt.rustPools);
    expect(css(corrosion, '-webkit-mask-image')).toBe(skirt.rustPools);
    expect(corrosion?.contains(part(handle.element, 'rust'))).toBe(true);
    expect(corrosion?.contains(part(handle.element, 'rustOver'))).toBe(true);
    expect(corrosion?.style.pointerEvents).toBe('none');

    // Nine pools, no two the same size and none in the middle of the screen,
    // where the one lever is.
    const pools = [...skirt.rustPools.matchAll(/circle at ([\d.]+)% ([\d.]+)%, #000 ([\d.]+)%, rgba\(0,0,0,0\) ([\d.]+)%/g)];
    expect(pools).toHaveLength(9);
    expect(new Set(pools.map((pool) => `${pool[3]}/${pool[4]}`)).size).toBe(pools.length);
    for (const [, x, y] of pools) {
      const fromEdge = Math.min(Number(x), 100 - Number(x), Number(y), 100 - Number(y));
      expect(fromEdge, `${x},${y}`).toBeLessThanOrEqual(10);
    }
  });

  it('lays the tile a second time, turned over, at a size that never lines up with the first', () => {
    const { handle } = build();
    const skirt = textureLayers.wake;
    const over = part(handle.element, 'rustOver');

    expect(css(over, 'background-image')).toBe(css(part(handle.element, 'rust'), 'background-image'));
    expect(css(over, 'background-size')).toBe(skirt.rustOverSize);
    expect(css(over, 'background-position')).toBe(skirt.rustOverPosition);
    expect(css(over, 'transform')).toBe('scaleX(-1)');
    expect(css(over, 'opacity')).toBe(String(skirt.rustOver));
    expect(css(over, 'mask-image')).toBe(skirt.rustMask);

    // No factor in common, so the two rows of blots drift apart and the pair
    // does not repeat inside any window: the distance before it does is the
    // product of the two sizes.
    const [a, b] = [parseInt(skirt.rustSize, 10), parseInt(skirt.rustOverSize, 10)];
    const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
    expect(gcd(a, b)).toBe(1);
    expect(a * b).toBeGreaterThan(8000);
  });

  it('cuts the plate to the size the reference gives it', () => {
    const { handle } = build();
    const slab = part(handle.element, 'plate');

    expect(css(slab, 'width')).toBe(`${WAKE.plate.width}px`);
    expect(css(slab, 'height')).toBe(`${WAKE.plate.height}px`);
    expect(css(slab, 'border-radius')).toBe(`${WAKE.plate.radius}px`);
    expect(tight(css(slab, 'background'))).toBe(plate.wakePlate);
    expect(WAKE.plate).toEqual({ width: 210, height: 330, radius: 8 });
  });

  it('screws the plate down at four corners, slotless', () => {
    const { handle } = build();
    const screws = parts(handle.element, 'screw');

    expect(screws).toHaveLength(4);
    for (const screw of screws) {
      expect(css(screw, 'width')).toBe(`${WAKE.screw.size}px`);
      expect(css(screw, 'border-radius')).toBe('50%');
      expect(tight(css(screw, 'background'))).toBe(tight(plate.screw));
      // A module's screw carries a hairline slot. At this size it would read as dirt.
      expect(part(screw, 'slot')).toBeNull();
    }
    expect(screws.filter((screw) => css(screw, 'left') === `${WAKE.screw.inset}px`)).toHaveLength(2);
    expect(screws.filter((screw) => css(screw, 'right') === `${WAKE.screw.inset}px`)).toHaveLength(2);
  });

  it('cuts the slot down the centre between two equal insets', () => {
    const { handle } = build();
    const slot = part(handle.element, 'slot');

    expect(css(slot, 'width')).toBe(`${WAKE.slot.width}px`);
    expect(css(slot, 'left')).toBe('50%');
    expect(css(slot, 'margin-left')).toBe(`${-WAKE.slot.width / 2}px`);
    expect(css(slot, 'top')).toBe(`${WAKE.slot.inset}px`);
    expect(css(slot, 'bottom')).toBe(`${WAKE.slot.inset}px`);
    expect(css(slot, 'background')).toBe(plate.wakeSlot);
    expect(WAKE.slot.width).toBe(16);
  });

  it('hangs the handle at the top of the slot, ribbed and ready', () => {
    const { handle: screen } = build();
    const handle = part(screen.element, 'handle');

    expect(css(handle, 'top')).toBe(`${WAKE.handle.top}px`);
    expect(css(handle, 'width')).toBe(`${WAKE.handle.width}px`);
    expect(css(handle, 'height')).toBe(`${WAKE.handle.height}px`);
    expect(css(handle, 'border-radius')).toBe(`${WAKE.handle.radius}px`);
    expect(tight(css(handle, 'background'))).toBe(plate.wakeLever);
    expect(tight(css(handle, 'transition'))).toBe(tight(`top ${WAKE.handle.pull}`));

    const grip = part(handle as HTMLElement, 'grip');
    expect(css(grip, 'top')).toBe(`${WAKE.handle.grip.insetY}px`);
    expect(css(grip, 'left')).toBe(`${WAKE.handle.grip.insetX}px`);
    expect(tight(css(grip, 'background'))).toBe(tight(plate.wakeLeverGrip));
  });

  it('tapes one instruction under the plate', () => {
    const { handle } = build();
    const tape = part(handle.element, 'tape');

    expect(tape?.textContent).toBe('WAKE IT');
    expect(css(tape, 'background-color')).toBe(ink.tape);
    expect(css(tape, 'color')).toBe(ink.tapeInk);
    expect(css(tape, 'font-size')).toBe(`${WAKE.tape.fontSize}px`);
    expect(family(css(tape, 'font-family'))).toBe(family(fonts.tape));
    expect(WAKE.tape.fontSize).toBe(30);
  });

  it('says what is about to happen, under the tape, in the board’s hint register', () => {
    const { handle } = build();
    const warning = part(handle.element, 'warning');

    expect(warning?.textContent).toBe('it starts loud, and it flashes — turn it down first');
    expect(css(warning, 'font-size')).toBe(`${WAKE.warning.fontSize}px`);
    expect(css(warning, 'letter-spacing')).toBe(`${WAKE.warning.tracking}px`);
    expect(css(warning, 'line-height')).toBe(String(WAKE.warning.lineHeight));
    expect(tight(css(warning, 'color'))).toBe(ink.stencilHint);
    expect(family(css(warning, 'font-family'))).toBe(family(fonts.body));
    // Cut to the same register as the two hint lines the original design had at
    // the far end of THE FOG, pinned as one row so the size, the tracking and
    // the alpha cannot drift apart: quiet on purpose, because a louder warning
    // would be the dialog this screen exists not to be.
    expect([WAKE.warning.fontSize, WAKE.warning.tracking, ink.stencilHint]).toEqual([
      10,
      1,
      'rgba(206,196,168,0.28)',
    ]);
  });

  describe('on a narrow screen (gt#37)', () => {
    /** Make the window `width` wide, and tell anything listening that it changed. */
    const widen = (width: number): void => {
      Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
      window.dispatchEvent(new Event('resize'));
    };

    afterEach(() => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    });

    it('says nothing more on a screen wide enough for the board', () => {
      widen(1440);
      const narrow = part(build().handle.element, 'narrow');

      expect(narrow?.textContent).toBe('built for a big screen — it will be tiny here');
      expect(narrow?.hidden).toBe(true);
    });

    it('says the board will be tiny where it will be, in the warning’s own lettering', () => {
      widen(390);
      const { handle: screen } = build();
      const narrow = part(screen.element, 'narrow');
      const warning = part(screen.element, 'warning');

      expect(narrow?.hidden).toBe(false);
      for (const property of ['font-size', 'letter-spacing', 'line-height', 'color', 'font-family']) {
        expect(css(narrow, property), property).toBe(css(warning, property));
      }
    });

    it('draws the line where the board falls under half size, and not a pixel before', () => {
      // The board is 1440 wide and scales to fit, so 720 is where it halves.
      expect(WAKE.narrow.below).toBe(BOARD.width / 2);

      widen(WAKE.narrow.below - 1);
      const { handle: screen } = build();
      expect(part(screen.element, 'narrow')?.hidden).toBe(false);

      widen(WAKE.narrow.below);
      expect(part(screen.element, 'narrow')?.hidden).toBe(true);
    });

    it('follows the window, so turning a phone on its side takes the line away', () => {
      widen(390);
      const { handle: screen } = build();
      const narrow = part(screen.element, 'narrow');
      expect(narrow?.hidden).toBe(false);

      widen(844);
      expect(narrow?.hidden).toBe(true);
      widen(390);
      expect(narrow?.hidden).toBe(false);
    });

    it('is pinned to the foot of the screen, out of the grid and out of the hit area', () => {
      // Out of the grid so that showing it cannot move the lever or the
      // warning; out of the hit area so that reading it cannot pull the lever.
      widen(390);
      const { handle: screen } = build();
      const narrow = part(screen.element, 'narrow');

      expect(narrow?.parentElement).toBe(screen.element);
      expect(part(screen.element, 'assembly')?.contains(narrow)).toBe(false);
      expect(css(narrow, 'position')).toBe('absolute');
      expect(css(narrow, 'bottom')).toBe(`${WAKE.narrow.inset}px`);
      expect(css(narrow, 'pointer-events')).toBe('none');

      narrow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      vi.advanceTimersByTime(WAKE.doneMs);
      expect(screen.pulled).toBe(false);
    });

    it('lets go of the window once the screen is torn down', () => {
      widen(1440);
      const { handle: screen } = build();
      const narrow = part(screen.element, 'narrow');
      screen.destroy();

      widen(390);
      expect(narrow?.hidden).toBe(true);
    });

    it('lets go of the window once the lever has been pulled and the screen is gone', () => {
      widen(1440);
      const { handle: screen } = build();
      const narrow = part(screen.element, 'narrow');
      screen.pull();
      vi.advanceTimersByTime(WAKE.doneMs);

      widen(390);
      expect(narrow?.hidden).toBe(true);
    });
  });

  it('keeps the warning out of the hit area, so reading it cannot start the board', () => {
    // Everything else on this screen is one hit area so the product's only
    // gesture cannot be missed. The warning is the exception: a click aimed at
    // the sentence must not start the thing the sentence is about (gt#44).
    const { handle: screen } = build();
    const warning = part(screen.element, 'warning');

    expect(warning?.parentElement).toBe(screen.element);
    expect(part(screen.element, 'assembly')?.contains(warning)).toBe(false);
    expect(css(warning, 'pointer-events')).toBe('none');

    warning?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    vi.advanceTimersByTime(WAKE.doneMs);

    expect(screen.pulled).toBe(false);
  });

  it('takes a click anywhere on the assembly, not only on the handle', () => {
    const { handle: screen } = build();
    const tape = part(screen.element, 'tape');

    tape?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(screen.pulled).toBe(true);
    expect(css(part(screen.element, 'handle'), 'top')).toBe(`${WAKE.handle.pulled}px`);
  });

  it('throws the handle the length of the slot on the pull', () => {
    const { handle: screen } = build();

    screen.pull();

    expect(css(part(screen.element, 'handle'), 'top')).toBe(`${WAKE.handle.pulled}px`);
    // The pointer stops inviting a second pull the moment the first one lands.
    expect(css(part(screen.element, 'assembly'), 'cursor')).toBe('default');
  });

  it('starts the engine as the handle bottoms out, and not before', () => {
    const screen = build();

    screen.handle.pull();
    vi.advanceTimersByTime(WAKE.startMs - 1);
    expect(screen.starts).toBe(0);
    expect(css(screen.handle.element, 'opacity')).toBe('1');

    vi.advanceTimersByTime(1);
    expect(screen.starts).toBe(1);
    // The fade begins on the same tick, which is what makes doneMs land on zero.
    expect(css(screen.handle.element, 'opacity')).toBe('0');
    expect(tight(css(screen.handle.element, 'transition'))).toBe(tight(WAKE.fade));
  });

  it('unmounts itself when the fade finishes, and says so', () => {
    const screen = build();

    screen.handle.pull();
    vi.advanceTimersByTime(WAKE.doneMs - 1);
    expect(screen.dones).toBe(0);
    expect(screen.handle.element.parentNode).toBe(document.body);

    vi.advanceTimersByTime(1);
    expect(screen.dones).toBe(1);
    expect(screen.handle.element.parentNode).toBeNull();
  });

  it('fades for exactly as long as it waits to unmount', () => {
    expect(WAKE.startMs + WAKE.fadeMs).toBe(WAKE.doneMs);
    expect(WAKE.fade).toContain(`${WAKE.fadeMs / 1000}s`);
  });

  it('builds one engine however many times it is clicked', () => {
    const screen = build();
    const assembly = part(screen.handle.element, 'assembly');

    for (let click = 0; click < 3; click++) {
      assembly?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    screen.handle.pull();
    vi.advanceTimersByTime(WAKE.doneMs);

    expect(screen.starts).toBe(1);
    expect(screen.dones).toBe(1);
  });

  it('cancels the whole sequence when it is destroyed mid-pull', () => {
    const screen = build();

    screen.handle.pull();
    vi.advanceTimersByTime(WAKE.startMs - 1);
    screen.handle.destroy();
    vi.advanceTimersByTime(WAKE.doneMs);

    expect(screen.starts).toBe(0);
    expect(screen.dones).toBe(0);
  });

  it('ignores a click once it has been destroyed', () => {
    const screen = build();
    const assembly = part(screen.handle.element, 'assembly');

    screen.handle.destroy();
    assembly?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    vi.advanceTimersByTime(WAKE.doneMs);

    expect(screen.handle.pulled).toBe(false);
    expect(screen.starts).toBe(0);
  });
});

// The lever as something that is pulled (gt#88).
describe('pulling the lever', () => {
  const throwPx = WAKE.handle.pulled - WAKE.handle.top;
  const handleOf = (screen: WakeHandle): HTMLElement => part(screen.element, 'handle')!;
  const top = (screen: WakeHandle): number => parseFloat(css(handleOf(screen), 'top'));

  /** Press on the lever at a height. Nothing has moved yet. */
  const press = (screen: WakeHandle, y = 100, button = 0): void => {
    part(screen.element, 'assembly')!.dispatchEvent(
      new PointerEvent('pointerdown', { button, bubbles: true, cancelable: true, clientY: y }),
    );
  };
  const move = (y: number): void => {
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: y }));
  };
  const lift = (y: number): void => {
    window.dispatchEvent(new PointerEvent('pointerup', { clientY: y }));
  };
  /** What a browser sends after a press and a release on the same thing. */
  const click = (screen: WakeHandle): void => {
    part(screen.element, 'assembly')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  };

  it('follows the hand down the slot, with nothing in between', () => {
    const screen = build();
    press(screen.handle, 100);

    move(100 + 60);
    expect(top(screen.handle)).toBe(WAKE.handle.top + 60);
    // Under the hand: a transition here would be the handle arriving late.
    expect(css(handleOf(screen.handle), 'transition')).toBe('none');

    move(100 + 90);
    expect(top(screen.handle)).toBe(WAKE.handle.top + 90);
    expect(screen.handle.pulled).toBe(false);
  });

  it('does not take hold until the press has actually moved', () => {
    const screen = build();
    press(screen.handle, 100);

    move(100 + WAKE.drag.slop - 1);

    expect(top(screen.handle)).toBe(WAKE.handle.top);
  });

  it('stays in the slot: it cannot be dragged above its rest', () => {
    const screen = build();
    press(screen.handle, 100);

    move(100 - 80);

    expect(top(screen.handle)).toBe(WAKE.handle.top);
    expect(screen.handle.pulled).toBe(false);
  });

  it('leaves the hand past the point of no return and drops the rest of the way', () => {
    const screen = build();
    press(screen.handle, 100);

    move(100 + Math.ceil(throwPx * WAKE.drag.commit));

    // Thrown, while the button is still down: nobody has to drag the full
    // length of the slot, or let go, to wake the board.
    expect(screen.handle.pulled).toBe(true);
    expect(top(screen.handle)).toBe(WAKE.handle.pulled);
    expect(css(handleOf(screen.handle), 'transition')).toContain(WAKE.handle.pull);

    vi.advanceTimersByTime(WAKE.startMs);
    expect(screen.starts).toBe(1);
    vi.advanceTimersByTime(WAKE.fadeMs);
    expect(screen.dones).toBe(1);
  });

  it('stops following once it has dropped', () => {
    const screen = build();
    press(screen.handle, 100);
    move(100 + throwPx);

    move(100 + 10);
    lift(100 + 10);
    click(screen.handle);

    expect(top(screen.handle)).toBe(WAKE.handle.pulled);
    vi.advanceTimersByTime(WAKE.doneMs);
    expect(screen.starts).toBe(1);
  });

  it('springs back when it is let go short, and nothing has happened', () => {
    const screen = build();
    press(screen.handle, 100);
    move(100 + Math.floor(throwPx * WAKE.drag.commit) - 5);

    lift(100 + 40);

    expect(screen.handle.pulled).toBe(false);
    expect(top(screen.handle)).toBe(WAKE.handle.top);
    expect(css(handleOf(screen.handle), 'transition')).toContain(WAKE.drag.spring);
    // And the click a browser sends after that release does not throw the
    // lever the hand has just declined to throw.
    click(screen.handle);
    expect(screen.handle.pulled).toBe(false);
    vi.advanceTimersByTime(WAKE.doneMs);
    expect(screen.starts).toBe(0);
  });

  it('can be pulled again after being let go, or simply clicked', () => {
    const dragged = build();
    press(dragged.handle, 100);
    move(130);
    lift(130);
    click(dragged.handle);
    press(dragged.handle, 100);
    move(100 + throwPx);
    expect(dragged.handle.pulled).toBe(true);

    const clicked = build();
    press(clicked.handle, 100);
    move(130);
    lift(130);
    click(clicked.handle);
    // A fresh press that does not move is a click, and a click throws it.
    press(clicked.handle, 100);
    lift(100);
    click(clicked.handle);
    expect(clicked.handle.pulled).toBe(true);
  });

  it('still takes a plain click, so nobody can fail to start the board', () => {
    const screen = build();

    press(screen.handle, 100);
    lift(100);
    click(screen.handle);

    expect(screen.handle.pulled).toBe(true);
    expect(top(screen.handle)).toBe(WAKE.handle.pulled);
  });

  it('answers the left button only', () => {
    const screen = build();
    press(screen.handle, 100, 2);

    move(100 + throwPx);

    expect(screen.handle.pulled).toBe(false);
    expect(top(screen.handle)).toBe(WAKE.handle.top);
  });

  it('commits past half way and short of the bottom', () => {
    expect(WAKE.drag.commit).toBeGreaterThan(0.5);
    expect(WAKE.drag.commit).toBeLessThan(0.8);
  });

  it('says it drags, the way every control on the board does, and keeps the page from scrolling under it', () => {
    const screen = build();

    expect(css(handleOf(screen.handle), 'cursor')).toBe('ns-resize');
    expect(css(part(screen.handle.element, 'assembly'), 'touch-action')).toBe('none');
  });

  it('lets go of the window when it is destroyed mid-drag', () => {
    const screen = build();
    press(screen.handle, 100);
    move(120);

    screen.handle.destroy();
    move(100 + throwPx);

    expect(screen.handle.pulled).toBe(false);
    expect(top(screen.handle)).toBe(WAKE.handle.top + 20);
  });
});
