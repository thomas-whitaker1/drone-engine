// @vitest-environment happy-dom
//
// The one control every knob, fader, selector, valve wheel, lever and toggle bank
// on the board is an instance of. Almost all of it is decidable — where a pointer
// bar points, how far 150px of drag moves a value, whether a bare click counts as
// wear — so it is pinned down here rather than left to the hand.
//
// The four kinds the original design ships are pinned to its numbers; the two
// gt#34 added have no reference to pin to, so what is pinned for them instead is
// that they answer the same gesture as the other four and carry their own wear
// tell. See `the shared shell` at the bottom, which is the one describe block
// that must name every kind there is.
//
// The geometry is pinned to the original design's control the way the engine's
// coefficients are pinned to its engine: a slipped digit fails the suite rather
// than surviving until someone notices a knob sits crooked.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CAPTION,
  CONTROL_SIZE,
  DRAG,
  FADER,
  GAUGE,
  KNOB,
  KNOB_SWEEP,
  LEVER,
  SELECTOR,
  TAPE,
  TRAVEL,
  TRAVEL_VAR,
  TOGGLES,
  VALVE,
  VALVE_SWEEP,
  WHEEL,
} from '../src/ui/constants';
import { createControl, tickAngles, wearOpacity } from '../src/ui';
import { gaugeReach } from '../src/ui/control';
import type { GaugeSpec } from '../src/ui/control';
import type { ControlHandle, ControlKind, ControlSpec } from '../src/ui';
import { controls, toggle, wear } from '../src/tokens';

/** The five HOW OFTEN words — the reason a selector shows words at all. */
const OFTEN = ['constantly', 'often', 'now and then', 'rarely', 'almost never'] as const;

/**
 * Every kind there is. A new one added to {@link ControlKind} and not to this list
 * is a kind that never gets asked whether it answers the board's one gesture.
 */
const KINDS: readonly ControlKind[] = ['knob', 'fader', 'selector', 'wheel', 'lever', 'toggles'];

/**
 * The kinds that can hold a position rather than an amount — a selector always
 * does, a lever and a bank do when they are given steps. These are the three that
 * have to be checked for digits.
 */
const STEPPED: readonly ControlKind[] = ['selector', 'lever', 'toggles'];

const live: ControlHandle[] = [];

interface Gesture {
  handle: ControlHandle;
  values: number[];
  commits: string[];
  readonly presses: number;
}

/** A mounted control with the fields every test would otherwise repeat. */
function build(spec: Partial<ControlSpec> = {}): Gesture {
  const values: number[] = [];
  const commits: string[] = [];
  let presses = 0;
  const handle = createControl({
    kind: 'knob',
    scope: 'guitar',
    param: 'char',
    label: 'CROWD',
    value: 0.5,
    ...spec,
    onPress: () => {
      presses += 1;
    },
    onInput: (value) => values.push(value),
    onCommit: (key) => commits.push(key),
  });
  live.push(handle);
  document.body.appendChild(handle.element);
  return {
    handle,
    values,
    commits,
    get presses() {
      return presses;
    },
  };
}

/** The DOM re-serializes a gradient with spaces after its commas; tokens do not. */
const tight = (value: string | undefined): string => (value ?? '').replace(/,\s+/g, ',');

const part = (handle: ControlHandle, name: string): HTMLElement | null =>
  handle.element.querySelector<HTMLElement>(`[data-part="${name}"]`);

const parts = (handle: ControlHandle, name: string): HTMLElement[] => [
  ...handle.element.querySelectorAll<HTMLElement>(`[data-part="${name}"]`),
];

/** Whichever piece of this kind carries the rotation. */
const turned = (handle: ControlHandle): HTMLElement | null =>
  part(handle, handle.element.dataset.kind === 'wheel' ? 'assembly' : 'dial');

function press(handle: ControlHandle, clientY = 300, button = 0): void {
  handle.element.dispatchEvent(
    new PointerEvent('pointerdown', { clientY, button, bubbles: true, cancelable: true }),
  );
}

const moveTo = (clientY: number): void => {
  window.dispatchEvent(new PointerEvent('pointermove', { clientY, bubbles: true }));
};

const lift = (): void => {
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
};

const spin = (handle: ControlHandle, deltaY: number): void => {
  handle.element.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }));
};

/** A whole gesture: press at 300, drag `dy` pixels upward, release. */
function drag(handle: ControlHandle, dy: number): void {
  press(handle, 300);
  moveTo(300 - dy);
  lift();
}

afterEach(() => {
  vi.useRealTimers();
  while (live.length) live.pop()?.destroy();
  document.body.innerHTML = '';
});

describe('control geometry', () => {
  it('sweeps a knob across the 264 degrees the reference cuts it to', () => {
    const { handle } = build({ kind: 'knob', value: 0 });
    expect(turned(handle)?.style.transform).toBe('rotate(-132deg)');
    handle.setValue(0.5);
    expect(turned(handle)?.style.transform).toBe('rotate(0deg)');
    handle.setValue(1);
    expect(turned(handle)?.style.transform).toBe('rotate(132deg)');
  });

  it('turns a valve wheel through 320 degrees instead, with no centre detent', () => {
    const { handle } = build({ kind: 'wheel', value: 0, diameter: 112 });
    expect(turned(handle)?.style.transform).toBe('rotate(0deg)');
    handle.setValue(0.5);
    expect(turned(handle)?.style.transform).toBe(`rotate(${VALVE_SWEEP / 2}deg)`);
    handle.setValue(1);
    expect(turned(handle)?.style.transform).toBe(`rotate(${VALVE_SWEEP}deg)`);
  });

  it('gives a selector one tick per step, at the angle that step points to', () => {
    expect(tickAngles(5)).toEqual([-132, -66, 0, 66, 132]);
    expect(tickAngles(6)).toEqual([-132, -79, -26, 26, 79, 132]);
    expect(tickAngles(4)).toEqual([-132, -44, 44, 132]);

    const { handle } = build({ kind: 'selector', steps: 5, words: OFTEN, value: 0 });
    expect(parts(handle, 'tick').map((arm) => arm.style.transform)).toEqual(
      tickAngles(5).map((angle) => `rotate(${angle}deg)`),
    );
    expect(parts(handle, 'dot')).toHaveLength(5);
  });

  it('travels a fader its height minus the cap, bottom-up', () => {
    const height = 64;
    const { handle } = build({ kind: 'fader', label: 'HOW LOUD', height, value: 0 });
    const cap = part(handle, 'cap');
    expect(cap?.style.bottom).toBe('0px');
    handle.setValue(1);
    expect(cap?.style.bottom).toBe(`${height - FADER.capHeight}px`);
    handle.setValue(0.5);
    expect(cap?.style.bottom).toBe(`${Math.round((height - FADER.capHeight) / 2)}px`);
  });

  it('throws a lever its height minus the bar, bottom-up like everything else', () => {
    const height = 64;
    const { handle } = build({ kind: 'lever', label: 'GRIT', height, value: 0 });
    const bar = part(handle, 'bar');
    expect(bar?.style.bottom).toBe('0px');
    handle.setValue(1);
    expect(bar?.style.bottom).toBe(`${height - LEVER.barHeight}px`);
    handle.setValue(0.5);
    expect(bar?.style.bottom).toBe(`${Math.round((height - LEVER.barHeight) / 2)}px`);
  });

  it('cuts a ratchet notch per step, where that step throws the bar to', () => {
    const height = 72;
    const stepped = build({ kind: 'lever', steps: 5, words: OFTEN, height, value: 0 });
    expect(parts(stepped.handle, 'notch').map((notch) => notch.style.bottom)).toEqual(
      [0, 0.25, 0.5, 0.75, 1].map(
        (atStep) => `${Math.round(atStep * (height - LEVER.barHeight))}px`,
      ),
    );
    // Every notch is a rest position: throw the bar to a step and it lands on one.
    const bar = part(stepped.handle, 'bar');
    for (const [step, notch] of parts(stepped.handle, 'notch').entries()) {
      stepped.handle.setValue(step);
      expect(bar?.style.bottom, `step ${step}`).toBe(notch.style.bottom);
    }
  });

  it('leaves a continuous lever a smooth slot, having no scale to cut', () => {
    // The selector's rule, applied to a slot: dots are the scale rather than
    // decoration, so a control with no steps has nothing to draw.
    expect(parts(build({ kind: 'lever', value: 0.4 }).handle, 'notch')).toEqual([]);
    expect(part(build({ kind: 'lever' }).handle, 'slot')).not.toBeNull();
  });

  it('flips one more bat per step up the toggle bank, and none at rest', () => {
    const { handle } = build({ kind: 'toggles', steps: 6, words: OFTEN, value: 0 });
    const up = (): number =>
      parts(handle, 'bat').filter((bat) => bat.style.top === `${TOGGLES.bat.on}px`).length;

    // Five bats for six positions, so all-down and all-up are both reachable and
    // the value is exactly how many stand up.
    expect(parts(handle, 'bat')).toHaveLength(5);
    for (const step of [0, 1, 2, 3, 4, 5]) {
      handle.setValue(step);
      expect(up(), `step ${step}`).toBe(step);
    }
    handle.setValue(0);
    expect(parts(handle, 'bat').map((bat) => bat.style.top)).toEqual(
      Array.from({ length: 5 }, () => `${TOGGLES.bat.off}px`),
    );
  });

  it('gives a continuous bank a fixed row it rounds onto instead', () => {
    const { handle } = build({ kind: 'toggles', value: 0 });
    const up = (): number =>
      parts(handle, 'bat').filter((bat) => bat.style.top === `${TOGGLES.bat.on}px`).length;
    expect(parts(handle, 'bat')).toHaveLength(TOGGLES.handles);
    expect(up()).toBe(0);
    handle.setValue(0.5);
    expect(up()).toBe(TOGGLES.handles / 2);
    handle.setValue(1);
    expect(up()).toBe(TOGGLES.handles);
  });

  it('builds each bat out of the same parts bin as a module’s power nub', () => {
    // Not a new token: a bat handle on this board is the power switch at two
    // thirds the size, and painting it differently would say it was a new part.
    const { handle } = build({ kind: 'toggles', steps: 4, words: OFTEN });
    expect(tight(part(handle, 'well')?.style.background)).toBe(toggle.well);
    expect(tight(part(handle, 'bat')?.style.background)).toBe(toggle.nub);
    expect(parts(handle, 'well')).toHaveLength(3);
  });

  it('opens the wear halo over 45 drags and stops at .9', () => {
    expect(wearOpacity(0)).toBe(0);
    expect(wearOpacity(wear.turnsToFull / 2)).toBeCloseTo(0.5);
    expect(wearOpacity(wear.turnsToFull)).toBe(wear.maxOpacity);
    expect(wearOpacity(400)).toBe(wear.maxOpacity);

    const { handle } = build({ kind: 'knob', wearTurns: 9 });
    expect(part(handle, 'wear')?.style.opacity).toBe('0.2');
    handle.setWear(90);
    expect(part(handle, 'wear')?.style.opacity).toBe(String(wear.maxOpacity));
  });

  it('puts a halo behind every kind, not only the round ones', () => {
    // A departure from the reference, which halos knobs and wheels alone — see
    // the note at the top of src/ui/control.ts. HOW LOUD is a fader on all nine
    // modules and HOW OFTEN a selector on five, so leaving those two blank would
    // make the board's slowest feedback loop silent on most of its gestures. gt#34
    // added two more kinds under the same rule rather than exempting them.
    for (const kind of KINDS) {
      const { handle } = build({ kind, steps: 4, words: OFTEN, wearTurns: wear.turnsToFull });
      expect(part(handle, 'wear'), `${kind} halo`).not.toBeNull();
      expect(part(handle, 'wear')?.style.opacity, `${kind} opacity`).toBe(String(wear.maxOpacity));
    }
  });

  it('shapes each halo to the gesture it is a record of', () => {
    // A circle does not transfer to a lane: the fader takes a bloom filling its
    // travel, and the selector the knob's ring at an inset that clears its ticks.
    const fader = part(build({ kind: 'fader' }).handle, 'wear');
    expect(fader?.style.background).toBe(controls.faderWearGlow);
    expect(fader?.style.left).toBe(`${-FADER.wearInset}px`);

    const selector = part(build({ kind: 'selector', steps: 4, words: OFTEN }).handle, 'wear');
    expect(selector?.style.background).toBe(controls.wearRing);
    expect(selector?.style.left).toBe(`${-SELECTOR.wearInset}px`);
    expect(SELECTOR.wearInset).toBeGreaterThan(SELECTOR.tickInset + SELECTOR.tickSize);

    // And neither shape transfers to the two gt#34 added. A thrown bar polishes a
    // line down the slot; a flicked bank gathers bone at the foot of the row.
    const lever = part(build({ kind: 'lever' }).handle, 'wear');
    expect(lever?.style.background).toBe(controls.leverWearScuff);
    expect(lever?.style.left).toBe(`${-LEVER.wearInset}px`);

    const bank = part(build({ kind: 'toggles', steps: 4, words: OFTEN }).handle, 'wear');
    expect(bank?.style.background).toBe(controls.toggleWearHaze);
    expect(bank?.style.left).toBe(`${-TOGGLES.wearInset}px`);

    // Five distinct answers for six kinds — a selector borrows the knob's ring at
    // a wider inset, and nothing else borrows anything. No kind is left blank.
    const tells = KINDS.map(
      (kind) => part(build({ kind, steps: 4, words: OFTEN }).handle, 'wear')?.style.background,
    );
    expect(tells.filter(Boolean)).toHaveLength(KINDS.length);
    expect(new Set(tells).size).toBe(5);
  });
});

describe('dragging', () => {
  it('covers the whole range in 150px, in either direction', () => {
    const up = build({ value: 0 });
    drag(up.handle, DRAG.fullRangePx);
    expect(up.values.at(-1)).toBe(1);

    const down = build({ value: 1 });
    drag(down.handle, -DRAG.fullRangePx);
    expect(down.values.at(-1)).toBe(0);
  });

  it('moves half a range for half the distance, from wherever it started', () => {
    const { handle, values } = build({ value: 0.25 });
    drag(handle, DRAG.fullRangePx / 2);
    expect(values.at(-1)).toBeCloseTo(0.75);
  });

  it('clamps rather than wrapping when the hand keeps going', () => {
    const { handle, values } = build({ value: 0.5 });
    press(handle, 300);
    moveTo(-900);
    expect(values.at(-1)).toBe(1);
    moveTo(1200);
    expect(values.at(-1)).toBe(0);
    lift();
  });

  it('snaps a stepped control to integer indices and nothing between', () => {
    const { handle, values } = build({ kind: 'selector', steps: 5, words: OFTEN, value: 0 });
    press(handle, 300);
    for (let dy = 0; dy <= DRAG.fullRangePx; dy += 5) moveTo(300 - dy);
    lift();
    expect(values).toEqual([1, 2, 3, 4]);
  });

  it('says nothing while the value has not actually changed', () => {
    const { handle, values } = build({ kind: 'selector', steps: 5, words: OFTEN, value: 2 });
    press(handle, 300);
    moveTo(299);
    moveTo(298);
    lift();
    expect(values).toEqual([]);
  });

  it('covers that same 150px of screen however far the board is zoomed out', () => {
    // Settled under gt#22, and pinned here so it is not quietly "fixed" later. The
    // plate is zoomed on a narrow window and the wire layer divides its
    // coordinates back out of that; a control does not, because the 150px is a
    // fact about the hand rather than about the board. Under `--fit` 0.5 the
    // knob is drawn at half size and the gesture is still 150 real pixels.
    for (const fit of ['1', '0.6', '0.5']) {
      document.body.style.setProperty('--fit', fit);
      const { handle, values } = build({ value: 0 });
      drag(handle, DRAG.fullRangePx / 2);
      expect(values.at(-1), fit).toBeCloseTo(0.5);
    }
    document.body.style.removeProperty('--fit');
  });

  it('leaves the right and middle buttons to the browser', () => {
    const { handle, values, presses } = build({ value: 0 });
    press(handle, 300, 2);
    moveTo(150);
    lift();
    expect(values).toEqual([]);
    expect(presses).toBe(0);
  });

  it('reports the touch before any value moves, so no control is dead', () => {
    const gesture = build({ value: 0.5 });
    press(gesture.handle, 300);
    expect(gesture.presses).toBe(1);
    expect(gesture.values).toEqual([]);
    lift();
  });

  it('stops listening once the hand is lifted', () => {
    const { handle, values } = build({ value: 0.5 });
    drag(handle, 30);
    const settled = values.length;
    moveTo(0);
    moveTo(600);
    expect(values.length).toBe(settled);
  });

  it('drops a drag still in flight when the control is destroyed', () => {
    const { handle, values, commits } = build({ value: 0.5 });
    press(handle, 300);
    handle.destroy();
    moveTo(100);
    lift();
    expect(values).toEqual([]);
    expect(commits).toEqual([]);
  });
});

describe('wear', () => {
  it('counts a drag that moved, once, under the scope.param key', () => {
    const { handle, commits } = build({ scope: 'g', param: 'seriousness', kind: 'wheel' });
    expect(handle.key).toBe('g.seriousness');
    expect(handle.element.dataset.control).toBe('g.seriousness');
    drag(handle, 40);
    expect(commits).toEqual(['g.seriousness']);
  });

  it('does not count a bare click — waking a module is not wearing a knob', () => {
    const gesture = build();
    press(gesture.handle, 300);
    lift();
    expect(gesture.presses).toBe(1);
    expect(gesture.commits).toEqual([]);
  });

  it('does not count the wheel, which is one notch however long it is spun', () => {
    const { handle, commits, values } = build({ value: 0.5 });
    spin(handle, -100);
    expect(values).toHaveLength(1);
    expect(commits).toEqual([]);
  });
});

describe('the wheel', () => {
  it('takes a continuous control .0011 per pixel, upward for more', () => {
    const { handle, values } = build({ value: 0.5 });
    spin(handle, -100);
    expect(values.at(-1)).toBeCloseTo(0.5 + 100 * WHEEL.perPixel);
  });

  it('moves a stepped control exactly one position, whatever the delta', () => {
    const { handle, values } = build({ kind: 'selector', steps: 5, words: OFTEN, value: 2 });
    vi.useFakeTimers();
    spin(handle, -4000);
    vi.advanceTimersByTime(WHEEL.throttleMs);
    spin(handle, 12);
    expect(values).toEqual([3, 2]);
  });

  it('clamps at both ends rather than wrapping round', () => {
    const top = build({ kind: 'selector', steps: 5, words: OFTEN, value: 4 });
    spin(top.handle, -50);
    expect(top.values).toEqual([]);

    const bottom = build({ kind: 'selector', steps: 5, words: OFTEN, value: 0 });
    spin(bottom.handle, 50);
    expect(bottom.values).toEqual([]);
  });

  it('swallows the page scroll, including on the events it then throttles away', () => {
    vi.useFakeTimers();
    const { handle, values } = build({ value: 0.5 });
    const flick = [0, 1, 2].map(
      () => new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }),
    );
    for (const event of flick) handle.element.dispatchEvent(event);
    // One notch out of three events, and not one of the three scrolls the board
    // out from under the cursor — which is the whole complaint in gt#28.
    expect(values).toHaveLength(1);
    expect(flick.map((event) => event.defaultPrevented)).toEqual([true, true, true]);
  });

  it('ignores everything inside 90ms, so a flick cannot slam it end to end', () => {
    vi.useFakeTimers();
    const { handle, values } = build({ value: 0.5 });
    spin(handle, -100);
    for (let i = 0; i < 20; i += 1) {
      vi.advanceTimersByTime(WHEEL.throttleMs / 10);
      spin(handle, -100);
    }
    // Twenty-one events, 180ms: the first notch plus one per window that closed.
    expect(values).toHaveLength(3);
  });
});

describe('a redraw that moves nothing', () => {
  // The board redraws every control it has on every gesture and every drift
  // tick, and nearly all of them are where they already were. What that must
  // not do is touch the page: a caption restated is a text node replaced, which
  // is a layout and a repaint of the plate for a word that did not change.
  it('leaves the caption it already wrote alone', () => {
    const { handle } = build({ kind: 'selector', steps: 3, words: ['one', 'two', 'three'], value: 1 });
    const word = part(handle, 'word') as HTMLElement;
    const written = word.firstChild;
    expect(word.textContent).toBe('two');

    handle.setValue(1);
    handle.setValue(1, 1);
    handle.setWear(0);

    expect(word.firstChild).toBe(written);

    handle.setValue(2);
    expect(word.textContent).toBe('three');
    expect(word.firstChild).not.toBe(written);
  });

  it('writes no style it has already written, on any kind', () => {
    for (const kind of KINDS) {
      const { handle } = build({ kind, value: 0.5, steps: 0 });
      const pieces = [...handle.element.querySelectorAll<HTMLElement>('*')];
      const before = pieces.map((piece) => piece.getAttribute('style'));
      const spies = pieces.map((piece) => vi.spyOn(piece.style, 'setProperty'));
      const observed: MutationRecord[] = [];
      const observer = new MutationObserver((records) => observed.push(...records));
      observer.observe(handle.element, { attributes: true, subtree: true, childList: true, characterData: true });

      handle.setValue(0.5);
      handle.setValue(0.5, 0.5);

      observed.push(...observer.takeRecords());
      observer.disconnect();
      expect(observed, kind).toEqual([]);
      expect(pieces.map((piece) => piece.getAttribute('style')), kind).toEqual(before);
      for (const spy of spies) spy.mockRestore();

      // And it has not gone deaf: a value that did move is drawn.
      handle.setValue(0.9);
      expect(pieces.map((piece) => piece.getAttribute('style')), kind).not.toEqual(before);
    }
  });

  it('still draws where it is heard when that is not where it was set (gt#91)', () => {
    const { handle } = build({ kind: 'fader', value: 0.5, height: 100 });
    const cap = part(handle, 'cap') as HTMLElement;
    const set = cap.style.bottom;
    handle.setValue(0.5, 0.8);
    expect(cap.style.bottom).not.toBe(set);
    handle.setValue(0.5, 0.5);
    expect(cap.style.bottom).toBe(set);
  });
});

describe('lettering', () => {
  it('shows one word on the tape and nothing else until hover', () => {
    const { handle } = build({ label: 'CROWD' });
    expect(part(handle, 'tape')?.textContent).toBe('CROWD');
    expect(handle.element.textContent).toBe('CROWD');
  });

  it('can be built bare, with its word kept and its tape left off (gt#63)', () => {
    // For a control whose word is already painted on the plate it sits in. The
    // strip goes; the word stays on the element, and nothing about the gesture
    // or the wear changes, because neither was ever the tape's.
    for (const kind of KINDS) {
      const { handle, values } = build({ kind, label: 'GRIT', bare: true, value: 0, steps: 0 });

      expect(part(handle, 'tape'), kind).toBeNull();
      expect(handle.element.dataset.label, kind).toBe('GRIT');
      expect(handle.element.textContent, kind).toBe('');
      expect(part(handle, 'seat'), kind).not.toBeNull();
      expect(part(handle, 'wear'), kind).not.toBeNull();

      handle.element.dispatchEvent(
        new PointerEvent('pointerdown', { button: 0, bubbles: true, cancelable: true, clientY: 300 }),
      );
      window.dispatchEvent(new PointerEvent('pointermove', { clientY: 300 - DRAG.fullRangePx }));
      window.dispatchEvent(new PointerEvent('pointerup', { clientY: 300 - DRAG.fullRangePx }));
      expect(values.at(-1), kind).toBe(1);
    }
  });

  it('carries its word on the element whether or not it is on a tape', () => {
    const { handle } = build({ label: 'CROWD' });

    expect(handle.element.dataset.label).toBe('CROWD');
    expect(part(handle, 'tape')?.textContent).toBe('CROWD');
  });

  it('spells a selector step out in words, never in numbers', () => {
    const { handle } = build({ kind: 'selector', steps: 5, words: OFTEN, value: 0, label: 'HOW OFTEN' });
    expect(part(handle, 'word')?.textContent).toBe('constantly');
    handle.setValue(4);
    expect(part(handle, 'word')?.textContent).toBe('almost never');
    expect(handle.element.textContent ?? '').not.toMatch(/[0-9]/);
  });

  it('spells every stepped kind out in words, never in numbers', () => {
    // The rule is the kind-independent one: a stepped control says where it is in
    // language or it does not say it at all. A lever with five detents and a bank
    // of five bats are both as capable of leaking an index as a selector is.
    for (const kind of STEPPED) {
      const { handle } = build({ kind, steps: 5, words: OFTEN, value: 0, label: 'HOW OFTEN' });
      expect(part(handle, 'word')?.textContent, kind).toBe('constantly');
      handle.setValue(4);
      expect(part(handle, 'word')?.textContent, kind).toBe('almost never');
      expect(handle.element.textContent ?? '', kind).not.toMatch(/[0-9]/);
    }
  });

  it('gives a control with no words no caption at all', () => {
    expect(part(build({ kind: 'knob' }).handle, 'word')).toBeNull();
    expect(part(build({ kind: 'fader', label: 'HOW LOUD' }).handle, 'word')).toBeNull();
  });

  it('never tilts the control or its label', () => {
    const { handle } = build({ kind: 'selector', steps: 6, words: OFTEN, value: 3 });
    expect(handle.element.style.transform).toBe('');
    expect(part(handle, 'tape')?.style.transform).toBe('');
    expect(part(handle, 'word')?.style.transform).toBe('');
  });
});

describe('the shared shell', () => {
  it('is grabbable the same way whichever kind it is', () => {
    for (const kind of KINDS) {
      const { handle } = build({ kind, steps: kind === 'selector' ? 4 : 0, words: OFTEN });
      expect(handle.element.style.cursor, kind).toBe('ns-resize');
      expect(handle.element.style.touchAction, kind).toBe('none');
      expect(handle.element.style.userSelect, kind).toBe('none');
      expect(handle.element.dataset.control, kind).toBe('guitar.char');
      expect(handle.element.dataset.kind, kind).toBe(kind);
      expect(part(handle, 'tape')?.textContent, kind).toBe('CROWD');
      // Every kind sits in a seat, because the tip layer and the suites measure
      // the control by finding one. See tips.ts and modifier.test.ts.
      expect(part(handle, 'seat'), `${kind} seat`).not.toBeNull();
    }
  });

  it('answers a drag identically whichever kind it is', () => {
    for (const kind of KINDS) {
      const gesture = build({ kind, value: 0 });
      drag(gesture.handle, DRAG.fullRangePx);
      expect(gesture.values.at(-1), kind).toBe(1);
      expect(gesture.commits, kind).toEqual(['guitar.char']);
    }
  });

  it('answers the wheel identically whichever kind it is', () => {
    for (const kind of KINDS) {
      const { handle, values } = build({ kind, value: 0.5 });
      spin(handle, -100);
      expect(values.at(-1), kind).toBeCloseTo(0.5 + 100 * WHEEL.perPixel);
    }
  });

  it('names every piece it is built from, whichever kind it is', () => {
    // The tip layer, the wire layer and these suites all read the geometry back
    // off the element by `data-part`, so a nameless piece is a piece none of them
    // can find. gt#34 added two kinds' worth of new anatomy under that rule.
    for (const kind of KINDS) {
      const { handle } = build({ kind, steps: 5, words: OFTEN });
      const nameless = [...handle.element.querySelectorAll<HTMLElement>('*')].filter(
        (piece) => !piece.dataset.part,
      );
      expect(nameless.map((piece) => piece.outerHTML), kind).toEqual([]);
      // And enough pieces that the check is looking at an assembly, not a div.
      expect(handle.element.querySelectorAll('[data-part]').length, kind).toBeGreaterThan(2);
    }
  });

  it('paints a knob face out of the module colour and the shared tokens', () => {
    const { handle } = build({ kind: 'knob', face: '#567c6a' });
    const painted = part(handle, 'face')?.style.background ?? '';
    expect(painted).toContain(`radial-gradient(${KNOB.faceOrigin}`);
    expect(painted).toContain('#567c6a');
    expect(painted).toContain(`${controls.faceDark} ${KNOB.faceStop}%`);
    expect(painted).toContain(`${controls.knobRim} 100%`);
  });

  it('builds a valve wheel from a rim, three spokes and a hub', () => {
    const { handle } = build({ kind: 'wheel', diameter: 54 });
    const spokes = parts(handle, 'spoke');
    expect(spokes.map((spoke) => spoke.style.transform)).toEqual(
      VALVE.spokeAngles.map((angle) => `rotate(${angle}deg)`),
    );
    expect(part(handle, 'rim')?.style.borderColor).toContain(controls.wheelRim);
    expect(part(handle, 'hub')?.style.background).toBe(controls.wheelHub);
  });
});

describe('the reference', () => {
  // The original design drew four kinds of control and gave the board the two
  // rotation formulas, the drag range, the wheel and the fallback sizes. The
  // lever and the toggle bank are inventions and were in neither, so what holds
  // them honest is the shared shell above rather than a pin.

  it('still holds every size the reference’s four kinds are cut to', () => {
    const pins: Array<[string, unknown, unknown]> = [
      ['column gap', TAPE.gap, 4],
      ['tape padding', [TAPE.padY, TAPE.padX], [1, 7]],
      ['tape line height', TAPE.lineHeight, 1.35],
      ['caption size', CAPTION.fontSize, 10],
      ['caption opacity', CAPTION.opacity, 0.75],
      ['caption tracking', CAPTION.letterSpacing, 0.5],

      ['knob wear ring', KNOB.wearInset, 6],
      ['knob face', KNOB.faceOrigin, 'circle at 36% 30%'],
      ['knob face stop', KNOB.faceStop, 72],
      ['knob mark', [KNOB.mark.top, KNOB.mark.width, KNOB.mark.height], ['5%', '8%', '32%']],
      ['knob mark offset', KNOB.mark.marginLeft, '-4%'],
      ['knob mark radius', KNOB.mark.radius, '40%'],

      ['fader lane', FADER.lane, 34],
      ['fader rail', FADER.railWidth, 8],
      ['fader rail radius', FADER.railRadius, 4],
      ['fader cap', [FADER.capWidth, FADER.capHeight], [32, 14]],
      ['fader cap radius', FADER.capRadius, 2],
      ['fader travel', FADER.capHeight, 14],
      ['fader index', [FADER.indexTop, FADER.indexHeight], [6, 2]],
      ['fader index inset', FADER.indexInset, 3],
      ['fader index opacity', FADER.indexOpacity, 0.75],

      ['selector disc', SELECTOR.discInset, 3],
      ['selector ticks', SELECTOR.tickInset, 5],
      ['selector tick dot', SELECTOR.tickSize, 3],
      ['selector face', SELECTOR.faceOrigin, 'circle at 40% 32%'],
      ['selector face stop', SELECTOR.faceStop, 78],
      ['selector wedge', SELECTOR.wedgeHalfWidth, 5],
      ['selector wedge height', SELECTOR.wedgeHeight, 10],
      ['selector wedge top', SELECTOR.wedgeTop, 1],

      ['valve wear ring', VALVE.wearInset, 8],
      ['valve rim', VALVE.rim, 10],
      ['valve spoke', [VALVE.spokeInset, VALVE.spokeWidth], [8, 7]],
      ['valve hub', VALVE.hub, 26],
    ];
    for (const [name, actual, pinned] of pins) expect(actual, name).toEqual(pinned);
  });

  it('still holds every angle and every number that answers a hand', () => {
    const pins: Array<[string, unknown, unknown]> = [
      ['drag range', DRAG.fullRangePx, 150],
      ['knob sweep', [KNOB_SWEEP.start, KNOB_SWEEP.span], [-132, 264]],
      ['valve sweep', VALVE_SWEEP, 320],
      ['spoke increments', VALVE.spokeAngles, [0, 60, 120]],
      ['wheel throttle', WHEEL.throttleMs, 90],
      ['wheel per pixel', WHEEL.perPixel, 0.0011],
      ['wheel step', WHEEL.step, 1],
      ['default width', CONTROL_SIZE.width, 64],
      ['default diameter', CONTROL_SIZE.diameter, 50],
      ['default fader height', CONTROL_SIZE.faderHeight, 72],
      ['default font size', CONTROL_SIZE.fontSize, 11],
    ];
    for (const [name, actual, pinned] of pins) expect(actual, name).toEqual(pinned);
  });
});

// How a control gets from one value to the next (gt#80).
describe('travel', () => {
  /** The piece of each kind that moves, and the property it moves by. */
  const MOVES: Array<[ControlKind, string, string, string]> = [
    ['knob', 'dial', 'transform', TRAVEL.turn],
    ['selector', 'dial', 'transform', TRAVEL.turn],
    ['wheel', 'assembly', 'transform', TRAVEL.turn],
    ['fader', 'cap', 'bottom', TRAVEL.slide],
    ['lever', 'bar', 'bottom', TRAVEL.slide],
    ['toggles', 'bat', 'top', TRAVEL.slide],
  ];

  it('follows the hand with nothing in between, unless the plate above says otherwise', () => {
    // The duration is a custom property with a fallback of zero. Nothing sets
    // it but the board, for a third of a second after the hammer — so a control
    // built on its own, or turned by a hand, has no transition at all.
    for (const [kind, piece, property] of MOVES) {
      const { handle } = build({ kind, steps: kind === 'selector' || kind === 'toggles' ? 4 : 0, words: OFTEN });
      const moving = part(handle, piece);

      expect(moving?.style.transition, kind).toContain(`${property} var(${TRAVEL_VAR}, 0s)`);
      expect(handle.element.style.getPropertyValue(TRAVEL_VAR), kind).toBe('');
    }
  });

  it('overshoots what turns and not what slides', () => {
    // A knocked knob has a weight on a shaft. A fader's rail ends where it ends.
    const beyond = (curve: string): boolean =>
      curve
        .replace(/^cubic-bezier\(|\)$/g, '')
        .split(',')
        .map(Number)
        .some((value, index) => index % 2 === 1 && value > 1);

    for (const [kind, piece, , easing] of MOVES) {
      const { handle } = build({ kind, steps: kind === 'selector' || kind === 'toggles' ? 4 : 0, words: OFTEN });
      expect(part(handle, piece)?.style.transition, kind).toContain(easing);
    }
    expect(beyond(TRAVEL.turn)).toBe(true);
    expect(beyond(TRAVEL.slide)).toBe(false);
  });

  it('gives every bat of a bank the same travel', () => {
    const { handle } = build({ kind: 'toggles', steps: 5, words: OFTEN });
    const bats = parts(handle, 'bat');

    expect(bats.length).toBeGreaterThan(1);
    expect(new Set(bats.map((bat) => bat.style.transition)).size).toBe(1);
  });
});

// The light in the room does not turn when a knob does (gt#93).
describe('what turns and what does not', () => {
  /** Every style a piece could be carrying that says where the light is. */
  const lit = (piece: HTMLElement | null): string =>
    `${piece?.style.boxShadow ?? ''}|${piece?.style.background ?? ''}`;

  it('turns a knob’s dial and leaves its lit body where it is', () => {
    const { handle } = build({ kind: 'knob', value: 0.2 });
    const face = part(handle, 'face');
    const dial = part(handle, 'dial');

    // The body carries the shading and the shadow, and no rotation — at rest or
    // at any value it is set to.
    expect(face?.style.boxShadow).not.toBe('');
    expect(face?.style.background).toContain('radial-gradient');
    for (const value of [0, 0.35, 0.8, 1]) {
      handle.setValue(value);
      expect(face?.style.transform, String(value)).toBe('');
    }
    // The dial carries the rotation, and nothing that could show which way the
    // light is coming from.
    expect(dial?.style.transform).toContain('rotate(');
    expect(lit(dial)).toBe('|');
    // Over the body, so what is cut into the cap is seen on top of it.
    const order = [...(face?.parentElement?.children ?? [])];
    expect(order.indexOf(dial as HTMLElement)).toBeGreaterThan(order.indexOf(face as HTMLElement));
  });

  it('keeps the pointer and the grip lines on the dial, because they are the cap', () => {
    const { handle } = build({ kind: 'knob' });
    const dial = part(handle, 'dial');

    expect(dial?.contains(part(handle, 'mark'))).toBe(true);
    expect(dial?.contains(part(handle, 'knurl'))).toBe(true);
    expect(part(handle, 'face')?.contains(part(handle, 'mark'))).toBe(false);
    // The lines are a ring at the edge, not a pattern across the face, and they
    // are never something a press can land on instead of the knob.
    const knurl = part(handle, 'knurl');
    expect(knurl?.style.background).toBe(controls.knurl);
    expect(knurl?.style.getPropertyValue('mask-image')).toContain(`transparent ${KNOB.knurl.from}%`);
    expect(knurl?.style.pointerEvents).toBe('none');
    expect(KNOB.knurl.from).toBeGreaterThanOrEqual(70);
  });

  it('does the same for a selector: the wedge turns, the disc does not', () => {
    const { handle } = build({ kind: 'selector', steps: 5, value: 1 });
    const face = part(handle, 'face');
    const dial = part(handle, 'dial');

    handle.setValue(4);
    expect(face?.style.transform).toBe('');
    expect(face?.style.boxShadow).not.toBe('');
    expect(dial?.style.transform).toContain('rotate(');
    expect(lit(dial)).toBe('|');
    expect(dial?.contains(part(handle, 'wedge'))).toBe(true);
    // Cut to the same disc, so the wedge sits where it always did.
    for (const side of ['left', 'top', 'right', 'bottom'] as const) {
      expect(dial?.style[side], side).toBe(face?.style[side]);
    }
  });

  it('turns a valve wheel’s rim and spokes over a shadow and a hub that stay put', () => {
    const { handle } = build({ kind: 'wheel', diameter: 54, value: 0.7 });
    const assembly = part(handle, 'assembly');
    const cast = part(handle, 'cast');
    const hub = part(handle, 'hub');

    expect(assembly?.style.transform).toContain('rotate(');
    // What the wheel does to the light is under it and does not go round.
    expect(cast?.style.boxShadow).not.toBe('');
    expect(cast?.style.transform).toBe('');
    expect(assembly?.contains(cast)).toBe(false);
    // Cut to the rim's own shape, so each edge falls where it did.
    expect(cast?.style.borderWidth).toBe(`${VALVE.rim}px`);
    // The rim is flat metal now: nothing on it says which way is up.
    expect(part(handle, 'rim')?.style.boxShadow).toBe('');
    // And the hub, which is round and on the axle, is not turned at all.
    expect(assembly?.contains(hub)).toBe(false);
    expect(hub?.style.boxShadow).not.toBe('');
    const order = [...(assembly?.parentElement?.children ?? [])];
    expect(order.indexOf(cast as HTMLElement)).toBeLessThan(order.indexOf(assembly as HTMLElement));
    expect(order.indexOf(hub as HTMLElement)).toBeGreaterThan(order.indexOf(assembly as HTMLElement));
  });

  it('leaves no shaded piece inside anything that rotates, on any kind', () => {
    // The rule, rather than the three cases of it. A spoke's shadow is the one
    // exception and is allowed because it has no direction: zero offset, the
    // same on every side.
    for (const kind of ['knob', 'selector', 'wheel'] as const) {
      const { handle } = build(kind === 'selector' ? { kind, steps: 5 } : { kind });
      const turning = turned(handle);
      const shaded = [...(turning?.querySelectorAll<HTMLElement>('[data-part]') ?? [])].filter(
        (piece) => piece.style.boxShadow !== '' && !/^0(px)? 0(px)? /.test(piece.style.boxShadow),
      );
      expect(shaded.map((piece) => piece.dataset.part), kind).toEqual([]);
      expect(turning?.style.boxShadow, kind).toBe('');
    }
  });
});

// The loudness gauge (gt#90): marks beside a fader that widen as they climb and
// light up to where the cap is.
describe('the gauge beside a fader', () => {
  const HEIGHT = 78;
  const cut = (gauge: Partial<GaugeSpec> = {}, value = 0.5): ControlHandle =>
    build({
      kind: 'fader',
      label: 'HOW LOUD',
      bare: true,
      height: HEIGHT,
      value,
      gauge: { shape: 'bars', count: 6, side: 'right', ...gauge },
    }).handle;

  const notches = (handle: ControlHandle): HTMLElement[] => parts(handle, 'notch');
  /** A colour as written, whatever spacing the DOM hands it back with. */
  const flat = (value: string | undefined): string => (value ?? '').replace(/\s+/g, '');
  const lit = (handle: ControlHandle): boolean[] =>
    notches(handle).map((notch) => flat(notch.style.background) === flat(controls.gaugeLit));

  it('is not there unless a fader is given one', () => {
    expect(part(build({ kind: 'fader' }).handle, 'gauge')).toBeNull();
    // And it is a fader's: a knob handed one by mistake draws nothing.
    expect(
      part(build({ kind: 'knob', gauge: { shape: 'bars', count: 5, side: 'left' } }).handle, 'gauge'),
    ).toBeNull();
  });

  it('gets wider as it climbs, whatever it is cut as', () => {
    for (const shape of ['bars', 'blocks', 'dots'] as const) {
      const widths = notches(cut({ shape })).map((notch) => parseFloat(notch.style.width));

      expect(widths, shape).toHaveLength(6);
      for (let i = 1; i < widths.length; i += 1) {
        expect(widths[i], `${shape} ${i}`).toBeGreaterThan(widths[i - 1] ?? Infinity);
      }
      // Never wider than the room the column leaves it.
      expect(Math.max(...widths), shape).toBeLessThanOrEqual(GAUGE.width);
    }
    expect(gaugeReach('bars', 0)).toBe(GAUGE.min);
    expect(gaugeReach('bars', 1)).toBe(GAUGE.width);
    expect(gaugeReach('dots', 1)).toBe(GAUGE.dotMax);
    // Out of range is the end of the range, not a mark of negative width.
    expect(gaugeReach('bars', -2)).toBe(GAUGE.min);
    expect(gaugeReach('bars', 9)).toBe(GAUGE.width);
  });

  it('spans the travel of the cap’s middle, so a mark and the cap line up', () => {
    const handle = cut();
    const gauge = part(handle, 'gauge');

    expect(gauge?.style.top).toBe(`${FADER.capHeight / 2}px`);
    expect(gauge?.style.bottom).toBe(`${FADER.capHeight / 2}px`);
    expect(notches(handle)[0]?.style.bottom).toContain('calc(0% -');
    expect(notches(handle)[5]?.style.bottom).toContain('calc(100% -');
  });

  it('hangs off the side it was given, and grows away from the lane', () => {
    const right = cut({ side: 'right' });
    expect(part(right, 'gauge')?.style.left).toBe('100%');
    expect(notches(right)[0]?.style.left).toBe('0px');

    const left = cut({ side: 'left' });
    expect(part(left, 'gauge')?.style.right).toBe('100%');
    expect(notches(left)[0]?.style.right).toBe('0px');
  });

  it('lights every mark at or under the cap, and none over it', () => {
    const handle = cut({ count: 6 }, 0);
    expect(lit(handle)).toEqual([true, false, false, false, false, false]);

    handle.setValue(0.5);
    expect(lit(handle)).toEqual([true, true, true, false, false, false]);

    // Exactly on a mark lights it: a fader pushed to a mark is at that mark.
    handle.setValue(0.6);
    expect(lit(handle)).toEqual([true, true, true, true, false, false]);

    handle.setValue(1);
    expect(lit(handle)).toEqual([true, true, true, true, true, true]);
    // What is not lit is still drawn, as the scale it is.
    handle.setValue(0.2);
    expect(flat(notches(handle)[5]?.style.background)).toBe(flat(controls.gaugeDim));
  });

  it('follows the cap as a hand moves it', () => {
    const { handle } = build({
      kind: 'fader',
      bare: true,
      height: HEIGHT,
      value: 0,
      gauge: { shape: 'blocks', count: 5, side: 'left' },
    });

    drag(handle, 0.5 * DRAG.fullRangePx);

    expect(lit(handle)).toEqual([true, true, true, false, false]);
  });

  it('shows where the level is heard, not where it was set, on a drifting board', () => {
    const handle = cut({ count: 5 }, 0.25);
    expect(lit(handle)).toEqual([true, true, false, false, false]);

    // Set at a quarter, heard at three quarters (gt#91).
    handle.setValue(0.25, 0.75);
    expect(lit(handle)).toEqual([true, true, true, true, false]);
  });

  it('is one solid wedge when it is cut as one, filled to the level', () => {
    const handle = cut({ shape: 'wedge' }, 0.4);
    const wedge = part(handle, 'wedge');

    expect(notches(handle)).toHaveLength(0);
    expect(wedge?.style.getPropertyValue('clip-path')).toContain('polygon(');
    expect(flat(wedge?.style.background)).toContain(flat(`${controls.gaugeLit} 40%`));
    expect(flat(wedge?.style.background)).toContain(flat(`${controls.gaugeDim} 40%`));

    handle.setValue(1);
    expect(flat(wedge?.style.background)).toContain(flat(`${controls.gaugeLit} 100%`));
  });

  it('is never something a press can land on instead of the fader', () => {
    expect(part(cut(), 'gauge')?.style.pointerEvents).toBe('none');
  });
});

// A range drawn the other way up (gt#51): for a value whose numbers run against
// what a hand expects of the hardware.
describe('a control turned over', () => {
  const OFTEN_STEPS = OFTEN.length;
  const lever = (value: number, invert = true): Gesture =>
    build({ kind: 'lever', label: 'HOW OFTEN', steps: OFTEN_STEPS, words: OFTEN, height: 42, value, invert });
  const barBottom = (handle: ControlHandle): number => parseFloat(part(handle, 'bar')?.style.bottom ?? 'NaN');
  const travel = 42 - LEVER.barHeight;

  it('throws a lever to the top for the lowest value and the bottom for the highest', () => {
    // HOW OFTEN's first word is *constantly*. Up has to mean more of it.
    expect(barBottom(lever(0).handle)).toBe(travel);
    expect(barBottom(lever(OFTEN_STEPS - 1).handle)).toBe(0);
    // And the other way up when it is not asked for, as every lever was.
    expect(barBottom(lever(0, false).handle)).toBe(0);
  });

  it('still says the word for the value it holds, not for where it is drawn', () => {
    const { handle } = lever(0);
    expect(part(handle, 'word')?.textContent).toBe('constantly');
    handle.setValue(OFTEN_STEPS - 1);
    expect(part(handle, 'word')?.textContent).toBe('almost never');
  });

  it('lowers the value when it is dragged up, and hands back the value rather than the place', () => {
    const touch = lever(2);

    drag(touch.handle, DRAG.fullRangePx / 2);
    // Half the range upward from the middle is the top, which is value 0.
    expect(touch.values[touch.values.length - 1]).toBe(0);
    expect(barBottom(touch.handle)).toBe(travel);

    drag(touch.handle, -DRAG.fullRangePx);
    expect(touch.values[touch.values.length - 1]).toBe(OFTEN_STEPS - 1);
    expect(barBottom(touch.handle)).toBe(0);
  });

  it('turns the wheel over with it, so scrolling up is still more', () => {
    const touch = lever(2);

    // Up on the wheel moves the lever up, and up on this lever is more often:
    // the lower value.
    spin(touch.handle, -100);
    expect(touch.values[touch.values.length - 1]).toBe(1);
  });

  it('counts a bank’s switches down from all of them', () => {
    // Every switch up is *constantly*; none is *almost never*.
    const bank = (value: number): number =>
      parts(
        build({ kind: 'toggles', label: 'HOW OFTEN', steps: OFTEN_STEPS, words: OFTEN, value, invert: true }).handle,
        'bat',
      ).filter((bat) => bat.style.top === `${TOGGLES.bat.on}px`).length;

    expect(bank(0)).toBe(OFTEN_STEPS - 1);
    expect(bank(2)).toBe(OFTEN_STEPS - 1 - 2);
    expect(bank(OFTEN_STEPS - 1)).toBe(0);
  });

  it('turns a continuous control over too, about its middle', () => {
    const touch = build({ kind: 'fader', height: 64, value: 0.25, invert: true });
    const cap = (): number => parseFloat(part(touch.handle, 'cap')?.style.bottom ?? 'NaN');

    expect(cap()).toBe(Math.round(0.75 * (64 - FADER.capHeight)));
    drag(touch.handle, 0.1 * DRAG.fullRangePx);
    expect(touch.values[touch.values.length - 1]).toBeCloseTo(0.15, 10);
  });

  it('draws a drifting value where it is heard, turned over the same way', () => {
    const { handle } = build({ kind: 'fader', height: 64, value: 0.2, invert: true });

    handle.setValue(0.2, 0.6);

    expect(parseFloat(part(handle, 'cap')?.style.bottom ?? 'NaN')).toBe(
      Math.round(0.4 * (64 - FADER.capHeight)),
    );
  });
});

describe('a control with no tell (gt#117)', () => {
  it('draws nothing for its wear, however much it has', () => {
    // MEGADRIFT is the one such: on a tall lever the tell is a pale band down
    // both sides of the slot, and reads as the lever being lit from behind.
    const worn = build({ kind: 'lever', wearTurns: 400 });
    const told = part(worn.handle, 'wear');
    expect(Number(told?.style.opacity)).toBeGreaterThan(0);

    const quiet = build({ kind: 'lever', wearTurns: 400, untold: true });
    expect(part(quiet.handle, 'wear')?.style.opacity).toBe('0');
    // Told it has more, it still draws none.
    quiet.handle.setWear(4000);
    expect(part(quiet.handle, 'wear')?.style.opacity).toBe('0');
    // And it is otherwise the same lever.
    expect(part(quiet.handle, 'slot')?.getAttribute('style')).toBe(
      part(worn.handle, 'slot')?.getAttribute('style'),
    );
  });
});
