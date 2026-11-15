// @vitest-environment happy-dom
//
// The typefaces, and the rule that loading them may never hold the board up
// (gt#69, and gt#47 before it).
//
// The page asks the network for nothing: the six files are in the repo (gt#94).
// What this suite holds is that they are really there and really what they say,
// and the three properties that make a file that is slow or missing cost the
// board its typography and nothing else: the faces are declared from script,
// every one swaps, and arrival is reported rather than guessed at.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FONTS, fontFaceCss, loadFonts } from '../src/fonts';
import type { FontsHandle } from '../src/fonts';
import { fonts, typefaces } from '../src/tokens';

// Through node:path rather than the URL constructor: a DOM test environment
// replaces the global URL, and its parser mangles a Windows file:// base into
// the drive root.
const root = join(dirname(fileURLToPath(import.meta.url)), '..') + '/';

/** Every `.ts` file under a directory, as repo-relative paths. */
function sources(dir: string): string[] {
  return readdirSync(root + dir).flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(root + path).isDirectory() ? sources(path) : path.endsWith('.ts') ? [path] : [];
  });
}

const live: FontsHandle[] = [];

/** Stand in for `document.fonts`, which happy-dom does not have. */
function faceSet(): EventTarget {
  const set = new EventTarget();
  Object.defineProperty(document, 'fonts', { value: set, configurable: true });
  return set;
}

function load(onSettle?: () => void): FontsHandle {
  const handle = loadFonts(onSettle ? { onSettle } : {});
  live.push(handle);
  return handle;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const handle of live.splice(0)) handle.destroy();
  delete (document as unknown as { fonts?: unknown }).fonts;
  document.head.innerHTML = '';
  vi.useRealTimers();
});

/** One `@font-face` rule per face, as `fontFaceCss` wrote it. */
const rules = (): string[] => fontFaceCss().split('@font-face').filter(Boolean);

describe('which faces are carried', () => {
  it('loads every family a stack leads with, so none is named and never loaded', () => {
    // The bug, as a property. The board spent its first three months with four
    // families in `fonts` and no request for any of them.
    const asked = typefaces.map((face) => face.family);
    for (const [role, stack] of Object.entries(fonts)) {
      const first = /^'([^']+)'/.exec(stack)?.[1];
      expect(asked, role).toContain(first);
    }
    expect(asked).toHaveLength(Object.keys(fonts).length);
  });

  it('asks for the weights the handoff draws, and no others', () => {
    const weights = Object.fromEntries(typefaces.map((face) => [face.family, [...face.weights]]));
    expect(weights).toEqual({
      'Permanent Marker': [400],
      'Public Sans': [400, 600],
      'Saira Condensed': [600, 700],
      'Stardos Stencil': [400, 700],
    });
  });

  it('has a file behind every family and weight, and no file nobody draws', () => {
    // The two tables that have to agree. A row in `typefaces` with no file is a
    // face named and never loaded; a file with no row is weight nobody asked for.
    const drawn = typefaces.flatMap((face) => face.weights.map((weight) => `${face.family} ${weight}`));
    const carried = Object.entries(FONTS.files).flatMap(([family, byWeight]) =>
      Object.keys(byWeight).map((weight) => `${family} ${weight}`),
    );

    expect(carried.sort()).toEqual([...drawn].sort());
    for (const face of drawn) expect(carried.filter((row) => row === face), face).toHaveLength(1);
  });

  it('declares one face per family and weight, each one swapping', () => {
    const css = rules();

    expect(css).toHaveLength(typefaces.reduce((count, face) => count + face.weights.length, 0));
    for (const { family, weights } of typefaces) {
      for (const weight of weights) {
        const rule = css.find(
          (text) => text.includes(`font-family:'${family}'`) && text.includes(`font-weight:${weight};`),
        );
        expect(rule, `${family} ${weight}`).toBeDefined();
        // The half of each rule that is a promise rather than a request.
        expect(rule, `${family} ${weight}`).toContain('font-display:swap');
        expect(rule, `${family} ${weight}`).toContain('format("woff2")');
        expect(rule, `${family} ${weight}`).toContain(`unicode-range:${FONTS.range}`);
      }
    }
  });

  it('carries the files in the repo, and they are what they say they are', () => {
    const files = readdirSync(root + 'src/fonts').filter((name) => name.endsWith('.woff2'));
    const named = new Set(
      Object.values(FONTS.files).flatMap((byWeight) =>
        Object.values(byWeight).map((address) => address.split('/').pop()?.split('?')[0]),
      ),
    );

    // Every file on disk is one a face names, and every face names one on disk.
    expect(files.sort()).toEqual([...named].sort());
    for (const name of files) {
      const bytes = readFileSync(root + 'src/fonts/' + name);
      // The four bytes every woff2 opens with. A saved error page does not.
      expect(bytes.subarray(0, 4).toString('latin1'), name).toBe('wOF2');
      // A latin subset is tens of kilobytes. Far past that is a whole family.
      expect(bytes.length, name).toBeGreaterThan(8_000);
      expect(bytes.length, name).toBeLessThan(60_000);
    }
  });

  it('carries the licence each one is distributed under', () => {
    const licences = readdirSync(root + 'src/fonts/licenses');

    for (const { family } of typefaces) {
      const slug = family.toLowerCase().replace(/ /g, '-');
      const file = licences.find((name) => name.includes(slug));
      expect(file, family).toBeDefined();
      const text = readFileSync(root + 'src/fonts/licenses/' + file, 'utf8');
      expect(text, family).toMatch(/SIL OPEN FONT LICENSE|Apache License/i);
    }
  });

  it('covers every character the board actually draws', () => {
    // The files are the latin range only. If the lettering ever grows a
    // character outside it, that character is drawn in a fallback face in the
    // middle of a word — which is worth a red test, not a surprise.
    const ranges = FONTS.range.split(',').map((span) => {
      const [from, to = from] = span.trim().replace('U+', '').split('-');
      return [parseInt(from ?? '', 16), parseInt(to ?? '', 16)] as const;
    });
    const covered = (char: string): boolean =>
      ranges.some(([from, to]) => (char.codePointAt(0) ?? -1) >= from && (char.codePointAt(0) ?? -1) <= to);

    const words = readFileSync(root + 'src/ui/words.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const strays = [...new Set([...words].filter((char) => char.charCodeAt(0) > 127 && !covered(char)))];

    expect(strays).toEqual([]);
  });
});

describe('what the board is drawn in without them', () => {
  it('never falls back to `cursive`, which is Comic Sans on Windows', () => {
    for (const [role, stack] of Object.entries(fonts)) {
      expect(stack.split(',').map((name) => name.trim()), role).not.toContain('cursive');
    }
  });

  it('gives every stack a real fallback before its generic', () => {
    for (const [role, stack] of Object.entries(fonts)) {
      const names = stack.split(',').map((name) => name.trim());
      expect(names.length, role).toBeGreaterThanOrEqual(3);
      expect(['serif', 'sans-serif'], role).toContain(names[names.length - 1]);
    }
  });
});

describe('the declaration', () => {
  it('is made from script, so nothing about a typeface can hold back first paint', () => {
    // A stylesheet written into the shell blocks rendering until it answers.
    // A `<style>` a script appends blocks nothing — so the shell stays empty of
    // fonts and addresses, and the faces arrive this way instead.
    // The share card's tags name addresses without fetching them (gt#121);
    // tests/scaffold.test.ts holds the shell to those two and no others.
    const shell = readFileSync(root + 'index.html', 'utf8');
    expect(shell).not.toMatch(/(?:src|href)="https?:\/\//);
    expect(shell).not.toContain('@font-face');
    expect(shell).not.toMatch(/<link[^>]+stylesheet/);

    const handle = load();
    const sheet = document.head.querySelector<HTMLStyleElement>(`style[${FONTS.mark}]`);

    expect(sheet?.textContent).toBe(fontFaceCss());
    expect(handle.sheet).toBe(sheet);
  });

  it('adds no link of any kind: there is no other host to warm or to ask', () => {
    load();

    expect(document.head.querySelectorAll('link')).toHaveLength(0);
  });

  it('is not made twice on one page', () => {
    load();
    const second = load();

    expect(document.head.querySelectorAll(`style[${FONTS.mark}]`)).toHaveLength(1);
    expect(second.sheet).toBeNull();
  });

  it('takes back only what it added', () => {
    const first = load();
    const second = load();

    second.destroy();
    expect(document.head.querySelectorAll(`style[${FONTS.mark}]`)).toHaveLength(1);

    first.destroy();
    expect(document.head.querySelectorAll(`style[${FONTS.mark}]`)).toHaveLength(0);
  });

  it('leaves the origin for nothing: no file under src/ names a remote address', () => {
    // The audio half of the rule is absolute — the sound path fetches nothing,
    // ever — and since gt#94 the whole page keeps it. This file used to be the
    // one exception. An XML namespace is an identifier, not a request.
    const remote = /https?:\/\/(?!www\.w3\.org\/)/;
    const offenders = sources('src').filter((path) => remote.test(readFileSync(root + path, 'utf8')));

    expect(offenders).toEqual([]);
    // And every face is served from wherever the script was.
    for (const byWeight of Object.values(FONTS.files)) {
      for (const address of Object.values(byWeight)) expect(address).not.toMatch(/^(https?:)?\/\//);
    }
    for (const path of sources('src/engine')) {
      expect(readFileSync(root + path, 'utf8'), path).not.toMatch(/\bfetch\(|XMLHttpRequest|import\(/);
    }
  });
});

describe('when the faces land', () => {
  it('says so each time a batch finishes, however many there are', () => {
    const set = faceSet();
    let settled = 0;
    load(() => (settled += 1));

    set.dispatchEvent(new Event('loadingdone'));
    set.dispatchEvent(new Event('loadingdone'));

    expect(settled).toBe(2);
  });

  it('says so once on a timer too, for a request that never settles', () => {
    faceSet();
    let settled = 0;
    load(() => (settled += 1));

    vi.advanceTimersByTime(FONTS.settleMs - 1);
    expect(settled).toBe(0);
    vi.advanceTimersByTime(1);
    expect(settled).toBe(1);
  });

  it('still reports on an engine with no `document.fonts` at all', () => {
    let settled = 0;
    load(() => (settled += 1));

    vi.advanceTimersByTime(FONTS.settleMs);
    expect(settled).toBe(1);
  });

  it('says nothing once it is destroyed', () => {
    const set = faceSet();
    let settled = 0;
    const handle = load(() => (settled += 1));

    handle.destroy();
    set.dispatchEvent(new Event('loadingdone'));
    vi.advanceTimersByTime(FONTS.settleMs);

    expect(settled).toBe(0);
  });
});
