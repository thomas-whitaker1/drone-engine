// THE HEARTBEAT — one global slow pulse, and the only clock in the product.
//
// A lookahead scheduler, ported from engine2.js: a 90ms timer wakes, looks a
// third of a second ahead of the audio clock, and books every strike that falls
// inside that window against `currentTime`. The timer therefore only decides
// *when work is done*, never when a hit is heard, which is what keeps the pulse
// steady while the main thread is busy laying out the board.
//
// There is no rhythm grid beyond this. A strike fires on multiples of the beat
// or not at all, so nothing a user does can put the board out of time with
// itself.
//
// **One amendment to that, and it is deliberate (gt#60).** This file used to say
// there was no way to land off the grid. There is now exactly one: every second
// beat is *heard* a fixed share of a beat late — see {@link SWING} and
// {@link heardAt}. The reference plays dead on the grid; doom lives on the back
// of the beat. What the rule protected still holds, because of how the lateness
// is made:
//
// - It is global. Every strike on a late beat is late by the same amount, and
//   so is the beat itself as the board is told it, so nothing on the board is
//   out of time with anything else on it.
// - It is fixed. One number, no control, no jitter — the same drag on every
//   load, which is the first law.
// - It moves where a beat is heard and never where it is counted. `next` and
//   `count` are still the plain grid, so no divisor, phase or tempo change can
//   drop or double a step because of it, and a late beat always lands before
//   the beat after it.

import { HEARTBEAT, RATE_DIV, STRIKE_IDS, SWING, VOICE_CAP } from './constants';
import type { Engine, Outlet } from './engine';

export class Heartbeat {
  /** Beats counted since the engine woke. The divisors are read against this. */
  count = 0;
  /**
   * The audio time of the next beat **on the grid**, which is always ahead of
   * the clock. Where that beat is heard is {@link heardAt} of this.
   */
  next = 0;

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly engine: Engine) {}

  get running(): boolean {
    return this.timer !== null;
  }

  /** Start pulsing. The first beat lands {@link HEARTBEAT.lead} from now. */
  start(): void {
    if (this.timer) return;
    this.count = 0;
    this.next = this.engine.now() + HEARTBEAT.lead;
    this.timer = setInterval(() => this.tick(), HEARTBEAT.intervalMs);
  }

  /** Stop pulsing and let the timer go. Anything already booked still sounds. */
  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Fill the horizon. Called by the timer, and directly by the suites — nothing
   * here reads the wall clock, only the audio one.
   */
  tick(): void {
    const ctx = this.engine.context;
    wake(ctx);

    // The grid decides when a beat is booked, exactly as it always has. Swing
    // only decides where inside its own beat it is then heard.
    while (this.next < ctx.currentTime + HEARTBEAT.horizon) {
      // Where this beat is heard, which is what everything below is booked
      // against (gt#60): the sound, `lastHit`, the bloom and the beat lamp all
      // follow the late time together, so the picture stays on the sound.
      const at = heardAt(this.next, this.count, 60 / this.engine.bpm);

      // The beat itself, said for the moment it falls (gt#83) — every one of them,
      // before and whether or not anything strikes on it. The pulse is not a
      // strike: it is there when no strike module is on, which is exactly when a
      // board at FUNERAL most needs to show that it is still counting.
      this.engine.pulse(this.count, (at - ctx.currentTime) * 1000);
      for (const id of STRIKE_IDS) {
        const outlet = this.engine.sources[id];
        if (outlet && due(outlet, this.count) && this.engine.active < VOICE_CAP) {
          outlet.trigger?.(at);
          outlet.lastHit = at;
          // The bloom answers the hit, so it waits out the same lookahead.
          this.engine.announce(id, (at - ctx.currentTime) * 1000);
        }
      }
      this.count++;
      this.next += 60 / this.engine.bpm;
    }
  }
}

/**
 * Where beat `count` is heard, given where it sits on the grid and how long a
 * beat is (gt#60). Even beats are heard where they sit. Odd ones — the off-beats,
 * the two and the four — are heard {@link SWING.late} of a beat behind.
 *
 * Which strikes that drags follows from the phases the modules already carry.
 * On every HOW OFTEN word but *constantly* a module only ever lands on beats of
 * one parity, the parity of its phase: SLOW HIT, CYMBAL SWELL and MARACAS sit
 * on the beat, and THE VOICE, COW and LASER CANNON sit behind it, every time.
 * On *constantly* a module takes both and limps.
 *
 * The lateness is a share of the beat rather than a length of time, so it is
 * the same feel at every PACE and can never reach the next beat: the share is
 * under one.
 */
export function heardAt(grid: number, count: number, beat: number): number {
  return count % 2 === 1 ? grid + SWING.late * beat : grid;
}

/** Whether this module strikes on `count`, given HOW OFTEN and its phase offset. */
function due(outlet: Outlet, count: number): boolean {
  if (!outlet.on || !outlet.trigger) return false;
  const step = Math.min(RATE_DIV.length - 1, Math.max(0, Math.round(outlet.often)));
  const divisor = RATE_DIV[step] ?? 1;
  return (count + (outlet.phase ?? 0)) % divisor === 0;
}

/**
 * A context the browser suspended — a backgrounded tab, or an autoplay policy
 * the WAKE IT gesture did not satisfy — comes back on the next tick. A refused
 * resume is not worth reporting: the tick after this one asks again.
 */
function wake(ctx: BaseAudioContext): void {
  if (ctx.state !== 'suspended') return;
  void (ctx as AudioContext).resume?.().catch(() => undefined);
}
