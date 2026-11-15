// The only place that knows about both halves.
//
// Every component under src/ui owns appearance and gesture and no state, and the
// engine under src/engine owns sound and knows nothing about a plate. This file
// is the seam between them: it mounts the board, mounts the lever, and when the
// lever bottoms out it builds the engine and pushes the opening state into it.
//
// It is also where the patch lives, because the patch is the one piece of state
// both halves need and neither owns: the wire layer draws it, the engine routes
// it, THE CHAIN's lamps answer it, and none of the three is entitled to decide
// what it is. A wire added or removed is applied here, in one place, to all
// three — which is why the layer reports a drop rather than making one.
//
// It is also where the brief's two hardest rules are kept, because both are
// promises about what a *gesture* causes and a gesture reaches neither half on
// its own (gt#15):
//
// - **No dead control.** Touching any control of an off module powers that
//   module on. Neither the board nor the engine could decide that alone — one
//   has the gesture, the other has the sound, and the rule is a sentence about
//   both. It used to have a second half: touching an unplugged box ran a cable
//   from GUITAR WALL into it, and switched the wall on if it was off. That is
//   gone (gt#97). A hand setting a knob had its patch rewritten behind it and a
//   source it had switched off switched back on, which is the board doing
//   something nobody asked for — a worse fault than a knob that waits for a
//   cable. An unplugged box is drawn dark with its jacks left bright (gt#76), so
//   it already says what it is missing, and its amount is set and kept for
//   when something is plugged in.
// - **Audible within a second.** The smoothing constants are the engine's, but
//   the poke that answers a press on an already-on strike is asked for here, on
//   the press, rather than waiting for a value to move.
//
// The weathering system (gt#18) is held here on the same principle as the patch,
// for the same reason: accumulated grime is neither appearance the board is
// entitled to decide nor sound the engine makes, and it is the only state in the
// product that outlives the page. The board draws it, the clock counts it off
// the engine's running, and neither one owns it.
//
// SUMMON (gt#19) attaches the same way, and for the same reason: deciding a whole
// board at once is a thing about both halves and neither owns it. What it
// decides lives in ../summon, which touches nothing; what that decision *means*
// — a redraw, a re-measure, one pass into the engine, two custom properties —
// is here, because those four are the same four this file already does one at a
// time on every other gesture.
//
// gt#40 swung a hammer at it. The act is identical and `cast` below is unchanged;
// what moved is *when* it runs and what runs beside it. The board reports the
// blow at the moment of contact rather than on the click, so the new state lands
// on the frame of the hit without this file knowing a hammer takes 170ms to fall
// — the same ignorance it keeps about how long a wire drag is. And two more
// things ride the same callback: the room is told it was struck, and the mark is
// counted. Three subsystems, one gesture, and the reason all three are here is
// that a hammer is entitled to decide none of them.
//
// STILLNESS (gt#33) is the one thing attached here that is about *neither* half,
// and it is the exception that shows what the seam is for. Every other line in
// this file carries a gesture across to the sound; that one is a promise that a
// gesture will not. The switch is held here because three separate things stop
// moving when it is pressed — the atmosphere's frame loop, the bloom layer, and
// the tape in the corner that has to look pressed — and no one of the three is
// entitled to decide for the other two. What it must never reach is the engine,
// and the way that is kept is simply that nothing below it says `engine`: a
// board with the motion off sounds exactly like a board with it on.
//
// COME APART (gt#39) is the second switch of that kind, and it is held here for a
// reason the first one did not have: **the two switches rank, and neither is
// entitled to decide the ranking.** STILLNESS kills the whole advanced-effects
// shelf whatever the arm says, and arming the shelf changes nothing on screen
// while the board is stilled. That is one sentence about two independent
// switches, so it lives in `applyStill` and `applyApart` below and in neither
// ../stillness nor ../apart. Everything else about the shelf follows the pattern
// this file already has: GRIT and MURK are pushed to it on the gesture that moves
// them and again when SUMMON decides a whole board, and a strike reaches it
// through the same one-way callback the blooms already read. And, like both of
// the above, nowhere below does it say `engine` — a board coming apart sounds
// exactly like one that is not.

import { bpmFor, createEngine, buildModifiers, buildSources } from './engine';
import type { Engine, EngineControls, Wire } from './engine';
import {
  createAtmosphere,
  createBloomLayer,
  createBoard,
  createRupture,
  createTipLayer,
  createWakeScreen,
  createWireLayer,
  fedBy,
  kickFor,
  liveSet,
  OPENING_STATE,
  OPENING_WIRES,
  zoneDefs,
} from './ui';
import { BOARD, BOOT } from './ui/constants';
import type {
  AtmosphereHandle,
  BloomLayerHandle,
  BoardHandle,
  BoardState,
  ModuleParam,
  ModuleState,
  RuptureHandle,
  TipLayerHandle,
  WakeHandle,
  WireLayerHandle,
} from './ui';
import type { SourceId } from './engine/constants';
import { summon } from './summon';
import { fonts, installTokenVars, surfaces } from './tokens';
import { createStillness } from './stillness';
import type { StillnessHandle, StillStore } from './stillness';
import { createApart } from './apart';
import type { ApartHandle, ApartStore } from './apart';
import { createWeathering } from './weathering';
import type { WeatheringHandle, WeatherStore } from './weathering';
import { createDrift, driftState, DRIFT } from './drift';
import type { DriftHandle } from './drift';
import { loadFonts } from './fonts';
import type { FontsHandle } from './fonts';
import { BAKED_TOKENS, bakeTextures } from './bake';
import type { BakeHandle } from './bake';

export interface AppSpec {
  /** Where the board and the overlay are mounted. */
  readonly mount: HTMLElement;

  /**
   * Supply a context instead of letting the engine open one — offline rendering
   * and tests. Passed straight through to {@link createEngine}.
   */
  readonly context?: BaseAudioContext;

  /**
   * Minutes of runtime to a fully weathered board. Clamped to 3–60, and 18 when
   * unset. Passed straight through to {@link createWeathering}.
   */
  readonly weatherMinutes?: number;

  /**
   * Where accumulated grime is kept. Defaults to this page's `localStorage`;
   * pass `null` for a board that never remembers a session.
   */
  readonly weatherStore?: WeatherStore | null;

  /**
   * Where the STILLNESS choice is kept. Its own key rather than a field of the
   * weathering blob — see ./stillness — and its own spec field for the same
   * reason: one of the two is board state and the other is not, and a caller
   * that wants a board which forgets its grime need not also make it forget a
   * person's accessibility setting.
   */
  readonly stillStore?: StillStore | null;

  /**
   * Whether this page has been asked for reduced motion. Defaults to the media
   * query. Passed through to {@link createStillness}, which is where the rule
   * that it is a *default* rather than an override is written down.
   */
  readonly prefersReducedMotion?: boolean;

  /**
   * Where the COME APART choice is kept (gt#39). Its own key and its own spec
   * field, for the reason {@link AppSpec.stillStore} is separate from the
   * weathering blob: the three are different kinds of thing, and a caller that
   * wants a board which forgets one need not make it forget the others.
   *
   * There is deliberately no companion `prefersX` field. The shelf has no system
   * default to open on — see ./apart.
   */
  readonly apartStore?: ApartStore | null;
}

export interface AppHandle {
  readonly board: BoardHandle;
  readonly wake: WakeHandle;
  readonly wireLayer: WireLayerHandle;
  readonly tipLayer: TipLayerHandle;
  readonly bloomLayer: BloomLayerHandle;
  readonly atmosphere: AtmosphereHandle;
  readonly rupture: RuptureHandle;
  readonly weathering: WeatheringHandle;
  readonly stillness: StillnessHandle;
  readonly apart: ApartHandle;
  /** The drift clock (gt#43). Runs from WAKE IT, whatever the lever says. */
  readonly drift: DriftHandle;
  /** The request for the four typefaces (gt#69). The board never waits on it. */
  readonly fonts: FontsHandle;
  /** The drawn textures being turned into pictures. The board never waits on that either. */
  readonly bake: BakeHandle;
  /** How far the board is allowed to wander on its own, 0–1 (gt#43). */
  readonly megadrift: number;
  /** The patch, as it currently stands. */
  readonly wires: readonly Wire[];
  /** The engine, once the lever has been pulled. Null before that, always. */
  readonly engine: Engine | null;
  destroy(): void;
}

/** The ids of every source that is switched on. */
const onIds = (state: Pick<BoardState, 'm'>): string[] =>
  Object.entries(state.m)
    .filter(([, source]) => source.on)
    .map(([id]) => id);

/**
 * The same board state, with each box told the two things about itself that
 * nobody chose: whether a cable is in it, and whether sound is reaching it.
 *
 * `fed` and `live` are the fields of {@link BoardState} that are derived rather
 * than set. The wire list knows the first; the second needs the wire list *and*
 * which sources are switched on, which is why it is worked out here, at the
 * seam, and nowhere below it. Deriving both on every change — rather than
 * storing them beside the wires and keeping the three in step — is why a lamp
 * cannot go stale.
 *
 * A box's lamp answers `live` (gt#95). `fed` is the plainer fact beside it — a
 * cable is in — which a box drawn without being told `live` falls back on.
 */
function withFed(
  state: BoardState,
  wires: readonly Wire[],
  powered: readonly string[] = onIds(state),
): BoardState {
  const fed = fedBy(wires);
  // `powered` is the sources that are on *and* lit (gt#88). They are the same
  // list except while the board is coming up, when a source that has not had
  // its turn yet is putting nothing into the boxes after it that anyone can see.
  const live = liveSet(powered, wires);
  const mods = Object.fromEntries(
    Object.entries(state.mods).map(([id, mod]) => [
      id,
      { ...mod, fed: fed.has(id), live: live.has(id) },
    ]),
  ) as BoardState['mods'];
  return { ...state, mods };
}

/**
 * Push a whole board state into an engine in one pass: every source's power and
 * three values, every box's amount, all three globals, and the patch.
 *
 * Order matters in one place. Power comes last of a source's four, because
 * `setPower` pokes a strike module into firing an immediate hit to prove it
 * exists — and a hit fired before its loudness and character have landed is a
 * hit at the wrong loudness and the wrong character.
 *
 * PACE is the one global that does not go through `setGlobal` (gt#45), and that is
 * the seam rather than an inconsistency. The other two are values the whole graph
 * is rebuilt against; the tempo is the scheduler's alone, and the engine keeps it
 * apart precisely so that changing it touches nothing that is already sounding.
 * This is also where the board's word becomes a number, once, and nowhere else.
 */
export function syncEngine(
  controls: EngineControls,
  state: BoardState,
  wires: readonly Wire[] = [],
): void {
  for (const [id, source] of Object.entries(state.m)) {
    controls.setLoud(id, source.loud);
    controls.setChar(id, source.char);
    controls.setOften(id, source.often);
    controls.setPower(id, source.on);
  }
  for (const [id, modifier] of Object.entries(state.mods)) {
    controls.setMod(id, modifier.amount);
  }
  controls.setGlobal('seriousness', state.g.seriousness);
  controls.setGlobal('tuning', state.g.tuning);
  controls.setBpm(bpmFor(state.g.pace));
  controls.setWires(wires);
}

/** Mount the whole product. The board is built cold; the lever starts it. */
export function createApp(spec: AppSpec): AppHandle {
  installTokenVars();

  // The page shell the board is centred in, and the ground the atmosphere's six
  // fixed layers hang off — now literally the ground, since gt#53. The room's dark
  // elliptical base used to ride on the wash, where nothing under 1440px could
  // see it; it is painted here instead, and the wash kept only the light it
  // carries. `background-attachment:fixed` because the layer it came off was
  // `position:fixed`: a room that scrolled away from a tall board would be a
  // different thing from the one that was transcribed.
  //
  // Order matters in one assignment: the `background` shorthand resets
  // `background-image`, so the ground is stated after it rather than folded in.
  //
  // And what sticks out past the mount is clipped, never scrolled to (gt#116).
  // The plate fills the window exactly, and the hammer's jolt moves it a few
  // pixels for a quarter of a second: nine down, and the page was nine pixels
  // taller than the window for those frames, so the browser drew a scroll bar
  // and took it away again. `clip` rather than `hidden` because it does not
  // make the mount a scroll container, which nothing here wants it to be;
  // `hidden` first for a browser that has not heard of `clip`. Every layer
  // that hangs off the page is `position:fixed` and is not the mount's to
  // clip, so none of them is touched by this.
  spec.mount.style.cssText =
    `position:relative;min-height:100vh;overflow:hidden;overflow:clip;` +
    `font-family:${fonts.body};background:${surfaces.page};` +
    `background-image:${surfaces.pageDeep};background-attachment:fixed;`;

  // The board is built at the state it will be heard at, not at an empty one:
  // there is no setup step in this product, so the only thing the lever changes
  // about the board is that its lamps stop being the only thing lit.
  let wires: Wire[] = OPENING_WIRES.map((wire) => ({ from: wire.from, to: wire.to }));
  // The board powering up (gt#88). `booted` is the modules the power has reached
  // so far, and `null` once it has reached all of them — which is every moment
  // of the board's life except the two seconds after the lever. It starts empty:
  // the board is built cold and is dark until it is woken.
  let booted: Set<string> | null = new Set();
  const bootTimers = new Set<ReturnType<typeof setTimeout>>();

  /** The sources that are switched on and that the power has reached. */
  const powered = (of: Pick<BoardState, 'm'>): string[] => {
    const lit = booted;
    return lit ? onIds(of).filter((id) => lit.has(id)) : onIds(of);
  };

  let state = withFed(OPENING_STATE, wires, powered(OPENING_STATE));

  // The layer does not exist while the board is being built, and the board
  // measures its own scale on the way up — so the first resize callback arrives
  // before there is anything to answer it.
  let wireLayer: WireLayerHandle | null = null;

  let engine: Engine | null = null;

  // MEGADRIFT (gt#43). Held here for the reason the patch is: it is neither
  // appearance the board decides nor sound the engine makes, and both halves have
  // to be told about it. The clock is built further down, once the things a tick
  // reaches actually exist.
  let megadrift: number = DRIFT.opening;
  let drift: DriftHandle | null = null;
  /** The board the last drift tick pushed. See `applyDrift`. */
  let pushed: BoardState | null = null;

  // The typefaces (gt#69), asked for before anything is built so the request is in
  // flight for as long as possible — and never waited on, which is the whole of
  // gt#47's rule. The board is drawn in its fallbacks first and re-drawn when the
  // faces land; lettering changes size when they do, which moves two things at
  // once — how tall the plate is, and where every jack on it sits. So the board
  // is fitted to the window again (gt#71), and that re-fit reports a resize on its
  // way through, which is what measures every cable again. One call, in the
  // order the two depend on each other: a cable measured before the plate had
  // settled on its scale would be measured against the wrong plate.
  const faces = loadFonts({ onSettle: () => board.refit() });

  // Mounted before the board so the wash lands under it in document order as
  // well as in paint order — every other layer here is explicitly z-indexed over
  // the plate, and the wash is the one that must not be.
  const atmosphere = createAtmosphere({ mount: spec.mount });

  // The room is set to the board's opening state for the same reason the board
  // is drawn at it: there is no setup step, so the first frame anyone sees is
  // already the one the engine will be started at.
  atmosphere.setTuning(state.g.tuning);
  atmosphere.setGrit(state.mods.grit.amount);
  atmosphere.setSeriousness(state.g.seriousness);

  /**
   * Everything that stops moving, told once. The three are unrelated to each
   * other and each owns its own half of "still": the room stops reading levels,
   * the flashes stop being drawn, and the tape sinks into the plate.
   *
   * There is no fourth line reaching the engine, and that absence is the feature.
   */
  function applyStill(still: boolean): void {
    // A board stilled while it is coming up is simply on (gt#88).
    if (still) endBoot();
    atmosphere.setStill(still);
    bloomLayer.setStill(still);
    rupture.setStill(still);
    // The pulses down the cables (gt#85), which are the one moving thing the wire
    // layer has. A dead cable stays dead: that is state, not motion.
    wireLayer?.setStill(still);
    board.setStill(still);
    // And the fifth line, which is the one that had to be argued for (gt#43). A
    // stilled board stops *drawing* the drift and never stops it: the sound has
    // been moving the whole time the knobs were pinned, so the moment the switch
    // comes back off they are told where it actually got to, once, rather than
    // waiting out a tick showing a position nothing is playing.
    if (!still) drawDrift();
  }

  /**
   * COME APART, told to the two things that answer it (gt#39): the shelf itself,
   * and the tape that has to look pressed.
   *
   * The asymmetry with `applyStill` above is the whole of how the two switches
   * rank. STILLNESS reaches the shelf and the shelf does not reach back — a
   * stilled board shows none of this however hard it is armed, and arming it
   * while stilled changes nothing on screen until the other tape comes up. That
   * ordering lives here rather than inside either switch, because it is a fact
   * about the pair and neither one is entitled to decide it alone.
   *
   * And there is no line here reaching the engine either, for the same reason
   * there is none in `applyStill`: a board coming apart sounds exactly like one
   * that is not.
   */
  function applyApart(armed: boolean): void {
    rupture.setArmed(armed);
    board.setApart(armed);
  }

  // Built early and before anything is drawn, because a board that opens stilled
  // must be stilled on its first paint rather than on its first frame — the same
  // reason the weathering below is built before the board it rusts. `onChange`
  // reaches three things that do not exist yet, which is fine: nothing presses a
  // button during construction.
  const stillness = createStillness({
    ...(spec.stillStore !== undefined ? { store: spec.stillStore } : {}),
    ...(spec.prefersReducedMotion !== undefined
      ? { prefersReduced: spec.prefersReducedMotion }
      : {}),
    onChange: (still) => applyStill(still),
  });

  // The arm for the shelf (gt#39), built beside the switch that outranks it and
  // for the same reason: a board that opens armed must be armed on its first
  // paint. Off unless a previous session said otherwise — ./apart has no system
  // default to consult, which is the decision rather than an omission.
  const apart = createApart({
    ...(spec.apartStore !== undefined ? { store: spec.apartStore } : {}),
    onChange: (armed) => applyApart(armed),
  });

  // Built before the board, because the board is built *at* its wear: a halo is
  // not something a returning user should watch arrive. `onWear` reaches a board
  // that does not exist yet, which is fine — nothing wears before a hand does.
  //
  // The weather it publishes goes to the board and not to the page — see
  // `publish` in ./weathering for what a variable on the body cost. The first
  // of it is said while this is being built, before there is a board to tell,
  // so it is kept and handed over the moment there is one.
  let weatherText = '';
  let weatherTo: ((weather: string) => void) | null = null;
  const weathering = createWeathering({
    ...(spec.weatherMinutes !== undefined ? { minutes: spec.weatherMinutes } : {}),
    ...(spec.weatherStore !== undefined ? { store: spec.weatherStore } : {}),
    publish: (weather) => {
      weatherText = weather;
      weatherTo?.(weather);
    },
    onWear: (key, turns) => board.setWear(key, turns),
    // And the marks, on the same terms and reaching the same board that does not
    // exist yet. This one fires on a gesture rather than on a drag ending, and it
    // is the only part of a scrub anybody actually watches happen.
    onDents: (dents) => board.setDents(dents),
  });

  /** Draw a state this file has just decided on. The engine is told separately. */
  function redraw(next: BoardState): void {
    // A hand is on the board. Whatever has not come up yet comes up now (gt#88).
    endBoot();
    // Re-derived on every change and not only when the patch moves (gt#95):
    // switching a source off is what takes the signal out of a box.
    state = withFed(next, wires, powered(next));
    draw();
    drawLive();
  }

  /**
   * The drift's own clock at the last moment the board was drawn moving (gt#91).
   * A stilled board is drawn at this and not at the present, which is the whole
   * of how it holds still: the sound has carried on and the picture has not.
   */
  let drawnAt = 0;

  /**
   * Draw the board. The one place it is drawn from, and the fix for gt#91 is that
   * there is only one.
   *
   * There used to be two, and they disagreed. A gesture drew the board as it was
   * *set*; a drift tick, ten times a second, drew it as it was *heard*. Turn one
   * knob with MEGADRIFT up and every pointer move drew the whole board at its
   * set values, the next tick drew it at its heard ones, and every control on
   * the plate flickered between the two for as long as the drag lasted.
   *
   * So every draw is the same draw: the board is *set* at `state` and *shown* as
   * it is heard. The split is carried all the way into the control (see
   * `setValue` in ./ui/control), because the two numbers have two readers — an
   * eye wants where the sound is, and a hand has to start from where the thing
   * was put, or every touch would fold the drift it was carrying into the
   * setting.
   *
   * Stilled, "as it is heard" is as it was heard when the board last moved. A
   * gesture on a stilled board moves the control under the hand and nothing
   * else; drawing at the present would let every other knob jump to wherever the
   * sound had got to, on a board asked to hold still.
   *
   * GRIT and MURK ride along because they are the two drifting values something
   * other than a knob reads — the grain, the fringes and the shelf. Told here
   * rather than on the gesture, for the same reason the knobs are: a grain set
   * to one number by the hand and another by the tick is the same flicker.
   */
  function draw(seen?: BoardState): void {
    if (!stillness.still) drawnAt = drift?.seconds ?? 0;
    const next = seen ?? driftState(state, drawnAt, megadrift);
    board.setState(state, next);
    atmosphere.setGrit(next.mods.grit.amount);
    rupture.setGrit(next.mods.grit.amount);
    rupture.setMurk(next.mods.murk.amount);
  }

  /**
   * Tell the cables which of them are carrying anything (gt#85): out of a source
   * that is on, or a box something live reaches. Derived here for the reason
   * `withFed` derives a lamp — the wire layer draws cables and has no idea
   * which modules are switched on, the board knows that and has no idea how it
   * is patched, and "is signal coming down this" is a sentence about both.
   *
   * Called wherever the power or the patch can have moved. It is a pass over
   * paths already drawn, so it costs nothing worth rationing.
   */
  function drawLive(): void {
    wireLayer?.setLive(liveSet(powered(state), wires));
  }

  /**
   * The power has reached more of the board (gt#88), or all of it: tell the three
   * things that draw that — the plates, the box lamps and the cables.
   */
  function drawBoot(): void {
    board.setBooted(booted);
    state = withFed(state, wires, powered(state));
    draw();
    drawLive();
  }

  /**
   * Finish powering up, now. Whatever has not had its turn comes up together.
   * Called by anything that should not wait for the sequence: a hand on the
   * board, a stilled board, a page being torn down. Does nothing once it is
   * over, which is almost always.
   */
  function endBoot(): void {
    if (booted === null) return;
    for (const timer of bootTimers) clearTimeout(timer);
    bootTimers.clear();
    booted = null;
    drawBoot();
  }

  /** One module comes up: lit, its cables live, and a flash off its own plate. */
  function bootOne(id: SourceId): void {
    if (booted === null) return;
    booted.add(id);
    drawBoot();
    board.modules.get(id)?.flash(BOOT.flash);
  }

  /** The modules that open on, in the order the power reaches them. */
  const bootOrder = (): SourceId[] =>
    BOOT.order.flatMap((zone) => zoneDefs(zone).map((def) => def.id)).filter((id) => state.m[id].on);

  /** Run something `ms` from now, on a timer {@link endBoot} can take back. */
  function bootAfter(ms: number, run: () => void): void {
    const timer = setTimeout(() => {
      bootTimers.delete(timer);
      run();
    }, ms);
    bootTimers.add(timer);
  }

  /**
   * Begin powering up (gt#88), as the lever bottoms out. The first module comes
   * up while the overlay is still lifting; the rest wait for
   * {@link continueBoot}, which is the overlay being gone.
   *
   * Not at all on a stilled board. Modules lighting on a clock is exactly the
   * motion that switch exists for, so there the board is simply on.
   */
  function beginBoot(): void {
    if (stillness.still) {
      endBoot();
      return;
    }
    const [first] = bootOrder();
    if (first === undefined) {
      endBoot();
      return;
    }
    bootAfter(BOOT.firstMs, () => bootOne(first));
  }

  /**
   * The rest of the sequence, once the overlay has gone and the engine has done
   * the work it put off — see {@link BOOT.afterDoneMs} for why they wait.
   */
  function continueBoot(): void {
    if (booted === null) return;
    const lit = booted;
    const rest = bootOrder().filter((id) => !lit.has(id));
    const step = Math.min(
      BOOT.maxStepMs,
      Math.max(BOOT.minStepMs, BOOT.spanMs / Math.max(1, rest.length)),
    );
    rest.forEach((id, index) => bootAfter(BOOT.afterDoneMs + index * step, () => bootOne(id)));
    // And then it is over: nothing is left waiting, so the board stops asking.
    bootAfter(BOOT.afterDoneMs + Math.max(0, rest.length - 1) * step, endBoot);
  }

  /**
   * The board as it is currently *heard*: the state above, plus wherever the
   * drift has carried it since the lever was pulled (gt#43).
   *
   * `state` stays the base throughout — what a hand set and what the hammer
   * re-rolls — and nothing in this file ever writes a drifted value back into it.
   * That single rule is the whole of how the issue's hardest requirement is met
   * without a line of code spent on it: touching a drifting control replaces the
   * base and the envelope re-centres on the new one, SMASH IT replaces the base
   * wholesale and the envelope re-centres on that, and neither case can undo the
   * user's move because a tick has nothing to undo it with.
   */
  function heard(): BoardState {
    return driftState(state, drift?.seconds ?? 0, megadrift);
  }

  /**
   * Show the drift. Not while stilled: a board someone has asked to hold still
   * holds still, and the sound underneath it keeps moving — which is the one
   * asymmetry ../stillness wrote down before there was anything to apply it to.
   *
   * Nothing here says `engine`, for the same reason nothing in `applyStill` does.
   * The two halves of a drift tick are separated at exactly this line so that the
   * half a person can switch off is the half that is only ever appearance.
   */
  function drawDrift(next: BoardState = heard()): void {
    if (stillness.still) return;
    // The same draw a gesture makes (gt#91), handed the board this tick has
    // already worked out rather than left to work it out again.
    draw(next);
  }

  /**
   * One tick: the sound first, then the screen.
   *
   * Every push here passes `false` for the engine's `prove` flag, and it is the
   * one part of this feature that is a correctness problem rather than a taste
   * one. `setLoud` and `setChar` poke a quiet strike into an immediate hit so
   * that touching a control proves the module exists — a promise about *hands*.
   * The poke debounces at nine tenths of a second and this runs ten times one, so
   * a drift that proved itself would fire a hit a second out of every strike on
   * the board for as long as the page was open. MEGADRIFT is the slowest thing in
   * the product and it must not be audible as a pulse.
   */
  function applyDrift(): void {
    const next = heard();
    // A tick that has nothing new to say says nothing. With the lever shut
    // `driftState` hands the base back by identity, so this is the whole of a
    // resting board's tick: one comparison. It used to be thirty-odd parameter
    // writes into the engine and a redraw of every control on the plate, ten
    // times a second, to restate the board that was already there — which on a
    // slow machine was most of what the main thread did. A hand, the hammer and
    // the lever itself all replace the board, and are pushed once when they do.
    if (next === pushed) return;
    pushed = next;
    if (engine) {
      for (const [id, source] of Object.entries(next.m)) {
        engine.setLoud(id, source.loud, false);
        engine.setChar(id, source.char, false);
      }
      for (const [id, modifier] of Object.entries(next.mods)) engine.setMod(id, modifier.amount);
    }
    drawDrift(next);
  }

  /** Replace one module's record, leaving the other eight and everything else. */
  function setModule(id: SourceId, next: ModuleState): void {
    redraw({ ...state, m: { ...state.m, [id]: next } });
  }

  /**
   * Power a module on because a control of it was touched, and say whether that
   * was needed. A module already on is left alone — this is not a toggle, and
   * the toggle in the header is still the only thing that can turn one off.
   */
  function powerOn(id: SourceId): boolean {
    if (state.m[id].on) return false;
    setModule(id, { ...state.m[id], on: true });
    // `setPower` pokes a strike into an immediate hit, so a module started by its
    // own knob is heard on the press rather than on the next beat it is due.
    engine?.setPower(id, true);
    return true;
  }

  const board = createBoard({
    state,
    // Built with nothing lit (gt#88): the lever is what brings it up.
    cold: true,
    wear: weathering.wear,
    dents: weathering.dents,
    megadrift,
    onToggle: (id, on) => {
      setModule(id, { ...state.m[id], on });
      engine?.setPower(id, on);
    },
    onPress: (id) => {
      // Nothing has moved yet, so there is no value to apply — only the two
      // things that make the next moment audible: power, and a poke for a strike
      // that is on but has gone quiet.
      if (!powerOn(id)) engine?.touch(id);
    },
    onInput: (id, param, value) => {
      powerOn(id);
      setModule(id, { ...state.m[id], [param]: value });
      apply(id, param, value);
    },
    // A box's control sets its amount and nothing else (gt#97): no cable is run
    // for it and no source is switched on. So a press on one, which moves no
    // value, has nothing to do here — the board's `onModifierPress` is left
    // unanswered on purpose.
    onModifierInput: (id, value) => {
      // GRIT is the one box that is seen as well as heard — and the one that is
      // seen twice: it is the film grain and both fringes, and once the shelf is
      // armed it is also how far the board comes apart (gt#39). MURK is seen only
      // through the shelf, which hangs the melting off it. Neither is told here
      // any more (gt#91): the draw below tells both, as they are heard, which is
      // where a drift tick would have put them a tenth of a second later anyway.
      redraw({ ...state, mods: { ...state.mods, [id]: { ...state.mods[id], amount: value } } });
      engine?.setMod(id, value);
    },
    onGlobalInput: (param, value) => {
      redraw({ ...state, g: { ...state.g, [param]: value } });
      // Three globals, three destinations, and one `if` per global rather than an
      // `else` catching whatever is left (gt#45). PACE is the third of them and it
      // is the one that made the difference matter: the branch below used to read
      // *tuning, otherwise seriousness*, which is a correct sentence about two
      // things and a bug about three — a tempo change would have been handed to
      // the room as a SERIOUSNESS. A fourth global one day gets no default here
      // either, on purpose.
      if (param === 'pace') {
        // The tempo goes to the scheduler alone and never to `setGlobal`, which
        // rebuilds against the root: the pulse is not a value the graph is tuned
        // to. The room is not told at all — how fast the heartbeat is arrives in
        // the wash as blooms and levels, which the frame loop is already reading.
        engine?.setBpm(bpmFor(value));
      } else if (param === 'tuning') {
        engine?.setGlobal(param, value);
        // …and both of these are seen as well as heard: TUNING recolours the
        // wash, SERIOUSNESS sets how deep the figure behind it is drawn (gt#36).
        // Both move the room on the gesture rather than through the frame loop,
        // because neither is a thing the ear reports back.
        atmosphere.setTuning(value);
      } else {
        engine?.setGlobal(param, value);
        atmosphere.setSeriousness(value);
      }
    },
    // MEGADRIFT (gt#43). The engine is not told, because there is nothing to tell
    // it: this lever sets no value on the board and makes no sound of its own — it
    // only decides how far everything else is allowed to wander from where it was
    // put. What it does reach is the next line, immediately, so that turning it
    // down to nothing hands every control straight back rather than leaving the
    // board wherever the last tick happened to have carried it.
    onDriftInput: (value) => {
      megadrift = value;
      applyDrift();
      // A stilled board does not draw a tick, and that call was one. But this is
      // a hand on a lever, not a clock: the board answers it stilled or not, the
      // way it answers any other control, so pushing the lever shut hands the
      // knobs back where they can be seen to come back (gt#91).
      if (stillness.still) draw();
    },
    onJackDown: (id, event) => wireLayer?.beginDrag(id, event),
    // A drag that actually moved something. The two halves of this file's job
    // are untouched by it: grime is neither board appearance the board decides
    // nor sound the engine makes, which is why it is counted out here.
    onCommit: (key) => weathering.commit(key),
    // SMASH IT (gt#40), which fires when the hammer *lands* rather than when it is
    // clicked — see ./ui/board. It used to be the opposite of SCRUB in every way:
    // all of the sound and none of the grime. It is now the opposite in three
    // ways out of four, because a blow leaves a mark, and a mark is grime.
    //
    // Three things happen here and they are three different halves of the seam,
    // which is exactly why none of them could live one level down: the board is
    // re-rolled, the room is told it was struck, and the mark is counted. The
    // hammer knows about none of it and neither does the engine.
    onSmash: () => {
      // The blow is heard as a blow, whatever board it produces (gt#87). First,
      // before the re-roll: `cast` pokes every strike that comes up on, and
      // the hammer should not find the voices already spent by what it caused.
      // Nothing here asks whether the board is stilled — that switch stops the
      // picture and never the sound.
      engine?.blow();
      cast();
      // The cables come back in rather than blinking from one patch to the next
      // (gt#80). After `cast`, which is what drew the new ones; and the layer
      // drops the call itself on a stilled board.
      wireLayer?.settle();
      atmosphere.smash();
      // And the blow is seen to cross the board (gt#92): a ring off the anvil,
      // which the plates answer as it reaches them — see `ripple` in ./ui/board.
      bloomLayer.blast();
      weathering.hit();
    },
    // SCRUB THE ALTAR. Nothing about the current sound changes — the engine is
    // not told, because there is nothing to tell it.
    onScrub: () => weathering.scrub(),
    // STILLNESS. The engine is not told, because there is nothing to tell it —
    // and unlike SCRUB, which says the same thing about the *sound*, this one
    // says it about the sound on purpose rather than by happening not to matter.
    onStill: () => stillness.toggle(),
    // COME APART. The engine is not told for the third time and for the third
    // reason — this one changes only what the screen does to itself.
    onApart: () => apart.toggle(),
    onResize: () => wireLayer?.measure(),
  });
  // Rusted before it is seen: the weather said so before there was a board, and
  // every tick after this one goes straight to it.
  weatherTo = (weather) => board.setWeather(weather);
  board.setWeather(weatherText);
  spec.mount.appendChild(board.element);
  // And now that it is on the page it can say how tall it is (gt#71). The board
  // fits itself to the window's width the moment it is built, but its height is
  // something only a mounted plate can report — so the second half of the fit
  // happens here, before anything is measured against the plate.
  board.refit();

  /** One module control's value, through to the engine setter that owns it. */
  function apply(id: SourceId, param: ModuleParam, value: number): void {
    if (!engine) return;
    if (param === 'loud') engine.setLoud(id, value);
    else if (param === 'char') engine.setChar(id, value);
    else engine.setOften(id, value);
  }

  /** Apply a new patch to all three of the things that read one. */
  function setWires(next: readonly Wire[]): void {
    wires = next.map((wire) => ({ from: wire.from, to: wire.to }));
    endBoot();
    state = withFed(state, wires, powered(state));
    draw();
    wireLayer?.setWires(wires);
    drawLive();
    engine?.setWires(wires);
  }

  /**
   * The re-roll itself. One blow decides a whole board, and every one of the four
   * things that reads a board is told once rather than thirty-eight times.
   *
   * `woke` is carried through rather than summoned: the lever's state is not
   * part of the sound, and this button is reachable before it has been pulled.
   * A board summoned cold is silent, correct, and heard the moment it wakes —
   * `syncEngine` runs at WAKE IT off whatever state this left behind.
   */
  function cast(): void {
    const summoned = summon();
    wires = summoned.wires.map((wire) => ({ from: wire.from, to: wire.to }));
    // Every box comes back unfed and is told the truth here, for the same reason
    // the opening state is: a lamp answers the patch, and only this knows it.
    // The hammer does not wait for a board to finish coming up (gt#88).
    endBoot();
    state = withFed({ ...summoned.state, woke: state.woke }, wires, powered(summoned.state));
    draw();
    // `setWires` re-measures on the way through, which is the whole of what the
    // layer needs: nine plates and four boxes have just changed what they show.
    wireLayer?.setWires(wires);
    drawLive();
    // In one pass, in the order that keeps a poked strike honest — and ending in
    // the engine's own `setWires`, so the graph is rebuilt exactly once.
    if (engine) syncEngine(engine, state, wires);
    // The three set-on-change layers, moved on the gesture like every other time
    // they move. The frame loop owns the rest and is not involved.
    atmosphere.setTuning(state.g.tuning);
    atmosphere.setSeriousness(state.g.seriousness);
    // GRIT and MURK — the grain, the fringes and the two things the shelf reads
    // (gt#39) — were told by `draw` above, as they are heard (gt#91).
    //
    // And the drift is laid back over the top of it (gt#43). Nothing about the
    // re-roll had to know drift existed — the base moved and the envelope follows
    // a base — but the engine has just been handed the board as it was *set*, and
    // a tick is a tenth of a second away. This closes that tenth of a second
    // rather than letting the hammer land on one sound and the next tick reveal a
    // slightly different one.
    applyDrift();
  }

  // The room's turning figure is seated in the board's emblem layer (gt#102): the
  // room still turns it and lights it, but where it *is* belongs to the plate —
  // hub on the seal's centre, in the plate's own pixels, at every window size.
  // The room made it before there was a board to seat it in, which is the only
  // reason this is a move rather than a mount.
  board.emblem.appendChild(atmosphere.figure);

  // Mounted on the plate rather than beside it: the plate is the positioning
  // parent every endpoint is measured against, and it is the thing carrying the
  // zoom the layer divides those endpoints back out of — a factor it takes off
  // the plate's own rect rather than off the variable that set it (gt#22).
  const layer = createWireLayer({
    board: board.element,
    wires,
    onConnect: (wire) => setWires([...wires, wire]),
    onDisconnect: (index) => setWires(wires.filter((_, at) => at !== index)),
  });
  wireLayer = layer;
  drawLive();
  board.element.appendChild(layer.element);

  // Listening on the plate, but hanging off the page: the tag is fixed to the
  // viewport, and the plate is zoomed. The layer needs no state and no callbacks
  // — it reads a hovered control's own tape strip.
  const tipLayer = createTipLayer({ board: board.element });
  spec.mount.appendChild(tipLayer.element);

  // Hanging off the page for the same reason the tag does, and reading the plate
  // for the same reason the wire layer does — but in viewport space, so it is the
  // one measuring layer here that never divides by `--fit`. See ./ui/blooms.
  const bloomLayer = createBloomLayer({ board: board.element });
  spec.mount.appendChild(bloomLayer.element);

  // The shelf (gt#39). Built after the board because it is the one layer here that
  // is handed the plate — the aberration filter goes on it, and handing the
  // element in rather than letting the shelf query for it keeps what this feature
  // can reach visible in one line. It mounts its own layers on the page for the
  // reason the blooms and the tag do: the plate carries `zoom:var(--fit)`, which
  // would scale a fixed child with it.
  const rupture = createRupture({ mount: spec.mount, plate: board.element });

  // The two boxes the shelf reads, pushed in at the board's opening values for
  // the same reason the atmosphere's three are: there is no setup step, so the
  // first frame anyone sees is already the one the engine will be started at.
  // Nothing is drawn from either until the arm below says so.
  rupture.setGrit(state.mods.grit.amount);
  rupture.setMurk(state.mods.murk.amount);

  // The drift clock (gt#43), built once everything a tick reaches exists. It is
  // handed the engine's clock as a reading function rather than the engine, for
  // the reason the atmosphere's frame loop is handed one: this is the second
  // system in the product that must be able to say it never writes to the sound,
  // and a file with no way to reach the engine cannot.
  //
  // Reading the *audio* clock rather than the wall's is what makes the promise at
  // the top of ../drift true. A board left running while the tab is in the
  // background has its interval throttled, exactly as the weathering clock does —
  // but unlike that one, this reads elapsed time instead of counting ticks, so it
  // comes back to where the sine actually is rather than to where a lost tick
  // count would have put it. Time nobody watched still happened to the sound.
  // Assigned through a const for the reason the wire layer is: the handle is
  // returned as a non-null field, and `drift` above is nullable only because the
  // things defined before this line have to be able to ask whether it exists yet.
  const driftClock = createDrift({
    now: () => engine?.now() ?? 0,
    onTick: () => applyDrift(),
  });
  drift = driftClock;

  // Everything that answers a switch now exists, so both switches are applied —
  // before the lever, before a frame, and before anything has had a chance to
  // move. STILLNESS second, because it is the one that outranks the other.
  applyApart(apart.armed);
  applyStill(stillness.still);

  // The drawn textures, turned into pictures of themselves — see ./bake for what
  // that buys. Asked for last, once everything that lays a tile exists to be
  // measured, and never waited on: the board above is already drawn from the
  // drawings, and is redrawn once from the pictures when they are in.
  const baking = bakeTextures({
    within: spec.mount,
    targets: [
      ...BAKED_TOKENS.map((name) => ({ host: document.documentElement, name })),
      // The seal is the board's own, published on the plate rather than the
      // root, and the largest drawing there is.
      { host: board.element, name: BOARD.sealVar },
    ],
  });

  const wake = createWakeScreen({
    onStart: () => {
      // `start` first, then the builders: both build against the master chain,
      // and reaching for it before it exists is an error rather than a no-op.
      // Neither the routing nor the globals `start` applies to an empty board is
      // wasted — `syncEngine` ends in `setWires`, which rebuilds both over the
      // thirteen things that now exist.
      // `onStrike` is handed over at construction because it is the engine's only
      // outward callback and the bloom layer its only consumer: the flash is the
      // visual half of a hit, and it is asked for here so that neither half has to
      // know the other exists. The engine fires it when the hit is *heard*.
      // `onStrike` now has two consumers rather than one, and they are the same
      // kind of thing: the bloom is the light a hit throws and the torn slice is
      // the damage it does (gt#39). Both read the callback and neither answers
      // back, so the one-way arrow is unchanged — a second reader of a one-way
      // seam is still one-way. The bloom goes first because it is the effect the
      // board has always had.
      const started = createEngine({
        onStrike: (id) => {
          // What struck, as it is set and as it is being heard — drift and all.
          // Read once, because three of the readers below size themselves off
          // it (gt#74, gt#81): how loud a hit is set is how much light it throws,
          // how hard its plate takes it, and how far the room moves.
          const struck: ModuleState | undefined = heard().m[id as SourceId];
          const loud = struck?.loud ?? 1;
          bloomLayer.strike(id, loud);
          // The plate itself (gt#81). Withheld here on a stilled board rather than
          // inside the module, for the reason the board does not latch its own
          // STILLNESS: one switch, held in one place, told to whatever moves.
          if (!stillness.still) board.modules.get(id as SourceId)?.flash(loud);
          // And its mark on the seal (gt#104), which the board withholds itself
          // when it is stilled — it already latches that for the hammer.
          board.strike(id, loud);
          rupture.strike();
          // And down the cable, if it has one (gt#85): the hit drawn travelling
          // through the patch to wherever it is going.
          wireLayer?.strike(id);
          // And a third reader, which is the one that makes a hit land in the
          // room rather than only on the plate (gt#74). The engine says a hit was
          // heard; how hard the room takes it comes from what the board is set
          // to — as it is being *heard*, drift and all, so a WEIGHT that has
          // wandered up shakes the room by where it wandered to. Nothing is
          // measured off the sound to decide it, and nothing is said back.
          if (struck) atmosphere.strike(kickFor(id, struck.loud, struck.char));
        },
        // The heartbeat, told to the one thing that draws it (gt#83). The board
        // does not keep time and the engine does not know there is a lamp: a
        // beat falls, the lamp at PACE is told so, and that is the whole of the
        // seam. STILLNESS is the board's to apply — it holds the lamp steady
        // rather than dropping the call, so the pulse is never mistaken for
        // having stopped.
        onBeat: () => board.beat(),
        ...(spec.context ? { context: spec.context } : {}),
      });
      engine = started;
      started.start();
      buildModifiers(started);
      buildSources(started);
      syncEngine(started, state, wires);
      // The atmosphere's frame loop begins here and nowhere else: there are no
      // levels to read before this moment. It is handed the single reading call
      // rather than the engine, which is what makes "reads audio state and never
      // writes it" a fact about the code instead of a promise about it.
      atmosphere.start(() => started.levels());
      // The weathering clock starts here for the same reason: runtime means time
      // the board has been *running*, and a board sat in front of the lever for
      // ten minutes has not aged a second.
      weathering.start();
      // And the second slow clock, on the same terms and for a third version of
      // the same reason (gt#43): drift is measured in engine time, and a board that
      // has not been started has none. Starting it here rather than at the first
      // touch of the lever is deliberate — every curve is a function of elapsed
      // time, so the phases have to have been running for the value the lever
      // lands on to mean the same thing at any moment.
      drift?.start();
      // And the board starts coming up (gt#88): the first module while the
      // overlay is still lifting, the rest once it has gone.
      beginBoot();
    },
    onDone: () => {
      // Both copies, and the seam's first: it redraws the plate from its own on
      // every gesture, so a copy that still says cold would take every tint on
      // the board out with the next thing the user touched.
      state = { ...state, woke: true };
      board.setWoke(true);
      // And the work the engine put off until there was room for it (gt#21). This
      // is the moment: the overlay has faded and been removed, so nothing is
      // waiting on the main thread to finish an animation. Which builder deferred
      // what is the engine's business — the seam only knows when "later" is.
      engine?.warm();
      // After the line above and not before it: that call is a long frame, and
      // none of the sequence is in flight across it (gt#88).
      continueBoot();
    },
  });
  spec.mount.appendChild(wake.element);

  return {
    board,
    wake,
    wireLayer: layer,
    tipLayer,
    bloomLayer,
    atmosphere,
    rupture,
    weathering,
    stillness,
    apart,
    drift: driftClock,
    fonts: faces,
    bake: baking,
    get megadrift() {
      return megadrift;
    },
    get wires() {
      return wires;
    },
    get engine() {
      return engine;
    },
    destroy(): void {
      // First, because it is the one thing here that can call back in from
      // outside: a face landing on a page mid-teardown must not measure cables
      // that are about to be removed.
      faces.destroy();
      // And the other thing that lands late: a picture arriving on a torn-down
      // page is nobody's, and the variables go back to the drawings they named.
      baking.destroy();
      // The power-up's own timers (gt#88), taken back without drawing anything:
      // there is no board left to bring up.
      for (const timer of bootTimers) clearTimeout(timer);
      bootTimers.clear();
      wake.destroy();
      wake.element.remove();
      engine?.stop();
      // The frame loop reads the engine every frame, so it goes down with it. So
      // does the bloom layer, which the engine calls into: a strike announced a
      // lookahead ago is still on a timer, and it must not land on a torn-down page.
      atmosphere.destroy();
      // The clock outlives the engine by nothing: it counts runtime, and a
      // stopped engine has none.
      weathering.destroy();
      // And the other clock, on exactly the same terms: it reads the engine's
      // time, so it goes down with the engine (gt#43).
      driftClock.destroy();
      // Drops `--still` and nothing else. The stored choice is left where it is:
      // a torn-down page is not someone changing their mind.
      stillness.destroy();
      // Drops the arm's variable and leaves the stored choice, exactly as above.
      apart.destroy();
      // Taken down before the board, because it is the one layer holding a
      // property *on* the plate: the filter comes off an element that still
      // exists rather than off one already removed.
      rupture.destroy();
      bloomLayer.destroy();
      bloomLayer.element.remove();
      tipLayer.destroy();
      tipLayer.element.remove();
      layer.destroy();
      board.destroy();
      board.element.remove();
    },
  };
}
