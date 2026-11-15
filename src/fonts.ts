// The four typefaces, carried — and the reason this page asks the network for
// nothing at all.
//
// They went missing between two issues (gt#69). gt#23 asked for the families to be
// self-hosted and closed when network requests stopped being forbidden; gt#47
// picked up what a *failed* font request must not be allowed to do. Neither one
// loaded them, so `fonts` in ./tokens named four families nothing ever fetched
// and every stack fell through to its generic. On Windows the generic for
// `cursive` is Comic Sans, and that is what every tape on the board was set in.
//
// gt#69 fetched them from a font service. gt#94 brought the files into the repo,
// which is what gt#23 asked for in the first place: six woff2 files in ./fonts,
// the latin range of each, a little over a hundred kilobytes between them. So a
// board opened with no network is the same board, no other host is told that
// somebody opened it, and the faces come from the same place the script did —
// if this file ran, they are reachable.
//
// It is still arranged around gt#47's rule rather than around the request,
// because a file on the board's own origin can be slow or missing too:
// **nothing fetched is ever on the path to first paint or to sound.** Three
// decisions carry that, and each is one a suite can hold:
//
// - **The faces are declared from script, not from the shell.** index.html
//   names no font and no address — tests/scaffold.test.ts still says so — and
//   a `<style>` a script appends blocks nothing.
// - **`font-display: swap`, on every face.** Text is drawn at once in the
//   fallback and re-drawn when its face lands, so a file that never arrives
//   costs the board its typography and nothing else. The fallbacks in ./tokens
//   are chosen for exactly that case and are not a formality.
// - **Arrival is reported, not guessed.** Lettering changes width when a face
//   lands, which moves jacks, which moves the end of every cable. The wire layer
//   used to cover that with a ladder of five timeouts; this tells the caller the
//   moment a batch of faces finishes instead, and once more on a timer for an
//   engine that never says. See {@link FONTS.settleMs}.
//
// The failure posture is silence, and that is gt#47's third item answered: a board
// that put up "couldn't load fonts" would break the fiction far worse than the
// wrong typeface does. No error is caught here because none is surfaced — the
// file fails, the fallbacks stay, and the board drones.
//
// Like ./stillness and ./weathering this is held by the seam in ./app, for the
// same reason: it is neither appearance a component decides nor sound the engine
// makes. And like both, nowhere in it does it say `engine`.

import { typefaces } from './tokens';
import permanentMarker400 from './fonts/permanent-marker-400.woff2?url';
import publicSans from './fonts/public-sans-variable.woff2?url';
import sairaCondensed600 from './fonts/saira-condensed-600.woff2?url';
import sairaCondensed700 from './fonts/saira-condensed-700.woff2?url';
import stardosStencil400 from './fonts/stardos-stencil-400.woff2?url';
import stardosStencil700 from './fonts/stardos-stencil-700.woff2?url';

export const FONTS = {
  /**
   * The file each face is cut from, by family and weight. The licences they are
   * carried under are beside them, in ./fonts/licenses.
   *
   * Public Sans is one variable file covering every weight, so both of its rows
   * name it and it is fetched once.
   */
  files: {
    'Permanent Marker': { 400: permanentMarker400 },
    'Public Sans': { 400: publicSans, 600: publicSans },
    'Saira Condensed': { 600: sairaCondensed600, 700: sairaCondensed700 },
    'Stardos Stencil': { 400: stardosStencil400, 700: stardosStencil700 },
  } as Readonly<Record<string, Readonly<Record<number, string>>>>,

  /**
   * What the files cover: the latin range, which is every character the board
   * draws — tests/fonts.test.ts reads the lettering back to hold that. Stated
   * on each face so a character outside it goes to the fallback by rule rather
   * than by a missing glyph.
   */
  range:
    'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, ' +
    'U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',

  /** The attribute the `<style>` carries, so a page is not given two. */
  mark: 'data-drone-fonts',

  /**
   * One late report, this long after mount, whether or not anything has landed.
   *
   * gt#47 asked for the arrival hook to be raced against a timeout — "a font
   * request that never settles must not leave the wires permanently
   * unmeasured" — and this is that timeout. It is also the whole of the answer
   * for an engine with no `document.fonts`, which gets this one call and no
   * other. Late enough to cover a cold cache on a slow line; the cost of being
   * early is a cable a few pixels off its socket until the next resize, not a
   * board that fails.
   */
  settleMs: 3000,
} as const;

/**
 * Every face the board draws, as `@font-face` rules: one per family and weight
 * {@link typefaces} lists, each swapping.
 *
 * Built rather than written out so the weights live in ./tokens beside the
 * stacks that use them. A face in that table with no file here is skipped
 * rather than declared with nothing behind it — and the suite fails on it,
 * because a face that is named and never loaded is the bug this file exists to
 * end.
 */
export function fontFaceCss(): string {
  return typefaces
    .flatMap(({ family, weights }) =>
      weights.map((weight) => {
        const file = FONTS.files[family]?.[weight];
        if (!file) return '';
        return (
          `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};` +
          `font-display:swap;src:url("${file}") format("woff2");unicode-range:${FONTS.range};}`
        );
      }),
    )
    .join('');
}

export interface FontsSpec {
  /**
   * A batch of faces has finished arriving, or {@link FONTS.settleMs} has run
   * out. Anything measured off the lettering looks again here. May be called
   * more than once: faces land in batches, and each one moves the layout.
   */
  readonly onSettle?: () => void;

  /** The page to load into. Defaults to this one. */
  readonly document?: Document;
}

export interface FontsHandle {
  /** The `<style>` this added to `<head>`, or null if the page already had one. */
  readonly sheet: HTMLStyleElement | null;
  /** Stop reporting, and take back whatever this added to the page. */
  destroy(): void;
}

/** What `document.fonts` has to offer for this file to listen to it. */
interface FaceSet {
  addEventListener(type: 'loadingdone', listener: () => void): void;
  removeEventListener(type: 'loadingdone', listener: () => void): void;
}

/**
 * Declare the four families. Returns at once; nothing waits on the files.
 *
 * A page that already carries them — a second board on one page, or a module
 * reloaded under a dev server — is not given a second copy: this only adds what
 * is missing and only removes what it added.
 */
export function loadFonts(spec: FontsSpec = {}): FontsHandle {
  const doc = spec.document ?? document;

  let sheet: HTMLStyleElement | null = null;
  if (!doc.head.querySelector(`style[${FONTS.mark}]`)) {
    sheet = doc.createElement('style');
    sheet.setAttribute(FONTS.mark, '');
    sheet.textContent = fontFaceCss();
    doc.head.appendChild(sheet);
  }

  let live = true;
  const settle = (): void => {
    if (live) spec.onSettle?.();
  };

  // `loadingdone` rather than `document.fonts.ready`, and the difference is the
  // whole reason this is deterministic. `ready` resolves when nothing is
  // loading, which on a page that has not laid out a line of text yet is *now*
  // — it would report before a single face had been asked for. The event fires
  // each time a batch actually finishes, however late and however many times.
  const faces = (doc as Document & { fonts?: FaceSet }).fonts;
  faces?.addEventListener('loadingdone', settle);

  const timer = setTimeout(settle, FONTS.settleMs);

  return {
    sheet,
    destroy(): void {
      live = false;
      clearTimeout(timer);
      faces?.removeEventListener('loadingdone', settle);
      sheet?.remove();
      sheet = null;
    },
  };
}
