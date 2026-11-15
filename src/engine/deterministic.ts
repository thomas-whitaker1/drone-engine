// Nothing in this product is randomised at runtime. Fiddling is only fun when
// turning a thing reliably causes a thing, so every noise buffer, every reverb
// impulse and every distortion curve comes out of a fixed-seed Park–Miller
// generator and is byte-identical on every load.
//
// None of this touches an AudioContext, which is what makes it testable.

import { CURVE, IMPULSE, LCG, MAGNETS } from './constants';

/**
 * Park–Miller: `s = (s * 16807) % 2147483647`, mapped to −1…1.
 *
 * The intermediate product tops out around 3.6e13, comfortably inside the exact
 * integer range, so this is reproducible rather than merely repeatable.
 */
export function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * LCG.multiplier) % LCG.modulus;
    return (s / LCG.modulus) * 2 - 1;
  };
}

/** Flat noise across the whole buffer. One seed, one channel. */
export function fillNoise(data: Float32Array, seed: number): void {
  const next = lcg(seed);
  for (let i = 0; i < data.length; i++) data[i] = next();
}

/**
 * One channel of a reverb impulse: noise under a `pow(1 - i/n, decay)` envelope.
 * A higher decay collapses the tail sooner — CAVERN's short room uses 3, its long
 * cavern 4.2.
 */
export function fillImpulse(data: Float32Array, seed: number, decay: number, span = data.length): void {
  impulseFiller(data, seed, decay, span)(data.length);
}

/**
 * How much of an impulse `span` samples long is kept: up to where its envelope
 * falls under {@link IMPULSE.floor}, and at least one sample. What is kept is
 * the front of the same impulse, sample for sample — nothing is re-drawn, the
 * buffer is only cut where the sound has already stopped.
 */
export function heardLength(span: number, decay: number): number {
  const whole = Math.max(0, Math.floor(span));
  if (!(decay > 0) || whole <= 1) return whole;
  const kept = Math.ceil(whole * (1 - Math.pow(IMPULSE.floor, 1 / decay)));
  return Math.min(whole, Math.max(1, kept));
}

/**
 * What a cut impulse has to be turned up by to sound as loud as the whole one.
 *
 * It needs turning up at all because of something the convolver does on its
 * own: it levels every impulse by its *mean* power — its energy over its
 * length. The cut takes away length and almost no energy, so the mean goes up
 * and the node turns the room down to match: half a decibel on the cavern.
 * This is that, undone, exactly: the square root of the lengths. Measured on a
 * bare convolver, the cut room and the whole one then agree to the last bit
 * for as long as both are sounding.
 */
export function heardGain(span: number, decay: number): number {
  const kept = heardLength(span, decay);
  return kept > 0 ? Math.sqrt(Math.max(0, Math.floor(span)) / kept) : 1;
}

/**
 * The same channel, written a stretch at a time (gt#30). Each call writes up to
 * `count` more samples and says whether any are left.
 *
 * One generator is held for the whole channel and never restarted, so the
 * result is the same bytes however the work is cut up — {@link fillImpulse} is
 * this with one cut. That is what lets CAVERN's long room be spread over many
 * short tasks without becoming a different room.
 */
export function impulseFiller(
  data: Float32Array,
  seed: number,
  decay: number,
  span = data.length,
): (count: number) => boolean {
  const next = lcg(seed);
  // `span` is how long the impulse *is*; `data` may be only the front of it
  // that is kept — see {@link heardLength}. The envelope is drawn against the
  // whole length either way, so a cut buffer holds the same samples the whole
  // one opens with.
  const n = data.length;
  let i = 0;
  return (count) => {
    const end = Math.min(n, i + Math.max(0, count));
    for (; i < end; i++) data[i] = next() * Math.pow(1 - i / span, decay);
    return i < n;
  };
}

// ------------------------------------------------------------ MAGNETS' tables
//
// The two tables the tape box reads (gt#41), and the reason they are tables at all:
// wow, flutter and dropouts are exactly the kind of thing a lesser board would
// reach for `Math.random` to make, and the first law says no. A fixed table read
// on a loop is the same texture with the randomness spent once, at build time,
// where it is reproducible.
//
// Both fill a buffer normalised to a stated range so the builder can scale them
// with one gain and nothing here has to know what a delay line is.

/**
 * Wow and flutter, as one curve in −1…1.
 *
 * Three fixed components rather than noise, because the two halves of the effect
 * are genuinely different periodic motions and summing them is what makes it read
 * as a machine: **wow** is the slow one, a warped reel at 0.6Hz, and **flutter**
 * is the fast pair at 4.3 and 7.9Hz that a worn capstan adds on top. The weights
 * put most of the movement in the wow, which is what keeps the result sounding
 * dragged rather than merely detuned.
 *
 * The three rates share no whole-number factor, so the sum does not repeat inside
 * the buffer — it is a table with no seam in it, which is the property a loop
 * needs and a single sine does not have.
 *
 * Analytic rather than seeded: there is nothing random about a warped reel, and a
 * curve this smooth is better described by what it is than by a generator that
 * happens to land near it. {@link fillDropouts} is the one that needs the LCG.
 */
export const TAPE_COMPONENTS: readonly (readonly [hz: number, weight: number])[] = [
  [0.6, 0.62],
  [4.3, 0.26],
  [7.9, 0.12],
];

export function fillTapeWobble(data: Float32Array, sampleRate: number): void {
  const n = data.length;
  const seconds = n / sampleRate;
  for (let i = 0; i < n; i++) {
    let value = 0;
    for (const [hz, weight] of TAPE_COMPONENTS) {
      // Phase is taken off the buffer's own length rather than off real time, so
      // each component completes a whole number of turns and the loop point is
      // continuous — a table that jumps at its seam is a click every 11 seconds.
      const turns = Math.round(hz * seconds);
      value += Math.sin((2 * Math.PI * turns * i) / n) * weight;
    }
    data[i] = value;
  }
}

/**
 * Dropouts, as one curve in 0…1, where 0 is tape doing its job and 1 is the
 * bottom of a dip. Read as a *depth*, so the builder subtracts it — which is why
 * the resting value is 0 and not 1.
 *
 * The dips are placed by the LCG and shaped by a raised cosine, so each one
 * arrives and leaves rather than switching. Seeded placement is the whole reason
 * this half is generated and the wobble half is not: dropouts are damage, and
 * damage is not periodic. What the seed buys is that it is the *same* damage on
 * every load.
 *
 * Widths are scaled against the buffer, and a dip that would run off the end is
 * simply written up to the end — it is followed by the loop point, where the next
 * pass starts at rest, and a truncated fade out of a dip is inaudible against a
 * curve that spends most of its length at zero.
 */
export function fillDropouts(data: Float32Array, seed: number, count: number, width: number): void {
  data.fill(0);
  const n = data.length;
  const next = lcg(seed);
  const span = Math.max(1, Math.round((width * n) / count));
  for (let i = 0; i < count; i++) {
    // The generator runs −1…1; a position wants 0…1.
    const at = Math.floor(((next() + 1) / 2) * n);
    // And a second draw varies the depth, so the dips are not nine of the same one.
    const depth = 0.55 + ((next() + 1) / 2) * 0.45;
    for (let j = 0; j < span && at + j < n; j++) {
      const dip = (1 - Math.cos((2 * Math.PI * j) / span)) / 2;
      // Overlapping dips take the deeper of the two rather than summing past 1.
      data[at + j] = Math.max(data[at + j] ?? 0, dip * depth);
    }
  }
}

/**
 * The worst pitch deviation MAGNETS can ask for, as a fraction — the ceiling the
 * box is written around, computed rather than asserted.
 *
 * A delay line whose length is swept by `d` seconds at `f`Hz bends pitch by
 * `d × 2π × f`. The table's components each carry their own share of the depth,
 * so the box's total is the sum over all three at the widest depth the control
 * reaches. Exported because the ceiling is the governing law here and a law wants
 * a number the suite can hold it to, not a comment.
 */
export function tapePitchCeiling(depth: number = MAGNETS.depthFloor + MAGNETS.depthSpan): number {
  return TAPE_COMPONENTS.reduce((total, [hz, weight]) => total + depth * weight * 2 * Math.PI * hz, 0);
}

/** The same ceiling in cents, which is the unit the decision was actually made in. */
export function centsOf(deviation: number): number {
  return 1200 * Math.log2(1 + deviation);
}

/**
 * Curves are memoised against this, so an amount dragged through its range costs
 * 33 curves rather than one per pointer event.
 */
export function curveKey(amount: number): number {
  return Math.round(amount * CURVE.steps);
}

/**
 * A 1024-point soft-clip curve, `(1 + d)x / (1 + d|x|)`, where the drive `d`
 * comes from the quantised amount. Used for the master's fixed light grit, for
 * GRIT itself, and for the bass and cow waveshapers.
 */
export function shaperCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = CURVE.points;
  const curve = new Float32Array(n);
  const drive = (curveKey(amount) / CURVE.steps) * CURVE.depth + CURVE.floor;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    curve[i] = ((1 + drive) * x) / (1 + drive * Math.abs(x));
  }
  return curve;
}
