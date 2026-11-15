// @vitest-environment happy-dom
//
// The one switch on the board that is about the user rather than the sound, and
// the two things about it that are decidable: where it opens, and what it
// refuses to touch.
//
// Where it opens is the whole of the file's judgement — a stored choice, the
// system's request, and the order those two are consulted in — so it is checked
// against the three states separately rather than through a round trip. What it
// refuses to touch is checked in the app suite, where there is an engine to
// refuse: this file has none, which is itself the point of the module.

import { afterEach, describe, expect, it } from 'vitest';
import {
  createStillness,
  readStill,
  REDUCED_MOTION,
  stillAt,
  STILL_KEY,
  STILL_VALUE,
  STILL_VAR,
} from '../src/stillness';
import type { StillnessHandle, StillStore } from '../src/stillness';

const live: StillnessHandle[] = [];

/**
 * A store that is just a string, in the shape ./weathering.test.ts uses — with
 * one addition: it can be told to throw on either call. A store that throws is
 * three lines to write and impossible to arrange out of the real `localStorage`.
 */
interface FakeStore extends StillStore {
  held: string | null;
}

function fakeStore(seed: string | null = null, throws: 'read' | 'write' | null = null): FakeStore {
  const store: FakeStore = {
    held: seed,
    getItem: () => {
      if (throws === 'read') throw new Error('unreadable');
      return store.held;
    },
    setItem: (_key, value) => {
      if (throws === 'write') throw new Error('quota');
      store.held = value;
    },
  };
  return store;
}

function build(spec: Parameters<typeof createStillness>[0] = {}): StillnessHandle {
  const handle = createStillness({ prefersReduced: false, store: null, ...spec });
  live.push(handle);
  return handle;
}

/** What the page currently says. Anything at all may read this. */
const published = (): string => document.body.style.getPropertyValue(STILL_VAR);

afterEach(() => {
  for (const handle of live.splice(0)) handle.destroy();
  document.body.removeAttribute('style');
});

describe('where the switch opens', () => {
  it('takes the system at its word when nothing has been chosen', () => {
    expect(stillAt(null, true)).toBe(true);
    expect(stillAt(null, false)).toBe(false);
    expect(build({ prefersReduced: true }).still).toBe(true);
  });

  it('lets an explicit choice beat the system, in both directions', () => {
    // The half that is easy to get wrong: someone who has turned the motion back
    // on has said something more specific than their OS did, and overriding them
    // on every reload would be the switch refusing to be a switch.
    expect(stillAt(false, true)).toBe(false);
    expect(stillAt(true, false)).toBe(true);
    expect(build({ prefersReduced: true, store: fakeStore(STILL_VALUE.off) }).still).toBe(false);
    expect(build({ prefersReduced: false, store: fakeStore(STILL_VALUE.on) }).still).toBe(true);
  });

  it('tells "never chosen" apart from "chosen to keep moving"', () => {
    // Null rather than false, because only the first defers to the system. A
    // store returning nothing and a store returning "0" are different answers.
    expect(readStill(fakeStore(null))).toBe(null);
    expect(readStill(fakeStore(STILL_VALUE.off))).toBe(false);
    expect(readStill(fakeStore(STILL_VALUE.on))).toBe(true);
    expect(readStill(null)).toBe(null);
  });

  it('treats a hand-edited value as nothing chosen rather than as a guess', () => {
    for (const held of ['', 'true', 'yes', '{}', '2']) {
      expect(readStill(fakeStore(held)), held).toBe(null);
    }
    // And so a page whose blob someone has edited still opens the way their
    // system asked, which is the safer of the two ways to be wrong.
    expect(build({ prefersReduced: true, store: fakeStore('yes') }).still).toBe(true);
  });

  it('asks the media query by name when the caller says nothing', () => {
    // The query itself is the contract with the platform, so it is pinned rather
    // than left to a spelling nobody would notice was wrong.
    expect(REDUCED_MOTION).toBe('(prefers-reduced-motion: reduce)');
  });
});

describe('what it writes', () => {
  it('says so on the page before anything has had a chance to move', () => {
    // Written at construction, not on the first frame: a board that opens stilled
    // is stilled on its first paint. Same rule as ../src/weathering's `--weather`.
    build({ prefersReduced: true });
    expect(published()).toBe(STILL_VALUE.on);
  });

  it('publishes both states, so anything added later can answer it in CSS', () => {
    const handle = build();
    expect(published()).toBe(STILL_VALUE.off);

    handle.toggle();
    expect(published()).toBe(STILL_VALUE.on);

    handle.toggle();
    expect(published()).toBe(STILL_VALUE.off);
  });

  it('persists a choice the moment it is made', () => {
    const store = fakeStore();
    const handle = build({ store });

    handle.set(true);
    expect(store.held).toBe(STILL_VALUE.on);
    // And a fresh switch over the same store opens where the last one left off,
    // whatever the system says.
    expect(build({ store, prefersReduced: false }).still).toBe(true);
  });

  it('keeps the stored choice when the page is torn down', () => {
    const store = fakeStore();
    const handle = build({ store });
    handle.set(true);

    handle.destroy();

    // The variable goes; the choice does not. A closed tab is not someone
    // changing their mind.
    expect(published()).toBe('');
    expect(store.held).toBe(STILL_VALUE.on);
  });

  it('says nothing twice, and calls back only on a real move', () => {
    const seen: boolean[] = [];
    const handle = build({ onChange: (still) => seen.push(still) });

    handle.set(false);
    expect(seen).toEqual([]);

    handle.set(true);
    handle.set(true);
    expect(seen).toEqual([true]);

    expect(handle.toggle()).toBe(false);
    expect(seen).toEqual([true, false]);
  });
});

describe('when the storage will not have it', () => {
  it('opens on the system’s answer with no store at all', () => {
    expect(build({ store: null, prefersReduced: true }).still).toBe(true);
    expect(build({ store: null, prefersReduced: false }).still).toBe(false);
  });

  it('falls back to the system when the store throws on the way in', () => {
    // The one way this fails differently from ../src/weathering: an unreadable
    // store lands on what the *system* asked for, so a page that cannot remember
    // anything still opens stilled for someone who needs it to.
    expect(build({ store: fakeStore(null, 'read'), prefersReduced: true }).still).toBe(true);
  });

  it('keeps working when the store throws on the way out', () => {
    const handle = build({ store: fakeStore(null, 'write') });

    expect(() => handle.set(true)).not.toThrow();
    // The session keeps its choice; only the next one opens on the system again.
    expect(handle.still).toBe(true);
    expect(published()).toBe(STILL_VALUE.on);
  });

  it('keeps its own key, apart from the weathering blob', () => {
    // Two keys rather than two fields, because grime is accumulated *by* a
    // session and this is chosen *for* one — and because SCRUB THE ALTAR resets
    // the first and must never reach the second.
    const store = fakeStore();
    build({ store }).set(true);
    expect(STILL_KEY).not.toBe('droneEngineWearV2');
    expect(store.held).toBe(STILL_VALUE.on);
  });
});
