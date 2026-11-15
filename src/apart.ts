// The arm for the advanced-effects shelf (gt#39): one latch that decides whether
// the board is allowed to come apart at all.
//
// **Everything on the shelf is off until this is pressed, and that is the whole
// reason this file exists as a separate thing rather than as a flag inside the
// effects.** gt#39's first rule is that the board's first impression is the
// restrained one — the wash, the vignette and the grain of gt#16, and nothing
// sharper. A shelf gated by a variable somewhere inside the layer that draws it
// would keep that promise for exactly as long as nobody edited that layer. Gated
// here, the promise is a property of a file that draws nothing.
//
// It is the sibling of ./stillness and reads like one on purpose, but the three
// differences are the interesting part:
//
// - **There is no system default, and there is no media query.** ./stillness
//   opens stilled for someone whose OS asked for reduced motion, because that
//   request is about them. Nothing about a person's system says "I would like the
//   screen to tear", so there is nothing to defer to: this opens off, always,
//   unless a previous session explicitly armed it. The absence of a
//   `prefersReduced` here is the decision, not an omission.
// - **STILLNESS outranks it and this file does not know that.** A stilled board
//   shows none of the shelf however this latch stands, and that is enforced where
//   the two meet — ../app holds both switches, the way it already holds
//   everything neither half owns. Teaching this file about the other one would
//   give two switches an opinion about each other and no single place to read the
//   answer off.
// - **It arms rather than draws.** Like ./weathering and ./stillness it owns no
//   DOM and no engine: one custom property on the page and one callback. What
//   actually comes apart is ../ui/rupture's business, and {@link APART_VAR} is
//   published so that anything added later can answer it in CSS without this file
//   being told it exists.
//
// The storage rules are ./stillness's, for the same reasons, with one inversion:
// every failure here falls back to **off**. An unreadable store leaves a board
// that works and forgets, and the thing it forgets is an effect nobody has asked
// for in this session — which is the safe direction for a shelf whose contents
// include a full-screen flash.

/** The one custom property this file owns, and the only one it writes. */
export const APART_VAR = '--apart';

/** The single key the choice is kept under. Its own, like ../stillness's. */
export const APART_KEY = 'droneEngineApartV1';

/** What {@link APART_VAR} says in each state. `1` is armed. */
export const APART_VALUE = { on: '1', off: '0' } as const;

/**
 * The half of `localStorage` this file uses. Narrow for the reason
 * ../stillness's {@link StillStore} is narrow, and declared separately rather
 * than imported for the same reason: it is this file's whole contract with a
 * store, so a suite can supply three lines. The two are structurally identical,
 * so one real `localStorage` satisfies both.
 */
export interface ApartStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ApartSpec {
  /**
   * Where the choice is kept. Defaults to this page's `localStorage` if it has
   * one it is allowed to touch, and to nothing at all if it does not.
   */
  readonly store?: ApartStore | null;

  /** The switch moved. Everything on the shelf is told from here. */
  readonly onChange?: (armed: boolean) => void;
}

export interface ApartHandle {
  /** Whether the shelf is currently armed. */
  readonly armed: boolean;

  /** Set it outright. A no-op if it is already there — no callback, no write. */
  set(armed: boolean): void;

  /** The tape was pressed. Returns where it landed. */
  toggle(): boolean;

  /** Drop the variable. The stored choice is left where it is. */
  destroy(): void;
}

/** This page's `localStorage`, if it has one and is allowed to reach it. */
function pageStore(): ApartStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Reaching for it is itself what throws in some privacy modes.
    return null;
  }
}

/**
 * Whether a stored value arms the shelf. **Only the exact on-value does**, and
 * that asymmetry is the point: ../stillness distinguishes "never chosen" from
 * "chosen off" because the first defers to the system, and here there is no
 * system to defer to. Missing, empty, hand-edited, corrupt — every one of them
 * is off, which is the same answer a board that has never been armed gives.
 */
export function armedAt(stored: string | null): boolean {
  return stored === APART_VALUE.on;
}

/** The stored choice, or off wherever it cannot be read. */
export function readApart(store: ApartStore | null): boolean {
  if (!store) return false;
  try {
    return armedAt(store.getItem(APART_KEY));
  } catch {
    return false;
  }
}

/**
 * Build the arm, carrying whatever the last session left — and off if it left
 * nothing. The variable is written here, so a board that opens armed is armed on
 * its first paint rather than on its first frame.
 */
export function createApart(spec: ApartSpec = {}): ApartHandle {
  const store = spec.store === undefined ? pageStore() : spec.store;

  let armed = readApart(store);

  /** Written to the page, because anything at all may want to answer it. */
  function publish(): void {
    document.body.style.setProperty(APART_VAR, armed ? APART_VALUE.on : APART_VALUE.off);
  }

  function persist(): void {
    if (!store) return;
    try {
      store.setItem(APART_KEY, armed ? APART_VALUE.on : APART_VALUE.off);
    } catch {
      // A full quota is not worth a broken board. The session keeps its choice;
      // the next one opens on the restrained board again.
    }
  }

  /** The one way it moves. Named rather than inlined so `toggle` can reach it
   * without going back through the handle — a destructured `toggle` still works. */
  function set(next: boolean): void {
    if (next === armed) return;
    armed = next;
    publish();
    persist();
    spec.onChange?.(armed);
  }

  publish();

  return {
    get armed() {
      return armed;
    },
    set,
    toggle(): boolean {
      set(!armed);
      return armed;
    },
    destroy(): void {
      document.body.style.removeProperty(APART_VAR);
    },
  };
}
