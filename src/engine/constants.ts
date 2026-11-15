// Every number in the engine's spine, and the only place any of them is written
// down. Values are transcribed from the original design's reference engine,
// which the comments here call engine2.js. Its files are not in the repository;
// tests/engine-core.test.ts pins each value it wrote, so a slipped digit fails
// the suite rather than the ear.
//
// The handoff expects these coefficients to be re-tuned by ear later; keeping
// them here means that pass edits one file instead of hunting through the graph.

// -------------------------------------------------------------------- globals

/** TUNING roots, LOW → BEDROCK. The selector shows words; these are the Hz. */
export const ROOTS = [55, 49, 43.65, 38.89, 32.7, 27.5] as const;

/** SERIOUSNESS and TUNING, the two things that move the whole board at once. */
export const DEFAULT_GLOBALS = { seriousness: 0.38, tuning: 2 } as const;

/**
 * What a module sits on, as a ratio off {@link ROOTS} (gt#38). A registry entry
 * names one of these words and never a number, the same bargain every control on
 * the board takes.
 *
 * These are **just** ratios, not equal-tempered ones, and that is the entire
 * safety argument rather than a stylistic preference. Multiply every nominal
 * multiplier on the board by its interval and then by ten, and every result is a
 * whole number — 10, 20, 40 for the wall, 30 for the chainsaw, 48 for the sax,
 * 60 for the cow — so every voice is an integer multiple of one implied
 * fundamental at `root / 10`. Two partials that are both harmonics of a single
 * fundamental cannot be out of tune with each other. That is arithmetic, and
 * tests/sources.test.ts checks it at every TUNING position with SERIOUSNESS at
 * both ends, which is what the issue asks for and what an ear cannot promise.
 *
 * Twelve-tone ratios would break it on the first decimal. Do not "simplify"
 * these to `Math.pow(2, n / 12)`.
 *
 * The board was already a major chord before this existed and nobody had written
 * it down: COW's `mult` of 5 is a just major third two octaves up, and the two
 * multipliers of 3 are fifths. So the intervals below move three modules and
 * leave six alone, and what they buy is that the chord is now *chosen* — the cow
 * comes off its accidental major third onto the sixth harmonic, and the sax
 * takes the minor third the board no longer has.
 */
export const INTERVALS = {
  /** Unison. The floor, the wall, and everything unpitched. */
  root: 1,
  /** 6/5. One module, high enough that it reads as harmony rather than as beating. */
  minorThird: 1.2,
  /** 3/2. Doom's other interval, and the only one that is safe at any depth. */
  fifth: 1.5,
  /** 2/1. Nothing claims it yet; it is here because a table of three is not a table. */
  octave: 2,
} as const;

/** The words a registry entry is allowed to name. Never a number, at any point. */
export type IntervalName = keyof typeof INTERVALS;

/** The heartbeat's default. Configurable 36–72 by the scheduler. */
export const DEFAULT_BPM = 48;

/**
 * PACE's four positions, slowest first, and the only place the board's tempo is
 * a number at all (gt#45). The control paints words over these — see PACE_WORDS in
 * ../ui/words — and nothing between the selector and the scheduler ever spells
 * one out.
 *
 * Four rungs rather than five, and that is arithmetic rather than taste. The
 * range is {@link HEARTBEAT.minBpm} to {@link HEARTBEAT.maxBpm}, a span of 36, so
 * four positions sit 12 apart and {@link DEFAULT_BPM} lands exactly on the second
 * one. Five would step by nine and put the board's own opening tempo between two
 * rungs, which is a control that cannot be returned to where it started.
 *
 * The ends are the range's ends and not a polite interior: 36 is barely a pulse
 * and 72 is where the fastest divisor gets genuinely dense. Both are the point.
 * tests/heartbeat.test.ts holds the table to spanning the range evenly and to
 * carrying the default, so a fifth word cannot be added without the arithmetic
 * being redone on purpose.
 */
export const TEMPOS = [36, 48, 60, 72] as const;

// ------------------------------------------------------------------ heartbeat

/**
 * The one slow pulse everything that strikes hangs off. A lookahead scheduler:
 * a plain timer wakes often enough to keep the audio clock's next third of a
 * second filled, so a hit is placed against `currentTime` rather than fired by
 * the timer itself — the timer's own jitter never reaches the ear.
 *
 * The range is the board's `heartbeatBpm` prop (36–72); the brief asks for
 * "around 40–60", which sits inside it.
 */
export const HEARTBEAT = {
  /** How often the scheduler wakes, in milliseconds. */
  intervalMs: 90,
  /** How far ahead of the audio clock it fills, in seconds. */
  horizon: 0.3,
  /** The first beat lands this far after the engine starts. */
  lead: 0.25,
  minBpm: 36,
  maxBpm: 72,
} as const;

/**
 * Swing (gt#60): how late every second beat is heard, as a share of a beat.
 *
 * **Not in engine2.js, which plays dead on the grid.** One fixed number for the
 * whole board and no control: per-module swing against a shared pulse is how a
 * groove falls apart, and a control would need a word.
 *
 * It is a drag, not a shuffle. Triplet swing would be a third of a beat, which
 * at these tempos is over 400ms and turns a dirge into a limp. A twentieth is
 * 62ms at the opening 48 BPM (83ms at FUNERAL, 42ms at WALKING): beats run
 * long, short, long, short by ten percent between neighbours, which is past
 * the point where a listener can feel that two gaps differ and well short of
 * where they can name it as a different rhythm.
 *
 * What is dragged is decided by the scheduler — see `heardAt` in ./scheduler —
 * and it must stay under 1, or a late beat could land on the one after it.
 */
export const SWING = { late: 0.05 } as const;

/**
 * HOW OFTEN, as beat divisors: a strike fires when the beat count plus its own
 * phase is a multiple of one of these. Index 0 is *constantly*, index 4 is
 * *almost never* — the selector shows those words and never these numbers.
 */
export const RATE_DIV = [1, 2, 4, 8, 16] as const;

// ------------------------------------------------------------------ smoothing

/**
 * Every parameter change goes through `setTargetAtTime` with one of these three.
 * The brief's rule is that nothing ramps slower than roughly a twentieth of a
 * second, so a control is always audible well inside the promised one.
 */
export const SMOOTH = 0.055;
/** Retunes glide a little slower — the whole board moving at once. */
export const SMOOTH_RETUNE = 0.09;
/** Power on/off. */
export const SMOOTH_POWER = 0.06;

// --------------------------------------------------------------- master chain

/** A fixed light grit across everything, before the compressor. */
export const MASTER_CURVE = 0.1;
export const MASTER_OVERSAMPLE: OverSampleType = '2x';

/**
 * How the context is asked to reach the speakers.
 *
 * `playback` rather than the default, which is `interactive` — the browser's
 * shortest buffer, meant for an instrument played in time. This is not one:
 * every value on the board is smoothed over a tenth of a second or more before
 * it is heard, and the one clock in it is booked a third of a second ahead. A
 * short buffer buys nothing here and costs the thing the board cannot afford,
 * because a buffer the audio thread fails to fill once is a click. The two
 * reverbs do their work in bursts — a long transform every so many blocks —
 * and measured on a fast machine the worst block already took three tenths of
 * its ten milliseconds. `playback` doubles that buffer on a desktop and asks a
 * phone or a tablet for its deep one, which is the difference between a board
 * that drones and one that stutters.
 *
 * `maxLatency` is the most of what the context then reports that the picture
 * is delayed by — see `Engine.announce`. A device that claims more than this is
 * believed only this far.
 */
export const OUTPUT = { latencyHint: 'playback' as AudioContextLatencyCategory, maxLatency: 0.3 } as const;

export const COMPRESSOR = {
  threshold: -16,
  ratio: 5,
  knee: 14,
  attack: 0.01,
  release: 0.3,
} as const;

export const MASTER_GAIN = 0.8;

/**
 * Seconds the master takes to climb from silence to {@link MASTER_GAIN} once
 * {@link Engine.start} runs, and the only number in this file that is about a
 * person rather than about a sound (gt#44).
 *
 * The board boots already playing — that is the handoff's rule and it stays —
 * but *already playing* and *already at full* are not the same promise. What
 * arrives on the first sample is a compressed wall of low end at whatever the
 * system volume happens to be, chosen by someone who clicked a lever to find out
 * what it did. Four seconds is long enough to reach a volume knob and short
 * enough that the board is unmistakably running the whole time.
 *
 * A warning line under the lever says the same thing in words (`WAKE_WARNING`),
 * and this is the half that works on the people who do not read it.
 */
export const SOFT_START = 4;

// ------------------------------------------------------------------ analysers

/** Master tap. */
export const ANALYSER = { fftSize: 512, smoothing: 0.7 } as const;

/**
 * Low tap: a 150Hz lowpass into a second analyser, which is what makes the
 * background breathe. Its fftSize is deliberately left at the Web Audio default
 * of 2048 — engine2.js sets only the smoothing constant, and `levels()` sizes its
 * buffer from the analyser rather than assuming.
 */
export const LOW_TAP = { frequency: 150, smoothing: 0.6 } as const;

/**
 * `levels()` scales RMS by these before clamping to 1.
 *
 * **A stated departure from engine2.js**, which has 2.5 and 3.5 (gt#70), and the
 * one place in this file a number was moved by *measuring* rather than by ear.
 *
 * The reference's pair was chosen for nine modules through a master nobody had
 * tuned. On the board as it now plays, the low tap's raw RMS sits between .28
 * and .52 on the opening state and never above .52 on any board measured — so at
 * 3.5 the reading was about 1 to 1.8 before the clamp, which is to say 1, on
 * very nearly every frame. The room was not following the sound; it was pinned at the far end of
 * everything it does, with the shake that is meant to be "absent almost all of
 * the time" running continuously, and a hammer blow had nowhere higher to go.
 *
 * So each is cut to put the loudest board measured just under the top of the
 * range — .516 on the low tap and .547 on the master, both landing at .93 — and
 * leave the clamp as what it was written to be: a guard against a board nobody
 * anticipated, not the resting state. tests/engine-core.test.ts holds that as a
 * property against the measurements rather than as the numbers restating
 * themselves.
 *
 * One thing these cannot fix, because it is not a scaling problem. The taps hang
 * off the master, after the compressor, and a compressor's whole job is to make
 * the level stop saying how much is playing: BASS alone reads .37–.44 on the low
 * tap and all eleven modules together read .20–.47. The reading is honest now;
 * it is still a reading of something that barely moves.
 */
export const LEVEL_SCALE = { master: 1.7, low: 1.8 } as const;

// ------------------------------------------------------- deterministic sources

/** The one noise buffer every hiss, breath and rattle in the board loops over. */
export const NOISE = { seconds: 2.5, seed: 22222 } as const;

/** CAVERN's stereo impulses. One seed per channel. */
export const IMPULSE_SEEDS = [733, 911] as const;

/**
 * Where an impulse stops being kept: the point its envelope falls under
 * `floor` of where it began, which is eighty decibels down.
 *
 * The envelope is `pow(1 - i/n, decay)`, so it does not fade out so much as
 * arrive at nothing: the last ninth of the long cavern sits under this floor,
 * and the last twentieth of the short room. That stretch was being convolved
 * like the rest, and a convolver's cost runs with its impulse's length —
 * measured, the two rooms are three quarters of everything the audio thread
 * does.
 *
 * Eighty and not the sixty a reverb's length is conventionally measured to,
 * and the difference was measured rather than assumed. The master compressor
 * turns a quiet board up, so a tail is louder at the speakers than it is in the
 * room: rendered with one COW alone in a full cave — the most exposed a tail
 * gets — what a sixty-decibel cut dropped still peaked at −45dBFS. At eighty
 * the most any render differed by was a sample at −74, a SLOW HIT alone in the
 * short room, and on the board as it opens the whole change is −103dB against
 * the mix. See `heardLength` in ./deterministic.
 */
export const IMPULSE = { floor: 0.0001 } as const;

/**
 * How the work put off until after the wake is cut up (gt#30).
 *
 * CAVERN's long room is 750k samples through the scalar generator, about 25ms
 * in one piece. Deferring it (gt#21) took it out of the wake frame and put it in
 * the frame where the woken board is first drawn, which was a 52ms frame. So it
 * is written `slice` samples at a time, one stretch per task, with `gapMs`
 * between tasks: about a millisecond of work each, never two of them inside
 * one 16ms frame, and the whole room in place a fifth of a second after the
 * overlay leaves. Nobody hears that wait: the cave's gain is held at zero
 * until the impulse lands and then fades in.
 *
 * The first stretch also waits out `gapMs`, so none of it shares a task with
 * the board's first tinted paint.
 */
export const WARM = { slice: 32768, gapMs: 8 } as const;

/** Waveshaper curves: 1024 points, memoised against `round(amount * 32)`. */
export const CURVE = { points: 1024, steps: 32, depth: 55, floor: 1.5 } as const;

/** Park–Miller. The only source of noise in the product, and it never varies. */
export const LCG = { multiplier: 16807, modulus: 2147483647 } as const;

// ------------------------------------------------------------------- modifiers

/**
 * THE CHAIN, in the order the boxes are laid out and built.
 *
 * The first four are the reference's, in its order. The last three arrived with
 * gt#41 and are the whole of what the handoff does not describe — see
 * {@link POST_HANDOFF_BOXES}, which is the register the suites check that
 * against rather than each of them carrying its own idea of where the reference
 * stops.
 *
 * Seven is under `CHAIN.capacity`, and that is a fact the suite divides out
 * rather than a thing this comment promises (gt#48).
 */
export const MODIFIER_IDS = [
  'grit',
  'murk',
  'wobble',
  'cavern',
  'doppler',
  'magnets',
  'offset',
] as const;

export type ModifierId = (typeof MODIFIER_IDS)[number];

/**
 * The boxes the handoff never drew, and the whole of the exception the suites
 * make for them — the same bargain `POST_HANDOFF` strikes in ../ui/words for
 * words the handoff never wrote, and it is here for the same reason.
 *
 * Four of the seven are transcribed from engine2.js coefficient by coefficient,
 * and that transcription is what keeps the ported half from drifting. A check
 * like that can only cover boxes the reference actually contains — so the three
 * that arrived with gt#41 are named here, once, rather than the check being
 * loosened for all seven. The suite asserts both halves: the four still appear
 * in the reference exactly as it writes them, and none of these three does.
 *
 * The list being short and explicit is the point. "The reference does not have
 * this" must never become a way to quietly stop checking the parts it does.
 */
export const POST_HANDOFF_BOXES: readonly ModifierId[] = ['doppler', 'magnets', 'offset'];

/**
 * Where each box opens. These are the board's defaults, transcribed from the
 * reference markup's `mods: { grit: 0.55, … }` rather than from engine2.js, whose
 * inline `amount: .5` on GRIT is a build-time placeholder the board overwrites a
 * moment later. Opening the engine on the board's number means the two never
 * disagree — see the WAKE IT default state.
 */
export const MODIFIER_DEFAULTS: Record<ModifierId, number> = {
  grit: 0.55,
  murk: 0.5,
  wobble: 0.35,
  cavern: 0.5,
  // The three gt#41 boxes open lower than the reference's four. None of them is
  // transcribed from a board that already chose, so the number is a decision
  // rather than a quote — and the decision is that a box which arrives already
  // dragging the whole patch out of shape is a box nobody chose to turn on.
  // Each is audible where it opens; see the no-dead-controls guard (gt#15).
  doppler: 0.3,
  magnets: 0.25,
  offset: 0.35,
};

/**
 * GRIT — `pre-gain → waveshaper → post-gain`. The post-gain is compensation, so
 * that turning GRIT up reads as dirtier rather than merely louder.
 */
export const GRIT = {
  /** Curve amount `.1 + v * 1.6`: never entirely clean, even at zero. */
  curveFloor: 0.1,
  /**
   * engine2.js: .9 — widened by ear (gt#20). The reference topped out at a curve
   * amount of 1, and the top of the sweep read as dirtier than the middle but
   * not by enough. Widening the span is the lever that adds dirt without adding
   * level: `shaperCurve` is bounded to ±1 at every drive, so a harder curve
   * clips more and peaks no higher. The floor is untouched, so the bottom of
   * the knob is exactly what it was.
   */
  curveSpan: 1.6,
  /** Drive into the shaper, `.25 + v * .75`. */
  preFloor: 0.25,
  preSpan: 0.75,
  /** And back out again, `.9 / (1 + v * .6)`. */
  postGain: 0.9,
  postDrive: 0.6,
  oversample: '2x' as OverSampleType,
  /** Where the box sits before `set()` runs. */
  initial: { curve: 0.5, pre: 0.5, post: 0.8 },
} as const;

/**
 * MURK — one lowpass closing down over the amount.
 *
 * The sweep is `max(180, 2800 - v * 2600)`, so the floor is a guard rather than a
 * destination: at full amount the filter lands on 200Hz and the 180 is never
 * reached. Ported as written; the numbers are the ear-tuning pass's to move.
 */
export const MURK = {
  open: 2800,
  sweep: 2600,
  floor: 180,
  qFloor: 0.7,
  qSpan: 2.5,
  initial: { frequency: 1500, q: 1 },
} as const;

/** WOBBLE — dry plus an LFO-modulated delay. Detune by another name. */
export const WOBBLE = {
  /** The delay line's ceiling, well clear of base + depth. */
  maxDelay: 0.2,
  base: 0.025,
  /** Modulation depth `.002 + v * .011`, in seconds. */
  depthFloor: 0.002,
  depthSpan: 0.011,
  /** Rate `.5 + v * 3.5`, in Hz. */
  rateFloor: 0.5,
  rateSpan: 3.5,
  /** Wet never quite reaches the dry signal. */
  wetSpan: 0.9,
  initial: { rate: 1.2, depth: 0.004 },
} as const;

/**
 * CAVERN — dry plus a convolver pair, crossfaded by SERIOUSNESS rather than by
 * its own control. Half the thesis of the toy: at full SERIOUSNESS everything
 * moves into the long room and the cow moo turns menacing.
 */
export const CAVERN = {
  dry: 0.95,
  /** Wet is `amount * 1.3`, so the box can push past unity. */
  wetSpan: 1.3,
  /** The short room. */
  room: { seconds: 2.4, decay: 3 },
  /** The long cavern. */
  cave: { seconds: 8.5, decay: 4.2 },
  /** Crossfade weights: `(1 - s) * .9` short, `s * 1.1` long. */
  roomGain: 0.9,
  caveGain: 1.1,
  initial: { wet: 0.6, room: 0.6, cave: 0.4 },
} as const;

/**
 * DOPPLER — the source is moving past you (gt#41).
 *
 * One slow LFO drives three things at once: the delay time, the wet level and a
 * lowpass. That is the whole box, and the sign relationship between the three is
 * the whole *point* of it. When the LFO is high the delay is **shorter** — the
 * thing is nearer — so the level and the cutoff both go up with it. Approach is
 * louder and brighter, departure duller and quieter, and the pitch shift is what
 * falls out of a delay line whose length is changing rather than something any
 * number here asks for.
 *
 * Distinct from {@link WOBBLE} on both axes the issue names. WOBBLE is small and
 * fast — 25ms base, 2–13ms of depth, .5–4Hz. This is long and slow: a pass takes
 * `1 / rate` seconds, so 12.5 seconds at the bottom of the control and 2.4 at the
 * top, and the depth is an order of magnitude wider.
 *
 * The ceiling on the pitch shift is arithmetic. A delay swept by `depth` at
 * `rate` bends pitch by `depth × 2π × rate`; at the top of the control that is
 * `.04 × 2π × .5 ≈ .126`, which is about two semitones either way. Wide enough to
 * be unmistakably a pass-by and short of the point where the board sounds broken.
 */
export const DOPPLER = {
  /** Well clear of base + depth. */
  maxDelay: 0.4,
  base: 0.12,
  /** Sweep depth `.006 + v * .034`, in seconds. Never takes the delay below 80ms. */
  depthFloor: 0.006,
  depthSpan: 0.034,
  /** Rate `.08 + v * .42`, in Hz — 12.5 seconds a pass down to 2.4. */
  rateFloor: 0.08,
  rateSpan: 0.42,
  /** Where the wet copy sits before the swing is added, `.5 + v * .34`. */
  wetFloor: 0.5,
  wetSpan: 0.34,
  /** And how far the swing moves it, `.1 + v * .26`. Stays inside the level above. */
  gainSwingFloor: 0.1,
  gainSwingSpan: 0.26,
  /** The lowpass the swing rides on, centred at `2600 - v * 900`Hz. */
  cutoffOpen: 2600,
  cutoffClose: 900,
  cutoffQ: 0.7,
  /** Swing `400 + v * 1800`Hz either side of that centre. */
  lowpassSwingFloor: 400,
  lowpassSwingSpan: 1800,
  /** Where the box sits before `set()` runs. */
  initial: { rate: 0.2, depth: 0.012, wet: 0.55, cutoff: 2300 },
} as const;

/**
 * MAGNETS — tape being pulled at (gt#41), and the one box on this board written
 * around a ceiling rather than around a range.
 *
 * **Nothing can go wrong is a governing law, and this is the box that tests it.**
 * A faithful tape simulation does not read as heavy, it reads as a fault: a drone
 * whose pitch is genuinely unstable sounds like a broken file rather than like a
 * broken machine. So every number below is chosen against the top of the control
 * and not against the middle, and three of them are held there by the suite
 * rather than by this paragraph:
 *
 * - **Pitch.** Wow and flutter arrive as delay-time modulation off a fixed table,
 *   so the bend is `depth × 2π × f` per component. The table's three components
 *   are 0.6Hz, 4.3Hz and 7.9Hz at fixed weights, and at full depth they sum to
 *   about 44 cents. That is audibly a machine dragging at something and is still
 *   under a quarter tone — see `depthSpan`, which is the number that was set by
 *   this bound rather than the other way round.
 * - **Level.** A dropout ducks toward `1 - (dropFloor + v * dropSpan)`, which
 *   bottoms out at .45. The signal thins; it never disappears.
 * - **Highs.** The same dropout pulls the lowpass down to no lower than
 *   `lpOpen - lpDropFloor - lpDropSpan`, 1800Hz. Dull, not gone.
 *
 * There is no dry path. Tape is not an effect running beside the signal, it is
 * the thing the signal is on — so at rest this is a 6ms delay at unity with no
 * modulation, which is a pass-through with a number attached.
 */
export const MAGNETS = {
  /** Clear of base + the widest wobble the tables can ask for. */
  maxDelay: 0.05,
  base: 0.006,
  /**
   * The two fixed tables, as buffers. Deliberately **not** at the context's own
   * sample rate: a modulation curve carries nothing above a few Hz, so 4kHz is
   * three orders of magnitude more resolution than it needs and the pair costs
   * 96k samples against CAVERN's 750k. That is cheap enough to build during the
   * wake rather than after it (gt#21).
   *
   * The two lengths are coprime-ish on purpose. 11 and 13 seconds means the wow
   * and the dropouts realign every 143 seconds rather than every 11, so the box
   * never settles into an audible loop — which is the one way a fixed table can
   * still sound wrong.
   */
  table: { rate: 4000, wobbleSeconds: 11, dropoutSeconds: 13 },
  /** The dropout table's seed and shape: how many dips, and how wide each is. */
  dropouts: { seed: 4801, count: 9, width: 0.16 },
  /**
   * Wobble depth `.00008 + v * .0016`, in seconds of delay-time swing.
   *
   * The span is set *by* the ceiling rather than the other way round. Every
   * component of the table bends pitch by `depth × weight × 2π × f`, and the
   * three sum to about 44 cents at the top of this range — under the quarter
   * tone the box is written around, with the margin on the right side of it. The
   * first number tried here was .0022 and it came out at 59 cents, which is over
   * a semitone of total swing and is where a drone stops sounding dragged and
   * starts sounding wrong. `tapePitchCeiling` in ./deterministic is what computes
   * this, and the suite fails if a later pass reaches past it.
   */
  depthFloor: 0.00008,
  depthSpan: 0.0016,
  /** How far a dropout ducks the level, `.05 + v * .5`. Bottoms at .45, never at 0. */
  dropFloor: 0.05,
  dropSpan: 0.5,
  /** The lowpass a dropout drags down from. */
  lpOpen: 9000,
  lpQ: 0.7,
  /** And how far, `2000 + v * 5200`Hz. Floors at 1800. */
  lpDropFloor: 2000,
  lpDropSpan: 5200,
  initial: { depth: 0.0006, drop: 0.16, lpDrop: 3300 },
} as const;

/**
 * OFFSET — everything arrives late, and not together (gt#41).
 *
 * Three taps at fixed relations off a base that grows with the control. The
 * ratios are 1 : 1.62 : 2.41 and they are deliberately not whole numbers: taps
 * at 1 : 2 : 3 are one comb filter and read as a tone, taps at these read as
 * three separate arrivals.
 *
 * **The taps are panned, and that is the box's entire reason to exist.** On a
 * board where nine voices share one root, spreading them in time is the cheapest
 * width available — but in mono, three delayed copies are phase smear rather than
 * width, which is a different and much smaller effect. Stereo is not new here:
 * CAVERN's impulse has been two channels with a seed per side since the port, so
 * the board already has a stereo field and this is the first box to put anything
 * anywhere in it.
 *
 * **Feedback is zero for the bottom half of the control**, by subtraction rather
 * than by a branch — `max(0, v - .45) * .85`. Below the midpoint OFFSET is three
 * taps and nothing else; above it the taps start feeding the first one and the
 * smear turns into a decay. The coefficient tops out at .4675, so the tail loses
 * more than half its level per pass and cannot run away, which is what makes this
 * box safe to find at the end of a chain SUMMON built without listening.
 */
export const OFFSET = {
  /** Well clear of the longest tap the base can ask for. */
  maxDelay: 0.25,
  /** Base `.023 + v * .05`, in seconds. The first tap sits exactly on it. */
  baseFloor: 0.023,
  baseSpan: 0.05,
  /** The three taps, as multiples of the base. Not whole numbers, on purpose. */
  taps: [1, 1.62, 2.41],
  /** Each tap's level, falling toward the back. */
  tapGains: [0.62, 0.48, 0.36],
  /** And where each sits across the field: left, centre, right. */
  tapPans: [-0.75, 0, 0.75],
  /** The dry path, which never moves. */
  dry: 0.85,
  /** Feedback `max(0, v - .45) * .85` — silent below the midpoint, .4675 at the top. */
  feedbackKnee: 0.45,
  feedbackSpan: 0.85,
  /** A gentle lowpass in the feedback loop, so repeats darken rather than pile up. */
  feedbackCutoff: 2200,
  feedbackQ: 0.6,
  initial: { base: 0.04, feedback: 0 },
} as const;

// --------------------------------------------------------------------- sources

/**
 * The eleven modules, in the order they are built. Two archetypes: a **drone**
 * sustains for as long as it is on, a **strike** fires against the heartbeat.
 */
export const DRONE_IDS = ['guitar', 'bass', 'chainsaw', 'sax', 'throat'] as const;
export const STRIKE_IDS = ['slowhit', 'cymbal', 'voice', 'maracas', 'cow', 'laser'] as const;
export const SOURCE_IDS = [...DRONE_IDS, ...STRIKE_IDS] as const;

export type DroneId = (typeof DRONE_IDS)[number];
export type StrikeId = (typeof STRIKE_IDS)[number];
export type SourceId = (typeof SOURCE_IDS)[number];

/**
 * The modules the handoff never drew — the same bargain {@link
 * POST_HANDOFF_BOXES} strikes for THE CHAIN, arriving for the sources with gt#42.
 *
 * Nine of the eleven are transcribed from engine2.js coefficient by coefficient
 * and quoted back against the reference markup name by name, and that
 * transcription is what keeps the ported half from drifting. A check like that
 * can only cover modules the reference actually contains, so THROAT and LASER
 * CANNON are named here once rather than the checks being loosened for all
 * eleven. The suites assert both halves: the nine still appear in the reference
 * exactly as it writes them, and neither of these two does.
 *
 * The list being short and explicit is the point, and there is a second reason
 * to keep it that way here. A registry that makes a tenth module cheap (gt#24) is
 * a registry that makes *forgetting to check a tenth module* cheap too. This is
 * the one place that says out loud which modules are outside the transcription,
 * so growing the board can never quietly become a way of shrinking the check.
 */
export const POST_HANDOFF_SOURCES: readonly SourceId[] = ['throat', 'laser'];

/**
 * The rattle's accent pattern. Twelve fixed entries, cycled — a burst of ten
 * hits lands on the first ten of these every time. Deliberately a table and not
 * a generator: the brief's first law is that nothing is randomised at runtime.
 *
 * engine2.js: `1, .55, .85, .5, .9, .6, .75, .5, .8, .65, .7, .55` — replaced by
 * ear (gt#20). The reference alternated loud and soft with a 2:1 range and no
 * grouping, which at ten hits inside half a bar read as one flat texture rather
 * than as a gesture. This table has the two things it was missing: accents every
 * third hit, so the burst has a pulse inside it, and a falling arc across the
 * ten, so it lands and decays instead of running on. The range is widened to
 * roughly 3:1 — the ghost notes drop to .3, which is what makes the accented
 * ones read as accents.
 *
 * A full burst is ten hits, so indices 10 and 11 are never reached; they exist
 * because the reference indexes `i % 12` and the modulo is what keeps that safe.
 */
export const ACCENTS = [1, 0.38, 0.52, 0.82, 0.34, 0.48, 0.7, 0.3, 0.44, 0.62, 0.34, 0.5] as const;

/**
 * GUITAR WALL — four saws at octave multiples into a pre-gain and one lowpass.
 * CROWD ("how many guitars showed up") widens the detune spread and brings the
 * upper two saws in, so more of it reads as a bigger room of players rather than
 * a louder one.
 */
export const GUITAR = {
  maxGain: 0.45,
  /** Octave multiples off the root. The doubled 2 is the wall's thickness. */
  mults: [1, 2, 2, 4],
  /** Each saw's share of the spread, in cents per unit. */
  baseDetune: [-1, -1.4, 1.2, 0.7],
  /** Every saw opens here; CROWD only ever moves the upper two. */
  stackGain: 0.8,
  /** Spread `4 + v * 24`, in cents. */
  spreadFloor: 4,
  spreadSpan: 24,
  /** The third saw, `.25 + v * .75`. */
  thirdFloor: 0.25,
  thirdSpan: 0.75,
  /** The fourth, `.1 + v * .7`. */
  fourthFloor: 0.1,
  fourthSpan: 0.7,
  /** Drive into the lowpass, `.24 + v * .18`. */
  preFloor: 0.24,
  preSpan: 0.18,
  initial: { pre: 0.3, cutoff: 1600, q: 0.8 },
} as const;

/**
 * BASS — a sine sub under a lightly distorted octave saw, both into a lowpass.
 * HEFT ("how much floor it takes up") is the balance between the two plus how
 * far the filter opens.
 *
 * The sub is the one voice on the board with no frequency floor, so at BEDROCK
 * and full SERIOUSNESS it sits at 13.75Hz with nothing above it to carry — and
 * turning HEFT up there trades the audible saw for an inaudible sine, so the
 * module thins out as the knob rises. That was checked by ear during the gt#20
 * pass and **kept**: it reads as a chop rather than as a dead control. Do not
 * "fix" it with a floor like SLOW HIT's without listening to it there first.
 */
export const BASS = {
  maxGain: 0.7,
  /** The saw sits an octave up, and four cents off it, so the pair never phases flat. */
  sawMult: 2,
  sawDetune: 4,
  /** A light shaper on the saw alone — the sub stays clean. */
  sawCurve: 0.3,
  /** Sub `.4 + v * .6`. */
  subFloor: 0.4,
  subSpan: 0.6,
  /** Saw `.3 - v * .14`: the saw gives way as the sub takes over. */
  sawFloor: 0.3,
  sawSpan: 0.14,
  /** Cutoff `500 + v * 500`. */
  cutoffFloor: 500,
  cutoffSpan: 500,
  initial: { sub: 0.8, saw: 0.2, cutoff: 750, q: 0.9 },
} as const;

/**
 * CHAINSAW — a detuned saw pair three octaves-and-a-fifth up, plus bandpass
 * noise, all through a gain a square LFO chops. REVS ("how hard it's being
 * worked") drives the chug rate, the pitch, the noise and the cutoff at once.
 */
export const CHAINSAW = {
  maxGain: 0.42,
  /** Both saws sit at `root × 3`, thirteen and fourteen cents apart. */
  mult: 3,
  detunes: [-13, 14],
  /** Chug rate `7 + v * 22`, in Hz. */
  rateFloor: 7,
  rateSpan: 22,
  /** Pitch multiplier `1 + v * .4` — the engine climbing as it is worked. */
  pitchFloor: 1,
  pitchSpan: 0.4,
  /** Noise `.1 + v * .28`. */
  noiseFloor: 0.1,
  noiseSpan: 0.28,
  /** Cutoff `1700 + v * 2000`. */
  cutoffFloor: 1700,
  cutoffSpan: 2000,
  initial: {
    chug: 0.6,
    cutoff: 2400,
    q: 1,
    noiseFreq: 950,
    noiseQ: 1.2,
    noise: 0.18,
    rate: 12,
    depth: 0.3,
    pitch: 1.16,
  },
} as const;

/**
 * SAXOPHONE — a square four octaves up through two bandpass formants, with
 * breath noise beside it and a vibrato on the detune. AGONY ("how badly it
 * wants out") pushes both formants up and opens the vibrato from 6 to 40 cents.
 */
export const SAX = {
  /**
   * engine2.js: .38 — raised by ear (gt#20). At the reference ceiling the sax
   * vanished under a full board. It is the narrowest voice on the board — a square
   * through two bandpass formants — so most of its amplitude sits in two thin
   * bands and it reads far quieter than its peak suggests.
   */
  maxGain: 0.62,
  mult: 4,
  /** First formant `540 + v * 560`. */
  formant1Floor: 540,
  formant1Span: 560,
  /** Second `1000 + v * 1000`. */
  formant2Floor: 1000,
  formant2Span: 1000,
  /** Vibrato rate `3.8 + v * 3.8`, depth `6 + v * 34` cents. */
  vibratoFloor: 3.8,
  vibratoSpan: 3.8,
  depthFloor: 6,
  depthSpan: 34,
  /** Breath `.04 + v * .15`. */
  breathFloor: 0.04,
  breathSpan: 0.15,
  initial: {
    formant1: 620,
    formant1Q: 7,
    formant1Gain: 0.9,
    formant2: 1150,
    formant2Q: 8,
    formant2Gain: 0.55,
    vibrato: 4.5,
    depth: 9,
    breathFreq: 2700,
    breathQ: 1,
    breath: 0.05,
  },
} as const;

/**
 * THROAT — Mongolian overtone singing, built the way khoomei actually works
 * (gt#42). A sawtooth an octave over the root is the buzz; a very narrow, high-Q
 * bandpass beside it is the overtone whistle, and WHISTLE ("where the overtone
 * sits") walks that resonance from the third harmonic of the buzz to the
 * twelfth.
 *
 * **The resonance is not a voice, and that is the whole safety argument.** A
 * bandpass adds no partial — it can only pick out ones the sawtooth already
 * has — so the whistle cannot be out of tune with anything on the board at any
 * knob position, and this module contributes exactly one nominal pitch to the
 * harmonic series check: `root × 2`. A swept *oscillator* here would have been a
 * continuously detuning voice and would have broken that invariant the moment it
 * left a harmonic. See {@link INTERVALS}.
 *
 * The harmonic bounds are not integers and are not meant to be. A singer sweeps
 * *through* the series rather than stepping between its rungs, and the whistle
 * popping in and out as it passes each harmonic is the sound — a filter between
 * two partials simply finds less to amplify.
 */
export const THROAT = {
  maxGain: 0.5,
  /** An octave over the root, so the buzz sits clear of BASS's sub. */
  mult: 2,
  /** Where the whistle sits, as a harmonic of the buzz: `3 + v * 9`. */
  harmonicFloor: 3,
  harmonicSpan: 9,
  /**
   * The resonance tightens as it climbs, `18 + v * 26`. The upper harmonics are
   * closer together in absolute terms, so a Q that reads as a whistle down at
   * the third reads as a smear up at the twelfth.
   */
  qFloor: 18,
  qSpan: 26,
  /**
   * How loud the whistle is against the buzz, `.5 + v * 2.2`.
   *
   * Steep on purpose, and paired with {@link bodySpan} below. The harmonics of
   * a sawtooth fall off as one over their number, so the twelfth is a quarter
   * the size of the third before any gain: the whistle has to be turned up
   * more than fivefold across the knob just to be heard climbing.
   */
  whistleFloor: 0.5,
  whistleSpan: 2.2,
  /**
   * And the body gives way as the whistle climbs, `.9 - v * .1`. A khoomei
   * singer pulls the drone back to let the overtone through; a buzz held flat
   * under a rising whistle is two sounds rather than one throat.
   *
   * **The balance moves; the module's loudness does not (gt#65).** This pair
   * was first `.5 + v * .85` against `.9 - v * .45`, by argument, and rendered
   * it came out 6 LU quieter at the top of WHISTLE than at the bottom: the
   * body carries nearly all of the level, so halving it halved the module,
   * and the control read as a volume knob with a tone on it. The same shift
   * in balance is now made mostly by raising the whistle. Measured across the
   * knob it holds within about 1 LU, and peaks no higher than it did.
   */
  bodyFloor: 0.9,
  bodySpan: 0.1,
  /** The buzz's lowpass, `900 + v * 1500`. */
  cutoffFloor: 900,
  cutoffSpan: 1500,
  /** The air fed into the resonator alongside the buzz, `.03 + v * .07`. */
  airFloor: 0.03,
  airSpan: 0.07,
  initial: {
    cutoff: 1550,
    q: 0.9,
    body: 0.7,
    whistle: 0.9,
    whistleQ: 31,
    air: 0.065,
  },
} as const;

/**
 * SLOW HIT — a sine dropped from `root × 3` down toward `root × .9`, with a
 * highpassed click on the front so it has an edge as well as a body. WEIGHT
 * ("how much the room shakes") sets both how far it starts above the drop and
 * how long the tail runs.
 */
export const SLOWHIT = {
  maxGain: 0.85,
  phase: 0,
  /** Start `max(50, root * 3)`, land on `max(26, root * .9)`. */
  startMult: 3,
  startFloor: 50,
  endMult: 0.9,
  endFloor: 26,
  /** WEIGHT lifts the start pitch by `1 + w * .8`. */
  liftSpan: 0.8,
  /** The drop takes `.22 + w * .25` seconds. */
  dropFloor: 0.22,
  dropSpan: 0.25,
  /** Body: up to .95 in 6ms, then down to silence over `.7 + w * 1.4`. */
  peak: 0.95,
  attack: 0.006,
  decayFloor: 0.7,
  decaySpan: 1.4,
  /** The oscillator outlives the longest tail. */
  life: 2.4,
  /** Click: a 50ms burst of highpassed noise. */
  clickFreq: 1400,
  clickQ: 1,
  clickGain: 0.2,
  clickDecay: 0.05,
  clickLife: 0.07,
  /** Every envelope in the board falls to this rather than to zero — exponential ramps cannot reach it. */
  silence: 0.001,
} as const;

/**
 * CYMBAL SWELL — noise through a highpass and a peaking lift, swelling for
 * three quarters of a second and then falling away for two and a half. HISS
 * ("how much air it moves") moves the highpass from 2.4kHz to 6.6kHz.
 */
export const CYMBAL = {
  maxGain: 0.5,
  phase: 2,
  /** Highpass `2400 + h * 4200`. */
  cutoffFloor: 2400,
  cutoffSpan: 4200,
  cutoffQ: 0.9,
  /** A peaking lift on top, `4 + h * 6` dB. */
  peakFreq: 7500,
  peakQ: 1,
  peakFloor: 4,
  peakSpan: 6,
  /** Rise to `.4 + h * .25` over .75s, then out over 2.6s. */
  levelFloor: 0.4,
  levelSpan: 0.25,
  rise: 0.75,
  tail: 2.6,
  /** Read from .3s into the noise buffer, and hold it a hair past the tail. */
  offset: 0.3,
  life: 2.7,
  silence: 0.001,
} as const;

/**
 * THE VOICE — a source through three gliding formants, one entry per MODE.
 * WHISPER has no oscillator at all: it is the same three formants over pure
 * noise, which is what makes it read as a voice with nothing behind it.
 */
export const VOICE = {
  maxGain: 0.6,
  phase: 1,
  /** MODE opens on CHANT, not on the half-way default every other module takes. */
  initialChar: 1,
  /** The oscillator never drops below this, nor its bend target below 20Hz. */
  pitchFloor: 30,
  bendFloor: 20,
  /** Formants start gliding 100ms in and arrive four fifths of the way through. */
  glideStart: 0.1,
  glideEnd: 0.8,
  /** Noise reads from half a second in, at half the table's level. */
  noiseOffset: 0.5,
  noiseScale: 0.5,
  /** The envelope holds from three fifths of the way through. */
  hold: 0.6,
  /** Every phrase's nodes outlive it by this much. */
  tail: 0.1,
  silence: 0.001,
} as const;

/** One formant: where it sits, how narrow it is, and how much of it is heard. */
export type Formant = readonly [frequency: number, q: number, gain: number];

/**
 * One MODE. `osc` is the waveform behind the formants, or null for WHISPER;
 * `mult` places it off the root and `bend` is the pitch it ends on as a fraction
 * of where it started. `glide` is where each formant arrives.
 */
export interface VoiceMode {
  readonly osc: OscillatorType | null;
  readonly mult: number;
  readonly bend: number;
  readonly duration: number;
  readonly attack: number;
  readonly gain: number;
  readonly drive: number;
  readonly noise: number;
  readonly formants: readonly Formant[];
  readonly glide: readonly number[];
}

/** GROWL, CHANT, SHRIEK, WHISPER — the four words on the MODE selector, in order. */
export const VOICE_MODES: readonly VoiceMode[] = [
  {
    // GROWL
    osc: 'sawtooth',
    mult: 2,
    bend: 0.82,
    duration: 2.3,
    attack: 0.12,
    gain: 0.9,
    drive: 0.5,
    noise: 0.18,
    formants: [
      [300, 6, 1],
      [620, 7, 0.7],
      [950, 8, 0.35],
    ],
    glide: [240, 520, 820],
  },
  {
    // CHANT
    osc: 'sawtooth',
    mult: 2,
    bend: 1,
    duration: 2.9,
    attack: 0.45,
    gain: 0.8,
    drive: 0.15,
    noise: 0.05,
    formants: [
      [700, 7, 1],
      [1080, 8, 0.55],
      [2650, 11, 0.2],
    ],
    glide: [430, 760, 2400],
  },
  {
    // SHRIEK
    osc: 'sawtooth',
    mult: 8,
    bend: 0.62,
    duration: 1.4,
    attack: 0.02,
    gain: 0.75,
    drive: 0.4,
    noise: 0.4,
    formants: [
      [950, 7, 1],
      [1750, 8, 0.75],
      [2900, 9, 0.45],
    ],
    glide: [820, 1500, 2600],
  },
  {
    // WHISPER — no oscillator, only noise through the formants.
    osc: null,
    mult: 0,
    bend: 1,
    duration: 2.5,
    attack: 0.35,
    gain: 0.6,
    drive: 0,
    noise: 1,
    formants: [
      [420, 5, 0.85],
      [1350, 6, 0.6],
      [2500, 7, 0.5],
    ],
    glide: [520, 1500, 2700],
  },
];

/**
 * MARACAS — a burst of hits rather than one. FRENZY ("how out of hand the
 * rattle gets") sets both how many land, one to ten, and how tightly they
 * bunch, from 115ms apart down to 60ms.
 */
export const MARACAS = {
  maxGain: 0.5,
  phase: 0,
  /** Hits `1 + round(v * 9)`. */
  hitsFloor: 1,
  hitsSpan: 9,
  /** Gap `.115 - v * .055`, in seconds. */
  gapFloor: 0.115,
  gapSpan: 0.055,
  /** Each hit: noise through a highpass into a bandpass. */
  highpass: 4200,
  highpassQ: 0.8,
  bandpass: 6600,
  bandpassQ: 1.4,
  /** Peak `.8 × ACCENTS[i % 12]` in 4ms, gone in 50. */
  peak: 0.8,
  attack: 0.004,
  decay: 0.05,
  life: 0.07,
  /** Each hit reads from a different place in the noise buffer, cycling every seven. */
  offsetStep: 0.11,
  offsetCycle: 7,
  silence: 0.001,
} as const;

/**
 * COW — a saw bent up and then dropped, through two descending formants into a
 * waveshaper. DESPAIR ("how far the moo has fallen") sets how far the end pitch
 * falls and stretches the whole thing as it goes.
 */
export const COW = {
  maxGain: 0.6,
  phase: 3,
  /** Starts at `max(40, root * 5) * .92`. */
  mult: 5,
  pitchFloor: 40,
  startBend: 0.92,
  /** Up to `× 1.16` in 170ms — the intake before the moo. */
  riseBend: 1.16,
  rise: 0.17,
  /** Then down to `× (1.12 - d * .9)`, never below 24Hz, over `1 + d * .5`. */
  fallFloor: 1.12,
  fallSpan: 0.9,
  endFloor: 24,
  fallTimeFloor: 1,
  fallTimeSpan: 0.5,
  /** Duration `1.25 + d * .55`. */
  durationFloor: 1.25,
  durationSpan: 0.55,
  /** Two formants, both sliding down over the first second. */
  formant1: { start: 430, q: 6, end: 300, gain: 1 },
  formant2: { start: 820, q: 7, end: 520, gain: 0.6 },
  formantGlide: 1,
  /** A light shaper across the pair, so the moo has some throat in it. */
  curve: 0.3,
  /** Up to .9 in 50ms, held to 55% of the way through, then out. */
  peak: 0.9,
  attack: 0.05,
  hold: 0.55,
  /** The oscillator outlives the envelope. */
  tail: 0.1,
  silence: 0.001,
} as const;

/**
 * LASER CANNON — the one on the board that admits it is silly (gt#42). A square
 * dropped fast from `root × 48`, a noise crack on the front, both through a
 * delay whose time is ramped across the shot, which is a flanger made of one
 * node and no LFO.
 *
 * CHARGE ("how big the shot is") runs the shot up until {@link dischargeAt},
 * and past that the cannon **stops firing and starts discharging**: the sweep
 * goes an order of magnitude lower and roughly five times longer, a sub-octave
 * square joins underneath it and the crack becomes a swell. One control, two
 * behaviours — the only knob on this board that changes *what* a module does
 * rather than how much of it there is, which is the joke and is meant to read
 * as one.
 *
 * The interval is the fifth and the start multiplier is 32, so the shot opens on
 * `root × 48` — around 1.6kHz where the board opens, which is where a laser has
 * to start if it is going to be one. That partial is new to the board and its
 * *pitch class* is not: fold 48 back into one octave and it is 1.5, the fifth
 * THE VOICE already chants, so the cannon adds no fourth note to the chord.
 *
 * The fifth is also the one interval with no height requirement, which matters
 * for a module whose entire gesture is downward: at BEDROCK with SERIOUSNESS
 * over, the discharge bottoms out on {@link pitchFloor} and there is nothing
 * down there for it to be a semitone away from.
 */
export const LASER = {
  maxGain: 0.7,
  /**
   * Offsets `0/2/1/0/3` were taken and every class mod 4 is claimed, so no
   * sixth strike can be collision-free at every divisor. 5 is unique at 8 and
   * 16 — the sparse settings a shot this size belongs on, and where this module
   * opens — and at 4 it lands with THE VOICE rather than on the SLOW HIT and
   * MARACAS pile at zero.
   */
  phase: 5,
  /** `root × 1.5 × 32` — about 1.6kHz where the board opens, and the top of the sweep. */
  startMult: 32,
  /** How far the shot falls, `× .06 - c * .02`, and how long it takes. */
  endFloor: 0.06,
  endSpan: 0.02,
  sweepFloor: 0.16,
  sweepSpan: 0.14,
  /** Never below this, whatever the root and the charge conspire to ask for. */
  pitchFloor: 18,
  /** The shot's envelope: up in 6ms, out by `.34 + c * .3`. */
  attack: 0.006,
  peakFloor: 0.55,
  peakSpan: 0.35,
  decayFloor: 0.34,
  decaySpan: 0.3,
  /** The crack on the front: highpassed noise, gone in a tenth of a second. */
  crackFreq: 1800,
  crackQ: 0.7,
  crackFloor: 0.25,
  crackSpan: 0.35,
  crackDecay: 0.09,
  crackLife: 0.12,
  /** Read from its own place in the one noise buffer, so it is not SLOW HIT's click. */
  crackOffset: 0.31,
  /**
   * The flange. `delayTime` is ramped from 9ms to 1ms across the shot rather
   * than driven by an LFO — a swept delay against the dry signal is what a
   * flanger is, and one ramp per trigger is deterministic where a free-running
   * oscillator would put the sweep at a different place every shot.
   */
  delayMax: 0.05,
  delayFrom: 0.009,
  delayTo: 0.001,
  wet: 0.55,
  /** Past this the cannon discharges instead of firing. */
  dischargeAt: 0.85,
  discharge: {
    /** Down to `× .006` over two and a half seconds. Sub-bass, and then some. */
    end: 0.006,
    sweep: 2.5,
    /** A second square an octave under the first, so the drop has a floor to it. */
    subMult: 0.5,
    subGain: 0.7,
    peak: 0.95,
    decay: 3.2,
    /** The crack becomes a swell: up over a second, out over the whole drop. */
    crackRise: 1,
    crackGain: 0.5,
    crackLife: 3.4,
    /** The flange opens right out, and stays open. */
    delayFrom: 0.002,
    delayTo: 0.03,
  },
  /** The oscillators outlive their envelopes. */
  tail: 0.15,
  silence: 0.001,
} as const;

// ---------------------------------------------------------------------- voices

/**
 * Ceiling on concurrent one-shot nodes. Skip a hit rather than exceed it.
 *
 * One-shot means exactly that: the strikes get all twenty-four. A drone's
 * session-long noise tap is built once and never ends, so it is not counted —
 * see `Engine.makeNoiseLoop`. Counting those (gt#31) left the strikes twenty-two
 * of a number documented as twenty-four, and the gap would have widened by one
 * for every drone added afterwards.
 *
 * **A stated departure from engine2.js, which has 24 (gt#68), moved by measuring
 * rather than by ear.** 24 was sized for the reference's five strikes. A voice
 * is counted from the moment it is booked, a lookahead before it sounds, and a
 * MARACAS burst books all ten of its hits at once — so on a board with every
 * strike on *constantly* the first four modules in {@link STRIKE_IDS} filled the
 * cap on every beat and the last two never got in. Rendered at WALKING, COW and
 * LASER CANNON each fired 2 beats in 48 and MARACAS landed 7 hits of 10; at the
 * opening tempo LASER CANNON still fired 2 in 32. Those are modules that are
 * lit and silent, which is the one thing a control on this board may not be.
 *
 * What the board can actually ask for, measured the same way with the cap
 * lifted: 47 at WALKING (SLOW HIT 5, CYMBAL SWELL 4, THE VOICE 8, MARACAS 12,
 * COW 3, a discharging LASER CANNON 15) and 34 at the opening tempo. Rendering
 * 47 took no longer than rendering 24: the cost of this board is its standing
 * graph, not its one-shots.
 *
 * So the cap is that worst case, the hammer's six on top of it, and a few
 * pokes — which makes it what it was written to be, a guard against a board
 * nobody anticipated, and no longer something an ordinary full board runs
 * into. tests/heartbeat.test.ts recounts the worst case from the modules
 * themselves, so a seventh strike cannot quietly make it the resting state
 * again.
 */
export const VOICE_CAP = 56;

/**
 * A strike module that has been silent for a moment fires an extra hit when
 * touched — otherwise one set to *almost never* could go sixteen beats before
 * proving it exists.
 */
/**
 * The hammer's own sound (gt#87) — see ./hammer for what each part is for. None
 * of this is transcribed: engine2.js has no hammer, and the reference's blow is
 * silent. Chosen by arithmetic and not yet by ear, which is said here so nobody
 * mistakes these for tuned numbers; `level` is the one to turn first.
 *
 * - `level` scales the whole blow into the master. It sits under a SLOW HIT at
 *   full loudness (.85) on purpose: the new board arrives on the same frame,
 *   sometimes with a drum on top, and the compressor has to take both.
 * - `thump` is a sine from 120Hz to 36Hz in a tenth of a second — it starts
 *   over every root the board can be tuned to and lands in the middle of where
 *   they sit, so it is felt whatever TUNING is doing — up in 4ms and gone in
 *   four tenths.
 * - `ring` is four partials over a 410Hz base at 1, 2.32, 3.71 and 5.43 times
 *   it. None is a whole multiple of another, which is the entire difference
 *   between a struck plate and a note. Each is .62 as loud and .7 as long-lived
 *   as the one under it, from half a second at the bottom.
 * - `crack` is 45ms of noise through a band at 3.4kHz.
 */
export const HAMMER = {
  level: 0.75,
  thump: { from: 120, to: 36, drop: 0.1, attack: 0.004, peak: 0.9, decay: 0.4, life: 0.5 },
  ring: {
    base: 410,
    partials: [1, 2.32, 3.71, 5.43],
    peak: 0.45,
    quieten: 0.62,
    attack: 0.002,
    decay: 0.5,
    shorten: 0.7,
    /** The oscillator outlives its envelope by this, so it stops in silence. */
    tail: 0.05,
  },
  crack: { freq: 3400, q: 1.2, peak: 0.6, decay: 0.045, life: 0.07 },
  /** Scheduled a hair ahead so the blow lands cleanly — {@link POKE.lead}'s reason. */
  lead: 0.03,
  /** Every envelope falls to this rather than to zero; an exponential ramp cannot reach it. */
  silence: 0.001,
} as const;

export const POKE = {
  /** Only poke if nothing has been heard for this long. */
  idle: 1,
  /** And not more than once per this. */
  debounce: 0.9,
  /** Scheduled a hair ahead so the hit lands cleanly. */
  lead: 0.03,
  /** The strike callback fires on a plain timer; the bloom is its only reader. */
  callbackDelayMs: 40,
} as const;
