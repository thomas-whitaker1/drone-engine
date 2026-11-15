// The six sources that fire: SLOW HIT, CYMBAL SWELL, THE VOICE, MARACAS, COW,
// LASER CANNON. The first five are ported from engine2.js; the cannon is this
// board's own (gt#42).
//
// A strike builds almost nothing at rest. Each `trigger(time)` allocates its own
// nodes, schedules their whole life against the audio clock and lets them fall
// off the graph when they end — so a strike costs nothing until the heartbeat
// asks for it, and the voice cap is the only thing bounding how many run at once.
//
// MARACAS is the one exception, and it earns it: its burst runs every hit through
// the same two fixed filters, so those are the module's rather than the hit's.
// See {@link buildMaracas}.
//
// Every envelope falls to a hair above zero rather than to zero: an exponential
// ramp cannot reach silence, and reaching for it is a runtime error.
//
// The outlet arrives already registered, already carrying its ceiling, its beat
// offset and its interval — see ./registry, where the offset is mandatory for a
// strike — so a builder here is only ever the synthesis.
//
// A strike has no `retune`: it reads the pitch it needs at trigger time, which
// is why the three pitched ones ask `engine.rootOf(outlet)` rather than
// `engine.root()` (gt#38). The two unpitched ones ask for neither.

import { ACCENTS, COW, CYMBAL, LASER, MARACAS, SLOWHIT, VOICE, VOICE_CAP, VOICE_MODES } from '../constants';
import type { Engine, Outlet } from '../engine';

/**
 * "How much the room shakes." A sine dropped from three octaves-and-a-fifth down
 * toward the root, with a highpassed click on the front so it lands as well as
 * rumbles. WEIGHT raises where the drop starts and lengthens the tail.
 */
export function buildSlowHit(engine: Engine, outlet: Outlet): void {
  outlet.trigger = (time) => {
    const weight = outlet.charV;
    const root = engine.rootOf(outlet);
    const start = Math.max(SLOWHIT.startFloor, root * SLOWHIT.startMult) * (1 + weight * SLOWHIT.liftSpan);
    const end = Math.max(SLOWHIT.endFloor, root * SLOWHIT.endMult);

    const osc = engine.makeBurstOsc('sine', start, time, time + SLOWHIT.life);
    osc.frequency.setValueAtTime(start, time);
    osc.frequency.exponentialRampToValueAtTime(end, time + SLOWHIT.dropFloor + weight * SLOWHIT.dropSpan);

    const body = engine.makeGain(0);
    osc.connect(body);
    body.connect(outlet.loud);
    body.gain.setValueAtTime(0, time);
    body.gain.linearRampToValueAtTime(SLOWHIT.peak, time + SLOWHIT.attack);
    body.gain.exponentialRampToValueAtTime(
      SLOWHIT.silence,
      time + SLOWHIT.decayFloor + weight * SLOWHIT.decaySpan,
    );

    const click = engine.makeNoiseSource();
    const highpass = engine.makeBiquad('highpass', SLOWHIT.clickFreq, SLOWHIT.clickQ);
    const clickGain = engine.makeGain(0);
    click.connect(highpass);
    highpass.connect(clickGain);
    clickGain.connect(outlet.loud);
    clickGain.gain.setValueAtTime(SLOWHIT.clickGain, time);
    clickGain.gain.exponentialRampToValueAtTime(SLOWHIT.silence, time + SLOWHIT.clickDecay);
    click.start(time);
    click.stop(time + SLOWHIT.clickLife);
  };
}

/**
 * "How much air it moves." Noise through a highpass and a peaking lift, swelling
 * for three quarters of a second and falling away for two and a half. HISS moves
 * the highpass from 2.4kHz to 6.6kHz, which is the difference between a wash and
 * a hiss.
 */
export function buildCymbal(engine: Engine, outlet: Outlet): void {
  outlet.trigger = (time) => {
    const hiss = outlet.charV;

    const source = engine.makeNoiseSource();
    const highpass = engine.makeBiquad('highpass', CYMBAL.cutoffFloor + hiss * CYMBAL.cutoffSpan, CYMBAL.cutoffQ);
    const peak = engine.makeBiquad('peaking', CYMBAL.peakFreq, CYMBAL.peakQ);
    peak.gain.value = CYMBAL.peakFloor + hiss * CYMBAL.peakSpan;

    const envelope = engine.makeGain(0);
    source.connect(highpass);
    highpass.connect(peak);
    peak.connect(envelope);
    envelope.connect(outlet.loud);

    // The rise is linear on purpose — a swell, not an attack.
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(CYMBAL.levelFloor + hiss * CYMBAL.levelSpan, time + CYMBAL.rise);
    envelope.gain.exponentialRampToValueAtTime(CYMBAL.silence, time + CYMBAL.tail);

    source.start(time, CYMBAL.offset);
    source.stop(time + CYMBAL.life);
  };
}

/**
 * "What the throat is doing." A source through three formants that glide from
 * where they start to where the mode says they end. MODE picks one of four
 * entries; WHISPER is the same three formants with no oscillator behind them at
 * all, which is what makes it read as a voice with nothing left in it.
 */
export function buildVoice(engine: Engine, outlet: Outlet): void {
  outlet.trigger = (time) => phrase(engine, outlet, time, Math.round(outlet.charV));
}

/** One utterance in one mode. Out of range is silence rather than a throw. */
function phrase(engine: Engine, outlet: Outlet, time: number, mode: number): void {
  const spec = VOICE_MODES[mode];
  if (!spec) return;

  const pre = engine.makeGain(1);
  const envelope = engine.makeGain(0);

  if (spec.osc) {
    const start = Math.max(VOICE.pitchFloor, engine.rootOf(outlet) * spec.mult);
    const osc = engine.makeBurstOsc(spec.osc, start, time, time + spec.duration + VOICE.tail);
    osc.frequency.setValueAtTime(start, time);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(VOICE.bendFloor, start * spec.bend),
      time + spec.duration,
    );
    osc.connect(pre);
  }

  if (spec.noise) {
    const source = engine.makeNoiseSource();
    const gain = engine.makeGain(spec.noise * VOICE.noiseScale);
    source.connect(gain);
    gain.connect(pre);
    source.start(time, VOICE.noiseOffset);
    source.stop(time + spec.duration + VOICE.tail);
  }

  spec.formants.forEach(([frequency, q, level], index) => {
    const band = engine.makeBiquad('bandpass', frequency, q);
    const gain = engine.makeGain(level);
    pre.connect(band);
    band.connect(gain);
    gain.connect(envelope);
    // The glide is the whole trick: fixed formants would be a chord, not a mouth.
    band.frequency.setValueAtTime(frequency, time + VOICE.glideStart);
    band.frequency.linearRampToValueAtTime(
      spec.glide[index] as number,
      time + spec.duration * VOICE.glideEnd,
    );
  });

  const shaper = engine.context.createWaveShaper();
  shaper.curve = engine.curve(spec.drive);
  envelope.connect(shaper);
  shaper.connect(outlet.loud);

  envelope.gain.setValueAtTime(0, time);
  envelope.gain.linearRampToValueAtTime(spec.gain, time + spec.attack);
  envelope.gain.setValueAtTime(spec.gain, time + spec.duration * VOICE.hold);
  envelope.gain.exponentialRampToValueAtTime(VOICE.silence, time + spec.duration);
}

/**
 * "How out of hand the rattle gets." One trigger is a burst, not a hit: FRENZY
 * decides how many land, one to ten, and how tightly they bunch. Their weights
 * come off a fixed twelve-entry table, so the same knob always gives the same
 * rattle — the burst is written down, not rolled.
 */
export function buildMaracas(engine: Engine, outlet: Outlet): void {
  // The one place on this board where the brief's "reuse nodes" applies cleanly
  // (gt#21). Every hit in a burst is filtered by the same pair — fixed
  // frequencies, fixed Qs, no automation anywhere — so the reference's ten
  // identical pairs are built once for the module instead, and a full FRENZY
  // burst allocates twenty nodes rather than forty.
  //
  // The envelope moves in front of the filters as a result, where the reference
  // has it behind them. A biquad is linear, so the only difference is the
  // filter's own impulse response smearing a 4ms attack — a handful of samples
  // at 4.2kHz — and the shape of the rattle is carried by ACCENTS, which is
  // untouched.
  const highpass = engine.makeBiquad('highpass', MARACAS.highpass, MARACAS.highpassQ);
  const bandpass = engine.makeBiquad('bandpass', MARACAS.bandpass, MARACAS.bandpassQ);
  highpass.connect(bandpass);
  bandpass.connect(outlet.loud);

  outlet.trigger = (time) => {
    const frenzy = outlet.charV;
    const hits = MARACAS.hitsFloor + Math.round(frenzy * MARACAS.hitsSpan);
    const gap = MARACAS.gapFloor - frenzy * MARACAS.gapSpan;

    for (let index = 0; index < hits; index++) {
      // The cap is asked per hit, not per trigger. The heartbeat checks it once
      // and then this fires up to ten voices off that one answer, which is the
      // one place on the board where "skip a hit rather than exceed it" was a
      // promise the code could not keep.
      if (engine.active >= VOICE_CAP) break;
      const at = time + index * gap;

      const source = engine.makeNoiseSource();
      const envelope = engine.makeGain(0);
      source.connect(envelope);
      envelope.connect(highpass);

      const accent = ACCENTS[index % ACCENTS.length] as number;
      envelope.gain.setValueAtTime(0, at);
      envelope.gain.linearRampToValueAtTime(MARACAS.peak * accent, at + MARACAS.attack);
      envelope.gain.exponentialRampToValueAtTime(MARACAS.silence, at + MARACAS.decay);

      // Each hit reads from a different place in the one noise buffer, so a burst
      // is a handful of beads rather than the same click ten times.
      source.start(at, (index % MARACAS.offsetCycle) * MARACAS.offsetStep);
      source.stop(at + MARACAS.life);
    }
  };
}

/**
 * "How far the moo has fallen." A saw bent up and then dropped, through two
 * formants sliding down after it, into a shaper. DESPAIR sets how far the end
 * pitch falls — and under a full CAVERN at full SERIOUSNESS this is the gesture
 * the whole toy is built around.
 */
export function buildCow(engine: Engine, outlet: Outlet): void {
  outlet.trigger = (time) => {
    const despair = outlet.charV;
    const base = Math.max(COW.pitchFloor, engine.rootOf(outlet) * COW.mult);
    const duration = COW.durationFloor + despair * COW.durationSpan;

    const osc = engine.makeBurstOsc('sawtooth', base * COW.startBend, time, time + duration + COW.tail);
    osc.frequency.setValueAtTime(base * COW.startBend, time);
    osc.frequency.linearRampToValueAtTime(base * COW.riseBend, time + COW.rise);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(COW.endFloor, base * (COW.fallFloor - despair * COW.fallSpan)),
      time + COW.fallTimeFloor + despair * COW.fallTimeSpan,
    );

    const band1 = engine.makeBiquad('bandpass', COW.formant1.start, COW.formant1.q);
    const band2 = engine.makeBiquad('bandpass', COW.formant2.start, COW.formant2.q);
    band1.frequency.setValueAtTime(COW.formant1.start, time);
    band1.frequency.linearRampToValueAtTime(COW.formant1.end, time + COW.formantGlide);
    band2.frequency.setValueAtTime(COW.formant2.start, time);
    band2.frequency.linearRampToValueAtTime(COW.formant2.end, time + COW.formantGlide);

    const gain1 = engine.makeGain(COW.formant1.gain);
    const gain2 = engine.makeGain(COW.formant2.gain);
    const shaper = engine.context.createWaveShaper();
    shaper.curve = engine.curve(COW.curve);
    const envelope = engine.makeGain(0);

    osc.connect(band1);
    osc.connect(band2);
    band1.connect(gain1);
    band2.connect(gain2);
    gain1.connect(shaper);
    gain2.connect(shaper);
    shaper.connect(envelope);
    envelope.connect(outlet.loud);

    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(COW.peak, time + COW.attack);
    envelope.gain.setValueAtTime(COW.peak, time + duration * COW.hold);
    envelope.gain.exponentialRampToValueAtTime(COW.silence, time + duration);
  };
}

/**
 * "How big the shot is." A square dropped fast from around 1.6kHz with a
 * highpassed crack on the front, summed and then run through a delay whose time
 * is ramped across the shot — which is what a flanger is, without an LFO and
 * without a feedback loop.
 *
 * Past {@link LASER.dischargeAt} the cannon **stops firing and starts
 * discharging**: the same graph, but the sweep runs an order of magnitude lower
 * and five times longer, a square an octave down joins underneath it, the crack
 * becomes a swell and the flange opens out instead of closing in. It is the only
 * control on this board where the top of the travel is a different behaviour
 * rather than more of the same one, and it is meant to read as the joke it is.
 *
 * Everything is allocated per trigger, including the delay line. MARACAS is the
 * file's one shared-node exception and it earns it with fixed filters; a delay
 * whose time is ramped differently by every shot is the opposite case — shared,
 * two overlapping discharges would fight over one ramp.
 */
export function buildLaser(engine: Engine, outlet: Outlet): void {
  outlet.trigger = (time) => {
    const charge = outlet.charV;
    const discharging = charge >= LASER.dischargeAt;
    const blast = LASER.discharge;

    const start = engine.rootOf(outlet) * LASER.startMult;
    const drop = discharging ? blast.end : LASER.endFloor - charge * LASER.endSpan;
    const end = Math.max(LASER.pitchFloor, start * drop);
    const sweep = discharging ? blast.sweep : LASER.sweepFloor + charge * LASER.sweepSpan;
    const peak = discharging ? blast.peak : LASER.peakFloor + charge * LASER.peakSpan;
    const decay = discharging ? blast.decay : LASER.decayFloor + charge * LASER.decaySpan;
    const life = time + decay + LASER.tail;

    // Where the shot is assembled, and where the flange is taken from. Across
    // the sum rather than across the square alone: the crack is half of what a
    // laser sounds like, and a flanger that skipped it would only smear the tone.
    const pre = engine.makeGain(1);
    pre.connect(outlet.loud);

    const from = discharging ? blast.delayFrom : LASER.delayFrom;
    const to = discharging ? blast.delayTo : LASER.delayTo;
    const delay = engine.makeDelay(LASER.delayMax, from);
    const wet = engine.makeGain(LASER.wet);
    pre.connect(delay);
    delay.connect(wet);
    wet.connect(outlet.loud);
    // One ramp per shot, so every shot flanges identically. A free-running LFO
    // would start the sweep at a different phase each time, which is the kind of
    // thing this board does not do.
    delay.delayTime.setValueAtTime(from, time);
    delay.delayTime.linearRampToValueAtTime(to, time + sweep);

    const envelope = engine.makeGain(0);
    envelope.connect(pre);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(peak, time + LASER.attack);
    envelope.gain.exponentialRampToValueAtTime(LASER.silence, time + decay);

    const osc = engine.makeBurstOsc('square', start, time, life);
    osc.frequency.setValueAtTime(start, time);
    osc.frequency.exponentialRampToValueAtTime(end, time + sweep);
    osc.connect(envelope);

    // The discharge's floor. A drop this long needs something underneath it or
    // it is merely a slow version of the shot.
    if (discharging) {
      const subStart = start * blast.subMult;
      const sub = engine.makeBurstOsc('square', subStart, time, life);
      sub.frequency.setValueAtTime(subStart, time);
      sub.frequency.exponentialRampToValueAtTime(
        Math.max(LASER.pitchFloor, end * blast.subMult),
        time + sweep,
      );
      const subGain = engine.makeGain(blast.subGain);
      sub.connect(subGain);
      subGain.connect(envelope);
    }

    const crack = engine.makeNoiseSource();
    const highpass = engine.makeBiquad('highpass', LASER.crackFreq, LASER.crackQ);
    const crackGain = engine.makeGain(0);
    crack.connect(highpass);
    highpass.connect(crackGain);
    crackGain.connect(pre);

    if (discharging) {
      // The burst of everything the top of the control promises — a rise under
      // the drop rather than a crack in front of it.
      crackGain.gain.setValueAtTime(0, time);
      crackGain.gain.linearRampToValueAtTime(blast.crackGain, time + blast.crackRise);
      crackGain.gain.exponentialRampToValueAtTime(LASER.silence, time + blast.crackLife);
      crack.start(time, LASER.crackOffset);
      crack.stop(time + blast.crackLife);
    } else {
      crackGain.gain.setValueAtTime(LASER.crackFloor + charge * LASER.crackSpan, time);
      crackGain.gain.exponentialRampToValueAtTime(LASER.silence, time + LASER.crackDecay);
      crack.start(time, LASER.crackOffset);
      crack.stop(time + LASER.crackLife);
    }
  };
}
