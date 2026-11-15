// The element helpers every component on this board builds out of.
//
// The first two were written for the control and are now shared with the source
// module, which is the whole reason they are here: a plate's texture overlays and
// a knob's wear halo are the same absolutely-pinned box, and a `data-part` name is
// how the wire layer, the tip layer and the suites find anything at all.
//
// The third is here for the wire layer, the one thing on this board that is not
// made of divs. A cable is a curve, and a curve is an SVG path.

/** A named `div`, styled in one string, optionally appended to a parent. */
export function box(part: string, style: string, parent?: HTMLElement): HTMLDivElement {
  const node = document.createElement('div');
  node.dataset.part = part;
  node.style.cssText = style;
  if (parent) parent.appendChild(node);
  return node;
}

/**
 * Absolute and pinned to all four edges of the parent, pushed `outset` pixels
 * beyond them. A negative outset pulls the box inside instead.
 *
 * Written as explicit `top`/`right`/`bottom`/`left` rather than the `inset`
 * shorthand: identical in a browser, and legible to anything that reads the
 * geometry back off the element.
 */
export const stretched = (outset = 0): string =>
  `position:absolute;left:${-outset}px;top:${-outset}px;right:${-outset}px;bottom:${-outset}px;`;

/**
 * One mask, in the two spellings that between them cover every engine the board
 * runs on. WebKit still wants the prefix, and an unprefixed-only rust layer
 * there would quietly ignore its placement and go back to being the even wash
 * that gt#35 exists to remove — a failure that looks like nothing at all.
 *
 * `no-repeat` is not decoration: the mask is built from gradients sized to the
 * element, and a repeating one would put a second set of rusted edges through
 * the middle of the plate.
 */
export const masked = (mask: string): string =>
  `-webkit-mask-image:${mask};mask-image:${mask};` +
  `-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;`;

/**
 * Nothing under this can be selected as text (gt#73).
 *
 * Every gesture on this board is a drag, so a drag that just misses its control
 * is the commonest mistake a hand makes on it — and on an element the browser
 * still thinks is a document, a missed drag is a text selection: blue boxes over
 * the lettering, which is the page admitting it is a page. The answer to a near
 * miss is nothing at all.
 *
 * Both spellings, for the reason {@link masked} carries both: WebKit still wants
 * the prefix, and without it this fails silently on exactly one engine.
 */
export const unselectable = (): string => `-webkit-user-select:none;user-select:none;`;

/** The SVG namespace. An svg element made with `createElement` does not render. */
const SVG_NS = 'http://www.w3.org/2000/svg';

/** The same as {@link box}, in the namespace a path needs to be drawn in. */
export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  style: string,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  node.style.cssText = style;
  if (parent) parent.appendChild(node);
  return node;
}
