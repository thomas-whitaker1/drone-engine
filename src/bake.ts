// The drawn textures, turned into pictures of themselves.
//
// Every scratch, patch of rust and bloom of verdigris on this board is geometry
// — see ./tokens/damage — written out as an SVG and handed to CSS as a
// background. That is the right way to *make* them, and it turned out to be the
// most expensive way to *show* them: a browser does not keep an SVG background
// as an image. Every time a tile of the plate is drawn again it plays the
// drawing again, stroke by stroke, and runs the tearing filter over it again.
// Measured on the board as it opens, one repainted tile was 850 paths; the
// scratch tile alone is laid in fifty places.
//
// So once the board is up, each tile is drawn exactly once more — onto a canvas,
// at the size it is actually seen at — and the variable that named the drawing
// is pointed at the picture instead. Nothing that reads the variable knows. A
// repaint is then a handful of bitmaps rather than a few thousand strokes, which
// on the same measurement cut the cost of a tile to a third.
//
// Four things about it are decisions:
//
// - **The board never waits for it.** It is drawn from the SVGs first, exactly
//   as it always was, and the pictures replace them when they are ready — the
//   rule ./fonts keeps about the typefaces, for the same reason. All of them are
//   swapped in one go, so the board is redrawn once rather than once a texture.
// - **A picture is as sharp as the largest place it is laid.** The tiles are
//   laid at many sizes — the rust tile from 120px across to 709 — and the bitmap
//   is cut for the biggest of them at the screen's own pixel density, so it is
//   only ever scaled down. Which sizes those are is read off the board rather
//   than written down a second time here.
// - **Grain is left alone.** It is noise, not drawing: one rectangle and a
//   turbulence filter, cheap to play back and the one texture a resample would
//   visibly soften.
// - **Only where it has been measured.** Reading a canvas back is the thing
//   privacy modes in other engines quietly spoil — a blank or a speckled image
//   handed back in place of the real one — and a board whose rust has turned
//   white is worse than one that is slow to repaint. So this runs in Chromium,
//   where the numbers above were taken, and everywhere else the board keeps its
//   drawings.

/** How the pictures are cut. */
export const BAKE = {
  /** The longest edge a picture may have, in pixels. Past this it is cut coarser. */
  maxEdge: 2048,
  /** The most bitmap pixels per CSS pixel a screen is ever answered with. */
  maxDensity: 3,
  /** How long after the board is built the work starts, so the first paint is not it. */
  startMs: 400,
} as const;

/** One variable to bake: where it is published, and what it is called. */
export interface BakeTarget {
  readonly host: HTMLElement;
  readonly name: string;
}

/**
 * The tokens that are drawings, by the names {@link cssVars} publishes them
 * under. `--grainTex` is not among them, on purpose — see the note at the top.
 */
export const BAKED_TOKENS = ['--rustTex', '--verdiTex', '--scratchTex', '--runTex', '--chipTex', '--crackTex'] as const;

export interface BakeSpec {
  readonly targets: readonly BakeTarget[];
  /** Everything the tiles are laid on, searched for the sizes they are laid at. */
  readonly within: ParentNode;
  /** The screen's pixel density. Defaults to the window's. */
  readonly density?: number;
  /** Whether to do it at all. Defaults to {@link canBake}. */
  readonly enabled?: boolean;
}

export interface BakeHandle {
  /** Settles when every picture is in, or when there was nothing to do. Never rejects. */
  readonly done: Promise<void>;
  /** Stop, and put every variable back to the drawing it named. */
  destroy(): void;
}

/**
 * The address inside a CSS `url(...)`, or null for anything that is not one
 * SVG written out in place. The tokens quote theirs; a browser handing the
 * value back may re-quote it, so both are read.
 */
export function svgUrlOf(value: string): string | null {
  const found = /^\s*url\(\s*(["']?)(data:image\/svg\+xml[,;][\s\S]*?)\1\s*\)\s*$/.exec(value);
  const address = found?.[2];
  if (!address) return null;
  return address.replace(/\\(["'\\])/g, '$1');
}

/**
 * How many times its own size the tile behind `name` is laid at its largest,
 * read off the inline styles under `within`. A size that is not in pixels — the
 * seal and the cracks are laid at `100%` of a box cut to them — counts as the
 * tile's own, and so does a tile nobody has laid.
 */
export function largestLay(within: ParentNode, name: string, naturalWidth: number): number {
  if (!(naturalWidth > 0)) return 1;
  const reads = `var(${name})`;
  let most = 1;
  for (const node of within.querySelectorAll<HTMLElement>('[style]')) {
    const style = node.style;
    if (!style.backgroundImage.includes(reads) && !style.getPropertyValue('mask-image').includes(reads)) continue;
    const laid = /^\s*([\d.]+)px/.exec(style.backgroundSize);
    if (laid) most = Math.max(most, Number(laid[1]) / naturalWidth);
  }
  return most;
}

/**
 * The size a picture is cut at: the tile's own, times the largest it is laid,
 * times the screen's density — and no edge past {@link BAKE.maxEdge}.
 */
export function bakedSize(
  width: number,
  height: number,
  lay: number,
  density: number,
): { readonly width: number; readonly height: number } {
  const wanted = Math.max(1, lay) * Math.min(BAKE.maxDensity, Math.max(1, density));
  const fits = Math.min(wanted, BAKE.maxEdge / Math.max(width, height, 1));
  return {
    width: Math.max(1, Math.round(width * fits)),
    height: Math.max(1, Math.round(height * fits)),
  };
}

/** Whether this is a browser the bake has been measured in, with what it needs. */
export function canBake(): boolean {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return false;
  const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands;
  if (!brands?.some((entry) => entry.brand === 'Chromium')) return false;
  return typeof Image === 'function' && typeof URL?.createObjectURL === 'function';
}

/** One drawing as a picture: an object URL for a PNG of it, already decoded once. */
async function bakeOne(address: string, lay: (naturalWidth: number) => number, density: number): Promise<string> {
  const drawing = new Image();
  drawing.src = address;
  await drawing.decode();
  const size = bakedSize(drawing.naturalWidth, drawing.naturalHeight, lay(drawing.naturalWidth), density);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const pen = canvas.getContext('2d');
  if (!pen) throw new Error('No canvas to bake on.');
  pen.drawImage(drawing, 0, 0, size.width, size.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('The canvas would not be read back.');
  const url = URL.createObjectURL(blob);
  // Decoded before it is used, so the swap is from one picture to another and
  // never through a frame with neither.
  const picture = new Image();
  picture.src = url;
  try {
    await picture.decode();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  return url;
}

/** A turn of the event loop, so the bake is many short tasks rather than one long one. */
const breathe = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Bake every target, then swap them all in at once. Anything that cannot be
 * baked is left as the drawing it was, and that is not an error: the board is
 * already correct, and this only ever makes it cheaper.
 */
export function bakeTextures(spec: BakeSpec): BakeHandle {
  const enabled = spec.enabled ?? canBake();
  if (!enabled) return { done: Promise.resolve(), destroy: () => undefined };

  let live = true;
  /** What each variable said before, and the picture made for it. */
  const baked: { readonly target: BakeTarget; readonly was: string; readonly url: string }[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const run = async (): Promise<void> => {
    const density = spec.density ?? (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
    for (const target of spec.targets) {
      if (!live) return;
      const was = target.host.style.getPropertyValue(target.name);
      const address = svgUrlOf(was);
      if (!address) continue;
      try {
        const url = await bakeOne(address, (natural) => largestLay(spec.within, target.name, natural), density);
        baked.push({ target, was, url });
      } catch {
        // Left as it was. One texture that would not bake is one texture still
        // drawn the slow way, on a board that looks exactly the same.
      }
      await breathe();
    }
    if (!live) return;
    // All together: a variable written on the root restyles the document, and
    // the board should be redrawn for this once.
    for (const { target, url } of baked) target.host.style.setProperty(target.name, `url("${url}")`);
  };

  const done = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      timer = null;
      void run().then(resolve, resolve);
    }, BAKE.startMs);
  });

  return {
    done,
    destroy(): void {
      live = false;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      for (const { target, was, url } of baked) {
        if (target.host.style.getPropertyValue(target.name).includes(url)) {
          target.host.style.setProperty(target.name, was);
        }
        URL.revokeObjectURL(url);
      }
      baked.length = 0;
    },
  };
}
