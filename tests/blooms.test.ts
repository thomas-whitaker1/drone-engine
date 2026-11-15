// @vitest-environment happy-dom
//
// The flash, judged on the three things about it that are decidable: where it is
// drawn, what it is drawn in, and when it stops existing. Whether it reads as
// light behind the plate is the ear-and-eye pass's problem.
//
// The cap is the case worth having. MARACAS at full FRENZY fires ten hits inside
// one trigger, so "bails out rather than queues" is a claim about a real moment
// rather than a defensive nicety — and the difference between the two is
// invisible on screen and obvious in a profile.
//
// Rects are stubbed rather than laid out: happy-dom reports every element at the
// origin with no size, so a real geometry assertion would only be checking that
// zero is zero. What is asserted is the arithmetic the browser is handed.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bloomColor, bloomStyle, createBloomLayer } from '../src/ui';
import type { BloomLayerHandle } from '../src/ui';
import { BLOOM, RUPTURE, SMASH } from '../src/ui/constants';
import { HEARTBEAT, STRIKE_IDS } from '../src/engine/constants';
import { bloom as tokens, sourcePlates } from '../src/tokens';
import { ringStyle, shockDelay, shockRadius, shockStrength, shockStyle } from '../src/ui/blooms';

const live: BloomLayerHandle[] = [];

/** The five that strike, which are the five that bloom. */
const STRIKERS = ['slowhit', 'cymbal', 'voice', 'maracas', 'cow'] as const;

/** A rect at a knowable place, since nothing in happy-dom has one of its own. */
function rect(left: number, top: number, width = 200, height = 100): DOMRect {
  return new DOMRect(left, top, width, height);
}

/**
 * A layer over a stand-in board carrying one plate per module, each answering
 * `getBoundingClientRect` with a rect of its own.
 */
function build(rects: Readonly<Record<string, DOMRect>> = {}): {
  layer: BloomLayerHandle;
  board: HTMLElement;
} {
  const board = document.createElement('div');
  document.body.appendChild(board);
  for (const id of Object.keys(sourcePlates)) {
    const plate = document.createElement('div');
    plate.dataset.module = id;
    plate.getBoundingClientRect = () => rects[id] ?? rect(0, 0);
    board.appendChild(plate);
  }
  const layer = createBloomLayer({ board });
  live.push(layer);
  document.body.appendChild(layer.element);
  return { layer, board };
}

/** Every bloom currently on the layer. */
const blooms = (layer: BloomLayerHandle): HTMLElement[] =>
  Array.from(layer.element.querySelectorAll<HTMLElement>('[data-part="bloom"]'));

/** Run `count` animation frames. Two is what the flip waits for. */
const frames = (count = 1): void => {
  for (let i = 0; i < count; i++) vi.advanceTimersByTime(16);
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const layer of live.splice(0)) layer.destroy();
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('the bloom layer', () => {
  it('hangs off the page, over the atmosphere and untouchable', () => {
    const { layer } = build();

    // Fixed rather than absolute, for the reason the tip tag is: the plate
    // carries `zoom:var(--fit)` and would scale a fixed child with it.
    expect(layer.element.style.position).toBe('fixed');
    expect(layer.element.style.pointerEvents).toBe('none');
    expect(Number(layer.element.style.zIndex)).toBe(BLOOM.zIndex);
    expect(layer.element.childElementCount).toBe(0);
  });

  it('draws nothing until something is struck', () => {
    const { layer } = build();

    frames(10);

    expect(blooms(layer)).toHaveLength(0);
  });
});

describe('STILLNESS', () => {
  it('refuses a strike outright rather than deferring it', () => {
    const { layer } = build();
    layer.setStill(true);

    layer.strike('cymbal');
    frames(4);

    // Refused the way the cap refuses: not queued, not retried, not counted. The
    // sound still happened — this layer never had anything to do with that.
    expect(blooms(layer)).toHaveLength(0);
  });

  it('takes down anything already in flight when it is pressed', () => {
    const { layer } = build();
    layer.strike('cymbal');
    layer.strike('slowhit');
    expect(blooms(layer)).toHaveLength(2);

    layer.setStill(true);

    // A switch pressed mid-rattle that let ten discs go on spreading would be
    // answering a second too late to be the switch it says it is.
    expect(blooms(layer)).toHaveLength(0);
  });

  it('replays nothing when it is released', () => {
    const { layer } = build();
    layer.setStill(true);
    layer.strike('cymbal');
    layer.strike('cow');

    layer.setStill(false);
    frames(4);

    // The refused strikes are gone, not banked. Only the next real hit flashes.
    expect(blooms(layer)).toHaveLength(0);
    layer.strike('cymbal');
    expect(blooms(layer)).toHaveLength(1);
  });
});

describe('one bloom', () => {
  it('lands on the centre of the plate that struck, in viewport space', () => {
    const { layer } = build({ cymbal: rect(300, 120, 240, 160) });

    layer.strike('cymbal');

    // The centre of the rect as the window reports it, undivided: this layer is
    // fixed and the rect is already in viewport space, so `--fit` never enters.
    const [node] = blooms(layer);
    expect(node?.style.left).toBe(`${300 + 240 / 2}px`);
    expect(node?.style.top).toBe(`${120 + 160 / 2}px`);
    // Centred on that point by pulling itself half its own size back.
    expect(node?.style.marginTop).toBe(`${-tokens.size / 2}px`);
    expect(node?.style.marginLeft).toBe(`${-tokens.size / 2}px`);
  });

  it('gives SLOW HIT the big, bright one and everything else the small one', () => {
    const { layer } = build();

    layer.strike('slowhit');
    layer.strike('cow');
    const [heavy, rest] = blooms(layer);

    expect(heavy?.style.width).toBe(`${tokens.bigSize}px`);
    expect(heavy?.style.opacity).toBe(String(tokens.bigOpacity));
    expect(heavy?.style.backgroundImage).toContain(String(tokens.bigInner));

    expect(rest?.style.width).toBe(`${tokens.size}px`);
    expect(rest?.style.opacity).toBe(String(tokens.opacity));
    expect(rest?.style.backgroundImage).toContain(String(tokens.inner));

    // Larger *and* brighter — the heaviest thing on the board, not merely the
    // biggest.
    expect(tokens.bigSize).toBeGreaterThan(tokens.size);
    expect(tokens.bigOpacity).toBeGreaterThan(tokens.opacity);
    expect(tokens.bigInner).toBeGreaterThan(tokens.inner);
  });

  it('blooms each striking module in its own colour', () => {
    for (const id of STRIKERS) {
      const colour = sourcePlates[id].bloom;
      expect(colour, id).toBeTruthy();
      expect(bloomColor(id), id).toBe(colour);
      expect(bloomStyle(id, rect(0, 0)), id).toContain(`rgba(${colour},`);
    }
  });

  it('falls back for anything with no colour of its own', () => {
    // A drone never strikes, so this is the tenth module's case rather than the
    // guitar's: nothing in this file lists which five bloom.
    expect(bloomColor('guitar')).toBe(tokens.fallback);
    expect(bloomColor('nothing-of-the-sort')).toBe(tokens.fallback);
  });

  it('fades out of a shape that has no edge to see', () => {
    const style = bloomStyle('cow', rect(0, 0));

    expect(style).toContain(`radial-gradient(circle,`);
    expect(style).toContain(`rgba(0,0,0,0) ${BLOOM.stop}%`);
    expect(style).toContain('border-radius:50%');
  });
});

describe('the animation', () => {
  it('waits two frames before flipping, so the transition has somewhere to start', () => {
    const { layer } = build();

    layer.strike('voice');
    const [node] = blooms(layer);
    expect(node?.style.transform).toBe(`scale(${BLOOM.scale.from})`);
    expect(node?.style.transition).toBe(BLOOM.transition);

    // One frame is not enough: a node restyled in the frame it was appended in
    // has no computed start value, and the browser jumps to the end.
    frames();
    expect(node?.style.transform).toBe(`scale(${BLOOM.scale.from})`);

    frames();
    expect(node?.style.transform).toBe(`scale(${BLOOM.scale.to})`);
    expect(node?.style.opacity).toBe('0');
  });

  it('spreads past its own size from well inside it', () => {
    expect(BLOOM.scale.from).toBeLessThan(1);
    expect(BLOOM.scale.to).toBeGreaterThan(1);
  });

  it('takes the node off the page after the transition, not during it', () => {
    const { layer } = build();
    layer.strike('maracas');

    // Measured from the strike, which is where the clock starts: the flip
    // happens inside this window rather than restarting it.
    vi.advanceTimersByTime(BLOOM.removeMs - 1);
    expect(blooms(layer)).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(blooms(layer)).toHaveLength(0);
  });
});

describe('the cap', () => {
  it('refuses rather than queues once the layer is full', () => {
    const { layer } = build();

    // A rattle: more hits inside one trigger than the layer will ever hold.
    for (let i = 0; i < BLOOM.cap + 6; i++) layer.strike('maracas');

    expect(blooms(layer)).toHaveLength(BLOOM.cap);

    // Nothing was deferred. Once the ten have gone, the refused six do not
    // arrive late — the sound they answered is long over.
    vi.advanceTimersByTime(BLOOM.removeMs * 2);
    expect(blooms(layer)).toHaveLength(0);
  });

  it('takes strikes again once the layer has emptied', () => {
    const { layer } = build();
    for (let i = 0; i < BLOOM.cap; i++) layer.strike('cymbal');
    vi.advanceTimersByTime(BLOOM.removeMs);

    layer.strike('cymbal');

    expect(blooms(layer)).toHaveLength(1);
  });

  it('never measures a plate it is not going to draw', () => {
    const { layer, board } = build();
    const plate = board.querySelector<HTMLElement>('[data-module="cow"]');
    const measure = vi.fn(() => rect(0, 0));
    if (plate) plate.getBoundingClientRect = measure;

    for (let i = 0; i < BLOOM.cap + 4; i++) layer.strike('cow');

    // Reading a rect forces layout, and the refused strikes are exactly the ones
    // firing when the board can least afford it.
    expect(measure).toHaveBeenCalledTimes(BLOOM.cap);
  });
});

describe('what it refuses', () => {
  it('says nothing for a module that is not on the board', () => {
    const { layer } = build();

    layer.strike('no-such-module');

    expect(blooms(layer)).toHaveLength(0);
  });

  it('stops accepting once it is torn down, and leaves no timer behind', () => {
    const { layer } = build();
    layer.strike('slowhit');
    // Past the flip, so the only thing still pending is the removal this layer
    // owns and is about to be asked to give up.
    frames(2);

    layer.destroy();

    expect(blooms(layer)).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);

    // A hit booked a lookahead ago can still arrive after the page is gone.
    layer.strike('slowhit');
    expect(blooms(layer)).toHaveLength(0);
  });
});

describe('the numbers', () => {
  it('are held to the original design', () => {
    expect(BLOOM.zIndex).toBe(50);
    expect(BLOOM.scale).toEqual({ from: 0.45, to: 1.4 });
    expect(BLOOM.transition).toBe('opacity 1s ease-out, transform 1s ease-out');
    expect(BLOOM.stop).toBe(70);
    expect(BLOOM.removeMs).toBe(1200);
    expect(Object.fromEntries(STRIKERS.map((id) => [id, sourcePlates[id].bloom]))).toEqual({
      slowhit: '255,180,100',
      cymbal: '230,225,200',
      voice: '220,190,140',
      maracas: '230,215,180',
      cow: '140,200,170',
    });
  });

  it('caps at two beats of every strike, where the reference stops at ten', () => {
    // The reference guarded with `childElementCount > 10`. It was written for
    // five strikes; with six, ten is one beat's glows and four of the next
    // (gt#68), so the last two strikes in the list went dark on every beat from
    // 60 BPM up. The cap is still exact and still refuses rather than queues.
    expect(BLOOM.cap).toBe(STRIKE_IDS.length * 2);
    // Why two beats is enough: a glow never outlives two of the fastest beats.
    expect(BLOOM.removeMs).toBeLessThan(2 * (60 / HEARTBEAT.maxBpm) * 1000);
    // And why one is not: it does outlive one of them.
    expect(BLOOM.removeMs).toBeGreaterThan((60 / HEARTBEAT.maxBpm) * 1000);
  });
});

// A hit with a size, an edge, and a plate that takes it (gt#81).
describe('how hard a hit blooms', () => {
  /** One number out of a style string, by the property it follows. */
  const read = (style: string, property: string): number =>
    Number(new RegExp(`(?:^|;)${property}:(-?[\\d.]+)`).exec(style)?.[1]);

  it('is the reference’s own bloom at full strength, and when nobody says', () => {
    for (const id of STRIKERS) {
      expect(bloomStyle(id, rect(10, 20), 1), id).toBe(bloomStyle(id, rect(10, 20)));
    }
    expect(read(bloomStyle('slowhit', rect(0, 0)), 'width')).toBe(tokens.bigSize);
    expect(read(bloomStyle('slowhit', rect(0, 0)), 'opacity')).toBe(tokens.bigOpacity);
  });

  it('is smaller and dimmer the quieter the module is set', () => {
    const loud = bloomStyle('cymbal', rect(0, 0), 1);
    const half = bloomStyle('cymbal', rect(0, 0), 0.5);
    const none = bloomStyle('cymbal', rect(0, 0), 0);

    expect(read(half, 'width')).toBeLessThan(read(loud, 'width'));
    expect(read(none, 'width')).toBeLessThan(read(half, 'width'));
    expect(read(half, 'opacity')).toBeLessThan(read(loud, 'opacity'));
    expect(read(none, 'opacity')).toBeLessThan(read(half, 'opacity'));
  });

  it('never shrinks to nothing: a hit that can be heard can be seen', () => {
    const none = bloomStyle('cymbal', rect(0, 0), 0);

    expect(read(none, 'width')).toBe(Math.round(tokens.size * BLOOM.strength.size));
    expect(read(none, 'opacity')).toBeCloseTo(tokens.opacity * BLOOM.strength.opacity, 3);
    expect(BLOOM.strength.size).toBeGreaterThanOrEqual(0.5);
    expect(BLOOM.strength.opacity).toBeGreaterThan(0.25);
    // And the size moves less than the brightness does.
    expect(BLOOM.strength.size).toBeGreaterThan(BLOOM.strength.opacity);
  });

  it('holds a strength from outside the range to its ends', () => {
    expect(bloomStyle('cow', rect(0, 0), 7)).toBe(bloomStyle('cow', rect(0, 0), 1));
    expect(bloomStyle('cow', rect(0, 0), -3)).toBe(bloomStyle('cow', rect(0, 0), 0));
  });

  it('stays centred on the plate whatever size it comes out', () => {
    const style = bloomStyle('slowhit', rect(100, 200, 200, 100), 0.3);
    const size = read(style, 'width');

    expect(read(style, 'left')).toBe(200);
    expect(read(style, 'top')).toBe(250);
    expect(style).toContain(`margin:${-size / 2}px 0 0 ${-size / 2}px`);
  });
});

describe('the front of a hit', () => {
  const rings = (layer: BloomLayerHandle): HTMLElement[] =>
    Array.from(layer.element.querySelectorAll<HTMLElement>('[data-part="ring"]'));

  it('leaves from the same point as the glow, as an edge and nothing else', () => {
    const { layer } = build({ cymbal: rect(100, 200, 200, 100) });

    layer.strike('cymbal');
    const [ring] = rings(layer);

    expect(ring?.style.left).toBe(blooms(layer)[0]?.style.left);
    expect(ring?.style.top).toBe(blooms(layer)[0]?.style.top);
    expect(ring?.style.borderRadius).toBe('50%');
    expect(ring?.style.borderWidth).toBe(`${BLOOM.ring.width}px`);
    // No fill: it is the one frame of edge a glow does not have.
    expect(ring?.style.background).toBe('');
    expect(ring?.style.pointerEvents).toBe('none');
  });

  it('is cut in the colour the module blooms in', () => {
    expect(ringStyle('cow', rect(0, 0))).toContain(`rgba(${sourcePlates.cow.bloom},${BLOOM.ring.alpha})`);
    expect(ringStyle('no-such-module', rect(0, 0))).toContain(`rgba(${tokens.fallback},`);
  });

  it('starts tight on the plate and runs out past its own size', () => {
    const { layer } = build();

    layer.strike('cymbal');
    const [ring] = rings(layer);
    expect(ring?.style.transform).toBe(`scale(${BLOOM.ring.from})`);
    expect(ring?.style.opacity).toBe('1');

    frames(2);
    expect(ring?.style.transform).toBe(`scale(${BLOOM.ring.to})`);
    expect(ring?.style.opacity).toBe('0');
    expect(BLOOM.ring.from).toBeLessThan(0.5);
    expect(BLOOM.ring.to).toBeGreaterThan(1);
  });

  it('is larger on SLOW HIT, and smaller on a quiet hit, as the glow is', () => {
    const width = (style: string): number => Number(/width:(\d+)px/.exec(style)?.[1]);

    expect(width(ringStyle('slowhit', rect(0, 0)))).toBe(BLOOM.ring.bigSize);
    expect(width(ringStyle('cymbal', rect(0, 0)))).toBe(BLOOM.ring.size);
    expect(width(ringStyle('cymbal', rect(0, 0), 0.2))).toBeLessThan(BLOOM.ring.size);
  });

  it('has left before the glow has finished spreading', () => {
    const { layer } = build();

    layer.strike('cymbal');
    vi.advanceTimersByTime(BLOOM.ring.ms + BLOOM.ring.slackMs);

    expect(rings(layer)).toHaveLength(0);
    expect(blooms(layer)).toHaveLength(1);
    expect(BLOOM.ring.ms).toBeLessThan(500);
    expect(BLOOM.ring.ms + BLOOM.ring.slackMs).toBeLessThan(BLOOM.removeMs);
  });

  it('does not count against the cap: ten hits is still ten hits', () => {
    const { layer } = build();

    for (let i = 0; i < BLOOM.cap + 5; i++) layer.strike('maracas');

    expect(blooms(layer)).toHaveLength(BLOOM.cap);
    expect(rings(layer)).toHaveLength(BLOOM.cap);
    // And the cap frees up as glows finish, not as rings do.
    vi.advanceTimersByTime(BLOOM.ring.ms + BLOOM.ring.slackMs);
    layer.strike('maracas');
    expect(blooms(layer)).toHaveLength(BLOOM.cap);
    vi.advanceTimersByTime(BLOOM.removeMs);
    layer.strike('maracas');
    expect(blooms(layer)).toHaveLength(1);
  });

  it('goes with the glow when the board is stilled, and none begins', () => {
    const { layer } = build();

    layer.strike('cymbal');
    layer.setStill(true);
    expect(layer.element.childElementCount).toBe(0);

    layer.strike('cymbal');
    expect(rings(layer)).toHaveLength(0);
  });
});

// The hammer's own front (gt#92): one ring off the anvil and out past every
// corner of the window. The plates' half of it is tests/board.test.ts's.
describe('the shockwave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const shocks = (layer: BloomLayerHandle): HTMLElement[] =>
    Array.from(layer.element.querySelectorAll<HTMLElement>('[data-part="shock"]'));

  /** A board with an anvil on it, at a place of the case's choosing. */
  function struck(at: DOMRect = rect(900, 40, 78, 16)): { layer: BloomLayerHandle; anvil: HTMLElement } {
    const { layer, board } = build();
    const anvil = document.createElement('div');
    anvil.dataset.part = 'anvil';
    anvil.getBoundingClientRect = () => at;
    board.appendChild(anvil);
    return { layer, anvil };
  }

  it('runs to the farthest corner of the window, wherever it starts', () => {
    expect(shockRadius(0, 0, 800, 600)).toBe(1000);
    expect(shockRadius(800, 600, 800, 600)).toBe(1000);
    expect(shockRadius(400, 300, 800, 600)).toBe(500);
    // Off to one side, the far corner is the one that counts.
    expect(shockRadius(700, 100, 800, 600)).toBeCloseTo(Math.hypot(700, 500), 10);
  });

  it('reaches a thing when its distance says, at one speed', () => {
    expect(shockDelay(0, 1000)).toBe(0);
    expect(shockDelay(500, 1000)).toBe(SMASH.shock.ms / 2);
    expect(shockDelay(1000, 1000)).toBe(SMASH.shock.ms);
    // Nothing waits longer than the ring takes, and nothing is asked to wait a
    // negative time or divide by a window with no size.
    expect(shockDelay(5000, 1000)).toBe(SMASH.shock.ms);
    expect(shockDelay(-3, 1000)).toBe(0);
    expect(shockDelay(10, 0)).toBe(0);
  });

  it('hits hardest at the anvil and never fades to nothing', () => {
    expect(shockStrength(0, 1000)).toBe(1);
    expect(shockStrength(1000, 1000)).toBeCloseTo(1 - SMASH.shock.falloff, 10);
    expect(shockStrength(9999, 1000)).toBeCloseTo(1 - SMASH.shock.falloff, 10);
    expect(shockStrength(500, 1000)).toBeGreaterThan(shockStrength(900, 1000));
    expect(1 - SMASH.shock.falloff).toBeGreaterThan(0);
  });

  it('is a line and not a glow, in the drum’s colour, moving at a constant speed', () => {
    const style = shockStyle(900, 48, 1000);

    expect(style).toContain('left:900px;top:48px;');
    expect(style).toContain('width:2000px;height:2000px;');
    expect(style).toContain(`border:${SMASH.shock.width}px solid rgba(${bloomColor('slowhit')},`);
    expect(style).not.toContain('background');
    // The plates are timed off distance alone, which is only true of a front
    // that does not ease.
    expect(style).toContain(`transform ${SMASH.shock.ms}ms linear`);
    expect(style).toContain('pointer-events:none');
  });

  it('leaves from the middle of the anvil and is gone when it has crossed', () => {
    const { layer } = struck(rect(900, 40, 78, 16));

    layer.blast();
    const [ring] = shocks(layer);
    expect(ring?.style.left).toBe('939px');
    expect(ring?.style.top).toBe('48px');
    expect(ring?.style.transform).toBe(`scale(${SMASH.shock.from})`);

    frames(2);
    expect(ring?.style.transform).toBe('scale(1)');
    expect(ring?.style.opacity).toBe('0');

    vi.advanceTimersByTime(SMASH.shock.ms + SMASH.shock.slackMs);
    expect(shocks(layer)).toHaveLength(0);
  });

  it('is not a strike: it draws no glow and does not count against the cap', () => {
    const { layer } = struck();

    layer.blast();
    expect(blooms(layer)).toHaveLength(0);
    for (let i = 0; i < BLOOM.cap; i++) layer.strike('maracas');
    expect(blooms(layer)).toHaveLength(BLOOM.cap);
  });

  it('holds a hammered board to a few rings, and takes more once they have crossed', () => {
    const { layer } = struck();

    for (let i = 0; i < SMASH.shock.cap + 4; i++) layer.blast();
    expect(shocks(layer)).toHaveLength(SMASH.shock.cap);

    vi.advanceTimersByTime(SMASH.shock.ms + SMASH.shock.slackMs);
    layer.blast();
    expect(shocks(layer)).toHaveLength(1);
  });

  it('does nothing on a stilled board, a torn-down one, or one with no anvil', () => {
    const none = build();
    none.layer.blast();
    expect(none.layer.element.childElementCount).toBe(0);

    const { layer } = struck();
    layer.blast();
    layer.setStill(true);
    expect(layer.element.childElementCount).toBe(0);
    layer.blast();
    expect(shocks(layer)).toHaveLength(0);

    layer.setStill(false);
    layer.destroy();
    layer.blast();
    expect(shocks(layer)).toHaveLength(0);
  });

  it('keeps the plates under the strobe’s own limit', () => {
    // The number that is a safety limit rather than a taste one: eleven plates
    // lighting is most of the screen, and the hammer swings faster than this.
    expect(1000 / SMASH.shock.minGapMs).toBeLessThan(RUPTURE.strobe.maxHz);
    expect(SMASH.shock.minGapMs).toBeGreaterThan(SMASH.swingMs);
  });
});
