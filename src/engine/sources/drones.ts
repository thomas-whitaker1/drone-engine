// The five sources that sustain: GUITAR WALL, BASS, CHAINSAW, SAXOPHONE, THROAT.
// The first four are ported from engine2.js; THROAT is this board's own (gt#42).
//
// A drone is built once and runs for the session. Its oscillators are started
// immediately and never stopped — what the user hears is the power gate opening,
// not a note beginning, which is why a drone answers a knob without a delay.
//
// Every one of them ends at `outlet.loud`, which the spine has already wired to
// `outlet.pow` for the router to place. Nothing here connects anything to master.
//
// The outlet arrives already registered and already carrying its ceiling — see
// ./registry — so a builder here is only ever the synthesis.
//
// `engine.rootOf(outlet)` rather than `engine.root()`, everywhere (gt#38): the root
// a module builds on is the board's times the interval its registry entry names.
// A `retune` body needs no such care, because ../engine's applyGlobals hands it
// the already-scaled number.

import { BASS, CHAINSAW, GUITAR, SAX, SMOOTH, SMOOTH_RETUNE, THROAT } from '../constants';
import type { Engine, Outlet } from '../engine';

/**
 * "How many guitars showed up." Four saws at octave multiples, detuned apart by
 * CROWD and summed into one lowpass. The two upper saws also fade in with it, so
 * turning it up adds players rather than volume.
 */
export function buildGuitar(engine: Engine, outlet: Outlet): void {
  const pre = engine.makeGain(GUITAR.initial.pre);
  const lowpass = engine.makeBiquad('lowpass', GUITAR.initial.cutoff, GUITAR.initial.q);
  pre.connect(lowpass);
  lowpass.connect(outlet.loud);

  const gains = GUITAR.mults.map(() => engine.makeGain(GUITAR.stackGain));
  const root = engine.rootOf(outlet);
  const oscs = GUITAR.mults.map((mult, index) => {
    const gain = gains[index] as GainNode;
    const osc = engine.makeOsc('sawtooth', root * mult, 0, gain);
    gain.connect(pre);
    return osc;
  });

  outlet.setChar = (value) => {
    const now = engine.now();
    const spread = GUITAR.spreadFloor + value * GUITAR.spreadSpan;
    oscs.forEach((osc, index) => {
      osc.detune.setTargetAtTime((GUITAR.baseDetune[index] as number) * spread, now, SMOOTH);
    });
    gains[2]?.gain.setTargetAtTime(GUITAR.thirdFloor + value * GUITAR.thirdSpan, now, SMOOTH);
    gains[3]?.gain.setTargetAtTime(GUITAR.fourthFloor + value * GUITAR.fourthSpan, now, SMOOTH);
    pre.gain.setTargetAtTime(GUITAR.preFloor + value * GUITAR.preSpan, now, SMOOTH);
  };

  outlet.retune = (to) => {
    const now = engine.now();
    oscs.forEach((osc, index) => {
      osc.frequency.setTargetAtTime(to * (GUITAR.mults[index] as number), now, SMOOTH_RETUNE);
    });
  };
}

/**
 * "How much floor it takes up." A clean sine sub with a lightly distorted octave
 * saw over it. HEFT trades one against the other and opens the filter, so the
 * bottom of the board gets wider rather than merely louder.
 */
export function buildBass(engine: Engine, outlet: Outlet): void {
  const lowpass = engine.makeBiquad('lowpass', BASS.initial.cutoff, BASS.initial.q);
  lowpass.connect(outlet.loud);

  const root = engine.rootOf(outlet);
  const subGain = engine.makeGain(BASS.initial.sub);
  const sub = engine.makeOsc('sine', root, 0, subGain);
  subGain.connect(lowpass);

  // The shaper is on the saw alone — the sub stays clean, or the floor turns to mud.
  const shaper = engine.context.createWaveShaper();
  shaper.curve = engine.curve(BASS.sawCurve);
  const sawGain = engine.makeGain(BASS.initial.saw);
  const saw = engine.makeOsc('sawtooth', root * BASS.sawMult, BASS.sawDetune, shaper);
  shaper.connect(sawGain);
  sawGain.connect(lowpass);

  outlet.setChar = (value) => {
    const now = engine.now();
    subGain.gain.setTargetAtTime(BASS.subFloor + value * BASS.subSpan, now, SMOOTH);
    sawGain.gain.setTargetAtTime(BASS.sawFloor - value * BASS.sawSpan, now, SMOOTH);
    lowpass.frequency.setTargetAtTime(BASS.cutoffFloor + value * BASS.cutoffSpan, now, SMOOTH);
  };

  outlet.retune = (to) => {
    const now = engine.now();
    sub.frequency.setTargetAtTime(to, now, SMOOTH_RETUNE);
    saw.frequency.setTargetAtTime(to * BASS.sawMult, now, SMOOTH_RETUNE);
  };
}

/**
 * "How hard it's being worked." A saw pair and a band of noise, all through one
 * gain that a square LFO chops into a chug. REVS drives the chug rate, the pitch,
 * the noise and the cutoff together — one knob, a whole engine being revved.
 */
export function buildChainsaw(engine: Engine, outlet: Outlet): void {
  const chug = engine.makeGain(CHAINSAW.initial.chug);
  const lowpass = engine.makeBiquad('lowpass', CHAINSAW.initial.cutoff, CHAINSAW.initial.q);
  chug.connect(lowpass);
  lowpass.connect(outlet.loud);

  const root = engine.rootOf(outlet);
  const oscs = CHAINSAW.detunes.map((detune) =>
    engine.makeOsc('sawtooth', root * CHAINSAW.mult, detune, chug),
  );

  const noiseFilter = engine.makeBiquad('bandpass', CHAINSAW.initial.noiseFreq, CHAINSAW.initial.noiseQ);
  const noiseGain = engine.makeGain(CHAINSAW.initial.noise);
  const noise = engine.makeNoiseLoop();
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(chug);
  noise.start();

  // A square wave written straight onto the chug's gain: on, off, on, off.
  const lfo = engine.makeOsc('square', CHAINSAW.initial.rate);
  const depth = engine.makeGain(CHAINSAW.initial.depth);
  lfo.connect(depth);
  depth.connect(chug.gain);

  // REVS raises the pitch as well as the rate, so retune has to know where the
  // knob is. It is the only source whose retune is not purely a function of root.
  let pitch: number = CHAINSAW.initial.pitch;

  outlet.retune = (to) => {
    const now = engine.now();
    for (const osc of oscs) {
      osc.frequency.setTargetAtTime(to * CHAINSAW.mult * pitch, now, SMOOTH_RETUNE);
    }
  };

  outlet.setChar = (value) => {
    const now = engine.now();
    lfo.frequency.setTargetAtTime(CHAINSAW.rateFloor + value * CHAINSAW.rateSpan, now, SMOOTH);
    pitch = CHAINSAW.pitchFloor + value * CHAINSAW.pitchSpan;
    noiseGain.gain.setTargetAtTime(CHAINSAW.noiseFloor + value * CHAINSAW.noiseSpan, now, SMOOTH);
    lowpass.frequency.setTargetAtTime(CHAINSAW.cutoffFloor + value * CHAINSAW.cutoffSpan, now, SMOOTH);
    outlet.retune?.(engine.rootOf(outlet));
  };
}

/**
 * "How badly it wants out." A square four octaves up through two bandpass
 * formants, with breath noise beside it and a vibrato on its detune. AGONY
 * pushes the formants up and widens the vibrato until it is barely holding on.
 */
export function buildSax(engine: Engine, outlet: Outlet): void {
  const root = engine.rootOf(outlet);
  const osc = engine.makeOsc('square', root * SAX.mult);

  const vibrato = engine.makeOsc('sine', SAX.initial.vibrato);
  const depth = engine.makeGain(SAX.initial.depth);
  vibrato.connect(depth);
  depth.connect(osc.detune);

  // Two formants in parallel off the same square, not in series — a throat, not a filter.
  const formant1 = engine.makeBiquad('bandpass', SAX.initial.formant1, SAX.initial.formant1Q);
  const formant1Gain = engine.makeGain(SAX.initial.formant1Gain);
  osc.connect(formant1);
  formant1.connect(formant1Gain);
  formant1Gain.connect(outlet.loud);

  const formant2 = engine.makeBiquad('bandpass', SAX.initial.formant2, SAX.initial.formant2Q);
  const formant2Gain = engine.makeGain(SAX.initial.formant2Gain);
  osc.connect(formant2);
  formant2.connect(formant2Gain);
  formant2Gain.connect(outlet.loud);

  const breathFilter = engine.makeBiquad('bandpass', SAX.initial.breathFreq, SAX.initial.breathQ);
  const breathGain = engine.makeGain(SAX.initial.breath);
  const breath = engine.makeNoiseLoop();
  breath.connect(breathFilter);
  breathFilter.connect(breathGain);
  breathGain.connect(outlet.loud);
  breath.start();

  outlet.setChar = (value) => {
    const now = engine.now();
    formant1.frequency.setTargetAtTime(SAX.formant1Floor + value * SAX.formant1Span, now, SMOOTH);
    formant2.frequency.setTargetAtTime(SAX.formant2Floor + value * SAX.formant2Span, now, SMOOTH);
    vibrato.frequency.setTargetAtTime(SAX.vibratoFloor + value * SAX.vibratoSpan, now, SMOOTH);
    depth.gain.setTargetAtTime(SAX.depthFloor + value * SAX.depthSpan, now, SMOOTH);
    breathGain.gain.setTargetAtTime(SAX.breathFloor + value * SAX.breathSpan, now, SMOOTH);
  };

  outlet.retune = (to) => {
    osc.frequency.setTargetAtTime(to * SAX.mult, engine.now(), SMOOTH_RETUNE);
  };
}

/**
 * "Where the overtone sits." A sawtooth an octave up through a lowpass is the
 * buzz; beside it, a very narrow high-Q bandpass picks one harmonic out of that
 * buzz and makes it whistle. WHISTLE walks the resonance from the third harmonic
 * to the twelfth, tightening it and ducking the body as it climbs.
 *
 * The two halves are in **parallel** off the same sawtooth, not in series — the
 * same shape SAXOPHONE's formants take, and for the same reason. In series the
 * whistle would be all there is; in parallel it is an overtone standing out of a
 * drone that is still there underneath it, which is what khoomei is.
 *
 * The whistle is a filter and never an oscillator, which is the module's whole
 * safety argument: a resonance can only amplify partials the sawtooth already
 * has, so no knob position anywhere can put this module out of tune with the
 * board. See {@link THROAT}.
 */
export function buildThroat(engine: Engine, outlet: Outlet): void {
  const root = engine.rootOf(outlet);

  // The buzz. One saw, lowpassed hard — a source with a great many harmonics and
  // no character of its own, which is exactly what a resonator wants to be fed.
  const lowpass = engine.makeBiquad('lowpass', THROAT.initial.cutoff, THROAT.initial.q);
  const body = engine.makeGain(THROAT.initial.body);
  const saw = engine.makeOsc('sawtooth', root * THROAT.mult, 0, lowpass);
  lowpass.connect(body);
  body.connect(outlet.loud);

  // The whistle, fed from the saw directly rather than from behind the lowpass:
  // the twelfth harmonic is well above where that filter is working, and a
  // resonator handed a signal its own harmonic has already been rolled off from
  // has nothing left to find.
  const resonator = engine.makeBiquad('bandpass', root * THROAT.mult * THROAT.harmonicFloor, THROAT.initial.whistleQ);
  const whistle = engine.makeGain(THROAT.initial.whistle);
  saw.connect(resonator);
  resonator.connect(whistle);
  whistle.connect(outlet.loud);

  // A little air through the same resonator, so the overtone has breath in it
  // rather than being a pure tone sitting on top of a drone. Uncounted, and
  // running for the session — see makeNoiseLoop (gt#31).
  const airGain = engine.makeGain(THROAT.initial.air);
  const air = engine.makeNoiseLoop();
  air.connect(airGain);
  airGain.connect(resonator);
  air.start();

  // Where the whistle sits has to survive a retune, so the knob position is held
  // the way CHAINSAW holds its pitch: the resonance tracks the root *and* the
  // control, and a retune that only knew the root would drop it back to the third.
  let harmonic: number = THROAT.harmonicFloor;

  outlet.retune = (to) => {
    const now = engine.now();
    saw.frequency.setTargetAtTime(to * THROAT.mult, now, SMOOTH_RETUNE);
    resonator.frequency.setTargetAtTime(to * THROAT.mult * harmonic, now, SMOOTH_RETUNE);
  };

  outlet.setChar = (value) => {
    const now = engine.now();
    harmonic = THROAT.harmonicFloor + value * THROAT.harmonicSpan;
    resonator.frequency.setTargetAtTime(engine.rootOf(outlet) * THROAT.mult * harmonic, now, SMOOTH);
    resonator.Q.setTargetAtTime(THROAT.qFloor + value * THROAT.qSpan, now, SMOOTH);
    whistle.gain.setTargetAtTime(THROAT.whistleFloor + value * THROAT.whistleSpan, now, SMOOTH);
    body.gain.setTargetAtTime(THROAT.bodyFloor - value * THROAT.bodySpan, now, SMOOTH);
    lowpass.frequency.setTargetAtTime(THROAT.cutoffFloor + value * THROAT.cutoffSpan, now, SMOOTH);
    airGain.gain.setTargetAtTime(THROAT.airFloor + value * THROAT.airSpan, now, SMOOTH);
  };
}
