// How far apart two trees sound: the same board rendered from each, and the difference.
//
//   node tools/perf/null-test.mjs <other-tree> [name]
//
// `other-tree` is a folder holding another version of this repo — an export of
// the commit before a change (see README.md). Both are served at once, and one
// page imports each tree's tests/support/offline-render.ts by its full
// address, renders the same board through both, and subtracts. Only numbers
// come back: megabytes of samples sent over the DevTools socket hung it.
//
// Three boards, chosen to expose a reverb: the board as it opens, where
// everything masks everything; one COW alone in a full cave; and one SLOW HIT
// alone in the short room. Name part of one to run only that.
//
// Each line gives the other tree against itself first. That is the browser's
// own floor — two renders of one graph are not always bit-identical in Chrome
// (see tests/offline.test.ts) — and a difference between the trees means
// something only where it is above it.

import path from 'node:path';
import { browsed, openPage, ROOT, serve, words } from './lib.mjs';

const [other, only] = words();
if (!other) throw new Error('Give the other tree: node tools/perf/null-test.mjs <path>');

const BOARDS = {
  'the board as it opens': { seconds: 20, sampleRate: 48000 },
  'a cow alone in a full cave': {
    seconds: 24,
    sampleRate: 48000,
    silent: true,
    sources: { cow: { on: true, often: 4, loud: 1 } },
    modifiers: { cavern: 1 },
    globals: { seriousness: 1 },
    wires: [{ from: 'cow', to: 'cavern' }],
  },
  'a slow hit in the short room': {
    seconds: 16,
    sampleRate: 48000,
    silent: true,
    sources: { slowhit: { on: true, often: 3, loud: 1 } },
    modifiers: { cavern: 1 },
    globals: { seriousness: 0 },
    wires: [{ from: 'slowhit', to: 'cavern' }],
  },
};

const db = (ratio) => (ratio > 0 ? `${(20 * Math.log10(ratio)).toFixed(1)}dB` : 'nothing at all');

const theirs = await serve(path.resolve(other));
const ours = await serve(ROOT);
try {
  await browsed(async (browser) => {
    const page = await openPage(browser, `${ours.origin}/__blank`);
    await page.until('document.readyState === "complete"');
    for (const [name, spec] of Object.entries(BOARDS)) {
      if (only && !name.includes(only)) continue;
      const r = await page.evaluate(`(async () => {
        const A = await import(${JSON.stringify(`${theirs.origin}/tests/support/offline-render.ts`)});
        const B = await import(${JSON.stringify(`${ours.origin}/tests/support/offline-render.ts`)});
        const spec = ${JSON.stringify(spec)};
        const timed = async (m) => { const t0 = performance.now(); const out = await m.render(spec); return { ms: performance.now() - t0, out }; };
        const a = await timed(A), again = await timed(A), b = await timed(B);
        const compare = (x, y) => {
          let sum = 0, diff = 0, worst = 0, peak = 0, n = 0;
          for (let c = 0; c < 2; c++) for (let i = 0; i < x.channels[c].length; i++) {
            const p = x.channels[c][i], d = p - y.channels[c][i];
            sum += p * p; diff += d * d; n++;
            if (Math.abs(d) > worst) worst = Math.abs(d);
            if (Math.abs(p) > peak) peak = Math.abs(p);
          }
          return { rms: Math.sqrt(sum / n), residual: Math.sqrt(diff / n), worst, peak };
        };
        return { theirs: a.ms, ours: b.ms, floor: compare(a.out, again.out), moved: compare(a.out, b.out) };
      })()`);
      console.log(name);
      console.log(`  level ${db(r.moved.rms)}FS rms, peak ${db(r.moved.peak)}FS; rendered in ${r.theirs.toFixed(0)}ms there, ${r.ours.toFixed(0)}ms here`);
      console.log(`  that tree against itself: ${db(r.floor.residual / r.floor.rms)} against the mix, worst sample ${db(r.floor.worst)}FS`);
      console.log(`  that tree against this:   ${db(r.moved.residual / r.moved.rms)} against the mix, worst sample ${db(r.moved.worst)}FS`);
    }
  });
} finally {
  await theirs.close();
  await ours.close();
}
