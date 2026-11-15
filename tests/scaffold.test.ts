import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (name: string) => readFileSync(root + name, 'utf8');

describe('scaffold', () => {
  it('ships no runtime dependencies', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies?: Record<string, string> };
    expect(pkg.dependencies ?? {}).toEqual({});
  });

  it('fetches nothing from the page shell, so nothing fetched can block first paint', () => {
    // This used to hold a policy — no network requests at all. The policy went
    // (gt#23) and the check stayed for a better reason (gt#47): anything a page
    // shell asks for is something the wake screen has to wait for. The
    // typefaces are in the repo now (gt#94) and src/fonts.ts declares them from
    // script; tests/fonts.test.ts holds the rest of that bargain.
    //
    // The share card's two addresses (gt#121) are the exception, because a
    // `<meta>` names an address without the page fetching it. They are taken
    // out first, by their exact shape, so an address anywhere else still fails.
    const named = /<meta property="og:(?:url|image)" content="https:\/\/[^"]+" \/>/g;
    const html = read('index.html');
    expect(html.match(named)).toHaveLength(2);
    expect(html.replace(named, '')).not.toMatch(/https?:\/\//);
  });

  it('shows a card where it is shared, and the card ships with the board', () => {
    const html = read('index.html');
    const meta = (property: string) =>
      new RegExp(`<meta\\s+property="${property}"\\s+content="([^"]+)"`, 's').exec(html)?.[1] ?? '';
    const description = /<meta\s+name="description"\s+content="([^"]+)"/s.exec(html)?.[1];

    // The image sits beside the page it advertises, so wherever the board is
    // hosted, its card is hosted with it.
    expect(meta('og:image')).toBe(`${meta('og:url')}card.png`);
    expect(meta('og:description')).toBe(description);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');

    // A PNG of the size the tags declare: width and height are at bytes 16–23.
    const png = readFileSync(root + 'public/card.png');
    expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([
      Number(meta('og:image:width')),
      Number(meta('og:image:height')),
    ]);
  });

  it('opens on the page background the design calls for', () => {
    const html = read('index.html');
    expect(html).toContain('background: #121009;');
    expect(html).toContain('overflow-x: hidden;');
  });

  it('carries its own tab icon, so the browser never asks the server for one', () => {
    // A page with no icon link makes the browser request /favicon.ico. That is
    // a network request this page did not mean to make, and a 404 in the log of
    // whoever hosts it. The icon is a data: URI in the shell instead — and its
    // SVG namespace is spelled so that the no-URL check above still holds.
    const html = read('index.html');
    const href = /<link\s+rel="icon"[^>]*href="([^"]+)"/s.exec(html)?.[1] ?? '';

    expect(href.startsWith('data:image/svg+xml,')).toBe(true);
    const svg = decodeURIComponent(href.slice('data:image/svg+xml,'.length));
    expect(svg.startsWith("<svg xmlns='http://www.w3.org/2000/svg'")).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    // Every angle bracket and hash is escaped, or the URI ends where one is.
    expect(href.slice('data:image/svg+xml,'.length)).not.toMatch(/[<>#]/);
  });

  it('says what it is, and that it is loud, to anything that reads the head', () => {
    const html = read('index.html');
    const description = /<meta\s+name="description"\s+content="([^"]+)"/s.exec(html)?.[1] ?? '';

    expect(description).toContain('drone-metal');
    expect(description).toContain('loud');
    expect(description).toContain('flashes');
    expect(description.length).toBeLessThanOrEqual(160);
    expect(html).toContain('<meta name="theme-color" content="#121009" />');
  });

  it('writes an issue number with its tag, never bare', () => {
    // The comments and test titles here point at issues in a tracker the public
    // repository does not have. A bare hash and a number would read as an issue
    // *here*, and would start linking to the wrong thing the day this
    // repository has issues of its own. So every one is written `gt#` and the
    // number, and this is what keeps the next one from arriving without it.
    //
    // What counts as bare: a hash, then one to three digits with no leading
    // zero, standing on its own — not part of a longer word or a hex colour
    // (`#000` leads with a zero; `#121009` and `#1a1610` run on past three).
    const bare = /(?<![\w&#])#[1-9][0-9]{0,2}(?![\w])/g;
    const scanned = /\.(ts|mjs|md|html)$/;
    const walk = (dir: string): string[] =>
      readdirSync(root + dir, { withFileTypes: true }).flatMap((entry) => {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) return entry.name === 'out' ? [] : walk(path);
        return scanned.test(entry.name) ? [path] : [];
      });

    const files = [...walk('src'), ...walk('tests'), ...walk('tools'), 'index.html', 'vite.config.ts'];
    const found = files.flatMap((file) =>
      read(file)
        .split('\n')
        .flatMap((line, index) => (line.match(bare) ?? []).map((hit) => `${file}:${index + 1} ${hit}`)),
    );

    expect(files.length).toBeGreaterThan(80);
    expect(found).toEqual([]);
  });
});
