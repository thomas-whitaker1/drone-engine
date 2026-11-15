// Which compositor layers the board is made of, why each exists, and which are being repainted.
//
//   node tools/perf/layers.mjs <scene> [--order] [--js="…"] [--seconds=4]
//
// Sorted by repaints a second unless `--order`, which lists them in paint
// order — the way to see *where* a run of layers starts. Layers that are the
// same part at the same size for the same reason are folded into one row.
//
// The reason column is the browser's own. `Overlap` means "painted after
// something that has a layer, and might be over it"; a blank one on a `grain`
// or a `scratches` is a blend mode that could not be flattened into the layer
// under it. The guard cover's layer is what starts both on this board, on
// purpose — see the note on it in src/ui/board.ts before removing one.

import { boardIn, browsed, describe, flag, served, sleep, words } from './lib.mjs';

const scene = words()[0] ?? 'open';
const seconds = Number(flag('seconds', 4));
const dpr = Number(flag('dpr', 1.5));

await served((server) =>
  browsed(async (browser) => {
    const page = await boardIn(browser, server.origin, scene, { dpr });
    const js = flag('js', '');
    if (js) await page.evaluate(`${js}; 0`);

    let layers = [];
    const off = browser.on((message) => {
      if (message.sessionId !== page.sessionId) return;
      if (message.method === 'LayerTree.layerTreeDidChange' && message.params.layers) layers = message.params.layers;
    });
    await page.send('DOM.enable');
    await page.send('LayerTree.enable');
    await sleep(1000);
    const first = new Map(layers.map((layer) => [layer.layerId, layer.paintCount]));
    await sleep(seconds * 1000);
    off();

    let bytes = 0;
    const rows = [];
    for (const layer of layers) {
      if (!layer.drawsContent) continue;
      bytes += layer.width * layer.height * 4 * dpr * dpr;
      let reasons = '';
      try {
        const reply = await page.send('LayerTree.compositingReasons', { layerId: layer.layerId });
        reasons = (reply.compositingReasonIds ?? reply.compositingReasons ?? []).join(',');
      } catch {
        // A layer that went away while it was being asked about.
      }
      rows.push({
        what: await describe(page, layer.backendNodeId),
        size: `${Math.round(layer.width)}x${Math.round(layer.height)}`,
        paints: (layer.paintCount - (first.get(layer.layerId) ?? layer.paintCount)) / seconds,
        reasons,
        count: 1,
      });
    }

    console.log(`${scene}: ${rows.length} layers drawing content, about ${(bytes / 1e6).toFixed(0)} MB of texture at ${dpr}x`);
    let shown = rows;
    if (!flag('order', false)) {
      const folded = new Map();
      for (const row of rows) {
        const key = `${row.what} ${row.size} ${row.reasons}`;
        const had = folded.get(key);
        if (had) {
          had.count += 1;
          had.paints += row.paints;
        } else folded.set(key, { ...row });
      }
      shown = [...folded.values()].sort((a, b) => b.paints - a.paints);
    }
    for (const row of shown) {
      console.log(`${row.paints.toFixed(1).padStart(6)} paints/s ${`x${row.count}`.padStart(4)} ${row.size.padStart(10)}  ${row.what.padEnd(26)} ${row.reasons}`);
    }
  }),
);
