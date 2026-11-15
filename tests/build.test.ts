// What `npm run build` puts in dist/, checked on a real build held in memory.
//
// The source suites cannot see this. Whether the licences go out with the
// fonts, and whether the built page still asks for its files by relative path,
// are facts about the output — so this builds the board the way the script
// does, writes nothing, and reads what would have been written.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Every file the build would write, by its path under dist/. */
const files = new Map<string, string | Uint8Array>();

beforeAll(async () => {
  const result = await build({ root, logLevel: 'silent', build: { write: false } });
  const outputs = Array.isArray(result) ? result : [result];
  for (const output of outputs) {
    if (!('output' in output)) continue;
    for (const file of output.output) {
      files.set(file.fileName, file.type === 'asset' ? file.source : file.code);
    }
  }
}, 60_000);

const text = (name: string): string => {
  const file = files.get(name);
  if (file === undefined) throw new Error(`The build has no ${name}.`);
  return typeof file === 'string' ? file : new TextDecoder().decode(file);
};

describe('the build', () => {
  it('is one page and one script, asked for by relative path', () => {
    const names = [...files.keys()];

    expect(names).toContain('index.html');
    expect(names.filter((name) => name.endsWith('.js'))).toHaveLength(1);
    // Relative, so the folder runs from a subfolder or an unpacked zip.
    expect(text('index.html')).toMatch(/src="\.\/assets\/[^"]+\.js"/);
    expect(text('index.html')).not.toMatch(/(src|href)="\//);
  });

  it('carries every font the board declares', () => {
    const fonts = readdirSync(root + 'src/fonts').filter((name) => name.endsWith('.woff2'));
    const built = [...files.keys()].filter((name) => name.endsWith('.woff2'));

    expect(fonts.length).toBeGreaterThan(0);
    expect(built).toHaveLength(fonts.length);
  });

  it('sends the licence of every font out with the fonts, word for word', () => {
    // The Open Font License and the Apache License both ask that their text go
    // wherever the fonts go. Nothing imports a licence, so nothing but
    // vite.config.ts puts one in the build.
    const licences = readdirSync(root + 'src/fonts/licenses');

    expect(licences.length).toBeGreaterThanOrEqual(4);
    for (const name of licences) {
      expect(text(`licenses/${name}`), name).toBe(readFileSync(`${root}src/fonts/licenses/${name}`, 'utf8'));
    }
  });

  it('sends the board’s own licence out too', () => {
    expect(text('LICENSE.txt')).toBe(readFileSync(root + 'LICENSE', 'utf8'));
    expect(text('LICENSE.txt')).toContain('MIT License');
  });
});
