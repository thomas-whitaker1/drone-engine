// What a frame is worth (gt#120).
//
// The board's motion was tuned as shares per frame on a 60Hz display. These are
// the functions that turn that into shares per sixtieth of a second, so the
// room keeps its pace on a display that runs faster or slower — and the checks
// that a 60Hz display itself gets exactly the numbers it always did.

import { describe, expect, it } from 'vitest';
import { FRAME } from '../src/ui/constants';
import { decayed, follow, framesIn, gapMs, stampOf } from '../src/ui/frame';

/**
 * How many whole frames a display running at `hz` draws in about `ms`, and how
 * many sixtieths of a second that many of its frames really are. 144Hz does not
 * divide a third of a second evenly, so the second number is what a run is held
 * to rather than the first.
 */
const run = (hz: number, ms: number): { count: number; sixtieths: number } => {
  const count = Math.round((ms * hz) / 1000);
  return { count, sixtieths: (count * 60) / hz };
};

/** A follower run from 0 toward 1 for `count` frames of a display at `hz`. */
const followed = (share: number, hz: number, count: number): number => {
  let value = 0;
  for (let i = 0; i < count; i += 1) value = follow(value, 1, share, framesIn(1000 / hz));
  return value;
};

/** What a decay leaves of 1 after `count` frames of a display at `hz`. */
const left = (decay: number, hz: number, count: number): number => {
  let value = 1;
  for (let i = 0; i < count; i += 1) value = decayed(value, decay, framesIn(1000 / hz));
  return value;
};

describe('a frame', () => {
  it('is a sixtieth of a second, and a gap near one counts as exactly one', () => {
    expect(FRAME.ms).toBe(1000 / 60);
    // What a 60Hz display actually delivers, and what a fake timer does.
    for (const gap of [16, 16.6, 16.667, 16.7, 1000 / 59.94, 17]) expect(framesIn(gap), String(gap)).toBe(1);
    // Anything else is counted honestly.
    expect(framesIn(1000 / 120)).toBe(0.5);
    expect(framesIn(1000 / 30)).toBe(2);
    expect(framesIn(1000 / 144)).toBeCloseTo(60 / 144, 12);
    expect(framesIn(1000 / 75)).toBeCloseTo(0.8, 12);
  });

  it('snaps no further than it says, so 50Hz and 75Hz are not mistaken for 60', () => {
    expect(FRAME.snap).toBeLessThanOrEqual(0.05);
    expect(framesIn(1000 / 50)).not.toBe(1);
    expect(framesIn(1000 / 75)).not.toBe(1);
  });

  it('stands for one usual frame where there is no clock to read', () => {
    // The first frame of a loop, a caller that passes no timestamp, a clock
    // that has not moved, and one that went backwards.
    expect(gapMs(NaN, 5000)).toBe(FRAME.ms);
    expect(gapMs(5000, NaN)).toBe(FRAME.ms);
    expect(gapMs(5000, 5000)).toBe(FRAME.ms);
    expect(gapMs(5000, 4000)).toBe(FRAME.ms);
    expect(gapMs(5000, 5010)).toBe(10);
    expect(stampOf(undefined)).toBeNaN();
    expect(stampOf(Infinity)).toBeNaN();
    expect(stampOf(12.5)).toBe(12.5);
  });

  it('never stands for longer than the cap, so a tab coming back does not lurch', () => {
    expect(gapMs(0, 60_000)).toBe(FRAME.longestMs);
    expect(FRAME.longestMs).toBeGreaterThanOrEqual(1000 / 30);
  });
});

describe('a follower on the clock', () => {
  it('is the plain lerp over one frame, to the digit', () => {
    // The 60Hz case is the one that must not move. Written with the numbers
    // the board uses, because 1 - (1 - .1) is not .1 in floating point.
    for (const share of [0.1, 0.5]) {
      expect(follow(0, 1, share)).toBe(share);
      expect(follow(0.3, 0.9, share, 1)).toBe(0.3 + (0.9 - 0.3) * share);
    }
  });

  it('lands in the same place by two half frames as by one whole one', () => {
    const once = follow(0, 1, 0.1, 1);
    const twice = follow(follow(0, 1, 0.1, 0.5), 1, 0.1, 0.5);
    expect(twice).toBeCloseTo(once, 12);
    // And by one double frame as by two whole ones.
    expect(follow(0, 1, 0.1, 2)).toBeCloseTo(follow(follow(0, 1, 0.1), 1, 0.1), 12);
  });

  it('is where it should be after a third of a second, whatever the display runs at', () => {
    const at60 = followed(0.1, 60, run(60, 300).count);
    expect(at60).toBeCloseTo(1 - 0.9 ** 18, 12);
    for (const hz of [30, 75, 120, 144, 240]) {
      const { count, sixtieths } = run(hz, 300);
      // Where a 60Hz display would be at that same moment...
      expect(followed(0.1, hz, count), `${hz}Hz`).toBeCloseTo(1 - 0.9 ** sixtieths, 9);
      // ...which is within a frame's worth of where it is at a third of a second.
      expect(Math.abs(followed(0.1, hz, count) - at60), `${hz}Hz`).toBeLessThan(0.02);
    }
    // What it used to do: the same share every frame, however long the frame.
    // At 144Hz that is 43 frames of a tenth each instead of 18.
    expect(1 - 0.9 ** 43).toBeGreaterThan(at60 + 0.1);
  });
});

describe('a decay on the clock', () => {
  it('is one multiplication over one frame, to the digit', () => {
    expect(decayed(1, 0.86)).toBe(0.86);
    expect(decayed(0.5, 0.8, 1)).toBe(0.5 * 0.8);
  });

  it('leaves the same amount after a quarter of a second, whatever the display runs at', () => {
    const at60 = left(0.86, 60, run(60, 250).count);
    expect(at60).toBeCloseTo(0.86 ** 15, 12);
    for (const hz of [30, 75, 120, 144, 240]) {
      const { count, sixtieths } = run(hz, 250);
      expect(left(0.86, hz, count), `${hz}Hz`).toBeCloseTo(0.86 ** sixtieths, 9);
      expect(Math.abs(left(0.86, hz, count) - at60), `${hz}Hz`).toBeLessThan(0.02);
    }
    // What it used to do at 144Hz: 36 frames of the same decay instead of 15.
    expect(0.86 ** 36).toBeLessThan(at60 / 10);
  });
});
