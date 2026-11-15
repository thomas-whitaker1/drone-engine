// @vitest-environment happy-dom
//
// The advanced-effects shelf (gt#39), judged on the four things about it that are
// decidable without an eye: the arithmetic, the gate, the rate cap, and the
// arrow. Whether a torn slice *looks* like the board coming apart is the
// eye-and-ear pass's problem; whether the strobe can exceed three flashes a
// second is emphatically not.
//
// The rate cap is the one check in this repository that is about a person's
// health rather than a slipped digit, so it is asserted as arithmetic derived
// from the period rather than as a string read back. Anyone who shortens
// `RUPTURE.strobe.periodMs` past the limit fails a test instead of shipping a
// hazard, which is the entire reason `strobeHz` exists as an exported function
// rather than as a comment beside the constant.
//
// The gate is checked the way ./apart.test.ts checks its own: by enumeration
// rather than by a happy path. Six effects behind one arm means six chances for
// the arm to be forgotten, so the disarmed board is asserted against every
// variable, both layers, the filter, and the strike seam — not against a
// representative one.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  aberrationAt,
  burstAfter,
  splitAt,
  apartAmount,
  createRupture,
  lampBoostAt,
  meltAt,
  meltBlurAt,
  rollArmed,
  RUPTURE_REST,
  RUPTURE_VARS,
  sliceAt,
  strobeArmed,
  strobeDelay,
  strobeHz,
} from '../src/ui';
import type { RuptureHandle } from '../src/ui';
import { RUPTURE } from '../src/ui/constants';
import { rupture as paint } from '../src/tokens';

const live: RuptureHandle[] = [];

/** A shelf on its own page shell, with a stand-in for the plate. */
function build(): { shelf: RuptureHandle; mount: HTMLElement; plate: HTMLElement } {
  const mount = document.createElement('div');
  const plate = document.createElement('div');
  document.body.appendChild(mount);
  mount.appendChild(plate);
  const shelf = createRupture({ mount, plate });
  live.push(shelf);
  return { shelf, mount, plate };
}

/** One layer by its `data-part` name. Throws rather than returning null. */
function layer(mount: HTMLElement, part: string): HTMLElement {
  const element = mount.querySelector<HTMLElement>(`[data-part="${part}"]`);
  if (!element) throw new Error(`No ${part} layer.`);
  return element;
}

const read = (name: string): string => document.body.style.getPropertyValue(name);

/** Armed, and driven past whatever floor the caller cares about. */
function armedAt(grit: number, murk = 0): { shelf: RuptureHandle; mount: HTMLElement; plate: HTMLElement } {
  const built = build();
  built.shelf.setArmed(true);
  built.shelf.setGrit(grit);
  built.shelf.setMurk(murk);
  return built;
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const shelf of live.splice(0)) shelf.destroy();
  document.body.replaceChildren();
  for (const name of RUPTURE_VARS) document.body.style.removeProperty(name);
});

describe('the strobe’s rate cap', () => {
  it('is under three flashes a second, as arithmetic rather than as a comment', () => {
    // The whole point of this file. Not `expect(periodMs).toBe(340)` — that would
    // pass whatever the number meant. This fails if anyone makes it faster.
    expect(strobeHz()).toBeLessThanOrEqual(RUPTURE.strobe.maxHz);
    expect(RUPTURE.strobe.maxHz).toBeLessThanOrEqual(3);
  });

  it('is a cap and not a taper: no input anywhere makes it faster', () => {
    // GRIT decides *whether* the strobe runs, and nothing decides how fast. If a
    // rate ever starts following a reading, this is the check that has to be
    // deliberately deleted to let it through.
    const rate = strobeHz();
    for (const grit of [0.9, 0.95, 0.99, 1]) {
      expect(strobeArmed(true, grit, false), String(grit)).toBe(true);
      expect(strobeHz()).toBe(rate);
    }
  });

  it('needs GRIT near the top before it fires at all, arming alone is not enough', () => {
    // The second deliberate move. Arming the shelf produces five effects and not
    // this one; the flash takes driving GRIT past its own high floor.
    expect(strobeArmed(true, 0.5, false)).toBe(false);
    expect(strobeArmed(true, RUPTURE.strobe.gritArm - 0.01, false)).toBe(false);
    expect(strobeArmed(true, RUPTURE.strobe.gritArm, false)).toBe(true);
  });

  it('is dead when stilled and dead when disarmed, whatever GRIT says', () => {
    expect(strobeArmed(true, 1, true)).toBe(false);
    expect(strobeArmed(false, 1, false)).toBe(false);
    expect(strobeArmed(false, 1, true)).toBe(false);
  });
});

// The period was capped and the rate was not. The layer is switched with
// `display`, and an animation on an element that has just been displayed starts
// on its first frame, which is the lit one — so every time the strobe was let
// through its gate it flashed there and then. Measured in Chrome before this
// was fixed: shown and hidden every 90ms it flashed six times in a second, and
// every 50ms, eleven. A hand wiggling GRIT across the threshold does that.
//
// What follows plays the gate against a clock and works out when the layer is
// lit, from the delay it was actually given, the way a browser would.
describe('the strobe’s rate cap, whatever is done to its gate', () => {
  const period = RUPTURE.strobe.periodMs;
  const litMs = (period * RUPTURE.strobe.litPct) / 100;

  /** A shelf on a clock the test holds, with the strobe's gate in reach. */
  function gated(): { clock: { t: number }; strobe: HTMLElement; gate: (open: boolean) => void } {
    const clock = { t: 0 };
    const mount = document.createElement('div');
    const plate = document.createElement('div');
    document.body.appendChild(mount);
    mount.appendChild(plate);
    const shelf = createRupture({ mount, plate, now: () => clock.t });
    live.push(shelf);
    shelf.setArmed(true);
    return {
      clock,
      strobe: layer(mount, 'strobe'),
      // The way a hand does it: GRIT over the strobe's floor, and back under.
      gate: (open) => shelf.setGrit(open ? 1 : RUPTURE.strobe.gritArm - 0.1),
    };
  }

  /** How far into its period the strobe was started, off the style it carries. */
  const startedAt = (strobe: HTMLElement): number => -parseFloat(strobe.style.animationDelay || '0');

  /**
   * Every moment a flash begins while the gate is flipped every `everyMs` for
   * `forMs`. `delayOf` is how far into its period each showing starts; flashes
   * that begin within one lit window of each other are one flash.
   */
  function onsets(everyMs: number, forMs: number, delayOf: (shownAt: number) => number): number[] {
    const out: number[] = [];
    const add = (t: number): void => {
      if (!out.length || t - (out.at(-1) as number) > litMs) out.push(t);
    };
    for (let shown = 0; shown < forMs; shown += everyMs * 2) {
      const into = delayOf(shown);
      // Lit on arrival, if it arrives inside the lit part of a period…
      if (into % period < litMs) add(shown);
      // …and again each time its own period comes round while it is still up.
      for (let t = shown + (period - (into % period)); t < shown + everyMs; t += period) add(t);
    }
    return out;
  }

  const mostInOneSecond = (times: number[]): number =>
    Math.max(0, ...times.map((t, i) => times.slice(i).filter((later) => later - t < 1000).length));

  it('starts part-way through its period, at where the page’s clock is in it', () => {
    expect(strobeDelay(0)).toBe('0ms');
    expect(strobeDelay(100)).toBe('-100ms');
    expect(strobeDelay(period)).toBe('0ms');
    expect(strobeDelay(period * 7 + 12.5)).toBe('-12.5ms');
  });

  it('is given that start each time it is let through', () => {
    const { clock, strobe, gate } = gated();

    for (const t of [0, 55, 123, 340, 977, 20000.5]) {
      gate(false);
      clock.t = t;
      gate(true);
      expect(strobe.style.display).toBe('block');
      expect(startedAt(strobe), `shown at ${t}`).toBeCloseTo(t % period, 1);
    }
  });

  it('is left alone while it stays through, so nothing moves a running flash', () => {
    const { clock, strobe, gate } = gated();
    clock.t = 100;
    gate(true);
    const held = strobe.style.animationDelay;

    clock.t = 177;
    gate(true);
    expect(strobe.style.animationDelay).toBe(held);
  });

  it('never fits a fourth flash in a second, however fast the gate is worked', () => {
    for (const everyMs of [340, 150, 90, 50, 33, 17]) {
      const { clock, strobe, gate } = gated();
      // The delay each showing is really given, read back off the layer.
      const given = (shownAt: number): number => {
        gate(false);
        clock.t = shownAt;
        gate(true);
        return startedAt(strobe);
      };
      const times = onsets(everyMs, 6000, given);

      expect(mostInOneSecond(times), `flipped every ${everyMs}ms`).toBeLessThanOrEqual(RUPTURE.strobe.maxHz);
      for (let i = 1; i < times.length; i++) {
        expect((times[i] as number) - (times[i - 1] as number), `flipped every ${everyMs}ms`).toBeGreaterThanOrEqual(period - litMs);
      }
    }
  });

  it('would not hold if each showing started from the top, which is what it used to do', () => {
    // The same play with no delay given: the failure this suite could not see.
    expect(mostInOneSecond(onsets(90, 6000, () => 0))).toBeGreaterThan(RUPTURE.strobe.maxHz);
    expect(mostInOneSecond(onsets(50, 6000, () => 0))).toBeGreaterThan(RUPTURE.strobe.maxHz * 2);
  });
});

describe('how far the board comes apart', () => {
  it('is nothing at all unless armed, at any GRIT', () => {
    for (const grit of [0, 0.35, 0.5, 0.9, 1]) {
      expect(apartAmount(false, grit), String(grit)).toBe(0);
    }
  });

  it('is nothing at the floor, rather than a small amount', () => {
    // The absence is the design, the same way ATMOSPHERE.shake.floor's is.
    expect(apartAmount(true, RUPTURE.floor)).toBe(0);
    expect(apartAmount(true, RUPTURE.floor - 0.01)).toBe(0);
    expect(apartAmount(true, RUPTURE.floor + 0.01)).toBeGreaterThan(0);
  });

  it('ramps from the floor to one, and clamps at the top', () => {
    expect(apartAmount(true, 1)).toBe(1);
    expect(apartAmount(true, 2)).toBe(1);
    // Halfway between the floor and 1 is half the effect.
    const half = RUPTURE.floor + (1 - RUPTURE.floor) / 2;
    expect(apartAmount(true, half)).toBeCloseTo(0.5, 10);
  });

  it('gives the board’s own opening GRIT a third of the shelf, not half', () => {
    // 0.55 is what OPENING_STATE sits at, and the floor is why arming a board
    // straight out of the box is a hint rather than a wreck.
    expect(apartAmount(true, 0.55)).toBeCloseTo((0.55 - RUPTURE.floor) / (1 - RUPTURE.floor), 10);
    expect(apartAmount(true, 0.55)).toBeLessThan(0.35);
  });
});

describe('the six effects’ arithmetic', () => {
  it('splits the plate’s channels by nothing at rest and by the cap at full', () => {
    expect(aberrationAt(0)).toBe(0);
    expect(aberrationAt(1)).toBe(RUPTURE.aberration.maxPx);
  });

  it('rests the lamp multiplier at exactly one, so an unarmed lamp is unchanged', () => {
    // The identity, and the reason `--overdrive` is not an amount like the other
    // two: it is handed to `brightness()`, where zero would black out every lit
    // lamp on the board. The resting string and the CSS fallback are the same
    // number by construction rather than by a second copy of it.
    expect(Number(lampBoostAt(0))).toBe(1);
    expect(lampBoostAt(0)).toBe(Number(RUPTURE_REST.overdrive).toFixed(RUPTURE.digits));
    expect(Number(lampBoostAt(1))).toBe(RUPTURE.lamp.maxBoost);
  });

  it('melts off MURK past its own floor, and not at all on a disarmed board', () => {
    expect(meltAt(1, 0)).toBe(0);
    expect(meltAt(RUPTURE.melt.murkFloor, 1)).toBe(0);
    expect(meltAt(1, 1)).toBe(1);
    // Scaled by the shelf's amount as well as by MURK — both dials, not either.
    expect(meltAt(1, 0.5)).toBeCloseTo(0.5, 10);
  });

  it('rolls only at extreme GRIT, well above the shelf’s own floor', () => {
    expect(RUPTURE.roll.gritFloor).toBeGreaterThan(RUPTURE.floor);
    expect(rollArmed(true, RUPTURE.roll.gritFloor - 0.01, false)).toBe(false);
    expect(rollArmed(true, RUPTURE.roll.gritFloor, false)).toBe(true);
    expect(rollArmed(true, 1, true)).toBe(false);
    expect(rollArmed(false, 1, false)).toBe(false);
  });
});

describe('the slice table', () => {
  const { tops, heights, offsets } = RUPTURE.slice;

  it('is one table walked together, so a band is a band rather than three', () => {
    expect(heights).toHaveLength(tops.length);
    expect(offsets).toHaveLength(tops.length);
  });

  it('alternates its throw every step, wrap included, so a rattle never slides', () => {
    // The same property ATMOSPHERE.shake.jitter's x has and for the same reason:
    // two steps the same way would read as the board being dragged.
    for (let at = 0; at < offsets.length; at += 1) {
      const here = offsets[at] ?? 0;
      const next = offsets[(at + 1) % offsets.length] ?? 0;
      expect(Math.sign(here), `entry ${at}`).not.toBe(Math.sign(next));
    }
  });

  it('sums to nothing across the cycle, so a held rattle stays centred', () => {
    expect(offsets.reduce((total, one) => total + one, 0)).toBeCloseTo(0, 10);
  });

  it('wraps rather than running off the end, and is the same every session', () => {
    // Nothing here is randomised at runtime, which is the whole reason a suite
    // can quote it back at all.
    for (let at = 0; at < tops.length; at += 1) {
      expect(sliceAt(at + tops.length, 1)).toEqual(sliceAt(at, 1));
      expect(sliceAt(at, 1)).toEqual(sliceAt(at, 1));
    }
  });

  it('scales the throw by the amount and the shape by the table', () => {
    const full = sliceAt(0, 1);
    const half = sliceAt(0, 0.5);
    // Same band, half as far.
    expect(full.top).toBe(half.top);
    expect(Number.parseFloat(half.shift)).toBeCloseTo(Number.parseFloat(full.shift) / 2, 6);
  });

  it('never rounds a band away to nothing', () => {
    // A strike that armed the shelf and then showed no band would read as a bug.
    for (let at = 0; at < tops.length; at += 1) {
      expect(Number.parseFloat(sliceAt(at, 0.001).height), `entry ${at}`).toBeGreaterThan(0);
    }
  });
});

describe('a disarmed shelf', () => {
  it('writes every variable at rest and puts no filter on the plate', () => {
    const { shelf, plate } = build();
    // Both boxes driven to the top *without* arming. A disarmed board sitting at
    // GRIT 0 would pass this check for the wrong reason — it is the arm that has
    // to be doing the work here, not the dial being down.
    shelf.setGrit(1);
    shelf.setMurk(1);

    expect(read('--apartAmount')).toBe(Number(RUPTURE_REST.apartAmount).toFixed(RUPTURE.digits));
    expect(read('--melt')).toBe(Number(RUPTURE_REST.melt).toFixed(RUPTURE.melt.digits));
    expect(Number(read('--overdrive'))).toBe(Number(RUPTURE_REST.overdrive));
    // Not a zero-offset filter — no filter. An identity filter still costs the
    // browser a render surface for the whole plate.
    expect(plate.style.filter).toBe('');
  });

  it('runs neither keyframed layer, however far GRIT is driven', () => {
    const { shelf, mount } = build();
    shelf.setGrit(1);
    shelf.setMurk(1);
    expect(layer(mount, 'roll').style.display).toBe('none');
    expect(layer(mount, 'strobe').style.display).toBe('none');
  });

  it('tears nothing on a strike', () => {
    const { shelf, mount } = build();
    shelf.setGrit(1);
    for (let hit = 0; hit < 20; hit += 1) shelf.strike();
    expect(layer(mount, 'slices').childElementCount).toBe(0);
  });

  it('is the state a freshly built shelf is in, without being told', () => {
    // The default is off because nothing turned it on, not because something
    // turned it off. See ../src/apart.
    const { plate, mount } = build();
    expect(plate.style.filter).toBe('');
    expect(layer(mount, 'strobe').style.display).toBe('none');
  });
});

describe('an armed shelf', () => {
  it('splits the plate through a filter, not a transform', () => {
    const { plate } = armedAt(1);
    // The whole of why gt#33's rule survives: a filter moves pixels and leaves
    // layout boxes alone, so every jack the wire layer measures is where it was.
    expect(plate.style.filter).toBe(`url(#${RUPTURE.aberration.id})`);
    // Read by name rather than through the typed properties: `translate` and
    // `scale` are not surfaced as fields by every DOM, and what matters is that
    // the plate carries no such declaration at all, whatever the shape of the
    // object reporting it.
    for (const moved of ['transform', 'translate', 'scale', 'rotate']) {
      expect(plate.style.getPropertyValue(moved), moved).toBe('');
    }
  });

  it('offsets the two channels opposite ways by the same amount', () => {
    const { mount } = armedAt(1);
    const offsets = [...mount.querySelectorAll('feOffset')].map((node) => Number(node.getAttribute('dx')));
    expect(offsets[0]).toBe(-(offsets[1] as number));
    expect(offsets[1]).toBeGreaterThan(0);
  });

  it('rests at a fringe between hits, not at the whole split (gt#82)', () => {
    // Held at its full reach the split was a static red/cyan offset, which is
    // what an anaglyph 3D image is — and that is how it read.
    const { mount } = armedAt(1);
    const dx = Number(mount.querySelectorAll('feOffset')[1]?.getAttribute('dx'));

    expect(dx).toBe(splitAt(1, 0));
    expect(dx).toBeCloseTo(RUPTURE.aberration.maxPx * RUPTURE.aberration.rest, 2);
    expect(dx).toBeLessThan(RUPTURE.aberration.maxPx / 3);
  });

  /** Every value the right-hand channel's offset is written to, in order. */
  function watched(mount: HTMLElement): number[] {
    const node = mount.querySelectorAll('feOffset')[1] as SVGFEOffsetElement;
    const written: number[] = [];
    const set = node.setAttribute.bind(node);
    node.setAttribute = (name: string, value: string): void => {
      if (name === 'dx') written.push(Number(value));
      set(name, value);
    };
    return written;
  }

  /**
   * One strike on an armed shelf, with the burst loop driven by hand at a
   * display's rate (gt#120): every value written, where the split rests, and
   * how long the loop ran before it stopped asking for frames.
   *
   * By hand because a frame in this environment is as fast as the machine cares
   * to make it, and the loop is on a clock now — left to itself it would run
   * tens of thousands of frames in the quarter second a burst lasts.
   */
  function burstAt(hz: number): { written: number[]; rest: number; ms: number } {
    const queue: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (run: FrameRequestCallback): number => queue.push(run));
    vi.stubGlobal('cancelAnimationFrame', (): void => {});
    const { shelf, mount } = armedAt(1);
    const rest = Number(mount.querySelectorAll('feOffset')[1]?.getAttribute('dx'));
    const written = watched(mount);

    shelf.strike();
    let frames = 0;
    for (let now = 5000; queue.length > 0 && frames < 5000; now += 1000 / hz) {
      queue.shift()?.(now);
      frames += 1;
    }
    // From the frame of the hit to the last frame asked for.
    return { written, rest, ms: ((frames - 1) * 1000) / hz };
  }

  it('is thrown to its whole reach by a strike, and settles back', () => {
    const { written, rest } = burstAt(60);

    // The frame of the hit is the whole split…
    expect(written[0]).toBe(RUPTURE.aberration.maxPx);
    // …every frame after it is closer in than the one before…
    for (let i = 1; i < written.length; i += 1) {
      expect(written[i], `write ${i}`).toBeLessThanOrEqual(written[i - 1] as number);
    }
    // …and it ends at the fringe it started from, and stops writing.
    expect(written.at(-1)).toBe(rest);
    expect(written.length).toBeGreaterThanOrEqual(10);
    expect(written.length).toBeLessThanOrEqual(22);
  });

  it('settles in the same quarter second whatever the display runs at (gt#120)', () => {
    // It used to lose a fifth of itself every frame, so a 144Hz display settled
    // the channels in a tenth of a second and a 30Hz one took half a second.
    const usual = burstAt(60);
    expect(usual.ms).toBeGreaterThan(150);
    expect(usual.ms).toBeLessThan(400);

    for (const hz of [30, 75, 120, 144, 240]) {
      const run = burstAt(hz);
      expect(run.written[0], `${hz}Hz`).toBe(RUPTURE.aberration.maxPx);
      expect(run.written.at(-1), `${hz}Hz`).toBe(run.rest);
      // To within a frame of the slower of the two displays, which is as close
      // as a thing that stops on a frame can be asked to agree.
      expect(Math.abs(run.ms - usual.ms), `${hz}Hz`).toBeLessThanOrEqual(1000 / Math.min(hz, 60) + 1);
    }
  });

  it('spends a burst in about a quarter of a second, and then it is over', () => {
    let burst = 1;
    let frames = 0;
    while (burst > 0) {
      burst = burstAfter(burst);
      frames += 1;
    }

    expect(frames).toBeGreaterThanOrEqual(10);
    expect(frames).toBeLessThanOrEqual(20);
    // A frame half as long spends half as much, so two of them are one (gt#120).
    expect(burstAfter(burstAfter(1, 0.5), 0.5)).toBeCloseTo(burstAfter(1), 12);
    expect(burstAfter(1, 1)).toBe(burstAfter(1));
    expect(burstAfter(RUPTURE.aberration.floor)).toBe(0);
    expect(splitAt(1, 1)).toBe(aberrationAt(1));
    expect(splitAt(0.5, 1)).toBe(aberrationAt(0.5));
    expect(splitAt(0, 1)).toBe(0);
  });

  it('ends a burst at once when the board is stilled or disarmed', async () => {
    const stilled = armedAt(1);
    stilled.shelf.strike();
    stilled.shelf.setStill(true);
    await new Promise((done) => setTimeout(done, 60));
    expect(stilled.plate.style.filter).toBe('');

    const disarmed = armedAt(1);
    disarmed.shelf.strike();
    disarmed.shelf.setArmed(false);
    await new Promise((done) => setTimeout(done, 60));
    expect(disarmed.plate.style.filter).toBe('');
  });

  it('still throws the split on a hit that finds every band already in use', async () => {
    // The cap is the slices' own. A rattle that has used up its bands still
    // knocks the channels apart.
    const { shelf, mount } = armedAt(1);
    for (let hit = 0; hit < RUPTURE.slice.cap; hit += 1) shelf.strike();
    expect(layer(mount, 'slices').childElementCount).toBe(RUPTURE.slice.cap);
    const written = watched(mount);

    shelf.strike();
    await new Promise((done) => setTimeout(done, 60));

    expect(layer(mount, 'slices').childElementCount).toBeLessThanOrEqual(RUPTURE.slice.cap);
    expect(Math.max(...written)).toBe(RUPTURE.aberration.maxPx);
  });

  it('tears a band on a strike, and takes it off again', async () => {
    const { shelf, mount } = armedAt(1);
    shelf.strike();
    const slices = layer(mount, 'slices');
    expect(slices.childElementCount).toBe(1);

    await new Promise((done) => setTimeout(done, RUPTURE.slice.holdMs + 20));
    expect(slices.childElementCount).toBe(0);
  });

  it('refuses over the cap rather than queueing, the way a bloom does', () => {
    const { shelf, mount } = armedAt(1);
    for (let hit = 0; hit < RUPTURE.slice.cap * 4; hit += 1) shelf.strike();
    expect(layer(mount, 'slices').childElementCount).toBe(RUPTURE.slice.cap);
  });

  it('paints a fallback under the backdrop filter, for a browser without one', () => {
    const { shelf, mount } = armedAt(1);
    shelf.strike();
    const band = layer(mount, 'slices').firstElementChild as HTMLElement;
    expect(band.style.background).toContain('rgba');
    expect(band.style.backdropFilter || band.style.getPropertyValue('backdrop-filter')).toBe(
      paint.sliceFilter,
    );
  });

  it('says how far the plate is blurred at a melt, and says nothing at none', () => {
    // gt#109. The string a `blur()` takes — and the empty string, not `0px`, for
    // no melt, because no blur is no filter rather than a filter of nothing.
    expect(meltBlurAt(0)).toBe('');
    expect(meltBlurAt(1)).toBe(`${RUPTURE.melt.maxBlurPx.toFixed(2)}px`);
    expect(meltBlurAt(0.5)).toBe(`${(RUPTURE.melt.maxBlurPx / 2).toFixed(2)}px`);
    // Out of range clamps, and a melt too small to write is none.
    expect(meltBlurAt(4)).toBe(meltBlurAt(1));
    expect(meltBlurAt(-1)).toBe('');
    expect(meltBlurAt(0.001)).toBe('');
    // Soft, not smeared: the board is still a board under it.
    expect(RUPTURE.melt.maxBlurPx).toBeLessThanOrEqual(2);
    expect(RUPTURE.melt.maxBlurPx).toBeGreaterThan(0);
  });

  it('blurs the whole plate when the board melts, not the names on it', () => {
    // The regression. The melt's blur was on each module and box name and on
    // nothing else, so at high MURK the headings went soft while the tape, the
    // knobs and the plates stayed sharp. It is one filter on the plate now,
    // which is everything on it at once, composed with the colour split that
    // was already there.
    const { shelf, plate } = armedAt(1, 1);
    const split = `url(#${RUPTURE.aberration.id})`;
    expect(plate.style.filter).toBe(`${split} blur(${meltBlurAt(1)})`);

    // MURK back under its floor: the blur goes and the split stays.
    shelf.setMurk(RUPTURE.melt.murkFloor);
    expect(plate.style.filter).toBe(split);

    // Part of the way up, part of the blur.
    const half = RUPTURE.melt.murkFloor + (1 - RUPTURE.melt.murkFloor) / 2;
    shelf.setMurk(half);
    expect(plate.style.filter).toBe(`${split} blur(${meltBlurAt(meltAt(half, 1))})`);
    expect(Number.parseFloat(meltBlurAt(meltAt(half, 1)))).toBeLessThan(RUPTURE.melt.maxBlurPx);
  });

  it('blurs nothing on a board that is not armed, however far MURK is turned', () => {
    const { shelf, plate } = build();
    shelf.setGrit(1);
    shelf.setMurk(1);
    expect(plate.style.filter).toBe('');
    expect(plate.style.filter).not.toContain('blur');
  });

  it('keeps the blur through a strike’s burst and lets go of it when the board is stilled', () => {
    const { shelf, plate } = armedAt(1, 1);
    shelf.strike();
    expect(plate.style.filter).toContain(`blur(${meltBlurAt(1)})`);
    expect(plate.style.filter).toContain(`url(#${RUPTURE.aberration.id})`);

    shelf.setStill(true);
    expect(plate.style.filter).toBe('');
    shelf.setStill(false);
    expect(plate.style.filter).toContain(`blur(${meltBlurAt(1)})`);
  });

  it('overdrives the lamps and melts the board only when both dials say so', () => {
    const { shelf } = armedAt(1, 1);
    expect(Number(read('--overdrive'))).toBe(RUPTURE.lamp.maxBoost);
    expect(Number(read('--melt'))).toBe(1);

    // MURK back under its floor: the melt goes and the overdrive stays.
    shelf.setMurk(0);
    expect(Number(read('--melt'))).toBe(0);
    expect(Number(read('--overdrive'))).toBe(RUPTURE.lamp.maxBoost);
  });
});

describe('STILLNESS over the arm', () => {
  it('kills all six however hard the board is armed', () => {
    const { shelf, mount, plate } = armedAt(1, 1);
    shelf.strike();
    expect(layer(mount, 'slices').childElementCount).toBe(1);

    shelf.setStill(true);

    expect(plate.style.filter).toBe('');
    expect(layer(mount, 'roll').style.display).toBe('none');
    expect(layer(mount, 'strobe').style.display).toBe('none');
    expect(layer(mount, 'slices').childElementCount).toBe(0);
    expect(Number(read('--apartAmount'))).toBe(0);
    expect(Number(read('--melt'))).toBe(0);
    expect(Number(read('--overdrive'))).toBe(1);
  });

  it('refuses a strike while it holds, and does not replay it after', () => {
    const { shelf, mount } = armedAt(1);
    shelf.setStill(true);
    for (let hit = 0; hit < 5; hit += 1) shelf.strike();
    expect(layer(mount, 'slices').childElementCount).toBe(0);

    shelf.setStill(false);
    // Released, nothing catches up — the sound already happened.
    expect(layer(mount, 'slices').childElementCount).toBe(0);
  });

  it('lets the arm be moved underneath it, changing nothing on screen', () => {
    const { shelf, plate } = build();
    shelf.setGrit(1);
    shelf.setStill(true);
    shelf.setArmed(true);
    expect(plate.style.filter).toBe('');
    expect(Number(read('--apartAmount'))).toBe(0);

    // …and the arm is remembered, so releasing the other switch applies it.
    shelf.setStill(false);
    expect(plate.style.filter).toBe(`url(#${RUPTURE.aberration.id})`);
  });
});

describe('the arrow, and the teardown', () => {
  it('is told a strike happened and is handed nothing to answer with', () => {
    // ../src/ui/atmosphere keeps the arrow by taking a reading function rather
    // than an engine. This file keeps it more simply: there is no audio input
    // here at all. `strike` takes no argument and returns nothing, so there is
    // no channel back even in principle.
    const { shelf } = armedAt(1);
    expect(shelf.strike()).toBeUndefined();
    expect(shelf.strike.length).toBe(0);
  });

  it('takes the filter off the plate and every variable off the page', () => {
    const { shelf, mount, plate } = armedAt(1, 1);
    shelf.strike();
    shelf.destroy();
    live.length = 0;

    expect(plate.style.filter).toBe('');
    for (const name of RUPTURE_VARS) expect(read(name), name).toBe('');
    for (const part of ['roll', 'slices', 'strobe']) {
      expect(mount.querySelector(`[data-part="${part}"]`), part).toBeNull();
    }
    expect(mount.querySelector('svg')).toBeNull();
  });
});
