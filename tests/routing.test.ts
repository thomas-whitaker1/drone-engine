// The wire list against the real board. The spine's routing has its own unit
// tests in engine-core, written against a stand-in box and a bare outlet; these
// are the same rules exercised over the thirteen things the user actually
// patches — the nine voices and the four boxes of THE CHAIN.
//
// Two of the issue's promises can only be made here. A stand-in outlet has no
// synthesis behind it, so it cannot show that re-patching leaves a voice's own
// graph alone; and a stand-in box is not one of the four the board opens on, so
// it cannot carry the default patch.

import { describe, expect, it } from 'vitest';
import { MODIFIER_IDS, SOURCE_IDS, type ModifierId, type SourceId } from '../src/engine/constants';
import { OPENING_WIRES } from '../src/ui';
import { box, fullBoard, source } from './support/board';
import { asFake, reachable, type FakeAudioContext, type FakeAudioNode } from './support/fake-audio-context';

/** Every node this context made that feeds `target`, in the order they were built. */
function feeding(ctx: FakeAudioContext, target: FakeAudioNode): FakeAudioNode[] {
  return ctx.created.filter((node) => node.connections.includes(target));
}

/** The same patch read the other way: which box each voice lands in, if any. */
const DEFAULT_TARGETS: Partial<Record<SourceId, ModifierId>> = {
  guitar: 'grit',
  bass: 'murk',
  slowhit: 'cavern',
};

describe('routing the real board', () => {
  it('sends every unpatched voice and every unfed box straight to the speakers', () => {
    const { engine } = fullBoard();

    for (const id of SOURCE_IDS) {
      expect(asFake(source(engine, id).pow).nodes).toEqual([asFake(engine.masterIn)]);
    }
    for (const id of MODIFIER_IDS) {
      expect(asFake(box(engine, id).out).nodes).toEqual([asFake(engine.masterIn)]);
    }
  });

  it('carries the default patch across all nine voices', () => {
    const { engine } = fullBoard();

    engine.setWires(OPENING_WIRES);

    for (const id of SOURCE_IDS) {
      const target = DEFAULT_TARGETS[id];
      expect(asFake(source(engine, id).pow).nodes).toEqual([
        target ? asFake(box(engine, target).in) : asFake(engine.masterIn),
      ]);
    }
    expect(asFake(box(engine, 'grit').out).nodes).toEqual([asFake(box(engine, 'cavern').in)]);
    // MURK, WOBBLE and CAVERN are patched onward to nothing, so they land on master themselves.
    for (const id of ['murk', 'wobble', 'cavern'] as const) {
      expect(asFake(box(engine, id).out).nodes).toEqual([asFake(engine.masterIn)]);
    }
  });

  it('runs a voice through two boxes and out', () => {
    const { engine } = fullBoard();

    engine.setWires([
      { from: 'guitar', to: 'grit' },
      { from: 'grit', to: 'cavern' },
    ]);

    const guitar = source(engine, 'guitar');
    expect(asFake(guitar.pow).nodes).toEqual([asFake(box(engine, 'grit').in)]);
    expect(asFake(box(engine, 'grit').out).nodes).toEqual([asFake(box(engine, 'cavern').in)]);
    expect(asFake(box(engine, 'cavern').out).nodes).toEqual([asFake(engine.masterIn)]);
    // And the whole path holds end to end, not only hop by hop.
    expect(reachable(asFake(guitar.pow))).toContain(asFake(engine.masterIn));
  });

  it('carries a strike through the box it is patched into', () => {
    const { engine, ctx } = fullBoard();
    engine.setWires([{ from: 'slowhit', to: 'cavern' }]);

    // A strike builds nothing at rest, so its nodes only exist once it has fired.
    const outlet = source(engine, 'slowhit');
    const before = ctx.created.length;
    outlet.trigger?.(engine.now());
    const built = ctx.created.slice(before).filter((node) => node.connections.includes(asFake(outlet.loud)));

    expect(built.length).toBeGreaterThan(0);
    for (const node of built) {
      const downstream = reachable(node);
      expect(downstream).toContain(asFake(box(engine, 'cavern').in));
      expect(downstream).toContain(asFake(engine.masterIn));
    }
  });

  it('fans one voice out to several boxes', () => {
    const { engine } = fullBoard();

    engine.setWires([
      { from: 'chainsaw', to: 'grit' },
      { from: 'chainsaw', to: 'murk' },
      { from: 'chainsaw', to: 'wobble' },
    ]);

    expect(asFake(source(engine, 'chainsaw').pow).nodes).toEqual([
      asFake(box(engine, 'grit').in),
      asFake(box(engine, 'murk').in),
      asFake(box(engine, 'wobble').in),
    ]);
  });

  it('lets several voices feed one box', () => {
    const { engine } = fullBoard();

    engine.setWires([
      { from: 'sax', to: 'cavern' },
      { from: 'voice', to: 'cavern' },
      { from: 'cow', to: 'cavern' },
    ]);

    const target = asFake(box(engine, 'cavern').in);
    for (const id of ['sax', 'voice', 'cow'] as const) {
      expect(asFake(source(engine, id).pow).nodes).toEqual([target]);
    }
  });

  it('drops the old cable when the patch changes', () => {
    const { engine } = fullBoard();

    engine.setWires([
      { from: 'bass', to: 'murk' },
      { from: 'murk', to: 'cavern' },
    ]);
    engine.setWires([{ from: 'bass', to: 'wobble' }]);

    expect(asFake(source(engine, 'bass').pow).nodes).toEqual([asFake(box(engine, 'wobble').in)]);
    // MURK is out of the patch entirely now, so it falls back to master.
    expect(asFake(box(engine, 'murk').out).nodes).toEqual([asFake(engine.masterIn)]);
  });

  it('rebuilds rather than accumulates when the same patch is re-applied', () => {
    const { engine } = fullBoard();

    engine.setWires(OPENING_WIRES);
    engine.setWires(OPENING_WIRES);

    expect(asFake(source(engine, 'guitar').pow).nodes).toEqual([asFake(box(engine, 'grit').in)]);
    expect(asFake(box(engine, 'grit').out).nodes).toEqual([asFake(box(engine, 'cavern').in)]);
    expect(asFake(source(engine, 'slowhit').pow).nodes).toEqual([asFake(box(engine, 'cavern').in)]);
  });

  it('ignores a cable that lands on something that is not a box', () => {
    const { engine } = fullBoard();

    // Only a modifier can be a destination; a voice is never a `to`.
    engine.setWires([
      { from: 'grit', to: 'guitar' },
      { from: 'cymbal', to: 'tremolo' },
    ]);

    expect(asFake(box(engine, 'grit').out).nodes).toEqual([asFake(engine.masterIn)]);
    expect(asFake(source(engine, 'cymbal').pow).nodes).toEqual([asFake(engine.masterIn)]);
  });

  it('never disturbs a voice or a box on the way through', () => {
    const { engine, ctx } = fullBoard();
    // What each voice had built behind its own outlet before anything was patched.
    const built = new Map(SOURCE_IDS.map((id) => [id, feeding(ctx, asFake(source(engine, id).loud))]));

    engine.setWires([{ from: 'guitar', to: 'grit' }]);
    engine.setWires([
      { from: 'guitar', to: 'murk' },
      { from: 'murk', to: 'cavern' },
    ]);
    engine.setWires([]);

    for (const id of SOURCE_IDS) {
      const outlet = source(engine, id);
      expect(asFake(outlet.loud).nodes).toEqual([asFake(outlet.pow)]);
      expect(feeding(ctx, asFake(outlet.loud))).toEqual(built.get(id));
    }
    for (const id of MODIFIER_IDS) {
      // The router only ever moves a box's `out`; its own in → fx → out is the builder's.
      expect(reachable(asFake(box(engine, id).in))).toContain(asFake(box(engine, id).out));
    }
  });
});
