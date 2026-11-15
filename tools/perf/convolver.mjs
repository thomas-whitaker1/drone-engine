// What a ConvolverNode costs in this browser, by how long its impulse is.
//
//   node tools/perf/convolver.mjs
//
// None of the project is in it: noise into one convolver into the output,
// rendered offline, with the impulse CAVERN's own shape (`pow(1 - t, 4.2)`).
// It exists because the two rooms are most of what the audio thread does (gt#119)
// and any idea for making them cheaper is an idea about one of these three
// numbers — length, channels, sample rate — and this is what each is worth.
//
// When it was written (Chrome 157): cost runs faster than length, because the
// long ones fall out of cache; a mono impulse is not half a stereo one but well
// under; and cost goes with the *square* of the sample rate.

import { browsed, openPage, served } from './lib.mjs';

const PAGE = `(async () => {
  const run = async (rate, irSeconds, irChannels, inChannels, seconds = 20) => {
    const ctx = new OfflineAudioContext(2, rate * seconds, rate);
    const noise = ctx.createBuffer(inChannels, rate * 2, rate);
    for (let c = 0; c < inChannels; c++) { const d = noise.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    source.start();
    let last = source;
    if (irSeconds > 0) {
      const impulse = ctx.createBuffer(irChannels, Math.floor(rate * irSeconds), rate);
      for (let c = 0; c < irChannels; c++) { const d = impulse.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4.2); }
      const convolver = ctx.createConvolver();
      convolver.buffer = impulse;
      source.connect(convolver);
      last = convolver;
    }
    last.connect(ctx.destination);
    const t0 = performance.now();
    await ctx.startRendering();
    return (performance.now() - t0) / (seconds * 10);
  };
  const best = async (...args) => Math.min(await run(...args), await run(...args), await run(...args));
  await run(48000, 1, 2, 1, 2);
  const out = [['no convolver at all', await best(48000, 0, 2, 1)]];
  for (const s of [0.25, 0.68, 1.2, 2.4, 4.25, 6, 7.5, 8.5, 11]) out.push(['48k stereo ' + s + 's', await best(48000, s, 2, 1)]);
  out.push(['48k mono 8.5s', await best(48000, 8.5, 1, 1)]);
  out.push(['48k stereo 8.5s, stereo in', await best(48000, 8.5, 2, 2)]);
  out.push(['44.1k stereo 8.5s', await best(44100, 8.5, 2, 1)]);
  out.push(['32k stereo 8.5s', await best(32000, 8.5, 2, 1)]);
  out.push(['24k stereo 8.5s', await best(24000, 8.5, 2, 1)]);
  return out;
})()`;

await served((server) =>
  browsed(async (browser) => {
    const page = await openPage(browser, `${server.origin}/__blank`);
    await page.until('document.readyState === "complete"');
    for (const [name, load] of await page.evaluate(PAGE)) console.log(name.padEnd(30), `${load.toFixed(2)}% of a core`);
  }),
);
