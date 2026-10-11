import { MicrophonePermission } from './microphone-permission.js';
import { MicrophoneGraph } from './microphone-graph.js';
const browserApi = {
  gesture: () => navigator.userActivation?.isActive === true,
  request: () =>
    navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: { ideal: 2 },
        sampleRate: { ideal: 48000 },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    }),
  context: () => new AudioContext({ sampleRate: 48000 }),
  graph: (...args) => new MicrophoneGraph(...args),
};
const invalid = () => new Error('Microphone startup cleanup failed');

/** Complete local startup/permission/graph owner; caller owns the negotiated media client/socket. */
export class MicrophoneOwner {
  #client;
  #backend;
  #api;
  #permission;
  #prepared;
  #closed = false;
  #failed = false;
  #busy = false;
  #notifying = false;
  #retirementMs;
  constructor(client, backend, api = browserApi, deadlines = {}) {
    const permissionMs = deadlines.permissionMs ?? 30000;
    const retirementMs = deadlines.retirementMs ?? 4500;
    if (
      !Number.isInteger(permissionMs) ||
      permissionMs < 20 ||
      permissionMs > 30000 ||
      !Number.isInteger(retirementMs) ||
      retirementMs < 20 ||
      retirementMs > 4500
    )
      throw invalid();
    if (
      !client ||
      typeof client.start !== 'function' ||
      typeof client.stop !== 'function' ||
      typeof client.authorize !== 'function' ||
      typeof client.authorized !== 'function' ||
      !backend ||
      typeof backend.controller !== 'function' ||
      typeof backend.changed !== 'function' ||
      typeof backend.failed !== 'function' ||
      !api ||
      ['gesture', 'request', 'context', 'graph'].some(
        (key) => typeof api[key] !== 'function',
      )
    )
      throw invalid();
    this.#client = client;
    this.#backend = backend;
    this.#api = api;
    this.#retirementMs = retirementMs;
    this.#permission = new MicrophonePermission(
      {
        eligible: (epoch) => this.#eligible(epoch),
        begin: (stream, epoch) => this.#begin(stream, epoch),
      },
      {
        gesture: () => this.#api.gesture(),
        request: () => this.#api.request(),
      },
      permissionMs,
      retirementMs + 500,
    );
  }
  get stats() {
    return {
      ...this.#permission.stats,
      closed: this.#closed,
      failed: this.#failed || this.#permission.stats.failed,
      preparing: Boolean(this.#prepared),
      graphReady: this.#prepared?.graph?.stats.ready === true,
    };
  }
  #notify() {
    if (this.#notifying) return;
    this.#notifying = true;
    try {
      this.#backend.changed();
    } catch {
      this.#fault();
    } finally {
      this.#notifying = false;
    }
  }
  #eligible(epoch) {
    const source = this.#client.source;
    return (
      !this.#closed &&
      !this.#failed &&
      !this.#client.stats.closed &&
      this.#backend.controller() === true &&
      !source?.retiring &&
      source?.source?.availability === 'ready' &&
      source.source.epoch === epoch
    );
  }
  #fault() {
    if (this.#failed) return;
    this.#failed = true;
    void this.stop().catch(() => {});
    try {
      this.#backend.failed();
    } catch {
      /* Local cleanup remains owned. */
    }
  }
  #begin(stream, epoch) {
    const prepared = this.#prepared;
    if (!prepared || prepared.closed || prepared.epoch !== epoch)
      throw invalid();
    const activation = (async () => {
      if (
        !(await prepared.resumed) ||
        prepared.closed ||
        !this.#eligible(epoch)
      )
        return false;
      prepared.requested = true;
      if (
        !(await this.#client.start(epoch)) ||
        prepared.closed ||
        !this.#eligible(epoch)
      )
        return false;
      prepared.token = this.#client.authorize(epoch);
      if (!prepared.token) return false;
      prepared.graph = this.#api.graph(
        prepared.context,
        stream,
        epoch,
        prepared.token,
        this.#client.sender,
        {
          authorized: (token, current) =>
            !prepared.closed &&
            this.#eligible(current) &&
            this.#client.authorized(token, current),
          retire: () => this.#client.stop(),
          failed: () => this.#fault(),
        },
        { retirementMs: this.#retirementMs },
      );
      if (prepared.closed) {
        await prepared.graph.close();
        return false;
      }
      return prepared.graph.ready;
    })();
    prepared.activation = activation;
    return {
      ready: activation,
      current: () =>
        !prepared.closed &&
        this.#eligible(epoch) &&
        (!prepared.token || this.#client.authorized(prepared.token, epoch)),
      close: () => this.#dispose(prepared),
    };
  }
  #dispose(prepared) {
    if (prepared.closing) return prepared.closing;
    prepared.closed = true;
    clearInterval(prepared.timer);
    let resolve, reject;
    prepared.closing = new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
    void prepared.closing.catch(() => {});
    let finished = false;
    const complete = (okay) => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      if (this.#prepared === prepared) this.#prepared = undefined;
      if (okay) resolve();
      else {
        this.#fault();
        reject(invalid());
      }
      this.#notify();
    };
    const deadline = setTimeout(() => complete(false), this.#retirementMs);
    const cleanup = (async () => {
      await prepared.built;
      if (prepared.context && prepared.listener)
        prepared.context.removeEventListener('statechange', prepared.listener);
      await Promise.all([
        prepared.graph ? prepared.graph.close() : prepared.context?.close(),
        prepared.requested ? this.#client.stop() : undefined,
        prepared.activation,
        prepared.resumed,
      ]);
    })();
    cleanup.then(
      () => complete(true),
      () => complete(false),
    );
    return prepared.closing;
  }
  start() {
    const status = this.#permission.stats;
    if (
      this.#closed ||
      this.#failed ||
      this.#busy ||
      this.#prepared ||
      status.failed ||
      status.permissionPending ||
      status.activationPending ||
      status.retiring
    )
      return Promise.resolve(false);
    this.#busy = true;
    let prepared;
    try {
      const source = this.#client.source,
        epoch = source?.source?.epoch;
      if (
        source?.granted ||
        this.#api.gesture() !== true ||
        !this.#eligible(epoch)
      )
        return Promise.resolve(false);
      let built;
      prepared = {
        epoch,
        closed: false,
        requested: false,
        graph: undefined,
        token: undefined,
        context: undefined,
        activation: undefined,
        resumed: undefined,
        closing: undefined,
        timer: undefined,
        listener: undefined,
        built: new Promise((done) => {
          built = done;
        }),
      };
      this.#prepared = prepared;
      try {
        prepared.context = this.#api.context();
        if (
          !prepared.context ||
          prepared.context.sampleRate !== 48000 ||
          typeof prepared.context.resume !== 'function' ||
          typeof prepared.context.close !== 'function' ||
          typeof prepared.context.addEventListener !== 'function' ||
          typeof prepared.context.removeEventListener !== 'function'
        )
          throw invalid();
        if (prepared.closed) {
          built();
          return this.#dispose(prepared).then(
            () => false,
            () => false,
          );
        }
        let ran = prepared.context.state === 'running';
        prepared.listener = () => {
          if (prepared.context.state === 'running') ran = true;
          else if (ran && !prepared.closed) this.#fault();
        };
        prepared.context.addEventListener('statechange', prepared.listener);
        prepared.resumed = Promise.resolve(prepared.context.resume()).then(
          () => prepared.context.state === 'running',
          () => {
            this.#fault();
            return false;
          },
        );
        prepared.timer = setInterval(() => this.changed(), 20);
      } finally {
        built();
      }
      const pending = this.#permission.start(epoch);
      this.#notify();
      return pending.then(async (accepted) => {
        if (!accepted || prepared.closed || this.#prepared !== prepared) {
          try {
            await this.#dispose(prepared);
          } catch {
            this.#fault();
          }
          return false;
        }
        this.#notify();
        return true;
      });
    } catch {
      this.#fault();
      return prepared
        ? this.#dispose(prepared).then(
            () => false,
            () => false,
          )
        : Promise.resolve(false);
    } finally {
      this.#busy = false;
    }
  }
  changed() {
    const prepared = this.#prepared;
    if (!prepared || prepared.closed) return;
    try {
      if (!this.#eligible(prepared.epoch)) {
        void this.stop().catch(() => {});
        return;
      }
      this.#permission.poll();
    } catch {
      this.#fault();
    }
    this.#notify();
  }
  async stop() {
    const prepared = this.#prepared;
    const stopped = this.#permission.stop(); // Tracks stop before asynchronous graph/server cleanup.
    const disposed = prepared ? this.#dispose(prepared) : Promise.resolve();
    const result = await stopped;
    await disposed;
    if (result !== true) {
      this.#fault();
      throw invalid();
    }
    if (prepared) this.#notify();
  }
  close() {
    this.#closed = true;
    return this.stop();
  }
}
