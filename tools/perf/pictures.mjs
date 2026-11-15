// The same pictures of the board, from any tree, to compare.
//
//   node tools/perf/pictures.mjs <label> [--tree=<path>]      take them
//   node tools/perf/pictures.mjs <label> --against=<label>    compare two sets
//
// A change that is meant to cost nothing to look at can be held to that: take
// a set from the tree before (`--tree`, an export of the old commit — see
// README.md) and a set from this one, and compare.
//
// The pictures are the same pixels run to run, which takes two things. The
// board is STILLED, so nothing is moving on a clock; and the grain's own
// keyframes are switched off rather than paused, because a paused animation
// stops wherever it happened to be. Four states: the cold board, the woken
// one, every module on, and the shelf armed and driven (stilled, so it shows
// what it has done to the plate and none of what moves).
//
// A comparison counts pixels by how far their worst channel moved, out of 255.
// Text and rotated marks always move a little between two builds; `over 8` is
// the number to look at, and `box` is where to look.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { browsed, DRONES, flag, openBoard, openPage, outDir, served, sleep, STRIKES, up, wake, words } from './lib.mjs';

const label = words()[0];
if (!label) throw new Error('Give the set a label: node tools/perf/pictures.mjs <label>');
const dir = outDir('pictures');
const against = flag('against', '');

async function take() {
  const tree = flag('tree', undefined);
  await served(
    (server) =>
      browsed(async (browser) => {
        const page = await openBoard(browser, server.origin, { width: 1280, height: 800, dpr: 1 });
        await page.evaluate('document.fonts.ready.then(() => 0)');
        const snap = async (name) => {
          await page.evaluate(`document.querySelectorAll('[data-part="film"]').forEach((e) => { e.style.animation = 'none'; }); 0`);
          // Past the two-second fade a plate's tint takes to arrive.
          await sleep(3200);
          const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
          writeFileSync(path.join(dir, `${label}-${name}.png`), Buffer.from(data, 'base64'));
          console.log(`took ${label}-${name}.png`);
        };

        await page.evaluate('window.bench.stillness.toggle(); 0');
        await snap('cold');
        await wake(page);
        await snap('woke');
        for (const id of [...STRIKES, ...DRONES]) {
          if (!(await page.evaluate(`window.bench.engine.sources.${id}.on`))) await page.click(`[data-module="${id}"] [data-part="power"]`);
        }
        await snap('allon');
        // The shelf has to be let move to be driven, and is stilled again to be looked at.
        await page.evaluate('window.bench.stillness.toggle(); 0');
        await page.evaluate('window.bench.apart.toggle(); 0');
        await up(page, 'mods.grit');
        await up(page, 'mods.murk');
        await page.evaluate('window.bench.stillness.toggle(); 0');
        await snap('armed');
      }),
    tree ? path.resolve(String(tree)) : undefined,
  );
}

async function compare() {
  const names = readdirSync(dir)
    .filter((file) => file.startsWith(`${label}-`) && file.endsWith('.png'))
    .map((file) => file.slice(label.length + 1, -4));
  if (!names.length) throw new Error(`No pictures labelled "${label}" in ${dir}.`);
  await served((server) =>
    browsed(async (browser) => {
      const page = await openPage(browser, `${server.origin}/__blank`);
      await page.until('document.readyState === "complete"');
      const url = (set, name) => `data:image/png;base64,${readFileSync(path.join(dir, `${set}-${name}.png`)).toString('base64')}`;
      for (const name of names) {
        const result = await page.evaluate(`(async () => {
          const get = async (src) => { const i = new Image(); i.src = src; await i.decode(); const c = new OffscreenCanvas(i.width, i.height); const x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, i.width, i.height); };
          const A = await get(${JSON.stringify(url(label, name))}), B = await get(${JSON.stringify(url(String(against), name))});
          if (A.width !== B.width || A.height !== B.height) return { sizes: [A.width, A.height, B.width, B.height] };
          let any = 0, over2 = 0, over8 = 0, worst = 0, box = [1e9, 1e9, -1, -1];
          for (let i = 0; i < A.data.length; i += 4) {
            const d = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]));
            if (!d) continue;
            any++; if (d > 2) over2++; if (d > worst) worst = d;
            if (d > 8) { over8++; const p = i / 4, x = p % A.width, y = (p / A.width) | 0; box = [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)]; }
          }
          return { pixels: A.width * A.height, any, over2, over8, worst, box: over8 ? box : null };
        })()`);
        if (result.sizes) {
          console.log(name.padEnd(8), `different sizes: ${result.sizes.join(' ')}`);
          continue;
        }
        const share = (count) => `${count} (${((count / result.pixels) * 100).toFixed(2)}%)`;
        console.log(
          name.padEnd(8),
          `differ at all ${share(result.any)}`.padEnd(32),
          `over 2 ${share(result.over2)}`.padEnd(24),
          `over 8 ${share(result.over8)}`.padEnd(22),
          `worst ${result.worst}`.padEnd(10),
          result.box ? `box ${result.box.join(',')}` : '',
        );
      }
    }),
  );
}

await (against ? compare() : take());
