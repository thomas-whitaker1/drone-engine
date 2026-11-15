// A recording stand-in for the Web Audio nodes the engine's spine builds, so the
// graph can be asserted under the `node` test environment. It records connections
// and parameter writes; it does not synthesise anything and makes no claim about
// audio maths. Real-context behaviour belongs in the offline-render harness.

/** One scheduled write, in the order it was asked for. */
export interface Automation {
  call: 'set' | 'linear' | 'exponential';
  value: number;
  time: number;
}

export class FakeParam {
  value: number;
  readonly ramps: Array<{ value: number; time: number; constant: number }> = [];
  /**
   * The strikes are nothing but scheduled writes against the audio clock, so the
   * envelope a trigger asked for is only readable here. `value` deliberately does
   * not follow these: a scheduled write says nothing about the value now.
   */
  readonly automation: Automation[] = [];

  constructor(value = 0) {
    this.value = value;
  }

  setTargetAtTime(value: number, time: number, constant: number): this {
    this.ramps.push({ value, time, constant });
    this.value = value;
    return this;
  }

  setValueAtTime(value: number, time: number): this {
    this.automation.push({ call: 'set', value, time });
    return this;
  }

  linearRampToValueAtTime(value: number, time: number): this {
    this.automation.push({ call: 'linear', value, time });
    return this;
  }

  exponentialRampToValueAtTime(value: number, time: number): this {
    this.automation.push({ call: 'exponential', value, time });
    return this;
  }
}

export class FakeAudioNode {
  readonly connections: Array<FakeAudioNode | FakeParam> = [];
  onended: (() => void) | null = null;

  constructor(readonly kind: string) {}

  connect<T extends FakeAudioNode | FakeParam>(target: T): T {
    this.connections.push(target);
    return target;
  }

  disconnect(): void {
    this.connections.length = 0;
  }

  /** Everything this node feeds, ignoring parameter connections. */
  get nodes(): FakeAudioNode[] {
    return this.connections.filter((target): target is FakeAudioNode => target instanceof FakeAudioNode);
  }
}

export class FakeGainNode extends FakeAudioNode {
  readonly gain = new FakeParam(1);

  constructor() {
    super('gain');
  }
}

export class FakeWaveShaperNode extends FakeAudioNode {
  curve: Float32Array | null = null;
  oversample = 'none';

  constructor() {
    super('waveshaper');
  }
}

export class FakeCompressorNode extends FakeAudioNode {
  readonly threshold = new FakeParam(-24);
  readonly ratio = new FakeParam(12);
  readonly knee = new FakeParam(30);
  readonly attack = new FakeParam(0.003);
  readonly release = new FakeParam(0.25);

  constructor() {
    super('compressor');
  }
}

export class FakeAnalyserNode extends FakeAudioNode {
  fftSize = 2048;
  smoothingTimeConstant = 0.8;
  /** What the next read returns. Silence — every byte at 128 — until set. */
  timeDomain: Uint8Array | null = null;

  constructor() {
    super('analyser');
  }

  getByteTimeDomainData(target: Uint8Array): void {
    for (let i = 0; i < target.length; i++) target[i] = this.timeDomain?.[i] ?? 128;
  }
}

export class FakeBiquadNode extends FakeAudioNode {
  type = 'lowpass';
  readonly frequency = new FakeParam(350);
  readonly Q = new FakeParam(1);
  /** Only a peaking filter reads this — the cymbal's lift, and nothing else. */
  readonly gain = new FakeParam(0);

  constructor() {
    super('biquad');
  }
}

export class FakeDelayNode extends FakeAudioNode {
  readonly delayTime = new FakeParam(0);

  constructor(readonly maxDelayTime: number) {
    super('delay');
  }
}

/** The one stereo placement on the board — OFFSET's three taps, and nothing else. */
export class FakePannerNode extends FakeAudioNode {
  readonly pan = new FakeParam(0);

  constructor() {
    super('panner');
  }
}

export class FakeConvolverNode extends FakeAudioNode {
  buffer: FakeAudioBuffer | null = null;

  constructor() {
    super('convolver');
  }
}

export class FakeOscillatorNode extends FakeAudioNode {
  type = 'sine';
  readonly frequency = new FakeParam(440);
  readonly detune = new FakeParam(0);
  readonly life: Array<{ call: 'start' | 'stop'; at: number | undefined }> = [];

  constructor() {
    super('oscillator');
  }

  start(at?: number): void {
    this.life.push({ call: 'start', at });
  }

  stop(at?: number): void {
    this.life.push({ call: 'stop', at });
  }
}

export class FakeBufferSourceNode extends FakeAudioNode {
  buffer: FakeAudioBuffer | null = null;
  loop = false;
  /** `offset` is where in the buffer the read begins — how a burst avoids being the same click twice. */
  readonly life: Array<{ call: 'start' | 'stop'; at: number | undefined; offset?: number }> = [];

  constructor() {
    super('buffersource');
  }

  start(at?: number, offset?: number): void {
    this.life.push(offset === undefined ? { call: 'start', at } : { call: 'start', at, offset });
  }

  stop(at?: number): void {
    this.life.push({ call: 'stop', at });
  }
}

export class FakeAudioBuffer {
  private readonly channels: Float32Array[];

  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }

  get duration(): number {
    return this.length / this.sampleRate;
  }

  getChannelData(channel: number): Float32Array {
    const data = this.channels[channel];
    if (!data) throw new RangeError(`No channel ${channel} on this buffer.`);
    return data;
  }
}

export class FakeAudioContext {
  currentTime = 0;
  /** A browser may hand back a suspended context; the heartbeat wakes it. */
  state: 'suspended' | 'running' | 'closed' = 'running';
  /** How many times the heartbeat has asked for it back. */
  resumed = 0;
  readonly destination = new FakeAudioNode('destination');
  /** Every node this context has made, in creation order. */
  readonly created: FakeAudioNode[] = [];

  constructor(readonly sampleRate = 44100) {}

  resume(): Promise<void> {
    this.resumed++;
    this.state = 'running';
    return Promise.resolve();
  }

  /** Nodes an engine keeps to itself — an LFO, say — are still findable here. */
  private track<T extends FakeAudioNode>(node: T): T {
    this.created.push(node);
    return node;
  }

  createGain(): FakeGainNode {
    return this.track(new FakeGainNode());
  }

  createWaveShaper(): FakeWaveShaperNode {
    return this.track(new FakeWaveShaperNode());
  }

  createDynamicsCompressor(): FakeCompressorNode {
    return this.track(new FakeCompressorNode());
  }

  createAnalyser(): FakeAnalyserNode {
    return this.track(new FakeAnalyserNode());
  }

  createBiquadFilter(): FakeBiquadNode {
    return this.track(new FakeBiquadNode());
  }

  createDelay(maxDelayTime: number): FakeDelayNode {
    return this.track(new FakeDelayNode(maxDelayTime));
  }

  createConvolver(): FakeConvolverNode {
    return this.track(new FakeConvolverNode());
  }

  createStereoPanner(): FakePannerNode {
    return this.track(new FakePannerNode());
  }

  createOscillator(): FakeOscillatorNode {
    return this.track(new FakeOscillatorNode());
  }

  createBufferSource(): FakeBufferSourceNode {
    return this.track(new FakeBufferSourceNode());
  }

  createBuffer(channels: number, length: number, sampleRate: number): FakeAudioBuffer {
    return new FakeAudioBuffer(channels, length, sampleRate);
  }
}

/**
 * Retire every one-shot this context has handed out, as a browser does when a
 * scheduled node reaches its stop time. Nothing here runs a clock, so `onended`
 * would otherwise never fire and the engine's live-voice count would only ever
 * climb — which is invisible until a suite fires enough hits to reach
 * `VOICE_CAP` and starts silently losing them.
 *
 * Each callback is cleared as it is called, so a node retires exactly once.
 */
export function retireVoices(ctx: FakeAudioContext): void {
  for (const node of ctx.created) {
    const ended = node.onended;
    if (!ended) continue;
    node.onended = null;
    ended();
  }
}

/** Hand the fake to the engine, which only ever sees the Web Audio shape. */
export function asAudioContext(fake: FakeAudioContext): BaseAudioContext {
  return fake as unknown as BaseAudioContext;
}

/** Read a node the engine handed back as the fake it really is. */
export function asFake(node: AudioNode): FakeAudioNode {
  return node as unknown as FakeAudioNode;
}

/** The smoothed writes recorded against a parameter, in order. */
export function ramps(param: AudioParam | FakeParam): FakeParam['ramps'] {
  return (param as unknown as FakeParam).ramps;
}

/** The scheduled writes recorded against a parameter, in order. */
export function automation(param: AudioParam | FakeParam): FakeParam['automation'] {
  return (param as unknown as FakeParam).automation;
}

/** Every node reachable downstream of `from`, including itself. */
export function reachable(from: FakeAudioNode): Set<FakeAudioNode> {
  const seen = new Set<FakeAudioNode>();
  const queue = [from];
  while (queue.length) {
    const node = queue.pop();
    if (!node || seen.has(node)) continue;
    seen.add(node);
    queue.push(...node.nodes);
  }
  return seen;
}

/** The single node of `kind` downstream of `from`. Throws unless there is exactly one. */
export function findNode(from: FakeAudioNode, kind: string): FakeAudioNode {
  const found = [...reachable(from)].filter((node) => node.kind === kind);
  if (found.length !== 1) throw new Error(`Expected one ${kind} downstream, found ${found.length}.`);
  return found[0] as FakeAudioNode;
}
