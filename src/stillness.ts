// The one control on the board that is about the user rather than about the
// sound: a switch that pins every moving thing on screen at once.
//
// **The boundary is the whole of this file, and it is a boundary in one
// direction only: this switch stops things that move on screen, and never
// changes what comes out of the speakers.** That is the arrow src/ui/atmosphere
// keeps, said from the other side — the visuals read audio state and never write
// it, and here the user's own preference about the visuals does not reach the
// audio either. It is worth stating rather than assuming, because "stops the
// board moving" naturally reads as though it should catch anything that moves,
// and a switch that silently froze someone's sound when they asked for a still
// screen would be a genuinely confusing bug to track down. Anything that drifts
// a parameter value is changing the *sound*; it is not this switch's business,
// however much it looks like motion from the outside. If such a thing ever turns
// a knob on screen, that motion is this switch's business and the drift
// underneath it still is not.
//
// Four more things about it are decisions rather than implementation details:
//
// - **It owns no DOM and no engine.** Like ../weathering, it writes one custom
//   property and calls one callback. What actually stops moving is decided by
//   the things that move — the atmosphere's frame loop, the bloom layer, the
//   grain's own keyframes — and {@link STILL_VAR} is on the page so that anything
//   added later can answer it in CSS without this file being told.
// - **Reduced motion is the default, not the answer.** A page whose owner has
//   asked their system for reduced motion opens stilled, every time, with nothing
//   stored. But a stored choice always wins: someone who has explicitly turned
//   the motion back on has said something more specific than their OS did, and
//   overriding them every reload would be the switch refusing to be a switch.
// - **It persists, and it is the second thing that does.** ../weathering used to
//   be the only state in the product that outlived the page. It keeps its own
//   blob and this keeps its own key, because the two are not the same kind of
//   thing: grime is accumulated *by* the session and this is chosen *for* it, and
//   a preference living inside the wear blob would be scrubbed by SCRUB THE
//   ALTAR, which resets the board's grime and must not reset a person's
//   accessibility setting.
// - **Every storage failure is silent**, for the reason ../weathering's are: a
//   full quota or a private-mode throw leaves a board that works and forgets,
//   which is always better than an exception. The one difference is which way it
//   fails — an unreadable store falls back to what the *system* asked for, so a
//   page that cannot remember anything still opens stilled for someone who needs
//   it to.

/** The one custom property this file owns, and the only one it writes. */
export const STILL_VAR = '--still';

/** The single key the choice is kept under. Its own, not the weathering blob's. */
export const STILL_KEY = 'droneEngineStillV1';

/** The query that decides the default when nothing has been chosen. */
export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** What {@link STILL_VAR} says in each state. `1` is stilled. */
export const STILL_VALUE = { on: '1', off: '0' } as const;

/**
 * The half of `localStorage` this file uses. Narrow for the reason
 * ../weathering's {@link WeatherStore} is narrow, and declared separately rather
 * than imported for the same reason: it is this file's whole contract with a
 * store, so a suite can supply three lines, and the two files stay able to move
 * apart. They are structurally identical, so one real `localStorage` satisfies
 * both.
 */
export interface StillStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StillnessSpec {
  /**
   * Where the choice is kept. Defaults to this page's `localStorage` if it has
   * one it is allowed to touch, and to nothing at all if it does not.
   */
  readonly store?: StillStore | null;

  /**
   * Whether this page has been asked for reduced motion. Defaults to what the
   * media query says. Passed in so a suite can state it rather than mock a
   * global, and so a caller that already knows need not ask twice.
   */
  readonly prefersReduced?: boolean;

  /** The switch moved. Everything that moves on screen is told from here. */
  readonly onChange?: (still: boolean) => void;
}

export interface StillnessHandle {
  /** Whether the board is currently pinned. */
  readonly still: boolean;

  /** Set it outright. A no-op if it is already there — no callback, no write. */
  set(still: boolean): void;

  /** The tape was pressed. Returns where it landed. */
  toggle(): boolean;

  /** Drop the variable. The stored choice is left where it is. */
  destroy(): void;
}

/** This page's `localStorage`, if it has one and is allowed to reach it. */
function pageStore(): StillStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Reaching for it is itself what throws in some privacy modes.
    return null;
  }
}

/**
 * Whether this page has been asked for reduced motion. False wherever the
 * question cannot be asked — a page with no `matchMedia` is not a page that
 * silently wants everything frozen.
 */
export function pageAsksForStillness(): boolean {
  try {
    return globalThis.matchMedia?.(REDUCED_MOTION)?.matches === true;
  } catch {
    return false;
  }
}

/**
 * The stored choice, or null where there is not one. Null rather than false on
 * purpose: "never chosen" and "chosen to keep moving" are different answers, and
 * only the first one defers to the system.
 */
export function readStill(store: StillStore | null): boolean | null {
  if (!store) return null;
  let raw: string | null = null;
  try {
    raw = store.getItem(STILL_KEY);
  } catch {
    return null;
  }
  if (raw === STILL_VALUE.on) return true;
  if (raw === STILL_VALUE.off) return false;
  // Anything else — no key, an empty string, a hand-edited value — is nothing
  // chosen. A blob a person has edited by hand should defer to their system
  // rather than resolve to a guess.
  return null;
}

/**
 * Where the switch opens: the stored choice if there is one, and what the system
 * asked for if there is not. Exported because it is the whole of the file's
 * decision, and a suite can check it without a store or a page.
 */
export function stillAt(stored: boolean | null, prefersReduced: boolean): boolean {
  return stored ?? prefersReduced;
}

/**
 * Build the switch, already carrying whatever the last session left — or, with
 * nothing left, whatever the system asked for. The variable is written here, so
 * a board that opens stilled is stilled on its first paint rather than on its
 * first frame.
 */
export function createStillness(spec: StillnessSpec = {}): StillnessHandle {
  const store = spec.store === undefined ? pageStore() : spec.store;
  const prefersReduced = spec.prefersReduced ?? pageAsksForStillness();

  let still = stillAt(readStill(store), prefersReduced);

  /** Written to the page, because anything at all may want to answer it. */
  function publish(): void {
    document.body.style.setProperty(STILL_VAR, still ? STILL_VALUE.on : STILL_VALUE.off);
  }

  function persist(): void {
    if (!store) return;
    try {
      store.setItem(STILL_KEY, still ? STILL_VALUE.on : STILL_VALUE.off);
    } catch {
      // A full quota is not worth a broken board. The session keeps its choice;
      // the next one opens on the system's answer again.
    }
  }

  /** The one way it moves. Named rather than inlined so `toggle` can reach it
   * without going back through the handle — a destructured `toggle` still works. */
  function set(next: boolean): void {
    if (next === still) return;
    still = next;
    publish();
    persist();
    spec.onChange?.(still);
  }

  publish();

  return {
    get still() {
      return still;
    },
    set,
    toggle(): boolean {
      set(!still);
      return still;
    },
    destroy(): void {
      document.body.style.removeProperty(STILL_VAR);
    },
  };
}
