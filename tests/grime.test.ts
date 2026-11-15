// @vitest-environment happy-dom
//
// The grime pass (gt#118). Thomas: "review every element visible on screen, at
// any point. Ask yourself, 'does this have a grime element in any capacity, or
// is it clean?' If the answer is clean, come up with one single grime element
// you could add to it, then apply it. This is a light touch."
//
// Two things are held here. The helpers: that each mark is placed by a seed
// and not by chance, costs one element or one declaration, and takes no
// pointer. And the census: that on a built board every kind of thing that was
// clean now carries exactly one mark, and the things that were already old
// were not given a second.

import { afterEach, describe, expect, it } from 'vitest';
import { GRIME, VALVE } from '../src/ui/constants';
import { createBoard, createTipLayer, createWakeScreen, OPENING_STATE } from '../src/ui';
import type { BoardHandle } from '../src/ui';
import { BEZEL, GRUBBY, rusted, scuffed, STAINED, tarnished } from '../src/ui/grime';
import { MODIFIER_IDS, SOURCE_IDS } from '../src/engine/constants';
import { controls, ink, signals } from '../src/tokens';

const tight = (value: string): string => value.replace(/,\s+/g, ',');
const live: Array<{ destroy(): void }> = [];

function board(): BoardHandle {
  const handle = createBoard({ state: OPENING_STATE });
  document.body.appendChild(handle.element);
  live.push(handle);
  return handle;
}

/** The children of `host` that are one of the pass's marks. */
const marks = (host: Element, kind: string): HTMLElement[] =>
  ([...host.children] as HTMLElement[]).filter((child) => child.dataset.part === kind);

afterEach(() => {
  for (const handle of live.splice(0)) handle.destroy();
  document.body.innerHTML = '';
});

describe('the marks', () => {
  it('lays scratches by the name of the thing, the same every time and differently for each', () => {
    const host = document.createElement('div');
    const one = scuffed(host, 'm.guitar.char', GRIME.cap, '50%');
    const again = scuffed(host, 'm.guitar.char', GRIME.cap, '50%');
    const other = scuffed(host, 'm.bass.char', GRIME.cap, '50%');
    expect(one.getAttribute('style')).toBe(again.getAttribute('style'));
    expect(one.style.backgroundPosition).not.toBe(other.style.backgroundPosition);

    expect(one.style.backgroundImage).toBe('var(--scratchTex)');
    expect(one.style.backgroundSize).toBe(`${GRIME.cap.size}px`);
    expect(one.style.opacity).toBe(String(GRIME.cap.opacity));
    expect(one.style.borderRadius).toBe('50%');
    expect(one.style.pointerEvents).toBe('none');
    // Shifted back by less than the spread, each way, and never forward.
    const [x, y] = one.style.backgroundPosition.split(' ').map(parseFloat) as [number, number];
    expect(x).toBeLessThanOrEqual(0);
    expect(x).toBeGreaterThan(-GRIME.spread.x);
    expect(y).toBeLessThanOrEqual(0);
    expect(y).toBeGreaterThan(-GRIME.spread.y);
  });

  it('tarnishes with one token, turned round for about half of them', () => {
    const host = document.createElement('div');
    const made = Array.from({ length: 24 }, (_, i) => tarnished(host, `thing:${i}`, '3px'));
    for (const each of made) {
      expect(tight(each.style.background)).toBe(tight(controls.tarnish));
      expect(each.style.pointerEvents).toBe('none');
      expect(each.style.borderRadius).toBe('3px');
    }
    const turned = made.filter((each) => each.style.getPropertyValue('scale') !== '').length;
    expect(turned).toBeGreaterThan(4);
    expect(turned).toBeLessThan(20);
    // By the name, not by chance.
    expect(tarnished(host, 'thing:3', '3px').getAttribute('style')).toBe(made[3]?.getAttribute('style'));
  });

  it('rusts a ring and leaves the middle of the wheel open', () => {
    const host = document.createElement('div');
    const rust = rusted(host, 'g.seriousness', 112, VALVE.rim);
    expect(rust.style.backgroundImage).toBe('var(--rustTex)');
    expect(rust.style.borderRadius).toBe('50%');
    expect(rust.style.pointerEvents).toBe('none');
    // Clear out to where the rim starts, then solid.
    const inner = Number((100 - (VALVE.rim / 56) * 100).toFixed(1));
    const mask = rust.style.getPropertyValue('mask-image');
    expect(mask).toContain(`transparent ${inner}%`);
    expect(mask).toContain(`#000 ${inner + GRIME.wheel.feather}%`);
    expect(inner).toBeGreaterThan(50);
    // Smaller than the tile is cut, so a rim gets patches at its own scale.
    expect(GRIME.wheel.size).toBeLessThan(420);
  });

  it('keeps every mark light', () => {
    // A light touch, not an overhaul: nothing is laid at full strength except
    // rust on iron, and nothing takes more than a pixel of anything.
    expect(GRIME.cap.opacity).toBeLessThanOrEqual(0.7);
    expect(GRIME.name.opacity).toBeLessThanOrEqual(0.7);
    expect(GRIME.wake.opacity).toBeLessThanOrEqual(0.5);
    expect(GRIME.bezel).toBeLessThanOrEqual(1);
    for (const alpha of `${ink.tapeGrime} ${ink.tipGrime}`.match(/,0?\.\d+\)/g) ?? []) {
      expect(Number(alpha.slice(1, -1)), alpha).toBeLessThan(0.4);
    }
    // The tape is clean across the middle, where the word is.
    expect(ink.tapeGrime).toMatch(/rgba\(58,42,22,0\) 20%, rgba\(58,42,22,0\) 72%/);
    expect(GRUBBY).toBe(`background-image:${ink.tapeGrime};`);
    expect(STAINED).toBe(`background-image:${ink.tipGrime};`);
    expect(BEZEL).toBe(`outline:${GRIME.bezel}px solid ${signals.lampBezel};`);
  });
});

describe('the census: one mark on everything that was clean', () => {
  it('scuffs the cap of every knob and selector, once', () => {
    const { element } = board();
    const dials = [...element.querySelectorAll<HTMLElement>('[data-part="dial"]')];
    expect(dials.length).toBeGreaterThan(10);
    for (const dial of dials) {
      const scuffs = marks(dial, 'scuff');
      expect(scuffs, dial.parentElement?.parentElement?.dataset.control).toHaveLength(1);
      // First in the dial, so the pointer is over it and not under.
      expect(dial.firstElementChild).toBe(scuffs[0]);
    }
    // No two caps scuffed alike.
    const lays = dials.map((dial) => marks(dial, 'scuff')[0]?.style.backgroundPosition);
    expect(new Set(lays).size).toBe(lays.length);
  });

  it('rusts the rim of every valve wheel, once', () => {
    const { element } = board();
    const wheels = [...element.querySelectorAll<HTMLElement>('[data-part="assembly"]')].filter(
      (each) => each.querySelector('[data-part="rim"]'),
    );
    // SERIOUSNESS at the least.
    expect(wheels.length).toBeGreaterThanOrEqual(1);
    for (const wheel of wheels) expect(marks(wheel, 'rust')).toHaveLength(1);
  });

  it('tarnishes every fader cap, lever bar, bat, power switch and socket, once', () => {
    const { element } = board();
    const hosts: Record<string, HTMLElement[]> = {
      cap: [...element.querySelectorAll<HTMLElement>('[data-control] [data-part="cap"]')],
      bar: [...element.querySelectorAll<HTMLElement>('[data-control] [data-part="bar"]')],
      bat: [...element.querySelectorAll<HTMLElement>('[data-control] [data-part="bat"]')],
      nub: [...element.querySelectorAll<HTMLElement>('[data-part="power"] [data-part="nub"]')],
      jack: [...element.querySelectorAll<HTMLElement>('[data-part="jack"]')],
    };
    expect(hosts.cap?.length).toBeGreaterThanOrEqual(SOURCE_IDS.length);
    expect(hosts.bar?.length).toBeGreaterThanOrEqual(2);
    expect(hosts.nub).toHaveLength(SOURCE_IDS.length);
    // One socket a module, two a box.
    expect(hosts.jack).toHaveLength(SOURCE_IDS.length + 2 * MODIFIER_IDS.length);
    for (const [name, each] of Object.entries(hosts)) {
      for (const host of each) expect(marks(host, 'tarnish'), name).toHaveLength(1);
    }
    // A socket is still the wire layer's: the patch on it takes no pointer.
    for (const jack of hosts.jack ?? []) {
      expect(marks(jack, 'tarnish')[0]?.style.pointerEvents).toBe('none');
      expect(jack.dataset.jackOut ?? jack.dataset.jackIn).toBeTruthy();
    }
  });

  it('rings every lamp with dirt and leaves its light alone', () => {
    const { element } = board();
    const lamps = [
      ...element.querySelectorAll<HTMLElement>('[data-part="lamp"]'),
      ...element.querySelectorAll<HTMLElement>('[data-part="beat"]'),
    ];
    expect(lamps).toHaveLength(SOURCE_IDS.length + MODIFIER_IDS.length + 1);
    for (const lamp of lamps) {
      // Read piece by piece: the DOM is free to write the shorthand in any order.
      expect(lamp.style.outlineWidth, lamp.dataset.part).toBe(`${GRIME.bezel}px`);
      expect(lamp.style.outlineStyle, lamp.dataset.part).toBe('solid');
      expect(tight(lamp.style.outlineColor), lamp.dataset.part).toBe(tight(signals.lampBezel));
      // An outline and not a shadow: the glow is the lamp's to change.
      expect(lamp.childElementCount).toBe(0);
    }
  });

  it('scratches every name, and every name still says what it said', () => {
    const { element } = board();
    const names = [...element.querySelectorAll<HTMLElement>('[data-part="name"]')];
    expect(names).toHaveLength(SOURCE_IDS.length + MODIFIER_IDS.length);
    for (const name of names) {
      const scuffs = marks(name, 'scuff');
      expect(scuffs, name.textContent ?? '').toHaveLength(1);
      expect(scuffs[0]?.textContent).toBe('');
      expect(scuffs[0]?.style.opacity).toBe(String(GRIME.name.opacity));
      // The text is the name and nothing else, and nothing is tilted.
      expect(name.textContent).toMatch(/^[A-Z ]+$/);
      expect(name.style.position).toBe('relative');
      expect(scuffs[0]?.style.transform).toBe('');
    }
  });

  it('dirties the ends of every strip of tape', () => {
    const { element } = board();
    const tapes = [
      ...element.querySelectorAll<HTMLElement>('[data-part="tape"]'),
      ...element.querySelectorAll<HTMLElement>('[data-part="still"]'),
      ...element.querySelectorAll<HTMLElement>('[data-part="scrub"]'),
    ];
    expect(tapes.length).toBeGreaterThan(20);
    for (const tape of tapes) {
      expect(tight(tape.style.backgroundImage), tape.textContent ?? '').toBe(tight(ink.tapeGrime));
      // And it is still tape of the colour it was, with its word on it.
      expect(tape.style.backgroundColor, tape.textContent ?? '').not.toBe('');
      expect(tape.textContent).toBeTruthy();
    }
  });

  it('gives the wake lever a scratched plate, a handled handle and a grubby tape', () => {
    const wake = createWakeScreen({});
    document.body.appendChild(wake.element);
    live.push(wake);
    const plate = wake.element.querySelector<HTMLElement>('[data-part="plate"]') as HTMLElement;
    const handle = wake.element.querySelector<HTMLElement>('[data-part="handle"]') as HTMLElement;
    const tape = wake.element.querySelector<HTMLElement>('[data-part="tape"]') as HTMLElement;
    // First on the plate, so the screws, the slot and the handle are over it.
    expect(marks(plate, 'scuff')).toHaveLength(1);
    expect(plate.firstElementChild).toBe(marks(plate, 'scuff')[0]);
    expect(marks(plate, 'scuff')[0]?.style.opacity).toBe(String(GRIME.wake.opacity));
    // Under the grip's ribs.
    expect(marks(handle, 'tarnish')).toHaveLength(1);
    expect(handle.firstElementChild).toBe(marks(handle, 'tarnish')[0]);
    expect(tight(tape.style.backgroundImage)).toBe(tight(ink.tapeGrime));
  });

  it('stains a corner of the paper tag', () => {
    const { element } = board();
    const layer = createTipLayer({ board: element });
    live.push(layer);
    expect(tight(layer.element.style.backgroundImage)).toBe(tight(ink.tipGrime));
    expect(layer.element.style.backgroundColor).toBe(ink.tipPaper);
  });

  it('gives nothing two, and leaves alone what was already old', () => {
    const { element } = board();
    // No host anywhere carries more than one of any mark.
    for (const kind of ['scuff', 'tarnish']) {
      for (const mark of element.querySelectorAll<HTMLElement>(`[data-part="${kind}"]`)) {
        expect(marks(mark.parentElement as HTMLElement, kind).length, kind).toBe(1);
      }
    }
    // The hammer has its dents and chipped paint, and the guarded button its
    // rust, chips, cracks and scuffs (gt#114, gt#115): neither was given a patch.
    for (const old of ['smash', 'apart']) {
      const host = element.querySelector<HTMLElement>(`[data-part="${old}"]`) as HTMLElement;
      expect(host.querySelectorAll('[data-part="tarnish"]'), old).toHaveLength(0);
    }
    // A plate and a box were scratched and rusted already; the pass put
    // nothing on the plate itself.
    for (const plate of element.querySelectorAll<HTMLElement>('[data-module],[data-mod]')) {
      expect(marks(plate, 'scuff')).toHaveLength(0);
      expect(marks(plate, 'tarnish')).toHaveLength(0);
    }
    // MEGADRIFT has a bar like any lever, and the bar is tarnished like any
    // bar — the band beside its slot that gt#117 took off is still off.
    const lever = element.querySelector<HTMLElement>('[data-control="g.megadrift"]') as HTMLElement;
    expect(lever.querySelector<HTMLElement>('[data-part="wear"]')?.style.opacity).toBe('0');
    expect(marks(lever.querySelector('[data-part="bar"]') as HTMLElement, 'tarnish')).toHaveLength(1);
  });
});
