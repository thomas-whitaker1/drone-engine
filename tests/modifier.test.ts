// @vitest-environment happy-dom
//
// The one box all four modifiers are instances of. The same claim ./module.test
// makes about the nine plates is made here about the four boxes: build every one
// from the definition list and check that what comes out differs only where the
// definitions differ.
//
// The one behaviour worth its own tests is the lamp. It answers the patch rather
// than the amount, so the interesting case is not a lit box — it is a box turned
// all the way up with nothing feeding it, which must still read as dark.

import { afterEach, describe, expect, it } from 'vitest';
import { BOX, FADER, LEVER, RUPTURE, TAPE, UNLIT } from '../src/ui/constants';
import {
  createModifier,
  JACK,
  MODIFIER_DEFS,
  MODIFIER_SCOPE,
  modifierDefs,
} from '../src/ui';
import type { ModifierDef, ModifierHandle, ModifierSpec, ModifierState } from '../src/ui';
import { MODIFIER_IDS, POST_HANDOFF_BOXES, type ModifierId } from '../src/engine/constants';
import { jack as jackTokens, modifierPlates, plate, signals, textureLayers } from '../src/tokens';

const live: ModifierHandle[] = [];

interface Touch {
  handle: ModifierHandle;
  inputs: Array<[ModifierId, number]>;
  commits: string[];
  presses: ModifierId[];
  jabs: ModifierId[];
}

const REST: ModifierState = { amount: 0.5, fed: true };

/** A mounted box with every callback recorded. */
function build(def: ModifierDef, spec: Partial<ModifierSpec> = {}): Touch {
  const inputs: Array<[ModifierId, number]> = [];
  const commits: string[] = [];
  const presses: ModifierId[] = [];
  const jabs: ModifierId[] = [];
  const handle = createModifier({
    def,
    state: REST,
    ...spec,
    onInput: (id, value) => inputs.push([id, value]),
    onCommit: (key) => commits.push(key),
    onPress: (id) => presses.push(id),
    onJackDown: (id) => jabs.push(id),
  });
  live.push(handle);
  document.body.appendChild(handle.element);
  return { handle, inputs, commits, presses, jabs };
}

/** The whole chain at once, in stack order. */
const wholeChain = (spec: Partial<ModifierSpec> = {}): Touch[] =>
  modifierDefs().map((def) => build(def, spec));

const part = (handle: ModifierHandle, name: string): HTMLElement | null =>
  handle.element.querySelector<HTMLElement>(`[data-part="${name}"]`);

/** The DOM re-serializes a gradient with spaces after its commas; tokens do not. */
const tight = (value: string | undefined): string => (value ?? '').replace(/,\s+/g, ',');

const press = (element: HTMLElement | null, clientY = 300): void => {
  element?.dispatchEvent(new PointerEvent('pointerdown', { clientY, button: 0, bubbles: true }));
};

afterEach(() => {
  while (live.length) live.pop()?.destroy();
  document.body.innerHTML = '';
});

/** The four boxes the reference board actually draws. See POST_HANDOFF_BOXES. */
const HANDOFF_DEFS = modifierDefs().filter((def) => !POST_HANDOFF_BOXES.includes(def.id));

describe('the definition list', () => {
  it('covers every box and nothing else', () => {
    expect(Object.keys(MODIFIER_DEFS)).toEqual([...MODIFIER_IDS]);
    expect(modifierDefs().map((def) => def.id)).toEqual([...MODIFIER_IDS]);
  });

  it('lays the rack out in the order the signal actually takes', () => {
    // Pinned for the four the reference draws. gt#41 added three it has never
    // had. The register itself is checked in tests/modifiers.test.ts.
    expect(HANDOFF_DEFS.map((def) => def.id)).toEqual(['grit', 'murk', 'wobble', 'cavern']);
  });

  it('names every box the reference has the way the reference names it', () => {
    expect(HANDOFF_DEFS.map((def) => def.word.label)).toEqual(['GRIT', 'MURK', 'WOBBLE', 'CAVERN']);
  });

  it('cuts each box to exactly one of the round kinds or the vertical ones', () => {
    for (const def of modifierDefs()) {
      const round = def.kind === 'knob' || def.kind === 'wheel';
      expect(def.diameter === undefined, def.id).toBe(!round);
      expect(def.height === undefined, def.id).toBe(round);
    }
    // Seven boxes across four kinds, so two kinds appear twice — deliberately,
    // and in pairs that mean something. The two faders are the boxes that measure
    // something out; the two levers are the ones that manhandle the signal.
    expect(modifierDefs().filter((def) => def.kind === 'fader').map((def) => def.id)).toEqual([
      'murk',
      'offset',
    ]);
    expect(modifierDefs().filter((def) => def.kind === 'lever').map((def) => def.id)).toEqual([
      'grit',
      'magnets',
    ]);
    // And no kind is asked to carry three of them, which is where a rack would
    // start reading as one control repeated (gt#34). gt#50 is what widens this.
    const perKind = new Map<string, number>();
    for (const def of modifierDefs()) perKind.set(def.kind, (perKind.get(def.kind) ?? 0) + 1);
    expect(Math.max(...perKind.values())).toBeLessThanOrEqual(2);
  });
});

describe('one box, seven modifiers', () => {
  it('builds every box from data alone, tagged with what it is', () => {
    for (const { handle } of wholeChain()) {
      const def = MODIFIER_DEFS[handle.id];
      expect(handle.element.dataset.mod).toBe(def.id);
      expect(part(handle, 'name')?.textContent, def.id).toBe(def.word.label);
    }
  });

  it('paints each box in its own colours and nobody else’s', () => {
    for (const { handle } of wholeChain()) {
      expect(tight(handle.element.style.background), handle.id).toBe(
        tight(modifierPlates[handle.id].plate),
      );
    }
    // Only a knob draws a face; a fader has none, a wheel is all rim and a lever
    // is a bar in a slot. Read off the definitions rather than listed here, so
    // that a box changing kind cannot leave this loop quietly checking nothing.
    const knobs = modifierDefs().filter((def) => def.kind === 'knob');
    expect(knobs.length).toBeGreaterThan(0);
    for (const { id } of knobs) {
      const { handle } = build(MODIFIER_DEFS[id]);
      expect(tight(part(handle, 'face')?.style.background), id).toContain(modifierPlates[id].face);
    }
  });

  it('gives each box the one control its definition asks for, at its own size', () => {
    // A round kind is square to its diameter; a tall one is its own lane wide and
    // as high as the definition asks. The lane comes from the kind's constants
    // rather than a number written here, which is what keeps this honest when a
    // box changes kind — GRIT went knob to lever under gt#34.
    const lanes: Partial<Record<string, number>> = { fader: FADER.lane, lever: LEVER.lane };
    for (const { handle } of wholeChain()) {
      const def = MODIFIER_DEFS[handle.id];
      const control = handle.control.element;
      expect(control.dataset.kind, def.id).toBe(def.kind);
      expect(control.style.width, def.id).toBe(`${BOX.control.width}px`);
      const seat = control.querySelector<HTMLElement>('[data-part="seat"]');
      expect(seat?.style.width, def.id).toBe(`${def.diameter ?? lanes[def.kind]}px`);
      expect(seat?.style.height, def.id).toBe(`${def.diameter ?? def.height}px`);
    }
  });

  it('says its word once: on the plate, and not again under the control (gt#63)', () => {
    // Every box used to read GRIT beside its lamp and GRIT again on a tape forty
    // pixels below. A module's tapes carry words its plate does not say; a box
    // has one amount, named for the box, so its tape was the same word twice.
    for (const { handle } of wholeChain()) {
      const word = MODIFIER_DEFS[handle.id].word.label;

      expect(handle.element.querySelectorAll('[data-part="tape"]'), handle.id).toHaveLength(0);
      expect(part(handle, 'name')?.textContent, handle.id).toBe(word);
      // The whole box, read as text: the two jack captions and the word, once.
      expect(handle.element.textContent, handle.id).toBe(`IN${word}OUT`);
    }
  });

  it('keeps the word on the control all the same, for whatever needs to ask', () => {
    // The tape was also how the tip layer found out what a control was called.
    // The strip went; the word stayed, on the element.
    for (const { handle } of wholeChain()) {
      expect(handle.control.element.dataset.label, handle.id).toBe(
        MODIFIER_DEFS[handle.id].word.label,
      );
    }
  });

  it('gives the name room over the control, now that it is the only word in the box', () => {
    const { handle } = build(MODIFIER_DEFS.cavern);
    const header = part(handle, 'header');

    expect(header?.style.marginBottom).toBe(`${BOX.header.below}px`);
    expect(BOX.header.below).toBeGreaterThan(BOX.centre.gap);
    // Out of the height the tape gave back, and not all of it: a tape strip is
    // its lettering at the tape's line height plus its padding and the gap over
    // it, and the box must come out shorter than it went in.
    const tape = BOX.control.fontSize * TAPE.lineHeight + 2 * TAPE.padY + TAPE.gap;
    expect(BOX.header.below).toBeLessThan(tape);
  });

  it('melts the name with the board, the way the tape it replaced used to peel', () => {
    // Off `--melt`, which is 0 on every board nobody has armed — so this is a
    // zero drop until COME APART and MURK both say otherwise.
    const { handle } = build(MODIFIER_DEFS.murk);
    const name = part(handle, 'name');

    expect(name?.style.getPropertyValue('translate')).toBe(
      `0 calc(var(--melt, 0) * ${RUPTURE.melt.maxDropPx}px)`,
    );
    // Sagging, never tilted: a tilted name is a broken layout.
    expect(name?.style.getPropertyValue('rotate')).toBe('');
    // And no blur of its own (gt#109). The name used to go soft while the knob
    // beside it and the plate round it stayed sharp; the blur is the whole
    // board's now, one filter on the plate, and a second one here would blur
    // the name twice.
    expect(name?.style.filter).toBe('');
  });

  it('opens every control on the amount it was handed', () => {
    const { handle } = build(MODIFIER_DEFS.murk, { state: { amount: 0.25, fed: true } });
    const cap = handle.control.element.querySelector<HTMLElement>('[data-part="cap"]');
    expect(cap?.style.bottom).toBe(`${Math.round(0.25 * (64 - 14))}px`);
  });

  it('wears each box under one shared scope, so a key reads mods.grit', () => {
    const { handle } = build(MODIFIER_DEFS.grit, { wear: { 'mods.grit': 9 } });
    expect(handle.control.key).toBe(`${MODIFIER_SCOPE}.grit`);
    const halo = (): string =>
      handle.control.element.querySelector<HTMLElement>('[data-part="wear"]')?.style.opacity ?? '';
    expect(halo()).toBe('0.2');
    handle.setWear(45);
    expect(halo()).toBe('0.9');
  });
});

describe('the feed lamp', () => {
  it('lights a box that something feeds', () => {
    const { handle } = build(MODIFIER_DEFS.wobble, { state: { amount: 0, fed: true } });
    expect(part(handle, 'lamp')?.style.background).toBe(signals.lampOn);
    expect(part(handle, 'lamp')?.style.boxShadow.replace(/,\s+/g, ',')).toBe(
      `${signals.lampGlowOn}, ${signals.lampHalo}`.replace(/,\s+/g, ','),
    );
  });

  it('puts a box nothing feeds in the dark, on the same terms as an off plate (gt#76)', () => {
    // Unfed is not in the sound. The rack going dark where the patch does not
    // reach is the signal flow, drawn without a line of it.
    const { handle } = build(MODIFIER_DEFS.doppler, { state: { amount: 0.3, fed: false } });

    expect(part(handle, 'shade')?.style.opacity).toBe(String(UNLIT.shade));
    expect(part(handle, 'shade')?.style.background).toBe(plate.unlit);
    expect(part(handle, 'name')?.style.opacity).toBe(String(UNLIT.name));
    expect(handle.control.element.style.filter).toBe(UNLIT.controls);
  });

  it('leaves both jacks out of it, because an unfed box’s IN is what a hand is looking for', () => {
    const { handle } = build(MODIFIER_DEFS.doppler, { state: { amount: 0.3, fed: false } });

    for (const jack of [handle.jackIn, handle.jackOut]) {
      expect(jack.style.filter).toBe('');
      expect(jack.style.opacity).toBe('');
      expect(jack.parentElement?.style.filter).toBe('');
      // And each sits over the shade, not under it.
      expect(jack.parentElement?.style.zIndex).toBe('1');
    }
  });

  it('comes back up the moment a cable lands, and never disagrees with its lamp', () => {
    const { handle } = build(MODIFIER_DEFS.doppler, { state: { amount: 0.3, fed: false } });
    const dark = (): boolean => part(handle, 'shade')?.style.opacity !== '0';
    const lit = (): boolean => part(handle, 'lamp')?.style.background === signals.lampOn;

    expect([dark(), lit()]).toEqual([true, false]);
    handle.setState({ amount: 0.3, fed: true });
    expect([dark(), lit()]).toEqual([false, true]);
    expect(part(handle, 'name')?.style.opacity).toBe('1');
    expect(handle.control.element.style.filter).toBe('');
    handle.setState({ amount: 0.3, fed: false });
    expect([dark(), lit()]).toEqual([true, false]);
  });

  it('still takes a touch while it is dark, which is how it gets fed', () => {
    const touch = build(MODIFIER_DEFS.doppler, { state: { amount: 0.3, fed: false } });

    touch.handle.control.element.dispatchEvent(
      new PointerEvent('pointerdown', { button: 0, bubbles: true, cancelable: true }),
    );
    window.dispatchEvent(new PointerEvent('pointerup'));

    expect(touch.presses).toEqual(['doppler']);
  });

  it('leaves an unfed box dark at full amount, because it is doing nothing', () => {
    const { handle } = build(MODIFIER_DEFS.cavern, { state: { amount: 1, fed: false } });
    expect(part(handle, 'lamp')?.style.background).toBe(signals.lampOff);
    expect(part(handle, 'lamp')?.style.boxShadow).toBe(signals.lampGlowOff);
  });

  it('is dark with a cable in it, when nothing is coming down the cable', () => {
    // gt#95. Plugged in and carrying nothing: the source at the far end is
    // switched off. The lamp used to stay lit over a cable drawn dead.
    const { handle } = build(MODIFIER_DEFS.murk, { state: { amount: 1, fed: true, live: false } });

    expect(part(handle, 'lamp')?.style.background).toBe(signals.lampOff);
    expect(part(handle, 'lamp')?.style.boxShadow).toBe(signals.lampGlowOff);
    // And the whole of the unlit look goes with the lamp, as it always has.
    expect(part(handle, 'shade')?.style.opacity).toBe(String(UNLIT.shade));
    expect(handle.control.element.style.filter).toBe(UNLIT.controls);

    handle.setState({ amount: 1, fed: true, live: true });
    expect(part(handle, 'lamp')?.style.background).toBe(signals.lampOn);
    expect(part(handle, 'shade')?.style.opacity).toBe('0');
    expect(handle.control.element.style.filter).toBe('');
  });

  it('is lit when it is fed, if nobody has said whether anything is coming through', () => {
    const { handle } = build(MODIFIER_DEFS.murk, { state: { amount: 0.5, fed: true } });
    expect(part(handle, 'lamp')?.style.background).toBe(signals.lampOn);
  });

  it('follows the patch rather than the knob as the board rewires', () => {
    const { handle } = build(MODIFIER_DEFS.grit, { state: { amount: 1, fed: false } });
    handle.setState({ amount: 0.1, fed: true });
    expect(part(handle, 'lamp')?.style.background).toBe(signals.lampOn);
    handle.setState({ amount: 1, fed: false });
    expect(part(handle, 'lamp')?.style.background).toBe(signals.lampOff);
  });

  it('takes a third of a second to change, so a lamp fades rather than blinks', () => {
    const { handle } = build(MODIFIER_DEFS.murk);
    expect(part(handle, 'lamp')?.style.transition).toBe(BOX.lamp.transition);
  });
});

describe('weather and hardware', () => {
  it('leaves a place for the board’s seal as the first thing on every box', () => {
    // gt#105. A box is metal too, and the seal is cut into whatever metal is there.
    for (const { handle } of wholeChain()) {
      const etch = part(handle, 'etch');
      const laid = [...handle.element.children].map((node) => (node as HTMLElement).dataset.part);
      expect(etch, handle.id).not.toBeNull();
      expect(etch?.children, handle.id).toHaveLength(0);
      expect(laid[0], handle.id).toBe('etch');
      expect(etch?.style.overflow, handle.id).toBe('hidden');
      expect(etch?.style.pointerEvents, handle.id).toBe('none');
    }
  });

  it('ages every box on the board-wide clock, to the one ceiling they share', () => {
    for (const { handle } of wholeChain()) {
      expect(part(handle, 'rust')?.style.opacity, handle.id).toBe(
        `calc(${textureLayers.modifier.rustBase} + var(--weather, 0) * ${textureLayers.modifier.rustWeather})`,
      );
      expect(part(handle, 'rust')?.style.backgroundSize, handle.id).toBe(
        textureLayers.modifier.rustSize,
      );
      expect(part(handle, 'grain')?.style.opacity, handle.id).toBe(
        String(textureLayers.modifier.grain),
      );
    }
  });

  it('sits shallower than a source plate, and wears no screws', () => {
    const { handle } = build(MODIFIER_DEFS.wobble);
    expect(handle.element.style.boxShadow).toBe(plate.boxShadow);
    expect(handle.element.querySelectorAll('[data-part="screw"]')).toHaveLength(0);
    expect(handle.element.querySelectorAll('[data-part="scratches"]')).toHaveLength(0);
    // And no runs either, for the same reason it has no screws: nothing was
    // bolted to it, so there is no seam for rust to bleed down from (gt#35).
    expect(handle.element.querySelectorAll('[data-part="runs"]')).toHaveLength(0);
  });

  it('rusts a box at its edges only, having no screws to pool around', () => {
    for (const { handle } of wholeChain()) {
      const rust = part(handle, 'rust');
      expect(rust?.style.getPropertyValue('mask-image'), handle.id).toBe(
        textureLayers.modifier.rustMask,
      );
      expect(rust?.style.getPropertyValue('-webkit-mask-image'), handle.id).toBe(
        textureLayers.modifier.rustMask,
      );
      expect(rust?.style.getPropertyValue('mask-image'), handle.id).not.toContain('radial-gradient');
    }
  });
});

describe('the hand on a box', () => {
  it('hands both jacks to the wire layer, tagged by end and captioned', () => {
    for (const { handle } of wholeChain()) {
      expect(handle.jackIn.dataset.jackIn, handle.id).toBe(handle.id);
      expect(handle.jackOut.dataset.jackOut, handle.id).toBe(handle.id);
      expect(handle.jackIn.dataset.jackOut, handle.id).toBeUndefined();
      expect(handle.jackOut.dataset.jackIn, handle.id).toBeUndefined();
      for (const socket of [handle.jackIn, handle.jackOut]) {
        expect(socket.style.cursor, handle.id).toBe('crosshair');
        expect(socket.style.width, handle.id).toBe(`${BOX.jack.size}px`);
        expect(tight(socket.style.background), handle.id).toBe(tight(jackTokens.face));
      }
      const captions = [...handle.element.querySelectorAll<HTMLElement>('[data-part="caption"]')];
      expect(captions.map((caption) => caption.textContent), handle.id).toEqual([
        JACK.in,
        JACK.out,
      ]);
    }
  });

  it('starts a wire from OUT and never from IN, which is only ever a target', () => {
    const touch = build(MODIFIER_DEFS.cavern);
    press(touch.handle.jackIn);
    expect(touch.jabs).toEqual([]);
    press(touch.handle.jackOut);
    expect(touch.jabs).toEqual(['cavern']);
  });

  it('names the box and the value on every move', () => {
    const touch = build(MODIFIER_DEFS.grit);
    press(touch.handle.control.element);
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: 300 - 150, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    expect(touch.inputs).toEqual([['grit', 1]]);
    expect(touch.commits).toEqual(['mods.grit']);
  });

  it('reports a touch before any value moves, so an unfed box is never dead', () => {
    const touch = build(MODIFIER_DEFS.murk, { state: { amount: 0.5, fed: false } });
    press(touch.handle.control.element);
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    expect(touch.presses).toEqual(['murk']);
    expect(touch.inputs).toEqual([]);
  });

  it('goes quiet completely once destroyed, control included', () => {
    const touch = build(MODIFIER_DEFS.wobble);
    press(touch.handle.control.element);
    touch.handle.destroy();
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: 100, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    press(touch.handle.jackOut);
    expect(touch.inputs).toEqual([]);
    expect(touch.jabs).toEqual([]);
  });
});

describe('the reference', () => {
  /** The reference spells the fader kind `slider`; the control component does not. */
  const REF_KIND: Record<string, string> = { knob: 'knob', fader: 'slider', wheel: 'wheel' };

  it('still holds every size the box is cut to', () => {
    const pins: Array<[string, unknown, unknown]> = [
      ['padding', BOX.padding, '8px 8px'],
      ['columns', BOX.gap, 7],
      ['centre column', BOX.centre.gap, 1],

      ['jack', BOX.jack.size, 22],
      ['jack column', BOX.jack.gap, 2],
      ['jack caption', [BOX.jack.captionSize, BOX.jack.captionTracking], [8, 1.2]],
      ['in label', JACK.in, 'IN'],
      ['out label', JACK.out, 'OUT'],

      ['lamp', BOX.lamp.size, 7],
      ['lamp gap', BOX.lamp.gap, 6],
      ['lamp transition', BOX.lamp.transition, 'background 0.3s, box-shadow 0.3s'],

      ['name size', [BOX.name.fontSize, BOX.name.letterSpacing], [15, 1.8]],
      ['name weight', BOX.name.weight, 700],
      ['control', [BOX.control.width, BOX.control.fontSize], [84, 12]],

      ['grain', textureLayers.modifier.grain, 0.35],
      // The rust tile's size is not pinned: the reference laid it at 200px, the
      // tile is wider since gt#100 and a box lays it at the same scale, which is a
      // bigger number; tests/tokens.test.ts holds that departure.
      ['rust ceiling', [textureLayers.modifier.rustBase, textureLayers.modifier.rustWeather], [0.24, 0.5]],

      // The footnote's three rows were here. gt#110 took the line off the plate;
      // what it said is a hover line on the sockets — see the tip suite.
    ];
    for (const [name, actual, pinned] of pins) expect(actual, name).toEqual(pinned);
  });

  /**
   * The boxes whose kind is this board's decision rather than the reference's,
   * each against the reason it departs — the same rule the token departures list
   * in ./tokens.test follows, and for the same reason: a departure is a decision
   * someone wrote down, never a kind that drifted.
   */
  const KIND_DEPARTURES: Partial<Record<ModifierId, string>> = {
    grit:
      'The reference cuts GRIT as a second knob, which with CAVERN left two ' +
      'identical round controls on a four-box chain — most of why a board ' +
      'described as scavenged read as a synth plugin instead. GRIT is the one ' +
      'amount that leaves the audio graph, since the grain and both chromatic ' +
      'edges run off --grit, so it took the lever gt#34 added. See ./ui/modifiers.',
  };

  it('still holds the kind and size each unaltered box is cut to', () => {
    // Over the four the reference draws. A box it never had is not a *departure*
    // from it — there is nothing to depart from — so the three gt#41 added are out
    // of this check by the register in ../src/engine/constants rather than by an
    // entry in the list above, which exists for kinds the reference disagrees
    // with. Widening either one to cover them would blunt both.
    const cut = HANDOFF_DEFS.filter((def) => !KIND_DEPARTURES[def.id]).map((def) => [
      def.id,
      def.kind,
      def.diameter ?? def.height,
    ]);
    expect(cut).toEqual([
      ['murk', 'fader', 64],
      ['wobble', 'wheel', 54],
      ['cavern', 'knob', 54],
    ]);
    // And neither list has quietly swallowed the whole chain.
    expect(HANDOFF_DEFS.length - Object.keys(KIND_DEPARTURES).length).toBeGreaterThan(1);
  });

  it('keeps every departed kind one the reference really does disagree with', () => {
    for (const [id, reason] of Object.entries(KIND_DEPARTURES)) {
      const def = MODIFIER_DEFS[id as ModifierId];
      expect(def, `${id} is no longer a box`).toBeDefined();
      // A kind the reference has a spelling for is not a departure from it.
      expect(REF_KIND[def.kind], `${id} is cut to a kind the reference ships`).toBeUndefined();
      // The box itself is still one the reference drew — it is only its hardware that moved.
      expect(HANDOFF_DEFS.map((each) => each.id), id).toContain(id);
      expect(reason.length, `${id} has no reason`).toBeGreaterThan(0);
    }
  });
});

// One bottom edge along the rack (gt#90).
describe('a rack of boxes cut to two heights', () => {
  it('runs its centre column the full height of the box and holds its two things apart', () => {
    // A lever or a fader stands ten pixels taller than a knob. The rack
    // stretches every box to the tallest; this is what a stretched box does
    // with the difference — the name against the top, the control against the
    // bottom, and the spare height as air between them.
    for (const { handle } of wholeChain()) {
      const centre = part(handle, 'centre');
      expect(centre?.style.alignSelf, handle.id).toBe('stretch');
      expect(centre?.style.justifyContent, handle.id).toBe('space-between');
      expect([...(centre?.children ?? [])].map((child) => (child as HTMLElement).dataset.part), handle.id).toEqual([
        'header',
        'control',
      ]);
    }
  });

  it('is two heights of control and no more, so the spare is the same in every short box', () => {
    const heights = new Set(Object.values(MODIFIER_DEFS).map((def) => def.diameter ?? def.height));
    expect([...heights].sort()).toEqual([54, 64]);
  });
});

// Each box's own lay of the rust tile (gt#100).
describe('how the rust tile is laid on each box', () => {
  it('starts it somewhere different on every box, the same way every time', () => {
    const lays = wholeChain().map(({ handle }) => {
      const style = part(handle, 'rust')?.style;
      return `${style?.backgroundPosition}|${style?.transform}`;
    });

    expect(new Set(lays).size).toBe(lays.length);
    expect(wholeChain().map(({ handle }) => {
      const style = part(handle, 'rust')?.style;
      return `${style?.backgroundPosition}|${style?.transform}`;
    })).toEqual(lays);
    for (const lay of lays) expect(lay).toMatch(/^\d+px \d+px\|scaleX\((-1|1)\)$/);
  });
});
