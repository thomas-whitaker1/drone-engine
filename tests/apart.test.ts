// @vitest-environment happy-dom
//
// The arm for the advanced-effects shelf (gt#39), and the one property that is
// worth more than every other assertion in this file put together: **a board
// nobody has armed does not come apart.**
//
// That is checked here rather than in the layer that draws, because it is a fact
// about this module and not about any effect: every path into `createApart` that
// is not an explicit stored `1` — no store, empty store, a hand-edited value, a
// store that throws on read, a store that throws on write — has to land on off.
// A shelf whose contents include a full-screen flash cannot be one gate wide and
// then hope. So the gate is enumerated.
//
// The sibling property, that STILLNESS outranks this switch, is not checked here
// and cannot be: this module has never heard of it. It is the app suite's, where
// both switches exist at once.

import { afterEach, describe, expect, it } from 'vitest';
import {
  APART_KEY,
  APART_VALUE,
  APART_VAR,
  armedAt,
  createApart,
  readApart,
} from '../src/apart';
import type { ApartHandle, ApartStore } from '../src/apart';

const live: ApartHandle[] = [];

/** A store that is just a string, and can be told to throw on either call. */
interface FakeStore extends ApartStore {
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

/** An arm on a store this file controls. Never the page's own. */
function build(store: ApartStore | null = fakeStore()): ApartHandle {
  const handle = createApart({ store });
  live.push(handle);
  return handle;
}

const published = (): string => document.body.style.getPropertyValue(APART_VAR);

afterEach(() => {
  for (const handle of live.splice(0)) handle.destroy();
  document.body.style.removeProperty(APART_VAR);
});

describe('the arm for the shelf', () => {
  it('opens off on every board that has not explicitly been armed', () => {
    // The enumeration. Six ways to arrive with nothing chosen, and one answer.
    const ways: ReadonlyArray<readonly [string, ApartStore | null]> = [
      ['no store at all', null],
      ['an empty store', fakeStore(null)],
      ['an empty string', fakeStore('')],
      ['a hand-edited value', fakeStore('yes')],
      ['an explicit off', fakeStore(APART_VALUE.off)],
      ['a store that throws on read', fakeStore(APART_VALUE.on, 'read')],
    ];
    for (const [why, store] of ways) {
      const arm = build(store);
      expect(arm.armed, why).toBe(false);
      expect(published(), why).toBe(APART_VALUE.off);
    }
  });

  it('opens armed only on the exact stored on-value', () => {
    expect(build(fakeStore(APART_VALUE.on)).armed).toBe(true);
    expect(published()).toBe(APART_VALUE.on);
  });

  it('has no system default to defer to, unlike STILLNESS', () => {
    // The decision, stated as a check on the shape rather than on a value:
    // ../src/stillness takes `prefersReduced` because reduced motion is a request
    // about the person. Nothing a system can say is a request for the screen to
    // tear, so there is no second input here — and a page whose media query
    // answers yes to everything still opens this off.
    expect(readApart(null)).toBe(false);
    expect(armedAt(null)).toBe(false);
    expect(armedAt(APART_VALUE.off)).toBe(false);
    expect(armedAt(APART_VALUE.on)).toBe(true);
  });

  it('publishes the variable on the first paint, not on the first frame', () => {
    build(fakeStore(APART_VALUE.on));
    // No toggle, no frame, no callback — the value is on the page already.
    expect(published()).toBe(APART_VALUE.on);
  });

  it('persists a choice under its own key, not the weathering blob’s', () => {
    const store = fakeStore();
    const arm = build(store);
    expect(arm.toggle()).toBe(true);
    expect(store.held).toBe(APART_VALUE.on);
    expect(APART_KEY).not.toBe('droneEngineStillV1');

    expect(arm.toggle()).toBe(false);
    expect(store.held).toBe(APART_VALUE.off);
  });

  it('survives a store that cannot be written to, and forgets rather than throws', () => {
    const arm = build(fakeStore(null, 'write'));
    expect(() => arm.set(true)).not.toThrow();
    // The session keeps the choice; the next one opens on the restrained board.
    expect(arm.armed).toBe(true);
    expect(published()).toBe(APART_VALUE.on);
  });

  it('reports a move once, and a repeat not at all', () => {
    const moves: boolean[] = [];
    const arm = createApart({ store: fakeStore(), onChange: (armed) => moves.push(armed) });
    live.push(arm);

    arm.set(true);
    arm.set(true);
    arm.toggle();
    expect(moves).toEqual([true, false]);
  });

  it('keeps a destructured toggle working', () => {
    const { toggle } = build();
    expect(toggle()).toBe(true);
    expect(toggle()).toBe(false);
  });

  it('drops the variable on destroy and leaves the stored choice alone', () => {
    const store = fakeStore();
    const arm = createApart({ store });
    arm.set(true);
    arm.destroy();
    expect(published()).toBe('');
    // A torn-down page is not someone changing their mind.
    expect(store.held).toBe(APART_VALUE.on);
  });

  it('owns no DOM and no engine — one variable and one callback, like STILLNESS', () => {
    const before = document.body.childElementCount;
    const arm = build();
    arm.set(true);
    expect(document.body.childElementCount).toBe(before);
    expect(Object.keys(arm).sort()).toEqual(['armed', 'destroy', 'set', 'toggle']);
  });
});
