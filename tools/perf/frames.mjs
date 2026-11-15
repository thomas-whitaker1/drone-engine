// How steadily the board draws, with the main thread slowed.
//
//   node tools/perf/frames.mjs [scene,scene…] [--throttle=6] [--dpr=1.5] [--seconds=8] [--label=name]
//
// One fresh browser per scene. Scenes are lib.mjs's, plus two that are a hand
// at work while the clock runs: `dragging` (a knob worked up and down) and
// `smash` (the hammer, on a loop). Leave the list out for all of them.
//
// What comes out, per scene: frames a second, the gaps between them, how many
// tasks ran long and the longest, the main thread's time by kind, and whether
// the audio context reported an underrun. The same goes to out/frames/ as JSON.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { boardIn, browsed, flag, outDir, sample, SCENES, served, sleep, words } from './lib.mjs';

const throttle = Number(flag('throttle', 6));
const dpr = Number(flag('dpr', 1.5));
const seconds = Number(flag('seconds', 8));
const label = String(flag('label', 'run'));

/** Things done *while* measuring, each starting from a woken board. */
const HANDS = {
  dragging: async (page, ms) => {
    const at = await page.rect('[data-control="guitar.char"]');
    await page.mouse('mouseMoved', at.x, at.y, { buttons: 0 });
    await page.mouse('mousePressed', at.x, at.y);
    const began = Date.now();
    while (Date.now() - began < ms) {
      await page.mouse('mouseMoved', at.x, at.y + Math.sin(((Date.now() - began) / 700) * Math.PI) * 70);
      await sleep(8);
    }
    await page.mouse('mouseReleased', at.x, at.y);
  },
  smash: async (page, ms) => {
    const began = Date.now();
    while (Date.now() - began < ms) {
      await page.click('[data-part="smash"]');
      await sleep(1300);
    }
  },
};

const wanted = (words()[0] ?? [...Object.keys(SCENES), ...Object.keys(HANDS)].join(',')).split(',');

/** What the context says about itself, or null before there is one. */
const AUDIO = `(() => {
  const engine = window.bench.engine;
  if (!engine) return null;
  const stats = engine.context.playbackStats;
  return { voices: engine.active, underruns: stats ? stats.underrunEvents : null, underrunMs: stats ? stats.underrunDuration * 1000 : null,
    bufferMs: engine.context.baseLatency * 1000, outputMs: engine.context.outputLatency * 1000 };
})()`;

const results = {};
await served(async (server) => {
  for (const name of wanted) {
    const hand = HANDS[name];
    await browsed(async (browser) => {
      // Set up at full speed, measured slowed: the drags that build a scene
      // are not what is being timed.
      const page = await boardIn(browser, server.origin, hand ? 'open' : name, { dpr });
      await page.send('Emulation.setCPUThrottlingRate', { rate: throttle });
      await sleep(1500);
      const before = await page.evaluate(AUDIO);
      const frames = await sample(page, seconds * 1000, hand ? () => hand(page, seconds * 1000) : undefined);
      const after = await page.evaluate(AUDIO);
      const audio =
        before && after
          ? {
              voices: after.voices,
              underruns: after.underruns === null ? 'n/a' : after.underruns - before.underruns,
              bufferMs: Number(after.bufferMs.toFixed(1)),
              outputMs: Number(after.outputMs.toFixed(1)),
            }
          : null;
      results[name] = { frames, audio };
      console.log(
        name.padEnd(9),
        `${frames.fps.toFixed(1)} fps`.padStart(9),
        `gaps p95 ${frames.gapMs.p95} max ${frames.gapMs.max}ms`.padEnd(28),
        `long tasks ${frames.longTasks} (longest ${frames.longestTaskMs}ms)`.padEnd(32),
        `main ${frames.mainMsPerSec.task} ms/s (style ${frames.mainMsPerSec.style}, script ${frames.mainMsPerSec.script}, layout ${frames.mainMsPerSec.layout})`,
        audio ? `| underruns ${audio.underruns}, ${audio.voices} voices` : '',
      );
    });
  }
});

const file = path.join(outDir('frames'), `${label}-x${throttle}.json`);
writeFileSync(file, JSON.stringify({ label, throttle, dpr, seconds, results }, null, 1));
console.log(`\nwrote ${file}`);
