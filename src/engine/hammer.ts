// The hammer's own sound (gt#87): metal on metal, at contact.
//
// SMASH IT swings, lands, kicks the room and re-rolls the board — and until
// this file what you *heard* at the moment of contact was whatever the new
// board happened to be. Some blows landed on a SLOW HIT and some on nothing but
// a change of drone. The heaviest thing on the board had no sound of its own.
//
// It is a one-shot in three parts, each the plainest thing that does its job:
//
// - **A thump.** A sine dropped fast from over every root the board has to down
//   among them: the weight of the blow, and the part a small speaker still
//   carries.
// - **A ring.** A handful of partials at ratios no string or pipe has — which
//   is what a struck plate is, and why it reads as metal rather than as a note.
//   The higher ones die first, as they do on anything real.
// - **A crack.** A few hundredths of a second of bandpassed noise on the front,
//   so the blow has an edge where the ring only has a body.
//
// Four rules, all the issue's:
//
// - **Into the master, never through THE CHAIN.** The patch is being re-rolled
//   on the same frame, and the blow is the hand's, not a source's — it has no
//   plate, no cable and no box. But it goes in *before* the shaper and the
//   compressor, so it is coloured and held down with everything else and
//   belongs to the same room.
// - **Unpitched.** Nothing here asks for the root. A hammer does not retune
//   when the board does.
// - **Counted.** Every oscillator and the noise tap are voices like any other
//   one-shot's, and a blow that would not fit under the cap is not played at
//   all rather than played in part: half a clang is a different, worse sound.
// - **Deterministic.** The noise is the engine's one fixed buffer. Nothing here
//   draws a number.
//
// `strength` is the one argument, 0–1, and it scales the whole blow. It is
// always 1 today. If the hammer ever becomes a drag (gt#61), how far it was swung
// is what goes here.

import { HAMMER, VOICE_CAP } from './constants';
import type { Engine } from './engine';

/** How many voices one blow spends: the thump, the ring's partials, and the crack. */
export const HAMMER_VOICES = 1 + HAMMER.ring.partials.length + 1;

/**
 * Play one blow at `time`. Returns whether it was played: it is not if the
 * engine has no room for all of it under {@link VOICE_CAP}, or if `strength`
 * leaves nothing to play.
 */
export function hammerBlow(engine: Engine, time: number, strength = 1): boolean {
  const force = Math.min(1, Math.max(0, strength));
  if (force <= 0 || engine.active + HAMMER_VOICES > VOICE_CAP) return false;

  // One gain for the whole blow, so its level against the board is one number
  // and `strength` is applied once rather than to every part.
  const out = engine.makeGain(HAMMER.level * force);
  out.connect(engine.masterIn);

  // The thump.
  const { thump } = HAMMER;
  const low = engine.makeBurstOsc('sine', thump.from, time, time + thump.life);
  low.frequency.setValueAtTime(thump.from, time);
  low.frequency.exponentialRampToValueAtTime(thump.to, time + thump.drop);
  const body = engine.makeGain(0);
  low.connect(body);
  body.connect(out);
  body.gain.setValueAtTime(0, time);
  body.gain.linearRampToValueAtTime(thump.peak, time + thump.attack);
  body.gain.exponentialRampToValueAtTime(HAMMER.silence, time + thump.decay);

  // The ring: each partial a multiple of one base that is not a whole number,
  // each quieter and shorter-lived than the one under it.
  const { ring } = HAMMER;
  ring.partials.forEach((ratio, index) => {
    const decay = ring.decay * ring.shorten ** index;
    const partial = engine.makeBurstOsc('sine', ring.base * ratio, time, time + decay + ring.tail);
    const level = engine.makeGain(0);
    partial.connect(level);
    level.connect(out);
    level.gain.setValueAtTime(0, time);
    level.gain.linearRampToValueAtTime(ring.peak * ring.quieten ** index, time + ring.attack);
    level.gain.exponentialRampToValueAtTime(HAMMER.silence, time + decay);
  });

  // The crack.
  const { crack } = HAMMER;
  const noise = engine.makeNoiseSource();
  const band = engine.makeBiquad('bandpass', crack.freq, crack.q);
  const edge = engine.makeGain(0);
  noise.connect(band);
  band.connect(edge);
  edge.connect(out);
  edge.gain.setValueAtTime(crack.peak, time);
  edge.gain.exponentialRampToValueAtTime(HAMMER.silence, time + crack.decay);
  noise.start(time);
  noise.stop(time + crack.life);

  return true;
}
