// Which thread is doing the work, unthrottled.
//
//   node tools/perf/threads.mjs <scene> [--hide=part,part] [--still] [--js="…"] [--top=30] [--on=CrGpuMain] [--skia]
//
// Traces a settled board for a few seconds and adds the trace up per thread.
// The headline is one line; `--top` lists the events behind it, on the thread
// `--on` names (the main thread unless told).
//
// The switches are for finding out *what* is costing it, one thing at a time:
// `--hide` takes parts off the page by their `data-part` (film, wash, sigil…),
// `--still` presses STILLNESS, and `--js` runs anything in the page first.
// `--skia` adds the categories that show what a rastered tile is made of —
// that is how 850 paths a tile was found.

import { boardIn, browsed, flag, served, SKIA, sleep, THREADS, trace, words } from './lib.mjs';

const scene = words()[0] ?? 'open';
const hide = flag('hide', '');
const top = Number(flag('top', 0));
const on = String(flag('on', 'CrRendererMain'));
const seconds = Number(flag('seconds', 4));

await served((server) =>
  browsed(async (browser) => {
    const page = await boardIn(browser, server.origin, scene, { dpr: Number(flag('dpr', 1.5)) });
    for (const part of String(hide).split(',').filter(Boolean)) {
      await page.evaluate(`document.querySelectorAll('[data-part="${part}"]').forEach((e) => { e.style.display = 'none'; }); 0`);
    }
    if (flag('still', false)) await page.evaluate('window.bench.stillness.toggle(); 0');
    const js = flag('js', '');
    if (js) await page.evaluate(`${js}; 0`);
    await sleep(1000);

    const t = await trace(browser, seconds * 1000, { categories: flag('skia', false) ? [...THREADS, ...SKIA] : THREADS });
    const of = (key) => t.pick(key).msPerSec;
    console.log(`${scene}, milliseconds of work per second:`);
    console.log(
      [
        ['main thread', of('CrRendererMain | RunTask')],
        ['  style', of('CrRendererMain | UpdateLayoutTree')],
        ['  layerize', of('CrRendererMain | Layerize')],
        ['  paint', of('CrRendererMain | Paint')],
        ['compositor', of('Compositor | RunTask')],
        ['viz', of('VizCompositorThread | RunTask')],
        ['gpu main', t.busy.CrGpuMain ?? 0],
        ['  raster', of('CrGpuMain | RendererRasterWorker')],
        ['audio thread', of('AudioOutputDevice | AudioDestination::Render')],
      ]
        .map(([name, ms]) => `  ${String(name).padEnd(14)}${String(ms).padStart(9)}`)
        .join('\n'),
    );
    console.log(
      `  tiles rastered ${t.pick('CrGpuMain | RasterDecoderImpl::DoRasterCHROMIUM').perSec}/s, ` +
        `render passes ${t.pick('CrGpuMain | SkiaOutputSurfaceImplOnGpu::FinishPaintRenderPass').perSec}/s, ` +
        `worst audio callback ${t.pick('AudioOutputDevice | AudioDestination::Render').maxMs}ms`,
    );
    if (top > 0) {
      console.log(`\ntop ${top} on ${on}:  ms/s   per second   longest ms`);
      for (const row of t.top.filter((entry) => entry.key.startsWith(`${on} | `)).slice(0, top)) {
        console.log(`  ${String(row.msPerSec).padStart(8)} ${String(row.perSec).padStart(9)} ${String(row.maxMs).padStart(9)}  ${row.key.slice(on.length + 3)}`);
      }
    }
  }),
);
