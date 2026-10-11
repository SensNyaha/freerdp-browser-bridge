const exact = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
const workletUrl = new URL('./microphone-worklet.js', import.meta.url).href;

/** Permission activation scope. Caller prepares/resumes context in the explicit gesture. */
export class MicrophoneGraph {
  #context;
  #stream;
  #sender;
  #epoch;
  #token;
  #backend;
  #nodeFactory;
  #node;
  #source;
  #closed = false;
  #failed = false;
  #cleanupFailed = false;
  #readyResolve;
  #portResolve;
  #portReady = false;
  #lastId = 0;
  #lastPacket;
  #observed;
  #timer;
  #closePromise;
  #initialization;
  #retirementMs;
  #stateListener;
  #errorListener;
  #now;
  constructor(context, stream, epoch, token, sender, backend, options = {}) {
    if (
      !context ||
      context.sampleRate !== 48000 ||
      typeof context.close !== 'function' ||
      typeof context.addEventListener !== 'function' ||
      typeof context.removeEventListener !== 'function' ||
      typeof context.createMediaStreamSource !== 'function' ||
      typeof context.audioWorklet?.addModule !== 'function' ||
      !stream ||
      typeof epoch !== 'bigint' ||
      epoch < 1n ||
      epoch > 0xffffffffffffffffn ||
      typeof token !== 'symbol' ||
      !sender ||
      typeof sender.offer !== 'function' ||
      typeof sender.poll !== 'function' ||
      typeof sender.revoke !== 'function' ||
      !backend ||
      typeof backend.authorized !== 'function' ||
      typeof backend.retire !== 'function' ||
      typeof backend.failed !== 'function'
    )
      throw new Error('Invalid microphone graph');
    const retirementMs = options.retirementMs ?? 4000;
    if (
      !Number.isInteger(retirementMs) ||
      retirementMs < 20 ||
      retirementMs > 5000 ||
      (options.now !== undefined && typeof options.now !== 'function') ||
      (options.createNode !== undefined &&
        typeof options.createNode !== 'function')
    )
      throw new Error('Invalid microphone graph');
    this.#context = context;
    this.#stream = stream;
    this.#epoch = epoch;
    this.#token = token;
    this.#sender = sender;
    this.#backend = backend;
    this.#retirementMs = retirementMs;
    this.#now = options.now ?? (() => performance.now());
    this.#nodeFactory =
      options.createNode ??
      ((value, name, parameters) =>
        new AudioWorkletNode(value, name, parameters));
    this.ready = new Promise((resolve) => {
      this.#readyResolve = resolve;
    });
    this.#stateListener = () => {
      if (!this.#closed && this.#context.state !== 'running') this.#fault();
    };
    this.#errorListener = () => this.#fault();
    try {
      this.#context.addEventListener('statechange', this.#stateListener);
      this.#timer = setInterval(() => this.poll(), 20);
      this.#initialization = this.#initialize().catch(() => {
        this.#fault();
      });
    } catch {
      this.#fault();
    }
  }
  get stats() {
    return {
      closed: this.#closed,
      failed: this.#failed,
      ready: this.#portReady && !this.#closed,
      lastPacketId: this.#lastId,
    };
  }
  #clock() {
    const now = this.#now();
    if (
      !Number.isFinite(now) ||
      now < 0 ||
      now > Number.MAX_SAFE_INTEGER - 2000 ||
      (this.#observed !== undefined && now < this.#observed)
    )
      throw new Error('Invalid microphone graph clock');
    this.#observed = now;
    return now;
  }
  current() {
    if (this.#closed) return false;
    try {
      return (
        this.#context.state === 'running' &&
        this.#backend.authorized(this.#token, this.#epoch) === true
      );
    } catch {
      this.#fault();
      return false;
    }
  }
  #fault() {
    if (this.#closed) return;
    this.#failed = true;
    // Revoke and local cleanup precede host notification, which must stop its owned tracks.
    void this.close().catch(() => {});
    try {
      this.#backend.failed();
    } catch {
      /* The permission owner independently retains track ownership. */
    }
  }
  async #initialize() {
    this.#lastPacket = this.#clock();
    if (!this.current()) {
      this.#fault();
      return;
    }
    await this.#context.audioWorklet.addModule(workletUrl);
    if (this.#closed || !this.current()) {
      this.#fault();
      return;
    }
    const portReady = new Promise((resolve) => {
      this.#portResolve = resolve;
    });
    this.#node = this.#nodeFactory(this.#context, 'bridge-microphone-s16le', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { epoch: this.#epoch },
    });
    if (this.#closed) {
      try {
        this.#node.disconnect();
        this.#node.port.close();
      } catch {
        this.#cleanupFailed = true;
      }
      return;
    }
    this.#node.addEventListener('processorerror', this.#errorListener);
    this.#node.port.onmessage = ({ data }) => this.#message(data);
    this.#node.connect(this.#context.destination);
    this.#lastPacket = this.#clock();
    const accepted = await portReady;
    if (this.#closed || !accepted || !this.current()) {
      this.#fault();
      return;
    }
    this.#source = this.#context.createMediaStreamSource(this.#stream);
    if (this.#closed) {
      try {
        this.#source.disconnect();
      } catch {
        this.#cleanupFailed = true;
      }
      return;
    }
    this.#source.connect(this.#node);
    if (!this.current()) {
      this.#fault();
      return;
    }
    this.#readyResolve(true);
  }
  #message(data) {
    if (this.#closed) return;
    const owned =
      data?.pcm instanceof ArrayBuffer && data.pcm.byteLength === 3840
        ? new Uint8Array(data.pcm)
        : undefined;
    try {
      if (data?.type === 'ready') {
        if (
          !exact(data, ['type', 'accepted']) ||
          this.#portReady ||
          data.accepted !== true ||
          !this.#portResolve
        )
          throw new Error('Invalid microphone port');
        this.#portReady = true;
        this.#portResolve(true);
        this.#portResolve = undefined;
        return;
      }
      if (
        !this.#portReady ||
        !exact(data, ['type', 'id', 'epoch', 'timestampUs', 'pcm']) ||
        data.type !== 'packet' ||
        !Number.isInteger(data.id) ||
        data.id !== this.#lastId + 1 ||
        data.id > 0xffffffff ||
        data.epoch !== this.#epoch ||
        typeof data.timestampUs !== 'bigint' ||
        data.timestampUs < 0n ||
        data.timestampUs > 0xffffffffffffffffn - 20000n ||
        !(data.pcm instanceof ArrayBuffer) ||
        data.pcm.byteLength !== 3840 ||
        !this.current()
      )
        throw new Error('Invalid microphone port');
      const now = this.#clock();
      this.#lastId = data.id;
      this.#lastPacket = now;
      const pcm = new Uint8Array(data.pcm);
      try {
        this.#sender.offer(
          this.#token,
          { epoch: data.epoch, timestampUs: data.timestampUs, pcm },
          now,
        );
      } finally {
        pcm.fill(0);
      }
      if (this.#closed || this.#sender.stats.closed || !this.current()) {
        this.#fault();
        return;
      }
      this.#node.port.postMessage({ type: 'ack', id: data.id });
    } catch {
      this.#fault();
    } finally {
      owned?.fill(0);
    }
  }
  poll() {
    if (this.#closed) return false;
    try {
      const now = this.#clock();
      if (
        !this.current() ||
        (this.#lastPacket !== undefined && now >= this.#lastPacket + 2000)
      ) {
        this.#fault();
        return false;
      }
      this.#sender.poll(now);
      if (this.#sender.stats.closed) {
        this.#fault();
        return false;
      }
      return !this.#closed;
    } catch {
      this.#fault();
      return false;
    }
  }
  close() {
    if (this.#closePromise) return this.#closePromise;
    this.#closed = true;
    clearInterval(this.#timer);
    this.#readyResolve(false);
    this.#portResolve?.(false);
    this.#portResolve = undefined;
    let resolve, reject;
    this.#closePromise = new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
    // Attach a rejection observer before foreign cleanup callbacks can reenter.
    void this.#closePromise.catch(() => {});
    const local = (callback) => {
      try {
        callback();
      } catch {
        this.#cleanupFailed = true;
      }
    };
    local(() =>
      this.#context.removeEventListener('statechange', this.#stateListener),
    );
    local(() => this.#sender.revoke(this.#token));
    if (this.#node) {
      local(() =>
        this.#node.removeEventListener('processorerror', this.#errorListener),
      );
      local(() => {
        this.#node.port.onmessage = null;
      });
      local(() => this.#node.port.postMessage({ type: 'dispose', id: 1 }));
      local(() => this.#node.disconnect());
      local(() => this.#node.port.close());
    }
    if (this.#source) local(() => this.#source.disconnect());
    let complete = false;
    const finish = (okay) => {
      if (complete) return;
      complete = true;
      clearTimeout(timer);
      if (okay && !this.#cleanupFailed) resolve();
      else {
        this.#failed = true;
        reject(new Error('Microphone graph cleanup failed'));
      }
    };
    const timer = setTimeout(() => finish(false), this.#retirementMs);
    const call = (callback) => {
      try {
        return Promise.resolve(callback());
      } catch {
        return Promise.reject(new Error('Microphone graph cleanup failed'));
      }
    };
    Promise.all([
      call(() => this.#context.close()),
      call(() => this.#backend.retire()),
      Promise.resolve(this.#initialization),
    ]).then(
      (values) => finish(values.every((value) => value === undefined)),
      () => finish(false),
    );
    return this.#closePromise;
  }
}
