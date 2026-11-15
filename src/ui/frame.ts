// How long a frame was, and what a per-frame number is worth over it (gt#120).
//
// The board's motion was written as shares per frame: the room moves a tenth of
// the way to the low band each frame, a kick keeps 86% of itself each frame. A
// frame is not a unit of time. On a 144Hz display those numbers ran 2.4 times
// too fast; on a device holding 30 frames a second, at half speed. Everything
// here turns "per frame" into "per sixtieth of a second" without changing a
// single value on a 60Hz display — see FRAME in ./constants for the snap that
// keeps that promise exact.
//
// Pure functions and no state. The loops that use them keep their own stamp.

import { FRAME } from './constants';

/** A `requestAnimationFrame` timestamp, or NaN where there is none to trust. */
export const stampOf = (now: unknown): number =>
  typeof now === 'number' && Number.isFinite(now) ? now : NaN;

/**
 * The milliseconds between two stamps, as a loop should count them: capped at
 * the longest gap one frame may stand for, and one usual frame where either
 * stamp is missing or the clock has not moved — the first frame of a loop, or a
 * caller with no clock at all.
 */
export const gapMs = (before: number, at: number): number => {
  const gap = at - before;
  return gap > 0 ? Math.min(FRAME.longestMs, gap) : FRAME.ms;
};

/**
 * How many tuned frames `elapsed` milliseconds are worth. Exactly 1 for a gap
 * within the snap of a sixtieth of a second, so a 60Hz display gets the numbers
 * the board was tuned on rather than something a rounding error away from them.
 */
export const framesIn = (elapsed: number): number => {
  const frames = elapsed / FRAME.ms;
  return Math.abs(frames - 1) <= FRAME.snap ? 1 : frames;
};

/**
 * Move `from` toward `to` by a follower's per-frame `share`, over `frames`
 * tuned frames. Two half-length frames land where one whole one does.
 *
 * One frame is written out as the plain lerp rather than left to the general
 * form, because `1 - (1 - share) ** 1` is not `share` in floating point and the
 * 60Hz case is the one that must not move.
 */
export const follow = (from: number, to: number, share: number, frames = 1): number =>
  frames === 1 ? from + (to - from) * share : to + (from - to) * (1 - share) ** frames;

/** What a per-frame `decay` leaves of `value` after `frames` tuned frames. */
export const decayed = (value: number, decay: number, frames = 1): number => value * decay ** frames;
