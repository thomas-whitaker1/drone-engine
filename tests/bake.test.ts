// @vitest-environment happy-dom
//
// The drawn textures, turned into pictures of themselves — and the rule that
// doing so may never cost the board anything it already had.
//
// What a bitmap of a scratch *looks* like is not something this suite can say:
// happy-dom draws nothing. That was measured in a real browser, against the
// same board drawn from the SVGs, and is written down in ../src/bake. What is
// held here is the arithmetic that decides how big a picture is cut, and the
// four promises round it: it only runs where it has been measured, the board
// is never left with neither a drawing nor a picture, every picture arrives in
// the same breath, and a torn-down page gets its drawings back.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BAKE, BAKED_TOKENS, bakedSize, bakeTextures, canBake, largestLay, svgUrlOf } from '../src/bake';
import type { BakeHandle } from '../src/bake';
import { cssVars, installTokenVars } from '../src/tokens';

const SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3C/svg%3E";

describe('reading a drawing out of a variable', () => {
  it('takes the address out of a url(), however it is quoted', () => {
    expect(svgUrlOf(`url("${SVG}")`)).toBe(SVG);
    expect(svgUrlOf(`url('data:image/svg+xml,%3Csvg%3E%3C/svg%3E')`)).toBe('data:image/svg+xml,%3Csvg%3E%3C/svg%3E');
    expect(svgUrlOf(`  url(data:image/svg+xml;base64,AAAA)  `)).toBe('data:image/svg+xml;base64,AAAA');
    // A browser handing a quoted value back may escape the quotes inside it.
    expect(svgUrlOf(`url("data:image/svg+xml,%3Csvg width=\\'1\\'%3E")`)).toBe("data:image/svg+xml,%3Csvg width='1'%3E");
  });

  it('reads every drawn token the board publishes', () => {
    for (const name of BAKED_TOKENS) {
      expect(svgUrlOf(cssVars[name]), name).toMatch(/^data:image\/svg\+xml/);
    }
  });

  it('leaves alone anything that is not a drawing written out in place', () => {
    // A picture already baked, a colour, a gradient, nothing at all: none of
    // them is something to bake, and saying so is how a second run is harmless.
    expect(svgUrlOf('url("blob:http://localhost/3f2a")')).toBeNull();
    expect(svgUrlOf('url("data:image/png;base64,AAAA")')).toBeNull();
    expect(svgUrlOf('#121009')).toBeNull();
    expect(svgUrlOf('linear-gradient(#000, #fff)')).toBeNull();
    expect(svgUrlOf('')).toBeNull();
  });

  it('does not bake the grain', () => {
    // Noise, not drawing: one rectangle and a filter, cheap to play back and
    // the one texture a resample would visibly soften.
    expect(BAKED_TOKENS).not.toContain('--grainTex');
    expect(Object.keys(cssVars)).toContain('--grainTex');
  });
});

describe('how big a picture is cut', () => {
  const lay = (style: string): HTMLElement => {
    const node = document.createElement('div');
    node.style.cssText = style;
    return node;
  };

  it('finds the largest size a tile is laid at', () => {
    const board = document.createElement('div');
    board.append(
      lay('background-image:var(--rustTex);background-size:150px;'),
      lay('background-image:var(--rustTex);background-size:709px auto;'),
      lay('background-image:var(--rustTex);background-size:420px;'),
      // Somebody else's tile, however large, is not this one's business.
      lay('background-image:var(--scratchTex);background-size:2000px;'),
    );
    expect(largestLay(board, '--rustTex', 380)).toBeCloseTo(709 / 380, 10);
    expect(largestLay(board, '--scratchTex', 180)).toBeCloseTo(2000 / 180, 10);
  });

  it('counts a tile laid as a mask', () => {
    const board = document.createElement('div');
    const ring = lay('background-size:224px;');
    ring.style.setProperty('mask-image', 'var(--chipTex)');
    board.append(ring);
    expect(largestLay(board, '--chipTex', 112)).toBe(2);
  });

  it('never cuts a picture smaller than the drawing', () => {
    const board = document.createElement('div');
    // Laid small everywhere, laid by percentage, and laid nowhere at all.
    board.append(lay('background-image:var(--rustTex);background-size:120px;'));
    board.append(lay('background-image:var(--sealTex);background-size:100% 100%;'));
    expect(largestLay(board, '--rustTex', 380)).toBe(1);
    expect(largestLay(board, '--sealTex', 760)).toBe(1);
    expect(largestLay(board, '--verdiTex', 380)).toBe(1);
    expect(largestLay(board, '--rustTex', 0)).toBe(1);
  });

  it('cuts for the largest lay at the screen it is on', () => {
    expect(bakedSize(180, 180, 1, 1)).toEqual({ width: 180, height: 180 });
    expect(bakedSize(180, 180, 1.5, 2)).toEqual({ width: 540, height: 540 });
    expect(bakedSize(520, 130, 1, 1.5)).toEqual({ width: 780, height: 195 });
    // A density under one is a zoomed-out page, and is answered as one.
    expect(bakedSize(180, 180, 1, 0.5)).toEqual({ width: 180, height: 180 });
  });

  it('stops at a longest edge, and at a density', () => {
    const huge = bakedSize(760, 760, 4, 3);
    expect(huge.width).toBe(BAKE.maxEdge);
    expect(huge.height).toBe(BAKE.maxEdge);
    // The shape survives the cap.
    const strip = bakedSize(520, 130, 4, 3);
    expect(strip.width).toBe(BAKE.maxEdge);
    expect(strip.width / strip.height).toBeCloseTo(4, 1);
    // And a phone at five device pixels is answered as three.
    expect(bakedSize(100, 100, 1, 5)).toEqual({ width: 100 * BAKE.maxDensity, height: 100 * BAKE.maxDensity });
  });
});

describe('baking', () => {
  const live: BakeHandle[] = [];
  let made: string[] = [];
  let revoked: string[] = [];

  /** An `Image` that decodes at once to a tile of a known size — or refuses to. */
  function fakeImages(refuse: (src: string) => boolean = () => false): void {
    class FakeImage {
      src = '';
      naturalWidth = 180;
      naturalHeight = 180;
      decode(): Promise<void> {
        return refuse(this.src) ? Promise.reject(new Error('undecodable')) : Promise.resolve();
      }
    }
    vi.stubGlobal('Image', FakeImage);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    made = [];
    revoked = [];
    installTokenVars();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: () => undefined,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (done: BlobCallback) {
      done(new Blob(['png'], { type: 'image/png' }));
    });
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      const url = `blob:test/${made.length}`;
      made.push(url);
      return url;
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => {
      revoked.push(String(url));
    });
  });

  afterEach(() => {
    for (const handle of live.splice(0)) handle.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    for (const name of Object.keys(cssVars)) document.documentElement.style.removeProperty(name);
  });

  const root = (): HTMLElement => document.documentElement;
  const targets = (...names: string[]) => names.map((name) => ({ host: root(), name }));
  const read = (name: string): string => root().style.getPropertyValue(name);

  function bake(spec: Partial<Parameters<typeof bakeTextures>[0]> = {}): BakeHandle {
    const handle = bakeTextures({ within: document.body, targets: targets(...BAKED_TOKENS), enabled: true, ...spec });
    live.push(handle);
    return handle;
  }

  /** Let the start timer fire and every awaited step after it run. */
  const settle = async (handle: BakeHandle): Promise<void> => {
    await vi.advanceTimersByTimeAsync(BAKE.startMs + 1000);
    await handle.done;
  };

  it('only runs where it has been measured', () => {
    // happy-dom is not Chromium and does not say it is. Neither does Firefox,
    // whose privacy mode hands a canvas back blank — a board with white rust.
    expect(canBake()).toBe(false);
    vi.stubGlobal('navigator', { userAgentData: { brands: [{ brand: 'Chromium' }, { brand: 'Google Chrome' }] } });
    expect(canBake()).toBe(true);
    vi.stubGlobal('navigator', { userAgentData: { brands: [{ brand: 'Not A Brand' }] } });
    expect(canBake()).toBe(false);
  });

  it('does nothing at all where it does not run', async () => {
    fakeImages();
    const before = BAKED_TOKENS.map(read);
    const handle = bake({ enabled: false });
    await settle(handle);
    expect(BAKED_TOKENS.map(read)).toEqual(before);
    expect(made).toEqual([]);
  });

  it('is not what the first paint waits on', async () => {
    fakeImages();
    const before = BAKED_TOKENS.map(read);
    const handle = bake();
    // Built, and nothing has been touched: the board is drawn from the
    // drawings, exactly as it always was.
    expect(BAKED_TOKENS.map(read)).toEqual(before);
    await vi.advanceTimersByTimeAsync(BAKE.startMs - 1);
    expect(made).toEqual([]);
    await settle(handle);
    expect(made.length).toBe(BAKED_TOKENS.length);
  });

  it('points every variable at a picture, and all of them at once', async () => {
    fakeImages();
    const writes: string[] = [];
    const write = root().style.setProperty.bind(root().style);
    vi.spyOn(root().style, 'setProperty').mockImplementation((name: string, value: string | null) => {
      // Recorded with how many pictures existed when it was written.
      writes.push(`${name}@${made.length}`);
      write(name, value ?? '');
    });

    await settle(bake());

    for (const name of BAKED_TOKENS) expect(read(name), name).toMatch(/^url\("blob:test\/\d+"\)$/);
    // No variable was written until the last picture had been made: the board
    // is redrawn for this once, not once a texture.
    expect(writes).toEqual(BAKED_TOKENS.map((name) => `${name}@${BAKED_TOKENS.length}`));
    // And the grain was never one of them.
    expect(read('--grainTex')).toBe(cssVars['--grainTex']);
  });

  it('leaves a texture that will not bake as the drawing it was', async () => {
    const stubborn = svgUrlOf(cssVars['--scratchTex']);
    fakeImages((src) => src === stubborn);

    await settle(bake());

    expect(read('--scratchTex')).toBe(cssVars['--scratchTex']);
    expect(read('--rustTex')).toMatch(/^url\("blob:/);
  });

  it('leaves it as a drawing when the picture itself cannot be read', async () => {
    // A canvas that hands back nothing — which is what being refused looks like.
    fakeImages();
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (done: BlobCallback) {
      done(null);
    });
    const before = BAKED_TOKENS.map(read);

    await settle(bake());

    expect(BAKED_TOKENS.map(read)).toEqual(before);
  });

  it('skips a variable that is already a picture, or was never a drawing', async () => {
    fakeImages();
    root().style.setProperty('--rustTex', 'url("blob:somewhere/else")');
    await settle(bake({ targets: targets('--rustTex', '--page', '--nothing') }));
    expect(made).toEqual([]);
    expect(read('--rustTex')).toBe('url("blob:somewhere/else")');
  });

  it('gives the drawings back when the page is torn down', async () => {
    fakeImages();
    const before = BAKED_TOKENS.map(read);
    const handle = bake();
    await settle(handle);
    handle.destroy();
    expect(BAKED_TOKENS.map(read)).toEqual(before);
    expect(revoked.sort()).toEqual([...made].sort());
  });

  it('writes nothing onto a page torn down while it was still baking', async () => {
    fakeImages();
    const before = BAKED_TOKENS.map(read);
    const handle = bake();
    await vi.advanceTimersByTimeAsync(BAKE.startMs + 1);
    handle.destroy();
    await settle(handle);
    expect(BAKED_TOKENS.map(read)).toEqual(before);
    // Whatever had been made by then was let go of.
    expect(revoked.length).toBeGreaterThanOrEqual(made.length - 1);
  });
});
