// @vitest-environment happy-dom
//
// The slowest loop in the product, tested at the only speed it can be: fake
// timers. Everything here is about the two numbers that outlive the page —
// what they do to `--weather`, what survives a reload, and what happens when
// the browser refuses to keep them.
//
// The store is injected rather than reached for. That is not only isolation:
// "a private-mode failure must be silent, not fatal" is a claim about a store
// that throws, and a store that throws is three lines to write and impossible
// to arrange out of the real `localStorage`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWeathering,
  minutesFor,
  readBlob,
  weatherAt,
  WEATHER,
  WEATHER_KEY,
  WEATHER_VAR,
} from '../src/weathering';
import type { WeatherStore, WeatheringHandle } from '../src/weathering';

const live: WeatheringHandle[] = [];

/** A store that is just a string, so a suite can read the blob back verbatim. */
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

/** The blob as it would have been left by a previous session. */
const blobOf = (wear: Record<string, number>, runtime: number, dents = 0): string =>
  JSON.stringify({ wear, runtime, dents });

/** A clean board, which is what every read below that fails arrives at. */
const CLEAN = { wear: {}, runtime: 0, dents: 0 };

function build(spec: Parameters<typeof createWeathering>[0] = {}): WeatheringHandle {
  const handle = createWeathering(spec);
  live.push(handle);
  return handle;
}

/** What `--weather` currently reads on the body, which is where it is written. */
const published = (): string => document.body.style.getPropertyValue(WEATHER_VAR);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const handle of live.splice(0)) handle.destroy();
  vi.useRealTimers();
  document.body.style.removeProperty(WEATHER_VAR);
});

describe('the arithmetic', () => {
  it('is runtime over the minutes asked for, and never past 1', () => {
    expect(weatherAt(0, 18)).toBe(0);
    expect(weatherAt(9 * 60, 18)).toBeCloseTo(0.5);
    expect(weatherAt(18 * 60, 18)).toBe(1);
    expect(weatherAt(400 * 60, 18)).toBe(1);
    // Nothing downstream should ever be handed a negative opacity multiplier.
    expect(weatherAt(-500, 18)).toBe(0);
  });

  it('defaults to 18 minutes and clamps the setting to 3–60', () => {
    expect(WEATHER.defaultMinutes).toBe(18);
    expect(minutesFor()).toBe(18);
    expect(minutesFor(30)).toBe(30);
    expect(minutesFor(1)).toBe(WEATHER.minMinutes);
    expect(minutesFor(9000)).toBe(WEATHER.maxMinutes);
    expect(minutesFor(Number.NaN)).toBe(WEATHER.defaultMinutes);
    // The clamp is the whole point of the setting being a range: three minutes
    // of runtime is a fully rusted board, and there is no faster than that.
    expect(weatherAt(WEATHER.minMinutes * 60, 1)).toBe(1);
  });
});

describe('the variable', () => {
  it('is written at construction, before any clock exists', () => {
    build({ store: fakeStore(blobOf({}, 9 * 60)), minutes: 18 });
    expect(published()).toBe('0.500');
  });

  it('is written to three decimals, the precision the reference publishes', () => {
    expect(WEATHER.digits).toBe(3);
    build({ store: fakeStore(blobOf({}, 100)), minutes: 18 });
    expect(published()).toBe(weatherAt(100, 18).toFixed(3));
  });

  it('is dropped on destroy, so a torn-down board leaves nothing behind', () => {
    const handle = createWeathering({ store: fakeStore(blobOf({}, 600)) });
    expect(published()).not.toBe('');
    handle.destroy();
    expect(published()).toBe('');
  });
});

describe('the clock', () => {
  it('does not run until it is started', () => {
    const handle = build({ store: fakeStore() });
    vi.advanceTimersByTime(WEATHER.tickMs * 10);
    expect(handle.runtime).toBe(0);
  });

  it('adds five seconds a tick and republishes as it goes', () => {
    const handle = build({ store: fakeStore(), minutes: 3 });
    handle.start();

    vi.advanceTimersByTime(WEATHER.tickMs);
    expect(handle.runtime).toBe(WEATHER.tickSeconds);
    expect(published()).toBe(weatherAt(WEATHER.tickSeconds, 3).toFixed(3));

    vi.advanceTimersByTime(WEATHER.tickMs * 5);
    expect(handle.runtime).toBe(WEATHER.tickSeconds * 6);
  });

  it('runs one clock however many times it is started', () => {
    const handle = build({ store: fakeStore() });
    handle.start();
    handle.start();
    handle.start();
    vi.advanceTimersByTime(WEATHER.tickMs);
    expect(handle.runtime).toBe(WEATHER.tickSeconds);
  });

  it('stops on destroy', () => {
    const handle = build({ store: fakeStore() });
    handle.start();
    vi.advanceTimersByTime(WEATHER.tickMs);
    handle.destroy();
    vi.advanceTimersByTime(WEATHER.tickMs * 20);
    expect(handle.runtime).toBe(WEATHER.tickSeconds);
  });

  it('persists every tick, so a closed tab keeps the minutes it ran', () => {
    const store = fakeStore();
    const handle = build({ store });
    handle.start();
    vi.advanceTimersByTime(WEATHER.tickMs * 3);
    expect(JSON.parse(store.held ?? '{}')).toEqual({
      wear: {},
      runtime: WEATHER.tickSeconds * 3,
      dents: 0,
    });
  });
});

describe('wear', () => {
  it('counts one per completed drag, per key', () => {
    const handle = build({ store: fakeStore() });
    handle.commit('guitar.char');
    handle.commit('guitar.char');
    handle.commit('g.seriousness');
    expect(handle.wear).toEqual({ 'guitar.char': 2, 'g.seriousness': 1 });
  });

  it('announces the new count so one halo can be redrawn', () => {
    const seen: [string, number][] = [];
    const handle = build({ store: fakeStore(), onWear: (key, turns) => seen.push([key, turns]) });
    handle.commit('mods.grit');
    handle.commit('mods.grit');
    expect(seen).toEqual([
      ['mods.grit', 1],
      ['mods.grit', 2],
    ]);
  });

  it('persists on the drag rather than waiting for the next tick', () => {
    const store = fakeStore();
    const handle = build({ store });
    handle.commit('bass.loud');
    expect(JSON.parse(store.held ?? '{}')).toEqual({
      wear: { 'bass.loud': 1 },
      runtime: 0,
      dents: 0,
    });
  });

  it('carries on from what the last session left', () => {
    const handle = build({ store: fakeStore(blobOf({ 'cow.often': 7 }, 120)) });
    expect(handle.wear).toEqual({ 'cow.often': 7 });
    expect(handle.runtime).toBe(120);
    handle.commit('cow.often');
    expect(handle.wear['cow.often']).toBe(8);
  });
});

describe('SCRUB THE ALTAR', () => {
  it('takes every counter to zero and says so on the spot', () => {
    const store = fakeStore(blobOf({ 'guitar.char': 20 }, 600, 5));
    const handle = build({ store });
    handle.start();
    vi.advanceTimersByTime(WEATHER.tickMs);

    handle.scrub();
    expect(handle.wear).toEqual({});
    expect(handle.runtime).toBe(0);
    expect(handle.weather).toBe(0);
    expect(handle.dents).toBe(0);
    expect(published()).toBe('0.000');
    expect(JSON.parse(store.held ?? '{}')).toEqual(CLEAN);
  });

  it('says the marks are gone, and only where there were any', () => {
    // The halos fade off controls nobody is looking at; the plate has holes in
    // it, in the middle of the screen. This is the one part of a scrub anybody
    // watches happen, which is the whole reason gt#40 wanted dents.
    const seen: number[] = [];
    const dented = build({ store: fakeStore(blobOf({}, 0, 3)), onDents: (n) => seen.push(n) });
    dented.scrub();
    expect(seen).toEqual([0]);

    const clean = build({ store: fakeStore(), onDents: (n) => seen.push(n) });
    clean.scrub();
    expect(seen).toEqual([0]);
  });

  it('cleans every halo that was showing something, and no others', () => {
    const seen: [string, number][] = [];
    const handle = build({
      store: fakeStore(blobOf({ 'guitar.char': 4, 'mods.murk': 9 }, 0)),
      onWear: (key, turns) => seen.push([key, turns]),
    });
    handle.scrub();
    expect(seen).toEqual([
      ['guitar.char', 0],
      ['mods.murk', 0],
    ]);
  });

  it('leaves the clock running — the board is new, not stopped', () => {
    const handle = build({ store: fakeStore() });
    handle.start();
    vi.advanceTimersByTime(WEATHER.tickMs * 4);
    handle.scrub();
    vi.advanceTimersByTime(WEATHER.tickMs * 2);
    expect(handle.runtime).toBe(WEATHER.tickSeconds * 2);
  });
});

describe('the blob', () => {
  it('is keyed droneEngineWearV2 still, and holds exactly wear, runtime and dents', () => {
    // The key is deliberately not bumped for the third field (gt#40). A blob from
    // before it simply has no dents in it, which reads as a board nobody has hit
    // — true, and the one thing a returning user would expect. Bumping it would
    // have thrown away their grime to add a zero.
    expect(WEATHER_KEY).toBe('droneEngineWearV2');
    const store = fakeStore();
    const handle = build({ store });
    handle.commit('sax.char');
    expect(Object.keys(JSON.parse(store.held ?? '{}')).sort()).toEqual([
      'dents',
      'runtime',
      'wear',
    ]);
  });

  it('reads a board from before the hammer as one nobody has hit', () => {
    expect(readBlob(fakeStore('{"wear":{"cow.often":3},"runtime":90}'))).toEqual({
      wear: { 'cow.often': 3 },
      runtime: 90,
      dents: 0,
    });
  });

  it('reads a clean board out of anything it cannot use', () => {
    expect(readBlob(null)).toEqual(CLEAN);
    expect(readBlob(fakeStore())).toEqual(CLEAN);
    expect(readBlob(fakeStore('{not json'))).toEqual(CLEAN);
    expect(readBlob(fakeStore('"a string"'))).toEqual(CLEAN);
    expect(readBlob(fakeStore('null'))).toEqual(CLEAN);
    expect(readBlob(fakeStore('{}'))).toEqual(CLEAN);
  });

  it('drops counts a hand could have edited into something unusable', () => {
    // Written out rather than stringified, because the point is the shapes
    // JSON.stringify would never have produced in the first place.
    const held =
      '{"wear":{"good":6,"negative":-3,"zero":0,"fractional":2.7,' +
      '"text":"lots","nothing":null,"nested":{"turns":4}},"runtime":0}';
    expect(readBlob(fakeStore(held)).wear).toEqual({ good: 6, fractional: 2 });
  });

  it('refuses a runtime that would make the board rust backwards', () => {
    expect(readBlob(fakeStore(blobOf({}, -900))).runtime).toBe(0);
    expect(readBlob(fakeStore('{"runtime":"soon"}')).runtime).toBe(0);
  });

  it('refuses a dent count that is not a number of dents', () => {
    // Through the same filter the runtime goes through, and then floored: a
    // negative would come out the far end as a loop that never runs, and a
    // fraction as half a mark, neither of which anybody could trace back to a
    // hand-edited blob.
    expect(readBlob(fakeStore(blobOf({}, 0, -4))).dents).toBe(0);
    expect(readBlob(fakeStore('{"dents":"lots"}')).dents).toBe(0);
    expect(readBlob(fakeStore('{"dents":null}')).dents).toBe(0);
    expect(readBlob(fakeStore('{"dents":2.9}')).dents).toBe(2);
  });
});

describe('the hammer', () => {
  it('counts one mark per blow and persists it on the spot', () => {
    // The same bargain a completed drag makes: a mark you have to keep the tab
    // open to keep is not a mark.
    const store = fakeStore();
    const handle = build({ store });
    handle.hit();
    handle.hit();
    expect(handle.dents).toBe(2);
    expect(JSON.parse(store.held ?? '{}').dents).toBe(2);
  });

  it('announces the new count so the plate can be redrawn', () => {
    const seen: number[] = [];
    const handle = build({ store: fakeStore(), onDents: (n) => seen.push(n) });
    handle.hit();
    handle.hit();
    handle.hit();
    expect(seen).toEqual([1, 2, 3]);
  });

  it('carries on from what the last session left', () => {
    const handle = build({ store: fakeStore(blobOf({}, 60, 6)) });
    expect(handle.dents).toBe(6);
    handle.hit();
    expect(handle.dents).toBe(7);
  });

  it('does not age the board, and the clock does not mark it', () => {
    // The two halves of this file count different things and neither is the
    // other: a blow is not a minute, and a minute is not a blow.
    const handle = build({ store: fakeStore() });
    handle.start();
    vi.advanceTimersByTime(WEATHER.tickMs * 3);
    expect(handle.dents).toBe(0);

    handle.hit();
    expect(handle.runtime).toBe(WEATHER.tickSeconds * 3);
    expect(handle.wear).toEqual({});
  });
});

describe('a store that will not cooperate', () => {
  const angry = (): WeatherStore => ({
    getItem(): string | null {
      throw new Error('private mode');
    },
    setItem(): void {
      throw new Error('quota exceeded');
    },
  });

  it('opens a clean board rather than failing', () => {
    const handle = build({ store: angry() });
    expect(handle.wear).toEqual({});
    expect(handle.runtime).toBe(0);
    expect(published()).toBe('0.000');
  });

  it('takes drags and ticks without ever throwing', () => {
    const handle = build({ store: angry() });
    handle.start();
    expect(() => {
      handle.commit('guitar.char');
      vi.advanceTimersByTime(WEATHER.tickMs * 2);
      handle.scrub();
    }).not.toThrow();
    // The session still has its own grime; only the next one starts clean.
    handle.commit('bass.loud');
    expect(handle.wear).toEqual({ 'bass.loud': 1 });
  });

  it('works with no store at all', () => {
    const handle = build({ store: null });
    handle.start();
    handle.commit('cymbal.loud');
    vi.advanceTimersByTime(WEATHER.tickMs);
    expect(handle.wear).toEqual({ 'cymbal.loud': 1 });
    expect(handle.runtime).toBe(WEATHER.tickSeconds);
  });
});

describe('the handoff', () => {
  it('still says what this file is built to', () => {
    // The four numbers the issue and the README both state outright.
    expect(WEATHER.tickMs).toBe(5000);
    expect(WEATHER.tickSeconds).toBe(5);
    expect(WEATHER.defaultMinutes).toBe(18);
    expect([WEATHER.minMinutes, WEATHER.maxMinutes]).toEqual([3, 60]);
  });
});
