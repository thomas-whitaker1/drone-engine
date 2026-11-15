// THE CHAIN — the seven patchable boxes. The first four are ported from
// engine2.js; DOPPLER, MAGNETS and OFFSET arrived with gt#41 and are the board's
// own.
//
// Every box has the same shape: `in → fx → out`, and nothing here connects `out`
// to anything. Placing it is the router's job, so a box is wired by the cable the
// user dragged or, failing that, straight to the speakers.
//
// Their names are the brief's, not the signal chain's. GRIT is distortion drive,
// MURK a filter cutoff, WOBBLE a modulated delay, CAVERN a reverb send, DOPPLER a
// swept delay, MAGNETS a modulated delay with a ducking envelope and OFFSET a
// multi-tap — but no audio jargon reaches the interface, so it does not reach
// these ids either.
//
// Three of the seven are delays by mechanism, and two of those are long ones. A
// forward chain of DOPPLER into OFFSET is legal, reachable by SUMMON, and adds
// up to about a third of a second of arrival spread with a feedback tail that
// halves every pass. That is a long slap and not a runaway, and the arithmetic
// behind that sentence is asserted in tests/modifiers.test.ts rather than left to
// this comment.

import {
  CAVERN,
  DOPPLER,
  GRIT,
  MAGNETS,
  MODIFIER_DEFAULTS,
  MODIFIER_IDS,
  MURK,
  OFFSET,
  SMOOTH,
  WOBBLE,
  type ModifierId,
} from './constants';
import { fillDropouts, fillTapeWobble } from './deterministic';
import type { Engine, Modifier } from './engine';

/**
 * What a builder actually makes: the audio shape and nothing else. A box's id and
 * the amount it opens on are the registry's to supply — see {@link MODIFIER_SPECS}
 * — so no builder writes its own name, and no builder can be given the wrong one.
 */
export type ModifierShape = Omit<Modifier, 'id' | 'amount'>;

export type ModifierBuild = (engine: Engine) => ModifierShape;

/** "How broken the speaker is." Drive in, level compensation back out. */
function buildGrit(engine: Engine): ModifierShape {
  const input = engine.makeGain(1);
  const out = engine.makeGain(1);
  const pre = engine.makeGain(GRIT.initial.pre);
  const post = engine.makeGain(GRIT.initial.post);

  const shaper = engine.context.createWaveShaper();
  shaper.oversample = GRIT.oversample;
  let curve = engine.curve(GRIT.initial.curve);
  shaper.curve = curve;

  input.connect(pre);
  pre.connect(shaper);
  shaper.connect(post);
  post.connect(out);

  return {
    in: input,
    out,
    set(amount) {
      const now = engine.now();
      // Handed over only when it is a different curve. The memo gives the same
      // array back for every amount inside one of its thirty-two steps, and
      // assigning it again is not free: the node copies the table and holds
      // the lock its own render takes — and a render that cannot have the lock
      // puts out a block of silence instead. MEGADRIFT calls this ten times a
      // second, so that was ten chances a second for GRIT to drop out.
      const next = engine.curve(GRIT.curveFloor + amount * GRIT.curveSpan);
      if (next !== curve) {
        curve = next;
        shaper.curve = next;
      }
      pre.gain.setTargetAtTime(GRIT.preFloor + amount * GRIT.preSpan, now, SMOOTH);
      // Without this the knob would only read as a volume control.
      post.gain.setTargetAtTime(GRIT.postGain / (1 + amount * GRIT.postDrive), now, SMOOTH);
    },
  };
}

/** "How much is buried under sludge." One lowpass, closing and resonating. */
function buildMurk(engine: Engine): ModifierShape {
  const input = engine.makeGain(1);
  const out = engine.makeGain(1);
  const lowpass = engine.makeBiquad('lowpass', MURK.initial.frequency, MURK.initial.q);

  input.connect(lowpass);
  lowpass.connect(out);

  return {
    in: input,
    out,
    set(amount) {
      const now = engine.now();
      const cutoff = Math.max(MURK.floor, MURK.open - amount * MURK.sweep);
      lowpass.frequency.setTargetAtTime(cutoff, now, SMOOTH);
      lowpass.Q.setTargetAtTime(MURK.qFloor + amount * MURK.qSpan, now, SMOOTH);
    },
  };
}

/** "How many players are slightly out of tune." Dry against a wandering copy. */
function buildWobble(engine: Engine): ModifierShape {
  const input = engine.makeGain(1);
  const out = engine.makeGain(1);
  const dry = engine.makeGain(1);
  const wet = engine.makeGain(0);

  const delay = engine.makeDelay(WOBBLE.maxDelay, WOBBLE.base);
  // The LFO writes into the delay time itself, so the detune is the delay moving.
  const lfo = engine.makeOsc('sine', WOBBLE.initial.rate);
  const depth = engine.makeGain(WOBBLE.initial.depth);
  lfo.connect(depth);
  depth.connect(delay.delayTime);

  input.connect(dry);
  dry.connect(out);
  input.connect(delay);
  delay.connect(wet);
  wet.connect(out);

  return {
    in: input,
    out,
    set(amount) {
      const now = engine.now();
      wet.gain.setTargetAtTime(amount * WOBBLE.wetSpan, now, SMOOTH);
      depth.gain.setTargetAtTime(WOBBLE.depthFloor + amount * WOBBLE.depthSpan, now, SMOOTH);
      lfo.frequency.setTargetAtTime(WOBBLE.rateFloor + amount * WOBBLE.rateSpan, now, SMOOTH);
    },
  };
}

/**
 * "How big the room is." Dry plus two rooms summed into one wet send — and the
 * only box that listens to a global: its own control sets how much room there is,
 * while SERIOUSNESS decides which of the two rooms it is.
 */
function buildCavern(engine: Engine): ModifierShape {
  const input = engine.makeGain(1);
  const out = engine.makeGain(1);
  const dry = engine.makeGain(CAVERN.dry);
  const wet = engine.makeGain(CAVERN.initial.wet);

  const room = engine.makeConvolver(engine.impulse(CAVERN.room.seconds, CAVERN.room.decay));

  // The long cavern is built after the wake, not during it (gt#21). At 44.1kHz it
  // is 750k samples through the scalar generator — measured at 25ms on the
  // development machine, against 8ms for the short room and 3ms for the noise
  // buffer — and it lands in the same frame as the whole graph, `syncEngine` and
  // the board's first lit paint. Deferring it is the largest single thing that
  // can be taken out of that frame, and it costs nothing anyone can hear: the
  // impulse arrives a second later, on a tail that fades in under the crossfade's
  // own smoothing rather than switching on.
  //
  // Both gains open at zero rather than at the reference's placeholders. Those
  // were always dead — `buildModifiers` ends in `applyGlobals`, which overwrites
  // the pair a moment later — and starting the cave at zero is what makes a
  // convolver with no impulse yet inaudible by construction instead of by trust.
  const cave = engine.makeConvolver();
  const roomGain = engine.makeGain(0);
  const caveGain = engine.makeGain(0);
  /** Until the impulse lands there is no room to crossfade into. */
  let caved = false;

  input.connect(dry);
  dry.connect(out);
  input.connect(room);
  room.connect(roomGain);
  roomGain.connect(wet);
  input.connect(cave);
  cave.connect(caveGain);
  caveGain.connect(wet);
  wet.connect(out);

  // Both impulses stop where their tails have gone silent rather than where
  // the arithmetic says the room ends (see IMPULSE), and a convolver plays a
  // shorter impulse a little quieter. These are what each room is owed for it,
  // so the cut is something only the audio thread notices.
  const roomTrim = engine.impulseTrim(CAVERN.room.seconds, CAVERN.room.decay);
  const caveTrim = engine.impulseTrim(CAVERN.cave.seconds, CAVERN.cave.decay);

  /** Where SERIOUSNESS puts the two rooms. The cave waits its turn. */
  const crossfade = (seriousness: number): void => {
    const now = engine.now();
    roomGain.gain.setTargetAtTime((1 - seriousness) * CAVERN.roomGain * roomTrim, now, SMOOTH);
    if (caved) caveGain.gain.setTargetAtTime(seriousness * CAVERN.caveGain * caveTrim, now, SMOOTH);
  };

  // Written a stretch per task rather than in one piece (gt#30), so the 25ms does
  // not simply land in a later frame. The convolver is handed the buffer once,
  // whole.
  engine.onWarm(
    engine.impulseJob(CAVERN.cave.seconds, CAVERN.cave.decay, (buffer) => {
      cave.buffer = buffer;
      caved = true;
      // Whatever SERIOUSNESS has been moved to in the meantime, not the value the
      // box was built at: a hand can reach the wheel before this runs.
      crossfade(engine.globals.seriousness);
    }),
  );

  return {
    in: input,
    out,
    set(amount) {
      wet.gain.setTargetAtTime(amount * CAVERN.wetSpan, engine.now(), SMOOTH);
    },
    // The one box that also listens to a global. Declared by being present rather
    // than by anything checking for `cavern`, which is why a fifth box that wants
    // a global needs no permission from this file's neighbours (gt#25).
    setSeriousness: crossfade,
  };
}

/**
 * "How fast it's going past you." One slow LFO, three destinations, and the
 * signs between them are the box (gt#41).
 *
 * The LFO writes into the delay time **negated** and into the level and the
 * cutoff straight. So a positive half-cycle is a shorter delay, a louder copy and
 * an open filter all at once — the source is near — and the negative half is the
 * same three going the other way. Wire any of the three the other way round and
 * this stops being a thing moving past and becomes three unrelated wobbles.
 */
function buildDoppler(engine: Engine): ModifierShape {
  const input = engine.makeGain(1);
  const out = engine.makeGain(1);
  const dry = engine.makeGain(1);
  const wet = engine.makeGain(DOPPLER.initial.wet);

  const delay = engine.makeDelay(DOPPLER.maxDelay, DOPPLER.base);
  const lowpass = engine.makeBiquad('lowpass', DOPPLER.initial.cutoff, DOPPLER.cutoffQ);

  const lfo = engine.makeOsc('sine', DOPPLER.initial.rate);
  // Negative, and that is the whole relationship: LFO high means delay short.
  const sweep = engine.makeGain(-DOPPLER.initial.depth);
  const gainSwing = engine.makeGain(DOPPLER.gainSwingFloor);
  const lowpassSwing = engine.makeGain(DOPPLER.lowpassSwingFloor);
  lfo.connect(sweep);
  sweep.connect(delay.delayTime);
  lfo.connect(gainSwing);
  gainSwing.connect(wet.gain);
  lfo.connect(lowpassSwing);
  lowpassSwing.connect(lowpass.frequency);

  input.connect(dry);
  dry.connect(out);
  input.connect(delay);
  delay.connect(lowpass);
  lowpass.connect(wet);
  wet.connect(out);

  return {
    in: input,
    out,
    set(amount) {
      const now = engine.now();
      sweep.gain.setTargetAtTime(-(DOPPLER.depthFloor + amount * DOPPLER.depthSpan), now, SMOOTH);
      lfo.frequency.setTargetAtTime(DOPPLER.rateFloor + amount * DOPPLER.rateSpan, now, SMOOTH);
      // The swings are written into `wet.gain` and `lowpass.frequency` by the LFO,
      // so these two set the point those swings move *around*.
      wet.gain.setTargetAtTime(DOPPLER.wetFloor + amount * DOPPLER.wetSpan, now, SMOOTH);
      lowpass.frequency.setTargetAtTime(DOPPLER.cutoffOpen - amount * DOPPLER.cutoffClose, now, SMOOTH);
      gainSwing.gain.setTargetAtTime(
        DOPPLER.gainSwingFloor + amount * DOPPLER.gainSwingSpan,
        now,
        SMOOTH,
      );
      lowpassSwing.gain.setTargetAtTime(
        DOPPLER.lowpassSwingFloor + amount * DOPPLER.lowpassSwingSpan,
        now,
        SMOOTH,
      );
    },
  };
}

/**
 * "How much something is pulling at it." Two fixed tables, one delay line and a
 * ceiling (gt#41).
 *
 * No dry path, on purpose: tape is not something running beside the signal, it is
 * what the signal is on. At rest the box is a 6ms delay at unity with both tables
 * scaled to nothing, which is a pass-through — so the absence of a dry gain costs
 * nothing at the bottom of the control and buys the top of it a signal that is
 * wholly, rather than partly, being dragged.
 *
 * The dropout table does two jobs from one curve. It ducks the level and it pulls
 * the lowpass down, which is what makes a dropout read as tape lifting off a head
 * rather than as somebody turning a volume knob very fast: level and highs go
 * together, because on tape they always did.
 */
function buildMagnets(engine: Engine): ModifierShape {
  const input = engine.makeGain(1);
  const out = engine.makeGain(1);

  const delay = engine.makeDelay(MAGNETS.maxDelay, MAGNETS.base);
  const lowpass = engine.makeBiquad('lowpass', MAGNETS.lpOpen, MAGNETS.lpQ);
  const duck = engine.makeGain(1);

  // Wow and flutter, −1…1, straight into the delay time through a depth gain.
  const wobble = engine.makeTable(MAGNETS.table.wobbleSeconds, MAGNETS.table.rate, (data) =>
    fillTapeWobble(data, MAGNETS.table.rate),
  );
  const depth = engine.makeGain(MAGNETS.initial.depth);
  wobble.connect(depth);
  depth.connect(delay.delayTime);

  // Dropouts, 0…1 as a *depth*, so both gains that read it are negative: the
  // curve at rest is 0 and adds nothing, and a dip subtracts.
  const dropouts = engine.makeTable(MAGNETS.table.dropoutSeconds, MAGNETS.table.rate, (data) =>
    fillDropouts(data, MAGNETS.dropouts.seed, MAGNETS.dropouts.count, MAGNETS.dropouts.width),
  );
  const drop = engine.makeGain(-MAGNETS.initial.drop);
  const lpDrop = engine.makeGain(-MAGNETS.initial.lpDrop);
  dropouts.connect(drop);
  drop.connect(duck.gain);
  dropouts.connect(lpDrop);
  lpDrop.connect(lowpass.frequency);

  input.connect(delay);
  delay.connect(lowpass);
  lowpass.connect(duck);
  duck.connect(out);

  return {
    in: input,
    out,
    set(amount) {
      const now = engine.now();
      depth.gain.setTargetAtTime(MAGNETS.depthFloor + amount * MAGNETS.depthSpan, now, SMOOTH);
      drop.gain.setTargetAtTime(-(MAGNETS.dropFloor + amount * MAGNETS.dropSpan), now, SMOOTH);
      lpDrop.gain.setTargetAtTime(-(MAGNETS.lpDropFloor + amount * MAGNETS.lpDropSpan), now, SMOOTH);
    },
  };
}

/**
 * "How far behind it drags." Three taps at fixed relations, panned apart, with
 * feedback that is genuinely zero for the bottom half of the control (gt#41).
 *
 * The taps hang off one shared node rather than off the input directly, which is
 * the detail that makes the feedback loop a loop: the return lands on that node,
 * so a repeat goes back through all three taps and their pans rather than through
 * the first one only. Feeding the input instead would put the dry path inside the
 * loop, which is a different and much louder box.
 *
 * Nothing here can build a cycle the router does not already know about — the
 * feedback is internal, and box-to-box wiring is forward-only by construction in
 * ../summon and checked by a graph walk anywhere else.
 */
function buildOffset(engine: Engine): ModifierShape {
  const input = engine.makeGain(1);
  const out = engine.makeGain(1);
  const dry = engine.makeGain(OFFSET.dry);

  /** What the taps read and what the feedback returns to. */
  const taps = engine.makeGain(1);
  const delays = OFFSET.taps.map((ratio) => {
    const delay = engine.makeDelay(OFFSET.maxDelay, OFFSET.initial.base * ratio);
    taps.connect(delay);
    return delay;
  });

  // One gain and one pan each, so the three arrive at different times *and* from
  // different places. Time alone is smear; time plus place is width.
  const tapGains = delays.map((delay, i) => {
    const gain = engine.makeGain(OFFSET.tapGains[i] ?? 0);
    const panner = engine.makePanner(OFFSET.tapPans[i] ?? 0);
    delay.connect(gain);
    gain.connect(panner);
    panner.connect(out);
    return gain;
  });

  // The last tap is the one that feeds back, so a repeat is a whole pass of the
  // pattern rather than a single early echo doubling up.
  const feedback = engine.makeGain(OFFSET.initial.feedback);
  const damping = engine.makeBiquad('lowpass', OFFSET.feedbackCutoff, OFFSET.feedbackQ);
  delays[delays.length - 1]?.connect(damping);
  damping.connect(feedback);
  feedback.connect(taps);

  input.connect(dry);
  dry.connect(out);
  input.connect(taps);

  return {
    in: input,
    out,
    set(amount) {
      const now = engine.now();
      const base = OFFSET.baseFloor + amount * OFFSET.baseSpan;
      delays.forEach((delay, i) => {
        delay.delayTime.setTargetAtTime(base * (OFFSET.taps[i] ?? 1), now, SMOOTH);
      });
      // Zero below the knee by subtraction rather than by a branch, so there is
      // no threshold anywhere for a later reader to move by accident.
      const loop = Math.max(0, amount - OFFSET.feedbackKnee) * OFFSET.feedbackSpan;
      feedback.gain.setTargetAtTime(loop, now, SMOOTH);
      // Trimmed as the loop opens, so turning the control up reads as deeper
      // rather than as louder — the same compensation GRIT makes.
      tapGains.forEach((gain, i) => {
        gain.gain.setTargetAtTime((OFFSET.tapGains[i] ?? 0) * (1 - loop), now, SMOOTH);
      });
    },
  };
}

// ------------------------------------------------------------------ registry

/** One box: the amount it opens on, and how to make it. */
export interface ModifierSpec {
  readonly defaultAmount: number;
  readonly build: ModifierBuild;
}

/**
 * All seven, keyed by id and iterated in chain order by {@link MODIFIER_IDS} —
 * the same list the router and the rack read, so a box cannot appear in the rack
 * in an order the signal does not take.
 *
 * `Record<ModifierId, …>` did exactly what gt#25 built it to do: the three boxes
 * gt#41 added were a compile error here until each had both an amount and a
 * builder, rather than boxes that were declared, painted, and never built. An
 * eighth is the same again.
 *
 * The defaults still come from ../constants. This table assembles; it does not
 * restate — the reference's own numbers are transcribed in one place and
 * tests/modifiers.test.ts pins them to the handoff's from there, for the four
 * the handoff has.
 */
export const MODIFIER_SPECS: Record<ModifierId, ModifierSpec> = {
  grit: { defaultAmount: MODIFIER_DEFAULTS.grit, build: buildGrit },
  murk: { defaultAmount: MODIFIER_DEFAULTS.murk, build: buildMurk },
  wobble: { defaultAmount: MODIFIER_DEFAULTS.wobble, build: buildWobble },
  cavern: { defaultAmount: MODIFIER_DEFAULTS.cavern, build: buildCavern },
  doppler: { defaultAmount: MODIFIER_DEFAULTS.doppler, build: buildDoppler },
  magnets: { defaultAmount: MODIFIER_DEFAULTS.magnets, build: buildMagnets },
  offset: { defaultAmount: MODIFIER_DEFAULTS.offset, build: buildOffset },
};

/**
 * Build all seven and register them in chain order.
 *
 * The id and the opening amount are attached here rather than written into each
 * builder's return, so a box's name exists once — in {@link MODIFIER_SPECS} — and
 * the four `id: 'grit'`-style literals that could disagree with the key above
 * them are gone. Each box is then told its own default, {@link Engine.applyGlobals}
 * hands CAVERN the SERIOUSNESS it opens on, and {@link Engine.route} places the
 * seven new outs.
 *
 * Call it once, after {@link Engine.start}.
 */
export function buildModifiers(engine: Engine): void {
  for (const id of MODIFIER_IDS) {
    const spec = MODIFIER_SPECS[id];
    const modifier: Modifier = { id, amount: spec.defaultAmount, ...spec.build(engine) };
    engine.modifiers[id] = modifier;
    modifier.set(modifier.amount);
  }
  engine.applyGlobals();
  engine.route();
}
