// A started board with THE CHAIN on it, for the suites that need the real
// modifier boxes rather than a stand-in.

import { buildModifiers, buildSources, createEngine } from '../../src/engine';
import type { Engine, Modifier, Outlet } from '../../src/engine';
import type { ModifierId, SourceId } from '../../src/engine/constants';
import { asAudioContext, FakeAudioContext } from './fake-audio-context';

/**
 * The sample rate is deliberately low: CAVERN generates an 8.5s stereo impulse
 * per engine and the suites build a lot of engines. Nothing asserted against this
 * board is rate-dependent.
 */
export function chainBoard(): { engine: Engine; ctx: FakeAudioContext } {
  const ctx = new FakeAudioContext(8000);
  ctx.currentTime = 5;
  const engine = createEngine({ context: asAudioContext(ctx) });
  engine.start();
  // These boards are for reading the graph, not for running the pulse: a stray
  // beat would allocate strike nodes underneath whatever is being asserted.
  // tests/heartbeat.test.ts drives the scheduler by hand instead.
  engine.stop();
  buildModifiers(engine);
  return { engine, ctx };
}

/** The same board with all nine sources on it as well. */
export function fullBoard(): { engine: Engine; ctx: FakeAudioContext } {
  const { engine, ctx } = chainBoard();
  buildSources(engine);
  return { engine, ctx };
}

/** One box off the board, by id. */
export function box(engine: Engine, id: ModifierId): Modifier {
  const modifier = engine.modifiers[id];
  if (!modifier) throw new Error(`No ${id} on this board.`);
  return modifier;
}

/** One source off the board, by id. */
export function source(engine: Engine, id: SourceId): Outlet {
  const outlet = engine.sources[id];
  if (!outlet) throw new Error(`No ${id} on this board.`);
  return outlet;
}
