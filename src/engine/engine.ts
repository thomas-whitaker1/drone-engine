// The spine of the audio engine, ported from the original design's reference
// engine (engine2.js in the comments; see ./constants).
// Everything else hangs off this: the four modifiers register themselves in
// `modifiers`, the nine sources register an outlet in `sources`, and the scheduler
// drives their triggers. This file owns the master chain, the analysers the visual
// system reads, the deterministic buffers, the node factories, and the control
// surface the UI is allowed to touch.

import {
  ANALYSER,
  COMPRESSOR,
  DEFAULT_BPM,
  DEFAULT_GLOBALS,
  HAMMER,
  HEARTBEAT,
  IMPULSE_SEEDS,
  INTERVALS,
  LEVEL_SCALE,
  LOW_TAP,
  MASTER_CURVE,
  MASTER_GAIN,
  MASTER_OVERSAMPLE,
  NOISE,
  OUTPUT,
  POKE,
  ROOTS,
  SMOOTH,
  SMOOTH_POWER,
  SOFT_START,
  TEMPOS,
  VOICE_CAP,
  WARM,
} from './constants';
import {
  curveKey,
  fillImpulse,
  fillNoise,
  heardGain,
  heardLength,
  impulseFiller,
  shaperCurve,
} from './deterministic';
import { hammerBlow } from './hammer';
import { Heartbeat } from './scheduler';

// ----------------------------------------------------------------------- types

/** One patch cable. `from` is a source or modifier id; `to` is always a modifier. */
export interface Wire {
  readonly from: string;
  readonly to: string;
}

/** The two globals that move the whole board at once. */
export interface Globals {
  seriousness: number;
  tuning: number;
}

/** What the visual system reads, and the only thing it reads. */
export interface Levels {
  readonly master: number;
  readonly low: number;
}

/** A modifier box: uniformly `in → fx → out`, with `out` placed by the wire list. */
export interface Modifier {
  readonly id: string;
  readonly in: AudioNode;
  readonly out: AudioNode;
  amount: number;
  /** Apply this box's own amount, 0–1. */
  set(amount: number): void;
  /**
   * Optional hook for a box that also listens to a global — CAVERN crossfades its
   * two impulses by SERIOUSNESS rather than by its own control.
   */
  setSeriousness?(seriousness: number): void;
}

/**
 * A source's terminal pair plus its bookkeeping. `loud` carries the HOW LOUD
 * value scaled by the module's `maxGain`; `pow` is the 0/1 gate the router moves.
 * Synthesis fields are filled in by whichever builder owns the module.
 */
export interface Outlet {
  readonly id: string;
  readonly loud: GainNode;
  readonly pow: GainNode;
  readonly maxGain: number;
  /**
   * This module's fixed ratio off the board's root (gt#38), resolved from the word
   * its registry entry names. Read it through {@link Engine.rootOf} rather than
   * multiplying by hand — a builder that reaches for {@link Engine.root} instead
   * is a module that silently ignores its own interval.
   */
  readonly interval: number;
  on: boolean;
  loudV: number;
  charV: number;
  often: number;
  lastHit: number;
  /** Strike modules only — a fixed beat offset so they don't pile up. */
  phase?: number;
  setChar?(value: number): void;
  retune?(root: number): void;
  trigger?(time: number): void;
  /** When this module was last poked, so touching it repeatedly doesn't stutter. */
  pokedAt?: number;
}

/** The whole API the board is allowed to call. Everything else is builders' work. */
export interface EngineControls {
  setPower(id: string, on: boolean): void;
  /**
   * A control of this source was touched, before any value has moved. A strike
   * that has gone quiet answers with a hit; anything else is a no-op.
   */
  touch(id: string): void;
  /**
   * `prove` is what separates a hand from a clock, and it defaults to the hand.
   *
   * Both of these poke a quiet strike into an immediate hit, so that touching any
   * control of a module proves the module exists — the board's second hardest
   * promise, and the reason `setLoud` reaches for {@link Engine.poke} at all. That
   * is a rule about *gestures*. MEGADRIFT (gt#43) moves the same two values with no
   * hand anywhere near them, ten times a second, and the poke's debounce is nine
   * tenths of one: a drift that proved itself on every tick would fire a hit a
   * second out of every strike module on the board, forever, and turn the
   * slowest feature in the product into a metronome.
   *
   * So the drift passes `false` and nothing else does. It is a parameter rather
   * than a separate pair of setters because the sound made is identical — the
   * only difference is whether anybody asked.
   */
  setLoud(id: string, value: number, prove?: boolean): void;
  setChar(id: string, value: number, prove?: boolean): void;
  setOften(id: string, step: number): void;
  setMod(id: string, amount: number): void;
  setGlobal<K extends keyof Globals>(key: K, value: Globals[K]): void;
  setBpm(bpm: number): void;
  setWires(wires: readonly Wire[]): void;
  levels(): Levels;
}

export interface EngineOptions {
  bpm?: number;
  /** Fires at the moment a strike is heard. The bloom layer is its only consumer. */
  onStrike?(id: string): void;
  /**
   * Fires at the moment a beat falls (gt#83), with its count since the engine
   * woke. Every beat, at every tempo, whether or not anything strikes on it —
   * the heartbeat as something a board can be told about rather than only hear.
   * Like {@link EngineOptions.onStrike} it is one-way: nothing it is given can
   * reach back, and the engine does nothing with whatever it returns.
   */
  onBeat?(count: number): void;
  /** Supply a context instead of constructing one — offline rendering and tests. */
  context?: BaseAudioContext;
}

/**
 * Work put off until after the wake (gt#21), a stretch at a time (gt#30). Called
 * once per task; says `true` while it has more to do. A job that returns
 * nothing is done in one call.
 */
export type WarmJob = () => boolean | void;

/** Everything `start()` builds. Absent until then, which is what `levels()` guards. */
interface MasterChain {
  readonly ctx: BaseAudioContext;
  readonly noiseBuf: AudioBuffer;
  readonly masterIn: GainNode;
  readonly shaper: WaveShaperNode;
  readonly comp: DynamicsCompressorNode;
  readonly masterOut: GainNode;
  readonly analyser: AnalyserNode;
  readonly lowFilter: BiquadFilterNode;
  readonly lowAnalyser: AnalyserNode;
}

// ---------------------------------------------------------------------- engine

export class Engine implements EngineControls {
  readonly globals: Globals = { ...DEFAULT_GLOBALS };
  /** Registered by the source builders, keyed by module id. */
  readonly sources: Record<string, Outlet> = {};
  /** Registered by the modifier builders, in chain order. */
  readonly modifiers: Record<string, Modifier> = {};

  bpm: number;
  wires: Wire[] = [];
  /** Live one-shot nodes, counted against {@link VOICE_CAP}. */
  active = 0;
  /** The pulse every strike hangs off. Idle until {@link start}. */
  readonly heartbeat = new Heartbeat(this);

  private readonly opts: EngineOptions;
  private chain: MasterChain | null = null;
  private readonly curves = new Map<number, Float32Array<ArrayBuffer>>();
  private masterBins: Uint8Array<ArrayBuffer> | null = null;
  private lowBins: Uint8Array<ArrayBuffer> | null = null;
  /** Work a builder handed to {@link warm}, front first. A job leaves when it is done. */
  private readonly warmJobs: WarmJob[] = [];
  private warmed = false;
  /** The one timer between two stretches of that work. */
  private warmTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: EngineOptions = {}) {
    this.opts = opts;
    this.bpm = clampBpm(opts.bpm ?? DEFAULT_BPM);
  }

  /**
   * Build the master chain. Needs a user gesture behind it in a browser, which is
   * what the WAKE IT lever is for. Calling it twice is a no-op.
   */
  start(): void {
    if (this.chain) return;
    const ctx = this.opts.context ?? openAudioContext();

    const masterIn = ctx.createGain();

    const shaper = ctx.createWaveShaper();
    shaper.oversample = MASTER_OVERSAMPLE;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = COMPRESSOR.threshold;
    comp.ratio.value = COMPRESSOR.ratio;
    comp.knee.value = COMPRESSOR.knee;
    comp.attack.value = COMPRESSOR.attack;
    comp.release.value = COMPRESSOR.release;

    const masterOut = ctx.createGain();
    masterOut.gain.value = MASTER_GAIN;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = ANALYSER.fftSize;
    analyser.smoothingTimeConstant = ANALYSER.smoothing;

    const lowFilter = ctx.createBiquadFilter();
    lowFilter.type = 'lowpass';
    lowFilter.frequency.value = LOW_TAP.frequency;

    const lowAnalyser = ctx.createAnalyser();
    lowAnalyser.smoothingTimeConstant = LOW_TAP.smoothing;

    masterIn.connect(shaper);
    shaper.connect(comp);
    comp.connect(masterOut);
    masterOut.connect(ctx.destination);
    masterOut.connect(analyser);
    masterOut.connect(lowFilter);
    lowFilter.connect(lowAnalyser);

    const noiseBuf = ctx.createBuffer(1, Math.floor(NOISE.seconds * ctx.sampleRate), ctx.sampleRate);
    fillNoise(noiseBuf.getChannelData(0), NOISE.seed);

    this.chain = {
      ctx,
      noiseBuf,
      masterIn,
      shaper,
      comp,
      masterOut,
      analyser,
      lowFilter,
      lowAnalyser,
    };

    // The master's fixed light grit. Set through the memo so it shares the cache.
    shaper.curve = this.curve(MASTER_CURVE);

    // And the climb out of silence (gt#44). `masterOut.gain` keeps its nominal
    // MASTER_GAIN above — that is the value the reference sets and the mix is
    // built around — and this schedules over it, which is how Web Audio wants a
    // fade written: the value is the resting position, the automation is what
    // the parameter is actually doing.
    //
    // Both analysers hang off `masterOut`, so this is not only a fade on the
    // sound: `levels()` reads near zero for the first moments and the room's
    // wash comes up with the volume rather than snapping on ahead of it. That is
    // the right behaviour and it is free, but it is a consequence rather than a
    // decision made here, and a reader chasing a dark first second should find
    // it written down.
    // Read once: two calls to `now()` can straddle a render quantum, and a ramp
    // whose end is measured from a later clock than its start is a ramp of the
    // wrong length.
    const woke = this.now();
    masterOut.gain.setValueAtTime(0, woke);
    masterOut.gain.linearRampToValueAtTime(MASTER_GAIN, woke + SOFT_START);

    this.applyGlobals();
    this.route();
    this.heartbeat.start();
  }

  /**
   * Hand {@link warm} a job. A builder calls this with anything it needs but
   * does not need *yet*, so that the work lands after the board is up rather
   * than inside the one frame the lever is paid for.
   *
   * Registering after the warm has already begun joins the back of the line:
   * "later" has been and gone, and a builder should not have to know that.
   */
  onWarm(job: WarmJob): void {
    this.warmJobs.push(job);
    if (this.warmed) this.queueWarm();
  }

  /**
   * Begin everything the builders deferred. Called once the wake overlay is
   * gone — see ../app — because that is the first moment on this page with no
   * animation waiting on the main thread. Idempotent, and a no-op on a board
   * that was never started, which has nothing to warm.
   *
   * Nothing runs inside this call (gt#30). The work is done a stretch per task,
   * {@link WARM.gapMs} apart, so the frame that first draws the woken board is
   * not also the frame that builds a room. {@link settle} is the same work with
   * no waiting, for a caller with no frames to protect.
   */
  warm(): void {
    if (this.warmed || !this.chain) return;
    this.warmed = true;
    this.queueWarm();
  }

  /**
   * Finish everything deferred, now, in this call. For an offline render,
   * which has to have its whole graph before it starts, and for a suite that
   * wants the finished board without a clock. The result is the one
   * {@link warm} arrives at.
   */
  settle(): void {
    if (!this.chain) return;
    this.warmed = true;
    this.clearWarmTimer();
    for (let job = this.warmJobs[0]; job; job = this.warmJobs[0]) {
      while (job() === true);
      this.warmJobs.shift();
    }
  }

  /** One stretch of the front job, a gap from now. One timer at a time. */
  private queueWarm(): void {
    if (this.warmTimer !== null || !this.warmJobs.length) return;
    this.warmTimer = setTimeout(() => {
      this.warmTimer = null;
      const job = this.warmJobs[0];
      if (job && job() !== true) this.warmJobs.shift();
      this.queueWarm();
    }, WARM.gapMs);
  }

  private clearWarmTimer(): void {
    if (this.warmTimer === null) return;
    clearTimeout(this.warmTimer);
    this.warmTimer = null;
  }

  /**
   * Stop the pulse. Everything already booked still sounds, and the graph stays
   * up — this is how a board that is being torn down lets its timers go, not a
   * pause button. A warm-up still under way stops where it is: a room that
   * arrives on a torn-down page is nobody's.
   */
  stop(): void {
    this.heartbeat.stop();
    this.clearWarmTimer();
  }

  // -------------------------------------------------------------- engine state

  /** Throws before {@link start}. Builders only ever run after it. */
  private get audio(): MasterChain {
    if (!this.chain) throw new Error('The audio engine has not been started yet.');
    return this.chain;
  }

  get started(): boolean {
    return this.chain !== null;
  }

  get context(): BaseAudioContext {
    return this.audio.ctx;
  }

  /** Where everything eventually lands — sources and modifiers with nowhere else to go. */
  get masterIn(): GainNode {
    return this.audio.masterIn;
  }

  /** The one looping noise buffer. */
  get noiseBuffer(): AudioBuffer {
    return this.audio.noiseBuf;
  }

  now(): number {
    return this.audio.ctx.currentTime;
  }

  /** The root every pitch on the board is derived from. */
  root(): number {
    const index = Math.min(ROOTS.length - 1, Math.max(0, Math.round(this.globals.tuning)));
    return (ROOTS[index] ?? ROOTS[0]) * Math.pow(2, -this.globals.seriousness);
  }

  /**
   * The root *this* module sits on: the board's, times the fixed interval its
   * registry entry names (gt#38). Six of the nine name `root` and get {@link root}
   * back unchanged; the other three are what makes the board a chord rather than
   * nine voices agreeing.
   *
   * Every builder derives its pitch from this and none from {@link root}, which
   * is what keeps the interval a single fact in a single place — including for
   * the strikes, which read it inside `trigger` rather than being handed it by
   * {@link applyGlobals}.
   */
  rootOf(outlet: Outlet): number {
    return this.root() * outlet.interval;
  }

  // ------------------------------------------------------------ builders' kit
  // Public because the modifier and source builders use them; not part of
  // EngineControls, and not for the UI.

  /**
   * A stereo reverb impulse. One fixed seed per channel.
   *
   * `seconds` is how long the room is. The buffer is shorter: it stops where the
   * tail has fallen eighty decibels and there is nothing left of it to hear —
   * see {@link IMPULSE}. Whoever plays it owes it {@link impulseTrim}.
   */
  impulse(seconds: number, decay: number): AudioBuffer {
    const { ctx } = this.audio;
    const span = Math.floor(seconds * ctx.sampleRate);
    const buffer = ctx.createBuffer(2, heardLength(span, decay), ctx.sampleRate);
    for (let channel = 0; channel < IMPULSE_SEEDS.length; channel++) {
      fillImpulse(buffer.getChannelData(channel), IMPULSE_SEEDS[channel] ?? 0, decay, span);
    }
    return buffer;
  }

  /**
   * The gain that puts a room built by {@link impulse} back at the level the
   * whole impulse played at. A convolver levels what it is given by its mean
   * power, so one that has had its silent tail cut off plays quieter for it;
   * this is the amount. See `heardGain` in ./deterministic.
   */
  impulseTrim(seconds: number, decay: number): number {
    return heardGain(Math.floor(seconds * this.audio.ctx.sampleRate), decay);
  }

  /**
   * The same impulse as {@link impulse}, as a job for {@link onWarm} (gt#30):
   * {@link WARM.slice} samples a call, one channel after the other, and `done`
   * is handed the buffer once it is whole. A convolver copies its buffer when
   * it is given one, so it must never see a part-written one.
   *
   * Nothing is allocated until the first call, so asking for the job costs the
   * wake frame nothing.
   */
  impulseJob(seconds: number, decay: number, done: (buffer: AudioBuffer) => void): WarmJob {
    let buffer: AudioBuffer | null = null;
    let fillers: ((count: number) => boolean)[] = [];
    let channel = 0;
    return () => {
      if (!buffer) {
        const { ctx } = this.audio;
        const span = Math.floor(seconds * ctx.sampleRate);
        const made = ctx.createBuffer(2, heardLength(span, decay), ctx.sampleRate);
        buffer = made;
        fillers = IMPULSE_SEEDS.map((seed, index) =>
          impulseFiller(made.getChannelData(index), seed, decay, span),
        );
      }
      if (fillers[channel]?.(WARM.slice) !== true) channel++;
      if (channel < fillers.length) return true;
      done(buffer);
      return false;
    };
  }

  /** A soft-clip curve for `amount`, quantised and memoised. */
  curve(amount: number): Float32Array<ArrayBuffer> {
    const key = curveKey(amount);
    let curve = this.curves.get(key);
    if (!curve) {
      curve = shaperCurve(amount);
      this.curves.set(key, curve);
    }
    return curve;
  }

  makeGain(value: number): GainNode {
    const gain = this.audio.ctx.createGain();
    gain.gain.value = value;
    return gain;
  }

  /** A free-running oscillator. Started immediately; it sustains for the session. */
  makeOsc(type: OscillatorType, frequency: number, detune = 0, dest?: AudioNode): OscillatorNode {
    const osc = this.audio.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.detune.value = detune;
    osc.start();
    if (dest) osc.connect(dest);
    return osc;
  }

  makeBiquad(type: BiquadFilterType, frequency: number, q?: number, dest?: AudioNode): BiquadFilterNode {
    const filter = this.audio.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    if (q !== undefined) filter.Q.value = q;
    if (dest) filter.connect(dest);
    return filter;
  }

  /** A delay line. `max` is its ceiling, not its current time. */
  makeDelay(max: number, time: number): DelayNode {
    const delay = this.audio.ctx.createDelay(max);
    delay.delayTime.value = time;
    return delay;
  }

  /**
   * A convolver, with or without its impulse. The buffer is optional because
   * CAVERN's long room is built after the wake rather than during it — see
   * {@link onWarm} — and a convolver waiting for one is silent, not a bypass.
   */
  makeConvolver(buffer?: AudioBuffer): ConvolverNode {
    const convolver = this.audio.ctx.createConvolver();
    if (buffer) convolver.buffer = buffer;
    return convolver;
  }

  /**
   * A looping modulation table, running for the session and not counted as a
   * voice — the same bargain {@link makeNoiseLoop} takes, and for the same
   * reason: MAGNETS' wow and its dropouts are held open from build time to the
   * moment the page closes, so a cap on concurrent one-shots is not about them.
   *
   * The buffer is made at `rate` rather than at the context's own sample rate.
   * That is deliberate and it is what makes a table this long cheap: a curve that
   * carries nothing above about 8Hz needs no audio bandwidth, so 4kHz is already
   * three orders of magnitude of headroom, and the browser resamples on playback
   * exactly as it would for any other buffer. Started immediately; nothing ever
   * stops it.
   */
  makeTable(seconds: number, rate: number, fill: (data: Float32Array) => void): AudioBufferSourceNode {
    const { ctx } = this.audio;
    const buffer = ctx.createBuffer(1, Math.floor(seconds * rate), rate);
    fill(buffer.getChannelData(0));
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.start();
    return source;
  }

  /**
   * Somewhere across the field. The board's one stereo placement — OFFSET's taps
   * are the only thing that reaches for it, and putting them in different places
   * is the difference between that box being width and being phase smear.
   */
  makePanner(pan: number): StereoPannerNode {
    const panner = this.audio.ctx.createStereoPanner();
    panner.pan.value = pan;
    return panner;
  }

  /**
   * A one-shot tap on the noise buffer. Counted as a voice; the caller starts it
   * and is expected to stop it, which is what hands the voice back.
   */
  makeNoiseSource(): AudioBufferSourceNode {
    const source = this.makeNoiseTap();
    this.countVoice(source);
    return source;
  }

  /**
   * The same tap, running for the session and deliberately **not** counted —
   * CHAINSAW's grind and SAXOPHONE's breath are held open from build time to the
   * moment the page closes, so a cap on concurrent one-shots is not about them.
   * Counting them spent two of {@link VOICE_CAP} before a single strike had
   * fired, and would have spent one more for every drone that ever wanted a
   * hiss of its own. The caller starts it; nothing ever stops it.
   */
  makeNoiseLoop(): AudioBufferSourceNode {
    return this.makeNoiseTap();
  }

  private makeNoiseTap(): AudioBufferSourceNode {
    const source = this.audio.ctx.createBufferSource();
    source.buffer = this.audio.noiseBuf;
    source.loop = true;
    return source;
  }

  /** A one-shot oscillator with its life already scheduled. Counted as a voice. */
  makeBurstOsc(type: OscillatorType, frequency: number, start: number, stop: number): OscillatorNode {
    const osc = this.audio.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.start(start);
    osc.stop(stop);
    this.countVoice(osc);
    return osc;
  }

  /**
   * Register a source and hand back its terminal pair: `loud → pow`, where `pow`
   * is what the router moves. Everything the module synthesises feeds `loud`.
   *
   * `interval` defaults to unison because this is the generic primitive, the way
   * {@link makeOsc} defaults its detune. The nine real modules never reach it
   * with the default: ./sources reads the value off a registry entry whose type
   * makes the field mandatory, so a tenth module still cannot forget to say
   * where it sits.
   */
  makeOutlet(id: string, maxGain: number, interval: number = INTERVALS.root): Outlet {
    const loud = this.makeGain(0);
    const pow = this.makeGain(0);
    loud.connect(pow);
    const outlet: Outlet = {
      id,
      loud,
      pow,
      maxGain,
      interval,
      on: false,
      loudV: 0,
      charV: 0.5,
      often: 2,
      lastHit: 0,
    };
    this.sources[id] = outlet;
    return outlet;
  }

  private countVoice(node: AudioScheduledSourceNode): void {
    this.active++;
    node.onended = () => {
      this.active--;
    };
  }

  /**
   * Fire an immediate extra hit on a strike module that has gone quiet, so that
   * touching any of its controls proves it exists. Debounced; skipped at the cap.
   */
  poke(outlet: Outlet): void {
    if (!this.chain || !outlet.on || !outlet.trigger) return;
    const now = this.now();
    const idle = now - outlet.lastHit > POKE.idle;
    const settled = now - (outlet.pokedAt ?? 0) > POKE.debounce;
    if (!idle || !settled || this.active >= VOICE_CAP) return;

    const at = now + POKE.lead;
    outlet.pokedAt = now;
    outlet.lastHit = at;
    outlet.trigger(at);
    this.announce(outlet.id, POKE.callbackDelayMs);
  }

  /**
   * Say that a strike will be heard in `delayMs`. Public for the heartbeat,
   * which books hits a lookahead ahead of the clock and wants the bloom to
   * arrive with the sound rather than with the scheduling.
   */
  announce(id: string, delayMs: number): void {
    const { onStrike } = this.opts;
    if (onStrike) setTimeout(() => onStrike(id), Math.max(0, delayMs) + this.outputLagMs());
  }

  /**
   * How long after the audio clock says a sound plays the speakers play it, in
   * milliseconds. The clock runs ahead of the ear by the output's own buffer:
   * a few hundredths of a second on a desktop, a tenth or more on a tablet.
   * Everything the board is *told* about a sound is told this much later, so a
   * bloom lands on the hit that threw it rather than ahead of it — which
   * mattered less before the context was asked for a deeper buffer (see
   * {@link OUTPUT}) and was never right.
   *
   * Nothing for a context that does not say: an offline render has no
   * speakers, and its picture is on its clock.
   */
  private outputLagMs(): number {
    const late = (this.chain?.ctx as Partial<AudioContext> | undefined)?.outputLatency;
    if (typeof late !== 'number' || !(late > 0)) return 0;
    return Math.min(OUTPUT.maxLatency, late) * 1000;
  }

  /**
   * Say that a beat will fall in `delayMs` (gt#83). The same shape as
   * {@link Engine.announce} and for the same reason: the heartbeat books a
   * lookahead ahead of the clock, and a lamp that flashed with the booking
   * would be a third of a second early at every tempo.
   */
  pulse(count: number, delayMs: number): void {
    const { onBeat } = this.opts;
    if (onBeat) setTimeout(() => onBeat(count), Math.max(0, delayMs) + this.outputLagMs());
  }

  /**
   * The hammer landed (gt#87): play its own sound, now. Into the master and
   * never through the patch — see ./hammer. Says whether it was played; it is
   * not before {@link start}, or when it would not fit under the voice cap.
   *
   * `strength` is how hard, 0–1, and is the whole blow's level.
   */
  blow(strength = 1): boolean {
    if (!this.chain) return false;
    return hammerBlow(this, this.now() + HAMMER.lead, strength);
  }

  // ------------------------------------------------------------------ routing

  /**
   * Rebuild the whole graph from the wire list: disconnect, then reconnect. No
   * incremental bookkeeping, so calling it on every change is safe.
   *
   * Anything wired to nothing goes straight to master — the board's promise that
   * unplugged things still come out of the speakers.
   */
  route(): void {
    if (!this.chain) return;
    const { masterIn } = this.chain;

    for (const source of Object.values(this.sources)) {
      source.pow.disconnect();
      const targets = this.targetsOf(source.id);
      if (targets.length) for (const target of targets) source.pow.connect(target.in);
      else source.pow.connect(masterIn);
    }

    for (const modifier of Object.values(this.modifiers)) {
      modifier.out.disconnect();
      const targets = this.targetsOf(modifier.id);
      if (targets.length) for (const target of targets) modifier.out.connect(target.in);
      else modifier.out.connect(masterIn);
    }
  }

  private targetsOf(from: string): Modifier[] {
    const targets: Modifier[] = [];
    for (const wire of this.wires) {
      if (wire.from !== from) continue;
      const target = this.modifiers[wire.to];
      if (target) targets.push(target);
    }
    return targets;
  }

  /** Push SERIOUSNESS and TUNING out to everything that listens for them. */
  applyGlobals(): void {
    if (!this.chain) return;
    for (const modifier of Object.values(this.modifiers)) {
      modifier.setSeriousness?.(this.globals.seriousness);
    }
    // Each drone is handed the root it *sits on*, not the board's, so a `retune`
    // body stays the plain function of one number it has always been (gt#38).
    for (const source of Object.values(this.sources)) source.retune?.(this.rootOf(source));
  }

  // ---------------------------------------------------------- control surface

  setPower(id: string, on: boolean): void {
    const outlet = this.sources[id];
    if (!outlet) return;
    outlet.on = on;
    outlet.pow.gain.setTargetAtTime(on ? 1 : 0, this.now(), SMOOTH_POWER);
    if (on) this.poke(outlet);
  }

  /**
   * The hand landed on one of this source's controls and has not moved it yet.
   * Nothing here changes what the board is set to — it only gives a strike that
   * has gone quiet a chance to prove it exists, which is the half of "no dead
   * controls" that a value change cannot cover: turning a module already on, and
   * set to *almost never*, would otherwise be answered by silence until the
   * sixteenth beat.
   *
   * Takes an id rather than an {@link Outlet}, because an outlet is builders'
   * currency and this is the one poke the board itself asks for.
   */
  touch(id: string): void {
    const outlet = this.sources[id];
    if (outlet) this.poke(outlet);
  }

  setLoud(id: string, value: number, prove = true): void {
    const outlet = this.sources[id];
    if (!outlet) return;
    outlet.loudV = value;
    outlet.loud.gain.setTargetAtTime(value * outlet.maxGain, this.now(), SMOOTH);
    if (prove) this.poke(outlet);
  }

  setChar(id: string, value: number, prove = true): void {
    const outlet = this.sources[id];
    if (!outlet) return;
    outlet.charV = value;
    outlet.setChar?.(value);
    if (prove) this.poke(outlet);
  }

  setOften(id: string, step: number): void {
    const outlet = this.sources[id];
    if (!outlet) return;
    outlet.often = step;
    this.poke(outlet);
  }

  setMod(id: string, amount: number): void {
    const modifier = this.modifiers[id];
    if (!modifier) return;
    modifier.amount = amount;
    modifier.set(amount);
  }

  setGlobal<K extends keyof Globals>(key: K, value: Globals[K]): void {
    this.globals[key] = value;
    this.applyGlobals();
  }

  setBpm(bpm: number): void {
    this.bpm = clampBpm(bpm);
  }

  setWires(wires: readonly Wire[]): void {
    this.wires = wires.map((wire) => ({ from: wire.from, to: wire.to }));
    this.route();
  }

  /**
   * Scaled RMS over both taps, clamped to 1. The visual system reads this and
   * nothing else, and never writes back.
   */
  levels(): Levels {
    if (!this.chain) return { master: 0, low: 0 };
    const { analyser, lowAnalyser } = this.chain;
    this.masterBins ??= new Uint8Array(analyser.fftSize);
    this.lowBins ??= new Uint8Array(lowAnalyser.fftSize);
    analyser.getByteTimeDomainData(this.masterBins);
    lowAnalyser.getByteTimeDomainData(this.lowBins);
    return {
      master: scaledRms(this.masterBins, LEVEL_SCALE.master),
      low: scaledRms(this.lowBins, LEVEL_SCALE.low),
    };
  }
}

/** The pulse only runs between these; a tempo from outside the range is pulled in. */
function clampBpm(bpm: number): number {
  return Math.min(HEARTBEAT.maxBpm, Math.max(HEARTBEAT.minBpm, bpm));
}

/**
 * One PACE position as a tempo (gt#45) — the whole of the translation between the
 * word on the board and the number the scheduler divides by, and the only place
 * it happens.
 *
 * It lives on this side of the seam on purpose. The board holds which word its
 * selector points at and nothing more; that a position means 48 beats a minute is
 * a fact about the heartbeat, and the heartbeat is the engine's.
 *
 * A step from outside the four is pulled to the nearest one rather than falling
 * through to a tempo of `undefined`, which is the same guard `due()` puts on a
 * HOW OFTEN step in ./scheduler and is here for the same reason: a stored board
 * from a version with a different number of rungs must come back as a board.
 *
 * A step that is not a number at all has no nearest rung, so it opens on
 * {@link DEFAULT_BPM} instead of on either end. That is the `??` below and it is
 * a decision rather than a formality: the slowest rung is 36, which is barely a
 * pulse, and a board whose stored pace came back unreadable would arrive looking
 * stalled. 48 is what the board opens on when nobody has chosen.
 */
export function bpmFor(step: number): number {
  const index = Math.min(TEMPOS.length - 1, Math.max(0, Math.round(step)));
  return clampBpm(TEMPOS[index] ?? DEFAULT_BPM);
}

/** Time-domain bytes centre on 128; this reads them back as −1…1 and takes the RMS. */
function scaledRms(bins: Uint8Array, scale: number): number {
  let sum = 0;
  for (const byte of bins) {
    const sample = (byte - 128) / 128;
    sum += sample * sample;
  }
  return Math.min(1, Math.sqrt(sum / bins.length) * scale);
}

function openAudioContext(): AudioContext {
  if (typeof AudioContext === 'undefined') {
    throw new Error('This browser has no Web Audio support, so there is nothing to wake.');
  }
  return new AudioContext({ latencyHint: OUTPUT.latencyHint });
}
