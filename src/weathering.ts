// The slowest feedback loop in the product: the board gets dirtier the longer it
// runs, and each control gets a bone halo in proportion to how often the hand has
// gone back to it. Over a session it maps the user's own habits back at them.
//
// Since gt#40 it also counts the times the hammer has landed, and that is the one
// part of it that is not slow at all — a dent arrives on a gesture, in a place
// somebody is already looking. It is held here anyway, and the reason is the same
// three-word test the rest of this file passes: accumulated by a session, worth
// nothing to the sound, and exactly what SCRUB THE ALTAR means. The board draws
// the marks, this counts them, and neither one owns the other's half.
//
// This is the one piece of *board* state that outlives the page, and it is still
// deliberately the only one: no presets, no patch, no knob position. A returning
// user gets their own wear back and a board that sounds exactly like a new one.
//
// It used to be the only persisted state in the product full stop, and that is no
// longer true — ../stillness keeps a second key (gt#33). The distinction that
// replaced it is worth stating, because it is the reason the two are separate
// blobs rather than two fields of this one: grime is accumulated *by* a session
// and the stillness switch is chosen *for* one. Only the first is board state,
// only the first is something SCRUB THE ALTAR is entitled to reset, and a
// person's accessibility preference living in here would be wiped by a button
// that means "make it look new again".
//
// Four things about it are decisions rather than implementation details:
//
// - **It owns no DOM and no engine.** It writes one custom property and calls one
//   callback. Which halo that callback moves is the board's business, and what
//   the rust it drives looks like is the tokens' — every consumer of `--weather`
//   already reads it with a `0` fallback, so a board whose weathering never
//   started is a clean board rather than a broken one.
// - **The clock is worth a flat five seconds a tick**, as the reference is, rather
//   than measuring elapsed wall time. A backgrounded tab has its interval
//   throttled and so under-counts, which is the right way to be wrong: time
//   nobody was looking at the board should not rust it.
// - **`--weather` is written at construction, before the clock exists.** A
//   returning board is already rusted on its first paint — the weathering that
//   arrived with the blob is not something the user should watch fade in.
// - **Every storage failure is silent.** Private mode, a full quota, a hand-edited
//   blob, no `localStorage` at all: each one leaves a clean board and nothing
//   else. Grime is the least important state in the product and it is never worth
//   an exception.

/** The one custom property this file owns, and the only one it writes. */
export const WEATHER_VAR = '--weather';

/** The single blob every session's grime is kept under. */
export const WEATHER_KEY = 'droneEngineWearV2';

export const WEATHER = {
  /** Minutes of runtime to a fully weathered board, and the settable range. */
  defaultMinutes: 18,
  minMinutes: 3,
  maxMinutes: 60,

  /**
   * The clock's period and what one tick is worth. They are the same five
   * seconds said twice, and they are separate because only the first is a timer
   * and only the second is arithmetic.
   */
  tickMs: 5000,
  tickSeconds: 5,

  /** `--weather` is written to this many decimals. */
  digits: 3,
} as const;

/**
 * The half of `localStorage` this file uses. Narrow on purpose: it is the whole
 * contract, so a suite can supply three lines instead of a storage mock, and a
 * store that throws on either call is a case that can actually be written down.
 */
export interface WeatherStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * What one blob holds. Every part of it is cumulative, none of it is board state,
 * and all of it dies to SCRUB THE ALTAR.
 */
export interface WeatherBlob {
  /** Completed drags per `scope.param`. */
  readonly wear: Readonly<Record<string, number>>;
  /** Cumulative seconds the engine has run, across every session. */
  readonly runtime: number;
  /**
   * How many times the hammer has landed, across every session (gt#40).
   *
   * It belongs here rather than anywhere else because it is the same kind of
   * thing as the other two: a mark a session left on the board, accumulated
   * rather than chosen, meaningless to the sound, and exactly what "makes it look
   * new again" is supposed to take away. That last part is the whole reason gt#40
   * wanted dents — SCRUB has never had anything dramatic to undo.
   *
   * It is a count and not a list of places. Where a mark lands is a fixed table
   * in ./ui/constants, so the count is the whole of the state and two boards with
   * the same number on them are dented identically. That is the same discipline
   * the shake's jitter keeps, and it is what lets this stay a number in a blob
   * rather than becoming a schema.
   *
   * The key is not bumped for it. A blob written before gt#40 simply has no dents
   * in it, which parses to a board nobody has hit — true, and the one thing a
   * returning user would expect.
   */
  readonly dents: number;
}

export interface WeatheringSpec {
  /** Minutes of runtime to a fully weathered board. Clamped to 3–60. */
  readonly minutes?: number;

  /**
   * Where the blob is kept. Defaults to this page's `localStorage` if it has one
   * it is allowed to touch, and to nothing at all if it does not.
   */
  readonly store?: WeatherStore | null;

  /** One control's halo needs redrawing, because its count moved. */
  readonly onWear?: (key: string, turns: number) => void;

  /** The dents need redrawing, because the count moved (gt#40). */
  readonly onDents?: (dents: number) => void;

  /**
   * Where the weather is written, as the text `--weather` carries. Left out, it
   * is that variable on the body, where anything on the page can read it.
   *
   * The product does not leave it out. A variable on the body is inherited by
   * every node on the page, so each tick of this clock made the browser work
   * the whole document out again and repaint every textured thing on it — once
   * every five seconds, for as long as the board ran. The seam hands this to
   * the board, which writes it on the parts that rust and on nothing else.
   */
  readonly publish?: (weather: string) => void;
}

export interface WeatheringHandle {
  /** Completed drags per `scope.param`, in the shape the board is built from. */
  readonly wear: Readonly<Record<string, number>>;
  /** Cumulative seconds of runtime. */
  readonly runtime: number;
  /** 0–1. What `--weather` currently says. */
  readonly weather: number;
  /** How many times the hammer has landed, across every session (gt#40). */
  readonly dents: number;

  /**
   * Begin the clock. Called once the engine exists — runtime means time the
   * board has been *running*, and before WAKE IT there is none. Calling it twice
   * runs one clock, not two.
   */
  start(): void;

  /** One completed drag, by its wear key. A bare click never reaches here. */
  commit(key: string): void;

  /**
   * The hammer landed (gt#40). One more dent, persisted immediately — the same
   * bargain {@link WeatheringHandle.commit} makes, because a mark you have to
   * keep the tab open to keep is not a mark.
   */
  hit(): void;

  /** SCRUB THE ALTAR. Every counter to zero, persisted immediately. */
  scrub(): void;

  /** Stop the clock and drop the variable. The blob is left where it is. */
  destroy(): void;
}

/** Minutes to a full board, clamped. Anything unusable falls back to the default. */
export function minutesFor(minutes: number = WEATHER.defaultMinutes): number {
  if (!Number.isFinite(minutes)) return WEATHER.defaultMinutes;
  return Math.min(WEATHER.maxMinutes, Math.max(WEATHER.minMinutes, minutes));
}

/**
 * How weathered a board with this much runtime on it is. Exported because it is
 * the whole of the system's arithmetic, and a suite can check it against the
 * handoff without running a clock.
 */
export function weatherAt(runtime: number, minutes: number = WEATHER.defaultMinutes): number {
  return Math.min(1, Math.max(0, runtime) / (minutesFor(minutes) * 60));
}

/** A clean board: what every failure below arrives at, written once. */
const EMPTY: WeatherBlob = { wear: {}, runtime: 0, dents: 0 };

/** Seconds off a stored blob. Anything that is not a real count is no time at all. */
function secondsOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Dents off a stored blob. The same filter the runtime goes through and then
 * floored, because this one is a count of things rather than an amount of
 * something — half a dent is not a mark anybody struck.
 */
function dentsOf(value: unknown): number {
  return Math.floor(secondsOf(value));
}

/**
 * Counts off a stored blob, keeping only the entries that could have been
 * written by this file. A hand-edited blob is a thing a person can do, and a
 * `NaN` reaching {@link WeatheringHandle.wear} would come out the far end as an
 * opacity of `NaN` on a halo rather than as an error anyone could trace.
 */
function turnsOf(value: unknown): Record<string, number> {
  const turns: Record<string, number> = {};
  if (!value || typeof value !== 'object') return turns;
  for (const [key, count] of Object.entries(value as Record<string, unknown>)) {
    if (typeof count === 'number' && Number.isFinite(count) && count > 0) {
      turns[key] = Math.floor(count);
    }
  }
  return turns;
}

/** This page's `localStorage`, if it has one and is allowed to reach it. */
function pageStore(): WeatherStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Reaching for it is itself what throws in some privacy modes.
    return null;
  }
}

/**
 * Whatever survives of a stored blob. Every failure — no store, no blob, bad
 * JSON, a store that throws — arrives here as a clean board, which is why this
 * returns a blob rather than reporting what went wrong.
 */
export function readBlob(store: WeatherStore | null): WeatherBlob {
  if (!store) return EMPTY;
  let raw: string | null = null;
  try {
    raw = store.getItem(WEATHER_KEY);
  } catch {
    return EMPTY;
  }
  if (!raw) return EMPTY;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY;
  }
  if (!parsed || typeof parsed !== 'object') return EMPTY;
  const blob = parsed as { wear?: unknown; runtime?: unknown; dents?: unknown };
  return {
    wear: turnsOf(blob.wear),
    runtime: secondsOf(blob.runtime),
    // Through the same filter the runtime goes through, and not by accident: a
    // hand-edited `-3` or a `"lots"` reaching the board would come out the far
    // end as a negative loop count or a `NaN` opacity on a mark, neither of which
    // is anything anyone could trace back to here.
    dents: dentsOf(blob.dents),
  };
}

/**
 * Build the weathering system, already carrying whatever the last session left.
 * The variable is written here; nothing accumulates until {@link
 * WeatheringHandle.start}.
 */
export function createWeathering(spec: WeatheringSpec = {}): WeatheringHandle {
  const minutes = minutesFor(spec.minutes);
  const store = spec.store === undefined ? pageStore() : spec.store;

  const saved = readBlob(store);
  let turns: Record<string, number> = { ...saved.wear };
  let runtime = saved.runtime;
  let dents = saved.dents;

  let clock: ReturnType<typeof setInterval> | null = null;

  /**
   * Said to whoever was named to hear it, and otherwise written on the body —
   * see {@link WeatheringSpec.publish} for why the product names someone.
   */
  function publish(): void {
    const text = weatherAt(runtime, minutes).toFixed(WEATHER.digits);
    if (spec.publish) spec.publish(text);
    else document.body.style.setProperty(WEATHER_VAR, text);
  }

  function persist(): void {
    if (!store) return;
    try {
      store.setItem(WEATHER_KEY, JSON.stringify({ wear: turns, runtime, dents }));
    } catch {
      // A full quota is not worth a broken board. The session keeps its grime;
      // the next one starts clean.
    }
  }

  publish();

  return {
    get wear() {
      return turns;
    },
    get runtime() {
      return runtime;
    },
    get weather() {
      return weatherAt(runtime, minutes);
    },
    get dents() {
      return dents;
    },
    start(): void {
      if (clock) return;
      clock = setInterval(() => {
        runtime += WEATHER.tickSeconds;
        publish();
        persist();
      }, WEATHER.tickMs);
    },
    commit(key: string): void {
      const next = (turns[key] ?? 0) + 1;
      turns = { ...turns, [key]: next };
      spec.onWear?.(key, next);
      persist();
    },
    hit(): void {
      dents += 1;
      spec.onDents?.(dents);
      persist();
    },
    scrub(): void {
      const worn = Object.keys(turns);
      const dented = dents > 0;
      turns = {};
      runtime = 0;
      dents = 0;
      publish();
      // Every halo that was showing something is told it is showing nothing. The
      // board has no list of its own controls, and does not need one: a control
      // that was never worn is already clean.
      for (const key of worn) spec.onWear?.(key, 0);
      // And the marks, on the same terms: told only if there were any. This is
      // the one part of a scrub anybody watches — the halos fade off controls a
      // hand is not on, and the plate has a hole in it until this line runs.
      if (dented) spec.onDents?.(0);
      persist();
    },
    destroy(): void {
      if (clock) clearInterval(clock);
      clock = null;
      document.body.style.removeProperty(WEATHER_VAR);
    },
  };
}
