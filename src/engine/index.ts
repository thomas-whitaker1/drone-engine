import { Engine, type EngineOptions } from './engine';

export { bpmFor, Engine } from './engine';
export { buildModifiers } from './modifiers';
export { Heartbeat } from './scheduler';
export { buildSources } from './sources';
export type {
  EngineControls,
  EngineOptions,
  Globals,
  Levels,
  Modifier,
  Outlet,
  Wire,
} from './engine';

/** Build an engine. Nothing is audible until {@link Engine.start} is called. */
export function createEngine(opts: EngineOptions = {}): Engine {
  return new Engine(opts);
}
