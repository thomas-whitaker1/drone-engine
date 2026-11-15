// What is being repainted on a board nobody is touching, and how often.
//
//   node tools/perf/paints.mjs <scene> [--js="…"] [--seconds=5] [--top=25]
//
// layers.mjs says which *layers* repaint. This says which *elements* asked:
// every Paint event in a trace, by the node it was for. A part that shows up
// here many times a second on a settled board is a part repainting on a clock,
// and whatever layer it is painted into is being drawn again each time — which
// is how the beat lamp was found redrawing a strip of plate on every beat.

import { boardIn, browsed, describe, flag, served, trace, words } from './lib.mjs';

const scene = words()[0] ?? 'open';
const seconds = Number(flag('seconds', 5));
const top = Number(flag('top', 25));

await served((server) =>
  browsed(async (browser) => {
    const page = await boardIn(browser, server.origin, scene, { dpr: Number(flag('dpr', 1.5)) });
    const js = flag('js', '');
    if (js) await page.evaluate(`${js}; 0`);
    await page.send('DOM.enable');
    await page.send('DOM.getDocument', { depth: 0 });

    const t = await trace(browser, seconds * 1000, {
      categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'cc'],
    });

    const paints = new Map();
    let rasters = 0;
    for (const event of t.events) {
      if (event.name === 'RasterTask' && event.ph === 'X') rasters += 1;
      if (event.name !== 'Paint' || !event.args?.data?.clip) continue;
      const row = paints.get(event.args.data.nodeId) ?? { n: 0, dur: 0 };
      row.n += 1;
      row.dur += event.dur ?? 0;
      paints.set(event.args.data.nodeId, row);
    }
    console.log(`${scene}: ${(rasters / t.seconds).toFixed(1)} raster tasks a second`);
    console.log('  paints/s   ms/s  part');
    for (const [nodeId, row] of [...paints].sort((a, b) => b[1].n - a[1].n).slice(0, top)) {
      console.log(`  ${(row.n / t.seconds).toFixed(1).padStart(8)} ${(row.dur / 1000 / t.seconds).toFixed(2).padStart(6)}  ${await describe(page, nodeId)}`);
    }
  }),
);
