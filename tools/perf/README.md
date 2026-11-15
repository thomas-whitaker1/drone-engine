# Measuring the board

Scripts that run the real product in a real browser and time it. They were written for the performance pass of November 2026 and found everything that pass fixed; they are kept so the next one starts from numbers rather than guesses.

Nothing is installed for them. Like `tests/support/real-browser.ts`, they serve the repo with the project's own Vite, start a headless Chrome that is already on the machine with a throwaway profile, and drive it over the DevTools protocol with Node's built-in WebSocket. `CHROME_PATH` points them at a browser if they do not find one.

They are not part of `npm test`. A suite that fails when the machine is busy is a suite people stop reading; these are instruments, and a person reads the dial.

## What each one answers

| Script | Question | Run |
|---|---|---|
| `frames.mjs` | Does it hold its frame rate on a slow machine? | `node tools/perf/frames.mjs` |
| `threads.mjs` | Which thread is doing the work, and on what? | `node tools/perf/threads.mjs drift --top=20 --on=CrGpuMain` |
| `layers.mjs` | Which compositor layers exist, why, and which repaint? | `node tools/perf/layers.mjs open` |
| `paints.mjs` | Which *elements* are repainting on a board nobody is touching? | `node tools/perf/paints.mjs open` |
| `audio.mjs` | What does the engine cost, and which kind of node is it? | `node tools/perf/audio.mjs open` (add `--live` for the realtime thread) |
| `convolver.mjs` | What is a reverb worth, by length, channels and sample rate? | `node tools/perf/convolver.mjs` |
| `pictures.mjs` | Did a change move a pixel? | see below |
| `null-test.mjs` | Did a change move a sample? | see below |

Each script's header says what its switches are. `lib.mjs` holds what they share, including the **scenes** — `cold`, `open`, `drift`, `apart`, `frenzy`, `worst` — which are the states worth measuring and are described where they are defined.

What they write goes in `tools/perf/out/`, which git ignores.

## Before and after

`pictures.mjs` and `null-test.mjs` compare this tree with another one. The other one is an export of whatever commit the change started from, in any folder outside the repo:

```sh
mkdir ../drone-engine-before
git archive <commit> | tar -x -C ../drone-engine-before
```

It needs no `node_modules`: it is served by this tree's Vite. Then:

```sh
node tools/perf/pictures.mjs before --tree=../drone-engine-before
node tools/perf/pictures.mjs after
node tools/perf/pictures.mjs before --against=after

node tools/perf/null-test.mjs ../drone-engine-before
```

Do not make the other tree with `git stash` or `git checkout`. An export touches nothing in the working tree; those do.

## What the numbers do and do not mean

- **A tablet is approximated, not emulated.** `--throttle` slows the page's main thread and nothing else. The GPU is still this machine's, and so is the audio thread. A frame rate from `frames.mjs` says the *main thread* would keep up on a CPU that much slower; it says nothing about a tablet's graphics. GPU and audio figures are this machine's, and reading them for a tablet is multiplication by three to six.
- **Headless is not a window.** It draws at sixty with no display behind it. It does use the real GPU.
- **`frames.mjs` counts frames with a loop of its own,** so the main thread never reads as idle while it runs. `threads.mjs` does not, and is the one to believe about a board at rest: the cold board should cost nothing at all there.
- **Thread totals are `RunTask` only.** An early version of this harness added a nested event to it and reported every thread at twice its real cost. A figure quoted from it during that pass had the GPU main thread on a woken board at 1068ms of work a second falling to 182; the true figures are 534 and about 95. The ratio, the frame rates and every raster figure from the pass are right.
- **Two renders of one graph are not always the same bits** in Chrome, so `null-test.mjs` prints the other tree against itself first. That is the floor.
- **One browser per measurement.** A second page in the same browser is a background page and measures slow; an audio variant measured that way looked half again as expensive as it was.

## Things this found that are worth not finding twice

All of these are written up where the fix is, and repeated here because they are properties of the browser rather than of any one file.

- **A custom property written on an element repaints every `var()` background on that element.** The variable does not have to be the one the background reads. (`--shake` on the film grain: the whole window, fifteen times a second.)
- **A custom property written on an ancestor restyles everything beneath it** and repaints every texture read through a variable down there. Write a variable on the parts that read it. (`--grit`, `--weather`, `--smash`, `--travel`.)
- **An SVG background is not kept as an image.** Every repainted tile replays it as vector paths and runs its filters again. (`src/bake.ts`.)
- **Fewer compositor layers is not automatically cheaper.** This board's hundred are what let a flash or a flare be one texture's opacity. Collapsing them was tried, and made every one of those a repaint of textured plate. (The note on the guard cover in `src/ui/board.ts`.)
- **Assigning a `WaveShaperNode` its curve takes the lock its render takes,** and a render that loses the race outputs silence for a block. Assign it when it changes.
- **A `ConvolverNode` levels its impulse by mean power,** so trimming a silent tail off one turns it down. (`heardGain` in `src/engine/deterministic.ts`.)
- **`window.app` on the product's own page is the `<div id="app">`** until the script replaces it, so waiting for it waits for nothing. The bench page uses `window.bench`, and waits for a field of it.
