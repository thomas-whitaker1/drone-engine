// @vitest-environment happy-dom
//
// The hover tips — the layer, not the copy. It hears a hover anywhere on the
// plate, reads the word off whatever was hovered, and places a tag under it;
// what any of those words say is the vocabulary's business, and is asserted in
// ./words.test.ts against the handoff.
//
// Every rect is stubbed, because happy-dom lays nothing out and returns zeroes
// for all of them. As in the wire suite, that is the point: what is pinned down
// here is the *conversion* from a control's rect to a spot in the window, and a
// stubbed rect is how you state the input to it.

import { afterEach, describe, expect, it } from 'vitest';
import { TIP } from '../src/ui/constants';
import {
  CONTROLS,
  createBoard,
  createTipLayer,
  JACK_TIPS,
  labelOf,
  OPENING_STATE,
  tipAt,
  tipFor,
  TIPS,
} from '../src/ui';
import type { BoardHandle, TipLayerHandle } from '../src/ui';
import { fonts, ink } from '../src/tokens';

const live: Array<BoardHandle | TipLayerHandle> = [];

/** The DOM re-quotes a font family in double quotes and spaces its commas out. */
const family = (value: string): string => value.replace(/,\s+/g, ',').replace(/'/g, '"');

/** Pin an element's client rect, since happy-dom lays nothing out. */
function stub(element: Element, left: number, top: number, width: number, height: number): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: (): DOMRect =>
      ({
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        toJSON: () => '',
      }) as DOMRect,
  });
}

/** A rect for a control of a given size, wherever it is wanted on screen. */
const rect = (left: number, bottom: number, width = 60): DOMRect =>
  ({
    left,
    top: bottom - 40,
    width,
    height: 40,
    right: left + width,
    bottom,
    x: left,
    y: bottom - 40,
    toJSON: () => '',
  }) as DOMRect;

/** The whole board with a tip layer over it, the way ../src/app mounts them. */
function build(): { board: HTMLElement; layer: TipLayerHandle } {
  const handle = createBoard({ state: OPENING_STATE });
  document.body.appendChild(handle.element);
  const layer = createTipLayer({ board: handle.element });
  document.body.appendChild(layer.element);
  live.push(handle, layer);
  return { board: handle.element, layer };
}

/** Move the cursor onto something, out of something, or between the two. */
function hover(target: Element, from: Element | null = null): void {
  if (from) from.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: target }));
  target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: from }));
}

const leave = (target: Element, to: Element | null = null): void => {
  target.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: to }));
};

/** One control on the board, by its `scope.param` key, with its rect pinned. */
function control(board: HTMLElement, key: string, left = 300, bottom = 400): HTMLElement {
  const element = board.querySelector<HTMLElement>(`[data-control="${key}"]`)!;
  stub(element, left, bottom - 40, 60, 40);
  return element;
}

afterEach(() => {
  for (const handle of live.splice(0)) handle.destroy();
  document.body.innerHTML = '';
});

describe('where a tag goes', () => {
  const window = { width: 1440, height: 900 };

  it('sits centred under the control', () => {
    expect(tipAt(rect(300, 400), window)).toEqual({ x: 330, y: 410 });
  });

  it('is held off both edges of the window', () => {
    // A control in the corner of the board would otherwise hang its tag past the
    // edge, where the half of it left on screen reads as cut off.
    expect(tipAt(rect(0, 400, 40), window).x).toBe(TIP.edgeInset);
    expect(tipAt(rect(1420, 400, 40), window).x).toBe(window.width - TIP.edgeInset);
  });

  it('is held off the bottom of it', () => {
    expect(tipAt(rect(300, 880), window).y).toBe(window.height - TIP.bottomInset);
  });

  it('is cut to the clamps the reference holds its tag inside', () => {
    expect([TIP.edgeInset, TIP.bottomInset, TIP.drop]).toEqual([130, 70, 10]);
  });
});

describe('the word a hovered thing is explained by', () => {
  it('is the one on its tape strip', () => {
    const { board } = build();

    expect(labelOf(control(board, 'g.seriousness'))).toBe(CONTROLS.seriousness.label);
    expect(tipFor(control(board, 'mods.grit'))).toBe(CONTROLS.grit.tip);
  });

  it('is the word it was built with, where a control carries no strip (gt#63)', () => {
    // A chain box's control has no tape: the box's plate already says the word.
    // Its seat is a stack of unlettered parts, so without the word on the
    // element this resolves to nothing — and every box of THE CHAIN goes silent.
    const { board } = build();

    for (const key of ['grit', 'murk', 'wobble', 'cavern', 'doppler', 'magnets', 'offset'] as const) {
      const element = control(board, `mods.${key}`);
      expect(element.querySelector('[data-part="tape"]'), key).toBeNull();
      expect(element.textContent, key).toBe('');
      expect(labelOf(element), key).toBe(CONTROLS[key].label);
      expect(tipFor(element), key).toBe(CONTROLS[key].tip);
    }
  });

  it('still reads the tape first, where there is one', () => {
    // The tape is the word a person is looking at. If the two ever disagreed,
    // the line shown should be the one for what is painted.
    const { board } = build();
    const element = control(board, 'g.tuning');
    element.setAttribute('data-label', CONTROLS.grit.label);

    expect(labelOf(element)).toBe(CONTROLS.tuning.label);
  });

  it('shows a box’s line on hover, with no tape to hover over', () => {
    const { board, layer } = build();

    hover(control(board, 'mods.cavern'));

    expect(layer.text).toBe(CONTROLS.cavern.tip);
    expect(layer.element.style.display).toBe('block');
  });

  it('is its own text where it carries no strip', () => {
    const { board } = build();
    const scrub = board.querySelector<HTMLElement>('[data-part="scrub"]')!;

    expect(labelOf(scrub)).toBe(CONTROLS.scrub.label);
  });
});

describe('the tip layer', () => {
  it('says nothing until something is hovered', () => {
    const { layer } = build();

    // No tutorial, no tour, nothing on load.
    expect(layer.text).toBeNull();
    expect(layer.element.style.display).toBe('none');
  });

  it('is a paper tag that catches nothing itself', () => {
    const { layer } = build();
    const style = layer.element.style;

    expect(style.position).toBe('fixed');
    expect(style.transform).toBe('translateX(-50%)');
    expect(style.pointerEvents).toBe('none');
    expect(style.zIndex).toBe(String(TIP.zIndex));
    expect(style.backgroundColor).toBe(ink.tipPaper);
    // With a stain in one corner of it (gt#118), and the paper still the paper.
    expect(style.backgroundImage.replace(/,\s+/g, ',')).toBe(ink.tipGrime.replace(/,\s+/g, ','));
    expect(ink.tipGrime).toContain('at 100% 100%');
    expect(style.color).toBe(ink.tipInk);
    expect(family(style.fontFamily)).toBe(family(fonts.body));
    expect(style.maxWidth).toBe(`${TIP.maxWidth}px`);
    // The tag as the original design cut it.
    expect([ink.tipPaper, ink.tipInk]).toEqual(['#ddd3b8', '#221c12']);
    expect([TIP.fontSize, TIP.lineHeight, TIP.padding, TIP.radius]).toEqual([13, 1.45, '7px 12px', 2]);
    expect([TIP.maxWidth, TIP.zIndex]).toEqual([240, 90]);
  });

  it('shows a control’s line under it on the way in', () => {
    const { board, layer } = build();

    hover(control(board, 'g.seriousness'));

    expect(layer.text).toBe(CONTROLS.seriousness.tip);
    expect(layer.element.textContent).toBe(layer.text);
    expect(layer.element.style.display).toBe('block');
    expect(layer.element.style.left).toBe('330px');
    expect(layer.element.style.top).toBe('410px');
  });

  it('finds the control under one of its own pieces', () => {
    const { board, layer } = build();
    const knob = control(board, 'guitar.char');

    // The cursor is never over the control itself — it is over the face, the
    // tape or the word, all of which are children of it.
    hover(knob.querySelector('[data-part="tape"]')!);

    expect(layer.text).toBe(CONTROLS.crowd.tip);
  });

  it('does not flicker as the cursor crosses between those pieces', () => {
    const { board, layer } = build();
    const knob = control(board, 'guitar.char');
    const face = knob.querySelector('[data-part="seat"]')!;
    const tape = knob.querySelector('[data-part="tape"]')!;

    // Each piece resolves to the control that owns it, not to itself: a seat
    // carries no word, and a layer that stopped at one would say nothing.
    hover(face);
    expect(layer.text).toBe(CONTROLS.crowd.tip);

    hover(tape, face);

    // Moving inside a control is not leaving it and entering it again.
    expect(layer.text).toBe(CONTROLS.crowd.tip);
    expect(layer.element.style.display).toBe('block');
  });

  it('says nothing for a control whose tape already explains it', () => {
    const { board, layer } = build();

    hover(control(board, 'slowhit.often'));
    expect(layer.text).toBeNull();
    expect(layer.element.style.display).toBe('none');
  });

  it('says the name of a control that has no line and no lettering', () => {
    // HOW LOUD (gt#90). It has no hover line, for the reason HOW OFTEN has none —
    // but its tape is gone and a gauge stands there, so the two words are not
    // painted anywhere. A control that is only a picture says its name.
    const { board, layer } = build();
    const loud = control(board, 'guitar.loud');
    expect(loud.querySelector('[data-part="tape"]')).toBeNull();
    expect(TIPS[CONTROLS.loud.label]).toBeUndefined();

    hover(loud);

    expect(layer.text).toBe(CONTROLS.loud.label);
    expect(layer.element.style.display).toBe('block');
  });

  it('explains all four buttons as well as the controls', () => {
    const { board, layer } = build();
    const smash = board.querySelector<HTMLElement>('[data-part="smash"]')!;
    const scrub = board.querySelector<HTMLElement>('[data-part="scrub"]')!;
    const still = board.querySelector<HTMLElement>('[data-part="still"]')!;
    const apart = board.querySelector<HTMLElement>('[data-part="apart"]')!;
    for (const button of [smash, scrub, still, apart]) stub(button, 300, 360, 60, 40);

    hover(smash);
    expect(layer.text).toBe(CONTROLS.smash.tip);

    hover(scrub, smash);
    expect(layer.text).toBe(CONTROLS.scrub.tip);

    // STILLNESS resolves the same way SCRUB does — a tape with a word on it and
    // no strip of its own — even though it is the one button here that explains
    // something about the screen rather than about the sound.
    hover(still, scrub);
    expect(layer.text).toBe(CONTROLS.stillness.tip);

    // And COME APART, which is a covered button since gt#112 and resolves the
    // way SMASH IT does, by the tape under it. It had a line from the day it
    // shipped and no way to show it: `TIPPED` never named it. It is the button whose line matters most
    // before the press rather than after, which is the one place this board's
    // whole meaning-arrives-after-the-act rule does not hold.
    hover(apart, still);
    expect(layer.text).toBe(CONTROLS.apart.tip);
  });

  it('shows a line for every board-level button, through the hover it is found by', () => {
    // Checked from the other direction, because that is the direction the bug
    // came from: a button missing from `TIPPED` fails invisibly — a hover line
    // that exists, is correct, and can never appear, with nothing going red.
    //
    // And checked through an actual hover rather than through `tipFor`, which is
    // the trap the first attempt at this test fell into: `tipFor` resolves a
    // label straight off an element and never consults `TIPPED` at all, so it
    // answers correctly for a button the layer cannot see. The bug lives between
    // the listener and the lookup, so the test has to cross that gap too.
    const { board, layer } = build();
    const buttons: ReadonlyArray<readonly [string, string | undefined]> = [
      ['smash', CONTROLS.smash.tip],
      ['scrub', CONTROLS.scrub.tip],
      ['still', CONTROLS.stillness.tip],
      ['apart', CONTROLS.apart.tip],
    ];
    let last: HTMLElement | undefined;
    for (const [name, tip] of buttons) {
      const button = board.querySelector<HTMLElement>(`[data-part="${name}"]`);
      expect(button, name).not.toBeNull();
      expect(tip, name).toBeTruthy();
      stub(button as HTMLElement, 300, 360, 60, 40);
      hover(button as HTMLElement, last);
      expect(layer.text, name).toBe(tip);
      last = button as HTMLElement;
    }
  });

  it('says how a wire is run on every socket, through the hover it is found by (gt#110)', () => {
    // This was painted on the plate — two lines in the top row and a footnote
    // over the rack — and is said here instead, by the things it was about.
    // Through an actual hover for the reason the test above gives: a socket
    // missing from `TIPPED` would have a correct line that could never appear.
    const { board, layer } = build();
    const outs = [...board.querySelectorAll<HTMLElement>('[data-jack-out]')];
    const ins = [...board.querySelectorAll<HTMLElement>('[data-jack-in]')];
    // Eleven modules and seven boxes start a wire; seven boxes end one.
    expect(outs).toHaveLength(18);
    expect(ins).toHaveLength(7);

    let last: HTMLElement | undefined;
    for (const socket of outs) {
      stub(socket, 300, 360, 22, 22);
      hover(socket, last);
      expect(layer.text, socket.dataset.jackOut).toBe(JACK_TIPS.out);
      expect(layer.element.style.display).toBe('block');
      last = socket;
    }
    for (const socket of ins) {
      stub(socket, 300, 360, 22, 22);
      hover(socket, last);
      expect(layer.text, socket.dataset.jackIn).toBe(JACK_TIPS.in);
      last = socket;
    }

    // A module's socket has no word under it and a box's has one; both say the
    // same line, because it is the socket that is hovered and not the caption.
    expect(tipFor(outs[0] as HTMLElement)).toBe(JACK_TIPS.out);
    expect(labelOf(outs[0] as HTMLElement)).toBe('');
  });

  it('swaps straight over when the cursor crosses to another control', () => {
    const { board, layer } = build();
    const wheel = control(board, 'g.seriousness');
    const knob = control(board, 'mods.cavern', 700, 500);

    hover(wheel);
    hover(knob, wheel);

    expect(layer.text).toBe(CONTROLS.cavern.tip);
    expect(layer.element.style.left).toBe('730px');
    expect(layer.element.style.top).toBe('510px');
  });

  it('takes the tag away on the way out', () => {
    const { board, layer } = build();
    const wheel = control(board, 'g.seriousness');

    hover(wheel);
    leave(wheel, board);

    expect(layer.text).toBeNull();
    expect(layer.element.style.display).toBe('none');
  });

  it('takes it away when the cursor leaves the window entirely', () => {
    const { board, layer } = build();
    const wheel = control(board, 'g.seriousness');

    hover(wheel);
    leave(wheel, null);

    expect(layer.text).toBeNull();
  });

  it('stops listening once it is destroyed', () => {
    const { board, layer } = build();
    const wheel = control(board, 'g.seriousness');

    layer.destroy();
    hover(wheel);

    expect(layer.text).toBeNull();
    expect(layer.element.style.display).toBe('none');
  });
});
