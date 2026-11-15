// @vitest-environment happy-dom
//
// The one plate all nine source modules are instances of. The claim the issue
// makes — "modules are content, not code" — is testable in exactly one way: build
// every module from the definition list and check that what comes out differs
// only where the definitions differ. That is most of this file.
//
// The geometry is pinned to the original design's plate the way the control's
// is pinned to its control: a slipped digit fails here rather than surviving
// until someone notices a screw sits proud of its corner.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOARD, FADER, GAUGE, MODULE, RUPTURE, TAPE, UNLIT } from '../src/ui/constants';
import { CONTROLS, createModule, JACK, OFTEN_WORDS, SOURCE_DEFS, sourceDefs, zoneDefs } from '../src/ui';
import { gaugeFor, rustLay, scratchLay } from '../src/ui/module';
import type { ModuleHandle, ModuleSpec, ModuleState, SourceDef } from '../src/ui';
import {
  POST_HANDOFF_SOURCES,
  SOURCE_IDS,
  STRIKE_IDS,
  VOICE_MODES,
  type SourceId,
} from '../src/engine/constants';
import { plate, signals, sourcePlates, textureLayers } from '../src/tokens';

const live: ModuleHandle[] = [];

interface Touch {
  handle: ModuleHandle;
  toggles: Array<[SourceId, boolean]>;
  inputs: Array<[SourceId, string, number]>;
  commits: string[];
  presses: SourceId[];
  jabs: SourceId[];
}

const REST: ModuleState = { on: true, loud: 0.5, char: 0.5, often: 2 };

/** A mounted module with every callback recorded. */
function build(def: SourceDef, spec: Partial<ModuleSpec> = {}): Touch {
  const toggles: Array<[SourceId, boolean]> = [];
  const inputs: Array<[SourceId, string, number]> = [];
  const commits: string[] = [];
  const presses: SourceId[] = [];
  const jabs: SourceId[] = [];
  const handle = createModule({
    def,
    state: REST,
    ...spec,
    onToggle: (id, on) => toggles.push([id, on]),
    onInput: (id, param, value) => inputs.push([id, param, value]),
    onCommit: (key) => commits.push(key),
    onPress: (id) => presses.push(id),
    onJackDown: (id) => jabs.push(id),
  });
  live.push(handle);
  document.body.appendChild(handle.element);
  return { handle, toggles, inputs, commits, presses, jabs };
}

/** Every module on the board at once, in build order. */
const wholeBoard = (spec: Partial<ModuleSpec> = {}): Touch[] =>
  sourceDefs().map((def) => build(def, spec));

const part = (handle: ModuleHandle, name: string): HTMLElement | null =>
  handle.element.querySelector<HTMLElement>(`[data-part="${name}"]`);

const parts = (handle: ModuleHandle, name: string): HTMLElement[] => [
  ...handle.element.querySelectorAll<HTMLElement>(`[data-part="${name}"]`),
];

/** One of this module's controls, by param. */
const control = (handle: ModuleHandle, param: string): HTMLElement | null =>
  handle.element.querySelector<HTMLElement>(`[data-control="${handle.id}.${param}"]`);

/** The DOM re-serializes a gradient with spaces after its commas; tokens do not. */
const tight = (value: string | undefined): string => (value ?? '').replace(/,\s+/g, ',');

const labels = (handle: ModuleHandle): string[] =>
  [...handle.element.querySelectorAll<HTMLElement>('[data-control] [data-part="tape"]')].map(
    (tape) => tape.textContent ?? '',
  );

afterEach(() => {
  while (live.length) live.pop()?.destroy();
  document.body.innerHTML = '';
});

describe('the definition list', () => {
  it('covers all eleven sources and nothing else', () => {
    expect(Object.keys(SOURCE_DEFS)).toEqual([...SOURCE_IDS]);
    expect(sourceDefs().map((def) => def.id)).toEqual([...SOURCE_IDS]);
  });

  it('takes its archetype from the engine, so the two can never disagree', () => {
    const strikes = sourceDefs()
      .filter((def) => def.type === 'strike')
      .map((def) => def.id);
    expect(strikes).toEqual([...STRIKE_IDS]);
  });

  it('names every module the way the reference board names it', () => {
    // The nine it drew. THROAT and LASER CANNON arrived after it (gt#42) and are
    // registered in POST_HANDOFF_SOURCES; ../src/ui/words' suite is where their
    // absence from the reference is asserted rather than assumed.
    const drawn = sourceDefs().filter((def) => !POST_HANDOFF_SOURCES.includes(def.id));

    expect(Object.fromEntries(drawn.map((def) => [def.id, def.name]))).toEqual({
      guitar: 'GUITAR WALL',
      bass: 'BASS',
      chainsaw: 'CHAINSAW',
      sax: 'SAXOPHONE',
      slowhit: 'SLOW HIT',
      cymbal: 'CYMBAL SWELL',
      voice: 'THE VOICE',
      maracas: 'MARACAS',
      cow: 'COW',
    });
    expect(drawn).toHaveLength(SOURCE_IDS.length - POST_HANDOFF_SOURCES.length);
  });

  it('gives character words to THE VOICE alone, one per MODE', () => {
    const worded = sourceDefs().filter((def) => def.charWords);
    expect(worded.map((def) => def.id)).toEqual(['voice']);
    expect(worded[0]?.charWords).toHaveLength(VOICE_MODES.length);
  });

  it('splits the eleven across the four wells, in build order', () => {
    expect(zoneDefs('foundation').map((def) => def.id)).toEqual(['guitar', 'bass']);
    expect(zoneDefs('pulse').map((def) => def.id)).toEqual(['slowhit', 'cymbal']);
    // THROAT sits under THE VOICE and builds before it, so the well reads in the
    // engine's order rather than in the order the two were written (gt#42).
    expect(zoneDefs('voice').map((def) => def.id)).toEqual(['throat', 'voice']);
    expect(zoneDefs('junk').map((def) => def.id)).toEqual([
      'chainsaw',
      'sax',
      'maracas',
      'cow',
      'laser',
    ]);
  });

  it('lays one plate across the whole of its well, and it is the cannon (gt#75)', () => {
    const wide = sourceDefs().filter((def) => def.wide);

    expect(wide.map((def) => def.id)).toEqual(['laser']);
  });

  it('leaves no cell empty beside anything in a well with a wide plate in it', () => {
    // The hole, as a property. LASER CANNON used to start a third row of a
    // two-column grid and leave the cell beside it blank. A wide plate takes a
    // row to itself — so everything before it has to come out even, and it has
    // to be last, or the grid opens a gap ahead of it to make room.
    for (const zone of ['pulse', 'voice', 'junk', 'foundation'] as const) {
      const defs = zoneDefs(zone);
      const at = defs.findIndex((def) => def.wide);
      if (at < 0) continue;

      expect(at, zone).toBe(defs.length - 1);
      expect(defs.filter((def) => !def.wide).length % 2, zone).toBe(0);
    }
  });
});

describe('one plate, nine modules', () => {
  it('builds every module from data alone, tagged with what it is', () => {
    for (const { handle } of wholeBoard()) {
      const def = SOURCE_DEFS[handle.id];
      expect(handle.element.dataset.module).toBe(def.id);
      expect(handle.element.dataset.zone).toBe(def.zone);
      expect(handle.element.dataset.type).toBe(def.type);
      expect(part(handle, 'name')?.textContent, def.id).toBe(def.name);
    }
  });

  it('paints each plate in its own colours and nobody else’s', () => {
    for (const { handle } of wholeBoard()) {
      const skin = sourcePlates[handle.id];
      expect(tight(handle.element.style.background), handle.id).toBe(tight(skin.plate));
      expect(tight(part(handle, 'glow')?.style.background), handle.id).toContain(tight(skin.tint));
    }
  });

  it('gives a drone power, HOW LOUD and character — and a strike HOW OFTEN too', () => {
    /** The word each control was built with, taped or not. */
    const words = (handle: ModuleHandle): string[] =>
      [...handle.element.querySelectorAll<HTMLElement>('[data-control]')].map(
        (element) => element.dataset.label ?? '',
      );

    for (const { handle } of wholeBoard()) {
      const def = SOURCE_DEFS[handle.id];
      expect(words(handle), def.id).toEqual(
        def.type === 'strike'
          ? [def.char.label, CONTROLS.loud.label, CONTROLS.often.label]
          : [def.char.label, CONTROLS.loud.label],
      );
      // What is *taped* is everything but HOW LOUD (gt#90), which has a gauge cut
      // beside its fader instead of the same two words under all eleven.
      expect(labels(handle), def.id).toEqual(
        def.type === 'strike' ? [def.char.label, CONTROLS.often.label] : [def.char.label],
      );
      const often = control(handle, 'often');
      if (def.type === 'strike') expect(often, def.id).not.toBeNull();
      else expect(often, def.id).toBeNull();
    }
  });

  it('makes character a choice on THE VOICE and an amount everywhere else', () => {
    // What each is cut from is the module's own business since gt#51, so this is
    // held as the rule rather than as two kinds: a choice is something that
    // steps, an amount is something that sweeps, and only THE VOICE is a choice.
    const steps = ['selector', 'lever', 'toggles'];
    const sweeps = ['knob', 'lever', 'wheel', 'fader'];
    for (const { handle } of wholeBoard()) {
      const element = control(handle, 'char');
      const choice = element?.querySelector('[data-part="word"]') !== null;
      expect(choice, handle.id).toBe(handle.id === 'voice');
      expect(choice ? steps : sweeps, handle.id).toContain(element?.dataset.kind);
    }
    const voice = build(SOURCE_DEFS.voice, { state: { ...REST, char: 2 } });
    expect(control(voice.handle, 'char')?.querySelector('[data-part="word"]')?.textContent).toBe(
      'SHRIEK',
    );
  });

  it('spells HOW OFTEN out in words, never in numbers', () => {
    const { handle } = build(SOURCE_DEFS.cymbal, { state: { ...REST, often: 4 } });
    const often = control(handle, 'often');
    expect(often?.querySelector('[data-part="word"]')?.textContent).toBe(OFTEN_WORDS[4]);
    expect(handle.element.textContent ?? '').not.toMatch(/[0-9]/);
  });

  it('shrinks the character knob in THE JUNK DRAWER, where four modules share a corner', () => {
    const guitar = build(SOURCE_DEFS.guitar).handle;
    const chainsaw = build(SOURCE_DEFS.chainsaw).handle;
    const seat = (handle: ModuleHandle): string =>
      control(handle, 'char')?.querySelector<HTMLElement>('[data-part="seat"]')?.style.width ?? '';
    expect(seat(guitar)).toBe(`${MODULE.char.diameter}px`);
    expect(seat(chainsaw)).toBe(`${MODULE.char.junkDiameter}px`);
  });

  it('opens every control on the value it was handed', () => {
    const state: ModuleState = { on: true, loud: 0.25, char: 0.75, often: 1 };
    const { handle } = build(SOURCE_DEFS.slowhit, { state });
    const cap = control(handle, 'loud')?.querySelector<HTMLElement>('[data-part="cap"]');
    expect(cap?.style.bottom).toBe(`${Math.round(0.25 * (MODULE.loud.height - 14))}px`);
    expect(control(handle, 'often')?.querySelector('[data-part="word"]')?.textContent).toBe(
      OFTEN_WORDS[1],
    );
  });
});

describe('weather and hardware', () => {
  it('ages each plate to its own rust ceiling, off one board-wide clock', () => {
    for (const { handle } of wholeBoard()) {
      expect(part(handle, 'rust')?.style.opacity, handle.id).toBe(
        `calc(${textureLayers.module.rustBase} + var(--weather, 0) * ${sourcePlates[handle.id].rustMax})`,
      );
    }
  });

  it('lets THE JUNK DRAWER get messier than THE FOUNDATION ever does', () => {
    const junk = zoneDefs('junk').map((def) => sourcePlates[def.id].rustMax);
    const foundation = zoneDefs('foundation').map((def) => sourcePlates[def.id].rustMax);
    expect(Math.min(...junk)).toBeGreaterThan(Math.max(...foundation));
  });

  it('sags its name with the melt and carries no blur of its own', () => {
    // gt#109. The melt blurred the names and nothing else, so a heading went
    // soft over a sharp tape and a sharp knob. The blur is one filter on the
    // whole plate now; what is left on the name is the drop.
    for (const def of Object.values(SOURCE_DEFS)) {
      const { handle } = build(def);
      const name = part(handle, 'name');
      expect(name?.style.filter, def.id).toBe('');
      expect(name?.style.getPropertyValue('translate'), def.id).toBe(
        `0 calc(var(--melt, 0) * ${RUPTURE.melt.maxDropPx}px)`,
      );
      expect(name?.style.getPropertyValue('rotate'), def.id).toBe('');
      // Nothing else on the plate blurs by it either: no part of a module
      // answers `--melt` with a filter.
      for (const element of handle.element.querySelectorAll<HTMLElement>('*')) {
        expect(element.style.filter.includes('--melt'), def.id).toBe(false);
      }
    }
  });

  it('leaves a place for the board’s seal as the first thing on its metal', () => {
    // gt#105. Empty: a plate does not know where on the board it is, and the
    // seal is one cut across all of them, so the board fills this in.
    const { handle } = build(SOURCE_DEFS.sax);
    const etch = part(handle, 'etch');
    const laid = [...handle.element.children].map((node) => (node as HTMLElement).dataset.part);

    expect(etch).not.toBeNull();
    expect(etch?.children).toHaveLength(0);
    // Under the plate's own dirt and under everything fixed to it…
    expect(laid.indexOf('etch')).toBeLessThan(laid.indexOf('grain'));
    expect(laid.indexOf('etch')).toBeLessThan(laid.indexOf('scratches'));
    expect(laid.indexOf('etch')).toBeLessThan(laid.indexOf('rust'));
    // …but over the plate, which is over the tint that bleeds out behind it.
    expect(laid.indexOf('etch')).toBeGreaterThan(laid.indexOf('glow'));
    expect(etch?.style.zIndex).toBe('');
    // Clipped to the plate, untouchable, and as old as the board is.
    expect(etch?.style.overflow).toBe('hidden');
    expect(etch?.style.pointerEvents).toBe('none');
    expect(etch?.style.opacity).toBe(`calc(var(--weather, 0) * ${BOARD.seal.weather})`);
  });

  it('lays grain, scratches and rust over every plate, in that order', () => {
    const { handle } = build(SOURCE_DEFS.sax);
    expect(part(handle, 'grain')?.style.opacity).toBe(String(textureLayers.module.grain));
    expect(part(handle, 'grain')?.style.mixBlendMode).toBe('overlay');
    expect(part(handle, 'scratches')?.style.opacity).toBe(String(textureLayers.module.scratches));
    expect(part(handle, 'scratches')?.style.mixBlendMode).toBe('screen');
    expect(part(handle, 'scratches')?.style.backgroundSize).toBe(textureLayers.module.scratchSize);
    expect(part(handle, 'rust')?.style.backgroundSize).toBe(textureLayers.module.rustSize);
  });

  it('sends the rust to the edges and the screw heads, not over the whole plate', () => {
    // The load-bearing half of gt#35. A plate corrodes where water sits — along
    // its edges and in the dish around each of the four screws it draws — and
    // an even wash at any opacity is the thing that read as haze.
    const { handle } = build(SOURCE_DEFS.sax);
    const rust = part(handle, 'rust');
    expect(rust?.style.getPropertyValue('mask-image')).toBe(textureLayers.module.rustMask);
    expect(rust?.style.getPropertyValue('-webkit-mask-image')).toBe(textureLayers.module.rustMask);
    expect(rust?.style.getPropertyValue('mask-repeat')).toBe('no-repeat');
    // One radial per screw, and this component draws exactly four of them.
    expect([...(rust?.style.getPropertyValue('mask-image').matchAll(/radial-gradient/g) ?? [])])
      .toHaveLength(handle.element.querySelectorAll('[data-part="screw"]').length);
  });

  it('does not weep, because a plate has no seam and no room to dry up in', () => {
    // Runs were on every plate once and came straight back off. The tile is
    // 130px tall against a plate of about 135, so a streak spanned the whole
    // plate and was clipped part-way through its fade — nine hard-edged vertical
    // bars on a visible repeat, which is the barcode this asserts against. The
    // runs live on THE FOUNDATION's rivet strip alone; see tests/board.test.ts.
    for (const { handle } of wholeBoard()) {
      expect(part(handle, 'runs'), handle.id).toBeNull();
    }
  });

  it('puts four screws in the four corners, none at the same angle', () => {
    const { handle } = build(SOURCE_DEFS.cow);
    const heads = parts(handle, 'screw');
    expect(heads).toHaveLength(4);
    expect(heads.map((head) => head.dataset.corner)).toEqual(['0', '1', '2', '3']);
    expect(new Set(plate.screwSlotAngles).size).toBe(4);

    // Each head carries exactly one thing: the hairline it was always cut with,
    // or a mark in place of one (gt#36). Never both, and never neither — a screw
    // with a blank head is a bearing, not a fixing.
    for (const head of heads) {
      expect(head.children, head.dataset.corner).toHaveLength(1);
      const only = head.children[0] as HTMLElement;
      expect(['slot', 'mark']).toContain(only.dataset.part);
      // And a slot is still at the angle *its own* corner was cut to, which is
      // the thing the marks could most easily have knocked out of step: the
      // angles are a list of four, and the slots are now a subset of them.
      if (only.dataset.part === 'slot') {
        const angle = plate.screwSlotAngles[Number(head.dataset.corner)];
        expect(only.style.transform, head.dataset.corner).toBe(`rotate(${angle}deg)`);
      }
    }

    expect(heads.map((head) => [head.style.left, head.style.top, head.style.right, head.style.bottom])).toEqual([
      ['4px', '4px', '', ''],
      ['', '4px', '4px', ''],
      ['4px', '', '', '4px'],
      ['', '', '4px', '4px'],
    ]);
  });

  it('cuts a mark into a handful of the board’s screws and leaves the rest alone', () => {
    // The restraint is the feature (gt#36). Every screw a rune would be a themed
    // board, which is the opposite of what was asked for — the detail is meant
    // to be found on a second look, not shown on the first.
    const kinds = (): string[] =>
      wholeBoard()
        .flatMap(({ handle }) => parts(handle, 'screw'))
        .map((head) => (head.children[0] as HTMLElement).dataset.part ?? '');

    const first = kinds();
    expect(first).toHaveLength(SOURCE_IDS.length * 4);
    const marks = first.filter((kind) => kind === 'mark').length;
    expect(marks).toBeGreaterThan(0);
    expect(marks).toBeLessThan(first.length / 3);

    // And the same screws every time the board is built, which is the first law
    // reaching the one decision on this plate that could have been a coin toss.
    expect(kinds()).toEqual(first);
  });
});

describe('power', () => {
  it('lights the lamp, raises the nub and bleeds the tint when a module is on', () => {
    const { handle } = build(SOURCE_DEFS.bass, { state: { ...REST, on: true } });
    expect(part(handle, 'lamp')?.style.background).toBe(signals.lampOn);
    // The reference's ring, and a wider one over it (gt#76).
    expect(tight(part(handle, 'lamp')?.style.boxShadow)).toBe(
      tight(`${signals.lampGlowOn}, ${signals.lampHalo}`),
    );
    expect(part(handle, 'nub')?.style.top).toBe(`${MODULE.toggle.nub.on}px`);
    expect(part(handle, 'glow')?.style.opacity).toBe(String(MODULE.glow.opacityOn));
  });

  it('puts a plate with no power in the dark: shaded, lettering dimmed, controls cooled (gt#76)', () => {
    // Which modules are sounding should be the first thing a glance answers,
    // and an 8px lamp was the whole of the reference's answer.
    const { handle } = build(SOURCE_DEFS.cow, { state: { ...REST, on: false } });

    expect(part(handle, 'shade')?.style.opacity).toBe(String(UNLIT.shade));
    expect(part(handle, 'shade')?.style.background).toBe(plate.unlit);
    expect(part(handle, 'name')?.style.opacity).toBe(String(UNLIT.name));
    expect(part(handle, 'controls')?.style.filter).toBe(UNLIT.controls);
    // …and the shade is not something a hand can land on instead of a knob.
    expect(part(handle, 'shade')?.style.pointerEvents).toBe('none');
  });

  it('takes all of it off again the moment the module is on', () => {
    const { handle } = build(SOURCE_DEFS.cow, { state: { ...REST, on: false } });
    handle.setState({ ...REST, on: true });

    expect(part(handle, 'shade')?.style.opacity).toBe('0');
    expect(part(handle, 'name')?.style.opacity).toBe('1');
    expect(part(handle, 'controls')?.style.filter).toBe('');
  });

  it('shades the plate under the hardware, so the screws go dark and the knobs do not', () => {
    // Document order is paint order for everything that names no `z-index`.
    // The shade comes after the textures and the four screws and before the
    // header and the control row, both of which are lifted over it.
    const { handle } = build(SOURCE_DEFS.cow, { state: { ...REST, on: false } });
    const order = [...handle.element.children].map((child) => (child as HTMLElement).dataset.part);
    const at = order.indexOf('shade');

    expect(at).toBeGreaterThan(order.lastIndexOf('screw'));
    expect(at).toBeGreaterThan(order.indexOf('rust'));
    expect(at).toBeLessThan(order.indexOf('header'));
    expect(at).toBeLessThan(order.indexOf('controls'));
    expect(part(handle, 'header')?.style.zIndex).toBe('1');
    expect(part(handle, 'controls')?.style.zIndex).toBe('1');
  });

  it('is unpowered and never disabled: an off module still takes a touch', () => {
    // The board's first hard rule. A greyed-out knob says *you cannot*; these
    // have to say *nobody has yet* — so nothing is hidden, nothing is inert, and
    // a press on a control of an off module is still reported.
    expect(UNLIT.shade).toBeGreaterThan(0.25);
    expect(UNLIT.shade).toBeLessThan(0.7);
    expect(UNLIT.name).toBeGreaterThanOrEqual(0.4);
    const [saturate, brightness] = [...UNLIT.controls.matchAll(/\(([\d.]+)\)/g)].map((match) => Number(match[1]));
    expect(saturate).toBeGreaterThan(0);
    // Dim, and still brighter than the plate they sit on is left by its shade:
    // that gap is what makes a control on a dark module something to reach for.
    expect(brightness).toBeGreaterThan(1 - UNLIT.shade);
    expect(brightness).toBeLessThan(0.65);
    // And the switch that turns the plate on is dimmed with it and stays the
    // brightest thing on it: findable first, on a module that is otherwise dark.
    const [nub] = [...UNLIT.switch.matchAll(/\(([\d.]+)\)/g)].map((match) => Number(match[1]));
    expect(nub).toBeLessThan(1);
    expect(nub).toBeGreaterThan(brightness ?? NaN);
    const dark = build(SOURCE_DEFS.cow, { state: { ...REST, on: false } });
    expect(part(dark.handle, 'toggle')?.style.filter).toBe(UNLIT.switch);
    dark.handle.setState({ ...REST, on: true });
    expect(part(dark.handle, 'toggle')?.style.filter).toBe('');

    const touch = build(SOURCE_DEFS.cow, { state: { ...REST, on: false } });
    const knob = touch.handle.element.querySelector<HTMLElement>('[data-control="cow.char"]')!;
    expect(knob.style.pointerEvents).toBe('');
    knob.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true, cancelable: true }));
    window.dispatchEvent(new PointerEvent('pointerup'));

    expect(touch.presses).toEqual(['cow']);
  });

  it('is in the dark before the lever as well as after it', () => {
    // Unlike the tint, which waits for the sound. A plate has no power before
    // WAKE IT exactly as much as after, and the board seen through the wake
    // screen should already show which four it opens on.
    const off = build(SOURCE_DEFS.cow, { state: { ...REST, on: false }, woke: false });
    const on = build(SOURCE_DEFS.bass, { state: { ...REST, on: true }, woke: false });

    expect(part(off.handle, 'shade')?.style.opacity).toBe(String(UNLIT.shade));
    expect(part(on.handle, 'shade')?.style.opacity).toBe('0');
  });

  it('darkens all three again when it is off', () => {
    const { handle } = build(SOURCE_DEFS.bass, { state: { ...REST, on: false } });
    expect(part(handle, 'lamp')?.style.background).toBe(signals.lampOff);
    expect(part(handle, 'lamp')?.style.boxShadow).toBe(signals.lampGlowOff);
    expect(part(handle, 'nub')?.style.top).toBe(`${MODULE.toggle.nub.off}px`);
    expect(part(handle, 'glow')?.style.opacity).toBe('0');
  });

  it('holds the tint back until the board has woken, lamp or no lamp', () => {
    const { handle } = build(SOURCE_DEFS.guitar, { state: { ...REST, on: true }, woke: false });
    expect(part(handle, 'glow')?.style.opacity).toBe('0');
    expect(part(handle, 'lamp')?.style.background).toBe(signals.lampOn);
    handle.setWoke(true);
    expect(part(handle, 'glow')?.style.opacity).toBe(String(MODULE.glow.opacityOn));
  });

  it('takes two seconds either way, so a tint arrives rather than appears', () => {
    const { handle } = build(SOURCE_DEFS.cow);
    expect(part(handle, 'glow')?.style.transition).toBe(MODULE.glow.transition);
    expect(part(handle, 'nub')?.style.transition).toBe(MODULE.toggle.transition);
  });

  it('reports the click and draws nothing until the board says so', () => {
    const touch = build(SOURCE_DEFS.sax, { state: { ...REST, on: false } });
    part(touch.handle, 'power')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(touch.toggles).toEqual([['sax', true]]);
    expect(part(touch.handle, 'lamp')?.style.background).toBe(signals.lampOff);

    touch.handle.setState({ ...REST, on: true });
    expect(part(touch.handle, 'lamp')?.style.background).toBe(signals.lampOn);
    part(touch.handle, 'power')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(touch.toggles.at(-1)).toEqual(['sax', false]);
  });
});

describe('the hand on a module', () => {
  const press = (element: HTMLElement | null, clientY = 300): void => {
    element?.dispatchEvent(new PointerEvent('pointerdown', { clientY, button: 0, bubbles: true }));
  };

  it('names the module, the param and the value on every move', () => {
    const touch = build(SOURCE_DEFS.maracas);
    press(control(touch.handle, 'char'));
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: 300 - 150, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    expect(touch.inputs).toEqual([['maracas', 'char', 1]]);
    expect(touch.commits).toEqual(['maracas.char']);
  });

  it('reports a touch on any control, so an off module is never dead', () => {
    const touch = build(SOURCE_DEFS.cow, { state: { ...REST, on: false } });
    for (const param of ['char', 'loud', 'often']) press(control(touch.handle, param));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    expect(touch.presses).toEqual(['cow', 'cow', 'cow']);
    expect(touch.inputs).toEqual([]);
  });

  it('hands the jack to the wire layer, tagged, with no word under it (gt#110)', () => {
    const touch = build(SOURCE_DEFS.chainsaw);
    expect(touch.handle.jack.dataset.jackOut).toBe('chainsaw');
    expect(touch.handle.jack.style.cursor).toBe('crosshair');
    press(touch.handle.jack);
    expect(touch.jabs).toEqual(['chainsaw']);

    // It was captioned OUT. A module has one socket, and one socket has no
    // other end to be told apart from; a chain box has two and keeps both
    // words. Checked on every module, because the caption was every module's.
    for (const def of sourceDefs()) {
      const each = build(def);
      expect(part(each.handle, 'caption'), def.id).toBeNull();
      expect(each.handle.jack.textContent, def.id).toBe('');
      const said = (each.handle.element.textContent ?? '').split(/\s+/);
      expect(said, def.id).not.toContain(JACK.out);
      expect(each.handle.element.textContent ?? '', def.id).not.toMatch(
        new RegExp(`${JACK.out}$`),
      );
      // The socket is still the last thing in the control row, at its far end.
      expect(each.handle.jack.parentElement?.lastElementChild, def.id).toBe(each.handle.jack);
    }
  });

  it('wears the control the board tells it to, and only that one', () => {
    const { handle } = build(SOURCE_DEFS.guitar, { wear: { 'guitar.char': 9 } });
    const halo = (): string =>
      control(handle, 'char')?.querySelector<HTMLElement>('[data-part="wear"]')?.style.opacity ?? '';
    expect(halo()).toBe('0.2');
    handle.setWear('guitar.char', 45);
    expect(halo()).toBe('0.9');
    expect([...handle.controls.keys()]).toEqual(['guitar.char', 'guitar.loud']);
  });

  it('goes quiet completely once destroyed, controls included', () => {
    const touch = build(SOURCE_DEFS.voice);
    press(control(touch.handle, 'char'));
    touch.handle.destroy();
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: 100, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    part(touch.handle, 'power')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    press(touch.handle.jack);
    expect(touch.inputs).toEqual([]);
    expect(touch.toggles).toEqual([]);
    expect(touch.jabs).toEqual([]);
  });
});

describe('the reference', () => {
  it('still holds every size the plate is cut to', () => {
    const pins: Array<[string, unknown, unknown]> = [
      ['padding', MODULE.padding, '7px 10px 9px'],
      ['tint outset', MODULE.glow.outset, 26],
      ['tint gradient', MODULE.glow.origin, 'closest-side'],
      ['tint fade', [plate.glowFade, MODULE.glow.stop], ['rgba(0,0,0,0)', 72]],
      ['tint blur', MODULE.glow.blur, 10],
      ['tint transition', MODULE.glow.transition, 'opacity 2s'],

      ['screw', MODULE.screw.size, 8],
      ['screw corner', MODULE.screw.inset, 4],
      ['screw slot', [MODULE.screw.slotInset, MODULE.screw.slotTop], [1, 3.5]],
      ['screw slot height', MODULE.screw.slotHeight, 1],

      ['header gap', [MODULE.header.gap, MODULE.header.marginBottom], [8, 5]],
      ['name size', [MODULE.name.fontSize, MODULE.name.letterSpacing], [16, 1.8]],
      ['name weight', MODULE.name.weight, 700],

      ['lamp', MODULE.lamp.size, 8],
      ['lamp gap', MODULE.lamp.gap, 6],
      ['lamp transition', MODULE.lamp.transition, 'background 0.3s, box-shadow 0.3s'],
      ['toggle', [MODULE.toggle.width, MODULE.toggle.height], [18, 28]],
      ['toggle radius', MODULE.toggle.radius, 3],
      ['nub', [MODULE.toggle.nub.left, MODULE.toggle.nub.width, MODULE.toggle.nub.height], [3, 12, 11]],
      ['nub radius', MODULE.toggle.nub.radius, 2],
      ['nub travel', [MODULE.toggle.nub.on, MODULE.toggle.nub.off], [3, 14]],
      ['nub transition', MODULE.toggle.transition, 'top 0.18s'],

      ['control row', MODULE.row.gap, 10],
      ['jack', MODULE.jack.size, 22],
      // The jack's column, its caption's type and the word OUT were quoted
      // here. gt#110 took the caption off a module's one socket, so the rows are
      // gone rather than loosened; the box suite still pins both captions.
    ];
    for (const [name, actual, pinned] of pins) expect(actual, name).toEqual(pinned);
  });

  it('still holds the sizes each of a module’s three controls is cut to', () => {
    const pins: Array<[string, unknown, unknown]> = [
      ['character', [MODULE.char.junkDiameter, MODULE.char.diameter, MODULE.char.width, MODULE.char.fontSize], [50, 56, 70, 12]],
      ['character words', [MODULE.charWords.diameter, MODULE.charWords.width, MODULE.charWords.fontSize], [54, 78, 12]],
      // The reference's own fader, quoted as the reference wrote it: 64 tall
      // over a tape. gt#90 took the tape off and gave its height to the throw —
      // see the property test below, which is what holds the departure.
      ['how loud', [MODULE.loud.width, MODULE.loud.fontSize], [58, 10]],
      ['how often', [MODULE.often.diameter, MODULE.often.width, MODULE.often.fontSize], [42, 76, 10]],
    ];
    for (const [name, actual, pinned] of pins) expect(actual, name).toEqual(pinned);
  });

});

// The plate taking its own hit (gt#81).
describe('a struck plate', () => {
  const flash = (handle: ModuleHandle): HTMLElement => part(handle, 'flash')!;

  it('carries a wash of its own bloom colour, dark until it is struck', () => {
    vi.useFakeTimers();
    try {
      const { handle } = build(SOURCE_DEFS.cow, { state: { ...REST, on: true } });

      expect(flash(handle).style.opacity).toBe('0');
      expect(tight(flash(handle).style.background)).toBe(`rgb(${sourcePlates.cow.bloom})`.replace(/,\s*/g, ','));
      // Screened: it lifts what is on the plate rather than painting over it.
      expect(flash(handle).style.mixBlendMode).toBe('screen');
      expect(flash(handle).style.pointerEvents).toBe('none');
    } finally {
      vi.useRealTimers();
    }
  });

  it('lights at once and lets go, by how hard it was hit', () => {
    vi.useFakeTimers();
    try {
      const { handle } = build(SOURCE_DEFS.slowhit, { state: { ...REST, on: true } });
      const { peak, floor, ms } = MODULE.flash;

      handle.flash(1);
      expect(Number(flash(handle).style.opacity)).toBeCloseTo(peak, 3);
      expect(flash(handle).style.transition).toBe('none');

      vi.advanceTimersByTime(0);
      expect(flash(handle).style.opacity).toBe('0');
      expect(flash(handle).style.transition).toContain(`${ms}ms`);

      handle.flash(0);
      expect(Number(flash(handle).style.opacity)).toBeCloseTo(peak * floor, 3);
      handle.flash(0.5);
      expect(Number(flash(handle).style.opacity)).toBeGreaterThan(peak * floor);
      expect(Number(flash(handle).style.opacity)).toBeLessThan(peak);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sits over the shade and under the lettering and the controls', () => {
    const { handle } = build(SOURCE_DEFS.cow);
    const order = [...handle.element.children].map((child) => (child as HTMLElement).dataset.part);

    expect(order.indexOf('flash')).toBeGreaterThan(order.indexOf('shade'));
    expect(order.indexOf('flash')).toBeLessThan(order.indexOf('header'));
    expect(order.indexOf('flash')).toBeLessThan(order.indexOf('controls'));
  });

  it('never moves or filters the plate, so nothing measured against it shifts', () => {
    vi.useFakeTimers();
    try {
      const { handle } = build(SOURCE_DEFS.slowhit, { state: { ...REST, on: true } });
      const before = handle.element.style.cssText;

      handle.flash(1);

      expect(handle.element.style.cssText).toBe(before);
      expect(handle.element.style.transform).toBe('');
      expect(handle.element.style.filter).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets go of its timer with the plate', () => {
    vi.useFakeTimers();
    try {
      const { handle } = build(SOURCE_DEFS.slowhit, { state: { ...REST, on: true } });

      handle.flash(1);
      const lit = flash(handle).style.opacity;
      handle.destroy();
      vi.advanceTimersByTime(50);

      expect(flash(handle).style.opacity).toBe(lit);
    } finally {
      vi.useRealTimers();
    }
  });
});

// Scratches that stop falling the same way across every plate (gt#89).
describe('how the scratch tile is laid on each plate', () => {
  const ids = Object.keys(SOURCE_DEFS);
  const tile = parseInt(textureLayers.module.scratchSize, 10);
  /** Turned over on one axis and not the other: the marks lean the other way. */
  const mirrored = (id: string): boolean => scratchLay(id).flipX * scratchLay(id).flipY < 0;

  it('is the same on every load, because it is the module’s own', () => {
    for (const id of ids) expect(scratchLay(id), id).toEqual(scratchLay(id));
  });

  it('starts the tile somewhere of its own on every plate', () => {
    const starts = ids.map((id) => `${scratchLay(id).x},${scratchLay(id).y}`);

    expect(new Set(starts).size).toBe(ids.length);
    for (const id of ids) {
      const { x, y } = scratchLay(id);
      expect(x, id).toBeGreaterThanOrEqual(0);
      expect(x, id).toBeLessThan(tile);
      expect(y, id).toBeGreaterThanOrEqual(0);
      expect(y, id).toBeLessThan(tile);
    }
  });

  it('leans the marks both ways across the board, so they stop reading as rain', () => {
    // The whole of the issue. Eleven plates with one diagonal across all of
    // them is weather; a board where neither direction has it to itself is
    // eleven pieces of salvage. At least four each way, of eleven.
    const turned = ids.filter(mirrored).length;

    expect(turned).toBeGreaterThanOrEqual(4);
    expect(ids.length - turned).toBeGreaterThanOrEqual(4);
  });

  it('is what the plate’s scratch layer is actually drawn with', () => {
    for (const def of sourceDefs()) {
      const { handle } = build(def);
      const lay = scratchLay(def.id);
      const style = part(handle, 'scratches')?.style;

      expect(style?.backgroundPosition, def.id).toBe(`${lay.x}px ${lay.y}px`);
      expect(style?.transform, def.id).toBe(`scale(${lay.flipX}, ${lay.flipY})`);
      // Still the one tile, at the one size: nothing new is fetched or drawn.
      expect(style?.backgroundImage, def.id).toBe('var(--scratchTex)');
      expect(style?.backgroundSize, def.id).toBe(textureLayers.module.scratchSize);
    }
  });

  it('turns over the layer and never the plate', () => {
    const { handle } = build(SOURCE_DEFS.slowhit);

    expect(handle.element.style.transform).toBe('');
    expect(part(handle, 'scratches')?.style.pointerEvents).toBe('none');
  });
});

// HOW LOUD without the tape (gt#90): a gauge cut beside every fader, each
// module's own, lit up to the level.
describe('how loud, said without the word', () => {
  const gauge = (handle: ModuleHandle): HTMLElement | null =>
    handle.element.querySelector<HTMLElement>('[data-control$=".loud"] [data-part="gauge"]');

  it('cuts a gauge beside every module’s fader and tapes nothing under it', () => {
    for (const def of sourceDefs()) {
      const { handle } = build(def);
      const loud = control(handle, 'loud');

      expect(gauge(handle), def.id).not.toBeNull();
      expect(loud?.querySelector('[data-part="tape"]'), def.id).toBeNull();
      // The word is still on the control, which is what a hover reads.
      expect(loud?.dataset.label, def.id).toBe(CONTROLS.loud.label);
    }
  });

  it('spends the tape’s height on the fader’s throw, and comes out no taller', () => {
    // The departure from the reference's 64. A tape and the gap over it took
    // about nineteen pixels; the fader takes fourteen of them and the column
    // keeps the rest, so no module's row grew for this.
    const tape = TAPE.gap + MODULE.loud.fontSize * TAPE.lineHeight + 2 * TAPE.padY;
    expect(MODULE.loud.height).toBeGreaterThan(64);
    expect(MODULE.loud.height).toBeLessThanOrEqual(64 + tape);
    // And further to travel: the cap moves a fifth again as far as it did.
    expect((MODULE.loud.height - FADER.capHeight) / (64 - FADER.capHeight)).toBeGreaterThan(1.2);
  });

  it('deals each module a gauge of its own, and the same one every time', () => {
    for (const id of SOURCE_IDS) expect(gaugeFor(id), id).toEqual(gaugeFor(id));

    const cut = (id: string): string => {
      const { shape, count, side } = gaugeFor(id);
      return `${shape}/${count}/${side}`;
    };
    // Every shape is on the board, none has it to itself, and both sides of the
    // lane are used. Eleven tapes were one stamp; this must not be another.
    for (const shape of GAUGE.shapes) {
      const wearing = SOURCE_IDS.filter((id) => gaugeFor(id).shape === shape).length;
      expect(wearing, shape).toBeGreaterThanOrEqual(2);
      expect(wearing, shape).toBeLessThanOrEqual(4);
    }
    for (const side of GAUGE.sides) {
      expect(SOURCE_IDS.filter((id) => gaugeFor(id).side === side).length, side).toBeGreaterThanOrEqual(4);
    }
    expect(new Set(SOURCE_IDS.map(cut)).size).toBeGreaterThanOrEqual(8);
  });

  it('never gives two modules in one well the same shape side by side', () => {
    for (const zone of ['pulse', 'voice', 'junk', 'foundation'] as const) {
      const shapes = zoneDefs(zone).map((def) => gaugeFor(def.id).shape);
      for (let i = 1; i < shapes.length; i += 1) {
        expect(shapes[i], `${zone} ${i}`).not.toBe(shapes[i - 1]);
      }
    }
  });

  it('still cuts one for a plate the engine does not list', () => {
    const spec = gaugeFor('somebody-elses-module');

    expect(GAUGE.shapes).toContain(spec.shape);
    expect(GAUGE.counts).toContain(spec.count);
    expect(GAUGE.sides).toContain(spec.side);
  });

  it('draws the gauge it was dealt', () => {
    for (const def of sourceDefs()) {
      const { handle } = build(def);
      const spec = gaugeFor(def.id);

      expect(gauge(handle)?.dataset.shape, def.id).toBe(spec.shape);
      expect(gauge(handle)?.dataset.side, def.id).toBe(spec.side);
      const notches = gauge(handle)?.querySelectorAll('[data-part="notch"]').length;
      expect(notches, def.id).toBe(spec.shape === 'wedge' ? 0 : spec.count);
    }
  });
});

// What a module's controls are made of (gt#51): its own business, named in its
// definition, with the usual parts where it says nothing.
describe('a module naming its own hardware', () => {
  const kindOf = (handle: ModuleHandle, param: string): string | undefined =>
    control(handle, param)?.dataset.kind;
  /** A definition with hardware of the case's choosing, off a real one. */
  const cut = (id: SourceId, hardware: SourceDef['hardware']): SourceDef => ({
    ...SOURCE_DEFS[id],
    ...(hardware ? { hardware } : {}),
  });
  const bare = (id: SourceId): SourceDef => {
    const { hardware: _dropped, ...rest } = SOURCE_DEFS[id];
    return rest;
  };

  it('gives a module that says nothing the parts every module used to have', () => {
    expect(kindOf(build(bare('guitar')).handle, 'char')).toBe('knob');
    expect(kindOf(build(bare('voice')).handle, 'char')).toBe('selector');
    expect(kindOf(build(bare('slowhit')).handle, 'often')).toBe('selector');
    // And HOW LOUD is a fader whatever anyone says: the gauge is a fader's.
    for (const def of sourceDefs()) expect(kindOf(build(def).handle, 'loud'), def.id).toBe('fader');
  });

  it('cuts the character control from whatever the definition names', () => {
    for (const kind of ['lever', 'wheel', 'fader', 'knob'] as const) {
      const { handle } = build(cut('bass', { char: kind }));
      expect(kindOf(handle, 'char'), kind).toBe(kind);
      // Still the same control: same word, same key, same gesture reported.
      expect(control(handle, 'char')?.dataset.label, kind).toBe(SOURCE_DEFS.bass.char.label);
      expect(control(handle, 'char')?.dataset.control, kind).toBe('bass.char');
    }
  });

  it('keeps a choice a choice, whatever it is cut from', () => {
    for (const kind of ['selector', 'lever', 'toggles'] as const) {
      const touch = build(cut('voice', { char: kind }), { state: { ...REST, char: 1 } });
      const mode = control(touch.handle, 'char');

      expect(mode?.dataset.kind, kind).toBe(kind);
      expect(mode?.querySelector('[data-part="word"]')?.textContent, kind).toBe(
        SOURCE_DEFS.voice.charWords?.[1],
      );
    }
  });

  it('cuts HOW OFTEN from a lever or a bank, and turns either over so up means more', () => {
    for (const kind of ['lever', 'toggles'] as const) {
      const { handle } = build(cut('slowhit', { often: kind }), { state: { ...REST, often: 0 } });
      const often = control(handle, 'often');

      expect(often?.dataset.kind, kind).toBe(kind);
      expect(often?.querySelector('[data-part="word"]')?.textContent, kind).toBe(OFTEN_WORDS[0]);
      if (kind === 'lever') {
        // *constantly* is the lever thrown to the top.
        const bar = often?.querySelector<HTMLElement>('[data-part="bar"]');
        expect(parseFloat(bar?.style.bottom ?? 'NaN')).toBeGreaterThan(0);
      } else {
        const up = [...(often?.querySelectorAll<HTMLElement>('[data-part="bat"]') ?? [])].filter(
          (bat) => bat.style.top === '2px',
        );
        expect(up).toHaveLength(OFTEN_WORDS.length - 1);
      }
    }
  });

  it('reports a turned-over HOW OFTEN as the value, not as where the lever is', () => {
    const touch = build(cut('slowhit', { often: 'lever' }), { state: { ...REST, often: 2 } });
    const often = control(touch.handle, 'often')!;

    often.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true, cancelable: true, clientY: 300 }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: 300 - 150 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientY: 150 }));

    // Dragged to the top: the most often there is, which is step 0.
    expect(touch.inputs[touch.inputs.length - 1]).toEqual(['slowhit', 'often', 0]);
  });

  it('comes out the same height whatever it is cut from', () => {
    // Round things take a diameter and things with a throw take a height; the
    // two are the same number per role, so a plate's row does not depend on
    // what it was salvaged from.
    expect(MODULE.char.throwHeight).toBe(MODULE.char.diameter);
    expect(MODULE.often.throwHeight).toBe(MODULE.often.diameter);

    const seat = (def: SourceDef, param: string): string | undefined =>
      control(build(def).handle, param)?.querySelector<HTMLElement>('[data-part="seat"]')?.style.height;
    expect(seat(cut('bass', { char: 'lever' }), 'char')).toBe(`${MODULE.char.throwHeight}px`);
    expect(seat(cut('bass', { char: 'wheel' }), 'char')).toBe(`${MODULE.char.diameter}px`);
    expect(seat(cut('slowhit', { often: 'lever' }), 'often')).toBe(`${MODULE.often.throwHeight}px`);
  });
});

// Which module carries what (gt#51): the taste half of the issue, held only to
// the thing the whole thread exists to prevent.
describe('eleven plates, not one parts bin', () => {
  const made = (param: 'char' | 'often'): Array<string | undefined> =>
    sourceDefs()
      .map((def) => control(build(def).handle, param)?.dataset.kind)
      .filter((kind) => kind !== undefined);

  it('cuts the character controls from at least three kinds, and no kind takes most of them', () => {
    const kinds = made('char');

    expect(new Set(kinds).size).toBeGreaterThanOrEqual(3);
    // A knob is still the usual thing, and is allowed to be: what is not
    // allowed is a plate of identical round knobs with a token exception.
    const most = Math.max(...[...new Set(kinds)].map((kind) => kinds.filter((k) => k === kind).length));
    expect(most).toBeLessThanOrEqual(8);
    expect(kinds.filter((kind) => kind !== 'knob').length).toBeGreaterThanOrEqual(3);
  });

  it('cuts HOW OFTEN from more than one kind', () => {
    const kinds = made('often');

    expect(kinds).toHaveLength(STRIKE_IDS.length);
    expect(new Set(kinds).size).toBeGreaterThanOrEqual(2);
    expect(kinds.filter((kind) => kind !== 'selector').length).toBeGreaterThanOrEqual(2);
  });

  it('never seats two modules with the same pair of parts side by side in a well', () => {
    for (const zone of ['pulse', 'voice', 'junk', 'foundation'] as const) {
      const pairs = zoneDefs(zone).map((def) => {
        const { handle } = build(def);
        return `${control(handle, 'char')?.dataset.kind}/${control(handle, 'often')?.dataset.kind ?? '-'}`;
      });
      for (let i = 1; i < pairs.length; i += 1) expect(pairs[i], `${zone} ${i}`).not.toBe(pairs[i - 1]);
    }
  });

  it('turns over every HOW OFTEN that has an up, and no selector', () => {
    for (const def of sourceDefs()) {
      const often = control(build(def).handle, 'often');
      if (!often) continue;
      expect(often.dataset.inverted !== undefined, def.id).toBe(often.dataset.kind !== 'selector');
    }
  });

  it('names hardware only where a module differs, so the usual stays the default', () => {
    for (const def of sourceDefs()) {
      if (!def.hardware) continue;
      const usualChar = def.charWords ? 'selector' : 'knob';
      const differs =
        (def.hardware.char !== undefined && def.hardware.char !== usualChar) ||
        (def.hardware.often !== undefined && def.hardware.often !== 'selector');
      expect(differs, def.id).toBe(true);
      // And never a rate on something that has none.
      if (def.type === 'drone') expect(def.hardware.often, def.id).toBeUndefined();
    }
  });
});

// Each plate's own lay of the rust tile (gt#100): every module used to rust in
// the same places.
describe('how the rust tile is laid on each plate', () => {
  const ids = Object.keys(SOURCE_DEFS);

  it('is the same on every load, and different on every plate', () => {
    for (const id of ids) expect(rustLay(id), id).toEqual(rustLay(id));
    expect(new Set(ids.map((id) => `${rustLay(id).x},${rustLay(id).y}`)).size).toBe(ids.length);
  });

  it('turns some plates over left to right, and none top to bottom', () => {
    const flips = ids.map((id) => rustLay(id).flip);

    expect(flips.filter((flip) => flip === -1).length).toBeGreaterThanOrEqual(3);
    expect(flips.filter((flip) => flip === 1).length).toBeGreaterThanOrEqual(3);
    // Rust runs downward. A tile turned top to bottom has its streaks climbing.
    for (const def of sourceDefs()) {
      const transform = part(build(def).handle, 'rust')?.style.transform ?? '';
      expect(transform, def.id).toMatch(/^scaleX\((-1|1)\)$/);
    }
  });

  it('is what the plate’s rust layer is actually drawn with, and it is not the scratch lay', () => {
    for (const def of sourceDefs()) {
      const { handle } = build(def);
      const lay = rustLay(def.id);
      const style = part(handle, 'rust')?.style;

      expect(style?.backgroundPosition, def.id).toBe(`${lay.x}px ${lay.y}px`);
      expect(style?.transform, def.id).toBe(`scaleX(${lay.flip})`);
      expect(`${lay.x},${lay.y}`, def.id).not.toBe(`${scratchLay(def.id).x},${scratchLay(def.id).y}`);
      // Turned over with its mask, which is the same either way round.
      expect(style?.getPropertyValue('mask-image'), def.id).toBe(textureLayers.module.rustMask);
    }
  });
});
