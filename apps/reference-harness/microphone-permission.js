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
};
const validEpoch = (epoch) =>
  typeof epoch === 'bigint' && epoch > 0n && epoch <= 0xffffffffffffffffn;
const range = (value, maximum) =>
  Number.isInteger(value) && value >= 20 && value <= maximum;

/** Explicit permission/track owner. Backend owns its bounded graph/grant activation scope. */
export class MicrophonePermission {
  #backend;
  #api;
  #timeout;
  #retirementTimeout;
  #attempt;
  #requestPending;
  #activationPending;
  #retirement;
  #busy = false;
  #closed = false;
  #failed = false;
  #counts = { requests: 0, granted: 0, stopped: 0, faults: 0 };
  constructor(
    backend,
    api = browserApi,
    timeoutMs = 30000,
    retirementMs = 3000,
  ) {
    if (
      !backend ||
      typeof backend.eligible !== 'function' ||
      typeof backend.begin !== 'function' ||
      !api ||
      typeof api.gesture !== 'function' ||
      typeof api.request !== 'function' ||
      !range(timeoutMs, 30000) ||
      !range(retirementMs, 5000)
    )
      throw new Error('Invalid microphone permission owner');
    this.#backend = backend;
    this.#api = api;
    this.#timeout = timeoutMs;
    this.#retirementTimeout = retirementMs;
  }
  get stats() {
    return {
      ...this.#counts,
      closed: this.#closed,
      failed: this.#failed,
      active: Boolean(this.#attempt?.active),
      permissionPending: Boolean(this.#requestPending),
      activationPending: Boolean(this.#activationPending),
      retiring: Boolean(this.#retirement),
    };
  }
  #count(key) {
    this.#counts[key] = Math.min(
      Number.MAX_SAFE_INTEGER,
      this.#counts[key] + 1,
    );
  }
  #fault() {
    if (!this.#failed) this.#count('faults');
    this.#failed = true;
  }
  #tracks(stream) {
    const tracks = stream?.getTracks?.();
    if (!Array.isArray(tracks)) throw new Error('Invalid microphone stream');
    return tracks;
  }
  #stopTracks(tracks) {
    for (const track of tracks) {
      try {
        track.stop();
      } catch {
        this.#fault();
      }
    }
  }
  #finish(attempt, value) {
    clearTimeout(attempt.timer);
    attempt.timer = undefined;
    attempt.resolve(value);
  }
  #retire(attempt) {
    if (!attempt.scope || attempt.retired) return;
    attempt.retired = true;
    let resolve;
    const promise = new Promise((done) => {
      resolve = done;
    });
    const retirement = { promise };
    this.#retirement = retirement; // Reserve before foreign close can reenter.
    let completed = false;
    const finish = (okay) => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      if (!okay) this.#fault();
      if (this.#retirement === retirement) this.#retirement = undefined;
      resolve(okay);
    };
    const timer = setTimeout(() => finish(false), this.#retirementTimeout);
    try {
      Promise.resolve(attempt.scope.close()).then(
        (value) => finish(value === undefined),
        () => finish(false),
      );
    } catch {
      finish(false);
    }
  }
  #cancel(attempt) {
    if (this.#attempt === attempt) this.#attempt = undefined;
    this.#finish(attempt, false);
    if (!attempt.cancelled) {
      attempt.cancelled = true;
      this.#count('stopped');
      for (const remove of attempt.listeners) {
        try {
          remove();
        } catch {
          this.#fault();
        }
      }
      attempt.listeners = [];
      this.#stopTracks(attempt.tracks);
      attempt.tracks = [];
    }
    this.#retire(attempt);
  }
  start(epoch) {
    if (
      this.#closed ||
      this.#failed ||
      this.#busy ||
      this.#attempt ||
      this.#requestPending ||
      this.#activationPending ||
      this.#retirement ||
      !validEpoch(epoch)
    )
      return Promise.resolve(false);
    let resolve;
    const result = new Promise((done) => {
      resolve = done;
    });
    const attempt = {
      epoch,
      resolve,
      tracks: [],
      listeners: [],
      active: false,
      cancelled: false,
      scope: undefined,
      retired: false,
      timer: undefined,
    };
    this.#attempt = attempt;
    this.#busy = true;
    try {
      if (
        this.#api.gesture() !== true ||
        this.#backend.eligible(epoch) !== true ||
        this.#attempt !== attempt ||
        attempt.cancelled
      ) {
        this.#cancel(attempt);
        return result;
      }
      attempt.timer = setTimeout(() => this.#cancel(attempt), this.#timeout);
      const request = {};
      this.#requestPending = request;
      this.#count('requests');
      let permission;
      try {
        permission = this.#api.request();
      } catch {
        this.#requestPending = undefined;
        this.#cancel(attempt);
        return result;
      }
      Promise.resolve(permission).then(
        (stream) => {
          if (this.#requestPending === request)
            this.#requestPending = undefined;
          let tracks;
          try {
            tracks = this.#tracks(stream);
          } catch {
            this.#fault();
            this.#cancel(attempt);
            return;
          }
          if (
            this.#attempt !== attempt ||
            attempt.cancelled ||
            this.#closed ||
            this.#failed
          ) {
            this.#stopTracks(tracks);
            return;
          }
          attempt.tracks = tracks;
          this.#busy = true;
          try {
            if (
              tracks.length !== 1 ||
              tracks[0]?.kind !== 'audio' ||
              tracks[0]?.readyState !== 'live' ||
              typeof tracks[0].stop !== 'function' ||
              typeof tracks[0].addEventListener !== 'function' ||
              typeof tracks[0].removeEventListener !== 'function' ||
              this.#backend.eligible(epoch) !== true ||
              attempt.cancelled
            ) {
              this.#cancel(attempt);
              return;
            }
            const track = tracks[0],
              ended = () => this.#cancel(attempt);
            attempt.listeners.push(() =>
              track.removeEventListener('ended', ended),
            );
            track.addEventListener('ended', ended);
            if (attempt.cancelled || track.readyState !== 'live') {
              this.#cancel(attempt);
              return;
            }
            attempt.scope = this.#backend.begin(stream, epoch);
            if (
              !attempt.scope ||
              typeof attempt.scope.current !== 'function' ||
              typeof attempt.scope.close !== 'function' ||
              !attempt.scope.ready ||
              typeof attempt.scope.ready.then !== 'function'
            )
              throw new Error('Invalid microphone activation');
            const activation = {};
            this.#activationPending = activation;
            Promise.resolve(attempt.scope.ready).then(
              (ready) => {
                if (this.#activationPending === activation)
                  this.#activationPending = undefined;
                if (this.#attempt !== attempt || attempt.cancelled) return;
                try {
                  if (typeof ready !== 'boolean') {
                    this.#fault();
                    this.#cancel(attempt);
                    return;
                  }
                  const current = ready && attempt.scope.current() === true;
                  if (
                    !current ||
                    this.#attempt !== attempt ||
                    attempt.cancelled ||
                    track.readyState !== 'live'
                  ) {
                    this.#cancel(attempt);
                    return;
                  }
                  attempt.active = true;
                  this.#count('granted');
                  this.#finish(attempt, true);
                } catch {
                  this.#fault();
                  this.#cancel(attempt);
                }
              },
              () => {
                if (this.#activationPending === activation)
                  this.#activationPending = undefined;
                this.#cancel(attempt);
              },
            );
            if (attempt.cancelled) this.#retire(attempt);
          } catch {
            this.#fault();
            this.#cancel(attempt);
          } finally {
            this.#busy = false;
          }
        },
        () => {
          if (this.#requestPending === request)
            this.#requestPending = undefined;
          this.#cancel(attempt);
        },
      );
    } catch {
      this.#fault();
      this.#cancel(attempt);
    } finally {
      this.#busy = false;
    }
    return result;
  }
  poll() {
    const attempt = this.#attempt;
    if (!attempt || !attempt.scope) return false;
    try {
      const current = attempt.scope.current() === true;
      if (!current || this.#attempt !== attempt || attempt.cancelled) {
        this.#cancel(attempt);
        return false;
      }
      return attempt.active;
    } catch {
      this.#fault();
      this.#cancel(attempt);
      return false;
    }
  }
  stop() {
    if (this.#attempt) this.#cancel(this.#attempt);
    return this.#retirement?.promise ?? Promise.resolve(!this.#failed);
  }
  close() {
    this.#closed = true;
    return this.stop();
  }
}
