// The eleven sources. Five drones that sustain, six strikes that fire.
//
// Every one of them terminates in the same pair — `loud gain (value × the
// module's own ceiling) → power gain (0/1, smoothed)` — and none of them
// connects that pair to anything. Placing it is the router's job, exactly as it
// is for the modifier boxes.
//
// What each module *is* lives in ./registry; what it *sounds like* lives in
// ./drones and ./strikes. This file is only the loop between them.

import { INTERVALS, SOURCE_IDS } from '../constants';
import type { Engine } from '../engine';
import { SOURCE_SPECS } from './registry';

/**
 * Build all eleven and register them in board order.
 *
 * The outlet is made here rather than by each builder, so the facts that used to
 * be copied into the top of every builder — ceiling, beat offset, the character
 * value the module opens on, and now the interval it sits on — are applied once,
 * from the registry, in the same order every time. A builder receives an outlet
 * that is already itself and adds only synthesis.
 *
 * The interval is resolved from its word to its ratio here, which is the one
 * place that translation happens: the registry names `minorThird`, the outlet
 * carries 1.2, and no builder ever sees either.
 *
 * Each module is then told its own character value, {@link Engine.applyGlobals}
 * hands the whole board the root it opens on, and {@link Engine.route} places
 * every new power node.
 *
 * Call it once, after {@link Engine.start}.
 */
export function buildSources(engine: Engine): void {
  for (const id of SOURCE_IDS) {
    const spec = SOURCE_SPECS[id];
    const outlet = engine.makeOutlet(id, spec.maxGain, INTERVALS[spec.interval]);
    if (spec.type === 'strike') outlet.phase = spec.phase;
    if (spec.initialChar !== undefined) outlet.charV = spec.initialChar;

    spec.build(engine, outlet);
    outlet.setChar?.(outlet.charV);
  }
  engine.applyGlobals();
  engine.route();
}

export { SOURCE_SPECS, type SourceBuild, type SourceSpec } from './registry';
