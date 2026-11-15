// @vitest-environment happy-dom
//
// The seam. The wake screen's own suite proves the lever moves and the callbacks
// fire on time; this proves what those callbacks are wired to — that one click
// leaves an engine standing whose thirteen pieces are set to exactly the state
// the board is drawn at.
//
// That last equality is the point, and it is the promise the issue makes: "it
// must sound like something the instant it opens." A board drawn at one state and
// an engine started at another is the specific failure that would be invisible on
// screen and obvious in the speakers, so every value is compared against
// OPENING_STATE rather than restated here.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, syncEngine } from '../src/app';
import type { AppHandle, AppSpec } from '../src/app';
import { SUMMON } from '../src/summon';
import { STILL_VALUE, STILL_VAR } from '../src/stillness';
import { APART_VALUE, APART_VAR } from '../src/apart';
import { WEATHER, WEATHER_VAR, weatherAt } from '../src/weathering';
import type { WeatherStore } from '../src/weathering';
import { createEngine } from '../src/engine';
import { heardLength } from '../src/engine/deterministic';
import type { EngineControls } from '../src/engine';
import {
  CAVERN,
  DEFAULT_BPM,
  MODIFIER_IDS,
  SMOOTH_RETUNE,
  SOURCE_IDS,
  TEMPOS,
  WARM,
  type ModifierId,
  type SourceId,
} from '../src/engine/constants';
import {
  apartAmount,
  ATMOSPHERE_VARS,
  FIGURE_VARS,
  depthAt,
  GLOBAL_SCOPE,
  hueFor,
  MODE_WORDS,
  OFTEN_WORDS,
  PACE_WORDS,
  OPENING_STATE,
  OPENING_WIRES,
  SHAKE_STILL,
  TUNE_WORDS,
  washAt,
  wearOpacity,
} from '../src/ui';
import { BOARD, BOOT, DRAG, KNOB_SWEEP, RUPTURE, SMASH, WAKE, WHEEL } from '../src/ui/constants';
import { DRIFT } from '../src/drift';
import { ink, signals, surfaces } from '../src/tokens';
import {
  asAudioContext,
  FakeAnalyserNode,
  FakeAudioContext,
  FakeAudioNode,
  FakeParam,
  retireVoices,
  type FakeConvolverNode,
} from './support/fake-audio-context';

const live: AppHandle[] = [];
let realElementFromPoint: typeof document.elementFromPoint;

/**
 * A mounted app on a fake context. The sample rate is deliberately low for the
 * same reason tests/support/board.ts keeps it low: CAVERN generates an 8.5s
 * stereo impulse, and nothing asserted here is rate-dependent.
 */
function build(
  persisted: Pick<
    AppSpec,
    | 'weatherMinutes'
    | 'weatherStore'
    | 'stillStore'
    | 'apartStore'
    | 'prefersReducedMotion'
  > = {},
): { app: AppHandle; mount: HTMLElement; ctx: FakeAudioContext } {
  const mount = document.createElement('div');
  document.body.appendChild(mount);
  const ctx = new FakeAudioContext(8000);
  ctx.currentTime = 5;
  // No store unless a case asks for one: two things in the product outlive a
  // page — grime and the STILLNESS choice (gt#33) — and a real localStorage would
  // carry either between cases. Reduced motion is stated for the same reason:
  // the default is the *system's* answer, and a suite that let the machine
  // running it decide would pass or fail by whose laptop it was on.
  const app = createApp({
    mount,
    context: asAudioContext(ctx),
    weatherStore: null,
    stillStore: null,
    apartStore: null,
    prefersReducedMotion: false,
    ...persisted,
  });
  live.push(app);
  return { app, mount, ctx };
}

/** A store that is just a string, so a case can read the blob back verbatim. */
interface FakeStore extends WeatherStore {
  held: string | null;
}

function fakeStore(seed: string | null = null): FakeStore {
  const store: FakeStore = {
    held: seed,
    getItem: () => store.held,
    setItem: (_key, value) => {
      store.held = value;
    },
  };
  return store;
}

/** One control on the board, by its `scope.param` key. Throws if it is not there. */
function control(app: AppHandle, key: string): HTMLElement {
  const element = app.board.element.querySelector<HTMLElement>(`[data-control="${key}"]`);
  if (!element) throw new Error(`No ${key} on this board.`);
  return element;
}

/**
 * Press a control without moving it — the moment the no-dead-controls rule is
 * about, before any value exists to apply.
 */
function press(element: HTMLElement): void {
  element.dispatchEvent(
    new PointerEvent('pointerdown', { button: 0, bubbles: true, cancelable: true, clientY: 300 }),
  );
}

/** Let go of a press that never moved. */
function lift(): void {
  window.dispatchEvent(new PointerEvent('pointerup', { clientY: 300 }));
}

/** Press, drag `pixels` (up is more), release. One complete gesture. */
function drag(element: HTMLElement, pixels: number): void {
  press(element);
  window.dispatchEvent(new PointerEvent('pointermove', { clientY: 300 - pixels }));
  window.dispatchEvent(new PointerEvent('pointerup', { clientY: 300 - pixels }));
}

/** Pull the lever and run the clock to the end of the sequence. */
/**
 * One of the room's layers, by the part name it carries — never by its index in
 * the array, which is only the order they happen to be mounted in and moves the
 * moment a layer is added between two others. Three assertions in this file used
 * to index it, and all three broke when the sigil layer landed between the wash
 * and the grain (gt#36) — none of them because anything they were checking had
 * changed.
 */
const roomLayer = (app: AppHandle, part: string): HTMLElement | undefined =>
  app.atmosphere.layers.find((element) => element.dataset.part === part);

/** How long after the overlay has gone the last module has come up (gt#88). */
const BOOTED_MS = BOOT.afterDoneMs + BOOT.spanMs;

/**
 * Pull the lever and run the clock until the board is simply on: the overlay
 * gone, and every module that opens on has come up (gt#88). A case about the
 * sequence itself pulls the lever by hand instead.
 */
function wake(app: AppHandle): void {
  app.wake.pull();
  vi.advanceTimersByTime(WAKE.doneMs + BOOTED_MS);
}

beforeEach(() => {
  vi.useFakeTimers();
  realElementFromPoint = document.elementFromPoint;
});

afterEach(() => {
  for (const app of live.splice(0)) app.destroy();
  document.elementFromPoint = realElementFromPoint;
  document.body.innerHTML = '';
  // The board writes `--fit` here and the atmosphere writes its five, so the
  // page itself is state that has to be cleared between suites.
  document.body.removeAttribute('style');
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('the app', () => {
  it('mounts the board under the overlay', () => {
    const { app, mount } = build();

    expect(app.board.element.parentNode).toBe(mount);
    expect(app.wake.element.parentNode).toBe(mount);
    expect(app.board.modules.size).toBe(SOURCE_IDS.length);
    expect(app.board.modifiers.size).toBe(MODIFIER_IDS.length);
  });

  it('makes no sound at all until the lever is pulled', () => {
    const { app } = build();

    vi.advanceTimersByTime(WAKE.doneMs * 2);

    expect(app.engine).toBeNull();
    expect(app.wake.pulled).toBe(false);
  });

  it('leaves a started engine carrying all thirteen pieces of hardware', () => {
    const { app } = build();

    wake(app);

    const engine = app.engine;
    expect(engine).not.toBeNull();
    expect(engine?.started).toBe(true);
    expect(Object.keys(engine?.sources ?? {}).sort()).toEqual([...SOURCE_IDS].sort());
    expect(Object.keys(engine?.modifiers ?? {}).sort()).toEqual([...MODIFIER_IDS].sort());
  });

  it('starts every source at exactly the value the board is drawn at', () => {
    const { app } = build();

    wake(app);

    for (const id of SOURCE_IDS) {
      const outlet = app.engine?.sources[id];
      const drawn = OPENING_STATE.m[id];
      expect(outlet?.on, id).toBe(drawn.on);
      expect(outlet?.loudV, id).toBe(drawn.loud);
      expect(outlet?.charV, id).toBe(drawn.char);
      expect(outlet?.often, id).toBe(drawn.often);
    }
  });

  it('starts every box and all three globals at the board’s values', () => {
    const { app } = build();

    wake(app);

    for (const id of MODIFIER_IDS) {
      expect(app.engine?.modifiers[id]?.amount, id).toBe(OPENING_STATE.mods[id].amount);
    }
    // The two the graph is tuned against, quoted whole so a third field appearing
    // in either object still has to be accounted for here.
    const { pace, ...tuned } = OPENING_STATE.g;
    expect(app.engine?.globals).toEqual(tuned);
    // And the third, which lands on the heartbeat instead (gt#45). The engine does
    // not hold a PACE step at all — it holds the tempo that step means.
    expect(app.engine?.bpm).toBe(TEMPOS[pace]);
    expect(app.engine?.bpm).toBe(DEFAULT_BPM);
  });

  it('opens on the default patch', () => {
    const { app } = build();

    wake(app);

    expect(app.engine?.wires).toEqual([...OPENING_WIRES]);
    // WOBBLE is deliberately left out of it, so there is something to try.
    expect(app.engine?.wires.some((wire) => wire.to === 'wobble')).toBe(false);
  });

  it('hangs the wire layer on the plate, drawing that patch', () => {
    const { app } = build();

    // The plate is the positioning parent and carries the zoom the layer divides
    // its endpoints back out of, so the layer belongs inside it, not beside it.
    expect(app.wireLayer.element.parentNode).toBe(app.board.element);
    expect(app.wires).toEqual([...OPENING_WIRES]);
  });

  it('lets the board show its tints only once the overlay has gone', () => {
    const { app } = build();
    /** This module's ambient tint opacity, as a number. */
    const tint = (id: SourceId): number =>
      Number(
        app.board.modules.get(id)?.element.querySelector<HTMLElement>('[data-part="glow"]')?.style
          .opacity,
      );
    const on = SOURCE_IDS.filter((id) => OPENING_STATE.m[id].on);
    const off = SOURCE_IDS.filter((id) => !OPENING_STATE.m[id].on);

    app.wake.pull();
    vi.advanceTimersByTime(WAKE.doneMs - 1);
    // Nothing is tinted: the glows arrive with the sound, so a board seen
    // through the fading overlay is not yet coloured by it.
    expect(on.length).toBeGreaterThan(0);
    for (const id of SOURCE_IDS) expect(tint(id), id).toBe(0);

    vi.advanceTimersByTime(1);
    expect(app.wake.element.parentNode).toBeNull();
    // The overlay is gone, and what has come up so far (gt#88) is tinted…
    expect(on.filter((id) => tint(id) > 0).length).toBeGreaterThan(0);
    for (const id of off) expect(tint(id), id).toBe(0);

    // …and once the board has finished coming up, everything that is on is.
    vi.advanceTimersByTime(BOOTED_MS);
    for (const id of on) expect(tint(id), id).toBeGreaterThan(0);
    for (const id of off) expect(tint(id), id).toBe(0);
  });

  it('keeps the board woken once it is, whatever is touched next', () => {
    const { app } = build();
    /** This module's ambient tint, which only an on *and* woken module shows. */
    const tint = (id: SourceId): number =>
      Number(
        app.board.modules.get(id)?.element.querySelector<HTMLElement>('[data-part="glow"]')?.style
          .opacity,
      );
    wake(app);
    expect(tint('guitar')).toBeGreaterThan(0);

    // The seam holds its own copy of the board state and redraws the plate from
    // it on every gesture. If that copy never learns the lever was pulled, the
    // first thing the user touches takes every tint on the board out with it.
    drag(control(app, 'guitar.loud'), 20);

    expect(tint('guitar')).toBeGreaterThan(0);
  });

  it('warms the engine once the overlay is gone, and not before', () => {
    const { app, ctx } = build();
    /**
     * CAVERN's long room — the second convolver the board builds, and the whole
     * of what the warm-up is for (gt#21).
     */
    const cave = (): unknown =>
      (ctx.created.filter((node) => node.kind === 'convolver')[1] as FakeConvolverNode | undefined)
        ?.buffer ?? null;

    app.wake.pull();
    vi.advanceTimersByTime(WAKE.doneMs - 1);
    // The board is up and audible, and the impulse has still not been generated:
    // the fade is the one stretch of this page that must not be interrupted.
    expect(app.engine?.started).toBe(true);
    expect(cave()).toBeNull();

    vi.advanceTimersByTime(1);

    // The overlay is off the page, so there is room for it now. But not in
    // this task (gt#30): this is the one that tints the whole woken board, and
    // the room is written in short stretches after it rather than on top of it.
    expect(app.wake.element.parentNode).toBeNull();
    expect(cave()).toBeNull();

    const stretches =
      2 * Math.ceil(heardLength(Math.floor(CAVERN.cave.seconds * ctx.sampleRate), CAVERN.cave.decay) / WARM.slice);
    vi.advanceTimersByTime(WARM.gapMs * (stretches - 1));
    expect(cave()).toBeNull();
    vi.advanceTimersByTime(WARM.gapMs);
    expect(cave()).not.toBeNull();
  });

  it('lets go of a warm-up still under way when it is torn down', () => {
    const { app, ctx } = build();
    const cave = (): unknown =>
      (ctx.created.filter((node) => node.kind === 'convolver')[1] as FakeConvolverNode | undefined)
        ?.buffer ?? null;

    app.wake.pull();
    // The overlay has gone and the first stretch of the room has been written.
    vi.advanceTimersByTime(WAKE.doneMs + WARM.gapMs);
    app.destroy();
    vi.advanceTimersByTime(WARM.gapMs * 100);

    expect(cave()).toBeNull();
  });

  it('tears down its timers, its engine and its DOM together', () => {
    const { app, mount } = build();

    app.wake.pull();
    app.destroy();
    vi.advanceTimersByTime(WAKE.doneMs);

    expect(mount.childNodes).toHaveLength(0);
    // The pulse is what a destroyed board must let go of; the graph may stay up.
    expect(app.engine?.heartbeat.running ?? false).toBe(false);
  });
});

// The atmosphere's own suite proves the five variables carry the handoff's
// arithmetic; this proves the seam they hang on — that the loop is fed by the
// engine the lever built, that the two set-on-change variables are moved by the
// two controls that own them, and that nothing at all is written before the
// lever or after the teardown.
describe('the room', () => {
  /**
   * One of the five, read wherever the atmosphere writes it (gt#21): each on a
   * layer that reads it, and none on the page. `--grit` has three readers and is
   * on all three; the grain is asked for it here. The seam does not choose any
   * of that — this helper follows it so the assertions below can stay about the
   * seam.
   */
  const room = (app: AppHandle, name: string): string => {
    // Each variable is written on a layer that reads it (gt#21), so asking the
    // wrong one is the same as asking a layer that was never told.
    const owner =
      name === '--grit'
        ? 'film'
        : name === '--vig'
          ? 'vignette'
          : FIGURE_VARS.some((own) => own === name)
            ? 'sigil'
            : 'wash';
    return roomLayer(app, owner)?.style.getPropertyValue(name) ?? '';
  };

  /** The low tap's analyser: the second one the master chain builds. */
  function lowAnalyser(ctx: FakeAudioContext): FakeAnalyserNode {
    const found = ctx.created.filter(
      (node: FakeAudioNode): node is FakeAnalyserNode => node instanceof FakeAnalyserNode,
    );
    const low = found[1];
    if (!low) throw new Error('The master chain has no low tap.');
    return low;
  }

  it('is set to the opening state before anything is running', () => {
    const { app } = build();

    // The board is drawn at the state it will be heard at, and so is the room
    // around it: the first frame anyone sees is already the right one.
    expect(room(app, '--hue')).toBe(hueFor(OPENING_STATE.g.tuning));
    expect(room(app, '--grit')).toBe(OPENING_STATE.mods.grit.amount.toFixed(3));
  });

  it('paints its ground on the shell, where the plate cannot cover it (gt#53)', () => {
    const { app, mount } = build();

    // The other half of gt#53. The wash moved over the plate and could not take
    // the room's dark base with it — screened over the board that base is a
    // milky fog, and it has to be *behind* everything to be a ground at all.
    // So the shell carries it, which is the one surface no plate can cover.
    expect(mount.style.backgroundImage).toBe(surfaces.pageDeep);
    // Fixed, because the layer it came off was `position:fixed`: a tall board
    // scrolls, and a room that scrolled with it would be a different room.
    expect(mount.style.backgroundAttachment).toBe('fixed');
    // What sticks out past the shell is clipped, never scrolled to (gt#116). The
    // hammer's jolt moves the plate a few pixels for a quarter of a second,
    // and a plate that fills the window and is then moved down is a page
    // taller than the window: the browser drew a scroll bar for those frames
    // and took it away again. `clip`, which does not make the shell a scroll
    // container. Nothing that hangs off the page is the shell's to clip: every
    // such layer is fixed.
    expect(mount.style.overflow).toBe('clip');
    for (const layer of [...mount.children] as HTMLElement[]) {
      if (layer === app.board.element) continue;
      if (layer.style.position === 'absolute') continue;
      expect(layer.style.position, layer.dataset.part).toBe('fixed');
    }
    // And the wash kept the light alone — nothing on it is a ground any more.
    expect(roomLayer(app, 'wash')?.style.backgroundImage).toBe(surfaces.backdrop);
    expect(surfaces.backdrop).not.toContain(surfaces.pageDeep);
  });

  it('breathes only once the lever has been pulled', () => {
    const { app } = build();

    vi.advanceTimersByTime(WAKE.doneMs * 2);
    // Nothing to read yet, so nothing is written — the CSS fallbacks are the
    // whole of the atmosphere until this moment.
    expect(room(app, '--breathe')).toBe('');

    wake(app);

    expect(room(app, '--breathe')).toBe(washAt(0).breathe);
    expect(room(app, '--vig')).toBe(washAt(0).vig);
  });

  it('carries a real low-band reading from the engine to the page', () => {
    const { app, ctx } = build();
    wake(app);
    const quiet = room(app, '--breathe');

    // The loudest thing the low tap can report, held long enough to arrive.
    lowAnalyser(ctx).timeDomain = new Uint8Array(2048).fill(255);
    vi.advanceTimersByTime(16 * 200);

    expect(Number(room(app, '--breathe'))).toBeGreaterThan(Number(quiet));
    // The vignette moves against it: the room opens out rather than dimming.
    expect(Number(room(app, '--vig'))).toBeLessThan(Number(washAt(0).vig));
  });

  it('recolours on TUNING and roughens on GRIT, on the gesture', () => {
    const { app } = build();
    wake(app);

    drag(control(app, 'g.tuning'), 150);
    expect(app.engine?.globals.tuning).toBe(TUNE_WORDS.length - 1);
    expect(room(app, '--hue')).toBe(hueFor(TUNE_WORDS.length - 1));

    drag(control(app, 'mods.grit'), 150);
    expect(room(app, '--grit')).toBe((1).toFixed(3));
  });

  it('keeps the frame loop off the page it would invalidate', () => {
    const { app, ctx } = build();
    wake(app);

    // A loud reading, so the three lerped variables are certainly moving.
    lowAnalyser(ctx).timeDomain = new Uint8Array(2048).fill(255);
    vi.advanceTimersByTime(16 * 60);

    // Whatever the room is writing, none of it reaches `<body>`, where every
    // node on the board would inherit it — `--grit` included, which lived there
    // until MEGADRIFT started moving it on every tick.
    for (const name of ['--breathe', '--brite', '--vig', '--hue', '--grit']) {
      expect(document.body.style.getPropertyValue(name), name).toBe('');
    }
    // It is on the three layers that read it, and a frame is not what moves it.
    for (const part of ['film', 'edgeWarm', 'edgeCold']) {
      expect(roomLayer(app, part)?.style.getPropertyValue('--grit'), part).toBe(
        OPENING_STATE.mods.grit.amount.toFixed(3),
      );
    }
  });

  it('goes dark with the board', () => {
    const { app } = build();
    wake(app);

    app.destroy();
    vi.advanceTimersByTime(16 * 20);

    // No layers, no variables, no frames — the loop cannot outlive the engine
    // it reads, because it is torn down with it.
    for (const element of app.atmosphere.layers) expect(element.parentNode).toBeNull();
    for (const name of ATMOSPHERE_VARS) {
      expect(document.body.style.getPropertyValue(name), name).toBe('');
    }
  });
});

// The figure is the room's to turn and the plate's to hold (gt#102). Each half has
// its own suite; what only the seam can show is that the one was put in the
// other.
describe('the emblem', () => {
  it('seats the room’s figure in the board’s emblem layer, on the seal', () => {
    const { app } = build();
    const figure = app.atmosphere.figure;
    const emblem = app.board.emblem;

    expect(figure.parentNode).toBe(emblem);
    expect(emblem.parentNode).toBe(app.board.element);
    // Still the room's: it is one of the layers the room takes down.
    expect(app.atmosphere.layers).toContain(figure);
    // And it is the only thing in that layer. The figure is the one part of
    // the symbology that is light; everything else is cut (gt#106).
    expect([...emblem.children]).toEqual([figure]);
    // And it is drawn before the lever is pulled, at the board's opening depth.
    expect(figure.querySelector('[data-part="trunk"]')).not.toBeNull();
    expect(figure.querySelector('[data-part="pool"]')).not.toBeNull();
  });

  it('flashes a source’s station on the seal when the engine says it struck', () => {
    const { app } = build();
    wake(app);
    const station = app.board.element.querySelector<HTMLElement>(
      '[data-part="station"][data-source="slowhit"]',
    );
    expect(station).not.toBeNull();
    // Let whatever the wake itself struck settle first.
    vi.advanceTimersByTime(2000);
    const resting = station?.style.opacity;
    expect(resting).toBe(String(BOARD.stations.on));

    app.engine?.announce('slowhit', 40);
    expect(station?.style.opacity).toBe(resting);
    vi.advanceTimersByTime(40);

    // Heard, so it is thrown bright — by how loud the module is set — and let go.
    expect(Number(station?.style.opacity)).toBeGreaterThan(Number(resting));
    expect(station?.style.transition).toBe('none');
    vi.advanceTimersByTime(1);
    expect(station?.style.opacity).toBe(resting);
  });

  it('lights the ring as the board comes up, a station with each module', () => {
    const { app } = build();
    const lit = (): number =>
      [...app.board.element.querySelectorAll<HTMLElement>('[data-part="station"]')].filter(
        (element) => element.style.opacity !== '0',
      ).length;
    // Cold before the lever: no lamp is lit, and no mark is either.
    expect(lit()).toBe(0);

    wake(app);
    vi.advanceTimersByTime(2000);
    expect(lit()).toBe(SOURCE_IDS.filter((id) => OPENING_STATE.m[id].on).length);
  });

  it('takes the figure down with the room', () => {
    const { app } = build();
    const figure = app.atmosphere.figure;
    app.destroy();
    expect(figure.parentNode).toBeNull();
  });
});

// The flash has its own suite; what belongs here is the one thing that suite
// cannot see — that the engine's only outward callback actually reaches it.
describe('the blooms', () => {
  /** Every bloom currently on the layer. */
  const flashes = (app: AppHandle): number =>
    app.bloomLayer.element.querySelectorAll('[data-part="bloom"]').length;

  it('lights on a strike the engine announces', () => {
    const { app } = build();
    // Waking pokes every strike module that opens on, so the board flashes on
    // the way up — which is itself the seam working, and why this counts from
    // wherever that left it rather than from nothing. Counted as the overlay
    // goes, while those are still in the air: the board is still coming up
    // (gt#88), and that is no business of the bloom layer's.
    app.wake.pull();
    vi.advanceTimersByTime(WAKE.doneMs);
    const lit = flashes(app);
    expect(lit).toBeGreaterThan(0);

    // The engine's own seam: a hit announced for the moment it is *heard*, which
    // is a lookahead after the moment it was booked.
    app.engine?.announce('slowhit', 40);
    expect(flashes(app)).toBe(lit);

    vi.advanceTimersByTime(40);

    expect(flashes(app)).toBe(lit + 1);
  });

  it('cannot flash onto a board that has gone', () => {
    const { app } = build();
    wake(app);

    // Booked, then torn down before it lands. The engine's timer still fires.
    app.engine?.announce('cow', 40);
    app.destroy();
    vi.advanceTimersByTime(40);

    expect(flashes(app)).toBe(0);
    expect(app.bloomLayer.element.parentNode).toBeNull();
  });
});

// STILLNESS (gt#33). The switch itself has its own suite; what belongs here is the
// thing only the seam can show — that one press reaches all three of the things
// that move, and reaches nothing else at all.
describe('STILLNESS', () => {
  /** The tape in the corner, pressed. */
  const press = (app: AppHandle): void => {
    app.board.element
      .querySelector<HTMLElement>('[data-part="still"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  };

  /** Every bloom currently on the layer. */
  const flashes = (app: AppHandle): number =>
    app.bloomLayer.element.querySelectorAll('[data-part="bloom"]').length;

  it('never changes what comes out of the speakers', () => {
    // The one claim in gt#33 that had to be stated rather than assumed: "stops the
    // board moving" naturally reads as though it should catch anything that
    // moves, and silently freezing someone's audio when they asked for a still
    // screen would be a genuinely confusing bug to track down.
    const { app } = build();
    wake(app);
    const engine = app.engine!;

    const before = {
      started: engine.started,
      on: SOURCE_IDS.map((id) => engine.sources[id]?.on),
      mods: MODIFIER_IDS.map((id) => engine.modifiers[id]?.amount),
      globals: { ...engine.globals },
      wires: app.wires.map((wire) => `${wire.from}->${wire.to}`),
    };

    press(app);
    vi.advanceTimersByTime(1000);

    expect(app.stillness.still).toBe(true);
    expect(engine.started).toBe(before.started);
    expect(SOURCE_IDS.map((id) => engine.sources[id]?.on)).toEqual(before.on);
    expect(MODIFIER_IDS.map((id) => engine.modifiers[id]?.amount)).toEqual(before.mods);
    expect(engine.globals).toEqual(before.globals);
    expect(app.wires.map((wire) => `${wire.from}->${wire.to}`)).toEqual(before.wires);
  });

  it('stops all three of the things that move, on one press', () => {
    const { app } = build();
    wake(app);
    // The room has been running, so it has written something to freeze.
    vi.advanceTimersByTime(200);

    press(app);

    // The tape sinks in, the flashes stop being drawn, and the room stops
    // reading. No one of the three could have decided this for the other two.
    const still = app.board.element.querySelector<HTMLElement>('[data-part="still"]');
    expect(still?.style.boxShadow).toBe(ink.buttonPressedShadow);
    expect(document.body.style.getPropertyValue(STILL_VAR)).toBe(STILL_VALUE.on);
    expect(roomLayer(app, 'film')?.style.animationPlayState).toBe('paused');

    app.engine?.announce('slowhit', 10);
    vi.advanceTimersByTime(10);
    expect(flashes(app)).toBe(0);
  });

  it('opens stilled when the system asks for reduced motion, before a frame runs', () => {
    const { app } = build({ prefersReducedMotion: true });

    // Not on the first frame and not on the lever: on the first paint. A board
    // that flashed once before settling down would be the whole point missed.
    expect(app.stillness.still).toBe(true);
    expect(document.body.style.getPropertyValue(STILL_VAR)).toBe(STILL_VALUE.on);

    wake(app);
    app.engine?.announce('slowhit', 10);
    vi.advanceTimersByTime(10);
    expect(flashes(app)).toBe(0);
  });

  it('lets a stored choice beat the system, and survives the reload', () => {
    const store = fakeStore();
    const first = build({ stillStore: store, prefersReducedMotion: false });
    press(first.app);
    expect(first.app.stillness.still).toBe(true);
    first.app.destroy();

    // A second page over the same store, whose system asks for nothing.
    const second = build({ stillStore: store, prefersReducedMotion: false });
    expect(second.app.stillness.still).toBe(true);

    // And the other way: motion explicitly turned back on outranks a system that
    // asks for it off, which is the half that is easy to get wrong.
    press(second.app);
    second.app.destroy();
    expect(build({ stillStore: store, prefersReducedMotion: true }).app.stillness.still).toBe(false);
  });

  it('is not touched by SCRUB THE ALTAR', () => {
    // The reason the choice keeps its own key rather than living in the wear
    // blob: "makes it look new again" must not reset a person's accessibility
    // setting.
    const store = fakeStore();
    const { app } = build({ stillStore: store, weatherStore: fakeStore() });
    wake(app);
    press(app);
    // Real grime, so that SCRUB has something to actually take away — otherwise
    // this passes on a board where it was never going to reach anything.
    drag(control(app, 'guitar.char'), 40);
    vi.advanceTimersByTime(WEATHER.tickMs);
    expect(app.weathering.wear).not.toEqual({});

    app.board.element
      .querySelector<HTMLElement>('[data-part="scrub"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(app.weathering.wear).toEqual({});
    expect(app.weathering.runtime).toBe(0);
    // The grime is gone and the choice is not.
    expect(app.stillness.still).toBe(true);
    expect(store.held).toBe(STILL_VALUE.on);
  });

  it('lets the board go again when it is pressed a second time', () => {
    const { app } = build();
    wake(app);
    press(app);
    press(app);

    expect(app.stillness.still).toBe(false);
    expect(document.body.style.getPropertyValue(STILL_VAR)).toBe(STILL_VALUE.off);

    app.engine?.announce('slowhit', 10);
    vi.advanceTimersByTime(10);
    expect(flashes(app)).toBeGreaterThan(0);
  });
});

// COME APART (gt#39). The shelf has its own suite and the arm has its own suite;
// what belongs here is the one thing neither of them can see — that the two
// switches **rank**, and that the ranking is a fact about the pair rather than an
// opinion either one holds. Plus the third repetition of the promise both other
// switches make: the engine is not told.
describe('COME APART', () => {
  /**
   * The big red button, pressed (gt#112). It is under a cover, so a press on a
   * board whose cover is down is two: one to lift it, one for the button.
   */
  const arm = (app: AppHandle): void => {
    const guard = app.board.element.querySelector<HTMLElement>('[data-part="apart"]');
    const button = guard?.querySelector<HTMLElement>('[data-part="button"]');
    if (guard?.dataset.lid !== 'up') {
      guard?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  };

  /** The STILLNESS tape, pressed. */
  const still = (app: AppHandle): void => {
    app.board.element
      .querySelector<HTMLElement>('[data-part="still"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  };

  /** Whether the plate is currently being split. The shelf's most visible tell. */
  const split = (app: AppHandle): boolean => app.board.element.style.filter !== '';

  it('is off on a board nobody has armed, so the first impression is the restrained one', () => {
    // gt#39's first rule, checked at the seam rather than taken on trust from the
    // module that implements it: the board opens as the board gt#16 built.
    const { app } = build();
    wake(app);
    expect(app.apart.armed).toBe(false);
    expect(split(app)).toBe(false);
    expect(document.body.style.getPropertyValue(APART_VAR)).toBe(APART_VALUE.off);
  });

  it('comes apart once armed, because the opening GRIT is already past the floor', () => {
    const { app } = build();
    wake(app);
    arm(app);

    expect(app.apart.armed).toBe(true);
    expect(split(app)).toBe(true);
    // Compared at the precision the variable is actually written to rather than
    // at full float: the page holds three decimals, and asserting more than the
    // product stores would be testing the assertion.
    expect(document.body.style.getPropertyValue('--apartAmount')).toBe(
      apartAmount(true, OPENING_STATE.mods.grit.amount).toFixed(RUPTURE.digits),
    );
  });

  it('never changes what comes out of the speakers', () => {
    // The same claim STILLNESS makes, and it has to be made again rather than
    // inherited: this is a different switch reaching different layers, and the
    // only thing keeping it true is that nothing on the path says `engine`.
    const { app } = build();
    wake(app);
    const engine = app.engine!;

    const before = {
      on: SOURCE_IDS.map((id) => engine.sources[id]?.on),
      mods: MODIFIER_IDS.map((id) => engine.modifiers[id]?.amount),
      globals: { ...engine.globals },
      wires: app.wires.map((wire) => `${wire.from}->${wire.to}`),
    };

    arm(app);
    vi.advanceTimersByTime(1000);

    expect(app.apart.armed).toBe(true);
    expect(SOURCE_IDS.map((id) => engine.sources[id]?.on)).toEqual(before.on);
    expect(MODIFIER_IDS.map((id) => engine.modifiers[id]?.amount)).toEqual(before.mods);
    expect(engine.globals).toEqual(before.globals);
    expect(app.wires.map((wire) => `${wire.from}->${wire.to}`)).toEqual(before.wires);
  });

  it('is outranked by STILLNESS, in both orders', () => {
    // The whole reason this switch is held at the seam. Neither module knows the
    // other exists, so if the ranking is wrong it is wrong *here* — and the two
    // orders are checked separately because "arm then still" and "still then arm"
    // are different code paths through `applyStill` and `applyApart`.
    const { app } = build();
    wake(app);

    arm(app);
    expect(split(app)).toBe(true);
    still(app);
    expect(split(app)).toBe(false);
    still(app);
    expect(split(app)).toBe(true);

    // …and the other way round: stilled first, armed underneath it.
    still(app);
    arm(app);
    arm(app);
    expect(app.apart.armed).toBe(true);
    expect(split(app)).toBe(false);
    // The arm was remembered, so releasing the other tape applies it.
    still(app);
    expect(split(app)).toBe(true);
  });

  it('tracks GRIT and MURK on the gesture, like every other thing that is seen', () => {
    const { app } = build();
    wake(app);
    arm(app);

    // GRIT down under the shelf's floor: the board goes back together, and the
    // film grain the same box has always driven is untouched by any of it.
    drag(control(app, 'mods.grit'), -400);
    expect(app.engine?.modifiers.grit?.amount).toBeCloseTo(0, 3);
    expect(split(app)).toBe(false);

    // MURK drives the melt, and only the melt.
    drag(control(app, 'mods.murk'), 400);
    expect(Number(document.body.style.getPropertyValue('--melt'))).toBe(0);
    drag(control(app, 'mods.grit'), 400);
    expect(Number(document.body.style.getPropertyValue('--melt'))).toBeGreaterThan(0);
  });

  it('is told about a whole board at once, when the hammer decides one', () => {
    const { app } = build();
    wake(app);
    arm(app);

    // Scripted, so "the shelf moved" is a fact rather than a coin toss: GRIT
    // lands at its ceiling and the opening state has it at .55.
    vi.spyOn(Math, 'random').mockReturnValue(1 - Number.EPSILON);
    const button = app.board.element.querySelector<HTMLElement>('[data-part="smash"]');
    // Asserted rather than reached through `?.`: a selector that stopped matching
    // would otherwise leave this whole case dispatching nothing and passing on the
    // opening state, which is exactly what it is here to rule out.
    expect(button).not.toBeNull();
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    vi.advanceTimersByTime(SMASH.swingMs);

    // Whatever the blow landed on, the shelf is showing that and not the last
    // hand-turned value. The engine's own GRIT is read back as the authority,
    // because `cast` pushes the same number to both and this is exactly the
    // place the two could silently part company.
    const grit = app.engine?.modifiers.grit?.amount ?? -1;
    expect(grit).toBeGreaterThanOrEqual(0);
    expect(grit).not.toBe(OPENING_STATE.mods.grit.amount);
    expect(Number(document.body.style.getPropertyValue('--apartAmount'))).toBeCloseTo(
      apartAmount(true, grit),
      3,
    );
  });

  it('tears a slice on the same strike the bloom answers, and neither blocks the other', () => {
    const { app } = build();
    wake(app);
    arm(app);

    app.engine?.announce('slowhit', 10);
    vi.advanceTimersByTime(10);

    expect(app.bloomLayer.element.querySelectorAll('[data-part="bloom"]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-part="slice"]').length).toBeGreaterThan(0);
  });

  it('survives the reload, and is not touched by SCRUB THE ALTAR', () => {
    const store = fakeStore();
    const first = build({ apartStore: store, weatherStore: fakeStore() });
    wake(first.app);
    arm(first.app);
    expect(store.held).toBe(APART_VALUE.on);
    first.app.destroy();

    const { app } = build({ apartStore: store, weatherStore: fakeStore() });
    expect(app.apart.armed).toBe(true);

    app.board.element
      .querySelector<HTMLElement>('[data-part="scrub"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(app.apart.armed).toBe(true);
    expect(store.held).toBe(APART_VALUE.on);
  });

  it('takes the filter back off the plate when the page goes down', () => {
    const { app } = build();
    wake(app);
    arm(app);
    expect(split(app)).toBe(true);

    const plate = app.board.element;
    app.destroy();
    live.length = 0;
    expect(plate.style.filter).toBe('');
  });
});

// The patch is the one piece of state the layer, the lamps and the engine all
// read and none of them owns, so what is worth asserting is that a cable moved
// on the board arrives at all three of them — not that any one of them works.
describe('the patch', () => {
  /** This box's lamp, which answers the patch and nothing else. */
  const lamp = (app: AppHandle, id: ModifierId): string | undefined =>
    app.board.modifiers.get(id)?.element.querySelector<HTMLElement>('[data-part="lamp"]')?.style
      .background;

  /** Release a cable dragged out of `from` over the real IN jack of `to`. */
  function patch(app: AppHandle, from: SourceId | ModifierId, to: ModifierId): void {
    const target = app.board.modifiers.get(to)?.jackIn ?? null;
    app.wireLayer.beginDrag(from, new PointerEvent('pointerdown', { button: 0, cancelable: true }));
    document.elementFromPoint = ((): Element | null => target) as typeof document.elementFromPoint;
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 0, clientY: 0 }));
  }

  /** Flip one source's power switch, as a hand would. */
  const power = (app: AppHandle, id: SourceId): void =>
    app.board.modules.get(id)?.element.querySelector<HTMLElement>('[data-part="power"]')?.click();

  // A lamp means sound is going through (gt#95), not that a cable is in.
  it('puts a box’s lamp out when the only thing feeding it is switched off', () => {
    const { app } = build();
    wake(app);
    const cables = JSON.stringify(app.wires);
    // MURK opens fed by BASS and by nothing else.
    expect(lamp(app, 'murk')).toBe(signals.lampOn);

    power(app, 'bass');
    expect(lamp(app, 'murk')).toBe(signals.lampOff);
    // The cable is still in. Nothing about the patch moved.
    expect(JSON.stringify(app.wires)).toBe(cables);

    power(app, 'bass');
    expect(lamp(app, 'murk')).toBe(signals.lampOn);
  });

  it('keeps a box lit for as long as anything live still reaches it, down the chain', () => {
    const { app } = build();
    // CAVERN opens fed twice over: by SLOW HIT, and by GUITAR WALL through GRIT.
    power(app, 'slowhit');
    expect(lamp(app, 'cavern')).toBe(signals.lampOn);

    power(app, 'guitar');
    expect(lamp(app, 'grit')).toBe(signals.lampOff);
    expect(lamp(app, 'cavern')).toBe(signals.lampOff);

    power(app, 'slowhit');
    expect(lamp(app, 'cavern')).toBe(signals.lampOn);
    expect(lamp(app, 'grit')).toBe(signals.lampOff);
  });

  it('runs no cable into a box that is plugged in and dark, either', () => {
    // The board patches nothing for anyone (gt#97) — not an empty box, and not
    // one whose only feeder has been switched off.
    const { app } = build();
    power(app, 'bass');
    const cables = app.wires.length;

    press(control(app, 'mods.murk'));
    lift();

    expect(app.wires.length).toBe(cables);
    expect(lamp(app, 'murk')).toBe(signals.lampOff);
  });

  it('lights the boxes it feeds, and only those', () => {
    const { app } = build();
    wake(app);

    for (const id of MODIFIER_IDS) {
      const fed = OPENING_WIRES.some((wire) => wire.to === id);
      expect(lamp(app, id), id).toBe(fed ? signals.lampOn : signals.lampOff);
    }
    // Three of the seven, so the assertion above is not passing vacuously.
    expect(MODIFIER_IDS.filter((id) => lamp(app, id) === signals.lampOn)).toHaveLength(3);
  });

  it('reaches the layer, the lamps and the engine when a cable is dropped', () => {
    const { app } = build();
    wake(app);

    patch(app, 'guitar', 'wobble');

    expect(app.wires).toEqual([...OPENING_WIRES, { from: 'guitar', to: 'wobble' }]);
    expect(app.engine?.wires).toEqual([...app.wires]);
    expect(lamp(app, 'wobble')).toBe(signals.lampOn);
  });

  it('puts a box’s lamp out again when its last cable is pulled', () => {
    const { app } = build();
    wake(app);

    // MURK is fed by exactly one wire in the opening patch — BASS's. happy-dom
    // lays nothing out, so that cable's two jacks are pinned somewhere of their
    // own and the layer is told to look: a cable is pulled by where it hangs
    // now (gt#72), and every unpinned one hangs in a heap at the plate's corner.
    const only = OPENING_WIRES.findIndex((wire) => wire.to === 'murk');
    expect(OPENING_WIRES[only]?.from).toBe('bass');
    const out = app.board.element.querySelector<HTMLElement>('[data-jack-out="bass"]')!;
    const into = app.board.element.querySelector<HTMLElement>('[data-jack-in="murk"]')!;
    out.getBoundingClientRect = () => new DOMRect(289, 289, 22, 22);
    into.getBoundingClientRect = () => new DOMRect(489, 289, 22, 22);
    app.wireLayer.measure();

    // Halfway along it: level with the jacks at x, and down by half the sag —
    // 34px, plus a tenth of the 200 between them.
    const at = { clientX: 400, clientY: 300 + (34 + 20) / 2 };
    const press = { bubbles: true, cancelable: true, button: 0, ...at };
    app.board.element.dispatchEvent(new PointerEvent('pointerdown', press));
    app.board.element.dispatchEvent(new PointerEvent('pointerup', press));

    expect(app.wires.some((wire) => wire.to === 'murk')).toBe(false);
    expect(app.engine?.wires.some((wire) => wire.to === 'murk')).toBe(false);
    expect(lamp(app, 'murk')).toBe(signals.lampOff);
    // CAVERN is fed by two, and is still lit after one of them goes.
    expect(lamp(app, 'cavern')).toBe(signals.lampOn);
  });

  it('holds a patch made before the lever was pulled, and hands it over', () => {
    const { app } = build();

    patch(app, 'guitar', 'wobble');
    wake(app);

    expect(app.engine?.wires).toEqual([...OPENING_WIRES, { from: 'guitar', to: 'wobble' }]);
  });
});

// The brief's first hard rule, and the one that has to hold for every control on
// the board rather than for a representative one: "the user must never turn
// something and hear nothing." Both halves of it are promises about a gesture,
// so both are asserted through the real components rather than through the seam's
// callbacks — a rule that only holds when the test calls the handler directly is
// not the rule the brief wrote down.
describe('no dead controls', () => {
  it('powers an off module on the moment a control is pressed', () => {
    const { app } = build();
    wake(app);
    expect(OPENING_STATE.m.voice.on).toBe(false);

    press(control(app, 'voice.char'));

    // Before the drag has produced any value at all: the press is the whole event.
    expect(app.engine?.sources.voice?.on).toBe(true);
    lift();
  });

  it('powers one on through the wheel as well, which never presses', () => {
    const { app } = build();
    wake(app);

    control(app, 'cow.char').dispatchEvent(
      new WheelEvent('wheel', { deltaY: -120, cancelable: true }),
    );

    expect(app.engine?.sources.cow?.on).toBe(true);
  });

  it('leaves the power toggle an explicit on and off', () => {
    const { app } = build();
    wake(app);
    const power = app.board.modules
      .get('guitar')
      ?.element.querySelector<HTMLElement>('[data-part="power"]');

    power?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Touching a control starts a module; only this can stop one.
    expect(app.engine?.sources.guitar?.on).toBe(false);
  });

  // What a box's control does when nothing is plugged into the box (gt#97). It
  // used to run a cable from GUITAR WALL and switch the wall on. Thomas's call:
  // turning an unplugged knob should not plug anything in.
  it('patches nothing when an unplugged box’s control is pressed or turned', () => {
    const { app } = build();
    wake(app);
    // WOBBLE is one of the boxes the opening patch deliberately leaves empty.
    expect(OPENING_WIRES.some((wire) => wire.to === 'wobble')).toBe(false);

    press(control(app, 'mods.wobble'));
    lift();
    expect(app.wires).toEqual([...OPENING_WIRES]);

    drag(control(app, 'mods.wobble'), 60);
    expect(app.wires).toEqual([...OPENING_WIRES]);
    expect(app.engine?.wires).toEqual([...OPENING_WIRES]);
  });

  it('still sets the box’s amount, and keeps it for when a cable goes in', () => {
    const { app } = build();
    wake(app);
    const before = app.engine?.modifiers.wobble?.amount ?? NaN;

    drag(control(app, 'mods.wobble'), 60);

    // The control is not dead and not refused: the value moved, on the board
    // and in the engine, and is waiting there.
    const after = app.engine?.modifiers.wobble?.amount ?? NaN;
    expect(after).toBeCloseTo(before + 60 / DRAG.fullRangePx, 6);
    // And the box is still dark, because it is still carrying nothing.
    expect(
      app.board.modifiers.get('wobble')?.element.querySelector<HTMLElement>('[data-part="lamp"]')?.style
        .background,
    ).toBe(signals.lampOff);
  });

  it('switches no source on behind a hand that only turned a box’s knob', () => {
    const { app } = build();
    wake(app);
    app.board.modules
      .get('guitar')
      ?.element.querySelector<HTMLElement>('[data-part="power"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(app.engine?.sources.guitar?.on).toBe(false);

    drag(control(app, 'mods.wobble'), 60);

    // Somebody switched the wall off. It stays off.
    expect(app.engine?.sources.guitar?.on).toBe(false);
  });

  it('leaves a box that is already fed patched exactly as it was', () => {
    const { app } = build();
    wake(app);

    drag(control(app, 'mods.grit'), -90);

    expect(app.wires).toEqual([...OPENING_WIRES]);
  });
});

// The second rule: "every control is audible within one second of being moved.
// No exceptions." What is decidable here is that the gesture reaches the graph
// and how fast the write it makes arrives; whether the result is *pleasant* is
// the ear-tuning pass's (gt#20).
describe('audible within a second', () => {
  /** One scheduled or smoothed write, against the audio clock. */
  interface Write {
    readonly at: number;
    /** The smoothing constant, or null for a write scheduled at a fixed time. */
    readonly constant: number | null;
  }

  /** How many writes each parameter in the graph carries, at one moment. */
  type Mark = Map<FakeParam, { ramps: number; automation: number }>;

  /** Every parameter the engine has built, in creation order. */
  function graphParams(ctx: FakeAudioContext): FakeParam[] {
    return ctx.created.flatMap((node: FakeAudioNode) =>
      Object.values(node).filter((value): value is FakeParam => value instanceof FakeParam),
    );
  }

  function mark(ctx: FakeAudioContext): Mark {
    return new Map(
      graphParams(ctx).map((param) => [
        param,
        { ramps: param.ramps.length, automation: param.automation.length },
      ]),
    );
  }

  /**
   * The writes made since `taken`. Parameters created after it are wholly new,
   * which is how a strike's envelope — nodes and all — counts as being heard.
   */
  function since(ctx: FakeAudioContext, taken: Mark): Write[] {
    const fresh: Write[] = [];
    for (const param of graphParams(ctx)) {
      const seen = taken.get(param) ?? { ramps: 0, automation: 0 };
      for (const ramp of param.ramps.slice(seen.ramps)) {
        fresh.push({ at: ramp.time, constant: ramp.constant });
      }
      for (const write of param.automation.slice(seen.automation)) {
        fresh.push({ at: write.time, constant: null });
      }
    }
    return fresh;
  }

  /** How many positions a control has, or 0 where it is continuous. */
  function stepsOf(key: string): number {
    const [scope, param] = key.split('.');
    if (param === 'often') return OFTEN_WORDS.length;
    if (param === 'tuning') return TUNE_WORDS.length;
    if (param === 'pace') return PACE_WORDS.length;
    if (scope === 'voice' && param === 'char') return MODE_WORDS.length;
    return 0;
  }

  /** What the engine currently holds for one control's `scope.param` key. */
  function reading(app: AppHandle, key: string): number {
    const [scope = '', param = ''] = key.split('.');
    const engine = app.engine;
    if (!engine) throw new Error('The engine has not been started.');
    // PACE holds its value on the heartbeat rather than among the globals (gt#45),
    // so it is read where it actually lands. That it answers at all is the whole
    // question here, and the tempo is as good an answer as a root is.
    if (scope === 'g' && param === 'pace') return engine.bpm;
    if (scope === 'g') return engine.globals[param as 'seriousness' | 'tuning'];
    if (scope === 'mods') return engine.modifiers[param]?.amount ?? NaN;
    const outlet = engine.sources[scope];
    if (!outlet) throw new Error(`No ${scope} on this board.`);
    if (param === 'loud') return outlet.loudV;
    if (param === 'char') return outlet.charV;
    return outlet.often;
  }

  /**
   * The one control on the board this check cannot ask its question of (gt#43).
   *
   * Everything else here sets a value the engine holds, so "no dead control"
   * can be read straight off the graph a second later. MEGADRIFT sets no value:
   * it decides how far *other* values are allowed to wander from where they were
   * put, and how much that is worth at any given instant depends on where
   * twenty-nine sine waves happen to be. Turn it at a moment when the curves are
   * near their zeroes and the honest answer is that nothing audible happens yet —
   * which would make this a flaky check rather than a wrong one.
   *
   * So it is excluded here and proved undead somewhere its own terms apply: see
   * "MEGADRIFT" below, which turns it up, runs the clock, and watches the board
   * leave the position it was set to and come back when the lever is shut.
   */
  const NOT_A_VALUE = `${GLOBAL_SCOPE}.megadrift`;

  /**
   * The one control that holds a value and still writes nothing to the graph
   * (gt#45), which is a different exclusion from the one above and is kept
   * separate for exactly that reason.
   *
   * MEGADRIFT is skipped because there is no value to read back. PACE has one,
   * and the half of this check that asks whether the control answered at all
   * still applies to it — what does not apply is the half that then goes looking
   * for the answer in an AudioParam. A tempo is not a parameter of anything; it
   * is how often the scheduler books, so it lands on the clock and no node on the
   * board is written to at all. Watching for a param write here would be
   * asserting that the heartbeat is the wrong shape.
   *
   * It is proved undead on its own terms in "the heartbeat" below, which turns
   * the control and watches the interval between two booked strikes change.
   */
  const NOT_A_PARAM = `${GLOBAL_SCOPE}.pace`;

  it('answers every single control on the board, from the cold opening state', () => {
    const { app, ctx } = build();
    wake(app);
    const painted = [...app.board.element.querySelectorAll<HTMLElement>('[data-control]')].map(
      (element) => element.dataset.control ?? '',
    );

    // Every module's controls, every box, every global — nothing sampled.
    expect(painted).toHaveLength(
      [...app.board.modules.values()].reduce((total, module) => total + module.controls.size, 0) +
        app.board.modifiers.size +
        app.board.globals.size,
    );
    // And each exclusion is one control, named, with its own reason, rather than
    // a filter that would quietly grow. If a third control ever stops holding a
    // value or stops writing one, that is a decision somebody should have to come
    // here and write down.
    expect(painted).toContain(NOT_A_VALUE);
    expect(painted).toContain(NOT_A_PARAM);
    const keys = painted.filter((key) => key !== NOT_A_VALUE);
    expect(keys).toHaveLength(painted.length - 1);

    for (const key of keys) {
      // A second of quiet and a clean voice count before each: the poke that
      // answers a strike is idle-gated, and nothing here retires a voice on its
      // own the way a browser does.
      ctx.currentTime += 2;
      retireVoices(ctx);

      const steps = stepsOf(key);
      const before = reading(app, key);
      const fraction = steps ? before / (steps - 1) : before;
      const taken = mark(ctx);

      // Away from whichever end the control is already sitting at, far enough to
      // clear a step. HOW OFTEN opens at *almost never* on the cow, so this is
      // not hypothetical.
      // A control drawn the other way up (gt#51) has its ends the other way
      // round too: on it, a drag upward lowers the value.
      const sense = control(app, key).dataset.inverted === undefined ? 1 : -1;
      drag(control(app, key), sense * (fraction > 0.5 ? -90 : 90));

      const heard = since(ctx, taken);
      expect(reading(app, key), `${key} moved`).not.toBe(before);
      // Every control has to answer; only this one answers somewhere other than
      // on a node. See NOT_A_PARAM — the assertion it skips is the one that would
      // be wrong about it, and the one above it just passed.
      if (key === NOT_A_PARAM) continue;
      expect(heard.length, `${key} reached the graph`).toBeGreaterThan(0);
      // The first write is what the ear gets; a strike's tail runs on past a
      // second and is supposed to.
      const first = Math.min(...heard.map((write) => write.at));
      expect(first - ctx.currentTime, `${key} arrived`).toBeLessThanOrEqual(1);
      for (const write of heard) {
        if (write.constant === null) continue;
        expect(write.constant, `${key} ramped`).toBeLessThanOrEqual(SMOOTH_RETUNE);
      }
    }
  });

  it('pokes a strike that is on but has gone quiet, on the press alone', () => {
    const { app, ctx } = build();
    wake(app);
    // SLOW HIT opens on and at *now and then*, so it can sit silent for beats.
    expect(OPENING_STATE.m.slowhit.on).toBe(true);
    ctx.currentTime += 5;
    retireVoices(ctx);
    const before = app.engine?.sources.slowhit?.lastHit ?? 0;

    press(control(app, 'slowhit.char'));

    expect(app.engine?.sources.slowhit?.lastHit).toBeGreaterThan(before);
    expect(app.engine?.sources.slowhit?.lastHit).toBeLessThanOrEqual(ctx.currentTime + 1);
    lift();
  });

  it('does not stutter a strike that was just heard', () => {
    const { app, ctx } = build();
    wake(app);
    ctx.currentTime += 5;
    retireVoices(ctx);

    press(control(app, 'slowhit.char'));
    lift();
    const hit = app.engine?.sources.slowhit?.lastHit;
    press(control(app, 'slowhit.loud'));
    lift();

    // Touching a second control a moment later is the same gesture to the ear.
    expect(app.engine?.sources.slowhit?.lastHit).toBe(hit);
  });
});

describe('the heartbeat', () => {
  it('turns the whole pulse from one word, and never through a number', () => {
    const { app } = build();
    wake(app);
    expect(app.engine?.bpm).toBe(TEMPOS[OPENING_STATE.g.pace]);

    // All the way up, which on a selector is the last word rather than a value.
    drag(control(app, `${GLOBAL_SCOPE}.pace`), 150);

    expect(app.engine?.bpm).toBe(TEMPOS[PACE_WORDS.length - 1]);
    // And the board says so in the word, which is the whole of what it shows.
    expect(
      control(app, `${GLOBAL_SCOPE}.pace`).querySelector<HTMLElement>('[data-part="word"]')
        ?.textContent,
    ).toBe(PACE_WORDS[PACE_WORDS.length - 1]);

    drag(control(app, `${GLOBAL_SCOPE}.pace`), -150);
    expect(app.engine?.bpm).toBe(TEMPOS[0]);
  });

  it('leaves the two globals it is not alone, and is left alone by them', () => {
    const { app } = build();
    wake(app);
    const globals = { ...(app.engine?.globals ?? {}) };

    drag(control(app, `${GLOBAL_SCOPE}.pace`), 150);

    // The tempo is not a value the graph is tuned against, so moving it retunes
    // nothing (gt#45). The `else` this branch replaced would have handed it to
    // SERIOUSNESS and moved the whole board's pitch and reverb tail with it.
    expect(app.engine?.globals).toEqual(globals);

    const bpm = app.engine?.bpm;
    drag(control(app, `${GLOBAL_SCOPE}.seriousness`), 60);
    drag(control(app, `${GLOBAL_SCOPE}.tuning`), 60);
    expect(app.engine?.bpm).toBe(bpm);
  });
});

describe('syncing a board state into an engine', () => {
  /** Every call `syncEngine` makes, as `name` or `name:id`, in order. */
  function record(): { calls: string[]; controls: EngineControls } {
    const calls: string[] = [];
    const log =
      (name: string) =>
      (id: string): void => {
        calls.push(`${name}:${id}`);
      };
    return {
      calls,
      controls: {
        touch: log('touch'),
        setLoud: log('loud'),
        setChar: log('char'),
        setOften: log('often'),
        setPower: log('power'),
        setMod: log('mod'),
        setGlobal: (key) => {
          calls.push(`global:${key}`);
        },
        setBpm: () => {
          calls.push('bpm');
        },
        setWires: () => {
          calls.push('wires');
        },
        levels: () => ({ master: 0, low: 0 }),
      },
    };
  }

  it('sets a source’s values before its power, so a poked strike lands right', () => {
    const { calls, controls } = record();

    syncEngine(controls, OPENING_STATE, OPENING_WIRES);

    // Per source, not merely overall: powering a strike fires an immediate hit,
    // and a hit fired first would be heard at the wrong loudness and character.
    for (const id of SOURCE_IDS) {
      const power = calls.indexOf(`power:${id}`);
      expect(power, id).toBeGreaterThan(-1);
      for (const name of ['loud', 'char', 'often']) {
        expect(calls.indexOf(`${name}:${id}`), `${name}:${id}`).toBeLessThan(power);
      }
    }
  });

  it('touches every source, every box, both globals and the patch, once each', () => {
    const { calls, controls } = record();

    syncEngine(controls, OPENING_STATE, OPENING_WIRES);

    for (const id of SOURCE_IDS) {
      for (const name of ['loud', 'char', 'often', 'power']) {
        expect(calls.filter((call) => call === `${name}:${id}`), `${name}:${id}`).toHaveLength(1);
      }
    }
    for (const id of MODIFIER_IDS) expect(calls).toContain(`mod:${id}`);
    expect(calls).toContain('global:seriousness');
    expect(calls).toContain('global:tuning');
    // The patch goes last: it is the one call that rebuilds the whole graph.
    expect(calls[calls.length - 1]).toBe('wires');
  });

  it('clears the patch when it is given no wires', () => {
    const ctx = new FakeAudioContext(8000);
    ctx.currentTime = 5;
    const engine = createEngine({ context: asAudioContext(ctx) });
    engine.start();
    engine.stop();

    engine.setWires(OPENING_WIRES);
    syncEngine(engine, OPENING_STATE);

    expect(engine.wires).toEqual([]);
  });
});

describe('the weathering', () => {
  /** The bone halo behind one control, by its wear key. */
  const halo = (app: AppHandle, key: string): string =>
    control(app, key).querySelector<HTMLElement>('[data-part="wear"]')?.style.opacity ?? '';

  /**
   * What `--weather` reads where the board writes it: on the parts that rust,
   * and here on the plate's own rust. Not on the page — a variable on the body
   * is inherited by every node there is, and this one moves every five seconds.
   */
  const weather = (app: AppHandle): string =>
    [...app.board.element.children]
      .find((child): child is HTMLElement => (child as HTMLElement).dataset.part === 'rust')
      ?.style.getPropertyValue(WEATHER_VAR) ?? '';
  /** The same variable on the page, which is never. */
  const onPage = (): string => document.body.style.getPropertyValue(WEATHER_VAR);

  /** The blob as it currently stands in the store. */
  const blob = (store: FakeStore): { wear: Record<string, number>; runtime: number } =>
    JSON.parse(store.held ?? '{"wear":{},"runtime":0}');

  /** SCRUB THE ALTAR, clicked. */
  const scrub = (app: AppHandle): void => {
    app.board.element
      .querySelector<HTMLElement>('[data-part="scrub"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  };

  it('wears the control a completed drag was on, and only that one', () => {
    const store = fakeStore();
    const { app } = build({ weatherStore: store });

    drag(control(app, 'guitar.char'), 40);

    expect(Number(halo(app, 'guitar.char'))).toBeCloseTo(wearOpacity(1));
    expect(halo(app, 'bass.char')).toBe('0');
    expect(blob(store).wear).toEqual({ 'guitar.char': 1 });
  });

  it('does not wear a press that never moved — that is waking a module', () => {
    const store = fakeStore();
    const { app } = build({ weatherStore: store });

    press(control(app, 'voice.char'));
    lift();

    // The press did its real job — the module is on — and left no mark.
    expect(app.board.modules.get('voice')).toBeDefined();
    expect(app.weathering.wear).toEqual({});
    expect(store.held).toBeNull();
  });

  it('opens at the grime the last session left, before anything has ticked', () => {
    const store = fakeStore(JSON.stringify({ wear: { 'guitar.char': 9 }, runtime: 9 * 60 }));
    const { app } = build({ weatherStore: store, weatherMinutes: 18 });

    // A returning board is drawn worn and rusted on its first paint. Watching
    // either one arrive would be the wrong thing entirely.
    expect(halo(app, 'guitar.char')).toBe(String(wearOpacity(9)));
    expect(weather(app)).toBe('0.500');
    expect(onPage()).toBe('');
    expect(app.engine).toBeNull();
  });

  it('carries one session’s grime into the next', () => {
    const store = fakeStore();
    const first = build({ weatherStore: store });
    drag(control(first.app, 'guitar.char'), 40);
    drag(control(first.app, 'guitar.char'), -40);
    live.splice(live.indexOf(first.app), 1);
    first.app.destroy();

    const second = build({ weatherStore: store });

    expect(second.app.weathering.wear).toEqual({ 'guitar.char': 2 });
    expect(Number(halo(second.app, 'guitar.char'))).toBeCloseTo(wearOpacity(2));
  });

  it('counts runtime only once the engine is running', () => {
    const { app } = build();

    vi.advanceTimersByTime(WEATHER.tickMs * 3);
    expect(app.weathering.runtime).toBe(0);

    wake(app);
    vi.advanceTimersByTime(WEATHER.tickMs);

    expect(app.weathering.runtime).toBe(WEATHER.tickSeconds);
    expect(weather(app)).toBe(weatherAt(WEATHER.tickSeconds).toFixed(WEATHER.digits));
    expect(onPage()).toBe('');
  });

  it('makes it look new again without changing a thing about the sound', () => {
    const store = fakeStore(JSON.stringify({ wear: { 'guitar.char': 9 }, runtime: 600 }));
    const { app } = build({ weatherStore: store });
    wake(app);
    drag(control(app, 'g.seriousness'), 30);
    vi.advanceTimersByTime(WEATHER.tickMs);

    const sound = {
      globals: { ...(app.engine?.globals ?? {}) },
      wires: [...(app.engine?.wires ?? [])],
      loud: SOURCE_IDS.map((id) => app.engine?.sources[id]?.loudV),
      on: SOURCE_IDS.map((id) => app.engine?.sources[id]?.on),
    };

    scrub(app);

    expect(app.weathering.wear).toEqual({});
    expect(app.weathering.runtime).toBe(0);
    expect(weather(app)).toBe('0.000');
    expect(halo(app, 'guitar.char')).toBe('0');
    expect(halo(app, 'g.seriousness')).toBe('0');
    expect(blob(store)).toEqual({ wear: {}, runtime: 0, dents: 0 });

    // The board becomes clean; nothing about the current sound changes.
    expect(app.engine?.globals).toEqual(sound.globals);
    expect(app.engine?.wires).toEqual(sound.wires);
    expect(SOURCE_IDS.map((id) => app.engine?.sources[id]?.loudV)).toEqual(sound.loud);
    expect(SOURCE_IDS.map((id) => app.engine?.sources[id]?.on)).toEqual(sound.on);
  });

  it('keeps rusting after a scrub — the board is new, not stopped', () => {
    const { app } = build();
    wake(app);
    vi.advanceTimersByTime(WEATHER.tickMs * 2);

    scrub(app);
    vi.advanceTimersByTime(WEATHER.tickMs);

    expect(app.weathering.runtime).toBe(WEATHER.tickSeconds);
  });

  it('stops the clock and drops the variable when the board comes down', () => {
    const { app } = build();
    wake(app);
    vi.advanceTimersByTime(WEATHER.tickMs);

    live.splice(live.indexOf(app), 1);
    app.destroy();
    const stopped = app.weathering.runtime;
    vi.advanceTimersByTime(WEATHER.tickMs * 5);

    expect(app.weathering.runtime).toBe(stopped);
    // And nothing of it was ever left on the page to take back.
    expect(onPage()).toBe('');
  });

  it('survives a page that will not let it store anything', () => {
    const angry: WeatherStore = {
      getItem(): string | null {
        throw new Error('private mode');
      },
      setItem(): void {
        throw new Error('quota exceeded');
      },
    };
    const { app } = build({ weatherStore: angry });

    expect(() => {
      wake(app);
      drag(control(app, 'guitar.char'), 40);
      vi.advanceTimersByTime(WEATHER.tickMs);
      scrub(app);
    }).not.toThrow();

    expect(app.engine?.started).toBe(true);
  });
});

// ../src/summon's own suite proves what one press decides. What belongs here is
// the half that suite cannot see: that the decision reaches all four of the
// things that read a board — the plate, the wire layer, the engine and the room
// — on the one gesture. `Math.random` is stubbed rather than sampled, so each
// case names the board it expects instead of asserting the same ranges a second
// time.
//
// Every case below swings the hammer and waits for it to land (gt#40), because
// that is now when any of this happens. The one case that does *not* wait is the
// first, and it is there to prove the waiting is real.
describe('smash it', () => {
  /** The hammer, swung — and given the length of its own fall to arrive. */
  const cast = (app: AppHandle): void => {
    swing(app);
    vi.advanceTimersByTime(SMASH.swingMs);
  };

  /** The click alone. Everything this causes is still in the air. */
  const swing = (app: AppHandle): void => press(app, 'smash');

  /** Any board-level button, by the part it carries. */
  const press = (app: AppHandle, name: string): void => {
    app.board.element
      .querySelector<HTMLElement>(`[data-part="${name}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  };

  /** Every draw answers this, which makes the whole result a value to write down. */
  const decides = (answer: number): { mockRestore(): void } =>
    vi.spyOn(Math, 'random').mockReturnValue(answer);

  /** The largest number below 1: every ceiling, and no coin coming up patched. */
  const ALMOST_ONE = 1 - Number.EPSILON;

  /** Where a random of 0 lands the patch — everything into the first box, chained on. */
  const FLOOR_WIRES = [
    ...SOURCE_IDS.map((id: SourceId) => ({ from: id, to: 'grit' })),
    // Derived, so a box added to the rack extends the expected patch rather than
    // failing this — gt#41 took the chain from four boxes to seven.
    ...MODIFIER_IDS.slice(0, -1).map((id, i) => ({ from: id, to: MODIFIER_IDS[i + 1] })),
  ];

  it('throws a ring across the board when the hammer lands, and not before', () => {
    // The board's half of the blow (gt#92). The room's is the kick; the plates'
    // is theirs to answer as the front reaches them — see tests/board.test.ts.
    const { app } = build();
    wake(app);
    const shocks = (): number =>
      app.bloomLayer.element.querySelectorAll('[data-part="shock"]').length;

    swing(app);
    expect(shocks()).toBe(0);
    vi.advanceTimersByTime(SMASH.swingMs);
    expect(shocks()).toBe(1);
  });

  it('throws no ring on a stilled board', () => {
    const { app } = build();
    wake(app);
    app.stillness.set(true);

    cast(app);

    expect(app.bloomLayer.element.querySelectorAll('[data-part="shock"]')).toHaveLength(0);
  });

  // The blow's own sound (gt#87). What it is made of is tests/hammer.test.ts's;
  // what is here is when the seam asks for it.
  it('sounds the blow at contact, once, and before the board it causes', () => {
    const { app } = build();
    wake(app);
    const engine = app.engine!;
    const blow = vi.spyOn(engine, 'blow');
    const rewire = vi.spyOn(engine, 'setWires');

    swing(app);
    // In the air. Nothing has been hit.
    expect(blow).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SMASH.swingMs);

    expect(blow).toHaveBeenCalledTimes(1);
    // Before the re-roll, which pokes every strike that comes up on: the
    // hammer should not find its voices already spent by what it caused.
    expect(blow.mock.invocationCallOrder[0]).toBeLessThan(rewire.mock.invocationCallOrder[0] ?? 0);
    expect(blow.mock.results[0]?.value).toBe(true);
  });

  it('sounds the blow on a stilled board too, because that switch never touches the sound', () => {
    const { app } = build();
    wake(app);
    app.stillness.set(true);
    const blow = vi.spyOn(app.engine!, 'blow');

    cast(app);

    expect(blow).toHaveBeenCalledTimes(1);
  });

  it('lands in silence before the lever, without complaint', () => {
    const { app } = build();

    expect(() => cast(app)).not.toThrow();
    expect(app.engine).toBeNull();
  });

  it('changes nothing whatsoever until the hammer has landed', () => {
    // The point of the whole feature, and the one thing about it this file is
    // entitled to check: the seam does not run early. A board that re-rolled on
    // the click would be the dome again, and every other case in this suite
    // would still pass.
    const { app } = build();
    wake(app);
    const before = { ...(app.engine?.globals ?? {}) };
    const wires = app.wires;
    decides(0);

    swing(app);
    vi.advanceTimersByTime(SMASH.swingMs - 1);
    expect(app.engine?.globals).toEqual(before);
    expect(app.wires).toEqual(wires);

    vi.advanceTimersByTime(1);
    expect(app.engine?.globals).not.toEqual(before);
  });

  it('pushes every source, every box, both globals and the patch in one pass', () => {
    const { app } = build();
    wake(app);
    decides(0);

    cast(app);

    for (const id of SOURCE_IDS) {
      const outlet = app.engine?.sources[id];
      expect(outlet?.on, id).toBe(true);
      expect(outlet?.loudV, id).toBe(SUMMON.loudFloor);
      expect(outlet?.charV, id).toBe(0);
      expect(outlet?.often, id).toBe(0);
    }
    expect(app.engine?.modifiers.grit?.amount).toBe(0);
    expect(app.engine?.modifiers.cavern?.amount).toBe(SUMMON.amounts.cavern.floor);
    expect(app.engine?.globals).toEqual({ seriousness: SUMMON.seriousFloor, tuning: 0 });
    // The patch reaches the seam's own list and the engine's, and they agree.
    expect(app.wires).toEqual(FLOOR_WIRES);
    expect(app.engine?.wires).toEqual(FLOOR_WIRES);
  });

  it('moves the room with it, on the gesture', () => {
    const { app } = build();
    wake(app);
    // Neither variable is where the opening state left it, so neither assertion
    // can pass by having simply not moved.
    const hue = (): string => roomLayer(app, 'wash')?.style.getPropertyValue('--hue') ?? '';
    const figure = (): string => roomLayer(app, 'sigil')?.innerHTML ?? '';
    expect(hue()).toBe(hueFor(OPENING_STATE.g.tuning));
    const before = figure();
    decides(ALMOST_ONE);

    cast(app);

    expect(hue()).toBe(hueFor(TUNE_WORDS.length - 1));
    expect(roomLayer(app, 'film')?.style.getPropertyValue('--grit')).toBe(
      (app.engine?.modifiers.grit?.amount ?? NaN).toFixed(3),
    );
    // And the third set-on-change layer with them (gt#36): the blow drove
    // SERIOUSNESS to its ceiling, so the figure behind the wash is redrawn
    // deeper than the opening state had it.
    expect(depthAt(app.engine?.globals.seriousness ?? 0)).toBeGreaterThan(
      depthAt(OPENING_STATE.g.seriousness),
    );
    expect(figure()).not.toBe(before);
    expect(figure()).toContain('data:image/svg+xml');
  });

  it('redraws the plate too, without waking or unwaking it', () => {
    const { app } = build();
    wake(app);
    /** This module's ambient tint, which only an on and woken module shows. */
    const tint = (id: SourceId): number =>
      Number(
        app.board.modules.get(id)?.element.querySelector<HTMLElement>('[data-part="glow"]')?.style
          .opacity,
      );
    expect(OPENING_STATE.m.chainsaw.on).toBe(false);
    expect(tint('chainsaw')).toBe(0);
    decides(0);

    cast(app);

    // The plate answered the new state, and the lever's state survived it —
    // `woke` is not a thing the re-roll has any opinion about.
    expect(tint('chainsaw')).toBeGreaterThan(0);
  });

  it('relights the boxes against the patch it just laid', () => {
    const { app } = build();
    wake(app);
    const lamp = (id: ModifierId): string | undefined =>
      app.board.modifiers.get(id)?.element.querySelector<HTMLElement>('[data-part="lamp"]')?.style
        .background;
    expect(MODIFIER_IDS.filter((id) => lamp(id) === signals.lampOn)).toHaveLength(3);
    decides(ALMOST_ONE);

    cast(app);

    // Nothing patched at all is a legal board — every source straight to the
    // speakers — and every lamp has to say so.
    expect(app.wires).toEqual([]);
    expect(app.engine?.wires).toEqual([]);
    for (const id of MODIFIER_IDS) expect(lamp(id), id).toBe(signals.lampOff);
  });

  it('leaves the wall and the floor standing when it turns everything else off', () => {
    const { app } = build();
    wake(app);
    decides(ALMOST_ONE);

    cast(app);

    // The board never goes near-silent, which is the whole reason these two are
    // exempt from the coin toss.
    for (const id of SOURCE_IDS) {
      expect(app.engine?.sources[id]?.on, id).toBe(SUMMON.alwaysOn.includes(id));
    }
  });

  it('decides a board before the lever, and the engine opens on that one', () => {
    const { app } = build();
    const drawn = decides(0);

    cast(app);

    // Nothing to push into, and nothing thrown for the lack of it.
    expect(app.engine).toBeNull();
    expect(app.wires).toEqual(FLOOR_WIRES);

    // The lever is pulled with a real random back in place, so what the engine
    // opens on can only have come from the state the press left behind.
    drawn.mockRestore();
    wake(app);

    expect(app.engine?.wires).toEqual(FLOOR_WIRES);
    expect(app.engine?.globals).toEqual({ seriousness: SUMMON.seriousFloor, tuning: 0 });
    expect(app.engine?.sources.chainsaw?.loudV).toBe(SUMMON.loudFloor);
  });

  it('is not a hand on a knob, and wears nothing out', () => {
    const store = fakeStore();
    const { app } = build({ weatherStore: store });
    wake(app);
    decides(0);

    cast(app);

    // Wear counts what the user turned. Deciding not to decide is not a turn.
    // It used to leave the blob untouched entirely — gt#40 changed that, and the
    // half that changed is the half below.
    expect(app.weathering.wear).toEqual({});
  });

  it('leaves a mark, and the mark outlives the page', () => {
    const store = fakeStore();
    const { app } = build({ weatherStore: store });
    wake(app);
    decides(0);
    const marks = (): number => app.board.element.querySelectorAll('[data-part="dent"]').length;
    expect(marks()).toBe(0);

    cast(app);
    cast(app);

    expect(app.weathering.dents).toBe(2);
    expect(marks()).toBe(2);
    expect(JSON.parse(store.held ?? '{}').dents).toBe(2);
  });

  it('opens on the marks the last session left, without watching them arrive', () => {
    const store = fakeStore();
    store.held = JSON.stringify({ wear: {}, runtime: 0, dents: 4 });
    const { app } = build({ weatherStore: store });

    // Before the lever, before a frame, before anything has moved.
    expect(app.board.element.querySelectorAll('[data-part="dent"]')).toHaveLength(4);
  });

  it('is what SCRUB THE ALTAR finally has something to undo', () => {
    const { app } = build();
    wake(app);
    decides(0);
    for (let blow = 0; blow < 3; blow += 1) cast(app);
    expect(app.board.element.querySelectorAll('[data-part="dent"]')).toHaveLength(3);

    press(app, 'scrub');

    expect(app.weathering.dents).toBe(0);
    expect(app.board.element.querySelectorAll('[data-part="dent"]')).toHaveLength(0);
  });

  it('strikes the room, and cannot while the room is stilled', () => {
    const { app } = build();
    wake(app);
    const shake = (): string => roomLayer(app, 'wash')?.style.getPropertyValue('--shake') ?? '';
    // Nothing is playing loudly enough to shake anything, so whatever moves this
    // next can only be the hammer.
    vi.advanceTimersByTime(16 * 20);
    expect(shake()).toBe(SHAKE_STILL);

    cast(app);
    vi.advanceTimersByTime(16);
    expect(shake()).not.toBe(SHAKE_STILL);
    vi.advanceTimersByTime(16 * 40);
    // And it dies away on its own envelope, with nothing to release it (gt#74).
    expect(shake()).toBe(SHAKE_STILL);

    // Stilled, the same blow moves nothing at all — and still lands.
    press(app, 'still');
    const globals = { ...(app.engine?.globals ?? {}) };
    decides(ALMOST_ONE);
    cast(app);
    vi.advanceTimersByTime(16 * 20);
    expect(shake()).toBe(SHAKE_STILL);
    expect(app.engine?.globals).not.toEqual(globals);
  });
});

describe('MEGADRIFT', () => {
  /**
   * Run the drift clock for a stretch of engine time, moving the audio clock and
   * the timers together.
   *
   * Both, and in that order, because the tick reads the context rather than
   * counting: advancing only the timers would run the interval against a clock
   * that never moved, and every curve would sit at rest while the test believed
   * minutes had passed.
   */
  function run(ctx: FakeAudioContext, seconds: number, ticks = 1): void {
    const step = seconds / ticks;
    for (let tick = 0; tick < ticks; tick += 1) {
      ctx.currentTime += step;
      vi.advanceTimersByTime(DRIFT.tickMs);
    }
  }

  /**
   * Throw the lever to an amount, as a hand would — by the distance from where
   * it currently is, not from the bottom of its travel.
   *
   * A drag begins at the control's own position, so asking for the value it is
   * already at is a gesture that moves nothing and reports nothing, which is
   * exactly right of the control and no use at all to a test that wanted the
   * lever somewhere else.
   */
  function lever(app: AppHandle, amount: number): void {
    // The drag is a fixed distance for the hand — see DRAG in src/ui/constants.
    drag(control(app, `${GLOBAL_SCOPE}.megadrift`), (amount - app.megadrift) * DRAG.fullRangePx);
    expect(app.megadrift).toBeCloseTo(amount, 6);
  }

  /** Every level, character and amount the engine currently holds. */
  function heard(app: AppHandle): number[] {
    const engine = app.engine;
    if (!engine) throw new Error('The engine has not been started.');
    return [
      ...SOURCE_IDS.flatMap((id) => [
        engine.sources[id]?.loudV ?? NaN,
        engine.sources[id]?.charV ?? NaN,
      ]),
      ...MODIFIER_IDS.map((id) => engine.modifiers[id]?.amount ?? NaN),
    ];
  }

  /** Where every control on the board is currently drawn, by its own key. */
  function drawn(app: AppHandle): string[] {
    return [...app.board.element.querySelectorAll<HTMLElement>('[data-control]')].map((element) => {
      const seat = element.querySelector<HTMLElement>('[data-part="dial"], [data-part="cap"]');
      return `${element.dataset.control}:${seat?.style.transform ?? ''}${seat?.style.bottom ?? ''}`;
    });
  }

  it('holds the board exactly where it was set until the lever is thrown', () => {
    // It opens shut, so five minutes of engine time changes nothing. The whole
    // first-law argument rests on this: a board nobody has asked to wander does
    // not wander, however long it is left.
    const { app, ctx } = build();
    wake(app);
    expect(app.megadrift).toBe(DRIFT.opening);

    const before = heard(app);
    const painted = drawn(app);
    run(ctx, 300);
    expect(heard(app)).toEqual(before);
    expect(drawn(app)).toEqual(painted);
  });

  it('says nothing on a tick that has nothing new to say', () => {
    // The lever is shut, so every tick would restate the board that is already
    // there: thirty-odd parameters into the engine and every control on the
    // plate, ten times a second. Measured on a slowed machine that was most of
    // what the page did. One tick settles it, and after that a tick is silent.
    const { app, ctx } = build();
    wake(app);
    run(ctx, 1);
    const engine = app.engine;
    if (!engine) throw new Error('The engine has not been started.');
    const loud = vi.spyOn(engine, 'setLoud');
    const char = vi.spyOn(engine, 'setChar');
    const mod = vi.spyOn(engine, 'setMod');
    const drew = vi.spyOn(app.board, 'setState');

    run(ctx, 30, 300);

    expect(loud).not.toHaveBeenCalled();
    expect(char).not.toHaveBeenCalled();
    expect(mod).not.toHaveBeenCalled();
    expect(drew).not.toHaveBeenCalled();

    // A hand on the board is something new, and the tick after it says so once.
    drag(control(app, 'guitar.loud'), 20);
    loud.mockClear();
    drew.mockClear();
    run(ctx, 1, 10);
    expect(loud.mock.calls.length).toBe(SOURCE_IDS.length);
    expect(drew).toHaveBeenCalledTimes(1);

    // And with the lever up every tick has something to say, which is the point
    // of the lever.
    lever(app, 1);
    loud.mockClear();
    run(ctx, 1, 10);
    expect(loud.mock.calls.length).toBe(SOURCE_IDS.length * 10);
  });

  it('turns its own knobs and moves the sound underneath them', () => {
    const { app, ctx } = build();
    wake(app);
    const before = heard(app);
    const painted = drawn(app);

    lever(app, 1);
    run(ctx, 40);

    // Both halves, and both are the point: the sound has moved, and the board is
    // showing where it moved to rather than where it was left.
    expect(heard(app)).not.toEqual(before);
    expect(drawn(app)).not.toEqual(painted);
  });

  it('never wanders further than the lever allows', () => {
    // The board is still recognisably the board that was set — which is the
    // difference between a drift and a re-roll.
    const { app, ctx } = build();
    wake(app);
    const before = heard(app);

    lever(app, 1);
    for (let step = 0; step < 40; step += 1) {
      run(ctx, 10);
      for (const [at, value] of heard(app).entries()) {
        expect(Math.abs(value - (before[at] ?? NaN))).toBeLessThanOrEqual(DRIFT.envelope + 1e-9);
      }
    }
  });

  it('hands every control back when the lever is shut again', () => {
    const { app, ctx } = build();
    wake(app);
    const before = heard(app);

    lever(app, 1);
    run(ctx, 37);
    expect(heard(app)).not.toEqual(before);

    // Not on the next tick — immediately, on the gesture. A lever pushed to
    // nothing that left the board somewhere for a tenth of a second would be the
    // one control here that does not do what it says as you move it.
    lever(app, 0);
    expect(heard(app)).toEqual(before);
  });

  it('never pokes a strike, however long it drifts', () => {
    // The one correctness problem in the whole feature. `setLoud` and `setChar`
    // fire an immediate hit on a quiet strike so that touching a control proves
    // the module exists — a promise about hands. The poke debounces at nine
    // tenths of a second and the drift ticks ten times one, so a drift that
    // proved itself would fire a hit a second out of every strike module on the
    // board, forever, and turn the slowest thing in the product into a metronome.
    const { app, ctx } = build();
    wake(app);
    ctx.currentTime += 5;
    retireVoices(ctx);

    const poked = (): Array<number | undefined> =>
      SOURCE_IDS.map((id) => app.engine?.sources[id]?.pokedAt);
    const before = poked();

    lever(app, 1);
    // Real ticks rather than one jump, and that is the whole design of this
    // check: the poke is debounced against the clock, so a single tick could
    // never have fired more than one whatever the code did. Three hundred of them
    // across a minute puts sixty debounce windows behind this.
    run(ctx, 60, 300);

    // Every one of those ticks moved a level and a character on every module on
    // the board, and not one of them asked for a hit.
    expect(poked()).toEqual(before);
    // And the drift really was running while that was true, so this is not
    // passing by having done nothing.
    expect(app.drift.seconds).toBeGreaterThan(50);
  });

  it('is pinned on screen by STILLNESS and never underneath it', () => {
    // The asymmetry ../src/stillness wrote down before there was anything to
    // apply it to: that switch is about the user's eyes, so it stops the knobs
    // turning and never stops the sound moving.
    const { app, ctx } = build();
    wake(app);
    lever(app, 1);
    run(ctx, 10);

    app.stillness.set(true);
    const painted = drawn(app);
    const before = heard(app);

    run(ctx, 20);
    expect(drawn(app)).toEqual(painted);
    expect(heard(app)).not.toEqual(before);

    // And when the switch comes back off the board is told where the sound
    // actually got to, at once, rather than sitting a tick longer on a position
    // nothing is playing.
    app.stillness.set(false);
    expect(drawn(app)).not.toEqual(painted);
  });

  it('re-centres on a hand rather than undoing it', () => {
    // The fastest possible way to make a board feel broken is to move a control
    // back after somebody has just moved it.
    const { app, ctx } = build();
    wake(app);
    lever(app, 1);
    run(ctx, 23);

    drag(control(app, 'guitar.char'), 60);
    const set = app.engine?.sources.guitar?.charV ?? NaN;
    expect(set).toBeGreaterThan(0);

    // The envelope now sits around where the hand left it, not around where the
    // board had wandered to before it arrived.
    for (let step = 0; step < 20; step += 1) {
      run(ctx, 7);
      expect(Math.abs((app.engine?.sources.guitar?.charV ?? NaN) - set)).toBeLessThanOrEqual(
        DRIFT.envelope + 1e-9,
      );
    }
  });

  it('re-centres on the board the hammer leaves, and keeps its own setting', () => {
    const { app, ctx } = build();
    wake(app);
    lever(app, 1);
    run(ctx, 15);

    const smashed = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    app.board.element
      .querySelector<HTMLElement>('[data-part="smash"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    vi.advanceTimersByTime(SMASH.swingMs);
    smashed.mockRestore();

    // The lever is not part of the board the hammer re-rolls: how far things are
    // allowed to wander is a setting about a board, not a value in one.
    expect(app.megadrift).toBe(1);

    const landed = heard(app);
    for (let step = 0; step < 20; step += 1) {
      run(ctx, 9);
      for (const [at, value] of heard(app).entries()) {
        expect(Math.abs(value - (landed[at] ?? NaN))).toBeLessThanOrEqual(2 * DRIFT.envelope + 1e-9);
      }
    }
  });

  it('never touches the patch or a power switch', () => {
    // Two of the three things the issue rules out. A source switching itself off
    // is the board taking things away, and a board that re-wires itself is a
    // board nobody is playing.
    const { app, ctx } = build();
    wake(app);
    const wires = JSON.stringify(app.wires);
    const powers = SOURCE_IDS.map((id) => app.engine?.sources[id]?.on);

    lever(app, 1);
    run(ctx, 200);

    expect(JSON.stringify(app.wires)).toBe(wires);
    expect(SOURCE_IDS.map((id) => app.engine?.sources[id]?.on)).toEqual(powers);
  });

  it('leaves both of the globals it does not own exactly where they are', () => {
    // TUNING because the root moving is gt#56's and the two share this clock rather
    // than growing a second one; SERIOUSNESS because the issue's list of what
    // drifts does not have it in.
    const { app, ctx } = build();
    wake(app);
    const globals = { ...(app.engine?.globals ?? {}) };

    lever(app, 1);
    run(ctx, 200);

    expect(app.engine?.globals).toEqual(globals);
  });

  it('does not start counting before the lever is pulled', () => {
    // Drift is measured in engine time, and a board sat in front of WAKE IT has
    // none — the same rule the weathering clock keeps about runtime.
    const { app, ctx } = build();
    expect(app.drift.seconds).toBe(0);
    run(ctx, 30);
    expect(app.drift.seconds).toBe(0);

    wake(app);
    run(ctx, 5);
    expect(app.drift.seconds).toBeGreaterThan(0);
  });

  // One draw, whoever asks for it (gt#91). The board used to be drawn two ways —
  // as it was set, by a gesture, and as it was heard, by a tick — and a drag
  // with the lever up made every control on the plate flicker between the two.
  describe('drawn one way, whoever asks', () => {
    /** Everything `drawn` reports, less the controls a case is about to move. */
    const others = (app: AppHandle, ...moved: string[]): string[] =>
      drawn(app).filter((line) => !moved.some((key) => line.startsWith(`${key}:`)));

    /** How far round one knob is drawn, in degrees. */
    const angle = (app: AppHandle, key: string): number => {
      const face = control(app, key).querySelector<HTMLElement>('[data-part="dial"]');
      return parseFloat(/rotate\((-?[\d.]+)deg\)/.exec(face?.style.transform ?? '')?.[1] ?? 'NaN');
    };

    /** A board that has wandered, and proof that it has. */
    function wandered(): { app: AppHandle; ctx: FakeAudioContext; set: string[] } {
      const { app, ctx } = build();
      wake(app);
      const set = drawn(app);
      lever(app, 1);
      // Twenty seconds, which is a quarter of the way round CROWD's own curve:
      // the knob these cases turn is as far from where it was set as it gets.
      run(ctx, 20);
      expect(drawn(app)).not.toEqual(set);
      return { app, ctx, set };
    }

    it('leaves every other control where the drift had it when one is turned', () => {
      // The bug itself. This drag used to redraw the whole board as it was set.
      const { app } = wandered();
      const before = others(app, 'guitar.char');

      press(control(app, 'guitar.char'));
      for (const pixels of [5, 12, 20, 30]) {
        window.dispatchEvent(new PointerEvent('pointermove', { clientY: 300 - pixels }));
        // On every step of the drag, not only at the end of it: the flicker was
        // between one pointer move and the next tick.
        expect(others(app, 'guitar.char')).toEqual(before);
      }
      window.dispatchEvent(new PointerEvent('pointerup', { clientY: 270 }));
      expect(others(app, 'guitar.char')).toEqual(before);
    });

    it('moves the turned control by what the hand did, and by nothing else', () => {
      const { app, ctx } = wandered();
      const from = angle(app, 'guitar.char');
      // It is being carried, or this proves nothing: the drift it holds is what
      // must not be folded into the setting.
      expect(Math.abs(from - (KNOB_SWEEP.start + KNOB_SWEEP.span * 0.6))).toBeGreaterThan(8);

      drag(control(app, 'guitar.char'), 0.2 * DRAG.fullRangePx);
      expect(angle(app, 'guitar.char') - from).toBeCloseTo(0.2 * KNOB_SWEEP.span, 0);

      // And a tick later it has not jumped. The clock is not moved, so the drift
      // has not either, and anything that changes here is the two draws
      // disagreeing.
      const landed = drawn(app);
      run(ctx, 0);
      expect(drawn(app)).toEqual(landed);
    });

    it('steps a wheel notch from where the control was set, however often', () => {
      // Three notches is three notches. Read off the drawn position, each one
      // would have picked up the drift and set the control that much further.
      const { app, ctx } = wandered();
      const from = angle(app, 'guitar.char');
      const notch = 50;

      for (let turn = 0; turn < 3; turn += 1) {
        control(app, 'guitar.char').dispatchEvent(
          new WheelEvent('wheel', { deltaY: -notch, bubbles: true, cancelable: true }),
        );
        run(ctx, 0);
      }

      expect(angle(app, 'guitar.char') - from).toBeCloseTo(
        3 * notch * WHEEL.perPixel * KNOB_SWEEP.span,
        0,
      );
    });

    it('does not move a knob when a cable goes in', () => {
      const { app } = wandered();
      const before = drawn(app);
      const cables = app.wires.length;

      // A cable dragged out of BASS and dropped on WOBBLE's IN jack — a change
      // to the patch and to nothing else.
      const target = app.board.modifiers.get('wobble')?.jackIn ?? null;
      app.wireLayer.beginDrag('bass', new PointerEvent('pointerdown', { button: 0, cancelable: true }));
      document.elementFromPoint = ((): Element | null => target) as typeof document.elementFromPoint;
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: 0, clientY: 0 }));

      expect(app.wires.length).toBe(cables + 1);
      expect(drawn(app)).toEqual(before);
    });

    it('shows the grain where GRIT is heard, on the gesture and on the tick alike', () => {
      const { app, ctx } = wandered();
      const grit = (): string => roomLayer(app, 'film')?.style.getPropertyValue('--grit') ?? '';

      drag(control(app, 'mods.grit'), 20);
      const onGesture = grit();
      run(ctx, 0);

      expect(grit()).toBe(onGesture);
      // Heard, not set: the engine is told the drifted amount on that tick, and
      // it is the number the room was already showing.
      expect(Number(onGesture)).toBeCloseTo(app.engine?.modifiers.grit?.amount ?? NaN, 3);
    });

    it('holds every other control still on a stilled board, and follows the hand', () => {
      const { app, ctx } = wandered();
      app.stillness.set(true);
      const pinned = others(app, 'guitar.char');
      const from = angle(app, 'guitar.char');

      // The sound carries on underneath, a long way.
      run(ctx, 25);
      drag(control(app, 'guitar.char'), 0.1 * DRAG.fullRangePx);

      expect(others(app, 'guitar.char')).toEqual(pinned);
      expect(angle(app, 'guitar.char') - from).toBeCloseTo(0.1 * KNOB_SWEEP.span, 0);
    });

    it('hands the knobs back on a stilled board when the lever is shut by hand', () => {
      const { app, set } = wandered();
      app.stillness.set(true);
      expect(drawn(app)).not.toEqual(set);

      lever(app, 0);

      const key = `${GLOBAL_SCOPE}.megadrift`;
      expect(drawn(app).filter((line) => !line.startsWith(`${key}:`))).toEqual(
        set.filter((line) => !line.startsWith(`${key}:`)),
      );
    });
  });
});

// The typefaces (gt#69, gt#94). What is carried and how is tests/fonts.test.ts's;
// what is here is the one thing the seam does about it — and the one thing it
// must not.
describe('when the typefaces land', () => {
  /** Stand in for `document.fonts`, which happy-dom does not have. */
  function faceSet(): EventTarget {
    const set = new EventTarget();
    Object.defineProperty(document, 'fonts', { value: set, configurable: true });
    return set;
  }

  afterEach(() => {
    delete (document as unknown as { fonts?: unknown }).fonts;
  });

  it('asks for them at mount, from script, before the lever is touched', () => {
    const { app } = build();

    expect(app.engine).toBeNull();
    expect(app.fonts.sheet?.parentNode).toBe(document.head);
    expect(app.fonts.sheet?.textContent).toContain('@font-face');
    // And it asks no other host for anything (gt#94).
    expect(document.head.querySelectorAll('link')).toHaveLength(0);
  });

  it('measures every cable again, because lettering that changes width moves the jacks', () => {
    const set = faceSet();
    const { app } = build();
    const cable = (): string | null =>
      app.wireLayer.element.querySelector('[data-wire]')?.getAttribute('d') ?? null;
    const before = cable();

    // A face lands, the name beside this jack gets narrower, and the socket is
    // somewhere else. Nothing has told the layer yet.
    const jack = app.board.element.querySelector<HTMLElement>('[data-jack-out="guitar"]')!;
    jack.getBoundingClientRect = () => new DOMRect(389, 189, 22, 22);
    expect(cable()).toBe(before);

    set.dispatchEvent(new Event('loadingdone'));

    expect(cable()).not.toBe(before);
    expect(cable()).toContain('M400.0 200.0');
  });

  it('wakes and drones whether or not they ever arrive', () => {
    // gt#47's rule, at the level it is actually a promise: no face has landed, no
    // event has fired, and the board is running.
    faceSet();
    const { app } = build();
    wake(app);

    expect(app.engine?.started).toBe(true);
    expect(app.wake.pulled).toBe(true);
  });

  it('stops listening when the page is torn down, and takes its faces with it', () => {
    const set = faceSet();
    const { app } = build();
    const cable = app.wireLayer.element.querySelector('[data-wire]');
    const before = cable?.getAttribute('d');

    app.destroy();
    live.splice(live.indexOf(app), 1);
    const jack = app.board.element.querySelector<HTMLElement>('[data-jack-out="guitar"]')!;
    jack.getBoundingClientRect = () => new DOMRect(389, 189, 22, 22);
    set.dispatchEvent(new Event('loadingdone'));

    expect(cable?.getAttribute('d')).toBe(before);
    expect(document.head.querySelectorAll('style')).toHaveLength(0);
  });
});

// Fitting the window both ways (gt#71). The arithmetic is tests/board.test.ts's;
// what is here is *when* the seam asks the plate how tall it is — the two
// moments nothing else would say so.
describe('fitting the board to the window', () => {
  const fitVar = (): string => document.body.style.getPropertyValue('--fit');

  /** Every plate in this suite measures 1440 by 925, as the real one does. */
  let realRect: typeof HTMLElement.prototype.getBoundingClientRect;
  let asked = 0;

  beforeEach(() => {
    asked = 0;
    realRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement): DOMRect {
      if (this.dataset.part !== 'board') return realRect.call(this);
      asked += 1;
      return new DOMRect(0, 0, 1440, 925);
    };
    Object.defineProperty(window, 'innerWidth', { value: 1666, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 740, configurable: true });
  });

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = realRect;
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    document.body.style.removeProperty('--fit');
    delete (document as unknown as { fonts?: unknown }).fonts;
  });

  it('fits to the height as soon as the plate is on the page', () => {
    // A window wider than the design and shorter than the board: by width alone
    // this is 1, and a fifth of the plate is below the fold.
    build();

    expect(fitVar()).toBe('0.8000');
  });

  it('asks the plate again when the typefaces land, because they change its height', () => {
    const set = new EventTarget();
    Object.defineProperty(document, 'fonts', { value: set, configurable: true });
    build();
    expect(fitVar()).toBe('0.8000');

    // The faces arrive and every line box on the plate is a little shorter.
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement): DOMRect {
      return this.dataset.part === 'board' ? new DOMRect(0, 0, 1440, 800) : realRect.call(this);
    };
    set.dispatchEvent(new Event('loadingdone'));

    expect(fitVar()).toBe('0.9250');
  });

  it('asks the plate once on a resize, to check the factor it was just given', () => {
    build();
    const before = asked;

    Object.defineProperty(window, 'innerHeight', { value: 462.5, configurable: true });
    window.dispatchEvent(new Event('resize'));

    expect(fitVar()).toBe('0.5000');
    // Two reads. One is the wire layer's: it takes its own scale off the
    // plate's rect on every resize (gt#22). The other is the board checking that
    // the plate it just zoomed still fits the window — a resize was once held
    // to change the window and not the plate, and at a new zoom the plate is a
    // pixel or two different. This plate says what it said before, so one
    // check is all it takes.
    expect(asked - before).toBe(2);
  });
});

// A hit lands in the room as well as on the plate (gt#74). The arithmetic is
// tests/atmosphere.test.ts's; what is here is the seam telling the room, and
// what it tells it with.
describe('a strike reaching the room', () => {
  const shake = (app: AppHandle): string =>
    roomLayer(app, 'wash')?.style.getPropertyValue('--shake') ?? '';

  /** How far the room is thrown on the frame after `id` is heard. */
  function heard(app: AppHandle, id: string): number {
    // Let whatever the wake-up poked die away first, so this is one blow.
    vi.advanceTimersByTime(16 * 40);
    expect(shake(app)).toBe(SHAKE_STILL);
    app.engine?.announce(id, 0);
    vi.advanceTimersByTime(16);
    const value = shake(app);
    if (value === SHAKE_STILL) return 0;
    const [x = 0, y = 0] = value.split(' ').map((part) => Math.abs(parseFloat(part)));
    return Math.hypot(x, y);
  }

  it('shakes it on SLOW HIT, which is what WEIGHT says it does', () => {
    const { app } = build();
    wake(app);

    expect(heard(app, 'slowhit')).toBeGreaterThan(0);
  });

  it('shakes it harder the further WEIGHT is turned', () => {
    const { app } = build();
    wake(app);
    const light = heard(app, 'slowhit');

    drag(control(app, 'slowhit.char'), DRAG.fullRangePx);
    // The drag itself pokes a hit. The next one is the one measured.
    const heavy = heard(app, 'slowhit');

    expect(heavy).toBeGreaterThan(light);
  });

  it('leaves it alone on a strike that is not a blow', () => {
    const { app } = build();
    wake(app);

    expect(heard(app, 'cymbal')).toBe(0);
    expect(heard(app, 'maracas')).toBe(0);
    expect(heard(app, 'not-a-module')).toBe(0);
  });

  it('never tells the engine anything, however hard it lands', () => {
    const { app, ctx } = build();
    wake(app);
    vi.advanceTimersByTime(16 * 40);
    const created = ctx.created.length;
    const globals = { ...(app.engine?.globals ?? {}) };

    app.engine?.announce('slowhit', 0);
    vi.advanceTimersByTime(16 * 30);

    // A hit announced is a hit already booked. Being told about it builds
    // nothing and moves nothing on the far side of the seam.
    expect(ctx.created.length).toBe(created);
    expect(app.engine?.globals).toEqual(globals);
  });

  it('does not move a stilled room, and the hit is heard all the same', () => {
    const { app } = build();
    wake(app);
    vi.advanceTimersByTime(16 * 40);
    app.stillness.toggle();

    app.engine?.announce('slowhit', 0);
    vi.advanceTimersByTime(16 * 5);

    expect(shake(app)).toBe(SHAKE_STILL);
  });
});

// The heartbeat reaching the board (gt#83).
describe('the beat lamp, through the seam', () => {
  const lamp = (app: AppHandle): HTMLElement =>
    app.board.element.querySelector<HTMLElement>('[data-part="beat"]')!;

  it('is dark before the lever, and flashes on the engine’s own beat after it', () => {
    const { app } = build();
    expect(lamp(app).style.background).toBe(signals.lampOff);

    wake(app);
    app.engine?.pulse(7, 0);
    vi.advanceTimersByTime(0);

    expect(lamp(app).style.background).toBe(signals.lampOn);
  });

  it('tells the engine nothing', () => {
    const { app, ctx } = build();
    wake(app);
    const created = ctx.created.length;
    const bpm = app.engine?.bpm;

    app.engine?.pulse(1, 0);
    vi.advanceTimersByTime(1000);

    expect(ctx.created.length).toBe(created);
    expect(app.engine?.bpm).toBe(bpm);
  });

  it('holds the lamp steady while the board is stilled', () => {
    const { app } = build();
    wake(app);
    app.stillness.toggle();

    app.engine?.pulse(1, 0);
    vi.advanceTimersByTime(2000);

    expect(lamp(app).style.background).toBe(signals.lampOn);
  });
});

// Cables that show whether anything is coming down them (gt#85).
describe('signal in the cables', () => {
  const core = (app: AppHandle, index: number): string =>
    app.wireLayer.element.querySelectorAll<SVGPathElement>('[data-wire]')[index]?.style.opacity ?? '';
  const cableOf = (from: string): number => OPENING_WIRES.findIndex((wire) => wire.from === from);

  it('opens with every cable live, because everything patched opens on', () => {
    const { app } = build();
    wake(app);

    expect(OPENING_WIRES.map((_, index) => core(app, index))).toEqual(OPENING_WIRES.map(() => ''));
  });

  it('kills a cable when its source is switched off, and only that one', () => {
    const { app } = build();
    wake(app);
    const bass = cableOf('bass');

    app.board.modules.get('bass')?.element.querySelector<HTMLElement>('[data-part="power"]')?.click();

    expect(core(app, bass)).not.toBe('');
    expect(OPENING_WIRES.map((_, index) => core(app, index)).filter((value) => value !== '')).toHaveLength(1);

    app.board.modules.get('bass')?.element.querySelector<HTMLElement>('[data-part="power"]')?.click();
    expect(core(app, bass)).toBe('');
  });

  it('kills the cable out of a box as well, once nothing live reaches the box', () => {
    // GUITAR WALL feeds GRIT and GRIT feeds CAVERN. With the wall off, both
    // cables are carrying nothing — the second one because of the first.
    const { app } = build();
    wake(app);
    const guitar = cableOf('guitar');
    const grit = cableOf('grit');

    app.board.modules.get('guitar')?.element.querySelector<HTMLElement>('[data-part="power"]')?.click();

    expect(core(app, guitar)).not.toBe('');
    expect(core(app, grit)).not.toBe('');
  });

  it('runs a pulse down SLOW HIT’s cable when it strikes, and none on a stilled board', () => {
    const { app } = build();
    wake(app);
    const pulses = (): number => app.wireLayer.element.querySelectorAll('[data-pulse]').length;
    vi.advanceTimersByTime(2000);
    expect(pulses()).toBe(0);

    app.engine?.announce('slowhit', 0);
    vi.advanceTimersByTime(0);
    expect(pulses()).toBe(1);

    vi.advanceTimersByTime(2000);
    app.stillness.toggle();
    app.engine?.announce('slowhit', 0);
    vi.advanceTimersByTime(0);
    expect(pulses()).toBe(0);
  });
});

// A hit sized by how loud it is set, on the layer and on the plate (gt#81).
describe('a strike, as loud as it is set', () => {
  const lastBloom = (app: AppHandle): HTMLElement | undefined =>
    [...app.bloomLayer.element.querySelectorAll<HTMLElement>('[data-part="bloom"]')].at(-1);
  const plateFlash = (app: AppHandle, id: string): HTMLElement =>
    app.board.element.querySelector<HTMLElement>(`[data-module="${id}"] [data-part="flash"]`)!;

  it('throws less light from a module turned down', () => {
    const { app } = build();
    wake(app);
    vi.advanceTimersByTime(3000);

    app.engine?.announce('slowhit', 0);
    vi.advanceTimersByTime(0);
    const loud = parseFloat(lastBloom(app)!.style.width);

    vi.advanceTimersByTime(3000);
    drag(control(app, 'slowhit.loud'), -DRAG.fullRangePx);
    vi.advanceTimersByTime(3000);
    app.engine?.announce('slowhit', 0);
    vi.advanceTimersByTime(0);

    expect(parseFloat(lastBloom(app)!.style.width)).toBeLessThan(loud);
  });

  it('flashes the plate that struck, and no other', () => {
    const { app } = build();
    wake(app);
    vi.advanceTimersByTime(3000);

    app.engine?.announce('slowhit', 0);
    // The announcement lands; the plate is lit on that turn and let go on the next.
    vi.advanceTimersToNextTimer();

    expect(Number(plateFlash(app, 'slowhit').style.opacity)).toBeGreaterThan(0);
    expect(plateFlash(app, 'cymbal').style.opacity).toBe('0');
  });

  it('leaves the plate alone on a stilled board', () => {
    const { app } = build();
    wake(app);
    vi.advanceTimersByTime(3000);
    app.stillness.toggle();

    app.engine?.announce('slowhit', 0);
    vi.advanceTimersToNextTimer();

    expect(plateFlash(app, 'slowhit').style.opacity).toBe('0');
  });
});

// A smash that knocks the board rather than replacing it (gt#80).
describe('the board after a blow', () => {
  /** Swing the hammer and run the clock to the moment it lands. */
  const blow = (app: AppHandle): void => {
    app.board.element.querySelector<HTMLElement>('[data-part="smash"]')?.click();
    vi.advanceTimersByTime(SMASH.swingMs);
  };
  const cables = (app: AppHandle): SVGGElement =>
    app.wireLayer.element.querySelector<SVGGElement>(':scope > g')!;

  it('brings the cables back in, with the new patch already in the engine', () => {
    const { app } = build();
    wake(app);

    blow(app);

    // Heard at once: the engine has the patch the layer is only starting to show.
    expect(app.engine?.wires).toEqual([...app.wires]);
    expect(cables(app).style.opacity).toBe('0');
    vi.advanceTimersToNextTimer();
    expect(cables(app).style.opacity).toBe('1');
  });

  it('cuts straight to the new patch on a stilled board', () => {
    const { app } = build();
    wake(app);
    app.stillness.toggle();

    app.board.element.querySelector<HTMLElement>('[data-part="smash"]')?.click();

    expect(cables(app).style.opacity).toBe('');
    expect(app.engine?.wires).toEqual([...app.wires]);
  });
});

// Moving a cable from one box to another in a single gesture (gt#79).
describe('pulling a cable, through the seam', () => {
  const socket = (app: AppHandle, id: string): HTMLElement =>
    app.board.element.querySelector<HTMLElement>(`[data-jack-in="${id}"]`)!;

  /** Give every cable somewhere to hang, since happy-dom lays nothing out. */
  function laidOut(app: AppHandle): void {
    let x = 100;
    for (const jack of app.board.element.querySelectorAll<HTMLElement>('[data-jack-in],[data-jack-out]')) {
      const left = (x += 40);
      jack.getBoundingClientRect = () => new DOMRect(left, 300, 22, 22);
    }
    app.wireLayer.measure();
  }

  it('re-patches BASS from MURK to WOBBLE, in the engine as well as on the board', () => {
    const { app } = build();
    wake(app);
    laidOut(app);

    socket(app, 'murk').dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }),
    );
    document.elementFromPoint = (() => socket(app, 'wobble')) as typeof document.elementFromPoint;
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 5, clientY: 5 }));

    expect(app.wires).toContainEqual({ from: 'bass', to: 'wobble' });
    expect(app.wires).not.toContainEqual({ from: 'bass', to: 'murk' });
    expect(app.wires).toHaveLength(OPENING_WIRES.length);
    expect(app.engine?.wires).toEqual([...app.wires]);
  });
});

// The board powering up (gt#88): built cold, and brought up a module at a time
// after the lever. Only the picture — the sound starts all at once, as it did.
describe('the board coming up', () => {
  const lampOf = (app: AppHandle, id: SourceId): string | undefined =>
    app.board.modules.get(id)?.element.querySelector<HTMLElement>('[data-part="lamp"]')?.style
      .background;
  const boxLamp = (app: AppHandle, id: ModifierId): string | undefined =>
    app.board.modifiers.get(id)?.element.querySelector<HTMLElement>('[data-part="lamp"]')?.style
      .background;
  /** The modules whose lamps are lit, in the engine's own order. */
  const lit = (app: AppHandle): SourceId[] =>
    SOURCE_IDS.filter((id) => lampOf(app, id) === signals.lampOn);
  const opensOn = SOURCE_IDS.filter((id) => OPENING_STATE.m[id].on);
  const core = (app: AppHandle, index: number): string =>
    app.wireLayer.element.querySelectorAll<SVGPathElement>('[data-wire]')[index]?.style.opacity ?? '';

  /** Throw the lever and run to the moment it bottoms out: the engine is built. */
  const bottomOut = (app: AppHandle): void => {
    app.wake.pull();
    vi.advanceTimersByTime(WAKE.startMs);
  };

  it('is dark before the lever: switched on, and not yet lit', () => {
    const { app } = build();

    expect(lit(app)).toEqual([]);
    // The switches say which modules are on. Only the light is missing.
    for (const id of opensOn) {
      const nub = app.board.modules.get(id)?.element.querySelector<HTMLElement>('[data-part="nub"]');
      const offNub = app.board.modules
        .get('chainsaw')
        ?.element.querySelector<HTMLElement>('[data-part="nub"]');
      expect(nub?.style.top, id).not.toBe(offNub?.style.top);
    }
    // No box is lit and no cable is carrying anything.
    for (const id of MODIFIER_IDS) expect(boxLamp(app, id), id).toBe(signals.lampOff);
    expect(OPENING_WIRES.map((_, index) => core(app, index))).not.toContain('');
  });

  it('brings the first module up while the overlay is still lifting', () => {
    const { app } = build();
    bottomOut(app);
    expect(lit(app)).toEqual([]);

    vi.advanceTimersByTime(BOOT.firstMs);

    // THE FOUNDATION first: it is what everything else stands on.
    expect(lit(app)).toEqual(['guitar']);
    expect(app.wake.element.parentNode).not.toBeNull();
    expect(BOOT.firstMs).toBeLessThan(WAKE.fadeMs);
  });

  it('lights a box when the first thing feeding it comes up, and its cable with it', () => {
    const { app } = build();
    bottomOut(app);
    vi.advanceTimersByTime(BOOT.firstMs);

    // GUITAR WALL is up. GRIT is fed by it and CAVERN by GRIT; MURK is BASS's.
    expect(boxLamp(app, 'grit')).toBe(signals.lampOn);
    expect(boxLamp(app, 'cavern')).toBe(signals.lampOn);
    expect(boxLamp(app, 'murk')).toBe(signals.lampOff);
    const cable = (from: string): number => OPENING_WIRES.findIndex((wire) => wire.from === from);
    expect(core(app, cable('guitar'))).toBe('');
    expect(core(app, cable('bass'))).not.toBe('');
  });

  it('brings the rest up one at a time, well by well, and then it is over', () => {
    const { app } = build();
    bottomOut(app);
    const seen: SourceId[][] = [];
    for (let ms = 0; ms <= WAKE.fadeMs + BOOTED_MS; ms += 10) {
      const now = lit(app);
      if (now.length !== (seen[seen.length - 1]?.length ?? 0)) seen.push(now);
      vi.advanceTimersByTime(10);
    }

    // One more each time, never two at once, in the order the wells are named.
    expect(seen.map((step) => step.length)).toEqual(opensOn.map((_, index) => index + 1));
    const order = seen.map((step, index) => step.find((id) => !(seen[index - 1] ?? []).includes(id)));
    expect(order).toEqual(['guitar', 'bass', 'slowhit', 'cymbal']);
    expect(lit(app).sort()).toEqual([...opensOn].sort());
  });

  it('has nothing in flight across the frame the engine does its put-off work in', () => {
    // gt#21's long frame is at the moment the overlay goes. No module comes up in
    // the stretch before it that a 0.3s fade would still be running through,
    // and none until `afterDoneMs` after it.
    const { app } = build();
    bottomOut(app);
    vi.advanceTimersByTime(WAKE.fadeMs - 320);
    const before = lit(app).length;

    vi.advanceTimersByTime(320 + BOOT.afterDoneMs - 1);
    expect(lit(app).length).toBe(before);

    vi.advanceTimersByTime(1);
    expect(lit(app).length).toBe(before + 1);
  });

  it('flashes each plate as it comes up', () => {
    const { app } = build();
    const flash = (id: SourceId): number =>
      Number(
        app.board.modules.get(id)?.element.querySelector<HTMLElement>('[data-part="flash"]')?.style
          .opacity || '0',
      );
    bottomOut(app);
    vi.advanceTimersByTime(BOOT.firstMs);

    expect(flash('guitar')).toBeGreaterThan(0);
    expect(flash('bass')).toBe(0);
  });

  it('is only the picture: the engine has every source on from the moment it is built', () => {
    const { app } = build();
    bottomOut(app);

    expect(lit(app)).toEqual([]);
    for (const id of opensOn) expect(app.engine?.sources[id]?.on, id).toBe(true);
  });

  it('is finished inside two and a half seconds of the lever bottoming out', () => {
    const { app } = build();
    bottomOut(app);

    vi.advanceTimersByTime(2500);

    expect(lit(app).sort()).toEqual([...opensOn].sort());
    expect(WAKE.fadeMs + BOOTED_MS).toBeLessThanOrEqual(2600);
  });

  it('stops waiting the moment a hand is on the board', () => {
    const { app } = build();
    bottomOut(app);
    vi.advanceTimersByTime(WAKE.fadeMs);
    expect(lit(app).length).toBeLessThan(opensOn.length);

    // Somebody switches CHAINSAW on. Everything that was due comes up with it.
    app.board.modules.get('chainsaw')?.element.querySelector<HTMLElement>('[data-part="power"]')?.click();

    expect(lit(app).sort()).toEqual([...opensOn, 'chainsaw'].sort());
    // And nothing is left on a timer to light it a second time, or dim it.
    vi.advanceTimersByTime(BOOTED_MS);
    expect(lit(app).sort()).toEqual([...opensOn, 'chainsaw'].sort());
  });

  it('does not hold the hammer up either', () => {
    const { app } = build();
    bottomOut(app);
    vi.advanceTimersByTime(WAKE.fadeMs);
    const everything = vi.spyOn(Math, 'random').mockReturnValue(0);

    app.board.element
      .querySelector<HTMLElement>('[data-part="smash"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    vi.advanceTimersByTime(SMASH.swingMs);
    everything.mockRestore();

    // Whatever the blow left switched on is lit, at once.
    const on = SOURCE_IDS.filter((id) => app.engine?.sources[id]?.on);
    expect(on.length).toBeGreaterThan(0);
    expect(lit(app).sort()).toEqual([...on].sort());
  });

  it('never runs on a stilled board, which is simply on', () => {
    const { app } = build({ prefersReducedMotion: true });
    expect(app.stillness.still).toBe(true);

    bottomOut(app);

    expect(lit(app).sort()).toEqual([...opensOn].sort());
    const flashing = opensOn.filter(
      (id) =>
        Number(
          app.board.modules.get(id)?.element.querySelector<HTMLElement>('[data-part="flash"]')?.style
            .opacity || '0',
        ) > 0,
    );
    expect(flashing).toEqual([]);
  });

  it('is cut short by STILLNESS part way through', () => {
    const { app } = build();
    bottomOut(app);
    vi.advanceTimersByTime(BOOT.firstMs);
    expect(lit(app).length).toBe(1);

    app.stillness.set(true);

    expect(lit(app).sort()).toEqual([...opensOn].sort());
  });

  it('leaves nothing on a timer when the page is torn down mid-sequence', () => {
    const { app } = build();
    bottomOut(app);
    vi.advanceTimersByTime(BOOT.firstMs);

    app.destroy();
    live.splice(live.indexOf(app), 1);

    expect(() => vi.advanceTimersByTime(WAKE.doneMs + BOOTED_MS)).not.toThrow();
  });
});
