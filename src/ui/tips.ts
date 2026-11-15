// The hover tips, and the one place in the whole interface that is allowed to be
// calm and legible. A label is read after the act, never before: there is no
// tutorial, no tour and nothing on load — a tag appears under a control only once
// a hand has already found it.
//
// The copy is not here. Every line the tag shows is a design decision transcribed
// from the handoff, and it lives with the rest of the board's language in
// ./words — this file is the layer that shows one, and it knows nothing about
// what any of them say.
//
// Four things about the layer are decisions rather than implementation details:
//
// - **Nothing on the board knows it has a tip.** The layer finds a control and
//   reads the word off its tape strip, which is why neither ./control nor
//   ./module nor ./board carries a line of tip code. Adding a control adds a row
//   to `CONTROLS` in ./words and nothing else.
// - **The absence is the rule.** HOW LOUD and HOW OFTEN explain themselves, so
//   they are simply not in the table ./words derives. There is no "no tip" case
//   to maintain — a word that isn't there shows nothing.
// - **One delegated listener pair, not one per control.** `mouseenter` does not
//   bubble, so a single layer cannot hear it; `mouseover`/`mouseout` do, and a
//   `closest` guard that ignores movement inside the same control is exactly
//   enter/leave semantics. It also means the layer covers anything mounted after
//   it — the patching a whole-board re-roll lays (gt#19) moves no listeners around.
// - **The tag is mounted on the page, not on the plate.** It is
//   `position:fixed`, and the plate carries `zoom:var(--fit)` — a fixed child of
//   a zoomed element is scaled with it, which would put the tag somewhere other
//   than under the control and break the viewport clamp. The reference hangs its
//   tip off the page root for the same reason.

import { TIP } from './constants';
import { box } from './dom';
import { STAINED } from './grime';
import { JACK_TIPS, TIPS } from './words';
import { fonts, ink } from '../tokens';

/**
 * What the layer listens for: every control on the board, the four buttons
 * that are not controls, and every socket. Nothing else on the plate is
 * hoverable.
 *
 * STILLNESS and COME APART are in the list for the same reason SCRUB is — a tape
 * with a word on it and no strip of its own, which {@link labelOf} resolves by
 * reading the button's own text. SMASH IT has a strip, like a control does.
 *
 * This list is the whole of what can be hovered, and that makes it the one place
 * a new board-level object is easy to forget. COME APART shipped with a hover
 * line in ./words and no entry here (gt#39), so the line existed, was correct, and
 * could never appear — the button on this board that most wants explaining
 * before it is pressed was the one button that said nothing. A button missing
 * from here is silent, and silently so, which is why the suite now checks this
 * from the other direction: every button the board paints must resolve to its
 * line, rather than each remembered one being asked whether it does.
 *
 * The sockets are in it since gt#110. How a wire is run used to be painted on the
 * plate as two lines of instruction and a footnote; it is said here instead, by
 * the two things it was about. A socket has no word to be looked up by, so
 * {@link tipFor} knows one by its tag — the same tag the wire layer finds it by.
 */
const TIPPED =
  '[data-control],[data-part="smash"],[data-part="scrub"],[data-part="still"],[data-part="apart"],' +
  '[data-jack-out],[data-jack-in]';

/** Where the tag sits, in viewport space. The tag is centred on `x`. */
export interface TipPlacement {
  readonly x: number;
  readonly y: number;
}

/** The window the tag is clamped inside. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/**
 * Where a tag for this control goes: centred under it, and clamped so it stays
 * on screen. A control at the far right of the board would otherwise hang its
 * tag off the edge, and one at the bottom would hang it below the fold.
 */
export function tipAt(rect: DOMRect, viewport: Viewport): TipPlacement {
  return {
    x: Math.max(
      TIP.edgeInset,
      Math.min(viewport.width - TIP.edgeInset, rect.left + rect.width / 2),
    ),
    y: Math.min(viewport.height - TIP.bottomInset, rect.bottom + TIP.drop),
  };
}

/**
 * The word a hovered thing is explained by: the tape strip it carries, or its own
 * text where it has no strip — which is how SCRUB THE ALTAR, a tape all by
 * itself, resolves alongside the controls and the hammer.
 */
export function labelOf(element: Element): string {
  const tape = element.querySelector('[data-part="tape"]');
  // The tape first, because it is the word a person is actually looking at.
  // Then the word the control was built with (gt#63): a chain box's control has
  // no tape — the box's own plate says the word — and its seat is a stack of
  // unlettered parts, so with nothing here it would resolve to an empty string
  // and every box of THE CHAIN would lose its hover line without a sound. Only
  // then the element's own text, which is a tape button all by itself.
  const word = tape?.textContent ?? element.getAttribute('data-label') ?? element.textContent ?? '';
  return word.trim();
}

/**
 * The line a hovered thing says, or null where it says nothing.
 *
 * A word with no line says nothing — HOW OFTEN is the case, a tape that is
 * already a plain question. Unless the word is not painted anywhere (gt#90): a
 * control built bare, with no line of its own, says its *name*. HOW LOUD is
 * the one such control. Its tape went and a gauge of widening marks stands
 * where it was, which tells a hand which way is more and tells nobody what the
 * thing is called; the board's first rule is plain language, and a control
 * that is only a picture has broken it unless something still says the word.
 * So the hover does. The vocabulary in ./words is untouched by this: the name
 * still explains itself, it is only said somewhere else.
 */
export function tipFor(element: Element): string | null {
  // A socket first (gt#110): it has no word, so there is nothing below to find.
  if (element.hasAttribute('data-jack-out')) return JACK_TIPS.out;
  if (element.hasAttribute('data-jack-in')) return JACK_TIPS.in;

  const word = labelOf(element);
  const line = TIPS[word];
  if (line !== undefined) return line;
  const unlettered =
    element.hasAttribute('data-control') &&
    element.hasAttribute('data-label') &&
    !element.querySelector('[data-part="tape"]');
  return unlettered && word ? word : null;
}

export interface TipLayerSpec {
  /** The plate. Every hover on the board is heard here, once. */
  readonly board: HTMLElement;
}

export interface TipLayerHandle {
  /** The tag. Mounted by the caller, on the page rather than on the plate. */
  readonly element: HTMLElement;
  /** What the tag currently says, or null while it is hidden. */
  readonly text: string | null;
  /** Drop both listeners and hide whatever is showing. */
  destroy(): void;
}

/** Build the tip layer. It starts hidden, and it is hidden most of the time. */
export function createTipLayer(spec: TipLayerSpec): TipLayerHandle {
  /** The control the cursor is over, tipped or not. Null when it is over none. */
  let current: Element | null = null;
  let text: string | null = null;

  const element = box(
    'tip',
    `position:fixed;left:0;top:0;transform:translateX(-50%);display:none;` +
      `background:${ink.tipPaper};${STAINED}color:${ink.tipInk};font-family:${fonts.body};` +
      `font-size:${TIP.fontSize}px;line-height:${TIP.lineHeight};padding:${TIP.padding};` +
      `border-radius:${TIP.radius}px;box-shadow:${ink.tipShadow};` +
      `max-width:${TIP.maxWidth}px;pointer-events:none;z-index:${TIP.zIndex};`,
  );

  function hide(): void {
    current = null;
    text = null;
    element.style.display = 'none';
  }

  function show(target: Element): void {
    current = target;
    text = tipFor(target);
    if (text === null) {
      element.style.display = 'none';
      return;
    }
    const spot = tipAt(target.getBoundingClientRect(), {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    element.textContent = text;
    element.style.left = `${spot.x}px`;
    element.style.top = `${spot.y}px`;
    element.style.display = 'block';
  }

  /** What a pointer event is over, as far as this layer is concerned. */
  const tipped = (node: EventTarget | null): Element | null =>
    (node instanceof Element ? node.closest(TIPPED) : null);

  const onOver = (event: MouseEvent): void => {
    const target = tipped(event.target);
    // Crossing between a control's own pieces — its face, its tape, its word —
    // is not entering it again, and must not make the tag flicker.
    if (target === current) return;
    if (target) show(target);
    else hide();
  };

  const onOut = (event: MouseEvent): void => {
    // Leaving for somewhere still inside the same control is not leaving it.
    // `relatedTarget` is null when the cursor leaves the window entirely, which
    // is a leave.
    if (tipped(event.relatedTarget) === current) return;
    hide();
  };

  spec.board.addEventListener('mouseover', onOver);
  spec.board.addEventListener('mouseout', onOut);

  return {
    element,
    get text(): string | null {
      return text;
    },
    destroy(): void {
      spec.board.removeEventListener('mouseover', onOver);
      spec.board.removeEventListener('mouseout', onOut);
      hide();
    },
  };
}
